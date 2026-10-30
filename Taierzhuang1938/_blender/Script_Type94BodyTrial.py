"""Cold-build the explicit V50 driver / V49 turret trial in its own directory.

The active V37 gray source, V44 PBR source and canonical game file are not read
or replaced. TYPE94_SOURCE_ROOT selects this trial's output directory itself.
"""
import bpy
import os
import json
import hashlib
import importlib.util
from pathlib import Path


def Main():
    assert not bpy.data.filepath, 'Body trial requires a fresh Blender scene'
    repo = Path(os.environ.get('TYPE94_REPO_ROOT', str(Path(__file__).resolve().parents[2])))
    defaultRoot = Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/DriverV50')
    source = Path(os.environ.get('TYPE94_SOURCE_ROOT', str(defaultRoot)))
    os.environ.update(TYPE94_REPO_ROOT=str(repo), TYPE94_SOURCE_ROOT=str(source),
                      TYPE94_BODY_LAYOUT='Data_BodyTrialV50.json')
    for name in ['TYPE94_TRACK_SHOE_LAYOUT', 'TYPE94_RUNNING_GEAR_LAYOUT', 'TYPE94_TURRET_LAYOUT']:
        os.environ.pop(name, None)
    script = repo/'Taierzhuang1938/_blender/Script_Type94GrayStudy.py'
    exec(compile(script.read_text(encoding='utf-8'), str(script), 'exec'),
         {'__name__': '__main__', '__file__': str(script)})
    script = repo/'Taierzhuang1938/_blender/Script_Type94GunTraverse.py'
    spec = importlib.util.spec_from_file_location('Type94BodyTraverse', script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.AddGunTraverse()
    scene = bpy.context.scene
    scene['BodyTrialLayout'] = 'Data_BodyTrialV50.json'
    scene['HistoricalShapeAccepted'] = False
    blend = source/'Scene_Type94TanketteHighShapeV50DriverTrial.blend'
    glb = source/'Exports/Model_Type94TanketteHighShapeV50DriverTrial.glb'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in scene.objects:
        if obj.type not in ['CAMERA', 'LIGHT']:
            obj.select_set(True)
    script = repo/'Taierzhuang1938/_blender/Script_Type94Export.py'
    spec = importlib.util.spec_from_file_location('Type94BodyExport', script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.ExportGltf(glb)
    sha = hashlib.sha256(glb.read_bytes()).hexdigest()
    for name in ['Data_MechanismShapeV50DriverTrial.json', 'Data_ShapeV50DriverTrialGrayBuild.json']:
        file = source/'Acceptance'/name
        data = json.loads(file.read_text(encoding='utf-8'))
        data['grayBeforeTraverseSha256'] = data['sha256']
        data.update(sha256=sha, sourceProducer='Taierzhuang1938/_blender/Script_Type94BodyTrial.py')
        file.write_text(json.dumps(data, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(dict(source=str(blend), glb=str(glb), sha256=sha,
                          complete=False, pbrAccepted=False), indent=2), flush=True)


if __name__ == '__main__':
    Main()
