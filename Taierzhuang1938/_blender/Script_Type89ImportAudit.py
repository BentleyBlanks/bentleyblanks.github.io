"""Re-import the delivered GLB, then audit rigid track/wheel surfaces directly.

This is a controlled background verification, not a persistent Blender service.
The collision pass reads the exported triangles and uses the actual glTF node
hierarchy. It does not rely on a Blender authoring mesh or a screenshot.
"""
import bpy
import json
import hashlib
import math
from pathlib import Path
import struct
import sys
from mathutils import Matrix,Quaternion,Vector
from mathutils.bvhtree import BVHTree

repoDir=Path(__file__).resolve().parents[2]
reviewDir=repoDir/'Taierzhuang1938/_shots/Type89MediumTank'
arguments=sys.argv[sys.argv.index('--')+1:] if '--'in sys.argv else []
file=Path(arguments[0]) if arguments else repoDir/'Taierzhuang1938/Model/Type89MediumTank/Model_Type89MediumTank.glb'
assert bpy.app.background,'This audit must run in the owned background process'
assert 'Type89MediumTank'in str(file.resolve()),'Wrong asset path'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(file))
imported={'objects':len(bpy.data.objects),'meshes':len(bpy.data.meshes),'images':len(bpy.data.images),'materials':len(bpy.data.materials),'roots':[obj.name for obj in bpy.data.objects if obj.parent is None]}
data=file.read_bytes();jsonLength,jsonType=struct.unpack_from('<II',data,12);g=json.loads(data[20:20+jsonLength]);offset=20+jsonLength;binary=data[offset+8:]
pathArgument=next((value.split('=',1)[1] for value in arguments if value.startswith('--track-path=')),None)
pathFile=Path(pathArgument).resolve() if pathArgument else repoDir/'Taierzhuang1938/Model/Type89MediumTank/Data_TrackPath.json'
outputArgument=next((value.split('=',1)[1] for value in arguments if value.startswith('--out=')),None)
outputFile=Path(outputArgument).resolve() if outputArgument else reviewDir/'Data_ImportedCollisionAudit.json'
path=json.loads(pathFile.read_text(encoding='utf8'))
def Access(index):
    accessor=g['accessors'][index];view=g['bufferViews'][accessor['bufferView']]
    count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[accessor['type']]
    code,width={5126:('f',4),5125:('I',4),5123:('H',2),5121:('B',1)}[accessor['componentType']]
    base=view.get('byteOffset',0)+accessor.get('byteOffset',0);stride=view.get('byteStride',count*width)
    return [struct.unpack_from('<'+code*count,binary,base+i*stride) for i in range(accessor['count'])]
def Transform(node):
    if 'matrix'in node:return Matrix([node['matrix'][i:i+4] for i in range(0,16,4)]).transposed()
    x,y,z,w=node.get('rotation',[0,0,0,1])
    return Matrix.Translation(Vector(node.get('translation',[0,0,0])))@Quaternion((w,x,y,z)).to_matrix().to_4x4()@Matrix.Diagonal((*node.get('scale',[1,1,1]),1))
static=[Transform(node) for node in g['nodes']]
indicesByName={node.get('name'):i for i,node in enumerate(g['nodes'])}
meshes={}
for i,mesh in enumerate(g['meshes']):
    vertices=[];triangles=[]
    for primitive in mesh['primitives']:
        positions=Access(primitive['attributes']['POSITION']);indices=[x[0] for x in Access(primitive['indices'])]
        base=len(vertices);vertices.extend(Vector(point) for point in positions)
        triangles.extend(tuple(base+index for index in indices[k:k+3]) for k in range(0,len(indices),3))
    meshes[i]=(vertices,triangles)
def Point(distance):
    distance%=path['length']
    for segment in path['segments']:
        if distance<=segment['s']+segment['length']+1e-7:
            t=(distance-segment['s'])/segment['length'];a,b=segment['a'],segment['b']
            return (a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t)
def Shoe(distance):
    a=Point(distance-path['pitchM']/2);b=Point(distance+path['pitchM']/2)
    return ((a[0]+b[0])/2,(a[1]+b[1])/2,math.atan2(b[1]-a[1],b[0]-a[0])+math.pi)
