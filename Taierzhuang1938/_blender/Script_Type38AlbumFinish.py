"""Match the visible game model to the assembled rifle in Badger's photo album."""
import argparse
import io
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, maximum_filter

from Script_Type38ExteriorFinish import ReadGlb
from Script_Type38RearFinish import BakeRearFinish
from Script_Type38SeatFit import STOCK, Unit
from Script_Type38Surface import Attribute, Ramp, RearOutline, SaveType38Assets, SurfaceAtlas
from Script_Type38TailProfile import COLLAR, COVER, DISK, NEARBY, CheckDiskClearance, Track, Transform


def Texture(doc, views, info):
    index = doc['textures'][info['index']]['source']
    with Image.open(io.BytesIO(views[doc['images'][index]['bufferView']])) as image:
        return index, np.array(image)


def StoreTexture(doc, views, index, pixels):
    entry = doc['images'][index]
    stream = io.BytesIO()
    Image.fromarray(pixels).save(stream, 'PNG', compress_level=6)
    views[entry['bufferView']] = stream.getvalue()
    entry['mimeType'] = 'image/png'


def Surface(doc, name):
    for node in doc['nodes']:
        extra = node['extras']
        span = next((row for row in extra.get('SourceRanges', []) if row['part'] == name), None)
        if extra['SourceObject'] != name and span is None:
            continue
        primitive, = doc['meshes'][node['mesh']]['primitives']
        indices = (span['indexStart'], span['indexCount']) if span else None
        return primitive, doc['materials'][primitive['material']], indices
    raise KeyError(name)


def Recess(side, up):
    distance = np.hypot((side + .59) / .38, (up - .77) / .32)
    return 1 - Ramp(.37, 1.04, distance)


def RingProfile(phase):
    nearCover = Ramp(.01, .055, phase) * (1 - Ramp(.12, .18, phase))
    coverSeam = Ramp(.11, .165, phase) * (1 - Ramp(.21, .29, phase))
    diskSeam = Ramp(.81, .88, phase) * (1 - Ramp(.94, .99, phase))
    return nearCover, np.maximum(coverSeam, diskSeam)


def ShapeAlbumTail(doc, views):
    disk = Track(doc, views, DISK)
    collar = Track(doc, views, COLLAR)
    primitive, _, _ = Surface(doc, DISK)
    uv = Attribute(doc, views, primitive['attributes']['TEXCOORD_0'], 2)[disk[0][2]]
    old = disk[1][0]
    center = old[np.argmin(np.sum((uv - [.408, .48])**2, axis=1)), :2]
    radius = .5 * np.ptp(old[:, 1])
    front = old[:, 2].min()
    depth = np.ptp(old[:, 2])
    cover = max(Track(doc, views, name)[1][0][:, 2].max() for name in COVER)
    collarCenter = (collar[1][0][:, :2].min(0) + collar[1][0][:, :2].max(0)) * .5

    def WarpDisk(points):
        result = points.copy()
        around = points[:, :2] - center
        side, up = (around / radius).T
        angle = np.arctan2(up, side)
        radial = np.hypot(side, up)
        phase = (points[:, 2] - front) / depth
        scoop = Recess(side, up)
        silhouette = (.21 * RearOutline(angle) * Ramp(.43, .94, radial)
                      + .093 * scoop * Ramp(.62, .94, radial) * Ramp(.30, .94, phase))
        result[:, :2] = center + around * (1 - silhouette[:, None])
        # The crescent on the photographed disk recedes into the outer shoulder.
        result[:, 2] -= depth * .188 * scoop * Ramp(.23, .96, phase)
        return result

    def WarpCollar(points):
        result = points.copy()
        around = points[:, :2] - collarCenter
        phase = (points[:, 2] - cover) / (front - cover)
        shoulder = Ramp(-.10, .13, phase) * (1 - Ramp(.18, .46, phase))
        tuck = Ramp(.55, .93, phase) * (1 - Ramp(.99, 1.16, phase))
        exterior = 1 - Ramp(.37, .77, -around[:, 1] / radius)
        scale = 1 + exterior * (.018 * shoulder - .014 * tuck)
        result[:, :2] = collarCenter + around * scale[:, None]
        return result

    moved = Transform(doc, views, disk, WarpDisk)
    Transform(doc, views, collar, WarpCollar)
    difference = (old[:, 2] - moved[:, 2]) / depth
    return {
        'shoulderDepthToDisk': float(difference.max()),
        'shoulderVertices': int(np.count_nonzero(difference > .065)),
        'diskClearanceSamples': CheckDiskClearance(doc, views, moved, disk[0][3]),
    }


