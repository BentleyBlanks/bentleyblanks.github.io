"""Build a textured game prop from the visible Yang Yunfeng photo contours."""

from bisect import bisect_right
from collections import Counter
import json
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import delaunay_2d_cdt

from TzmCore import AUTHORED_NORMAL_LAYER, Node
from Script_YangYunfengDadaoUv import (BLADE_FACE, FACES, GRIP, RIMS, RIM_DEPTH, AtlasUv,
                                    ClosestOnRim, FaceBounds, GripRange, PhotoPosition, Plane, RimPaths)


FIT_FILE = Path(__file__).with_name("Data_YangYunfengDadaoFit.json")
TRIANGLE_LIMIT = 10_000


def World(frame, u, v, depth=0):
    scale = frame["scale"]
    return depth * scale, (v - frame["center"]) * scale, frame["zMin"] + (u - frame["left"]) * scale


def FromPhoto(frame, x, y, depth=0):
    u, v = Plane(frame, x, y)
    return World(frame, u, v, depth)


def BladeUv(mesh, fit):
    frame, atlas = fit["frame"], fit["atlas"]
    left, right, top, bottom = FaceBounds(fit, "Blade")
    bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
    mesh.normal_update()
    layer = mesh.loops.layers.uv.new()
    for face in mesh.faces:
        nx, ny, _ = face.normal
        strip = 0 if abs(nx) >= .035 else (2 if ny < 0 else 3)
        for loop in face.loops:
            u, v, depth = PhotoPosition(frame, loop.vert.co)
            if strip == 0:
                loop[layer].uv = AtlasUv(BLADE_FACE, (u - left) / (right - left), (v - top) / (bottom - top))
            else:
                rect = (16, strip * 256 + 20, 992, 216)
                along = (u - atlas["left"]) / (atlas["right"] - atlas["left"])
                loop[layer].uv = AtlasUv(rect, along, .5 + depth / 144)


def Inside(x, y, loop):
    inside = False
    for (x0, y0), (x1, y1) in zip(loop, loop[1:] + loop[:1]):
        if (y0 > y) != (y1 > y) and x < x0 + (x1 - x0) * (y - y0) / (y1 - y0):
            inside = not inside
    return inside


def TriangulatePlate(part):
    vertices, edges, relief = [], [], []
    for loop in part["loops"]:
        start = len(vertices)
        vertices.extend(Vector(value) for value in loop)
        relief.extend(0 for _ in loop)
        edges.extend((start + i, start + (i + 1) % len(loop)) for i in range(len(loop)))
    for x, y, distance in part["surface"]:
        vertices.append(Vector((x, y)))
        relief.append(distance)
    coordinates, _, candidates, origins, _, _ = delaunay_2d_cdt(vertices, edges, [], 0, .0001)
    shell = []
    exterior, *holes = part["loops"]
    for a, b, c in candidates:
        p, q, r = coordinates[a], coordinates[b], coordinates[c]
        x, y = (p + q + r) / 3
        if not Inside(x, y, exterior) or any(Inside(x, y, loop) for loop in holes):
            continue
        if (q - p).cross(r - p) < 0:
            b, c = c, b
        shell.append((a, b, c))
    depths = [max((relief[i] for i in ids), default=0) for ids in origins]
    return coordinates, shell, depths


def PlateDepth(part, distance):
    # Rounded, shaded exterior surfaces for the prop's oblique views.
    border, volume, fade = {"Blade": (2.3, 7.0, 8.5), "Guard": (4.6, 13.5, 9.5), "Pommel": (5.8, 21, 17)}[part]
    return border + volume * (1 - math.exp(-distance / fade)) ** .72


def AcrossBlade(u, v, outline):
    cross = [a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0])
             for a, b in zip(outline, outline[1:] + outline[:1])
             if (a[0] <= u < b[0]) or (b[0] <= u < a[0])]
    if len(cross) < 2 or max(cross) - min(cross) < .001:
        return .5
    return min(1, max(0, (v - min(cross)) / (max(cross) - min(cross))))


def SmoothBladeWall(mesh, wall):
    rim = set(wall)
    for face in wall:
        face.smooth = True
    for edge in mesh.edges:
        faces = tuple(edge.link_faces)
        if any(face in rim for face in faces):
            edge.smooth = (len(faces) == 2 and all(face in rim for face in faces)
                           and faces[0].normal.dot(faces[1].normal) >= .74)
    StoreCornerNormals(mesh)


