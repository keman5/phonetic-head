import * as THREE from 'three';
import {teachingRole} from './teaching.js';
import {createSectionFillMaterial} from './sections.js';

// One neutral head surface; internal articulators retain semantic colours.
export const PALETTES={
  human:{skin:'#ffdcbd',bone:'#fff9ed',muscle:'#bad4eb',organ:'#ffc2b5',eye:'#ffdcbd',tongue:'#f47791',palate:'#ae95e8',trachea:'#64cabc',active:'#ffd28c',background:'#f2f8fb'},
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
  const childColor=childMode&&palette==='human'?{tongue:p.tongue,teeth:p.bone,'hard-palate':'#f1bd91',palate:p.palate,gum:'#ffb8aa',airway:p.trachea,voice:'#f1b75b'}[role]:null;
  const color=['skin','eye'].includes(meta.layer)?p.skin:childColor||meta.color|| (name==='Tongue'?p.tongue:/Soft palate|Uvula of palate/.test(name)?p.palate:name==='Trachea'?p.trachea:p[meta.layer]);
  const character=meta.variant&&meta.variant!=='human';
  const material=character?new THREE.MeshStandardMaterial({color,roughness:.85,metalness:0,side:THREE.DoubleSide}):new THREE.MeshToonMaterial({color,gradientMap:ramp,side:THREE.DoubleSide});
  material.forceSinglePass=true;
  // A translucent skin shell should not blend its own back faces over the face.
  // The cutaway has dedicated double-sided closing surfaces.
  if(meta.layer==='skin'&&!meta.solidVolume){
    material.side=THREE.FrontSide;
    material.userData.surfaceDepth=true;
  }
  // Gentle unlit fill keeps the teaching colours readable inside the cutaway.
  if(childMode&&!character){material.emissive.set(color);material.emissiveIntensity=.22;material.toneMapped=false;}
  return {color,material};
}
