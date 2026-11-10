import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {LESSON_SERIES} from './dist/curriculum.js';
import {launchBrowser} from './browser-test-utils.mjs';
test('course pages guide real listening, model observation, comprehension and recall', {timeout:180000}, async t=>{
 const browser=await launchBrowser();t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 let overlap=false;
 await page.exposeFunction('reportAudioOverlap',()=>{overlap=true;});
 await page.addInitScript(()=>{
  const play=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(){
   const all=window.top.lessonAudioElements??=new Set();
   if(!all.has(this))this.addEventListener('playing',()=>{
    if([...all].filter(audio=>!audio.paused&&!audio.ended&&!audio.muted).length>1)window.reportAudioOverlap();
   });
   all.add(this);return play.call(this);
  };
 });
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:4173/');
 assert.equal(await page.locator('.course-card').count(),LESSON_SERIES.length);
 assert.equal(await page.locator('#viewer').count(),0);
 await mkdir('qa',{recursive:true});await page.screenshot({path:'qa/journey-home.png',fullPage:true});
 await page.locator('#continue').click();
 const at=async step=>page.waitForFunction(step=>location.hash==='#step-'+step&&document.body.dataset.chapter===String(step),step);
 await at(0);assert(await page.locator('#next').isDisabled());
 await page.evaluate(()=>location.hash='step-7');await at(0);
 await page.waitForFunction(()=>document.getElementById('model-frame').contentWindow.teachingPlayer?.ready,{}, {timeout:60000});
 const embedded=page.frameLocator('#model-frame');
 assert(await embedded.locator('#viewer canvas').isVisible(),'opening demonstration includes the real 3D model');
 assert(await page.evaluate(()=>document.getElementById('model-frame').contentWindow.renderSnapshot().triangles>0));
 assert(await page.locator('#scene').evaluate(el=>el.getBoundingClientRect().height<80),'context illustration leaves room for the model');
 await page.screenshot({path:'qa/journey-opening-model.png',fullPage:true});
 const finishDemo=async()=>{
  await page.locator('#demo').click();
  await page.waitForFunction(()=>!document.getElementById('next').disabled,{}, {timeout:30000});
  assert.equal(await page.locator('#scrub').inputValue(),'1000');
 };
 await finishDemo();await page.locator('#next').click();await at(1);
 await page.waitForFunction(()=>!document.getElementById('demo').disabled,{}, {timeout:60000});
 assert.equal(await embedded.locator('.lessons').isVisible(),false);
 assert.equal(await embedded.locator('#viewer').isVisible(),true);
 assert(await embedded.locator('html').evaluate(el=>el.scrollHeight<=innerHeight), 'embedded model has no vertical overflow');
 await page.screenshot({path:'qa/journey-model.png',fullPage:true});
 await page.locator('#demo').click();
 await page.waitForFunction(()=>document.getElementById('model-frame').contentWindow.labSnapshot().audio.currentTime>0);
 const slow=await page.evaluate(()=>document.getElementById('model-frame').contentWindow.labSnapshot());
 assert.equal(slow.audio.paused,false);assert.equal(slow.audio.muted,false);
 assert(Math.abs(slow.audio.playbackRate-.65)<1e-9);
 assert(Math.abs(slow.progress-slow.audio.currentTime/slow.audio.duration)<.04);
 await page.waitForFunction(()=>!document.getElementById('next').disabled);
 await page.locator('#next').click();await at(2);
 await page.locator('#demo').click();await page.locator('#pause').click();assert(await page.locator('#next').isDisabled());
 await finishDemo();await page.locator('#next').click();await at(3);
 assert(await embedded.locator('#viewer canvas').isVisible(),'listening quiz keeps the model visible');
 assert.equal(await page.locator('#answers').isVisible(),false);assert.equal(await page.locator('#reading').isVisible(),false);
 await page.locator('#demo').click();await page.locator('#answers').waitFor({state:'visible'});
 await page.getByRole('button',{name:'一只黑猫',exact:true}).click();assert(await page.locator('#next').isDisabled());
 await page.getByRole('button',{name:'一只大狗',exact:true}).click();assert.equal(await page.locator('#next').isDisabled(),false);
 await page.locator('#next').click();await at(4);await page.reload();await at(4);
 await page.waitForFunction(()=>!document.getElementById('demo').disabled,{}, {timeout:60000});
 await finishDemo();await page.locator('#next').click();await at(5);
 await finishDemo();await page.locator('#next').click();await at(6);
 assert(await embedded.locator('#viewer canvas').isVisible(),'independent expression keeps the model visible');
 assert.equal(await page.locator('#reading').isVisible(),false);
 await page.locator('#reflection input').nth(0).check();assert(await page.locator('#next').isDisabled());
 await page.locator('#reflection input').nth(1).check();await page.locator('#next').click();await at(7);
 assert(await page.locator('#review').isVisible());assert(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('phonetic-study-plan-v1')).days).length===1));await page.locator('#finish').click();await page.waitForFunction(()=>document.getElementById('overall')?.textContent.trim());assert.match(await page.locator('#overall').innerText(),new RegExp('1 / '+LESSON_SERIES.length));
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px home overflow`);}
 await page.locator('.course-card[href="./learn.html?course=cat"]').click();
 await page.waitForFunction(()=>document.getElementById('model-frame').contentWindow.teachingPlayer?.ready,{}, {timeout:60000});
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px lesson overflow`);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'qa/journey-mobile.png',fullPage:true});
 await page.locator('#demo').click();await page.getByRole('link',{name:'← 我的课程'}).click();
 await page.locator('#continue').click();assert.match(page.url(),/course=cat/);
 assert.deepEqual(errors,[]);
 assert.equal(overlap,false,'parent and embedded model never play two audible recordings together');
});

