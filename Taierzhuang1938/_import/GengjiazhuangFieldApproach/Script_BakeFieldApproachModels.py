"""Bake the original project assets with Blender.

Run through Script_BlenderMcp.mjs. The source .blend and optional review
renders are independent outputs, kept outside Git. Embedded base and normal
maps come from the same deterministic materials as the editable source.
"""

import argparse
import json
from pathlib import Path
import sys
import tempfile

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from Script_FieldApproachFoliage import DryGrass, FieldElm, OldElm, WheatTuft
from Script_FieldApproachMesh import Materials, Mesh
from Script_FieldApproachProps import LoadedCart, PackDonkey, SoilClod, SplitRailFence, StrawRick, TileFarmhouse


ASSETS = (OldElm, LoadedCart, TileFarmhouse, StrawRick, SplitRailFence, FieldElm,
          WheatTuft, DryGrass, SoilClod, PackDonkey)
FRONT = (0, -1, 0)
SIDE = (1, 0, 0)
BACK = (0, 1, 0)
TOP = (0, 0, 1)
VIEWS = {
    "LoadedCart": ((-1, 0, 0), BACK, FRONT),
    "PackDonkey": ((-1, 0, 0), BACK, FRONT),
    "StrawRick": (FRONT, SIDE, TOP),
    "SplitRailFence": (FRONT, SIDE, TOP),
    "WheatTuft": (FRONT, SIDE, TOP),
    "DryGrass": (FRONT, SIDE, TOP),
    "SoilClod": (FRONT, SIDE, TOP),
}


def Bounds(objects):
    points = [obj.matrix_world @ Vector(point) for obj in objects for point in obj.bound_box]
    lo = Vector([min(p[a] for p in points) for a in range(3)])
    hi = Vector([max(p[a] for p in points) for a in range(3)])
    return lo, hi


def Studio(scene, lo, hi):
    center = (lo + hi)*.5
    size = hi - lo
    scale = max(size)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 10
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 426
    scene.render.resolution_y = 350
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    scene.render.film_transparent = True
    world = bpy.data.worlds.new(scene.name + " Neutral Studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (.69,.73,.81,1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = .48
    scene.world = world
    studio = bpy.data.collections.new("Orthographic Review")
    scene.collection.children.link(studio)
    for label, location, energy in [
        ("Soft Key", (-.8,-1.05,1.66), 43), ("Soft Fill", (.89,.78,1.01), 22),
        ("Rear Softbox", (-.67,.91,.61), 12),
    ]:
        data = bpy.data.lights.new(label, type="AREA")
        data.energy = energy * scale**2
        data.shape = "DISK"
        data.size = scale*.83
        light = bpy.data.objects.new(label, data)
        studio.objects.link(light)
        light.location = center + Vector(location)*scale
        light.rotation_euler = (center-light.location).to_track_quat("-Z","Y").to_euler()
    aspect = scene.render.resolution_x / scene.render.resolution_y
    ortho_scale = max(size.x,size.y,size.z*aspect)*1.12
    cameras = []
    for index, direction in enumerate(VIEWS.get(scene.name, (FRONT,SIDE,BACK)), 1):
        data = bpy.data.cameras.new(f"Orthographic {index}")
        data.type = "ORTHO"
        data.ortho_scale = ortho_scale
        data.clip_start = .0001
        data.clip_end = scale*16
        camera = bpy.data.objects.new(data.name, data)
        studio.objects.link(camera)
        camera.location = center+Vector(direction)*scale*3
        if direction != TOP:
            camera.rotation_euler = (center-camera.location).to_track_quat("-Z","Y").to_euler()
        cameras.append(camera)
    scene.camera = cameras[0]
    return cameras


def Bake(source=None, review=None, names=None):
    here = Path(__file__).resolve()
    project = here.parents[2]
    output = project / "Model" / "GengjiazhuangFieldApproach"
    output.mkdir(parents=True, exist_ok=True)
    if source:
        source = Path(source).resolve()
        source.parent.mkdir(parents=True, exist_ok=True)
    if review:
        review = Path(review)
        review.mkdir(parents=True, exist_ok=True)

    if bpy.data.filepath:
        raise RuntimeError("Start a fresh task Blender before rebuilding.")
    working = bpy.context.scene
    working.name = "Export Workspace"
    for obj in list(working.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    scenes, stats = [], {}
    with tempfile.TemporaryDirectory(prefix="FieldApproachMaps") as scratch:
        materials = Materials(Path(scratch))
        for builder in ASSETS:
            name = builder.__name__
            if names and name not in names:
                continue
            scene = bpy.data.scenes.new(name)
            scene.unit_settings.system = "METRIC"
            collection = bpy.data.collections.new(name + " Mesh")
            working.collection.children.link(collection)
            mesh = Mesh()
            builder(mesh, materials)
            objects = mesh.Emit(collection)
            bpy.context.view_layer.update()
            lo, hi = Bounds(objects)
            for obj in objects:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = objects[0]
            target = output / f"Model_{name}.glb"
            bpy.ops.export_scene.gltf(filepath=str(target), export_format="GLB",
                                      use_selection=True, use_active_scene=True, export_animations=False)
            working.collection.children.unlink(collection)
            scene.collection.children.link(collection)
            size = hi-lo
            stats[name] = {"size": [round(size[i], 4) for i in (0,2,1)],
                           "center": [round((lo[i]+hi[i])/2,4) for i in (0,2,1)],
                           "baseY": round(lo.z,4),
                           "triangles": sum(len(face.vertices)-2 for obj in objects for face in obj.data.polygons)}
            cameras = Studio(scene, lo, hi)
            scenes.append((scene, cameras))
        if scenes and source:
            if bpy.context.window:
                bpy.context.window.scene = scenes[0][0]
            bpy.context.preferences.filepaths.save_version = 0
            bpy.ops.wm.save_as_mainfile(filepath=str(source))
        print("FIELD_APPROACH_MODELS", json.dumps(stats, sort_keys=True))
        if review:
            RenderReview(scenes, review)
    return stats


def RenderReview(scenes, output):
    for scene, cameras in scenes:
        for i, camera in enumerate(cameras, 1):
            scene.camera = camera
            scene.render.filepath = str(output / f"View_{scene.name}_{i}.png")
            bpy.ops.render.render(write_still=True, scene=scene.name)
        scene.camera = cameras[0]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path)
    parser.add_argument("--review", type=Path)
    parser.add_argument("--only", nargs="+")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    Bake(args.source, args.review, args.only)
