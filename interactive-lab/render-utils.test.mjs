import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {setOpacity,pickClosest,surfaceLabel} from './dist/render-utils.js';

test('opacity scrubbing only invalidates the shader at a mode boundary',()=>{
  const m=new THREE.MeshBasicMaterial();
  const initial=m.version;
  setOpacity(m,.8);assert.equal(m.version,initial+1);
  for(const opacity of [.7,.6,.1,0,.3])setOpacity(m,opacity);
  assert.equal(m.version,initial+1);assert.equal(m.opacity,.3);assert.equal(m.depthWrite,false);
  setOpacity(m,1);assert.equal(m.version,initial+2);assert.equal(m.depthWrite,true);
  setOpacity(m,1);assert.equal(m.version,initial+2);
});

test('bounded picking agrees with exhaustive raycasting, including inside bounds and morphs',()=>{
  const meshes=[-2,0,2].map((x,i)=>{
    const g=new THREE.SphereGeometry(.8,16,12);g.morphTargetsRelative=true;
    const delta=new Float32Array(g.attributes.position.count*3);
    for(let j=0;j<delta.length;j+=3)delta[j]=.4;
    g.morphAttributes.position=[new THREE.BufferAttribute(delta,3)];
    const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    mesh.position.set(x,0,-i);mesh.morphTargetInfluences[0]=.6;mesh.updateMatrixWorld();return mesh;
  });
  for(const z of [0,5])for(let x=-4;x<=4;x+=.2){
    const ray=new THREE.Raycaster(new THREE.Vector3(x,0,z),new THREE.Vector3(0,0,-1));
    const all=ray.intersectObjects(meshes,false)[0],fast=pickClosest(ray,meshes);
    assert.equal(fast?.object,all?.object);if(all)assert.equal(fast.distance,all.distance);
  }
  meshes[1].visible=false;meshes[0].material.opacity=.1;
  assert.equal(pickClosest(new THREE.Raycaster(new THREE.Vector3(0,0,5),new THREE.Vector3(0,0,-1)),meshes),null);
});

test('surface display labels never expose source mesh identifiers',()=>{
  assert.equal(surfaceLabel({layer:'skin',anatomyName:'Skin - stitched atlas regions'}),'头部皮肤');
  assert.equal(surfaceLabel({layer:'eye'}),'眼睛');
  assert.equal(surfaceLabel({anatomyName:'raw internal identifier'}),'发音结构');
});
