"""Atlas the uncoated V111 Type 94 game materials without changing its rigid mesh data."""
from argparse import ArgumentParser
from collections import Counter
from copy import deepcopy
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image


ASSET = Path(__file__).resolve().parents[1] / "Model" / "Type94Tankette"
PARENT = json.loads((ASSET / "Data_ReleaseV111.json").read_text(encoding="utf-8"))
SIZE = (4096, 3072)
TEXTURED = {
    "Material_Type94Steel": (0, 0, 2048, 2048),
    "Material_Type94Track": (2048, 0, 2048, 2048),
    "Material_Type94Rubber": (0, 2048, 1024, 1024),
}
SOLIDS = {
    "Material_Type94Dark": (1120, 2112, 64, 64),
    "Material_Type94White": (1312, 2112, 64, 64),
    "Material_Type94Red": (1504, 2112, 64, 64),
}
CHANNELS = {"Base": (60, 62, 56), "Normal": (128, 128, 255), "Orm": (255, 160, 0)}


def ReadGlb(file):
    data = file.read_bytes()
    magic, version, length = struct.unpack_from("<4s2I", data)
    jsonLength, jsonType = struct.unpack_from("<I4s", data, 12)
    start = 20 + jsonLength
    binLength, binType = struct.unpack_from("<I4s", data, start)
    assert (magic, version, length, jsonType, binType) == (b"glTF", 2, len(data), b"JSON", b"BIN\0")
    assert start + 8 + binLength == length
    return data, json.loads(data[20:start]), bytearray(data[start + 8:])


def ViewBytes(doc, binary, index):
    view = doc["bufferViews"][index]
    assert view["buffer"] == 0
    offset = view.get("byteOffset", 0)
    return binary[offset:offset + view["byteLength"]]


def TextureImage(doc, texture):
    slot = doc["textures"][texture]
    if "source" in slot:
        return slot["source"]
    return slot["extensions"]["EXT_texture_webp"]["source"]


def OpenTexture(doc, binary, texture):
    index = TextureImage(doc, texture)
    with Image.open(BytesIO(ViewBytes(doc, binary, doc["images"][index]["bufferView"]))) as source:
        return source.convert("RGB")


def ByteSrgb(value):
    encoded = (value * 12.92 if value <= 0.0031308 else 1.055 * value ** (1 / 2.4) - 0.055)
    return round(255 * encoded)


def BuildAtlases(doc, binary, materials):
    atlases = {channel: Image.new("RGB", SIZE, default) for channel, default in CHANNELS.items()}
    for name, area in TEXTURED.items():
        material = materials[name]
        pbr = material["pbrMetallicRoughness"]
        bindings = {
            "Base": pbr["baseColorTexture"],
            "Normal": material["normalTexture"],
            "Orm": pbr["metallicRoughnessTexture"],
        }
        assert material["occlusionTexture"] == bindings["Orm"]
        assert set(pbr) == {"baseColorTexture", "metallicRoughnessTexture"}
        assert set(material) == {"name", "pbrMetallicRoughness", "occlusionTexture", "normalTexture"}
        for channel, binding in bindings.items():
            assert set(binding) == {"index"}
            image = OpenTexture(doc, binary, binding["index"])
            assert image.size == area[2:]
            atlases[channel].paste(image, area[:2])

    for name, (x, y, w, h) in SOLIDS.items():
        material = materials[name]
        pbr = material["pbrMetallicRoughness"]
        assert set(material) == {"name", "pbrMetallicRoughness"}
        assert pbr["baseColorFactor"][3] == 1 and pbr["metallicFactor"] == 0
        pixels = {
            "Base": tuple(ByteSrgb(value) for value in pbr["baseColorFactor"][:3]),
            "Normal": (128, 128, 255),
            "Orm": (255, round(255 * pbr["roughnessFactor"]), 0),
        }
        for name, color in pixels.items():
            atlases[name].paste(color, (x, y, x + w, y + h))
    return atlases


def UvArray(doc, binary, index):
    accessor = doc["accessors"][index]
    view = doc["bufferViews"][accessor["bufferView"]]
    assert (accessor["componentType"], accessor["type"]) == (5126, "VEC2")
    assert "sparse" not in accessor and view["buffer"] == 0
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return np.ndarray((accessor["count"], 2), dtype="<f4", buffer=binary,
                      offset=offset, strides=(view.get("byteStride", 8), 4))


def RemapMeshes(doc, binary):
    oldMaterials = [material["name"] for material in doc["materials"]]
    roles = {}
    counts = Counter()
    for mesh in doc["meshes"]:
        for primitive in mesh["primitives"]:
            role = oldMaterials[primitive["material"]]
            uv = primitive["attributes"]["TEXCOORD_0"]
            assert roles.setdefault(uv, role) == role
            assert {"NORMAL", "TANGENT"} <= primitive["attributes"].keys()
            counts[role] += 1
            primitive["material"] = 0 if role == "Material_Type94Paint" else 1

    perRole = {}
    for index, role in roles.items():
        if role == "Material_Type94Paint":
            continue
        access = doc["accessors"][index]
        uv = UvArray(doc, binary, index)
        x, y, width, height = (TEXTURED | SOLIDS)[role]
        if role in TEXTURED:
            lo = np.min(uv, axis=0) * (width, height)
            hi = (1 - np.max(uv, axis=0)) * (width, height)
            padding = round(float(np.min([lo, hi])), 3)
            assert padding >= 7.99, (role, padding)
            perRole[role] = min(perRole.get(role, padding), padding)
            uv[:] = (uv * (width, height) + (x, y)) / SIZE
        else:
            margin = 20
            uv[:] = (uv * (width - 2 * margin, height - 2 * margin) +
                     (x + margin, y + margin)) / SIZE
        if "min" in access:
            access["min"] = uv.min(axis=0).tolist()
        if "max" in access:
            access["max"] = uv.max(axis=0).tolist()
    return counts, perRole


