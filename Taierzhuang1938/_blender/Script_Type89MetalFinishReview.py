"""Render the tank under the matched 2007 setup and independent neutral lights."""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector


root = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank')
alignmentFile = root/'GeometryV55SurfaceV15/Review/Data_PhotoAlignment.json'


def Camera(scene, name, shot):
    data = bpy.data.cameras.new(name)
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    data.type = 'PERSP'
    data.sensor_fit = 'HORIZONTAL'
    data.sensor_width = 36
    data.lens = shot['lensMm']
    data.shift_x, data.shift_y = shot.get('shift',[0,0])
    data.clip_start = .01
    data.clip_end = 60
    obj.location = shot['origin']
    if 'rotation' in shot:
        obj.matrix_world = Matrix.Translation(shot['origin']) @ Matrix(shot['rotation']).to_4x4()
    else:
        obj.rotation_euler = (Vector(shot['target'])-obj.location).to_track_quat('-Z','Y').to_euler()
    return obj


def Light(scene,name,position,target,energy,size,color):
    data = bpy.data.lights.new(name,'AREA')
    obj = bpy.data.objects.new(name,data)
    scene.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    data.energy = energy
    data.size = size
    data.color = color
    return obj


def Fixture(scene, day):
    if day:
        lights = [
            ('DiffuseSky',(-2,-1,8),(0,0,1),1870,8,(.97,.98,1)),
            ('OpenYard',(-6,1,4),(0,0,1),310,5,(1,.96,.89)),
            ('YardBounce',(3,-1,4),(0,0,1),175,5,(1,.99,.96)),
        ]
    else:
        lights = [
            ('SoftboxKey',(-4,5,6),(0,0,1),1450,4,(1,.98,.95)),
            ('SoftboxOpposite',(4,-3,5),(0,0,1),1150,3.5,(.95,.98,1)),
            ('SoftboxOverhead',(-.5,-1,6),(0,-1,1),850,5,(1,1,1)),
            ('SoftboxLeft',(-5,-2,2.6),(0,0,1),280,4,(.99,.99,1)),
        ]
    fixtures = [Light(scene,*args) for args in lights]
    if day:
        # The off-camera sky is the reflection source seen in four consecutive
        # tread lands. This daylight fit is shared by the two compared assets.
        focus = (-.92,1.85,.80)
        for name,position,energy,size,diffuse in (
            ('OpenSkyOpposite',(4.2,3.2,4.8),625,5.2,.12),
            ('LowSkyOpposite',(4.6,4.4,1.75),58,4.1,.11),
        ):
            source = Light(scene,name,position,focus,energy,size,(1,.99,.965))
            source.data.diffuse_factor = diffuse
            fixtures.append(source)
    return fixtures


def Review(args):
    bpy.ops.wm.open_mainfile(filepath=str(args.blend))
    scene = bpy.context.scene
    vehicle = bpy.data.objects['Model_Type89MediumTank']
    parts = {vehicle,*vehicle.children_recursive}
    for obj in scene.objects:
        obj.hide_render = obj not in parts
    scene.render.engine = 'BLENDER_EEVEE'
    scene.eevee.taa_render_samples = 48
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = scene.render.pixel_aspect_y = 1
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = 0
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (.40,.44,.50,1)
    bg.inputs['Strength'].default_value = .60

    primary = next(row for row in json.loads(alignmentFile.read_text(encoding='utf-8')) if row['id']==2)
    shots = {
        'Photo2007':primary,
        'NeutralFull':dict(size=[740,490], origin=[-6.8,8.1,3.55], target=[0,-.38,1.16], lensMm=58),
        'NeutralRace':dict(size=[740,490], origin=[-2.70,4.30,2.80], target=[-.04,.35,1.99], lensMm=78),
        'NeutralTrack':dict(size=[740,490], origin=[-3.06,-2.95,1.85], target=[-.90,-1.92,.80], lensMm=62),
        'NeutralIdler':dict(size=[740,490], origin=[-3.35,3.16,1.32], target=[-.86,1.59,.73], lensMm=63),
        'NeutralDeck':dict(size=[740,490], origin=[-3.22,-3.75,3.08], target=[-.28,-1.55,1.54], lensMm=78),
    }
    rest = {o.name:o.matrix_basis.copy() for o in parts if o.name.startswith('Node_')}
    args.output.mkdir(parents=True,exist_ok=True)
    for name in args.views.split(','):
        shot = shots[name]
        for node,transform in rest.items():
            bpy.data.objects[node].matrix_basis = transform
        for node,(axis,angle) in shot.get('pose',{}).items():
            bpy.data.objects[node].matrix_basis = rest[node] @ Quaternion(axis,math.radians(angle)).to_matrix().to_4x4()
        obj = Camera(scene,'Review_'+name,shot)
        scene.camera = obj
        scene.render.resolution_x = shot['size'][0]*2
        scene.render.resolution_y = shot['size'][1]*2
        lights = Fixture(scene,name=='Photo2007')
        scene.render.filepath = str((args.output/f'Scene_{name}.png').resolve())
        bpy.ops.render.render(write_still=True)
        for item in lights+[obj]:
            bpy.data.objects.remove(item,do_unlink=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--blend',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--views',default='Photo2007,NeutralFull,NeutralRace,NeutralTrack,NeutralIdler,NeutralDeck')
    Review(parser.parse_args(sys.argv[sys.argv.index('--')+1:]))
