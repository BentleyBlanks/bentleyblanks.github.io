"""Build the museum-profile exterior and fit it to the existing game rig."""

import json
import math
from pathlib import Path

import bmesh
from mathutils import Vector

from TzmCore import Node


FIT = json.loads(Path(__file__).with_name("Data_SichuanDadaoMuseumFit.json").read_text(encoding="utf-8"))
FRAME = FIT["frame"]
ATLAS = FIT["atlas"]


def FromPhoto(u, v, depth):
    u -= FRAME["axisU"]
    v -= FRAME["axisV"]
    scale = FRAME["metersPerPixel"]
    y = u * FRAME["sin"] + v * FRAME["cos"]
    z = u * FRAME["cos"] - v * FRAME["sin"]
    return ((depth - FRAME["axisDepth"]) * scale,
            y * scale, FRAME["zMin"] + (z - FRAME["zPixelMin"]) * scale)


def ToPhoto(position):
    x, y, z = position
    scale = FRAME["metersPerPixel"]
    y = y / scale
    z = (z - FRAME["zMin"]) / scale + FRAME["zPixelMin"]
    u = FRAME["axisU"] + z * FRAME["cos"] + y * FRAME["sin"]
    v = FRAME["axisV"] + y * FRAME["cos"] - z * FRAME["sin"]
    return u, v, FRAME["axisDepth"] + x / scale


def ProjectUv(position, strip):
    u, v, depth = ToPhoto(position)
    along = (u - ATLAS["left"]) / (ATLAS["right"] - ATLAS["left"])
    if strip < 2:
        across = (v - ATLAS["top"]) / (ATLAS["bottom"] - ATLAS["top"])
    else:
        across = (depth - ATLAS["sideTop"]) / (ATLAS["sideBottom"] - ATLAS["sideTop"])
    return ((16 + 992 * along) / 1024, 1 - (strip * 256 + 20 + 216 * across) / 1024)


def CompletePart(mesh):
    bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
    mesh.normal_update()
    uvLayer = mesh.loops.layers.uv.new()
    for face in mesh.faces:
        normal = face.normal
        if abs(normal.x) >= .48:
            strip = 0 if normal.x > 0 else 1
        else:
            across = normal.y * FRAME["cos"] - normal.z * FRAME["sin"]
            strip = 2 if across < 0 else 3
        for loop in face.loops:
            loop[uvLayer].uv = ProjectUv(loop.vert.co, strip)
    return mesh


def LoftFaces(mesh, rows, caps=True, flatBands=()):
    for before, after in zip(rows, rows[1:]):
        for index in range(len(before)):
            nextIndex = (index + 1) % len(before)
            face = mesh.faces.new((before[index], after[index], after[nextIndex], before[nextIndex]))
            face.smooth = index not in flatBands
    if caps:
        mesh.faces.new(rows[0]).smooth = False
        mesh.faces.new(rows[-1]).smooth = False
    return mesh


def BuildBlade():
    mesh = bmesh.new()
    # Soft visual bevels keep the photographed rim readable at shallow angles.
    cheek = ((0, .58), (.026, .92), (.10, 1), (.48, .96),
             (.79, .92), (.89, .70), (.97, .40), (1, .30))
    profile = cheek + tuple((across, -depth) for across, depth in reversed(cheek))
    rows = []
    for u, top, bottom, near, far in FIT["blade"]:
        center, radius = (near + far) / 2, (far - near) / 2
        rows.append([mesh.verts.new(FromPhoto(u, top + (bottom - top) * across,
                                             center + radius * depth))
                     for across, depth in profile])
    return CompletePart(LoftFaces(mesh, rows, flatBands=(len(cheek) - 1, len(profile) - 1)))


def BuildGrip():
    mesh = bmesh.new()
    section = []
    for angle in (i * math.tau / 24 for i in range(24)):
        v, x = math.sin(angle), math.cos(angle)
        section.append((math.copysign(abs(v) ** .46, v), math.copysign(abs(x) ** .46, x)))
    rows = []
    for u, top, bottom, near, far in FIT["grip"]:
        centerV, radiusV = (top + bottom) / 2, (bottom - top) / 2
        centerX, radiusX = (near + far) / 2, (far - near) / 2
        rows.append([mesh.verts.new(FromPhoto(u, centerV + radiusV * v, centerX + radiusX * x))
                     for v, x in section])
    return CompletePart(LoftFaces(mesh, rows))


