import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {buildSectionGeometry,smoothMedianNormals,createWhiteSectionMaterial} from './sections.js';
import {PALETTES,createTeachingMaterial} from './palette.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DURATION,SOUNDS,FOCUS,poseAt,DEFAULT_ALPHA,effectiveOpacity} from './motion.js';

const $=s=>document.querySelector(s);
const state={sound:'theta',progress:0,playing:false,speed:1,loop:true,air:true,palette:'human',alpha:{left:0,right:0,skin:0,bone:0,muscle:0,organ:0},focus:null};
const mount=$('#viewer'),meshes=[],sectionCaps=[];
let medianNormalGroups=0;
let renderer,model,controls,frame=0,last=performance.now(),ready=false;
const scene=new THREE.Scene();scene.background=new THREE.Color('#edf3fa');
const camera=new THREE.PerspectiveCamera(32,1,.001,20);
const fill=new THREE.HemisphereLight(0xffffff,0x6b7c96,.8);scene.add(fill);
const key=new THREE.DirectionalLight(0xfff7ed,1.1);key.position.set(-.6,.7,.7);scene.add(key);
const rim=new THREE.DirectionalLight(0xd0e4ff,.35);rim.position.set(.5,.1,-.4);scene.add(rim);
const floor=new THREE.Mesh(new THREE.CircleGeometry(.2,64),new THREE.MeshBasicMaterial({color:'#dce5ef',transparent:true,opacity:.45,depthWrite:false}));floor.rotation.x=-Math.PI/2;floor.position.y=-.123;scene.add(floor);
const airGroup=new THREE.Group();scene.add(airGroup);
const airMat=new THREE.MeshStandardMaterial({color:'#24a8c8',emissive:'#128ba9',emissiveIntensity:.6,transparent:true,opacity:.9,depthWrite:false});
const particles=new THREE.InstancedMesh(new THREE.SphereGeometry(.0014,8,6),airMat,56);particles.frustumCulled=false;airGroup.add(particles);
const arrow=new THREE.InstancedMesh(new THREE.ConeGeometry(.0021,.0045,9),airMat,6);arrow.frustumCulled=false;airGroup.add(arrow);
const dummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0);
const path=new THREE.CatmullRomCurve3([
  new THREE.Vector3(0,-.11,.013),new THREE.Vector3(0,-.058,.018),new THREE.Vector3(0,-.018,.02),
  new THREE.Vector3(0,-.007,.045),new THREE.Vector3(0,-.011,.071),new THREE.Vector3(0,-.017,.098),new THREE.Vector3(0,-.015,.145),
]);
function fail(error){console.error(error);$('#load-state').hidden=false;$('#load-state b').textContent='模型暂时无法显示';$('#load-detail').textContent='请保持本地服务运行，然后重新加载。';$('.spinner').hidden=true;$('#retry').hidden=false;state.playing=false;}
$('#retry').onclick=()=>location.reload();

