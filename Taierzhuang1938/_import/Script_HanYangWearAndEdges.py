"""Rebake the HanYang wood finish and burnish its existing rolled edges."""

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
from Script_HanYangBandProfiles import FormInspectionBand
from Script_HanYangMaterialOcclusion import Accessor, MODEL, REPORT, StrengthenVisibility, VERSION as BASE
from Script_HanYangScanLibrary import OpenScan, ScanRecesses


VERSION = '173R-20261127R37'
BANDS = ('FrontBand_ContinuousEnvelopeContact', 'RearBand_ControlledCrown')
WOOD_VERTEX = """#version 330
in vec2 uv;
in vec3 pos, normal;
in vec4 tangent;
in float handling, rounded;
out vec3 point, faceNormal;
out vec4 basis;
out float visibility, woodExposure, edgeWear;
void main() {
    gl_Position=vec4(uv*2.-1.,0.,1.);
    point=pos;
    faceNormal=normal;
    basis=tangent;
    visibility=1.;
    woodExposure=handling;
    edgeWear=rounded;
}
"""
EDGE_VERTEX = """#version 330
in vec2 uv;
in float rounded;
out float weight;
void main() {
    gl_Position=vec4(uv*2.-1.,0.,1.);
    weight=rounded;
}
"""
EDGE_FRAGMENT = """#version 330
in float weight;
out vec2 mask;
void main() { mask=vec2(weight,1.); }
"""


def ReadAsset(path):
    doc, payload = ReadGlb(path)
    views = [payload[v['byteOffset']:v['byteOffset'] + v['byteLength']] for v in doc['bufferViews']]
    return doc, views


def PartStreams(doc, blocks, nodes):
    for node in nodes:
        primitive, = doc['meshes'][node['mesh']]['primitives']
        arrays = {name: Accessor(doc, blocks, index) for name, index in primitive['attributes'].items()}
        yield node, primitive['material'], arrays, Accessor(doc, blocks, primitive['indices'])


