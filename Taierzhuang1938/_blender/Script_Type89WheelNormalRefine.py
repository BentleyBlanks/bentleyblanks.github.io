"""Rebake only armor normals after restoring physically planar wheel annuli."""
import bpy,hashlib,json,os,shutil,sys
from pathlib import Path
here=Path(__file__).resolve().parent;os.environ['TYPE89_PBR_REVISION']='SurfaceV5GeometryV32';sys.path.insert(0,str(here))
import Script_Type89PbrBake as bake
reportFile=bake.reviewDir/'Data_PbrSurfaceV5GeometryV32Build.json';report=json.loads(reportFile.read_text(encoding='utf8'))
backup=bake.sourceDir/'History/SurfaceV5BeforePlanarWheelNormals';backup.mkdir(parents=True,exist_ok=True)
for quality in ['Game','High']:
    for file in [bake.sourceDir/f'Scene_Type89MediumTank{quality}Pbr.blend',bake.mapDir/f'Texture_Type89{quality}ArmorNormal.png']:
        if not (backup/file.name).exists():shutil.copy2(file,backup/file.name)
bpy.ops.wm.open_mainfile(filepath=str(bake.sourceDir/'Scene_Type89MediumTankPbrSurfaceV5GeometryV32Work.blend'))
high=bpy.data.objects['BakeProxy_High'];game=bpy.data.objects['BakeProxy_Game']
roleRows={obj:[bake.RoleOf(material)for material in obj.data.materials]for obj in [high,game]}
for material in list(bpy.data.materials):
    if material.name.endswith('Authoring'):bpy.data.materials.remove(material,do_unlink=True)
graphs=bake.pbr.BuildAuthoringMaterials()
for obj,roles in roleRows.items():
    for slot,role in zip(obj.material_slots,roles):slot.material=graphs[role].material
for obj in bpy.context.scene.objects:bake.Visible(obj,False)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16
scratch=bake.Image('WheelNormalScratch',32,'Non-Color',(0,0,0,1))
for label,target in [('High',high),('Game',game)]:
    image=bake.Image('WheelNormal'+label,4096,'Non-Color',(.5,.5,1,0));bake.TargetNodes(list(target.data.materials),'Armor',image,scratch)
    for graph in graphs.values():graph.SetBakeChannel('Normal')
    bpy.ops.object.select_all(action='DESELECT');bake.Visible(target,True);target.select_set(True)
    source=bake.RoleProxy(high,'Armor') if label=='Game'else None
    if source is not None:bake.Visible(high,False);bake.Visible(source,True);source.select_set(True)
    bpy.context.view_layer.objects.active=target
    scene.render.bake.normal_space='TANGENT';scene.render.bake.target='IMAGE_TEXTURES'
    bpy.ops.object.bake(type='NORMAL',use_selected_to_active=source is not None,use_clear=False,margin=16,cage_extrusion=.003 if source else .022,max_ray_distance=.012 if source else .05)
    file=bake.mapDir/f'Texture_Type89{label}ArmorNormal.png';bake.SaveImage(image,file);bpy.data.images.remove(image)
    if label=='Game':
        image=bpy.data.images.load(str(file),check_existing=False);image.colorspace_settings.name='Non-Color'
        repair=bake.ProjectionRepair(high,game,'Armor').Repair(image,'Normal');bake.SaveImage(image,file);bpy.data.images.remove(image)
        bpy.data.objects.remove(source,do_unlink=True)
    bake.Visible(target,False);print(json.dumps({'normalBake':label,'size':4096}),flush=True)
bake.TransferDetailNormals(high,game,bake.UniqueMeshes(bpy.data.objects['Model_Type89MediumTank']),report['gameMaps'])
hardware=bake.TransferHardwarePbr(high,game,report['gameMaps'])
rows=[]
for quality in ['Game','High']:
    file=bake.sourceDir/f'Scene_Type89MediumTank{quality}Pbr.blend';bpy.ops.wm.open_mainfile(filepath=str(file))
    root=bpy.data.objects['Model_Type89MediumTank']
    for material in list(bpy.data.materials):
        if material.name.endswith('Authoring'):bpy.data.materials.remove(material,do_unlink=True)
    bake.pbr.BuildAuthoringMaterials()
    for role,files in report['gameMaps' if quality=='Game'else'highMaps'].items():
        if role!='Armor':continue
        material=bpy.data.materials['Material_Type89'+quality+role]
        for node in material.node_tree.nodes:
            if node.type=='TEX_IMAGE'and node.label in ['Base','Normal','Orm']:
                image=bpy.data.images.load(files[node.label],check_existing=False);image.colorspace_settings.name='sRGB'if node.label=='Base'else'Non-Color';image.pack();node.image=image
    bpy.ops.wm.save_as_mainfile(filepath=str(file))
    target=bake.reviewDir/f'Model_Type89MediumTank{quality}Pbr.glb';bake.Export(root,target)
    (bake.sourceDir/'Exports'/target.name).write_bytes(target.read_bytes())
    if quality=='Game':(bake.assetDir/'Model_Type89MediumTank.glb').write_bytes(target.read_bytes())
    rows.append({'quality':quality,'sourceSha256':hashlib.sha256(file.read_bytes()).hexdigest(),'unpackedExportSha256':hashlib.sha256(target.read_bytes()).hexdigest()})
report['normalRefinement']={'scope':'Only armor normals rebaked. Actual planar wheel annuli use true surface normals under the existing micro relief; all geometry,UVs and original material fields preserved.','currentMaterialScriptSha256':hashlib.sha256((here/'Script_Type89PbrMaterials.py').read_bytes()).hexdigest(),'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'hardwareFields':hardware,'sources':rows}
reportFile.write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print(json.dumps(report['normalRefinement']),flush=True)
