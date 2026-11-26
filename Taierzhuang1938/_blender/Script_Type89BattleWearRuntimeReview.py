"""Render the exported GLB, never the editable game donor."""
import json
from pathlib import Path
import sys

import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from Script_Type89BattleWearReview import Review

args = sys.argv[sys.argv.index('--')+1:]
file,destination = (Path(value).resolve() for value in args[:2])
assert 'Type89MediumTank' in file.name
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(file))
scene = bpy.context.scene
if scene.world is None:
    scene.world = bpy.data.worlds.new('Type89ReviewWorld')
root = bpy.data.objects['Model_Type89MediumTank']
meshes = [obj for obj in root.children_recursive if obj.type=='MESH']
for obj in meshes:
    obj.data.calc_loop_triangles()
triangles = sum(len(obj.data.loop_triangles) for obj in meshes)
bake = json.loads((file.parents[2]/'Data_BattleWearBake.json').read_text(encoding='utf-8'))
assert root['surfaceRevision']==bake['revision']
assert triangles==bake['renderedTriangles']<=80000
print(f'Re-imported {len(meshes)} visible mesh instances, {triangles} triangles.')
Review(destination, ('Front','Left','Top','NeutralFull','NeutralTurret','NeutralTracks','NeutralExhaust','Right','Rear'))
