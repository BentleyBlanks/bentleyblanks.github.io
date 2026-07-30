"""Build the EnemyRear1941 low-poly miniature pack inside Blender.

Run this file through Blender's scripting workspace or the Blender MCP
``execute_code`` endpoint. It only replaces the ``EnemyRearAssets``
collection, preserves the user's other scene objects, never saves a blend,
exports the selected asset hierarchy to ``Model_EnemyRearMiniatures.glb``,
and re-imports the GLB into a temporary scene for validation.
"""

import json
import math
import os
import re

import bpy
from mathutils import Vector


ASSET_COLLECTION_NAME = "EnemyRearAssets"
REQUIRED_ASSETS = (
    "Model_WorkTeam",
    "Model_Guerrilla",
    "Model_MainForce",
    "Model_Militia",
    "Model_Courier",
    "Model_EnemyPatrol",
    "Model_VillageHouse",
    "Model_EnemyBlockhouse",
    "Model_TrafficStation",
    "Model_RailwayStation",
)
EXPORT_PATH = (
    "C:/Users/Bentl/Documents/Program/"
    "bentleyblanks_Codex_EnemyRearVisualOverhaul_20260730/"
    "TaihangDemo/EnemyRear1941/Model_EnemyRearMiniatures.glb"
)


def HexColor(hexValue):
    return (
        ((hexValue >> 16) & 255) / 255.0,
        ((hexValue >> 8) & 255) / 255.0,
        (hexValue & 255) / 255.0,
        1.0,
    )


def CreateMaterial(name, hexValue, roughness=0.9, metallic=0.0):
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name=name)
    color = HexColor(hexValue)
    material.diffuse_color = color
    material.use_nodes = True
    material.node_tree.nodes.clear()
    outputNode = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    shaderNode = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    shaderNode.inputs["Base Color"].default_value = color
    shaderNode.inputs["Metallic"].default_value = metallic
    shaderNode.inputs["Roughness"].default_value = roughness
    if "Specular IOR Level" in shaderNode.inputs:
        shaderNode.inputs["Specular IOR Level"].default_value = 0.18
    material.node_tree.links.new(shaderNode.outputs["BSDF"], outputNode.inputs["Surface"])
    return material


def CreateVertexColorMaterial():
    material = bpy.data.materials.get("Material_MiniatureVertexColor")
    if material is None:
        material = bpy.data.materials.new(name="Material_MiniatureVertexColor")
    material.diffuse_color = (1.0, 1.0, 1.0, 1.0)
    material.use_nodes = True
    material.node_tree.nodes.clear()
    outputNode = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    shaderNode = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    colorNode = material.node_tree.nodes.new("ShaderNodeVertexColor")
    colorNode.layer_name = "Color"
    shaderNode.inputs["Metallic"].default_value = 0.0
    shaderNode.inputs["Roughness"].default_value = 0.92
    if "Specular IOR Level" in shaderNode.inputs:
        shaderNode.inputs["Specular IOR Level"].default_value = 0.18
    material.node_tree.links.new(colorNode.outputs["Color"], shaderNode.inputs["Base Color"])
    material.node_tree.links.new(shaderNode.outputs["BSDF"], outputNode.inputs["Surface"])
    return material


def CreateMaterials():
    return {
        "skin": CreateMaterial("Material_SunBrownSkin", 0xB9825A, 0.92),
        "civilianBlue": CreateMaterial("Material_CivilianIndigo", 0x4E6770, 0.96),
        "civilianBrown": CreateMaterial("Material_CivilianEarth", 0x77614A, 0.97),
        "civilianGrey": CreateMaterial("Material_CivilianGrey", 0x777568, 0.97),
        "civilianOchre": CreateMaterial("Material_CivilianOchre", 0x8C6841, 0.98),
        "clothPatch": CreateMaterial("Material_ClothPatch", 0x9B8A69, 0.98),
        "playerUniform": CreateMaterial("Material_EighthRouteBlueGrey", 0x536871, 0.95),
        "playerDark": CreateMaterial("Material_PlayerDarkCloth", 0x303B3D, 0.96),
        "playerCap": CreateMaterial("Material_PlayerFieldCap", 0x455A61, 0.95),
        "enemyUniform": CreateMaterial("Material_EnemyKhakiOlive", 0x77735B, 0.95),
        "enemyUniformLight": CreateMaterial("Material_EnemyKhakiHighlight", 0x96906D, 0.95),
        "enemyDark": CreateMaterial("Material_EnemyDarkCloth", 0x383A31, 0.94),
        "enemyHelmet": CreateMaterial("Material_EnemySteelHelmet", 0x515448, 0.82, 0.04),
        "straw": CreateMaterial("Material_WovenStraw", 0xB99858, 0.99),
        "rope": CreateMaterial("Material_HempRope", 0x9A7C48, 0.99),
        "wood": CreateMaterial("Material_DarkTimber", 0x57412F, 0.98),
        "rifleWood": CreateMaterial("Material_RifleWood", 0x4E3224, 0.9),
        "metal": CreateMaterial("Material_DarkIron", 0x242A29, 0.72, 0.16),
        "brass": CreateMaterial("Material_AgedBrass", 0x8A6A31, 0.8, 0.08),
        "mudWall": CreateMaterial("Material_RammedEarth", 0x9A805D, 0.99),
        "mudWallLight": CreateMaterial("Material_SunlitRammedEarth", 0xB59A70, 0.99),
        "stone": CreateMaterial("Material_TaihangStone", 0x696B62, 0.99),
        "stoneLight": CreateMaterial("Material_TaihangStoneLight", 0x85867A, 0.99),
        "tile": CreateMaterial("Material_GreyRoofTile", 0x3F4645, 0.98),
        "tileLight": CreateMaterial("Material_WeatheredTileEdge", 0x5A6260, 0.98),
        "door": CreateMaterial("Material_AgedDoor", 0x443126, 0.99),
        "darkOpening": CreateMaterial("Material_DarkOpening", 0x151817, 1.0),
        "signalBlue": CreateMaterial("Material_TrafficSignalBlue", 0x3F6670, 0.94),
        "mutedRed": CreateMaterial("Material_MutedRedCloth", 0x87362E, 0.96),
        "canvas": CreateMaterial("Material_CanvasPack", 0x756A4B, 0.98),
        "earth": CreateMaterial("Material_PackedEarth", 0x715C41, 1.0),
        "terracotta": CreateMaterial("Material_TerracottaJar", 0x815137, 0.98),
        "paper": CreateMaterial("Material_AgedPaper", 0xC3AD7B, 0.99),
        "vertexColor": CreateVertexColorMaterial(),
    }


def MoveToCollection(obj, assetCollection):
    for ownerCollection in tuple(obj.users_collection):
        ownerCollection.objects.unlink(obj)
    assetCollection.objects.link(obj)


def SetFlat(meshObject):
    if meshObject.type != "MESH":
        return
    for polygon in meshObject.data.polygons:
        polygon.use_smooth = False


def AssignMaterial(meshObject, material):
    meshObject.data.materials.clear()
    meshObject.data.materials.append(material)
    SetFlat(meshObject)


def CreateEmpty(assetCollection, name, parent=None, location=(0.0, 0.0, 0.0)):
    emptyObject = bpy.data.objects.new(name, None)
    assetCollection.objects.link(emptyObject)
    emptyObject.empty_display_type = "PLAIN_AXES"
    emptyObject.empty_display_size = 0.18
    emptyObject.parent = parent
    emptyObject.location = location
    return emptyObject


def AddCube(assetCollection, parent, name, size, location, material, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 0.0))
    meshObject = bpy.context.object
    meshObject.name = name
    MoveToCollection(meshObject, assetCollection)
    meshObject.parent = parent
    meshObject.location = location
    meshObject.rotation_euler = rotation
    meshObject.scale = (size[0], size[1], size[2])
    bpy.context.view_layer.objects.active = meshObject
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    AssignMaterial(meshObject, material)
    return meshObject


def AddBeveledCube(
    assetCollection,
    parent,
    name,
    size,
    location,
    material,
    rotation=(0.0, 0.0, 0.0),
    bevel=0.025,
):
    meshObject = AddCube(
        assetCollection,
        parent,
        name,
        size,
        location,
        material,
        rotation,
    )
    if bevel < 0.02:
        return meshObject
    bevelModifier = meshObject.modifiers.new(name=name + "_EdgeWear", type="BEVEL")
    bevelModifier.width = min(bevel, min(size) * 0.22)
    bevelModifier.segments = 1
    bpy.context.view_layer.objects.active = meshObject
    meshObject.select_set(True)
    bpy.ops.object.modifier_apply(modifier=bevelModifier.name)
    SetFlat(meshObject)
    return meshObject


