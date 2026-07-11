"""Build the Taihang 1941 tile-asset kit inside Blender.

Load this file into Blender through the MCP bridge, then call the public stage
functions in order:

    setup_scene()
    build_villages()
    build_fortifications()
    build_props()
    build_showcase()
    finalize_and_export()

The script is intentionally deterministic and uses only modeled geometry plus
solid glTF-compatible PBR materials. Every exported root is validated against a
2,000 evaluated-triangle ceiling.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


SCRIPT_PATH = Path(__file__).resolve()
ASSET_DIR = SCRIPT_PATH.parents[1]
SOURCE_DIR = ASSET_DIR / "source"
MODEL_DIR = ASSET_DIR / "models"
PREVIEW_DIR = ASSET_DIR / "preview"
BLEND_PATH = SOURCE_DIR / "taihang-tile-assets.blend"
PREVIEW_PATH = PREVIEW_DIR / "taihang-tile-assets-preview.png"

MASTER_COLLECTION = "TAIHANG_ASSETS"
SHOWCASE_COLLECTION = "TAIHANG_SHOWCASE"

ASSET_META = {
    "village_neutral": {
        "label": "Neutral village",
        "file": "village-neutral.glb",
        "budget": 1800,
        "position": (-3.25, 1.75, 0.0),
    },
    "village_hq": {
        "label": "Headquarters village",
        "file": "village-headquarters.glb",
        "budget": 1950,
        "position": (-1.62, 1.75, 0.0),
    },
    "pillbox": {
        "label": "Railway pillbox",
        "file": "railway-pillbox.glb",
        "budget": 900,
        "position": (0.0, 1.75, 0.0),
    },
    "pillbox_site": {
        "label": "Pillbox construction",
        "file": "pillbox-construction.glb",
        "budget": 1100,
        "position": (1.38, 1.75, 0.0),
    },
    "county_town": {
        "label": "County stronghold",
        "file": "county-stronghold.glb",
        "budget": 1800,
        "position": (3.05, 1.75, 0.0),
    },
    "bandit_stockade": {
        "label": "Bandit stockade",
        "file": "bandit-stockade.glb",
        "budget": 1700,
        "position": (-2.62, -0.25, 0.0),
    },
    "rail_segment": {
        "label": "Railway module",
        "file": "railway-segment.glb",
        "budget": 900,
        "position": (-1.0, -0.25, 0.0),
    },
    "locomotive": {
        "label": "Steam locomotive",
        "file": "steam-locomotive.glb",
        "budget": 1100,
        "position": (0.55, -0.25, 0.0),
    },
    "mine_cluster": {
        "label": "Mine warning cluster",
        "file": "mine-warning-cluster.glb",
        "budget": 550,
        "position": (2.15, -0.25, 0.0),
    },
}

MAT: dict[str, bpy.types.Material] = {}


def _safe_name(value: str) -> str:
    return "".join(ch if ch.isalnum() else "_" for ch in value).strip("_")


def _move_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def _solid_material(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float = 0.9,
    metallic: float = 0.0,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = color
    material.metallic = metallic
    material.roughness = roughness
    nodes = material.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if emission and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = emission
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return material


def _create_materials() -> None:
    MAT.clear()
    MAT.update(
        {
            "earth": _solid_material("TH_Earth", (0.28, 0.245, 0.19, 1.0), 1.0),
            "path": _solid_material("TH_PackedEarth", (0.37, 0.32, 0.24, 1.0), 1.0),
            "stone": _solid_material("TH_Stone", (0.22, 0.23, 0.215, 1.0), 1.0),
            "stone_light": _solid_material("TH_StoneLight", (0.30, 0.30, 0.275, 1.0), 1.0),
            "stone_dark": _solid_material("TH_StoneDark", (0.095, 0.105, 0.10, 1.0), 1.0),
            "plaster": _solid_material("TH_Plaster", (0.38, 0.33, 0.25, 1.0), 0.98),
            "plaster_dark": _solid_material("TH_PlasterDark", (0.25, 0.23, 0.19, 1.0), 0.98),
            "roof": _solid_material("TH_RoofTile", (0.055, 0.065, 0.065, 1.0), 0.95),
            "roof_light": _solid_material("TH_RoofTileLight", (0.10, 0.115, 0.11, 1.0), 0.95),
            "timber": _solid_material("TH_Timber", (0.18, 0.115, 0.065, 1.0), 0.98),
            "timber_dark": _solid_material("TH_TimberDark", (0.075, 0.050, 0.03, 1.0), 0.98),
            "iron": _solid_material("TH_Iron", (0.085, 0.10, 0.105, 1.0), 0.68, 0.55),
            "concrete": _solid_material("TH_Concrete", (0.21, 0.22, 0.21, 1.0), 1.0),
            "sandbag": _solid_material("TH_Sandbag", (0.25, 0.225, 0.16, 1.0), 1.0),
            "snow": _solid_material("TH_ThinSnow", (0.78, 0.82, 0.82, 1.0), 0.96),
            "red_cloth": _solid_material("TH_RedCloth", (0.39, 0.045, 0.032, 1.0), 0.92),
            "dark_cloth": _solid_material("TH_DarkCloth", (0.095, 0.09, 0.075, 1.0), 0.96),
            "opening": _solid_material("TH_DarkOpening", (0.012, 0.018, 0.018, 1.0), 1.0),
            "glass": _solid_material(
                "TH_WarmWindow",
                (0.65, 0.30, 0.075, 1.0),
                0.72,
                emission=(0.65, 0.18, 0.025, 1.0),
                emission_strength=0.35,
            ),
            "ballast": _solid_material("TH_Ballast", (0.27, 0.285, 0.285, 1.0), 1.0),
            "label": _solid_material("TH_Label", (0.095, 0.105, 0.105, 1.0), 0.9),
            "ground": _solid_material("TH_ShowcaseGround", (0.31, 0.33, 0.32, 1.0), 1.0),
        }
    )


def _material(key: str) -> bpy.types.Material:
    if not MAT:
        for key_name, data_name in {
            "earth": "TH_Earth",
            "path": "TH_PackedEarth",
            "stone": "TH_Stone",
            "stone_light": "TH_StoneLight",
            "stone_dark": "TH_StoneDark",
            "plaster": "TH_Plaster",
            "plaster_dark": "TH_PlasterDark",
            "roof": "TH_RoofTile",
            "roof_light": "TH_RoofTileLight",
            "timber": "TH_Timber",
            "timber_dark": "TH_TimberDark",
            "iron": "TH_Iron",
            "concrete": "TH_Concrete",
            "sandbag": "TH_Sandbag",
            "snow": "TH_ThinSnow",
            "red_cloth": "TH_RedCloth",
            "dark_cloth": "TH_DarkCloth",
            "opening": "TH_DarkOpening",
            "glass": "TH_WarmWindow",
            "ballast": "TH_Ballast",
            "label": "TH_Label",
            "ground": "TH_ShowcaseGround",
        }.items():
            MAT[key_name] = bpy.data.materials[data_name]
    return MAT[key]


def _assign_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    if obj.data and hasattr(obj.data, "materials"):
        obj.data.materials.append(material)


def _parent_local(
    obj: bpy.types.Object,
    parent: bpy.types.Object | None,
    location: tuple[float, float, float],
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse = Matrix.Identity(4)
    obj.location = location
    obj.rotation_euler = rotation
    return obj


def _add_empty(
    collection: bpy.types.Collection,
    name: str,
    parent: bpy.types.Object | None = None,
    location: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.12
    return _parent_local(obj, parent, location, rotation)


def _add_box(
    collection: bpy.types.Collection,
    name: str,
    dimensions: tuple[float, float, float],
    location: tuple[float, float, float],
    material: bpy.types.Material,
    parent: bpy.types.Object | None = None,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 0.0))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _move_to_collection(obj, collection)
    _assign_material(obj, material)
    return _parent_local(obj, parent, location, rotation)


def _add_cylinder(
    collection: bpy.types.Collection,
    name: str,
    radius: float,
    depth: float,
    location: tuple[float, float, float],
    material: bpy.types.Material,
    parent: bpy.types.Object | None = None,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    vertices: int = 8,
    scale_xy: tuple[float, float] = (1.0, 1.0),
    smooth: bool = False,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=(0.0, 0.0, 0.0))
    obj = bpy.context.object
    obj.name = name
    obj.scale.x = scale_xy[0]
    obj.scale.y = scale_xy[1]
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _move_to_collection(obj, collection)
    _assign_material(obj, material)
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return _parent_local(obj, parent, location, rotation)


def _add_cone(
    collection: bpy.types.Collection,
    name: str,
    radius1: float,
    radius2: float,
    depth: float,
    location: tuple[float, float, float],
    material: bpy.types.Material,
    parent: bpy.types.Object | None = None,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    vertices: int = 8,
    smooth: bool = False,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        location=(0.0, 0.0, 0.0),
    )
    obj = bpy.context.object
    obj.name = name
    _move_to_collection(obj, collection)
    _assign_material(obj, material)
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return _parent_local(obj, parent, location, rotation)


def _add_ico(
    collection: bpy.types.Collection,
    name: str,
    dimensions: tuple[float, float, float],
    location: tuple[float, float, float],
    material: bpy.types.Material,
    parent: bpy.types.Object | None = None,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.0, location=(0.0, 0.0, 0.0))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _move_to_collection(obj, collection)
    _assign_material(obj, material)
    return _parent_local(obj, parent, location, rotation)


def _add_mesh(
    collection: bpy.types.Collection,
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    location: tuple[float, float, float],
    material: bpy.types.Material,
    parent: bpy.types.Object | None = None,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    _assign_material(obj, material)
    return _parent_local(obj, parent, location, rotation)


def _add_beam_between(
    collection: bpy.types.Collection,
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius: float,
    material: bpy.types.Material,
    parent: bpy.types.Object,
    vertices: int = 6,
) -> bpy.types.Object:
    start_v = Vector(start)
    end_v = Vector(end)
    direction = end_v - start_v
    obj = _add_cylinder(
        collection,
        name,
        radius,
        direction.length,
        tuple((start_v + end_v) * 0.5),
        material,
        parent=parent,
        vertices=vertices,
    )
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return obj


def _add_roof(
    collection: bpy.types.Collection,
    parent: bpy.types.Object,
    prefix: str,
    width: float,
    depth: float,
    base_z: float,
    rise: float,
    snow: bool = True,
    tile_bands: bool = True,
) -> None:
    x = width * 0.5
    y = depth * 0.5
    verts = [
        (-x, -y, 0.0),
        (x, -y, 0.0),
        (-x, y, 0.0),
        (x, y, 0.0),
        (0.0, -y, rise),
        (0.0, y, rise),
    ]
    faces = [
        (0, 1, 4),
        (3, 2, 5),
        (0, 4, 5, 2),
        (1, 3, 5, 4),
        (0, 2, 3, 1),
    ]
    _add_mesh(collection, f"{prefix}_Roof", verts, faces, (0.0, 0.0, base_z), _material("roof"), parent)
    _add_cylinder(
        collection,
        f"{prefix}_Ridge",
        0.014,
        depth * 1.08,
        (0.0, 0.0, base_z + rise + 0.006),
        _material("roof_light"),
        parent,
        rotation=(math.pi * 0.5, 0.0, 0.0),
        vertices=6,
    )
    slope = math.atan2(rise, x)
    if tile_bands:
        for side in (-1.0, 1.0):
            for fraction in (0.22, 0.43):
                band_x = side * width * fraction
                band_z = base_z + rise * (1.0 - abs(band_x) / x) + 0.006
                _add_box(
                    collection,
                    f"{prefix}_TileBand_{side:+.0f}_{fraction:.2f}",
                    (0.018, depth * 1.035, 0.010),
                    (band_x, 0.0, band_z),
                    _material("roof_light"),
                    parent,
                    rotation=(0.0, side * slope, 0.0),
                )
    if snow:
        for side in (-1.0, 1.0):
            snow_x = side * width * 0.43
            snow_z = base_z + rise * (1.0 - abs(snow_x) / x) + 0.012
            _add_box(
                collection,
                f"{prefix}_SnowEdge_{side:+.0f}",
                (0.055, depth * 1.045, 0.009),
                (snow_x, 0.0, snow_z),
                _material("snow"),
                parent,
                rotation=(0.0, side * slope, 0.0),
            )


def _add_house(
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    prefix: str,
    location_xy: tuple[float, float],
    width: float,
    depth: float,
    wall_height: float,
    rotation_z: float = 0.0,
    main: bool = False,
    darker: bool = False,
) -> bpy.types.Object:
    house = _add_empty(
        collection,
        f"{prefix}_Root",
        root,
        (location_xy[0], location_xy[1], 0.0),
        (0.0, 0.0, rotation_z),
    )
    plaster = _material("plaster_dark" if darker else "plaster")
    _add_box(
        collection,
        f"{prefix}_Foundation",
        (width * 1.04, depth * 1.04, 0.045),
        (0.0, 0.0, 0.0225),
        _material("stone"),
        house,
    )
    _add_box(
        collection,
        f"{prefix}_Walls",
        (width, depth, wall_height),
        (0.0, 0.0, 0.045 + wall_height * 0.5),
        plaster,
        house,
    )
    rise = width * 0.23
    _add_roof(
        collection,
        house,
        prefix,
        width * 1.12,
        depth * 1.12,
        0.045 + wall_height,
        rise,
        snow=True,
        tile_bands=main,
    )
    door_width = width * (0.28 if main else 0.24)
    _add_box(
        collection,
        f"{prefix}_Door",
        (door_width, 0.016, wall_height * 0.53),
        (-width * 0.12 if not main else 0.0, -depth * 0.5 - 0.009, 0.045 + wall_height * 0.265),
        _material("timber_dark"),
        house,
    )
    window_count = 2 if main else 1
    for index in range(window_count):
        window_x = (index * 2 - (window_count - 1)) * width * 0.24
        if not main:
            window_x = width * 0.20
        _add_box(
            collection,
            f"{prefix}_Window_{index}",
            (width * 0.15, 0.012, wall_height * 0.19),
            (window_x, -depth * 0.5 - 0.011, 0.045 + wall_height * 0.60),
            _material("glass"),
            house,
        )
    return house


def _add_flag(
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    prefix: str,
    location: tuple[float, float, float],
    height: float,
    width: float,
    red: bool,
) -> None:
    pole_z = location[2] + height * 0.5
    _add_cylinder(
        collection,
        f"{prefix}_Pole",
        0.011,
        height,
        (location[0], location[1], pole_z),
        _material("iron" if red else "timber"),
        root,
        vertices=6,
    )
    cloth_h = height * 0.26
    verts = [
        (0.0, 0.0, 0.0),
        (width * 0.52, 0.010, cloth_h * 0.04),
        (width, 0.0, cloth_h * 0.13),
        (0.0, 0.0, cloth_h),
        (width * 0.52, -0.010, cloth_h * 0.92),
        (width, 0.0, cloth_h * 0.78),
    ]
    faces = [(0, 1, 4, 3), (1, 2, 5, 4)]
    _add_mesh(
        collection,
        f"{prefix}_Cloth",
        verts,
        faces,
        (location[0], location[1], location[2] + height - cloth_h * 0.95),
        _material("red_cloth" if red else "dark_cloth"),
        root,
    )


def _remove_collection(name: str) -> None:
    collection = bpy.data.collections.get(name)
    if not collection:
        return
    for obj in list(collection.all_objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(collection)


def _new_asset(asset_id: str) -> tuple[bpy.types.Collection, bpy.types.Object]:
    collection_name = f"ASSET_{asset_id.upper()}"
    _remove_collection(collection_name)
    master = bpy.data.collections[MASTER_COLLECTION]
    collection = bpy.data.collections.new(collection_name)
    master.children.link(collection)
    meta = ASSET_META[asset_id]
    root = _add_empty(collection, f"TH_{_safe_name(meta['label'])}_ROOT")
    root.location = meta["position"]
    root["asset_id"] = asset_id
    root["display_name"] = meta["label"]
    root["triangle_budget"] = meta["budget"]
    collection["asset_id"] = asset_id
    return collection, root


def _asset_collection(asset_id: str) -> bpy.types.Collection:
    return bpy.data.collections[f"ASSET_{asset_id.upper()}"]


def _asset_root(asset_id: str) -> bpy.types.Object:
    collection = _asset_collection(asset_id)
    for obj in collection.objects:
        if obj.type == "EMPTY" and obj.get("asset_id") == asset_id:
            return obj
    raise KeyError(f"Missing root for {asset_id}")


def setup_scene() -> None:
    """Clear the default file and establish deterministic project settings."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)

    scene = bpy.context.scene
    scene.name = "Taihang_Tile_Asset_Kit"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene["project"] = "Taihang 1941"
    scene["asset_units"] = "1 Blender unit = 1 render3d.mjs unit"
    scene["max_triangles_per_asset"] = 2000
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass

    master = bpy.data.collections.new(MASTER_COLLECTION)
    scene.collection.children.link(master)
    showcase = bpy.data.collections.new(SHOWCASE_COLLECTION)
    scene.collection.children.link(showcase)
    _create_materials()
    print("TAIHANG_STAGE setup_scene complete")


