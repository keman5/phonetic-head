"""Read-only geometry diagnostics for the surface repair workflow."""
from pathlib import Path
import bpy, bmesh, json

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'interactive-lab/dist/assets'
bpy.ops.wm.read_factory_settings(use_empty=True)
for asset in ['phonetic-head.glb', 'repaired-skin.glb']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ASSETS / asset))
    skins = [o for o in bpy.data.objects if o.type == 'MESH' and o.get('layer') == 'skin']
    bpy.ops.object.select_all(action='DESELECT')
    for o in skins:
        o.select_set(True)
    bpy.context.view_layer.objects.active = skins[0]
    bpy.ops.object.join()
    o = bpy.context.object
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
    boundary = {e for e in bm.edges if e.is_boundary}
    loops = []
    while boundary:
        pending = [boundary.pop()]; edges = []
        while pending:
            edge = pending.pop(); edges.append(edge)
            for v in edge.verts:
                for neighbor in v.link_edges:
                    if neighbor in boundary:
                        boundary.remove(neighbor); pending.append(neighbor)
        verts = {v for e in edges for v in e.verts}
        loops.append(dict(edges=len(edges), bounds=[[round(f(v.co[i] for v in verts),5) for i in range(3)] for f in [min,max]]))
    print('SURFACE_AUDIT', json.dumps(dict(asset=asset, vertices=len(bm.verts), faces=len(bm.faces), nonmanifold=sum(not e.is_manifold for e in bm.edges), loops=sorted(loops,key=lambda l:-l['edges'])[:25])), flush=True)
    bm.free()
