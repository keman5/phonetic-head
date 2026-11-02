import {Mesh, MeshBasicMaterial, DoubleSide, Vector3} from 'three';

import {posedSurfaceHeight} from './tongue-airflow.js';

const smooth = (a,b,x) => {const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};

// Keep the dorsal contact surface; narrow the teaching underside so the deep
// atlas root is not mistaken for a tongue extending into the chin.
export function teachingTongueGeometry(source, palateMeshes) {
  const geometry=source.geometry.clone(),base=geometry.attributes.position;
  const dictionary={...source.morphTargetDictionary};
  const probe=new Mesh(source.geometry,new MeshBasicMaterial({side:DoubleSide}));
  probe.matrixAutoUpdate=false;probe.matrixWorld.copy(source.matrixWorld);
  const p=new Vector3(),local=new Vector3();
  const lowered=palateMeshes.map(mesh=>{
    const copy=mesh.clone();copy.matrixWorld.copy(mesh.matrixWorld);
    const index=copy.morphTargetDictionary?.VelumLower;
    if(index!==undefined)copy.morphTargetInfluences[index]=1;
    return copy;
  });
  const inverse=source.matrixWorld.clone().invert();
  const dorsal=new Map(),side=source.userData.side==='left'?1:-1;
  for(let i=0;i<base.count;i++){
    const rest=new Vector3().fromBufferAttribute(base,i).applyMatrix4(source.matrixWorld);
    // The atlas has a gap at the midline; sample across the half to avoid retaining its lower fin.
    if(!dorsal.has(rest.z)){
      const samples=[0,.004,.008,.012,.016,.020].map(x=>posedSurfaceHeight([probe],x*side,rest.z,true)).filter(y=>y!==null);
      dorsal.set(rest.z,samples.length?Math.max(...samples):null);
    }
    const top=dorsal.get(rest.z)??posedSurfaceHeight([probe],rest.x,rest.z,true);
    if(top===null)continue;
    const depth=top-rest.y;
    const limit=.028-.012*smooth(.018,.048,rest.z)-.009*smooth(.068,.092,rest.z);
    if(depth<=.003)continue;
    const lift=depth-.003-(limit-.003)*(1-Math.exp(-(depth-.003)/(limit-.003)));
    p.copy(rest);p.y+=lift;p.applyMatrix4(inverse);base.setXYZ(i,p.x,p.y,p.z);
  }
  probe.geometry=geometry;
  const extra=[];
  for(const [key,front] of [['TipAlveolar',true],['BackSeal',false]]) {
    const index=dictionary[key],original=geometry.morphAttributes.position[index];
    if(index===undefined)continue;
    probe.morphTargetInfluences.fill(0);probe.morphTargetInfluences[index]=1;
    const cache=new Map();
    const sample=(x,z)=>{
      // Sample the actual location: the alveolar ridge slopes too sharply for
      // a rounded grid coordinate to guarantee a non-intersecting contact.
      const sx=x,sz=z,k=`${sx.toFixed(7)},${sz.toFixed(7)}`;
      if(!cache.has(k)){
        const top=posedSurfaceHeight([probe],sx,sz,true);
        const roof=posedSurfaceHeight(palateMeshes,sx,sz);
        const low=front?roof:posedSurfaceHeight(lowered,sx,sz);
        cache.set(k,top!==null&&roof!==null?{top,roof,low}:null);
      }
      return cache.get(k);
    };
    const compensation=base.clone(),velumCompensation=base.clone();
    const jaw=geometry.morphAttributes.position[dictionary.JawOpen];
    for(let i=0;i<base.count;i++){
      p.fromBufferAttribute(base,i);local.fromBufferAttribute(original,i);
      if(geometry.morphTargetsRelative)p.add(local);else p.copy(local);
      p.applyMatrix4(source.matrixWorld);
      const region=front?smooth(.060,.074,p.z):(smooth(.026,.041,p.z)*(1-smooth(.050,.064,p.z)));
      const s=region>.001?sample(p.x,p.z):null;
      const dorsal=s?1-smooth(.003,.018,s.top-p.y):0;
      const amount=region*dorsal;
      if(s){
        // Leave a small teaching seam instead of intersecting the roof; the full
        // closure target is at the upper teeth's alveolar region / back roof.
        p.y+=(s.roof-.0008-s.top)*amount;
        p.applyMatrix4(inverse);
        if(geometry.morphTargetsRelative)p.sub(new Vector3().fromBufferAttribute(base,i));
        original.setXYZ(i,p.x,p.y,p.z);
      }
      compensation.setXYZ(i,-jaw.getX(i)*amount,-jaw.getY(i)*amount,-jaw.getZ(i)*amount);
      velumCompensation.setXYZ(i,0,s&&s.low!==null?Math.min(0,s.low-s.roof)*amount:0,0);
    }
    const name=front?'TipJawCompensation':'BackJawCompensation';
    compensation.name=name;extra.push(compensation);dictionary[name]=geometry.morphAttributes.position.length+extra.length-1;
    if(!front){velumCompensation.name="BackVelumCompensation";extra.push(velumCompensation);dictionary.BackVelumCompensation=geometry.morphAttributes.position.length+extra.length-1;}
  }
  geometry.morphAttributes.position.push(...extra);
  // Geometry is modified only during loading; recompute matching normals for
  // every target so the upper surface does not carry the old pose's lighting.
  geometry.computeVertexNormals();
  const normalBase=geometry.attributes.normal;
  geometry.morphAttributes.normal=geometry.morphAttributes.position.map(morph=>{
    const target=base.clone();
    for(let i=0;i<base.count;i++)target.setXYZ(i,base.getX(i)+morph.getX(i),base.getY(i)+morph.getY(i),base.getZ(i)+morph.getZ(i));
    const g=geometry.clone();g.morphAttributes={};g.setAttribute('position',target);g.computeVertexNormals();
    const normals=g.attributes.normal.clone();
    for(let i=0;i<base.count;i++)normals.setXYZ(i,normals.getX(i)-normalBase.getX(i),normals.getY(i)-normalBase.getY(i),normals.getZ(i)-normalBase.getZ(i));
    g.dispose();return normals;
  });
  geometry.computeBoundingBox();geometry.computeBoundingSphere();probe.material.dispose();
  return {geometry,dictionary};
}

export function teachingTongueWeights(weights) {
  // /l/ reaches the same tip contact as /t,d,n/, while the lateral target
  // separately lowers the sides. Jaw movement must not pull a sealed tip away.
  const fricative=smooth(.35,.9,weights.TongueGroove||0)*smooth(.35,.65,weights.TipAlveolar||0);
  const lateral=smooth(0,1,weights.TongueLateral||0);
  const tip=Math.min(1,(weights.TipAlveolar||0)*(1+lateral*(1/.9-1)+fricative*(1/.68-1)));
  const back=weights.BackSeal||0;
  return {...weights,TipAlveolar:tip,TongueGroove:(weights.TongueGroove||0)*(1-fricative*.6),TongueCenter:(weights.TongueCenter||0)*(1-smooth(.65,1,tip)),
    TipJawCompensation:tip*(weights.JawOpen||0),BackJawCompensation:back*(weights.JawOpen||0),BackVelumCompensation:back*(weights.VelumLower||0)};
}
