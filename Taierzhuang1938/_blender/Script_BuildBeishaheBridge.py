"""Rebuild one intact Beishahe bridge candidate through the worktree BlenderMCP.

Independent asset, not a replacement for the compressed 44 m campaign blockout.
Geometry is authored in game metres and converted to Blender Z-up before export.
The exported GLB uses standard glTF Y-up, X east and Z south.
Raw .blend and original imagegen inputs stay in the task's OneDrive source folder.
"""
import bpy
import bisect
import hashlib
import json
import math
import os
import random
from pathlib import Path
from mathutils import Vector

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent
SPEC = json.loads((HERE / "Data_BeishaheBridgeSpec.json").read_text(encoding="utf-8"))
SOURCE = Path(os.environ.get("BEISHAHE_BRIDGE_SOURCE_DIR", "C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/BeishaheBridge"))
MODEL = PROJECT / "Model"
SOURCE.mkdir(parents=True, exist_ok=True)
(SOURCE / "Review").mkdir(exist_ok=True)
MODEL.mkdir(exist_ok=True)


def ToBlender(p):
    return (p[0], -p[2], p[1])


class Geometry:
    def __init__(self):
        self.vertices = []
        self.faces = []
        self.uvs = []
        self.normals = []
        self.smoothFaces = []
        self.colors = []

    def Polygon(self, points, uv=None, normals=None, uvOffset=None, grain=None, tint=None, uvTurn=0):
        start = len(self.vertices)
        self.vertices.extend(points)
        self.faces.append(tuple(range(start, start + len(points))))
        if uv is None:
            a, b, c = map(Vector, points[:3])
            normal = (b - a).cross(c - a)
            axis = max(range(3), key=lambda i: abs(normal[i]))
            axes = [i for i in range(3) if i != axis]
            if grain == "sleeper" and axis == 1:
                uv = [(p[2], p[0]) for p in points]
            elif grain == "sleeper" and axis == 2:
                uv = [(p[1], p[0]) for p in points]
            elif grain == "deck" and axis == 1:
                uv = [(p[0], p[2]) for p in points]
            elif grain == "deck" and axis == 0:
                uv = [(p[1], p[2]) for p in points]
            else:
                uv = [(p[axes[0]], p[axes[1]]) for p in points]
        # A quarter-turn changes the material direction without changing its
        # metre scale. Used only for stone blocks, never directional wood.
        for _ in range(uvTurn % 4):
            uv = [(-v, u) for u, v in uv]
        if uvOffset:
            uv = [(u + uvOffset[0], v + uvOffset[1]) for u, v in uv]
        self.uvs.extend(uv)
        self.normals.extend(normals if normals is not None else [(0, 0, 0)] * len(points))
        self.smoothFaces.append(normals is not None)
        if callable(tint):
            self.colors.extend([tint(p) for p in points])
        else:
            self.colors.extend([tint if tint is not None else (1, 1, 1, 1)] * len(points))

    def Box(self, center, size, basis=None, uvOffset=None, grain=None, tint=None, uvTurn=0):
        c = Vector(center)
        axes = list(map(Vector, basis or [(1, 0, 0), (0, 1, 0), (0, 0, 1)]))
        points = [tuple(c + axes[0] * (sx * size[0] / 2) + axes[1] * (sy * size[1] / 2) + axes[2] * (sz * size[2] / 2))
                  for sx, sy, sz in [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1), (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]]
        for face in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)]:
            self.Polygon([points[i] for i in face], uvOffset=uvOffset, grain=grain, tint=tint, uvTurn=uvTurn)

    def BeveledBox(self, center, size, bevel, uvOffset=None, grain=None, endGeometry=None, tint=None, uvTurn=0):
        """Six inset faces, 12 edge chamfers and 8 corners, in game metres.

        A distinct end-grain mesh is used on each sleeper's X end. UVs on
        longitudinal faces keep V aligned to X, matching the generated grain.
        """
        c = Vector(center)
        h = [v / 2 for v in size]
        b = min(bevel, min(h) * 0.45)

        def Face(local, target=None, end=False):
            points = [tuple(c + Vector(p)) for p in local]
            a, d, e = map(Vector, points[:3])
            faceCenter = sum((Vector(p) for p in points), Vector()) / len(points)
            if (d - a).cross(e - a).dot(faceCenter - c) < 0:
                points.reverse()
            if end:
                u0, v0 = uvOffset or (0, 0)
                # End grain is one square image on a 0.24 x 0.16 m section:
                # both UV axes must use the same physical metres-per-tile.
                # Crop the vertical remainder instead of squashing its rings.
                # Jitter stays inside the image even at the bevelled extremes.
                jitterU = ((u0 % 1) - 0.5) * 1.6 * (b / size[2])
                marginV = (size[2] - size[1] + 2 * b) / (2 * size[2])
                jitterV = ((v0 % 1) - 0.5) * 1.4 * marginV
                uv = [((p[2] - c.z) / size[2] + 0.5 + jitterU,
                       (p[1] - c.y) / size[2] + 0.5 + jitterV) for p in points]
                (target or self).Polygon(points, uv=uv, tint=tint)
            else:
                (target or self).Polygon(points, uvOffset=uvOffset, grain=grain, tint=tint, uvTurn=uvTurn)

        x, y, z = h
        for sign in [-1, 1]:
            Face([(sign*x, -y+b, -z+b), (sign*x, y-b, -z+b),
                  (sign*x, y-b, z-b), (sign*x, -y+b, z-b)], endGeometry, endGeometry is not None)
            Face([(-x+b, sign*y, -z+b), (x-b, sign*y, -z+b),
                  (x-b, sign*y, z-b), (-x+b, sign*y, z-b)])
            Face([(-x+b, -y+b, sign*z), (x-b, -y+b, sign*z),
                  (x-b, y-b, sign*z), (-x+b, y-b, sign*z)])
        for sy in [-1, 1]:
            for sz in [-1, 1]:
                Face([(-x+b, sy*y, sz*(z-b)), (x-b, sy*y, sz*(z-b)),
                      (x-b, sy*(y-b), sz*z), (-x+b, sy*(y-b), sz*z)])
        for sx in [-1, 1]:
            for sz in [-1, 1]:
                Face([(sx*x, -y+b, sz*(z-b)), (sx*x, y-b, sz*(z-b)),
                      (sx*(x-b), y-b, sz*z), (sx*(x-b), -y+b, sz*z)])
        for sx in [-1, 1]:
            for sy in [-1, 1]:
                Face([(sx*x, sy*(y-b), -z+b), (sx*x, sy*(y-b), z-b),
                      (sx*(x-b), sy*y, z-b), (sx*(x-b), sy*y, -z+b)])
                for sz in [-1, 1]:
                    Face([(sx*x, sy*(y-b), sz*(z-b)), (sx*(x-b), sy*y, sz*(z-b)),
                          (sx*(x-b), sy*(y-b), sz*z)])

    def TopBeveledBox(self, center, size, bevel, uvOffset=None, grain=None, tint=None, edgeProfile=None):
        """Solid plank with a four-sided top chamfer and a flat bearing base."""
        c = Vector(center)
        x, y, z = [v / 2 for v in size]
        b = min(bevel, min(x, y, z) * .45)
        bottom = [(-x,-y,-z),(x,-y,-z),(x,-y,z),(-x,-y,z)]
        shoulder = [(-x,y-b,-z),(x,y-b,-z),(x,y-b,z),(-x,y-b,z)]
        top = [(-x+b,y,-z+b),(x-b,y,-z+b),(x-b,y,z-b),(-x+b,y,z-b)]
        edge0, edge1 = -z + b, z - b
        edgeProfile = edgeProfile or (.66, .66, .014, .014)
        lowTone, highTone, lowWidth, highWidth = edgeProfile
        lowWidth = min(lowWidth, (edge1 - edge0) * .22)
        highWidth = min(highWidth, (edge1 - edge0) * .22)
        def TopShade(point):
            """Vertex-interpolated wear at a real board edge, not a painted line."""
            along = point[2] - c.z
            lowDistance, highDistance = along - edge0, edge1 - along
            distance = max(0, min(lowDistance, highDistance))
            edgeTone, transition = (lowTone, lowWidth) if lowDistance <= highDistance else (highTone, highWidth)
            mid = transition * .5
            middleTone = edgeTone + .55 * (1 - edgeTone)
            if distance < mid:
                return edgeTone + (middleTone - edgeTone) * distance / mid
            if distance < transition:
                return middleTone + (1 - middleTone) * (distance - mid) / (transition - mid)
            return 1.0
        def Face(local, shade=1.0, varying=None):
            points = [tuple(c + Vector(p)) for p in local]
            a, d, e = map(Vector, points[:3])
            faceCenter = sum((Vector(p) for p in points), Vector()) / len(points)
            if (d - a).cross(e - a).dot(faceCenter - c) < 0:
                points.reverse()
            if tint is None:
                faceTint = None
            elif varying:
                faceTint = lambda point: tuple(tint[i] * varying(point) for i in range(3)) + (tint[3],)
            else:
                faceTint = tuple(tint[i] * shade for i in range(3)) + (tint[3],)
            self.Polygon(points, uvOffset=uvOffset, grain=grain, tint=faceTint)
        Face(bottom, varying=lambda p: .86 * TopShade(p))
        # Five coplanar bands describe the same solid top. COLOR_0 smoothly
        # darkens only the two actual Z edges, returning to the row's full tint
        # over 10–18 mm; geometry, UV scale, seams and contact remain unchanged.
        cuts = [edge0, edge0 + lowWidth * .5, edge0 + lowWidth,
                edge1 - highWidth, edge1 - highWidth * .5, edge1]
        for z0, z1 in zip(cuts, cuts[1:]):
            Face([(-x+b,y,z0),(x-b,y,z0),(x-b,y,z1),(-x+b,y,z1)], varying=TopShade)
        for i in range(4):
            j = (i + 1) % 4
            Face([bottom[i],bottom[j],shoulder[j],shoulder[i]], varying=lambda p: .86 * TopShade(p))
            Face([shoulder[i],shoulder[j],top[j],top[i]], varying=lambda p: TopShade(p) * (.86 + .14 * max(0, min(1, (p[1] - (c.y + y - b)) / b))))

    def ExtrudedProfile(self, profile, z0, z1, uvOffset=None):
        """Solid X/Y section extruded along track Z, including real caps."""
        # Input profile must be counter-clockwise in X/Y as viewed from +Z.
        front = [(x, y, z0) for x, y in profile]
        back = [(x, y, z1) for x, y in profile]
        self.Polygon(list(reversed(front)), uvOffset=uvOffset)
        self.Polygon(back, uvOffset=uvOffset)
        for i in range(len(profile)):
            j = (i + 1) % len(profile)
            self.Polygon([front[i], front[j], back[j], back[i]], uvOffset=uvOffset)

    def Plate(self, points, outward, thickness):
        """Physical, two-sided connection plate, not an infinitely thin quad."""
        n = Vector(outward).normalized()
        outer = [Vector(p) + n * (thickness / 2) for p in points]
        inner = [Vector(p) - n * (thickness / 2) for p in points]
        self.Polygon([tuple(p) for p in outer])
        self.Polygon([tuple(p) for p in reversed(inner)])
        for i in range(len(points)):
            j = (i + 1) % len(points)
            self.Polygon([tuple(outer[i]), tuple(inner[i]), tuple(inner[j]), tuple(outer[j])])

    def WedgeWall(self, start, end, width, floor, topStart, topEnd, uvOffset=None, tint=None):
        """Continuous sloping wing-wall core; start/end are X/Z positions."""
        a = Vector((start[0], 0, start[1]))
        b = Vector((end[0], 0, end[1]))
        axis = (b - a).normalized()
        normal = Vector((axis.z, 0, -axis.x))
        corners = []
        for y, top in [(floor, False), (0, True)]:
            for pos, sign in [(a, -1), (b, -1), (b, 1), (a, 1)]:
                p = pos + normal * (sign * width / 2)
                p.y = (topStart if pos is a else topEnd) if top else y
                corners.append(tuple(p))
        center = sum((Vector(p) for p in corners), Vector()) / 8
        for face in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                     (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]:
            points = [corners[i] for i in face]
            p, q, r = map(Vector, points[:3])
            mid = sum((Vector(v) for v in points), Vector()) / len(points)
            if (q - p).cross(r - p).dot(mid - center) < 0:
                points.reverse()
            self.Polygon(points, uvOffset=uvOffset, tint=tint)

    def Beam(self, a, b, width, depth):
        a, b = Vector(a), Vector(b)
        axis = (b - a).normalized()
        cross = Vector((1, 0, 0))
        if abs(axis.dot(cross)) > 0.95:
            cross = Vector((0, 0, 1))
        cross = (cross - axis * axis.dot(cross)).normalized()
        other = axis.cross(cross).normalized()
        self.Box((a + b) / 2, (width, depth, (b - a).length), (cross, other, axis))

    def Channel(self, a, b, width=0.17, depth=0.14):
        a, b = Vector(a), Vector(b)
        axis = (b - a).normalized()
        cross = Vector((1, 0, 0)) if abs(axis.x) < 0.95 else Vector((0, 0, 1))
        cross = (cross - axis * axis.dot(cross)).normalized()
        other = axis.cross(cross).normalized()
        center = (a + b) / 2
        length = (b - a).length
        self.Box(center, (0.02, depth, length), (cross, other, axis))
        for side in [-1, 1]:
            self.Box(center + other * side * (depth / 2 - 0.01), (width, 0.02, length), (cross, other, axis))

    def Rivet(self, center, normal, radius=0.016):
        center, normal = Vector(center), Vector(normal).normalized()
        u = normal.cross(Vector((0, 1, 0)))
        if u.length < 0.1:
            u = normal.cross(Vector((0, 0, 1)))
        u.normalize()
        v = normal.cross(u)
        sides = 8
        rings = []
        for height, r in [(0, radius), (radius * 0.819, radius * 0.574)]:
            rings.append([tuple(center + normal * height + (u * math.cos(i * math.tau / sides) + v * math.sin(i * math.tau / sides)) * r) for i in range(sides)])
        tip = tuple(center + normal * radius)
        def Radial(p):
            return tuple((Vector(p) - center).normalized())
        for i in range(sides):
            j = (i + 1) % sides
            points = [rings[0][i], rings[0][j], rings[1][j], rings[1][i]]
            self.Polygon(points, normals=[Radial(p) for p in points])
            points = [rings[1][i], rings[1][j], tip]
            self.Polygon(points, normals=[Radial(p) for p in points])

    def Cylinder(self, center, axis, radius, length, sides=12):
        center, axis = Vector(center), Vector(axis).normalized()
        u = axis.cross(Vector((0, 1, 0)))
        if u.length < 0.1:
            u = axis.cross(Vector((0, 0, 1)))
        u.normalize()
        v = axis.cross(u)
        rings = [[tuple(center + axis * sign * length / 2 + (u * math.cos(i * math.tau / sides) + v * math.sin(i * math.tau / sides)) * radius) for i in range(sides)] for sign in [-1, 1]]
        self.Polygon(list(reversed(rings[0])))
        self.Polygon(rings[1])
        for i in range(sides):
            j = (i + 1) % sides
            points = [rings[0][i], rings[0][j], rings[1][j], rings[1][i]]
            normals = []
            for p in points:
                delta = Vector(p) - center
                normals.append(tuple((delta - axis * delta.dot(axis)).normalized()))
            self.Polygon(points, normals=normals)

    def Object(self, name, material, parent=None, extras=None, tile=1, colorLayer=None):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([ToBlender(p) for p in self.vertices], [], self.faces)
        mesh.update()
        if any(self.smoothFaces):
            for polygon, smooth in zip(mesh.polygons, self.smoothFaces):
                polygon.use_smooth = smooth
            mesh.normals_split_custom_set([ToBlender(n) for n in self.normals])
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        mesh.materials.append(material)
        layer = mesh.uv_layers.new(name="UVMap")
        for loop, uv in zip(layer.data, self.uvs):
            loop.uv = (uv[0] / tile, uv[1] / tile)
        if colorLayer or any(color != (1, 1, 1, 1) for color in self.colors):
            tint = mesh.color_attributes.new(name=colorLayer or "StoneTint", type="FLOAT_COLOR", domain="CORNER")
            for corner, color in zip(tint.data, self.colors):
                corner.color = color
        obj.parent = parent
        for key, value in (extras or {}).items():
            obj[key] = value
        return obj


