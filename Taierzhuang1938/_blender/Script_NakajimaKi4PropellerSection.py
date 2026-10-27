"""Build two closed, smoothly interpolated metal propeller blade sections.

The original manual establishes a separated two-blade metal construction.
The outline, section, pitch and diameter below are photographic reconstruction.
All points are defined in the real propeller pivot's local frame.
"""
import math
import bpy, bmesh
import numpy as np
from mathutils import Matrix


def SplineValue(spline, x):
    knots = np.array(spline['knots'])
    coefficients = np.array(spline['coefficients'])
    index = np.clip(np.searchsorted(knots, x, side='right') - 1, 0, len(knots) - 2)
    delta = x - knots[index]
    return ((coefficients[0, index] * delta + coefficients[1, index]) * delta
            + coefficients[2, index]) * delta + coefficients[3, index]


def BuildPropellerSections(root, recipe):
    p = np.array(recipe['parameters'])
    theta = np.array(recipe['angleSamples'])
    count = recipe['circumferenceSamples']
    radius = .12 + 1.33 * np.sin(theta)
    fraction = (radius - .12) / 1.33
    beta = np.arange(count) * (2 * math.pi / count)
    oldPitch = np.arctan(np.sin(.62 - .38 * radius / 1.45))
    planeShift = p[9] if len(p) > 9 else 0.
    twistCurve = p[10] if len(p) > 10 else 0.
    pitch = oldPitch + p[2] + p[6] * fraction + twistCurve * 4 * fraction * (1 - fraction)
    assert pitch.min() >= .07 and pitch.max() <= 1.22
    radial = .12 + (radius - .12) * p[0]
    half = (SplineValue(recipe['widthSpline'], theta)
            * np.sqrt(1 + np.sin(.62 - .38 * radius / 1.45) ** 2)
            * p[1] * (1 + (p[8] - 1) * fraction ** 2))
    thickness = .012 * np.sin(math.pi * radius / 1.45)
    sweep = SplineValue(recipe['sweepSpline'], radius) * p[7]
    lateral = (half[:, None] * np.cos(beta)[None, :] * np.cos(pitch[:, None])
               - thickness[:, None] * np.sin(beta)[None, :] * np.sin(pitch[:, None]))
    axial = (half[:, None] * np.cos(beta)[None, :] * np.sin(pitch[:, None])
             + thickness[:, None] * np.sin(beta)[None, :] * np.cos(pitch[:, None])
             + p[5] * fraction[:, None] ** 1.5 + planeShift)
    direction = np.array([math.sin(.87), math.cos(.87)])
    cross = np.array([math.cos(.87), -math.sin(.87)])
    pivot = bpy.data.objects['Pivot_Propeller']
    assert pivot in root.children_recursive
    rows = []
    for atlasIndex, side in enumerate([-1, 1]):
        obj = bpy.data.objects['Propeller_Blade' + str(side)]
        originalMesh = obj.data
        originalMaterial = originalMesh.materials[0]
        xy = side * (radial[:, None, None] * direction
                     + sweep[:, None, None] * cross + lateral[:, :, None] * cross)
        local = np.concatenate([xy, -(.015 + axial[:, :, None])], axis=2)
        # glTF local (X,Y,Z) -> Blender local (X,-Z,Y).
        points = np.stack([local[:, :, 0], -local[:, :, 2], local[:, :, 1]], axis=2)
        vertices = points[:-1].reshape(-1, 3).tolist()
        tip = len(vertices)
        vertices.append(points[-1].mean(axis=0).tolist())
        faces = []
        charts = []
        tipRow = len(theta) - 1
        offset = atlasIndex * .5

        def Ao(row, angular):
            return (offset + .02 + .46 * fraction[row], .06 + .90 * angular / count)

        for row in range(tipRow - 1):
            for angular in range(count):
                following = (angular + 1) % count
                quad = (row * count + angular, (row + 1) * count + angular,
                        (row + 1) * count + following, row * count + following)
                chart = [Ao(row, angular), Ao(row + 1, angular),
                         Ao(row + 1, angular + 1), Ao(row, angular + 1)]
                # Fix the diagonal before the normals pass so the numerical
                # triangle-union fit and the saved/exported loft are identical.
                for indices in [(0, 1, 2), (0, 2, 3)]:
                    faces.append(tuple(quad[index] for index in indices))
                    charts.append([chart[index] for index in indices])
        for angular in range(count):
            faces.append(((tipRow - 1) * count + angular, tip,
                          (tipRow - 1) * count + (angular + 1) % count))
            charts.append([Ao(tipRow - 1, angular), Ao(tipRow, angular + .5),
                           Ao(tipRow - 1, angular + 1)])
        faces.append(tuple(reversed(range(count))))
        charts.append([(offset + .12 + .035 * math.cos(2 * math.pi * i / count),
                        .025 + .018 * math.sin(2 * math.pi * i / count))
                       for i in reversed(range(count))])
        mesh = bpy.data.meshes.new('Mesh_Ki4ClosedPropeller' + str(side))
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        uv0 = mesh.uv_layers.new(name='UVMap')
        uv1 = mesh.uv_layers.new(name='GeometryAO')
        for polygon, chart in zip(mesh.polygons, charts):
            polygon.use_smooth = polygon.index != len(mesh.polygons) - 1
            for loopIndex, ao in zip(polygon.loop_indices, chart):
                point = np.array(vertices[mesh.loops[loopIndex].vertex_index])
                g = np.array([point[0], point[2], -point[1]])
                if polygon.index == len(mesh.polygons) - 1:
                    uv = (float(side * np.dot(g[:2], cross) / 1.5 + .5), float(-g[2] / 1.5 + .5))
                else:
                    uv = (float(side * np.dot(g[:2], direction) / 1.5),
                          float(side * np.dot(g[:2], cross) / 1.5 + .5))
                uv0.data[loopIndex].uv = uv
                uv1.data[loopIndex].uv = ao
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if bm.calc_volume(signed=True) < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        assert all(edge.is_manifold for edge in bm.edges)
        assert all(face.calc_area() > 1e-13 for face in bm.faces)
        volume = bm.calc_volume(signed=True)
        assert volume > 0
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()
        mesh.materials.append(originalMaterial)
        mesh.uv_layers.active_index = 0
        mesh.uv_layers[0].active_render = True
        obj.data = mesh
        obj.parent = pivot
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.matrix_basis = Matrix.Identity(4)
        obj['sectionScope'] = 'Smooth rounded closed metal sections; photographically reconstructed planform/pitch/diameter, not factory section measurements'
        if originalMesh.users == 0:
            bpy.data.meshes.remove(originalMesh)
        mesh.calc_loop_triangles()
        rows.append({'name': obj.name, 'vertices': len(mesh.vertices),
                     'triangles': len(mesh.loop_triangles), 'volumeM3': volume,
                     'openOrNonmanifoldEdges': 0, 'rootVertexIndices': list(range(count)),
                     'sampledLocalGltf': local.reshape(-1, 3).tolist()})
    bpy.context.view_layer.update()
    return rows
