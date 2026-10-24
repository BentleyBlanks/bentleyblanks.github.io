"""Apply the normal-transfer step to an already baked, matching V30 source."""
import bpy,os,sys,json,hashlib,shutil
from pathlib import Path
here=Path(__file__).resolve().parent;os.environ['TYPE89_PBR_REVISION']='SurfaceV4GeometryV30';sys.path.insert(0,str(here))
import Script_Type89PbrBake as bake
reportFile=bake.reviewDir/'Data_PbrSurfaceV4GeometryV30Build.json';report=json.loads(reportFile.read_text(encoding='utf8'))
assert report['geometryVersion']=='20261024GeometryV30' and not report['probe']
normalFile=Path(report['gameMaps']['Armor']['Normal']);backup=bake.sourceDir/'History/SurfaceV4GeometryV30BeforeNearestNormal';backup.mkdir(exist_ok=True)
if not(backup/normalFile.name).exists():shutil.copy2(normalFile,backup/normalFile.name)
bpy.ops.wm.open_mainfile(filepath=str(bake.sourceDir/'Scene_Type89MediumTankPbrSurfaceV4GeometryV30Work.blend'))
gameRoot=bpy.data.objects['Model_Type89MediumTank'];assert gameRoot['geometryRecipeSha256']==report['geometryRecipeSha256']
transfer=bake.TransferDetailNormals(bpy.data.objects['BakeProxy_High'],bpy.data.objects['BakeProxy_Game'],bake.UniqueMeshes(gameRoot),report['gameMaps'])
sourceFile=bake.sourceDir/'Scene_Type89MediumTankGamePbr.blend';bpy.ops.wm.open_mainfile(filepath=str(sourceFile))
root=bpy.data.objects['Model_Type89MediumTank'];assert root['geometryRecipeSha256']==report['geometryRecipeSha256']
material=next(m for m in bpy.data.materials if m.name=='Material_Type89GameArmor')
texture=next(n for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.label=='Normal')
image=bpy.data.images.load(str(normalFile),check_existing=False);image.colorspace_settings.name='Non-Color';image.pack();texture.image=image
bpy.ops.wm.save_as_mainfile(filepath=str(sourceFile))
target=bake.reviewDir/'Model_Type89MediumTankGamePbr.glb';bake.Export(root,target)
(bake.assetDir/'Model_Type89MediumTank.glb').write_bytes(target.read_bytes());(bake.sourceDir/'Exports'/target.name).write_bytes(target.read_bytes())
report['detailNormalTransfer']={**transfer,'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'currentBuilderSha256':hashlib.sha256((here/'Script_Type89PbrBake.py').read_bytes()).hexdigest(),'gameSourceSha256':hashlib.sha256(sourceFile.read_bytes()).hexdigest(),'runtimeSha256':hashlib.sha256(target.read_bytes()).hexdigest()}
reportFile.write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print(json.dumps(report['detailNormalTransfer']))
