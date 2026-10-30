"""Bake fresh packed PBR on the preserved V64 editable geometry.

This is an isolated high-surface preview. Whole reference acceptance and the
final low derivative remain separate requirements; V56 files are never changed.
"""
import bpy,hashlib,importlib.util,json,os
from pathlib import Path
repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2])))
base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'SurfaceV66';revision='SurfaceV66Preview'
phase=os.environ.get('TYPE94_PREVIEW_PHASE','Build');assert phase in ['Build','Coating','RepairPaint','Apply']
for name in ['Acceptance','Exports']:(root/name).mkdir(parents=True,exist_ok=True)
os.environ.update(TYPE94_REPO_ROOT=str(repo),TYPE94_SOURCE_ROOT=str(root),TYPE94_SURFACE_REVISION=revision,TYPE94_PBR_VARIANT=revision,TYPE94_SURFACE_STYLE='SurfaceV44',TYPE94_UV_MODE='Fresh',TYPE94_BODY_LAYOUT='Data_BodyTrialV64.json')
for name in ['TYPE94_TRACK_SHOE_LAYOUT','TYPE94_RUNNING_GEAR_LAYOUT','TYPE94_TURRET_LAYOUT']:os.environ.pop(name,None)
def Run(name):
    file=repo/'Taierzhuang1938/_blender'/name
    exec(compile(file.read_text(encoding='utf-8'),str(file),'exec'),{'__name__':'__main__','__file__':str(file)})
def Module(name):
    file=repo/'Taierzhuang1938/_blender'/name;spec=importlib.util.spec_from_file_location('V66'+file.stem,file);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
destination=root/('Scene_Type94TanketteHigh'+revision+'.blend');assert not bpy.data.filepath
if phase=='Build':
    manifest=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GrayTrialV64.json').read_text());source=Path(manifest['sourceBlend']);glb=Path(manifest['sourceGlb'])
    assert hashlib.sha256(source.read_bytes()).hexdigest()==manifest['sourceBlendSha256']
    assert hashlib.sha256(glb.read_bytes()).hexdigest()==manifest['sha256']
    bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette'
    scene.view_layers[0].material_override=None;scene.render.threads_mode='FIXED';scene.render.threads=4
    scene['SurfaceGeometryRevision']=manifest['revision'];scene['SurfaceGeometryGlbSha256']=manifest['sha256'];scene['SurfaceStudyRevision']=revision;scene['SurfaceHistoricalPlacementAccepted']=False
    aliases=Module('Script_Type94MaterialBindings.py').CanonicalizeMaterialSlots(scene)
    attributes=Module('Script_Type94SurfaceAttributes.py').PrepareSurfaceAttributes(scene)
    bpy.ops.wm.save_as_mainfile(filepath=str(destination))
    report=dict(sourceBlend=str(source),sourceBlendSha256=manifest['sourceBlendSha256'],sourceGlbSha256=manifest['sha256'],sourceGeometryRevision=manifest['revision'],uvMode='Fresh',uvCheckpointUsed=False,attributes=attributes,normalizedAliases=aliases,previewOnly=True,wholeReferenceAccepted=False)
    (root/'Acceptance/Data_MaterialPreviewPreparationV66.json').write_text(json.dumps(report,indent=2)+'\n')
    Run('Script_Type94TankettePbr.py');Run('Script_Type94SurfaceWearExtract.py')
elif phase=='RepairPaint':
    bpy.ops.wm.open_mainfile(filepath=str(destination));scene=bpy.context.scene
    aliases=Module('Script_Type94MaterialBindings.py').CanonicalizeMaterialSlots(scene);assert aliases
    material=bpy.data.materials['Material_Type94Paint'];material.node_tree.nodes.clear()
    for image in list(bpy.data.images):
        if image.users==0:bpy.data.images.remove(image)
    scene['SurfaceEdgeWearApplied']=False
    file=repo/'Taierzhuang1938/_blender/Script_Type94TankettePbr.py';text=file.read_text(encoding='utf-8');scope={'__name__':'V66PaintRepair','__file__':str(file)}
    exec(compile(text[:text.index("\nfor role,size in [('Paint',4096)")],str(file),'exec'),scope);scope['BakeRole']('Paint',4096)
    bakeFile=root/'Textures/HighSurfaceV66Preview/Data_PbrBake.json';bake=json.loads(bakeFile.read_text());bake['textures']=[r for r in bake['textures']if r['role']!='Paint']+scope['records'];bake['normalizedAliases']=aliases;bakeFile.write_text(json.dumps(bake,indent=2)+'\n')
    preparation=root/'Acceptance/Data_MaterialPreviewPreparationV66.json';report=json.loads(preparation.read_text());report['normalizedAliases']=aliases;report['paintRoleRebakedAfterAliasCorrection']=True;preparation.write_text(json.dumps(report,indent=2)+'\n')
    bpy.ops.wm.save_as_mainfile(filepath=str(destination));Run('Script_Type94SurfaceWearExtract.py')
elif phase=='Coating':
    bpy.ops.wm.open_mainfile(filepath=str(destination));assert bpy.context.scene.get('SurfaceUvGenerationMode')=='Fresh'
    os.environ['TYPE94_TYRE_FINISH_PHASE']='Extract';Run('Script_Type94TyreFaceFinish.py')
else:
    bpy.ops.wm.open_mainfile(filepath=str(destination));assert bpy.context.scene.get('SurfaceUvGenerationMode')=='Fresh'
    assert bpy.context.scene.get('SurfaceGeometryGlbSha256')=='d46ca757f4210827c0ea957e978db466138282913251a9ce9acab8f26b77137a'
    Run('Script_Type94SurfaceWearApply.py')
    os.environ['TYPE94_TYRE_FINISH_PHASE']='Apply';Run('Script_Type94TyreFaceFinish.py')
print('TYPE94_V66_MATERIAL_PREVIEW_'+phase.upper()+'_COMPLETE',flush=True)
