"""Repair the original skin's region seams and reapply authored motion.
Run: Blender --background --python repair_skin_seams.py
"""
from pathlib import Path
import bpy, bmesh, json, hashlib, sys
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
from articulation import skin_deform
ASSETS=ROOT/'interactive-lab/dist/assets'
SOURCE=ASSETS/'phonetic-head.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
skins=[o for o in bpy.data.objects if o.type=='MESH' and o.get('layer')=='skin']
assert len(skins)==2
bpy.ops.object.select_all(action='DESELECT')
for o in skins:o.select_set(True)
bpy.context.view_layer.objects.active=skins[0]
bpy.ops.object.join()
skin=bpy.context.object
original_morphs=[k.name for k in skin.data.shape_keys.key_blocks]
before=len(skin.data.vertices)
# GLB vertices split at region/normal boundaries; merge coincident points only (0.01 mm).
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=.00001)
bpy.ops.object.mode_set(mode='OBJECT')
# Imported per-region normals survive a merge unless explicitly cleared.
if skin.data.has_custom_normals:
 bpy.ops.mesh.customdata_custom_splitnormals_clear()
skin.data.polygons.foreach_set('use_smooth',[True]*len(skin.data.polygons))
skin.data.update()
# The region boundaries also contain overlapping/non-manifold strips. A thin inward
# shell + local voxel union removes those strips, without touching internal anatomy.
skin.data.calc_loop_triangles()
source_points=[v.co.copy() for v in skin.data.vertices]
triangles=[tuple(t.vertices) for t in skin.data.loop_triangles]
bvh=BVHTree.FromPolygons(source_points,triangles,all_triangles=True)
welded_count=len(source_points)
seam_bm=bmesh.new();seam_bm.from_mesh(skin.data)
seam_points=[v.co.copy() for v in seam_bm.verts if any(len(e.link_faces)>2 for e in v.link_edges)]
seam_bm.free()
seam_kd=KDTree(len(seam_points))
for i,point in enumerate(seam_points):seam_kd.insert(point,i)
seam_kd.balance()

skin.shape_key_clear()
solid=skin.modifiers.new('Close atlas seams inward','SOLIDIFY');solid.thickness=.0012;solid.offset=-1;solid.use_even_offset=False
bpy.ops.object.modifier_apply(modifier=solid.name)
assert max(v.co.length for v in skin.data.vertices)<2.0, 'Invalid seam shell bounds'
print('REPAIR_STAGE shell',len(skin.data.vertices),flush=True)
skin.data.remesh_voxel_size=.0007;skin.data.remesh_voxel_adaptivity=0
bpy.ops.object.voxel_remesh()
print('REPAIR_STAGE remesh',len(skin.data.vertices),flush=True)
# Smooth only the overlapping atlas borders more strongly. Protect lips, eye rims and ears.
seam_group=skin.vertex_groups.new(name='Atlas seam blend')
if seam_points:
 for v in skin.data.vertices:
  x,y,z=v.co
  if (abs(x)<.03 and y<-.075 and 1.510<z<1.555) or (abs(abs(x)-.03)<.019 and y<-.055 and 1.573<z<1.607) or abs(x)>.064:continue
  _,_,distance=seam_kd.find(v.co)
  if distance<.006:seam_group.add([v.index],(1-distance/.006)**.5,'REPLACE')
blend=skin.modifiers.new('Blend atlas border ridges','SMOOTH');blend.factor=1;blend.iterations=48;blend.vertex_group=seam_group.name
bpy.ops.object.modifier_apply(modifier=blend.name)
smooth=skin.modifiers.new('Soften seam ridges','SMOOTH');smooth.factor=.7;smooth.iterations=6
bpy.ops.object.modifier_apply(modifier=smooth.name)
# Keep interactive cost comparable to the source skin instead of shipping the dense voxel mesh.
decimate=skin.modifiers.new('Interactive surface budget','DECIMATE');decimate.ratio=.16;decimate.use_collapse_triangulate=True
bpy.ops.object.modifier_apply(modifier=decimate.name)
print('REPAIR_STAGE simplified',len(skin.data.vertices),flush=True)
# Voxel repair seals the lip slit. Reopen it before transferring the lower-lip
# motion, so JawOpen separates two real rims instead of stretching a closed face.
bm=bmesh.new();bm.from_mesh(skin.data)
# Trim both layers of the repaired skin in local coordinates. A volumetric
# Boolean is unstable on this atlas's overlapping inner shells.
mouth_faces=[]
for face in bm.faces:
 point=face.calc_center_median()
 if point.y<-.075 and (point.x/.025)**2+((point.z-1.5315)/.0018)**2<1:
  mouth_faces.append(face)
