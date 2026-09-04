"""Package only this task's owned library objects into a normally openable .blend.

Called in a fresh background Blender, never in the user's live instance. Reading
named objects (instead of a scene) excludes any unrelated scene objects without
changing them in the original Blender instance or intermediate library.
"""
from pathlib import Path
import json
import sys
import bpy

args=sys.argv[sys.argv.index('--')+1:]
libraryPath,outputPath,manifestPath=[Path(arg).resolve() for arg in args]
config=json.loads(manifestPath.read_text(encoding='utf-8-sig'))
# This process was launched with --factory-startup specifically for packaging.
bpy.ops.wm.read_factory_settings(use_empty=True)
assetNames={'Character_LugouNra01','Rig_LugouCharacter','John_Body001','Bip002 Footsteps','Socket_HeadGear','Socket_WeaponL','Socket_WeaponR','Socket_BackBlade','Socket_BackRifle','Model_BackRifle0','Model_BackRifle1','Model_BackRifleSling','Scene_BackRifleFloor','Scene_BackRifleKey','Scene_BackRifleFill','Scene_BackRifleRim','Scene_BackRifleSide','Scene_BackRifleBack','Scene_BackRifleThreeQuarter'}
with bpy.data.libraries.load(str(libraryPath),link=False) as (available,loaded):
    loaded.objects=[n for n in available.objects if n in assetNames]
    loaded.worlds=[n for n in available.worlds if n=='Scene_BackRifleWorld']
    loaded.texts=[n for n in available.texts if n=='Script_BackRifleRunBake.py']
for text in loaded.texts:
    if text:text.use_fake_user=True
scene=bpy.context.scene;scene.name='Scene_BackRifleRun'
for obj in loaded.objects:
    if obj:scene.collection.objects.link(obj)
assert {o.name for o in scene.objects}==assetNames,'Source object whitelist must be complete'
scene.world=loaded.worlds[0];scene.camera=scene.objects['Scene_BackRifleSide']
scene.frame_start=1;scene.frame_end=1+config['cycleFrames'];scene.render.fps=config['fps'];scene.render.fps_base=1
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
scene.unit_settings.system='METRIC';scene['clipContract']=json.dumps({k:v for k,v in config.items() if k!='samples'});scene['productionIntegration']='Standalone review; production RifleRun is unchanged'
arm=scene.objects['Rig_LugouCharacter'];arm.select_set(True);bpy.context.view_layer.objects.active=arm;scene.frame_set(1);bpy.context.view_layer.update()
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.wm.save_as_mainfile(filepath=str(outputPath),compress=True)
print(json.dumps({'savedSource':str(outputPath),'objects':len(scene.objects),'bones':len(arm.data.bones),'clip':arm.animation_data.action.name,'fps':scene.render.fps}))
