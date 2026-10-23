"""Editable Type 88-II reconnaissance reconstruction, not the light bomber.

Run with the repository's Script_BlenderMcp.mjs entry point. Coordinates in this
recipe are metres, X right, Y up, Z aft. P() maps them to Blender Z-up; the glTF
exporter's Y-up conversion restores that same authoring coordinate system.
Shape approval is deliberately separate from surfacing and export validation.
"""
from pathlib import Path
import argparse
import contextlib
import io
import json
import math
import os
import sys
import bpy
from mathutils import Vector, Matrix, Quaternion


VERSION = "20261023HollowExhaust09"
PI = math.pi
TAU = 2 * PI
SOURCE_DEFAULT = Path(r"C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\KawasakiType88")


def P(p):
    return Vector((p[0], -p[2], p[1]))


def Lerp(a, b, t):
    return a * (1 - t) + b * t


def Smooth(t):
    return t * t * (3 - 2 * t)


def Mat(name, color, metallic=0, roughness=.55, alpha=1):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, alpha)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (*color, alpha)
    node.inputs["Metallic"].default_value = metallic
    node.inputs["Roughness"].default_value = roughness
    node.inputs["Alpha"].default_value = alpha
    return mat


class Builder:
    def __init__(self, repoRoot, sourceRoot, stage="shape", detail="high"):
        self.repoRoot = Path(repoRoot)
        self.sourceRoot = Path(sourceRoot)
        self.stage = stage
        self.detail = detail
        self.high = detail == "high"
        self.modelDir = self.repoRoot / "Taierzhuang1938/Model/KawasakiType88"
        self.reviewDir = self.repoRoot / "tmp/KawasakiType88"
        self.meshes = []
        self.controls = {}
        self.parts = {}
        self.materials = {}
        self.activeParent = None

    def Empty(self, name, position=(0, 0, 0), parent=None):
        ob = bpy.data.objects.new(name, None)
        self.modelColl.objects.link(ob)
        ob.location = P(position)
        if parent:
            ob.parent = parent
            ob.matrix_parent_inverse = parent.matrix_world.inverted()
        ob.empty_display_size = .16
        bpy.context.view_layer.update()
        return ob

    def Hinge(self, name, position, tilt):
        axis = self.Empty(name + "Axis", position, self.root)
        axis.rotation_euler.y = -tilt
        bpy.context.view_layer.update()
        pivot = self.Empty(name + "Pivot")
        pivot.parent = axis
        pivot.matrix_parent_inverse = Matrix.Identity(4)
        pivot.location = (0, 0, 0)
        pivot["axisLocal"] = "+X; parent aligns with the wing dihedral"
        pivot["hingeTiltRadians"] = tilt
        bpy.context.view_layer.update()
        return pivot

    def Mesh(self, name, verts, faces, material="Fabric", smooth=True, uvs=None, parent=None):
        mesh = bpy.data.meshes.new(name + "Mesh")
        mesh.from_pydata([P(v) for v in verts], [], faces)
        mesh.update()
        ob = bpy.data.objects.new(name, mesh)
        self.modelColl.objects.link(ob)
        if material:
            mesh.materials.append(self.materials[material])
        for face in mesh.polygons:
            face.use_smooth = smooth
        if uvs:
            uvLayer = mesh.uv_layers.new(name="UvSurface")
            for face in mesh.polygons:
                for loop in face.loop_indices:
                    uvLayer.data[loop].uv = uvs[mesh.loops[loop].vertex_index]
        # Mesh coordinates are initially in the root frame; preserve their world
        # position when assigning a movable hinge as their local parent.
        parent = parent or self.activeParent or self.root
        if parent:
            ob.parent = parent
            ob.matrix_parent_inverse = parent.matrix_world.inverted()
        self.meshes.append(ob)
        self.parts[name] = ob
        return ob

    def Beam(self, name, a, b, radius, material="Steel", sides=12, oval=1, parent=None):
        a, b = Vector(a), Vector(b)
        axis = (b - a).normalized()
        ref = Vector((0, 1, 0)) if abs(axis.y) < .95 else Vector((1, 0, 0))
        u = axis.cross(ref).normalized()
        v = axis.cross(u).normalized()
        verts, faces, uvs = [], [], []
        for k, center in enumerate((a, b)):
            for j in range(sides):
                t = TAU * j / sides
                verts.append(tuple(center + radius * (u * math.cos(t) + oval * v * math.sin(t))))
                uvs.append((j / sides, k))
        for j in range(sides):
            faces.append((j, (j + 1) % sides, (j + 1) % sides + sides, j + sides))
        faces.extend((tuple(range(sides - 1, -1, -1)), tuple(range(sides, 2 * sides))))
        ob = self.Mesh(name, verts, faces, material, uvs=uvs, parent=parent)
        ob["uvExtentM"] = (TAU * radius, (b - a).length)
        return ob

    def Tube(self, name, points, radius, material="Steel", sides=8, closed=False, parent=None, innerRadius=None):
        points = [Vector(p) for p in points]
        if closed and (points[0] - points[-1]).length < 1e-7:
            points.pop()
        verts, faces, uvs = [], [], []
        tangents = []
        for i, point in enumerate(points):
            tangent = points[(i + 1) % len(points)] - points[i - 1 if i else (-1 if closed else 0)]
            if i == len(points) - 1 and not closed:
                tangent = points[-1] - points[-2]
            tangent.normalize()
            tangents.append(tangent)
        ref = Vector((0, 1, 0)) if abs(tangents[0].y) < .9 else Vector((1, 0, 0))
        frames = [tangents[0].cross(ref).normalized()]
        for i in range(1, len(points)):
            transported = tangents[i - 1].rotation_difference(tangents[i]) @ frames[-1]
            frames.append((transported - tangents[i] * transported.dot(tangents[i])).normalized())
        if closed:
            closure = tangents[-1].rotation_difference(tangents[0]) @ frames[-1]
            error = math.atan2(tangents[0].dot(closure.cross(frames[0])), closure.dot(frames[0]))
            frames = [Quaternion(tangents[i], error * i / len(points)) @ frame for i, frame in enumerate(frames)]
        arc = [0.]
        for a, b in zip(points, points[1:]):
            arc.append(arc[-1] + (b - a).length)
        layerSize = len(points) * sides
        for layer, r in enumerate((radius,) if innerRadius is None else (radius, innerRadius)):
            for i, point in enumerate(points):
                u = frames[i]
                v = tangents[i].cross(u).normalized()
                for j in range(sides):
                    t = TAU * j / sides
                    verts.append(tuple(point + r * (u * math.cos(t) + v * math.sin(t))))
                    uvs.append((j / sides, arc[i] / max(arc[-1], 1e-6)))
            for i in range(len(points) if closed else len(points) - 1):
                n = (i + 1) % len(points)
                for j in range(sides):
                    face = (layer * layerSize + i * sides + j, layer * layerSize + i * sides + (j + 1) % sides,
                            layer * layerSize + n * sides + (j + 1) % sides, layer * layerSize + n * sides + j)
                    faces.append(face if layer == 0 else tuple(reversed(face)))
        if innerRadius is not None and not closed:
            for i in (0, len(points) - 1):
                for j in range(sides):
                    a, b = i * sides + j, i * sides + (j + 1) % sides
                    faces.append((a, b, b + layerSize, a + layerSize))
        ob = self.Mesh(name, verts, faces, material, uvs=uvs, parent=parent)
        ob["uvExtentM"] = (TAU * radius, sum((b - a).length for a, b in zip(points, points[1:])))
        return ob

    def Box(self, name, center, size, material="Steel", bevel=0, parent=None):
        x, y, z = center
        w, h, d = (s / 2 for s in size)
        verts = [(x + i * w, y + j * h, z + k * d) for i, j, k in
                 [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
                  (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]]
        ob = self.Mesh(name, verts, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                                    (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)],
                       material, smooth=False, parent=parent)
        if bevel:
            mod = ob.modifiers.new("ManufacturedEdgeRadius", "BEVEL")
            mod.width = bevel
            mod.segments = 3 if self.high else 2
            self.Apply(ob, mod)
            for poly in ob.data.polygons:
                poly.use_smooth = True
        return ob

    def Ellipsoid(self, name, center, radii, material="Steel", segments=32, rings=16, parent=None):
        verts, faces, uvs = [], [], []
        for i in range(rings + 1):
            lat = PI * (i + .0001) / (rings + .0002)
            for j in range(segments + 1):
                lon = TAU * j / segments
                verts.append((center[0] + radii[0] * math.sin(lat) * math.cos(lon),
                              center[1] + radii[1] * math.cos(lat),
                              center[2] + radii[2] * math.sin(lat) * math.sin(lon)))
                uvs.append((j / segments, i / rings))
        for i in range(rings):
            for j in range(segments):
                a = i * (segments + 1) + j
                faces.append((a, a + 1, a + segments + 2, a + segments + 1))
        return self.Mesh(name, verts, faces, material, uvs=uvs, parent=parent)

    def Apply(self, ob, modifier):
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=modifier.name)

    def Setup(self):
        if bpy.data.filepath and "KawasakiType88" not in bpy.data.filepath.replace("\\", "/"):
            raise RuntimeError("Refusing to clear an unrelated Blender file: " + bpy.data.filepath)
        if bpy.context.scene.get("BlenderMcpTask") not in (None, "KawasakiType88"):
            raise RuntimeError("This BlenderMCP process belongs to another task")
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete(use_global=False)
        for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
            for block in list(datablocks):
                if block.users == 0:
                    datablocks.remove(block)
        for coll in list(bpy.data.collections):
            if coll.name not in ("Collection",):
                bpy.data.collections.remove(coll)
        scene = bpy.context.scene
        scene["BlenderMcpTask"] = "KawasakiType88"
        scene["ReconstructionStatus"] = "Shape iteration; not approved" if self.stage == "shape" else "PBR and movement review pending"
        scene.unit_settings.system = "METRIC"
        scene.unit_settings.scale_length = 1
        self.modelColl = bpy.data.collections.new("KawasakiType88EditableAirframe")
        scene.collection.children.link(self.modelColl)
        self.stageColl = bpy.data.collections.new("LocalAcceptanceStage")
        scene.collection.children.link(self.stageColl)
        self.root = None
        self.root = self.Empty("KawasakiType88Root")
        self.root["noseAxis"] = "-Z after glTF Y-up export"
        self.root["variant"] = "Type 88-II reconnaissance; museum reference scheme 12"
        self.root["metresPerUnit"] = 1.0
        self.root["referenceMatchApproved"] = False
        gray = (.42, .42, .42)
        palette = {
            "Fabric": ((.57, .59, .56), .12, .63),
            "Aluminum": ((.47, .50, .51), .72, .37),
            "Steel": ((.13, .15, .15), .78, .48),
            "Exhaust": ((.13, .105, .085), .6, .77),
            "Rubber": ((.024, .028, .029), 0, .84),
            "Leather": ((.075, .039, .022), 0, .6),
            "Wood": ((.18, .055, .027), 0, .35),
            "Cockpit": ((.11, .14, .12), .25, .62),
            "Red": ((.34, .018, .02), 0, .64),
            "Ink": ((.016, .018, .018), 0, .67),
            "Glass": ((.55, .65, .67), 0, .15),
            "Ivory": ((.75, .74, .66), .05, .54),
            "Fuselage": ((.57, .59, .56), .09, .65),
            "FuselageMetal": ((.47, .50, .51), .72, .37),
            "UpperWing": ((.57, .59, .56), .09, .65),
            "LowerUnderside": ((.57, .59, .56), .09, .65),
            "Tail": ((.57, .59, .56), .09, .65),
            "Fin": ((.57, .59, .56), .09, .65),
        }
        for key, (color, metal, rough) in palette.items():
            self.materials[key] = Mat("Material_Type88" + key, gray if self.stage == "shape" else color,
                                      .0 if self.stage == "shape" else metal, .68 if self.stage == "shape" else rough)
        if self.stage != "shape":
            glass = self.materials["Glass"].node_tree.nodes.get("Principled BSDF")
            glass.inputs["Transmission Weight"].default_value = .74
            glass.inputs["IOR"].default_value = 1.46

    # z, half-width, centre height, upper radius, lower radius. The aft fuselage
    # has flat facets; it is not modelled as a modern round tube.
    sections = [
        (-5.88, .29, 1.97, .28, .28), (-5.66, .43, 1.99, .40, .37),
        (-5.30, .52, 1.99, .45, .42), (-4.60, .57, 1.99, .46, .44),
        (-3.65, .58, 1.99, .44, .44), (-2.80, .57, 1.99, .43, .46),
        (-1.65, .53, 1.99, .42, .44), (-.38, .49, 1.97, .39, .42),
        (.55, .445, 1.94, .36, .39), (1.70, .37, 1.90, .31, .34),
        (3.20, .26, 1.85, .24, .26), (4.55, .145, 1.81, .16, .17),
        (5.60, .075, 1.80, .10, .11), (5.71, .065, 1.80, .09, .10),
    ]

    def Section(self, z):
        for a, b in zip(self.sections, self.sections[1:]):
            if a[0] <= z <= b[0]:
                t = (z - a[0]) / (b[0] - a[0])
                w, cy, up, low = (Lerp(a[i], b[i], t) for i in range(1, 5))
                strength = min(1, max(0, (z + 4.60) / .95)) * min(1, max(0, (5.60 - z) / 3.90))
                return w * (1 + .40 * strength), cy - .15 * strength, up + .15 * strength, low + .25 * strength
        return tuple((self.sections[0] if z < self.sections[0][0] else self.sections[-1])[1:])

    def Top(self, x, z):
        w, cy, up, low = self.Section(z)
        q = min(.9999, abs(x) / w)
        if z >= -3.65:
            return cy + up * (1 - .02 * q / .85 if q <= .85 else .98 - .18 * (q - .85) / .15)
        return cy + up * (1 - q ** 3.25) ** (1 / 3.25)

    def RectangularSection(self, t, up, low):
        """Flat fabric side panels on the rectangular steel-tube fuselage."""
        knots = [(0, 0, 1), (.125, .85, .98), (.25, 1, .80), (.75, .77, -.80),
                 (.875, .60, -.98), (1, 0, -1), (1.125, -.60, -.98), (1.25, -.77, -.80),
                 (1.75, -1, .80), (1.875, -.85, .98), (2, 0, 1)]
        q = t / PI
        if .25 <= q <= .75:
            f = (q - .25) / .50
            return Lerp(1, .77, f), Lerp(.8 * up, -.8 * low, f)
        if 1.25 <= q <= 1.75:
            f = (q - 1.25) / .50
            return -Lerp(.77, 1, f), Lerp(-.8 * low, .8 * up, f)
        for a, b in zip(knots, knots[1:]):
            if a[0] <= q <= b[0]:
                f = (q - a[0]) / (b[0] - a[0])
                yy = Lerp(a[2], b[2], f)
                return Lerp(a[1], b[1], f), yy * (up if yy >= 0 else low)
        return 0, up

    def Fuselage(self):
        zs = []
        for a, b in zip(self.sections, self.sections[1:]):
            steps = max(2, math.ceil((b[0] - a[0]) / (.16 if self.high else .32)))
            zs.extend(Lerp(a[0], b[0], j / steps) for j in range(steps))
        zs.append(self.sections[-1][0])
        verts, faces, uvs = [], [], []
        n = 48 if self.high else 32
        for z in zs:
            w, cy, up, low = self.Section(z)
            exponent = .615 if z < -.5 else .78
            for j in range(n + 1):
                t = TAU * j / n
                s, c = math.sin(t), math.cos(t)
                x = math.copysign(abs(s) ** exponent, s) * w
                y = cy + math.copysign(abs(c) ** exponent, c) * (up if c >= 0 else low)
                if z >= -3.65:
                    xx, yy = self.RectangularSection(t, up, low)
                    x, y = xx * w, cy + yy
                verts.append((x, y, z))
                uvs.append(((z + 5.88) / 11.9, j / n))
        for i in range(len(zs) - 1):
            for j in range(n):
                a = i * (n + 1) + j
                faces.append((a, a + n + 1, a + n + 2, a + 1))
        faces.extend((tuple(range(n, -1, -1)), tuple((len(zs) - 1) * (n + 1) + j for j in range(n + 1))))
        body = self.Mesh("AirframeFacetedFuselage", verts, faces, "Fuselage", uvs=uvs)
        body.data.materials.append(self.materials["FuselageMetal"])
        for poly in body.data.polygons:
            if sum(-body.data.vertices[i].co.y for i in poly.vertices) / len(poly.vertices) < -3.65:
                poly.material_index = 1
        # Actual holes, cut through the upper shell, not black painted ovals.
        for label, z, rx, rz in (("Pilot", -1.32, .425, .51), ("Observer", -.143, .395, .445)):
            cutter = self.Ellipsoid("Tool" + label + "Opening", (0, 2.60, z), (rx, 1.02, rz), None, 64, 32)
            mod = body.modifiers.new(label + "OpenCockpit", "BOOLEAN")
            mod.operation = "DIFFERENCE"
            mod.solver = "EXACT"
            mod.object = cutter
            self.Apply(body, mod)
            self.meshes.remove(cutter)
            bpy.data.objects.remove(cutter, do_unlink=True)
            rim = []
            for j in range(96):
                t = TAU * j / 96
                x, zz = rx * math.cos(t), z + rz * math.sin(t)
                rim.append((x, self.Top(x, zz) + .007, zz))
            self.Tube(label + "PaddedLeatherCoaming", rim, .034, "Leather", 10, True)
            linerVerts, linerFaces = [], []
            for level in range(2):
                for j in range(64):
                    t = TAU * j / 64
                    x, zz = (rx - .025) * math.cos(t), z + (rz - .025) * math.sin(t)
                    linerVerts.append((x, self.Top(x, zz) - .025 - level * .55, zz))
            for j in range(64):
                linerFaces.append((j, (j + 1) % 64, (j + 1) % 64 + 64, j + 64))
            linerFaces.append(tuple(range(64, 128)))
            self.Mesh(label + "InteriorTub", linerVerts, linerFaces, "Cockpit")
            self.Box(label + "SeatPan", (0, 1.82, z + .04), (.48, .07, .40), "Leather", .035)
            back = self.Box(label + "SeatBack", (0, 2.02, z + .29), (.48, .42, .075), "Leather", .045)
            self.Beam(label + "ControlColumn", (0, 1.78, z - .08), (0, 2.09, z - .16), .024, "Steel")
            self.Tube(label + "ControlGrip", [(-.10, 2.09, z - .16), (0, 2.14, z - .16), (.10, 2.09, z - .16)], .023, "Rubber")
            self.Box(label + "InstrumentPanel", (0, 2.12, z - .40), (.63, .30, .045), "Cockpit", .02)
            for j, x in enumerate((-.20, -.07, .075, .21)):
                self.Beam(label + "GaugeBezel" + str(j), (x, 2.15, z - .368), (x, 2.15, z - .35), .054 if j in (1, 2) else .038, "Steel", 24)
                self.Beam(label + "GaugeFace" + str(j), (x, 2.15, z - .347), (x, 2.15, z - .344), .046 if j in (1, 2) else .030, "Ink", 24)
                self.Beam(label + "GaugeNeedle" + str(j), (x, 2.15, z - .341), (x + .019, 2.18, z - .341), .0025, "Ivory", 6)
            for side in (-1, 1):
                self.Box(label + "LapBelt" + str(side), (side * .13, 1.87, z + .06), (.075, .014, .31), "Ivory", .004)
            self.Box(label + "BeltBuckle", (0, 1.89, z + .02), (.085, .016, .052), "Steel", .006)
        # Differently shaped aluminium engine panels, with real seams and latches.
        for end in (-5.60, -4.66, -3.69):
            pts = []
            w, cy, up, low = self.Section(end)
            count = 64 if self.high else 48
            for j in range(count):
                t = TAU * j / count
                s, c = math.sin(t), math.cos(t)
                if end < -3.65:
                    x = math.copysign(abs(s) ** .615, s) * (w + .0015)
                    y = cy + math.copysign(abs(c) ** .615, c) * (up if c >= 0 else low) * 1.003
                else:
                    xx, yy = self.RectangularSection(t, up, low)
                    x, y = xx * (w + .0015), cy + yy * 1.003
                pts.append((x, y, end))
            self.Tube("CowlingPanelSeam" + str(end), pts, .0045, "Steel", 6, True)
        for j in range(3):
            z = -5.15 + j * .50
            cutter = self.Box("ToolCowlingVent" + str(j), (0, 1.68, z), (1.6, .145, .34), None, .025)
            mod = body.modifiers.new("ActualCowlingVentOpening" + str(j), "BOOLEAN")
            mod.operation = "DIFFERENCE"
            mod.solver = "EXACT"
            mod.object = cutter
            self.Apply(body, mod)
            self.meshes.remove(cutter)
            bpy.data.objects.remove(cutter, do_unlink=True)
        for side in (-1, 1):
            for z in (-5.10, -4.30, -3.78):
                self.Box("CowlingQuarterTurnFastener" + str(side) + str(z), (side * .568, 1.92, z), (.011, .038, .061), "Steel", .006)
            # These are separate metal louvres backed by a recessed dark cavity.
            for j in range(3):
                z = -5.15 + j * .50
                x = side * (.52 if j == 0 else .57)
                self.Box("EngineVentRecess" + str(side) + str(j), (side * .39, 1.68, z), (.012, .13, .32), "Ink", .025)
                self.Beam("EngineVentLip" + str(side) + str(j), (x + side * .012, 1.77, z - .17), (x + side * .012, 1.77, z + .17), .013, "Aluminum", 8)
            for j in range(6):
                z = -5.39 + j * .235
                w, cy, up, low = self.Section(z)
                mountY = cy + .22
                mountX = w * (1 - min(.999, .22 / up) ** (2 / .615)) ** (.615 / 2)
                a = Vector((side * (mountX - .015), mountY, z))
                b = Vector((side * (mountX + .115), mountY, z + .012))
                c = Vector((side * (mountX + .125), cy + .12, z + .05))
                d = Vector((side * (mountX + .125), cy + .025, z + .06))
                steps = 11 if self.high else 4
                points = [tuple((1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t*t*c + t**3*d) for t in (k/steps for k in range(steps + 1))]
                self.Tube("ExhaustStack" + str(side) + str(j), points, .035, "Exhaust", 20 if self.high else 12, innerRadius=.032)
                axis = (b-a).normalized()
                self.Beam("ExhaustInnerShadow" + str(side) + str(j), tuple(a - axis * .006), tuple(a - axis * .003), .0315, "Ink", 16 if self.high else 12)
        # Type II rounded suspended radiator, not the Type I frontal box.
        self.Ellipsoid("TypeIIBellyRadiatorFairing", (0, 1.34, -4.79), (.34, .24, .70), "Aluminum", 40, 20)
        self.Box("RadiatorCore", (0, 1.31, -5.33), (.47, .25, .07), "Steel", .025)
        for j in range(22):
            x = -.22 + j * .44 / 21
            self.Beam("RadiatorVerticalFin" + str(j), (x, 1.20, -5.374), (x, 1.43, -5.374), .003, "Exhaust", 4)
        self.Beam("RadiatorPipeForward", (-.17, 1.49, -5.12), (-.17, 1.70, -5.12), .034, "Steel")
        self.Beam("RadiatorPipeAft", (.17, 1.48, -4.34), (.17, 1.70, -4.34), .034, "Steel")
        # Rear longeron seams remain finer than the padded cockpit edges.
        for side in (-1, 1):
            for fraction in (-.60, .60):
                pts = []
                for j in range(51):
                    z = -.5 + 6.15 * j / 50
                    w, cy, up, low = self.Section(z)
                    xFraction = .77 + .23 * (fraction + .8) / 1.6
                    pts.append((side * (w * xFraction + .002), cy + fraction * (up if fraction > 0 else low), z))
                self.Tube("AftLongeronSeam" + str(side) + str(fraction), pts, .0035, "Fabric", 6)
        # Small curved windscreen, independent from the padded rim.
        verts, faces = [], []
        for level in (0, 1):
            for j in range(17):
                t = -PI / 2 + PI * j / 16
                verts.append((.35 * math.sin(t), 2.39 + level * .23, -1.69 - .16 * math.cos(t)))
        for j in range(16):
            faces.append((j, j + 1, j + 18, j + 17))
        self.Mesh("PilotCurvedWindscreen", verts, faces, "Glass")
        for side in (-1, 1):
            self.Beam("WindscreenSideFrame" + str(side), (side * .35, 2.39, -1.69), (side * .35, 2.62, -1.69), .009, "Aluminum")
        self.Tube("WindscreenTopFrame", [(v[0], v[1], v[2]) for v in verts[17:]], .009, "Aluminum", 6)

    def WingPoint(self, x, u, upper=True, top=True):
        halfSpan = 7.5 if upper else 6.62
        chord = 1.88 if upper else 1.72
        lead = -3.833 if upper else -3.37
        tipStart = halfSpan - .50
        factor = 1.0
        if abs(x) > tipStart:
            t = min(.99999, (abs(x) - tipStart) / (halfSpan - tipStart))
            factor = math.sqrt(1 - t * t)
        # Elliptic tip cap, constant chord centre. The central trailing cut-out
        # is present only in the top wing.
        localLead = lead + chord * (1 - factor) / 2
        localChord = chord * factor
        if upper and abs(x) < .80:
            cut = .43 * max(0, 1 - (abs(x) / .80) ** 2) ** .6
            localChord -= cut
        z = localLead + localChord * u
        y = (3.106 if upper else 1.32) + .018 * abs(x)
        thickness = .115 if upper else .11
        yt = 5 * thickness * localChord * (0.2969 * math.sqrt(max(u, .000001)) - .1260 * u - .3516 * u * u + .2843 * u ** 3 - .1036 * u ** 4)
        camber = .024 * localChord * math.sin(PI * u)
        rib = math.exp(-((abs(x) / .275 - round(abs(x) / .275)) / .18) ** 2)
        sag = .0065 * factor * (rib - .5) * math.sin(PI * u) ** .8
        y += camber + (yt * (1 if top else -1)) + sag * (1 if top else -.35)
        return (x, y, z)

    def WingPatch(self, name, x0, x1, u0, u1, upper, parent=None):
        step = .275 / (8 if self.high else 4)
        low, high = min(x0, x1), max(x0, x1)
        xs = [x0, x1] + [i * step for i in range(math.ceil(low / step), math.floor(high / step) + 1) if low + 1e-7 < i * step < high - 1e-7]
        xs = sorted(set(xs), reverse=x1 < x0)
        nx = len(xs) - 1
        nu = max(4, int((u1 - u0) * (44 if self.high else 20)))
        if name.startswith("Aileron"):
            nu = max(nu, 24 if self.high else 12)
        verts, uvs, faces = [], [], []
        stride = nu + 1
        layerSize = (nx + 1) * stride
        for layer in (0, 1):
            for i in range(nx + 1):
                x = xs[i]
                for j in range(nu + 1):
                    u = Lerp(u0, u1, (1 - math.cos(PI * j / nu)) / 2)
                    point = self.WingPoint(x, u, upper, layer == 0)
                    if name.startswith("Aileron") and parent:
                        center = parent.matrix_world.translation
                        axisY = center.z + .018 * (abs(x) - 2.35)
                        axisZ = -center.y
                        radius = .070 if upper else .065
                        dz = point[2] - axisZ
                        if dz < 0:
                            yy = math.sqrt(max(0, radius * radius - dz * dz))
                            point = (point[0], axisY + (1 if layer == 0 else -1) * yy, point[2])
                        elif dz < .06:
                            roundY = axisY + (1 if layer == 0 else -1) * radius
                            point = (point[0], Lerp(roundY, point[1], Smooth(dz / .06)), point[2])
                    verts.append(point)
                    uvs.append(((x + 7.5) / 15, u if layer == 0 else 1 - u))
        for layer in (0, 1):
            for i in range(nx):
                for j in range(nu):
                    a = layer * layerSize + i * stride + j
                    face = (a, a + stride, a + stride + 1, a + 1)
                    faces.append(face if layer == 0 else tuple(reversed(face)))
        for i in range(nx):
            a, b = i * stride, (i + 1) * stride
            faces.extend(((a, a + layerSize, b + layerSize, b),
                          (a + nu, b + nu, b + nu + layerSize, a + nu + layerSize)))
        for i in (0, nx):
            for j in range(nu):
                a = i * stride + j
                faces.append((a, a + 1, a + 1 + layerSize, a + layerSize))
        ob = self.Mesh(name, verts, faces, "UpperWing" if upper else "Fabric", uvs=uvs, parent=parent)
        ob.data.materials.append(self.materials["Fabric" if upper else "LowerUnderside"])
        topFaceCount = nx * nu
        for poly in ob.data.polygons:
            if topFaceCount <= poly.index < 2 * topFaceCount:
                poly.material_index = 1
        return ob

    def Wings(self):
        self.WingPatch("UpperWingCentreWithPilotCutout", -.80, .80, 0, 1, True)
        for side, suffix in ((-1, "Left"), (1, "Right")):
            self.WingPatch("UpperWingInner" + suffix, side * .80, side * 2.35, 0, 1, True)
            self.WingPatch("UpperWingOuter" + suffix, side * 2.35, side * 7.00, 0, .735, True)
            self.WingPatch("UpperWingFixedTip" + suffix, side * 7.00, side * 7.50, 0, 1, True)
            hingeZ = -3.833 + 1.88 * .739 + .070
            hingeY = sum(self.WingPoint(side * 2.35, .735, True, top)[1] for top in (True, False)) / 2
            tilt = math.atan(side * .018)
            pivot = self.Hinge("Aileron" + suffix, (side * 2.35, hingeY, hingeZ), tilt)
            pivot["rangeDegrees"] = [-22.0, 18.0]
            self.controls["Aileron" + suffix] = pivot
            # A 7 mm chord gap permits a real hinge, with no overlapping skins.
            self.WingPatch("Aileron" + suffix, side * 2.36, side * 6.99, .739, 1, True, pivot)
            for j in range(6):
                x = side * (2.55 + j * .79)
                y = hingeY + side * .018 * (x - side * 2.35)
                self.Beam("AileronHinge" + suffix + str(j), (x - .024, y - side * .018 * .024, hingeZ),
                          (x + .024, y + side * .018 * .024, hingeZ), .012, "Steel", 12)
            self.WingPatch("LowerWingInner" + suffix, side * .48, side * 2.35, 0, 1, False)
            self.WingPatch("LowerWingOuter" + suffix, side * 2.35, side * 6.12, 0, .735, False)
            self.WingPatch("LowerWingFixedTip" + suffix, side * 6.12, side * 6.62, 0, 1, False)
            lowerHingeZ = -3.37 + 1.72 * .739 + .065
            lowerHingeY = sum(self.WingPoint(side * 2.35, .735, False, top)[1] for top in (True, False)) / 2
            lowerPivot = self.Hinge("AileronLower" + suffix, (side * 2.35, lowerHingeY, lowerHingeZ), tilt)
            lowerPivot["rangeDegrees"] = [-22., 18.]
            lowerPivot["coupledTo"] = pivot.name
            self.controls["AileronLower" + suffix] = lowerPivot
            self.WingPatch("AileronLower" + suffix, side * 2.36, side * 6.11, .739, 1, False, lowerPivot)
            for j in range(5):
                x = side * (2.55 + j * .79)
                y = lowerHingeY + side * .018 * (x - side * 2.35)
                self.Beam("LowerAileronHinge" + suffix + str(j), (x - .024, y - side * .018 * .024, lowerHingeZ),
                          (x + .024, y + side * .018 * .024, lowerHingeZ), .012, "Steel", 12)
            # Equal horn offsets make the external pushrod translate at constant
            # length while the upper and lower ailerons rotate through one angle.
            hornX = side * 3.30
            upperAxisPoint = (hornX, hingeY + .018 * .95, hingeZ)
            lowerAxisPoint = (hornX, lowerHingeY + .018 * .95, lowerHingeZ)
            upperHorn = (hornX - math.sin(tilt) * .11, upperAxisPoint[1] + math.cos(tilt) * .11, hingeZ + .10)
            lowerHorn = (hornX - math.sin(tilt) * .11, lowerAxisPoint[1] + math.cos(tilt) * .11, lowerHingeZ + .10)
            self.Beam("UpperAileronLinkHorn" + suffix, upperAxisPoint, upperHorn, .014, "Steel", 10, parent=pivot)
            self.Beam("LowerAileronLinkHorn" + suffix, lowerAxisPoint, lowerHorn, .014, "Steel", 10, parent=lowerPivot)
            rod = self.Beam("AileronExternalPushrod" + suffix, lowerHorn, upperHorn, .011, "Steel", 10)
            rod["coupledTo"] = pivot.name
            rod["retainedMovingNode"] = True
            rod["hornOffsetM"] = (.11, .10)
            rod["hingeTiltRadians"] = tilt
            deltaY = "(.11*(cos(a)-1)-.10*sin(a))"
            for axis, expression in ((0, f"{-math.sin(tilt)}*{deltaY}"), (1, "-(.11*sin(a)+.10*(cos(a)-1))"), (2, f"{math.cos(tilt)}*{deltaY}")):
                curve = rod.driver_add("location", axis)
                variable = curve.driver.variables.new()
                variable.name = "a"
                variable.type = "SINGLE_PROP"
                variable.targets[0].id = pivot
                variable.targets[0].data_path = "rotation_euler[0]"
                curve.driver.expression = expression
            curve = lowerPivot.driver_add("rotation_euler", 0)
            variable = curve.driver.variables.new()
            variable.name = "a"
            variable.type = "SINGLE_PROP"
            variable.targets[0].id = pivot
            variable.targets[0].data_path = "rotation_euler[0]"
            curve.driver.expression = "a"
            # Broad single outer I-strut and a long diagonal. No light-bomber
            # four-strut W-shaped centre section is added.
            a, b = (side * 4.13, 1.39, -2.65), (side * 4.42, 3.18, -3.113)
            self.Beam("InterplaneIBeam" + suffix, a, b, .07, "Aluminum", 12, 2.1)
            self.Beam("LongDiagonalStrut" + suffix, (side * .55, 1.51, -2.38), b, .035, "Aluminum", 12)
            self.Beam("CabaneForward" + suffix, (side * .52, 2.32, -3.67), (side * .77, 3.09, -3.593), .031, "Aluminum")
            self.Beam("CabaneAft" + suffix, (side * .50, 2.34, -2.12), (side * .77, 3.11, -2.333), .031, "Aluminum")
            self.Beam("CabaneCrossBrace" + suffix, (side * .52, 2.32, -3.67), (side * .77, 3.11, -2.333), .004, "Steel", 6)
            self.Beam("LandingWire" + suffix, (side * .78, 3.09, -3.583), (side * 4.13, 1.40, -2.70), .008, "Steel", 6)
            self.Beam("FlyingWire" + suffix, (side * .53, 1.50, -3.15), (side * 4.42, 3.18, -3.153), .008, "Steel", 6)
            for x, y, z in (a, b, (side * .55, 1.51, -2.38)):
                self.Ellipsoid("StrutClevis" + suffix + str(z), (x, y, z), (.065, .055, .055), "Steel", 16, 8)
        # Root fairings and centre-section fuel filler.
        for side in (-1, 1):
            self.Tube("LowerWingRootFillet" + str(side), [(side * .53, 1.52, -3.37), (side * .61, 1.47, -3.0),
                                                          (side * .62, 1.43, -2.5), (side * .52, 1.40, -1.65)], .055, "Aluminum", 10)
        self.Beam("UpperWingFuelFiller", (0, 3.23, -3.383), (0, 3.29, -3.383), .065, "Aluminum", 24)

    def Foil(self, name, outline, thickness=.055, vertical=False, parent=None, material="Fabric"):
        # Outline is (span-or-height, aft). Real thin airfoils have closed sides.
        verts, faces, uvs = [], [], []
        n = len(outline)
        for side in (-1, 1):
            for a, z in outline:
                verts.append((side * thickness / 2, a, z) if vertical else (a, 1.86 + side * thickness / 2, z))
                u = (z - 4.1) / 2.2
                uvs.append(((1.22 - u if side > 0 else u), (a - 1.70) / 1.60) if vertical else ((a + 2.5) / 5, (z - 4.1) / 2.2))
        # Concave root shapes are triangulated by Blender/glTF, not fan-filled.
        faces.extend((tuple(range(n - 1, -1, -1)), tuple(range(n, n * 2))))
        for j in range(n):
            faces.append((j, (j + 1) % n, (j + 1) % n + n, j + n))
        ob = self.Mesh(name, verts, faces, "Fin" if vertical else "Tail", uvs=uvs, parent=parent)
        mod = ob.modifiers.new("TailSurfaceEdgeRadius", "BEVEL")
        mod.width = thickness * .30
        mod.segments = 3 if self.high else 2
        self.Apply(ob, mod)
        return ob

    def Tail(self):
        for side, suffix in ((-1, "Left"), (1, "Right")):
            outline = [(side * .08, 4.68), (side * 1.72, 4.83), (side * 1.96, 4.87),
                       (side * 2.08, 4.98), (side * 2.10, 5.61), (side * .08, 5.61)]
            self.Foil("HorizontalStabilizer" + suffix, outline, .075)
            pivot = self.Empty("Elevator" + suffix + "Pivot", (side * .15, 1.86, 5.64), self.root)
            pivot["axisLocal"] = "+X"
            pivot["rangeDegrees"] = [-25., 25.]
            self.controls["Elevator" + suffix] = pivot
            outline = [(side * .12, 5.65), (side * 2.10, 5.65), (side * 2.09, 5.92),
                       (side * 2.01, 6.04), (side * 1.89, 6.08), (side * .22, 6.08)]
            self.Foil("Elevator" + suffix, outline, .06, parent=pivot)
            self.Beam("TailplaneLowerBrace" + suffix, (side * .10, 1.62, 4.60), (side * 1.67, 1.82, 5.18), .015, "Steel", 8)
            self.Beam("TailplaneUpperWire" + suffix, (0, 2.45, 5.12), (side * 1.82, 1.90, 5.13), .005, "Steel", 6)
            self.Beam("ElevatorHorn" + suffix, (side * .19, 1.88, 5.64), (side * .19, 2.04, 5.65), .016, "Steel", 8, parent=pivot)
            for j in range(4):
                x = side * (.40 + .43 * j)
                self.Beam("ElevatorHinge" + suffix + str(j), (x - .02, 1.86, 5.64), (x + .02, 1.86, 5.64), .006, "Steel", 12)
        fin = [(1.85, 4.42), (2.10, 4.64), (2.50, 4.96), (2.93, 5.24), (3.14, 5.41),
               (3.20, 5.59), (3.17, 5.70), (1.84, 5.70)]
        self.Foil("TypeIITallFixedFin", fin, .092, True)
        pivot = self.Empty("RudderPivot", (0, 1.85, 5.73), self.root)
        pivot["axisLocal"] = "+Y in glTF / +Z in Blender"
        pivot["rangeDegrees"] = [-25., 25.]
        self.controls["Rudder"] = pivot
        rudder = [(1.76, 5.755), (3.17, 5.755), (3.16, 5.97), (3.09, 6.07),
                  (2.91, 6.13), (2.13, 6.14), (1.85, 6.10)]
        self.Foil("Rudder", rudder, .075, True, pivot)
        for j, y in enumerate((2.00, 2.48, 2.97)):
            self.Beam("RudderHinge" + str(j), (0, y - .02, 5.735), (0, y + .02, 5.735), .006, "Steel", 12)
        for side in (-1, 1):
            self.Beam("RudderHorn" + str(side), (0, 1.84, 5.88), (side * .25, 1.84, 5.88), .016, "Steel", 8, parent=pivot)

    def Wheel(self, side, suffix):
        center = (side * 1.12, .47, -2.91)
        pivot = self.Empty("Wheel" + suffix + "Pivot", center, self.root)
        pivot["axisLocal"] = "+X"
        pivot["rollingRadiusM"] = .47
        self.controls["Wheel" + suffix] = pivot
        verts, faces, uvs = [], [], []
        profile = [(-.106, .29), (-.111, .34), (-.102, .40), (-.080, .447),
                   (-.041, .469), (0, .470), (.041, .469), (.080, .447),
                   (.102, .40), (.111, .34), (.106, .29)]
        n = 96 if self.high else 56
        for j, (x, radius) in enumerate(profile):
            for k in range(n + 1):
                t = TAU * k / n
                verts.append((center[0] + x, center[1] + radius * math.cos(t), center[2] + radius * math.sin(t)))
                uvs.append((k / n, j / (len(profile) - 1)))
        for j in range(len(profile) - 1):
            for k in range(n):
                a = j * (n + 1) + k
                faces.append((a, a + 1, a + n + 2, a + n + 1))
        self.Mesh("RubberTyre" + suffix, verts, faces, "Rubber", uvs=uvs, parent=pivot)
        self.Beam("WheelPaintedDisc" + suffix, (center[0] - .09, center[1], center[2]),
                  (center[0] + .09, center[1], center[2]), .305, "Fabric", 64 if self.high else 40, parent=pivot)
        for face in (-1, 1):
            x = center[0] + face * .096
            self.Beam("WheelHub" + suffix + str(face), (x, .47, -2.91), (x + face * .025, .47, -2.91), .061, "Steel", 24, parent=pivot)
            for j in range(6):
                t = TAU * j / 6
                a = (x + face * .005, .47 + .145 * math.cos(t), -2.91 + .145 * math.sin(t))
                b = (x + face * .015, a[1], a[2])
                self.Beam("WheelDiscBolt" + suffix + str(face) + str(j), a, b, .013, "Steel", 6, parent=pivot)
        return pivot

    def Gear(self):
        self.Beam("FixedCrossAxle", (-1.25, .47, -2.91), (1.25, .47, -2.91), .062, "Steel", 20)
        for side, suffix in ((-1, "Left"), (1, "Right")):
            self.Wheel(side, suffix)
            self.Beam("GearFrontStreamlinedLeg" + suffix, (side * .45, 1.67, -3.84), (side * .98, .51, -2.91), .066, "Aluminum", 12, 2.8)
            self.Beam("GearAftStay" + suffix, (side * .46, 1.56, -1.63), (side * .98, .51, -2.91), .040, "Aluminum", 12, 1.5)
            self.Beam("GearShockWrap" + suffix, (side * .89, .61, -2.96), (side * .99, .49, -2.91), .089, "Ivory", 16)
            self.Beam("GearCrossWire" + suffix, (side * .43, 1.58, -3.50), (-side * .97, .50, -2.91), .007, "Steel", 6)
            self.Box("GearAxleClamp" + suffix, (side * .93, .48, -2.91), (.15, .15, .16), "Steel", .015)
        self.Beam("TailSkidSocket", (0, 1.72, 5.45), (0, 1.43, 5.48), .074, "Steel", 16)
        self.Tube("SprungWoodTailSkid", [(0, 1.50, 5.47), (0, 1.16, 5.55), (0, .90, 5.89), (0, .86, 6.10)], .050, "Wood", 12)
        self.Beam("TailSkidSteelShoe", (0, .842, 5.94), (0, .845, 6.13), .057, "Steel", 12, .55)
        self.Beam("TailSkidFrontBrace", (0, 1.65, 4.91), (0, 1.15, 5.55), .023, "Steel", 10)
        for j in range(7):
            self.Beam("TailSkidBinding" + str(j), (-.055, 1.40 - j * .025, 5.50 + j * .006), (.055, 1.40 - j * .025, 5.50 + j * .006), .009, "Ivory", 8)

    def Propeller(self):
        pivot = self.Empty("PropellerPivot", (0, 1.95, -5.98), self.root)
        pivot["axisLocal"] = "+Z in glTF / -Y in Blender"
        pivot["rpmPreview"] = 480.0
        pivot["referenceRestAngleDegrees"] = -43.74638577345526
        self.controls["Propeller"] = pivot
        # Two opposite handed blade lofts, with chord twist and a thin trailing
        # edge. The tip is rounded; no flat rectangle or intersecting oval.
        sections = [(.10, .055, 37), (.23, .105, 33), (.47, .165, 26), (.80, .169, 19),
                    (1.10, .134, 13), (1.29, .089, 10), (1.41, .018, 8), (1.43, .001, 8)]
        for side, suffix in ((-1, "Lower"), (1, "Upper")):
            verts, faces, uvs = [], [], []
            n = 20 if self.high else 12
            for i, (r, halfChord, twistDeg) in enumerate(sections):
                twist = math.radians(twistDeg)
                sweep = .055 * (r / 1.43) ** 2
                for j in range(n):
                    t = TAU * j / n
                    chord = math.cos(t) * halfChord
                    thick = math.sin(t) * (.024 * (1 - r / 1.7))
                    x = side * (sweep + chord * math.cos(twist) - thick * math.sin(twist))
                    z = -5.99 + side * (chord * math.sin(twist) + thick * math.cos(twist))
                    verts.append((x, 1.95 + side * r, z))
                    uvs.append((j / n, r / 1.43))
            for i in range(len(sections) - 1):
                for j in range(n):
                    a = i * n + j
                    faces.append((a, i * n + (j + 1) % n, (i + 1) * n + (j + 1) % n, a + n))
            faces.extend((tuple(range(n - 1, -1, -1)), tuple((len(sections) - 1) * n + j for j in range(n))))
            self.Mesh("CarvedWoodPropellerBlade" + suffix, verts, faces, "Wood", uvs=uvs, parent=pivot)
        self.Beam("PropellerHub", (0, 1.95, -6.025), (0, 1.95, -5.88), .18, "Steel", 40, parent=pivot)
        verts, faces, uvs = [], [], []
        profile = [(-6.14, .002), (-6.12, .037), (-6.08, .089), (-6.03, .133), (-5.98, .157), (-5.94, .165)]
        n = 48 if self.high else 32
        for i, (z, radius) in enumerate(profile):
            for j in range(n):
                t = TAU * j / n
                verts.append((radius * math.cos(t), 1.95 + radius * math.sin(t), z))
                uvs.append((j / n, i / (len(profile) - 1)))
        for i in range(len(profile) - 1):
            for j in range(n):
                faces.append((i*n+j, i*n+(j+1)%n, (i+1)*n+(j+1)%n, (i+1)*n+j))
        faces.extend((tuple(range(n-1,-1,-1)), tuple((len(profile)-1)*n+j for j in range(n))))
        self.Mesh("PointedPropellerBoss", verts, faces, "Wood", uvs=uvs, parent=pivot)
        for j in range(8):
            t = TAU * j / 8
            self.Beam("PropellerHubBolt" + str(j), (.122 * math.cos(t), 1.95 + .122 * math.sin(t), -6.085),
                      (.122 * math.cos(t), 1.95 + .122 * math.sin(t), -6.11), .011, "Steel", 6, parent=pivot)
        pivot.rotation_euler.y = math.radians(43.74638577345526)
        bpy.context.view_layer.update()

    def Recalculate(self):
        # Explicit outward normals, including the two mirrored wing halves.
        import bmesh
        for ob in self.meshes:
            if ob.name not in bpy.data.objects:
                continue
            bm = bmesh.new()
            bm.from_mesh(ob.data)
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
            bm.to_mesh(ob.data)
            bm.free()

    def Surface(self):
        """Attach exportable UV PBR and physically scaled detail UVs."""
        textureRoot = self.sourceRoot / "Textures"
        surfaceManifest = json.loads((textureRoot / "Data_SurfaceSources.json").read_text(encoding="utf-8"))
        self.root["surfaceSourceVersion"] = surfaceManifest["version"]
        family = {"Fabric": "Fabric", "Fuselage": "Fuselage", "FuselageMetal": "Fuselage",
                  "UpperWing": "UpperWing", "LowerUnderside": "LowerUnderside", "Tail": "FabricPlain", "Fin": "Fin",
                  "Aluminum": "Aluminum", "Steel": "Steel", "Exhaust": "Exhaust", "Rubber": "Rubber",
                  "Leather": "Leather", "Wood": "Wood", "Cockpit": "Cockpit"}
        detail = {"FuselageMetal": "Aluminum", "Fuselage": "Fabric", "UpperWing": "Fabric",
                  "LowerUnderside": "Fabric", "Tail": "Fabric", "Fin": "Fabric", "Cockpit": "Steel"}
        uvMappedFamilies = {"Fabric", "Fuselage", "FuselageMetal", "UpperWing", "LowerUnderside", "Tail", "Fin", "Wood", "Rubber", "Leather"}
        for key, source in family.items():
            mat = self.materials[key]
            nodes, links = mat.node_tree.nodes, mat.node_tree.links
            shader = nodes.get("Principled BSDF")
            if key == "Wood":
                shader.inputs["Coat Weight"].default_value = .30
                shader.inputs["Coat Roughness"].default_value = .24
            uv = nodes.new("ShaderNodeUVMap")
            uv.uv_map = "UvSurface"
            detailUv = nodes.new("ShaderNodeUVMap")
            detailUv.uv_map = "UvDetail"
            for channel in ("Base", "Orm", "Normal"):
                texture = nodes.new("ShaderNodeTexImage")
                filename = "Texture_Type88" + (detail.get(key, key) if channel == "Normal" else source) + channel + ".png"
                texture.image = bpy.data.images.load(str(textureRoot / filename), check_existing=True)
                texture.image.colorspace_settings.name = "sRGB" if channel == "Base" else "Non-Color"
                texture.extension = "REPEAT" if channel == "Normal" or key not in uvMappedFamilies else "EXTEND"
                texture.label = "Actual-scale detail" if channel == "Normal" else "Authored " + channel
                links.new((detailUv if channel == "Normal" else uv).outputs["UV"], texture.inputs["Vector"])
                if channel == "Base":
                    links.new(texture.outputs["Color"], shader.inputs["Base Color"])
                elif channel == "Normal":
                    normal = nodes.new("ShaderNodeNormalMap")
                    normal.uv_map = "UvDetail"
                    normal.inputs["Strength"].default_value = 1.0
                    links.new(texture.outputs["Color"], normal.inputs["Color"])
                    links.new(normal.outputs["Normal"], shader.inputs["Normal"])
                else:
                    separate = nodes.new("ShaderNodeSeparateColor")
                    links.new(texture.outputs["Color"], separate.inputs["Color"])
                    links.new(separate.outputs["Green"], shader.inputs["Roughness"])
                    links.new(separate.outputs["Blue"], shader.inputs["Metallic"])
            mat["surfaceSource"] = source
            mat["detailMetersPerTile"] = .0832 if detail.get(key, key) in ("Fabric", "Leather") else .20
        for ob in self.meshes:
            mesh = ob.data
            sourceUv = mesh.uv_layers.get("UvSurface")
            if sourceUv is None:
                sourceUv = mesh.uv_layers.new(name="UvSurface")
                for poly in mesh.polygons:
                    dominant = max(range(3), key=lambda k: abs(poly.normal[k]))
                    axes = [k for k in range(3) if k != dominant]
                    for loopIndex in poly.loop_indices:
                        p = mesh.vertices[mesh.loops[loopIndex].vertex_index].co
                        sourceUv.data[loopIndex].uv = (p[axes[0]] / .20, p[axes[1]] / .20)
            detailUv = mesh.uv_layers.new(name="UvDetail")
            key = next((key for key, mat in self.materials.items() if mesh.materials and mesh.materials[0] == mat), "Steel")
            if key == "Exhaust":
                seed = sum((i + 1) * ord(c) for i, c in enumerate(ob.name))
                offset = ((seed % 29) / 29, (seed % 43) / 43)
                for data in sourceUv.data:
                    data.uv.x += offset[0]
                    data.uv.y += offset[1]
            tile = .0832 if detail.get(key, key) in ("Fabric", "Leather") else .20
            if key in ("Fuselage", "FuselageMetal"):
                extent = (11.90, 2.60)
            elif key in ("UpperWing", "LowerUnderside") or (key == "Fabric" and ("Wing" in ob.name or "Aileron" in ob.name)):
                extent = (15, 1.88)
            elif key == "Fin":
                extent = (2.2, 1.6)
            elif key == "Tail":
                extent = (5, 2.2)
            elif key == "Wood" and "Blade" in ob.name:
                extent = (.52, 1.43)
            elif key == "Rubber" and "Tyre" in ob.name:
                extent = (TAU * .47, .40)
            else:
                extent = ob.get("uvExtentM", (.20, .20))
            for poly in mesh.polygons:
                polyMaterial = mesh.materials[poly.material_index] if mesh.materials else None
                polyKey = next((name for name, mat in self.materials.items() if mat == polyMaterial), key)
                polyTile = .0832 if detail.get(polyKey, polyKey) in ("Fabric", "Leather") else .20
                for loopIndex in poly.loop_indices:
                    uv = sourceUv.data[loopIndex].uv
                    detailUv.data[loopIndex].uv = (uv.x * extent[0] / polyTile, uv.y * extent[1] / polyTile)
            # Explicit map names in all shader nodes make bake/render/export
            # independent of which UV layer is currently active in the editor.
            mesh.uv_layers.active = sourceUv
            sourceUv.active_render = True
        bpy.context.scene["surfaceStage"] = "UV PBR attached; global occlusion bake pending"

    def BakeOcclusion(self):
        """One temporary bake proxy; copy packed UV loops back to editable parts.

        Baking hundreds of separate selected objects repeats scene setup. A
        transient assembled proxy gives the same geometric occlusion in one
        bake; no source mesh or movable node is merged in the saved project.
        """
        scene = bpy.context.scene
        size = 4096 if self.high else 2048
        self.Progress("PreparingOcclusionProxy")
        image = bpy.data.images.new("Texture_Type88AssemblyAo", width=size, height=size, alpha=False)
        image.generated_color = (1, 1, 1, 1)
        image.colorspace_settings.name = "Non-Color"
        bpy.ops.object.select_all(action="DESELECT")
        verts, faces, ranges = [], [], []
        loopOffset = 0
        hidden = {}
        bpy.context.view_layer.update()
        for ob in self.meshes:
            offset = len(verts)
            verts.extend(tuple(ob.matrix_world @ vertex.co) for vertex in ob.data.vertices)
            faces.extend(tuple(offset + i for i in poly.vertices) for poly in ob.data.polygons)
            ranges.append((ob, loopOffset, len(ob.data.loops)))
            loopOffset += len(ob.data.loops)
            hidden[ob.name] = ob.hide_render
            ob.hide_render = True
        mesh = bpy.data.meshes.new("ToolAssemblyOcclusionProxyMesh")
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        assert len(mesh.loops) == loopOffset, "Occlusion proxy changed corner ordering"
        proxy = bpy.data.objects.new("ToolAssemblyOcclusionProxy", mesh)
        self.stageColl.objects.link(proxy)
        proxy.select_set(True)
        bpy.context.view_layer.objects.active = proxy
        mesh.uv_layers.new(name="UvOcclusion")
        self.Progress("PackingOcclusionUv", proxyCorners=loopOffset)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(70), island_margin=.0015, area_weight=.3,
                                 correct_aspect=True, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        bakeMat = Mat("ToolAssemblyOcclusionBakeMaterial", (.5, .5, .5))
        mesh.materials.append(bakeMat)
        target = bakeMat.node_tree.nodes.new("ShaderNodeTexImage")
        target.image = image
        bakeMat.node_tree.nodes.active = target
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 16
        scene.render.threads_mode = "FIXED"
        scene.render.threads = 4
        scene.render.bake.use_selected_to_active = False
        scene.render.bake.margin = 10
        scene.render.bake.use_clear = True
        scene.world.color = (.8, .8, .8)
        self.Progress("BakingOcclusion", resolution=size)
        bpy.ops.object.bake(type="AO")
        output = self.sourceRoot / "Textures" / ("Texture_Type88HighAssemblyAo.png" if self.high else "Texture_Type88GameAssemblyAo.png")
        image.filepath_raw = str(output)
        image.file_format = "PNG"
        image.save()
        self.Progress("RestoringEditableParts")
        packed = mesh.uv_layers.get("UvOcclusion")
        for ob, offset, count in ranges:
            uv = ob.data.uv_layers.new(name="UvOcclusion")
            for i in range(count):
                uv.data[i].uv = packed.data[offset + i].uv
            ob.hide_render = hidden[ob.name]
        bpy.data.objects.remove(proxy, do_unlink=True)
        bpy.data.meshes.remove(mesh)
        bpy.data.materials.remove(bakeMat)
        group = bpy.data.node_groups.get("glTF Material Output")
        if group is None:
            from io_scene_gltf2.blender.com.material_helpers import create_settings_group
            group = create_settings_group("glTF Material Output")
        # Older source projects used an AO-only group with the same name.
        # Blender 5.2's importer also expects these non-core material inputs.
        sockets = {item.name for item in group.interface.items_tree if item.item_type == "SOCKET"}
        for name, default in (("Occlusion", 1.), ("Thickness", 0.), ("Dispersion", 0.), ("Iridescence Factor", 0.), ("Iridescence Thickness Minimum", 100.)):
            if name not in sockets:
                socket = group.interface.new_socket(name=name, in_out="INPUT", socket_type="NodeSocketFloat")
                socket.default_value = default
        for mat in self.materials.values():
            nodes, links = mat.node_tree.nodes, mat.node_tree.links
            texture = nodes.new("ShaderNodeTexImage")
            texture.name = "AssemblyAoBaked"
            texture.image = image
            uv = nodes.new("ShaderNodeUVMap")
            uv.uv_map = "UvOcclusion"
            links.new(uv.outputs["UV"], texture.inputs["Vector"])
            occlusion = nodes.new("ShaderNodeGroup")
            occlusion.node_tree = group
            links.new(texture.outputs["Color"], occlusion.inputs["Occlusion"])
        for ob in self.meshes:
            uv = ob.data.uv_layers.get("UvSurface")
            ob.data.uv_layers.active = uv
            uv.active_render = True
        scene["surfaceStage"] = "UV PBR plus baked assembly occlusion"
        self.Progress("OcclusionComplete", image=str(output))

    def Progress(self, stage, **details):
        self.reviewDir.mkdir(parents=True, exist_ok=True)
        progress = {"stage": stage, "version": VERSION, "detail": self.detail, **details}
        (self.reviewDir / ("Data_Progress" + self.detail.title() + ".json")).write_text(json.dumps(progress), encoding="utf-8")

    def MergeGameParts(self):
        """Batch only parts sharing a rigid owner; preserve every control pivot."""
        groups = {}
        for ob in self.meshes:
            if ob.name == "AirframeFacetedFuselage" or ob.get("retainedMovingNode") or ob.animation_data:
                continue
            key = (ob.parent.name if ob.parent else "Root", tuple(mat.name for mat in ob.data.materials))
            groups.setdefault(key, []).append(ob)
        for (owner, materialNames), objects in groups.items():
            if len(objects) < 2:
                continue
            bpy.ops.object.select_all(action="DESELECT")
            for ob in objects:
                ob.select_set(True)
            active = objects[0]
            bpy.context.view_layer.objects.active = active
            bpy.ops.object.join()
            active.name = "Part_" + owner.removesuffix("Pivot") + "_" + materialNames[0].removeprefix("Material_Type88")
        self.meshes = [ob for ob in self.modelColl.objects if ob.type == "MESH"]
        self.Progress("GameRigidBatchingComplete", meshes=len(self.meshes))

    def Stage(self):
        scene = bpy.context.scene
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 24
        scene.cycles.use_denoising = True
        scene.render.resolution_x = 1280
        scene.render.resolution_y = 960
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = "PNG"
        scene.world.use_nodes = True
        scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.30, .30, .30, 1)
        scene.world.node_tree.nodes["Background"].inputs[1].default_value = .7
        scene.view_settings.view_transform = "AgX"
        scene.render.film_transparent = True
        for name, pos, energy, size in [("BroadKey", (-7, 13, -8), 1800, 9), ("SoftFill", (8, 9, 1), 1100, 8), ("AftRim", (-2, 7, 10), 1200, 7)]:
            data = bpy.data.lights.new(name, "AREA")
            data.energy = energy
            data.shape = "DISK"
            data.size = size
            ob = bpy.data.objects.new(name, data)
            self.stageColl.objects.link(ob)
            ob.location = P(pos)
            ob.rotation_euler = (P((0, 1.5, 0)) - ob.location).to_track_quat("-Z", "Y").to_euler()
        for name, pos, target, scale, roll in [
            ("ReferenceMuseum", (-12.3295006761, 20.9937718039, .20151421869), (0, 1.7, 0), 13.7691135933, 0),
            ("ReferenceHistoricII", (15, 2.7, -16), (0, 1.7, -.4), 17.0, 0),
            ("PortElevation", (-23, 2.0, 0), (0, 1.8, 0), 14.0, 0),
            ("FrontElevation", (0, 2.0, -24), (0, 1.8, -.5), 16.0, 0),
            ("PlanElevation", (0, 25, .001), (0, 1.7, 0), 16.5, 90),
        ]:
            data = bpy.data.cameras.new("Camera" + name)
            data.type = "ORTHO"
            data.ortho_scale = scale
            if name == "ReferenceMuseum":
                data.type = "PERSP"
                data.sensor_fit = "HORIZONTAL"
                data.sensor_width = 36
                data.lens = (Vector(pos) - Vector(target)).length * 36 / scale
                data.shift_x = -.5013797022764699 / scale
                data.shift_y = -.209774384298742 / scale
            ob = bpy.data.objects.new("Camera" + name, data)
            self.stageColl.objects.link(ob)
            ob.location = P(pos)
            if name in ("ReferenceMuseum", "PlanElevation"):
                normal = (Vector(pos) - Vector(target)).normalized()
                right = Vector((0, 0, 1))
                right = (right - normal * normal.dot(right)).normalized()
                up = normal.cross(right).normalized()
                matrix = Matrix((P(right), P(up), P(normal))).transposed().to_4x4()
                ob.rotation_euler = (matrix @ Matrix.Rotation(math.radians(2.4197296274 if name == "ReferenceMuseum" else 0), 4, "Z")).to_euler()
            else:
                quat = (P(target) - ob.location).to_track_quat("-Z", "Y")
                ob.rotation_euler = (quat.to_matrix().to_4x4() @ Matrix.Rotation(math.radians(roll), 4, "Z")).to_euler()
        scene.camera = bpy.data.objects["CameraReferenceHistoricII"]

    def Save(self):
        for path in (self.sourceRoot, self.modelDir, self.reviewDir):
            path.mkdir(parents=True, exist_ok=True)
        self.Recalculate()
        bpy.context.view_layer.update()
        self.root["buildVersion"] = VERSION
        self.root["buildStage"] = self.stage
        suffix = "Shape" if self.stage == "shape" else ("High" if self.high else "Game")
        file = self.sourceRoot / ("Scene_KawasakiType88" + suffix + ".blend")
        for image in bpy.data.images:
            if image.source in ("FILE", "GENERATED") and image.users:
                image.pack()
        bpy.ops.wm.save_as_mainfile(filepath=str(file))
        bpy.ops.object.select_all(action="DESELECT")
        for ob in self.modelColl.objects:
            ob.select_set(True)
        if self.stage == "shape":
            glb = self.reviewDir / "Model_KawasakiType88Shape.glb"
        elif self.high:
            glb = self.sourceRoot / "Exports/Model_KawasakiType88High.glb"
        else:
            glb = self.modelDir / "Model_KawasakiType88.glb"
        glb.parent.mkdir(parents=True, exist_ok=True)
        with contextlib.redirect_stdout(io.StringIO()):
            bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True,
                                      export_yup=True, export_apply=True, export_extras=True,
                                      export_animations=False, export_materials="EXPORT", export_image_format="AUTO",
                                      export_tangents=False)
        stats = {"version": VERSION, "stage": self.stage, "source": str(file), "export": str(glb),
                 "objects": len(self.meshes), "triangles": sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in self.meshes),
                 "controls": {name: {"node": ob.name, "positionBlender": list(ob.matrix_world.translation), "properties": {k: list(v) if hasattr(v, "to_list") else v for k, v in ob.items()}} for name, ob in self.controls.items()},
                 "referenceMatchApproved": False}
        corners = [ob.matrix_world @ Vector(p) for ob in self.meshes for p in ob.bound_box]
        extent = [max(p[i] for p in corners) - min(p[i] for p in corners) for i in range(3)]
        stats["dimensionsM"] = {"wingspan": extent[0], "height": extent[2], "length": extent[1]}
        stats["surfaceVersion"] = self.root.get("surfaceSourceVersion")
        (self.reviewDir / "Data_Build.json").write_text(json.dumps(stats, indent=2), encoding="utf-8")
        print(json.dumps({k: stats[k] for k in ("version", "stage", "source", "export", "objects", "triangles", "referenceMatchApproved")}))

    def Build(self):
        self.Setup()
        self.Fuselage()
        self.Wings()
        self.Tail()
        self.Gear()
        self.Propeller()
        self.Stage()
        if self.stage == "pbr":
            self.Recalculate()
            self.Surface()
            self.BakeOcclusion()
            if not self.high:
                self.MergeGameParts()
        self.Save()


def Main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--source-root", type=Path, default=SOURCE_DEFAULT)
    parser.add_argument("--stage", choices=("shape", "pbr"), default="shape")
    parser.add_argument("--detail", choices=("high", "game"), default="high")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    Builder(args.repo_root, args.source_root, args.stage, args.detail).Build()


if __name__ == "__main__":
    Main()
