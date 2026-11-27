"""Bake contact occlusion onto a unique UV set using the evaluated prop assembly."""

from hashlib import sha256
from itertools import combinations
import json
from math import acos, cos, radians
import os
from pathlib import Path
import runpy
from shutil import copyfile
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import numpy as np


FOLDER = Path(__file__).resolve().parent
UV_NAME = "GeometryAO"
IMAGE_NAME = "Texture_Type30HmgAssemblyAo"
LAYOUT_FILE = "Data_Type30HmgAssemblyAoUv.npz"
MANIFEST = "Data_Type30HmgAssemblyAo.json"
RESOLUTION = 2048
CONTACT_RADIUS = .065
ASSEMBLY_RADIUS = .16
CREASE_RADII = (.014, .032)
CREASE_STRENGTH = .64
FINE_CONTACT_RADII = (.003, .009)
FINE_CONTACT_STRENGTH = .80
CONTACT_BAND_RADIUS = .006
CONTACT_BAND_STRENGTH = .76
INTERSECTION_RADIUS = .0035
CONCAVE_EDGE_RADIUS = .0048
SEAM_STRENGTH = .97
MIN_SEAM_VISIBILITY = .018
BAKE_MARGIN = 3


def MeshSignature(obj):
    mesh = obj.data
    coords = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
    corners = np.empty(len(mesh.loops), dtype=np.int32)
    sizes = np.empty(len(mesh.polygons), dtype=np.int32)
    mesh.vertices.foreach_get("co", coords)
    mesh.loops.foreach_get("vertex_index", corners)
    mesh.polygons.foreach_get("loop_total", sizes)
    digest = sha256(coords.tobytes())
    digest.update(corners.tobytes())
    digest.update(sizes.tobytes())
    digest.update(np.float32(obj.matrix_world).tobytes())
    return digest.hexdigest()


def UvValues(layer, count):
    values = np.empty(count * 2, dtype=np.float32)
    layer.data.foreach_get("uv", values)
    return values


def ReadManifest(directory):
    record = json.loads((directory / MANIFEST).read_text(encoding="utf-8"))
    if record["uv"] != UV_NAME or record["resolution"] != [RESOLUTION, RESOLUTION]:
        raise ValueError(f"Unexpected Type 30 AO atlas contract in {directory}")
    return record


def LoadImage(directory):
    record = ReadManifest(directory)
    path = directory / (IMAGE_NAME + ".png")
    expected = record["imageSha256"]
    if sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError(f"Type 30 AO image hash differs from its bake record: {path}")
    for image in bpy.data.images:
        if image.get("AssemblyAoSha256") == expected and image.packed_file:
            return image
    image = bpy.data.images.load(str(path), check_existing=False)
    image.colorspace_settings.name = "Non-Color"
    image.pack()
    image["AssemblyAoSha256"] = expected
    return image


def PackIntoSource(asset, directory, recordedDirectory=None):
    image = LoadImage(directory)
    image.use_fake_user = True
    for old in list(bpy.data.images):
        if old != image and old.get("AssemblyAoSha256") and old.use_fake_user and old.users == 1:
            bpy.data.images.remove(old)
    archived = Path(recordedDirectory or directory).resolve()
    image.filepath = str(archived / (IMAGE_NAME + ".png"))
    asset["AssemblyAoDirectory"] = str(archived)
    asset["AssemblyAoUv"] = "GeometryAO on evaluated export meshes (glTF TEXCOORD_1)"
    return image


