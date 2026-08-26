# -*- coding: utf-8 -*-
"""Render a neutral three-quarter preview of a generated character Blend file."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def ParseArgs() -> argparse.Namespace:
    separator = sys.argv.index("--") + 1 if "--" in sys.argv else len(sys.argv)
    parser = argparse.ArgumentParser(description="Render a character QA preview")
    parser.add_argument("--output", required=True)
    parser.add_argument("--object", default="Model_SichuanInfantryLow1938")
    parser.add_argument("--workbench", action="store_true", help="Render solid geometry without materials")
    return parser.parse_args(sys.argv[separator:])


def PointAt(target: bpy.types.Object, point: Vector) -> None:
    target.rotation_euler = (point - target.location).to_track_quat("-Z", "Y").to_euler()


def AddArea(name: str, location: tuple[float, float, float], energy: float,
            size: float, color: tuple[float, float, float], lookAt: Vector) -> None:
    lightData = bpy.data.lights.new(name=name, type="AREA")
    lightData.energy = energy
    lightData.shape = "DISK"
    lightData.size = size
    lightData.color = color
    light = bpy.data.objects.new(name, lightData)
    bpy.context.collection.objects.link(light)
    light.location = location
    PointAt(light, lookAt)


def Main() -> None:
    args = ParseArgs()
    outputPath = Path(args.output).resolve()
    outputPath.parent.mkdir(parents=True, exist_ok=True)
    character = bpy.data.objects.get(args.object)
    if character is None:
        raise SystemExit(f"Character object not found: {args.object}")
    character.hide_render = False
    character.hide_set(False)

    targetPoint = Vector((0.0, 0.0, 0.88))
    cameraData = bpy.data.cameras.new("Camera_CharacterPreview")
    cameraData.lens = 62
    camera = bpy.data.objects.new("Camera_CharacterPreview", cameraData)
    bpy.context.collection.objects.link(camera)
    camera.location = (2.45, -4.0, 1.7)
    PointAt(camera, targetPoint)
    bpy.context.scene.camera = camera

    AddArea("Light_Key", (2.8, -3.0, 4.0), 1050, 3.0, (1.0, 0.82, 0.68), targetPoint)
    AddArea("Light_Fill", (-2.6, -1.5, 2.5), 700, 3.5, (0.72, 0.83, 1.0), targetPoint)
    AddArea("Light_Rim", (0.8, 2.6, 3.3), 900, 2.5, (1.0, 0.92, 0.78), targetPoint)

    world = bpy.context.scene.world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.035, 0.045, 0.06, 1.0)
    background.inputs["Strength"].default_value = 0.35

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH" if args.workbench else "BLENDER_EEVEE"
    if args.workbench:
        scene.display.shading.light = "STUDIO"
        scene.display.shading.color_type = "SINGLE"
        scene.display.shading.single_color = (0.52, 0.57, 0.62)
        scene.display.shading.show_shadows = True
        scene.display.shading.show_cavity = True
        scene.display.shading.cavity_type = "WORLD"
    scene.render.resolution_x = 768
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(outputPath)
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"
    bpy.ops.render.render(write_still=True)
    print(f"PREVIEW={outputPath}")


if __name__ == "__main__":
    Main()
