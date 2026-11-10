import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {smoothMedianNormals,buildSectionGeometry} from './dist/sections.js';
import {poseAt} from './dist/motion.js';
import {childToothGeometry} from './dist/child-teeth.js';
import {createTeachingMaterial} from './dist/palette.js';

async function load(name) {
  const bytes=readFileSync(new URL('./dist/assets/'+name,import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const meshes=[];gltf.scene.traverse(m=>{if(m.isMesh)meshes.push(m);});
  return meshes;
}

for(const asset of ['repaired-skin.glb','refined-lips.glb','ear-refined-skin.glb','classroom-skin.glb']) {
test(asset+': closed eyelids cover both sockets with skin geometry, not a floating eyeball',async()=>{
  const report=JSON.parse(readFileSync(new URL('./dist/assets/skin-repair-report.json',import.meta.url)));
  assert.equal(report.closed_eyelids,true);
  assert.equal(report.unexpected_boundary_edges_before_split,0);
  assert.equal(report.overlapping_edges_before_split,0);
  const skin=await load(asset);
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

test(asset+': sagittal skin joins have matching positions, normals and motion on both halves',async()=>{
  const meshes=await load(asset);
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
}

test('lip refinement is a finite eight-channel derivative of the untouched repaired skin',async()=>{
  const report=JSON.parse(readFileSync(new URL('./dist/assets/lip-refinement-report.json',import.meta.url)));
  const original=readFileSync(new URL('./dist/assets/repaired-skin.glb',import.meta.url));
  assert.equal(report.source_sha256,createHash('sha256').update(original).digest('hex'));
  assert.equal(report.boundary_loops,2);
  assert.equal(report.unexpected_boundary_edges,0);
  assert(report.rim_vertices>200);
  const meshes=await load('refined-lips.glb');
  assert.equal(meshes.length,2);
  for(const mesh of meshes){
    assert.equal(mesh.userData.lipsRefined,true);
    assert.deepEqual(Object.keys(mesh.morphTargetDictionary),report.morphs);
    assert.equal(report.morphs.length,8);
    for(const attribute of [mesh.geometry.attributes.position,...mesh.geometry.morphAttributes.position,...mesh.geometry.morphAttributes.normal])
      assert(attribute.array.every(Number.isFinite));
    for(const name of ['JawOpen','LipClose','LipRound','LipSpread'])
      assert(mesh.geometry.morphAttributes.position[mesh.morphTargetDictionary[name]].array.some(x=>Math.abs(x)>1e-5),name+' is not animated');
  }
});

for(const asset of ['refined-lips.glb','ear-refined-skin.glb','classroom-skin.glb']) {
test(asset+': exported lip boundaries wind smoothly without angular backtracking',async()=>{
  const vertices=new Map(),edges=new Map();
  for(const mesh of await load(asset)){
    const p=mesh.geometry.attributes.position,index=mesh.geometry.index;
    const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v/1e-7)).join(',');
    const mouth=i=>p.getZ(i)>.074&&Math.abs(p.getX(i))<.03&&Math.abs(p.getY(i)-1.5315)<.005;
    for(let i=0;i<index.count;i+=3)for(const [a,b] of [[0,1],[1,2],[2,0]]){
      const ai=index.getX(i+a),bi=index.getX(i+b);if(!mouth(ai)||!mouth(bi))continue;
      const ak=key(ai),bk=key(bi);if(ak===bk)continue;
      vertices.set(ak,[p.getX(ai),p.getY(ai),p.getZ(ai)]);
      vertices.set(bk,[p.getX(bi),p.getY(bi),p.getZ(bi)]);
      const id=[ak,bk].sort().join('|');const e=edges.get(id);
      if(e)e.count++;else edges.set(id,{a:ak,b:bk,count:1});
    }
  }
  const neighbors=new Map();
  for(const {a,b,count} of edges.values())if(count===1){
    if(!neighbors.has(a))neighbors.set(a,[]);if(!neighbors.has(b))neighbors.set(b,[]);
    neighbors.get(a).push(b);neighbors.get(b).push(a);
  }
  const remaining=new Set(neighbors.keys());let loops=0;
  while(remaining.size){
    const start=remaining.values().next().value;let current=start,previous=null;const angles=[];
    do{
      assert.equal(neighbors.get(current).length,2);
      assert(remaining.delete(current),'unexpected self-intersection in lip rim');
      const [x,y]=vertices.get(current);angles.push(Math.atan2((y-1.5315)/.0018,x/.025));
      const next=neighbors.get(current).find(n=>n!==previous);previous=current;current=next;
    }while(current!==start);
    const delta=angles.map((a,i)=>Math.atan2(Math.sin(angles[(i+1)%angles.length]-a),Math.cos(angles[(i+1)%angles.length]-a)));
    const direction=Math.sign(delta.reduce((a,b)=>a+b,0));
    assert(delta.every(d=>d*direction>=-1e-4),'lip boundary folds back on itself');
    loops++;
  }
  assert.equal(loops,2,'preserve inner and outer mouth openings');
});
}

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

for(const asset of ['repaired-skin.glb','refined-lips.glb','ear-refined-skin.glb','classroom-skin.glb']) {
test(asset+': lip aperture does not turn into a horizontal gap across the cutaway neck',async()=>{
  const skin=(await load(asset)).find(m=>m.userData.side==='left');
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
}

test('shipped skin closes the scalp tunnel and bust base with outward facing surfaces',async()=>{
  const skin=await load('classroom-skin.glb');
  for(const m of skin){m.material=new THREE.MeshBasicMaterial({side:THREE.FrontSide});m.updateMatrixWorld(true);}
  for(const id of ['ah','f','m','u']){
    const weights=poseAt('ipa:'+id,.5).weights;
    for(const m of skin)for(const [key,index]of Object.entries(m.morphTargetDictionary))m.morphTargetInfluences[index]=weights[key]||0;
    for(const x of [-.004,0,.004])for(const z of [-.015,-.011,-.007]){
      const hit=new THREE.Raycaster(new THREE.Vector3(x,.4,z),new THREE.Vector3(0,-1,0)).intersectObjects(skin,false)[0];
      assert(hit&&hit.point.y>.155,`${id}: scalp tunnel at ${x},${z}`);
    }
    for(const x of [-.04,0,.04])for(const z of [-.05,-.025,0]){
      const hit=new THREE.Raycaster(new THREE.Vector3(x,-.4,z),new THREE.Vector3(0,1,0)).intersectObjects(skin,false)[0];
      assert(hit&&Math.abs(hit.point.y+.113)<2e-6,`${id}: open bust at ${x},${z}`);
      assert(hit.face.normal.y<-.99,'base must face outward with a flat normal');
    }
  }
  for(const layer of ['bone','muscle','organ','eye'])for(const child of [true,false]){
    const {material}=createTeachingMaterial({layer,anatomyName:'Trachea'},'human',child);
    assert(material.clippingPlanes[0].distanceToPoint(new THREE.Vector3(0,-.114,0))<0,'anatomy must end inside the base');
    assert(material.clippingPlanes[0].distanceToPoint(new THREE.Vector3(0,-.11,0))>0);
    material.dispose();
  }
});

test('labiodental poses cover the lower teeth without moving the upper lip behind the incisors',async()=>{
  const skin=await load('classroom-skin.glb');
  const teeth=(await load('classroom.glb')).filter(m=>/Lower (medial|lateral) incisor/.test(m.userData.anatomyName));
  assert.equal(teeth.length,4);
  for(const m of teeth){m.geometry=childToothGeometry(m.geometry,false);m.updateMorphTargets();}
  for(const m of [...skin,...teeth])m.updateMatrixWorld(true);
  for(const id of ['f','v']){
    const weights=poseAt('ipa:'+id,.5).weights;
    for(const m of [...skin,...teeth])for(const [key,index]of Object.entries(m.morphTargetDictionary||{}))m.morphTargetInfluences[index]=weights[key]||0;
    let samples=0;
    for(const m of teeth)for(let i=0;i<m.geometry.attributes.position.count;i+=40){
      const point=m.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(m.matrixWorld);
      if(point.z<.075)continue;
      const hit=new THREE.Raycaster(new THREE.Vector3(point.x,point.y,.3),new THREE.Vector3(0,0,-1)).intersectObjects(skin,false)[0];
      assert(hit&&hit.point.z>=point.z-.0001,`${id}: lower tooth protrudes through lip`);samples++;
    }
    assert(samples>20);
  }
});

test('closed lips meet at the aperture while the nose stays in place',async()=>{
  let rimVertices=0;
  for(const mesh of await load('classroom-skin.glb')){
    const p=mesh.geometry.attributes.position,index=mesh.geometry.index,edges=new Map();
    const close=mesh.geometry.morphAttributes.position[mesh.morphTargetDictionary.LipClose];
    for(let i=0;i<index.count;i+=3)for(const [a,b]of [[0,1],[1,2],[2,0]]){
      const ids=[index.getX(i+a),index.getX(i+b)].sort((a,b)=>a-b),key=ids.join(',');
      const edge=edges.get(key);if(edge)edge.count++;else edges.set(key,{ids,count:1});
    }
    for(const {ids,count}of edges.values())if(count===1)for(const i of ids){
      if(Math.abs(p.getX(i))<1e-6||p.getZ(i)<.074||Math.abs(p.getY(i)-1.5315)>.005)continue;
      assert(Math.abs(p.getY(i)+close.getY(i)-1.5315)<.00001,'LipClose leaves the aperture open');rimVertices++;
    }
    for(let i=0;i<p.count;i++)if(p.getZ(i)>.085&&p.getY(i)>1.551&&p.getY(i)<1.57)
      assert(new THREE.Vector3().fromBufferAttribute(close,i).length()<.00003,'closed lips must not pull the nostrils downward');
  }
  assert(rimVertices>200);
});