def ApplyLayout(objects, directory):
    record = ReadManifest(directory)
    if set(record["meshSignatures"]) != {obj.name for obj in objects}:
        raise ValueError("Type 30 AO layout belongs to a different export assembly")
    with np.load(directory / LAYOUT_FILE, allow_pickle=False) as layout:
        for obj in objects:
            if MeshSignature(obj) != record["meshSignatures"][obj.name]:
                raise ValueError(f"{obj.name} geometry has changed. Rebuild its assembly AO before exporting.")
            mesh = obj.data
            coords = layout[obj.name]
            if coords.shape != (len(mesh.loops) * 2,) or not np.isfinite(coords).all():
                raise ValueError(f"Invalid AO UV coordinates on {obj.name}")
            old = UvValues(mesh.uv_layers[0], len(mesh.loops))
            layer = mesh.uv_layers.new(name=UV_NAME, do_init=False)
            layer.data.foreach_set("uv", np.ascontiguousarray(coords, dtype=np.float32))
            mesh.uv_layers.active_index = 0
            mesh.uv_layers[0].active_render = True
            assert np.array_equal(old, UvValues(mesh.uv_layers[0], len(mesh.loops)))


def Bind(objects, image, added):
    from io_scene_gltf2.blender.com.material_helpers import create_settings_group

    settings = bpy.data.node_groups.get("glTF Material Output") or create_settings_group("glTF Material Output")
    for material in {slot.material for obj in objects for slot in obj.material_slots if slot.material}:
        graph = material.node_tree

        def Node(kind):
            node = graph.nodes.new(kind)
            added.append((graph, node))
            return node

        uv = Node("ShaderNodeUVMap")
        uv.uv_map = UV_NAME
        texture = Node("ShaderNodeTexImage")
        texture.image = image
        texture.label = "Assembly AO"
        split = Node("ShaderNodeSeparateColor")
        group = Node("ShaderNodeGroup")
        group.node_tree = settings
        graph.links.new(uv.outputs["UV"], texture.inputs["Vector"])
        graph.links.new(texture.outputs["Color"], split.inputs["Color"])
        graph.links.new(split.outputs["Red"], group.inputs["Occlusion"])


def Unwrap(proxy):
    layer = proxy.data.uv_layers.new(name=UV_NAME, do_init=False)
    proxy.data.uv_layers.active = layer
    bpy.ops.object.select_all(action="DESELECT")
    proxy.select_set(True)
    bpy.context.view_layer.objects.active = proxy
    bpy.ops.object.mode_set(mode="EDIT")
    try:
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=radians(67), island_margin=.002,
                                 correct_aspect=False, scale_to_bounds=True)
        bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=.0034,
                                margin_method="FRACTION", shape_method="CONCAVE")
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")
    return proxy.data.uv_layers[UV_NAME]


def WeightedVisibility(graph, terms):
    lighting = []
    for distance, samples, weight in terms:
        occlusion = graph.nodes.new("ShaderNodeAmbientOcclusion")
        occlusion.inputs["Distance"].default_value = distance
        occlusion.samples = samples
        occlusion.only_local = False
        scale = graph.nodes.new("ShaderNodeMath")
        scale.operation = "MULTIPLY"
        scale.inputs[1].default_value = weight
        graph.links.new(occlusion.outputs["AO"], scale.inputs[0])
        lighting.append(scale.outputs[0])
    combine = graph.nodes.new("ShaderNodeMath")
    combine.operation = "ADD"
    for index, value in enumerate(lighting):
        graph.links.new(value, combine.inputs[index])
    return combine.outputs[0]


def BakeMaterial(image):
    bake = bpy.data.materials.new("Type30AssemblyAoTemporary")
    bake.use_nodes = True
    graph = bake.node_tree
    graph.nodes.clear()
    assembly = WeightedVisibility(graph, ((CONTACT_RADIUS, 48, .72), (ASSEMBLY_RADIUS, 32, .28)))
    crease = WeightedVisibility(graph, ((CREASE_RADII[0], 96, .64), (CREASE_RADII[1], 64, .36)))
    fineContact = WeightedVisibility(graph, ((FINE_CONTACT_RADII[0], 96, .60), (FINE_CONTACT_RADII[1], 80, .40)))
    packed = graph.nodes.new("ShaderNodeCombineColor")
    graph.links.new(assembly, packed.inputs["Red"])
    graph.links.new(crease, packed.inputs["Green"])
    graph.links.new(fineContact, packed.inputs["Blue"])
    emission = graph.nodes.new("ShaderNodeEmission")
    output = graph.nodes.new("ShaderNodeOutputMaterial")
    graph.links.new(packed.outputs["Color"], emission.inputs["Color"])
    graph.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    target = graph.nodes.new("ShaderNodeTexImage")
    target.image = image
    graph.nodes.active = target
    return bake


