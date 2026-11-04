"""Local 720p review renders; run through scripts/Script_BlenderMcp.mjs exec.

Optional globals SHUNZI_MODEL, SHUNZI_TAG and SHUNZI_VIEWS select the source and views.
Review images stay under tmp/Shunzi and are never published.
"""
import bpy, math
from pathlib import Path
from mathutils import Vector

projectRoot = Path(globals().get('SHUNZI_PROJECT_ROOT', Path.cwd())).resolve()
source = globals().get('SHUNZI_MODEL', r'C:/Users/Bentl/OneDrive/Sync/饮河/FPS/角色/Tripo/01_顺子/Shunzi_Merged_V4.glb')
tag = globals().get('SHUNZI_TAG', 'V4')
views = globals().get('SHUNZI_VIEWS', ['Front', 'Low', 'Side', 'Back', 'Full', 'Wrist'])
output = projectRoot / 'tmp/Shunzi'
output.mkdir(parents=True, exist_ok=True)
old = bpy.data.scenes.get('ShunziReview')
if old:
    for obj in list(old.objects): bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.scenes.remove(old)
sc = bpy.data.scenes.new('ShunziReview')
bpy.context.window.scene = sc
with bpy.context.temp_override(scene=sc, view_layer=sc.view_layers[0]):
    bpy.ops.import_scene.gltf(filepath=str(source))
sc.render.engine = 'CYCLES'
sc.cycles.samples = 16
sc.cycles.use_denoising = True
sc.cycles.device = 'GPU'
prefs = bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
    for device in prefs.devices: device.use = device.type != 'CPU'
except Exception:
    sc.cycles.device = 'CPU'
sc.render.resolution_x, sc.render.resolution_y = 1280, 720
sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'PNG'
sc.view_settings.view_transform = 'Standard'
sc.world = bpy.data.worlds.new('ShunziReviewWorld'); sc.world.use_nodes = True
bg = sc.world.node_tree.nodes.get('Background')
bg.inputs['Color'].default_value = (0.2, 0.21, 0.23, 1)
bg.inputs['Strength'].default_value = 0.8
for name, pos, energy, size in [('Key', (2,-4,5), 550, 4), ('Fill', (-3,-2,3), 200, 3), ('Rim', (1,3,4), 450, 3)]:
    light = bpy.data.lights.new('ShunziReview'+name, 'AREA'); light.energy = energy; light.shape = 'DISK'; light.size = size
    obj = bpy.data.objects.new(light.name, light); sc.collection.objects.link(obj); obj.location = pos
    obj.rotation_euler = (Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
data = bpy.data.cameras.new('ShunziReviewCamera'); cam = bpy.data.objects.new(data.name, data); sc.collection.objects.link(cam)
sc.camera = cam; data.type = 'ORTHO'; data.clip_start = 0.01; data.clip_end = 30
definitions = {
 'Front': ((0,0,1.68), (0,-1,0.04), 0.72),
 'Low': ((0,-0.015,1.70), (0,-1,-0.65), 0.70),
 'Side': ((0,-0.015,1.68), (1,-0.03,0.04), 0.72),
 'Back': ((0,0,1.68), (0,1,0.04), 0.72),
 'Full': ((0,0,0.93), (0,-1,0), 3.55),
 'Wrist': ((0.75,0,1.415), (0.2,-1,0.4), 0.52),
}
for view in views:
    target, direction, scale = definitions[view]
    target, direction = Vector(target), Vector(direction).normalized()
    cam.location = target+direction*5; cam.rotation_euler = (-direction).to_track_quat('-Z','Y').to_euler(); data.ortho_scale = scale
    sc.render.filepath = str(output / f'Check_Shunzi{tag}_{view}.png')
    bpy.ops.render.render(write_still=True)
    print('REVIEW', sc.render.filepath)
