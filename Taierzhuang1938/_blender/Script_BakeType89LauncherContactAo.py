"""Bake the assembled game prop's local contact occlusion into its steel UV0 atlas."""

from hashlib import sha256
import json
from math import ceil, cos, floor, pi, sin, sqrt
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


EDGE = 1024
GOLDEN_ANGLE = pi * (3 - sqrt(5))
# Distances are fractions of the authored prop's visual span. The gentler
# falloff retains the sides of shallow seams as well as their bottoms.
SEAM_PROFILE = dict(rays=64, nearFraction=.022, farFraction=.043,
                    nearWeight=.72, nearFalloff=.60, farFalloff=1.)
CALIBRATION_PROFILE = dict(rays=40, nearFraction=.016, farFraction=.036,
                           nearWeight=.76, nearFalloff=2., farFalloff=2.)


def Digest(path):
    return sha256(path.read_bytes()).hexdigest()


def ReadSurface(collection):
    vertices, triangles, textureCoordinates = [], [], []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in collection.objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            uv = mesh.uv_layers.get("SteelAtlas")
            if uv is None:
                raise ValueError(f"Missing authored steel UVs on {obj.name}")
            offset = len(vertices)
            vertices.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
            triangles.extend(tuple(offset + key for key in face.vertices) for face in mesh.loop_triangles)
            textureCoordinates.extend([tuple(uv.data[loop].uv) for loop in face.loops] for face in mesh.loop_triangles)
        finally:
            evaluated.to_mesh_clear()
    return vertices, triangles, np.asarray(textureCoordinates)


def TexelSamples(uv):
    pixel = uv * [EDGE, -EDGE] + [0, EDGE]
    left, top = [max(0, ceil(value - .5)) for value in pixel.min(axis=0)]
    right, bottom = [min(EDGE, floor(value + .5)) for value in pixel.max(axis=0) + 1e-8]
    if left >= right or top >= bottom:
        return None
    a, b, c = pixel
    first, second = b - a, c - a
    determinant = first[0] * second[1] - first[1] * second[0]
    if abs(determinant) < 1e-8:
        return None
    x, y = np.meshgrid(np.arange(left, right) + .5 - a[0], np.arange(top, bottom) + .5 - a[1])
    along = (x * second[1] - y * second[0]) / determinant
    across = (first[0] * y - first[1] * x) / determinant
    weights = np.stack([1 - along - across, along, across], axis=-1)
    included = np.min(weights, axis=-1) >= -1e-7
    if not included.any():
        return None
    rows, columns = np.nonzero(included)
    return rows + top, columns + left, weights[included]


def Hemisphere(normal, rays):
    axis = Vector((0, 0, 1)) if abs(normal.z) < .9 else Vector((0, 1, 0))
    tangent = axis.cross(normal).normalized()
    bitangent = normal.cross(tangent)
    for sample in range(rays):
        radius = sqrt((sample + .5) / rays)
        angle = sample * GOLDEN_ANGLE
        yield tangent * (radius * cos(angle)) + bitangent * (radius * sin(angle)) + normal * sqrt(1 - radius**2)


def BakeVisibility(vertices, triangles, uvs, *, rays, nearFraction, farFraction,
                   nearWeight, nearFalloff, farFalloff):
    tree = BVHTree.FromPolygons(vertices, triangles, all_triangles=True)
    points = np.asarray([tuple(vertex) for vertex in vertices])
    length = float(np.ptp(points, axis=0).max())
    near, far = nearFraction * length, farFraction * length
    farWeight = 1. - nearWeight
    offset = 4e-5 * length
    baked = np.zeros((EDGE, EDGE), dtype=np.float32)
    coverage = np.zeros(baked.shape, dtype=np.uint16)
    for indices, uv in zip(triangles, uvs):
        sample = TexelSamples(uv)
        if sample is None:
            continue
        rows, columns, weights = sample
        a, b, c = (vertices[i] for i in indices)
        normal = (b - a).cross(c - a).normalized()
        directions = tuple(Hemisphere(normal, rays))
        origins = weights @ points[list(indices)] + np.asarray(tuple(normal * offset))
        visibility = np.ones(len(origins), dtype=np.float32)
        for i, position in enumerate(origins):
            point = Vector(position)
            blocked = 0.
            for direction in directions:
                _, _, _, distance = tree.ray_cast(point, direction, far)
                if distance is not None:
                    tight = max(0., 1. - distance / near)
                    broad = max(0., 1. - distance / far)
                    blocked += nearWeight * tight**nearFalloff + farWeight * broad**farFalloff
            visibility[i] = 1. - blocked / rays
        # Repeated UVs cannot store each owner's shadow. Keep the least occluded
        # owner so a buried face cannot paint a dark mark on an exposed surface.
        baked[rows, columns] = np.maximum(baked[rows, columns], visibility)
        coverage[rows, columns] += 1
    return baked, coverage


