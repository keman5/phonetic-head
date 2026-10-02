import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';

test('neutral human model: opacity, picking, idle rendering and animation',{timeout:120000},async t=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/shader|THREE/i.test(m.text()))errors.push(m.text());});
  page.on('request',r=>requests.push(r.url()));
  await page.goto('http://127.0.0.1:4173');
  await page.waitForFunction(()=>window.labSnapshot?.().ready,{}, {timeout:90000});
  assert(!requests.some(url=>url.includes('character-heads.glb')));
  const initial=await page.evaluate(()=>labSnapshot());
  assert.deepEqual(initial.headModels,['human']);
  assert(initial.humanEyeColors.every(c=>c==='ffdcbd'));
  assert.equal(await page.locator('#head-model').count(),0);
  await page.locator('#tab-model').click();
  await page.locator('#teacher-tools summary').click();

  const timings=await page.evaluate(async()=>{
    const frames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const input=document.querySelector('#left-alpha'),samples=[];
    for(const value of [20,30,40,50,60]){
      const start=performance.now();input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));
      await frames();samples.push({milliseconds:performance.now()-start,version:renderSnapshot().materialVersion});
    }
    return samples;
  });
  assert.equal(new Set(timings.map(x=>x.version)).size,1,'dragging within transparent mode must not recompile materials');
  assert.equal((await page.evaluate(()=>labSnapshot())).alpha.left,60);
  await page.locator('#swap-sides').click();
  assert.deepEqual(await page.evaluate(()=>[labSnapshot().alpha.left,labSnapshot().alpha.right]),[100,60]);
  await page.locator('#right-alpha').fill('0');
  await page.waitForFunction(()=>labSnapshot().visibleSides.right>0&&labSnapshot().visibleSides.left===0);
  assert.equal((await page.evaluate(()=>teachingSnapshot())).filledContours,1);
  await page.locator('[data-preset="surface"]').click();
  await page.locator('[data-view="front"]').click();
  await page.waitForFunction(()=>!learningSnapshot().cameraMoving);
  await page.waitForTimeout(250);
  const idle=await page.evaluate(async()=>{
    const before=renderSnapshot().renderCount;
    for(let i=0;i<20;i++)await new Promise(requestAnimationFrame);
    return {before,after:renderSnapshot().renderCount};
  });
  assert.equal(idle.after,idle.before,'paused scene must not redraw continuously');
  const canvas=page.locator('#viewer canvas');
  const box=await canvas.boundingBox();
  const clickStart=performance.now();
  await canvas.click({position:{x:box.width*.5,y:box.height*.3}});
  const clickMs=performance.now()-clickStart;
  assert.doesNotMatch(await page.locator('body').innerText(),/stitched|atlas regions|aslas regions|米奇|汤姆猫/i);
  assert.match(await page.locator('#selection').innerText(),/头部皮肤/);
  await page.locator('#clear-focus').click();
  await mkdir('qa',{recursive:true});
  await page.screenshot({path:'qa/neutral-front.png',fullPage:true});
  await page.locator('[data-preset="cutaway"]').click();
  await page.locator('[data-view="right"]').click();
  await page.waitForFunction(()=>!learningSnapshot().cameraMoving);
  await page.locator('#left-alpha').fill('45');
  await page.waitForFunction(()=>labSnapshot().alpha.left===45);
  await page.screenshot({path:'qa/neutral-half.png',fullPage:true});
  await page.locator('#anatomy-details').check();
  assert((await page.evaluate(()=>teachingSnapshot())).visibleDetails>0);
  await page.locator('#anatomy-details').uncheck();
  assert.equal((await page.evaluate(()=>teachingSnapshot())).visibleDetails,0);
  await page.locator('#tab-practice').click();
  await page.locator('#watch-demo').click();
  await page.waitForFunction(()=>labSnapshot().playing&&labSnapshot().progress>.1);
  assert((await page.evaluate(()=>labSnapshot())).morphMeshes>0);
  await page.locator('#play').click();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({meshes:initial.meshCount,sections:initial.sectionCapCount,timings,idle,clickMs}));
});
