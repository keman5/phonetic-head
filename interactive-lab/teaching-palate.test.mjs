import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Box3, Vector3, Mesh, MeshBasicMaterial, DoubleSide, Raycaster} from 'three';
import {childToothGeometry} from './dist/child-teeth.js';
import {buildSectionGeometry} from './dist/sections.js';

const asset = name => new URL('./dist/assets/'+name, import.meta.url);
const report = JSON.parse(readFileSync(asset('teaching-palate-report.json')));
async function load(name) {
  const b = readFileSync(asset(name));
  const gltf = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
  const meshes = []; gltf.scene.traverse(m => {if(m.isMesh) meshes.push(m);});
  return meshes;
}
const palate = await load('teaching-palate.glb');
const point = (m,i,raise=0,lower=0) => {
  const p = new Vector3().fromBufferAttribute(m.geometry.attributes.position,i);
  for (const [key,w] of [['VelumRaise',raise],['VelumLower',lower]]) {
    const index = m.morphTargetDictionary?.[key];
    if (index === undefined) continue;
    const q = new Vector3().fromBufferAttribute(m.geometry.morphAttributes.position[index],i);
    if (!m.geometry.morphTargetsRelative) q.sub(new Vector3().fromBufferAttribute(m.geometry.attributes.position,i));
    p.addScaledVector(q,w);
  }
  return p;
};
const id = p => p.toArray().map(v=>Math.round(v/1e-7)).join(',');

test('palate asset contract and immutable source hashes', () => {
  assert.equal(palate.length,6);
  for (const [file,hash] of Object.entries(report.source_sha256))
    assert.equal(createHash('sha256').update(readFileSync(asset(file))).digest('hex'),hash);
  for (const name of ['Hard palate','Soft palate','Uvula of palate']) for (const side of ['left','right']) {
    const m = palate.find(m=>m.userData.anatomyName===name&&m.userData.side===side);
    assert(m); assert.equal(m.userData.layer,'organ'); assert.equal(m.userData.teachingOnly,true);
    assert(Math.abs(m.position.y+1.55)<1e-6);
    assert.deepEqual(Object.keys(m.morphTargetDictionary||{}),name==='Hard palate'?[]:['VelumRaise','VelumLower']);
    for (const a of [m.geometry.attributes.position,m.geometry.attributes.normal,...m.geometry.morphAttributes.position||[],...m.geometry.morphAttributes.normal||[]])
      assert(a.array.every(Number.isFinite));
  }
});

test('joined roof is one closed connected volume, not floating sheets or forks', () => {
  const edges=new Map(), neighbors=new Map();
  const triangles=new Map();
  for (const m of palate) {
    const g=m.geometry,p=g.attributes.position,idx=g.index;
    for(let j=0;j<idx.count;j+=3){
      const ps=[0,1,2].map(k=>new Vector3().fromBufferAttribute(p,idx.getX(j+k)));
      assert(ps[1].clone().sub(ps[0]).cross(ps[2].clone().sub(ps[0])).length()>1e-12,'nondegenerate surface');
      const ids=ps.map(id);
      const triangleKey=[...ids].sort().join('|');
      if(!triangles.has(triangleKey))triangles.set(triangleKey,[]);
      triangles.get(triangleKey).push({ids,ps});
    }
  }
  let internal=0;
  for(const entries of triangles.values()){
      if(entries.length===2){
        const normal=({ps})=>ps[1].clone().sub(ps[0]).cross(ps[2].clone().sub(ps[0])).normalize();
        assert(normal(entries[0]).dot(normal(entries[1]))<-.999,'internal faces must be reversed');
        assert(entries[0].ps.every(p=>Math.abs(p.z-report.anchors.hard_soft[2])<1e-7||Math.abs(p.z-report.anchors.soft_uvula[2])<1e-7));
        internal+=2;continue;
      }
      assert.equal(entries.length,1);
      const {ids}=entries[0];
      for(const [a,b] of [[0,1],[1,2],[2,0]]) {
        const key=[ids[a],ids[b]].sort().join('|'); edges.set(key,(edges.get(key)||0)+1);
        if(!neighbors.has(ids[a]))neighbors.set(ids[a],new Set());
        neighbors.get(ids[a]).add(ids[b]);
        if(!neighbors.has(ids[b]))neighbors.set(ids[b],new Set());
        neighbors.get(ids[b]).add(ids[a]);
      }
  }
  assert.equal(internal,report.paired_internal_join_triangles);
  assert([...edges.values()].every(n=>n===2),'no open boundary, duplicated internal caps or nonmanifold edge');
  const seen=new Set(),todo=[neighbors.keys().next().value];
  while(todo.length){const a=todo.pop();if(seen.has(a))continue;seen.add(a);todo.push(...[...neighbors.get(a)].filter(b=>!seen.has(b)));}
  assert.equal(seen.size,neighbors.size,'one connected roof');
});

