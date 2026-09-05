"""Export corrected, standalone game-integration GLBs from the isolated editable source."""
from pathlib import Path
import bpy
runtime = Path.home() / 'Downloads/GVHMR/InfantryActions_20260905/GameIntegration'
assert Path(bpy.data.filepath) == runtime / 'Scene_InfantryGameIntegration.blend'
exec(compile(Path(__file__).with_name('Script_InfantryExport.py').read_text(encoding='utf-8'), 'InfantryExport', 'exec'))
faction = globals()['INFANTRY_GAME_FACTION']
scene = bpy.data.scenes['Scene_' + faction + 'InfantryActions']; bpy.context.window.scene = scene
arm = bpy.data.objects['Rig_' + faction + 'Infantry']
output = runtime / 'Standalone'; output.mkdir(exist_ok=True)
for clip in ['RifleCrouchAdvance','StandToKneel','KneelHold','KneelToStand','GrenadeThrow']:
    name = 'Animation_' + faction + '_' + clip
    arm.animation_data.action = bpy.data.actions[name]
    for role in ['Rifle','Grenade']:
        bpy.data.objects['Socket_' + faction + 'Infantry' + role].animation_data.action = bpy.data.actions[name + '_' + role]
    scene.render.fps = 60; scene.frame_start = 1; scene.frame_end = int(arm.animation_data.action.frame_range[1]); scene.frame_set(1)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in scene.objects:
        if not obj.name.startswith(('Scene_', 'Preview_')): obj.select_set(True)
    bpy.context.view_layer.objects.active = arm
    ExportInfantry(output / (name + '_Game.glb'), name)
print('Standalone game GLBs exported:', faction, str(output))
