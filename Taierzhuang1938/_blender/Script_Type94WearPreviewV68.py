"""Isolated, geometry-locked wear study on the preserved V66 packed source."""
import bpy,hashlib,importlib.util,json,os,shutil
from pathlib import Path
from mathutils import Vector
repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2])))
base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'SurfaceV68';revision='SurfaceV68Preview';phase=os.environ.get('TYPE94_WEAR_PHASE','Prepare');assert phase in ['Prepare','Apply','Normal','Finalize']
for name in ['Acceptance','Exports','Textures/HighSurfaceV68Preview']:(root/name).mkdir(parents=True,exist_ok=True)
folder=root/'Textures/HighSurfaceV68Preview';destination=root/'Scene_Type94TanketteHighSurfaceV68Preview.blend';assert not bpy.data.filepath
def Export():
    bpy.ops.object.select_all(action='DESELECT');asset=bpy.data.objects['Type94Tankette']
    for obj in [asset,*asset.children_recursive]:obj.select_set(True)
    file=repo/'Taierzhuang1938/_blender/Script_Type94Export.py';spec=importlib.util.spec_from_file_location('Wear68Export',file);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.ExportGltf(root/'Exports/Model_Type94TanketteHighSurfaceV68Preview.glb')
if phase=='Prepare':
    manifest=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV66.json').read_text());source=Path(manifest['sourceBlend']);assert hashlib.sha256(source.read_bytes()).hexdigest()==manifest['sourceBlendSha256'];bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette'
    scene['SurfaceStudyRevision']=revision;scene['SurfaceUvGenerationMode']='Checkpoint';scene['SurfaceUvCheckpointSha256']=manifest['sourceBlendSha256'];scene['SurfaceUvCheckpointScope']='Exact V66 UVs retained for wear-only comparison';scene['SurfaceWearPlacementInferred']=True
    for name in ['Texture_Type94PaintBase.png','Texture_Type94PaintOrm.png','Texture_Type94PaintNormal.png','Texture_Type94TrackBase.png','Texture_Type94TrackOrm.png']:
        shutil.copy2(base/'SurfaceV66/Textures/HighSurfaceV66Preview'/name,folder/name)
    shutil.copy2(base/'SurfaceV66/Acceptance/Data_SurfaceWearEdgesV66Preview.json',root/'Acceptance/Data_WearEdgesV68.json')
    paint=bpy.data.materials['Material_Type94Paint'];track=bpy.data.materials['Material_Type94Track'];triangles=[];contactFaces=[];visited=set()
    for obj in scene.objects:
        if obj.type!='MESH'or obj.data.as_pointer()in visited:continue
        visited.add(obj.data.as_pointer());mesh=obj.data;mesh.calc_loop_triangles();uv=mesh.uv_layers.active.data
        for tri in mesh.loop_triangles:
            face=mesh.polygons[tri.polygon_index];material=mesh.materials[face.material_index]
            if material==paint and face.area>.00012:
                p=[obj.matrix_world@mesh.vertices[i].co for i in tri.vertices];area=(p[1]-p[0]).cross(p[2]-p[0]).length*.5
                if area>1e-7:triangles.append(dict(owner=obj.name,pointsWorldM=[list(x)for x in p],uv=[list(uv[i].uv)for i in tri.loops],exposure=float(mesh.attributes['WearZone'].data[face.index].value)if mesh.attributes.get('WearZone')else .08))
        if track in list(mesh.materials):
            for face in mesh.polygons:
                value=mesh.attributes['TrackContact'].data[face.index].value if mesh.attributes.get('TrackContact')else 0
                if value>.2:contactFaces.append(dict(value=value,uv=[list(uv[i].uv)for i in face.loop_indices]))
    data=dict(referenceSha256=manifest['sha256'],referenceSourceBlendSha256=manifest['sourceBlendSha256'],paintTriangles=triangles,trackContactFaces=contactFaces,scope='Actual locked V66UVs, physical paint faces and authored shoe contact lands. Wear placement/amount artistic, not measured museum damage.')
    (root/'Acceptance/Data_WearSurfacesV68.json').write_text(json.dumps(data,indent=2)+'\n');bpy.ops.wm.save_as_mainfile(filepath=str(destination));print(json.dumps(dict(paintTriangles=len(triangles),trackContactFaces=len(contactFaces))),flush=True)