def Material(name, texture, roughness, metal=0, normalStrength=0.25, colorLayer=None, baseFactor=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metal
    base = nodes.new("ShaderNodeTexImage")
    base.image = bpy.data.images.load(str(PROJECT / "Texture" / f"Texture_{texture}Base.webp"), check_existing=True)
    if colorLayer:
        attribute = nodes.new("ShaderNodeVertexColor")
        attribute.layer_name = colorLayer
        # Blender 5.2 glTF exporter recognises vertex-color multiplication on
        # the current MIX/RGBA node, not the legacy MIX_RGB node.  Its explicit
        # color sockets (A_Color/B_Color) preserve the original Base texture
        # and export the per-stone factor as COLOR_0 instead of baking it away.
        multiply = nodes.new("ShaderNodeMix")
        multiply.data_type = "RGBA"
        multiply.blend_type = "MULTIPLY"
        multiply.inputs[0].default_value = 1
        links.new(base.outputs["Color"], multiply.inputs[6])
        links.new(attribute.outputs["Color"], multiply.inputs[7])
        links.new(multiply.outputs[2], shader.inputs["Base Color"])
    elif baseFactor:
        multiply = nodes.new("ShaderNodeMix")
        multiply.data_type = "RGBA"
        multiply.blend_type = "MULTIPLY"
        multiply.inputs[0].default_value = 1
        multiply.inputs[7].default_value = (*baseFactor, 1)
        links.new(base.outputs["Color"], multiply.inputs[6])
        links.new(multiply.outputs[2], shader.inputs["Base Color"])
    else:
        links.new(base.outputs["Color"], shader.inputs["Base Color"])
    normalPath = PROJECT / "Texture" / f"Texture_{texture}Normal.webp"
    if normalPath.exists():
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(normalPath), check_existing=True)
        tex.image.colorspace_settings.name = "Non-Color"
        normal = nodes.new("ShaderNodeNormalMap")
        normal.inputs["Strength"].default_value = normalStrength
        links.new(tex.outputs["Color"], normal.inputs["Color"])
        links.new(normal.outputs["Normal"], shader.inputs["Normal"])
    ormPath = PROJECT / "Texture" / f"Texture_{texture}Orm.webp"
    if ormPath.exists():
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(ormPath), check_existing=True)
        tex.image.colorspace_settings.name = "Non-Color"
        split = nodes.new("ShaderNodeSeparateColor")
        links.new(tex.outputs["Color"], split.inputs["Color"])
        links.new(split.outputs["Green"], shader.inputs["Roughness"])
        if texture == "BeishaheSteel":
            links.new(split.outputs["Blue"], shader.inputs["Metallic"])
        # glTF's occlusion channel is intentionally an independent input: it
        # affects indirect light, rather than baking darkness into albedo.
        outputGroup = bpy.data.node_groups.get("glTF Material Output")
        if outputGroup is None:
            outputGroup = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
            outputGroup.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
        gltfOutput = nodes.new("ShaderNodeGroup")
        gltfOutput.node_tree = outputGroup
        links.new(split.outputs["Red"], gltfOutput.inputs["Occlusion"])
    return mat


