"""Build two original, lightweight 1942 courier characters as self-contained GLB files.

Run with Blender 5.1 in a factory-startup background process. The script never opens,
reads, or overwrites the user's current Blender scene.
"""

import bpy
import json
import math
import os
from mathutils import Vector


scriptDirectory = os.path.dirname(os.path.abspath(__file__))
outputDirectory = scriptDirectory
createdObjects = []


def ResetScene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for dataCollection in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.armatures,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for dataBlock in list(dataCollection):
            if dataBlock.users == 0:
                dataCollection.remove(dataBlock)
    createdObjects.clear()


def CreateMaterial(materialName, baseColor, roughness=0.72, metallic=0.0):
    material = bpy.data.materials.new(materialName)
    material.use_nodes = True
    material.diffuse_color = (*baseColor, 1.0)
    principledNode = material.node_tree.nodes.get("Principled BSDF")
    principledNode.inputs["Base Color"].default_value = (*baseColor, 1.0)
    principledNode.inputs["Roughness"].default_value = roughness
    principledNode.inputs["Metallic"].default_value = metallic
    if "Coat Weight" in principledNode.inputs:
        principledNode.inputs["Coat Weight"].default_value = 0.0
    return material


def AssignMaterial(meshObject, material):
    if meshObject.data.materials:
        meshObject.data.materials[0] = material
    else:
        meshObject.data.materials.append(material)


def SetSmoothShading(meshObject, smooth=True):
    if meshObject.type != "MESH":
        return
    for polygon in meshObject.data.polygons:
        polygon.use_smooth = smooth


def ApplyObjectTransform(meshObject):
    bpy.context.view_layer.objects.active = meshObject
    meshObject.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    meshObject.select_set(False)


def ApplyBevel(meshObject, width, segments=1):
    bevelModifier = meshObject.modifiers.new(name="EdgeSoftening", type="BEVEL")
    bevelModifier.width = width
    bevelModifier.segments = segments
    bevelModifier.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = meshObject
    meshObject.select_set(True)
    bpy.ops.object.modifier_apply(modifier=bevelModifier.name)
    meshObject.select_set(False)


def BindToBone(meshObject, armatureObject, boneName):
    vertexGroup = meshObject.vertex_groups.new(name=boneName)
    vertexGroup.add(range(len(meshObject.data.vertices)), 1.0, "REPLACE")
    armatureModifier = meshObject.modifiers.new(name="SharedCourierRig", type="ARMATURE")
    armatureModifier.object = armatureObject
    armatureModifier.use_vertex_groups = True
    meshObject.parent = armatureObject


def ConsolidateCharacterMeshes(characterKey, armatureObject, meshObjects):
    validMeshes = [meshObject for meshObject in meshObjects if meshObject.type == "MESH"]
    if not validMeshes:
        raise RuntimeError(f"No meshes were built for {characterKey}")
    activeMesh = next(
        (meshObject for meshObject in validMeshes if meshObject.name == "Model_JacketLower"),
        validMeshes[0],
    )
    bpy.ops.object.select_all(action="DESELECT")
    for meshObject in validMeshes:
        meshObject.select_set(True)
    bpy.context.view_layer.objects.active = activeMesh
    bpy.ops.object.join()
    activeMesh.name = (
        "Model_TongcenCourierMesh"
        if characterKey == "zhaoTongcen"
        else "Model_XiangyunGuideMesh"
    )
    originalMaterials = list(activeMesh.data.materials)
    uniqueMaterials = []
    materialRemap = {}
    for materialIndex, material in enumerate(originalMaterials):
        if material not in uniqueMaterials:
            uniqueMaterials.append(material)
        materialRemap[materialIndex] = uniqueMaterials.index(material)
    polygonMaterialIndices = [
        materialRemap.get(polygon.material_index, 0)
        for polygon in activeMesh.data.polygons
    ]
    activeMesh.data.materials.clear()
    for material in uniqueMaterials:
        activeMesh.data.materials.append(material)
    for polygon, materialIndex in zip(activeMesh.data.polygons, polygonMaterialIndices):
        polygon.material_index = materialIndex
    armatureModifiers = [
        modifier for modifier in activeMesh.modifiers if modifier.type == "ARMATURE"
    ]
    if not armatureModifiers:
        armatureModifier = activeMesh.modifiers.new(name="SharedCourierRig", type="ARMATURE")
        armatureModifier.object = armatureObject
        armatureModifier.use_vertex_groups = True
    else:
        armatureModifiers[0].object = armatureObject
        for redundantModifier in armatureModifiers[1:]:
            activeMesh.modifiers.remove(redundantModifier)
    activeMesh.parent = armatureObject
    createdObjects.clear()
    createdObjects.append(activeMesh)
    return activeMesh


def RegisterMesh(meshObject, material, armatureObject=None, boneName=None, smooth=True):
    AssignMaterial(meshObject, material)
    SetSmoothShading(meshObject, smooth)
    if armatureObject is not None and boneName is not None:
        BindToBone(meshObject, armatureObject, boneName)
    createdObjects.append(meshObject)
    return meshObject


def AddUvSphere(objectName, location, scale, material, armatureObject=None, boneName=None, segments=16, ringCount=8):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=ringCount,
        location=location,
    )
    meshObject = bpy.context.object
    meshObject.name = objectName
    meshObject.scale = scale
    ApplyObjectTransform(meshObject)
    return RegisterMesh(meshObject, material, armatureObject, boneName, True)


def AddConeBetween(
    objectName,
    startPoint,
    endPoint,
    startRadius,
    endRadius,
    material,
    armatureObject=None,
    boneName=None,
    vertices=12,
):
    startVector = Vector(startPoint)
    endVector = Vector(endPoint)
    direction = endVector - startVector
    distance = direction.length
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=startRadius,
        radius2=endRadius,
        depth=distance,
        location=(startVector + endVector) * 0.5,
    )
    meshObject = bpy.context.object
    meshObject.name = objectName
    meshObject.rotation_mode = "QUATERNION"
    meshObject.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(direction.normalized())
    ApplyObjectTransform(meshObject)
    return RegisterMesh(meshObject, material, armatureObject, boneName, True)


def AddBeveledBox(
    objectName,
    location,
    dimensions,
    material,
    armatureObject=None,
    boneName=None,
    rotation=(0.0, 0.0, 0.0),
    bevelWidth=0.008,
    bevelSegments=1,
):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    meshObject = bpy.context.object
    meshObject.name = objectName
    meshObject.dimensions = dimensions
    ApplyObjectTransform(meshObject)
    if bevelWidth > 0.0:
        ApplyBevel(meshObject, bevelWidth, bevelSegments)
    return RegisterMesh(meshObject, material, armatureObject, boneName, False)


