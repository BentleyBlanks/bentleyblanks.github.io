"""Selected-photo cowl rear-junction trial; retain other geometry and all poses."""
import ast, bmesh, bpy, hashlib, importlib.util, json, math, numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

repo = Path(__file__).resolve().parents[2]
base = Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')
root = base/'NoseV87'
for folder in [root, root/'Acceptance', root/'Exports', root/'Rebuild']:
    folder.mkdir(parents=True, exist_ok=True)
m = json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GrayTrialV85.json').read_text())
assert hashlib.sha256(Path(m['sourceBlend']).read_bytes()).hexdigest() == m['sourceBlendSha256']
assert not bpy.data.filepath
bpy.ops.wm.open_mainfile(filepath=m['sourceBlend'])
scene = bpy.context.scene
assert scene.get('BlenderMcpTask') == 'Type94Tankette'
asset, hull = bpy.data.objects['Type94Tankette'], bpy.data.objects['Hull']
owner = bpy.data.objects['NoseHousing']
obj = bpy.data.objects['Geometry_NoseHousing_Paint']
assert abs(owner['CoverWidthM']-.74)<1e-8 and abs(owner['RearRiseM']-.012)<1e-8
fitFile=base/'ReferenceV86/Acceptance/Data_RearJunctionFitV86.json'
fitData=json.loads(fitFile.read_text())
fit=next(row for row in fitData['solutions'] if row['mode']=='PrimaryTourGuide')
assert fit['success'] and not fit['nearBounds']
rearY,newRise,centreX,width=fit['parameters']
body = json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_BodyTrialV64.json').read_text())
profile = body['forebody']
cameraFamily = json.loads((base/'ReferenceV60/Inputs/Data_GeneratorEnvelopeAuditV52.json').read_text())
shift = json.loads((base/'FrontCornerV81/Acceptance/Data_EarPairIdentityV81.json').read_text())['groundCompensationM']


def Visibility():
    bpy.context.view_layer.update()
    points, faces, names = [], [], []
    for part in asset.children_recursive:
        if part.type!='MESH':
            continue
        offset=len(points)
        points.extend(part.matrix_world@p.co for p in part.data.vertices)
        for face in part.data.polygons:
            faces.append([offset+i for i in face.vertices]);names.append(part.name)
    tree=BVHTree.FromPolygons(points,faces)
    rows=[]
    corners=np.asarray(hull['DriverFrontFrameCornersM']).reshape(-1,3)
    for label,c in cameraFamily['cameras'].items():
        if label not in ['2017','2014','TourGuide','7']:
            continue
        r,t=np.asarray(c['rotationCameraFromBlender']),np.asarray(c['translationCameraFromBlender'])
        eye=Vector(-r.T@t+[0,0,shift])
        for name,p in zip(['FarTop','NearTop','NearBottom','FarBottom'],corners):
            target=hull.matrix_world@Vector(p);delta=target-eye
            hit=tree.ray_cast(eye,delta.normalized(),delta.length+.002)
            rows.append(dict(camera=label,name=name,firstOwner=names[hit[2]]if hit[2]is not None else None,distanceBeforeDatumM=delta.length-hit[3]if hit[2]is not None else None,authoredDatumNotGuaranteedSkinVertex=True))
    return rows


before=Visibility()
sourceFile=repo/'Taierzhuang1938/_blender/Script_Type94TanketteBuild.py'
source=sourceFile.read_text()
syntax=ast.parse(source)
names={'Empty','Mesh','Lathe','CurveTube','Rivet','GlacisHeight','NoseHousing','ApplyModifiersAndUv'}
functions=[node for node in syntax.body if isinstance(node,ast.FunctionDef)and node.name in names]
assert len(functions)==len(names)
# Change exactly the two authored rear-rise literals inside NoseHousing.
function=next(node for node in functions if node.name=='NoseHousing')
segment=ast.get_source_segment(source,function)
assert segment.count('.120')==2
assert segment.count('rearY=.62')==1
assert segment.count('width=.74')==1 and segment.count('centerX=-.135')==1
segment=segment.replace('.120',repr(newRise)).replace('rearY=.62','rearY='+repr(rearY)).replace('width=.74','width='+repr(width)).replace('centerX=-.135','centerX='+repr(centreX))
replacement=ast.parse(segment).body[0]
functions=[replacement if node.name=='NoseHousing'else node for node in functions]
scope=dict(bpy=bpy,bmesh=bmesh,math=math,Vector=Vector,QUALITY='High',SEGMENTS=48,BEVEL_SEGMENTS=3,
    MATERIALS={'Paint':obj.data.materials[0]},PARTS={'Hull':hull},FOREBODY_LAYOUT=profile,
    GLACIS_PROFILE=profile['glacisProfileYZM'],FRONT_ARMOR_TOP_Y=profile['frontArmorTopYZM'][0])
