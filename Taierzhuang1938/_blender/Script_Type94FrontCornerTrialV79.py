"""Isolated photo-supported mounting-ear study, not final casting acceptance.

The 2017 and 2014 photos show a raised fitting at the far front corner. Its
attachment, depth and precise section remain inferred. The conditional primary
camera and existing casting provide a provisional placement, not metrology.
"""
import bpy, hashlib, importlib.util, json, math, numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

repo = Path(__file__).resolve().parents[2]
base = Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')
root = base / 'FrontCornerV79'
for path in [root, root / 'Acceptance', root / 'Exports', root / 'Rebuild']:
    path.mkdir(parents=True, exist_ok=True)
reference = json.loads((repo / 'Taierzhuang1938/Model/Type94Tankette/Data_GrayTrialV74.json').read_text())
assert hashlib.sha256(Path(reference['sourceBlend']).read_bytes()).hexdigest() == reference['sourceBlendSha256']
assert not bpy.data.filepath
bpy.ops.wm.open_mainfile(filepath=reference['sourceBlend'])
scene = bpy.context.scene
assert scene.get('BlenderMcpTask') == 'Type94Tankette'
bpy.context.view_layer.update()
asset = bpy.data.objects['Type94Tankette']
datums = json.loads((base / 'ReferenceV73/Inputs/Data_ActualFrontCrownsV73.json').read_text())
observations = json.loads((base / 'ReferenceV73/Inputs/Data_FrontFastenerObservationsV73.json').read_text())
q = json.loads((base / 'ReferenceV60/Inputs/Data_GeneratorEnvelopeAuditV52.json').read_text())
shift = datums['groundCompensationM']
points, polygons, owners = [], [], []
for obj in asset.children_recursive:
    if obj.type != 'MESH':
        continue
    offset = len(points)
    points.extend(obj.matrix_world @ v.co for v in obj.data.vertices)
    for face in obj.data.polygons:
        polygons.append([offset + i for i in face.vertices])
        owners.append(obj.name)
tree = BVHTree.FromPolygons(points, polygons)


def Ray(pixel, camera):
    r = np.asarray(camera['rotationCameraFromBlender'])
    t = np.asarray(camera['translationCameraFromBlender'])
    k = np.asarray(camera['k'])
    # The retained primary lens has exactly zero distortion.
    assert not any(camera['distortion'])
    eye = Vector(-r.T @ t + [0, 0, shift])
    direction = Vector(r.T @ np.r_[(np.asarray(pixel) - k[:2, 2]) / [k[0, 0], k[1, 1]], 1]).normalized()
    return eye, direction


def Project(point, camera):
    p = np.asarray(point) - [0, 0, shift]
    c = np.asarray(camera['rotationCameraFromBlender']) @ p + camera['translationCameraFromBlender']
    x, y = c[:2] / c[2]
    d, k = camera['distortion'], camera['k']
    r2 = x*x + y*y
    scale = 1 + d[0]*r2 + d[1]*r2*r2 + (d[4] if len(d) > 4 else 0)*r2*r2*r2
    return [(x*scale + 2*d[2]*x*y + d[3]*(r2+2*x*x))*k[0][0]+k[0][2], (y*scale + d[2]*(r2+2*y*y)+2*d[3]*x*y)*k[1][1]+k[1][2]]


rayAudit = []
for record in observations['rows']:
    if record['name'] not in ['FarUpperEdge', 'NearMiddleEdge', 'NearBottomEdge']:
        continue
    eye, direction = Ray(record['observedNative'], q['cameras']['2017'])
    hit = tree.ray_cast(eye, direction, 100)
    target = Vector(record['fitFrameCrownOnConditionalPlaneM']) + Vector((0, 0, shift))
    row = dict(name=record['name'], observedNative=record['observedNative'], currentModelFirstOwner=owners[hit[2]] if hit[2] is not None else None, distanceBeforeConditionalFrontCrownM=(target-eye).length-hit[3] if hit[2] is not None else None, modelSurfaceHitWorldM=list(hit[0]) if hit[2] is not None else None, photoIdentityNotEstablishedByRaycast=True)
    rayAudit.append(row)
    if record['name'] == 'FarUpperEdge':
        anchorHit, eye, direction = hit[0].copy(), eye.copy(), direction.copy()
assert rayAudit[0]['currentModelFirstOwner'] == 'Geometry_FinalDriveHousingRight_Paint'
normal = Vector(datums['frontNormal']).normalized()
u = Vector((-1, 0, 0))
v = normal.cross(u).normalized()
assert v.z > 0
frontPlane = anchorHit + normal * .004
crownPlane = frontPlane + normal * .006
eye, direction = Ray([797, 1824], q['cameras']['2017'])
crown = eye + direction * ((crownPlane-eye).dot(normal) / direction.dot(normal))
earCentre = crown - normal*.008 - v*.020
parent = bpy.data.objects['FinalDriveHousingRight']
inverse = parent.matrix_world.inverted()
vertices, faces = [], []


def Add(point):
    vertices.append(tuple(inverse @ point))
    return len(vertices)-1


