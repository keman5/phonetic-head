import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {buildSectionGeometry,createSectionFillMaterial} from './dist/sections.js';

function shader(fillContour=false,childMode=true,character=false){
  const source=new THREE.MeshStandardMaterial();
  const material=createSectionFillMaterial(source,character,childMode,fillContour);
  const result={vertexShader:'#include <project_vertex>',fragmentShader:'#include <clipping_planes_fragment>\n#include <color_fragment>',uniforms:{}};
  material.onBeforeCompile(result);
  material.dispose();source.dispose();
  return result.fragmentShader;
}

// Execute the scalar functions emitted into the production shader, rather than
// maintaining a second JS profile that could pass while GLSL regresses.
const fragment=shader(true);
function scalar(name){
  const body=fragment.match(new RegExp(`float ${name}\\(([^)]*)\\) \\{([^}]+)\\}`));
  assert.ok(body,`${name} must be emitted into the shader`);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const smoothstep=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
  return new Function('clamp','smoothstep','mix','sqrt','abs','min','max',
    `return (${body[1].replaceAll('float ','')})=>{${body[2].replaceAll('float ','let ')}}`
  )(clamp,smoothstep,(a,b,t)=>a+(b-a)*t,Math.sqrt,Math.abs,Math.min,Math.max);
}
const distance=scalar('sectionAirwayDistance');
const union=scalar('sectionSmoothUnion');
const nasal=fragment.match(/vec2 nasal=\(sectionWorld.yz-vec2\(([^,]+),([^)]*)\)\)\/vec2\(([^,]+),([^)]*)\)/).slice(1).map(Number);
const cavity=(y,z)=>union(distance(y,z),(Math.hypot((y-nasal[0])/nasal[2],(z-nasal[1])/nasal[3])-1)*.015)<0;

test('child tissue and colour key use identical complementary rounded cavity masks',()=>{
  const tissue=shader(),colour=shader(true);
  const mask=s=>s.slice(s.indexOf('vec2 oral='),s.indexOf('// The colour key'));
  assert.equal(mask(tissue),mask(colour));
  assert.match(tissue,/if\(mouth\|\|airway\|\|nose\|\|nasalGate\) discard/);
  assert.match(colour,/if\(!\(mouth\|\|airway\|\|nose\|\|nasalGate\)\) discard/);
  assert.match(colour,/bool airway=airwayDistance<0.0;/);
  assert.match(colour,/bool nasalGate=sectionSmoothUnion\(airwayDistance,nasalDistance\)<0.0;/);
  assert.doesNotMatch(colour,/bool nasalGate=sectionWorld/);
  assert.match(shader(false,false,true),/bool airway=abs\(sectionWorld.z-0.016\)/,'character profile is preserved');
});

test('nasopharynx, pharynx and lower airway form one component without a 5mm gap',()=>{
  const step=.0005,ny=361,nz=221,occupied=new Set();
  for(let i=0;i<ny;i++)for(let j=0;j<nz;j++)if(cavity(-.13+i*step,-.01+j*step))occupied.add(i*nz+j);
  const start=occupied.values().next().value,seen=new Set([start]),queue=[start];
  for(let n=0;n<queue.length;n++){
    const id=queue[n],i=Math.floor(id/nz),j=id%nz;
    for(const [a,b] of [[i-1,j],[i+1,j],[i,j-1],[i,j+1]]){
      const next=a*nz+b;
      if(a>=0&&a<ny&&b>=0&&b<nz&&occupied.has(next)&&!seen.has(next)){seen.add(next);queue.push(next);}
    }
  }
  assert.equal(seen.size,occupied.size,'no isolated blue islands');
  for(let y=-.11;y<=.024;y+=step){
    const zs=Array.from({length:nz},(_,j)=>-.01+j*step).filter(z=>cavity(y,z));
    assert.ok(zs.length>=16,`airway pinches or disconnects at y=${y}`);
  }
  for(const y of [-.009,-.0065,-.004])assert.ok(cavity(y,.016),'former nasal/pharyngeal gap');
});

test('rounded termini and smoothly bending lower walls replace rectangular strips',()=>{
  assert.ok(distance(-.12,.007)<0,'reach the distal real trachea');
  assert.ok(distance(-.12,.013)>0,'rounded lower corner, not a rectangle');
  assert.ok(distance(.030,.025)<0);
  assert.ok(distance(.030,.031)>0,'rounded upper corner');
  assert.ok(distance(-.104,.008)<0,'bend toward the tracheal centre');
  assert.ok(distance(-.104,.021)>0,'do not continue the old vertical strip');
  for(const y of [-.114,-.065,-.012,.022]){
    const e=1e-6,z=.04;
    const left=(distance(y,z)-distance(y-e,z))/e;
    const right=(distance(y+e,z)-distance(y,z))/e;
    assert.ok(Math.abs(left-right)<.002,`profile slope discontinuity at ${y}`);
  }
});

async function load(asset){
  const bytes=readFileSync(new URL('./dist/assets/'+asset,import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  gltf.scene.updateMatrixWorld(true);
  const meshes=[];gltf.scene.traverse(m=>{if(m.isMesh)meshes.push(m);});return meshes;
}

test('both real tracheal halves meet the profile below the old cutoff and inside the neck cut face',async()=>{
  const tracheas=(await load('phonetic-head.glb')).filter(m=>m.userData.anatomyName==='Trachea');
  const skins=await load('ear-refined-skin.glb');
  assert.equal(tracheas.length,2);
  for(const trachea of tracheas){
    const skin=skins.find(m=>m.userData.side===trachea.userData.side);
    const {geometry}=buildSectionGeometry(skin.geometry,skin.userData.side,{fillShell:true,solidEnvelope:true});
    const cap=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    cap.applyMatrix4(skin.matrixWorld);cap.updateMatrixWorld(true);
    const p=trachea.geometry.attributes.position,vertices=[];
    for(let i=0;i<p.count;i++)vertices.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(trachea.matrixWorld));
    let neckOverlap=0;
    for(const y of [-.091,-.095,-.099,-.103,-.107,-.111,-.115,-.119]){
      const zs=vertices.filter(v=>Math.abs(v.y-y)<.002).map(v=>v.z);
      assert.ok(zs.length,`real trachea must reach ${y}`);
      const centre=(Math.min(...zs)+Math.max(...zs))/2;
      assert.ok(distance(y,centre)<0,`real ${trachea.name} centre disconnected at ${y}`);
      const hits=new THREE.Raycaster(new THREE.Vector3(.1,y,centre),new THREE.Vector3(-1,0,0)).intersectObject(cap);
      if(hits.length&&y<-.096)neckOverlap++;
    }
    assert.ok(neckOverlap>=2,'lower bridge must exist on actual skin cap, not only outside its footprint');
    geometry.dispose();cap.material.dispose();
  }
});