def PolishedRailMaterial():
    """Clean steel at the wheel contact patch; geometry is a narrow top strip."""
    mat = bpy.data.materials.new("BeishaheRailRunning")
    mat.use_nodes = True
    mat.use_backface_culling = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (0.24, 0.25, 0.26, 1)
    shader.inputs["Metallic"].default_value = 0.93
    shader.inputs["Roughness"].default_value = 0.26
    return mat


def Empty(name):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    return obj


def BuildSleepers(length, count, seed):
    """Three deterministic UV/edge variants retain identical gauge and datum."""
    timber, endTimber = Geometry(), Geometry()
    rng = random.Random(seed)
    for k in range(count):
        z = -length / 2 + (k + 0.5) * length / count
        uvOffset = (rng.uniform(0, 7), rng.uniform(0, 7))
        bevel = rng.uniform(0.005, 0.010)
        timber.BeveledBox((0, -0.08, z), (SPEC["sleeperLengthM"], 0.16, SPEC["sleeperWidthM"]),
                          bevel, uvOffset=uvOffset, grain="sleeper", endGeometry=endTimber)
    return timber, endTimber


def DeckEdgeProfile(rng):
    """Natural edge-to-edge variation, shared by the three pieces of a row."""
    low = rng.uniform(.55, .78)
    high = max(.55, min(.78, low + rng.uniform(-.035, .035)))
    lowWidth = rng.uniform(.010, .018)
    highWidth = max(.010, min(.018, lowWidth + rng.uniform(-.0015, .0015)))
    return (low, high, lowWidth, highWidth)


def BuildDeck(length, count, seed):
    """Transverse solid planks on lengthwise bearers, with rail-foot relief.

    The three main strips and four narrow rail-edge strips cover the full
    2.8 m sleeper width except the actual two steel rail-foot footprints and
    1 mm lateral clearances. Each transverse board is physically separated into
    three large pieces at the two tracks. The four narrow lengthwise edge
    pieces are relieved at spike heads and butt against their adjacent pieces.
    This remains an authored deck design, not a claim about the 1938 original.
    """
    planks, bearers = Geometry(), Geometry()
    rng = random.Random(seed + 61973)
    tintRng = random.Random(seed + 39113)
    edgeRng = random.Random(seed + 88421)
    sleeperZ = [-length / 2 + (k + .5) * length / count for k in range(count)]
    railX = (SPEC["gaugeM"] + SPEC["railHeadWidthM"]) / 2
    # Rails have 130 mm feet, wider than the 65 mm heads. The small additional
    # gaps give the model's foot, fishplates and individual spike heads room.
    footEdge, bufferOuter = .066, .115
    zones = [(-SPEC["sleeperLengthM"] / 2, -railX - bufferOuter),
             (-railX + bufferOuter, railX - bufferOuter),
             (railX + bufferOuter, SPEC["sleeperLengthM"] / 2)]
    boardCount = math.ceil(length / .225)
    widthRng = random.Random(seed + 34129)
    weights = [widthRng.uniform(.92, 1.08) for _ in range(boardCount)]
    scale = length / sum(weights)
    rowBoundaries = [-length / 2]
    for weight in weights:
        rowBoundaries.append(rowBoundaries[-1] + weight * scale)
    rowBoundaries[-1] = length / 2
    rowTints = []
    for row in range(boardCount):
        z0 = rowBoundaries[row] + (.003 if row else 0)
        z1 = rowBoundaries[row + 1] - (.003 if row < boardCount - 1 else 0)
        # The three pieces are one board visually: same tint and the same
        # spatial texture phase across the two track slots.
        value = tintRng.uniform(.64, .99)
        warmth = tintRng.uniform(.008, .035)
        rowTint = (min(1.0, value * .96 * (1 + warmth)), value * .91, value * .83 * (1 - warmth * .8), 1)
        rowTints.append(rowTint)
        rowOffset = (rng.uniform(0, 7), rng.uniform(0, 7))
        rowEdges = DeckEdgeProfile(edgeRng)
        for x0, x1 in zones:
            # The generated material's V axis follows each board's actual X
            # length; its top chamfer catches light while the base stays flat.
            planks.TopBeveledBox(((x0 + x1) / 2, .0525, (z0 + z1) / 2),
                                 (x1 - x0, .045, z1 - z0), .003,
                                 uvOffset=rowOffset, grain="sleeper", tint=rowTint, edgeProfile=rowEdges)
    def TintAt(z):
        row = max(0, min(boardCount - 1, bisect.bisect_right(rowBoundaries, z) - 1))
        return rowTints[row]
    # Along each foot, retain enough wood for a walking surface without ever
    # crossing the foot. At tie plates the underside rises to Y=.042 and
    # openings expose both spike heads; the back strip joins adjacent boards.
    for rail in [-railX, railX]:
        for face in [-1, 1]:
            xa, xb = sorted((rail + face * footEdge, rail + face * bufferOuter))
            uvOffset = (rng.uniform(0, 7), rng.uniform(0, 7))
            cursor = -length / 2
            for z in sleeperZ:
                a, b = z - .1005, z + .1005
                if a > cursor:
                    planks.Box(((xa + xb) / 2, .0525, (cursor + a) / 2),
                               (xb - xa, .045, a - cursor), uvOffset=uvOffset, grain="deck", tint=TintAt((cursor + a) / 2))
                # Expose both dog-spike heads by cutting their projection out
                # of the rail-facing 23 mm strip, with 1.5 mm extra clearance.
                # The remaining 26 mm back strip still bridges to its neighbours.
                frontA, frontB = sorted((rail + face * footEdge, rail + face * .089))
                backA, backB = sorted((rail + face * .089, rail + face * bufferOuter))
                capTint = TintAt(z)
                planks.Box(((backA + backB) / 2, .0585, (a + b) / 2),
                           (backB - backA, .033, b - a), uvOffset=uvOffset, grain="deck", tint=capTint)
                for za, zb in [(a, z - .069), (z - .041, z + .041), (z + .069, b)]:
                    planks.Box(((frontA + frontB) / 2, .0585, (za + zb) / 2),
                               (frontB - frontA, .033, zb - za), uvOffset=uvOffset, grain="deck", tint=capTint)
                cursor = b
            if cursor < length / 2:
                planks.Box(((xa + xb) / 2, .0525, (cursor + length / 2) / 2),
                           (xb - xa, .045, length / 2 - cursor), uvOffset=uvOffset, grain="deck", tint=TintAt((cursor + length / 2) / 2))
    # Four principal bearers and four narrow ledges run in Z on top of the
    # sleepers. Their tops meet the transverse planks; rail plates stay clear.
    for x in [-1.25, -.40, .40, 1.25]:
        bearers.Box((x, .015, 0), (.10, .03, length),
                    uvOffset=(rng.uniform(0, 7), rng.uniform(0, 7)), grain="deck")
    for rail in [-railX, railX]:
        for face in [-1, 1]:
            bearers.Box((rail + face * .12, .015, 0), (.02, .03, length),
                        uvOffset=(rng.uniform(0, 7), rng.uniform(0, 7)), grain="deck")
    return planks, bearers


