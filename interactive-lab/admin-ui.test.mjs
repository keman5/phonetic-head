import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from './server.mjs';
import {launchBrowser} from './browser-test-utils.mjs';

async function setup(t,options={}) {
  const dataDir=await mkdtemp(join(tmpdir(),'phonetic-admin-ui-'));
  const app=createApp({dataDir,...options});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  t.after(async()=>{await browser.close();await new Promise(resolve=>app.close(resolve));await rm(dataDir,{recursive:true,force:true});assert.deepEqual(errors,[]);});
  const base='http://127.0.0.1:'+app.address().port;
  await page.goto(base+'/admin.html');await page.locator('#login-password').fill('111111');await page.locator('#login-form button').click();
  await page.locator('#current-password').fill('111111');await page.locator('#new-password').fill('Admin-UI-password-9!');await page.locator('#confirm-password').fill('Admin-UI-password-9!');await page.locator('#password-form button[type=submit]').click();
  await page.locator('#login-password').fill('Admin-UI-password-9!');await page.locator('#login-form button').click();
  await page.waitForFunction(()=>document.querySelector('#course-list button')&&!document.body.classList.contains('busy'));
  return {browser,page,base,errors};
}
async function settled(page,pattern) {
  await page.waitForFunction(()=>!document.body.classList.contains('busy'));
  assert.match(await page.locator('#status').textContent(),pattern);
}

test('administrator creates, edits, uploads and publishes a course that students can play',{timeout:120000},async t=>{
  const {page,browser,base,errors}=await setup(t);
  assert.equal(await page.locator('#course-list button').count(),10);
  await page.locator('.new-course summary').click();await page.locator('#new-course-id').fill('morning-greeting');await page.locator('#new-course-form button').click();await settled(page,/新课程草稿/);
  await page.locator('#course-title').fill('日常 "问候" 练习');await page.locator('.scene-editor summary').click();
  await page.locator('#scene-place').fill('和朋友打招呼');await page.locator('#scene-question').fill('遇到朋友时，可以怎样打招呼？');await page.locator('#scene-choices').fill('你好，我的朋友\n我喜欢牛奶\n这是一只猫');await page.locator('#scene-answer').fill('你好，我的朋友');
  await page.locator('#stage-tabs button').nth(3).click();await page.locator('#lesson-text').fill('Hello, my friend!');await page.locator('#lesson-translation').fill('你好，我的朋友！');await page.locator('#lesson-hint').fill('先听完整句，再友好地向朋友问好。');
  await page.locator('#publish').click();await settled(page,/重新配音/);
  const audio=await readFile(new URL('./dist/assets/audio/female/lesson-dog-sentence.wav',import.meta.url));
  for(const voice of ['female','male']){
    await page.locator('#audio-voice').selectOption(voice);
    await page.locator('#upload-audio').setInputFiles({name:'greeting.wav',mimeType:'audio/wav',buffer:audio});await settled(page,/录音已上传/);
  }
  await page.locator('#audio-preview').evaluate(audio=>audio.play());
  await page.waitForFunction(()=>document.querySelector('#audio-preview').currentTime>0);await page.locator('#audio-preview').evaluate(audio=>audio.pause());
  const student=await browser.newPage();student.on('pageerror',error=>errors.push(error.message));await student.route('**/lab.html?**',route=>route.abort());
  await student.goto(base+'/');await student.waitForSelector('.course-card');assert.equal(await student.locator('.course-card').count(),10,'Draft is not yet public');
  await page.locator('#publish').click();await settled(page,/课程已发布/);
  await student.reload();await student.waitForSelector('a[href="./learn.html?course=morning-greeting"].course-card');assert.equal(await student.locator('.course-card').count(),11);
  assert.equal(await student.locator('a[href="./learn.html?course=morning-greeting"].course-card progress').getAttribute('aria-label'),'日常 "问候" 练习学习进度');
  await student.locator('a[href="./learn.html?course=morning-greeting"].course-card').click();await student.locator('#text-mode').click();
  assert.equal(await student.locator('#reading-text').textContent(),'Hello,myfriend!');
  await student.locator('#demo').click();await student.waitForFunction(()=>document.querySelector('#scrub').value>0);
  assert.equal(await student.locator('#demo-rate').inputValue(),'1');
  await student.waitForFunction(()=>!document.querySelector('#next').disabled);
  await mkdir('qa/admin',{recursive:true});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'qa/admin/desktop.png',fullPage:true});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await page.screenshot({path:'qa/admin/mobile.png',fullPage:true});
});

test('configured dynamic voice stays idle until play, updates timing, caches and works in recording practice',{timeout:180000},async t=>{
  let calls=0;
  const wave=await readFile(new URL('./dist/assets/audio/female/lesson-dog-sentence.wav',import.meta.url));
  const {page,browser,base,errors}=await setup(t,{fetchImpl:async(url,options)=>{calls++;assert.match(url,/southeastasia\.tts\.speech\.microsoft\.com/);assert.match(options.body,/<voice name="en-GB-SoniaNeural">/);return new Response(wave);}});
  await page.locator('#tab-settings').click();await page.locator('#azure-key').fill('test-key');await page.locator('#azure-region').fill('southeastasia');await page.locator('#settings-form button[type=submit]').click();await settled(page,/语音配置已保存/);assert.equal(await page.locator('#azure-key').inputValue(),'');
  await page.locator('#tab-courses').click();await page.locator('#stage-tabs button').nth(3).click();await page.locator('#audio-source').selectOption('azure');await page.locator('#audio-mode').selectOption('dynamic');await page.locator('#publish').click();await settled(page,/课程已发布/);assert.equal(calls,0);
  const student=await browser.newPage();student.on('pageerror',error=>errors.push(error.message));
  await student.addInitScript(()=>{const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.playedAudio=this;return play.call(this);};});
  await student.goto(base+'/learn.html?course=dog');
  await student.waitForFunction(()=>document.querySelector('#model-frame').contentWindow.teachingPlayer?.ready,{}, {timeout:90000});assert.equal(calls,0);
  await student.locator('#demo').click();await student.waitForFunction(()=>document.querySelector('#model-frame').contentWindow.labSnapshot().audio.currentTime>0);assert.equal(calls,1);
  await student.locator('#text-mode').click();
  await student.locator('#demo').click();await student.waitForFunction(()=>window.playedAudio?.currentTime>0);assert.equal(calls,1);
  const entry=await student.evaluate(async()=>{const {curriculumCatalog}=await import('./audio.js');return (await curriculumCatalog).voices.female.entries['lesson-dog-sentence'];});
  assert.equal(entry.engine,'azure');assert.equal(entry.timingSource,'estimated');assert(entry.clips.length>0);
  await student.locator('#pause').click();await student.locator('#demo').click();assert.equal(calls,1);
  await student.goto(base+'/practice.html?course=dog');await student.locator('[data-voice=example]').click();await student.waitForFunction(()=>window.playedAudio?.currentTime>0);assert.equal(calls,1);
  assert.match(await student.evaluate(()=>window.playedAudio.currentSrc),/\/api\/lesson-audio\/dog-sentence\/female\/file/);
});
