"""Retest all current reduced running gear against real imported surfaces."""
import bpy,bisect,collections,hashlib,json,math,os,numpy as np
from pathlib import Path
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_GAME_ROOT',str(base/'GameTrialV100')));acc=root/'Acceptance';manifest=json.loads((acc/'Data_GamePbrV100.json').read_text());file=Path(manifest['sourceGlb']);assert hashlib.sha256(file.read_bytes()).hexdigest()==manifest['sha256'];assert not bpy.data.filepath;bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene['BlenderMcpTask']='Type94Tankette';bpy.ops.import_scene.gltf(filepath=str(file));bpy.context.view_layer.update();asset=bpy.data.objects['Type94Tankette'];actual=set(asset.children_recursive)
def Tree(objects):
    points=[];faces=[];owners=[]
    for obj in objects:
        if obj.type!='MESH':continue
        start=len(points);points.extend(obj.matrix_world@v.co for v in obj.data.vertices)
        for face in obj.data.polygons:faces.append([start+i for i in face.vertices]);owners.append(obj.name)
    return BVHTree.FromPolygons(points,faces,all_triangles=True),owners
wheels=[o for o in actual if o.name.startswith('Wheel_')and o.get('WheelRadiusM')];moving=set().union(*(set(w.children_recursive)for w in wheels));fixed=[o for o in actual if o.type=='MESH'and o not in moving and not o.name.startswith('TrackLink_')];fixedTree,owners=Tree(fixed);roadRows=[]
for wheel in sorted(wheels,key=lambda o:o.name):
    if'_Road'not in wheel.name:continue
    rest=wheel.matrix_basis.copy();collisions=[]
    for sample in range(16):
        wheel.matrix_basis=rest@Matrix.Rotation(sample*math.tau/16,4,'X');bpy.context.view_layer.update();tree,_=Tree(wheel.children_recursive);pairs=fixedTree.overlap(tree)
        if pairs:collisions.append(dict(angleDegrees=sample*22.5,pairs=len(pairs),owners=dict(collections.Counter(owners[i]for i,j in pairs))))
    wheel.matrix_basis=rest;bpy.context.view_layer.update();roadRows.append(dict(wheel=wheel.name,samples=16,contactExclusionM=0,collisions=collisions,passed=not collisions))
print('TYPE94_V100_ROAD_PHASES',all(r['passed']for r in roadRows),flush=True)
path=json.loads((base/'DetailV64/Acceptance/Data_MechanismShapeV64FrontDetailTrial.json').read_text())['path'];beltRows=[]
for side in ['Left','Right']:
    links=sorted([o for o in actual if o.name.startswith('TrackLink_'+side+'_')],key=lambda o:o['TrackIndex']);assert len(links)==80;linkSet=set(links);body=[o for o in actual if o.type=='MESH'and o not in linkSet and not o.name.startswith(('TrackLink_','Geometry_Wheel_','Wheel_'))];tree,owners=Tree(body)
    for sample in range(16):
        phase=path['pitchM']*sample/16
        for index,link in enumerate(links):
            s=(index*path['pitchM']+phase)%path['lengthM'];i=min(len(path['points'])-1,max(0,bisect.bisect_right(path['distances'],s)-1));a,b=path['points'][i],path['points'][(i+1)%len(path['points'])];t=(s-path['distances'][i])/(path['distances'][i+1]-path['distances'][i]);link.location.y=a[0]+(b[0]-a[0])*t;link.location.z=a[1]+(b[1]-a[1])*t;link.rotation_mode='XYZ';link.rotation_euler.x=math.atan2(b[1]-a[1],b[0]-a[0])+math.pi
        bpy.context.view_layer.update();belt,_=Tree(links);pairs=tree.overlap(belt);beltRows.append(dict(side=side,phaseFraction=sample/16,pairs=len(pairs),owners=dict(collections.Counter(owners[a]for a,b in pairs)),contactExclusionM=0,passed=not pairs))
    print('TYPE94_V100_BELT_PHASES',side,all(r['passed']for r in beltRows if r['side']==side),flush=True)