function buildUI(){
  $('#sounds').innerHTML=Object.entries(SOUNDS).map(([id,s])=>`<button class="sound ${id===state.sound?'chosen':''}" data-sound="${id}" style="--accent:${s.color}"><b>${s.ipa}</b><span><strong>${s.title}</strong><small>${s.word}</small></span></button>`).join('');
  document.querySelectorAll('[data-sound]').forEach(b=>b.onclick=()=>selectSound(b.dataset.sound));
  $('#layer-controls').innerHTML=Object.entries({skin:'皮肤与眼球',bone:'骨骼与牙齿',muscle:'肌肉',organ:'舌、腭与气道'}).map(([id,label])=>`<div class="layer"><label for="layer-${id}">${label}<output id="value-${id}"></output></label><input type="range" min="0" max="100" id="layer-${id}" value="${state.alpha[id]}"></div>`).join('');
  for(const key of ['left','right','skin','bone','muscle','organ']){
    const input=$(key==='left'||key==='right'?`#${key}-alpha`:`#layer-${key}`);
    input.addEventListener('input',()=>{state.alpha[key]=Number(input.value);syncAlpha();clearPreset();});
  }
  selectSound(state.sound);syncAlpha();
}
function selectSound(id){
  state.sound=id;state.progress=0;state.playing=false;state.focus=null;
  const sound=SOUNDS[id];document.querySelectorAll('[data-sound]').forEach(b=>b.classList.toggle('chosen',b.dataset.sound===id));
  $('#sound-title').textContent=sound.title;$('#sound-copy').textContent=sound.copy;$('#sound-tip').textContent=sound.tip;
  $('#steps').innerHTML=sound.steps.map((s,i)=>`<button class="step" data-step="${i}"><span>${i+1}</span>${s}</button>`).join('');
  document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{state.progress=[.15,.50,.72][Number(b.dataset.step)];state.playing=false;syncPlay();});
  $('#focus-list').innerHTML=sound.focus.filter(id=>state.palette==='human'||!['genio','smile','voice'].includes(id)).map(id=>`<button class="focus-item" data-focus="${id}"><span>${focusLabel(id)}</span><em>观察</em><i></i></button>`).join('');
  document.querySelectorAll('[data-focus]').forEach(b=>b.onclick=()=>focusOn(b.dataset.focus));
  $('#selection').innerHTML='<strong>选择器官查看动作</strong><p>点击模型或上方列表，查看当前音中的运动。</p>';
  syncPlay();
}
function syncPlay(){$('#play').textContent=state.playing?'Ⅱ 暂停动作':'▶ 播放动作';$('#play').setAttribute('aria-pressed',String(state.playing));}
function focusLabel(id){return state.palette==='human'?FOCUS[id].label:({tongue:'舌头',lips:'嘴唇',jaw:'下巴',velum:'腭部',voice:'喉部发声'}[id]||FOCUS[id].label);}
function focusMatch(id){return state.palette!=='human'&&['lips','jaw'].includes(id)?n=>n.startsWith('Character ')&&(id==='jaw'?/Chin|Face mask/.test(n):/Muzzle|Chin/.test(n)):FOCUS[id].match;}

