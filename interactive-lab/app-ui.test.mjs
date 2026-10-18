import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {launchBrowser} from './browser-test-utils.mjs';
import {LESSON_SERIES,LESSONS} from './dist/curriculum.js';

const origin = process.env.TEST_APP_URL || 'http://127.0.0.1:4174';

test('home, speech, singing and lab stay honest, accessible and responsive', {timeout:180000}, async t => {
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(() => {
    window.testMicrophoneRequests = 0;
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => {
      window.testMicrophoneRequests++;
      throw new DOMException('Test deliberately denies microphone access', 'NotAllowedError');
    };
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mkdir('qa', {recursive:true});
  async function responsive(label) {
    for (const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:1000});
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: ${width}px overflow`);
    }
    await page.evaluate(() => { window.scrollTo(0,0); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  }
  await t.test('ten courses, search, empty completion filter and calendar never invent study records', async () => {
    await page.goto(origin+'/',{waitUntil:'networkidle'});
    assert.equal(await page.locator('.course-card').count(),10);
    assert.equal(await page.locator('#overall').innerText(),'0 / 10 课已完成');
    assert.equal(await page.locator('#streak').innerText(),'0 天');
    assert.equal(await page.locator('[data-done=true]').count(),0);
    assert.match(await page.locator('#checkin-state').innerText(),/完成一课.*即可打卡/);
    await page.locator('#course-search').fill('dog');
    assert.equal(await page.locator('.course-card').count(),1);
    assert.match(await page.locator('.course-card').innerText(),/big dog/);
    await page.locator('#course-search').fill('nonexistent word');
    assert.equal(await page.locator('#search-empty').isVisible(),true);
    await page.locator('#course-search').fill('');
    await page.locator('[data-filter=done]').click();
    assert.equal(await page.locator('.course-card').count(),0);
    assert.equal(await page.locator('#search-empty').isVisible(),true);
    await page.locator('[data-filter=all]').click();
    const month = await page.locator('#calendar-month').innerText();
    await page.locator('#calendar-prev').click();
    assert.notEqual(await page.locator('#calendar-month').innerText(),month);
    await page.locator('#calendar-next').click();
    assert.equal(await page.locator('#calendar-month').innerText(),month);
    assert.equal(await page.locator('#calendar-days [aria-current=date]').count(),1);
    await page.locator('#calendar-days [aria-current=date]').click();
    assert.equal(await page.locator('[data-done=true]').count(),0);
    assert.equal(await page.evaluate(() => localStorage.getItem('phonetic-study-plan-v1')),null);
    await responsive('home');
    await page.screenshot({path:'qa/app-home-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'qa/app-home-mobile.png',fullPage:true});
  });
  await t.test('all course stages and disconnected AI show real state without invented scores', async () => {
    await page.route('**/api/coach/status', route => route.fulfill({json:{configured:false}}));
    await page.goto(origin+'/practice.html',{waitUntil:'networkidle'});
    assert.equal(await page.locator('#practice-topics button').count(),10);
    assert.equal(await page.locator('.coach-state').innerText(),'在线教练未连接');
    assert.equal(await page.locator('[data-send-text]').isDisabled(),true);
    assert.equal(await page.locator('[data-talk]').isDisabled(),true);
    assert.equal(await page.locator('.voice-metrics').isVisible(),false);
    assert.match(await page.locator('.voice-note').innerText(),/不是发音分数/);
    assert.doesNotMatch(await page.locator('.coach-chat').innerText(),/\d+%|\d+分/);
    for (const [index,series] of LESSON_SERIES.entries()) {
      await page.locator('#practice-topics button').nth(index).click();
      for (let stage=0;stage<4;stage++) {
        await page.locator('#practice-stages button').nth(stage).click();
        assert.equal(await page.locator('#practice-context h2').innerText(),LESSONS[series.lessonIds[stage]].text);
        assert.equal(await page.locator('#practice-stages button').nth(stage).getAttribute('aria-pressed'),'true');
      }
    }
    assert.equal(await page.evaluate(() => testMicrophoneRequests),0);
    await responsive('speech');
    await page.screenshot({path:'qa/app-speech-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'qa/app-speech-mobile.png',fullPage:true});
  });
  await t.test('online text and continuous recording require consent and explicit action', async () => {
    await page.unroute('**/api/coach/status');
    await page.route('**/api/coach/status', route => route.fulfill({json:{configured:true}}));
    const requests=[];
    await page.route('**/api/coach', async route => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({json:{transcript:'I like dogs.',matchPercent:null,reply:'You can say: I like big dogs.'}});
    });
    await page.goto(origin+'/practice.html',{waitUntil:'networkidle'});
    assert.equal(await page.locator('.coach-state').innerText(),'在线教练已配置');
    await page.locator('textarea').fill('I like dogs.');
    assert.equal(await page.locator('[data-send-text]').isDisabled(),true);
    assert.equal(await page.locator('[data-talk]').isDisabled(),true);
    assert.equal(requests.length,0);
    assert.equal(await page.evaluate(() => testMicrophoneRequests),0);
    await page.locator('[data-consent]').check();
    assert.equal(requests.length,0);
    assert.equal(await page.evaluate(() => testMicrophoneRequests),0);
    await page.locator('[data-speak]').uncheck();
    await page.locator('[data-send-text]').click();
    await page.waitForFunction(() => document.querySelector('.coach-chat').textContent.includes('I like big dogs.'));
    assert.equal(requests.length,1);
    assert.equal(requests[0].text,'I like dogs.');
    assert.equal(requests[0].mode,'conversation');
    assert.equal('audio' in requests[0],false);
    await page.locator('[data-talk]').click();
    await page.waitForFunction(() => testMicrophoneRequests===1);
    assert.match(await page.locator('.voice-status').innerText(),/麦克风权限未开启/);
    assert.equal(requests.length,1);
    await page.locator('[data-consent]').uncheck();
    assert.equal(await page.locator('[data-talk]').isDisabled(),true);
    assert.equal(await page.locator('[data-stop]').isVisible(),false);
  });
  await t.test('singing is a pitch exercise, never automatically records or fabricates a result', async () => {
    await page.goto(origin+'/practice.html?mode=sing',{waitUntil:'networkidle'});
    assert.equal(await page.locator('#sing-reference').isVisible(),true);
    assert.equal(await page.locator('#ai-coach').isVisible(),false);
    assert.equal(await page.locator('#practice-stages').isVisible(),false);
    assert.match(await page.locator('#sing-reference').innerText(),/不是完整歌曲教学/);
    assert.equal(await page.locator('#pitch-result').innerText(),'');
    assert.equal(await page.evaluate(() => testMicrophoneRequests),0);
    await page.locator('#play-note').click();
    assert.equal(await page.evaluate(() => testMicrophoneRequests),0);
    await responsive('singing');
    await page.screenshot({path:'qa/app-singing-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'qa/app-singing-mobile.png',fullPage:true});
  });
  await t.test('lab hosts a real recorder while embedded lessons hide it', async () => {
    await page.goto(origin+'/lab.html',{waitUntil:'networkidle'});
    await page.waitForFunction(() => window.labSnapshot?.().ready,{}, {timeout:60000});
    assert.equal(await page.locator('#voice-practice .voice-practice').count(),1);
    assert.equal(await page.locator('#voice-practice [data-voice=record]').isVisible(),true);
    assert.equal(await page.evaluate(() => testMicrophoneRequests),0);
    await responsive('lab');
    await page.locator('#voice-practice').scrollIntoViewIfNeeded();
    await page.screenshot({path:'qa/app-lab-recorder.png'});
    await page.goto(origin+'/lab.html?embed=1',{waitUntil:'networkidle'});
    assert.equal(await page.locator('#voice-practice').isVisible(),false);
  });
  assert.deepEqual(errors,[]);
});
