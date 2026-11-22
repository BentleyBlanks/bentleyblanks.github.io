"""Rebuild the nine scene meshes and the material pack with Blender 4.5+.

Run with Script_BlenderMcp.mjs start --batch (see the scene README).
The live Blender MCP review uses the same entry point via runpy.
"""

import argparse
import math
import random
import sys
from math import atan2, cos, pi, sin
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


PROJECT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT / "Model" / "DugoutAidOpenFields" / "Model_DugoutAidOpenFields.glb"
MATERIAL_BAKE = PROJECT.parent / "tmp" / "DugoutAidOpenFields" / "MaterialBake"
TAU = 2 * pi


def Clamp(x, lo, hi):
    return min(hi, max(lo, x))


def BindImage(material, image, label):
    node = material.node_tree.nodes.new("ShaderNodeTexImage")
    node.label = label
    node.image = image
    return node


def SetNormal(material, image, strength):
    tree = material.node_tree
    tile = BindImage(material, image, "Tangent-space normal")
    node = tree.nodes.new("ShaderNodeNormalMap")
    node.inputs["Strength"].default_value = strength
    tree.links.new(tile.outputs["Color"], node.inputs["Color"])
    tree.links.new(node.outputs["Normal"], tree.nodes["Principled BSDF"].inputs["Normal"])


def SetBakedMaterial(material, name, normalStrength):
    tree = material.node_tree
    shader = tree.nodes["Principled BSDF"]

    def Read(channel, ext, colorspace):
        path = MATERIAL_BAKE / f"Texture_Dugout{name}{channel}.{ext}"
        if not path.is_file():
            raise FileNotFoundError(f"{path.name} is missing. Run Script_BakeDugoutMaterials.py first.")
        image = bpy.data.images.load(str(path), check_existing=True)
        image.colorspace_settings.name = colorspace
        return image

    base = BindImage(material, Read("Base", "jpg", "sRGB"), "Base color")
    tree.links.new(base.outputs["Color"], shader.inputs["Base Color"])
    SetNormal(material, Read("Normal", "png", "Non-Color"), normalStrength)
    atlas = BindImage(material, Read("Orm", "png", "Non-Color"), "Occlusion / roughness / metallic")
    channels = tree.nodes.new("ShaderNodeSeparateColor")
    tree.links.new(atlas.outputs["Color"], channels.inputs["Color"])
    tree.links.new(channels.outputs["Green"], shader.inputs["Roughness"])
    tree.links.new(channels.outputs["Blue"], shader.inputs["Metallic"])
    # The Blender glTF exporter reads per-material AO from this named socket.
    group = bpy.data.node_groups.get("glTF Material Output")
    if group is None:
        group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    gltf = tree.nodes.new("ShaderNodeGroup")
    gltf.node_tree = group
    tree.links.new(channels.outputs["Red"], gltf.inputs["Occlusion"])


def Mat(name, color, roughness, texture=None, tone=None, normalStrength=0.7, *, baked=None):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = roughness
    srgb = tuple(c / 255 for c in color)
    linear = tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)
    material.diffuse_color = (*linear, 1)
    shader.inputs["Base Color"].default_value = material.diffuse_color
    if baked:
        SetBakedMaterial(material, baked, normalStrength)
    if texture:
        for suffix, colorspace in (("Base", "sRGB"), ("Normal", "Non-Color")):
            label = f"Texture_{texture}{suffix}"
            source = bpy.data.images.get(label)
            if source is None:
                source = bpy.data.images.load(str(PROJECT / "Texture" / f"{label}.webp"))
                source.name = label
                source.colorspace_settings.name = colorspace
            image = source
            if suffix == "Base" and tone:
                image = bpy.data.images.new(f"Texture_{name}Base", *source.size)
                pixels = np.empty(source.size[0] * source.size[1] * 4, dtype=np.float32)
                source.pixels.foreach_get(pixels)
                rgb = pixels.reshape(-1, 4)[:, :3]
                rgb *= np.array(tone, dtype=np.float32)
                np.clip(rgb, 0, 1, out=rgb)
                image.pixels.foreach_set(pixels)
                image.update()
                # The tinted legacy variants are on the distant field plots or mortar.
                if image.size[0] > 512:
                    image.scale(512, 512)
                image.pack()
            if suffix == "Normal":
                SetNormal(material, image, normalStrength)
            else:
                tile = BindImage(material, image, "Base color")
                material.node_tree.links.new(tile.outputs["Color"], shader.inputs["Base Color"])
    return material


