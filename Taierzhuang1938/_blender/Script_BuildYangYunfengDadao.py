"""Build a textured game prop from the visible Yang Yunfeng photo contours."""

from collections import Counter
import json
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

from TzmCore import AUTHORED_NORMAL_LAYER, Node


FIT_FILE = Path(__file__).with_name("Data_YangYunfengDadaoFit.json")
TRIANGLE_LIMIT = 10_812


def Plane(frame, x, y):
    return x * frame["cos"] + y * frame["sin"], -x * frame["sin"] + y * frame["cos"]


def World(frame, u, v, depth=0):
    scale = frame["scale"]
    return depth * scale, (v - frame["center"]) * scale, frame["zMin"] + (u - frame["left"]) * scale


def FromPhoto(frame, x, y, depth=0):
    u, v = Plane(frame, x, y)
    return World(frame, u, v, depth)


def StudioUv(fit, position, strip):
    frame, atlas = fit["frame"], fit["atlas"]
    x, y, z = position
    scale = frame["scale"]
    u = (z - frame["zMin"]) / scale + frame["left"]
    v = y / scale + frame["center"]
    across = (v - atlas["top"]) / (atlas["bottom"] - atlas["top"]) if strip <= 1 else .5 + x / (144 * scale)
    along = (u - atlas["left"]) / (atlas["right"] - atlas["left"])
    return ((16 + 992 * along) / 1024, 1 - (strip * 256 + 20 + 216 * across) / 1024)


def ApplyUv(mesh, fit, sideThreshold=.035):
    bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
    mesh.normal_update()
    layer = mesh.loops.layers.uv.new()
    for face in mesh.faces:
        nx, ny, _ = face.normal
        strip = (0 if nx > 0 else 1) if abs(nx) >= sideThreshold else (2 if ny < 0 else 3)
        for loop in face.loops:
            loop[layer].uv = StudioUv(fit, loop.vert.co, strip)
    return mesh


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
    # Record Blender's split corner normals for the TZM exporter, including the
    # transition between the broad faces and the side wall.
    mesh.faces.index_update()
    mesh.verts.index_update()
    proxy = bpy.data.meshes.new("Dadao Rim Normals")
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
    rim = set(wall)
    edges = [edge for edge in mesh.edges if edge.is_manifold
             and sum(face in rim for face in edge.link_faces) == 1]
    bmesh.ops.bevel(mesh, geom=edges, offset=1.10 * scale, segments=segments,
                    profile=.5, clamp_overlap=True, affect="EDGES")
    for face in mesh.faces:
        face.smooth = True


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
        ApplyUv(mesh, fit)
        SmoothBladeWall(mesh, wall)
    else:
        bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
        RoundFitting(mesh, wall, frame["scale"], 2 if name == "Guard" else 1)
        ApplyUv(mesh, fit)
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


def BuildGrip(fit):
    frame = fit["frame"]
    mesh = bmesh.new()
    count = 30
    section = [(math.sin(i * math.tau / count), math.cos(i * math.tau / count)) for i in range(count)]
    samples = fit["grip"]
    widths = [bottom - top for _, top, bottom in samples]
    start = next(i for i, width in enumerate(widths) if width >= .90 * max(widths[:8]))
    end = next(i for i in reversed(range(len(widths))) if widths[i] >= .90 * max(widths[-12:]))
    rows = TuckRows(mesh, frame, section, samples[:start + 1], -1)
    for u, top, bottom in samples[start:end + 1]:
        center, radius = (top + bottom) / 2, max(.5, (bottom - top) / 2)
        nearby = min(1, (u - samples[start][0]) / 24, (samples[end][0] - u) / 27)
        seated = .76 + .24 * nearby * nearby * (3 - 2 * nearby)
        rows.append([mesh.verts.new(World(frame, u, center + radius * v, radius * .34 * seated * depth)) for v, depth in section])
    rows.extend(reversed(TuckRows(mesh, frame, section, samples[end:][::-1], 1)))
    for a, b in zip(rows, rows[1:]):
        for i in range(count):
            j = (i + 1) % count
            mesh.faces.new((a[i], a[j], b[j], b[i])).smooth = True
    mesh.faces.new(rows[0])
    mesh.faces.new(list(reversed(rows[-1])))
    return ApplyUv(mesh, fit, sideThreshold=.42)


def ReadFit():
    return json.loads(FIT_FILE.read_text(encoding="utf-8"))


def BuildParts(fit=None):
    if fit is None:
        fit = ReadFit()
    return [("Blade", BuildPlate(fit, "Blade")), ("Guard", BuildPlate(fit, "Guard")),
            ("Grip", BuildGrip(fit)), ("Pommel", BuildPlate(fit, "Pommel"))]


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
