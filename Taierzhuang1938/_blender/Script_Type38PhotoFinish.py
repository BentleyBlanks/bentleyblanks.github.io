"""Shape and shade the photographed exterior of the Type38 game prop."""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np

from Script_Type38AlbumFinish import BakeAlbumBody, FacetedFace, ShapeAlbumBody, Surface, Texture, StoreTexture
from Script_Type38EdgeHighlights import BevelMask
from Script_Type38ExteriorFinish import ReadGlb
from Script_Type38RearFinish import BakeRearFinish
from Script_Type38SeatFit import PLATE, STOCK, Part, Store, Unit
from Script_Type38Surface import Attribute, Ramp, RearEdgeWear, RearOutline, SaveType38Assets, SurfaceAtlas
from Script_Type38TailProfile import COLLAR, COVER, DISK, NEARBY, CheckDiskClearance, Track, Transform


CROWN = 'Wood_UpperFittedCrown05'
HANDLE = 'Exterior_HandleOval08'
SIDE_BLOCK = 'T38_433E_VisibleSideBlockRimInset'
FRONT_BAND = 'T38_407F_VisualSkin_Exterior_FrontBandBody78'
MIDDLE_BAND = 'Exterior_MiddleBand57'
GUARD = 'Exterior_Guard02'
SIGHT = 'Exterior_FoldedFrame12'
HEEL = 'Exterior_ButtCap04'
FAIR_PARTS = {
    STOCK: .00025,
    GUARD: .00014,
    SIDE_BLOCK: .00016,
    'T38_407F_VisualSkin_Exterior_FrontBandLowerStep78': .00009,
    COVER[0]: .00012,
    COVER[1]: .00012,
}


def ShapePhotoRear(doc, views):
    entry = Track(doc, views, DISK)
    points = entry[1][0]
    primitive, _, _ = Surface(doc, DISK)
    uv = Attribute(doc, views, primitive['attributes']['TEXCOORD_0'], 2)[entry[0][2]]
    center = points[np.argmin(np.sum((uv - [.408, .48])**2, axis=1)), :2]
    radius = .5 * np.ptp(points[:, 1])
    front = points[:, 2].min()
    depth = np.ptp(points[:, 2])

    def Warp(vertices):
        moved = vertices.copy()
        around = vertices[:, :2] - center
        angle = np.arctan2(around[:, 1], around[:, 0])
        rim = Ramp(.44, .92, np.linalg.norm(around, axis=1) / radius)
        face = Ramp(.31, .93, (vertices[:, 2] - front) / depth)
        # The photographed rear perimeter has one outward crescent. Support it
        # through the rolled shoulder so it does not read like a flat sticker.
        scale = 1 + .54 * RearOutline(angle) * rim * face
        moved[:, :2] = center + around * scale[:, None]
        return moved

    moved = Transform(doc, views, entry, Warp)
    return {
        'lobeReach': float((center[0] - moved[:, 0].min()) / radius),
        'sidewallToFace': float(np.ptp(moved[:, 2]) / np.ptp(moved[:, 1])),
        'diskClearanceSamples': CheckDiskClearance(doc, views, moved, entry[0][3]),
    }


def ExposedCurve(part, points, normals):
    x, y, z = points.T
    side = Ramp(.24, .72, np.abs(normals[:, 0]))
    if part == STOCK:
        wrist = Ramp(-.064, -.026, z) * (1 - Ramp(.134, .220, z))
        fore = Ramp(-.889, -.851, z) * (1 - Ramp(-.264, -.237, z))
        hoop = Ramp(.013, .037, np.abs(z + .605))
        return side * np.maximum(wrist, fore * hoop)
    if part in COVER:
        return side * Ramp(.003, .011, np.abs(x)) * Ramp(-.169, -.146, z)
    if part == GUARD:
        return Ramp(.004, .009, np.abs(x)) * (1 - Ramp(-.016, -.008, y))
    return side


