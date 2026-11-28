"""Paint visible wood handling and impact wear into the existing HanYang PBR atlases."""

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
from Script_HanYangUsageWear import Byte, Linear, Srgb, WOOD
from Script_HanYangWearAndEdges import AtlasImage, Bake, MODEL, PartStreams, ReadAsset, REPORT, Smoothstep


VERSION = '173R-20261128R40'
BASE = '173R-20261128R39'
STOCK, HANDGUARD, FOREWOOD = WOOD

# Centres are (x, y, z) in mm. Face angles rotate +X toward +Y.
# Each region has longitudinal/transverse radii in mm and matte/polished weights.
REGIONS = {
    STOCK: (
        ((-12, 23, -80), 161, (42, 13), .90, .39),    # Left receiver shoulder
        ((-12, -13, 6), 193, (63, 15), .53, .96),    # Left wrist
        ((-13, -40, 151), 184, (57, 19), .74, .54),  # Left cheek
        ((-12, -71, 231), 194, (32, 16), .84, .39),  # Left heel
        ((-15, 12, -313), 183, (69, 12), .55, .79),  # Support hand
        ((-13, 28, -552), 153, (35, 8), .85, .42),  # Wood behind the band
        ((13, 20, -73), 19, (47, 11), .80, .47),
        ((13, -14, 23), -22, (70, 15), .50, .96),
        ((13, -42, 163), -4, (58, 19), .76, .42),
        ((13, -77, 229), -16, (30, 16), .82, .30),
        ((14, 15, -362), -4, (80, 12), .47, .73),
        ((13, 23, -550), 17, (32, 11), .72, .44),
    ),
    HANDGUARD: (
        ((-13, 48, -535), 153, (48, 10), .79, .46),
        ((-12, 53, -364), 143, (54, 10), .68, .39),
        ((12, 50, -472), 32, (54, 11), .68, .46),
        ((10, 49, -302), 30, (34, 9), .81, .39),
    ),
    FOREWOOD: (
        ((-13, 22, -649), 181, (58, 12), .57, .80),
        ((-12, 24, -841), 161, (58, 10), .86, .38),
        ((13, 24, -704), 7, (57, 11), .51, .78),
        ((12, 22, -863), 16, (41, 9), .85, .34),
    ),
}

