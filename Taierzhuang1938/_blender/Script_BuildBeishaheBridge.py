"""Rebuild one intact Beishahe bridge candidate through the worktree BlenderMCP.

Independent asset, not a replacement for the compressed 44 m campaign blockout.
Geometry is authored in game metres and converted to Blender Z-up before export.
The exported GLB uses standard glTF Y-up, X east and Z south.
Raw .blend and original imagegen inputs stay in the task's OneDrive source folder.
"""
import bpy
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

    def Polygon(self, points, uv=None):
        start = len(self.vertices)
        self.vertices.extend(points)
        self.faces.append(tuple(range(start, start + len(points))))
        if uv is None:
            a, b, c = map(Vector, points[:3])
            normal = (b - a).cross(c - a)
            axis = max(range(3), key=lambda i: abs(normal[i]))
            axes = [i for i in range(3) if i != axis]
            uv = [(p[axes[0]], p[axes[1]]) for p in points]
        self.uvs.extend(uv)

    def Box(self, center, size, basis=None):
        c = Vector(center)
        axes = list(map(Vector, basis or [(1, 0, 0), (0, 1, 0), (0, 0, 1)]))
        points = [tuple(c + axes[0] * (sx * size[0] / 2) + axes[1] * (sy * size[1] / 2) + axes[2] * (sz * size[2] / 2))
                  for sx, sy, sz in [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1), (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]]
        for face in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)]:
            self.Polygon([points[i] for i in face])

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

    def Rivet(self, center, normal, radius=0.023):
        center, normal = Vector(center), Vector(normal).normalized()
        u = normal.cross(Vector((0, 1, 0)))
        if u.length < 0.1:
            u = normal.cross(Vector((0, 0, 1)))
        u.normalize()
        v = normal.cross(u)
        rings = []
        for height, r in [(0, radius), (radius * 0.52, radius * 0.81), (radius * 0.82, radius * 0.36)]:
            rings.append([tuple(center + normal * height + (u * math.cos(i * math.tau / 6) + v * math.sin(i * math.tau / 6)) * r) for i in range(6)])
        for row in range(2):
            for i in range(6):
                j = (i + 1) % 6
                self.Polygon([rings[row][i], rings[row][j], rings[row + 1][j], rings[row + 1][i]])
        self.Polygon(rings[-1])

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
            self.Polygon([rings[0][i], rings[0][j], rings[1][j], rings[1][i]])

    def Object(self, name, material, parent=None, extras=None, tile=1):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([ToBlender(p) for p in self.vertices], [], self.faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        mesh.materials.append(material)
        layer = mesh.uv_layers.new(name="UVMap")
        for loop, uv in zip(layer.data, self.uvs):
            loop.uv = (uv[0] / tile, uv[1] / tile)
        obj.parent = parent
        for key, value in (extras or {}).items():
            obj[key] = value
        return obj


def Material(name, texture, roughness, metal=0, normal_strength=0.25):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metal
    base = nodes.new("ShaderNodeTexImage")
    base.image = bpy.data.images.load(str(PROJECT / "Texture" / f"Texture_{texture}Base.webp"), check_existing=True)
    links.new(base.outputs["Color"], shader.inputs["Base Color"])
    normal_path = PROJECT / "Texture" / f"Texture_{texture}Normal.webp"
    if normal_path.exists():
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(normal_path), check_existing=True)
        tex.image.colorspace_settings.name = "Non-Color"
        normal = nodes.new("ShaderNodeNormalMap")
        normal.inputs["Strength"].default_value = normal_strength
        links.new(tex.outputs["Color"], normal.inputs["Color"])
        links.new(normal.outputs["Normal"], shader.inputs["Normal"])
    orm_path = PROJECT / "Texture" / f"Texture_{texture}Orm.webp"
    if orm_path.exists():
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(orm_path), check_existing=True)
        tex.image.colorspace_settings.name = "Non-Color"
        split = nodes.new("ShaderNodeSeparateColor")
        links.new(tex.outputs["Color"], split.inputs["Color"])
        links.new(split.outputs["Green"], shader.inputs["Roughness"])
        if texture == "BeishaheSteel":
            links.new(split.outputs["Blue"], shader.inputs["Metallic"])
    return mat


def Empty(name):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    return obj


