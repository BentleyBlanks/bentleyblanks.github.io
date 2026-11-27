"""Bake short-range ambient occlusion from the assembled game mesh into ORM red."""
import argparse
import io
import json
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter
from scipy.spatial.transform import Rotation

from Script_Type38ExteriorFinish import ReadGlb
from Script_Type38RenderBatches import RoleMap
from Script_Type38Surface import Attribute, Ramp, SaveType38Assets, SurfaceAtlas, WoodUseDents


RAY_COUNT = 48
RAY_DISTANCE = .022
RAY_BIAS = .00035
MOVING_ROLES = {'Bolt', 'Cover', 'Trigger'}


def Normalize(vectors):
    return vectors / np.maximum(np.linalg.norm(vectors, axis=-1, keepdims=True), 1e-8)


def TraceOcclusion(scene, points, normals, geometryGroups, group, *, sampleCount=RAY_COUNT,
                   distanceLimit=RAY_DISTANCE, bias=RAY_BIAS, faceDirections=None):
    result = np.empty(len(points), dtype=np.float32)
    rng = np.random.default_rng(7529)
    samples = (np.arange(sampleCount, dtype=np.float32) + .5) / sampleCount
    radial, axial = np.sqrt(samples), np.sqrt(1 - samples)
    azimuth = np.arange(sampleCount, dtype=np.float32) * 2.39996323
    for start in range(0, len(points), 3072):
        stop = min(start + 3072, len(points))
        normal = Normalize(normals[start:stop])
        support = normal if faceDirections is None else Normalize(faceDirections[start:stop])
        origin = points[start:stop] + support * bias
        reference = np.zeros_like(normal)
        reference[:, 2] = 1
        reference[np.abs(normal[:, 2]) > .9] = [0, 1, 0]
        xAxis = Normalize(np.cross(reference, normal))
        yAxis = np.cross(normal, xAxis)
        angle = azimuth + rng.random((len(normal), 1), dtype=np.float32) * (2 * np.pi)
        directions = (xAxis[:, None] * (radial * np.cos(angle))[:, :, None]
                      + yAxis[:, None] * (radial * np.sin(angle))[:, :, None]
                      + normal[:, None] * axial[None, :, None])
        starts = np.repeat(origin, sampleCount, axis=0)
        hit = scene.run(starts, directions.reshape(-1, 3),
                        dists=np.full(len(starts), distanceLimit, dtype=np.float32), output=1)
        groupHit = geometryGroups[hit['geomID']]
        distance = hit['tfar']
        close = np.maximum(0, 1 - distance / (.46 * distanceLimit))
        falloff = .61 * close + .39 * np.maximum(0, 1 - distance / distanceLimit)
        # Keep contact shading through the resting joints. Attenuate its reach
        # between moving assemblies so their cast shadow does not follow a map.
        crossMotion = (groupHit != group) & ((groupHit != 0) | (group != 0))
        attenuation = np.where(crossMotion, .78 * close, 1)
        blocked = (falloff * attenuation * (hit['geomID'] >= 0)).reshape(-1, sampleCount)
        if faceDirections is None:
            exposure = blocked.mean(axis=1)
        else:
            # The interpolated normal steers the hemisphere. The face normal
            # rejects directions that would start underneath the shading face.
            above = np.einsum('ijk,ik->ij', directions, support) > 0
            exposure = (above * blocked).sum(axis=1) / np.maximum(1, above.sum(axis=1))
        result[start:stop] = np.clip(1 - 2.50 * exposure, .08, 1)
    return result


