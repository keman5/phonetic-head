"""Close the teaching skin's scalp tunnel and cropped base; retain source assets."""
from pathlib import Path
import hashlib, json, math, sys

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'interactive-lab/dist/assets'
SOURCE = ASSETS / 'ear-refined-skin.glb'
TARGET = ASSETS / 'classroom-skin.glb'
REPORT = ASSETS / 'surface-refinement-report.json'
signature = hashlib.sha256(SOURCE.read_bytes() + Path(__file__).read_bytes()).hexdigest()
if '--check' in sys.argv:
    report = json.loads(REPORT.read_text()) if REPORT.exists() else {}
    sys.exit(0 if TARGET.exists() and report.get('sourceHash') == signature and
             report.get('sha256') == hashlib.sha256(TARGET.read_bytes()).hexdigest() else 1)

import bpy, bmesh, numpy as np
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
parts = [o for o in bpy.data.objects if o.type == 'MESH']
assert len(parts) == 2
bpy.ops.object.select_all(action='DESELECT')
for obj in parts: obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
skin = bpy.context.object
old_normals = {tuple(v.co): v.normal.copy() for v in skin.data.vertices}
bm = bmesh.new(); bm.from_mesh(skin.data)
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-7)
layers = list(bm.verts.layers.shape.values())

def loops_from_edges(edges):
    remaining = set(edges); loops = []
    while remaining:
        edge = next(iter(remaining)); start = edge.verts[0]; current = start; loop = []
        while True:
            loop.append(current)
            choices = [e for e in current.link_edges if e in remaining]
            assert len(choices) == (2 if current is start else 1), 'Non-simple surface rim'
            edge = choices[0]; remaining.remove(edge); current = edge.other_vert(current)
            if current is start: break
        loops.append(loop)
    return loops

def fill_rim(rim, step, height):
    samples = [Vector((v.co.x, v.co.y)) for v in rim]
    def inside(x, y):
        return sum((a.y > y) != (b.y > y) and x < (b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x
                   for a, b in zip(samples, samples[1:]+samples[:1])) % 2 == 1
    interior = [Vector((x, y)) for x in np.arange(min(p.x for p in samples),max(p.x for p in samples),step)
                for y in np.arange(min(p.y for p in samples),max(p.y for p in samples),step) if inside(x, y)]
    order = list(range(len(rim)))
    if sum(a.x*b.y-b.x*a.y for a,b in zip(samples,samples[1:]+samples[:1])) < 0: order.reverse()
    coords, _, triangles, origins, _, _ = delaunay_2d_cdt(samples+interior, [], [order], 1, 1e-8)
    vertices = []
    for co, ids in zip(coords, origins):
        fixed = [i for i in ids if i < len(rim)]
        assert len(fixed) <= 1
        if fixed: v = rim[fixed[0]]
        else:
            v = bm.verts.new((co.x, co.y, height(co)))
            for layer in layers: v[layer] = v.co
        vertices.append(v)
    for tri in triangles: bm.faces.new([vertices[i] for i in tri])

# Excise both sheets and the connecting wall of the accidental scalp tunnel.
old_faces = set(bm.faces)
old_edges = {e for e in bm.edges if e.is_boundary}
faces = [f for f in bm.faces if any(v.co.z > 1.69 and
         (v.co.x/.010)**2 + ((v.co.y-.011)/.012)**2 < 1 for v in f.verts)]
bmesh.ops.delete(bm, geom=faces, context='FACES')
rims = loops_from_edges(e for e in bm.edges if e.is_boundary and e not in old_edges)
assert len(rims) == 2
for rim in rims:
    neighborhood = set(rim)
    for _ in range(2): neighborhood.update(v for p in list(neighborhood) for e in p.link_edges for v in e.verts)
    def row(co):
        x, y = co.x/.01, (co.y-.011)/.012
        return [1, x, y, x*x, x*y, y*y]
    coeff = np.linalg.lstsq(np.array([row(v.co) for v in neighborhood]),
                           np.array([v.co.z for v in neighborhood]), rcond=None)[0]
    fill_rim(rim,.001,lambda co:float(np.dot(row(co),coeff)))

# Trim only the cropped bust edge, then close its outer and inner sheets at
# separate heights so transparent views never blend coincident closing faces.
bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces), dist=1e-7,
                      plane_co=(0,0,1.437), plane_no=(0,0,1), clear_inner=True)
base_rims = loops_from_edges(e for e in bm.edges if e.is_boundary and
                            all(abs(v.co.z-1.437) < 1e-6 for v in e.verts))