def AddCylinder(
    assetCollection,
    parent,
    name,
    radius,
    depth,
    location,
    material,
    vertices=8,
    rotation=(0.0, 0.0, 0.0),
):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        end_fill_type="NGON",
        location=(0.0, 0.0, 0.0),
    )
    meshObject = bpy.context.object
    meshObject.name = name
    MoveToCollection(meshObject, assetCollection)
    meshObject.parent = parent
    meshObject.location = location
    meshObject.rotation_euler = rotation
    AssignMaterial(meshObject, material)
    return meshObject


def AddCone(
    assetCollection,
    parent,
    name,
    radiusBottom,
    radiusTop,
    depth,
    location,
    material,
    vertices=8,
    rotation=(0.0, 0.0, 0.0),
):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radiusBottom,
        radius2=radiusTop,
        depth=depth,
        end_fill_type="NGON",
        location=(0.0, 0.0, 0.0),
    )
    meshObject = bpy.context.object
    meshObject.name = name
    MoveToCollection(meshObject, assetCollection)
    meshObject.parent = parent
    meshObject.location = location
    meshObject.rotation_euler = rotation
    AssignMaterial(meshObject, material)
    return meshObject


def AddIcoSphere(assetCollection, parent, name, radius, location, material, scale=(1.0, 1.0, 1.0)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=radius, location=(0.0, 0.0, 0.0))
    meshObject = bpy.context.object
    meshObject.name = name
    MoveToCollection(meshObject, assetCollection)
    meshObject.parent = parent
    meshObject.location = location
    meshObject.scale = scale
    bpy.context.view_layer.objects.active = meshObject
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    AssignMaterial(meshObject, material)
    return meshObject


def AddTorus(
    assetCollection,
    parent,
    name,
    majorRadius,
    minorRadius,
    location,
    material,
    rotation=(0.0, 0.0, 0.0),
):
    bpy.ops.mesh.primitive_torus_add(
        align="WORLD",
        major_segments=10,
        minor_segments=3,
        major_radius=majorRadius,
        minor_radius=minorRadius,
        location=(0.0, 0.0, 0.0),
    )
    meshObject = bpy.context.object
    meshObject.name = name
    MoveToCollection(meshObject, assetCollection)
    meshObject.parent = parent
    meshObject.location = location
    meshObject.rotation_euler = rotation
    AssignMaterial(meshObject, material)
    return meshObject


def AddRod(assetCollection, parent, name, start, end, radius, material, vertices=6):
    startPoint = Vector(start)
    endPoint = Vector(end)
    direction = endPoint - startPoint
    length = direction.length
    rod = AddCylinder(
        assetCollection,
        parent,
        name,
        radius,
        length,
        (startPoint + endPoint) * 0.5,
        material,
        vertices=vertices,
    )
    rod.rotation_mode = "QUATERNION"
    rod.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(direction.normalized())
    return rod


def AddArchPanel(
    assetCollection,
    parent,
    name,
    width,
    height,
    location,
    material,
    segments=7,
):
    radius = width * 0.5
    springHeight = max(height - radius, height * 0.45)
    vertices = [
        (-radius, 0.0, 0.0),
        (radius, 0.0, 0.0),
        (radius, 0.0, springHeight),
    ]
    for index in range(1, segments + 1):
        angle = math.pi * index / segments
        vertices.append(
            (
                math.cos(angle) * radius,
                0.0,
                springHeight + math.sin(angle) * radius,
            )
        )
    faces = [tuple(range(len(vertices)))]
    meshData = bpy.data.meshes.new(name + "Mesh")
    meshData.from_pydata(vertices, [], faces)
    meshData.update()
    meshObject = bpy.data.objects.new(name, meshData)
    assetCollection.objects.link(meshObject)
    meshObject.parent = parent
    meshObject.location = location
    AssignMaterial(meshObject, material)
    return meshObject


def AddArchRing(
    assetCollection,
    parent,
    name,
    outerRadius,
    innerRadius,
    location,
    material,
    segments=7,
):
    vertices = []
    for yValue in (-0.012, 0.012):
        for radius in (outerRadius, innerRadius):
            for index in range(segments + 1):
                angle = math.pi * index / segments
                vertices.append(
                    (
                        math.cos(angle) * radius,
                        yValue,
                        math.sin(angle) * radius,
                    )
                )
    stride = segments + 1
    outerFront = 0
    innerFront = stride
    outerBack = stride * 2
    innerBack = stride * 3
    faces = []
    for index in range(segments):
        faces.append(
            (
                outerFront + index,
                outerFront + index + 1,
                innerFront + index + 1,
                innerFront + index,
            )
        )
        faces.append(
            (
                outerBack + index + 1,
                outerBack + index,
                innerBack + index,
                innerBack + index + 1,
            )
        )
        faces.append(
            (
                outerFront + index,
                outerBack + index,
                outerBack + index + 1,
                outerFront + index + 1,
            )
        )
        faces.append(
            (
                innerFront + index + 1,
                innerBack + index + 1,
                innerBack + index,
                innerFront + index,
            )
        )
    faces.extend(
        (
            (outerFront, innerFront, innerBack, outerBack),
            (
                outerFront + segments,
                outerBack + segments,
                innerBack + segments,
                innerFront + segments,
            ),
        )
    )
    meshData = bpy.data.meshes.new(name + "Mesh")
    meshData.from_pydata(vertices, [], faces)
    meshData.update()
    meshObject = bpy.data.objects.new(name, meshData)
    assetCollection.objects.link(meshObject)
    meshObject.parent = parent
    meshObject.location = location
    AssignMaterial(meshObject, material)
    return meshObject


def AddRectangularFrustum(
    assetCollection,
    parent,
    name,
    bottomSize,
    topSize,
    height,
    location,
    material,
):
    bottomX = bottomSize[0] * 0.5
    bottomY = bottomSize[1] * 0.5
    topX = topSize[0] * 0.5
    topY = topSize[1] * 0.5
    halfHeight = height * 0.5
    vertices = (
        (-bottomX, -bottomY, -halfHeight),
        (bottomX, -bottomY, -halfHeight),
        (bottomX, bottomY, -halfHeight),
        (-bottomX, bottomY, -halfHeight),
        (-topX, -topY, halfHeight),
        (topX, -topY, halfHeight),
        (topX, topY, halfHeight),
        (-topX, topY, halfHeight),
    )
    faces = (
        (0, 3, 2, 1),
        (4, 5, 6, 7),
        (0, 1, 5, 4),
        (1, 2, 6, 5),
        (2, 3, 7, 6),
        (3, 0, 4, 7),
    )
    meshData = bpy.data.meshes.new(name + "Mesh")
    meshData.from_pydata(vertices, [], faces)
    meshData.update()
    meshObject = bpy.data.objects.new(name, meshData)
    assetCollection.objects.link(meshObject)
    meshObject.parent = parent
    meshObject.location = location
    AssignMaterial(meshObject, material)
    return meshObject


def AddBasket(assetCollection, parent, name, location, materials):
    AddCone(
        assetCollection,
        parent,
        name + "_WovenBody",
        0.105,
        0.145,
        0.2,
        location,
        materials["straw"],
        8,
    )
    AddTorus(
        assetCollection,
        parent,
        name + "_Rim",
        0.13,
        0.012,
        (location[0], location[1], location[2] + 0.1),
        materials["rope"],
    )
    AddRod(
        assetCollection,
        parent,
        name + "_Handle",
        (location[0] - 0.11, location[1], location[2] + 0.08),
        (location[0] + 0.11, location[1], location[2] + 0.08),
        0.011,
        materials["rope"],
        5,
    )


def AddRoof(assetCollection, parent, name, width, depth, height, location, material):
    halfWidth = width * 0.5
    halfDepth = depth * 0.5
    vertices = [
        (-halfWidth, -halfDepth, 0.0),
        (halfWidth, -halfDepth, 0.0),
        (-halfWidth, halfDepth, 0.0),
        (halfWidth, halfDepth, 0.0),
        (0.0, -halfDepth, height),
        (0.0, halfDepth, height),
    ]
    faces = [
        (0, 1, 4),
        (2, 5, 3),
        (0, 4, 5, 2),
        (1, 3, 5, 4),
        (0, 2, 3, 1),
    ]
    meshData = bpy.data.meshes.new(name + "Mesh")
    meshData.from_pydata(vertices, [], faces)
    meshData.update()
    meshObject = bpy.data.objects.new(name, meshData)
    assetCollection.objects.link(meshObject)
    meshObject.parent = parent
    meshObject.location = location
    AssignMaterial(meshObject, material)
    return meshObject


