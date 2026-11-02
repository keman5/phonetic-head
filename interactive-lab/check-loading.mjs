import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {launchBrowser} from './browser-test-utils.mjs';

const label=process.argv[2]||'current';
assert.match(label,/^[a-z0-9-]+$/);
const browser=await launchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],responses=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{if(new URL(response.url()).pathname.endsWith('.glb'))responses.push(response);});
 const start=performance.now();
 await page.goto((process.env.TEST_APP_URL||'https://test.upit.top')+'/learn.html?course=dog');
 await page.waitForFunction(()=>document.getElementById('model-frame')?.contentWindow.teachingPlayer?.ready,null,{timeout:120000});
 const readyMs=Math.round(performance.now()-start);
 const frame=page.frameLocator('#model-frame');
 const assets=await frame.locator('body').evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.endsWith('.glb')).map(r=>({file:new URL(r.name).pathname.split('/').pop(),encodedBytes:r.encodedBodySize,decodedBytes:r.decodedBodySize,transferBytes:r.transferSize,durationMs:Math.round(r.duration)})));
 assert.deepEqual(assets.map(a=>a.file).sort(),['classroom.glb','ear-refined-skin.glb']);assert(assets.every(a=>a.encodedBytes>0&&a.decodedBytes>0));
 const encodings=await Promise.all(responses.map(async r=>({file:new URL(r.url()).pathname.split('/').pop(),encoding:(await r.allHeaders())['content-encoding']||'identity'})));
 assert.deepEqual(errors,[]);
 const result={url:page.url(),readyMs,encodedBytes:assets.reduce((sum,a)=>sum+a.encodedBytes,0),decodedBytes:assets.reduce((sum,a)=>sum+a.decodedBytes,0),assets,encodings};
 await frame.locator('[data-view="lips"]').click();
 await page.waitForFunction(()=>!document.getElementById('model-frame').contentWindow.learningSnapshot().cameraMoving);
 await mkdir('qa',{recursive:true});
 await page.locator('.player-surface').screenshot({path:`qa/loading-${label}.png`});
 await writeFile(`qa/loading-${label}.json`,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
