"""Mesh and packed material baking for this scene's Blender source."""

from math import cos, pi, sin

import bpy
import numpy as np
from mathutils import Matrix, Vector


def Noise(random, width, height, across, along):
    """Periodic, smooth value noise in UV space."""
    cells = random.random((along, across))
    x = np.arange(width) * across / width
    y = np.arange(height) * along / height
    ix, iy = x.astype(int), y.astype(int)
    fx, fy = x - ix, y - iy
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = cells[iy[:, None], ix], cells[iy[:, None], (ix + 1) % across]
    c, d = cells[(iy[:, None] + 1) % along, ix], cells[(iy[:, None] + 1) % along, (ix + 1) % across]
    return (a + (b - a) * fx) * (1 - fy[:, None]) + (c + (d - c) * fx) * fy[:, None]


class Materials:
    def __init__(self, scratch):
        self.scratch = scratch
        self.items = {}

    def Image(self, name, rgb, color_space):
        height, width = rgb.shape[:2]
        image = bpy.data.images.new(name, width, height, alpha=False)
        image.colorspace_settings.name = color_space
        rgba = np.ones((height, width, 4), dtype=np.float32)
        rgba[:, :, :3] = np.clip(rgb, 0, 1)
        image.pixels.foreach_set(rgba.ravel())
        image.filepath_raw = str(self.scratch / (name + ".png"))
        image.file_format = "PNG"
        image.save()
        image.pack()
        return image

    def Make(self, name, rgb, roughness=.93, *, finish=None, metal=0, double=False):
        if name in self.items:
            return self.items[name]
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        material.use_backface_culling = not double
        material.diffuse_color = (*rgb, 1)
        material.roughness = roughness
        nodes, links = material.node_tree.nodes, material.node_tree.links
        bsdf = nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metal
        if finish:
            if finish == "bark":
                resolution = 1024
            elif name.startswith("Cart"):
                resolution = 512
            elif name.startswith(("Donkey", "PackDonkey", "Fence")):
                resolution = 128
            else:
                resolution = 256
            width = height = resolution
            random = np.random.default_rng(sum((i + 1) * ord(letter) for i, letter in enumerate(name)))
            def N(u, v):
                return Noise(random, width, height, u, v)

            u, v = np.meshgrid(np.arange(width) / width, np.arange(height) / height)
            grain = random.random((height, width)) - .5
            if finish == "bark":
                drift = (N(7, 5) - .5) * .043 + sin_array(v * 4 * pi) * .014
                grooves = ((sin_array((u + drift) * 2 * pi * 29) + 1) * .5) ** 10
                fissures = grooves * (.36 + .64 * N(23, 9))
                relief = .37 * N(41, 12) + .19 * N(112, 53) - .45 * fissures + .11 * grain
                chroma = .58 + .79 * N(12, 7) + .43 * (N(62, 11) - .5) - .52 * fissures
                strength = 4.8
            elif finish == "wood":
                drift = (N(9, 4) - .5) * .036
                rings = sin_array((u + drift) * 2 * pi * 37)
                grain_lines = .63 * N(71, 5) + .18 * N(154, 24) + .19 * rings
                relief = grain_lines * .58 + .10 * grain
                chroma = .76 + .38 * N(11, 3) + .51 * (grain_lines - .4)
                strength = 3.1
            elif finish == "straw":
                stems = .52 * N(178, 20) + .34 * N(52, 11) + .14 * N(233, 94)
                relief = .67 * stems + .11 * grain
                chroma = .59 + .73 * stems + .19 * N(9, 13)
                strength = 3
            elif finish == "cloth":
                weave = sin_array(u * 2 * pi * 144) * sin_array(v * 2 * pi * 141)
                relief = .22 * N(22, 27) + .21 * weave + .14 * grain
                chroma = .62 + .60 * N(13, 13) + .13 * weave
                strength = 2.2
            elif finish == "fur":
                relief = .45 * N(179, 37) + .2 * N(106, 21) + .12 * grain
                chroma = .71 + .58 * N(13, 7) + .22 * N(111, 25)
                strength = 1.7
            else:
                broad = N(11, 12)
                middle = N(51, 48)
                fine = N(157, 152)
                pores = np.maximum(0, .28 - middle) * 2.1
                relief = .34 * broad + .40 * middle + .18 * fine - .28 * pores + .11 * grain
                chroma = .69 + .56 * broad + .35 * fine - .41 * pores + .10 * grain
                strength = 3.2
            normal = np.stack((
                (np.roll(relief, 1, axis=1) - np.roll(relief, -1, axis=1)) * strength,
                (np.roll(relief, 1, axis=0) - np.roll(relief, -1, axis=0)) * strength,
                np.ones_like(relief),
            ), axis=-1)
            normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
            color_image = nodes.new("ShaderNodeTexImage")
            color_image.image = self.Image("Texture_" + name + "Base", chroma[:, :, None] * np.array(rgb), "sRGB")
            links.new(color_image.outputs["Color"], bsdf.inputs["Base Color"])
            normal_image = nodes.new("ShaderNodeTexImage")
            normal_image.image = self.Image("Texture_" + name + "Normal", normal * .5 + .5, "Non-Color")
            normal_map = nodes.new("ShaderNodeNormalMap")
            links.new(normal_image.outputs["Color"], normal_map.inputs["Color"])
            links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
        self.items[name] = material
        return material