def BuildGuardTimbers(length, count):
    """Authored outside longitudinal timbers on the continuous wooden deck.

    A 1941 photograph records outside timbers on an unidentified Jinpu
    railway bridge, but cannot establish the Beishahe bridge's exact details.
    The low top stays below the rail head; through-bolts reach the sleepers.
    """
    timber, bolts = Geometry(), Geometry()
    half = length / 2
    segments = 5
    for side in [-1, 1]:
        x = side * 1.25
        for k in range(segments):
            start = -half + k * length / segments + (.001 if k else 0)
            end = -half + (k + 1) * length / segments - (.001 if k < segments - 1 else 0)
            timber.BeveledBox((x, .105, (start + end) / 2), (.14, .06, end - start), .004,
                              uvOffset=(side * 2.37, k * 1.13), grain="deck")
        for k in range(count):
            z = -half + (k + .5) * length / count
            # The 8 mm shaft passes through guard, deck, bearer and sleeper.
            # A flush top washer stays below the running rail head at .14 m.
            bolts.Cylinder((x, -.014, z), (0, 1, 0), .008, .298, sides=8)
            bolts.Cylinder((x, .134, z), (0, 1, 0), .017, .002, sides=8)
            bolts.Cylinder((x, -.166, z), (0, 1, 0), .018, .006, sides=8)
    return timber, bolts


def RailProfile(x):
    """Shared flat-bottom profile: both span rails and pier joints match."""
    return [(x + px, py) for px, py in [(-0.065, 0.010), (0.065, 0.010),
            (0.065, 0.025), (0.012, 0.037), (0.009, 0.100),
            (0.0325, 0.108), (0.0325, 0.128), (0.027, 0.140),
            (-0.027, 0.140), (-0.0325, 0.128), (-0.0325, 0.108),
            (-0.009, 0.100), (-0.012, 0.037), (-0.065, 0.025)]]


def BuildRailJointHardware(railSplice, railFasteners, x, centerZ):
    """Two web-contacting splice plates with four represented through bolts.

    The bolt shafts are represented as solid overlapping geometry through the
    solid rail web and plates; drilled holes are not modeled. Locations and
    plate dimensions are authored rather than evidence for this bridge.
    """
    webSlope = .003 / .063
    lowY, highY = .048, .096
    lowHalf = .012 - (lowY - .037) * webSlope
    highHalf = .012 - (highY - .037) * webSlope
    for face in [-1, 1]:
        profile = [(x + face * lowHalf, lowY), (x + face * (lowHalf + .012), lowY),
                   (x + face * (highHalf + .012), highY), (x + face * highHalf, highY)]
        if face < 0:
            profile.reverse()
        railSplice.ExtrudedProfile(profile, centerZ - .18, centerZ + .18)
    boltY = .072
    outerHalf = .012 - (boltY - .037) * webSlope + .012
    for dz in [-.13, -.055, .055, .13]:
        z = centerZ + dz
        # The shaft and web overlap intentionally: this visual asset has no
        # cut-out holes. Six-sided heads/nuts touch the outer plate faces.
        railFasteners.Cylinder((x, boltY, z), (1, 0, 0), .006, 2 * outerHalf, sides=8)
        for face in [-1, 1]:
            railFasteners.Cylinder((x + face * (outerHalf + .003), boltY, z), (1, 0, 0), .009, .006, sides=6)


def BuildPierTransition(seed):
    """Physical deck and rail-joint connection over a 120 mm truss gap.

    The wood insert still leaves 2 mm clearance at each span end. Rail ends
    extend from their spans to a single 6 mm joint at the support axis; there
    is no artificial 116 mm rail insert. This alignment is a design inference.
    """
    railSplice, railFasteners, deck, support, splice, bolts, guard, guardSplice, guardBolts = [Geometry() for _ in range(9)]
    rng = random.Random(seed + 71783)
    gapHalf = SPEC["expansionGapM"] / 2
    clearance = .002
    half = gapHalf - clearance
    railX = (SPEC["gaugeM"] + SPEC["railHeadWidthM"]) / 2
    for side in [-1, 1]:
        BuildRailJointHardware(railSplice, railFasteners, side * railX, 0)
    # One short transverse deck board with two rail slots, aligned with the
    # visible deck above each span. No spike lies within this central strip.
    value, warmth = rng.uniform(.86, .99), rng.uniform(.008, .035)
    tint = (min(1.0, value * .96 * (1 + warmth)), value * .91, value * .83 * (1 - warmth * .8), 1)
    uvOffset = (rng.uniform(0, 7), rng.uniform(0, 7))
    edgeProfile = DeckEdgeProfile(rng)
    bufferOuter, footEdge = .115, .066
    zones = [(-SPEC["sleeperLengthM"] / 2, -railX - bufferOuter),
             (-railX + bufferOuter, railX - bufferOuter),
             (railX + bufferOuter, SPEC["sleeperLengthM"] / 2)]
    for x0, x1 in zones:
        deck.TopBeveledBox(((x0 + x1) / 2, .0525, 0), (x1 - x0, .045, 2 * half), .003,
                           uvOffset=uvOffset, grain="sleeper", tint=tint, edgeProfile=edgeProfile)
    for rail in [-railX, railX]:
        for sign in [-1, 1]:
            xa, xb = sorted((rail + sign * footEdge, rail + sign * bufferOuter))
            deck.Box(((xa + xb) / 2, .0525, 0), (xb - xa, .045, 2 * half),
                     uvOffset=uvOffset, grain="sleeper", tint=tint)
    for side in [-1, 1]:
        x = side * 1.25
        guard.BeveledBox((x, .105, 0), (.14, .06, 2 * half), .004,
                         uvOffset=(side * 2.37, 0), grain="deck")
        # Side plates bridge both 2 mm end clearances and transfer load into
        # the guard timber on each neighbouring span.
        for face in [-1, 1]:
            guardSplice.Box((x + face * .075, .105, 0), (.01, .03, .36))
        for z in [-.13, 0, .13]:
            guardBolts.Cylinder((x, .105, z), (1, 0, 0), .006, .16, sides=8)
            for face in [-1, 1]:
                guardBolts.Cylinder((x + face * .083, .105, z), (1, 0, 0), .012, .006, sides=8)
    # A separate support occupies only the structural opening, touching the
    # existing wooden bearers at both ends; its bolted steel plate extends
    # 120 mm under each neighbour and stops before the nearest sleepers.
    beamPositions = [(x, .10) for x in [-1.25, -.40, .40, 1.25]]
    beamPositions += [(rail + sign * .12, .02) for rail in [-railX, railX] for sign in [-1, 1]]
    for x, width in beamPositions:
        support.Box((x, .015, 0), (width, .03, 2 * gapHalf), uvOffset=uvOffset, grain="deck")
        splice.Box((x, -.0075, 0), (width * .90, .015, .36))
        for z in [-.115, .115]:
            bolts.Cylinder((x, .006, z), (0, 1, 0), .005, .042, sides=8)
            bolts.Cylinder((x, -.018, z), (0, 1, 0), .009, .006, sides=8)
    return {"RailJointSplice": railSplice, "RailJointFasteners": railFasteners,
            "DeckJoint": deck, "DeckJointSupport": support, "DeckJointSplice": splice,
            "DeckJointBolts": bolts, "GuardJoint": guard,
            "GuardJointSplice": guardSplice, "GuardJointBolts": guardBolts}


