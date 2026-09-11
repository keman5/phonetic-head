import bpy,bmesh,os,json,math
from mathutils import Vector
ROOT='/Users/kevin/Documents/phonetic-head-blender'
OUT=ROOT+'/interactive-lab/dist/assets'
bpy.ops.wm.open_mainfile(filepath=ROOT+'/v04-refined-white/anatomical-head-white-v04.blend')
scene=bpy.context.scene
full=bpy.data.collections['01 Source anatomy - full head']
sources=[o for o in full.all_objects if o.type=='MESH']
for c in bpy.data.collections:c.hide_viewport=False;c.hide_render=False
types=json.load(open(ROOT+'/v03-anatomy-base/included-structures.json'))
dg=bpy.context.evaluated_depsgraph_get()
copies=[]
for o in sources:
    kind='skin' if o.name.startswith('Skin -') else 'eye' if 'eyeball' in o.name else types.get(o.name,'organ')
    data=bpy.data.meshes.new_from_object(o.evaluated_get(dg),depsgraph=dg)
    data.transform(o.matrix_world)
    for side,positive in [('left',True),('right',False)]:
        bm=bmesh.new();bm.from_mesh(data)
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.0000001,plane_co=(0,0,0),plane_no=(1,0,0),clear_inner=positive,clear_outer=not positive)
        if not bm.faces:bm.free();continue
        mesh=bpy.data.meshes.new(o.name+'_'+side);bm.to_mesh(mesh);bm.free()
        if not mesh.polygons:continue
        obj=bpy.data.objects.new(o.name+'__'+side,mesh);scene.collection.objects.link(obj)
        obj['anatomyName']=o.name;obj['layer']=kind;obj['side']=side
        obj['lumen']=o.name in ['Nasopharynx','Oropharynx','Laryngopharynx']
        # Remove imported material slots; use opaque colors in Blender, runtime owns alpha.
        mesh.materials.clear();mat=bpy.data.materials.get('Web '+kind)
        if not mat:
            mat=bpy.data.materials.new('Web '+kind);mat.diffuse_color={'skin':(.8,.78,.74,1),'muscle':(.66,.28,.26,1),'bone':(.86,.84,.77,1),'organ':(.72,.39,.43,1),'eye':(.9,.9,.9,1)}[kind]
        mesh.materials.append(mat)
        for p in mesh.polygons:p.use_smooth=True;p.material_index=0
        copies.append(obj)
    bpy.data.meshes.remove(data)
for o in list(bpy.data.objects):
    if o not in copies:bpy.data.objects.remove(o,do_unlink=True)

def smooth(a,b,v):
    t=max(0,min(1,(v-a)/(b-a)));return t*t*(3-2*t)
def deform(name,kind,key,v):
    x,y,z=v;dx=dy=dz=0
    tongue=name=='Tongue' or 'Genioglossus' in name or 'Hyoglossus' in name
    jaw=name=='Mandible' or name.startswith('Lower ')
    mouthw=math.exp(-((y+.09)/.024)**2-((z-1.535)/.018)**2)*max(0,1-(abs(x)/.049)**4)
    if key=='JawOpen':
        w=1 if jaw else 0
        if kind=='skin':w=(1-smooth(1.521,1.545,z))*smooth(-.014,-.08,y)*smooth(1.46,1.50,z)
        if tongue:w=.35*smooth(1.499,1.52,z)
        if kind=='muscle' and any(k in name.lower() for k in ['masseter','pterygoid','digastric','mylohyoid','orbicularis oris','depressor']):w=1-smooth(1.515,1.565,z)
        if name=='Gingiva':w=1-smooth(1.522,1.531,z)
        a=.12*w;yy=y+.008;zz=z-1.557
        dy=yy*math.cos(a)-zz*math.sin(a)-yy;dz=yy*math.sin(a)+zz*math.cos(a)-zz
    if tongue:
        anchor=smooth(1.503,1.523,z)
        front=1-smooth(-.066,-.040,y)
        if key=='TipForward':dy=-.016*front*anchor;dz=.003*front*anchor
        if key=='FrontHigh':dz=.009*front*anchor;dy=-.002*anchor
        if key=='BackSeal':dz=.007*(1-front)*anchor;dy=.0015*(1-front)*anchor
    if key=='VelumRaise' and (name in ['Soft palate','Uvula of palate'] or 'Palatopharyngeus' in name):
        w=smooth(-.045,-.016,y)*smooth(1.525,1.54,z);dz=.006*w;dy=.002*w
    if kind=='skin' or 'Orbicularis oris' in name or any(k in name for k in ['Risorius','Zygomaticus','Levator labii','Depressor labii']):
        if key=='LipClose':dz=(1.534-z)*mouthw*.6;dy=-.0015*mouthw
        if key=='LipSpread':dx=x*.20*mouthw;dz=.0015*mouthw
    if key=='Voice' and any(k in name.lower() for k in ['thyro-arytenoid','crico-arytenoid','arytenoid cartilage','transverse arytenoid']):dx=-x*.16
    return (x+dx,y+dy,z+dz)

keys=['JawOpen','TipForward','FrontHigh','BackSeal','VelumRaise','LipClose','LipSpread','Voice']
counts={};stats=[]
for obj in copies:
    name=obj['anatomyName'];kind=obj['layer'];base=[tuple(v.co) for v in obj.data.vertices]
    # Static structures need no morph buffers.
    targets={}
    for key in keys:
        changed=[deform(name,kind,key,v) for v in base]
        if any(sum((a-b)**2 for a,b in zip(p,q))>1e-14 for p,q in zip(base,changed)):targets[key]=changed
    if targets:
        obj.shape_key_add(name='Basis')
        for key,verts in targets.items():
            sk=obj.shape_key_add(name=key)
            for v,co in zip(sk.data,verts):v.co=co
            counts[key]=counts.get(key,0)+1
    # Translate all meshes to a local origin while retaining physical metre units.
    obj.location.z=-1.55
    stats.append(dict(name=name,side=obj['side'],layer=kind,vertices=len(base),targets=list(targets)))
bpy.ops.object.select_all(action='DESELECT')
for o in copies:o.hide_set(False);o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT+'/phonetic-head.glb',export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_morph=True,export_morph_normal=False,export_morph_tangent=False,export_yup=True,export_cameras=False,export_lights=False)
with open(OUT+'/model-manifest.json','w') as f:json.dump(dict(source='Z-Anatomy via local V04',license='CC BY-SA 4.0',units='metres',sides='anatomical left +X; right -X',morphs=counts,meshes=stats,notice='Anatomical source base; authored educational deformations, not biomechanical simulation.'),f,indent=2)
assert all(counts.get(k,0)>0 for k in keys)
assert os.path.getsize(OUT+'/phonetic-head.glb')>100000
print('EXPORT_COMPLETE',len(copies),counts,os.path.getsize(OUT+'/phonetic-head.glb'),flush=True)
