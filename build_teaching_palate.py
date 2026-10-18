"""Source-aligned, continuous teaching palate; run with local Blender --background --python.

Creates only teaching-palate.glb and teaching-palate-report.json. Atlas and refined
articulators are immutable. This is a mucosal teaching envelope, not new atlas anatomy
or a biomechanical velopharyngeal-closure simulation. Coordinates in the report are
glTF metres before the shared -1.55 m vertical node translation.
"""
from pathlib import Path
import hashlib
import json
import math
import statistics

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import tessellate_polygon

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'interactive-lab/dist/assets'
SOURCES = ['phonetic-head.glb', 'smooth-articulators.glb']
hashes = {n: hashlib.sha256((ASSETS / n).read_bytes()).hexdigest() for n in SOURCES}
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ASSETS / SOURCES[0]))
sources = [o for o in bpy.data.objects if o.type == 'MESH']


def gltf(v):
    return Vector((v.x, v.z, -v.y))


def blender(v):
    return (v[0], -v[2], v[1])


def source_points(name):
    return [gltf(v.co) for o in sources if o.get('anatomyName') == name for v in o.data.vertices]


# Raycast the inferior maxillary/palatine surface: the entire maxilla's bounds
# also contain the orbit and cannot be used as the height of the mouth roof.
bone_vertices, bone_faces = [], []
for o in sources:
    if not o.get('anatomyName', '').startswith(('Maxilla.', 'Palatine bone.')):
        continue
    offset = len(bone_vertices)
    bone_vertices.extend(gltf(v.co) for v in o.data.vertices)
    o.data.calc_loop_triangles()
    bone_faces.extend(tuple(offset + i for i in t.vertices) for t in o.data.loop_triangles)
bvh = BVHTree.FromPolygons(bone_vertices, bone_faces, all_triangles=True)
bone_samples = []


def bone_height(z):
    # The atlas has a small midline bony suture; sample 4 mm either side of it.
    # The anterior crown projects beyond its alveolus. If necessary search up
    # to 4 mm posteriorly for its bony insertion, recording the actual sample.
    for step in range(9):
        sample_z = z-step*.0005
        hits = [bvh.ray_cast(Vector((x, 1.525, sample_z)), Vector((0, 1, 0)), .045)[0]
                for x in [-.004, .004]]
        heights = [v.y for v in hits if v is not None]
        if heights:
            height = statistics.mean(heights)
            bone_samples.append(dict(requested_z=z, sampled_z=sample_z, height=height))
            return height
    raise AssertionError(('No palatal bone below nasal floor', z))


teeth = []
for suffix in ['medial incisor', 'lateral incisor', 'canine', 'first premolar',
               'second premolar', 'first molar tooth', 'second molar tooth']:
    points = source_points('Upper ' + suffix + '.l')
    edge = min(v.y for v in points)
    crown = [v for v in points if v.y <= edge + .0035]
    teeth.append(dict(name='Upper ' + suffix + '.l',
                      z=statistics.mean(v.z for v in crown),
                      width=statistics.mean(v.x for v in crown), edge_y=edge))
teeth.sort(key=lambda t: -t['z'])
soft_source = source_points('Soft palate')
uvula_source = source_points('Uvula of palate')
front = teeth[0]['z'] - .001
# The posterior horizontal palatine plate lies around z=.045, overlapping the
# atlas soft-palate anterior insertion (.0556). Do not follow its forked shells.
join_z = .045
back_z = statistics.mean(v.z for v in uvula_source)
back_y = max(v.y for v in uvula_source) - .0015
tip_y = max(min(v.y for v in uvula_source) + .001, back_y - .0042)
tip_z = min(v.z for v in uvula_source)


def smooth(t):
    t = max(0., min(1., t))
    return t * t * (3 - 2 * t)


def interpolate(rows, z, field):
    if z >= rows[0]['z']:
        return rows[0][field]
    if z <= rows[-1]['z']:
        return rows[-1][field]
    # Shape-preserving Hermite interpolation avoids a horizontal tangent at
    # every tooth sample (the old smoothstep chain looked like stacked shelves).
    slopes = [(b[field]-a[field])/(b['z']-a['z']) for a, b in zip(rows, rows[1:])]
    tangents = [slopes[0]]
    for a, b in zip(slopes, slopes[1:]):
        tangents.append(0 if a*b <= 0 else 2*a*b/(a+b))
    tangents.append(slopes[-1])
    for i, (a, b) in enumerate(zip(rows, rows[1:])):
        if a['z'] >= z >= b['z']:
            h = b['z']-a['z']
            t = (z-a['z'])/h
            return ((2*t**3-3*t**2+1)*a[field] + (t**3-2*t**2+t)*h*tangents[i]
                    + (-2*t**3+3*t**2)*b[field] + (t**3-t**2)*h*tangents[i+1])
    raise AssertionError(z)


