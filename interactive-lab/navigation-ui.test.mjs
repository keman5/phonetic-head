import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {launchBrowser} from './browser-test-utils.mjs';

const origin = process.env.TEST_APP_URL || 'http://127.0.0.1:4173';
const labels = ['课程', '每日路径', '语音教练', '唱歌练习', '实验室'];

test('all pages share five reachable navigation links and one route-aware selection', {timeout:120000}, async t => {
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/coach/status', route => route.fulfill({json:{configured:false}}));
  const navigation = page.getByRole('navigation', {name:'学习导航',exact:true});
  async function selection(name) {
    await page.waitForFunction(name => document.querySelector('.site-navigation [aria-current=page]')?.textContent === name, name);
    assert.equal(await navigation.locator('[aria-current=page]').count(),1);
    assert.deepEqual(await navigation.getByRole('link').allTextContents(),labels);
  }
  await mkdir('qa',{recursive:true});
  for (const [route,selected] of [
    ['/','课程'], ['/index.html#daily-path','每日路径'],
    ['/learn.html?course=dog','课程'], ['/practice.html?course=cat','语音教练'],
    ['/practice.html?mode=sing&course=bird','唱歌练习'], ['/lab.html?lesson=dog-sound','实验室'],
  ]) {
    await page.goto(origin+route,{waitUntil:'domcontentloaded'});
    await selection(selected);
    if (route.startsWith('/learn')) await page.waitForFunction(() => document.querySelector('#lesson-name')?.textContent.trim(), null, {timeout:60000});
    for (const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:900});
      const bounds = await navigation.getByRole('link').evaluateAll(links => links.map(link => {
        const r = link.getBoundingClientRect();
        return {left:r.left,right:r.right,width:r.width,height:r.height,viewport:innerWidth};
      }));
      assert(bounds.every(r => r.left >= 0 && r.right <= r.viewport && r.width >= 44 && r.height >= 44), `${route}: all five touch targets visible at ${width}px`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route}: no overflow at ${width}px`);
    }
    if (route.startsWith('/learn')) assert.match(await page.locator('#lesson-name').innerText(),/./);
  }
  await page.goto(origin+'/');
  await selection('课程');
  await navigation.getByRole('link',{name:'每日路径',exact:true}).click();
  await selection('每日路径');
  await page.goBack();
  await selection('课程');
  await page.goForward();
  await selection('每日路径');
  await page.evaluate(() => { location.hash='courses'; });
  await selection('课程');
  await page.evaluate(() => { location.hash='daily-path'; });
  await selection('每日路径');
  await navigation.getByRole('link',{name:'唱歌练习',exact:true}).click();
  await selection('唱歌练习');
  await page.locator('#sing-reference').waitFor({state:'visible'});
  assert(await page.locator('#sing-reference').isVisible());
  await navigation.getByRole('link',{name:'语音教练',exact:true}).click();
  await selection('语音教练');
  await page.locator('#practice-topics button').nth(1).click();
  await selection('语音教练');
  assert.match(page.url(),/course=cat/);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'qa/navigation-practice-mobile.png'});
  await page.goto(origin+'/index.html#daily-path');
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(() => { scrollTo(0,0); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  await page.screenshot({path:'qa/navigation-home-desktop.png'});
  await page.goto(origin+'/lab.html?embed=1&lesson=dog-sound');
  assert.equal(await navigation.isVisible(),false,'embedded model keeps the parent navigation only');
  assert.deepEqual(errors,[]);
});
