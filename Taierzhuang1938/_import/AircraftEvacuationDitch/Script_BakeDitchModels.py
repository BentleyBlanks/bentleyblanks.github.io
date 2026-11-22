"""Bake the two hero props for the Plate 05B scene with Blender 5.x."""

import argparse
import math
import os
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT = Path(__file__).resolve().parents[2]
SCENE_ID = "AircraftEvacuationDitch"


def LinearColor(hex_color):
    channels = [int(hex_color[index:index + 2], 16) / 255 for index in (0, 2, 4)]
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in channels)


class Surface:
    def __init__(self, name, seed, palette):
        self.name = name
        self.rng = random.Random(seed)
        self.palette = {key: [LinearColor(color) for color in colors] for key, colors in palette.items()}
        self.vertices, self.faces, self.colors, self.smooth = [], [], [], []

    def Add(self, vertices):
        first = len(self.vertices)
        self.vertices.extend(vertices)
        return first

    def Face(self, indices, palette, smooth=False, color=None):
        self.faces.append(indices)
        self.colors.append(color or self.rng.choice(self.palette[palette]))
        self.smooth.append(smooth)

    def Tube(self, points, radii, sides, palette, rugged=.12, smooth=True):
        rng = self.rng
        points = [Vector(point) for point in points]
        ridges = [rng.uniform(1 - rugged, 1 + rugged) for _ in range(sides)]
        ridgeColors = [rng.choice(self.palette[palette]) for _ in range(sides)]
        first = len(self.vertices)
        for index, (point, radius) in enumerate(zip(points, radii, strict=True)):
            axis = (points[min(index + 1, len(points) - 1)] - points[max(index - 1, 0)]).normalized()
            lateral = (Vector((0, 1, 0)) if abs(axis.y) < .85 else Vector((0, 0, 1))).cross(axis).normalized()
            lateral2 = axis.cross(lateral)
            for side, ridge in enumerate(ridges):
                angle = math.tau * side / sides + .025 * index
                self.vertices.append(point + (math.cos(angle) * lateral + math.sin(angle) * lateral2)
                                     * radius * ridge * rng.uniform(1 - rugged / 2, 1 + rugged / 2))
        self.Face(tuple(reversed(range(first, first + sides))), palette)
        for index in range(len(points) - 1):
            ring = first + index * sides
            for side in range(sides):
                a, b = ring + side, ring + (side + 1) % sides
                color = tuple(channel * rng.uniform(.79, 1.19) for channel in ridgeColors[side])
                self.Face((a, b, b + sides, a + sides), palette, smooth, color)
        cap = first + (len(points) - 1) * sides
        self.Face(tuple(range(cap, cap + sides)), palette)

    def Box(self, lo, hi, palette):
        x, y, z = lo
        a, b, c = hi
        first = self.Add([(x,y,z), (a,y,z), (a,b,z), (x,b,z), (x,y,c), (a,y,c), (a,b,c), (x,b,c)])
        for face in [(3,2,1,0), (4,5,6,7), (0,1,5,4), (1,2,6,5), (2,3,7,6), (3,0,4,7)]:
            self.Face(tuple(first + index for index in face), palette)

    def Build(self):
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        color = mesh.color_attributes.new(name="Albedo", type="BYTE_COLOR", domain="CORNER")
        for polygon, value, smooth in zip(mesh.polygons, self.colors, self.smooth, strict=True):
            polygon.use_smooth = smooth
            for index in polygon.loop_indices:
                color.data[index].color = (*value, 1)
        material = bpy.data.materials.new(self.name + "Surface")
        material.use_nodes = True
        material.use_backface_culling = False
        shader = material.node_tree.nodes.get("Principled BSDF")
        shader.inputs["Roughness"].default_value = .92
        attr = material.node_tree.nodes.new("ShaderNodeVertexColor")
        attr.layer_name = color.name
        material.node_tree.links.new(attr.outputs["Color"], shader.inputs["Base Color"])
        obj = bpy.data.objects.new(self.name, mesh)
        obj.data.materials.append(material)
        bpy.context.collection.objects.link(obj)
        return obj