def AddRoofDetails(
    assetCollection,
    parent,
    prefix,
    width,
    depth,
    wallHeight,
    roofHeight,
    materials,
):
    halfDepth = depth * 0.5
    ridgeHeight = wallHeight + roofHeight
    AddRod(
        assetCollection,
        parent,
        prefix + "_RidgeTile",
        (0.0, -halfDepth - 0.05, ridgeHeight + 0.025),
        (0.0, halfDepth + 0.05, ridgeHeight + 0.025),
        0.035,
        materials["tileLight"],
        8,
    )
    for side, sideName in ((-1.0, "Left"), (1.0, "Right")):
        xValue = side * width * 0.52
        AddRod(
            assetCollection,
            parent,
            prefix + "_" + sideName + "Eave",
            (xValue, -halfDepth - 0.05, wallHeight - 0.005),
            (xValue, halfDepth + 0.05, wallHeight - 0.005),
            0.027,
            materials["tileLight"],
            7,
        )
    for yIndex, yValue in enumerate((-halfDepth * 0.45, halfDepth * 0.45), start=1):
        for side, sideName in ((-1.0, "L"), (1.0, "R")):
            AddRod(
                assetCollection,
                parent,
                f"{prefix}_RoofRib{sideName}{yIndex}",
                (0.0, yValue, ridgeHeight),
                (side * width * 0.51, yValue, wallHeight),
                0.014,
                materials["tileLight"],
                5,
            )


def AddRootMetadata(rootObject, role, kind):
    rootObject["assetCategory"] = "Model"
    rootObject["assetRole"] = role
    rootObject["assetKind"] = kind
    rootObject["campaign"] = "EnemyRear1941"
    rootObject["groundPlaneZ"] = 0.0
    rootObject["metersPerUnit"] = 1.0
    rootObject["artStyle"] = "PaintedTabletopDiorama"
    rootObject["bitmapTextureCount"] = 0


def AddHat(assetCollection, personRoot, prefix, style, materials):
    if style == "straw":
        AddCylinder(assetCollection, personRoot, prefix + "_HatBrim", 0.19, 0.024, (0.0, 0.0, 1.02), materials["straw"], 10)
        AddCone(assetCollection, personRoot, prefix + "_HatCrown", 0.095, 0.065, 0.105, (0.0, 0.0, 1.075), materials["straw"], 8)
        AddCylinder(assetCollection, personRoot, prefix + "_HatBand", 0.099, 0.022, (0.0, 0.0, 1.043), materials["rope"], 8)
    elif style == "helmet":
        AddIcoSphere(assetCollection, personRoot, prefix + "_Helmet", 0.135, (0.0, 0.0, 1.035), materials["enemyHelmet"], (1.0, 1.0, 0.54))
        AddCylinder(assetCollection, personRoot, prefix + "_HelmetBrim", 0.145, 0.025, (0.0, 0.0, 1.01), materials["enemyHelmet"], 10)
        AddCylinder(assetCollection, personRoot, prefix + "_HelmetStud", 0.018, 0.025, (0.0, -0.132, 1.045), materials["brass"], 6, (math.pi * 0.5, 0.0, 0.0))
    else:
        AddCylinder(assetCollection, personRoot, prefix + "_CapCrown", 0.115, 0.065, (0.0, 0.0, 1.035), materials["playerCap"], 8)
        AddCube(assetCollection, personRoot, prefix + "_CapVisor", (0.12, 0.1, 0.018), (0.0, -0.09, 1.02), materials["playerCap"], (math.radians(8.0), 0.0, 0.0))


def AddPerson(
    assetCollection,
    parent,
    prefix,
    location,
    bodyMaterial,
    trouserMaterial,
    hatStyle,
    materials,
    bodyLean=0.0,
    heading=0.0,
    heightScale=1.0,
    stance="stand",
):
    personRoot = CreateEmpty(assetCollection, prefix, parent, location)
    personRoot.rotation_euler.z = heading
    personRoot.scale.z = heightScale
    if stance == "kneel":
        AddRod(assetCollection, personRoot, prefix + "_LeftThigh", (-0.065, 0.0, 0.38), (-0.15, -0.07, 0.18), 0.052, trouserMaterial, 6)
        AddRod(assetCollection, personRoot, prefix + "_LeftShin", (-0.15, -0.07, 0.18), (-0.22, -0.14, 0.045), 0.048, trouserMaterial, 6)
        AddRod(assetCollection, personRoot, prefix + "_RightThigh", (0.065, 0.0, 0.38), (0.1, 0.12, 0.2), 0.052, trouserMaterial, 6)
        AddRod(assetCollection, personRoot, prefix + "_RightShin", (0.1, 0.12, 0.2), (0.24, 0.19, 0.045), 0.048, trouserMaterial, 6)
        leftShoe = (-0.22, -0.16, 0.035)
        rightShoe = (0.24, 0.17, 0.035)
    elif stance == "stride":
        AddRod(assetCollection, personRoot, prefix + "_LeftLeg", (-0.065, 0.0, 0.36), (-0.11, -0.09, 0.045), 0.052, trouserMaterial, 6)
        AddRod(assetCollection, personRoot, prefix + "_RightLeg", (0.065, 0.0, 0.36), (0.12, 0.1, 0.045), 0.052, trouserMaterial, 6)
        leftShoe = (-0.11, -0.11, 0.035)
        rightShoe = (0.12, 0.08, 0.035)
    else:
        AddCylinder(assetCollection, personRoot, prefix + "_LeftLeg", 0.052, 0.36, (-0.065, 0.0, 0.18), trouserMaterial, 6)
        AddCylinder(assetCollection, personRoot, prefix + "_RightLeg", 0.052, 0.36, (0.065, 0.0, 0.18), trouserMaterial, 6)
        leftShoe = (-0.065, -0.035, 0.035)
        rightShoe = (0.065, -0.035, 0.035)
    AddBeveledCube(assetCollection, personRoot, prefix + "_LeftShoe", (0.1, 0.16, 0.055), leftShoe, materials["playerDark"], bevel=0.012)
    AddBeveledCube(assetCollection, personRoot, prefix + "_RightShoe", (0.1, 0.16, 0.055), rightShoe, materials["playerDark"], bevel=0.012)
    AddCone(assetCollection, personRoot, prefix + "_Torso", 0.17, 0.125, 0.43, (0.0, 0.0, 0.59), bodyMaterial, 7, (0.0, bodyLean, 0.0))
    AddRod(assetCollection, personRoot, prefix + "_LeftArm", (-0.13, 0.0, 0.7), (-0.19, -0.025, 0.42), 0.045, bodyMaterial, 6)
    AddRod(assetCollection, personRoot, prefix + "_RightArm", (0.13, 0.0, 0.7), (0.19, -0.025, 0.42), 0.045, bodyMaterial, 6)
    AddIcoSphere(assetCollection, personRoot, prefix + "_Head", 0.115, (0.0, 0.0, 0.93), materials["skin"], (0.92, 0.92, 1.08))
    AddHat(assetCollection, personRoot, prefix, hatStyle, materials)
    return personRoot


def AddRifle(assetCollection, personRoot, prefix, materials, side=1.0, longBarrel=False):
    xValue = 0.17 * side
    AddRod(assetCollection, personRoot, prefix + "_RifleStock", (xValue, 0.045, 0.32), (xValue - 0.04 * side, 0.025, 0.86), 0.025, materials["rifleWood"], 6)
    barrelEnd = 1.18 if longBarrel else 1.09
    AddRod(assetCollection, personRoot, prefix + "_RifleBarrel", (xValue - 0.04 * side, 0.025, 0.82), (xValue - 0.07 * side, 0.015, barrelEnd), 0.013, materials["metal"], 6)
    AddCube(assetCollection, personRoot, prefix + "_RifleButt", (0.095, 0.055, 0.17), (xValue + 0.01 * side, 0.05, 0.29), materials["rifleWood"], (0.0, math.radians(8.0 * side), 0.0))


def AddReadyRifle(assetCollection, personRoot, prefix, materials, direction=1.0):
    start = (-0.28 * direction, -0.16, 0.55)
    receiver = (0.12 * direction, -0.17, 0.67)
    muzzle = (0.46 * direction, -0.18, 0.73)
    AddRod(assetCollection, personRoot, prefix + "_ReadyRifleStock", start, receiver, 0.026, materials["rifleWood"], 6)
    AddRod(assetCollection, personRoot, prefix + "_ReadyRifleBarrel", receiver, muzzle, 0.013, materials["metal"], 6)
    AddBeveledCube(
        assetCollection,
        personRoot,
        prefix + "_ReadyRifleButt",
        (0.17, 0.07, 0.1),
        (-0.24 * direction, -0.16, 0.53),
        materials["rifleWood"],
        (0.0, math.radians(12.0 * direction), 0.0),
        0.012,
    )
    AddRod(
        assetCollection,
        personRoot,
        prefix + "_RifleSling",
        (-0.18 * direction, -0.13, 0.5),
        (0.22 * direction, -0.13, 0.59),
        0.006,
        materials["canvas"],
        5,
    )


