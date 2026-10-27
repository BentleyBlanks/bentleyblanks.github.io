"""Resume V33's frozen UV bake and transfer the true high-cover normal field.

Selected-to-active rays can hit the opposite surface around this thin lid.
Nearest retained-high sampling fixes that direction without changing geometry,
UVs, color or other material channels. Full rebuilds perform this in the baker.
"""
import bpy,hashlib,json,os,shutil,sys
from pathlib import Path

here=Path(__file__).resolve().parent
revision='SurfaceV6GeometryV33'
os.environ['TYPE89_PBR_REVISION']=revision
sys.path.insert(0,str(here))
import Script_Type89PbrBake as bake

Hash=lambda file:hashlib.sha256(Path(file).read_bytes()).hexdigest()
reportFile=bake.reviewDir/('Data_Pbr'+revision+'Build.json')
report=json.loads(reportFile.read_text(encoding='utf8'))
assert report['geometryVersion']=='20261025GeometryV33' and not report['probe']
assert Hash(here/'Script_Type89PbrMaterials.py')==report['materialAuthoringScriptSha256']
highHash=Hash(report['highGlb'])
backup=bake.sourceDir/'History/SurfaceV6BeforeBowCoverNormalTransfer'
backup.mkdir(parents=True,exist_ok=True)
for file in [Path(report['gameBlend']),bake.assetDir/'Model_Type89MediumTank.glb',Path(report['gameMaps']['Armor']['Normal']),reportFile]:
    if not (backup/file.name).exists():shutil.copy2(file,backup/file.name)

bpy.ops.wm.open_mainfile(filepath=str(bake.sourceDir/('Scene_Type89MediumTankPbr'+revision+'Work.blend')))
root=bpy.data.objects['Model_Type89MediumTank']
assert root['geometryRecipeSha256']==report['geometryRecipeSha256']
result=bake.TransferDetailNormals(bpy.data.objects['BakeProxy_High'],bpy.data.objects['BakeProxy_Game'],bake.UniqueMeshes(root),report['gameMaps'],partNames=('Mesh_BowRoundPortCover',))

bpy.ops.wm.open_mainfile(filepath=report['gameBlend'])
root=bpy.data.objects['Model_Type89MediumTank']
material=bpy.data.materials['Material_Type89GameArmor']
nodes=[node for node in material.node_tree.nodes if node.type=='TEX_IMAGE' and node.label=='Normal']
assert len(nodes)==1
oldImage=nodes[0].image
image=bpy.data.images.load(report['gameMaps']['Armor']['Normal'],check_existing=False)
image.colorspace_settings.name='Non-Color';image.pack();nodes[0].image=image
if oldImage.users==0:bpy.data.images.remove(oldImage)
bpy.ops.wm.save_as_mainfile(filepath=report['gameBlend'])
target=Path(report['gameGlb']);bake.Export(root,target)
for file in [bake.assetDir/'Model_Type89MediumTank.glb',bake.sourceDir/'Exports'/target.name]:file.write_bytes(target.read_bytes())
assert Hash(report['highGlb'])==highHash,'The retained high export must be unchanged'
report['bowCoverNormalRefinement']={'method':'Nearest actual frozen-high cover normals replace opposite-side selected-to-active hits; same original UVs and geometry, unchanged35mm nearest-high limit','originalBakerSha256':report['bakeScriptSha256'],'currentBakerSha256':Hash(here/'Script_Type89PbrBake.py'),'scriptSha256':Hash(__file__),'gameSourceSha256':Hash(report['gameBlend']),'unpackedRuntimeSha256':Hash(target),'unchangedHighSha256':highHash,'repair':result}
reportFile.write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps(report['bowCoverNormalRefinement']),flush=True)
