import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {launchBrowser} from './browser-test-utils.mjs';
import {PHONEMES} from './dist/phonemes.js';

const output=process.env.AUDIT_DIR||'qa/model-audit';
await mkdir(output,{recursive:true});
const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:720,height:720},deviceScaleFactor:1});
const errors=[],shots=[];page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
// Expose scene controls only in this intercepted test response, never in the shipped app.
await page.route('**/app.js',async route=>{
 const response=await route.fetch();
 await route.fulfill({response,body:await response.text()+`
window.modelAudit={
 async details(){await loadAnatomyDetails();},
 inventory(){return meshes.map(m=>({name:m.userData.anatomyName,side:m.userData.side,role:teachingRole(m.userData),lumen:!!m.userData.lumen,teaching:!!m.userData.teachingOnly,vertices:m.geometry.attributes.position.count,channels:Object.keys(m.morphTargetDictionary||{}),finite:[...Object.values(m.geometry.attributes),...Object.values(m.geometry.morphAttributes).flat()].every(a=>a.array.every(Number.isFinite))}));},
 draw({direction=[0,0,1],target=[0,.02,0],distance=.65,mode='surface',sound='i',progress=0,detail=false,part=null,alpha=null}){
  cancelAnimationFrame(frame);cameraTween=null;state.playing=false;state.sound='ipa:'+sound;state.progress=progress;state.focus=null;state.air=false;
  childMode=!detail;refreshMaterials();preset(mode);
  if(alpha){Object.assign(state.alpha,alpha);syncAlpha();}
  const pose=currentPose();animatePose(pose);animateAir(pose);
  if(part){
   floor.visible=false;
   for(const m of meshes)m.visible=m.userData.anatomyName.replace(/\\.[lr]$/,'')===part&&!m.userData.lumen&&!(childMode?m.userData.teacherOnly:m.userData.teachingOnly);
   for(const cap of sectionCaps)cap.visible=cap.visible&&cap.sourceMesh.visible;
   const bounds=new THREE.Box3();for(const m of meshes.filter(m=>m.visible))bounds.union(new THREE.Box3().setFromObject(m));
   target=bounds.getCenter(new THREE.Vector3()).toArray();distance=Math.max(.001,bounds.getSize(new THREE.Vector3()).length()*2.1);
  }else floor.visible=true;
  controls.minDistance=part?.0001:.22;camera.near=part?.00001:.001;camera.updateProjectionMatrix();
  controls.enableDamping=false;controls.target.set(...target);camera.position.copy(controls.target).add(new THREE.Vector3(...direction).normalize().multiplyScalar(distance));controls.update();
  model.updateMatrixWorld(true);renderer.render(scene,camera);
  return {sound,progress,visible:meshes.filter(m=>m.visible).length,triangles:renderer.info.render.triangles};
 }
};`});
});
try{
 await page.goto((process.env.TEST_APP_URL||'http://127.0.0.1:4173')+'/lab.html?embed=1');
 await page.waitForFunction(()=>window.labSnapshot?.().ready,null,{timeout:120000});
 await page.addStyleTag({content:'.stage-top,.stage-bottom,#anatomy-guides,#tongue-landmarks,#organ-pin,.attention-halo,.phase-chip,.voice-meter{display:none!important}'});
 await page.evaluate(()=>modelAudit.details());
 const inventory=await page.evaluate(()=>modelAudit.inventory());
 assert(inventory.every(m=>m.finite),'non-finite mesh or morph data');
 await writeFile(output+'/inventory.json',JSON.stringify(inventory,null,2));
 const views={front:[0,0,1],right:[-1,0,0],left:[1,0,0],back:[0,0,-1],top:[0,1,.001],bottom:[0,-1,.001],oblique:[-1,.3,1],rear:[1,.25,-1]};
 async function capture(name,options){
  if(process.env.AUDIT_FILTER&&!new RegExp(process.env.AUDIT_FILTER).test(name))return;
  const state=await page.evaluate(options=>modelAudit.draw(options),options);
  assert(state.visible>0&&state.triangles>0,name);
  await page.locator('#viewer canvas').screenshot({path:output+'/'+name+'.png'});shots.push({name,...options,...state});
 }
 for(const mode of ['surface','cutaway','xray'])for(const [view,direction]of Object.entries(views))
  await capture(mode+'-'+view,{mode,direction});
 for(const sound of Object.keys(PHONEMES))for(const progress of [.25,.5,.85]){
  for(const [view,direction,mode]of [['lips',[0,0,1],'surface'],['mouth',[-1,.1,.2],'cutaway']])
   await capture(sound+'-'+view+(progress===.5?'':'-'+progress),{sound,progress,direction,mode,target:[0,-.024,.065],distance:.24});
 }
 for(const [view,direction]of Object.entries(views))await capture('details-'+view,{detail:true,mode:'cutaway',direction});
 for(const [view,direction]of Object.entries(views))await capture('opposite-'+view,{mode:'cutaway',direction,alpha:{left:100,right:0}});
 const parts=[...new Set(inventory.filter(m=>!m.lumen).map(m=>m.name.replace(/\.[lr]$/,'')))];
 for(const part of parts)for(const [view,direction]of Object.entries(views))
  await capture(part.replaceAll(' ','-')+'-'+view,{part,detail:!['Tongue','Hard palate','Soft palate','Uvula of palate','Trachea'].includes(part),direction,mode:'surface'});
 await writeFile(output+'/report.json',JSON.stringify({shots,errors},null,2));
 const sheets={};
 for(const shot of shots){
  const group=shot.part?'parts-'+Math.floor(parts.indexOf(shot.part)/5):shot.name.includes('-lips')||shot.name.includes('-mouth')?'sounds-'+(shot.name.includes('-lips')?'lips':'mouth')+'-'+shot.progress:'views';
  (sheets[group]??=[]).push(shot.name);
 }
 const contact=await browser.newPage();
 for(const [name,names]of Object.entries(sheets)){
  const sources=await Promise.all(names.map(async name=>({name,data:(await readFile(output+'/'+name+'.png')).toString('base64')})));
  const data=await contact.evaluate(async sources=>{
   const columns=8,size=180,label=22,canvas=document.createElement('canvas');canvas.width=columns*size;canvas.height=Math.ceil(sources.length/columns)*(size+label);
   const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,canvas.width,canvas.height);c.font='11px sans-serif';
   for(const [i,source]of sources.entries()){
    const img=new Image();img.src='data:image/png;base64,'+source.data;await img.decode();
    const x=i%columns*size,y=Math.floor(i/columns)*(size+label);c.fillStyle='black';c.fillText(source.name,x+2,y+14,size-4);c.drawImage(img,x,y+label,size,size);
   }
   return canvas.toDataURL('image/jpeg',.9).split(',')[1];
  },sources);
  await writeFile(output+'/sheet-'+name+'.jpg',Buffer.from(data,'base64'));
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({meshes:inventory.length,shots:shots.length,errors}));
}finally{await browser.close();}