def AddPack(assetCollection, personRoot, prefix, materials, colorKey="canvas"):
    AddBeveledCube(assetCollection, personRoot, prefix + "_FieldPack", (0.26, 0.13, 0.32), (0.0, 0.13, 0.61), materials[colorKey], (math.radians(-4.0), 0.0, 0.0), 0.02)
    AddRod(assetCollection, personRoot, prefix + "_PackRoll", (-0.11, 0.16, 0.8), (0.11, 0.16, 0.8), 0.035, materials["civilianGrey"], 6)


def AddBicycle(assetCollection, parent, prefix, materials, offset=(0.0, 0.0, 0.0), lean=0.0):
    bicycleRoot = CreateEmpty(assetCollection, prefix, parent, offset)
    bicycleRoot.rotation_euler.y = lean
    wheelRadius = 0.28
    AddTorus(assetCollection, bicycleRoot, prefix + "_RearWheel", wheelRadius, 0.017, (-0.32, 0.0, wheelRadius), materials["metal"], (math.pi * 0.5, 0.0, 0.0))
    AddTorus(assetCollection, bicycleRoot, prefix + "_FrontWheel", wheelRadius, 0.017, (0.32, 0.0, wheelRadius), materials["metal"], (math.pi * 0.5, 0.0, 0.0))
    for wheelIndex, wheelX in enumerate((-0.32, 0.32), start=1):
        for spokeIndex, angle in enumerate((0.0, math.pi * 0.33, math.pi * 0.66), start=1):
            dxValue = math.cos(angle) * wheelRadius
            dzValue = math.sin(angle) * wheelRadius
            AddRod(
                assetCollection,
                bicycleRoot,
                f"{prefix}_Wheel{wheelIndex}Spoke{spokeIndex}A",
                (wheelX - dxValue, 0.0, wheelRadius - dzValue),
                (wheelX + dxValue, 0.0, wheelRadius + dzValue),
                0.0045,
                materials["metal"],
                5,
            )
    AddRod(assetCollection, bicycleRoot, prefix + "_FrameLower", (-0.3, 0.0, 0.3), (0.05, 0.0, 0.32), 0.018, materials["signalBlue"], 6)
    AddRod(assetCollection, bicycleRoot, prefix + "_FrameUpper", (-0.22, 0.0, 0.53), (0.05, 0.0, 0.32), 0.018, materials["signalBlue"], 6)
    AddRod(assetCollection, bicycleRoot, prefix + "_FrameSeat", (-0.3, 0.0, 0.3), (-0.22, 0.0, 0.53), 0.018, materials["signalBlue"], 6)
    AddRod(assetCollection, bicycleRoot, prefix + "_FrameFront", (-0.22, 0.0, 0.53), (0.25, 0.0, 0.55), 0.018, materials["signalBlue"], 6)
    AddRod(assetCollection, bicycleRoot, prefix + "_Fork", (0.32, 0.0, 0.28), (0.25, 0.0, 0.58), 0.014, materials["metal"], 6)
    AddRod(assetCollection, bicycleRoot, prefix + "_Handlebar", (0.19, -0.11, 0.61), (0.19, 0.11, 0.61), 0.014, materials["metal"], 6)
    AddBeveledCube(assetCollection, bicycleRoot, prefix + "_Seat", (0.15, 0.08, 0.035), (-0.23, 0.0, 0.58), materials["door"], bevel=0.01)
    return bicycleRoot


def BuildWorkTeam(assetCollection, materials):
    root = CreateEmpty(assetCollection, "Model_WorkTeam")
    AddRootMetadata(root, "WorkTeam", "Unit")
    workerA = AddPerson(
        assetCollection,
        root,
        "Model_WorkTeam_WorkerA",
        (-0.22, 0.06, 0.0),
        materials["civilianBlue"],
        materials["civilianGrey"],
        "cloth",
        materials,
        bodyLean=math.radians(-4.0),
        heading=math.radians(-12.0),
        stance="stride",
    )
    workerB = AddPerson(
        assetCollection,
        root,
        "Model_WorkTeam_WorkerB",
        (0.23, -0.1, 0.0),
        materials["civilianBrown"],
        materials["civilianGrey"],
        "straw",
        materials,
        heading=math.radians(14.0),
    )
    AddRod(assetCollection, workerA, "Model_WorkTeam_MattockHandle", (-0.2, 0.01, 0.12), (0.2, -0.04, 0.92), 0.018, materials["wood"], 6)
    AddBeveledCube(assetCollection, workerA, "Model_WorkTeam_MattockHead", (0.3, 0.055, 0.055), (0.24, -0.04, 0.96), materials["metal"], (0.0, math.radians(-17.0), 0.0), 0.012)
    AddBeveledCube(assetCollection, workerA, "Model_WorkTeam_DocumentSatchel", (0.21, 0.09, 0.2), (-0.18, 0.08, 0.48), materials["canvas"], (0.0, math.radians(6.0), 0.0), 0.018)
    AddRod(assetCollection, workerA, "Model_WorkTeam_SatchelStrap", (-0.17, 0.09, 0.42), (0.12, 0.08, 0.83), 0.01, materials["rope"], 5)
    AddRod(assetCollection, workerB, "Model_WorkTeam_ShoulderPole", (-0.34, 0.0, 0.78), (0.34, 0.0, 0.78), 0.022, materials["wood"], 6)
    AddBasket(assetCollection, workerB, "Model_WorkTeam_LeftBasket", (-0.32, 0.0, 0.48), materials)
    AddBasket(assetCollection, workerB, "Model_WorkTeam_RightBasket", (0.32, 0.0, 0.48), materials)
    AddRod(assetCollection, workerB, "Model_WorkTeam_LeftBasketRope", (-0.32, 0.0, 0.58), (-0.32, 0.0, 0.77), 0.008, materials["rope"], 5)
    AddRod(assetCollection, workerB, "Model_WorkTeam_RightBasketRope", (0.32, 0.0, 0.58), (0.32, 0.0, 0.77), 0.008, materials["rope"], 5)
    return root


def BuildGuerrilla(assetCollection, materials):
    root = CreateEmpty(assetCollection, "Model_Guerrilla")
    AddRootMetadata(root, "Guerrilla", "Unit")
    fighterA = AddPerson(
        assetCollection,
        root,
        "Model_Guerrilla_Fighter1",
        (-0.25, 0.08, 0.0),
        materials["playerUniform"],
        materials["playerDark"],
        "cloth",
        materials,
        bodyLean=math.radians(-7.0),
        heading=math.radians(-26.0),
        stance="stride",
    )
    fighterB = AddPerson(
        assetCollection,
        root,
        "Model_Guerrilla_Fighter2",
        (0.25, 0.04, 0.0),
        materials["civilianBrown"],
        materials["playerDark"],
        "cloth",
        materials,
        heading=math.radians(24.0),
        heightScale=0.97,
    )
    fighterC = AddPerson(
        assetCollection,
        root,
        "Model_Guerrilla_Fighter3",
        (0.02, -0.23, 0.0),
        materials["playerUniform"],
        materials["civilianGrey"],
        "cloth",
        materials,
        bodyLean=math.radians(-11.0),
        heading=math.radians(5.0),
        heightScale=0.84,
        stance="kneel",
    )
    AddReadyRifle(assetCollection, fighterA, "Model_Guerrilla_Fighter1", materials, 1.0)
    AddBeveledCube(assetCollection, fighterB, "Model_Guerrilla_FieldSatchel", (0.22, 0.1, 0.22), (0.19, 0.03, 0.48), materials["canvas"], (0.0, math.radians(-8.0), 0.0), 0.018)
    AddRod(assetCollection, fighterB, "Model_Guerrilla_Bandolier", (-0.15, -0.13, 0.76), (0.15, -0.13, 0.46), 0.016, materials["rifleWood"], 5)
    AddReadyRifle(assetCollection, fighterC, "Model_Guerrilla_Fighter3", materials, -1.0)
    return root


