import './dropdown.js';
import {showInspector} from './interface.js';
import {PronunciationAudio,audioCatalog} from './audio.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {buildSectionGeometry,smoothMedianNormals,createSectionFillMaterial} from './sections.js';
import {PALETTES,createTeachingMaterial} from './palette.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {SOUNDS,FOCUS,poseAt,durationFor,DEFAULT_ALPHA,effectiveOpacity} from './motion.js';
import {PHONEMES,LETTERS,CATEGORIES} from './phonemes.js';
import {teachingRole,lessonFor,CHILD_LABELS} from './teaching.js';
import {createLearningCoach} from './learning.js';
import {setOpacity,pickClosest,surfaceLabel} from './render-utils.js';

const $=s=>document.querySelector(s);
const state={sound:'ipa:i',progress:0,playing:false,speed:1,loop:false,air:true,palette:'human',alpha:{left:0,right:0,skin:0,bone:0,muscle:0,organ:0},focus:null,voice:'female'};
const mount=$('#viewer'),meshes=[],sectionCaps=[];
const guides=document.createElement('div');guides.id='anatomy-guides';guides.hidden=true;
guides.innerHTML='<svg aria-hidden="true"><path/><path/><path/></svg>'+[['velum','软腭'],['tongue','舌头'],['voice','声带区域']].map(([id,label])=>`<button type="button" data-guide="${id}">${label}</button>`).join('');
$('#stage').append(guides);
guides.querySelectorAll('button').forEach(button=>button.onclick=()=>focusOn(button.dataset.guide));
let motionOnly=false,previewing=false,childMode=true,lessonKey='';
let playbackAttempt=0;
let coach, cameraTween=null;
let renderDirty=true,alphaPending=false,renderCount=0;
const invalidate=()=>{renderDirty=true;};
// Native controls and coach actions can change the scene while playback is idle.
for(const event of ['input','change','click'])document.addEventListener(event,invalidate,true);
let voiceCatalog;
audioCatalog.then(value=>{voiceCatalog=value.voices;invalidate();}).catch(()=>{});
function currentPose(){
  const entry=voiceCatalog?.[state.voice]?.entries.alphabet;
  if(state.sound!=='alphabet'||!entry)return poseAt(state.sound,state.progress);
  const time=state.progress*entry.duration;
  const segment=entry.segments.findLast(s=>time>=s.start)||entry.segments[0];
  const progress=Math.max(0,Math.min(1,(time-segment.start)/(segment.end-segment.start)));
  return {...poseAt('letter:'+segment.letter,progress),letter:segment.letter};
}

const player=new PronunciationAudio(()=>{
  state.progress=1;state.playing=false;syncPlay();
  coach?.finish('listen');
  if(state.loop){state.progress=0;startPlayback();}
},audioFailure);
player.audio.addEventListener('durationchange',invalidate);
function audioFailure(error){
  if(motionOnly){$('#audio-status').textContent='口型慢动作（示范音暂不可用）';return;}
  player.pause();state.playing=false;syncPlay();
  coach?.fail();
  $('#audio-status').textContent=error.message||'无法播放，请重试。';
}
function pausePlayback(){playbackAttempt++;player.pause();state.playing=false;syncPlay();coach?.interrupt();}
async function startPlayback(){
  if(!ready)return;
  const attempt=++playbackAttempt;
  if(state.progress>=1||previewing)state.progress=0;
  previewing=false;
  if(motionOnly){state.playing=true;syncPlay();coach?.resume('watch');$('#audio-status').textContent='口型慢动作';return;}
  state.playing=true;syncPlay();$('#audio-status').textContent='正在准备声音…';
  try{
    await player.play(state.progress);
    if(attempt===playbackAttempt&&state.playing){$('#audio-status').textContent='本地合成示范音';coach?.resume('listen');}
  }catch(error){if(attempt===playbackAttempt)audioFailure(error);}
}

let medianNormalGroups=0;
let renderer,model,controls,frame=0,last=performance.now(),ready=false;
const scene=new THREE.Scene();scene.background=new THREE.Color(PALETTES.human.background);
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
const activeColor=new THREE.Color(PALETTES.human.active);
const path=new THREE.CatmullRomCurve3([
  new THREE.Vector3(0,-.11,.013),new THREE.Vector3(0,-.058,.018),new THREE.Vector3(0,-.018,.02),
  new THREE.Vector3(0,-.007,.045),new THREE.Vector3(0,-.011,.071),new THREE.Vector3(0,-.017,.098),new THREE.Vector3(0,-.015,.145),
]);
const nasalPath=new THREE.CatmullRomCurve3([
 new THREE.Vector3(0,-.11,.013),new THREE.Vector3(0,-.058,.018),new THREE.Vector3(0,-.007,.02),
 new THREE.Vector3(0,.019,.035),new THREE.Vector3(0,.023,.078),new THREE.Vector3(0,.02,.135),
]);
function fail(error){console.error(error);ready=false;coach?.ready(false);$('#play').disabled=true;$('#restart').disabled=true;$('#load-state').hidden=false;$('#load-state b').textContent='模型暂时无法显示';$('#load-detail').textContent='请保持本地服务运行，然后重新加载。';$('.spinner').hidden=true;$('#retry').hidden=false;pausePlayback();}
$('#retry').onclick=()=>location.reload();

