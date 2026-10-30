"""Compare actual imported geometry, retained numerical sites and native picks."""
import bpy,hashlib,json,math,numpy as np
from pathlib import Path
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree
from bpy_extras.object_utils import world_to_camera_view
repo=Path.cwd();base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'ReferenceV60';acc=root/'Acceptance';acc.mkdir(parents=True,exist_ok=True)
glb=base/'VentV55/Exports/Model_Type94TanketteHighShapeV55VentTrial.glb';manifest=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GrayTrialV55.json').read_text());assert hashlib.sha256(glb.read_bytes()).hexdigest()==manifest['sha256'];assert not bpy.data.filepath
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(glb));scene=bpy.context.scene;scene['BlenderMcpTask']='Type94Tankette';bpy.context.view_layer.update();asset=bpy.data.objects['Type94Tankette'];hull=bpy.data.objects['Hull'];turret=bpy.data.objects['TurretYaw'];rest=turret.matrix_basis.copy();shift=asset.matrix_world.translation.z+.004
qFile=root/'Inputs/Data_GeneratorEnvelopeAuditV52.json';q=json.loads(qFile.read_text());s=q['shapeParameters'];c=q['circularParameters'];sizes={};rows=json.loads((root/'Inputs/Data_FiveViewPhysicalBundleV41.json').read_text(encoding='utf-8-sig'))['rows'];observations={r['name']:r for r in rows};result=[];parity=[];frames={};crownRays=[]
def Project(points,camera,distorted=True):
    r=np.array(camera['rotationCameraFromBlender']);t=np.array(camera['translationCameraFromBlender']);k=np.array(camera['k']);p=np.array(points)@r.T+t;xy=p[:,:2]/p[:,2:]
    if distorted:
        d=list(camera['distortion'])+[0]*5;x,y=xy[:,0],xy[:,1];r2=x*x+y*y;radial=1+d[0]*r2+d[1]*r2*r2+d[4]*r2*r2*r2;xy=np.c_[x*radial+2*d[2]*x*y+d[3]*(r2+2*x*x),y*radial+d[2]*(r2+2*y*y)+2*d[3]*x*y]
    return xy*[k[0,0],k[1,1]]+k[:2,2]
def FitFrame(world):return np.array(world)-[0,0,shift]
def AssetTree():
    points=[];faces=[];owners=[]
    for obj in asset.children_recursive:
        if obj.type!='MESH':continue
        offset=len(points);points.extend(obj.matrix_world@v.co for v in obj.data.vertices)
        for face in obj.data.polygons:faces.append([offset+i for i in face.vertices]);owners.append(obj.name)
    return BVHTree.FromPolygons(points,faces,all_triangles=True),owners
def Visibility(point,observed,record,tree,owners,wheelIndex):
    r=np.array(record['rotationCameraFromBlender']);t=np.array(record['translationCameraFromBlender']);origin=Vector(-r.T@t)+Vector((0,0,shift));target=Vector(point)+Vector((0,0,shift));delta=target-origin;hit=tree.ray_cast(origin,delta.normalized(),delta.length+.00001);owner=owners[hit[2]]if hit[2]is not None else None;visible=hit[2]is not None and abs(hit[3]-delta.length)<.0001
    k=np.array(record['k']);distorted=(np.array(observed)-k[:2,2])/[k[0,0],k[1,1]];u=distorted.copy();d=list(record['distortion'])+[0]*5
    for _ in range(20):
        x,y=u;r2=x*x+y*y;scale=1+d[0]*r2+d[1]*r2*r2+d[4]*r2*r2*r2;offset=np.array([2*d[2]*x*y+d[3]*(r2+2*x*x),d[2]*(r2+2*y*y)+2*d[3]*x*y]);u=(distorted-offset)/scale
    direction=Vector(r.T@np.r_[u,1.]).normalized();observedHit=tree.ray_cast(origin,direction,100);atObserved=None
    if observedHit[2]is not None:
        wheel=bpy.data.objects['Wheel_Left_Road'+str(wheelIndex)];local=wheel.matrix_world.inverted()@observedHit[0];atObserved=dict(owner=owners[observedHit[2]],pointFitFrameM=FitFrame(observedHit[0]).tolist(),outwardDepthFromWheelAxisM=-local.x,radialDistanceFromWheelAxisM=math.hypot(local.y,local.z))
    return dict(targetVisible=visible,firstOwner=owner,obstructionDistanceM=delta.length-hit[3]if hit[2]is not None else None,atObservedPixel=atObserved,comparisonAdmissibleAsSameVisibleFeature=False,reason='The retained pick is an axle-cover optical site; a hidden rotating hub centre is not the same observed feature')
