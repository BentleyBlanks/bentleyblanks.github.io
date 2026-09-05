"""Check library provenance against actual inference arrays and linked files."""
from pathlib import Path
import argparse, hashlib, json
import numpy as np

parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,required=True)
args=parser.parse_args()
root=args.root.resolve()
rawReports=[]
for path in sorted((root/'Models/RecoveryPreview').glob('Data_*RawJoints.json')):
    raw=json.loads(path.read_text(encoding='utf-8'))
    cache=(root/raw['sourceCache']).resolve()
    assert cache.is_relative_to(root) and cache.is_file(),cache
    assert hashlib.sha256(cache.read_bytes()).hexdigest()==raw['sourceCacheSha256'],path
    with np.load(cache) as data:
        assert np.array_equal(np.array(raw['positions']),data['worldJoints']),path
        assert np.array_equal(raw['parents'],data['parents']),path
        assert float(raw['fps'])==float(data['fps']),path
    rawReports.append({'path':path.relative_to(root).as_posix(),'frames':len(raw['positions']),'exactRawArrayMatch':True})
catalog=json.loads((root/'Preview/Data_Catalog.json').read_text(encoding='utf-8'))
references=set()
for entry in catalog['actions']:
    for variant in entry['variants']:
        for key in ['path','blend']:
            if variant.get(key): references.add(variant[key])
        review=variant.get('review') or {}
        for key in ['sourceVideo','recoveryBlend','recoveryGlb']:
            if review.get(key): references.add(review[key])
        references.update(review.get('inferenceInputs',[]))
        for track in review.get('recoveryTracks',[]):
            references.add(track['path'])
            raw=json.loads((root/track['path']).read_text())
            start,end=review['sourceRangeSeconds']
            assert 0<=start<end<=(len(raw['positions'])-1)/raw['fps']+.000001,(variant['id'],start,end)
    for faction,latestId in entry['latestByFaction'].items():
        assert any(v['id']==latestId and v['faction']==faction for v in entry['variants'])
for reference in references:
    path=(root/reference).resolve()
    assert path.is_relative_to(root) and path.is_file(),reference
report={'status':'passed','rawArrays':rawReports,'linkedFiles':len(references),'actions':len(catalog['actions'])}
(root/'Preview/Data_SourceValidation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({'status':'passed','rawArrays':len(rawReports),'linkedFiles':len(references),'actions':len(catalog['actions'])}))
