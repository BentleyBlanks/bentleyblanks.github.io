"""Build the 1938 bamboo field stretcher (竹竿布兜担架) and export its GLB.

Execute in the task's BlenderMCP instance (node scripts/Script_BlenderMcp.mjs exec
--file ...) or `blender --background --python`. Set scene['StretcherProject'] to
the absolute Taierzhuang1938 directory when the script is sent as text.

References (kept outside the repo, next to the .blend):
  · 台儿庄战役中民众帮助抬担架救伤员 (抗日战争纪念网《台儿庄战役珍贵照片》)
  · LOC LC-DIG-ds-11832, Nationalist government military activity 1938:
    "Young girls act as stretcher bearers. Stretchers are crudely made..."
Both show the same field pattern: two long bamboo poles with visible nodes, a
coarse cloth slung between them and wrapped round the poles, one lashed
crossbar under each end of the bed, and bare pole ends as handles.

Runtime contract (Script_FirstLevelP012CarryView.P012_STRETCHER_GRIPS):
game +Y up, +Z from the rear bearer toward the front bearer, origin at the
litter centre. Pole centre-lines sit at x = ±0.29, y = 0.12 and end at
z = ±1.075, so the grip centres (z = ±1.0) are 7.5 cm from each pole end.
The patient's head lies toward -Z. One mesh, one material, colours in COLOR_0.
"""
import bpy
import bmesh
import json
import math
import random
from pathlib import Path
from mathutils import Vector

if 'StretcherProject' in bpy.context.scene:
    PROJECT = Path(bpy.context.scene['StretcherProject'])
else:
    PROJECT = Path(__file__).resolve().parents[1]
GLB_PATH = PROJECT / 'Model' / 'Model_BambooStretcher.glb'
SOURCE = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Stretcher')

RAIL_SPACING = 0.58
POLE_Y = 0.12
POLE_HALF = 1.075
POLE_SAG = 0.008          # bow at mid-span under a man's weight
BED_HALF = 0.88           # 1.76 m of cloth; ~20 cm of bare pole left for the hands
CROSS_Z = 0.86
CROSS_HALF = 0.345        # crossbar protrudes ~2.5 cm past each pole
TRIANGLE_LIMIT = 2800

rng = random.Random(1938)


def Linear(srgb):
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


def Mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


BAMBOO = (0.58, 0.48, 0.30)
BAMBOO_NODE = (0.36, 0.28, 0.17)
BAMBOO_GRIP = (0.47, 0.37, 0.24)
BAMBOO_CUT = (0.72, 0.64, 0.46)
CLOTH = (0.60, 0.57, 0.48)
CLOTH_GRIME = (0.42, 0.38, 0.30)
BLOOD = (0.26, 0.15, 0.10)
ROPE = (0.52, 0.44, 0.29)


class MeshBuilder:
    """Collects triangles in game coordinates; converts to Blender on build."""

    def __init__(self):
        self.verts, self.cols, self.faces, self.smooth = [], [], [], []

    def Vert(self, p, color):
        self.verts.append(p)
        self.cols.append(color)
        return len(self.verts) - 1

    def Face(self, idx, smooth=True):
        self.faces.append(tuple(idx))
        self.smooth.append(smooth)

    def Build(self, name):
        mesh = bpy.data.meshes.new(name)
        # glTF (+Y up, +Z) = Blender (x, -y, z) swizzle: game (x,y,z) -> Blender (x,-z,y).
        mesh.from_pydata([(x, -z, y) for x, y, z in self.verts], [], self.faces)
        mesh.polygons.foreach_set('use_smooth', self.smooth)
        attr = mesh.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
        for i, c in enumerate(self.cols):
            attr.data[i].color = (*Linear(c), 1.0)
        mesh.color_attributes.active_color = attr
        mesh.update()
        return mesh


