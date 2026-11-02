import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Group} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {teachingRole} from './dist/teaching.js';
import {teachingTongueGeometry} from './dist/teaching-tongue.js';

// GLTFExporter only needs Blob -> ArrayBuffer in this texture-free Node build.
globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend();});}};
const assets=new URL('./dist/assets/',import.meta.url);
const inputs=['phonetic-head.glb','smooth-articulators.glb','teaching-palate.glb'];
const signature=createHash('sha256');
for(const name of inputs)signature.update(await readFile(new URL(name,assets)));
for(const path of ['./build-classroom-models.mjs','./dist/teaching-tongue.js','./dist/teaching.js','./dist/tongue-airflow.js'])signature.update(await readFile(new URL(path,import.meta.url)));
const sourceHash=signature.digest('hex'),reportURL=new URL('classroom-model-report.json',assets);
try{
 const report=JSON.parse(await readFile(reportURL,'utf8'));
 if(report.sourceHash===sourceHash){
  for(const [name,hash]of Object.entries(report.sha256))assert.equal(createHash('sha256').update(await readFile(new URL(name,assets))).digest('hex'),hash);
  console.log('Classroom models are current');process.exit(0);
 }
}catch{}
const loader=new GLTFLoader();
const sources=await Promise.all(inputs.map(async name=>{
 const bytes=await readFile(new URL(name,assets));const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 gltf.scene.updateMatrixWorld(true);const meshes=[];gltf.scene.traverse(m=>{if(m.isMesh){m.morphTargetInfluences?.fill(0);meshes.push(m);}});return meshes;
}));
const [atlas,articulators,roof]=sources;
const classroom=new Group(),details=new Group();
const replaced=new Set(articulators.map(m=>m.userData.anatomyName));
const teachingNames=new Set(roof.map(m=>m.userData.anatomyName));
function add(source,target,metadata={}){
 const copy=source.clone();copy.userData={...source.userData,...metadata};
 source.matrixWorld.decompose(copy.position,copy.quaternion,copy.scale);target.add(copy);return copy;
}
for(const source of [...atlas,...articulators]){
 const meta=source.userData;
 if(meta.layer==='skin'||atlas.includes(source)&&replaced.has(meta.anatomyName))continue;
 const detail=teachingNames.has(meta.anatomyName)||['surface','detail','gum','tongue'].includes(teachingRole(meta));
 if(detail)add(source,details,{teacherOnly:true});else add(source,classroom);
}
for(const source of roof)add(source,classroom,{teachingOnly:true});
for(const source of articulators.filter(m=>m.userData.anatomyName==='Tongue')){
 const {geometry,dictionary}=teachingTongueGeometry(source,roof);
 const copy=add(source,classroom,{teachingOnly:true,teachingTongue:true});
 copy.geometry=geometry;copy.updateMorphTargets();copy.morphTargetDictionary=dictionary;
}
assert.equal(classroom.children.filter(m=>m.userData.teachingTongue).length,2);
assert(details.children.length>100);assert(classroom.children.length<100);
const report={sourceHash,sha256:{},bundles:{}};
for(const [name,group]of [['classroom.glb',classroom],['anatomy-details.glb',details]]){
 const bytes=Buffer.from(await new GLTFExporter().parseAsync(group,{binary:true,onlyVisible:false}));
 assert.equal(bytes.readUInt32LE(0),0x46546c67);
 await writeFile(new URL(name,assets),bytes);
 report.sha256[name]=createHash('sha256').update(bytes).digest('hex');
 report.bundles[name]={bytes:bytes.length,meshes:group.children.length};
}
await writeFile(reportURL,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.bundles));
