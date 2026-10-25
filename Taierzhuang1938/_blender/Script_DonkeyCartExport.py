"""Bake actual editable surfaces to unique UVs and export two runtime skin batches.

Source object material coordinates are preserved as a point attribute before
joining, so grain/fur scale and direction survive batching and UV replacement.
Editable components remain in the external Blender project.
"""
import bpy,math,json,hashlib,struct
import numpy as np
from pathlib import Path
from mathutils import Matrix
from mathutils.bvhtree import BVHTree

scene=bpy.context.scene
assetName=globals().get('DonkeyAssetName','DonkeyCart')
standalone=assetName=='Donkey'
referencePhoto=standalone and bool(scene.get('DonkeyReferencePhotoDetail'))
base=Path(scene['DonkeySourceRoot']) if standalone else Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020')
bakeDir=base/'SourceTextures/Baked';bakeDir.mkdir(parents=True,exist_ok=True)
project=Path(scene['DonkeyCartProject'])
atlasNamespace={}
exec(compile((project/'_blender/Script_DonkeyCartAtlas.py').read_text(encoding='utf-8'),'Script_DonkeyCartAtlas.py','exec'),atlasNamespace)
runtimeCol=bpy.data.collections.get('RuntimeExport')
if runtimeCol:
    for obj in list(runtimeCol.objects):bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.collections.remove(runtimeCol)
runtimeCol=bpy.data.collections.new('RuntimeExport');scene.collection.children.link(runtimeCol)
scene.frame_set(0)
editableSourceTriangles=0
sourceRigs=[bpy.data.objects['DonkeyRig']]
if not standalone:sourceRigs.append(bpy.data.objects['DonkeyCartRig'])
for obj in bpy.data.objects:
    if obj.type=='MESH' and obj.parent in sourceRigs:
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
        if standalone and original.get('coatCardCount'):continue
        if standalone and original.name not in bpy.data.collections['DonkeyEditable'].all_objects:
            raise RuntimeError('Standalone donkey contains a non-animal source: '+original.name)
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
        if standalone:
            furry=obj.data.attributes.get('FurSurface') or obj.data.attributes.new('FurSurface','INT','FACE')
            for face in obj.data.polygons:
                material=obj.data.materials[face.material_index]
                furry.data[face.index].value=int(material.name.startswith(('DonkeyCartGreyCoat','DonkeyLowerLegShortFur','DonkeyCartFaceFur','DonkeyCartEarInterior')))
        if not obj.data.uv_layers.get('UVMap'):obj.data.uv_layers.new(name='UVMap')
        atlasNamespace['AssignAtlasGroup'](obj,label,original.name)
        objects.append(obj)
    Select(objects);bpy.ops.object.join();obj=bpy.context.object
    obj.name='DonkeyRuntime' if label=='Animal' else 'CartRuntime'
    # Joining preserves group membership and one instance of the shared armature.
    for modifier in list(obj.modifiers)[1:]:
        if modifier.type=='ARMATURE':obj.modifiers.remove(modifier)
    if standalone and scene.get('DonkeyReferenceLegSections'):
        # Bake and export the same explicit triangles. A warped quad's UV
        # tessellation must not change between Cycles and the glTF exporter.
        import bmesh
        bm=bmesh.new();bm.from_mesh(obj.data)
        bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY',ngon_method='BEAUTY')
        bm.to_mesh(obj.data);bm.free();obj.data.update()
        obj['runtimeMeshValidated']=bool(obj.data.validate(verbose=False,clean_customdata=False))
        obj.data.update()
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
    Select([obj]);atlasNamespace['AuthorGameUv'](obj,label)
    return rig,obj

animalRig,animal=CloneBatch(bpy.data.objects['DonkeyRig'],'Animal')
batches=[(animalRig,animal,'Animal')]
if not standalone:
    cartRig,cart=CloneBatch(bpy.data.objects['DonkeyCartRig'],'Cart');batches.append((cartRig,cart,'Cart'))
scene.render.engine='CYCLES';scene.cycles.samples=8
scene.render.bake.margin=5;scene.render.bake.use_selected_to_active=False;scene.render.bake.use_clear=True
scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True