sin_array = np.sin


class Mesh:
    """Accumulate authored surfaces by material, then create Blender meshes."""
    def __init__(self):
        self.parts = {}

    def Add(self, material, vertices, faces, *, uv=None, smooth=False):
        points, polygons, uvs, smoothing = self.parts.setdefault(material, ([], [], [], []))
        offset = len(points)
        points.extend(vertices)
        for index, face in enumerate(faces):
            polygons.append(tuple(offset + i for i in face))
            if uv is None:
                # Use the dominant side of the face for the meter-based projection.
                a, b, c = (Vector(vertices[j]) for j in face[:3])
                normal = (b - a).cross(c - a)
                axis = max(range(3), key=lambda k: abs(normal[k]))
                u, v = ((1, 2), (0, 2), (0, 1))[axis]
                uvs.extend((vertices[j][u], vertices[j][v]) for j in face)
            else:
                uvs.extend(uv[index])
            smoothing.append(smooth)

    def Emit(self, collection):
        for material, (vertices, faces, uvs, smooth) in self.parts.items():
            data = bpy.data.meshes.new(material.name)
            data.from_pydata(vertices, [], faces)
            data.update()
            data.uv_layers.new(name="UVMap")
            data.uv_layers.active.data.foreach_set("uv", [item for point in uvs for item in point])
            data.polygons.foreach_set("use_smooth", smooth)
            data.materials.append(material)
            obj = bpy.data.objects.new(material.name, data)
            collection.objects.link(obj)
        return list(collection.objects)


def Tube(mesh, material, points, radii, sides, *, aspect=1, furrow=0, phase=0, tile=(1, 1), smooth=True):
    """Tapered ring sweep with a transported frame and a correctly wrapped UV seam."""
    points = [Vector(point) for point in points]
    verts, faces, uv = [], [], []
    distance = 0
    lengths = [0]
    side = None
    for i, (point, radius) in enumerate(zip(points, radii)):
        tangent = (points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]).normalized()
        if i:
            distance += (point - points[i - 1]).length
            lengths.append(distance)
            side = (side - tangent * side.dot(tangent)).normalized()
        if side is None or side.length < .1:
            side = tangent.cross(Vector((0, 0, 1) if abs(tangent.z) < .88 else (0, 1, 0))).normalized()
        binormal = tangent.cross(side)
        for j in range(sides):
            theta = 2 * pi * j / sides
            ridges = sin(5 * theta + phase + distance * .8) + .55 * sin(11 * theta + distance * 3.1) + .32 * sin(17 * theta - distance * 6.2)
            r = radius * (1 + furrow * ridges)
            verts.append(point + r * (side * cos(theta) + binormal * sin(theta) * aspect))
    for i in range(len(points) - 1):
        for j in range(sides):
            k = (j + 1) % sides
            faces.append((i * sides + j, i * sides + k, (i + 1) * sides + k, (i + 1) * sides + j))
            left, right = j * tile[0] / sides, (j + 1) * tile[0] / sides
            bottom, top = lengths[i] * tile[1], lengths[i + 1] * tile[1]
            uv.append(((left, bottom), (right, bottom), (right, top), (left, top)))
    for ring in (0, len(points) - 1):
        cap = range(sides - 1, -1, -1) if ring == 0 else range(sides)
        faces.append(tuple(ring * sides + j for j in cap))
        uv.append(tuple((.5 + .5 * cos(2 * pi * j / sides), .5 + .5 * sin(2 * pi * j / sides)) for j in cap))
    mesh.Add(material, verts, faces, uv=uv, smooth=smooth)


