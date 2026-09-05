"""Create a NEW source project; refuses to overwrite existing work.
Run with Blender --background --factory-startup --python this file.
Continue authoring/baking through Blender MCP in the resulting file.
"""
import bpy
from pathlib import Path
root=Path(__file__).resolve().parents[1]
projectPath=Path(globals().get('MELEE_BLEND_PATH') or Path.home()/'OneDrive'/'AI'/'Models'/'Blender'/'Taierzhuang1938'/'MeleeCombat'/'Scene_MeleeCombat.blend')
if projectPath.exists():raise FileExistsError('Refusing to replace existing melee source: '+str(projectPath))
projectPath.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.name='Scene_MeleeCombat';scene.unit_settings.system='METRIC'
for role in ['Nra','Ija','FirstPerson']:
 source=root/'Model'/('Model_FpsArmsNraSkeletal01.glb' if role=='FirstPerson' else 'Character/Model_Lugou'+role+'01.glb')
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(source))
 rigs=[obj for obj in set(bpy.data.objects)-before if obj.type=='ARMATURE']
 if len(rigs)!=1:raise RuntimeError('Expected one source skeleton: '+str(source))
 rigs[0].name='Melee'+role
bpy.ops.wm.save_as_mainfile(filepath=str(projectPath),compress=True)
print('Created melee source:',projectPath)
