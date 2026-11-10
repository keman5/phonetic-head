import {t} from './i18n.js';
import * as THREE from 'three';
import {effectiveOpacity} from './motion.js';

// The controls express transparency, not opacity. Sections reveal only the
// difference between the two halves, never an opaque slab at the first 1% step.
// Layer attenuation is already included in each half and must not be doubled.
export function sectionOpacityPolicy(side, layer, alpha) {
  const opacity = effectiveOpacity(side, layer, alpha);
  const oppositeOpacity = effectiveOpacity(side === 'left' ? 'right' : 'left', layer, alpha);
  const capOpacity = Math.max(0, opacity - oppositeOpacity);
  return {opacity, oppositeOpacity, capOpacity, reveal: opacity > 0 ? capOpacity / opacity : 0};
}

// Opacity is a uniform. Only a change of render mode invalidates the program.
export function setOpacity(material, opacity) {
  // Backdrops stay in the early opaque queue, but use explicit alpha blending.
  // The transparent queue runs after opaque teeth regardless of renderOrder.
  const backdrop = !!material.userData.sectionBackdrop;
  const transparent = !backdrop && opacity < 1;
  if (material.transparent !== transparent) {
    material.transparent = transparent;
    material.needsUpdate = true;
  }
  material.opacity = opacity;
  material.depthWrite = !backdrop && (!transparent || !!material.userData.surfaceDepth);
}

// Conservative morph-aware bounds order candidates; stop only when no nearer
// triangle can exist. Exact Three.js raycasting still selects the actual organ.
export function pickClosest(raycaster, meshes) {
  const sphere = new THREE.Sphere(), point = new THREE.Vector3();
  const candidates = [];
  for (const mesh of meshes) {
    if (!mesh.visible || mesh.material.opacity <= .22) continue;
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
    const inside = sphere.containsPoint(raycaster.ray.origin);
    if (!inside && !raycaster.ray.intersectSphere(sphere, point)) continue;
    candidates.push({mesh, near: inside ? 0 : point.distanceTo(raycaster.ray.origin)});
  }
  candidates.sort((a, b) => a.near - b.near);
  let closest = null;
  for (const {mesh, near} of candidates) {
    if (closest && near > closest.distance) break;
    const hit = raycaster.intersectObject(mesh, false)[0];
    if (hit && (!closest || hit.distance < closest.distance)) closest = hit;
  }
  return closest;
}

export function surfaceLabel(meta) {
  if (meta.layer === 'eye') return t('眼睛');
  if (meta.layer === 'skin') return t('头部皮肤');
  return t('发音结构');
}
