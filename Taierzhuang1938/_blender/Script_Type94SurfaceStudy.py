"""Bake the current Type94 geometry as a separate editable surface study.

Run through Script_BlenderMcp. Gray and retained game checkpoints are not
overwritten. Microfinish and localized wear remain inferred surface estimates.
"""
import bpy,os,json,hashlib
from pathlib import Path
repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2] if '__file__'in globals()else Path.cwd())))
source=Path(os.environ.get('TYPE94_SOURCE_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette'))
assert bpy.context.scene.get('BlenderMcpTask')=='Type94Tankette'
assert source.resolve()in Path(bpy.data.filepath).resolve().parents
asset=repo/'Taierzhuang1938/Model/Type94Tankette'
candidate=json.loads((asset/'Data_Type94Tankette.json').read_text(encoding='utf-8'))
gray=json.loads((asset/os.environ.get('TYPE94_GRAY_MANIFEST',candidate['activeGrayStudy'])).read_text(encoding='utf-8'))
assert Path(bpy.data.filepath)==Path(gray['sourceBlend']),'Open the active editable gray source first'
assert hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest()==gray['sourceBlendSha256']
revision=os.environ.get('TYPE94_SURFACE_REVISION','SurfaceV36')
assert revision in ['SurfaceV34','SurfaceV36','SurfaceV39','SurfaceV44']
checkpointFile=asset/('Data_SurfaceStudy'+revision.removeprefix('Surface')+'.json')
if checkpointFile.exists():
    checkpoint=json.loads(checkpointFile.read_text(encoding='utf-8'))
    assert checkpoint['baseGraySha256']==gray['sha256'],'This surface revision belongs to another gray checkpoint; use a new surface revision instead of overwriting its source'
scene=bpy.context.scene;scene['SurfaceGeometryRevision']=gray['revision'];scene['SurfaceGeometryGlbSha256']=gray['sha256']
scene['SurfaceStudyRevision']=revision;scene['SurfaceHistoricalPlacementAccepted']=False
destination=source/('Scene_Type94TanketteHigh'+revision+'.blend')
bpy.ops.wm.save_as_mainfile(filepath=str(destination))
if revision in ['SurfaceV39','SurfaceV44']:
    import importlib.util
    traverseScript=repo/'Taierzhuang1938/_blender/Script_Type94GunTraverse.py'
    spec=importlib.util.spec_from_file_location('Type94SurfaceGunTraverse',traverseScript)
    traverse=importlib.util.module_from_spec(spec);spec.loader.exec_module(traverse)
    traverse.AddGunTraverse()
scene.view_layers[0].material_override=None
import importlib.util
attributesPath=repo/'Taierzhuang1938/_blender/Script_Type94SurfaceAttributes.py'
attributesSpec=importlib.util.spec_from_file_location('Type94SurfaceAttributes',attributesPath)
attributesModule=importlib.util.module_from_spec(attributesSpec);attributesSpec.loader.exec_module(attributesModule)
attributeCounts=attributesModule.PrepareSurfaceAttributes(scene)
(source/('Acceptance/Data_'+revision+'Preparation.json')).write_text(json.dumps({'grayRevision':gray['revision'],'grayGlbSha256':gray['sha256'],'sourceGrayBlendSha256':gray['sourceBlendSha256'],'attributes':attributeCounts,'scope':'Material attributes only; no geometry/kinematic changes. Cast and contact microfinish estimates, not exact historical wear.'},indent=2),encoding='utf-8')
os.environ['TYPE94_REPO_ROOT']=str(repo);os.environ['TYPE94_SOURCE_ROOT']=str(source);os.environ['TYPE94_PBR_VARIANT']=revision;os.environ['TYPE94_SURFACE_STYLE']=revision
script=repo/'Taierzhuang1938/_blender/Script_Type94TankettePbr.py'
exec(compile(script.read_text(encoding='utf-8'),str(script),'exec'),{'__name__':'__main__','__file__':str(script)})