def Components(mesh):
    points=np.array([tuple(v.co)for v in mesh.vertices]);_,first,mapping=np.unique(points,axis=0,return_index=True,return_inverse=True);adjacent=[set()for i in first]
    for face in mesh.polygons:
        ids=[int(mapping[i])for i in face.vertices]
        for a,b in zip(ids,ids[1:]+ids[:1]):adjacent[a].add(b);adjacent[b].add(a)
    unseen=set(range(len(first)))
    while unseen:
        stack=[unseen.pop()];ids=[]
        while stack:
            i=stack.pop();ids.append(i)
            for j in adjacent[i]:
                if j in unseen:unseen.remove(j);stack.append(j)
        yield [int(first[i])for i in ids]
def HubRing(side,index):
    obj=bpy.data.objects['Geometry_Wheel_'+side+'_Road'+str(index)+'_Paint'];sign=-1 if side=='Left'else 1
    for ids in Components(obj.data):
        p=np.array([tuple(obj.data.vertices[i].co)for i in ids]);radius=np.linalg.norm(p[:,1:],axis=1)
        if abs(np.ptp(p[:,0])-.130)<1e-5 and abs(radius.max()-.060)<1e-5:
            front=abs(p[:,0]-sign*.065)<2e-6;ring=p[front&(radius>.04)];centre=np.array([sign*.065,0,0]);return FitFrame(obj.matrix_world@Vector(centre)),[FitFrame(obj.matrix_world@Vector(point))for point in ring]
    raise RuntimeError('Actual front hub ring not identified: '+side+str(index))
def EllipseCentre(points):
    p=np.array(points);mean=p.mean(axis=0);scale=np.sqrt(np.mean(np.sum((p-mean)**2,axis=1)));x,y=((p-mean)/scale).T;_,_,v=np.linalg.svd(np.c_[x*x,x*y,y*y,x,y,np.ones(len(x))]);a,b,c,d,e,f=v[-1];return mean+scale*np.linalg.solve([[2*a,b],[b,2*c]],[-d,-e])
wheelCurves=[]
for i in range(4):
    centre,ring=HubRing('Left',i);obj=bpy.data.objects['Wheel_Left_Road'+str(i)+'_Tyre'];points=np.unique(np.array([tuple(v.co)for v in obj.data.vertices]),axis=0);groups={}
    for point in points:
        if point[0]>=0:continue
        groups.setdefault((round(float(point[0]),6),round(float(np.linalg.norm(point[1:])),6)),[]).append(point)
    curves=[]
    for (axial,radius),points in sorted(groups.items(),key=lambda row:row[0][1]):
        points=sorted(points,key=lambda p:math.atan2(p[2],p[1]));curves.append(dict(axialLocalM=axial,radiusM=radius,pointsFitFrameM=[FitFrame(obj.matrix_world@Vector(p)).tolist()for p in points]))
    wheelCurves.append(dict(name='RoadCap'+str(i),hubCentreFitFrameM=centre.tolist(),hubRingFitFrameM=[p.tolist()for p in ring],tyreCurves=curves))
