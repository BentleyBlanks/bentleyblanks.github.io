"""Polish the exposed bevels of the finished Type38 game asset."""
import argparse
import io
import json
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

from Script_Type38ExteriorFinish import ReadGlb
from Script_Type38RenderBatches import RoleMap
from Script_Type38Surface import Ramp, SaveType38Assets, SurfaceAtlas


def BevelMask(field, valid, wood, keepTopMatte):
    points, normals = field[:, :, :3], field[:, :, 3:6].copy()
    normals /= np.maximum(np.linalg.norm(normals, axis=2, keepdims=True), 1e-8)
    convex = np.zeros(valid.shape, dtype=np.float32)
    concave = np.zeros_like(convex)
    for first, second in ((np.s_[:, :-1], np.s_[:, 1:]), (np.s_[:-1, :], np.s_[1:, :])):
        step = points[second] - points[first]
        lengthSq = np.sum(step * step, axis=2)
        normalStep = normals[second] - normals[first]
        continuous = valid[first] & valid[second] & (lengthSq > 2e-10) & (lengthSq < 1.8e-5)
        continuous &= np.sum(normalStep * normalStep, axis=2) < 1.50
        # Outward-turning adjacent normals have positive projected slope.
        curvature = np.divide(np.sum(step * normalStep, axis=2), lengthSq,
                              out=np.zeros_like(lengthSq), where=continuous)
        for side in (first, second):
            np.maximum(convex[side], curvature, out=convex[side])
            np.maximum(concave[side], -curvature, out=concave[side])
    crest = Ramp(90, 390, convex) if wood else Ramp(155, 590, convex)
    facet = Ramp(.060, .30, field[:, :, 6]) * .87
    strength = np.maximum(crest, facet) * (1 - .88 * Ramp(105, 370, concave))
    if keepTopMatte:
        strength *= 1 - Ramp(.89, .993, np.abs(normals[:, :, 1]))
    distance, nearer = distance_transform_edt(~valid, return_indices=True)
    margin = (~valid) & (distance <= 5)
    strength[margin] = strength[nearer[0, margin], nearer[1, margin]]
    return cv2.GaussianBlur(strength, (0, 0), .56)


def BakeEdgeHighlights(repo, doc, views):
    roles = RoleMap(repo)
    charts = defaultdict(list)
    protected = defaultdict(list)

    def ImageIndex(info):
        return doc['textures'][info['index']]['source']

    def PixelData(index):
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
            info = anisotropy['anisotropyTexture']
            protected[ImageIndex(info)].append(info['extensions']['KHR_texture_transform'])
    for node in doc['nodes']:
        extra = node['extras']
        part = extra['SourceRanges'][0]['part'] if 'SourceRanges' in extra else extra['SourceObject']
        wood = roles.get(part) == 'Wood'
        primitive, = doc['meshes'][node['mesh']]['primitives']
        material = doc['materials'][primitive['material']]
        orm = material['pbrMetallicRoughness']['metallicRoughnessTexture']
        assert orm.get('texCoord', 0) == 0 and not orm.get('extensions')
        coatIndex = None
        if wood:
            coat = material['extensions']['KHR_materials_clearcoat']
            coatIndex = ImageIndex(coat['clearcoatTexture'])
            assert coatIndex == ImageIndex(coat['clearcoatRoughnessTexture'])
        charts[ImageIndex(orm)].append((primitive, wood, coatIndex, part))

    ormImages, coatImages = [], []
    for index, entries in charts.items():
        original = PixelData(index)
        pixels = original.copy()
        size = (pixels.shape[1], pixels.shape[0])
        ratio = min(1, 1024 / max(size))
        raster = tuple(round(axis * ratio) for axis in size)
        band = np.zeros(raster[::-1], dtype=np.float32)
        for primitive, wood, _, part in entries:
            field, _, valid = SurfaceAtlas(doc, views, primitive, raster, padding=0)
            strength = BevelMask(field, valid, wood, keepTopMatte=part=='Exterior_FoldedFrame12')
            np.maximum(band, strength, out=band)
        roughness, metalness = pixels[:, :, 1].astype('f'), pixels[:, :, 2].astype('f')
        ambient = pixels[:, :, 0].astype('f')
        band = cv2.resize(band, size, interpolation=cv2.INTER_LINEAR) * (roughness > 0)
        exposure = Ramp(110, 232, ambient)
        steel = band * exposure * Ramp(91, 173, metalness)
        roughCap = 61 + 194 * (1 - steel) ** 2.15
        metalFloor = 251 * Ramp(.41, .80, steel)
        pixels[:, :, 1] = np.rint(np.minimum(roughness, roughCap))
        pixels[:, :, 2] = np.rint(np.maximum(metalness, metalFloor))

        coatIndex = entries[0][2]
        if coatIndex is not None:
            timber = band * Ramp(81, 217, ambient) * (1 - Ramp(14, 62, metalness))
            woodCap = 86 + 169 * (1 - timber) ** 2.10
            pixels[:, :, 1] = np.rint(np.minimum(pixels[:, :, 1], woodCap))
            baseCoat = PixelData(coatIndex)
            coat = baseCoat.copy()
            if coat.shape[:2] != timber.shape:
                timber = cv2.resize(timber, (coat.shape[1], coat.shape[0]), interpolation=cv2.INTER_LINEAR)
            film = timber * (coat[:, :, 1] > 0) * Ramp(22, 84, coat[:, :, 0].astype('f'))
            coatFloor = 218 * Ramp(.28, .78, film)
            coatCap = 34 + 221 * (1 - film) ** 2.25
            coat[:, :, 0] = np.rint(np.maximum(coat[:, :, 0], coatFloor))
            coat[:, :, 1] = np.rint(np.minimum(coat[:, :, 1], coatCap))
            if not np.array_equal(coat, baseCoat):
                Store(coatIndex, coat)
            coatImages.append(coatIndex)

        for transform in protected[index]:
            offset = np.asarray(transform['offset'])
            left, top = np.maximum(0, np.floor(offset * size).astype(int) - 8)
            right, bottom = np.minimum(size, np.ceil((offset + transform['scale']) * size).astype(int) + 8)
            pixels[top:bottom, left:right] = original[top:bottom, left:right]
        if not np.array_equal(original, pixels):
            Store(index, pixels)
        if np.any(band >= .37):
            ormImages.append(index)
        print(doc['images'][index]['name'], int(np.count_nonzero(pixels[:, :, 1] != original[:, :, 1])), flush=True)

    doc['asset']['extras']['version'] = 'Type38_EdgeGlints27'
    return {'ormImages':sorted(ormImages), 'clearcoatImages':sorted(set(coatImages))}


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
    assert manifest.get('ambientOcclusion')
    manifest['edgeHighlights'] = BakeEdgeHighlights(repo, doc, views)
    SaveType38Assets(args.output, doc, views, manifest, lod, author=manifest['renderMeshes'] == manifest['parts'])