def BuildSpan():
    length = SPEC["spanPitchM"] - SPEC["expansionGapM"]
    n = SPEC["panelsPerSpan"]
    step = length / n
    zs = [-length / 2 + i * step for i in range(n + 1)]
    y0, y1 = SPEC["trussBottomY"], SPEC["trussTopY"]
    halfW = SPEC["trussCenterOffsetM"]
    steel, fasteners, west, east, shoes, railWear, railMidSplice, railMidFasteners = [Geometry() for _ in range(8)]
    count = math.ceil(length / SPEC["sleeperSpacingM"])
    timber, endTimber = BuildSleepers(length, count, 1938)
    deck, deckBearers = BuildDeck(length, count, 1938)
    guards, guardFasteners = BuildGuardTimbers(length, count)

    def BuiltMember(a, b, width, depth):
        """Paired open channels joined at intervals by small riveted lacing plates."""
        a, b = Vector(a), Vector(b)
        for sign in [-1, 1]:
            offset = Vector((sign * 0.070, 0, 0))
            steel.Channel(a + offset, b + offset, width, depth)
        for step in range(1, 6):
            p = a.lerp(b, step / 6)
            steel.Beam((p.x - 0.105, p.y, p.z), (p.x + 0.105, p.y, p.z), 0.035, 0.018)
    # Straight low upper chord, sloping end posts, alternating diagonals with verticals.
    # No portal or cross bracing above the open track (pony truss).
    for side in [-1, 1]:
        x = side * halfW
        steel.Channel((x, y0, zs[0]), (x, y0, zs[-1]), 0.22, 0.28)
        steel.Channel((x, y1, zs[1]), (x, y1, zs[-2]), 0.24, 0.23)
        steel.Box((x, y1 + 0.13, 0), (0.29, 0.03, zs[-2] - zs[1]))
        # Continuous cheek plates give both rivet rows a real bearing surface.
        for faceSign in [-1, 1]:
            steel.Box((x + faceSign * 0.115, y0, 0), (0.02, 0.18, length))
            steel.Box((x + faceSign * 0.130, y1, 0), (0.02, 0.16, zs[-2] - zs[1]))
        for k in range(n):
            if k == 0:
                a, b = (x, y0, zs[0] + .06), (x, y1, zs[1])
            elif k == n - 1:
                a, b = (x, y1, zs[-2]), (x, y0, zs[-1] - .06)
            elif k % 2:
                a, b = (x, y1, zs[k]), (x, y0, zs[k + 1])
            else:
                a, b = (x, y0, zs[k]), (x, y1, zs[k + 1])
            BuiltMember(a, b, 0.11, 0.15)
        for k in range(1, n):
            BuiltMember((x, y0, zs[k]), (x, y1, zs[k]), 0.09, 0.12)
        # Paired, 12 mm thick gusset plates and regular groups of real rivets.
        nodeCenters = [z + (.20 if k == 0 else -.20 if k == n else 0) for k, z in enumerate(zs)]
        for k, z in enumerate(nodeCenters):
            for yy in ([y0, y1] if 0 < k < n else [y0]):
                for outward in [-1, 1]:
                    contact = 0.125 if yy == y0 else 0.140
                    xx = x + outward * (contact + 0.006)
                    p = [(xx, yy - 0.13, z - 0.20), (xx, yy + 0.18, z - 0.13), (xx, yy + 0.20, z + 0.13), (xx, yy - 0.13, z + 0.20)]
                    if outward < 0:
                        p.reverse()
                    steel.Plate(p, (outward, 0, 0), 0.012)
                    for dz in [-0.10, 0, 0.10]:
                        for dy in [-0.07, 0.07]:
                            fasteners.Rivet((xx + outward * 0.006, yy + dy, z + dz), (outward, 0, 0), 0.014)
        # Paired rows on both exposed faces, at roughly 0.21 m. The feet are
        # seated exactly on the cheek plates and skip each gusset's footprint.
        rivetCount = int(length / 0.21)
        for k in range(rivetCount):
            z = -length / 2 + (k + 0.5) * length / rivetCount
            if any(abs(z - nodeZ) < 0.22 for nodeZ in nodeCenters):
                continue  # Node plates own their own, denser rivet groups.
            for faceSign in [-1, 1]:
                for dy in [-0.05, 0.05]:
                    fasteners.Rivet((x + faceSign * 0.125, y0 + dy, z), (faceSign, 0, 0), 0.013)
                if zs[1] < z < zs[-2]:
                    for dy in [-0.045, 0.045]:
                        fasteners.Rivet((x + faceSign * 0.140, y1 + dy, z), (faceSign, 0, 0), 0.013)
    # Floor beams, two rail stringers, below-deck X bracing.
    for k, z in enumerate(zs):
        if k == 0:
            z += .08
        elif k == n:
            z -= .08
        steel.Channel((-halfW, -0.40, z), (halfW, -0.40, z), 0.16, 0.32)
    for side in [-1, 1]:
        steel.Channel((side * 0.75, -0.29, zs[0]), (side * 0.75, -0.29, zs[-1]), 0.14, 0.22)
        steel.Box((side * 0.75, -0.17, 0), (0.16, 0.02, length))
    for k in range(n):
        for s in [-1, 1]:
            startZ = zs[k] + (.03 if k == 0 else 0)
            endZ = zs[k + 1] - (.03 if k == n - 1 else 0)
            steel.Beam((s * halfW, -0.57, startZ), (-s * halfW, -0.57, endZ), 0.055, 0.018)
    # Sleepers carry the continuous transverse decking; gauge is INNER head-face distance.
    railX = (SPEC["gaugeM"] + SPEC["railHeadWidthM"]) / 2
    for k in range(count):
        z = -length / 2 + (k + 0.5) * length / count
        for side in [-1, 1]:
            x = side * railX
            # Rail-foot lower face is Y=.010; the steel tie plate rests on
            # the sleeper and touches that face without a solid overlap.
            steel.Box((x, 0.005, z), (0.22, 0.010, 0.20))
            # Dog spikes: the head overlaps the rail foot, the shaft enters timber.
            for dx in [-1, 1]:
                for dz in [-0.055, 0.055]:
                    fasteners.Box((x + dx * 0.086, 0.02, z + dz), (0.014, 0.04, 0.014))
                    headX = x + dx * 0.069
                    headProfile = [(headX - 0.0185, 0.024), (headX + 0.0185, 0.024),
                                   (headX + 0.0185, 0.036), (headX + 0.015, 0.042),
                                   (headX - 0.015, 0.042), (headX - 0.0185, 0.036)]
                    fasteners.ExtrudedProfile(headProfile, z + dz - 0.0125, z + dz + 0.0125)
    for rail, side in [(west, -1), (east, 1)]:
        x = side * railX
        # Flat-bottom rail, with tapered web and rounded-head facets. The
        # broadest head points retain the exact 1.435 m inner-face gauge.
        railHalfGap = SPEC["railJointGapM"] / 2
        # Each half spans roughly ten metres. Ends extend 57 mm beyond the
        # truss end; neighbouring rails meet at a 6 mm gap on the support axis.
        railEnd = SPEC["spanPitchM"] / 2 - railHalfGap
        for z0, z1 in [(-railEnd, -railHalfGap), (railHalfGap, railEnd)]:
            rail.ExtrudedProfile(RailProfile(x), z0, z1)
            railWear.Box((x, 0.1404, (z0 + z1) / 2), (0.044, 0.0008, z1 - z0))
        BuildRailJointHardware(railMidSplice, railMidFasteners, x, 0)
        # The wheel contact patch is bare polished steel; the head sides retain
        # weathered steel texture. Thin geometry, no baked highlight in albedo.
    # One fixed/one expansion bearing on each side; four load paths per span.
    bearingCenters = []
    for end in [-1, 1]:
        for side in [-1, 1]:
            x, z = side * halfW, end * (length / 2 - 0.20)
            shoes.Box((x, -0.995, z), (0.52, 0.05, 0.62))
            if end < 0:
                # Fixed rocker's transverse pin; cast shoe bears on the top plate.
                shoes.Cylinder((x, -0.90, z), (1, 0, 0), 0.070, 0.36)
                shoes.Box((x, -0.80, z), (0.32, 0.14, 0.34))
            else:
                # Expansion-end rollers, transverse to the bridge, not modern rubber pads.
                for dz in [-0.15, 0, 0.15]:
                    shoes.Cylinder((x, -0.91, z + dz), (1, 0, 0), 0.060, 0.35)
                shoes.Box((x, -0.79, z), (0.40, 0.16, 0.52))
            shoes.Box((x, -0.72, z), (0.30, 0.06, 0.44))
            for dx in [-0.20, 0.20]:
                fasteners.Rivet((x + dx, -0.963, z + 0.22), (0, 1, 0), 0.026)
            bearingCenters.append([x, SPEC["bearingTopY"], z])
    return {"Trusses": steel, "Rivets": fasteners, "Sleepers": timber, "SleeperEnds": endTimber,
            "DeckPlanks": deck, "DeckBearers": deckBearers, "GuardTimbers": guards, "GuardFasteners": guardFasteners,
            "RailWest": west, "RailEast": east, "RailWear": railWear,
            "RailMidSplice": railMidSplice, "RailMidFasteners": railMidFasteners, "Bearings": shoes}, bearingCenters


