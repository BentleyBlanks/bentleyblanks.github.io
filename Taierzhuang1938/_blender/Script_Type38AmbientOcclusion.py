"""Bake short-range ambient occlusion from the assembled game mesh into ORM red."""
import argparse
import io
import json
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
from scipy.spatial.transform import Rotation

from Script_Type38ExteriorFinish import ReadGlb
from Script_Type38RenderBatches import RoleMap
from Script_Type38Surface import Attribute, SaveType38Assets, SurfaceAtlas


RAY_COUNT = 48
RAY_DISTANCE = .020
RAY_BIAS = .00035
MOVING_ROLES = {'Bolt', 'Cover', 'Trigger'}


def Normalize(vectors):
    return vectors / np.maximum(np.linalg.norm(vectors, axis=-1, keepdims=True), 1e-8)


def TraceOcclusion(scene, points, normals, geometryGroups, group):
    result = np.empty(len(points), dtype=np.float32)
    rng = np.random.default_rng(7529)
    samples = (np.arange(RAY_COUNT, dtype=np.float32) + .5) / RAY_COUNT
    radial, axial = np.sqrt(samples), np.sqrt(1 - samples)
    azimuth = np.arange(RAY_COUNT, dtype=np.float32) * 2.39996323
    for start in range(0, len(points), 3072):
        stop = min(start + 3072, len(points))
        normal = Normalize(normals[start:stop])
        origin = points[start:stop] + normal * RAY_BIAS
        reference = np.zeros_like(normal)
        reference[:, 2] = 1
        reference[np.abs(normal[:, 2]) > .9] = [0, 1, 0]
        xAxis = Normalize(np.cross(reference, normal))
        yAxis = np.cross(normal, xAxis)
        angle = azimuth + rng.random((len(normal), 1), dtype=np.float32) * (2 * np.pi)
        directions = (xAxis[:, None] * (radial * np.cos(angle))[:, :, None]
                      + yAxis[:, None] * (radial * np.sin(angle))[:, :, None]
                      + normal[:, None] * axial[None, :, None])
        starts = np.repeat(origin, RAY_COUNT, axis=0)
        hit = scene.run(starts, directions.reshape(-1, 3),
                        dists=np.full(len(starts), RAY_DISTANCE, dtype=np.float32), output=1)
        groupHit = geometryGroups[hit['geomID']]
        distance = hit['tfar']
        close = np.maximum(0, 1 - distance / (.46 * RAY_DISTANCE))
        falloff = .68 * close + .32 * np.maximum(0, 1 - distance / RAY_DISTANCE)
        # Keep contact shading through the resting joints. Attenuate its reach
        # between moving assemblies so their cast shadow does not follow a map.
        crossMotion = (groupHit != group) & ((groupHit != 0) | (group != 0))
        attenuation = np.where(crossMotion, .64 * close, 1)
        exposure = (falloff * attenuation * (hit['geomID'] >= 0)).reshape(-1, RAY_COUNT).mean(axis=1)
        result[start:stop] = np.clip(1 - 1.65 * exposure, .15, 1)
    return result


def BakeContactOcclusion(repo, doc, views):
    from embreex.mesh_construction import TriangleMesh
    from embreex.rtcore_scene import EmbreeScene

    roles = RoleMap(repo)
    motionIds = {role:index for index,role in enumerate(sorted(MOVING_ROLES), start=1)}
    scene = EmbreeScene()
    charts = defaultdict(list)
    geometryGroups = []
    geometry = []
    for node in doc['nodes']:
        primitive, = doc['meshes'][node['mesh']]['primitives']
        attrs = primitive['attributes']
        indices = Attribute(doc, views, primitive['indices'], 3).astype(np.int32)
        vertices = Attribute(doc, views, attrs['POSITION'], 3)
        rotation = Rotation.from_quat(node['rotation']).as_matrix().astype('f') if 'rotation' in node else np.eye(3, dtype='f')
        location = np.asarray(node.get('translation', [0, 0, 0]), dtype='f')
        group = motionIds.get(roles.get(node['extras'].get('SourceRanges', [{}])[0].get(
            'part', node['extras']['SourceObject'])), 0)
        geometry.append(TriangleMesh(scene, vertices @ rotation.T + location, indices))
        geometryGroups.append(group)

        material = doc['materials'][primitive['material']]
        orm = material['pbrMetallicRoughness']['metallicRoughnessTexture']
        assert orm.get('texCoord', 0) == 0 and not orm.get('extensions')
        image = doc['textures'][orm['index']]['source']
        material['occlusionTexture'] = {**orm, 'strength': 1}
        charts[image].append((node, primitive, rotation, location, group))

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

    geometryGroups = np.array(geometryGroups + [0], dtype=np.uint8)
    for imageIndex, parts in charts.items():
        image = doc['images'][imageIndex]
        view = image['bufferView']
        with Image.open(io.BytesIO(views[view])) as source:
            pixels = np.array(source)
        height, width = pixels.shape[:2]
        size = (width, height)
        limit = 1024 if any(node['extras']['SourceObject'] in (
            'Exterior_FoldedFrame12', 'T38_460G_WoodGroove_VisualCandidate') for node, *_ in parts) else 768
        ratio = min(1, limit / max(size))
        small = tuple(max(1, round(length * ratio)) for length in size)
        atlas = np.ones(small[::-1], dtype=np.float32)
        for _, primitive, rotation, location, group in parts:
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
        channel = np.rint(cv2.resize(atlas, size, interpolation=cv2.INTER_LINEAR) * 255).astype('B')
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

    doc['asset']['extras']['version'] = 'Type38_ContactAo25'
    return {'materials':len(doc['materials']), 'images':sorted(charts), 'channel':'R'}


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
    manifest['ambientOcclusion'] = BakeContactOcclusion(repo, doc, views)
    SaveType38Assets(args.output, doc, views, manifest, lod, author=manifest['renderMeshes'] == manifest['parts'])