def _build_village(asset_id: str, headquarters: bool) -> None:
    collection, root = _new_asset(asset_id)
    prefix = "TH_VillageHQ" if headquarters else "TH_VillageNeutral"

    _add_cylinder(
        collection,
        f"{prefix}_CourtyardGround",
        0.56,
        0.026,
        (0.0, 0.0, 0.013),
        _material("earth"),
        root,
        vertices=16,
        scale_xy=(1.0, 0.84),
    )
    _add_box(
        collection,
        f"{prefix}_Lane",
        (0.12, 1.02, 0.012),
        (0.18, -0.02, 0.022),
        _material("path"),
        root,
        rotation=(0.0, 0.0, -0.18),
    )

    walls = [
        ((1.04, 0.055, 0.115), (0.0, 0.45, 0.0575)),
        ((0.055, 0.84, 0.115), (-0.51, 0.0, 0.0575)),
        ((0.055, 0.84, 0.115), (0.51, 0.0, 0.0575)),
        ((0.38, 0.055, 0.115), (-0.33, -0.45, 0.0575)),
        ((0.38, 0.055, 0.115), (0.33, -0.45, 0.0575)),
    ]
    for index, (dims, loc) in enumerate(walls):
        _add_box(collection, f"{prefix}_Wall_{index}", dims, loc, _material("stone"), root)
    _add_box(
        collection,
        f"{prefix}_Gate",
        (0.22, 0.035, 0.14),
        (0.0, -0.455, 0.07),
        _material("timber_dark"),
        root,
    )

    stone_points = [
        (-0.44, 0.46), (-0.30, 0.46), (-0.12, 0.46), (0.06, 0.46), (0.25, 0.46), (0.43, 0.46),
        (-0.52, 0.28), (-0.52, -0.10), (0.52, 0.18), (0.52, -0.24),
    ]
    for index, (x, y) in enumerate(stone_points):
        _add_ico(
            collection,
            f"{prefix}_WallStone_{index}",
            (0.105, 0.07, 0.055),
            (x, y, 0.135 + (index % 2) * 0.006),
            _material("stone_light" if index % 3 == 0 else "stone"),
            root,
            rotation=(0.0, 0.0, (index % 4) * 0.31),
        )

    _add_house(
        collection,
        root,
        f"{prefix}_MainHouse",
        (0.0, 0.28),
        0.54 if headquarters else 0.50,
        0.27,
        0.31 if headquarters else 0.29,
        main=True,
    )
    _add_house(collection, root, f"{prefix}_LeftHouse", (-0.34, 0.00), 0.29, 0.225, 0.235, math.pi * 0.5)
    _add_house(collection, root, f"{prefix}_RightHouse", (0.34, 0.03), 0.28, 0.22, 0.225, -math.pi * 0.5, darker=True)
    _add_house(collection, root, f"{prefix}_FrontHouse", (-0.20, -0.28), 0.31, 0.22, 0.235, math.pi)

    _add_cylinder(
        collection,
        f"{prefix}_Well",
        0.072,
        0.07,
        (0.05, -0.06, 0.055),
        _material("stone_light"),
        root,
        vertices=12,
    )
    _add_cylinder(
        collection,
        f"{prefix}_WellOpening",
        0.050,
        0.008,
        (0.05, -0.06, 0.094),
        _material("opening"),
        root,
        vertices=12,
    )
    _add_cylinder(
        collection,
        f"{prefix}_Millstone",
        0.068,
        0.025,
        (0.25, -0.17, 0.075),
        _material("stone_light"),
        root,
        rotation=(math.pi * 0.5, 0.0, 0.18),
        vertices=12,
    )
    for index in range(4):
        _add_cylinder(
            collection,
            f"{prefix}_Firewood_{index}",
            0.013,
            0.20,
            (-0.39 + index * 0.025, -0.29, 0.055 + index * 0.012),
            _material("timber"),
            root,
            rotation=(0.0, math.pi * 0.5, 0.0),
            vertices=6,
        )
    _add_cylinder(
        collection,
        f"{prefix}_StorageJar",
        0.035,
        0.085,
        (0.38, 0.30, 0.055),
        _material("plaster_dark"),
        root,
        vertices=8,
        scale_xy=(1.0, 0.92),
    )
    if headquarters:
        _add_flag(collection, root, f"{prefix}_Flag", (0.28, -0.14, 0.02), 0.66, 0.25, True)

    print(f"TAIHANG_ASSET built {asset_id}")


