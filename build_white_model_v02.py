import bpy, math, os
from mathutils import Vector

OUT = '/Users/kevin/Documents/phonetic-head-blender/v02'
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
levels=[(-110,-27,42,35),(-85,-26,43,34),(-62,-27,45,35),(-48,-35,49,38),
(-37,-57,55,42),(-26,-70,61,48),(-15,-72,67,55),(-3,-69,71,60),
(7,-72,75,63),(14,-73,77,65),(20,-72,79,66),(26,-74,81,66),
(34,-72,83,67),(42,-75,84,67),(49,-86,85,66),(57,-94,86,65),
(66,-89,87,65),(77,-79,88,66),(89,-73,87,68),(103,-72,84,71),
(118,-69,79,73),(136,-60,69,69),(151,-43,51,56),(162,-19,27,32),(167,2,7,3)]
verts=[]; faces=[]; N=96
for z,front,back,w in levels:
    center=(front+back)/2; radius=(back-front)/2
    for j in range(N):
        a=2*math.pi*j/N
        x=center-radius*math.cos(a); y=w*math.sin(a)
        # Keep facial protrusions narrow while retaining cheek width.
        if math.cos(a)>0:
            c=math.cos(a)
            face_weight=math.exp(-((z-55)/75)**4)
            baseline=front
            if 34<=z<=103: baseline=-70
            flat=(back+baseline)/2-(back-baseline)/2*c**.53
            x=x*(1-face_weight)+flat*face_weight
            if 34<=z<=103: x+=(front-baseline)*math.exp(-(y/11)**2)*c
            # Supraorbital ridge, cheek eminence, orbital hollow, philtrum.
            x-=3.8*math.exp(-((abs(y)-30)/19)**2-((z-95)/5)**2)*c
            x-=4*math.exp(-((abs(y)-42)/16)**2-((z-62)/14)**2)*c
            x+=2.4*math.exp(-((abs(y)-29)/17)**2-((z-82)/11)**2)*c
            x+=1.6*math.exp(-(y/3)**2-((z-36)/6)**2)*c
        verts.append((x,y,z))
for r in range(len(levels)-1):
    for j in range(N): faces.append((r*N+j,r*N+(j+1)%N,(r+1)*N+(j+1)%N,(r+1)*N+j))
faces.extend([tuple(reversed(range(N))),tuple((len(levels)-1)*N+j for j in range(N))])
head=mesh('01 Head and neck - continuous surface',verts,faces,clay,2)
def ellipsoid(name, pos, radii, mat=clay):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=32,location=pos)
    o=bpy.context.object; o.name=name; o.scale=radii
    bpy.ops.object.transform_apply(location=True,rotation=False,scale=True)
    o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth=True
    o.select_set(False)
    return o

for side in [-1,1]:
    ala=ellipsoid('Nasal ala',(-74,side*9,51),(9,6,6))
    boolean(head,ala,'UNION'); bpy.data.objects.remove(ala,do_unlink=True)
tip=ellipsoid('Nasal tip',(-87,0,56),(7,7,6))
boolean(head,tip,'UNION'); bpy.data.objects.remove(tip,do_unlink=True)
nasal=profile('Nasal cavity cutting volume',[(-77,51),(-69,69),(-60,93),(-25,107),(18,103),(31,91),(32,60),(22,46),(-23,48),(-64,46)],18)
mouth=profile('Oral cavity cutting volume',[(-83,22),(-65,29),(-47,45),(-22,48),(6,45),(27,34),(33,7),(18,-20),(-15,-28),(-53,-13),(-72,10),(-83,13)],30)
pharynx=profile('Pharyngeal airway cutting volume',[(28,87),(42,79),(46,47),(47,12),(43,-16),(32,-44),(22,-60),(11,-53),(23,-26),(30,1),(29,35),(24,59)],17)
tracheal_void=profile('Tracheal lumen cutting volume',[(5,-45),(20,-45),(24,-67),(22,-113),(5,-113),(3,-72)],10)
esophageal_void=profile('Esophageal lumen cutting volume',[(35,-39),(42,-41),(45,-112),(35,-112)],7)
for cutter in [nasal,mouth,pharynx,tracheal_void,esophageal_void]:
    boolean(head,cutter); bpy.data.objects.remove(cutter,do_unlink=True)
