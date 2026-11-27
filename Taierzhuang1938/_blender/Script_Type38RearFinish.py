"""Offline contact AO and bevel finish for the visible rear of the Type38 game asset."""
import argparse
import io
import json
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter

from Script_Type38AmbientOcclusion import OcclusionScene, TraceOcclusion, WoodCavity
from Script_Type38EdgeHighlights import BevelMask
from Script_Type38ExteriorFinish import ReadGlb
from Script_Type38Surface import Ramp, RearEdgeWear, SaveType38Assets, SurfaceAtlas, WoodUseDents


SAMPLES = 144
ATLAS_LIMIT = 1536
DISK = 'T38_440D2_IndependentVisibleRecess'
STOCK = 'T38_460G_WoodGroove_VisualCandidate'
COVER = {'T38_430B_IndependentLeftCoverSkin', 'T38_430B_RetainedRightCoverHalf'}
RIM_NORMAL_PARTS = COVER | {DISK, 'T38_433E_VisibleSideBlockRimInset', 'T38_435F2_IndependentTailNeckExterior'}
REAR_PARTS = COVER | {
    DISK, STOCK, 'T38_430B_ContinuousLowerFacing_VisualOnly', 'T38_433E_VisibleSideBlockRimInset',
    'T38_435F2_IndependentTailNeckExterior', 'T38_435F2_VisualBackingRearEnd',
    'Exterior_HandleOval08', 'Exterior_SeatedTang05',
}


def RearCoverage(part, position):
    side, up, length = np.moveaxis(position, 2, 0)
    if part == STOCK:
        return Ramp(-.26, -.191, length) * (1 - Ramp(-.042, .035, length)) * Ramp(.005, .024, up)
    if part in COVER:
        lowerLip = Ramp(-.254, -.213, length) * (1 - Ramp(.038, .049, up))
        return np.maximum(lowerLip, Ramp(-.145, -.103, length))
    if part == 'Exterior_HandleOval08':
        return 1 - Ramp(.035, .052, np.abs(side))
    if part == 'T38_430B_ContinuousLowerFacing_VisualOnly':
        return Ramp(-.219, -.168, length)
    return np.ones(side.shape, dtype=np.float32)


def KnurlCavity(normalMap):
    channels = normalMap[:, :, :3].astype(np.float32) - 127.5
    depth = np.maximum(channels[:, :, 2], 62)
    slopeU, slopeV = -channels[:, :, 0] / depth, channels[:, :, 1] / depth
    valleys = gaussian_filter(slopeU, 1.32, order=(0, 1)) + gaussian_filter(slopeV, 1.32, order=(1, 0))
    return .33 * Ramp(.008, .074, valleys)