# Strokes have centre, face, direction relative to +Z, (half-length, width)
# in mm, depth in mm, pressure, light wood exposure and bend in brush widths.
STROKES = {
    STOCK: (
        ((-13, 23, -78), 160, -36, (17, 1.40), .22, 1.00, .82, .22),
        ((-13, 18, -67), 167, -27, (11, .81), .13, .92, .55, -.22),
        ((-13, 24, -58), 156, -41, (6, 1.62), .27, .84, .27, .14),
        ((-14, 10, -107), 176, 14, (21, 1.65), .07, .81, .68, -.47),
        ((-14, 8, -91), 177, 12, (13, .67), .06, .86, .91, .45),
        ((-13, 2, -53), 182, 22, (13, 1.26), .13, .88, .78, -.29),
        ((-13, -8, -2), 190, -14, (27, 1.88), .07, .88, .74, .47),
        ((-13, -12, 18), 193, -8, (14, .89), .09, .86, .48, -.32),
        ((-13, -18, 23), 194, 32, (9, 1.65), .26, .88, .35, .20),
        ((-13, -14, 54), 189, -5, (19, 1.17), .08, .76, .79, -.40),
        ((-14, -29, 118), 185, 17, (16, 1.14), .13, .78, .85, .37),
        ((-14, -38, 157), 186, -22, (28, 1.58), .13, .98, .92, -.35),
        ((-14, -42, 175), 188, -13, (18, .90), .09, .86, .51, .20),
        ((-14, -63, 211), 190, 39, (14, 1.61), .23, .95, .82, -.25),
        ((-13, -67, 222), 193, 24, (7, 1.17), .19, .92, .37, .30),
        ((-12, -81, 231), 192, -17, (11, 1.75), .27, .89, .61, .21),
        ((-13, -22, 226), 175, 14, (16, 1.31), .13, .86, .95, -.29),
        ((-14, 13, -304), 187, -7, (28, 1.32), .08, .84, .95, -.37),
        ((-13, 17, -321), 177, -11, (12, .74), .07, .72, .86, .30),
        ((-14, 22, -439), 176, 20, (20, 1.00), .09, .76, 1.02, .33),
        ((-13, 28, -554), 163, -17, (19, 1.25), .13, .90, .90, -.15),
        ((-13, 19, -570), 178, 26, (10, 1.70), .22, .94, .58, .27),
        ((13, 22, -79), 25, 31, (20, 1.26), .19, .97, .92, -.32),
        ((13, 17, -59), 17, 25, (14, .82), .11, .87, .52, .28),
        ((13, 8, -77), 5, -11, (16, 1.32), .10, .81, .80, -.30),
        ((13, -8, 11), -17, -11, (24, 1.41), .14, .97, .98, .43),
        ((13, -15, 33), -19, -6, (18, 1.10), .06, .76, .63, -.37),
        ((13, -13, 50), -13, 34, (8, 1.59), .21, .88, .52, .22),
        ((14, -33, 155), -5, -9, (27, 1.21), .09, .90, 1.00, .35),
        ((14, -37, 174), -8, -7, (16, .67), .08, .72, .84, -.35),
        ((13, -60, 218), -12, 24, (16, 1.51), .20, .92, .73, .24),
        ((13, -82, 224), -18, -36, (10, 1.57), .24, .92, .58, -.26),
        ((14, 14, -322), -6, 9, (23, 1.02), .08, .84, .91, .40),
        ((13, 22, -409), 12, -14, (19, .86), .10, .81, .83, -.29),
        ((14, 23, -550), 18, 22, (15, 1.53), .21, .89, .80, -.26),
    ),
    HANDGUARD: (
        ((-13, 46, -548), 161, 8, (20, 1.21), .13, .91, 1.04, -.28),
        ((-13, 50, -529), 149, -1, (14, .70), .08, .86, .56, .26),
        ((-11, 55, -465), 134, -24, (17, 1.09), .12, .89, .91, .35),
        ((-13, 48, -399), 158, 14, (22, 1.55), .095, .87, .63, -.49),
        ((-11, 55, -360), 139, -30, (13, 1.61), .19, .90, .79, .41),
        ((-11, 50, -345), 151, -24, (8, .78), .09, .92, .41, -.27),
        ((11, 50, -549), 34, -17, (17, 1.43), .18, .91, .73, .29),
        ((12, 50, -468), 29, -9, (21, 1.03), .12, .89, .97, -.31),
        ((12, 45, -453), 19, -7, (11, .76), .08, .78, .84, .32),
        ((11, 53, -380), 43, 18, (18, 1.33), .12, .92, .94, .33),
        ((10, 51, -309), 34, -25, (13, 1.27), .17, .90, .82, -.23),
    ),
    FOREWOOD: (
        ((-14, 23, -634), 178, -4, (26, 1.24), .12, .92, .92, .29),
        ((-13, 19, -664), 185, -3, (13, .78), .08, .81, .55, -.26),
        ((-13, 22, -749), 166, -19, (20, 1.30), .16, .89, .92, .24),
        ((-12, 24, -842), 159, -12, (21, 1.43), .13, .97, .96, -.29),
        ((-12, 20, -857), 175, -19, (13, .80), .10, .85, .48, .26),
        ((-11, 23, -879), 157, 35, (10, 1.55), .23, .93, .65, -.25),
        ((13, 23, -658), 14, 10, (21, 1.02), .11, .88, .91, -.30),
        ((13, 19, -708), -4, 9, (26, 1.40), .13, .95, .99, .31),
        ((13, 22, -738), 10, -18, (12, .83), .11, .82, .84, -.27),
        ((12, 23, -828), 15, -15, (22, 1.22), .12, .93, .92, .29),
        ((11, 20, -872), 11, 28, (12, 1.43), .21, .91, .77, .22),
    ),
}

VERTEX = """#version 330
in vec2 uv;
in vec3 position, normal;
in vec4 tangent;
out vec3 point, faceNormal;
out vec4 basis;
void main() {
    gl_Position = vec4(uv*2.-1.,0.,1.);
    point = position;
    faceNormal = normal;
    basis = tangent;
}
"""


def Direction(degrees):
    angle = np.deg2rad(degrees)
    return np.cos(angle), np.sin(angle)


def Projection(centre, face):
    x, y, z = np.asarray(centre) * .001
    return z, -x * face[1] + y * face[0]


