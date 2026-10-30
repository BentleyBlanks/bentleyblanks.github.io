"""Integrate V89 shape with preserved V77 PBR and a bounded new-paint patch.

Only changed hull heads, the new ear and the revised cowl are newly unwrapped
and baked. Retained polygon UVs and all old sampled texture regions stay intact.
"""
import ast,bpy,hashlib,importlib.util,json,math,os,shutil,numpy as np
from pathlib import Path
from mathutils import Vector

repo=Path(__file__).resolve().parents[2]
base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')
root=Path(os.environ.get('TYPE94_PATCH_ROOT',str(base/'SurfaceV91')))
folder=root/'Textures/HighSurfaceV91Preview'
for path in [root,folder,root/'Acceptance',root/'Exports',root/'Rebuild']:
    path.mkdir(parents=True,exist_ok=True)
phase=os.environ.get('TYPE94_PATCH_PHASE','Prepare')
assert phase in ['Prepare','Bake','Finalize','Ao','Verify'] and not bpy.data.filepath
destination=root/'Scene_Type94TanketteHighSurfaceV91Preview.blend'
patch=[608,512,1280,448]


def Hash(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def Export(file):
    bpy.ops.object.select_all(action='DESELECT')
    asset=bpy.data.objects['Type94Tankette']
    for obj in [asset,*asset.children_recursive]:obj.select_set(True)
    path=repo/'Taierzhuang1938/_blender/Script_Type94Export.py'
    spec=importlib.util.spec_from_file_location('Patch91Export',path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    module.ExportGltf(file)


def Key(mesh,face):
    values=[tuple(mesh.vertices[i].co)for i in face.vertices]
    return min(tuple(values[i:]+values[:i])for i in range(len(values)))


def FaceUv(source,oldFace,target,newFace):
    a=[tuple(source.vertices[i].co)for i in oldFace.vertices]
    b=[tuple(target.vertices[i].co)for i in newFace.vertices]
    offset=next(i for i in range(len(a))if a[i:]+a[:i]==b)
    loops=list(oldFace.loop_indices)
    for loop,index in zip(newFace.loop_indices,loops[offset:]+loops[:offset]):
        target.uv_layers.active.data[loop].uv=source.uv_layers.active.data[index].uv


if phase=='Prepare':
    material=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV77.json').read_text())
    geometry=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GrayTrialV89.json').read_text())
    assert Hash(material['sourceBlend'])==material['sourceBlendSha256']
    assert Hash(geometry['sourceBlend'])==geometry['sourceBlendSha256']
    bpy.ops.wm.open_mainfile(filepath=material['sourceBlend'])
    scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette'
    asset=bpy.data.objects['Type94Tankette'];paint=bpy.data.materials['Material_Type94Paint']
    hull=bpy.data.objects['Geometry_Hull_Paint'];nose=bpy.data.objects['Geometry_NoseHousing_Paint']
    oldHull=hull.data
    sourceImages={}
    for role in ['Paint','Track','Steel','Rubber']:
        tree=bpy.data.materials['Material_Type94'+role].node_tree
        for channel in ['Base','Orm','Normal']:
            image=tree.nodes['Baked '+channel].image
            file=folder/('Texture_Type94'+role+channel+'Input.png')
            if image.packed_file:file.write_bytes(image.packed_file.data)
            else:shutil.copy2(bpy.path.abspath(image.filepath),file)
            sourceImages[role+channel]=dict(file=str(file),sha256=Hash(file))
    beforeObjects=set(bpy.data.objects)
    with bpy.data.libraries.load(geometry['sourceBlend'],link=False)as(available,loaded):
        loaded.objects=['Geometry_Hull_Paint','Geometry_NoseHousing_Paint','Geometry_FrontCornerEarRight_Paint']
    imported=set(bpy.data.objects)-beforeObjects
    sourceHull,sourceNose,sourceEar=loaded.objects
    # Copy shape-specific descriptive properties without changing rigid poses.
    for sourceOwner,targetOwner in [(sourceHull.parent,bpy.data.objects['Hull']),(sourceNose.parent,bpy.data.objects['NoseHousing'])]:
        for key in sourceOwner.keys():
            value=sourceOwner[key];targetOwner[key]=value.to_list()if hasattr(value,'to_list')else value
    newHull=sourceHull.data.copy();newNose=sourceNose.data.copy()
    lookup={}
    for face in oldHull.polygons:lookup.setdefault(Key(oldHull,face),[]).append(face.index)
    changedHull=[];matched=[]
    for face in newHull.polygons:
        choices=lookup.get(Key(newHull,face),[])
        if choices:
            index=choices.pop();FaceUv(oldHull,oldHull.polygons[index],newHull,face);matched.append((face.index,index))
        else:changedHull.append(face.index)
    assert len(changedHull)==168,'Expected exactly12new fourteen-face front heads'
    # Transfer editable face attributes wherever geometry is retained.
    for attribute in oldHull.attributes:
        if attribute.domain!='FACE'or attribute.data_type!='FLOAT':continue
        target=newHull.attributes.get(attribute.name)or newHull.attributes.new(attribute.name,'FLOAT','FACE')
        for a,b in matched:target.data[a].value=attribute.data[b].value
        for index in changedHull:target.data[index].value=.85 if attribute.name=='WearZone'else 0
    hull.data=newHull;nose.data=newNose
    ear=sourceEar.copy();ear.data=sourceEar.data.copy();ear.name='Geometry_FrontCornerEarRight_Paint'
    ear.parent=bpy.data.objects['FinalDriveHousingRight'];scene.collection.objects.link(ear)
    for obj in [hull,nose,ear]:
        obj.data.materials.clear();obj.data.materials.append(paint)
        for face in obj.data.polygons:face.material_index=0
    for obj in imported:bpy.data.objects.remove(obj,do_unlink=True)
    # The imported source temporarily owns this name until it is deleted.
    ear.name='Geometry_FrontCornerEarRight_Paint'
    bpy.context.view_layer.update()
    targets=[(hull,changedHull),(nose,[p.index for p in nose.data.polygons]),(ear,[p.index for p in ear.data.polygons])]
    vertices,faces,normals,faceMap=[],[],[],[]
    for obj,indices in targets:
        used=sorted({i for f in indices for i in obj.data.polygons[f].vertices});mapping={i:len(vertices)+j for j,i in enumerate(used)}
        vertices.extend(tuple(obj.matrix_world@obj.data.vertices[i].co)for i in used)
        normalMatrix=obj.matrix_world.to_3x3().inverted().transposed()
        for index in indices:
            face=obj.data.polygons[index];faces.append([mapping[i]for i in face.vertices]);faceMap.append(dict(owner=obj.name,face=index))
            normals.extend(tuple((normalMatrix@obj.data.corner_normals[i].vector).normalized())for i in face.loop_indices)
    mesh=bpy.data.meshes.new('Mesh_Type94PatchBakeV91');mesh.from_pydata(vertices,[],faces);mesh.update();mesh.uv_layers.new(name='UVMap');mesh.normals_split_custom_set(normals)
    for name,value in [('WearZone',.65),('SurfaceCast',0.),('TrackContact',0.)]:
        attribute=mesh.attributes.new(name,'FLOAT','FACE')
        for item in attribute.data:item.value=value
    detail=bpy.data.objects.new('Temporary_Type94PatchBakeV91',mesh);scene.collection.objects.link(detail)
    author=bpy.data.materials.new('Material_Type94PatchAuthorV91');author.use_nodes=True;author.use_fake_user=True;mesh.materials.append(author)
    bpy.ops.object.select_all(action='DESELECT');detail.select_set(True);bpy.context.view_layer.objects.active=detail
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(65),island_margin=.004,scale_to_bounds=True,correct_aspect=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    w,h=patch[2:];pad=8
    for loop in mesh.uv_layers.active.data:
        loop.uv=(pad/w+(1-2*pad/w)*loop.uv.x,pad/h+(1-2*pad/h)*loop.uv.y)
    for face,record in zip(mesh.polygons,faceMap):
        target=bpy.data.objects[record['owner']].data
        sourceLoops=list(face.loop_indices);targetLoops=list(target.polygons[record['face']].loop_indices)
        assert len(sourceLoops)==len(targetLoops)
        for a,b in zip(sourceLoops,targetLoops):
            u,v=mesh.uv_layers.active.data[a].uv
            target.uv_layers.active.data[b].uv=((patch[0]+w*u)/4096,1-(patch[1]+h*(1-v))/4096)
    # Cross-object AO retains the hull beneath heads without coincident bake
    # surfaces. The actual production hull/nose/ear are hidden during baking.
    keep=[p.index for p in hull.data.polygons if p.index not in set(changedHull)]
    pv=[];pf=[]
    used=sorted({i for f in keep for i in hull.data.polygons[f].vertices});mapping={i:j for j,i in enumerate(used)}
    pv=[tuple(hull.matrix_world@hull.data.vertices[i].co)for i in used]
    pf=[[mapping[i]for i in hull.data.polygons[f].vertices]for f in keep]
    proxyMesh=bpy.data.meshes.new('Mesh_Type94PatchAoProxyV91');proxyMesh.from_pydata(pv,[],pf);proxyMesh.update()
    proxy=bpy.data.objects.new('Temporary_Type94PatchAoProxyV91',proxyMesh);scene.collection.objects.link(proxy)
    for obj in [hull,nose,ear]:obj.hide_render=True
    scene['SurfaceStudyRevision']='SurfaceV91Preview';scene['SurfaceGeometryRevision']='ShapeV89CorrectedRearJunctionTrial'
    scene['SurfaceGeometryGlbSha256']=geometry['sha256'];scene['WholeReferenceAccepted']=False
    scene['SurfaceUvGenerationMode']='V77RetainedWithNewDetailPatch';scene['SurfaceHistoricalPlacementAccepted']=False
    report=dict(materialReference=material,geometryReference=geometry,inputs=sourceImages,patchPixels=patch,changedHullFaces=changedHull,retainedHullFaceUvMap=matched,bakeFaceMap=faceMap,temporaryObjects=[detail.name,proxy.name],productionTemporarilyHidden=[hull.name,nose.name,ear.name],wearPlacementInferred=True)
    (root/'Acceptance/Data_PbrPatchPrepareV91.json').write_text(json.dumps(report,indent=2)+'\n')
    bpy.ops.wm.save_as_mainfile(filepath=str(destination))
elif phase=='Bake':
    bpy.ops.wm.open_mainfile(filepath=str(destination));scene=bpy.context.scene
    obj=bpy.data.objects['Temporary_Type94PatchBakeV91'];material=bpy.data.materials['Material_Type94PatchAuthorV91']
    path=repo/'Taierzhuang1938/_blender/Script_Type94TankettePbr.py';syntax=ast.parse(path.read_text())
    names={'Node','Math','Ramp','Mix','Noise','Author'}
    scope=dict(bpy=bpy,math=math,importlib=importlib,REPO=repo,SURFACE_STYLE='SurfaceV44')
    exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(path),'exec'),scope)
    tree,shader,output,baseColor,orm=scope['Author'](material,'Paint')
    mix=tree.nodes.new('ShaderNodeMixRGB');mix.name='Matching retained olive pigment compression';mix.inputs[0].default_value=.38;mix.inputs[2].default_value=(.092,.102,.067,1)
    tree.links.new(baseColor,mix.inputs[1]);baseColor=mix.outputs[0];tree.links.new(baseColor,shader.inputs['Base Color'])
    for node in tree.nodes:
        if node.type=='AMBIENT_OCCLUSION' and hasattr(node,'only_local'):node.only_local=False
        if node.type=='BUMP':node.inputs['Strength'].default_value*=.55
    emission=tree.nodes.new('ShaderNodeEmission');records={}
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    scene.render.engine='CYCLES';scene.cycles.samples=8;scene.render.threads_mode='FIXED';scene.render.threads=4
    scene.render.bake.use_selected_to_active=False
    for channel,socket in [('Base',baseColor),('Orm',orm),('Normal',None)]:
        image=bpy.data.images.new('Texture_Type94Patch'+channel+'V91',width=patch[2],height=patch[3],alpha=False)
        image.colorspace_settings.name='sRGB'if channel=='Base'else'Non-Color'
        image.generated_color=(.5,.5,1,1)if channel=='Normal'else(0,0,0,1)
        image.filepath_raw=str(folder/('Texture_Type94Patch'+channel+'V91.png'));image.file_format='PNG'
        target=tree.nodes.new('ShaderNodeTexImage');target.name='Editable new-detail '+channel;target.image=image
        for node in tree.nodes:node.select=False
        target.select=True;tree.nodes.active=target
        if channel=='Normal':
            tree.links.new(shader.outputs['BSDF'],output.inputs['Surface']);bpy.ops.object.bake(type='NORMAL',normal_space='TANGENT',use_clear=False,margin=8)
        else:
            tree.links.new(socket,emission.inputs['Color']);tree.links.new(emission.outputs[0],output.inputs['Surface']);bpy.ops.object.bake(type='EMIT',use_clear=False,margin=8)
        image.save();image.pack();records[channel]=dict(file=image.filepath_raw,sha256=Hash(image.filepath_raw))
    tree.links.new(shader.outputs['BSDF'],output.inputs['Surface'])
    (root/'Acceptance/Data_PbrPatchBakeV91.json').write_text(json.dumps(records,indent=2)+'\n')
    bpy.ops.wm.save_as_mainfile(filepath=str(destination))