function buildUI(){
  $('.eyebrow').textContent='国内常见48音标教学集合';
  const chooser=document.createElement('div');chooser.className='library-chooser';
  chooser.innerHTML='<label for="library-mode">学习模式</label><lab-select id="library-mode"><option value="ipa">48 音标教学集合</option><option value="vowels">20 个元音口型</option><option value="letters">A–Z 字母名称</option></lab-select><label for="category">音标分类</label><lab-select id="category"></lab-select><label for="entry-select">选择发音</label><lab-select id="entry-select"></lab-select>';
  $('.eyebrow').after(chooser);
  const picker=document.createElement('div');picker.id='vowel-picker';
  picker.innerHTML=['vowel','diphthong'].map(category=>`<fieldset><legend>${CATEGORIES[category]}</legend><div class="vowel-grid">${Object.values(PHONEMES).filter(p=>p.category===category).map(p=>`<button type="button" data-vowel="${p.id}" aria-label="/${p.ipa}/ ${p.word}" aria-pressed="false"><b>${p.ipa}</b><small>${p.word}</small></button>`).join('')}</div></fieldset>`).join('');
  chooser.after(picker);
  const motionToggle=document.createElement('label');motionToggle.className='motion-toggle';
  motionToggle.innerHTML='<input id="motion-only" type="checkbox"> 口型慢动作（无声）';
  $('.audio-toolbar').append(motionToggle);
  $('#motion-only').onchange=e=>{pausePlayback();motionOnly=e.target.checked;previewing=false;state.progress=0;player.seek(0);$('#audio-status').textContent=motionOnly?'口型慢动作':'本地合成示范音';syncPlay();};
  picker.querySelectorAll('[data-vowel]').forEach(button=>button.onclick=()=>{
    if($('#library-mode').value==='ipa'&&$('#category').value!==PHONEMES[button.dataset.vowel].category){$('#category').value=PHONEMES[button.dataset.vowel].category;refreshEntries();}
    $('#entry-select').value='ipa:'+button.dataset.vowel;selectSound('ipa:'+button.dataset.vowel);
  });
  $('#category').setOptions(Object.entries(CATEGORIES));
  $('#focus-heading').textContent='观察发音动作';
  const refreshEntries=()=>{
    const mode=$('#library-mode').value;
    $('#category').hidden=mode!=='ipa';$('label[for="category"]').hidden=mode!=='ipa';
    picker.hidden=mode==='letters'||mode==='ipa'&&!['vowel','diphthong'].includes($('#category').value);
    const entries=mode!=='letters'?Object.values(PHONEMES).filter(p=>mode==='vowels'?['vowel','diphthong'].includes(p.category):p.category===$('#category').value).map(p=>['ipa:'+p.id,`/${p.ipa}/ · ${p.word}`]):[...Object.values(LETTERS).map(l=>['letter:'+l.id,`${l.id} /${l.ipa}/`]),['alphabet','A–Z 连续播放']];
    $('#entry-select').setOptions(entries);
    selectSound(entries[0][0]);
  };
  $('#library-mode').onchange=refreshEntries;$('#category').onchange=refreshEntries;
  $('#entry-select').onchange=e=>selectSound(e.target.value);
  $('#layer-controls').innerHTML=Object.entries({skin:'皮肤与眼球',bone:'骨骼与牙齿',muscle:'肌肉',organ:'舌、腭与气道'}).map(([id,label])=>`<div class="layer"><label for="layer-${id}">${label}<output id="value-${id}"></output></label><input type="range" min="0" max="100" id="layer-${id}" value="${state.alpha[id]}"></div>`).join('');
  for(const key of ['left','right','skin','bone','muscle','organ']){
    const input=$(key==='left'||key==='right'?`#${key}-alpha`:`#layer-${key}`);
    input.addEventListener('input',()=>{state.alpha[key]=Number(input.value);alphaPending=true;invalidate();clearPreset();});
  }
  refreshEntries();syncAlpha();
}
function showLesson(id){
  const lesson=lessonFor(id);if(!lesson||lessonKey===id)return;lessonKey=id;
  $('#lesson-symbol').textContent='/'+lesson.ipa+'/';$('#lesson-word').textContent=lesson.word;
  $('#cue-mouth').textContent=lesson.mouth;$('#cue-tongue').textContent=lesson.tongue;
  $('#cue-air').textContent=lesson.air+'；'+lesson.voice+'。';$('#cue-reminder').textContent=lesson.reminder;
  const other=PHONEMES[lesson.contrast];$('#contrast-sound').textContent=`比一比 /${other.ipa}/ · ${other.word}`;$('#contrast-sound').dataset.sound=other.id;
  $('#voice-cue').textContent=lesson.voiced?'声带会振动':'不主动振动声带';
}
function selectLesson(id){
  $('#library-mode').value='ipa';$('#category').value=PHONEMES[id].category;$('#category').dispatchEvent(new Event('change'));
  $('#entry-select').value='ipa:'+id;selectSound('ipa:'+id);
}
function refreshMaterials(){
  for(const m of meshes){
    const {color,material}=createTeachingMaterial(m.userData,state.palette,childMode);
    const {opacity,transparent,depthWrite}=m.material;
    m.material.dispose();m.material=material;Object.assign(material,{opacity,transparent,depthWrite});m.userData.baseColor.set(color);
  }
  syncAlpha();
}
function selectSound(id){
  pausePlayback();state.sound=id;state.progress=0;state.focus=null;
  coach?.reset();
  previewing=id.startsWith('ipa:')&&['vowel','diphthong'].includes(PHONEMES[id.slice(4)]?.category);
  if(previewing)state.progress=.5;
  lessonKey='';showLesson(currentPose().phoneme);
  document.querySelectorAll('#practice-checks input').forEach(input=>input.checked=false);
  document.querySelectorAll('[data-vowel]').forEach(b=>b.setAttribute('aria-pressed',String(id==='ipa:'+b.dataset.vowel)));
  player.select(id,state.voice);$('#audio-status').textContent='本地合成示范音';
  const sound=SOUNDS[id];
  $('#sound-title').textContent=sound.title;$('#sound-copy').textContent=sound.copy;$('#sound-tip').textContent=sound.tip;
  $('#steps').innerHTML=sound.steps.map((s,i)=>`<button class="step" data-step="${i}"><span>${i+1}</span>${s}</button>`).join('');
  document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{pausePlayback();previewing=false;state.progress=[.25,.50,.85][Number(b.dataset.step)];player.seek(state.progress);});
  $('#focus-list').innerHTML=sound.focus.filter(id=>state.palette==='human'||!['genio','smile'].includes(id)).map(id=>`<button class="focus-item" data-focus="${id}"><span>${focusLabel(id)}</span><em>观察</em><i></i></button>`).join('');
  document.querySelectorAll('[data-focus]').forEach(b=>b.onclick=()=>focusOn(b.dataset.focus));
  $('#selection').innerHTML='<strong>选择器官查看动作</strong><p>点击模型或上方列表，查看当前音中的运动。</p>';
  syncPlay();
}
function syncPlay(){invalidate();$('#play').textContent=state.playing?'Ⅱ 暂停':motionOnly?'▶ 播放口型':'▶ 播放发音';$('#play').setAttribute('aria-pressed',String(state.playing));}
function focusLabel(id){return childMode?CHILD_LABELS[id]:state.palette==='human'?FOCUS[id].label:({tongue:'舌头',lips:'嘴唇',jaw:'下巴',velum:'腭部',voice:'喉部发声'}[id]||FOCUS[id].label);}
function focusMatch(id){
  if(childMode&&state.palette==='human'&&['lips','jaw'].includes(id))return n=>id==='lips'?n==='Skin - stitched atlas regions':n.startsWith('Lower ');
  return state.palette!=='human'&&['lips','jaw'].includes(id)?n=>n.startsWith('Character ')&&(id==='jaw'?/Chin|Face mask/.test(n):/Muzzle|Chin/.test(n)):FOCUS[id].match;
}