# A shallow clipped-corner pad. Exact section, thickness, backing and depth are
# inferred; no weld pattern or manufacturing method is claimed.
w, h, bevel, thickness = .045, .100, .0025, .004
outline = [(-w/2+bevel, -h/2), (w/2-bevel, -h/2), (w/2, -h/2+bevel), (w/2, h/2-bevel), (w/2-bevel, h/2), (-w/2+bevel, h/2), (-w/2, h/2-bevel), (-w/2, -h/2+bevel)]
for depth in [-thickness/2, thickness/2]:
    for x, y in outline:
        Add(earCentre+u*x+v*y+normal*depth)
faces.extend([list(reversed(range(8))), list(range(8, 16))])
for i in range(8):
    faces.append([i, (i+1)%8, 8+(i+1)%8, 8+i])
offset = len(vertices)
headBase = crown-normal*.006
for depth, radius in [(0, .010), (.0046, .010), (.006, .0086)]:
    for i in range(6):
        a = (i+.5)*math.tau/6
        Add(headBase+normal*depth+(u*math.cos(a)+v*math.sin(a))*radius)
faces.extend([[offset+i for i in reversed(range(6))], [offset+i for i in range(12, 18)]])
for ring in range(2):
    for i in range(6):
        faces.append([offset+ring*6+i, offset+ring*6+(i+1)%6, offset+(ring+1)*6+(i+1)%6, offset+(ring+1)*6+i])
mesh = bpy.data.meshes.new('Mesh_Type94FrontCornerEarRightTrialV79')
mesh.from_pydata(vertices, [], faces)
mesh.update()
assert mesh.polygons[11].normal.dot((inverse.to_3x3() @ normal).normalized()) > .99
obj = bpy.data.objects.new('Geometry_FrontCornerEarRight_Paint', mesh)
scene.collection.objects.link(obj)
obj.parent = parent
mesh.materials.append(next(m for m in bpy.data.objects['Geometry_FinalDriveHousingRight_Paint'].data.materials if m.name.startswith('Material_Type94Paint')))
uv = mesh.uv_layers.new(name='UVMap')
for face in mesh.polygons:
    points = [mesh.vertices[i].co for i in face.vertices]
    tangent = (points[1]-points[0]).normalized()
    across = face.normal.cross(tangent).normalized()
    p = [(point.dot(tangent), point.dot(across)) for point in points]
    low = np.min(p, axis=0)
    size = np.maximum(np.max(p, axis=0)-low, 1e-10)
    for loop, point in zip(face.loop_indices, p):
        uv.data[loop].uv = (np.asarray(point)-low)/size
obj['ReferenceScope'] = 'Visible raised far-front fitting in Kubinka2017 and2014; projected centre confirmed only at feature identity level'
obj['PlacementScope'] = 'Conditional primary camera, current-casting first hit plus4mm shallow pad; depth and all profile dimensions inferred'
obj['ParentAttachmentInferred'] = True
obj['ProfileAndDimensionsInferred'] = True
obj['SecondaryViewsAccepted'] = False
scene['FrontCornerStudyRevision'] = 'ShapeV79FrontCornerEarTrial'
scene['WholeReferenceAccepted'] = False
scene['SurfaceUvRegenerationRequired'] = True
blend = root / 'Scene_Type94TanketteHighShapeV79FrontCornerTrial.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.wm.open_mainfile(filepath=str(blend))
bpy.ops.object.select_all(action='DESELECT')
asset = bpy.data.objects['Type94Tankette']
for part in [asset, *asset.children_recursive]:
    part.select_set(True)
file = repo / 'Taierzhuang1938/_blender/Script_Type94Export.py'
spec = importlib.util.spec_from_file_location('Corner79Exporter', file)
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)
glb = root / 'Exports/Model_Type94TanketteHighShapeV79FrontCornerTrial.glb'
exporter.ExportGltf(glb)
predicted = {key: Project(crown, camera) for key, camera in q['cameras'].items()}
report = dict(sourceReference='Data_GrayTrialV74.json', sourceBlend=str(blend), sourceBlendSha256=hashlib.sha256(blend.read_bytes()).hexdigest(), sourceGlb=str(glb), sha256=hashlib.sha256(glb.read_bytes()).hexdigest(), baseSha256=reference['sha256'], newOwner='Geometry_FrontCornerEarRight_Paint', newTriangles=sum(len(face)-2 for face in faces), observedPrimary=[797, 1824], observed2014Tentative=[747, 1871], sigma2014Native=6, predictions=predicted, crownWorldM=list(crown), crownFitFrameM=list(crown-Vector((0, 0, shift))), groundCompensationM=shift, bodyRayAudit=rayAudit, profile=dict(widthM=w, heightM=h, thicknessM=thickness, headRadiusM=.010, headHeightM=.006), profileAndDepthInferred=True, attachmentOwnershipInferred=True, lowerEarHeadNotYetIdentified=True, primaryIsTraining=True, secondaryViewsAccepted=False, wholeReferenceAccepted=False, newUvsProvisional=True, canonicalGameReplaced=False)
(root/'Acceptance/Data_FrontCornerIdentityV79.json').write_text(json.dumps(report, indent=2)+'\n')
(base/'ReferenceV78/Acceptance/Data_FrontCornerRayAuditV78.json').write_text(json.dumps(dict(rows=rayAudit, physicalOwnershipCannotBeDeducedFromModelRays=True), indent=2)+'\n')
print(json.dumps(dict(sha256=report['sha256'], newTriangles=report['newTriangles'], newOwner=report['newOwner'], predictions=predicted, currentModelRayOwners=[r['currentModelFirstOwner'] for r in rayAudit])), flush=True)
