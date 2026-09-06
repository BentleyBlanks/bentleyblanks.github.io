"""Export complete evaluated poses from the reviewed V2 Blender files."""
from pathlib import Path
import bpy,json,math,numpy as np,argparse,sys
from mathutils import Matrix
project=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,default=Path(r'C:\Users\Bentl\OneDrive\Sync\饮河\FPS\视频转骨骼'))
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
root=args.root
recipes=json.loads((root/'Models/MeleeVideoV2/Data_Recipes.json').read_text(encoding='utf-8'))
for clip in recipes:
 for faction in ['Nra','Ija']:
  bpy.ops.wm.open_mainfile(filepath=str(root/f'Blender/MeleeVideoV2/Scene_{faction}_{clip}_V2.blend'))
  scene=bpy.context.scene;arm=bpy.data.objects['Rig_'+faction+'Infantry'];prefix='Bip002 ' if faction=='Nra' else 'Bip001 '
  N=lambda part:prefix+part
  rest={b.name:(arm.matrix_world@b.matrix_local).copy() for b in arm.data.bones};heads={n:m.translation.copy() for n,m in rest.items()}
  motion=json.loads((root/f'Models/_Cache/MeleeVideoV2/Data_{clip}Motion.json').read_text(encoding='utf-8'))
  rifle=bpy.data.objects['Model_'+faction+'MeleeVideo'+motion['weapon']]
  exec(compile(Path(__file__).with_name('Script_MeleeVideoBodyExport.py').read_text(encoding='utf-8'),'MeleeVideoBodyExport','exec'))
print('MELEE_FIDELITY_RUNTIME_EXPORT_COMPLETE',flush=True)
