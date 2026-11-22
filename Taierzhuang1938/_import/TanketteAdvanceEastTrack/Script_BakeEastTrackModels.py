"""Rebuild the two foreground props through the repository Blender launcher."""

import argparse
import json
from math import atan2, cos, pi, sin, tau
from pathlib import Path
from random import Random
import sys
from tempfile import TemporaryDirectory

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
sys.path.insert(0, str(HERE.parent / "GengjiazhuangFieldApproach"))
from Script_BakeFieldApproachModels import Bounds, Studio
from Script_FieldApproachMesh import Materials, Mesh, Tube


def ProjectWood(materials, name, texture, color, strength):
    material = materials.Make(name, color)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes.get("Principled BSDF")
    for suffix, space in [("Base","sRGB"), ("Normal","Non-Color")]:
        image = nodes.new("ShaderNodeTexImage")
        file = PROJECT / "Texture" / f"Texture_{texture}{suffix}.webp"
        image.image = bpy.data.images.load(str(file), check_existing=True)
        image.image.colorspace_settings.name = space
        image.image.pack()
        if suffix == "Base":
            links.new(image.outputs["Color"], shader.inputs["Base Color"])
        else:
            relief = nodes.new("ShaderNodeNormalMap")
            relief.inputs["Strength"].default_value = strength
            links.new(image.outputs["Color"], relief.inputs["Color"])
            links.new(relief.outputs["Normal"], shader.inputs["Normal"])
    return material


def SplinteredElm(mesh, materials):
    bark = ProjectWood(materials, "EastTrackElmBark", "TreeBark", (.235,.205,.181), .82)
    sap = materials.Make("EastTrackElmExposedWood", (.47, .353, .238), finish="wood")
    dry = materials.Make("EastTrackElmInnerSplit", (.279, .216, .158), finish="wood")
    rng = Random(19380604)
    sides, levels = 112, 67
    vertices = []
    tip = [rng.uniform(-.32, .38) + .15 * sin(i * .29) for i in range(sides)]
    trunk_height = 4.1
    for ring in range(levels):
        fraction = ring / (levels - 1)
        for j in range(sides):
            theta = tau * j / sides
            flare = (1.0 - fraction)**15 * (.17 + .08 * cos(theta * 7 + .8))
            ridge = .022 * sin(theta * 17 + fraction * 3) + .012 * sin(theta * 38 - fraction * 7)
            radius = .54 - .09 * fraction + flare + ridge
            radius += .04 * sin(5 * theta + fraction * 2) + rng.uniform(-.009, .009)
            z = fraction * trunk_height + tip[j] * fraction**12
            vertices.append((.18 * fraction + radius * cos(theta),
                             -.06 * fraction + .84 * radius * sin(theta), z))
    patches = {material: ([], []) for material in (bark, sap, dry)}
    for i in range(levels - 1):
        fraction = (i + .5) / (levels - 1)
        for j in range(sides):
            nxt = (j + 1) % sides
            angle = tau * (j + .5) / sides + pi / 2
            angle = atan2(sin(angle), cos(angle))
            upper = fraction > .39 and abs(angle - .97 - .15 * sin(fraction * 11)) < (fraction - .35) * .65
            base = .105 < fraction < .37 and abs(angle - .83 + .6 * fraction) < .178 * sin(pi * (fraction - .105) / .265)
            material = (dry if rng.random() < .19 else sap) if upper or base else bark
            a, b = j * 2 / sides, (j + 1) * 2 / sides
            c, d = i / 15, (i + 1) / 15
            faces, uv = patches[material]
            faces.append((i*sides+j, i*sides+nxt, (i+1)*sides+nxt, (i+1)*sides+j))
            uv.append(((a,c), (b,c), (b,d), (a,d)))
    for material, (faces, uv) in patches.items():
        used = sorted({index for face in faces for index in face})
        local = {original: index for index, original in enumerate(used)}
        mesh.Add(material, [vertices[index] for index in used],
                 [tuple(local[index] for index in face) for face in faces], uv=uv, smooth=True)
    peak = (0.18, -0.06, 3.81)
    crown = vertices[-sides:]
    for j, a in enumerate(crown):
        b = crown[(j + 1) % sides]
        mesh.Add(sap if j % 5 else dry, [a, b, peak], [(0, 1, 2)])
    for j in range(11):
        angle = tau * j / 11 + rng.uniform(-.17, .17)
        c, s = cos(angle), sin(angle)
        extent = rng.uniform(.86, 1.42)
        Tube(mesh, bark, [(c*.29, s*.29, .42), (c*.62, s*.62, .16),
                          (c*extent*.78, s*extent*.78, .06), (c*extent, s*extent, .014)],
             [.19, .135, .072, .012], 13, aspect=.62, furrow=.20, tile=(1, 1.45))
    for index, (points, radii) in enumerate([
        ([(.32,-.05,2.96),(.62,-.07,3.15),(.92,-.04,3.30),(1.17,.01,3.36),(1.44,.07,3.57)], [.197,.16,.11,.068,.024]),
        ([(.92,-.04,3.30),(1.05,-.10,3.55),(1.20,-.12,3.84)], [.092,.061,.019]),
        ([(-.33,.05,2.65),(-.62,.09,2.77),(-.74,.12,2.95)], [.106,.076,.035]),
        ([(.27,.20,1.98),(.51,.35,2.02),(.66,.38,2.17)], [.098,.068,.031]),
    ]):
        Tube(mesh, bark, points, radii, 20, furrow=.18, phase=index, tile=(.72, 1.8))
        tail = Vector(points[-1])
        direction = (tail - Vector(points[-2])).normalized()
        for j in range(5):
            shift = Vector((rng.uniform(-.03,.03), rng.uniform(-.03,.03), rng.uniform(-.028,.028)))
            Tube(mesh, sap, [tail+shift-direction*.04, tail+shift+direction*rng.uniform(.04,.16)],
                 [.014, .0015], 5, tile=(.13, 2))


