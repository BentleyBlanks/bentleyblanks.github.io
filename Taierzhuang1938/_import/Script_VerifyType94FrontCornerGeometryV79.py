"""Exact surface conservation for a single added mounting-ear gray trial."""
from pathlib import Path
import importlib.util, json, struct, numpy as np

repo = Path(__file__).resolve().parents[2]
base = Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')
root = base/'FrontCornerV79'
m = json.loads((root/'Acceptance/Data_FrontCornerIdentityV79.json').read_text())
native = json.loads((root/'Acceptance/Data_FrontCornerNativeV79.json').read_text())
old = json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GrayTrialV74.json').read_text())
spec = importlib.util.spec_from_file_location('Corner79Surface', Path(__file__).with_name('Script_VerifyType94GeometryReplay.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
baseline = module.ReadGeometry(Path(old['sourceGlb']))
candidate = module.ReadGeometry(Path(m['sourceGlb']))
reexport = module.ReadGeometry(Path(native['sourceReexport']))
checks = []


def Check(value, label):
    checks.append(dict(passed=bool(value), check=label))


def Exact(a, b):
    _, ids = np.unique(np.vstack((a['points'], b['points'])), axis=0, return_inverse=True)
    i, j = ids[:len(a['points'])], ids[len(a['points']):]
    return np.array_equal(np.unique(i), np.unique(j)) and np.array_equal(module.CanonicalFaces(a['triangles'], i), module.CanonicalFaces(b['triangles'], j))


Check(set(candidate['meshes'])-set(baseline['meshes']) == {m['newOwner']}, 'Exactly one declared new mesh owner')
Check(len(baseline['meshes']) == 237 and len(candidate['meshes']) == 238, '237 old surfaces and one added local fitting')
for name, surface in baseline['meshes'].items():
    Check(Exact(surface, candidate['meshes'][name]), 'V74 surface exact: '+name)
for name, surface in candidate['meshes'].items():
    Check(Exact(surface, reexport['meshes'][name]), 'Saved source reexport surface exact: '+name)
Check(np.array_equal(baseline['rootMatrix'], candidate['rootMatrix']), 'Root grounding and coordinate frame exact')
Check(len(candidate['meshes'][m['newOwner']]['triangles']) == 60, 'Only 60 triangles added')
oldPoints = np.vstack([surface['points'] for surface in baseline['meshes'].values()])
newPoints = np.vstack([surface['points'] for surface in candidate['meshes'].values()])
oldBounds = np.asarray([oldPoints.min(axis=0), oldPoints.max(axis=0)])
newBounds = np.asarray([newPoints.min(axis=0), newPoints.max(axis=0)])
Check(np.array_equal(oldBounds, newBounds), 'Whole-asset bounds and dimensions unchanged')


def Nodes(file):
    payload = Path(file).read_bytes()
    length = struct.unpack_from('<I', payload, 12)[0]
    nodes = json.loads(payload[20:20+length])['nodes']
    parents = {child: node['name'] for node in nodes for child in node.get('children', [])}
    return {node['name']: dict(parent=parents.get(index), pose={k: node.get(k) for k in ['matrix', 'translation', 'rotation', 'scale']}, properties=node.get('extras', {})) for index, node in enumerate(nodes)}


a, b = Nodes(old['sourceGlb']), Nodes(m['sourceGlb'])
Check(len(a) == 292 and len(b) == 293, 'Exactly one new rigid scene node')
for name, node in a.items():
    Check(node == b[name], 'Existing pose and properties exact: '+name)
Check(b[m['newOwner']]['parent'] == 'FinalDriveHousingRight', 'Declared static parent; wheel articulation remains separate')
report = dict(passed=all(c['passed'] for c in checks), checks=checks, baseSha256=old['sha256'], sha256=m['sha256'], sourceReexportSha256=native['sourceReexportSha256'], unchangedMeshOwners=237, newMeshOwners=1, unchangedPoseNodes=292, newTriangles=60, dimensionsWidthHeightLengthM=(newBounds[1]-newBounds[0]).tolist(), newUvsProvisional=True, wholeReferenceAccepted=False)
(root/'Acceptance/Data_FrontCornerGeometryV79.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(dict(passed=report['passed'], checks=len(checks), failed=[c for c in checks if not c['passed']])))
assert report['passed']
