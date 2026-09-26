import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CHANNELS,PHONEMES,LETTERS,phonemePose,makeTimeline,timelinePose} from './dist/phonemes.js';
import {FOCUS,SOUNDS,poseAt} from './dist/motion.js';

test('48 unique teaching symbols, 20 vowels and 28 consonants, with valid metadata and poses',()=>{
 const all=Object.values(PHONEMES);
 assert.equal(all.length,48);assert.equal(new Set(all.map(p=>p.ipa)).size,48);
 assert.equal(all.filter(p=>['vowel','diphthong'].includes(p.category)).length,20);
 assert.equal(all.filter(p=>!['vowel','diphthong'].includes(p.category)).length,28);
 assert.equal(CHANNELS.length,24);assert.equal(new Set(CHANNELS).size,24);
 for(const p of all){
  assert(p.word&&p.copy&&p.focus.length&&p.poses.length,p.id);
  for(const f of p.focus)assert(FOCUS[f],f);
  for(const pose of p.poses)for(const [key,value] of Object.entries(pose)){assert(CHANNELS.includes(key),key);assert(Number.isFinite(value)&&value>=0&&value<=1,key);}
  for(let t=0;t<=1;t+=.02){const sampled=poseAt('ipa:'+p.id,t);for(const v of Object.values(sampled.weights))assert(Number.isFinite(v)&&v>=0&&v<=1);}
 }
});
test('26 British letter names reference only existing phonemes; multi-phoneme names remain continuous',()=>{
 assert.equal(Object.keys(LETTERS).join(''),'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
 assert.deepEqual(LETTERS.A.sequence,['ei']);assert.deepEqual(LETTERS.B.sequence,['b','i']);
 assert.deepEqual(LETTERS.Z.sequence,['z','e','d']);
 for(const l of Object.values(LETTERS)){
  assert(l.sequence.length);l.sequence.forEach(id=>assert(PHONEMES[id],id));
  const tl=makeTimeline(l.sequence);
  for(const c of tl.clips.slice(1)){
   const a=timelinePose(tl,c.start-1e-5),b=timelinePose(tl,c.start+1e-5);
   for(const k of CHANNELS)assert(Math.abs(a.weights[k]-b.weights[k])<.002,`${l.id} ${k}`);
   assert(Math.abs(a.air-b.air)<.002);
  }
  for(const end of [0,1])assert(Object.values(poseAt('letter:'+l.id,end).weights).every(v=>v===0));
 }
 assert.throws(()=>makeTimeline([]));assert.throws(()=>makeTimeline(['missing']));
 assert.equal([...new Set(SOUNDS.alphabet.timeline.clips.map(c=>c.letter))].join(''),'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
 const bi=makeTimeline(['b','i']),boundary=bi.clips[1].start;
 assert(timelinePose(bi,boundary-.02).weights.FrontHigh>0,'The vowel must anticipate the boundary');
 assert(Math.abs(timelinePose(bi,boundary).weights.FrontHigh-.5)<1e-6);
 assert(timelinePose(bi,boundary+.02).weights.FrontHigh<1,'The preceding articulation must fade out');
});
test('voicing pairs share oral geometry and distinguish voice, glottis and pressure',()=>{
 const sourceKeys=new Set(['Voice','GlottisClose','GlottisOpen','VocalTension','BreathPressure']);
 for(const [a,b] of [['p','b'],['t','d'],['k','g'],['f','v'],['theta','dh'],['s','z'],['sh','zh'],['ch','jh']]){
  for(const t of [.25,.9]){
   const x=phonemePose(a,t),y=phonemePose(b,t);
   for(const k of CHANNELS)if(!sourceKeys.has(k))assert.equal(x.weights[k],y.weights[k],a+' '+k);
   assert.equal(x.weights.Voice,0);assert(y.weights.Voice>0);assert(y.weights.GlottisClose>x.weights.GlottisClose);assert(x.weights.BreathPressure>y.weights.BreathPressure);
  }
 }
});
test('nasals lower the velum; diphthongs glide; affricates and teaching clusters release closure',()=>{
 for(const id of ['m','n','ng']){const p=phonemePose(id,.5);assert.equal(p.weights.VelumLower,1);assert.equal(p.weights.VelumRaise,0);assert.equal(p.nasal,1);assert(p.air>0);}
 for(const p of Object.values(PHONEMES).filter(p=>p.category==='diphthong')){
  assert(p.poses.length>=2);assert.notDeepEqual(phonemePose(p.id,0).weights,phonemePose(p.id,1).weights);
 }
 for(const id of ['ch','jh','ts','dz','tr','dr']){
  const p=PHONEMES[id];assert(p.poses.length>=2);assert.equal(phonemePose(id,.25).air,0);assert(phonemePose(id,.95).air>0);
  assert(phonemePose(id,.25).weights.TipAlveolar>phonemePose(id,.95).weights.TipAlveolar);
  const a=phonemePose(id,.65),b=phonemePose(id,.65001);for(const k of CHANNELS)assert(Math.abs(a.weights[k]-b.weights[k])<.001);
 }
 for(const id of ['ts','dz','tr','dr'])assert.equal(PHONEMES[id].components.length,2);
});

test('vowel demonstrations sustain their onset, glide to the endpoint and return to rest',()=>{
 for(const p of Object.values(PHONEMES).filter(p=>['vowel','diphthong'].includes(p.category))){
  const sample=t=>poseAt('ipa:'+p.id,t).weights;
  for(const k of CHANNELS){
   assert(Math.abs(sample(.25)[k]-(p.poses[0][k]||0))<1e-6,p.id+' onset '+k);
   assert(Math.abs(sample(.85)[k]-(p.poses.at(-1)[k]||0))<1e-6,p.id+' endpoint '+k);
   assert.equal(sample(0)[k],0);assert.equal(sample(1)[k],0);
  }
  assert(SOUNDS['ipa:'+p.id].focus.includes('jaw'));
 }
 assert(poseAt('ipa:ah',.5).weights.JawOpen>poseAt('ipa:i',.5).weights.JawOpen);
 assert(poseAt('ipa:u',.5).weights.LipRound>poseAt('ipa:i',.5).weights.LipRound);
});

function readGLB(path){
 const data=readFileSync(path),length=data.readUInt32LE(12),doc=JSON.parse(data.subarray(20,20+length));
 const start=28+length;
 const read=index=>{
  const a=doc.accessors[index];assert.equal(a.componentType,5126);
  const out=new Float32Array(a.count*3);
  if(a.bufferView!==undefined){const v=doc.bufferViews[a.bufferView],base=start+(v.byteOffset||0)+(a.byteOffset||0);for(let i=0;i<a.count;i++)for(let j=0;j<3;j++)out[i*3+j]=data.readFloatLE(base+i*(v.byteStride||12)+j*4);}
  if(a.sparse){const {count,indices,values}=a.sparse,iv=doc.bufferViews[indices.bufferView],vv=doc.bufferViews[values.bufferView];const size={5121:1,5123:2,5125:4}[indices.componentType];for(let i=0;i<count;i++){const at=data.readUIntLE(start+(iv.byteOffset||0)+(indices.byteOffset||0)+i*size,size);for(let j=0;j<3;j++)out[at*3+j]=data.readFloatLE(start+(vv.byteOffset||0)+(values.byteOffset||0)+(i*3+j)*4);}}
  return out;
 };return {doc,read};
}
test('human open vowel exposes an actual lip aperture rather than a sealed moving surface',async()=>{
 const THREE=await import('three');const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const bytes=readFileSync('./dist/assets/repaired-skin.glb');
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 gltf.scene.updateMatrixWorld(true);
 const meshes=[];gltf.scene.traverse(m=>{if(m.isMesh)meshes.push(m);});
 const hit=id=>{
  const weights=poseAt('ipa:'+id,.5).weights;
  for(const m of meshes)for(const [key,index] of Object.entries(m.morphTargetDictionary))m.morphTargetInfluences[index]=weights[key];
  return new THREE.Raycaster(new THREE.Vector3(.003,-.028,.3),new THREE.Vector3(0,0,-1)).intersectObjects(meshes,false)[0]?.point.z??-Infinity;
 };
 assert(hit('i')>.08,'Narrow vowel retains the lower lip');
 assert(hit('ah')<.075,'Open vowel must expose the mouth, not stretch intact skin across it');
 assert(hit('u')>.08,'Rounded vowel returns to a smaller aperture');
});
test('all 24 real geometry targets survive human and each character GLB export; skin/core retain skin channels',()=>{
 const checked={};
 for(const file of ['phonetic-head','character-heads','repaired-skin','solid-human-core']){
  const {doc,read}=readGLB(`./dist/assets/${file}.glb`);
  for(const node of doc.nodes.filter(n=>n.mesh!==undefined)){
   const group=file==='character-heads'?node.extras.variant:file;
   checked[group]??=new Set();const mesh=doc.meshes[node.mesh];
   for(const p of mesh.primitives)for(const [i,t] of (p.targets||[]).entries()){
    const key=mesh.extras.targetNames[i];assert(CHANNELS.includes(key),key);
    const delta=read(t.POSITION);assert(delta.every(Number.isFinite));
    assert(delta.some(v=>Math.abs(v)>1e-7),`${file} ${node.name} ${key} is empty`);checked[group].add(key);
   }
  }
 }
 for(const group of ['phonetic-head','mickey','tom'])assert.deepEqual([...checked[group]].sort(),[...CHANNELS].sort(),group);
 for(const group of ['repaired-skin','solid-human-core'])for(const key of ['JawOpen','JawForward','LipClose','LipSpread','LipRound','LipProtrude','LipBite','BreathPressure'])assert(checked[group].has(key),group+' '+key);
});
