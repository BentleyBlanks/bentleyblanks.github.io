"""Cold-build the isolated V49 turret trial; keep active gray/PBR files intact.

Run with Script_BlenderMcp.mjs start --task Type94Tankette --batch <this file>.
TYPE94_SOURCE_ROOT, when set, selects the trial output directory itself.
"""
import bpy
import hashlib
import importlib.util
import json
import os
from pathlib import Path


def Main():
    assert not bpy.data.filepath, 'Turret trial requires a fresh Blender scene'
    repo = Path(os.environ.get('TYPE94_REPO_ROOT', str(Path(__file__).resolve().parents[2])))
    defaultRoot = Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/TurretV49')
    source = Path(os.environ.get('TYPE94_SOURCE_ROOT', str(defaultRoot)))
    source.mkdir(parents=True, exist_ok=True)
    (source/'Acceptance').mkdir(exist_ok=True)
    (source/'Exports').mkdir(exist_ok=True)
    os.environ.update(TYPE94_REPO_ROOT=str(repo), TYPE94_SOURCE_ROOT=str(source),
                      TYPE94_TURRET_LAYOUT='Data_TurretTrialV49.json')
    for name in ['TYPE94_TRACK_SHOE_LAYOUT', 'TYPE94_RUNNING_GEAR_LAYOUT', 'TYPE94_BODY_LAYOUT']:
        os.environ.pop(name, None)
    bpy.context.scene['BlenderMcpTask'] = 'Type94Tankette'
    script = repo/'Taierzhuang1938/_blender/Script_Type94GrayStudy.py'
    exec(compile(script.read_text(encoding='utf-8'), str(script), 'exec'),
         {'__name__': '__main__', '__file__': str(script)})
    script = repo/'Taierzhuang1938/_blender/Script_Type94GunTraverse.py'
    spec = importlib.util.spec_from_file_location('Type94TrialTraverse', script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.AddGunTraverse()
    scene = bpy.context.scene
    scene['TurretEnvelopeTrial'] = 'Data_TurretTrialV49.json'
    scene['HistoricalShapeAccepted'] = False
    blend = source/'Scene_Type94TanketteHighShapeV49TurretTrial.blend'
    glb = source/'Exports/Model_Type94TanketteHighShapeV49TurretTrial.glb'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in scene.objects:
        if obj.type not in ['CAMERA', 'LIGHT']:
            obj.select_set(True)
    script = repo/'Taierzhuang1938/_blender/Script_Type94Export.py'
    spec = importlib.util.spec_from_file_location('Type94TrialExport', script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.ExportGltf(glb)
    sha = hashlib.sha256(glb.read_bytes()).hexdigest()
    pathFile = source/'Acceptance/Data_MechanismShapeV49TurretTrial.json'
    data = json.loads(pathFile.read_text(encoding='utf-8'))
    data['grayBeforeTraverseSha256'] = data['sha256']
    data['sha256'] = sha
    pathFile.write_text(json.dumps(data, indent=2)+'\n', encoding='utf-8')
    reportFile = source/'Acceptance/Data_ShapeV49TurretTrialGrayBuild.json'
    data = json.loads(reportFile.read_text(encoding='utf-8'))
    data['grayBeforeTraverseSha256'] = data['sha256']
    data.update(sha256=sha, sourceProducer=str(Path(__file__).relative_to(repo)))
    reportFile.write_text(json.dumps(data, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(dict(source=str(blend), glb=str(glb), sha256=sha,
                          complete=False, pbrAccepted=False), indent=2), flush=True)


if __name__ == '__main__':
    Main()
