import {LESSONS} from './curriculum.js';
import {timelinePose} from './phonemes.js';

export function curriculumSound(id) {
  const lesson = LESSONS[id.replace(/^lesson:/, '')];
  if (!lesson) return null;
  return {title:lesson.text, copy:lesson.translation, tip:lesson.hint,
    steps:['准备构形', '保持 / 过渡', '释放 / 收尾'],
    focus:['tongue', 'lips', 'jaw', 'velum', 'voice'], duration:lesson.duration};
}

export function curriculumPose(id, progress, entry) {
  const lesson = LESSONS[id.replace(/^lesson:/, '')];
  const duration = entry?.duration || lesson.duration;
  const clips = entry?.clips || lesson.segments;
  const seconds = Math.max(0, Math.min(1, progress)) * duration;
  const pose = timelinePose({clips, duration}, seconds);
  const word = (entry?.words || []).findIndex(w => seconds >= w.start && seconds < w.end);
  const segment = clips.find(c => seconds >= c.start && seconds < c.end);
  const active = !!segment;
  // Audio padding is silence; keep the face at rest and remove the reading highlight.
  return {...pose, ...(active ? {} : {weights:{}, air:0, nasal:0, voiced:false}),
    wordIndex:entry ? word : active ? segment.wordIndex : -1};
}
