"""Local ear-root tunnel surgery; never regenerate lips or existing morph data.

Run with Blender --background --python refine_ears.py.
Input refined-lips.glb is immutable. No global remesh, smoothing or normal reset.
"""
from pathlib import Path
import sys, json, hashlib
import bpy, bmesh, numpy as np
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
from audit_ear_geometry import audit, render, OUT
ASSETS=ROOT/'interactive-lab/dist/assets'
SOURCE=ASSETS/'refined-lips.glb'

# Atlas attachment gaps above/below (not within) the central conchal bowl.
PATCHES=[('superior',-.0055,1.593,.0042,.0048),
         ('inferior',-.0100,1.567,.0048,.0060),
         ('posterior',.0593,1.5587,.0048,.007)]

def in_patch(co, patch):
    _,y,z,ry,rz=patch
    if patch[0]=='posterior':
        return .013<.287*abs(co.x)+.958*co.y<.05 and ((.958*abs(co.x)-.287*co.y-y)/ry)**2+((co.z-z)/rz)**2<1
    return abs(co.x)>.058 and ((co.y-y)/ry)**2+((co.z-z)/rz)**2<1

def loops_from_edges(edges):
    remaining=set(edges); loops=[]
    while remaining:
        edge=next(iter(remaining)); start=edge.verts[0]; current=start; previous=None; loop=[]
        while True:
            loop.append(current)
            choices=[e for e in current.link_edges if e in remaining]
            if previous is None: assert len(choices)==2, 'Non-simple patch boundary'
            else: assert len(choices)==1, 'Non-simple patch boundary'
            edge=choices[0]; remaining.remove(edge); current=edge.other_vert(current); previous=edge
            if current is start: break
        loops.append(loop)
    return loops

def patch_frame(loop):
    """Choose a simple, non-self-crossing projection of this actual 3D rim."""
    def cross(a,b,c): return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    def intersections(points):
        count=0; n=len(points)
        for i in range(n):
            a,b=points[i],points[(i+1)%n]
            for j in range(i+2,n):
                if i==0 and j==n-1: continue
                c,d=points[j],points[(j+1)%n]
                if cross(a,b,c)*cross(a,b,d)<-1e-24 and cross(c,d,a)*cross(c,d,b)<-1e-24: count+=1
        return count
    candidates=[]
    for theta in np.linspace(0,np.pi,90,endpoint=False):
        normal=Vector((float(np.cos(theta)),float(np.sin(theta)),0))
        u=Vector((-normal.y,normal.x,0)); v=Vector((0,0,1))
        points=[(p.co.dot(u),p.co.dot(v)) for p in loop]
        crossing=intersections(points)
        area=abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(points,points[1:]+points[:1])))
        candidates.append((crossing,-area,normal,u,v))
    best=min(candidates,key=lambda c:c[:2])
    if best[0]:
        for tilt in [-60,-40,-20,20,40,60]:
            for theta in np.linspace(0,2*np.pi,60,endpoint=False):
                t=np.deg2rad(tilt)
                normal=Vector((float(np.cos(theta)*np.cos(t)),float(np.sin(theta)*np.cos(t)),float(np.sin(t))))
                u=normal.cross(Vector((0,0,1))).normalized(); v=normal.cross(u).normalized()
                points=[(p.co.dot(u),p.co.dot(v)) for p in loop]
                crossing=intersections(points)
                area=abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(points,points[1:]+points[:1])))
                candidates.append((crossing,-area,normal,u,v))
        best=min(candidates,key=lambda c:c[:2])
    print('RIM_PROJECTION',len(loop),'minimum_crossings',best[0],'normal',list(best[2]),flush=True)
    assert best[0]==0, 'No simple projection; do not tessellate a crossing rim'
    return best[2:]