def FairPart(doc, views, part, maximum):
    lowerStep = part == 'T38_407F_VisualSkin_Exterior_FrontBandLowerStep78'
    entry = Part(doc, views, part, allowTranslation=lowerStep)
    points, normals, tangents = (channel[entry[2]] for channel in entry[1])
    translation = None
    if lowerStep:
        node = next((node for node in doc['nodes'] if node['extras']['SourceObject'] == part), {})
        if 'translation' in node:
            # Match the baked coordinates of the packed mesh before welding.
            translation = np.asarray(node['translation'], dtype='f')
            points = points + translation
    triangles = entry[3]
    _, first, weld = np.unique(points.round(7), axis=0, return_index=True, return_inverse=True)
    corners = points[first]
    faces = weld[triangles]
    pairs, owners = np.unique(np.sort(np.stack((faces, np.roll(faces, -1, axis=1)), axis=-1).reshape(-1, 2), axis=1),
                              axis=0, return_counts=True)
    a, b = pairs.T
    delta = corners[b] - corners[a]
    length = np.linalg.norm(delta, axis=1)
    connected = (owners == 2) & (length > .00008) & (length < .0094)
    inverse = np.divide(1, np.maximum(length, .00008)) * connected
    step = np.zeros_like(corners)
    total = np.zeros(len(corners), dtype='f')
    frame = np.zeros_like(corners)
    np.add.at(frame, weld, normals)
    frame = Unit(frame)
    np.add.at(step, a, delta * inverse[:, None])
    np.add.at(step, b, -delta * inverse[:, None])
    np.add.at(total, a, inverse)
    np.add.at(total, b, inverse)
    step /= np.maximum(total, 1)[:, None]
    depth = -(step * frame).sum(1)
    low, high = (.000008, .00014) if part == STOCK else (.000012, .00024)
    rounded = Ramp(low, high, depth) * ExposedCurve(part, corners, frame)
    # Move only the convex sample inward. Pin the chart's open edge and the
    # broad seating surfaces so the band and wood still meet.
    boundary = np.unique(pairs[owners == 1])
    rounded[boundary] = 0
    move = -frame * (np.minimum(maximum, np.maximum(0, depth) * .38) * rounded)[:, None]
    def FaceNormal(values):
        tri = values[triangles]
        return np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])

    before = FaceNormal(points)
    valid = np.linalg.norm(before, axis=1) > 1e-11
    for _ in range(5):
        moved = points + move[weld]
        after = FaceNormal(moved)
        folded = valid & (np.sum(before * after, axis=1) <= 0)
        if not folded.any():
            break
        move[np.unique(faces[folded])] *= .22
    else:
        raise ValueError(f'{part} has a flipped bevel face')
    shift = np.zeros_like(corners)
    count = np.zeros(len(corners), dtype='f')
    for corner in faces.T:
        np.add.at(shift, corner, Unit(after) - Unit(before))
        np.add.at(count, corner, 1)
    smooth = Unit(normals + (shift / np.maximum(count, 1)[:, None])[weld])
    forward = Unit(tangents[:, :3] - smooth * np.sum(tangents[:, :3] * smooth, axis=1, keepdims=True))
    local = moved if translation is None else moved - translation
    Store(doc, views, entry, (local, smooth, np.column_stack((forward, tangents[:, 3]))))
    return int(np.count_nonzero(np.linalg.norm(move, axis=1) > .000004))


def RollHandguard(doc, views):
    entry = Track(doc, views, CROWN)

    def Warp(points):
        moved = points.copy()
        side, up, length = points.T
        # The long side is a loft between the two dense end profiles.
        span = Ramp(-.6276, -.6250, length) * (1 - Ramp(-.3669, -.3634, length))
        shoulder = Ramp(.037, .044, up) * (1 - Ramp(.051, .055, up))
        moved[:, 0] *= 1 - .038 * span * shoulder * Ramp(.006, .014, np.abs(side))
        return moved

    moved = Transform(doc, views, entry, Warp)
    return int(np.count_nonzero(np.linalg.norm(moved - entry[1][0], axis=1) > .000004))


def RestoreAnisotropy(doc, index, original, edited):
    size = np.array(original.shape[:2][::-1])
    for material in doc['materials']:
        info = material.get('extensions', {}).get('KHR_materials_anisotropy', {}).get('anisotropyTexture')
        if not info or doc['textures'][info['index']]['source'] != index:
            continue
        transform = info['extensions']['KHR_texture_transform']
        offset = np.asarray(transform['offset'])
        left, top = np.maximum(0, np.floor(offset * size).astype(int) - 8)
        right, bottom = np.minimum(size, np.ceil((offset + transform['scale']) * size).astype(int) + 8)
        edited[top:bottom, left:right] = original[top:bottom, left:right]


