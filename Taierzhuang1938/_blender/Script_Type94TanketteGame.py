"""Derive a game candidate from a saved, textured high source without overwriting it.

All pivots, link instances, UVs and PBR maps are retained. Reduction is measured
against each original mesh in both directions and is rejected above 3 mm. This
script creates a candidate, never a reference-acceptance completion claim.
"""
import bpy
import json
import math
import os
import importlib.util
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

SOURCE=Path(os.environ.get('TYPE94_SOURCE_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette'))
REPO=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2] if '__file__' in globals() else Path.cwd())))
assert bpy.context.scene.get('BlenderMcpTask')=='Type94Tankette'
assert Path(bpy.data.filepath)==SOURCE/'Scene_Type94TanketteHighPbrStudy.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'Scene_Type94TanketteGameCandidate.blend'))
exportSpec=importlib.util.spec_from_file_location('Type94GlbExport',REPO/'Taierzhuang1938/_blender/Script_Type94Export.py')
exporter=importlib.util.module_from_spec(exportSpec);exportSpec.loader.exec_module(exporter)
groups={}
for obj in bpy.data.objects:
    if obj.type=='MESH':groups.setdefault(obj.data.as_pointer(),[]).append(obj)


def Triangles(mesh):
    return sum(len(p.vertices)-2 for p in mesh.polygons)


def Surface(mesh):
    mesh.calc_loop_triangles()
    return BVHTree.FromPolygons([v.co for v in mesh.vertices],[t.vertices for t in mesh.loop_triangles],all_triangles=True)