test('self-check opens recap without a false check-in, and inline listening resolves checked boxes',{timeout:60000},async t=>{
 const browser=await launchBrowser();t.after(()=>browser.close());const page=await browser.newPage();
 await page.goto('http://127.0.0.1:4173/');
 await page.evaluate(()=>localStorage.setItem('phonetic-journey-v1',JSON.stringify({dog:{step:6,done:[0,1,2,3,4,5,6],sentenceHeardOn:'2000-01-01'}})));
 await page.goto('http://127.0.0.1:4173/learn.html?course=dog#step-6');
 assert.equal(await page.locator('#next').isDisabled(),false,'previous completion keeps recap accessible');
 await page.locator('#reflection input').nth(0).check();await page.locator('#reflection input').nth(1).check();
 assert.equal(await page.evaluate(()=>localStorage.getItem('phonetic-study-plan-v1')),null);
 assert.equal(await page.locator('#next').isDisabled(),false);
 await page.locator('#next').click();await page.waitForFunction(()=>document.body.dataset.chapter==='7');
 assert(await page.locator('#review').isVisible());
 await page.locator('#previous').click();await page.waitForFunction(()=>document.body.dataset.chapter==='6');
 await page.locator('#reflection input').nth(0).check();await page.locator('#reflection input').nth(1).check();
 await page.locator('#review-listen').click();
 await page.waitForFunction(()=>document.getElementById('scrub').value==='1000');
 assert(await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('phonetic-study-plan-v1')).days).some(ids=>ids.includes('dog'))));
 assert.equal(await page.locator('#next').isDisabled(),false);
 await page.locator('#reflection input').nth(0).uncheck();assert.equal(await page.locator('#next').isDisabled(),false,'editing a new self-check does not revoke a completed recap');
 await page.locator('#reflection input').nth(0).check();await page.locator('#next').click();
 await page.waitForFunction(()=>document.body.dataset.chapter==='7');
});

