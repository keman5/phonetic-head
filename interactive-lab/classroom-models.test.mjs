import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {teachingRole} from './dist/teaching.js';
const assets=new URL('./dist/assets/',import.meta.url);
function document(name){const bytes=readFileSync(new URL(name,assets));return JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));}
test('classroom bundle contains teaching targets; hidden anatomy is kept in the separate detail bundle',()=>{
 const main=document('classroom.glb'),detail=document('anatomy-details.glb');
 const nodes=main.nodes.filter(n=>n.mesh!==undefined);
 assert(nodes.length<60);assert(detail.nodes.filter(n=>n.mesh!==undefined).length>100);
 for(const n of nodes){assert(!n.extras.teacherOnly);assert(!['detail','gum','surface'].includes(teachingRole(n.extras)));}
 const tongues=nodes.filter(n=>n.extras.teachingTongue);assert.equal(tongues.length,2);
 for(const n of tongues){const names=main.meshes[n.mesh].extras.targetNames;assert(names.includes('TipJawCompensation'));assert(names.includes('BackSeal'));}
 const before=['phonetic-head.glb','ear-refined-skin.glb','solid-human-core.glb','smooth-articulators.glb','teaching-palate.glb'].reduce((sum,name)=>sum+statSync(new URL(name,assets)).size,0);
 const after=['classroom.glb','ear-refined-skin.glb'].reduce((sum,name)=>sum+statSync(new URL(name,assets)).size,0);
 assert(after<before*.6,`classroom assets must be smaller: ${after} / ${before}`);
 const report=JSON.parse(readFileSync(new URL('classroom-model-report.json',assets)));
 for(const [name,hash]of Object.entries(report.sha256))assert.equal(createHash('sha256').update(readFileSync(new URL(name,assets))).digest('hex'),hash);
});
