import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {PHONEMES} from './dist/phonemes.js';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&/THREE|shader/i.test(m.text()))errors.push(m.text());});
async function choose(id,value){await page.locator(`#${id} [role=combobox]`).click();await page.locator(`#${id} [role=option][data-value="${value}"]`).click();}
try{
 await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>window.labSnapshot?.().ready,{},{timeout:60000});
 const simplified=await page.evaluate(()=>window.teachingSnapshot());assert(simplified.childMode);assert.equal(simplified.visibleDetails,0);assert(simplified.hiddenDetailCaps>10);
 assert.equal(simplified.visibleSkeleton,0);assert.equal(simplified.filledContours,1);
 for(const role of ['tongue','teeth','palate','airway','voice'])assert(simplified.visibleRoles.includes(role),role);
 const cutaway=await page.locator('#viewer').screenshot({path:'qa/teaching-cutaway.png'});
 const nasalPixels=await page.evaluate(async bytes=>{
  const im=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));
  const canvas=new OffscreenCanvas(im.width,im.height),ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);
  const {data}=ctx.getImageData(im.width*.45,im.height*.28,im.width*.27,im.height*.27);
  let count=0;for(let i=0;i<data.length;i+=4)if(data[i+1]>data[i]+10&&data[i+2]>data[i]+10&&Math.abs(data[i+1]-data[i+2])<40)count++;
  return count;
 },Array.from(cutaway));
 assert(nasalPixels>800,'Nasal cavity must be a filled colour region, not just an outline: '+nasalPixels);
 await page.screenshot({path:'qa/teaching-desktop.png',fullPage:true});
 await page.locator('#teacher-tools summary').click();
 await page.locator('#swap-sides').click();await page.locator('[data-view=left]').click();
 assert.equal((await page.evaluate(()=>window.teachingSnapshot())).filledContours,1);
 await page.locator('#viewer').screenshot({path:'qa/teaching-left-contour.png'});
 await page.locator('#swap-sides').click();await page.locator('[data-view=right]').click();
 await page.locator('#anatomy-details').check();
 assert((await page.evaluate(()=>window.teachingSnapshot())).visibleDetails>20);
 assert.equal((await page.evaluate(()=>window.teachingSnapshot())).filledContours,0);
 await page.locator('#anatomy-details').uncheck();assert.equal((await page.evaluate(()=>window.teachingSnapshot())).visibleDetails,0);
 await page.locator('#teacher-tools summary').click();
 for(const p of Object.values(PHONEMES)){
  await choose('category',p.category);await choose('entry-select','ipa:'+p.id);
  assert.equal(await page.locator('#lesson-symbol').innerText(),'/'+p.ipa+'/');
  assert((await page.locator('#cue-tongue').innerText()).length>=4);
 }
 await choose('category','vowel');await choose('entry-select','ipa:i');await page.locator('#contrast-sound').click();assert.equal((await page.evaluate(()=>window.labSnapshot())).sound,'ipa:ih');
 await page.locator('#watch-demo').click();await page.waitForFunction(()=>window.labSnapshot().progress>.15);assert((await page.evaluate(()=>window.labSnapshot())).audio.paused);
 await page.locator('#play').click();await page.locator('#listen-demo').click();await page.waitForFunction(()=>window.labSnapshot().audio.currentTime>0&&!window.labSnapshot().audio.paused);
 await page.locator('#try-demo').click();assert(!(await page.evaluate(()=>window.labSnapshot())).playing);assert(await page.locator('#practice-checks').evaluate(e=>e.open));
 await page.locator('#practice-checks input').first().check();await page.locator('#contrast-sound').click();assert(!(await page.locator('#practice-checks input').first().isChecked()));
 await page.locator('[data-preset=surface]').click();assert.equal((await page.evaluate(()=>window.teachingSnapshot())).filledContours,0);await page.locator('[data-view=front]').click();await page.locator('#viewer').screenshot({path:'qa/teaching-front.png'});
 await choose('category','nasal');await choose('entry-select','ipa:m');await page.locator('[data-preset=cutaway]').click();await page.locator('[data-view=right]').click();await page.locator('[data-step="1"]').click();
 assert.match(await page.locator('#cue-air').innerText(),/鼻子/);await page.locator('#viewer').screenshot({path:'qa/teaching-nasal.png'});
 for(const head of ['mickey','tom','human']){await choose('head-model',head);assert.equal((await page.evaluate(()=>window.teachingSnapshot())).visibleDetails,0);}
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'qa/teaching-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('TEACHING_UI_PASSED: 48 cards, child/reference views, contrasts, watch/listen/try, nasal cue, 3 heads, desktop/mobile');
}finally{await browser.close();}
