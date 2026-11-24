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


def TexturedWood(materials, name, stem, color, strength):
    material = materials.Make(name, color)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes.get("Principled BSDF")
    for suffix, space in [("Base","sRGB"), ("Normal","Non-Color")]:
        image = nodes.new("ShaderNodeTexImage")
        file = stem.with_name(stem.name + suffix + ".webp")
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
    bark = TexturedWood(materials, "EastTrackElmBark", PROJECT / "Texture" / "Texture_TreeBark", (.235,.205,.181), .88)
    atlas = PROJECT.parent / "tmp" / "TanketteAdvanceEastTrack" / "Materials" / "Texture_EastTrackElmAtlas"
    trunk = TexturedWood(materials, "EastTrackElmWeathering", atlas, (.231,.205,.181), .93)
    sap = materials.Make("EastTrackElmExposedWood", (.57, .453, .325), finish="wood")
    dry = materials.Make("EastTrackElmInnerSplit", (.363, .278, .204), finish="wood")
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
            radius = .50 + .037 * fraction + flare + ridge
            radius += .04 * sin(5 * theta + fraction * 2) + rng.uniform(-.009, .009)
            angle = atan2(sin(theta + pi/2), cos(theta + pi/2))
            scar = (fraction-.36)*.76 - abs(angle - 1.18 - .12*sin(fraction*9) - .062*sin(fraction*72))
            radius -= min(.04, max(0, scar)*.21)
            z = fraction * trunk_height + tip[j] * fraction**12
            vertices.append((.18 * fraction + radius * cos(theta),
                             -.06 * fraction + .84 * radius * sin(theta), z))
    faces, uv = [], []
    for i in range(levels - 1):
        for j in range(sides):
            nxt = (j + 1) % sides
            a, b = j / sides, (j + 1) / sides
            c, d = i / (levels-1), (i + 1) / (levels-1)
            faces.append((i*sides+j, i*sides+nxt, (i+1)*sides+nxt, (i+1)*sides+j))
            uv.append(((a,c), (b,c), (b,d), (a,d)))
    mesh.Add(trunk, vertices, faces, uv=uv, smooth=True)
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
        ([(.31,.09,3.45),(.56,.105,3.51),(.75,.13,3.57),(.97,.15,3.59),(1.17,.18,3.64)], [.094,.071,.044,.019,.006]),
        ([(.74,.13,3.56),(.87,.175,3.39),(1.05,.19,3.31)], [.038,.021,.005]),
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
    levels = [0, .061, .34, .67, .93, 1]
    axis = (end - start).normalized()
    across = Vector((axis.z, 0, -axis.x)).normalized()
    slope = Vector((0, 1, 0))
    cross = [(-.46,-.40),(-.24,-.51),(.04,-.56),(.29,-.49),(.46,-.43),(.51,-.25),
             (.44,.37),(.34,.50),(-.33,.49),(-.51,.28),(-.53,-.12)]
    count = len(cross)
    vertices, faces, uv = [], [], []
    for level in levels:
        for u, v in cross:
            shift = axis * rng.uniform(-.061,.045) if level in (0, 1) else Vector((0, 0, 0))
            vertices.append(start.lerp(end, level) + shift + across * width * (u+rng.uniform(-.047,.047))
                            + slope * depth * (v+rng.uniform(-.13,.15)))
    length = (end-start).length
    offset = rng.random()
    for i in range(len(levels)-1):
        for j in range(count):
            k = (j + 1) % count
            faces.append((i*count+j, i*count+k, (i+1)*count+k, (i+1)*count+j))
            # Match grain frequency to physical width and run V with the fibers.
            a, b = offset + j * width*.46, offset + (j+1)*width*.46
            lo, hi = levels[i] * length / .84, levels[i+1] * length / .84
            uv.append(((a,lo),(b,lo),(b,hi),(a,hi)))
    for ids in [tuple(reversed(range(count))), tuple(range(len(vertices)-count,len(vertices)))]:
        faces.append(ids)
        uv.append(tuple(cross[index % count] for index in ids))
    mesh.Add(material, vertices, faces, uv=uv)


