"""Repair opaque Cycles ray misses from the frozen high bake, without rebaking it.

The ordinary full baker applies the same hit-mask repair while each game atlas
is built. This entry resumes an already completed bake from its saved UV proxy
project. It preserves the original bake input fingerprints and records this
subsequent processing step separately.
"""
import bpy,hashlib,json,os,shutil,sys
from pathlib import Path
import numpy as np
here=Path(__file__).resolve().parent
arguments=sys.argv[sys.argv.index('--')+1:] if '--'in sys.argv else []
revision=arguments[0] if arguments else 'SurfaceV5GeometryV32'
assert revision=='SurfaceV5GeometryV32','This repair is scoped to the rejected V32 projection'
os.environ['TYPE89_PBR_REVISION']=revision;sys.path.insert(0,str(here))
import Script_Type89PbrBake as bake
reportFile=bake.reviewDir/('Data_Pbr'+revision+'Build.json')
report=json.loads(reportFile.read_text(encoding='utf8'))
assert not report['probe'] and report['geometryVersion']=='20261024GeometryV32'
assert hashlib.sha256((here/'Script_Type89PbrMaterials.py').read_bytes()).hexdigest()==report['materialAuthoringScriptSha256']
backup=bake.sourceDir/'History'/(revision+'BeforeHitMaskRepair');backup.mkdir(parents=True,exist_ok=True)
for file in [Path(report['gameBlend']),bake.assetDir/'Model_Type89MediumTank.glb',reportFile]:
    target=backup/file.name
    if not target.exists():shutil.copy2(file,target)
for file in bake.mapDir.glob('Texture_Type89Game*.png'):
    if not (backup/file.name).exists():shutil.copy2(file,backup/file.name)
bpy.ops.wm.open_mainfile(filepath=str(bake.sourceDir/('Scene_Type89MediumTankPbr'+revision+'Work.blend')))
high=bpy.data.objects['BakeProxy_High'];game=bpy.data.objects['BakeProxy_Game']
assert bpy.data.objects['Model_Type89MediumTank']['geometryRecipeSha256']==report['geometryRecipeSha256']
refinements={}
for role,files in report['gameMaps'].items():
    # This completed atlas already has its deliberate perforation alpha.
    # The full baker repairs before applying that mask; preserve the final
    # Guard maps here instead of misclassifying real holes as failed rays.
    if role=='Guard':continue
    repair=bake.ProjectionRepair(high,game,role);changes={}
    for channel in ['Base','Normal','Roughness','Metallic','Ao']:
        file=bake.mapDir/('Texture_Type89Game'+role+channel+'.png')
        image=bpy.data.images.load(str(file),check_existing=False);image.colorspace_settings.name='Non-Color'
        changes[channel]=repair.Repair(image,channel)
        bake.SaveImage(image,file);bpy.data.images.remove(image)
        print(json.dumps({'role':role,'channel':channel,**changes[channel]}),flush=True)
    raw={channel:bake.ReadRawImage(bake.mapDir/('Texture_Type89Game'+role+channel+'.png'))[:,:,0]for channel in ['Ao','Roughness','Metallic']}
    size=raw['Ao'].shape[0];pixels=np.ones((size,size,4),dtype=np.float32)
    for index,channel in enumerate(['Ao','Roughness','Metallic']):pixels[:,:,index]=raw[channel]
    image=bake.Image('Repaired'+role+'Orm',size,'Non-Color',(1,.7,0,1))
    image.pixels.foreach_set(pixels.reshape(-1));image.update();bake.SaveImage(image,Path(files['Orm']));bpy.data.images.remove(image)
    refinements[role]=changes
hardware=bake.TransferHardwarePbr(high,game,report['gameMaps'])
bpy.ops.wm.open_mainfile(filepath=report['gameBlend'])
root=bpy.data.objects['Model_Type89MediumTank'];assert root['geometryRecipeSha256']==report['geometryRecipeSha256']
for role,files in report['gameMaps'].items():
    material=bpy.data.materials['Material_Type89Game'+role]
    for node in material.node_tree.nodes:
        if node.type!='TEX_IMAGE' or node.label not in ['Base','Normal','Orm']:continue
        image=bpy.data.images.load(files[node.label],check_existing=False)
        image.colorspace_settings.name='sRGB' if node.label=='Base' else 'Non-Color';image.pack();node.image=image
bpy.ops.wm.save_as_mainfile(filepath=report['gameBlend'])
target=Path(report['gameGlb']);bake.Export(root,target)
for file in [bake.assetDir/'Model_Type89MediumTank.glb',bake.sourceDir/'Exports'/target.name]:file.write_bytes(target.read_bytes())
highBasis=bake.RepairExportTangents(Path(report['highGlb']))
(bake.sourceDir/'Exports'/Path(report['highGlb']).name).write_bytes(Path(report['highGlb']).read_bytes())
report['projectionRefinement']={'method':'Independent projected hit coverage plus opaque-black albedo/invalid-normal detection; missing texels sampled from actual frozen high triangles and converted to the low tangent frame. No invented colour, unchanged35mm nearest-source limit.','scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'currentBakerSha256':hashlib.sha256((here/'Script_Type89PbrBake.py').read_bytes()).hexdigest(),'originalBakerSha256':report['bakeScriptSha256'],'gameSourceSha256':hashlib.sha256(Path(report['gameBlend']).read_bytes()).hexdigest(),'unpackedRuntimeSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'repairs':refinements,'hardwareFields':hardware,'highTangentCorrection':highBasis}
reportFile.write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps(report['projectionRefinement']),flush=True)