def InsetGuard(outline):
    points = [Vector(point) for point in outline]
    pairs = list(zip(points, points[1:] + points[:1]))
    winding = math.copysign(1, sum(a.x * b.y - a.y * b.x for a, b in pairs))
    normals = [Vector((a.y - b.y, b.x - a.x)).normalized() * winding for a, b in pairs]
    # Inset each edge along the perimeter so the caps stay clear of the notches.
    return [
        point + 1.25 * (left + right) / max(.48, 1 + left.dot(right))
        for point, left, right in zip(points, normals[-1:] + normals[:-1], normals)
    ]


def BuildGuard():
    mesh = bmesh.new()
    outline = FIT["guard"]
    cap = InsetGuard(outline)
    rows = [[mesh.verts.new((depth, v, u)) for u, v in perimeter]
            for depth, perimeter in ((0, cap), (.17, outline), (.83, outline), (1, cap))]
    LoftFaces(mesh, rows)
    # The concave caps need their planar normals before tessellation.
    mesh.normal_update()
    bmesh.ops.triangulate(mesh, faces=list(mesh.faces))
    depthControls = FIT["guardDepth"]
    shoulderEnd = depthControls[0][0] + .22 * (depthControls[-1][0] - depthControls[0][0])
    for u, _, _ in depthControls[1:-1]:
        bmesh.ops.bisect_plane(mesh, geom=[*mesh.verts, *mesh.edges, *mesh.faces],
                              dist=1e-5, plane_co=(0, 0, u), plane_no=(0, 0, 1))
    for vert in mesh.verts:
        thickness, v, u = vert.co
        # A thickness transition belongs at the photographed longitudinal station.
        for (start, near0, far0), (end, near1, far1) in zip(depthControls, depthControls[1:]):
            if u <= end:
                along = min(1, max(0, (u - start) / (end - start)))
                near = near0 + (near1 - near0) * along
                far = far0 + (far1 - far0) * along
                # Hide the cap under the cheek while the guard and blade overlap.
                shoulder = min(1, max(0, (u - shoulderEnd) / 12))
                thickness = .5 + (thickness - .5) * (.76 + .24 * shoulder)
                vert.co = FromPhoto(u, v, near + (far - near) * thickness)
                break
    return CompletePart(mesh)


def BuildRing():
    mesh = bmesh.new()
    section = [(math.sin(i * math.tau / 12), .5 + .5 * math.cos(i * math.tau / 12))
               for i in range(12)]
    rows = []
    for outerU, outerV, innerU, innerV, near, far in FIT["ring"]:
        center, radius = (near + far) / 2, (far - near) / 2
        rows.append([mesh.verts.new(FromPhoto(innerU + (outerU - innerU) * outside,
                                             innerV + (outerV - innerV) * outside,
                                             center + radius * depth))
                     for depth, outside in section])
    return CompletePart(LoftFaces(mesh, rows + rows[:1], caps=False))


def BuildParts():
    return [("Blade", BuildBlade()), ("Guard", BuildGuard()),
            ("RivetedHilt", BuildGrip()), ("PommelRing", BuildRing())]


def BuildDadao():
    root = Node("root")
    body = root.Child("body")
    parts = BuildParts()
    sourceTriangles = sum(len(face.verts) - 2 for _, mesh in parts for face in mesh.faces)
    BuildDadao.sourceTriangles = sourceTriangles
    BuildDadao.targetTriangles = sourceTriangles
    for _, mesh in parts:
        body.Add("dadao", mesh, tile="sourceUv")
    body.Child("muzzle", t=(0, -0.012074, -0.626))
    body.Child("gripR", t=(0, 0, .030))
    body.Child("gripL", t=(0, 0, .155))
    return root


BuildDadao.budget = 10_000