def RoughBoard(mesh, material, start, end, width, depth, rng):
    start, end = Vector(start), Vector(end)
    levels = [0, .055, .26, .52, .78, .955, 1]
    axis = (end - start).normalized()
    across = Vector((axis.z, 0, -axis.x)).normalized()
    slope = Vector((0, 1, 0))
    cross = [(-.44,-.50),(.43,-.50),(.50,-.32),(.48,.37),(.39,.49),(-.45,.48),(-.51,.31),(-.50,-.32)]
    vertices, faces, uv = [], [], []
    for level in levels:
        for u, v in cross:
            shift = axis * rng.uniform(-.024,.024) if level in (0, 1) else Vector((0, 0, 0))
            vertices.append(start.lerp(end, level) + shift + across * width * (u+rng.uniform(-.04,.04))
                            + slope * depth * (v+rng.uniform(-.12,.12)))
    length = (end-start).length
    offset = rng.random()
    for i in range(len(levels)-1):
        for j in range(8):
            k = (j + 1) % 8
            faces.append((i*8+j, i*8+k, (i+1)*8+k, (i+1)*8+j))
            a, b = j * .127 + offset, (j+1) * .127 + offset
            lo, hi = levels[i] * length * .8, levels[i+1] * length * .8
            uv.append(((a,lo),(b,lo),(b,hi),(a,hi)))
    for ids in [tuple(reversed(range(8))), tuple(range(len(vertices)-8,len(vertices)))]:
        faces.append(ids)
        uv.append(tuple(cross[index % 8] for index in ids))
    mesh.Add(material, vertices, faces, uv=uv)


