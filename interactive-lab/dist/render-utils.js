import * as THREE from 'three';

// Opacity is a uniform. Only a change of render mode invalidates the program.
export function setOpacity(material, opacity) {
  const transparent = opacity < .995;
  if (material.transparent !== transparent) {
    material.transparent = transparent;
    material.needsUpdate = true;
  }
  material.opacity = opacity;
  material.depthWrite = !transparent;
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
  if (meta.layer === 'eye') return '眼睛';
  if (meta.layer === 'skin') return '头部皮肤';
  return '发音结构';
}
