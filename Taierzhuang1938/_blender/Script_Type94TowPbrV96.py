"""Integrate verified V95 geometry into preserved V92 PBR using an empty tile."""
import ast,bpy,hashlib,importlib.util,json,math,os,shutil,numpy as np
from pathlib import Path
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')
root=Path(os.environ.get('TYPE94_PBR_ROOT',str(base/'SurfaceV96')));folder=root/'Textures/HighSurfaceV96Preview'
for directory in [root,folder,root/'Acceptance',root/'Exports',root/'Rebuild']:directory.mkdir(parents=True,exist_ok=True)
phase=os.environ.get('TYPE94_PBR_PHASE','Prepare');assert phase in ['Prepare','Bake','Finalize','Ao','Verify']and not bpy.data.filepath
destination=root/'Scene_Type94TanketteHighSurfaceV96Preview.blend'
atlas=json.loads((root/'Acceptance/Data_PaintAtlasSpaceV96.json').read_text());patch=atlas['patchPixels']
def Hash(file):return hashlib.sha256(Path(file).read_bytes()).hexdigest()
def Save(file,data):Path(file).write_text(json.dumps(data,indent=2)+'\n')
def Export(file):
    bpy.ops.object.select_all(action='DESELECT');asset=bpy.data.objects['Type94Tankette']
    for obj in [asset,*asset.children_recursive]:obj.select_set(True)
    spec=importlib.util.spec_from_file_location('Tow96Export',repo/'Taierzhuang1938/_blender/Script_Type94Export.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.ExportGltf(file)
def Key(mesh,face):
    values=[tuple(mesh.vertices[i].co)for i in face.vertices];return min(tuple(values[i:]+values[:i])for i in range(len(values)))
def TransferUv(source,a,target,b):
    x=[tuple(source.vertices[i].co)for i in a.vertices];y=[tuple(target.vertices[i].co)for i in b.vertices]
    offset=next(i for i in range(len(x))if x[i:]+x[:i]==y);loops=list(a.loop_indices)
    for j,i in zip(b.loop_indices,loops[offset:]+loops[:offset]):target.uv_layers.active.data[j].uv=source.uv_layers.active.data[i].uv
if phase=='Prepare':
    material=atlas['materialReference'];geometry=json.loads((base/'TowShoulderV95/Acceptance/Data_TowShoulderIdentityV95.json').read_text());native=json.loads((base/'TowShoulderV95/Acceptance/Data_TowNativeV95.json').read_text())
    assert native['passed']and native['sha256']==geometry['sha256'];assert Hash(material['sourceBlend'])==material['sourceBlendSha256']and Hash(geometry['sourceBlend'])==geometry['sourceBlendSha256']
    bpy.ops.wm.open_mainfile(filepath=material['sourceBlend']);scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette'
    hull=bpy.data.objects['Geometry_Hull_Paint'];oldHull=hull.data;paint=bpy.data.materials['Material_Type94Paint'];inputs={}
    for role in ['Paint','Track','Steel','Rubber']:
        for channel in ['Base','Orm','Normal']:
            image=bpy.data.materials['Material_Type94'+role].node_tree.nodes['Baked '+channel].image
            file=folder/('Texture_Type94'+role+channel+'InputV96.png');assert image.packed_file;file.write_bytes(image.packed_file.data);inputs[role+channel]=dict(file=str(file),sha256=Hash(file))
    legacy=bpy.data.objects['TowShackleFront']
    for obj in [*legacy.children_recursive,legacy]:bpy.data.objects.remove(obj,do_unlink=True)
    before=set(bpy.data.objects)
    with bpy.data.libraries.load(geometry['sourceBlend'],link=False)as(available,loaded):loaded.objects=['Geometry_Hull_Paint','Geometry_TowHookFrontFixed_Paint','Geometry_TowLatchFront_Paint']
    imported=set(bpy.data.objects)-before;sourceHull,sourceFixed,sourceGate=loaded.objects
    newHull=sourceHull.data.copy();lookup={}
    for face in oldHull.polygons:lookup.setdefault(Key(oldHull,face),[]).append(face.index)
    retained=[]
    for face in newHull.polygons:
        choices=lookup.get(Key(newHull,face),[]);assert choices,'Current Hull must be a literal subset of preserved material geometry'
        previous=choices.pop();TransferUv(oldHull,oldHull.polygons[previous],newHull,face);retained.append((face.index,previous))
    for attribute in oldHull.attributes:
        if attribute.domain!='FACE'or attribute.data_type!='FLOAT':continue
        target=newHull.attributes.get(attribute.name)or newHull.attributes.new(attribute.name,'FLOAT','FACE')
        for a,b in retained:target.data[a].value=attribute.data[b].value
    hull.data=newHull;hull.data.materials.clear();hull.data.materials.append(paint)
    pairs=[]
    for source in [sourceFixed,sourceGate]:
        parent=source.parent.copy();parent.parent=bpy.data.objects['Hull'];parent.matrix_basis=source.parent.matrix_basis.copy();scene.collection.objects.link(parent)
        obj=source.copy();obj.data=source.data.copy();obj.parent=parent;obj.matrix_basis=source.matrix_basis.copy();scene.collection.objects.link(obj)
        obj.data.materials.clear();obj.data.materials.append(paint)
        for face in obj.data.polygons:face.material_index=0
        pairs.append((parent,obj,source.parent.name,source.name))
    for obj in imported:bpy.data.objects.remove(obj,do_unlink=True)
    for parent,obj,parentName,name in pairs:parent.name=parentName;obj.name=name
    bpy.context.view_layer.update();production=[obj for _,obj,_,_ in pairs];vertices=[];faces=[];normals=[];faceMap=[]
    for obj in production:
        offset=len(vertices);vertices.extend(tuple(obj.matrix_world@v.co)for v in obj.data.vertices);normalMatrix=obj.matrix_world.to_3x3().inverted().transposed()
        for face in obj.data.polygons:
            faces.append([offset+i for i in face.vertices]);faceMap.append(dict(owner=obj.name,face=face.index))
            normals.extend(tuple((normalMatrix@obj.data.corner_normals[i].vector).normalized())for i in face.loop_indices)
    mesh=bpy.data.meshes.new('Mesh_Type94TowTileV96');mesh.from_pydata(vertices,[],faces);mesh.update();mesh.uv_layers.new(name='UVMap');mesh.normals_split_custom_set(normals)
    for name,value in [('WearZone',.9),('SurfaceCast',.25),('TrackContact',0.)]:
        attr=mesh.attributes.new(name,'FLOAT','FACE')
        for item in attr.data:item.value=value
    contact=mesh.attributes.new('TowContactWear','FLOAT','FACE')
    for record,item in zip(faceMap,contact.data):
        obj=bpy.data.objects[record['owner']];face=obj.data.polygons[record['face']]
        groups={obj.vertex_groups[g.group].name for g in obj.data.vertices[face.vertices[0]].groups if g.weight>.5}
        value=0.
        if any('PinHeadV95'in name or'PinEndV95'in name for name in groups):value=.95
        elif any('TransversePinV95'in name for name in groups):value=.65
        elif any('SpringCoilV95'in name for name in groups):value=.95
        elif any('UpperLipV95'in name for name in groups):value=.80
        elif any('GateStemV95'in name for name in groups):value=.40
        elif any('ShoulderWindowV95'in name for name in groups):value=.22
        elif 'Tow_HookRootContinuousV95'in groups:
            p=face.center;n=face.normal
            contactBand=math.exp(-((p.z+.110)/.020)**2)*max(0.,min(1.,(n.z-.20)/.55)) if .0<p.y<.10 else 0.
            handling=math.exp(-((p.z+.065)/.025)**2)*max(0.,min(1.,(-n.x-.35)/.5)) if -.025<p.y<.035 else 0.
            value=max(.9*contactBand,.42*handling)
        item.value=value
        for name,number in [('TowContactWear',value),('WearZone',.9),('SurfaceCast',.25)]:
            attribute=obj.data.attributes.get(name)or obj.data.attributes.new(name,'FLOAT','FACE');attribute.data[face.index].value=number
    detail=bpy.data.objects.new('Temporary_TowTileBakeV96',mesh);scene.collection.objects.link(detail)
    author=bpy.data.materials.new('Material_Type94TowAuthorV96');author.use_nodes=True;author.use_fake_user=True;mesh.materials.append(author)
    bpy.ops.object.select_all(action='DESELECT');detail.select_set(True);bpy.context.view_layer.objects.active=detail
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(65),island_margin=.006,scale_to_bounds=True,correct_aspect=False);bpy.ops.object.mode_set(mode='OBJECT')
    x,y,w,h=patch;pad=8
    for item in mesh.uv_layers.active.data:item.uv=(pad/w+(1-2*pad/w)*item.uv.x,pad/h+(1-2*pad/h)*item.uv.y)
    for face,record in zip(mesh.polygons,faceMap):
        target=bpy.data.objects[record['owner']].data
        for a,b in zip(face.loop_indices,target.polygons[record['face']].loop_indices):
            u,v=mesh.uv_layers.active.data[a].uv;target.uv_layers.active.data[b].uv=((x+w*u)/4096,1-(y+h*(1-v))/4096)
    proxyMesh=bpy.data.meshes.new('Mesh_Type94TowAoProxyV96');proxyMesh.from_pydata([tuple(hull.matrix_world@v.co)for v in hull.data.vertices],[],[list(f.vertices)for f in hull.data.polygons]);proxyMesh.update()
    proxy=bpy.data.objects.new('Temporary_TowAoProxyV96',proxyMesh);scene.collection.objects.link(proxy)
    for obj in [hull,*production]:obj.hide_render=True
    scene['SurfaceStudyRevision']='SurfaceV96Preview';scene['SurfaceGeometryRevision']='ShapeV95TowRootShoulderTrial';scene['WholeReferenceAccepted']=False
    Save(root/'Acceptance/Data_TowPbrPrepareV96.json',dict(materialReference=material,geometryReference=geometry,inputs=inputs,patchPixels=patch,retainedHullUvPolygons=len(retained),temporaryObjects=[detail.name,proxy.name],productionHidden=[hull.name,*[o.name for o in production]],bakePolygons=len(faceMap),faceMap=faceMap))
    bpy.ops.wm.save_as_mainfile(filepath=str(destination))