def EncodeLossless(image):
    stream = BytesIO()
    image.save(stream, format="WEBP", lossless=True, quality=95, method=6)
    data = stream.getvalue()
    with Image.open(BytesIO(data)) as check:
        assert check.size == image.size and check.convert("RGB").tobytes() == image.tobytes()
    return data


def Bundle(doc, binary, paint, atlases):
    oldImages = doc["images"]
    oldTextures = doc["textures"]
    oldImageViews = {image["bufferView"] for image in oldImages}
    oldViews = doc["bufferViews"]
    newViews = []
    newBin = bytearray()

    def Append(data, attributes):
        info = dict(attributes, buffer=0, byteOffset=len(newBin), byteLength=len(data))
        index = len(newViews)
        newViews.append(info)
        newBin.extend(data)
        newBin.extend(b"\0" * (-len(data) % 4))
        return index

    remap = {}
    for i, view in enumerate(oldViews):
        if i not in oldImageViews:
            remap[i] = Append(ViewBytes(doc, binary, i), view)
    for accessor in doc["accessors"]:
        accessor["bufferView"] = remap[accessor["bufferView"]]

    images = []
    textures = []
    imageRemap = {}
    texRemap = {}
    paintBindings = [paint["normalTexture"], paint["occlusionTexture"],
                     paint["pbrMetallicRoughness"]["baseColorTexture"],
                     paint["pbrMetallicRoughness"]["metallicRoughnessTexture"],
                     paint["extensions"]["KHR_materials_clearcoat"]["clearcoatNormalTexture"]]
    for binding in paintBindings:
        index = binding["index"]
        if index not in texRemap:
            original = oldTextures[index]
            oldImage = TextureImage(doc, index)
            if oldImage not in imageRemap:
                item = deepcopy(oldImages[oldImage])
                item["bufferView"] = Append(ViewBytes(doc, binary, item["bufferView"]), {})
                imageRemap[oldImage] = len(images)
                images.append(item)
            mappedImage = imageRemap[oldImage]
            newTexture = deepcopy(original)
            if "source" in newTexture:
                newTexture["source"] = mappedImage
            else:
                newTexture["extensions"]["EXT_texture_webp"]["source"] = mappedImage
            texRemap[index] = len(textures)
            textures.append(newTexture)
        binding["index"] = texRemap[index]

    details = {}
    assert len(doc["samplers"]) == 1
    for channel, image in atlases.items():
        view = Append(EncodeLossless(image), {})
        images.append({"name": f"Texture_Type94Details{channel}V112", "mimeType": "image/webp", "bufferView": view})
        details[channel] = {"index": len(textures)}
        textures.append({"sampler": 0, "extensions": {"EXT_texture_webp": {"source": len(images) - 1}}})

    doc["materials"] = [paint, {
        "name": "Material_Type94Details",
        "pbrMetallicRoughness": {
            "baseColorTexture": details["Base"], "metallicRoughnessTexture": details["Orm"],
        },
        "normalTexture": details["Normal"],
        "occlusionTexture": details["Orm"],
    }]
    doc["images"] = images
    doc["textures"] = textures
    doc["bufferViews"] = newViews
    doc["buffers"][0]["byteLength"] = len(newBin)
    for key in ("extensionsUsed", "extensionsRequired"):
        doc[key] = sorted(set(doc.get(key, [])) | {"EXT_texture_webp"})

    encoded = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    encoded += b" " * (-len(encoded) % 4)
    header = struct.pack("<4s2II4s", b"glTF", 2, 28 + len(encoded) + len(newBin), len(encoded), b"JSON")
    return header + encoded + struct.pack("<I4s", len(newBin), b"BIN\0") + newBin


def Main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Hash-locked V111 canonical or original authored GLB")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--textures", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve():
        parser.error("Write the candidate to a different file from its V111 source")

    data, doc, binary = ReadGlb(args.input)
    digest = sha256(data).hexdigest()
    assert digest in (PARENT["sourceSha256"], PARENT["output"]["sha256"]), "Use the checked V111 artifact"
    materials = {material["name"]: material for material in doc["materials"]}
    assert set(materials) == TEXTURED.keys() | SOLIDS.keys() | {"Material_Type94Paint"}
    atlas = BuildAtlases(doc, binary, materials)
    counts, padding = RemapMeshes(doc, binary)
    paint = deepcopy(materials["Material_Type94Paint"])
    output = Bundle(doc, binary, paint, atlas)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(output)

    args.textures.mkdir(parents=True, exist_ok=True)
    for channel, image in atlas.items():
        image.save(args.textures / f"Texture_Type94Details{channel}V112.png")
    report = {
        "schema": "Type94MaterialAtlasV112",
        "source": {"file": str(args.input.resolve()), "sha256": digest, "bytes": len(data)},
        "output": {"file": str(args.output.resolve()), "sha256": sha256(output).hexdigest(), "bytes": len(output)},
        "materials": {"before": list(materials), "after": [material["name"] for material in doc["materials"]]},
        "atlas": {"size": SIZE, "texturedTiles": TEXTURED, "solidTiles": SOLIDS, "minSourceUvPaddingPx": padding},
        "primitiveCountsBySourceMaterial": counts,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["output"]))
    print("Materials", len(materials), "->", len(doc["materials"]), "| images", len(doc["images"]))


if __name__ == "__main__":
    Main()
