import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {poseAt,effectiveOpacity,DEFAULT_ALPHA,SOUNDS} from './dist/motion.js';
import {CHANNELS} from './dist/phonemes.js';
import './phonemes.test.mjs';

test('plosives block airflow during closure and release it afterward',()=>{
  for(const sound of ['p','k']){
    const held=poseAt(sound,.5),released=poseAt(sound,.73);
    assert.equal(held.air,0);assert(released.air>.4);
    const key=sound==='p'?'LipClose':'BackSeal';assert(held.weights[key]>.9);assert(released.weights[key]<held.weights[key]);
  }
});
test('phonemes have distinct poses and end at rest',()=>{
  assert(poseAt('theta',.5).weights.TipForward>.9);
  assert(poseAt('i',.5).weights.FrontHigh>.9);
  assert.equal(poseAt('theta',.5).weights.Voice,0);
  for(const key of Object.keys(SOUNDS))for(const weight of Object.values(poseAt(key,1).weights))assert.equal(weight,0);
});
test('left and right transparency are independent, with layer controls composed',()=>{
  const a={...DEFAULT_ALPHA,left:25,right:100,muscle:20};
  assert(Math.abs(effectiveOpacity('left','muscle',a)-.6)<1e-9);
  assert.equal(effectiveOpacity('right','muscle',a),0);
  assert.equal(effectiveOpacity('left','skin',a),0);
});
const bin=readFileSync('./dist/assets/phonetic-head.glb');
assert.equal(bin.readUInt32LE(0),0x46546c67);
const jsonLength=bin.readUInt32LE(12),gltf=JSON.parse(bin.subarray(20,20+jsonLength).toString());
const dataStart=20+jsonLength+8;
function values(index,document=gltf,bytes=bin){
  const gltf=document,bin=bytes,dataStart=20+bin.readUInt32LE(12)+8;
  const a=gltf.accessors[index];assert.equal(a.componentType,5126);
  const result=new Array(a.count*3).fill(0);
  if(a.bufferView!==undefined){const v=gltf.bufferViews[a.bufferView],start=dataStart+(v.byteOffset||0)+(a.byteOffset||0);for(let i=0;i<result.length;i++)result[i]=bin.readFloatLE(start+i*4);}
  if(a.sparse){const {count,indices,values}=a.sparse;const iv=gltf.bufferViews[indices.bufferView],vv=gltf.bufferViews[values.bufferView];
    const is=dataStart+(iv.byteOffset||0)+(indices.byteOffset||0),vs=dataStart+(vv.byteOffset||0)+(values.byteOffset||0);
    const size={5121:1,5123:2,5125:4}[indices.componentType];
    for(let i=0;i<count;i++){const at=bin.readUIntLE(is+i*size,size);for(let j=0;j<3;j++)result[at*3+j]=bin.readFloatLE(vs+(i*3+j)*4);}
  }
  return result;
}
test('exported anatomy includes actual morph geometry, with correctly split left and right halves',()=>{
  const seen=new Set();let skin=0;
  for(const node of gltf.nodes.filter(n=>n.mesh!==undefined)){
    assert(['left','right'].includes(node.extras.side));
    const mesh=gltf.meshes[node.mesh];const names=mesh.extras?.targetNames||[];
    for(const p of mesh.primitives){
      const coords=values(p.attributes.POSITION);
      for(let i=0;i<coords.length;i+=3)assert(node.extras.side==='left'?coords[i]>=-1e-6:coords[i]<=1e-6);
      for(let i=0;i<(p.targets||[]).length;i++){
        const delta=values(p.targets[i].POSITION);assert(delta.some(v=>Math.abs(v)>1e-7),node.name+' '+names[i]);seen.add(names[i]);
      }
    }
    if(node.extras.layer==='skin')skin++;
  }
  assert.equal(skin,2);
  assert.deepEqual([...seen].sort(),[...CHANNELS].sort());
});

