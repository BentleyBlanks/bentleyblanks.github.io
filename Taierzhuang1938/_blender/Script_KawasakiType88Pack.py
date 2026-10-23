"""Repack Type 88 GLB images as pixel-exact lossless WebP.

Geometry/accessor/UV/normal bytes and the movable node hierarchy are preserved.
The Blender source exporter must use AUTO (PNG), never a lossy intermediate.
"""
from pathlib import Path
import argparse
import copy
import hashlib
import io
import json
import struct
from PIL import Image


def Sha(data):
    return hashlib.sha256(data).hexdigest()


def Load(path):
    data = Path(path).read_bytes()
    magic, version, length = struct.unpack_from("<III", data)
    assert (magic, version, length) == (0x46546C67, 2, len(data))
    jsonSize, jsonType = struct.unpack_from("<II", data, 12)
    assert jsonType == 0x4E4F534A
    document = json.loads(data[20:20 + jsonSize])
    offset = 20 + jsonSize
    binSize, binType = struct.unpack_from("<II", data, offset)
    assert binType == 0x004E4942
    return data, document, data[offset + 8:offset + 8 + binSize]


def Pack(inputPath, outputPath=None, reportPath=None):
    inputPath = Path(inputPath)
    outputPath = Path(outputPath or inputPath)
    original, source, binary = Load(inputPath)
    document = copy.deepcopy(source)
    replacements, records = {}, []
    for index, item in enumerate(source.get("images", [])):
        assert "bufferView" in item, "Expected self-contained GLB images"
        view = source["bufferViews"][item["bufferView"]]
        start, length = view.get("byteOffset", 0), view["byteLength"]
        encoded = binary[start:start + length]
        image = Image.open(io.BytesIO(encoded))
        mode = "RGBA" if "A" in image.getbands() else "RGB"
        image = image.convert(mode)
        sourcePixels = image.tobytes()
        stream = io.BytesIO()
        image.save(stream, format="WEBP", lossless=True, method=6, exact=True)
        webp = stream.getvalue()
        reopened = Image.open(io.BytesIO(webp)).convert(mode)
        assert reopened.size == image.size and reopened.tobytes() == sourcePixels, "WebP changed pixels"
        replacements[item["bufferView"]] = webp
        document["images"][index]["mimeType"] = "image/webp"
        records.append({"index": index, "name": item.get("name"), "size": image.size, "mode": mode,
                        "sourceMime": item.get("mimeType"), "sourcePixelsSha256": Sha(sourcePixels),
                        "decodedPixelsSha256": Sha(reopened.tobytes()), "sourceBytes": len(encoded), "webpBytes": len(webp),
                        "pixelExact": True})
    chunks, offset, keptHashes = [], 0, []
    for index, view in enumerate(source["bufferViews"]):
        padding = (-offset) % 4
        if padding:
            chunks.append(b"\0" * padding)
            offset += padding
        start, length = view.get("byteOffset", 0), view["byteLength"]
        payload = replacements.get(index, binary[start:start + length])
        if index not in replacements:
            keptHashes.append({"bufferView": index, "sha256": Sha(payload), "bytes": len(payload)})
        document["bufferViews"][index]["byteOffset"] = offset
        document["bufferViews"][index]["byteLength"] = len(payload)
        chunks.append(payload)
        offset += len(payload)
    packedBinary = b"".join(chunks)
    document["buffers"][0]["byteLength"] = len(packedBinary)
    for texture in document.get("textures", []):
        if "source" in texture:
            imageIndex = texture.pop("source")
            texture.setdefault("extensions", {})["EXT_texture_webp"] = {"source": imageIndex}
    for key in ("extensionsUsed", "extensionsRequired"):
        document[key] = list(dict.fromkeys([*document.get(key, []), "EXT_texture_webp"]))
    jsonBytes = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    jsonBytes += b" " * ((-len(jsonBytes)) % 4)
    packedBinary += b"\0" * ((-len(packedBinary)) % 4)
    total = 12 + 8 + len(jsonBytes) + 8 + len(packedBinary)
    result = struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(jsonBytes), 0x4E4F534A) + jsonBytes + struct.pack("<II", len(packedBinary), 0x004E4942) + packedBinary
    # Validate the new container before replacing a build output.
    temp = outputPath.with_suffix(".packed-tmp.glb")
    temp.write_bytes(result)
    _, check, checkBinary = Load(temp)
    assert check["nodes"] == source["nodes"]
    assert check["meshes"] == source["meshes"]
    assert check["accessors"] == source["accessors"]
    for record in keptHashes:
        view = check["bufferViews"][record["bufferView"]]
        assert Sha(checkBinary[view["byteOffset"]:view["byteOffset"] + view["byteLength"]]) == record["sha256"]
    temp.replace(outputPath)
    report = {"version": "20261023LosslessWebp01", "output": outputPath.name, "inputSha256": Sha(original),
              "outputSha256": Sha(result), "inputBytes": len(original), "outputBytes": len(result),
              "nodesPreserved": True, "meshesPreserved": True, "accessorsPreserved": True,
              "nonImageBufferViewsPreserved": len(keptHashes), "imageCount": len(records), "images": records}
    reportPath = Path(reportPath or outputPath.with_name("Data_" + outputPath.stem.removeprefix("Model_") + "Packing.json"))
    reportPath.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("output", "outputBytes", "imageCount", "nodesPreserved", "accessorsPreserved")}))
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    Pack(args.input, args.output, args.report)
