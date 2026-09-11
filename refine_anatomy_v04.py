import bpy, bmesh, os, json
from mathutils import Vector
ROOT='/Users/kevin/Documents/phonetic-head-blender'
OUT=ROOT+'/v04-refined-white';os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=ROOT+'/v03-anatomy-base/anatomical-head-white-v03.blend')
scene=bpy.context.scene
full=bpy.data.collections['01 Source anatomy - full head']
oldcut=bpy.data.collections['02 Sagittal cutaway - same source coordinates']
for o in list(oldcut.objects):bpy.data.objects.remove(o,do_unlink=True)
bpy.data.collections.remove(oldcut)
full.hide_viewport=False;full.hide_render=False
skin=bpy.data.collections['skin']; skin.hide_render=False;skin.hide_viewport=False
original_internal={o.name:[tuple(v.co) for v in o.data.vertices] for o in full.all_objects if o.type=='MESH' and o not in list(skin.objects)}
bpy.ops.object.select_all(action='DESELECT')
skin_parts=list(skin.objects)
for o in skin_parts:o.hide_set(False);o.select_set(True)
bpy.context.view_layer.objects.active=skin_parts[0]
bpy.ops.object.join();surface=bpy.context.object;surface.name='Skin - stitched atlas regions'
before=len(surface.data.vertices)
bm=bmesh.new();bm.from_mesh(surface.data)
bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0012)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(surface.data);bm.free()
after=len(surface.data.vertices)
mod=surface.modifiers.new('Surface refinement','SUBSURF');mod.levels=2;mod.render_levels=2
for p in surface.data.polygons:p.use_smooth=True
surface.select_set(False)

# Eye volumes are fitted additions, not represented as source scan anatomy.
eyes=bpy.data.collections.new('eyes - fitted white volumes');full.children.link(eyes)
eye_mat=bpy.data.materials.new('White sclera');eye_mat.diffuse_color=(.88,.88,.88,1)
for side in [-1,1]:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64,ring_count=40,location=(side*.030,-.070,1.591))
    o=bpy.context.object;o.name='Fitted eyeball '+('L' if side>0 else 'R');o.scale=(.0118,.0118,.0118)
    for c in list(o.users_collection):c.objects.unlink(o)
    eyes.objects.link(o);o.data.materials.append(eye_mat)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    for p in o.data.polygons:p.use_smooth=True
    o.select_set(False)

cut=bpy.data.collections.new('02 Refined sagittal cutaway');scene.collection.children.link(cut)
bpy.ops.object.select_all(action='DESELECT')
for o in list(full.all_objects):
    if o.type!='MESH':continue
    clone=o.copy();clone.data=o.data.copy();cut.objects.link(clone)
    clone.hide_set(False);clone.hide_render=False
    bpy.context.view_layer.objects.active=clone;clone.select_set(True)
    # Evaluate subdivision before slicing to keep the median plane flat.
    for mod in list(clone.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bisect(plane_co=(0,0,0),plane_no=(1,0,0),clear_inner=True,use_fill=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    for p in clone.data.polygons:
        if all(abs(clone.data.vertices[i].co.x)<1e-6 for i in p.vertices):p.use_smooth=False
    clone.select_set(False)
    if o.name in {'Nasopharynx','Oropharynx','Laryngopharynx'}:clone.hide_render=True;clone.hide_set(True)
cut.hide_render=True;cut.hide_viewport=True
cam=scene.camera;cam.data.ortho_scale=.31
scene.render.resolution_x=1600;scene.render.resolution_y=1600
def render(name,pos,target=(0,-.01,1.575)):
    cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=OUT+'/'+name+'.png';bpy.ops.render.render(write_still=True)
render('01-refined-surface',(-.48,-.7,1.64))
render('02-refined-front',(0,-.75,1.585))
render('03-refined-profile',(-.75,-.01,1.575))
full.hide_render=True;full.hide_viewport=True;cut.hide_render=False;cut.hide_viewport=False
render('04-refined-sagittal',(-.75,-.01,1.575))
render('05-refined-cutaway',(-.65,-.34,1.63))
full.hide_render=False;full.hide_viewport=False;cut.hide_render=True;cut.hide_viewport=True
cam.location=(-.48,-.7,1.64);cam.rotation_euler=(Vector((0,-.01,1.575))-cam.location).to_track_quat('-Z','Y').to_euler()
unchanged=all([tuple(v.co) for v in bpy.data.objects[n].data.vertices]==verts for n,verts in original_internal.items())
assert unchanged,'Internal source vertices changed'
scene['scope']='V04: weld source surface vertices within 1.2 mm; reversible subdivision x2; fitted white eyeballs; regenerated sagittal view. Internal source mesh vertices unchanged.'
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/anatomical-head-white-v04.blend',compress=True)
with open(OUT+'/validation.json','w') as f:json.dump(dict(skin_parts=len(skin_parts),vertices_before=before,vertices_after=after,internal_objects_checked=len(original_internal),internal_vertices_unchanged=unchanged,eyeballs='fitted approximation'),f,indent=2)
print('REFINEMENT_COMPLETE',before,after,unchanged)
