"""Replace only the shared shoe in the locked V37 source.

The optional builder path remains available for fresh rebuilds. This component
trial avoids rerunning unrelated world-space construction/correction operations.
"""
import bpy,os,json,hashlib,importlib.util
from pathlib import Path
repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2])));asset=repo/'Taierzhuang1938/Model/Type94Tankette'
base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'TrackShoeV48'
gray=json.loads((asset/'Data_GrayStudyV37.json').read_text(encoding='utf-8'));source=Path(gray['sourceBlend'])
assert hashlib.sha256(source.read_bytes()).hexdigest()==gray['sourceBlendSha256']
assert not bpy.data.filepath;bpy.ops.wm.open_mainfile(filepath=str(source))
scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette'
os.environ.update(TYPE94_REPO_ROOT=str(repo),TYPE94_SOURCE_ROOT=str(root),TYPE94_TRACK_SHOE_LAYOUT='Data_TrackShoeTrialV48.json')
os.environ.pop('TYPE94_RUNNING_GEAR_LAYOUT',None)
path=repo/'Taierzhuang1938/_blender/Script_Type94TanketteBuild.py';api={'__name__':'Type94ShoeLibrary','__file__':str(path)}
exec(compile(path.read_text(encoding='utf-8'),str(path),'exec'),api)
api['MATERIALS']['Track']=bpy.data.materials['Material_Type94Track'];api['PARTS']['Root']=bpy.data.objects['Type94Tankette'];api['PARTS']['Hull']=bpy.data.objects['Hull']
layout=json.loads((asset/'Data_TrackShoeTrialV48.json').read_text())
track=json.loads((base/'Acceptance/Data_MechanismShapeV37.json').read_text())['path']
parent=api['Empty']('TrackTemplateV48',parent=api['PARTS']['Root'])
path=repo/'Taierzhuang1938/_blender/Script_Type94TrackShoe.py';spec=importlib.util.spec_from_file_location('CastShoe',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
pieces=module.BuildCastShoe(track['pitchM'],parent,api,layout)
bpy.ops.object.select_all(action='DESELECT')
for obj in pieces:
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    for modifier in list(obj.modifiers):bpy.ops.object.modifier_apply(modifier=modifier.name)
bpy.context.view_layer.objects.active=pieces[0];bpy.ops.object.join();template=pieces[0];template.name='TrackShoeTemplateV48'
api['ApplyModifiersAndUv']([template]);mesh=template.data;mesh.name='Mesh_CastTrackShoeV48'
links=[obj for obj in scene.objects if obj.name.startswith('TrackLink_')];assert len(links)==170
for link in links:link.data=mesh;link['TrackShoeLayout']='Data_TrackShoeTrialV48.json'
bpy.data.objects.remove(template,do_unlink=True);bpy.data.objects.remove(parent,do_unlink=True)
rootNode=api['PARTS']['Root'];oldRoot=tuple(rootNode.location);bpy.context.view_layer.update()
minimum=min((obj.matrix_world@v.co).z for obj in scene.objects if obj.type=='MESH'for v in obj.data.vertices)
groundShift=-minimum
path=repo/'Taierzhuang1938/_blender/Script_Type94GunTraverse.py';spec=importlib.util.spec_from_file_location('CastShoeGunYaw',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.AddGunTraverse()
scene['TrackShoeShapeTrial']='Data_TrackShoeTrialV48.json';scene['HistoricalShapeAccepted']=False
scene['TrackTrialGroundShiftM']=groundShift;scene['TrackTrialPreservedGeometryFrame']='Vehicle root; only ground normalization changes world height'
bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
    if obj.type not in ['CAMERA','LIGHT']:obj.select_set(True)
path=repo/'Taierzhuang1938/_blender/Script_Type94Export.py';spec=importlib.util.spec_from_file_location('CastShoeExport',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
glb=root/'Exports/Model_Type94TanketteHighShapeV48TrackTrial.glb';module.ExportGltf(glb)
grounding=module.TranslateRootGltf(glb,(0,groundShift,0))
rootNode.location.z+=groundShift;bpy.context.view_layer.update()
blend=root/'Scene_Type94TanketteHighShapeV48TrackTrial.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend))
sha=hashlib.sha256(glb.read_bytes()).hexdigest()
(root/'Acceptance/Data_TrackTrialSwapV48.json').write_text(json.dumps(dict(sourceBase=str(source),sourceBaseSha256=gray['sourceBlendSha256'],
    sourceBlend=str(blend),sourceBlendSha256=hashlib.sha256(blend.read_bytes()).hexdigest(),glb=str(glb),sha256=sha,
    replacedTrackOwners=170,groundShiftM=groundShift,grounding=grounding,oldRootLocationM=oldRoot,newRootLocationM=list(rootNode.location),
    scope='Locked V37 source, only shared-shoe data plus zero-rest gun-yaw node and explicit ground normalization'),indent=2),encoding='utf-8')
(root/'Acceptance/Data_MechanismShapeV48TrackTrial.json').write_text(json.dumps(dict(path=track,sha256=sha),indent=2),encoding='utf-8')
print('TYPE94_LOCKED_BASE_SHOE_SWAP_COMPLETE',sha,flush=True)
