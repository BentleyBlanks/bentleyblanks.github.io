"""Bake the approved Sketchfab packs into lightweight component-library GLBs.

Run with Blender:
  blender --background --python Script_SketchfabPackBake.py

Source textures are intentionally replaced with the game's shared material
recipes.  This preserves distinct wood/metal/cloth/roof surfaces without
shipping the packs' 4K texture payloads to every browser.
"""

from __future__ import annotations

from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector


importDir = Path(__file__).resolve().parent
sourceDir = importDir / "Source"
modelDir = importDir.parent / "Model"


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
        material.diffuse_color = {
            "Adobe": (0.48, 0.40, 0.31, 1),
            "RoofTile": (0.30, 0.25, 0.22, 1),
            "WoodBeam": (0.29, 0.21, 0.14, 1),
            "WoodDoor": (0.34, 0.23, 0.14, 1),
            "Steel": (0.23, 0.24, 0.25, 1),
            "Sandbag": (0.42, 0.38, 0.28, 1),
            "Ground": (0.30, 0.27, 0.22, 1),
            "Stone": (0.34, 0.33, 0.30, 1),
        }[name]
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


def Optimize(
    obj: bpy.types.Object,
    targetTriangles: int,
    targetSpan: float | None = None,
    flatShading: bool = False,
) -> tuple[int, int]:
    before = Triangles(obj)
    if before > targetTriangles:
        modifier = obj.modifiers.new("RuntimeDecimate", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = max(0.01, min(1.0, targetTriangles / before))
        modifier.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)

    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    low = Vector(tuple(min(point[axis] for point in corners) for axis in range(3)))
    high = Vector(tuple(max(point[axis] for point in corners) for axis in range(3)))
    obj.data.transform(Matrix.Translation((-(low.x + high.x) / 2, -(low.y + high.y) / 2, -low.z)))
    if targetSpan is not None:
        currentSpan = max(high.x - low.x, high.y - low.y, high.z - low.z)
        obj.data.transform(Matrix.Scale(targetSpan / currentSpan, 4))
    obj.location = (0, 0, 0)

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if flatShading:
        # The market crates are assembled from square-section slats. Smoothing their
        # 90-degree corners turns every broad board face into a false bulge under the
        # studio/game lights. Imported glTF meshes retain custom split normals even
        # after shade_flat, so explicitly replace every loop normal with its face normal.
        bpy.ops.object.shade_flat()
        flatNormals = [None] * len(obj.data.loops)
        for polygon in obj.data.polygons:
            for loopIndex in polygon.loop_indices:
                flatNormals[loopIndex] = polygon.normal.copy()
        obj.data.normals_split_custom_set(flatNormals)
    else:
        bpy.ops.object.shade_smooth_by_angle()
    return before, Triangles(obj)


