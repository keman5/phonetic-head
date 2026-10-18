import {Vector3} from 'three';

// Shared by both teaching modes. The anatomical source remains immutable.
// Work along each tooth's crown-to-root axis: Y-only scaling leaves the long
// backwards lean of the lower incisors visible through the sagittal view.
export function childToothGeometry(source, upper, reference = source) {
  // BufferGeometry.boundingBox includes all morph displacement extents; only
  // the resting positions define tooth height and its occlusal anchor.
  let min = Infinity, max = -Infinity;
  const rest = reference.attributes.position;
  for (let i = 0; i < rest.count; i++) {
    min = Math.min(min, rest.getY(i)); max = Math.max(max, rest.getY(i));
  }
  const anchor = upper ? min : max;
  const direction = upper ? 1 : -1;
  const span = max - min;
  const crown = [], tip = [], biting = [];
  for (let i = 0; i < rest.count; i++) {
    const depth = direction * (rest.getY(i) - anchor);
    if (depth <= .0035) crown.push(i);
    if (depth <= span * .15) biting.push(i);
    if (depth >= span * .85) tip.push(i);
  }
  const point = (geometry, i, morph) => {
    const p = new Vector3().fromBufferAttribute(geometry.attributes.position, i);
    if (!morph) return p;
    const m = new Vector3().fromBufferAttribute(morph, i);
    return geometry.morphTargetsRelative ? p.add(m) : m;
  };
  // Membership is fixed in the full resting tooth, including for split/cap
  // geometry. Reusing those vertices in morphs makes the frame follow the jaw
  // instead of reclassifying the crown by world Y as it rotates.
  const frame = (morph) => {
    const mean = ids => ids.reduce((sum, i) => sum.add(point(reference, i, morph)), new Vector3()).divideScalar(ids.length || 1);
    const origin = mean(biting);
    const axis = mean(tip).sub(origin);
    if (axis.lengthSq() < 1e-16) axis.set(0, direction, 0);
    else axis.normalize();
    let neck = 0;
    for (const i of crown) neck = Math.max(neck, point(reference, i, morph).sub(origin).dot(axis));
    return {origin, axis, neck};
  };
  const shorten = (p, {origin, axis, neck}) => {
    const depth = p.clone().sub(origin).dot(axis) - neck;
    if (depth <= 0) return p;
    // Smoothly flatten exposed roots into a <=1.2 mm stub, without collapsing
    // topology or changing crown width. Slope is 1 at the protected crown plane.
    const stub = -.0012 * Math.expm1(-depth / .0012);
    const originalX = p.x;
    p.addScaledVector(axis, stub - depth);
    // The sagittal seam is a constraint, not part of the tooth's lean. Never
    // move a cap vertex off x=0 or pull either half across the cut plane.
    const safeX = originalX === 0 ? 0 : originalX > 0 ? Math.max(0, p.x) : Math.min(0, p.x);
    const yz = axis.y * axis.y + axis.z * axis.z;
    if (safeX !== p.x && yz > 1e-12) {
      const correction = (p.x - safeX) * axis.x / yz;
      p.y += axis.y * correction;
      p.z += axis.z * correction;
    }
    p.x = safeX;
    return p;
  };
  const geometry = source.clone();
  const base = source.attributes.position;
  const positions = geometry.attributes.position;
  const restingFrame = frame();
  for (let i = 0; i < base.count; i++) {
    const p = shorten(point(source, i), restingFrame);
    positions.setXYZ(i, p.x, p.y, p.z);
  }
  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal;
  delete geometry.morphAttributes.normal;
  if (source.morphAttributes.position?.length) geometry.morphAttributes.normal = [];
  for (const [index, morph] of (source.morphAttributes.position || []).entries()) {
    const movingFrame = frame(reference.morphAttributes.position?.[index]);
    const target = positions.clone();
    for (let i = 0; i < base.count; i++) {
      const p = shorten(point(source, i, morph), movingFrame);
      target.setXYZ(i, p.x, p.y, p.z);
    }
    const normalGeometry = geometry.clone();
    normalGeometry.setAttribute('position', target);
    normalGeometry.computeVertexNormals();
    const targetNormal = normalGeometry.attributes.normal.clone();
    const delta = target.clone();
    if (source.morphTargetsRelative) for (let i = 0; i < base.count; i++) {
      delta.setXYZ(i, target.getX(i) - positions.getX(i), target.getY(i) - positions.getY(i), target.getZ(i) - positions.getZ(i));
      targetNormal.setXYZ(i, targetNormal.getX(i) - normals.getX(i), targetNormal.getY(i) - normals.getY(i), targetNormal.getZ(i) - normals.getZ(i));
    }
    geometry.morphAttributes.position[index] = delta;
    geometry.morphAttributes.normal[index] = targetNormal;
    normalGeometry.dispose();
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