exec(compile(ast.Module(body=functions,type_ignores=[]),str(sourceFile),'exec'),scope)
newOwner=scope['NoseHousing']()
children=list(newOwner.children_recursive)
scope['ApplyModifiersAndUv'](children)
bpy.context.view_layer.update()
inverse=obj.matrix_world.inverted()
vertices,faces,uvs,normals,smooth=[],[],[],[],[]
for part in children:
    assert part.type=='MESH'
    offset=len(vertices);matrix=inverse@part.matrix_world
    vertices.extend(tuple(matrix@p.co)for p in part.data.vertices)
    normalMatrix=matrix.to_3x3().inverted().transposed()
    for face in part.data.polygons:
        faces.append([offset+i for i in face.vertices]);smooth.append(face.use_smooth)
        for loop in face.loop_indices:
            uvs.append(tuple(part.data.uv_layers.active.data[loop].uv))
            normals.append(tuple((normalMatrix@part.data.corner_normals[loop].vector).normalized()))
mesh=bpy.data.meshes.new('Mesh_Type94NoseRearTaperTrialV87')
mesh.from_pydata(vertices,[],faces);mesh.update()
mesh.materials.append(obj.data.materials[0])
uv=mesh.uv_layers.new(name='UVMap')
for loop,value in zip(uv.data,uvs):loop.uv=value
for face,value in zip(mesh.polygons,smooth):face.use_smooth=value
mesh.normals_split_custom_set(normals)
obj.data=mesh
for key in newOwner.keys():
    value=newOwner[key]
    owner[key]=value.to_list()if hasattr(value,'to_list')else value
owner['RearRiseTrialM']=newRise
owner['RearYTrialM']=rearY
owner['RearRiseAndHiddenConnectionInferred']=True
owner['ReferenceScope']='Primary2017andTourGuide rear-edge candidate; working cameras fixed, rear location/rise and concealed section remain inferred'
for part in children:bpy.data.objects.remove(part,do_unlink=True)
bpy.data.objects.remove(newOwner,do_unlink=True)
after=Visibility()
scene['NoseRearTaperRevision']='ShapeV87RearEdgeTrial'
scene['WholeReferenceAccepted']=False
scene['SurfaceUvRegenerationRequired']=True
blend=root/'Scene_Type94TanketteHighShapeV87RearEdgeTrial.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.wm.open_mainfile(filepath=str(blend))
bpy.ops.object.select_all(action='DESELECT')
asset=bpy.data.objects['Type94Tankette']
for part in [asset,*asset.children_recursive]:part.select_set(True)
file=repo/'Taierzhuang1938/_blender/Script_Type94Export.py'
spec=importlib.util.spec_from_file_location('Nose87Export',file);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
glb=root/'Exports/Model_Type94TanketteHighShapeV87RearEdgeTrial.glb';module.ExportGltf(glb)
report=dict(sourceManifest='Data_GrayTrialV85.json',baseSha256=m['sha256'],sourceBlend=str(blend),sourceBlendSha256=hashlib.sha256(blend.read_bytes()).hexdigest(),sourceGlb=str(glb),sha256=hashlib.sha256(glb.read_bytes()).hexdigest(),changedOwner='Geometry_NoseHousing_Paint',retainedFrontRiseM=.140,oldRearRiseM=.012,newRearRiseM=newRise,rearConnectionInferred=True,widthM=width,centreXM=centreX,rearYM=rearY,fitInputFile=str(fitFile),fitInputSha256=hashlib.sha256(fitFile.read_bytes()).hexdigest(),frontYM=profile['frontArmorTopYZM'][0],beforeCabDatumVisibility=before,afterCabDatumVisibility=after,meshOwners=238,poseNodes=293,wholeReferenceAccepted=False,newUvsProvisional=True,sourceProducerDependencySha256=hashlib.sha256(sourceFile.read_bytes()).hexdigest())
(root/'Acceptance/Data_RearEdgeIdentityV87.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(sha256=report['sha256'],before7=[r for r in before if r['camera']=='7'],after7=[r for r in after if r['camera']=='7'])),flush=True)