elif phase=='Bake':
    bpy.ops.wm.open_mainfile(filepath=str(destination));scene=bpy.context.scene;obj=bpy.data.objects['Temporary_TowTileBakeV96'];material=bpy.data.materials['Material_Type94TowAuthorV96']
    file=repo/'Taierzhuang1938/_blender/Script_Type94TankettePbr.py';syntax=ast.parse(file.read_text());names={'Node','Math','Ramp','Mix','Noise','Author'}
    scope=dict(bpy=bpy,math=math,importlib=importlib,REPO=repo,SURFACE_STYLE='SurfaceV44');exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name in names],type_ignores=[]),str(file),'exec'),scope)
    tree,shader,output,baseColor,orm=scope['Author'](material,'Paint')
    mix=tree.nodes.new('ShaderNodeMixRGB');mix.name='Retained olive pigment match';mix.inputs[0].default_value=.38;mix.inputs[2].default_value=(.092,.102,.067,1);tree.links.new(baseColor,mix.inputs[1]);baseColor=mix.outputs[0];tree.links.new(baseColor,shader.inputs['Base Color'])
    geometry=tree.nodes['Physical surface position and curvature'];contact=scope['Node'](tree,'ShaderNodeAttribute','Contact-specific worn steel');contact.attribute_name='TowContactWear'
    pattern=scope['Ramp'](tree,scope['Noise'](tree,geometry.outputs['Position'],160,3,'Broken millimetre contact wear'),.38,.68,'Interrupted polished lands')
    mask=scope['Math'](tree,'MULTIPLY',contact.outputs['Fac'],pattern,'Exposed steel stays in physical contact zones')
    baseColor=scope['Mix'](tree,mask,baseColor,(.34,.35,.34,1),'Exposed neutral steel reflectance');tree.links.new(baseColor,shader.inputs['Base Color'])
    separate=scope['Node'](tree,'ShaderNodeSeparateXYZ','Previous physical ORM');tree.links.new(orm,separate.inputs[0])
    rough=scope['Mix'](tree,mask,separate.outputs['Y'],(.20,.20,.20,1),'Contact steel is smoother than coating')
    metal=scope['Mix'](tree,mask,separate.outputs['Z'],(.99,.99,.99,1),'Contact steel conducts')
    combine=scope['Node'](tree,'ShaderNodeCombineXYZ','Contact-refined ORM');tree.links.new(separate.outputs['X'],combine.inputs['X']);tree.links.new(rough,combine.inputs['Y']);tree.links.new(metal,combine.inputs['Z']);orm=combine.outputs[0]
    tree.links.new(rough,shader.inputs['Roughness']);tree.links.new(metal,shader.inputs['Metallic'])
    previous=shader.inputs['Normal'].links[0].from_socket;normalMix=scope['Node'](tree,'ShaderNodeMixRGB','Polish removes coating normal grain');tree.links.new(mask,normalMix.inputs[0]);tree.links.new(previous,normalMix.inputs[1]);tree.links.new(geometry.outputs['Normal'],normalMix.inputs[2])
    normalize=scope['Node'](tree,'ShaderNodeVectorMath','Normalize polished contact normal');normalize.operation='NORMALIZE';tree.links.new(normalMix.outputs[0],normalize.inputs[0]);tree.links.new(normalize.outputs[0],shader.inputs['Normal']);tree.links.new(normalize.outputs[0],shader.inputs['Coat Normal'])
    for node in tree.nodes:
        if node.type=='AMBIENT_OCCLUSION'and hasattr(node,'only_local'):node.only_local=False
        if node.type=='BUMP':node.inputs['Strength'].default_value*=.55
    emission=tree.nodes.new('ShaderNodeEmission');bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    scene.render.engine='CYCLES';scene.cycles.samples=8;scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.bake.use_selected_to_active=False;records={}
    for channel,socket in [('Base',baseColor),('Orm',orm),('Normal',None)]:
        image=bpy.data.images.new('Texture_Type94Tow'+channel+'TileV96',width=patch[2],height=patch[3],alpha=False);image.colorspace_settings.name='sRGB'if channel=='Base'else'Non-Color';image.generated_color=(.5,.5,1,1)if channel=='Normal'else(0,0,0,1);image.filepath_raw=str(folder/('Texture_Type94Tow'+channel+'TileV96.png'));image.file_format='PNG'
        target=tree.nodes.new('ShaderNodeTexImage');target.name='Editable tow tile '+channel;target.image=image
        for node in tree.nodes:node.select=False
        target.select=True;tree.nodes.active=target
        if channel=='Normal':tree.links.new(shader.outputs['BSDF'],output.inputs['Surface']);bpy.ops.object.bake(type='NORMAL',normal_space='TANGENT',use_clear=False,margin=8)
        else:tree.links.new(socket,emission.inputs['Color']);tree.links.new(emission.outputs[0],output.inputs['Surface']);bpy.ops.object.bake(type='EMIT',use_clear=False,margin=8)
        image.save();image.pack();records[channel]=dict(file=image.filepath_raw,sha256=Hash(image.filepath_raw))
    tree.links.new(shader.outputs['BSDF'],output.inputs['Surface']);Save(root/'Acceptance/Data_TowTileBakeV96.json',records);bpy.ops.wm.save_as_mainfile(filepath=str(destination))