stations = []
for t in teeth:
    z = min(front, t['z'])
    # 1.1 mm of soft cover below bone, with a round 2.2 mm total thickness.
    center = bone_height(z)
    width = t['width']
    edge_y = t['edge_y'] + .0045
    stations.append(dict(z=z, center=center, width=width,
                         arch=max(.001, center-edge_y), thickness=.0011))
stations.append(dict(z=join_z, center=bone_height(join_z), width=.017,
                     arch=.0035, thickness=.0011))
stations.sort(key=lambda r: -r['z'])
# Preserve measured dimensional anchors, but do not reproduce local bony
# hollows/ridges in a child's mucosal envelope. Its sagittal centre is a single
# monotone cubic with a horizontal tangent at the fixed soft-palate insertion.
front_height, rear_height = stations[0]['center'], stations[-1]['center']
roof_controls = [front_height, front_height+.55*(rear_height-front_height), rear_height, rear_height]
edge_stations = []
for r in stations:
    edge_y = r['center']-r['arch']
    if edge_stations:
        edge_y = max(edge_y, edge_stations[-1]['edge_y'])
    edge_stations.append(dict(z=r['z'], edge_y=edge_y))


def roof_height(t):
    a, b, c, d = roof_controls
    return a*(1-t)**3+3*b*(1-t)**2*t+3*c*(1-t)*t*t+d*t**3

# Elliptic closed transverse sections form a genuinely volumetric, curved roof.
# The two tissue surfaces meet at rounded lateral rims, not detached flat sheets.
RING = 64
rings = []
labels = []
for j in range(49):
    t = j/48
    z = front + (join_z-front)*t
    center = roof_height(t)
    rings.append(dict(z=z, center=center, width=interpolate(stations,z,'width'),
                      arch=center-interpolate(edge_stations,z,'edge_y'), thickness=.0011))
    if j:
        labels.append('Hard palate')
hard_join = len(rings)-1
join = rings[-1]
for j in range(1, 33):
    t = j/32
    s = smooth(t)
    rings.append(dict(z=join_z+(back_z-join_z)*t,
                      center=join['center']+(back_y-join['center'])*s,
                      width=join['width']+(.0024-join['width'])*s,
                      arch=join['arch']*(1-s), thickness=.0011+.0002*s))
    labels.append('Soft palate')
soft_join = len(rings)-1
for j in range(1, 25):
    # Ellipsoidal rather than linear taper: a short rounded tip, not a blade.
    # Angular sampling resolves the round pole; t^2 keeps its root tangent flat.
    angle = j/25*math.pi/2
    t = math.sin(angle)
    radius = math.cos(angle)
    rings.append(dict(z=back_z+(tip_z-back_z)*t,
                      center=back_y+(tip_y-back_y)*t*t,
                      width=.0024*radius, arch=0, thickness=.0013*radius))
    labels.append('Uvula of palate')