function syncAlpha(){
  for(const key of ['left','right','skin','bone','muscle','organ']){
    const side=key==='left'||key==='right';$(side?`#${key}-alpha`:`#layer-${key}`).value=state.alpha[key];$(side?`#${key}-value`:`#value-${key}`).textContent=state.alpha[key]+'%';
  }
  for(const m of meshes){
    const section=state.alpha.left!==state.alpha.right;
    const a=m.userData.solidVolume&&section?1-state.alpha[m.userData.side]/100:effectiveOpacity(m.userData.side,m.userData.layer,state.alpha);
    m.visible=a>.005&&!m.userData.lumen&&(!m.userData.variant||m.userData.variant===state.palette)&&(state.palette==='human'||m.userData.variant===state.palette);
    m.material.opacity=a;m.material.transparent=a<.995;m.material.depthWrite=a>=.995;
    m.material.needsUpdate=true;
  }
  syncSections();
}
function syncSections(){
  for(const cap of sectionCaps){
    const side=cap.userData.side,source=cap.sourceMesh.material,white=cap.userData.whiteSection;
    const variant=cap.sourceMesh.userData.variant||'human';
    cap.visible=variant===state.palette&&state.alpha[side==='left'?'right':'left']>state.alpha[side]+1&&(white||cap.sourceMesh.visible);
    if(cap.userData.sourceMaterial!==source){
      if(cap.userData.sourceMaterial)cap.material.dispose();
      cap.material=white?createWhiteSectionMaterial(variant!=='human'):source.clone();
      if(!white){cap.material.onBeforeCompile=source.onBeforeCompile;cap.material.customProgramCacheKey=source.customProgramCacheKey;}
      cap.material.polygonOffset=true;cap.material.polygonOffsetFactor=-cap.renderOrder;cap.material.polygonOffsetUnits=-cap.renderOrder;
      cap.userData.sourceMaterial=source;
    }
    const opacity=white?1-state.alpha[side]/100:source.opacity;
    cap.material.opacity=opacity;cap.material.transparent=opacity<.995;cap.material.depthWrite=opacity>=.995;cap.material.needsUpdate=true;
  }
}
function clearPreset(){document.querySelectorAll('[data-preset]').forEach(b=>b.classList.remove('chosen'));}
function preset(id){
  if(id==='cutaway')state.alpha=state.palette==='human'?{...DEFAULT_ALPHA}:{...DEFAULT_ALPHA,skin:0,muscle:100};
  if(id==='xray')state.alpha={left:0,right:0,skin:93,bone:85,muscle:50,organ:0};
  if(id==='surface')state.alpha={left:0,right:0,skin:0,bone:0,muscle:0,organ:0};
  syncAlpha();document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('chosen',b.dataset.preset===id));
}
function focusOn(id,rawName){
  state.focus=id?{id,match:focusMatch(id),label:focusLabel(id)}:rawName?{match:n=>n===rawName,label:rawName}:null;
  document.querySelectorAll('[data-focus]').forEach(b=>b.classList.toggle('selected',b.dataset.focus===id));
  $('#selection').replaceChildren();const strong=document.createElement('strong'),p=document.createElement('p');
  strong.textContent=state.focus?.label||'选择器官查看动作';p.textContent=id?(state.palette!=='human'&&['lips','jaw'].includes(id)?'观察角色嘴巴的张开与合拢，配合口腔内部的舌位一起练习。':FOCUS[id].desc):rawName?'当前选中的源模型结构。可旋转模型或调整透明度观察。':'点击模型或上方列表，查看当前音中的运动。';
  $('#selection').append(strong,p);
}
function setView(view){
  const distance=view==='mouth'?.26:mount.clientWidth<450?.7:.59;
  const target=view==='mouth'?new THREE.Vector3(0,state.palette==='human'?-.025:0,.065):new THREE.Vector3(0,.023,.013);
  const dirs={mouth:new THREE.Vector3(-1,.12,.28),oblique:new THREE.Vector3(-.85,.23,.9),front:new THREE.Vector3(0,.04,1),right:new THREE.Vector3(-1,.015,0),left:new THREE.Vector3(1,.015,0)};
  camera.position.copy(target).add(dirs[view].normalize().multiplyScalar(distance));controls.target.copy(target);controls.update();
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('chosen',b.dataset.view===view));
}
function animatePose(pose){
  let pinned=null;
  for(const m of meshes){
    if(m.morphTargetDictionary)for(const [key,index] of Object.entries(m.morphTargetDictionary))m.morphTargetInfluences[index]=pose.weights[key]||0;
    if(m.userData.solidVolume)continue;
    const name=m.userData.anatomyName;
    const match=state.focus?.match(name);
    const active=Object.values(FOCUS).filter(f=>f.match(name)).reduce((v,f)=>Math.max(v,...f.keys.map(k=>pose.weights[k]||0)),0);
    m.material.color.copy(m.userData.baseColor);
    if(m.userData.layer==='muscle')m.material.color.lerp(new THREE.Color(PALETTES[state.palette].active),active*.35);
    m.material.emissive.set(match?'#c17935':m.userData.variant&&m.userData.variant!=='human'?m.userData.baseColor:'#000000');m.material.emissiveIntensity=match?.26:m.userData.variant&&m.userData.variant!=='human'?.08:0;
    if(m.userData.feature==='tongue'&&m.userData.variant===state.palette)m.visible=effectiveOpacity(m.userData.side,m.userData.layer,state.alpha)>.005&&pose.weights.LipClose<.85;
    if(match&&m.visible&&(!pinned||m.material.opacity>pinned.material.opacity))pinned=m;
  }
  for(const cap of sectionCaps){
    if(cap.userData.whiteSection)continue;
    cap.visible=cap.sourceMesh.visible&&state.alpha[cap.userData.side==='left'?'right':'left']>state.alpha[cap.userData.side]+1;
    cap.material.color.copy(cap.sourceMesh.material.color);
    cap.material.emissive.copy(cap.sourceMesh.material.emissive);cap.material.emissiveIntensity=cap.sourceMesh.material.emissiveIntensity;
  }
  document.querySelectorAll('[data-focus]').forEach(b=>{
    const f=FOCUS[b.dataset.focus],amount=Math.max(...f.keys.map(k=>pose.weights[k]||0));
    b.querySelector('i').style.width=(amount*100)+'%';b.querySelector('em').textContent=amount>.1?'运动中':'观察';
  });
  const pin=$('#organ-pin');pin.hidden=!pinned;
  if(pinned){
    const p=pinned.userData.center.clone();pinned.localToWorld(p);p.project(camera);
    if(p.z>1||Math.abs(p.x)>.92||Math.abs(p.y)>.85)pin.hidden=true;
    else {pin.textContent=state.focus.label;pin.style.left=((p.x+1)/2*mount.clientWidth)+'px';pin.style.top=((-p.y+1)/2*mount.clientHeight)+'px';}
  }
}
function animateAir(pose){
  airGroup.visible=state.air&&pose.air>.02;
  if(!airGroup.visible)return;
  airMat.opacity=.92*pose.air;
  const travel=state.progress*DURATION*(state.sound==='k'||state.sound==='p'?1.35:.65);
  for(let i=0;i<particles.count;i++){
    const t=(i/particles.count+travel)%1,p=path.getPointAt(t);
    if(state.palette!=='human')p.y+=.014;
    // Flow remains close to the median plane; a small spread separates streamlines.
    p.x+=Math.sin(i*2.4)*.0015;p.y+=Math.cos(i*1.7)*.0008;
    dummy.position.copy(p);dummy.scale.setScalar(.7+.35*Math.sin(i*2.1));dummy.rotation.set(0,0,0);dummy.updateMatrix();particles.setMatrixAt(i,dummy.matrix);
  }
  particles.instanceMatrix.needsUpdate=true;
  for(let i=0;i<arrow.count;i++){
    const t=(i/arrow.count+travel)%1;dummy.position.copy(path.getPointAt(t));if(state.palette!=='human')dummy.position.y+=.014;dummy.quaternion.setFromUnitVectors(up,path.getTangentAt(t).normalize());dummy.scale.setScalar(1);dummy.updateMatrix();arrow.setMatrixAt(i,dummy.matrix);
  }
  arrow.instanceMatrix.needsUpdate=true;
}
function tick(now){
  frame=requestAnimationFrame(tick);const dt=Math.min((now-last)/1000,.06);last=now;
  if(state.playing){state.progress+=dt*state.speed/DURATION;if(state.progress>=1){if(state.loop)state.progress%=1;else{state.progress=1;state.playing=false;syncPlay();}}}
  const pose=poseAt(state.sound,state.progress);animatePose(pose);animateAir(pose);
  $('#timeline').value=Math.round(state.progress*1000);$('#time-label').textContent=(state.progress*DURATION).toFixed(1)+' / 6.0 秒';
  $('#phase-label').textContent=SOUNDS[state.sound].steps[pose.step];document.querySelectorAll('[data-step]').forEach(b=>b.classList.toggle('active',Number(b.dataset.step)===pose.step));
  $('#air-status').textContent=!state.air?'气流已隐藏':pose.air>.02?pose.voiced?'口腔送气 · 喉部发声':'口腔送气':state.progress>.30&&state.progress<.65&&(state.sound==='p'||state.sound==='k')?'闭塞阶段 · 气流受阻':'准备呼气';
  controls.update();renderer.render(scene,camera);
}
buildUI();
const mouthButton=document.createElement('button');mouthButton.dataset.view='mouth';mouthButton.textContent='口腔特写';$('.view-buttons').append(mouthButton);
try{
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;mount.appendChild(renderer.domElement);
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.22;controls.maxDistance=1.2;controls.enablePan=true;
  const resize=()=>{const w=mount.clientWidth,h=mount.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);};new ResizeObserver(resize).observe(mount);resize();setView('oblique');
  mount.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const offset=camera.position.clone().sub(controls.target);const s=new THREE.Spherical().setFromVector3(offset);s.theta+=(e.key==='ArrowLeft'?.1:e.key==='ArrowRight'?-.1:0);s.phi+=e.key==='ArrowUp'?-.1:e.key==='ArrowDown'?.1:0;s.makeSafe();camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));controls.update();});
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);fail(new Error('WebGL context lost'));});
  const loader=new GLTFLoader();
  Promise.all([loader.loadAsync('./assets/phonetic-head.glb'),loader.loadAsync('./assets/repaired-skin.glb'),loader.loadAsync('./assets/character-heads.glb'),loader.loadAsync('./assets/solid-human-core.glb')]).then(([gltf,repaired,characters,solidCore])=>{
    const oldSkin=[];gltf.scene.traverse(m=>{if(m.isMesh&&m.userData.layer==='skin')oldSkin.push(m);});
    for(const m of oldSkin)m.parent.remove(m);
    gltf.scene.add(repaired.scene);gltf.scene.add(characters.scene);gltf.scene.add(solidCore.scene);
    model=gltf.scene;model.updateMatrixWorld(true);scene.add(model);
    model.traverse(m=>{if(!m.isMesh)return;
      const metadata=m.userData.anatomyName?m.userData:m.parent?.userData||{};m.userData={...m.userData,...metadata};
      if(!m.userData.variant&&['skin','eye'].includes(m.userData.layer))m.userData.variant='human';
      if(!m.userData.side||!m.userData.layer)throw new Error('Missing anatomy metadata: '+m.name);
      const {color,material}=createTeachingMaterial(m.userData,state.palette);m.material=material;
      m.userData.baseColor=new THREE.Color(color);m.geometry.computeBoundingBox();m.userData.center=m.geometry.boundingBox.getCenter(new THREE.Vector3());m.frustumCulled=false;meshes.push(m);
    });
    medianNormalGroups=smoothMedianNormals(meshes);
    for(const source of meshes){
      if(source.userData.solidVolume||source.userData.lumen||source.userData.anatomyName==='Trachea'||['detail','whisker','brow','mouth'].includes(source.userData.feature))continue;
      const whiteSection=['skin','eye'].includes(source.userData.layer);
      const result=buildSectionGeometry(source.geometry,source.userData.side,{fillShell:whiteSection,solidEnvelope:source.userData.variant==='human'&&source.userData.layer==='skin'});
      if(!result.geometry)continue;
      const cap=new THREE.Mesh(result.geometry,source.material);cap.name=source.name+' section';
      cap.userData={...source.userData,isSectionCap:true,whiteSection,unclosed:result.unclosed};
      cap.renderOrder=source.userData.layer==='organ'?6:source.userData.layer==='bone'?4:source.userData.layer==='muscle'?3:/Muzzle|Face mask/.test(source.userData.anatomyName)?2:1;
      if(source.morphTargetInfluences){cap.morphTargetInfluences=source.morphTargetInfluences;cap.morphTargetDictionary=source.morphTargetDictionary;}
      cap.sourceMesh=source;if(whiteSection)cap.position.x=source.userData.side==='left'?.0004:-.0004;source.add(cap);model.attach(cap);sectionCaps.push(cap);
    }
    preset('surface');ready=true;$('#load-state').hidden=true;$('#play').disabled=false;$('#restart').disabled=false;$('#head-model').disabled=false;last=performance.now();tick(last);
  }).catch(fail);
}catch(error){fail(error);}