def build_villages() -> None:
    _build_village("village_neutral", headquarters=False)
    _build_village("village_hq", headquarters=True)
    print("TAIHANG_STAGE build_villages complete")


def _build_pillbox() -> None:
    collection, root = _new_asset("pillbox")
    prefix = "TH_Pillbox"
    _add_cylinder(
        collection,
        f"{prefix}_Ground",
        0.45,
        0.025,
        (0.0, 0.0, 0.0125),
        _material("earth"),
        root,
        vertices=16,
        scale_xy=(1.0, 0.92),
    )
    _add_cone(
        collection,
        f"{prefix}_Body",
        0.34,
        0.28,
        0.52,
        (0.0, 0.0, 0.285),
        _material("stone_dark"),
        root,
        vertices=8,
    )
    _add_cylinder(
        collection,
        f"{prefix}_ConcreteCap",
        0.305,
        0.075,
        (0.0, 0.0, 0.5825),
        _material("concrete"),
        root,
        vertices=8,
    )
    for index in range(8):
        angle = index * math.tau / 8.0
        _add_box(
            collection,
            f"{prefix}_Parapet_{index}",
            (0.09, 0.065, 0.075),
            (math.sin(angle) * 0.275, -math.cos(angle) * 0.275, 0.657),
            _material("concrete"),
            root,
            rotation=(0.0, 0.0, angle),
        )
    for index in range(4):
        angle = index * math.pi * 0.5
        _add_box(
            collection,
            f"{prefix}_FiringSlit_{index}",
            (0.17, 0.012, 0.052),
            (math.sin(angle) * 0.286, -math.cos(angle) * 0.286, 0.455),
            _material("opening"),
            root,
            rotation=(0.0, 0.0, angle),
        )
    _add_box(
        collection,
        f"{prefix}_Door",
        (0.12, 0.016, 0.19),
        (0.0, -0.337, 0.14),
        _material("timber_dark"),
        root,
    )
    for index in range(8):
        angle = index * math.tau / 8.0 + 0.18
        _add_ico(
            collection,
            f"{prefix}_Sandbag_{index}",
            (0.145, 0.085, 0.055),
            (math.cos(angle) * 0.39, math.sin(angle) * 0.36, 0.055),
            _material("sandbag"),
            root,
            rotation=(0.0, 0.0, angle),
        )
    print("TAIHANG_ASSET built pillbox")