def StoreCornerNormals(mesh):
    # Retain Blender's corner weighting after the exporter triangulates the bevels.
    mesh.faces.index_update()
    mesh.verts.index_update()
    proxy = bpy.data.meshes.new("Dadao Corner Normals")
    try:
        mesh.to_mesh(proxy)
        normals = proxy.corner_normals
        authored = mesh.loops.layers.float_vector.new(AUTHORED_NORMAL_LAYER)
        for face in mesh.faces:
            loops = proxy.polygons[face.index].loop_indices
            corners = {proxy.loops[i].vertex_index: normals[i].vector for i in loops}
            for loop in face.loops:
                loop[authored] = corners[loop.vert.index]
    finally:
        bpy.data.meshes.remove(proxy)


def RoundFitting(mesh, wall, scale, segments):
    mesh.faces.index_update()
    indices = {face.index for face in wall}
    tag = mesh.faces.layers.int.new("FittingRim")
    rim = {face for face in mesh.faces if face.index in indices}
    edges = [edge for edge in mesh.edges if edge.is_manifold
             and sum(face in rim for face in edge.link_faces) == 1]
    for face in rim:
        face[tag] = 1
    rounded = bmesh.ops.bevel(mesh, geom=edges, offset=1.10 * scale, segments=segments,
                             profile=.5, clamp_overlap=True, affect="EDGES")
    rim = set(rounded["faces"])
    for face in mesh.faces:
        face.smooth = True
        if face[tag]:
            rim.add(face)
    return rim


def FittingUv(mesh, fit, name, rim):
    frame = fit["frame"]
    left, right, top, bottom = FaceBounds(fit, name)
    paths = tuple(RimPaths(fit, name))
    bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
    mesh.normal_update()
    layer = mesh.loops.layers.uv.new()
    for face in mesh.faces:
        if face not in rim:
            for loop in face.loops:
                u, v, _ = PhotoPosition(frame, loop.vert.co)
                loop[layer].uv = AtlasUv(FACES[name], (u - left) / (right - left), (v - top) / (bottom - top))
            continue
        u, v, _ = PhotoPosition(frame, face.calc_center_median())
        index = min(range(len(paths)), key=lambda i: ClosestOnRim(u, v, paths[i])[0])
        outline = [PhotoPosition(frame, loop.vert.co) for loop in face.loops]
        stations = [ClosestOnRim(u, v, paths[index])[1] for u, v, _ in outline]
        seam = max(stations) - min(stations) > .5
        for loop, point, station in zip(face.loops, outline, stations):
            if seam and station < .5:
                station = 1
            width = .5 + .5 * max(-1., min(1., point[2] / RIM_DEPTH[name]))
            loop[layer].uv = AtlasUv(RIMS[name][index], station, width)


def BuildPlate(fit, name):
    coordinates, shell, relief = TriangulatePlate(fit["parts"][name])
    mesh = bmesh.new()
    frame = fit["frame"]
    used = sorted({i for face in shell for i in face})
    depths = {i: PlateDepth(name, relief[i]) for i in used}
    if name == "Blade":
        outline = [Plane(frame, *point) for point in fit["parts"][name]["loops"][0]]
        for i in used:
            u, v = Plane(frame, *coordinates[i])
            t = min(1, max(0, (AcrossBlade(u, v, outline) - .71) / .22))
            # Preserve the engine's +Y visual edge orientation and the photo projection.
            depths[i] *= 1 - .84 * t * t * (3 - 2 * t)
    elif name == "Pommel":
        aperture = [Plane(frame, *p) for loop in fit["parts"][name]["loops"][1:] for p in loop]
        left, right = min(u for u, _ in aperture), max(u for u, _ in aperture)
        centerU = (left + right) / 2
        centerV = (min(v for _, v in aperture) + max(v for _, v in aperture)) / 2
        for i in used:
            u, v = Plane(frame, *coordinates[i])
            theta = math.atan2(v - centerV, 1.12 * (u - centerU))
            roll = (.5 + .5 * math.cos(13 * theta + 1.3 * math.sin(4 * theta) + .6 * math.sin(9 * theta))) ** 1.38
            yarn = min(1, max(0, (u - left + 9) / 22))
            depths[i] *= 1 - .108 * yarn * roll
    front = {i: mesh.verts.new(FromPhoto(frame, *coordinates[i], depths[i])) for i in used}
    back = {i: mesh.verts.new(FromPhoto(frame, *coordinates[i], -depths[i])) for i in used}
    boundaries = Counter(tuple(sorted((a, b))) for face in shell for a, b in zip(face, face[1:] + face[:1]))
    wall = []
    for face in shell:
        mesh.faces.new([front[i] for i in reversed(face)]).smooth = True
        mesh.faces.new([back[i] for i in face]).smooth = True
        for a, b in zip(face, face[1:] + face[:1]):
            if boundaries[tuple(sorted((a, b)))] == 1:
                edgeFace = mesh.faces.new((front[a], front[b], back[b], back[a]))
                edgeFace.smooth = name != "Blade"
                wall.append(edgeFace)
    if name == "Blade":
        BladeUv(mesh, fit)
        SmoothBladeWall(mesh, wall)
    else:
        bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
        rim = RoundFitting(mesh, wall, frame["scale"], 2 if name == "Guard" else 1)
        FittingUv(mesh, fit, name, rim)
        StoreCornerNormals(mesh)
    return mesh