def BuildElm():
    elm = Surface("BrokenElm", 5126, {
        "bark": ["403932", "4b4138", "564942", "605248", "6a5a4d", "4b4540", "63574b"],
        "wood": ["8c7765", "a18a72", "7f6652", "ae957e", "8c7969"],
        "dark": ["332d28", "423830", "4d4136"],
    })
    rng = elm.rng
    stem = [(0,0,-.13), (.02,0,.2), (-.04,.02,.62), (-.12,.03,1.14), (-.2,.07,1.7),
            (-.34,.08,2.3), (-.49,.12,2.91), (-.69,.18,3.42), (-.78,.2,3.92), (-1,.22,4.35),
            (-1.17,.22,4.86), (-1.36,.29,5.33), (-1.54,.35,5.73), (-1.63,.44,6.04), (-1.79,.48,6.48)]
    radii = [.46,.42,.34,.32,.29,.28,.26,.24,.20,.16,.135,.10,.068,.032,.003]
    elm.Tube(stem, radii, 20, "bark", .24)
    for index in range(10):
        angle = (index + rng.uniform(-.2,.2)) * math.tau / 10
        dx, dy = math.cos(angle), math.sin(angle)
        length = rng.uniform(.6, 1.44)
        elm.Tube([(dx*.15,dy*.15,rng.uniform(.37,.73)), (dx*.44,dy*.39,.12),
                  (dx*length*.7,dy*length*.7,.025), (dx*length,dy*length,-.12)],
                 [rng.uniform(.095,.16),.11,.055,.006], 8, "bark", .3)

    # The torn co-dominant stem and the long, low left bough carry the silhouette.
    torn = [(-.38,-.05,2.04), (.03,-.11,2.45), (.29,-.14,2.99), (.45,-.09,3.38)]
    elm.Tube(torn, [.23,.21,.17,.13], 17, "bark", .28)
    elm.Tube([(.32,-.08,3.12), (.48,-.04,3.43), (.57,.01,3.77)], [.128,.113,.006], 12, "wood", .22)
    for _ in range(15):
        angle = rng.uniform(0, math.tau)
        x, y = .45 + .12 * math.cos(angle), -.09 + .12 * math.sin(angle)
        elm.Tube([(x,y,3.18), (x+.04,y,3.44), (x+rng.uniform(-.03,.27), y+rng.uniform(-.09,.1),
                  rng.uniform(3.5,3.98))], [rng.uniform(.025,.058),.024,.002], 5, rng.choice(["bark","wood"]), .35)
    for index in range(12):
        shift = (index - 5.5) * .023
        start = Vector((.05+shift,-.30,2.40+rng.uniform(0,.28)))
        end = Vector((.46+shift,-.24,3.44+rng.uniform(-.20,.10)))
        elm.Tube([start,start.lerp(end,.42),end], [.004,rng.uniform(.010,.025),.003], 5, "wood", .16)

    boughs = [
        ([(-.72,.18,3.42),(-1.24,-.02,3.82),(-1.85,-.15,4.02),(-2.43,-.33,4.24),(-3.04,-.32,4.55)], .17),
        ([(-.9,.22,4.03),(-.52,.25,4.66),(-.22,.26,5.38),(.04,.32,6.12),(.2,.36,6.87)], .14),
        ([(-.87,.19,3.72),(-.77,.83,4.16),(-.78,1.64,4.53),(-1.27,1.85,4.94)], .115),
        ([(.18,-.02,2.73),(.65,-.28,3.1),(1.21,-.42,3.42),(1.88,-.38,3.65)], .083),
        ([(-.56,.04,2.81),(-.9,-.42,3.10),(-1.23,-.59,3.28)], .083),
        ([(-.01,0,.94),(.29,.15,1.31),(.57,.27,1.53)], .12),
    ]
    for points, radius in boughs:
        count = len(points)
        elm.Tube(points, [radius * max(.025, 1 - i / (count - 1)) for i in range(count)], 11, "bark", .25)
    for paths in [stem[7:], *(points for points, _ in boughs[:5])]:
        for a, b in zip(paths, paths[1:]):
            a, b = Vector(a), Vector(b)
            for _ in range(rng.randrange(3, 6)):
                base = a.lerp(b, rng.uniform(.25,.97))
                direction = Vector((rng.uniform(-1,1),rng.uniform(-.75,.75),rng.uniform(.05,1))).normalized()
                length = rng.uniform(.26,.87)
                elbow = base + direction * length * .56
                tip = elbow + (direction + Vector((.06,0,.34))).normalized() * length * .47
                elm.Tube([base, elbow, tip], [length*.047,length*.023,.002], 6, "bark")
                for side in [-1, 1, rng.choice([-1,1])]:
                    origin = elbow.lerp(tip, rng.uniform(.03,.9))
                    spread = Vector((side*rng.uniform(.07,.30),rng.uniform(-.17,.17),rng.uniform(.08,.28)))
                    elm.Tube([origin,origin+spread*.6,origin+spread], [.012,.006,.001], 5, "bark")
    # Narrow raised bark splits follow the trunk grain.
    for _ in range(122):
        level = rng.randrange(7)
        a, b = Vector(stem[level]), Vector(stem[level + 1])
        angle = rng.uniform(0, math.tau)
        offset = Vector((math.cos(angle), math.sin(angle),0))
        origin = a.lerp(b, rng.uniform(.05,.57)) + offset * radii[level] * .91
        tip = origin + Vector((rng.uniform(-.10,.01),rng.uniform(-.04,.04),rng.uniform(.17,.62)))
        elm.Tube([origin,origin.lerp(tip,.54)+offset*.048,tip],
                 [.009,rng.uniform(.014,.039),.003], 5, rng.choice(["bark","bark","dark","wood"]))
    return elm.Build()


