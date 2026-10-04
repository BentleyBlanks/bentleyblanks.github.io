"""Bake the static room's physical diffuse lighting into a separate UV1 atlas.
Run through Script_BlenderMcp after Script_BuildCommandRoom.py; no albedo is baked.
The source EXR preserves HDR. Runtime WebP stores linear irradiance / 32 in sRGB.
"""
import bpy, json, os, math
import numpy as np
from pathlib import Path
ROOT=Path(os.environ.get('COMMAND_ROOM_ROOT',r'C:\Users\Bentl\Documents\bentleyblanks_Codex_CommandRoomMenu_20261004'))
GAME=ROOT/'Taierzhuang1938'
SOURCE=Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\CommandRoom')
assert Path(bpy.data.filepath).resolve()==(SOURCE/'Scene_CommandRoom.blend').resolve()
scene=bpy.context.scene
objects=[o for o in scene.objects if o.type=='MESH']
bpy.ops.object.select_all(action='DESELECT')
for ob in objects:
    ob.select_set(True)
    if not ob.data.uv_layers: ob.data.uv_layers.new(name='UVMap')
    if 'LightmapUV' in ob.data.uv_layers: ob.data.uv_layers.remove(ob.data.uv_layers['LightmapUV'])
    ob.data.uv_layers.new(name='LightmapUV')
    ob.data.uv_layers.active_index=1
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.003,area_weight=1.0,correct_aspect=True,scale_to_bounds=True)
bpy.ops.object.mode_set(mode='OBJECT')
# Tiny pencils/ruler marks otherwise get sub-pixel chart widths next to entire walls.
# Adjust relative texel density before a single shared repack; never overlap charts.
density={'CommandRoomPlaster':.45,'CommandRoomOutside':.35,'CommandRoomPencilWood':16,'CommandRoomPencilPaint':16,'CommandRoomInkGlass':8,
         'CommandRoomGraphite':20,'CommandRoomIron':6,'CommandRoomDust':2,
         'CommandRoomCloth':1.5,'CommandRoomLetter':1.5,'CommandRoomMap':1.25}
for ob in objects:
    factor=density.get(ob.data.materials[0].name,1)
    for loop in ob.data.uv_layers['LightmapUV'].data: loop.uv*=factor
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.pack_islands(rotate=True,margin=.003,scale=True)
bpy.ops.object.mode_set(mode='OBJECT')
atlas=bpy.data.images.new('CommandRoomLighting',width=2048,height=2048,float_buffer=True,alpha=False)
atlas.colorspace_settings.name='Linear Rec.709'
for mat in bpy.data.materials:
    if not mat.use_nodes:continue
    tree=mat.node_tree
    for node in tree.nodes:node.select=False
    node=tree.nodes.new('ShaderNodeTexImage');node.name='CommandRoomBakedLighting';node.image=atlas;node.select=True;tree.nodes.active=node
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=256;scene.cycles.use_denoising=True
scene.render.bake.use_pass_direct=True;scene.render.bake.use_pass_indirect=True;scene.render.bake.use_pass_color=False
scene.render.bake.margin=10;scene.render.bake.use_clear=True
bpy.ops.object.bake(type='DIFFUSE')
raw=SOURCE/'Textures'/'Texture_CommandRoomLighting.exr'
atlas.filepath_raw=str(raw);atlas.file_format='OPEN_EXR';atlas.save()
pixels=np.empty(len(atlas.pixels),dtype=np.float32);atlas.pixels.foreach_get(pixels)
pixels=pixels.reshape((-1,4));peak=float(pixels[:,:3].max())
assert peak<32.0, f'Lighting exceeds the fixed /32 encoding: {peak}'
pixels[:,:3]/=32.0;pixels[:,3]=1
atlas.pixels.foreach_set(pixels.ravel());atlas.update()
png=SOURCE/'Textures'/'Texture_CommandRoomLighting.png'
scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB';scene.render.image_settings.color_depth='16'
atlas.save_render(str(png),scene=scene)
# Keep the HDR original as the editable Blender source image; PNG is delivery input.
atlas.filepath_raw=str(raw);atlas.reload()
for ob in objects:
    ob.data.uv_layers.active_index=0
    ob.data.uv_layers[0].active_render=True
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.35
scene.render.image_settings.color_depth='8'
# Geometry, both UV channels and material identifiers only. Runtime loads external maps.
bpy.ops.object.select_all(action='DESELECT')
for ob in scene.objects:
    if ob.type in {'MESH','CAMERA'}:ob.select_set(True)
links=[]
for mat in bpy.data.materials:
    if not mat.use_nodes:continue
    for link in list(mat.node_tree.links):
        if link.to_node.type=='BSDF_PRINCIPLED':
            links.append((mat,link.from_socket,link.to_socket));mat.node_tree.links.remove(link)
bpy.ops.export_scene.gltf(filepath=str(GAME/'Model'/'Model_CommandRoom.glb'),export_format='GLB',use_selection=True,export_cameras=True,export_lights=False,export_animations=False,export_extras=True,export_texcoords=True,export_image_format='NONE')
for mat,a,b in links:mat.node_tree.links.new(a,b)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'Scene_CommandRoom.blend'))
record={'source':str(raw),'deliveryInput':str(png),'size':[2048,2048],'samples':256,'encoding':'sRGB(linear diffuse irradiance / 32)','scale':32,'peakLinear':peak,'uvChannel':1,'meshes':len(objects),'noAlbedo':True,'relativeTexelDensity':density}
(GAME/'_shots'/'CommandRoom'/'Data_CommandRoomLighting.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
print(json.dumps(record))
