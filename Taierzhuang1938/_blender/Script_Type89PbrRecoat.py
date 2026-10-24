"""Rebake Base only after a pigment adjustment, preserving validated UV/Normal/ORM.

Run with the controlled Blender batch launcher after the SurfaceV2 full bake.
This is an optional iteration shortcut; the complete bake uses the same shader.
"""
import bpy
import hashlib
import importlib
import json
import os
from pathlib import Path
import sys
import numpy as np

assert bpy.app.background,'Use the owned controlled batch process'
here=Path(__file__).resolve().parent
os.environ['TYPE89_PBR_REVISION']='SurfaceV2'
os.environ['TYPE89_PBR_PROBE']='0'
sys.path.insert(0,str(here))
import Script_Type89PbrBake as bake
import Script_Type89PbrMaterials as pbr
importlib.reload(pbr)
assert pbr.roles==['Armor','Steel','Track','Rubber','Exhaust','Glass'],'Legacy SurfaceV2 shortcut supports six sets only; use a full bake for SurfaceV3/Guard'
source=bake.sourceDir
bpy.ops.wm.open_mainfile(filepath=str(source/'Scene_Type89MediumTankGamePbr.blend'))
assert bpy.context.scene['Type89Stage']=='Pbr'
gameRoot=bpy.data.objects['Model_Type89MediumTank']
highRoot=bpy.data.objects['High_Model_Type89MediumTank']
highObjects={obj.name.removeprefix('High_'):obj for obj in [highRoot]+list(highRoot.children_recursive)}
gameMeshes=bake.UniqueMeshes(gameRoot);highMeshes=bake.UniqueMeshes(highRoot)

def Fingerprint(objects):
    digest=hashlib.sha256()
    for obj in sorted(objects,key=lambda obj:obj.name):
        digest.update(obj.name.encode())
        mesh=obj.data
        for collection,property,width,dtype in [(mesh.vertices,'co',3,np.float32),(mesh.loops,'vertex_index',1,np.int32),(mesh.uv_layers.active.data,'uv',2,np.float32)]:
            array=np.empty(len(collection)*width,dtype=dtype);collection.foreach_get(property,array);digest.update(array.tobytes())
    return digest.hexdigest()

before=Fingerprint(gameMeshes+highMeshes)
preserved={file.name:hashlib.sha256(file.read_bytes()).hexdigest() for file in bake.mapDir.glob('Texture_*.png') if file.stem.endswith(('Normal','Orm'))}
assert len(preserved)==24,'Full high/game Normal/ORM maps must exist first'
for material in list(bpy.data.materials):
    if material.name.startswith('Material_Type89') and 'Authoring' in material.name:
        assert material.users<=1,'Do not remove an actively assigned authoring material'
        bpy.data.materials.remove(material)
graphs=pbr.BuildAuthoringMaterials()
for obj in highMeshes:
    for slot in obj.material_slots:slot.material=graphs[bake.RoleOf(slot.material)].material
