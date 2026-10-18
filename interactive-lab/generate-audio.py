"""Build offline English phoneme/letter demonstrations with explicit eSpeak input.

Run: bash build.sh all
Build dependency: espeakng-loader==0.2.4 (not needed by the browser).
"""
import array
import ctypes as C
import hashlib
import json
from pathlib import Path
import subprocess
import wave
import espeakng_loader
from normalize_audio import normalize

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'dist/assets/audio'
data = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {PHONEMES,LETTERS} from './dist/phonemes.js'; console.log(JSON.stringify({phonemes:PHONEMES,letters:LETTERS}));"], cwd=ROOT))
# eSpeak's mnemonic alphabet, not orthographic approximations of IPA characters.
CODES = dict(zip(
    'i ih e ae ah o aw uu u uh er schwa ei ai oi au ou ia ea ua p b t d k g f v theta dh s z sh zh h ch jh m n ng l r j w ts dz tr dr'.split(),
    'i: I e a A: 0 O: U u: V 3: @ eI aI OI aU @U I@ e@ U@ p b t d k g f v T D s z S Z h tS dZ m n N l r j w ts dz tr dr'.split()))
assert set(CODES) == set(data['phonemes'])
lib = C.CDLL(espeakng_loader.get_library_path())
lib.espeak_Initialize.argtypes = [C.c_int, C.c_int, C.c_char_p, C.c_int]
lib.espeak_SetVoiceByName.argtypes = [C.c_char_p]
lib.espeak_SetParameter.argtypes = [C.c_int, C.c_int, C.c_int]
lib.espeak_Synth.argtypes = [C.c_void_p, C.c_size_t, C.c_uint, C.c_int, C.c_uint, C.c_uint, C.POINTER(C.c_uint), C.c_void_p]
rate = lib.espeak_Initialize(2, 0, str(Path(espeakng_loader.get_data_path()).parent).encode(), 0)
assert rate > 0
chunks = []
CALLBACK = C.CFUNCTYPE(C.c_int, C.POINTER(C.c_short), C.c_int, C.c_void_p)
@CALLBACK
def receive(samples, count, events):
    if samples and count:
        chunks.append(C.string_at(samples, count * 2))
    return 0
lib.espeak_SetSynthCallback.argtypes = [CALLBACK]
lib.espeak_SetSynthCallback(receive)
lib.espeak_SetParameter(1, 115, 0)
lib.espeak_SetParameter(2, 100, 0)

def synth(codes, closure=False, speed=115):
    # Set per utterance: isolated teaching vowels must not alter letter prosody.
    lib.espeak_SetParameter(1, speed, 0)
    chunks.clear()
    text = ('[[' + codes + ']]').encode()
    buffer = C.create_string_buffer(text)
    assert lib.espeak_Synth(buffer, len(text)+1, 0, 1, 0, 0x101, None, None) == 0
    samples = array.array('h', b''.join(chunks))
    active = [i for i,s in enumerate(samples) if abs(s)>40]
    assert active, f'Silent synthesis: {codes}'
    start=max(0,active[0]-int(rate*.01));end=min(len(samples),active[-1]+int(rate*.03))
    # Keep an audible onset and a short preparation interval for the model.
    before=.30 if closure else .12
    return array.array('h',[0])*int(rate*before)+samples[start:end]+array.array('h',[0])*int(rate*.16)

manifest={'engine':'eSpeak NG via espeakng-loader 0.2.4','accent':'en-gb','sampleRate':rate,
          'notice':'Synthetic demonstration voices; articulation timing is approximate, not forced alignment.','voices':{}}
for voice,engine_voice in [('female','en+f3'),('male','en+m3')]:
    assert lib.espeak_SetVoiceByName(engine_voice.encode()) == 0, engine_voice
    folder=OUT/voice;folder.mkdir(parents=True,exist_ok=True)
    entries={};letter_samples={}
    def write(key,samples,**extra):
        path=folder/(key+'.wav')
        with wave.open(str(path),'wb') as w:
            w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes(samples.tobytes())
        entries[key]={'duration':len(samples)/rate,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),**extra}
    for pid,p in data['phonemes'].items():
        codes=CODES[pid]
        speed=115
        if p['category']=='vowel':
            # Full vowels are citation forms; schwa remains unstressed.
            codes=("'" if pid!='schwa' else '')+codes
            # Deliberately clearer isolated duration contrast, not a speech rule.
            speed=95 if 'ː' in p['ipa'] else 170
        samples=normalize(synth(codes,p['category'] in ['plosive','affricate','cluster'],speed))
        active=[i for i,s in enumerate(samples) if abs(s)>40]
        write('ipa-'+pid,samples,ipa=p['ipa'],phonemes=[pid],synthesisInput=codes,
              synthesisRate=speed,activeDuration=(active[-1]-active[0]+1)/rate)
    for letter,l in data['letters'].items():
        codes=''.join(CODES[pid] for pid in l['sequence'])
        samples=synth(codes)
        write('letter-'+letter,samples,ipa=l['ipa'],phonemes=l['sequence'])
        letter_samples[letter]=samples
    alphabet=array.array('h');segments=[]
    for letter,samples in letter_samples.items():
        start=len(alphabet)/rate;alphabet.extend(samples)
        segments.append({'letter':letter,'start':start,'end':len(alphabet)/rate})
        alphabet.extend(array.array('h',[0])*int(rate*.20))
    write('alphabet',alphabet,segments=segments)
    manifest['voices'][voice]={'engineVoice':engine_voice,'entries':entries}
    print(voice,len(entries),'files generated',flush=True)
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
lib.espeak_Terminate()
print('AUDIO_COMPLETE',sum(len(v['entries']) for v in manifest['voices'].values()),flush=True)
