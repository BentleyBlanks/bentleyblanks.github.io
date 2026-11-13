"""Reference silhouettes and local garment contact fits for the messenger."""
import json
import math
from pathlib import Path
import numpy as np
import bpy
from mathutils import Vector


def LoadReferenceProfiles():
    path = Path(__file__).with_name('Data_SichuanMessengerReferenceProfiles.json')
    return json.loads(path.read_text(encoding='utf-8'))


def SmoothReferenceProfiles(data):
    # Monotone cubic interpolation keeps the measured calf maximum and ankle taper.
    rows = data['profileSamples']
    knots = np.array([row['heightFraction'] for row in rows])
    values = np.array([[row['frontBackWidthPixels'], row['sideWidthPixels'], row['sideCenterPixel']] for row in rows])
    intervals = np.diff(knots)
    secants = np.diff(values, axis=0) / intervals[:, None]
    slopes = np.zeros_like(values)
    slopes[0] = secants[0]
    slopes[-1] = secants[-1]
    for index in range(1, len(knots) - 1):
        for channel in range(values.shape[1]):
            previous, following = secants[index - 1, channel], secants[index, channel]
            if previous * following > 0:
                firstWeight = 2 * intervals[index] + intervals[index - 1]
                secondWeight = intervals[index] + 2 * intervals[index - 1]
                slopes[index, channel] = (firstWeight + secondWeight) / (firstWeight / previous + secondWeight / following)
    samples = np.linspace(0, 1, 512)
    result = []
    for sample in samples:
        index = min(len(knots) - 2, max(0, np.searchsorted(knots, sample, side='right') - 1))
        width = intervals[index]
        t = (sample - knots[index]) / width
        result.append((2*t**3-3*t**2+1)*values[index] + (t**3-2*t**2+t)*width*slopes[index]
                      + (-2*t**3+3*t**2)*values[index+1] + (t**3-t**2)*width*slopes[index+1])
    return samples, np.array(result)


def PlaneIntersections(points, triangles, axis, value):
    edges = np.vstack([triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]])
    first, second = points[edges[:, 0]], points[edges[:, 1]]
    denominator = second[:, axis] - first[:, axis]
    selected = (np.minimum(first[:, axis], second[:, axis]) <= value) & (np.maximum(first[:, axis], second[:, axis]) >= value) & (np.abs(denominator) > 1e-9)
    fraction = (value - first[selected, axis]) / denominator[selected]
    return first[selected] + fraction[:, None] * (second[selected] - first[selected])


def ApplyGarmentFit(obj, originalWorld, fittedWorld, weights):
    originalLocal = np.array([vertex.co[:] for vertex in obj.data.vertices])
    originalNormals = np.array([normal.vector[:] for normal in obj.data.corner_normals])
    changed = weights > 1e-6
    local = originalLocal.copy()
    inverse = obj.matrix_world.inverted()
    for index in np.where(changed)[0]:
        local[index] = inverse @ Vector(fittedWorld[index])
    obj.data.vertices.foreach_set('co', local.ravel())
    obj.data.update()
    unique, mapping = np.unique(np.round(originalWorld, 6), axis=0, return_inverse=True)
    counts = np.bincount(mapping)
    newUnique = np.column_stack([np.bincount(mapping, weights=fittedWorld[:, axis]) / counts for axis in range(3)])
    normalMesh = bpy.data.meshes.new('TemporaryGarmentNormals')
    normalMesh.from_pydata(newUnique.tolist(), [], [mapping[list(face.vertices)].tolist() for face in obj.data.polygons])
    normalMesh.update()
    normals = np.array([vertex.normal[:] for vertex in normalMesh.vertices])
    linear = np.array(obj.matrix_world.to_3x3())
    outputNormals = originalNormals.copy()
    for loopIndex, loop in enumerate(obj.data.loops):
        weight = weights[loop.vertex_index]
        if weight > 1e-6:
            normal = normals[mapping[loop.vertex_index]] @ linear
            normal /= max(np.linalg.norm(normal), 1e-9)
            value = originalNormals[loopIndex] * (1-weight) + normal * weight
            outputNormals[loopIndex] = value / max(np.linalg.norm(value), 1e-9)
    obj.data.normals_split_custom_set(outputNormals)
    bpy.data.meshes.remove(normalMesh)
    finalLocal = np.array([vertex.co[:] for vertex in obj.data.vertices])
    assert np.array_equal(finalLocal[~changed], originalLocal[~changed])
    return {'changedVertices': int(changed.sum()),
            'maximumLocalFitMeters': float(np.linalg.norm(fittedWorld-originalWorld, axis=1).max()),
            'unaffectedSurfaceShiftMeters': 0.0}