def FacetedFace(doc, views, *, flaredRim=False):
    primitive, material, _ = Surface(doc, DISK)
    pbr = material['pbrMetallicRoughness']
    colorIndex, color = Texture(doc, views, pbr['baseColorTexture'])
    normalIndex, normal = Texture(doc, views, material['normalTexture'])
    ormIndex, orm = Texture(doc, views, material['occlusionTexture'])
    assert color.shape[:2] == normal.shape[:2] == orm.shape[:2]
    height, width = color.shape[:2]
    _, padded, _ = SurfaceAtlas(doc, views, primitive, (width, height), padding=7)
    u = (np.arange(width, dtype='f')[None, :] + .5) / width
    v = (np.arange(height, dtype='f')[:, None] + .5) / height
    x = (u - .408) / .29
    y = (.48 - v) / .40
    radius = np.hypot(x, y)
    angle = np.arctan2(y, x)
    if flaredRim:
        radius /= 1 + RearOutline(angle) * Ramp(.42, .93, radius)
    face = padded & (u < .742) & (radius < 1.16)
    weight = (Ramp(.191, .273, radius) * (1 - Ramp(.981, 1.10, radius)) * face).astype('f')
    scoop = np.zeros_like(radius) if flaredRim else Recess(x, y) * face
    diamonds = weight * (1 - Ramp(.06, .48, scoop))
    center = (1 - Ramp(.135, .215, radius)) * face

    # The lines fan out around the central circle. A sheared diamond gives each
    # tooth distinct planar sides under a moving highlight.
    rows = (np.sqrt(np.maximum(radius, .14)) - .46) * 16.2
    row = np.rint(rows)
    count = np.maximum(15, np.rint((.46 + row / 16.2)**2 * 73))
    rotation = angle * count / (2 * np.pi) + .5 * (row % 2)
    along = 2 * (rows - row)
    across = 2 * (rotation - np.rint(rotation))
    tooth = np.maximum(0, 1 - .94 * np.abs(along) - .93 * np.abs(across + .31 * along))
    tooth = np.minimum(tooth * 1.08, .96)
    relief = gaussian_filter(tooth * diamonds, .47)
    dv, du = np.gradient(relief)

    solid = gaussian_filter(face.astype('f'), 5.0)

    def LowPass(image):
        pixels = image.astype('f')
        blurred = cv2.GaussianBlur(pixels * face[..., None], (0, 0), 5.0)
        return blurred / np.maximum(solid[..., None], .025)

    base = LowPass(color[:, :, :3]) * [.971, .967, .953]
    base += (41 * relief)[..., None] * np.array([1.04, 1, .93])
    base *= (1 - .22 * scoop)[..., None]
    tintWeight = np.maximum(weight, scoop)
    if flaredRim:
        base += (15 * diamonds)[..., None] * np.array([1, .97, .91])
    rgb = color[:, :, :3] * (1 - tintWeight[..., None]) + base * tintWeight[..., None]
    centerShade = .21 if flaredRim else .30
    color[:, :, :3] = np.rint(np.clip(rgb * (1 - centerShade * center[..., None]), 0, 255))

    shading = LowPass(normal[:, :, :3]) / 127.5 - 1
    shading[:, :, 0] -= 2.68 * du
    shading[:, :, 1] += 2.68 * dv
    # Blend around chart padding and keep the existing frame of the central dome.
    active = tintWeight > .006
    mix = tintWeight[active, None]
    original = normal[active, :3].astype('f') / 127.5 - 1
    normal[active, :3] = np.rint((Unit(original * (1 - mix) + shading[active] * mix) + 1) * 127.5)
    coarseOrm = LowPass(orm[:, :, :3])
    rough = np.clip(coarseOrm[:, :, 1] - 2 - 38 * relief + 26 * scoop, 58, 197)
    roughness = orm[:, :, 1] * (1 - tintWeight) + rough * tintWeight + 15 * center
    orm[:, :, 1] = np.rint(np.clip(roughness, 0, 255))
    # Reuse the nearest open sample of each old cell as the local contact
    # level, then bake the narrow grooves of the new cells into that level.
    openFace = maximum_filter(orm[:, :, 0].astype('f'), size=9)
    groove = np.maximum(Ramp(.70, .96, np.abs(along)), Ramp(.72, .96, np.abs(across)))
    occlusion = openFace * (1 - .27 * groove)
    orm[:, :, 0] = np.rint(orm[:, :, 0] * (1 - diamonds) + occlusion * diamonds)

    for index, image in ((colorIndex, color), (normalIndex, normal), (ormIndex, orm)):
        StoreTexture(doc, views, index, image)
    return [colorIndex, normalIndex, ormIndex]


