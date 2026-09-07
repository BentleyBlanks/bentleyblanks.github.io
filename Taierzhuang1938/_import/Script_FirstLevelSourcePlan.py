"""Expand the FL01-FL48 production plan, validating actual reused sources."""
from pathlib import Path
import argparse
import hashlib
import json


def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,required=True)
    args=parser.parse_args()
    root=args.root.resolve()
    folder=Path(__file__).resolve().parent
    plan=json.loads((folder/'Data_FirstLevelSourcePlan.json').read_text(encoding='utf-8'))
    requestFile=folder/'Data_FirstLevelSourceRequests.json'
    prior={r['id']:r for r in json.loads(requestFile.read_text(encoding='utf-8'))}
    catalog=json.loads((root/'Preview/Data_Catalog.json').read_text(encoding='utf-8'))
    actions={a['id']:a for a in catalog['actions']}
    sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    coverage={f'FL{i:02}':dict(requirementId=f'FL{i:02}',newSources=[],reused=[],status='source_production_planned') for i in range(1,49)}
    requests=[]
    for source in plan['sources']:
        if source.get('existingRequest'):
            request=prior[source['id']]
        else:
            request=dict(id=source['id'],requirementIds=source['requirementIds'],modelVersion=plan['modelVersion'],
                durationSeconds=source['durationSeconds'],expectedCredits=source['durationSeconds']*plan['creditsPerSecond'],
                cameraRequirement='Fixed 45-degree azimuth/downward view, complete person and movement range',
                prompt=f"一段{source['durationSeconds']}秒的视频。"+plan['commonPrompt']+source['action'])
            if source['id'] in prior:
                assert prior[source['id']]==request,'Version the source ID before changing a recorded request'
        requests.append(request)
        for rid in source['requirementIds']:
            coverage[rid]['newSources'].append(source['id'])
    assert len({r['id'] for r in requests})==len(requests),'Duplicate request ID'
    for rid,ids in plan['reused'].items():
        for name in ids:
            action=actions[name]
            latest=action['latestByFaction'].get('Nra',next(iter(action['latestByFaction'].values())))
            variant=next(v for v in action['variants'] if v['id']==latest)
            assert (root/variant['path']).is_file()
            record=dict(id=name,category=action['category'],variantId=variant['id'],model=variant['path'])
            review=variant.get('review',{})
            if review.get('sourceVideo'):
                video=root/review['sourceVideo']
                assert video.is_file()
                record.update(sourceVideo=review['sourceVideo'],sourceVideoSha256=sha(video),sourceRangeSeconds=review['sourceRangeSeconds'])
            else:
                assert action['category']=='legacy_bip_fbx','Unexplained missing source video'
                record['sourcePolicy']='Original BIP/FBX animation; video recovery is not applicable.'
            coverage[rid]['reused'].append(record)
    assert all(row['newSources'] or row['reused'] for row in coverage.values()),'Uncovered requirement'
    requestFile.write_text(json.dumps(requests,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    out=root/'Models/FirstLevelSourceBatchV1'
    out.mkdir(parents=True,exist_ok=True)
    report=dict(schemaVersion=1,requirements=list(coverage.values()),requestedSources=len(requests),
        expectedFirstPassCredits=sum(r['expectedCredits'] for r in requests),
        scope=plan['scope'],requestsSha256=sha(requestFile),
        acceptancePolicy='Generated video must be inspected before recovery. Collaborating roles use separate single-person inputs; props and relative placement are authored assembly, not recovered shared world positions.')
    (out/'Data_CoveragePlan.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='requirements'},ensure_ascii=True))


if __name__=='__main__':
    Main()
