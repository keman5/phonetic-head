"""Read-only Blender topology audit and opaque ear reference renders."""
from pathlib import Path
import json
import bpy, bmesh
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'interactive-lab/dist/assets'
OUT = ROOT / 'interactive-lab/qa/ear-geometry-evidence'

def ear(v):
    x, y, z = v.co
    return abs(x) > .060 and -.035 < y < .045 and 1.53 < z < 1.64

def audit(obj):
    bm = bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-7)
    bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    remaining = set(bm.faces); components = []
    while remaining:
        seed = remaining.pop(); faces = {seed}; todo = [seed]
        while todo:
            f = todo.pop()
            for e in f.edges:
                for other in e.link_faces:
                    if other in remaining:
                        remaining.remove(other); faces.add(other); todo.append(other)
        verts = {v for f in faces for v in f.verts}
        edges = {e for f in faces for e in f.edges}
        components.append(dict(vertices=len(verts), faces=len(faces), chi=len(verts)-len(edges)+len(faces),
            bounds=[[min(v.co[i] for v in verts),max(v.co[i] for v in verts)] for i in range(3)]))
    result = dict(name=obj.name,vertices=len(bm.verts),faces=len(bm.faces),components=components,
        morphs=[k.name for k in obj.data.shape_keys.key_blocks],
        ear_boundary_edges=sum(e.is_boundary and any(ear(v) for v in e.verts) for e in bm.edges),
        ear_nonmanifold_edges=sum(len(e.link_faces)>2 and any(ear(v) for v in e.verts) for e in bm.edges),
        ear_inconsistent_winding_edges=sum(e.is_manifold and not e.is_contiguous and any(ear(v) for v in e.verts) for e in bm.edges))
    bm.free()
    return result

def render(parts, suffix, views=('front','side','back')):
    scene=bpy.context.scene
    scene.render.engine='CYCLES'; scene.cycles.samples=24
    scene.render.resolution_x=900; scene.render.resolution_y=900; scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('Ear audit world'); scene.world.use_nodes=True
    scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.25,.30,.36,1)
    mat=bpy.data.materials.new('Opaque diagnostic clay'); mat.diffuse_color=(.55,.28,.12,1)
    mat.use_nodes=True; shader=mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(.55,.28,.12,1); shader.inputs['Roughness'].default_value=.75
    for obj in parts:
        obj.matrix_world=Matrix.Identity(4)
        obj.data.materials.clear(); obj.data.materials.append(mat)
    for location,energy,size in [((0,-.5,1.9),30,.3),((.4,.2,1.8),20,.2)]:
        data=bpy.data.lights.new('Diagnostic softbox','AREA'); data.energy=energy; data.shape='DISK'; data.size=size
        light=bpy.data.objects.new(data.name,data); scene.collection.objects.link(light); light.location=location
        light.rotation_euler=(Vector((0,0,1.58))-light.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Ear audit'); camera=bpy.data.objects.new('Ear audit',data); scene.collection.objects.link(camera)
    scene.camera=camera; data.type='ORTHO'; data.ortho_scale=.092
    for side in [-1,1]:
        target=Vector((side*.077,.003,1.583))
        for view,offset in [('front',(side*.12,-.5,.025)),('side',(side*.5,-.08,.025)),('back',(side*.15,.5,.025))]:
            if view not in views: continue
            camera.location=target+Vector(offset); camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
            scene.render.filepath=str(OUT/f'{suffix}-{side}-{view}.png'); bpy.ops.render.render(write_still=True)

if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ASSETS/'refined-lips.glb'))
    parts=[o for o in bpy.data.objects if o.type=='MESH']
    results=[audit(o) for o in parts]
    (OUT/'source-audit.json').write_text(json.dumps(results,indent=2)+'\n')
    print('EAR_AUDIT',json.dumps(results),flush=True)
    render(parts,'source')
