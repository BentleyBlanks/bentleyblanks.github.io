from pathlib import Path
import bpy
runtime=Path.home()/'Downloads/GVHMR/InfantryActions_20260905'
folder=runtime/'Inspection';folder.mkdir(exist_ok=True)
for faction in ['Nra','Ija']:
 scene=bpy.data.scenes['Scene_'+faction+'InfantryActions'];bpy.context.window.scene=scene
 arm=bpy.data.objects['Rig_'+faction+'Infantry'];rifle=bpy.data.objects['Socket_'+faction+'InfantryRifle']
 scene.render.engine='BLENDER_WORKBENCH';scene.display.shading.light='STUDIO';scene.display.shading.color_type='TEXTURE'
 scene.display.shading.show_shadows=True;scene.display.shading.show_cavity=True
 scene.render.resolution_x=400;scene.render.resolution_y=400
 scene.camera=bpy.data.objects['Scene_'+faction+'ThreeQuarter']
 for clip,frames in [('RifleCrouchAdvance',[1,60,110,165]),('StandToKneel',[1,50,105]),('KneelToStand',[1,45,95]),('GrenadeThrow',[1,125,150,210])]:
  name='Animation_'+faction+'_'+clip+globals().get('INSPECT_SUFFIX','_Raw')
  arm.animation_data.action=bpy.data.actions[name];rifle.animation_data.action=bpy.data.actions[name+'_Rifle']
  for frame in frames:
   scene.frame_set(frame);scene.render.filepath=str(folder/f'Texture_{faction}_{clip}_{frame:03d}.png')
   bpy.ops.render.render(write_still=True)
print('INSPECTION_COMPLETE')
