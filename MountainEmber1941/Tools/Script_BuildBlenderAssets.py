import bpy
import atexit
import json
import math
import os
import random
import subprocess
import zlib
from mathutils import Vector


CollectionName = "MountainEmber1941_ArtPass"
ScriptDirectory = os.path.dirname(os.path.abspath(__file__))
ProjectRoot = os.path.dirname(ScriptDirectory)
ModelDirectory = os.path.join(ProjectRoot, "Models")
TextureDirectory = os.path.join(ProjectRoot, "Textures")
TerrainHelperPath = os.path.join(ProjectRoot, "Script_CanonicalTerrain.mjs")
TerrainHelperProcess = None
ActiveTerrainOperationId = None
CanonicalTerrainCache = {}
CanonicalTerrainAnchors = {}


def RemoveOwnedCollection():
    ownedCollection = bpy.data.collections.get(CollectionName)
    if ownedCollection is None:
        return
    for childCollection in list(ownedCollection.children):
        for assetObject in list(childCollection.objects):
            bpy.data.objects.remove(assetObject, do_unlink=True)
        bpy.data.collections.remove(childCollection)
    for assetObject in list(ownedCollection.objects):
        bpy.data.objects.remove(assetObject, do_unlink=True)
    bpy.data.collections.remove(ownedCollection)


def RemovePreviewCollections():
    for collectionName in ("Preview_Render", "Preview_Characters"):
        previewCollection = bpy.data.collections.get(collectionName)
        if previewCollection is None:
            continue
        for assetObject in list(previewCollection.objects):
            bpy.data.objects.remove(assetObject, do_unlink=True)
        bpy.data.collections.remove(previewCollection)


def EnsureDirectories():
    os.makedirs(ModelDirectory, exist_ok=True)
    os.makedirs(TextureDirectory, exist_ok=True)


def MakeMaterial(name, color, roughness=0.85, metallic=0.0):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (*color, 1.0)
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return material