def CollarFinish(doc, views):
    primitive, material, _ = Surface(doc, COLLAR)
    pbr = material['pbrMetallicRoughness']
    colorIndex, color = Texture(doc, views, pbr['baseColorTexture'])
    ormIndex, orm = Texture(doc, views, material['occlusionTexture'])
    size = color.shape[:2][::-1]
    field, padded, _ = SurfaceAtlas(doc, views, primitive, size, padding=6)
    cover = max(Track(doc, views, name)[1][0][:, 2].max() for name in COVER)
    front = Track(doc, views, DISK)[1][0][:, 2].min()
    phase = (field[:, :, 2] - cover) / (front - cover)
    band = Ramp(-.10, .18, phase) * (1 - Ramp(.93, 1.10, phase)) * padded
    rim, groove = RingProfile(phase)
    shade = .19 * band + .22 * groove * padded
    rgb = color[:, :, :3].astype('f')
    rgb *= (1 - shade[..., None] * np.array([1, .93, .86], dtype='f'))
    color[:, :, :3] = np.rint(np.clip(rgb + (13 * rim * padded)[..., None], 0, 255))

    def Resize(layer):
        return cv2.resize(layer, orm.shape[:2][::-1], interpolation=cv2.INTER_LINEAR)

    orm[:, :, 0] = np.rint(orm[:, :, 0] * (1 - .18 * Resize(groove * padded)))
    roughness = orm[:, :, 1].astype('f') + Resize((16 * band - 22 * rim * padded))
    orm[:, :, 1] = np.rint(np.clip(roughness, 0, 255))
    StoreTexture(doc, views, colorIndex, color)
    StoreTexture(doc, views, ormIndex, orm)
    return [colorIndex, ormIndex]


def HeelInset(field, padded):
    side, up, length = np.moveaxis(field[:, :, :3], -1, 0)
    upper = Ramp(.36, .78, field[:, :, 4]) * Ramp(-.015, -.004, up) * padded
    side = side + .00038
    tip = np.maximum(0, .226 - length)
    outline = np.hypot(side / .0081, tip / .0087)
    steel = (1 - Ramp(.93, 1.018, outline)) * upper
    joint = np.exp(-((outline - .996) / .065)**2) * upper
    rim = Ramp(.79, .94, outline) * steel

    along = length - .2314
    radius = np.hypot(side, along)
    head = (1 - Ramp(.00310, .00354, radius)) * steel
    headEdge = np.exp(-((radius - .00354) / .00029)**2) * steel
    slotCross = side * .76 - along * .65
    slotAlong = side * .65 + along * .76
    slot = (1 - Ramp(.00037, .00075, np.abs(slotCross)))
    slot *= (1 - Ramp(.00235, .00332, np.abs(slotAlong))) * head
    return steel, joint, rim, head, headEdge, slot


def GrooveProfile(up, length):
    end = np.maximum(np.maximum(length + .264, -.444 - length), 0)
    return np.hypot(end / .010, (up - .0266) / .0075)


def BandScoop(up, length):
    distance = np.hypot((up - .0132) / .0069, (length + .6001) / .0091)
    return (1 - Ramp(.16, 1.03, distance)) * Ramp(-.607, -.6005, length)


