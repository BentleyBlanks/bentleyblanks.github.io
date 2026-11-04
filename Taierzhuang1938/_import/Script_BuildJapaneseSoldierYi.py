"""Rebuild Yi V2 from the preserved, fitted five-part V1 Blender project.

Run with scripts/Script_BlenderMcp.mjs exec --file. The V1 source and references
remain in OneDrive; the new editable project is saved beside, never over V1.
Repairs the havelock's actual holes with a continuous inset cloth lining, removes
the overlapping V1 bridge strips, and reprojects the patterned inner faces onto
the same cap's exterior cloth. A residual hand roll is measured from the four
fingers, with the thumb excluded, and corrected symmetrically at the wrist.
The head is preserved; the hem, lower-leg stance and visor receive measured
local silhouette corrections. No original input or V1 project is overwritten.
"""
import bpy
import hashlib
import json
import math
import os
from pathlib import Path

import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

SOURCE = Path(os.environ.get('YI_SOURCE_BLEND', r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\YiPartsMerge_20261104\Yi_PartsMerge_V1.blend'))
WORK = Path(os.environ.get('YI_WORK', r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\YiPartsMerge_20261104V2'))
ASSETS = Path(os.environ.get('YI_ASSETS', r'C:\Users\Bentl\OneDrive\Sync\饮河\FPS\角色\Tripo\15_日兵乙'))
NAME = 'JapaneseSoldierYi_Merged_V2'
SOURCE_SHA256 = 'd45c585658912648b5e805b379d056c711c4afc3c7297846ae274404c19aaff4'
PARTS = ['Body_A', 'Head_A', 'Hat_A', 'Hand_L', 'Foot_R', 'Hand_R', 'Foot_L', 'HatBridge']


def Key(co):
    return tuple(round(float(v), 6) for v in co)


def Smooth(a, b, x):
    t = min(1., max(0., (x-a)/(b-a)))
    return t*t*(3-2*t)


def FitReference(co, part):
    p = co.copy()
    if part == 0:
        d = abs(p.z-.877)/.125
        hem = (1+math.cos(math.pi*d))*.5 if d < 1 else 0.
        p.x *= 1-.079*hem
        p.y *= 1+.072*hem
        p.x -= (.015 if p.x >= 0 else -.015)*(1-Smooth(.150,.650,p.z))
    elif part in (4,6):
        p.x -= .015 if p.x >= 0 else -.015
    elif part == 2 and p.y < -.100:
        p.y += .027*Smooth(.100,.185,-p.y)*(1-Smooth(1.750,1.780,p.z))
    return p


def Main():
    WORK.mkdir(parents=True, exist_ok=True)
    sc = bpy.data.scenes['Scene']
    bpy.context.window.scene = sc
    old = bpy.data.objects['JapaneseSoldierYi_Merged_V1']
    old.data.calc_loop_triangles()
    me = old.data
    labels = {}
    for part, name in enumerate(PARTS):
        for v in bpy.data.objects[name].data.vertices:
            labels.setdefault(Key(v.co), part)
            if name == 'HatBridge':
                labels.setdefault(Key((-v.co.x, v.co.y, v.co.z)), part)
    partByVertex = [labels.get(Key(v.co), -1) for v in me.vertices]
    assert -1 not in partByVertex, 'Unexpected source geometry: missing part identity'
    verts = [v.co.copy() for v in me.vertices]
    originalPositions = np.array(verts)
    leftHand = np.array([v.co[:] for v in bpy.data.objects['Hand_L'].data.vertices])
    fingerSample = leftHand[(leftHand[:, 0] > .805) & (leftHand[:, 0] < .842), 1:]
    fingerSample -= fingerSample.mean(0)
    eigenvalues, eigenvectors = np.linalg.eigh(fingerSample.T @ fingerSample)
    major = eigenvectors[:, -1]
    if major[0] < 0:
        major = -major
    handRoll = math.atan2(major[1], major[0])
    handRotation = Matrix.Rotation(-handRoll, 3, 'X')
    handPivot = Vector((0, .031, 1.444))
    normalTransforms = {}
    for i, part in enumerate(partByVertex):
        if part in (3, 5):
            verts[i] = handPivot + handRotation @ (verts[i] - handPivot)
        elif part in (0,2,4,6):
            sourcePoint = verts[i]
            verts[i] = FitReference(sourcePoint,part)
            if part in (0,2):
                step = .0001
                columns = []
                for axis in range(3):
                    delta = Vector(tuple(step if k == axis else 0 for k in range(3)))
                    columns.append((FitReference(sourcePoint+delta,part)-FitReference(sourcePoint-delta,part))/(2*step))
                jacobian = Matrix(columns).transposed()
                normalTransforms[i] = jacobian.inverted().transposed()
    uv = me.uv_layers.active.data
    # The BVH contains only the cap, so cloth UV projection cannot hit the skin.
    capTris = [t for t in me.loop_triangles if all(partByVertex[v] == 2 for v in t.vertices)]
    # Every projected face stays inside ONE real rear-cloth UV triangle.
    # Projecting its corners onto different atlas islands would interpolate
    # through unrelated skin/garment texels and create conspicuous stripes.
    patches = []
    for tri in capTris:
        center = sum((verts[i] for i in tri.vertices), Vector()) / 3
        if not (center.y > .06 and 1.56 < center.z < 1.69 and tri.normal.y > .20):
            continue
        a,b,c = [uv[i].uv.copy() for i in tri.loops]
        la,lb,lc = (b-c).length,(a-c).length,(a-b).length
        perimeter = la+lb+lc
        area2 = abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))
        if perimeter > 1e-8:
            patches.append((area2/perimeter, (a*la+b*lb+c*lc)/perimeter))
    patchRadius, patchCenter = max(patches, key=lambda patch:patch[0])

    def ClothFaceUv(points):
        center = sum(points,Vector())/len(points)
        tangent = Vector((-(center.y+.005),center.x,0)).normalized()
        local = [Vector(((p-center).dot(tangent),p.z-center.z)) for p in points]
        scale = patchRadius*.82/max(max(p.length for p in local),1e-8)
        return [patchCenter+p*scale for p in local]

    polygons, uvFaces, nFaces, faceParts = [], [], [], []
    removed, inner = 0, 0
    for f in me.polygons:
        part = partByVertex[f.vertices[0]]
        if part == 7:
            removed += 1
            continue
        p = list(f.vertices)
        fc = sum((verts[i] for i in p), Vector()) / len(p)
        radial = Vector((fc.x, fc.y + .005, 0)).normalized()
        isInner = part == 2 and max(verts[i].z for i in p) < 1.728 and f.normal.dot(radial) < -.22
        polygons.append(p)
        uvFaces.append(ClothFaceUv([verts[i] for i in p]) if isInner else [uv[li].uv.copy() for li in f.loop_indices])
        normals = [me.corner_normals[li].vector.copy() for li in f.loop_indices]
        if part in (3,5):
            normals = [handRotation @ n for n in normals]
        elif part in (0,2):
            normals = [(normalTransforms[i] @ n).normalized() for i,n in zip(p,normals)]
        nFaces.append(normals)
        faceParts.append(part)
        inner += int(isInner)

    # Cross sections of the original cap define the lining's shape. The lining
    # stays 2 mm inside the outside shell and extends well under the cap band.
    # Interpolation spans the two real panel gaps; it never closes the face.
    heights = np.linspace(1.526, 1.748, 30)
    angles = np.linspace(math.radians(62), math.radians(298), 75)
    center = np.array([0., -.005])
    start = len(verts)
    linerPositions = []
    for z in heights:
        sampleZ = max(1.535, min(1.740, z))
        segments = []
        for tri in capTris:
            vv = [np.array(verts[i]) for i in tri.vertices]
            points = []
            for a, b in zip(vv, vv[1:] + vv[:1]):
                if (a[2] <= sampleZ < b[2]) or (b[2] <= sampleZ < a[2]):
                    points.append(a[:2] + (b[:2] - a[:2]) * ((sampleZ - a[2]) / (b[2] - a[2])))
            if len(points) == 2:
                segments.append(points)
        knownAngles, knownRadii = [], []
        for theta in np.linspace(0, math.tau, 361):
            direction = np.array([math.sin(theta), -math.cos(theta)])
            hits = []
            for a, b in segments:
                matrix = np.column_stack((direction, a - b))
                if abs(np.linalg.det(matrix)) < 1e-10:
                    continue
                r, t = np.linalg.solve(matrix, a - center)
                if r > .04 and 0 <= t <= 1:
                    hits.append(r)
            if hits:
                knownAngles.append(theta); knownRadii.append(max(hits))
        assert knownRadii, ('Empty cap section', sampleZ)
        for theta in angles:
            r = float(np.interp(theta, knownAngles, knownRadii)) - .002
            p = Vector((r * math.sin(theta), -.005 - r * math.cos(theta), float(z)))
            verts.append(p); linerPositions.append(p)
            partByVertex.append(2)
    columns = len(angles)
    for row in range(len(heights) - 1):
        for col in range(columns - 1):
            a = start + row * columns + col
            p = [a, a + 1, a + columns + 1, a + columns]
            polygons.append(p); uvFaces.append(ClothFaceUv([verts[i] for i in p]))
            ns = [Vector((verts[i].x, verts[i].y + .005, 0)).normalized() for i in p]
            nFaces.append(ns); faceParts.append(2)

    mesh = bpy.data.meshes.new(NAME)
    mesh.from_pydata(verts, [], polygons); mesh.update()
    layer = mesh.uv_layers.new(name='UVMap')
    for f, faceUv in zip(mesh.polygons, uvFaces):
        for li, coord in zip(f.loop_indices, faceUv):
            layer.data[li].uv = coord
        f.use_smooth = True
    mesh.normals_split_custom_set([n for normals in nFaces for n in normals])
    mesh.materials.append(me.materials[0])
    mesh.materials[0].use_backface_culling = False
    identity = mesh.attributes.new('yiPart', 'INT', 'POINT')
    identity.data.foreach_set('value', partByVertex)
    obj = bpy.data.objects.new(NAME, mesh); sc.collection.objects.link(obj)
    for o in sc.objects:
        o.hide_render = o != obj; o.hide_set(o != obj)
        o.select_set(o == obj)
    bpy.context.view_layer.objects.active = obj
    # The skull is not compressed to fit the cap. Local garment and stance
    # corrections are independent of the preserved head and face geometry.
    displacement = np.array([v.co[:] for v in mesh.vertices[:len(originalPositions)]]) - originalPositions
    unchanged = np.array([p in (1,7) for p in partByVertex[:len(originalPositions)]])
    assert np.max(np.abs(displacement[unchanged])) == 0
    seamChecks = []
    mesh.calc_loop_triangles()
    repairedBvh = BVHTree.FromPolygons([v.co for v in mesh.vertices], [t.vertices for t in mesh.loop_triangles], all_triangles=True)
    for thetaDeg in [108, 114, 120, 126, 234, 240, 246, 252]:
        theta = math.radians(thetaDeg); ray = Vector((math.sin(theta), -math.cos(theta), 0))
        for z in [1.55, 1.60, 1.65, 1.70]:
            origin = Vector((0, -.005, z)) + ray * .35
            hit, _, _, _ = repairedBvh.ray_cast(origin, -ray, .29)
            assert hit is not None, ('Unclosed havelock seam', thetaDeg, z)
            seamChecks.append([thetaDeg, z, round((hit - Vector((0,-.005,z))).length, 5)])
    ASSETS.mkdir(parents=True, exist_ok=True)
    glb = ASSETS / (NAME + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_materials='EXPORT',
        export_image_format='JPEG', export_image_quality=92,
        export_animations=False, export_skins=False)
    bpy.ops.export_scene.fbx(filepath=str(ASSETS / (NAME + '.fbx')), use_selection=True,
        object_types={'MESH'}, path_mode='COPY', embed_textures=True,
        axis_forward='-Z', axis_up='Y', apply_unit_scale=True,
        apply_scale_options='FBX_SCALE_ALL', add_leaf_bones=False, bake_anim=False)
    bpy.ops.wm.save_as_mainfile(filepath=str(WORK / 'Scene_JapaneseSoldierYi_V2.blend'))
    report = dict(schema=1, script='Script_BuildJapaneseSoldierYi.py',
        sourceBlend=str(SOURCE), sourceSha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        output=str(glb), sha256=hashlib.sha256(glb.read_bytes()).hexdigest(),
        preservedOriginalVertices=len(originalPositions), headVertexDisplacementM=0,
        correctedHandRollDeg=math.degrees(handRoll), handMaximumDisplacementM=float(np.linalg.norm(displacement[np.array(partByVertex[:len(originalPositions)]) == 3], axis=1).max()),
        referenceFit=dict(hemFrontScale=.921,hemDepthScale=1.072,ankleInwardM=.015,visorShortenM=.027),
        removedOverlappingBridgeFaces=removed, reprojectedLiningFaces=inner,
        clothPatchUvCenter=list(patchCenter),clothPatchUvRadius=patchRadius,
        liningVertices=len(linerPositions), triangles=sum(len(p.vertices)-2 for p in mesh.polygons),
        seamRays=seamChecks)
    (WORK / 'Data_JapaneseSoldierYiV2Repair.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    print(json.dumps({k:v for k,v in report.items() if k != 'seamRays'}, ensure_ascii=False))


assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == SOURCE_SHA256, 'Preserved V1 source changed; review it before rebuilding'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
with bpy.context.temp_override(window=bpy.context.window_manager.windows[0]):
    Main()
