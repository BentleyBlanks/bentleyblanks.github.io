"""Refine only the hook root and gate shoulder on the immutable V94 source."""
import ast,bmesh,bpy,hashlib,importlib.util,json,math,os,numpy as np
from pathlib import Path
from mathutils import Matrix,Vector

repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')
root=Path(os.environ.get('TYPE94_TOW_ROOT',str(base/'TowShoulderV95')))
for folder in [root,root/'Acceptance',root/'Exports',root/'Rebuild']:folder.mkdir(parents=True,exist_ok=True)
m=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GrayTrialV94.json').read_text())
layoutFile=repo/'Taierzhuang1938/Model/Type94Tankette/Data_TowShoulderLayoutV95.json';layout=json.loads(layoutFile.read_text())
oldLayout=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_TowHookLayoutV94.json').read_text())
assert not bpy.data.filepath and hashlib.sha256(Path(m['sourceBlend']).read_bytes()).hexdigest()==m['sourceBlendSha256']
bpy.ops.wm.open_mainfile(filepath=m['sourceBlend']);scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette'
asset=bpy.data.objects['Type94Tankette'];fixed=bpy.data.objects['TowHookFrontFixed'];gate=bpy.data.objects['TowLatchFront']
fixedMesh=bpy.data.objects['Geometry_TowHookFrontFixed_Paint'];gateMesh=bpy.data.objects['Geometry_TowLatchFront_Paint']
path=repo/'Taierzhuang1938/_blender/Script_Type94TanketteBuild.py';syntax=ast.parse(path.read_text())
names={'Empty','Mesh','Box','Cylinder','Lathe','CurveTube','Rivet','AperturePlate','ApplyModifiersAndUv'}
scope=dict(bpy=bpy,bmesh=bmesh,math=math,Vector=Vector,np=np,QUALITY='High',SEGMENTS=32,BEVEL_SEGMENTS=3,MATERIALS={'Paint':fixedMesh.data.materials[0]},PARTS={'Hull':bpy.data.objects['Hull']})
exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(path),'exec'),scope)
path=repo/'Taierzhuang1938/_blender/Script_Type94TowHookTrialV94.py';syntax=ast.parse(path.read_text())
scope['scope']=scope
exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in ['Catmull','SweptSection']],type_ignores=[]),str(path),'exec'),scope)
temporaryFixed=scope['Empty']('Temporary_TowRootV95');temporaryFixed.matrix_world=fixed.matrix_world.copy()
temporaryGate=scope['Empty']('Temporary_TowGateV95');temporaryGate.matrix_world=gate.matrix_world.copy()
hook=scope['SweptSection']('Tow_HookForgedCore',oldLayout['hookCentrelineLocalYZM'],oldLayout['hookHalfWidthM'],oldLayout['hookInPlaneRadiusM'],temporaryFixed,24)
def Ellipsoid(name,centre,radii):
    vertices=[];faces=[]
    for j in range(13):
        t=-math.pi/2+j*math.pi/12
        for i in range(24):
            a=i*math.tau/24;vertices.append((centre[0]+radii[0]*math.cos(t)*math.cos(a),centre[1]+radii[1]*math.cos(t)*math.sin(a),centre[2]+radii[2]*math.sin(t)))
    for j in range(12):
        for i in range(24):faces.append((j*24+i,j*24+(i+1)%24,(j+1)*24+(i+1)%24,(j+1)*24+i))
    return scope['Mesh'](name,vertices,faces,parent=temporaryFixed)
blanks=[hook]
if layout.get('rootBasePlateUnion'):
    group=fixedMesh.vertex_groups['Tow_BasePlate'].index
    source=fixedMesh.data;used=sorted(v.index for v in source.vertices if any(g.group==group and g.weight>.5 for g in v.groups));indexMap={v:i for i,v in enumerate(used)}
    matrix=temporaryFixed.matrix_world.inverted()@fixedMesh.matrix_world
    vertices=[tuple(matrix@source.vertices[i].co)for i in used]
    faces=[[indexMap[i]for i in face.vertices]for face in source.polygons if all(i in indexMap for i in face.vertices)]
    blanks.append(scope['Mesh']('Tow_ActualBasePlateBlendBlank',vertices,faces,parent=temporaryFixed))
