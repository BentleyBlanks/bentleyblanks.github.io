"""Bake Luo's editable Blender materials and export one self-contained GLB.

Invoke after Build and Validate through BlenderMCP. The editable source is kept;
the baked, three-material source is saved separately beside it. No reference images
or QA renders are copied into the public repository.
"""
import bpy,json,struct,hashlib,math,subprocess
from pathlib import Path
from mathutils import Matrix
cfg=globals().get('LUO_CONFIG',{})
repo=Path(cfg.get('repo',Path(__file__).resolve().parents[2]))
out=Path(cfg.get('output',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/LuoReference_20260929'))
assert bpy.data.filepath.replace('\\','/')==str(out/'Model_LuoReference.blend').replace('\\','/'),bpy.data.filepath
textures=out/'Textures';textures.mkdir(exist_ok=True)
rig=bpy.data.objects['Rig_LuoReference'];rig.data.pose_position='POSE';bpy.context.scene.frame_set(1);bpy.context.view_layer.update()
poseTransforms={p.name:p.matrix@p.bone.matrix_local.inverted() for p in rig.pose.bones}
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8
scene.render.bake.use_selected_to_active=False;scene.render.bake.margin=12
objects=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('Mesh_Luo')]
groups={'Skin':[],'Uniform':[],'Equipment':[]}
for obj in objects:
    if any(s in obj.name for s in ['Head','Hands','Eyes','Oral','Ankle']):key='Skin'
    elif any(s in obj.name for s in ['Ammo','Pouch','Sling','Pack','Haversack','Blanket','Canteen','Dadao','Scabbard','Belt']):key='Equipment'
    else:key='Uniform'
    groups[key].append(obj)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    # Freeze the evaluated authoring pose, including subdivision AFTER skinning.
    # Applying subdivision in T bind changes the cloth at the armpits; removing
    # it exposes the inverse-skin cage. Both differ from the reviewed source.
    dg=bpy.context.evaluated_depsgraph_get()
    frozen=bpy.data.meshes.new_from_object(obj.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg)
    obj.data=frozen
    for mod in list(obj.modifiers):obj.modifiers.remove(mod)
    obj.data.calc_loop_triangles()
    limit=80000 if obj.name=='Mesh_LuoTunic' else (18000 if obj.name.startswith(('Mesh_LuoTrousers','Mesh_LuoCapCrown')) else (10000 if obj.name=='Mesh_LuoBlanketRoll' else (6500 if obj.name=='Mesh_LuoHaversack' else None)))
    if limit and len(obj.data.loop_triangles)>limit:
        decimate=obj.modifiers.new('ExportSurfaceReduction','DECIMATE');decimate.ratio=limit/len(obj.data.loop_triangles);decimate.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=decimate.name)
    uv=obj.data.uv_layers.get('UV_Reference') or obj.data.uv_layers.active
    if uv:uv.name='UV_Reference'
    for material in obj.data.materials:
        if not material.use_nodes:continue
        nodes=material.node_tree.nodes;links=material.node_tree.links
        for node in nodes:
            if node.type=='UVMAP' and node.uv_map not in ['UV_Reference','UV_Side','UV_Back']:node.uv_map='UV_Reference'
        coord=nodes.get('LuoReferenceUv')
        if not coord:coord=nodes.new('ShaderNodeUVMap');coord.name='LuoReferenceUv';coord.uv_map='UV_Reference'
        for node in list(nodes):
            if node.type=='TEX_IMAGE' and not node.get('LuoPreserveVector') and (not node.inputs['Vector'].is_linked or node.inputs['Vector'].links[0].from_node.type!='UVMAP'):links.new(coord.outputs['UV'],node.inputs['Vector'])