function syncAlpha(){
  alphaPending=false;invalidate();
  for(const key of ['left','right','skin','bone','muscle','organ']){
    const side=key==='left'||key==='right';$(side?`#${key}-alpha`:`#layer-${key}`).value=state.alpha[key];$(side?`#${key}-value`:`#value-${key}`).textContent=state.alpha[key]+'%';
  }
  for(const m of meshes){
    const section=state.alpha.left!==state.alpha.right;
    const a=m.userData.solidVolume&&section?1-state.alpha[m.userData.side]/100:effectiveOpacity(m.userData.side,m.userData.layer,state.alpha);
    m.visible=a>.005&&!m.userData.lumen&&(!m.userData.variant||m.userData.variant===state.palette)&&(state.palette==='human'||m.userData.variant===state.palette);
    if(m.userData.layer==='muscle'&&state.alpha.skin===0&&!section)m.visible=false;
    if(childMode&&teachingRole(m.userData)==='detail')m.visible=false;
    if(childMode&&section&&m.userData.layer==='eye')m.visible=false;
    setOpacity(m.material,a);
  }
  syncSections();
}
function syncSections(){
  for(const cap of sectionCaps){
    const side=cap.userData.side,source=cap.sourceMesh.material,white=cap.userData.whiteSection;
    const variant=cap.sourceMesh.userData.variant||'human';
    const filled=childMode&&!!cap.userData.contourFill;
    if(white)cap.position.x=(side==='left'?1:-1)*(filled?.004:-.0006);
    cap.visible=variant===state.palette&&state.alpha[side==='left'?'right':'left']>state.alpha[side]+1&&(white||cap.sourceMesh.visible)&&(!childMode||teachingRole(cap.userData)!=='detail');
    if(cap.userData.contourFill&&!childMode)cap.visible=false;
    if(childMode&&cap.userData.layer==='eye')cap.visible=false;
    if(cap.userData.sourceMaterial!==source){
      if(cap.userData.sourceMaterial)cap.material.dispose();
      cap.material=white?createSectionFillMaterial(source,variant!=='human',childMode,filled):source.clone();
      if(!white){cap.material.onBeforeCompile=source.onBeforeCompile;cap.material.customProgramCacheKey=source.customProgramCacheKey;}
      cap.material.polygonOffset=true;cap.material.polygonOffsetFactor=-cap.renderOrder;cap.material.polygonOffsetUnits=-cap.renderOrder;
      cap.userData.sourceMaterial=source;
    }
    const opacity=white?1-state.alpha[side]/100:source.opacity;
    setOpacity(cap.material,opacity);
  }
}
function clearPreset(){document.querySelectorAll('[data-preset]').forEach(b=>b.classList.remove('chosen'));}
function preset(id){
  if(id==='cutaway')state.alpha=childMode?{left:0,right:100,skin:0,bone:0,muscle:0,organ:0}:state.palette==='human'?{...DEFAULT_ALPHA}:{...DEFAULT_ALPHA,skin:0,muscle:100};
  if(id==='xray')state.alpha={left:0,right:0,skin:93,bone:85,muscle:50,organ:0};
  if(id==='surface')state.alpha={left:0,right:0,skin:0,bone:0,muscle:0,organ:0};
  syncAlpha();document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('chosen',b.dataset.preset===id));
}
function focusOn(id,rawName,reveal=true){
  invalidate();
  if(reveal)coach?.clearFocus();
  if(reveal&&(id||rawName))showInspector('tab-model');
  state.focus=id?{id,match:focusMatch(id),label:focusLabel(id)}:rawName?{match:n=>n===rawName,label:surfaceLabel(meshes.find(m=>m.userData.anatomyName===rawName)?.userData||{})}:null;
  document.querySelectorAll('[data-focus]').forEach(b=>b.classList.toggle('selected',b.dataset.focus===id));
  $('#selection').replaceChildren();const strong=document.createElement('strong'),p=document.createElement('p');
  strong.textContent=state.focus?.label||'选择器官查看动作';p.textContent=id?(state.palette!=='human'&&['lips','jaw'].includes(id)?'观察角色嘴巴的张开与合拢，配合口腔内部的舌位一起练习。':FOCUS[id].desc):rawName?'当前选中的源模型结构。可旋转模型或调整透明度观察。':'点击模型或上方列表，查看当前音中的运动。';
  $('#selection').append(strong,p);
}
function setView(view,smooth=false){
  const distance=view==='lips'?(state.palette==='human'?.24:.34):view==='mouth'?.26:mount.clientWidth<450?.7:.59;
  const target=['mouth','lips'].includes(view)?new THREE.Vector3(0,state.palette==='human'?-.025:0,.065):new THREE.Vector3(0,.023,.013);
  const dirs={lips:new THREE.Vector3(0,0,1),mouth:new THREE.Vector3(-1,.12,.28),oblique:new THREE.Vector3(-.85,.23,.9),front:new THREE.Vector3(0,.04,1),right:new THREE.Vector3(-1,.015,0),left:new THREE.Vector3(1,.015,0)};
  const position=target.clone().add(dirs[view].normalize().multiplyScalar(distance));
  cameraTween=smooth&&!coach?.reducedMotion?{from:camera.position.clone(),targetFrom:controls.target.clone(),position,target,start:performance.now()}:null;
  if(!cameraTween){camera.position.copy(position);controls.target.copy(target);controls.update();}
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('chosen',b.dataset.view===view));
}
function animatePose(pose){
  let pinned=null;
  for(const m of meshes){
    for(const [key,index] of m.userData.morphBindings)m.morphTargetInfluences[index]=pose.weights[key]||0;
    if(m.userData.solidVolume)continue;
    const name=m.userData.anatomyName;
    const match=state.focus?.match(name);
    const active=m.userData.motionKeys.reduce((v,k)=>Math.max(v,pose.weights[k]||0),0);
    m.material.color.copy(m.userData.baseColor);
    if(m.userData.layer==='muscle')m.material.color.lerp(activeColor,active*.35);
    m.material.emissive.set(match?'#c17935':childMode||m.userData.variant&&m.userData.variant!=='human'?m.userData.baseColor:'#000000');m.material.emissiveIntensity=match?.35:childMode?.22:m.userData.variant&&m.userData.variant!=='human'?.08:0;
    if(m.userData.feature==='tongue'&&m.userData.variant===state.palette)m.visible=effectiveOpacity(m.userData.side,m.userData.layer,state.alpha)>.005&&pose.weights.LipClose<.85;
    if(match&&m.visible&&(!pinned||m.material.opacity>pinned.material.opacity))pinned=m;
  }
  for(const cap of sectionCaps){
    if(!cap.userData.whiteSection)cap.visible=cap.sourceMesh.visible&&state.alpha[cap.userData.side==='left'?'right':'left']>state.alpha[cap.userData.side]+1;
    cap.material.color.copy(cap.sourceMesh.material.color);
    cap.material.emissive.copy(cap.sourceMesh.material.emissive);cap.material.emissiveIntensity=cap.sourceMesh.material.emissiveIntensity;
  }
  document.querySelectorAll('[data-focus]').forEach(b=>{
    const f=FOCUS[b.dataset.focus],amount=Math.max(...f.keys.map(k=>pose.weights[k]||0));
    b.querySelector('i').style.width=(amount*100)+'%';b.querySelector('em').textContent=amount>.1?'运动中':'观察';
  });
  const pin=$('#organ-pin');pin.hidden=!pinned;
  if(pinned){
    const p=pinned.userData.center.clone();pinned.localToWorld(p);
    if(childMode&&state.palette==='human'&&state.focus.id==='lips')p.set(0,-.018,.099);
    p.project(camera);
    if(p.z>1||Math.abs(p.x)>.92||Math.abs(p.y)>.85)pin.hidden=true;
    else {pin.textContent=state.focus.label;pin.style.left=((p.x+1)/2*mount.clientWidth)+'px';pin.style.top=((-p.y+1)/2*mount.clientHeight)+'px';}
  }
}
function animateAir(pose){
  airGroup.visible=state.air&&pose.air>.02;
  if(!airGroup.visible)return;
  airMat.opacity=.92*pose.air;
  const travel=state.progress*durationFor(state.sound)*(['k','p'].includes(pose.phoneme)?1.35:.65);
  const flowPath=pose.nasal>.5?nasalPath:path;
  for(let i=0;i<particles.count;i++){
    const t=(i/particles.count+travel)%1,p=flowPath.getPointAt(t);
    if(state.palette!=='human')p.y+=.014;
    // Flow remains close to the median plane; a small spread separates streamlines.
    p.x+=Math.sin(i*2.4)*.0015;p.y+=Math.cos(i*1.7)*.0008;
    dummy.position.copy(p);dummy.scale.setScalar(.7+.35*Math.sin(i*2.1));dummy.rotation.set(0,0,0);dummy.updateMatrix();particles.setMatrixAt(i,dummy.matrix);
  }
  particles.instanceMatrix.needsUpdate=true;
  for(let i=0;i<arrow.count;i++){
    const t=(i/arrow.count+travel)%1;dummy.position.copy(flowPath.getPointAt(t));if(state.palette!=='human')dummy.position.y+=.014;dummy.quaternion.setFromUnitVectors(up,flowPath.getTangentAt(t).normalize());dummy.scale.setScalar(1);dummy.updateMatrix();arrow.setMatrixAt(i,dummy.matrix);
  }
  arrow.instanceMatrix.needsUpdate=true;
}
function updateGuides(){
  guides.hidden=!childMode||state.alpha.left===state.alpha.right||Math.abs(camera.position.x-controls.target.x)<.12;
  if(guides.hidden)return;
  const w=mount.clientWidth,h=mount.clientHeight;
  const points=[[0,.002,.041],[0,-.027,.060],[0,-.073,.015]];
  guides.querySelectorAll('button').forEach((button,i)=>{
    const point=new THREE.Vector3(...points[i]);if(state.palette!=='human')point.y+=.014;
    point.project(camera);const x=(point.x+1)*w/2,y=(1-point.y)*h/2;
    const visible=point.z<1&&x>0&&x<w&&y>0&&y<h;
    button.hidden=!visible;const line=guides.querySelectorAll('path')[i];line.style.display=visible?'':'none';
    const labelY=h*(.49+i*.15);button.style.left='18px';button.style.top=labelY+'px';
    const start=18+button.offsetWidth;line.setAttribute('d',`M ${start} ${labelY+15} L ${Math.max(start+12,x-18)} ${labelY+15} L ${x} ${y}`);
  });
}
function updateAttention(){
  const halo=$('#attention-halo'),part=coach?.focus;
  halo.hidden=!part||!childMode;
  if(halo.hidden)return;
  // Project semantic anchors in the same coordinate system as the model guides.
  const point=new THREE.Vector3(...({lips:[0,-.019,.101],tongue:[0,-.027,.060],air:[0,-.073,.015]}[part]));
  if(state.palette!=='human')point.y+=.014;
  point.project(camera);
  const x=(point.x+1)*mount.clientWidth/2,y=(1-point.y)*mount.clientHeight/2;
  halo.hidden=point.z>1||x<30||x>mount.clientWidth-30||y<90||y>mount.clientHeight-50||(part!=='lips'&&state.alpha.left===state.alpha.right);
  halo.style.left=x+'px';halo.style.top=y+'px';
}
function tick(now){
  frame=requestAnimationFrame(tick);const dt=Math.min((now-last)/1000,.06);last=now;
  if(alphaPending)syncAlpha();
  if(cameraTween){
    const t=coach?.reducedMotion?1:Math.min(1,(now-cameraTween.start)/600),ease=t*t*(3-2*t);
    camera.position.lerpVectors(cameraTween.from,cameraTween.position,ease);controls.target.lerpVectors(cameraTween.targetFrom,cameraTween.target,ease);
    invalidate();if(t===1)cameraTween=null;
  }
  const cameraChanged=controls.update();
  if(!state.playing&&!renderDirty&&!cameraChanged)return;
  renderDirty=false;
  const duration=motionOnly?(state.sound==='alphabet'?Math.max(4,durationFor(state.sound)*1.7):4):player.duration||durationFor(state.sound);
  if(state.playing){
    if(motionOnly){state.progress+=dt*state.speed/duration;if(state.progress>=1){if(state.loop)state.progress%=1;else{state.progress=1;state.playing=false;syncPlay();coach?.finish('watch');}}}
    else state.progress=player.progress;
  }
  const pose=currentPose();animatePose(pose);animateAir(pose);showLesson(pose.phoneme);
  coach?.update(pose,state.playing);
  $('#voice-cue').classList.toggle('vibrating',state.playing&&pose.voiced);
  $('#timeline').value=Math.round(state.progress*1000);$('#time-label').textContent=(state.progress*duration).toFixed(1)+' / '+duration.toFixed(1)+' 秒';
  $('#phase-label').textContent=SOUNDS[state.sound].steps[pose.step];document.querySelectorAll('[data-step]').forEach(b=>b.classList.toggle('active',Number(b.dataset.step)===pose.step));
  $('#air-status').textContent=!state.air?'气流已隐藏':pose.air>.02?pose.voiced?'口腔送气 · 喉部发声':'口腔送气':state.progress>.1&&state.progress<.65&&['plosive','affricate','cluster'].includes(PHONEMES[pose.phoneme]?.category)?'闭塞阶段 · 气流受阻':'准备呼气';
  if(state.air&&pose.air>.02&&pose.nasal>.5)$('#air-status').textContent='鼻腔送气 · 喉部发声';
  if(pose.phoneme)$('#phase-label').textContent=`${pose.letter?pose.letter+' · ':''}/${PHONEMES[pose.phoneme].ipa}/ · ${SOUNDS[state.sound].steps[pose.step]}`;
  updateGuides();updateAttention();renderer.render(scene,camera);renderCount++;
}

