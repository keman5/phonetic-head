"""Build a watertight white head/neck core from the repaired human surface.
The original anatomical GLB and repaired exterior are never modified.
"""
from pathlib import Path
import bpy,bmesh,math,json,hashlib
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
ROOT=Path(__file__).resolve().parent;ASSETS=ROOT/'interactive-lab/dist/assets'
bpy.ops.wm.read_factory_settings(use_empty=True)
source_file=ASSETS/'repaired-skin.glb';bpy.ops.import_scene.gltf(filepath=str(source_file))
sources=[o for o in bpy.data.objects if o.type=='MESH']
points=[];triangles=[];morphs={}
for o in sources:
 offset=len(points);o.data.calc_loop_triangles();points.extend(v.co.copy() for v in o.data.vertices)
 triangles.extend(tuple(i+offset for i in t.vertices) for t in o.data.loop_triangles)
 for key in o.data.shape_keys.key_blocks:
  if key.name!='Basis':morphs.setdefault(key.name,[]).extend(v.co.copy() for v in key.data)
bvh=BVHTree.FromPolygons(points,triangles,all_triangles=True)
zmin=min(v.z for v in points)+.00012;zmax=max(v.z for v in points)-.00012
layers=192;sectors=160;dz=(zmax-zmin)/(layers-1)
# Estimate the centre line from the source's local cross-sections, avoiding guessed skull proportions.
bins=[[] for _ in range(layers)]
for v in points:bins[max(0,min(layers-1,round((v.z-zmin)/dz)))].append(v.y)
centres=[(min(v)+max(v))/2 if v else 0 for v in bins]
centres=[sum(centres[max(0,i-2):min(layers,i+3)])/len(centres[max(0,i-2):min(layers,i+3)]) for i in range(layers)]
verts=[];faces=[];missed=0;actual_heights=[];actual_centres=[]
for j in range(layers):
 z=zmin+j*dz;cy=centres[j];radii=[]
 for k in range(sectors):
  angle=2*math.pi*k/sectors;direction=Vector((math.cos(angle),math.sin(angle),0));centre=Vector((0,cy,z))
  hit,_,_,_=bvh.ray_cast(centre+direction*.25,-direction,.5)
  radius=(hit-centre).dot(direction) if hit is not None else None
  inset=.00025 if j<4 or j>=layers-4 else .003
  radii.append(max(.0002,radius-inset) if radius is not None and radius>0 else None)
 known=[k for k,r in enumerate(radii) if r is not None]
 if len(known)<sectors*.25:continue
 actual_heights.append(z);actual_centres.append(cy)
 for k,r in enumerate(radii):
  if r is None:
   missed+=1
   a=next((k-n)%sectors for n in range(1,sectors+1) if radii[(k-n)%sectors] is not None)
   b=next((k+n)%sectors for n in range(1,sectors+1) if radii[(k+n)%sectors] is not None)
   da=(k-a)%sectors;db=(b-k)%sectors;r=(radii[a]*db+radii[b]*da)/(da+db)
  angle=2*math.pi*k/sectors;verts.append((r*math.cos(angle),cy+r*math.sin(angle),z))
layers=len(actual_heights);assert layers>150
zmin=actual_heights[0];zmax=actual_heights[-1];centres=actual_centres
for j in range(layers-1):
 for k in range(sectors):
  a=j*sectors+k;b=j*sectors+(k+1)%sectors;faces.append((a,b,b+sectors,a+sectors))
# Explicit closed bottom and crown surfaces, including the centre of the neck base.
verts.extend([(0,centres[0],zmin),(0,centres[-1],zmax)])
for k in range(sectors):
 faces.append((len(verts)-2,(k+1)%sectors,k))
 a=(layers-1)*sectors+k;b=(layers-1)*sectors+(k+1)%sectors;faces.append((len(verts)-1,a,b))
