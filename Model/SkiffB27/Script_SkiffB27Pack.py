"""Preserve the skiff's authored GLB records while editing positions or images.

Accessor() exposes raw component values, including normalized integer attributes.
It never triangulates, welds, sorts, normalizes, or recomputes tangent frames.
Serialize() copies each retained buffer view verbatim and only rewrites offsets,
declared bounds, and explicitly replaced images. It does not change accessor IDs.

EncodeTemplate()/DecodeTemplate() store the original GLB as an integrity-checked
zlib/base64 JSON string suitable for a Blender Text datablock, without importing
bpy. The caller owns all file and Blender Text writes.
"""

import base64
import copy
import hashlib
import json
import struct
import zlib
from pathlib import Path

import numpy as np


ComponentTypes = {
    5120: np.dtype("i1"),
    5121: np.dtype("u1"),
    5122: np.dtype("<i2"),
    5123: np.dtype("<u2"),
    5125: np.dtype("<u4"),
    5126: np.dtype("<f4"),
}
ComponentCounts = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
TemplateFormat = "SkiffB27GLBTemplate"


def Require(condition, message):
    if not condition:
        raise ValueError(message)


def Hash(data):
    return hashlib.sha256(data).hexdigest()


def EncodeTemplate(raw):
    """Return a JSON string for Text.write(); verify raw is a supported GLB."""
    raw = bytes(raw)
    GLB(raw)
    return json.dumps({
        "format": TemplateFormat,
        "version": 1,
        "compression": "zlib",
        "bytes": len(raw),
        "sha256": Hash(raw),
        "base64": base64.b64encode(zlib.compress(raw, 9)).decode("ascii"),
    }, separators=(",", ":"))


def DecodeTemplate(encodedText):
    """Read Text.as_string() output and verify length, SHA, and GLB framing."""
    record = json.loads(''.join(encodedText.splitlines()))
    Require(record.get("format") == TemplateFormat, "Unknown template format")
    Require(record.get("version") == 1, "Unknown template version")
    Require(record.get("compression") == "zlib", "Unknown template compression")
    expectedBytes = record.get("bytes")
    Require(type(expectedBytes) is int and expectedBytes >= 28,
            "Invalid template byte count")
    compressed = base64.b64decode(record["base64"], validate=True)
    decoder = zlib.decompressobj()
    raw = decoder.decompress(compressed, expectedBytes + 1)
    Require(len(raw) == expectedBytes and decoder.eof,
            "Template decompression length mismatch")
    Require(not decoder.unused_data and not decoder.unconsumed_tail,
            "Unexpected trailing template data")
    Require(Hash(raw) == record["sha256"], "Template SHA256 mismatch")
    GLB(raw)
    return raw