def BuildMainForce(assetCollection, materials):
    root = CreateEmpty(assetCollection, "Model_MainForce")
    AddRootMetadata(root, "MainForce", "Unit")
    soldierA = AddPerson(assetCollection, root, "Model_MainForce_Soldier1", (-0.27, 0.1, 0.0), materials["playerDark"], materials["playerDark"], "cloth", materials, heading=math.radians(-20.0), stance="stride")
    soldierB = AddPerson(assetCollection, root, "Model_MainForce_Soldier2", (0.25, 0.1, 0.0), materials["playerUniform"], materials["playerDark"], "cloth", materials, heading=math.radians(20.0), heightScale=1.02)
    gunner = AddPerson(assetCollection, root, "Model_MainForce_Soldier3", (0.0, -0.24, 0.0), materials["playerDark"], materials["playerDark"], "cloth", materials, bodyLean=math.radians(-10.0), heightScale=0.84, stance="kneel")
    AddPack(assetCollection, soldierA, "Model_MainForce_Soldier1", materials)
    AddPack(assetCollection, soldierB, "Model_MainForce_Soldier2", materials)
    AddReadyRifle(assetCollection, soldierA, "Model_MainForce_Soldier1", materials, 1.0)
    AddRifle(assetCollection, soldierB, "Model_MainForce_Soldier2", materials, -1.0, True)
    AddRod(assetCollection, gunner, "Model_MainForce_ZB26Receiver", (-0.32, -0.16, 0.56), (0.15, -0.16, 0.69), 0.033, materials["metal"], 7)
    AddRod(assetCollection, gunner, "Model_MainForce_ZB26Barrel", (0.12, -0.16, 0.68), (0.48, -0.16, 0.76), 0.017, materials["metal"], 7)
    AddBeveledCube(assetCollection, gunner, "Model_MainForce_ZB26Stock", (0.24, 0.08, 0.13), (-0.28, -0.16, 0.55), materials["rifleWood"], (0.0, math.radians(-12.0), 0.0), 0.015)
    AddBeveledCube(assetCollection, gunner, "Model_MainForce_ZB26TopMagazine", (0.11, 0.07, 0.23), (0.02, -0.16, 0.8), materials["metal"], (0.0, math.radians(-4.0), 0.0), 0.012)
    AddRod(assetCollection, gunner, "Model_MainForce_ZB26CarryHandle", (-0.02, -0.21, 0.73), (0.11, -0.21, 0.76), 0.01, materials["wood"], 5)
    AddRod(assetCollection, gunner, "Model_MainForce_LeftBipod", (0.34, -0.16, 0.72), (0.25, -0.22, 0.34), 0.012, materials["metal"], 5)
    AddRod(assetCollection, gunner, "Model_MainForce_RightBipod", (0.34, -0.16, 0.72), (0.43, -0.1, 0.34), 0.012, materials["metal"], 5)
    return root


def BuildMilitia(assetCollection, materials):
    root = CreateEmpty(assetCollection, "Model_Militia")
    AddRootMetadata(root, "Militia", "Unit")
    personA = AddPerson(assetCollection, root, "Model_Militia_MemberA", (-0.25, 0.08, 0.0), materials["civilianBrown"], materials["civilianGrey"], "straw", materials, heading=math.radians(-16.0), stance="stride")
    personB = AddPerson(assetCollection, root, "Model_Militia_MemberB", (0.24, 0.07, 0.0), materials["civilianBlue"], materials["civilianGrey"], "cloth", materials, heading=math.radians(17.0))
    personC = AddPerson(assetCollection, root, "Model_Militia_MemberC", (0.0, -0.23, 0.0), materials["civilianGrey"], materials["civilianBrown"], "straw", materials, heading=math.radians(4.0), heightScale=0.96)
    AddRod(assetCollection, personA, "Model_Militia_LongSpear", (0.18, 0.0, 0.15), (0.12, 0.0, 1.42), 0.017, materials["wood"], 6)
    AddCone(assetCollection, personA, "Model_Militia_SpearPoint", 0.035, 0.0, 0.17, (0.115, 0.0, 1.5), materials["metal"], 5)
    AddReadyRifle(assetCollection, personB, "Model_Militia_MemberB", materials, -1.0)
    AddCylinder(assetCollection, personC, "Model_Militia_AlarmGong", 0.17, 0.025, (0.2, -0.05, 0.57), materials["brass"], 12, (math.pi * 0.5, 0.0, 0.0))
    AddRod(assetCollection, personC, "Model_Militia_GongMallet", (-0.16, -0.07, 0.3), (0.05, -0.07, 0.68), 0.018, materials["wood"], 6)
    return root


def BuildCourier(assetCollection, materials):
    root = CreateEmpty(assetCollection, "Model_Courier")
    AddRootMetadata(root, "Courier", "Unit")
    AddBicycle(assetCollection, root, "Model_Courier_Bicycle", materials)
    AddRod(assetCollection, root, "Model_Courier_RearRackLeft", (-0.48, -0.11, 0.51), (-0.18, -0.11, 0.51), 0.012, materials["metal"], 5)
    AddRod(assetCollection, root, "Model_Courier_RearRackRight", (-0.48, 0.11, 0.51), (-0.18, 0.11, 0.51), 0.012, materials["metal"], 5)
    rider = CreateEmpty(assetCollection, "Model_Courier_Rider", root)
    AddCone(assetCollection, rider, "Model_Courier_RiderTorso", 0.16, 0.12, 0.38, (-0.08, 0.0, 0.78), materials["civilianBlue"], 7, (0.0, math.radians(-14.0), 0.0))
    AddIcoSphere(assetCollection, rider, "Model_Courier_RiderHead", 0.11, (-0.16, 0.0, 1.04), materials["skin"], (0.92, 0.92, 1.08))
    hatRoot = CreateEmpty(assetCollection, "Model_Courier_RiderHatRoot", rider, (-0.16, 0.0, 0.0))
    AddHat(assetCollection, hatRoot, "Model_Courier_Rider", "cloth", materials)
    AddRod(assetCollection, rider, "Model_Courier_LeftArm", (-0.16, -0.07, 0.87), (0.19, -0.09, 0.61), 0.042, materials["civilianBlue"], 6)
    AddRod(assetCollection, rider, "Model_Courier_RightArm", (-0.16, 0.07, 0.87), (0.19, 0.09, 0.61), 0.042, materials["civilianBlue"], 6)
    AddRod(assetCollection, rider, "Model_Courier_LeftLeg", (-0.02, -0.05, 0.65), (-0.12, -0.04, 0.3), 0.045, materials["civilianGrey"], 6)
    AddRod(assetCollection, rider, "Model_Courier_RightLeg", (-0.02, 0.05, 0.65), (0.12, 0.04, 0.28), 0.045, materials["civilianGrey"], 6)
    AddBeveledCube(assetCollection, rider, "Model_Courier_MessageSatchel", (0.25, 0.1, 0.24), (-0.24, 0.1, 0.7), materials["canvas"], (math.radians(-7.0), 0.0, math.radians(9.0)), 0.018)
    AddRod(assetCollection, rider, "Model_Courier_SatchelStrap", (-0.28, 0.11, 0.58), (0.02, 0.1, 0.93), 0.014, materials["door"], 5)
    AddCylinder(assetCollection, rider, "Model_Courier_MessageTube", 0.035, 0.28, (-0.35, 0.13, 0.69), materials["paper"], 7, (0.0, math.pi * 0.5, math.radians(8.0)))
    return root


