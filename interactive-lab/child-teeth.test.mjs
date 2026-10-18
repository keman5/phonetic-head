import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Box3, BufferGeometry, Float32BufferAttribute, Matrix4, Vector3} from 'three';
import {childToothGeometry} from './dist/child-teeth.js';

function toothFrame(position, upper) {
  const bounds = new Box3().setFromBufferAttribute(position);
  const edge = upper ? bounds.min.y : bounds.max.y, sign = upper ? 1 : -1;
  const span = bounds.max.y - bounds.min.y;
  const crown = [], ends = [[], []];
  for (let i = 0; i < position.count; i++) {
    const p = new Vector3().fromBufferAttribute(position, i), d = sign * (p.y - edge);
    if (d <= .0035) crown.push(i);
    if (d <= span * .15) ends[0].push(p);
    if (d >= span * .85) ends[1].push(p);
  }
  const center = list => list.reduce((a, b) => a.add(b), new Vector3()).divideScalar(list.length);
  const axis = center(ends[1]).sub(center(ends[0])).normalize();
  const neck = Math.max(...crown.map(i => new Vector3().fromBufferAttribute(position, i).dot(axis)));
  return {axis, neck, crown};
}

test('all 28 teaching teeth retain crowns, shorten leaning roots and leave source channels immutable', async () => {
  const data = readFileSync(new URL('./dist/assets/phonetic-head.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
  let count = 0;
  gltf.scene.traverse(mesh => {
    if (!mesh.isMesh || !/^(Upper|Lower) /.test(mesh.userData.anatomyName || '')) return;
    count++;
    const source = mesh.geometry, original = source.attributes.position.array.slice();
    const snapshot = source.toJSON();
    const upper = mesh.userData.anatomyName.startsWith('Upper ');
    const child = childToothGeometry(source, upper);
    assert.deepEqual(source.attributes.position.array, original);
    const {axis, neck, crown} = toothFrame(source.attributes.position, upper);
    assert.equal(child.attributes.position.count, source.attributes.position.count);
    const sourceRest=new Box3().setFromBufferAttribute(source.attributes.position);
    const edge = upper ? sourceRest.min.y : sourceRest.max.y;
    for (let i = 0; i < original.length / 3; i++) {
      const old = new Vector3().fromBufferAttribute(source.attributes.position, i);
      const now = new Vector3().fromBufferAttribute(child.attributes.position, i);
      if (Math.abs(old.y - edge) <= .0035) assert(now.distanceTo(old) < 2e-7);
      assert(now.dot(axis) - neck <= .0012002, 'root stub must be <=1.2 mm along actual root axis');
      const displacement = old.clone().sub(now);
      assert(old.x === 0 ? now.x === 0 : old.x * now.x >= 0, 'keep sagittal seam and side');
      assert(displacement.clone().cross(axis).length() < 2e-7, 'preserve transverse crown/root width');
      if (old.dot(axis) - neck > .010)
        assert(displacement.length() > .0087, 'long roots must move in 3D, not merely Y');
    }
    assert.equal(child.morphAttributes.position?.length || 0, source.morphAttributes.position?.length || 0);
    if (!source.morphAttributes.position?.length) assert.equal(child.morphAttributes.normal, undefined);
    for (const [index, morph] of (child.morphAttributes.position || []).entries()) {
      assert(morph.array.every(Number.isFinite));
      assert(child.morphAttributes.normal[index].array.every(Number.isFinite));
      const before = source.morphAttributes.position[index];
      for (const i of crown) {
        const old = new Vector3().fromBufferAttribute(before, i);
        const now = new Vector3().fromBufferAttribute(morph, i);
        if (source.morphTargetsRelative) {
          old.add(new Vector3().fromBufferAttribute(source.attributes.position, i));
          now.add(new Vector3().fromBufferAttribute(child.attributes.position, i));
        }
        assert(now.distanceTo(old) < 2e-7, 'authored moving crown landmarks stay unchanged');
      }
      let oldEdge = upper ? Infinity : -Infinity, newEdge = oldEdge;
      for (let i = 0; i < morph.count; i++) {
        const oldY = before.getY(i) + (source.morphTargetsRelative ? source.attributes.position.getY(i) : 0);
        const newY = morph.getY(i) + (child.morphTargetsRelative ? child.attributes.position.getY(i) : 0);
        oldEdge = upper ? Math.min(oldEdge, oldY) : Math.max(oldEdge, oldY);
        newEdge = upper ? Math.min(newEdge, newY) : Math.max(newEdge, newY);
      }
      assert(Math.abs(oldEdge - newEdge) < 2e-7, 'moving biting edge must stay in place');
    }
    assert.deepEqual(source.toJSON(), snapshot);
    assert(child.attributes.normal.array.every(Number.isFinite));
    assert(Number.isFinite(child.boundingSphere.radius));
    child.dispose();
  });
  assert.equal(count, 28);
});

// A deliberately leaning root with a protected 3.5 mm crown. Rotate the jaw
// enough that re-selecting the occlusal edge by world Y would be incorrect.
function fixture(relative) {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([
    -.002, 0, 0, .002, 0, 0, 0, -.0035, -.002,
    -.002, -.012, -.014, .002, -.012, -.014, 0, -.025, -.032,
  ], 3));
  g.setIndex([0, 1, 2, 2, 1, 4, 2, 4, 3, 3, 4, 5]);
  g.computeVertexNormals();
  const matrix = new Matrix4().makeRotationX(1.1).setPosition(.02, -.01, .03);
  const target = g.attributes.position.clone();
  for (let i = 0; i < target.count; i++) {
    const p = new Vector3().fromBufferAttribute(target, i).applyMatrix4(matrix);
    if (relative) p.sub(new Vector3().fromBufferAttribute(g.attributes.position, i));
    target.setXYZ(i, p.x, p.y, p.z);
  }
  g.morphTargetsRelative = relative;
  g.morphAttributes.position = [target];
  return {g, matrix};
}

for (const relative of [true, false]) {
  test(`rigid jaw rotation follows shortened tooth, including normals (${relative ? 'relative' : 'absolute'} morphs)`, () => {
    const {g, matrix} = fixture(relative), result = childToothGeometry(g, false);
    for (let i = 0; i < g.attributes.position.count; i++) {
      const base = new Vector3().fromBufferAttribute(result.attributes.position, i);
      const target = new Vector3().fromBufferAttribute(result.morphAttributes.position[0], i);
      if (relative) target.add(base);
      assert(target.distanceTo(base.clone().applyMatrix4(matrix)) < 2e-7);
      const normal = new Vector3().fromBufferAttribute(result.attributes.normal, i);
      const targetNormal = new Vector3().fromBufferAttribute(result.morphAttributes.normal[0], i);
      if (relative) targetNormal.add(normal);
      assert(targetNormal.distanceTo(normal.transformDirection(matrix)) < 2e-4);
      for (const weight of [0, .25, .5, .75, 1]) {
        const actual = base.clone().lerp(target, weight);
        const expected = base.clone().lerp(base.clone().applyMatrix4(matrix), weight);
        assert(actual.distanceTo(expected) < 2e-7);
      }
    }
  });

  test(`side subsets use full reference for identical positions and morphs (${relative})`, () => {
    const {g} = fixture(relative), full = childToothGeometry(g, false);
    const ids = [2, 4, 5], subset = new BufferGeometry();
    const select = attr => new Float32BufferAttribute(ids.flatMap(i => [attr.getX(i), attr.getY(i), attr.getZ(i)]), 3);
    subset.setAttribute('position', select(g.attributes.position));
    subset.morphTargetsRelative = relative;
    subset.morphAttributes.position = g.morphAttributes.position.map(select);
    const result = childToothGeometry(subset, false, g);
    assert.deepEqual(result.attributes.position.array, select(full.attributes.position).array);
    assert.deepEqual(result.morphAttributes.position[0].array, select(full.morphAttributes.position[0]).array);
  });
}

for (const relative of [true, false]) test(`X-lean keeps both sagittal seams, side signs and reference caps (${relative})`, () => {
  for (const upper of [true, false]) for (const side of [-1, 1]) {
    const direction = upper ? 1 : -1;
    const points = [
      [.004, 0, 0], [.006, 0, 0], [.005, .003, .001],
      [.018, .025, -.005], [.022, .025, -.005], [.020, .025, -.006],
      [0, .015, -.003], [0, .022, -.004], [.0001, .020, -.004],
    ].map(([x,y,z]) => [side*x, direction*y, z]);
    const full = new BufferGeometry();
    full.setAttribute('position', new Float32BufferAttribute(points.flat(), 3));
    full.morphTargetsRelative = relative;
    full.morphAttributes.position = [new Float32BufferAttribute(points.flatMap(([x,y,z]) =>
      relative ? [0, .007, .004] : [x, y+.007, z+.004]), 3)];
    const snapshot = full.toJSON(), shortened = childToothGeometry(full, upper);
    const {axis, neck} = toothFrame(full.attributes.position, upper);
    const ids = [0, 6, 7, 2, 7, 8]; // a cap/subset with a different own bound/axis
    const select = attr => new Float32BufferAttribute(ids.flatMap(i => [attr.getX(i),attr.getY(i),attr.getZ(i)]), 3);
    const cap = new BufferGeometry();
    cap.setAttribute('position', select(full.attributes.position));
    cap.morphTargetsRelative = relative;
    cap.morphAttributes.position = full.morphAttributes.position.map(select);
    const capSnapshot = cap.toJSON(), result = childToothGeometry(cap, upper, full);
    assert.deepEqual(result.attributes.position.array, select(shortened.attributes.position).array);
    assert.deepEqual(result.morphAttributes.position[0].array, select(shortened.morphAttributes.position[0]).array);
    for (let i = 0; i < points.length; i++) {
      const p = new Vector3().fromBufferAttribute(shortened.attributes.position, i);
      assert(points[i][0] === 0 ? p.x === 0 : p.x*side >= 0);
      assert(p.dot(axis)-neck <= .0012002, 'seam constraint must retain root depth limit');
      if (i < 3) assert(p.distanceTo(new Vector3(...points[i])) < 2e-7);
      const target = new Vector3().fromBufferAttribute(shortened.morphAttributes.position[0], i);
      if (relative) target.add(p);
      assert(points[i][0] === 0 ? target.x === 0 : target.x*side >= 0);
      assert(target.distanceTo(p.clone().add(new Vector3(0,.007,.004))) < 2e-7);
    }
    assert.deepEqual(full.toJSON(), snapshot);
    assert.deepEqual(cap.toJSON(), capSnapshot);
  }
});

test('empty and already crown-only geometry remain finite and unchanged', () => {
  for (const coords of [[], [0, 0, 0, .001, 0, 0, 0, .002, 0]]) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(coords, 3));
    const result = childToothGeometry(g, true);
    assert.deepEqual(result.attributes.position.array, g.attributes.position.array);
    assert(result.attributes.normal.array.every(Number.isFinite));
  }
});
