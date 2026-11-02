import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DoubleSide,Vector3,Raycaster} from 'three';
import {teachingTongueGeometry,teachingTongueWeights} from './dist/teaching-tongue.js';
import {posedSurfaceHeight} from './dist/tongue-airflow.js';
import {poseAt} from './dist/motion.js';
import {buildSectionGeometry} from './dist/sections.js';

async function load(name){
  const bytes=readFileSync(new URL('./dist/assets/'+name,import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  gltf.scene.updateMatrixWorld(true);const meshes=[];
  gltf.scene.traverse(m=>{if(m.isMesh){m.material.side=DoubleSide;m.morphTargetInfluences?.fill(0);meshes.push(m);}});return meshes;
}
const atlas=(await load('smooth-articulators.glb')).filter(m=>m.userData.anatomyName==='Tongue');
const roof=await load('teaching-palate.glb');
const original=atlas.map(m=>m.geometry.attributes.position.array.slice());
const tongue=atlas.map(m=>{
  const result=teachingTongueGeometry(m,roof),copy=m.clone();copy.geometry=result.geometry;
  copy.updateMorphTargets();copy.morphTargetDictionary=result.dictionary;return copy;
});
function pose(id,t=.5){
  const weights=poseAt('ipa:'+id,t).weights;
  for(const m of [...tongue,...roof]){
    const w=tongue.includes(m)?teachingTongueWeights(weights):weights;
    for(const [key,i]of Object.entries(m.morphTargetDictionary||{}))m.morphTargetInfluences[i]=w[key]||0;
  }
}
function gap(){
  const ray=new Raycaster(),gaps=[];
  // Independent roof raycasts check the sides as well as the sagittal slice.
  for(const x of [-.012,-.006,0,.006,.012])for(let z=.033;z<.082;z+=.001){
    const top=posedSurfaceHeight(tongue,x,z,true);if(top===null)continue;
    ray.set(new Vector3(x,-.06,z),new Vector3(0,1,0));
    const hit=ray.intersectObjects(roof,false)[0];if(hit)gaps.push(hit.point.y-top);
  }
  return Math.min(...gaps);
}

test('teaching tongue narrows the underside, preserving the atlas, dorsal surface and morph caps',()=>{
  for(const [i,m]of tongue.entries()){
    assert.deepEqual(atlas[i].geometry.attributes.position.array,original[i]);
    assert.notDeepEqual(m.geometry.attributes.position.array,original[i]);
    const p=new Vector3();let lifted=0;
    for(let j=0;j<m.geometry.attributes.position.count;j++){
      const before=new Vector3().fromBufferAttribute(atlas[i].geometry.attributes.position,j).applyMatrix4(atlas[i].matrixWorld);
      p.fromBufferAttribute(m.geometry.attributes.position,j).applyMatrix4(m.matrixWorld);
      assert(p.y>=before.y-1e-7,'underside cannot extend farther into the chin');
      assert(Math.abs(p.x-before.x)<1e-7&&Math.abs(p.z-before.z)<1e-7);
      const samples=[0,.004,.008,.012,.016,.020].map(x=>posedSurfaceHeight([atlas[i]],x*(i===0?1:-1),before.z,true)).filter(y=>y!==null);
      const top=samples.length?Math.max(...samples):posedSurfaceHeight([atlas[i]],before.x,before.z,true);
      if(top!==null&&top-before.y<=.003)assert(p.distanceTo(before)<1e-7,'dorsal contact surface must stay fixed');
      if(top!==null&&before.z>.04)assert(top-p.y<.020,'lateral underside must not retain the deep atlas fin');
      if(p.y>before.y+.002)lifted++;
    }
    assert(lifted>100,'the broad atlas underside must actually be reduced');
    assert.equal(m.geometry.morphAttributes.position.length,Object.keys(m.morphTargetDictionary).length);
    const cap=buildSectionGeometry(m.geometry,m.userData.side);
    assert(cap.geometry);assert.equal(cap.unclosed,0);
    assert.equal(cap.geometry.morphAttributes.position.length,m.geometry.morphAttributes.position.length);
    for(const attribute of [m.geometry.attributes.position,...m.geometry.morphAttributes.position,...m.geometry.morphAttributes.normal])assert(attribute.array.every(Number.isFinite));
  }
});

test('teaching body and tip have a thin side profile separate from the deep atlas root',()=>{
 for(const m of tongue)m.morphTargetInfluences.fill(0);
 for(const z of [.04,.05,.06,.07,.075]){
  const top=posedSurfaceHeight(tongue,0,z,true),bottom=posedSurfaceHeight(tongue,0,z);
  assert(top!==null&&bottom!==null);
  assert(top-bottom<.020,`tongue body is too thick at ${z}: ${top-bottom}`);
 }
});

test('tip and back closures meet the teaching roof without penetrating it',()=>{
  for(const id of ['t','d','n','l','k','g','ng']){
    pose(id);const minimum=gap();
    assert(minimum>=-.0001,`${id} intersects the roof: ${minimum}`);
    assert(minimum<.0015,`${id} never reaches contact: ${minimum}`);
  }
  for(const id of ['t','d','k','g']){
    pose(id,.9);assert(gap()>.002,`${id} must reopen after closure`);
  }
});

test('sibilant tongue leaves a narrow channel and weights have no threshold jump',()=>{
  pose('s');const minimum=gap();assert(minimum>.0005&&minimum<.0035);
  const a=teachingTongueWeights({TipAlveolar:.65,TongueGroove:.49999});
  const b=teachingTongueWeights({TipAlveolar:.65,TongueGroove:.50001});
  assert(Math.abs(a.TipAlveolar-b.TipAlveolar)<.0001);
  assert(Object.values(teachingTongueWeights({})).every(v=>v===0));
});