def SmoothVisibility(values):
    for axis in (0, 1):
        padding = [(0, 0), (0, 0)]
        padding[axis] = (1, 1)
        padded = np.pad(values, padding, mode="edge")
        head, tail = (padded[:-2], padded[2:]) if axis == 0 else (padded[:, :-2], padded[:, 2:])
        values = .13 * head + .74 * values + .13 * tail
    return values


def RasterizeTriangle(uv):
    minimum = np.maximum(np.ceil(uv.min(axis=0)).astype(int), 0)
    maximum = np.minimum(np.floor(uv.max(axis=0)).astype(int), RESOLUTION - 1)
    if np.any(minimum > maximum):
        return None
    edgeU, edgeV = uv[1:] - uv[0]
    area = edgeU[0] * edgeV[1] - edgeU[1] * edgeV[0]
    if abs(area) < 1e-8:
        return None
    x0, y0 = minimum
    x1, y1 = maximum
    x, y = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
    u = ((x - uv[0, 0]) * edgeV[1] - (y - uv[0, 1]) * edgeV[0]) / area
    v = (edgeU[0] * (y - uv[0, 1]) - edgeU[1] * (x - uv[0, 0])) / area
    w = 1. - u - v
    inside = (u >= -1e-7) & (v >= -1e-7) & (w >= -1e-7)
    if not inside.any():
        return None
    return y[inside], x[inside], np.column_stack((w[inside], u[inside], v[inside]))


def ExtendContactMargin(mask, covered):
    for _ in range(BAKE_MARGIN):
        previous = covered.copy()
        for target, source in (
            (np.s_[1:, :], np.s_[:-1, :]), (np.s_[:-1, :], np.s_[1:, :]),
            (np.s_[:, 1:], np.s_[:, :-1]), (np.s_[:, :-1], np.s_[:, 1:]),
        ):
            padding = ~covered[target] & previous[source]
            mask[target][padding] = mask[source][padding]
            covered[target][padding] = True
    return mask


def ContactParts(proxy, meshes, attribute):
    mesh = proxy.data
    vertices = np.empty((len(mesh.vertices), 3), dtype=np.float32)
    corners = np.empty(len(mesh.loops), dtype=np.int32)
    mesh.vertices.foreach_get("co", vertices.ravel())
    mesh.loops.foreach_get("vertex_index", corners)
    triangles = corners.reshape(-1, 3)
    groups = []
    for obj in meshes:
        data = obj.data.attributes[attribute].data
        labels = np.empty(len(data), dtype=np.int32)
        data.foreach_get("value", labels)
        groups.append(labels)
    groups = np.concatenate(groups)
    assert len(groups) == len(triangles)

    parts = []
    for label in np.unique(groups):
        used, remapped = np.unique(triangles[groups == label], return_inverse=True)
        points = vertices[used]
        minimum, maximum = points.min(axis=0), points.max(axis=0)
        tree = BVHTree.FromPolygons(points.tolist(), remapped.reshape(-1, 3).tolist(), all_triangles=True)
        radius = float(np.clip(np.linalg.norm(maximum - minimum) * .16, .0018, CONTACT_BAND_RADIUS))
        parts.append((label, minimum, maximum, radius, tree, points[remapped.reshape(-1, 3)]))
    return vertices[triangles], groups, parts


def SurfaceContact(points, normal, distance, tree):
    weights = np.zeros(len(points), dtype=np.float32)
    for index, value in enumerate(points):
        point = Vector(value)
        nearest, otherNormal, _, gap = tree.find_nearest(point, distance)
        if nearest is None:
            continue
        if gap < 2e-5:
            # Coincident faces facing out together are one visible surface.
            if normal.dot(otherNormal) < .98:
                weights[index] = 1.
            continue
        direction = (nearest - point) / gap
        facing = min(normal.dot(direction), -otherNormal.dot(direction))
        if facing <= -.30:
            continue
        attitude = min((facing + .30) / .34, 1.)
        falloff = 1. - gap / distance
        weights[index] = attitude * falloff * falloff * (3. - 2. * falloff)
    return weights


