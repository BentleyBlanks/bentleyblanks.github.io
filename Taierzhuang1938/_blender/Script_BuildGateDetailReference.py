"""Build the four Tengxian gate-condition references in an isolated Blender process.

The runtime remains procedural, but this scene gives the gate geometry and authored
PBR sets a native modelling/QC home.  Blender MCP launches this script in a separate
background Blender so it never switches or dirties the artist's currently open file.
"""

from math import pi, radians
from pathlib import Path

import bpy
from mathutils import Vector


Root = Path(__file__).resolve().parents[1]
TextureDir = Root / "Texture"
SceneDir = Root / "Scene"
BlendPath = SceneDir / "Scene_TengxianGateDetail.blend"
PreviewPath = SceneDir / "Texture_TengxianGateDetailPreview.png"


def ClearScene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for dataBlocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras,
                       bpy.data.lights):
        for dataBlock in list(dataBlocks):
            if dataBlock.users == 0:
                dataBlocks.remove(dataBlock)


def PbrMaterial(name, stem, tint):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Base Color"].default_value = (*tint, 1.0)
    shader.inputs["Roughness"].default_value = 0.94
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    base = nodes.new("ShaderNodeTexImage")
    base.image = bpy.data.images.load(str(TextureDir / f"Texture_{stem}Base.webp"), check_existing=True)
    base.image.colorspace_settings.name = "sRGB"
    multiply = nodes.new("ShaderNodeMixRGB")
    multiply.blend_type = "MULTIPLY"
    multiply.inputs[0].default_value = 1.0
    multiply.inputs[2].default_value = (*tint, 1.0)
    links.new(base.outputs["Color"], multiply.inputs[1])
    links.new(multiply.outputs["Color"], shader.inputs["Base Color"])

    normalImage = nodes.new("ShaderNodeTexImage")
    normalImage.image = bpy.data.images.load(
        str(TextureDir / f"Texture_{stem}Normal.webp"), check_existing=True)
    normalImage.image.colorspace_settings.name = "Non-Color"
    normal = nodes.new("ShaderNodeNormalMap")
    normal.inputs["Strength"].default_value = 0.72
    links.new(normalImage.outputs["Color"], normal.inputs["Color"])
    links.new(normal.outputs["Normal"], shader.inputs["Normal"])

    ormImage = nodes.new("ShaderNodeTexImage")
    ormImage.image = bpy.data.images.load(
        str(TextureDir / f"Texture_{stem}Orm.webp"), check_existing=True)
    ormImage.image.colorspace_settings.name = "Non-Color"
    separate = nodes.new("ShaderNodeSeparateColor")
    links.new(ormImage.outputs["Color"], separate.inputs["Color"])
    links.new(separate.outputs["Green"], shader.inputs["Roughness"])
    links.new(separate.outputs["Blue"], shader.inputs["Metallic"])
    return material


def PlainMaterial(name, color, roughness=0.9, metallic=0.0):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return material


def ApplyMaterial(target, material):
    target.data.materials.append(material)
    for polygon in target.data.polygons:
        polygon.use_smooth = False


def SmartUv(target):
    bpy.context.view_layer.objects.active = target
    target.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=radians(66), island_margin=0.015)
    bpy.ops.object.mode_set(mode="OBJECT")
    uvLayer = target.data.uv_layers.active
    if uvLayer:
        for uvLoop in uvLayer.data:
            uvLoop.uv *= 4.0
    target.select_set(False)