assert 0<len(mouth_faces)<len(bm.faces)*.02, 'Lip aperture did not intersect skin'
bmesh.ops.delete(bm,geom=mouth_faces,context='FACES')
# Project the new rim to a smooth oval instead of keeping a staircase of faces.
for v in bm.verts:
 if v.is_boundary and v.co.y<-.075 and abs(v.co.x)<.028 and abs(v.co.z-1.5315)<.004:
  x,z=v.co.x/.025,(v.co.z-1.5315)/.0018
  radius=(x*x+z*z)**.5
  if radius>0:v.co.x=.025*x/radius;v.co.z=1.5315+.0018*z/radius
bm.to_mesh(skin.data);bm.free();skin.data.update()
print('REPAIR_STAGE lip aperture',len(mouth_faces),'faces',flush=True)
# Measure base-surface deviation, then evaluate the shared skin motion field on
# the repaired vertices. Old sealed-lip triangles must not drive the new rim.
distances=[]
for v in skin.data.vertices:
 point,normal,face,distance=bvh.find_nearest(v.co)
 distances.append(distance)
skin.shape_key_add(name='Basis')
for name in original_morphs:
 if name=='Basis':continue
 key=skin.shape_key_add(name=name)
 for v in skin.data.vertices:
  key.data[v.index].co=skin_deform(name,v.co)
skin.data.polygons.foreach_set('use_smooth',[True]*len(skin.data.polygons))
skin.data.update()
max_distance=max(distances)
assert max_distance<.004, ('Unexpected face displacement',max_distance)
# Split on the same median plane used by the original left/right layer controls.
# Bisection interpolates geometry and shape layers.
outputs=[]
for side,positive in [('left',True),('right',False)]:
 clone=skin.copy();clone.data=skin.data.copy();bpy.context.scene.collection.objects.link(clone)
 bm=bmesh.new();bm.from_mesh(clone.data)
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=(0,0,0),plane_no=(1,0,0),clear_inner=positive,clear_outer=not positive)
 bm.to_mesh(clone.data);bm.free()
 # Resolve any duplicate edges/faces introduced at the median plane before export.
 # Blender's exporter otherwise performs this correction implicitly with a warning.
 corrected=clone.data.validate(verbose=True)
 clone.data.update()
 assert not clone.data.validate(), 'Skin mesh remains invalid after correction'
 assert all(len(k.data)==len(clone.data.vertices) for k in clone.data.shape_keys.key_blocks)
 print('SKIN_VALIDATED',side,'corrected',corrected,flush=True)
 clone.name='Repaired skin__'+side;clone['side']=side;clone['layer']='skin';clone['anatomyName']='Skin - stitched atlas regions';clone['lumen']=False
 clone.data.polygons.foreach_set('use_smooth',[True]*len(clone.data.polygons))
 outputs.append(clone)
bpy.ops.object.select_all(action='DESELECT')
for o in outputs:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ASSETS/'repaired-skin.glb'),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_morph=True,export_morph_normal=True,export_yup=True,export_cameras=False,export_lights=False)
report={'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'weld_tolerance_metres':.00001,'skin_vertices_before':before,'skin_vertices_after_weld':welded_count,'skin_vertices_after_repair':len(skin.data.vertices),'voxel_size_metres':.0007,'decimation_ratio':.16,'inward_shell_metres':.0012,'max_surface_distance_metres':max_distance,'p99_surface_distance_metres':sorted(distances)[int(len(distances)*.99)],'morph_transfer':'Shared analytic skin deformation field','morphs':list(original_morphs),'internal_anatomy':'Original GLB untouched; output contains skin only.'}
(ASSETS/'skin-repair-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('SKIN_REPAIR',json.dumps(report),flush=True)
