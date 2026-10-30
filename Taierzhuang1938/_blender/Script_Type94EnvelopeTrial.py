"""Cold-build a complete dimension-envelope hypothesis in an isolated directory.

The declared forebody is a construction hypothesis, not accepted museum shape.
Retained gray/PBR assets and canonical game exports are never overwritten.
"""
import bpy
import hashlib
import importlib.util
import json
import os
from pathlib import Path


def LoadModule(file, name):
    spec=importlib.util.spec_from_file_location(name,file)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def Main():
    assert not bpy.data.filepath,'Envelope trials require a fresh Blender scene'
    repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2])))
    bodyFile=os.environ.get('TYPE94_BODY_LAYOUT','Data_BodyTrialV53.json')
    assert Path(bodyFile).name==bodyFile
    body=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette'/bodyFile).read_text(encoding='utf-8'))
    revision=body['revision']
    folders={'ShapeV53EnvelopeTrial':'EnvelopeV53','ShapeV54ForebodyTrial':'ForebodyV54','ShapeV55VentTrial':'VentV55','ShapeV61SuspensionTrial':'SuspensionV61','ShapeV63GunFrontTrial':'GunFrontV63','ShapeV64FrontDetailTrial':'DetailV64'}
    assert revision in folders,'Explicit output identity required for each new trial'
    source=Path(os.environ.get('TYPE94_SOURCE_ROOT',str(Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')/folders[revision])))
    source.mkdir(parents=True,exist_ok=True)
    (source/'Acceptance').mkdir(exist_ok=True)
    (source/'Exports').mkdir(exist_ok=True)
    os.environ.update(TYPE94_REPO_ROOT=str(repo),TYPE94_SOURCE_ROOT=str(source),TYPE94_BODY_LAYOUT=bodyFile)
    for name in ['TYPE94_TRACK_SHOE_LAYOUT','TYPE94_RUNNING_GEAR_LAYOUT','TYPE94_TURRET_LAYOUT']:
        os.environ.pop(name,None)
    script=repo/'Taierzhuang1938/_blender/Script_Type94GrayStudy.py'
    exec(compile(script.read_text(encoding='utf-8'),str(script),'exec'),{'__name__':'__main__','__file__':str(script)})
    LoadModule(repo/'Taierzhuang1938/_blender/Script_Type94GunTraverse.py','EnvelopeTraverse').AddGunTraverse()
    scene=bpy.context.scene
    scene['BodyTrialLayout']=bodyFile
    scene['HistoricalShapeAccepted']=False
    scene['EnvelopeSolverConverged']=False
    blend=source/('Scene_Type94TanketteHigh'+revision+'.blend')
    glb=source/'Exports'/('Model_Type94TanketteHigh'+revision+'.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for obj in scene.objects:
        if obj.type not in ['CAMERA','LIGHT']:obj.select_set(True)
    LoadModule(repo/'Taierzhuang1938/_blender/Script_Type94Export.py','EnvelopeExport').ExportGltf(glb)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    sha=hashlib.sha256(glb.read_bytes()).hexdigest()
    for filename in ['Data_Mechanism'+revision+'.json','Data_'+revision+'GrayBuild.json']:
        file=source/'Acceptance'/filename
        data=json.loads(file.read_text(encoding='utf-8'))
        data['beforeTraverseSha256']=data['sha256']
        data.update(sha256=sha,sourceProducer='Taierzhuang1938/_blender/Script_Type94EnvelopeTrial.py')
        file.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(source=str(blend),glb=str(glb),sha256=sha,complete=False,referenceAccepted=False),indent=2),flush=True)


if __name__=='__main__':Main()
