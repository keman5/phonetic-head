"""Sculpt two distinct classic-animation head proportions, with editable phonetic morphs.
Blender --background --python build_character_heads.py
"""
from pathlib import Path
import bpy,bmesh,math,json,sys
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
from articulation import KEYS,extra_deform,author_vowel_actions
bpy.ops.wm.read_factory_settings(use_empty=True)
parts=[]
DARK='#171b24';MICKEY_FACE='#ffe5ba';WHITE='#f7f4e9';BLUE='#7388a1';PINK='#e898ab'

def mat(color):
 m=bpy.data.materials.get(color)
 if m:return m
 m=bpy.data.materials.new(color)
 srgb=[int(color[i:i+2],16)/255 for i in (1,3,5)]
 rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in srgb]
 m.diffuse_color=(*rgb,1);m.use_nodes=True
 bsdf=m.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(*rgb,1);bsdf.inputs['Roughness'].default_value=.85
 return m

def register(o,name,color,feature='surface',layer='skin',anatomy=None):
 o.name=name;o.data.materials.clear();o.data.materials.append(mat(color));o['color']=color;o['feature']=feature;o['layer']=layer;o['anatomyName']=anatomy or 'Character '+name
 if o not in parts:parts.append(o)
 o.data.polygons.foreach_set('use_smooth',[True]*len(o.data.polygons));return o

def active(o):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o

def ellipsoid(name,pos,scale,color,feature='surface',tilt=0,layer='skin',anatomy=None):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=64,ring_count=40,location=pos)
 o=bpy.context.object;o.scale=scale;o.rotation_euler.y=tilt
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 return register(o,name,color,feature,layer,anatomy)

def curve_points(points,steps=10):
 out=[];n=len(points)
 for i in range(n):
  p0,p1,p2,p3=[Vector(points[j%n]) for j in (i-1,i,i+1,i+2)]
  for k in range(steps):
   t=k/steps;out.append(tuple(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)))
 return out

def patch(name,outline,color,front,back,feature='surface',steps=8,rings=18):
 """Closed, smoothly domed freeform patch; front/back are functions of x,z,r."""
 boundary=curve_points(outline,steps);n=len(boundary);cx=sum(p[0] for p in boundary)/n;cz=sum(p[1] for p in boundary)/n
 verts=[];faces=[]
 for facefun in [front,back]:
  start=len(verts);verts.append((cx,facefun(cx,cz,0),cz))
  for j in range(1,rings+1):
   r=j/rings
   for x,z in boundary:
    xx=cx+(x-cx)*r;zz=cz+(z-cz)*r;verts.append((xx,facefun(xx,zz,r),zz))
  for i in range(n):faces.append((start,start+1+i,start+1+(i+1)%n))
  for j in range(1,rings):
   a=start+1+(j-1)*n;b=a+n
   for i in range(n):faces.append((a+i,b+i,b+(i+1)%n,a+(i+1)%n))
 # Connect front and rear edge rings. Recalculate consistent outward normals below.
 off=1+rings*n;a=1+(rings-1)*n;b=a+off
 for i in range(n):faces.append((a+i,a+(i+1)%n,b+(i+1)%n,b+i))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
 o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
 return register(o,name,color,feature)

def tube(name,points,color=DARK,radius=.00085,feature='detail'):
 curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=radius;curve.bevel_resolution=3;curve.resolution_u=16
 spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
 for p,co in zip(spline.bezier_points,points):p.co=co;p.handle_left_type=p.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);active(o);bpy.ops.object.convert(target='MESH')
 return register(bpy.context.object,name,color,feature)

def fuse(objects,name,color,voxel=.00065):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True);parts.remove(o)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object
 o.data.remesh_voxel_size=voxel;bpy.ops.object.voxel_remesh()
 mod=o.modifiers.new('Sculpt transition','SMOOTH');mod.factor=.65;mod.iterations=4;bpy.ops.object.modifier_apply(modifier=mod.name)
 dec=o.modifiers.new('Interactive mesh budget','DECIMATE');dec.ratio=min(1,16000/len(o.data.vertices));dec.use_collapse_triangulate=True
 bpy.ops.object.modifier_apply(modifier=dec.name)
 return register(o,name,color)

