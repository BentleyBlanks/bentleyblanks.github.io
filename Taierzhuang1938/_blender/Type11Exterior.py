"""Editable visual meshes and the stock TZM export for the Type 11 game asset."""
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

import bmesh
import bpy
from mathutils import Matrix, Vector

from TzmCore import AUTHORED_NORMAL_LAYER, Node

PROJECT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = Path(os.environ.get("TZ1938_TYPE11_EXTERIOR_SOURCE") or
                   Path.home() / "OneDrive/AI/Models/Blender/Taierzhuang1938/Type11Exterior_20261128/MetalFinish")
REST_POSE = "MachineGunExterior"
ATLAS_UV = "FinishAtlas"
GAME_TO_BLEND = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
BASE_REV = "12fc8b4eebbb55ddcedefa924166e22ec4487cf4"
BASE_SHA = "ecdc42dc80241f786ee554100186ef7876f11a10a62bc9e23b7560f01e2ee733"
NOTES = ("Game exterior adapted from buh's Type 11 6.5mm Machine gun (CC BY 4.0), "
         "with a new surface atlas and visual revisions after NAM 1981-01-9-1 and AWM RELAWM24898.")


def SourcePath():
    return SOURCE_ROOT / "Model_Type11Exterior.blend"


def ReadBaseline():
    relative = "Taierzhuang1938/Model/Model_Type11.tzm.json"
    data = subprocess.check_output(["git", "show", f"{BASE_REV}:{relative}"], cwd=PROJECT)
    if hashlib.sha256(data).hexdigest() != BASE_SHA:
        raise RuntimeError("Type11: unexpected original game mesh")
    return json.loads(data)


def Decode(block):
    count = block["count"]
    raw = struct.unpack("<" + "H" * (count * 3), base64.b64decode(block["pos"]))
    positions = [Vector(tuple(block["posMin"][j] + raw[i + j] * block["posScale"][j]
                              for j in range(3))) for i in range(0, len(raw), 3)]
    size = "H" if block["idxBits"] == 16 else "I"
    indices = struct.unpack("<" + size * block["idxCount"], base64.b64decode(block["idx"]))
    return positions, [indices[i:i + 3] for i in range(0, len(indices), 3)]