report={'materials':{},'sourceBlend':str(out/'Model_LuoReference.blend')}
for key,members in groups.items():
    print('Bake group',key,len(members),flush=True)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in members:obj.select_set(True)
    obj=members[0];bpy.context.view_layer.objects.active=obj;bpy.ops.object.join();obj.name='Mesh_Luo'+key
    uv=obj.data.uv_layers.new(name='UV_Atlas');obj.data.uv_layers.active=uv;uv.active_render=True
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.001,area_weight=.5,correct_aspect=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    maps={}
    for channel,bakeType in [('Base','EMIT'),('Normal','NORMAL'),('Roughness','ROUGHNESS')]:
        resolution=2048 if key=='Skin' else 4096
        image=bpy.data.images.new('Texture_Luo'+key+channel,width=resolution,height=resolution,alpha=False)
        image.generated_color=((.5,.5,1,1) if channel=='Normal' else ((1,1,1,1) if channel=='Roughness' else ((.15,.16,.17,1) if key=='Uniform' else (.2,.17,.13,1))))
        if channel!='Base':image.colorspace_settings.name='Non-Color'
        restore=[]
        for material in obj.data.materials:
            material.use_nodes=True;node=material.node_tree.nodes.new('ShaderNodeTexImage');node.name='LuoBakeTarget';node.image=image
            material.node_tree.nodes.active=node;node.select=True
            if channel=='Base':
                nt=material.node_tree;bs=next(n for n in nt.nodes if n.type=='BSDF_PRINCIPLED');output=next(n for n in nt.nodes if n.type=='OUTPUT_MATERIAL')
                old=output.inputs['Surface'].links[0].from_socket if output.inputs['Surface'].is_linked else None
                emission=nt.nodes.new('ShaderNodeEmission');emission.inputs['Strength'].default_value=1
                if bs.inputs['Base Color'].is_linked:nt.links.new(bs.inputs['Base Color'].links[0].from_socket,emission.inputs['Color'])
                else:emission.inputs['Color'].default_value=bs.inputs['Base Color'].default_value
                nt.links.new(emission.outputs[0],output.inputs['Surface']);restore.append((nt,output,old,emission))
        kwargs={'type':bakeType,'use_clear':False,'margin':4}
        if bakeType=='DIFFUSE':kwargs['pass_filter']={'COLOR'}
        bpy.ops.object.bake(**kwargs)
        for nt,output,old,emission in restore:
            nt.nodes.remove(emission)
            if old:nt.links.new(old,output.inputs['Surface'])
        image.filepath_raw=str(textures/(image.name+'.png'));image.file_format='PNG';image.save();image.pack();maps[channel]=image
        for material in obj.data.materials:
            for node in list(material.node_tree.nodes):
                if node.name.startswith('LuoBakeTarget'):material.node_tree.nodes.remove(node)
        print('Baked',key,channel,flush=True)
    material=bpy.data.materials.new('Material_Luo'+key+'Pbr');material.use_nodes=True
    nodes=material.node_tree.nodes;links=material.node_tree.links;bs=nodes.get('Principled BSDF')
    for channel,image in maps.items():
        tex=nodes.new('ShaderNodeTexImage');tex.image=image
        if channel=='Base':links.new(tex.outputs['Color'],bs.inputs['Base Color'])
        elif channel=='Roughness':links.new(tex.outputs['Color'],bs.inputs['Roughness'])
        else:
            normal=nodes.new('ShaderNodeNormalMap');links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs[0],bs.inputs['Normal'])
    obj.data.materials.clear();obj.data.materials.append(material)
    for poly in obj.data.polygons:poly.material_index=0
    # Remove the authoring UV only after all source materials have been baked.
    for layer in list(obj.data.uv_layers):
        if layer.name!='UV_Atlas':obj.data.uv_layers.remove(layer)
    obj.data.calc_loop_triangles()
    report['materials'][key]={'vertices':len(obj.data.vertices),'triangles':len(obj.data.loop_triangles),'resolution':[resolution,resolution],'textures':[im.name for im in maps.values()]}
    # Bake in the reviewed pose, then inverse-skin with exactly the normalized
    # four influences that glTF will carry. The common armature bind is untouched.
    localSkin={name:obj.matrix_world.inverted()@rig.matrix_world@matrix@rig.matrix_world.inverted()@obj.matrix_world for name,matrix in poseTransforms.items()}
    normalMesh=bpy.data.meshes.new('LuoPoseNormals')
    normalMesh.from_pydata([v.co.copy() for v in obj.data.vertices],[],[list(p.vertices) for p in obj.data.polygons])
    for target,source in zip(normalMesh.polygons,obj.data.polygons):target.use_smooth=source.use_smooth
    normalMesh.update();posedNormals=[n.vector.copy() for n in normalMesh.corner_normals];bpy.data.meshes.remove(normalMesh)
    inverseMatrices=[];rebindError=0
    for vertex in obj.data.vertices:
        weights=sorted([(g.group,g.weight) for g in vertex.groups if obj.vertex_groups[g.group].name in localSkin and g.weight>1e-8],key=lambda w:w[1],reverse=True)[:4]
        assert weights,('Unweighted baked vertex',key,vertex.index)
        total=sum(w for _,w in weights);weights=[(i,w/total) for i,w in weights]
        keep={i for i,_ in weights}
        for group in list(vertex.groups):
            if group.group not in keep:obj.vertex_groups[group.group].remove([vertex.index])
        matrix=Matrix(((0,0,0,0),)*4)
        for index,weight in weights:
            obj.vertex_groups[index].add([vertex.index],weight,'REPLACE')
            matrix+=localSkin[obj.vertex_groups[index].name]*weight
        inverse=matrix.inverted();inverseMatrices.append(inverse.to_3x3())
        posed=vertex.co.copy();vertex.co=inverse@posed
        rebindError=max(rebindError,(matrix@vertex.co-posed).length)
    report['materials'][key]['maximumPoseRebindError']=rebindError
    assert rebindError<.00001,(key,rebindError)
    # glTF linearly skins normals too. Normals recomputed on the inverse-skinned
    # cage produce black wedges where cloth blends between torso and upper arm.
    # Inverse-transform the reviewed posed normals along with the positions.
    obj.data.normals_split_custom_set([(inverseMatrices[loop.vertex_index]@posedNormals[loop.index]).normalized() for loop in obj.data.loops])
    mod=obj.modifiers.new('SharedNraSkin','ARMATURE');mod.object=rig
