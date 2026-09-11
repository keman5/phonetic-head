import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {poseAt,effectiveOpacity,DEFAULT_ALPHA,SOUNDS} from './dist/motion.js';

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
function values(index){
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
  for(const target of ['JawOpen','TipForward','FrontHigh','BackSeal','VelumRaise','LipClose','LipSpread','Voice'])assert(seen.has(target),target);
});
