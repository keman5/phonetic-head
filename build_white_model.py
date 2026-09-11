import bpy, math, os
from mathutils import Vector

OUT = '/Users/kevin/Documents/phonetic-head-blender'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = .001

def material(name, value):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (value, value, value, 1)
    return m
clay = material('Ivory white clay', .78)
organ = material('Organ white clay', .66)
enamel = material('Enamel white', .93)

def mesh(name, verts, faces, mat=clay, sub=1):
    data=bpy.data.meshes.new(name); data.from_pydata(verts, [], faces); data.update()
    obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for p in data.polygons: p.use_smooth=True
    bpy.context.view_layer.objects.active=obj; obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
    if sub:
        mod=obj.modifiers.new('Surface continuity','SUBSURF'); mod.levels=sub
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)
    return obj

def profile(name, points, width, mat=organ):
    # Smooth closed sagittal outline expanded into a rounded volume.
    # Reference establishes sagittal shape; transverse widths are provisional.
    pts=[]; n=len(points)
    for i in range(n):
        a,b,c,d=[Vector(points[j%n]) for j in (i-1,i,i+1,i+2)]
        for k in range(6):
            t=k/6
            pts.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
    center=sum(pts,Vector((0,0)))/len(pts)
    verts=[]; rings=[(-.995,.08),(-.92,.52),(-.65,.88),(0,1),(.65,.88),(.92,.52),(.995,.08)]
    for y,s in rings:
        for p in pts:
            q=center+(p-center)*s; verts.append((q.x,y*width,q.y))
    n=len(pts); faces=[]
    for r in range(len(rings)-1):
        for j in range(n): faces.append((r*n+j,r*n+(j+1)%n,(r+1)*n+(j+1)%n,(r+1)*n+j))
    faces += [tuple(reversed(range(n))),tuple((len(rings)-1)*n+j for j in range(n))]
    return mesh(name,verts,faces,mat)

def boolean(obj, cutter, op='DIFFERENCE'):
    bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('Anatomical cavity','BOOLEAN'); mod.operation=op; mod.object=cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)

# Millimetres; nose faces negative X, Z is cranial, Y is transverse.
# Horizontal contours form a continuous cranium, forehead, nose, lips, chin and neck.
levels=[(-110,-25,48,38),(-85,-27,48,38),(-62,-30,49,39),(-48,-38,53,44),
(-37,-59,62,48),(-26,-72,68,55),(-15,-73,72,62),(-3,-70,76,67),
(7,-76,78,69),(14,-78,79,69),(20,-72,80,68),(26,-79,81,68),
(34,-74,82,68),(42,-73,83,67),(49,-93,84,65),(57,-97,85,65),
(66,-89,85,64),(77,-75,85,65),(89,-69,84,68),(103,-73,81,72),
(118,-74,76,74),(136,-65,64,67),(151,-43,44,49),(162,-10,12,10)]
verts=[]; faces=[]; N=96
for z,front,back,w in levels:
    center=(front+back)/2; radius=(back-front)/2
    for j in range(N):
        a=2*math.pi*j/N
        x=center-radius*math.cos(a); y=w*math.sin(a)
        # Keep facial protrusions narrow while retaining cheek width.
        if -15<z<103:
            base=-64; protrude=front-base
            x=(base+back)/2-(back-base)/2*math.cos(a)+protrude*max(0,math.cos(a))**8
        verts.append((x,y,z))
for r in range(len(levels)-1):
    for j in range(N): faces.append((r*N+j,r*N+(j+1)%N,(r+1)*N+(j+1)%N,(r+1)*N+j))