def TargetImage(obj,name,size,nonColor=False,alpha=False):
    previous=bpy.data.images.get(name)
    if previous:bpy.data.images.remove(previous,do_unlink=True)
    image=bpy.data.images.new(name,width=size,height=size,alpha=alpha)
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
    baseImage=TargetImage(obj,'Texture_'+assetName+label+'Base',2048 if label=='Animal' else 4096)
    bpy.ops.object.bake(type='DIFFUSE')
    info=[SaveImage(baseImage)]
    normalImage=TargetImage(obj,'Texture_'+assetName+label+'Normal',1024 if label=='Animal' else 2048,True)
    bpy.ops.object.bake(type='NORMAL',normal_space='TANGENT',normal_r='POS_X',normal_g='POS_Y',normal_b='POS_Z')
    info.append(SaveImage(normalImage))
    transferSpecular=standalone and bool(scene.get('DonkeyEyeRevision')) and label=='Animal'
    ormImage=TargetImage(obj,'Texture_'+assetName+label+'Orm',512,True,alpha=transferSpecular)
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
    specularReport=None
    if transferSpecular:
        originalPixels=np.array(ormImage.pixels[:],dtype=np.float32).reshape(512,512,4);originalRgb=np.rint(originalPixels[:,:,:3]*255).astype(np.uint8)
        specularImage=TargetImage(obj,'Texture_'+assetName+label+'SpecularBake',512,True);specularNodes=[];sourceFactors={}
        for sourceMaterial,original,output,emission,combine in restore:
            sourceNodes,sourceLinks=sourceMaterial.node_tree.nodes,sourceMaterial.node_tree.links;sourceShader=next(n for n in sourceNodes if n.type=='BSDF_PRINCIPLED');socket=sourceShader.inputs['Specular IOR Level']
            multiply=sourceNodes.new('ShaderNodeMath');multiply.operation='MULTIPLY';multiply.use_clamp=True;multiply.inputs[1].default_value=2
            multiply.inputs[0].default_value=socket.default_value
            if socket.is_linked:sourceLinks.new(socket.links[0].from_socket,multiply.inputs[0])
            sourceLinks.new(multiply.outputs[0],emission.inputs['Color']);specularNodes.append((sourceMaterial,multiply));sourceFactors[sourceMaterial.name]=min(1,2*socket.default_value) if not socket.is_linked else 'source texture'
        bpy.ops.object.bake(type='EMIT')
        specularPixels=np.array(specularImage.pixels[:],dtype=np.float32).reshape(512,512,4);originalPixels[:,:,3]=specularPixels[:,:,0]
        ormImage.alpha_mode='CHANNEL_PACKED';ormImage.pixels.foreach_set(originalPixels.ravel());ormImage.update()
        check=np.array(ormImage.pixels[:],dtype=np.float32).reshape(512,512,4)
        if not np.array_equal(originalRgb,np.rint(check[:,:,:3]*255).astype(np.uint8)):raise RuntimeError('Specular alpha packing changed ORM RGB')
        for sourceMaterial,node in specularNodes:sourceMaterial.node_tree.nodes.remove(node)
        bpy.data.images.remove(specularImage,do_unlink=True)
        specularReport={'channel':'ORM alpha','encoding':'linear glTF specularFactor = clamp(2 * source Specular IOR Level, 0, 1)','sourceFactors':sourceFactors,'ormRgbUnchanged':True,'runtimeImagesAdded':0}
    info.append(SaveImage(ormImage))
    for mat,original,output,emission,combine in restore:
        mat.node_tree.links.new(original,output.inputs['Surface']);mat.node_tree.nodes.remove(emission);mat.node_tree.nodes.remove(combine)
    mat=bpy.data.materials.new(assetName+label+'Pbr');mat.use_nodes=True;mat.use_backface_culling=True
    nodes,links=mat.node_tree.nodes,mat.node_tree.links;shader=nodes.get('Principled BSDF')
    shader.inputs['Specular IOR Level'].default_value=.18 if label=='Animal' else .20
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='GameUV'
    def Texture(image):
        node=nodes.new('ShaderNodeTexImage');node.image=image;links.new(uv.outputs['UV'],node.inputs['Vector']);return node
    links.new(Texture(baseImage).outputs['Color'],shader.inputs['Base Color'])
    normal=nodes.new('ShaderNodeNormalMap');normal.uv_map='GameUV';links.new(Texture(normalImage).outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],shader.inputs['Normal'])
    separate=nodes.new('ShaderNodeSeparateColor');separate.mode='RGB';links.new(Texture(ormImage).outputs['Color'],separate.inputs['Color'])
    links.new(separate.outputs['Green'],shader.inputs['Roughness']);links.new(separate.outputs['Blue'],shader.inputs['Metallic'])
    obj.data.materials.clear();obj.data.materials.append(mat)
    detail=bpy.data.images.get('Texture_DonkeyCoatDetailNormal') if standalone else None
    detailUv=obj.data.uv_layers.get('FurDetailUV') if detail else None
    detailValues=[tuple(value.uv) for value in detailUv.data] if detailUv else None
    furry=obj.data.attributes.get('FurSurface')
    sourceColors=obj.data.color_attributes.get('CoatColor')
    coatTints=[tuple(min(1,max(0,value*.75/.55)) for value in color.color[:3])+(1,) for color in sourceColors.data] if detailValues and sourceColors and not referencePhoto else None
    if detailValues:
        accessory=mat.copy();accessory.name='DonkeyAccessoryPbr';accessory.use_backface_culling=False;obj.data.materials.append(accessory)
        if transferSpecular:
            accessoryShader=next(n for n in accessory.node_tree.nodes if n.type=='BSDF_PRINCIPLED');accessoryOrm=next(n for n in accessory.node_tree.nodes if n.type=='TEX_IMAGE' and n.image==ormImage)
            scale=accessory.node_tree.nodes.new('ShaderNodeMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=.5
            accessory.node_tree.links.new(accessoryOrm.outputs['Alpha'],scale.inputs[0]);accessory.node_tree.links.new(scale.outputs[0],accessoryShader.inputs['Specular IOR Level'])
        if scene.get('DonkeyReferenceFitRevision'):
            shader.inputs['Specular IOR Level'].default_value=.24
            # glTF sheen has no separate weight. Blender 5.2 exports Tint as
            # sheenColorFactor, so fold the source weight into that colour.
            shader.inputs['Sheen Weight'].default_value=1;shader.inputs['Sheen Roughness'].default_value=.80
            shader.inputs['Sheen Tint'].default_value=(.0056,.0049,.0042,1)
        detailBase=bpy.data.images['Texture_DonkeyCoatDetailBase']
        baseTexture=next(node for node in nodes if node.type=='TEX_IMAGE' and node.image==baseImage)
        if not referencePhoto:baseTexture.image=detailBase
        texture=next(node for node in nodes if node.type=='TEX_IMAGE' and node.image==normalImage);texture.image=detail
        detailCoordinates=nodes.new('ShaderNodeUVMap');detailCoordinates.uv_map='FurDetailUV'
        links.new(detailCoordinates.outputs[0],texture.inputs['Vector']);normal.uv_map='FurDetailUV'
        if not referencePhoto:
            links.new(detailCoordinates.outputs[0],baseTexture.inputs['Vector'])
            paint=nodes.new('ShaderNodeVertexColor');paint.layer_name='RuntimeCoatTint'
            multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
            links.new(baseTexture.outputs['Color'],multiply.inputs[1]);links.new(paint.outputs[0],multiply.inputs[2]);links.new(multiply.outputs[0],shader.inputs['Base Color'])
        normal.inputs['Strength'].default_value=.8 if scene.get('DonkeyReferenceFitRevision') else .65
        info.append(SaveImage(detail))
        if not referencePhoto:info.append(SaveImage(detailBase))
    for face in obj.data.polygons:face.material_index=0 if not detailValues or furry.data[face.index].value else 1
    # Runtime UV0 is the new atlas. Point paint is fully baked into base colour.
    for layer in list(obj.data.uv_layers):
        if layer.name!='GameUV':obj.data.uv_layers.remove(layer)
    obj.data.uv_layers.active.name='UVMap'
    uv.uv_map='UVMap'
    if detailValues:
        layer=obj.data.uv_layers.new(name='FurDetailUV')
        for item,value in zip(layer.data,detailValues):item.uv=value
        normal.uv_map='FurDetailUV'
        # The accessory copy uses only the baked atlas and its UV0 tangents.
        for node in accessory.node_tree.nodes:
            if node.type in ('UVMAP','NORMAL_MAP'):node.uv_map='UVMap'
    else:normal.uv_map='UVMap'
    for attribute in list(obj.data.color_attributes):obj.data.color_attributes.remove(attribute)
    if coatTints:
        tint=obj.data.color_attributes.new(name='RuntimeCoatTint',type='FLOAT_COLOR',domain='CORNER')
        for face in obj.data.polygons:
            for loop in face.loop_indices:
                tint.data[loop].color=coatTints[obj.data.loops[loop].vertex_index] if face.material_index==0 else (1,1,1,1)
    coordinate=obj.data.attributes.get('MaterialCoordinates')
    if coordinate:obj.data.attributes.remove(coordinate)
    coordinate=obj.data.attributes.get('ReferenceCoordinates')
    if coordinate:obj.data.attributes.remove(coordinate)
    coordinate=obj.data.attributes.get('ReferenceViewWeights')
    if coordinate:obj.data.attributes.remove(coordinate)
    grouping=obj.data.attributes.get('AtlasGroup')
    if grouping:obj.data.attributes.remove(grouping)
    if furry:obj.data.attributes.remove(furry)
    if coatTints:
        obj.data.color_attributes.active_color_index=0
        obj.data.color_attributes.render_color_index=0
    obj.data.calc_loop_triangles()
    density=obj['atlasTexelsPerMetre']*(2 if baseImage.size[0]==4096 and label=='Animal' else 1)
    return {'label':label,'meshName':obj.name,'sourceTriangles':obj['sourceTriangles'],'triangles':len(obj.data.loop_triangles),'vertices':len(obj.data.vertices),'budgetSurfaceMaxErrorM':obj.get('budgetSurfaceMaxErrorM',0),'atlasCoverage':obj['atlasCoverage'],'atlasTexelsPerMetre':density,'textures':info,'specularTransfer':specularReport}

reports=[Bake(obj,label) for rig,obj,label in batches]
if standalone and bpy.data.objects.get('DonkeyShortCoatCards'):
    source=bpy.data.objects['DonkeyShortCoatCards']
    if scene.get('DonkeyReferencePaleFringe'):
        namespace={};file=project/'_blender/Script_DonkeyCoat.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace)
        source,fringeReport=namespace['RebuildPaleFringeAfterBake'](bpy.data.objects['DonkeyContinuousSkin'],bpy.data.objects['DonkeyRig'],bpy.data.collections['DonkeyEditable'],source,animal)
        record=json.loads((base/'Data_Derivation.json').read_text(encoding='utf-8'));record['coat'].update(fringeReport);record['referenceFit']['groom'].update(fringeReport)
        (base/'Data_Derivation.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
        reference=json.loads((base/'Data_ReferenceFit.json').read_text(encoding='utf-8'));reference['groom'].update(fringeReport);(base/'Data_ReferenceFit.json').write_text(json.dumps(reference,indent=2)+'\n',encoding='utf-8')
    coat=source.copy();coat.data=source.data.copy();runtimeCol.objects.link(coat);coat.name='DonkeyCoatRuntime';coat.parent=animalRig
    for modifier in coat.modifiers:
        if modifier.type=='ARMATURE':modifier.object=animalRig
    for volumeName in ('DonkeyReferenceManeVolume','DonkeyReferenceTailVolume'):
        volumeSource=bpy.data.objects.get(volumeName)
        if not volumeSource:continue
        volume=volumeSource.copy();volume.data=volumeSource.data.copy();runtimeCol.objects.link(volume);volume.parent=animalRig
        for modifier in volume.modifiers:
            if modifier.type=='ARMATURE':modifier.object=animalRig
        Select([coat,volume],coat);bpy.ops.object.join();coat=bpy.context.object
        if len(coat.data.materials)!=1:raise RuntimeError('Volume groom must share the existing masked coat material')
    coat.data.calc_loop_triangles()
    textures=[]
    for material in coat.data.materials:
        for node in material.node_tree.nodes:
            if node.type=='TEX_IMAGE' and node.image:
                image=node.image;textures.append({'name':image.name,'size':list(image.size),'path':image.filepath_raw,'sha256':hashlib.sha256(Path(image.filepath_raw).read_bytes()).hexdigest()})
    reports.append({'label':'Coat','meshName':coat.name,'sourceTriangles':len(coat.data.loop_triangles),'triangles':len(coat.data.loop_triangles),'vertices':len(coat.data.vertices),
                    'budgetSurfaceMaxErrorM':0,'atlasCoverage':None,'atlasTexelsPerMetre':None,'textures':textures,'uvReuse':'fine fibres, mane tubes, forelock and tail strands sample stable opaque pigment; edge tufts use four cells'})
    batches.append((animalRig,coat,'Coat'))
if standalone and bpy.data.objects.get('DonkeyReferenceMane'):
    source=bpy.data.objects['DonkeyReferenceMane'];mane=source.copy();mane.data=source.data.copy()
    runtimeCol.objects.link(mane);mane.name='DonkeyManeRuntime';mane.parent=animalRig
    for modifier in mane.modifiers:
        if modifier.type=='ARMATURE':modifier.object=animalRig
    mane.data.calc_loop_triangles();textures=[]
    for material in mane.data.materials:
        for node in material.node_tree.nodes:
            if node.type=='TEX_IMAGE' and node.image:
                image=node.image;textures.append({'name':image.name,'size':list(image.size),'path':image.filepath_raw,'sha256':hashlib.sha256(Path(image.filepath_raw).read_bytes()).hexdigest()})
    reports.append({'label':'Mane','meshName':mane.name,'sourceTriangles':len(mane.data.loop_triangles),'triangles':len(mane.data.loop_triangles),'vertices':len(mane.data.vertices),
                    'budgetSurfaceMaxErrorM':0,'atlasCoverage':None,'atlasTexelsPerMetre':None,'textures':textures,'method':'reference-silhouette ribbons, standard BLEND material'})
    batches.append((animalRig,mane,'Mane'))
for rig,obj,label in batches:
    rig.data.pose_position='POSE'
    for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
scene.frame_set(0);Select([obj for rig,mesh,label in batches for obj in (rig,mesh)],animal)
path=base/('Model_'+assetName+'Unpacked.glb')
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
 export_apply=False,export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',
 export_anim_slide_to_zero=True,export_force_sampling=True,export_frame_range=False,
 export_rest_position_armature=True,export_materials='EXPORT',export_extras=True,
 export_vertex_color='ACTIVE' if standalone else 'NONE',export_all_vertex_colors=False,export_image_format='AUTO')
imageDedup=None
if standalone and scene.get('DonkeyEyeRevision'):
    raw=path.read_bytes();jsonLength=struct.unpack_from('<I',raw,12)[0];document=json.loads(raw[20:20+jsonLength]);binary=raw[28+jsonLength:];images=[];aliases={};seen={}
    for index,item in enumerate(document.get('images',[])):
        view=document['bufferViews'][item['bufferView']];offset=view.get('byteOffset',0);content=binary[offset:offset+view['byteLength']];key=(item.get('mimeType'),hashlib.sha256(content).hexdigest())
        if key not in seen:seen[key]=len(images);images.append(item)
        aliases[index]=seen[key]
    imageDedup={'before':len(document.get('images',[])),'after':len(images),'binaryUnchanged':True}
    if len(images)!=len(document.get('images',[])):
        document['images']=images
        for texture in document.get('textures',[]):
            if 'source' in texture:texture['source']=aliases[texture['source']]
        encoded=json.dumps(document,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4)
        body=struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary;path.write_bytes(struct.pack('<III',0x46546c67,2,12+len(body))+body)
report={'path':str(path),'bytes':path.stat().st_size,'batches':reports,'totalTriangles':sum(r['triangles'] for r in reports)}
if imageDedup:report['imageDedup']=imageDedup
(base/'Review/Data_ExportBake.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
for obj in runtimeCol.objects:obj.hide_render=True;obj.hide_set(True)
scene.cycles.samples=32
text=bpy.data.texts.get('Script_DonkeyCartExport.py') or bpy.data.texts.new('Script_DonkeyCartExport.py');text.clear();text.write((project/'_blender/Script_DonkeyCartExport.py').read_text(encoding='utf-8'))
bpy.ops.wm.save_as_mainfile(filepath=str(base/('Scene_'+assetName+'.blend')))
print(json.dumps(report))
if report['totalTriangles']>80000:raise RuntimeError('Donkey-cart exceeds the project vehicle triangle budget')