def PlaneCut(triangle, distances, axis):
    distances = np.where(abs(distances) < 1e-7, 0., distances)
    nextDistance = np.roll(distances, -1)
    crosses = distances * nextDistance < 0.
    edgeStarts = triangle[crosses]
    edges = (np.roll(triangle, -1, axis=0) - triangle)[crosses]
    factors = distances[crosses] / (distances[crosses] - nextDistance[crosses])
    points = np.concatenate((triangle[distances == 0.], edgeStarts + edges * factors[:, None]))
    if len(points) < 2:
        return None
    along = points @ axis
    return points[0], float(along.min()), float(along.max())


def IntersectionSegment(left, leftNormal, right, rightNormal):
    axis = np.cross(leftNormal, rightNormal)
    length = np.linalg.norm(axis)
    if length < .02:
        return None
    axis /= length
    a = PlaneCut(left, (left - right[0]) @ rightNormal, axis)
    b = PlaneCut(right, (right - left[0]) @ leftNormal, axis)
    if a is None or b is None:
        return None
    start, end = max(a[1], b[1]), min(a[2], b[2])
    if end - start < 2e-5:
        return None
    origin = a[0] - axis * (a[0] @ axis)
    return origin + axis * start, origin + axis * end


def FaceNormals(triangles):
    vectors = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    lengths = np.linalg.norm(vectors, axis=1)
    return vectors / np.maximum(lengths[:, None], 1e-12)


def ContactSegment(start, end, radius, weight=1.):
    edge = end - start
    span = (np.minimum(start, end) - radius, np.maximum(start, end) + radius)
    return (*span, start, edge, float(edge @ edge), radius, weight)


def ContactSegments(parts):
    segments = {part[0]: [] for part in parts}
    normals = {label: FaceNormals(triangles) for label, _, _, _, _, triangles in parts}
    for left, right in combinations(parts, 2):
        a, aMin, aMax, aRadius, aTree, aFaces = left
        b, bMin, bMax, bRadius, bTree, bFaces = right
        if np.any(aMax < bMin) or np.any(bMax < aMin):
            continue
        radius = min(aRadius, bRadius, INTERSECTION_RADIUS)
        for ai, bi in aTree.overlap(bTree):
            seam = IntersectionSegment(aFaces[ai], normals[a][ai], bFaces[bi], normals[b][bi])
            if seam is None:
                continue
            segment = ContactSegment(*seam, radius)
            segments[a].append(segment)
            segments[b].append(segment)
    return segments


def ConcaveSegments(triangles, radius):
    # Weld split vertices for adjacency only. Each UV island is still sampled independently.
    _, vertexIds = np.unique(np.round(triangles.reshape(-1, 3), 6), axis=0, return_inverse=True)
    normals = FaceNormals(triangles)
    adjacent = {}
    for face, ids in enumerate(vertexIds.reshape(-1, 3)):
        for corner in range(3):
            edge = tuple(sorted((ids[corner], ids[(corner + 1) % 3])))
            adjacent.setdefault(edge, []).append((face, corner))
    threshold = radians(8.)
    thresholdCosine = cos(threshold)
    weightRange = radians(42.)
    segments = []
    for uses in adjacent.values():
        if len(uses) != 2:
            continue
        (left, i), (right, j) = uses
        start, end, wing = (triangles[left, (i + k) % 3] for k in range(3))
        angleCosine = float(normals[left] @ normals[right])
        if angleCosine >= thresholdCosine or np.linalg.norm(end - start) < 2e-5:
            continue
        otherWing = triangles[right, (j + 2) % 3]
        if normals[left] @ (otherWing - start) <= 1e-6 or normals[right] @ (wing - start) <= 1e-6:
            continue
        weight = min((acos(max(-1., angleCosine)) - threshold) / weightRange, 1.)
        segments.append(ContactSegment(start, end, radius, weight))
    return segments


