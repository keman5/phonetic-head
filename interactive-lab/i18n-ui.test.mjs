import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from './server.mjs';
import {launchBrowser} from './browser-test-utils.mjs';

async function setup(t, locale='en-GB') {
  const dataDir=await mkdtemp(join(tmpdir(),'phonetic-i18n-'));
  const app=createApp({dataDir});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  const browser=await launchBrowser(),context=await browser.newContext({locale});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const base='http://127.0.0.1:'+app.address().port;
  t.after(async()=>{await browser.close();await new Promise(resolve=>app.close(resolve));await rm(dataDir,{recursive:true,force:true});assert.deepEqual(errors,[]);});
  return {page,context,base};
}
async function noChinese(page) {
  const missing=await page.evaluate(()=>{
    const found=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
      const n=walker.currentNode;
      if(!n.parentElement.closest('script,style,textarea,input,#language-select')&&/\p{Script=Han}/u.test(n.textContent))found.push(n.textContent.trim());
    }
    for(const el of document.querySelectorAll('[aria-label],[title],[placeholder],[aria-valuetext]'))for(const key of ['aria-label','title','placeholder','aria-valuetext'])if(/\p{Script=Han}/u.test(el.getAttribute(key)||''))found.push(key+': '+el.getAttribute(key));
    return [...new Set(found)];
  });
  assert.deepEqual(missing,[]);
}

test('English browser localizes all public pages, embedded lab and dynamic teaching content',{timeout:180000},async t=>{
  const {page,base}=await setup(t);
  await page.goto(base+'/');await page.locator('.course-card').first().waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  assert.equal(await page.locator('#language-select').inputValue(),'auto');
  assert.match(await page.locator('.course-card h3').first().innerText(),/new friend/);
  await noChinese(page);
  for(const path of ['/practice.html','/practice.html?mode=sing']){
    await page.goto(base+path);await page.locator('[data-voice=record]').waitFor();await noChinese(page);
    assert.equal(await page.locator('#practice-context h2').getAttribute('lang'),path.includes('sing')?'en':'en-GB');
  }
  await page.goto(base+'/learn.html?course=dog');
  await page.waitForFunction(()=>document.querySelector('#model-frame').contentWindow.teachingPlayer?.ready,null,{timeout:90000});
  assert.equal(await page.locator('#model-frame').evaluate(frame=>frame.contentDocument.documentElement.lang),'en');
  assert.match(await page.locator('#reading-text').textContent(),/Thisisabigdog/);
  await noChinese(page);
  await page.locator('#text-mode').click();assert.match(await page.locator('#feedback').textContent(),/Text and audio/);
  await page.evaluate(()=>localStorage.setItem('phonetic-journey-v1',JSON.stringify({dog:{step:0,done:[0,1,2,3,4,5,6]}})));
  await page.reload();await page.locator('#chapters button').last().waitFor();
  for(let i=0;i<8;i++){await page.locator('#chapters button').nth(i).click();await page.waitForFunction(i=>document.body.dataset.chapter===String(i),i);await noChinese(page);}
  await page.goto(base+'/lab.html');await page.waitForFunction(()=>window.teachingPlayer?.ready,null,{timeout:90000});
  await noChinese(page);
  const untranslated=await page.evaluate(async()=>{
    const {PHONEMES,CATEGORIES}=await import('./phonemes.js');
    const {lessonFor}=await import('./teaching.js');
    const {SOUNDS,FOCUS}=await import('./motion.js');
    return JSON.stringify([PHONEMES,CATEGORIES,SOUNDS,FOCUS,Object.keys(PHONEMES).map(lessonFor)]).match(/[^"{}]*\p{Script=Han}[^"{}]*/gu)||[];
  });
  assert.deepEqual(untranslated,[]);
  for(const mode of ['vowels','letters','curriculum','ipa']){
    await page.locator('#library-mode').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));},mode);
    await noChinese(page);
  }
  await page.locator('[data-view=lips]').click();await noChinese(page);
  await mkdir('qa/i18n',{recursive:true});await page.screenshot({path:'qa/i18n/lab-en.png'});
});