def SetPaint(program, name):
    regions, strokes = REGIONS[name], STROKES[name]
    regionShape, regionPaint, strokeLine, strokeShape, strokePaint = [], [], [], [], []
    for centre, facing, radii, matte, burnish in regions:
        face = Direction(facing)
        regionShape.append((*Projection(centre, face), radii[0]*.001, radii[1]*.001))
        regionPaint.append((*face, matte, burnish))
    for centre, facing, angle, size, depth, pressure, exposed, bend in strokes:
        face = Direction(facing)
        strokeLine.append((*Projection(centre, face), *Direction(angle)))
        strokeShape.append((*face, size[0]*.001, size[1]*.001))
        strokePaint.append((pressure, depth*.001, exposed, bend))
    program['regionCount'], program['strokeCount'] = len(regions), len(strokes)
    for uniform, rows in (('regionShape', regionShape), ('regionPaint', regionPaint),
                          ('strokeLine', strokeLine), ('strokeShape', strokeShape), ('strokePaint', strokePaint)):
        slot = program[uniform]
        assert len(rows) <= slot.array_length, uniform
        padded = np.zeros((slot.array_length, 4), np.float32)
        padded[:len(rows)] = rows
        slot.write(padded.tobytes())


def ApplyFinish(base, orm, normal, finish, relief):
    active = np.any(finish != 0, axis=2) | np.any(relief != 128, axis=2)
    matte, polish, fibre, cavity = (finish[active].astype(np.float32)/255).T
    rgb = Linear(base[active])
    grain = np.clip((base[active, 0].astype(np.float32)-36.)/65., 0., 1.)
    visibility = orm[active, 0].astype(np.float32)/255.
    polish *= Smoothstep(.68, .92, visibility)
    exposed = (.014*matte + (.052+.017*grain)*fibre)*Smoothstep(.44, .85, visibility)
    rgb = rgb*(1.-.15*polish-.29*cavity)[:, None] + exposed[:, None]*np.array([1., .62, .34], np.float32)
    base[active] = Byte(Srgb(rgb))
    orm[active, 0] = Byte(visibility*(1.-.29*cavity))
    rough = orm[active, 1]/255. + .098*matte-.121*polish+.145*fibre+.100*cavity
    orm[active, 1] = Byte(np.clip(rough, .26, .85))

    original = normal[active].astype(np.float32)/127.5-1.
    slopes = original[:, :2]/np.maximum(original[:, 2:], .25)
    slopes *= (1.-.12*matte-.28*polish)[:, None]
    slopes += (relief[active].astype(np.float32)-128.)*(.8/127.)
    mapped = np.column_stack((slopes, np.ones(len(slopes), np.float32)))
    mapped /= np.linalg.norm(mapped, axis=1, keepdims=True)
    normal[active] = Byte(mapped*.5+.5)


def ApplyFilm(film, finish):
    size = film.shape[:2][::-1]
    planes = [
        np.asarray(Image.fromarray(finish[:, :, channel]).resize(size, Image.Resampling.BOX), np.float32)/255.
        for channel in range(4)
    ]
    matte, polish, fibre, cavity = planes
    strength = film[:, :, 0].astype(np.float32)/255.
    strength *= 1. + .48*polish*Smoothstep(.12, .49, strength)
    strength *= 1.-np.minimum(.88, .49*matte+.76*fibre+.46*cavity)
    film[:, :, 0] = Byte(strength)