for side in [-1,1]:
    socket=ellipsoid('Orbital hollow',(-65,side*31,85),(9,13,5.5))
    boolean(head,socket); bpy.data.objects.remove(socket,do_unlink=True)
    nostril=ellipsoid('Nostril',(-83,side*9,46),(6,3.6,3.3))
    boolean(head,nostril); bpy.data.objects.remove(nostril,do_unlink=True)
bpy.context.view_layer.objects.active=head
head.data.remesh_voxel_size=.65
bpy.ops.object.voxel_remesh()
mod=head.modifiers.new('Clay surface polish','SMOOTH'); mod.factor=.8; mod.iterations=5
bpy.ops.object.modifier_apply(modifier=mod.name)
mod=head.modifiers.new('Final surface normals','SUBSURF'); mod.levels=1
bpy.ops.object.modifier_apply(modifier=mod.name)
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

# Tapered vermilion volumes with cupid's bow and shared mouth corners.
for upper in [True,False]:
    vs=[]; fs=[]; rows=65; cols=20
    for i in range(rows):
        t=-1+2*i/(rows-1); y=t*27; fade=max(.025,1-t*t)**.7
        x=-76+10*t*t
        z=17+(4 if upper else -4)*fade
        if upper: z+=1.4*math.exp(-((abs(t)-.23)/.15)**2)-.7*math.exp(-(t/.12)**2)
        for j in range(cols):
            a=2*math.pi*j/cols
            vs.append((x-3.8*fade*math.cos(a),y,z+(2.8 if upper else 3.6)*fade*math.sin(a)))
    for i in range(rows-1):
        for j in range(cols): fs.append((i*cols+j,i*cols+(j+1)%cols,(i+1)*cols+(j+1)%cols,(i+1)*cols+j))
    fs.extend([tuple(reversed(range(cols))),tuple((rows-1)*cols+j for j in range(cols))])
    mesh('11 Upper lip vermilion' if upper else '11 Lower lip vermilion',vs,fs,clay,2)
for side in [-1,1]:
    ear=ellipsoid('12 Auricle '+str(side),(26,side*67,64),(12,7,23))
    concha=ellipsoid('Conchal bowl',(24,side*73,66),(7,5,14))
    boolean(ear,concha); bpy.data.objects.remove(concha,do_unlink=True)
    curve('13 Ear helix '+str(side),[(18,side*70,82),(28,side*74,85),(36,side*75,76),(36,side*75,59),(29,side*73,45),(22,side*70,45)],2.5,clay)
    curve('13 Ear antihelix '+str(side),[(26,side*72,51),(29,side*73,64),(23,side*72,75)],1.9,clay)
    ellipsoid('13 Tragus '+str(side),(17,side*71,61),(3,3,5))
    eye=ellipsoid('14 Visible eye surface '+str(side),(-56,side*31,85),(11.5,12,11.5),enamel)
    aperture=ellipsoid('Eyelid aperture',(-64,side*31,85),(16,12,4.3),enamel)
    boolean(eye,aperture,'INTERSECT'); bpy.data.objects.remove(aperture,do_unlink=True)
    for upper in [True,False]:
        coords=[]
        for i in range(19):
            t=-1+2*i/18; dy=t*12
            dz=(4.8 if upper else -3.2)*math.sin(math.pi*i/18)
            x=-56-math.sqrt(max(0,12.3**2-dy**2-dz**2))
            coords.append((x,side*(31+dy),85+dz))
        curve(('15 Upper eyelid ' if upper else '15 Lower eyelid ')+str(side),coords,1.1 if upper else .85,clay)

objects=[o for o in scene.objects if o.type=='MESH']
full=bpy.data.collections.new('A Complete white model'); scene.collection.children.link(full)
cut=bpy.data.collections.new('B Sagittal cutaway white model'); scene.collection.children.link(cut)
for o in objects:
    bpy.context.view_layer.objects.active=o; o.select_set(True)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True); o.select_set(False)
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
scene['review_status']='White model V02: refined face, nasal alae, orbital hollows, vermilion, auricles. Transverse dimensions inferred. Not anatomically validated. No articulation rig yet.'
scene['scale']='Coordinates in millimetres. Cranial top to chin approximately 200 mm.'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'phonetic-head-white-v02.blend'))
assert os.path.getsize(os.path.join(OUT,'phonetic-head-white-v02.blend'))>100000
print('WHITE_MODEL_COMPLETE',len(objects))
