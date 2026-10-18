import {CatmullRomCurve3, Vector3} from 'three';

// Vertical surface samples use the posed mesh, including teaching-only morphs.
// Bin triangles by their possible X/Z extent once; a frame only evaluates the
// handful of vertices next to each sample instead of raycasting every triangle.
const samplers = new WeakMap();
const paths = new WeakMap();
const CELL = .006;
const cell = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const smooth = n => {const t = clamp(n, 0, 1); return t*t*(3-2*t);};
const signature = mesh => `${mesh.geometry.uuid}:${mesh.matrixWorld.elements.join(',')}:${(mesh.morphTargetInfluences || []).join(',')}`;

function sampler(mesh) {
  let cached = samplers.get(mesh);
  const matrixKey = mesh.matrixWorld.elements.join(',');
  if (cached?.geometry === mesh.geometry && cached.matrixKey === matrixKey) return cached;
  const geometry = mesh.geometry, position = geometry.attributes.position;
  const bins = new Map(), envelopes = [], origin = new Vector3().applyMatrix4(mesh.matrixWorld);
  for (let i = 0; i < position.count; i++) {
    const base = new Vector3().fromBufferAttribute(position, i);
    const point = base.clone().applyMatrix4(mesh.matrixWorld);
    let dx = 0, dz = 0;
    for (const morph of geometry.morphAttributes.position || []) {
      const delta = new Vector3().fromBufferAttribute(morph, i);
      if (!geometry.morphTargetsRelative) delta.sub(base);
      delta.applyMatrix4(mesh.matrixWorld).sub(origin);
      dx += Math.abs(delta.x); dz += Math.abs(delta.z);
    }
    envelopes.push([point.x-dx-.0001, point.x+dx+.0001, point.z-dz-.0001, point.z+dz+.0001]);
  }
  const index = geometry.index, count = index?.count || position.count;
  for (let i = 0; i < count; i += 3) {
    const triangle = [0, 1, 2].map(k => index ? index.getX(i+k) : i+k);
    const bounds = triangle.map(i => envelopes[i]);
    for (let x = Math.floor(Math.min(...bounds.map(b => b[0]))/CELL); x <= Math.floor(Math.max(...bounds.map(b => b[1]))/CELL); x++)
      for (let z = Math.floor(Math.min(...bounds.map(b => b[2]))/CELL); z <= Math.floor(Math.max(...bounds.map(b => b[3]))/CELL); z++) {
        const key = `${x},${z}`;
        if (!bins.has(key)) bins.set(key, []);
        bins.get(key).push(triangle);
      }
  }
  cached = {geometry, matrixKey, bins, key: null, vertices: new Map()};
  samplers.set(mesh, cached);
  return cached;
}

function surfaceAt(meshes, x, z, upper) {
  let result = upper ? -Infinity : Infinity;
  for (const mesh of meshes) {
    const data = sampler(mesh), key = signature(mesh);
    if (data.key !== key) {data.key = key; data.vertices.clear();}
    const vertex = i => {
      if (!data.vertices.has(i)) data.vertices.set(i, mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld));
      return data.vertices.get(i);
    };
    for (const indices of data.bins.get(cell(x, z)) || []) {
      const [a, b, c] = indices.map(vertex);
      const determinant = (b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
      if (Math.abs(determinant) < 1e-14) continue;
      const u = ((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/determinant;
      const v = ((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/determinant;
      if (u < -1e-6 || v < -1e-6 || u+v > 1+1e-6) continue;
      const y = u*a.y+v*b.y+(1-u-v)*c.y;
      result = upper ? Math.max(result, y) : Math.min(result, y);
    }
  }
  return Number.isFinite(result) ? result : null;
}

// Useful for fitting a teaching contact to the same real roof used by airflow.
// Returns null outside a surface. Mesh matrices and morph weights must be set.
export function posedSurfaceHeight(meshes, x, z, upper = false) {
  return surfaceAt(meshes, x, z, upper);
}

export function createOralAirPath(tongueMeshes, palateMeshes, pose = {}) {
  if (!tongueMeshes.length) throw new Error('Oral airflow requires a tongue mesh');
  const lateral = clamp(pose.weights?.TongueLateral || 0, 0, 1);
  const key = [...tongueMeshes, ...palateMeshes].map(signature).join('|')+`:${lateral}`;
  const prior = paths.get(tongueMeshes[0]);
  if (prior?.key === key) return prior.path;
  const points = [new Vector3(0,-.11,.013), new Vector3(0,-.058,.018), new Vector3(0,-.022,.019)];
  let minimumGap = Infinity;
  const samples = [];
  for (let z = .024; z <= .0961; z += .004) {
    // /l/ releases along a side of the tongue; never draw air through its
    // closed midline. Ease back to the middle once outside the tongue.
    const x = -.013*lateral*smooth((z-.026)/.018)*(1-smooth((z-.074)/.016));
    const floor = surfaceAt(tongueMeshes, x, z, true);
    const roof = surfaceAt(palateMeshes, x, z, false);
    let y;
    if (floor !== null && roof !== null) {
      const gap = roof-floor;
      minimumGap = Math.min(minimumGap, gap);
      y = (floor+roof)/2;
    } else if (roof !== null) y = roof-.003;
    else if (floor !== null) y = floor+.003;
    else y = -.017;
    points.push(new Vector3(x,y,z));
    samples.push({x,z,floor,roof,y});
  }
  points.push(new Vector3(0,-.017,.112), new Vector3(0,-.015,.145));
  const path = new CatmullRomCurve3(points, false, 'centripetal');
  // Consumers can scale their existing particles for narrow vowel channels.
  // Closed/releasing plosives still use the app's phoneme airflow envelope.
  path.userData = {
    samples,
    minimumGap: Number.isFinite(minimumGap) ? minimumGap : null,
    canFlow: minimumGap > .0002,
    // Reserve space for curve interpolation, particle radius and its jitter;
    // the sampled gap is not all available to the rendered glyph itself.
    particleScale: minimumGap <= .0002 ? 0 : Number.isFinite(minimumGap) ? clamp(minimumGap/.012, .03, 1) : 1,
    lateral: lateral > .1,
  };
  paths.set(tongueMeshes[0], {key, path});
  return path;
}
