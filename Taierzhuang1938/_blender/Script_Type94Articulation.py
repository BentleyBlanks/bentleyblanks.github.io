"""Reference-based hatch chord and rigid interfaces; retain every closed world pose."""
import bpy
import bmesh
import math
from mathutils import Vector


def Components(mesh):
    adjacency=[set() for _ in mesh.vertices]
    for edge in mesh.edges:
        a,b=edge.vertices;adjacency[a].add(b);adjacency[b].add(a)
    unseen=set(range(len(mesh.vertices)))
    while unseen:
        seed=unseen.pop();group=[seed];stack=[seed]
        while stack:
            for v in adjacency[stack.pop()]:
                if v in unseen:unseen.remove(v);group.append(v);stack.append(v)
        yield group


def Reanchor(obj,location):
    bpy.context.view_layer.update()
    poses={child:child.matrix_world.copy() for child in obj.children}
    obj.location=location;bpy.context.view_layer.update()
    for child,matrix in poses.items():child.matrix_world=matrix


def Clean(mesh):
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-7)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(mesh);bm.free();mesh.update()


def SplitFixedMount(obj,parent):
    mesh=obj.data;selected=set()
    for group in Components(mesh):
        if max(math.hypot(mesh.vertices[v].co.x,mesh.vertices[v].co.z) for v in group)>.12:selected.update(group)
    faceIds=[p.index for p in mesh.polygons if set(p.vertices)<=selected]
    vertexIds=sorted(selected);lookup={v:i for i,v in enumerate(vertexIds)}
    new=bpy.data.meshes.new('Mesh_Type94FixedGunMount')
    new.from_pydata([mesh.vertices[v].co for v in vertexIds],[],[[lookup[v] for v in mesh.polygons[f].vertices] for f in faceIds]);new.update()
    for material in mesh.materials:new.materials.append(material)
    for source in mesh.uv_layers:
        target=new.uv_layers.new(name=source.name)
        for polygon,f in zip(new.polygons,faceIds):
            polygon.use_smooth=mesh.polygons[f].use_smooth;polygon.material_index=mesh.polygons[f].material_index
            for a,b in zip(polygon.loop_indices,mesh.polygons[f].loop_indices):target.data[a].uv=source.data[b].uv
    wear=new.attributes.new('WearZone','FLOAT','FACE')
    for value,f in zip(wear.data,faceIds):value.value=mesh.attributes['WearZone'].data[f].value
    fixed=bpy.data.objects.new('Geometry_MachineGunFixedMount_Paint',new);bpy.context.collection.objects.link(fixed)
    fixed.parent=parent;fixed.matrix_world=obj.matrix_world.copy();fixed['SurfaceRole']='Paint'
    for vertex in new.vertices:
        p=vertex.co;r=math.hypot(p.x,p.z)
        if r<.09 and p.y<.002:
            p.x*=.095/r;p.z*=.095/r
    new.update()
    bm=bmesh.new();bm.from_mesh(mesh);bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[bm.faces[i] for i in faceIds],context='FACES')
    bm.to_mesh(mesh);bm.free();mesh.update()
    return fixed


