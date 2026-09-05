"""Register one shared source recovery with separate original Nra/Ija retargets."""
from pathlib import Path
import argparse,json

parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,required=True)
args=parser.parse_args()
root=args.root
out=root/'Models/DeathCollapseV1'
actions=[]
entry={'id':'DeathCollapse','label':'死亡 · 失衡侧倒','loop':False,'cameraDistance':5.2,'cameraCenter':[.5,.65,-.4],
    'description':'两军共用单人斜俯视原片 · 非循环倒地及末态保持','variants':[]}
for faction in ['Nra','Ija']:
    report=json.loads((out/f'Data_{faction}_DeathCollapse_Validation.json').read_text(encoding='utf-8'))
    entry['variants'].append({'id':f'{faction}-v1-DeathCollapse','faction':faction,'label':'V1 · 本机恢复与重定向',
        'revisionOrder':1,'status':'待审阅','path':report['path'],'clip':report['clip'],'blend':report['blend'],
        'review':{'sourceVideo':'Video/Sources/DeathCollapse/Video_DeathCollapse.mp4',
            'sourceRangeSeconds':report['sourceRangeSeconds'],'recoveryFps':30,
            'recoveryLabel':'GVHMR 原始恢复 · 未重定向、未修接地',
            'recoveryTracks':[{'path':'Models/RecoveryPreview/Data_V1_DeathCollapseRawJoints.json','offset':[0,0,0]}],
            'recoveryBlend':'Blender/RawRecovery/Scene_DeathCollapseRawRecovery_V1.blend',
            'recoveryGlb':'Models/RecoveryPreview/Animation_DeathCollapseRawRecovery_V1.glb',
            'defaultCameraYawRadians':.7853981633974483,'cameraElevationRadians':.7853981633974483,
            'sideCameraYawRadians':-1.5707963267948966,
            'sourceAssessment':'单人斜俯视原片；两军共用原始恢复。模型增加全身接地和倒地末态保持，中间原始恢复不加这些修正。当前为非商业研究待审阅效果。'}})
(out/'Data_Versions.json').write_text(json.dumps({'actions':[entry]},ensure_ascii=False,indent=2),encoding='utf-8')
print('Registered DeathCollapse for Nra and Ija')