def mouth_opening(objects,character):
 # A curved smile opening, not a horizontal saw-cut or a row of human teeth.
 w=.047 if character=='mickey' else .042
 outline=[(-w,1.560),(-w*.60,1.553),(0,1.551),(w*.60,1.553),(w,1.560),(w*.72,1.544),(w*.38,1.534),(0,1.531),(-w*.38,1.534),(-w*.72,1.544)]
 cutter=patch('Smile cutter',outline,DARK,lambda x,z,r:-.150,lambda x,z,r:.007,steps=5,rings=1)
 for o in objects:
  active(o);mod=o.modifiers.new('Sculpted smile opening','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter;mod.solver='EXACT'
  bpy.ops.object.modifier_apply(modifier=mod.name)
 parts.remove(cutter);bpy.data.objects.remove(cutter,do_unlink=True)
 outline=[(x*.97,1.548+(z-1.548)*.97) for x,z in outline]
 patch('Mouth cavity',outline,'#422333',lambda x,z,r:-.062,lambda x,z,r:.004,feature='mouth',rings=3)
 tongue=ellipsoid('Tongue',(0,-.069,1.538),(.022,.031,.0065),'#ef758a','tongue',layer='organ',anatomy='Tongue')
 ellipsoid('Soft palate',(0,-.032,1.562),(.026,.022,.0035),'#c79fcf','palate',layer='organ',anatomy='Soft palate')
 for side in [-1,1]:
  ellipsoid('Vocal fold',(side*.0035,.002,1.499),(.003,.012,.0025),'#e898ab','voice',layer='organ',anatomy='Character vocal fold')
 # Thin drawn corner accents follow the same deformation as the smile.
 for side in [-1,1]:tube('Smile corner',[(side*w*.91,-.072,1.558),(side*w*1.03,-.065,1.562),(side*w*1.08,-.06,1.564)],DARK,.0007,'mouth')

def clamp(t):return max(0,min(1,t))
def smooth(a,b,v):
 t=clamp((v-a)/(b-a));return t*t*(3-2*t)

def add_motion(o):
 name=o['feature'];base=[v.co.copy() for v in o.data.vertices];targets={}
 if name in ['ear','eye','pupil','brow','hair','stand','nose','whisker']:return
 for key in KEYS:
  result=[]
  for v in base:
   x,y,z=v;dx=dy=dz=0
   front=smooth(-.024,-.059,y)
   lower=(1-smooth(1.544,1.562,z))*smooth(1.489,1.521,z)*front
   mouth=math.exp(-((z-1.547)/.032)**2)*front*max(0,1-(abs(x)/.065)**4)
   if key=='JawOpen':dz=-.017*lower;dy=.003*lower
   if key=='LipClose':
    span=.047 if character=='mickey' else .042
    u=min(1,abs(x)/span)
    seal_height=1.551+.010*u*u
    lower_rim=1.531+.027*u**1.8
    if name in ['mouth','tongue']:dz=(seal_height-z)*.995;dy=.010 if name=='tongue' else 0
    else:
     seal=smooth(0,-.035,y)*(1-smooth(span,span+.012,abs(x)))*smooth(lower_rim-.009,lower_rim,z)
     dz=max(0,seal_height-z)*seal if z<seal_height else 0
   if key=='LipSpread':dx=x*.16*mouth
   if name=='tongue':
    tip=1-smooth(-.084,-.048,y)
    if key=='TipForward':dy=-.018*tip;dz=.004*tip
    if key=='FrontHigh':dz=.010*tip
    if key=='BackSeal':dz=.014*(1-tip)
   if name=='palate' and key=='VelumRaise':dz=.003*(1-smooth(-.043,-.02,y))
   co=(x+dx,y+dy,z+dz)
   if key not in KEYS[:7]:co=extra_deform(o['anatomyName'],o['layer'],key,co,name)
   result.append(Vector(co))
  if any((a-b).length>1e-6 for a,b in zip(base,result)):targets[key]=result
 if targets:
  o.shape_key_add(name='Basis')
  for name,coords in targets.items():
   key=o.shape_key_add(name=name);key.data.foreach_set('co',[c for v in coords for c in v])

outputs=[];report={}
for character in ['mickey','tom']:
 parts=[];fur=DARK if character=='mickey' else BLUE;facecolor=MICKEY_FACE if character=='mickey' else WHITE
 head=ellipsoid('Head',(0,.001,1.590),(.067,.058,.066) if character=='mickey' else (.069,.054,.059),fur,'head')
 neck=ellipsoid('Neck',(0,.006,1.513),(.028,.028,.032),fur,'stand')
 shoulders=ellipsoid('Shoulders',(0,.006,1.474),(.075,.036,.035),fur,'stand')
 body=fuse([neck,shoulders],'Bust',fur);body['feature']='stand'
 if character=='mickey':
  for side in [-1,1]:ellipsoid('Round ear',(side*.067,.006,1.659),(.038,.012,.038),DARK,'ear',tilt=side*.10)
  outline=[(0,1.620),(.012,1.636),(.027,1.639),(.042,1.629),(.048,1.600),(.061,1.584),(.060,1.560),(.045,1.537),(0,1.522),(-.045,1.537),(-.060,1.560),(-.061,1.584),(-.048,1.600),(-.042,1.629),(-.027,1.639),(-.012,1.636)]
  def face_y(x,z,r):return -.058*math.sqrt(max(.015,1-(x/.069)**2-((z-1.591)/.073)**2))-.002-.012*math.exp(-((z-1.55)/.024)**2-(x/.056)**2)
  mask=patch('Face mask',outline,facecolor,face_y,lambda x,z,r:face_y(x,z,r)+.007)
  muzzle=ellipsoid('Muzzle',(0,-.067,1.565),(.048,.025,.020),facecolor)
  face=fuse([mask,muzzle],'Face mask and Muzzle',facecolor,.0005)
  mouth_opening([head,face],character)
  ellipsoid('Nose',(0,-.097,1.578),(.017,.015,.0105),DARK,'nose')
  for side in [-1,1]:
   ellipsoid('Eye white',(side*.018,-.056,1.609),(.0148,.0085,.026),WHITE,'eye',tilt=side*-.045)
   ellipsoid('Pupil',(side*.0145,-.0675,1.605),(.0057,.0027,.0125),DARK,'pupil')
   ellipsoid('Eye highlight',(side*.0145-.0015,-.070,1.609),(.0018,.0008,.0034),WHITE,'pupil')
 else:
  # Broader lower cheeks and angular fur tufts define Tom's outline, not a human cranium.
  cheeks=[head]
  for side in [-1,1]:
   cheeks.append(ellipsoid('Cheek',(side*.046,-.012,1.559),(.029,.032,.030),BLUE))
   tuft=[(.052,1.585),(.074,1.580),(.098,1.577),(.079,1.567),(.094,1.554),(.074,1.553),(.082,1.538),(.055,1.543)]
   cheeks.append(patch('Cheek fur',[(side*x,z) for x,z in tuft],BLUE,lambda x,z,r:-.023-.009*(1-r*r),lambda x,z,r:.005,feature='hair'))
  head=fuse(cheeks,'Head',BLUE);head['feature']='head'
  for side in [-1,1]:
   ear=[(.033,1.627),(.049,1.665),(.100,1.686),(.106,1.688),(.097,1.650),(.094,1.614),(.064,1.603)]
   patch('Pointed ear',[(side*x,z) for x,z in ear],BLUE,lambda x,z,r:-.008-.005*(1-r*r),lambda x,z,r:.002,feature='ear')
   inner=[(.074+(x-.074)*.72,1.640+(z-1.640)*.76) for x,z in ear]
   patch('Pink inner ear',[(side*x,z) for x,z in inner],PINK,lambda x,z,r:-.015-.003*(1-r*r),lambda x,z,r:-.009,feature='ear')
   tube('Ear fold',[(side*.063,-.019,1.620),(side*.069,-.02,1.617),(side*.065,-.02,1.625)],'#42536a',.001,'ear')
  for x,top in [(-.006,1.665),(.006,1.660)]:
   patch('Forehead hair',[(x-.014,1.636),(x+.004,top),(x+.010,top+.002),(x+.006,1.640),(x+.022,1.643)],BLUE,lambda x,z,r:-.012,lambda x,z,r:.008,feature='hair',steps=5,rings=5)
  outline=[(0,1.577),(.020,1.578),(.038,1.570),(.050,1.560),(.041,1.540),(.022,1.526),(0,1.521),(-.022,1.526),(-.041,1.540),(-.050,1.560),(-.038,1.570),(-.020,1.578)]
  mask=patch('Face mask',outline,WHITE,lambda x,z,r:-.055-.009*(1-r*r),lambda x,z,r:-.036)
  lobes=[mask]
  for side in [-1,1]:lobes.append(ellipsoid('Muzzle lobe',(side*.019,-.074,1.565),(.027,.025,.016),WHITE))
  face=fuse(lobes,'Muzzle and Chin',WHITE,.0005)
  mouth_opening([head,face],character)
  patch('Nose',[(-.010,1.578),(0,1.581),(.010,1.578),(.006,1.571),(0,1.568),(-.006,1.571)],DARK,lambda x,z,r:-.108-.003*(1-r*r),lambda x,z,r:-.092,feature='nose',rings=8)
  tube('Philtrum',[(0,-.101,1.570),(0,-.100,1.563),(0,-.098,1.558)],DARK,.0008,'detail')
  for side in [-1,1]:
   ellipsoid('Eye white',(side*.024,-.049,1.600),(.0165,.012,.0285),'#eff19b','eye',tilt=side*.20)
   ellipsoid('Iris',(side*.0185,-.0605,1.593),(.0075,.0026,.017),'#729b46','pupil',tilt=side*.12)
   ellipsoid('Pupil',(side*.0185,-.063,1.593),(.0042,.0018,.0145),DARK,'pupil',tilt=side*.12)
   ellipsoid('Eye highlight',(side*.0185-.001,-.065,1.599),(.0015,.0006,.003),WHITE,'pupil')
   tube('Eyebrow',[(side*.009,-.054,1.627),(side*.020,-.052,1.635),(side*.031,-.045,1.634),(side*.042,-.032,1.622)],'#303d50',.0024,'brow')
   for i in range(3):
    tube('Whisker',[(side*.031,-.099,1.564-i*.003),(side*.066,-.095,1.570-i*.009),(side*.103,-.072,1.578-i*.018)],DARK,.00055,'whisker')
  chest=[(0,1.522),(.025,1.510),(.020,1.489),(.030,1.481),(.016,1.482),(.011,1.458),(0,1.450),(-.011,1.458),(-.016,1.482),(-.030,1.481),(-.020,1.489),(-.025,1.510)]
  def chest_y(x,z,r):
   ys=[]
   for cx,cz,rx,ry,rz in [(0,1.513,.028,.028,.032),(0,1.474,.075,.036,.035)]:
    d=1-((x-cx)/rx)**2-((z-cz)/rz)**2
    if d>0:ys.append(.006-ry*math.sqrt(d))
   return min(ys or [-.022])-.0015
  patch('Chest fur',chest,WHITE,chest_y,lambda x,z,r:chest_y(x,z,r)+.004,feature='stand')
 # Build the final editable shape keys, then split each piece for the existing teaching controls.
 headverts=[v.co for p in parts if p['feature']=='head' for v in p.data.vertices]
 earverts=[v.co for p in parts if p['feature']=='ear' for v in p.data.vertices]
 report[character]={'head_width':max(v.x for v in headverts)-min(v.x for v in headverts),'head_height_without_ears':max(v.z for v in headverts)-min(v.z for v in headverts),'ear_span':max(v.x for v in earverts)-min(v.x for v in earverts),'parts':len(parts),'reference':'Classic animation head silhouettes; independently modelled 3D interpretation.'}
 for o in list(parts):
  active(o);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);add_motion(o)
  for side,positive in [('left',True),('right',False)]:
   clone=o.copy();clone.data=o.data.copy();bpy.context.collection.objects.link(clone)
   bm=bmesh.new();bm.from_mesh(clone.data)
   bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=(0,0,0),plane_no=(1,0,0),clear_inner=positive,clear_outer=not positive)
   if not bm.faces:bm.free();bpy.data.objects.remove(clone,do_unlink=True);continue
   bm.to_mesh(clone.data);bm.free();clone.name=character+' '+o.name+' '+side
   clone['variant']=character;clone['side']=side;clone['lumen']=False
   clone.data.polygons.foreach_set('use_smooth',[True]*len(clone.data.polygons));clone.location.z=-1.55;outputs.append(clone)
  bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for o in outputs:o.select_set(True)
