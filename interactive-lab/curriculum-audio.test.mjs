import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {LESSONS} from './dist/curriculum.js';
import {curriculumPose, curriculumSound} from './dist/curriculum-playback.js';
import {attentionCue} from './dist/learning.js';

const root = new URL('./dist/assets/audio/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('curriculum-manifest.json', root)));
test('every lesson has two complete continuous recordings and bounded word/phoneme timing', () => {
  assert.deepEqual(Object.keys(manifest.voices).sort(), ['female', 'male']);
  for (const [voice, {entries}] of Object.entries(manifest.voices)) {
    assert.equal(Object.keys(entries).length, Object.keys(LESSONS).length);
    for (const lesson of Object.values(LESSONS)) {
      const entry = entries['lesson-' + lesson.id];
      if (lesson.stage !== 'sound') {
        assert.match(entry.engine, /Kokoro/);
        assert.equal(entry.engineVoice, voice === 'female' ? 'bf_emma' : 'bm_george');
        assert.equal(entry.timingMethod, 'model word durations; proportional phonemes within words');
      }
      const wav = readFileSync(new URL(voice + '/lesson-' + lesson.id + '.wav', root));
      assert.equal(createHash('sha256').update(wav).digest('hex'), entry.sha256);
      assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
      if (lesson.stage === 'sound') {
        assert.deepEqual(wav, readFileSync(new URL(voice + '/ipa-' + lesson.sequence[0] + '.wav', root)), 'Course sounds must use the same audible phoneme recording');
      }
      assert.equal(wav.readUInt32LE(24), manifest.sampleRate);
      assert.equal((wav.length - 44) / 2 / manifest.sampleRate, entry.duration);
      assert(wav.subarray(44).some(byte => byte !== 0));
      assert.deepEqual(entry.clips.map(clip => clip.id), lesson.sequence);
      assert.equal(entry.words.length, lesson.words.length);
      for (const [index, word] of entry.words.entries()) {
        assert(word.start >= 0 && word.end > word.start && word.end <= entry.duration + 1e-9);
        const pose = curriculumPose(lesson.id, (word.start + word.end) / 2 / entry.duration, entry);
        assert.equal(pose.wordIndex, index);
        assert(Object.values(pose.weights).every(weight => weight >= 0 && weight <= 1));
      }
      assert.equal(curriculumPose(lesson.id, 1, entry).wordIndex, -1);
      assert.equal(curriculumPose(lesson.id, 1, entry).air, 0);
      assert.equal(curriculumSound('lesson:' + lesson.id).title, lesson.text);
    }
  }
});

test('silent decomposition traverses every word and preserves the final rest pose', () => {
  const lesson = LESSONS['dog-sentence'];
  for (const segment of lesson.segments) {
    const pose = curriculumPose(lesson.id, (segment.start + segment.end) / 2 / lesson.duration);
    assert.equal(pose.phoneme, segment.id);
    assert.equal(pose.wordIndex, segment.wordIndex);
  }
  assert.deepEqual(curriculumPose(lesson.id, 1).weights, {});
  assert.equal(curriculumSound('ipa:d'), null);
  assert.match(attentionCue({phoneme:'d', step:2, nextPhoneme:'o'}).title, /接着读/);
});
