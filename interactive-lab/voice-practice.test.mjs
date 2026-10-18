import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeVoice, estimatePitch} from './dist/voice-analysis.js';

const sampleRate = 16000;
const sine = (hz, amplitude = .2, seconds = .4) => Float32Array.from({length:sampleRate * seconds}, (_, i) => amplitude * Math.sin(2 * Math.PI * hz * i / sampleRate));
test('PCM metrics report measured RMS, peak, quiet duration and recording length', () => {
  const samples = new Float32Array(sampleRate);
  samples.set(sine(220, .2, .5));
  const result = analyzeVoice(samples, sampleRate);
  assert.equal(result.duration, 1); assert(Math.abs(result.rms - .1) < .001);
  assert(Math.abs(result.peak - .2) < .001); assert.equal(result.silenceRatio, .5);
  assert(Math.abs(result.pitchHz - 220) < 1);
});
test('quiet and clipped recordings receive volume advice without a pronunciation score', () => {
  const quiet = analyzeVoice(new Float32Array(sampleRate), sampleRate);
  assert.equal(quiet.silenceRatio, 1); assert.equal(quiet.pitchHz, null); assert.match(quiet.advice, /较轻/);
  assert.match(analyzeVoice(sine(220, 1), sampleRate).advice, /过响/);
  assert.equal('score' in quiet, false);
  assert.throws(() => analyzeVoice([], sampleRate));
  assert.throws(() => analyzeVoice(new Float32Array([NaN]), sampleRate));
});
test('reliable periodic sound yields fundamental frequency, silence and noise yield none', () => {
  for (const hz of [110, 220, 440]) assert(Math.abs(estimatePitch(sine(hz), sampleRate) - hz) < 1);
  assert.equal(estimatePitch(new Float32Array(4000), sampleRate), null);
  assert.equal(estimatePitch(sine(220, .001), sampleRate), null);
  let seed = 123;
  const noise = Float32Array.from({length:4000}, () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 2**32 - .5) * .4; });
  assert.equal(estimatePitch(noise, sampleRate), null);
  assert.equal(estimatePitch(new Float32Array(20), sampleRate), null);
});