def _build_pillbox_site() -> None:
    collection, root = _new_asset("pillbox_site")
    prefix = "TH_PillboxSite"
    _add_cylinder(
        collection,
        f"{prefix}_Ground",
        0.46,
        0.025,
        (0.0, 0.0, 0.0125),
        _material("earth"),
        root,
        vertices=16,
        scale_xy=(1.0, 0.92),
    )
    _add_cone(
        collection,
        f"{prefix}_HalfShell",
        0.34,
        0.30,
        0.30,
        (0.0, 0.0, 0.175),
        _material("stone"),
        root,
        vertices=8,
    )
    for index in range(4):
        angle = index * math.pi * 0.5
        _add_box(
            collection,
            f"{prefix}_Gap_{index}",
            (0.12, 0.010, 0.045),
            (math.sin(angle) * 0.305, -math.cos(angle) * 0.305, 0.275),
            _material("opening"),
            root,
            rotation=(0.0, 0.0, angle),
        )
    posts = [(-0.35, -0.35), (0.35, -0.35), (-0.35, 0.35), (0.35, 0.35)]
    for index, (x, y) in enumerate(posts):
        _add_cylinder(
            collection,
            f"{prefix}_ScaffoldPost_{index}",
            0.014,
            0.65,
            (x, y, 0.325),
            _material("timber"),
            root,
            vertices=6,
        )
    braces = [
        ((-0.35, -0.35, 0.08), (0.35, -0.35, 0.55)),
        ((0.35, -0.35, 0.08), (-0.35, -0.35, 0.55)),
        ((-0.35, 0.35, 0.08), (0.35, 0.35, 0.55)),
        ((0.35, 0.35, 0.08), (-0.35, 0.35, 0.55)),
        ((-0.35, -0.35, 0.08), (-0.35, 0.35, 0.55)),
        ((0.35, -0.35, 0.08), (0.35, 0.35, 0.55)),
    ]
    for index, (start, end) in enumerate(braces):
        _add_beam_between(collection, f"{prefix}_Brace_{index}", start, end, 0.011, _material("timber"), root)
    for index in range(5):
        _add_box(
            collection,
            f"{prefix}_RampPlank_{index}",
            (0.33, 0.055, 0.025),
            (0.0, -0.47 - index * 0.065, 0.08 - index * 0.012),
            _material("timber"),
            root,
            rotation=(0.12, 0.0, 0.0),
        )
    for index, (x, y) in enumerate([(-0.40, 0.18), (0.38, 0.12), (-0.26, -0.38), (0.28, -0.36), (0.06, 0.39)]):
        _add_ico(
            collection,
            f"{prefix}_Rubble_{index}",
            (0.10, 0.075, 0.065),
            (x, y, 0.045),
            _material("stone_light" if index % 2 else "stone"),
            root,
            rotation=(0.0, 0.0, index * 0.47),
        )
    print("TAIHANG_ASSET built pillbox_site")


