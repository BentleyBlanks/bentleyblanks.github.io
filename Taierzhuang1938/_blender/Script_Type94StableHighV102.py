"""Current immutable wear source with embedded authored Mikk frames."""
import bpy,hashlib,importlib.util,json,os
from pathlib import Path
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_STABLE_ROOT',str(base/'SurfaceV102')))
for directory in [root,root/'Acceptance',root/'Exports']:directory.mkdir(parents=True,exist_ok=True)
source=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV101.json').read_text());assert not bpy.data.filepath
assert hashlib.sha256(Path(source['sourceBlend']).read_bytes()).hexdigest()==source['sourceBlendSha256']
spec=importlib.util.spec_from_file_location('Stable102Export',Path(__file__).with_name('Script_Type94StableExportV102.py'));exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)
destination=root/'Scene_Type94TanketteStableWearV102.blend';bpy.ops.wm.open_mainfile(filepath=source['sourceBlend']);assert bpy.context.scene.get('BlenderMcpTask')=='Type94Tankette';cache=exporter.StoreFrames(source['sourceGlb'],source['sha256']);bpy.context.scene['StableExportRecipe']='AuthoredMikkFramesV102';bpy.ops.wm.save_as_mainfile(filepath=str(destination));records=[]
for label in ['Primary','Reopen']:
    bpy.ops.wm.open_mainfile(filepath=str(destination));bpy.ops.object.select_all(action='DESELECT');asset=bpy.data.objects['Type94Tankette']
    for obj in [asset,*asset.children_recursive]:obj.select_set(True)
    output=root/'Exports'/('Model_Type94TanketteStableWear'+label+'V102.glb');exporter.ExportGltf(output);records.append(dict(label=label,file=str(output),sha256=hashlib.sha256(output.read_bytes()).hexdigest()))
report=dict(sourceBlend=str(destination),sourceBlendSha256=hashlib.sha256(destination.read_bytes()).hexdigest(),reference=source,exports=records,embeddedAuthorFrames=cache,wholeReferenceAccepted=False)
(root/'Acceptance/Data_StableHighV102.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(exports=records)),flush=True)