def ShapeAlbumBody(doc, views):
    guardName = 'Exterior_Guard02'
    loopName = 'Exterior_RetainedImportedBody74'
    swivelName = 'Mesh_Type38_adsNear_3'
    stripName = 'T38_432_VisualExposedSlimStrip'

    def WarpWood(points):
        result = points.copy()
        side, up, length = points.T
        right = Ramp(.009, .017, side)
        groove = right * (1 - Ramp(.39, 1.18, GrooveProfile(up, length)))
        scoop = Ramp(.009, .017, -side) * BandScoop(up, length)
        result[:, 0] += -.00119 * groove + .00112 * scoop
        return result

    guardPoints = Track(doc, views, guardName)[1][0]
    guardLow, guardSpan = guardPoints[:, 1].min(), np.ptp(guardPoints[:, 1])
    guardCenter = (guardPoints[:, 2].min() + guardPoints[:, 2].max()) * .5
    guardHalf = .5 * np.ptp(guardPoints[:, 2])

    def WarpGuard(points):
        result = points.copy()
        along = (points[:, 2] - guardCenter) / guardHalf
        bottom = 1 - Ramp(.13, .73, (points[:, 1] - guardLow) / guardSpan)
        result[:, 1] += guardSpan * bottom * (.108 * along**2 - .063)
        return result

    loopPoints = Track(doc, views, loopName)[1][0]
    loopTop = loopPoints[:, 1].max()
    loopSpan = np.ptp(loopPoints[:, 1])
    pivot = loopPoints[loopPoints[:, 1] > loopTop - .12 * loopSpan].mean(axis=0)
    lower = loopPoints[loopPoints[:, 1] < loopTop - .55 * loopSpan][:, [0, 2]]
    _, axes = np.linalg.eigh(np.cov(lower.T))
    major = axes[:, -1] * np.sign(axes[0, -1])
    yaw = -.53 * np.arctan2(major[1], major[0])

    def WarpLoop(points):
        result = points.copy()
        side, _, length = (points - pivot).T
        pose = yaw * Ramp(.21, .67, (loopTop - points[:, 1]) / loopSpan)
        result[:, 0] = pivot[0] + side * np.cos(pose) - length * np.sin(pose)
        result[:, 2] = pivot[2] + side * np.sin(pose) + length * np.cos(pose)
        return result

    def SeatSwivel(points):
        result = points.copy()
        distance = -.02885 - .4031 * points[:, 2] - points[:, 1]
        close = Ramp(.0010, .0026, distance) * (1 - Ramp(.0052, .0088, distance))
        result[:, 1] += .00137 * close
        return result

    stripEnd = Track(doc, views, stripName)[1][0][:, 2].max()

    def SeatFrontTrim(points):
        result = points.copy()
        # The album's assembled front silhouette has a flush band and barrel.
        result[:, 2] = -.9005 + .115 * (points[:, 2] - stripEnd)
        return result

    for name, warp in ((STOCK, WarpWood), (guardName, WarpGuard), (loopName, WarpLoop),
                       (swivelName, SeatSwivel), (stripName, SeatFrontTrim)):
        # A packed mesh can contain more than one of these authored parts.
        Transform(doc, views, Track(doc, views, name), warp)


