"""Bake local contact occlusion from the assembled game prop."""

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
JOINT_PROFILE = dict(rays=96, nearFraction=.023, farFraction=.043,
                     nearWeight=.80, nearFalloff=.44, farFalloff=.90)
# The higher sampling density resolves contacts that cross a small part of a texel.
# Keep the ray reach short so this pass follows adjoining edges and recesses.
DETAIL_PROFILE = dict(rays=48, nearFraction=.007, farFraction=.015,
                      nearWeight=.78, nearFalloff=.30, farFalloff=.85)


def Digest(path):
    return sha256(path.read_bytes()).hexdigest()


def ReadSurface(collection, uvLayer="SteelAtlas"):
    vertices, triangles, textureCoordinates = [], [], []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in collection.objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            uv = mesh.uv_layers.get(uvLayer)
            if uv is None:
                raise ValueError(f"Missing {uvLayer} UVs on {obj.name}")
            offset = len(vertices)
            vertices.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
            triangles.extend(tuple(offset + key for key in face.vertices) for face in mesh.loop_triangles)
            textureCoordinates.extend([tuple(uv.data[loop].uv) for loop in face.loops] for face in mesh.loop_triangles)
        finally:
            evaluated.to_mesh_clear()
    return vertices, triangles, np.asarray(textureCoordinates)


def TexelSamples(uv, edge=EDGE):
    pixel = uv * [edge, -edge] + [0, edge]
    left, top = [max(0, ceil(value - .5)) for value in pixel.min(axis=0)]
    right, bottom = [min(edge, floor(value + .5)) for value in pixel.max(axis=0) + 1e-8]
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
                   nearWeight, nearFalloff, farFalloff, composite=None, edge=EDGE):
    tree = BVHTree.FromPolygons(vertices, triangles, all_triangles=True)
    points = np.asarray([tuple(vertex) for vertex in vertices])
    length = float(np.ptp(points, axis=0).max())
    near, far = nearFraction * length, farFraction * length
    farWeight = 1. - nearWeight
    offset = 4e-5 * length
    baked = np.zeros((edge, edge), dtype=np.float32)
    coverage = np.zeros(baked.shape, dtype=np.uint16)
    for face, (indices, uv) in enumerate(zip(triangles, uvs)):
        sample = TexelSamples(uv, edge)
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
        if composite is not None:
            visibility = composite(face, weights, visibility)
        # Repeated UVs cannot store each owner's shadow. Keep the least occluded
        # owner so a buried face cannot paint a dark mark on an exposed surface.
        baked[rows, columns] = np.maximum(baked[rows, columns], visibility)
        coverage[rows, columns] += 1
    return baked, coverage


def ResolveSupersamples(baked, coverage, scale):
    shape = (EDGE, scale, EDGE, scale)
    blocks = coverage.reshape(shape)
    area = (blocks > 0).sum(axis=(1, 3))
    total = baked.reshape(shape).sum(axis=(1, 3))
    # Average covered subsamples before padding each chart. Gutter samples carry no visibility.
    np.divide(total, area, out=total, where=area > 0)
    return total, blocks.max(axis=(1, 3))


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


def LoadRedPlate(path):
    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        if tuple(image.size) != (EDGE, EDGE):
            raise ValueError(f"Expected a {EDGE} × {EDGE} plate: {path}")
        image.colorspace_settings.name = "Non-Color"
        rgba = np.empty(EDGE * EDGE * 4, dtype=np.float32)
        image.pixels.foreach_get(rgba)
        return np.rint(rgba.reshape(EDGE, EDGE, 4)[::-1, :, 0] * 255).astype(np.uint8)
    finally:
        bpy.data.images.remove(image)


def SamplePlate(pixels, uv):
    xy = np.clip(uv * [EDGE, -EDGE] + [-.5, EDGE - .5], 0, EDGE - 1)
    x0, y0 = xy.astype(int).T
    x1, y1 = np.minimum(x0 + 1, EDGE - 1), np.minimum(y0 + 1, EDGE - 1)
    fu, fv = (xy - np.stack((x0, y0), axis=1)).T
    top = pixels[y0, x0] * (1 - fu) + pixels[y0, x1] * fu
    bottom = pixels[y1, x0] * (1 - fu) + pixels[y1, x1] * fu
    return (top * (1 - fv) + bottom * fv) / 255


