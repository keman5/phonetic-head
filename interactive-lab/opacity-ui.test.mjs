import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launchBrowser} from './browser-test-utils.mjs';

test('half and layer transparency includes internal tissues and caps; both modes retain short teaching teeth', {timeout: 120000}, async t => {
  const browser = await launchBrowser(); t.after(() => browser.close());
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if(message.type()==='error' && /shader|THREE/i.test(message.text())) errors.push(message.text()); });
  await page.goto('http://127.0.0.1:4173/lab.html');
  await page.waitForFunction(() => window.labSnapshot?.().ready, {}, {timeout:90000});
  await page.locator('#tab-model').click();
  assert.equal(await page.locator('#teacher-tools').evaluate(e=>e.open),true);
  const cases=[[0,0,0,0],[0,7,0,0],[0,25,0,0],[0,50,0,0],[0,90,0,0],[0,100,0,0],
    [7,0,0,0],[25,0,0,0],[50,0,0,0],[90,0,0,0],[100,0,0,0],
    [50,50,0,0],[65,30,40,55],[100,100,0,0],[100,0,100,0]];
  for(const teacher of [false,true]){
  await page.locator('#anatomy-details').setChecked(teacher);
  for (const [left,right,skin,organ] of cases) {
    for (const [id,value] of [['left-alpha',left],['right-alpha',right],['layer-skin',skin],['layer-organ',organ]]) await page.locator('#'+id).fill(String(value));
    await page.waitForFunction(([l,r,s,o]) => { const a=labSnapshot().alpha; return a.left===l&&a.right===r&&a.skin===s&&a.organ===o; }, [left,right,skin,organ]);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const {meshes,caps} = await page.evaluate(() => opacitySnapshot());
    const alpha = await page.evaluate(() => labSnapshot().alpha);
    for (const mesh of meshes) {
      const expected = (1-alpha[mesh.side]/100)*(1-(alpha[mesh.layer]??alpha.skin)/100);
      assert(Math.abs(mesh.opacity-expected)<1e-8, mesh.name);
      if(expected===0) assert.equal(mesh.visible,false,mesh.name);
      if(mesh.core&&!teacher) assert.equal(mesh.visible,false,'child view must not show overlapping coarse cores');
      if(!teacher&&(mesh.layer==='eye'||mesh.name==='Gingiva')) assert.equal(mesh.visible,false,'unnecessary interior details stay hidden');
      if(teacher&&mesh.layer==='eye'&&expected>0) assert.equal(mesh.visible,true,'teacher eyes remain present and follow their owning half');
      if(mesh.layer==='skin'&&!mesh.core)
        assert.equal(mesh.depthPassVisible,mesh.visible&&expected>0&&expected<1,'nearest skin depth must also work in teacher mode');
    }
    for (const cap of caps) {
      const opposite=cap.side==='left'?'right':'left';
      const expected=Math.max(0,(alpha[opposite]-alpha[cap.side])/100)*(1-(alpha[cap.layer]??alpha.skin)/100);
      assert(Math.abs(cap.opacity-expected)<1e-8,'cut face must reveal only the difference between halves: '+cap.name);
      assert(cap.opacity<=cap.sourceOpacity+1e-8,'cutaway opacity cannot exceed its owning tissue');
      assert(Math.abs(cap.offsetX)<.0001,'cut face cannot protrude as a shifted centre slab');
      if(!teacher&&cap.contourFill)assert.equal(cap.depthWrite,false,'teaching cavity backdrop must not occlude teeth or tongue');
      if(!cap.sourceVisible||cap.opacity===0) assert.equal(cap.visible,false);
      if(left===right) assert.equal(cap.visible,false,'equal transparency must not create a cutaway');
    }
  }
  }
  await page.locator('#anatomy-details').uncheck();
  assert.equal(await page.evaluate(()=>opacitySnapshot().meshes.filter(m=>m.childTeeth).length),28);
  await page.locator('#anatomy-details').check();
  assert.equal(await page.evaluate(()=>opacitySnapshot().meshes.filter(m=>m.childTeeth).length),28,'anatomy details must not restore long roots');
  await page.locator('#anatomy-details').uncheck();
  assert.equal(await page.evaluate(()=>opacitySnapshot().meshes.filter(m=>m.childTeeth).length),28);
  // Opacity changes must also apply while the skin, teeth and cut faces morph.
  await page.locator('[data-preset="surface"]').click();
  await page.locator('[data-vowel="ae"]').click();
  await page.locator('#motion-only').check();
  await page.locator('#loop').check();
  await page.locator('#play').click();
  await page.waitForFunction(()=>labSnapshot().playing&&labSnapshot().progress>.15);
  for(const right of [7,50,100,0]){
    await page.locator('#right-alpha').fill(String(right));
    await page.locator('#left-alpha').fill('0');
    await page.waitForFunction(r=>labSnapshot().alpha.right===r,right);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const snapshot=await page.evaluate(()=>opacitySnapshot());
    for(const mesh of snapshot.meshes){
      const expected=(1-snapshot.alpha[mesh.side]/100)*(1-(snapshot.alpha[mesh.layer]??snapshot.alpha.skin)/100);
      assert(Math.abs(mesh.opacity-expected)<1e-8,'animated half opacity: '+mesh.name);
    }
    assert(snapshot.caps.every(c=>Math.abs(c.offsetX)<.0001));
  }
  await page.locator('#play').click();
  assert.deepEqual(errors,[]);
});