def AddBox(name, location, scale, material, bevel=0.04, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    target = bpy.context.object
    target.name = name
    target.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    SmartUv(target)
    if bevel > 0:
        modifier = target.modifiers.new("EdgeWear", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    ApplyMaterial(target, material)
    return target


def AddCylinder(name, location, radius, depth, material, vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                       location=location)
    target = bpy.context.object
    target.name = name
    modifier = target.modifiers.new("SoftEdges", "BEVEL")
    modifier.width = min(radius * 0.12, 0.035)
    modifier.segments = 2
    ApplyMaterial(target, material)
    return target


def AddBeam(name, start, end, thickness, material):
    startPoint = Vector(start)
    endPoint = Vector(end)
    delta = endPoint - startPoint
    target = AddBox(name, (startPoint + endPoint) * 0.5,
                    (thickness, thickness, delta.length), material, bevel=0.025)
    target.rotation_mode = "QUATERNION"
    target.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(delta.normalized())
    return target


def AddVoussoir(name, center, innerRadius, outerRadius, angle0, angle1, depth, material):
    vertices = []
    faces = []
    for zValue in (-depth / 2, depth / 2):
        for radius, angle in ((innerRadius, angle0), (outerRadius, angle0),
                              (outerRadius, angle1), (innerRadius, angle1)):
            vertices.append((center[0] + radius * __import__("math").cos(angle),
                             center[1] + zValue,
                             center[2] + radius * __import__("math").sin(angle)))
    faces.extend(((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
                  (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)))
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    target = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(target)
    SmartUv(target)
    modifier = target.modifiers.new("MortarSoftEdge", "BEVEL")
    modifier.width = 0.018
    modifier.segments = 1
    ApplyMaterial(target, material)
    return target


def AddRoof(name, center, width, depth, eaveHeight, rise, tileMaterial, woodMaterial):
    halfWidth = width / 2
    halfDepth = depth / 2
    vertices = [
        (-halfWidth, -halfDepth, eaveHeight), (halfWidth, -halfDepth, eaveHeight),
        (halfWidth, halfDepth, eaveHeight), (-halfWidth, halfDepth, eaveHeight),
        (-width * 0.23, 0.0, eaveHeight + rise), (width * 0.23, 0.0, eaveHeight + rise),
    ]
    vertices = [(center[0] + xValue, center[1] + yValue, center[2] + zValue)
                for xValue, yValue, zValue in vertices]
    faces = [(0, 1, 5, 4), (3, 4, 5, 2), (0, 4, 3), (1, 2, 5)]
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    target = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(target)
    SmartUv(target)
    solidify = target.modifiers.new("TileShell", "SOLIDIFY")
    solidify.thickness = 0.11
    bevel = target.modifiers.new("TileEdge", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 2
    ApplyMaterial(target, tileMaterial)
    AddBeam(f"{name}Ridge", (center[0] - width * 0.25, center[1], center[2] + eaveHeight + rise + 0.08),
            (center[0] + width * 0.25, center[1], center[2] + eaveHeight + rise + 0.08),
            0.20, tileMaterial)
    for side in (-1, 1):
        AddBeam(f"{name}Fascia{side}",
                (center[0] - halfWidth, center[1] + side * halfDepth, center[2] + eaveHeight - 0.08),
                (center[0] + halfWidth, center[1] + side * halfDepth, center[2] + eaveHeight - 0.08),
                0.13, woodMaterial)


def AddGateVariant(label, origin, blocked, materials):
    brick, woodRed, woodGreen, roofTile, stone, iron, sandbag, ground = materials
    xValue, yValue = origin
    wallHeight = 8.2
    openingWidth = 3.8
    springHeight = 4.1
    pierWidth = 4.6
    for side in (-1, 1):
        AddBox(f"{label}Pier{side}",
               (xValue + side * (openingWidth / 2 + pierWidth / 2), yValue, wallHeight / 2),
               (pierWidth, 4.6, wallHeight), brick, bevel=0.06)
    AddBox(f"{label}Header", (xValue, yValue, 7.15), (openingWidth, 4.6, 2.1), brick, bevel=0.04)
    for index in range(17):
        gap = radians(0.7)
        AddVoussoir(f"{label}Voussoir{index}", (xValue, yValue, springHeight),
                    openingWidth / 2, openingWidth / 2 + 0.46,
                    pi * index / 17 + gap, pi * (index + 1) / 17 - gap,
                    4.72, brick)

    terraceHeight = wallHeight + 0.35
    AddBox(f"{label}Terrace", (xValue, yValue, terraceHeight), (14.5, 7.8, 0.36), stone)
    for sideY in (-1, 1):
        for index in range(15):
            localX = -6.7 + index * 13.4 / 14
            AddCylinder(f"{label}Rail{sideY}_{index}",
                        (xValue + localX, yValue + sideY * 3.65, terraceHeight + 0.52),
                        0.065, 0.72, stone, 8)
        AddBox(f"{label}Handrail{sideY}",
               (xValue, yValue + sideY * 3.65, terraceHeight + 0.92),
               (14.2, 0.20, 0.18), stone, bevel=0.025)

    floorHeight = terraceHeight + 0.36
    for columnX in (-5.1, -1.7, 1.7, 5.1):
        for sideY in (-1, 1):
            AddCylinder(f"{label}Column{columnX}_{sideY}",
                        (xValue + columnX, yValue + sideY * 2.85, floorHeight + 1.95),
                        0.19, 3.9, woodRed, 12)
            AddCylinder(f"{label}ColumnBase{columnX}_{sideY}",
                        (xValue + columnX, yValue + sideY * 2.85, floorHeight + 0.10),
                        0.30, 0.20, stone, 12)
    for sideY in (-1, 1):
        AddBox(f"{label}Lintel{sideY}",
               (xValue, yValue + sideY * 2.85, floorHeight + 3.62),
               (10.8, 0.30, 0.36), woodGreen)
    AddRoof(f"{label}LowerRoof", (xValue, yValue, 0.0), 13.8, 9.0,
            floorHeight + 3.9, 1.75, roofTile, woodGreen)

    upperFloor = floorHeight + 5.0
    for columnX in (-3.7, -1.25, 1.25, 3.7):
        for sideY in (-1, 1):
            AddCylinder(f"{label}UpperColumn{columnX}_{sideY}",
                        (xValue + columnX, yValue + sideY * 1.95, upperFloor + 1.25),
                        0.15, 2.5, woodRed, 10)
    AddRoof(f"{label}UpperRoof", (xValue, yValue, 0.0), 10.5, 6.7,
            upperFloor + 2.5, 1.40, roofTile, woodGreen)

    if blocked == "partial":
        AddBox(f"{label}Door", (xValue - 0.75, yValue - 2.22, 2.0),
               (1.55, 0.16, 3.95), woodRed, rotation=(0.0, 0.0, radians(-22)))
    for row in range(7 if blocked == "full" else 4):
        count = 6 if blocked == "full" else 3
        for index in range(count):
            if blocked == "slit" and index in (2, 3):
                continue
            localX = (index - (count - 1) / 2) * 0.58
            AddBox(f"{label}Sandbag{row}_{index}",
                   (xValue + localX, yValue - 1.5 + (row % 2) * 0.08, 0.18 + row * 0.28),
                   (0.52, 0.34, 0.25), sandbag, bevel=0.09,
                   rotation=(0.0, 0.0, radians((index % 3 - 1) * 3)))
    for trackX in (-0.72, 0.72):
        AddBox(f"{label}WheelRut{trackX}", (xValue + trackX, yValue + 4.1, 0.035),
               (0.24, 8.0, 0.04), ground, bevel=0.015)


def AddCameraAndLight():
    bpy.ops.object.light_add(type="SUN", location=(8.0, -10.0, 32.0))
    sun = bpy.context.object
    sun.name = "LateWinterSun"
    sun.data.energy = 2.0
    sun.rotation_euler = (radians(32), radians(-18), radians(28))
    bpy.ops.object.light_add(type="AREA", location=(0.0, -34.0, 28.0))
    fill = bpy.context.object
    fill.name = "SkyFill"
    fill.data.energy = 1600
    fill.data.shape = "DISK"
    fill.data.size = 26
    fill.rotation_euler = (radians(54), 0.0, 0.0)

    bpy.ops.object.camera_add(location=(49.0, -69.0, 39.0))
    camera = bpy.context.object
    camera.name = "GateOverviewCamera"
    direction = Vector((0.0, 1.5, 8.5)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 54
    bpy.context.scene.camera = camera


def Main():
    ClearScene()
    scene = bpy.context.scene
    scene.name = "TengxianGateDetailReference"
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(PreviewPath)
    scene.render.film_transparent = False
    scene.world.color = (0.055, 0.065, 0.082)

    brick = PbrMaterial("GateBrickPbr", "GateBrick", (0.86, 0.88, 0.90))
    woodRed = PbrMaterial("GatePaintRedPbr", "GatePaintedWood", (0.58, 0.28, 0.22))
    woodGreen = PbrMaterial("GatePaintGreenPbr", "GatePaintedWood", (0.28, 0.43, 0.37))
    roofTile = PbrMaterial("GateRoofTilePbr", "GateRoofTile", (0.70, 0.74, 0.78))
    stone = PlainMaterial("GateAshlar", (0.48, 0.50, 0.52), 0.94)
    iron = PlainMaterial("GateIron", (0.09, 0.085, 0.075), 0.66, 0.58)
    sandbag = PlainMaterial("GateSandbag", (0.38, 0.34, 0.25), 0.98)
    ground = PlainMaterial("GateRoadWear", (0.19, 0.17, 0.14), 1.0)
    materials = (brick, woodRed, woodGreen, roofTile, stone, iron, sandbag, ground)

    AddGateVariant("EastGate", (-18.0, 10.0), "partial", materials)
    AddGateVariant("WestGate", (18.0, 10.0), "slit", materials)
    AddGateVariant("SouthGate", (-18.0, -18.0), "full", materials)
    AddGateVariant("NorthGate", (18.0, -18.0), "full", materials)
    AddBox("ReferenceGround", (0.0, 0.0, -0.10), (78.0, 64.0, 0.20), ground, bevel=0.0)
    AddCameraAndLight()

    SceneDir.mkdir(parents=True, exist_ok=True)
    # 参考场景会随任务 worktree 一起搬迁；把三套 PBR 打包进 .blend，避免保存
    # 绝对路径后清理 worktree 导致粉色丢图。
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(BlendPath), compress=True)
    bpy.ops.render.render(write_still=True)
    print(f"Saved {BlendPath}")
    print(f"Rendered {PreviewPath}")


if __name__ == "__main__":
    Main()