links=[i for i,node in enumerate(g['nodes']) if node.get('name','').startswith('Node_TrackLink')]
wheels=[i for i,node in enumerate(g['nodes']) if node.get('name','').startswith(('Node_RoadWheel','Node_LeadingWheel','Node_FrontIdler','Node_RearSprocket','Node_ReturnRoller'))]
assert len(links)==2*path['linksPerSide'],'The motion path must belong to the imported articulated track count'
def World(pose):
    matrices={}
    def Visit(i,parent):
        matrix=parent@pose.get(i,static[i]);matrices[i]=matrix
        for child in g['nodes'][i].get('children',[]):Visit(child,matrix)
    for root in g['scenes'][g.get('scene',0)]['nodes']:Visit(root,Matrix.Identity(4))
    return matrices
def Geometry(index,world,direct=False):
    vertices=[];triangles=[]
    def Visit(i):
        node=g['nodes'][i]
        if direct and i!=index and node.get('name','').startswith('Node_'):return
        if 'mesh'in node:
            points,faces=meshes[node['mesh']];base=len(vertices)
            vertices.extend(world[i]@point for point in points);triangles.extend(tuple(base+j for j in face) for face in faces)
        for child in node.get('children',[]):Visit(child)
    Visit(index)
    return vertices,triangles
def Bvh(geometry):return BVHTree.FromPolygons(*geometry,all_triangles=True,epsilon=0)
def Bounds(geometry):return [(min(point[a] for point in geometry[0]),max(point[a] for point in geometry[0])) for a in range(3)]
def BoundsOverlap(a,b):return all(a[i][0]<=b[i][1] and b[i][0]<=a[i][1] for i in range(3))
fixed=[i for i,node in enumerate(g['nodes']) if node.get('name') in ['Node_Hull','Node_BowPlate','Node_SuspensionLeft','Node_SuspensionRight','Node_UnderfloorDetail'] or node.get('name','').startswith(('Node_SuspensionCover','Node_InboardIdlerSupport','Node_VerticalSkirt','Node_BogieSpringUnit','Node_OuterBogieCheek'))]
fixedWorld=World({});fixedData={}
for index in fixed:
    geometry=Geometry(index,fixedWorld,True)
    if geometry[0]:fixedData[index]=(geometry,Bvh(geometry),Bounds(geometry))
