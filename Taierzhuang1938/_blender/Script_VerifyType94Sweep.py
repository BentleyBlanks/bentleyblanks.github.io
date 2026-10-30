"""Triangle/BVH sweeps on the actual imported game GLB.

Legacy cover-vs-body checks retain their declared contact zones. Corrected
interfaces use zero exclusion. Commander, side-port and rear-door checks
include their full seals. The rear latch is released before door rotation;
locked-door counterfactuals must meet the keeper. Turret/cabin and gun/socket
use their actual surfaces.
"""
import bpy
import math
import json
import os
import bisect
from pathlib import Path
from mathutils import Vector,Euler,Matrix
from mathutils.bvhtree import BVHTree


def VerifyScene(scene,trackPath=None,operatingPose=None,cabinEnvelope=None):
    def Find(name):return next(obj for obj in scene.objects if obj.name==name or obj.name.startswith(name+'.'))
    def Descendants(root):
        result=set();pending=list(root.children)
        while pending:
            obj=pending.pop();result.add(obj);pending.extend(obj.children)
        return result
    def Tree(objects,predicate=None):
        vertices=[];faces=[]
        for obj in objects:
            if obj.type!='MESH':continue
            points=[obj.matrix_world@v.co for v in obj.data.vertices];offset=len(vertices);vertices.extend(points)
            for polygon in obj.data.polygons:
                center=sum((points[i] for i in polygon.vertices),Vector())/len(polygon.vertices)
                if predicate is None or predicate(center):faces.append([i+offset for i in polygon.vertices])
        return BVHTree.FromPolygons(vertices,faces) if faces else None
    def Update():
        for viewLayer in scene.view_layers:viewLayer.update()
    root=Find('Type94Tankette');turret=Find('TurretYaw');gun=Find('MachineGunPitch')
    objects=set(scene.objects);meshes={o for o in objects if o.type=='MESH'}
    originalTransforms={o:(o.rotation_mode,o.matrix_basis.copy()) for o in objects if o.type=='EMPTY'}
    for obj,(_,matrix) in originalTransforms.items():obj.rotation_mode='XYZ';obj.matrix_basis=matrix
    rest={o:o.rotation_euler.copy() for o in originalTransforms}
    rearDoor=Find('Hatch_RearCargo')
    rearLatch=next((o for o in objects if o.name=='RearDoorLatchTurner' or o.name.startswith('RearDoorLatchTurner.')),None)
    def TurnRearLatch(degrees):
        if rearLatch:
            rearLatch.matrix_basis=originalTransforms[rearLatch][1]@Matrix.Rotation(rearLatch.get('OpenSignLocal',1)*math.radians(degrees),4,'Y')
    def OpenHatch(hatch,degrees,defaultAxis='X',defaultSign=1):
        axis=hatch.get('HingeAxisLocal',defaultAxis)
        sign=hatch.get('OpenSignLocal',defaultSign)
        hatch.matrix_basis=originalTransforms[hatch][1]@Matrix.Rotation(sign*math.radians(degrees),4,axis)
        if hatch==rearDoor:TurnRearLatch(rearLatch.get('ReleaseAngleDeg',90) if rearLatch and degrees>0 else 0)
    def CloseHatch(hatch):
        hatch.matrix_basis=originalTransforms[hatch][1]
        if hatch==rearDoor:TurnRearLatch(0)
    reports=[]
    Update();groundOffset=root.matrix_world.translation.z
    cabinObjects={Find('Geometry_Hull_Paint')}|Descendants(Find('Hatch_DriverRoof'))|Descendants(Find('Hatch_DriverVisor'))
    for name in ['DriverVisorHingeFixed','DriverRoofHingeFixed','DriverPortMount','DriverPortMountRight']:
        owner=next((o for o in scene.objects if o.name==name or o.name.startswith(name+'.')),None)
        if owner:cabinObjects|=Descendants(owner)
    if cabinEnvelope:
        x0,x1=cabinEnvelope['xRangeM'];y0,y1=cabinEnvelope['forwardRangeM'];z0=cabinEnvelope['minimumHeightM']
        cabin=Tree(cabinObjects,lambda p:x0<p.x<x1 and y0<p.y<y1 and p.z>groundOffset+z0)
    else:cabin=Tree(cabinObjects,lambda p:-.065<p.x<.65 and -.12<p.y<.36 and p.z>groundOffset+1.05)
    moving=Descendants(turret)
    collisions=[]
    for yawIndex in range(24):
        turret.rotation_euler.z=yawIndex*math.tau/24
        for elevation in [-10,0,20]:
            gun.rotation_euler.x=math.radians(elevation);Update()
            tree=Tree(moving,None if cabinEnvelope else lambda p:p.z>groundOffset+1.13)
            overlap=tree.overlap(cabin)
            if overlap:collisions.append({'yawDeg':yawIndex*15,'gunElevationDeg':elevation,'trianglePairs':len(overlap)})
    reports.append({'check':'turret and gun sweep against cabin','samples':72,'passed':not collisions,'collisions':collisions})
    if cabinEnvelope:reports[-1]['actualDriverEnvelopeBeforeGroundM']=cabinEnvelope
    turret.rotation_euler=rest[turret];gun.rotation_euler=rest[gun];Update()
    fixed=Find('Geometry_MachineGunFixedMount_Paint');socket=Tree([fixed]);collisions=[]
    for elevation in range(-10,21,5):
        gun.rotation_euler.x=math.radians(elevation);Update();tree=Tree(Descendants(gun))
        overlap=tree.overlap(socket)
        if overlap:collisions.append({'elevationDeg':elevation,'trianglePairs':len(overlap)})
    reports.append({'check':'inner gun against fixed bolted socket','samples':7,'passed':not collisions,'collisions':collisions})
    gun.rotation_euler=rest[gun];Update()
    if gun.get('MgRoundOpeningRequired'):
        moving=Descendants(gun);fullFixed=Tree(meshes-moving);collisions=[]
        for elevation in range(-10,21,5):
            gun.rotation_euler.x=math.radians(elevation);Update()
            overlap=Tree(moving).overlap(fullFixed)
            if overlap:collisions.append({'elevationDeg':elevation,'trianglePairs':len(overlap)})
        gun.rotation_euler=rest[gun];Update()
        reports.append({'check':'inner gun against every fixed vehicle surface','samples':7,'contactExclusionM':0,'passed':not collisions,'collisions':collisions})
    gunYaw=next((o for o in objects if o.name=='MachineGunYaw' or o.name.startswith('MachineGunYaw.')),None)
    if gunYaw:
        # New two-axis ball-mount demonstration must clear every fixed face.
        # Historical stops remain unmeasured; do not relax the collision test.
        moving=Descendants(gun);fullFixed=Tree(meshes-moving);collisions=[]
        yawAngles=list(range(-8,9,2));elevations=list(range(-10,21,5))
        for yawDegrees in yawAngles:
            gunYaw.rotation_euler.z=math.radians(yawDegrees)
            for elevation in elevations:
                gun.rotation_euler.x=math.radians(elevation);Update()
                overlap=Tree(moving).overlap(fullFixed)
                if overlap:collisions.append({'gunYawDeg':yawDegrees,'elevationDeg':elevation,'trianglePairs':len(overlap)})
        gunYaw.rotation_euler=rest[gunYaw];gun.rotation_euler=rest[gun];Update()
        reports.append({'check':'two-axis gun against every fixed vehicle surface','samples':len(yawAngles)*len(elevations),'contactExclusionM':0,'historicalStopsMeasured':False,'passed':not collisions,'collisions':collisions})
        moving=Descendants(turret);collisions=[]
        for yawIndex in range(24):
            turret.rotation_euler.z=yawIndex*math.tau/24
            for yawDegrees in [-8,8]:
                gunYaw.rotation_euler.z=math.radians(yawDegrees)
                for elevation in [-10,0,20]:
                    gun.rotation_euler.x=math.radians(elevation);Update()
                    overlap=Tree(moving,lambda p:p.z>groundOffset+1.13).overlap(cabin)
                    if overlap:collisions.append({'turretYawDeg':yawIndex*15,'gunYawDeg':yawDegrees,'elevationDeg':elevation,'trianglePairs':len(overlap)})
        turret.rotation_euler=rest[turret];gunYaw.rotation_euler=rest[gunYaw];gun.rotation_euler=rest[gun];Update()
        reports.append({'check':'full turret traverse with independently yawed gun against cabin','samples':144,'passed':not collisions,'collisions':collisions})
    sidePortOwners={'DriverPortLeft':'DriverPortHingeFixed','DriverPortRight':'DriverPortHingeFixedRight','TurretPortLeft':'TurretPortHingeFixedLeft','TurretPortRight':'TurretPortHingeFixedRight'}
    fixedInterfaces=[('DriverVisor','DriverVisorHingeFixed',1),('DriverRoof','DriverRoofHingeFixed',-1),('Engine','EngineHingeFixed',-1),('Commander','CommanderHingeFixed',-1),('RearCargo','RearDoorHingeFixed',1)]
    hasTurretRear=any(obj.name=='Hatch_TurretRear' or obj.name.startswith('Hatch_TurretRear.')for obj in objects)
    if hasTurretRear:fixedInterfaces.append(('TurretRear','TurretRearHingeFixed',-1))
    fixedInterfaces += [(name,owner,1 if name.endswith('Left')else -1)for name,owner in sidePortOwners.items()]
    for name,ownerName,defaultSign in fixedInterfaces:
        driverFixed=next((o for o in scene.objects if o.name==ownerName or o.name.startswith(ownerName+'.')),None)
        if not driverFixed:continue
        hatch=Find('Hatch_'+name);fixed=Tree(Descendants(driverFixed));collisions=[]
        sign=hatch.get('OpenSignLocal',defaultSign)
        for degrees in [0,15,30,45,60,75,90,99 if name=='RearCargo'else 100.8]:
            OpenHatch(hatch,degrees,defaultSign=sign);Update()
            overlap=Tree(Descendants(hatch)).overlap(fixed)
            if overlap:collisions.append({'openingDeg':degrees,'trianglePairs':len(overlap)})
        CloseHatch(hatch);Update()
        reports.append({'check':name+' against its actual fixed pins and bearing eyes',
                        'samples':8,'contactExclusionM':0,'passed':not collisions,'collisions':collisions})
    roof=Find('Hatch_DriverRoof');visor=Find('Hatch_DriverVisor')
    if roof.get('OpenSignLocal')==-1:
        collisions=[]
        for roofDeg in [0,25,55,85,100.8]:
            roof.rotation_euler=rest[roof].copy();roof.rotation_euler.x-=math.radians(roofDeg)
            for visorDeg in [0,25,55,85,100.8]:
                visor.rotation_euler=rest[visor].copy();visor.rotation_euler.x+=math.radians(visorDeg);Update()
                overlap=Tree(Descendants(roof)).overlap(Tree(Descendants(visor)))
                if overlap:collisions.append({'roofDeg':roofDeg,'visorDeg':visorDeg,'trianglePairs':len(overlap)})
        roof.rotation_euler=rest[roof];visor.rotation_euler=rest[visor];Update()
        reports.append({'check':'driver roof / visor combined motion','samples':25,'contactExclusionM':0,
                        'passed':not collisions,'collisions':collisions})
    if rearLatch:
        parts=Descendants(rearLatch);fixed=Tree(meshes-parts);collisions=[]
        for degrees in range(0,91,5):
            TurnRearLatch(degrees);Update();overlap=Tree(parts).overlap(fixed)
            if overlap:collisions.append({'latchDeg':degrees,'trianglePairs':len(overlap)})
        TurnRearLatch(0);Update()
        reports.append({'check':'rear latch spindle/cam release against actual door, bearing and keeper',
                        'samples':19,'contactExclusionM':0,'passed':not collisions,'collisions':collisions})
        keeperOwner=next((o for o in objects if o.name=='RearDoorLatchKeeperFixed' or o.name.startswith('RearDoorLatchKeeperFixed.')),None)
        if keeperOwner:
            keeper=Tree(Descendants(keeperOwner));blocked=[]
            for degrees in [.25,.5,.75,1.0]:
                rearDoor.matrix_basis=originalTransforms[rearDoor][1]@Matrix.Rotation(math.radians(degrees),4,'Z');TurnRearLatch(0);Update()
                overlap=Tree(Descendants(rearDoor)).overlap(keeper)
                if overlap:blocked.append({'doorDeg':degrees,'keeperTrianglePairs':len(overlap)})
            CloseHatch(rearDoor);Update()
            reports.append({'check':'rear locked cam physically meets the keeper before door opening',
                            'samples':4,'expectedCollision':True,'passed':bool(blocked),'blockedPoses':blocked})
    for side in ['Left','Right']:
        for index in range(4):
            wheel=Find('Wheel_'+side+'_Road'+str(index));origin=wheel.matrix_world.translation.copy()
            def OutsideJournal(p):return math.hypot(p.y-origin.y,p.z-origin.z)>.075
            fixed=Tree({Find('Geometry_Hull_Paint')},OutsideJournal);collisions=[]
            for sample in range(16):
                wheel.rotation_euler=rest[wheel].copy();wheel.rotation_euler.x+=sample*math.tau/16;Update()
                overlap=Tree(Descendants(wheel),OutsideJournal).overlap(fixed)
                if overlap:collisions.append({'wheelDeg':sample*360/16,'trianglePairs':len(overlap)})
            wheel.rotation_euler=rest[wheel];Update()
            reports.append({'check':side+' road wheel '+str(index)+' against fixed body and suspension outside axle journal',
                            'samples':16,'journalContactRadiusM':.075,'passed':not collisions,'collisions':collisions})
        housing=Find('FinalDriveHousing'+side);fixedHousing=Tree(Descendants(housing))
        fixedBeltEnvelope=Tree(Descendants(housing)|{Find('Geometry_Hull_Paint')})
        drive=Find('Wheel_'+side+'_Drive');collisions=[]
        for index in range(32):
            drive.rotation_euler=rest[drive].copy();drive.rotation_euler.x+=index*math.tau/32;Update()
            overlap=Tree(Descendants(drive)).overlap(fixedHousing)
            if overlap:collisions.append({'wheelDeg':index*360/32,'trianglePairs':len(overlap)})
        drive.rotation_euler=rest[drive];Update()
        trackParts=Descendants(Find('Track_'+side));trackOverlap=Tree(trackParts).overlap(fixedBeltEnvelope)
        if trackPath is None:
            if scene.get('SourceTrackPathJson'):
                trackPath=json.loads(scene['SourceTrackPathJson'])
            else:
                source=Path(os.environ.get('TYPE94_SOURCE_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette'))
                trackPath=json.loads((source/'Acceptance/Data_Mechanism.json').read_text(encoding='utf-8'))['path']
        path=trackPath
        links=sorted([o for o in trackParts if o.type=='MESH'],key=lambda o:o.get('TrackIndex',0))
        saved={o:(o.rotation_mode,o.matrix_basis.copy()) for o in links};beltCollisions=[];restError=0;restAngle=0
        try:
            for sample in range(16):
                phase=path['pitchM']*sample/16
                for index,link in enumerate(links):
                    distance=(index*path['pitchM']+phase)%path['lengthM']
                    segment=min(len(path['points'])-1,max(0,bisect.bisect_left(path['distances'],distance)-1))
                    a=path['points'][segment];b=path['points'][(segment+1)%len(path['points'])]
                    t=(distance-path['distances'][segment])/(path['distances'][segment+1]-path['distances'][segment])
                    angle=math.atan2(b[1]-a[1],b[0]-a[0])+math.pi
                    position=Vector((link.location.x,a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))
                    if sample==0:
                        restError=max(restError,(position-saved[link][1].translation).length)
                        q=Euler((angle,0,0),'XYZ').to_quaternion();old=saved[link][1].to_quaternion()
                        restAngle=max(restAngle,2*math.acos(min(1,abs(q.dot(old)))))
                    link.rotation_mode='XYZ';link.location=position;link.rotation_euler=(angle,0,0)
                Update();overlap=Tree(trackParts).overlap(fixedBeltEnvelope)
                if overlap:beltCollisions.append({'phaseM':phase,'trianglePairs':len(overlap)})
        finally:
            for link,(mode,matrix) in saved.items():link.rotation_mode=mode;link.matrix_basis=matrix
            Update()
        reports.append({'check':side+' rotating sprocket / fixed casing and phased belt / body-fender envelope',
                        'samples':32,'beltPhaseSamples':16,
                        'passed':not collisions and not trackOverlap and not beltCollisions and restError<1e-5 and restAngle<.001,
                        'collisions':collisions,'restBeltTrianglePairs':len(trackOverlap),'beltCollisions':beltCollisions,
                        'pathRestPositionErrorM':restError,'pathRestAngleErrorRad':restAngle})
    shackle=next((o for o in scene.objects if o.name=='TowShackleFront' or o.name.startswith('TowShackleFront.')),None)
    if shackle:
        parts=Descendants(shackle);origin=shackle.matrix_world.translation.copy()
        axis=(shackle.matrix_world.to_3x3()@Vector((1,0,0))).normalized()
        def OutsideTowBearing(p):
            delta=p-origin;return (delta-axis*delta.dot(axis)).length>.025
        fixed=Tree(meshes-parts,OutsideTowBearing);collisions=[]
        for degrees in [0,10,25,40,55,70,80]:
            shackle.rotation_euler=rest[shackle].copy();shackle.rotation_euler.x+=math.radians(degrees);Update()
            overlap=Tree(parts,OutsideTowBearing).overlap(fixed)
            if overlap:collisions.append({'angleDeg':degrees,'trianglePairs':len(overlap)})
        shackle.rotation_euler=rest[shackle];Update()
        reports.append({'check':'front tow shackle against body outside its pin bearing','samples':7,
                        'bearingContactRadiusM':.025,'passed':not collisions,'collisions':collisions})
    hasCommanderInterface=any(obj.name=='CommanderHingeFixed' or obj.name.startswith('CommanderHingeFixed.') for obj in objects)
    hasRearInterface=any(obj.name=='RearDoorHingeFixed' or obj.name.startswith('RearDoorHingeFixed.')for obj in objects)
    strictSidePorts={name for name,owner in sidePortOwners.items()if any(obj.name==owner or obj.name.startswith(owner+'.')for obj in objects)}
    strictDriverCovers={name for name,owner in [('DriverRoof','DriverRoofHingeFixed'),('DriverVisor','DriverVisorHingeFixed')]
                        if any(obj.name==owner or obj.name.startswith(owner+'.')for obj in objects)}
    coverInterfaces=[('Commander',0,-1),('DriverRoof',0,1),('DriverVisor',0,1),('Engine',0,1),('RearCargo',2,1),('DriverPortLeft',1,1),('TurretPortLeft',1,1),('TurretPortRight',1,-1)]
    if any(obj.name=='Hatch_DriverPortRight' or obj.name.startswith('Hatch_DriverPortRight.')for obj in objects):coverInterfaces.append(('DriverPortRight',1,-1))
    if hasTurretRear:coverInterfaces.append(('TurretRear',2,-1))
    for name,axis,sign in coverInterfaces:
        pose=(operatingPose or {}).get(name)
        if pose:
            gun.rotation_euler.x=math.radians(pose['gunElevationDegrees']);Update()
        hatch=Find('Hatch_'+name);parts=Descendants(hatch);origin=hatch.matrix_world.translation.copy()
        sign=hatch.get('OpenSignLocal',sign)
        axis='XYZ'.index(hatch.get('HingeAxisLocal','XYZ'[axis]))
        # Corrected interfaces cannot relax their test by editing an extra.
        zeroContact=(name=='Commander' and hasCommanderInterface) or (name=='RearCargo' and hasRearInterface) or name=='TurretRear' or name in strictSidePorts or name in strictDriverCovers or (name=='Engine' and hatch.get('HingeAxisLocal')=='Y')
        contactAllowance=0 if zeroContact else .045
        includeSeal=zeroContact and (name in ['Commander','RearCargo','TurretRear'] or name in strictSidePorts or name in strictDriverCovers)
        vector=hatch.matrix_world.to_3x3()@Vector((1,0,0) if axis==0 else ((0,1,0) if axis==1 else (0,0,1)))
        vector.normalize()
        def OutsideContact(p):
            delta=p-origin;radial=delta-vector*delta.dot(vector)
            return radial.length>contactAllowance
        rigid={obj for obj in meshes-parts if includeSeal or not all(material and 'Type94Dark' in material.name for material in obj.data.materials)}
        fixedTree=Tree(rigid,OutsideContact);collisions=[]
        angles=(list(range(0,100,5))+[99] if name=='RearCargo'else list(range(0,101,5))+[100.8]) if includeSeal else [0,15,30,45,60,75,90,99 if name=='RearCargo' else 100.8]
        for angle in angles:
            OpenHatch(hatch,angle,defaultAxis='XYZ'[axis],defaultSign=sign);Update()
            tree=Tree(parts,OutsideContact);overlap=tree.overlap(fixedTree)
            if overlap:collisions.append({'openingDeg':angle,'trianglePairs':len(overlap)})
        CloseHatch(hatch)
        if pose:gun.rotation_euler=rest[gun]
        Update()
        reports.append({'check':name+' cover sweep','samples':len(angles),'hingeContactAllowanceM':contactAllowance,'includesDarkSeal':includeSeal,'passed':not collisions,'collisions':collisions})
        if pose:reports[-1]['explicitOperatingPose']=pose
    for obj,(mode,matrix) in originalTransforms.items():obj.rotation_mode=mode;obj.matrix_basis=matrix
    Update()
    return {'actualImportedScene':scene.name,'sha256':scene.get('SourceGltfSha256'),'checks':reports,'passed':all(row['passed'] for row in reports)}


if globals().get('__name__') in (None,'__main__'):
    scene=next(s for s in bpy.data.scenes if s.name.startswith('Scene_Type94ActualGameReimport'))
    result=VerifyScene(scene)
    out=Path(os.environ.get('TYPE94_SOURCE_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette'))/'Acceptance/Data_ActualSweepAudit.json'
    out.write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result,indent=2))
    if not result['passed']:raise RuntimeError('Type94 exported mechanism sweep failed; inspect the saved report')
