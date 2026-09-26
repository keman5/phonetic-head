"""Shared educational displacements in source Blender metre coordinates."""
import math

KEYS = ['JawOpen', 'TipForward', 'FrontHigh', 'BackSeal', 'VelumRaise',
        'LipClose', 'LipSpread', 'Voice', 'JawForward', 'LipRound',
        'LipProtrude', 'LipBite', 'TipAlveolar', 'TongueRetroflex',
        'TongueCenter', 'TongueLow', 'BackHigh', 'TongueGroove',
        'TongueLateral', 'VelumLower', 'GlottisClose', 'VocalTension',
        'GlottisOpen', 'BreathPressure']

def smooth(a, b, v):
    t = max(0, min(1, (v-a)/(b-a)))
    return t*t*(3-2*t)

def skin_deform(key, v):
    """Evaluate the skin field directly, including newly repaired lip vertices.

    Sampling the old closed lip triangles gives discontinuous jaw weights at
    the new aperture, so all skin exporters share this continuous field.
    """
    x,y,z=v
    if key=='JawOpen':
        w=(1-smooth(1.529,1.533,z))*smooth(-.014,-.08,y)*smooth(1.46,1.50,z)
        a=.24*w;yy=y+.008;zz=z-1.557
        return x, y+yy*math.cos(a)-zz*math.sin(a)-yy, z+yy*math.sin(a)+zz*math.cos(a)-zz
    mouth=math.exp(-((y+.09)/.024)**2-((z-1.5315)/.018)**2)*max(0,1-(abs(x)/.049)**4)
    if key=='LipClose':return x,y-.0015*mouth,z+(1.5315-z)*mouth*.95
    if key=='LipSpread':return x+x*.20*mouth,y,z+.0015*mouth
    return extra_deform('Skin','skin',key,v)

def extra_deform(name, kind, key, v, feature=None):
    x,y,z = v
    dx=dy=dz=0
    tongue = name == 'Tongue' or any(n in name for n in ['Genioglossus','Hyoglossus'])
    palate = name in ['Soft palate','Uvula of palate'] or 'Palatopharyngeus' in name
    larynx = feature == 'voice' or any(n in name.lower() for n in ['thyro-arytenoid','crico-arytenoid','arytenoid cartilage','transverse arytenoid'])
    lip = (kind == 'skin' and feature not in ['ear','eye','pupil','brow','hair','stand','nose','whisker']) or feature == 'mouth' or any(n in name for n in ['Orbicularis oris','Risorius','Zygomaticus','Levator labii','Depressor labii'])
    center = 1.547 if feature else 1.5315
    mouth = math.exp(-((y+.085)/.045)**2-((z-center)/(.028 if feature else .010))**2)*max(0,1-(abs(x)/(.085 if feature else .043))**4)
    if key == 'JawForward':
        w = (1-smooth(1.52,1.55,z))*smooth(1.47,1.51,z)*smooth(-.01,-.065,y)
        if name == 'Mandible' or name.startswith('Lower '): w=1
        if tongue or lip or kind == 'muscle' or name == 'Mandible' or name.startswith('Lower '): dy=-.004*w
    if lip:
        if key == 'LipRound': dx=-x*.65*mouth; dz=(center-z)*.22*mouth; dy=-.002*mouth
        if key == 'LipProtrude': dy=-.007*mouth
        if key == 'LipBite': dz=.006*mouth*(1-smooth(center-.002,center+.002,z)); dy=.002*mouth
        if key == 'BreathPressure': dx=x*.025*mouth; dy=-.0015*mouth
    if tongue:
        anchor=smooth(1.503,1.523,z)
        front=1-smooth(-.075,-.04,y)
        middle=math.exp(-((y+.048)/.022)**2)*anchor
        if key == 'TipAlveolar': dz=.009*front*anchor;dy=.003*front*anchor
        if key == 'TongueRetroflex': dz=.01*front*anchor;dy=.01*front*anchor
        if key == 'TongueCenter': dz=.007*middle
        if key == 'TongueLow': dz=-.007*anchor
        if key == 'BackHigh': dz=.005*(1-front)*anchor
        if key == 'TongueGroove': dz=-.003*math.exp(-(x/.008)**2)*anchor;dx=x*.06*anchor
        if key == 'TongueLateral': dz=-.005*smooth(.008,.021,abs(x))*anchor
    if palate and key == 'VelumLower':
        w=smooth(-.05,-.018,y);dz=-.006*w;dy=-.002*w
    if larynx:
        if key in ['Voice','GlottisClose']: dx=-x*(.16 if key == 'Voice' else .45)
        if key == 'GlottisOpen': dx=x*.3
        if key == 'VocalTension': dy=(y+.018)*.2;dz=.0015
        if key == 'BreathPressure': dz=.0008;dy=-.0005
    return x+dx,y+dy,z+dz


def author_vowel_actions(objects, root):
    """Bake browser vowel gestures into a labelled Blender review timeline."""
    import bpy
    import json
    import subprocess
    script = "import {PHONEMES} from './interactive-lab/dist/phonemes.js'; console.log(JSON.stringify(Object.values(PHONEMES).filter(p=>['vowel','diphthong'].includes(p.category))));"
    vowels = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=root))
    scene = bpy.context.scene
    scene.render.fps = 30
    scene.frame_start = 1
    scene.frame_end = len(vowels)*120
    scene.timeline_markers.clear()
    scene['vowel_clips'] = json.dumps([dict(id=p['id'], ipa=p['ipa'], start=1+i*120, end=(i+1)*120) for i,p in enumerate(vowels)])
    keys = [o.data.shape_keys for o in objects if o.data.shape_keys]
    for shape in keys:
        shape.animation_data_clear()
    for i,p in enumerate(vowels):
        start = 1+i*120
        scene.timeline_markers.new('/'+p['ipa']+'/ '+p['word'], frame=start)
        for offset,pose in [(0,{}),(24,p['poses'][0]),(48,p['poses'][0]),(90,p['poses'][-1]),(104,p['poses'][-1]),(119,{})]:
            for shape in keys:
                for key in list(shape.key_blocks)[1:]:
                    key.value = pose.get(key.name, 0)
                    key.keyframe_insert(data_path='value', frame=start+offset, group=key.name)
    for shape in keys:
        action = shape.animation_data.action
        action.name = shape.name+' - 20 vowel gestures'
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.interpolation = 'LINEAR'
    scene.frame_set(1)
