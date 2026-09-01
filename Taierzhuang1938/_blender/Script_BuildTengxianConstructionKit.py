"""Build the self-authored Tengxian construction-library GLB.

The six roots in this file deliberately have no level coordinates.  They are
exported as named nodes for Script_ExternalProps / PropLibraryEditor, where
they can be inspected before a later dressing pass decides whether and where
they belong.  No source photo, generated concept image, third-party geometry,
or texture is embedded in this asset: runtime materials are rebound from the
project PBR library by their material names.

Historical form constraints used here:
  - Low, hard-gable southern-Shandong brick / pale-through-stone buildings.
  - Almost-windowless exterior courtyard walls and a southeast-facing gate.
  - Tengxian's substantial brick-and-stone city gate rather than a small
    Taierzhuang-style stockade gate.
  - A restrained, inferred third-class Jinpu Railway station; its exact
    Tengxian plan is not documented, so it is intentionally generic.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT_DIR = Path(__file__).resolve().parents[1]
MODEL_PATH = PROJECT_DIR / "Model" / "Model_TengxianConstructionKit.glb"
BLEND_PATH = Path(__file__).resolve().parent / "Scene_TengxianConstructionKit.blend"


def clear_scene():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for blocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for block in list(blocks):
            if block.users == 0:
                blocks.remove(block)


def material(name, color, roughness=0.86, metallic=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


MATERIALS = {}


def make_materials():
    # Names must match Script_TengxianCity.MATERIALS so ExternalProps can
    # substitute project PBR rather than preserve these viewport swatches.
    MATERIALS.update({
        "HouseBrick": material("HouseBrick", (0.29, 0.31, 0.33)),
        "GateBrick": material("GateBrick", (0.34, 0.34, 0.33)),
        "StationBrick": material("StationBrick", (0.40, 0.20, 0.12)),
        "Stone": material("Stone", (0.50, 0.48, 0.43)),
        "RoofTile": material("RoofTile", (0.18, 0.20, 0.22)),
        "GateRoofTile": material("GateRoofTile", (0.16, 0.18, 0.20)),
        "WoodDoor": material("WoodDoor", (0.23, 0.15, 0.09)),
        "WoodBeam": material("WoodBeam", (0.29, 0.20, 0.12)),
        "RammedEarth": material("RammedEarth", (0.38, 0.29, 0.18)),
        "Sandbag": material("Sandbag", (0.38, 0.34, 0.25)),
        "GroundRubble": material("GroundRubble", (0.31, 0.24, 0.16)),
        "Steel": material("Steel", (0.18, 0.19, 0.20), 0.68, 0.45),
    })


def root_node(name, display_name):
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    root["assetId"] = name
    root["displayName"] = display_name
    return root


def link(parent, obj):
    obj.parent = parent
    return obj


def add_box(parent, name, center, size, mat, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=center, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return link(parent, obj)


def add_cylinder(parent, name, center, radius, depth, mat, vertices=10):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=center,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return link(parent, obj)


def add_sandbag(parent, name, center, scale, rotation_z=0.0):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=8,
        ring_count=4,
        radius=1.0,
        location=center,
        rotation=(0.0, 0.0, rotation_z),
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(MATERIALS["Sandbag"])
    return link(parent, obj)


def add_gable_roof(parent, name, center_x, center_z, width, depth, eave_y, rise, mat):
    """A compact, tile-ribbed hard-gable roof with its ridge parallel to X."""
    half_depth = depth * 0.5
    slope = math.atan2(rise, half_depth)
    panel_length = math.hypot(half_depth, rise) + 0.16
    for side in (-1, 1):
        add_box(
            parent,
            f"{name}_Slope_{'South' if side < 0 else 'North'}",
            (center_x, eave_y + rise * 0.5, center_z + side * depth * 0.25),
            (width + 0.34, 0.14, panel_length),
            mat,
            rotation=(side * slope, 0.0, 0.0),
        )
        # Sparse tile courses make the low-poly roof read at the studio scale.
        for index in range(1, 5):
            distance = (index / 5.0) * half_depth
            z = center_z + side * distance
            y = eave_y + rise * (1.0 - distance / half_depth) + 0.07
            add_box(
                parent,
                f"{name}_Course_{side}_{index}",
                (center_x, y, z),
                (width + 0.39, 0.045, 0.12),
                mat,
                rotation=(side * slope, 0.0, 0.0),
            )
    add_box(
        parent,
        f"{name}_Ridge",
        (center_x, eave_y + rise + 0.1, center_z),
        (width + 0.42, 0.18, 0.22),
        mat,
    )


def add_folding_shop_doors(parent, center_x, center_z, width, height):
    panel_width = width / 6.0
    for index in range(6):
        x = center_x - width * 0.5 + panel_width * (index + 0.5)
        add_box(
            parent,
            f"ShopDoor_{index + 1}",
            (x, height * 0.5 + 0.48, center_z),
            (panel_width - 0.06, height, 0.12),
            MATERIALS["WoodDoor"],
        )
        add_box(
            parent,
            f"ShopDoorBrace_{index + 1}",
            (x, height * 0.5 + 0.48, center_z - 0.075),
            (panel_width - 0.16, 0.09, 0.05),
            MATERIALS["WoodBeam"],
        )


def build_shop_facade():
    root = root_node("TengxianShopFacade", "滕县临街铺面")
    add_box(root, "ShopStonePlinth", (0, 0.23, 0), (8.4, 0.46, 4.05), MATERIALS["Stone"])
    add_box(root, "ShopBrickBody", (0, 1.92, 0.06), (8.0, 3.0, 3.7), MATERIALS["HouseBrick"])
    add_box(root, "ShopStoneBandLow", (0, 0.72, 0.06), (8.08, 0.16, 3.78), MATERIALS["Stone"])
    add_box(root, "ShopStoneBandHigh", (0, 2.9, 0.06), (8.08, 0.14, 3.78), MATERIALS["Stone"])
    for side in (-1, 1):
        add_box(
            root,
            f"ShopThroughStonePillar_{side}",
            (side * 3.7, 1.92, -1.9),
            (0.36, 2.95, 0.32),
            MATERIALS["Stone"],
        )
    add_folding_shop_doors(root, 0.0, -1.92, 6.55, 2.25)
    add_box(root, "ShopLintel", (0, 2.9, -1.98), (7.3, 0.26, 0.32), MATERIALS["WoodBeam"])
    add_box(root, "ShopStep", (0, 0.32, -2.18), (7.4, 0.28, 0.55), MATERIALS["Stone"])
    add_gable_roof(root, "ShopRoof", 0.0, 0.0, 8.5, 4.35, 3.35, 1.05, MATERIALS["RoofTile"])
    return root


def build_courtyard_house():
    root = root_node("TengxianCourtyardHouse", "滕县一进院落")
    add_box(root, "CourtyardFoundation", (0, 0.10, 0), (9.6, 0.20, 8.6), MATERIALS["GroundRubble"])
    add_box(root, "CourtyardWestWall", (-4.55, 1.22, 0), (0.42, 2.45, 8.1), MATERIALS["HouseBrick"])
    add_box(root, "CourtyardEastWall", (4.55, 1.22, 0), (0.42, 2.45, 8.1), MATERIALS["HouseBrick"])
    add_box(root, "CourtyardBackWall", (0, 1.22, 3.85), (9.1, 2.45, 0.42), MATERIALS["HouseBrick"])
    add_box(root, "CourtyardFrontWallWest", (-3.0, 1.22, -3.85), (3.1, 2.45, 0.42), MATERIALS["HouseBrick"])
    add_box(root, "CourtyardFrontWallEast", (3.0, 1.22, -3.85), (3.1, 2.45, 0.42), MATERIALS["HouseBrick"])
    add_box(root, "CourtyardStoneBand", (0, 0.62, -3.86), (9.2, 0.17, 0.48), MATERIALS["Stone"])
    # Southeast gate, per the Lunan courtyard convention, deliberately has
    # no window treatment on the exterior.
    add_box(root, "CourtyardGateLeft", (0.92, 1.22, -3.88), (0.24, 2.44, 0.55), MATERIALS["Stone"])
    add_box(root, "CourtyardGateRight", (2.72, 1.22, -3.88), (0.24, 2.44, 0.55), MATERIALS["Stone"])
    add_box(root, "CourtyardGateLintel", (1.82, 2.32, -3.88), (2.06, 0.28, 0.58), MATERIALS["WoodBeam"])
    add_box(root, "CourtyardGateDoor", (1.82, 1.2, -3.94), (1.58, 2.15, 0.13), MATERIALS["WoodDoor"])
    add_gable_roof(root, "CourtyardGateRoof", 1.82, -3.85, 2.55, 1.2, 2.45, 0.55, MATERIALS["RoofTile"])
    add_box(root, "CourtyardRearHouse", (0, 2.15, 1.9), (6.9, 3.25, 3.0), MATERIALS["HouseBrick"])
    add_box(root, "CourtyardRearHouseBase", (0, 0.43, 1.9), (7.15, 0.32, 3.25), MATERIALS["Stone"])
    add_box(root, "CourtyardRearDoor", (0, 1.53, 0.35), (1.45, 2.15, 0.14), MATERIALS["WoodDoor"])
    add_gable_roof(root, "CourtyardHouseRoof", 0.0, 1.9, 7.35, 3.45, 3.78, 1.10, MATERIALS["RoofTile"])
    return root


def build_county_office_gatehouse():
    root = root_node("TengxianCountyOfficeGatehouse", "滕县县署门楼")
    add_box(root, "YamenStonePlinth", (0, 0.24, 0), (8.2, 0.48, 4.6), MATERIALS["Stone"])
    add_box(root, "YamenWestWall", (-3.0, 1.75, 0.3), (2.0, 2.9, 3.4), MATERIALS["HouseBrick"])
    add_box(root, "YamenEastWall", (3.0, 1.75, 0.3), (2.0, 2.9, 3.4), MATERIALS["HouseBrick"])
    for side in (-1, 1):
        add_cylinder(root, f"YamenPillar_{side}", (side * 1.45, 1.78, -1.55), 0.17, 2.9, MATERIALS["WoodBeam"], 8)
        add_box(
            root,
            f"YamenStonePillarBase_{side}",
            (side * 1.45, 0.49, -1.55),
            (0.52, 0.42, 0.52),
            MATERIALS["Stone"],
        )
    add_box(root, "YamenGateLintel", (0, 3.12, -1.55), (3.4, 0.34, 0.42), MATERIALS["WoodBeam"])
    add_box(root, "YamenGateThreshold", (0, 0.47, -1.62), (3.1, 0.18, 0.52), MATERIALS["Stone"])
    add_box(root, "YamenBackWall", (0, 2.05, 1.55), (7.3, 2.35, 0.38), MATERIALS["HouseBrick"])
    add_gable_roof(root, "YamenRoof", 0.0, 0.2, 8.15, 4.4, 3.55, 1.18, MATERIALS["RoofTile"])
    return root


def build_city_gate_tower():
    root = root_node("TengxianCityGateTower", "滕县城门楼")
    # Brick-and-stone base: two piers and a lintel preserve a real walk-through
    # opening rather than a painted arch on a solid block.
    add_box(root, "GateWestPier", (-4.45, 2.35, 0), (3.1, 4.7, 6.6), MATERIALS["GateBrick"])
    add_box(root, "GateEastPier", (4.45, 2.35, 0), (3.1, 4.7, 6.6), MATERIALS["GateBrick"])
    add_box(root, "GateUpperLintel", (0, 4.2, 0), (12.0, 1.0, 6.6), MATERIALS["GateBrick"])
    add_box(root, "GateStoneFootWest", (-4.45, 0.36, 0), (3.32, 0.72, 6.85), MATERIALS["Stone"])
    add_box(root, "GateStoneFootEast", (4.45, 0.36, 0), (3.32, 0.72, 6.85), MATERIALS["Stone"])
    add_box(root, "GateStoneThreshold", (0, 0.25, 0), (5.85, 0.30, 6.2), MATERIALS["Stone"])
    add_box(root, "GateWoodenDoorLeft", (-1.38, 2.0, -3.34), (2.45, 3.65, 0.14), MATERIALS["WoodDoor"])
    add_box(root, "GateWoodenDoorRight", (1.38, 2.0, -3.34), (2.45, 3.65, 0.14), MATERIALS["WoodDoor"])
    add_box(root, "GateDeck", (0, 5.05, 0), (12.8, 0.38, 7.4), MATERIALS["WoodBeam"])
    add_box(root, "GateTowerHall", (0, 6.15, 0.15), (10.7, 2.0, 5.45), MATERIALS["WoodDoor"])
    for side in (-1, 1):
        for z in (-2.35, 2.35):
            add_cylinder(root, f"GateHallColumn_{side}_{z}", (side * 4.65, 6.1, z), 0.19, 2.0, MATERIALS["WoodBeam"], 8)
    # Lower shelter roof and an upper roof make the distinct double-eave silhouette.
    add_gable_roof(root, "GateLowerEave", 0.0, 0.1, 12.1, 6.9, 6.6, 1.0, MATERIALS["GateRoofTile"])
    add_gable_roof(root, "GateUpperEave", 0.0, 0.1, 10.6, 5.55, 8.1, 1.12, MATERIALS["GateRoofTile"])
    for x in (-5.4, -3.6, -1.8, 0.0, 1.8, 3.6, 5.4):
        add_box(root, f"GateFrontBattlement_{x}", (x, 5.42, -3.05), (0.82, 0.72, 0.42), MATERIALS["GateBrick"])
        add_box(root, f"GateRearBattlement_{x}", (x, 5.42, 3.05), (0.82, 0.72, 0.42), MATERIALS["GateBrick"])
    return root


def build_railway_station():
    root = root_node("TengxianRailwayStation", "津浦铁路三等站")
    add_box(root, "StationPlatform", (0, 0.20, -0.2), (18.0, 0.40, 6.0), MATERIALS["Stone"])
    add_box(root, "StationBuilding", (0, 2.05, 1.05), (14.5, 3.3, 4.1), MATERIALS["StationBrick"])
    add_box(root, "StationStoneBand", (0, 0.72, 1.05), (14.72, 0.18, 4.28), MATERIALS["Stone"])
    for side in (-1, 1):
        add_box(root, f"StationGableStone_{side}", (side * 6.55, 2.08, 1.05), (0.34, 3.55, 4.32), MATERIALS["Stone"])
        add_box(root, f"StationChimney_{side}", (side * 4.65, 4.2, 1.7), (0.55, 2.6, 0.55), MATERIALS["StationBrick"])
        add_box(root, f"StationChimneyCap_{side}", (side * 4.65, 5.55, 1.7), (0.76, 0.18, 0.76), MATERIALS["Stone"])
    for index, x in enumerate((-4.5, -1.5, 1.5, 4.5)):
        add_box(root, f"StationWindow_{index + 1}", (x, 2.25, -1.08), (1.15, 1.55, 0.12), MATERIALS["WoodDoor"])
        add_box(root, f"StationWindowSill_{index + 1}", (x, 1.38, -1.15), (1.4, 0.14, 0.25), MATERIALS["Stone"])
    add_box(root, "StationDoor", (0, 1.55, -1.12), (1.45, 2.25, 0.15), MATERIALS["WoodDoor"])
    add_gable_roof(root, "StationRoof", 0.0, 1.05, 15.35, 4.95, 3.75, 1.50, MATERIALS["RoofTile"])
    # Wooden platform canopy: lightweight and deliberately smaller than the
    # station proper so it reads as an inferred third-class railway building.
    for x in (-6.1, -3.1, 3.1, 6.1):
        add_cylinder(root, f"StationCanopyPost_{x}", (x, 1.75, -2.25), 0.12, 2.65, MATERIALS["WoodBeam"], 8)
    add_box(root, "StationCanopyBeam", (0, 2.95, -2.25), (14.2, 0.20, 0.22), MATERIALS["WoodBeam"])
    add_box(root, "StationCanopyRoof", (0, 3.18, -2.25), (14.8, 0.18, 2.15), MATERIALS["RoofTile"])
    return root


def build_outfield_defense():
    root = root_node("TengxianOutfieldDefenseKit", "城外防御工事组合")
    add_box(root, "DefenseGround", (0, 0.10, 0), (13.8, 0.20, 10.8), MATERIALS["GroundRubble"])
    add_box(root, "DefenseWestBerm", (-5.05, 0.90, 0), (2.7, 1.6, 10.1), MATERIALS["RammedEarth"])
    add_box(root, "DefenseEastBerm", (5.05, 0.90, 0), (2.7, 1.6, 10.1), MATERIALS["RammedEarth"])
    add_box(root, "DefenseFrontBerm", (0, 0.90, -4.0), (10.1, 1.6, 2.7), MATERIALS["RammedEarth"])
    add_box(root, "DefenseTrenchFloor", (0, 0.18, -0.85), (7.6, 0.18, 5.6), MATERIALS["GroundRubble"])
    for side in (-1, 1):
        for index in range(7):
            add_box(
                root,
                f"DefenseRevetment_{side}_{index}",
                (side * 3.92, 0.78, -2.7 + index * 0.88),
                (0.18, 1.22, 0.64),
                MATERIALS["WoodBeam"],
            )
    for index in range(11):
        x = -4.35 + index * 0.87
        add_sandbag(root, f"DefenseFrontBag_{index}", (x, 1.82, -3.95), (0.52, 0.24, 0.28), 0.0)
        if index % 2 == 0:
            add_sandbag(root, f"DefenseFrontBagUpper_{index}", (x + 0.1, 2.08, -3.8), (0.50, 0.22, 0.27), 0.0)
    for side in (-1, 1):
        for index in range(5):
            add_sandbag(
                root,
                f"DefenseSideBag_{side}_{index}",
                (side * 5.0, 1.75, -1.9 + index * 1.05),
                (0.28, 0.24, 0.52),
                math.pi * 0.5,
            )
    # Simple observation shelter, intentionally no weapon mount.
    for x in (-1.45, 1.45):
        for z in (2.25, 3.85):
            add_cylinder(root, f"DefenseShelterPost_{x}_{z}", (x, 2.2, z), 0.13, 3.1, MATERIALS["WoodBeam"], 8)
    add_box(root, "DefenseShelterRoof", (0, 3.8, 3.05), (3.7, 0.18, 2.2), MATERIALS["RoofTile"])
    add_cylinder(root, "DefenseTelephonePole", (6.1, 2.6, 3.45), 0.16, 5.2, MATERIALS["WoodBeam"], 10)
    for y in (4.15, 4.75):
        add_box(root, f"DefenseTelephoneCrossbar_{y}", (6.1, y, 3.45), (1.7, 0.13, 0.13), MATERIALS["WoodBeam"])
    for x in (5.45, 6.1, 6.75):
        add_sandbag(root, f"DefensePoleInsulator_{x}", (x, 4.84, 3.45), (0.10, 0.10, 0.10), 0.0)
    return root


def triangle_count(root):
    total = 0
    for obj in [root, *root.children_recursive]:
        if obj.type != "MESH":
            continue
        total += sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)
    return total


def world_bounds(root):
    points = []
    for obj in [root, *root.children_recursive]:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            points.append(obj.matrix_world @ Vector(corner))
    if not points:
        return [0.0, 0.0, 0.0]
    minimum = Vector((min(point.x for point in points), min(point.y for point in points), min(point.z for point in points)))
    maximum = Vector((max(point.x for point in points), max(point.y for point in points), max(point.z for point in points)))
    return [round(maximum.x - minimum.x, 3), round(maximum.y - minimum.y, 3), round(maximum.z - minimum.z, 3)]


def main():
    clear_scene()
    make_materials()
    roots = [
        build_shop_facade(),
        build_courtyard_house(),
        build_county_office_gatehouse(),
        build_city_gate_tower(),
        build_railway_station(),
        build_outfield_defense(),
    ]
    bpy.context.view_layer.update()
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(MODEL_PATH),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
        export_yup=True,
    )
    return {
        "blendPath": str(BLEND_PATH),
        "glbPath": str(MODEL_PATH),
        "assets": {
            root.name: {
                "triangles": triangle_count(root),
                "boundsMeters": world_bounds(root),
            }
            for root in roots
        },
    }


BUILD_REPORT = main()
