import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {sectionOpacityPolicy,setOpacity} from './dist/render-utils.js';
import {createTeachingMaterial} from './dist/palette.js';
import {createSectionFillMaterial} from './dist/sections.js';

const steps=[0,7,25,50,90,100];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);

test('shared opacity policy covers every pair, swapped halves and every layer',()=>{
  for(const left of steps)for(const right of steps)for(const attenuation of steps){
    const alpha={left,right,skin:attenuation,bone:attenuation,muscle:attenuation,organ:attenuation};
    for(const layer of ['skin','eye','bone','muscle','organ']){
      const a=sectionOpacityPolicy('left',layer,alpha);
      const b=sectionOpacityPolicy('right',layer,alpha);
      near(a.opacity,(1-left/100)*(1-attenuation/100));
      near(b.opacity,(1-right/100)*(1-attenuation/100));
      near(a.capOpacity,Math.max(0,(right-left)/100)*(1-attenuation/100));
      near(a.opacity*a.reveal,a.capOpacity);
      near(a.oppositeOpacity,b.opacity);
      assert.ok(a.capOpacity<=a.opacity);
      assert.ok(a.capOpacity===0||b.capOpacity===0);
      if(left===right)assert.equal(a.capOpacity,0);
      if(right===100)near(a.capOpacity,a.opacity);
      const swapped=sectionOpacityPolicy('right',layer,{...alpha,left:right,right:left});
      assert.deepEqual(swapped,a);
    }
  }
});

test('a small asymmetry cannot activate a solid midplane, even with opaque source',()=>{
  for(const right of [0,.1,1,1.01,7,25,50,90,99.9,100]){
    const p=sectionOpacityPolicy('left','skin',{left:0,right,skin:0});
    near(p.capOpacity,right/100);
    near(p.reveal,right/100);
    const material=new THREE.MeshBasicMaterial();
    setOpacity(material,p.capOpacity);
    assert.equal(material.transparent,right<100);
    assert.equal(material.depthWrite,right===100);
    material.dispose();
  }
});

test('both teaching modes use identical shell and non-shell opacity semantics',()=>{
  for(const childMode of [false,true])for(const layer of ['skin','eye','bone','organ']){
    const {material}=createTeachingMaterial({layer,anatomyName:layer==='bone'?'Upper teeth':'Tongue',variant:'human'},'human',childMode);
    for(const transparency of steps){
      const p=sectionOpacityPolicy('left',layer,{left:transparency,right:100,skin:0,bone:0,organ:0});
      setOpacity(material,p.opacity);
      near(material.opacity,1-transparency/100);
      assert.equal(material.transparent,transparency>0);
      assert.equal(material.depthWrite,transparency===0||layer==='skin');
    }
    if(layer==='skin'){
      assert.equal(material.side,THREE.FrontSide);
      assert.equal(material.userData.surfaceDepth,true);
    }
    material.dispose();
  }
});

test('regular skin sections retain mouth and airway discards in both modes',()=>{
  for(const childMode of [false,true]){
    const {material:source}=createTeachingMaterial({layer:'skin',anatomyName:'Skin',variant:'human'},'human',childMode);
    const material=createSectionFillMaterial(source,false,childMode);
    const shader={vertexShader:'#include <project_vertex>',fragmentShader:'#include <clipping_planes_fragment>',uniforms:{}};
    material.onBeforeCompile(shader);
    assert.match(shader.fragmentShader,/if\(mouth\|\|airway/);
    assert.equal(material.userData.filledContour,false);
    assert.doesNotMatch(shader.fragmentShader,/contourColor/);
    material.dispose();source.dispose();
  }
});

test('child cavity colour key complements the tissue mask without a duplicate slab',()=>{
  const {material:source}=createTeachingMaterial({layer:'skin',anatomyName:'Skin',variant:'human'},'human',true);
  const material=createSectionFillMaterial(source,false,true,true);
  const shader={vertexShader:'#include <project_vertex>',fragmentShader:'#include <clipping_planes_fragment>\n#include <color_fragment>\n#include <emissivemap_fragment>',uniforms:{}};
  material.onBeforeCompile(shader);
  assert.match(shader.fragmentShader,/if\(!\(mouth\|\|airway\|\|nose\|\|nasalGate\)\) discard/);
  assert.doesNotMatch(shader.fragmentShader,/palateFill|float roof=/,'palate must be 3D tissue, not a painted stripe');
  assert.equal(shader.uniforms.nasalFill.value.getHexString(),'d5eaf5');
  for(const right of steps){
    const policy=sectionOpacityPolicy('left','skin',{left:0,right,skin:0});
    setOpacity(material,policy.capOpacity);
    near(material.opacity,right/100);
    assert.equal(material.transparent,false,'backdrop must precede opaque organs');
    assert.equal(material.depthWrite,false,'backdrop must never hide off-plane teeth');
    assert.equal(material.blending,THREE.CustomBlending);
    assert.equal(material.blendSrc,THREE.SrcAlphaFactor);
    assert.equal(material.blendDst,THREE.OneMinusSrcAlphaFactor);
  }
  material.dispose();source.dispose();
});
