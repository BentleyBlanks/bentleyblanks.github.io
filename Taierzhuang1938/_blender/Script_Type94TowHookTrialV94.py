"""Replace the misidentified front shackle with an open hook and separate gate."""
import ast,bmesh,bpy,hashlib,importlib.util,json,math,os,numpy as np
from pathlib import Path
from mathutils import Matrix,Vector

repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_TOW_ROOT',str(base/'TowHookV94')))
for folder in [root,root/'Acceptance',root/'Exports',root/'Rebuild']:folder.mkdir(parents=True,exist_ok=True)
m=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GrayTrialV89.json').read_text())
layoutFile=repo/'Taierzhuang1938/Model/Type94Tankette/Data_TowHookLayoutV94.json';layout=json.loads(layoutFile.read_text())
audit=json.loads((base/'ReferenceV93/Acceptance/Data_TowSourceAuditV93.json').read_text())
assert not bpy.data.filepath and hashlib.sha256(Path(m['sourceBlend']).read_bytes()).hexdigest()==m['sourceBlendSha256']
bpy.ops.wm.open_mainfile(filepath=m['sourceBlend']);scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette'
asset=bpy.data.objects['Type94Tankette'];hull=bpy.data.objects['Hull'];obj=bpy.data.objects['Geometry_Hull_Paint'];old=obj.data
oldOwner=bpy.data.objects['TowShackleFront'];oldMoving=bpy.data.objects['Geometry_TowShackleFront_Paint']
# Review separates the existing bracket/pin/eye/two bracket studs from the
# unrelated front-plate head in candidate0. Never remove by a loose ROI alone.
selected=[row for row in audit['candidateFixedComponents']if row['vertexCount']in [96,192]or(row['vertexCount']==50 and row['boundsWorldM'][0][1]>1.33)]
assert len(selected)==5 and sorted(row['polygonCount']for row in selected)==[60,60,96,98,170]
removed={f for row in selected for f in row['faces']}
keep=[face for face in old.polygons if face.index not in removed]
mesh=bpy.data.meshes.new('Mesh_Type94HullWithoutLegacyTowV94');mesh.from_pydata([tuple(v.co)for v in old.vertices],[],[list(f.vertices)for f in keep]);mesh.update()
for material in old.materials:mesh.materials.append(material)
mesh.uv_layers.new(name=old.uv_layers.active.name);normals=[]
for before,after in zip(keep,mesh.polygons):
    after.use_smooth=before.use_smooth;after.material_index=before.material_index
    for a,b in zip(before.loop_indices,after.loop_indices):mesh.uv_layers.active.data[b].uv=old.uv_layers.active.data[a].uv;normals.append(tuple(old.corner_normals[a].vector))
mesh.normals_split_custom_set(normals)
for attribute in old.attributes:
    if attribute.domain=='FACE'and attribute.data_type=='FLOAT':
        copied=mesh.attributes.new(attribute.name,'FLOAT','FACE')
        for before,after in zip(keep,copied.data):after.value=attribute.data[before.index].value
obj.data=mesh
bpy.data.objects.remove(oldMoving,do_unlink=True);bpy.data.objects.remove(oldOwner,do_unlink=True)
path=repo/'Taierzhuang1938/_blender/Script_Type94TanketteBuild.py';syntax=ast.parse(path.read_text())
names={'Empty','Mesh','Box','Cylinder','Lathe','CurveTube','Rivet','ApplyModifiersAndUv'}
scope=dict(bpy=bpy,bmesh=bmesh,math=math,Vector=Vector,QUALITY='High',SEGMENTS=32,BEVEL_SEGMENTS=3,MATERIALS={'Paint':obj.data.materials[0]},PARTS={'Hull':hull})
exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(path),'exec'),scope)
fixed=scope['Empty']('TowHookFrontFixed',parent=hull);fixed.matrix_world=Matrix.Translation(Vector(layout['pinWorldM']))
gate=scope['Empty']('TowLatchFront',parent=hull);gate.matrix_world=fixed.matrix_world.copy()
fixed['ReferenceScope']=layout['scope'];fixed['PhotographicIdentity']='Open forward-facing J towing hook with separate upper spring gate'
gate['HingeAxisLocal']='X';gate['OpenSignLocal']=1;gate['DemoTravelDegrees']=layout['gateDemoTravelDegrees'];gate['StopsMeasured']=False;gate['RestIsPhotographicPose']=True
gate['ReferenceScope']='Separate gate on the visible transverse pin. Demonstration travel and hidden bearing section inferred; main hook remains fixed.'