def BakeRearFinish(repo, doc, views, *, polishMetal=True, partsFilter=REAR_PARTS):
    scene, geometryGroups, subjects = OcclusionScene(repo, doc, views)
    charts = defaultdict(list)
    reserved = defaultdict(list)
    parts = set()
    normalMasks = {}

    def SourceImage(info):
        return doc['textures'][info['index']]['source']

    def Pixels(index):
        with Image.open(io.BytesIO(views[doc['images'][index]['bufferView']])) as image:
            return np.array(image)

    def Store(index, pixels):
        stream = io.BytesIO()
        Image.fromarray(pixels).save(stream, 'PNG', compress_level=6)
        entry = doc['images'][index]
        views[entry['bufferView']] = stream.getvalue()
        entry['mimeType'] = 'image/png'

    for material in doc['materials']:
        anisotropy = material.get('extensions', {}).get('KHR_materials_anisotropy', {})
        if 'anisotropyTexture' in anisotropy:
            slot = anisotropy['anisotropyTexture']
            reserved[SourceImage(slot)].append(slot['extensions']['KHR_texture_transform'])
    for node, primitive, part, rotation, location, group, _, _ in subjects:
        material = doc['materials'][primitive['material']]
        index = SourceImage(material['occlusionTexture'])
        slices = [(row['part'], (row['indexStart'], row['indexCount']))
                  for row in node['extras'].get('SourceRanges', [])] or [(part, None)]
        for name, span in slices:
            if name in partsFilter:
                charts[index].append((name, span, primitive, material, rotation, location, group))

    for index, entries in charts.items():
        image = doc['images'][index]
        original = Pixels(index)
        pixels = original.copy()
        size = (pixels.shape[1], pixels.shape[0])
        ratio = min(1, ATLAS_LIMIT / max(size))
        grid = tuple(max(1, round(length * ratio)) for length in size)
        weights = np.zeros(grid[::-1], dtype=np.float32)
        visibility = np.ones_like(weights)
        bevel = np.zeros_like(weights)
        dents = np.zeros_like(weights)
        knurl = np.zeros_like(weights)
        materialLayer = None
        chartNormal = {}
        for part, span, primitive, material, rotation, location, group in entries:
            field, _, valid = SurfaceAtlas(doc, views, primitive, grid, padding=0, indexSpan=span, faceDirections=True)
            world = field[:, :, :3] @ rotation.T + location
            weight = RearCoverage(part, world) * valid
            active = weight > .015
            if not active.any():
                continue
            shading = field[active, 3:6] @ rotation.T
            faces = field[active, 7:] @ rotation.T
            ao = np.ones_like(weights)
            ao[active] = TraceOcclusion(scene, world[active], shading, geometryGroups, group,
                                        sampleCount=SAMPLES, distanceLimit=.020,
                                        bias=.00014, faceDirections=faces)
            if part == STOCK:
                dent, broken, _ = WoodUseDents(*field[active, :4].T, 0, False)
                dents[active] = .61 * dent + .17 * broken
                materialLayer = ('wood', SourceImage(material['normalTexture']))
            if part == DISK:
                knurl[active] = Ramp(.47, .88, field[active, 5])
                materialLayer = ('knurl', SourceImage(material['normalTexture']))
            polished = np.zeros_like(weights)
            if polishMetal and part != STOCK:
                bent = BevelMask(field[:, :, :7], valid, False, False)
                rim = RearEdgeWear(part, field[:, :, :7], grid[0])
                polished = np.maximum(.78 * bent, .98 * rim) * weight
                if part == DISK:
                    # The separate chamfer chart follows the metal around its side.
                    polished *= Ramp(.736, .750, (np.arange(grid[0]) + .5) / grid[0])[None, :]

            distance, near = distance_transform_edt(~active, return_indices=True)
            margin = (~valid) & (distance <= 5)
            for data in (weight, ao, polished, dents, knurl):
                data[margin] = data[near[0, margin], near[1, margin]]
            overlap = weight > weights
            visibility[overlap] = ao[overlap]
            weights[overlap] = weight[overlap]
            np.maximum(bevel, polished, out=bevel)
            if polishMetal and part in RIM_NORMAL_PARTS and 'normalTexture' in material:
                normal = SourceImage(material['normalTexture'])
                mask = chartNormal.setdefault(normal, np.zeros_like(weights))
                np.maximum(mask, polished, out=mask)
            parts.add(part)

        def Upsample(data):
            return cv2.resize(data, size, interpolation=cv2.INTER_LINEAR)

        filtered = cv2.GaussianBlur(visibility * weights, (0, 0), .54)
        extent = cv2.GaussianBlur(weights, (0, 0), .54)
        filtered = np.divide(filtered, extent, out=np.ones_like(filtered), where=extent > .0001)
        newAo = Upsample(filtered)
        if materialLayer is not None:
            layer, normal = materialLayer
            normalMap = Pixels(normal)
            if layer == 'wood':
                newAo *= WoodCavity(normalMap, original, Upsample(dents))
            else:
                newAo *= 1 - Upsample(knurl) * KnurlCavity(normalMap)
        blend = Upsample(weights) * .91
        oldAo = original[:, :, 0].astype('f') / 255
        occlusion = np.clip(oldAo + blend * (newAo - oldAo), .05, 1)
        pixels[:, :, 0] = np.where(blend > .003, np.rint(occlusion * 255), original[:, :, 0])
        if polishMetal:
            steel = Ramp(110, 181, original[:, :, 2].astype('f'))
            shine = Upsample(bevel) * steel * Ramp(.24, .78, occlusion)
            roughCap = 64 + 191 * (1 - shine) ** 2.38
            metalFloor = 248 * Ramp(.39, .82, shine)
            pixels[:, :, 1] = np.rint(np.minimum(original[:, :, 1], roughCap))
            pixels[:, :, 2] = np.rint(np.maximum(original[:, :, 2], metalFloor))
        for transform in reserved[index]:
            offset = np.asarray(transform['offset'])
            left, top = np.maximum(0, np.floor(offset * size).astype(int) - 8)
            right, bottom = np.minimum(size, np.ceil((offset + transform['scale']) * size).astype(int) + 8)
            pixels[top:bottom, left:right] = original[top:bottom, left:right]
        Store(index, pixels)
        for normal, mask in chartNormal.items():
            slope = Upsample(mask) * Ramp(.22, .76, occlusion)
            normalMap = Pixels(normal)
            dimensions = normalMap.shape[:2][::-1]
            if dimensions != size:
                slope = cv2.resize(slope, dimensions, interpolation=cv2.INTER_LINEAR)
            target = normalMasks.setdefault(normal, np.zeros_like(slope))
            np.maximum(target, slope, out=target)
        print(image['name'], int(np.count_nonzero(pixels[:, :, 0] != original[:, :, 0])), flush=True)
    for index, strength in normalMasks.items():
        pixels = Pixels(index)
        active = strength > .025
        vectors = pixels[active, :3].astype('f') / 127.5 - 1
        # Keep the authored brushed surface and soften its micro-normal amplitude
        # along the burnished curve so the highlight runs continuously.
        vectors[:, :2] *= (1 - .56 * strength[active, None])
        vectors /= np.maximum(np.linalg.norm(vectors, axis=1, keepdims=True), 1e-8)
        pixels[active, :3] = np.rint((vectors + 1) * 127.5)
        Store(index, pixels)
    doc['asset']['extras']['version'] = 'Type38_RearContact28'
    return {'samples':SAMPLES, 'atlasLimit':ATLAS_LIMIT, 'images':sorted(charts),
            'normalImages':sorted(normalMasks), 'parts':sorted(parts)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    doc, views, digest = ReadGlb((args.input/'Model_Type38_511.glb').read_bytes())
    manifest = json.loads((args.input/'Data_Type38_511.json').read_text(encoding='utf8'))
    lod = json.loads((args.input/'Data_Type38NpcLod.json').read_text(encoding='utf8'))
    assert digest == manifest['runtimeSha256'] == lod['sourceSha256']
    assert manifest.get('edgeHighlights')
    manifest['rearContact'] = BakeRearFinish(repo, doc, views)
    SaveType38Assets(args.output, doc, views, manifest, lod, author=manifest['renderMeshes'] == manifest['parts'])
