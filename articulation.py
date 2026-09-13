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

def extra_deform(name, kind, key, v, feature=None):
    x,y,z = v
    dx=dy=dz=0
    tongue = name == 'Tongue' or any(n in name for n in ['Genioglossus','Hyoglossus'])
    palate = name in ['Soft palate','Uvula of palate'] or 'Palatopharyngeus' in name
    larynx = feature == 'voice' or any(n in name.lower() for n in ['thyro-arytenoid','crico-arytenoid','arytenoid cartilage','transverse arytenoid'])
    lip = (kind == 'skin' and feature not in ['ear','eye','pupil','brow','hair','stand','nose','whisker']) or any(n in name for n in ['Orbicularis oris','Risorius','Zygomaticus','Levator labii','Depressor labii'])
    center = 1.547 if feature else 1.534
    mouth = math.exp(-((y+.085)/.035)**2-((z-center)/.018)**2)*max(0,1-(abs(x)/.06)**4)
    if key == 'JawForward':
        w = (1-smooth(1.52,1.55,z))*smooth(1.47,1.51,z)*smooth(-.01,-.065,y)
        if name == 'Mandible' or name.startswith('Lower '): w=1
        if tongue or lip or kind == 'muscle' or name == 'Mandible' or name.startswith('Lower '): dy=-.004*w
    if lip:
        if key == 'LipRound': dx=-x*.3*mouth; dz=(center-z)*.22*mouth
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
