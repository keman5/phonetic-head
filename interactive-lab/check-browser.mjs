import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {PHONEMES,LETTERS,CATEGORIES} from './dist/phonemes.js';
await mkdir('qa',{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors=[];page.on('console',m=>{if(m.type()==='error'&&m.text().includes('THREE.'))errors.push(m.text());});page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
async function checkCanvas(){
 const bytes=await page.locator('#viewer').screenshot();
 const probe=await page.evaluate(async bytes=>{
  const bitmap=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));
  const c=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);
  const {data}=ctx.getImageData(Math.floor(c.width*.25),Math.floor(c.height*.25),Math.floor(c.width*.5),Math.floor(c.height*.5));
  const colors=new Set();let dark=0;for(let i=0;i<data.length;i+=16){colors.add(`${data[i]>>3},${data[i+1]>>3},${data[i+2]>>3}`);if(Math.min(data[i],data[i+1],data[i+2])<160)dark++;}
  return {colors:colors.size,dark};
 },Array.from(bytes));
 assert(probe.colors>30&&probe.dark>100,JSON.stringify(probe));return probe;
}
try{
await page.goto('http://127.0.0.1:4173/');
await page.waitForFunction(()=>window.labSnapshot?.().ready,{},{timeout:60000});
const initial=await page.evaluate(()=>window.labSnapshot());assert.equal(initial.palette,'human');assert.equal(initial.solidCoreMeshes,2);assert.equal(initial.visibleSolidCoreMeshes,2);assert.equal(initial.repairedSkinMeshes,2);assert(initial.humanEyeColors.every(c=>c==='ffffff'));assert(initial.meshCount>200);assert(initial.sectionCapCount>50);assert(initial.medianNormalGroups>0);assert.equal(initial.visibleSectionCaps,0);assert(initial.visibleSides.right>0);assert(initial.visibleSides.left>0);
await page.screenshot({path:'qa/01-initial.png',fullPage:true});
await page.locator('[data-view="oblique"]').click();
for(let i=0;i<13;i++)await page.locator('#viewer').press('ArrowDown');
await page.locator('#stage').screenshot({path:'qa/solid-human-bottom.png'});
await page.locator('[data-preset="cutaway"]').click();assert.equal((await page.evaluate(()=>window.labSnapshot())).visibleSolidCoreMeshes,1);
await page.locator('#stage').screenshot({path:'qa/solid-human-half-bottom.png'});
await page.locator('[data-view="oblique"]').click();
await page.locator('[data-preset="cutaway"]').click();
assert((await page.evaluate(()=>window.labSnapshot())).visibleMuscleCaps>0);
await page.locator('[data-view="right"]').click();await page.locator('#stage').screenshot({path:'qa/solid-human-section.png'});await page.locator('[data-view="oblique"]').click();
await page.locator('#play').click();await page.waitForTimeout(1200);
assert((await page.evaluate(()=>window.labSnapshot())).progress>.1);
await page.locator('#play').click();const paused=await page.evaluate(()=>window.labSnapshot().progress);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.labSnapshot().progress),paused);
await page.locator('#timeline').fill('500');await page.locator('#timeline').dispatchEvent('input');
let state=await page.evaluate(()=>window.labSnapshot());assert.equal(state.progress,.5);assert(state.morphMeshes>0);assert.equal(state.skinMorphMeshes,2);
await page.screenshot({path:'qa/02-theta.png',fullPage:true});
await page.locator('#swap-sides').click();state=await page.evaluate(()=>window.labSnapshot());assert.equal(state.visibleSides.left,0);assert(state.visibleSides.right>0);
await page.locator('[data-preset="xray"]').click();state=await page.evaluate(()=>window.labSnapshot());assert(state.visibleSides.left>0&&state.visibleSides.right>0);
await page.locator('#left-alpha').fill('30');await page.locator('#left-alpha').dispatchEvent('input');
await page.locator('#right-alpha').fill('80');await page.locator('#right-alpha').dispatchEvent('input');
state=await page.evaluate(()=>window.labSnapshot());assert.equal(state.alpha.left,30);assert.equal(state.alpha.right,80);
await page.locator('[data-sound="k"]').click();await page.locator('[data-step="1"]').click();await page.waitForTimeout(100);
state=await page.evaluate(()=>window.labSnapshot());assert.equal(state.pose.air,0);assert(!state.airVisible);
await page.locator('[data-step="2"]').click();await page.waitForTimeout(100);
assert((await page.evaluate(()=>window.labSnapshot())).airVisible);
await page.locator('#play').click();await page.waitForTimeout(80);const airA=await page.evaluate(()=>Array.from(window.labSnapshot().airPosition));await page.waitForTimeout(80);const airB=await page.evaluate(()=>Array.from(window.labSnapshot().airPosition));assert.notDeepEqual(airA,airB);await page.locator('#play').click();
await page.locator('[data-focus="genio"]').click();assert((await page.locator('#selection').innerText()).includes('颏舌肌'));
await page.screenshot({path:'qa/03-xray.png',fullPage:true});
await page.locator('[data-sound="i"]').click();await page.locator('[data-step="2"]').click();await page.waitForTimeout(100);
state=await page.evaluate(()=>window.labSnapshot());assert(state.pose.voiced);assert(state.morphMeshes>0);assert.equal(state.skinMorphMeshes,2);
await page.locator('#air-toggle').uncheck();await page.waitForTimeout(100);assert(!(await page.evaluate(()=>window.labSnapshot())).airVisible);
await page.locator('[data-view="mouth"]').click();await page.screenshot({path:'qa/06-mouth-closeup.png',fullPage:true});
await page.locator('#loop').uncheck();await page.locator('#timeline').fill('995');await page.locator('#timeline').dispatchEvent('input');await page.locator('#play').click();await page.waitForTimeout(250);
state=await page.evaluate(()=>window.labSnapshot());assert.equal(state.progress,1);assert.equal(state.playing,false);
await page.locator('#restart').click();state=await page.evaluate(()=>window.labSnapshot());assert.equal(state.progress,0);
await page.locator('[data-preset="surface"]').click();await page.locator('[data-view="front"]').click();
await page.screenshot({path:'qa/04-surface.png',fullPage:true});
await page.locator('[data-view="oblique"]').click();await page.screenshot({path:'qa/08-repaired-surface.png',fullPage:true});
for(const head of ['mickey','tom','human']){
 await page.locator('#head-model').selectOption(head);
 await page.waitForTimeout(150);
 let selected=await page.evaluate(()=>window.labSnapshot());assert.equal(selected.palette,head);assert.deepEqual(selected.visibleHeadVariants,[head]);assert(selected.visibleHeadMeshes>0);
 assert.deepEqual(selected.headModels.sort(),['human','mickey','tom']);
 await page.screenshot({path:`qa/head-${head}.png`,fullPage:true});
 if(head!=='human'){
  assert.equal(selected.visibleSolidCoreMeshes,0);assert(selected.visibleHeadMeshes>10);assert.equal(selected.visibleSourceMeshes,0);
  await page.locator('#restart').click();await page.locator('#clear-focus').click();
  await page.locator('[data-view="oblique"]').click();await page.screenshot({path:`qa/head-${head}-oblique.png`,fullPage:true});
  await page.locator('[data-view="front"]').click();
  await page.locator('#stage').screenshot({path:`qa/character-${head}-front.png`});
  await page.locator('[data-view="oblique"]').click();for(let i=0;i<13;i++)await page.locator('#viewer').press('ArrowDown');
  await page.locator('#stage').screenshot({path:`qa/solid-${head}-bottom.png`});await page.locator('[data-view="front"]').click();
  await page.locator('[data-sound="p"]').click();await page.locator('[data-step="1"]').click();await page.waitForTimeout(100);
  let closed=await page.evaluate(()=>window.labSnapshot());assert(closed.characterTongue.every(t=>!t.visible));assert(!closed.airVisible);
  await page.locator('#stage').screenshot({path:`qa/character-${head}-closed.png`});
  await page.locator('[data-step="2"]').click();await page.waitForTimeout(100);
  await page.locator('#stage').screenshot({path:`qa/character-${head}-release.png`});
  await page.locator('[data-sound="theta"]').click();await page.locator('[data-step="1"]').click();await page.waitForTimeout(100);
  const tonguePose=await page.evaluate(()=>window.labSnapshot());assert(tonguePose.skinMorphMeshes>0);assert(tonguePose.characterTongue.some(t=>t.visible&&t.weights.TipForward>.9));
  await page.locator('[data-focus="lips"]').click();assert((await page.locator('#selection').innerText()).includes('嘴唇'));
  await page.locator('#clear-focus').click();
  await page.locator('[data-preset="cutaway"]').click();await page.locator('[data-view="right"]').click();
  await page.screenshot({path:`qa/head-${head}-cutaway.png`,fullPage:true});
  const sections=await page.evaluate(()=>window.labSnapshot());assert(sections.visibleSectionCaps>0);assert(sections.visibleWhiteSections>0);
  await page.waitForTimeout(80);
  const fills=await page.evaluate(()=>window.sectionMaterials());assert(fills.length>0);
  for(const fill of fills){assert.equal(fill.color,fill.source,fill.name);assert.equal(fill.type,fill.sourceType,fill.name);assert.equal(fill.emissive,fill.sourceEmissive,fill.name);}
  await page.locator('#stage').screenshot({path:`qa/solid-${head}-section.png`});
 }
}
assert.equal(await page.locator('#head-model option[value="original"]').count(),0);
await page.locator('#head-model').selectOption('human');
await page.locator('[data-preset="cutaway"]').click();await page.locator('[data-view="right"]').click();
await page.locator('#library-mode').selectOption('ipa');
let visited=0;
for(const category of Object.keys(CATEGORIES)){
 await page.locator('#category').selectOption(category);
 for(const p of Object.values(PHONEMES).filter(p=>p.category===category)){
  await page.locator('#entry-select').selectOption('ipa:'+p.id);
  await page.locator('#timeline').fill('500');await page.locator('#timeline').dispatchEvent('input');
  await page.waitForFunction(id=>window.labSnapshot().sound==='ipa:'+id&&window.labSnapshot().morphMeshes>0,p.id);
  assert.equal(await page.locator('#entry-select option').count(),Object.values(PHONEMES).filter(x=>x.category===category).length);
  visited++;
 }
}
assert.equal(visited,48);
await page.locator('#category').selectOption('nasal');await page.locator('#entry-select').selectOption('ipa:ng');
await page.locator('#air-toggle').check();await page.locator('[data-step="1"]').click();await page.waitForTimeout(150);
assert.equal((await page.evaluate(()=>window.labSnapshot())).pose.nasal,1);
await page.screenshot({path:'qa/48-nasal-desktop.png',fullPage:true});const nasalPixels=await checkCanvas();
await page.locator('#library-mode').selectOption('letters');
for(const letter of Object.keys(LETTERS)){
 await page.locator('#entry-select').selectOption('letter:'+letter);await page.locator('[data-step="1"]').click();
 assert.equal((await page.evaluate(()=>window.labSnapshot())).sound,'letter:'+letter);
}
await page.locator('#entry-select').selectOption('letter:W');await page.locator('#play').click();await page.waitForTimeout(350);
assert((await page.evaluate(()=>window.labSnapshot())).progress>0);await page.locator('#play').click();
await page.locator('[data-step="1"]').click();await page.waitForTimeout(100);
await page.screenshot({path:'qa/26-letter-desktop.png',fullPage:true});await checkCanvas();
await page.locator('#entry-select').selectOption('alphabet');await page.locator('#play').click();await page.waitForTimeout(200);assert((await page.evaluate(()=>window.labSnapshot())).progress>0);await page.locator('#play').click();
await page.locator('#head-model').selectOption('tom');
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'qa/05-mobile.png',fullPage:true});
await page.locator('#entry-select').selectOption('letter:W');await page.locator('[data-step="1"]').click();await page.waitForTimeout(100);
await page.screenshot({path:'qa/26-letter-mobile.png',fullPage:true});await checkCanvas();
await page.locator('#library-mode').selectOption('ipa');await page.locator('#category').selectOption('cluster');await page.locator('#entry-select').selectOption('ipa:dr');await page.locator('[data-step="2"]').click();await page.waitForTimeout(100);
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'qa/48-cluster-mobile.png',fullPage:true});await checkCanvas();
assert.equal(errors.length,0,errors.join('\n'));
state=await page.evaluate(()=>window.labSnapshot());
await writeFile('qa/checks.json',JSON.stringify({initial,final:state,phonemesVisited:visited,lettersVisited:Object.keys(LETTERS).length,nasalPixels,checks:['WebGL loaded','play advances','pause stable','scrub morphs','side swap','independent alpha','plosive closure blocks','release flow','muscle selection','vowel voicing','hide airflow','48 phonemes selectable','26 letters selectable','alphabet playback','nasal routing','desktop and mobile canvas pixels','mobile no overflow'],errors},null,2));
console.log('BROWSER_CHECKS_PASSED',initial.meshCount,'48 phonemes, 26 letters, alphabet playback, desktop/mobile pixels',nasalPixels);
}finally{await browser.close();}