def AddBarBetween(
    objectName,
    startPoint,
    endPoint,
    width,
    depth,
    material,
    armatureObject=None,
    boneName=None,
    bevelWidth=0.006,
):
    startVector = Vector(startPoint)
    endVector = Vector(endPoint)
    direction = endVector - startVector
    midpoint = (startVector + endVector) * 0.5
    bpy.ops.mesh.primitive_cube_add(location=midpoint)
    meshObject = bpy.context.object
    meshObject.name = objectName
    meshObject.dimensions = (width, depth, direction.length)
    meshObject.rotation_mode = "QUATERNION"
    meshObject.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(direction.normalized())
    ApplyObjectTransform(meshObject)
    if bevelWidth > 0.0:
        ApplyBevel(meshObject, bevelWidth, 1)
    return RegisterMesh(meshObject, material, armatureObject, boneName, False)


def AddLoftMesh(
    objectName,
    ringDefinitions,
    material,
    armatureObject=None,
    boneName=None,
    segmentCount=16,
    frontBias=0.0,
):
    vertices = []
    faces = []
    for ringIndex, ringDefinition in enumerate(ringDefinitions):
        ringZ, ringWidth, ringDepth = ringDefinition
        for segmentIndex in range(segmentCount):
            angle = 2.0 * math.pi * segmentIndex / segmentCount
            xPosition = math.cos(angle) * ringWidth
            yPosition = math.sin(angle) * ringDepth
            if yPosition < 0.0:
                yPosition += frontBias
            vertices.append((xPosition, yPosition, ringZ))
        if ringIndex > 0:
            previousStart = (ringIndex - 1) * segmentCount
            currentStart = ringIndex * segmentCount
            for segmentIndex in range(segmentCount):
                nextIndex = (segmentIndex + 1) % segmentCount
                faces.append(
                    (
                        previousStart + segmentIndex,
                        previousStart + nextIndex,
                        currentStart + nextIndex,
                        currentStart + segmentIndex,
                    )
                )
    bottomCenterIndex = len(vertices)
    bottomRing = ringDefinitions[0]
    vertices.append((0.0, 0.0, bottomRing[0]))
    topCenterIndex = len(vertices)
    topRing = ringDefinitions[-1]
    vertices.append((0.0, 0.0, topRing[0]))
    for segmentIndex in range(segmentCount):
        nextIndex = (segmentIndex + 1) % segmentCount
        faces.append((bottomCenterIndex, nextIndex, segmentIndex))
        topStart = (len(ringDefinitions) - 1) * segmentCount
        faces.append((topCenterIndex, topStart + segmentIndex, topStart + nextIndex))
    meshData = bpy.data.meshes.new(f"{objectName}Mesh")
    meshData.from_pydata(vertices, [], faces)
    meshData.update()
    meshObject = bpy.data.objects.new(objectName, meshData)
    bpy.context.collection.objects.link(meshObject)
    return RegisterMesh(meshObject, material, armatureObject, boneName, True)


def AddCrescentBlade(
    objectName,
    centerPoint,
    outerRadius,
    innerRadius,
    startAngle,
    endAngle,
    thickness,
    material,
    armatureObject,
    boneName,
    segmentCount=16,
):
    vertices = []
    faces = []
    centerVector = Vector(centerPoint)
    for layerIndex, yOffset in enumerate((-thickness * 0.5, thickness * 0.5)):
        for radius in (outerRadius, innerRadius):
            for segmentIndex in range(segmentCount + 1):
                interpolation = segmentIndex / segmentCount
                angle = startAngle + (endAngle - startAngle) * interpolation
                vertices.append(
                    (
                        centerVector.x + math.cos(angle) * radius,
                        centerVector.y + yOffset,
                        centerVector.z + math.sin(angle) * radius,
                    )
                )
    layerStride = 2 * (segmentCount + 1)
    ringStride = segmentCount + 1
    for segmentIndex in range(segmentCount):
        outerA = segmentIndex
        outerB = segmentIndex + 1
        innerA = ringStride + segmentIndex
        innerB = ringStride + segmentIndex + 1
        faces.append((outerA, outerB, innerB, innerA))
        faces.append(
            (
                layerStride + outerA,
                layerStride + innerA,
                layerStride + innerB,
                layerStride + outerB,
            )
        )
        faces.append((outerA, layerStride + outerA, layerStride + outerB, outerB))
        faces.append((innerA, innerB, layerStride + innerB, layerStride + innerA))
    endIndices = (0, ringStride, layerStride + ringStride, layerStride)
    faces.append(endIndices)
    lastOuter = segmentCount
    lastInner = ringStride + segmentCount
    faces.append((lastOuter, layerStride + lastOuter, layerStride + lastInner, lastInner))
    meshData = bpy.data.meshes.new(f"{objectName}Mesh")
    meshData.from_pydata(vertices, [], faces)
    meshData.update()
    meshObject = bpy.data.objects.new(objectName, meshData)
    bpy.context.collection.objects.link(meshObject)
    return RegisterMesh(meshObject, material, armatureObject, boneName, False)