def BuildEnemyPatrol(assetCollection, materials):
    root = CreateEmpty(assetCollection, "Model_EnemyPatrol")
    AddRootMetadata(root, "EnemyPatrol", "Unit")
    officer = AddPerson(assetCollection, root, "Model_EnemyPatrol_Officer", (-0.23, 0.09, 0.0), materials["enemyUniformLight"], materials["enemyUniform"], "helmet", materials, heading=math.radians(-17.0))
    soldierA = AddPerson(assetCollection, root, "Model_EnemyPatrol_Soldier2", (0.24, 0.07, 0.0), materials["enemyUniform"], materials["enemyDark"], "helmet", materials, heading=math.radians(19.0), stance="stride")
    soldierB = AddPerson(assetCollection, root, "Model_EnemyPatrol_Soldier3", (0.02, -0.22, 0.0), materials["enemyUniform"], materials["enemyDark"], "helmet", materials, bodyLean=math.radians(-5.0), heightScale=0.98)
    AddBeveledCube(assetCollection, officer, "Model_EnemyPatrol_OfficerCase", (0.2, 0.09, 0.2), (-0.19, 0.04, 0.49), materials["enemyDark"], bevel=0.016)
    AddCylinder(assetCollection, officer, "Model_EnemyPatrol_BinocularLeft", 0.035, 0.09, (-0.045, -0.15, 0.76), materials["metal"], 7, (math.pi * 0.5, 0.0, 0.0))
    AddCylinder(assetCollection, officer, "Model_EnemyPatrol_BinocularRight", 0.035, 0.09, (0.045, -0.15, 0.76), materials["metal"], 7, (math.pi * 0.5, 0.0, 0.0))
    AddRod(assetCollection, officer, "Model_EnemyPatrol_BinocularBridge", (-0.04, -0.15, 0.76), (0.04, -0.15, 0.76), 0.012, materials["metal"], 5)
    AddReadyRifle(assetCollection, soldierA, "Model_EnemyPatrol_Soldier2", materials, -1.0)
    AddRifle(assetCollection, soldierB, "Model_EnemyPatrol_Soldier3", materials, 1.0, True)
    for index, person in enumerate((officer, soldierA, soldierB), start=1):
        AddCylinder(assetCollection, person, f"Model_EnemyPatrol_Puttee{index}Left", 0.058, 0.16, (-0.065, 0.0, 0.16), materials["enemyUniformLight"], 6)
        AddCylinder(assetCollection, person, f"Model_EnemyPatrol_Puttee{index}Right", 0.058, 0.16, (0.065, 0.0, 0.16), materials["enemyUniformLight"], 6)
        AddBeveledCube(assetCollection, person, f"Model_EnemyPatrol_AmmoPouch{index}", (0.17, 0.07, 0.09), (0.0, -0.14, 0.44), materials["enemyDark"], bevel=0.012)
    return root


def AddHouseCore(assetCollection, parent, prefix, materials, width=1.2, depth=0.78, wallHeight=0.58):
    AddBeveledCube(assetCollection, parent, prefix + "_Walls", (width, depth, wallHeight), (0.0, 0.0, wallHeight * 0.5), materials["mudWall"], bevel=0.035)
    AddBeveledCube(assetCollection, parent, prefix + "_SunPatch", (width * 0.46, 0.018, wallHeight * 0.34), (-width * 0.18, -depth * 0.506, wallHeight * 0.68), materials["mudWallLight"], bevel=0.006)
    AddRoof(assetCollection, parent, prefix + "_Roof", width + 0.16, depth + 0.16, 0.35, (0.0, 0.0, wallHeight), materials["tile"])
    AddRoofDetails(assetCollection, parent, prefix, width + 0.16, depth + 0.16, wallHeight, 0.35, materials)
    AddBeveledCube(assetCollection, parent, prefix + "_Door", (0.22, 0.025, 0.39), (0.23, -depth * 0.51, 0.195), materials["door"], bevel=0.012)
    AddRod(assetCollection, parent, prefix + "_DoorBrace", (0.13, -depth * 0.535, 0.11), (0.33, -depth * 0.535, 0.31), 0.014, materials["wood"], 5)
    AddBeveledCube(assetCollection, parent, prefix + "_Window", (0.25, 0.025, 0.18), (-0.27, -depth * 0.515, 0.36), materials["darkOpening"], bevel=0.008)
    for index, xValue in enumerate((-0.35, -0.27, -0.19), start=1):
        AddRod(assetCollection, parent, f"{prefix}_WindowBar{index}", (xValue, -depth * 0.535, 0.285), (xValue, -depth * 0.535, 0.435), 0.01, materials["wood"], 5)
    AddRod(assetCollection, parent, prefix + "_WindowCrossbar", (-0.385, -depth * 0.535, 0.36), (-0.155, -depth * 0.535, 0.36), 0.01, materials["wood"], 5)
    AddBeveledCube(assetCollection, parent, prefix + "_StoneFooting", (width + 0.04, depth + 0.04, 0.12), (0.0, 0.0, 0.06), materials["stone"], bevel=0.025)


def BuildVillageHouse(assetCollection, materials):
    root = CreateEmpty(assetCollection, "Model_VillageHouse")
    AddRootMetadata(root, "VillageHouse", "Structure")
    AddHouseCore(assetCollection, root, "Model_VillageHouse_Main", materials, 1.28, 0.76, 0.58)
    AddBeveledCube(assetCollection, root, "Model_VillageHouse_LeftCourtyardWall", (0.12, 0.75, 0.28), (-0.68, -0.33, 0.14), materials["stone"], bevel=0.022)
    AddBeveledCube(assetCollection, root, "Model_VillageHouse_RightCourtyardWall", (0.12, 0.75, 0.28), (0.68, -0.33, 0.14), materials["stoneLight"], bevel=0.022)
    AddBeveledCube(assetCollection, root, "Model_VillageHouse_FrontWallLeft", (0.48, 0.12, 0.28), (-0.44, -0.7, 0.14), materials["stone"], bevel=0.022)
    AddBeveledCube(assetCollection, root, "Model_VillageHouse_FrontWallRight", (0.48, 0.12, 0.28), (0.44, -0.7, 0.14), materials["stoneLight"], bevel=0.022)
    AddBeveledCube(assetCollection, root, "Model_VillageHouse_GateLintel", (0.34, 0.14, 0.1), (0.0, -0.7, 0.36), materials["wood"], bevel=0.018)
    AddCylinder(assetCollection, root, "Model_VillageHouse_Chimney", 0.07, 0.42, (0.42, 0.1, 0.89), materials["stone"], 6)
    AddCylinder(assetCollection, root, "Model_VillageHouse_ChimneyCap", 0.095, 0.055, (0.42, 0.1, 1.11), materials["stoneLight"], 8)
    AddBeveledCube(assetCollection, root, "Model_VillageHouse_CellarBank", (0.48, 0.42, 0.38), (-0.43, 0.28, 0.19), materials["earth"], bevel=0.05)
    AddArchPanel(assetCollection, root, "Model_VillageHouse_CellarOpening", 0.28, 0.3, (-0.43, 0.058, 0.02), materials["darkOpening"], 7)
    AddArchRing(assetCollection, root, "Model_VillageHouse_CellarArch", 0.18, 0.145, (-0.43, 0.04, 0.18), materials["stoneLight"], 7)
    for index, xValue in enumerate((-0.52, -0.44, -0.36), start=1):
        AddRod(assetCollection, root, f"Model_VillageHouse_WoodLog{index}", (xValue, -0.57, 0.055), (xValue + 0.2, -0.53, 0.055), 0.035, materials["wood"], 6)
    AddCone(assetCollection, root, "Model_VillageHouse_WaterJar", 0.075, 0.055, 0.18, (0.5, -0.5, 0.09), materials["terracotta"], 8)
    return root


def BuildEnemyBlockhouse(assetCollection, materials):
    root = CreateEmpty(assetCollection, "Model_EnemyBlockhouse")
    AddRootMetadata(root, "EnemyBlockhouse", "Structure")
    AddBeveledCube(assetCollection, root, "Model_EnemyBlockhouse_Foundation", (1.18, 1.08, 0.18), (0.0, 0.0, 0.09), materials["earth"], bevel=0.035)
    AddRectangularFrustum(
        assetCollection,
        root,
        "Model_EnemyBlockhouse_Tower",
        (0.92, 0.84),
        (0.82, 0.74),
        0.78,
        (0.0, 0.0, 0.55),
        materials["mudWall"],
    )
    AddCube(assetCollection, root, "Model_EnemyBlockhouse_StoneBandLower", (0.94, 0.86, 0.07), (0.0, 0.0, 0.29), materials["stoneLight"])
    AddCube(assetCollection, root, "Model_EnemyBlockhouse_StoneBandUpper", (0.86, 0.78, 0.065), (0.0, 0.0, 0.78), materials["stoneLight"])
    AddBeveledCube(assetCollection, root, "Model_EnemyBlockhouse_FlatRoof", (0.98, 0.9, 0.13), (0.0, 0.0, 1.005), materials["enemyDark"], bevel=0.028)
    slitData = (
        ((0.0, -0.394, 0.67), (0.24, 0.025, 0.075), 0.0),
        ((0.0, 0.394, 0.67), (0.24, 0.025, 0.075), 0.0),
        ((-0.434, 0.0, 0.67), (0.025, 0.22, 0.075), math.pi * 0.5),
        ((0.434, 0.0, 0.67), (0.025, 0.22, 0.075), math.pi * 0.5),
    )
    for index, (location, size, rotationZ) in enumerate(slitData, start=1):
        AddCube(assetCollection, root, f"Model_EnemyBlockhouse_FiringSlit{index}", size, location, materials["darkOpening"], (0.0, 0.0, rotationZ))
    sandbagData = (
        (-0.45, -0.59, 0.0),
        (-0.15, -0.59, 0.02),
        (0.15, -0.59, -0.02),
        (0.45, -0.59, 0.0),
        (-0.59, -0.3, math.pi * 0.5),
        (0.59, -0.3, math.pi * 0.5),
    )
    for index, (xValue, yValue, rotationZ) in enumerate(sandbagData, start=1):
        AddBeveledCube(assetCollection, root, f"Model_EnemyBlockhouse_Sandbag{index}", (0.27, 0.16, 0.12), (xValue, yValue, 0.1), materials["earth" if index % 2 else "mudWallLight"], (0.0, 0.0, rotationZ), 0.025)
    for index, xValue in enumerate((-0.72, 0.72), start=1):
        AddRod(assetCollection, root, f"Model_EnemyBlockhouse_WirePost{index}", (xValue, -0.48, 0.0), (xValue, -0.48, 0.52), 0.018, materials["wood"], 6)
    AddRod(assetCollection, root, "Model_EnemyBlockhouse_WireUpper", (-0.72, -0.48, 0.42), (0.72, -0.48, 0.42), 0.008, materials["metal"], 5)
    AddRod(assetCollection, root, "Model_EnemyBlockhouse_WireLower", (-0.72, -0.48, 0.22), (0.72, -0.48, 0.22), 0.008, materials["metal"], 5)
    return root