fixedContacts={};fixedPenetration=0.0;fixedPairs=0
contacts={};maximumPenetration=0.0;testedPairs=0
for frame in range(36):
    distance=path['pitchM']*frame/36;pose={}
    for i in links:
        node=g['nodes'][i];y,z,angle=Shoe(node['extras']['phaseM']-distance)
        pose[i]=Matrix.Translation(Vector((node['translation'][0],z,-y)))@Matrix.Rotation(angle,4,'X')
    for i in wheels:
        pose[i]=static[i]@Matrix.Rotation(-distance/g['nodes'][i]['extras']['radiusM'],4,'X')
    world=World(pose);wheelData={i:(Geometry(i,world),None) for i in wheels}
    wheelData={i:(geometry,Bvh(geometry)) for i,(geometry,_) in wheelData.items()}
    for link in links:
        center=world[link].translation
        nearby=[wheel for wheel in wheels if abs(world[wheel].translation.x-center.x)<.25 and (world[wheel].translation-center).length<g['nodes'][wheel]['extras'].get('geometryRadiusM',g['nodes'][wheel]['extras']['radiusM'])+.14]
        linkGeometry=Geometry(link,world);linkBvh=Bvh(linkGeometry)
        for wheel in nearby:
            testedPairs+=1;wheelGeometry,wheelBvh=wheelData[wheel]
            overlap=linkBvh.overlap(wheelBvh)
            if not overlap:continue
            key=g['nodes'][wheel]['name'];row=contacts.setdefault(key,{'frames':set(),'trianglePairs':0,'maximumVertexPenetrationM':0.0})
            row['frames'].add(frame);row['trianglePairs']+=len(overlap)
            verticesToCheck={index for a,b in overlap for index in linkGeometry[1][a]}
            for index in verticesToCheck:
                point=linkGeometry[0][index];nearest,normal,_,separation=wheelBvh.find_nearest(point)
                if nearest is None:continue
                signed=(point-nearest).dot(normal)
                if signed<0:
                    if -signed>row['maximumVertexPenetrationM']:
                        row['deepestContact']={'frame':frame,'link':g['nodes'][link]['name'],'pointWorld':list(point),'pointRelativeWheel':list(point-world[wheel].translation),'nearestWorld':list(nearest),'surfaceNormal':list(normal)}
                    row['maximumVertexPenetrationM']=max(row['maximumVertexPenetrationM'],-signed);maximumPenetration=max(maximumPenetration,-signed)
        linkBounds=Bounds(linkGeometry)
        for index,(geometry,bvh,bounds) in fixedData.items():
            if not BoundsOverlap(linkBounds,bounds):continue
            fixedPairs+=1;overlap=linkBvh.overlap(bvh)
            if not overlap:continue
            key=g['nodes'][index]['name'];row=fixedContacts.setdefault(key,{'frames':set(),'trianglePairs':0,'maximumVertexPenetrationM':0.0})
            row['frames'].add(frame);row['trianglePairs']+=len(overlap)
            for vertexIndex in {j for a,b in overlap for j in linkGeometry[1][a]}:
                point=linkGeometry[0][vertexIndex];nearest,normal,_,_=bvh.find_nearest(point)
                if nearest is None:continue
                signed=(point-nearest).dot(normal)
                if signed<0:
                    if -signed>row['maximumVertexPenetrationM']:row['deepestContact']={'frame':frame,'link':g['nodes'][link]['name'],'pointWorld':list(point),'nearestWorld':list(nearest),'surfaceNormal':list(normal)}
                    row['maximumVertexPenetrationM']=max(row['maximumVertexPenetrationM'],-signed);fixedPenetration=max(fixedPenetration,-signed)
for row in contacts.values():row['frames']=sorted(row['frames'])
for row in fixedContacts.values():row['frames']=sorted(row['frames'])
hardwareRows=[];hardwarePenetration=0.0
for moving,sign,targets,angles in [
    ('Node_BowHatch',1,['Node_BowPlate','Node_Hull','Node_BowDoorFixedHinge']+[name for name in ['Node_BowDoorCatch','Node_InboardIdlerSupportLeft','Node_InboardIdlerSupportRight']if name in indicesByName],[0,2,5,15,30,45,55,65]),
    ('Node_SideVisionFlapLeft',-1,['Node_Hull','Node_SideVisionFrameLeft'],list(range(0,176,5))),
    ('Node_SideVisionFlapRight',1,['Node_Hull','Node_SideVisionFrameRight'],list(range(0,176,5)))]:
    for angle in angles:
        index=indicesByName[moving]
        pose={index:static[index]@Matrix.Rotation(math.radians(sign*angle),4,'Y')}
        latchName=moving.replace('Flap','Latch')
        if 'SideVisionFlap' in moving and latchName in indicesByName:
            latch=indicesByName[latchName];settings=g['nodes'][latch]['extras']
            t=max(0,min(1,(angle-settings['latchDeployStartDegrees'])/(settings['latchDeployEndDegrees']-settings['latchDeployStartDegrees'])))
            pose[latch]=static[latch]@Matrix.Rotation(-math.radians(settings['latchFoldDegrees'])*t*t*(3-2*t),4,'X')
        world=World(pose)
        a=Geometry(index,world);av=Bvh(a);axisWorld=world[index];origin=axisWorld.translation
        axis=(axisWorld.to_3x3()@Vector((0,1,0))).normalized()
        bearingRadius=.020 if 'SideVision'in moving else .025
        for target in targets:
            # A hidden dark back is a simplified interior, not sheet metal.
            targetGeometry=Geometry(indicesByName[target],world,True)
            targetBvh=Bvh(targetGeometry);pairs=av.overlap(targetBvh);depth=0.0
            for vertexIndex in {j for first,second in pairs for j in a[1][first]}:
                point=a[0][vertexIndex];delta=point-origin
                if (delta-axis*delta.dot(axis)).length<bearingRadius:continue
                nearest,normal,_,_=targetBvh.find_nearest(point)
                if nearest is not None:depth=max(depth,-(point-nearest).dot(normal))
            hardwareRows.append({'moving':moving,'target':target,'angleDegrees':angle,'trianglePairs':len(pairs),'maximumPenetrationM':depth})
            hardwarePenetration=max(hardwarePenetration,depth)