def Smoothstep(low, high, values):
    t = np.clip((values - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def ConvexTurns(points, normals, indices):
    faces = indices.reshape(-1, 3)
    edges = np.unique(np.sort(faces[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2), axis=1), axis=0)
    a, b = edges.T
    segment, bend = points[b] - points[a], normals[b] - normals[a]
    length = np.linalg.norm(segment, axis=1)
    curvature = np.einsum('ij,ij->i', segment, bend) / np.maximum(length**2, 1e-12)
    weights = Smoothstep(135, 380, curvature) * Smoothstep(.035, .19, np.linalg.norm(bend, axis=1))
    weights *= Smoothstep(.00009, .00035, length) * (1 - Smoothstep(.0035, .009, length))
    result = np.zeros(len(points), dtype=np.float32)
    np.maximum.at(result, a, weights)
    np.maximum.at(result, b, weights)
    # Match the edges at UV splits while preserving deliberate normal splits.
    _, shared = np.unique(np.column_stack((np.round(points, 6), np.round(normals, 4))), axis=0, return_inverse=True)
    joined = np.zeros(int(shared.max()) + 1, dtype=np.float32)
    np.maximum.at(joined, shared, result)
    return joined[shared]


def AuthoredEdges(archive):
    result = {}
    with np.load(archive/'Data_InspectionBevels.npz', allow_pickle=False) as bevels:
        for key in bevels.files:
            if key.endswith('_EDGE_WEAR'):
                name = key.removesuffix('_EDGE_WEAR')
                result[name] = bevels[name+'_POSITION'], bevels[key]
    source, chunks = ReadAsset(archive/'Input_ExteriorGeometry.glb')
    nodes = [node for node in source['nodes'] if node.get('name') in BANDS and 'mesh' in node]
    for node, _, data, indices in PartStreams(source, chunks, nodes):
        name = node['name']
        streams, _ = FormInspectionBand(name, {key: data[key] for key in ('POSITION', 'NORMAL')}, indices)
        result[name] = streams['POSITION'], streams['EDGE_WEAR']
    return result


def Bake(context, program, size, components, batches):
    targets = [context.texture(size, count) for count in components]
    frame = context.framebuffer(targets)
    try:
        frame.use()
        frame.clear()
        context.viewport = (0, 0, *size)
        for streams, indices in batches:
            buffers, bind = [], []
            for name, values in streams.items():
                values = values.reshape(len(values), -1)
                buffer = context.buffer(values.tobytes())
                buffers.append(buffer)
                bind.append((buffer, f'{values.shape[1]}f', name))
            indicesBuffer = context.buffer(indices.tobytes())
            vao = context.vertex_array(program, bind, indicesBuffer, index_element_size=indices.dtype.itemsize)
            try:
                vao.render()
            finally:
                for resource in (vao, indicesBuffer, *buffers):
                    resource.release()
        return [np.frombuffer(frame.read(attachment=i, components=count, alignment=1), np.uint8)
                .reshape(size[1], size[0], count) for i, count in enumerate(components)]
    finally:
        for resource in (frame, *targets):
            resource.release()


def AtlasImage(doc, slot):
    index = doc['textures'][slot['index']]['extensions']['EXT_texture_webp']['source']
    return doc['images'][index]


def TimberTextures(context, scans, sources):
    textures = []
    for name in ('black_walnut_veneer_02', 'fine_grained_wood'):
        images = {row['role']: OpenScan(scans, row) for row in sources if row['asset'] == name}
        size = images['Diffuse'].size
        empty = Image.new('L', size)
        recesses = ScanRecesses(images['Displacement'], name) if 'Displacement' in images else empty
        surface = Image.merge('RGB', (images['Rough'].convert('L'), empty, recesses))
        for image in (images['Diffuse'].convert('RGB'), surface, images['nor_gl'].convert('RGB')):
            texture = context.texture(size, 3, image.tobytes())
            texture.filter = (moderngl.LINEAR, moderngl.LINEAR)
            textures.append(texture)
    return textures


def WoodBake(context, shader, textures, node, data, indices, handling, edge, size):
    name = node['name']
    defines = '#version 330\n#define WOOD_FINISH_REBAKE\n'
    if name.startswith('MainWood_'):
        defines += '#define STOCK_CREST_WEAR\n'
    program = context.program(vertex_shader=WOOD_VERTEX, fragment_shader=shader.replace('#version 330', defines, 1))
    points = data['POSITION']
    program['wood'] = True
    program['foreEnd'] = name.startswith('FrontWood_')
    program['handguard'] = name.startswith('UpperWood_')
    program['seed'] = (node['mesh'] * .373) % 13.
    program['alongRange'] = (float(-points[:, 2].max()), float(-points[:, 2].min()))
    program['heightRange'] = (float(points[:, 1].min()), float(points[:, 1].max()))
    for unit, (uniform, texture) in enumerate(zip(
            ('pigmentMap', 'surfaceMap', 'detailMap', 'wearColor', 'wearSurface', 'wearNormal'), textures)):
        texture.use(unit)
        program[uniform] = unit
    assert handling.shape == edge.shape == (len(points),), name
    streams = {'uv': data['TEXCOORD_0'], 'pos': points, 'normal': data['NORMAL'], 'tangent': data['TANGENT'],
               'handling': handling, 'rounded': edge}
    try:
        return Bake(context, program, size, (4, 4, 4, 1, 1), [(streams, indices)])
    finally:
        program.release()


def Main(source, contactPath, archive, output):
    assert source.resolve() != output.resolve(), 'Write the material revision to staging'
    report = json.loads((source/REPORT).read_text(encoding='utf8'))
    oldHash = sha256((source/MODEL).read_bytes()).hexdigest()
    assert oldHash == report['gameSha256'] and report['exteriorFinish']['version'] == BASE
    micro = report['exteriorFinish']['materialOcclusion']
    assert sha256(contactPath.read_bytes()).hexdigest() == micro['baseSha256'], 'Use the unmixed R35 contact AO'
    doc, blocks = ReadAsset(source/MODEL)
    contactDoc, contactBlocks = ReadAsset(contactPath)
    for key in ('nodes', 'meshes', 'accessors', 'images', 'textures'):
        assert doc[key] == contactDoc[key], key
    for accessor in doc['accessors']:
        index = accessor['bufferView']
        assert blocks[index] == contactBlocks[index], index
    records = {row['name']: row for row in report['texturePayloads']}

    def Pixels(image, chunks=blocks):
        with Image.open(BytesIO(chunks[image['bufferView']])) as picture:
            return np.array(picture.convert('RGB'))

    changed = set()

    def Pack(image, pixels):
        stream = BytesIO()
        pixels = np.ascontiguousarray(pixels)
        Image.fromarray(pixels).save(stream, 'WEBP', lossless=True, method=4)
        content = stream.getvalue()
        assert np.array_equal(np.asarray(Image.open(BytesIO(content)).convert('RGB')), pixels)
        view = image['bufferView']
        assert view not in changed, image['name']
        changed.add(view)
        blocks[view] = content
        records[image['name']].update(sha256=sha256(content).hexdigest(), sourceSha256=sha256(pixels.tobytes()).hexdigest())

    nodes = [node for node in doc['nodes'] if 'mesh' in node]
    authored = AuthoredEdges(archive)
    woodNames = set(report['materialMatch']['woodParts'])
    context = moderngl.create_standalone_context()
    shader = Path(__file__).with_name('Shader_HanYangMaterial.frag').read_text(encoding='utf8')
    textures = TimberTextures(context, archive/'SurfaceScans', report['materialMatch']['sourceAssets'])
    roundedMeshes, woodStats, groupedSteel = {}, {}, {}
    with np.load(archive/'Data_TimberHandling.npz', allow_pickle=False) as handling:
        for node, slot, data, indices in PartStreams(doc, blocks, nodes):
            name = node['name']
            points, normals = data['POSITION'], data['NORMAL']
            isWood = name in woodNames
            if name in authored:
                expected, edge = authored[name]
                assert np.array_equal(points, expected), name
            else:
                edge = ConvexTurns(points, normals, indices) * (1. if isWood else .74)
            if not isWood:
                groupedSteel.setdefault(slot, []).append(({'uv': data['TEXCOORD_0'], 'rounded': edge}, indices))
                if edge.max() > .2:
                    roundedMeshes[name] = int(np.count_nonzero(edge > .2))
                continue

            tip = np.minimum(points[:, 2]-points[:, 2].min(), points[:, 2].max()-points[:, 2])
            turn = abs(normals[:, 2])
            endLip = (1 - Smoothstep(.0010, .0044, tip)) * Smoothstep(.17, .62, turn) * (1 - Smoothstep(.90, .995, turn))
            edge = np.maximum(edge, endLip)
            material = doc['materials'][slot]
            pbr = material['pbrMetallicRoughness']
            ormImage = AtlasImage(doc, pbr['metallicRoughnessTexture'])
            geometryAo = Pixels(ormImage, contactBlocks)[:, :, 0]
            size = geometryAo.shape[::-1]
            base, orm, normal, film, occlusion = WoodBake(context, shader, textures, node, data, indices, handling[name], edge, size)
            covered = base[:, :, 3] == 255
            assert covered.any(), name
            near = distance_transform_edt(~covered, return_distances=False, return_indices=True)
            packedOrm = orm[near[0], near[1], :3]
            ambient = StrengthenVisibility(geometryAo) * occlusion[near[0], near[1], 0].astype(np.float32) / 255
            packedOrm[:, :, 0] = np.uint8(np.round(ambient * 255))
            for channel, pixels in ((pbr['baseColorTexture'], base[near[0], near[1], :3]),
                                    (material['normalTexture'], normal[near[0], near[1], :3])):
                Pack(AtlasImage(doc, channel), pixels)
            Pack(ormImage, packedOrm)
            coat = material.get('extensions', {}).get('KHR_materials_clearcoat', {}).get('clearcoatTexture')
            if coat:
                plane = Image.fromarray(film[near[0], near[1], 0]).resize((1024, 1024), Image.Resampling.BOX)
                black = Image.new('L', plane.size)
                Pack(AtlasImage(doc, coat), np.asarray(Image.merge('RGB', (plane, black, black))))
            used = occlusion[:, :, 0][covered]
            woodStats[name] = {'minimum': int(used.min()), 'openFraction': round(float((used == 255).mean()), 6),
                               'recessedFraction': round(float((used < 225).mean()), 6)}
            print('Wood finish and AO', name, woodStats[name], flush=True)

    edgeProgram = context.program(vertex_shader=EDGE_VERTEX, fragment_shader=EDGE_FRAGMENT)
    for slot, area in groupedSteel.items():
        if not any(streams['rounded'].max() > .2 for streams, _ in area):
            continue
        material = doc['materials'][slot]
        image = AtlasImage(doc, material['pbrMetallicRoughness']['metallicRoughnessTexture'])
        rgb = Pixels(image)
        packed, = Bake(context, edgeProgram, rgb.shape[:2][::-1], (2,), area)
        covered = packed[:, :, 1] == 255
        near = distance_transform_edt(~covered, return_distances=False, return_indices=True)
        mask = packed[near[0], near[1], 0].astype(np.float32) / 255
        weight = .88 * Smoothstep(.14, .88, mask)
        rough, metal = np.moveaxis(rgb[:, :, 1:].astype(np.float32) / 255, -1, 0)
        wornRoughness = np.minimum(rough, np.maximum(.205, .61 * rough))
        cleanMetal = np.maximum(metal, .992)
        rgb[:, :, 1] = np.uint8(np.round((rough + weight * (wornRoughness - rough)) * 255))
        rgb[:, :, 2] = np.uint8(np.round((metal + weight * (cleanMetal - metal)) * 255))
        Pack(image, rgb)
        print('Metal edge finish', image['name'], flush=True)
    for resource in (edgeProgram, *textures, context):
        resource.release()

    description = 'R37: torn timber fibres, compressed wear and burnished bevel highlights.'
    micro['parts'] = woodStats
    micro['source'] = 'Recessed walnut fibres and the same varied impact beds and cuts used for timber color and normals.'
    report['exteriorFinish'].update(version=VERSION, polishedEdges={
        'baseSha256': oldHash, 'metal': roundedMeshes,
        'wood': sorted(woodNames), 'mode': 'Roughness and metalness weighted by authored bevels and convex normal turns.',
    })
    report['rebake'] = description
    report['materialMatch']['version'] = VERSION
    doc['asset']['extras'].update(materialMatch=VERSION, rebake=description)
    output.mkdir(parents=True, exist_ok=True)
    destination = output/MODEL
    WriteGlb(destination, doc, blocks)
    report['gameSha256'] = sha256(destination.read_bytes()).hexdigest()
    (output/REPORT).write_text(json.dumps(report, indent=2)+'\n', encoding='utf8')
    print(VERSION, len(changed), 'updated maps', report['gameSha256'])


if __name__ == '__main__':
    Main(*(Path(value) for value in sys.argv[1:]))
