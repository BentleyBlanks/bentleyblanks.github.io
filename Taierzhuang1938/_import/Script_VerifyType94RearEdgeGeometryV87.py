"""Exact scope and persisted-source conservation for the rear-taper trial."""
from pathlib import Path
import importlib.util, json, struct, numpy as np

repo=Path(__file__).resolve().parents[2]
base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')
root=base/'NoseV87'
m=json.loads((root/'Acceptance/Data_RearEdgeIdentityV87.json').read_text())
native=json.loads((root/'Acceptance/Data_RearEdgeNativeV87.json').read_text())
old=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GrayTrialV85.json').read_text())
spec=importlib.util.spec_from_file_location('Rear87Geometry',Path(__file__).with_name('Script_VerifyType94GeometryReplay.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
a=module.ReadGeometry(Path(old['sourceGlb']))
b=module.ReadGeometry(Path(m['sourceGlb']))
c=module.ReadGeometry(Path(native['sourceReexport']))
checks=[]


def Check(value,label):
    checks.append(dict(passed=bool(value),check=label))


def Exact(x,y):
    _,ids=np.unique(np.vstack((x['points'],y['points'])),axis=0,return_inverse=True)
    i,j=ids[:len(x['points'])],ids[len(x['points']):]
    return np.array_equal(np.unique(i),np.unique(j)) and np.array_equal(module.CanonicalFaces(x['triangles'],i),module.CanonicalFaces(y['triangles'],j))


Check(a['meshes'].keys()==b['meshes'].keys() and len(b['meshes'])==238,'Same 238 named mesh owners')
for name,surface in a['meshes'].items():
    if name!=m['changedOwner']:
        Check(Exact(surface,b['meshes'][name]),'Unchanged surface exact: '+name)
Check(not Exact(a['meshes'][m['changedOwner']],b['meshes'][m['changedOwner']]),'The declared cowl surface actually changes')
for name,surface in b['meshes'].items():
    Check(Exact(surface,c['meshes'][name]),'Actual saved-source reexport surface exact: '+name)
pa=np.vstack([s['points']for s in a['meshes'].values()])
pb=np.vstack([s['points']for s in b['meshes'].values()])
ba=np.asarray([pa.min(axis=0),pa.max(axis=0)])
bb=np.asarray([pb.min(axis=0),pb.max(axis=0)])
Check(np.array_equal(ba,bb),'Whole-asset bounds and dimensions exact')
triangles=sum(len(s['triangles'])for s in b['meshes'].values())
Check(triangles==622080,'Declared high-trial triangle count;32fewer triangles within revised cowl')


def Nodes(file):
    payload=Path(file).read_bytes();size=struct.unpack_from('<I',payload,12)[0]
    nodes=json.loads(payload[20:20+size])['nodes']
    parents={child:node['name']for node in nodes for child in node.get('children',[])}
    return{node['name']:dict(parent=parents.get(i),pose={k:node.get(k)for k in ['matrix','translation','rotation','scale']},properties=node.get('extras',{}))for i,node in enumerate(nodes)}


na,nb=Nodes(old['sourceGlb']),Nodes(m['sourceGlb'])
Check(na.keys()==nb.keys() and len(nb)==293,'Same 293 scene nodes')
for name,node in na.items():
    Check(node['parent']==nb[name]['parent'] and node['pose']==nb[name]['pose'],'Rigid pose and parent exact: '+name)
    if name!='NoseHousing':
        Check(node['properties']==nb[name]['properties'],'Existing properties exact: '+name)
report=dict(passed=all(c['passed']for c in checks),checks=checks,sha256=m['sha256'],sourceReexportSha256=native['sourceReexportSha256'],unchangedMeshOwners=237,unchangedRigidPoses=293,dimensionsWidthHeightLengthM=(bb[1]-bb[0]).tolist(),triangles=triangles,rearRiseInferred=True,wholeReferenceAccepted=False)
(root/'Acceptance/Data_RearEdgeGeometryV87.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(passed=report['passed'],checks=len(checks),failed=[c for c in checks if not c['passed']])))
assert report['passed']
