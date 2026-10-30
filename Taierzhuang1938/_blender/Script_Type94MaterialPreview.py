"""Fresh UV/12-map material preview of the current isolated Type94 geometry.

Build reads only the declared editable candidate. The preview never replaces
canonical assets or implies whole-reference/game-budget acceptance.
"""
import bpy,hashlib,importlib.util,json,os
from pathlib import Path
repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2])))
base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'SurfaceV56';revision='SurfaceV56Preview'
phase=os.environ.get('TYPE94_PREVIEW_PHASE','Build');assert phase in ['Build','Apply']
for name in ['Acceptance','Exports']: (root/name).mkdir(parents=True,exist_ok=True)
os.environ.update(TYPE94_REPO_ROOT=str(repo),TYPE94_SOURCE_ROOT=str(root),TYPE94_SURFACE_REVISION=revision,TYPE94_PBR_VARIANT=revision,
    TYPE94_SURFACE_STYLE='SurfaceV44',TYPE94_UV_MODE='Fresh',TYPE94_BODY_LAYOUT='Data_BodyTrialV55.json')
for name in ['TYPE94_TRACK_SHOE_LAYOUT','TYPE94_RUNNING_GEAR_LAYOUT','TYPE94_TURRET_LAYOUT']:os.environ.pop(name,None)
def Run(name):
    file=repo/'Taierzhuang1938/_blender'/name
    exec(compile(file.read_text(encoding='utf-8'),str(file),'exec'),{'__name__':'__main__','__file__':str(file)})
def Module(name):
    file=repo/'Taierzhuang1938/_blender'/name;spec=importlib.util.spec_from_file_location('Preview'+file.stem,file);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
destination=root/('Scene_Type94TanketteHigh'+revision+'.blend')
assert not bpy.data.filepath
if phase=='Build':
    source=base/'VentV55/Scene_Type94TanketteHighShapeV55VentTrial.blend';glb=base/'VentV55/Exports/Model_Type94TanketteHighShapeV55VentTrial.glb'
    bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette'
    scene.view_layers[0].material_override=None;scene.render.threads_mode='FIXED';scene.render.threads=4
    scene['SurfaceGeometryRevision']='ShapeV55VentTrial';scene['SurfaceGeometryGlbSha256']=hashlib.sha256(glb.read_bytes()).hexdigest()
    scene['SurfaceStudyRevision']=revision;scene['SurfaceHistoricalPlacementAccepted']=False
    attributes=Module('Script_Type94SurfaceAttributes.py').PrepareSurfaceAttributes(scene)
    bpy.ops.wm.save_as_mainfile(filepath=str(destination))
    report=dict(sourceBlend=str(source),sourceBlendSha256=hashlib.sha256(source.read_bytes()).hexdigest(),sourceGlbSha256=hashlib.sha256(glb.read_bytes()).hexdigest(),
        uvMode='Fresh',uvCheckpointUsed=False,attributes=attributes,previewOnly=True,wholeReferenceAccepted=False)
    (root/'Acceptance/Data_MaterialPreviewPreparationV56.json').write_text(json.dumps(report,indent=2)+'\n')
    Run('Script_Type94TankettePbr.py');Run('Script_Type94SurfaceWearExtract.py')
else:
    bpy.ops.wm.open_mainfile(filepath=str(destination));assert bpy.context.scene.get('SurfaceUvGenerationMode')=='Fresh'
    Run('Script_Type94SurfaceWearApply.py')
print('TYPE94_V56_MATERIAL_PREVIEW_'+phase.upper()+'_COMPLETE',flush=True)
