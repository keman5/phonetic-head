import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DURATION,SOUNDS,FOCUS,poseAt,DEFAULT_ALPHA,effectiveOpacity} from './motion.js';

const $=s=>document.querySelector(s);
const state={sound:'theta',progress:0,playing:false,speed:1,loop:true,air:true,alpha:{...DEFAULT_ALPHA},focus:null};
const mount=$('#viewer'),meshes=[];
let renderer,model,controls,frame=0,last=performance.now(),ready=false;
const scene=new THREE.Scene();scene.background=new THREE.Color('#eaf0f6');
const camera=new THREE.PerspectiveCamera(32,1,.001,20);
scene.add(new THREE.HemisphereLight(0xffffff,0x6b7c96,2.2));
const key=new THREE.DirectionalLight(0xfff7ed,2.6);key.position.set(-.6,.7,.7);scene.add(key);
const rim=new THREE.DirectionalLight(0xd0e4ff,1.6);rim.position.set(.5,.1,-.4);scene.add(rim);
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
const baseColors={skin:'#dbd6cf',bone:'#dad7c9',muscle:'#bd796d',organ:'#c1889a',eye:'#f0eee9'};
const organColors={'Tongue':'#cb8192','Soft palate':'#d7a091','Uvula of palate':'#d7a091','Trachea':'#87b7ba','Epiglottis':'#d9b27c'};
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
  $('#focus-list').innerHTML=sound.focus.map(id=>`<button class="focus-item" data-focus="${id}"><span>${FOCUS[id].label}</span><em>观察</em><i></i></button>`).join('');
  document.querySelectorAll('[data-focus]').forEach(b=>b.onclick=()=>focusOn(b.dataset.focus));
  $('#selection').innerHTML='<strong>选择器官查看动作</strong><p>点击模型或上方列表，查看当前音中的运动。</p>';
  syncPlay();
}
function syncPlay(){$('#play').textContent=state.playing?'Ⅱ 暂停动作':'▶ 播放动作';$('#play').setAttribute('aria-pressed',String(state.playing));}
function syncAlpha(){
  for(const key of ['left','right','skin','bone','muscle','organ']){
    const side=key==='left'||key==='right';$(side?`#${key}-alpha`:`#layer-${key}`).value=state.alpha[key];$(side?`#${key}-value`:`#value-${key}`).textContent=state.alpha[key]+'%';
  }
  for(const m of meshes){
    const a=effectiveOpacity(m.userData.side,m.userData.layer,state.alpha);
    m.visible=a>.005&&!m.userData.lumen;
    m.material.opacity=a;m.material.transparent=a<.995;m.material.depthWrite=a>=.995;
    m.material.needsUpdate=true;
  }
}
function clearPreset(){document.querySelectorAll('[data-preset]').forEach(b=>b.classList.remove('chosen'));}
function preset(id){
  if(id==='cutaway')state.alpha={...DEFAULT_ALPHA};
  if(id==='xray')state.alpha={left:0,right:0,skin:93,bone:85,muscle:50,organ:0};
  if(id==='surface')state.alpha={left:0,right:0,skin:0,bone:0,muscle:0,organ:0};
  syncAlpha();document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('chosen',b.dataset.preset===id));
}
function focusOn(id,rawName){
  state.focus=id?{id,match:FOCUS[id].match,label:FOCUS[id].label}:rawName?{match:n=>n===rawName,label:rawName}:null;
  document.querySelectorAll('[data-focus]').forEach(b=>b.classList.toggle('selected',b.dataset.focus===id));
  $('#selection').replaceChildren();const strong=document.createElement('strong'),p=document.createElement('p');
  strong.textContent=state.focus?.label||'选择器官查看动作';p.textContent=id?FOCUS[id].desc:rawName?'当前选中的源模型结构。可旋转模型或调整透明度观察。':'点击模型或上方列表，查看当前音中的运动。';
  $('#selection').append(strong,p);
}
function setView(view){
  const distance=view==='mouth'?.26:mount.clientWidth<450?.7:.59;
  const target=view==='mouth'?new THREE.Vector3(0,-.025,.053):new THREE.Vector3(0,.023,.013);
  const dirs={mouth:new THREE.Vector3(-1,.12,.28),oblique:new THREE.Vector3(-.85,.23,.9),front:new THREE.Vector3(0,.04,1),right:new THREE.Vector3(-1,.015,0),left:new THREE.Vector3(1,.015,0)};
  camera.position.copy(target).add(dirs[view].normalize().multiplyScalar(distance));controls.target.copy(target);controls.update();
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('chosen',b.dataset.view===view));
}
function animatePose(pose){
  let pinned=null;
  for(const m of meshes){
    if(m.morphTargetDictionary)for(const [key,index] of Object.entries(m.morphTargetDictionary))m.morphTargetInfluences[index]=pose.weights[key]||0;
    const name=m.userData.anatomyName;
    const match=state.focus?.match(name);
    const active=Object.values(FOCUS).filter(f=>f.match(name)).reduce((v,f)=>Math.max(v,...f.keys.map(k=>pose.weights[k]||0)),0);
    m.material.color.copy(m.userData.baseColor);
    if(m.userData.layer==='muscle')m.material.color.lerp(new THREE.Color('#df8457'),active*.6);
    m.material.emissive.set(match?'#c17935':'#000000');m.material.emissiveIntensity=match?.26:0;
    if(match&&m.visible&&(!pinned||m.material.opacity>pinned.material.opacity))pinned=m;
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
    // Flow remains close to the median plane; a small spread separates streamlines.
    p.x+=Math.sin(i*2.4)*.0015;p.y+=Math.cos(i*1.7)*.0008;
    dummy.position.copy(p);dummy.scale.setScalar(.7+.35*Math.sin(i*2.1));dummy.rotation.set(0,0,0);dummy.updateMatrix();particles.setMatrixAt(i,dummy.matrix);
  }
  particles.instanceMatrix.needsUpdate=true;
  for(let i=0;i<arrow.count;i++){
    const t=(i/arrow.count+travel)%1;dummy.position.copy(path.getPointAt(t));dummy.quaternion.setFromUnitVectors(up,path.getTangentAt(t).normalize());dummy.scale.setScalar(1);dummy.updateMatrix();arrow.setMatrixAt(i,dummy.matrix);
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
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;mount.appendChild(renderer.domElement);
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.22;controls.maxDistance=1.2;controls.enablePan=true;
  const resize=()=>{const w=mount.clientWidth,h=mount.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);};new ResizeObserver(resize).observe(mount);resize();setView('oblique');
  mount.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const offset=camera.position.clone().sub(controls.target);const s=new THREE.Spherical().setFromVector3(offset);s.theta+=(e.key==='ArrowLeft'?.1:e.key==='ArrowRight'?-.1:0);s.phi+=e.key==='ArrowUp'?-.1:e.key==='ArrowDown'?.1:0;s.makeSafe();camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));controls.update();});
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);fail(new Error('WebGL context lost'));});
  new GLTFLoader().load('./assets/phonetic-head.glb',gltf=>{
    model=gltf.scene;model.updateMatrixWorld(true);scene.add(model);
    model.traverse(m=>{if(!m.isMesh)return;
      const metadata=m.userData.anatomyName?m.userData:m.parent?.userData||{};m.userData={...m.userData,...metadata};
      if(!m.userData.side||!m.userData.layer)throw new Error('Missing anatomy metadata: '+m.name);
      const color=organColors[m.userData.anatomyName]||baseColors[m.userData.layer];m.material=new THREE.MeshStandardMaterial({color,roughness:.78,metalness:0,side:THREE.DoubleSide});
      m.userData.baseColor=new THREE.Color(color);m.geometry.computeBoundingBox();m.userData.center=m.geometry.boundingBox.getCenter(new THREE.Vector3());m.frustumCulled=false;meshes.push(m);
    });
    syncAlpha();ready=true;$('#load-state').hidden=true;$('#play').disabled=false;$('#restart').disabled=false;last=performance.now();tick(last);
  },event=>{$('#load-detail').textContent=event.total?'下载解剖网格 '+Math.round(event.loaded/event.total*100)+'%':'已加载 '+(event.loaded/1048576).toFixed(1)+' MB';},fail);
}catch(error){fail(error);}

