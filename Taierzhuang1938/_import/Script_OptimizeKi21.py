"""Rebuild Ki-21 geometry from the retained source GLB, preserving its image bytes.

Cloud Blender 4.3+:
  blender -b --python Script_OptimizeKi21.py -- --source SOURCE.glb --output OUT.glb \
    --blend OUT.blend --source-blend SOURCE.blend --angle 35

On Windows invoke this script through the repository BlenderMCP start/exec/stop
workflow. SOURCE is the retained original, never the already optimized output.
The geometry repair joins only endpoints of an unambiguous, oppositely oriented
two-face edge at exactly equal source positions. It is not a distance weld.
UVs remain per-corner and hard edges are explicit sharp edges. There is no
position-moving decimation: the companion reducer selects retained vertices.
The companion Node stage reduces small connected parts with meshoptimizer,
while preserving large skins, engines, glazing and transparent cards. Only exact
same-winding opaque duplicate faces are removed before that stage.
All original material definitions, nodes, transforms, image payloads and sampler
definitions are copied verbatim into the GLB. No internal parts are deleted.
CadNav attribution and redistribution restrictions: docs/Data_AircraftAssets.md.
"""
import argparse
import copy
import hashlib
import json
import math
import os
import struct
import sys
import subprocess
import tempfile

import bpy
import numpy as np
from mathutils import Matrix


def ReadGlb(filename):
    data = open(filename, "rb").read()
    length = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + length]), data[28 + length:], data


def Accessor(doc, binary, index):
    accessor = doc["accessors"][index]
    view = doc["bufferViews"][accessor["bufferView"]]
    dtype = {5123: "<u2", 5125: "<u4", 5126: "<f4"}[accessor["componentType"]]
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[accessor["type"]]
    size = np.dtype(dtype).itemsize
    return np.ndarray((accessor["count"], width), dtype, binary,
                      view.get("byteOffset", 0) + accessor.get("byteOffset", 0),
                      strides=(view.get("byteStride", size * width), size)).copy()


