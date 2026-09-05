"""Create isolated NRA/IJA research scenes from each original unmodified GLB bind."""
from pathlib import Path
import bpy, json, base64, struct
from mathutils import Matrix, Vector
project=Path(globals().get('INFANTRY_PROJECT',Path(__file__).resolve().parents[1]))
runtime=Path.home()/'Downloads/GVHMR/InfantryActions_20260905'; runtime.mkdir(exist_ok=True)
target=runtime/'Scene_InfantryPreparation.blend'
assert not target.exists(), 'Preparation already exists: reuse rather than overwrite'
assert 'GVHMR' in bpy.data.filepath, 'Do not replace another task scene'
bpy.ops.wm.save_as_mainfile(filepath=str(target))
for o in list(bpy.data.objects): bpy.data.objects.remove(o,do_unlink=True)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
oldScenes=list(bpy.data.scenes)
report={}
def Material(name,color,metal=0):
    mat=bpy.data.materials.new(name); mat.diffuse_color=(*color,1);mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(*color,1)
    bsdf.inputs['Roughness'].default_value=.74;bsdf.inputs['Metallic'].default_value=metal
    return mat
def Decode(data,kind):
    raw=base64.b64decode(data);return struct.unpack('<'+kind*(len(raw)//struct.calcsize(kind)),raw)
for faction in ['Nra','Ija']:
    scene=bpy.data.scenes.new('Scene_'+faction+'InfantryActions');bpy.context.window.scene=scene
    scene.unit_settings.system='METRIC'
    source=project/f'Model/Character/Model_Lugou{faction}01.glb'
    bpy.ops.import_scene.gltf(filepath=str(source))
    arm=next(o for o in scene.objects if o.type=='ARMATURE');body=next(o for o in scene.objects if o.type=='MESH')
    arm.name='Rig_'+faction+'Infantry';body.name='Model_'+faction+'InfantryBody'
    for o in scene.objects:
        if o.animation_data: o.animation_data_clear()
    for b in arm.pose.bones: b.matrix_basis=Matrix.Identity(4);b.rotation_mode='QUATERNION'
    bpy.context.view_layer.update()
    for mat in body.data.materials:
        if mat and mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type=='BSDF_PRINCIPLED':
                    for link in list(node.inputs['Metallic'].links): mat.node_tree.links.remove(link)
                    node.inputs['Metallic'].default_value=0;node.inputs['Roughness'].default_value=.72
    report[faction]={'armatureWorld':[list(row) for row in arm.matrix_world],
       'bones':[{'name':b.name,'parent':b.parent.name if b.parent else None,'matrixLocal':[list(row) for row in b.matrix_local]} for b in arm.data.bones],
       'source':str(source),'body':body.name,'armature':arm.name}
    # Preserve the full original bone hierarchy; props are separate editable scene objects.
    rifle=bpy.data.objects.new('Socket_'+faction+'InfantryRifle',None);scene.collection.objects.link(rifle)
    prefix='Bip002 ' if faction=='Nra' else 'Bip001 '
    rifle.parent=arm;rifle.parent_type='BONE';rifle.parent_bone=prefix+'Spine2'
    rifle.matrix_basis=Matrix.Identity(4);bpy.context.view_layer.update()
    rifle['parentRestWorld']=[v for row in rifle.matrix_world for v in row]
    data=json.loads((project/('Model/ZhongZheng.tzm.json' if faction=='Nra' else 'Model/Type38.tzm.json')).read_text())
    rifle['weapon']=data['name'];rifle['gripL']=next(n['t'] for n in data['nodes'] if n['name']=='gripL')
    materials={k:Material('Material_'+faction+k,c,.75 if k=='steel' else 0) for k,c in [('wood',(.16,.07,.03)),('steel',(.08,.09,.1))]}
    for key,mat in materials.items():
        image=bpy.data.images.load(str(project/('Texture/Texture_Weapon'+key.title()+'V2Base.webp')),check_existing=True)
        tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
        mat.node_tree.links.new(tex.outputs['Color'],mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    meshIndices=[i for n in data['nodes'] if n['name'] in ['body','adsNear'] for i in n.get('meshes',[])]
    for index in meshIndices:
        block=data['meshes'][index];q=Decode(block['pos'],'H');uv=Decode(block['uv'],'H');ids=Decode(block['idx'],'I' if block['idxBits']==32 else 'H')
        vertices=[tuple(block['posMin'][j]+q[i*3+j]*block['posScale'][j] for j in range(3)) for i in range(block['count'])]
        mesh=bpy.data.meshes.new('Mesh_'+faction+'Rifle'+str(index));mesh.from_pydata(vertices,[],[ids[i:i+3] for i in range(0,len(ids),3)]);mesh.update()
        layer=mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops:
            i=loop.vertex_index;layer.data[loop.index].uv=(block['uvMin'][0]+uv[i*2]*block['uvScale'][0],block['uvMin'][1]+uv[i*2+1]*block['uvScale'][1])
        obj=bpy.data.objects.new('Model_'+faction+'Rifle'+str(index),mesh);scene.collection.objects.link(obj);obj.parent=rifle
        obj.data.materials.append(materials[block['material']]);[setattr(p,'use_smooth',True) for p in mesh.polygons]
    # Park the rifle at the chest until measured hand poses are available.
    desired=Matrix(((1,0,0,0),(0,0,1,-.25),(0,1,0,1.15),(0,0,0,1)))
    # The proper (+determinant) firearm orientation will be solved from both grips during baking.
    rifle.matrix_basis=rifle.matrix_world.inverted()@desired
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.002));floor=bpy.context.object;floor.name='Scene_'+faction+'Floor'
    floor.data.materials.append(Material('Material_'+faction+'Floor',(.075,.088,.10)))
    world=bpy.data.worlds.new('World_'+faction+'Studio');world.use_nodes=True
    world.node_tree.nodes['Background'].inputs['Color'].default_value=(.23,.27,.31,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6;scene.world=world
    for label,position,power,size in [('Key',(-3,-4,5),700,4),('Fill',(4,-1,3),500,3),('Rim',(0,4,4),800,3)]:
        lampData=bpy.data.lights.new('Scene_'+faction+label,'AREA');lampData.energy=power;lampData.shape='DISK';lampData.size=size
        lamp=bpy.data.objects.new(lampData.name,lampData);scene.collection.objects.link(lamp);lamp.location=position
        lamp.rotation_euler=(Vector((0,0,1))-lamp.location).to_track_quat('-Z','Y').to_euler()
    for label,position in [('ThreeQuarter',(-3.2,-4,1.6)),('Side',(4,0,1.35)),('Back',(0,4,1.4))]:
        cameraData=bpy.data.cameras.new('Scene_'+faction+label);cameraData.type='ORTHO';cameraData.ortho_scale=2.25
        camera=bpy.data.objects.new(cameraData.name,cameraData);scene.collection.objects.link(camera);camera.location=position
        camera.rotation_euler=(Vector((0,0,.92))-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.camera=bpy.data.objects['Scene_'+faction+'ThreeQuarter'];scene.render.engine='BLENDER_EEVEE'
    scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
    scene.render.fps=60;scene.render.fps_base=1;scene.view_settings.view_transform='AgX';scene.sync_mode='FRAME_DROP'
    scene['taskState']='Original rig preparation; new source recovery pending'
for s in oldScenes: bpy.data.scenes.remove(s)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
for img in bpy.data.images:
    if img.source=='FILE' and img.has_data and not img.packed_file: img.pack()
for txt in list(bpy.data.texts): bpy.data.texts.remove(txt)
bpy.context.window.scene=bpy.data.scenes['Scene_NraInfantryActions']
(runtime/'Data_OriginalSkeletons.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True)
print('Prepared',[(key,len(value['bones'])) for key,value in report.items()],str(target))
