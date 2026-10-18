import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readProgress,writeProgress,lessonForChapter,CHAPTERS,SCENES} from './dist/journey.js';
import {LESSON_SERIES,LESSONS} from './dist/curriculum.js';
test('saved progress validates shape, ordering, bounds and corrupted storage',()=>{
 const storage=value=>({getItem:()=>value});
 assert.deepEqual(readProgress(storage('{broken')),{});
 assert.deepEqual(readProgress(storage('null')),{});
 assert.deepEqual(readProgress(storage(JSON.stringify({dog:{done:[0,1,1,3,99,'2'],step:7},unknown:{done:[0]}}))),{dog:{done:[0,1],step:2}});
 assert.deepEqual(readProgress(storage(JSON.stringify({dog:{done:[0],step:-3}}))),{dog:{done:[0],step:0}});
 assert.equal(writeProgress({}, {setItem(){throw Error('blocked');}}),false);
 for(const series of LESSON_SERIES)for(let i=0;i<CHAPTERS.length;i++)assert(LESSONS[lessonForChapter(series,i)]);
});
test('every course has a scene and exactly one correct listening choice',()=>{
 assert.deepEqual(Object.keys(SCENES),LESSON_SERIES.map(series=>series.id));
 for(const series of LESSON_SERIES){
  const scene=SCENES[series.id];
  for(const key of ['icon','place','question','answer','transfer'])assert(scene[key],`${series.id}: ${key}`);
  assert.equal(scene.choices.length,3);
  assert.equal(new Set(scene.choices).size,3);
  assert.equal(scene.choices.filter(choice=>choice===scene.answer).length,1);
  const storage={getItem:()=>JSON.stringify({[series.id]:{done:[0,1,2,3,4,5,6],step:7}})};
  assert.equal(readProgress(storage)[series.id].done.length,7);
 }
});

test('sentence listening date survives progress recovery',()=>{
 const read=value=>readProgress({getItem:()=>JSON.stringify({dog:{step:6,done:[0,1,2,3,4,5],sentenceHeardOn:value}})}).dog;
 assert.equal(read('2026-10-18').sentenceHeardOn,'2026-10-18');
 assert.equal(read(true).sentenceHeardOn,undefined);
 assert.equal(read('garbage').sentenceHeardOn,undefined);
});

test('self-check restores only a valid date and two boolean confirmations',()=>{
 const read=selfCheck=>readProgress({getItem:()=>JSON.stringify({dog:{done:[0],step:1,selfCheck}})}).dog.selfCheck;
 const check={date:'2026-10-18',checks:[true,false]};
 assert.deepEqual(read(check),check);
 for(const invalid of [null,{date:true,checks:[true,true]},{date:'garbage',checks:[true,true]},{date:check.date,checks:[1,true]},{date:check.date,checks:[true]}])assert.equal(read(invalid),undefined);
});
