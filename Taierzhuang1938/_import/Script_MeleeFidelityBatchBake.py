"""Bake source-faithful V2 melee performances without replacing V1 history."""
from pathlib import Path
import sys,json,runpy,argparse
project=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,default=Path(r'C:\Users\Bentl\OneDrive\Sync\饮河\FPS\视频转骨骼'))
parser.add_argument('names',nargs='*')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
root=args.root;names=args.names
recipes=json.loads((root/'Models/MeleeVideoV2/Data_Recipes.json').read_text(encoding='utf-8'))
for name in names or list(recipes):
 for faction in ['Nra','Ija']:
  sys.argv=['Script_MotionBakeV2.py','--','--root',str(root),'--faction',faction,'--clip',name,'--revision','2','--grip-revision','3','--capture-group','MeleeVideoV2','--output-group','MeleeVideoV2']
  runpy.run_path(str(project/'_import/Script_MotionBakeV2.py'),run_name='__main__')
  result=json.loads((root/f'Models/MeleeVideoV2/Data_{faction}_{name}_Validation.json').read_text(encoding='utf-8'))
  assert result['maxGripError']<.001,(faction,name,'grip')
  assert max(s['wristDeviation'][side] for s in result['samples'] for side in ['L','R'])<.00001,(faction,name,'source wrist changed')
print('MELEE_FIDELITY_BATCH_COMPLETE',flush=True)
