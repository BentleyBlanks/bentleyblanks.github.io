"""Bake hand wear, the tail plate's scuffs and interrupted steel edge wear."""

from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import sys

import moderngl
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

from Script_HanYang173RDilateTextures import WriteGlb
from Script_HanYangScanLibrary import OpenScan, ScanRecesses
from Script_HanYangWearAndEdges import (
    AtlasImage, AuthoredEdges, Bake, ConvexTurns, MODEL, PartStreams, ReadAsset,
    REPORT, Smoothstep, VERSION as BASE,
)


VERSION = '173R-20261128R38'
TAIL_PLATE = 'RearOuterCover_RoundedSideReturn'
WOOD = ('MainWood_ContinuousLowerShoulder', 'UpperWood_Rebuilt_ShortRearShoulder_ContinuousFront', 'FrontWood_ContinuousOval')
STEEL_SCAN = 'rusty_metal_04'
VERTEX = """#version 330
in vec2 uv;
in vec3 position, normal;
in float rounded;
out vec3 point, faceNormal;
out float bevel;
void main() {
    gl_Position=vec4(uv*2.-1.,0.,1.);
    point=position;
    faceNormal=normal;
    bevel=rounded;
}
"""


def Linear(pixels):
    value = pixels.astype(np.float32) / 255
    return np.where(value <= .04045, value / 12.92, ((value + .055) / 1.055) ** 2.4)


def Srgb(value):
    value = np.clip(value, 0, 1)
    return np.where(value <= .0031308, value * 12.92, 1.055 * value ** (1. / 2.4) - .055)


def Byte(values):
    return np.uint8(np.round(255 * np.clip(values, 0, 1)))


def RustSource(context, archive, sources):
    maps = {row['role']: OpenScan(archive/'SurfaceScans', row) for row in sources if row['asset'] == STEEL_SCAN}
    rough = maps['Rough'].convert('L')
    recess = ScanRecesses(maps['Displacement'], STEEL_SCAN)
    packed = Image.merge('LA', (rough, recess))
    texture = context.texture(packed.size, 2, packed.tobytes())
    texture.filter = (moderngl.LINEAR, moderngl.LINEAR)
    return texture


def DrawParts(program, parts):
    for node, data, indices, bevel, role in parts:
        name = node['name']
        points = data['POSITION']
        kind = WOOD.index(name) + 1 if name in WOOD else 4 if name == TAIL_PLATE else 0
        primary = name.startswith(('ReceiverOuterCollar', 'LongOuterSteel_', 'LowerPlateGuard_', 'ButtCap_',
                                   'FrontBand_Continuous', 'RearBand_Controlled'))
        intensity = .88 if primary or kind == 4 else .68 if role in ('boltBody', 'cockingPiece') else .53
        program['surface'] = kind
        program['phase'] = (node['mesh'] * .521 + .97) % 24.
        program['intensity'] = intensity
        program['lengthRange'] = (float(points[:, 2].min()), float(points[:, 2].max()))
        yield {'uv': data['TEXCOORD_0'], 'position': points, 'normal': data['NORMAL'], 'rounded': bevel}, indices


