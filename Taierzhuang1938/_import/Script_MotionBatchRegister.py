"""Build persistent per-version entries for completed members of a motion batch."""
from pathlib import Path
import argparse,json

parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,required=True)
parser.add_argument('--group',default='NextTenV1')
args=parser.parse_args()
root=args.root
out=root/'Models'/args.group
recipes=json.loads((out/'Data_Recipes.json').read_text(encoding='utf-8'))
actions=[]
for name,cfg in recipes.items():
    reports=[out/f'Data_{faction}_{name}_Validation.json' for faction in ['Nra','Ija']]
    if not all(p.exists() for p in reports):continue
    motion=json.loads((root/'Models/_Cache'/args.group/f'Data_{name}Motion.json').read_text(encoding='utf-8'))
    entry={'id':name,'label':cfg['label'],'loop':cfg['loop'],'description':'单人斜俯视原片 · 本机恢复 · 两军原骨架重定向',
        'cameraDistance':cfg.get('cameraDistance',4.5),'variants':[]}
    if cfg.get('cameraCenter'):entry['cameraCenter']=cfg['cameraCenter']
    for faction,reportPath in zip(['Nra','Ija'],reports):
        report=json.loads(reportPath.read_text(encoding='utf-8'))
        v=report['variants'][0]
        sourceName=cfg.get('source',name)
        review={'sourceVideo':f'Video/Sources/{sourceName}/Video_{sourceName}.mp4',
            'sourceRangeSeconds':[x/30 for x in v['sourceFrames']],'recoveryFps':30,
            'recoveryLabel':'GVHMR 原始恢复 · 未重定向、未修脚',
            'recoveryTracks':[{'path':f'Models/RecoveryPreview/Data_V1_{name}RawJoints.json','offset':[0,0,0]}],
            'defaultCameraYawRadians':cfg.get('defaultCameraYawRadians',.7853981633974483),'cameraElevationRadians':cfg.get('cameraElevationRadians',.65),
            'sideCameraYawRadians':-1.5707963267948966}
        for key,path in [('recoveryBlend',f'Blender/RawRecovery/Scene_{name}RawRecovery_V1.blend'),('recoveryGlb',f'Models/RecoveryPreview/Animation_{name}RawRecovery_V1.glb')]:
            if (root/path).exists():review[key]=path
        if cfg.get('sourceAssessment'):review['sourceAssessment']=cfg['sourceAssessment']
        ratio=report['retargetScale']
        travel=motion['sourceTravelMeters']
        entry['variants'].append({'id':f'{faction}-v1-{name}','faction':faction,'label':'V1 · 本机恢复与重定向','revisionOrder':1,
            'status':'待审阅','path':v['path'],'clip':v['clip'],'blend':v['blend'],'review':review,
            'travelMeters':[travel[0]*ratio,0,-travel[1]*ratio] if cfg['loop'] else None})
    actions.append(entry)
(out/'Data_Versions.json').write_text(json.dumps({'actions':actions},ensure_ascii=False,indent=2),encoding='utf-8')
print('Registered',len(actions),'completed batch actions')