def Tube(mb, center, frame, stations, radius, color, sides, caps):
    """Loft rings along `stations` (parameter list); center/radius/color are functions of t."""
    rings = []
    for t in stations:
        c = center(t)
        a, b = frame(t)
        r = radius(t)
        col = color(t)
        ring = []
        for k in range(sides):
            ang = 2 * math.pi * k / sides
            p = c + a * (math.cos(ang) * r) + b * (math.sin(ang) * r)
            ring.append(mb.Vert(tuple(p), col))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(sides):
            k1 = (k + 1) % sides
            mb.Face((r0[k], r0[k1], r1[k1], r1[k]))
    if caps:
        for end, sign in ((stations[0], -1), (stations[-1], 1)):
            c = center(end)
            a, b = frame(end)
            r = radius(end)
            hub = mb.Vert(tuple(c), BAMBOO_CUT)
            ring = [mb.Vert(tuple(c + a * (math.cos(2 * math.pi * k / sides) * r)
                                  + b * (math.sin(2 * math.pi * k / sides) * r)), BAMBOO_NODE)
                    for k in range(sides)]
            for k in range(sides):
                k1 = (k + 1) % sides
                mb.Face((hub, ring[k1], ring[k]) if sign < 0 else (hub, ring[k], ring[k1]), smooth=False)


def PoleY(z):
    return POLE_Y - POLE_SAG * (1 - (z / POLE_HALF) ** 2)


def Pole(mb, x, seed):
    local = random.Random(seed)
    # Irregular internodes (~0.30–0.46 m); never under the hands at z = ±1.0.
    nodes, z = [], -POLE_HALF + local.uniform(0.20, 0.26)
    while z < POLE_HALF - 0.16:
        if abs(abs(z) - 1.0) > 0.07:
            nodes.append(z)
        z += local.uniform(0.30, 0.46)
    stations = {-POLE_HALF, POLE_HALF, -0.93, 0.93}
    for n in nodes:
        stations.update((n - 0.016, n - 0.004, n + 0.004, n + 0.016))
    stations = sorted(stations)
    hue = {i: local.uniform(-0.09, 0.07) for i in range(len(nodes) + 1)}

    def Radius(t):
        base = 0.0325 - 0.0035 * (t + POLE_HALF) / (2 * POLE_HALF)   # culm taper
        return base + (0.0035 if any(abs(t - n) < 0.005 for n in nodes) else 0)

    def Color(t):
        if any(abs(t - n) < 0.005 for n in nodes):
            return BAMBOO_NODE
        seg = sum(1 for n in nodes if n < t)
        c = tuple(min(1, max(0, v * (1 + hue[seg]))) for v in BAMBOO)
        return BAMBOO_GRIP if abs(t) > 0.93 else c

    Tube(mb, lambda t: Vector((x, PoleY(t), t)), lambda t: (Vector((1, 0, 0)), Vector((0, 1, 0))),
         stations, Radius, Color, sides=10, caps=True)
    return nodes


def CrossbarY():
    return PoleY(CROSS_Z) - 0.031 - 0.019


def Crossbar(mb, z):
    y = CrossbarY()
    stations = [-CROSS_HALF, -0.18, 0.18, CROSS_HALF]
    Tube(mb, lambda t: Vector((t, y, z)), lambda t: (Vector((0, 0, 1)), Vector((0, 1, 0))),
         stations, lambda t: 0.019, lambda t: Mix(BAMBOO, BAMBOO_NODE, 0.25), sides=8, caps=True)


