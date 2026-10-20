"""Render review views of the fitted aiming support hand saved by
Script_FpsAdsSupportGripFit.py (objects <id>_Rifle / _LeftHandHip / _LeftHandAds).

FPS_GRIP_SOURCE: folder for the PNGs; FPS_GRIP_IDS: weapons; FPS_ADS_FRAMES: eye.
Views are in gun-local terms (eye = ADS eye) converted to Blender's Z-up.
"""
import bpy, json, os
from pathlib import Path
from mathutils import Vector, Matrix


def Setting(name, default=None):
    value = globals().get(name)
    return os.environ.get(name, default) if value is None else value


source = Path(Setting('FPS_GRIP_SOURCE'))
blend = Setting('FPS_GRIP_BLEND')
if blend and bpy.data.filepath != str(blend):
    bpy.ops.wm.open_mainfile(filepath=str(blend))
ids = Setting('FPS_GRIP_IDS', 'Type38,HanYang,ZhongZheng')
ids = ids.split(',') if isinstance(ids, str) else list(ids)
frames = json.loads(Path(Setting('FPS_ADS_FRAMES')).read_text())
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.render.resolution_x, scene.render.resolution_y = 960, 540
scene.render.film_transparent = False
world = scene.world or bpy.data.worlds.new('World')
scene.world = world


def B(v):  # gun-local (+Y up, -Z forward) -> Blender (+Z up)
    return Vector((v[0], -v[2], v[1]))


camera = bpy.data.objects.get('ReviewCamera')
if not camera:
    camera = bpy.data.objects.new('ReviewCamera', bpy.data.cameras.new('ReviewCamera'))
    scene.collection.objects.link(camera)
scene.camera = camera
for wid in ids:
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            obj.hide_render = not obj.name.startswith(wid + '_')
    for label in ('Hip', 'Ads'):
        for other in ('Hip', 'Ads'):
            hand = bpy.data.objects.get(f'{wid}_LeftHand{other}')
            if hand:
                hand.hide_render = other != label
        hand = bpy.data.objects[f'{wid}_LeftHand{label}']
        center = sum((hand.matrix_world @ v.co for v in hand.data.vertices), Vector()) / len(hand.data.vertices)
        eye = B(frames[wid]['eye'])
        views = {
            'eye': (eye, 18),
            'left': (center + Vector((-.32, 0, .02)), 32),
            'right': (center + Vector((.32, 0, .02)), 32),
            'front': (center + Vector((-.06, -.35, .06)), 32),
            'below': (center + Vector((-.05, 0, -.30)), 32),
        }
        matched = Setting('FPS_GRIP_VIEWS')
        if matched:
            # Same cameras as the in-game probe (gun-local position/target/up/vertical fov).
            views = {}
            for name, view in json.loads(Path(matched).read_text()).items():
                views['game_' + name] = (B(view['position']), view)
        for name, (position, lens) in views.items():
            camera.location = position
            if isinstance(lens, dict):
                target, up = B(lens['target']), B(lens['up'])
                forward = (target - position).normalized()
                right = forward.cross(up).normalized()
                camera.matrix_world = Matrix((right, (-forward).cross(right), -forward)).transposed().to_4x4()
                camera.location = position
                camera.data.sensor_fit = 'VERTICAL'
                camera.data.angle_y = lens['fov'] * 3.14159265 / 180
            else:
                direction = center - position
                camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
                camera.data.sensor_fit = 'AUTO'
                camera.data.lens = lens
            camera.data.clip_start = .005
            scene.render.filepath = str(source / f'Review_{wid}_{label}_{name}.png')
            bpy.ops.render.render(write_still=True)
print(json.dumps({'reviewed': ids}), flush=True)
