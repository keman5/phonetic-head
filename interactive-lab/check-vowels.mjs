import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {PHONEMES} from './dist/phonemes.js';

await mkdir('qa',{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function choose(id,value){await page.locator(`#${id} [role=combobox]`).click();await page.locator(`#${id} [role=option][data-value="${value}"]`).click();}
async function scrub(value){await page.locator('#timeline').fill(String(value));await page.locator('#timeline').dispatchEvent('input');await page.waitForFunction(v=>window.labSnapshot().progress===v/1000,value);}
const vowels=Object.values(PHONEMES).filter(p=>['vowel','diphthong'].includes(p.category));
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:4173');
 await page.waitForFunction(()=>window.labSnapshot?.().ready,{},{timeout:60000});
 await page.locator('[data-preset=surface]').click();
 await choose('library-mode','vowels');
 assert.equal(await page.locator('#entry-select [role=option]').count(),20);
 assert.equal(await page.locator('[data-vowel]').count(),20);
 for(const head of ['human','mickey','tom']){
  await choose('head-model',head);
  for(const p of vowels){
   await page.locator(`[data-vowel="${p.id}"]`).click();
   const s=await page.evaluate(()=>window.labSnapshot());
   assert.equal(s.sound,'ipa:'+p.id);assert.equal(s.progress,.5);assert(s.morphMeshes>0&&s.skinMorphMeshes>0);
   assert.equal(await page.locator('#entry-select').evaluate(e=>e.value),'ipa:'+p.id);
   assert.equal(await page.locator(`[data-vowel="${p.id}"]`).getAttribute('aria-pressed'),'true');
  }
  await page.locator('[data-view=lips]').click();
  const captures=[];
  for(const id of ['i','ah','u']){
   await page.locator(`[data-vowel=${id}]`).click();await page.waitForTimeout(100);
   captures.push(await page.locator('#viewer').screenshot({path:`qa/vowel-${head}-${id}.png`}));
  }
  const differences=await page.evaluate(async images=>{
   const arrays=[];
   for(const bytes of images){const im=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));const c=new OffscreenCanvas(im.width,im.height),ctx=c.getContext('2d');ctx.drawImage(im,0,0);arrays.push(ctx.getImageData(c.width*.3,c.height*.35,c.width*.4,c.height*.45).data);}
   return arrays.slice(1).map(a=>{let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-arrays[0][i])+Math.abs(a[i+1]-arrays[0][i+1])+Math.abs(a[i+2]-arrays[0][i+2])>25)changed++;return changed;});
  },captures.map(b=>Array.from(b)));
  assert(differences.every(n=>n>300),`${head} vowel mouth pixels: ${differences}`);
  console.log(head,'mouth pixel differences',differences);
 }
 await choose('head-model','human');await page.locator('[data-view=lips]').click();
 await page.locator('[data-vowel=au]').click();await scrub(250);
 const a=await page.evaluate(()=>window.labSnapshot().pose.weights);
 await scrub(850);const b=await page.evaluate(()=>window.labSnapshot().pose.weights);
 assert(a.JawOpen>b.JawOpen&&a.LipRound<b.LipRound);
 await page.locator('#motion-only').check();await page.locator('#play').click();
 await page.waitForFunction(()=>window.labSnapshot().progress>.1);
 assert((await page.evaluate(()=>window.labSnapshot())).audio.paused);
 await page.locator('#play').click();const held=await page.evaluate(()=>window.labSnapshot().progress);
 await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.labSnapshot().progress),held);
 await scrub(990);await page.locator('#play').click();await page.waitForFunction(()=>!window.labSnapshot().playing&&window.labSnapshot().progress===1);
 await page.locator('#loop').check();await scrub(990);await page.locator('#play').click();await page.waitForFunction(()=>window.labSnapshot().playing&&window.labSnapshot().progress<.2);await page.locator('#restart').click();await page.locator('#loop').uncheck();
 // Slow visual inspection must still work when the selected audio cannot load.
 await page.route('**/audio/**/ipa-e.wav',r=>r.fulfill({status:404,body:'missing'}));
 await page.locator('[data-vowel=e]').click();await page.locator('#play').click();await page.waitForFunction(()=>window.labSnapshot().progress>.15);assert((await page.evaluate(()=>window.labSnapshot())).playing);
 await page.locator('#restart').click();await page.unroute('**/audio/**/ipa-e.wav');
 await page.locator('[data-vowel=u]').click();await page.locator('#motion-only').uncheck();await page.locator('#play').click();await page.waitForFunction(()=>window.labSnapshot().audio.currentTime>0&&!window.labSnapshot().audio.paused);await page.locator('#restart').click();
 await page.locator('[data-vowel=ah]').click();await page.screenshot({path:'qa/vowels-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await choose('head-model','tom');await page.locator('[data-vowel=u]').click();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'qa/vowels-mobile.png',fullPage:true});
 await choose('library-mode','letters');assert(await page.locator('#vowel-picker').isHidden());
 await choose('library-mode','ipa');await choose('category','fricative');assert(await page.locator('#vowel-picker').isHidden());
 await choose('category','vowel');await page.locator('[data-vowel=ai]').click();assert.equal(await page.locator('#category').evaluate(e=>e.value),'diphthong');
 assert.deepEqual(errors,[]);
 console.log('VOWEL_UI_PASSED: 20 vowels x 3 heads, visible mouth changes, diphthong endpoints, silent playback/pause/seek/loop, audio failure isolation, desktop/mobile');
}finally{await browser.close();}
