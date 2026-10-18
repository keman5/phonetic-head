import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launchBrowser} from './browser-test-utils.mjs';

test('expanded help, coloured anatomy guides and vocal zoom work in the real browser', {timeout:120000}, async t=>{
  const browser=await launchBrowser();t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/shader|THREE/i.test(m.text()))errors.push(m.text());});
  await page.goto('http://127.0.0.1:4173/lab.html');
  await page.waitForFunction(()=>window.labSnapshot?.().ready,{}, {timeout:90000});
  for(const selector of ['#sound-library','.lesson-note','#practice-checks','#teacher-tools'])
    assert.equal(await page.locator(selector).evaluate(e=>e.open),true,selector);
  assert.equal(await page.locator('[data-organ]').count(),6);
  await page.locator('#tab-model').click();
  await page.locator('[data-preset=surface]').click();
  let tissues=await page.evaluate(()=>opacitySnapshot().meshes);
  assert.equal(tissues.filter(m=>m.teachingOnly&&m.visible).length,6,'one hard/soft/uvula mesh per half');
  assert.equal(tissues.filter(m=>m.teacherOnly&&m.visible).length,0,'atlas palate cannot overlap the child roof');
  assert(tissues.filter(m=>m.name==='Epiglottis').every(m=>!m.visible),'unneeded flap is hidden');
  await page.locator('#anatomy-details').check();
  tissues=await page.evaluate(()=>opacitySnapshot().meshes);
  assert.equal(tissues.filter(m=>m.teachingOnly&&m.visible).length,0);
  assert.equal(tissues.filter(m=>m.teacherOnly&&m.visible).length,4,'source soft palate and uvula preserved for teacher');
  await page.locator('#anatomy-details').uncheck();
  await page.locator('[data-preset=cutaway]').click();
  for(const [id,description] of [['nasal','鼻腔通道'],['velum','硬腭'],['airway','不是器官']]){
    await page.locator(`[data-organ=${id}]`).click();
    assert((await page.locator('#part-description').innerText()).includes(description));
    assert.equal(await page.locator(`[data-organ=${id}]`).getAttribute('aria-pressed'),'true');
  }
  await page.locator('[data-organ="hard-palate"]').click();
  assert.match(await page.locator('#part-description').innerText(),/硬腭.*不随发音/);
  assert.equal(await page.locator('[data-guide="hard-palate"]').getAttribute('aria-pressed'),'true');
  await page.locator('#part-demo').click();
  assert.equal(await page.evaluate(()=>labSnapshot().sound),'ipa:t');
  assert.equal(await page.evaluate(()=>labSnapshot().playing),false,'part preview never unexpectedly plays sound');
  assert.equal(await page.evaluate(()=>labSnapshot().progress),.5);
  await page.locator('[data-organ="velum"]').click();
  await page.locator('#part-demo').click();
  assert.equal(await page.evaluate(()=>labSnapshot().sound),'ipa:n');
  assert.match(await page.locator('#part-try').innerText(),/ɑː.*n/);
  await page.locator('#part-compare').click();
  assert.equal(await page.evaluate(()=>labSnapshot().sound),'ipa:ah');
  assert.equal(await page.locator('[data-organ="velum"]').getAttribute('aria-pressed'),'true');
  await page.locator('#layer-organ').fill('100');
  await page.waitForFunction(()=>document.querySelector('[data-guide="velum"]').hidden);
  await page.locator('#layer-organ').fill('0');
  // Top camera shortcut must also reveal the hidden half, not point at opaque skin.
  await page.locator('[data-preset=surface]').click();
  await page.locator('[data-view=voice]').click();
  await page.waitForFunction(()=>!learningSnapshot().cameraMoving);
  assert.equal(await page.evaluate(()=>labSnapshot().alpha.right),100);
  assert.equal(await page.locator('[data-view=voice]').evaluate(e=>e.classList.contains('chosen')),true);
  assert.match(await page.locator('#selection').innerText(),/喉部/);
  assert.equal(await page.locator('.voice-location').isVisible(),true);
  await page.locator('#stage').screenshot({path:'qa/voice-location.png'});
  await page.locator('#swap-sides').click();
  await page.locator('#layer-muscle').fill('100');
  await page.locator('#zoom-voice').click();
  assert.deepEqual(await page.evaluate(()=>[labSnapshot().alpha.left,labSnapshot().alpha.right,labSnapshot().alpha.muscle]),[0,100,0]);
  // Voiceless /s/ and voiced /z/ must look different; scrubbing changes the current phoneme too.
  async function choose(id,value){
    if(id==='entry-select'){await page.locator(`[data-sound="${value}"]`).click();return;}
    await page.locator(`#${id} .select-trigger`).click();
    await page.locator(`#${id} [role=option][data-value="${value}"]`).click();
  }
  await choose('category','fricative');
  await choose('entry-select','ipa:s');
  await page.waitForFunction(()=>document.querySelector('#vocal-card').dataset.voiced==='false');
  await choose('entry-select','ipa:z');
  await page.waitForFunction(()=>document.querySelector('#vocal-card').dataset.voiced==='true');
  await page.locator('#motion-only').check();
  await page.locator('#loop').check();
  await page.locator('#play').click();
  await page.waitForFunction(()=>document.querySelector('#vocal-card').classList.contains('is-vibrating'));
  await page.locator('#reduce-motion').check();
  await page.waitForFunction(()=>!document.querySelector('#vocal-card').classList.contains('is-vibrating'));
  await page.locator('#play').click();
  await choose('category','vowel');
  for(const id of ['i','ae','uu']){
    await page.locator(`[data-vowel=${id}]`).click();
    await page.locator('[data-attention=lips]').click();
    await page.waitForFunction(()=>!learningSnapshot().cameraMoving);
    await page.locator('#air-toggle').uncheck();
    await page.locator('#stage').screenshot({path:`qa/lip-pose-${id}.png`});
  }
  await choose('category','plosive');
  await choose('entry-select','ipa:p');
  await page.locator('#timeline').fill('250');
  await page.locator('[data-attention=lips]').click();
  await page.waitForFunction(()=>!learningSnapshot().cameraMoving);
  await page.locator('#stage').screenshot({path:'qa/lip-pose-p.png'});
  await page.locator('#zoom-voice').click();
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#sound-library').evaluate(e=>e.open),true);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'qa/anatomy-mobile.png',fullPage:true});
  for(const selector of ['#anatomy-key','#part-activity'])assert(await page.locator(selector).evaluate(e=>e.scrollWidth<=e.clientWidth),'child explanations fit mobile');
  assert.deepEqual(errors,[]);
});