def WoodCavity(normalMap, orm, dents):
    # The wood normals encode (-heightU, +heightV, 1). Positive
    # divergence of the reconstructed height gradients selects valleys.
    normals = normalMap[:, :, :3].astype(np.float32) - 127.5
    depth = np.maximum(normals[:, :, 2], 64)
    slopeU, slopeV = -normals[:, :, 0] / depth, normals[:, :, 1] / depth
    fine = gaussian_filter(slopeU, 1.05, order=(0, 1)) + gaussian_filter(slopeV, 1.05, order=(1, 0))
    broad = gaussian_filter(slopeU, 2.65, order=(0, 1)) + gaussian_filter(slopeV, 2.65, order=(1, 0))
    pore = Ramp(.006, .062, np.maximum(.78 * fine, broad))
    roughness = orm[:, :, 1].astype(np.float32)
    metalness = orm[:, :, 2].astype(np.float32)
    finish = .70 + .30 * Ramp(72, 151, roughness)
    timber = (1 - Ramp(14, 62, metalness)) * (roughness > 0)
    return 1 - timber * np.minimum(.70, dents + .40 * pore * finish)


def OcclusionScene(repo, doc, views):
    from embreex.mesh_construction import TriangleMesh
    from embreex.rtcore_scene import EmbreeScene

    roles = RoleMap(repo)
    motionIds = {role:index for index,role in enumerate(sorted(MOVING_ROLES), start=1)}
    scene = EmbreeScene()
    geometryGroups = []
    subjects = []
    for node in doc['nodes']:
        primitive, = doc['meshes'][node['mesh']]['primitives']
        attrs = primitive['attributes']
        indices = Attribute(doc, views, primitive['indices'], 3).astype(np.int32)
        vertices = Attribute(doc, views, attrs['POSITION'], 3)
        rotation = Rotation.from_quat(node['rotation']).as_matrix().astype('f') if 'rotation' in node else np.eye(3, dtype='f')
        location = np.asarray(node.get('translation', [0, 0, 0]), dtype='f')
        extra = node['extras']
        sourcePart = extra['SourceRanges'][0]['part'] if 'SourceRanges' in extra else extra['SourceObject']
        role = roles.get(sourcePart)
        group = motionIds.get(role, 0)
        geometry = TriangleMesh(scene, vertices @ rotation.T + location, indices)
        geometryGroups.append(group)
        # Hold the mesh beside its subject for the lifetime of the scene.
        subjects.append((node, primitive, sourcePart, rotation, location, group, role == 'Wood', geometry))
    return scene, np.array(geometryGroups + [0], dtype=np.uint8), subjects


