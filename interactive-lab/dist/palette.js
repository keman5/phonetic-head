import * as THREE from 'three';

// Materials for three distinct head meshes and shared teaching anatomy.
export const PALETTES={
  tom:{skin:'#7296be',bone:'#fff0ca',muscle:'#9cabd5',organ:'#ed91ad',eye:'#fff8e6',tongue:'#ee8da5',palate:'#bdaceb',trachea:'#85cfc9',active:'#a3d9ed',background:'#edf3fa'},
  mickey:{skin:'#454b61',bone:'#fff3d6',muscle:'#dc6f7f',organ:'#f4bf67',eye:'#fff7e8',tongue:'#e99aae',palate:'#c9b6e7',trachea:'#92cfc8',active:'#ffd578',background:'#f8f4e9'},
  human:{skin:'#ead5b7',bone:'#fff0ca',muscle:'#9cabd5',organ:'#ed91ad',eye:'#fff8e6',tongue:'#ee8da5',palate:'#bdaceb',trachea:'#85cfc9',active:'#a3d9ed',background:'#edf3fa'},
};
const ramp=new THREE.DataTexture(new Uint8Array([150,180,210,240]),4,1,THREE.RedFormat);
ramp.minFilter=THREE.LinearFilter;ramp.magFilter=THREE.LinearFilter;ramp.needsUpdate=true;
export function createTeachingMaterial(meta,palette){
  if(meta.solidVolume){
    const result=createTeachingMaterial({...meta,solidVolume:false,color:PALETTES[palette][meta.layer]||PALETTES[palette].skin},palette);
    Object.assign(result.material,{polygonOffset:true,polygonOffsetFactor:4,polygonOffsetUnits:4});
    return result;
  }
  const p=PALETTES[palette],name=meta.anatomyName;
  const color=meta.layer==='eye'?'#ffffff':meta.color|| (name==='Tongue'?p.tongue:/Soft palate|Uvula of palate/.test(name)?p.palate:name==='Trachea'?p.trachea:p[meta.layer]);
  const character=meta.variant&&meta.variant!=='human';
  const material=character?new THREE.MeshStandardMaterial({color,roughness:.85,metalness:0,side:THREE.DoubleSide}):new THREE.MeshToonMaterial({color,gradientMap:ramp,side:THREE.DoubleSide});
  return {color,material};
}