def StockFinish(doc, views):
    primitive, material, _ = Surface(doc, STOCK)
    pbr = material['pbrMetallicRoughness']
    colorIndex, color = Texture(doc, views, pbr['baseColorTexture'])
    normalIndex, normal = Texture(doc, views, material['normalTexture'])
    ormIndex, orm = Texture(doc, views, material['occlusionTexture'])
    coat = material['extensions']['KHR_materials_clearcoat']['clearcoatTexture']
    coatIndex, varnish = Texture(doc, views, coat)
    size = color.shape[:2][::-1]
    scale = min(1, 1536 / max(size))
    grid = tuple(round(dimension * scale) for dimension in size)
    field, padded, _ = SurfaceAtlas(doc, views, primitive, grid, padding=6)
    side, up, length = np.moveaxis(field[:, :, :3], -1, 0)
    end = Ramp(.075, .118, length) * padded
    visibleSide = Ramp(.17, .66, np.abs(field[:, :, 3]))
    line = -.0465 - .050 * (length - .16) + .00026 * np.sin(57 * length + 1.1)
    distance = up - line
    seam = np.exp(-((distance / .00079)**2)) * end * visibleSide
    toe = (1 - Ramp(-.0016, .0016, distance)) * end
    fibre = .5 + .5 * np.sin(4300 * (up + .11 * length + .008 * side)
                            + 2.3 * np.sin(length * 93))
    flank = Ramp(.29, .79, np.abs(field[:, :, 3])) * Ramp(.010, .016, np.abs(side)) * padded
    grooveRadius = GrooveProfile(up, length)
    groove = (1 - Ramp(.70, 1.20, grooveRadius)) * flank
    sheen = np.exp(-((grooveRadius - .766) / .27)**2) * groove
    scoop = BandScoop(up, length) * flank * Ramp(.003, .012, -side)

    def Fit(layer, image):
        return cv2.resize(layer, image.shape[:2][::-1], interpolation=cv2.INTER_LINEAR)

    shade = Fit(toe * (.105 + .036 * fibre) + .19 * seam + .18 * scoop, color)
    color[:, :, :3] = np.rint(color[:, :, :3] * (1 - shade[..., None] * [.9, 1.04, 1.10]))
    handled = Fit(.30 * groove + .24 * sheen, color)[..., None]
    timber = np.array([143, 82, 35], dtype='f') + Fit((fibre - .5) * 12, color)[..., None]
    color[:, :, :3] = np.rint(color[:, :, :3] * (1 - handled) + timber * handled)
    occlusion = Fit(seam, orm)
    orm[:, :, 0] = np.rint(orm[:, :, 0] * (1 - .21 * occlusion))
    orm[:, :, 0] = np.rint(orm[:, :, 0] * (1 - .19 * Fit(scoop, orm)))
    orm[:, :, 1] = np.rint(np.clip(orm[:, :, 1] + Fit(16 * toe + 36 * seam + 19 * scoop - 10 * sheen, orm), 0, 255))
    varnish[:, :, 0] = np.rint(varnish[:, :, 0] * (1 - Fit(.12 * toe + .39 * seam, varnish)))
    varnish[:, :, 1] = np.rint(np.clip(varnish[:, :, 1] + Fit(12 * toe + 29 * seam - 19 * sheen, varnish), 0, 255))

    steel, joint, rim, head, headEdge, slot = HeelInset(field, padded)
    oxide = 3.8 * np.sin(side * 2415 + .4 * np.sin(length * 817)) + 5.0 * np.cos(length * 481 + side * 399)
    hue = Fit(oxide + 24 * rim + 13 * head - 43 * slot - 19 * headEdge, color)
    metal = Fit(steel, color)[..., None]
    tint = np.array([69, 67, 62], dtype='f') + hue[..., None]
    color[:, :, :3] = np.rint(np.clip(color[:, :, :3] * (1 - metal) + tint * metal, 0, 255))
    color[:, :, :3] = np.rint(color[:, :, :3] * (1 - .17 * Fit(joint, color)[..., None]))
    metalOrm = Fit(steel, orm)
    finish = Fit(152 - 46 * rim - 46 * head + 29 * slot, orm)
    orm[:, :, 0] = np.rint(orm[:, :, 0] * (1 - Fit(.21 * joint + .18 * headEdge + .36 * slot, orm)))
    orm[:, :, 1] = np.rint(orm[:, :, 1] * (1 - metalOrm) + finish * metalOrm)
    orm[:, :, 2] = np.rint(orm[:, :, 2] * (1 - metalOrm) + 239 * metalOrm)
    varnish[:, :, 0] = np.rint(varnish[:, :, 0] * (1 - Fit(steel, varnish)))

    relief = (-.45 * seam + .068 * fibre * toe + .21 * steel - .12 * rim + .16 * head - .42 * slot
              - .66 * scoop - .21 * groove)
    height = gaussian_filter(Fit(relief, normal), .58)
    dv, du = np.gradient(height)
    active = np.abs(du) + np.abs(dv) > .001
    vectors = normal[active, :3].astype('f') / 127.5 - 1
    vectors[:, 0] -= .82 * du[active]
    vectors[:, 1] += .82 * dv[active]
    normal[active, :3] = np.rint((Unit(vectors) + 1) * 127.5)
    for index, image in ((colorIndex, color), (normalIndex, normal), (ormIndex, orm), (coatIndex, varnish)):
        StoreTexture(doc, views, index, image)
    return [colorIndex, normalIndex, ormIndex, coatIndex]


