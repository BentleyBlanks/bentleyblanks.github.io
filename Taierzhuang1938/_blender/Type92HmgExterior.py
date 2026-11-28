"""Editable Type92Hmg game exterior and TZM export."""
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
ASSET_ID = "Type92Hmg"
SOURCE_ROOT = Path(os.environ.get("TZ1938_TYPE92_HMG_SOURCE") or
                   Path.home() / "OneDrive/AI/Models/Blender/Taierzhuang1938/Type92Hmg/Exterior_20261128")
REST_POSE = "Type92HmgExterior"
ATLAS_UV = "FinishAtlas"
GAME_TO_BLEND = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
BASE_REV = "12fc8b4eebbb55ddcedefa924166e22ec4487cf4"
BASE_SHA = "0b1d9c3e4ad737ae953035ae88b34ec3b7817f9e50d881ba7ffd2a0e418134f6"
AUTHORING_NOTE = ("CadNav.com game derivative. Upright exterior and tripod, with receiver and wood grip finish "
                  "after AWM RELAWM28834.001/.002 and photograph 026540.")
# Retained source triangles after display cleanup and selecting the surfaces for repair.
SOURCE_TRIANGLES = 13230


def SourcePath():
    return SOURCE_ROOT / "Model_Type92HmgExterior.blend"


def ReadBaseline():
    relative = "Taierzhuang1938/Model/Model_Type92Hmg.tzm.json"
    data = subprocess.check_output(["git", "show", f"{BASE_REV}:{relative}"], cwd=PROJECT)
    if hashlib.sha256(data).hexdigest() != BASE_SHA:
        raise RuntimeError("Type92Hmg: unexpected original game mesh")
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


def PrepareExterior(exterior, baseline):
    points, faces = Decode(baseline["meshes"][0])
    # CadNav's retained game derivative had the tripod lying on its side. Roll
    # about the game bore origin so the visible axis and original mounts agree.
    points = [Vector((.035 - point.y, .035 + point.x, point.z)) for point in points]
    islands = Islands(points, faces)
    if [len(group) for group in islands[:8]] != [15534, 3148, 304, 302, 264, 148, 147, 128]:
        raise RuntimeError("Type92Hmg: CadNav game baseline topology differs")
    for index, group in enumerate(islands):
        if index == 6:   # Loose display item, separated from the exterior.
            continue
        if index == 0:
            receiver, recess, sleeve = [], [], []
            for face in group:
                center = sum((points[i] for i in face), Vector()) / len(face)
                # Leave the new forward silhouette clear of long triangles from the old muzzle.
                if center.z < -.703 or any(points[index].z < -.735 for index in face):
                    continue
                if center.z < -.296:
                    sleeve.append(face)
                elif -.161 < center.z < -.062 and center.x > .024 and .033 < center.y < .079:
                    recess.append(face)
                else:
                    receiver.append(face)
            exterior.Select("Receiver", "body", "ReceiverSteel", points, receiver)
            exterior.Select("ReceiverSideRecess", "body", "RecessSteel", points, recess)
            exterior.Select("CoarseCoolingSleeve", "body", "FinSteel", points, sleeve)
        elif index in (2, 3):
            wood, steel = [], []
            for face in group:
                target = wood if sum(points[i].y for i in face) / len(face) < -.066 else steel
                target.append(face)
            exterior.Select(f"HandleWood{index}", "body", "HandleWood", points, wood)
            exterior.Select(f"HandleHinge{index}", "body", "ContactSteel", points, steel)
        else:
            surface = "TripodSteel" if index in (1, 4, 5, 7, 8, 9, 10) else "ContactSteel"
            if index == 1:
                exterior.Select("TripodHubAndRearLeg", "body", surface, points, group, transform=SeatRearFoot)
            else:
                exterior.Select(f"CadNavExterior{index:02d}", "body", surface, points, group)
            if index in (5, 7):
                exterior.Select(f"RestoredFrontLeg{index:02d}", "body", surface, points, group,
                                transform=lambda point: Vector((-point.x, point.y, point.z)), invert=True)
    exterior.Profile("ForwardTube", "body", "FinSteel",
                     [(-.901, .001), (-.901, .015), (-.898, .0165), (-.880, .0145),
                      (-.853, .010), (-.831, .007), (-.824, .0068), (-.743, .0068),
                      (-.730, .010), (-.719, .010), (-.710, .009), (-.678, .009)])
    exterior.Fins("ForwardRib", -.821, -.729, 23, .0067, .0100, sides=20)
    AddSleeveCrown(exterior)
    AddReceiverBacking(exterior)


