import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launchBrowser} from './browser-test-utils.mjs';
test('lesson can recover from unavailable 3D, rejected storage and paused audio without false completion', {timeout:60000}, async t=>{
 const browser=await launchBrowser();t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:320,height:900}});
 await page.addInitScript(()=>{
  const play=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(){window.lastPlayedRate=this.playbackRate;return play.call(this);};
  localStorage.setItem('phonetic-journey-v1',JSON.stringify({fish:{step:1,done:[0]}}));
  Storage.prototype.setItem=function(){throw new Error('storage unavailable');};
 });
 await page.route('**/lab.html?**',route=>route.abort());
 await page.goto('http://127.0.0.1:4173/learn.html?course=fish#step-1');
 await page.waitForFunction(()=>document.body.dataset.chapter==='1');
 assert(await page.locator('#storage-warning').isVisible());
 await page.locator('#text-mode').click();
 assert.equal(await page.locator('#model-panel').isVisible(),false);
 await page.locator('#demo').click();
 await page.waitForFunction(()=>!document.getElementById('next').disabled);
 assert(Math.abs(await page.evaluate(()=>window.lastPlayedRate)-.65)<1e-9, 'audio fallback uses the same slow speed');
 await page.locator('#next').click();await page.waitForFunction(()=>document.body.dataset.chapter==='2');
 await page.locator('#text-mode').click();
 await page.locator('#demo').click();await page.locator('#pause').click();
 assert.equal(await page.evaluate(()=>window.lastPlayedRate),1, 'next chapter restores natural playback speed');
 assert(await page.locator('#next').isDisabled());
 await page.locator('#scrub').fill('999');await page.locator('#scrub').dispatchEvent('input');
 assert(await page.locator('#next').isDisabled());
 await page.goBack();await page.waitForFunction(()=>document.body.dataset.chapter==='1');
 assert.equal(await page.locator('#pause').isDisabled(),true);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
});

test('learning modes switch both ways without overlapping playback or losing progress', {timeout:90000}, async t=>{
 const browser=await launchBrowser();t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  const play=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(){window.testMedia=this;return play.call(this);};
 });
 await page.goto('http://127.0.0.1:4173/');
 await page.evaluate(()=>localStorage.setItem('phonetic-journey-v1',JSON.stringify({dog:{step:5,done:[0,1,2,3,4]}})));
 await page.goto('http://127.0.0.1:4173/learn.html?course=dog#step-5');
 await page.waitForFunction(()=>document.getElementById('model-frame').contentWindow.teachingPlayer?.ready,{}, {timeout:60000});
 await page.evaluate(()=>window.originalFrame=document.getElementById('model-frame').contentWindow.document);
 await page.locator('[data-demo-rate="0.5"]').click();await page.locator('#demo').click();
 await page.waitForFunction(()=>document.getElementById('model-frame').contentWindow.labSnapshot().audio.currentTime>.1);
 await page.locator('#text-mode').click();
 assert.equal(await page.locator('#model-panel').isVisible(),false);
 assert(await page.locator('#scene').isVisible());
 assert.equal(await page.locator('#text-mode').getAttribute('aria-pressed'),'true');
 assert(await page.evaluate(()=>document.getElementById('model-frame').contentWindow.labSnapshot().audio.paused));
 assert.equal(await page.locator('#scrub').inputValue(),'0');
 assert(await page.locator('#next').isDisabled());
 await page.locator('#demo').click();
 await page.waitForFunction(()=>window.testMedia?.currentTime>.1);
 await page.locator('#model-mode').focus();await page.keyboard.press('Space');
 assert(await page.locator('#model-panel').isVisible());
 assert.equal(await page.locator('#model-mode').getAttribute('aria-pressed'),'true');
 assert(await page.evaluate(()=>window.testMedia.paused));
 assert.equal(await page.locator('#scrub').inputValue(),'0');
 assert.equal(await page.locator('#reading-text [data-active]').count(),0);
 assert.equal(await page.locator('#demo-rate').inputValue(),'0.5');
 assert(await page.evaluate(()=>window.originalFrame===document.getElementById('model-frame').contentWindow.document));
 await page.locator('#demo').click();
 await page.waitForFunction(()=>document.getElementById('model-frame').contentWindow.labSnapshot().audio.currentTime>.1);
 assert.equal(await page.evaluate(()=>document.getElementById('model-frame').contentWindow.labSnapshot().audio.playbackRate),.5);
 await page.locator('#text-mode').click();
 await page.locator('#chapters button').nth(3).click();
 await page.waitForFunction(()=>document.body.dataset.chapter==='3');
 assert.equal(await page.locator('#text-mode').getAttribute('aria-pressed'),'true','chapter navigation retains selected mode');
 assert.equal(await page.locator('#reading').isVisible(),false,'mode changes must not reveal quiz answer');
 await page.locator('#model-mode').click();
 assert.equal(await page.locator('#reading').isVisible(),false);
 await page.locator('#chapters button').nth(4).click();
 await page.waitForFunction(()=>document.body.dataset.chapter==='4');
 assert.equal(await page.locator('#next').isDisabled(),false,'completed chapter stays complete');
 for(const width of [1440,320]){
  await page.setViewportSize({width,height:900});
  for(const mode of ['text-mode','model-mode']){
   await page.locator('#'+mode).click();
   assert(await page.locator('#text-mode').isVisible());assert(await page.locator('#model-mode').isVisible());
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.locator('.player-surface').screenshot({path:`qa/learning-modes-${width}-${mode}.png`});
  }
 }
 assert.deepEqual(errors,[]);
});
