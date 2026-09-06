"""BlenderMCP background dispatcher, scoped to MeleeVideoV1 library outputs."""
from pathlib import Path
import bpy,sys,json,runpy
project=Path(__file__).resolve().parents[1]
root=Path(r'C:\Users\Bentl\OneDrive\Sync\饮河\FPS\视频转骨骼')
names=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
recipes=json.loads((root/'Models/MeleeVideoV1/Data_Recipes.json').read_text(encoding='utf-8'))
for name in names or list(recipes):
 for faction in ['Nra','Ija']:
  sys.argv=['Script_MotionBakeV2.py','--','--root',str(root),'--faction',faction,'--clip',name,'--revision','1','--grip-revision','3','--capture-group','MeleeVideoV1','--output-group','MeleeVideoV1']
  runpy.run_path(str(project/'_import/Script_MotionBakeV2.py'),run_name='__main__')
  result=json.loads((root/f'Models/MeleeVideoV1/Data_{faction}_{name}_Validation.json').read_text(encoding='utf-8'))
  if result['maxGripError']>.006:raise RuntimeError(f'{faction} {name}: grip residual {result["maxGripError"]}')
print('MELEE_VIDEO_BATCH_COMPLETE',flush=True)