mesh=bpy.data.meshes.new('Solid human core');mesh.from_pydata(verts,[],faces);mesh.update()
core=bpy.data.objects.new('Solid human core',mesh);bpy.context.collection.objects.link(core)
def active(o):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
active(core)
bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
# A bounded oral recess permits tongue motion; it does not drill through the neck base.
bpy.ops.mesh.primitive_uv_sphere_add(segments=64,ring_count=40,location=(0,-.069,1.532))
cutter=bpy.context.object;cutter.scale=(.037,.058,.027);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
active(core);mod=core.modifiers.new('Oral teaching recess','BOOLEAN');mod.object=cutter;mod.operation='DIFFERENCE';mod.solver='EXACT';bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
white=bpy.data.materials.new('Solid white membrane');white.diffuse_color=(1,1,1,1);core.data.materials.append(white)
core.data.polygons.foreach_set('use_smooth',[True]*len(core.data.polygons))
core.shape_key_add(name='Basis')
nearest=[bvh.find_nearest(v.co) for v in core.data.vertices]
for name,coords in morphs.items():
 key=core.shape_key_add(name=name)
 for v,(point,_,face,_) in zip(core.data.vertices,nearest):
  a,b,c=triangles[face];delta=barycentric_transform(point,points[a],points[b],points[c],coords[a]-points[a],coords[b]-points[b],coords[c]-points[c]);key.data[v.index].co=v.co+delta
outputs=[];reports=[]
for side,positive in [('left',True),('right',False)]:
 o=core.copy();o.data=core.data.copy();bpy.context.collection.objects.link(o)
 bm=bmesh.new();bm.from_mesh(o.data)
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=(0,0,0),plane_no=(1,0,0),clear_inner=positive,clear_outer=not positive)
 cut=[e for e in bm.edges if e.is_boundary and all(abs(v.co.x)<1e-6 for v in e.verts)]
 bmesh.ops.holes_fill(bm,edges=cut,sides=0);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 boundary=sum(e.is_boundary for e in bm.edges);nonmanifold=sum(not e.is_manifold for e in bm.edges);volume=abs(bm.calc_volume(signed=True))
 assert boundary==0 and nonmanifold==0 and volume>1e-4,(side,boundary,nonmanifold,volume)
 bm.to_mesh(o.data);bm.free()
 o.name='Solid core '+side;o.location.z=-1.55;o['variant']='human';o['side']=side;o['layer']='skin';o['anatomyName']='White solid head and neck';o['solidVolume']=True;o['color']='#ffffff';o['lumen']=False
 outputs.append(o);reports.append(dict(side=side,boundary_edges=boundary,nonmanifold_edges=nonmanifold,volume_m3=volume,vertices=len(o.data.vertices)))
bpy.ops.object.select_all(action='DESELECT')
for o in outputs:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ASSETS/'solid-human-core.glb'),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_morph=True,export_morph_normal=True,export_yup=True,export_cameras=False,export_lights=False)
report=dict(source_sha256=hashlib.sha256(source_file.read_bytes()).hexdigest(),layers=layers,sectors=sectors,body_inset_metres=.003,end_inset_metres=.00025,interpolated_rays=missed,oral_recess_bottom_z=1.505,closed_base_z=zmin,halves=reports)
(ASSETS/'solid-core-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('SOLID_CORE',json.dumps(report),flush=True)

# Save the same repaired exterior used by the browser, with editable vowel clips.
import sys
sys.path.insert(0,str(ROOT))
from articulation import author_vowel_actions
bpy.data.objects.remove(core,do_unlink=True)
existing=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(ASSETS/'phonetic-head.glb'))
for o in list(bpy.data.objects):
 if o not in existing and o.type=='MESH' and o.get('layer')=='skin':bpy.data.objects.remove(o,do_unlink=True)
review_meshes=[o for o in bpy.data.objects if o.type=='MESH']
for o in review_meshes:
 if o.get('lumen'):o.hide_render=True;o.hide_set(True)
author_vowel_actions(review_meshes,ROOT)
bpy.ops.object.camera_add(location=(0,-.65,.025))
camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,.025))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=.32;bpy.context.scene.camera=camera
bpy.context.scene.render.engine='BLENDER_WORKBENCH'
bpy.context.scene.display.shading.light='STUDIO'
bpy.context.scene.display.shading.color_type='MATERIAL'
bpy.context.scene['preview_note']='20 vowel clips, 120 frames each, timeline markers identify IPA and example words.'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'phonetic-head-articulated.blend'),compress=True)
