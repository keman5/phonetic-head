import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {launchBrowser} from './browser-test-utils.mjs';
import {PHONEMES} from './dist/phonemes.js';

// Run against the local app: npm start, then node --test interface.test.mjs.
test('modern interface preserves the working pronunciation lab', {timeout: 120000}, async t => {
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/lab.html', {waitUntil: 'networkidle'});
  await page.waitForFunction(() => window.labSnapshot?.().ready, {}, {timeout: 60000});
  const snapshot = () => page.evaluate(() => window.labSnapshot());
  async function choose(id, value) {
    if(id==='entry-select'){await page.locator(`[data-sound="${value}"]`).click();return;}
    await page.locator('#' + id + ' .select-trigger').click();
    await page.locator('#' + id + ' [role="option"][data-value="' + value + '"]').click();
  }
  await mkdir('qa', {recursive: true});

  await t.test('desktop renders the real model with unique IDs', async () => {
    assert.equal((await snapshot()).ready, true);
    assert.equal(await page.locator('#vowel-picker button').count(), 12);
    assert.equal(await page.locator('#panel-model').isVisible(), false);
    const duplicateIds = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
      return ids.filter((id, i) => ids.indexOf(id) !== i);
    });
    assert.deepEqual(duplicateIds, []);
    await page.screenshot({path: 'qa/interface-desktop.png', fullPage: true});
  });

  await t.test('tabs support keyboard navigation and organ selection reveals settings', async () => {
    await page.locator('#tab-practice').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#tab-model').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#panel-model').isVisible(), true);
    await page.keyboard.press('Home');
    assert.equal(await page.locator('#panel-practice').isVisible(), true);
    await page.locator('[data-guide="tongue"]').click();
    assert.equal(await page.locator('#panel-model').isVisible(), true);
    assert.match(await page.locator('#selection').innerText(), /舌头/);
    assert.equal(await page.locator('#teacher-tools').evaluate(e=>e.open),true);
    await page.locator('#anatomy-details').check();
  await page.waitForFunction(()=>!teachingSnapshot().childMode);
    assert.equal((await page.evaluate(() => teachingSnapshot())).childMode, false);
    await page.locator('#anatomy-details').uncheck();
    await page.locator('[data-preset="surface"]').click();
    assert.equal((await snapshot()).alpha.right, 0);
    await page.locator('[data-preset="cutaway"]').click();
    assert.equal((await snapshot()).alpha.right, 100);
    await page.locator('#tab-practice').click();
  });

  await t.test('all sound categories, vowels, letters and contrast remain selectable', async () => {
    for (const [category, sound] of [['vowel','i'],['diphthong','ei'],['plosive','p'],['fricative','f'],['affricate','ch'],['nasal','m'],['approximant','l'],['cluster','ts']]) {
      await choose('category', category);
      assert.equal(await page.locator('#entry-select').count(), 0);
      const expected=Object.values(PHONEMES).filter(p=>p.category===category).map(p=>'ipa:'+p.id);
      assert.deepEqual(await page.locator('#vowel-picker [data-sound]').evaluateAll(buttons=>buttons.map(b=>b.dataset.sound)),expected);
      assert.equal(await page.locator('#vowel-picker button:visible').count(),expected.length);
      await choose('entry-select', 'ipa:' + sound);
      assert.equal((await snapshot()).sound, 'ipa:' + sound);
      assert.equal(await page.locator('#vowel-picker [aria-pressed=true]').getAttribute('data-sound'),'ipa:'+sound);
    }
    await choose('library-mode', 'vowels');
    assert.equal(await page.locator('#entry-select').count(), 0);
    await page.locator('[data-vowel="ae"]').click();
    assert.equal((await snapshot()).sound, 'ipa:ae');
    await page.locator('#contrast-sound').click();
    assert.equal((await snapshot()).sound, 'ipa:e');
    await choose('library-mode', 'letters');
    assert.equal(await page.locator('#vowel-picker button:visible').count(),27);
    await choose('entry-select', 'letter:Z');
    assert.equal((await snapshot()).sound, 'letter:Z');
    await choose('entry-select', 'alphabet');
    assert.equal((await snapshot()).sound, 'alphabet');
    await page.locator('[data-sound="letter:D"]').focus();
    await page.keyboard.press('Enter');
    assert.equal((await snapshot()).sound,'letter:D');
    await page.setViewportSize({width:320,height:900});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.setViewportSize({width:1440,height:1000});
    await choose('library-mode', 'ipa');
    await choose('category', 'vowel');
  });

  await t.test('audio, slow motion and timeline work with the sole human head', async () => {
    await choose('voice', 'male');
    assert.equal((await snapshot()).audio.voice, 'male');
    await page.locator('#play').click();
    await page.waitForFunction(() => labSnapshot().audio.currentTime > 0);
    await page.locator('#restart').click();
    assert.equal((await snapshot()).playing, false);
    await choose('voice', 'female');
    await page.locator('#watch-demo').click();
    await page.waitForFunction(() => labSnapshot().playing && labSnapshot().progress > 0);
    assert.equal(await page.locator('#motion-only').isChecked(), true);
    await page.locator('#play').click();
    assert.equal((await snapshot()).playing, false);
    await page.locator('#timeline').fill('750');
    assert.equal((await snapshot()).progress, .75);
    await page.locator('#speed').fill('0.5');
    assert.equal((await snapshot()).audio.rate, .5);
    await page.locator('#air-toggle').uncheck();
    await page.waitForFunction(() => !labSnapshot().airVisible);
    await page.locator('#air-toggle').check();
    await page.locator('#speed').fill('1');
    await page.locator('#motion-only').uncheck();
    assert.equal(await page.locator('#head-model').count(), 0);
    assert.deepEqual((await snapshot()).headModels, ['human']);
    assert((await snapshot()).visibleHeadMeshes > 0);
    await page.locator('#tab-model').click();
    await page.locator('[data-preset="cutaway"]').click();
    await page.locator('[data-view="right"]').click();
    await page.locator('#tab-practice').click();
    await page.locator('#try-demo').click();
    assert.equal(await page.locator('#practice-checks').getAttribute('open'), '');
    await page.locator('#practice-checks summary').click();
  });

  await t.test('320–1920px layouts do not overflow; mobile library stays open until manually collapsed', async () => {
    for (const width of [1920, 1440, 1200, 1024, 768, 760, 390, 320]) {
      await page.setViewportSize({width, height: 900});
      await page.waitForFunction(() => Math.abs(
        document.querySelector('#viewer canvas').getBoundingClientRect().width
        - document.querySelector('#viewer').getBoundingClientRect().width
      ) < 2);
      const measured = await page.evaluate(() => ({
        width: innerWidth, scroll: document.documentElement.scrollWidth,
        canvas: document.querySelector('#viewer canvas').getBoundingClientRect().width,
        host: document.querySelector('#viewer').getBoundingClientRect().width
      }));
      assert(measured.scroll <= measured.width, JSON.stringify(measured));
      assert(Math.abs(measured.canvas - measured.host) < 2, 'canvas must resize with layout');
    }
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.locator('#sound-library').getAttribute('open'), '');
    await page.locator('[data-vowel="ae"]').click();
    assert.equal((await snapshot()).sound, 'ipa:ae');
    assert.equal(await page.locator('#sound-library').getAttribute('open'), '');
    await page.locator('#sound-library > summary').click();
    assert.equal(await page.locator('#sound-library').getAttribute('open'), null);
    assert.equal(await page.locator('#sound-library > summary').evaluate(el => document.activeElement === el), true);
    await page.screenshot({path: 'qa/interface-mobile.png', fullPage: true});
    await page.locator('#tab-model').click();
    assert.equal(await page.locator('#panel-model').isVisible(), true);
    assert.equal(await page.locator('#teacher-tools').evaluate(e=>e.open),true);
    await page.locator('#layer-organ').fill('40');
    assert.equal((await snapshot()).alpha.organ, 40);
  });
  assert.deepEqual(errors, []);
});