def CorrectArticulation():
    scene=bpy.context.scene
    assert scene.get('BlenderMcpTask')=='Type94Tankette'
    if scene.get('Type94ArticulationVersion',0)>=3:return []
    turret=bpy.data.objects['TurretYaw'];gun=bpy.data.objects['MachineGunPitch']
    changed=[]
    if gun.location.y<.40:
        changed.append(SplitFixedMount(bpy.data.objects['Geometry_MachineGunPitch_Paint'],turret))
        Reanchor(gun,tuple(gun['TargetAimPivotM'])if 'TargetAimPivotM'in gun else(0,.417,.30))
        changed.append(bpy.data.objects['Geometry_MachineGunPitch_Paint'])
    driverVisor=bpy.data.objects['Hatch_DriverVisor']
    Reanchor(driverVisor,tuple(driverVisor.get('TargetHingeM',(.305,.202,1.230))))
    driverRoof=bpy.data.objects['Hatch_DriverRoof']
    Reanchor(driverRoof,tuple(driverRoof.get('TargetHingeM',(.305,-.075,1.246))))
    engine=bpy.data.objects['Hatch_Engine']
    Reanchor(engine,tuple(engine.get('TargetHingeM',(-.32,-.21,1.105))))
    rear=bpy.data.objects['Hatch_RearCargo']
    Reanchor(rear,tuple(rear.get('TargetHingeM',(.316,-1.448,.685))))
    commander=bpy.data.objects['Hatch_Commander'];roofDelta=turret.get('RoofGeometryDeltaZ',0.)
    Reanchor(commander,tuple(commander['TargetHingeM'])if turret.get('TurretEnvelopeLayout')else(0,.245,.525))
    frontChord=commander.get('FrontChordYLocalTurretM',.245)
    obj=bpy.data.objects['Geometry_Hatch_Commander_Paint'];mesh=obj.data
    inverse=turret.matrix_world.inverted();toLocal=obj.matrix_world.inverted()@turret.matrix_world
    toTurret=inverse@obj.matrix_world
    for group in Components(mesh):
        points=[toTurret@mesh.vertices[v].co for v in group]
        if max(p.x for p in points)-min(p.x for p in points)<.55:continue
        for v in group:
            p=toTurret@mesh.vertices[v].co
            if p.y>frontChord:p.y=frontChord;mesh.vertices[v].co=toLocal@p
    Clean(mesh);changed.append(obj)
    obj=bpy.data.objects['Geometry_TurretYaw_Paint'];mesh=obj.data
    toTurret=turret.matrix_world.inverted()@obj.matrix_world;toLocal=obj.matrix_world.inverted()@turret.matrix_world
    for vertex in mesh.vertices:
        p=toTurret@vertex.co;r=math.hypot(p.x,p.y)
        innerFront=commander.get('RoofOpeningFrontYLocalTurretM',.230)
        if abs(r-.270)<.0001 and .490+roofDelta<p.z<.504+roofDelta and p.y>innerFront:
            p.y=innerFront;vertex.co=toLocal@p
    # The two former generic leaves become fixed hinge bases on the roof.
    for group in Components(mesh):
        points=[toTurret@mesh.vertices[v].co for v in group];center=sum(points,Vector())/len(points)
        extent=[max(p[k] for p in points)-min(p[k] for p in points) for k in range(3)]
        if abs(abs(center.x)-.18)<.01 and abs(center.y-.218)<.01 and abs(center.z-.517)<.005 and .07<extent[0]<.08 and extent[2]<.01:
            for v in group:
                p=toTurret@mesh.vertices[v].co;p.y+=.027;p.z=.507+(p.z-.517)*(.012/.007);mesh.vertices[v].co=toLocal@p
    Clean(mesh);changed.append(obj)
    obj=bpy.data.objects['Geometry_TurretYaw_Dark'];toTurret=turret.matrix_world.inverted()@obj.matrix_world;toLocal=obj.matrix_world.inverted()@turret.matrix_world
    for vertex in obj.data.vertices:
        p=toTurret@vertex.co;r=math.hypot(p.x,p.y)
        if .508+roofDelta<p.z<.516+roofDelta and .268<r<.294:
            limit=commander.get('SealInnerFrontYLocalTurretM',.230) if r<.28 else commander.get('SealOuterFrontYLocalTurretM',.252)
            if p.y>limit:p.y=limit;vertex.co=toLocal@p
    Clean(obj.data)
    # Shift the complete inspection assembly along its deck plane. The new
    # shallower deck needs 60 mm; legacy sources retain 25 mm. This clearance
    # offset is inferred, not a museum measurement.
    deltaY=.060 if 'Type94GlacisPitchRad' in scene else .025
    deltaZ=math.tan(scene.get('Type94GlacisPitchRad',-.245))*deltaY
    engine=bpy.data.objects['Hatch_Engine'];engine.location.y+=deltaY;engine.location.z+=deltaZ
    hull=bpy.data.objects['Geometry_Hull_Paint'];mesh=hull.data
    # Move the opening before its nearby hinge parts. Otherwise a hinge
    # shifted into this selection is accidentally translated a second time.
    for vertex in mesh.vertices:
        p=vertex.co
        if -.492<p.x<-.148 and -.142<p.y<.172 and .95<p.z<1.11:
            p.y+=deltaY;p.z-=scene.get('Type94GlacisSlope',.395/1.5)*deltaY
    for group in Components(mesh):
        points=[mesh.vertices[v].co for v in group];center=sum(points,Vector())/len(points)
        extent=max(max(p[k] for p in points)-min(p[k] for p in points) for k in range(3))
        if min(abs(center.x+.45),abs(center.x+.20))<.055 and -.28<center.y<-.18 and 1.075<center.z<1.125 and extent<.12:
            for v in group:mesh.vertices[v].co.y+=deltaY;mesh.vertices[v].co.z+=deltaZ
    Clean(mesh);changed.append(hull)
    dark=bpy.data.objects['Geometry_Hull_Dark']
    for group in Components(dark.data):
        points=[dark.data.vertices[v].co for v in group];center=sum(points,Vector())/len(points)
        width=max(p.x for p in points)-min(p.x for p in points)
        if abs(center.x+.32)<.03 and -.03<center.y<.07 and 1.0<center.z<1.08 and .35<width<.45:
            for v in group:dark.data.vertices[v].co.y+=deltaY;dark.data.vertices[v].co.z+=deltaZ
    Clean(dark.data)
    cover=bpy.data.objects['Geometry_Hatch_Engine_Paint'];bpy.context.view_layer.update()
    world=cover.matrix_world;inverse=world.inverted()
    plane=max((p for p in cover.data.polygons if p.normal.z>.8),key=lambda p:p.area)
    point=world@cover.data.vertices[plane.vertices[0]].co
    normal=(world.to_3x3()@plane.normal).normalized()
    for group in Components(cover.data):
        points=[world@cover.data.vertices[v].co for v in group]
        width=max(p.x for p in points)-min(p.x for p in points)
        depth=max(p.y for p in points)-min(p.y for p in points)
        if .05<width<.10 and depth<.025:
            distance=min((p-point).dot(normal) for p in points)
            for v in group:cover.data.vertices[v].co=inverse@(world@cover.data.vertices[v].co-normal*(distance+.0005))
    Clean(cover.data);changed.append(cover)
    scene['Type94ArticulationVersion']=3
    scene['CommanderHatchShape']='Front chord / rounded rear; follows open-lid reference'
    scene['MachineGunMount']='Bolted outer socket fixed to turret; inner ball / barrel pitch about ball centre'
    bpy.context.view_layer.update()
    return changed


if globals().get('__name__') in (None,'__main__'):
    print('TYPE94_ARTICULATION_CORRECTED',[o.name for o in CorrectArticulation()])
