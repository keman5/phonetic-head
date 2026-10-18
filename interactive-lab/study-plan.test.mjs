import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LESSON_SERIES} from './dist/curriculum.js';
import {localDateKey, readStudyPlan, recordCompletion, getStudyPlan} from './dist/study-plan.js';

const at = (day, month=10, year=2026) => new Date(year,month-1,day,12);
const completed = ids => Object.fromEntries(ids.map(id=>[id,{done:[0,1,2,3,4,5,6]}]));
function memoryStorage() {
  const values = new Map();
  return {getItem:key=>values.get(key)||null, setItem:(key,value)=>values.set(key,value)};
}

test('local calendar dates do not depend on UTC day and invalid dates are rejected',()=>{
  const date = new Date(2026,9,16,0,1);
  assert.equal(localDateKey(date),'2026-10-16');
  assert.throws(()=>localDateKey(new Date(NaN)),TypeError);
});

test('reading and recommendations never award a check-in; completion is idempotent per course per day',()=>{
  const storage=memoryStorage();
  let plan=getStudyPlan({}, {storage,date:at(16)});
  assert.equal(plan.newCourseId,'dog');assert.equal(plan.checkedIn,false);assert.equal(plan.streak,0);
  assert.deepEqual(readStudyPlan(storage).days,{});
  recordCompletion('dog',{storage,date:at(16)});
  recordCompletion('dog',{storage,date:at(16)});
  assert.equal(readStudyPlan(storage).reviews.dog.count,1);
  plan=getStudyPlan(completed(['dog']),{storage,date:at(16)});
  assert.equal(plan.checkedIn,true);assert.equal(plan.streak,1);assert.equal(plan.newCourseId,'cat');
  assert.deepEqual(plan.reviewCourseIds,[]);
  assert.equal(getStudyPlan(completed(['dog']),{storage,date:at(17)}).newCourseId,'cat');
  assert.throws(()=>recordCompletion('fake',{storage}),RangeError);
});

test('reviews follow 1/3/7/14 day intervals, then repeat without inventing new content',()=>{
  const storage=memoryStorage(), progress=completed(LESSON_SERIES.map(series=>series.id));
  for(const series of LESSON_SERIES)recordCompletion(series.id,{storage,date:at(1)});
  let plan=getStudyPlan(progress,{storage,date:at(2)});
  assert.equal(plan.totalCourses,10);assert.equal(plan.completedCount,10);
  assert.equal(plan.allComplete,true);assert.equal(plan.mode,'review');assert.equal(plan.newCourseId,null);
  assert.deepEqual(plan.reviewCourseIds,['dog','cat']);
  recordCompletion('dog',{storage,date:at(2)});
  assert(!getStudyPlan(completed(['dog']),{storage,date:at(4)}).reviewCourseIds.includes('dog'));
  assert.deepEqual(getStudyPlan(completed(['dog']),{storage,date:at(5)}).reviewCourseIds,['dog']);
  recordCompletion('dog',{storage,date:at(5)});
  assert.equal(getStudyPlan(completed(['dog']),{storage,date:at(6)}).nextReviewDate,'2026-10-12');
  recordCompletion('dog',{storage,date:at(12)});
  assert.equal(getStudyPlan(completed(['dog']),{storage,date:at(13)}).nextReviewDate,'2026-10-26');
  recordCompletion('dog',{storage,date:at(26)});
  assert.equal(getStudyPlan(completed(['dog']),{storage,date:at(27)}).nextReviewDate,'2026-11-09');
  assert.equal(getStudyPlan(progress,{storage,date:at(27)}).completedCount,10);
});

test('streak crosses months and years, tolerates today not finished, and ends after a missing day',()=>{
  const storage=memoryStorage();
  recordCompletion('dog',{storage,date:at(30,12,2026)});
  recordCompletion('dog',{storage,date:at(31,12,2026)});
  recordCompletion('cat',{storage,date:at(1,1,2027)});
  assert.equal(getStudyPlan({}, {storage,date:at(1,1,2027)}).streak,3);
  assert.equal(getStudyPlan({}, {storage,date:at(2,1,2027)}).streak,3);
  assert.equal(getStudyPlan({}, {storage,date:at(3,1,2027)}).streak,0);
  assert.equal(getStudyPlan({}, {storage,date:at(29,12,2026)}).streak,0);
});

test('corrupt storage is sanitized and blocked storage recovers unsaved completion events',()=>{
  assert.deepEqual(readStudyPlan({getItem:()=>'{broken'}),{days:{},reviews:{}});
  const bad={getItem:()=>JSON.stringify({days:{'2026-02-30':['dog'],'2026-10-16':['fake','dog','dog'],'2026-10-17':'cat'}})};
  assert.deepEqual(readStudyPlan(bad).days,{'2026-10-16':['dog']});
  let blocked=true, persisted=null;
  const storage={getItem(){if(blocked)throw Error('blocked');return persisted;},setItem(key,value){if(blocked)throw Error('blocked');persisted=value;}};
  assert.equal(recordCompletion('dog',{storage,date:at(16)}).saved,false);
  assert.equal(recordCompletion('cat',{storage,date:at(17)}).saved,false);
  assert.equal(getStudyPlan({}, {storage,date:at(17)}).streak,2);
  blocked=false;
  assert.deepEqual(Object.keys(readStudyPlan(storage).days),['2026-10-16','2026-10-17']);
  assert(persisted);
  assert.equal(recordCompletion('fish',{storage,date:at(18)}).saved,true);
});

test('legacy completed courses can be reviewed and partial courses do not count as completed',()=>{
  const plan=getStudyPlan({...completed(['dog']),cat:{done:[0,1,2,3,4,5]}},{storage:memoryStorage(),date:at(16)});
  assert.equal(plan.completedCount,1);assert.equal(plan.newCourseId,'cat');
  assert.deepEqual(plan.reviewCourseIds,['dog']);assert.equal(plan.checkedIn,false);
});