for i,item in enumerate(layout['rootBlendEllipsoids']):blanks.append(Ellipsoid('Tow_RootBlendBlank'+str(i),item['centreLocalM'],item['radiiM']))
tipY,tipZ=oldLayout['hookCentrelineLocalYZM'][-1]
blanks.append(Ellipsoid('Tow_RoundedTipBlank',(0,tipY,tipZ),layout['roundedTipRadiiM']))
scope['ApplyModifiersAndUv'](blanks)
bpy.ops.object.select_all(action='DESELECT')
for obj in blanks:obj.select_set(True)
bpy.context.view_layer.objects.active=hook;bpy.ops.object.join()
remesh=hook.modifiers.new('Editable root union at1250micrometre resolution','REMESH');remesh.mode='VOXEL';remesh.voxel_size=layout['rootVoxelSizeM'];remesh.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=remesh.name)
smooth=hook.modifiers.new('Editable shallow shoulder blend','SMOOTH');smooth.factor=layout['rootSmoothFactor'];smooth.iterations=layout['rootSmoothIterations'];bpy.ops.object.modifier_apply(modifier=smooth.name)
for face in hook.data.polygons:face.use_smooth=True
hook.data.materials.clear();hook.data.materials.append(fixedMesh.data.materials[0])
for name in list(hook.vertex_groups.keys()):hook.vertex_groups.remove(hook.vertex_groups[name])
hook.name='Tow_HookRootContinuousV95'
scope['Lathe']('Tow_CentralFixedEyeV95',[(layout['bearingInnerRadiusM'],-layout['fixedEyeDepthM']/2),(layout['fixedEyeOuterRadiusM'],-layout['fixedEyeDepthM']/2),(layout['fixedEyeOuterRadiusM'],layout['fixedEyeDepthM']/2),(layout['bearingInnerRadiusM'],layout['fixedEyeDepthM']/2),(layout['bearingInnerRadiusM'],-layout['fixedEyeDepthM']/2)],(0,0,0),'X',parent=temporaryFixed,segments=32)
scope['Box']('Tow_CentralStanchionV95',layout['stanchionCentreLocalM'],layout['stanchionSizeM'],parent=temporaryFixed,bevel=.002)
scope['Cylinder']('Tow_TransversePinV95',(0,0,0),layout['pinRadiusM'],layout['pinLengthM'],axis='X',parent=temporaryFixed,vertices=32)
scope['Cylinder']('Tow_PinHeadV95',(layout['pinHeadCentreXM'],0,0),layout['pinHeadRadiusM'],.006,axis='X',parent=temporaryFixed,vertices=32)
scope['Cylinder']('Tow_PinEndV95',(layout['pinEndCentreXM'],0,0),layout['pinEndRadiusM'],.006,axis='X',parent=temporaryFixed,vertices=32)
spring=[]
for i in range(129):
    t=i/128;a=t*math.tau*4;spring.append((-.029+.012*t,layout['springRadiusM']*math.cos(a),layout['springRadiusM']*math.sin(a)))
scope['CurveTube']('Tow_GateSpringCoilV95',spring,layout['springWireRadiusM'],parent=temporaryFixed)
webs=[]
for x in layout['gateEarCentresXM']:
    half=layout['gateEarDepthM']/2
    scope['Lathe']('Tow_GateHingeEarV95',[(layout['bearingInnerRadiusM'],-half),(layout['bearingOuterRadiusM'],-half),(layout['bearingOuterRadiusM'],half),(layout['bearingInnerRadiusM'],half),(layout['bearingInnerRadiusM'],-half)],(x,0,0),'X',parent=temporaryGate,segments=32)
    webs.append(scope['Box']('Tow_GateSideWebV95',(math.copysign(.0125,x),.014,-.011),(.005,.018,.028),parent=temporaryGate,bevel=.0006))
drill=scope['Cylinder']('Temporary_TowPinBoreV95',(0,0,0),layout['bearingInnerRadiusM'],.10,axis='X',parent=temporaryGate,vertices=48)
for web in webs:
    bpy.context.view_layer.objects.active=web
    for modifier in list(web.modifiers):bpy.ops.object.modifier_apply(modifier=modifier.name)
    modifier=web.modifiers.new('Actual transverse pin clearance bore','BOOLEAN');modifier.operation='DIFFERENCE';modifier.solver='EXACT';modifier.object=drill
    bpy.ops.object.modifier_apply(modifier=modifier.name)
bpy.data.objects.remove(drill,do_unlink=True)
w=layout['shoulderOuterWidthM']/2;y=layout['shoulderCentreYM'];top=layout['shoulderTopZM'];bottom=layout['shoulderBottomZM'];iw=layout['windowWidthM']/2;iz=layout['windowCentreZM'];ih=layout['windowHeightM']/2
outer=[(-w,y,top),(w,y,top),(w,y,bottom),(-w,y,bottom)]
inner=[(-iw,y,iz+ih),(iw,y,iz+ih),(iw,y,iz-ih),(-iw,y,iz-ih)]
scope['AperturePlate']('Tow_GateShoulderWindowV95',outer,inner,layout['shoulderThicknessM'],parent=temporaryGate,bevel=.0007)
scope['SweptSection']('Tow_GateStemV95',layout['gateStemLocalYZM'],layout['gateStemHalfWidthsM'],[layout['gateStemThicknessM']/2]*3,temporaryGate,roundSection=False)
scope['Box']('Tow_GateUpperLipV95',layout['lipCentreLocalM'],layout['lipSizeM'],parent=temporaryGate,bevel=.0006)
scope['ApplyModifiersAndUv']([*temporaryFixed.children_recursive,*temporaryGate.children_recursive])

