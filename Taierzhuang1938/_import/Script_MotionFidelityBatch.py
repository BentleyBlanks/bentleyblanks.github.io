"""Serial, resumable Blender bake with real exit codes and output validation."""
from pathlib import Path
import argparse,subprocess,json,time
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);parser.add_argument('--group',default='ReviewV7');parser.add_argument('--blender',type=Path,required=True);parser.add_argument('--ids',nargs='*');parser.add_argument('--force',action='store_true')
args=parser.parse_args();out=args.root/'Models'/args.group;logs=out/'Logs';logs.mkdir(exist_ok=True)
recipes=json.loads((out/'Data_Recipes.json').read_text(encoding='utf-8'));results=[]
for name,cfg in recipes.items():
 if cfg['kind']=='pair' or args.ids and name not in args.ids:continue
 for faction in ['Nra','Ija']:
  report=out/f'Data_{faction}_{name}_Validation.json'
  if report.exists() and not args.force:
   d=json.loads(report.read_text(encoding='utf-8'))
   if d.get('maxDirectionErrorDegrees',99)<.15 and d.get('maxWristDisplacementMeters',99)<.00002 and all((args.root/d['variants'][0][k]).exists() for k in ['path','blend']):continue
  log=logs/f'Data_{faction}_{name}.log';start=time.time()
  with log.open('w',encoding='utf-8') as stream:
   result=subprocess.run([str(args.blender),'--background','--python-exit-code','1','--python',str(Path(__file__).with_name('Script_MotionFidelityBake.py')),'--','--root',str(args.root),'--group',args.group,'--faction',faction,'--clip',name],stdout=stream,stderr=subprocess.STDOUT)
  item={'name':name,'faction':faction,'exitCode':result.returncode,'seconds':round(time.time()-start,2)};results.append(item);print(item,flush=True)
  (out/'Data_BatchExecution.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
  if result.returncode:raise RuntimeError(log.read_text(encoding='utf-8')[-3000:])
print('BATCH DONE',flush=True)
