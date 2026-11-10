import {t} from './i18n.js';
export function estimatePitch(samples, sampleRate) {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || samples.length < sampleRate / 40) return null;
  const size = Math.min(samples.length, Math.ceil(sampleRate * .08));
  let mean = 0, energy = 0;
  for (let i = 0; i < size; i++) mean += samples[i];
  mean /= size;
  for (let i = 0; i < size; i++) energy += (samples[i] - mean) ** 2;
  if (!Number.isFinite(energy) || Math.sqrt(energy / size) < .01) return null;
  const min = Math.floor(sampleRate / 700), max = Math.min(Math.ceil(sampleRate / 70), Math.floor(size / 2));
  const correlations = [];
  for (let lag = min; lag <= max; lag++) {
    let cross = 0, a = 0, b = 0;
    for (let i = 0; i < size - lag; i++) {
      const x = samples[i] - mean, y = samples[i + lag] - mean;
      cross += x * y; a += x * x; b += y * y;
    }
    correlations[lag] = cross / Math.sqrt(a * b || 1);
  }
  // The first strong local peak avoids choosing a lower octave of the same period.
  for (let lag = min + 1; lag < max; lag++) {
    const before = correlations[lag - 1], peak = correlations[lag], after = correlations[lag + 1];
    if (peak > .9 && peak >= before && peak > after) {
      const offset = .5 * (before - after) / (before - 2 * peak + after);
      return sampleRate / (lag + offset);
    }
  }
  return null;
}

export function analyzeVoice(samples, sampleRate) {
  if (!samples.length || !Number.isFinite(sampleRate) || sampleRate <= 0) throw new TypeError('No audio samples');
  let sum = 0, peak = 0, quietSamples = 0;
  const frameSize = Math.max(1, Math.round(sampleRate * .02)), pitches = [];
  for (let start = 0; start < samples.length; start += frameSize) {
    const end = Math.min(start + frameSize, samples.length);
    let frameEnergy = 0;
    for (let i = start; i < end; i++) {
      const value = samples[i];
      if (!Number.isFinite(value)) throw new TypeError('Invalid audio samples');
      frameEnergy += value * value; peak = Math.max(peak, Math.abs(value));
    }
    sum += frameEnergy;
    if (Math.sqrt(frameEnergy / (end - start)) < .01) quietSamples += end - start;
  }
  const pitchFrame = Math.round(sampleRate * .08);
  for (let start = 0; start + pitchFrame <= samples.length; start += pitchFrame) {
    const pitch = estimatePitch(samples.subarray(start, start + pitchFrame), sampleRate);
    if (pitch !== null) pitches.push(pitch);
  }
  pitches.sort((a, b) => a - b);
  const duration = samples.length / sampleRate, rms = Math.sqrt(sum / samples.length);
  const silenceRatio = quietSamples / samples.length;
  const pitchHz = pitches.length >= 3 ? pitches[Math.floor(pitches.length / 2)] : null;
  const advice = peak >= .98 ? t('声音有些过响。离麦克风远一点，用舒服的音量再试一次。')
    : silenceRatio > .85 || rms < .015 ? t('录音里的声音较轻。靠近麦克风一点，在安静的地方用自然音量再读一次。')
    : duration < .3 ? t('这次录音很短。准备好后，完整读出当前内容。')
    : t('声音已清楚录下。很棒，听听自己，再和示范比较节奏与声音。');
  return {duration, rms, peak, silenceRatio, pitchHz, advice};
}
