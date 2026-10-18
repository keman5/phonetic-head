"""Raise quiet isolated phonemes without changing their waveform or timing."""
import array
import hashlib
import json
from pathlib import Path
import wave

ROOT = Path(__file__).resolve().parent / 'dist/assets/audio'
TARGET_PEAK = 16384  # -6 dBFS leaves headroom for short consonant attacks.


def normalize(samples):
    peak = max(map(abs, samples), default=0)
    assert peak, 'Cannot normalize silent audio'
    if peak >= TARGET_PEAK:
        return samples
    return array.array('h', (round(value * TARGET_PEAK / peak) for value in samples))


def main():
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    curriculum = json.loads((ROOT / 'curriculum-manifest.json').read_text())
    count = 0
    for voice, catalog in manifest['voices'].items():
        for key, entry in catalog['entries'].items():
            if not key.startswith('ipa-'):
                continue
            path = ROOT / voice / (key + '.wav')
            with wave.open(str(path), 'rb') as source:
                params = source.getparams()
                assert params.nchannels == 1 and params.sampwidth == 2
                original = array.array('h', source.readframes(params.nframes))
            samples = normalize(original)
            assert len(samples) == len(original)
            assert normalize(samples) == samples, 'Normalization must be idempotent'
            assert all((a == 0) == (b == 0) for a, b in zip(original, samples))
            if samples != original:
                with wave.open(str(path), 'wb') as output:
                    output.setparams(params)
                    output.writeframes(samples.tobytes())
                count += 1
            entry['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
            active = [i for i, sample in enumerate(samples) if abs(sample) > 40]
            entry['activeDuration'] = (active[-1] - active[0] + 1) / params.framerate
        for key, entry in curriculum['voices'][voice]['entries'].items():
            if key.endswith('-sound'):
                source = ROOT / voice / ('ipa-' + entry['clips'][0]['id'] + '.wav')
                (ROOT / voice / (key + '.wav')).write_bytes(source.read_bytes())
                entry['sha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
    for name, data in [('manifest.json', manifest), ('curriculum-manifest.json', curriculum)]:
        (ROOT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(f'Normalized {count} quiet phonemes; course sound recordings synchronized.')


if __name__ == '__main__':
    main()
