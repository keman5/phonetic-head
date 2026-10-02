import {PHONEMES} from './phonemes.js';
import {lessonFor} from './teaching.js';

// A star records a completed activity, never a pronunciation assessment.
export class PracticeSession {
  constructor() { this.reset(); }
  reset() { this.mode = 'idle'; this.done = new Set(); this.running = false; }
  begin(mode) { this.mode = mode; this.running = mode !== 'try'; }
  interrupt() { this.running = false; }
  finish(mode) {
    if (!this.running || this.mode !== mode) return false;
    this.running = false; this.done.add(mode); return true;
  }
  check(values) {
    if (this.mode === 'try' && values.length === 3 && values.every(Boolean)) this.done.add('try');
    else this.done.delete('try');
  }
  get next() { return ['watch', 'listen', 'try'].find(mode => !this.done.has(mode)) || 'complete'; }
}

export function attentionCue(pose, part = 'tongue') {
  const lesson = lessonFor(pose.phoneme);
  if (!lesson) return {title: '选一个声音，开始探索', text: '不用着急，一次发现一个小秘密。'};
  const p = PHONEMES[pose.phoneme];
  if (part === 'lips') return {title: '看看嘴唇怎么变', text: lesson.mouth + '。'};
  if (part === 'air') {
    const blocked = ['plosive', 'affricate', 'cluster'].includes(p.category) && pose.air <= .02;
    return {title: p.category === 'nasal' ? '气息从鼻子走' : blocked ? '气流暂时被挡住' : '跟着蓝色箭头走',
      text: lesson.air + '；轻轻做，不要憋气。'};
  }
  if (p.category === 'diphthong') return {
    title: ['先摆好起始口型', '舌头正在滑动', '到达尾音口型'][pose.step],
    text: '这是一个连续的声音，中间不要停。'
  };
  return {title: pose.step === 2 ? '看完了，轻轻放松' : '找到粉色的舌头', text: lesson.tongue + '。'};
}

