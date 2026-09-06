"""Bake and register both factions' five sword actions from existing V7 projects."""
from pathlib import Path
import argparse,copy,json,subprocess

def Main():
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--blender',type=Path,required=True);p.add_argument('--register-only',action='store_true');a=p.parse_args();root=a.root
    out=root/'Models/ReviewV8';out.mkdir(parents=True,exist_ok=True);logs=out/'Logs';logs.mkdir(exist_ok=True)
    versions=json.loads((root/'Models/ReviewV7/Data_Versions.json').read_text(encoding='utf-8'))
    entries=[copy.deepcopy(v) for v in versions['actions'] if v['id'].startswith('Dadao')]
    recipes=json.loads((root/'Models/ReviewV7/Data_Recipes.json').read_text(encoding='utf-8'))
    (out/'Data_Recipes.json').write_text(json.dumps({v['id']:recipes[v['id']] for v in entries},ensure_ascii=False,indent=2),encoding='utf-8')
    for entry in entries:
        name=entry['id'];entry['description']='原片刀刃方向校准，重新握柄；保留手肘、大臂和身体，前臂末端按握柄做最小修正。'
        for v in entry['variants']:
            faction=v['faction']
            if not a.register_only:
                with (logs/f'Data_{faction}_{name}.log').open('w',encoding='utf-8') as stream:
                    subprocess.run([str(a.blender),'--background','--python-exit-code','1','--python',str(Path(__file__).with_name('Script_DadaoBladeBake.py')),'--','--root',str(root),'--faction',faction,'--clip',name],stdout=stream,stderr=subprocess.STDOUT,check=True)
            report=json.loads((out/f'Data_{faction}_{name}_Validation.json').read_text(encoding='utf-8'))
            v.update(id=f'{faction}-v8-{name}',label='V8 · 大刀刀向与握柄',revisionOrder=8,path=report['path'],blend=report['blend'],clip=report['clip'],status='待审阅')
            v['review']['retargetReport']=f'Models/ReviewV8/Data_{faction}_{name}_Validation.json'
            v['review']['retargetNotes']='根据原片刀柄到刀尖的可见方向校准刀向；保留 V7 手肘、大臂和身体。掌指重新握柄，必要帧的前臂末端作最小接触修正，骨长保持不变。刀的单目深度为估计，修正量见报告。'
            v['review']['sourceAssessment']='复用原视频及未改动的原始恢复。大刀方向由原片可见刀刃校准；遮挡、出画与纵深缩短部分仍有深度不确定性。'
            print(name,faction,'body',report['maxBodyMatrixDelta'],'contact',round(report['maxContactResidual'],4),flush=True)
    (out/'Data_Versions.json').write_text(json.dumps({'actions':entries},ensure_ascii=False,indent=2),encoding='utf-8')

if __name__=='__main__':Main()
