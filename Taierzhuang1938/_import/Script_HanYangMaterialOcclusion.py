"""Deepen the packed HanYang contact AO and bake aligned timber micro-AO."""

from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import sys

import moderngl
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

from Script_HanYang173RDilateTextures import ReadGlb, WriteGlb
from Script_HanYangScanLibrary import OpenScan, ScanRecesses


VERSION = '173R-20261127R36'
BASE = '173R-20261127R35'
CONTACT_POWER = 1.72
CONTACT_RAMP = (.025, .145)
WOOD_SCAN = 'black_walnut_veneer_02'
MODEL, REPORT = 'Model_HanYang173R.glb', 'Data_GameGeometry.json'
VERTEX_SHADER = '''#version 330
in vec2 uv;
in vec3 pos, normal;
out vec3 point, faceNormal;
out vec4 basis;
out float visibility, woodExposure, edgeWear;
void main() {
    gl_Position = vec4(uv * 2. - 1., 0., 1.);
    point = pos;
    faceNormal = normal;
    basis = vec4(1., 0., 0., 1.);
    visibility = woodExposure = 1.;
    edgeWear = 0.;
}
'''


def Accessor(doc, blocks, index):
    accessor = doc['accessors'][index]
    view = doc['bufferViews'][accessor['bufferView']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[accessor['type']]
    dtype = np.dtype({5126: '<f4', 5123: '<u2', 5125: '<u4'}[accessor['componentType']])
    return np.ndarray((accessor['count'], width), dtype=dtype, buffer=blocks[accessor['bufferView']],
                      offset=accessor.get('byteOffset', 0),
                      strides=(view.get('byteStride', width * dtype.itemsize), dtype.itemsize))


def RasterWood(context, fragment, doc, blocks, node, primitive, size):
    stock = node['name'].startswith('MainWood_')
    defines = '#version 330\n#define WOOD_OCCLUSION_BAKE\n'
    if stock:
        defines += '#define STOCK_CREST_WEAR\n'
    program = context.program(vertex_shader=VERTEX_SHADER, fragment_shader=fragment.replace('#version 330', defines, 1))
    xyz = Accessor(doc, blocks, primitive['attributes']['POSITION'])
    indices = Accessor(doc, blocks, primitive['indices'])
    program['wood'] = True
    program['foreEnd'] = node['name'].startswith('FrontWood_')
    program['handguard'] = node['name'].startswith('UpperWood_')
    program['alongRange'] = (float(-xyz[:, 2].max()), float(-xyz[:, 2].min()))
    program['heightRange'] = (float(xyz[:, 1].min()), float(xyz[:, 1].max()))
    program['seed'] = (node['mesh'] * .373) % 13.
    program['surfaceMap'] = 0
    bindings, buffers = [], []
    for attribute, semantic in (('uv', 'TEXCOORD_0'), ('pos', 'POSITION'), ('normal', 'NORMAL')):
        values = Accessor(doc, blocks, primitive['attributes'][semantic])
        buffer = context.buffer(values.tobytes())
        buffers.append(buffer)
        bindings.append((buffer, f'{values.shape[1]}f', attribute))
    indexBuffer = context.buffer(indices.tobytes())
    vao = context.vertex_array(program, bindings, indexBuffer, index_element_size=indices.dtype.itemsize)
    target = context.texture(size, 2)
    frame = context.framebuffer([target])
    try:
        frame.use()
        frame.clear()
        context.viewport = (0, 0, *size)
        vao.render()
        # The UV raster's first scanline is already glTF's first image row.
        pixels = np.frombuffer(frame.read(components=2, alignment=1), np.uint8).reshape(size[1], size[0], 2)
        covered = pixels[:, :, 1] == 255
        assert covered.any(), node['name']
        return pixels[:, :, 0], covered
    finally:
        for resource in (frame, target, vao, indexBuffer, *buffers, program):
            resource.release()


def StrengthenVisibility(red):
    visibility = red.astype(np.float32) / 255
    start, end = CONTACT_RAMP
    weight = np.clip((1. - visibility - start) / (end - start), 0, 1)
    weight = weight * weight * (3. - 2. * weight)
    return visibility + weight * (visibility ** CONTACT_POWER - visibility)


def Main(source, scans, output):
    assert source.resolve() != output.resolve(), 'Build the material AO in a staging directory'
    report = json.loads((source / REPORT).read_text(encoding='utf8'))
    assert report['exteriorFinish']['version'] == BASE, 'Start with the R35 contact bake'
    oldHash = sha256((source / MODEL).read_bytes()).hexdigest()
    assert oldHash == report['gameSha256']
    doc, binary = ReadGlb(source / MODEL)
    assert doc['asset']['extras']['materialMatch'] == BASE
    blocks = []
    for view in doc['bufferViews']:
        offset = view.get('byteOffset', 0)
        blocks.append(binary[offset:offset + view['byteLength']])

    contacts = {i: material for i, material in enumerate(doc['materials']) if 'occlusionTexture' in material}
    woodNames = set(report['materialMatch']['woodParts'])
    woodNodes = {}
    for node in doc['nodes']:
        if node.get('name') in woodNames:
            assert not {'matrix', 'translation', 'rotation', 'scale'}.intersection(node)
            primitive, = doc['meshes'][node['mesh']]['primitives']
            woodNodes[primitive['material']] = node, primitive
    assert len(woodNodes) == len(woodNames) and woodNodes.keys() <= contacts.keys()
    records = {row['name']: row for row in report['texturePayloads']}
    geometryViews = {accessor['bufferView'] for accessor in doc['accessors']}
    written = set()

    displacement, = (row for row in report['materialMatch']['sourceAssets']
                     if row['asset'] == WOOD_SCAN and row['role'] == 'Displacement')
    recess = ScanRecesses(OpenScan(scans, displacement), WOOD_SCAN)
    empty = Image.new('L', recess.size)
    channels = Image.merge('RGB', (empty, empty, recess))
    fragment = Path(__file__).with_name('Shader_HanYangMaterial.frag').read_text(encoding='utf8')
    context = moderngl.create_standalone_context()
    surface = context.texture(channels.size, 3, channels.tobytes())
    surface.filter = (moderngl.LINEAR, moderngl.LINEAR)
    surface.use(0)
    timber = {}
    try:
        for slot, material in contacts.items():
            ao = material['occlusionTexture']
            orm = material['pbrMetallicRoughness']['metallicRoughnessTexture']
            assert ao['index'] == orm['index'] and not ao.get('texCoord', 0)
            sourceImage = doc['textures'][orm['index']]['extensions']['EXT_texture_webp']['source']
            image = doc['images'][sourceImage]
            view = image['bufferView']
            assert image['name'].endswith('_ORM') and view not in written and view not in geometryViews
            written.add(view)
            with Image.open(BytesIO(blocks[view])) as buffer:
                size = buffer.size
                rgb = np.array(buffer.convert('RGB'))
            visibility = StrengthenVisibility(rgb[:, :, 0])
            if slot in woodNodes:
                node, primitive = woodNodes[slot]
                micro, covered = RasterWood(context, fragment, doc, blocks, node, primitive, size)
                used = micro[covered]
                nearest = distance_transform_edt(~covered, return_distances=False, return_indices=True)
                visibility *= micro[nearest[0], nearest[1]].astype(np.float32) / 255
                timber[node['name']] = {
                    'minimum': int(used.min()), 'openFraction': round(float((used == 255).mean()), 6),
                    'recessedFraction': round(float((used < 225).mean()), 6),
                }
            rgb[:, :, 0] = np.uint8(np.round(255 * visibility.clip(0, 1)))
            stream = BytesIO()
            Image.fromarray(rgb).save(stream, 'WEBP', lossless=True, method=4)
            contents = stream.getvalue()
            assert np.array_equal(np.asarray(Image.open(BytesIO(contents)).convert('RGB')), rgb), image['name']
            blocks[view] = contents
            ao['strength'] = 1.
            records[image['name']].update(sha256=sha256(contents).hexdigest(), sourceSha256=sha256(rgb.tobytes()).hexdigest())
    finally:
        surface.release()
        context.release()

    report['exteriorFinish']['contactVisibility'].update(strength=1., contrastPower=CONTACT_POWER, contrastRamp=list(CONTACT_RAMP))
    report['exteriorFinish'].update(version=VERSION, materialOcclusion={
        'baseSha256': oldHash, 'channel': 'linear ORM red',
        'source': 'Object-space donor recesses, cuts and compressed dents from the timber PBR shader.',
        'composition': 'strengthened geometry visibility multiplied by timber micro-visibility',
        'parts': timber,
    })
    report['materialMatch']['version'] = VERSION
    description = 'R36: stronger contact AO and recessed timber fibres, cuts and dents.'
    report['rebake'] = description
    doc['asset']['extras'].update(materialMatch=VERSION, rebake=description)
    output.mkdir(parents=True, exist_ok=True)
    destination = output / MODEL
    WriteGlb(destination, doc, blocks)
    report['gameSha256'] = sha256(destination.read_bytes()).hexdigest()
    (output / REPORT).write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
    print(json.dumps(timber, indent=2))
    print('Prepared', VERSION, report['gameSha256'])


if __name__ == '__main__':
    Main(*(Path(value) for value in sys.argv[1:]))