def ClothEndAt(rows, v):
    for outside, inside in zip(rows, rows[1:]):
        u, low, high = outside
        if low <= v <= high:
            return u
        if inside[1] <= v <= inside[2]:
            side = 1 if v < low else 2
            blend = (v - outside[side]) / (inside[side] - outside[side])
            return u + blend * (inside[0] - u)
    return rows[-1][0]


def TuckRows(mesh, frame, section, photographedEnd, direction):
    _, top, bottom = photographedEnd[-1]
    center, radius = (top + bottom) / 2, (bottom - top) / 2
    # Cross sections remain oval at the join. The outermost ring is recessed
    # into the fitting so its closing face stays below the visible cloth edge.
    return [[mesh.verts.new(World(frame, ClothEndAt(photographedEnd, center + radius * v) + direction * extension,
                                  center + radius * v * width, .34 * .76 * radius * depth * thickness))
             for v, depth in section]
            for extension, width, thickness in ((14.0, .77, .52), (6.2, .96, .96), (.72, 1.0, 1.0))]


def GuardBack(outline, v):
    return max(a[0] + (b[0] - a[0]) * (v - a[1]) / (b[1] - a[1])
               for a, b in zip(outline, outline[1:] + outline[:1])
               if min(a[1], b[1]) <= v < max(a[1], b[1]))


def SeatUpperGrip(mesh, fit, section, profile, guard):
    frame = fit["frame"]
    first, low, high = profile
    center, radius = (high + low) / 2, (high - low) / 2
    outline = [Plane(frame, *point) for point in fit["parts"]["Guard"]["loops"][0]]
    surface = BVHTree.FromBMesh(guard)
    origin, towards = .12, Vector((-1, 0, 0))
    rows = []
    # The wrap stays compressed through the guard's rounded rear edge. It
    # regains its oval cross section over the exposed length of the collar.
    for offset, width, depthScale in ((-9.0, .88, .32), (-4.0, .97, .24), (0, 1, .145),
                                       (2.7, 1, .24), (7.8, 1, .49)):
        row = []
        for side, depth in section:
            v = center + radius * width * side
            edge = GuardBack(outline, v)
            out = min(1, (first - edge - .95) / 7.8)
            u = edge + offset * (out if offset > 0 else 1)
            x, y, z = World(frame, u, v, .34 * radius * depth * depthScale)
            hit = surface.ray_cast(Vector((origin, y, z)), towards, 2 * origin)[0]
            if hit is not None:
                # Keep the overlap inside the metal itself on both faces.
                limit = max(.00005, hit.x - .65 * frame["scale"])
                x = math.copysign(min(abs(x), limit), x)
            row.append(mesh.verts.new((x, y, z)))
        rows.append(row)
    return rows


def GripProfileAt(samples, u):
    for a, b in zip(samples, samples[1:]):
        if a[0] <= u <= b[0]:
            t = (u - a[0]) / (b[0] - a[0])
            return a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])
    return (samples[0] if u < samples[0][0] else samples[-1])[1:]


