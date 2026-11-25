"""Exterior game mesh traced from the upper sabre in Jianchuan's group photo.

The side outline uses image samples. Depth and wear are game-art estimates.
Reference and texture provenance: _import/Reference/SichuanDadao/.
"""

import math

import bmesh

from TzmCore import Node


# Pixel samples from the published 359 × 270 photo. The first/last horizontal
# coordinates map to the existing 0.90 m in-game span. +Y is the cutting side.
BLADE_OUTLINE = (
    (26, 89.2, 91.7), (28, 87.7, 92.9), (32, 84.3, 94.2),
    (40, 76.9, 97.1), (47, 70.8, 98.8), (51, 68.4, 99.5),
    (55, 69.3, 100.0), (62, 71.0, 100.8), (74, 72.8, 101.5),
    (88, 74.1, 102.1), (101, 74.9, 102.3), (120, 75.8, 101.8),
    (140, 76.5, 100.5), (160, 76.7, 99.3), (180, 76.4, 97.1),
    (195, 76.3, 96.1), (205, 76.2, 95.1), (216, 75.7, 94.5),
    (222.5, 79.0, 89.0),
)
GRIP_OUTLINE = (
    (221, 84.5, 6.7), (228, 84.0, 7.5), (239, 83.0, 6.6),
    (250, 82.8, 6.6), (260, 82.6, 8.0), (274, 81.7, 6.5),
    (289, 81.4, 6.35), (300, 81.3, 6.85), (306, 81.75, 5.95),
)
GUARD_OUTLINE = (
    (210.8, 69.8), (212.4, 67.9), (215.2, 68.4), (218.7, 70.9),
    (221.1, 73.4), (223.7, 77.0), (224.8, 83.0), (224.5, 91.8),
    (222.9, 98.5), (221.4, 100.5), (218.4, 101.0), (216.2, 99.5),
    (216.0, 96.4), (217.1, 91.3), (216.7, 82.8), (215.5, 74.4),
    (213.6, 72.5), (211.1, 72.1),
)


def FromPhoto(photoX, photoY, depth):
    axisY = 82.25 - 0.052 * (photoX - 260)
    return (depth, (photoY - axisY) * 0.003, (photoX - 26) * 0.003 - 0.630)


def AtlasUv(u, v, strip):
    # Four padded strips in Texture_Dadao. Coordinates in the bake start at
    # the top of the image, whereas the game UV starts at the bottom.
    return ((16 + 992 * u) / 1024, 1 - (strip * 256 + 20 + 216 * v) / 1024)


def AddFace(mesh, uvLayer, corners, uvs, smooth=True):
    face = mesh.faces.new(corners)
    face.smooth = smooth
    uvByVertex = dict(zip(corners, uvs))
    for loop in face.loops:
        loop[uvLayer].uv = uvByVertex[loop.vert]


def OrientMesh(mesh):
    bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
    mesh.normal_update()
    return mesh


def BuildBlade():
    mesh = bmesh.new()
    uvLayer = mesh.loops.layers.uv.new()
    bands = ((0, .0022), (.045, .0031), (.15, .0035), (.59, .00335),
             (.80, .0030), (.87, .00245), (.96, .00135), (1, .00085))
    rowsBySide = []
    start, end = BLADE_OUTLINE[0][0], BLADE_OUTLINE[-1][0]

    for side, sign in enumerate((1, -1)):
        rows = []
        for photoX, spine, edge in BLADE_OUTLINE:
            depthScale = min(1, .34 + (photoX - start) / 48)
            row = [
                mesh.verts.new(FromPhoto(photoX, spine + (edge - spine) * across,
                                         sign * depth * depthScale))
                for across, depth in bands
            ]
            rows.append(row)
        for index, (near, far) in enumerate(zip(rows, rows[1:])):
            u0 = (BLADE_OUTLINE[index][0] - start) / (end - start)
            u1 = (BLADE_OUTLINE[index + 1][0] - start) / (end - start)
            for col in range(len(bands) - 1):
                v0, v1 = bands[col][0], bands[col + 1][0]
                AddFace(mesh, uvLayer, (near[col], far[col], far[col + 1], near[col + 1]),
                        [AtlasUv(u, v, side) for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))])
        rowsBySide.append(rows)

    front, back = rowsBySide
    for col, v in ((0, 0.0), (-1, 1.0)):
        for index in range(len(front) - 1):
            u0 = (BLADE_OUTLINE[index][0] - start) / (end - start)
            u1 = (BLADE_OUTLINE[index + 1][0] - start) / (end - start)
            rim = v + (0.008 if v == 0 else -0.008)
            AddFace(mesh, uvLayer, (front[index][col], front[index + 1][col],
                                   back[index + 1][col], back[index][col]),
                    [AtlasUv(u, across, 0) for u, across in ((u0, v), (u1, v), (u1, rim), (u0, rim))],
                    smooth=False)
    for row, u in ((0, 0.0), (-1, 1.0)):
        cap = u + (.008 if u == 0 else -.008)
        for col in range(len(bands) - 1):
            v0, v1 = bands[col][0], bands[col + 1][0]
            AddFace(mesh, uvLayer, (front[row][col], front[row][col + 1],
                                   back[row][col + 1], back[row][col]),
                    [AtlasUv(s, v, 0) for s, v in ((u, v0), (u, v1), (cap, v1), (cap, v0))],
                    smooth=False)
    return OrientMesh(mesh)