assert len(base_rims) == 2
base_rims.sort(key=lambda rim: max(abs(v.co.x) for v in rim), reverse=True)
for index, rim in enumerate(base_rims):
    for v in rim:
        v.co.z = 1.437 + index*.001
        for layer in layers: v[layer] = v.co
    fill_rim(rim,.004,lambda co:1.437+index*.001)

bm.normal_update()
pending = set(bm.faces) - old_faces
while pending:
    progress = False
    for face in list(pending):
        shared = next((e for e in face.edges if e.is_manifold and any(f not in pending for f in e.link_faces)), None)
        if shared is not None:
            if not shared.is_contiguous: face.normal_flip()
            pending.remove(face); progress = True
    assert progress, 'Disconnected closing surface'
bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
assert all(len(e.link_faces) <= 2 for e in bm.edges)
assert all(e.is_contiguous for e in bm.edges if e.is_manifold)
assert all(all(abs(v.co.x) < .03 and v.co.y < -.074 and abs(v.co.z-1.5315) < .005
               for v in e.verts) for e in bm.edges if e.is_boundary), 'Unexpected opening'
bm.to_mesh(skin.data); bm.free(); skin.data.update()

# The old bite target pulled the entire lip shell behind the incisors. Keep
# the upper lip fixed and roll the lower lip up and forward to meet the crowns.
def smooth(a, b, value):
    t = max(0, min(1, (value-a)/(b-a)))
    return t*t*(3-2*t)
bite = skin.data.shape_keys.key_blocks['LipBite']
close = skin.data.shape_keys.key_blocks['LipClose']
for vertex in skin.data.vertices:
    x, y, z = vertex.co
    mouth = math.exp(-((y+.09)/.024)**2 - ((z-1.526)/.014)**2) * max(0,1-(abs(x)/.043)**4)
    lower = 1-smooth(1.530,1.533,z)
    bite.data[vertex.index].co = (x, y-.003*mouth*lower, z+.005*mouth*lower)
    # Close the actual oval aperture, with a falloff beyond its rim rather
    # than contracting the whole nose/lip region toward one plane.
    gap = .0018*math.sqrt(max(0,1-(x/.025)**2))
    support = math.exp(-((abs(z-1.5315)-gap)/.008)**2) * (1-smooth(-.076,-.065,y))
    dz = -math.copysign(gap*support,z-1.5315)
    close.data[vertex.index].co = (x,y,z+dz)

bpy.context.view_layer.objects.active = skin
if skin.data.has_custom_normals: bpy.ops.mesh.customdata_custom_splitnormals_clear()
skin.data.update()
normals = []
for v in skin.data.vertices:
    changed = v.co.z < 1.440 or (v.co.z > 1.69 and (v.co.x/.014)**2+((v.co.y-.011)/.016)**2 < 1)
    normals.append(v.normal.copy() if changed else old_normals.get(tuple(v.co),v.normal).copy())
loop_normals = [normals[loop.vertex_index] for loop in skin.data.loops]
for polygon in skin.data.polygons:
    for index, height in enumerate([1.437,1.438]):
        if all(abs(skin.data.vertices[i].co.z-height) < 1e-6 for i in polygon.vertices):
            for loop_index in polygon.loop_indices: loop_normals[loop_index] = Vector((0,0,-1 if index == 0 else 1))
skin.data.normals_split_custom_set(loop_normals)
outputs = []
for side, positive in [('left',True),('right',False)]:
    clone = skin.copy(); clone.data = skin.data.copy(); bpy.context.collection.objects.link(clone)
    bm = bmesh.new(); bm.from_mesh(clone.data)
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces), dist=1e-7,
                          plane_co=(0,0,0), plane_no=(1,0,0), clear_inner=positive, clear_outer=not positive)
    bm.to_mesh(clone.data); bm.free(); clone.data.validate(); clone.data.update()
    clone.name = 'Classroom skin__'+side; clone['side'] = side; clone['surfaceClosed'] = True
    outputs.append(clone)
bpy.ops.object.select_all(action='DESELECT')
for obj in outputs: obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(TARGET), export_format='GLB', use_selection=True,
    export_extras=True, export_animations=False, export_morph=True, export_morph_normal=True, export_yup=True)
REPORT.write_text(json.dumps(dict(sourceHash=signature,sha256=hashlib.sha256(TARGET.read_bytes()).hexdigest(),
    scalpSheets=len(rims),baseSheets=len(base_rims),baseHeight=1.437,morphs=[k.name for k in skin.data.shape_keys.key_blocks][1:]),indent=2)+'\n')
print('Closed classroom skin:', TARGET, flush=True)
