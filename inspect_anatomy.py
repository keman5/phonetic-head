import bpy, os, json
from mathutils import Vector
root='/Users/kevin/Documents/phonetic-head-blender'
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for filename in ['VisceralSystem100.fbx','SkeletalSystem100.fbx','MuscularSystem100.fbx']:
    path=root+'/anatomy-source/Assets/Models/1.0 Models/'+filename
    if not os.path.isfile(path) or os.path.getsize(path)<10000: continue
    before=set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    rows=[]
    for o in set(bpy.data.objects)-before:
        if o.type!='MESH':continue
        corners=[o.matrix_world@Vector(v) for v in o.bound_box]
        lo=[min(v[i] for v in corners) for i in range(3)]
        hi=[max(v[i] for v in corners) for i in range(3)]
        rows.append(dict(name=o.name,lo=lo,hi=hi,verts=len(o.data.vertices)))
    with open(root+'/'+filename+'.json','w') as f:json.dump(rows,f,indent=2)
    print(filename,len(rows),flush=True)
bpy.ops.wm.save_as_mainfile(filepath=root+'/anatomy-import.blend')