def repair(obj):
    old_normals={tuple(v.co):v.normal.copy() for v in obj.data.vertices}
    bm=bmesh.new(); bm.from_mesh(obj.data)
    shape_layers=list(bm.verts.layers.shape.values())
    original={v: v.co.copy() for v in bm.verts}
    original_faces=set(bm.faces)
    origins={f:'source' for f in bm.faces}
    def check(stage):
        bad=[dict(points=[list(v.co) for v in e.verts],faces=[dict(origin=origins.get(f,'new:'+stage),vertices=[list(v.co) for v in f.verts]) for f in e.link_faces]) for e in bm.edges if len(e.link_faces)>2]
        if bad:
            OUT.mkdir(parents=True,exist_ok=True)
            (OUT/'topology-blocker.json').write_text(json.dumps(dict(side=obj['side'],stage=stage,edges=bad),indent=2))
            print('NONMANIFOLD',stage,json.dumps(bad),flush=True)
            raise AssertionError('Nonmanifold at '+stage)
    stats=[]
    for patch in PATCHES:
        before_edges={e for e in bm.edges if e.is_boundary}
        selected=[f for f in bm.faces if any(in_patch(v.co,patch) for v in f.verts)]
        assert selected
        assert all((v[layer]-v.co).length<1e-7 for f in selected for v in f.verts for layer in shape_layers), 'Ear patch unexpectedly carries speech motion'
        bmesh.ops.delete(bm,geom=selected,context='FACES')
        boundaries=[e for e in bm.edges if e.is_boundary and e not in before_edges]
        # A cut through a coarse triangle fan can leave rims touching at one
        # vertex. Grow by that local fan only so each sheet has a simple rim.
        for _ in range(5):
            boundary_set=set(boundaries)
            bad=[v for v in {v for e in boundaries for v in e.verts} if sum(e in boundary_set for e in v.link_edges)!=2]
            if not bad: break
            cleanup={f for v in bad for f in v.link_faces}
            bmesh.ops.delete(bm,geom=list(cleanup),context='FACES')
            boundaries=[e for e in bm.edges if e.is_boundary and e not in before_edges]
        loops=loops_from_edges(boundaries)
        print('PATCH_LOOPS',obj.name,patch[0],len(selected),[(len(loop),[sum(v.co[i] for v in loop)/len(loop) for i in range(3)]) for loop in loops],flush=True)
        assert len(loops)==2, 'Expected separate outer and inner sheet rims'
        added=[]
        for loop in loops:
            # Fit the surrounding sheet, separately for each side of the skin.
            # The two membranes must not be collapsed into a single flat cap.
            neighborhood=set(loop)
            for _ in range(3): neighborhood.update(v for p in list(neighborhood) for e in p.link_edges for v in e.verts)
            normal,u_axis,v_axis=patch_frame(loop)
            cy=sum(v.co.dot(u_axis) for v in loop)/len(loop)
            cz=sum(v.co.dot(v_axis) for v in loop)/len(loop)
            ry,rz=patch[3:]
            def uv(co): return co.dot(u_axis),co.dot(v_axis)
            def depth(co): return co.dot(normal)
            def set_depth(co,value):
                co+=normal*(value-depth(co))
            def row(co):
                u,v=uv(co); u=(u-cy)/ry; v=(v-cz)/rz
                return [1,u,v,u*u,u*v,v*v]
            coeff=np.linalg.lstsq(np.array([row(v.co) for v in neighborhood]),np.array([depth(v.co) for v in neighborhood]),rcond=None)[0]
            def fitted(co): return float(np.dot(row(co),coeff))
            # Preserve the actual rim, but sample the interior rather than
            # subdividing long ear-clipped slivers (which produced striping).
            projected=[Vector(uv(v.co)) for v in loop]
            def inside(x,y):
                return sum((a.y>y)!=(b.y>y) and x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x
                    for a,b in zip(projected,projected[1:]+projected[:1]))%2==1
            samples=list(projected)
            for x in np.arange(min(p.x for p in projected),max(p.x for p in projected),.0005):
                for y in np.arange(min(p.y for p in projected),max(p.y for p in projected),.0005):
                    co=u_axis*x+v_axis*y
                    set_depth(co,fitted(co))
                    if inside(x,y) and in_patch(co,(patch[0],patch[1],patch[2],ry+.0015,rz+.0015)):
                        samples.append(Vector((x,y)))
            indices=list(range(len(loop)))
            area=sum(a.x*b.y-b.x*a.y for a,b in zip(projected,projected[1:]+projected[:1]))
            if area<0: indices.reverse()
            coords,_,faces,origins2,_,_=delaunay_2d_cdt(samples,[],[indices],1,1e-8)
            vertices=[]; new=set()
            for co,ids in zip(coords,origins2):
                rim_ids=[i for i in ids if i<len(loop)]
                assert len(rim_ids)<=1, 'CDT merged distinct rim vertices'
                if rim_ids: v=loop[rim_ids[0]]
                else:
                    v=bm.verts.new(u_axis*co.x+v_axis*co.y); new.add(v)
                vertices.append(v)
            triangles=[tuple(vertices[i] for i in f) for f in faces]
            print('PROJECTION',patch[0],len(loop),'triangles',len(triangles),flush=True)
            counts={}
            for tri in triangles:
                for a,b in zip(tri,tri[1:]+tri[:1]):
                    edge=frozenset((a,b)); counts[edge]=counts.get(edge,0)+1
            rim={frozenset((a,b)) for a,b in zip(loop,loop[1:]+loop[:1])}
            assert all(count==(1 if edge in rim else 2) for edge,count in counts.items()), 'Invalid tessellation connectivity'
            assert rim=={edge for edge,count in counts.items() if count==1}
            # A diagonal may coincide with an existing edge outside the cut.
            # Give that patch diagonal its own midpoint, not four incident faces.
            split={edge:bm.verts.new(sum((v.co for v in edge),Vector())/2)
                for edge in counts if edge not in rim and bm.edges.get(tuple(edge)) is not None}
            new.update(split.values())
            for tri in triangles:
                if any(frozenset((a,b)) in split for a,b in zip(tri,tri[1:]+tri[:1])):
                    center=bm.verts.new(sum((v.co for v in tri),Vector())/3); new.add(center)
                    perimeter=[]
                    for a,b in zip(tri,tri[1:]+tri[:1]):
                        perimeter.append(a)
                        if frozenset((a,b)) in split: perimeter.append(split[frozenset((a,b))])
                    faces_to_add=[(a,b,center) for a,b in zip(perimeter,perimeter[1:]+perimeter[:1])]
                else: faces_to_add=[tri]
                for verts in faces_to_add:
                    f=bm.faces.new(verts); origins[f]=patch[0]+':new'
            patch_verts=set(loop)|new
            residual={v:depth(v.co)-fitted(v.co) for v in neighborhood}
            interior=list(new); index={v:i for i,v in enumerate(interior)}
            # Biharmonic least squares also constrains the fixed rim's Laplacian,
            # matching the neighboring sheet's slope instead of a C0-only cap.
            rows=interior+list(loop)
            matrix=np.zeros((len(rows),len(interior))); rhs=np.zeros(len(rows))
            for i,v in enumerate(rows):
                neighbors=[e.other_vert(v) for e in v.link_edges]
                weights=[1/max((Vector(uv(v.co))-Vector(uv(o.co))).length,1e-7) for o in neighbors]
                total=sum(weights)
                if v in index: matrix[i,index[v]]=1
                else: rhs[i]-=residual[v]
                for other,weight in zip(neighbors,weights):
                    weight/=total
                    if other in index: matrix[i,index[other]]-=weight
                    else: rhs[i]+=weight*residual[other]
            residual.update(zip(interior,np.linalg.lstsq(matrix,rhs,rcond=None)[0]))
            for v in new:
                set_depth(v.co,fitted(v.co)+residual[v])
                for layer in shape_layers: v[layer]=v.co
            added.extend(f for f in bm.faces if all(v in patch_verts for v in f.verts))
            check(patch[0]+':sheet')
        bmesh.ops.triangulate(bm,faces=list(set(added)))
        stats.append(dict(patch=patch[0],removed_faces=len(selected),sheet_rim_vertices=[len(loop) for loop in loops],
                          center_yz=[patch[1],patch[2]],radius_yz=[patch[3],patch[4]]))
    # Reorient only new patch faces to agree with their unchanged neighboring
    # surfaces; existing mesh winding was already verified consistent.
    bm.normal_update()
    pending=set(bm.faces)-original_faces
    while pending:
        progress=False
        for face in list(pending):
            shared=next((e for e in face.edges if e.is_manifold and any(f not in pending for f in e.link_faces)),None)
            if shared is not None:
                if not shared.is_contiguous: face.normal_flip()
                pending.remove(face); progress=True
        assert progress, 'Disconnected patch'
    assert all(e.is_contiguous for e in bm.edges if e.is_manifold)
    assert all(len(e.link_faces)<=2 for e in bm.edges)
    assert all((v.co-co).length==0 for v,co in original.items() if v.is_valid)
    assert not any(e.is_boundary and any(abs(v.co.x)>.058 and 1.55<v.co.z<1.61 and -.025<v.co.y<.015 for v in e.verts) for e in bm.edges)
    bm.to_mesh(obj.data); bm.free(); obj.data.update()
    for f in obj.data.polygons: f.use_smooth=True
    # Imported split normals cannot be reused for the newly inserted corners.
    # Keep source normals everywhere untouched and compute patch normals afresh.
    bpy.context.view_layer.objects.active=obj
    if obj.data.has_custom_normals: bpy.ops.mesh.customdata_custom_splitnormals_clear()
    obj.data.update()
    normals=[old_normals.get(tuple(v.co),v.normal).copy() for v in obj.data.vertices]
    for v in obj.data.vertices:
        if any(in_patch(v.co,(name,y,z,ry+.002,rz+.002)) for name,y,z,ry,rz in PATCHES): normals[v.index]=v.normal.copy()
    obj.data.normals_split_custom_set_from_vertices(normals)
    return stats