def BuildFarmhouse():
    house = Surface("DamagedFarmhouse", 5146, {
        "earth": ["8a7a6b","877a6b","796d60","938175","86796c","8a8073","73675a"],
        "cut": ["53493f","675b4d","786956","615447"],
        "stone": ["6b635a","807569","605b52","726a61","8c7d69","655d52"],
        "wood": ["5b4e40","625649","493e34","5d5243","6f5e4d"],
        "tile": ["55534f","484846","605b55","575451","5f574c","41403d","5b5954"],
        "cloth": ["81786d","776e63","8c7e6d","948778"],
    })
    rng = house.rng
    house.Box((-4.05,-2.06,-.13),(4.05,2.03,.16), "stone")
    house.Box((-3.98,.64,.11),(3.98,1.95,2.26), "cut")
    house.Box((-4.03,-1.93,.10),(-3.20,.75,2.30), "cut")
    house.Box((3.35,-1.83,.10),(4.02,.69,2.31), "cut")

    def EarthenFace(start, end, columns, gable=False):
        dx, dy = end[0]-start[0], end[1]-start[1]
        length = math.hypot(dx,dy)
        normal = (dy / length,-dx / length)
        levels = 15
        first = len(house.vertices)
        for row in range(levels + 1):
            for col in range(columns + 1):
                t = col / columns
                top = 3.12 - abs(t-.5)*1.67 if gable else 2.28
                along = t + (rng.uniform(-.018,.018) if 0 < col < columns else 0)
                damage = (.21 if gable and .25 < t < .48 and .1 < row/levels < .3 else 0)
                bump = rng.uniform(-.065,.062)+.065-damage
                height = .11 + (top-.11)*row/levels + rng.uniform(-.055,.055)
                house.vertices.append((start[0]+dx*along+normal[0]*bump,start[1]+dy*along+normal[1]*bump,height))
        for row in range(levels):
            for col in range(columns):
                a = first + row*(columns+1)+col
                indices = (a,a+1,a+columns+2,a+columns+1)
                kind = "stone" if row < rng.choice([1,2,2,3]) else "earth"
                if gable and ((row in (3,4) and 4 <= col <= 8) or (row == 12 and col in (9,10))):
                    kind = "cut"
                house.Face(indices, kind)
        for _ in range(76):
            t, height = rng.random(), rng.uniform(.13,1.92)
            x, y = start[0]+dx*t+normal[0]*.145, start[1]+dy*t+normal[1]*.145
            step = rng.uniform(.012,.083)
            p = house.Add([(x,y,height),(x+dx/length*step,y+dy/length*step,height+.016),
                           (x+dx/length*step*.45,y+dy/length*step*.45,height+.044)])
            house.Face((p,p+1,p+2),rng.choice(["cut","stone"]))

    EarthenFace((4,-1.80),(4,1.92), 25, True)
    EarthenFace((-4,1.92),(-4,-1.80), 21, True)
    EarthenFace((-4.02,-1.94),(-3.22,-1.94), 7)
    EarthenFace((3.34,-1.94),(4.02,-1.94), 7)
    for row in range(8):
        z = .53 + row * .079
        points = [(4.105 + .018*math.sin(i*2.7+row*.52), -.87+i*.117, z+.016*math.sin(i*1.5))
                  for i in range(10)]
        house.Tube(points, [.018]*9+[.007], 5, "wood")
    for col in range(5):
        y = -.82 + col*.21
        house.Tube([(4.106,y,.47),(4.125,y-.032,.84),(4.109,y+.01,1.12)], [.023,.018,.013], 6, "wood")
    for x in [-3.13,-1.73,.04,1.70,3.19]:
        house.Tube([(x,-2.04,.08),(x+rng.uniform(-.058,.058),-2.06,1.18),(x+.035,-2.07,2.32)],
                   [.072,.061,.067], 7, "wood", .31)
    for y, h in [(-2.13,2.34), (1.99,2.31), (.05,3.08)]:
        house.Tube([(-4.35,y,h),(-1.4,y,h-.055),(1.9,y,h-.02),(4.28,y,h+.06)],
                   [.091,.083,.077,.061], 8,"wood",.25)
    for x in [i*.39-4.10 for i in range(22)]:
        house.Tube([(x,-2.34,2.28),(x,.04,3.13),(x,2.31,2.29)], [.050,.058,.042], 7, "wood", .12)

    def RoofZ(x, y):
        return 3.145 - abs(y-.02)*.335 - .087*math.exp(-((x+.65)/2.7)**2) + .035*math.sin(x*2.1)

    for side in [-1,1]:
        for row in range(10):
            for col in range(41):
                x, y = -4.36+col*.215+(row%2)*.042, side*(.035+row*.238)
                isBreach = side == -1 and ((33 <= col <= 36 and row in (4,5))
                                           or (27 <= col <= 29 and row in (6,7,8)))
                if isBreach or rng.random() < (.12 if row == 9 else .025):
                    continue
                width, length = rng.uniform(.226,.254), rng.uniform(.256,.29)
                zOffset = rng.uniform(-.028,.035)
                first = len(house.vertices)
                profile = [-.46,-.25,0,.25,.46]
                for edge in [0,1]:
                    for u in profile:
                        px, py = x+width*u, y+side*edge*length
                        pz = RoofZ(px,py)+zOffset+.058*(1-(u/.49)**2)+edge*.035
                        house.vertices.append((px,py,pz))
                tileColor = rng.choice(house.palette["tile"])
                for i in range(4):
                    face = (first+i,first+i+1,first+i+6,first+i+5)
                    house.Face(face if side > 0 else tuple(reversed(face)), "tile", True, tileColor)
    for index in range(29):
        x = -4.34+index*.302
        y = rng.uniform(-.033,.05)
        house.Tube([(x,y,RoofZ(x,y)+.046),(x+.34,y,RoofZ(x+.34,y)+.055)],
                   [.078,.072], 9, "tile", .20)

    for x0,x1,height,drop in [(-3.10,-.03,2.24,.80),(-.02,1.61,2.22,.94),(-2.79,-1.91,2.06,1.18)]:
        first = len(house.vertices)
        columns, rows = 26, 8
        for row in range(rows+1):
            for col in range(columns+1):
                u, v = col/columns, row/rows
                sag = math.sin(math.pi*u)**.68
                x = x0+(x1-x0)*u+.06*math.sin(u*9)*v
                y = -2.20-.125*sag*math.sin(v*2.6)+.04*math.sin(u*47-v*6)
                z = height-drop*v*(.23+.77*sag)-.15*sag-rng.random()*v**4*.10
                house.vertices.append((x,y,z))
        for row in range(rows):
            for col in range(columns):
                if row == rows-1 and rng.random() < .15:
                    continue
                a = first+row*(columns+1)+col
                house.Face((a,a+columns+1,a+columns+2,a+1), "cloth", True)
    return house.Build()


def Bake(source):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for name in ["BrokenElm", "DamagedFarmhouse"]:
        for collection, dataName in [(bpy.data.meshes, name), (bpy.data.materials, name + "Surface")]:
            data = collection.get(dataName)
            if data is not None and data.users == 0:
                collection.remove(data)
    output = PROJECT / "Model" / SCENE_ID
    output.mkdir(parents=True, exist_ok=True)
    props = [BuildElm(), BuildFarmhouse()]
    for obj in props:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        obj.data.calc_loop_triangles()
        print(f"{obj.name}: {len(obj.data.loop_triangles)} triangles; {tuple(round(x, 3) for x in obj.dimensions)} m")
        bpy.ops.export_scene.gltf(filepath=str(output / f"Model_{obj.name}.glb"), use_selection=True,
                                  export_animations=False, export_cameras=False)
    # The source is laid out side by side. Both exported pivots stay local.
    props[1].location.x = 9
    source.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(source))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    default_source = Path(os.environ.get("OneDrive", Path.home() / "OneDrive")) / "AI" / "Models" / "Blender"
    parser.add_argument("--source", type=Path, default=default_source / "Taierzhuang1938" / SCENE_ID
                        / "Source_AircraftEvacuationDitch.blend")
    Bake(parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []).source)