def Catmull(values,count=7):
    source=np.asarray(values,dtype=float);result=[]
    for i in range(len(source)-1):
        a,b,c,d=source[max(0,i-1)],source[i],source[i+1],source[min(len(source)-1,i+2)]
        for t in np.linspace(0,1,count,endpoint=False):result.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
    return np.vstack([*result,source[-1]])

def SweptSection(name,centres,halfWidths,radii,parent,segments=16,roundSection=True):
    values=Catmull(np.c_[centres,halfWidths,radii]);positions=values[:,:2];points=[];faces=[]
    for i,(y,z,halfWidth,radius)in enumerate(values):
        tangent=positions[min(i+1,len(values)-1)]-positions[max(i-1,0)];tangent/=np.linalg.norm(tangent)
        across=np.array([-tangent[1],tangent[0]])
        ring=segments if roundSection else 4
        for j in range(ring):
            if roundSection:a=j*math.tau/ring;x=halfWidth*math.cos(a);offset=radius*math.sin(a)
            else:x=halfWidth*[-1,1,1,-1][j];offset=radius*[-1,-1,1,1][j]
            points.append((float(x),float(y+across[0]*offset),float(z+across[1]*offset)))
    ring=segments if roundSection else 4
    faces.append(tuple(reversed(range(ring))))
    for i in range(len(values)-1):
        for j in range(ring):faces.append((i*ring+j,i*ring+(j+1)%ring,(i+1)*ring+(j+1)%ring,(i+1)*ring+j))
    faces.append(tuple(range((len(values)-1)*ring,len(values)*ring)))
    part=scope['Mesh'](name,points,faces,parent=parent,bevel=0 if roundSection else .0008)
    for face in part.data.polygons:face.use_smooth=roundSection and len(face.vertices)==4
    return part

SweptSection('Tow_HookForgedCore',layout['hookCentrelineLocalYZM'],layout['hookHalfWidthM'],layout['hookInPlaneRadiusM'],fixed,24)
# Back plate follows the retained front armor plane; its dimensions and four
# partially hidden corner fasteners remain explicitly inferred.
body=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_BodyTrialV64.json').read_text())['forebody']
(yt,zt),(yb,zb)=body['frontArmorTopYZM'],body['frontArmorBottomYZM'];slope=(yt-yb)/(zt-zb)
ground=json.loads((base/'FrontCornerV81/Acceptance/Data_EarPairIdentityV81.json').read_text())['groundCompensationM']
pin=Vector(layout['pinWorldM'])
def PanelPoint(x,z,offset):
    y=yb+(z-ground-zb)*slope
    return Vector((x,y+offset,z))-pin
centre=PanelPoint(0,.602,.013)
plate=scope['Box']('Tow_BasePlate',(0,0,0),(.094,.012,.114),parent=fixed,bevel=.003);plate.location=centre;plate.rotation_euler.x=-math.atan(slope)
normal=Vector((0,1,-slope)).normalized()
for x in [-.033,.033]:
    for z in [.568,.628]:scope['Rivet']('Tow_BaseBolt',PanelPoint(x,z,.023),normal,.009,parent=fixed)
for x in [-.036,.036]:
    scope['Lathe']('Tow_PinSupport',[(.0085,-.005),(.014,-.005),(.014,.005),(.0085,.005),(.0085,-.005)],(x,0,0),'X',parent=fixed,segments=24)
    support=scope['Box']('Tow_PinSupportFoot',(x,-.014,-.033),(.011,.041,.054),parent=fixed,bevel=.002)
scope['Cylinder']('Tow_Pin',(0,0,0),layout['pinRadiusM'],layout['pinLengthM'],axis='X',parent=fixed,vertices=24)
scope['Cylinder']('Tow_PinHead',(-.054,0,0),.011,.008,axis='X',parent=fixed,vertices=24)
scope['Cylinder']('Tow_PinEnd',(.054,0,0),.009,.008,axis='X',parent=fixed,vertices=24)
spring=[]
for i in range(129):
    t=i/128;a=t*math.tau*4
    spring.append((-.029+.012*t,.011*math.cos(a),.011*math.sin(a)))