def Main(output=None, *, calibration=False, legacyOrm=None, contactDetail=False):
    project = Path(__file__).resolve().parents[1]
    output = Path(output) if output is not None else project / "_import/Source/Type89Launcher"
    output.mkdir(parents=True, exist_ok=True)
    joint = legacyOrm is not None
    if sum((joint, calibration, contactDetail)) > 1:
        raise ValueError("Choose one contact bake mode")
    profile = JOINT_PROFILE if joint else CALIBRATION_PROFILE if calibration else SEAM_PROFILE
    suffix = "JointAo" if joint else "ContactAo" if calibration else "SeamAo"
    if contactDetail:
        profile, suffix = DETAIL_PROFILE, "ContactDetailAo"
    model = project / "Model/Model_Type89Launcher.tzm.json"
    hasContactUvs = joint or contactDetail
    atlasName = "Contact" if hasContactUvs else "Steel"
    layoutFile = project / f"_blender/Data_Type89Launcher{atlasName}Atlas.json"
    collection = bpy.data.collections.get("Type89LauncherExterior")
    if collection is None or collection.name not in bpy.context.scene.collection.children:
        raise ValueError("Open the authored Type89Launcher scene before baking contact occlusion")
    vertices, triangles, uvs = ReadSurface(collection, "ContactAo" if hasContactUvs else "SteelAtlas")
    modelInfo = json.loads(model.read_bytes())
    if len(triangles) != modelInfo["triangles"] or len(triangles) > 10000:
        raise ValueError("Contact bake geometry does not match the game mesh triangle budget")
    layoutBytes = layoutFile.read_bytes().replace(b"\r\n", b"\n")
    layout = json.loads(layoutBytes)
    composite = None
    provenance = {}
    if joint:
        source = project / "_import/Source/Type89Launcher"
        prior = LoadRedPlate(legacyOrm)
        oldGeometry = np.minimum(LoadRedPlate(source / "Texture_Type89LauncherContactAo.png"),
                                 LoadRedPlate(source / "Texture_Type89LauncherSeamAo.png"))
        _, _, steelUvs = ReadSurface(collection)

        def BlendDetail(face, weights, visibility):
            uv = weights @ steelUvs[face]
            # Retain the photographed micro-occlusion and the original deep seams.
            # Where the separated surface is more enclosed, apply its local visibility.
            old = SamplePlate(oldGeometry, uv)
            contact = visibility * (.80 + .20 * visibility)
            ratio = np.minimum(1., (contact + 1 / 255) / (old + 1 / 255))
            return SamplePlate(prior, uv) * ratio

        composite = BlendDetail
        provenance["legacyRedSha256"] = sha256(prior.tobytes()).hexdigest()
    sampleScale = 2 if contactDetail else 1
    baked = BakeVisibility(vertices, triangles, uvs, **profile, composite=composite, edge=EDGE * sampleScale)
    if contactDetail:
        baked = ResolveSupersamples(*baked, sampleScale)
        provenance["subsamplesPerTexel"] = sampleScale ** 2
    pixels, charts = ComposeCharts(*baked, layout)
    image = output / f"Texture_Type89Launcher{suffix}.png"
    SavePlate(pixels, image)
    record = {"file": image.name, "sha256": Digest(image), "pixelSha256": sha256(pixels.tobytes()).hexdigest(),
              "modelSha256": Digest(model), "atlasSha256": sha256(layoutBytes).hexdigest(), "size": EDGE,
              "triangles": len(triangles), "rays": profile["rays"], "charts": charts, **provenance}
    if not calibration:
        record["falloff"] = {key: value for key, value in profile.items() if key != "rays"}
    (output / f"Data_Type89Launcher{suffix}.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    total = sum(chart["contact"] for chart in charts.values())
    print(f"Baked {EDGE}² contact AO with {total:,} shaded surface texels and {len(triangles):,} triangles")


if __name__ == "__main__":
    Main()