def RepairFans(positions, triangles):
    _, positionIds = np.unique(positions, axis=0, return_inverse=True)
    faceIds = positionIds[triangles]
    faceNormals = np.cross(positions[triangles[:, 1]] - positions[triangles[:, 0]],
                           positions[triangles[:, 2]] - positions[triangles[:, 0]])
    lengths = np.linalg.norm(faceNormals, axis=1)
    faceNormals /= np.maximum(lengths[:, None], 1e-20)
    parents = np.arange(len(positions))
    edges = {}
    for face, ids in enumerate(faceIds):
        for corner in range(3):
            key = tuple(sorted((int(ids[corner]), int(ids[(corner + 1) % 3]))))
            edges.setdefault(key, []).append((face, corner))

    def Root(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    joined = 0
    for adjacent in edges.values():
        if len(adjacent) != 2:
            continue
        (faceA, cornerA), (faceB, cornerB) = adjacent
        a, b = triangles[faceA, cornerA], triangles[faceA, (cornerA + 1) % 3]
        c, d = triangles[faceB, cornerB], triangles[faceB, (cornerB + 1) % 3]
        if positionIds[a] != positionIds[d] or positionIds[b] != positionIds[c]:
            continue
        if min(lengths[faceA], lengths[faceB]) < 1e-12:
            continue
        # Reconstruct continuous *geometry* across normal/UV splits. Keeping
        # disconnected fans here causes independent QEM borders to tear apart.
        # UV and shading discontinuities are represented by loops/sharp edges.
        for x, y in ((a, d), (b, c)):
            rx, ry = Root(x), Root(y)
            if rx != ry:
                parents[ry] = rx
                joined += 1
    roots = np.array([Root(index) for index in range(len(positions))])
    unique, inverse = np.unique(roots, return_inverse=True)
    return positions[unique], inverse[triangles], joined


def MarkEdges(mesh, angle):
    mesh.update()
    adjacent = {}
    for face in mesh.polygons:
        for loopIndex in face.loop_indices:
            loop = mesh.loops[loopIndex]
            adjacent.setdefault(loop.edge_index, []).append((face.index, loopIndex))
    locked = set()
    uv = mesh.uv_layers.active.data
    for edge in mesh.edges:
        neighbors = adjacent.get(edge.index, [])
        if len(neighbors) != 2:
            edge.use_edge_sharp = True
            locked.update(edge.vertices)
            continue
        (fa, la), (fb, lb) = neighbors
        a, b = mesh.polygons[fa], mesh.polygons[fb]
        edge.use_edge_sharp = a.normal.dot(b.normal) < math.cos(math.radians(angle))
        na = a.loop_start + (la - a.loop_start + 1) % a.loop_total
        nb = b.loop_start + (lb - b.loop_start + 1) % b.loop_total
        edge.use_seam = (uv[la].uv - uv[nb].uv).length > 1e-7 or (uv[na].uv - uv[lb].uv).length > 1e-7
        # Loop UVs remain exact. Export splits attribute tuples at UV seams;
        # the subsequent component reducer accounts for UV interpolation error.
    return locked


def MeshArrays(mesh):
    mesh.calc_loop_triangles()
    rows = []
    for triangle in mesh.loop_triangles:
        for loopIndex in triangle.loops:
            vertex = mesh.vertices[mesh.loops[loopIndex].vertex_index]
            normal = mesh.corner_normals[loopIndex].vector
            uv = mesh.uv_layers.active.data[loopIndex].uv
            rows.append((*vertex.co, *normal, *uv))
    data, indices = np.unique(np.asarray(rows, dtype=np.float32), axis=0, return_inverse=True)
    return {"POSITION": data[:, :3], "NORMAL": data[:, 3:6], "TEXCOORD_0": data[:, 6:]}, indices


def PackGlb(doc, chunks, output):
    offset = 0
    blocks = []
    for view, chunk in zip(doc["bufferViews"], chunks):
        view["byteOffset"], view["byteLength"] = offset, len(chunk)
        block = chunk + b"\x00" * (-len(chunk) % 4)
        blocks.append(block)
        offset += len(block)
    doc["buffers"][0]["byteLength"] = offset
    encoded = json.dumps(doc, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    result = struct.pack("<III", 0x46546C67, 2, 28 + len(encoded) + offset)
    result += struct.pack("<II", len(encoded), 0x4E4F534A) + encoded
    result += struct.pack("<II", offset, 0x004E4942) + b"".join(blocks)
    os.makedirs(os.path.dirname(os.path.abspath(output)), exist_ok=True)
    with open(output, "wb") as handle:
        handle.write(result)


def Main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--blend", required=True)
    parser.add_argument("--source-blend")
    parser.add_argument("--angle", type=float, default=35)
    parser.add_argument("--node", default="node")
    parser.add_argument("--report")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    # Avoid implicit .blend1 writes beside retained source projects.
    bpy.context.preferences.filepaths.save_version = 0
    source, binary, sourceBytes = ReadGlb(args.source)
    expectedSource = "b26d7436a2e84d16ef3fffd06a27a158623e216a34c258f26b85c44c4afd12d1"
    if hashlib.sha256(sourceBytes).hexdigest() != expectedSource:
        raise ValueError("Expected original Ki-21 high-poly source SHA256 " + expectedSource)
    paths = [args.source, args.output, args.blend, args.source_blend, args.report]
    paths = [os.path.realpath(path) for path in paths if path]
    if len(paths) != len(set(paths)):
        raise ValueError("Source, output, blend and report paths must be distinct")
    for index, first in enumerate(paths):
        for second in paths[index + 1:]:
            if os.path.exists(first) and os.path.exists(second) and os.path.samefile(first, second):
                raise ValueError("Do not overwrite source or output through a hard link")
    if len(source["meshes"]) != 1 or len(source["meshes"][0]["primitives"]) != 8:
        raise ValueError("Expected the retained eight-primitive Ki-21 source")
    doc = copy.deepcopy(source)
    chunks = [binary[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]]
              for v in source["bufferViews"]]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.source))
    original = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
    if args.source_blend:
        os.makedirs(os.path.dirname(os.path.abspath(args.source_blend)), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.source_blend))
    materials = list(original.data.materials)
    transform = original.matrix_world @ Matrix.Rotation(math.pi / 2, 4, "X")
    original.hide_render = True
    original.hide_viewport = True
    original.hide_set(True)
    report = {"sourceSha256": hashlib.sha256(sourceBytes).hexdigest(), "method": "edge-local normal cleanup; exact duplicates; protected component reduction",
              "angleDegrees": args.angle, "parts": [], "removedInternalPieces": 0,
              "preservedImagePayloads": len(source.get("images", []))}
    for partIndex, primitive in enumerate(source["meshes"][0]["primitives"]):
        positions = Accessor(source, binary, primitive["attributes"]["POSITION"])
        normals = Accessor(source, binary, primitive["attributes"]["NORMAL"])
        uv = Accessor(source, binary, primitive["attributes"]["TEXCOORD_0"])
        triangles = Accessor(source, binary, primitive["indices"]).reshape(-1, 3)
        material = source["materials"][primitive["material"]]
        protected = material.get("alphaMode", "OPAQUE") != "OPAQUE"
        row = {"primitive": partIndex, "material": material.get("name"),
               "sourceTriangles": len(triangles), "sourceVertices": len(positions),
               "transparentProtected": protected}
        if protected:
            row.update({"triangles": len(triangles), "vertices": len(positions), "joinedVertices": 0})
            report["parts"].append(row)
            continue
        # Same-winding duplicate opaque triangles have identical positions, UVs,
        # and source normals. Reverse-winding skins/cards are never removed.
        seen = set()
        keep = []
        for faceIndex, triangle in enumerate(triangles):
            corners = [np.concatenate((positions[v], normals[v], uv[v])).astype('<f4').tobytes() for v in triangle]
            key = min(b''.join(corners[i:] + corners[:i]) for i in range(3))
            if key not in seen:
                seen.add(key)
                keep.append(faceIndex)
        row['exactOpaqueDuplicateTrianglesRemoved'] = len(triangles) - len(keep)
        triangles = triangles[keep]
        repaired, indices, joined = RepairFans(positions, triangles)
        mesh = bpy.data.meshes.new("Ki21Primitive%02d" % partIndex)
        mesh.from_pydata(repaired.tolist(), [], indices.tolist())
        layer = mesh.uv_layers.new(name="UVMap")
        layer.data.foreach_set("uv", uv[triangles].reshape(-1).tolist())
        # Smooth curved surfaces while retaining explicit per-edge sharp normals.
        for face in mesh.polygons:
            face.use_smooth = True
        mesh.update()
        MarkEdges(mesh, args.angle)
        obj = bpy.data.objects.new(mesh.name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.matrix_world = transform
        mesh.materials.append(materials[partIndex])
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        arrays, outIndices = MeshArrays(obj.data)
        # Source local axes are unchanged; materials and nodes never pass through
        # Blender's exporter. This avoids image recompression/material conversion.
        outPrimitive = doc["meshes"][0]["primitives"][partIndex]
        for semantic, array in arrays.items():
            accessor = doc["accessors"][outPrimitive["attributes"][semantic]]
            viewIndex = accessor["bufferView"]
            chunks[viewIndex] = array.astype("<f4").tobytes()
            doc["bufferViews"][viewIndex].pop("byteStride", None)
            accessor["count"] = len(array)
            accessor["byteOffset"] = 0
            if semantic == "POSITION":
                accessor["min"], accessor["max"] = array.min(axis=0).tolist(), array.max(axis=0).tolist()
        accessor = doc["accessors"][outPrimitive["indices"]]
        accessor["componentType"] = 5123 if len(arrays["POSITION"]) <= 65535 else 5125
        chunks[accessor["bufferView"]] = outIndices.astype("<u2" if accessor["componentType"] == 5123 else "<u4").tobytes()
        accessor["count"], accessor["byteOffset"] = len(outIndices), 0
        doc["bufferViews"][accessor["bufferView"]].pop("byteStride", None)
        row.update({"triangles": len(outIndices) // 3, "vertices": len(arrays["POSITION"]),
                    "joinedVertices": joined, "repairedVertices": len(repaired),
                    "bboxBefore": [positions.min(0).tolist(), positions.max(0).tolist()],
                    "bboxAfter": [arrays["POSITION"].min(0).tolist(), arrays["POSITION"].max(0).tolist()]})
        report["parts"].append(row)
        print(json.dumps(row), flush=True)
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="Ki21Rebuild-") as work:
        normalOutput = os.path.join(work, "Ki21Normals.glb")
        PackGlb(doc, chunks, normalOutput)
        reducer = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Script_OptimizeKi21Parts.mjs")
        subprocess.run([args.node, reducer, normalOutput, os.path.abspath(args.output), "0.05"], check=True)
        with open(args.output + ".json") as handle:
            report["partReduction"] = json.load(handle)
        os.remove(args.output + ".json")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.output))
    bpy.context.scene["sourceSha256"] = report["sourceSha256"]
    bpy.context.scene["rebuildScript"] = "Script_OptimizeKi21.py"
    bpy.context.scene["sourceAttribution"] = "cadnav.com; see Data_AircraftAssets.md"
    os.makedirs(os.path.dirname(os.path.abspath(args.blend)), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.blend))
    report["outputBytes"] = os.path.getsize(args.output)
    finalDoc, finalBinary, finalBytes = ReadGlb(args.output)
    report["triangles"] = sum(finalDoc["accessors"][p["indices"]]["count"] // 3 for p in finalDoc["meshes"][0]["primitives"])
    report["vertices"] = sum(finalDoc["accessors"][p["attributes"]["POSITION"]]["count"] for p in finalDoc["meshes"][0]["primitives"])
    report["outputSha256"] = hashlib.sha256(finalBytes).hexdigest()
    report["exactOpaqueDuplicateTrianglesRemoved"] = sum(row.get("exactOpaqueDuplicateTrianglesRemoved", 0) for row in report["parts"])
    if args.report:
        os.makedirs(os.path.dirname(os.path.abspath(args.report)), exist_ok=True)
        with open(args.report, "w") as handle:
            json.dump(report, handle, indent=2)
    print(json.dumps(report), flush=True)


if __name__ == "__main__":
    Main()
