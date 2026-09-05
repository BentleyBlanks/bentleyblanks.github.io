"""Repair missing NRA eye maps and relax the uniform shoulder silhouette in Blender.

Run in a separate factory-startup Blender (or launch it with BlenderMCP).
--source-dir must contain the original five GLBs; --output-dir is Model/Character.
The Blender edits and the GLB attribute patch use the same metre-space deformation.
Patch the original buffers to preserve every skin, socket and animation sample.
"""
import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

REVISION = "20260906NraEyesShoulders"
UNIFORM = "Material #1721585337"
EYE_MATERIALS = {2: "Material #1721585531 Slot #7", 4: "Material #57"}
SHOULDER_DROP = 0.040


def ReadGlb(path):
    raw = path.read_bytes()
    size = struct.unpack_from("<I", raw, 12)[0]
    return json.loads(raw[20:20+size]), bytearray(raw[28+size:]), raw


def WriteGlb(path, document, binary):
    while len(binary) % 4:
        binary.append(0)
    document["buffers"][0]["byteLength"] = len(binary)
    text = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf8")
    text += b" " * (-len(text) % 4)
    path.write_bytes(struct.pack("<III", 0x46546C67, 2, 28+len(text)+len(binary))
                    + struct.pack("<II", len(text), 0x4E4F534A) + text
                    + struct.pack("<II", len(binary), 0x004E4942) + binary)


def Accessor(document, binary, index):
    spec = document["accessors"][index]
    assert spec["componentType"] == 5126 and "sparse" not in spec
    view = document["bufferViews"][spec["bufferView"]]
    width = {"VEC2": 2, "VEC3": 3, "VEC4": 4}[spec["type"]]
    start = view.get("byteOffset", 0) + spec.get("byteOffset", 0)
    stride = view.get("byteStride", width*4)
    return spec, width, [start+i*stride for i in range(spec["count"])]


def Smooth(value):
    value = max(0.0, min(1.0, value))
    return value*value*(3-2*value)


def Drop(point):
    x, height, depth = point
    return (SHOULDER_DROP * Smooth((abs(x)-0.10)/0.09)
            * (1-Smooth((abs(x)-0.25)/0.15)) * Smooth((height-1.30)/0.14))


def PositionKey(point):
    return tuple(round(value, 5) for value in point)


def CorrectPoint(point, down):
    return Vector(point) + down*Drop(point)


def NormalTransform(point, down):
    epsilon = 0.00001
    gradient = Vector((0, 0, 0))
    for axis in (0, 1):
        left, right = Vector(point), Vector(point)
        left[axis] -= epsilon
        right[axis] += epsilon
        gradient[axis] = (Drop(right)-Drop(left))/(2*epsilon)
    return Matrix([[float(row == col)+down[row]*gradient[col]
                    for col in range(3)] for row in range(3)])


def SkinDownVectors(document, binary, attributes, matrices):
    values = []
    for name in ("JOINTS_0", "WEIGHTS_0"):
        spec = document["accessors"][attributes[name]]
        view = document["bufferViews"][spec["bufferView"]]
        fmt, size = {5121: ("B", 1), 5123: ("H", 2), 5126: ("f", 4)}[spec["componentType"]]
        start = view.get("byteOffset", 0)+spec.get("byteOffset", 0)
        stride = view.get("byteStride", size*4)
        rows = [struct.unpack_from("<"+fmt*4, binary, start+i*stride) for i in range(spec["count"])]
        if name == "WEIGHTS_0" and spec.get("normalized"):
            limit = {5121: 255, 5123: 65535}[spec["componentType"]]
            rows = [tuple(value/limit for value in row) for row in rows]
        values.append(rows)
    downVectors = []
    for joints, weights in zip(*values):
        skin = Matrix([[sum(matrices[joint][row][col]*weight for joint,weight in zip(joints,weights))
                        for col in range(3)] for row in range(3)])
        downVectors.append(skin.inverted() @ Vector((0, -1, 0)))
    return downVectors


def EyeUv(uv):
    # Existing VITOH eye atlas: measured pupil centre (913.5, 945) / 1024.
    # Source eye discs use centred 0..1 planar UVs. glTF V is top-down.
    return (0.89208996+(uv[0]-0.5)*0.18, 0.92285204+(uv[1]-0.5)*0.18)


def EyeImage(sourceDir):
    document, binary, _ = ReadGlb(sourceDir / "Model_LugouNra01.glb")
    source = next(image for image in document["images"] if image["name"] == "VITOH_d.mipmap")
    view = document["bufferViews"][source["bufferView"]]
    start = view.get("byteOffset", 0)
    return bytes(binary[start:start+view["byteLength"]])


