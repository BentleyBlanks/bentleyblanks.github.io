"""Refresh the local delivery manifest; historical archive inventory stays immutable."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,hashlib,json

parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,required=True)
args=parser.parse_args()
root=args.root.resolve()
target=root/'Data_DeliveryManifest.json'
previous=json.loads(target.read_text(encoding='utf-8')) if target.exists() else {'files':[]}
paths={root/item['path'] for item in previous['files']}
for pattern in ['Models/ReviewV*','Blender/ReviewV*','Models/DeathCollapseV*','Blender/DeathCollapseV*',
    'Models/NextTenV*','Blender/NextTenV*',
    'Models/RecoveryPreview','Blender/RawRecovery','Models/SourceWeapons','Models/_Pipeline',
    'Models/_Cache/*','Video/Sources/*','Preview']:
    for folder in root.glob(pattern):
        paths.update(p for p in folder.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix not in ['.log'])
paths.update(p for name in ['Data_ReadMe.md','Data_Standard.md'] if (p:=root/name).is_file())
records=[]
for file in sorted(paths):
    assert file.resolve().is_relative_to(root) and file.is_file(),file
    with file.open('rb') as stream: digest=hashlib.file_digest(stream,'sha256').hexdigest()
    records.append({'path':file.relative_to(root).as_posix(),'bytes':file.stat().st_size,'sha256':digest})
groups={}
for record in records:
    parts=Path(record['path']).parts
    if parts[0] not in ['Models','Blender'] or len(parts)<3: continue
    group=parts[1]
    suffix=Path(record['path']).suffix
    if suffix in ['.glb','.blend']:
        counts=groups.setdefault(group,{'glb':0,'blend':0})
        counts[suffix[1:]]+=1
archive=root/'Data_ArchiveManifest.json'
report={'schemaVersion':2,'updatedAt':datetime.now(timezone.utc).isoformat(),
    'status':'local_review_not_accepted_for_production','defaultView':'source-recovery-latest',
    'previewRevision':'SourceRecoveryLatest_20260906d','groups':groups,
    'glbCount':sum(Path(f['path']).suffix=='.glb' for f in records),
    'blendCount':sum(Path(f['path']).suffix=='.blend' for f in records),
    'rawJointFileCount':len(list((root/'Models/RecoveryPreview').glob('Data_*RawJoints.json'))),
    'historicalArchive':{'path':'Data_ArchiveManifest.json','sha256':hashlib.sha256(archive.read_bytes()).hexdigest()},
    'files':records}
target.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='files'},ensure_ascii=False))
print('Hashed delivery files',len(records))
