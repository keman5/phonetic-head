import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launchBrowser} from './browser-test-utils.mjs';

async function mount(page) {
  await page.goto('http://127.0.0.1:4173/voice-practice.js');
  await page.setContent('<main id="practice"></main>');
  await page.evaluate(async () => {
    window.lesson = {id:'dog-word', hint:'连起来读 dog。'};
    window.activities = []; window.recordings = []; window.revoked = []; window.beforeAudio = 0;
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = url => { revoked.push(url); revoke(url); };
    const {mountVoicePractice} = await import('/voice-practice.js');
    window.mount = () => window.practice = mountVoicePractice(document.querySelector('main'), {
      getLesson:() => lesson, onBeforeAudio:() => beforeAudio++,
      onActivity:event => {
        const data = {...event, blobSize:event.blob?.size, blob:null};
        activities.push(data); if (event.type === 'recorded') recordings.push(data);
      }
    });
    mount();
  });
}

test('local microphone lifecycle: permission errors, late permission cancellation, real PCM recording and cleanup', {timeout:30000}, async t => {
  const browser = await launchBrowser(); t.after(() => browser.close());
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mount(page);
  assert.equal(await page.locator('[data-rating="5"]').isEnabled(), false);
  assert.equal(await page.locator('.voice-review-result').isVisible(), false);
  await page.evaluate(() => navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); });
  await page.locator('[data-voice="record"]').click();
  await page.waitForFunction(() => document.querySelector('.voice-status').textContent.includes('权限未开启'));
  assert.equal(await page.evaluate(() => activities.at(-1).type), 'error');
  await page.evaluate(() => navigator.mediaDevices.getUserMedia = () => new Promise(resolve => window.grant = resolve));
  await page.locator('[data-voice="record"]').click();
  await page.locator('[data-voice="record"]').click();
  await page.evaluate(() => { window.tracksStopped = 0; grant({getTracks:() => [{stop:() => tracksStopped++}]}); });
  await page.waitForFunction(() => tracksStopped === 1);
  assert.equal(await page.locator('[data-voice="record"]').innerText(), '开始录音');
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      window.sourceContext = new AudioContext();
      const oscillator = sourceContext.createOscillator(); oscillator.frequency.value = 220;
      const gain = sourceContext.createGain(); gain.gain.value = .2;
      const destination = sourceContext.createMediaStreamDestination();
      oscillator.connect(gain).connect(destination); oscillator.start();
      window.recordingStream = destination.stream;
      return destination.stream;
    };
  });
  await page.locator('[data-voice="record"]').click();
  await page.waitForTimeout(650);
  await page.locator('[data-voice="record"]').click();
  await page.waitForFunction(() => recordings.length === 1);
  const result = await page.evaluate(() => ({event:recordings[0], tracks:recordingStream.getTracks().map(track => track.readyState), beforeAudio}));
  assert.equal(result.event.lessonId, 'dog-word'); assert(result.event.blobSize > 100);
  assert(result.event.analysis.rms > .05); assert(Math.abs(result.event.analysis.pitchHz - 220) < 3);
  assert.deepEqual(result.tracks, ['ended']); assert(result.beforeAudio > 0);
  assert.equal(await page.locator('[data-voice="replay"]').isEnabled(), true);
  assert.match(await page.locator('.voice-metrics').innerText(), /录音时长.*音量适中/);
  assert.doesNotMatch(await page.locator('.voice-metrics').innerText(), /RMS|峰值|0\.\d{3}|%/);
  assert.equal(await page.locator('.voice-review-result').innerText(), '');
  await page.locator('.voice-review summary').click();
  await page.locator('[data-rating="3"]').click();
  await page.locator('[data-encouragement="你已经很接近了"]').click();
  assert.match(await page.locator('.voice-review-result').innerText(), /人工点评：3 \/ 5 分.*你已经很接近了/);
  await page.locator('[data-voice="delete"]').click();
  assert.deepEqual(await page.evaluate(() => {const {type, lessonId, reason} = activities.at(-1); return {type, lessonId, reason};}), {type:'deleted', lessonId:'dog-word', reason:'user'});
  assert.equal(await page.locator('.voice-review-result').innerText(), '');
  assert.equal(await page.locator('.voice-review-result').isVisible(), false);
  assert.equal(await page.locator('[data-rating="3"]').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('[data-rating="3"]').isEnabled(), false);
  assert.equal(await page.evaluate(() => revoked.length), 1);
  assert.equal(await page.locator('[data-voice="replay"]').isEnabled(), false);
  await page.evaluate(() => sourceContext.close());
  await page.locator('[data-voice="record"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-voice="record"]').click();
  await page.waitForFunction(() => recordings.length === 2);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
  assert.equal(await page.evaluate(() => activities.at(-1).reason), 'leave');
  assert.equal(await page.locator('[data-voice="replay"]').isEnabled(), false);
  assert.equal(await page.locator('.voice-practice').count(), 1, 'cached pages keep usable controls without keeping recordings');
  await page.evaluate(() => sourceContext.close());
  await page.locator('[data-voice="record"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-voice="record"]').click();
  await page.waitForFunction(() => recordings.length === 3);
  await page.evaluate(() => { practice.dispose(); sourceContext.close(); });
  assert.equal(await page.locator('.voice-practice').count(), 0);
  assert.deepEqual(errors, []);
});

