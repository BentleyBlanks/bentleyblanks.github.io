"""Copy motion research assets into the local library, verifying every SHA-256."""
from pathlib import Path
import argparse, hashlib, json, shutil

def Hash(path):
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(4*1024*1024),b''): digest.update(block)
    return digest.hexdigest()

def Main():
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);parser.add_argument('--project',type=Path,required=True)
    args=parser.parse_args();root=args.root.resolve();project=args.project.resolve()
    scratch=Path.home()/'AppData/Local/Temp/claude/C--Users-Bentl-Documents-Program-bentleyblanks-github-io--claude-worktrees-ai-video-to-skeleton-animation-d45238/80219e72-aefe-42ee-9434-60066ca7991b/scratchpad/mocap'
    sources=[('Gvhmr',Path.home()/'Downloads/GVHMR'),('EarlyMocap',scratch),('BackRifleRun',project/'Animation/BackRifleRun'),('LegacyMocap',project/'_import/_mocap')]
    records=[];known={};total=0
    for label,source in sources:
        for path in sorted(source.rglob('*')):
            if not path.is_file():continue
            rel=path.relative_to(source)
            if any(part in {'.venv','Checkpoints','PackageSource','models','__pycache__'} for part in rel.parts) or path.suffix.lower() in {'.zip','.pyc'}:continue
            ext=path.suffix.lower()
            if ext.startswith('.blend'):category='Blender/Archive'
            elif ext in {'.glb','.gltf','.fbx','.bvh'}:category='Models/Archive'
            elif ext in {'.mp4','.mov','.webm','.avi'}:category='Video/Archive'
            elif ext in {'.png','.jpg','.jpeg','.webp'}:category='Preview/Archive'
            else:category='Models/_ArchiveData'
            if 'Sources' in rel.parts or (label=='EarlyMocap' and ext=='.mp4'):category='Video/Sources'
            digest=Hash(path);key=(digest,ext);duplicate=key in known
            target=known.get(key,root/category/label/rel)
            if not duplicate:
                target.parent.mkdir(parents=True,exist_ok=True)
                if not target.exists() or Hash(target)!=digest:shutil.copy2(path,target)
                assert Hash(target)==digest,str(target)
                known[key]=target;total+=path.stat().st_size
            records.append({'source':str(path),'path':target.relative_to(root).as_posix(),'bytes':path.stat().st_size,'sha256':digest,'deduplicated':duplicate})
    for path in sorted((project/'Model/Character').glob('Model_Lugou*.glb')):
        target=root/'Models/SourceCharacters'/path.name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
        digest=Hash(path);assert Hash(target)==digest
        records.append({'source':str(path),'path':target.relative_to(root).as_posix(),'bytes':path.stat().st_size,'sha256':digest,'deduplicated':False})
    manifest={'schemaVersion':1,'copyPolicy':'Verified archival copies; existing execution environment and original paths retained. Model weights are licensed dependencies, not distributed assets.','runtime':str(Path.home()/'Downloads/GVHMR'),'records':records,'uniqueBytes':total}
    (root/'Data_ArchiveManifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'mappedFiles':len(records),'uniqueFiles':len(known),'uniqueBytes':total,'manifest':str(root/'Data_ArchiveManifest.json')},ensure_ascii=False))

if __name__=='__main__':Main()