def FitCapRearHem(cap, head, sourcePoints):
    from mathutils.bvhtree import BVHTree

    original = np.array([(cap.matrix_world @ vertex.co)[:] for vertex in cap.data.vertices])
    headPoints = [(head.matrix_world @ vertex.co) for vertex in head.data.vertices]
    headTree = BVHTree.FromPolygons(headPoints, [tuple(face.vertices) for face in head.data.polygons])
    rearFaces = []
    for face in cap.data.polygons:
        points = sourcePoints[list(face.vertices)]
        center = points.mean(0)
        normal = np.cross(points[1]-points[0], points[2]-points[0])
        normal /= max(np.linalg.norm(normal), 1e-9)
        if center[0] < -0.18 and 0.075 < center[2] < 0.26 and normal[0] < -0.20:
            rearFaces.append(tuple(face.vertices))
    assert rearFaces
    _, mapping = np.unique(np.round(original, 6), axis=0, return_inverse=True)
    fitted = original.copy()
    selected = {int(mapping[index]) for face in rearFaces for index in face}
    groups = {index: np.where(mapping == index)[0] for index in selected}
    samples = np.array([[1/3, 1/3, 1/3], [.5, .5, 0], [.5, 0, .5], [0, .5, .5]])

    def Clearance(point):
        nearest, normal, face, distance = headTree.find_nearest(Vector(point))
        return (Vector(point)-nearest).dot(normal), np.array(normal[:])

    beforeDistances = [Clearance(point)[0] for face in rearFaces for point in samples @ original[list(face[:3])]]
    for iteration in range(6):
        for indices in groups.values():
            signed, normal = Clearance(fitted[indices[0]])
            if signed < 0.004:
                fitted[indices] += normal*(0.004-signed)
        for face in rearFaces:
            triangle = np.array(face[:3])
            checks = [Clearance(point) for point in samples @ fitted[triangle]]
            signed, normal = min(checks, key=lambda item: item[0])
            if signed < 0.002:
                for group in {int(mapping[index]) for index in face}:
                    fitted[groups[group]] += normal*(0.004-signed)
    finalDistances = [Clearance(point)[0] for face in rearFaces for point in samples @ fitted[list(face[:3])]]
    assert min(finalDistances) >= 0.0015
    weights = (np.linalg.norm(fitted-original, axis=1) > 1e-7).astype(float)
    cap.data = cap.data.copy()
    cap.data.name = 'Mesh_SichuanMessenger_RearHemFit'
    result = ApplyGarmentFit(cap, original, fitted, weights)
    result.update({'rearFaces':len(rearFaces),'rearFaceAndEdgeSamples':len(finalDistances),
                   'rearFaceVertexIndices':[list(face) for face in rearFaces],
                   'minimumRearClearanceBeforeMeters':float(min(beforeDistances)),
                   'minimumRearClearanceMeters':float(min(finalDistances)),
                   'sourceSelection':'Rear-facing lower hem, source X < -0.18 and 0.075 < Z < 0.26'})
    return result


