"""Bake the Poly Haven CC0 household-ware sources into one runtime GLB.

Run with Blender, not system Python:
  blender --background --python Script_HouseholdWareBake.py

Sources come from `Script_PolyHavenFetch.py` (see Data_SourceLicenses.md); this
script only decimates, re-scales, grounds and re-materialises them.  Same
contract as Script_ExternalAssetBake.py:

  * one PascalCase node per ware, all of them in a single shared GLB;
  * origin at the **bottom face centre** (minZ = 0, XY centred) so
    `Script_ExternalProps.PrepareAsset` has nothing left to correct;
  * every downloaded texture stripped — the runtime rebinds the project's own
    baked recipes by material name, which is why the material of each object is
    renamed to that recipe here.

Two things this bake does that the battlefield bake did not need:

  * **Real-world spans.**  Poly Haven ships some of these at scan scale (the
    small stool arrives 26 cm long, the flat basket 12 cm deep).  Each
    declaration therefore carries the intended longest span in metres, taken
    from the 1938 Luxian county-town brief rather than from the source file.
  * **Lay-down rotation.**  Hand tools are modelled standing on their long axis;
    dropped into a scene at minZ = 0 an axe would balance on its blade.  The
    three tools get re-oriented so they lie the way a dropped tool does — see
    `LayFlat`, which permutes axes by measured extent rather than by a
    per-tool magic angle, because the three sources do not agree on which local
    axis is the thin one.
"""

from __future__ import annotations

from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "Source"
MODEL = HERE.parent / "Model"
OUTPUT = "Model_HouseholdWareSet.glb"

# Recipe names come from Script_TexBake.RECIPES / Script_TengxianCity.MATERIALS.
# Nothing new is invented here; the runtime looks the name up, it does not read
# any colour out of this file.
WARES = (
    # node, source folder, gltf file, triangles, span (m), material, lay flat, drop faces
    ("WoodenBucket", "Model_PolyHavenWoodenBucket01", "wooden_bucket_01_1k.gltf",
     900, 0.46, "WoodDoor", False, None),
    ("WoodenWashTub", "Model_PolyHavenWoodenBucket02", "wooden_bucket_02_1k.gltf",
     900, None, "WoodDoor", False, None),
    ("ClayJarLidded", "Model_PolyHavenCeramicPot", "ceramic_pot_1k.gltf",
     800, 0.58, "HouseholdCeramic", False, None),
    ("ClayFlowerPot", "Model_PolyHavenPlanterPotClay", "planter_pot_clay_1k.gltf",
     500, None, "HouseholdCeramic", False, None),
    ("ChineseWoodStool", "Model_PolyHavenChineseStool", "chinese_stool_1k.gltf",
     1000, 0.52, "WoodDoor", False, None),
    ("LowWoodStool", "Model_PolyHavenWoodenStool02", "wooden_stool_02_1k.gltf",
     700, 0.34, "WoodDoor", False, None),
    ("RoughWoodTable", "Model_PolyHavenWoodenTable02", "wooden_table_02_1k.gltf",
     1200, None, "WoodBeam", False, None),
    ("WickerTray", "Model_PolyHavenWickerBasket01", "wicker_basket_01_1k.gltf",
     900, 0.52, "Wicker", False, None),
    ("WickerBasketLidded", "Model_PolyHavenWickerBasket02", "wicker_basket_02_1k.gltf",
     1000, 0.46, "Wicker", False, None),
    ("WoodAxe", "Model_PolyHavenWoodenAxe02", "wooden_axe_02_1k.gltf",
     500, 0.70, "Steel", True, None),
    ("SmithHammer", "Model_PolyHavenCrossPeinHammer", "cross_pein_hammer_1k.gltf",
     400, 0.34, "Steel", True, None),
    ("IronSpade", "Model_PolyHavenRustedSpade01", "rusted_spade_01_1k.gltf",
     700, None, "Steel", True, None),
    ("FirewoodBranches", "Model_PolyHavenDryBranchesMedium01", "dry_branches_medium_01_1k.gltf",
     1200, 1.10, "WoodBeam", False, None),
    # The lantern's panes are a separate `_glass` material.  Keeping them would
    # bake a solid wooden block once the source textures are gone; dropping them
    # leaves the open frame that actually reads as a lantern.
    ("WoodLantern", "Model_PolyHavenWoodenLantern01", "wooden_lantern_01_1k.gltf",
     900, 0.42, "WoodDoor", False, "glass"),
)


def ResetScene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def Import(source_name: str, file_name: str) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE / source_name / file_name))
    return [obj for obj in bpy.data.objects if obj not in before and obj.type == "MESH"]