def GetCharacterPalette(characterKey):
    if characterKey == "zhaoTongcen":
        return {
            "skin": CreateMaterial("Material_SunWeatheredSkin", (0.47, 0.31, 0.22), 0.86),
            "skinShadow": CreateMaterial("Material_SkinShadow", (0.30, 0.18, 0.13), 0.9),
            "jacket": CreateMaterial("Material_ZhaoIndigoJacket", (0.105, 0.145, 0.15), 0.94),
            "jacketDark": CreateMaterial("Material_ZhaoJacketSeams", (0.055, 0.075, 0.078), 0.95),
            "trousers": CreateMaterial("Material_ZhaoEarthTrousers", (0.18, 0.16, 0.115), 0.96),
            "puttee": CreateMaterial("Material_ZhaoPuttees", (0.25, 0.24, 0.19), 1.0),
            "boots": CreateMaterial("Material_WornClothShoes", (0.055, 0.044, 0.033), 0.97),
            "hair": CreateMaterial("Material_BlackHair", (0.025, 0.021, 0.018), 0.9),
            "canvas": CreateMaterial("Material_MedicalCanvas", (0.42, 0.37, 0.27), 0.96),
            "clothPatch": CreateMaterial("Material_MedicalPatch", (0.70, 0.66, 0.55), 0.98),
            "redMark": CreateMaterial("Material_HandPaintedRedMark", (0.39, 0.055, 0.035), 0.9),
            "wood": CreateMaterial("Material_RifleWood", (0.24, 0.105, 0.046), 0.8),
            "metal": CreateMaterial("Material_DulledGunmetal", (0.075, 0.08, 0.075), 0.52, 0.72),
        }
    return {
        "skin": CreateMaterial("Material_SunWeatheredSkin", (0.50, 0.325, 0.225), 0.86),
        "skinShadow": CreateMaterial("Material_SkinShadow", (0.31, 0.18, 0.13), 0.9),
        "jacket": CreateMaterial("Material_DuAshGreenJacket", (0.155, 0.19, 0.16), 0.95),
        "jacketDark": CreateMaterial("Material_DuJacketSeams", (0.075, 0.095, 0.075), 0.98),
        "trousers": CreateMaterial("Material_DuCharcoalTrousers", (0.12, 0.115, 0.095), 0.98),
        "puttee": CreateMaterial("Material_DuPuttees", (0.30, 0.27, 0.205), 1.0),
        "boots": CreateMaterial("Material_WornClothShoes", (0.052, 0.043, 0.032), 0.97),
        "hair": CreateMaterial("Material_BlackHair", (0.022, 0.018, 0.017), 0.9),
        "scarf": CreateMaterial("Material_DuRustHeadscarf", (0.31, 0.095, 0.052), 0.96),
        "canvas": CreateMaterial("Material_ClothRollCanvas", (0.52, 0.45, 0.32), 0.98),
        "wood": CreateMaterial("Material_SickleHandle", (0.28, 0.13, 0.052), 0.89),
        "metal": CreateMaterial("Material_DulledSickleSteel", (0.18, 0.19, 0.17), 0.42, 0.67),
    }


def GetRigDefinitions(characterKey, scale):
    if characterKey == "zhaoTongcen":
        leftElbow = (0.405, -0.025, 1.205)
        leftWrist = (0.34, -0.135, 0.965)
        leftHand = (0.315, -0.15, 0.845)
        rightElbow = (-0.405, 0.008, 1.215)
        rightWrist = (-0.335, -0.105, 0.975)
        rightHand = (-0.31, -0.12, 0.855)
        shoulderWidth = 0.245
    else:
        leftElbow = (0.355, -0.018, 1.19)
        leftWrist = (0.29, -0.105, 0.935)
        leftHand = (0.275, -0.12, 0.825)
        rightElbow = (-0.355, 0.012, 1.18)
        rightWrist = (-0.39, -0.03, 0.905)
        rightHand = (-0.405, -0.035, 0.79)
        shoulderWidth = 0.225

    def Scaled(point):
        return tuple(component * scale for component in point)

    boneDefinitions = {
        "Root": (Scaled((0.0, 0.0, 0.0)), Scaled((0.0, 0.0, 0.12)), None, False),
        "Hips": (Scaled((0.0, 0.0, 0.84)), Scaled((0.0, 0.0, 1.01)), "Root", True),
        "Spine": (Scaled((0.0, 0.0, 0.98)), Scaled((0.0, 0.0, 1.24)), "Hips", True),
        "Chest": (Scaled((0.0, 0.0, 1.20)), Scaled((0.0, 0.0, 1.47)), "Spine", True),
        "Neck": (Scaled((0.0, 0.0, 1.46)), Scaled((0.0, 0.0, 1.56)), "Chest", True),
        "Head": (Scaled((0.0, 0.0, 1.55)), Scaled((0.0, 0.0, 1.73)), "Neck", True),
        "UpperArm_L": (
            Scaled((shoulderWidth, 0.0, 1.435)),
            Scaled(leftElbow),
            "Chest",
            True,
        ),
        "Forearm_L": (Scaled(leftElbow), Scaled(leftWrist), "UpperArm_L", True),
        "Hand_L": (Scaled(leftWrist), Scaled(leftHand), "Forearm_L", True),
        "UpperArm_R": (
            Scaled((-shoulderWidth, 0.0, 1.435)),
            Scaled(rightElbow),
            "Chest",
            True,
        ),
        "Forearm_R": (Scaled(rightElbow), Scaled(rightWrist), "UpperArm_R", True),
        "Hand_R": (Scaled(rightWrist), Scaled(rightHand), "Forearm_R", True),
        "Thigh_L": (Scaled((0.105, 0.0, 0.91)), Scaled((0.11, 0.018, 0.53)), "Hips", True),
        "Shin_L": (Scaled((0.11, 0.018, 0.53)), Scaled((0.105, -0.005, 0.145)), "Thigh_L", True),
        "Foot_L": (Scaled((0.105, -0.005, 0.145)), Scaled((0.105, -0.175, 0.065)), "Shin_L", True),
        "Thigh_R": (Scaled((-0.105, 0.0, 0.91)), Scaled((-0.11, -0.012, 0.535)), "Hips", True),
        "Shin_R": (Scaled((-0.11, -0.012, 0.535)), Scaled((-0.105, 0.012, 0.145)), "Thigh_R", True),
        "Foot_R": (Scaled((-0.105, 0.012, 0.145)), Scaled((-0.105, -0.17, 0.065)), "Shin_R", True),
        "Prop_Rifle": (Scaled((0.0, 0.10, 1.11)), Scaled((0.0, 0.10, 1.34)), "Chest", True),
        "Prop_Satchel": (Scaled((0.18, -0.02, 0.90)), Scaled((0.18, -0.02, 1.04)), "Hips", True),
        "Prop_Sickle": (Scaled((-0.40, -0.03, 0.80)), Scaled((-0.40, -0.03, 0.98)), "Hand_R", True),
    }
    return boneDefinitions


def CreateSharedArmature(characterKey, scale, previewSuffix=""):
    armatureName = "Armature_SharedCourier"
    if previewSuffix:
        armatureName = f"{armatureName}_{previewSuffix}"
    armatureData = bpy.data.armatures.new(f"{armatureName}Data")
    armatureObject = bpy.data.objects.new(armatureName, armatureData)
    bpy.context.collection.objects.link(armatureObject)
    bpy.context.view_layer.objects.active = armatureObject
    armatureObject.select_set(True)
    armatureObject.show_in_front = True
    bpy.ops.object.mode_set(mode="EDIT")
    definitions = GetRigDefinitions(characterKey, scale)
    editBones = {}
    for boneName, boneDefinition in definitions.items():
        headPoint, tailPoint, parentName, deform = boneDefinition
        editBone = armatureData.edit_bones.new(boneName)
        editBone.head = headPoint
        editBone.tail = tailPoint
        editBone.use_deform = deform
        editBones[boneName] = editBone
        if parentName:
            editBone.parent = editBones[parentName]
    bpy.ops.object.mode_set(mode="OBJECT")
    armatureObject.select_set(False)
    return armatureObject, definitions


