"""Observable main-reference details: exposed flange fasteners and optic handedness."""
import bpy
import bmesh
import math
import json
from pathlib import Path
from mathutils import Vector


def Components(mesh):
    adjacent=[set() for _ in mesh.vertices]
    for edge in mesh.edges:
        a,b=edge.vertices;adjacent[a].add(b);adjacent[b].add(a)
    unseen=set(range(len(mesh.vertices)))
    while unseen:
        seed=unseen.pop();group=[seed];stack=[seed]
        while stack:
            for v in adjacent[stack.pop()]:
                if v in unseen:unseen.remove(v);group.append(v);stack.append(v)
        yield group


def CorrectDetails():
    scene=bpy.context.scene
    assert scene.get('BlenderMcpTask')=='Type94Tankette'
    if scene.get('Type94DetailsVersion',0)>=1:return None
    fixed=bpy.data.objects['Geometry_MachineGunFixedMount_Paint'];mesh=fixed.data;count=0
    for group in Components(mesh):
        points=[mesh.vertices[v].co for v in group];center=sum(points,Vector())/len(points)
        extent=max(max(p[k] for p in points)-min(p[k] for p in points) for k in range(3))
        if .130<math.hypot(center.x,center.z)<.140 and .022<center.y<.035 and extent<.04:
            for v in group:mesh.vertices[v].co.y+=.006
            count+=1
    expectedCount=int(scene.get('Type94FixedFlangeFastenerCount',8))
    assert count==expectedCount,'Expected every declared fixed-flange fastener'
    if expectedCount==6:
        fixed['MgFlangeFastenerPatternRequired']=True
        fixed['MgFlangeFastenerCount']=6
        fixed['MgFlangeHeadSectionSides']=6
        fixed['MgFlangeBoltCircleRadiusM']=.135
        fixed['MgFlangeHeadCircumradiusM']=.0085
        fixed['MgFlangeHeadDepthM']=.007
        fixed['MgFlangeHeadCenterYLocalM']=.033
        fixed['MgFlangeHeadBevelM']=.0006
        fixed['MgFlangeReferenceLayout']='Data_MgFlangeReferenceV31.json'
        fixed['MgFlangeSectionDimensionsInferred']=True
    mesh.update()
    dark=bpy.data.objects['Geometry_MachineGunPitch_Dark'].data
    for group in Components(dark):
        points=[dark.vertices[v].co for v in group];center=sum(points,Vector())/len(points)
        if abs(center.x+.042)<.002 and abs(center.z-.041)<.002:
            for v in group:dark.vertices[v].co.x+=.084
        elif center.x>.005 and center.z>.025:
            for v in group:dark.vertices[v].co.x*=-1
    if scene.get('Type94MgRoundOpeningRequired'):
        gun=bpy.data.objects['MachineGunPitch']
        gun['MgRoundOpeningRequired']=True
        layout=scene.get('Type94TurretFrontLayout')
        opening=json.loads((Path(__file__).resolve().parents[1]/'Model/Type94Tankette'/layout).read_text(encoding='utf-8'))['roundOpening']if layout else None
        radius=opening['adoptedRadiusM']if opening else .011
        center=opening['centerBeforeGunReanchorM']if opening else [.042,.1,.041]
        gun['MgRoundOpeningCenterLocalM']=(center[0],.036,center[2])
        gun['MgRoundOpeningRadiusM']=radius
        gun['MgRoundOpeningBallDepthM']=.072
        gun['MgRoundOpeningDimensionsInferred']=True
        gun['MgRoundOpeningFunctionAccepted']=False
        gun['MgOtherTriangularFeatureAccepted']=False
        gun['MgRoundOpeningFlatCapNormalsRequired']=True
        gun['MgFullFixedContactExclusionM']=0.
    bm=bmesh.new();bm.from_mesh(dark);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(dark);bm.free();dark.update()
    steel=bpy.data.objects['Geometry_MachineGunPitch_Steel'].data
    for group in Components(steel):
        points=[steel.vertices[v].co for v in group];center=sum(points,Vector())/len(points)
        if abs(center.x-.02)<.002 and abs(center.y-.107)<.004 and abs(center.z-.055)<.004:
            for v in group:steel.vertices[v].co.x-=.04
    steel.update();scene['Type94DetailsVersion']=1
    return fixed