def BuildSpan():
    length = SPEC["spanPitchM"] - SPEC["expansionGapM"]
    n = SPEC["panelsPerSpan"]
    step = length / n
    zs = [-length / 2 + i * step for i in range(n + 1)]
    y0, y1 = SPEC["trussBottomY"], SPEC["trussTopY"]
    half_w = SPEC["trussCenterOffsetM"]
    steel, fasteners, timber, west, east, shoes = [Geometry() for _ in range(6)]
    # Straight low upper chord, sloping end posts, alternating diagonals with verticals.
    # No portal or cross bracing above the open track (pony truss).
    for side in [-1, 1]:
        x = side * half_w
        steel.Channel((x, y0, zs[0]), (x, y0, zs[-1]), 0.22, 0.28)
        steel.Channel((x, y1, zs[1]), (x, y1, zs[-2]), 0.24, 0.23)
        steel.Box((x, y1 + 0.13, 0), (0.29, 0.03, zs[-2] - zs[1]))
        for k in range(n):
            if k == 0:
                a, b = (x, y0, zs[0]), (x, y1, zs[1])
            elif k == n - 1:
                a, b = (x, y1, zs[-2]), (x, y0, zs[-1])
            elif k % 2:
                a, b = (x, y1, zs[k]), (x, y0, zs[k + 1])
            else:
                a, b = (x, y0, zs[k]), (x, y1, zs[k + 1])
            steel.Channel(a, b, 0.15, 0.15)
        for k in range(1, n):
            steel.Channel((x, y0, zs[k]), (x, y1, zs[k]), 0.12, 0.12)
        # Gusset plates and three real rivets per visible node, plus chord rows.
        for k, z in enumerate(zs):
            for yy in ([y0, y1] if 0 < k < n else [y0]):
                for outward in [-1, 1]:
                    xx = x + outward * 0.13
                    p = [(xx, yy - 0.13, z - 0.20), (xx, yy + 0.18, z - 0.13), (xx, yy + 0.20, z + 0.13), (xx, yy - 0.13, z + 0.20)]
                    if outward < 0:
                        p.reverse()
                    steel.Polygon(p)
                    for dz, dy in [(-0.11, -0.07), (0.10, -0.07), (0, 0.11)]:
                        fasteners.Rivet((xx + outward * 0.003, yy + dy, z + dz), (outward, 0, 0))
        count = int(length / 0.30)
        for k in range(count):
            z = -length / 2 + (k + 0.5) * length / count
            fasteners.Rivet((x + side * 0.135, y0 + 0.07, z), (side, 0, 0), 0.018)
            if zs[1] < z < zs[-2]:
                fasteners.Rivet((x + side * 0.135, y1 - 0.055, z), (side, 0, 0), 0.018)
    # Floor beams, two rail stringers, below-deck X bracing.
    for z in zs:
        steel.Channel((-half_w, -0.40, z), (half_w, -0.40, z), 0.16, 0.32)
    for side in [-1, 1]:
        steel.Channel((side * 0.75, -0.29, zs[0]), (side * 0.75, -0.29, zs[-1]), 0.14, 0.22)
        steel.Box((side * 0.75, -0.17, 0), (0.16, 0.02, length))
    for k in range(n):
        for s in [-1, 1]:
            steel.Beam((s * half_w, -0.57, zs[k]), (-s * half_w, -0.57, zs[k + 1]), 0.055, 0.018)
    # Open timber deck, exposed sleepers, two rails. Gauge is INNER head-face distance.
    count = math.ceil(length / SPEC["sleeperSpacingM"])
    rail_x = (SPEC["gaugeM"] + SPEC["railHeadWidthM"]) / 2
    for k in range(count):
        z = -length / 2 + (k + 0.5) * length / count
        timber.Box((0, -0.08, z), (SPEC["sleeperLengthM"], 0.16, SPEC["sleeperWidthM"]))
        for side in [-1, 1]:
            x = side * rail_x
            steel.Box((x, 0.008, z), (0.22, 0.016, 0.20))
            for dx in [-0.08, 0.08]:
                fasteners.Box((x + dx, 0.025, z), (0.026, 0.033, 0.026))
    for rail, side in [(west, -1), (east, 1)]:
        x = side * rail_x
        rail.Box((x, 0.024, 0), (0.13, 0.028, length))
        rail.Box((x, 0.079, 0), (0.017, 0.082, length))
        rail.Box((x, 0.125, 0), (SPEC["railHeadWidthM"], 0.030, length))
        for z in [zs[0] + 0.20, zs[-1] - 0.20]:
            for dx in [-0.026, 0.026]:
                steel.Box((x + dx, 0.07, z), (0.018, 0.062, 0.38))
    # One fixed/one expansion bearing on each side; four load paths per span.
    bearing_centers = []
    for end in [-1, 1]:
        for side in [-1, 1]:
            x, z = side * half_w, end * (length / 2 - 0.20)
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
            bearing_centers.append([x, SPEC["bearingTopY"], z])
    return {"Trusses": steel, "Rivets": fasteners, "Sleepers": timber, "RailWest": west, "RailEast": east, "Bearings": shoes}, bearing_centers


def BuildPier():
    stone, cap = Geometry(), Geometry()
    rng = random.Random(1938)
    floor, top = SPEC["foundationY"], SPEC["pierTopY"]
    courses = 9
    ch = (top - floor - 0.25) / courses
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
                    stone.Box(((left + right) / 2, y + rng.uniform(-0.005, 0.005), side * (halfz - 0.16)), (right - left - 0.014, ch - 0.014, 0.34 + rng.uniform(-0.016, 0.016)))
            for k in range(countz):
                z = -halfz + (k + 0.5) * 2 * halfz / countz
                stone.Box((side * (halfx - 0.20), y, z), (0.42, ch - 0.014, 2 * halfz / countz - 0.014))
        # Solid core prevents light leaking through corner joints.
        stone.Box((0, y, 0), (2 * halfx - 0.18, ch - 0.012, 2 * halfz - 0.18))
    cap.Box((0, top - 0.125, 0), (4.55, 0.25, 2.25))
    stone.Box((0, floor - 0.13, 0), (4.7, 0.26, 2.7))
    return stone, cap