def Error(a,b):
    bvh=Surface(b)
    samples=[v.co for v in a.vertices]
    a.calc_loop_triangles()
    samples += [sum((a.vertices[v].co for v in face.vertices),Vector())/3 for face in a.loop_triangles]
    distances=[]
    step=max(1,len(samples)//18000)
    for point in samples[::step]:
        hit=bvh.find_nearest(point)
        if hit[0] is not None:distances.append(hit[3])
    return {'samples':len(distances),'maxM':max(distances,default=0),'rmsM':math.sqrt(sum(d*d for d in distances)/max(1,len(distances)))}


def ReduceLooseParts(original):
    adjacency=[set() for _ in original.vertices]
    for edge in original.edges:
        a,b=edge.vertices;adjacency[a].add(b);adjacency[b].add(a)
    unseen=set(range(len(original.vertices)));components=[]
    faceByVertex=[[] for _ in original.vertices]
    for polygon in original.polygons:
        for v in polygon.vertices:faceByVertex[v].append(polygon.index)
    while unseen:
        seed=unseen.pop();group={seed};stack=[seed]
        while stack:
            for v in adjacency[stack.pop()]:
                if v in unseen:unseen.remove(v);group.add(v);stack.append(v)
        components.append(sorted(set(f for v in group for f in faceByVertex[v])))
    vertices=[];faces=[];smooth=[];uvs=[];errors=[]
    for index,faceIds in enumerate(components):
        vertexIds=sorted(set(v for f in faceIds for v in original.polygons[f].vertices))
        lookup={v:i for i,v in enumerate(vertexIds)}
        part=bpy.data.meshes.new('Mesh_Type94GamePart')
        part.from_pydata([original.vertices[v].co for v in vertexIds],[],[[lookup[v] for v in original.polygons[f].vertices] for f in faceIds]);part.update()
        part.materials.clear()
        for material in original.materials:part.materials.append(material)
        for layer in original.uv_layers:
            new=part.uv_layers.new(name=layer.name)
            for p,f in zip(part.polygons,faceIds):
                p.use_smooth=original.polygons[f].use_smooth
                for a,b in zip(p.loop_indices,original.polygons[f].loop_indices):new.data[a].uv=layer.data[b].uv
        temp=bpy.data.objects.new('Type94GamePart',part);bpy.context.collection.objects.link(temp)
        candidate=part
        forward=reverse={'samples':0,'maxM':0,'rmsM':0}
        if Triangles(part)>24:
            for ratio in [.27,.48,.72]:
                temp.data=part.copy()
                bpy.ops.object.select_all(action='DESELECT');temp.select_set(True);bpy.context.view_layer.objects.active=temp
                mod=temp.modifiers.new('LocalShapePreservingReduction','DECIMATE');mod.ratio=ratio;mod.use_collapse_triangulate=True
                bpy.ops.object.modifier_apply(modifier=mod.name)
                forward=Error(part,temp.data);reverse=Error(temp.data,part)
                if max(forward['maxM'],reverse['maxM'])<=.003:
                    candidate=temp.data;break
                candidate=part
            if candidate==part:forward=reverse={'samples':0,'maxM':0,'rmsM':0}
        errors.append((forward,reverse))
        offset=len(vertices)
        vertices.extend([v.co.copy() for v in candidate.vertices])
        for polygon in candidate.polygons:
            faces.append([v+offset for v in polygon.vertices]);smooth.append(polygon.use_smooth)
            uvs.extend([candidate.uv_layers.active.data[i].uv.copy() for i in polygon.loop_indices])
        bpy.data.objects.remove(temp,do_unlink=True)
        if index%100==0:print('TYPE94_LOCAL_REDUCTION',index,len(components),flush=True)
    combined=bpy.data.meshes.new('Mesh_Type94HullGame')
    combined.from_pydata(vertices,[],faces);combined.update()
    for material in original.materials:combined.materials.append(material)
    layer=combined.uv_layers.new(name='UVMap')
    for item,uv in zip(layer.data,uvs):item.uv=uv
    for polygon,value in zip(combined.polygons,smooth):polygon.use_smooth=value
    highToGame={'samples':sum(e[0]['samples'] for e in errors),'maxM':max(e[0]['maxM'] for e in errors),'rmsM':max(e[0]['rmsM'] for e in errors)}
    gameToHigh={'samples':sum(e[1]['samples'] for e in errors),'maxM':max(e[1]['maxM'] for e in errors),'rmsM':max(e[1]['rmsM'] for e in errors)}
    return combined,highToGame,gameToHigh


records=[]
for users in groups.values():
    obj=users[0]
    # Reduce and measure the exact surface used by the high GLB exporter.
    # A decimator's implicit diagonal can change a non-planar authored quad.
    original=exporter.TriangulatedCopy(obj.data)
    for user in users:user.data=original
    role=obj.get('SurfaceRole','Paint')
    sourceTriangles=Triangles(original)
    ratio=.083 if role=='Track' else (.40 if role=='Paint' else .55)
    if '_Road' in obj.name and role=='Paint':ratio=.38
    if any(token in obj.name for token in ['_Drive_','_Idler_']) and role=='Paint':ratio=.38
    if obj.name.startswith('Geometry_FinalDriveHousing') and role=='Paint':ratio=.40
    if obj.name=='Geometry_VentHousing_Paint':ratio=.19
    if '_Return' in obj.name and role=='Paint':ratio=.34
    if role=='Rubber':ratio=.25 if '_Return' in obj.name else .45
    if '_Drive_' in obj.name and role=='Steel':ratio=.40
    if sourceTriangles<160:ratio=1
    if obj.name in ['Geometry_Hull_Paint','Geometry_TurretYaw_Paint']:
        candidate,forward,reverse=ReduceLooseParts(original)
        for user in users:user.data=candidate
    elif ratio<1:
        obj.data=original.copy()
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True);bpy.context.view_layer.objects.active=obj
        modifier=obj.modifiers.new('GameCandidatePreservePivots','DECIMATE')
        modifier.decimate_type='COLLAPSE';modifier.ratio=ratio;modifier.use_collapse_triangulate=True
        if role=='Track':modifier.use_symmetry=True;modifier.symmetry_axis='X'
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        candidate=obj.data
        forward=Error(original,candidate);reverse=Error(candidate,original)
        if max(forward['maxM'],reverse['maxM'])>.003:
            # Retry more conservatively; do not weaken the surface error bound.
            obj.data=original.copy()
            modifier=obj.modifiers.new('ConservativeGameCandidate','DECIMATE')
            modifier.ratio=max(ratio,.65);modifier.use_collapse_triangulate=True
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            candidate=obj.data
            forward=Error(original,candidate);reverse=Error(candidate,original)
        if max(forward['maxM'],reverse['maxM'])>.003:
            obj.data=original
            candidate=original
            forward=reverse={'samples':0,'maxM':0,'rmsM':0}
        for user in users:user.data=candidate
    else:
        candidate=original;forward=reverse={'samples':0,'maxM':0,'rmsM':0}
    records.append({'mesh':obj.name,'role':role,'instances':len(users),'sourceTriangles':sourceTriangles,'candidateTriangles':Triangles(candidate),'highToGame':forward,'gameToHigh':reverse})
    print('TYPE94_GAME_COMPONENT',obj.name,sourceTriangles,Triangles(candidate),len(users),flush=True)
total=sum(row['candidateTriangles']*row['instances'] for row in records)
bpy.context.view_layer.update()
meshes=[o for o in bpy.data.objects if o.type=='MESH']
minimum=min((o.matrix_world@v.co).z for o in meshes for v in o.data.vertices)
bpy.data.objects['Type94Tankette'].location.z-=minimum
bpy.context.view_layer.update()
report={'id':'Type94Tankette','triangles':total,'limit':80000,'withinBudget':total<=80000,'records':records,
        'referenceSurface':'Exact author-normal-preserving high-export triangulation; samples lie on vertices and triangle interiors',
        'highSource':'Scene_Type94TanketteHighPbrStudy.blend','acceptance':'Candidate; reimport, movement, visual and reference acceptance pending'}
(SOURCE/'Acceptance/Data_GameReduction.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
bpy.context.scene['GameTriangleBudgetPassed']=total<=80000
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'Scene_Type94TanketteGameCandidate.blend'))
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
    if obj.type not in ['CAMERA','LIGHT']:obj.select_set(True)
export=SOURCE/'Exports/Model_Type94TanketteGameCandidate.glb'
exporter.ExportGltf(export)
print('TYPE94_GAME_CANDIDATE_DONE',total,str(export),flush=True)
if total>80000:print('TYPE94_GAME_BUDGET_PENDING: retain candidate locally, continue reduction')
