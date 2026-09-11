import * as THREE from 'three';

const TOLERANCE=1e-6;
const key=p=>p.map(v=>Math.round(v/1e-8)).join(',');
const edgeKey=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
function inside(point,polygon){
  let result=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)result=!result;
  }
  return result;
}

// Cap only existing open edges on the sagittal cut, never the mouth or airway openings.
// Source edge interpolation is retained so the cap follows the same morphs.
export function buildSectionGeometry(geometry,side,{fillShell=false,solidEnvelope=false}={}){
  const pos=geometry.attributes.position,index=geometry.index;
  const ids=new Map(),vertices=[],edges=new Map();
  // Offset by 0.02 mm into the kept half to avoid coplanar slivers from Blender's bisect.
  const plane=side==='left'?2e-5:-2e-5;
  function sample(a,b,t){
    const point=new THREE.Vector3().fromBufferAttribute(pos,a).lerp(new THREE.Vector3().fromBufferAttribute(pos,b),t);
    const k=key([0,point.y,point.z]);
    if(!ids.has(k)){ids.set(k,vertices.length);vertices.push({a,b,t,point});}
    return ids.get(k);
  }
  const count=index?index.count:pos.count;
  for(let i=0;i<count;i+=3){
    const triangle=[0,1,2].map(j=>index?index.getX(i+j):i+j),crossings=[];
    for(let j=0;j<3;j++){
      const a=triangle[j],b=triangle[(j+1)%3],da=pos.getX(a)-plane,db=pos.getX(b)-plane;
      if((da<0)===(db<0))continue;
      crossings.push(sample(a,b,da/(da-db)));
    }
    if(crossings.length===2&&crossings[0]!==crossings[1]){
      const [a,b]=crossings,k=edgeKey(a,b);if(!edges.has(k))edges.set(k,{a,b,count:1});
    }
  }
  const boundary=[...edges.values()].filter(e=>e.count===1),adj=new Map();
  for(const {a,b} of boundary){if(!adj.has(a))adj.set(a,[]);if(!adj.has(b))adj.set(b,[]);adj.get(a).push(b);adj.get(b).push(a);}
  const visited=new Set(),loops=[];let unclosed=0;
  for(const {a:start,b:next} of boundary){
    if(visited.has(edgeKey(start,next)))continue;
    const loop=[start];let previous=start,current=next;visited.add(edgeKey(start,next));
    while(current!==start&&loop.length<=boundary.length){
      loop.push(current);
      const choices=(adj.get(current)||[]).filter(v=>v!==previous&&!visited.has(edgeKey(current,v)));
      if(!choices.length)break;
      const following=choices[0];visited.add(edgeKey(current,following));previous=current;current=following;
    }
    if(current===start&&loop.length>=3)loops.push(loop);else unclosed++;
  }
  // A thin, open-neck skin shell can connect its inner and outer contours into a
  // single ribbon. Fill the outer sagittal silhouette, not that ribbon's thickness.
  if(solidEnvelope){
    const minY=Math.min(...vertices.map(v=>v.point.y)),maxY=Math.max(...vertices.map(v=>v.point.y));
    const rows=Math.ceil((maxY-minY)/.0007),back=[],front=[];
    for(let row=0;row<=rows;row++){
      const y=minY+1e-8+(maxY-minY-2e-8)*row/rows;let low=null,high=null;
      for(const edge of boundary){
        const a=vertices[edge.a],b=vertices[edge.b];
        if((a.point.y>y)===(b.point.y>y))continue;
        const t=(y-a.point.y)/(b.point.y-a.point.y),z=a.point.z+(b.point.z-a.point.z)*t;
        const hit={a,b,t,z};if(!low||z<low.z)low=hit;if(!high||z>high.z)high=hit;
      }
      if(!low||!high)continue;
      for(const [hit,chain] of [[low,back],[high,front]]){
        const {a,b,t}=hit,point=a.point.clone().lerp(b.point,t);
        const weights=[[a.a,(1-a.t)*(1-t)],[a.b,a.t*(1-t)],[b.a,(1-b.t)*t],[b.b,b.t*t]];
        chain.push(vertices.length);vertices.push({point,weights});
      }
    }
    const envelope=[...back,...front.reverse()];
    if(envelope.length>=3){loops.length=0;loops.push(envelope);}
  }
  const shapes=loops.map(loop=>({loop,points:loop.map(v=>new THREE.Vector2(vertices[v].point.y,vertices[v].point.z))}));
  for(const shape of shapes){
    shape.area=Math.abs(THREE.ShapeUtils.area(shape.points));
    shape.parents=shapes.filter(other=>other!==shape&&Math.abs(THREE.ShapeUtils.area(other.points))>shape.area&&inside(shape.points[0],other.points));
  }
  const out=[];
  for(const shape of shapes.filter(s=>(fillShell?s.parents.length===0:s.parents.length%2===0)&&s.area>1e-12)){
    const holes=fillShell?[]:shapes.filter(s=>s.parents.length===shape.parents.length+1&&s.parents.includes(shape));
    const order=[shape,...holes].flatMap(s=>s.loop);
    const triangles=THREE.ShapeUtils.triangulateShape(shape.points,holes.map(s=>s.points));
    for(const triangle of triangles){
      const tri=triangle.map(i=>vertices[order[i]]);
      const a=tri[0].point.clone(),b=tri[1].point.clone(),c=tri[2].point.clone();
      const nx=b.sub(a).cross(c.sub(a)).x;
      if((side==='left'&&nx>0)||(side==='right'&&nx<0))[tri[1],tri[2]]=[tri[2],tri[1]];
      out.push(...tri);
    }
  }
  if(!out.length)return {geometry:null,loops:loops.length,unclosed,boundaryEdges:boundary.length};
  const read=(attribute,v,j)=>v.weights?v.weights.reduce((sum,[index,weight])=>sum+attribute.array[index*attribute.itemSize+j]*weight,0):attribute.array[v.a*attribute.itemSize+j]*(1-v.t)+attribute.array[v.b*attribute.itemSize+j]*v.t;
  const cap=new THREE.BufferGeometry();
  for(const [name,attribute] of Object.entries(geometry.attributes)){
    if(!['position','normal'].includes(name))continue;
    const array=new Float32Array(out.length*attribute.itemSize);
    for(let i=0;i<out.length;i++)for(let j=0;j<attribute.itemSize;j++)array[i*attribute.itemSize+j]=name==='normal'?(j===0?(side==='left'?-1:1):0):read(attribute,out[i],j);
    cap.setAttribute(name,new THREE.BufferAttribute(array,attribute.itemSize));
  }
  if(!cap.attributes.normal)cap.computeVertexNormals();
  cap.morphTargetsRelative=geometry.morphTargetsRelative;
  if(geometry.morphAttributes.position?.length)cap.morphAttributes.position=geometry.morphAttributes.position.map(attribute=>{
    const values=new Float32Array(out.length*3);for(let i=0;i<out.length;i++)for(let j=0;j<3;j++)values[i*3+j]=read(attribute,out[i],j);
    const result=new THREE.BufferAttribute(values,3);result.name=attribute.name;return result;
  });
  // Flat rest normals on the cap; animated geometry is connected by identical position deltas.
  cap.userData={sectionLoops:loops.length,unclosed,boundaryEdges:boundary.length};
  return {geometry:cap,loops:loops.length,unclosed,boundaryEdges:boundary.length};
}