def TimberEndGrain():
    size = 512
    rng = np.random.default_rng(516)
    v, u = np.mgrid[0:size, 0:size].astype(np.float32) / size - 0.5
    theta = np.arctan2(v + 0.025, u - 0.037)
    radius = np.hypot((u - 0.037) * 1.08, (v + 0.025) * 0.91)
    warped = radius + radius * (0.05 * np.sin(3 * theta + radius * 5) + 0.024 * np.cos(6 * theta - radius * 3))
    growth = warped * 49 + 0.41 * np.sin(warped * 32) + 0.16 * np.sin(warped * 102)
    rings = np.cos(growth * TAU) * 0.5 + 0.5
    checked = (np.maximum(0, np.cos(9 * theta + 2.7 * radius)) ** 120) * np.clip((radius - 0.10) * 4, 0, 1)
    dust = 0.047 * np.sin(u * 43 + v * 14) * np.cos(v * 29) + rng.normal(0, 0.012, (size, size))
    tone = 0.85 + 0.16 * rings - 0.33 * checked + dust
    image = bpy.data.images.new("Texture_DugoutTimberEndBase", size, size, alpha=False)
    pixels = np.ones((size, size, 4), dtype=np.float32)
    pixels[:, :, :3] = np.clip(tone[:, :, None] * np.array((0.44, 0.364, 0.276), dtype=np.float32), 0, 1)
    image.pixels.foreach_set(pixels.ravel())
    image.update()
    image.pack()
    material = Mat("WeatheredEndGrain", (112, 92, 70), 0.96)
    node = BindImage(material, image, "Weathered growth rings")
    material.node_tree.links.new(node.outputs["Color"], material.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
    return material


class MeshDraft:
    """Accumulate faces with per-corner UVs. Meshes are emitted once per material."""

    def __init__(self):
        self.vertices = []
        self.faces = []
        self.uvs = []
        self.smooth = []

    def Add(self, vertices):
        start = len(self.vertices)
        self.vertices.extend(vertices)
        return start

    def Face(self, indices, uv=None, smooth=True):
        self.faces.append(tuple(indices))
        self.uvs.append(uv)
        self.smooth.append(smooth)

    def Finish(self, name, material, root, collection):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        uvLayer = mesh.uv_layers.new(name="UVMap")
        for face, custom, smooth in zip(mesh.polygons, self.uvs, self.smooth):
            face.use_smooth = smooth
            axis = max(range(3), key=lambda i: abs(face.normal[i]))
            uAxis, vAxis = ((1, 2), (0, 2), (0, 1))[axis]
            for corner, loop in enumerate(face.loop_indices):
                p = self.vertices[mesh.loops[loop].vertex_index]
                uvLayer.data[loop].uv = custom[corner] if custom else (p[uAxis], p[vAxis])
        mesh.materials.append(material)
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        obj.parent = root
        return sum(len(face) - 2 for face in self.faces)


class Asset:
    def __init__(self, name, materials, position):
        self.materials = materials
        self.drafts = {}
        self.collection = bpy.data.collections.new(name + "Geometry")
        bpy.context.scene.collection.children.link(self.collection)
        self.root = bpy.data.objects.new(name, None)
        self.collection.objects.link(self.root)
        self.root.location = position

    def Mesh(self, material):
        if material not in self.drafts:
            self.drafts[material] = MeshDraft()
        return self.drafts[material]

    def Finish(self):
        faces = 0
        for name, draft in self.drafts.items():
            faces += draft.Finish(f"{self.root.name}_{name}", self.materials[name], self.root, self.collection)
        print(f"{self.root.name}: {faces} triangles")


def Tube(mesh, points, radii, sides, *, uvMeters=0.9, around=1, twist=0, deform=None, caps=True,
         uvOffset=(0, 0), endGrain=None):
    path = [Vector(p) for p in points]
    axis = (path[-1] - path[0]).normalized()
    fallback = Vector((1, 0, 0)) if abs(axis.x) < 0.8 else Vector((0, 0, 1))
    side = fallback.cross(axis).normalized()
    rings = []
    advance = [uvOffset[1]]
    for row, (p, radius) in enumerate(zip(path, radii)):
        tangent = (path[min(row + 1, len(path) - 1)] - path[max(0, row - 1)]).normalized()
        radial = (side - tangent * side.dot(tangent)).normalized()
        # Curved loops can run parallel to the initial side. Keep an orthogonal frame.
        if radial.length_squared < 0.1:
            radial = fallback.cross(tangent).normalized()
        second = tangent.cross(radial)
        if row:
            advance.append(advance[-1] + (p - path[row - 1]).length / uvMeters)
        ring = []
        for i in range(sides):
            angle = TAU * i / sides + twist * row
            multiplier, along = deform(row, i, angle) if deform else (1, 0)
            ring.append(p + (radial * cos(angle) + second * sin(angle)) * radius * multiplier + tangent * along)
        rings.append(mesh.Add(ring))
    for row, (a, b) in enumerate(zip(rings, rings[1:])):
        for i in range(sides):
            j = (i + 1) % sides
            u, v = i / sides * around + uvOffset[0], (i + 1) / sides * around + uvOffset[0]
            mesh.Face((a + i, a + j, b + j, b + i), ((u, advance[row]), (v, advance[row]),
                      (v, advance[row + 1]), (u, advance[row + 1])))
    if caps:
        for row, clockwise in ((0, True), (len(rings) - 1, False)):
            order = list(reversed(range(sides))) if clockwise else list(range(sides))
            vertices = [rings[row] + i for i in order]
            if endGrain is None:
                mesh.Face(vertices, smooth=False)
                continue
            points = [mesh.vertices[index] for index in vertices]
            start = endGrain.Add(points)
            twistAngle = uvOffset[0] * TAU + pi * 0.3 * clockwise
            uv = [(0.5 + 0.40 * cos(TAU * i / sides + twistAngle),
                   0.5 + 0.40 * sin(TAU * i / sides + twistAngle)) for i in order]
            endGrain.Face(range(start, start + sides), uv, smooth=False)


def Log(mesh, start, end, radius, seed, fracture=0.06, rings=9, sides=12, endGrain=None):
    rng = random.Random(seed)
    a, b = Vector(start), Vector(end)
    path = [a.lerp(b, i / rings) + Vector((rng.uniform(-0.017, 0.017),
            rng.uniform(-0.018, 0.018), rng.uniform(-0.014, 0.014))) for i in range(rings + 1)]
    ridges = [rng.uniform(0.78, 1.17) for _ in range(sides)]
    tip = [rng.uniform(-fracture, fracture) for _ in range(sides)]

    def Deform(row, i, angle):
        return ridges[i] * (1 + 0.09 * sin(row * 0.9 + i)), tip[i] if row == rings else 0

    radii = [radius * (1.05 - 0.2 * (i / rings) + 0.05 * sin(i * 0.95)) for i in range(rings + 1)]
    Tube(mesh, path, radii, sides, uvMeters=1.22, around=max(1, round(TAU * radius / 0.67)), deform=Deform,
         uvOffset=(rng.random(), rng.random()), endGrain=endGrain)


def Grid(mesh, nu, nv, Point, *, flip=False, UV=None, smooth=True):
    start = mesh.Add([Point(i / nu, j / nv) for j in range(nv + 1) for i in range(nu + 1)])
    for j in range(nv):
        for i in range(nu):
            a = start + j * (nu + 1) + i
            corners = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
            quad = (a, a + 1, a + nu + 2, a + nu + 1)
            uv = tuple(UV(u / nu, v / nv) for u, v in corners) if UV else None
            mesh.Face(quad[::-1] if flip else quad, uv[::-1] if flip and uv else uv, smooth)


def RoundedBlock(mesh, center, size, seed, divisions=4, bevel=0.18, chip=0, tile=0.7):
    """Make a distorted bevelled block with shared normals and separate UV seams."""
    rng = random.Random(seed)
    phase = rng.uniform(0, 32)
    half = Vector(size) / 2
    vertices = {}
    for axis in range(3):
        uAxis, vAxis = (axis + 1) % 3, (axis + 2) % 3
        for sign in (-1, 1):
            for v in range(divisions + 1):
                for u in range(divisions + 1):
                    key = [0, 0, 0]
                    key[axis] = divisions if sign > 0 else 0
                    key[uAxis], key[vAxis] = u, v
                    key = tuple(key)
                    if key not in vertices:
                        point = Vector([i * 2 / divisions - 1 for i in key])
                        core = Vector([Clamp(c, bevel - 1, 1 - bevel) for c in point])
                        normal = (point - core).normalized()
                        rough = 0.041 * sin(7 * point.x + 9 * point.y + phase) * cos(6 * point.z - 3 * point.y)
                        point = core + normal * (bevel + rough)
                        lostCorner = max(0, (point.x - point.y + point.z - 1.70) * 0.66) * chip
                        point -= Vector((lostCorner, -lostCorner * 0.22, lostCorner * 1.17))
                        vertices[key] = mesh.Add([tuple(center[i] + point[i] * half[i] for i in range(3))])
            for v in range(divisions):
                for u in range(divisions):
                    indices = []
                    for cu, cv in ((u, v), (u + 1, v), (u + 1, v + 1), (u, v + 1)):
                        key = [0, 0, 0]
                        key[axis] = divisions if sign > 0 else 0
                        key[uAxis], key[vAxis] = cu, cv
                        index = vertices[tuple(key)]
                        indices.append(index)
                    points = [Vector(mesh.vertices[index]) for index in indices]
                    uv = [(p[uAxis] / tile + phase, p[vAxis] / tile + phase * 0.41) for p in points]
                    mesh.Face(indices if sign > 0 else indices[::-1], uv if sign > 0 else uv[::-1])


def RootThread(mesh, p, length, rng, *, upward=False):
    x, y, z = p
    dx, dy = rng.uniform(-0.5, 0.5) * length, rng.uniform(-0.6, 0.22) * length
    direction = 1 if upward else -1
    points = [(x, y, z), (x + dx * 0.25, y + dy * 0.52, z + length * direction * 0.31),
              (x + dx * 0.65, y + dy, z + length * direction * 0.72),
              (x + dx, y + dy * 0.9, z + length * direction)]
    width = rng.uniform(0.0017, 0.0039)
    Tube(mesh, points, [width, width * 0.63, width * 0.4, 0.0006], 3, caps=False)


def SplitTimber(asset):
    mesh = asset.Mesh("Bark")
    heights = [0, 0.07, 0.25, 0.56, 0.88, 1.18, 1.45, 1.7, 1.98, 2.26, 2.4, 2.59]
    path = [(0.034 * sin(z * 1.05) - 0.009, 0.019 * cos(z * 4), z) for z in heights]
    notches = (-0.08, 0.05, 0.08, 0.03, -0.18, -0.22, -0.12, 0.09,
               0.02, -0.02, -0.12, -0.18, -0.23, -0.11, -0.04, 0.03)

    def Deform(row, i, angle):
        seam = 0.59 if i in (14, 15) else 1
        surface = seam * (1.02 + 0.09 * sin(i * 6.3 + row * 0.48) + 0.09 * cos(i * 2.3))
        return surface, notches[i] if row == len(path) - 1 else 0

    Tube(mesh, path, [0.114, 0.142, 0.139, 0.147, 0.128, 0.142, 0.133, 0.142, 0.124,
                      0.119, 0.122, 0.103], 16, uvMeters=1.20, deform=Deform,
         uvOffset=(0.15, 0.22), endGrain=asset.Mesh("EndGrain"))
    for x, y, z, dx, dy, rise in ((-0.076, -0.045, 2.27, -0.051, 0.01, 0.36),
                                  (0.097, -0.04, 2.23, 0.035, 0.003, 0.4),
                                  (0.036, -0.102, 2.42, 0.026, -0.006, 0.18)):
        Tube(asset.Mesh("SplitWood"), [(x, y, z), (x + dx * 0.48, y + dy * 0.56, z + rise * 0.62),
             (x + dx, y + dy, z + rise)], [0.029, 0.016, 0.001], 5)
    for i in range(7):
        z = 0.23 + i * 0.295
        x = 0.025 + 0.041 * sin(i * 2.1)
        Tube(asset.Mesh("SplitWood"), [(x, -0.107, z), (x + 0.008, -0.135, z + 0.13),
             (x - 0.005, -0.108, z + 0.37)], [0.003, 0.013, 0.001], 4, caps=False)
    # Hewn face shows in profile for the two split uprights at the right edge.
    cut = asset.Mesh("SplitWood")
    Grid(cut, 4, 10, lambda u, v: (0.143 + 0.014 * sin(v * 5) - 0.015 * abs(2*u-1),
         (u - 0.5) * 0.125 * sin(v*pi)**0.57 + 0.008 * sin(v*19),
         1.52 + v * 0.89 + (u - 0.5) * 0.09), UV=lambda u, v: (u*0.24, v*1.32))


def BrokenSodRoof(asset):
    rng = random.Random(311)
    front, rear = -1.95, 2.05
    endGrain = asset.Mesh("EndGrain")

    def Rise(x, y):
        return 0.33 + 0.052 * x - 0.062 * y

    for i, y in enumerate((front + 0.04, front + 0.14, -0.43, 0.91, rear - 0.04)):
        x0, x1 = -3.55 + rng.uniform(-0.1, 0.13), 3.4 + rng.uniform(-0.17, 0.12)
        level = -0.175 if i == 1 else 0
        Log(asset.Mesh("ShelterWood"), (x0, y, Rise(x0, y) + level),
            (x1, y + rng.uniform(-0.08, 0.08), Rise(x1, y) + level),
            (0.187, 0.151, 0.126, 0.13, 0.152)[i], 330 + i, 0.125, rings=19, endGrain=endGrain)
    for i in range(23):
        x = -3.43 + 0.306 * i
        y0, y1 = front - rng.uniform(0.05, 0.32), rear + rng.uniform(-0.06, 0.18)
        if 13 <= i <= 16:
            y0 += rng.uniform(0.55, 1.75)
        Log(asset.Mesh("Bark" if i % 4 == 0 else "ShelterWood"),
            (x, y0, Rise(x, y0) + 0.118), (x + rng.uniform(-0.16, 0.13), y1, Rise(x, y1) + 0.12),
            rng.uniform(0.068, 0.146), 411 + i, 0.072, rings=8, sides=9, endGrain=endGrain)
    for i in range(11):
        x = rng.uniform(0.73, 2.23)
        y = front + rng.uniform(0.12, 0.52)
        z = Rise(x, y) + rng.uniform(0.12, 0.18)
        Tube(asset.Mesh("SplitWood"), [(x, y, z), (x - 0.27, y - 0.2, z - 0.13),
             (x - rng.uniform(0.5, 1.07), y - rng.uniform(0.31, 0.72), z - rng.uniform(0.26, 0.51))],
             [rng.uniform(0.016, 0.057), rng.uniform(0.016, 0.04), 0.0007], 5, uvOffset=(i*0.165, i*0.12))
    brokenEnd = asset.Mesh("SplitWood")
    for i in range(3):
        offset = i * 0.095
        Tube(brokenEnd, [(1.88+offset,-1.92,0.67), (1.45+offset,-2.16,0.44),
             (0.68+offset,-2.49,0.14+0.047*i)], [0.10-0.023*i, 0.079-0.016*i, 0.0015], 6,
             uvOffset=(0.25+i*0.205, i*0.2))
    ridge = asset.Mesh("Bark")
    twigPaths = [
        [(-2.60,-1.43,0.80), (-2.10,-1.71,0.84), (-1.20,-1.91,0.98), (-0.28,-1.86,1.11)],
        [(-2.17,-1.69,0.84), (-2.00,-1.89,1.05), (-1.81,-2.01,1.15)],
        [(-1.24,-1.88,0.97), (-0.92,-2.10,1.00), (-0.82,-2.23,1.13)],
        [(0.34,-1.91,0.75), (0.91,-1.93,0.90), (1.44,-2.08,0.98)],
    ]
    for points in twigPaths:
        Tube(ridge, points, [0.038 * (1 - i / len(points)) for i in range(len(points))], 5)
    for i, (x0, x1, lo, hi) in enumerate(((-3.67, 0.6, front - 0.2, rear + 0.1),
                              (0.57, 3.58, -0.76, rear + 0.06),
                              (2.04, 3.59, front - 0.09, -0.69))):
        def Skin(u, v, underside=False):
            x = x0 + (x1 - x0) * u
            y = lo + (hi - lo) * v + (sin(x * 6.1) * 0.09 + sin(x * 19) * 0.024) * (0.3 + 0.7 * abs(2*v-1))
            x += sin(y * 9 + i) * 0.09 * abs(2*u-1)
            z = Rise(x, y) + (0.188 if underside else 0.36) + 0.055 * sin(x * 11 + y * 3) * cos(y * 8 - x)
            return x, y, z

        soil = asset.Mesh("Sod")
        def SurfaceUV(u, v):
            x, y, _ = Skin(u, v)
            return x / 0.8, y / 0.8

        Grid(soil, 32, 14, Skin, UV=SurfaceUV)
        Grid(soil, 32, 14, lambda u, v: Skin(u, v, True), flip=True, UV=SurfaceUV)
        for edge in (0, 1):
            Grid(soil, 32, 2, lambda u, v: Vector(Skin(u, edge, True)).lerp(Vector(Skin(u, edge)), v), flip=edge == 1)
            Grid(soil, 14, 2, lambda u, v: Vector(Skin(edge, u, True)).lerp(Vector(Skin(edge, u)), v), flip=edge == 0)
        for n in range(84):
            u, v = rng.random(), rng.choice([0, 0.04, 0.12, 0.92, 0.99])
            x, y, z = Skin(u, v)
            RootThread(asset.Mesh("Root" if n % 4 else "Straw"), (x,y - 0.03,z + 0.014),
                       rng.uniform(0.065, 0.32), rng, upward=n % 11 == 0)


def CutEarthBank(asset):
    rng = random.Random(942)
    contour = [(-1.03, 0.0), (-0.89, 0.08), (-0.76, 0.19), (-0.75, 0.37),
               (-0.84, 0.54), (-0.88, 0.59), (-0.47, 0.61), (-0.41, 0.69),
               (-0.24, 0.83), (0.04, 1.0)]

    def Face(u, row):
        x = -1.59 + 3.18 * u
        y, h = contour[row]
        relief = sin(x * 11 - h * 9) * cos(h * 18 + x) * 0.022 + sin(x * 34 + h * 19) * 0.006
        y += relief + 0.115 * sin(x * 2.1) + 0.064 * cos(x * 4.1 + h * 9.4)
        top = 1.26 + 0.81 * u + 0.18 * sin(u * 6.5)
        z = h * top + (0.026 * sin(x * 8 + row) + 0.010 * cos(x * 21)) * (0.25 + h * 0.75)
        return x, y, z

    soil = asset.Mesh("Bank")
    columns, rows = 48, len(contour)
    bankPoints = [Vector(Face(i / columns, row)) for row in range(rows) for i in range(columns + 1)]
    start = soil.Add(bankPoints)
    stride = columns + 1
    # Use world height on the cut and add the ground distance needed to
    # unfold the ledge. Keep compacted layers horizontal along the wall.
    arc = [0.0]
    for row in range(1, rows):
        first = row * stride
        length = sum((bankPoints[k] - bankPoints[k-stride]).length for k in range(first, first+stride))
        arc.append(arc[-1] + length / stride)
    offsets = [distance - sum(p.z for p in bankPoints[row*stride:(row+1)*stride])/stride
               for row, distance in enumerate(arc)]
    for row in range(rows - 1):
        for i in range(columns):
            a = start + row * stride + i
            b = a + stride
            corners = (a, a + 1, b + 1, b)
            uv = [(soil.vertices[k].x / 0.72, (soil.vertices[k].z + offsets[(k-start)//stride]) / 0.72)
                  for k in corners]
            soil.Face(corners, uv)
    def Cap(u, v):
        x, y, z = Face(u, rows - 1)
        return x, y + v * (1.17 - y), z + v * 0.09 + sin(u * 27 + v * 16) * 0.025 * sin(v*pi)
    def CapUV(u, v):
        x, y, _ = Cap(u, v)
        return x / 0.80, y / 0.80

    Grid(asset.Mesh("Sod"), columns, 8, Cap, UV=CapUV)
    for border in (0, 1):
        def Side(u, v):
            x, y, z = Face(border, round(v * (rows - 1)))
            return x, y + u * (1.18 - y), z
        def SideUV(u, v):
            _, y, z = Side(u, v)
            return y / 0.72, z / 0.72
        Grid(soil, 2, rows - 1, Side, flip=border == 0, UV=SideUV)
    Grid(soil, columns, 1, lambda u, v: (Face(u, rows - 1)[0], 1.17, v * Cap(u, 1)[2]), flip=True,
         UV=lambda u,v: (Face(u, rows - 1)[0] / 0.72, v * Cap(u, 1)[2] / 0.72))
    for i in range(190):
        u = rng.random()
        row = rng.choices((3, 5, 6, 8, 9), weights=(2, 8, 12, 4, 10))[0]
        x, y, z = Face(u, row)
        RootThread(asset.Mesh("Straw" if i % 3 == 0 else "Root"),
                   (x, y - 0.048, z + 0.019), rng.uniform(0.045, 0.26), rng, upward=row == 9 and i % 3 != 0)
    for i in range(48):
        u, row = rng.random(), rng.choice(range(1, 9))
        x, y, z = Face(u, row)
        size = rng.uniform(0.022, 0.078)
        RoundedBlock(asset.Mesh("Clod"), (x, y - size * 0.12, z),
                     (size, size * 0.52, size * rng.uniform(0.35, 0.88)), 141 + i, divisions=1, chip=0.6)


def DamagedGrayBrickWall(asset):
    rng = random.Random(824)
    rows = [(-0.71, 0.70, [0.29, 0.47, 0.43, 0.24]), (-0.71, 0.67, [0.16, 0.39, 0.37, 0.46]),
            (-0.68, 0.71, [0.31, 0.37, 0.39, 0.32]), (-0.66, 0.64, [0.16, 0.34, 0.40, 0.40]),
            (-0.70, 0.69, [0.38, 0.39, 0.37, 0.25]), (-0.64, 0.64, [0.12, 0.36, 0.4, 0.39])]
    for row, (start, end, widths) in enumerate(rows):
        y = 0.070 + row * 0.105
        cur = start
        RoundedBlock(asset.Mesh("Mortar"), ((start + end) / 2, 0.003, y - 0.01),
                     (end - start - 0.053, 0.251, 0.112), 91 + row, divisions=1)
        for i, w in enumerate(widths):
            shift = rng.uniform(-0.013, 0.013)
            RoundedBlock(asset.Mesh("Clod" if row == 0 else ("Brick", "BrickDark", "Brick")[i % 3]),
                         (cur + w * 0.5, shift, y + rng.uniform(-0.007, 0.007)),
                         (w - rng.uniform(0.003, 0.009), 0.30 - rng.uniform(0, 0.017),
                         (0.14 if row == 0 else 0.106) * (0.69 if row == 5 and i == 0 else 1)),
                         62 + row * 8 + i, divisions=3, bevel=0.12,
                         chip=0.64 if i == 0 or i == len(widths) - 1 else 0.12, tile=0.43)
            cur += w


def WickerBasket(asset):
    def RimPoint(a, z, delta=0):
        swell = 0.80 + z * 0.64 + 0.033 * sin(pi * z / 0.3)
        x = math.copysign(abs(cos(a)) ** 0.46, cos(a)) * (0.275 * swell + delta)
        y = math.copysign(abs(sin(a)) ** 0.46, sin(a)) * (0.166 * swell + delta)
        return (x, y, z + 0.0017 * sin(6 * a) + 0.0011 * sin(15 * a))

    nodes = 56
    liner = asset.Mesh("WillowWeave")
    outline = [Vector(RimPoint(i * TAU / nodes, 0.29)) for i in range(nodes+1)]
    arc = [0.0]
    for a, b in zip(outline, outline[1:]):
        arc.append(arc[-1] + (b-a).length)
    repeats = round(arc[-1] / 0.24)

    def Side(u, v, inside):
        angle = (1-u if inside else u) * TAU
        # Broad warp under the physical rim. Thin strands live in the baked maps.
        ripple = 0.002 * sin(angle * 17 + v * 5) * sin(pi*v)
        return RimPoint(angle, 0.018 + 0.275 * v, (-0.006 if inside else 0.003) + ripple)

    for inside in (False, True):
        def SideUV(u, v):
            i = round((1-u if inside else u) * nodes)
            return repeats * arc[i] / arc[-1], 0.19 + v * 0.275 / 0.24
        Grid(liner, nodes, 6, lambda u,v: Side(u, v, inside), UV=SideUV)
    RoundedBlock(liner, (0, 0, 0.014), (0.443, 0.263, 0.026), 78, divisions=3, bevel=0.28, tile=0.24)
    # Overlapping bindings along the hollow lip and two slanted willow loop handles.
    for sign in (-1, 1):
        strand = asset.Mesh("WickerDark" if sign == 1 else "Wicker")
        for j in range(58):
            a, b = j * TAU / 58, (j + 1) * TAU / 58
            points = [RimPoint(t, 0.297 + sign * 0.006 * sin(t * 28), sign * 0.004 * cos(t * 28)) for t in (a-0.028, b+0.027)]
            Tube(strand, points, [0.0065, 0.0065], 3, caps=False)
        loop = [(sign * (0.273 + 0.016 * sin(t * pi)), -0.084 + t * 0.151,
                 0.269 + 0.115 * sin(pi * t) ** 0.64 + 0.017 * t) for t in [i/12 for i in range(13)]]
        Tube(asset.Mesh("WickerDark"), loop, [0.008 + 0.003 * sin(i * pi / 12) for i in range(13)], 5)


def EarthenRubble(asset):
    center = Vector((0, 0, 0.161))
    source = MeshDraft()
    RoundedBlock(source, center, (0.45, 0.36, 0.32), 793, divisions=7, bevel=0.19, tile=0.38)
    outward = Vector((0.77, -0.46, 0.80)).normalized()
    distance = [(Vector(p) - center).dot(outward) - 0.227 for p in source.vertices]
    rock = asset.Mesh("Clod")
    original, intersections = {}, {}

    for face, uv in zip(source.faces, source.uvs):
        polygon, texel = [], []
        for i, a in enumerate(face):
            j = (i+1) % len(face)
            b = face[j]
            sideA, sideB = distance[a] <= 0, distance[b] <= 0
            if sideA:
                if a not in original:
                    original[a] = rock.Add([source.vertices[a]])
                polygon.append(original[a])
                texel.append(uv[i])
            if sideA != sideB:
                key = tuple(sorted((a,b)))
                mix = distance[a] / (distance[a] - distance[b])
                if key not in intersections:
                    point = Vector(source.vertices[a]).lerp(Vector(source.vertices[b]), mix)
                    intersections[key] = rock.Add([point])
                polygon.append(intersections[key])
                texel.append(tuple(Vector(uv[i]).lerp(Vector(uv[j]), mix)))
        if len(polygon) >= 3:
            rock.Face(polygon, texel)

    # Give the real cut its own projection in metres. The outer skin uses intact
    # UVs interpolated at the cut edges; no UV island is stretched into the chip.
    points = [rock.vertices[index] for index in intersections.values()]
    midpoint = sum(points, Vector((0, 0, 0))) / len(points)
    tangent = Vector((0, 1, 0)).cross(outward).normalized()
    bitangent = outward.cross(tangent)
    points.sort(key=lambda p: atan2((p-midpoint).dot(bitangent), (p-midpoint).dot(tangent)))
    ring = rock.Add(points)
    inset = midpoint - outward * 0.004
    middle = rock.Add([inset])
    for i, point in enumerate(points):
        j = (i+1) % len(points)
        uv = tuple((p.dot(tangent)/0.38 + 0.28, p.dot(bitangent)/0.38 + 0.74)
                   for p in (inset, point, points[j]))
        rock.Face((middle, ring+i, ring+j), uv, smooth=False)


def BareFieldElm(asset):
    rng = random.Random(45)
    bark = asset.Mesh("Bark")

    def Branch(a, direction, length, radius, depth):
        a, direction = Vector(a), Vector(direction).normalized()
        bend = Vector((rng.uniform(-0.35, 0.35), rng.uniform(-0.3, 0.3), 0.11))
        points = [a + direction * length * t + bend * length * t * t for t in (0, 0.33, 0.67, 1)]
        Tube(bark, points, [radius, radius * 0.79, radius * 0.53, max(radius * 0.21, 0.003)],
             7 if depth >= 3 else 4 if depth > 0 else 3, caps=depth >= 3)
        if not depth:
            return
        for i, t in enumerate((0.42, 0.65, 0.84, 0.99) if depth >= 3 else (0.61, 0.88, 0.98)):
            base = a + direction * length * t + bend * length * t * t
            angle = rng.uniform(-pi, pi) + i * 2.2
            out = Vector((cos(angle), sin(angle), rng.uniform(0.32, 0.76)))
            newDirection = direction * (0.58 + i * 0.105) + out * (0.84 - i * 0.17)
            Branch(base, newDirection, length * rng.uniform(0.40, 0.62), radius * (0.48 if i < 3 else 0.35), depth - 1)

    trunk = [(0, 0, -0.05), (-0.09, 0.04, 0.27), (-0.13, 0.16, 0.9),
             (-0.03, 0.13, 1.56), (0.14, 0.16, 2.12), (0.42, 0.18, 2.65)]
    Tube(bark, trunk, [0.35, 0.29, 0.253, 0.231, 0.195, 0.15], 12, uvMeters=1.2,
         deform=lambda row, i, angle: (1 + 0.13 * cos(angle * 5 + row * 0.24), 0))
    Branch(trunk[-2], (0.32, 0.14, 0.92), 3.17, 0.153, 4)
    Branch(trunk[-3], (-0.82, 0.21, 0.49), 2.85, 0.14, 4)
    Branch(trunk[-2], (0.54, -0.52, 0.64), 2.8, 0.118, 3)
    Branch(trunk[-4], (-0.35, -0.68, 0.67), 1.98, 0.101, 2)
    a, b = trunk[-3], (-1.6, 0.52, 2.39)
    Log(bark, a, b, 0.121, 919, fracture=0.16, rings=5, sides=9)
    for i in range(6):
        a = i * TAU / 6
        Tube(bark, [(0, 0, 0.38), (cos(a)*0.35, sin(a)*0.3, 0.08), (cos(a)*0.65, sin(a)*0.53, -0.04)],
             [0.115, 0.083, 0.026], 6)
    bark.vertices = [(x * 1.15, y * 0.79, z * 0.85) for x, y, z in bark.vertices]


def Farmhouse(asset):
    plaster, base, roof = (asset.Mesh(name) for name in ("Plaster", "Clod", "RoofTile"))
    for sign in (-1, 1):
        Grid(plaster, 13, 5, lambda u, v: (-4.25+8.5*u, sign*2.07, 0.37+2.1*v), flip=sign > 0,
             UV=lambda u, v: (u*3, v*1.19))
        Grid(plaster, 8, 6, lambda u, v: (sign*4.25, -2.07+4.14*u, 0.37+v*(2.10+1.12*(1-abs(2*u-1)))),
             flip=sign < 0, UV=lambda u, v: (u*1.8, v*1.65))
        for i in range(24):
            x = -4.36 + i * 0.38
            color = "GrayWood" if i % 4 else "Bark"
            Tube(asset.Mesh(color), [(x, sign*2.29, 2.45), (x, sign*2.01, 2.51)], [0.049, 0.053], 5)
        Grid(roof, 64, 6, lambda u, v: (-4.56+9.12*u, sign*2.39*v,
             3.62-1.10*v + 0.041*cos(TAU*23*u) - 0.083*sin(pi*u)*v*v),
             flip=sign < 0, UV=lambda u, v: (u*6.42, v*1.8))
        Log(asset.Mesh("GrayWood"), (-4.48, sign*2.29, 2.44), (4.48, sign*2.29, 2.44), 0.068, 571, rings=9, sides=7)
    RoundedBlock(base, (0, 0, 0.23), (8.55, 4.18, 0.51), 166, divisions=3, bevel=0.14, tile=1.5)
    rng = random.Random(382)
    for side in (-1, 1):
        for row in range(2):
            for i in range(16):
                x = (i-7.5)*0.526 + rng.uniform(-0.028,0.028) + (row-0.5)*0.12
                RoundedBlock(base, (x,side*2.094,0.115+row*0.19), (0.52,0.16,0.20),
                             723+i+row*25, divisions=1, bevel=0.24, tile=0.5)
    Log(roof, (-4.58, 0, 3.63), (4.58, 0, 3.65), 0.09, 481, rings=18, sides=8)
    for x, width, low, high in ((0.03, 1.02, 0.12, 1.94), (-2.47, 0.57, 1.04, 1.71), (2.53, 0.57, 1.04, 1.71)):
        RoundedBlock(asset.Mesh("Openings"), (x, -2.076, (low+high)*0.5), (width, 0.018, high-low), 214, divisions=1)
        for side in (-1, 1):
            xx = x + side * width * 0.5
            Log(asset.Mesh("GrayWood"), (xx,-2.10,low), (xx,-2.10,high), 0.043, 161, rings=2, sides=6)
        Log(asset.Mesh("GrayWood"), (x-width*0.60,-2.10,high), (x+width*0.60,-2.10,high), 0.061, 172, rings=3, sides=6)
        if width < 1:
            for i in (-1, 0, 1):
                RoundedBlock(asset.Mesh("GrayWood"), (x+i*width*0.23,-2.099,(high+low)*0.5),
                             (0.035,0.027,high-low), 521+i, divisions=1, bevel=0.12)
        else:
            door = asset.Mesh("GrayWood")
            Grid(door, 5, 4, lambda u,v: (x+(u-0.5)*width, -2.09-0.008*cos(u*TAU*5), low+(high-low)*v),
                 UV=lambda u,v:(u*0.65,v*1.1))


def WheatField(asset):
    rng = random.Random(630)
    w, d = 8, 3.8

    def Earth(u, v):
        edge = min(1, (0.5-abs(0.5-u))*31, (0.5-abs(0.5-v))*31)
        row = sin(TAU * v*5.6 + cos(u*13)*0.31)
        return (w*(u-0.5), d*(v-0.5), -0.014+edge*(0.045+0.021*row+0.017*sin(u*67-v*12)*cos(v*81)))

    for row in range(42):
        def V(v):
            return (row+v)/42
        for col in range(28):
            u, v = (col+0.5)/28, V(0.5)
            cover = sin(TAU * v*5.6 + cos(u*13)*0.31)
            planted = cover < -0.12 + 0.4 * sin(u*34+v*64) and u > 0.027 and u < 0.973
            Grid(asset.Mesh("WheatSoil" if planted else "FieldEarth"), 1, 1,
                 lambda u,v: Earth((col+u)/28,V(v)),
                 UV=lambda u,v: ((col+u)*w/(1.56*28), V(v)*d/1.56))
    for i in range(650):
        u, v = rng.uniform(0.02, 0.98), rng.uniform(0.025, 0.975)
        if sin(TAU * v*5.6 + cos(u*13)*0.31) > 0.08 or sin(u*47+v*13) < -0.79:
            continue
        x, y, z = Earth(u, v)
        mesh = asset.Mesh(("WheatGreen", "WheatLight", "WheatDark")[i % 3])
        for _ in range(5):
            h, width = rng.uniform(0.044, 0.152), rng.uniform(0.008, 0.017)
            a = rng.uniform(0, TAU)
            dx, dy = cos(a), sin(a)
            lean = h * rng.uniform(0.27, 0.76)
            p = mesh.Add([(x, y, z), (x + dy*width, y - dx*width, z),
                          (x+dx*lean*0.49, y+dy*lean*0.49, z+h*0.67),
                          (x+dx*lean, y+dy*lean, z+h)])
            mesh.Face((p,p+1,p+2), smooth=False)
            mesh.Face((p,p+2,p+3), smooth=False)


BUILDERS = (SplitTimber, BrokenSodRoof, CutEarthBank, DamagedGrayBrickWall, WickerBasket,
            EarthenRubble, BareFieldElm, Farmhouse, WheatField)


def Build(output, blend):
    scene = bpy.context.scene
    # The dedicated MCP window and factory-startup batch each own their scene.
    # Keep the live connection across rebuilds.
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in list(scene.collection.children):
        bpy.data.collections.remove(collection)
    bpy.data.orphans_purge(do_recursive=True)
    scene.unit_settings.system = "METRIC"
    materials = {
        "Bark": Mat("WeatheredElmBark", (107, 92, 76), 0.90, baked="ElmBark", normalStrength=1.05),
        "SplitWood": Mat("ExposedSplitWood", (131, 109, 83), 0.89, baked="SplitElm", normalStrength=0.90),
        "EndGrain": TimberEndGrain(),
        "GrayWood": Mat("GrayBuildingWood", (97, 87, 69), 0.94, "VillageTimber"),
        "Sod": Mat("RootMattedSod", (102, 85, 64), 0.94, baked="RootedSod", normalStrength=0.88),
        "Bank": Mat("CutLoess", (106, 87, 67), 0.94, baked="CutLoess", normalStrength=0.74),
        "Clod": Mat("DustyClods", (101, 90, 75), 0.92, baked="MudStone", normalStrength=0.72),
        "Brick": Mat("AshGrayBrick", (104, 99, 94), 0.91, baked="FiredGrayClay", normalStrength=0.87),
        "Mortar": Mat("DryClayMortar", (53, 46, 36), 0.98, "MissionSoil", (0.55, 0.52, 0.49)),
        "Root": Mat("DryRoots", (110, 83, 56), 0.96),
        "Straw": Mat("CopperStraw", (151, 120, 81), 0.92),
        "Wicker": Mat("WillowFiber", (99, 78, 55), 0.91),
        "WickerDark": Mat("DarkWillowFiber", (80, 65, 49), 0.96),
        "WillowWeave": Mat("InterlacedWillow", (112, 94, 75), 0.90, baked="WillowWeave", normalStrength=1.02),
        "Plaster": Mat("FarmWornMudPlaster", (133, 110, 83), 0.98, "VillageMudPlaster"),
        "RoofTile": Mat("FarmWeatheredTile", (90, 91, 87), 0.94, "VillageRoofTile"),
        "Openings": Mat("FarmDarkOpenings", (34, 30, 25), 0.96),
        "FieldEarth": Mat("WorkedFieldEarth", (95, 75, 48), 0.98, "TerrainFieldSoil", (0.93, 0.84, 0.76)),
        "WheatSoil": Mat("GreenRowFootprint", (85, 103, 57), 0.99, "TerrainFieldSoil", (0.67, 0.99, 0.58)),
        "WheatGreen": Mat("YoungWheat", (103, 110, 63), 0.94),
        "WheatLight": Mat("YoungWheatLight", (124, 125, 74), 0.93),
        "WheatDark": Mat("YoungWheatDark", (80, 92, 54), 0.98),
    }
    materials["ShelterWood"] = materials["Bark"]
    materials["BrickDark"] = materials["Brick"]
    for key in ("WheatGreen", "WheatLight", "WheatDark"):
        materials[key].use_backface_culling = False
    for i, builder in enumerate(BUILDERS):
        asset = Asset(builder.__name__, materials, (i % 3 * 13.0, -(i // 3) * 10.0, 0))
        builder(asset)
        asset.Finish()
    if blend:
        blend.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.file.pack_all()
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", export_image_format="AUTO",
                              export_jpeg_quality=92, export_cameras=False, export_lights=False)


def Main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--blend", type=Path)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = parser.parse_args(argv)
    Build(args.output.resolve(), args.blend.resolve() if args.blend else None)


if __name__ == "__main__":
    Main()
