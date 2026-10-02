"""Subdivide both halves together, transferring every authored pose identically.

The source GLB is immutable. Independent moving organs stay independent: a tongue
must not be welded to the palate just to hide a normal anatomical separation.
Run with Blender --background --python refine_articulators.py.
"""
from pathlib import Path
import bpy, bmesh, json, hashlib

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'interactive-lab/dist/assets'
SOURCE = ASSETS / 'phonetic-head.glb'
NAMES = ['Tongue', 'Soft palate', 'Uvula of palate', 'Gingiva']
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
outputs, reports = [], []
for name in NAMES:
    parts = [o for o in bpy.data.objects if o.type == 'MESH' and o.get('anatomyName') == name]
    assert len(parts) == 2, (name, len(parts))
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    source = bpy.context.object
    bm = bmesh.new(); bm.from_mesh(source.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.000001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(source.data); bm.free()
    if source.data.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    before = len(source.data.vertices)
    keys = list(source.data.shape_keys.key_blocks)[1:] if source.data.shape_keys else []
    for key in keys:
        key.value = 0
    sub = source.modifiers.new('Continuous teaching surface', 'SUBSURF')
    sub.levels = sub.render_levels = 2 if name == 'Tongue' else 1
    def evaluated_mesh():
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        return bpy.data.meshes.new_from_object(source.evaluated_get(dg), depsgraph=dg)
    base = evaluated_mesh()
    refined = bpy.data.objects.new(name + ' smooth', base)
    bpy.context.collection.objects.link(refined)
    refined.matrix_world = source.matrix_world.copy()
    refined.shape_key_add(name='Basis')
    for key in keys:
        key.value = 1
        evaluated = evaluated_mesh()
        assert len(evaluated.vertices) == len(base.vertices)
        target = refined.shape_key_add(name=key.name)
        for v in evaluated.vertices:
            target.data[v.index].co = v.co
        bpy.data.meshes.remove(evaluated)
        key.value = 0
    for side, positive in [('left', True), ('right', False)]:
        o = refined.copy(); o.data = refined.data.copy()
        bpy.context.collection.objects.link(o)
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            dist=1e-7, plane_co=(0,0,0), plane_no=(1,0,0),
            clear_inner=positive, clear_outer=not positive)
        bm.to_mesh(o.data); bm.free(); o.data.update()
        for polygon in o.data.polygons:
            polygon.use_smooth = True
        o.name = name + ' smooth__' + side
        o['anatomyName'] = name; o['side'] = side; o['layer'] = 'organ'; o['lumen'] = False
        o['surfaceRefined'] = True
        outputs.append(o)
    reports.append(dict(name=name, vertices_before=before, vertices_after=len(base.vertices),
        subdivision_levels=sub.levels, morphs=[key.name for key in keys]))
    bpy.data.objects.remove(source, do_unlink=True)
    bpy.data.objects.remove(refined, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for o in outputs:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ASSETS/'smooth-articulators.glb'), export_format='GLB',
    use_selection=True, export_extras=True, export_animations=False, export_morph=True,
    export_morph_normal=True, export_yup=True, export_cameras=False, export_lights=False)
report = dict(source_sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(), organs=reports,
    method='Join and weld sagittal halves before subdivision; evaluate identical topology for every shape key; split after refinement.')
(ASSETS/'articulator-repair-report.json').write_text(json.dumps(report, indent=2)+'\n')
print('ARTICULATORS_REFINED', json.dumps(report), flush=True)