def StoneTint(rng, damp=0):
    """Subtle cool/warm stone variation and occasional muted sediment tint.

    Lower-course damp is artistic weathering, not a measured 1938 waterline.
    Each block uses one constant color; no artificial joints are painted.
    """
    value = rng.uniform(0.86, 1.0)
    warmth = rng.uniform(-0.04, 0.04)
    red = min(1.0, value * (1 + warmth) + 0.008 * damp)
    green = max(0.80, min(1.0, value * (1 - abs(warmth) * 0.12) - 0.018 * damp))
    blue = max(0.80, min(1.0, value * (1 - warmth) - 0.060 * damp))
    return (red, green, blue, 1)


def PierTint(baseTint, floor, course, seed, damp):
    """Continuous spatial transition; no inferred historical water level.

    Two lower courses read as continuous damp stone; the third fades up into
    the dry material. The first dry course similarly fades from a darker lower
    edge to its natural per-block variation. A smooth low-amplitude world-space
    perturbation prevents a perfectly straight manufactured stain line.
    """
    def Smooth(value):
        t = max(0.0, min(1.0, value))
        return t * t * (3 - 2 * t)

    def Color(point):
        x, y, z = point
        wobble = .007 * math.sin(x * .9 + z * .5 + seed * .013) + .004 * math.sin(z * .75 - x * .4)
        if damp:
            t = Smooth((y - floor) / (3 * course))
            value = .82 + .18 * t + wobble
            warm = .012 * (1 - t)
            # Per-block stone color fades out at the wet/dry transition so
            # the continuous damp gradient does not acquire a hard stripe.
            # baseTint is shared by each solid block; no joints are painted.
            tintStrength = .70 * (1 - Smooth((t - .55) / .45))
            rgb = tuple(channel + (baseTint[i] - .93) * tintStrength
                        for i, channel in enumerate(
                            (value + warm, value - warm * .3, value - warm)))
        else:
            t = Smooth((y - (floor + 3 * course)) / (1.1 * course))
            rgb = tuple(.72 + t * (baseTint[c] - .72) + wobble * t for c in range(3))
        lower = .70 if not damp else .781
        return tuple(max(lower, min(1.0, channel)) for channel in rgb) + (1,)
    return Color


def BuildPier(seed=1938):
    stone, dampStone, cap = Geometry(), Geometry(), Geometry()
    rng = random.Random(seed)
    tintRng = random.Random(seed + 70241)
    turnRng = random.Random(seed + 21817)
    floor, top = SPEC["foundationY"], SPEC["pierTopY"]
    courses = 9
    ch = (top - floor - 0.25) / courses
    # Continuous inset core closes all horizontal joints without sealing the
    # stone faces flat. Its top touches the cap's underside at top - 0.25.
    # A single core avoids coplanar/overlapping per-course internal surfaces.
    stone.Box((0, (floor + top - 0.25) / 2, 0), (3.70, top - floor - 0.25, 1.65),
              tint=(0.88, 0.875, 0.86, 1))
    # Real masonry courses with small joints; flow direction is X.
    for row in range(courses):
        y = floor + (row + 0.5) * ch
        taper = (row + 0.5) / courses
        halfx, halfz = 2.18 - 0.23 * taper, 1.02 - 0.12 * taper
        countx, countz = 6, 3
        for side in [-1, 1]:
            for k in range(-1, countx + 1):
                cell = 2 * halfx / countx
                left = max(-halfx, -halfx + (k + (row % 2) * 0.5) * cell)
                right = min(halfx, -halfx + (k + 1 + (row % 2) * 0.5) * cell)
                if right - left > 0.04:
                    damp = row < 3
                    target = dampStone if damp else stone
                    # Keep a real overlap with the inset core while stopping
                    # short of the staggered end-face joints at each corner.
                    target.BeveledBox(((left + right) / 2, y + rng.uniform(-0.005, 0.005), side * (halfz - 0.135)),
                        (right - left - 0.014, ch - 0.014, 0.29 + rng.uniform(-0.010, 0.010)),
                        rng.uniform(0.006, 0.014), uvOffset=(rng.uniform(0, 8), rng.uniform(0, 8)),
                        tint=PierTint(StoneTint(tintRng), floor, ch, seed, damp), uvTurn=turnRng.randrange(4))
            # Stagger the shorter faces as well. End blocks are clipped at
            # the corners, as on the longer face, and the inset core is kept.
            for k in range(-1, countz + 1):
                cell = 2 * halfz / countz
                left = max(-halfz, -halfz + (k + (row % 2) * 0.5) * cell)
                right = min(halfz, -halfz + (k + 1 + (row % 2) * 0.5) * cell)
                if right - left <= 0.04:
                    continue
                damp = row < 3
                target = dampStone if damp else stone
                target.BeveledBox((side * (halfx - 0.20), y, (left + right) / 2), (0.42, ch - 0.014, right - left - 0.014),
                                 rng.uniform(0.006, 0.014), uvOffset=(rng.uniform(0, 8), rng.uniform(0, 8)),
                                 tint=PierTint(StoneTint(tintRng), floor, ch, seed, damp), uvTurn=turnRng.randrange(4))
    cap.BeveledBox((0, top - 0.125, 0), (4.55, 0.25, 2.25), 0.018,
                   uvOffset=(rng.uniform(0, 8), rng.uniform(0, 8)), tint=StoneTint(tintRng))
    stone.BeveledBox((0, floor - 0.13, 0), (4.7, 0.26, 2.7), 0.018,
                     uvOffset=(rng.uniform(0, 8), rng.uniform(0, 8)), tint=StoneTint(tintRng))
    return stone, dampStone, cap


