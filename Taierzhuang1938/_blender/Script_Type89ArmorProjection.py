"""Rebake game Armor after a projection-only fix; preserve every other map.

The complete PBR builder uses the same cage parameters. Run through the owned
Blender batch launcher after a full SurfaceV3 bake, with no concurrent edits.
"""
import bpy
import hashlib
import importlib
import json
import os
import shutil
import sys
from pathlib import Path
import numpy as np

assert bpy.app.background,'Use the owned controlled batch process'
here=Path(__file__).resolve().parent
revision=os.environ.get('TYPE89_REFINEMENT_REVISION','SurfaceV3GeometryV25')
os.environ['TYPE89_PBR_REVISION']=revision+'ArmorProjection'
os.environ['TYPE89_PBR_PROBE']='0'
sys.path.insert(0,str(here))
import Script_Type89PbrBake as bake
import Script_Type89PbrMaterials as pbr
importlib.reload(pbr)
source=bake.sourceDir
originalMaps=source/'Pbr'/revision
beforeInput={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [source/'Scene_Type89MediumTankHighGray.blend',source/'Scene_Type89MediumTankGameGray.blend',here/'Script_Type89PbrMaterials.py']}
history=source/'History'/(revision+'BeforeArmorProjection');history.mkdir(parents=True,exist_ok=True)
gameBlend=source/'Scene_Type89MediumTankGamePbr.blend'
runtime=bake.assetDir/'Model_Type89MediumTank.glb'
for file in [gameBlend,runtime]:
    dest=history/file.name
    if not dest.exists():shutil.copy2(file,dest)
bpy.ops.wm.open_mainfile(filepath=str(gameBlend))
gameRoot=bpy.data.objects['Model_Type89MediumTank'];highRoot=bpy.data.objects['High_Model_Type89MediumTank']
assert gameRoot['geometryVersion']==highRoot['geometryVersion']=='20261024GeometryV25'
gameMeshes=bake.UniqueMeshes(gameRoot);highMeshes=bake.UniqueMeshes(highRoot)

def Fingerprint(objects):
    digest=hashlib.sha256()
    for obj in sorted(objects,key=lambda o:o.name):
        digest.update(obj.name.encode());mesh=obj.data
        for collection,prop,width,dtype in [(mesh.vertices,'co',3,np.float32),(mesh.loops,'vertex_index',1,np.int32),(mesh.uv_layers.active.data,'uv',2,np.float32)]:
            array=np.empty(len(collection)*width,dtype=dtype);collection.foreach_get(prop,array);digest.update(array.tobytes())
    return digest.hexdigest()

before=Fingerprint(gameMeshes+highMeshes)
preserved={str(file):hashlib.sha256(file.read_bytes()).hexdigest() for file in originalMaps.glob('Texture_*.png')}
assert len(preserved)>=42,'The complete high/game bake must exist first'
for file in originalMaps.glob('Texture_Type89HighArmor*.png'):shutil.copy2(file,bake.mapDir/file.name)
oldArmor=bpy.data.materials['Material_Type89GameArmor']
for material in list(bpy.data.materials):
    if material.name.startswith('Material_Type89') and material.name.endswith('Authoring'):
        assert material.users<=1
        bpy.data.materials.remove(material)
graphs=pbr.BuildAuthoringMaterials()
highMaterials={obj:[slot.material for slot in obj.material_slots] for obj in highMeshes}
for obj in highMeshes:
    for slot in obj.material_slots:slot.material=graphs[bake.RoleOf(slot.material)].material
for obj in [gameRoot]+list(gameRoot.children_recursive)+[highRoot]+list(highRoot.children_recursive):bake.Visible(obj,False)
highProxy=bake.Proxy(highMeshes,'BakeProxy_High');gameProxy=bake.Proxy(gameMeshes,'BakeProxy_Game')
bake.Visible(gameProxy,False)
scratch=bake.Image('Type89RefinementScratch',32,'Non-Color',(0,0,0,1))
bpy.context.scene.render.engine='CYCLES';bpy.context.scene.cycles.samples=16
maps=bake.BakeAtlases('Game',gameProxy,highProxy,graphs,scratch,roleScope=['Armor'])
for graph in graphs.values():
    graph.Restore()
    node=graph.nodes.get('Type89BakeTarget')
    if node:graph.nodes.remove(node)
for proxy in [gameProxy,highProxy]:bpy.data.objects.remove(proxy,do_unlink=True)
for obj,materials in highMaterials.items():
    for slot,material in zip(obj.material_slots,materials):slot.material=material
oldArmor.name='Previous_Type89GameArmor'
newArmor=bake.BakedMaterial('Armor',maps['Armor'],'Game')
for obj in gameMeshes:
    for slot in obj.material_slots:
        if slot.material==oldArmor:slot.material=newArmor
if oldArmor.users==0:bpy.data.materials.remove(oldArmor)
bake.ClearBakeTargets(gameMeshes+highMeshes)
for obj in [highRoot]+list(highRoot.children_recursive):bake.Visible(obj,False)
for obj in [gameRoot]+list(gameRoot.children_recursive):bake.Visible(obj,True)
assert Fingerprint(gameMeshes+highMeshes)==before,'Projection refinement changed geometry or UVs'
assert all(hashlib.sha256(Path(file).read_bytes()).hexdigest()==digest for file,digest in preserved.items()),'A full-bake map changed'
assert all(hashlib.sha256(Path(file).read_bytes()).hexdigest()==digest for file,digest in beforeInput.items()),'Bake inputs changed during refinement'
output=bake.reviewDir/'Model_Type89MediumTankGamePbr.glb';bake.Export(gameRoot,output)
runtime.write_bytes(output.read_bytes());(source/'Exports'/output.name).write_bytes(output.read_bytes())
bpy.context.scene['Type89ArmorProjection']='3mm cage/12mm ray; every other map and both geometries preserved'
bpy.ops.wm.save_as_mainfile(filepath=str(gameBlend))
report={'pass':True,'geometryVersion':gameRoot['geometryVersion'],'geometryUvSha256BeforeAndAfter':before,'preservedFullBakeMapSha256':preserved,'unchangedInputs':beforeInput,'maps':maps,'cageExtrusionM':.003,'maxRayDistanceM':.012,'projectionRepairs':bake.reports,'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'fullBakeScriptSha256':hashlib.sha256((here/'Script_Type89PbrBake.py').read_bytes()).hexdigest()}
(bake.reviewDir/f'Data_{revision}ArmorProjection.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps({'pass':True,'geometryUvSha256':before,'maps':maps}))
