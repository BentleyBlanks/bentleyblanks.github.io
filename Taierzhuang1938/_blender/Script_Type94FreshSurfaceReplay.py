"""Factory-startup geometry, fresh UV and complete PBR replay of retained V37.

This is an independent technical replay, not final reference-shape acceptance.
Build via Script_BlenderMcp start --batch, run SurfaceWearBake with the same
source root/revision in ordinary Python, then run this entry with phase Apply.
No source .blend is read during Build; all meshes come from repository recipes.
"""
import bpy
import hashlib
import importlib.util
import json
import os
import shutil
from pathlib import Path

repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2])))
retained=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')
root=Path(os.environ.get('TYPE94_REPLAY_ROOT',str(retained/'ReplayV46')))
assert root.resolve().is_relative_to(retained.resolve()) and root.resolve()!=retained.resolve()
phase=os.environ.get('TYPE94_FRESH_PHASE','Build')
assert phase in ['Build','Apply']
revision='SurfaceV46Replay'
(root/'Acceptance').mkdir(parents=True,exist_ok=True)
(root/'Exports').mkdir(exist_ok=True)
os.environ.update(TYPE94_REPO_ROOT=str(repo),TYPE94_SOURCE_ROOT=str(root),TYPE94_QUALITY='High',
    TYPE94_SURFACE_REVISION=revision,TYPE94_PBR_VARIANT=revision,TYPE94_SURFACE_STYLE='SurfaceV44',
    TYPE94_UV_MODE='Fresh')
os.environ.pop('TYPE94_RUNNING_GEAR_LAYOUT',None)
os.environ.pop('TYPE94_TRACK_SHOE_LAYOUT',None)
os.environ.pop('TYPE94_TURRET_LAYOUT',None)
os.environ.pop('TYPE94_BODY_LAYOUT',None)


def Run(name):
    path=repo/'Taierzhuang1938/_blender'/name
    exec(compile(path.read_text(encoding='utf-8'),str(path),'exec'),
         {'__name__':'__main__','__file__':str(path)})


def Module(name):
    path=repo/'Taierzhuang1938/_blender'/name
    spec=importlib.util.spec_from_file_location('Type94Fresh'+path.stem,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


destination=root/('Scene_Type94TanketteHigh'+revision+'.blend')
if phase=='Build':
    assert not bpy.data.filepath,'Build requires a separate factory-startup batch'
    bpy.context.scene['BlenderMcpTask']='Type94Tankette'
    camera=retained/'Acceptance/Data_CameraFit.json'
    shutil.copy2(camera,root/'Acceptance/Data_CameraFit.json')
    Run('Script_Type94TanketteBuild.py')
    Module('Script_Type94MechanismCorrect.py').CorrectMechanism()
    Module('Script_Type94GunTraverse.py').AddGunTraverse()
    scene=bpy.context.scene
    scene.render.threads_mode='FIXED';scene.render.threads=6
    scene.view_layers[0].material_override=None
    scene['SurfaceGeometryRevision']='ShapeV37'
    scene['SurfaceStudyRevision']=revision
    scene['SurfaceHistoricalPlacementAccepted']=False
    scene['SurfaceFreshGeometryReplay']=True
    scene['SurfaceFreshReplayOpenedSourceBlend']=False
    scene['SurfaceFreshReplayImportedGeometry']=False
    attributes=Module('Script_Type94SurfaceAttributes.py').PrepareSurfaceAttributes(scene)
    bpy.ops.wm.save_as_mainfile(filepath=str(destination))
    (root/'Acceptance/Data_FreshSurfacePreparationV46.json').write_text(json.dumps(dict(
        factoryStartup=True,sourceBlendRead=False,geometryImported=False,retainedReference='ShapeV37',
        uvMode='Fresh',uvCheckpointUsed=False,materialStyle='SurfaceV44',
        cameraJsonSha256=hashlib.sha256(camera.read_bytes()).hexdigest(),attributes=attributes,
        scope='Fresh recipe replay of retained geometry, not a newly accepted whole-reference shape'),indent=2),encoding='utf-8')
    Run('Script_Type94TankettePbr.py')
    Run('Script_Type94SurfaceWearExtract.py')
else:
    assert not bpy.data.filepath,'Apply requires a separate owned batch'
    bpy.ops.wm.open_mainfile(filepath=str(destination))
    assert bpy.context.scene.get('SurfaceFreshGeometryReplay') and bpy.context.scene.get('SurfaceUvGenerationMode')=='Fresh'
    Run('Script_Type94SurfaceWearApply.py')
print('TYPE94_FRESH_SURFACE_REPLAY',phase,'COMPLETE',flush=True)