assets=ROOT/'interactive-lab/dist/assets'
bpy.ops.export_scene.gltf(filepath=str(assets/'character-heads.glb'),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_morph=True,export_morph_normal=True,export_yup=True,export_cameras=False,export_lights=False)
collections={}
for variant in ['mickey','tom']:
 collection=bpy.data.collections.new('Mickey' if variant=='mickey' else 'Tom');bpy.context.scene.collection.children.link(collection);collections[variant]=collection
 for o in outputs:
  if o['variant']!=variant:continue
  for c in list(o.users_collection):c.objects.unlink(o)
  collection.objects.link(o)
collections['mickey'].hide_viewport=True;collections['mickey'].hide_render=True
bpy.ops.object.camera_add(location=(0,-.65,.025));camera=bpy.context.object;camera.name='Front preview';camera.rotation_euler=(Vector((0,0,.025))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=.34;bpy.context.scene.camera=camera
if bpy.context.scene.world is None:bpy.context.scene.world=bpy.data.worlds.new('Preview world')
bpy.context.scene.world.color=(.6,.6,.6)
bpy.ops.object.light_add(type='AREA',location=(-.25,-.4,.4));light=bpy.context.object;light.data.energy=15;light.data.shape='DISK';light.data.size=.4;light.rotation_euler=(Vector((0,0,.02))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.context.preferences.filepaths.save_version=0
author_vowel_actions(outputs, ROOT)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'character-heads.blend'),compress=True)
(assets/'character-proportions.json').write_text(json.dumps(report,indent=2)+'\n')
print('CHARACTER_HEADS',len(outputs),json.dumps(report),flush=True)