rig.data.pose_position='POSE';scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'Model_LuoReferenceBaked.blend'))
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for name in ['Mesh_LuoSkin','Mesh_LuoUniform','Mesh_LuoEquipment']:bpy.data.objects[name].select_set(True)
bpy.context.view_layer.objects.active=rig
destination=repo/'Taierzhuang1938/Model/Character/Model_TengxianLuoReference.glb'
bpy.ops.export_scene.gltf(filepath=str(destination),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_extras=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_rest_position_armature=True,export_all_influences=False)
raw=destination.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=raw[28+n:]
base=(repo/'Taierzhuang1938/Model/Character/Model_TengxianNra05Facial.glb').read_bytes();n=struct.unpack_from('<I',base,12)[0];sourceDoc=json.loads(base[20:20+n])
doc.setdefault('extras',{})['sharedHumanoid']=sourceDoc['extras']['sharedHumanoid']
doc['extras']['facialRig']=sourceDoc['extras']['facialRig'];doc['extras']['facialRig']['source']='Model_LuoReference.blend';doc['extras']['facialRig']['materialsFrom']='self';doc['extras']['facialRig']['animationsFrom']='self'
doc['extras']['referenceCharacter']={'name':'Luo Maocai','reference':'User three-view, 2026-09-29','skeletonSource':'Model_TengxianNra05Facial.glb','bodyBones':53,'faceBones':13}
data=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode('utf8');data+=b' '*((-len(data))%4)
destination.write_bytes(struct.pack('<III',0x46546C67,2,28+len(data)+len(binary))+struct.pack('<II',len(data),0x4E4F534A)+data+struct.pack('<II',len(binary),0x004E4942)+binary)
subprocess.run([cfg.get('python','python'),str(repo/'Taierzhuang1938/_blender/Script_PackLuoTextures.py')],check=True)
packed=destination.read_bytes();packedSize=struct.unpack_from('<I',packed,12)[0]
report['packedTextures']=json.loads(packed[20:20+packedSize])['extras']['packedTextures']
report['glb']={'path':str(destination),'bytes':destination.stat().st_size,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()}
(out/'Data_LuoExport.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report,indent=2))
