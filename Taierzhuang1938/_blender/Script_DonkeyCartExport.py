"""Bake actual editable surfaces to unique UVs and export two runtime skin batches.

Source object material coordinates are preserved as a point attribute before
joining, so grain/fur scale and direction survive batching and UV replacement.
The original 457 editable components remain in the external Blender project.
"""
import bpy,math,json,hashlib
from pathlib import Path
from mathutils import Matrix
from mathutils.bvhtree import BVHTree

scene=bpy.context.scene
base=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020')
bakeDir=base/'SourceTextures/Baked';bakeDir.mkdir(parents=True,exist_ok=True)
project=Path(scene['DonkeyCartProject'])
runtimeCol=bpy.data.collections.get('RuntimeExport')
if runtimeCol:
    for obj in list(runtimeCol.objects):bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.collections.remove(runtimeCol)
runtimeCol=bpy.data.collections.new('RuntimeExport');scene.collection.children.link(runtimeCol)
scene.frame_set(0)
editableSourceTriangles=0
for obj in bpy.data.objects:
    if obj.type=='MESH' and obj.parent in (bpy.data.objects['DonkeyRig'],bpy.data.objects['DonkeyCartRig']):
        obj.data.calc_loop_triangles();editableSourceTriangles+=len(obj.data.loop_triangles)

def Select(objects,active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.hide_set(False);obj.select_set(True)
    bpy.context.view_layer.objects.active=active or objects[0]

materialCopies={}
def CopyMaterial(source):
    if source.name in materialCopies:return materialCopies[source.name]
    mat=source.copy();mat.name=source.name+'BakeSource';nodes,links=mat.node_tree.nodes,mat.node_tree.links
    coordinate=nodes.new('ShaderNodeAttribute');coordinate.attribute_name='MaterialCoordinates'
    for link in list(links):
        if link.from_node.type=='TEX_COORD' and link.from_socket.name=='Object':
            target=link.to_socket;links.remove(link);links.new(coordinate.outputs['Vector'],target)
    for node in list(nodes):
        if node.type=='TEX_IMAGE' and not node.inputs['Vector'].is_linked:
            uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap';links.new(uv.outputs['UV'],node.inputs['Vector'])
    materialCopies[source.name]=mat
    return mat

def CloneBatch(sourceRig,label):
    rig=sourceRig.copy();rig.data=sourceRig.data.copy();runtimeCol.objects.link(rig)
    rig.name='DonkeySkeleton' if label=='Animal' else 'CartSkeleton'
    rig.data.pose_position='REST'
    objects=[]
    for original in list(bpy.data.objects):
        if original.type!='MESH' or original.parent!=sourceRig:continue
        obj=original.copy();obj.data=original.data.copy();runtimeCol.objects.link(obj)
        obj.name=original.name+'Export';obj.parent=rig
        coords=obj.data.attributes.get('MaterialCoordinates') or obj.data.attributes.new('MaterialCoordinates','FLOAT_VECTOR','POINT')
        for v in obj.data.vertices:coords.data[v.index].vector=v.co
        for slot in obj.material_slots:
            if slot.material:slot.material=CopyMaterial(slot.material)
        for modifier in obj.modifiers:
            if modifier.type=='ARMATURE':modifier.object=rig
        Select([obj])
        for modifier in list(obj.modifiers):
            if modifier.type!='ARMATURE':bpy.ops.object.modifier_apply(modifier=modifier.name)
        if not obj.data.uv_layers.get('UVMap'):obj.data.uv_layers.new(name='UVMap')
        objects.append(obj)
    Select(objects);bpy.ops.object.join();obj=bpy.context.object
    obj.name='DonkeyRuntime' if label=='Animal' else 'CartRuntime'
    # Joining preserves group membership and one instance of the shared armature.
    for modifier in list(obj.modifiers)[1:]:
        if modifier.type=='ARMATURE':obj.modifiers.remove(modifier)
    obj.data.calc_loop_triangles();obj['sourceTriangles']=len(obj.data.loop_triangles)
    # Preserve the animal's anatomy and all editable source detail. If the whole
    # asset exceeds the vehicle budget, reduce only runtime bevel/rivet density.
    if label=='Cart' and editableSourceTriangles>80000:
        sourcePoints=[v.co.copy() for v in obj.data.vertices]
        sourceTree=BVHTree.FromPolygons(sourcePoints,[tuple(p.vertices) for p in obj.data.polygons],all_triangles=False)
        animalTriangles=editableSourceTriangles-obj['sourceTriangles']
        ratio=min(.90,(79500-animalTriangles)/obj['sourceTriangles'])
        if ratio<.55:raise RuntimeError('Cart reduction would threaten the authored silhouette')
        decimate=obj.modifiers.new('RuntimeCartBudget','DECIMATE');decimate.ratio=ratio
        decimate.use_collapse_triangulate=True
        while obj.modifiers[0]!=decimate:bpy.ops.object.modifier_move_up(modifier=decimate.name)
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=decimate.name)
        targetTree=BVHTree.FromPolygons([v.co for v in obj.data.vertices],[tuple(p.vertices) for p in obj.data.polygons],all_triangles=False)
        distances=[targetTree.find_nearest(p)[3] for p in sourcePoints]+[sourceTree.find_nearest(v.co)[3] for v in obj.data.vertices]
        obj['budgetSurfaceMaxErrorM']=max(distances)
        if max(distances)>.005:raise RuntimeError('Runtime cart simplification changes its surface by more than 5 mm')
    uv=obj.data.uv_layers.get('GameUV') or obj.data.uv_layers.new(name='GameUV')
    obj.data.uv_layers.active=uv;uv.active_render=True
    Select([obj]);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.0035,area_weight=.12,correct_aspect=True,scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig,obj