def TriangleCount(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def DropFaces(objects: list[bpy.types.Object], needle: str) -> None:
    """Delete every face whose material name contains `needle` (case-folded)."""
    for obj in objects:
        slots = [index for index, slot in enumerate(obj.material_slots)
                 if slot.material and needle in slot.material.name.lower()]
        if not slots:
            continue
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        doomed = [face for face in mesh.faces if face.material_index in slots]
        bmesh.ops.delete(mesh, geom=doomed, context="FACES")
        mesh.to_mesh(obj.data)
        mesh.free()


def Join(objects: list[bpy.types.Object], name: str) -> bpy.types.Object:
    if not objects:
        raise RuntimeError(f"No source objects selected for {name}")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.convert(target="MESH")
    if len(objects) > 1:
        bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    obj.data = obj.data.copy()
    obj.data.name = f"Mesh_{name}"
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def DeleteLoose(obj: bpy.types.Object) -> int:
    """Drop verts/edges that no face uses, and report how many verts went.

    Collapse decimation orphans vertices: the dry-branch pile keeps 1200 faces
    but 1881 verts, 583 of them attached to nothing.  The glTF exporter silently
    drops those, so a bounding box measured before this runs describes geometry
    that never ships — that is a 1.2 mm wider box, and it left the pile 0.5 mm
    off centre.  Everything downstream reads that box (ground snap, the span
    rescale, and the collision box `Script_ExternalProps.PrepareAsset` derives
    from the loaded bounds), so it has to be measured on the shipped geometry.
    """
    before = len(obj.data.vertices)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.delete_loose(use_verts=True, use_edges=True, use_faces=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    return before - len(obj.data.vertices)


def Bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    """Bounds straight off the vertices.

    `obj.bound_box` is a cache; this bake rewrites mesh data in place (rotate,
    then translate, then scale) and reads the bounds between each step, which is
    exactly the case the cache gets wrong.
    """
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for vertex in obj.data.vertices:
        point = obj.matrix_world @ vertex.co
        for axis in range(3):
            lo[axis] = min(lo[axis], point[axis])
            hi[axis] = max(hi[axis], point[axis])
    return lo, hi


def LayFlat(obj: bpy.types.Object) -> None:
    """Put the object's longest extent along Y and its thinnest along Z.

    A dropped tool rests on its widest face.  Rotating each source by a
    hand-picked angle got that wrong for the axe: its thin axis (the blade
    cheek, 5 cm) is local X while the hammer's and the spade's is local Y, so a
    single 90° X rotation left the axe standing on its cutting edge.  Sorting
    the three axes by measured extent and permuting them is the same fix for all
    three and for anything added later.  The permutation is forced back to a
    right-handed basis so the mesh is not mirrored.
    """
    lo, hi = Bounds(obj)
    extents = [hi[axis] - lo[axis] for axis in range(3)]
    order = sorted(range(3), key=lambda axis: extents[axis])  # short, middle, long
    short, middle, long_axis = order
    rotation = Matrix.Identity(3)
    rotation[0] = Vector.Fill(3, 0.0); rotation[0][middle] = 1.0     # X <- middle
    rotation[1] = Vector.Fill(3, 0.0); rotation[1][long_axis] = 1.0  # Y <- longest
    rotation[2] = Vector.Fill(3, 0.0); rotation[2][short] = 1.0      # Z <- thinnest
    if rotation.determinant() < 0:
        rotation[0] = -rotation[0]
    obj.data.transform(rotation.to_4x4())


def Material(name: str) -> bpy.types.Material:
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
        material.use_nodes = False
    return material


def Optimize(obj: bpy.types.Object, target_triangles: int,
             target_span: float | None, material_name: str, lay_flat: bool) -> tuple[int, int, int]:
    before = TriangleCount(obj)
    if before > target_triangles:
        modifier = obj.modifiers.new("RuntimeDecimate", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = max(0.01, min(1.0, target_triangles / before))
        modifier.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    orphans = DeleteLoose(obj)

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth_by_angle()

    # Blender is Z-up; the glTF exporter turns this into the game's Y-up.
    if lay_flat:
        LayFlat(obj)
    lo, hi = Bounds(obj)
    obj.data.transform(Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)))
    if target_span is not None:
        current = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
        obj.data.transform(Matrix.Scale(target_span / current, 4))
    obj.location = (0, 0, 0)

    # Strip the downloaded PBR set; the runtime rebinds by this name.
    obj.data.materials.clear()
    obj.data.materials.append(Material(material_name))
    return before, TriangleCount(obj), orphans


def Export(objects: list[bpy.types.Object], file_name: str) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    output = MODEL / file_name
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
        export_yup=True,
    )
    print(f"EXPORTED {output.name} ({output.stat().st_size} bytes)", flush=True)


def Main() -> None:
    MODEL.mkdir(parents=True, exist_ok=True)
    ResetScene()
    baked = []
    for name, folder, file_name, budget, span, material_name, lay_flat, drop in WARES:
        imported = Import(folder, file_name)
        if drop:
            DropFaces(imported, drop)
        obj = Join(imported, name)
        before, after, orphans = Optimize(obj, budget, span, material_name, lay_flat)
        lo, hi = Bounds(obj)
        print("%-20s %5d -> %4d tris  %.3f x %.3f x %.3f m  minZ=%.4f  loose=%-4d %s"
              % (name, before, after, hi.x - lo.x, hi.y - lo.y, hi.z - lo.z,
                 lo.z, orphans, material_name), flush=True)
        baked.append(obj)
    Export(baked, OUTPUT)
    print("HOUSEHOLD_WARE_BAKE_OK", flush=True)


if __name__ == "__main__":
    Main()
