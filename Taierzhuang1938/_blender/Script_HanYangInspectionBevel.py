"""Round the exposed ridges of the cosmetic meshes and repack their UVs."""
import hashlib
import json
import math
import os
import struct
from pathlib import Path

import bmesh
import bpy
import numpy as np


archive = Path(os.environ.get('HANYANG_SOURCE_DIR', 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R'))
revision = archive / 'ExteriorFinish_20261122'
geometryDirectory = Path(os.environ.get('HANYANG_BAKE_GEOMETRY_DIR', revision))
assert not bpy.data.filepath or Path(bpy.data.filepath).resolve().parent == revision.resolve()


def Sources(file, digest):
    raw = (revision / file).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == digest
    size = struct.unpack_from('<I', raw, 12)[0]
    document = json.loads(raw[20:20+size])
    payload = memoryview(raw)[28+size:]

    def Read(index):
        accessor = document['accessors'][index]
        view = document['bufferViews'][accessor['bufferView']]
        offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        width = {'VEC3': 3, 'SCALAR': 1}[accessor['type']]
        dtype = {5126: '<f4', 5123: '<u2', 5125: '<u4'}[accessor['componentType']]
        return np.frombuffer(payload, dtype, accessor['count'] * width, offset).reshape(-1, width)

    def Mesh(name):
        node = next(node for node in document['nodes'] if node['name'] == name)
        primitive = document['meshes'][node['mesh']]['primitives'][0]
        return Read(primitive['attributes']['POSITION']), Read(primitive['indices']).reshape(-1, 3)

    return Mesh


def ExposedEdge(name, edge, width):
    length = edge.calc_length()
    if not edge.is_contiguous or not edge.is_convex or length < .16:
        return False
    flank = min(2*face.calc_area()/length for face in edge.link_faces)
    if flank < width*.51:
        return False
    first, second = (vert.co * .001 for vert in edge.verts)
    midpoint = (first + second) / 2
    turn = edge.calc_face_angle()
    if name == 'ReceiverOuterCollar':
        # Ring edges on the two front steps and the rear of the raised shell.
        step = any(abs(midpoint.z - centre) < halfWidth for centre, halfWidth in
                   ((-.265, .002), (-.25855, .00044), (-.25467, .00052), (-.22125, .00063)))
        return (step and midpoint.y > .039 and abs(first.z - second.z) < .00099
                and math.radians(17) < turn < math.radians(122))
    if name == 'HandleRoot':
        return midpoint.x > .0075 and length > 1. and turn > math.radians(21.8)
    if name.startswith('LowerPlateGuard_'):
        if abs(midpoint.x) <= .0074 or turn >= math.radians(116):
            return False
        if -.144 < midpoint.z < -.061 and -.029 < midpoint.y < .001:
            towardY, towardZ = -.012-midpoint.y, -.104-midpoint.z
            inward = max(face.normal.y*towardY+face.normal.z*towardZ for face in edge.link_faces)
            if inward > .54*math.hypot(towardY,towardZ):
                return turn > math.radians(22)
        return length > .62 and turn > math.radians(32)
    return turn > math.radians(25)


def BroadenSightReturn(points):
    """Open up the narrow lip already present around the visible sight block."""
    points = points.copy()
    low, high = points.min(axis=0), points.max(axis=0)
    fromTop = high[1]-points[:, 1]
    upper = fromTop < .00014
    perimeter = np.zeros(len(points), dtype=bool)
    for axis in (0, 2):
        atLow = upper & (points[:, axis]-low[axis] < .00013)
        atHigh = upper & (high[axis]-points[:, axis] < .00013)
        points[atLow, axis] += 1.25*(points[atLow, axis]-low[axis])
        points[atHigh, axis] -= 1.25*(high[axis]-points[atHigh, axis])
        perimeter |= atLow | atHigh
    points[perimeter, 1] -= 1.25*fromTop[perimeter]
    return points


def CheekOutline(positions, triangles):
    faces = positions[triangles]
    front = faces[np.all(faces[:, :, 0] > 0., axis=1), :, 1:].astype(np.float64)
    low, high = front.min(axis=(0, 1)), front.max(axis=(0, 1))
    centre, extent = .5*(low+high), high-low
    normalized = (front-centre)/extent
    corners = normalized.reshape(-1, 2)
    edges = (np.roll(normalized, -1, axis=1)-normalized).reshape(-1, 2)
    angle = np.arange(40)*2.*np.pi/40
    rays = np.column_stack((np.cos(angle), np.sin(angle)))
    perpendicular = np.column_stack((rays[:, 1], -rays[:, 0]))
    denominator = edges @ perpendicular.T
    fractions = np.divide(-(corners @ perpendicular.T), denominator,
                          out=np.full_like(denominator, np.nan), where=abs(denominator)>1e-12)
    hit = corners[:, None, :] + fractions[:, :, None]*edges[:, None, :]
    distance = np.einsum('sri,ri->sr', hit, rays)
    valid = (fractions>=-1e-7)&(fractions<=1.+1e-7)&(distance>0.)
    outer = np.max(np.where(valid, distance, -np.inf), axis=0)
    assert np.isfinite(outer).all()
    outline = centre + extent*outer[:, None]*rays
    # Ease the small silhouette steps left by the old extruded profile.
    return .90*outline + .05*(np.roll(outline,1,axis=0)+np.roll(outline,-1,axis=0))


def RoundedCheeks(name, positions, triangles, radius):
    """Roll the visible thin side returns into the approved side profile."""
    outline = CheekOutline(positions, triangles)
    edges = np.roll(outline,-1,axis=0)-outline
    edges /= np.linalg.norm(edges, axis=1)[:, None]
    across = np.column_stack((edges[:, 1], -edges[:, 0]))
    bisector = across + np.roll(across,1,axis=0)
    bisector /= np.einsum('ij,ij->i', bisector, across)[:, None]
    positive = positions[positions[:,0]>0.,0]
    low, high = positive.min(), positive.max()
    quarter = (1.-math.sqrt(.5))*radius
    rows = [(low,radius), (low+quarter,quarter), (low+radius,0.),
            (high-radius,0.), (high-quarter,quarter), (high,radius)]
    points, faces, weights = [], [], []
    count = len(outline)
    for side in (-1.,1.):
        base = len(points)
        for x, inset in rows:
            points.extend(np.column_stack((np.full(count, side*x), outline-inset*bisector)))
        for row in range(len(rows)-1):
            start = base+row*count
            for i in range(count):
                j = (i+1)%count
                faces.append((start+i,start+j,start+j+count,start+i+count))
                weights.append(.22 if row==2 else 1.)
        faces.extend((tuple(range(base,base+count)),tuple(range(base+5*count,base+6*count))))
        weights.extend((0.,0.))
    mesh = bpy.data.meshes.new(name+' rolled side returns')
    mesh.from_pydata((np.asarray(points)*1000).tolist(), [], faces)
    mesh.update()
    edit = bmesh.new()
    try:
        edit.from_mesh(mesh)
        edit.faces.ensure_lookup_table()
        rounded = edit.faces.layers.float.new('rounded')
        for face, weight in zip(edit.faces,weights):
            face[rounded] = weight
            face.smooth = True
        bmesh.ops.recalc_face_normals(edit, faces=list(edit.faces))
        bmesh.ops.triangulate(edit, faces=list(edit.faces), quad_method='BEAUTY', ngon_method='BEAUTY')
        edit.to_mesh(mesh)
    finally:
        edit.free()
    mesh.update()
    print(name, len(triangles), '->', len(mesh.polygons), 'triangles on rolled side returns')
    return mesh


def RoundedMesh(name, source, width):
    positions, triangles = source(name)
    if name == 'RearOuterCover_RoundedSideReturn':
        return RoundedCheeks(name,positions,triangles,width)
    if name == 'Sight_LowCrossPiece':
        positions = BroadenSightReturn(positions)
    points, remap = np.unique(np.round(positions, 6), axis=0, return_inverse=True)
    faces = remap.reshape(-1)[triangles]
    keys = np.sort(faces, axis=1)
    _, unique = np.unique(keys, axis=0, return_index=True)
    keep = np.sort(unique)
    keep = keep[np.all(np.diff(keys[keep], axis=1) != 0, axis=1)]
    mesh = bpy.data.meshes.new(name + ' finished edges')
    # Blender's bevel and tangent calculations are better conditioned in millimetres.
    mesh.from_pydata((points*1000).tolist(), [], faces[keep].tolist())
    mesh.update()
    edit = bmesh.new()
    try:
        edit.from_mesh(mesh)
        rounded = edit.faces.layers.float.new('rounded')
        flatAngle = 1.3 if name == 'ReceiverOuterCollar' else .75
        bmesh.ops.dissolve_limit(edit, angle_limit=math.radians(flatAngle),
                                 verts=list(edit.verts), edges=list(edit.edges))
        edit.normal_update()
        edges = [edge for edge in edit.edges if ExposedEdge(name, edge, width*1000)]
        assert edges, name
        segments = 3 if name.startswith('LowerPlateGuard_') else 4
        bevel = bmesh.ops.bevel(edit, geom=edges, offset=width*1000, segments=segments, profile=.5,
                                affect='EDGES', clamp_overlap=False, loop_slide=False)
        assert bevel['faces'], name
        for face in bevel['faces']:
            if face.is_valid:
                face[rounded] = 1.
        bmesh.ops.dissolve_degenerate(edit, dist=.001, edges=list(edit.edges))
        bmesh.ops.triangulate(edit, faces=list(edit.faces), quad_method='BEAUTY', ngon_method='BEAUTY')
        slivers = [face for face in edit.faces
                   if 2*face.calc_area() < .001*max(edge.calc_length() for edge in face.edges)]
        bmesh.ops.delete(edit, geom=slivers, context='FACES_ONLY')
        edgeCount = len(edges)
        edit.normal_update()
        for face in edit.faces:
            face.smooth = True
        for edge in edit.edges:
            edge.smooth = edge.is_contiguous and edge.calc_face_angle() < math.radians(45)
        edit.to_mesh(mesh)
    finally:
        edit.free()
    mesh.update()
    mesh.validate()
    print(name, len(triangles), '->', len(mesh.polygons), 'triangles on', edgeCount, 'rounded edges')
    return mesh


def RepairCollapsedIslands(uv, cornerPoints):
    """Give edge-on triangles their own atlas cells with an in-plane projection."""
    coordinates = uv.reshape(-1, 3, 2)
    exact = coordinates.astype(np.float64)
    first, second = exact[:, 1] - exact[:, 0], exact[:, 2] - exact[:, 0]
    determinant = first[:, 0] * second[:, 1] - first[:, 1] * second[:, 0]
    flat = np.flatnonzero(abs(determinant) < 5e-8)
    if not len(flat):
        return
    coordinates *= .90
    coordinates += .005
    columns = 20
    rows = math.ceil(len(flat) / columns)
    cell = min(.047, .087/rows)
    for index, face in enumerate(flat):
        points = cornerPoints[face].astype(np.float64)
        edges = np.roll(points, -1, axis=0) - points
        axis = edges[np.argmax(np.linalg.norm(edges, axis=1))]
        axis /= np.linalg.norm(axis)
        normal = np.cross(edges[0], edges[1])
        normal /= np.linalg.norm(normal)
        patch = points @ np.column_stack((axis, np.cross(normal, axis)))
        patch -= patch.min(axis=0)
        patch *= .65*cell/np.ptp(patch, axis=0).max()
        height = np.ptp(patch[:, 1])
        patch[:, 1] *= max(1., .00010/height)
        coordinates[face] = patch + (.006 + cell*(index % columns), .910 + cell*(index // columns))


def Atlas(name, source, width):
    mesh = RoundedMesh(name, source, width)
    obj = bpy.data.objects.new(name + ' atlas work', mesh)
    bpy.context.scene.collection.objects.link(obj)
    try:
        mesh.uv_layers.new(name='InspectionAtlas')
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(48), island_margin=.007,
                                 margin_method='FRACTION', area_weight=.45, correct_aspect=False,
                                 scale_to_bounds=False)
        bpy.ops.uv.select_all(action='SELECT')
        bpy.ops.uv.pack_islands(rotate=True, rotate_method='ANY', scale=True,
                                margin_method='FRACTION', margin=.0055, shape_method='CONCAVE')
        bpy.ops.object.mode_set(mode='OBJECT')
        assert {len(face.vertices) for face in mesh.polygons} == {3}, name
        count = len(mesh.loops)
        corners = np.empty(count, dtype='<u4')
        points = np.empty((len(mesh.vertices), 3), dtype='<f4')
        uv = np.empty((count, 2), dtype='<f4')
        normal = np.empty((count, 3), dtype='<f4')
        tangent = np.empty((count, 3), dtype='<f4')
        sign = np.empty(count, dtype='<f4')
        mesh.vertices.foreach_get('co', points.ravel())
        mesh.loops.foreach_get('vertex_index', corners)
        mesh.uv_layers.active.uv.foreach_get('vector', uv.ravel())
        RepairCollapsedIslands(uv, points[corners].reshape(-1, 3, 3))
        mesh.uv_layers.active.uv.foreach_set('vector', uv.ravel())
        mesh.calc_tangents(uvmap='InspectionAtlas')
        mesh.corner_normals.foreach_get('vector', normal.ravel())
        mesh.loops.foreach_get('tangent', tangent.ravel())
        mesh.loops.foreach_get('bitangent_sign', sign)
        geometry = points[corners].reshape(-1, 3, 3).astype(np.float64)
        edgeA, edgeB = geometry[:, 1]-geometry[:, 0], geometry[:, 2]-geometry[:, 0]
        planes = np.cross(edgeA, edgeB)
        planes /= np.linalg.norm(planes, axis=1)[:, None]
        unusable = np.linalg.norm(normal, axis=1) < .9
        normal[unusable] = planes[np.flatnonzero(unusable)//3]
        tangent -= (tangent * normal).sum(axis=1)[:, None] * normal
        uvFaces = uv.reshape(-1, 3, 2).astype(np.float64)
        uvA, uvB = uvFaces[:, 1] - uvFaces[:, 0], uvFaces[:, 2] - uvFaces[:, 0]
        determinant = uvA[:, 0] * uvB[:, 1] - uvA[:, 1] * uvB[:, 0]
        assert np.min(abs(determinant)) > 1e-10, (name, np.min(abs(determinant)))
        # MikkTSpace can omit corners along a welded source overlap. Use the
        # triangle's geometric UV derivatives for those corners.
        bad = np.flatnonzero((np.linalg.norm(tangent, axis=1) < .001) | (abs(sign) != 1) | unusable)
        face = bad//3
        frames = normal[bad]
        u = (edgeA[face]*uvB[face, 1, None] - edgeB[face]*uvA[face, 1, None])/determinant[face, None]
        v = (edgeB[face]*uvA[face, 0, None] - edgeA[face]*uvB[face, 0, None])/determinant[face, None]
        projected = u-(u*frames).sum(axis=1)[:, None]*frames
        tangent[bad] = np.where((np.linalg.norm(projected, axis=1) > 1e-6)[:, None], projected,
                                np.cross(v, frames))
        sign[bad] = np.where((np.cross(frames, tangent[bad])*v).sum(axis=1) < 0, -1., 1.)
        lengths = np.linalg.norm(tangent, axis=1)
        assert np.all(lengths > 1e-6) and np.isfinite(lengths).all(), name
        tangent /= lengths[:, None]
        faceWear = np.empty(len(mesh.polygons), dtype='<f4')
        mesh.attributes['rounded'].data.foreach_get('value', faceWear)
        assert np.count_nonzero(faceWear), name
        edgeWear = np.repeat(faceWear, 3)
        keys = np.column_stack((corners, normal.view('<u4'), uv.view('<u4'),
                                tangent.view('<u4'), sign.view('<u4'), edgeWear.view('<u4')))
        _, first, indices = np.unique(keys, axis=0, return_index=True, return_inverse=True)
        return {'POSITION': points[corners[first]]*.001, 'NORMAL': normal[first], 'TEXCOORD_0': uv[first],
                'TANGENT': np.column_stack((tangent[first], sign[first])), 'EDGE_WEAR': edgeWear[first],
                'indices': indices.astype('<u4').reshape(-1, 1)}
    finally:
        if obj.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.meshes.remove(mesh)


base = Sources('Input_R2.glb', '6f302b5dd315a7cec8b5bcebfcf0421302740de45609b2768afcdde4133c068d')
approved = Sources('Input_ExteriorGeometry.glb', 'e125056b12391f022f7e22969bb3acdf192295be711995b6ac43b958b31f47ec')
plans = [('ReceiverOuterCollar', approved, .00036),
         ('Sight_LowContinuousLeaf_NoUnknownNumbers', base, .00037),
         ('Sight_LowCrossPiece', base, .00040),
         ('Sight_ShallowRoundSeat', base, .00033),
         ('HandleRoot', approved, .00021),
         ('LowerPlateGuard_FlatSideNarrowReturn', approved, .00020),
         ('RearOuterCover_RoundedSideReturn', base, .00029),
         ('FrontBandSideStrip', approved, .00023)]
selection = list(bpy.context.selected_objects)
active = bpy.context.view_layer.objects.active
output = {}
try:
    for part, source, offset in plans:
        for key, values in Atlas(part, source, offset).items():
            output[part + '_' + key] = values
finally:
    for obj in selection:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = active
geometryDirectory.mkdir(parents=True, exist_ok=True)
np.savez_compressed(geometryDirectory / 'Data_InspectionBevels.npz', **output)
