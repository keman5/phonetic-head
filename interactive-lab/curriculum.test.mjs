import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PHONEMES, LETTERS} from './dist/phonemes.js';
import {LESSON_SERIES, LESSONS, LESSON_STAGES} from './dist/curriculum.js';

test('ten courses progress from a spelling sound to a meaningful sentence', () => {
  assert.equal(LESSON_SERIES.length, 10);
  assert.equal(Object.keys(LESSONS).length, LESSON_SERIES.length * LESSON_STAGES.length);
  assert.equal(new Set(LESSON_SERIES.map(series => series.id)).size, LESSON_SERIES.length);
  for (const series of LESSON_SERIES) {
    assert.deepEqual(series.lessonIds.map(id => LESSONS[id].stage), LESSON_STAGES.map(stage => stage.id));
    assert.equal(series.letterNameIpa, LETTERS[series.letter].ipa);
    assert.equal(series.soundIpa, PHONEMES[series.soundId].ipa);
    assert(series.contrast.includes(series.letterNameIpa));
    assert(series.contrast.includes(series.soundIpa));
    assert.deepEqual(LESSONS[series.lessonIds[0]].sequence, [series.soundId]);
    assert(LESSONS[series.lessonIds[2]].text.includes(LESSONS[series.lessonIds[1]].text));
    assert(LESSONS[series.lessonIds[3]].text.includes(LESSONS[series.lessonIds[2]].text));
  }
  assert.deepEqual(LESSON_SERIES[0].lessonIds.map(id => LESSONS[id].text), ['d','dog','big dog','This is a big dog.']);
  assert.deepEqual(LESSONS['cat-sound'].sequence, ['k']);
});

test('every word has valid phonemes and continuous, finite teaching segments', () => {
  for (const lesson of Object.values(LESSONS)) {
    assert(lesson.translation && lesson.hint && lesson.ipa && lesson.audioText, lesson.id);
    assert.deepEqual(lesson.audioPhonemes.flat(), lesson.sequence);
    assert.deepEqual(lesson.words.flatMap(word => word.sequence), lesson.sequence);
    assert.equal(lesson.segments.length, lesson.sequence.length);
    let end = 0;
    for (const segment of lesson.segments) {
      assert(PHONEMES[segment.id], `${lesson.id}: ${segment.id}`);
      assert.equal(segment.start, end);
      assert(Number.isFinite(segment.end) && segment.end > segment.start);
      assert(lesson.words[segment.wordIndex].sequence.includes(segment.id));
      end = segment.end;
    }
    assert.equal(lesson.duration, end);
  }
});

test('connected examples preserve British dog vowel, weak a, th and sh digraphs', () => {
  assert.deepEqual(LESSONS['dog-word'].sequence, ['d','o','g']);
  assert.deepEqual(LESSONS['dog-sentence'].words.slice(0,3).map(word => word.sequence), [['dh','ih','s'], ['ih','z'], ['schwa']]);
  assert.deepEqual(LESSONS['fish-word'].sequence, ['f','ih','sh']);
  assert(!LESSONS['milk-sentence'].words.some(word => word.text === 'a'));
  assert.deepEqual(LESSONS['bird-word'].sequence, ['b','er','d']);
  assert.deepEqual(LESSONS['horse-word'].sequence, ['h','aw','s']);
  assert.deepEqual(LESSONS['lion-word'].sequence, ['l','ai','schwa','n']);
  assert.deepEqual(LESSONS['panda-word'].sequence, ['p','ae','n','d','schwa']);
  assert.deepEqual(LESSONS['rabbit-word'].sequence, ['r','ae','b','ih','t']);
  assert.deepEqual(LESSONS['duck-word'].sequence, ['d','uh','k']);
});
