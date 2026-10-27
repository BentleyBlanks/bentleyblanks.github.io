"""Unique-UV macro occlusion, retaining UV0 and all existing material pixels.

Called by the Ki-4 builder after author geometry/material creation. Fixed parts
occlude fixed parts; each moving rigid group is baked only against itself.
Small rivet heads retain their real geometry and inherit a per-head visibility
sample in a reserved atlas strip. Their existing aluminum micro-AO is exactly1.
"""
import bpy,bmesh,math,json,pathlib,hashlib,time,os
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

aoUvName='GeometryAO'
aoImageName='Texture_Ki4GeometryAo'
aoStrip=.05

def AoMovingGroup(obj):
    parent=obj.parent
    while parent:
        if parent.name.startswith('Pivot_'):return parent.name
        parent=parent.parent
    return 'Fixed'

def AoGlass(obj):
    return any(mat and 'Windscreen' in mat.name for mat in obj.data.materials)

def AoUvHash(mesh):
    values=np.empty(len(mesh.loops)*2,dtype=np.float32);mesh.uv_layers[0].data.foreach_get('uv',values)
    return hashlib.sha256(values.tobytes()).hexdigest()

def AoRivetUv(index,count=1512):
    columns=84;rows=math.ceil(count/columns)
    return ((index%columns+.5)/columns,aoStrip*(index//columns+.5)/rows)

def AssignRivetAoUv(mesh,world,descriptors):
    tree=KDTree(len(descriptors))
    for i,descriptor in enumerate(descriptors):tree.insert(descriptor[0],i)
    tree.balance();layer=mesh.uv_layers.get(aoUvName) or mesh.uv_layers.new(name=aoUvName)
    indices=[tree.find(world@vertex.co)[1] for vertex in mesh.vertices]
    for loop in mesh.loops:layer.data[loop.index].uv=AoRivetUv(indices[loop.vertex_index],len(descriptors))
    mesh.uv_layers.active_index=0;mesh.uv_layers[0].active_render=True

def PrepareAoMeshes(root):
    guides=bpy.data.collections.get('Source_EditableCurveGuides')
    if not guides:guides=bpy.data.collections.new('Source_EditableCurveGuides');bpy.context.scene.collection.children.link(guides)
    curves=[obj for obj in root.children_recursive if obj.type=='CURVE']
    optional=bpy.data.collections.get('Source_UnresolvedObserverAccessories')
    optionalCurves=[obj for obj in optional.objects if obj.type=='CURVE' and obj.get('optionalParentName')] if optional else []
    for obj in curves+optionalCurves:
        guide=obj.copy();guide.data=obj.data.copy();guide.parent=None;guide.matrix_world=obj.matrix_world.copy();guide.name='SourceGuide_'+obj.name;guide['sourceGuideFor']=obj.name
        guides.objects.link(guide);guide.hide_render=True;guide.hide_viewport=True;guide.hide_set(True)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in curves:obj.select_set(True)
    if curves:bpy.context.view_layer.objects.active=curves[0];bpy.ops.object.convert(target='MESH')
    meshes=[obj for obj in root.children_recursive if obj.type=='MESH']
    for obj in meshes:
        if obj.data.users>1:obj.data=obj.data.copy()
        if not obj.data.uv_layers:
            layer=obj.data.uv_layers.new(name='UVMap')
            for poly in obj.data.polygons:
                axis=max(range(3),key=lambda i:abs(poly.normal[i]));a,b=[i for i in range(3) if i!=axis]
                for index in poly.loop_indices:
                    p=obj.data.vertices[obj.data.loops[index].vertex_index].co;layer.data[index].uv=(p[a],p[b])
        obj.data.uv_layers[0].name='UVMap'
    return meshes,len(curves)+len(optionalCurves)

def AoProxy(objects,name,copyAo=False):
    vertices=[];faces=[];uvs=[];aoUvs=[];normals=[];mapping=[];materials=[];materialIndices=[]
    for obj in objects:
        mesh=obj.data;mesh.update();offset=len(vertices);world=obj.matrix_world;normalWorld=world.to_3x3().inverted().transposed()
        vertices.extend(world@v.co for v in mesh.vertices)
        slots=[]
        for mat in mesh.materials:
            if mat not in materials:materials.append(mat)
            slots.append(materials.index(mat))
        for poly in mesh.polygons:
            loops=list(poly.loop_indices)
            if world.to_3x3().determinant()<0:loops.reverse()
            faces.append(tuple(offset+mesh.loops[k].vertex_index for k in loops));materialIndices.append(slots[poly.material_index])
            for k in loops:
                uvs.append(tuple(mesh.uv_layers[0].data[k].uv));normals.append(tuple((normalWorld@mesh.corner_normals[k].vector).normalized()));mapping.append((obj,k))
                if copyAo:aoUvs.append(tuple(mesh.uv_layers[aoUvName].data[k].uv))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update();obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj)
    for mat in materials:mesh.materials.append(mat)
    for p,index in zip(mesh.polygons,materialIndices):p.material_index=index;p.use_smooth=True
    uv=mesh.uv_layers.new(name='UVMap')
    assert len(mesh.loops)==len(uvs)
    for k,value in enumerate(uvs):uv.data[k].uv=value
    if copyAo:
        uv=mesh.uv_layers.new(name=aoUvName)
        for k,value in enumerate(aoUvs):uv.data[k].uv=value
    for edge in mesh.edges:edge.use_edge_sharp=True
    mesh.normals_split_custom_set(normals);mesh.uv_layers[0].active_render=True
    return obj,mapping

def RemoveAoProxy(obj):
    mesh=obj.data;bpy.data.objects.remove(obj,do_unlink=True)
    if mesh.users==0:bpy.data.meshes.remove(mesh)

def UnwrapGeometryAo(meshes,rivet,descriptors):
    hashes={obj.name:AoUvHash(obj.data) for obj in meshes}
    targets=[obj for obj in meshes if obj!=rivet]
    proxy,mapping=AoProxy(targets,'Temp_AoUnwrapProxy');layer=proxy.data.uv_layers.new(name=aoUvName);proxy.data.uv_layers.active=layer
    bpy.ops.object.select_all(action='DESELECT');proxy.select_set(True);bpy.context.view_layer.objects.active=proxy
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.001,correct_aspect=False,scale_to_bounds=True)
    bpy.ops.uv.pack_islands(rotate=True,scale=True,margin=.002,margin_method='FRACTION',shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    layers={obj:obj.data.uv_layers.get(aoUvName) or obj.data.uv_layers.new(name=aoUvName) for obj in targets}
    for k,(obj,index) in enumerate(mapping):
        uv=proxy.data.uv_layers[aoUvName].data[k].uv;layers[obj].data[index].uv=(uv.x,aoStrip+(1-aoStrip)*uv.y)
    RemoveAoProxy(proxy)
    for obj in targets:obj.data.uv_layers.active_index=0;obj.data.uv_layers[0].active_render=True
    AssignRivetAoUv(rivet.data,rivet.matrix_world,descriptors)
    assert all(AoUvHash(obj.data)==hashes[obj.name] for obj in meshes),'AO unwrap must not alter primary material UV0'
    return hashes

def BakeGeometryAo(root,sourceRoot,evidenceRoot,descriptors,size=2048,samples=64,distance=2.):
    started=time.time();scene=bpy.context.scene;meshes,guideCount=PrepareAoMeshes(root);rivet=bpy.data.objects['Surface_FlushRivetHeads'];uvHashes=UnwrapGeometryAo(meshes,rivet,descriptors)
    image=bpy.data.images.new(aoImageName,width=size,height=size,alpha=False,float_buffer=True);image.colorspace_settings.name='Non-Color';image.generated_color=(1,1,1,1)
    pixels=np.ones(size*size*4,dtype=np.float32);image.pixels.foreach_set(pixels)
    originalHide={obj:obj.hide_render for obj in scene.objects};temporary={}
    def BakeMaterial(original):
        if original in temporary:return temporary[original]
        mat=bpy.data.materials.new('Temp_Ao_'+original.name);mat.use_nodes=True;nodes=mat.node_tree.nodes;links=mat.node_tree.links;nodes.clear()
        output=nodes.new('ShaderNodeOutputMaterial');emission=nodes.new('ShaderNodeEmission');ao=nodes.new('ShaderNodeAmbientOcclusion');ao.samples=samples;ao.inputs['Distance'].default_value=distance;ao.only_local=False
        links.new(ao.outputs['AO'],emission.inputs['Color'])
        orm=next((n.image for n in original.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and 'Orm' in n.image.name),None) if original.use_nodes else None
        if orm:
            uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap';tex=nodes.new('ShaderNodeTexImage');tex.image=orm;separate=nodes.new('ShaderNodeSeparateColor');multiply=nodes.new('ShaderNodeMath');multiply.operation='MULTIPLY'
            links.new(uv.outputs['UV'],tex.inputs['Vector']);links.new(tex.outputs['Color'],separate.inputs['Color']);links.new(ao.outputs['AO'],multiply.inputs[0]);links.new(separate.outputs['Red'],multiply.inputs[1]);links.new(multiply.outputs[0],emission.inputs['Color'])
        links.new(emission.outputs['Emission'],output.inputs['Surface']);target=nodes.new('ShaderNodeTexImage');target.image=image;nodes.active=target
        temporary[original]=mat;return mat
    opaque=[obj for obj in meshes if obj!=rivet and not AoGlass(obj)]
    groups={}
    for obj in opaque:groups.setdefault(AoMovingGroup(obj),[]).append(obj)
    scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.use_denoising=False
    scene.cycles.device='CPU';scene.render.threads_mode='FIXED';scene.render.threads=min(8,os.cpu_count() or 4)
    descriptorText=bpy.data.texts.get('Data_GeometryAoRivetDescriptors.json') or bpy.data.texts.new('Data_GeometryAoRivetDescriptors.json');descriptorText.clear();descriptorText.write(json.dumps([[list(v) for v in row] for row in descriptors]));descriptorText.use_fake_user=True
    root['aoUvPrepared']=True
    bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot/'Scene_NakajimaKi4AoPrepared.blend'),copy=True)
    batches=[]
    try:
        for group,objects in sorted(groups.items(),key=lambda p:p[0]!='Fixed'):
            for obj in scene.objects:
                if obj.type in ['MESH','CURVE']:obj.hide_render=True
            proxy,_=AoProxy(objects,'Temp_AoBakeProxy',True)
            slots=list(proxy.data.materials);proxy.data.materials.clear()
            for mat in slots:proxy.data.materials.append(BakeMaterial(mat))
            proxy.hide_render=False;bpy.ops.object.select_all(action='DESELECT');proxy.select_set(True);bpy.context.view_layer.objects.active=proxy;bpy.context.view_layer.update()
            print('AO bake group',group,'source objects',len(objects),'one CPU proxy',flush=True)
            try:bpy.ops.object.bake(type='EMIT',use_clear=False,margin=2,uv_layer=aoUvName)
            finally:RemoveAoProxy(proxy)
            batches.append({'group':group,'objects':len(objects),'bakeProxies':1})
    finally:
        for obj,value in originalHide.items():obj.hide_render=value
        for mat in temporary.values():bpy.data.materials.remove(mat)
    # Heads use one stable per-rivet value; their primary aluminum AO is1.
    fixed=groups['Fixed'];vertices=[];faces=[]
    for obj in fixed:
        obj.data.calc_loop_triangles();offset=len(vertices);vertices.extend(obj.matrix_world@v.co for v in obj.data.vertices);faces.extend(tuple(offset+k for k in t.vertices) for t in obj.data.loop_triangles)
    tree=BVHTree.FromPolygons(vertices,faces,all_triangles=True);values=[];rayCount=128
    def Radical(i):
        v=0.;f=.5
        while i:v+=(i&1)*f;i>>=1;f*=.5
        return v
    image.pixels.foreach_get(pixels);pixels=pixels.reshape(size,size,4)
    seamScript=pathlib.Path(globals().get('__file__','Taierzhuang1938/_blender/Script_NakajimaKi4GeometryAo.py')).resolve().with_name('Script_NakajimaKi4AoSeams.py')
    seamNamespace={'__file__':str(seamScript)}
    exec(compile(seamScript.read_text(encoding='utf8'),str(seamScript),'exec'),seamNamespace)
    # Broad continuous skin needs a shared boundary field. Subpixel hardware
    # keeps its bake rather than receiving a band wider than its UV chart.
    seamMeshes=[obj for obj in opaque if obj.name=='Fuselage_Monocoque']
    assert len(seamMeshes)==1
    seamRecord=seamNamespace['StitchAoSeams'](seamMeshes,pixels)
    assert all(AoUvHash(obj.data)==uvHashes[obj.name] for obj in meshes), 'AO seam processing must preserve every primary UV0'
    for index,(point,normal,along,cross) in enumerate(descriptors):
        blocked=0;origin=point+normal*.002
        for i in range(rayCount):
            u=(i+.5)/rayCount;phi=2*math.pi*((Radical(i)+index*.61803398875)%1);r=math.sqrt(u);direction=along*(r*math.cos(phi))+cross*(r*math.sin(phi))+normal*math.sqrt(1-u)
            if tree.ray_cast(origin,direction,distance)[0] is not None:blocked+=1
        value=1-blocked/rayCount;values.append(value);columns=84;rows=math.ceil(len(descriptors)/columns);x0=round((index%columns)/columns*size);x1=round((index%columns+1)/columns*size);y0=round(aoStrip*(index//columns)/rows*size);y1=round(aoStrip*(index//columns+1)/rows*size)
        pixels[y0:y1,x0:x1,:3]=value;pixels[y0:y1,x0:x1,3]=1
    assert np.isfinite(pixels).all() and pixels[:,:,:3].min()>=0 and pixels[:,:,:3].max()<=1.00001
    image.pixels.foreach_set(pixels.ravel());image.update();path=sourceRoot/'Textures'/f'{aoImageName}.png';image.filepath_raw=str(path);image.file_format='PNG';image.save();image.pack()
    record={'enabled':True,'uvLayer':aoUvName,'uvIndex':1,'imageName':aoImageName,'resolution':[size,size],'distanceM':distance,'nodeSamples':samples,'device':scene.cycles.device,'batches':batches,'editableGuideCurves':guideCount,'uv0Hashes':uvHashes,'rivetPolicy':'128 cosine-weighted static-geometry visibility rays per head, no micro-rivet occluders; original aluminum micro-AO is1','rivetValues':values,'fixedPolicy':'Fixed opaque geometry only, excluding moving pivots, glass, micro rivet heads and review stage','movingPolicy':'Only the same nearest-pivot rigid group occludes each moving group','seconds':time.time()-started,'imageSha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    record['packing']={'marginMethod':'FRACTION','marginFraction':.002,'uvVScale':1-aoStrip}
    record['seamStitching']=seamRecord
    (sourceRoot/'Textures/Data_GeometryAo.json').write_text(json.dumps(record,indent=2),encoding='utf8');(evidenceRoot/'Data_GeometryAoBake.json').write_text(json.dumps(record,indent=2),encoding='utf8')
    return image,record

def BindGeometryAo(root,image):
    materials={mat for obj in root.children_recursive if obj.type=='MESH' for mat in obj.data.materials if mat and 'Windscreen' not in mat.name}
    for mat in materials:
        nodes=mat.node_tree.nodes;links=mat.node_tree.links;uv=nodes.new('ShaderNodeUVMap');uv.uv_map=aoUvName;tex=nodes.new('ShaderNodeTexImage');tex.image=image;tex.label='Geometry/micro AO in unique UV1';separate=nodes.new('ShaderNodeSeparateColor')
        links.new(uv.outputs['UV'],tex.inputs['Vector']);links.new(tex.outputs['Color'],separate.inputs['Color'])
        settings=next((n for n in nodes if n.type=='GROUP' and n.node_tree and n.node_tree.name=='glTF Material Output'),None)
        if not settings:
            from io_scene_gltf2.blender.com.material_helpers import create_settings_group
            settings=nodes.new('ShaderNodeGroup');settings.node_tree=bpy.data.node_groups.get('glTF Material Output') or create_settings_group('glTF Material Output')
        links.new(separate.outputs['Red'],settings.inputs['Occlusion']);mat['geometryAoUv']='GeometryAO / texCoord1; base, normal and MR remain UV0'
