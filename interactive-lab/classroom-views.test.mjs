import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {launchBrowser} from './browser-test-utils.mjs';

test('classroom close-ups show both lips and restore the exposed mouth when switching views',{timeout:120000},async t=>{
 const browser=await launchBrowser();t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto((process.env.TEST_APP_URL||'http://127.0.0.1:4173')+'/learn.html?course=dog');
 await page.waitForFunction(()=>document.getElementById('model-frame')?.contentWindow.teachingPlayer?.ready,null,{timeout:90000});
 const frame=page.frameLocator('#model-frame');
 const snapshot=()=>frame.locator('body').evaluate(()=>labSnapshot());
 async function view(id){
  await frame.locator(`[data-view="${id}"]`).click();
  await page.waitForFunction(()=>!document.getElementById('model-frame').contentWindow.learningSnapshot().cameraMoving);
  assert.equal(await frame.locator(`[data-view="${id}"]`).getAttribute('aria-pressed'),'true');
  return snapshot();
 }
 assert.equal((await snapshot()).visibleSides.right,0);
 await frame.locator('body').evaluate(()=>teachingPlayer.seek(.45));
 let state=await view('lips');
 assert(state.visibleSides.left>0&&state.visibleSides.right>0,'close-up restores both visible halves');
 assert.equal(state.alpha.skin,0);assert.equal(state.progress,.45);
 await mkdir('qa',{recursive:true});
 await page.locator('.player-surface').screenshot({path:'qa/classroom-lips-desktop.png'});
 state=await view('mouth');assert(state.visibleSides.left>0&&state.visibleSides.right===0,'mouth close-up exposes the tongue');
 state=await view('front');assert(state.visibleSides.left>0&&state.visibleSides.right>0);
 state=await view('right');assert(state.visibleSides.left>0&&state.visibleSides.right===0);
 await view('lips');await frame.locator('#reset-view').click();
 await page.waitForFunction(()=>!document.getElementById('model-frame').contentWindow.learningSnapshot().cameraMoving);
 assert.equal(await frame.locator('[data-view="right"]').getAttribute('aria-pressed'),'true');
 assert.equal((await snapshot()).visibleSides.right,0);
 for(const width of [390,320]){
  await page.setViewportSize({width,height:900});await view('lips');
  const bounds=await frame.locator('[data-view]:visible').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height,viewport:innerWidth};}));
  assert(bounds.every(b=>b.width>=44&&b.height>=44&&b.left>=0&&b.right<=b.viewport),'view buttons fit and remain easy to tap');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('.player-surface').screenshot({path:`qa/classroom-lips-${width}.png`});
 }
 assert.deepEqual(errors,[]);
});
