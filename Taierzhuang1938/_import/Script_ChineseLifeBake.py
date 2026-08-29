"""把下载来的中式生活道具烘成一个组件库 GLB（Model_ChineseLifeSet.glb）。

跑法（**另起一个无头 Blender**，别用挂着 BlenderMCP 的那台）：
  "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background \
      --python Taierzhuang1938/_import/Script_ChineseLifeBake.py

成法照 Script_SketchfabPackBake.py：剥掉源包贴图、换成游戏自己烘的材质配方名、
减面、每件一个 PascalCase 具名节点、落地 minY=0 且 XZ 居中。

与那份脚本相比只多两件事，都是这一包逼出来的：

1. **按「高度」定尺寸，不按最大跨度。**
   `Script_SketchfabPackBake.Optimize` 的 targetSpan 缩的是包围盒最长边。对木箱
   那种近立方体无所谓，对这一包不行：水缸的辨识度全在「多高」，而这个源里的缸
   是扁的（宽∶高 = 1.36）。按跨度缩到 0.85 m，缸就只有 0.63 m 高 —— 比脸盆高
   不了多少。所以下面的 `Optimize` 多一个 targetHeight，先落地再关于原点缩放，
   底面照旧贴 y=0。圆盘状的磨盘、笸箩这类「高度不是主特征」的仍走 targetSpan。

2. **按对象名挑件，不只按父节点挑。**
   石井台那个源把井筒、木棚、绳子、棚顶四件全挂在同一个父节点 `Well` 下，
   `ByParent` 分不开。这里的 `Pick` 同时认对象名与父节点名 —— 于是能只取井筒
   `Well_WellTube_0`，把那顶欧式木棚整个丢掉（留着它就是一口德国童话井）。

材质只许用 **Script_TexBake.RECIPES 里的配方名**（Stone / WoodBeam / WoodDoor /
Sandbag / ClothNra …）。注意 **不是** `Script_TengxianCity.MATERIAL_MAP` 里的
逻辑名：运行时这一层走的是 `library.Get(name)`，它查的是烘焙表，喂
`HouseholdCeramic` 会直接抛「材质未烘焙」。陶器要的暖褐调（MATERIAL_MAP 里
HouseholdCeramic 给的是 Stone × 0xb99a82）在这一层拿不到，交付报告里另记一笔。
"""

from __future__ import annotations

from pathlib import Path

import bpy
from mathutils import Matrix, Vector


importDir = Path(__file__).resolve().parent
sourceDir = importDir / "Source"
modelDir = importDir.parent / "Model"


# 配方名 → 视口占位色。只为在 Blender 里肉眼分得清，运行时按名字重绑游戏材质。
MARKER_COLOR = {
    "Stone": (0.34, 0.33, 0.30, 1),
    "WoodBeam": (0.29, 0.21, 0.14, 1),
    "WoodDoor": (0.34, 0.23, 0.14, 1),
    "Sandbag": (0.42, 0.38, 0.28, 1),
    "ClothNra": (0.33, 0.34, 0.31, 1),
}


def ResetScene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def Import(folder: str) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(sourceDir / folder / "scene.gltf"))
    return [obj for obj in bpy.data.objects if obj not in before and obj.type == "MESH"]


def Marker(name: str) -> bpy.types.Material:
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
        material.diffuse_color = MARKER_COLOR[name]
    return material


def SetMarker(obj: bpy.types.Object, name: str) -> None:
    obj.data = obj.data.copy()
    obj.data.materials.clear()
    obj.data.materials.append(Marker(name))


def Flatten(obj: bpy.types.Object) -> None:
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = world