$('#play').onclick=()=>{if(!ready)return;if(state.progress>=1)state.progress=0;state.playing=!state.playing;syncPlay();};
$('#restart').onclick=()=>{state.progress=0;state.playing=false;syncPlay();};
$('#timeline').oninput=e=>{state.progress=Number(e.target.value)/1000;state.playing=false;syncPlay();};
$('#speed').onchange=e=>state.speed=Number(e.target.value);$('#loop').onchange=e=>state.loop=e.target.checked;$('#air-toggle').onchange=e=>state.air=e.target.checked;
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>controls&&setView(b.dataset.view));$('#reset-view').onclick=()=>controls&&setView('oblique');
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>preset(b.dataset.preset));$('#reset-opacity').onclick=()=>preset('cutaway');
$('#swap-sides').onclick=()=>{[state.alpha.left,state.alpha.right]=[state.alpha.right,state.alpha.left];syncAlpha();clearPreset();};
$('#head-model').onchange=e=>{
  state.palette=e.target.value;
  document.documentElement.style.setProperty('--muscle-color',PALETTES[state.palette].muscle);document.documentElement.style.setProperty('--organ-color',PALETTES[state.palette].organ);
  const savedProgress=state.progress,savedPlaying=state.playing;selectSound(state.sound);state.progress=savedProgress;state.playing=savedPlaying;syncPlay();
  $('#character-note').hidden=state.palette==='human';
  $('#focus-heading').textContent=state.palette==='human'?'观察肌肉配合':'观察发音动作';
  for(const layer of ['bone','muscle'])$('#layer-'+layer).closest('.layer').hidden=state.palette!=='human';
  for(const m of meshes){
    const {color,material}=createTeachingMaterial(m.userData,state.palette);
    const {opacity,transparent,depthWrite}=m.material;
    m.material.dispose();m.material=material;Object.assign(material,{opacity,transparent,depthWrite});
    m.userData.baseColor.set(color);
  }
  scene.background.set(PALETTES[state.palette].background);
  preset('surface');setView('front');
};
$('#clear-focus').onclick=()=>focusOn(null);
let down=null;
mount.addEventListener('pointerdown',e=>down={x:e.clientX,y:e.clientY});
mount.addEventListener('pointerup',e=>{
  if(!ready||!down||Math.hypot(down.x-e.clientX,down.y-e.clientY)>5)return;
  const rect=mount.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
  const hit=ray.intersectObjects([...meshes,...sectionCaps].filter(m=>m.visible&&m.material.opacity>.22),false)[0];
  if(hit){const n=hit.object.userData.anatomyName,id=Object.keys(FOCUS).find(k=>FOCUS[k].match(n));focusOn(id,n);}
});
// Read-only diagnostic snapshot for local checks; no UI simulation or random scoring.
window.labSnapshot=()=>({ready,solidCoreMeshes:meshes.filter(m=>m.userData.solidVolume).length,visibleSolidCoreMeshes:meshes.filter(m=>m.userData.solidVolume&&m.visible).length,medianNormalGroups,sectionCapCount:sectionCaps.length,visibleWhiteSections:sectionCaps.filter(c=>c.visible&&c.userData.whiteSection).length,whiteSectionColors:[...new Set(sectionCaps.filter(c=>c.visible&&c.userData.whiteSection).map(c=>c.material.color.getHexString()))],humanEyeColors:meshes.filter(m=>m.userData.layer==='eye').map(m=>m.material.color.getHexString()),visibleSectionCaps:sectionCaps.filter(c=>c.visible).length,visibleMuscleCaps:sectionCaps.filter(c=>c.visible&&c.userData.layer==='muscle').length,palette:state.palette,visibleSourceMeshes:meshes.filter(m=>m.visible&&!m.userData.variant).length,characterTongue:meshes.filter(m=>m.userData.variant===state.palette&&m.userData.feature==='tongue').map(m=>({visible:m.visible,weights:Object.fromEntries(Object.entries(m.morphTargetDictionary||{}).map(([key,index])=>[key,m.morphTargetInfluences[index]]))})),repairedSkinMeshes:meshes.filter(m=>m.userData.layer==='skin'&&m.userData.variant==='human'&&!m.userData.solidVolume).length,visibleHeadVariants:[...new Set(meshes.filter(m=>m.visible&&m.userData.variant).map(m=>m.userData.variant))],visibleHeadMeshes:meshes.filter(m=>m.userData.variant===state.palette&&m.visible).length,headModels:[...new Set(meshes.map(m=>m.userData.variant).filter(Boolean))],skinMorphMeshes:meshes.filter(m=>m.userData.layer==='skin'&&!m.userData.solidVolume&&m.userData.variant===state.palette&&m.morphTargetInfluences?.some(w=>w>0)).length,playing:state.playing,sound:state.sound,progress:state.progress,alpha:{...state.alpha},meshCount:meshes.length,pose:poseAt(state.sound,state.progress),airVisible:airGroup.visible,airPosition:particles.instanceMatrix.array.slice(12,15),visibleSides:{left:meshes.filter(m=>m.userData.side==='left'&&m.visible).length,right:meshes.filter(m=>m.userData.side==='right'&&m.visible).length},morphMeshes:meshes.filter(m=>m.morphTargetInfluences?.some(w=>w>0)).length});