def GripUv(mesh, fit, rows, sides):
    frame = fit["frame"]
    first, last = GripRange(fit)
    around = {vert: ((i - sides // 4) % sides) / sides for row in rows for i, vert in enumerate(row)}
    along = {vert: (PhotoPosition(frame, vert.co)[0] - first) / (last - first) for vert in around}
    bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
    mesh.normal_update()
    layer = mesh.loops.layers.uv.new()
    for face in mesh.faces:
        if len(face.verts) == sides:
            # The buried end caps use a small patch of the same cloth.
            for loop in face.loops:
                phase = math.tau * around[loop.vert]
                loop[layer].uv = AtlasUv(GRIP, .065 + .018 * math.cos(phase), .48 + .035 * math.sin(phase))
            continue
        fractions = [around[loop.vert] for loop in face.loops]
        seam = max(fractions) - min(fractions) > .5
        for loop, v in zip(face.loops, fractions):
            loop[layer].uv = AtlasUv(GRIP, along[loop.vert], 1 if seam and v == 0 else v)
    return mesh


def BuildGrip(fit, guard):
    frame = fit["frame"]
    mesh = bmesh.new()
    count = 28
    section = [(math.sin(i * math.tau / count), math.cos(i * math.tau / count)) for i in range(count)]
    samples = fit["grip"]
    widths = [bottom - top for _, top, bottom in samples]
    guardBack = max(Plane(frame, *p)[0] for p in fit["parts"]["Guard"]["loops"][0])
    start = next(i for i, row in enumerate(samples) if row[0] > guardBack + 3)
    end = next(i for i in reversed(range(len(widths))) if widths[i] >= .90 * max(widths[-12:]))
    rows = SeatUpperGrip(mesh, fit, section, samples[start], guard)
    first, last = samples[start][0], samples[end][0]
    laps = [lap for lap in fit.get("clothLaps", ()) if first < lap[0] < last]
    raisedLaps = [(center, width, rise) for center, _, _, width, rise in laps if rise >= .06]
    coordinates = {u for u, _, _ in samples[start:end + 1]}
    # Sample the rounded shoulder and tucked edge of each prominent cloth lap.
    for center, width, _ in raisedLaps:
        coordinates.update((center - 1.15 * width, center + .62 * width))
    guides = [(first, 0, 0), *(lap[:3] for lap in laps), (last, 0, 0)]
    stations = [point[0] for point in guides]
    for u in sorted(coordinates):
        top, bottom = GripProfileAt(samples, u)
        center, radius = (top + bottom) / 2, max(.5, (bottom - top) / 2)
        startFade = min(1, (u - first) / 31)
        endFade = min(1, (last - u) / 27)
        seated = (.68 + .32 * startFade * startFade * (3 - 2 * startFade)) * (.76 + .24 * endFade * endFade * (3 - 2 * endFade))
        index = min(len(guides) - 1, bisect_right(stations, u))
        a, b = guides[index - 1:index + 1]
        blend = (u - a[0]) / (b[0] - a[0])
        slope = a[1] + blend * (b[1] - a[1])
        bow = a[2] + blend * (b[2] - a[2])
        lift = 0
        for lap, width, rise in raisedLaps:
            distance = (u - lap) / width
            shoulder = math.exp(-((distance + 1.15) / 1.25) ** 2)
            tuck = math.exp(-((distance - .62) / .86) ** 2)
            lift += rise * (shoulder - .56 * tuck)
        row = []
        for side, depth in section:
            v = center + radius * side - frame["center"]
            bend = u + slope * v + bow * v * v
            low, high = GripProfileAt(samples, bend)
            aligned = (low + high) / 2 + (high - low) * side / 2
            thickness = radius * .34 * seated * (1 + lift * (.89 + .11 * side))
            row.append(mesh.verts.new(World(frame, bend, aligned, thickness * depth)))
        rows.append(row)
    rows.extend(reversed(TuckRows(mesh, frame, section, samples[end:][::-1], 1)))
    for a, b in zip(rows, rows[1:]):
        for i in range(count):
            j = (i + 1) % count
            mesh.faces.new((a[i], a[j], b[j], b[i])).smooth = True
    mesh.faces.new(rows[0])
    mesh.faces.new(list(reversed(rows[-1])))
    return GripUv(mesh, fit, rows, count)


def ReadFit():
    return json.loads(FIT_FILE.read_text(encoding="utf-8"))


def BuildParts(fit=None):
    if fit is None:
        fit = ReadFit()
    guard = BuildPlate(fit, "Guard")
    return [("Blade", BuildPlate(fit, "Blade")), ("Guard", guard),
            ("Grip", BuildGrip(fit, guard)), ("Pommel", BuildPlate(fit, "Pommel"))]


def BuildDadao(fit=None):
    root = Node("root")
    body = root.Child("body")
    parts = BuildParts(fit)
    triangles = sum(len(face.verts) - 2 for _, mesh in parts for face in mesh.faces)
    if triangles > TRIANGLE_LIMIT:
        raise ValueError(f"Dadao artwork exceeds its triangle budget: {triangles} > {TRIANGLE_LIMIT}")
    BuildDadao.sourceTriangles = triangles
    BuildDadao.targetTriangles = triangles
    for _, mesh in parts:
        body.Add("dadao", mesh, tile="sourceUv")
    body.Child("muzzle", t=(0, -0.012074, -0.626))
    body.Child("gripR", t=(0, 0, .030))
    body.Child("gripL", t=(0, 0, .155))
    return root


BuildDadao.budget = TRIANGLE_LIMIT
