import './dropdown.js';
import {mountVoicePractice} from './voice-practice.js';
import {showInspector} from './interface.js';
import {PronunciationAudio,audioCatalog,curriculumCatalog} from './audio.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {buildSectionGeometry,smoothMedianNormals,createSectionFillMaterial} from './sections.js';
import {PALETTES,createTeachingMaterial} from './palette.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {SOUNDS,FOCUS,poseAt,DEFAULT_ALPHA,effectiveOpacity} from './motion.js';
import {PHONEMES,LETTERS,CATEGORIES} from './phonemes.js';
import {teachingRole,lessonFor,CHILD_LABELS} from './teaching.js';
import {createLearningCoach} from './learning.js';
import {setOpacity,sectionOpacityPolicy,pickClosest,surfaceLabel} from './render-utils.js';
import {childToothGeometry} from './child-teeth.js';
import {teachingTongueWeights} from './teaching-tongue.js';
import {createOralAirPath} from './tongue-airflow.js';
import {ANATOMY_GUIDES,ANATOMY_INTRO} from './anatomy-guide.js';
import {LESSONS,LESSON_SERIES,DEMONSTRATION_RATE} from './curriculum.js';
import {mountCurriculum} from './curriculum-ui.js';
import {curriculumSound,curriculumPose} from './curriculum-playback.js';

let voicePractice;
const embedded=new URLSearchParams(location.search).has('embed');
const $=s=>document.querySelector(s);
const state={sound:'ipa:i',progress:0,playing:false,speed:1,loop:false,air:true,palette:'human',alpha:{left:0,right:0,skin:0,bone:0,muscle:0,organ:0},focus:null,voice:'female'};
const mount=$('#viewer'),meshes=[],sectionCaps=[];
const guides=document.createElement('div');guides.id='anatomy-guides';guides.hidden=true;
guides.innerHTML='<svg aria-hidden="true">'+ANATOMY_GUIDES.map(()=>'<path/>').join('')+'<circle class="voice-location" r="10"/></svg>'+ANATOMY_GUIDES.map(g=>`<button type="button" data-guide="${g.id}" aria-pressed="false" aria-label="${g.label}：${g.nickname}" style="--organ-color:${g.color}"><i></i>${g.label}</button>`).join('');
$('#stage').append(guides);
guides.querySelectorAll('button').forEach(button=>button.onclick=()=>explainOrgan(button.dataset.guide));
let slowMotion=false,previewing=false,childMode=true,lessonKey='';
let selectedGuide=null;
const tongueLandmarks=[
  {id:'tongue-tip',label:'舌尖',names:['Tongue'],point:[0,-.022,.080]},
  {id:'tongue-body',label:'舌面',names:['Tongue'],point:[0,-.011,.052]},
  {id:'tongue-root',label:'舌根',names:['Tongue'],point:[0,-.043,.030]},
];
const tongueLabels=document.createElement('div');tongueLabels.id='tongue-landmarks';tongueLabels.hidden=true;
tongueLabels.innerHTML=tongueLandmarks.map(g=>`<span>${g.label}</span>`).join('');$('#stage').append(tongueLabels);
const guideBindings=new Map();
let playbackAttempt=0;
let coach, curriculum, cameraTween=null;
let renderDirty=true,alphaPending=false,renderCount=0;
const invalidate=()=>{renderDirty=true;};
// Native controls and coach actions can change the scene while playback is idle.
for(const event of ['input','change','click'])document.addEventListener(event,invalidate,true);
let voiceCatalog;
let lessonCatalog;
audioCatalog.then(value=>{voiceCatalog=value.voices;invalidate();}).catch(()=>{});
curriculumCatalog.then(value=>{lessonCatalog=value.voices;invalidate();}).catch(()=>{});
const isCurriculum=()=>state.sound.startsWith('lesson:');
const currentSound=()=>curriculumSound(state.sound)||SOUNDS[state.sound];
const currentDuration=()=>currentSound().duration;
function currentPose(){
  if(isCurriculum())return curriculumPose(state.sound,state.progress,lessonCatalog?.[state.voice]?.entries[state.sound.replace(':','-')]);
  const entry=voiceCatalog?.[state.voice]?.entries.alphabet;
  if(state.sound!=='alphabet'||!entry)return poseAt(state.sound,state.progress);
  const time=state.progress*entry.duration;
  const segment=entry.segments.findLast(s=>time>=s.start)||entry.segments[0];
  const progress=Math.max(0,Math.min(1,(time-segment.start)/(segment.end-segment.start)));
  return {...poseAt('letter:'+segment.letter,progress),letter:segment.letter};
}

const player=new PronunciationAudio(()=>{
  state.progress=1;state.playing=false;syncPlay();
  window.dispatchEvent(new CustomEvent('teaching-ended',{detail:{sound:state.sound}}));
  coach?.finish(slowMotion?'watch':'listen');
  if(state.loop){state.progress=0;startPlayback();}
},audioFailure,invalidate);
function audioFailure(error){
  window.dispatchEvent(new CustomEvent('teaching-error',{detail:{message:error.message}}));
  player.pause();state.playing=false;syncPlay();
  coach?.fail();
  $('#audio-status').textContent=error.message||'无法播放，请重试。';
  curriculum?.setStatus('示范暂时没播完，请点“听示范并跟读”重试。');
}
function pausePlayback(){playbackAttempt++;player.pause();state.playing=false;syncPlay();coach?.interrupt();}
async function startPlayback(){
  voicePractice?.stop();
  if(!ready)return;
  const attempt=++playbackAttempt;
  if(state.progress>=1||previewing)state.progress=0;
  previewing=false;
  state.playing=true;syncPlay();$('#audio-status').textContent='正在准备声音…';
  try{
    await player.play(state.progress);
    if(attempt===playbackAttempt&&state.playing){$('#audio-status').textContent='课程示范音 · 口型为教学辅助';curriculum?.setStatus('先听完整示范，再跟读；可用下方进度条暂停和回看。');coach?.resume(slowMotion?'watch':'listen');}
  }catch(error){if(attempt===playbackAttempt)audioFailure(error);}
}

