"""Refine only the inferred V79 ear profile and add the lower raised head.

The old upper head's actual source vertex/face/UV data are copied. Image
locations are footprint observations, not mechanical axes or calibrated depth.
"""
import bpy, hashlib, importlib.util, json, math, numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

repo = Path(__file__).resolve().parents[2]
base = Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')
root = base/'FrontCornerV81'
for folder in [root, root/'Acceptance', root/'Exports', root/'Rebuild']:
    folder.mkdir(parents=True, exist_ok=True)
reference = json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GrayTrialV79.json').read_text())
inputsFile = base/'ReferenceV80/Inputs/Data_EarFeaturesV80.json'
inputs = json.loads(inputsFile.read_text())
cameraFile = base/'ReferenceV60/Inputs/Data_GeneratorEnvelopeAuditV52.json'
assert hashlib.sha256(cameraFile.read_bytes()).hexdigest() == inputs['sourceCameraFamilySha256']
for image in inputs['images'].values():
    assert hashlib.sha256(Path(image['file']).read_bytes()).hexdigest() == image['sha256']
assert hashlib.sha256(Path(reference['sourceBlend']).read_bytes()).hexdigest() == reference['sourceBlendSha256']
assert not bpy.data.filepath
bpy.ops.wm.open_mainfile(filepath=reference['sourceBlend'])
scene = bpy.context.scene
assert scene.get('BlenderMcpTask') == 'Type94Tankette'
bpy.context.view_layer.update()
asset = bpy.data.objects['Type94Tankette']
owner = 'Geometry_FrontCornerEarRight_Paint'
obj = bpy.data.objects[owner]
old = obj.data
assert len(old.vertices) == 34 and len(old.polygons) == 24
upper = obj.matrix_world @ (sum((old.vertices[i].co for i in old.polygons[11].vertices), Vector())/6)
normal = (obj.matrix_world.to_3x3() @ old.polygons[11].normal).normalized()
assert normal.y > .9
u = Vector((-1, 0, 0))
u = (u-normal*u.dot(normal)).normalized()
v = normal.cross(u).normalized()
assert v.z > 0
shift = json.loads((base/'FrontCornerV79/Acceptance/Data_FrontCornerIdentityV79.json').read_text())['groundCompensationM']
q = json.loads(cameraFile.read_text())
c = q['cameras']['2017']
assert not any(c['distortion'])
r, t, k = np.asarray(c['rotationCameraFromBlender']), np.asarray(c['translationCameraFromBlender']), np.asarray(c['k'])
eye = Vector(-r.T@t+[0, 0, shift])
pixel = inputs['rows'][1]['observed']['2017']
direction = Vector(r.T@np.r_[(np.asarray(pixel)-k[:2, 2])/[k[0, 0], k[1, 1]], 1]).normalized()
lower = eye+direction*((upper-eye).dot(normal)/direction.dot(normal))
points, polygons, owners = [], [], []
for part in asset.children_recursive:
    if part.type != 'MESH':
        continue
    offset = len(points)
    points.extend(part.matrix_world@p.co for p in part.data.vertices)
    for face in part.data.polygons:
        polygons.append([offset+i for i in face.vertices])
        owners.append(part.name)
tree = BVHTree.FromPolygons(points, polygons)
hit = tree.ray_cast(eye, direction, 100)
targetGap = (lower-eye).length-hit[3]
assert targetGap < .00015, 'Candidate crown is hidden by the retained casting; do not push it out without review'
parent = obj.parent
inverse = obj.matrix_world.inverted()

# Preserve the exact old upper-head source data. Only the pad changes and the
# second candidate is added; the old body meshes and rigid transforms stay put.
vertices = [tuple(vertex.co) for vertex in old.vertices[16:]]
faces = [[i-16 for i in face.vertices] for face in old.polygons[10:]]
uvs = [tuple(old.uv_layers.active.data[i].uv) for face in old.polygons[10:] for i in face.loop_indices]
normals = [tuple(old.corner_normals[i].vector) for face in old.polygons[10:] for i in face.loop_indices]


def Add(point):
    vertices.append(tuple(inverse@point))
    return len(vertices)-1


def Face(indices):
    faces.append(indices)
    points = [Vector(vertices[i]) for i in indices]
    n = (points[1]-points[0]).cross(points[2]-points[0]).normalized()
    tangent = (points[1]-points[0]).normalized()
    across = n.cross(tangent).normalized()
    uv = np.asarray([(point.dot(tangent), point.dot(across)) for point in points])
    minimum = uv.min(axis=0)
    span = np.maximum(uv.max(axis=0)-minimum, 1e-10)
    uvs.extend(tuple(value) for value in (uv-minimum)/span)
    normals.extend(tuple(n) for _ in indices)


w, h, thickness, bevel = .055, .090, .004, .0025
centre = upper-normal*.008-u*.010
outline = [(-w/2+bevel, -h/2), (w/2-bevel, -h/2), (w/2, -h/2+bevel), (w/2, h/2-bevel), (w/2-bevel, h/2), (-w/2+bevel, h/2), (-w/2, h/2-bevel), (-w/2, -h/2+bevel)]
offset = len(vertices)
for depth in [-thickness/2, thickness/2]:
    for x, y in outline:
        Add(centre+u*x+v*y+normal*depth)