def Box(mesh, material, center, size, *, along=None, bevel=0):
    x, y, z = (n * .5 for n in size)
    corners = [(-x,-y), (x,-y), (x,y), (-x,y)]
    if bevel:
        b = min(bevel, x * .45, y * .45, z * .45)
        full = [(-x+b,-y), (x-b,-y), (x,-y+b), (x,y-b), (x-b,y), (-x+b,y), (-x,y-b), (-x,-y+b)]
        planes = [(z0, [(a * (1 - d / x), e * (1 - d / y)) for a, e in full])
                  for z0, d in [(-z, b), (-z+b, 0), (z-b, 0), (z, b)]]
    else:
        planes = [(-z, corners), (z, corners)]
    n = len(planes[0][1])
    rotation = Vector(along).normalized().to_track_quat("Z", "Y") if along is not None else None
    vertices = []
    for level, profile in planes:
        for a, b in profile:
            pos = Vector((a, b, level))
            vertices.append(Vector(center) + (rotation @ pos if rotation else pos))
    faces = [tuple(reversed(range(n)))]
    uvs = [tuple((planes[0][1][j][0], planes[0][1][j][1]) for j in reversed(range(n)))]
    for i in range(len(planes) - 1):
        for j in range(n):
            k = (j + 1) % n
            quad = (i*n+j, i*n+k, (i+1)*n+k, (i+1)*n+j)
            faces.append(quad)
            d = (vertices[quad[1]] - vertices[quad[0]]).length
            u0 = j * .13
            uvs.append(((u0, planes[i][0]), (u0+d, planes[i][0]), (u0+d, planes[i+1][0]), (u0, planes[i+1][0])))
    end = (len(planes) - 1)*n
    faces.append(tuple(end+j for j in range(n)))
    uvs.append(tuple(planes[-1][1]))
    if along is None and not bevel:
        uvs = None
    mesh.Add(material, vertices, faces, uv=uvs)


def Beam(mesh, material, start, end, width, depth, *, bevel=0):
    start, end = Vector(start), Vector(end)
    along = end - start
    Box(mesh, material, (start + end) * .5, (width, depth, along.length), along=along, bevel=bevel)


def Ellipsoid(mesh, material, center, size, *, rings=8, sides=14, jitter=0, smooth=True, along=None):
    """Closed sphere with two poles. Size gives the three radii."""
    shift = Vector(center)
    transform = Vector(along).normalized().to_track_quat("Z", "Y").to_matrix() if along else Matrix.Identity(3)
    rings -= 1
    points = [shift - transform @ Vector((0, 0, size[2]))]
    for i in range(1, rings + 1):
        phi = pi * i / (rings + 1)
        for j in range(sides):
            u = j * 2 * pi / sides
            r = 1 + jitter * (sin(u * 3 + phi * 2.8) + .56 * sin(u * 7 - phi * 4.6))
            point = Vector((size[0] * cos(u) * sin(phi) * r,
                            size[1] * sin(u) * sin(phi) * r, -size[2] * cos(phi) * r))
            points.append(shift + transform @ point)
    points.append(shift + transform @ Vector((0, 0, size[2])))
    faces, uv = [], []
    for ring in range(rings + 1):
        low = ring / (rings + 1)
        high = (ring + 1) / (rings + 1)
        for j in range(sides):
            k = (j+1) % sides
            u0, u1 = j / sides, (j+1) / sides
            below, above = 1 + (ring-1)*sides, 1 + ring*sides
            if ring == 0:
                faces.append((0, above+k, above+j))
                uv.append((((u0+u1)/2, 0), (u1, high), (u0, high)))
            elif ring == rings:
                faces.append((below+j, below+k, len(points)-1))
                uv.append(((u0, low), (u1, low), ((u0+u1)/2, 1)))
            else:
                faces.append((below+j, below+k, above+k, above+j))
                uv.append(((u0, low), (u1, low), (u1, high), (u0, high)))
    mesh.Add(material, points, faces, uv=uv, smooth=smooth)


def Ribbon(mesh, material, path, widths, *, direction=None):
    """Tapered double-sided blade with a central fold and bent tip."""
    path = [Vector(p) for p in path]
    delta = path[-1] - path[0]
    side = Vector(direction) if direction is not None else delta.cross(Vector((0,0,1))).normalized()
    points, faces, uv = [], [], []
    for p, width in zip(path[:-1], widths[:-1]):
        points.extend((p - width * side, p + Vector((0, 0, width * .22)), p + width * side))
    points.append(path[-1])
    bands = len(path) - 2
    for j in range(bands):
        for i in range(2):
            a = j*3 + i
            faces.append((a, a+1, a+4, a+3))
            lo, hi = j/(bands+1), (j+1)/(bands+1)
            uv.append(((i*.5, lo), ((i+1)*.5, lo), ((i+1)*.5, hi), (i*.5, hi)))
    for i in range(2):
        faces.append((bands*3+i, bands*3+i+1, len(points)-1))
        uv.append(((i*.5, .75), ((i+1)*.5, .75), (.5, 1)))
    mesh.Add(material, points, faces, uv=uv, smooth=True)


def SmoothPath(points, steps):
    points = [Vector(point) for point in points]
    curve = []
    for i in range(len(points) - 1):
        a = points[max(0, i - 1)]
        b, c = points[i:i+2]
        d = points[min(i + 2, len(points) - 1)]
        for t in (j / steps for j in range(steps)):
            curve.append((b * 2 + (-a + c)*t + (2*a - 5*b + 4*c - d)*t*t
                          + (-a + 3*b - 3*c + d)*t*t*t) * .5)
    return [*curve, points[-1]]