test('all six components generate closed runtime sagittal caps with matching morphs and no baked centre faces', () => {
  for(const m of palate){
    const g=m.geometry,idx=g.index,p=g.attributes.position;
    for(let j=0;j<idx.count;j+=3)
      assert([0,1,2].some(k=>p.getX(idx.getX(j+k))!==0),'no baked sagittal face');
    const result=buildSectionGeometry(g,m.userData.side);
    assert(result.geometry,`${m.name}: missing runtime cap`);
    assert.equal(result.unclosed,0);assert.equal(result.loops,1);
    const cap=result.geometry;
    assert.equal(cap.morphAttributes.position?.length||0,g.morphAttributes.position?.length||0);
    // Runtime deliberately intersects 0.02 mm inside the kept half. Its cap
    // vertices are edge interpolants, not necessarily original x=0 vertices.
    const plane=m.userData.side==='left'?2e-5:-2e-5,source=[];
    for(let j=0;j<idx.count;j+=3)for(const [a,b] of [[0,1],[1,2],[2,0]]){
      const ai=idx.getX(j+a),bi=idx.getX(j+b),da=p.getX(ai)-plane,db=p.getX(bi)-plane;
      if((da<0)===(db<0))continue;
      const t=da/(da-db);source.push({a:ai,b:bi,t,v:point(m,ai).lerp(point(m,bi),t)});
    }
    const cm={geometry:cap,morphTargetDictionary:m.morphTargetDictionary};
    for(let i=0;i<cap.attributes.position.count;i++){
      const v=point(cm,i);assert(Math.abs(v.x-plane)<1e-9);
      const edge=source.find(e=>e.v.distanceTo(v)<1e-7);assert(edge);
      for(const [r,l] of [[0,0],[1,0],[0,1],[.3,.7]])
        assert(point(cm,i,r,l).distanceTo(point(m,edge.a,r,l).lerp(point(m,edge.b,r,l),edge.t))<2e-7,'cap motion must match tissue');
    }
    cap.dispose();
  }
});

test('both side seams stay at x=0 and all shared tissue joins stay coincident through motion', () => {
  const groups=new Map();
  for(const m of palate)for(let i=0;i<m.geometry.attributes.position.count;i++){
    const p=point(m,i),key=id(p);
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push({m,i});
    assert(m.userData.side==='left'?p.x>=0:p.x<=0);
  }
  let sagittal=0,tissue=0;
  for(const entries of groups.values()) {
    const names=new Set(entries.map(e=>e.m.userData.anatomyName));
    const sides=new Set(entries.map(e=>e.m.userData.side));
    if(sides.size>1)sagittal++;
    if(names.size>1)tissue++;
    for(const [raise,lower] of [[0,0],[.5,0],[1,0],[0,.5],[0,1],[.3,.7],[1,1]]) {
      const a=point(entries[0].m,entries[0].i,raise,lower);
      for(const {m,i} of entries){
        const p=point(m,i,raise,lower);
        assert(p.distanceTo(a)<2e-7,'shared seam opens in motion');
        assert(m.userData.side==='left'?p.x>=0:p.x<=0);
        if(sides.size>1)assert.equal(p.x,0,'no sagittal protrusion');
      }
    }
  }
  assert(sagittal>180);assert(tissue>=128);
});

test('hard palate remains fixed; soft anterior insertion fixed, posterior excursion follows source channels', () => {
  for(const m of palate){
    const p=m.geometry.attributes.position;
    for(let i=0;i<p.count;i++) {
      const base=point(m,i),up=point(m,i,1,0),down=point(m,i,0,1);
      assert.equal(base.x,up.x);assert.equal(base.x,down.x);
      if(m.userData.anatomyName==='Hard palate'||Math.abs(base.z-report.anchors.hard_soft[2])<1e-7){
        assert(base.distanceTo(up)<1e-7);assert(base.distanceTo(down)<1e-7);
      }
      if(m.userData.anatomyName==='Uvula of palate') {
        assert(Math.abs(up.y-base.y-.006)<2e-7);assert(Math.abs(down.y-base.y+.006)<2e-7);
      }
    }
  }
});

test('rest and moving junction normals stay smooth and motion never inverts a surface triangle', () => {
  const groups=new Map();
  for(const m of palate)for(let i=0;i<m.geometry.attributes.position.count;i++){
    const key=id(point(m,i));if(!groups.has(key))groups.set(key,[]);groups.get(key).push({m,i});
  }
  for(const [raise,lower] of [[0,0],[.5,0],[1,0],[0,.5],[0,1],[.3,.7]]) {
    const normal=({m,i})=>{
      const n=new Vector3().fromBufferAttribute(m.geometry.attributes.normal,i);
      for(const [key,w] of [['VelumRaise',raise],['VelumLower',lower]]){
        const j=m.morphTargetDictionary?.[key],a=m.geometry.morphAttributes.normal?.[j];
        if(a)n.addScaledVector(new Vector3().fromBufferAttribute(a,i),w);
      }
      assert(n.length()>.5);return n.normalize();
    };
    for(const es of groups.values())if(es.length>1)
      for(const e of es)assert(normal(e).dot(normal(es[0]))>.995,'visible shading seam');
    for(const m of palate){
      const idx=m.geometry.index;
      for(let j=0;j<idx.count;j+=3){
        const face=(r,l)=>{
          const [a,b,c]=[0,1,2].map(k=>point(m,idx.getX(j+k),r,l));
          return b.sub(a).cross(c.sub(a));
        };
        const base=face(0,0),moving=face(raise,lower);
        assert(moving.length()>1e-12,'degenerate moving face');
        assert(base.dot(moving)>0,'motion folds surface backwards');
      }
    }
  }
});

