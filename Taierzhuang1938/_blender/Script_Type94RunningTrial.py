"""Cold-build the explicit V51 running trial without replacing accepted files.

Export in the declared V50 root basis, then apply only the whole-asset ground
translation to GLB JSON. This avoids float32 drift in unrelated mesh poses.
"""
import bpy
import os
import json
import hashlib
import importlib.util
from pathlib import Path


def Main():
    assert not bpy.data.filepath, 'Running trial requires a fresh Blender scene'
    repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2])))
    defaultRoot=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/RunningGearV51')
    source=Path(os.environ.get('TYPE94_SOURCE_ROOT',str(defaultRoot)))
    os.environ.update(TYPE94_REPO_ROOT=str(repo),TYPE94_SOURCE_ROOT=str(source),TYPE94_BODY_LAYOUT='Data_BodyTrialV51.json')
    for name in ['TYPE94_TRACK_SHOE_LAYOUT','TYPE94_RUNNING_GEAR_LAYOUT','TYPE94_TURRET_LAYOUT']:
        os.environ.pop(name,None)
    script=repo/'Taierzhuang1938/_blender/Script_Type94GrayStudy.py'
    exec(compile(script.read_text(encoding='utf-8'),str(script),'exec'),{'__name__':'__main__','__file__':str(script)})
    body=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_BodyTrialV51.json').read_text(encoding='utf-8'))
    root=bpy.data.objects['Type94Tankette']
    physicalRootZ=root.location.z
    root.location.z=body['exportBasisRootZM']
    bpy.context.view_layer.update()
    script=repo/'Taierzhuang1938/_blender/Script_Type94GunTraverse.py'
    spec=importlib.util.spec_from_file_location('RunningTraverse',script)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    module.AddGunTraverse()
    scene=bpy.context.scene
    scene['BodyTrialLayout']='Data_BodyTrialV51.json'
    scene['HistoricalShapeAccepted']=False
    blend=source/'Scene_Type94TanketteHighShapeV51RunningTrial.blend'
    glb=source/'Exports/Model_Type94TanketteHighShapeV51RunningTrial.glb'
    bpy.ops.object.select_all(action='DESELECT')
    for obj in scene.objects:
        if obj.type not in ['CAMERA','LIGHT']:obj.select_set(True)
    script=repo/'Taierzhuang1938/_blender/Script_Type94Export.py'
    spec=importlib.util.spec_from_file_location('RunningExport',script)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    module.ExportGltf(glb)
    grounding=module.TranslateRootGltf(glb,(0,physicalRootZ-body['exportBasisRootZM'],0))
    root.location.z=physicalRootZ
    bpy.context.view_layer.update()
    scene['RunningAssemblyExportBasisRootZM']=body['exportBasisRootZM']
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    report=dict(grounding=grounding,physicalRootZM=physicalRootZ,exportBasisRootZM=body['exportBasisRootZM'])
    (source/'Acceptance/Data_RunningGroundingV51.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    sha=hashlib.sha256(glb.read_bytes()).hexdigest()
    for name in ['Data_MechanismShapeV51RunningTrial.json','Data_ShapeV51RunningTrialGrayBuild.json']:
        file=source/'Acceptance'/name;data=json.loads(file.read_text(encoding='utf-8'))
        data['grayBeforeTraverseSha256']=data['sha256']
        data.update(sha256=sha,sourceProducer='Taierzhuang1938/_blender/Script_Type94RunningTrial.py')
        file.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(source=str(blend),glb=str(glb),sha256=sha,complete=False,metricEnvelopeAccepted=False),indent=2),flush=True)


if __name__=='__main__':Main()