def AddFace(characterKey, scale, palette, armatureObject):
    headCenterZ = 1.635 * scale
    AddLoftMesh(
        "Model_Head",
        [
            (1.535 * scale, 0.058 * scale, 0.066 * scale),
            (1.565 * scale, 0.081 * scale, 0.082 * scale),
            (1.615 * scale, 0.096 * scale, 0.093 * scale),
            (1.675 * scale, 0.092 * scale, 0.097 * scale),
            (1.725 * scale, 0.068 * scale, 0.076 * scale),
            (1.748 * scale, 0.035 * scale, 0.042 * scale),
        ],
        palette["skin"],
        armatureObject,
        "Head",
        16,
        -0.006 * scale,
    )
    AddUvSphere(
        "Model_EarL",
        (0.096 * scale, 0.0, headCenterZ),
        (0.018 * scale, 0.011 * scale, 0.027 * scale),
        palette["skin"],
        armatureObject,
        "Head",
        12,
        6,
    )
    AddUvSphere(
        "Model_EarR",
        (-0.096 * scale, 0.0, headCenterZ),
        (0.018 * scale, 0.011 * scale, 0.027 * scale),
        palette["skin"],
        armatureObject,
        "Head",
        12,
        6,
    )
    eyeZ = 1.655 * scale
    for sideName, xPosition in (("L", 0.034), ("R", -0.034)):
        AddUvSphere(
            f"Model_Eye{sideName}",
            (xPosition * scale, -0.097 * scale, eyeZ),
            (0.010 * scale, 0.005 * scale, 0.006 * scale),
            palette["hair"],
            armatureObject,
            "Head",
            10,
            5,
        )
        AddBeveledBox(
            f"Model_Brow{sideName}",
            (xPosition * scale, -0.096 * scale, 1.678 * scale),
            (0.036 * scale, 0.006 * scale, 0.006 * scale),
            palette["hair"],
            armatureObject,
            "Head",
            rotation=(0.0, math.radians(-4.0 if sideName == "L" else 4.0), 0.0),
            bevelWidth=0.002 * scale,
        )
    noseVertices = [
        (-0.020 * scale, -0.094 * scale, 1.650 * scale),
        (0.020 * scale, -0.094 * scale, 1.650 * scale),
        (0.0, -0.132 * scale, 1.615 * scale),
        (-0.017 * scale, -0.098 * scale, 1.606 * scale),
        (0.017 * scale, -0.098 * scale, 1.606 * scale),
    ]
    noseFaces = [(0, 1, 2), (0, 2, 3), (1, 4, 2), (3, 2, 4), (0, 3, 4, 1)]
    noseData = bpy.data.meshes.new("Model_NoseMesh")
    noseData.from_pydata(noseVertices, [], noseFaces)
    noseObject = bpy.data.objects.new("Model_Nose", noseData)
    bpy.context.collection.objects.link(noseObject)
    RegisterMesh(noseObject, palette["skin"], armatureObject, "Head", False)
    AddBeveledBox(
        "Model_Mouth",
        (0.0, -0.098 * scale, 1.585 * scale),
        (0.050 * scale, 0.006 * scale, 0.005 * scale),
        palette["skinShadow"],
        armatureObject,
        "Head",
        bevelWidth=0.002 * scale,
    )
    if characterKey == "zhaoTongcen":
        AddUvSphere(
            "Model_CottonCapCrown",
            (0.0, 0.006 * scale, 1.718 * scale),
            (0.102 * scale, 0.103 * scale, 0.061 * scale),
            palette["jacketDark"],
            armatureObject,
            "Head",
            16,
            8,
        )
        AddBeveledBox(
            "Model_CottonCapBrim",
            (0.0, -0.095 * scale, 1.696 * scale),
            (0.105 * scale, 0.055 * scale, 0.014 * scale),
            palette["jacketDark"],
            armatureObject,
            "Head",
            rotation=(math.radians(-7.0), 0.0, 0.0),
            bevelWidth=0.004 * scale,
        )
    else:
        AddUvSphere(
            "Model_HeadscarfCrown",
            (0.0, 0.012 * scale, 1.714 * scale),
            (0.106 * scale, 0.112 * scale, 0.072 * scale),
            palette["scarf"],
            armatureObject,
            "Head",
            16,
            8,
        )
        AddBarBetween(
            "Model_HeadscarfTailLong",
            (0.045 * scale, 0.070 * scale, 1.675 * scale),
            (0.125 * scale, 0.095 * scale, 1.405 * scale),
            0.070 * scale,
            0.018 * scale,
            palette["scarf"],
            armatureObject,
            "Head",
            0.005 * scale,
        )
        AddBarBetween(
            "Model_HeadscarfTailShort",
            (-0.035 * scale, 0.074 * scale, 1.665 * scale),
            (-0.105 * scale, 0.092 * scale, 1.485 * scale),
            0.060 * scale,
            0.018 * scale,
            palette["scarf"],
            armatureObject,
            "Head",
            0.005 * scale,
        )