def SightFinish(doc, views):
    primitive, material, indices = Surface(doc, 'SightDetail335_CentralVisibleBacking_ART_ASSUMED_DEPTH')
    pbr = material['pbrMetallicRoughness']
    colorIndex, color = Texture(doc, views, pbr['baseColorTexture'])
    ormIndex, orm = Texture(doc, views, material['occlusionTexture'])
    size = color.shape[:2][::-1]
    field, padded, _ = SurfaceAtlas(doc, views, primitive, size, padding=4, indexSpan=indices)
    distance = np.abs((field[:, :, 0] + .0003) / .0095)
    strip = (1 - Ramp(.46, .62, distance)) * padded
    seam = np.exp(-((distance - .603) / .087)**2) * padded
    grain = .53 * np.sin(6830 * field[:, :, 0]) + .47 * np.cos(1810 * field[:, :, 2])
    target = np.array([47, 46, 43], dtype='f') + (39 * strip + 4 * grain - 10 * seam)[..., None]
    rgb = color[:, :, :3].astype('f')
    color[:, :, :3] = np.rint(np.clip(rgb + .91 * padded[..., None] * (target - rgb), 0, 255))

    def Fit(layer):
        return cv2.resize(layer.astype('f'), orm.shape[:2][::-1], interpolation=cv2.INTER_LINEAR)

    coverage = Fit(padded)
    roughness = Fit(155 - 30 * strip + 8 * grain)
    orm[:, :, 0] = np.rint(orm[:, :, 0] * (1 - .22 * Fit(seam)))
    orm[:, :, 1] = np.rint(orm[:, :, 1] * (1 - coverage) + roughness * coverage)
    StoreTexture(doc, views, colorIndex, color)
    StoreTexture(doc, views, ormIndex, orm)
    return [colorIndex, ormIndex]


def HeelPlateFinish(doc, views):
    primitive, material, indices = Surface(doc, 'Exterior_ButtCap04')
    pbr = material['pbrMetallicRoughness']
    colorIndex, color = Texture(doc, views, pbr['baseColorTexture'])
    ormIndex, orm = Texture(doc, views, material['occlusionTexture'])
    size = color.shape[:2][::-1]
    scale = min(1, 2048 / max(size))
    grid = tuple(round(dimension * scale) for dimension in size)
    field, padded, _ = SurfaceAtlas(doc, views, primitive, grid, padding=3, indexSpan=indices)
    side, up = field[:, :, 0], field[:, :, 1] + .0960
    facing = Ramp(.36, .84, field[:, :, 5]) * padded
    radius = np.hypot(side + .00035, up)
    head = (1 - Ramp(.00376, .00439, radius)) * facing
    lip = np.exp(-((radius - .00440) / .00038)**2) * facing
    slotCross = up * .97 - side * .243
    slot = head * (1 - Ramp(.00027, .00062, np.abs(slotCross)))
    slot *= 1 - Ramp(.00314, .00405, radius)

    def Fit(layer, image):
        return cv2.resize(layer, image.shape[:2][::-1], interpolation=cv2.INTER_LINEAR)

    wear = .52 + .48 * np.sin(3311 * side + 1177 * up) * np.cos(2751 * up - 839 * side)
    rolledEdge = Ramp(.08, .54, 1 - np.clip(field[:, :, 5], 0, 1)) * padded
    rolledEdge *= Ramp(.23, .67, np.abs(field[:, :, 3])) * Ramp(-.013, -.005, field[:, :, 2] - .248)
    light = 39 * head + 14 * lip + 11 * facing * wear + (8 + 23 * wear) * rolledEdge
    dark = .45 * slot + .19 * lip
    rgb = color[:, :, :3].astype('f') + Fit(light, color)[..., None]
    color[:, :, :3] = np.rint(np.clip(rgb * (1 - Fit(dark, color)[..., None]), 0, 255))
    orm[:, :, 0] = np.rint(orm[:, :, 0] * (1 - Fit(.27 * slot + .19 * lip, orm)))
    roughness = orm[:, :, 1].astype('f') + Fit(23 * wear * facing - 31 * head + 32 * slot - 32 * rolledEdge, orm)
    orm[:, :, 1] = np.rint(np.clip(roughness, 0, 255))
    StoreTexture(doc, views, colorIndex, color)
    StoreTexture(doc, views, ormIndex, orm)
    return [colorIndex, ormIndex]