export function createLearningCoach(hooks) {
  const $ = selector => document.querySelector(selector);
  const session = new PracticeSession();
  const actions = {watch: $('#watch-demo'), listen: $('#listen-demo'), try: $('#try-demo')};
  let part = 'tongue', enabled = false, lastCue = '', activeFocus = false;
  const progress = $('#practice-progress'), message = $('#practice-message');
  const nextButton = $('#practice-next');
  const stars = [...document.querySelectorAll('[data-practice-star]')];
  const checks = [...document.querySelectorAll('#practice-checks input')];
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const reduce = $('#reduce-motion'); reduce.checked = media.matches;
  function syncMotion() { document.documentElement.dataset.reduceMotion = String(reduce.checked); }
  syncMotion(); reduce.addEventListener('change', syncMotion);
  media.addEventListener('change', event => { reduce.checked = event.matches; syncMotion(); });

  function render() {
    const count = session.done.size;
    progress.textContent = `${count} / 3 个小任务`;
    stars.forEach(star => {
      const complete = session.done.has(star.dataset.practiceStar);
      star.classList.toggle('earned', complete);
      star.textContent = complete ? '★' : '☆';
    });
    for (const [mode, button] of Object.entries(actions)) {
      button.disabled = !enabled;
      button.classList.toggle('is-current', session.mode === mode);
      button.classList.toggle('is-done', session.done.has(mode));
      button.setAttribute('aria-pressed', String(session.mode === mode));
      button.lastElementChild.textContent = session.done.has(mode) ? '✓' : '↗';
    }
    nextButton.disabled = !enabled;
    const labels = session.mode === session.next
      ? {watch:'再看一遍 →', listen:'再听一遍 →', try:'打开自查清单 →'}
      : {watch:'开始小探索 →', listen:'下一步：听一听 →', try:'轮到我试试 →'};
    nextButton.textContent = session.running ? '正在演示 · 可暂停'
      : session.next === 'complete' ? '再探索一次 ↺' : labels[session.next];
    $('#learning-dock').classList.toggle('all-done', session.next === 'complete');
    $('.coach-heading').textContent = session.next === 'complete' ? '这次探索完成啦！'
      : {idle:'准备好一起练习了吗？', watch:'小眼睛，发现嘴巴的秘密', listen:'小耳朵，听清这个声音', try:'轮到你来试试啦！'}[session.mode];
  }
  function announce(text) { message.textContent = text; }
  function showStage() {
    if (matchMedia('(max-width: 1199px)').matches) $('#stage').scrollIntoView({block:'start', behavior:'auto'});
  }
  function begin(mode) {
    if (!enabled) return;
    // The adapter pauses old playback before this session starts.
    hooks.prepare(mode);
    session.begin(mode); activeFocus = mode === 'watch';
    if (mode === 'watch') {
      part = ['p','b','f','v','m'].includes(hooks.phoneme()) ? 'lips' : 'tongue';
      focus(part); announce('第一步：只看一个部位。蓝色箭头表示气流。');
      hooks.play(); showStage();
    } else if (mode === 'listen') {
      part = 'lips'; markAttention();
      announce('第二步：听一遍声音。先听清楚，不用抢着跟读。'); hooks.play(); showStage();
    } else {
      part = 'lips'; markAttention();
      announce('轮到你啦！对着镜子轻轻试，再和老师一起自查。');
      $('#practice-checks').open = true;
      $('#practice-checks').scrollIntoView({block:'nearest', behavior:'auto'});
    }
    render();
  }
  function focus(value) {
    part = value; activeFocus = true; hooks.focus(value);
    markAttention();
  }
  function markAttention() {
    document.querySelectorAll('[data-attention]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.attention === part)));
  }
  for (const [mode, button] of Object.entries(actions)) button.onclick = () => begin(mode);
  document.querySelectorAll('[data-attention]').forEach(button => button.onclick = () => { if (enabled) {focus(button.dataset.attention); showStage();} });
  nextButton.onclick = () => {
    if (session.running) {hooks.pause(); return;}
    if (session.next === 'complete') {session.reset(); checks.forEach(input => input.checked = false);}
    begin(session.next);
  };
  checks.forEach(input => input.addEventListener('change', () => {
    session.check(checks.map(input => input.checked));
    announce(session.next === 'complete' ? '三颗探索星！你完成了观察、倾听和自查。读得准不准，请老师帮忙听一听。' : '做得很认真！按实际练习情况勾选，不用着急。');
    render();
  }));
  render();
  return {
    ready(value = true) { enabled = value; document.querySelectorAll('[data-attention]').forEach(button => button.disabled = !enabled); render(); },
    reset() {
      session.reset(); part = 'tongue'; activeFocus = false; checks.forEach(input => input.checked = false);
      document.querySelectorAll('[data-attention]').forEach(button => button.setAttribute('aria-pressed', 'false'));
      announce('先看动作，再听声音，最后自己试一试。'); render();
    },
    interrupt(reason) { session.interrupt(); if(reason) announce(reason); render(); },
    clearFocus() { activeFocus = false; document.querySelectorAll('[data-attention]').forEach(button => button.setAttribute('aria-pressed','false')); },
    resume(mode) { if(session.mode === mode && !session.done.has(mode)) { session.running = true; render(); } },
    fail() { session.interrupt(); announce('示范暂时没播完，没关系，点“再听一遍”重试。'); render(); },
    finish(mode) {
      if (!session.finish(mode)) return;
      announce(mode === 'watch' ? '观察完成！接下来听听这个声音。' : '倾听完成！现在可以轻轻跟读了。'); render();
    },
    update(pose, playing) {
      const cue = attentionCue(pose, part);
      const key = cue.title + cue.text;
      if (key !== lastCue) {
        lastCue = key; $('#attention-title').textContent = cue.title; $('#attention-copy').textContent = cue.text;
      }
      const voiced = playing && pose.voiced;
      $('#voice-meter').classList.toggle('is-sounding', !!voiced);
      const voiceText = voiced ? '声带振动示意' : playing ? '轻轻送气' : '声音准备好啦';
      if($('#voice-meter-label').textContent !== voiceText) $('#voice-meter-label').textContent = voiceText;
      $('#stage').classList.toggle('lesson-playing', playing);
    },
    get focus() { return activeFocus ? part : null; },
    get reducedMotion() { return reduce.checked; },
    snapshot() { return {mode:session.mode, running:session.running, done:[...session.done], next:session.next, focus:activeFocus ? part : null, reducedMotion:reduce.checked}; }
  };
}