def AddClothing(characterKey, scale, palette, armatureObject):
    shoulderWidth = (0.260 if characterKey == "zhaoTongcen" else 0.238) * scale
    waistWidth = (0.188 if characterKey == "zhaoTongcen" else 0.175) * scale
    hemWidth = (0.205 if characterKey == "zhaoTongcen" else 0.218) * scale
    AddLoftMesh(
        "Model_JacketLower",
        [
            (0.875 * scale, hemWidth, 0.120 * scale),
            (0.980 * scale, 0.202 * scale, 0.125 * scale),
            (1.105 * scale, waistWidth, 0.122 * scale),
            (1.205 * scale, 0.193 * scale, 0.128 * scale),
        ],
        palette["jacket"],
        armatureObject,
        "Spine",
        16,
        -0.008 * scale,
    )
    AddLoftMesh(
        "Model_JacketUpper",
        [
            (1.170 * scale, 0.190 * scale, 0.128 * scale),
            (1.330 * scale, 0.215 * scale, 0.135 * scale),
            (1.435 * scale, shoulderWidth, 0.142 * scale),
            (1.495 * scale, 0.115 * scale, 0.100 * scale),
        ],
        palette["jacket"],
        armatureObject,
        "Chest",
        16,
        -0.008 * scale,
    )
    AddConeBetween(
        "Model_Neck",
        (0.0, 0.0, 1.485 * scale),
        (0.0, 0.0, 1.555 * scale),
        0.060 * scale,
        0.066 * scale,
        palette["skin"],
        armatureObject,
        "Neck",
        12,
    )
    for collarName, xPosition, zRotation in (("L", 0.064, -16.0), ("R", -0.064, 16.0)):
        AddBeveledBox(
            f"Model_Collar{collarName}",
            (xPosition * scale, -0.125 * scale, 1.455 * scale),
            (0.105 * scale, 0.020 * scale, 0.105 * scale),
            palette["jacketDark"],
            armatureObject,
            "Chest",
            rotation=(0.0, math.radians(zRotation), 0.0),
            bevelWidth=0.005 * scale,
        )
    AddBeveledBox(
        "Model_JacketPlacket",
        (0.0, -0.132 * scale, 1.190 * scale),
        (0.018 * scale, 0.014 * scale, 0.510 * scale),
        palette["jacketDark"],
        armatureObject,
        "Spine",
        bevelWidth=0.003 * scale,
    )
    for seamIndex, seamZ in enumerate((0.955, 1.085, 1.225, 1.355)):
        seamBone = "Spine" if seamZ < 1.19 else "Chest"
        seamHalfWidth = 0.19 if seamZ < 1.19 else 0.205
        AddBeveledBox(
            f"Model_QuiltBand{seamIndex + 1}",
            (0.0, -0.137 * scale, seamZ * scale),
            (seamHalfWidth * 2.0 * scale, 0.012 * scale, 0.009 * scale),
            palette["jacketDark"],
            armatureObject,
            seamBone,
            bevelWidth=0.0025 * scale,
        )
    AddBeveledBox(
        "Model_ClothBelt",
        (0.0, -0.004 * scale, 1.045 * scale),
        (0.405 * scale, 0.265 * scale, 0.050 * scale),
        palette["jacketDark"],
        armatureObject,
        "Spine",
        bevelWidth=0.008 * scale,
        bevelSegments=2,
    )


def AddLimbs(characterKey, scale, palette, armatureObject, definitions):
    armRadii = (0.082 * scale, 0.069 * scale, 0.061 * scale, 0.044 * scale)
    for sideName in ("L", "R"):
        upperDefinition = definitions[f"UpperArm_{sideName}"]
        forearmDefinition = definitions[f"Forearm_{sideName}"]
        handDefinition = definitions[f"Hand_{sideName}"]
        AddConeBetween(
            f"Model_UpperSleeve{sideName}",
            upperDefinition[0],
            upperDefinition[1],
            armRadii[0],
            armRadii[1],
            palette["jacket"],
            armatureObject,
            f"UpperArm_{sideName}",
            14,
        )
        AddConeBetween(
            f"Model_ForeSleeve{sideName}",
            forearmDefinition[0],
            forearmDefinition[1],
            armRadii[2],
            armRadii[3],
            palette["jacket"],
            armatureObject,
            f"Forearm_{sideName}",
            14,
        )
        handMidpoint = (Vector(handDefinition[0]) + Vector(handDefinition[1])) * 0.5
        handDirection = Vector(handDefinition[1]) - Vector(handDefinition[0])
        AddUvSphere(
            f"Model_Hand{sideName}",
            handMidpoint,
            (0.046 * scale, 0.035 * scale, max(0.055 * scale, handDirection.length * 0.48)),
            palette["skin"],
            armatureObject,
            f"Hand_{sideName}",
            12,
            6,
        )
    for sideName in ("L", "R"):
        thighDefinition = definitions[f"Thigh_{sideName}"]
        shinDefinition = definitions[f"Shin_{sideName}"]
        footDefinition = definitions[f"Foot_{sideName}"]
        AddConeBetween(
            f"Model_Thigh{sideName}",
            thighDefinition[0],
            thighDefinition[1],
            0.105 * scale,
            0.078 * scale,
            palette["trousers"],
            armatureObject,
            f"Thigh_{sideName}",
            14,
        )
        AddConeBetween(
            f"Model_Shin{sideName}",
            shinDefinition[0],
            shinDefinition[1],
            0.078 * scale,
            0.058 * scale,
            palette["trousers"],
            armatureObject,
            f"Shin_{sideName}",
            14,
        )
        kneePoint = Vector(thighDefinition[1])
        AddBeveledBox(
            f"Model_KneePatch{sideName}",
            (kneePoint.x, kneePoint.y - 0.068 * scale, kneePoint.z + 0.025 * scale),
            (0.105 * scale, 0.012 * scale, 0.145 * scale),
            palette["jacketDark"],
            armatureObject,
            f"Thigh_{sideName}",
            bevelWidth=0.008 * scale,
        )
        for wrapIndex, interpolation in enumerate((0.18, 0.34, 0.50, 0.66, 0.82)):
            wrapPoint = Vector(shinDefinition[0]).lerp(Vector(shinDefinition[1]), interpolation)
            AddConeBetween(
                f"Model_Puttee{sideName}{wrapIndex + 1}",
                (wrapPoint.x, wrapPoint.y, wrapPoint.z - 0.014 * scale),
                (wrapPoint.x, wrapPoint.y, wrapPoint.z + 0.014 * scale),
                0.065 * scale,
                0.065 * scale,
                palette["puttee"],
                armatureObject,
                f"Shin_{sideName}",
                12,
            )
        footMidpoint = (Vector(footDefinition[0]) + Vector(footDefinition[1])) * 0.5
        footDirection = Vector(footDefinition[1]) - Vector(footDefinition[0])
        AddBarBetween(
            f"Model_ClothShoe{sideName}",
            Vector(footDefinition[0]) + Vector((0.0, 0.012 * scale, -0.020 * scale)),
            Vector(footDefinition[1]) + Vector((0.0, -0.025 * scale, -0.020 * scale)),
            0.112 * scale,
            0.090 * scale,
            palette["boots"],
            armatureObject,
            f"Foot_{sideName}",
            0.012 * scale,
        )
        AddBeveledBox(
            f"Model_ShoeSole{sideName}",
            (footMidpoint.x, footMidpoint.y - 0.012 * scale, 0.035 * scale),
            (0.120 * scale, footDirection.length * 1.12, 0.025 * scale),
            palette["boots"],
            armatureObject,
            f"Foot_{sideName}",
            bevelWidth=0.008 * scale,
        )