def BuildGripTube(outline, strip, sections, wrapped):
    mesh = bmesh.new()
    uvLayer = mesh.loops.layers.uv.new()
    segments = 24
    start, end = outline[0][0], outline[-1][0]
    photoRows = []
    for near, far in zip(outline, outline[1:]):
        steps = max(1, math.ceil((far[0] - near[0]) / sections))
        photoRows.extend(tuple(a + (b - a) * step / steps for a, b in zip(near, far))
                         for step in range(steps))
    photoRows.append(outline[-1])
    rings = []
    for photoX, center, radius in photoRows:
        ring = []
        for index in range(segments):
            angle = math.tau * index / segments
            scale = 1.0
            if wrapped:
                lap = (photoX - start) / 6.4 - angle / math.tau + .05 * math.sin(2.2 * angle)
                scale += .055 * (.5 + .5 * math.cos(lap * math.tau)) ** 5
                scale += .018 * math.sin(3 * angle + photoX / 11)
            depth = math.cos(angle) * scale * (.0053 + .0008 * radius)
            photoY = center + math.sin(angle) * radius * scale
            ring.append(mesh.verts.new(FromPhoto(photoX, photoY, depth)))
        rings.append(ring)

    for index, (near, far) in enumerate(zip(rings, rings[1:])):
        u0 = (photoRows[index][0] - start) / (end - start)
        u1 = (photoRows[index + 1][0] - start) / (end - start)
        for col in range(segments):
            nxt = (col + 1) % segments
            v0, v1 = col / segments, (col + 1) / segments
            AddFace(mesh, uvLayer, (near[col], far[col], far[nxt], near[nxt]),
                    [AtlasUv(u, v, strip) for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))])
    for ring in (rings[0], rings[-1]):
        AddFace(mesh, uvLayer, ring,
                [AtlasUv(.5 + .03 * math.cos(math.tau * i / segments),
                         .5 + .03 * math.sin(math.tau * i / segments), strip)
                 for i in range(segments)], smooth=False)
    return OrientMesh(mesh)


def BuildGuard():
    mesh = bmesh.new()
    uvLayer = mesh.loops.layers.uv.new()
    rings = []
    for depth, inset in ((-.011, .82), (-.008, 1), (.008, 1), (.011, .82)):
        rings.append([mesh.verts.new(FromPhoto(218 + (x - 218) * inset,
                                              84 + (y - 84) * inset, depth))
                      for x, y in GUARD_OUTLINE])
    for index, (near, far) in enumerate(zip(rings, rings[1:])):
        for col in range(len(GUARD_OUTLINE)):
            nxt = (col + 1) % len(GUARD_OUTLINE)
            u0, u1 = col / len(GUARD_OUTLINE), (col + 1) / len(GUARD_OUTLINE)
            v0, v1 = .2 + index * .1, .3 + index * .1
            AddFace(mesh, uvLayer, (near[col], far[col], far[nxt], near[nxt]),
                    [AtlasUv(u, v, 3) for u, v in ((u0, v0), (u0, v1), (u1, v1), (u1, v0))])
    for ring in (rings[0], rings[-1]):
        AddFace(mesh, uvLayer, ring,
                [AtlasUv((x - 210) / 16, (y - 67) / 35, 3) for x, y in GUARD_OUTLINE], smooth=False)
    return OrientMesh(mesh)


def BuildPommelRing():
    mesh = bmesh.new()
    uvLayer = mesh.loops.layers.uv.new()
    around, tube = 52, 12
    rings = []
    for index in range(around):
        angle = math.tau * index / around
        ring = []
        for col in range(tube):
            cross = math.tau * col / tube
            rim = 1.47 + .09 * math.sin(3 * angle)
            x = 314.85 + (9.68 + rim * math.cos(cross)) * math.cos(angle)
            y = 83.55 + (10.35 + rim * math.cos(cross)) * math.sin(angle)
            ring.append(mesh.verts.new(FromPhoto(x, y, .0032 * math.sin(cross))))
        rings.append(ring)
    for index, near in enumerate(rings):
        far = rings[(index + 1) % around]
        u0, u1 = index / around, (index + 1) / around
        for col in range(tube):
            nxt = (col + 1) % tube
            v0, v1 = col / tube, (col + 1) / tube
            AddFace(mesh, uvLayer, (near[col], far[col], far[nxt], near[nxt]),
                    [AtlasUv(u, v, 3) for u, v in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))])
    return OrientMesh(mesh)


def BuildParts():
    return [
        ("Blade", BuildBlade()),
        ("Guard", BuildGuard()),
        ("CottonWrap", BuildGripTube(GRIP_OUTLINE, 2, 1.45, wrapped=True)),
        ("PommelCollar", BuildGripTube(((302.5, 82, 5.0), (305.2, 82.4, 6.2),
                                      (308.4, 82.8, 4.2)), 3, 1.6, wrapped=False)),
        ("PommelRing", BuildPommelRing()),
    ]


def BuildDadao():
    root = Node("root")
    body = root.Child("body")
    for _, mesh in BuildParts():
        body.Add("dadao", mesh, tile="sourceUv")
    body.Child("muzzle", t=(0, -0.012074, -0.626))
    body.Child("gripR", t=(0, 0, 0.030))
    body.Child("gripL", t=(0, 0, 0.155))
    return root


BuildDadao.budget = 10_000