// A repaired skin asset must never silently replace or alter the source organs.
test('skin repair preserves source anatomy, scale and authored animation channels',()=>{
  const report=JSON.parse(readFileSync('./dist/assets/skin-repair-report.json','utf8'));
  assert.equal(createHash('sha256').update(bin).digest('hex'),report.source_sha256);
  assert(report.max_surface_distance_metres<.004);
  assert(report.p99_surface_distance_metres<.002);
  const repaired=readFileSync('./dist/assets/repaired-skin.glb');
  const length=repaired.readUInt32LE(12),doc=JSON.parse(repaired.subarray(20,20+length));
  const nodes=doc.nodes.filter(n=>n.mesh!==undefined);assert.equal(nodes.length,2);
  assert.deepEqual(nodes.map(n=>n.extras.side).sort(),['left','right']);
  for(const node of nodes){
    assert.equal(node.extras.layer,'skin');
    const mesh=doc.meshes[node.mesh];
    const source=gltf.nodes.find(n=>n.extras?.layer==='skin'&&n.extras.side===node.extras.side);
    assert.deepEqual(mesh.extras.targetNames,gltf.meshes[source.mesh].extras.targetNames);
    const ref=gltf.accessors[gltf.meshes[source.mesh].primitives[0].attributes.POSITION];
    for(const primitive of mesh.primitives){
      const positions=doc.accessors[primitive.attributes.POSITION];
      assert(positions.count>1000);
      for(let axis=0;axis<3;axis++){
        assert(Math.abs(positions.min[axis]-ref.min[axis])<.004);
        assert(Math.abs(positions.max[axis]-ref.max[axis])<.004);
      }
      assert.equal(primitive.targets.length,mesh.extras.targetNames.length);
    }
    for(let axis=0;axis<3;axis++)assert(Math.abs(node.translation[axis]-source.translation[axis])<1e-6);
  }
});

test('Mickey and Tom are separate head meshes with split sides and mouth morphs',()=>{
  const data=readFileSync('./dist/assets/character-heads.glb');
  const doc=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)));
  const nodes=doc.nodes.filter(n=>n.mesh!==undefined);
  assert.deepEqual([...new Set(nodes.map(n=>n.extras.variant))].sort(),['mickey','tom']);
  for(const variant of ['mickey','tom']){
    const parts=nodes.filter(n=>n.extras.variant===variant);assert(parts.length>10);
    assert(parts.some(n=>n.name.includes(variant==='mickey'?'Round ear':'Pointed ear')));
    if(variant==='tom')assert(parts.some(n=>n.name.includes('Whisker')));
    assert.deepEqual([...new Set(parts.map(n=>n.extras.side))].sort(),['left','right']);
    assert(parts.some(n=>doc.meshes[n.mesh].extras?.targetNames?.includes('JawOpen')));
    assert(parts.some(n=>doc.meshes[n.mesh].extras?.targetNames?.includes('LipClose')));
    for(const n of parts){assert(['skin','organ'].includes(n.extras.layer));assert(/^#[0-9a-f]{6}$/i.test(n.extras.color));}
  }
});