def RebuildSurfaceNormals(obj: bpy.types.Object) -> None:
    """Discard bad imported split normals and rebuild them from face winding."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if obj.data.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    bpy.ops.object.shade_smooth_by_angle()


def Process(
    objects,
    name,
    materialFor,
    targetTriangles,
    targetSpan=None,
    flatShading=False,
    rebuildNormals=False,
):
    for obj in objects:
        SetMarker(obj, materialFor(obj) if callable(materialFor) else materialFor)
    result = Join(objects, name)
    before, after = Optimize(result, targetTriangles, targetSpan, flatShading)
    if rebuildNormals:
        RebuildSurfaceNormals(result)
    print(f"{name}: {before} -> {after} triangles", flush=True)
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


def ByParent(objects: list[bpy.types.Object]) -> dict[str, list[bpy.types.Object]]:
    groups = {}
    for obj in objects:
        key = obj.parent.name if obj.parent else obj.name
        groups.setdefault(key, []).append(obj)
    return groups


def BakeCourtyard() -> None:
    ResetScene()
    imported = Import("Model_SketchfabAncientChineseCourtyardHouse")
    house = Process(
        imported, "AncientChineseCourtyardHouse",
        lambda obj: "RoofTile" if "ROOF" in obj.name.upper() else "Adobe",
        5500,
    )
    Export([house], "Model_AncientChineseCourtyardHouse.glb")


battlefieldSpecs = (
    ("barbed_wiere.001_3", "BattlefieldBarbedWire01", "Steel", 200),
    ("barbed_wiere_2", "BattlefieldBarbedWire02", "Steel", 200),
    ("Cube.005_0", "BattlefieldBeamObstacle01", "WoodBeam", 200),
    ("Cube.007_1", "BattlefieldBeamObstacle02", "WoodBeam", 200),
    ("Cube.001_5", "BattlefieldSupplyBox", "WoodDoor", 200),
    ("Plane.002_4", "BattlefieldCanvasCover01", "Sandbag", 800),
    ("Cube.002_10", "BattlefieldCompartmentCrate", "WoodDoor", 400),
    ("Cube_6", "BattlefieldShellStack", "Steel", 1200),
    ("Cube.003_7", "BattlefieldGrenadeStack", "Steel", 900),
    ("Cube.004_8", "BattlefieldCartridgeScatter", "Steel", 700),
    ("Plane.003_9", "BattlefieldCanvasCover02", "Sandbag", 700),
    ("Cube.006_11", "BattlefieldHedgehog", "Steel", 300),
    ("Cube.008_13", "BattlefieldOpenBin", "WoodDoor", 500),
    ("Cube.009_12", "BattlefieldGroundSheet", "Sandbag", 200),
    ("Cube.010_14", "BattlefieldTimberBeam", "WoodBeam", 200),
    ("Cylinder_15", "BattlefieldMetalPole", "Steel", 100),
    ("Cylinder.003_16", "BattlefieldPillbox", "Stone", 1600),
    ("Cylinder.008_17", "BattlefieldLadder", "Steel", 700),
    ("Landscape_18", "BattlefieldTrenchEarthwork", "Ground", 3500),
    ("Plane_19", "BattlefieldSandbag01", "Sandbag", 600),
    ("Plane.005_20", "BattlefieldSandbag02", "Sandbag", 600),
    ("Plane.006_21", "BattlefieldSandbag03", "Sandbag", 600),
    ("Plane.007_22", "BattlefieldGroundPlane", "Ground", 200),
    ("Sphere_23", "BattlefieldRock", "Stone", 200),
)

# These source groups carry split normals opposite to their triangle winding.
# The main pass still draws their front faces, but the normal/depth prepass then
# points the SSAO hemisphere into the solid and turns the whole prop black.
battlefieldNormalRepairNames = frozenset((
    "BattlefieldBeamObstacle01",
    "BattlefieldPillbox",
))


def BakeBattlefield() -> None:
    ResetScene()
    groups = ByParent(Import("Model_SketchfabBattlefieldPack"))
    output = []
    for sourceName, runtimeName, material, target in battlefieldSpecs:
        output.append(Process(
            groups[sourceName], runtimeName, material, target,
            rebuildNormals=runtimeName in battlefieldNormalRepairNames,
        ))
    Export(output, "Model_BattlefieldPack.glb")


marketStorageSpecs = (
    ("Sack1", "MarketRiceSack01", "Sandbag", 900, 0.75),
    ("Sack2", "MarketRiceSack02", "Sandbag", 800, 0.78),
    ("Box1", "MarketBox01", "WoodDoor", 300, 0.55),
    ("Box2", "MarketBox02", "WoodDoor", 300, 0.75),
    ("Box3", "MarketBox03", "WoodDoor", 300, 0.95),
    ("Wooden Crate", "MarketCrate01", "WoodDoor", 300, 0.75),
    ("Wooden Crate.001", "MarketCrate02", "WoodDoor", 300, 0.75),
    ("Wooden Crate.002", "MarketCrate03", "WoodDoor", 300, 0.75),
    ("Wooden Crate.003", "MarketCrate04", "WoodDoor", 300, 0.75),
)


def BakeMarket() -> None:
    ResetScene()
    groups = ByParent(Import("Model_SketchfabMedievalMarketAssetPack"))
    handcart = Process(
        groups["Handcart"], "MarketHandcart",
        lambda obj: "Steel" if "METAL" in obj.name.upper() else "WoodBeam",
        4200, 2.45,
    )
    Export([handcart], "Model_Handcart.glb")

    ResetScene()
    groups = ByParent(Import("Model_SketchfabMedievalMarketAssetPack"))
    output = []
    for sourceName, runtimeName, material, target, span in marketStorageSpecs:
        members = [obj for obj in groups[sourceName] if "PLANE" not in obj.name.upper()]
        output.append(Process(
            members, runtimeName, material, target, span,
            flatShading=runtimeName.startswith("MarketCrate"),
        ))
    Export(output, "Model_MarketStorageSet.glb")


def Main() -> None:
    modelDir.mkdir(parents=True, exist_ok=True)
    if "--battlefield-only" in sys.argv:
        BakeBattlefield()
        print("SKETCHFAB_BATTLEFIELD_BAKE_OK", flush=True)
        return
    BakeCourtyard()
    BakeBattlefield()
    BakeMarket()
    print("SKETCHFAB_PACK_BAKE_OK", flush=True)


if __name__ == "__main__":
    Main()