else:
    bpy.ops.wm.open_mainfile(filepath=str(destination));scene=bpy.context.scene
    if phase=='Ao':
        paint=bpy.data.materials['Material_Type94Paint'];tree=paint.node_tree
        shader=tree.nodes['Physical Paint'];output=tree.nodes['Material Output']
        ao=tree.nodes.new('ShaderNodeAmbientOcclusion');ao.name='Editable current-geometry local AO V91'
        ao.inputs['Distance'].default_value=.025
        if hasattr(ao,'samples'):ao.samples=8
        if hasattr(ao,'only_local'):ao.only_local=True
        emission=tree.nodes.new('ShaderNodeEmission');emission.name='Editable current-geometry AO baker'
        tree.links.new(ao.outputs['Color'],emission.inputs['Color']);tree.links.new(emission.outputs[0],output.inputs['Surface'])
        image=bpy.data.images.new('Texture_Type94PaintCurrentAoV91',width=4096,height=4096,alpha=False)
        image.colorspace_settings.name='Non-Color';image.generated_color=(1,1,1,1)
        image.filepath_raw=str(folder/'Texture_Type94PaintCurrentAoV91.png');image.file_format='PNG'
        target=tree.nodes.new('ShaderNodeTexImage');target.name='Editable current-geometry AO target';target.image=image
        for node in tree.nodes:node.select=False
        target.select=True;tree.nodes.active=target
        bpy.ops.object.select_all(action='DESELECT');unique={}
        for obj in bpy.data.objects['Type94Tankette'].children_recursive:
            if obj.type=='MESH'and paint in list(obj.data.materials):unique.setdefault(obj.data.as_pointer(),obj)
        for obj in unique.values():obj.select_set(True)
        bpy.context.view_layer.objects.active=next(iter(unique.values()))
        scene.render.engine='CYCLES';scene.cycles.samples=8;scene.render.threads_mode='FIXED';scene.render.threads=4
        bpy.ops.object.bake(type='EMIT',use_clear=False,margin=8);image.save();image.pack()
        tree.links.new(shader.outputs['BSDF'],output.inputs['Surface'])
        old=tree.nodes['Baked Orm'].image
        pixels=np.empty(4096*4096*4,dtype=np.float32);old.pixels.foreach_get(pixels)
        aoPixels=np.empty_like(pixels);image.pixels.foreach_get(aoPixels)
        pixels.reshape(-1,4)[:,0]=aoPixels.reshape(-1,4)[:,0]
        combined=bpy.data.images.new('Texture_Type94PaintOrmCurrentV91',width=4096,height=4096,alpha=False)
        combined.colorspace_settings.name='Non-Color';combined.pixels.foreach_set(pixels)
        combined.filepath_raw=str(folder/'Texture_Type94PaintOrmCurrentV91.png');combined.file_format='PNG';combined.save();combined.pack()
        archive=tree.nodes.new('ShaderNodeTexImage');archive.name='Editable ORM before geometry-AO refresh V91';archive.image=old
        for node in tree.nodes:
            if node.type=='TEX_IMAGE'and node.image==old and node!=archive:node.image=combined
        frame=tree.nodes.new('NodeFrame');frame.name='Editable current-geometry AO refresh V91'
        for node in [ao,emission,target,archive]:node.parent=frame
        scene['SurfacePatchV91CurrentAoApplied']=True
        report=dict(distanceM=.025,onlyLocal=True,sourceObjects=len(unique),aoFile=image.filepath_raw,ormFile=combined.filepath_raw,ormSha256=Hash(combined.filepath_raw),scope='Current high geometry AO refresh removes stale contact occlusion from replaced heads. Base, roughness, metalness and normals are unchanged by this stage.')
        (root/'Acceptance/Data_CurrentAoV91.json').write_text(json.dumps(report,indent=2)+'\n')
        bpy.ops.wm.save_as_mainfile(filepath=str(destination));bpy.ops.wm.open_mainfile(filepath=str(destination))
        Export(root/'Exports/Model_Type94TanketteHighSurfaceV91Preview.glb')
    elif phase=='Finalize':
        data=json.loads((root/'Acceptance/Data_PbrPatchPrepareV91.json').read_text())
        tree=bpy.data.materials['Material_Type94Paint'].node_tree
        for channel in ['Base','Orm','Normal']:
            old=tree.nodes['Baked '+channel].image
            file=folder/('Texture_Type94Paint'+channel+'PatchedV91.png')
            image=bpy.data.images.load(str(file),check_existing=False);image.colorspace_settings.name=old.colorspace_settings.name;image.pack()
            for node in tree.nodes:
                if node.type=='TEX_IMAGE'and node.image==old:node.image=image
        for name in data['temporaryObjects']:bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
        for name in data['productionTemporarilyHidden']:bpy.data.objects[name].hide_render=False
        scene['SurfacePatchV91Applied']=True
        bpy.ops.wm.save_as_mainfile(filepath=str(destination));bpy.ops.wm.open_mainfile(filepath=str(destination))
        Export(root/'Exports/Model_Type94TanketteHighSurfaceV91Preview.glb')
    else:
        assert scene.get('SurfacePatchV91Applied')
        assert scene.get('SurfacePatchV91CurrentAoApplied')
        earName='Geometry_FrontCornerEarRight_Paint'
        if earName not in bpy.data.objects:
            ears=[obj for obj in bpy.data.objects if obj.name.startswith(earName+'.')]
            assert len(ears)==1
            ears[0].name=earName
        author=bpy.data.materials.get('Material_Type94PatchAuthorV91')
        if author is None:
            author=bpy.data.materials.new('Material_Type94PatchAuthorV91');author.use_nodes=True
            path=repo/'Taierzhuang1938/_blender/Script_Type94TankettePbr.py';syntax=ast.parse(path.read_text())
            names={'Node','Math','Ramp','Mix','Noise','Author'}
            scope=dict(bpy=bpy,math=math,importlib=importlib,REPO=repo,SURFACE_STYLE='SurfaceV44')
            exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(path),'exec'),scope)
            tree,shader,output,baseColor,orm=scope['Author'](author,'Paint')
            mix=tree.nodes.new('ShaderNodeMixRGB');mix.name='Matching retained olive pigment compression';mix.inputs[0].default_value=.38;mix.inputs[2].default_value=(.092,.102,.067,1)
            tree.links.new(baseColor,mix.inputs[1]);tree.links.new(mix.outputs[0],shader.inputs['Base Color'])
            for node in tree.nodes:
                if node.type=='AMBIENT_OCCLUSION'and hasattr(node,'only_local'):node.only_local=False
                if node.type=='BUMP':node.inputs['Strength'].default_value*=.55
        author.use_fake_user=True
        for channel in ['Base','Orm','Normal']:
            node=author.node_tree.nodes.get('Editable new-detail '+channel)or author.node_tree.nodes.new('ShaderNodeTexImage')
            node.name='Editable new-detail '+channel
            if node.image is None:
                node.image=bpy.data.images.load(str(folder/('Texture_Type94Patch'+channel+'V91.png')),check_existing=False)
                node.image.colorspace_settings.name='sRGB'if channel=='Base'else'Non-Color';node.image.pack()
        scene['SurfacePatchV91AuthorArchived']=True
        bpy.ops.wm.save_as_mainfile(filepath=str(destination));bpy.ops.wm.open_mainfile(filepath=str(destination))
        asset=bpy.data.objects['Type94Tankette'];objects=[asset,*asset.children_recursive]
        meshes=[obj for obj in objects if obj.type=='MESH']
        runtimeImages={}
        for role in ['Paint','Track','Steel','Rubber']:
            tree=bpy.data.materials['Material_Type94'+role].node_tree
            for channel in ['Base','Orm','Normal']:
                image=tree.nodes['Baked '+channel].image
                assert image.packed_file
                assert image.colorspace_settings.name==('sRGB'if channel=='Base'else'Non-Color')
                assert tuple(image.size)==(dict(Paint=4096,Track=2048,Steel=2048,Rubber=1024)[role],)*2
                runtimeImages[role+channel]=dict(name=image.name,size=list(image.size),packed=True,colorspace=image.colorspace_settings.name)
        author=bpy.data.materials['Material_Type94PatchAuthorV91']
        assert author.use_fake_user
        assert all(author.node_tree.nodes['Editable new-detail '+channel].image.packed_file for channel in ['Base','Orm','Normal'])
        assert len(meshes)==238 and len(objects)==293
        assert not any(obj.name.startswith('Temporary_Type94Patch')for obj in bpy.data.objects)
        assert all(not obj.hide_render for obj in meshes)
        Export(root/'Exports/Model_Type94TanketteHighSurfaceV91Preview.glb')
        Export(root/'Exports/Model_Type94TanketteHighSurfaceV91SourceReexport.glb')
        from io_scene_gltf2.io.com.constants import ROUNDING_DIGIT
        report=dict(sourceBlend=str(destination),sourceBlendSha256=Hash(destination),meshes=len(meshes),nodes=len(objects),exporterTangentRoundingDigits=ROUNDING_DIGIT,
            runtimeImages=runtimeImages,authorMaterialFakeUser=True,packedEditableTileMasters=3,noTemporaryObjects=True,
            sourceReexportSha256=Hash(root/'Exports/Model_Type94TanketteHighSurfaceV91SourceReexport.glb'))
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(root/'Exports/Model_Type94TanketteHighSurfaceV91Preview.glb'))
        importedMeshes=[obj for obj in bpy.data.objects if obj.type=='MESH']
        importedImages=[img for img in bpy.data.images if img.source=='FILE']
        assert len(importedMeshes)==238 and len(bpy.data.objects)==293 and len(importedImages)==12
        assert all(img.packed_file for img in importedImages)
        report.update(actualImportedMeshes=len(importedMeshes),actualImportedNodes=len(bpy.data.objects),actualImportedImages=len(importedImages),passed=True)
        (root/'Acceptance/Data_SourceReopenV91.json').write_text(json.dumps(report,indent=2)+'\n')
print('TYPE94_PATCH91_'+phase.upper()+'_COMPLETE',flush=True)
