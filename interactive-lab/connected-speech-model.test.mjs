import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CHANNELS,makeTimeline,timelinePose} from './dist/phonemes.js';

test('each phoneme restarts its teaching phase inside words and sentences',()=>{
  const timeline=makeTimeline(['dh','ih','s','ih','z','schwa','b','ih','g','d','o','g']);
  for(const [index,clip] of timeline.clips.entries()){
    for(const [progress,step] of [[.1,0],[.55,1],[.9,2]]){
      const pose=timelinePose(timeline,clip.start+(clip.end-clip.start)*progress);
      assert.equal(pose.phoneme,clip.id);
      assert.equal(pose.nextPhoneme,timeline.clips[index+1]?.id||null);
      assert.equal(pose.step,step,`${clip.id} at ${clip.start} must show its own phase`);
      assert(Math.abs(pose.phonemeProgress-progress)<1e-8);
    }
  }
});

test('homorganic nasal-stop transitions never send air through a sealed mouth',()=>{
  for(const [nasal,stop,channel] of [['m','b','LipClose'],['n','d','TipAlveolar'],['ng','g','BackSeal']]){
    for(const sequence of [[nasal,stop],[stop,nasal]]){
      const timeline=makeTimeline(sequence),boundary=timeline.clips[1].start;
      for(const offset of [-.04,-.02,0,.02,.04]){
        const pose=timelinePose(timeline,boundary+offset);
        if(pose.weights[channel]>.999&&pose.air>.02)
          assert.equal(pose.nasal,1,`${sequence.join('→')} ${offset}: remaining airflow must use the nose`);
      }
    }
  }
});

test('stop release, nasal flow and continuous frication survive connected speech',()=>{
  const timeline=makeTimeline(['d','o','g','f','ae','n','s']);
  const sample=(index,progress)=>{
    const clip=timeline.clips[index];
    return timelinePose(timeline,clip.start+(clip.end-clip.start)*progress);
  };
  for(const index of [0,2]){
    assert.equal(sample(index,.3).air,0);
    assert(sample(index,.9).air>.1);
  }
  const fricative=sample(3,.5);
  assert(fricative.weights.LipBite>.8);
  assert(fricative.air>.1);
  assert.equal(fricative.nasal,0);
  assert.equal(sample(5,.5).nasal,1);
});

test('word-length sequences remain smooth and bounded at every phoneme boundary',()=>{
  const timeline=makeTimeline(['m','b','ih','g','d','o','g','n','d','ng','g']);
  for(const clip of timeline.clips.slice(1)){
    const a=timelinePose(timeline,clip.start-1e-6),b=timelinePose(timeline,clip.start+1e-6);
    for(const channel of CHANNELS)assert(Math.abs(a.weights[channel]-b.weights[channel])<.001,channel);
    assert(Math.abs(a.air-b.air)<.001);
    for(const pose of [a,b]){
      for(const value of [...Object.values(pose.weights),pose.air,pose.nasal])
        assert(Number.isFinite(value)&&value>=0&&value<=1);
    }
  }
  for(const seconds of [0,timeline.duration]){
    const pose=timelinePose(timeline,seconds);
    assert.equal(pose.air,0);
    assert(Object.values(pose.weights).every(value=>value===0));
  }
});
