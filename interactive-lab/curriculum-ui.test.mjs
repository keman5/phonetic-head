import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {launchBrowser} from './browser-test-utils.mjs';

test('curriculum progresses from a sound to a sentence and keeps keyboard/mobile controls usable', {timeout: 120000}, async t => {
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/lab.html', {waitUntil: 'networkidle'});
  await page.waitForFunction(() => window.labSnapshot?.().ready, {}, {timeout: 60000});
  await page.locator('#library-mode .select-trigger').click();
  await page.locator('#library-mode [role="option"][data-value="curriculum"]').click();
  assert.equal(await page.locator('#curriculum-card').isVisible(), true);
  assert.equal(await page.locator('#course-stages [role="tab"]').count(), 4);
  assert.match(await page.locator('#course-sound-note').innerText(), /名称.*diː.*声音.*d/);
  assert.equal(await page.locator('#course-previous').isDisabled(), true);

  await page.locator('#course-stages [role="tab"][aria-selected="true"]').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal((await page.locator('#course-text').innerText()).trim(), 'dog');
  assert.equal(await page.locator('#course-stage-1').evaluate(el => document.activeElement === el), true);
  await page.locator('#course-next').click();
  assert.equal((await page.locator('#course-text').innerText()).replace(/\s+/g, ' ').trim(), 'big dog');
  await page.locator('#course-next').click();
  assert.equal((await page.locator('#course-text').innerText()).replace(/\s+/g, ' ').trim(), 'This is a big dog.');
  assert.equal(await page.locator('#course-next').isDisabled(), true);
  await mkdir('qa', {recursive: true});
  await page.screenshot({path: 'qa/curriculum-desktop.png', fullPage: true});
  await page.locator('#course-stage-3').focus();
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#course-stage-0').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('End');
  assert.equal(await page.locator('#course-stage-3').getAttribute('aria-selected'), 'true');
  await page.locator('#course-listen').click();
  await page.waitForFunction(() => document.querySelector('#course-text [aria-current="true"]'));
  await page.locator('#course-listen').click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('#course-text [aria-current="true"]').count(), 0);

  await page.locator('#course-series .select-trigger').click();
  await page.locator('#course-series [role="option"][data-value="cat"]').click();
  assert.equal((await page.locator('#course-text').innerText()).trim(), 'c');
  assert.equal(await page.locator('#course-previous').isDisabled(), true);
  assert.match(await page.locator('#course-sound-note').innerText(), /siː.*k/);
  await page.locator('#course-next').click();
  assert.equal((await page.locator('#course-text').innerText()).trim(), 'cat');
  await page.locator('#course-series .select-trigger').click();
  await page.locator('#course-series [role="option"][data-value="dog"]').click();
  await page.locator('#course-stage-3').click();

  for (const width of [1440, 1024, 760, 390, 320]) {
    await page.setViewportSize({width, height: 900});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px overflows`);
    for (const id of ['course-listen', 'course-next', 'course-previous']) {
      assert((await page.locator(`#${id}`).boundingBox()).height >= 44, `${id} touch target is too small`);
    }
  }
  await page.screenshot({path: 'qa/curriculum-mobile.png', fullPage: true});
  await page.locator('#library-mode .select-trigger').click();
  await page.locator('#library-mode [role="option"][data-value="ipa"]').click();
  assert.equal(await page.locator('#curriculum-card').isVisible(), false);
  assert.equal(await page.locator('#entry-select').count(), 0);
  assert.equal(await page.locator('#vowel-picker').isVisible(), true);
  assert.deepEqual(errors, []);
});