def AddZhaoEquipment(scale, palette, armatureObject):
    AddBarBetween(
        "Model_SatchelStrap",
        (-0.175 * scale, -0.150 * scale, 1.430 * scale),
        (0.250 * scale, -0.142 * scale, 0.925 * scale),
        0.040 * scale,
        0.014 * scale,
        palette["canvas"],
        armatureObject,
        "Prop_Satchel",
        0.005 * scale,
    )
    AddBeveledBox(
        "Model_MedicalSatchel",
        (0.270 * scale, -0.045 * scale, 0.885 * scale),
        (0.305 * scale, 0.130 * scale, 0.245 * scale),
        palette["canvas"],
        armatureObject,
        "Prop_Satchel",
        rotation=(0.0, math.radians(-5.0), math.radians(-5.0)),
        bevelWidth=0.018 * scale,
        bevelSegments=2,
    )
    AddBeveledBox(
        "Model_SatchelFlap",
        (0.270 * scale, -0.116 * scale, 0.940 * scale),
        (0.285 * scale, 0.026 * scale, 0.135 * scale),
        palette["canvas"],
        armatureObject,
        "Prop_Satchel",
        rotation=(math.radians(2.0), 0.0, math.radians(-5.0)),
        bevelWidth=0.012 * scale,
        bevelSegments=2,
    )
    AddBeveledBox(
        "Model_MedicalClothPatch",
        (0.270 * scale, -0.132 * scale, 0.925 * scale),
        (0.115 * scale, 0.008 * scale, 0.102 * scale),
        palette["clothPatch"],
        armatureObject,
        "Prop_Satchel",
        bevelWidth=0.004 * scale,
    )
    AddBeveledBox(
        "Model_MedicalMarkVertical",
        (0.270 * scale, -0.137 * scale, 0.925 * scale),
        (0.024 * scale, 0.005 * scale, 0.073 * scale),
        palette["redMark"],
        armatureObject,
        "Prop_Satchel",
        bevelWidth=0.003 * scale,
    )
    AddBeveledBox(
        "Model_MedicalMarkHorizontal",
        (0.270 * scale, -0.137 * scale, 0.925 * scale),
        (0.071 * scale, 0.005 * scale, 0.024 * scale),
        palette["redMark"],
        armatureObject,
        "Prop_Satchel",
        bevelWidth=0.003 * scale,
    )
    rifleStart = Vector((-0.285 * scale, 0.150 * scale, 0.790 * scale))
    rifleEnd = Vector((0.255 * scale, 0.154 * scale, 1.680 * scale))
    rifleDirection = (rifleEnd - rifleStart).normalized()
    AddBarBetween(
        "Model_RifleStock",
        rifleStart,
        rifleStart + rifleDirection * (0.38 * scale),
        0.092 * scale,
        0.050 * scale,
        palette["wood"],
        armatureObject,
        "Prop_Rifle",
        0.012 * scale,
    )
    AddBarBetween(
        "Model_RifleForestock",
        rifleStart + rifleDirection * (0.30 * scale),
        rifleStart + rifleDirection * (0.78 * scale),
        0.048 * scale,
        0.036 * scale,
        palette["wood"],
        armatureObject,
        "Prop_Rifle",
        0.006 * scale,
    )
    AddConeBetween(
        "Model_RifleBarrel",
        rifleStart + rifleDirection * (0.42 * scale),
        rifleEnd,
        0.012 * scale,
        0.009 * scale,
        palette["metal"],
        armatureObject,
        "Prop_Rifle",
        10,
    )
    boltCenter = rifleStart + rifleDirection * (0.43 * scale)
    AddBeveledBox(
        "Model_RifleReceiver",
        boltCenter,
        (0.065 * scale, 0.060 * scale, 0.160 * scale),
        palette["metal"],
        armatureObject,
        "Prop_Rifle",
        rotation=(math.radians(-31.0), 0.0, math.radians(-31.0)),
        bevelWidth=0.007 * scale,
    )
    AddConeBetween(
        "Model_RifleFrontSight",
        rifleEnd + Vector((0.0, 0.0, -0.015 * scale)),
        rifleEnd + Vector((0.0, -0.035 * scale, -0.015 * scale)),
        0.007 * scale,
        0.004 * scale,
        palette["metal"],
        armatureObject,
        "Prop_Rifle",
        8,
    )


def AddDuEquipment(scale, palette, armatureObject):
    AddBarBetween(
        "Model_ClothBundleStrap",
        (0.175 * scale, -0.145 * scale, 1.390 * scale),
        (-0.205 * scale, -0.135 * scale, 0.930 * scale),
        0.034 * scale,
        0.014 * scale,
        palette["canvas"],
        armatureObject,
        "Prop_Satchel",
        0.005 * scale,
    )
    AddBeveledBox(
        "Model_ClothBundleSatchel",
        (-0.235 * scale, -0.035 * scale, 0.905 * scale),
        (0.245 * scale, 0.120 * scale, 0.205 * scale),
        palette["canvas"],
        armatureObject,
        "Prop_Satchel",
        rotation=(0.0, math.radians(5.0), math.radians(4.0)),
        bevelWidth=0.018 * scale,
        bevelSegments=2,
    )
    for rollIndex, xPosition in enumerate((-0.285, -0.225, -0.165)):
        AddConeBetween(
            f"Model_CleanClothRoll{rollIndex + 1}",
            (xPosition * scale, -0.105 * scale, 0.845 * scale),
            (xPosition * scale, -0.105 * scale, 0.955 * scale),
            0.028 * scale,
            0.028 * scale,
            palette["canvas"],
            armatureObject,
            "Prop_Satchel",
            12,
        )
    handleStart = (-0.405 * scale, -0.038 * scale, 0.790 * scale)
    handleEnd = (-0.435 * scale, -0.030 * scale, 0.515 * scale)
    AddConeBetween(
        "Model_SickleHandle",
        handleStart,
        handleEnd,
        0.026 * scale,
        0.022 * scale,
        palette["wood"],
        armatureObject,
        "Prop_Sickle",
        12,
    )
    AddBeveledBox(
        "Model_SickleTang",
        (-0.445 * scale, -0.030 * scale, 0.525 * scale),
        (0.070 * scale, 0.026 * scale, 0.026 * scale),
        palette["metal"],
        armatureObject,
        "Prop_Sickle",
        rotation=(0.0, math.radians(-18.0), 0.0),
        bevelWidth=0.004 * scale,
    )
    AddCrescentBlade(
        "Model_SickleBlade",
        (-0.540 * scale, -0.030 * scale, 0.625 * scale),
        0.185 * scale,
        0.126 * scale,
        math.radians(-68.0),
        math.radians(108.0),
        0.018 * scale,
        palette["metal"],
        armatureObject,
        "Prop_Sickle",
        18,
    )