maintenanceRows=[];maintenanceClearances=[];maintenancePoses=0
baseMaintenancePose={indicesByName['Node_TurretYaw']:static[indicesByName['Node_TurretYaw']]@Matrix.Rotation(math.pi/2,4,'Y')}
for side,sign in [('Left',-1),('Right',1)]:
    moving='Node_EngineHatch'+side;index=indicesByName[moving]
    other='Node_EngineHatch'+('Right' if side=='Left' else 'Left')
    for mode in ['Independent','BothOpen']:
        for angle in range(0,51,5):
            pose=dict(baseMaintenancePose);pose[index]=static[index]@Matrix.Rotation(sign*math.radians(angle),4,'Z')
            if mode=='BothOpen':pose[indicesByName[other]]=static[indicesByName[other]]@Matrix.Rotation(-sign*math.radians(angle),4,'Z')
            world=World(pose);a=Geometry(index,world);tree=Bvh(a);maintenancePoses+=1
            for target,direct in [('Node_ExhaustGuard',False),('Node_Hull',True),('Node_TurretYaw',False),('Node_RearLamp',False),('Node_EngineDeck',True),(other,False)]:
                pairs=tree.overlap(Bvh(Geometry(indicesByName[target],world,direct)))
                if pairs:maintenanceRows.append({'moving':moving,'target':target,'mode':mode,'angleDegrees':angle,'trianglePairs':len(pairs)})
    samples=[];limit=math.radians(50)
    for angle in [0,math.pi/2,math.pi]:
        pose=dict(baseMaintenancePose);pose[index]=static[index]@Matrix.Rotation(sign*angle,4,'Z')
        samples.append(Geometry(index,World(pose))[0])
    minimumX=1e20
    for a,b,c in zip(*samples):
        centre=(a.x+c.x)/2;cosine=(a.x-c.x)/2;sine=b.x-centre;stationary=math.atan2(sine,cosine)
        angles=[0,limit]+[theta for theta in [stationary+k*math.pi for k in range(-2,3)] if 0<=theta<=limit]
        minimumX=min(minimumX,*(centre+cosine*math.cos(theta)+sine*math.sin(theta) for theta in angles))
    baseWorld=World(baseMaintenancePose)
    guardMaximum=max(point.x for point in Geometry(indicesByName['Node_ExhaustGuard'],baseWorld)[0])
    lampMaximum=max(point.x for point in Geometry(indicesByName['Node_RearLamp'],baseWorld)[0])
    maintenanceClearances.append({'moving':moving,'continuousGuardClearanceM':minimumX-guardMaximum,'continuousLampClearanceM':minimumX-lampMaximum,'method':'Sinusoidal extrema of every actual rigid vertex throughout0..50degrees'})
maintenancePass=not maintenanceRows and all(row['continuousGuardClearanceM']>.001 and row['continuousLampClearanceM']>.001 for row in maintenanceClearances)
def Descendants(index):
    found={index}
    for child in g['nodes'][index].get('children',[]):found.update(Descendants(child))
    return found

# The new sheath must clear the complete imported vehicle while its ball aims.
# Ball/socket contact itself is intentional; separately check only the lower
# fixed region containing the added mounting foot against the moving ball.
rearGunSweep=None
geometryVersion=next((n.get('extras',{}).get('geometryVersion')for n in g['nodes']if n.get('extras',{}).get('geometryVersion')),'GeometryV0')
runningGearWheelSweep=None
bowGunSweep=None
if int(geometryVersion.split('GeometryV')[-1])>=53:
    sys.path.insert(0,str(Path(__file__).resolve().parent))
    from Script_Type89BowDoorResolvedAudit import AuditBowMachineGunWithRuntime
    bowGunSweep=AuditBowMachineGunWithRuntime(g['nodes'],indicesByName,static,World,Geometry,Bvh,Descendants,Bounds,BoundsOverlap,file,pathFile,outputFile.parent)
