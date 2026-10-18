"""Generate offline British neural speech. Isolated IPA retains the explicit phoneme engine.
Run through bash build.sh natural; no model or runtime is shipped to the browser.
"""
import argparse
import hashlib
import json
import subprocess
import wave
from pathlib import Path
import numpy as np
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / '.audio-neural'
OUT = ROOT / 'dist/assets/audio'
parser = argparse.ArgumentParser()
parser.add_argument('--probe', action='store_true')
args = parser.parse_args()
model = Kokoro(str(CACHE / 'kokoro-v1.0.onnx'), str(CACHE / 'voices-v1.0.bin'))
print('MODEL_OUTPUTS', [output.name for output in model.sess.get_outputs()], flush=True)
if args.probe:
    import soundfile as sf
    folder = ROOT / 'qa/audio-quality'
    folder.mkdir(parents=True, exist_ok=True)
    for text, name in [('dog', 'dog-neural'), ('This is a big dog.', 'sentence-neural')]:
        audio, rate, timings = model.create_timed(text, voice='bf_emma', lang='en-gb', speed=.9)
        sf.write(folder / (name + '.wav'), audio, rate)
        print(name, len(audio) / rate, timings, flush=True)
    raise SystemExit

rate = 22050
stage = CACHE / 'generated'
base = json.loads((OUT / 'manifest.json').read_text())
curriculum = json.loads((OUT / 'curriculum-manifest.json').read_text())
data = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {LETTERS} from './dist/phonemes.js';import {LESSONS} from './dist/curriculum.js';console.log(JSON.stringify({letters:LETTERS,lessons:LESSONS}));"], cwd=ROOT))
engine = 'Kokoro v1.0 / kokoro-onnx 0.6.1'

def synth(text, voice, phonemes=False):
    audio, sample_rate, timings = model.create_timed(text, voice=voice, lang='en-gb', speed=.9, is_phonemes=phonemes)
    assert np.isfinite(audio).all() and np.max(np.abs(audio)) > .01, text
    peak = np.max(np.abs(audio))
    if peak > .95:
        audio = audio * (.95 / peak)
    pcm = subprocess.check_output(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(sample_rate),
        '-ac', '1', '-i', 'pipe:0', '-f', 's16le', '-ar', str(rate), 'pipe:1'], input=audio.astype('<f4').tobytes())
    samples = np.frombuffer(pcm, dtype='<i2').copy()
    return np.concatenate([np.zeros(round(rate * .12), dtype='<i2'), samples, np.zeros(round(rate * .16), dtype='<i2')]), timings

def write(voice, key, samples, metadata):
    folder = stage / voice
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / (key + '.wav')
    with wave.open(str(path), 'wb') as wav:
        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(rate); wav.writeframes(samples.tobytes())
    return {**metadata, 'duration':len(samples) / rate, 'sha256':hashlib.sha256(path.read_bytes()).hexdigest(), 'engine':engine, 'synthesisSpeed':.9}

for voice, neural_voice in [('female', 'bf_emma'), ('male', 'bm_george')]:
    entries = base['voices'][voice]['entries']
    letter_audio = {}
    for letter, definition in data['letters'].items():
        # IPA keeps British R /ɑː/, Z /zed/ and W /dʌbəljuː/ independent of text spelling.
        ipa = definition['ipa'].replace('r', 'ɹ').replace('g', 'ɡ')
        assert model.tokenizer.known(ipa) == ipa, f'Unsupported letter IPA: {ipa}'
        samples, _ = synth(ipa, neural_voice, phonemes=True)
        key = 'letter-' + letter
        entries[key] = write(voice, key, samples, {'ipa':definition['ipa'], 'phonemes':definition['sequence'], 'synthesisInput':ipa, 'engineVoice':neural_voice})
        letter_audio[letter] = samples
    alphabet, segments, cursor = [], [], 0
    for letter, samples in letter_audio.items():
        segments.append({'letter':letter, 'start':cursor / rate, 'end':(cursor + len(samples)) / rate})
        gap = np.zeros(round(rate * .2), dtype='<i2')
        alphabet.extend([samples, gap]); cursor += len(samples) + len(gap)
    entries['alphabet'] = write(voice, 'alphabet', np.concatenate(alphabet), {'segments':segments, 'engineVoice':neural_voice})
    for lesson in data['lessons'].values():
        if lesson['stage'] == 'sound':
            continue
        key = 'lesson-' + lesson['id']
        samples, timings = synth(lesson['audioText'], neural_voice)
        groups = [[]]
        for token in timings:
            if token.phoneme.isspace():
                if groups[-1]:
                    groups.append([])
            elif token.phoneme not in '.,!?;:':
                groups[-1].append(token)
        groups = [group for group in groups if group]
        assert len(groups) == len(lesson['words']), (lesson['id'], groups)
        words, clips = [], []
        for index, (word, group) in enumerate(zip(lesson['words'], groups)):
            start = .12 + group[0].start
            end = .12 + (groups[index + 1][0].start if index + 1 < len(groups) else group[-1].end)
            assert 0 <= start < end <= len(samples) / rate
            words.append({'text':word['text'], 'start':start, 'end':end})
            reference = [clip for clip in lesson['segments'] if clip['wordIndex'] == index]
            before, after = reference[0]['start'], reference[-1]['end']
            # shortcut: within-word poses are proportional; use measured phoneme alignment for exact lip sync.
            for clip in reference:
                clips.append({**clip,
                    'start':start + (clip['start'] - before) / (after - before) * (end - start),
                    'end':start + (clip['end'] - before) / (after - before) * (end - start)})
        metadata = {'text':lesson['text'], 'words':words, 'clips':clips,
            'engineVoice':neural_voice, 'timingMethod':'model word durations; proportional phonemes within words'}
        curriculum['voices'][voice]['entries'][key] = write(voice, key, samples, metadata)
    base['voices'][voice]['naturalVoice'] = neural_voice
    curriculum['voices'][voice]['naturalVoice'] = neural_voice
    print(voice, len(data['letters']) + 1 + sum(lesson['stage'] != 'sound' for lesson in data['lessons'].values()), 'natural speech recordings generated', flush=True)

base['engine'] = curriculum['engine'] = 'Kokoro neural speech for letters and connected text; eSpeak NG for isolated IPA'
curriculum['notice'] = 'Neural speech; word timing uses model durations; within-word poses are proportional teaching guides, not forced alignment.'
base['notice'] = 'Neural British letter names; isolated phonemes retain explicit eSpeak inputs. Synthetic, not human recordings.'
# Verify the complete staged output before replacing any served file.
expected = 2 * (len(data['letters']) + 1 + sum(lesson['stage'] != 'sound' for lesson in data['lessons'].values()))
assert len(list(stage.glob('*/*.wav'))) == expected
for path in stage.glob('*/*.wav'):
    with wave.open(str(path), 'rb') as wav:
        assert wav.getframerate() == rate and wav.getnframes() > rate * .2
for path in stage.glob('*/*.wav'):
    destination = OUT / path.parent.name / path.name
    temporary = destination.with_suffix('.tmp')
    temporary.write_bytes(path.read_bytes()); temporary.replace(destination)
for name, manifest in [('manifest.json', base), ('curriculum-manifest.json', curriculum)]:
    temporary = OUT / (name + '.tmp')
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(OUT / name)
print('NATURAL_AUDIO_COMPLETE', expected, flush=True)