def Join(objects: list[bpy.types.Object], name: str) -> bpy.types.Object:
    if not objects:
        raise RuntimeError("No source objects for " + name)
    for obj in objects:
        Flatten(obj)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    obj = bpy.context.object
    obj.data = obj.data.copy()
    obj.name = name
    obj.data.name = "Mesh_" + name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def Triangles(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def Bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    """包围盒 —— 只算**被面引用到的**顶点。

    两个坑叠在一起，斗笠一件就把两个都踩了（自验的 minY == 0 断言抓到的）：

    · `obj.bound_box` 在 `modifier_apply` 之后是懒更新的，拿到的是减面前的旧值；
    · 换成遍历 `mesh.vertices` 之后还差 5.3 mm —— 因为源网格里有游离顶点
      （不属于任何面）。Blender 把它算进包围盒，glTF 导出器**不导出**它，
      于是「Blender 里贴地、导出后悬空」。

    所以这里既不信 bound_box，也不整份 vertices 全收，只认面上的点 ——
    那才是最终进 .glb 的那批。
    """
    mesh = obj.data
    used = {index for polygon in mesh.polygons for index in polygon.vertices}
    points = [obj.matrix_world @ mesh.vertices[index].co for index in used]
    if not points:
        raise RuntimeError(obj.name + ": mesh has no faces")
    low = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    high = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    return low, high


def Optimize(obj, targetTriangles, targetSpan=None, targetHeight=None):
    """减面 → 落地并 XZ 居中 → 缩到真实米制尺寸。

    落地在缩放之前：缩放是关于原点做的，底面已经贴在 z=0 上，怎么缩都还贴着。
    """
    before = Triangles(obj)
    if before > targetTriangles:
        modifier = obj.modifiers.new("RuntimeDecimate", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = max(0.01, min(1.0, targetTriangles / before))
        modifier.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)

    low, high = Bounds(obj)
    obj.data.transform(Matrix.Translation((-(low.x + high.x) / 2, -(low.y + high.y) / 2, -low.z)))
    # Blender 是 Z 上；导出时 export_yup 才把它换成 glTF 的 Y 上。
    if targetHeight is not None:
        obj.data.transform(Matrix.Scale(targetHeight / (high.z - low.z), 4))
    elif targetSpan is not None:
        span = max(high.x - low.x, high.y - low.y, high.z - low.z)
        obj.data.transform(Matrix.Scale(targetSpan / span, 4))
    obj.location = (0, 0, 0)

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth_by_angle()
    return before, Triangles(obj)


def Pick(imported: list[bpy.types.Object], keys: tuple[str, ...]) -> list[bpy.types.Object]:
    """按对象名或父节点名挑件；keys 为空表示整个源只有一件，全要。"""
    if not keys:
        return list(imported)
    wanted = set(keys)
    picked = [obj for obj in imported
              if obj.name in wanted or (obj.parent and obj.parent.name in wanted)]
    missing = wanted - {obj.name for obj in picked} - {obj.parent.name for obj in picked if obj.parent}
    if missing:
        raise RuntimeError("source nodes not found: " + ", ".join(sorted(missing)))
    return picked


def Process(objects, name, material, targetTriangles, targetSpan=None, targetHeight=None):
    for obj in objects:
        SetMarker(obj, material)
    result = Join(objects, name)
    before, after = Optimize(result, targetTriangles, targetSpan, targetHeight)
    low, high = Bounds(result)
    print(f"{name}: {before} -> {after} tris, "
          f"{high.x - low.x:.2f} x {high.y - low.y:.2f} x {high.z - low.z:.2f} m, "
          f"minZ={low.z:.4f}", flush=True)
    return result


def Export(objects: list[bpy.types.Object], fileName: str) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    output = modelDir / fileName
    bpy.ops.export_scene.gltf(
        filepath=str(output), export_format="GLB", use_selection=True,
        export_apply=True, export_materials="EXPORT", export_yup=True,
    )
    print(f"EXPORTED {fileName} ({output.stat().st_size} bytes)", flush=True)


# (源目录, ((挑件的名字…), 运行时节点名, 材质配方, 三角上限, 跨度 m, 高度 m))
#
# 尺寸取值的依据（docs/Data_HistoryMaterial.md 的鲁南民居尺度 + 常见实物）：
# 水缸 0.7—0.9 m 高、坛子矮而阔、八仙桌 0.85 m —— 这一包里**没有八仙桌**，
# 那件从陶坊场景里取出来的 `Table` 是 0.42 m 高的条凳/矮案，别硬当八仙桌用。
#
# 三口敞口大缸走的是实物扫描（KHS_Asset），源文件本身就是米制，这里几乎 1:1；
# 陶坊场景里的坛子是卡通六棱带盖件，只留两只当「有盖陶坛」，不冒充水缸。
SOURCES = (
    ("Model_SketchfabStorageJarTall", (
        ((), "ClayWaterVat", "Stone", 700, None, 0.90),
    )),
    ("Model_SketchfabStorageJarRound", (
        ((), "ClayRoundVat", "Stone", 700, None, 0.74),
    )),
    ("Model_SketchfabStorageJarLugged", (
        # 0.57 m 的小件走 600 档，不是大件的 1200 档
        ((), "ClayLuggedJar", "Stone", 550, None, 0.52),
    )),
    ("Model_SketchfabAncientChinesePottery", (
        (("Color_Pot_Red1",), "ClayLiddedJar", "Stone", 500, None, 0.62),
        (("Color_Pot_White",), "ClayWideJar", "Stone", 500, None, 0.50),
        (("Pile_Wood",), "FirewoodPile", "WoodBeam", 1200, None, 0.62),
        (("Table",), "LongBench", "WoodDoor", 260, None, 0.42),
    )),
    ("Model_SketchfabChineseWineJar", (
        ((), "WineJarCluster", "Stone", 650, None, 0.55),
    )),
    ("Model_SketchfabOldChineseLantern", (
        ((), "ClothLantern", "ClothNra", 1200, None, 0.52),
    )),
    ("Model_SketchfabChineseSignboard", (
        ((), "ShopPlaque", "WoodDoor", 320, None, 1.15),
    )),
    ("Model_SketchfabWinnow", (
        ((), "WinnowingBasket", "Sandbag", 1800, None, 0.78),
    )),
    ("Model_SketchfabBambooBasket", (
        ((), "WovenBasket", "Sandbag", 1800, 0.54, None),
    )),
    ("Model_SketchfabLowWoodenBench", (
        ((), "WoodPlatformBench", "WoodBeam", 700, 1.62, None),
    )),
    # 只要井筒：同一个父节点下还挂着木棚 / 棚顶 / 绳桶，那是欧式带顶水井的部件。
    ("Model_SketchfabStoneWell", (
        (("Well_WellTube_0",), "StoneWellCurb", "Stone", 700, None, 0.72),
    )),
    ("Model_SketchfabStoneMillWheel", (
        ((), "StoneMillWheel", "Stone", 700, 1.04, None),
    )),
    # 只要斗笠本体：Hat.rope 那条系带垂在帽檐之下，留着它整顶帽子会离地悬空。
    ("Model_SketchfabAsianConicalHat", (
        (("Object_3",), "BambooHat", "Sandbag", 1400, 0.46, None),
    )),
)


def BakeSet() -> None:
    ResetScene()
    output = []
    for folder, specs in SOURCES:
        imported = Import(folder)
        wanted = set()
        picks = []
        for keys, name, material, budget, span, height in specs:
            members = Pick(imported, keys)
            wanted.update(members)
            picks.append((members, name, material, budget, span, height))
        for obj in imported:
            if obj not in wanted:
                bpy.data.objects.remove(obj, do_unlink=True)
        for members, name, material, budget, span, height in picks:
            output.append(Process(members, name, material, budget, span, height))
    Export(output, "Model_ChineseLifeSet.glb")
    print(f"nodes={len(output)} triangles={sum(Triangles(obj) for obj in output)}", flush=True)


def Main() -> None:
    modelDir.mkdir(parents=True, exist_ok=True)
    BakeSet()
    print("CHINESE_LIFE_BAKE_OK", flush=True)


if __name__ == "__main__":
    Main()
