"""Pose the source hand through volume-preserving finger bones."""
import math
import heapq
import numpy as np
import bpy
from mathutils import Matrix, Quaternion, Vector


def BuildHandPose(source, assembly, rigCollection):
    hand = source.copy()
    hand.data = source.data.copy()
    hand.name = 'Part_Hand_L'
    assembly.objects.link(hand)
    hand.hide_render = False
    hand.hide_set(False)
    raw = np.array([vertex.co[:] for vertex in hand.data.vertices])
    sample = raw[raw[:, 1] > 0.1][:, [0, 2]]
    sample -= sample.mean(0)
    _, vectors = np.linalg.eigh(sample.T @ sample)
    normal = vectors[:, 0]
    if normal[0] < 0:
        normal *= -1
    roll = math.atan2(-normal[0], normal[1])
    hand.data.transform(Matrix.Rotation(roll, 4, 'Y'))
    prepared = np.array([vertex.co[:] for vertex in hand.data.vertices])
    hand.name = 'Part_Hand_L'
    # Weld positional duplicates only for connectivity analysis. UV seams stay intact.
    unique, inverse = np.unique(np.round(prepared, 5), axis=0, return_inverse=True)
    hand.data.calc_loop_triangles()
    triangles = inverse[np.array([triangle.vertices[:] for triangle in hand.data.loop_triangles])]
    edges = np.unique(np.sort(np.vstack([triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]]), axis=1), axis=0)
    adjacency = [[] for point in unique]
    for first, second in edges:
        distance = float(np.linalg.norm(unique[first] - unique[second]))
        adjacency[first].append((int(second), distance))
        adjacency[second].append((int(first), distance))
    remaining = set(np.where(unique[:, 1] > 0.15)[0])
    branches = []
    while remaining:
        start = remaining.pop()
        queue = [start]
        branch = [start]
        while queue:
            for neighbor, distance in adjacency[queue.pop()]:
                if neighbor in remaining:
                    remaining.remove(neighbor)
                    queue.append(neighbor)
                    branch.append(neighbor)
        if len(branch) > 30:
            branches.append(branch)
    branches.sort(key=lambda branch: unique[branch, 0].mean())
    assert len(branches) == 4
    thumb = np.where((unique[:, 0] > 0.05) & (unique[:, 1] < 0.15))[0].tolist()
    assert len(thumb) > 10
    groups = branches + [thumb]

    def GeodesicDistances(seeds):
        distances = np.full(len(unique), np.inf)
        queue = []
        for index in seeds:
            distances[index] = 0.0
            heapq.heappush(queue, (0.0, index))
        while queue:
            distance, index = heapq.heappop(queue)
            if distance > distances[index] + 1e-10:
                continue
            for neighbor, edgeLength in adjacency[index]:
                candidate = distance + edgeLength
                if candidate < distances[neighbor]:
                    distances[neighbor] = candidate
                    heapq.heappush(queue, (candidate, neighbor))
        return distances

    distances = []
    for branch in branches:
        seeds = [index for index in branch if unique[index, 1] < 0.19]
        distances.append(GeodesicDistances(seeds))
    distances.append(GeodesicDistances([index for index in thumb if unique[index, 0] < 0.09]))
    influence = np.exp(-(np.column_stack(distances) / 0.13) ** 2)
    fingerEnvelope = np.clip((unique[:, 1] + 0.10) / 0.25, 0, 1)
    thumbEnvelope = np.clip((unique[:, 0] + 0.18) / 0.23, 0, 1) * np.clip((0.18 - unique[:, 1]) / 0.20, 0, 1)
    budget = np.maximum(fingerEnvelope, thumbEnvelope)
    budget = budget * budget * (3 - 2 * budget)
    weights = influence / influence.sum(axis=1, keepdims=True).clip(1e-15) * budget[:, None]
    for groupId, branch in enumerate(groups):
        weights[branch] = 0.0
        weights[branch, groupId] = 1.0

    armatureData = bpy.data.armatures.new('Rig_HandPose')
    armature = bpy.data.objects.new('Rig_HandPose', armatureData)
    rigCollection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    root = armatureData.edit_bones.new('Palm')
    root.head = (-0.28, -0.45, 0.28)
    root.tail = (-0.28, 0.05, 0.28)
    boneNames = ['Little', 'Ring', 'Middle', 'Index', 'Thumb']
    slopes = []
    for name, branch in zip(boneNames[:4], branches):
        slope, intercept = np.polyfit(unique[branch, 1], unique[branch, 0], 1)
        slopes.append(float(slope))
        bone = armatureData.edit_bones.new(name)
        bone.parent = root
        bone.head = (float(intercept), 0.0, float(np.median(unique[branch, 2])))
        direction = Vector((float(slope), 1.0, 0.0)).normalized()
        bone.tail = bone.head + direction * 0.35
    bone = armatureData.edit_bones.new('Thumb')
    bone.parent = root
    bone.head = (-0.12, -0.22, 0.27)
    bone.tail = (0.16, 0.01, 0.27)
    bpy.ops.object.mode_set(mode='OBJECT')
    for name in ['Palm'] + boneNames:
        hand.vertex_groups.new(name=name)
    for index in range(len(prepared)):
        pointWeights = weights[inverse[index]]
        palmWeight = max(0.0, 1.0 - pointWeights.sum())
        if palmWeight > 1e-6:
            hand.vertex_groups['Palm'].add([index], float(palmWeight), 'REPLACE')
        for groupId, name in enumerate(boneNames):
            if pointWeights[groupId] > 1e-6:
                hand.vertex_groups[name].add([index], float(pointWeights[groupId]), 'REPLACE')
    modifier = hand.modifiers.new('PoseWithVolumePreservation', 'ARMATURE')
    modifier.object = armature
    modifier.use_deform_preserve_volume = True
    poseAngles = [math.atan(value) for value in slopes] + [math.radians(35)]
    poseAngles[0] -= math.radians(15)
    for name, angle in zip(boneNames, poseAngles):
        poseBone = armature.pose.bones[name]
        axis = poseBone.bone.matrix_local.to_quaternion().inverted() @ Vector((0, 0, 1))
        poseBone.rotation_mode = 'QUATERNION'
        poseBone.rotation_quaternion = Quaternion(axis, angle)
    armature.hide_render = True
    bpy.context.view_layer.update()
    evaluated = hand.evaluated_get(bpy.context.evaluated_depsgraph_get())
    posed = np.array([vertex.co[:] for vertex in evaluated.data.vertices])
    report = {'rollDegrees': math.degrees(roll), 'poseDegrees': dict(zip(boneNames, [math.degrees(a) for a in poseAngles])), 'distalShapeChecks': {}}
    rng = np.random.default_rng(1938)
    for name, branch in zip(boneNames, groups):
        vertexIds = np.where(np.isin(inverse, branch))[0]
        first = rng.choice(vertexIds, 600)
        second = rng.choice(vertexIds, 600)
        before = np.linalg.norm(prepared[first] - prepared[second], axis=1)
        after = np.linalg.norm(posed[first] - posed[second], axis=1)
        valid = before > 1e-5
        ratio = after[valid] / before[valid]
        report['distalShapeChecks'][name] = {'meanDistanceRatio': float(ratio.mean()), 'stdDistanceRatio': float(ratio.std())}
        assert np.max(np.abs(ratio - 1)) < 0.001
    return hand, armature, report, prepared
