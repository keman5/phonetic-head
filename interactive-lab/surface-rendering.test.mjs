import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launchBrowser} from './browser-test-utils.mjs';

test('opaque bust base fully occludes internal anatomy at MSAA edges',{timeout:120000},async t=>{
 const browser=await launchBrowser();t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:720,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/shader|THREE/i.test(m.text()))errors.push(m.text());});
 await page.route('**/app.js',async route=>{
  const response=await route.fetch();
  await route.fulfill({response,body:await response.text()+`
window.baseOcclusionProbe=()=>{
 cancelAnimationFrame(frame);cameraTween=null;state.playing=false;state.air=false;state.progress=0;
 preset('surface');animatePose(currentPose());animateAir(currentPose());
 controls.enableDamping=false;controls.target.set(0,.02,0);camera.position.set(0,-.63,.00065);controls.update();
 const canvas=document.createElement('canvas');canvas.width=renderer.domElement.width;canvas.height=renderer.domElement.height;
 const context=canvas.getContext('2d');
 const pixels=()=>{renderer.render(scene,camera);context.drawImage(renderer.domElement,0,0);return context.getImageData(0,0,canvas.width,canvas.height).data;};
 const before=pixels();
 for(const m of meshes)if(m.userData.anatomyName==='Trachea')m.visible=false;
 const after=pixels();let changed=0;
 for(let i=0;i<before.length;i+=4)if(before[i]!==after[i]||before[i+1]!==after[i+1]||before[i+2]!==after[i+2])changed++;
 return changed;
};`});
 });
 await page.goto((process.env.TEST_APP_URL||'http://127.0.0.1:4173')+'/lab.html?embed=1');
 await page.waitForFunction(()=>window.labSnapshot?.().ready,null,{timeout:90000});
 assert.equal(await page.evaluate(()=>baseOcclusionProbe()),0,'hidden trachea changes pixels through the opaque base');
 assert.deepEqual(errors,[]);
});