$('#play').onclick=()=>{if(!ready)return;if(state.progress>=1)state.progress=0;state.playing=!state.playing;syncPlay();};
$('#restart').onclick=()=>{state.progress=0;state.playing=false;syncPlay();};
$('#timeline').oninput=e=>{state.progress=Number(e.target.value)/1000;state.playing=false;syncPlay();};
$('#speed').onchange=e=>state.speed=Number(e.target.value);$('#loop').onchange=e=>state.loop=e.target.checked;$('#air-toggle').onchange=e=>state.air=e.target.checked;
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>controls&&setView(b.dataset.view));$('#reset-view').onclick=()=>controls&&setView('oblique');
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>preset(b.dataset.preset));$('#reset-opacity').onclick=()=>preset('cutaway');
$('#swap-sides').onclick=()=>{[state.alpha.left,state.alpha.right]=[state.alpha.right,state.alpha.left];syncAlpha();clearPreset();};
$('#clear-focus').onclick=()=>focusOn(null);
let down=null;
mount.addEventListener('pointerdown',e=>down={x:e.clientX,y:e.clientY});
mount.addEventListener('pointerup',e=>{
  if(!ready||!down||Math.hypot(down.x-e.clientX,down.y-e.clientY)>5)return;
  const rect=mount.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
  const hit=ray.intersectObjects(meshes.filter(m=>m.visible&&m.material.opacity>.22),false)[0];
  if(hit){const n=hit.object.userData.anatomyName,id=Object.keys(FOCUS).find(k=>FOCUS[k].match(n));focusOn(id,n);}
});
// Read-only diagnostic snapshot for local checks; no UI simulation or random scoring.
window.labSnapshot=()=>({ready,playing:state.playing,sound:state.sound,progress:state.progress,alpha:{...state.alpha},meshCount:meshes.length,pose:poseAt(state.sound,state.progress),airVisible:airGroup.visible,airPosition:particles.instanceMatrix.array.slice(12,15),visibleSides:{left:meshes.filter(m=>m.userData.side==='left'&&m.visible).length,right:meshes.filter(m=>m.userData.side==='right'&&m.visible).length},morphMeshes:meshes.filter(m=>m.morphTargetInfluences?.some(w=>w>0)).length});