def Islands(points, triangles):
    """Partition quantized visual geometry across UV and normal splits."""
    parent = list(range(len(points)))

    def Root(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def Union(a, b):
        parent[Root(b)] = Root(a)

    previous = {}
    for index, point in enumerate(points):
        key = tuple(round(coordinate * 18000) for coordinate in point)
        Union(previous.setdefault(key, index), index)
    for a, b, c in triangles:
        Union(a, b)
        Union(a, c)

    parts = {}
    for face in triangles:
        parts.setdefault(Root(face[0]), []).append(face)
    return sorted(parts.values(), key=len, reverse=True)


def Selection(points, faces, transform=lambda point: point, invert=False):
    selected = sorted({index for face in faces for index in face})
    indexMap = {old: new for new, old in enumerate(selected)}
    return ([transform(points[old].copy()) for old in selected],
            [tuple(indexMap[index] for index in (face[::-1] if invert else face)) for face in faces])


class Exterior:
    def __init__(self, collection, nodes):
        self.collection = collection
        self.nodes = {node["name"]: node for node in nodes}

    def Mesh(self, name, part, surface, points, faces):
        if not faces:
            return None
        pivot = Vector(self.nodes[part]["t"])
        mesh = bpy.data.meshes.new("Mesh_" + name)
        mesh.from_pydata([GAME_TO_BLEND @ (point - pivot) for point in points], [], faces)
        edit = bmesh.new()
        edit.from_mesh(mesh)
        bmesh.ops.remove_doubles(edit, verts=edit.verts[:], dist=0.000024)
        bmesh.ops.dissolve_degenerate(edit, edges=edit.edges[:], dist=0.000010)
        edit.to_mesh(mesh)
        edit.free()
        mesh.validate()
        for face in mesh.polygons:
            face.use_smooth = True
        mesh.set_sharp_from_angle(angle=math.radians(47))
        obj = bpy.data.objects.new(name, mesh)
        obj.location = GAME_TO_BLEND @ pivot
        obj["TzmNode"] = part
        obj["FinishSurface"] = surface
        self.collection.objects.link(obj)
        return obj

    def Select(self, name, part, surface, points, faces, **options):
        return self.Mesh(name, part, surface, *Selection(points, faces, **options))

    def Profile(self, name, part, surface, profile, *, sides=24, x=0.0, y=.035):
        """Revolve a visual silhouette around the model's longitudinal axis."""
        points = [Vector((x + r * math.cos(math.tau * i / sides),
                          y + r * math.sin(math.tau * i / sides), z))
                  for z, r in profile for i in range(sides)]
        faces = []
        for ring in range(len(profile) - 1):
            for side in range(sides):
                a = ring * sides + side
                b = ring * sides + ((side + 1) % sides)
                faces.append((a, b, b + sides, a + sides))
        return self.Mesh(name, part, surface, points, faces)

    def Fins(self, name, start, end, count, inner, outer, *, y=.035, sides=20):
        """Continuous smooth lip and chamfer highlight on each exterior fin."""
        for index in range(count):
            z = start + (end - start) * index / (count - 1)
            self.Profile(f"{name}{index:02d}", "body", "FinSteel",
                         [(z-.0016, inner), (z-.00105, outer-.00055), (z-.00045, outer),
                          (z+.00045, outer), (z+.00105, outer-.00055), (z+.0016, inner)],
                         sides=sides, y=y)


def PrepareType11(exterior, baseline, ccBy):
    points, faces = Decode(ccBy["meshes"][0])
    islands = Islands(points, faces)
    if [len(group) for group in islands[:5]] != [2947, 1381, 1020, 590, 148]:
        raise RuntimeError("Type11: CC BY source topology differs")
    for index, group in enumerate(islands):
        if index == 2:
            exterior.Select("OiledStock", "body", "StockWood", points, group)
        elif index == 3:
            static, follower = [], []
            for face in group:
                center = sum((points[i] for i in face), Vector()) / len(face)
                (follower if center.y >= .073 else static).append(face)
            exterior.Select("HopperWalls", "body", "HopperSteel", points, static)
            exterior.Select("HopperFollower", "hopperFollower", "ContactSteel", points, follower)
        elif len(group) > 0:
            surface = "TubeSteel" if index == 0 else "ReceiverSteel"
            if index in (5, 6, 7):   # The existing CC BY cheek-side hardware remains visible.
                surface = "ContactSteel"
            exterior.Select(f"Type11Exterior{index:02d}", "body", surface, points, group)
    exterior.Fins("CoolingRib", -.749, -.389, 46, .0135, .0205, sides=16)
    handleOffset = Vector((-.044, -.092, -.093))
    originalNodes = {node["name"]: node for node in baseline["nodes"]}
    for nodeName in ("operatingHandleGuide", "operatingHandle"):
        node = originalNodes[nodeName]
        handlePoints, handleFaces = Decode(baseline["meshes"][node["meshes"][0]])
        exterior.Select(nodeName, nodeName, "ContactSteel", handlePoints, handleFaces,
                        transform=lambda point: point + handleOffset)


def ExportNodes(collection):
    """Preserve hierarchy, explicit joint pivots and per-corner normals during export."""
    schema = json.loads(collection["TzmNodes"])
    nodes = []
    for item in schema:
        args = dict(t=item["t"], r=item["r"], s=item.get("s", 1.0), joint=item.get("joint", False))
        parent = item["parent"]
        nodes.append(nodes[parent].Child(item["name"], **args) if parent >= 0 else Node(item["name"], **args))
    nodeByName = {node.name: node for node in nodes}
    material = "type11Exterior"
    for obj in sorted(collection.objects, key=lambda ob: ob.name):
        if obj.type != "MESH":
            continue
        mesh = obj.data
        local = GAME_TO_BLEND.to_4x4()
        local.translation = GAME_TO_BLEND @ Vector(nodeByName[obj["TzmNode"]].t)
        modelToNode = local.inverted() @ obj.matrix_basis
        normalMatrix = modelToNode.to_3x3().inverted().transposed()
        normals = [normalMatrix @ normal.vector for normal in mesh.corner_normals]
        edit = bmesh.new()
        edit.from_mesh(mesh)
        edit.transform(modelToNode)
        layer = edit.loops.layers.float_vector.new(AUTHORED_NORMAL_LAYER)
        edit.faces.ensure_lookup_table()
        for face, polygon in zip(edit.faces, mesh.polygons, strict=True):
            for loop, index in zip(face.loops, polygon.loop_indices, strict=True):
                loop[layer] = normals[index]
        node = nodeByName[obj["TzmNode"]]
        # The .blend holds each authored mesh origin at its original node pivot.
        # Export node-local data and preserve intentional object-space edits.
        edit.normal_update()
        node.parts.append((material, edit, None))
    return nodes[0]


def BuilderFor():
    source = SourcePath()
    if not source.is_file():
        # Public checkouts already contain the finished TZM and atlas runtime
        # assets. Absence of a private authoring file must not replace them.
        return None

    def Build():
        with bpy.data.libraries.load(str(source), link=False) as (inventory, loaded):
            if REST_POSE not in inventory.collections:
                raise RuntimeError(f"Type11: missing {REST_POSE} in {source}")
            loaded.collections = [REST_POSE]
        model = loaded.collections[0]
        try:
            return ExportNodes(model)
        finally:
            for obj in list(model.objects):
                bpy.data.objects.remove(obj, do_unlink=True)
            bpy.data.collections.remove(model)

    Build.imported = True
    Build.sourceTriangles = 6578
    Build.targetTriangles = 14106
    return Build