def FinishBevel(doc, views, part):
    primitive, material, indices = Surface(doc, part)
    colorIndex, color = Texture(doc, views, material['pbrMetallicRoughness']['baseColorTexture'])
    ormIndex, orm = Texture(doc, views, material['occlusionTexture'])
    wood = part in (STOCK, CROWN)
    size = np.array(orm.shape[:2][::-1])
    raster = tuple(np.rint(size * min(1, 1200 / max(size))).astype(int))
    field, _, valid = SurfaceAtlas(doc, views, primitive, raster, padding=0, indexSpan=indices)
    wave = BevelMask(field, valid, wood, keepTopMatte=part == SIGHT)
    lobe = RearEdgeWear(part, field, raster[0])
    side, up, length, normalSide, normalUp, normalLength, bend = np.moveaxis(field, -1, 0)
    if part in COVER:
        lip = Ramp(-.0757, -.0687, length) * (.30 + .70 * Ramp(.10, .68, normalLength))
        lip *= Ramp(.036, .056, up)
        lobe = np.maximum(lobe, lip)
    if part == HANDLE:
        stem = Ramp(.018, .027, side) * (1 - Ramp(.042, .056, side))
        head = Ramp(.044, .058, side) * (1 - Ramp(.070, .079, side))
        stemWear = .83 * stem * Ramp(.22, .76, np.abs(normalUp))
        headWear = .44 * head * Ramp(.32, .88, np.abs(normalUp) + .28 * np.abs(normalSide))
        lobe = np.maximum(lobe, np.maximum(stemWear, headWear))
    if part == COLLAR:
        shoulder = np.exp(-((length + .0657) / .0026)**2) * Ramp(.038, .055, up)
        lip = np.maximum(.77 * shoulder, .72 * Ramp(.17, .60, bend))
        lobe = np.maximum(lobe, lip)
    if part == HEEL:
        flank = Ramp(.26, .71, np.abs(normalSide)) * Ramp(.19, .54, 1 - np.abs(normalLength))
        lobe = np.maximum(lobe, flank * Ramp(.232, .247, length))
    wave = np.maximum(.77 * wave, .89 * lobe * valid)

    def Fit(data, image):
        return cv2.resize(data, image.shape[:2][::-1], interpolation=cv2.INTER_LINEAR)

    strength = Fit(wave, orm) * Ramp(101, 224, orm[:, :, 0].astype('f')) * (orm[:, :, 1] > 0)
    oldOrm = orm.copy()
    images = []
    if wood:
        coat = material['extensions']['KHR_materials_clearcoat']['clearcoatTexture']
        index, lacquer = Texture(doc, views, coat)
        film = Fit(strength * (1 - Ramp(14, 90, orm[:, :, 2].astype('f'))), lacquer)
        original = lacquer.copy()
        lacquer[:, :, 0] = np.rint(lacquer[:, :, 0] + film * np.maximum(0, 220 - lacquer[:, :, 0].astype('f')) * .46)
        lacquer[:, :, 1] = np.rint(lacquer[:, :, 1] - film * np.maximum(0, lacquer[:, :, 1].astype('f') - 46) * .70)
        if not np.array_equal(lacquer, original):
            StoreTexture(doc, views, index, lacquer)
            images.append(index)
    else:
        strength *= Ramp(120, 213, orm[:, :, 2].astype('f'))
        roughness = orm[:, :, 1].astype('f')
        floor = 98 if part in (HANDLE, COLLAR) else 72
        orm[:, :, 1] = np.rint(roughness - strength * np.maximum(0, roughness - floor) * .76)
        rgb = color[:, :, :3].astype('f')
        tint = [57, 58, 56] if part in COVER else [30, 30, 28]
        if part in (*COVER, COLLAR, SIDE_BLOCK, HANDLE, PLATE, HEEL):
            color[:, :, :3] = np.rint(np.minimum(255, rgb + Fit(strength, color)[..., None] * tint))
            StoreTexture(doc, views, colorIndex, color)
            images.append(colorIndex)
    RestoreAnisotropy(doc, ormIndex, oldOrm, orm)
    if not np.array_equal(orm, oldOrm):
        StoreTexture(doc, views, ormIndex, orm)
        images.append(ormIndex)
    return images


def FinishPhotoAppearance(repo, doc, views):
    profile = ShapePhotoRear(doc, views)
    ShapeAlbumBody(doc, views)
    rounded = {part: FairPart(doc, views, part, cap) for part, cap in FAIR_PARTS.items()}
    rounded[CROWN] = RollHandguard(doc, views)
    aoParts = set(COVER) | NEARBY | {DISK, COLLAR}
    ao = BakeRearFinish(repo, doc, views, polishMetal=False, partsFilter=aoParts)
    images = FacetedFace(doc, views, flaredRim=True) + BakeAlbumBody(doc, views)
    album = {'images': sorted(set(images)), 'contactImages': ao['images']}
    for part in (STOCK, CROWN, FRONT_BAND, MIDDLE_BAND, GUARD, SIGHT, *COVER, COLLAR, SIDE_BLOCK, HANDLE, PLATE, HEEL):
        images += FinishBevel(doc, views, part)
    profile.update(rounded=rounded, images=sorted(set(images)), contactImages=ao['images'])
    doc['asset']['extras']['version'] = 'Type38_PhotoFinish34'
    print('Photo finish', profile, flush=True)
    return album, profile


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
    manifest['albumExterior'], manifest['photoFinish'] = FinishPhotoAppearance(repo, doc, views)
    SaveType38Assets(args.output, doc, views, manifest, lod, author=manifest['renderMeshes'] == manifest['parts'])