let medianNormalGroups=0;
let renderer,model,controls,frame=0,ready=false;
const scene=new THREE.Scene();scene.background=new THREE.Color(PALETTES.human.background);
const camera=new THREE.PerspectiveCamera(32,1,.001,20);
const fill=new THREE.HemisphereLight(0xffffff,0x6b7c96,.8);scene.add(fill);
const key=new THREE.DirectionalLight(0xfff7ed,1.1);key.position.set(-.6,.7,.7);scene.add(key);
const rim=new THREE.DirectionalLight(0xd0e4ff,.35);rim.position.set(.5,.1,-.4);scene.add(rim);
const floor=new THREE.Mesh(new THREE.CircleGeometry(.2,64),new THREE.MeshBasicMaterial({color:'#dce5ef',transparent:true,opacity:.45,depthWrite:false}));floor.rotation.x=-Math.PI/2;floor.position.y=-.123;scene.add(floor);
const airGroup=new THREE.Group();scene.add(airGroup);
const airMat=new THREE.MeshStandardMaterial({color:'#24a8c8',emissive:'#128ba9',emissiveIntensity:.6,transparent:true,opacity:.9,depthWrite:false});
const particles=new THREE.InstancedMesh(new THREE.SphereGeometry(.0011,8,6),airMat,36);particles.frustumCulled=false;airGroup.add(particles);
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
function fail(error){console.error(error);ready=false;coach?.ready(false);curriculum?.setReady(false);$('#play').disabled=true;$('#restart').disabled=true;$('#load-state').hidden=false;$('#load-state b').textContent='模型暂时无法显示';$('#load-detail').textContent='请检查网络连接，然后重试。';$('.spinner').hidden=true;$('#retry').hidden=false;pausePlayback();}
$('#retry').onclick=()=>location.reload();