animalRig,animal=CloneBatch(bpy.data.objects['DonkeyRig'],'Animal')
cartRig,cart=CloneBatch(bpy.data.objects['DonkeyCartRig'],'Cart')
scene.render.engine='CYCLES';scene.cycles.samples=8
scene.render.bake.margin=5;scene.render.bake.use_selected_to_active=False;scene.render.bake.use_clear=True
scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True

def TargetImage(obj,name,size,nonColor=False):
    image=bpy.data.images.new(name,width=size,height=size,alpha=False)
    image.colorspace_settings.name='Non-Color' if nonColor else 'sRGB'
    image.file_format='PNG';image.filepath_raw=str(bakeDir/(name+'.png'))
    for mat in obj.data.materials:
        node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=image
        mat.node_tree.nodes.active=node
        for other in mat.node_tree.nodes:other.select=other==node
    return image

def SaveImage(image):
    image.save();image.pack()
    return {'name':image.name,'size':list(image.size),'path':image.filepath_raw,'sha256':hashlib.sha256(Path(image.filepath_raw).read_bytes()).hexdigest()}

def Bake(obj,label):
    Select([obj])
    baseImage=TargetImage(obj,'Texture_DonkeyCart'+label+'Base',2048)
    bpy.ops.object.bake(type='DIFFUSE')
    info=[SaveImage(baseImage)]
    normalImage=TargetImage(obj,'Texture_DonkeyCart'+label+'Normal',1024,True)
    bpy.ops.object.bake(type='NORMAL',normal_space='TANGENT',normal_r='POS_X',normal_g='POS_Y',normal_b='POS_Z')
    info.append(SaveImage(normalImage))
    ormImage=TargetImage(obj,'Texture_DonkeyCart'+label+'Orm',512,True)
    restore=[]
    for mat in obj.data.materials:
        nodes,links=mat.node_tree.nodes,mat.node_tree.links
        shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
        output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
        original=next(l.from_socket for l in links if l.to_node==output and l.to_socket.name=='Surface')
        emission=nodes.new('ShaderNodeEmission');combine=nodes.new('ShaderNodeCombineColor');combine.mode='RGB'
        combine.inputs[0].default_value=1
        combine.inputs[1].default_value=shader.inputs['Roughness'].default_value
        combine.inputs[2].default_value=shader.inputs['Metallic'].default_value
        if shader.inputs['Roughness'].is_linked:links.new(shader.inputs['Roughness'].links[0].from_socket,combine.inputs[1])
        if shader.inputs['Metallic'].is_linked:links.new(shader.inputs['Metallic'].links[0].from_socket,combine.inputs[2])
        links.new(combine.outputs['Color'],emission.inputs['Color']);links.new(emission.outputs['Emission'],output.inputs['Surface'])
        restore.append((mat,original,output,emission,combine))
    bpy.ops.object.bake(type='EMIT')
    info.append(SaveImage(ormImage))
    for mat,original,output,emission,combine in restore:
        mat.node_tree.links.new(original,output.inputs['Surface']);mat.node_tree.nodes.remove(emission);mat.node_tree.nodes.remove(combine)
    mat=bpy.data.materials.new('DonkeyCart'+label+'Pbr');mat.use_nodes=True;mat.use_backface_culling=True
    nodes,links=mat.node_tree.nodes,mat.node_tree.links;shader=nodes.get('Principled BSDF')
    if label=='Animal':shader.inputs['Specular IOR Level'].default_value=.22
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='GameUV'
    def Texture(image):
        node=nodes.new('ShaderNodeTexImage');node.image=image;links.new(uv.outputs['UV'],node.inputs['Vector']);return node
    links.new(Texture(baseImage).outputs['Color'],shader.inputs['Base Color'])
    normal=nodes.new('ShaderNodeNormalMap');normal.uv_map='GameUV';links.new(Texture(normalImage).outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],shader.inputs['Normal'])
    separate=nodes.new('ShaderNodeSeparateColor');separate.mode='RGB';links.new(Texture(ormImage).outputs['Color'],separate.inputs['Color'])
    links.new(separate.outputs['Green'],shader.inputs['Roughness']);links.new(separate.outputs['Blue'],shader.inputs['Metallic'])
    obj.data.materials.clear();obj.data.materials.append(mat)
    for face in obj.data.polygons:face.material_index=0
    # Runtime UV0 is the new atlas. Point paint is fully baked into base colour.
    for layer in list(obj.data.uv_layers):
        if layer.name!='GameUV':obj.data.uv_layers.remove(layer)
    obj.data.uv_layers.active.name='UVMap'
    uv.uv_map='UVMap';normal.uv_map='UVMap'
    for attribute in list(obj.data.color_attributes):obj.data.color_attributes.remove(attribute)
    coordinate=obj.data.attributes.get('MaterialCoordinates')
    if coordinate:obj.data.attributes.remove(coordinate)
    obj.data.calc_loop_triangles()
    return {'label':label,'sourceTriangles':obj['sourceTriangles'],'triangles':len(obj.data.loop_triangles),'vertices':len(obj.data.vertices),'budgetSurfaceMaxErrorM':obj.get('budgetSurfaceMaxErrorM',0),'textures':info}

