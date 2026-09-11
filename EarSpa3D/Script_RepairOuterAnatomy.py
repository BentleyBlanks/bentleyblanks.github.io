"""Repair the native concha transition and groom one existing hairstyle via BlenderMCP.

Run against a fresh import of the current runtime GLB in the independent OuterAnatomy
source file. The internal canal, tools and gameplay coordinates are preserved.
"""
import bpy, bmesh, math, json, random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
SOURCE = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/OuterAnatomy')
api = {'__file__': str(ROOT / 'Script_BuildReferenceProfile.py')}
exec(compile((ROOT / 'Script_BuildReferenceProfile.py').read_text(encoding='utf-8'), api['__file__'], 'exec'), api)
Mesh, Mat, V, Apply = [api[k] for k in ['Mesh', 'Mat', 'V', 'Apply']]


def RepairConcha():
    raw, points, uvs, groups = api['Read']()
    fit = json.loads((SOURCE.parent / 'ReferenceProfile/ConchaFit.json').read_text())
    # The concha must sit in front of the canal's zero plane on every side.
    # The previous fit used the median depth, leaving the lower lip behind it.
    api['DEPTH_OFFSET'] = -1.8 + fit['depthShift'] - 6.0
    for name in ['Model_Temple', 'Model_OuterEar']:
        bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    skin = Mat('Material_ConchaSkin', (.61, .395, .32), .62, coat=.02)
    api['OuterPbr'](skin)
    head = api['Subset']('Model_Temple', [f for f in groups['body'] if all(raw[i][1] > 5.55 for i, u in f)], points, uvs, skin, 1)
    for v in head.data.vertices: v.co.x -= 3.5; v.co.z += .8
    # A slightly tilted oval under the tragus, rather than a vertical circular bore.
    cols = 96
    mouth = []; mouthNormals = []
    for j in range(cols):
        a = j / cols * math.tau
        x = -.55 - 3.35 * math.sin(a) + .38 * math.cos(a)
        y = -.35 + 4.05 * math.cos(a)
        hit, p, n, face = head.ray_cast(V((x, y, -70)), V((0, 0, 1)))
        assert hit, 'Missing concha surface'
        mouth.append(Vector((x, y, -p.y))); mouthNormals.append(n.copy())
    # The same outer contour is used for the bore and collar; no offset sample ring.
    cv = [(p.x, p.y, -60) for p in mouth] + [(p.x, p.y, 3) for p in mouth]
    cf = [tuple(reversed(range(cols))), tuple(range(cols, cols * 2))]
    cf += [(j, (j + 1) % cols, (j + 1) % cols + cols, j + cols) for j in range(cols)]
    cutMaterial = Mat('Material_RemovedBore', (.2,.1,.1)); head.data.materials.append(cutMaterial)
    cutter = Mesh('ConchaApertureCutter', cv, cf, cutMaterial)
    bm = bmesh.new(); bm.from_mesh(cutter.data); bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(cutter.data); bm.free()
    mod = head.modifiers.new('ConchaAperture', 'BOOLEAN'); mod.operation = 'DIFFERENCE'; mod.solver = 'EXACT'; mod.object = cutter; Apply(head, mod)
    bpy.data.objects.remove(cutter, do_unlink=True)
    profile = json.loads((ROOT / 'Data_CanalProfile.json').read_text())
    # Clear the retained curved canal volume from the native head.
    cv, cf = [], []
    for i, f in enumerate(profile):
        for j in range(32):
            a = j / 32 * math.tau
            direction = Vector(f['up']) * math.cos(a) + Vector(f['right']) * math.sin(a)
            cv.append(tuple(Vector(f['center']) + direction * (f['radii'][j * 2] + .85)))
            if i < len(profile) - 1:
                k = i * 32 + j; n = i * 32 + (j + 1) % 32; cf.append((k, n, n + 32, k + 32))
    cf += [tuple(reversed(range(32))), tuple((len(profile) - 1) * 32 + j for j in range(32))]
    cutter = Mesh('CanalClearanceCutter', cv, cf, cutMaterial)
    bm = bmesh.new(); bm.from_mesh(cutter.data); bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(cutter.data); bm.free()
    mod = head.modifiers.new('CanalClearance', 'BOOLEAN'); mod.operation = 'DIFFERENCE'; mod.solver = 'EXACT'; mod.object = cutter; Apply(head, mod)
    bpy.data.objects.remove(cutter, do_unlink=True)
    # Remove the boolean's cylindrical side faces: only the fitted funnel lines the mouth.
    bm = bmesh.new(); bm.from_mesh(head.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index == 1], context='FACES')
    bm.to_mesh(head.data); bm.free()
    for poly in head.data.polygons: poly.use_smooth = True
    # Smooth funnel ends at the existing canal's first ring, fully behind the skin.
    verts, faces = [], []
    f = profile[0].copy(); f['radii'] = [sum(r['radii'][i] for r in profile[:4])/4 for i in range(64)]
    for row in range(17):
        t = row / 16
        for j in range(cols + 1):
            a = (j % cols) / cols * math.tau
            k = (j % cols) / cols * 64; lo = int(k)
            radius = f['radii'][lo] * (1 - (k - lo)) + f['radii'][(lo + 1) % 64] * (k - lo)
            end = Vector(f['center']) + (Vector(f['up']) * math.cos(a) + Vector(f['right']) * math.sin(a)) * radius
            start = mouth[j % cols]
            p = start.lerp(end, t)
            # Depth eases in, avoiding an abrupt raised sleeve at the opening.
            p.z = start.z + (end.z - start.z) * (t * t * (3 - 2 * t))
            verts.append(tuple(p))
            if row < 16 and j < cols:
                k = row * (cols + 1) + j; faces.append((k, k + cols + 1, k + cols + 2, k + 1))
    ear = Mesh('Model_OuterEar', verts, faces, skin)
    # Match the native skin normal exactly at the boundary and blend into the funnel.
    ear.data.update()
    normals=[]
    for loop in ear.data.loops:
        row=loop.vertex_index//(cols+1); j=loop.vertex_index%(cols+1)
        n=ear.data.vertices[loop.vertex_index].normal.copy()
        if row<4: n=mouthNormals[j%cols].lerp(n,row/4).normalized()
        normals.append(tuple(n))
    ear.data.normals_split_custom_set(normals)
    for obj in [head, ear]:
        uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
        for poly in obj.data.polygons:
            for l in poly.loop_indices:
                p = obj.data.vertices[obj.data.loops[l].vertex_index].co
                uv.data[l].uv = ((obj.data.loops[l].vertex_index % (cols + 1)) / cols, (obj.data.loops[l].vertex_index // (cols + 1)) / 16) if obj == ear else (p.x / 20, p.z / 20)
    head['conchaRepair'] = 'Recessed oval under tragus; 6 mm external fit correction; internal canal unchanged'
    ear['conchaRepair'] = 'Shared bore contour, 16-row recessed transition and continuous skin UVs'
    # Adjacent features follow the corrected head fit.
    for name in ['Model_ProfileEyes', 'Model_ProfileIris', 'Model_ProfileLashes', 'Model_ProfileHair', 'Model_ProfileHairStrands']:
        obj = bpy.data.objects.get(name)
        if obj and not obj.get('outerFitShifted'):
            for v in obj.data.vertices: v.co.y += 6
            obj['outerFitShifted'] = True
        if obj and not obj.get('conchaAligned'):
            for v in obj.data.vertices: v.co.x -= 3.5; v.co.z += .8
            obj['conchaAligned'] = True
    print('CONCHA_REPAIR', {'mouthDepthRange': [min(p.z for p in mouth), max(p.z for p in mouth)], 'triangles': sum(len(p.vertices) - 2 for p in ear.data.polygons)})


def GroomHair():
    bpy.data.objects.remove(bpy.data.objects['Model_ProfileHairStrands'], do_unlink=True)
    with bpy.data.libraries.load(str(SOURCE.parent / 'ReferenceProfile/Model_ReferenceProfile.blend'), link=False) as (source, target):
        target.objects = ['Model_ProfileHairStrands']
    old = target.objects[0]; bpy.context.collection.objects.link(old)
    for v in old.data.vertices: v.co.x -= 3.5; v.co.y += 6; v.co.z += .8
    # Keep a reduced underlayer to avoid a transparent scalp between individual locks.
    dec = old.modifiers.new('HairUnderlayerBudget', 'DECIMATE'); dec.ratio = .22; Apply(old, dec)
    old.name = 'HairUnderlayer'
    material = Mat('Material_CombedDarkHair', (.018, .012, .009), .48, coat=.04)
    old.data.materials.clear(); old.data.materials.append(material)
    verts, faces, uvcoords = [], [], []
    rng = random.Random(912)
    fit = json.loads((SOURCE.parent / 'ReferenceProfile/ConchaFit.json').read_text())
    api['DEPTH_OFFSET'] = -1.8 + fit['depthShift'] - 6
    def Catmull(a, b, c, d, t):
        return (b * 2 + (c - a) * t + (a * 2 - b * 5 + c * 4 - d) * t * t + (-a + b * 3 - c * 3 + d) * t ** 3) * .5
    def Flow(side, u, t, lift):
        a = u * math.pi
        controls = [Vector((side * .055, 6.988, .45 - .23 * u)), Vector((side * .52, 6.81, .42 + .58 * math.cos(a))), Vector((side * .78, 6.20, .37 + .38 * math.cos(a))), Vector((side * .79, 5.63, .10 - .46 * u)), Vector((side * .82, 4.25 + .10 * math.sin(u * 7), .10 - .52 * u))]
        at = t * 4; i = min(3, int(at)); q = at - i
        p = Catmull(controls[max(0, i - 1)], controls[i], controls[i + 1], controls[min(4, i + 2)], q)
        p.x += side * lift / 100
        return Vector(api['Map'](p)) + Vector((-3.5, .8, 0))
    for side in [-1, 1]:
        for strand in range(176):
            # Narrow overlapping locks plus tapered silhouette wisps, all in one mesh.
            u = (strand + rng.uniform(.05, .95)) / 160 if strand < 160 else -rng.uniform(.0008, .009)
            width = rng.uniform(.00018, .00045)
            startT = rng.uniform(.02, .15); endT = rng.uniform(.87, 1)
            lift = rng.uniform(.08, .23)
            start = len(verts)
            for row in range(21):
                t = row / 20; tt = startT + (endT - startT) * t
                taper = max(.015, (1 - t ** 9))
                center = u + math.sin(t * 7 + strand * 2.3) * .0005
                for edge in [-1, 1]:
                    p = Flow(side, center + edge * width * taper, tt, lift)
                    verts.append(tuple(p)); uvcoords.append((u + edge * width * taper, tt))
                if row < 20:
                    k = start + row * 2; faces.append((k, k + 1, k + 3, k + 2))
    strands = Mesh('Model_ProfileHairStrands', verts, faces, material)
    uv = strands.data.uv_layers.new(name='UVMap')
    for f in strands.data.polygons:
        for l in f.loop_indices: uv.data[l].uv = uvcoords[strands.data.loops[l].vertex_index]
    bpy.ops.object.select_all(action='DESELECT'); strands.select_set(True); old.select_set(True); bpy.context.view_layer.objects.active = strands; bpy.ops.object.join()
    scalp = bpy.data.objects['Model_ProfileHair']; scalp.data.materials.clear(); scalp.data.materials.append(material)
    strands['outerFitShifted'] = True; strands['conchaAligned'] = True
    strands['groom'] = '352 tapered fine strands and silhouette wisps, continuous comb direction, reduced underlayer'
    print('HAIR_REPAIR', len(strands.data.polygons), 'faces')


def Export():
    assert Path(bpy.data.filepath).resolve() == (SOURCE / 'Model_OuterAnatomy.blend').resolve()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'Model_OuterAnatomy.blend'))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH' and obj.name.startswith('Model_'): obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(ROOT / 'Models/Model_ImmersiveEar.glb'), export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_cameras=False, export_lights=False)


if __name__ == '__main__':
    RepairConcha(); GroomHair(); Export()
