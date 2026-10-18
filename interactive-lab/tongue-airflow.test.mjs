import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BoxGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {PHONEMES} from './dist/phonemes.js';
import {createOralAirPath} from './dist/tongue-airflow.js';
import {teachingTongueGeometry, teachingTongueWeights} from './dist/teaching-tongue.js';

async function load(file) {
  const bytes = readFileSync(new URL('./dist/assets/'+file, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  gltf.scene.updateMatrixWorld(true);
  const meshes = [];
  gltf.scene.traverse(mesh => {if(mesh.isMesh) {mesh.material.side=DoubleSide;meshes.push(mesh);}});
  return meshes;
}
const tongue = (await load('smooth-articulators.glb')).filter(m=>m.userData.anatomyName==='Tongue');
const palate = await load('teaching-palate.glb');
const fitted = tongue.map(source=>{
  const {geometry,dictionary}=teachingTongueGeometry(source,palate);
  const mesh=source.clone();mesh.geometry=geometry;mesh.updateMorphTargets();mesh.morphTargetDictionary=dictionary;
  mesh.matrixWorld.copy(source.matrixWorld);return mesh;
});
function setPose(id) {
  const weights = PHONEMES[id].poses[0];
  for(const m of [...tongue,...palate])for(const [key,index]of Object.entries(m.morphTargetDictionary||{}))m.morphTargetInfluences[index]=weights[key]||0;
  return {weights,phoneme:id};
}
const ray = new Raycaster();
function bounds(x,z,tongues=tongue) {
  ray.set(new Vector3(x,.06,z),new Vector3(0,-1,0));
  const floor = ray.intersectObjects(tongues,false)[0]?.point.y;
  ray.set(new Vector3(x,-.06,z),new Vector3(0,1,0));
  const roof = ray.intersectObjects(palate,false)[0]?.point.y;
  return {floor,roof};
}

test('vowel airflow samples follow the actual posed tongue and palate',()=>{
  for(const id of ['i','ih','u','ae']){
    const path = createOralAirPath(tongue,palate,setPose(id));
    let checked=0;
    for(const sample of path.userData.samples){
      const {floor,roof}=bounds(sample.x,sample.z);
      if(floor===undefined||roof===undefined)continue;
      assert(Math.abs(sample.floor-floor)<1e-6,`${id} tongue sample agrees with independent raycast`);
      assert(Math.abs(sample.roof-roof)<1e-6,`${id} palate sample agrees with independent raycast`);
      assert(sample.y>floor&&sample.y<roof,`${id} particle centre must lie in the air channel`);
      checked++;
    }
    assert(checked>=9);
  }
});

test('fitted tongue keeps l airflow lateral through contact and transitions safely to a vowel',()=>{
  for(const mix of [0,.25,.5,.75,1]){
    const a=PHONEMES.l.poses[0],b=PHONEMES.i.poses[0],raw={};
    for(const key of new Set([...Object.keys(a),...Object.keys(b)]))raw[key]=(a[key]||0)*(1-mix)+(b[key]||0)*mix;
    const weights=teachingTongueWeights(raw);
    for(const mesh of [...fitted,...palate])for(const [key,index]of Object.entries(mesh.morphTargetDictionary||{}))mesh.morphTargetInfluences[index]=weights[key]||0;
    const path=createOralAirPath(fitted,palate,{weights});
    let minimum=Infinity;
    for(let t=0;t<=1;t+=.002){
      const p=path.getPoint(t);if(p.z<.03||p.z>.092)continue;
      const {floor,roof}=bounds(p.x,p.z,fitted);
      if(floor!==undefined){assert(p.y>floor,`mix ${mix} crosses tongue at ${p.toArray()}`);minimum=Math.min(minimum,p.y-floor);}
      if(roof!==undefined){assert(p.y<roof,`mix ${mix} crosses roof at ${p.toArray()}`);minimum=Math.min(minimum,roof-p.y);}
    }
    assert(minimum>.0001,'path must have room for a visible particle');
    assert(path.userData.canFlow);
    assert(path.userData.particleScale*.002<minimum,`mix ${mix}: rendered radius ${path.userData.particleScale*.002} must fit clearance ${minimum}`);
    if(mix===0)assert(path.points.filter(p=>p.z>=.07&&p.z<=.078).every(p=>Math.abs(p.x)>.012),'stay lateral until beyond the closed tip');
  }
});

test('negative channel gaps suppress particle rendering instead of drawing through tissue',()=>{
  const material=new MeshBasicMaterial({side:DoubleSide});
  const lower=new Mesh(new BoxGeometry(.04,.02,.08),material);
  lower.position.set(0,0,.06);lower.updateMatrixWorld(true);
  const upper=new Mesh(new BoxGeometry(.04,.01,.08),material);
  upper.position.set(0,.005,.06);upper.updateMatrixWorld(true);
  const path=createOralAirPath([lower],[upper]);
  assert(path.userData.minimumGap<0);
  assert.equal(path.userData.canFlow,false);
  assert.equal(path.userData.particleScale,0);
});

test('the interpolated high-vowel curve clears the tongue, unlike the old fixed route',()=>{
  const path = createOralAirPath(tongue,palate,setPose('i'));
  for(let t=0;t<=1;t+=.004){
    const p=path.getPoint(t);
    if(p.z<.03||p.z>.077)continue;
    const {floor,roof}=bounds(p.x,p.z);
    if(floor===undefined||roof===undefined)continue;
    assert(p.y>floor,`air crosses tongue at z=${p.z}`);
    assert(p.y<roof,`air crosses palate at z=${p.z}`);
  }
  const old=bounds(0,.071);
  assert(-.011<old.floor,'old fixed route at z=.071 ran through /i/ tongue');
  assert(path.userData.particleScale<1,'narrow vowel channel reduces particle size');
});

test('lateral airflow goes around the tongue and cache responds to morph changes',()=>{
  const pose = setPose('l');
  const path = createOralAirPath(tongue,palate,pose);
  assert(path.userData.lateral);
  assert(path.points.some(p=>Math.abs(p.x)>.012));
  assert.equal(createOralAirPath(tongue,palate,pose),path,'static view reuses path');
  const next=createOralAirPath(tongue,palate,setPose('ae'));
  assert.notEqual(next,path);
  assert(!next.userData.lateral);
  assert(next.points.every(p=>Math.abs(p.x)<1e-8));
});
