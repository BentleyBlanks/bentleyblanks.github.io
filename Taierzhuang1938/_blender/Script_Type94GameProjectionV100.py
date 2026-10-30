"""Fresh low UVs and actual latest-high to game PBR projection.

Each unique mesh pair occupies its own isolated staging tile. The high donor
retains the packed V99 runtime graph and original UVs; the target uses freshly
packed low UVs. Base/ORM are unlit channel projections, and tangent normals
include both high geometry and the high material's existing normal response.
"""
import bpy,hashlib,importlib.util,json,math,os,sys,time,numpy as np
from pathlib import Path
from mathutils import Vector
repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2])))
base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_GAME_ROOT',str(base/'GameTrialV100')));acc=root/'Acceptance';textures=root/'Textures/GamePbrV100';textures.mkdir(parents=True,exist_ok=True)
phase=os.environ.get('TYPE94_GAME_PHASE','Prepare');roleFilter=os.environ.get('TYPE94_GAME_ROLE');assert phase in ['Prepare','Donors','Bake','Finalize']
roles=dict(Paint=4096,Track=2048,Steel=2048,Rubber=1024);solidRoles=['Dark','White','Red']
work=root/'Scene_Type94ProjectionWorkV100.blend';geometry=json.loads((acc/'Data_GameGeometryV100.json').read_text());highManifest=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV99.json').read_text())
assert geometry['withinBudget']and geometry['allLocalSurfacesCertified']
assert geometry.get('channelPlanesLocked')==8,'Complete the explicit Planes phase before UV/projection; it also fixes the saved normal-encoding sequence'
assert geometry['sourceGlbSha256']==highManifest['sha256']and hashlib.sha256(Path(highManifest['sourceBlend']).read_bytes()).hexdigest()==highManifest['sourceBlendSha256']
assert not bpy.data.filepath
file=repo/'Taierzhuang1938/_blender/Script_Type94Export.py';spec=importlib.util.spec_from_file_location('ProjectionExactExport',file);exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)
def Canonical(material):
    name=material.name.split('.')[0];assert name.startswith('Material_Type94');return name[len('Material_Type94'):]
def Select(objects,active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=active or objects[0]
def NewMesh(name,objects,faceLists,offsets,donor):
    points=[];faces=[];uvs=[];normals=[];smooth=[];slots=[];materials=[];bindings=[]
    for obj,ids,offset in zip(objects,faceLists,offsets):
        source=obj.data;vertices=sorted({i for f in ids for i in source.polygons[f].vertices});lookup={i:j+len(points)for j,i in enumerate(vertices)};points.extend(tuple(v+offset)for v in [source.vertices[i].co for i in vertices]);loopMap=[]
        for faceId in ids:
            face=source.polygons[faceId];faces.append(tuple(lookup[i]for i in face.vertices));smooth.append(face.use_smooth)
            if donor:
                material=source.materials[face.material_index]
                if material not in materials:materials.append(material)
                slots.append(materials.index(material))
            else:slots.append(0)
            for li in face.loop_indices:
                uvs.append(tuple(source.uv_layers.active.data[li].uv)if donor else(0,0));normals.append(tuple(source.corner_normals[li].vector));loopMap.append((len(uvs)-1,li))
        bindings.append(dict(owner=obj.name,loops=loopMap))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(points,[],faces);mesh.update();uv=mesh.uv_layers.new(name='UVMap')
    for material in materials:mesh.materials.append(material)
    for item,coordinate in zip(uv.data,uvs):item.uv=coordinate
    for face,s,m in zip(mesh.polygons,smooth,slots):face.use_smooth=s;face.material_index=m
    mesh.normals_split_custom_set(normals);obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj);return obj,bindings
