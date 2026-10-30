"""Actual casing-head surfaces, independent of construction point labels."""
import ast, bpy, hashlib, json, numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

repo = Path(__file__).resolve().parents[2]
base = Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')
root = base/'ReferenceV82'
for path in [root/'Inputs', root/'Acceptance', root/'Rebuild']:
    path.mkdir(parents=True, exist_ok=True)
m = json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GrayTrialV81.json').read_text())
assert hashlib.sha256(Path(m['sourceBlend']).read_bytes()).hexdigest() == m['sourceBlendSha256']
assert not bpy.data.filepath
bpy.ops.wm.open_mainfile(filepath=m['sourceBlend'])
assert bpy.context.scene.get('BlenderMcpTask') == 'Type94Tankette'
bpy.context.view_layer.update()
asset = bpy.data.objects['Type94Tankette']
shift = json.loads((base/'FrontCornerV81/Acceptance/Data_EarPairIdentityV81.json').read_text())['groundCompensationM']
syntax = ast.parse((repo/'Taierzhuang1938/_blender/Script_Type94GameTrial.py').read_text())
scope = {}
exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n, ast.FunctionDef) and n.name=='LooseParts'], type_ignores=[]), '<actual source components>', 'exec'), scope)
points, faces, owners = [], [], []
for obj in asset.children_recursive:
    if obj.type != 'MESH':
        continue
    offset = len(points)
    points.extend(obj.matrix_world@p.co for p in obj.data.vertices)
    for face in obj.data.polygons:
        faces.append([offset+i for i in face.vertices])
        owners.append(obj.name)
fullTree = BVHTree.FromPolygons(points, faces)
q = json.loads((base/'ReferenceV60/Inputs/Data_GeneratorEnvelopeAuditV52.json').read_text())


def Project(point, c):
    p = np.asarray(point)-[0, 0, shift]
    v = np.asarray(c['rotationCameraFromBlender'])@p+c['translationCameraFromBlender']
    x, y = v[:2]/v[2]
    d, k = c['distortion'], c['k']
    rr = x*x+y*y
    s = 1+d[0]*rr+d[1]*rr*rr+(d[4] if len(d)>4 else 0)*rr**3
    return [(x*s+2*d[2]*x*y+d[3]*(rr+2*x*x))*k[0][0]+k[0][2], (y*s+d[2]*(rr+2*y*y)+2*d[3]*x*y)*k[1][1]+k[1][2]]


records = []
for side in ['Left', 'Right']:
    obj = bpy.data.objects['Geometry_FinalDriveHousing'+side+'_Paint']
    mesh = obj.data
    rows = []
    for index, component in enumerate(scope['LooseParts'](mesh)):
        ids = sorted({i for f in component for i in mesh.polygons[f].vertices})
        p = np.asarray([list(obj.matrix_world@mesh.vertices[i].co) for i in ids])
        extents = np.ptp(p, axis=0)
        if not (.004 < max(extents) < .030):
            continue
        centre = p.mean(axis=0)
        values, vectors = np.linalg.eigh(np.cov((p-centre).T))
        normal = vectors[:, np.argmin(values)]
        if normal[1] < 0:
            normal = -normal
        localFaces = [[ids.index(i) for i in mesh.polygons[f].vertices] for f in component]
        tree = BVHTree.FromPolygons([Vector(point) for point in p], localFaces)
        hit = tree.ray_cast(Vector(centre+normal*.04), Vector(-normal), .08)
        assert hit[2] is not None
        crown = np.asarray(hit[0])
        visibility = []
        for name, camera in q['cameras'].items():
            r, t = np.asarray(camera['rotationCameraFromBlender']), np.asarray(camera['translationCameraFromBlender'])
            eye = -r.T@t+[0, 0, shift]
            delta = crown-eye
            nearest = fullTree.ray_cast(Vector(eye), Vector(delta).normalized(), float(np.linalg.norm(delta))+.002)
            gap = float(np.linalg.norm(delta))-nearest[3] if nearest[2] is not None else None
            visibility.append(dict(camera=name, predictedNative=Project(crown, camera), currentModelVisible=nearest[2] is not None and abs(gap)<.00015, currentModelFirstOwner=owners[nearest[2]] if nearest[2] is not None else None, distanceBeforeCrownM=gap, photographicVisibilityNotEstablished=True))
        rows.append(dict(side=side, componentIndex=index, owner=obj.name, actualSourceFaces=component, uniqueSourceVertices=ids, crownWorldM=crown.tolist(), crownFitFrameM=(crown-[0, 0, shift]).tolist(), footprintCentreWorldM=centre.tolist(), thicknessPrincipalAxis=normal.tolist(), sourceAxisAngleDegrees=float(np.degrees(np.arctan2(normal[2], normal[1]))), worldExtentsM=extents.tolist(), sourceEigenvalues=values.tolist(), visibility=visibility, photoIdentityConfirmed=False))
    assert len(rows) == 5
    rows.sort(key=lambda row: -row['crownWorldM'][2])
    for index, row in enumerate(rows):
        row['name'] = side+'CasingCrown'+str(index)
    records.extend(rows)
report = dict(schema='Type94ActualCasingCrownDatumsV1', sourceManifest='Data_GrayTrialV81.json', sourceBlendSha256=m['sourceBlendSha256'], sourceGlbSha256=m['sha256'], groundCompensationM=shift, records=records, sourceReadOnly=True, geometryChanged=False, cameraAdopted=False, wholeReferenceAccepted=False, scope='Actual small disconnected casing surfaces and ray crowns, with current-model visibility only. Principal surface directions do not establish mechanical axes or photographic correspondence.')
(root/'Inputs/Data_ActualCasingCrownsV82.json').write_text(json.dumps(report, indent=2)+'\n')
assert hashlib.sha256(Path(m['sourceBlend']).read_bytes()).hexdigest() == m['sourceBlendSha256']
print(json.dumps(dict(crowns=len(records), primaryVisible={side:sum(r['visibility'][0]['currentModelVisible'] for r in records if r['side']==side) for side in ['Left', 'Right']})), flush=True)
