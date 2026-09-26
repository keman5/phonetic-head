"""Save a child-friendly editable Blender companion; never overwrite the atlas.

The browser additionally supplies live cutaway caps, labels and teaching cards.
Run after build_solid_core.py with Blender --background --python this_file.py.
"""
from pathlib import Path
import bpy, json, subprocess
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'phonetic-head-articulated.blend'))
objects=[o for o in bpy.data.objects if o.type=='MESH']
metadata=[dict(anatomyName=o.get('anatomyName',''),layer=o.get('layer',''),variant=o.get('variant',''),solidVolume=bool(o.get('solidVolume'))) for o in objects]
script="""
import fs from 'node:fs';
import {teachingRole} from './interactive-lab/dist/teaching.js';
import {createTeachingMaterial} from './interactive-lab/dist/palette.js';
console.log(JSON.stringify(JSON.parse(fs.readFileSync(0,'utf8')).map(meta=>{
 const {material}=createTeachingMaterial(meta,'human',true);
 return {role:teachingRole(meta),color:material.color.toArray()};
})));
"""
styles=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],input=json.dumps(metadata).encode(),cwd=ROOT))
materials={}
for o,style in zip(objects,styles):
    role=style['role'];o['teachingRole']=role
    hidden=role=='detail' or bool(o.get('lumen'))
    o.hide_set(hidden);o.hide_render=hidden
    color=tuple(style['color'])+(1,)
    if color not in materials:
        mat=bpy.data.materials.new('Child teaching '+role)
        mat.diffuse_color=color;mat.use_nodes=True
        mat.node_tree.nodes.clear()
        bsdf=mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled');output=mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
        mat.node_tree.links.new(bsdf.outputs['BSDF'],output.inputs['Surface'])
        bsdf.inputs['Base Color'].default_value=color;bsdf.inputs['Roughness'].default_value=.9
        materials[color]=mat
    o.data.materials.clear();o.data.materials.append(materials[color])
    for polygon in o.data.polygons:polygon.material_index=0

# Friendly eyes in the saved scene; the browser uses an equivalent iris shader.
for side,x in [('left',.03),('right',-.03)]:
    for name,location,scale,color in [
        ('iris',(x,-.0818,.041),(.0055,.0013,.006),(.038,.105,.127,1)),
        ('glint',(x-.0015,-.083,.043),(.0011,.0005,.0011),(1,1,1,1)),
    ]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,location=location)
        o=bpy.context.object;o.name='Child '+side+' '+name;o.scale=scale
        o['side']=side;o['layer']='eye';o['teachingRole']='surface'
        mat=bpy.data.materials.new(o.name);mat.diffuse_color=color;o.data.materials.append(mat)
        for polygon in o.data.polygons:polygon.use_smooth=True

scene=bpy.context.scene;scene.frame_set(49)
scene.render.engine='BLENDER_WORKBENCH'
scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL'
scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
scene.display.shading.studio_light='paint.sl'
scene.display.shading.show_shadows=False;scene.display.shading.show_cavity=False
scene.display.shading.background_type='VIEWPORT';scene.display.shading.background_color=(.89,.94,.97)
if scene.world is None:scene.world=bpy.data.worlds.new('Teaching background')
scene.world.color=(.89,.94,.97)
scene.camera.location=(0,-.65,.025);scene.camera.rotation_euler=(Vector((0,0,.025))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
scene['teaching_note']='Child-friendly visual companion; original organ geometry and 20 vowel clips retained. Browser adds sagittal caps, semantic labels, airflow and 48 lesson cards. Synthetic audio and poses require teacher review.'
assert len(scene.timeline_markers)==20
assert sum(not o.hide_render for o in objects)<len(objects)/2
assert all(o.hide_render or o.get('teachingRole')=='teeth' for o in objects if o.get('layer')=='bone'), 'Teaching preview must not expose skeletal meshes'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'phonetic-head-child-teaching.blend'),compress=True)
print('CHILD_TEACHING_BLEND_SAVED',len(scene.timeline_markers),'vowel clips',flush=True)
