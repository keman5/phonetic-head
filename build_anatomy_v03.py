import bpy, json, re, os
from mathutils import Vector
ROOT='/Users/kevin/Documents/phonetic-head-blender'
OUT=ROOT+'/v03-anatomy-base'; os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=ROOT+'/anatomy-import.blend')
before=set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=ROOT+'/anatomy-source/Assets/Models/1.0 Models/Regions of human body100.fbx')
skin_names=[]
for o in set(bpy.data.objects)-before:
    if o.type!='MESH' or len(o.data.vertices)<12 or re.search(r'\.[ji](?:\d|$)',o.name):continue
    corners=[o.matrix_world@Vector(v) for v in o.bound_box]
    if min(v.z for v in corners)>1.30 and max(v.z for v in corners)>1.43 and 'hair' not in o.name.lower() and 'eyelash' not in o.name.lower():skin_names.append(o.name)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1
def mat(name,v):
    m=bpy.data.materials.new(name); m.diffuse_color=(v,v,v,1); return m
mats={'bone':mat('White bone',.82),'muscle':mat('White muscle',.65),'organ':mat('White organ',.75),'skin':mat('White skin',.8)}
full=bpy.data.collections.new('01 Source anatomy - full head'); scene.collection.children.link(full)
groups={}
for typ in mats:
    c=bpy.data.collections.new(typ); full.children.link(c); groups[typ]=c
vis={'Tongue','Soft palate','Uvula of palate','Gingiva','Epiglottis','Mucosa of nasal cavity','Nasopharynx','Oropharynx','Laryngopharynx','Trachea'}
names={name:'skin' for name in skin_names}
for filename,typ in [('VisceralSystem100','organ'),('SkeletalSystem100','bone'),('MuscularSystem100','muscle')]:
    for r in json.load(open(ROOT+'/'+filename+'.fbx.json')):
        name=r['name']
        if typ=='organ': good=name in vis
        else:
            good=r['lo'][2]>1.43 and r['verts']>100
            if typ=='bone': good=good and not re.search(r'\.(?:[oeij]|[oe]\d)',name)
            else: good=good and not re.search(r'\.[jioe](?:\d|[lr]|$)',name)
        if good: names[name]=typ
selected=[]
for o in list(bpy.data.objects):
    if o.type=='MESH' and o.name in names:
        mw=o.matrix_world.copy(); o.parent=None; o.matrix_world=mw
        for c in list(o.users_collection): c.objects.unlink(o)
        groups[names[o.name]].objects.link(o)
        o.hide_set(False); o.hide_viewport=False; o.hide_render=False
        o.data.materials.clear(); o.data.materials.append(mats[names[o.name]])
        for p in o.data.polygons:p.use_smooth=True
        selected.append(o)
    elif o.type=='MESH': bpy.data.objects.remove(o,do_unlink=True)
for o in list(bpy.data.objects):
    if o.type!='MESH':bpy.data.objects.remove(o,do_unlink=True)
for c in list(bpy.data.collections):
    if c not in [full,*groups.values()] and not c.objects and not c.children:bpy.data.collections.remove(c)

bpy.ops.object.select_all(action='DESELECT')
cut=bpy.data.collections.new('02 Sagittal cutaway - same source coordinates');scene.collection.children.link(cut)
for o in selected:
    o.data=o.data.copy()
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);o.select_set(False)
    # Trim the selected head/neck consistently without rescaling individual parts.
    o.select_set(True); bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bisect(plane_co=(0,0,1.43),plane_no=(0,0,1),clear_inner=True,use_fill=True)
    bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False)
    clone=o.copy();clone.data=o.data.copy();cut.objects.link(clone)
    bpy.context.view_layer.objects.active=clone;clone.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bisect(plane_co=(0,0,0),plane_no=(1,0,0),clear_inner=True,use_fill=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    for p in clone.data.polygons:
        if all(abs(clone.data.vertices[i].co.x)<1e-6 for i in p.vertices):p.use_smooth=False
    clone.select_set(False)
    # Pharynx source is a lumen envelope. Leave hidden to reveal passage boundaries.
    if o.name in {'Nasopharynx','Oropharynx','Laryngopharynx'}:clone.hide_render=True;clone.hide_set(True)
full.hide_render=True;full.hide_viewport=True
scene.render.engine='BLENDER_WORKBENCH'; sh=scene.display.shading
sh.light='STUDIO';sh.studio_light='paint.sl';sh.color_type='MATERIAL';sh.show_shadows=True
sh.show_cavity=True;sh.cavity_type='BOTH';sh.curvature_ridge_factor=1.1;sh.curvature_valley_factor=1.0
sh.show_object_outline=False;sh.background_type='WORLD';scene.world.color=(.16,.18,.21)
scene.render.resolution_x=1500;scene.render.resolution_y=1500;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='Standard'
bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='Review camera';scene.camera=cam
cam.data.type='ORTHO';cam.data.ortho_scale=.31;cam.data.clip_start=.001
def render(name,pos,target=(0,-.01,1.575)):
    cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=OUT+'/'+name+'.png';bpy.ops.render.render(write_still=True)
render('01-source-sagittal',(-.75,-.01,1.575))
render('02-source-cutaway',(-.65,-.34,1.63))
cut.hide_render=True;cut.hide_viewport=True;full.hide_render=False;full.hide_viewport=False
groups['skin'].hide_render=True
render('03-source-muscular-head',(-.48,-.7,1.64))
groups['skin'].hide_render=False
render('04-source-front',(0,-.75,1.585))
render('06-source-surface',(-.48,-.7,1.64))
groups['skin'].hide_render=True
for typ in ['muscle','organ']: groups[typ].hide_render=True
render('05-source-skull',(-.48,-.7,1.64))
for typ in ['muscle','organ']: groups[typ].hide_render=False
groups['skin'].hide_render=False
cam.location=(-.48,-.7,1.64);cam.rotation_euler=(Vector((0,-.01,1.575))-cam.location).to_track_quat('-Z','Y').to_euler()
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA'
scene['source']='Z-Anatomy / Gauthier Kervyn; LluisV/Z-Anatomy-Sample; commit b6da5cd4a98309b62ee9ffc7720c77a8e18cee40'
scene['license']='CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0/'
scene['scope']='Head-neck source selection including source skin regions, original spatial relationships; white materials; sagittal bisection.'
with open(OUT+'/included-structures.json','w') as f:json.dump({o.name:names[o.name] for o in selected},f,indent=2)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/anatomical-head-white-v03.blend',compress=True)
assert len(selected)>80
print('ANATOMY_BASE_READY',len(selected),flush=True)