def BuildCharacter(characterKey, previewSuffix=""):
    scale = 1.0 if characterKey == "zhaoTongcen" else 0.94
    palette = GetCharacterPalette(characterKey)
    armatureObject, definitions = CreateSharedArmature(characterKey, scale, previewSuffix)
    AddClothing(characterKey, scale, palette, armatureObject)
    AddLimbs(characterKey, scale, palette, armatureObject, definitions)
    AddFace(characterKey, scale, palette, armatureObject)
    if characterKey == "zhaoTongcen":
        AddZhaoEquipment(scale, palette, armatureObject)
    else:
        AddDuEquipment(scale, palette, armatureObject)
    ConsolidateCharacterMeshes(characterKey, armatureObject, list(createdObjects))
    armatureObject["characterId"] = characterKey
    armatureObject["rigSchema"] = "SharedCourierRigV1"
    armatureObject["frontAxis"] = "-Y"
    armatureObject["upAxis"] = "+Z"
    return armatureObject, list(createdObjects)


def CollectModelStats(armatureObject, meshObjects):
    triangleCount = 0
    vertexCount = 0
    minimum = Vector((float("inf"), float("inf"), float("inf")))
    maximum = Vector((float("-inf"), float("-inf"), float("-inf")))
    dependencyGraph = bpy.context.evaluated_depsgraph_get()
    for meshObject in meshObjects:
        if meshObject.type != "MESH":
            continue
        evaluatedObject = meshObject.evaluated_get(dependencyGraph)
        evaluatedMesh = evaluatedObject.to_mesh()
        evaluatedMesh.calc_loop_triangles()
        triangleCount += len(evaluatedMesh.loop_triangles)
        vertexCount += len(evaluatedMesh.vertices)
        for corner in evaluatedObject.bound_box:
            worldCorner = evaluatedObject.matrix_world @ Vector(corner)
            minimum.x = min(minimum.x, worldCorner.x)
            minimum.y = min(minimum.y, worldCorner.y)
            minimum.z = min(minimum.z, worldCorner.z)
            maximum.x = max(maximum.x, worldCorner.x)
            maximum.y = max(maximum.y, worldCorner.y)
            maximum.z = max(maximum.z, worldCorner.z)
        evaluatedObject.to_mesh_clear()
    dimensions = maximum - minimum
    return {
        "triangles": triangleCount,
        "vertices": vertexCount,
        "bones": len(armatureObject.data.bones),
        "boneNames": [bone.name for bone in armatureObject.data.bones],
        "dimensionsMeters": {
            "width": round(dimensions.x, 4),
            "depth": round(dimensions.y, 4),
            "height": round(dimensions.z, 4),
        },
        "boundsMeters": {
            "minimum": [round(value, 4) for value in minimum],
            "maximum": [round(value, 4) for value in maximum],
        },
    }


def ValidateManualBoneDrive(armatureObject, meshObject):
    dependencyGraph = bpy.context.evaluated_depsgraph_get()
    evaluatedObject = meshObject.evaluated_get(dependencyGraph)
    evaluatedMesh = evaluatedObject.to_mesh()
    positionsBefore = [vertex.co.copy() for vertex in evaluatedMesh.vertices]
    evaluatedObject.to_mesh_clear()
    drivenBone = armatureObject.pose.bones["Forearm_R"]
    drivenBone.rotation_mode = "XYZ"
    drivenBone.rotation_euler[1] = math.radians(24.0)
    bpy.context.view_layer.update()
    evaluatedObject = meshObject.evaluated_get(dependencyGraph)
    evaluatedMesh = evaluatedObject.to_mesh()
    positionsAfter = [vertex.co.copy() for vertex in evaluatedMesh.vertices]
    evaluatedObject.to_mesh_clear()
    maximumDelta = max(
        (afterPosition - beforePosition).length
        for beforePosition, afterPosition in zip(positionsBefore, positionsAfter)
    )
    drivenBone.rotation_euler[1] = 0.0
    bpy.context.view_layer.update()
    if maximumDelta < 0.005:
        raise RuntimeError(
            f"Manual bone drive did not deform {meshObject.name}: {maximumDelta:.6f} m"
        )
    return {
        "bone": drivenBone.name,
        "rotationDegrees": 24.0,
        "maxVertexDeltaMeters": round(maximumDelta, 5),
        "passed": True,
    }


def ExportCharacter(characterKey, fileName):
    ResetScene()
    armatureObject, meshObjects = BuildCharacter(characterKey)
    stats = CollectModelStats(armatureObject, meshObjects)
    bpy.ops.object.select_all(action="DESELECT")
    armatureObject.select_set(True)
    for meshObject in meshObjects:
        meshObject.select_set(True)
    bpy.context.view_layer.objects.active = armatureObject
    outputPath = os.path.join(outputDirectory, fileName)
    bpy.ops.export_scene.gltf(
        filepath=outputPath,
        export_format="GLB",
        use_selection=True,
        export_animations=False,
        export_lights=False,
        export_cameras=False,
    )
    stats["file"] = fileName
    stats["fileBytes"] = os.path.getsize(outputPath)
    stats["characterId"] = characterKey
    return stats


def AddPreviewText(textValue, location, material, textSize=0.105):
    curveData = bpy.data.curves.new(name=f"PreviewText_{textValue}", type="FONT")
    curveData.body = textValue
    curveData.align_x = "CENTER"
    curveData.align_y = "CENTER"
    curveData.size = textSize
    curveData.extrude = 0.002
    textObject = bpy.data.objects.new(f"PreviewText_{textValue}", curveData)
    bpy.context.collection.objects.link(textObject)
    textObject.location = location
    textObject.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    curveData.materials.append(material)
    return textObject


def ImportModelForPreview(fileName, xOffset, zRotation):
    objectNamesBefore = set(bpy.data.objects.keys())
    bpy.ops.import_scene.gltf(filepath=os.path.join(outputDirectory, fileName))
    importedObjects = [
        objectValue
        for objectValue in bpy.data.objects
        if objectValue.name not in objectNamesBefore
    ]
    topLevelObjects = [objectValue for objectValue in importedObjects if objectValue.parent is None]
    for objectValue in topLevelObjects:
        objectValue.location.x += xOffset
        objectValue.rotation_euler.z += math.radians(zRotation)
    return importedObjects


