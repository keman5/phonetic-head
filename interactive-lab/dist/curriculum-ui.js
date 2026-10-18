import {LESSON_SERIES, LESSONS, LESSON_STAGES} from './curriculum.js';

export function mountCurriculum({onSelect, onPlay, onStop}) {
  const $ = id => document.getElementById(id);
  const seriesPicker = $('course-series');
  const stageList = $('course-stages');
  let current = LESSONS[LESSON_SERIES[0].lessonIds[0]], playing = false, activeWord = -1;
  seriesPicker.setOptions(LESSON_SERIES.map(series => [series.id, series.title]));

  function choose(id) {
    if (!LESSONS[id]) return;
    onStop();
    select(id);
    onSelect(id);
  }
  function setWord(index) {
    if (index === activeWord) return;
    activeWord = index;
    [...$('course-text').children].forEach((word, i) => {
      if (i === index) word.setAttribute('aria-current', 'true');
      else word.removeAttribute('aria-current');
    });
  }
  function setPlaying(value) {
    playing = value;
    $('course-listen').textContent = value ? '停止示范' : '听示范并跟读';
    if (!value) setWord(-1);
  }
  function select(id) {
    const lesson = LESSONS[id];
    if (!lesson) return;
    const restoreStageFocus = stageList.contains(document.activeElement);
    current = lesson;
    const series = LESSON_SERIES.find(item => item.id === lesson.seriesId);
    const index = series.lessonIds.indexOf(id);
    seriesPicker.value = series.id;
    $('course-title').textContent = series.title;
    $('course-progress').textContent = `${index + 1} / ${series.lessonIds.length} 步`;
    $('course-sound-note').textContent = `字母 ${series.letter} 的名称是 /${series.letterNameIpa}/；本系列练习它在单词里的声音 /${series.soundIpa}/。`;
    stageList.replaceChildren(...series.lessonIds.map((lessonId, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = `course-stage-${i}`;
      button.dataset.lesson = lessonId;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(i === index));
      button.setAttribute('aria-controls', 'course-lesson');
      button.tabIndex = i === index ? 0 : -1;
      const number = document.createElement('span');
      number.textContent = `0${i + 1}`;
      button.append(number, LESSON_STAGES.find(stage => stage.id === LESSONS[lessonId].stage).label);
      button.onclick = () => choose(lessonId);
      button.onkeydown = event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? series.lessonIds.length - 1
          : (i + (event.key === 'ArrowRight' ? 1 : -1) + series.lessonIds.length) % series.lessonIds.length;
        choose(series.lessonIds[next]);
        stageList.children[next].focus();
      };
      return button;
    }));
    $('course-lesson').setAttribute('aria-labelledby', `course-stage-${index}`);
    $('course-text').replaceChildren(...lesson.text.trim().split(/\s+/).map(text => {
      const word = document.createElement('span');
      word.textContent = text;
      return word;
    }));
    $('course-ipa').textContent = `/${lesson.ipa}/`;
    $('course-translation').textContent = lesson.translation;
    $('course-hint').textContent = lesson.hint;
    $('course-previous').disabled = index === 0;
    $('course-next').disabled = index === series.lessonIds.length - 1;
    setPlaying(false);
    $('course-status').textContent = '先听一遍，再跟着读；可以随时切换教学阶段。';
    if (restoreStageFocus) stageList.children[index].focus();
  }
  function move(offset) {
    const series = LESSON_SERIES.find(item => item.id === current.seriesId);
    choose(series.lessonIds[series.lessonIds.indexOf(current.id) + offset]);
  }
  seriesPicker.addEventListener('change', () => {
    const series = LESSON_SERIES.find(item => item.id === seriesPicker.value);
    if (series) choose(series.lessonIds[0]);
  });
  $('course-previous').onclick = () => move(-1);
  $('course-next').onclick = () => move(1);
  $('course-listen').onclick = () => playing ? onStop() : onPlay(current.id);
  select(current.id);
  $('course-listen').disabled = true;
  return {
    select, setPlaying, setWord,
    setReady: ready => { $('course-listen').disabled = !ready; },
    setStatus: text => { $('course-status').textContent = text; },
    setVisible: visible => {
      $('curriculum-series').hidden = !visible;
      $('curriculum-card').hidden = !visible;
    }
  };
}