test('automatic silence stop and lesson changes end microphone tracks without stale results', {timeout:30000}, async t => {
  const browser = await launchBrowser(); t.after(() => browser.close());
  const page = await browser.newPage(); await mount(page);
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      window.sourceContext = new AudioContext();
      const oscillator = sourceContext.createOscillator(); oscillator.frequency.value = 220;
      const gain = sourceContext.createGain(); gain.gain.value = .2;
      const destination = sourceContext.createMediaStreamDestination();
      oscillator.connect(gain).connect(destination); oscillator.start();
      setTimeout(() => gain.gain.value = 0, 1000);
      window.recordingStream = destination.stream;
      return destination.stream;
    };
    practice.start({autoStop:true});
  });
  await page.waitForFunction(() => recordings.length === 1, {}, {timeout:8000});
  assert(await page.evaluate(() => recordings[0].analysis.duration < 5));
  await page.evaluate(() => { sourceContext.close(); practice.start(); });
  await page.waitForFunction(() => document.querySelector('[data-voice="record"]').textContent === '结束录音');
  await page.evaluate(() => lesson = {id:'cat-word', hint:'读 cat。'});
  await page.waitForFunction(() => document.querySelector('.voice-hint').textContent.includes('cat'));
  assert.equal(await page.evaluate(() => recordingStream.getTracks()[0].readyState), 'ended');
  assert.equal(await page.evaluate(() => recordings.length), 1);
  assert.deepEqual(await page.evaluate(() => {const {type, lessonId, reason} = activities.at(-1); return {type, lessonId, reason};}), {type:'deleted', lessonId:'dog-word', reason:'lesson'});
  assert.equal(await page.locator('[data-voice="replay"]').isEnabled(), false);
  await page.evaluate(() => { practice.dispose(); sourceContext.close(); });
});

test('15-second limit and background cancellation release tracks; missing devices are explained', {timeout:30000}, async t => {
  const browser = await launchBrowser(); t.after(() => browser.close());
  const page = await browser.newPage(); await mount(page);
  await page.evaluate(() => lesson = {id:'sing-a3', hint:'轻轻哼唱。', exampleURL:null});
  await page.waitForFunction(() => document.querySelector('[data-voice="example"]').disabled);
  await page.evaluate(() => lesson = {id:'sing-custom', hint:'轻轻哼唱。', exampleURL:'./assets/audio/female/ipa-m.wav'});
  await page.waitForFunction(() => !document.querySelector('[data-voice="example"]').disabled);
  const sampleRequest = page.waitForRequest('**/assets/audio/female/ipa-m.wav');
  await page.locator('[data-voice="example"]').click(); await sampleRequest;
  await page.evaluate(() => lesson = {id:'unknown', hint:''});
  await page.waitForFunction(() => document.querySelector('[data-voice="example"]').disabled);
  await page.evaluate(() => lesson = {id:'dog-word', hint:'连起来读 dog。'});
  await page.waitForFunction(() => !document.querySelector('[data-voice="example"]').disabled);
  await page.evaluate(() => navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Missing', 'NotFoundError'); });
  await page.locator('[data-voice="record"]').click();
  await page.waitForFunction(() => document.querySelector('.voice-status').textContent.includes('没有找到麦克风'));
  assert.equal(await page.evaluate(() => activities.at(-1).type), 'error');
  await page.clock.install();
  await page.evaluate(() => {
    window.trackStops = 0; window.recorderStops = 0;
    navigator.mediaDevices.getUserMedia = async () => ({getTracks:() => [{stop:() => trackStops++}]});
    window.MediaRecorder = class {
      state = 'inactive';
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; recorderStops++; this.onstop?.(); }
    };
    practice.start();
  });
  await page.clock.runFor(15000);
  assert.equal(await page.evaluate(() => recorderStops), 1);
  assert(await page.evaluate(() => trackStops >= 1));
  await page.evaluate(() => practice.start());
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {configurable:true, value:true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.evaluate(() => recorderStops), 2);
  assert.equal(await page.evaluate(() => recordings.length), 0);
  assert.equal(await page.locator('[data-voice="record"]').innerText(), '开始录音');
  await page.evaluate(() => practice.dispose());
});
