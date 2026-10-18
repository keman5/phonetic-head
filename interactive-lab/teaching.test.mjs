import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PHONEMES} from './dist/phonemes.js';
import {lessonFor,teachingRole} from './dist/teaching.js';
import {createTeachingMaterial} from './dist/palette.js';
import {createSectionFillMaterial} from './dist/sections.js';
import {readFileSync} from 'node:fs';

test('all 48 lessons have concrete cues, a valid contrast and matching voicing',()=>{
 for(const p of Object.values(PHONEMES)){
  const l=lessonFor(p.id);
  for(const field of ['mouth','tongue','air','voice','reminder'])assert(l[field]?.length>=4,p.id+' '+field);
  assert(PHONEMES[l.contrast]&&l.contrast!==p.id);
  assert.equal(l.voiced,p.poses[0].Voice>.1);
 }
 for(const id of ['m','n','ng'])assert.match(lessonFor(id).air,/鼻子/);
 assert.match(lessonFor('ah').reminder,/不等于重音/);
 assert.match(lessonFor('ih').reminder,/不是.*读短/);
});
test('child view retains articulators, removing unrelated anatomy without deleting it',()=>{
 for(const name of ['Frontal bone','Vertebra C3','Maxilla.l','Palatine bone.l','Orbicularis oris muscle.l','Mucosa of nasal cavity','Epiglottis'])assert.equal(teachingRole({anatomyName:name}),'detail');
 for(const name of ['Tongue','Soft palate','Trachea','Gingiva','Upper medial incisor.l'])assert.notEqual(teachingRole({anatomyName:name}),'detail');
 assert.equal(teachingRole({layer:'skin',solidVolume:true}),'surface');
 assert.equal(teachingRole({anatomyName:'External part of thyro-arytenoid muscle.l'}),'detail');
 assert.equal(teachingRole({anatomyName:'Thyro-epiglottic part of thyro-arytenoid muscle.r'}),'detail');
 assert.equal(teachingRole({anatomyName:'Transverse arytenoid muscle'}),'voice');
 assert.equal(teachingRole({variant:'tom',anatomyName:'Character muzzle'}),'character');
 const manifest=JSON.parse(readFileSync(new URL('./dist/assets/model-manifest.json',import.meta.url)));
 for(const m of manifest.meshes.filter(m=>m.layer==='bone')){
  const role=teachingRole({anatomyName:m.name,layer:m.layer});
  assert(['teeth','detail'].includes(role),m.name+' must not expose a skeletal fragment');
 }
});
test('filled contour shader paints cavity regions and has a separate shader cache key',()=>{
 const {material}=createTeachingMaterial({layer:'skin',side:'left',anatomyName:'Skin'},'human',true);
 const fill=createSectionFillMaterial(material,false,true,true),open=createSectionFillMaterial(material,false,true,false);
 const shader={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'#include <clipping_planes_fragment>\n#include <color_fragment>\n#include <emissivemap_fragment>'};
 fill.onBeforeCompile(shader);
 assert(shader.uniforms.nasalFill);assert.match(shader.fragmentShader,/if\(false\) discard/);assert.match(shader.fragmentShader,/contourColor=nasalFill/);
 assert.notEqual(fill.customProgramCacheKey(),open.customProgramCacheKey());
});
test('child materials provide stable semantic colours, with plain atlas mode retained',()=>{
 const colours=['Tongue','Hard palate','Soft palate','Trachea'].map(anatomyName=>createTeachingMaterial({anatomyName,layer:'organ'},'human',true).color);
 assert.equal(new Set(colours).size,4);
 const child=createTeachingMaterial({anatomyName:'eye',layer:'eye',side:'left'},'human',true).material;
 const reference=createTeachingMaterial({anatomyName:'eye',layer:'eye',side:'left'},'human',false).material;
 assert.equal(child.toneMapped,false);assert.equal(reference.color.getHexString(),'ffdcbd');
 assert.equal(child.color.getHex(),reference.color.getHex());
});