def TraceContacts(points, strength, segments):
    for minimum, maximum, start, edge, lengthSquared, radius, weight in segments:
        nearby = np.all((points >= minimum) & (points <= maximum), axis=1)
        if not nearby.any():
            continue
        offset = points[nearby] - start
        along = np.clip((offset @ edge) / lengthSquared, 0., 1.)
        gap = np.linalg.norm(offset - along[:, None] * edge, axis=1)
        falloff = np.clip(1. - gap / radius, 0., 1.)
        shade = weight * falloff * falloff * (3. - 2. * falloff)
        strength[nearby] = np.maximum(strength[nearby], shade)


def ContactMask(proxy, meshes, attribute):
    positions, labels, parts = ContactParts(proxy, meshes, attribute)
    seams = ContactSegments(parts)
    recesses = {label: ConcaveSegments(triangles, min(radius, CONCAVE_EDGE_RADIUS))
                for label, _, _, radius, _, triangles in parts}
    uvs = UvValues(proxy.data.uv_layers[UV_NAME], len(proxy.data.loops)).reshape(-1, 3, 2)
    uvs = uvs * RESOLUTION - .5
    mask = np.zeros((RESOLUTION, RESOLUTION), dtype=np.float32)
    recess = np.zeros_like(mask)
    covered = np.zeros(mask.shape, dtype=bool)
    for triangle, uv, label in zip(positions, uvs, labels):
        sampled = RasterizeTriangle(uv)
        if sampled is None:
            continue
        rows, columns, barycentric = sampled
        covered[rows, columns] = True
        low, high = triangle.min(axis=0), triangle.max(axis=0)
        neighbors = [(minimum - radius, maximum + radius, radius, tree)
                     for part, minimum, maximum, radius, tree, _ in parts
                     if part != label and np.all(low <= maximum + radius) and np.all(high >= minimum - radius)]
        intersecting = [item for item in seams[label] if np.all(low <= item[1]) and np.all(high >= item[0])]
        concave = [item for item in recesses[label] if np.all(low <= item[1]) and np.all(high >= item[0])]
        if not neighbors and not intersecting and not concave:
            continue
        normal = Vector(np.cross(triangle[1] - triangle[0], triangle[2] - triangle[0])).normalized()
        points = barycentric @ triangle
        strength = np.zeros(len(points), dtype=np.float32)
        for minimum, maximum, radius, tree in neighbors:
            inside = np.all((points >= minimum) & (points <= maximum), axis=1)
            contact = SurfaceContact(points[inside], normal, radius, tree)
            strength[inside] = np.maximum(strength[inside], contact)
        TraceContacts(points, strength, intersecting)
        mask[rows, columns] = np.maximum(mask[rows, columns], strength)
        if concave:
            strength.fill(0.)
            TraceContacts(points, strength, concave)
            recess[rows, columns] = np.maximum(recess[rows, columns], strength)
    return ExtendContactMargin(mask, covered.copy()), ExtendContactMargin(recess, covered)