function buildUI(){
  $('.eyebrow').textContent='国内常见48音标教学集合';
  const chooser=document.createElement('div');chooser.className='library-chooser';
  chooser.innerHTML='<label for="library-mode">学习模式</label><lab-select id="library-mode"><option value="ipa">48 音标教学集合</option><option value="vowels">20 个元音口型</option><option value="letters">A–Z 字母名称</option><option value="curriculum">单词与句子 · 循序跟读</option></lab-select><label for="category">音标分类</label><lab-select id="category"></lab-select>';
  $('.eyebrow').after(chooser);
  const picker=document.createElement('div');picker.id='vowel-picker';
  chooser.after(picker);
  picker.onclick=event=>{const button=event.target.closest('[data-sound]');if(button)selectSound(button.dataset.sound);};
  const motionToggle=document.createElement('label');motionToggle.className='motion-toggle';
  motionToggle.innerHTML='<input id="motion-only" type="checkbox"> 慢速跟读 · 声音同步';
  $('.audio-toolbar').append(motionToggle);
  $('#motion-only').onchange=e=>{pausePlayback();slowMotion=e.target.checked;previewing=false;state.progress=0;player.seek(0);$('#speed').value=slowMotion?'0.65':'1';$('#speed').dispatchEvent(new Event('input'));if(slowMotion){player.setMuted(false);$('#sound-toggle').checked=true;}$('#audio-status').textContent=slowMotion?'声音与口型同步慢放':'本地合成示范音';syncPlay();};
  $('#category').setOptions(Object.entries(CATEGORIES));
  $('#focus-heading').textContent='观察发音动作';
  const refreshEntries=()=>{
    const mode=$('#library-mode').value;
    const course=mode==='curriculum';
    $('.eyebrow').textContent=course?'从声音到句子':'国内常见48音标教学集合';
    curriculum?.setVisible(course);
    $('.lesson-note').hidden=course;
    $('#category').hidden=mode!=='ipa';$('label[for="category"]').hidden=mode!=='ipa';
    picker.hidden=course;
    if(course){selectSound('lesson:'+LESSON_SERIES[0].lessonIds[0]);return;}
    const groups=mode==='letters'?['letters']:mode==='vowels'?['vowel','diphthong']:[$('#category').value];
    const entries=groups.flatMap(category=>category==='letters'?[...Object.values(LETTERS).map(l=>['letter:'+l.id,l.id,`/${l.ipa}/`]),['alphabet','A–Z','连续播放']]:Object.values(PHONEMES).filter(p=>p.category===category).map(p=>['ipa:'+p.id,p.ipa,p.word]));
    picker.innerHTML=groups.map(category=>{
      const items=category==='letters'?entries:entries.filter(([id])=>PHONEMES[id.slice(4)].category===category);
      return `<fieldset><legend>${CATEGORIES[category]||'A–Z 字母名称'}</legend><div class="vowel-grid">${items.map(([id,label,example])=>`<button type="button" data-sound="${id}" ${id.startsWith('ipa:')&&['vowel','diphthong'].includes(category)?`data-vowel="${id.slice(4)}"`:''} aria-label="${label} ${example}" aria-pressed="false"><b>${label}</b><small>${example}</small></button>`).join('')}</div></fieldset>`;
    }).join('');
    selectSound(entries[0][0]);
  };
  $('#library-mode').onchange=refreshEntries;$('#category').onchange=refreshEntries;
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
  selectSound('ipa:'+id);
}
function refreshMaterials(){
  for(const m of meshes){
    const {color,material}=createTeachingMaterial(m.userData,state.palette,childMode);
    const {opacity,transparent,depthWrite}=m.material;
    m.material.dispose();m.material=material;Object.assign(material,{opacity,transparent,depthWrite});m.userData.baseColor.set(color);
  }
  syncTeachingGeometry();syncAlpha();
}
function syncTeachingGeometry(){
  for(const m of [...meshes,...sectionCaps]){
    if(teachingRole(m.userData)!=='teeth')continue;
    if(!m.originalTeachingGeometry){
      m.originalTeachingGeometry=m.geometry;
      const reference=m.sourceMesh?.originalTeachingGeometry||m.geometry;
      m.childTeachingGeometry=childToothGeometry(m.geometry,m.userData.anatomyName.startsWith('Upper '),reference);
    }
    // Anatomy details reveal extra structures, not the long exposed roots.
    // Keep the same comfortable tooth silhouette in both teaching modes.
    m.geometry=m.childTeachingGeometry;
    m.userData.center=m.geometry.boundingBox.getCenter(new THREE.Vector3());
  }
}
function selectSound(id){
  voicePractice?.stop();
  const enteringCourse=!isCurriculum()&&id.startsWith('lesson:');
  pausePlayback();state.sound=id;state.progress=0;state.focus=null;
  resetGuide();
  coach?.reset();
  if(isCurriculum())curriculum?.select(id.slice(7));
  previewing=id.startsWith('ipa:')&&['vowel','diphthong'].includes(PHONEMES[id.slice(4)]?.category);
  if(previewing)state.progress=.5;
  lessonKey='';showLesson(currentPose().phoneme);
  document.querySelectorAll('#practice-checks input').forEach(input=>input.checked=false);
  document.querySelectorAll('#vowel-picker [data-sound]').forEach(b=>b.setAttribute('aria-pressed',String(id===b.dataset.sound)));
  if(enteringCourse&&state.speed===1){
    player.setRate(DEMONSTRATION_RATE);state.speed=player.rate;
    $('#speed').value=state.speed;$('#speed-value').value=state.speed.toFixed(2)+' ×';
    $('#speed').setAttribute('aria-valuetext',state.speed.toFixed(2)+' 倍');
  }
  player.select(id,state.voice);$('#audio-status').textContent='本地合成示范音';
  const sound=currentSound();
  $('#steps').hidden=isCurriculum();
  $('#lesson-word').hidden=isCurriculum();
  $('.sound-tag').textContent=isCurriculum()?'当前音素':'发音探索';
  $('.cue-heading').textContent=isCurriculum()?'当前音素的发音提示':'三个发音小提示';
  $('#sound-title').textContent=(isCurriculum()?'口型分解 · ':'')+sound.title;$('#sound-copy').textContent=sound.copy;$('#sound-tip').textContent=sound.tip;
  $('#steps').innerHTML=sound.steps.map((s,i)=>`<button class="step" data-step="${i}"><span>${i+1}</span>${s}</button>`).join('');
  document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{pausePlayback();previewing=false;state.progress=[.25,.50,.85][Number(b.dataset.step)];player.seek(state.progress);});
  $('#focus-list').innerHTML=sound.focus.filter(id=>state.palette==='human'||!['genio','smile'].includes(id)).map(id=>`<button class="focus-item" data-focus="${id}"><span>${focusLabel(id)}</span><em>观察</em><i></i></button>`).join('');
  document.querySelectorAll('[data-focus]').forEach(b=>b.onclick=()=>focusOn(b.dataset.focus));
  $('#selection').innerHTML='<strong>选择器官查看动作</strong><p>点击模型或上方列表，查看当前音中的运动。</p>';
  syncPlay();
}
function syncPlay(){invalidate();curriculum?.setPlaying(state.playing);$('#play').textContent=state.playing?'Ⅱ 暂停':slowMotion?'▶ 慢速跟读':'▶ 播放发音';$('#play').setAttribute('aria-pressed',String(state.playing));}
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
    const {opacity:a}=sectionOpacityPolicy(m.userData.side,m.userData.layer,state.alpha);
    m.visible=a>0&&!m.userData.lumen&&(!m.userData.variant||m.userData.variant===state.palette)&&(state.palette==='human'||m.userData.variant===state.palette);
    if(m.userData.layer==='muscle'&&state.alpha.skin===0&&!section)m.visible=false;
    if(childMode&&['detail','gum'].includes(teachingRole(m.userData)))m.visible=false;
    // Eyeballs and the atlas's bulky gum/root support are not pronunciation
    // targets; closed eyelids and the cutaway fill already provide their context.
    if(childMode&&m.userData.layer==='eye')m.visible=false;
    if(childMode&&m.userData.teacherOnly||!childMode&&m.userData.teachingOnly)m.visible=false;
    // The coarse closed backing overlaps the repaired skin and causes ghost
    // surfaces. Dedicated cut faces provide closure in both teaching modes.
    if(m.userData.solidVolume)m.visible=false;
    setOpacity(m.material,a);
    // Blend the nearest skin surface over internal structures, not behind them.
    // Opaque skin first: its depth hides the backdrop from the outside, while
    // the far wall of an exposed half remains behind the coloured cut plane.
    m.renderOrder=m.material.userData.surfaceDepth?(a===1?-20:20):0;
    if(m.userData.layer==='skin'&&!m.userData.solidVolume){
      if(!m.depthShell){
        // Depth-only prepass avoids repeatedly blending overlapping triangles in
        // the imported shell. Run after organs, then blend only the nearest skin.
        const material=new THREE.MeshBasicMaterial({side:THREE.FrontSide,colorWrite:false,depthWrite:true,transparent:true});
        const shell=new THREE.Mesh(m.geometry,material);shell.renderOrder=19;shell.frustumCulled=false;
        shell.morphTargetInfluences=m.morphTargetInfluences;shell.morphTargetDictionary=m.morphTargetDictionary;
        m.add(shell);m.depthShell=shell;
      }
      const translucent=a>0&&a<1;
      m.depthShell.visible=translucent;
      m.material.depthFunc=translucent?THREE.EqualDepth:THREE.LessEqualDepth;
    }
  }
  syncSections();
}
function syncSections(){
  for(const cap of sectionCaps){
    const side=cap.userData.side,source=cap.sourceMesh.material,white=cap.userData.whiteSection;
    const variant=cap.sourceMesh.userData.variant||'human';
    const filled=childMode&&!!cap.userData.contourFill;
    const policy=sectionOpacityPolicy(side,cap.userData.layer,state.alpha);
    cap.userData.opacityPolicy=policy;
    // The geometry is already inset 0.02 mm into its owning half. Do not shift
    // its contour across the skin, especially around the lips and nose.
    cap.position.x=0;
    cap.visible=variant===state.palette&&policy.capOpacity>0&&cap.sourceMesh.visible&&(!childMode||teachingRole(cap.userData)!=='detail');
    if(cap.userData.contourFill&&!childMode)cap.visible=false;
    if(childMode&&cap.userData.layer==='eye')cap.visible=false;
    if(cap.userData.sourceMaterial!==source){
      if(cap.userData.sourceMaterial)cap.material.dispose();
      cap.material=white?createSectionFillMaterial(source,variant!=='human',childMode,filled):source.clone();
      if(cap.userData.contourFill)cap.renderOrder=-10;
      cap.material.side=THREE.DoubleSide;
      cap.material.depthFunc=THREE.LessEqualDepth;
      delete cap.material.userData.surfaceDepth;
      if(!white){cap.material.onBeforeCompile=source.onBeforeCompile;cap.material.customProgramCacheKey=source.customProgramCacheKey;}
      cap.material.polygonOffset=true;cap.material.polygonOffsetFactor=-cap.renderOrder;cap.material.polygonOffsetUnits=-cap.renderOrder;
      cap.userData.sourceMaterial=source;
    }
    setOpacity(cap.material,policy.capOpacity);
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
  resetGuide();
  if(reveal)coach?.clearFocus();
  if(reveal&&(id||rawName))showInspector('tab-model');
  state.focus=id?{id,match:focusMatch(id),label:focusLabel(id)}:rawName?{match:n=>n===rawName,label:surfaceLabel(meshes.find(m=>m.userData.anatomyName===rawName)?.userData||{})}:null;
  document.querySelectorAll('[data-focus]').forEach(b=>b.classList.toggle('selected',b.dataset.focus===id));
  $('#selection').replaceChildren();const strong=document.createElement('strong'),p=document.createElement('p');
  strong.textContent=state.focus?.label||'选择器官查看动作';p.textContent=id?(state.palette!=='human'&&['lips','jaw'].includes(id)?'观察角色嘴巴的张开与合拢，配合口腔内部的舌位一起练习。':FOCUS[id].desc):rawName?'当前选中的源模型结构。可旋转模型或调整透明度观察。':'点击模型或上方列表，查看当前音中的运动。';
  $('#selection').append(strong,p);
}
function resetGuide(){
  selectedGuide=null;
  document.querySelectorAll('[data-organ],[data-guide]').forEach(b=>b.setAttribute('aria-pressed','false'));
  $('#part-description').textContent=ANATOMY_INTRO;
  $('#part-activity').hidden=true;
}
function explainOrgan(id){
  const guide=ANATOMY_GUIDES.find(g=>g.id===id);if(!guide)return;
  if(id==='hard-palate'&&!childMode){
    $('#anatomy-details').checked=false;$('#anatomy-details').dispatchEvent(new Event('change'));
  }
  focusOn(guide.focus);showInspector('tab-model');
  selectedGuide=id;
  if(guide.names)state.focus={id:guide.focus,match:name=>guide.names.includes(name),label:guide.label};
  $('#part-description').textContent=guide.description;
  $('#part-try').textContent=guide.activity;$('#part-activity').hidden=false;
  $('#part-demo').textContent=`看 /${PHONEMES[guide.sound].ipa}/ 的动作`;
  $('#part-compare').hidden=!guide.contrast;
  if(guide.contrast)$('#part-compare').textContent=`对比 /${PHONEMES[guide.contrast].ipa}/`;
  document.querySelectorAll('[data-organ],[data-guide]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.organ||b.dataset.guide)===id)));
  $('#selection strong').textContent=guide.label;$('#selection p').textContent=guide.description;
  if(id==='voice'){
    // A fixed right-side camera needs the matching exposed half, even after
    // swapping sides or hiding internal layers in the teacher tools.
    preset('cutaway');
    setView('voice',true);
  }else if(['hard-palate','velum','tongue','nasal'].includes(id)){
    preset('cutaway');setView('mouth',true);
  }
}
function setView(view,smooth=false){
  if(view==='lips'||embedded&&view==='front')preset('surface');
  else if(embedded&&['right','mouth'].includes(view))preset('cutaway');
  const distance=view==='voice'?.22:view==='lips'?(state.palette==='human'?.24:.34):view==='mouth'?.26:mount.clientWidth<450?.7:.59;
  const target=view==='voice'?new THREE.Vector3(0,-.073,.015):['mouth','lips'].includes(view)?new THREE.Vector3(0,state.palette==='human'?-.025:0,.065):new THREE.Vector3(0,.023,.013);
  const dirs={voice:new THREE.Vector3(-1,.1,.35),lips:new THREE.Vector3(0,0,1),mouth:new THREE.Vector3(-1,.12,.28),oblique:new THREE.Vector3(-.85,.23,.9),front:new THREE.Vector3(0,.04,1),right:new THREE.Vector3(-1,.015,0),left:new THREE.Vector3(1,.015,0)};
  const position=target.clone().add(dirs[view].normalize().multiplyScalar(distance));
  cameraTween=smooth&&!coach?.reducedMotion?{from:camera.position.clone(),targetFrom:controls.target.clone(),position,target,start:performance.now()}:null;
  if(!cameraTween){camera.position.copy(position);controls.target.copy(target);controls.update();}
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('chosen',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
}
function animatePose(pose){
  let pinned=null;
  for(const m of meshes){
    const weights=m.userData.teachingTongue?teachingTongueWeights(pose.weights):pose.weights;
    for(const [key,index] of m.userData.morphBindings)m.morphTargetInfluences[index]=weights[key]||0;
    if(m.userData.solidVolume)continue;
    const name=m.userData.anatomyName;
    const match=state.focus?.match(name);
    const active=m.userData.motionKeys.reduce((v,k)=>Math.max(v,pose.weights[k]||0),0);
    m.material.color.copy(m.userData.baseColor);
    if(m.userData.layer==='muscle')m.material.color.lerp(activeColor,active*.35);
    const childFill=m.userData.layer==='skin'||m.userData.layer==='eye'?.22:.4;
    m.material.emissive.set(childMode?m.userData.baseColor:match?'#c17935':m.userData.variant&&m.userData.variant!=='human'?m.userData.baseColor:'#000000');
    m.material.emissiveIntensity=childMode?(match?.6:childFill):match?.35:m.userData.variant&&m.userData.variant!=='human'?.08:0;
    if(m.userData.feature==='tongue'&&m.userData.variant===state.palette)m.visible=effectiveOpacity(m.userData.side,m.userData.layer,state.alpha)>.005&&pose.weights.LipClose<.85;
    if(match&&m.visible&&(!pinned||m.material.opacity>pinned.material.opacity))pinned=m;
  }
  for(const cap of sectionCaps){
    // Visibility is owned by syncSections; animation must not revive hidden caps.
    cap.material.color.copy(cap.sourceMesh.material.color);
    cap.material.emissive.copy(cap.sourceMesh.material.emissive);cap.material.emissiveIntensity=cap.sourceMesh.material.emissiveIntensity;
  }
  document.querySelectorAll('[data-focus]').forEach(b=>{
    const f=FOCUS[b.dataset.focus],amount=Math.max(...f.keys.map(k=>pose.weights[k]||0));
    b.querySelector('i').style.width=(amount*100)+'%';b.querySelector('em').textContent=amount>.1?'运动中':'观察';
  });
  const pin=$('#organ-pin');pin.hidden=!pinned||!!selectedGuide;
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
  const travel=state.progress*currentDuration()*(['k','p'].includes(pose.phoneme)?1.35:.65);
  const tongues=meshes.filter(m=>m.userData.anatomyName==='Tongue'&&(childMode?m.userData.teachingTongue:!m.userData.teachingTongue));
  const roof=meshes.filter(m=>m.userData.teachingOnly&&['Hard palate','Soft palate','Uvula of palate'].includes(m.userData.anatomyName));
  const flowPath=pose.nasal>.5?nasalPath:tongues.length?createOralAirPath(tongues,roof,pose):path;
  if(flowPath.userData?.canFlow===false){airGroup.visible=false;return;}
  const particleScale=flowPath.userData?.particleScale??1;
  for(let i=0;i<particles.count;i++){
    const t=(i/particles.count+travel)%1,p=flowPath.getPointAt(t);
    if(state.palette!=='human')p.y+=.014;
    // Flow remains close to the median plane; a small spread separates streamlines.
    p.x+=Math.sin(i*2.4)*.0015*particleScale;p.y+=Math.cos(i*1.7)*.0008*particleScale;
    dummy.position.copy(p);dummy.scale.setScalar((.7+.35*Math.sin(i*2.1))*particleScale);dummy.rotation.set(0,0,0);dummy.updateMatrix();particles.setMatrixAt(i,dummy.matrix);
  }
  particles.instanceMatrix.needsUpdate=true;
  for(let i=0;i<arrow.count;i++){
    const t=(i/arrow.count+travel)%1;dummy.position.copy(flowPath.getPointAt(t));if(state.palette!=='human')dummy.position.y+=.014;dummy.quaternion.setFromUnitVectors(up,flowPath.getTangentAt(t).normalize());dummy.scale.setScalar(particleScale);dummy.updateMatrix();arrow.setMatrixAt(i,dummy.matrix);
  }
  arrow.instanceMatrix.needsUpdate=true;
}
function guidePoint(guide){
  const anchor=new THREE.Vector3(...guide.point);
  if(!guide.names)return anchor;
  if(!guideBindings.has(guide.id)){
    const targets=meshes.filter(m=>guide.names.includes(m.userData.anatomyName));
    guideBindings.set(guide.id,targets.map(mesh=>{
      let index=0,distance=Infinity;
      for(let i=0;i<mesh.geometry.attributes.position.count;i++){
        const p=new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld);
        const d=p.distanceToSquared(anchor);
        if(d<distance){distance=d;index=i;}
      }
      return {mesh,index};
    }));
  }
  const target=guideBindings.get(guide.id).filter(t=>t.mesh.visible).sort((a,b)=>b.mesh.material.opacity-a.mesh.material.opacity)[0];
  return target?target.mesh.localToWorld(target.mesh.getVertexPosition(target.index,new THREE.Vector3())):anchor;
}
function updateGuides(){
  guides.hidden=!childMode||(state.alpha.left===state.alpha.right&&state.alpha.skin<50)||Math.min(state.alpha.left,state.alpha.right)>=100||Math.abs(camera.position.x-controls.target.x)<.12;
  tongueLabels.hidden=guides.hidden||selectedGuide!=='tongue'||!meshes.some(m=>m.userData.teachingTongue&&m.visible);
  if(!tongueLabels.hidden)tongueLandmarks.forEach((g,i)=>{
    const p=guidePoint(g).project(camera),label=tongueLabels.children[i];
    label.hidden=p.z>1||Math.abs(p.x)>.9||Math.abs(p.y)>.9;
    label.style.left=`${(p.x+1)*mount.clientWidth/2}px`;label.style.top=`${(1-p.y)*mount.clientHeight/2}px`;
  });
  if(guides.hidden)return;
  const w=mount.clientWidth,h=mount.clientHeight;
  guides.querySelectorAll('button').forEach((button,i)=>{
    const point=guidePoint(ANATOMY_GUIDES[i]);if(state.palette!=='human')point.y+=.014;
    point.project(camera);const x=(point.x+1)*w/2,y=(1-point.y)*h/2;
    const guide=ANATOMY_GUIDES[i];
    const targets=guide.names?meshes.filter(m=>guide.names.includes(m.userData.anatomyName)):[];
    const layer=guide.id==='nasal'?'skin':guide.id==='voice'?'muscle':'organ';
    const visible=point.z<1&&x>0&&x<w&&y>0&&y<h&&state.alpha[layer]<100&&(!targets.length||targets.some(m=>m.visible));
    button.hidden=!visible;const line=guides.querySelectorAll('path')[i];line.style.display=visible?'':'none';
    line.classList.toggle('is-selected',selectedGuide===guide.id);
    const labelY=h*(.26+i*.107);button.style.left='12px';button.style.top=labelY+'px';
    const start=18+button.offsetWidth;line.setAttribute('d',`M ${start} ${labelY+15} L ${Math.max(start+12,x-18)} ${labelY+15} L ${x} ${y}`);
    if(ANATOMY_GUIDES[i].id==='voice'){
      const ring=guides.querySelector('.voice-location');ring.style.display=visible?'':'none';ring.setAttribute('cx',x);ring.setAttribute('cy',y);
    }
  });
}
function updateVocalDiagram(pose){
  const voiced=lessonFor(pose.phoneme)?.voiced||false;
  const card=$('#vocal-card');
  card.classList.toggle('is-vibrating',state.playing&&voiced&&!coach?.reducedMotion);
  card.style.setProperty('--fold-gap',voiced?'1px':'7px');
  $('#vocal-state').textContent=voiced?'这个音：声带振动':'这个音：不主动振动声带';
  card.dataset.voiced=String(voiced);
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
  frame=requestAnimationFrame(tick);
  if(alphaPending)syncAlpha();
  if(cameraTween){
    const t=coach?.reducedMotion?1:Math.min(1,(now-cameraTween.start)/600),ease=t*t*(3-2*t);
    camera.position.lerpVectors(cameraTween.from,cameraTween.position,ease);controls.target.lerpVectors(cameraTween.targetFrom,cameraTween.target,ease);
    invalidate();if(t===1)cameraTween=null;
  }
  const cameraChanged=controls.update();
  if(!state.playing&&!renderDirty&&!cameraChanged)return;
  renderDirty=false;
  const duration=player.duration||currentDuration();
  if(state.playing)state.progress=player.progress;
  const pose=currentPose();animatePose(pose);animateAir(pose);showLesson(pose.phoneme);
  coach?.update(pose,state.playing);
  if(isCurriculum())curriculum?.setWord(state.playing?pose.wordIndex:-1);
  $('#voice-cue').classList.toggle('vibrating',state.playing&&pose.voiced);
  $('#timeline').value=Math.round(state.progress*1000);$('#time-label').textContent=(state.progress*duration).toFixed(1)+' / '+duration.toFixed(1)+' 秒';
  $('#phase-label').textContent=currentSound().steps[pose.step];document.querySelectorAll('[data-step]').forEach(b=>b.classList.toggle('active',Number(b.dataset.step)===pose.step));
  $('#air-status').textContent=!state.air?'气流已隐藏':pose.air>.02?pose.voiced?'口腔送气 · 喉部发声':'口腔送气':pose.phonemeProgress>.1&&pose.phonemeProgress<.65&&['plosive','affricate','cluster'].includes(PHONEMES[pose.phoneme]?.category)?'闭塞阶段 · 气流受阻':'准备呼气';
  if(state.air&&pose.air>.02&&pose.nasal>.5)$('#air-status').textContent='鼻腔送气 · 喉部发声';
  else if(state.air&&pose.air>.02&&pose.weights.TongueLateral>.5)$('#air-status').textContent='舌尖接触 · 气息从舌两侧通过';
  if(pose.phoneme)$('#phase-label').textContent=`${pose.letter?pose.letter+' · ':''}/${PHONEMES[pose.phoneme].ipa}/ · ${currentSound().steps[pose.step]}`;
  updateGuides();updateAttention();updateVocalDiagram(pose);renderer.render(scene,camera);renderCount++;
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
const loader=new GLTFLoader();
let detailsLoaded=false,detailsLoading=null;
function addModelMeshes(root){
    const added=[];model.add(root);model.updateMatrixWorld(true);
    root.traverse(m=>{if(!m.isMesh)return;
      const metadata=m.userData.anatomyName?m.userData:m.parent?.userData||{};m.userData={...m.userData,...metadata};
      if(!m.userData.variant&&['skin','eye'].includes(m.userData.layer))m.userData.variant='human';
      if(!m.userData.side||!m.userData.layer)throw new Error('Missing anatomy metadata: '+m.name);
      const {color,material}=createTeachingMaterial(m.userData,state.palette,childMode);m.material=material;
      m.userData.baseColor=new THREE.Color(color);m.geometry.computeBoundingBox();m.userData.center=m.geometry.boundingBox.getCenter(new THREE.Vector3());m.frustumCulled=false;meshes.push(m);added.push(m);
      m.userData.morphBindings=Object.entries(m.morphTargetDictionary||{});
      m.userData.motionKeys=[...new Set(Object.values(FOCUS).filter(f=>f.match(m.userData.anatomyName)).flatMap(f=>f.keys))];
    });
    medianNormalGroups=smoothMedianNormals(meshes);
    for(const source of added){
      if(source.userData.solidVolume||source.userData.lumen||source.userData.anatomyName==='Trachea'||['detail','whisker','brow','mouth'].includes(source.userData.feature))continue;
      const whiteSection=['skin','eye'].includes(source.userData.layer);
      const result=buildSectionGeometry(source.geometry,source.userData.side,{fillShell:whiteSection,solidEnvelope:source.userData.variant==='human'&&source.userData.layer==='skin'});
      if(!result.geometry)continue;
      const cap=new THREE.Mesh(result.geometry,source.material);cap.name=source.name+' section';
      cap.userData={...source.userData,isSectionCap:true,whiteSection,unclosed:result.unclosed};
      cap.renderOrder=source.userData.layer==='organ'?6:source.userData.layer==='bone'?4:source.userData.layer==='muscle'?3:/Muzzle|Face mask/.test(source.userData.anatomyName)?2:1;
      if(source.morphTargetInfluences){cap.morphTargetInfluences=source.morphTargetInfluences;cap.morphTargetDictionary=source.morphTargetDictionary;}
      cap.sourceMesh=source;source.add(cap);model.attach(cap);sectionCaps.push(cap);
      if(whiteSection&&source.userData.variant==='human'&&source.userData.layer==='skin'){
        // Complementary shader masks provide the pedagogical cavity colours at
        // the same cut plane, without a second full silhouette or a 4 mm slab.
        const backing=cap.clone();backing.name=cap.name+' cavity colour fill';backing.userData.contourFill=true;backing.sourceMesh=source;
        if(source.morphTargetInfluences){backing.morphTargetInfluences=source.morphTargetInfluences;backing.morphTargetDictionary=source.morphTargetDictionary;}
        model.add(backing);sectionCaps.push(backing);
      }
    }
    syncTeachingGeometry();syncAlpha();
}
async function loadAnatomyDetails(){
  if(detailsLoaded)return;
  if(!detailsLoading)detailsLoading=loader.loadAsync('./assets/anatomy-details.glb').then(async gltf=>{
    addModelMeshes(gltf.scene);model.updateMatrixWorld(true);await warmMaterials();
    detailsLoaded=true;invalidate();
  }).catch(error=>{detailsLoading=null;throw error;});
  return detailsLoading;
}
buildUI();
curriculum=mountCurriculum({
  onSelect:id=>selectSound('lesson:'+id),
  onPlay:id=>{
    if(state.sound!=='lesson:'+id)selectSound('lesson:'+id);
    pausePlayback();slowMotion=false;$('#motion-only').checked=false;
    player.setMuted(false);$('#sound-toggle').checked=true;
    startPlayback();
  },
  onStop:pausePlayback
});
const requestedLesson=new URLSearchParams(location.search).get('lesson');
if(LESSONS[requestedLesson]){
  $('#library-mode').value='curriculum';$('#library-mode').dispatchEvent(new Event('change'));
  selectSound('lesson:'+requestedLesson);
}
const mouthButton=document.createElement('button');mouthButton.dataset.view='mouth';mouthButton.textContent='口腔特写';$('.view-buttons').append(mouthButton);
const lipsButton=document.createElement('button');lipsButton.dataset.view='lips';lipsButton.textContent='唇部特写';$('.view-buttons').append(lipsButton);
const voiceButton=document.createElement('button');voiceButton.dataset.view='voice';voiceButton.textContent='声带特写';$('.view-buttons').append(voiceButton);
$('#anatomy-key').innerHTML=ANATOMY_GUIDES.map(g=>`<button type="button" data-organ="${g.id}" aria-pressed="false" style="--organ-color:${g.color}"><i></i>${g.label}<small>${g.nickname}</small></button>`).join('');
document.querySelectorAll('[data-organ]').forEach(b=>b.onclick=()=>explainOrgan(b.dataset.organ));
function previewPart(compare=false){
  const guide=ANATOMY_GUIDES.find(g=>g.id===selectedGuide);if(!guide)return;
  const sound=compare?guide.contrast:guide.sound;if(!sound)return;
  selectLesson(sound);state.progress=.5;previewing=true;
  explainOrgan(guide.id);state.air=true;$('#air-toggle').checked=true;invalidate();
}
$('#part-demo').onclick=()=>previewPart();
$('#part-compare').onclick=()=>previewPart(true);
$('#zoom-voice').onclick=()=>explainOrgan('voice');
try{
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.localClippingEnabled=true;renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;mount.appendChild(renderer.domElement);
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.22;controls.maxDistance=1.2;controls.enablePan=true;
  controls.addEventListener('change',invalidate);
  controls.addEventListener('start',()=>{cameraTween=null;});
  const resize=()=>{const w=mount.clientWidth,h=mount.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);invalidate();};new ResizeObserver(resize).observe(mount);resize();setView('oblique');
  mount.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();cameraTween=null;const offset=camera.position.clone().sub(controls.target);const s=new THREE.Spherical().setFromVector3(offset);s.theta+=(e.key==='ArrowLeft'?.1:e.key==='ArrowRight'?-.1:0);s.phi+=e.key==='ArrowUp'?-.1:e.key==='ArrowDown'?.1:0;s.makeSafe();camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));controls.update();});
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);fail(new Error('WebGL context lost'));});
  $('#anatomy-details').disabled=true;
  Promise.all([loader.loadAsync('./assets/classroom.glb'),loader.loadAsync('./assets/classroom-skin.glb')]).then(async([gltf,skin])=>{
    model=new THREE.Group();scene.add(model);gltf.scene.add(skin.scene);addModelMeshes(gltf.scene);
    syncTeachingGeometry();preset('cutaway');setView('right');model.updateMatrixWorld(true);
    $('#load-detail').textContent='正在准备透明观察效果…';await warmMaterials();
    $('#anatomy-details').disabled=false;ready=true;coach?.ready();curriculum?.setReady(true);$('#load-state').hidden=true;$('#play').disabled=false;$('#restart').disabled=false;tick(performance.now());
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
$('#sound-toggle').onchange=e=>{player.setMuted(!e.target.checked);if(!e.target.checked)coach?.interrupt('声音已关闭。准备好后，点“听示范音”再听一次。');};
$('#loop').onchange=e=>state.loop=e.target.checked;$('#air-toggle').onchange=e=>state.air=e.target.checked;
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{if(controls){if(b.dataset.view==='voice')explainOrgan('voice');else setView(b.dataset.view,true);}});$('#reset-view').onclick=()=>controls&&setView(embedded?'right':'oblique',true);
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>preset(b.dataset.preset));$('#reset-opacity').onclick=()=>preset('cutaway');
$('#swap-sides').onclick=()=>{[state.alpha.left,state.alpha.right]=[state.alpha.right,state.alpha.left];syncAlpha();clearPreset();};
$('#clear-focus').onclick=()=>focusOn(null);
$('#anatomy-details').onchange=async e=>{
  const input=e.target;
  if(input.checked&&!detailsLoaded){
    input.disabled=true;$('#display-mode').textContent='正在加载解剖细节…';
    try{await loadAnatomyDetails();}
    catch{input.checked=false;$('#display-mode').textContent='解剖细节加载失败，可重新勾选重试';return;}
    finally{input.disabled=false;}
  }
  childMode=!input.checked;refreshMaterials();
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
    slowMotion=mode==='watch';$('#motion-only').checked=slowMotion;previewing=false;state.progress=0;player.seek(0);
    $('#speed').value=mode==='watch'?'0.65':String(isCurriculum()?DEMONSTRATION_RATE:1);$('#speed').dispatchEvent(new Event('input'));
    $('#sound-toggle').checked=true;player.setMuted(false);
    if(!slowMotion){preset('surface');setView('lips',true);}
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
if(!embedded)voicePractice=mountVoicePractice($('#voice-practice'),{
  getLesson:()=>isCurriculum()?{...LESSONS[state.sound.slice(7)],exampleURL:player.source}:{id:state.sound.replace(':','-'),text:currentSound().title,hint:currentSound().tip,exampleURL:player.source},
  onBeforeAudio:pausePlayback
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pausePlayback();});
// The local lesson player reuses this scene and audio without exposing the teacher controls.
window.teachingPlayer={
  select(id){if(!LESSONS[id])return;selectSound('lesson:'+id);},
  play(slow=false,rate=slow?.65:DEMONSTRATION_RATE){
    pausePlayback();slowMotion=slow;$('#motion-only').checked=slow;
    state.loop=false;$('#loop').checked=false;state.progress=0;previewing=false;
    this.setRate(rate);
    player.setMuted(false);$('#sound-toggle').checked=true;
    return startPlayback();
  },
  setRate(rate){$('#speed').value=String(rate);$('#speed').dispatchEvent(new Event('input'));},
  pause:pausePlayback,
  seek(progress){pausePlayback();previewing=false;state.progress=Math.max(0,Math.min(1,progress));player.seek(state.progress);},
  get ready(){return ready;},
  get status(){return {playing:state.playing,progress:state.progress,wordIndex:currentPose().wordIndex};}
};
window.dispatchEvent(new Event('teaching-ready'));
let down=null;
mount.addEventListener('pointerdown',e=>down={x:e.clientX,y:e.clientY});
mount.addEventListener('pointerup',e=>{
  const start=down;down=null;
  if(!ready||!start||Math.hypot(start.x-e.clientX,start.y-e.clientY)>5)return;
  const rect=mount.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
  const hit=pickClosest(ray,[...meshes,...sectionCaps]);
  if(hit){
    const n=hit.object.userData.anatomyName,guide=childMode&&ANATOMY_GUIDES.find(g=>g.names?.includes(n));
    if(guide)explainOrgan(guide.id);
    else{const id=Object.keys(FOCUS).find(k=>FOCUS[k].match(n));focusOn(id,n);}
  }
});
mount.addEventListener('pointercancel',()=>{down=null;});
window.renderSnapshot=()=>({renderCount,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,programs:renderer.info.programs.length,materialVersion:meshes.reduce((sum,m)=>sum+m.material.version,0)+sectionCaps.reduce((sum,m)=>sum+m.material.version,0)});
window.opacitySnapshot=()=>({
  childMode,alpha:{...state.alpha},
  meshes:meshes.map(m=>({name:m.userData.anatomyName,side:m.userData.side,layer:m.userData.layer,core:!!m.userData.solidVolume,visible:m.visible,opacity:m.material.opacity,teachingOnly:!!m.userData.teachingOnly,teacherOnly:!!m.userData.teacherOnly,childTeeth:!!m.childTeachingGeometry&&m.geometry===m.childTeachingGeometry,
    depthPassVisible:!!m.depthShell?.visible&&m.visible,depthFunc:m.material.depthFunc,depthWrite:m.material.depthWrite,renderOrder:m.renderOrder})),
  caps:sectionCaps.map(m=>({name:m.name,side:m.userData.side,layer:m.userData.layer,visible:m.visible,opacity:m.material.opacity,sourceVisible:m.sourceMesh.visible,sourceOpacity:m.sourceMesh.material.opacity,
    offsetX:m.position.x,reveal:m.userData.opacityPolicy?.reveal,oppositeOpacity:m.userData.opacityPolicy?.oppositeOpacity,policyOpacity:m.userData.opacityPolicy?.capOpacity,contourFill:!!m.userData.contourFill,depthWrite:m.material.depthWrite,renderOrder:m.renderOrder,transparent:m.material.transparent,blending:m.material.blending}))
});
// Read-only diagnostic snapshot for local checks; no UI simulation or random scoring.
window.teachingSnapshot=()=>({childMode,detailsLoaded,lesson:lessonKey,visibleSkeleton:meshes.filter(m=>m.visible&&m.userData.layer==='bone'&&teachingRole(m.userData)!=='teeth').length,filledContours:sectionCaps.filter(m=>m.visible&&m.userData.contourFill).length,visibleDetails:meshes.filter(m=>m.visible&&teachingRole(m.userData)==='detail').length,visibleRoles:[...new Set(meshes.filter(m=>m.visible).map(m=>teachingRole(m.userData)))],hiddenDetailCaps:sectionCaps.filter(m=>!m.visible&&teachingRole(m.userData)==='detail').length});
window.learningSnapshot=()=>({...coach.snapshot(),cameraMoving:!!cameraTween});
window.sectionMaterials=()=>sectionCaps.filter(c=>c.visible).map(c=>({name:c.sourceMesh.userData.anatomyName,color:c.material.color.getHexString(),source:c.sourceMesh.material.color.getHexString(),type:c.material.type,sourceType:c.sourceMesh.material.type,emissive:c.material.emissive?.getHexString(),sourceEmissive:c.sourceMesh.material.emissive?.getHexString()}));
window.labSnapshot=()=>({ready,audio:{voice:state.voice,src:player.source,paused:player.audio.paused,currentTime:player.audio.currentTime,duration:player.duration,rate:player.rate,playbackRate:player.audio.playbackRate,muted:player.muted},solidCoreMeshes:meshes.filter(m=>m.userData.solidVolume).length,visibleSolidCoreMeshes:meshes.filter(m=>m.userData.solidVolume&&m.visible).length,medianNormalGroups,sectionCapCount:sectionCaps.length,visibleWhiteSections:sectionCaps.filter(c=>c.visible&&c.userData.whiteSection).length,whiteSectionColors:[...new Set(sectionCaps.filter(c=>c.visible&&c.userData.whiteSection).map(c=>c.material.color.getHexString()))],humanEyeColors:meshes.filter(m=>m.userData.layer==='eye').map(m=>m.material.color.getHexString()),visibleSectionCaps:sectionCaps.filter(c=>c.visible).length,visibleMuscleCaps:sectionCaps.filter(c=>c.visible&&c.userData.layer==='muscle').length,palette:state.palette,visibleSourceMeshes:meshes.filter(m=>m.visible&&!m.userData.variant).length,characterTongue:meshes.filter(m=>m.userData.variant===state.palette&&m.userData.feature==='tongue').map(m=>({visible:m.visible,weights:Object.fromEntries(Object.entries(m.morphTargetDictionary||{}).map(([key,index])=>[key,m.morphTargetInfluences[index]]))})),repairedSkinMeshes:meshes.filter(m=>m.userData.layer==='skin'&&m.userData.variant==='human'&&!m.userData.solidVolume).length,visibleHeadVariants:[...new Set(meshes.filter(m=>m.visible&&m.userData.variant).map(m=>m.userData.variant))],visibleHeadMeshes:meshes.filter(m=>m.userData.variant===state.palette&&m.visible).length,headModels:[...new Set(meshes.map(m=>m.userData.variant).filter(Boolean))],skinMorphMeshes:meshes.filter(m=>m.userData.layer==='skin'&&!m.userData.solidVolume&&m.userData.variant===state.palette&&m.morphTargetInfluences?.some(w=>w>0)).length,playing:state.playing,sound:state.sound,progress:state.progress,alpha:{...state.alpha},meshCount:meshes.length,pose:currentPose(),airVisible:airGroup.visible,airPosition:particles.instanceMatrix.array.slice(12,15),visibleSides:{left:meshes.filter(m=>m.userData.side==='left'&&m.visible).length,right:meshes.filter(m=>m.userData.side==='right'&&m.visible).length},morphMeshes:meshes.filter(m=>m.morphTargetInfluences?.some(w=>w>0)).length});