test('manual choice survives navigation, reload and switches back to browser language',{timeout:60000},async t=>{
  const {page,context,base}=await setup(t,'zh-CN');
  await page.goto(base+'/');await page.locator('.course-card').first().waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
  const progress=JSON.stringify({dog:{step:1,done:[0]}});
  await page.evaluate(value=>localStorage.setItem('phonetic-journey-v1',value),progress);
  await page.locator('#language-select').selectOption('en');await page.waitForFunction(()=>document.documentElement.lang==='en');
  await page.locator('.site-navigation a[data-destination=speech]').click();await page.locator('[data-voice=record]').waitFor();
  assert.equal(await page.locator('#language-select').inputValue(),'en');await noChinese(page);
  await page.reload();assert.equal(await page.locator('html').getAttribute('lang'),'en');
  assert.equal(await page.evaluate(()=>localStorage.getItem('phonetic-journey-v1')),progress);
  await page.locator('#language-select').selectOption('auto');await page.waitForFunction(()=>document.documentElement.lang==='zh-CN');
  assert.equal(await page.locator('#language-select').inputValue(),'auto');
  const unsupported=await context.browser().newPage({locale:'de-DE'});await unsupported.goto(base+'/');await unsupported.locator('.course-card').first().waitFor();
  assert.equal(await unsupported.locator('html').getAttribute('lang'),'en');await unsupported.close();
});

test('focusing the sticky language switch keeps the scroll position with mouse and keyboard',{timeout:120000},async t=>{
  const {page,base}=await setup(t,'zh-CN');
  for(const path of ['/','/learn.html?course=dog','/practice.html','/lab.html']){
    await page.goto(base+path);
    if(path==='/')await page.locator('.course-card').first().waitFor();
    if(path.includes('learn'))await page.waitForFunction(()=>document.body.dataset.chapter);
    if(path==='/practice.html')await page.locator('[data-voice=record]').waitFor();
    if(path==='/lab.html')await page.waitForFunction(()=>window.teachingPlayer?.ready,null,{timeout:90000});
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:800});
      for(const method of ['focus','mouse','keyboard']){
        const before=await page.evaluate(()=>{
          document.activeElement.blur();scrollTo(0,300);return scrollY;
        });
        assert(before>100,`${path} at ${width} must be scrolled`);
        if(method==='focus')await page.locator('#language-select').focus();
        if(method==='mouse'){
          const box=await page.locator('#language-select').boundingBox();
          await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
          await page.keyboard.press('Escape');
        }
        if(method==='keyboard'){
          await page.evaluate(()=>{
            const controls=[...document.querySelectorAll('body > header a, body > header button, body > header select')];
            controls[controls.indexOf(document.querySelector('#language-select'))-1].focus({preventScroll:true});
          });
          await page.keyboard.press('Tab');
        }
        assert.equal(await page.locator('#language-select').evaluate(el=>el===document.activeElement),true);
        assert.equal(await page.evaluate(()=>scrollY),before,`${path} at ${width}: ${method}`);
      }
    }
  }
});