export function smoothMedianNormals(meshes){
  const groups=new Map();
  for(const mesh of meshes){
    const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;if(!n)continue;
    const family=[mesh.userData.variant||'human',mesh.userData.anatomyName,mesh.userData.color||''].join('|');
    for(let i=0;i<p.count;i++){
      if(Math.abs(p.getX(i))>TOLERANCE)continue;
      const k=family+'|'+key([0,p.getY(i),p.getZ(i)]);
      if(!groups.has(k))groups.set(k,[]);groups.get(k).push({mesh,i,n});
    }
  }
  let joined=0;
  for(const group of groups.values()){
    if(new Set(group.map(v=>v.mesh.userData.side)).size<2)continue;
    const normal=new THREE.Vector3();for(const {n,i} of group)normal.add(new THREE.Vector3().fromBufferAttribute(n,i));normal.normalize();
    for(const {n,i} of group){n.setXYZ(i,normal.x,normal.y,normal.z);n.needsUpdate=true;}
    const names=new Set(group.flatMap(({mesh})=>Object.keys(mesh.morphTargetDictionary||{})));
    for(const name of names){
      const entries=group.map(({mesh,i})=>({i,attribute:mesh.geometry.morphAttributes.normal?.[mesh.morphTargetDictionary?.[name]]})).filter(e=>e.attribute);
      if(entries.length<2)continue;
      const delta=new THREE.Vector3();for(const {attribute,i} of entries)delta.add(new THREE.Vector3().fromBufferAttribute(attribute,i));delta.divideScalar(entries.length);
      for(const {attribute,i} of entries){attribute.setXYZ(i,delta.x,delta.y,delta.z);attribute.needsUpdate=true;}
    }
    joined++;
  }
  return joined;
}

// White solid teaching backing. Mouth and airway remain open in the section view.
export function createWhiteSectionMaterial(character=false){
 const material=new THREE.MeshBasicMaterial({color:'#ffffff',side:THREE.DoubleSide,toneMapped:false});
 material.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec3 sectionWorld;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nsectionWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader='varying vec3 sectionWorld;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
    vec2 oral=(sectionWorld.yz-vec2(${character?'0.001':'-0.016'},0.057))/vec2(0.023,0.047);
    bool mouth=dot(oral,oral)<1.0 && sectionWorld.z>0.013;
    bool airway=abs(sectionWorld.z-0.016)<0.006 && sectionWorld.y>-0.096 && sectionWorld.y<${character?'0.006':'-0.009'};
    if(${character?'false':'mouth||airway'}) discard;
  `);
 };
 material.customProgramCacheKey=()=> 'white-section-'+character;
 return material;
}
