"""Register only verified, genuinely baked outputs; inherit exact source references."""
from pathlib import Path
import argparse,copy,json
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);parser.add_argument('--group',default='ReviewV7');parser.add_argument('--revision',type=int,default=7)
args=parser.parse_args();root=args.root;out=root/'Models'/args.group
inventory=json.loads((out/'Data_SourceInventory.json').read_text(encoding='utf-8'))['actions']
recipes=json.loads((out/'Data_Recipes.json').read_text(encoding='utf-8'));entries=[]
for a in inventory:
 name=a['id'];cfg=recipes[name];entry={k:copy.deepcopy(v) for k,v in a.items() if k not in ['variants','latestByFaction']};entry['variants']=[]
 entry['description']='保留恢复姿态与原角色骨长；道具适配手部。循环仅末端过渡，地面修正整体抬落。'
 entry['cameraDistance']=cfg['cameraDistance']
 for faction in ['Nra','Ija']:
  reportPath=out/f'Data_{faction}_{name}_Validation.json'
  if not reportPath.exists():continue
  report=json.loads(reportPath.read_text(encoding='utf-8'))
  if report.get('maxDirectionErrorDegrees',0)>.15 or report.get('maxWristDisplacementMeters',0)>.00002:raise ValueError(f'{name} {faction}: failed fidelity checks')
  v=report['variants'][0];review=copy.deepcopy(cfg['review'])
  # Existing first-person engineering scenes belong to the old pipeline, and
  # cannot be relabelled as this new third-person body retarget.
  review.pop('firstPersonBlend',None)
  review['retargetReport']=reportPath.relative_to(root).as_posix()
  review['retargetNotes']='复用已核验原始恢复；保留各骨段方向、肘膝与手腕位置，适配原人物骨长。手指及道具不是 GVHMR 原始输出。'
  if cfg['category']!='split_experiment':review.setdefault('sourceAssessment','复用对应原片与原始恢复。新版保留原恢复的肘膝、手腕和身体姿态；手指握法与道具另行适配。')
  previous=next((x for x in a['variants'] if x['id']==a['latestByFaction'].get(faction)),None)
  travel=previous.get('travelMeters') if previous else None
  if name!='StretcherPair':
   m=json.loads((root/'Models/_Cache'/args.group/f'Data_{name}Motion.json').read_text(encoding='utf-8'));t=m['sourceTravelMeters'];ratio=report['retargetScale'];travel=[t[0]*ratio,0,-t[1]*ratio] if cfg['loop'] else None
   review['seamBlendSeconds']=m['seamFrames']/60
  entry['variants'].append({'id':f'{faction}-v{args.revision}-{name}','faction':faction,'label':f'V{args.revision} · 全身保真重定向','revisionOrder':args.revision,
   'status':'实验 · 待审阅' if cfg['category']=='split_experiment' else '待审阅','propKind':cfg['kind'],'path':v['path'],'clip':v['clip'],'blend':v['blend'],'review':review,'travelMeters':travel})
 if entry['variants']:entries.append(entry)
(out/'Data_Versions.json').write_text(json.dumps({'actions':entries},ensure_ascii=False,indent=2),encoding='utf-8')
print('Registered',len(entries),'actions',sum(len(a['variants']) for a in entries),'variants')