def BuildAndRenderComparison():
    ResetScene()
    ImportModelForPreview("Model_TongcenCourier.glb", -0.72, -8.0)
    ImportModelForPreview("Model_XiangyunGuide.glb", 0.72, 7.0)
    floorMaterial = CreateMaterial("Material_PreviewGround", (0.115, 0.095, 0.073), 0.92)
    backdropMaterial = CreateMaterial("Material_PreviewBackdrop", (0.032, 0.041, 0.043), 0.9)
    labelMaterial = CreateMaterial("Material_PreviewLabel", (0.74, 0.66, 0.50), 0.82)
    bpy.ops.mesh.primitive_plane_add(size=12.0, location=(0.0, 0.0, -0.005))
    floorObject = bpy.context.object
    AssignMaterial(floorObject, floorMaterial)
    AddBeveledBox(
        "Model_PreviewBackdrop",
        (0.0, 0.95, 1.30),
        (5.0, 0.12, 2.8),
        backdropMaterial,
        bevelWidth=0.04,
        bevelSegments=2,
    )
    AddPreviewText("ZHAO TONGCEN", (-0.72, -0.02, 1.965), labelMaterial, 0.083)
    AddPreviewText("COURIER", (-0.72, -0.02, 1.875), labelMaterial, 0.052)
    AddPreviewText("DU XIANGYUN", (0.72, -0.02, 1.965), labelMaterial, 0.083)
    AddPreviewText("STATION GUIDE", (0.72, -0.02, 1.875), labelMaterial, 0.052)
    bpy.ops.object.camera_add(location=(2.65, -6.35, 2.18))
    cameraObject = bpy.context.object
    cameraObject.name = "Camera_CharacterComparison"
    targetPoint = Vector((0.0, 0.0, 0.91))
    cameraDirection = targetPoint - cameraObject.location
    cameraObject.rotation_euler = cameraDirection.to_track_quat("-Z", "Y").to_euler()
    cameraObject.data.lens = 63.0
    bpy.context.scene.camera = cameraObject
    lightDefinitions = [
        ("Light_Key", (-3.3, -4.2, 4.6), 1050.0, 4.0, (1.0, 0.79, 0.58)),
        ("Light_Fill", (3.8, -2.6, 2.8), 720.0, 3.5, (0.48, 0.67, 0.82)),
        ("Light_Rim", (0.0, 2.5, 3.9), 1250.0, 3.0, (0.95, 0.45, 0.25)),
    ]
    for lightName, location, energy, size, color in lightDefinitions:
        lightData = bpy.data.lights.new(name=lightName, type="AREA")
        lightData.energy = energy
        lightData.shape = "DISK"
        lightData.size = size
        lightData.color = color
        lightObject = bpy.data.objects.new(lightName, lightData)
        bpy.context.collection.objects.link(lightObject)
        lightObject.location = location
        lightDirection = targetPoint - lightObject.location
        lightObject.rotation_euler = lightDirection.to_track_quat("-Z", "Y").to_euler()
    world = bpy.context.scene.world
    world.use_nodes = True
    backgroundNode = world.node_tree.nodes.get("Background")
    backgroundNode.inputs["Color"].default_value = (0.012, 0.016, 0.018, 1.0)
    backgroundNode.inputs["Strength"].default_value = 0.20
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = os.path.join(outputDirectory, "Texture_CharacterModelComparison.png")
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.camera.data.dof.use_dof = True
    scene.camera.data.dof.focus_distance = (scene.camera.location - targetPoint).length
    scene.camera.data.dof.aperture_fstop = 7.0
    bpy.ops.render.render(write_still=True)
    return scene.render.filepath


def ValidateImportedGlb(fileName):
    ResetScene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(outputDirectory, fileName))
    armatures = [objectValue for objectValue in bpy.context.scene.objects if objectValue.type == "ARMATURE"]
    meshes = [
        objectValue
        for objectValue in bpy.context.scene.objects
        if objectValue.type == "MESH"
        and (
            objectValue.parent in armatures
            or any(modifier.type == "ARMATURE" for modifier in objectValue.modifiers)
        )
    ]
    if len(armatures) != 1:
        raise RuntimeError(f"Expected one armature in {fileName}, found {len(armatures)}")
    armatureObject = armatures[0]
    stats = CollectModelStats(armatureObject, meshes)
    requiredBones = {
        "Root",
        "Hips",
        "Spine",
        "Chest",
        "Neck",
        "Head",
        "UpperArm_L",
        "Forearm_L",
        "Hand_L",
        "UpperArm_R",
        "Forearm_R",
        "Hand_R",
        "Thigh_L",
        "Shin_L",
        "Foot_L",
        "Thigh_R",
        "Shin_R",
        "Foot_R",
        "Prop_Rifle",
        "Prop_Satchel",
        "Prop_Sickle",
    }
    importedBoneNames = {bone.name for bone in armatureObject.data.bones}
    missingBones = sorted(requiredBones - importedBoneNames)
    if missingBones:
        raise RuntimeError(f"Missing bones in {fileName}: {missingBones}")
    stats["armatureCount"] = len(armatures)
    stats["meshCount"] = len(meshes)
    stats["missingRequiredBones"] = missingBones
    stats["manualBoneDrive"] = ValidateManualBoneDrive(armatureObject, meshes[0])
    return stats


def WriteStats(statsByCharacter, validationByFile, previewPath):
    outputData = {
        "schema": "AshenRouteCharacterModelsV1",
        "generator": "Blender 5.1 background factory-startup",
        "frontAxisAuthoring": "-Y",
        "upAxisAuthoring": "+Z",
        "exportFormat": "glTF Binary 2.0",
        "sharedRigSchema": "SharedCourierRigV1",
        "characters": statsByCharacter,
        "roundTripValidation": validationByFile,
        "preview": os.path.basename(previewPath),
    }
    statsPath = os.path.join(outputDirectory, "Data_CharacterModelStats.json")
    with open(statsPath, "w", encoding="utf-8") as outputFile:
        json.dump(outputData, outputFile, indent=2, ensure_ascii=False)
        outputFile.write("\n")
    return statsPath


def Main():
    zhaoStats = ExportCharacter("zhaoTongcen", "Model_TongcenCourier.glb")
    duStats = ExportCharacter("duXiangyun", "Model_XiangyunGuide.glb")
    zhaoValidation = ValidateImportedGlb("Model_TongcenCourier.glb")
    duValidation = ValidateImportedGlb("Model_XiangyunGuide.glb")
    previewPath = BuildAndRenderComparison()
    statsPath = WriteStats(
        {
            "zhaoTongcen": zhaoStats,
            "duXiangyun": duStats,
        },
        {
            "Model_TongcenCourier.glb": zhaoValidation,
            "Model_XiangyunGuide.glb": duValidation,
        },
        previewPath,
    )
    print("ASHEN_ROUTE_CHARACTER_BUILD_COMPLETE")
    print(json.dumps({"zhaoTongcen": zhaoStats, "duXiangyun": duStats}, ensure_ascii=False))
    print(f"Preview: {previewPath}")
    print(f"Stats: {statsPath}")


if __name__ == "__main__":
    Main()