else:
    bpy.ops.wm.open_mainfile(filepath=str(destination));scene=bpy.context.scene;paint=bpy.data.materials['Material_Type94Paint'];tree=paint.node_tree
    if phase=='Finalize':
        preparation=json.loads((root/'Acceptance/Data_TowPbrPrepareV96.json').read_text())
        for channel in ['Base','Orm','Normal']:
            old=tree.nodes['Baked '+channel].image;image=bpy.data.images.load(str(folder/('Texture_Type94Paint'+channel+'PatchedV96.png')),check_existing=False);image.colorspace_settings.name=old.colorspace_settings.name;image.pack()
            archive=tree.nodes.new('ShaderNodeTexImage');archive.name='Editable pre-tow '+channel+' V96';archive.image=old
            for node in tree.nodes:
                if node.type=='TEX_IMAGE'and node.image==old and node!=archive:node.image=image
        for name in preparation['temporaryObjects']:bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
        for name in preparation['productionHidden']:bpy.data.objects[name].hide_render=False
        scene['TowPbrV96Applied']=True;scene['TowPbrV96AoApplied']=False;bpy.ops.wm.save_as_mainfile(filepath=str(destination))
    elif phase=='Ao':
        assert scene.get('TowPbrV96Applied');shader=tree.nodes['Physical Paint'];output=tree.nodes['Material Output'];ao=tree.nodes.new('ShaderNodeAmbientOcclusion');ao.name='Current geometry AO V96';ao.inputs['Distance'].default_value=.025;ao.samples=8;ao.only_local=True
        emission=tree.nodes.new('ShaderNodeEmission');tree.links.new(ao.outputs['Color'],emission.inputs['Color']);tree.links.new(emission.outputs[0],output.inputs['Surface'])
        image=bpy.data.images.new('Texture_Type94PaintAoCurrentV96',width=4096,height=4096,alpha=False);image.colorspace_settings.name='Non-Color';image.generated_color=(1,1,1,1);image.filepath_raw=str(folder/'Texture_Type94PaintAoCurrentV96.png');image.file_format='PNG'
        target=tree.nodes.new('ShaderNodeTexImage');target.name='Editable current AO V96';target.image=image
        for node in tree.nodes:node.select=False
        target.select=True;tree.nodes.active=target;bpy.ops.object.select_all(action='DESELECT');unique={}
        for obj in bpy.data.objects['Type94Tankette'].children_recursive:
            if obj.type=='MESH'and paint in list(obj.data.materials):unique.setdefault(obj.data.as_pointer(),obj)
        for obj in unique.values():obj.select_set(True)
        bpy.context.view_layer.objects.active=next(iter(unique.values()));scene.render.engine='CYCLES';scene.cycles.samples=8;scene.render.threads_mode='FIXED';scene.render.threads=4;bpy.ops.object.bake(type='EMIT',use_clear=False,margin=8);image.save();image.pack();tree.links.new(shader.outputs['BSDF'],output.inputs['Surface'])
        old=tree.nodes['Baked Orm'].image;pixels=np.empty(4096*4096*4,dtype=np.float32);old.pixels.foreach_get(pixels);aoPixels=np.empty_like(pixels);image.pixels.foreach_get(aoPixels);pixels.reshape(-1,4)[:,0]=aoPixels.reshape(-1,4)[:,0]
        combined=bpy.data.images.new('Texture_Type94PaintOrmCurrentV96',width=4096,height=4096,alpha=False);combined.colorspace_settings.name='Non-Color';combined.pixels.foreach_set(pixels);combined.filepath_raw=str(folder/'Texture_Type94PaintOrmCurrentV96.png');combined.file_format='PNG';combined.save();combined.pack()
        archive=tree.nodes.new('ShaderNodeTexImage');archive.name='Editable ORM before AO V96';archive.image=old
        for node in tree.nodes:
            if node.type=='TEX_IMAGE'and node.image==old and node!=archive:node.image=combined
        scene['TowPbrV96AoApplied']=True;bpy.ops.wm.save_as_mainfile(filepath=str(destination));Save(root/'Acceptance/Data_TowAoV96.json',dict(distanceM=.025,onlyLocal=True,sourceObjects=len(unique),baseRoughnessMetalnessNormalUnchangedByAo=True))
    else:
        assert scene.get('TowPbrV96Applied')and scene.get('TowPbrV96AoApplied')
        for file in [Path(__file__),repo/'Taierzhuang1938/_blender/Script_Type94TowShoulderV95.py',repo/'Taierzhuang1938/Model/Type94Tankette/Data_TowShoulderLayoutV95.json']:
            text=bpy.data.texts.get(file.name)or bpy.data.texts.new(file.name);text.clear();text.write(file.read_text());text.use_fake_user=True
        bpy.ops.wm.save_as_mainfile(filepath=str(destination));bpy.ops.wm.open_mainfile(filepath=str(destination))
        for file in [Path(__file__),repo/'Taierzhuang1938/_blender/Script_Type94TowShoulderV95.py',repo/'Taierzhuang1938/Model/Type94Tankette/Data_TowShoulderLayoutV95.json']:
            assert bpy.data.texts[file.name].use_fake_user and bpy.data.texts[file.name].as_string()==file.read_text()
        asset=bpy.data.objects['Type94Tankette'];objects=[asset,*asset.children_recursive];meshes=[o for o in objects if o.type=='MESH'];assert len(objects)==295 and len(meshes)==239
        assert not any(o.name.startswith('Temporary_')for o in objects);images={}
        for role in ['Paint','Track','Steel','Rubber']:
            for channel in ['Base','Orm','Normal']:
                image=bpy.data.materials['Material_Type94'+role].node_tree.nodes['Baked '+channel].image;assert image.packed_file;assert image.colorspace_settings.name==('sRGB'if channel=='Base'else'Non-Color');assert tuple(image.size)==(dict(Paint=4096,Track=2048,Steel=2048,Rubber=1024)[role],)*2;images[role+channel]=dict(size=list(image.size),colorspace=image.colorspace_settings.name,packed=True)
        author=bpy.data.materials['Material_Type94TowAuthorV96'];assert author.use_fake_user and all(author.node_tree.nodes['Editable tow tile '+channel].image.packed_file for channel in ['Base','Orm','Normal'])
        Export(root/'Exports/Model_Type94TanketteHighSurfaceV96Preview.glb');bpy.ops.wm.open_mainfile(filepath=str(destination));Export(root/'Exports/Model_Type94TanketteHighSurfaceV96SourceReexport.glb')
        from io_scene_gltf2.io.com.constants import ROUNDING_DIGIT
        report=dict(passed=True,sourceBlend=str(destination),sourceBlendSha256=Hash(destination),meshOwners=239,poseNodes=295,runtimeImages=images,packedEditableTileMasters=3,authorMaterialFakeUser=True,sourceAuthoringTextsArchived=True,exporterTangentRoundingDigits=ROUNDING_DIGIT)
        bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(root/'Exports/Model_Type94TanketteHighSurfaceV96Preview.glb'))
        importedMeshes=[o for o in bpy.data.objects if o.type=='MESH'];importedImages=[i for i in bpy.data.images if i.source=='FILE'];assert len(importedMeshes)==239 and len(bpy.data.objects)==295 and len(importedImages)==12 and all(i.packed_file for i in importedImages)
        report.update(actualImportedMeshOwners=len(importedMeshes),actualImportedPoseNodes=len(bpy.data.objects),actualImportedImages=len(importedImages));Save(root/'Acceptance/Data_TowSourceReopenV96.json',report)
print('TYPE94_TOWPBR96_'+phase.upper()+'_COMPLETE',flush=True)