Face([offset+i for i in reversed(range(8))])
Face([offset+i for i in range(8, 16)])
for i in range(8):
    Face([offset+i, offset+(i+1)%8, offset+8+(i+1)%8, offset+8+i])
offset = len(vertices)
headBase = lower-normal*.006
for depth, radius in [(0, .010), (.0046, .010), (.006, .0086)]:
    for i in range(6):
        angle = (i+.5)*math.tau/6
        Add(headBase+normal*depth+(u*math.cos(angle)+v*math.sin(angle))*radius)
Face([offset+i for i in reversed(range(6))])
Face([offset+i for i in range(12, 18)])
for ring in range(2):
    for i in range(6):
        Face([offset+ring*6+i, offset+ring*6+(i+1)%6, offset+(ring+1)*6+(i+1)%6, offset+(ring+1)*6+i])
mesh = bpy.data.meshes.new('Mesh_Type94FrontCornerEarPairTrialV81')
mesh.from_pydata(vertices, [], faces)
mesh.update()
for material in old.materials:
    mesh.materials.append(material)
uv = mesh.uv_layers.new(name='UVMap')
for loop, value in zip(uv.data, uvs):
    loop.uv = value
mesh.normals_split_custom_set(normals)
obj.data = mesh
obj['ReferenceScope'] = 'Two native-photo raised head footprints; precise section, attachment and depth inferred'
obj['ProfileAndDimensionsInferred'] = True
obj['LowerHeadFunctionAndSectionInferred'] = True
obj['EarHeadCountTrial'] = 2
obj['ReferenceObservations'] = 'ReferenceV80/Inputs/Data_EarFeaturesV80.json'
scene['FrontCornerStudyRevision'] = 'ShapeV81FrontCornerEarPairTrial'
scene['WholeReferenceAccepted'] = False
scene['SurfaceUvRegenerationRequired'] = True
blend = root/'Scene_Type94TanketteHighShapeV81FrontCornerPairTrial.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.wm.open_mainfile(filepath=str(blend))
bpy.ops.object.select_all(action='DESELECT')
asset = bpy.data.objects['Type94Tankette']
for part in [asset, *asset.children_recursive]:
    part.select_set(True)
file = repo/'Taierzhuang1938/_blender/Script_Type94Export.py'
spec = importlib.util.spec_from_file_location('Ear81Exporter', file)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
glb = root/'Exports/Model_Type94TanketteHighShapeV81FrontCornerPairTrial.glb'
module.ExportGltf(glb)


def Project(point, camera):
    p = np.asarray(point)-[0, 0, shift]
    cv = np.asarray(camera['rotationCameraFromBlender'])@p+camera['translationCameraFromBlender']
    x, y = cv[:2]/cv[2]
    d, k = camera['distortion'], camera['k']
    rr = x*x+y*y
    scale = 1+d[0]*rr+d[1]*rr*rr+(d[4] if len(d)>4 else 0)*rr**3
    return [(x*scale+2*d[2]*x*y+d[3]*(rr+2*x*x))*k[0][0]+k[0][2], (y*scale+d[2]*(rr+2*y*y)+2*d[3]*x*y)*k[1][1]+k[1][2]]


heads = [dict(name=record['name'], worldM=list(point), fitFrameM=list(point-Vector((0, 0, shift))), observed=record['observed'], sigmaNative=record['sigmaNative'], predictions={key: Project(point, camera) for key, camera in q['cameras'].items()}) for point, record in zip([upper, lower], inputs['rows'])]
report = dict(sourceReference='Data_GrayTrialV79.json', sourceBlend=str(blend), sourceBlendSha256=hashlib.sha256(blend.read_bytes()).hexdigest(), sourceGlb=str(glb), sha256=hashlib.sha256(glb.read_bytes()).hexdigest(), baseSha256=reference['sha256'], owner=owner, earTriangles=92, triangles=622112, meshOwners=238, poseNodes=293, heads=heads, groundCompensationM=shift, oldUpperHeadSourceDataCopied=True, oldModelFirstOwnerAtLowerCandidate=owners[hit[2]], oldModelTargetGapM=targetGap, profile=dict(widthM=w, heightM=h, thicknessM=thickness, lateralCentreShiftM=.010, headRadiusM=.010, headHeightM=.006), observationsFile=str(inputsFile), observationsSha256=hashlib.sha256(inputsFile.read_bytes()).hexdigest(), profileAndDepthInferred=True, secondaryReferenceAccepted=False, wholeReferenceAccepted=False, newUvsProvisional=True)
(root/'Acceptance/Data_EarPairIdentityV81.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(dict(sha256=report['sha256'], lowerOldModelFirstOwner=owners[hit[2]], lowerOldTargetGapM=targetGap, headPredictions=[h['predictions'] for h in heads])), flush=True)