def ViewReferences(document):
    """Find bufferView references, including references inside extensions."""
    references = set()

    def Visit(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key == "bufferView":
                    Require(type(child) is int, "Invalid bufferView reference")
                    references.add(child)
                elif key != "extras":
                    Visit(child)
        elif isinstance(value, list):
            for child in value:
                Visit(child)

    Visit(document)
    return references


def RemapViews(document, mapping):
    def Visit(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key == "bufferView":
                    value[key] = mapping[child]
                elif key != "extras":
                    Visit(child)
        elif isinstance(value, list):
            for child in value:
                Visit(child)

    Visit(document)


class GLB:
    """One JSON + one embedded BIN GLB, with writable NumPy attribute views.

    Public j holds the parsed JSON and payload holds a mutable BIN bytearray.
    Accessor views stay valid across ReplaceImage() and Serialize(): neither
    method resizes payload. Serialize() returns bytes and leaves this instance
    available for additional edits or repeated deterministic serialization.
    """

    def __init__(self, raw):
        raw = bytes(raw)
        Require(len(raw) >= 28, "Truncated GLB")
        Require(struct.unpack_from("<III", raw) == (0x46546C67, 2, len(raw)),
                "Invalid GLB header")
        jsonLength, jsonType = struct.unpack_from("<II", raw, 12)
        Require(jsonType == 0x4E4F534A and jsonLength % 4 == 0,
                "Invalid GLB JSON chunk")
        binHeader = 20 + jsonLength
        Require(binHeader + 8 <= len(raw), "Missing GLB BIN chunk")
        binLength, binType = struct.unpack_from("<II", raw, binHeader)
        Require(binType == 0x004E4942 and binLength % 4 == 0,
                "Invalid GLB BIN chunk")
        Require(binHeader + 8 + binLength == len(raw),
                "Extra or truncated GLB chunks are unsupported")
        self.j = json.loads(raw[20:binHeader])
        buffers = self.j.get("buffers", [])
        Require(len(buffers) == 1 and "uri" not in buffers[0],
                "Require one embedded buffer")
        declaredLength = buffers[0].get("byteLength")
        Require(type(declaredLength) is int and 0 <= declaredLength <= binLength
                and binLength - declaredLength <= 3,
                "Invalid embedded buffer length")
        self.payload = bytearray(raw[binHeader + 8:binHeader + 8 + declaredLength])
        self.imageReplacements = {}
        for index in range(len(self.j.get("bufferViews", []))):
            self.ViewBytes(index)
        for index in ViewReferences(self.j):
            Require(0 <= index < len(self.j.get("bufferViews", [])),
                    "bufferView reference outside document")

    @classmethod
    def Read(cls, path):
        return cls(Path(path).read_bytes())

    def ViewBytes(self, index):
        """Return a copy of a complete view, preserving interleaved padding."""
        view = self.j["bufferViews"][index]
        Require(view.get("buffer", 0) == 0, "External buffer view unsupported")
        start = view.get("byteOffset", 0)
        length = view["byteLength"]
        Require(type(start) is int and type(length) is int
                and start >= 0 and length >= 0
                and start + length <= len(self.payload),
                "Buffer view outside BIN payload")
        return bytes(self.payload[start:start + length])

    def Accessor(self, index, writable=False):
        """Return (count, components), preserving raw dtype and byte stride.

        A SCALAR accessor has shape (count, 1). Sparse and matrix accessors are
        deliberately rejected because the skiff has only plain scalar/vectors.
        """
        accessor = self.j["accessors"][index]
        Require("sparse" not in accessor and "bufferView" in accessor,
                "Sparse or implicit-zero accessors are unsupported")
        Require(accessor["componentType"] in ComponentTypes
                and accessor["type"] in ComponentCounts,
                "Unsupported accessor component or shape")
        dtype = ComponentTypes[accessor["componentType"]]
        components = ComponentCounts[accessor["type"]]
        count = accessor["count"]
        view = self.j["bufferViews"][accessor["bufferView"]]
        Require(view.get("buffer", 0) == 0, "External accessor buffer unsupported")
        relativeOffset = accessor.get("byteOffset", 0)
        stride = view.get("byteStride", dtype.itemsize * components)
        Require(type(count) is int and count > 0
                and type(relativeOffset) is int and relativeOffset >= 0
                and type(stride) is int and stride >= dtype.itemsize * components
                and relativeOffset % dtype.itemsize == 0
                and stride % dtype.itemsize == 0,
                "Invalid accessor layout")
        Require(relativeOffset + (count - 1) * stride + dtype.itemsize * components
                <= view["byteLength"], "Accessor outside buffer view")
        offset = view.get("byteOffset", 0) + relativeOffset
        Require(offset % dtype.itemsize == 0, "Unaligned accessor")
        array = np.ndarray((count, components), dtype=dtype, buffer=self.payload,
                           offset=offset, strides=(stride, dtype.itemsize))
        array.setflags(write=bool(writable))
        return array

    def Primitives(self):
        for meshIndex, mesh in enumerate(self.j.get("meshes", [])):
            for primitiveIndex, primitive in enumerate(mesh["primitives"]):
                yield meshIndex, primitiveIndex, mesh, primitive

    def ImageBytes(self, index):
        if index in self.imageReplacements:
            return self.imageReplacements[index]
        image = self.j["images"][index]
        Require("bufferView" in image and "uri" not in image,
                "Require embedded image")
        return self.ViewBytes(image["bufferView"])

    def ReplaceImage(self, index, data, mimeType=None, name=None):
        """Replace encoded image bytes without decoding or changing bindings.

        B27 uses WebP throughout; retain that format. Changing image format also
        requires the caller to migrate any texture extension/fallback bindings.
        """
        image = self.j["images"][index]
        Require("bufferView" in image and "uri" not in image,
                "Require embedded image")
        data = bytes(data)
        Require(bool(data), "Empty replacement image")
        if mimeType is not None:
            Require(mimeType in {"image/png", "image/jpeg", "image/webp"},
                    "Unsupported replacement image type")
            image["mimeType"] = mimeType
        if name is not None:
            image["name"] = name
        self.imageReplacements[index] = data

    def Serialize(self, updateBounds=True):
        """Return a compact GLB; only unreferenced buffer views are removed.

        All accessors and record counts remain unchanged. Existing min/max are
        refreshed, and POSITION bounds are always written when enabled.
        """
        document = copy.deepcopy(self.j)
        if updateBounds:
            positionAccessors = {primitive["attributes"]["POSITION"]
                                 for _, _, _, primitive in self.Primitives()
                                 if "POSITION" in primitive["attributes"]}
            for index, accessor in enumerate(document.get("accessors", [])):
                if index not in positionAccessors and not {"min", "max"}.intersection(accessor):
                    continue
                values = self.Accessor(index)
                Require(np.isfinite(values).all(), "Non-finite accessor bounds")
                for key, operation in (("min", np.min), ("max", np.max)):
                    if key in accessor or index in positionAccessors:
                        accessor[key] = operation(values, axis=0).tolist()

        replacementViews = {}
        for imageIndex, data in sorted(self.imageReplacements.items()):
            image = document["images"][imageIndex]
            oldView = document["bufferViews"][image["bufferView"]]
            view = {key: copy.deepcopy(value) for key, value in oldView.items()
                    if key in {"name", "extras"}}
            view.update(buffer=0, byteOffset=0, byteLength=len(data))
            newIndex = len(document["bufferViews"])
            document["bufferViews"].append(view)
            image["bufferView"] = newIndex
            replacementViews[newIndex] = data

        for texture in document.get("textures", []):
            webp = texture.get("extensions", {}).get("EXT_texture_webp")
            if webp:
                Require(document["images"][webp["source"]].get("mimeType") == "image/webp",
                        "EXT_texture_webp must reference a WebP image")

        usedViews = sorted(ViewReferences(document))
        mapping = {}
        views = []
        payload = bytearray()
        for oldIndex in usedViews:
            Require(0 <= oldIndex < len(document["bufferViews"]),
                    "bufferView reference outside document")
            view = copy.deepcopy(document["bufferViews"][oldIndex])
            data = (replacementViews[oldIndex] if oldIndex in replacementViews
                    else self.ViewBytes(oldIndex))
            payload.extend(b"\0" * (-len(payload) % 4))
            view.update(buffer=0, byteOffset=len(payload), byteLength=len(data))
            payload.extend(data)
            mapping[oldIndex] = len(views)
            views.append(view)
        RemapViews(document, mapping)
        document["bufferViews"] = views
        document["buffers"][0]["byteLength"] = len(payload)
        payload.extend(b"\0" * (-len(payload) % 4))
        encoded = json.dumps(document, separators=(",", ":"), ensure_ascii=False,
                             allow_nan=False).encode("utf-8")
        encoded += b" " * (-len(encoded) % 4)
        return (struct.pack("<III", 0x46546C67, 2, 28 + len(encoded) + len(payload))
                + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded
                + struct.pack("<II", len(payload), 0x004E4942) + payload)
