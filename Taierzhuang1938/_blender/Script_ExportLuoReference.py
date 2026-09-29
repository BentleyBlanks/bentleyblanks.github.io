"""Bake Luo's editable Blender materials and export one self-contained GLB.

Invoke after Build and Validate through BlenderMCP. The editable source is kept;
the baked, three-material source is saved separately beside it. No reference images
or QA renders are copied into the public repository.
"""
import bpy,json,struct,hashlib,math
from pathlib import Path
cfg=globals().get('LUO_CONFIG',{})
repo=Path(cfg.get('repo',Path(__file__).resolve().parents[2]))
out=Path(cfg.get('output',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/LuoReference_20260929'))
assert bpy.data.filepath.replace('\\','/')==str(out/'Model_LuoReference.blend').replace('\\','/'),bpy.data.filepath
textures=out/'Textures';textures.mkdir(exist_ok=True)
rig=bpy.data.objects['Rig_LuoReference'];rig.data.pose_position='REST'
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8
scene.render.bake.use_selected_to_active=False;scene.render.bake.margin=12
objects=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('Mesh_Luo')]
groups={'Skin':[],'Uniform':[],'Equipment':[]}
for obj in objects:
    if any(s in obj.name for s in ['Head','Hands','Eyes','Oral']):key='Skin'
    elif any(s in obj.name for s in ['Ammo','Pouch','Sling','Pack','Haversack','Blanket','Canteen','Dadao','Scabbard','Belt','Button']):key='Equipment'
    else:key='Uniform'
    groups[key].append(obj)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    for mod in list(obj.modifiers):
        if mod.type!='ARMATURE':bpy.ops.object.modifier_apply(modifier=mod.name)
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
            if node.type=='TEX_IMAGE' and (not node.inputs['Vector'].is_linked or node.inputs['Vector'].links[0].from_node.type!='UVMAP'):links.new(coord.outputs['UV'],node.inputs['Vector'])

report={'materials':{},'sourceBlend':str(out/'Model_LuoReference.blend')}
for key,members in groups.items():
    print('Bake group',key,len(members),flush=True)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in members:obj.select_set(True)
    obj=members[0];bpy.context.view_layer.objects.active=obj;bpy.ops.object.join();obj.name='Mesh_Luo'+key
    uv=obj.data.uv_layers.new(name='UV_Atlas');obj.data.uv_layers.active=uv;uv.active_render=True
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.008,area_weight=.5,correct_aspect=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    maps={}
    for channel,bakeType in [('Base','EMIT'),('Normal','NORMAL'),('Roughness','ROUGHNESS')]:
        image=bpy.data.images.new('Texture_Luo'+key+channel,width=2048,height=2048,alpha=False)
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
        kwargs={'type':bakeType,'use_clear':True,'margin':12}
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
    report['materials'][key]={'vertices':len(obj.data.vertices),'triangles':len(obj.data.loop_triangles),'textures':[im.name for im in maps.values()]}
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
report['glb']={'path':str(destination),'bytes':destination.stat().st_size,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()}
(out/'Data_LuoExport.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report,indent=2))
