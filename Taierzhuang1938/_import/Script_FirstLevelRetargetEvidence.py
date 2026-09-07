"""Bind historical visual assessments to their actual immutable model version."""
import hashlib,json


def CollectRetargetEvidence(root,directory,action,sourceSha256):
    variants=action['variants'] if action else []
    hashes={v['id']:hashlib.sha256((root/v['path']).read_bytes()).hexdigest() for v in variants}
    history=[]
    for path in sorted(directory.glob('Data_RetargetAssessment*.json')):
        assessment=json.loads(path.read_text(encoding='utf-8-sig'))
        assert assessment['sourceVideoSha256']==sourceSha256,('Assessment/source mismatch',path)
        matches=[v for v in variants if hashes[v['id']]==assessment['modelSha256']]
        assert len(matches)==1,('Assessment must identify exactly one registered model',path)
        variant=matches[0]
        if assessment.get('variantId'):assert assessment['variantId']==variant['id'],path
        history.append(dict(variantId=variant['id'],path=path.relative_to(root).as_posix(),assessment=assessment))
    latestId=action.get('latestByFaction',{}).get('Nra') if action else None
    latest=next((e['assessment'] for e in history if e['variantId']==latestId),None)
    return history,latest