def BuildTrafficStation(assetCollection, materials):
    root = CreateEmpty(assetCollection, "Model_TrafficStation")
    AddRootMetadata(root, "TrafficStation", "Structure")
    AddHouseCore(assetCollection, root, "Model_TrafficStation_HiddenHouse", materials, 1.05, 0.68, 0.5)
    AddArchPanel(assetCollection, root, "Model_TrafficStation_CellarDoor", 0.3, 0.24, (-0.28, -0.355, 0.025), materials["darkOpening"], 7)
    AddArchRing(assetCollection, root, "Model_TrafficStation_CellarArch", 0.19, 0.155, (-0.28, -0.37, 0.145), materials["stoneLight"], 7)
    AddRod(assetCollection, root, "Model_TrafficStation_ConcealedWire", (-0.43, -0.355, 0.47), (0.42, -0.355, 0.47), 0.006, materials["metal"], 5)
    AddCylinder(assetCollection, root, "Model_TrafficStation_InsulatorLeft", 0.022, 0.045, (-0.4, -0.36, 0.47), materials["paper"], 6, (math.pi * 0.5, 0.0, 0.0))
    AddCylinder(assetCollection, root, "Model_TrafficStation_InsulatorRight", 0.022, 0.045, (0.39, -0.36, 0.47), materials["paper"], 6, (math.pi * 0.5, 0.0, 0.0))
    AddBicycle(assetCollection, root, "Model_TrafficStation_CourierBicycle", materials, (-0.72, 0.15, 0.0))
    AddBeveledCube(assetCollection, root, "Model_TrafficStation_MessageChest", (0.28, 0.2, 0.18), (0.48, -0.46, 0.09), materials["door"], bevel=0.025)
    AddRod(assetCollection, root, "Model_TrafficStation_ChestBand", (0.34, -0.57, 0.11), (0.62, -0.57, 0.11), 0.012, materials["metal"], 5)
    AddCylinder(assetCollection, root, "Model_TrafficStation_CableSpool", 0.08, 0.2, (-0.49, -0.4, 0.11), materials["wood"], 8, (0.0, math.pi * 0.5, 0.0))
    return root


def BuildRailwayStation(assetCollection, materials):
    root = CreateEmpty(assetCollection, "Model_RailwayStation")
    AddRootMetadata(root, "RailwayStation", "Structure")
    houseX = -0.32
    houseY = 0.23
    wallWidth = 1.34
    wallDepth = 0.62
    wallHeight = 0.55
    AddBeveledCube(assetCollection, root, "Model_RailwayStation_Walls", (wallWidth, wallDepth, wallHeight), (houseX, houseY, wallHeight * 0.5), materials["mudWall"], bevel=0.03)
    AddBeveledCube(assetCollection, root, "Model_RailwayStation_Footing", (1.42, 0.68, 0.12), (houseX, houseY, 0.06), materials["stone"], bevel=0.025)
    AddRoof(assetCollection, root, "Model_RailwayStation_Roof", 1.5, 0.76, 0.3, (houseX, houseY, wallHeight), materials["tile"])
    AddRod(assetCollection, root, "Model_RailwayStation_Ridge", (houseX, houseY - 0.41, 0.875), (houseX, houseY + 0.41, 0.875), 0.032, materials["tileLight"], 7)
    AddRod(assetCollection, root, "Model_RailwayStation_LeftEave", (houseX - 0.76, houseY - 0.4, 0.54), (houseX - 0.76, houseY + 0.4, 0.54), 0.024, materials["tileLight"], 6)
    AddRod(assetCollection, root, "Model_RailwayStation_RightEave", (houseX + 0.76, houseY - 0.4, 0.54), (houseX + 0.76, houseY + 0.4, 0.54), 0.024, materials["tileLight"], 6)
    AddBeveledCube(assetCollection, root, "Model_RailwayStation_Door", (0.22, 0.025, 0.39), (-0.05, -0.092, 0.195), materials["door"], bevel=0.012)
    AddCube(assetCollection, root, "Model_RailwayStation_Window", (0.28, 0.025, 0.18), (-0.6, -0.095, 0.36), materials["darkOpening"])
    for index, xValue in enumerate((-0.69, -0.6, -0.51), start=1):
        AddRod(assetCollection, root, f"Model_RailwayStation_WindowBar{index}", (xValue, -0.115, 0.285), (xValue, -0.115, 0.435), 0.009, materials["wood"], 5)
    AddBeveledCube(assetCollection, root, "Model_RailwayStation_NameBoard", (0.42, 0.025, 0.15), (0.18, -0.105, 0.46), materials["paper"], bevel=0.008)
    AddBeveledCube(assetCollection, root, "Model_RailwayStation_Platform", (1.85, 0.34, 0.11), (0.0, -0.24, 0.055), materials["stone"], bevel=0.025)
    AddCylinder(assetCollection, root, "Model_RailwayStation_SemaphorePost", 0.025, 1.26, (0.93, 0.28, 0.68), materials["metal"], 7)
    AddBeveledCube(assetCollection, root, "Model_RailwayStation_SemaphoreArm", (0.46, 0.045, 0.08), (1.08, 0.28, 1.15), materials["mutedRed"], (0.0, 0.0, math.radians(-18.0)), 0.012)
    AddCylinder(assetCollection, root, "Model_RailwayStation_SemaphorePivot", 0.055, 0.04, (0.93, 0.255, 1.15), materials["paper"], 8, (math.pi * 0.5, 0.0, 0.0))
    AddRod(assetCollection, root, "Model_RailwayStation_TelegraphCrossbar", (0.68, 0.28, 1.29), (1.18, 0.28, 1.29), 0.018, materials["wood"], 6)
    AddCylinder(assetCollection, root, "Model_RailwayStation_InsulatorLeft", 0.022, 0.055, (0.72, 0.28, 1.33), materials["paper"], 6)
    AddCylinder(assetCollection, root, "Model_RailwayStation_InsulatorRight", 0.022, 0.055, (1.14, 0.28, 1.33), materials["paper"], 6)
    return root