// Compile both opacity modes while the loading screen is visible. Previously
// the first half-transparent interaction paid this shader cost on the UI frame.
async function warmMaterials(){
  const warmScene=new THREE.Scene(),materials=new Map();
  for(const source of [...meshes,...sectionCaps]){
    const copy=source.clone(false);copy.visible=true;copy.matrixAutoUpdate=false;
    copy.matrix.copy(source.matrixWorld);warmScene.add(copy);
    materials.set(source.material,source.material.opacity);
  }
  try{
    for(const opacity of [1,.5]){
      for(const material of materials.keys())setOpacity(material,opacity);
      await renderer.compileAsync(warmScene,camera,scene);
    }
  }finally{
    for(const [material,opacity] of materials)setOpacity(material,opacity);
    warmScene.clear();
  }
}
buildUI();
const mouthButton=document.createElement('button');mouthButton.dataset.view='mouth';mouthButton.textContent='口腔特写';$('.view-buttons').append(mouthButton);
const lipsButton=document.createElement('button');lipsButton.dataset.view='lips';lipsButton.textContent='唇部特写';$('.view-buttons').append(lipsButton);
try{
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;mount.appendChild(renderer.domElement);
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.22;controls.maxDistance=1.2;controls.enablePan=true;
  controls.addEventListener('change',invalidate);
  controls.addEventListener('start',()=>{cameraTween=null;});
  const resize=()=>{const w=mount.clientWidth,h=mount.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);invalidate();};new ResizeObserver(resize).observe(mount);resize();setView('oblique');
  mount.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();cameraTween=null;const offset=camera.position.clone().sub(controls.target);const s=new THREE.Spherical().setFromVector3(offset);s.theta+=(e.key==='ArrowLeft'?.1:e.key==='ArrowRight'?-.1:0);s.phi+=e.key==='ArrowUp'?-.1:e.key==='ArrowDown'?.1:0;s.makeSafe();camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));controls.update();});
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);fail(new Error('WebGL context lost'));});
  const loader=new GLTFLoader();
  Promise.all([loader.loadAsync('./assets/phonetic-head.glb'),loader.loadAsync('./assets/repaired-skin.glb'),loader.loadAsync('./assets/solid-human-core.glb'),loader.loadAsync('./assets/smooth-articulators.glb')]).then(async([gltf,repaired,solidCore,articulators])=>{
    const refinedNames=new Set();articulators.scene.traverse(m=>{if(m.isMesh)refinedNames.add(m.userData.anatomyName);});
    const replaced=[];gltf.scene.traverse(m=>{if(m.isMesh&&(m.userData.layer==='skin'||refinedNames.has(m.userData.anatomyName)))replaced.push(m);});
    for(const m of replaced){m.parent.remove(m);m.geometry.dispose();m.material.dispose();}
    gltf.scene.add(repaired.scene,solidCore.scene,articulators.scene);
    model=gltf.scene;model.updateMatrixWorld(true);scene.add(model);
    model.traverse(m=>{if(!m.isMesh)return;
      const metadata=m.userData.anatomyName?m.userData:m.parent?.userData||{};m.userData={...m.userData,...metadata};
      if(!m.userData.variant&&['skin','eye'].includes(m.userData.layer))m.userData.variant='human';
      if(!m.userData.side||!m.userData.layer)throw new Error('Missing anatomy metadata: '+m.name);
      const {color,material}=createTeachingMaterial(m.userData,state.palette,childMode);m.material=material;
      m.userData.baseColor=new THREE.Color(color);m.geometry.computeBoundingBox();m.userData.center=m.geometry.boundingBox.getCenter(new THREE.Vector3());m.frustumCulled=false;meshes.push(m);
      m.userData.morphBindings=Object.entries(m.morphTargetDictionary||{});
      m.userData.motionKeys=[...new Set(Object.values(FOCUS).filter(f=>f.match(m.userData.anatomyName)).flatMap(f=>f.keys))];
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
      cap.sourceMesh=source;if(whiteSection)cap.position.x=source.userData.side==='left'?-.0006:.0006;source.add(cap);model.attach(cap);sectionCaps.push(cap);
      if(whiteSection&&source.userData.variant==='human'&&source.userData.layer==='skin'){
        // A second, recessed fill closes cavity silhouettes without covering the
        // tongue/teeth. The outer cap still masks the rough core's median face.
        const backing=cap.clone();backing.name=cap.name+' cavity colour fill';backing.userData.contourFill=true;backing.sourceMesh=source;
        if(source.morphTargetInfluences){backing.morphTargetInfluences=source.morphTargetInfluences;backing.morphTargetDictionary=source.morphTargetDictionary;}
        model.add(backing);sectionCaps.push(backing);
      }
    }
    preset('cutaway');setView('right');model.updateMatrixWorld(true);
    $('#load-detail').textContent='正在准备透明观察效果…';await warmMaterials();
    ready=true;coach?.ready();$('#load-state').hidden=true;$('#play').disabled=false;$('#restart').disabled=false;last=performance.now();tick(last);
  }).catch(fail);
}catch(error){fail(error);}

