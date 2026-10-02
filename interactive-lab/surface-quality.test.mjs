import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {smoothMedianNormals,buildSectionGeometry} from './dist/sections.js';

async function load(name) {
  const bytes=readFileSync(new URL('./dist/assets/'+name,import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const meshes=[];gltf.scene.traverse(m=>{if(m.isMesh)meshes.push(m);});
  return meshes;
}

test('closed eyelids cover both sockets with skin geometry, not a floating eyeball',async()=>{
  const report=JSON.parse(readFileSync(new URL('./dist/assets/skin-repair-report.json',import.meta.url)));
  assert.equal(report.closed_eyelids,true);
  assert.equal(report.unexpected_boundary_edges_before_split,0);
  assert.equal(report.overlapping_edges_before_split,0);
  const skin=await load('repaired-skin.glb');
  for(const sign of [-1,1]) {
    const mesh=skin.find(m=>(m.userData.side==='left'?1:-1)===sign);
    // Geometry uses source metres, before the scene's -1.55m recenter transform.
    const probe=new THREE.Mesh(mesh.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    probe.updateMatrixWorld();
    for(const x of [.024,.03,.036])for(const y of [1.586,1.591,1.596]) {
      const ray=new THREE.Raycaster(new THREE.Vector3(sign*x,y,.18),new THREE.Vector3(0,0,-1));
      const hit=ray.intersectObject(probe)[0];
      assert(hit&&hit.point.z>.074,'eye socket must hit a continuous forward skin surface');
    }
  }
});

test('sagittal skin joins have matching positions, normals and motion on both halves',async()=>{
  const meshes=await load('repaired-skin.glb');
  smoothMedianNormals(meshes);
  const groups=new Map();
  for(const m of meshes){
    const p=m.geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      if(Math.abs(p.getX(i))>1e-6)continue;
      const id=[p.getY(i),p.getZ(i)].map(n=>Math.round(n/1e-6)).join(',');
      if(!groups.has(id))groups.set(id,[]);
      groups.get(id).push({m,i});
    }
  }
  let paired=0;
  for(const entries of groups.values()){
    const a=entries[0],b=entries.find(e=>e.m.userData.side!==a.m.userData.side);
    if(!b)continue;
    paired++;
    const normal=e=>new THREE.Vector3().fromBufferAttribute(e.m.geometry.attributes.normal,e.i);
    assert(normal(a).dot(normal(b))>.995,'median normal discontinuity');
    for(const name of Object.keys(a.m.morphTargetDictionary)){
      const point=e=>new THREE.Vector3().fromBufferAttribute(e.m.geometry.morphAttributes.position[e.m.morphTargetDictionary[name]],e.i);
      assert(point(a).distanceTo(point(b))<2e-6,name+' opens a median crack');
    }
  }
  assert(paired>500);
});

test('smooth articulators retain all source channels and leave the atlas immutable',async()=>{
  const report=JSON.parse(readFileSync(new URL('./dist/assets/articulator-repair-report.json',import.meta.url)));
  const original=readFileSync(new URL('./dist/assets/phonetic-head.glb',import.meta.url));
  assert.equal(report.source_sha256,createHash('sha256').update(original).digest('hex'));
  const meshes=await load('smooth-articulators.glb'),source=await load('phonetic-head.glb');
  assert.equal(meshes.length,8);
  for(const m of meshes){
    assert(m.userData.surfaceRefined);
    const ref=source.find(s=>s.userData.anatomyName===m.userData.anatomyName&&s.userData.side===m.userData.side);
    assert(ref);
    assert.deepEqual(Object.keys(m.morphTargetDictionary),Object.keys(ref.morphTargetDictionary));
    assert(m.geometry.attributes.position.count>ref.geometry.attributes.position.count*2);
    for(const attribute of [...m.geometry.morphAttributes.position,...m.geometry.morphAttributes.normal]){
      assert.equal(attribute.count,m.geometry.attributes.position.count);
      assert(attribute.array.every(Number.isFinite));
    }
  }
});

test('solid core cut faces never cross the sagittal cap during a morph',async()=>{
  for(const m of await load('solid-human-core.glb')){
    const p=m.geometry.attributes.position;
    let median=0;
    for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i))<1e-6){
      median++;
      for(const delta of m.geometry.morphAttributes.position)
        assert(Math.abs(delta.getX(i))<1e-7,'internal core moves through the cutaway surface');
    }
    assert(median>100);
  }
});

test('lip aperture does not turn into a horizontal gap across the cutaway neck',async()=>{
  const skin=(await load('repaired-skin.glb')).find(m=>m.userData.side==='left');
  const {geometry}=buildSectionGeometry(skin.geometry,'left',{fillShell:true,solidEnvelope:true});
  const cap=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  cap.morphTargetDictionary=skin.morphTargetDictionary;
  cap.updateMatrixWorld();
  for(let step=0;step<=20;step++){
    const jaw=step/20;
    cap.morphTargetInfluences[cap.morphTargetDictionary.JawOpen]=jaw;
    for(let y=1.524;y<=1.539;y+=.0005){
      const ray=new THREE.Raycaster(new THREE.Vector3(-1,y,-.026),new THREE.Vector3(1,0,0));
      assert(ray.intersectObject(cap).length>0,`cutaway neck hole at ${y}, jaw ${jaw}`);
    }
  }
});
