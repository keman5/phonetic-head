"""Smooth the real mouth boundary and its supporting skin, preserving an open lip slit.
Blender --background --python refine_lips.py. Original repaired skin is immutable.
"""
from pathlib import Path
import sys, math, json, hashlib
import bpy, bmesh, numpy as np

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from articulation import skin_deform
ASSETS = ROOT / 'interactive-lab/dist/assets'
SOURCE = ASSETS / 'repaired-skin.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
parts = [o for o in bpy.data.objects if o.type == 'MESH']
assert len(parts) == 2
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
skin = bpy.context.object
keys = [k.name for k in skin.data.shape_keys.key_blocks][1:]
skin.shape_key_clear()
if skin.data.has_custom_normals: bpy.ops.mesh.customdata_custom_splitnormals_clear()
bm = bmesh.new(); bm.from_mesh(skin.data)
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
before = len(bm.verts)

def mouth(v):
    x,y,z=v.co
    return y < -.074 and abs(x) < .029 and abs(z-1.5315) < .005

edges = {e for e in bm.edges if e.is_boundary and all(mouth(v) for v in e.verts)}
assert edges, 'No mouth boundary found'
remaining = set(edges)
loops = []
while remaining:
    first = remaining.pop(); component = {first}; todo = list(first.verts)
    while todo:
        vertex = todo.pop()
        for edge in vertex.link_edges:
            if edge in remaining:
                remaining.remove(edge); component.add(edge); todo.extend(edge.verts)
    loops.append({v for e in component for v in e.verts})

# Each surface sheet gets its own smooth depth curve; never join the inner and
# outer skin sheets, bridge the mouth, or smooth the upper/lower lips together.
fixed = {}
fit_errors = []
rim_reversals = 0
for loop in loops:
    # Cutting simplified triangles can produce a boundary that doubles back in
    # angle. Fitting depth alone leaves overlapping razor-thin lip triangles.
    # Walk the topology, then monotonically fit angles with minimal displacement.
    start = max(loop, key=lambda v: v.co.x)
    vertices = [start]
    previous, current = None, start
    while True:
        neighbors = [e.other_vert(current) for e in current.link_edges
                     if e.is_boundary and e.other_vert(current) in loop]
        assert len(neighbors) == 2, 'Lip ring must be a simple closed loop'
        following = next(v for v in neighbors if v is not previous)
        if following is start: break
        vertices.append(following)
        previous, current = current, following
    assert len(vertices) == len(loop)
    rows, depths, angles = [], [], []
    for v in vertices:
        theta = math.atan2((v.co.z-1.5315)/.0018, v.co.x/.025)
        c, s = math.cos(theta), math.sin(theta)
        rows.append([1,c*c,c**4,s]); depths.append(v.co.y); angles.append(theta)
    coefficients = np.linalg.lstsq(np.asarray(rows), np.asarray(depths), rcond=None)[0]
    unwrapped = np.unwrap(angles + angles[:1])
    direction = 1 if unwrapped[-1] > unwrapped[0] else -1
    rim_reversals += int(np.sum(np.diff(unwrapped)*direction < -1e-5))
    phase = np.clip((unwrapped[:-1]-angles[0])*direction,0,2*math.pi)
    # Pool adjacent violators: fix only the local reversals, unlike a whole-ring
    # uniform redistribution which pulls the corners away from their support.
    blocks = []
    for angle in phase:
        blocks.append([float(angle),1])
        while len(blocks)>1 and blocks[-2][0]>blocks[-1][0]:
            b=blocks.pop();a=blocks.pop();count=a[1]+b[1]
            blocks.append([(a[0]*a[1]+b[0]*b[1])/count,count])
    monotone = np.asarray([value for value,count in blocks for _ in range(count)])
    # Tiny regularization keeps pooled vertices distinct, avoiding zero-area faces.
    monotone = .995*monotone + .005*np.arange(len(vertices))/len(vertices)*2*math.pi
    smooth_angles = angles[0]+direction*monotone
    for v,theta in zip(vertices,smooth_angles):
        c,s = math.cos(theta),math.sin(theta)
        row = [1,c*c,c**4,s]
        depth = float(np.dot(row,coefficients))
        fit_errors.append(abs(depth-v.co.y))
        v.co.x = .025*math.cos(theta); v.co.z = 1.5315+.0018*math.sin(theta); v.co.y = depth
        fixed[v] = v.co.copy()

# Blend only the narrow lip support. Fixed boundary curves keep the lip aperture
# intact; a cosine falloff leaves cheeks, nose, chin and eyelids unchanged.
weighted = []
for v in bm.verts:
    x,y,z=v.co
    if v in fixed or y >= -.074 or abs(x) >= .038 or abs(z-1.5315) >= .012: continue
    weight = math.cos(abs(z-1.5315)/.012*math.pi/2)**2
    weight *= max(0, min(1, (.038-abs(x))/.010))
    weighted.append((v, weight))
for _ in range(120):
    updates = []
    for v,weight in weighted:
        neighbors = [e.other_vert(v).co for e in v.link_edges]
        if neighbors:
            center = sum(neighbors, v.co*0)/len(neighbors)
            updates.append((v, v.co.lerp(center, .38*weight)))
    for v,point in updates: v.co = point
    for v,point in fixed.items(): v.co = point
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
assert all(len(e.link_faces) <= 2 for e in bm.edges)
unexpected = [e for e in bm.edges if e.is_boundary and not all(mouth(v) for v in e.verts)]
assert not unexpected, 'Unexpected non-mouth opening'
bm.to_mesh(skin.data); bm.free(); skin.data.update()
skin.shape_key_add(name='Basis')
for name in keys:
    key = skin.shape_key_add(name=name)
    for vertex in skin.data.vertices: key.data[vertex.index].co = skin_deform(name, vertex.co)

outputs=[]
for side,positive in [('left',True),('right',False)]:
    clone=skin.copy(); clone.data=skin.data.copy(); bpy.context.collection.objects.link(clone)
    bm=bmesh.new(); bm.from_mesh(clone.data)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,
        plane_co=(0,0,0),plane_no=(1,0,0),clear_inner=positive,clear_outer=not positive)
    bm.to_mesh(clone.data); bm.free(); clone.data.validate(); clone.data.update()
    for face in clone.data.polygons: face.use_smooth=True; face.material_index=0
    clone.name='Lip-refined skin__'+side
    clone['side']=side; clone['layer']='skin'; clone['anatomyName']='Skin - stitched atlas regions'
    clone['lumen']=False; clone['lipsRefined']=True
    outputs.append(clone)
bpy.ops.object.select_all(action='DESELECT')
for o in outputs: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ASSETS/'refined-lips.glb'),export_format='GLB',use_selection=True,
    export_extras=True,export_animations=False,export_morph=True,export_morph_normal=True,export_yup=True)
report=dict(source_sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),boundary_loops=len(loops),
    corrected_boundary_backtracks=rim_reversals,
    rim_vertices=len(fixed),support_vertices=len(weighted),source_vertices=before,morphs=keys,
    max_rim_depth_correction=max(fit_errors),unexpected_boundary_edges=len(unexpected),
    method='Topology-ordered monotone lip rims; symmetric depth per sheet; local support smoothing; shared authored skin motion.')
(ASSETS/'lip-refinement-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('LIP_REFINEMENT',json.dumps(report),flush=True)