def GreyTimberShoring(mesh, materials):
    gray = ProjectWood(materials, "EastTrackWeatheredTimber", "HandcartWood", (.35,.33,.31), .71)
    cap = ProjectWood(materials, "EastTrackCrossbeam", "TreeBark", (.38,.36,.33), .68)
    sap = materials.Make("EastTrackCrossbeamEnd", (.503,.387,.258), finish="wood")
    iron = materials.Make("EastTrackOxidizedIron", (.116,.091,.066), metal=.35)
    rng = Random(76843)
    for i in range(13):
        x = -.98 + i*.164
        RoughBoard(mesh, gray, (x,rng.uniform(.018,.060),.027), (x+rng.uniform(-.015,.015),.027,1.16),
                   rng.uniform(.149,.163), rng.uniform(.080,.102), rng)
    for x in [-1.06, 1.04]:
        RoughBoard(mesh, gray, (x,.11,.01), (x+.025,.13,1.13), .18,.14,rng)
    RoughBoard(mesh, gray, (.15,-.145,.016), (.50,-.196,1.49), .143,.085,rng)
    path = [(-1.23,0,1.211),(-1.16,0,1.222),(-.83,.02,1.232),
            (-.35,.018,1.223),(.14,0,1.237),(.61,-.006,1.217),(1.12,0,1.234),(1.24,.013,1.251)]
    Tube(mesh, cap, path, [.108,.132,.141,.127,.137,.133,.135,.107], 26,
         aspect=.94, furrow=.18, phase=2, tile=(1.2,.58))
    for end in (path[0], path[-1]):
        sign = -1 if end[0] < 0 else 1
        for i in range(9):
            theta = i * tau / 9
            y, z = end[1]+.074*cos(theta), end[2]+.08*sin(theta)
            Tube(mesh, sap, [(end[0]-sign*.037,y,z),(end[0]+sign*rng.uniform(.012,.064),y+rng.uniform(-.016,.016),z)],
                 [.026,.005], 6, furrow=.16, tile=(.2,2.8))
    for x, y, z in [(-1.07,-.021,1.10), (1.05,-.024,1.07), (.39,-.244,1.22), (.25,-.216,.55)]:
        Tube(mesh, iron, [(x,y+.013,z),(x,y-.016,z)], [.016,.012], 8)


def Bake(source=None):
    if bpy.data.filepath:
        raise RuntimeError("Run against a fresh Blender workspace for this scene.")
    output = PROJECT / "Model" / "TanketteAdvanceEastTrack"
    output.mkdir(parents=True, exist_ok=True)
    work = bpy.context.scene
    work.name = "East Track Export"
    for obj in list(work.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    stats, studios = {}, []
    with TemporaryDirectory(prefix="EastTrackMaps") as scratch:
        materials = Materials(Path(scratch))
        for builder in (SplinteredElm, GreyTimberShoring):
            name = builder.__name__
            scene = bpy.data.scenes.new(name)
            scene.unit_settings.system = "METRIC"
            collection = bpy.data.collections.new(name)
            work.collection.children.link(collection)
            mesh = Mesh()
            builder(mesh, materials)
            objects = mesh.Emit(collection)
            bpy.context.view_layer.update()
            lo, hi = Bounds(objects)
            for obj in objects:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = objects[0]
            bpy.ops.export_scene.gltf(filepath=str(output / f"Model_{name}.glb"), export_format="GLB",
                use_selection=True, use_active_scene=True, export_animations=False, export_image_format="WEBP",
                export_image_quality=90)
            work.collection.children.unlink(collection)
            scene.collection.children.link(collection)
            Studio(scene, lo, hi)
            studios.append(scene)
            size = hi - lo
            stats[name] = {"size": [round(size[i], 4) for i in (0, 2, 1)],
                "triangles": sum(len(face.vertices)-2 for obj in objects for face in obj.data.polygons)}
        if source:
            source = Path(source).resolve()
            source.parent.mkdir(parents=True, exist_ok=True)
            bpy.context.window.scene = studios[0]
            bpy.context.preferences.filepaths.save_version = 0
            bpy.ops.wm.save_as_mainfile(filepath=str(source))
    print("EAST_TRACK_MODELS", json.dumps(stats, sort_keys=True))
    return stats


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    Bake(args.source)