# The two-direction surface gate permits three millimetres of reduction. That
# alone cannot prove zero contact clearance; bound the changed arm/cover parts
# separately over every wheel angle, with the existing two-micrometre margin.
source=json.loads((acc/'Data_LowSourceArraysV100.json').read_text());reopen=json.loads((acc/'Data_GameSourceReopenV100.json').read_text());assert source['sourceBlendSha256']==reopen['sourceBlendSha256']==manifest['sourceBlendSha256']and reopen['passed'];arrays=np.load(acc/'Data_LowSourceArraysV100.npz');entry=next(r for r in source['rows']if r['name']=='Geometry_Hull_Paint');p=arrays['points'+str(entry['index'])];p=p[:,[0,2,1]]*np.array([1,-1,1]);triangles=arrays['triangles'+str(entry['index'])];geometry=json.loads((acc/'Data_GameGeometryV100.json').read_text());record=next(r for r in geometry['records']if r['mesh']=='Geometry_Hull_Paint');delta=json.loads((base/'GameTrialV70/Acceptance/Data_GameDeltaV70.json').read_text());changed=next(r for r in delta['changed']if r['name']=='Geometry_Hull_Paint')['changedParts'];types={r['signature']:('Arm'if r['triangles']==828 else'Cover')for r in changed};inverse=bpy.data.objects['Hull'].matrix_world.inverted();relative=inverse@bpy.data.objects['Geometry_Hull_Paint'].matrix_world;arms=[];covers=[];offset=0
for part in record['parts']:
    n=part['candidateTriangles'];ids=triangles[offset:offset+n];offset+=n
    if part['sourceSignature']not in types:continue
    q=np.unique(p[ids.ravel()],axis=0);q=np.array([tuple(relative@Vector(v))for v in q]);(arms if types[part['sourceSignature']]=='Arm'else covers).append(q)
assert len(arms)==8 and len(covers)==4 and offset==len(triangles);envelope=[]
for sign,side in [(-1,'Left'),(1,'Right')]:
    minimum=min(float((q[:,0]*sign).min())for q in arms if np.sign(q[:,0].mean())==sign)
    for i in range(4):
        wheel=bpy.data.objects['Wheel_'+side+'_Road'+str(i)];points=np.array([tuple(inverse@(obj.matrix_world@v.co))for obj in wheel.children_recursive if obj.type=='MESH'for v in obj.data.vertices]);maximum=float((points[:,0]*sign).max());pose=inverse@wheel.matrix_world;axis=np.array(pose.col[0][:3]);axis/=np.linalg.norm(axis);axisError=float(np.linalg.norm(np.cross(axis,[1,0,0])));gap=minimum-maximum;envelope.append(dict(check=wheel.name+' arm axial separation for every angle',minimumGapM=gap,axisParallelError=axisError,passed=bool(gap>.000002 and axisError<1e-8)));centre=np.array(pose.translation)[1:];radius=float(np.linalg.norm(points[:,1:]-centre,axis=1).max())
        for index,cover in enumerate(covers):
            if np.sign(cover[:,0].mean())!=sign:continue
            c=(cover[:,1:].min(axis=0)+cover[:,1:].max(axis=0))/2;r=float(np.linalg.norm(cover[:,1:]-c,axis=1).max());gap=float(np.linalg.norm(c-centre)-radius-r);envelope.append(dict(check=wheel.name+' pivot cover '+str(index)+' radial separation for every angle',minimumGapM=gap,axisParallelError=axisError,passed=bool(gap>.000002 and axisError<1e-8)))
report=dict(sha256=manifest['sha256'],road=roadRows,belts=beltRows,allAngleArmCover=envelope,sourceArraysBlendSha256=source['sourceBlendSha256'],sourceArraysBoundToActualExportBy='Data_ComposedActualSurfaceCertificateV100.json',numericSafetyMarginM=.000002,passed=len(roadRows)==8 and len(beltRows)==32 and len(envelope)==24 and all(r['passed']for r in roadRows+beltRows+envelope),scope='128actual road-wheel poses against the complete stationary body,32complete belt phases against all non-wheel/non-belt solids, and conservative all-angle axial/radial separation of every changed arm and pivot cover')
(acc/'Data_GameRunningV100.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(passed=report['passed'],roadSamples=128,beltPhases=32,allAngleChecks=24,minimumAllAngleGapM=min(r['minimumGapM']for r in envelope),failed=[r for r in roadRows+beltRows+envelope if not r['passed']]),indent=2),flush=True);assert report['passed']