vertices = []
for r in rings:
    for k in range(RING):
        a = 2*math.pi*k/RING
        x = r['width']*math.sin(a)
        if k in (0, RING//2):
            x = 0.0
        vertices.append((x, r['center']-r['arch']*math.sin(a)**2
                         +r['thickness']*math.cos(a), r['z']))
faces, face_names = [], []
for j, name in enumerate(labels):
    for k in range(RING):
        n = (k+1) % RING
        faces.append((j*RING+k, j*RING+n, (j+1)*RING+n, (j+1)*RING+k))
        face_names.append(name)
# Close the exterior ends. Internal tissue ends are added after calculating
# exterior normals, so they do not introduce visible shading discontinuities.
for j, point, name in [(0, (0, rings[0]['center'], front+.0006), 'Hard palate'),
                       (len(rings)-1, (0, tip_y, tip_z), 'Uvula of palate')]:
    pole = len(vertices)
    vertices.append(point)
    for k in range(RING):
        n = (k+1) % RING
        face = (pole, j*RING+n, j*RING+k) if j == 0 else (pole, j*RING+k, j*RING+n)
        faces.append(face)
        face_names.append(name)


def moved(v, key):
    x, y, z = v
    w = smooth((join_z-z)/(join_z-back_z))
    # Same teaching excursion as the source, but zero displacement AND slope
    # at the anterior insertion, shared by all pieces and both halves.
    sign = 1 if key == 'VelumRaise' else -1
    return (x, y+sign*.006*w, z-sign*.002*w)


# Compute normals on the connected roof before tissue/side separation, so
# anatomical and sagittal junctions keep identical shading in every pose.
def full_normals(coords):
    mesh = bpy.data.meshes.new('temporary continuous palate normals')
    mesh.from_pydata([blender(v) for v in coords], [], faces)
    mesh.update()
    normals = [v.normal.copy() for v in mesh.vertices]
    bpy.data.meshes.remove(mesh)
    return normals


base_normals = full_normals(vertices)
# Runtime section generation works per anatomyName, not on the assembled roof.
# Close each tissue junction with matching reversed internal faces, but NEVER
# bake an x=0 sagittal face: runtime caps still own side-difference opacity.
# Each half of the curved crescent needs concave-polygon triangulation, not a
# centre fan (its centre can lie outside the thin vaulted tissue).
internal_faces = 0
for ring, anterior, posterior in [(hard_join, 'Hard palate', 'Soft palate'),
                                  (soft_join, 'Soft palate', 'Uvula of palate')]:
    for ks in [list(range(33)), list(range(32, 64))+[0]]:
        ids = [ring*RING+k for k in ks]
        polygon = [Vector(vertices[i]) for i in ids]
        lookup = {tuple(v): i for v, i in zip(polygon, ids)}
        for triangle in tessellate_polygon([polygon]):
            face = tuple(ids[v] if isinstance(v, int) else lookup[tuple(v)] for v in triangle)
            faces.extend([face, tuple(reversed(face))])
            face_names.extend([anterior, posterior])
            internal_faces += 2
outputs = []
for name in ['Hard palate', 'Soft palate', 'Uvula of palate']:
    for side, sign in [('left', 1), ('right', -1)]:
        chosen = [face for face, label in zip(faces, face_names)
                  if label == name and all(vertices[i][0]*sign >= 0 for i in face)]
        ids = sorted({i for f in chosen for i in f})
        remap = {i: j for j, i in enumerate(ids)}
        mesh = bpy.data.meshes.new(name+' teaching '+side)
        mesh.from_pydata([blender(vertices[i]) for i in ids], [],
                         [tuple(remap[i] for i in f) for f in chosen])
        mesh.update()
        for p in mesh.polygons:
            p.use_smooth = True
        mesh.normals_split_custom_set_from_vertices([base_normals[i] for i in ids])
        obj = bpy.data.objects.new(name+' teaching__'+side, mesh)
        bpy.context.collection.objects.link(obj)
        obj.location.z = -1.55
        for key, value in dict(anatomyName=name, side=side, layer='organ', lumen=False,
                               teachingOnly=True, teachingPalate=True).items():
            obj[key] = value
        if name != 'Hard palate':
            obj.shape_key_add(name='Basis')
            for key in ['VelumRaise', 'VelumLower']:
                target = obj.shape_key_add(name=key)
                for dst, i in zip(target.data, ids):
                    dst.co = blender(moved(vertices[i], key))
        outputs.append(obj)

bpy.ops.object.select_all(action='DESELECT')
for obj in outputs:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ASSETS/'teaching-palate.glb'), export_format='GLB',
    use_selection=True, export_extras=True, export_animations=False, export_morph=True,
    export_morph_normal=True, export_yup=True, export_cameras=False, export_lights=False)
assert hashes == {n: hashlib.sha256((ASSETS/n).read_bytes()).hexdigest() for n in SOURCES}
report = dict(source_sha256=hashes, units='metres', coordinates='glTF XYZ before node Y=-1.55',
    method='Inferior maxilla/palatine ray samples and upper crown arch; connected rounded volumetric loft, split only after construction.',
    notice='Child teaching mucosal envelope; not diagnostic anatomy or a biomechanical closure model.',
    names=['Hard palate', 'Soft palate', 'Uvula of palate'], meshes=len(outputs),
    morphs=['VelumRaise', 'VelumLower'], tooth_landmarks=teeth, bone_stations=stations,
    bone_samples=bone_samples,
    roof_center_bezier_y=roof_controls, edge_stations=edge_stations,
    uvula_style='Short 4.2 mm drop with ellipsoidal round end; fixed shared root ring',
    anchors=dict(anterior=[0, rings[0]['center'], front],
                 hard_soft=[0, join['center'], join_z],
                 soft_uvula=[0, back_y, back_z], uvula_tip=[0, tip_y, tip_z]),
    joins={name:[list(vertices[j*RING+k]) for k in range(RING)]
           for name, j in [('hard_soft', hard_join), ('soft_uvula', soft_join)]},
    vertices_before_split=len(vertices), faces_before_split=len(faces),
    paired_internal_join_triangles=internal_faces,
    sagittal_caps='Not baked; per-component closed section loops for runtime buildSectionGeometry and sectionOpacityPolicy',
    excursion_m=dict(raise_y=.006, raise_z=-.002, lower_y=-.006, lower_z=.002),
    source_soft_bounds=[list(map(min, zip(*soft_source))), list(map(max, zip(*soft_source)))])
(ASSETS/'teaching-palate-report.json').write_text(json.dumps(report, indent=2)+'\n')
print('TEACHING_PALATE', json.dumps({k: report[k] for k in ['meshes', 'anchors', 'vertices_before_split']}), flush=True)