def FoldedCanvas(mesh, material):
    vertices, faces, uv = [], [], []
    columns, rows = 30, 12
    for j in range(rows+1):
        v = j / rows
        for i in range(columns+1):
            u = i / columns
            wave = sin(u*31.5 + v*3.4)*.028 + cos(u*59 - v*4)*.017
            fray = (sin(u*103)*.023 + sin(u*181)*.012)*v**7
            x = -.61 + 1.54*u - .15*v
            y = .14 - .39*min(1,v/.25) + wave*(.22+v) + .046*v**2
            hem = .43 + .14*u + .10*sin(17.0*u+1.1) + .047*sin(37*u)
            z = 1.355 - hem*max(0,(v-.20)/.80) + fray
            vertices.append((x,y,z))
    for j in range(rows):
        for i in range(columns):
            a = j*(columns+1)+i
            b = a+columns+1
            faces.append((a,a+1,b+1,b))
            u, v = i/columns, j/rows
            uv.append(((2*u,1.6*v),(2*(i+1)/columns,1.6*v),
                       (2*(i+1)/columns,1.6*(j+1)/rows),(2*u,1.6*(j+1)/rows)))
    mesh.Add(material, vertices, faces, uv=uv, smooth=True)


def GreyTimberShoring(mesh, materials):
    stem = PROJECT.parent / "tmp" / "TanketteAdvanceEastTrack" / "Materials" / "Texture_EastTrackWeatheredElm"
    gray = TexturedWood(materials, "EastTrackWeatheredTimber", stem, (.373,.347,.310), .70)
    sap = materials.Make("EastTrackCrossbeamEnd", (.379,.313,.246), finish="wood")
    iron = materials.Make("EastTrackOxidizedIron", (.116,.091,.066), metal=.35)
    canvas = materials.Make("EastTrackDrapedCanvas", (.361,.331,.283), finish="cloth", double=True)
    rng = Random(76843)
    edge = -1.15
    widths = [.25,.13,.23,.19,.26,.146,.218,.20,.24,.18,.25]
    for width in widths:
        x = edge + width/2
        edge += width
        base = rng.uniform(.005,.061)
        face = rng.uniform(-.018,.081)
        RoughBoard(mesh, gray, (x,face,base), (x+rng.uniform(-.036,.038),face+rng.uniform(-.023,.019),rng.uniform(1.04,1.23)),
                   width*.996, rng.uniform(.069,.113), rng)
    for x in [-1.06, 1.04]:
        RoughBoard(mesh, gray, (x,.11,.01), (x+.025,.13,1.13), .18,.14,rng)
    RoughBoard(mesh, gray, (.479,-.132,.01), (.245,-.214,1.37), .117,.084,rng)
    rail = [(-1.246,-.034,1.21),(1.193,-.058,1.231)]
    RoughBoard(mesh, gray, *rail, .251,.273,rng)
    RoughBoard(mesh, gray, (-1.179,-.087,.918),(1.108,-.078,.89), .112,.156,rng)
    for end in rail:
        sign = -1 if end[0] < 0 else 1
        for i in range(6):
            theta = i * tau / 6
            y, z = end[1]+.092*cos(theta), end[2]+.096*sin(theta)
            Tube(mesh, sap, [(end[0]-sign*.037,y,z),(end[0]+sign*rng.uniform(.012,.045),y+rng.uniform(-.013,.013),z)],
                 [.018,.004], 6, furrow=.12, tile=(.2,2.8))
    for x, y, z in [(-1.07,-.021,1.10), (1.05,-.024,1.07), (.267,-.254,1.20), (.388,-.205,.56)]:
        Tube(mesh, iron, [(x,y+.013,z),(x,y-.016,z)], [.016,.012], 8)
    FoldedCanvas(mesh, canvas)


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
            selected = list(objects)
            if builder is GreyTimberShoring:
                shoring = bpy.data.objects.new("TimberShoring", None)
                collection.objects.link(shoring)
                for obj in objects:
                    if obj.data.materials[0].name != "EastTrackDrapedCanvas":
                        obj.parent = shoring
                selected.append(shoring)
            bpy.context.view_layer.update()
            lo, hi = Bounds(objects)
            for obj in selected:
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