def ContactWear(doc, views, part, contrast):
    primitive, material, indices = Surface(doc, part)
    colorIndex, color = Texture(doc, views, material['pbrMetallicRoughness']['baseColorTexture'])
    ormIndex, orm = Texture(doc, views, material['occlusionTexture'])
    size = color.shape[:2][::-1]
    scale = min(1, 1536 / max(size))
    grid = tuple(round(dimension * scale) for dimension in size)
    field, padded, _ = SurfaceAtlas(doc, views, primitive, grid, padding=3, indexSpan=indices)
    side, up, length = np.moveaxis(field[:, :, :3], -1, 0)
    if part == 'Mesh_Type38_adsNear_3':
        polished = Ramp(.11, .62, field[:, :, 6]) * Ramp(.15, .75, -field[:, :, 4])
        polished *= Ramp(-.073, -.061, up)
    else:
        polished = Ramp(.053, .075, side) * Ramp(.09, .67, np.abs(field[:, :, 3]))
    grain = .81 + .13 * np.sin(3620 * up + .76 * np.sin(913 * length)) + .06 * np.cos(8101 * length)
    polished *= contrast * grain * padded

    bright = cv2.resize(polished, size, interpolation=cv2.INTER_LINEAR)
    color[:, :, :3] = np.rint(np.clip(color[:, :, :3] + bright[..., None] * [23, 21, 17], 0, 255))
    change = cv2.resize(polished, orm.shape[:2][::-1], interpolation=cv2.INTER_LINEAR)
    orm[:, :, 1] = np.rint(np.clip(orm[:, :, 1] - 28 * change, 0, 255))
    StoreTexture(doc, views, colorIndex, color)
    StoreTexture(doc, views, ormIndex, orm)
    return [colorIndex, ormIndex]


def BakeAlbumBody(doc, views):
    images = StockFinish(doc, views)
    images += SightFinish(doc, views) + HeelPlateFinish(doc, views)
    images += ContactWear(doc, views, 'Mesh_Type38_adsNear_3', .86)
    images += ContactWear(doc, views, 'Exterior_HandleOval08', .81)
    return images


def FinishAlbumExterior(repo, doc, views):
    evidence = ShapeAlbumTail(doc, views)
    ShapeAlbumBody(doc, views)
    ao = BakeRearFinish(repo, doc, views, polishMetal=False, partsFilter=set(COVER) | NEARBY | {DISK, COLLAR})
    images = FacetedFace(doc, views) + CollarFinish(doc, views) + BakeAlbumBody(doc, views)
    evidence.update(contactImages=ao['images'], images=sorted(set(images)))
    doc['asset']['extras']['version'] = 'Type38_PhotoAlbum33'
    print('Album exterior', evidence, flush=True)
    return evidence


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    doc, views, digest = ReadGlb((args.input / 'Model_Type38_511.glb').read_bytes())
    manifest = json.loads((args.input / 'Data_Type38_511.json').read_text(encoding='utf8'))
    lod = json.loads((args.input / 'Data_Type38NpcLod.json').read_text(encoding='utf8'))
    assert digest == manifest['runtimeSha256'] == lod['sourceSha256']
    assert doc['asset']['extras']['version'] == 'Type38_FullTail32'
    manifest['albumExterior'] = FinishAlbumExterior(repo, doc, views)
    SaveType38Assets(args.output, doc, views, manifest, lod, author=manifest['renderMeshes'] == manifest['parts'])