test('character silhouettes retain round Mickey and broad feline Tom proportions',()=>{
 const data=readFileSync('./dist/assets/character-heads.glb');
 const doc=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)));
 const bounds=(variant,feature)=>{
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const n of doc.nodes.filter(n=>n.extras?.variant===variant&&n.extras.feature===feature)){
   for(const p of doc.meshes[n.mesh].primitives){const a=doc.accessors[p.attributes.POSITION];for(let i=0;i<3;i++){min[i]=Math.min(min[i],a.min[i]);max[i]=Math.max(max[i],a.max[i]);}}
  }
  return max.map((v,i)=>v-min[i]);
 };
 const mickey=bounds('mickey','head'),tom=bounds('tom','head'),ears=bounds('mickey','ear');
 assert(mickey[0]/mickey[1]>.9&&mickey[0]/mickey[1]<1.15,'Mickey head must be round');
 assert(ears[0]/mickey[0]>1.45&&ears[0]/mickey[0]<1.75,'Round ears must form the broad silhouette');
 assert(tom[0]/tom[1]>1.3,'Tom needs a broad cheek silhouette');
 for(const variant of ['mickey','tom']){
  const tongues=doc.nodes.filter(n=>n.extras?.variant===variant&&n.extras.feature==='tongue');assert.equal(tongues.length,2);
  const face=doc.nodes.find(n=>n.extras?.variant===variant&&n.name.includes('Muzzle'));assert(face);assert(doc.meshes[face.mesh].primitives.some(p=>p.targets?.some(t=>t.NORMAL!==undefined)),'Animated face normals are required');
  for(const whisker of doc.nodes.filter(n=>n.extras?.variant===variant&&n.extras.feature==='whisker'))assert(!doc.meshes[whisker.mesh].extras?.targetNames?.includes('LipClose'));
  for(const n of tongues)for(const key of ['TipForward','FrontHigh','BackSeal','LipClose'])assert(doc.meshes[n.mesh].extras.targetNames.includes(key));
 }
});

test('section caps fill tissue, keep anatomical holes, and carry morph displacements',async()=>{
 const THREE=await import('three');const {buildSectionGeometry}=await import('./dist/sections.js');
 const area=g=>{let sum=0;const p=g.attributes.position;for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2);sum+=b.sub(a).cross(c.sub(a)).length()/2;}return sum;};
 const box=new THREE.BoxGeometry(2,2,2);box.morphTargetsRelative=true;
 const delta=new Float32Array(box.attributes.position.count*3);for(let i=0;i<delta.length;i+=3){delta[i+1]=.2;delta[i+2]=.3;}
 box.morphAttributes.position=[new THREE.BufferAttribute(delta,3)];
 const solid=buildSectionGeometry(box,'left');assert(solid.geometry);assert.equal(solid.unclosed,0);assert(Math.abs(area(solid.geometry)-4)<1e-5);
 for(let i=0;i<solid.geometry.attributes.position.count;i++){assert.equal(solid.geometry.attributes.normal.getX(i),-1);assert(Math.abs(solid.geometry.morphAttributes.position[0].getY(i)-.2)<1e-6);}
 const ring=new THREE.TorusGeometry(1,.5,32,128);ring.rotateY(Math.PI/2);
 const hollow=buildSectionGeometry(ring,'right');assert.equal(hollow.unclosed,0);assert.equal(hollow.loops,2);assert.equal(hollow.geometry.morphAttributes.position,undefined);assert(Math.abs(area(hollow.geometry)-2*Math.PI)<.05,'The ring centre must remain empty');
 const filled=buildSectionGeometry(ring,'right',{fillShell:true});assert(Math.abs(area(filled.geometry)-Math.PI*2.25)<.06,'Shell mode must fill the hollow centre');
});

test('left/right surface normals meet smoothly without moving geometry',async()=>{
 const THREE=await import('three');const {smoothMedianNormals}=await import('./dist/sections.js');
 const meshes=['left','right'].map((side,i)=>{
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,1,0,i===0?1:-1,0,0,0,0,1],3));g.setAttribute('normal',new THREE.Float32BufferAttribute(Array(3).fill(i===0?[0,1,0]:[0,0,1]).flat(),3));
  const m=new THREE.Mesh(g);m.userData={side,anatomyName:'same surface'};return m;
 });
 const originals=meshes.map(m=>Array.from(m.geometry.attributes.position.array));
 assert.equal(smoothMedianNormals(meshes),2);
 assert.deepEqual(Array.from(meshes[0].geometry.attributes.normal.array.slice(0,3)),Array.from(meshes[1].geometry.attributes.normal.array.slice(0,3)));
 meshes.forEach((m,i)=>assert.deepEqual(Array.from(m.geometry.attributes.position.array),originals[i]));
 assert.equal(meshes[0].geometry.attributes.normal.getY(1),1);
});

