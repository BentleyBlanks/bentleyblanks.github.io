"""Reuse proven V100 low UVs and refresh donors to current V102 wear."""
import ast,bpy,hashlib,importlib.util,json,os,numpy as np
from pathlib import Path
from mathutils import Vector
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_GAME_ROOT',str(base/'GameWearV103')));acc=root/'Acceptance';transfer=json.loads((acc/'Data_SurfaceTransferV103.json').read_text());assert transfer['passed']and not bpy.data.filepath;high=transfer['high'];prior=json.loads((base/'GameTrialV100/Acceptance/Data_GameProjectionPreparationV100.json').read_text());geometry=json.loads((acc/'Data_GameGeometryV103.json').read_text())
for directory in [root/'Exports',root/'Textures/GamePbrV103',root/'Rebuild']:directory.mkdir(parents=True,exist_ok=True)
assert hashlib.sha256(Path(prior['workBlend']).read_bytes()).hexdigest()==prior['workBlendSha256'];assert hashlib.sha256(Path(high['sourceBlend']).read_bytes()).hexdigest()==high['sourceBlendSha256'];bpy.ops.wm.open_mainfile(filepath=prior['workBlend']);scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette';stages=json.loads(scene['GameProjectionStagesV100'])
path=repo/'Taierzhuang1938/_blender/Script_Type94StableExportV102.py';spec=importlib.util.spec_from_file_location('Refresh103Export',path);exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter);exporter.StoreFrames(transfer['low']['sourceGlb'],transfer['low']['sha256'])
file=Path(__file__).with_name('Script_Type94GameProjectionV100.py');syntax=ast.parse(file.read_text());scope=dict(bpy=bpy,np=np,Vector=Vector);exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in ['Canonical','NewMesh']],type_ignores=[]),str(file),'exec'),scope)
names=tuple(r['mesh']for r in geometry['records'])
with bpy.data.libraries.load(high['sourceBlend'],link=False)as(available,loaded):loaded.objects=list(names)
donors=dict(zip(names,loaded.objects))
for obj in donors.values():obj.data=exporter.TriangulatedCopy(obj.data)
for role,stage in stages.items():
    bpy.data.objects.remove(bpy.data.objects[stage['donor']],do_unlink=True);active=stage['owners'];offsets=[Vector(((names.index(n)%8)*5,(names.index(n)//8)*5,0))for n in active];source,_=scope['NewMesh'](stage['donor'],[donors[n]for n in active],[list(range(len(donors[n].data.polygons)))for n in active],offsets,True);assert source.name==stage['donor']
    original=base/'GameTrialV100/Acceptance'/('Data_LowAtlasMask'+role+'V100.npz');(acc/('Data_LowAtlasMask'+role+'V103.npz')).write_bytes(original.read_bytes())
for obj in loaded.objects:bpy.data.objects.remove(obj,do_unlink=True)
scene['GameProjectionStagesV103']=json.dumps(stages);scene['GameUvGenerationMode']='Exact inherited V100 UVs';scene['GameHighSourceSha256']=high['sha256'];work=root/'Scene_Type94ProjectionWorkV103.blend';bpy.ops.wm.save_as_mainfile(filepath=str(work));report=dict(prior,referenceSha256=high['sha256'],referenceBlendSha256=high['sourceBlendSha256'],workBlend=str(work),workBlendSha256=hashlib.sha256(work.read_bytes()).hexdigest(),freshUvs=False,uvsInheritedFromSha256=transfer['low']['sha256'],donorTriangulation='ExactSourceExporterTriangulation',scope='Exact proven low UVs and geometry, actual current high materials, and saved authored low tangent frames')
(acc/'Data_GameProjectionPreparationV103.json').write_text(json.dumps(report,indent=2)+'\n');print('TYPE94_CURRENT_WEAR103_PREPARED',flush=True)