faces.extend([tuple(reversed(range(N))),tuple((len(levels)-1)*N+j for j in range(N))])
head=mesh('01 Head and neck - continuous surface',verts,faces,clay,2)
nasal=profile('Nasal cavity cutting volume',[(-84,51),(-74,69),(-64,93),(-25,107),(18,103),(31,91),(32,60),(22,46),(-23,48),(-64,46)],25)
mouth=profile('Oral cavity cutting volume',[(-83,26),(-63,35),(-47,45),(-22,48),(6,45),(27,34),(33,7),(18,-20),(-15,-28),(-53,-13),(-77,6)],32)
pharynx=profile('Pharyngeal airway cutting volume',[(28,87),(42,79),(46,47),(47,12),(43,-16),(32,-44),(22,-60),(11,-53),(23,-26),(30,1),(29,35),(24,59)],17)
tracheal_void=profile('Tracheal lumen cutting volume',[(5,-45),(20,-45),(24,-67),(22,-113),(5,-113),(3,-72)],10)
esophageal_void=profile('Esophageal lumen cutting volume',[(35,-39),(42,-41),(45,-112),(35,-112)],7)
for cutter in [nasal,mouth,pharynx,tracheal_void,esophageal_void]:
    boolean(head,cutter); bpy.data.objects.remove(cutter,do_unlink=True)
bpy.context.view_layer.objects.active=head
head.data.remesh_voxel_size=1.1
bpy.ops.object.voxel_remesh()
for p in head.data.polygons: p.use_smooth=True

tongue=profile('02 Tongue - tip dorsum root', [(-62,8),(-49,12),(-30,21),(-9,25),(10,24),(22,14),(26,-2),(23,-22),(8,-37),(-11,-32),(-27,-17),(-48,-8),(-59,-4)],25)
palate=profile('03 Soft palate and uvula', [(-1,45),(13,44),(25,37),(32,27),(31,18),(27,19),(24,29),(12,35),(-2,38)],20)
hard=profile('04 Hard palate', [(-63,36),(-46,46),(-24,51),(-1,47),(-1,41),(-25,44),(-46,41),(-61,30)],26,enamel)
epiglottis=profile('05 Epiglottis leaf',[(22,-25),(25,-27),(23,-38),(13,-49),(6,-46),(13,-40),(18,-31)],9)
larynx=profile('06 Laryngeal cartilage',[(1,-44),(12,-52),(25,-50),(30,-61),(24,-76),(5,-76),(-2,-62)],15)
lumen=profile('Laryngeal lumen',[(8,-52),(19,-53),(20,-74),(9,-76)],9)
boolean(larynx,lumen); bpy.data.objects.remove(lumen,do_unlink=True)

def curve(name, coords, radius, mat=organ):
    data=bpy.data.curves.new(name,'CURVE'); data.dimensions='3D'; data.bevel_depth=radius; data.bevel_resolution=4
    s=data.splines.new('BEZIER'); s.bezier_points.add(len(coords)-1)
    for b,p in zip(s.bezier_points,coords): b.co=p; b.handle_left_type='AUTO'; b.handle_right_type='AUTO'
    obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj); obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active=obj; obj.select_set(True); bpy.ops.object.convert(target='MESH'); obj.select_set(False)
    return obj

for side in [-1,1]:
    curve('07 Vocal fold '+str(side),[(8,side*2,-61),(14,side*3.5,-61),(22,side*6,-60)],1.4,enamel)
for i in range(6):
    z=-78-i*6
    curve('08 Tracheal cartilage %02d'%i,[(14+11*math.cos(a),12*math.sin(a),z) for a in [math.pi*.2+j*math.pi*1.6/24 for j in range(25)]],1.5,enamel)

# Individual teeth follow a U-shaped arcade, not a rectangular bar.
for upper,z in [(True,27),(False,2)]:
    for side in [-1,1]:
        for i in range(7):
            a=.1+i*.205; x=-60+36*(1-math.cos(a)); y=side*30*math.sin(a)
            bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,z))
            o=bpy.context.object; o.name=('09 Upper' if upper else '10 Lower')+' tooth '+str(side)+' '+str(i)
            o.dimensions=(7 if i<3 else 10,6.3 if i<3 else 8,11 if i<3 else 8); o.rotation_euler.z=-side*a
            bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
            mod=o.modifiers.new('Rounded crown','BEVEL'); mod.width=1.8; mod.segments=3; bpy.ops.object.modifier_apply(modifier=mod.name)
            o.data.materials.append(enamel); o.select_set(False)