def Main(source, output):
    if source.resolve() == output.resolve():
        raise ValueError('Write the wood finish to a separate staging directory')
    report = json.loads((source/REPORT).read_text(encoding='utf8'))
    baseHash = sha256((source/MODEL).read_bytes()).hexdigest()
    assert baseHash == report['gameSha256'] and report['exteriorFinish']['version'] == BASE
    doc, blocks = ReadAsset(source/MODEL)
    original = blocks.copy()
    geometry = {accessor['bufferView'] for accessor in doc['accessors']}
    records = {row['name']: row for row in report['texturePayloads']}
    painted = set()

    def Pixels(image):
        with Image.open(BytesIO(blocks[image['bufferView']])) as picture:
            return np.array(picture.convert('RGB'))

    def Pack(image, pixels):
        pixels = np.ascontiguousarray(pixels)
        stream = BytesIO()
        Image.fromarray(pixels).save(stream, 'WEBP', lossless=True, method=4)
        content = stream.getvalue()
        with Image.open(BytesIO(content)) as decoded:
            assert np.array_equal(np.asarray(decoded.convert('RGB')), pixels), image['name']
        view = image['bufferView']
        assert view not in painted and view not in geometry, image['name']
        assert content != original[view], image['name']
        painted.add(view)
        blocks[view] = content
        records[image['name']].update(sha256=sha256(content).hexdigest(),
                                       sourceSha256=sha256(pixels.tobytes()).hexdigest())

    nodes = [node for node in doc['nodes'] if 'mesh' in node and node['name'] in WOOD]
    shader = Path(__file__).with_name('Shader_HanYangStockWear.frag').read_text(encoding='utf8')
    context = moderngl.create_standalone_context()
    program = context.program(vertex_shader=VERTEX, fragment_shader=shader)
    stats = {}
    try:
        for node, slot, data, indices in PartStreams(doc, blocks, nodes):
            name = node['name']
            mat = doc['materials'][slot]
            pbr = mat['pbrMetallicRoughness']
            baseImage = AtlasImage(doc, pbr['baseColorTexture'])
            ormImage = AtlasImage(doc, pbr['metallicRoughnessTexture'])
            normalImage = AtlasImage(doc, mat['normalTexture'])
            assert mat['occlusionTexture']['index'] == pbr['metallicRoughnessTexture']['index']
            base, orm, normal = map(Pixels, (baseImage, ormImage, normalImage))
            assert base.shape == orm.shape == normal.shape and not orm[:, :, 2].any(), name
            SetPaint(program, name)
            streams = {'uv': data['TEXCOORD_0'], 'position': data['POSITION'],
                       'normal': data['NORMAL'], 'tangent': data['TANGENT']}
            finish, relief = Bake(context, program, base.shape[:2][::-1], (4, 3), [(streams, indices)])
            covered = relief[:, :, 2] == 255
            hits = finish[covered]
            assert len(hits), name
            paintCoverage = (hits >= 24).mean(axis=0)
            assert (paintCoverage > [.010, .014, .001, .001]).all(), (name, paintCoverage)
            near = distance_transform_edt(~covered, return_distances=False, return_indices=True)
            finish = finish[near[0], near[1]]
            relief = relief[near[0], near[1], :2]
            del near
            ApplyFinish(base, orm, normal, finish, relief)
            for image, pixels in ((baseImage, base), (ormImage, orm), (normalImage, normal)):
                Pack(image, pixels)
            coat = mat.get('extensions', {}).get('KHR_materials_clearcoat', {}).get('clearcoatTexture')
            if coat:
                filmImage = AtlasImage(doc, coat)
                film = Pixels(filmImage)
                ApplyFilm(film, finish)
                Pack(filmImage, film)
            stats[name] = {
                'regions': len(REGIONS[name]),
                'strokes': len(STROKES[name]),
                'coverageAt24': dict(zip(('matte', 'polish', 'fibre', 'cavity'), np.round(paintCoverage, 5))),
                'oilFilm': bool(coat),
            }
            print(name, stats[name], flush=True)
    finally:
        program.release()
        context.release()

    assert set(stats) == set(WOOD)
    assert painted == {index for index in range(len(blocks)) if blocks[index] != original[index]}
    assert len(painted) == 11 and painted.isdisjoint(geometry)
    description = 'R40: hand-placed wood abrasion, torn fibres and handling polish baked into the three wood finishes.'
    report['exteriorFinish'].update(version=VERSION, stockWear={
        'baseSha256': baseHash, 'parts': stats, 'changedAtlases': sorted(
            image['name'] for image in doc['images'] if image['bufferView'] in painted),
        'placement': 'Surface-projected strokes and rub masks shared by colour, roughness, relief, material AO and oil film.',
    })
    report['materialMatch']['version'] = VERSION
    report['rebake'] = description
    doc['asset']['extras'].update(materialMatch=VERSION, rebake=description)
    output.mkdir(parents=True, exist_ok=True)
    destination = output/MODEL
    WriteGlb(destination, doc, blocks)
    report['gameSha256'] = sha256(destination.read_bytes()).hexdigest()
    (output/REPORT).write_text(json.dumps(report, indent=2)+'\n', encoding='utf8')
    print(VERSION, len(painted), 'wood atlases', report['gameSha256'])


if __name__ == '__main__':
    Main(*(Path(value) for value in sys.argv[1:]))
