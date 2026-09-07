"""Register the actual game-scale support package as a new review revision."""
from pathlib import Path
import argparse, copy, hashlib, json


def Main():
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--group',default='FirstLevelTrainSupportV2');parser.add_argument('--revision',type=int,default=4)
    args=parser.parse_args();root=args.root.resolve();out=root/'Models'/args.group
    Read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
    Hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    skin=Read(out/'Data_ProductionSkinValidation.json');assert not skin['failures'] and not skin['errors']
    package=Read(out/'Data_PackageValidation.json');assert not package['errors']
    projects=Read(out/'Data_EditableProjects.json');editable=Read(out/'Data_EditableProjectValidation.json')
    assert len(skin['results'])==len(package['results'])==len(projects['results'])==len(editable['results'])==4
    entry=Read(root/'Models/FirstLevelBenchV3/Data_Versions.json')['actions'][0]
    reference=copy.deepcopy(entry['variants'][0]['review']);entry['variants']=[]
    entry.update(cameraDistance=4.5,cameraCenter=[0,.85,.1],description='原游戏四型号及真实凳板尺寸；坐姿、腿部与掌面支撑为后期适配。原片和原恢复保持。')
    for record in sorted(projects['results'],key=lambda r:r['id']):
        model=record['id'];verified=next(r for r in skin['results'] if r['id']==model)
        assembled=next(r for r in package['results'] if r['id']==model);project=next(r for r in editable['results'] if r['id']==model)
        assert Hash(root/record['animation'])==record['animationSha256']==verified['animationSha256']==assembled['animationSha256']
        assert Hash(root/record['model'])==record['modelSha256']==assembled['modelSha256']
        assert Hash(root/record['blend'])==record['blendSha256']==project['blendSha256']
        review=copy.deepcopy(reference)
        review.update(retargetReport=(out/'Data_ProductionSkinValidation.json').relative_to(root).as_posix(),
            retargetNotes='原模型 bind/层级/骨长保持；实际身高五档曲线，经九身高 120 fps 验证。根、腿、腕、掌指为后期支撑修正，未接入任务。',
            sourceAssessment='V4：原游戏模型尺度、凳板顶 .48 m、深 .68 m、厚 .14 m。按型号适配凳边位置；完整原片/原始恢复时间线未变。',
            packageValidation=(out/'Data_PackageValidation.json').relative_to(root).as_posix())
        entry['variants'].append(dict(id=f'Nra-v{args.revision}-{model}-TrainBenchRise',faction='Nra',modelId=model,
            revisionOrder=args.revision,label=f'V{args.revision} · {model} 游戏尺度支撑',status='待审阅 · 未接入游戏',
            path=record['model'],blend=record['blend'],clip='FirstLevelTrainBench100',review=review,travelMeters=None))
    target=out/'Data_Versions.json';document=dict(actions=[entry])
    ids={variant['id'] for variant in entry['variants']}
    for other in (root/'Models').glob('*/Data_Versions.json'):
        if other==target:continue
        assert not any(variant['id'] in ids for action in Read(other)['actions'] for variant in action['variants']),'Revision already registered elsewhere; choose a new --revision'
    if target.exists() and (out/'Data_VisualAssessment.json').exists():assert Read(target)==document,'Reviewed registration is immutable'
    target.write_text(json.dumps(document,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Registered one source action, four original-model variants; historical versions preserved.')


if __name__=='__main__':Main()
