"""Blender --background --python check_vowel_blender.py"""
import json
from pathlib import Path
import bpy

root=Path(__file__).resolve().parent
for filename in ['phonetic-head-articulated.blend','character-heads.blend']:
    bpy.ops.wm.open_mainfile(filepath=str(root/filename))
    scene=bpy.context.scene
    clips=json.loads(scene['vowel_clips'])
    assert len(clips)==20 and len(scene.timeline_markers)==20
    meshes=[o for o in bpy.data.objects if o.type=='MESH' and o.data.shape_keys]
    assert meshes and all(o.data.shape_keys.animation_data for o in meshes)
    observed={}
    for clip in clips:
        scene.frame_set(clip['start']+48)
        observed[clip['id']]={key.name:key.value for o in meshes for key in o.data.shape_keys.key_blocks}
        assert any(key.value>0 for o in meshes for key in list(o.data.shape_keys.key_blocks)[1:])
        scene.frame_set(clip['end'])
        assert all(abs(key.value)<1e-6 for o in meshes for key in list(o.data.shape_keys.key_blocks)[1:])
    assert observed['ah']['JawOpen']>observed['i']['JawOpen']
    assert observed['u']['LipRound']>observed['i']['LipRound']
    assert observed['i']['FrontHigh']>observed['ah']['FrontHigh']
    print('BLENDER_VOWELS_PASSED',filename,len(clips),'clips',len(meshes),'animated meshes',flush=True)