if __name__=='__main__':
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    parts=[o for o in bpy.data.objects if o.type=='MESH']
    hashes={name:hashlib.sha256((ASSETS/name).read_bytes()).hexdigest() for name in ['refined-lips.glb','repaired-skin.glb']}
    results=[]
    for obj in parts:
        before=audit(obj)
        patches=repair(obj)
        obj.name='Ear-refined skin__'+obj['side']; obj['earsRefined']=True
        results.append(dict(side=obj['side'],before=before,after=audit(obj),patches=patches))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts: obj.select_set(True)
    target=OUT/'candidate-ear.glb' if '--candidate' in sys.argv else ASSETS/'ear-refined-skin.glb'
    OUT.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,
        export_extras=True,export_animations=False,export_morph=True,export_morph_normal=True,export_yup=True)
    assert hashes=={name:hashlib.sha256((ASSETS/name).read_bytes()).hexdigest() for name in hashes}
    report=dict(source_sha256=hashes,method='Local superior/inferior/posterior excision; separate inner and outer sheets with constrained Delaunay interior sampling and slope-aware fairing. Posterior ellipse radii 4.8/7 mm and depth slab 13..50 mm. Retain all surviving vertex and morph coordinates.',sides=results)
    (OUT/'candidate-report.json' if '--candidate' in sys.argv else ASSETS/'ear-refinement-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print('EAR_REFINEMENT',json.dumps(report),flush=True)
    OUT.mkdir(parents=True,exist_ok=True)
    if '--render' in sys.argv: render(parts,'repaired')