images=json.loads((root/'Inputs/Data_ImagesV60.json').read_text());sizes={name:row['size']for name,row in images.items()};assert set(['2017','2014','TourGuide','2','7'])<=sizes.keys()
for cameraName in ['2017','2014','TourGuide','2','7']:
    record=q['cameras'][cameraName];yaw=record.get('turretYawRadians',0);turret.matrix_basis=rest@Matrix.Rotation(yaw,4,'Z');bpy.context.view_layer.update();r=Matrix(record['rotationCameraFromBlender']);t=Vector(record['translationCameraFromBlender']);k=np.array(record['k']);width,height=sizes[cameraName]
    data=bpy.data.cameras.new('Camera_ProjectionAudit'+cameraName);camera=bpy.data.objects.new(data.name,data);scene.collection.objects.link(camera);camera.location=-(r.transposed()@t)+Vector((0,0,shift));camera.rotation_euler=(r.transposed()@Matrix.Diagonal((1.,-1.,-1.))).to_euler();data.sensor_fit='HORIZONTAL';data.sensor_width=36;data.lens=k[0,0]*36/width;data.shift_x=(width/2-k[0,2])/width;data.shift_y=(k[1,2]-height/2)/width;scene.camera=camera;scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100;bpy.context.view_layer.update()
    tree,owners=AssetTree()
    actual={};virtual={};contacts=np.array(turret['PairedRivetSurfacePointsLeftLocalM']).reshape(-1,3);normals=np.array(turret['PairedRivetSurfaceNormalsLeftLocal']).reshape(-1,3);rotation=np.array([[math.cos(yaw),-math.sin(yaw),0],[math.sin(yaw),math.cos(yaw),0],[0,0,1]])
    for name,point,normal in zip(q['rivetLocalSites'],contacts,normals):
        contact=turret.matrix_world@Vector(point);direction=(turret.matrix_world.to_3x3()@Vector(normal)).normalized();hit=tree.ray_cast(contact+direction*.03,-direction,.04);assert hit[2]is not None
        crownHeightM=(hit[0]-contact).dot(direction);assert .003<crownHeightM<.01 and owners[hit[2]]=='Geometry_TurretYaw_Paint','Normal ray did not find the actual rivet crown'
        actual[name]=FitFrame(hit[0]);virtual[name]=np.array(q['rivetLocalSites'][name])@rotation.T+[s['TurretCenterX'],s['TurretCenterY'],s['RearDeckZ']-.004];crownRays.append(dict(camera=cameraName,name=name,heightM=crownHeightM,owner=owners[hit[2]]))
    for name,point in zip(['CabinFarTop','CabinNearTop','CabinNearBottom','CabinFarBottom'],np.array(hull['DriverFrontFrameCornersM']).reshape(-1,3)):actual[name]=FitFrame(hull.matrix_world@Vector(point));virtual[name]=actual[name]
    for i in range(4):
        name='RoadCap'+str(i);centre,ring=HubRing('Left',i);actual[name]=centre;ellipse=EllipseCentre(Project(ring,record));y=s['RoadFrontForward']-sum(s['RoadSpacing'+x]for x in ['01','12','23'][:i]);bias=q['capOpticalOffsetsYZM'][i];virtual[name]=[-s['TrackCenterX']-s['CapDepth'+str(i)],y+bias[0],c['TyreShoulderRadius']+c['TyreAxisMinusShoulderRadius']+q['wheelHeightOffsetsM'][i]+bias[1]-.004]
        if cameraName in observations[name]['observations']:
            observed=np.array(observations[name]['observations'][cameraName]);result.append(dict(camera=cameraName,name=name,kind='ActualFrontRingEllipse',observedNative=observed.tolist(),predictedNative=ellipse.tolist(),errorNative=float(np.linalg.norm(ellipse-observed))))
    for name,point in actual.items():
        if name not in observations or cameraName not in observations[name]['observations']:continue
        observed=np.array(observations[name]['observations'][cameraName]);pred=Project([point],record)[0];fit=Project([virtual[name]],record)[0];undistorted=Project([point],record,False)[0];world=Vector(point+[0,0,shift]);ndc=world_to_camera_view(scene,camera,world);blender=np.array([ndc.x*width,(1-ndc.y)*height]);parity.append(dict(camera=cameraName,name=name,errorNative=float(np.linalg.norm(blender-undistorted))))
        result.append(dict(camera=cameraName,name=name,kind='ActualCrown'if name.startswith('SidePair')else'ActualHubFrontCentre'if name.startswith('RoadCap')else'ActualDriverFrameDatum',fitFramePointM=point.tolist(),observedNative=observed.tolist(),predictedNative=pred.tolist(),errorNative=float(np.linalg.norm(pred-observed)),numericalSiteNative=fit.tolist(),numericalSiteErrorNative=float(np.linalg.norm(fit-observed)),sourceToNumericalSiteDistanceM=float(np.linalg.norm(point-virtual[name])),unappliedLensShiftNative=float(np.linalg.norm(undistorted-pred))))
        if name.startswith('RoadCap'):result[-1]['visibility']=Visibility(point,observed,record,tree,owners,int(name[-1]))
    frames[cameraName]=dict(rootTranslation=list(asset.matrix_world.translation),hullMatrix=[list(row)for row in hull.matrix_world],turretMatrix=[list(row)for row in turret.matrix_world])
turret.matrix_basis=rest
for row in result:
    if row['name'].startswith('RoadCap'):row.update(comparisonAdmissibleAsSameVisibleFeature=False,errorInterpretation='Geometric separation only; the actual rotating hub datum is occluded and is not the observed axle-cover optical site')
report=dict(schema='Type94ActualProjectionAuditV1',sha256=manifest['sha256'],cameraInputSha256=hashlib.sha256(qFile.read_bytes()).hexdigest(),sourceObservationFile='Data_FiveViewPhysicalBundleV41.json',sourceObservationHash=hashlib.sha256((root/'Inputs/Data_FiveViewPhysicalBundleV41.json').read_bytes()).hexdigest(),groundCompensationM=shift,rows=result,wheelCurvesFitFrame=wheelCurves,crownSurfaceRays=crownRays,projectionParity=parity,maximumPinholeParityErrorNative=max(r['errorNative']for r in parity),frames=frames,geometryChanged=False,newCalibrationAccepted=False,wholeReferenceAccepted=False,scope='Reused training pixels, actual crown surface rays and construction datums; hidden rotating-hub separation is not an admissible visible-shape residual. This is not fresh holdout validation')
report['projectionParityVerified']=report['maximumPinholeParityErrorNative']<.01
(acc/'Data_ActualProjectionV60.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(rows=len(result),maximumParityError=report['maximumPinholeParityErrorNative'],primary=[dict(name=x['name'],kind=x['kind'],actualError=x['errorNative'],virtualError=x.get('numericalSiteErrorNative'))for x in result if x['camera']=='2017']),indent=2),flush=True)
assert report['projectionParityVerified'],'Blender and mathematical projection disagree; do not accept comparison setup'