test('roof has a transverse vault and a single continuous thin volume over the mouth', () => {
  const probes=palate.map(m=>{const p=new Mesh(m.geometry,new MeshBasicMaterial({side:DoubleSide}));p.updateMatrixWorld();return p;});
  const floor=(x,z)=>{
    const hits=new Raycaster(new Vector3(x,1.52,z),new Vector3(0,1,0)).intersectObjects(probes);
    const ys=[...new Set(hits.map(h=>Math.round(h.point.y/1e-6)))].map(y=>y*1e-6);
    assert.equal(ys.length,2,`exactly one roof thickness at ${x},${z}`);
    assert(ys[1]-ys[0]>.001&&ys[1]-ys[0]<.003,'thin rounded tissue, not solid mouth fill');
    return ys[0];
  };
  for(const z of [.052,.06,.07,.078]) assert(floor(.001,z)>floor(.012,z)+.001,'vault rises medially');
  for(let z=.02;z<.088;z+=.001)floor(.001,z);
  for(const p of probes)p.material.dispose();
});

test('sagittal hard roof has no anterior valley and uvula ends in a short ellipsoidal bulb', () => {
  const rings=new Map();
  for(const m of palate.filter(m=>m.userData.anatomyName==='Hard palate')){
    const p=m.geometry.attributes.position;
    for(let i=0;i<p.count;i++)if(p.getX(i)===0){
      const z=p.getZ(i);if(!rings.has(z))rings.set(z,[]);rings.get(z).push(p.getY(i));
    }
  }
  const center=[...rings].filter(([z])=>z<=report.anchors.anterior[2]+1e-7)
    .sort((a,b)=>b[0]-a[0]).map(([,ys])=>(Math.min(...ys)+Math.max(...ys))/2);
  assert(center.length>=49);
  for(let i=1;i<center.length;i++)assert(center[i]>=center[i-1]-2e-7,'no bone-sample valley');
  for(let i=2;i<center.length;i++)assert(Math.abs(center[i]-2*center[i-1]+center[i-2])<.00003,'no sagittal kink');
  const root=report.anchors.soft_uvula,tip=report.anchors.uvula_tip;
  assert(root[1]-tip[1]<=.004201,'short comfortable uvula');
  const crossSections=new Map();
  for(const m of palate.filter(m=>m.userData.anatomyName==='Uvula of palate')){
    const p=m.geometry.attributes.position;
    for(let i=0;i<p.count;i++)crossSections.set(p.getZ(i),Math.max(crossSections.get(p.getZ(i))||0,Math.abs(p.getX(i))));
  }
  let roundedSamples=0;
  for(const [z,radius] of crossSections){
    const t=(root[2]-z)/(root[2]-tip[2]);
    if(t>.9&&t<.999){
      assert(Math.abs((radius/.0024)**2+t*t-1)<1e-5,'ellipsoidal end rather than pointed linear taper');
      roundedSamples++;
    }
  }
  assert(roundedSamples>=5);
});

test('palate is dimensionally aligned with source bone and shortened upper tooth arch', async () => {
  const source=await load('phonetic-head.glb');
  const roof=palate.filter(m=>m.userData.anatomyName==='Hard palate').flatMap(m=>
    Array.from({length:m.geometry.attributes.position.count},(_,i)=>point(m,i)));
  for(const tooth of source.filter(m=>/^Upper /.test(m.userData.anatomyName))){
    const g=childToothGeometry(tooth.geometry,true),p=g.attributes.position;
    let distance=Infinity;
    for(let i=0;i<p.count;i++){
      const v=new Vector3().fromBufferAttribute(p,i);
      for(const r of roof)distance=Math.min(distance,r.distanceToSquared(v));
    }
    assert(Math.sqrt(distance)<.0035,`${tooth.userData.anatomyName}: disconnected from arch (${Math.sqrt(distance)*1000}mm)`);
    g.dispose();
  }
  const box=new Box3();for(const m of palate)box.union(new Box3().setFromBufferAttribute(m.geometry.attributes.position));
  assert(box.max.x<.03&&box.min.x>-.03&&box.max.z<.095&&box.min.z>.01);
  assert(box.min.y>1.529&&box.max.y<1.556);
  assert(report.bone_samples.every(s=>Math.abs(s.sampled_z-s.requested_z)<=.0041));
});
