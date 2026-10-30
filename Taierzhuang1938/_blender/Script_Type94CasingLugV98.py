"""Add only the photo-supported far-side casing lug to immutable V95."""
import ast,bmesh,bpy,hashlib,importlib.util,json,math,os,numpy as np
from pathlib import Path
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_CASING_ROOT',str(base/'CasingLugV98')))
for directory in [root,root/'Acceptance',root/'Exports',root/'Rebuild']:directory.mkdir(parents=True,exist_ok=True)
m=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GrayTrialV95.json').read_text());layoutFile=repo/'Taierzhuang1938/Model/Type94Tankette/Data_CasingLugLayoutV98.json';layout=json.loads(layoutFile.read_text())
assert not bpy.data.filepath and hashlib.sha256(Path(m['sourceBlend']).read_bytes()).hexdigest()==m['sourceBlendSha256']
bpy.ops.wm.open_mainfile(filepath=m['sourceBlend']);scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette'
asset=bpy.data.objects['Type94Tankette'];target=bpy.data.objects[layout['mesh']];owner=bpy.data.objects[layout['owner']];old=target.data
file=repo/'Taierzhuang1938/_blender/Script_Type94TanketteBuild.py';syntax=ast.parse(file.read_text());names={'Mesh','Box','ApplyModifiersAndUv'}
scope=dict(bpy=bpy,bmesh=bmesh,math=math,Vector=Vector,QUALITY='High',BEVEL_SEGMENTS=3,MATERIALS={'Paint':old.materials[0]},PARTS={'Hull':bpy.data.objects['Hull']})
exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(file),'exec'),scope)
face=Vector(layout['visibleFaceCentreWorldM']);tree=BVHTree.FromPolygons([target.matrix_world@v.co for v in old.vertices],[list(f.vertices)for f in old.polygons]);hit=tree.ray_cast(face,Vector((1,0,0)),.10);assert hit[0]is not None
depth=max(layout['totalThicknessXM'],hit[0].x-face.x+.004);centre=face+Vector((depth/2,0,0));lug=scope['Box']('FinalDrive_FarRaisedEarV98',(0,0,0),(depth,layout['widthYM'],layout['heightZM']),parent=owner,bevel=layout['edgeRadiusM']);lug.matrix_world=Matrix.Translation(centre)
scope['ApplyModifiersAndUv']([lug]);lug.name='Geometry_FinalDriveRaisedEarRight_Paint';lug['ReferenceScope']=layout['scope'];lug['LocalDimensionsAndFunctionInferred']=True;bpy.context.view_layer.update()
scene['SurfaceGeometryRevision']='ShapeV98FarCasingRaisedEarTrial';scene['WholeReferenceAccepted']=False;scene['CasingLugSectionAndFunctionInferred']=True
for path in [Path(__file__),layoutFile]:text=bpy.data.texts.get(path.name)or bpy.data.texts.new(path.name);text.clear();text.write(path.read_text());text.use_fake_user=True
bpy.context.view_layer.update();destination=root/'Scene_Type94TanketteHighShapeV98CasingLugTrial.blend';bpy.ops.wm.save_as_mainfile(filepath=str(destination));bpy.ops.object.select_all(action='DESELECT')
for obj in [asset,*asset.children_recursive]:obj.select_set(True)
spec=importlib.util.spec_from_file_location('Casing98Export',repo/'Taierzhuang1938/_blender/Script_Type94Export.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
glb=root/'Exports/Model_Type94TanketteHighShapeV98CasingLugTrial.glb';module.ExportGltf(glb)
report=dict(reference=m,sourceBlend=str(destination),sourceBlendSha256=hashlib.sha256(destination.read_bytes()).hexdigest(),sourceGlb=str(glb),sha256=hashlib.sha256(glb.read_bytes()).hexdigest(),layoutFile=str(layoutFile),layoutSha256=hashlib.sha256(layoutFile.read_bytes()).hexdigest(),supportingMesh=target.name,newMesh=lug.name,allOldMeshesUnchanged=True,addedPolygons=len(lug.data.polygons),actualAttachmentDepthM=depth,actualUnderlyingSurfacePointWorldM=list(hit[0]),minimumNominalRootOverlapM=.004,cameraAndAxisChanged=False,nearSideChanged=False,newPbrBaked=False,wholeReferenceAccepted=False)
(root/'Acceptance/Data_CasingLugIdentityV98.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k!='reference'}),flush=True)
