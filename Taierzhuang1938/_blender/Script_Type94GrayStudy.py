"""Build the active Type 94 gray study without replacing the PBR candidate.

Run with Script_BlenderMcp.mjs exec or start --batch. Source/exports stay in the
external asset directory. This stage does not bake PBR or create a game LOD.
"""
import bpy
import os
import json
import hashlib
import importlib.util
from pathlib import Path

repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2] if '__file__' in globals() else Path.cwd())))
source=Path(os.environ.get('TYPE94_SOURCE_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette'))
if not bpy.data.filepath:bpy.context.scene['BlenderMcpTask']='Type94Tankette'
assert bpy.context.scene.get('BlenderMcpTask')=='Type94Tankette'
assert not bpy.data.filepath or source.resolve() in Path(bpy.data.filepath).resolve().parents
os.environ['TYPE94_REPO_ROOT']=str(repo)
os.environ['TYPE94_SOURCE_ROOT']=str(source)
os.environ['TYPE94_QUALITY']='High'


def BuildStudy():
    script=repo/'Taierzhuang1938/_blender/Script_Type94TanketteBuild.py'
    build={'__name__':'__main__','__file__':str(script)}
    exec(compile(script.read_text(encoding='utf-8'),str(script),'exec'),build)
    correction=repo/'Taierzhuang1938/_blender/Script_Type94MechanismCorrect.py'
    spec=importlib.util.spec_from_file_location('Type94GrayMechanism',correction)
    mechanism=importlib.util.module_from_spec(spec);spec.loader.exec_module(mechanism)
    path=mechanism.CorrectMechanism()
    revision=build['REVISION'];scene=bpy.context.scene
    gray=bpy.data.materials.new('Material_Type94GrayStudy'+revision)
    gray.use_nodes=True
    shader=gray.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(.20,.20,.20,1)
    shader.inputs['Roughness'].default_value=.65
    scene.view_layers[0].material_override=gray
    scene['AssetRevision']=revision+' gray geometry study; no PBR or game-budget acceptance'
    destination=source/('Scene_Type94TanketteHigh'+revision+'.blend')
    bpy.ops.wm.save_as_mainfile(filepath=str(destination))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in scene.objects:
        if obj.type not in ['CAMERA','LIGHT']:obj.select_set(True)
    exportPath=repo/'Taierzhuang1938/_blender/Script_Type94Export.py'
    spec=importlib.util.spec_from_file_location('Type94GrayExport',exportPath)
    exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)
    export=source/'Exports'/('Model_Type94TanketteHigh'+revision+'.glb')
    exporter.ExportGltf(export)
    report={'asset':'Type94Tankette','revision':revision,'stage':'gray geometry only',
            'blend':str(destination),'glb':str(export),
            'sha256':hashlib.sha256(export.read_bytes()).hexdigest(),
            'canonicalPbrReplaced':False,'pbrAccepted':False}
    pathManifest=source/'Acceptance'/('Data_Mechanism'+revision+'.json')
    pathManifest.write_text(json.dumps({'path':path,'sha256':report['sha256'],
        'scope':revision+' gray geometry path; not another generation\'s game path'},indent=2),encoding='utf-8')
    report['pathManifest']=str(pathManifest)
    (source/'Acceptance'/('Data_'+revision+'GrayBuild.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2))


if globals().get('__name__') in (None,'__main__'):
    if bpy.context.window_manager.windows:
        window=bpy.context.window_manager.windows[0]
        area=next((a for a in window.screen.areas if a.type=='VIEW_3D'),window.screen.areas[0])
        with bpy.context.temp_override(window=window,area=area):BuildStudy()
    else:BuildStudy()
