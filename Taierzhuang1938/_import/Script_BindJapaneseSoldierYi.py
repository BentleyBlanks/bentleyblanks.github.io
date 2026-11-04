"""Bind the fitted Yi V2 to the project's shipped Jia/Mixamo skeleton locally.

The donor is the already validated Model_JapaneseSoldierJia.glb. Its bone axes
and hierarchy are preserved, joints are fitted to Yi's measured landmarks, and
skin weights are barycentrically transferred from the fitted donor surface.
The cap/neck, sleeve/wrist and puttee/boot interfaces receive shared continuous
weights. Existing Mixamo clips and every other character remain unchanged.

Run through Script_BlenderMcp.mjs exec --file, then normalize with
Script_BuildXBotRigCharacter.mjs --crown 1.8268 --out ...JapaneseSoldierYi.glb.
"""
import bpy
import hashlib
import json
import math
import os
from pathlib import Path

import numpy as np
from mathutils import Vector, geometry
from mathutils.bvhtree import BVHTree

PROJECT = Path(globals().get('__file__', Path.cwd() / 'Taierzhuang1938/_import/Script_BindJapaneseSoldierYi.py')).resolve().parents[1]
WORK = Path(os.environ.get('YI_WORK', r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\YiPartsMerge_20261104V2'))
ASSETS = Path(os.environ.get('YI_ASSETS', r'C:\Users\Bentl\OneDrive\Sync\饮河\FPS\角色\Tripo\15_日兵乙'))
SOURCE = WORK / 'Scene_JapaneseSoldierYi_V2.blend'
DONOR = PROJECT / 'Model/Character/Model_JapaneseSoldierJia.glb'
DONOR_SHA256 = '8f5f681741dff0f532d54e80a4d1b7297159e31f0c2ecf2163031ce65608272e'
NAME = 'JapaneseSoldierYi_Merged_V2'


def Smooth(a, b, x):
    t = min(1., max(0., (x-a)/(b-a)))
    return t*t*(3-2*t)


def Main():
    sc = bpy.context.scene
    target = bpy.data.objects[NAME]
    assert not target.modifiers, 'Start from the static V2 source, never an already bound model'
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(DONOR))
    bpy.context.view_layer.update()
    imported = [o for o in bpy.data.objects if o not in before]
    donor = next(o for o in imported if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers))
    arm = next(m.object for m in donor.modifiers if m.type == 'ARMATURE')
    donor.data.update()
    arm.name = 'Armature_JapaneseSoldierYi'
    donor.data.calc_loop_triangles()
    sourceJoints = {b.name: arm.matrix_world @ b.head_local for b in arm.data.bones}
    joints = {name: co.copy() for name, co in sourceJoints.items()}
    # Blender metres: +X left, -Y front, +Z up. These positions are joint
    # centres, not garment extrema; the fitted 1.809 m skull is untouched.
    core = {
        'Hips': (0, -.005, .982), 'Spine': (0, 0, 1.043),
        'Spine1': (0, .005, 1.160), 'Spine2': (0, .018, 1.305),
        'Neck': (0, .012, 1.538), 'Head': (0, .012, 1.615),
    }
    joints.update({k: Vector(v) for k,v in core.items()})
    for side, sign in [('Left', 1), ('Right', -1)]:
        for suffix, co in {
            'Shoulder': (.060, .018, 1.435), 'Arm': (.182, .024, 1.441),
            'ForeArm': (.432, .027, 1.442), 'Hand': (.678, .031, 1.444),
            'UpLeg': (.108, .005, .920), 'Leg': (.160, .024, .508),
            'Foot': (.171, .045, .104), 'ToeBase': (.171, -.075, .044),
            'Toe_End': (.177, -.168, .044),
        }.items():
            joints[side+suffix] = Vector((co[0]*sign, co[1], co[2]))
        leftWrist = sourceJoints['LeftHand']
        for digit in ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']:
            for segment in range(1, 5):
                key = 'LeftHand'+digit+str(segment)
                if key not in sourceJoints:
                    continue
                delta = sourceJoints[key] - leftWrist
                scaleX = .820 if digit == 'Thumb' else .865
                co = Vector((.678 + delta.x*scaleX, .031 + delta.y*1.15, 1.444 + delta.z))
                co.x *= sign
                joints[side+'Hand'+digit+str(segment)] = co
    # All end bones follow their parent; they carry no new independent pivot.
    for b in arm.data.bones:
        if b.name not in core and not b.name.startswith(('Left', 'Right')) and b.parent:
            joints[b.name] = sourceJoints[b.name] + joints[b.parent.name] - sourceJoints[b.parent.name]

    donorPositions = [donor.matrix_world @ v.co for v in donor.data.vertices]
    donorWeights = []
    fittedPositions = []
    for v, p in zip(donor.data.vertices, donorPositions):
        weights = {donor.vertex_groups[g.group].name: g.weight for g in v.groups if g.weight > 1e-7}
        donorWeights.append(weights)
        fittedPositions.append(p + sum(((joints[n]-sourceJoints[n])*w for n,w in weights.items()), Vector()))
    assert all(donorWeights), ('Donor weights unavailable', donor.name, sum(bool(w) for w in donorWeights), len(donorWeights))
    tris = [t.vertices[:] for t in donor.data.loop_triangles
            if (fittedPositions[t.vertices[1]]-fittedPositions[t.vertices[0]]).cross(
                fittedPositions[t.vertices[2]]-fittedPositions[t.vertices[0]]).length > 1e-10]
    bodyBvh = BVHTree.FromPolygons(fittedPositions, tris, all_triangles=True)

    # Adjust only joint translations in armature space. Bone axes remain those
    # of the validated donor; the shared converter restores the exact X Bot
    # node table and rest rotations after Blender's glTF export.
    bpy.ops.object.select_all(action='DESELECT')
    arm.hide_set(False); arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    invArm = arm.matrix_world.inverted()
    for bone in arm.data.edit_bones:
        direction = bone.tail - bone.head
        bone.use_connect = False
        bone.head = invArm @ joints[bone.name]
        bone.tail = bone.head + direction
    bpy.ops.object.mode_set(mode='OBJECT')
    for name, co in joints.items():
        assert (arm.matrix_world @ arm.data.bones[name].head_local - co).length < 1e-5
    for n in joints:
        target.vertex_groups.new(name=n)
    parts = target.data.attributes['yiPart'].data
    distances = []; weightRecords = []
    for vertex in target.data.vertices:
        p = vertex.co
        part = parts[vertex.index].value
        hit, _, ti, distance = bodyBvh.find_nearest(p)
        tri = tris[ti]
        a,b,c = [fittedPositions[i] for i in tri]
        bary = geometry.barycentric_transform(hit, a,b,c,Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
        if not all(math.isfinite(v) for v in bary) or sum(max(0.,v) for v in bary) < 1e-6:
            nearest = min(range(3), key=lambda i:(fittedPositions[tri[i]]-p).length_squared)
            bary = Vector(tuple(float(i == nearest) for i in range(3)))
        weights = {}
        for i, factor in zip(tri,bary):
            for name,w in donorWeights[i].items():
                weights[name] = weights.get(name,0) + max(0.,factor)*w
        side = 'Left' if p.x >= 0 else 'Right'
        x = abs(p.x)
        if part == 0:
            # The donor's collar contains head influence. A hard replacement
            # boundary at the shoulder forms a pointed fold during head turns.
            # Cloth never follows Head directly; blend the collar field into
            # the surrounding shoulder weights over a continuous region.
            moved = weights.pop('Head',0.)
            neck = weights.get('Neck',0.)
            if neck > .25:
                moved += neck-.25; weights['Neck'] = .25
            weights['Spine2'] = weights.get('Spine2',0.)+moved
            collar = Smooth(1.420,1.510,p.z)*(1-Smooth(.100,.240,x))
            if collar > 0:
                neckTarget = .25*Smooth(1.490,1.580,p.z)
                weights = {n:w*(1-collar) for n,w in weights.items()}
                weights['Spine2'] = weights.get('Spine2',0.)+collar*(1-neckTarget)
                weights['Neck'] = weights.get('Neck',0.)+collar*neckTarget
        if part == 1:
            # The face is rigid. Only the buried neck root blends into torso.
            head = Smooth(1.538, 1.585, p.z)
            spine = (1-head)*(1-Smooth(1.518,1.555,p.z))
            weights = {'Head': head, 'Neck': 1-head-spine, 'Spine2': spine}
        elif part == 2:
            # A single shared field on original cap and new lining prevents
            # independent shell/patch seams during head turns and prone poses.
            head = Smooth(1.570,1.705,p.z)
            spine = (1-head)*(1-Smooth(1.526,1.570,p.z))*.75
            weights = {'Head':head,'Neck':1-head-spine,'Spine2':spine}
        elif part in (0,3,5) and x > .610 and 1.36 < p.z < 1.51:
            # Sleeve and the inserted wrist must use the identical blend field.
            if x < .710:
                hand = Smooth(.635,.703,x)
                weights = {side+'ForeArm':1-hand, side+'Hand':hand}
            else:
                # Restrict distal transfer to the same digit. Fused webbing in
                # the supplied hand must not inherit a neighbouring finger.
                digit = 'Thumb' if p.y < -.014 else 'Index' if p.y < .016 else 'Middle' if p.y < .040 else 'Ring' if p.y < .064 else 'Pinky'
                if x > .773 or digit == 'Thumb':
                    valid = {n:w for n,w in weights.items() if n == side+'Hand' or n.startswith(side+'Hand'+digit)}
                    if sum(valid.values()) > .15:
                        weights = valid
        elif part in (0,4,6) and p.z < .225:
            leg = Smooth(.115,.220,p.z)
            toe = (1-leg)*Smooth(.035,.145,-p.y)*(1-Smooth(.080,.135,p.z))
            weights = {side+'Leg':leg, side+'Foot':1-leg-toe, side+'ToeBase':toe}
        ordered = sorted(((n,max(0.,w)) for n,w in weights.items() if w > 1e-5), key=lambda item:item[1], reverse=True)[:4]
        total = sum(w for _,w in ordered)
        assert total > 1e-5, ('Unweighted vertex', vertex.index,part,list(p),distance,tri,list(bary),weights,[donorWeights[i] for i in tri])
        record = []
        for n,w in ordered:
            value = w/total
            target.vertex_groups[n].add([vertex.index],value,'REPLACE')
            record.append((n,value))
        weightRecords.append(record)
        if part == 0:
            distances.append(distance)
    donor.hide_render=True; donor.hide_set(True)
    modifier = target.modifiers.new('Armature_JapaneseSoldierYi','ARMATURE'); modifier.object=arm
    target.parent=arm; target.matrix_parent_inverse=arm.matrix_world.inverted()
    target.hide_render=False; target.hide_set(False)
    for o in sc.objects:
        o.select_set(o in (target,arm)); o.hide_render = o not in (target,arm)
    bpy.context.view_layer.objects.active = target
    raw = ASSETS / (NAME+'_Bones.glb')
    bpy.ops.export_scene.gltf(filepath=str(raw),export_format='GLB',use_selection=True,
        export_yup=True,export_apply=False,export_animations=False,export_skins=True,
        export_def_bones=False,export_materials='EXPORT',export_image_format='JPEG',export_image_quality=92)
    bpy.ops.export_scene.fbx(filepath=str(ASSETS/(NAME+'_Bones.fbx')),use_selection=True,
        object_types={'MESH','ARMATURE'},path_mode='COPY',embed_textures=True,
        axis_forward='-Z',axis_up='Y',apply_unit_scale=True,
        apply_scale_options='FBX_SCALE_ALL',add_leaf_bones=False,bake_anim=False)
    bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'Scene_JapaneseSoldierYi_V2_Bound.blend'))
    report = dict(schema=1,script='Script_BindJapaneseSoldierYi.py',
        donorFile='Model/Character/Model_JapaneseSoldierJia.glb',donorSha256=hashlib.sha256(DONOR.read_bytes()).hexdigest(),
        sourceProject=str(SOURCE),output=str(raw),sha256=hashlib.sha256(raw.read_bytes()).hexdigest(),
        method='fitted-canonical-surface-transfer',bones=len(joints),vertices=len(target.data.vertices),
        maximumInfluences=max(map(len,weightRecords)),unweightedVertices=sum(not w for w in weightRecords),
        bodyTransferDistanceM={str(q):float(np.percentile(distances,q)) for q in (50,95,99,100)},
        jointsBlenderM={name:list(co) for name,co in joints.items()})
    (WORK/'Data_JapaneseSoldierYiV2Binding.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps({k:v for k,v in report.items() if k!='jointsBlenderM'},ensure_ascii=False))


bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
assert hashlib.sha256(DONOR.read_bytes()).hexdigest() == DONOR_SHA256, 'Validated donor changed; review before transferring weights'
with bpy.context.temp_override(window=bpy.context.window_manager.windows[0]):
    Main()
