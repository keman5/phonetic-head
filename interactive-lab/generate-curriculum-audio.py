"""Build continuous local English lessons; retain eSpeak word-event timing.

Run with .audio-venv/bin/python generate-curriculum-audio.py.
Phonemes inside each word use teaching proportions, not forced alignment.
"""
import array
import ctypes as C
import hashlib
import json
from pathlib import Path
import subprocess
import wave
import espeakng_loader

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'dist/assets/audio'
data = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {LESSONS} from './dist/curriculum.js'; import {PHONEMES} from './dist/phonemes.js'; console.log(JSON.stringify({lessons:LESSONS,phonemes:PHONEMES}));"], cwd=ROOT))
base = json.loads((OUT / 'manifest.json').read_text())

class EventID(C.Union):
    _fields_ = [('number', C.c_int), ('name', C.c_char_p), ('string', C.c_char * 8)]

class Event(C.Structure):
    _fields_ = [('type', C.c_int), ('unique_identifier', C.c_uint),
                ('text_position', C.c_int), ('length', C.c_int),
                ('audio_position', C.c_int), ('sample', C.c_int),
                ('user_data', C.c_void_p), ('id', EventID)]

lib = C.CDLL(espeakng_loader.get_library_path())
lib.espeak_Initialize.argtypes = [C.c_int, C.c_int, C.c_char_p, C.c_int]
lib.espeak_SetVoiceByName.argtypes = [C.c_char_p]
lib.espeak_SetParameter.argtypes = [C.c_int, C.c_int, C.c_int]
lib.espeak_Synth.argtypes = [C.c_void_p, C.c_size_t, C.c_uint, C.c_int,
                           C.c_uint, C.c_uint, C.POINTER(C.c_uint), C.c_void_p]
rate = lib.espeak_Initialize(2, 0, str(Path(espeakng_loader.get_data_path()).parent).encode(), 0)
assert rate > 0
chunks, starts = [], []
CALLBACK = C.CFUNCTYPE(C.c_int, C.POINTER(C.c_short), C.c_int, C.POINTER(Event))

@CALLBACK
def receive(samples, count, events):
    if samples and count:
        chunks.append(C.string_at(samples, count * 2))
    i = 0
    while events and events[i].type:
        if events[i].type == 1:
            starts.append(events[i].audio_position / 1000)
        i += 1
    return 0

lib.espeak_SetSynthCallback.argtypes = [CALLBACK]
lib.espeak_SetSynthCallback(receive)
manifest = {'engine':base['engine'], 'accent':'en-gb', 'sampleRate':rate,
            'notice':'Continuous text synthesis with engine word timestamps; phoneme timing within words is approximate.', 'voices':{}}
try:
    for voice, engine_voice in [('female', 'en+f3'), ('male', 'en+m3')]:
        assert lib.espeak_SetVoiceByName(engine_voice.encode()) == 0
        lib.espeak_SetParameter(1, 125, 0)
        lib.espeak_SetParameter(2, 100, 0)
        entries = {}
        for lesson in data['lessons'].values():
            key = 'lesson-' + lesson['id']
            folder = OUT / voice
            folder.mkdir(parents=True, exist_ok=True)
            if lesson['stage'] == 'sound':
                source = folder / ('ipa-' + lesson['sequence'][0] + '.wav')
                with wave.open(str(source), 'rb') as wav:
                    assert wav.getframerate() == rate
                    samples = array.array('h', wav.readframes(wav.getnframes()))
                word_starts = [0]
                end = len(samples) / rate
            else:
                chunks.clear()
                starts.clear()
                text = lesson['audioText'].encode('utf-8')
                buffer = C.create_string_buffer(text)
                assert lib.espeak_Synth(buffer, len(text) + 1, 0, 1, 0, 1, None, None) == 0
                raw = array.array('h', b''.join(chunks))
                active = [i for i, sample in enumerate(raw) if abs(sample) > 40]
                assert active, lesson['id']
                pad = int(rate * .12)
                samples = array.array('h', [0]) * pad + raw
                word_starts = [s + pad / rate for s in starts]
                end = pad / rate + (active[-1] + 1) / rate
            assert len(word_starts) == len(lesson['words']), (lesson['id'], word_starts, lesson['words'])
            words, clips = [], []
            for index, word in enumerate(lesson['words']):
                start = word_starts[index]
                stop = word_starts[index + 1] if index + 1 < len(word_starts) else end
                assert stop > start
                words.append({'text':word['text'], 'start':start, 'end':stop})
                total = sum(data['phonemes'][pid]['duration'] for pid in word['sequence'])
                cursor = start
                for pid in word['sequence']:
                    next_time = cursor + (stop - start) * data['phonemes'][pid]['duration'] / total
                    clips.append({'id':pid, 'start':cursor, 'end':next_time, 'wordIndex':index})
                    cursor = next_time
                clips[-1]['end'] = stop
            path = folder / (key + '.wav')
            with wave.open(str(path), 'wb') as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(rate)
                wav.writeframes(samples.tobytes())
            entries[key] = {'duration':len(samples) / rate, 'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                            'text':lesson['audioText'], 'words':words, 'clips':clips}
        manifest['voices'][voice] = {'engineVoice':engine_voice, 'entries':entries}
        print(voice, len(entries), 'lesson recordings generated', flush=True)
    target = OUT / 'curriculum-manifest.json'
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(target)
finally:
    lib.espeak_Terminate()
