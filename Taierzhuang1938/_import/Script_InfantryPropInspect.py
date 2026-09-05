import bpy
from pathlib import Path
from mathutils import Matrix
r=Path.home()/'Downloads/GVHMR/InfantryActions_20260905'
s=bpy.data.scenes['Scene_IjaInfantryActions'];bpy.context.window.scene=s
for obj in ['Rig_IjaInfantry','Socket_IjaInfantryRifle','Socket_IjaInfantryGrenade']:
 o=bpy.data.objects[obj];o.animation_data.action=bpy.data.actions['Animation_Ija_KneelHold'+('' if obj.startswith('Rig') else '_Rifle' if obj.endswith('Rifle') else '_Grenade')]
s.frame_set(1)
print('SOURCE',[(o.name,tuple(o.matrix_world.translation),tuple(o.matrix_world.to_scale())) for o in s.objects if 'Rifle' in o.name or 'Grenade' in o.name])
bpy.ops.wm.read_factory_settings(use_empty=True);s=bpy.context.scene;s.render.fps=60
bpy.ops.import_scene.gltf(filepath=str(r/'Deliverables/Animation_Ija_KneelHold.glb'));s.frame_set(0)
print('IMPORT',[(o.name,tuple(o.matrix_world.translation),tuple(o.matrix_world.to_scale()),o.animation_data.action.name if o.animation_data and o.animation_data.action else None) for o in s.objects if 'Rifle' in o.name or 'Grenade' in o.name])