for obj in [gameRoot]+list(gameRoot.children_recursive)+list(highObjects.values()):bake.Visible(obj,False)
highProxy=bake.Proxy(highMeshes,'BakeProxy_High');gameProxy=bake.Proxy(gameMeshes,'BakeProxy_Game')
bake.Visible(gameProxy,False)
scratch=bake.Image('Type89RecoatScratch',32,'Non-Color',(0,0,0,1))
bpy.context.scene.render.engine='CYCLES';bpy.context.scene.cycles.samples=16
allMaps={}
for quality,target,origin in [('High',highProxy,None),('Game',gameProxy,highProxy)]:
    files=json.loads((bake.mapDir/f'Data_{quality}AtlasFiles.json').read_text())
    targetMaterials=list({mat for mat in target.data.materials if mat})
    for role in bake.roles:
        if not any(bake.RoleOf(mat)==role for mat in targetMaterials):continue
        roleSource=bake.RoleProxy(origin,role) if origin else None
        repair=bake.ProjectionRepair(origin,target,role) if origin else None
        size=bake.sizes[role][0]
        image=bake.Image('Recoat_'+quality+role,size,'sRGB',(0,0,0,0))
        bake.TargetNodes(targetMaterials,role,image,scratch)
        for graph in graphs.values():graph.SetBakeChannel('Base')
        bpy.ops.object.select_all(action='DESELECT');bake.Visible(target,True);target.select_set(True)
        if origin:bake.Visible(origin,False);bake.Visible(roleSource,True);roleSource.select_set(True)
        bpy.context.view_layer.objects.active=target
        bpy.context.scene.render.bake.target='IMAGE_TEXTURES'
        bake.Progress('recoatBase',quality=quality,material=role,size=size)
        bpy.ops.object.bake(type='EMIT',use_selected_to_active=bool(origin),use_clear=False,margin=16,cage_extrusion=.022,max_ray_distance=.050)
        file=Path(files[role]['Base']);bake.SaveImage(image,file);bpy.data.images.remove(image)
        if repair:
            repaired=bpy.data.images.load(str(file),check_existing=False);repaired.colorspace_settings.name='Non-Color'
            repair.Repair(repaired,'Base');bake.SaveImage(repaired,file);bpy.data.images.remove(repaired)
        if roleSource:bpy.data.objects.remove(roleSource,do_unlink=True)
    allMaps[quality]=files;bake.Visible(target,False)
for graph in graphs.values():graph.Restore()
for proxy in [gameProxy,highProxy]:bpy.data.objects.remove(proxy,do_unlink=True)
assert Fingerprint(gameMeshes+highMeshes)==before,'Recoat changed geometry or UVs'
assert all(hashlib.sha256((bake.mapDir/name).read_bytes()).hexdigest()==digest for name,digest in preserved.items()),'Recoat changed a Normal/ORM map'
for material in bpy.data.materials:
    if material.name.startswith(('Material_Type89Game','Material_Type89High')):material.name='Previous_'+material.name
for quality,root in [('High',highRoot),('Game',gameRoot)]:
    materials={role:bake.BakedMaterial(role,allMaps[quality].get(role),quality) for role in bake.roles+['Shadow']}
    bake.Assign(root,materials);root['surfaceRevision']='SurfaceV2';root['acceptance']='PBR_PENDING_VISUAL_REVIEW'
for obj in highObjects.values():bake.Visible(obj,False)
for obj in [gameRoot]+list(gameRoot.children_recursive):bake.Visible(obj,True)
bpy.data.orphans_purge(do_recursive=True)
gameGlb=bake.reviewDir/'Model_Type89MediumTankGamePbr.glb';bake.Export(gameRoot,gameGlb)
(bake.assetDir/'Model_Type89MediumTank.glb').write_bytes(gameGlb.read_bytes())
(source/'Exports'/gameGlb.name).write_bytes(gameGlb.read_bytes())
bpy.ops.wm.save_as_mainfile(filepath=str(source/'Scene_Type89MediumTankGamePbr.blend'))
for obj in [gameRoot]+list(gameRoot.children_recursive):bpy.data.objects.remove(obj,do_unlink=True)
for name,obj in highObjects.items():obj.name=name;bake.Visible(obj,True)
bpy.context.scene['Type89Quality']='High';bpy.data.orphans_purge(do_recursive=True)
highGlb=bake.reviewDir/'Model_Type89MediumTankHighPbr.glb';bake.Export(highRoot,highGlb)
(source/'Exports'/highGlb.name).write_bytes(highGlb.read_bytes())
bpy.ops.wm.save_as_mainfile(filepath=str(source/'Scene_Type89MediumTankHighPbr.blend'))
report={'stage':'BaseRecoat','materialScriptSha256':hashlib.sha256((here/'Script_Type89PbrMaterials.py').read_bytes()).hexdigest(),'geometryAndUvSha256BeforeAndAfter':before,'preservedNormalOrmSha256':preserved,'baseFiles':{quality:{role:values['Base'] for role,values in files.items()} for quality,files in allMaps.items()},'pass':True}
(bake.reviewDir/'Data_PbrSurfaceV2RecoatBuild.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