def MakeTextureMaterial(name, baseColor, pattern):
    material = bpy.data.materials.get(name)
    if material is not None:
        return material
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    imageSize = 256
    randomizer = random.Random(zlib.crc32(name.encode("utf-8")) & 0xFFFFFFFF)
    pixels = [0.0] * (imageSize * imageSize * 4)
    for pixelY in range(imageSize):
        for pixelX in range(imageSize):
            grain = (randomizer.random() - 0.5) * 0.12
            if pattern == "earth":
                grain += math.sin(pixelX * 0.085 + math.sin(pixelY * 0.07)) * 0.035
                if ((pixelX * 13 + pixelY * 7) % 113) < 2:
                    grain -= 0.13
            elif pattern == "wood":
                grain += math.sin(pixelX * 0.18 + math.sin(pixelY * 0.025) * 2.0) * 0.075
            elif pattern == "roof":
                mortar = pixelY % 32 < 3 or (pixelX + (pixelY // 32 % 2) * 16) % 32 < 2
                grain += -0.16 if mortar else math.sin(pixelX * 0.12) * 0.025
            elif pattern == "stone":
                rowOffset = 20 if (pixelY // 36) % 2 else 0
                mortar = pixelY % 36 < 3 or (pixelX + rowOffset) % 48 < 3
                grain += -0.17 if mortar else randomizer.random() * 0.04
            pixelIndex = (pixelY * imageSize + pixelX) * 4
            for channelIndex in range(3):
                pixels[pixelIndex + channelIndex] = max(0.0, min(1.0, baseColor[channelIndex] + grain))
            pixels[pixelIndex + 3] = 1.0
    image = bpy.data.images.new(f"Texture_{name}", width=imageSize, height=imageSize, alpha=False)
    image.pixels.foreach_set(pixels)
    image.filepath_raw = os.path.join(TextureDirectory, f"Texture_{name}.png")
    image.file_format = "PNG"
    image.save()
    image.pack()
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = nodes.get("Principled BSDF")
    textureNode = nodes.new("ShaderNodeTexImage")
    textureNode.image = image
    textureNode.interpolation = "Linear"
    links.new(textureNode.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.93 if pattern != "metal" else 0.42
    return material


def MakeVertexColorMaterial():
    material = bpy.data.materials.get("Material_CharacterVertexColor")
    if material is not None:
        return material
    material = bpy.data.materials.new("Material_CharacterVertexColor")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = nodes.get("Principled BSDF")
    vertexColorNode = nodes.new("ShaderNodeVertexColor")
    vertexColorNode.layer_name = "Color"
    links.new(vertexColorNode.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.9
    return material


def LinkToCollection(assetObject, targetCollection):
    for currentCollection in list(assetObject.users_collection):
        currentCollection.objects.unlink(assetObject)
    targetCollection.objects.link(assetObject)


def AddCube(name, location, scale, material, targetCollection, bevel=0.06, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    assetObject = bpy.context.object
    assetObject.name = name
    assetObject.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        bevelModifier = assetObject.modifiers.new("Bevel", "BEVEL")
        bevelModifier.width = bevel
        bevelModifier.segments = 2
    assetObject.data.materials.append(material)
    LinkToCollection(assetObject, targetCollection)
    return assetObject


def AddCylinder(name, location, radius, depth, material, targetCollection, vertices=16, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    assetObject = bpy.context.object
    assetObject.name = name
    assetObject.data.materials.append(material)
    bevelModifier = assetObject.modifiers.new("Bevel", "BEVEL")
    bevelModifier.width = min(radius * 0.14, 0.06)
    bevelModifier.segments = 2
    LinkToCollection(assetObject, targetCollection)
    return assetObject


def AddSphere(name, location, scale, material, targetCollection, segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    assetObject = bpy.context.object
    assetObject.name = name
    assetObject.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assetObject.data.materials.append(material)
    LinkToCollection(assetObject, targetCollection)
    return assetObject


def AddCurve(name, points, bevelDepth, material, targetCollection):
    curveData = bpy.data.curves.new(name, "CURVE")
    curveData.dimensions = "3D"
    curveData.resolution_u = 1
    curveData.bevel_depth = bevelDepth
    curveData.bevel_resolution = 2
    spline = curveData.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for pointIndex, point in enumerate(points):
        spline.points[pointIndex].co = (*point, 1.0)
    curveObject = bpy.data.objects.new(name, curveData)
    targetCollection.objects.link(curveObject)
    curveObject.data.materials.append(material)
    bpy.context.view_layer.objects.active = curveObject
    curveObject.select_set(True)
    bpy.ops.object.convert(target="MESH")
    curveObject.select_set(False)
    return curveObject


def CloseTerrainHelper():
    global TerrainHelperProcess
    if TerrainHelperProcess is None:
        return
    if TerrainHelperProcess.stdin:
        TerrainHelperProcess.stdin.close()
    TerrainHelperProcess.terminate()
    TerrainHelperProcess.wait(timeout=5)
    TerrainHelperProcess = None


atexit.register(CloseTerrainHelper)


def GetCanonicalTerrainHeight(worldX, worldZ):
    global TerrainHelperProcess
    if ActiveTerrainOperationId is None:
        return 0.0
    cacheKey = (ActiveTerrainOperationId, float(worldX), float(worldZ))
    if cacheKey in CanonicalTerrainCache:
        return CanonicalTerrainCache[cacheKey]
    if TerrainHelperProcess is None:
        TerrainHelperProcess = subprocess.Popen(
            ["node", TerrainHelperPath, "--server"],
            cwd=ProjectRoot,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )
    request = {
        "operationId": ActiveTerrainOperationId,
        "x": float(worldX),
        "z": float(worldZ),
    }
    TerrainHelperProcess.stdin.write(json.dumps(request, separators=(",", ":")) + "\n")
    TerrainHelperProcess.stdin.flush()
    responseLine = TerrainHelperProcess.stdout.readline()
    if not responseLine:
        errorText = TerrainHelperProcess.stderr.read()
        raise RuntimeError(f"Canonical terrain helper stopped unexpectedly: {errorText}")
    response = json.loads(responseLine)
    if "error" in response:
        raise RuntimeError(response["error"])
    height = float(response["height"])
    CanonicalTerrainCache[cacheKey] = height
    return height


def WorldLocation(worldX, worldZ, height=0.0, terrainAnchor=None):
    anchorX, anchorZ = terrainAnchor or (worldX, worldZ)
    return (worldX, -worldZ, height + GetCanonicalTerrainHeight(anchorX, anchorZ))


def BeginEnvironment(operationId, targetCollection):
    global ActiveTerrainOperationId, CanonicalTerrainAnchors
    ActiveTerrainOperationId = operationId
    CanonicalTerrainAnchors = {}
    targetCollection["terrainOperationId"] = operationId
    targetCollection["canonicalTerrainAnchored"] = 1
    targetCollection["canonicalTerrainContract"] = (
        "Script_CanonicalTerrain.mjs|Data_Operations.mjs|Script_Rules.GetTerrainElevation"
    )


def RegisterCanonicalTerrainAnchor(name, worldX, worldZ):
    CanonicalTerrainAnchors[name] = {
        "x": float(worldX),
        "z": float(worldZ),
        "height": GetCanonicalTerrainHeight(worldX, worldZ),
    }


def FinishEnvironment(targetCollection):
    global ActiveTerrainOperationId, CanonicalTerrainAnchors
    targetCollection["canonicalTerrainAnchorSamples"] = json.dumps(
        CanonicalTerrainAnchors,
        separators=(",", ":"),
        sort_keys=True,
    )
    targetCollection["canonicalTerrainAnchorCount"] = len(CanonicalTerrainAnchors)
    ActiveTerrainOperationId = None
    CanonicalTerrainAnchors = {}


def AddRoof(name, worldX, worldZ, width, depth, baseHeight, roofMaterial, timberMaterial, targetCollection):
    terrainAnchor = (worldX, worldZ)
    slopeLength = math.sqrt((depth * 0.5) ** 2 + (depth * 0.22) ** 2)
    roofAngle = math.atan2(depth * 0.22, depth * 0.5)
    for sideIndex, sideSign in enumerate((-1, 1)):
        roofLocation = WorldLocation(
            worldX,
            worldZ - sideSign * depth * 0.25,
            baseHeight + depth * 0.11,
            terrainAnchor,
        )
        AddCube(
            f"{name}_RoofPlane_{sideIndex}",
            roofLocation,
            (width + 0.85, slopeLength + 0.55, 0.16),
            roofMaterial,
            targetCollection,
            bevel=0.035,
            rotation=(sideSign * roofAngle, 0.0, 0.0),
        )
    AddCylinder(f"{name}_Ridge", WorldLocation(worldX, worldZ, baseHeight + depth * 0.225, terrainAnchor), 0.14, width + 1.0, roofMaterial, targetCollection, vertices=12, rotation=(0.0, math.pi * 0.5, 0.0))
    for beamOffset in (-width * 0.38, 0.0, width * 0.38):
        AddCube(f"{name}_EaveBeam_{beamOffset:.2f}", WorldLocation(worldX + beamOffset, worldZ, baseHeight - 0.08, terrainAnchor), (0.18, depth + 0.55, 0.2), timberMaterial, targetCollection, bevel=0.025)


def AddBuilding(name, worldX, worldZ, width, depth, height, earthMaterial, roofMaterial, timberMaterial, paperMaterial, targetCollection, exchange=False):
    RegisterCanonicalTerrainAnchor(name, worldX, worldZ)
    terrainAnchor = (worldX, worldZ)
    wallThickness = 0.42
    AddCube(f"{name}_BackWall", WorldLocation(worldX, worldZ - depth * 0.5 + wallThickness * 0.5, height * 0.5, terrainAnchor), (width, wallThickness, height), earthMaterial, targetCollection, bevel=0.1)
    AddCube(f"{name}_FrontWallLeft", WorldLocation(worldX - width * 0.32, worldZ + depth * 0.5 - wallThickness * 0.5, height * 0.5, terrainAnchor), (width * 0.36, wallThickness, height), earthMaterial, targetCollection, bevel=0.1)
    AddCube(f"{name}_FrontWallRight", WorldLocation(worldX + width * 0.32, worldZ + depth * 0.5 - wallThickness * 0.5, height * 0.5, terrainAnchor), (width * 0.36, wallThickness, height), earthMaterial, targetCollection, bevel=0.1)
    AddCube(f"{name}_LeftWall", WorldLocation(worldX - width * 0.5 + wallThickness * 0.5, worldZ, height * 0.5, terrainAnchor), (wallThickness, depth, height), earthMaterial, targetCollection, bevel=0.1)
    AddCube(f"{name}_RightWall", WorldLocation(worldX + width * 0.5 - wallThickness * 0.5, worldZ, height * 0.5, terrainAnchor), (wallThickness, depth, height), earthMaterial, targetCollection, bevel=0.1)
    AddCube(f"{name}_Door", WorldLocation(worldX, worldZ + depth * 0.5 + 0.03, 1.35, terrainAnchor), (1.55, 0.16, 2.7), timberMaterial, targetCollection, bevel=0.035)
    for windowOffset in (-width * 0.32, width * 0.32):
        AddCube(f"{name}_WindowFrame_{windowOffset:.2f}", WorldLocation(worldX + windowOffset, worldZ + depth * 0.5 + 0.05, 2.15, terrainAnchor), (1.38, 0.16, 1.35), timberMaterial, targetCollection, bevel=0.035)
        AddCube(f"{name}_WindowPaper_{windowOffset:.2f}", WorldLocation(worldX + windowOffset, worldZ + depth * 0.5 + 0.145, 2.15, terrainAnchor), (1.08, 0.04, 1.05), paperMaterial, targetCollection, bevel=0.0)
        for latticeOffset in (-0.34, 0.0, 0.34):
            AddCube(f"{name}_WindowLatticeV_{windowOffset:.2f}_{latticeOffset:.2f}", WorldLocation(worldX + windowOffset + latticeOffset, worldZ + depth * 0.5 + 0.18, 2.15, terrainAnchor), (0.045, 0.045, 1.08), timberMaterial, targetCollection, bevel=0.01)
    AddRoof(name, worldX, worldZ, width, depth, height + 0.08, roofMaterial, timberMaterial, targetCollection)
    if exchange:
        AddCube(f"{name}_ExchangeDesk", WorldLocation(worldX, worldZ - 0.9, 1.0, terrainAnchor), (4.0, 0.7, 1.8), timberMaterial, targetCollection, bevel=0.06)
        AddCube(f"{name}_Switchboard", WorldLocation(worldX, worldZ - 1.18, 2.05, terrainAnchor), (3.6, 0.22, 2.25), timberMaterial, targetCollection, bevel=0.08, rotation=(math.radians(-10), 0.0, 0.0))
        copperMaterial = MakeMaterial("Material_Copper", (0.47, 0.22, 0.09), 0.42, 0.45)
        for socketRow in range(4):
            for socketColumn in range(9):
                AddCylinder(f"{name}_Socket_{socketRow}_{socketColumn}", WorldLocation(worldX - 1.42 + socketColumn * 0.355, worldZ - 1.04, 1.35 + socketRow * 0.42, terrainAnchor), 0.045, 0.08, copperMaterial, targetCollection, vertices=10, rotation=(math.pi * 0.5, 0.0, 0.0))
        AddCylinder(f"{name}_Crank", WorldLocation(worldX + 1.72, worldZ - 1.04, 1.45, terrainAnchor), 0.08, 0.7, copperMaterial, targetCollection, vertices=10, rotation=(math.pi * 0.5, 0.0, 0.0))
        AddCube(f"{name}_LineRack", WorldLocation(worldX, worldZ + depth * 0.5 + 0.55, height + 0.65, terrainAnchor), (5.2, 0.22, 0.22), timberMaterial, targetCollection, bevel=0.025)


def AddWall(name, worldX, worldZ, width, depth, height, stoneMaterial, targetCollection):
    RegisterCanonicalTerrainAnchor(name, worldX, worldZ)
    terrainAnchor = (worldX, worldZ)
    AddCube(name, WorldLocation(worldX, worldZ, height * 0.5, terrainAnchor), (width, depth, height), stoneMaterial, targetCollection, bevel=0.11)
    capCount = max(2, int(max(width, depth) / 1.4))
    alongX = width >= depth
    for capIndex in range(capCount):
        interpolation = (capIndex + 0.5) / capCount - 0.5
        capX = worldX + interpolation * width if alongX else worldX
        capZ = worldZ if alongX else worldZ + interpolation * depth
        AddCube(f"{name}_Cap_{capIndex}", WorldLocation(capX, capZ, height + 0.08, terrainAnchor), ((width / capCount) * 0.92 if alongX else width * 1.08, depth * 1.08 if alongX else (depth / capCount) * 0.92, 0.16), stoneMaterial, targetCollection, bevel=0.05, rotation=(0.0, 0.0, (capIndex % 3 - 1) * 0.025))


def AddTower(name, worldX, worldZ, targetCollection, timberMaterial, metalMaterial):
    RegisterCanonicalTerrainAnchor(name, worldX, worldZ)
    terrainAnchor = (worldX, worldZ)
    for xOffset in (-1.45, 1.45):
        for zOffset in (-1.45, 1.45):
            AddCylinder(f"{name}_Leg_{xOffset}_{zOffset}", WorldLocation(worldX + xOffset, worldZ + zOffset, 3.75, terrainAnchor), 0.16, 7.5, timberMaterial, targetCollection, vertices=12)
    for braceHeight in (1.8, 4.2):
        for angleIndex in range(4):
            angle = angleIndex * math.pi * 0.5
            AddCube(f"{name}_Brace_{braceHeight}_{angleIndex}", WorldLocation(worldX + math.sin(angle) * 1.5, worldZ + math.cos(angle) * 1.5, braceHeight, terrainAnchor), (0.15, 3.85, 0.15), timberMaterial, targetCollection, bevel=0.02, rotation=(0.0, math.radians(52 if angleIndex % 2 == 0 else -52), angle))
    AddCube(f"{name}_Deck", WorldLocation(worldX, worldZ, 7.25, terrainAnchor), (3.8, 3.8, 0.28), timberMaterial, targetCollection, bevel=0.05)
    for railIndex in range(4):
        angle = railIndex * math.pi * 0.5
        railX = worldX + math.sin(angle) * 1.76
        railZ = worldZ + math.cos(angle) * 1.76
        AddCube(f"{name}_Rail_{railIndex}", WorldLocation(railX, railZ, 8.05, terrainAnchor), (0.12 if railIndex % 2 == 0 else 3.45, 3.45 if railIndex % 2 == 0 else 0.12, 1.25), timberMaterial, targetCollection, bevel=0.025)
    AddCylinder(f"{name}_Searchlight", WorldLocation(worldX - 0.55, worldZ - 0.2, 8.35, terrainAnchor), 0.42, 0.62, metalMaterial, targetCollection, vertices=20, rotation=(math.pi * 0.5, 0.0, math.radians(18)))
    AddCube(f"{name}_SearchlightYoke", WorldLocation(worldX - 0.55, worldZ - 0.2, 8.02, terrainAnchor), (0.72, 0.12, 0.65), metalMaterial, targetCollection, bevel=0.04)


def AddWagon(name, worldX, worldZ, targetCollection, timberMaterial, metalMaterial):
    RegisterCanonicalTerrainAnchor(name, worldX, worldZ)
    terrainAnchor = (worldX, worldZ)
    AddCube(f"{name}_Bed", WorldLocation(worldX, worldZ, 1.35, terrainAnchor), (5.1, 2.5, 0.4), timberMaterial, targetCollection, bevel=0.09)
    for sideSign in (-1, 1):
        AddCube(f"{name}_Side_{sideSign}", WorldLocation(worldX, worldZ + sideSign * 1.16, 1.95, terrainAnchor), (5.0, 0.18, 1.35), timberMaterial, targetCollection, bevel=0.05)
    for xOffset in (-1.7, 1.7):
        for zSign in (-1, 1):
            AddCylinder(f"{name}_Wheel_{xOffset}_{zSign}", WorldLocation(worldX + xOffset, worldZ + zSign * 1.38, 0.92, terrainAnchor), 0.88, 0.16, timberMaterial, targetCollection, vertices=24, rotation=(math.pi * 0.5, 0.0, 0.0))
            AddCylinder(f"{name}_Hub_{xOffset}_{zSign}", WorldLocation(worldX + xOffset, worldZ + zSign * 1.48, 0.92, terrainAnchor), 0.16, 0.3, metalMaterial, targetCollection, vertices=14, rotation=(math.pi * 0.5, 0.0, 0.0))
    for shaftSign in (-1, 1):
        AddCube(f"{name}_Shaft_{shaftSign}", WorldLocation(worldX + 3.8, worldZ + shaftSign * 0.65, 0.9, terrainAnchor), (3.2, 0.12, 0.12), timberMaterial, targetCollection, bevel=0.025, rotation=(0.0, math.radians(-6), 0.0))


def AddCrateStack(name, worldX, worldZ, width, depth, height, targetCollection, timberMaterial):
    RegisterCanonicalTerrainAnchor(name, worldX, worldZ)
    terrainAnchor = (worldX, worldZ)
    columnCount = max(2, int(width / 1.2))
    rowCount = max(2, int(depth / 1.1))
    layerCount = max(1, int(height / 0.9))
    crateWidth = width / columnCount
    crateDepth = depth / rowCount
    crateHeight = height / layerCount
    for layerIndex in range(layerCount):
        for rowIndex in range(rowCount):
            for columnIndex in range(columnCount):
                crateX = worldX - width * 0.5 + crateWidth * (columnIndex + 0.5)
                crateZ = worldZ - depth * 0.5 + crateDepth * (rowIndex + 0.5)
                AddCube(
                    f"{name}_{layerIndex}_{rowIndex}_{columnIndex}",
                    WorldLocation(crateX, crateZ, crateHeight * (layerIndex + 0.5), terrainAnchor),
                    (crateWidth * 0.9, crateDepth * 0.9, crateHeight * 0.9),
                    timberMaterial,
                    targetCollection,
                    bevel=0.045,
                )


def AddTelephoneNetwork(targetCollection, timberMaterial, ceramicMaterial, wireMaterial):
    polePoints = [(-5, -7), (5, -5), (15, -2), (25, 2), (37, 7), (49, 10), (58, 12)]
    for poleIndex, (worldX, worldZ) in enumerate(polePoints):
        anchorName = f"TelephonePole_{poleIndex}"
        terrainAnchor = (worldX, worldZ)
        RegisterCanonicalTerrainAnchor(anchorName, worldX, worldZ)
        AddCylinder(anchorName, WorldLocation(worldX, worldZ, 4.6, terrainAnchor), 0.16, 9.2, timberMaterial, targetCollection, vertices=12)
        AddCube(f"TelephoneCrossbar_{poleIndex}", WorldLocation(worldX, worldZ, 8.25, terrainAnchor), (3.2, 0.18, 0.18), timberMaterial, targetCollection, bevel=0.025)
        for insulatorIndex, xOffset in enumerate((-1.2, -0.4, 0.4, 1.2)):
            AddCylinder(f"TelephoneInsulator_{poleIndex}_{insulatorIndex}", WorldLocation(worldX + xOffset, worldZ, 8.55, terrainAnchor), 0.11, 0.38, ceramicMaterial, targetCollection, vertices=12)
    for lineIndex, xOffset in enumerate((-1.2, -0.4, 0.4, 1.2)):
        linePoints = []
        for worldX, worldZ in polePoints:
            sag = 0.0 if len(linePoints) == 0 else -0.16
            linePoints.append(WorldLocation(worldX + xOffset, worldZ, 8.64 + sag, (worldX, worldZ)))
        AddCurve(f"TelephoneWire_{lineIndex}", linePoints, 0.025, wireMaterial, targetCollection)


def AddProductionProps(targetCollection, earthMaterial, timberMaterial, stoneMaterial, strawMaterial, metalMaterial):
    AddCylinder("VillageWell_Rim", WorldLocation(7, 26, 0.6), 1.15, 1.2, stoneMaterial, targetCollection, vertices=24)
    AddCylinder("VillageWell_Dark", WorldLocation(7, 26, 1.23), 0.76, 0.04, MakeMaterial("Material_WellDark", (0.035, 0.055, 0.05), 0.95), targetCollection, vertices=24)
    for postSign in (-1, 1):
        AddCylinder(f"VillageWell_Post_{postSign}", WorldLocation(7 + postSign * 1.05, 26, 2.4), 0.11, 3.4, timberMaterial, targetCollection, vertices=12)
    AddCylinder("VillageWell_Beam", WorldLocation(7, 26, 3.85), 0.12, 2.5, timberMaterial, targetCollection, vertices=12, rotation=(0.0, math.pi * 0.5, 0.0))
    AddCylinder("VillageWell_Winch", WorldLocation(7, 26, 2.8), 0.16, 2.35, timberMaterial, targetCollection, vertices=14, rotation=(0.0, math.pi * 0.5, 0.0))
    for stackIndex, (worldX, worldZ) in enumerate(((1, 31), (2.2, 31.4), (39, 20))):
        for logIndex in range(8):
            AddCylinder(f"WoodPile_{stackIndex}_{logIndex}", WorldLocation(worldX + (logIndex % 4) * 0.52, worldZ + (logIndex // 4) * 0.48, 0.34 + (logIndex // 4) * 0.34), 0.14, 1.7, timberMaterial, targetCollection, vertices=10, rotation=(0.0, math.pi * 0.5, 0.0))
    for hayIndex, (worldX, worldZ) in enumerate(((-10, 27), (15, 35))):
        AddSphere(f"Haystack_{hayIndex}", WorldLocation(worldX, worldZ, 1.1), (1.4, 1.15, 1.55), strawMaterial, targetCollection, segments=20, rings=12)
        AddCylinder(f"HaystackPole_{hayIndex}", WorldLocation(worldX, worldZ, 1.85), 0.07, 3.7, timberMaterial, targetCollection, vertices=10)
    AddCylinder("Millstone_Base", WorldLocation(-13, 24, 0.28), 1.2, 0.55, stoneMaterial, targetCollection, vertices=28)
    AddCylinder("Millstone_Wheel", WorldLocation(-13, 24, 1.22), 0.92, 0.34, stoneMaterial, targetCollection, vertices=28, rotation=(math.pi * 0.5, 0.0, 0.0))
    AddCylinder("Millstone_Handle", WorldLocation(-12.2, 23.8, 2.0), 0.06, 1.7, timberMaterial, targetCollection, vertices=10, rotation=(0.0, math.radians(55), 0.0))
    for crateIndex in range(6):
        AddCube(f"SupplyCrate_{crateIndex}", WorldLocation(36 + (crateIndex % 3) * 1.15, 3 + (crateIndex // 3) * 1.05, 0.62 + (crateIndex // 3) * 0.55), (1.05, 0.95, 1.05), timberMaterial, targetCollection, bevel=0.055)
    for barrierIndex in range(3):
        worldX = 48 + barrierIndex * 1.8
        AddCube(f"RoadBarrier_{barrierIndex}", WorldLocation(worldX, -10, 0.72), (1.55, 0.22, 1.3), timberMaterial, targetCollection, bevel=0.04, rotation=(0.0, math.radians(45 if barrierIndex % 2 else -45), 0.0))
        AddCylinder(f"RoadBarrierWire_{barrierIndex}", WorldLocation(worldX, -10, 1.2), 0.035, 2.0, metalMaterial, targetCollection, vertices=8, rotation=(0.0, math.radians(90), 0.0))


def CreateEnvironment(rootCollection):
    environmentCollection = bpy.data.collections.new("Asset_EnvironmentCounty")
    rootCollection.children.link(environmentCollection)
    BeginEnvironment("infiltrateSignalStation", environmentCollection)
    earthMaterial = MakeTextureMaterial("LoessEarth", (0.40, 0.31, 0.22), "earth")
    roofMaterial = MakeTextureMaterial("WeatheredRoof", (0.25, 0.26, 0.24), "roof")
    timberMaterial = MakeTextureMaterial("AgedTimber", (0.28, 0.18, 0.10), "wood")
    stoneMaterial = MakeTextureMaterial("FieldStone", (0.43, 0.42, 0.36), "stone")
    paperMaterial = MakeMaterial("Material_WindowPaper", (0.70, 0.64, 0.48), 0.96)
    ceramicMaterial = MakeMaterial("Material_CeramicInsulator", (0.36, 0.48, 0.50), 0.25, 0.05)
    wireMaterial = MakeMaterial("Material_BlackenedWire", (0.035, 0.04, 0.04), 0.48, 0.5)
    metalMaterial = MakeMaterial("Material_BlackenedMetal", (0.12, 0.13, 0.12), 0.45, 0.55)
    strawMaterial = MakeMaterial("Material_DryStraw", (0.53, 0.43, 0.20), 0.98)
    AddBuilding("SwitchHouse", 37, 7, 14, 10, 5.4, earthMaterial, roofMaterial, timberMaterial, paperMaterial, environmentCollection, exchange=True)
    AddBuilding("RecordsRoom", 51, 20, 12, 8, 4.7, earthMaterial, roofMaterial, timberMaterial, paperMaterial, environmentCollection)
    AddBuilding("OuterGuardRoom", 4, -3, 11, 8, 4.2, earthMaterial, roofMaterial, timberMaterial, paperMaterial, environmentCollection)
    AddTower("NorthWatchTower", 19, 23, environmentCollection, timberMaterial, metalMaterial)
    wallDefinitions = [
        ("CompoundWallSouth", 37, -10, 40, 1.3, 2.1),
        ("CompoundWallEast", 57, 8, 1.3, 37, 2.1),
        ("CompoundWallNorth", 40, 27, 34, 1.3, 2.1),
        ("OuterStoneWall", -4, 8, 29, 1.2, 1.6),
    ]
    for wallDefinition in wallDefinitions:
        AddWall(*wallDefinition, stoneMaterial, environmentCollection)
    AddCrateStack("TelephoneCrates", 28, 16, 5, 3, 2, environmentCollection, timberMaterial)
    AddWagon("LineCart", 45, -16, environmentCollection, timberMaterial, metalMaterial)
    AddTelephoneNetwork(environmentCollection, timberMaterial, ceramicMaterial, wireMaterial)
    AddProductionProps(environmentCollection, earthMaterial, timberMaterial, stoneMaterial, strawMaterial, metalMaterial)
    FinishEnvironment(environmentCollection)
    return environmentCollection


def AddNorthVillageWaterworks(targetCollection, timberMaterial, stoneMaterial, waterMaterial, metalMaterial):
    RegisterCanonicalTerrainAnchor("NorthVillage_Creek", 16, 4)
    AddCube("NorthVillage_CreekBed", WorldLocation(16, 4, -0.18), (10, 86, 0.28), stoneMaterial, targetCollection, bevel=0.18)
    AddCube("NorthVillage_CreekWater", WorldLocation(16, 4, -0.015), (8.7, 85.2, 0.055), waterMaterial, targetCollection, bevel=0.0)
    for bankSign in (-1, 1):
        AddWall(
            f"NorthVillage_CreekBank_{bankSign}",
            16 + bankSign * 5.3,
            4,
            1.1,
            86,
            0.82,
            stoneMaterial,
            targetCollection,
        )
    sluiceX = 26
    sluiceZ = 34
    terrainAnchor = (sluiceX, sluiceZ)
    RegisterCanonicalTerrainAnchor("IrrigationSluice", sluiceX, sluiceZ)
    for postSign in (-1, 1):
        AddCube(
            f"IrrigationSluice_Post_{postSign}",
            WorldLocation(sluiceX + postSign * 1.35, sluiceZ, 1.35, terrainAnchor),
            (0.28, 0.42, 2.7),
            timberMaterial,
            targetCollection,
            bevel=0.04,
        )
    AddCube("IrrigationSluice_Gate", WorldLocation(sluiceX, sluiceZ, 1.0, terrainAnchor), (2.55, 0.34, 1.9), timberMaterial, targetCollection, bevel=0.05)
    AddCylinder("IrrigationSluice_Winch", WorldLocation(sluiceX, sluiceZ, 2.55, terrainAnchor), 0.16, 3.2, metalMaterial, targetCollection, vertices=14, rotation=(0.0, math.pi * 0.5, 0.0))
    AddCylinder("IrrigationSluice_Wheel", WorldLocation(sluiceX + 1.58, sluiceZ, 2.55, terrainAnchor), 0.62, 0.12, metalMaterial, targetCollection, vertices=18, rotation=(math.pi * 0.5, 0.0, 0.0))


def AddWaterMillDetails(targetCollection, timberMaterial, stoneMaterial, waterMaterial):
    millX = 31
    millZ = -31
    wheelAnchor = (millX - 6.1, millZ)
    RegisterCanonicalTerrainAnchor("WaterMillWheel", *wheelAnchor)
    AddCylinder("WaterMill_Wheel", WorldLocation(millX - 6.1, millZ, 1.85, wheelAnchor), 1.72, 0.38, timberMaterial, targetCollection, vertices=20, rotation=(math.pi * 0.5, 0.0, 0.0))
    for spokeIndex in range(8):
        spokeAngle = spokeIndex * math.pi * 0.25
        AddCube(
            f"WaterMill_Spoke_{spokeIndex}",
            WorldLocation(millX - 6.1, millZ, 1.85, wheelAnchor),
            (0.11, 0.18, 3.05),
            timberMaterial,
            targetCollection,
            bevel=0.015,
            rotation=(0.0, spokeAngle, 0.0),
        )
    AddCube("WaterMill_Race", WorldLocation(millX - 4.2, millZ, 0.05), (8.8, 2.2, 0.16), waterMaterial, targetCollection, bevel=0.02)
    AddWall("WaterMill_RaceWallNorth", millX - 4.2, millZ - 1.25, 8.8, 0.4, 0.75, stoneMaterial, targetCollection)
    AddWall("WaterMill_RaceWallSouth", millX - 4.2, millZ + 1.25, 8.8, 0.4, 0.75, stoneMaterial, targetCollection)


def CreateNorthVillageEnvironment(rootCollection):
    environmentCollection = bpy.data.collections.new("Asset_EnvironmentNorthVillage")
    rootCollection.children.link(environmentCollection)
    BeginEnvironment("nightRendezvous", environmentCollection)
    earthMaterial = MakeTextureMaterial("LoessEarth", (0.40, 0.31, 0.22), "earth")
    roofMaterial = MakeTextureMaterial("WeatheredRoof", (0.25, 0.26, 0.24), "roof")
    timberMaterial = MakeTextureMaterial("AgedTimber", (0.28, 0.18, 0.10), "wood")
    stoneMaterial = MakeTextureMaterial("FieldStone", (0.43, 0.42, 0.36), "stone")
    paperMaterial = MakeMaterial("Material_WindowPaper", (0.70, 0.64, 0.48), 0.96)
    metalMaterial = MakeMaterial("Material_BlackenedMetal", (0.12, 0.13, 0.12), 0.45, 0.55)
    waterMaterial = MakeMaterial("Material_Rainwater", (0.08, 0.19, 0.22), 0.28, 0.08)
    strawMaterial = MakeMaterial("Material_WetStraw", (0.34, 0.28, 0.13), 0.98)
    buildingDefinitions = [
        ("ContactHouse", -25, 22, 13, 10, 4.5),
        ("EastHouse", 31, 22, 14, 9, 4.4),
        ("SouthHouse", -17, -22, 14, 10, 4.4),
        ("AncestralHall", 10, -22, 18, 11, 5.3),
        ("WaterMill", 31, -31, 12, 9, 4.6),
    ]
    for buildingDefinition in buildingDefinitions:
        AddBuilding(*buildingDefinition, earthMaterial, roofMaterial, timberMaterial, paperMaterial, environmentCollection)
    wallDefinitions = [
        ("WestLaneWall", -7, 7, 1.2, 31, 1.8),
        ("TempleWallNorth", 9, -7, 31, 1.2, 2.0),
        ("TempleWallEast", 24, -20, 1.2, 26, 2.0),
        ("EastCheckpoint", 44, 8, 15, 1.5, 1.6),
    ]
    for wallDefinition in wallDefinitions:
        AddWall(*wallDefinition, stoneMaterial, environmentCollection)
    AddWagon("RainCart", -2, 15, environmentCollection, timberMaterial, metalMaterial)
    AddSphere("HayStack", WorldLocation(-42, -28, 1.5), (3.6, 2.7, 2.1), strawMaterial, environmentCollection, segments=20, rings=12)
    AddCylinder("HayStack_Pole", WorldLocation(-42, -28, 2.0), 0.08, 4.0, timberMaterial, environmentCollection, vertices=10)
    AddNorthVillageWaterworks(environmentCollection, timberMaterial, stoneMaterial, waterMaterial, metalMaterial)
    AddWaterMillDetails(environmentCollection, timberMaterial, stoneMaterial, waterMaterial)
    for laneIndex, (laneX, laneZ, laneWidth, laneDepth) in enumerate(((-20, 3, 8.2, 66), (33, 0, 9.2, 60))):
        RegisterCanonicalTerrainAnchor(f"VillageLane_{laneIndex}", laneX, laneZ)
        AddCube(
            f"VillageLane_{laneIndex}",
            WorldLocation(laneX, laneZ, 0.015),
            (laneWidth, laneDepth, 0.06),
            earthMaterial,
            environmentCollection,
            bevel=0.0,
        )
    FinishEnvironment(environmentCollection)
    return environmentCollection


def AddOreCart(name, worldX, worldZ, targetCollection, timberMaterial, metalMaterial):
    RegisterCanonicalTerrainAnchor(name, worldX, worldZ)
    terrainAnchor = (worldX, worldZ)
    AddCube(f"{name}_Bin", WorldLocation(worldX, worldZ, 1.25, terrainAnchor), (4.9, 2.35, 1.55), metalMaterial, targetCollection, bevel=0.12)
    AddCube(f"{name}_Underframe", WorldLocation(worldX, worldZ, 0.62, terrainAnchor), (5.2, 1.45, 0.28), timberMaterial, targetCollection, bevel=0.04)
    for axleX in (-1.65, 1.65):
        for sideSign in (-1, 1):
            AddCylinder(
                f"{name}_Wheel_{axleX}_{sideSign}",
                WorldLocation(worldX + axleX, worldZ + sideSign * 0.92, 0.43, terrainAnchor),
                0.48,
                0.16,
                metalMaterial,
                targetCollection,
                vertices=18,
                rotation=(math.pi * 0.5, 0.0, 0.0),
            )


def AddQuarryTrack(targetCollection, timberMaterial, metalMaterial):
    terrainAnchor = (5, -5)
    RegisterCanonicalTerrainAnchor("QuarryTrack", *terrainAnchor)
    for railZ in (-5.72, -4.28):
        AddCube("QuarryTrack_Rail", WorldLocation(5, railZ, 0.24, terrainAnchor), (88, 0.11, 0.13), metalMaterial, targetCollection, bevel=0.025)
    for sleeperIndex in range(29):
        sleeperX = -38 + sleeperIndex * 3.05
        AddCube(
            f"QuarryTrack_Sleeper_{sleeperIndex}",
            WorldLocation(sleeperX, -5, 0.12, terrainAnchor),
            (0.22, 2.45, 0.16),
            timberMaterial,
            targetCollection,
            bevel=0.025,
        )


def CreateQuarryEnvironment(rootCollection):
    environmentCollection = bpy.data.collections.new("Asset_EnvironmentQuarrySlope")
    environmentCollection["terrainOwnership"] = "ThreeJsCanonical"
    environmentCollection["broadTerrainSlabs"] = 0
    environmentCollection["landmarkContract"] = "track|oreCarts|sheds|blockhouse|walls|timberSupports|telephonePoles"
    rootCollection.children.link(environmentCollection)
    BeginEnvironment("quarryInterdiction", environmentCollection)
    earthMaterial = MakeTextureMaterial("LoessEarth", (0.40, 0.31, 0.22), "earth")
    roofMaterial = MakeTextureMaterial("WeatheredRoof", (0.25, 0.26, 0.24), "roof")
    timberMaterial = MakeTextureMaterial("AgedTimber", (0.28, 0.18, 0.10), "wood")
    stoneMaterial = MakeTextureMaterial("FieldStone", (0.43, 0.42, 0.36), "stone")
    paperMaterial = MakeMaterial("Material_WindowPaper", (0.70, 0.64, 0.48), 0.96)
    metalMaterial = MakeMaterial("Material_BlackenedMetal", (0.12, 0.13, 0.12), 0.45, 0.55)
    rockMaterial = MakeMaterial("Material_QuarryRock", (0.39, 0.37, 0.31), 0.98)
    buildingDefinitions = [
        ("ForemanOffice", 14, 12, 13, 8, 4.2),
        ("PowderShed", 28, -25, 13, 9, 4.5),
        ("WorkerShedOne", -44, -18, 12, 7, 3.8),
        ("WorkerShedTwo", -31, -24, 11, 7, 3.8),
        ("UpperBlockhouse", 6, 35, 12, 9, 5.0),
    ]
    for name, worldX, worldZ, width, depth, height in buildingDefinitions:
        AddBuilding(name, worldX, worldZ, width, depth, height, earthMaterial, roofMaterial, timberMaterial, paperMaterial, environmentCollection)
    AddWall("RoadCheckpoint", 47, -4, 2, 17, 2.0, stoneMaterial, environmentCollection)
    AddWall("LowerRetainingWall", -6, -12, 48, 1.5, 2.8, stoneMaterial, environmentCollection)
    AddWall("UpperRetainingWall", 18, 26, 54, 1.5, 2.8, stoneMaterial, environmentCollection)
    # Terrain elevation is canonical in Script_Rules/GetTerrainElevation and is rendered once by
    # Three.js. The environment GLB intentionally contains no broad bench/floor slabs: duplicating
    # them here occludes actors and threats from the tactical camera, especially in portrait view.
    # Small edge markers retain the quarry's cut-rock silhouette without becoming walkable terrain.
    for rockIndex, (worldX, worldZ, scale, yaw) in enumerate((
        (50, 29, (5.4, 2.2, 3.1), -18),
        (56, 24, (3.5, 2.8, 2.4), 12),
        (-51, -34, (3.8, 2.5, 2.1), 24),
        (-45, -39, (2.7, 2.0, 2.8), -11),
    )):
        RegisterCanonicalTerrainAnchor(f"QuarryEdgeRock_{rockIndex}", worldX, worldZ)
        AddCube(
            f"QuarryEdgeRock_{rockIndex}",
            WorldLocation(worldX, worldZ, scale[2] * 0.5),
            scale,
            rockMaterial,
            environmentCollection,
            bevel=0.32,
            rotation=(0.0, 0.0, math.radians(yaw)),
        )
    AddQuarryTrack(environmentCollection, timberMaterial, metalMaterial)
    AddOreCart("OreCartOne", 1, -5, environmentCollection, timberMaterial, metalMaterial)
    AddOreCart("OreCartTwo", 9, -5, environmentCollection, timberMaterial, metalMaterial)
    AddCrateStack("StoneCrib", 42, 17, 8, 6, 4, environmentCollection, timberMaterial)
    RegisterCanonicalTerrainAnchor("RockfallTimber", 45, 23)
    rockfallAnchor = (45, 23)
    for supportIndex, supportX in enumerate((41.8, 45, 48.2)):
        AddCube(
            f"RockfallTimber_Support_{supportIndex}",
            WorldLocation(supportX, 23, 2.7, rockfallAnchor),
            (0.42, 0.42, 5.4),
            timberMaterial,
            environmentCollection,
            bevel=0.05,
            rotation=(0.0, math.radians(-14 + supportIndex * 14), 0.0),
        )
    AddCube("RockfallTimber_Header", WorldLocation(45, 23, 4.2, rockfallAnchor), (7.4, 0.5, 0.48), timberMaterial, environmentCollection, bevel=0.06)
    for poleIndex, (worldX, worldZ) in enumerate(((7, 33), (26, 17), (47, -3))):
        terrainAnchor = (worldX, worldZ)
        RegisterCanonicalTerrainAnchor(f"QuarryTelephonePole_{poleIndex}", worldX, worldZ)
        AddCylinder(f"QuarryTelephonePole_{poleIndex}", WorldLocation(worldX, worldZ, 3.3, terrainAnchor), 0.13, 6.6, timberMaterial, environmentCollection, vertices=10)
        AddCube(f"QuarryTelephoneCrossbar_{poleIndex}", WorldLocation(worldX, worldZ, 6.2, terrainAnchor), (2.4, 0.16, 0.16), timberMaterial, environmentCollection, bevel=0.02)
    FinishEnvironment(environmentCollection)
    return environmentCollection


def AddCharacterPart(name, parent, shape, location, scale, material, targetCollection, rotation=(0.0, 0.0, 0.0), bevel=None, segments=18, rings=10):
    if shape == "cube":
        partObject = AddCube(name, location, scale, material, targetCollection, bevel=min(scale) * 0.18 if bevel is None else bevel, rotation=rotation)
    elif shape == "sphere":
        partObject = AddSphere(name, location, scale, material, targetCollection, segments=segments, rings=rings)
    else:
        partObject = AddCylinder(name, location, scale[0], scale[2], material, targetCollection, vertices=14, rotation=rotation)
    partObject.parent = parent
    return partObject


def AddLimb(name, parent, sideOffset, shoulderHeight, length, material, targetCollection, isLeg=False):
    pivotObject = bpy.data.objects.new(name, None)
    targetCollection.objects.link(pivotObject)
    pivotObject.parent = parent
    pivotObject.location = (sideOffset, 0.0, shoulderHeight)

    # The tactical camera sees an actor at a very oblique angle.  A single long,
    # bevelled cylinder reads as detached at its shoulder/hip and snaps apart at
    # the middle once the animation rotates it.  Build one continuous limb around
    # the same runtime pivot: overlapping upper and lower sleeves/trousers are
    # covered by a rounded elbow/knee, and the root cap reaches into the torso.
    # Everything remains under this one pivot so the existing runtime animation
    # contract (four named pivots and five baked render meshes) is unchanged.
    limbRadius = 0.13 if isLeg else 0.11
    jointRadius = 0.168 if isLeg else 0.145
    upperLength = length * 0.51
    lowerLength = length * 0.53
    jointHeight = shoulderHeight - upperLength * 0.94

    def ParentLimbPart(partObject):
        partObject.parent = pivotObject
        partObject.matrix_parent_inverse = pivotObject.matrix_world.inverted()
        return partObject

    ParentLimbPart(AddSphere(
        name.replace("Pivot", "RootJoint"),
        (sideOffset, 0.0, shoulderHeight),
        (jointRadius, jointRadius, jointRadius),
        material,
        targetCollection,
        segments=14,
        rings=8,
    ))
    ParentLimbPart(AddCylinder(
        name.replace("Pivot", "UpperMesh"),
        (sideOffset, 0.0, shoulderHeight - upperLength * 0.49),
        limbRadius,
        upperLength,
        material,
        targetCollection,
        vertices=14,
    ))
    ParentLimbPart(AddSphere(
        name.replace("Pivot", "MiddleJoint"),
        (sideOffset, 0.0, jointHeight),
        (jointRadius, jointRadius, jointRadius),
        material,
        targetCollection,
        segments=14,
        rings=8,
    ))
    ParentLimbPart(AddCylinder(
        name.replace("Pivot", "LowerMesh"),
        (sideOffset, 0.0, jointHeight - lowerLength * 0.49),
        limbRadius * 0.94,
        lowerLength,
        material,
        targetCollection,
        vertices=14,
    ))
    if isLeg:
        bootMaterial = MakeMaterial("Material_BootLeather", (0.105, 0.075, 0.048), 0.9)
        bootObject = AddCube(
            name.replace("Pivot", "Boot"),
            (sideOffset, -0.105, 0.13),
            (0.27, 0.42, 0.24),
            bootMaterial,
            targetCollection,
            bevel=0.055,
        )
        ParentLimbPart(bootObject)
    else:
        skinMaterial = MakeMaterial("Material_CharacterHands", (0.48, 0.34, 0.24), 0.9)
        handObject = AddSphere(
            name.replace("Pivot", "Hand"),
            (sideOffset, -0.015, shoulderHeight - length - 0.015),
            (0.14, 0.12, 0.16),
            skinMaterial,
            targetCollection,
            segments=14,
            rings=8,
        )
        ParentLimbPart(handObject)
    return pivotObject


def CreateCharacter(rootCollection, assetName, palette, role, enemy=False):
    characterCollection = bpy.data.collections.new(assetName)
    rootCollection.children.link(characterCollection)
    rootObject = bpy.data.objects.new(f"{assetName}_Root", None)
    characterCollection.objects.link(rootObject)
    clothMaterial = MakeMaterial(f"Material_{assetName}_Cloth", palette[0], 0.95)
    clothDarkMaterial = MakeMaterial(f"Material_{assetName}_ClothDark", palette[1], 0.96)
    skinMaterial = MakeMaterial(f"Material_{assetName}_Skin", (0.48, 0.34, 0.24), 0.9)
    leatherMaterial = MakeMaterial(f"Material_{assetName}_Leather", (0.22, 0.12, 0.06), 0.86)
    metalMaterial = MakeMaterial(f"Material_{assetName}_Metal", (0.13, 0.14, 0.13), 0.4, 0.5)
    canvasMaterial = MakeMaterial(f"Material_{assetName}_Canvas", palette[2], 0.98)
    hairMaterial = MakeMaterial(f"Material_{assetName}_Hair", (0.065, 0.045, 0.032), 0.96)
    AddCharacterPart(f"{assetName}_Torso", rootObject, "cube", (0.0, 0.0, 1.14), (0.66, 0.42, 0.84), clothMaterial, characterCollection)
    AddCharacterPart(f"{assetName}_JacketSkirt", rootObject, "cube", (0.0, 0.0, 0.78), (0.76, 0.48, 0.28), clothDarkMaterial, characterCollection)
    AddCharacterPart(f"{assetName}_Neck", rootObject, "cylinder", (0.0, 0.0, 1.55), (0.13, 0.13, 0.24), skinMaterial, characterCollection)
    AddCharacterPart(f"{assetName}_Head", rootObject, "sphere", (0.0, 0.0, 1.76), (0.25, 0.23, 0.28), skinMaterial, characterCollection)
    AddCharacterPart(f"{assetName}_Nose", rootObject, "cube", (0.0, -0.235, 1.76), (0.105, 0.13, 0.105), skinMaterial, characterCollection, rotation=(math.radians(7), 0.0, 0.0))
    for earSign in (-1, 1):
        AddCharacterPart(f"{assetName}_Ear_{earSign}", rootObject, "sphere", (earSign * 0.245, 0.0, 1.77), (0.055, 0.042, 0.085), skinMaterial, characterCollection, segments=12, rings=6)
    for collarSign in (-1, 1):
        AddCharacterPart(f"{assetName}_Collar_{collarSign}", rootObject, "cube", (collarSign * 0.14, -0.225, 1.48), (0.24, 0.055, 0.18), clothDarkMaterial, characterCollection, bevel=0.02, rotation=(math.radians(-5), collarSign * math.radians(17), 0.0))
    AddCharacterPart(f"{assetName}_Cap", rootObject, "cylinder", (0.0, 0.0, 2.02), (0.29, 0.29, 0.14), clothDarkMaterial, characterCollection)
    if enemy:
        AddCharacterPart(f"{assetName}_CapBrim", rootObject, "cube", (0.0, -0.22, 1.98), (0.54, 0.22, 0.06), clothDarkMaterial, characterCollection)
    else:
        AddCharacterPart(f"{assetName}_Scarf", rootObject, "cube", (0.0, -0.24, 1.52), (0.13, 0.08, 0.62), canvasMaterial, characterCollection, rotation=(math.radians(10), 0.0, math.radians(-12)))
        AddCharacterPart(f"{assetName}_CapBrim", rootObject, "cube", (0.0, -0.245, 1.99), (0.46, 0.22, 0.055), clothDarkMaterial, characterCollection, bevel=0.025)
    if role in ("scout", "medic"):
        AddCharacterPart(f"{assetName}_HairBack", rootObject, "sphere", (0.0, 0.18, 1.76), (0.22, 0.16, 0.25), hairMaterial, characterCollection, segments=16, rings=8)
        AddCharacterPart(f"{assetName}_HairKnot", rootObject, "sphere", (0.0, 0.29, 1.67), (0.12, 0.1, 0.13), hairMaterial, characterCollection, segments=14, rings=7)
    for sideName, sideOffset in (("L", -0.42), ("R", 0.42)):
        AddLimb(f"Arm_{sideName}_Pivot", rootObject, sideOffset, 1.45, 0.72, clothMaterial, characterCollection, False)
        AddLimb(f"Leg_{sideName}_Pivot", rootObject, sideOffset * 0.48, 0.74, 0.78, clothDarkMaterial, characterCollection, True)
    AddCharacterPart(f"{assetName}_Belt", rootObject, "cube", (0.0, -0.255, 0.96), (0.72, 0.08, 0.12), leatherMaterial, characterCollection)
    for pouchSign in (-1, 1):
        AddCharacterPart(f"{assetName}_BeltPouch_{pouchSign}", rootObject, "cube", (pouchSign * 0.24, -0.31, 0.88), (0.22, 0.12, 0.26), canvasMaterial, characterCollection, bevel=0.035)
    AddCharacterPart(f"{assetName}_ShoulderStrap", rootObject, "cube", (-0.08, -0.245, 1.27), (0.075, 0.05, 0.92), leatherMaterial, characterCollection, bevel=0.018, rotation=(0.0, math.radians(-22), 0.0))
    if role == "scout":
        AddCharacterPart(f"{assetName}_BinocularBody", rootObject, "cube", (0.0, -0.34, 1.42), (0.42, 0.14, 0.2), metalMaterial, characterCollection)
        AddCharacterPart(f"{assetName}_MapCase", rootObject, "cube", (0.36, 0.18, 0.92), (0.38, 0.22, 0.52), leatherMaterial, characterCollection)
        weaponLength = 0.62
    elif role == "sapper":
        AddCharacterPart(f"{assetName}_ToolSatchel", rootObject, "cube", (-0.42, 0.16, 0.95), (0.58, 0.28, 0.68), canvasMaterial, characterCollection)
        AddCharacterPart(f"{assetName}_LongTool", rootObject, "cylinder", (0.46, 0.14, 1.18), (0.055, 0.055, 1.35), metalMaterial, characterCollection, rotation=(0.0, math.radians(10), math.radians(-7)))
        weaponLength = 1.28
    elif role == "medic":
        AddCharacterPart(f"{assetName}_MedicalBag", rootObject, "cube", (-0.42, 0.15, 0.98), (0.62, 0.3, 0.68), canvasMaterial, characterCollection)
        AddCharacterPart(f"{assetName}_MedicalMark", rootObject, "cube", (-0.42, -0.015, 1.0), (0.25, 0.035, 0.08), MakeMaterial("Material_MedicalMark", (0.55, 0.12, 0.1), 0.9), characterCollection)
        AddCharacterPart(f"{assetName}_BlanketRoll", rootObject, "cylinder", (0.0, 0.28, 1.33), (0.16, 0.16, 0.72), canvasMaterial, characterCollection, rotation=(0.0, math.pi * 0.5, 0.0))
        weaponLength = 1.05
    elif role == "gunner":
        AddCharacterPart(f"{assetName}_AmmoPack", rootObject, "cube", (0.0, 0.25, 1.15), (0.88, 0.28, 0.54), canvasMaterial, characterCollection)
        AddCharacterPart(f"{assetName}_TopMagazine", rootObject, "cube", (0.05, -0.43, 1.56), (0.25, 0.14, 0.45), metalMaterial, characterCollection, rotation=(math.radians(-12), 0.0, 0.0))
        weaponLength = 1.55
    elif role == "leader":
        AddCharacterPart(f"{assetName}_FieldCase", rootObject, "cube", (0.36, 0.18, 0.95), (0.36, 0.24, 0.52), leatherMaterial, characterCollection)
        AddCharacterPart(f"{assetName}_ShoulderTabs", rootObject, "cube", (0.0, -0.25, 1.48), (0.72, 0.06, 0.1), MakeMaterial(f"Material_{assetName}_Tabs", (0.45, 0.34, 0.18), 0.88), characterCollection)
        weaponLength = 0.72
    else:
        AddCharacterPart(f"{assetName}_BreadBag", rootObject, "cube", (0.38, 0.15, 0.94), (0.4, 0.24, 0.5), canvasMaterial, characterCollection)
        weaponLength = 1.35
    weaponOffset = -0.36 if role == "scout" else -0.42
    AddCharacterPart(f"{assetName}_Weapon", rootObject, "cube", (0.0, weaponOffset, 1.24), (0.105, weaponLength, 0.11), metalMaterial, characterCollection, rotation=(math.radians(70), 0.0, 0.0))
    AddCharacterPart(f"{assetName}_WeaponReceiver", rootObject, "cube", (0.0, -0.31, 1.27), (0.2, 0.44 if role != "scout" else 0.3, 0.2), metalMaterial, characterCollection, bevel=0.025, rotation=(math.radians(70), 0.0, 0.0))
    AddCharacterPart(f"{assetName}_WeaponStock", rootObject, "cube", (0.0, -0.12, 0.94), (0.2, 0.5 if role != "scout" else 0.34, 0.22), leatherMaterial, characterCollection, rotation=(math.radians(70), 0.0, 0.0))
    if role in ("gunner", "rifleman", "sapper"):
        AddCharacterPart(f"{assetName}_WeaponSight", rootObject, "cube", (0.0, -0.43, 1.45), (0.06, 0.11, 0.12), metalMaterial, characterCollection, bevel=0.012, rotation=(math.radians(70), 0.0, 0.0))
    if role == "gunner":
        for bipodSign in (-1, 1):
            AddCharacterPart(f"{assetName}_Bipod_{bipodSign}", rootObject, "cube", (bipodSign * 0.10, -0.65, 1.57), (0.035, 0.5, 0.035), metalMaterial, characterCollection, bevel=0.006, rotation=(math.radians(64), 0.0, bipodSign * math.radians(13)))
    rootObject["role"] = role
    rootObject["enemy"] = enemy
    return characterCollection


def BakeCharacterForRuntime(characterCollection, assetName):
    vertexMaterial = MakeVertexColorMaterial()
    meshObjects = [assetObject for assetObject in characterCollection.objects if assetObject.type == "MESH"]
    for assetObject in meshObjects:
        bpy.ops.object.select_all(action="DESELECT")
        assetObject.select_set(True)
        bpy.context.view_layer.objects.active = assetObject
        bpy.ops.object.convert(target="MESH")
        meshData = assetObject.data
        sourceMaterials = list(meshData.materials)
        colorLayer = meshData.color_attributes.get("Color")
        if colorLayer is None:
            colorLayer = meshData.color_attributes.new(name="Color", type="BYTE_COLOR", domain="CORNER")
        for polygon in meshData.polygons:
            sourceMaterial = sourceMaterials[polygon.material_index] if polygon.material_index < len(sourceMaterials) else None
            color = sourceMaterial.diffuse_color if sourceMaterial is not None else (0.5, 0.5, 0.5, 1.0)
            for loopIndex in polygon.loop_indices:
                colorLayer.data[loopIndex].color = color
            polygon.material_index = 0
        meshData.materials.clear()
        meshData.materials.append(vertexMaterial)

    groupedMeshes = {}
    for assetObject in meshObjects:
        groupedMeshes.setdefault(assetObject.parent, []).append(assetObject)
    for parentObject, groupObjects in groupedMeshes.items():
        bpy.ops.object.select_all(action="DESELECT")
        for assetObject in groupObjects:
            assetObject.select_set(True)
        bpy.context.view_layer.objects.active = groupObjects[0]
        if len(groupObjects) > 1:
            bpy.ops.object.join()
        joinedObject = bpy.context.object
        if parentObject is not None and "Pivot" in parentObject.name:
            joinedObject.name = parentObject.name.replace("Pivot", "Mesh")
        else:
            joinedObject.name = f"{assetName}_BodyMesh"


def SelectCollectionObjects(targetCollection):
    bpy.ops.object.select_all(action="DESELECT")
    selectedObjects = []
    def CollectObjects(currentCollection):
        for currentObject in currentCollection.objects:
            if currentObject not in selectedObjects:
                selectedObjects.append(currentObject)
        for childCollection in currentCollection.children:
            CollectObjects(childCollection)
    CollectObjects(targetCollection)
    for selectedObject in selectedObjects:
        selectedObject.select_set(True)
    if selectedObjects:
        bpy.context.view_layer.objects.active = selectedObjects[0]
    return selectedObjects


def JoinEnvironmentMeshes(targetCollection, modelName):
    selectedObjects = SelectCollectionObjects(targetCollection)
    meshObjects = [assetObject for assetObject in selectedObjects if assetObject.type == "MESH"]
    for assetObject in meshObjects:
        bpy.context.view_layer.objects.active = assetObject
        bpy.ops.object.select_all(action="DESELECT")
        assetObject.select_set(True)
        bpy.ops.object.convert(target="MESH")
    bpy.ops.object.select_all(action="DESELECT")
    for assetObject in meshObjects:
        assetObject.select_set(True)
    if not meshObjects:
        return None
    bpy.context.view_layer.objects.active = meshObjects[0]
    bpy.ops.object.join()
    environmentObject = bpy.context.object
    environmentObject.name = modelName
    environmentObject.data.name = modelName.replace("Model_", "Mesh_", 1)
    environmentObject["sourceObjectCount"] = len(meshObjects)
    for propertyName, propertyValue in targetCollection.items():
        environmentObject[propertyName] = propertyValue
    return environmentObject


def ExportCollection(targetCollection, fileName):
    selectedObjects = SelectCollectionObjects(targetCollection)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(ModelDirectory, fileName),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )
    return len(selectedObjects)


def WriteSourceBlend(rootCollection):
    sourcePath = os.path.join(ModelDirectory, "Model_SourceMountainEmberArtPass.blend")
    temporaryPath = os.path.join(ModelDirectory, "Model_SourceMountainEmberArtPass_Temporary.blend")
    sourceScene = bpy.data.scenes.new("Scene_MountainEmberArtPass")
    sourceScene.collection.children.link(rootCollection)
    try:
        bpy.data.libraries.write(temporaryPath, {sourceScene}, path_remap="RELATIVE", fake_user=True, compress=True)
        os.replace(temporaryPath, sourcePath)
    finally:
        if os.path.exists(temporaryPath):
            os.remove(temporaryPath)
        bpy.data.scenes.remove(sourceScene)
    return sourcePath


def GetCharacterDefinitions():
    return [
        ("Asset_OperativeScout", ((0.26, 0.33, 0.27), (0.17, 0.22, 0.18), (0.58, 0.55, 0.39)), "scout", False, "Model_OperativeScout.glb"),
        ("Asset_OperativeSapper", ((0.39, 0.31, 0.21), (0.24, 0.20, 0.15), (0.48, 0.38, 0.24)), "sapper", False, "Model_OperativeSapper.glb"),
        ("Asset_OperativeMedic", ((0.35, 0.38, 0.30), (0.20, 0.24, 0.19), (0.66, 0.61, 0.43)), "medic", False, "Model_OperativeMedic.glb"),
        ("Asset_OperativeGunner", ((0.29, 0.30, 0.24), (0.16, 0.17, 0.14), (0.41, 0.36, 0.23)), "gunner", False, "Model_OperativeGunner.glb"),
        ("Asset_EnemyRifleman", ((0.34, 0.29, 0.21), (0.20, 0.18, 0.14), (0.42, 0.34, 0.22)), "rifleman", True, "Model_EnemyRifleman.glb"),
        ("Asset_EnemyLeader", ((0.28, 0.25, 0.20), (0.16, 0.15, 0.13), (0.38, 0.30, 0.20)), "leader", True, "Model_EnemyLeader.glb"),
    ]


def BuildEnvironmentAndSource():
    EnsureDirectories()
    RemovePreviewCollections()
    RemoveOwnedCollection()
    rootCollection = bpy.data.collections.new(CollectionName)
    bpy.context.scene.collection.children.link(rootCollection)
    environmentDefinitions = [
        (CreateEnvironment, "Model_EnvironmentCounty", "Model_EnvironmentCounty.glb"),
        (CreateNorthVillageEnvironment, "Model_EnvironmentNorthVillage", "Model_EnvironmentNorthVillage.glb"),
        (CreateQuarryEnvironment, "Model_EnvironmentQuarrySlope", "Model_EnvironmentQuarrySlope.glb"),
    ]
    exportReport = {}
    for createEnvironment, modelName, fileName in environmentDefinitions:
        environmentCollection = createEnvironment(rootCollection)
        JoinEnvironmentMeshes(environmentCollection, modelName)
        exportReport[fileName] = ExportCollection(environmentCollection, fileName)
    for assetName, palette, role, enemy, _ in GetCharacterDefinitions():
        characterCollection = CreateCharacter(rootCollection, assetName, palette, role, enemy)
        BakeCharacterForRuntime(characterCollection, assetName)
    SelectCollectionObjects(rootCollection)
    WriteSourceBlend(rootCollection)
    return exportReport


def BuildQuarryOnly():
    EnsureDirectories()
    RemovePreviewCollections()
    RemoveOwnedCollection()
    rootCollection = bpy.data.collections.new(CollectionName)
    bpy.context.scene.collection.children.link(rootCollection)
    environmentCollection = CreateQuarryEnvironment(rootCollection)
    JoinEnvironmentMeshes(environmentCollection, "Model_EnvironmentQuarrySlope")
    return {
        "Model_EnvironmentQuarrySlope.glb": ExportCollection(
            environmentCollection,
            "Model_EnvironmentQuarrySlope.glb",
        ),
    }


def BuildSourceOnly():
    EnsureDirectories()
    RemovePreviewCollections()
    RemoveOwnedCollection()
    rootCollection = bpy.data.collections.new(CollectionName)
    bpy.context.scene.collection.children.link(rootCollection)
    for createEnvironment, modelName in (
        (CreateEnvironment, "Model_EnvironmentCounty"),
        (CreateNorthVillageEnvironment, "Model_EnvironmentNorthVillage"),
        (CreateQuarryEnvironment, "Model_EnvironmentQuarrySlope"),
    ):
        environmentCollection = createEnvironment(rootCollection)
        JoinEnvironmentMeshes(environmentCollection, modelName)
    for assetName, palette, role, enemy, _ in GetCharacterDefinitions():
        characterCollection = CreateCharacter(rootCollection, assetName, palette, role, enemy)
        BakeCharacterForRuntime(characterCollection, assetName)
    SelectCollectionObjects(rootCollection)
    return {"sourceBlend": WriteSourceBlend(rootCollection)}


def BuildAll():
    EnsureDirectories()
    RemovePreviewCollections()
    RemoveOwnedCollection()
    rootCollection = bpy.data.collections.new(CollectionName)
    bpy.context.scene.collection.children.link(rootCollection)
    environmentDefinitions = [
        (CreateEnvironment, "Model_EnvironmentCounty", "Model_EnvironmentCounty.glb"),
        (CreateNorthVillageEnvironment, "Model_EnvironmentNorthVillage", "Model_EnvironmentNorthVillage.glb"),
        (CreateQuarryEnvironment, "Model_EnvironmentQuarrySlope", "Model_EnvironmentQuarrySlope.glb"),
    ]
    exportReport = {}
    for createEnvironment, modelName, fileName in environmentDefinitions:
        environmentCollection = createEnvironment(rootCollection)
        JoinEnvironmentMeshes(environmentCollection, modelName)
        exportReport[fileName] = ExportCollection(environmentCollection, fileName)
    for assetName, palette, role, enemy, fileName in GetCharacterDefinitions():
        characterCollection = CreateCharacter(rootCollection, assetName, palette, role, enemy)
        BakeCharacterForRuntime(characterCollection, assetName)
        exportReport[fileName] = ExportCollection(characterCollection, fileName)
    SelectCollectionObjects(rootCollection)
    WriteSourceBlend(rootCollection)
    return exportReport


if __name__ == "__main__":
    scriptArguments = []
    if "--" in __import__("sys").argv:
        scriptArguments = __import__("sys").argv[__import__("sys").argv.index("--") + 1:]
    if "QuarryOnly" in scriptArguments:
        print(BuildQuarryOnly())
    elif "SourceOnly" in scriptArguments:
        print(BuildSourceOnly())
    else:
        print(BuildAll())