def PatchGlb(source, output, variant, eyeBytes):
    document, binary, original = ReadGlb(source)
    assert not document["asset"].get("extras", {}).get("nraAppearanceRepair"), "use pristine source GLBs"
    changedPositions, changedUvs = 0, 0
    originalPositions = []
    editsByPosition = {}
    reference = json.loads((Path(__file__).parent/"Data_NraRelaxedShoulderReference.json").read_text())[f"LugouNra0{variant}"]
    assert hashlib.sha256(original).hexdigest() == reference["sourceSha256"], "shoulder reference requires the recorded source GLB"
    eyeName = EYE_MATERIALS.get(variant)
    skinnedMeshes = {node["mesh"] for node in document["nodes"] if "mesh" in node and "skin" in node}
    for meshIndex, mesh in enumerate(document["meshes"]):
        if meshIndex not in skinnedMeshes:
            continue
        for primitive in mesh["primitives"]:
            material = document["materials"][primitive["material"]]
            attrs = primitive["attributes"]
            if material["name"] == UNIFORM:
                spec, width, offsets = Accessor(document, binary, attrs["POSITION"])
                points = [struct.unpack_from("<3f", binary, offset) for offset in offsets]
                originalPositions.extend(points)
                downVectors = SkinDownVectors(document, binary, attrs, reference["matrices"])
                for name in ("NORMAL", "TANGENT"):
                    if name not in attrs:
                        continue
                    _, width, directionOffsets = Accessor(document, binary, attrs[name])
                    for point, down, offset in zip(points, downVectors, directionOffsets):
                        if Drop(point) <= 0:
                            continue
                        direction = struct.unpack_from("<"+"f"*width, binary, offset)
                        transform = NormalTransform(point, down)
                        if name == "NORMAL":
                            transform = transform.inverted().transposed()
                        fixed = (transform @ Vector(direction[:3])).normalized()
                        struct.pack_into("<3f", binary, offset, *fixed)
                for point, down, offset in zip(points, downVectors, offsets):
                    editsByPosition[PositionKey(point)] = (CorrectPoint(point, down), down)
                    if Drop(point) > 0:
                        changedPositions += 1
                        struct.pack_into("<3f", binary, offset, *CorrectPoint(point, down))
                corrected = [struct.unpack_from("<3f", binary, offset) for offset in offsets]
                for key, fn in (("min", min), ("max", max)):
                    spec[key] = [fn(point[axis] for point in corrected) for axis in range(3)]
            elif eyeName and material["name"] == eyeName:
                _, _, offsets = Accessor(document, binary, attrs["TEXCOORD_0"])
                for offset in offsets:
                    struct.pack_into("<2f", binary, offset, *EyeUv(struct.unpack_from("<2f", binary, offset)))
                    changedUvs += 1
                while len(binary) % 4:
                    binary.append(0)
                viewIndex = len(document["bufferViews"])
                document["bufferViews"].append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(eyeBytes)})
                binary.extend(eyeBytes)
                imageIndex = len(document["images"])
                document["images"].append({"bufferView": viewIndex, "mimeType": "image/webp", "name": "Texture_NraEyeAtlas"})
                textureIndex = len(document["textures"])
                document["textures"].append({"sampler": 0, "extensions": {"EXT_texture_webp": {"source": imageIndex}}})
                material.clear()
                material.update({"name": "Material_NraEyes", "doubleSided": True,
                    "pbrMetallicRoughness": {"baseColorTexture": {"index": textureIndex},
                    "metallicFactor": 0, "roughnessFactor": 0.60}})
    assert changedPositions > 100
    assert bool(changedUvs) == bool(eyeName)
    document["asset"].setdefault("extras", {})["nraAppearanceRepair"] = REVISION
    WriteGlb(output, document, binary)
    return {"sourceSha256": hashlib.sha256(original).hexdigest(),
            "shoulderVertices": changedPositions, "eyeVertices": changedUvs,
            "maxShoulderDropMeters": SHOULDER_DROP}, originalPositions, editsByPosition