def _add_crenellations(
    collection: bpy.types.Collection,
    root: bpy.types.Object,
    prefix: str,
    start: tuple[float, float],
    end: tuple[float, float],
    count: int,
    z: float,
) -> None:
    start_v = Vector((start[0], start[1], 0.0))
    end_v = Vector((end[0], end[1], 0.0))
    for index in range(count):
        t = index / max(1, count - 1)
        point = start_v.lerp(end_v, t)
        _add_box(
            collection,
            f"{prefix}_Crenel_{index}",
            (0.075, 0.075, 0.075),
            (point.x, point.y, z),
            _material("stone_dark"),
            root,
        )


def _build_county_town() -> None:
    collection, root = _new_asset("county_town")
    prefix = "TH_CountyTown"
    _add_box(collection, f"{prefix}_Ground", (1.34, 1.22, 0.025), (0.0, 0.0, 0.0125), _material("earth"), root)
    wall_mat = _material("stone_dark")
    _add_box(collection, f"{prefix}_BackWall", (1.28, 0.12, 0.34), (0.0, 0.55, 0.17), wall_mat, root)
    _add_box(collection, f"{prefix}_LeftWall", (0.12, 1.00, 0.34), (-0.58, 0.0, 0.17), wall_mat, root)
    _add_box(collection, f"{prefix}_RightWall", (0.12, 1.00, 0.34), (0.58, 0.0, 0.17), wall_mat, root)
    _add_box(collection, f"{prefix}_FrontWallL", (0.48, 0.12, 0.34), (-0.38, -0.55, 0.17), wall_mat, root)
    _add_box(collection, f"{prefix}_FrontWallR", (0.48, 0.12, 0.34), (0.38, -0.55, 0.17), wall_mat, root)
    _add_box(collection, f"{prefix}_GateRect", (0.225, 0.016, 0.20), (0.0, -0.617, 0.10), _material("opening"), root)
    _add_cylinder(
        collection,
        f"{prefix}_GateArch",
        0.1125,
        0.014,
        (0.0, -0.619, 0.20),
        _material("opening"),
        root,
        rotation=(math.pi * 0.5, 0.0, 0.0),
        vertices=12,
    )
    _add_crenellations(collection, root, f"{prefix}_Back", (-0.54, 0.55), (0.54, 0.55), 8, 0.405)
    _add_crenellations(collection, root, f"{prefix}_Left", (-0.58, -0.44), (-0.58, 0.44), 7, 0.405)
    _add_crenellations(collection, root, f"{prefix}_Right", (0.58, -0.44), (0.58, 0.44), 7, 0.405)
    _add_crenellations(collection, root, f"{prefix}_FrontL", (-0.56, -0.55), (-0.16, -0.55), 4, 0.405)
    _add_crenellations(collection, root, f"{prefix}_FrontR", (0.16, -0.55), (0.56, -0.55), 4, 0.405)

    for index, (x, y) in enumerate([(-0.58, -0.53), (0.58, -0.53), (-0.58, 0.53), (0.58, 0.53)]):
        _add_box(
            collection,
            f"{prefix}_CornerTower_{index}",
            (0.20, 0.20, 0.50),
            (x, y, 0.25),
            _material("stone"),
            root,
        )
        _add_cone(
            collection,
            f"{prefix}_CornerRoof_{index}",
            0.17,
            0.0,
            0.14,
            (x, y, 0.57),
            _material("roof"),
            root,
            rotation=(0.0, 0.0, math.pi * 0.25),
            vertices=4,
        )
        for slit_index, (sx, sy, rot) in enumerate([(0.0, -0.105, 0.0), (0.105, 0.0, math.pi * 0.5)]):
            _add_box(
                collection,
                f"{prefix}_TowerSlit_{index}_{slit_index}",
                (0.07, 0.008, 0.035),
                (x + sx, y + sy, 0.36),
                _material("opening"),
                root,
                rotation=(0.0, 0.0, rot),
            )
    _add_house(collection, root, f"{prefix}_Gatehouse", (0.0, -0.05), 0.47, 0.32, 0.32, 0.0, main=True, darker=True)
    _add_box(collection, f"{prefix}_SupplyShed", (0.22, 0.19, 0.18), (-0.30, 0.28, 0.09), _material("plaster_dark"), root)
    _add_roof(collection, root, f"{prefix}_SupplyShed", 0.25, 0.22, 0.18, 0.06, snow=True, tile_bands=False)
    print("TAIHANG_ASSET built county_town")


