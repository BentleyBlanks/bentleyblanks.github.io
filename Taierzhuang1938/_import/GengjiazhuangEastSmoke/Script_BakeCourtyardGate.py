"""Rebuild the walk-through courtyard gate from its modeled elevations."""

import argparse
from math import sin
from pathlib import Path
import random
import sys
import tempfile

import bpy

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve()
sys.path.insert(0, str(HERE.parent.parent / "GengjiazhuangFieldApproach"))
from Script_BakeFieldApproachModels import Bounds, FRONT, SIDE, Studio, TOP, VIEWS
from Script_FieldApproachMesh import Box, Materials, Mesh, Tube

OUTPUT = HERE.parents[2] / "Model" / "GengjiazhuangEastSmoke" / "Model_CourtyardGate.glb"


def Wall(mesh, material, profile):
    """Extrude an irregular elevation, with the door gap outside the profile."""
    points = [(profile[0][0], 0), (profile[-1][0], 0), *reversed(profile)]
    count = len(points)
    vertices = [(x, y, z) for y in (-.20, .20) for x, z in points]
    faces = [tuple(range(count)), tuple(reversed(range(count, 2 * count)))]
    for i in range(count):
        j = (i + 1) % count
        faces.append((i, count + i, count + j, j))
    mesh.Add(material, vertices, faces)


def Build(mesh, materials):
    rng = random.Random(193807)
    plaster = materials.Make("EastGatePlaster", (.42, .392, .357), finish="plaster")
    stone = [materials.Make("EastGateBrick" + str(i), color, finish="plaster") for i, color in enumerate([
        (.34, .32, .292), (.372, .346, .307), (.29, .286, .266),
    ])]
    timber = materials.Make("EastGateTimber", (.229, .189, .145), finish="wood")
    tiles = materials.Make("EastGateTiles", (.253, .250, .239), finish="plaster")

    Wall(mesh, plaster, [(-3.90, .81), (-3.86, 1.24), (-3.64, 1.52), (-3.38, 1.69),
        (-2.89, 1.62), (-2.3, 1.64), (-1.7, 1.59), (-1.14, 1.67), (-.58, 1.64),
        (-.13, 1.72), (.55, 1.80)])
    Wall(mesh, plaster, [(1.82, 1.87), (2.06, 1.77), (2.27, 1.59), (2.51, 1.52),
        (2.67, 1.28), (2.91, 1.18), (3.05, .89), (3.35, .88), (3.51, .77), (3.9, .68)])
    for center, rows, span in [(-3.48, 8, 1.35), (-.08, 3, 1.12), (2.00, 4, .45), (3.55, 6, 1.4)]:
        for row in range(rows):
            width = span * (1 - .065 * row)
            for column in range(max(1, int(width / .22))):
                x = center - width * .5 + (column + .5) * .22 + (row % 2) * .095
                if x < -3.83 or x > 3.83 or .45 < x < 1.88 or rng.random() < .18:
                    continue
                for side in (-1, 1):
                    Box(mesh, rng.choice(stone), (x, side * .195, .07 + row * .125),
                        (rng.uniform(.16, .212), rng.uniform(.045, .085), rng.uniform(.082, .114)))

    for x in (.52, 1.85):
        Box(mesh, timber, (x, 0, .90), (.15, .45, 1.80), bevel=.014)
    Box(mesh, timber, (1.183, 0, 1.835), (1.74, .55, .16), bevel=.018)
    for side in (-1, 1):
        for i in range(14):
            x = .29 + i * .138
            sag = -.042 * sin(i / 13 * 3.14159)
            height = 2.132 + sag + rng.uniform(-.013, .013)
            Tube(mesh, tiles, [(x, 0, height), (x, side * .19, height - .069),
                (x, side * .33, height - .125), (x, side * .38, height - .127)],
                [.050, .055, .058, .054], 8, aspect=.81)
            Box(mesh, tiles, (x, side * .22, height - .137), (.139, .38, .09))
    Tube(mesh, tiles, [(.21, 0, 2.151), (.62, 0, 2.12), (1.19, 0, 2.098),
        (1.76, 0, 2.121), (2.14, 0, 2.153)], [.054] * 5, 9, aspect=.74)


def Bake(source=None, reference=None):
    if bpy.data.filepath:
        raise RuntimeError("Start a fresh task Blender before baking the gate.")
    scene = bpy.context.scene
    scene.name = "CourtyardGate"
    scene.unit_settings.system = "METRIC"
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    collection = bpy.data.collections.new("Gate Mesh")
    scene.collection.children.link(collection)
    mesh = Mesh()
    with tempfile.TemporaryDirectory(prefix="EastSmokeGate") as scratch:
        Build(mesh, Materials(Path(scratch)))
        objects = mesh.Emit(collection)
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        for obj in objects:
            obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format="GLB", use_selection=True,
                                  use_active_scene=True, export_animations=False, export_image_format="WEBP")
        low, high = Bounds(objects)
        triangles = sum(len(p.vertices) - 2 for obj in objects for p in obj.data.polygons)
        print("COURTYARD_GATE", triangles, tuple(round(n, 4) for n in high - low))
        if source:
            VIEWS[scene.name] = (FRONT, SIDE, TOP)
            Studio(scene, low, high)
            scene.render.resolution_x, scene.render.resolution_y = 1280, 720
            if reference:
                bpy.data.images.load(str(reference), check_existing=True).pack()
            bpy.context.preferences.filepaths.save_version = 0
            bpy.ops.wm.save_as_mainfile(filepath=str(source))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path)
    parser.add_argument("--reference", type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    Bake(args.source, args.reference)