def AddSleeveCrown(exterior):
    # Small rounded silhouette at the front edge of the coarse cooling sleeve.
    sides = 16
    outline = ((-.008, .0086), (-.007, .0100), (.007, .0100), (.008, .0086),
               (.008, .0043), (.007, .0036), (-.007, .0036), (-.008, .0043))
    points = [Vector((x, .088 + radius * math.cos(math.tau * j / sides),
                      -.593 + radius * math.sin(math.tau * j / sides)))
              for x, radius in outline for j in range(sides)]
    faces = []
    for ring in range(len(outline)):
        after = ((ring + 1) % len(outline)) * sides
        for side in range(sides):
            nextSide = (side + 1) % sides
            faces.append((ring * sides + side, ring * sides + nextSide,
                          after + nextSide, after + side))
    # Seat the crown into the retained sleeve. The lower edge disappearing into
    # the steel shoulder keeps it attached in a perfectly level side view.
    start = len(points)
    for y, halfWidth, halfLength in ((.048, .009, .009), (.081, .006, .006)):
        points.extend(Vector((x * halfWidth, y, -.593 + z * halfLength))
                      for x, z in ((-1, -1), (1, -1), (1, 1), (-1, 1)))
    faces.extend(tuple(start + index for index in face)
                 for face in ((0, 1, 2, 3), (7, 6, 5, 4), (4, 5, 1, 0),
                              (5, 6, 2, 1), (6, 7, 3, 2), (7, 4, 0, 3)))
    exterior.Mesh("SleeveCrown", "body", "FinSteel", points, faces)


def SeatRearFoot(point):
    # Compensate for the low tilt of the source rear leg. Keep the hub fixed.
    weight = max(0, min(1, (point.z - .055) / .15))
    point.y -= .0064 * weight
    return point


def AddReceiverBacking(exterior):
    # A recessed visual surface gives the open receiver seams a dark backing at
    # every inspection angle. It sits behind the retained CadNav exterior shells.
    points = [Vector((x, y, z)) for z in (-.300, .144)
              for x, y in ((-.017, -.021), (.017, -.021), (.017, .043), (-.017, .043))]
    faces = [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5),
             (2, 3, 7, 6), (3, 0, 4, 7)]
    obj = exterior.Mesh("ReceiverShadowBacking", "body", "RecessSteel", points, faces)
    for face in obj.data.polygons:
        face.use_smooth = False


def ExportNodes(collection):
    """Preserve hierarchy, explicit joint pivots and per-corner normals during export."""
    schema = json.loads(collection["TzmNodes"])
    nodes = []
    for item in schema:
        args = dict(t=item["t"], r=item["r"], s=item.get("s", 1.0), joint=item.get("joint", False))
        parent = item["parent"]
        nodes.append(nodes[parent].Child(item["name"], **args) if parent >= 0 else Node(item["name"], **args))
    nodeByName = {node.name: node for node in nodes}
    material = "type92Exterior"
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


def Builder():
    source = SourcePath()
    if not source.is_file():
        # Public checkouts already contain the finished TZM and atlas runtime
        # assets. Absence of a private authoring file must not replace them.
        return None

    def Build():
        with bpy.data.libraries.load(str(source), link=False) as (inventory, loaded):
            if REST_POSE not in inventory.collections:
                raise RuntimeError(f"{ASSET_ID}: missing {REST_POSE} in {source}")
            loaded.collections = [REST_POSE]
        model = loaded.collections[0]
        try:
            return ExportNodes(model)
        finally:
            for obj in list(model.objects):
                bpy.data.objects.remove(obj, do_unlink=True)
            bpy.data.collections.remove(model)

    Build.imported = True
    Build.sourceTriangles = SOURCE_TRIANGLES
    Build.targetTriangles = SOURCE_TRIANGLES
    return Build