def build_fortifications() -> None:
    _build_pillbox()
    _build_pillbox_site()
    _build_county_town()
    print("TAIHANG_STAGE build_fortifications complete")


def _build_bandit_stockade() -> None:
    collection, root = _new_asset("bandit_stockade")
    prefix = "TH_BanditStockade"
    _add_cylinder(
        collection,
        f"{prefix}_Ground",
        0.50,
        0.025,
        (0.0, 0.0, 0.0125),
        _material("earth"),
        root,
        vertices=16,
        scale_xy=(1.0, 0.90),
    )
    stake_index = 0
    for index in range(28):
        angle = index * math.tau / 28.0
        x = math.cos(angle) * 0.46
        y = math.sin(angle) * 0.42
        if y < -0.34 and abs(x) < 0.14:
            continue
        height = 0.31 + (index % 3) * 0.015
        _add_cylinder(
            collection,
            f"{prefix}_Stake_{stake_index}",
            0.022,
            height - 0.07,
            (x, y, (height - 0.07) * 0.5),
            _material("timber"),
            root,
            vertices=6,
        )
        _add_cone(
            collection,
            f"{prefix}_StakeTip_{stake_index}",
            0.025,
            0.0,
            0.08,
            (x, y, height - 0.03),
            _material("timber"),
            root,
            vertices=6,
        )
        stake_index += 1
    _add_box(collection, f"{prefix}_Gate", (0.24, 0.035, 0.23), (0.0, -0.43, 0.115), _material("timber_dark"), root)
    for x in (-0.13, 0.13):
        _add_cylinder(collection, f"{prefix}_GatePost_{x:+.2f}", 0.028, 0.38, (x, -0.43, 0.19), _material("timber"), root, vertices=6)
    _add_house(collection, root, f"{prefix}_Hut", (0.02, 0.16), 0.36, 0.28, 0.26, 0.03, main=False, darker=True)
    for index, (x, y) in enumerate([(-0.24, 0.05), (-0.21, -0.02), (0.23, 0.00)]):
        _add_box(collection, f"{prefix}_Crate_{index}", (0.11, 0.10, 0.09), (x, y, 0.045), _material("timber"), root, rotation=(0.0, 0.0, index * 0.21))
    for index in range(4):
        _add_cylinder(
            collection,
            f"{prefix}_Logs_{index}",
            0.014,
            0.20,
            (0.25, 0.22 + index * 0.026, 0.045 + index * 0.011),
            _material("timber"),
            root,
            rotation=(0.0, math.pi * 0.5, 0.0),
            vertices=6,
        )
    _add_flag(collection, root, f"{prefix}_Pennant", (0.25, 0.24, 0.02), 0.58, 0.21, False)
    print("TAIHANG_ASSET built bandit_stockade")


def _build_rail_segment() -> None:
    collection, root = _new_asset("rail_segment")
    prefix = "TH_RailSegment"
    _add_box(collection, f"{prefix}_Ballast", (0.76, 1.78, 0.055), (0.0, 0.0, 0.0275), _material("ballast"), root)
    for index in range(7):
        _add_box(
            collection,
            f"{prefix}_Sleeper_{index}",
            (0.72, 0.085, 0.045),
            (0.0, -0.72 + index * 0.24, 0.075),
            _material("timber_dark"),
            root,
        )
    for x in (-0.23, 0.23):
        _add_box(collection, f"{prefix}_Rail_{x:+.2f}", (0.042, 1.80, 0.065), (x, 0.0, 0.125), _material("iron"), root)
    _add_cylinder(collection, f"{prefix}_TelegraphPole", 0.022, 0.72, (0.33, -0.24, 0.41), _material("timber"), root, vertices=6)
    _add_box(collection, f"{prefix}_Crossbar", (0.31, 0.035, 0.035), (0.33, -0.24, 0.70), _material("timber"), root)
    for x in (0.21, 0.45):
        _add_cylinder(collection, f"{prefix}_Insulator_{x:.2f}", 0.022, 0.045, (x, -0.24, 0.745), _material("stone_light"), root, vertices=8)
    print("TAIHANG_ASSET built rail_segment")