$('#play').onclick=()=>state.playing?pausePlayback():startPlayback();
$('#restart').onclick=()=>{pausePlayback();previewing=false;state.progress=0;player.seek(0);};
$('#timeline').oninput=e=>{pausePlayback();previewing=false;state.progress=Number(e.target.value)/1000;player.seek(state.progress);};
$('#speed').oninput=e=>{
  player.setRate(Number(e.target.value));state.speed=player.rate;
  $('#speed-value').value=state.speed.toFixed(2)+' ×';
  e.target.setAttribute('aria-valuetext',state.speed.toFixed(2)+' 倍');
};
$('#voice').onchange=e=>{const resume=state.playing;pausePlayback();state.voice=e.target.value;state.progress=0;player.select(state.sound,state.voice);$('#audio-status').textContent='本地合成示范音';if(resume)startPlayback();};
$('#sound-toggle').onchange=e=>{player.setMuted(!e.target.checked);if(!e.target.checked&&!motionOnly)coach?.interrupt('声音已关闭。准备好后，点“听示范音”再听一次。');};
$('#loop').onchange=e=>state.loop=e.target.checked;$('#air-toggle').onchange=e=>state.air=e.target.checked;
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>controls&&setView(b.dataset.view,true));$('#reset-view').onclick=()=>controls&&setView('oblique',true);
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>preset(b.dataset.preset));$('#reset-opacity').onclick=()=>preset('cutaway');
$('#swap-sides').onclick=()=>{[state.alpha.left,state.alpha.right]=[state.alpha.right,state.alpha.left];syncAlpha();clearPreset();};
$('#clear-focus').onclick=()=>focusOn(null);
$('#anatomy-details').onchange=e=>{
  childMode=!e.target.checked;refreshMaterials();
  document.querySelectorAll('[data-focus]').forEach(b=>b.querySelector('span').textContent=focusLabel(b.dataset.focus));
  focusOn(null);$('#display-mode').textContent=childMode?'儿童简化模型':'教师解剖对照';
  $('#focus-heading').textContent=!childMode&&state.palette==='human'?'观察肌肉配合':'观察发音动作';
};
$('#contrast-sound').onclick=e=>selectLesson(e.currentTarget.dataset.sound);
coach=createLearningCoach({
  phoneme:()=>currentPose().phoneme,
  prepare(mode){
    pausePlayback();state.loop=false;$('#loop').checked=false;showInspector('tab-practice');focusOn(null,null,false);
    if(mode==='try'){
      state.progress=.5;previewing=true;player.seek(.5);preset('surface');setView('lips',true);return;
    }
    motionOnly=mode==='watch';$('#motion-only').checked=motionOnly;previewing=false;state.progress=0;player.seek(0);
    $('#speed').value=mode==='watch'?'0.65':'1';$('#speed').dispatchEvent(new Event('input'));
    if(!motionOnly){$('#sound-toggle').checked=true;player.setMuted(false);preset('surface');setView('lips',true);}
    state.air=true;$('#air-toggle').checked=true;
    syncPlay();
  },
  play:startPlayback,pause:pausePlayback,
  focus(part){
    if(part==='lips'){preset('surface');setView('lips',true);focusOn('lips',null,false);}
    else {preset('cutaway');setView('right',true);focusOn(part==='air'?'voice':'tongue',null,false);}
    if(part==='air'){state.air=true;$('#air-toggle').checked=true;}
  }
});
coach.ready(ready);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pausePlayback();});
let down=null;
mount.addEventListener('pointerdown',e=>down={x:e.clientX,y:e.clientY});
mount.addEventListener('pointerup',e=>{
  const start=down;down=null;
  if(!ready||!start||Math.hypot(start.x-e.clientX,start.y-e.clientY)>5)return;
  const rect=mount.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
  const hit=pickClosest(ray,[...meshes,...sectionCaps]);
  if(hit){const n=hit.object.userData.anatomyName,id=Object.keys(FOCUS).find(k=>FOCUS[k].match(n));focusOn(id,n);}
});
mount.addEventListener('pointercancel',()=>{down=null;});
window.renderSnapshot=()=>({renderCount,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,programs:renderer.info.programs.length,materialVersion:meshes.reduce((sum,m)=>sum+m.material.version,0)+sectionCaps.reduce((sum,m)=>sum+m.material.version,0)});
// Read-only diagnostic snapshot for local checks; no UI simulation or random scoring.
window.teachingSnapshot=()=>({childMode,lesson:lessonKey,visibleSkeleton:meshes.filter(m=>m.visible&&m.userData.layer==='bone'&&teachingRole(m.userData)!=='teeth').length,filledContours:sectionCaps.filter(m=>m.visible&&m.userData.contourFill).length,visibleDetails:meshes.filter(m=>m.visible&&teachingRole(m.userData)==='detail').length,visibleRoles:[...new Set(meshes.filter(m=>m.visible).map(m=>teachingRole(m.userData)))],hiddenDetailCaps:sectionCaps.filter(m=>!m.visible&&teachingRole(m.userData)==='detail').length});
window.learningSnapshot=()=>({...coach.snapshot(),cameraMoving:!!cameraTween});
window.sectionMaterials=()=>sectionCaps.filter(c=>c.visible).map(c=>({name:c.sourceMesh.userData.anatomyName,color:c.material.color.getHexString(),source:c.sourceMesh.material.color.getHexString(),type:c.material.type,sourceType:c.sourceMesh.material.type,emissive:c.material.emissive?.getHexString(),sourceEmissive:c.sourceMesh.material.emissive?.getHexString()}));
window.labSnapshot=()=>({ready,audio:{voice:state.voice,src:player.source,paused:player.audio.paused,currentTime:player.audio.currentTime,duration:player.duration,rate:player.rate,muted:player.muted},solidCoreMeshes:meshes.filter(m=>m.userData.solidVolume).length,visibleSolidCoreMeshes:meshes.filter(m=>m.userData.solidVolume&&m.visible).length,medianNormalGroups,sectionCapCount:sectionCaps.length,visibleWhiteSections:sectionCaps.filter(c=>c.visible&&c.userData.whiteSection).length,whiteSectionColors:[...new Set(sectionCaps.filter(c=>c.visible&&c.userData.whiteSection).map(c=>c.material.color.getHexString()))],humanEyeColors:meshes.filter(m=>m.userData.layer==='eye').map(m=>m.material.color.getHexString()),visibleSectionCaps:sectionCaps.filter(c=>c.visible).length,visibleMuscleCaps:sectionCaps.filter(c=>c.visible&&c.userData.layer==='muscle').length,palette:state.palette,visibleSourceMeshes:meshes.filter(m=>m.visible&&!m.userData.variant).length,characterTongue:meshes.filter(m=>m.userData.variant===state.palette&&m.userData.feature==='tongue').map(m=>({visible:m.visible,weights:Object.fromEntries(Object.entries(m.morphTargetDictionary||{}).map(([key,index])=>[key,m.morphTargetInfluences[index]]))})),repairedSkinMeshes:meshes.filter(m=>m.userData.layer==='skin'&&m.userData.variant==='human'&&!m.userData.solidVolume).length,visibleHeadVariants:[...new Set(meshes.filter(m=>m.visible&&m.userData.variant).map(m=>m.userData.variant))],visibleHeadMeshes:meshes.filter(m=>m.userData.variant===state.palette&&m.visible).length,headModels:[...new Set(meshes.map(m=>m.userData.variant).filter(Boolean))],skinMorphMeshes:meshes.filter(m=>m.userData.layer==='skin'&&!m.userData.solidVolume&&m.userData.variant===state.palette&&m.morphTargetInfluences?.some(w=>w>0)).length,playing:state.playing,sound:state.sound,progress:state.progress,alpha:{...state.alpha},meshCount:meshes.length,pose:currentPose(),airVisible:airGroup.visible,airPosition:particles.instanceMatrix.array.slice(12,15),visibleSides:{left:meshes.filter(m=>m.userData.side==='left'&&m.visible).length,right:meshes.filter(m=>m.userData.side==='right'&&m.visible).length},morphMeshes:meshes.filter(m=>m.morphTargetInfluences?.some(w=>w>0)).length});
