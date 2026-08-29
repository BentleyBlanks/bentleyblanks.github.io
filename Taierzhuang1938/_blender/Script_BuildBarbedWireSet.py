"""Build the two recognizable, game-ready barbed-wire obstacles.

The Sketchfab battlefield pack's two source nodes are only 80-triangle plain
helices: no barbs, clips, or stakes.  They are useful as distant placeholder
coils but read as polygonal springs in the component-library close-up.  This
project-authored replacement keeps the old asset ids and roughly the same
3.2 m footprint while giving each variant an explicit battlefield silhouette.

Run with Blender:
  blender --background --python Script_BuildBarbedWireSet.py
"""

from __future__ import annotations

import math
import os

import bpy
from mathutils import Vector


OUTPUT_PATH = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "Model", "Model_BarbedWireSet.glb"))
STEEL_COLOR = (0.20, 0.22, 0.23, 1.0)


class MeshBuilder:
    def __init__(self):
        self.vertices = []
        self.faces = []

    def AddTube(self, points, radius, sides=6, cap=True):
        """Append a low-poly round tube following a deterministic polyline."""
        points = [Vector(point) for point in points]
        if len(points) < 2:
            return
        ring_start = len(self.vertices)
        previous_side = None
        for index, point in enumerate(points):
            if index == 0:
                tangent = (points[1] - point).normalized()
            elif index == len(points) - 1:
                tangent = (point - points[index - 1]).normalized()
            else:
                tangent = (points[index + 1] - points[index - 1]).normalized()
            reference = Vector((0.0, 0.0, 1.0))
            if abs(tangent.dot(reference)) > 0.92:
                reference = Vector((0.0, 1.0, 0.0))
            side = tangent.cross(reference).normalized()
            if previous_side is not None and side.dot(previous_side) < 0:
                side.negate()
            up = side.cross(tangent).normalized()
            previous_side = side
            for segment in range(sides):
                angle = math.tau * segment / sides
                offset = side * (math.cos(angle) * radius) + up * (math.sin(angle) * radius)
                self.vertices.append(tuple(point + offset))

        for ring in range(len(points) - 1):
            first = ring_start + ring * sides
            second = first + sides
            for segment in range(sides):
                following = (segment + 1) % sides
                self.faces.append((
                    first + segment, second + segment,
                    second + following, first + following,
                ))
        if cap:
            start_center = len(self.vertices)
            self.vertices.append(tuple(points[0]))
            end_center = len(self.vertices)
            self.vertices.append(tuple(points[-1]))
            for segment in range(sides):
                following = (segment + 1) % sides
                self.faces.append((start_center, ring_start + following, ring_start + segment))
                last = ring_start + (len(points) - 1) * sides
                self.faces.append((end_center, last + segment, last + following))

    def AddBarb(self, point, tangent, length=0.13, radius=0.010):
        """Add the opposed four-point barb that makes the wire readable up close."""
        point = Vector(point)
        tangent = Vector(tangent).normalized()
        reference = Vector((0.0, 0.0, 1.0))
        if abs(tangent.dot(reference)) > 0.9:
            reference = Vector((0.0, 1.0, 0.0))
        side = tangent.cross(reference).normalized()
        up = side.cross(tangent).normalized()
        for direction in (side + up, side - up, -side + up, -side - up):
            direction.normalize()
            base = point + direction * 0.012 - tangent * 0.025
            tip = point + direction * length + tangent * 0.035
            self.AddTube((base, tip), radius, sides=5)

    def CreateObject(self, name, material):
        minimum_z = min(vertex[2] for vertex in self.vertices)
        grounded_vertices = [(x, y, z - minimum_z) for x, y, z in self.vertices]
        mesh = bpy.data.meshes.new(name + "Mesh")
        mesh.from_pydata(grounded_vertices, [], self.faces)
        mesh.materials.append(material)
        mesh.update()
        for polygon in mesh.polygons:
            polygon.use_smooth = True
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


def CreateMaterial():
    material = bpy.data.materials.new("Steel")
    material.diffuse_color = STEEL_COLOR
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = STEEL_COLOR
    metallic = shader.inputs.get("Metallic") or shader.inputs.get("Metallic IOR Level")
    if metallic:
        metallic.default_value = 0.55
    shader.inputs["Roughness"].default_value = 0.72
    return material


def BuildConcertina(material):
    builder = MeshBuilder()
    turns = 6.0
    samples = 109
    radius = 0.50
    points = []
    for index in range(samples):
        progress = index / (samples - 1)
        angle = progress * turns * math.tau
        points.append((
            -1.60 + 3.20 * progress,
            math.sin(angle) * radius,
            radius + math.cos(angle) * radius,
        ))
    builder.AddTube(points, 0.018, sides=6)

    # Long clips keep the roll visibly tied together instead of reading as a
    # loose spring.  They sit just inside the coil envelope.
    for angle in (math.radians(82), math.radians(202), math.radians(322)):
        y = math.sin(angle) * radius * 0.92
        z = radius + math.cos(angle) * radius * 0.92
        builder.AddTube(((-1.60, y, z), (1.60, y, z)), 0.013, sides=5)

    for index in range(5, samples - 4, 9):
        tangent = Vector(points[index + 1]) - Vector(points[index - 1])
        builder.AddBarb(points[index], tangent)
    return builder.CreateObject("BattlefieldBarbedWire01", material)


def SaggingStrand(x, z, sag, samples=25):
    points = []
    for index in range(samples):
        progress = index / (samples - 1)
        points.append((
            -1.60 + 3.20 * progress,
            0.0,
            z - math.sin(progress * math.pi) * sag,
        ))
    return points


def BuildStakeFence(material):
    builder = MeshBuilder()
    for x, lean in ((-1.55, -0.05), (0.0, 0.035), (1.55, -0.025)):
        builder.AddTube(((x, 0.0, 0.0), (x + lean, 0.0, 1.28)), 0.035, sides=7)
        # A short diagonal foot makes the slim post legible against dirt.
        builder.AddTube(((x, 0.0, 0.05), (x - 0.24, 0.0, 0.34)), 0.025, sides=6)

    for strand_index, height in enumerate((0.38, 0.72, 1.06)):
        points = SaggingStrand(0.0, height, 0.055 + strand_index * 0.012)
        builder.AddTube(points, 0.014, sides=6)
        for index in range(3 + strand_index, len(points) - 2, 4):
            tangent = Vector(points[index + 1]) - Vector(points[index - 1])
            builder.AddBarb(points[index], tangent, length=0.115, radius=0.009)
    return builder.CreateObject("BattlefieldBarbedWire02", material)


def Build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    material = CreateMaterial()
    objects = [BuildConcertina(material), BuildStakeFence(material)]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT_PATH,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
        export_yup=True,
    )
    print({
        "output": OUTPUT_PATH,
        "bytes": os.path.getsize(OUTPUT_PATH),
        "triangles": {obj.name: len(obj.data.loop_triangles) for obj in objects},
    })


Build()