scope['CurveTube']('Tow_GateSpringCoil',spring,.0012,parent=fixed)
scope['Lathe']('Tow_GateHingeSleeve',[(.0085,-.014),(.012,-.014),(.012,.014),(.0085,.014),(.0085,-.014)],(0,0,0),'X',parent=gate,segments=32)
SweptSection('Tow_GatePlate',layout['gateCentrelineLocalYZM'],layout['gateHalfWidthM'],[layout['gateThicknessM']/2]*4,gate,roundSection=False)
scope['ApplyModifiersAndUv']([*fixed.children_recursive,*gate.children_recursive])

def Join(parent,name):
    children=list(parent.children_recursive);vertices=[];faces=[];normals=[];uvs=[];smooth=[];groups=[]
    for part in children:
        assert part.type=='MESH';offset=len(vertices);matrix=parent.matrix_world.inverted()@part.matrix_world;normalMatrix=matrix.to_3x3().inverted().transposed()
        vertices.extend(tuple(matrix@v.co)for v in part.data.vertices);groups.append((part.name,list(range(offset,len(vertices)))))
        for face in part.data.polygons:
            faces.append([offset+i for i in face.vertices]);smooth.append(face.use_smooth)
            for loop in face.loop_indices:uvs.append(tuple(part.data.uv_layers.active.data[loop].uv));normals.append(tuple((normalMatrix@part.data.corner_normals[loop].vector).normalized()))
    joined=scope['Mesh'](name,vertices,faces,parent=parent);joined.data.uv_layers.new(name='UVMap')
    for value,uv in zip(joined.data.uv_layers.active.data,uvs):value.uv=uv
    for face,value in zip(joined.data.polygons,smooth):face.use_smooth=value
    joined.data.normals_split_custom_set(normals)
    for group,indices in groups:joined.vertex_groups.new(name=group).add(indices,1,'REPLACE')
    joined['SourceParts']=json.dumps([name for name,_ in groups]);joined['SurfaceRole']='Paint'
    for part in children:bpy.data.objects.remove(part,do_unlink=True)
    return joined

fixedMesh=Join(fixed,'Geometry_TowHookFrontFixed_Paint');gateMesh=Join(gate,'Geometry_TowLatchFront_Paint')
scene['SurfaceGeometryRevision']='ShapeV94FrontTowHookTrial';scene['WholeReferenceAccepted']=False;scene['TowHardwareDimensionsInferred']=True
scene['TowHardwareLegacyShackleRejected']=True
bpy.context.view_layer.update();destination=root/'Scene_Type94TanketteHighShapeV94TowHookTrial.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(destination))
for part in [asset,*asset.children_recursive]:part.select_set(True)
spec=importlib.util.spec_from_file_location('Tow94Export',repo/'Taierzhuang1938/_blender/Script_Type94Export.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
glb=root/'Exports/Model_Type94TanketteHighShapeV94TowHookTrial.glb';module.ExportGltf(glb)
report=dict(sourceReference=m,sourceBlend=str(destination),sourceBlendSha256=hashlib.sha256(destination.read_bytes()).hexdigest(),sourceGlb=str(glb),sha256=hashlib.sha256(glb.read_bytes()).hexdigest(),layoutFile=str(layoutFile),layoutSha256=hashlib.sha256(layoutFile.read_bytes()).hexdigest(),removedLegacyHullPolygons=sorted(removed),removedFixedComponentCount=len(selected),retainedHullPolygons=len(keep),removedOwner='TowShackleFront',removedMesh='Geometry_TowShackleFront_Paint',newOwners=['TowHookFrontFixed','TowLatchFront'],newMeshes=[fixedMesh.name,gateMesh.name],geometryOutsideTowHardwareChanged=False,newUvProvisional=True,newPbrBaked=False,wholeReferenceAccepted=False)
(root/'Acceptance/Data_TowHookIdentityV94.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items()if k not in ['sourceReference','removedLegacyHullPolygons']}),flush=True)