def PadChart(field, filled, padding):
    # Extend from actual sampled surfaces into the atlas gutters. Separate
    # rectangular charts must never borrow one another's occlusion.
    field, filled = field.copy(), filled.copy()
    for _ in range(padding):
        neighbours = np.pad(field * filled, 1)
        valid = np.pad(filled, 1)
        sides = (np.s_[:-2, 1:-1], np.s_[2:, 1:-1], np.s_[1:-1, :-2], np.s_[1:-1, 2:])
        count = sum(valid[side].astype(np.uint8) for side in sides)
        extend = ~filled & (count > 0)
        totals = sum(neighbours[side] for side in sides)
        field[extend] = totals[extend] / count[extend]
        filled[extend] = True
    return np.where(filled, field, 1.)


def ComposeCharts(baked, coverage, layout):
    plate = np.ones(baked.shape, dtype=np.float32)
    diagnostics = {}
    ratio = EDGE / layout["size"]
    padding = round(layout["padding"] * ratio)
    for name, bounds in layout["regions"].items():
        x, y, width, height = (round(value * ratio) for value in bounds)
        chart = np.s_[y:y + height, x:x + width]
        sampled = coverage[chart] > 0
        if not sampled.any():
            continue
        field = baked[chart]
        plate[chart] = PadChart(field, sampled, padding)
        diagnostics[name] = {"samples": int(sampled.sum()), "overlap": int((coverage[chart] > 1).sum()),
                             "contact": int(np.count_nonzero(sampled & (field < .94))),
                             "visibilityP05": round(float(np.quantile(field[sampled], .05)), 4)}
    return np.rint(255 * np.clip(plate, 0, 1)).astype(np.uint8), diagnostics


def SavePlate(pixels, path):
    image = bpy.data.images.new(path.stem, width=EDGE, height=EDGE, alpha=False)
    try:
        image.colorspace_settings.name = "Non-Color"
        rgba = np.ones((EDGE, EDGE, 4), dtype=np.float32)
        rgba[..., :3] = pixels[::-1, :, None] / 255.
        image.pixels.foreach_set(rgba.ravel())
        image.filepath_raw = str(path)
        image.file_format = "PNG"
        image.save()
    finally:
        bpy.data.images.remove(image)


def Main(output=None, *, calibration=False):
    project = Path(__file__).resolve().parents[1]
    output = Path(output) if output is not None else project / "_import/Source/Type89Launcher"
    output.mkdir(parents=True, exist_ok=True)
    profile = CALIBRATION_PROFILE if calibration else SEAM_PROFILE
    suffix = "ContactAo" if calibration else "SeamAo"
    model = project / "Model/Model_Type89Launcher.tzm.json"
    layoutFile = project / "_blender/Data_Type89LauncherSteelAtlas.json"
    collection = bpy.data.collections.get("Type89LauncherExterior")
    if collection is None or collection.name not in bpy.context.scene.collection.children:
        raise ValueError("Open the authored Type89Launcher scene before baking contact occlusion")
    vertices, triangles, uvs = ReadSurface(collection)
    modelInfo = json.loads(model.read_bytes())
    if len(triangles) != modelInfo["triangles"] or len(triangles) > 10000:
        raise ValueError("Contact bake geometry does not match the game mesh triangle budget")
    layout = json.loads(layoutFile.read_bytes())
    pixels, charts = ComposeCharts(*BakeVisibility(vertices, triangles, uvs, **profile), layout)
    image = output / f"Texture_Type89Launcher{suffix}.png"
    SavePlate(pixels, image)
    record = {"file": image.name, "sha256": Digest(image), "pixelSha256": sha256(pixels.tobytes()).hexdigest(),
              "modelSha256": Digest(model), "atlasSha256": Digest(layoutFile), "size": EDGE,
              "triangles": len(triangles), "rays": profile["rays"], "charts": charts}
    if not calibration:
        record["falloff"] = {key: value for key, value in profile.items() if key != "rays"}
    (output / f"Data_Type89Launcher{suffix}.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    total = sum(chart["contact"] for chart in charts.values())
    print(f"Baked {EDGE}² contact AO with {total:,} shaded surface texels and {len(triangles):,} triangles")


if __name__ == "__main__":
    Main()