def BuildAbutment():
    geo = Geometry()
    top, floor = SPEC["pierTopY"], SPEC["foundationY"]
    rng = random.Random(193807)
    tintRng = random.Random(193807 + 70241)
    turnRng = random.Random(193807 + 21817)
    rows = 10
    # Solid backing is recessed behind both masonry faces and their joints.
    # The joints remain visible while small gaps between individual facing
    # blocks cannot create holes through the load-bearing abutment.
    geo.Box((0, (floor + top) / 2, 0.45), (5.95, top - floor - 0.02, 1.35),
            uvOffset=(rng.uniform(0, 8), rng.uniform(0, 8)), tint=(0.88, 0.875, 0.86, 1))
    for row in range(rows):
        h = (top - floor) / rows
        for col in range(8):
            geo.BeveledBox((-3 + (col + 0.5) * 0.75, floor + (row + 0.5) * h, 0.45), (0.735, h - 0.014, 1.5),
                           rng.uniform(0.006, 0.014), uvOffset=(rng.uniform(0, 8), rng.uniform(0, 8)), tint=StoneTint(tintRng),
                           uvTurn=turnRng.randrange(4))
    geo.BeveledBox((0, top - 0.11, 0.45), (6.25, 0.22, 1.65), 0.018,
                   uvOffset=(rng.uniform(0, 8), rng.uniform(0, 8)), tint=StoneTint(tintRng))
    # Continuous sloping wing walls, with small separately spaced stone faces.
    for side in [-1, 1]:
        start, end = (side * 2.85, 0.80), (side * 4.52, 3.70)
        endTop = top - 1.55
        geo.WedgeWall(start, end, 0.62, floor, top, endTop,
                      uvOffset=(rng.uniform(0, 8), rng.uniform(0, 8)), tint=(0.88, 0.875, 0.86, 1))
        axis = Vector((end[0] - start[0], 0, end[1] - start[1]))
        wallLength = axis.length
        axis.normalize()
        normal = Vector((axis.z, 0, -axis.x))
        # Pair the two facades to the wedge, staggering every alternate course.
        for faceSign in [-1, 1]:
            for row in range(9):
                y0 = floor + row * (top - floor) / 9 + 0.012
                y1 = floor + (row + 1) * (top - floor) / 9 - 0.012
                for k in range(-1, 7):
                    t0 = max(0, (k + (row % 2) * 0.5) / 6)
                    t1 = min(1, (k + 1 + (row % 2) * 0.5) / 6)
                    if t1 - t0 < 0.03:
                        continue
                    t = (t0 + t1) / 2
                    surfaceTop = min(top + (endTop - top) * t0, top + (endTop - top) * t1) - 0.015
                    h = min(y1, surfaceTop) - y0
                    if h < 0.025:
                        continue
                    point = Vector((start[0], y0 + h / 2, start[1])) + axis * (wallLength * t) + normal * (faceSign * 0.31)
                    geo.Box(point, (0.035, h, wallLength * (t1 - t0) - 0.014),
                            basis=(normal, (0, 1, 0), axis), uvOffset=(rng.uniform(0, 8), rng.uniform(0, 8)),
                            tint=StoneTint(tintRng), uvTurn=turnRng.randrange(4))
    return geo