test('language reload does not reset classroom scroll while chapter navigation still starts at the title',{timeout:90000},async t=>{
  const {page,base}=await setup(t,'zh-CN');
  await page.goto(base+'/');
  await page.evaluate(()=>localStorage.setItem('phonetic-journey-v1',JSON.stringify({dog:{step:0,done:[0]}})));
  await page.goto(base+'/learn.html?course=dog');
  await page.waitForFunction(()=>document.body.dataset.chapter==='0');
  await page.waitForFunction(()=>document.querySelector('#model-frame').contentWindow.teachingPlayer?.ready,null,{timeout:90000});
  await page.locator('#language-select').evaluate(el=>el.focus({preventScroll:true}));
  await page.evaluate(()=>scrollTo(0,300));
  const before=await page.evaluate(()=>scrollY);
  assert(before>100);
  // Native scroll anchoring may adjust for asynchronously rendered course content.
  await Promise.all([page.waitForEvent('load'),page.locator('#language-select').selectOption('zh-CN')]);
  await page.waitForFunction(()=>document.body.dataset.chapter==='0');
  await page.waitForFunction(()=>document.querySelector('#model-frame').contentWindow.teachingPlayer?.ready,null,{timeout:90000});
  assert(await page.evaluate(()=>scrollY)>100,'reloading the language must not reset the page to the top');
  await Promise.all([page.waitForEvent('load'),page.locator('#language-select').selectOption('en')]);
  await page.waitForFunction(()=>document.documentElement.lang==='en'&&document.body.dataset.chapter==='0');
  await page.waitForFunction(()=>document.querySelector('#model-frame').contentWindow.teachingPlayer?.ready,null,{timeout:90000});
  assert(await page.evaluate(()=>scrollY)>100,'changing the language must not reset the page to the top');
  await page.locator('#chapters button').nth(1).click();
  await page.waitForFunction(()=>document.body.dataset.chapter==='1');
  assert.equal(await page.evaluate(()=>scrollY),0);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'screen-title');
});

test('English administration translates errors and protects unsaved edits during language switches',{timeout:90000},async t=>{
  const {page,base}=await setup(t);
  await page.goto(base+'/admin.html');await page.locator('#login-panel').waitFor({state:'visible'});await noChinese(page);
  await page.locator('#login-password').fill('wrong-password');await page.locator('#login-form button').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Incorrect account'));
  await page.locator('#login-password').fill('111111');await page.locator('#login-form button').click();
  await page.locator('#current-password').fill('111111');await page.locator('#new-password').fill('Locale-test-password9!');await page.locator('#confirm-password').fill('Locale-test-password9!');await page.locator('#password-form button[type=submit]').click();
  await page.locator('#login-password').fill('Locale-test-password9!');await page.locator('#login-form button').click();
  await page.waitForFunction(()=>document.querySelector('#course-list button')&&!document.body.classList.contains('busy'));
  await noChinese(page);
  await page.locator('#tab-settings').click();await noChinese(page);await page.locator('#tab-courses').click();
  await page.locator('#course-title').fill('Unsaved course');
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('#language-select').selectOption('zh-CN');
  assert.equal(await page.locator('#course-title').inputValue(),'Unsaved course');assert.equal(await page.locator('html').getAttribute('lang'),'en');
  assert.equal(await page.locator('#language-select').inputValue(),'auto');
  for(const width of [390,320]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.screenshot({path:'qa/i18n/admin-en-mobile.png',fullPage:true});
});

test('storage restrictions do not prevent automatic or manual language selection',{timeout:60000},async t=>{
  const {page,base}=await setup(t,'zh-TW');
  await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('blocked','SecurityError');}}));
  await page.goto(base+'/');await page.locator('.course-card').first().waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
  await page.locator('#language-select').selectOption('en');await page.waitForFunction(()=>document.documentElement.lang==='en');await noChinese(page);
});

test('English layouts fit narrow screens and keep the language switch accessible',{timeout:120000},async t=>{
  const {page,base}=await setup(t);
  for(const path of ['/','/learn.html?course=dog','/practice.html','/practice.html?mode=sing','/lab.html']){
    await page.goto(base+path);await page.locator('#language-select').waitFor();
    if(path.includes('learn'))await page.locator('#screen-title').filter({hasText:/new friend/}).waitFor();
    if(path==='/lab.html')await page.waitForFunction(()=>window.teachingPlayer?.ready,null,{timeout:90000});
    for(const width of [390,320]){
      await page.setViewportSize({width,height:900});
      const overflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1&&el.getBoundingClientRect().width>0).slice(0,8).map(el=>el.id||el.className||el.tagName));
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${path} at ${width}: ${overflow.join(', ')}`);
      assert(await page.locator('#language-select').isVisible());
    }
    await page.screenshot({path:`qa/i18n/${path.includes('lab')?'lab':path.includes('learn')?'learn':path.includes('sing')?'sing':path.includes('practice')?'practice':'home'}-en-mobile.png`});
  }
});
