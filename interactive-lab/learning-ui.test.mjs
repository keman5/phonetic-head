import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

test('child learning flow uses real playback and accessible local interactions', {timeout:180000}, async t => {
  const browser = await chromium.launch({channel:'chrome', headless:true});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport:{width:1440,height:1080}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForFunction(()=>window.labSnapshot?.().ready,{}, {timeout:60000});
  const lesson=()=>page.evaluate(()=>learningSnapshot());
  const lab=()=>page.evaluate(()=>labSnapshot());
  await mkdir('qa',{recursive:true});
  async function choose(id,value) {
    await page.locator(`#${id} [role=combobox]`).click();
    await page.locator(`#${id} [role=option][data-value="${value}"]`).click();
  }

  await t.test('watch pauses without a star, then resumes and finishes',async()=>{
    await page.locator('#loop').check();
    await page.locator('#practice-next').click();
    assert.equal((await lesson()).mode,'watch');
    assert.equal(await page.locator('#loop').isChecked(),false);
    assert.equal((await lab()).audio.rate,.65);
    assert.equal((await lab()).audio.paused,true);
    await page.waitForFunction(()=>labSnapshot().progress>.2);
    await page.locator('#practice-next').click();
    assert.equal((await lab()).playing,false);
    assert.deepEqual((await lesson()).done,[]);
    await page.locator('#play').click();
    await page.waitForFunction(()=>labSnapshot().progress>.48);
    await page.screenshot({path:'qa/learning-watch-desktop.png',fullPage:true});
    assert((await lab()).morphMeshes>0);
    await page.waitForFunction(()=>learningSnapshot().done.includes('watch'),{}, {timeout:20000});
    assert.equal((await lesson()).next,'listen');
  });

  await t.test('listening restores audible normal speed; self-check is explicitly not a score',async()=>{
    await page.locator('#sound-toggle').uncheck();
    await page.locator('#practice-next').click();
    await page.waitForFunction(()=>labSnapshot().audio.currentTime>0);
    assert.equal((await lab()).audio.muted,false);
    assert.equal((await lab()).audio.rate,1);
    await page.waitForFunction(()=>learningSnapshot().done.includes('listen'));
    await page.locator('#practice-next').click();
    assert.equal((await lab()).playing,false);
    assert.equal((await lesson()).mode,'try');
    assert.equal(await page.locator('#practice-checks').evaluate(e=>e.open),true);
    for(const input of await page.locator('#practice-checks input').all())await input.check();
    assert.equal((await lesson()).next,'complete');
    assert.equal(await page.locator('.exploration-stars .earned').count(),3);
    assert.match(await page.locator('#practice-message').textContent(),/老师/);
    assert.match(await page.locator('.practice-disclaimer').textContent(),/不代表发音评分/);
    await page.screenshot({path:'qa/learning-complete-desktop.png',fullPage:true});
    await page.locator('#practice-checks input').first().uncheck();
    assert.equal((await lesson()).next,'try');
  });

  await t.test('sound switching cancels old learning progress; focused cameras and nasal cues work',async()=>{
    await page.locator('#watch-demo').click();
    await page.locator('[data-vowel="u"]').click();
    assert.equal((await lab()).playing,false);
    assert.deepEqual((await lesson()).done,[]);
    assert.equal((await lesson()).mode,'idle');
    await page.locator('[data-attention="lips"]').click();
    assert.equal((await lab()).alpha.right,0);
    await page.locator('[data-attention="tongue"]').click();
    assert.equal((await lab()).alpha.right,100);
    await choose('category','nasal'); await choose('entry-select','ipa:m');
    await page.locator('[data-attention="air"]').click();
    await page.locator('[data-step="1"]').click();
    await page.waitForFunction(()=>document.querySelector('#attention-title').textContent.includes('鼻子'));
    await page.waitForFunction(()=>!learningSnapshot().cameraMoving);
    assert.equal(await page.locator('#attention-halo').isVisible(),true);
    await page.screenshot({path:'qa/learning-nasal-desktop.png',fullPage:true});
  });

  await t.test('audio failure can retry, and muted playback never earns a listening star',async()=>{
    const failedAudio='**/assets/audio/**/ipa-ei.wav';
    await page.route(failedAudio,route=>route.abort());
    await choose('category','diphthong');
    await page.locator('#listen-demo').click();
    await page.waitForFunction(()=>document.querySelector('#audio-status').textContent.includes('失败'));
    assert.equal((await lesson()).done.includes('listen'),false);
    assert.equal((await lab()).playing,false);
    await page.unroute(failedAudio);
    await page.locator('#listen-demo').click();
    await page.waitForFunction(()=>learningSnapshot().done.includes('listen'));
    await choose('library-mode','letters');await choose('entry-select','letter:W');
    await page.locator('#listen-demo').click();
    await page.locator('#speed').fill('0.2');
    await page.waitForFunction(()=>labSnapshot().audio.currentTime>0);
    await page.locator('#sound-toggle').uncheck();
    await page.locator('#speed').fill('3');
    await page.waitForFunction(()=>!labSnapshot().playing);
    assert.equal((await lesson()).done.includes('listen'),false);
    await choose('library-mode','ipa');await choose('category','nasal');await choose('entry-select','ipa:m');
  });

  await t.test('reduced motion, keyboard access, mobile layout and visible feedback',async()=>{
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>learningSnapshot().reducedMotion);
    await page.locator('[data-attention="tongue"]').focus();await page.keyboard.press('Enter');
    assert.equal((await lesson()).cameraMoving,false);
    for(const width of [1920,1440,1024,768,390,320]){
      await page.setViewportSize({width,height:844});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),String(width));
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('#watch-demo').click();
    const stage=await page.locator('#stage').boundingBox();
    assert(stage.y>=0 && stage.y<40,'guided playback brings model into view');
    await page.locator('#play').click();
    await page.screenshot({path:'qa/learning-mobile.png',fullPage:true});
    const duplicateIds=await page.evaluate(()=>{
      const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);
      return ids.filter((id,i)=>ids.indexOf(id)!==i);
    });
    assert.deepEqual(duplicateIds,[]);
  });
  assert.deepEqual(errors,[]);
});