def Main(source, archive, output):
    assert source.resolve() != output.resolve(), 'Write the finish to a staging directory'
    report = json.loads((source/REPORT).read_text(encoding='utf8'))
    oldHash = sha256((source/MODEL).read_bytes()).hexdigest()
    assert oldHash == report['gameSha256'] and report['exteriorFinish']['version'] == BASE
    doc, blocks = ReadAsset(source/MODEL)
    records = {row['name']: row for row in report['texturePayloads']}
    geometryViews = {accessor['bufferView'] for accessor in doc['accessors']}
    changed = set()

    def Pixels(image):
        with Image.open(BytesIO(blocks[image['bufferView']])) as picture:
            return np.array(picture.convert('RGB'))

    def Pack(image, pixels):
        pixels = np.ascontiguousarray(pixels)
        stream = BytesIO()
        Image.fromarray(pixels).save(stream, 'WEBP', lossless=True, method=4)
        content = stream.getvalue()
        assert np.array_equal(np.asarray(Image.open(BytesIO(content)).convert('RGB')), pixels), image['name']
        view = image['bufferView']
        assert view not in changed and view not in geometryViews, image['name']
        changed.add(view)
        blocks[view] = content
        records[image['name']].update(sha256=sha256(content).hexdigest(),
                                       sourceSha256=sha256(pixels.tobytes()).hexdigest())

    authored = AuthoredEdges(archive)
    groups = {}
    names = set()
    nodes = [node for node in doc['nodes'] if 'mesh' in node]
    for node, slot, data, indices in PartStreams(doc, blocks, nodes):
        name = node['name']
        role = node['extras']['hanYangRole']
        if role == 'trigger':
            continue
        if name in authored:
            points, bevel = authored[name]
            assert np.array_equal(points, data['POSITION']), name
        elif name in WOOD:
            bevel = np.zeros(len(data['POSITION']), dtype=np.float32)
        else:
            bevel = .74 * ConvexTurns(data['POSITION'], data['NORMAL'], indices)
        groups.setdefault(slot, []).append((node, data, indices, bevel, role))
        names.add(name)
    assert set(WOOD) | {TAIL_PLATE} <= names

    context = moderngl.create_standalone_context()
    shader = Path(__file__).with_name('Shader_HanYangUsageWear.frag').read_text(encoding='utf8')
    program = context.program(vertex_shader=VERTEX, fragment_shader=shader)
    rust = RustSource(context, archive, report['materialMatch']['sourceAssets'])
    rust.use(0)
    program['weatheredSteel'] = 0
    stats = {}
    try:
        for slot, parts in groups.items():
            material = doc['materials'][slot]
            pbr = material['pbrMetallicRoughness']
            baseImage = AtlasImage(doc, pbr['baseColorTexture'])
            ormImage = AtlasImage(doc, pbr['metallicRoughnessTexture'])
            base, orm = Pixels(baseImage), Pixels(ormImage)
            assert base.shape == orm.shape
            fields, hit = Bake(context, program, base.shape[:2][::-1], (4, 2), DrawParts(program, parts))
            covered = hit[:, :, 0] == 255
            assert covered.any(), material['name']
            near = distance_transform_edt(~covered, return_distances=False, return_indices=True)
            padded = fields[near[0], near[1]].astype(np.float32)/255
            a, b, c, d = np.moveaxis(padded, -1, 0)
            reflectance = Linear(base)
            rough, metal = np.moveaxis(orm[:, :, 1:].astype(np.float32)/255, -1, 0)
            if parts[0][0]['name'] in WOOD:
                assert len(parts) == 1 and not np.any(orm[:, :, 2])
                oil, abrasion, scuff = a, b, c
                reflectance *= (1. - .27*oil + .49*abrasion + .59*scuff)[:, :, None]
                rubbedFinish = Smoothstep(.58, .88, oil)
                openFinish = Smoothstep(.60, .89, abrasion)
                rough = np.clip(rough-.022*oil+.023*abrasion-.112*rubbedFinish+.103*openFinish+.062*scuff, .29, .79)
                coat = material.get('extensions', {}).get('KHR_materials_clearcoat', {}).get('clearcoatTexture')
                if coat:
                    filmImage = AtlasImage(doc, coat)
                    film = Pixels(filmImage)
                    strength = film[:, :, 0].astype(np.float32)/255
                    change = .45*oil-.47*abrasion-.50*scuff
                    delta = Image.fromarray(change).resize(strength.shape[::-1], Image.Resampling.BOX)
                    film[:, :, 0] = Byte(strength*(1.+np.asarray(delta)))
                    Pack(filmImage, film)
            else:
                oxide, exposed, tips, tracks = a, b, c, d
                edgeGap = hit[near[0], near[1], 1].astype(np.float32)/255
                reflectance *= (1.-.30*oxide-.12*edgeGap)[:, :, None] * (1.+oxide[:, :, None]*np.array([.046,-.019,-.089],np.float32))
                reflectance += (.025*exposed+.034*tips+.055*tracks)[:, :, None]*np.array([1.,1.015,1.008],np.float32)
                rough = np.clip(rough+.131*edgeGap+.087*oxide-.147*exposed-.071*tips-.166*tracks, .205, .76)
                shine = np.maximum(np.maximum(exposed,tips),tracks)
                metal = np.clip(metal*(1.-.137*oxide)+(.994-metal)*shine*.77, 0, .994)
            Pack(baseImage, Byte(Srgb(reflectance)))
            orm[:, :, 1], orm[:, :, 2] = Byte(rough), Byte(metal)
            Pack(ormImage, orm)
            stats[material['name']] = {'parts': [item[0]['name'] for item in parts],
                                       'maskMeans': np.round(fields[covered].mean(axis=0)/255, 5).tolist()}
            print(material['name'], stats[material['name']]['maskMeans'], flush=True)
    finally:
        for resource in (rust, program, context):
            resource.release()

    description = 'R38: localized handling wear, longitudinal tail plate scuffs and broken steel edge polish.'
    report['exteriorFinish'].update(version=VERSION, usageWear={
        'baseSha256': oldHash, 'tailPlate': TAIL_PLATE, 'wood': list(WOOD), 'atlases': stats,
        'surfaceMaps': 'Base colour and ORM on the original UV0, with the two existing wood oil masks.',
    })
    report['materialMatch']['version'] = VERSION
    report['rebake'] = description
    doc['asset']['extras'].update(materialMatch=VERSION, rebake=description)
    output.mkdir(parents=True, exist_ok=True)
    destination = output/MODEL
    WriteGlb(destination, doc, blocks)
    report['gameSha256'] = sha256(destination.read_bytes()).hexdigest()
    (output/REPORT).write_text(json.dumps(report, indent=2)+'\n', encoding='utf8')
    print(VERSION, len(changed), 'painted maps', report['gameSha256'])


if __name__ == '__main__':
    Main(*(Path(value) for value in sys.argv[1:]))
