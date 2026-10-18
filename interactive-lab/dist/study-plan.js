import {LESSON_SERIES} from './curriculum.js';

const KEY = 'phonetic-study-plan-v1';
const COURSE_IDS = LESSON_SERIES.map(series => series.id);
const INTERVALS = [1, 3, 7, 14];
const pending = new Map();
const defaultStorage = {};

export function localDateKey(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new TypeError('Invalid study date');
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function ordinal(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return NaN;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month-1, day));
  return date.toISOString().slice(0,10) === key ? date.getTime()/86400000 : NaN;
}

function cleanState(value) {
  const days = {}, reviews = {};
  for (const date of Object.keys(value?.days || {}).sort()) {
    if (!Number.isFinite(ordinal(date)) || !Array.isArray(value.days[date])) continue;
    const ids = [...new Set(value.days[date].filter(id => COURSE_IDS.includes(id)))];
    if (!ids.length) continue;
    days[date] = ids;
    for (const id of ids) {
      const old = reviews[id];
      reviews[id] = {firstDate:old?.firstDate || date, lastDate:date, count:(old?.count || 0)+1};
    }
  }
  return {days, reviews};
}

export function readStudyPlan(storage) {
  const key = storage || defaultStorage;
  try {
    const target = storage || localStorage;
    if (pending.has(key)) {
      target.setItem(KEY, JSON.stringify(pending.get(key)));
      pending.delete(key);
    }
    return cleanState(JSON.parse(target.getItem(KEY) || '{}'));
  } catch { return cleanState(pending.get(key)); }
}

// Call only after the learner completes all activities, including a full review.
export function recordCompletion(seriesId, {storage, date = new Date()} = {}) {
  if (!COURSE_IDS.includes(seriesId)) throw new RangeError('Unknown course: '+seriesId);
  const today = localDateKey(date);
  const state = readStudyPlan(storage);
  state.days[today] = [...new Set([...(state.days[today] || []), seriesId])];
  const result = cleanState(state);
  try {
    (storage || localStorage).setItem(KEY, JSON.stringify(result));
    pending.delete(storage || defaultStorage);
    return {state:result, saved:true};
  } catch {
    pending.set(storage || defaultStorage, result);
    return {state:result, saved:false};
  }
}

export function getStudyPlan(progress, {storage, date = new Date(), state = readStudyPlan(storage)} = {}) {
  const today = localDateKey(date), day = ordinal(today);
  // A clock correction must not let future records create today's streak or review count.
  state = cleanState({days:Object.fromEntries(Object.entries(state.days || {}).filter(([key]) => key <= today))});
  const completed = COURSE_IDS.filter(id => [0,1,2,3,4,5,6].every(step => progress?.[id]?.done?.includes(step)));
  const studyDates = Object.keys(state.days).sort();
  const checkedIn = !!state.days[today]?.length;
  const knownDates = new Set(studyDates.map(ordinal));
  let streak = 0, cursor = checkedIn ? day : day-1;
  while (knownDates.has(cursor)) {streak++; cursor--;}
  const due = completed.map(id => {
    const review = state.reviews[id];
    return {id, due:review ? ordinal(review.lastDate)+INTERVALS[Math.min(review.count-1,INTERVALS.length-1)] : day};
  }).sort((a,b) => a.due-b.due || COURSE_IDS.indexOf(a.id)-COURSE_IDS.indexOf(b.id));
  const allComplete = completed.length === COURSE_IDS.length;
  return {
    date:today, newCourseId:COURSE_IDS.find(id => !completed.includes(id)) || null,
    reviewCourseIds:due.filter(item => item.due <= day).slice(0,2).map(item => item.id),
    nextReviewDate:due.length ? new Date(due[0].due*86400000).toISOString().slice(0,10) : null,
    completedCount:completed.length, totalCourses:COURSE_IDS.length,
    allComplete, checkedIn, streak, studyDates, mode:allComplete ? 'review' : 'learn'
  };
}