test('section fill inherits tissue material and core follows skin palette instead of white metadata',async()=>{
 const {createTeachingMaterial,PALETTES}=await import('./dist/palette.js');
 const {createSectionFillMaterial}=await import('./dist/sections.js');
 for(const palette of Object.keys(PALETTES)){
  for(const layer of ['skin','eye','muscle','organ','bone']){
   const {material}=createTeachingMaterial({layer,variant:palette,anatomyName:layer==='organ'?'Tongue':'tissue'},palette);
   const cap=createSectionFillMaterial(material,palette!=='human');
   assert.notEqual(cap,material);assert.equal(cap.type,material.type);assert.equal(cap.color.getHex(),material.color.getHex());assert.equal(cap.toneMapped,material.toneMapped);
  }
  const core=createTeachingMaterial({layer:'skin',solidVolume:true,color:'#ffffff'},palette);
  assert.equal(core.color,PALETTES[palette].skin);
 }
});

test('human eyes use plain white material without a pupil shader',async()=>{
 const {createTeachingMaterial}=await import('./dist/palette.js');
 for(const side of ['left','right']){const {color,material}=createTeachingMaterial({layer:'eye',variant:'human',side,anatomyName:'Fitted eyeball'},'human');assert.equal(color,'#ffffff');assert.equal(material.color.getHexString(),'ffffff');assert(!material.onBeforeCompile.toString().includes('irisDistance'));}
});

test('human tissue backing spans the hollow head and neck instead of only the skin ribbon',async()=>{
 const THREE=await import('three');const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');const {buildSectionGeometry}=await import('./dist/sections.js');
 const bytes=readFileSync('./dist/assets/repaired-skin.glb');const loaded=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const skin=loaded.scene.children.find(m=>m.isMesh&&m.userData.side==='left');assert(skin);
 const result=buildSectionGeometry(skin.geometry,'left',{fillShell:true,solidEnvelope:true});assert(result.geometry);
 const mesh=new THREE.Mesh(result.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld();
 for(const [y,z] of [[1.64,-.025],[1.48,-.015]])assert(new THREE.Raycaster(new THREE.Vector3(-1,y,z),new THREE.Vector3(1,0,0)).intersectObject(mesh).length>0,'Head and neck centres must be filled');
});

test('solid head/neck halves are closed volumes and block viewing into the open neck base',async()=>{
 const THREE=await import('three');const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const report=JSON.parse(readFileSync('./dist/assets/solid-core-report.json'));
 assert.equal(report.source_sha256,createHash('sha256').update(readFileSync('./dist/assets/repaired-skin.glb')).digest('hex'));
 assert(report.closed_base_z<1.44);assert(report.oral_recess_bottom_z>report.closed_base_z+.06);
 for(const half of report.halves){assert.equal(half.boundary_edges,0);assert.equal(half.nonmanifold_edges,0);assert(half.volume_m3>.001);}
 const bytes=readFileSync('./dist/assets/solid-human-core.glb');const loaded=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const halves=loaded.scene.children.filter(m=>m.isMesh);assert.equal(halves.length,2);
 for(const source of halves){
  assert(source.userData.solidVolume);assert(source.morphTargetDictionary.JawOpen!==undefined);
  const mesh=new THREE.Mesh(source.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld();
  const sign=source.userData.side==='left'?1:-1;
  for(const x of [.01,.025])for(const z of [-.01,0,.01]){
   const hits=new THREE.Raycaster(new THREE.Vector3(sign*x,1.2,z),new THREE.Vector3(0,1,0)).intersectObject(mesh);
   assert(hits.length>=2,'A ray must enter through the bottom and exit through the volume');assert(hits[0].point.y<1.45,'The first hit must be the closed base, not the skull interior');
  }
 }
});