else:
    bpy.ops.wm.open_mainfile(filepath=str(destination));scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette'
    if phase=='Apply':
        data=json.loads((root/'Acceptance/Data_WearBakeV68.json').read_text())
        for role in ['Paint','Track']:
            tree=bpy.data.materials['Material_Type94'+role].node_tree
            for channel in ['Base','Orm']:
                old=tree.nodes['Baked '+channel].image;file=data['outputs'][role+channel]['file'];image=bpy.data.images.load(file,check_existing=False);image.colorspace_settings.name=old.colorspace_settings.name;image.pack()
                for node in tree.nodes:
                    if node.type=='TEX_IMAGE'and node.image==old:node.image=image
                if old.users==0:bpy.data.images.remove(old)
                image.name=Path(file).stem
        tree=bpy.data.materials['Material_Type94Paint'].node_tree;frame=tree.nodes['Editable physical surface authoring']
        for label,file in data['masks'].items():
            image=bpy.data.images.load(file,check_existing=False);image.colorspace_settings.name='Non-Color';image.pack();node=tree.nodes.get('Editable wear68 '+label)or tree.nodes.new('ShaderNodeTexImage');node.name='Editable wear68 '+label;previous=node.image;node.image=image;node.parent=frame
            if previous and previous.users==0:bpy.data.images.remove(previous)
        underlying=tree.nodes.get('Editable wear68 underlying V66 normal')
        if underlying:tree.nodes['Baked Normal'].image=underlying.image
        tree.nodes['Tangent normal, OpenGL +Y'].inputs['Strength'].default_value=.65
        scene['WearV68NormalReliefApplied']=False;scene['WearV68Applied']=True;scene['WearV68Scope']=data['scope'];bpy.ops.wm.save_as_mainfile(filepath=str(destination));Export()
    elif phase=='Finalize':
        tree=bpy.data.materials['Material_Type94Paint'].node_tree;frame=tree.nodes['Editable physical surface authoring'];texture=tree.nodes.get('Editable wear68 underlying V66 normal')
        if texture is None:
            image=bpy.data.images.load(str(base/'SurfaceV66/Textures/HighSurfaceV66Preview/Texture_Type94PaintNormal.png'),check_existing=False);image.colorspace_settings.name='Non-Color';image.pack();texture=tree.nodes.new('ShaderNodeTexImage');texture.name='Editable wear68 underlying V66 normal';texture.image=image;texture.parent=frame
        normal=tree.nodes.get('Editable wear68 underlying normal strength')or tree.nodes.new('ShaderNodeNormalMap');normal.name='Editable wear68 underlying normal strength';normal.inputs['Strength'].default_value=.65;normal.parent=frame;tree.links.new(texture.outputs['Color'],normal.inputs['Color']);tree.links.new(normal.outputs['Normal'],tree.nodes['Editable thin paint loss relief'].inputs['Normal']);scene['WearV68AuthorInputsArchived']=True;bpy.ops.wm.save_as_mainfile(filepath=str(destination));Export()
    else:
        material=bpy.data.materials['Material_Type94Paint'];tree=material.node_tree;normal=tree.nodes['Tangent normal, OpenGL +Y'];strength=1.;normal.inputs['Strength'].default_value=.65
        height=tree.nodes['Editable wear68 Height'];frame=tree.nodes['Editable physical surface authoring'];baseTexture=tree.nodes.get('Editable wear68 underlying V66 normal')or tree.nodes.new('ShaderNodeTexImage');baseTexture.name='Editable wear68 underlying V66 normal'
        if baseTexture.image is None:
            baseTexture.image=bpy.data.images.load(str(base/'SurfaceV66/Textures/HighSurfaceV66Preview/Texture_Type94PaintNormal.png'),check_existing=False);baseTexture.image.colorspace_settings.name='Non-Color';baseTexture.image.pack()
        baseTexture.parent=frame;baseNormal=tree.nodes.get('Editable wear68 underlying normal strength')or tree.nodes.new('ShaderNodeNormalMap');baseNormal.name='Editable wear68 underlying normal strength';baseNormal.inputs['Strength'].default_value=.65;baseNormal.parent=frame;tree.links.new(baseTexture.outputs['Color'],baseNormal.inputs['Color']);bump=tree.nodes.get('Editable thin paint loss relief')or tree.nodes.new('ShaderNodeBump');bump.name='Editable thin paint loss relief';bump.inputs['Distance'].default_value=.00020;bump.inputs['Strength'].default_value=1;tree.links.new(height.outputs['Color'],bump.inputs['Height']);tree.links.new(baseNormal.outputs['Normal'],bump.inputs['Normal']);shader=tree.nodes['Physical Paint'];tree.links.new(bump.outputs['Normal'],shader.inputs['Normal']);tree.links.new(bump.outputs['Normal'],shader.inputs['Coat Normal'])
        image=bpy.data.images.new('Texture_Type94PaintNormalWear68',width=4096,height=4096,alpha=False);image.colorspace_settings.name='Non-Color';image.generated_color=(.5,.5,1,1);image.filepath_raw=str(folder/'Texture_Type94PaintNormalWear68.png');image.file_format='PNG';target=tree.nodes.get('Wear68 normal bake target')or tree.nodes.new('ShaderNodeTexImage');target.name='Wear68 normal bake target';target.image=image
        for node in tree.nodes:node.select=False
        target.select=True;tree.nodes.active=target;bpy.ops.object.select_all(action='DESELECT');objects=[o for o in scene.objects if o.type=='MESH'and material in list(o.data.materials)]
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];scene.render.engine='CYCLES';scene.cycles.samples=8;scene.render.threads_mode='FIXED';scene.render.threads=4;bpy.ops.object.bake(type='NORMAL',normal_space='TANGENT',use_clear=False,margin=8);image.save();image.pack();old=tree.nodes['Baked Normal'].image;tree.nodes['Baked Normal'].image=image;normal.inputs['Strength'].default_value=strength;tree.links.new(normal.outputs['Normal'],shader.inputs['Normal']);tree.links.new(normal.outputs['Normal'],shader.inputs['Coat Normal']);target.parent=tree.nodes['Editable physical surface authoring'];bump.parent=tree.nodes['Editable physical surface authoring'];scene['WearV68NormalReliefApplied']=True
        if old.users==0:bpy.data.images.remove(old)
        image.name='Texture_Type94PaintNormalWear68'
        bpy.ops.wm.save_as_mainfile(filepath=str(destination));Export();print('TYPE94_WEAR68_TANGENT_RELIEF_BAKED',flush=True)
