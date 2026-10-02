import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PracticeSession, attentionCue} from './dist/learning.js';
import {PHONEMES} from './dist/phonemes.js';
import {poseAt} from './dist/motion.js';

test('stars reflect activity completion, not starting, pausing or unrelated playback', () => {
  const session = new PracticeSession();
  assert.equal(session.next, 'watch');
  session.begin('watch');
  assert.equal(session.done.size, 0);
  assert.equal(session.finish('listen'), false);
  session.interrupt();
  assert.equal(session.finish('watch'), false);
  session.begin('watch');
  assert.equal(session.finish('watch'), true);
  assert.equal(session.finish('watch'), false);
  assert.equal(session.next, 'listen');
  session.begin('listen'); session.finish('listen');
  assert.equal(session.next, 'try');
  session.check([true,true,true]);
  assert.equal(session.done.size, 2, 'self-check must be in the try activity');
  session.begin('try'); session.check([true,true,false]);
  assert.equal(session.done.size, 2);
  session.check([true,true,true]); assert.equal(session.next, 'complete');
  session.check([false,true,true]); assert.equal(session.next, 'try');
  session.reset(); assert.equal(session.mode, 'idle'); assert.equal(session.done.size, 0);
  assert.equal(session.finish('listen'), false, 'stale completion after reset must not award a star');
});

test('all teaching sounds have valid phase-dependent attention cues', () => {
  for (const p of Object.values(PHONEMES)) for (const t of [0,.25,.5,.85,1]) {
    const pose = poseAt('ipa:'+p.id,t);
    for (const part of ['lips','tongue','air']) {
      const cue = attentionCue(pose,part);
      assert(cue.title.length > 3 && cue.text.length >= 5,p.id+' '+part+' '+t);
      assert(!/undefined|NaN/.test(cue.title+cue.text));
    }
  }
  assert.match(attentionCue(poseAt('ipa:m',.5),'air').title,/鼻子/);
  assert.match(attentionCue(poseAt('ipa:p',.25),'air').title,/挡住/);
  assert.match(attentionCue(poseAt('ipa:ei',.5),'tongue').title,/滑动/);
  assert.match(attentionCue(poseAt('ipa:ei',.85),'tongue').title,/尾音/);
});
