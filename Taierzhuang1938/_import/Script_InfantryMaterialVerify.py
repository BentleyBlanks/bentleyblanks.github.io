import bpy
from pathlib import Path
from mathutils import Vector
r=Path.home()/'Downloads/GVHMR/InfantryActions_20260905'
a=bpy.data.scenes['Scene_IjaInfantryActions'];bpy.context.window.scene=a
arm=bpy.data.objects['Rig_IjaInfantry'];rifle=bpy.data.objects['Socket_IjaInfantryRifle'];grenade=bpy.data.objects['Socket_IjaInfantryGrenade'];name='Animation_Ija_KneelHold'
arm.animation_data.action=bpy.data.actions[name];rifle.animation_data.action=bpy.data.actions[name+'_Rifle'];grenade.animation_data.action=bpy.data.actions[name+'_Grenade'];a.frame_set(1)
a.camera=bpy.data.objects['Scene_IjaThreeQuarter'];a.render.resolution_x=512;a.render.resolution_y=512;a.render.engine='BLENDER_EEVEE';a.render.filepath=str(r/'Inspection/Texture_IjaMaterialSource.png');bpy.ops.render.render(write_still=True)
s=bpy.data.scenes.new('Scene_ExportQA');bpy.context.window.scene=s;s.render.fps=60;s.world=a.world
for obj in a.objects:
 if obj.name.startswith('Scene_'):s.collection.objects.link(obj)
s.camera=a.camera;s.render.resolution_x=512;s.render.resolution_y=512;s.render.engine='BLENDER_EEVEE';s.view_settings.view_transform='AgX'
bpy.ops.import_scene.gltf(filepath=str(r/'Deliverables/Animation_Ija_KneelHold.glb'));s.frame_set(0);s.render.filepath=str(r/'Inspection/Texture_IjaMaterialReimport.png');bpy.ops.render.render(write_still=True)