# Lips, ears and eyelids on both sides; kept separate for subsequent refinement.
for z in [26,8]:
    curve('11 Lip '+str(z),[(-67,-27,z),(-76,-14,z+1),(-79,0,z),(-76,14,z+1),(-67,27,z)],3.3,clay)
for side in [-1,1]:
    curve('12 Ear helix '+str(side),[(28,side*68,77),(39,side*76,77),(45,side*79,65),(41,side*80,47),(33,side*75,43),(27,side*71,55),(28,side*68,77)],4,clay)
    curve('13 Ear antihelix '+str(side),[(34,side*75,51),(37,side*77,62),(33,side*73,69)],2.5,clay)
    curve('14 Upper eyelid '+str(side),[(-61,side*24,89),(-65,side*34,93),(-57,side*45,89)],2,clay)
    curve('15 Lower eyelid '+str(side),[(-61,side*24,89),(-62,side*34,86),(-57,side*45,89)],1.4,clay)

objects=[o for o in scene.objects if o.type=='MESH']
full=bpy.data.collections.new('A Complete white model'); scene.collection.children.link(full)
cut=bpy.data.collections.new('B Sagittal cutaway white model'); scene.collection.children.link(cut)
for o in objects:
    for c in list(o.users_collection): c.objects.unlink(o)
    full.objects.link(o)
    copy=o.copy(); copy.data=o.data.copy(); cut.objects.link(copy)
    bpy.context.view_layer.objects.active=copy; copy.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bisect(plane_co=(0,0,0),plane_no=(0,1,0),clear_inner=True,use_fill=True)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    for p in copy.data.polygons:
        if all(abs(copy.data.vertices[i].co.y)<.01 for i in p.vertices): p.use_smooth=False
    copy.select_set(False)
full.hide_render=True; full.hide_viewport=True

scene.render.engine='BLENDER_WORKBENCH'
sh=scene.display.shading; sh.light='STUDIO'; sh.studio_light='paint.sl'; sh.studiolight_rotate_z=.4; sh.color_type='MATERIAL'
sh.show_shadows=True; sh.show_cavity=True; sh.cavity_type='BOTH'; sh.curvature_ridge_factor=1.3; sh.curvature_valley_factor=1.1
sh.show_object_outline=False; sh.background_type='WORLD'; scene.world.color=(.16,.18,.21)
scene.render.resolution_x=1400; scene.render.resolution_y=1400; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.view_settings.view_transform='Standard'
bpy.ops.object.camera_add(); cam=bpy.context.object; cam.name='Review Camera'; scene.camera=cam; cam.data.type='ORTHO'; cam.data.ortho_scale=320
def render(name,pos,target=(0,0,23)):
    cam.location=pos; cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=os.path.join(OUT,name+'.png'); bpy.ops.render.render(write_still=True)
render('01-sagittal-white', (0,-650,23))
render('02-cutaway-three-quarter',(-280,-600,155))
cut.hide_render=True; cut.hide_viewport=True; full.hide_render=False; full.hide_viewport=False
render('03-head-three-quarter',(-370,-560,125))
render('04-head-front',(-650,0,30))
full.hide_render=True; full.hide_viewport=True; cut.hide_render=False; cut.hide_viewport=False
cam.location=(0,-650,23); cam.rotation_euler=(Vector((0,0,23))-cam.location).to_track_quat('-Z','Y').to_euler()
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
scene['review_status']='White model V01: sagittal reference guided; transverse dimensions inferred. Not anatomically validated. No articulation rig yet.'
scene['scale']='Coordinates in millimetres. Cranial top to chin approximately 200 mm.'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'phonetic-head-white-v01.blend'))
assert os.path.getsize(os.path.join(OUT,'phonetic-head-white-v01.blend'))>100000
print('WHITE_MODEL_COMPLETE',len(objects))
