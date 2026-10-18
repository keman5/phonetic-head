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
    // A real lip opening removes the anterior skin intersection for a few rows.
    // Using the remaining posterior shell as the "front" cuts a horizontal
    // notch through the entire neck. Bridge only short, bounded missing spans;
    // the tissue shader still opens the actual mouth, not the back of the head.
    const wide=front.map((id,i)=>vertices[id].point.z-vertices[back[i]].point.z>.03);
    for(let i=0;i<front.length;i++){
      if(wide[i])continue;
      let a=i-1,b=i+1;
      while(a>=0&&!wide[a])a--;
      while(b<front.length&&!wide[b])b++;
      if(a<0||b>=front.length)continue;
      const va=vertices[front[a]],vb=vertices[front[b]],v=vertices[front[i]];
      const span=vb.point.y-va.point.y;
      if(span<=0||span>.012)continue;
      const t=(v.point.y-va.point.y)/span;
      v.point.copy(va.point).lerp(vb.point,t);
      v.weights=[...va.weights.map(([index,w])=>[index,w*(1-t)]),...vb.weights.map(([index,w])=>[index,w*t])];
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

// World-space metres after the atlas recenter transform. The lower centre follows
// Trachea (-.120..-.089 in y, centre z ~.007.. .010), not the vertical pharynx.
// Scalar GLSL keeps the same rounded profile in both complementary materials.
const airwayProfileGLSL=`
float sectionAirwayDistance(float y, float z) {
  float h=clamp(y,-0.114,0.022);
  float lower=smoothstep(-0.114,-0.065,h);
  float upper=smoothstep(-0.012,0.022,h);
  float centre=mix(0.007,0.016,lower)+0.009*upper;
  float radius=mix(0.007,0.006,lower)+0.003*upper;
  float dy=y-h;
  float dz=z-centre;
  return sqrt(dy*dy+dz*dz)-radius;
}
float sectionSmoothUnion(float a, float b) {
  float h=max(0.004-abs(a-b),0.0)/0.004;
  return min(a,b)-h*h*0.001;
}
`;

// Match the owning tissue, while keeping mouth and airway openings in the backing.
export function createSectionFillMaterial(source,character=false,childMode=false,fillContour=false){
 const material=source.clone();
 material.userData.filledContour=fillContour;
 if(fillContour){
  material.userData.sectionBackdrop=true;
  material.transparent=false;
  material.depthWrite=false;
  material.blending=THREE.CustomBlending;
  material.blendEquation=THREE.AddEquation;
  material.blendSrc=THREE.SrcAlphaFactor;
  material.blendDst=THREE.OneMinusSrcAlphaFactor;
  material.blendSrcAlpha=THREE.OneFactor;
  material.blendDstAlpha=THREE.OneMinusSrcAlphaFactor;
 }
 const compile=source.onBeforeCompile;
 material.onBeforeCompile=(shader,renderer)=>{
  if(!fillContour)compile.call(material,shader,renderer);
  shader.vertexShader='varying vec3 sectionWorld;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nsectionWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader='varying vec3 sectionWorld;\n'+airwayProfileGLSL+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
    vec2 oral=(sectionWorld.yz-vec2(${character?'0.001':childMode?'-0.021':'-0.016'},0.057))/vec2(${childMode&&!character?'0.036':'0.023'},0.047);
    bool mouth=dot(oral,oral)<1.0 && sectionWorld.z>0.013;
    float airwayDistance=sectionAirwayDistance(sectionWorld.y,sectionWorld.z);
    bool airway=${character?'abs(sectionWorld.z-0.016)<0.006 && sectionWorld.y>-0.096 && sectionWorld.y<0.006':childMode?'airwayDistance<0.0':'airwayDistance<0.0 && sectionWorld.y<-0.009'};
    vec2 nasal=(sectionWorld.yz-vec2(0.026,0.053))/vec2(0.015,0.036);
    bool nose=dot(nasal,nasal)<1.0;
    float nasalDistance=(length(nasal)-1.0)*0.015;
    bool nasalGate=sectionSmoothUnion(airwayDistance,nasalDistance)<0.0;
    // This is a cavity colour key, not a patent nasal airflow path. The actual
    // animated soft palate/uvula remain separate foreground anatomy; phoneme
    // logic alone selects oral versus nasal airflow.
    // The colour key occupies only the regions discarded by the child tissue
    // cap. Complementary masks avoid both depth fighting and double blending.
    ${fillContour?'if(!(mouth||airway||nose||nasalGate)) discard;':''}
    if(${fillContour||character?'false':childMode?'mouth||airway||nose||nasalGate':'mouth||airway'}) discard;
  `);
  if(fillContour){
    shader.uniforms.nasalFill={value:new THREE.Color('#d5eaf5')};
    shader.uniforms.oralFill={value:new THREE.Color('#ffe9df')};
    shader.fragmentShader='uniform vec3 nasalFill; uniform vec3 oralFill;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 contourColor=diffuseColor.rgb;
      if(mouth)contourColor=oralFill;
      if(nose||nasalGate||airway)contourColor=nasalFill;
      // The palate is a real curved mesh, never a painted stripe on this plane.
      diffuseColor.rgb=contourColor;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance=contourColor*0.22;');
  }
 };
 material.customProgramCacheKey=()=> 'tissue-section-'+character+'-'+childMode+'-'+fillContour+'-'+source.customProgramCacheKey();
 return material;
}