def PatchMesh(target,temporary,removeGroups):
    old=target.data;indices={target.vertex_groups[name].index for name in removeGroups}
    dropped={v.index for v in old.vertices if any(g.group in indices and g.weight>.5 for g in v.groups)}
    retained=[f for f in old.polygons if not any(i in dropped for i in f.vertices)]
    used=sorted({i for f in retained for i in f.vertices});mapping={i:j for j,i in enumerate(used)}
    vertices=[tuple(old.vertices[i].co)for i in used];faces=[];uvs=[];normals=[];smooth=[];groups=[]
    for f in retained:
        faces.append([mapping[i]for i in f.vertices]);smooth.append(f.use_smooth)
        for i in f.loop_indices:uvs.append(tuple(old.uv_layers.active.data[i].uv));normals.append(tuple(old.corner_normals[i].vector))
    for group in target.vertex_groups:
        if group.name in removeGroups:continue
        members=[mapping[v.index]for v in old.vertices if v.index in mapping and any(g.group==group.index and g.weight>.5 for g in v.groups)]
        groups.append((group.name,members))
    for part in temporary.children_recursive:
        assert part.type=='MESH';offset=len(vertices);matrix=target.matrix_world.inverted()@part.matrix_world;normalMatrix=matrix.to_3x3().inverted().transposed()
        vertices.extend(tuple(matrix@v.co)for v in part.data.vertices);groups.append((part.name,list(range(offset,len(vertices)))))
        for face in part.data.polygons:
            faces.append([offset+i for i in face.vertices]);smooth.append(face.use_smooth)
            for i in face.loop_indices:uvs.append(tuple(part.data.uv_layers.active.data[i].uv));normals.append(tuple((normalMatrix@part.data.corner_normals[i].vector).normalized()))
    mesh=bpy.data.meshes.new('Mesh_'+target.name+'V95');mesh.from_pydata(vertices,[],faces);mesh.update();mesh.materials.append(old.materials[0]);mesh.uv_layers.new(name='UVMap')
    for value,uv in zip(mesh.uv_layers.active.data,uvs):value.uv=uv
    for face,value in zip(mesh.polygons,smooth):face.use_smooth=value
    mesh.normals_split_custom_set(normals);target.data=mesh
    target.vertex_groups.clear()
    for name,members in groups:
        if members:target.vertex_groups.new(name=name).add(members,1,'REPLACE')
    target['SourceParts']=json.dumps([name for name,_ in groups]);target['TowShoulderRefinement']='V95'
    return dict(retainedPolygons=len(retained),removedPolygons=len(old.polygons)-len(retained),sourceGroups=[name for name,_ in groups])

fixedPatch=PatchMesh(fixedMesh,temporaryFixed,['Tow_HookForgedCore','Tow_BasePlate','Tow_PinSupport','Tow_PinSupport.001','Tow_PinSupportFoot','Tow_PinSupportFoot.001','Tow_Pin','Tow_PinEnd','Tow_PinHead','Tow_GateSpringCoil'])
gatePatch=PatchMesh(gateMesh,temporaryGate,list(gateMesh.vertex_groups.keys()))
for temporary in [temporaryFixed,temporaryGate]:
    for obj in list(temporary.children_recursive):bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.objects.remove(temporary,do_unlink=True)
scene['SurfaceGeometryRevision']='ShapeV95TowRootShoulderTrial';scene['WholeReferenceAccepted']=False
for file in [Path(__file__),layoutFile]:
    text=bpy.data.texts.get(file.name)or bpy.data.texts.new(file.name);text.clear();text.write(file.read_text())
bpy.context.view_layer.update();destination=root/'Scene_Type94TanketteHighShapeV95TowShoulderTrial.blend';bpy.ops.wm.save_as_mainfile(filepath=str(destination))
bpy.ops.object.select_all(action='DESELECT')
for obj in [asset,*asset.children_recursive]:obj.select_set(True)
spec=importlib.util.spec_from_file_location('Tow95Export',repo/'Taierzhuang1938/_blender/Script_Type94Export.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
glb=root/'Exports/Model_Type94TanketteHighShapeV95TowShoulderTrial.glb';module.ExportGltf(glb)
report=dict(sourceReference=m,sourceBlend=str(destination),sourceBlendSha256=hashlib.sha256(destination.read_bytes()).hexdigest(),sourceGlb=str(glb),sha256=hashlib.sha256(glb.read_bytes()).hexdigest(),layoutFile=str(layoutFile),layoutSha256=hashlib.sha256(layoutFile.read_bytes()).hexdigest(),changedMeshes=[fixedMesh.name,gateMesh.name],fixedPatch=fixedPatch,gatePatch=gatePatch,newPbrBaked=False,wholeReferenceAccepted=False,exactTowShapeAccepted=False)
(root/'Acceptance/Data_TowShoulderIdentityV95.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items()if k!='sourceReference'}),flush=True)
