import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launchBrowser} from './browser-test-utils.mjs';

const origin = process.env.TEST_APP_URL || 'http://127.0.0.1:4174';
const reply = {transcript:'This is a big dog.',matchPercent:null,reply:'Try saying the whole sentence smoothly.'};

async function openPractice(browser,t,{delay=false,failFirst=false}={}) {
  const page=await browser.newPage();
  t.after(()=>page.close());
  const requests=[],pending=[],errors=[];
  let received;
  const firstRequest=new Promise(resolve=>received=resolve);
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    window.microphoneCalls=0;window.sources=[];window.permissionPending=false;window.silenceAfter=0;
    window.makeTestStream=()=>{
      const context=new AudioContext(),oscillator=context.createOscillator(),gain=context.createGain(),destination=context.createMediaStreamDestination();
      oscillator.frequency.value=220;gain.gain.value=.2;oscillator.connect(gain).connect(destination);oscillator.start();
      sources.push({context,stream:destination.stream});
      if(silenceAfter)setTimeout(()=>gain.gain.value=0,silenceAfter);
      return destination.stream;
    };
    navigator.mediaDevices.getUserMedia=async()=>{
      microphoneCalls++;
      if(permissionPending)return new Promise(resolve=>window.grantPermission=()=>resolve(makeTestStream()));
      return makeTestStream();
    };
  });
  await page.route('**/api/coach/status',route=>route.fulfill({json:{configured:true}}));
  await page.route('**/api/coach',async route=>{
    requests.push(route.request().postDataJSON());
    received();
    if(delay){pending.push(route);return;}
    if(failFirst&&requests.length===1)return route.fulfill({status:503,json:{error:'测试服务暂时不可用，请重试。'}});
    await route.fulfill({json:reply});
  });
  await page.goto(origin+'/practice.html',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('.coach-state').textContent==='在线教练已配置');
  await page.locator('[data-speak]').uncheck();
  t.after(async()=>{
    if(!page.isClosed())await page.evaluate(()=>Promise.all(sources.map(({context,stream})=>{stream.getTracks().forEach(track=>track.stop());return context.state==='closed'?null:context.close();})));
    assert.deepEqual(errors,[]);
  });
  return {page,requests,pending,firstRequest};
}
async function record(page){
  await page.locator('[data-voice=record]').click();
  await page.waitForFunction(()=>document.querySelector('[data-voice=record]').textContent==='结束录音');
  // A real MediaRecorder needs audio frames before its decoder can read the result.
  await page.waitForTimeout(650);
  await page.locator('[data-voice=record]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-voice=replay]').disabled);
}
async function quietUI(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}

test('manual audio stays local until consent and send; deletion clears upload state; sound-stage uploads are disabled',{timeout:30000},async t=>{
  const browser=await launchBrowser();t.after(()=>browser.close());
  const {page,requests}=await openPractice(browser,t);
  await record(page);
  assert.equal(requests.length,0);
  assert.equal(await page.locator('[data-send-audio]').isDisabled(),true);
  await page.locator('[data-consent]').check();await quietUI(page);
  assert.equal(requests.length,0);
  assert.equal(await page.locator('[data-send-audio]').isEnabled(),true);
  await page.locator('[data-send-audio]').click();
  await page.waitForFunction(()=>document.querySelector('.coach-chat').textContent.includes('smoothly'));
  assert.equal(requests.length,1);assert.equal(requests[0].lessonId,'dog-sentence');assert.equal(requests[0].mode,'practice');
  assert(requests[0].audio.length>100);assert.match(requests[0].mime,/audio\//);
  assert.equal(await page.evaluate(()=>microphoneCalls),1);
  await page.locator('[data-voice=delete]').click();
  assert.equal(await page.locator('[data-send-audio]').isDisabled(),true);
  assert.equal(await page.locator('[data-voice=replay]').isDisabled(),true);
  await page.locator('#practice-stages button').first().click();
  await record(page);
  assert.equal(await page.locator('[data-send-audio]').isDisabled(),true);
  assert.equal(requests.length,1);
});

for(const action of ['example','record'])test(`local ${action} cancels a delayed continuous reply without reopening the microphone`,{timeout:30000},async t=>{
  const browser=await launchBrowser();t.after(()=>browser.close());
  const {page,requests,pending,firstRequest}=await openPractice(browser,t,{delay:true});
  await page.locator('[data-consent]').check();
  await page.evaluate(()=>silenceAfter=800);
  await page.locator('[data-talk]').click();
  await firstRequest;
  assert.equal(requests.length,1);assert.equal(requests[0].mode,'conversation');
  assert.equal(await page.evaluate(()=>microphoneCalls),1);
  await page.evaluate(()=>silenceAfter=0);
  await page.locator(`[data-voice=${action}]`).click();
  assert.equal(await page.locator('[data-stop]').isVisible(),false);
  if(action==='record'){
    await page.waitForFunction(()=>microphoneCalls===2);
    await page.waitForTimeout(650);
    await page.locator('[data-voice=record]').click();
    await page.waitForFunction(()=>!document.querySelector('[data-voice=replay]').disabled);
  }
  await pending[0].fulfill({json:{...reply,reply:'STALE REPLY MUST NOT APPEAR'}}).catch(()=>{});
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>microphoneCalls),action==='record'?2:1);
  assert.equal(requests.length,1);
  assert.doesNotMatch(await page.locator('.coach-chat').innerText(),/STALE REPLY/);
  assert.equal(await page.locator('[data-talk]').isEnabled(),true);
});

test('cancelling a pending coach permission request cannot make a later local recording upload',{timeout:30000},async t=>{
  const browser=await launchBrowser();t.after(()=>browser.close());
  const {page,requests}=await openPractice(browser,t);
  await page.locator('[data-consent]').check();
  await page.evaluate(()=>permissionPending=true);
  await page.locator('[data-talk]').click();
  await page.waitForFunction(()=>typeof grantPermission==='function');
  assert.equal(await page.locator('[data-voice=record]').innerText(),'取消等待');
  await page.locator('[data-stop]').click();
  await page.evaluate(()=>{permissionPending=false;grantPermission();});
  await page.waitForFunction(()=>sources[0].stream.getTracks().every(track=>track.readyState==='ended'));
  await record(page);await quietUI(page);
  assert.equal(await page.evaluate(()=>microphoneCalls),2);
  assert.equal(requests.length,0);
  assert.equal(await page.locator('[data-stop]').isVisible(),false);
  assert.equal(await page.locator('[data-send-audio]').isEnabled(),true);
});

test('AI errors preserve the recording and permit an explicit retry',{timeout:30000},async t=>{
  const browser=await launchBrowser();t.after(()=>browser.close());
  const {page,requests}=await openPractice(browser,t,{failFirst:true});
  await page.locator('[data-consent]').check();
  await record(page);await page.locator('[data-send-audio]').click();
  await page.waitForFunction(()=>document.querySelector('.coach-state').textContent==='可以重试');
  assert.match(await page.locator('.coach-chat').innerText(),/测试服务暂时不可用/);
  assert.equal(await page.locator('[data-send-audio]').isEnabled(),true);
  assert.equal(await page.locator('[data-voice=replay]').isEnabled(),true);
  await page.locator('[data-send-audio]').click();
  await page.waitForFunction(()=>document.querySelector('.coach-chat').textContent.includes('smoothly'));
  assert.equal(requests.length,2);assert.equal(requests[0].audio,requests[1].audio);
  assert.equal(await page.evaluate(()=>microphoneCalls),1);
});
