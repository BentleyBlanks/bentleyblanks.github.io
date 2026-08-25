"""Bake the CC0 village-yard sources into one component-library GLB.

Run with Blender, not system Python:
  "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background \
      --python Script_RuralYardBake.py

Sources come from Script_RuralYardFetch.py (Kenney + Quaternius, both CC0).
Output is Model/Model_RuralYardSet.glb: one named node per prop, textures
stripped, materials renamed to the game's own recipes so a yard prop and a city
wall share the same wood/stone/steel surfaces.

Three things this bake does that Script_ExternalAssetBake / Script_SketchfabPackBake
do not, all forced by what these two upstreams ship:

  * **Kit units are not metres.**  A Kenney kit is authored on a 1x1 grid and a
    Quaternius prop at roughly a tenth of life size, so every source arrives at a
    plausible-looking but wrong scale.  Each spec therefore names the axis it is
    measured on and the real 1938 dimension for it (`target=("z", 1.15)` = "this
    thing is 1.15 m tall"), instead of the single "target span" the older bakes
    use.  Getting this wrong is invisible in Blender and glaring in game.
  * **Parts get deleted by material.**  Quaternius' well ships a red-tile gable
    roof on it; that is a European wellhouse, not a Lu-nan well.  The tiles live
    in their own material slot, so `None` in the material map drops exactly those
    faces and leaves the stone curb and the timber frame behind.
  * **Kenney tools are one texture-atlas material.**  A hoe has no separate slot
    for its blade, so `split` cuts the mesh on a source-space plane and paints the
    two halves with different recipes (steel head, wood shaft).

Material names written into the GLB are the runtime recipe names.  Multi-material
props are declared `materialMap: true` in Data_ExternalAssets_RuralYard.mjs and
rebound one slot at a time; single-material props just carry `material`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "Source"
MODEL = HERE.parent / "Model"
OUTPUT = "Model_RuralYardSet.glb"

# Marker colours only matter inside Blender; the runtime replaces every one of
# these with the baked recipe of the same name.
MARKER_COLOR = {
    "WoodBeam": (0.29, 0.21, 0.14, 1),
    "WoodDoor": (0.34, 0.23, 0.14, 1),
    "Stone": (0.34, 0.33, 0.30, 1),
    "Steel": (0.23, 0.24, 0.25, 1),
    "Sandbag": (0.42, 0.38, 0.28, 1),
    "Ground": (0.30, 0.27, 0.22, 1),
    "HouseholdCeramic": (0.47, 0.38, 0.32, 1),
    "VillageStraw": (0.54, 0.45, 0.31, 1),
}


@dataclass
class Spec:
    node: str
    folder: str
    file: str
    #: source material name -> runtime recipe, or None to delete those faces.
    #: "*" is the catch-all for sources that ship a single atlas material.
    #: Left empty when `split` decides the materials instead.
    materials: dict[str, str | None]
    #: real-world size: (axis, metres) measured after grounding and centring.
    target: tuple[str, float]
    triangles: int = 600
    #: ("z", threshold, below_recipe, above_recipe).  For single-material tools.
    #: Thresholds are in the source's own units *after* its import transform is
    #: applied and *before* `rotate` — i.e. the numbers `_import/ProbeGltf`-style
    #: inspection prints for the untouched file.
    split: tuple[str, float, str, str] | None = None
    #: ("z", threshold): delete every face whose centre sits above it, same frame
    #: as `split`.  For lopping a superstructure off a prop.
    clip: tuple[str, float] | None = None
    #: degrees around X/Y/Z applied after the material pass.
    rotate: tuple[float, float, float] = (0.0, 0.0, 0.0)
    note: str = ""


SPECS: tuple[Spec, ...] = (
    # —— Quaternius Medieval Village ——
    Spec("VillageWell", "Model_QuaterniusMedievalVillage", "Well.fbx",
         {"Stone_Dark": "Stone", "Stone_Light": "Stone", "Wood": "WoodBeam",
          "Bag": None, "RoofTiles_Red": None},
         clip=("z", 0.170), target=("z", 0.95), triangles=1200,
         note="everything above the curb is lopped off: the source is a European "
              "wellhouse, and stripping only its red tiles left a bare gable truss "
              "that read worse than either extreme.  What is left is a round stone "
              "curb with its timber rim - a Lu-nan well head."),
    Spec("HayStack", "Model_QuaterniusMedievalVillage", "Hay.fbx",
         {"*": "VillageStraw"}, target=("z", 1.25), triangles=600),
    Spec("FirewoodPit", "Model_QuaterniusMedievalVillage", "Bonfire.fbx",
         {"Wood": "WoodBeam", "WoodSide": "WoodBeam",
          "Stone_Light": "Stone", "Stone_Dark": "Stone"},
         target=("x", 1.15), triangles=600,
         note="unlit source; the lit variant with flame geometry is a separate file"),

    # —— Kenney Nature Kit ——
    Spec("FirewoodStack", "Model_KenneyNatureKit", "log_stack.glb",
         {"*": "WoodBeam"}, target=("y", 1.15), triangles=600),
    Spec("ChoppingBlock", "Model_KenneyNatureKit", "stump_round.glb",
         {"*": "WoodBeam"}, target=("x", 0.62), triangles=300),
    Spec("FeedTrough", "Model_KenneyNatureKit", "pot_large.glb",
         {"wood": "WoodDoor", "woodBarkDark": "Ground"},
         target=("x", 1.10), triangles=300),
    Spec("CeramicVat", "Model_KenneyNatureKit", "pot_small.glb",
         {"*": "HouseholdCeramic"}, target=("x", 0.62), triangles=300),

    # —— Kenney Survival Kit ——
    Spec("WaterBucket", "Model_KenneySurvivalKit", "bucket.glb",
         {"*": "WoodDoor"}, target=("z", 0.34), triangles=300),
    Spec("FarmHoe", "Model_KenneySurvivalKit", "tool-hoe.glb",
         {}, split=("z", 0.190, "WoodBeam", "Steel"),
         rotate=(90.0, 0.0, 0.0), target=("y", 1.55), triangles=300,
         note="source stands the tool upright; laid flat so it reads as dropped in the yard"),
    Spec("TimberStack", "Model_KenneySurvivalKit", "resource-planks.glb",
         {"*": "WoodDoor"}, target=("y", 1.50), triangles=300),

    # —— Kenney Graveyard Kit ——
    Spec("IronSpade", "Model_KenneyGraveyardKit", "shovel.glb",
         {}, split=("z", 0.300, "Steel", "WoodBeam"),
         target=("z", 1.15), triangles=300,
         note="source is modelled blade-down as if struck into the ground"),

    # —— Kenney Fantasy Town Kit ——
    Spec("CartWheel", "Model_KenneyFantasyTownKit", "wheel.glb",
         {"*": "WoodBeam"}, target=("z", 1.10), triangles=300),
    Spec("YardBench", "Model_KenneyFantasyTownKit", "stall-bench.glb",
         {"*": "WoodDoor"}, target=("y", 1.60), triangles=300),
    Spec("YardStool", "Model_KenneyFantasyTownKit", "stall-stool.glb",
         {"*": "WoodDoor"}, target=("z", 0.44), triangles=300),
    Spec("DryingRack", "Model_KenneyFantasyTownKit", "poles-horizontal.glb",
         {"*": "WoodBeam"}, target=("z", 1.95), triangles=300),
)


def ResetScene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def Marker(name: str) -> bpy.types.Material:
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
        material.use_nodes = False
        material.diffuse_color = MARKER_COLOR[name]
    return material


def Import(spec: Spec) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    path = SOURCE / spec.folder / spec.file
    if not path.exists():
        raise RuntimeError(f"missing source {path}; run Script_RuralYardFetch.py first")
    if path.suffix.lower() == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path))
    else:
        bpy.ops.import_scene.gltf(filepath=str(path))
    return [obj for obj in bpy.data.objects
            if obj not in before and obj.type == "MESH"]


def Flatten(obj: bpy.types.Object) -> None:
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = world


def Repaint(obj: bpy.types.Object, spec: Spec) -> None:
    """Rewrite material slots to runtime recipes, dropping any mapped to None.

    Faces are re-indexed rather than the slots renamed, because several sources
    map two source slots (Stone_Dark / Stone_Light) onto the same recipe and a
    later join would otherwise carry duplicate slots into the export.
    """
    mesh = obj.data
    # Blender uniquifies a re-imported material as "Wood.001"; the spec keys are
    # the upstream names, so the suffix has to come off before the lookup.
    source_names = [re.sub(r"\.\d{3}$", "", slot.material.name)
                    if slot.material else "*"
                    for slot in obj.material_slots] or ["*"]

    def Recipe(index: int) -> str | None:
        name = source_names[index] if index < len(source_names) else "*"
        if name in spec.materials:
            return spec.materials[name]
        if "*" in spec.materials:
            return spec.materials["*"]
        raise RuntimeError(f"{spec.node}: source material {name!r} is unmapped")

    if spec.split:
        axis, threshold, below, above = spec.split
        lane = "xyz".index(axis)
        assignment = []
        for polygon in mesh.polygons:
            centre = sum((mesh.vertices[v].co for v in polygon.vertices),
                         Vector()) / len(polygon.vertices)
            assignment.append(below if centre[lane] < threshold else above)
    else:
        assignment = [Recipe(polygon.material_index) for polygon in mesh.polygons]

    if spec.clip:
        axis, ceiling = spec.clip
        lane = "xyz".index(axis)
        for index, polygon in enumerate(mesh.polygons):
            centre = sum((mesh.vertices[v].co for v in polygon.vertices),
                         Vector()) / len(polygon.vertices)
            if centre[lane] > ceiling:
                assignment[index] = None

    doomed = [index for index, recipe in enumerate(assignment) if recipe is None]
    order: list[str] = []
    for recipe in assignment:
        if recipe is not None and recipe not in order:
            order.append(recipe)

    mesh.materials.clear()
    for recipe in order:
        mesh.materials.append(Marker(recipe))
    for polygon, recipe in zip(mesh.polygons, assignment):
        polygon.material_index = 0 if recipe is None else order.index(recipe)

    if doomed:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="DESELECT")
        bpy.ops.object.mode_set(mode="OBJECT")
        for index in doomed:
            mesh.polygons[index].select = True
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.delete(type="FACE")
        # Deleting faces leaves behind every vertex a surviving face still
        # shares — and, where a tall face straddled the clip plane, vertices
        # far above everything that is left.  glTF only exports vertices a
        # triangle references, so Blender-side measurements would be taken on
        # geometry that never ships: the well measured 0.95 m tall in Blender
        # and came out 0.37 m in the GLB, scaled against a phantom roof.
        bpy.ops.mesh.select_all(action="DESELECT")
        bpy.ops.mesh.select_loose()
        bpy.ops.mesh.delete(type="VERT")
        bpy.ops.object.mode_set(mode="OBJECT")


def Join(objects: list[bpy.types.Object], name: str) -> bpy.types.Object:
    if not objects:
        raise RuntimeError(f"no source objects for {name}")
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
    """Measure from the vertices, never from `obj.bound_box`.

    `mesh.transform()` does not dirty the cached bound box, so reading it right
    after the rotate step returns the *pre*-rotation extents.  That silently
    scaled the hoe against the wrong axis (1.55 m landed on Z instead of Y and
    the prop came out 5.2 m long) — these meshes are a few hundred vertices, so
    just walk them.
    """
    points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    if not points:
        raise RuntimeError(f"{obj.name}: nothing left to measure")
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    return low, high


def Optimize(obj: bpy.types.Object, spec: Spec) -> tuple[int, int, Vector]:
    before = Triangles(obj)
    if before > spec.triangles:
        modifier = obj.modifiers.new("RuntimeDecimate", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = max(0.01, min(1.0, spec.triangles / before))
        modifier.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)

    # Blender is Z-up; the glTF exporter turns this into the game's Y-up, so
    # "sits on the ground" is min Z here and min Y in Script_ExternalProps.
    low, high = Bounds(obj)
    obj.data.transform(Matrix.Translation(
        (-(low.x + high.x) / 2, -(low.y + high.y) / 2, -low.z)))
    low, high = Bounds(obj)
    axis, metres = spec.target
    current = (high - low)["xyz".index(axis)]
    if current <= 1e-6:
        raise RuntimeError(f"{spec.node}: zero extent on {axis}")
    obj.data.transform(Matrix.Scale(metres / current, 4))
    obj.location = (0, 0, 0)

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_flat()

    low, high = Bounds(obj)
    return before, Triangles(obj), high - low


def Bake(spec: Spec) -> bpy.types.Object:
    imported = Import(spec)
    for obj in imported:
        Flatten(obj)
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        Repaint(obj, spec)
    obj = Join(imported, spec.node)
    if any(spec.rotate):
        rotation = Matrix.Identity(4)
        for lane, degrees in zip("XYZ", spec.rotate):
            if degrees:
                rotation = Matrix.Rotation(degrees * 3.14159265358979 / 180.0,
                                           4, lane) @ rotation
        obj.data.transform(rotation)
    before, after, size = Optimize(obj, spec)
    slots = [slot.material.name for slot in obj.material_slots if slot.material]
    print(f"{spec.node}: {before} -> {after} tris  "
          f"size=({size.x:.2f}, {size.y:.2f}, {size.z:.2f}) m  "
          f"materials={slots}", flush=True)
    return obj


def Export(objects: list[bpy.types.Object], file_name: str) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    output = MODEL / file_name
    bpy.ops.export_scene.gltf(
        filepath=str(output), export_format="GLB", use_selection=True,
        export_apply=True, export_materials="EXPORT", export_yup=True,
    )
    print(f"EXPORTED {file_name} ({output.stat().st_size} bytes)", flush=True)


def Main() -> None:
    MODEL.mkdir(parents=True, exist_ok=True)
    ResetScene()
    baked = [Bake(spec) for spec in SPECS]
    Export(baked, OUTPUT)
    print("RURAL_YARD_BAKE_OK", flush=True)


if __name__ == "__main__":
    Main()