if int(geometryVersion.split('GeometryV')[-1])>=48:
    sys.path.insert(0,str(Path(__file__).resolve().parent))
    from Script_Type89RunningGearSweep import AuditRunningGearWheelSweep
    runningGearWheelSweep=AuditRunningGearWheelSweep(g['nodes'],indicesByName,fixedWorld,Geometry,wheels)
frontFixedSweep=None
if int(geometryVersion.split('GeometryV')[-1])>=45:
    sys.path.insert(0,str(Path(__file__).resolve().parent))
    from Script_Type89FrontFixedAudit import AuditFrontFixedSweep
    frontFixedSweep=AuditFrontFixedSweep(indicesByName,static,World,Geometry,Bvh)
if int(geometryVersion.split('GeometryV')[-1])>=44:
    gunIndex=indicesByName['Node_TurretMachineGun'];mountIndex=indicesByName['Node_TurretMgMount'];gunParts=Descendants(gunIndex)
    def MaterialGeometry(index,world,suffix=None,lowerFixed=False):
        vertices=[];triangles=[];inverse=world[index].inverted()
        def Visit(i):
            node=g['nodes'][i]
            if i!=index and node.get('name','').startswith('Node_'):return
            if 'mesh'in node:
                for primitive in g['meshes'][node['mesh']]['primitives']:
                    if suffix and not g['materials'][primitive['material']]['name'].endswith(suffix):continue
                    points=[world[i]@Vector(p)for p in Access(primitive['attributes']['POSITION'])];ids=[p[0]for p in Access(primitive['indices'])];base=len(vertices);vertices.extend(points)
                    for k in range(0,len(ids),3):
                        face=tuple(ids[k:k+3])
                        if lowerFixed and not all((inverse@points[j]).y<-.114 for j in face):continue
                        triangles.append(tuple(base+j for j in face))
            for child in node.get('children',[]):Visit(child)
        Visit(index);return vertices,triangles
    targets={}
    for i,node in enumerate(g['nodes']):
        if 'mesh'in node and i not in gunParts:
            geom=Geometry(i,fixedWorld);targets[i]=(Bvh(geom),Bounds(geom))
    lowerFoot=MaterialGeometry(mountIndex,fixedWorld,'Armor',True);assert len(lowerFoot[1])>4
    lowerTree=Bvh(lowerFoot);contacts=[];poses=0;nearby=0
    for yaw in [-10,-5,0,5,10]:
        for pitch in [-10,-5,0,5,10]:
            pose={gunIndex:static[gunIndex]@Matrix.Rotation(math.radians(yaw),4,'Y')@Matrix.Rotation(math.radians(pitch),4,'X')};world=World(pose)
            sheath=MaterialGeometry(gunIndex,world,'Steel');assert sheath[1];tree=Bvh(sheath);bounds=Bounds(sheath);poses+=1
            for target,(targetTree,targetBounds)in targets.items():
                if not BoundsOverlap(bounds,targetBounds):continue
                nearby+=1;pairs=tree.overlap(targetTree)
                if pairs:contacts.append({'yaw':yaw,'pitch':pitch,'moving':'Sheath','target':g['nodes'][target]['name'],'trianglePairs':len(pairs)})
            ball=MaterialGeometry(gunIndex,world,'Armor');pairs=Bvh(ball).overlap(lowerTree)
            if pairs:contacts.append({'yaw':yaw,'pitch':pitch,'moving':'Ball','target':'LowerFixedMountRegion','trianglePairs':len(pairs)})
    rearGunSweep={'pass':not contacts,'sampledPoses':poses,'testedNearbyPairs':nearby,'intersections':contacts,'scope':'Actual Steel sheath versus every other exported mesh; moving Armor ball versus fixed mount below localY=-114mm. Intended ball/socket contact is excluded.'}

