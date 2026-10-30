"""Conserve the old body, rigid poses and actual upper-head surface."""
from pathlib import Path
import importlib.util, json, struct, numpy as np

repo = Path(__file__).resolve().parents[2]
base = Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')
root = base/'FrontCornerV81'
m = json.loads((root/'Acceptance/Data_EarPairIdentityV81.json').read_text())
native = json.loads((root/'Acceptance/Data_FrontCornerNativeV81.json').read_text())
old = json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GrayTrialV79.json').read_text())
spec = importlib.util.spec_from_file_location('Ear81Surfaces', Path(__file__).with_name('Script_VerifyType94GeometryReplay.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
a = module.ReadGeometry(Path(old['sourceGlb']))
b = module.ReadGeometry(Path(m['sourceGlb']))
c = module.ReadGeometry(Path(native['sourceReexport']))
checks = []


def Check(value, label):
    checks.append(dict(passed=bool(value), check=label))


def Exact(x, y):
    _, ids = np.unique(np.vstack((x['points'], y['points'])), axis=0, return_inverse=True)
    p, q = ids[:len(x['points'])], ids[len(x['points']):]
    return np.array_equal(np.unique(p), np.unique(q)) and np.array_equal(module.CanonicalFaces(x['triangles'], p), module.CanonicalFaces(y['triangles'], q))


Check(a['meshes'].keys() == b['meshes'].keys() and len(b['meshes']) == 238, 'Same 238 named mesh owners')
for name, surface in a['meshes'].items():
    if name != m['owner']:
        Check(Exact(surface, b['meshes'][name]), 'Unchanged body surface: '+name)
for name, surface in b['meshes'].items():
    Check(Exact(surface, c['meshes'][name]), 'Actual saved-source reexport surface: '+name)
Check(len(b['meshes'][m['owner']]['triangles']) == 92, 'One revised pad with two candidate heads; 92triangles')
oldPoints = np.vstack([s['points'] for s in a['meshes'].values()])
newPoints = np.vstack([s['points'] for s in b['meshes'].values()])
oldBounds = np.asarray([oldPoints.min(axis=0), oldPoints.max(axis=0)])
newBounds = np.asarray([newPoints.min(axis=0), newPoints.max(axis=0)])
Check(np.array_equal(oldBounds, newBounds), 'Whole-vehicle bounds exact')


def Components(surface):
    points, ids = np.unique(surface['points'], axis=0, return_inverse=True)
    faces = ids[surface['triangles']]
    parent = list(range(len(points)))
    def Root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for face in faces:
        for i in face[1:]:
            parent[Root(int(i))] = Root(int(face[0]))
    groups = {}
    for index in range(len(points)):
        groups.setdefault(Root(index), []).append(index)
    return [dict(points=points, triangles=faces[np.isin(faces[:, 0], group)]) for group in groups.values()]


oldParts, newParts = Components(a['meshes'][m['owner']]), Components(b['meshes'][m['owner']])
head = next(s for s in oldParts if len(np.unique(s['triangles'])) == 18)
# Components retain the full site table; narrow to the actual component sites
# before comparison so unrelated pad vertices are not counted as head sites.
def Narrow(surface):
    used, ids = np.unique(surface['triangles'], return_inverse=True)
    return dict(points=surface['points'][used], triangles=ids.reshape(-1, 3))
head = Narrow(head)
Check(sum(Exact(head, Narrow(s)) for s in newParts) == 1, 'Actual old upper-head oriented surface exactly preserved')
Check(len(oldParts) == 2 and len(newParts) == 3, 'Pad plus one head becomes pad plus two heads')


def Nodes(file):
    payload = Path(file).read_bytes()
    size = struct.unpack_from('<I', payload, 12)[0]
    nodes = json.loads(payload[20:20+size])['nodes']
    parents = {child: node['name'] for node in nodes for child in node.get('children', [])}
    return {node['name']: dict(parent=parents.get(i), pose={k: node.get(k) for k in ['matrix', 'translation', 'rotation', 'scale']}, properties=node.get('extras', {})) for i, node in enumerate(nodes)}


na, nb = Nodes(old['sourceGlb']), Nodes(m['sourceGlb'])
Check(na.keys() == nb.keys() and len(nb) == 293, 'Same 293 scene nodes')
for name, node in na.items():
    Check(node['pose'] == nb[name]['pose'] and node['parent'] == nb[name]['parent'], 'Rigid pose and parent exact: '+name)
    if name != m['owner']:
        Check(node['properties'] == nb[name]['properties'], 'Existing control properties exact: '+name)
report = dict(passed=all(c['passed'] for c in checks), checks=checks, sha256=m['sha256'], unchangedBodyMeshOwners=237, rigidNodes=293, upperHeadSurfaceExact=True, dimensionsWidthHeightLengthM=(newBounds[1]-newBounds[0]).tolist(), sourceReexportSha256=native['sourceReexportSha256'], profileAndDepthInferred=True, wholeReferenceAccepted=False)
(root/'Acceptance/Data_EarPairGeometryV81.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(dict(passed=report['passed'], checks=len(checks), failed=[r for r in checks if not r['passed']])))
assert report['passed']
