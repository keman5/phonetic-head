import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function choose(id,value){
    if(id==='entry-select'){await page.locator(`[data-sound="${value}"]`).click();return;}await page.locator('#'+id+' [role=combobox]').click();await page.locator('#'+id+' [role=option][data-value="'+value+'"]').click();}
async function speed(value){await page.locator('#speed').fill(String(value));await page.locator('#speed').dispatchEvent('input');}
const snapshot=()=>page.evaluate(()=>window.labSnapshot());
try{
 await page.goto('http://127.0.0.1:4173/lab.html');await page.waitForFunction(()=>window.labSnapshot?.().ready,{},{timeout:60000});
 assert.equal(await page.locator('select').count(),0);assert.equal(await page.locator('[role=combobox]').count(),4);
 assert(!(await page.locator('body').innerText()).includes('原四音'));
 const category=page.locator('#category [role=combobox]');
 await category.focus();await category.press('ArrowDown');await category.press('End');await category.press('Enter');assert.equal(await page.locator('#category').evaluate(e=>e.value),'cluster');
 await category.press('Enter');await category.press('Home');await category.press('Escape');assert.equal(await category.getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#category').evaluate(e=>e.value),'cluster');
 await category.click();await page.locator('header').click();assert.equal(await category.getAttribute('aria-expanded'),'false');
 await choose('library-mode','letters');await choose('entry-select','letter:W');await speed(.5);
 await page.locator('#play').click();await page.waitForFunction(()=>window.labSnapshot().audio.currentTime>.15);
 let s=await snapshot();assert.equal(s.audio.paused,false);assert.equal(s.audio.rate,.5);assert(Math.abs(s.progress-s.audio.currentTime/s.audio.duration)<.08);
 // Live input must preserve playback position and work at both bounds and between presets.
 for(const rate of [.2,1.37,3,.5]){
  const before=(await snapshot()).audio.currentTime;
  await speed(rate);
  await page.waitForFunction(t=>window.labSnapshot().audio.currentTime>t,before);
  const current=await snapshot();assert.equal(current.audio.rate,rate);assert(!current.audio.paused);
  assert(Math.abs(current.progress-current.audio.currentTime/current.audio.duration)<.08);
  assert.equal(await page.locator('#speed-value').innerText(),rate.toFixed(2)+' ×');
 }
 await page.locator('#speed').focus();await page.locator('#speed').press('Home');assert.equal((await snapshot()).audio.rate,.2);
 await page.locator('#speed').press('End');assert.equal((await snapshot()).audio.rate,3);await speed(.5);
 await page.locator('#play').click();s=await snapshot();assert(s.audio.paused);const paused=s.audio.currentTime;
 await page.waitForTimeout(100);assert.equal((await snapshot()).audio.currentTime,paused);
 await page.locator('#timeline').fill('500');await page.locator('#timeline').dispatchEvent('input');s=await snapshot();assert.equal(s.progress,.5);assert(Math.abs(s.audio.currentTime/s.audio.duration-.5)<.01,JSON.stringify(s.audio));
 await page.locator('#play').click();await page.waitForFunction(()=>window.labSnapshot().progress>.55);
 await choose('voice','male');await page.waitForFunction(()=>window.labSnapshot().audio.src.includes('/male/')&&!window.labSnapshot().audio.paused);
 s=await snapshot();assert.equal(s.audio.voice,'male');assert(s.progress<.5);assert.equal(s.audio.rate,.5);
 await page.locator('#sound-toggle').uncheck();assert((await snapshot()).audio.muted);assert(!(await snapshot()).audio.paused);
 await choose('entry-select','letter:A');await page.waitForFunction(()=>window.labSnapshot().audio.src.includes('/letter-A.wav'));
 s=await snapshot();assert(!s.playing&&s.audio.paused);assert.equal(s.progress,0);
 await page.locator('#sound-toggle').check();await choose('entry-select','alphabet');
 await page.locator('#timeline').fill('400');await page.locator('#timeline').dispatchEvent('input');await page.locator('#play').click();
 await page.waitForFunction(()=>window.labSnapshot().progress>.41);s=await snapshot();assert(s.pose.letter&&s.audio.currentTime>5);
 await page.locator('#restart').click();s=await snapshot();assert(s.audio.paused&&!s.playing);assert.equal(s.progress,0);assert.equal(s.audio.currentTime,0);
 await choose('entry-select','letter:A');await speed(1.5);await page.locator('#loop').check();await page.locator('#timeline').fill('970');await page.locator('#timeline').dispatchEvent('input');await page.locator('#play').click();
 await page.waitForFunction(()=>window.labSnapshot().playing&&window.labSnapshot().progress>0&&window.labSnapshot().progress<.6);
 await page.locator('#loop').uncheck();await page.waitForFunction(()=>!window.labSnapshot().playing&&window.labSnapshot().progress===1);
 // A late network error from a replaced voice must not stop the new selection.
 await page.route('**/audio/female/letter-W.wav',async route=>{await new Promise(r=>setTimeout(r,450));await route.fulfill({status:404,body:'missing'});});
 await choose('voice','female');await choose('entry-select','letter:W');await page.locator('#play').click();
 await choose('voice','male');await choose('entry-select','alphabet');await page.locator('#play').click();await page.waitForTimeout(600);
 s=await snapshot();assert(s.playing&&!s.audio.paused);assert.equal(s.audio.voice,'male');assert(!(await page.locator('#audio-status').innerText()).includes('失败'));
 await page.locator('#play').click();await page.unroute('**/audio/female/letter-W.wav');
 // Same-entry retry after a real load failure.
 await page.route('**/audio/female/letter-A.wav',route=>route.fulfill({status:404,body:'missing'}));
 await choose('voice','female');await choose('entry-select','letter:A');await page.waitForFunction(()=>document.querySelector('#audio-status').textContent.includes('失败'));
 await page.unroute('**/audio/female/letter-A.wav');await page.locator('#play').click();await page.waitForFunction(()=>!window.labSnapshot().audio.paused&&window.labSnapshot().audio.currentTime>0);
 await page.locator('#restart').click();
 await choose('library-mode','ipa');await choose('category','vowel');await page.locator('[data-vowel="u"]').click();await page.locator('[data-step="1"]').click();await page.locator('[data-preset="cutaway"]').click();await page.locator('[data-view="right"]').click();
 await page.locator('#voice [role=combobox]').click();await page.screenshot({path:'qa/voices-desktop.png'});await page.locator('#voice [role=combobox]').press('Escape');
 await page.setViewportSize({width:390,height:844});await choose('head-model','tom');
 await page.locator('#category [role=combobox]').click();await page.screenshot({path:'qa/custom-select-mobile.png'});await category.press('Escape');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'qa/voices-mobile.png',fullPage:true});
 await speed(.2);assert.equal((await snapshot()).audio.rate,.2);
 await page.locator('.transport').screenshot({path:'qa/speed-slider-mobile.png'});
 await speed(3);assert.equal((await snapshot()).audio.rate,3);
 await page.setViewportSize({width:1440,height:1000});await speed(1.37);
 await page.locator('.transport').screenshot({path:'qa/speed-slider-desktop.png'});
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('AUDIO_UI_PASSED: custom listboxes, keyboard, playback clock, pause, seek, voices, mute, speed, loop, alphabet, stale errors, retry, desktop/mobile');
}finally{await browser.close();}