def EditBlenderScene(variant, originalPositions, editsByPosition):
    from mathutils.kdtree import KDTree
    editKeys, editValues = list(editsByPosition), list(editsByPosition.values())
    editTree = KDTree(len(editKeys))
    for index, point in enumerate(editKeys):
        editTree.insert(Vector(point), index)
    editTree.balance()

    def FindEdit(point):
        _, index, distance = editTree.find(point)
        assert distance < .00002, (variant, list(point), distance)
        return editValues[index]

    scene = bpy.context.scene
    scene.name = f"Scene_Nra0{variant}EyesShoulders"
    rigs = [obj for obj in scene.objects if obj.type == "ARMATURE"]
    for rig in rigs:
        rig.data.pose_position = "REST"
    bpy.context.view_layer.update()
    uniformWorld = []
    for obj in list(scene.objects):
        if obj.type != "MESH" or not obj.data.materials or not any(mod.type == "ARMATURE" for mod in obj.modifiers):
            continue
        # The importer can append .001 to shared datablocks in multi-scene files.
        uniformSlots = [i for i,m in enumerate(obj.data.materials) if m.name.split(".")[0] == UNIFORM]
        vertexIds = {v for poly in obj.data.polygons if poly.material_index in uniformSlots for v in poly.vertices}
        inverse = obj.matrix_world.inverted()
        normals = [entry.vector.copy() for entry in obj.data.corner_normals]
        for poly in obj.data.polygons:
            if poly.material_index not in uniformSlots:
                continue
            for loop in poly.loop_indices:
                point = obj.matrix_world @ obj.data.vertices[obj.data.loops[loop].vertex_index].co
                gltfPoint = Vector((point.x, point.z, -point.y))
                fixed, down = FindEdit(gltfPoint)
                normal = inverse.transposed().to_3x3() @ normals[loop]
                normal = Vector((normal.x, normal.z, -normal.y))
                normal = NormalTransform(gltfPoint, down).inverted().transposed() @ normal
                normals[loop] = (obj.matrix_world.transposed().to_3x3() @ Vector((normal.x, -normal.z, normal.y))).normalized()
        for index in vertexIds:
            vertex = obj.data.vertices[index]
            point = obj.matrix_world @ vertex.co
            gltfPoint = Vector((point.x, point.z, -point.y))
            uniformWorld.append(gltfPoint)
            fixed, down = FindEdit(gltfPoint)
            vertex.co = inverse @ Vector((fixed.x, -fixed.z, fixed.y))
        eyeSlots = [i for i,m in enumerate(obj.data.materials) if m.name.split(".")[0] == EYE_MATERIALS.get(variant)]
        if eyeSlots:
            material = bpy.data.materials.new(f"Material_Nra0{variant}Eyes")
            material.use_nodes = True
            principled = material.node_tree.nodes.get("Principled BSDF")
            principled.inputs["Roughness"].default_value = .60
            texture = material.node_tree.nodes.new("ShaderNodeTexImage")
            texture.image = next(image for image in bpy.data.images if image.name.startswith("VITOH_d.mipmap"))
            material.node_tree.links.new(texture.outputs["Color"], principled.inputs["Base Color"])
            for slot in eyeSlots:
                obj.data.materials[slot] = material
            uv = obj.data.uv_layers.active.data
            for poly in obj.data.polygons:
                if poly.material_index not in eyeSlots:
                    continue
                for loop in poly.loop_indices:
                    u, v = uv[loop].uv
                    u, v = EyeUv((u, 1-v))
                    uv[loop].uv = (u, 1-v)
        obj.data.update()
        obj.data.normals_split_custom_set(normals)
    # Imported vertices are transformed by Blender into armature object space.
    # Verify the metre-space edit is exactly the same as the shipped GLB patch.
    from mathutils.kdtree import KDTree
    tree = KDTree(len(uniformWorld))
    for index, point in enumerate(uniformWorld):
        tree.insert(point, index)
    tree.balance()
    worst = max((tree.find(Vector(point))[2], list(point), list(tree.find(Vector(point))[0])) for point in originalPositions)
    assert worst[0] < 0.00002, (variant, worst)
    scene["AppearanceRepair"] = REVISION
    scene["ShoulderDropMeters"] = SHOULDER_DROP


def Main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--blend-file", required=True, type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:])
    args.output_dir.mkdir(parents=True, exist_ok=True)
    args.blend_file.parent.mkdir(parents=True, exist_ok=True)
    eyeBytes = EyeImage(args.source_dir)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    report = {}
    for variant in range(1, 6):
        name = f"Model_LugouNra0{variant}.glb"
        source, output = args.source_dir/name, args.output_dir/name
        if variant > 1:
            bpy.context.window.scene = bpy.data.scenes.new(f"Scene_Nra0{variant}")
        bpy.ops.import_scene.gltf(filepath=str(source))
        audit, positions, edits = PatchGlb(source, output, variant, eyeBytes)
        EditBlenderScene(variant, positions, edits)
        report[f"LugouNra0{variant}"] = audit
    bpy.context.window.scene = bpy.data.scenes["Scene_Nra04EyesShoulders"]
    bpy.ops.wm.save_as_mainfile(filepath=str(args.blend_file))
    manifestPath = args.output_dir/"Data_LugouCharacterManifest.json"
    if manifestPath.exists():
        manifest = json.loads(manifestPath.read_text(encoding="utf8"))
        for record in manifest["models"]:
            if record["id"] in report:
                record["bytes"] = (args.output_dir/f'Model_{record["id"]}.glb').stat().st_size
                record["appearanceRepair"] = {"revision": REVISION, **report[record["id"]]}
        manifestPath.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+"\n", encoding="utf8")
    (args.blend_file.parent/"Data_NraAppearanceRepair.json").write_text(
        json.dumps(report, indent=2), encoding="utf8")
    print(json.dumps(report))


if __name__ == "__main__":
    Main()
