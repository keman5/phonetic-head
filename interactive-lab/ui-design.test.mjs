import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from './server.mjs';
import {launchBrowser} from './browser-test-utils.mjs';

test('redesigned pages reflow with enlarged text and respect accessibility preferences', {timeout: 120000}, async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'phonetic-ui-design-'));
  const app = createApp({dataDir, key: ''});
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const browser = await launchBrowser();
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => app.close(resolve));
    await rm(dataDir, {recursive: true, force: true});
  });
  const page = await browser.newPage({locale: 'en-GB', reducedMotion: 'reduce'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const base = 'http://127.0.0.1:' + app.address().port;
  for (const route of ['/', '/learn.html?course=dog', '/practice.html', '/practice.html?mode=sing', '/lab.html', '/admin.html']) {
    await page.goto(base + route);
    await page.locator('#language-select').waitFor();
    await page.evaluate(() => document.documentElement.style.fontSize = '125%');
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({width, height: 1000});
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route}: enlarged text fits at ${width}px`);
    }
  }
  await page.goto(base + '/');
  await page.locator('.course-card').first().waitFor();
  await page.locator('.course-card').first().hover();
  assert.equal(await page.locator('.course-card').first().evaluate(el => getComputedStyle(el).transform), 'none', 'reduced motion keeps cards still');
  await page.locator('#continue').focus();
  assert(await page.locator('#continue').evaluate(el => parseFloat(getComputedStyle(el).outlineWidth) >= 2), 'keyboard focus remains visible');

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-transparency', value: 'reduce'}]});
  assert.equal(await page.locator('.school-header').evaluate(el => getComputedStyle(el).backdropFilter), 'none', 'reduced transparency removes the glass effect');
  await cdp.send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-contrast', value: 'more'}]});
  assert.equal(await page.locator('.school-header').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)', 'increased contrast uses an opaque header');
  assert.deepEqual(errors, []);
});