def _build_locomotive() -> None:
    collection, root = _new_asset("locomotive")
    prefix = "TH_Locomotive"
    _add_box(collection, f"{prefix}_Chassis", (0.34, 0.64, 0.055), (0.0, 0.0, 0.13), _material("iron"), root)
    _add_cylinder(
        collection,
        f"{prefix}_Boiler",
        0.115,
        0.38,
        (0.0, -0.07, 0.28),
        _material("stone_dark"),
        root,
        rotation=(math.pi * 0.5, 0.0, 0.0),
        vertices=12,
        smooth=True,
    )
    _add_cylinder(
        collection,
        f"{prefix}_BoilerFront",
        0.12,
        0.035,
        (0.0, -0.275, 0.28),
        _material("iron"),
        root,
        rotation=(math.pi * 0.5, 0.0, 0.0),
        vertices=12,
    )
    _add_box(collection, f"{prefix}_Cab", (0.30, 0.23, 0.30), (0.0, 0.22, 0.29), _material("stone_dark"), root)
    _add_box(collection, f"{prefix}_CabRoof", (0.34, 0.27, 0.045), (0.0, 0.22, 0.465), _material("roof"), root)
    for side in (-1.0, 1.0):
        _add_box(collection, f"{prefix}_CabWindow_{side:+.0f}", (0.075, 0.012, 0.09), (side * 0.085, 0.10, 0.345), _material("opening"), root)
    _add_cone(collection, f"{prefix}_SmokestackBase", 0.055, 0.035, 0.12, (0.0, -0.15, 0.44), _material("iron"), root, vertices=10)
    _add_cylinder(collection, f"{prefix}_SmokestackLip", 0.06, 0.035, (0.0, -0.15, 0.515), _material("iron"), root, vertices=10)
    _add_cylinder(collection, f"{prefix}_SteamDome", 0.045, 0.085, (0.0, 0.005, 0.43), _material("iron"), root, vertices=10)
    for x in (-0.18, 0.18):
        for y in (-0.15, 0.14):
            _add_cylinder(
                collection,
                f"{prefix}_Wheel_{x:+.2f}_{y:+.2f}",
                0.075,
                0.045,
                (x, y, 0.115),
                _material("iron"),
                root,
                rotation=(0.0, math.pi * 0.5, 0.0),
                vertices=10,
                smooth=True,
            )
    _add_cylinder(
        collection,
        f"{prefix}_Headlamp",
        0.035,
        0.025,
        (0.0, -0.315, 0.31),
        _material("glass"),
        root,
        rotation=(math.pi * 0.5, 0.0, 0.0),
        vertices=10,
    )
    print("TAIHANG_ASSET built locomotive")


def _build_mine_cluster() -> None:
    collection, root = _new_asset("mine_cluster")
    prefix = "TH_MineCluster"
    _add_cylinder(
        collection,
        f"{prefix}_Ground",
        0.44,
        0.022,
        (0.0, 0.0, 0.011),
        _material("earth"),
        root,
        vertices=16,
        scale_xy=(1.0, 0.82),
    )
    for index, (x, y) in enumerate([(-0.16, -0.08), (0.13, -0.16), (0.08, 0.16)]):
        _add_cylinder(collection, f"{prefix}_Mine_{index}", 0.072, 0.035, (x, y, 0.038), _material("iron"), root, vertices=12)
        _add_cylinder(collection, f"{prefix}_MineCap_{index}", 0.022, 0.020, (x, y, 0.066), _material("stone_dark"), root, vertices=8)
    _add_cylinder(collection, f"{prefix}_WarningStake", 0.017, 0.47, (-0.20, 0.17, 0.245), _material("timber"), root, vertices=6)
    verts = [
        (0.0, 0.0, 0.0), (0.11, 0.008, 0.01), (0.21, 0.0, 0.03),
        (0.0, 0.0, 0.12), (0.11, -0.008, 0.105), (0.21, 0.0, 0.08),
    ]
    _add_mesh(collection, f"{prefix}_WarningRag", verts, [(0, 1, 4, 3), (1, 2, 5, 4)], (-0.20, 0.17, 0.39), _material("red_cloth"), root)
    for index, (x, y) in enumerate([(-0.34, -0.20), (0.30, 0.22), (0.31, -0.05), (-0.02, 0.31)]):
        _add_ico(
            collection,
            f"{prefix}_Stone_{index}",
            (0.09, 0.07, 0.055),
            (x, y, 0.04),
            _material("stone_light" if index % 2 else "stone"),
            root,
            rotation=(0.0, 0.0, index * 0.36),
        )
    print("TAIHANG_ASSET built mine_cluster")


def build_props() -> None:
    _build_bandit_stockade()
    _build_rail_segment()
    _build_locomotive()
    _build_mine_cluster()
    print("TAIHANG_STAGE build_props complete")


