"""Pack the Blender contact bake into the existing HanYang ORM red channels."""

from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

from Script_HanYang173RDilateTextures import ReadGlb, WriteGlb


VERSION = '173R-20261127R35'
STRENGTH = .9
MODEL = 'Model_HanYang173R.glb'
REPORT = 'Data_GameGeometry.json'


def ContactRed(visibility, width, height):
    assert visibility.shape == (height // 2, width // 2) and visibility.dtype == np.uint8
    # Keep weak grazing occlusion from tinting broad faces. The denser shadows
    # in actual recesses keep their localized contrast.
    blocked = gaussian_filter(1. - visibility.astype(np.float32) / 255, .68, mode='nearest')
    blocked = (np.maximum(blocked - .10, 0) / .90) ** 1.22
    field = Image.fromarray(1. - blocked).resize((width, height), Image.Resampling.BILINEAR)
    return np.uint8(np.round(255 * np.asarray(field).clip(0, 1)))


def ReplaceOcclusion(contents, visibility):
    pixels = np.asarray(Image.open(BytesIO(contents)).convert('RGB'))
    height, width = pixels.shape[:2]
    result = pixels.copy()
    result[:, :, 0] = ContactRed(visibility, width, height)
    stream = BytesIO()
    Image.fromarray(result).save(stream, 'WEBP', lossless=True, method=4)
    baked = stream.getvalue()
    assert np.array_equal(np.asarray(Image.open(BytesIO(baked)).convert('RGB')), result)
    return baked, result


def Main(source, maps, output):
    assert source.resolve() != output.resolve(), 'Build the AO revision in an isolated directory'
    report = json.loads((source / REPORT).read_text(encoding='utf8'))
    bake = json.loads((maps / 'Data_ContactAtlasBake.json').read_text(encoding='utf8'))
    oldHash = sha256((source / MODEL).read_bytes()).hexdigest()
    assert oldHash == report['gameSha256'] == bake['sourceSha256']
    doc, binary = ReadGlb(source / MODEL)
    assert doc['asset']['extras']['hanYangBatching'] == 1 and len(doc['images']) == 41
    chunks = []
    for view in doc['bufferViews']:
        offset = view.get('byteOffset', 0)
        chunks.append(binary[offset:offset + view['byteLength']])

    textures = {record['name']: record for record in report['texturePayloads']}
    assert set(bake['atlases']) == {row['name'] for row in doc['materials']}
    geometryViews = {accessor['bufferView'] for accessor in doc['accessors']}
    written = set()
    for material in doc['materials']:
        bakedAtlas = bake['atlases'][material['name']]
        textureSlot = material['pbrMetallicRoughness']['metallicRoughnessTexture']
        index = doc['textures'][textureSlot['index']]['extensions']['EXT_texture_webp']['source']
        image = doc['images'][index]
        view = image['bufferView']
        assert view not in written and view not in geometryViews
        assert image['name'].endswith('_ORM') and not textureSlot.get('texCoord', 0)
        written.add(view)
        visibility = np.load(maps / bakedAtlas['file'], allow_pickle=False)
        if visibility.min() == 255:
            assert 'occlusionTexture' not in material, material['name']
            continue
        chunks[view], rgb = ReplaceOcclusion(chunks[view], visibility)
        assert rgb.shape[:2][::-1] == tuple(bakedAtlas['sourceSize'])
        material['occlusionTexture'] = {'index': textureSlot['index'], 'strength': STRENGTH}
        stat = textures[image['name']]
        stat.update(sha256=sha256(chunks[view]).hexdigest(), sourceSha256=sha256(rgb.tobytes()).hexdigest())

    parts = sorted(node['name'] for node in doc['nodes'] if 'mesh' in node and
                   'occlusionTexture' in doc['materials'][doc['meshes'][node['mesh']]['primitives'][0]['material']])
    text = 'R35: baked contact AO on the existing ORM atlases.'
    report['exteriorFinish'].update(version=VERSION, contactVisibility={
        'parts': parts, 'channel': 'linear ORM red', 'strength': STRENGTH,
        'sourceAssetSha256': oldHash,
        'sampling': 'Two cosine-weighted Cycles AO fields on the final UVs.',
        **{key: bake[key] for key in ('radiiM', 'samples', 'wideWeight', 'groups', 'unbaked')},
    })
    report['materialMatch']['version'] = VERSION
    report['rebake'] = text
    doc['asset']['extras'].update(materialMatch=VERSION, rebake=text)

    output.mkdir(parents=True, exist_ok=True)
    destination = output / MODEL
    WriteGlb(destination, doc, chunks)
    report['gameSha256'] = sha256(destination.read_bytes()).hexdigest()
    (output / REPORT).write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
    print(f'{len(parts)} HanYang parts have atlas AO. {report["gameSha256"]}')


if __name__ == '__main__':
    Main(*(Path(value) for value in sys.argv[1:]))