# A recessed shutter must rotate behind its peeper plate without touching the
# plate, knob, rivets or any other nearby exported mesh as the whole visor lifts.
shutter=indicesByName['Node_DriverPortShutter'];visor=indicesByName['Node_DriverVisionFlap']
shutterParts=Descendants(shutter);visorParts=Descendants(visor)-shutterParts
shutterTargets=[i for i,node in enumerate(g['nodes']) if 'mesh'in node and i not in shutterParts]
shutterFixed={};shutterRows=[];shutterPoses=0;shutterNearbyPairs=0
for target in shutterTargets:
    if target not in visorParts:
        geometry=Geometry(target,fixedWorld)
        shutterFixed[target]=(Bvh(geometry),Bounds(geometry))
for visorAngle in range(0,106,5):
    pose={visor:static[visor]@Matrix.Rotation(math.radians(visorAngle),4,'X')}
    world=World(pose);targetData=dict(shutterFixed)
    for target in shutterTargets:
        if target in visorParts:
            geometry=Geometry(target,world)
            targetData[target]=(Bvh(geometry),Bounds(geometry))
    for shutterAngle in range(0,181,5):
        pose[shutter]=static[shutter]@Matrix.Rotation(-math.radians(shutterAngle),4,'Z')
        world=World(pose);geometry=Geometry(shutter,world);bounds=Bounds(geometry);tree=Bvh(geometry);shutterPoses+=1
        for target,(targetTree,targetBounds) in targetData.items():
            if not BoundsOverlap(bounds,targetBounds):continue
            shutterNearbyPairs+=1;pairs=tree.overlap(targetTree)
            if pairs:shutterRows.append({'visorDegrees':visorAngle,'shutterDegrees':shutterAngle,'target':g['nodes'][target]['name'],'trianglePairs':len(pairs)})
shutterPass=not shutterRows
report={'file':str(file.resolve()),'sha256':hashlib.sha256(data).hexdigest(),'imported':imported,'links':len(links),'wheelGroups':len(wheels),'phaseSamples':36,'testedNearbyPairs':testedPairs,'contacts':contacts,'maximumVertexPenetrationM':maximumPenetration,'fixedCoverGroups':len(fixedData),'fixedPairs':fixedPairs,'fixedContacts':fixedContacts,'maximumFixedCoverPenetrationM':fixedPenetration,'pass':maximumPenetration<.001 and fixedPenetration<.001,'note':'Actual exported triangles; wheel rolling contact allowed below1mm; fixed hull/fender/cover intersections above1mm block acceptance'}
report.update(hardwareSweep=hardwareRows,maximumHardwarePenetrationM=hardwarePenetration)
report.update(maintenance={'pass':maintenancePass,'turretYawDegrees':90,'sampledPoses':maintenancePoses,'intersections':maintenanceRows,'continuousOutboardClearances':maintenanceClearances})
report['driverShutterSweep']={'pass':shutterPass,'sampledPoses':shutterPoses,'exportedTargetMeshes':len(shutterTargets),'nearbyPairs':shutterNearbyPairs,'intersections':shutterRows,'scope':'22 visor states0..105 x37 shutter states0..180 against every other exported mesh by bounds; hidden rotary pocket remains a functional inference'}
if rearGunSweep:report['rearMachineGunSweep']=rearGunSweep
if bowGunSweep:report['bowMachineGunSweep']=bowGunSweep
report['pass']=report['pass'] and hardwarePenetration<.001 and maintenancePass and shutterPass
if rearGunSweep:report['pass']=report['pass']and rearGunSweep['pass']
if bowGunSweep:report['pass']=report['pass']and bowGunSweep['pass']
if frontFixedSweep:
    report['frontFixedSweep']=frontFixedSweep
    report['pass']=report['pass']and frontFixedSweep['pass']
if runningGearWheelSweep:
    report['runningGearWheelSweep']=runningGearWheelSweep
    report['pass']=report['pass']and runningGearWheelSweep['pass']
outputFile.parent.mkdir(parents=True,exist_ok=True)
outputFile.write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report))
if not report['pass']:raise RuntimeError('Exported track, fixed cover or articulated hardware penetration exceeds1mm')