def BakeContactOcclusion(repo, doc, views):
    scene, geometryGroups, subjects = OcclusionScene(repo, doc, views)
    charts = defaultdict(list)
    for _, primitive, sourcePart, rotation, location, group, wood, _ in subjects:
        material = doc['materials'][primitive['material']]
        orm = material['pbrMetallicRoughness']['metallicRoughnessTexture']
        assert orm.get('texCoord', 0) == 0 and not orm.get('extensions')
        image = doc['textures'][orm['index']]['source']
        material['occlusionTexture'] = {**orm, 'strength': 1}
        charts[image].append((sourcePart, primitive, rotation, location, group, wood))

    # The GLB also keeps a separate anisotropy chart in a corner of one ORM
    # image. It is addressed through a texture transform and retains its RGB.
    reserved = defaultdict(list)
    for material in doc['materials']:
        anisotropy = material.get('extensions', {}).get('KHR_materials_anisotropy', {})
        if 'anisotropyTexture' in anisotropy:
            slot = anisotropy['anisotropyTexture']
            image = doc['textures'][slot['index']]['source']
            if image in charts:
                reserved[image].append(slot['extensions']['KHR_texture_transform'])

    cavityImages = []
    for imageIndex, parts in charts.items():
        image = doc['images'][imageIndex]
        view = image['bufferView']
        with Image.open(io.BytesIO(views[view])) as source:
            pixels = np.array(source)
        height, width = pixels.shape[:2]
        size = (width, height)
        limit = 1024 if any(part in (
            'Exterior_FoldedFrame12', 'T38_460G_WoodGroove_VisualCandidate') for part, *_ in parts) else 768
        ratio = min(1, limit / max(size))
        small = tuple(max(1, round(length * ratio)) for length in size)
        atlas = np.ones(small[::-1], dtype=np.float32)
        dentAtlas = None
        normalImage = None
        for part, primitive, rotation, location, group, wood in parts:
            field, _, valid = SurfaceAtlas(doc, views, primitive, small, padding=0)
            points = field[valid, :3] @ rotation.T + location
            normals = field[valid, 3:6] @ rotation.T
            ao = np.ones_like(atlas)
            ao[valid] = TraceOcclusion(scene, points, normals, geometryGroups, group)
            distance, near = distance_transform_edt(~valid, return_indices=True)
            edge = (~valid) & (distance <= 5)
            ao[edge] = ao[near[0, edge], near[1, edge]]
            ao = cv2.GaussianBlur(ao, (0, 0), .68)
            np.minimum(atlas, ao, out=atlas)
            if wood:
                side, up, length, normalSide = field[valid, :4].T
                dent, broken, _ = WoodUseDents(side, up, length, normalSide, 0,
                                              part == 'Wood_UpperFittedCrown05')
                dentAtlas = np.zeros_like(atlas)
                dentAtlas[valid] = .61 * dent + .17 * broken
                dentAtlas[edge] = dentAtlas[near[0, edge], near[1, edge]]
                material = doc['materials'][primitive['material']]
                normalSlot = material['normalTexture']['index']
                normalImage = doc['images'][doc['textures'][normalSlot]['source']]
        surface = cv2.resize(atlas, size, interpolation=cv2.INTER_LINEAR)
        if normalImage is not None:
            dent = cv2.resize(dentAtlas, size, interpolation=cv2.INTER_LINEAR)
            with Image.open(io.BytesIO(views[normalImage['bufferView']])) as bitmap:
                normalMap = np.asarray(bitmap)
            surface *= WoodCavity(normalMap, pixels, dent)
            np.maximum(surface, .05, out=surface)
            cavityImages.append(imageIndex)
        channel = np.rint(surface * 255).astype('B')
        for transform in reserved[imageIndex]:
            offset = np.asarray(transform['offset'])
            left, top = np.maximum(0, np.floor(offset * size).astype(int) - 8)
            right, bottom = np.minimum(size, np.ceil((offset + transform['scale']) * size).astype(int) + 8)
            channel[top:bottom, left:right] = pixels[top:bottom, left:right, 0]
        pixels[:, :, 0] = channel
        stream = io.BytesIO()
        Image.fromarray(pixels).save(stream, 'PNG', compress_level=6)
        views[view] = stream.getvalue()
        image['mimeType'] = 'image/png'
        print(image['name'], int(channel.min()), flush=True)

    doc['asset']['extras']['version'] = 'Type38_CavityAo26'
    return {'materials':len(doc['materials']), 'images':sorted(charts), 'channel':'R',
            'woodCavityImages':sorted(cavityImages)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path, help='directory containing the matched Type38 GLB and manifests')
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    doc, views, digest = ReadGlb((args.input / 'Model_Type38_511.glb').read_bytes())
    manifest = json.loads((args.input / 'Data_Type38_511.json').read_text(encoding='utf8'))
    lod = json.loads((args.input / 'Data_Type38NpcLod.json').read_text(encoding='utf8'))
    assert digest == manifest['runtimeSha256'] == lod['sourceSha256']
    inputVersion = doc['asset']['extras']['version']
    manifest['ambientOcclusion'] = BakeContactOcclusion(repo, doc, views)
    if 'rearContact' in manifest:
        from Script_Type38RearFinish import BakeRearFinish
        normalImages = manifest['rearContact'].get('normalImages', [])
        manifest['rearContact'] = BakeRearFinish(repo, doc, views, polishMetal=False)
        manifest['rearContact']['normalImages'] = normalImages
    if 'edgeHighlights' in manifest:
        doc['asset']['extras']['version'] = inputVersion
    SaveType38Assets(args.output, doc, views, manifest, lod, author=manifest['renderMeshes'] == manifest['parts'])
