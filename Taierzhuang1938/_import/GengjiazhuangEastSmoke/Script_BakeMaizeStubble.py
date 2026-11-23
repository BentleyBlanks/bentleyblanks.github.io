"""Build cut maize stalks from the orthographic modeling study."""

import argparse
from math import cos, pi, sin
from pathlib import Path
import sys

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve()
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE.parent.parent / "GengjiazhuangFieldApproach"))
from Script_BakeFieldApproachModels import Bounds, FRONT, SIDE, Studio, TOP, VIEWS
from Script_FieldApproachMesh import Materials, Mesh, Tube


OUTPUT = HERE.parents[2] / "Model" / "GengjiazhuangEastSmoke" / "Model_MaizeStubble.glb"


def Stalk(mesh, rind, pith, coords, radii, angle):
    """Tapered and bent cane, with widened joints and a hollow, torn end."""
    points = [Vector(co) for co in coords]
    segments = 6
    rings = []
    for i, (point, radius) in enumerate(zip(points, radii)):
        axis = (points[min(len(points)-1, i + 1)] - points[max(0, i - 1)]).normalized()
        u = axis.cross(Vector((0, 1, 0))).normalized()
        v = axis.cross(u)
        rings.append([
            point + ((abs(sin(j*2.3+angle))*.008 - .004)*axis if i == len(points)-1 else Vector())
            + radius*(cos(j*2*pi/segments+angle)*u + sin(j*2*pi/segments+angle)*v)
            for j in range(segments)
        ])
    verts = sum(rings, [])
    faces = [(i*segments+j, i*segments+(j+1) % segments, (i+1)*segments+(j+1) % segments, (i+1)*segments+j)
             for i in range(len(rings)-1) for j in range(segments)]
    mesh.Add(rind, verts, faces, smooth=True)
    center = points[-1]
    inset = [center + (point-center)*.54 - axis*.007 for point in rings[-1]]
    mesh.Add(pith, rings[-1]+inset, [(j,(j+1)%segments,segments+(j+1)%segments,segments+j) for j in range(segments)])
    mesh.Add(rind, inset, [tuple(range(segments))])


def Husk(mesh, material, path, widths):
    points = [Vector(p) for p in path]
    verts = []
    for i, (point, width) in enumerate(zip(points, widths)):
        tangent = points[min(i+1, len(points)-1)] - points[max(0, i-1)]
        widthAxis = tangent.cross(Vector((.31, -.5, .85))).normalized()
        verts.extend([point + widthAxis*width*.48, point + Vector((0, 0, width*.13)), point - widthAxis*width*.52])
    faces = [(3*i+j,3*i+j+1,3*(i+1)+j+1,3*(i+1)+j) for i in range(len(points)-1) for j in range(2)]
    mesh.Add(material, verts, faces)


def Build(mesh, materials):
    rind = materials.Make("MaizeRind", (.282, .202, .127), roughness=.95)
    pale = materials.Make("MaizeDryRind", (.407, .316, .209), roughness=.96)
    pith = materials.Make("MaizeTornPith", (.443, .355, .261), roughness=.99)
    husk = materials.Make("MaizeDryLeaf", (.226, .172, .111), roughness=.96, double=True)
    dryRoot = materials.Make("MaizeRoots", (.235, .179, .121), roughness=1)
    Stalk(mesh, pale, pith,
        [(-.16,.04,0),(-.164,.037,.083),(-.157,.039,.151),(-.157,.039,.159),(-.141,.048,.247),(-.106,.062,.323),(-.072,.071,.397)],
        [.0073,.0068,.0079,.0075,.0061,.0055,.0046], .51)
    Stalk(mesh, rind, pith,
        [(.08,.088,0),(.074,.088,.068),(.083,.085,.119),(.083,.086,.129),(.104,.09,.181),(.13,.103,.251)],
        [.0075,.0072,.0076,.008,.006,.0049], 1.7)
    Stalk(mesh, pale, pith,
        [(.22,-.102,0),(.213,-.096,.049),(.219,-.092,.088),(.218,-.093,.093),(.222,-.1,.154)],
        [.0065,.0061,.007,.007,.0048], .92)
    Husk(mesh, husk, [(-.147,.039,.241),(-.193,.023,.205),(-.224,-.011,.161),(-.252,-.006,.101),(-.281,.015,.056)],
         [.008,.022,.026,.013,.001])
    Husk(mesh, husk, [(.091,.09,.166),(.126,.059,.143),(.155,.034,.109),(.192,.033,.067),(.210,.018,.025)],
         [.007,.021,.016,.010,.001])
    Tube(mesh, rind, [(-.315,-.12,.009),(-.218,-.13,.016),(-.093,-.137,.016),(.02,-.181,.009),(.157,-.173,.004)],
         [.002,.006,.0065,.0061,.0018], 5)
    Tube(mesh, pale, [(.06,-.005,.005),(.169,-.101,.019),(.234,-.177,.027),(.314,-.238,.014)],
         [.0017,.005,.0052,.002], 5)
    Husk(mesh, pith, [(-.307,-.122,.008),(-.359,-.093,.004),(-.372,-.089,.002)], [.015,.011,.001])
    Husk(mesh, husk, [(.113,-.154,.008),(.164,-.12,.011),(.236,-.081,.006),(.288,-.084,.002)],
         [.009,.026,.016,.001])
    for x, y in [(-.16,.04),(.08,.088),(.22,-.102)]:
        Tube(mesh, dryRoot, [(x,y,.016),(x-.020,y-.014,.008),(x-.059,y-.053,.003)], [.003,.0021,.0007], 4)
        Tube(mesh, dryRoot, [(x,y,.011),(x+.032,y+.020,.007),(x+.070,y+.029,.003)], [.0028,.0016,.0006], 4)


def Bake(source=None, reference=None):
    if bpy.data.filepath:
        raise RuntimeError("Start an empty task scene before baking the stubble.")
    scene = bpy.context.scene
    scene.name = "MaizeStubble"
    scene.unit_settings.system = "METRIC"
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    collection = bpy.data.collections.new("Cut Maize")
    scene.collection.children.link(collection)
    mesh = Mesh()
    Build(mesh, Materials(None))
    objects = mesh.Emit(collection)
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format="GLB", use_selection=True,
                              use_active_scene=True, export_animations=False)
    low, high = Bounds(objects)
    print("MAIZE_STUBBLE", sum(len(p.vertices)-2 for obj in objects for p in obj.data.polygons),
          tuple(round(n, 4) for n in high-low))
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
