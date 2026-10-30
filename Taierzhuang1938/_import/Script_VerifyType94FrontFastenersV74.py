"""Verify the real front-fastener GLB and all unaffected geometry/rig poses."""
import hashlib,importlib.util,json,numpy as np
from pathlib import Path
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'FrontFastenersV74';acc=root/'Acceptance';info=json.loads((acc/'Data_FrontFastenerIdentityV74.json').read_text());oldManifest=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GrayTrialV64.json').read_text());file=Path(__file__).with_name('Script_VerifyType94GameV70.py');spec=importlib.util.spec_from_file_location('FrontActualBuffers',file);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);a=module.Read(oldManifest['sourceGlb'],False);b=module.Read(info['sourceGlb'],False);checks=[]
checks.append(dict(check='Actual file identities',passed=a['sha256']==oldManifest['sha256']and b['sha256']==info['sha256']))
unchanged=[dict(name=name,passed=module.Same(module.Mesh(a,name),module.Mesh(b,name)))for name,(mesh,pose)in a['nodes'].items()if mesh is not None and name!='Geometry_Hull_Paint']
checks.append(dict(check='All236unaffected actual exported mesh surfaces exact',passed=len(unchanged)==236 and all(r['passed']for r in unchanged)))
rig=[]
for name,(mesh,pose)in a['nodes'].items():
    target=b['nodes'][name][1];same=all(pose[k]==target.get(k)for k in pose if k!='controls');oldControls=pose.get('controls',{});newControls=target.get('controls',{});same=same and all(newControls.get(k)==v for k,v in oldControls.items());rig.append(dict(name=name,passed=same))
checks.append(dict(check='All292existing rigid poses, parents and control properties preserved',passed=len(rig)==292 and all(r['passed']for r in rig)))
source=json.loads((acc/'Data_FrontSourceArraysV74.json').read_text());arrays=np.load(acc/'Data_FrontSourceArraysV74.npz');sourceRows=[]
for row in source['rows']:
    i=str(row['index']);sourceRows.append(dict(name=row['name'],passed=module.Same(module.Mesh(b,row['name']),(arrays['points'+i],arrays['triangles'+i]))))
checks.append(dict(check='All237saved-source/export surfaces exact',passed=source['sourceBlendSha256']==info['sourceBlendSha256']and len(sourceRows)==237 and all(r['passed']for r in sourceRows)))
conservation=json.loads((acc/'Data_FrontSourceConservationV74.json').read_text());checks.append(dict(check='Nonremoved Hull surfaces exact and12newheads',passed=conservation['passed']and conservation['sha256']==b['sha256']))
report=dict(referenceSha256=a['sha256'],sha256=b['sha256'],checks=checks,unchangedMeshChecks=unchanged,rigChecks=rig,sourceExportChecks=sourceRows,passed=all(r['passed']for r in checks),wholeReferenceAccepted=False,secondaryPhotoAccepted=False,scope='Actual geometry/source/rig conservation only. Does not accept primary-plane3Dlocations, secondary correspondence, head dimensions or PBR.')
(acc/'Data_FrontActualConservationV74.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(passed=report['passed'],checks=len(checks),failed=[r for r in checks if not r['passed']]),indent=2));assert report['passed']