def AtlasMask(mesh,size):
    mesh.calc_loop_triangles();mask=np.zeros((size,size),dtype=bool)
    for tri in mesh.loop_triangles:
        q=np.array([tuple(mesh.uv_layers.active.data[i].uv)for i in tri.loops])*size-.5;minimum=np.maximum(0,np.ceil(q.min(axis=0)).astype(int));maximum=np.minimum(size-1,np.floor(q.max(axis=0)).astype(int))
        if np.any(maximum<minimum):continue
        x0,y0=minimum;x1,y1=maximum;x,y=np.meshgrid(np.arange(x0,x1+1),np.arange(y0,y1+1));a,b,c=q;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(den)<1e-12:continue
        u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den;v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;inside=(u>=-1e-7)&(v>=-1e-7)&(u+v<=1+1e-7);mask[y0:y1+1,x0:x1+1]|=inside
    return mask
if phase=='Prepare':
    file=Path(geometry['sourceBlend']);assert hashlib.sha256(file.read_bytes()).hexdigest()==geometry['sourceBlendSha256'];bpy.ops.wm.open_mainfile(filepath=str(file));scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette'
    names=tuple(r['mesh']for r in geometry['records'])
    with bpy.data.libraries.load(highManifest['sourceBlend'],link=False)as(available,loaded):
        assert all(n in available.objects for n in names);loaded.objects=list(names)
    donors=dict(zip(names,loaded.objects));targets={n:bpy.data.objects[n]for n in names};stages={};allFilled={n:set()for n in names}
    for obj in donors.values():obj.data=exporter.TriangulatedCopy(obj.data)
    for obj in targets.values():
        while obj.data.uv_layers:obj.data.uv_layers.remove(obj.data.uv_layers[0])
        obj.data.uv_layers.new(name='UVMap_GameV100')
    for role in list(roles)+solidRoles:
        activeNames=[];faces=[];offsets=[]
        for index,name in enumerate(names):
            obj=targets[name];ids=[f.index for f in obj.data.polygons if Canonical(obj.data.materials[f.material_index])==role]
            if ids:activeNames.append(name);faces.append(ids);offsets.append(Vector(((index%8)*5,(index//8)*5,0)))
        if not activeNames:continue
        target,bindings=NewMesh('Temporary_Target'+role,[targets[n]for n in activeNames],faces,offsets,False)
        Select([target]);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(65),island_margin=0,scale_to_bounds=True);bpy.ops.uv.average_islands_scale();bpy.ops.uv.pack_islands(rotate=True,margin_method='FRACTION',margin=4/roles.get(role,1024),scale=True);bpy.ops.object.mode_set(mode='OBJECT')
        for name,binding in zip(activeNames,bindings):
            for stageLoop,originalLoop in binding['loops']:
                assert originalLoop not in allFilled[name];allFilled[name].add(originalLoop);targets[name].data.uv_layers.active.data[originalLoop].uv=target.data.uv_layers.active.data[stageLoop].uv
        if role in roles:
            source,_=NewMesh('Temporary_Donor'+role,[donors[n]for n in activeNames],[list(range(len(donors[n].data.polygons)))for n in activeNames],offsets,True)
            material=bpy.data.materials.new('Material_TemporaryTarget'+role);material.use_nodes=True;target.data.materials.append(material)
            mask=AtlasMask(target.data,roles[role]);np.savez_compressed(acc/('Data_LowAtlasMask'+role+'V100.npz'),mask=mask)
            uvBytes=np.array([tuple(v.uv)for v in target.data.uv_layers.active.data],dtype='<f4').tobytes();stages[role]=dict(target=target.name,donor=source.name,size=roles[role],owners=activeNames,atlasPixels=int(mask.sum()),uvSha256=hashlib.sha256(uvBytes).hexdigest(),targetFaces=len(target.data.polygons),projectionOffsetM=.0035,maximumRayDistanceM=.008)
        else:bpy.data.objects.remove(target,do_unlink=True)
        print('TYPE94_V100_FRESH_UV',role,len(activeNames),flush=True)
    assert all(len(allFilled[n])==len(obj.data.loops)for n,obj in targets.items())
    for obj in loaded.objects:bpy.data.objects.remove(obj,do_unlink=True)
    scene['GameProjectionStagesV100']=json.dumps(stages);scene['GameUvGenerationMode']='Fresh';scene['GameHighSourceSha256']=highManifest['sha256'];scene['GameGeometrySha256']=geometry['sha256'];scene['GamePbrProjectionAccepted']=False
    bpy.ops.wm.save_as_mainfile(filepath=str(work));report=dict(schema='Type94HighToLowPreparationV1',geometrySha256=geometry['sha256'],referenceSha256=highManifest['sha256'],referenceBlendSha256=highManifest['sourceBlendSha256'],stages=stages,freshUvs=True,allUniqueLoopOwners=len(targets),allLoopsAssignedOnce=True,workBlend=str(work),workBlendSha256=hashlib.sha256(work.read_bytes()).hexdigest(),scope='Separate current high/low mesh pairs in isolated5metrestagingtiles; original high UVs and runtime shader response retained')
    report['donorTriangulation']='ExactSourceExporterTriangulation';(acc/'Data_GameProjectionPreparationV100.json').write_text(json.dumps(report,indent=2)+'\n')
else:
    prepare=json.loads((acc/'Data_GameProjectionPreparationV100.json').read_text());assert hashlib.sha256(work.read_bytes()).hexdigest()==prepare['workBlendSha256'];bpy.ops.wm.open_mainfile(filepath=str(work));scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette';stages=json.loads(scene['GameProjectionStagesV100']);scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.bake.use_selected_to_active=True;scene.render.bake.use_clear=True;scene.render.bake.cage_extrusion=.0035;scene.render.bake.max_ray_distance=.008
    if phase=='Donors':
        names=tuple(r['mesh']for r in geometry['records'])
        with bpy.data.libraries.load(highManifest['sourceBlend'],link=False)as(available,loaded):loaded.objects=list(names)
        donors=dict(zip(names,loaded.objects))
        for obj in donors.values():obj.data=exporter.TriangulatedCopy(obj.data)
        for role,stage in stages.items():
            old=bpy.data.objects[stage['donor']];bpy.data.objects.remove(old,do_unlink=True);active=stage['owners'];offsets=[Vector(((names.index(n)%8)*5,(names.index(n)//8)*5,0))for n in active];source,_=NewMesh(stage['donor'],[donors[n]for n in active],[list(range(len(donors[n].data.polygons)))for n in active],offsets,True);assert source.name==stage['donor']
        for obj in loaded.objects:bpy.data.objects.remove(obj,do_unlink=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(work));prepare['workBlendSha256']=hashlib.sha256(work.read_bytes()).hexdigest();prepare['donorTriangulation']='ExactSourceExporterTriangulation';(acc/'Data_GameProjectionPreparationV100.json').write_text(json.dumps(prepare,indent=2)+'\n')
    elif phase=='Bake':
        assert prepare.get('donorTriangulation')=='ExactSourceExporterTriangulation'
        for role,stage in stages.items():
            if roleFilter and role!=roleFilter:continue
            target=bpy.data.objects[stage['target']];donor=bpy.data.objects[stage['donor']];size=stage['size'];sourceMaterials=set(donor.data.materials);graphs={}
            for material in sourceMaterials:
                tree=material.node_tree;output=next(n for n in tree.nodes if n.type=='OUTPUT_MATERIAL'and n.is_active_output);principled=next(n for n in tree.nodes if n.type=='BSDF_PRINCIPLED');original=output.inputs['Surface'].links[0].from_socket;emission=tree.nodes.new('ShaderNodeEmission');graphs[material]=(output,principled,original,emission)
            channels=[]
            for channel in ['Coverage','Base','Orm','Normal']:
                started=time.time();image=bpy.data.images.new('Texture_Type94Game'+role+channel,width=size,height=size,alpha=False,float_buffer=False);image.colorspace_settings.name='sRGB'if channel=='Base'else'Non-Color';image.generated_color=(.5,.5,1,1)if channel=='Normal'else(0,0,0,1);image.file_format='PNG';image.filepath_raw=str(textures/(image.name+'.png'))
                tree=target.data.materials[0].node_tree;node=tree.nodes.new('ShaderNodeTexImage');node.image=image;tree.nodes.active=node
                for material,(output,shader,original,emission)in graphs.items():
                    tree=material.node_tree
                    if channel=='Normal':tree.links.new(original,output.inputs['Surface']);continue
                    if channel=='Coverage':emission.inputs['Color'].default_value=(1,1,1,1)
                    elif channel=='Base':
                        socket=shader.inputs['Base Color'];tree.links.new(socket.links[0].from_socket,emission.inputs['Color'])if socket.is_linked else setattr(emission.inputs['Color'],'default_value',socket.default_value)
                    else:
                        combine=tree.nodes.new('ShaderNodeCombineColor');combine.mode='RGB';ao=next((n.inputs['Occlusion']for n in tree.nodes if n.type=='GROUP'and n.node_tree and n.node_tree.name.startswith('glTF Material Output')and'Occlusion'in n.inputs),None)
                        for index,socket in enumerate([ao,shader.inputs['Roughness'],shader.inputs['Metallic']]):
                            if socket is not None and socket.is_linked:tree.links.new(socket.links[0].from_socket,combine.inputs[index])
                            else:combine.inputs[index].default_value=socket.default_value if socket is not None else 1.
                        tree.links.new(combine.outputs['Color'],emission.inputs['Color'])
                    tree.links.new(emission.outputs[0],output.inputs['Surface'])
                Select([donor,target],target)
                bpy.ops.object.bake(type='NORMAL'if channel=='Normal'else'EMIT',normal_space='TANGENT',use_selected_to_active=True,use_clear=True,margin=0 if channel=='Coverage'else 4,cage_extrusion=.0035,max_ray_distance=.008)
                image.save();pixels=np.empty(size*size*4,dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(size,size,4)
                if channel=='Coverage':
                    mask=np.load(acc/('Data_LowAtlasMask'+role+'V100.npz'))['mask'];valid=np.all(pixels[:,:,:3]>.99,axis=2);missing=mask&~valid;np.savez_compressed(acc/('Data_ProjectionCoverage'+role+'V100.npz'),mask=mask,valid=valid,missing=missing);coverage=dict(usedPixels=int(mask.sum()),validPixels=int((mask&valid).sum()),missingPixels=int(missing.sum()),missingFraction=float(missing.sum()/max(1,mask.sum())),allPixelsProjected=not bool(missing.any()))
                    (acc/('Data_ProjectionCoverage'+role+'V100.json')).write_text(json.dumps(coverage,indent=2)+'\n');print('TYPE94_V100_COVERAGE',role,json.dumps(coverage),flush=True)
                channels.append(dict(channel=channel,file=image.filepath_raw,size=[size,size],sha256=hashlib.sha256(Path(image.filepath_raw).read_bytes()).hexdigest(),elapsedSeconds=time.time()-started))
                bpy.data.images.remove(image);print('TYPE94_V100_PROJECTED',role,channel,flush=True)
            report=dict(role=role,referenceSha256=highManifest['sha256'],geometrySha256=geometry['sha256'],preparationSha256=prepare['workBlendSha256'],uvSha256=stage['uvSha256'],coverage=coverage,channels=channels,normalResponse='High runtime normal strength included by Cycles selected-to-active tangent bake; final game normal strength must be1')
            (acc/('Data_GameProjection'+role+'V100.json')).write_text(json.dumps(report,indent=2)+'\n')
    else:
        reports={role:json.loads((acc/('Data_GameProjection'+role+'V100.json')).read_text())for role in roles}
        repair=json.loads((acc/'Data_GameProjectionRepairV100.json').read_text());assert repair['passed']and repair['preparationSha256']==prepare['workBlendSha256']and not repair['pixelApplicationPending']
        assert all(r['coverage']['allPixelsProjected']for r in reports.values()),'Unprojected low texels require an actual-surface repair before finalization'
        for role in roles:
            report=reports[role];assert report['referenceSha256']==highManifest['sha256']and report['preparationSha256']==prepare['workBlendSha256'];material=bpy.data.materials['Material_Type94'+role];tree=material.node_tree;tree.nodes.clear();shader=tree.nodes.new('ShaderNodeBsdfPrincipled');shader.name='Physical '+role;output=tree.nodes.new('ShaderNodeOutputMaterial');tree.links.new(shader.outputs[0],output.inputs['Surface']);nodes={}
            for channel in ['Base','Orm','Normal']:
                record=next(r for r in report['channels']if r['channel']==channel);file=Path(record['file']);assert hashlib.sha256(file.read_bytes()).hexdigest()==record['sha256'];image=bpy.data.images.load(str(file),check_existing=False);image.name='Texture_Type94Game'+role+channel;image.colorspace_settings.name='sRGB'if channel=='Base'else'Non-Color';image.pack();node=tree.nodes.new('ShaderNodeTexImage');node.name='Baked '+channel;node.image=image;nodes[channel]=node
            tree.links.new(nodes['Base'].outputs['Color'],shader.inputs['Base Color']);separate=tree.nodes.new('ShaderNodeSeparateColor');separate.mode='RGB';tree.links.new(nodes['Orm'].outputs['Color'],separate.inputs['Color']);tree.links.new(separate.outputs['Green'],shader.inputs['Roughness']);tree.links.new(separate.outputs['Blue'],shader.inputs['Metallic']);normal=tree.nodes.new('ShaderNodeNormalMap');normal.name='Tangent normal, OpenGL +Y';normal.inputs['Strength'].default_value=1.;tree.links.new(nodes['Normal'].outputs['Color'],normal.inputs['Color']);tree.links.new(normal.outputs['Normal'],shader.inputs['Normal'])
            group=bpy.data.node_groups.get('glTF Material Output')
            if not group:
                from io_scene_gltf2.blender.com.material_helpers import create_settings_group
                group=create_settings_group('glTF Material Output')
            ao=tree.nodes.new('ShaderNodeGroup');ao.name='glTF Material Output';ao.node_tree=group;tree.links.new(separate.outputs['Red'],ao.inputs['Occlusion']);material.use_backface_culling=True
            if role=='Paint':shader.inputs['Coat Weight'].default_value=.1;shader.inputs['Coat Roughness'].default_value=.28;tree.links.new(normal.outputs['Normal'],shader.inputs['Coat Normal'])
        for obj in list(scene.objects):
            if obj.name.startswith('Temporary_'):bpy.data.objects.remove(obj,do_unlink=True)
        for blocks in [bpy.data.meshes,bpy.data.materials,bpy.data.images,bpy.data.node_groups]:
            for block in list(blocks):
                if block.users==0:blocks.remove(block)
        scene['GamePbrProjectionCompleted']=True;scene['GamePbrProjectionAccepted']=False;scene['WholeReferenceAccepted']=False;scene['GameTrialRevision']='GamePbrV100';scene['GamePbrNormalStrength']=1.;scene['GamePbrScope']='Current V99high-to-low projection; final shape/reference acceptance remains open'
        destination=root/'Scene_Type94TanketteGamePbrV100.blend';bpy.ops.wm.save_as_mainfile(filepath=str(destination));asset=bpy.data.objects['Type94Tankette'];Select([asset]+list(asset.children_recursive))
        file=repo/'Taierzhuang1938/_blender/Script_Type94Export.py';spec=importlib.util.spec_from_file_location('ProjectedGameExport',file);exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter);glb=root/'Exports/Model_Type94TanketteGamePbrV100.glb';exporter.ExportGltf(glb)
        report=dict(schema='Type94LatestHighToLowPbrV1',sourceBlend=str(destination),sourceBlendSha256=hashlib.sha256(destination.read_bytes()).hexdigest(),sourceGlb=str(glb),sha256=hashlib.sha256(glb.read_bytes()).hexdigest(),highSha256=highManifest['sha256'],geometrySha256=geometry['sha256'],triangles=geometry['triangles'],freshUv=True,projection=reports,wholeReferenceAccepted=False,gameDerivativeAccepted=False,complete=False)
        (acc/'Data_GamePbrV100.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(triangles=report['triangles'],sha256=report['sha256'],sourceBlendSha256=report['sourceBlendSha256']),indent=2),flush=True)