def FitSleeveCuffs(body, leftHand, rightHand):
    original = np.array([(body.matrix_world @ vertex.co)[:] for vertex in body.data.vertices])
    fitted = original.copy()
    weights = np.zeros(len(original))
    reports = []
    for sign, hand in [(1, leftHand), (-1, rightHand)]:
        signed = original[:, 1] * sign
        end = signed.max()
        cuff = original[signed > end - 0.030]
        center = (cuff[:, [0, 2]].min(0) + cuff[:, [0, 2]].max(0)) / 2
        handPoints = np.array([(hand.matrix_world @ vertex.co)[:] for vertex in hand.data.vertices])
        hand.data.calc_loop_triangles()
        triangles = np.array([triangle.vertices[:] for triangle in hand.data.loop_triangles])
        section = PlaneIntersections(handPoints, triangles, 1, sign*(end+0.001))[:, [0, 2]]
        assert len(section) > 8
        wristCenter = (section.min(0) + section.max(0)) / 2
        radii = np.ptp(section, axis=0) / 2
        enclosure = np.sqrt(np.sum(((section-wristCenter) / radii)**2, axis=1)).max()
        targetRadii = radii * enclosure + 0.004
        delta = cuff[:, [0, 2]] - center
        angles = np.arctan2(delta[:, 1], delta[:, 0])
        radius = np.linalg.norm(delta, axis=1)
        bins = np.linspace(-math.pi, math.pi, 97)
        envelope = []
        wristAngles = np.arctan2(section[:, 1]-wristCenter[1],section[:, 0]-wristCenter[0])
        wristRadius = np.linalg.norm(section-wristCenter,axis=1)
        wristEnvelope = []
        for angle in bins:
            separation = np.abs(np.angle(np.exp(1j*(angles-angle))))
            nearby = radius[separation < 0.18]
            envelope.append(float(nearby.max()) if len(nearby) else float(radius[np.argmin(separation)]))
            wristSeparation = np.abs(np.angle(np.exp(1j*(wristAngles-angle))))
            nearbyWrist = wristRadius[wristSeparation < 0.12]
            wristEnvelope.append((float(nearbyWrist.max()) if len(nearbyWrist) else float(wristRadius[np.argmin(wristSeparation)]))+0.0035)
        selected = np.where(signed > end - 0.110)[0]
        for index in selected:
            t = np.clip((signed[index] - (end-0.110)) / 0.080, 0, 1)
            weight = float(t*t*(3-2*t))
            pointDelta = original[index, [0, 2]] - center
            angle = math.atan2(pointDelta[1], pointDelta[0])
            sourceRadius = np.interp(angle, bins, envelope)
            targetRadius = np.interp(angle,bins,wristEnvelope)
            targetRadius *= 1 + 0.015 * math.sin(8*angle + 0.4)
            point = wristCenter + pointDelta * targetRadius / max(sourceRadius, 1e-8)
            fitted[index, [0, 2]] = original[index, [0, 2]]*(1-weight) + point*weight
            weights[index] = weight
        reports.append({'side': 'Left' if sign>0 else 'Right', 'wristCenter': wristCenter.tolist(), 'outerRadii': targetRadii.tolist()})
    report = ApplyGarmentFit(body, original, fitted, weights)
    report['cuffs'] = reports
    return report


def FitTrouserCuffs(body, wrapReport):
    original = np.array([(body.matrix_world @ vertex.co)[:] for vertex in body.data.vertices])
    fitted = original.copy()
    weights = np.zeros(len(original))
    topZ = wrapReport['topZ']
    targetRadii = np.array(wrapReport['topRadii']) - 0.003
    for sign in [1, -1]:
        lower = original[(original[:, 1]*sign > 0) & (original[:, 2] < topZ+0.04)]
        sourceCenter = (lower[:, :2].min(0) + lower[:, :2].max(0)) / 2
        sourceRadii = np.ptp(lower[:, :2], axis=0) / 2
        targetCenter = np.array(wrapReport['topCenter'])
        targetCenter[1] *= sign
        for index in np.where((original[:, 1]*sign > 0) & (original[:, 2] < topZ+0.08))[0]:
            t = np.clip((topZ+0.08-original[index, 2]) / 0.076, 0, 1)
            weight = float(t*t*(3-2*t))
            point = targetCenter + (original[index, :2]-sourceCenter) * targetRadii/sourceRadii
            fitted[index, :2] = original[index, :2]*(1-weight) + point*weight
            weights[index] = weight
    return ApplyGarmentFit(body, original, fitted, weights)


def RefineCapCrown(cap):
    data = LoadReferenceProfiles()
    points = np.array([vertex.co[:] for vertex in cap.data.vertices])
    original = points.copy()
    normals = np.array([normal.vector[:] for normal in cap.data.corner_normals])
    scale = float(np.linalg.svd(np.array(cap.matrix_world.to_3x3()), compute_uv=False).mean())
    drop = data['crownDropMeters'] / scale
    span = points[:, 2].max() - 0.35
    t = np.clip((points[:, 2]-0.35)/span, 0, 1)
    points[:, 2] -= drop*t*t*(3-2*t)
    derivative = 1 - drop*6*t*(1-t)/span
    loopVertices = np.array([loop.vertex_index for loop in cap.data.loops])
    normals[:, 2] /= derivative[loopVertices]
    normals /= np.linalg.norm(normals, axis=1, keepdims=True).clip(1e-9)
    cap.data.vertices.foreach_set('co', points.ravel())
    cap.data.update()
    cap.data.normals_split_custom_set(normals)
    assert np.array_equal(points[original[:, 2] <= 0.35], original[original[:, 2] <= 0.35])
    return {'crownDropMeters': data['crownDropMeters'], 'bandAndVisorChangeMeters': 0.0}