def BuildAbutment():
    geo = Geometry()
    top, floor = SPEC["pierTopY"], SPEC["foundationY"]
    rows = 10
    for row in range(rows):
        h = (top - floor) / rows
        for col in range(8):
            geo.Box((-3 + (col + 0.5) * 0.75, floor + (row + 0.5) * h, 0.45), (0.735, h - 0.014, 1.5))
    geo.Box((0, top - 0.11, 0.45), (6.25, 0.22, 1.65))
    # Battered wing walls contain the embankment; no scenery is exported.
    for side in [-1, 1]:
        for k in range(4):
            height = (top - floor) * (1 - k * 0.15)
            geo.Box((side * (3 + k * 0.50), floor + height / 2, 1.35 + k * 0.75), (0.80, height, 0.90))
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
    scene = bpy.context.scene
    scene["BlenderMcpTask"] = "BeishaheBridge"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1
    steel = Material("BeishaheSteel", "BeishaheSteel", 0.82, 0.25, 0.18)
    wood = Material("BeishaheTimber", "HandcartWood", 0.91, 0, 0.25)
    stone = Material("BeishaheStone", "CityWallStone", 0.94, 0, 0.30)
    root = Empty("BeishaheBridge")
    root["reconstructionScope"] = SPEC["reconstructionScope"]
    root["assetVersion"] = SPEC["version"]
    spans, bearing_template = BuildSpan()
    templates = {}
    for role, geo in spans.items():
        mat = wood if role == "Sleepers" else steel
        templates[role] = geo.Object("Template_" + role, mat, tile=1)
    assemblies = []
    for i in range(SPEC["spanCount"]):
        z = -SPEC["lengthM"] / 2 + SPEC["spanPitchM"] * (i + 0.5)
        parent = Empty(f"Intact_Span{i + 1:02d}")
        parent.parent = root
        parent.location = ToBlender((0, 0, z))
        parent["role"], parent["spanIndex"] = "span", i
        for role, template in templates.items():
            obj = bpy.data.objects.new(f"Intact_Span{i + 1:02d}_{role}", template.data)
            bpy.context.collection.objects.link(obj)
            obj.parent = parent
            obj["role"], obj["spanIndex"] = role, i
        assemblies.append({"id": parent.name, "spanIndex": i, "centerZ": z, "bearings": [[x, y, zz + z] for x, y, zz in bearing_template]})
    for obj in templates.values():
        bpy.data.objects.remove(obj, do_unlink=True)
    pier, cap = BuildPier()
    pier_template, cap_template = pier.Object("Template_Pier", stone, tile=3.0), cap.Object("Template_Cap", stone, tile=3.0)
    for i in range(1, SPEC["spanCount"]):
        z = -SPEC["lengthM"] / 2 + i * SPEC["spanPitchM"]
        for role, template in [("Pier", pier_template), ("Cap", cap_template)]:
            obj = bpy.data.objects.new(f"Shared_{role}{i:02d}", template.data)
            bpy.context.collection.objects.link(obj)
            obj.parent = root
            obj.location = ToBlender((0, 0, z))
            obj["role"], obj["supportIndex"] = role, i
    for obj in [pier_template, cap_template]:
        bpy.data.objects.remove(obj, do_unlink=True)
    abut = BuildAbutment()
    for label, side in [("North", -1), ("South", 1)]:
        obj = abut.Object("Shared_Abutment" + label, stone, root, {"role": "abutment"}, tile=3)
        obj.location = ToBlender((0, 0, side * SPEC["lengthM"] / 2))
        if side < 0:
            obj.rotation_euler[2] = math.pi
    # Save source with packed images, then export only the actual bridge.
    for im in bpy.data.images:
        if im.source == "FILE" and im.has_data:
            im.pack()
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
            "bounds": {"min": mins, "max": maxs, "size": [b - a for a, b in zip(mins, maxs)]},
            "triangles": triangles, "meshObjects": sum(o.type == "MESH" for o in root.children_recursive),
            "sourceBlend": str(SOURCE / "Scene_BeishaheBridge.blend"),
            "glbBytes": glb.stat().st_size, "glbSha256": hashlib.sha256(glb.read_bytes()).hexdigest(),
            "reconstructionScope": SPEC["reconstructionScope"], "historicalReferences": SPEC["historicalReferences"],
            "materials": ["BeishaheSteel", "BeishaheTimber", "BeishaheStone"],
            "bakeInputs": ["Texture_BeishaheSteelBase.webp", "Texture_BeishaheSteelNormal.webp", "Texture_BeishaheSteelOrm.webp",
                           "Texture_HandcartWoodBase.webp", "Texture_HandcartWoodNormal.webp", "Texture_CityWallStoneBase.webp", "Texture_CityWallStoneNormal.webp", "Texture_CityWallStoneOrm.webp"]}
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
