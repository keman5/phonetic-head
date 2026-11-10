import {t, htmlT} from './i18n.js';
import {analyzeVoice} from './voice-analysis.js';
import {LESSONS,DEMONSTRATION_RATE,lessonAudioURL} from './curriculum.js';

export function mountVoicePractice(container, {getLesson, onActivity = () => {}, onBeforeAudio = () => {}}) {
  const panel = document.createElement('section');
  panel.className = 'voice-practice';
  panel.setAttribute('aria-label', t('我的朗读练习'));
  panel.innerHTML = htmlT`<h3>读给自己听</h3>
    <p>录音最多 15 秒，只保存在本页内存中，不会自动上传。离开页面后不保留。</p>
    <p class="voice-hint"></p>
    <div class="voice-actions">
      <button type="button" data-voice="record">开始录音</button>
      <button type="button" data-voice="replay" disabled>听我的录音</button>
      <button type="button" data-voice="example">听示范 · 1×</button>
      <button type="button" data-voice="delete" disabled>删除录音</button>
    </div>
    <p class="voice-status" role="status" aria-live="polite">准备好后，点开始录音。</p>
    <div class="voice-metrics" hidden></div>
    <details class="voice-review">
      <summary>老师 / 家长人工点评</summary>
      <p>老师 / 家长人工点评，不是自动评分。请听过录音后再选择。</p>
      <fieldset class="voice-rating"><legend>人工评分（1–5 分）</legend>
        ${[t('继续练习'),t('正在进步'),t('已接近'),t('很不错'),t('很标准')].map((label, index) => `<button type="button" data-rating="${index + 1}" aria-pressed="false" disabled>${index + 1} · ${label}</button>`).join('')}
      </fieldset>
      <fieldset class="voice-encouragement"><legend>送一句鼓励</legend>
        ${[t('加油，再试一次'),t('你已经很接近了'),t('非常好'),t('非常标准')].map(text => `<button type="button" data-encouragement="${text}" aria-pressed="false" disabled>${text}</button>`).join('')}
      </fieldset>
      <p class="voice-review-result" role="status" hidden></p>
    </details>
    <p class="voice-note">练习参考只反映录音音量和时长，不是发音分数，也不能判断舌头位置。</p>`;
  container.append(panel);
  const button = name => panel.querySelector(`[data-voice="${name}"]`);
  const status = panel.querySelector('.voice-status'), metrics = panel.querySelector('.voice-metrics');
  const reviewResult = panel.querySelector('.voice-review-result');
  const reviewButtons = [...panel.querySelectorAll('[data-rating], [data-encouragement]')];
  const own = new Audio(), example = new Audio();
  example.defaultPlaybackRate=example.playbackRate=DEMONSTRATION_RATE;example.preservesPitch=true;
  let disposed = false, token = 0, current = null, url = null, lessonId;
  const supported = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder && (window.AudioContext || window.webkitAudioContext));
  function message(text) { if (!disposed) status.textContent = text; }
  function notify(event) {
    try { Promise.resolve(onActivity(event)).catch(() => {}); } catch {}
  }
  function exampleURL() {
    const lesson = getLesson();
    if (lesson && Object.hasOwn(lesson, 'exampleURL')) return typeof lesson.exampleURL === 'string' ? lesson.exampleURL.trim() : null;
    return LESSONS[lesson?.id] ? lessonAudioURL(lesson.id) : null;
  }
  function pauseAudio() { own.pause(); example.pause(); }
  function render() {
    button('record').textContent = current?.pending ? t('取消等待') : current ? t('结束录音') : t('开始录音');
    button('record').disabled = !supported || !getLesson();
    button('record').setAttribute('aria-pressed', String(!!current));
    button('replay').disabled = !url || !!current;
    button('delete').disabled = !url || !!current;
    button('example').disabled = !!current || !exampleURL();
    reviewButtons.forEach(control => control.disabled = !url || !!current);
  }
  function release(session) {
    clearTimeout(session.timer); clearInterval(session.clock);
    session.stream?.getTracks().forEach(track => track.stop());
    if (session.context?.state !== 'closed') session.context?.close().catch(() => {});
  }
  function stop() {
    token++; pauseAudio();
    if (current) {
      const session = current; current = null;
      if (session.recorder?.state === 'recording') session.recorder.stop();
      release(session); message(t('录音已取消，可以重新开始。'));
    }
    render();
  }
  function removeRecording(reason = 'replace') {
    own.pause(); own.removeAttribute('src'); own.load();
    const deleted = !!url;
    if (url) URL.revokeObjectURL(url);
    url = null; metrics.hidden = true; metrics.textContent = '';
    reviewResult.hidden = true; reviewResult.textContent = '';
    reviewButtons.forEach(control => control.setAttribute('aria-pressed', 'false'));
    render();
    if (deleted) notify({type:'deleted', lessonId, reason});
  }
  function syncLesson() {
    const lesson = getLesson();
    if (lesson?.id !== lessonId) {
      stop(); removeRecording('lesson'); lessonId = lesson?.id;
      panel.querySelector('.voice-hint').textContent = lesson?.hint ? t("口型练习：{0}", lesson.hint) : t('先选择一个练习。');
      message(supported ? t('准备好后，点开始录音。') : t('这个浏览器暂不支持录音，请使用新版 Edge、Chrome 或 Safari。'));
      render();
    }
  }
  async function finish(session) {
    release(session);
    if (session.token !== token || disposed) return;
    current = null; render(); message(t('录音完成，正在整理练习参考…'));
    let context;
    try {
      const blob = new Blob(session.chunks, {type:session.recorder.mimeType || 'audio/webm'});
      if (!blob.size) throw new Error('empty');
      const Context = window.AudioContext || window.webkitAudioContext;
      context = new Context();
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      if (session.token !== token || disposed) return;
      const samples = new Float32Array(decoded.length);
      for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
        const data = decoded.getChannelData(channel);
        for (let i = 0; i < samples.length; i++) samples[i] += data[i] / decoded.numberOfChannels;
      }
      const analysis = analyzeVoice(samples, decoded.sampleRate);
      removeRecording('replace'); url = URL.createObjectURL(blob); own.src = url;
      const volume = analysis.peak >= .98 ? t('偏响') : analysis.rms < .015 || analysis.silenceRatio > .85 ? t('偏轻') : t('适中');
      metrics.textContent = t("练习参考 · 录音时长 {0} 秒 · 音量{1} · {2}", analysis.duration.toFixed(1), volume, analysis.silenceRatio > .5 ? t('轻声或停顿片段较多') : t('轻声或停顿片段较少'));
      metrics.hidden = false; message(analysis.advice); render();
      Promise.resolve().then(() => {
        if (session.token === token && !disposed) return onActivity({type:'recorded', lessonId:session.lessonId, analysis, blob});
      })
        .catch(() => { if (session.token === token) message(t('录音已保留，后续反馈暂时未完成。可以先回听自己的声音。')); });
    } catch {
      if (session.token === token && !disposed) {
        message(t('这次录音无法读取，请重新录一遍。'));
        notify({type:'error', lessonId:session.lessonId});
      }
    } finally { if (context) await context.close().catch(() => {}); }
  }
  function endRecording(session) {
    if (session !== current || !session.recorder || session.recorder.state !== 'recording') return;
    session.recorder.stop(); release(session);
    button('record').disabled = true;
  }
  async function start({autoStop = false} = {}) {
    syncLesson();
    if (current) { current.pending ? stop() : endRecording(current); return; }
    const lesson = getLesson(); if (!lesson || disposed || document.hidden) return;
    if (!supported) { notify({type:'error', lessonId:lesson.id}); return; }
    pauseAudio(); onBeforeAudio();
    const session = {token:++token, lessonId:lesson.id, pending:true, chunks:[]};
    current = session; render(); message(t('请允许使用麦克风。'));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      if (session.token !== token || disposed || document.hidden || getLesson()?.id !== session.lessonId) {
        stream.getTracks().forEach(track => track.stop());
        if (session.token === token && !disposed) stop();
        return;
      }
      session.stream = stream;
      let analyser, frame, heard = 0, quietSince = null;
      if (autoStop) {
        const Context = window.AudioContext || window.webkitAudioContext;
        session.context = new Context();
        await session.context.resume();
        if (session.token !== token || disposed) { release(session); return; }
        analyser = session.context.createAnalyser(); analyser.fftSize = 2048;
        session.context.createMediaStreamSource(stream).connect(analyser);
        frame = new Float32Array(analyser.fftSize);
      }
      session.pending = false;
      const recorder = session.recorder = new MediaRecorder(stream);
      recorder.ondataavailable = event => { if (event.data.size) session.chunks.push(event.data); };
      recorder.onstop = () => finish(session);
      recorder.onerror = () => {
        if (session.token !== token || disposed) return;
        stop(); message(t('录音设备出现问题，请检查麦克风后重试。'));
        notify({type:'error', lessonId:session.lessonId});
      };
      recorder.start();
      const started = performance.now();
      session.clock = setInterval(() => {
        message(t("正在录音 · {0} / 15 秒{1}", Math.floor((performance.now()-started)/1000), autoStop ? t('，读完后稍停会自动结束。') : t('，再点一次结束。')));
        if (analyser) {
          analyser.getFloatTimeDomainData(frame);
          const rms = Math.sqrt(frame.reduce((sum, value) => sum + value * value, 0) / frame.length);
          if (rms >= .015) { heard += .25; quietSince = null; }
          else if (heard >= .4) {
            quietSince ??= performance.now();
            if (performance.now() - quietSince >= 1200) endRecording(session);
          }
        }
      }, 250);
      session.timer = setTimeout(() => endRecording(session), 15000);
      render(); message(t('正在录音 · 0 / 15 秒，再点一次结束。'));
    } catch (error) {
      if (session.token !== token || disposed) return;
      release(session); current = null; render();
      message(error.name === 'NotAllowedError' || error.name === 'SecurityError'
        ? t('麦克风权限未开启。请在浏览器地址栏允许麦克风，再试一次。')
        : error.name === 'NotFoundError' ? t('没有找到麦克风，请连接或开启麦克风后重试。')
        : t('麦克风暂时无法使用，请确认没有被其他应用占用。'));
      notify({type:'error', lessonId:session.lessonId});
    }
  }
  async function play(player, source) {
    syncLesson(); if (current || disposed) return;
    pauseAudio(); onBeforeAudio(); if (source) player.src = source;
    const playToken = token;
    try { player.currentTime = 0; await player.play(); }
    catch { if (playToken === token && !disposed) message(t('声音暂时无法播放，请重试。')); }
  }
  button('record').onclick = () => start();
  button('replay').onclick = () => play(own);
  button('example').onclick = () => {
    const source = exampleURL();
    if (source) play(example, source);
  };
  button('delete').onclick = () => { removeRecording('user'); message(t('录音已删除。')); };
  reviewButtons.forEach(control => control.onclick = () => {
    if (!url || current) return;
    const group = control.hasAttribute('data-rating') ? '[data-rating]' : '[data-encouragement]';
    panel.querySelectorAll(group).forEach(button => button.setAttribute('aria-pressed', String(button === control)));
    const rating = panel.querySelector('[data-rating][aria-pressed="true"]');
    const encouragement = panel.querySelector('[data-encouragement][aria-pressed="true"]');
    const feedback = [rating ? t("{0} / 5 分（{1}）", rating.dataset.rating, rating.textContent.split(' · ')[1]) : '', encouragement?.dataset.encouragement].filter(Boolean).join(t('；'));
    const hint = getLesson()?.hint;
    reviewResult.textContent = t("人工点评：{0}{1}", feedback, hint ? t("。练习建议：{0}", hint) : '');
    reviewResult.hidden = false;
  });
  const hide = () => { if (document.hidden) stop(); };
  const leave = () => {stop();removeRecording('leave');};
  document.addEventListener('visibilitychange', hide);
  window.addEventListener('pagehide', leave);
  const watch = setInterval(() => { if (!panel.isConnected) dispose(); else syncLesson(); }, 250);
  syncLesson(); render();
  if (!supported) message(t('这个浏览器暂不支持录音，请使用新版 Edge、Chrome 或 Safari。'));
  function dispose() {
    if (disposed) return;
    stop(); removeRecording('dispose'); disposed = true; clearInterval(watch);
    document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', leave);
    own.removeAttribute('src'); example.removeAttribute('src'); own.load(); example.load(); panel.remove();
  }
  return {start, stop, dispose};
}