def RemoveExistingAssetCollection():
    existingCollection = bpy.data.collections.get(ASSET_COLLECTION_NAME)
    if existingCollection is None:
        return
    for obj in tuple(existingCollection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(existingCollection)


def TriangleCount(meshObject):
    meshObject.data.calc_loop_triangles()
    return len(meshObject.data.loop_triangles)


def Descendants(rootObject):
    descendants = []
    pending = list(rootObject.children)
    while pending:
        child = pending.pop()
        descendants.append(child)
        pending.extend(child.children)
    return descendants


def AddSourceColors(meshObject):
    meshData = meshObject.data
    oldAttribute = meshData.color_attributes.get("Color")
    if oldAttribute is not None:
        meshData.color_attributes.remove(oldAttribute)
    colorAttribute = meshData.color_attributes.new(
        name="Color",
        type="BYTE_COLOR",
        domain="CORNER",
    )
    for polygon in meshData.polygons:
        sourceMaterial = None
        if polygon.material_index < len(meshObject.material_slots):
            sourceMaterial = meshObject.material_slots[polygon.material_index].material
        color = tuple(sourceMaterial.diffuse_color) if sourceMaterial else (1.0, 1.0, 1.0, 1.0)
        for loopIndex in polygon.loop_indices:
            colorAttribute.data[loopIndex].color_srgb = color
    meshData.color_attributes.active = colorAttribute
    meshData.color_attributes.active_color = colorAttribute


def MergeAssetToVertexColorMesh(assetCollection, rootObject, vertexColorMaterial):
    descendants = Descendants(rootObject)
    meshObjects = [obj for obj in descendants if obj.type == "MESH"]
    helperObjects = [obj for obj in descendants if obj.type != "MESH"]
    if not meshObjects:
        raise RuntimeError(f"{rootObject.name} has no source meshes")
    for meshObject in meshObjects:
        AddSourceColors(meshObject)
        worldMatrix = meshObject.matrix_world.copy()
        meshObject.parent = None
        meshObject.matrix_world = worldMatrix
    bpy.ops.object.select_all(action="DESELECT")
    for meshObject in meshObjects:
        meshObject.select_set(True)
    mergedObject = meshObjects[0]
    bpy.context.view_layer.objects.active = mergedObject
    bpy.ops.object.join()
    bpy.context.view_layer.objects.active = mergedObject
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    mergedObject.name = rootObject.name + "_Geometry"
    mergedObject.data.name = rootObject.name + "_GeometryMesh"
    mergedObject.data.materials.clear()
    mergedObject.data.materials.append(vertexColorMaterial)
    for polygon in mergedObject.data.polygons:
        polygon.material_index = 0
        polygon.use_smooth = False
    colorAttribute = mergedObject.data.color_attributes.get("Color")
    if colorAttribute is None:
        raise RuntimeError(f"{rootObject.name} lost its vertex color attribute during merge")
    mergedObject.data.color_attributes.active = colorAttribute
    mergedObject.data.color_attributes.active_color = colorAttribute
    mergedObject.parent = rootObject
    mergedObject.matrix_parent_inverse.identity()
    for helperObject in helperObjects:
        if helperObject.name in bpy.data.objects:
            bpy.data.objects.remove(helperObject, do_unlink=True)
    mergedObject["sourcePartCount"] = len(meshObjects)
    mergedObject["vertexColorAttribute"] = "Color"
    rootObject["meshDescendantCount"] = 1
    rootObject["drawCallTarget"] = 1
    rootObject["usesVertexColors"] = True
    return mergedObject


def ObjectBounds(objects):
    coordinates = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        coordinates.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not coordinates:
        return None
    return {
        "min": [round(min(point[index] for point in coordinates), 4) for index in range(3)],
        "max": [round(max(point[index] for point in coordinates), 4) for index in range(3)],
    }


def BaseImportedName(name):
    return re.sub(r"\.\d{3}$", "", name)


def VerifyExport(exportPath):
    originalScene = bpy.context.window.scene
    originalObjectIds = {id(obj) for obj in bpy.data.objects}
    originalMeshIds = {id(mesh) for mesh in bpy.data.meshes}
    originalMaterialIds = {id(material) for material in bpy.data.materials}
    validationScene = bpy.data.scenes.new("Scene_EnemyRearValidation")
    bpy.context.window.scene = validationScene
    try:
        bpy.ops.import_scene.gltf(filepath=exportPath)
        importedObjects = list(validationScene.objects)
        importedRoots = [obj for obj in importedObjects if obj.parent is None]
        rootsByName = {BaseImportedName(obj.name): obj for obj in importedRoots}
        missingAssets = [name for name in REQUIRED_ASSETS if name not in rootsByName]
        assetReport = {}
        totalTriangles = 0
        totalMeshes = 0
        textureNodeCount = 0
        for rootName in REQUIRED_ASSETS:
            rootObject = rootsByName.get(rootName)
            if rootObject is None:
                continue
            descendants = Descendants(rootObject)
            meshObjects = [obj for obj in descendants if obj.type == "MESH"]
            triangleCount = sum(TriangleCount(obj) for obj in meshObjects)
            totalTriangles += triangleCount
            totalMeshes += len(meshObjects)
            bounds = ObjectBounds(meshObjects)
            vertexColorMeshCount = sum(
                1 for obj in meshObjects if obj.data.color_attributes.get("Color") is not None
            )
            assetReport[rootName] = {
                "meshCount": len(meshObjects),
                "triangles": triangleCount,
                "bounds": bounds,
                "rootLocation": [round(value, 6) for value in rootObject.location],
                "vertexColorMeshCount": vertexColorMeshCount,
            }
        importedMaterials = {
            slot.material
            for obj in importedObjects
            if obj.type == "MESH"
            for slot in obj.material_slots
            if slot.material is not None
        }
        for material in importedMaterials:
            if material.use_nodes and material.node_tree:
                textureNodeCount += sum(
                    1 for node in material.node_tree.nodes if node.bl_idname == "ShaderNodeTexImage"
                )
        groundErrors = []
        for rootName, report in assetReport.items():
            bounds = report["bounds"]
            if bounds is None or abs(bounds["min"][2]) > 0.035:
                groundErrors.append(rootName)
            if any(abs(value) > 0.0001 for value in report["rootLocation"]):
                groundErrors.append(rootName + ":RootTranslation")
            if report["meshCount"] > 8:
                groundErrors.append(rootName + ":MeshBudget")
            if report["vertexColorMeshCount"] != report["meshCount"]:
                groundErrors.append(rootName + ":VertexColors")
        report = {
            "status": "pass" if not missingAssets and not groundErrors and totalTriangles < 8000 and totalMeshes <= 55 and textureNodeCount == 0 else "fail",
            "file": exportPath,
            "fileBytes": os.path.getsize(exportPath),
            "requiredAssetCount": len(REQUIRED_ASSETS),
            "missingAssets": missingAssets,
            "groundErrors": groundErrors,
            "totalTriangles": totalTriangles,
            "totalMeshes": totalMeshes,
            "textureNodeCount": textureNodeCount,
            "assets": assetReport,
        }
        return report
    finally:
        bpy.context.window.scene = originalScene
        bpy.data.scenes.remove(validationScene)
        for obj in tuple(bpy.data.objects):
            if id(obj) not in originalObjectIds and obj.users == 0:
                bpy.data.objects.remove(obj)
        for mesh in tuple(bpy.data.meshes):
            if id(mesh) not in originalMeshIds and mesh.users == 0:
                bpy.data.meshes.remove(mesh)
        for material in tuple(bpy.data.materials):
            if id(material) not in originalMaterialIds and material.users == 0:
                bpy.data.materials.remove(material)


def BuildEnemyRearMiniatures():
    sourceScene = bpy.context.scene
    selectedObjects = tuple(bpy.context.selected_objects)
    activeObject = bpy.context.view_layer.objects.active
    RemoveExistingAssetCollection()
    assetCollection = bpy.data.collections.new(ASSET_COLLECTION_NAME)
    sourceScene.collection.children.link(assetCollection)
    materials = CreateMaterials()
    roots = [
        BuildWorkTeam(assetCollection, materials),
        BuildGuerrilla(assetCollection, materials),
        BuildMainForce(assetCollection, materials),
        BuildMilitia(assetCollection, materials),
        BuildCourier(assetCollection, materials),
        BuildEnemyPatrol(assetCollection, materials),
        BuildVillageHouse(assetCollection, materials),
        BuildEnemyBlockhouse(assetCollection, materials),
        BuildTrafficStation(assetCollection, materials),
        BuildRailwayStation(assetCollection, materials),
    ]
    for rootObject in roots:
        MergeAssetToVertexColorMesh(assetCollection, rootObject, materials["vertexColor"])
    os.makedirs(os.path.dirname(EXPORT_PATH), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in assetCollection.objects:
        obj.hide_set(False)
        obj.hide_render = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = roots[0]
    bpy.ops.export_scene.gltf(
        filepath=EXPORT_PATH,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_vertex_color="MATERIAL",
        export_vertex_color_name="Color",
        export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=True,
    )
    validationReport = VerifyExport(EXPORT_PATH)
    previewPositions = (
        (8.0, -3.0, 0.0),
        (10.5, -3.0, 0.0),
        (13.0, -3.0, 0.0),
        (8.0, 0.0, 0.0),
        (10.5, 0.0, 0.0),
        (13.0, 0.0, 0.0),
        (8.0, 3.0, 0.0),
        (10.5, 3.0, 0.0),
        (13.0, 3.0, 0.0),
        (15.5, 3.0, 0.0),
    )
    for rootObject, previewPosition in zip(roots, previewPositions):
        rootObject.location = previewPosition
    bpy.ops.object.select_all(action="DESELECT")
    for obj in selectedObjects:
        if obj.name in sourceScene.objects:
            obj.select_set(True)
    if activeObject is not None and activeObject.name in sourceScene.objects:
        bpy.context.view_layer.objects.active = activeObject
    print("ENEMY_REAR_MODEL_REPORT=" + json.dumps(validationReport, sort_keys=True))
    return validationReport


BuildEnemyRearMiniatures()