reports=[Bake(animal,'Animal'),Bake(cart,'Cart')]
for rig in (animalRig,cartRig):
    rig.data.pose_position='POSE'
    for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
scene.frame_set(0);Select([animalRig,animal,cartRig,cart],animal)
path=base/'Model_DonkeyCartUnpacked.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
 export_apply=False,export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',
 export_anim_slide_to_zero=True,export_force_sampling=True,export_frame_range=False,
 export_rest_position_armature=True,export_materials='EXPORT',export_extras=True,
 export_vertex_color='NONE',export_all_vertex_colors=False,export_image_format='AUTO')
report={'path':str(path),'bytes':path.stat().st_size,'batches':reports,'totalTriangles':sum(r['triangles'] for r in reports)}
(base/'Review/Data_ExportBake.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
for obj in runtimeCol.objects:obj.hide_render=True;obj.hide_set(True)
scene.cycles.samples=32
text=bpy.data.texts.get('Script_DonkeyCartExport.py') or bpy.data.texts.new('Script_DonkeyCartExport.py');text.clear();text.write((project/'_blender/Script_DonkeyCartExport.py').read_text(encoding='utf-8'))
bpy.ops.wm.save_as_mainfile(filepath=str(base/'Scene_DonkeyCart.blend'))
print(json.dumps(report))
if report['totalTriangles']>80000:raise RuntimeError('Donkey-cart exceeds the project vehicle triangle budget')