def CombineVisibility(assembly, crease, fineContact, contact, recess):
    broad = SmoothVisibility(np.clip(assembly, .26, 1.))
    # Soften the cutoff so light sampling noise on open faces cannot tint the metal.
    blocked = np.clip((.90 - SmoothVisibility(crease)) / .62, 0., 1.)
    contrast = blocked * blocked * (3. - 2. * blocked)
    gray = np.clip(broad * (1. - CREASE_STRENGTH * contrast), .10, 1.)
    enhancedCreases = float(((broad - gray) > .04).mean())
    shade = gray * (1. - CONTACT_BAND_STRENGTH * contact)
    shade = np.maximum(shade, .075)
    enhancedBands = float(((gray - shade) > .04).mean())
    # The shortest rays capture recessed steps on the same part as well as
    # neighboring parts. Require a blocked hemisphere before darkening a lip.
    near = SmoothVisibility(fineContact)
    blocked = np.clip((.92 - near) / .27, 0., 1.)
    contrast = blocked * blocked * (3. - 2. * blocked)
    fine = np.maximum(shade * (1. - FINE_CONTACT_STRENGTH * contrast), .075)

    # Keep the darkest part of each seam where a join or an inward fold blocks nearby light.
    localBlockage = np.clip((.985 - near) / .26, 0., 1.)
    contactCore = np.maximum(contact, recess)
    seam = (1. - (1. - contactCore) ** 3) ** .62 * (.30 + .70 * localBlockage)
    result = np.maximum(fine * (1. - SEAM_STRENGTH * seam), MIN_SEAM_VISIBILITY)
    enhancedFine = float(((shade - fine) > .04).mean())
    enhancedSeams = float(((fine - result) > .04).mean())
    return result, enhancedCreases, enhancedBands, enhancedFine, enhancedSeams


def BakeVisibility(proxy, directory, contact, recess):
    scene = bpy.context.scene
    image = bpy.data.images.new(IMAGE_NAME, width=RESOLUTION, height=RESOLUTION, alpha=False, float_buffer=True)
    image.colorspace_settings.name = "Non-Color"
    pixels = np.ones((RESOLUTION, RESOLUTION, 4), dtype=np.float32)
    image.pixels.foreach_set(pixels.ravel())
    material = BakeMaterial(image)
    proxy.data.materials.clear()
    proxy.data.materials.append(material)
    for face in proxy.data.polygons:
        face.material_index = 0
    engine = scene.render.engine
    cpu = (scene.cycles.device, scene.cycles.samples, scene.cycles.use_denoising,
           scene.render.threads_mode, scene.render.threads)
    hidden = {obj: obj.hide_render for obj in scene.objects if obj.type in {"MESH", "CURVE"}}
    try:
        for obj in hidden:
            obj.hide_render = obj != proxy
        scene.render.engine = "CYCLES"
        scene.cycles.device, scene.cycles.samples, scene.cycles.use_denoising = "CPU", 1, False
        scene.render.threads_mode = "FIXED"
        scene.render.threads = min(8, os.cpu_count() or 4)
        bpy.context.view_layer.update()
        print(f"Baking Type 30 assembly AO: {RESOLUTION}px, {len(proxy.data.polygons)} triangles", flush=True)
        bpy.ops.object.bake(type="EMIT", use_clear=False, margin=BAKE_MARGIN, margin_type="EXTEND", uv_layer=UV_NAME)
    finally:
        for obj, previous in hidden.items():
            obj.hide_render = previous
        scene.render.engine = engine
        (scene.cycles.device, scene.cycles.samples, scene.cycles.use_denoising,
         scene.render.threads_mode, scene.render.threads) = cpu
        bpy.data.materials.remove(material, do_unlink=True)
    image.pixels.foreach_get(pixels.ravel())
    if not np.isfinite(pixels).all() or float(pixels[..., 0].min()) > .93:
        raise RuntimeError("Type 30 AO bake contains no usable contact occlusion")
    gray, enhancedCreases, contactBands, fineContacts, deepSeams = CombineVisibility(
        pixels[..., 0], pixels[..., 1], pixels[..., 2], contact, recess)
    pixels[..., :3] = gray[..., None]
    image.pixels.foreach_set(pixels.ravel())
    image.update()
    target = directory / (IMAGE_NAME + ".png")
    image.filepath_raw = str(target)
    image.file_format = "PNG"
    image.save()
    image.pack()
    image["AssemblyAoSha256"] = sha256(target.read_bytes()).hexdigest()
    return image, {"minVisibility": float(gray.min()), "fractionBelow095": float((gray < .95).mean()),
                   "fractionBelow070": float((gray < .70).mean()), "fractionEnhancedCreases": enhancedCreases,
                   "fractionEnhancedContactBands": contactBands, "fractionEnhancedFineContacts": fineContacts,
                   "fractionEnhancedSeams": deepSeams}