def Lashing(mb, x, z):
    """Diagonal square lashing: two rope loops forming an X over pole and crossbar."""
    top = PoleY(z) + 0.0355
    bottom = CrossbarY() - 0.0225
    cy, hy = (top + bottom) / 2, (top - bottom) / 2
    for diag in (Vector((1, 0, 1)).normalized(), Vector((1, 0, -1)).normalized()):
        centre = Vector((x, cy, z))
        seg, sides, rope = 8, 3, 0.0065
        rings = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            p = centre + diag * (math.cos(a) * 0.036) + Vector((0, 1, 0)) * (math.sin(a) * hy)
            tangent = (diag * (-math.sin(a) * 0.036) + Vector((0, 1, 0)) * (math.cos(a) * hy)).normalized()
            n1 = (p - centre).normalized()
            n2 = tangent.cross(n1).normalized()
            n1 = n2.cross(tangent).normalized()
            shade = Mix(ROPE, (0.36, 0.30, 0.20), rng.uniform(0, 0.35))
            rings.append([mb.Vert(tuple(p + n1 * (math.cos(2 * math.pi * k / sides) * rope)
                                          + n2 * (math.sin(2 * math.pi * k / sides) * rope)), shade)
                          for k in range(sides)])
        for i in range(seg):
            r0, r1 = rings[i], rings[(i + 1) % seg]
            for k in range(sides):
                k1 = (k + 1) % sides
                mb.Face((r0[k], r0[k1], r1[k1], r1[k]))


def ClothProfile():
    """Cross-section across x: the cloth is tucked round the underside of each pole.

    Both 1938 photographs show the bamboo bare along the top with the cloth
    hanging from its inner edge, so the wrap runs from under the outside of the
    pole, round the bottom, up the inner face, and only then drops into the belly.
    Four points keep every chord outside the culm (0.039·cos27.5° > r).
    """
    wrap = 0.039
    angles = (300, 245, 190, 150)
    pts = [(RAIL_SPACING / 2 + math.cos(math.radians(a)) * wrap, math.sin(math.radians(a)) * wrap, 0.0)
           for a in angles]
    inner_x, inner_y = pts[-1][0], pts[-1][1]
    span = 10
    for i in range(1, span):
        u = i / span                                   # 0..1 across the free span
        depth = math.sin(math.pi * u) ** 0.75          # full belly, steep near the poles
        pts.append((inner_x - u * 2 * inner_x, inner_y, depth))
    for x, y, d in reversed(pts[:len(angles)]):
        pts.append((-x, y, d))
    return pts


def Cloth(mb):
    profile = ClothProfile()
    along = [-BED_HALF + 2 * BED_HALF * i / 18 for i in range(19)]
    stains = [(0.03, -0.08, 0.12), (-0.04, 0.20, 0.075)]
    grid_top, grid_bottom = [], []
    for z in along:
        e = abs(z) / BED_HALF
        # Deep belly mid-length; near the ends the cloth rests on the crossbars.
        # Depth is measured from the inner lip (profile[3]); the belly bottoms out
        # near y = 0.04, where MissionPeople lays the patient (+0.07 root).
        lip = PoleY(z) + profile[3][1]
        rest = lip - (CrossbarY() + 0.019 + 0.004)
        depth = rest + (lip - 0.04 - rest) * (1 - e ** 2.2)
        row_t, row_b = [], []
        for j, (x, yo, d) in enumerate(profile):
            y = PoleY(z) + yo - d * depth + (rng.uniform(-0.002, 0.002) if 0 < d < 1 else 0)
            # Transverse creases where the body presses down.
            y -= 0.006 * d * math.sin(z * 9.0 + x * 7.0) ** 2 + 0.003 * d * math.sin(x * 31.0 + z * 2.0)
            col = CLOTH
            edge = 1 - min(1, d * 3)
            col = Mix(col, CLOTH_GRIME, 0.55 * edge + 0.25 * e ** 3)
            for sx, sz, sr in stains:
                dist = math.hypot((x - sx) / sr, (z - sz) / (sr * 1.6))
                if dist < 1:
                    col = Mix(col, BLOOD, 0.62 * (1 - dist) ** 0.6)
            col = tuple(min(1, max(0, c * (1 + rng.uniform(-0.03, 0.03)))) for c in col)
            row_t.append(mb.Vert((x, y, z), col))
            under = Mix(col, CLOTH_GRIME, 0.35)
            row_b.append(mb.Vert((x * 0.995, y - 0.004, z), under))
        grid_top.append(row_t)
        grid_bottom.append(row_b)
    for i in range(len(along) - 1):
        for j in range(len(profile) - 1):
            t0, t1 = grid_top[i], grid_top[i + 1]
            b0, b1 = grid_bottom[i], grid_bottom[i + 1]
            # Top faces point up (+Y) — winding checked by the normal audit below.
            mb.Face((t0[j], t1[j], t1[j + 1], t0[j + 1]))
            mb.Face((b0[j], b0[j + 1], b1[j + 1], b1[j]))
    # Hem the two cloth ends so the edge reads as a folded seam, not a paper cut.
    for i in (0, len(along) - 1):
        for j in range(len(profile) - 1):
            t, b = grid_top[i], grid_bottom[i]
            mb.Face((t[j], t[j + 1], b[j + 1], b[j]) if i == 0 else (t[j], b[j], b[j + 1], t[j + 1]))


