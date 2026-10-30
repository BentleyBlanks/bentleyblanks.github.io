"""Reconstruct the V63 MG front while conserving the verified V61 source.

The complete constructor supplies the new circular front and shoulder. Only
that paint mesh is taken from it. The source's barrel group is triangulated
before its rigid translation so float-sensitive ngon diagonals cannot change.
Unrelated source meshes, all controls and the track path remain untouched.
"""
import bpy
import hashlib
import importlib.util
import json
import os
import shutil
from pathlib import Path


def Main():
    assert not bpy.data.filepath,'V63 requires a fresh owned Blender process'
    repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2])))
    base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')
    baseline=base/'SuspensionV61/Scene_Type94TanketteHighShapeV61SuspensionTrial.blend'
    baselineSha='bb7a393fc178604d600e0be7f347fb279e9e70eade9d8841ee11ead09be5a2b8'
    assert hashlib.sha256(baseline.read_bytes()).hexdigest()==baselineSha
    os.environ['TYPE94_BODY_LAYOUT']='Data_BodyTrialV63.json'
    script=repo/'Taierzhuang1938/_blender/Script_Type94EnvelopeTrial.py'
    exec(compile(script.read_text(encoding='utf-8'),str(script),'exec'),{'__name__':'__main__','__file__':str(script)})
    root=Path(os.environ['TYPE94_SOURCE_ROOT'])
    blend=root/'Scene_Type94TanketteHighShapeV63GunFrontTrial.blend'
    glb=root/'Exports/Model_Type94TanketteHighShapeV63GunFrontTrial.glb'
    paintName=bpy.data.objects['Geometry_MachineGunPitch_Paint'].data.name
    construction=root/'Construction/Scene_Type94GunFrontConstructorV63.blend'
    construction.parent.mkdir(exist_ok=True)
    shutil.copy2(blend,construction)
    front=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_TurretFrontLayoutV63.json').read_text())
    bpy.ops.wm.open_mainfile(filepath=str(baseline))
    assert bpy.context.scene.get('BlenderMcpTask')=='Type94Tankette'
    with bpy.data.libraries.load(str(construction),link=False)as(source,target):
        assert paintName in source.meshes
        target.meshes=[paintName]
    bpy.data.objects['Geometry_MachineGunPitch_Paint'].data=target.meshes[0]
    file=repo/'Taierzhuang1938/_blender/Script_Type94Export.py'
    spec=importlib.util.spec_from_file_location('V63SourceExport',file);exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)
    offset=front['barrel']['axisZBeforeReanchorM']-front['barrel']['previousAxisZBeforeReanchorM']
    for name in ['Geometry_MachineGunPitch_Steel','Geometry_MachineGunPitch_Dark']:
        obj=bpy.data.objects[name];original=obj.data;original.use_fake_user=True
        moved=exporter.TriangulatedCopy(original);moved.name=original.name+'_V63Offset';obj.data=moved
        for vertex in moved.vertices:vertex.co.z+=offset
        moved.update()
    gun=bpy.data.objects['MachineGunPitch']
    gun['MgFrontRaisedFittingLayout']='Data_TurretFrontLayoutV63.json'
    gun['MgBarrelAxisZLocalM']=front['barrel']['axisZBeforeReanchorM']
    gun['MgFrontFaceRadiusM']=front['movingFrontBall']['frontFaceRadiusM']
    gun['MgFrontProfileInferred']=True
    bpy.data.objects['Hull']['BodyTrialLayout']='Data_BodyTrialV63.json'
    bpy.context.scene['BodyTrialLayout']='Data_BodyTrialV63.json'
    bpy.context.scene['HistoricalShapeAccepted']=False
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    asset=bpy.data.objects['Type94Tankette']
    for obj in [asset,*asset.children_recursive]:obj.select_set(True)
    exporter.ExportGltf(glb)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    sha=hashlib.sha256(glb.read_bytes()).hexdigest()
    for name in ['Data_MechanismShapeV63GunFrontTrial.json','Data_ShapeV63GunFrontTrialGrayBuild.json']:
        file=root/'Acceptance'/name;data=json.loads(file.read_text());data.update(sha256=sha,sourceProducer='Taierzhuang1938/_blender/Script_Type94GunFrontTrial.py',preservedSourceV61Sha256=baselineSha)
        file.write_text(json.dumps(data,indent=2)+'\n')
    print(json.dumps(dict(sha256=sha,preservedSourceV61Sha256=baselineSha,source=str(blend),glb=str(glb),wholeReferenceAccepted=False),indent=2),flush=True)


if __name__=='__main__':Main()