def Bake(source, candidateSource, glb, directory, recordedDirectory, layoutDirectory=None):
    builder = runpy.run_path(str(FOLDER / "Script_Type30HmgBake.py"))
    geometry = runpy.run_path(str(FOLDER / "Script_NakajimaKi4GeometryAo.py"))
    bpy.ops.wm.open_mainfile(filepath=str(source))
    bpy.context.preferences.filepaths.save_version = 0
    directory.mkdir(parents=True, exist_ok=True)
    asset = bpy.data.collections[builder["ASSET"]]
    export = bpy.data.collections.new("Type30AoSampling")
    bpy.context.scene.collection.children.link(export)
    proxy = None
    try:
        meshes = builder["MakeExportMeshes"](asset, export, trackAoParts=True)
        if layoutDirectory is not None:
            ApplyLayout(meshes, layoutDirectory)
        proxy, loopMap = geometry["AoProxy"](meshes, "Type30AssemblyAoProxy", copyAo=layoutDirectory is not None)
        if layoutDirectory is not None:
            if layoutDirectory != directory:
                copyfile(layoutDirectory / LAYOUT_FILE, directory / LAYOUT_FILE)
            bpy.ops.object.select_all(action="DESELECT")
            proxy.select_set(True)
            bpy.context.view_layer.objects.active = proxy
        else:
            layer = Unwrap(proxy)
            used = UvValues(layer, len(loopMap)).reshape(-1, 2)
            if not np.isfinite(used).all() or used.min() < 0. or used.max() > 1.:
                raise ValueError("Type 30 AO layout lies outside the atlas")
            coordinates = {obj.name: np.empty((len(obj.data.loops), 2), np.float32) for obj in meshes}
            for index, (obj, loop) in enumerate(loopMap):
                coordinates[obj.name][loop] = used[index]
            np.savez_compressed(directory / LAYOUT_FILE, **{key: value.ravel() for key, value in coordinates.items()})
        print("Sampling narrow contacts between Type 30 prop parts", flush=True)
        contact, recess = ContactMask(proxy, meshes, builder["AO_PART_ATTRIBUTE"])
        _, metrics = BakeVisibility(proxy, directory, contact, recess)
        result = {"uv": UV_NAME, "resolution": [RESOLUTION, RESOLUTION],
                  "contactRadiusM": CONTACT_RADIUS, "assemblyRadiusM": ASSEMBLY_RADIUS,
                  "creaseRadiiM": list(CREASE_RADII), "creaseStrength": CREASE_STRENGTH,
                  "fineContactRadiiM": list(FINE_CONTACT_RADII), "fineContactStrength": FINE_CONTACT_STRENGTH,
                  "contactBandRadiusM": CONTACT_BAND_RADIUS, "contactBandStrength": CONTACT_BAND_STRENGTH,
                  "intersectionRadiusM": INTERSECTION_RADIUS,
                  "concaveEdgeRadiusM": CONCAVE_EDGE_RADIUS, "seamStrength": SEAM_STRENGTH,
                  "minSeamVisibility": MIN_SEAM_VISIBILITY,
                  "meshSignatures": {obj.name: MeshSignature(obj) for obj in meshes}, **metrics,
                  "imageSha256": sha256((directory / (IMAGE_NAME + ".png")).read_bytes()).hexdigest()}
        (directory / MANIFEST).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False), flush=True)
    finally:
        if proxy is not None:
            geometry["RemoveAoProxy"](proxy)
        builder["RemoveCollection"](export)
    PackIntoSource(asset, directory, recordedDirectory)
    bpy.ops.object.select_all(action="DESELECT")
    candidateSource.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(candidateSource), compress=True)
    builder["ExportGlb"](asset, glb, directory)


if __name__ == "__main__":
    arguments = sys.argv[sys.argv.index("--") + 1:]
    Bake(*(Path(value).resolve() for value in arguments))
