"""Render repeatable cart + draft-animal review angles in the active Blender scene.

Set scene['OxCartReviewDir'] to an absolute local directory and
scene['OxCartReviewTag'] to Before/After before running through BlenderMCP.
The review rig is temporary; it is not saved with the editable source scene.
"""
import bpy
from pathlib import Path
from mathutils import Vector

scene = bpy.context.scene
if 'OxCartReviewDir' not in scene or 'OxCartReviewTag' not in scene:
    raise RuntimeError('Set OxCartReviewDir and OxCartReviewTag on the scene before review rendering')
output_dir = Path(scene['OxCartReviewDir'])
output_dir.mkdir(parents=True, exist_ok=True)
tag = str(scene['OxCartReviewTag'])
animals = str(scene.get('OxCartReviewAnimals', 'Ox,Horse')).split(',')

rig = bpy.data.collections.new('ReviewRig')
scene.collection.children.link(rig)
def InRig(obj):
    for old in list(obj.users_collection): old.objects.unlink(obj)
    rig.objects.link(obj)
    return obj

bpy.ops.mesh.primitive_plane_add(size=200)
ground = InRig(bpy.context.view_layer.objects.active)
ground.name = 'ReviewGround'
ground.location.z = -0.025
mat = bpy.data.materials.new('ReviewGroundGray')
mat.diffuse_color = (.26, .27, .27, 1)
mat.use_nodes = True
mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (.26, .27, .27, 1)
ground.data.materials.append(mat)

camera_data = bpy.data.cameras.new('ReviewCamera')
camera = bpy.data.objects.new('ReviewCamera', camera_data)
rig.objects.link(camera)
scene.camera = camera
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 9.9

for name, location, power, size in [
    ('ReviewKey', (3, 1, 9), 1250, 6),
    ('ReviewFill', (-5, 5, 6), 900, 7),
    ('ReviewRear', (0, -6, 7), 700, 5),
]:
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.shape, data.size = power, 'DISK', size
    obj = bpy.data.objects.new(name, data)
    rig.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector((0, 2, 1)) - obj.location).to_track_quat('-Z', 'Y').to_euler()

scene.render.engine = 'CYCLES'
scene.cycles.samples = 20
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.world.color = (.24, .24, .24)
scene.frame_set(1)

views = {
    'Side': ((12, 2.0, 3.0), (0, 2.0, 1.1)),
    'Front': ((0, 13, 3.0), (0, 2.0, 1.1)),
    'Top': ((0, 2.0, 14.0), (0, 2.0, 0.0)),
    'Quarter': ((9, 10, 5.0), (0, 2.0, 1.1)),
    'Rear': ((0, -10, 3.0), (0, 2.0, 1.1)),
}
selected_views = str(scene.get('OxCartReviewViews', 'Side,Front,Quarter,Rear')).split(',')
for kind in animals:
    kind = kind.strip()
    if kind not in ('Ox', 'Horse'): raise ValueError(f'Unknown review animal {kind}')
    for col in bpy.data.collections:
        if col.name in ('Cart', 'Ox', 'Horse'):
            col.hide_viewport = False
            col.hide_render = col.name not in ('Cart', kind)
    for angle in selected_views:
        angle = angle.strip()
        position, target = views[angle]
        camera.location = position
        camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera_data.ortho_scale = 15.5 if angle == 'Top' else 9.9 if angle in ('Side', 'Quarter') else 6.4
        scene.render.filepath = str(output_dir / f'{tag}_{kind}_{angle}.png')
        bpy.ops.render.render(write_still=True)
        print('Review:', scene.render.filepath)

for obj in list(rig.objects): bpy.data.objects.remove(obj, do_unlink=True)
bpy.data.collections.remove(rig)
for col in bpy.data.collections:
    if col.name in ('Cart', 'Ox', 'Horse'):
        col.hide_render = False
