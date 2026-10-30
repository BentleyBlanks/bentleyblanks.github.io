"""Metric chipped coating and handling abrasion on repacked V68 UV islands.

Paint is dielectric. Bare worn steel, dark primer margins and scuffed coating
have separate Base/roughness/metalness/height responses. No painted highlights.
"""
from pathlib import Path
import hashlib, json, math, os
import numpy as np
from PIL import Image, ImageDraw

root = Path(os.environ.get('TYPE94_WEAR_ROOT', r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/SurfaceV77'))
folder = root / 'Textures/HighSurfaceV77Preview'
edges = json.loads((root / 'Acceptance/Data_WearEdgesV77.json').read_text())
surfaces = json.loads((root / 'Acceptance/Data_WearSurfacesV77.json').read_text())
size, factor = 4096, 2
layers = {name: Image.new('L', (size * factor,) * 2) for name in ['Core', 'Scuff', 'Scratch']}
draws = {name: ImageDraw.Draw(image) for name, image in layers.items()}


def Seed(text):
    return int.from_bytes(hashlib.sha256(text.encode()).digest()[:8], 'little')


def Pixel(uv):
    return np.asarray(uv) * [1, -1] * (size - 1) * factor + [0, (size - 1) * factor]


def Cross2(a, b):
    return a[0] * b[1] - a[1] * b[0]


def Clip(polygon, triangle):
    result = polygon
    orientation = Cross2(triangle[1] - triangle[0], triangle[2] - triangle[0])
    sign = 1 if orientation > 0 else -1
    for a, b in zip(triangle, np.roll(triangle, -1, axis=0)):
        source, result = result, []
        if not len(source):
            break
        for c, d in zip(source, np.roll(source, -1, axis=0)):
            fc = sign * Cross2(b - a, c - a)
            fd = sign * Cross2(b - a, d - a)
            if fc >= -1e-12:
                result.append(c)
            if (fc < 0) != (fd < 0):
                result.append(c + (d - c) * fc / (fc - fd))
        result = np.asarray(result)
    return result


def Polygon(draw, centre, direction, length, width, rng, clipTriangles, value=255):
    tangent = direction / max(np.linalg.norm(direction), 1e-15)
    across = np.array([-tangent[1], tangent[0]])
    p = []
    for side in [1, -1]:
        for t in (np.linspace(-.5, .5, 7) if side == 1 else np.linspace(.5, -.5, 7)):
            p.append(tuple(centre + tangent * length * t + across * width * side * rng.uniform(.16, .57)))
    for triangle in clipTriangles:
        clipped = Clip(np.asarray(p), np.asarray([Pixel(uv) for uv in triangle]))
        if len(clipped) > 2:
            draw.polygon([tuple(x) for x in clipped], fill=value)


chipCount = 0
for index, edge in enumerate(edges['edges']):
    if edge['lengthM'] < .0008:
        continue
    rng = np.random.default_rng(Seed(edge['owner'] + str(index)))
    exposure = edge['exposure']
    count = max(1, math.ceil(edge['lengthM'] / .024))
    for part in range(count):
        if rng.random() > .15 + .52 * exposure:
            continue
        t = (part + rng.uniform(.12, .88)) / count
        lengthM = min(edge['lengthM'] / count * rng.uniform(.38, .85), .037)
        widthM = rng.uniform(.0025, .011) * (.65 + exposure)
        if rng.random() < .08:
            widthM *= 1.8
        for segment in edge['segments']:
            a, b = Pixel(segment['uvA']), Pixel(segment['uvB'])
            density = segment['pixelsPerMetre'] * factor
            c = a + (b - a) * t
            direction = b - a
            Polygon(draws['Scuff'], c, direction, lengthM * density * 1.4, widthM * density * 2.8, rng, segment['clipUvTriangles'], 195)
            Polygon(draws['Core'], c, direction, lengthM * density, widthM * density, rng, segment['clipUvTriangles'])
            chipCount += 1

# Coplanar physical faces share sampling and clipping. No triangle wireframe,
# repeating lattice or identical sets of straight parallel pale lines.
groups = {}
for tri in surfaces['paintTriangles']:
    p = np.asarray(tri['pointsWorldM'])
    n = np.cross(p[1] - p[0], p[2] - p[0])
    n /= np.linalg.norm(n)
    if n[np.argmax(abs(n))] < 0:
        n = -n
    key = (tri['owner'], *np.rint(n * 10000).astype(int), round(float(n @ p[0]) * 10000))
    groups.setdefault(key, []).append(tri)


def Stamp(prepared, polygon, name, value):
    low, high = polygon.min(axis=0), polygon.max(axis=0)
    for tri, xy, inverse in prepared:
        if np.any(xy.max(axis=0) < low) or np.any(xy.min(axis=0) > high):
            continue
        clipped = Clip(polygon, xy)
        if len(clipped) < 3:
            continue
        bary = (clipped - xy[0]) @ inverse.T
        uv = np.asarray(tri['uv'])
        coords = uv[0] + bary[:, :1] * (uv[1] - uv[0]) + bary[:, 1:] * (uv[2] - uv[0])
        draws[name].polygon([tuple(Pixel(p)) for p in coords], fill=value)


scratchCount, scuffCount = 0, 0
for key, triangles in groups.items():
    n = np.asarray(key[1:4], float)
    n /= np.linalg.norm(n)
    origin = n * (key[4] / 10000)
    u = np.array([0., 1., 0.])
    u -= n * (u @ n)
    if np.linalg.norm(u) < .1:
        u = np.array([1., 0., 0.])
        u -= n * (u @ n)
    u /= np.linalg.norm(u)
    v = np.cross(n, u)
    prepared, area = [], 0
    for tri in triangles:
        p = np.asarray(tri['pointsWorldM'])
        xy = np.c_[(p - origin) @ u, (p - origin) @ v]
        matrix = np.column_stack((xy[1] - xy[0], xy[2] - xy[0]))
        determinant = np.linalg.det(matrix)
        if abs(determinant) > 1e-12:
            prepared.append((tri, xy, np.linalg.inv(matrix)))
            area += abs(determinant) / 2
    if not prepared or area < .001:
        continue
    rng = np.random.default_rng(Seed(str(key)))
    points = np.vstack([p[1] for p in prepared])
    lo, hi = points.min(axis=0), points.max(axis=0)
    exposure = max(t['exposure'] for t in triangles)
    # Hands, hatch access, fenders and their narrow adjacent plates get the
    # clearest abrasion. Broad protected upper plates retain most coating.
    handling = any(x in key[0] for x in ['Hatch', 'Vent', 'Turret'])
    density = 23 + 65 * exposure + (65 if handling else 0)
    count = min(160, int((hi - lo).prod() * density))
    for mark in range(count):
        c = rng.uniform(lo, hi)
        angle = rng.uniform(-math.pi, math.pi)
        direction = np.array([math.cos(angle), math.sin(angle)])
        across = np.array([-direction[1], direction[0]])
        length = rng.uniform(.018, .075)
        width = rng.uniform(.004, .018)
        polygon = []
        for t in np.linspace(0, 2 * math.pi, 13, endpoint=False):
            polygon.append(c + (direction * math.cos(t) * length + across * math.sin(t) * width) * rng.uniform(.35, .57))
        Stamp(prepared, np.asarray(polygon), 'Scuff', int(rng.integers(90, 210)))
        if handling and rng.random() < .16:
            # A few handling scuffs actually break through the coating; the
            # remainder retain their dielectric pigment and worn sheen.
            chip = c + (np.asarray(polygon) - c) * rng.uniform(.48, .72)
            Stamp(prepared, chip, 'Core', 255)
        scuffCount += 1
        for stroke in range(int(rng.integers(1, 5))):
            centre = c + across * rng.uniform(-width / 2, width / 2)
            extent = length * rng.uniform(.23, .65)
            # Tapered irregular gouges, mostly roughness-only; a minority cuts
            # through paint and exposes actual conducting metal.
            w = rng.uniform(.00045, .0015)
            polygon = np.asarray([centre - direction * extent / 2,
                centre - direction * extent * .2 + across * w,
                centre + direction * extent / 2,
                centre + direction * extent * .11 - across * w * .65])
            Stamp(prepared, polygon, 'Scratch', int(rng.integers(140, 255)))
            if rng.random() < .28:
                Stamp(prepared, polygon, 'Core', int(rng.integers(180, 255)))
            scratchCount += 1

# Break the masks at a finer scale; do not add light/shadow to Base.
rng = np.random.default_rng(7768)
noise = Image.fromarray(rng.integers(0, 256, (512, 512), dtype=np.uint8)).resize((size, size), Image.Resampling.BICUBIC)
fine = rng.random((size, size), dtype=np.float32)
grain = np.asarray(noise, dtype=np.float32) / 255
masks, arrays = {}, {}
for name, image in layers.items():
    image = image.resize((size, size), Image.Resampling.LANCZOS)
    pixels = np.asarray(image, dtype=np.float32) / 255
    if name == 'Core':
        pixels *= np.clip((grain - .20) * 2.6 + fine * .18, 0, 1)
    file = folder / ('Texture_Type94PaintWear77' + name + '.png')
    image = Image.fromarray(np.rint(pixels * 255).astype(np.uint8))
    image.save(file)
    arrays[name] = pixels
    masks[name] = str(file)

core, scuff, scratch = [arrays[x] for x in ['Core', 'Scuff', 'Scratch']]
# A sub-texel transition inside the loss mask, rather than a wide dark outline.
# External dilation makes unrelated UV islands acquire false thick paint rims.
primer = np.clip((.92 - core) * 3, 0, 1) * np.clip(core * 4, 0, 1) * .18
height = np.clip(1 - core - .125 * scratch, 0, 1)
heightFile = folder / 'Texture_Type94PaintWear77Height.png'
Image.fromarray(np.rint(height * 255).astype(np.uint8)).save(heightFile)
masks['Height'] = str(heightFile)
primerFile = folder / 'Texture_Type94PaintWear77Primer.png'
Image.fromarray(np.rint(primer * 255).astype(np.uint8)).save(primerFile)
masks['Primer'] = str(primerFile)


def Linear(x):
    return np.where(x <= .04045, x / 12.92, ((x + .055) / 1.055) ** 2.4)


def Srgb(x):
    return np.where(x <= .0031308, x * 12.92, 1.055 * np.maximum(x, 0) ** (1 / 2.4) - .055)


base = np.asarray(Image.open(folder / 'Texture_Type94PaintBaseInput.png').convert('RGB'))
orm = np.array(Image.open(folder / 'Texture_Type94PaintOrmInput.png').convert('RGB'))
inputAo = orm[:, :, 0].copy()
pigment = Linear(base.astype(np.float32) / 255)
rubbed = scuff * .25
pigment *= (1 - rubbed[:, :, None] * .18)
darkRim = Linear(np.array([61., 57., 43.], dtype=np.float32) / 255)
pigment = pigment * (1 - primer[:, :, None]) + darkRim * primer[:, :, None]
steel = .245 + grain * .20 + fine * .025
steelRgb = steel[:, :, None] * np.array([.94, .98, 1.], dtype=np.float32)
pigment = pigment * (1 - core[:, :, None]) + steelRgb * core[:, :, None]
base = np.rint(np.clip(Srgb(pigment), 0, 1) * 255).astype(np.uint8)
rough = orm[:, :, 1].astype(np.float32) / 255
abrasion = np.maximum(scuff * .7, scratch * .9)
rough = rough * (1 - abrasion) + (.53 + grain * .11) * abrasion
rough = rough * (1 - primer) + .73 * primer
rough = rough * (1 - core) + (.24 + grain * .19) * core
orm[:, :, 1] = np.rint(np.clip(rough, 0, 1) * 255).astype(np.uint8)
metal = orm[:, :, 2].astype(np.float32) / 255
metal = metal * (1 - primer) * (1 - core) + .97 * core
orm[:, :, 2] = np.rint(np.clip(metal, 0, 1) * 255).astype(np.uint8)
assert np.array_equal(inputAo, orm[:, :, 0])
outputs = {}
for label, pixels in [('PaintBase', base), ('PaintOrm', orm)]:
    file = folder / ('Texture_Type94' + label + 'Wear77.png')
    Image.fromarray(pixels).save(file)
    outputs[label] = dict(file=str(file), sha256=hashlib.sha256(file.read_bytes()).hexdigest())
# The atlas pack preserves projection directions. Compose its shallow relief
# in tangent space using local metric texel density, instead of a broad bump
# on the original low-density atlas. Heights do not displace any vertex.
density = np.load(root / 'Acceptance/Data_AtlasDensityV77.npy')
gradientY, gradientX = np.gradient(height)
normalFile = folder / 'Texture_Type94PaintNormalInput.png'
normal = np.asarray(Image.open(normalFile).convert('RGB'), dtype=np.float32) / 127.5 - 1
normal[:, :, :2] *= .85
normal /= np.maximum(np.linalg.norm(normal, axis=2, keepdims=True), 1e-8)
detail = np.stack((-gradientX * density * .00004, gradientY * density * .00004, np.ones_like(density)), axis=-1)
detail /= np.maximum(np.linalg.norm(detail, axis=2, keepdims=True), 1e-8)
normal[:, :, 2] += 1
detail[:, :, :2] *= -1
dot = np.sum(normal * detail, axis=2) / np.maximum(normal[:, :, 2], 1e-8)
normal = normal * dot[:, :, None] - detail
normal /= np.maximum(np.linalg.norm(normal, axis=2, keepdims=True), 1e-8)
file = folder / 'Texture_Type94PaintNormalWear77.png'
Image.fromarray(np.rint(np.clip(normal * .5 + .5, 0, 1) * 255).astype(np.uint8)).save(file)
outputs['PaintNormal'] = dict(file=str(file), sha256=hashlib.sha256(file.read_bytes()).hexdigest())
report = dict(outputs=outputs, masks=masks, edgeChipSegments=chipCount,
    handlingScuffs=scuffCount, handlingScratches=scratchCount,
    addedOpaqueCoreAtlasFraction=float(np.mean(core > .5)),
    coreNonzeroAtlasFraction=float(np.mean(core > 0)),
    scuffAtlasFraction=float(np.mean(scuff > 0)),
    paintAoExact=True, otherThreeMaterialFamiliesExact=True,
    paintLossHeightM=.00004, scratchHeightM=.000005,
    edgesClippedToActualAdjacentFaces=True, dilatedPrimer=False,
    scope='Inferred irregular metric wear at true convex edges and clipped physical handling faces. Dark dielectric primer borders, conducting worn steel, independent coating abrasion. No historical damage-position or shape-acceptance claim.')
(root / 'Acceptance/Data_WearBakeV77.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: v for k, v in report.items() if k not in ['outputs', 'masks']}, indent=2))
