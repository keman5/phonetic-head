import * as THREE from 'three';
import {teachingRole} from './teaching.js';
import {createSectionFillMaterial} from './sections.js';

// Materials for three distinct head meshes and shared teaching anatomy.
export const PALETTES={
  tom:{skin:'#7296be',bone:'#fff0ca',muscle:'#9cabd5',organ:'#ed91ad',eye:'#fff8e6',tongue:'#ee8da5',palate:'#bdaceb',trachea:'#85cfc9',active:'#a3d9ed',background:'#edf3fa'},
  mickey:{skin:'#454b61',bone:'#fff3d6',muscle:'#dc6f7f',organ:'#f4bf67',eye:'#fff7e8',tongue:'#e99aae',palate:'#c9b6e7',trachea:'#92cfc8',active:'#ffd578',background:'#f8f4e9'},
  human:{skin:'#ffdcbd',bone:'#fff9ed',muscle:'#bad4eb',organ:'#ffc2b5',eye:'#ffffff',tongue:'#f47791',palate:'#ae95e8',trachea:'#64cabc',active:'#ffd28c',background:'#f2f8fb'},
};
const ramp=new THREE.DataTexture(new Uint8Array([150,180,210,240]),4,1,THREE.RedFormat);
ramp.minFilter=THREE.LinearFilter;ramp.magFilter=THREE.LinearFilter;ramp.needsUpdate=true;
export function createTeachingMaterial(meta,palette,childMode=false){
  if(meta.solidVolume){
    const result=createTeachingMaterial({...meta,solidVolume:false,color:PALETTES[palette][meta.layer]||PALETTES[palette].skin},palette,childMode);
    Object.assign(result.material,{polygonOffset:true,polygonOffsetFactor:4,polygonOffsetUnits:4});
    if(childMode&&palette==='human'){
      const original=result.material;result.material=createSectionFillMaterial(original,false,true);original.dispose();
    }
    return result;
  }
  const p=PALETTES[palette],name=meta.anatomyName;
  const role=teachingRole(meta);
  const childColor=childMode&&palette==='human'?{tongue:p.tongue,teeth:p.bone,palate:p.palate,gum:'#ffb8aa',airway:p.trachea,voice:'#f1b75b'}[role]:null;
  const color=meta.layer==='eye'?'#ffffff':childColor||meta.color|| (name==='Tongue'?p.tongue:/Soft palate|Uvula of palate/.test(name)?p.palate:name==='Trachea'?p.trachea:p[meta.layer]);
  const character=meta.variant&&meta.variant!=='human';
  const material=character?new THREE.MeshStandardMaterial({color,roughness:.85,metalness:0,side:THREE.DoubleSide}):new THREE.MeshToonMaterial({color,gradientMap:ramp,side:THREE.DoubleSide});
  // Gentle unlit fill keeps the teaching colours readable inside the cutaway.
  if(childMode&&!character){material.emissive.set(color);material.emissiveIntensity=.22;material.toneMapped=false;}
  if(childMode&&!character&&!meta.solidVolume&&['skin','eye'].includes(meta.layer)){
    const eye=meta.layer==='eye';
    material.onBeforeCompile=shader=>{
      shader.uniforms.childAccent={value:new THREE.Color(eye?'#375b64':'#df8790')};
      shader.vertexShader='varying vec3 childBase;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nchildBase=(modelMatrix*vec4(position,1.0)).xyz;');
      shader.fragmentShader='varying vec3 childBase; uniform vec3 childAccent;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        ${eye?`float irisDistance=length((childBase.xy-vec2(${meta.side==='left'?'0.030':'-0.030'},0.041))/vec2(0.0055,0.006));
        float accent=(1.0-smoothstep(0.90,1.0,irisDistance))*step(0.075,childBase.z);
        diffuseColor.rgb=mix(diffuseColor.rgb,childAccent,accent);
        float glint=1.0-smoothstep(0.0009,0.0013,length(childBase.xy-vec2(${meta.side==='left'?'0.0285':'-0.0315'},0.043)));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.0),glint*accent);`:
        `float lipDistance=length((childBase.xy-vec2(0.0,-0.0185))/vec2(0.027,0.0045));
        float accent=(1.0-smoothstep(0.85,1.35,lipDistance))*smoothstep(0.079,0.087,childBase.z);
        diffuseColor.rgb=mix(diffuseColor.rgb,childAccent,accent);`}
      `);
    };
    material.customProgramCacheKey=()=> 'child-accent-'+meta.layer+'-'+meta.side;
  }
  return {color,material};
}