def ClearScene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras, bpy.data.lights):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def Material():
    mat = bpy.data.materials.new('BambooStretcherVertexColor')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    shader = nodes.get('Principled BSDF')
    attr = nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    mat.node_tree.links.new(attr.outputs['Color'], shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value = 0.9
    shader.inputs['Metallic'].default_value = 0.0
    return mat


def Audit(obj):
    """Return triangle count, bounds and the contract probes the runtime relies on."""
    mesh = obj.data
    mesh.calc_loop_triangles()
    game = [(v.co.x, v.co.z, -v.co.y) for v in mesh.vertices]
    lo = [min(p[i] for p in game) for i in range(3)]
    hi = [max(p[i] for p in game) for i in range(3)]
    # Cloth top must face up: average normal of faces above the sag centre.
    ups = [p.normal.z for p in mesh.polygons if abs(p.center.x) < 0.1 and p.normal.z > 0]
    return {
        'triangles': len(mesh.loop_triangles),
        'vertices': len(mesh.vertices),
        'boundsMin': [round(v, 4) for v in lo],
        'boundsMax': [round(v, 4) for v in hi],
        'clothUpFaces': len(ups),
    }


def Build():
    ClearScene()
    mb = MeshBuilder()
    nodes = [Pole(mb, x, seed) for x, seed in ((RAIL_SPACING / 2, 38), (-RAIL_SPACING / 2, 83))]
    for z in (-CROSS_Z, CROSS_Z):
        Crossbar(mb, z)
        for x in (-RAIL_SPACING / 2, RAIL_SPACING / 2):
            Lashing(mb, x, z)
    Cloth(mb)
    mesh = mb.Build('BambooStretcher')
    obj = bpy.data.objects.new('BambooStretcher', mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(Material())
    obj['Reference'] = 'krzzjn 台儿庄民众抬担架; LOC LC-DIG-ds-11832 (1938)'
    obj['RuntimeAxis'] = 'glTF +Z toward front bearer; head at -Z; poles x=±0.29 y=0.12 end z=±1.075'
    report = Audit(obj)
    report['poleNodes'] = [[round(n, 3) for n in pole] for pole in nodes]
    if report['triangles'] > TRIANGLE_LIMIT:
        raise RuntimeError(f"stretcher triangles {report['triangles']} > {TRIANGLE_LIMIT}")
    for o in bpy.context.scene.objects:
        o.select_set(o == obj)
    bpy.context.view_layer.objects.active = obj
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH), export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_animations=False,
        export_extras=False, export_materials='EXPORT', export_vertex_color='ACTIVE',
        export_normals=True, export_texcoords=False, export_tangents=False)
    report['glbBytes'] = GLB_PATH.stat().st_size
    # Editable source + packed reference photos live outside the Pages repo.
    SOURCE.mkdir(parents=True, exist_ok=True)
    for ref in sorted((SOURCE / 'Reference').glob('Ref_*.jpg')):
        image = bpy.data.images.load(str(ref), check_existing=True)
        image.pack()
        image.use_fake_user = True
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'Model_BambooStretcher.blend'))
    (SOURCE / 'Data_StretcherBuild.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    return report


if __name__ == '__main__':
    print(json.dumps(Build(), ensure_ascii=False))
