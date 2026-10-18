"""Focused exported-GLB regression. Run with Blender --background --python-exit-code 1 --python test_ear_geometry.py."""
import sys, json, hashlib
from pathlib import Path
import bpy, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
from refine_ears import ASSETS, PATCHES, in_patch
from audit_ear_geometry import audit, OUT

def load(name):
    bpy.ops.import_scene.gltf(filepath=str(ASSETS/name))
    return {o['side']:o for o in bpy.context.selected_objects if o.type=='MESH'}

def bvh(obj):
    return BVHTree.FromPolygons([v.co for v in obj.data.vertices],[list(f.vertices) for f in obj.data.polygons])

def triangle_set(obj):
    return {tuple(sorted(tuple(obj.data.vertices[i].co) for i in p.vertices)) for p in obj.data.polygons}

def boundaries(obj):
    bm=bmesh.new();bm.from_mesh(obj.data)
    result={tuple(sorted(tuple(v.co) for v in e.verts)) for e in bm.edges if e.is_boundary}
    bm.free();return result

def state(obj):
    keys=obj.data.shape_keys.key_blocks
    return {tuple(v.co):tuple(tuple(k.data[v.index].co) for k in keys) for v in obj.data.vertices}

def in_support(p):
    # Test-only triangle-corner allowance, independent of surgery selection.
    # Posterior coarse corners require 3 mm in-plane support after the measured
    # local excision expansion; the depth slab retains a separate 2 mm margin.
    for name,u,z,ru,rz in PATCHES:
        if name=='posterior':
            depth=.287*abs(p[0])+.958*p[1]
            if .011<depth<.052 and ((.958*abs(p[0])-.287*p[1]-u)/(ru+.003))**2+((p[2]-z)/(rz+.003))**2<1:
                return True
        elif in_patch(Vector(p),(name,u,z,ru+.002,rz+.002)):
            return True
    return False

def coordinate_ranges(points):
    return [[min(p[i] for p in points),max(p[i] for p in points)] for i in range(3)]

def rays(before,after,side):
    sign=1 if side=='left' else -1
    result=[]
    for name,u,z,ru,rz in PATCHES:
        missing=0; repaired=0; hits=0
        diagnostic_hits={.042:[0,0],.080:[0,0]} if name=='posterior' else {}
        for i in range(-4,5):
            for j in range(-4,5):
                # Restricted interior samples: do not confuse healthy ear silhouette with a hole.
                a=u+i*.0003; height=z+j*.00035
                if name=='posterior':
                    w=.060; det=.958**2+.287**2
                    origin=Vector((sign*(.958*a+.287*w)/det,(-.287*a+.958*w)/det,height))
                    direction=Vector((-sign*.287,-.958,0)).normalized(); distance=.040
                else:
                    origin=Vector((sign*.2,a,height));direction=Vector((-sign,0,0));distance=.145
                old=before.ray_cast(origin,direction,distance)[0]
                new=after.ray_cast(origin,direction,distance)[0]
                # Diagnostic only: these longer rays never count toward passing,
                # since they could encounter unrelated deeper head surfaces.
                for limit,counts in diagnostic_hits.items():
                    counts[0]+=before.ray_cast(origin,direction,limit)[0] is not None
                    counts[1]+=after.ray_cast(origin,direction,limit)[0] is not None
                hits+=new is not None
                if old is None:
                    missing+=1;repaired+=new is not None
        check=dict(patch=name,rays=81,source_misses=missing,repaired_misses=repaired,final_hits=hits,
            passed=missing>0 and repaired==missing and hits==81)
        if diagnostic_hits:
            check['diagnostic_longer_rays']=[dict(distance_m=d,source_hits=c[0],final_hits=c[1]) for d,c in diagnostic_hits.items()]
        print('EAR_RAYS',side,json.dumps(check),flush=True)
        result.append(check)
    return result

bpy.ops.wm.read_factory_settings(use_empty=True)
candidate=OUT/'candidate-ear.glb' if '--candidate' in sys.argv else ASSETS/'ear-refined-skin.glb'
source=load('refined-lips.glb'); final=load(candidate)
assert set(source)==set(final)=={'left','right'}
report=json.loads((OUT/'candidate-report.json' if '--candidate' in sys.argv else ASSETS/'ear-refinement-report.json').read_text())
for name,digest in report['source_sha256'].items():
    assert hashlib.sha256((ASSETS/name).read_bytes()).hexdigest()==digest
results=[]
for side in ['left','right']:
    old,new=source[side],final[side]
    assert new.get('lipsRefined') is True and new.get('earsRefined') is True
    assert new.get('layer')=='skin' and new.get('side')==side
    assert [k.name for k in old.data.shape_keys.key_blocks]==[k.name for k in new.data.shape_keys.key_blocks]
    assert len(new.data.shape_keys.key_blocks)==9
    a,b=state(old),state(new)
    shared=set(a)&set(b)
    assert all(a[p]==b[p] for p in shared), 'Retained speech morph coordinates changed'
    removed=set(a)-set(b); added=set(b)-set(a)
    # Deleted face corners may sit just outside the selection ellipse. Bound the
    # support conservatively while still excluding the concha, face and midline.
    outliers=[p for p in removed|added if not in_support(p)]
    print('SUPPORT_OUTLIERS',side,len(outliers),outliers[:12],flush=True)
    assert not outliers, 'Nonlocal geometry change'
    protected={p for p in a if not in_support(p)}
    assert protected<=shared
    median={p for p in a if abs(p[0])<1e-6}
    assert median=={p for p in b if abs(p[0])<1e-6}
    lip={p for p in a if abs(p[0])<.04 and p[1]<-.074 and 1.515<p[2]<1.545}
    concha={p for p in a if .064<abs(p[0])<.087 and -.001<p[1]<.010 and 1.576<p[2]<1.587}
    assert len(concha)>20 and len(lip)>100
    assert lip|concha<=shared
    assert boundaries(old)==boundaries(new),'Mouth or median boundaries changed'
    old_faces,new_faces=triangle_set(old),triangle_set(new)
    changed=old_faces-new_faces
    assert all(any(in_support(p) for p in f) for f in changed)
    topology=audit(new)
    assert len(topology['components'])==1
    assert topology['ear_boundary_edges']==topology['ear_nonmanifold_edges']==topology['ear_inconsistent_winding_edges']==0
    result=dict(side=side,retained_vertices=len(shared),removed_vertices=len(removed),new_vertices=len(added),
        removed_xyz_ranges=coordinate_ranges(removed),added_xyz_ranges=coordinate_ranges(added),
        unchanged_remote_vertices=len(protected),unchanged_lip_vertices=len(lip),unchanged_concha_vertices=len(concha),
        unchanged_median_vertices=len(median),retained_coordinate_max_error=0,retained_morph_max_error=0,
        unchanged_triangles=len(old_faces&new_faces),removed_triangles=len(changed),topology=topology,
        ray_tests=rays(bvh(old),bvh(new),side))
    results.append(result)
OUT.mkdir(parents=True,exist_ok=True)
failures=[dict(side=s['side'],**r) for s in results for r in s['ray_tests'] if not r['passed']]
result=dict(asset_path=str(candidate),asset_sha256=hashlib.sha256(candidate.read_bytes()).hexdigest(),passed=not failures,sides=results,
    ray_failures=failures)
(OUT/('candidate-focused-tests.json' if '--candidate' in sys.argv else 'focused-tests.json')).write_text(json.dumps(result,indent=2)+'\n')
assert not failures, ('Ear ray validation failed',failures)
print('EAR_TESTS_PASS',json.dumps(result),flush=True)