def _look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def _add_label(
    collection: bpy.types.Collection,
    text: str,
    location: tuple[float, float, float],
    size: float = 0.14,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(f"Label_{_safe_name(text)}", type="FONT")
    curve.body = text
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = size
    curve.extrude = 0.002
    curve.bevel_depth = 0.001
    obj = bpy.data.objects.new(f"Label_{_safe_name(text)}", curve)
    collection.objects.link(obj)
    obj.location = location
    _assign_material(obj, _material("label"))
    return obj


def build_showcase() -> None:
    _remove_collection(SHOWCASE_COLLECTION)
    showcase = bpy.data.collections.new(SHOWCASE_COLLECTION)
    bpy.context.scene.collection.children.link(showcase)
    _add_box(showcase, "TH_ShowcaseGround", (8.2, 4.5, 0.035), (0.0, 0.70, -0.035), _material("ground"))
    for asset_id, meta in ASSET_META.items():
        x, y, _ = meta["position"]
        label_y = y - (0.72 if y > 0.0 else 0.67)
        _add_label(showcase, meta["label"], (x, label_y, 0.012), 0.115 if len(meta["label"]) > 18 else 0.13)

    bpy.ops.object.camera_add(location=(6.6, -8.4, 7.4))
    camera = bpy.context.object
    camera.name = "TH_ShowcaseCamera"
    _move_to_collection(camera, showcase)
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 8.4
    _look_at(camera, (0.0, 0.65, 0.12))
    bpy.context.scene.camera = camera

    bpy.ops.object.light_add(type="AREA", location=(-1.6, -2.5, 8.0))
    key = bpy.context.object
    key.name = "TH_KeyArea"
    _move_to_collection(key, showcase)
    key.data.energy = 520.0
    key.data.shape = "DISK"
    key.data.size = 6.5
    _look_at(key, (0.0, 0.7, 0.0))

    bpy.ops.object.light_add(type="AREA", location=(5.0, 3.5, 4.5))
    fill = bpy.context.object
    fill.name = "TH_FillArea"
    _move_to_collection(fill, showcase)
    fill.data.energy = 220.0
    fill.data.size = 5.0
    _look_at(fill, (0.0, 0.8, 0.2))

    bpy.ops.object.light_add(type="SUN", location=(-4.0, -4.0, 7.0))
    sun = bpy.context.object
    sun.name = "TH_WinterSun"
    _move_to_collection(sun, showcase)
    sun.data.energy = 0.85
    sun.rotation_euler = (math.radians(28), math.radians(-24), math.radians(-32))

    world = bpy.context.scene.world or bpy.data.worlds.new("TH_WinterWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = (0.32, 0.36, 0.39, 1.0)
        background.inputs["Strength"].default_value = 0.28
    print("TAIHANG_STAGE build_showcase complete")


def _evaluated_triangles(collection: bpy.types.Collection) -> int:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    total = 0
    for obj in collection.all_objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        total += sum(max(0, len(polygon.vertices) - 2) for polygon in mesh.polygons)
        evaluated.to_mesh_clear()
    return total


def _collection_dimensions(collection: bpy.types.Collection) -> tuple[float, float, float]:
    minimum = Vector((float("inf"), float("inf"), float("inf")))
    maximum = Vector((float("-inf"), float("-inf"), float("-inf")))
    found = False
    for obj in collection.all_objects:
        if obj.type != "MESH":
            continue
        found = True
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            minimum.x = min(minimum.x, point.x)
            minimum.y = min(minimum.y, point.y)
            minimum.z = min(minimum.z, point.z)
            maximum.x = max(maximum.x, point.x)
            maximum.y = max(maximum.y, point.y)
            maximum.z = max(maximum.z, point.z)
    if not found:
        return (0.0, 0.0, 0.0)
    extent = maximum - minimum
    return (round(extent.x, 4), round(extent.y, 4), round(extent.z, 4))


def _select_objects(objects: list[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]


def _export_selected(filepath: Path) -> None:
    filepath.parent.mkdir(parents=True, exist_ok=True)
    kwargs = {
        "filepath": str(filepath),
        "export_format": "GLB",
        "use_selection": True,
        "export_apply": True,
        "export_materials": "EXPORT",
        "export_yup": True,
    }
    try:
        bpy.ops.export_scene.gltf(**kwargs)
    except TypeError:
        kwargs.pop("export_yup", None)
        bpy.ops.export_scene.gltf(**kwargs)


def _export_asset(asset_id: str, filepath: Path) -> None:
    collection = _asset_collection(asset_id)
    root = _asset_root(asset_id)
    saved_location = root.location.copy()
    root.location = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()
    objects = list(collection.all_objects)
    _select_objects(objects)
    _export_selected(filepath)
    root.location = saved_location
    bpy.context.view_layer.update()


def _render_preview() -> None:
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.filepath = str(PREVIEW_PATH)
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)


def finalize_and_export() -> dict:
    """Validate, save, export each root, and render the catalog preview."""
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    bpy.context.view_layer.update()

    report: dict[str, object] = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_blend": str(BLEND_PATH.relative_to(ASSET_DIR)),
        "triangle_limit": 2000,
        "assets": {},
    }
    for asset_id, meta in ASSET_META.items():
        collection = _asset_collection(asset_id)
        triangles = _evaluated_triangles(collection)
        dimensions = _collection_dimensions(collection)
        if triangles > 2000:
            raise RuntimeError(f"{asset_id} exceeds 2000 triangles: {triangles}")
        if triangles > meta["budget"]:
            raise RuntimeError(f"{asset_id} exceeds target budget {meta['budget']}: {triangles}")
        output_path = MODEL_DIR / meta["file"]
        _export_asset(asset_id, output_path)
        report["assets"][asset_id] = {
            "label": meta["label"],
            "triangles": triangles,
            "target_budget": meta["budget"],
            "dimensions": dimensions,
            "glb": output_path.name,
            "under_2000": True,
        }
        print(f"TAIHANG_POLYCOUNT {asset_id} {triangles}")

    all_asset_objects: list[bpy.types.Object] = []
    for asset_id in ASSET_META:
        all_asset_objects.extend(list(_asset_collection(asset_id).all_objects))
    _select_objects(all_asset_objects)
    _export_selected(MODEL_DIR / "taihang-tile-assets-catalog.glb")
    report["all_under_2000"] = True
    report["catalog_glb"] = "taihang-tile-assets-catalog.glb"
    report["preview"] = str(PREVIEW_PATH.relative_to(ASSET_DIR))

    with (MODEL_DIR / "polycounts.json").open("w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)

    _render_preview()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(f"TAIHANG_EXPORT complete {json.dumps(report, ensure_ascii=False)}")
    return report


def build_all() -> dict:
    setup_scene()
    build_villages()
    build_fortifications()
    build_props()
    build_showcase()
    return finalize_and_export()
