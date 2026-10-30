"""Reopen and sweep the active gray export with its exact-generation path.

Run through Script_BlenderMcp.mjs exec. This does not accept PBR, photographic
matching or the game budget, and never replaces the editable source scene.
"""
import bpy
import hashlib
import importlib.util
import json
import os
from pathlib import Path

repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2] if '__file__' in globals() else Path.cwd())))
source=Path(os.environ.get('TYPE94_SOURCE_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette'))
assert bpy.context.scene.get('BlenderMcpTask')=='Type94Tankette'
assert not bpy.data.filepath or source.resolve() in Path(bpy.data.filepath).resolve().parents
assetDir=repo/'Taierzhuang1938/Model/Type94Tankette'
candidate=json.loads((assetDir/'Data_Type94Tankette.json').read_text(encoding='utf-8'))
name=candidate['activeGrayStudy']
assert Path(name).name==name
metadata=json.loads((assetDir/name).read_text(encoding='utf-8'))
revision=metadata['revision']
glb=source/'Exports'/('Model_Type94TanketteHigh'+revision+'.glb')
digest=hashlib.sha256(glb.read_bytes()).hexdigest()
assert digest==metadata['sha256'],'Active gray manifest does not identify this export'
pathManifest=source/'Acceptance'/('Data_Mechanism'+revision+'.json')
mechanism=json.loads(pathManifest.read_text(encoding='utf-8'))
assert mechanism['sha256']==digest,'Movement path belongs to another export'
window=bpy.context.window_manager.windows[0]
area=next((a for a in window.screen.areas if a.type=='VIEW_3D'),window.screen.areas[0])
original=window.scene
for previous in list(bpy.data.scenes):
    if previous!=original and previous.name.startswith('Scene_Type94ActualGrayReimport') and previous.get('BlenderMcpTask')=='Type94Tankette':
        for obj in list(previous.objects):
            if len(obj.users_scene)==1:bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.scenes.remove(previous)
scene=bpy.data.scenes.new('Scene_Type94ActualGrayReimport')
scene['BlenderMcpTask']='Type94Tankette'
scene['SourceGltfSha256']=digest
scene['SourceTrackPathJson']=json.dumps(mechanism['path'])
window.scene=scene
tag=revision.removeprefix('Shape')
reportPath=source/'Acceptance'/('Data_'+tag+'GrayMotionAudit.json')
archive=source/'Acceptance'/('Scene_'+revision+'ActualGrayReimport.blend')
try:
    with bpy.context.temp_override(window=window,area=area):
        bpy.ops.import_scene.gltf(filepath=str(glb))
        bpy.context.view_layer.update()
        script=repo/'Taierzhuang1938/_blender/Script_VerifyType94Sweep.py'
        spec=importlib.util.spec_from_file_location('Type94GrayExportSweep',script)
        verifier=importlib.util.module_from_spec(spec);spec.loader.exec_module(verifier)
        report=verifier.VerifyScene(scene,trackPath=mechanism['path'])
        meshes=[obj for obj in scene.objects if obj.type=='MESH']
        report.update({'actualImport':True,'sourceGlb':str(glb),'pathManifest':str(pathManifest),
            'triangles':sum(len(p.vertices)-2 for obj in meshes for p in obj.data.polygons),
            'meshNodes':len(meshes),'reimportBlend':str(archive),
            'scope':revision+' actual gray reimport and movement only; no PBR, game-budget or reference acceptance'})
        for obj in original.objects:
            if obj.type in ['CAMERA','LIGHT']:scene.collection.objects.link(obj)
        scene.camera=original.camera;scene.world=original.world
        bpy.data.libraries.write(str(archive),{scene},fake_user=True,compress=True)
        reportPath.write_text(json.dumps(report,indent=2),encoding='utf-8')
finally:
    window.scene=original
print(json.dumps({'sha256':digest,'passed':report['passed'],'checks':len(report['checks']),
    'failed':[row['check'] for row in report['checks'] if not row['passed']],
    'report':str(reportPath),'reimportBlend':str(archive)},indent=2))
if not report['passed']:raise RuntimeError('Active Type94 gray export movement failed')