def Rebuild():
    task = bpy.context.scene.get("BlenderMcpTask")
    existing = bpy.data.filepath
    if existing and SOURCE.resolve() not in Path(existing).resolve().parents:
        raise RuntimeError("Refusing to replace a Blender scene outside this bridge source directory: " + existing)
    if task not in (None, "BeishaheBridge"):
        raise RuntimeError("This BlenderMCP scene belongs to another task: " + str(task))
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for database in [bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights]:
        for block in list(database):
            if block.users == 0:
                database.remove(block)
    # The owned .blend may carry packed images from the previous revision.
    # Their pixels survive on disk path names even when the PBR bake changed,
    # so discard only orphaned FILE images before loading fresh source maps.
    for image in list(bpy.data.images):
        if image.source == "FILE" and image.users == 0:
            bpy.data.images.remove(image)
    scene = bpy.context.scene
    scene["BlenderMcpTask"] = "BeishaheBridge"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1
    steel = Material("BeishaheSteel", "BeishaheSteel", 0.82, 0.25, 0.58)
    railBody = Material("BeishaheRailBody", "BeishaheSteel", 0.82, 0.25, 0.58, baseFactor=(.58, .58, .58))
    wood = Material("BeishaheTimber", "BeishaheSleeper", 0.91, 0, 0.90)
    endWood = Material("BeishaheTimberEnd", "BeishaheSleeperEnd", 0.91, 0, 0.90)
    deckWood = Material("BeishaheDeckTimber", "BeishaheDeckPlank", 0.90, 0, 0.90, colorLayer="DeckTint")
    stone = Material("BeishaheStone", "BeishahePierStone", 0.94, 0, 0.65, colorLayer="StoneTint")
    dampStone = Material("BeishaheStoneDamp", "BeishahePierDamp", 0.92, 0, 0.65, colorLayer="StoneTint")
    railRunning = PolishedRailMaterial()
    root = Empty("BeishaheBridge")
    root["reconstructionScope"] = SPEC["reconstructionScope"]
    root["assetVersion"] = SPEC["version"]
    spans, bearingTemplate = BuildSpan()
    templates = {}
    for role, geo in spans.items():
        mat = {"Sleepers": wood, "SleeperEnds": endWood, "DeckPlanks": deckWood, "GuardTimbers": wood,
               "RailWest": railBody, "RailEast": railBody, "RailMidSplice": railBody,
               "DeckBearers": deckWood, "RailWear": railRunning}.get(role, steel)
        colorLayer = "DeckTint" if role in ("DeckPlanks", "DeckBearers") else None
        templates[role] = geo.Object("Template_" + role, mat, tile=1, colorLayer=colorLayer)
    sleeperTemplates = [(templates["Sleepers"], templates["SleeperEnds"])]
    deckTemplates = [(templates["DeckPlanks"], templates["DeckBearers"])]
    sleeperLength = SPEC["spanPitchM"] - SPEC["expansionGapM"]
    sleeperCount = math.ceil(sleeperLength / SPEC["sleeperSpacingM"])
    for variant in range(1, 3):
        body, ends = BuildSleepers(sleeperLength, sleeperCount, 1938 + variant * 971)
        sleeperTemplates.append((body.Object(f"Template_Sleepers_{variant}", wood),
                                 ends.Object(f"Template_SleeperEnds_{variant}", endWood)))
        boards, bearers = BuildDeck(sleeperLength, sleeperCount, 1938 + variant * 971)
        deckTemplates.append((boards.Object(f"Template_DeckPlanks_{variant}", deckWood, colorLayer="DeckTint"),
                              bearers.Object(f"Template_DeckBearers_{variant}", deckWood, colorLayer="DeckTint")))
    assemblies = []
    for i in range(SPEC["spanCount"]):
        z = -SPEC["lengthM"] / 2 + SPEC["spanPitchM"] * (i + 0.5)
        parent = Empty(f"Intact_Span{i + 1:02d}")
        parent.parent = root
        parent.location = ToBlender((0, 0, z))
        parent["role"], parent["spanIndex"] = "span", i
        for role, template in templates.items():
            if role == "Sleepers":
                template = sleeperTemplates[i % len(sleeperTemplates)][0]
            elif role == "SleeperEnds":
                template = sleeperTemplates[i % len(sleeperTemplates)][1]
            elif role == "DeckPlanks":
                template = deckTemplates[i % len(deckTemplates)][0]
            elif role == "DeckBearers":
                template = deckTemplates[i % len(deckTemplates)][1]
            obj = bpy.data.objects.new(f"Intact_Span{i + 1:02d}_{role}", template.data)
            bpy.context.collection.objects.link(obj)
            obj.parent = parent
            obj["role"], obj["spanIndex"] = role, i
        assemblies.append({"id": parent.name, "spanIndex": i, "centerZ": z, "bearings": [[x, y, zz + z] for x, y, zz in bearingTemplate]})
    for obj in list(templates.values()) + [obj for pair in sleeperTemplates[1:] for obj in pair] + [obj for pair in deckTemplates[1:] for obj in pair]:
        bpy.data.objects.remove(obj, do_unlink=True)
    pierTemplates = []
    for variant in range(3):
        pier, damp, cap = BuildPier(1938 + variant * 997)
        pierTemplates.append((pier.Object(f"Template_Pier_{variant}", stone, tile=1.0),
                              damp.Object(f"Template_PierDamp_{variant}", dampStone, tile=1.0),
                              cap.Object(f"Template_Cap_{variant}", stone, tile=1.0)))
    for i in range(1, SPEC["spanCount"]):
        z = -SPEC["lengthM"] / 2 + i * SPEC["spanPitchM"]
        pierTemplate, dampTemplate, capTemplate = pierTemplates[(i - 1) % len(pierTemplates)]
        for role, template in [("Pier", pierTemplate), ("PierDamp", dampTemplate), ("Cap", capTemplate)]:
            obj = bpy.data.objects.new(f"Shared_{role}{i:02d}", template.data)
            bpy.context.collection.objects.link(obj)
            obj.parent = root
            obj.location = ToBlender((0, 0, z))
            obj["role"], obj["supportIndex"] = role, i
    for obj in [obj for pair in pierTemplates for obj in pair]:
        bpy.data.objects.remove(obj, do_unlink=True)
    transitionGeometry = BuildPierTransition(1938)
    transitionTemplates = {}
    for role, geo in transitionGeometry.items():
        mat = {"GuardJoint": wood,
               "RailJointSplice": railBody, "DeckJoint": deckWood,
               "DeckJointSupport": deckWood}.get(role, steel)
        layer = "DeckTint" if role in ("DeckJoint", "DeckJointSupport") else None
        transitionTemplates[role] = geo.Object("Template_" + role, mat, tile=1, colorLayer=layer)
    transitionDecks = [transitionTemplates["DeckJoint"]]
    for variant in range(1, 3):
        geometry = BuildPierTransition(1938 + variant * 971)["DeckJoint"]
        transitionDecks.append(geometry.Object(f"Template_DeckJoint_{variant}", deckWood, colorLayer="DeckTint"))
    transitions = []
    for i in range(1, SPEC["spanCount"]):
        z = -SPEC["lengthM"] / 2 + i * SPEC["spanPitchM"]
        for role, template in transitionTemplates.items():
            if role == "DeckJoint":
                template = transitionDecks[(i - 1) % len(transitionDecks)]
            obj = bpy.data.objects.new(f"Shared_{role}{i:02d}", template.data)
            bpy.context.collection.objects.link(obj)
            obj.parent = root
            obj.location = ToBlender((0, 0, z))
            obj["role"], obj["supportIndex"] = role, i
        transitions.append({"supportIndex": i, "centerZ": z, "structuralGapM": SPEC["expansionGapM"],
                            "deckEndClearanceM": .002, "railJointGapM": SPEC["railJointGapM"],
                            "railHeightM": SPEC["railHeightM"]})
    for obj in list(transitionTemplates.values()) + transitionDecks[1:]:
        bpy.data.objects.remove(obj, do_unlink=True)
    abut = BuildAbutment()
    for label, side in [("North", -1), ("South", 1)]:
        obj = abut.Object("Shared_Abutment" + label, stone, root, {"role": "abutment"}, tile=1)
        obj.location = ToBlender((0, 0, side * SPEC["lengthM"] / 2))
        if side < 0:
            obj.rotation_euler[2] = math.pi
    # Pack every used file image, including lazily loaded images where
    # has_data is still false. Image.pack() reads the original bytes directly.
    # Otherwise the exported GLB works but the saved .blend silently relies on
    # paths in this worktree and loses its materials when moved.
    for im in bpy.data.images:
        if im.source == "FILE" and im.users > 0:
            im.pack()
            if not im.packed_file:
                raise RuntimeError("Failed to pack source image: " + im.name)
    bpy.context.view_layer.objects.active = root
    bpy.ops.object.select_all(action="DESELECT")
    def SelectChildren(obj):
        obj.select_set(True)
        for child in obj.children:
            SelectChildren(child)
    SelectChildren(root)
    glb = MODEL / "Model_BeishaheBridge.glb"
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True, export_yup=True,
                             export_texcoords=True, export_normals=True, export_materials="EXPORT", export_extras=True,
                             export_animations=False, export_image_format="AUTO")
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(v) for obj in root.children_recursive if obj.type == "MESH" for v in obj.bound_box]
    game = [(p.x, p.z, -p.y) for p in points]
    mins = [min(p[i] for p in game) for i in range(3)]
    maxs = [max(p[i] for p in game) for i in range(3)]
    triangles = sum(sum(len(p.vertices) - 2 for p in obj.data.polygons) for obj in root.children_recursive if obj.type == "MESH")
    data = {"schemaVersion": 1, "version": SPEC["version"], "spec": SPEC, "assemblies": assemblies,
            "bounds": {"min": mins, "max": maxs, "size": [b - a for a, b in zip(mins, maxs)]}, "transitions": transitions,
            "triangles": triangles, "meshObjects": sum(o.type == "MESH" for o in root.children_recursive),
            "sourceBlend": str(SOURCE / "Scene_BeishaheBridge.blend"),
            "glbBytes": glb.stat().st_size, "glbSha256": hashlib.sha256(glb.read_bytes()).hexdigest(),
            "reconstructionScope": SPEC["reconstructionScope"], "historicalReferences": SPEC["historicalReferences"],
            "materialInterpretation": {
                "pierDamp": "A continuous pale brown-gray damp-to-dry transition on the lower pier courses is a creative weathering choice, not evidence of the 1938 waterline or site condition.",
                "deckPlanks": "In response to the user's request for a complete deck, transverse planks were selected from the generated design study; presence and details are not established by a confirmed 1938 Beishahe bridge photograph.",
                "jointTransitions": "Rail and wooden deck splice details are authored to maintain a usable crossing; their exact construction is not established by a confirmed 1938 Beishahe bridge photograph.",
                "railJoints": "The 1937 route record gives nominal 10 m rails, while joint positions at midspan and supports, the 6 mm gaps, section dimensions and hardware are authored design assumptions. Represented through-bolt shafts overlap solid undrilled rail webs and plates.",
                "guardTimbers": "Two low outer longitudinal timbers are an authored interpretation of a 1941 Jinpu railway bridge photograph at an unknown location; their use and dimensions at Beishahe are unconfirmed."
            },
            "deck": {"clearWidthM": SPEC["sleeperLengthM"], "plankThicknessM": .045, "topY": .075,
                     "railFootClearanceM": .001, "jointWidthM": .006,
                     "jointEndClearanceM": .002, "jointSpliceLengthM": .36,
                     "bearerBottomY": 0, "bearerTopY": .03, "grainAxis": "X"},
            "railJoints": {"nominalRailLengthM": SPEC["railNominalLengthM"], "gapM": SPEC["railJointGapM"],
                           "jointCentersPerSpan": [0], "supportAxisJointCount": SPEC["spanCount"] - 1,
                           "fishplateLengthM": .36, "boltStationsM": [-.13, -.055, .055, .13],
                           "holesModeled": False,
                           "interpretation": "Spacing follows the 1937 Tianjin-Xuzhou line description; locations, joint gap, joint and rail sections are unverified design assumptions."},
            "guardTimbers": {"centerOffsetM": 1.25, "widthM": .14, "bottomY": .075,
                             "topY": .135, "segmentsPerSpan": 5, "spanJointClearanceM": .002,
                             "interpretation": "Design inferred from an unidentified 1941 Jinpu railway bridge; not evidence for Beishahe's exact construction."},
            "materials": ["BeishaheSteel", "BeishaheRailBody", "BeishaheTimber", "BeishaheTimberEnd", "BeishaheDeckTimber", "BeishaheStone", "BeishaheStoneDamp", "BeishaheRailRunning"],
            "bakeInputs": [f"Texture_{texture}{channel}.webp" for texture in
                           ["BeishaheSteel", "BeishaheSleeper", "BeishaheSleeperEnd", "BeishaheDeckPlank", "BeishahePierStone", "BeishahePierDamp"]
                           for channel in ["Base", "Normal", "Orm"]]}
    (MODEL / "Data_BeishaheBridge.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Source-only review scene. Camera sees genuine geometry and PBR, no generated model image.
    scene.world.color = (0.25, 0.28, 0.32)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    for name, location, energy, size in [("Key", (15, 25, 125), 6000, 35), ("Fill", (-15, 15, 110), 4000, 30)]:
        light = bpy.data.lights.new(name, "AREA")
        light.energy, light.shape, light.size = energy, "DISK", size
        obj = bpy.data.objects.new(name, light)
        bpy.context.collection.objects.link(obj)
        obj.location = ToBlender(location)
        obj.rotation_euler = (Vector(ToBlender((0, 0, 125))) - obj.location).to_track_quat("-Z", "Y").to_euler()
    light = bpy.data.lights.new("Sun", "SUN")
    light.energy, light.angle = 2.0, math.radians(12)
    obj = bpy.data.objects.new("Sun", light)
    bpy.context.collection.objects.link(obj)
    obj.rotation_euler = (0.4, -0.5, -0.4)
    camera = bpy.data.cameras.new("ReviewCamera")
    obj = bpy.data.objects.new("ReviewCamera", camera)
    bpy.context.collection.objects.link(obj)
    scene.camera = obj
    obj.location = ToBlender((23, 12, 150))
    obj.rotation_euler = (Vector(ToBlender((0, -0.6, 130))) - obj.location).to_track_quat("-Z", "Y").to_euler()
    camera.lens = 45
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "Scene_BeishaheBridge.blend"))
    print(json.dumps({"glb": str(glb), "blend": data["sourceBlend"], "triangles": triangles, "bytes": data["glbBytes"], "bounds": data["bounds"]}))


if __name__ == "__main__":
    Rebuild()