test('self-check explains remaining work and survives refresh, return navigation and a new day',{timeout:60000},async t=>{
 const browser=await launchBrowser();t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto('http://127.0.0.1:4173/');
 await page.evaluate(()=>localStorage.setItem('phonetic-journey-v1',JSON.stringify({dog:{step:6,done:[0,1,2,3,4,5]}})));
 await page.goto('http://127.0.0.1:4173/learn.html?course=dog#step-6');
 assert(await page.locator('#next').isDisabled());
 assert.match(await page.locator('#reflection-progress').innerText(),/0 \/ 2/);
 await page.locator('#reflection input').nth(0).check();
 await page.reload();
 assert(await page.locator('#reflection input').nth(0).isChecked());
 assert.match(await page.locator('#reflection-progress').innerText(),/1 \/ 2/);
 assert(await page.locator('#next').isDisabled());
 await page.locator('#reflection input').nth(1).focus();await page.keyboard.press('Space');
 assert.equal(await page.locator('#next').isDisabled(),false);
 await page.reload();
 assert(await page.locator('#reflection input').nth(1).isChecked());
 assert.equal(await page.locator('#next').isDisabled(),false);
 assert.match(await page.locator('#task-badge').innerText(),/可回顾/);
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px self-check overflow`);
  assert(await page.evaluate(()=>document.getElementById('next').getBoundingClientRect().bottom<document.getElementById('voice-practice').getBoundingClientRect().top),'recap action appears before optional recording');
 }
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'qa/self-check-complete-mobile.png',fullPage:true});
 await page.locator('#next').click();await page.waitForFunction(()=>document.body.dataset.chapter==='7');
 await page.locator('#previous').click();await page.waitForFunction(()=>document.body.dataset.chapter==='6');
 assert.equal(await page.locator('#next').isDisabled(),false);
 assert(await page.locator('#reflection input').nth(0).isChecked());
 await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('phonetic-journey-v1'));p.dog.selfCheck.date='2000-01-01';localStorage.setItem('phonetic-journey-v1',JSON.stringify(p));});
 await page.reload();
 assert.equal(await page.locator('#reflection input').nth(0).isChecked(),false,'a new day requires fresh self-checks');
 assert.equal(await page.locator('#next').isDisabled(),false,'historical recap stays available');
 await page.locator('#review-listen').click();await page.waitForFunction(()=>document.getElementById('scrub').value==='1000');
 assert.equal(await page.evaluate(()=>localStorage.getItem('phonetic-study-plan-v1')),null,'listening plus yesterday\'s self-check cannot create today\'s check-in');
 await page.locator('#next').click();await page.waitForFunction(()=>document.body.dataset.chapter==='7');
});

test('listening survives refresh before self-check and teaching speed is explicit and switchable',{timeout:60000},async t=>{
 const browser=await launchBrowser();t.after(()=>browser.close());const page=await browser.newPage();
 await page.addInitScript(()=>{
  const play=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(){window.lastPlayedRate=this.playbackRate;return play.call(this);};
 });
 await page.goto('http://127.0.0.1:4173/');
 await page.evaluate(()=>localStorage.setItem('phonetic-journey-v1',JSON.stringify({dog:{step:5,done:[0,1,2,3,4]}})));
 await page.goto('http://127.0.0.1:4173/learn.html?course=dog#step-5');
 await page.locator('#text-mode').click();await page.locator('#demo').click();
 assert.equal(await page.evaluate(()=>window.lastPlayedRate),1);
 await page.waitForFunction(()=>!document.getElementById('next').disabled);
 await page.locator('#next').click();await page.waitForFunction(()=>document.body.dataset.chapter==='6');
 await page.reload();await page.waitForFunction(()=>document.body.dataset.chapter==='6');
 assert.equal(await page.evaluate(()=>localStorage.getItem('phonetic-study-plan-v1')),null);
 await page.locator('#reflection input').nth(0).check();await page.locator('#reflection input').nth(1).check();
 assert.equal(await page.locator('#next').isDisabled(),false);
 assert(await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('phonetic-study-plan-v1')).days).some(ids=>ids.includes('dog'))));
 await page.locator('#text-mode').click();
 await page.locator('[data-demo-rate="1"]').click();await page.locator('#demo').click();
 assert.equal(await page.evaluate(()=>window.lastPlayedRate),1);
 await page.locator('#pause').click();
 await page.locator('[data-demo-rate="0.85"]').click();await page.locator('#demo').click();
 assert.equal(await page.evaluate(()=>window.lastPlayedRate),.85);
 await page.locator('#pause').click();
});

test('classroom speed adjusts live, stays synchronized and carries across chapters and fallback',{timeout:90000},async t=>{
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
 assert.equal(await page.locator('#demo-rate').inputValue(),'1');
 assert.equal(await page.locator('[data-demo-rate]').count(),6);
 await page.locator('[data-demo-rate="0.5"]').click();await page.locator('#demo').click();
 await page.waitForFunction(()=>document.getElementById('model-frame').contentWindow.labSnapshot().audio.currentTime>.2);
 const changed=await page.evaluate(()=>{
  const win=document.getElementById('model-frame').contentWindow;
  const before=win.labSnapshot().audio.currentTime;
  const slider=document.getElementById('demo-rate');slider.value='0.95';slider.dispatchEvent(new Event('input'));
  return {before,after:win.labSnapshot().audio};
 });
 assert.equal(changed.after.playbackRate,.95);assert.equal(changed.after.paused,false);
 assert(Math.abs(changed.after.currentTime-changed.before)<.1,'rate adjustment must not seek or restart');
 await page.locator('#demo-rate').focus();await page.keyboard.press('ArrowRight');
 assert.equal(await page.locator('#demo-rate').inputValue(),'1');
 assert.equal(await page.locator('[data-demo-rate="1"]').getAttribute('aria-pressed'),'true');
 const sync=await page.evaluate(()=>{
  const win=document.getElementById('model-frame').contentWindow;
  return {snapshot:win.labSnapshot(),word:win.teachingPlayer.status.wordIndex,highlight:[...document.querySelectorAll('#reading-text span')].findIndex(el=>el.hasAttribute('data-active'))};
 });
 assert.equal(sync.snapshot.audio.playbackRate,1);
 assert(Math.abs(sync.snapshot.progress-sync.snapshot.audio.currentTime/sync.snapshot.audio.duration)<.05);
 assert.equal(sync.highlight,sync.word,'classroom words follow model timing');
 await page.waitForFunction(()=>!document.getElementById('next').disabled);
 await page.locator('#chapters button').nth(1).click();await page.waitForFunction(()=>document.body.dataset.chapter==='1');
 assert.equal(await page.locator('#demo-rate').inputValue(),'1','chosen speed carries into mouth observation');
 await page.locator('[data-demo-rate="1.25"]').click();await page.locator('#demo').click();
 assert.equal(await page.evaluate(()=>document.getElementById('model-frame').contentWindow.labSnapshot().audio.playbackRate),1.25);
 await page.locator('#chapters button').nth(5).click();await page.waitForFunction(()=>document.body.dataset.chapter==='5');
 await page.locator('#text-mode').click();await page.locator('#demo').click();
 assert.equal(await page.evaluate(()=>window.testMedia.playbackRate),1.25);
 const fallback=await page.evaluate(()=>{
  const before=window.testMedia.currentTime;document.querySelector('[data-demo-rate="1.5"]').click();
  return {before,after:window.testMedia.currentTime,rate:window.testMedia.playbackRate,paused:window.testMedia.paused,preservesPitch:window.testMedia.preservesPitch};
 });
 assert.equal(fallback.rate,1.5);assert.equal(fallback.paused,false);assert.equal(fallback.preservesPitch,true);
 assert(Math.abs(fallback.after-fallback.before)<.1);
 await page.locator('#pause').click();await page.locator('#demo').click();
 assert.equal(await page.evaluate(()=>window.testMedia.playbackRate),1.5,'replay retains chosen rate');
 await page.locator('#pause').click();
 await mkdir('qa',{recursive:true});await page.screenshot({path:'qa/classroom-speed-desktop.png',fullPage:true});
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px speed controls overflow`);
  assert(await page.locator('[data-demo-rate="1.5"]').isVisible());
 }
 await page.setViewportSize({width:320,height:900});await page.screenshot({path:'qa/classroom-speed-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
});
