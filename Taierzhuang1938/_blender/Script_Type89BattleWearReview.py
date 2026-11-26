"""Orthographic G55 cameras and a separate neutral-light inspection rig."""
import json
from pathlib import Path

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
PROFILE = HERE.parent/'Model/Type89MediumTank/Data_BattleWearProfile.json'
RECIPE = json.loads(PROFILE.read_text(encoding='utf-8'))


def Point(obj,target):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()


def Light(scene,label,location,target,energy,size,color):
    data = bpy.data.lights.new(label,'AREA')
    data.energy,data.size,data.color = energy,size,color
    obj = bpy.data.objects.new(label,data)
    scene.collection.objects.link(obj)
    obj.location = location
    Point(obj,target)
    return obj


def Fixture(scene,pivot,neutral):
    if neutral:
        setup = [
            ('NeutralKey',(-4.9,4.4,5.3),1580,4.6,(1,1,1)),
            ('NeutralFill',(3.8,3.1,3.9),680,4.4,(1,1,1)),
            ('NeutralRim',(-3.2,-4.4,5.9),1090,4.2,(1,1,1)),
            ('NeutralBounce',(-1.3,2.5,.2),65,4.0,(1,1,1)),
        ]
    else:
        setup = [
            ('SkySoftbox',(-3.5,4.2,7.5),1680,6,(1,.97,.93)),
            ('SoftOpposite',(4.5,1.5,5.6),1020,6,(.93,.95,1)),
            ('LiftLeft',(-4,-2.0,3.5),420,5,(1,1,1)),
            ('RoofSoftbox',(.2,-2.0,8),840,7,(1,.98,.96)),
            ('SoftGroundBounce',(0,3.9,.12),42,4,(1,.96,.90)),
        ]
    return [Light(scene,name,loc,pivot,energy,size,color) for name,loc,energy,size,color in setup]


def Review(destination, views, percentage=100):
    scene = bpy.context.scene
    tank = bpy.data.objects['Model_Type89MediumTank']
    parts = {tank,*tank.children_recursive}
    visibility = {object:object.hide_render for object in scene.objects}
    oldCamera = scene.camera
    for obj in scene.objects:
        obj.hide_render = obj not in parts
    cameraData = bpy.data.cameras.new('Type89BattleReviewCamera')
    camera = bpy.data.objects.new('Type89BattleReviewCamera',cameraData)
    scene.collection.objects.link(camera)
    scene.camera = camera
    cameraData.type = 'ORTHO'
    cameraData.sensor_fit = 'HORIZONTAL'
    cameraData.clip_start = .04
    cameraData.clip_end = 100
    render = scene.render
    render.engine = 'BLENDER_EEVEE'
    scene.eevee.taa_render_samples = 32
    render.resolution_percentage = percentage
    render.pixel_aspect_x = render.pixel_aspect_y = 1
    render.image_settings.file_format = 'PNG'
    render.image_settings.color_mode = 'RGBA'
    render.film_transparent = True
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = -.12
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (.47,.48,.50,1)
    bg.inputs['Strength'].default_value = .65
    pivot = Vector(RECIPE['camera']['centre'])
    ortho = {name:(pivot, Vector(row['axis']), row.get('size') or RECIPE['camera']['sizes'][name],RECIPE['camera']['pixelsPerMetre'])
             for name,row in RECIPE['views'].items()}
    neutral = {
        'NeutralFull':((0,-.30,1.25),(-.73,1,.43),(1440,980),244),
        'NeutralTurret':((-.29,.55,2.08),(-.82,1,.34),(1400,940),565),
        'NeutralTracks':((-.84,1.95,.65),(-.87,1,.26),(1400,960),704),
        'NeutralExhaust':((-.51,-1.74,1.44),(-.71,-1,.82),(1400,940),600),
    }
    destination.mkdir(parents=True,exist_ok=True)
    for name in views:
        isNeutral = name in neutral
        target, axis, size, density = (neutral if isNeutral else ortho)[name]
        target, axis = Vector(target), Vector(axis)
        render.resolution_x,render.resolution_y = size
        camera.location = target+axis.normalized()*15
        if name=='Top':
            camera.rotation_euler = (0,0,0)
        else:
            Point(camera,target)
        cameraData.ortho_scale = 1
        frame = cameraData.view_frame(scene=scene)
        cameraData.ortho_scale = size[0]/(density*(max(vec.x for vec in frame)-min(vec.x for vec in frame)))
        lights = Fixture(scene,pivot,isNeutral)
        render.filepath = str(destination/(name+'.png'))
        bpy.ops.render.render(write_still=True)
        for item in lights:
            bpy.data.objects.remove(item,do_unlink=True)
        print('Rendered',name,render.filepath,flush=True)
    scene.camera = oldCamera
    bpy.data.objects.remove(camera,do_unlink=True)
    for obj,state in visibility.items():
        obj.hide_render = state
