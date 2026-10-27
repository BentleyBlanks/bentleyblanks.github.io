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
import struct
import sys
import bpy
from mathutils import Vector, Matrix, Quaternion


VERSION = "20261027ReferenceGeometry86"
PI = math.pi
TAU = 2 * PI
SOURCE_DEFAULT = Path(r"C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\KawasakiType88\Release86")


def P(p):
    return Vector((p[0], -p[2], p[1]))


def StableSinCos(angle):
    # Fractional powers amplify the floating-point residue at cardinal angles.
    sine, cosine = math.sin(angle), math.cos(angle)
    return (0. if abs(sine) < 1e-12 else sine,
            0. if abs(cosine) < 1e-12 else cosine)


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
        self.cowlingData = json.loads((self.modelDir / "Data_KawasakiType88Cowling.json").read_text(encoding="utf-8"))
        self.wingData = json.loads((self.modelDir / "Data_KawasakiType88Wing.json").read_text(encoding="utf-8"))
        self.cockpitData = json.loads((self.modelDir / "Data_KawasakiType88Cockpit.json").read_text(encoding="utf-8"))
        bodyFile = self.modelDir / "Data_KawasakiType88Body.json"
        self.bodyData = json.loads(bodyFile.read_text(encoding="utf-8")) if bodyFile.exists() else {}
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
        if self.stage == "pbr":
            self.root["acceptedForConfiguration"] = True
            self.root["releaseVersion"] = "20261028Release86"
        gray = (.42, .42, .42)
        palette = {
            "Fabric": ((.57, .59, .56), .12, .63),
            "LowerWingFabric": ((.57, .59, .56), .12, .63),
            "Aluminum": ((.47, .50, .51), .72, .37),
            "Steel": ((.13, .15, .15), .78, .48),
            "Exhaust": ((.13, .105, .085), .6, .77),
            "Rubber": ((.024, .028, .029), 0, .84),
            "Leather": ((.075, .039, .022), 0, .6),
            "Wood": ((.18, .055, .027), 0, .35),
            "Cockpit": ((.11, .14, .12), .25, .62),
            "CockpitLining": ((.055, .065, .06), .03, .74),
            "LowerHousing": ((.47, .50, .48), .09, .55),
            "LowerPocket": ((.47, .50, .48), .09, .55),
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
        for key, finish in self.cockpitData.get("finishes", {}).items():
            palette[key] = (tuple(finish["baseSrgb"]), finish["metallic"], finish["roughness"])
        if self.cowlingData.get("jointFinish"):
            finish = self.cowlingData["jointFinish"]
            palette["CowlingJoint"] = (tuple(finish["baseSrgb"]), finish["metallic"], finish["roughness"])
        windscreen = self.cockpitData.get("windscreenFinish", {})
        if windscreen:
            palette["Glass"] = (tuple(windscreen["baseColorLinear"]), 0., windscreen["roughness"])
        for key, (color, metal, rough) in palette.items():
            self.materials[key] = Mat("Material_Type88" + key, gray if self.stage == "shape" else color,
                                      .0 if self.stage == "shape" else metal, .68 if self.stage == "shape" else rough)
        if self.stage != "shape":
            glass = self.materials["Glass"].node_tree.nodes.get("Principled BSDF")
            glass.inputs["Transmission Weight"].default_value = windscreen.get("transmission", .74)
            glass.inputs["IOR"].default_value = windscreen.get("ior", 1.46)

    # z, half-width, centre height, upper radius, lower radius. The aft fuselage
    # has flat facets; it is not modelled as a modern round tube.
    sections = [
        (-5.88, .29, 1.97, .28, .28), (-5.66, .43, 1.99, .40, .37),
        (-5.30, .52, 1.99, .45, .42), (-4.60, .57, 1.99, .46, .44),
        (-3.65, .58, 1.99, .44, .44), (-2.80, .57, 1.99, .43, .46),
        (-1.65, .53, 1.99, .42, .44), (-.38, .49, 1.97, .39, .42),
        (.55, .445, 1.94, .36, .39), (1.70, .37, 1.90, .31, .34),
        (3.20, .26, 1.85, .24, .26), (4.55, .145, 1.81, .16, .17),
        # End the aft post ahead of the rudder's rounded hinge envelope.
        (5.18, .075, 1.80, .10, .11), (5.28, .065, 1.80, .09, .10),
    ]

    def Section(self, z):
        for sectionIndex, (a, b) in enumerate(zip(self.sections, self.sections[1:])):
            if a[0] <= z <= b[0]:
                t = (z - a[0]) / (b[0] - a[0])
                values = [Lerp(a[i], b[i], t) for i in range(1, 5)]
                if z <= -3.65:
                    before = self.sections[max(0, sectionIndex - 1)]
                    after = self.sections[min(len(self.sections) - 1, sectionIndex + 2)]
                    for i in range(1, 5):
                        slopeA = (b[i] - before[i]) / (b[0] - before[0])
                        slopeB = (after[i] - a[i]) / (after[0] - a[0])
                        value = (2*t**3 - 3*t*t + 1)*a[i] + (t**3 - 2*t*t + t)*(b[0]-a[0])*slopeA
                        value += (-2*t**3 + 3*t*t)*b[i] + (t**3-t*t)*(b[0]-a[0])*slopeB
                        values[i-1] = max(min(a[i], b[i]), min(max(a[i], b[i]), value))
                w, cy, up, low = values
                strength = min(1, max(0, (z + 4.60) / .95)) * min(1, max(0, (5.60 - z) / 3.90))
                w, cy = w * (1 + .40 * strength), cy - .15 * strength
                # Both visible aft-body boundaries, with the camera held fixed.
                # The image constrains projected shape, not factory sections.
                photoStations = [(-.38, 1, 0), (.55, .94413, -.07194),
                                 (1.70, .90650, -.02257), (3.20, 1.09307, -.02084),
                                 (4.55, 1.40000, -.03495), (5.18, 1, 0)]
                for beforePhoto, afterPhoto in zip(photoStations, photoStations[1:]):
                    if beforePhoto[0] <= z <= afterPhoto[0]:
                        photoT = (z - beforePhoto[0]) / (afterPhoto[0] - beforePhoto[0])
                        w *= Lerp(beforePhoto[1], afterPhoto[1], photoT)
                        cy += Lerp(beforePhoto[2], afterPhoto[2], photoT)
                        break
                return w, cy, up + .15 * strength, low + .25 * strength
        return tuple((self.sections[0] if z < self.sections[0][0] else self.sections[-1])[1:])

    def Top(self, x, z):
        w, cy, up, low = self.Section(z)
        q = min(.9999, abs(x) / w)
        if z >= -3.65:
            roof = self.RoofShoulderFraction(z)
            data = self.bodyData.get("secondaryShoulder", {})
            profile = self.SecondaryShoulderProfile(z)
            if profile and q > roof:
                centreX = roof + (1 - roof) / 3
                centreY = .92 * up + data["heightM"] * profile
                if q <= centreX:
                    return cy + Lerp(.98 * up, centreY, (q - roof) / (centreX - roof))
                return cy + Lerp(centreY, .80 * up, (q - centreX) / (1 - centreX))
            return cy + up * (1 - .02 * q / roof if q <= roof else .98 - .18 * (q - roof) / (1 - roof))
        exponent = 2 / self.CowlingPower(z)
        return cy + up * (1 - q ** exponent) ** (1 / exponent) + self.FrontCapOffset(x, z)

    def FrontCapOffset(self, x, z):
        data = self.cowlingData.get("frontCapSurface")
        if not data or not data.get("inwardDepthM"):
            return 0.
        halfWidth = self.Section(z)[0] * data["halfWidthFraction"]
        radiusSquared = (x / halfWidth) ** 2 + ((z - data["centreAftM"]) / data["halfLengthM"]) ** 2
        return -data["inwardDepthM"] * (1 - radiusSquared) ** 3 if radiusSquared < 1 else 0.

    def RefineFrontCap(self, body):
        data = self.cowlingData.get("frontCapSurface")
        if not data or not data.get("inwardDepthM"):
            return
        import bmesh
        mesh = bmesh.new()
        mesh.from_mesh(body.data)
        lowZ = data["centreAftM"] - data["halfLengthM"] - .08
        highZ = data["centreAftM"] + data["halfLengthM"] + .08
        selected = []
        for edge in mesh.edges:
            a, b = edge.verts
            z = -(a.co.y + b.co.y) / 2
            if not all(lowZ <= -vertex.co.y <= highZ for vertex in edge.verts):
                continue
            if not all(vertex.co.z > self.Section(-vertex.co.y)[1] + .12 for vertex in edge.verts):
                continue
            if abs((a.co.x + b.co.x) / 2) > self.Section(z)[0] * .93:
                continue
            selected.append(edge)
        cuts = data["highRefinementCuts" if self.high else "gameRefinementCuts"]
        bmesh.ops.subdivide_edges(mesh, edges=selected, cuts=cuts, use_grid_fill=True, smooth=0.)
        changed = 0
        maximum = 0.
        for vertex in mesh.verts:
            z = -vertex.co.y
            if vertex.co.z <= self.Section(z)[1]:
                continue
            offset = self.FrontCapOffset(vertex.co.x, z)
            if offset:
                vertex.co.z += offset
                changed += 1
                maximum = max(maximum, abs(offset))
        bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
        mesh.to_mesh(body.data)
        mesh.free()
        body.data.update()
        body["frontCapRefinedVertices"] = changed
        body["frontCapMaximumOffsetM"] = maximum
        body["frontCapScope"] = data["scope"]

    def CloseFuselageSeam(self, body):
        # Geometry shares the seam vertex; the UV values remain per loop.
        import bmesh
        mesh = bmesh.new()
        mesh.from_mesh(body.data)
        before = len(mesh.verts)
        bmesh.ops.remove_doubles(mesh, verts=list(mesh.verts), dist=1e-7)
        bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
        welded = before - len(mesh.verts)
        mesh.to_mesh(body.data)
        mesh.free()
        body.data.update()
        body["fuselageSeamVerticesWelded"] = welded
        body["cardinalTrigSnapped"] = True

    def HoodHalfWidthFraction(self, z):
        stations = self.cowlingData.get("hoodHalfWidthFractionStationsAftM")
        if not stations:
            return self.cowlingData["hoodHalfWidthFraction"]
        for a, b in zip(stations, stations[1:]):
            if a[0] <= z <= b[0]:
                return Lerp(a[1], b[1], (z - a[0]) / (b[0] - a[0]))
        return (stations[0] if z < stations[0][0] else stations[-1])[1]

    def CowlingPower(self, z):
        # Round nose transitioning into the photographed, nearly flat hood.
        # Section extrema are unchanged; these corner radii are photo-inferred.
        stations = self.cowlingData["powerStationsAftM"]
        for a, b in zip(stations, stations[1:]):
            if a[0] <= z <= b[0]:
                return Lerp(a[1], b[1], (z - a[0]) / (b[0] - a[0]))
        return .615

    def BodySideBottomWidth(self, station):
        data = self.bodyData.get("sideTaper")
        if not data or station is None:
            return .77
        start, plateauStart, plateauEnd, end = map(float, data["profileAftM"])
        width = float(data["lowerSideWidthFraction"])
        assert start < plateauStart < plateauEnd < end and .60 < width <= 1.
        if station <= start or station >= end:
            return .77
        profile = 1.
        # Keep decimal metre blend lengths stable across source regeneration.
        if station < plateauStart:
            profile = Smooth((station - start) / round(plateauStart - start, 12))
        elif station > plateauEnd:
            profile = Smooth((end - station) / round(end - plateauEnd, 12))
        return .77 + (width - .77) * profile

    def RoofShoulderFraction(self, station):
        data = self.bodyData.get("roofShoulder")
        if not data or station is None:
            return .85
        start, end = map(float, data["transitionAftM"])
        if station <= start:
            return .85
        profile = Smooth(min(1., max(0., (station - start) / round(end - start, 12))))
        return .85 + (float(data["widthFraction"]) - .85) * profile

    def SecondaryShoulderProfile(self, station):
        data = self.bodyData.get("secondaryShoulder", {})
        if not data.get("heightM") or station is None:
            return 0.
        start, full, fall, end = map(float, data["profileAftM"])
        if station <= start or station >= end:
            return 0.
        return Smooth(min(1., (station - start) / round(full - start, 12))) * Smooth(min(1., (end - station) / round(end - fall, 12)))

    def RectangularSection(self, t, up, low, station=None):
        """Flat fabric side panels on the rectangular steel-tube fuselage."""
        roof = self.RoofShoulderFraction(station)
        bottomSide = self.BodySideBottomWidth(station)
        bottomChamfer = .60 + (bottomSide - .77) * (.60 / .77)
        knots = [(0, 0, 1), (.125, roof, .98), (.25, 1, .80), (.75, bottomSide, -.80),
                 (.875, bottomChamfer, -.98), (1, 0, -1), (1.125, -bottomChamfer, -.98), (1.25, -bottomSide, -.80),
                 (1.75, -1, .80), (1.875, -roof, .98), (2, 0, 1)]
        q = t / PI
        profile = self.SecondaryShoulderProfile(station)
        if profile:
            foldQ, side = q, 1.
            if 1.75 <= foldQ <= 1.875:
                foldQ, side = 2 - foldQ, -1.
            if .125 <= foldQ <= .25:
                centreX = roof + (1 - roof) / 3
                centreY = .92 * up + self.bodyData["secondaryShoulder"]["heightM"] * profile
                if foldQ <= 1 / 6:
                    factor = (foldQ - .125) / (1 / 6 - .125)
                    return side * Lerp(roof, centreX, factor), Lerp(.98 * up, centreY, factor)
                factor = (foldQ - 1 / 6) / (.25 - 1 / 6)
                return side * Lerp(centreX, 1, factor), Lerp(centreY, .80 * up, factor)
        if .25 <= q <= .75:
            f = (q - .25) / .50
            return Lerp(1, bottomSide, f), Lerp(.8 * up, -.8 * low, f)
        if 1.25 <= q <= 1.75:
            f = (q - 1.25) / .50
            return -Lerp(bottomSide, 1, f), Lerp(-.8 * low, .8 * up, f)
        for a, b in zip(knots, knots[1:]):
            if a[0] <= q <= b[0]:
                f = (q - a[0]) / (b[0] - a[0])
                yy = Lerp(a[2], b[2], f)
                return Lerp(a[1], b[1], f), yy * (up if yy >= 0 else low)
        return 0, up

    def Fuselage(self):
        zs = []
        for a, b in zip(self.sections, self.sections[1:]):
            interval = (.04 if self.high else .075) if b[0] <= -3.65 else (.16 if self.high else .32)
            steps = max(2, math.ceil((b[0] - a[0]) / interval))
            zs.extend(Lerp(a[0], b[0], j / steps) for j in range(steps))
        zs.append(self.sections[-1][0])
        verts, faces, uvs = [], [], []
        n = 48 if self.high else 32
        for z in zs:
            w, cy, up, low = self.Section(z)
            exponent = self.CowlingPower(z) if z < -3.65 else .78
            for j in range(n + 1):
                t = TAU * j / n
                if not self.high and self.bodyData.get("secondaryShoulder", {}).get("heightM", 0.):
                    if j == 3:
                        t = TAU / 12
                    elif j == n - 3:
                        t = TAU * 11 / 12
                s, c = StableSinCos(t)
                x = math.copysign(abs(s) ** exponent, s) * w
                y = cy + math.copysign(abs(c) ** exponent, c) * (up if c >= 0 else low)
                if z >= -3.65:
                    xx, yy = self.RectangularSection(t, up, low, z)
                    x, y = xx * w, cy + yy
                verts.append((x, y, z))
                uvs.append(((z + 5.88) / 11.9, t / TAU))
        for i in range(len(zs) - 1):
            for j in range(n):
                a = i * (n + 1) + j
                faces.append((a, a + n + 1, a + n + 2, a + 1))
        faces.extend((tuple(range(n, -1, -1)), tuple((len(zs) - 1) * (n + 1) + j for j in range(n + 1))))
        body = self.Mesh("AirframeFacetedFuselage", verts, faces, "Fuselage", uvs=uvs)
        sharp = body.data.attributes.new("sharp_edge", "BOOLEAN", "EDGE")
        panelCorners = {2, 4, 12, 14, 18, 20, 28, 30} if n == 32 else {3, 6, 18, 21, 27, 30, 42, 45}
        for edge in body.data.edges:
            a, b = edge.vertices
            if a % (n + 1) == b % (n + 1) and a % (n + 1) in panelCorners:
                if min(-body.data.vertices[a].co.y, -body.data.vertices[b].co.y) >= -3.65 - .000001:
                    sharp.data[edge.index].value = True
        self.CloseFuselageSeam(body)
        self.RefineFrontCap(body)
        body.data.materials.append(self.materials["FuselageMetal"])
        body.data.materials.append(self.materials["CockpitLining"])
        for poly in body.data.polygons:
            if sum(-body.data.vertices[i].co.y for i in poly.vertices) / len(poly.vertices) < -3.65:
                poly.material_index = 1
        # Actual holes, cut through the upper shell, not black painted ovals.
        for label, z, rx, rz in (("Pilot", -1.35, .40, .455), ("Observer", -.20, .36, .375)):
            cockpit = self.cockpitData[label]
            z = cockpit.get("centreAftM", z)
            rx = cockpit.get("openingHalfSpanM", rx)
            rz = cockpit.get("openingHalfAftM", rz)
            outline = self.OpeningOutline(label, z, rx, rz)
            cutterVerts = [(x, y, zz) for y in (1.50, 3.40) for x, zz in outline]
            n = len(outline)
            cutterFaces = [tuple(range(n - 1, -1, -1)), tuple(range(n, n * 2))]
            cutterFaces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
            cutter = self.Mesh("Tool" + label + "Opening", cutterVerts, cutterFaces, None)
            for material in body.data.materials:
                cutter.data.materials.append(material)
            for poly in cutter.data.polygons:
                poly.material_index = 2
            import bmesh
            bm = bmesh.new(); bm.from_mesh(cutter.data); bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(cutter.data); bm.free()
            mod = body.modifiers.new(label + "OpenCockpit", "BOOLEAN")
            mod.operation = "DIFFERENCE"
            mod.solver = "EXACT"
            mod.object = cutter
            mod.material_mode = "INDEX"
            self.Apply(body, mod)
            self.meshes.remove(cutter)
            bpy.data.objects.remove(cutter, do_unlink=True)
            for poly in body.data.polygons:
                if poly.material_index == 2:
                    poly.use_smooth = False
            rim = []
            for x, zz in outline:
                rim.append((x, self.Top(x, zz) + .007, zz))
            self.Tube(label + "PaddedLeatherCoaming", rim, .028, cockpit.get("rimFinish", "Leather"), 10 if self.high else self.bodyData.get("secondaryShoulder", {}).get("gameCoamingRadialSamples", 9), True)
            innerLip = [(x, self.Top(x, zz) - .033, zz)
                        for x, zz in self.OpeningOutline(label, z, rx - .032, rz - .032)]
            self.Tube(label + "RolledInteriorLip", innerLip, .012, "Aluminum", 8, True)
            linerVerts, linerFaces = [], []
            linerOutline = self.OpeningOutline(label, z, rx - .025, rz - .025)
            n = len(linerOutline)
            linerDepths = self.cockpitData[label]["linerDepthsM"]
            for depth in linerDepths:
                for x, zz in linerOutline:
                    linerVerts.append((x, self.Top(x, zz) - depth, zz))
            for level in range(len(linerDepths) - 1):
                for j in range(n):
                    a = level * n + j
                    b = level * n + (j + 1) % n
                    linerFaces.append((a, b, b + n, a + n))
            linerFaces.append(tuple(range(n * 2, n * 3)))
            lining = self.Mesh(label + "InteriorTub", linerVerts, linerFaces, "CockpitLining")
            wallFinish = cockpit.get("wallFinish", "Cockpit")
            lining.data.materials.append(self.materials[wallFinish])
            for face in lining.data.polygons:
                if face.index < len(linerFaces) - 1:
                    face.material_index = 1
                elif face.index == len(linerFaces) - 1:
                    face.use_smooth = False
            lining["wallFinish"] = wallFinish
            lining["darkFloorPreserved"] = True
            self.CockpitSeat(label, z)
            self.Beam(label + "ControlColumn", (0, 1.78, z - .14), (0, 2.20, z - .27), .020, "Steel")
            self.Tube(label + "ControlGrip", [(-.08, 2.20, z - .27), (0, 2.24, z - .27), (.08, 2.20, z - .27)], .017, "Rubber")
            self.Box(label + "InstrumentPanel", (0, 2.08, z - .34), (.55, .25, .035), "CockpitLining", .015)
            for j, x in enumerate((-.20, -.07, .075, .21)):
                self.Beam(label + "GaugeBezel" + str(j), (x, 2.11, z - .318), (x, 2.11, z - .302), .044 if j in (1, 2) else .030, "Steel", 20)
                self.Beam(label + "GaugeFace" + str(j), (x, 2.11, z - .300), (x, 2.11, z - .297), .037 if j in (1, 2) else .023, "Ink", 20)
                self.Beam(label + "GaugeNeedle" + str(j), (x, 2.11, z - .294), (x + .015, 2.13, z - .294), .002, "Ivory", 6)
        # Differently shaped aluminium engine panels, with real seams and latches.
        for end in (-5.60, -3.69):
            pts = []
            w, cy, up, low = self.Section(end)
            count = 64 if self.high else 48
            for j in range(count):
                t = TAU * j / count
                s, c = StableSinCos(t)
                if end < -3.65:
                    power = self.CowlingPower(end)
                    x = math.copysign(abs(s) ** power, s) * (w + .0015)
                    y = cy + math.copysign(abs(c) ** power, c) * (up if c >= 0 else low) * 1.003
                else:
                    xx, yy = self.RectangularSection(t, up, low, end)
                    x, y = xx * (w + .0015), cy + yy * 1.003
                if c >= 0:
                    y += self.FrontCapOffset(x, end)
                pts.append((x, y, end))
            jointMaterial = "CowlingJoint" if self.cowlingData.get("jointFinish") else "Steel"
            self.Tube("CowlingPanelSeam" + str(end), pts, .0015, jointMaterial, 6, True)
        # The photograph shows a faint joint across the upper hood. It is a
        # thin top-panel joint, rather than a thick ring around the whole cowl.
        crossZ = -4.66
        width = self.Section(crossZ)[0] * self.HoodHalfWidthFraction(crossZ)
        cross = [(Lerp(-width, width, i / 32), self.Top(Lerp(-width, width, i / 32), crossZ) + .0008, crossZ)
                 for i in range(33)]
        self.Tube("CowlingTopCrossJoint", cross, .0015, jointMaterial, 6)
        crease = body.modifiers.new("AuthoredFabricPanelCreases", "EDGE_SPLIT")
        crease.use_edge_angle = False
        crease.use_edge_sharp = True
        self.Apply(body, crease)
        body["longitudinalPanelCreases"] = True
        for side in (-1, 1):
            edge, seam = [], []
            for j in range(33):
                z = Lerp(-5.63, -3.69, j / 32)
                w, cy, up, low = self.Section(z)
                fraction = self.HoodHalfWidthFraction(z)
                seamX, lipX = side * fraction * w, side * (fraction + .01) * w
                seam.append((seamX, self.Top(seamX, z) + .001, z))
                edge.append((lipX, self.Top(lipX, z) + .001, z))
            self.Tube("CowlingTopPanelSeam" + str(side), seam, .005, jointMaterial, 8)
            self.Tube("CowlingTopSideLip" + str(side), edge, .003, "Aluminum", 6)
            for z in (-5.10, -4.30, -3.78):
                self.Box("CowlingQuarterTurnFastener" + str(side) + str(z), (side * .568, 1.92, z), (.011, .038, .061), "Steel", .006)
            bankStart, bankSpacing = -5.382895, .19801032
            mountY, tipY = 2.13, 2.10
            portLip = []
            for j in range(25):
                z = Lerp(bankStart - .05, bankStart + bankSpacing * 5 + .05, j / 24)
                w, cy, up, low = self.Section(z)
                power = self.CowlingPower(z)
                q = min(.999, abs(mountY - cy) / up)
                skinX = w * (1 - q ** (2 / power)) ** (power / 2)
                portLip.append((side * (skinX + .003), mountY + .018, z))
            trimFinish = self.cowlingData.get("exhaustPortTrimFinish", {}).get("material", "Steel")
            self.Tube("ExhaustPortTrim" + str(side), portLip, .014, trimFinish, 8)
            for j in range(6):
                z = bankStart + j * bankSpacing
                w, cy, up, low = self.Section(z)
                power = self.CowlingPower(z)
                mountX = w * (1 - min(.999, abs(mountY - cy) / up) ** (2 / power)) ** (power / 2)
                tipX = .62709485 + j * .00822401
                a = Vector((side * (mountX - .015), mountY, z))
                b = Vector((side * Lerp(mountX, tipX, .70), mountY, z + .003))
                c = Vector((side * tipX, (mountY + tipY) / 2, z + .011))
                d = Vector((side * tipX, tipY, z + .012))
                bendEnd = d + Vector((0, .012, 0))
                steps = 11 if self.high else 6
                points = [tuple((1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t*t*c + t**3*bendEnd) for t in (k/steps for k in range(steps + 1))]
                points.append(tuple(d))
                pipe = self.Tube("ExhaustStack" + str(side) + str(j), points, .031, "Exhaust", 20 if self.high else 16, innerRadius=.028)
                pipe["tipPointM"] = list(d)
                pipe["tipDirectionM"] = list((d - Vector(points[-2])).normalized())
                pipe["tipOuterRadiusM"] = .031
                pipe["photoInferredBank"] = True
                axis = (b-a).normalized()
                self.Beam("ExhaustInnerShadow" + str(side) + str(j), tuple(a - axis * .006), tuple(a - axis * .003), .0315, "Ink", 16 if self.high else 12)
        self.root["cowlingScope"] = "Boxier hood corners and one coherent six-port bank fitted to visible contours; section extrema retained, exit tips kept outside the skin. Exact factory construction is unverified."
        self.root["hoodHalfWidthFraction"] = self.cowlingData["hoodHalfWidthFraction"]
        if self.cowlingData.get("hoodHalfWidthFractionStationsAftM"):
            self.root["hoodHalfWidthFractionStationsAftM"] = json.dumps(self.cowlingData["hoodHalfWidthFractionStationsAftM"])
        # Type II rounded suspended radiator, not the Type I frontal box.
        self.LowerNoseHousing()
        self.Box("RadiatorCore", (0, 1.31, -5.33), (.47, .25, .07), "Steel", .025)
        for j in range(22):
            x = -.22 + j * .44 / 21
            self.Beam("RadiatorVerticalFin" + str(j), (x, 1.20, -5.374), (x, 1.43, -5.374), .003, "Exhaust", 4)
        self.Beam("RadiatorPipeForward", (-.17, 1.28, -5.12), (-.17, 1.70, -5.12), .034, "Steel")
        self.Beam("RadiatorPipeAft", (.17, 1.28, -4.34), (.17, 1.70, -4.34), .034, "Steel")
        # Rear longeron seams remain finer than the padded cockpit edges.
        for side in (-1, 1):
            for fraction in (-.60, .60):
                pts = []
                for j in range(51):
                    z = -.5 + (self.sections[-1][0] + .44) * j / 50
                    w, cy, up, low = self.Section(z)
                    xFraction = .77 + .23 * (fraction + .8) / 1.6 + (self.BodySideBottomWidth(z) - .77) * (1 - (fraction + .8) / 1.6)
                    pts.append((side * (w * xFraction + .002), cy + fraction * (up if fraction > 0 else low), z))
                self.Tube("AftLongeronSeam" + str(side) + str(fraction), pts, .0035, "Fabric", 6)
        # Small curved windscreen, independent from the padded rim.
        verts, faces = [], []
        pilot = self.cockpitData["Pilot"]
        screenBaseZ = pilot.get("centreAftM", -1.35) - pilot.get("openingHalfAftM", .455) + .095
        for level in (0, 1):
            for j in range(17):
                t = -PI / 2 + PI * j / 16
                x = .34 * math.sin(t)
                z = screenBaseZ - .10 * math.cos(t) + level * .08
                baseY = self.Top(x, screenBaseZ - .10 * math.cos(t)) + .014
                verts.append((x, baseY + level * .16 * (.35 + .65 * math.cos(t)), z))
        for j in range(16):
            faces.append((j, j + 1, j + 18, j + 17))
        self.Mesh("PilotCurvedWindscreen", verts, faces, "Glass")
        screenFrameFinish = self.cockpitData.get("windscreenFrameFinish", {}).get("material", "Steel")
        for side, index in ((-1, 0), (1, 16)):
            self.Beam("WindscreenSideFrame" + str(side), verts[index], verts[index + 17], .009, screenFrameFinish)
        self.Tube("WindscreenTopFrame", [(v[0], v[1], v[2]) for v in verts[17:]], .011, screenFrameFinish, 8)
        self.root["cockpitScope"] = "Apertures, rolled inner lips, curved seat shells and visible frames reconstructed from the museum photograph; hidden equipment and exact dimensions remain inferred."
        if self.bodyData.get("sideTaper"):
            self.root["bodySideTaper"] = json.dumps(self.bodyData["sideTaper"])
        self.CorrectObserverUpperDeck()
        self.RoundRoofShoulder()
        self.CanonicalizeBodyCentreline()
        self.RoundSecondaryShoulder()

    def CanonicalizeBodyCentreline(self):
        # The analytic mirror plane is X=0; remove only floating trig residues.
        body = bpy.data.objects["AirframeFacetedFuselage"]
        for vertex in body.data.vertices:
            if 0 < abs(vertex.co.x) < 1e-12:
                vertex.co.x = 0.0
        body.data.update()
        self.root["bodyCentrelineCanonicalization"] = "Exact theoretical mirrorplane X=0 after body construction; floating trig residues below 1e-12m only."

    def RoundRoofShoulder(self):
        data = self.bodyData.get("roofShoulder")
        if not data:
            return
        import bmesh
        body = bpy.data.objects["AirframeFacetedFuselage"]
        mesh = bmesh.new()
        mesh.from_mesh(body.data)
        bmesh.ops.remove_doubles(mesh, verts=list(mesh.verts), dist=1e-7)
        bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
        assert all(edge.is_manifold for edge in mesh.edges)
        mesh.to_mesh(body.data)
        mesh.free()
        body.data.update()
        start, full, fall, end = map(float, data["radiusProfileAftM"])
        shoulderStart = float(data["transitionAftM"][1])

        def Corner(vertex):
            station = -vertex.co.y
            w, cy, up, low = self.Section(station)
            return shoulderStart <= station <= end + .05 and abs(abs(vertex.co.x) - w * self.RoofShoulderFraction(station)) < 2e-5 and vertex.co.z > cy + .9 * up

        def RadiusProfile(station):
            if station <= start or station >= end:
                return 0.
            if station < full:
                return Smooth((station - start) / round(full - start, 12))
            if station > fall:
                return Smooth((end - station) / round(end - fall, 12))
            return 1.

        weight = body.data.attributes.get("bevel_weight_edge") or body.data.attributes.new("bevel_weight_edge", "FLOAT", "EDGE")
        selected = []
        for edge in body.data.edges:
            vertices = [body.data.vertices[i] for i in edge.vertices]
            if all(Corner(vertex) for vertex in vertices):
                value = RadiusProfile(-sum(vertex.co.y for vertex in vertices) / 2)
                weight.data[edge.index].value = value
                if value > 0:
                    selected.append(edge.index)
        assert len(selected) > 20, len(selected)
        mod = body.modifiers.new("PhysicalSmoothRoofShoulder", "BEVEL")
        mod.width = float(data["rollOffsetM"])
        mod.segments = int(data["rollSegments"])
        mod.profile = .5
        mod.limit_method = "WEIGHT"
        mod.affect = "EDGES"
        mod.loop_slide = True
        mod.use_clamp_overlap = True
        if hasattr(mod, "edge_weight"):
            mod.edge_weight = "bevel_weight_edge"
        mod.harden_normals = True
        self.Apply(body, mod)
        mesh = bmesh.new()
        mesh.from_mesh(body.data)
        bmesh.ops.remove_doubles(mesh, verts=list(mesh.verts), dist=1e-7)
        bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
        assert all(edge.is_manifold for edge in mesh.edges)
        mesh.to_mesh(body.data)
        mesh.free()
        body.data.update()
        crease = body.modifiers.new("RoofShoulderCreases", "EDGE_SPLIT")
        crease.use_edge_angle = False
        crease.use_edge_sharp = True
        self.Apply(body, crease)
        self.root["roofShoulder"] = json.dumps(data)

    def RoundSecondaryShoulder(self):
        data = self.bodyData.get('secondaryShoulder', {})
        height = data.get('heightM', 0.0)
        if not height:
            return
        import bmesh
        ob = bpy.data.objects['AirframeFacetedFuselage']
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-07)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        assert all((e.is_manifold for e in bm.edges))
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
        weights = ob.data.attributes.get('bevel_weight_edge') or ob.data.attributes.new('bevel_weight_edge', 'FLOAT', 'EDGE')
        for v in weights.data:
            v.value = 0.0

        def Corner(v):
            z = -v.co.y
            w, cy, up, low = self.Section(z)
            roof = self.RoofShoulderFraction(z)
            return 0.55 <= z <= 3.4 and abs(abs(v.co.x) - w * (roof + (1 - roof) / 3)) < 2e-05 and (abs(v.co.z - (cy + 0.92 * up + height * self.SecondaryShoulderProfile(z))) < 2e-05)
        selected = []
        for edge in ob.data.edges:
            vertices = [ob.data.vertices[i] for i in edge.vertices]
            if all((Corner(v) for v in vertices)):
                weights.data[edge.index].value = self.SecondaryShoulderProfile(-sum((v.co.y for v in vertices)) / 2)
                selected.append(edge.index)
        assert len(selected) > 10, len(selected)
        mod = ob.modifiers.new('PhysicalSecondaryShoulder', 'BEVEL')
        mod.width = data['radiusM']
        mod.segments = int(data["highBevelSegments"] if self.high else data["gameBevelSegments"])
        mod.profile = 0.5
        mod.limit_method = 'WEIGHT'
        mod.affect = 'EDGES'
        mod.loop_slide = True
        mod.use_clamp_overlap = True
        mod.harden_normals = True
        if hasattr(mod, 'edge_weight'):
            mod.edge_weight = 'bevel_weight_edge'
        self.Apply(ob, mod)
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-07)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        assert all((e.is_manifold for e in bm.edges))
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
        split = ob.modifiers.new('SecondaryShoulderExistingCreases', 'EDGE_SPLIT')
        split.use_edge_angle = False
        split.use_edge_sharp = True
        self.Apply(ob, split)
        self.root['secondaryShoulder'] = json.dumps(data)

    def CorrectObserverUpperDeck(self):
        """Preserve topology while correcting the complete local upper station."""
        data = self.cockpitData.get("Observer", {}).get("upperDeckCorrection", {})
        rise = float(data.get("riseM", 0.))
        if not rise:
            return
        assert math.isfinite(rise) and abs(rise) <= .20, rise
        start, plateauStart, plateauEnd, end = map(float, data["profileAftM"])
        assert start < plateauStart < plateauEnd < end

        def Profile(station):
            if station <= start or station >= end:
                return 0.
            if station < plateauStart:
                return Smooth((station - start) / (plateauStart - start))
            if station > plateauEnd:
                return Smooth((end - station) / (end - plateauEnd))
            return 1.

        changed = []
        for ob in self.meshes:
            body = ob.name == "AirframeFacetedFuselage"
            shell = any(ob.name.startswith(label + suffix)
                        for label in ("Pilot", "Observer")
                        for suffix in ("PaddedLeatherCoaming", "RolledInteriorLip", "InteriorTub"))
            furniture = ob.name.startswith("Observer") and not shell
            upperSeam = (ob.name.startswith("AftLongeronSeam") and ob.name.endswith("0.6")
                         and not ob.name.endswith("-0.6"))
            if not (body or shell or furniture or upperSeam):
                continue
            inverse = ob.matrix_world.inverted()
            count = 0
            for vertex in ob.data.vertices:
                point = ob.matrix_world @ vertex.co
                station = -point.y
                w, cy, up, low = self.Section(station)
                if furniture:
                    delta = rise
                elif body:
                    delta = rise * Profile(station) * max(0., (point.z - cy) / up)
                elif shell:
                    delta = rise * Profile(station) * (self.Top(point.x, station) - cy) / up
                else:
                    delta = rise * Profile(station) * .60
                if abs(delta) < 1e-12:
                    continue
                point.z += delta
                vertex.co = inverse @ point
                count += 1
            ob.data.update()
            if count:
                changed.append(ob.name)
        self.root["observerUpperDeckCorrectionRiseM"] = rise
        self.root["observerUpperDeckCorrectionProfileAftM"] = [start, plateauStart, plateauEnd, end]
        self.root["observerUpperDeckCorrectionScope"] = data["scope"]
        self.Progress("CorrectedObserverUpperDeck", meshes=len(changed), riseM=rise)

    def LowerNoseHousing(self):
        data = self.cowlingData["lowerHousing"]
        centre = data["centreM"]
        profile = data["profileAftOffsetAndScale"]
        rings = []
        for a, b in zip(profile, profile[1:]):
            steps = max(2, math.ceil((b[0] - a[0]) / (.04 if self.high else .08)))
            for j in range(steps):
                t = j / steps
                rings.append((Lerp(a[0], b[0], t), Lerp(a[1], b[1], Smooth(t))))
        rings.append(tuple(profile[-1]))
        n = 48 if self.high else 32
        verts, faces, uvs = [], [], []
        for offset, scale in rings:
            for j in range(n + 1):
                t = TAU * j / n
                # Preserve the validated pocket tessellation in this housing.
                # Its .4-power endpoint residue is sub-micrometre; the cowl's
                # much smaller exponent is handled by StableSinCos above.
                s, c = math.sin(t), math.cos(t)
                x = centre[0] + math.copysign(abs(s) ** data["crossSectionPower"], s) * data["halfWidthM"] * scale
                y = centre[1] + math.copysign(abs(c) ** data["crossSectionPower"], c) * data["halfHeightM"] * scale
                verts.append((x, y, centre[2] + offset))
                uvs.append((j / n, (offset + .72) / 1.44))
        for i in range(len(rings) - 1):
            for j in range(n):
                a = i * (n + 1) + j
                faces.append((a, a + n + 1, a + n + 2, a + 1))
        faces.extend((tuple(range(n, -1, -1)), tuple((len(rings) - 1) * (n + 1) + j for j in range(n + 1))))
        ob = self.Mesh("TypeIIBellyRadiatorFairing", verts, faces, "LowerHousing", uvs=uvs)
        ob["uvExtentM"] = (2.6, 1.44)
        ob["lowerHousingScope"] = data["scope"]
        if data.get("openings"):
            self.LowerHousingOpenings(ob, data["openings"])
        self.root["lowerHousingReconstructionPending"] = True
        return ob

    def LowerHousingOpenings(self, housing, openings):
        """Real closed recesses; the camera sees inner walls, never background."""
        data = self.cowlingData["lowerHousing"]
        finish = data.get("openingFinish", {}).get("material", "CockpitLining")
        if self.materials[finish] not in list(housing.data.materials):
            housing.data.materials.append(self.materials[finish])
        liningIndex = list(housing.data.materials).index(self.materials[finish])
        for opening in openings:
            for mirrored, suffix in ((False, "Near"), (True, "FarInferred")):
                points, normals = [], []
                for point, normal in zip(opening["surfacePolygonM"], opening["surfaceNormalsM"]):
                    point, normal = Vector(point), Vector(normal)
                    if mirrored:
                        point.x, normal.x = -point.x, -normal.x
                    points.append(point)
                    normals.append(normal.normalized())
                count = len(points)
                verts = [tuple(point + normal * data["openingOuterMarginM"]) for point, normal in zip(points, normals)]
                verts += [tuple(point - normal * data["openingPocketDepthM"]) for point, normal in zip(points, normals)]
                faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
                faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
                tool = self.Mesh("ToolLowerOpening" + opening["id"] + suffix, verts, faces, None, smooth=False)
                for material in housing.data.materials:
                    tool.data.materials.append(material)
                for polygon in tool.data.polygons:
                    polygon.material_index = liningIndex
                import bmesh
                mesh = bmesh.new(); mesh.from_mesh(tool.data); bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces)); mesh.to_mesh(tool.data); mesh.free()
                modifier = housing.modifiers.new("ActualLowerOpening" + opening["id"] + suffix, "BOOLEAN")
                modifier.operation = "DIFFERENCE"
                modifier.solver = "EXACT"
                modifier.object = tool
                modifier.material_mode = "INDEX"
                self.Apply(housing, modifier)
                self.meshes.remove(tool)
                bpy.data.objects.remove(tool, do_unlink=True)
        for polygon in housing.data.polygons:
            if polygon.material_index == liningIndex:
                polygon.use_smooth = False
        housing["realRecessCount"] = len(openings) * 2
        housing["openingScope"] = "Visible mouth boundaries traced to the actual lower enclosure. Recess depth and mirrored opposite-side mouths are inferred; no photographic colour or shadow is used."

    def CockpitSeat(self, label, z):
        """Rounded pan and a closed, leaning bucket back; no painted interior."""
        pilot = label == "Pilot"
        data = self.cockpitData[label]
        panY = data.get("panHeightM", 2.13 if pilot else 1.99)
        panAft = data.get("panAftOffsetM", .075 if pilot else .005)
        halfWidth = data.get("seatHalfWidthM", .205 if pilot else .155)
        pan = self.Box(label + "SeatPan", (0, panY, z + panAft),
                       (halfWidth * 2, .055, data.get("panLengthM", .46 if pilot else .32)),
                       data.get("panFinish", "Cockpit" if pilot else "CockpitLining"), .025)
        panCentre = P((0, panY, z + panAft))
        panTilt = Matrix.Rotation(math.radians(data.get("panTiltDegrees", -7 if pilot else -3)), 3, "X")
        def TiltPanPart(ob):
            for vertex in ob.data.vertices:
                vertex.co = panCentre + panTilt @ (vertex.co - panCentre)
        TiltPanPart(pan)
        verts, faces = [], []
        count = 16 if self.high else 10
        levels = [(panY - .04, .22 if pilot else .11, .90),
                  (panY + .14, .31 if pilot else .19, 1.00),
                  (panY + .24, .36 if pilot else .23, .94)]
        for side in (-1, 1):
            for level, (height, aft, widthScale) in enumerate(levels):
                for j in range(count + 1):
                    u = -1 + 2 * j / count
                    x = halfWidth * widthScale * u
                    y = height - (.038 if level == 2 else .006) * u * u
                    backCentre = data.get("backAftCentreM", 0)
                    backAft = backCentre + (aft - .065 * u * u - backCentre) * data.get("backAftScale", 1)
                    zz = z + backAft + data.get("backAftOffsetM", 0) + side * .013
                    verts.append((x, y, zz))
        layer = len(levels) * (count + 1)
        for side in range(2):
            for level in range(len(levels) - 1):
                for j in range(count):
                    a = side * layer + level * (count + 1) + j
                    face = (a, a + 1, a + count + 2, a + count + 1)
                    faces.append(face if side == 0 else tuple(reversed(face)))
        for level in (0, len(levels) - 1):
            for j in range(count):
                a = level * (count + 1) + j
                faces.append((a, a + layer, a + layer + 1, a + 1))
        for j in (0, count):
            for level in range(len(levels) - 1):
                a = level * (count + 1) + j
                faces.append((a, a + count + 1, a + count + 1 + layer, a + layer))
        shell = self.Mesh(label + "SeatBack", verts, faces, "Cockpit")
        skinFaces = 2 * (len(levels) - 1) * count
        for face in shell.data.polygons:
            if face.index >= skinFaces:
                face.use_smooth = False
        top = verts[(len(levels) - 1) * (count + 1):len(levels) * (count + 1)]
        frameFinish = data.get("frameFinish", "Steel")
        self.Tube(label + "SeatBackRolledEdge", top, .009, frameFinish, 8)
        for side in (-1, 1):
            sideRail = data.get("sideRailPointsRelativeM",
                               [(1, .035, -.14), (1, .11, .09), (.94, .20, .29 if pilot else .17)])
            self.Tube(label + "SeatSideRail" + str(side),
                      [(side * halfWidth * widthScale, panY + height, z + aft)
                       for widthScale, height, aft in sideRail],
                      .012, frameFinish, 8)
            # A lap belt crosses the seat laterally. The former long strips
            # ran fore/aft and produced two conspicuous invented shoulder bars
            # in the selected museum view.
            belt = self.Box(label + "LapBelt" + str(side),
                            (side * halfWidth * .55, panY + .042, z + panAft),
                            (halfWidth * .90, .008, .032), data.get("beltFinish", "Leather"), .003)
            TiltPanPart(belt)
        buckle = self.Box(label + "BeltBuckle", (0, panY + .055, z + panAft),
                          (.040, .012, .036), frameFinish, .004)
        TiltPanPart(buckle)

    def OpeningOutline(self, label, z, rx, rz):
        if label != "Pilot":
            return [(rx * math.cos(TAU * i / 96), z + rz * math.sin(TAU * i / 96)) for i in range(96)]
        # The main reference has a flat forward lip, rounded front corners,
        # short parallel sides and a rounded aft end, rather than a porthole.
        a = rx * .62
        cornerX, cornerZ, sideEnd = rx - a, rz * .31, rz * .04
        out = []
        out += [(Lerp(-a, a, i / 8), z - rz) for i in range(8)]
        out += [(a + cornerX * math.cos(-PI / 2 + PI / 2 * i / 8), z - rz + cornerZ + cornerZ * math.sin(-PI / 2 + PI / 2 * i / 8)) for i in range(8)]
        out += [(rx, z + Lerp(-rz + cornerZ, sideEnd, i / 8)) for i in range(8)]
        out += [(rx * math.cos(PI * i / 24), z + sideEnd + (rz - sideEnd) * math.sin(PI * i / 24)) for i in range(24)]
        out += [(-rx, z + Lerp(sideEnd, -rz + cornerZ, i / 8)) for i in range(8)]
        out += [(-a + cornerX * math.cos(PI + PI / 2 * i / 8), z - rz + cornerZ + cornerZ * math.sin(PI + PI / 2 * i / 8)) for i in range(8)]
        return out

    def LowerRootCutDepth(self, x):
        data = self.wingData.get("lowerRootCutout")
        if not data or abs(x) >= data["outerSpanM"]:
            return 0.
        t = max(0., (abs(x) - data["innerSpanM"]) / (data["outerSpanM"] - data["innerSpanM"]))
        return data["maximumDepthM"] * max(0., 1 - t * t)

    def WingPoint(self, x, u, upper=True, top=True):
        halfSpan = 7.5 if upper else 6.24
        chord = 2.092026 if upper else 1.72
        lead = -3.653094 if upper else -2.995
        tipStart = halfSpan - .50
        factor = 1.0
        if abs(x) > tipStart:
            t = min(.99999, (abs(x) - tipStart) / (halfSpan - tipStart))
            factor = math.sqrt(1 - t * t)
        # Elliptic tip cap, constant chord centre. The upper central cut-out
        # and optional lower root aft notch are separate physical contours.
        localLead = lead + chord * (1 - factor) / 2
        localChord = chord * factor
        if upper and abs(x) < .80:
            cut = .43 * max(0, 1 - (abs(x) / .80) ** 2) ** .6
            localChord -= cut
        if not upper:
            localChord -= self.LowerRootCutDepth(x)
        z = localLead + localChord * u
        y = (3.106 if upper else 1.32) + .018 * abs(x)
        # Planform was fitted independently from the painted roundels. Retain
        # the original absolute airfoil depth and the 3.38 m height anchor.
        thickness = .115 * 1.88 / chord if upper else .11
        yt = 5 * thickness * localChord * (0.2969 * math.sqrt(max(u, .000001)) - .1260 * u - .3516 * u * u + .2843 * u ** 3 - .1036 * u ** 4)
        camber = .024 * (1.88 / chord if upper else 1) * localChord * math.sin(PI * u)
        # Broad cloth deflection between ribs instead of narrow hard corrugations.
        fabric = self.wingData["upperFabric" if upper else "lowerFabric"]
        ribWave = .5 * math.cos(TAU * abs(x) / fabric["ribPitchM"])
        if fabric.get("reliefZeroAtRibs", False):
            ribWave -= .5
        sag = fabric["ribReliefM"] * factor * ribWave * math.sin(PI * u) ** .8
        y += camber + (yt * (1 if top else -1)) + sag * (1 if top else -.35)
        return (x, y, z)

    def WingPatch(self, name, x0, x1, u0, u1, upper, parent=None):
        step = self.wingData["upperFabric" if upper else "lowerFabric"]["ribPitchM"] / (8 if self.high else 4)
        low, high = min(x0, x1), max(x0, x1)
        xs = [x0, x1] + [i * step for i in range(math.ceil(low / step), math.floor(high / step) + 1) if low + 1e-7 < i * step < high - 1e-7]
        xs = sorted(set(xs), reverse=x1 < x0)
        nx = len(xs) - 1
        nu = max(4, int((u1 - u0) * (44 if self.high else 15)))
        if name.startswith("Aileron"):
            nu = max(nu, 24 if self.high else 10)
        verts, uvs, faces, surfaceParams = [], [], [], []
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
                        axisY = center.z + .018 * (abs(x) - abs(center.x))
                        axisZ = -center.y
                        radius = float(parent.get("noseRadiusM", .070 if upper else .065))
                        dz = point[2] - axisZ
                        if dz < 0:
                            yy = math.sqrt(max(0, radius * radius - dz * dz))
                            point = (point[0], axisY + (1 if layer == 0 else -1) * yy, point[2])
                        elif dz < .06:
                            roundY = axisY + (1 if layer == 0 else -1) * radius
                            point = (point[0], Lerp(roundY, point[1], Smooth(dz / .06)), point[2])
                    verts.append(point)
                    uvs.append(((x + 7.5) / 15, u if layer == 0 else 1 - u))
                    surfaceParams.append((x, u, 1 if layer == 0 else -1))
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
        ob = self.Mesh(name, verts, faces, "UpperWing" if upper else "LowerWingFabric", uvs=uvs, parent=parent)
        ob.data.materials.append(self.materials["Fabric" if upper else "LowerUnderside"])
        topFaceCount = nx * nu
        analyticSkin = upper and not self.high and self.wingData["upperFabric"].get("gameAnalyticSkinNormals", False)
        if analyticSkin:
            params = ob.data.attributes.new("WingSurfaceParam", "FLOAT_VECTOR", "POINT")
            for datum, values in zip(params.data, surfaceParams):
                datum.vector = values
            skin = ob.data.attributes.new("WingSurfaceSkin", "BOOLEAN", "FACE")
            for poly in ob.data.polygons:
                skin.data[poly.index].value = poly.index < topFaceCount * 2
            ob["continuousWingSkinNormals"] = True
            ob["continuousWingMovingNose"] = bool(parent and name.startswith("Aileron"))
            ob["continuousWingNormalScope"] = "Game skin normals follow the same real WingPoint surface; cutout,nose,tip and caps retain geometric shading. Not photograph-derived normals."
        for poly in ob.data.polygons:
            if topFaceCount <= poly.index < 2 * topFaceCount:
                poly.material_index = 1
            if poly.index >= 2 * topFaceCount:
                # Closed patch caps are structural boundaries, not part of the
                # smooth airfoil skin. Averaging them into the skin creates
                # false bright ribs and a broad shiny aileron seam.
                poly.use_smooth = False
        return ob

    def Wings(self):
        if self.wingData.get("lowerRootCutout"):
            self.root["lowerRootCutout"] = json.dumps(self.wingData["lowerRootCutout"])
        self.WingPatch("UpperWingCentreWithPilotCutout", -.80, .80, 0, 1, True)
        if self.wingData.get("centreFitting"):
            self.CentreCutoutFitting()
        # The upper aileron's visible split is much farther aft and its inner
        # end farther outboard than the former generic layout. These values
        # come from both visible halves of the selected museum photograph;
        # they are not factory dimensions. Keep the outer wing/paint fixed.
        upperData, lowerData = self.wingData["upperAileron"], self.wingData["lowerAileron"]
        upperAileronStart, upperAileronEnd = upperData["spanStartM"], upperData["spanEndM"]
        upperFixedEndU, upperMovingStartU = upperData["fixedEndU"], upperData["movingStartU"]
        upperNoseRadius = upperData["noseRadiusM"]
        lowerAileronStart, lowerAileronEnd = lowerData["spanStartM"], lowerData["spanEndM"]
        lowerFixedEndU, lowerMovingStartU = lowerData["fixedEndU"], lowerData["movingStartU"]
        lowerNoseRadius = lowerData["noseRadiusM"]
        for side, suffix in ((-1, "Left"), (1, "Right")):
            self.WingPatch("UpperWingInner" + suffix, side * .80, side * upperAileronStart, 0, 1, True)
            self.WingPatch("UpperWingOuter" + suffix, side * upperAileronStart, side * upperAileronEnd, 0, upperFixedEndU, True)
            self.WingPatch("UpperWingFixedTip" + suffix, side * upperAileronEnd, side * 7.50, 0, 1, True)
            hingeZ = -3.653094 + 2.092026 * upperMovingStartU + upperNoseRadius
            hingeY = sum(self.WingPoint(side * upperAileronStart, upperFixedEndU, True, top)[1] for top in (True, False)) / 2
            tilt = math.atan(side * .018)
            pivot = self.Hinge("Aileron" + suffix, (side * upperAileronStart, hingeY, hingeZ), tilt)
            pivot["noseRadiusM"] = upperNoseRadius
            pivot["rangeDegrees"] = [-22.0, 18.0]
            self.controls["Aileron" + suffix] = pivot
            # An 8.2 mm chord gap permits a real hinge, with no overlapping skins.
            self.WingPatch("Aileron" + suffix, side * (upperAileronStart + .01), side * (upperAileronEnd - .01), upperMovingStartU, 1, True, pivot)
            for j in range(6):
                x = side * Lerp(upperAileronStart + .15, 6.80, j / 5)
                y = hingeY + .018 * (abs(x) - upperAileronStart)
                self.Beam("AileronHinge" + suffix + str(j), (x - .024, y - side * .018 * .024, hingeZ),
                          (x + .024, y + side * .018 * .024, hingeZ), .012, "Steel", 12)
            # Locate the lower seam independently. The old generic split and
            # 65 mm rolled nose made a wide dark groove outside the photo seam.
            self.WingPatch("LowerWingInner" + suffix, side * .48, side * lowerAileronStart, 0, 1, False)
            self.WingPatch("LowerWingOuter" + suffix, side * lowerAileronStart, side * lowerAileronEnd, 0, lowerFixedEndU, False)
            self.WingPatch("LowerWingFixedTip" + suffix, side * lowerAileronEnd, side * 6.24, 0, 1, False)
            lowerHingeZ = -2.995 + 1.72 * lowerMovingStartU + lowerNoseRadius
            lowerHingeY = sum(self.WingPoint(side * lowerAileronStart, lowerFixedEndU, False, top)[1] for top in (True, False)) / 2
            lowerPivot = self.Hinge("AileronLower" + suffix, (side * lowerAileronStart, lowerHingeY, lowerHingeZ), tilt)
            lowerPivot["noseRadiusM"] = lowerNoseRadius
            lowerPivot["rangeDegrees"] = [-22., 18.]
            lowerPivot["coupledTo"] = pivot.name
            self.controls["AileronLower" + suffix] = lowerPivot
            self.WingPatch("AileronLower" + suffix, side * (lowerAileronStart + .01), side * (lowerAileronEnd - .01), lowerMovingStartU, 1, False, lowerPivot)
            for j in range(5):
                x = side * Lerp(lowerAileronStart + .15, lowerAileronEnd - .20, j / 4)
                y = lowerHingeY + .018 * (abs(x) - lowerAileronStart)
                self.Beam("LowerAileronHinge" + suffix + str(j), (x - .024, y - side * .018 * .024, lowerHingeZ),
                          (x + .024, y + side * .018 * .024, lowerHingeZ), .012, "Steel", 12)
            # The open gap previously showed the viewer's pale background as
            # a bright line. A concealed stationary web closes that line below
            # the rolled nose without replacing the actual movable surface.
            webData = lowerData["gapWeb"]
            webZ0 = -2.995 + 1.72 * lowerFixedEndU - webData["fixedUnderlapM"]
            webZ1 = -2.995 + 1.72 * lowerMovingStartU - webData["movingClearanceM"]
            webVerts = []
            for depth in (webData["topBelowAxisM"], webData["topBelowAxisM"] + webData["thicknessM"]):
                for x, zz in ((side * (lowerAileronStart + .01), webZ0),
                              (side * (lowerAileronEnd - .01), webZ0),
                              (side * (lowerAileronEnd - .01), webZ1),
                              (side * (lowerAileronStart + .01), webZ1)):
                    webVerts.append((x, lowerHingeY + .018 * (abs(x) - lowerAileronStart) - depth, zz))
            web = self.Mesh("LowerAileronGapWeb" + suffix, webVerts,
                            [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
                             (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)],
                            "CockpitLining", smooth=False)
            web["aileronGapClosure"] = True
            web["constructionScope"] = webData["scope"]
            # Equal horn offsets make the external pushrod translate at constant
            # length while the upper and lower ailerons rotate through one angle.
            hornX = side * 3.30
            upperAxisPoint = (hornX, hingeY + .018 * (abs(hornX) - upperAileronStart), hingeZ)
            lowerAxisPoint = (hornX, lowerHingeY + .018 * (abs(hornX) - lowerAileronStart), lowerHingeZ)
            upperHorn = (hornX - math.sin(tilt) * .11, upperAxisPoint[1] + math.cos(tilt) * .11, hingeZ + .10)
            lowerHorn = (hornX - math.sin(tilt) * .11, lowerAxisPoint[1] + math.cos(tilt) * .11, lowerHingeZ + .10)
            linkageMaterial = self.wingData.get("exposedLinkageFinish", {}).get("material", "Steel")
            self.Beam("UpperAileronLinkHorn" + suffix, upperAxisPoint, upperHorn, .014, linkageMaterial, 10, parent=pivot)
            self.Beam("LowerAileronLinkHorn" + suffix, lowerAxisPoint, lowerHorn, .014, linkageMaterial, 10, parent=lowerPivot)
            rod = self.Beam("AileronExternalPushrod" + suffix, lowerHorn, upperHorn, .011, linkageMaterial, 10)
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
            a = (side * 4.13, 1.39, -2.275)
            b = self.WingPoint(side * 4.42, .383, True, False)
            self.Beam("InterplaneIBeam" + suffix, a, b, .07, "Aluminum", 12, 2.1)
            self.Beam("LongDiagonalStrut" + suffix, (side * .55, 1.51, -2.005), b, .035, "Aluminum", 12)
            forwardCabane = self.WingPoint(side * .77, .13, True, False)
            aftCabane = self.WingPoint(side * .77, .80, True, False)
            self.Beam("CabaneForward" + suffix, (side * .52, 2.32, -3.67), forwardCabane, .031, "Aluminum")
            self.Beam("CabaneAft" + suffix, (side * .50, 2.34, -2.12), aftCabane, .031, "Aluminum")
            self.Beam("CabaneCrossBrace" + suffix, (side * .52, 2.32, -3.67), aftCabane, .004, "Steel", 6)
            self.Beam("LandingWire" + suffix, forwardCabane, (side * 4.13, 1.40, -2.325), .008, "Steel", 6)
            self.Beam("FlyingWire" + suffix, (side * .53, 1.50, -2.775), b, .008, "Steel", 6)
            for x, y, z in (a, b, (side * .55, 1.51, -2.005)):
                self.Ellipsoid("StrutClevis" + suffix + str(z), (x, y, z), (.065, .055, .055), "Steel", 16, 8)
        # Root fairings and centre-section fuel filler.
        for side in (-1, 1):
            self.Tube("LowerWingRootFillet" + str(side), [(side * .53, 1.52, -2.995), (side * .61, 1.47, -2.625),
                                                          (side * .62, 1.43, -2.125), (side * .52, 1.40, -1.275 - self.LowerRootCutDepth(.52))], .055, "Aluminum", 10)
        self.Beam("UpperWingFuelFiller", (0, 3.23, -3.383), (0, 3.29, -3.383), .065, "Aluminum", 24)

    def CentreCutoutFitting(self):
        """Visible raised fitting with three real, closed shallow depressions."""
        data = self.wingData["centreFitting"]
        centre = Vector(data["centreM"])
        angle = math.radians(data["spanToAftDegrees"])
        span = Vector((math.cos(angle), 0, math.sin(angle)))
        aft = Vector((-math.sin(angle), 0, math.cos(angle)))
        up = Vector((0, 1, 0))
        halfLength, halfWidth, halfHeight = data["lengthSpanM"] / 2, data["widthAftM"] / 2, data["thicknessM"] / 2
        vertices = [tuple(centre + span * x + aft * z + up * y)
                    for y in (-halfHeight, halfHeight)
                    for x, z in ((-halfLength, -halfWidth), (halfLength, -halfWidth),
                                 (halfLength, halfWidth), (-halfLength, halfWidth))]
        plate = self.Mesh("CentreCutoutRaisedFitting", vertices,
                          [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4),
                           (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], "Cockpit", smooth=False)
        plate.data.materials.append(self.materials["CockpitLining"])
        edge = plate.modifiers.new("SmallOuterEdgeRadius", "BEVEL")
        edge.width, edge.segments = .0015, 2 if self.high else 1
        self.Apply(plate, edge)
        import bmesh
        for index, offset in enumerate(data["recessSpanOffsetsM"]):
            mouth = centre + span * offset + aft * data["recessAftOffsetM"] + up * halfHeight
            cutter = self.Beam("ToolCentreFittingRecess" + str(index),
                               tuple(mouth - up * data["recessDepthM"]), tuple(mouth + up * .02),
                               data["recessRadiusM"], None, 24 if self.high else 16)
            for material in plate.data.materials:
                cutter.data.materials.append(material)
            for polygon in cutter.data.polygons:
                polygon.material_index = 1
            mesh = bmesh.new(); mesh.from_mesh(cutter.data); bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces)); mesh.to_mesh(cutter.data); mesh.free()
            modifier = plate.modifiers.new("ClosedCentreDepression" + str(index), "BOOLEAN")
            modifier.operation, modifier.solver, modifier.object = "DIFFERENCE", "EXACT", cutter
            modifier.material_mode = "INDEX"
            self.Apply(plate, modifier)
            self.meshes.remove(cutter)
            bpy.data.objects.remove(cutter, do_unlink=True)
        plate["recessCount"] = len(data["recessSpanOffsetsM"])
        plate["constructionScope"] = data["scope"]
        self.root["centreFittingScope"] = data["scope"]

    def Foil(self, name, outline, thickness=.055, vertical=False, parent=None, material="Fabric", height=2.04, hingeLeadingAft=None, matingAft=None, matingSpan=None, matingBevelM=None):
        # Outline is (span-or-height, aft). Real thin airfoils have closed sides.
        verts, faces, uvs = [], [], []
        n = len(outline)
        for side in (-1, 1):
            for a, z in outline:
                verts.append((side * thickness / 2, a, z) if vertical else (a, height + side * thickness / 2, z))
                u = (z - 4.1) / 2.2
                uvs.append((((.5 + (1 - u) * .5) if side > 0 else u * .5), (a - 1.70) / 1.60) if vertical else ((a + 2.5) / 5, (z - 4.1) / 2.2))
        # Concave root shapes are triangulated by Blender/glTF, not fan-filled.
        faces.extend((tuple(range(n - 1, -1, -1)), tuple(range(n, n * 2))))
        for j in range(n):
            faces.append((j, (j + 1) % n, (j + 1) % n + n, j + n))
        ob = self.Mesh(name, verts, faces, "Fin" if vertical else "Tail", uvs=uvs, parent=parent)
        mod = ob.modifiers.new("TailSurfaceEdgeRadius", "BEVEL")
        mod.width = thickness * .30
        mod.segments = 3 if self.high else (1 if name == "Rudder" else 2)
        if hingeLeadingAft is not None or matingAft is not None or matingSpan is not None:
            mod.limit_method = "WEIGHT"
            weights = ob.data.attributes.new("bevel_weight_edge", "FLOAT", "EDGE")
            for edge in ob.data.edges:
                leading = hingeLeadingAft is not None and all(abs(-ob.data.vertices[i].co.y - hingeLeadingAft) < .000001 for i in edge.vertices)
                mating = ((matingAft is not None and all(abs(-ob.data.vertices[i].co.y - matingAft) < .000001 for i in edge.vertices)) or
                          (matingSpan is not None and all(abs(ob.data.vertices[i].co.x - matingSpan) < .000001 for i in edge.vertices)))
                weight = min(1., max(0., matingBevelM / mod.width)) if mating and matingBevelM is not None else 1.
                weights.data[edge.index].value = 0 if leading else weight
            for poly in ob.data.polygons:
                if hingeLeadingAft is not None and all(abs(-ob.data.vertices[i].co.y - hingeLeadingAft) < .000001 for i in poly.vertices):
                    poly.use_smooth = False
        if matingBevelM is not None:
            ob["matingEdgeBevelM"] = matingBevelM
            ob["matingEdgeScope"] = "Smaller radius only at the stationary elevator-mating edges. Nominal outline,thickness,hinge gaps and pivot remain; radius is photo-derived,not factory-verified."
        self.Apply(ob, mod)
        for poly in ob.data.polygons:
            normal = poly.normal.x if vertical else poly.normal.z
            if abs(normal) > .999999:
                poly.use_smooth = False
        ob["planarSkinNormals"] = True
        return ob

    def TailMovingSurface(self, suffix, side, pivot, data):
        frame, plan, mechanics = data["frame"], data["planform"], data["mechanics"]
        midY, axisZ = frame["midHeightM"], frame["hingeAxisAftM"]
        span, corner = frame["halfSpanM"], frame["hornSplitSpanM"]
        radius = mechanics["hingeNoseRadiusM"]
        hornRoot = corner + mechanics["hornSideGapM"] / 2
        innerFront, innerBack = plan["movingInnerLeadingSpanM"], plan["movingInnerTrailingSpanM"]
        def Trailing(x):
            if x <= corner:
                return plan["trailingInnerAftM"]
            q = min(1., (x - corner) / (span - corner))
            return plan["trailingTipAftM"] + (plan["trailingInnerAftM"] - plan["trailingTipAftM"]) * math.sqrt(max(0., 1 - q * q))
        def Leading(x):
            q = min(1., max(0., (x - corner) / (span - corner)))
            return plan["leadingTipAftM"] - (plan["leadingTipAftM"] - plan["leadingHornAftM"]) * math.sqrt(max(0., 1 - q * q))
        def Loft(name, xs, front, back, frontKind):
            chordSteps = 18 if self.high else 10
            verts, faces, uvs = [], [], []
            stride = chordSteps + 1
            layerSize = len(xs) * stride
            for layer in (0, 1):
                for t in xs:
                    if frontKind == "body":
                        xFront = Lerp(innerFront, span, t)
                        xBack = Lerp(innerBack, span, t)
                        zFront, zBack = axisZ, Trailing(xBack)
                    else:
                        xFront = xBack = t
                        zFront, zBack = Leading(t), axisZ
                    for j in range(chordSteps + 1):
                        u = (1 - math.cos(PI * j / chordSteps)) / 2
                        x, z = Lerp(xFront, xBack, u), Lerp(zFront, zBack, u)
                        if frontKind == "body":
                            q = Smooth(min(1., max(0., (zBack - z) / .08)))
                        else:
                            q = math.sqrt(Smooth(min(1., max(0., (z - zFront) / .05))))
                        half = mechanics["trailingEdgeThicknessM"] / 2 + (radius - mechanics["trailingEdgeThicknessM"] / 2) * q
                        verts.append((side * x, midY + (1 if layer == 0 else -1) * half, z))
                        uvs.append(((side * x + 2.5) / 5, (z - 4.1) / 2.2))
            for layer in (0, 1):
                for i in range(len(xs) - 1):
                    for j in range(chordSteps):
                        a = layer * layerSize + i * stride + j
                        f = (a, a + stride, a + stride + 1, a + 1)
                        faces.append(f if layer == 0 else tuple(reversed(f)))
            for i in range(len(xs) - 1):
                a, b = i * stride, (i + 1) * stride
                faces.extend(((a, a + layerSize, b + layerSize, b),
                              (a + chordSteps, b + chordSteps, b + chordSteps + layerSize, a + chordSteps + layerSize)))
            for i in (0, len(xs) - 1):
                for j in range(chordSteps):
                    a = i * stride + j
                    faces.append((a, a + 1, a + 1 + layerSize, a + layerSize))
            ob = self.Mesh(name, verts, faces, "Tail", uvs=uvs, parent=pivot)
            skinFaces = (len(xs) - 1) * chordSteps * 2
            for poly in ob.data.polygons:
                if poly.index >= skinFaces or abs(poly.normal.z) > .999999:
                    poly.use_smooth = False
            ob["planarSkinNormals"] = True
            return ob
        bodySteps = 24 if self.high else 6
        bodyTs = sorted(set([i / bodySteps for i in range(bodySteps + 1)] + [(corner - innerBack) / (span - innerBack)]))
        cornerSteps = 18 if self.high else 6
        bodyTs = sorted(set(bodyTs + [(corner + (span - corner) * math.sin(PI * i / (2 * cornerSteps)) - innerBack) / (span - innerBack)
                                     for i in range(1, cornerSteps + 1)]))
        body = Loft("Elevator" + suffix, bodyTs, None, None, "body")
        hornSteps = 16 if self.high else 6
        hornXs = [Lerp(hornRoot, span, math.sin(PI * i / (2 * hornSteps))) for i in range(hornSteps + 1)]
        horn = Loft("Elevator" + suffix + "ForwardBalance", hornXs, None, None, "horn")
        noseSides = 20 if self.high else 12
        nose = self.Beam("Elevator" + suffix + "RoundHingeNose", (side * innerFront, midY, axisZ),
                         (side * hornRoot, midY, axisZ), radius, "Tail", noseSides, parent=pivot)
        uv = nose.data.uv_layers[0]
        for poly in nose.data.polygons:
            if poly.index >= noseSides:
                poly.use_smooth = False
            for cornerIndex, loop in enumerate(poly.loop_indices):
                co = nose.data.vertices[nose.data.loops[loop].vertex_index].co
                x, y, z = co.x, co.z, -co.y
                if poly.index < noseSides:
                    phase = poly.index + (1 if cornerIndex in (1, 2) else 0)
                    uv.data[loop].uv = ((x + 2.5) / 5, .5 + phase / noseSides * TAU * radius / 2.2)
                else:
                    uv.data[loop].uv = (.5 + (y - midY) / 5, .5 + (z - axisZ) / 2.2)
        # These are rigid skin portions of one elevator, with the nose and
        # forward aerodynamic balance moving around the same real hinge.
        bpy.ops.object.select_all(action="DESELECT")
        for ob in (body, horn, nose):
            ob.select_set(True)
        bpy.context.view_layer.objects.active = body
        deadNames = (horn.name, nose.name)
        bpy.ops.object.join()
        for name in deadNames:
            self.parts.pop(name, None)
        self.meshes = [ob for ob in self.modelColl.objects if ob.type == "MESH"]
        return body

    def Tail(self):
        data = json.loads((self.modelDir / "Data_KawasakiType88Tail.json").read_text(encoding="utf-8"))
        frame, plan, mechanics = data["frame"], data["planform"], data["mechanics"]
        # Fixed, photo-fitted alignment of this museum-reference reconstruction.
        # It is not a claim about the original aircraft's factory installation,
        # and it is not exposed as an extra animated control.
        centre = (0, frame["midHeightM"], frame["centreAftM"])
        yaw = math.radians(frame["yawDegrees"])
        yawCos, yawSin = math.cos(yaw), math.sin(yaw)
        def Align(point):
            x, y, z = point
            z -= centre[2]
            return (x * yawCos + z * yawSin, y, -x * yawSin + z * yawCos + centre[2])
        assembly = self.Empty("TailplaneReferenceAssembly", centre, self.root)
        assembly["fixedReferenceAlignmentDegrees"] = frame["yawDegrees"]
        assembly["animatedControl"] = False
        self.root["tailplaneReferenceYawDegrees"] = frame["yawDegrees"]
        self.root["tailplaneReferenceHeightM"] = frame["midHeightM"]
        previousParent = self.activeParent
        self.activeParent = assembly
        for side, suffix in ((-1, "Left"), (1, "Right")):
            fixedSpan = frame["hornSplitSpanM"] - mechanics["hornSideGapM"] / 2
            fixedRear = frame["hingeAxisAftM"] - mechanics["hingeNoseRadiusM"] - mechanics["hingeGapM"]
            outline = [(side * plan["leadingRootSpanM"], plan["leadingRootAftM"]),
                       (side * fixedSpan, plan["leadingHornAftM"]), (side * fixedSpan, fixedRear),
                       (side * plan["leadingRootSpanM"], fixedRear)]
            self.Foil("HorizontalStabilizer" + suffix, outline, mechanics["fixedThicknessM"], height=frame["midHeightM"],
                      matingAft=fixedRear, matingSpan=side * fixedSpan,
                      matingBevelM=mechanics.get("matingEdgeBevelM", mechanics["fixedThicknessM"] * .30))
            pivot = self.Empty("Elevator" + suffix + "Pivot", (side * .15, frame["midHeightM"], frame["hingeAxisAftM"]), assembly)
            pivot["axisLocal"] = "+X"
            pivot["rangeDegrees"] = [-25., 25.]
            self.controls["Elevator" + suffix] = pivot
            self.TailMovingSurface(suffix, side, pivot, data)
            # Type II has two lower members in a V, visible in kda2-20. Their
            # fuselage ends follow the actual lower longeron, not an arbitrary
            # height below the shell. Exact joint hardware remains inferred.
            tailJoint = (side * 1.67, frame["midHeightM"] - .04, 5.00)
            for label, z in (("Forward", 4.60), ("Rear", 5.20)):
                w, cy, up, low = self.Section(z)
                bodyJoint = (side * w * .60, cy - low * .98, z)
                self.Beam("TailplaneLower" + label + "Brace" + suffix, bodyJoint, Align(tailJoint), .015, "Steel", 8, parent=self.root)
                self.Beam("Tailplane" + label + "ClevisPin" + suffix,
                          (bodyJoint[0] - .035, bodyJoint[1], z),
                          (bodyJoint[0] + .035, bodyJoint[1], z), .018, "Steel", 8, parent=self.root)
            self.Beam("TailplaneOuterClevisPin" + suffix,
                      (tailJoint[0] - .040, tailJoint[1], tailJoint[2]),
                      (tailJoint[0] + .040, tailJoint[1], tailJoint[2]), .018, "Steel", 8)
            self.Beam("ElevatorHorn" + suffix, (side * .19, frame["midHeightM"] + .02, frame["hingeAxisAftM"]),
                      (side * .19, frame["midHeightM"] + .18, frame["hingeAxisAftM"] + .01), .016, "Steel", 8, parent=pivot)
            for j in range(4):
                x = side * (.40 + .43 * j)
                self.Beam("ElevatorHinge" + suffix + str(j), (x - .02, frame["midHeightM"], frame["hingeAxisAftM"]),
                          (x + .02, frame["midHeightM"], frame["hingeAxisAftM"]), .006, "Steel", 12)
        self.Beam("TailplaneCentreMountPin", (-.13, frame["midHeightM"], frame["centreAftM"]),
                  (.13, frame["midHeightM"], frame["centreAftM"]), .018, "Steel", 8)
        self.activeParent = previousParent
        assembly.rotation_euler.z = yaw
        bpy.context.view_layer.update()
        rudderData = data["rudderMechanics"]
        rudderAxis = rudderData["hingeAftM"]
        finRear = rudderAxis - rudderData["noseRadiusM"] - rudderData["hingeGapM"]
        vertical = data["verticalTail"]
        fin = [tuple(p) for p in vertical["fixedLeadingYZ"]] + [(vertical["fixedTopHeightM"], finRear), (1.84, finRear)]
        self.Foil("TypeIITallFixedFin", fin, .092, True)
        pivot = self.Empty("RudderPivot", (0, 1.85, rudderAxis), self.root)
        pivot["axisLocal"] = "+Y in glTF / +Z in Blender"
        pivot["rangeDegrees"] = [-25., 25.]
        self.controls["Rudder"] = pivot
        def Curve(points):
            result = []
            count = 6 if self.high else 2
            pts = [Vector(p) for p in points]
            for i in range(len(pts) - 1):
                a, b = pts[i], pts[i + 1]
                before = pts[max(0, i - 1)]
                after = pts[min(len(pts) - 1, i + 2)]
                ta, tb = (b - before) * .40, (after - a) * .40
                for j in range(count):
                    t = j / count
                    p = (2*t**3 - 3*t*t + 1)*a + (t**3 - 2*t*t + t)*ta + (-2*t**3 + 3*t*t)*b + (t**3 - t*t)*tb
                    result.append(tuple(p))
            result.append(tuple(pts[-1]))
            return result
        rudder = [(rudderData["noseBottomHeightM"], rudderAxis), (rudderData["noseTopHeightM"], rudderAxis)]
        rudder += Curve(vertical["balanceLeadingYZ"])
        rudder += Curve(vertical["rearCurveYZ"])[1:]
        rudder += Curve(vertical["lowerCurveYZ"])[1:-1]
        rudderBody = self.Foil("Rudder", rudder, .075, True, pivot, hingeLeadingAft=rudderAxis)
        # Different curve/bevel detail must not change the selected neutral
        # length anchor. Preserve the hinge and taper the small correction to
        # zero there rather than flattening the rear outline at a clipping plane.
        rearExtent = max(-vertex.co.y for vertex in rudderBody.data.vertices)
        correction = rearExtent - vertical["neutralRearExtentM"]
        for vertex in rudderBody.data.vertices:
            aft = -vertex.co.y
            if aft > rudderAxis:
                vertex.co.y += correction * ((aft - rudderAxis) / (rearExtent - rudderAxis)) ** 2
        rudderBody.data.update()
        noseSides = 20 if self.high else 12
        nose = self.Beam("RudderRoundHingeNose", (0, rudderData["noseBottomHeightM"], rudderAxis),
                         (0, rudderData["noseTopHeightM"], rudderAxis), rudderData["noseRadiusM"], "Tail", noseSides, parent=pivot)
        uv = nose.data.uv_layers[0]
        for poly in nose.data.polygons:
            if poly.index >= noseSides:
                poly.use_smooth = False
            for cornerIndex, loop in enumerate(poly.loop_indices):
                co = nose.data.vertices[nose.data.loops[loop].vertex_index].co
                x, y, z = co.x, co.z, -co.y
                if poly.index < noseSides:
                    phase = poly.index + (1 if cornerIndex in (1, 2) else 0)
                    uv.data[loop].uv = (.6 + phase / noseSides * TAU * rudderData["noseRadiusM"] / 4.4, (y - 1.7) / 1.6)
                else:
                    uv.data[loop].uv = (.5 + x / 4.4, .5 + (z - rudderAxis) / 1.6)
        bpy.ops.object.select_all(action="DESELECT")
        rudderBody.select_set(True);nose.select_set(True);bpy.context.view_layer.objects.active = rudderBody
        noseName = nose.name
        bpy.ops.object.join()
        self.parts.pop(noseName, None)
        self.meshes = [ob for ob in self.modelColl.objects if ob.type == "MESH"]
        self.root["referenceRudderDegrees"] = vertical["referenceRudderDegrees"]
        for j, y in enumerate((1.82, 2.18, 2.55)):
            self.Beam("RudderHinge" + str(j), (0, y - .02, rudderAxis + .005), (0, y + .02, rudderAxis + .005), .006, "Steel", 12)
        for side in (-1, 1):
            self.Beam("RudderHorn" + str(side), (0, 1.84, rudderAxis + .15), (side * .25, 1.84, rudderAxis + .15), .016, "Steel", 8, parent=pivot)

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
        self.Beam("TailSkidSocket", (0, 1.72, 5.27), (0, 1.43, 5.48), .074, "Steel", 16)
        self.Tube("SprungWoodTailSkid", [(0, 1.50, 5.47), (0, 1.16, 5.55), (0, .90, 5.89), (0, .86, 6.10)], .050, "Wood", 12)
        self.Beam("TailSkidSteelShoe", (0, .842, 5.94), (0, .845, 6.13), .057, "Steel", 12, .55)
        self.Beam("TailSkidFrontBrace", (0, 1.65, 4.91), (0, 1.15, 5.55), .023, "Steel", 10)
        for j in range(7):
            self.Beam("TailSkidBinding" + str(j), (-.055, 1.40 - j * .025, 5.50 + j * .006), (.055, 1.40 - j * .025, 5.50 + j * .006), .009, "Ivory", 8)

    def Propeller(self):
        pivot = self.Empty("PropellerPivot", (0, 1.95, -5.98), self.root)
        pivot["axisLocal"] = "+Z in glTF / -Y in Blender"
        pivot["rpmPreview"] = 480.0
        pivot["referenceRestAngleDegrees"] = -49.57292126
        pivot["pitchMultiplier"] = -1.89430685
        pivot["bladeChordScale"] = .95882103
        pivot["bladePlaneAftM"] = -6.00393925
        pivot["pitchScope"] = "Both visible blades fitted together as a C2 loft; pitch, chord, axial plane and museum pose are photographic inferences, not factory propeller specifications."
        self.controls["Propeller"] = pivot
        # One blade loft repeated by a real 180-degree rotation about the shaft.
        # A point inversion would also flip the axial coordinate and incorrectly
        # reverse the pitch of the opposite blade.
        sections = [(.10, .055, 37), (.23, .105, 33), (.47, .165, 26), (.80, .169, 19),
                    (1.10, .134, 13), (1.29, .089, 10), (1.41, .042, 8),
                    (1.425, .024, 8), (1.43, .001, 8)]
        for side, suffix in ((-1, "Lower"), (1, "Upper")):
            verts, faces, uvs = [], [], []
            n = 20 if self.high else 12
            for i, (r, halfChord, twistDeg) in enumerate(sections):
                twist = math.radians(twistDeg * pivot["pitchMultiplier"])
                sweep = .055 * (r / 1.43) ** 2
                for j in range(n):
                    t = TAU * j / n
                    chord = math.cos(t) * halfChord * pivot["bladeChordScale"]
                    thick = math.sin(t) * (.024 * (1 - r / 1.7))
                    x = side * (sweep + chord * math.cos(twist) - thick * math.sin(twist))
                    z = pivot["bladePlaneAftM"] + chord * math.sin(twist) + thick * math.cos(twist)
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
        # The photographed spinner tip is ahead of the former propeller-hub
        # anchor. Preserve the other aircraft stations; do not compress the
        # body to force the museum model into a conflicting nominal length.
        # This makes the local museum candidate about12.51m long. The12.28m
        # documentary figure remains a separate, unverified subtype anchor.
        profile = [(-6.37, .002), (-6.33, .037), (-6.23, .089), (-6.11, .133), (-6.00, .157), (-5.94, .165)]
        self.root["documentaryNominalLengthM"] = 12.28
        self.root["museumSpinnerExtensionM"] = .23
        self.root["lengthScope"] = "Spinner length inferred from the selected museum photograph; documentary12.28m and12.80m lengths conflict, and no factory drawing has been obtained."
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
        pivot.rotation_euler.y = math.radians(-pivot["referenceRestAngleDegrees"])
        bpy.context.view_layer.update()

    def ApplyWingSurfaceNormals(self, ob):
        """Keep the coarse game's rib response close to the dense source."""
        mesh = ob.data
        params = mesh.attributes.get("WingSurfaceParam")
        skin = mesh.attributes.get("WingSurfaceSkin")
        assert params and skin and len(params.data) == len(mesh.vertices), ob.name
        mesh.update()
        normals = [Vector(item.vector) for item in mesh.corner_normals]
        cache = {}
        moving = bool(ob.get("continuousWingMovingNose"))
        for poly in mesh.polygons:
            if not skin.data[poly.index].value:
                continue
            for loopIndex in poly.loop_indices:
                index = mesh.loops[loopIndex].vertex_index
                x, u, sign = params.data[index].vector
                spanWeight = Smooth(min(1., max(0., (abs(x) - .80) / .15))) * Smooth(min(1., max(0., (7.0 - abs(x)) / .15)))
                start, ramp = (.88, .02) if moving else (.025, .035)
                chordWeight = Smooth(min(1., max(0., (u - start) / ramp))) * Smooth(min(1., max(0., (.99 - u) / .02)))
                weight = spanWeight * chordWeight
                if weight <= 1e-8:
                    continue
                if index not in cache:
                    top = sign > 0
                    dx = Vector(self.WingPoint(x + .0005, u, True, top)) - Vector(self.WingPoint(x - .0005, u, True, top))
                    du = Vector(self.WingPoint(x, min(1., u + .00005), True, top)) - Vector(self.WingPoint(x, max(0., u - .00005), True, top))
                    normal = du.cross(dx)
                    if not top:
                        normal.negate()
                    assert normal.length > 1e-10, (ob.name, index)
                    cache[index] = P(normal.normalized()).normalized()
                normals[loopIndex] = (normals[loopIndex] * (1 - weight) + cache[index] * weight).normalized()
        mesh.normals_split_custom_set([tuple(normal) for normal in normals])

    def Recalculate(self):
        # Explicit outward normals, including the two mirrored wing halves.
        import bmesh
        for ob in self.meshes:
            if ob.name not in bpy.data.objects:
                continue
            if ob.get("continuousWingSkinNormals"):
                # Zero requests geometric auto normals before every rebuild,
                # avoiding cumulative blending over repeated Save calls.
                ob.data.normals_split_custom_set([(0., 0., 0.)] * len(ob.data.loops))
            bm = bmesh.new()
            bm.from_mesh(ob.data)
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
            bm.to_mesh(ob.data)
            bm.free()
            if ob.get("continuousWingSkinNormals"):
                self.ApplyWingSurfaceNormals(ob)

    def Surface(self):
        """Attach exportable UV PBR and physically scaled detail UVs."""
        textureRoot = self.sourceRoot / "Textures"
        surfaceManifest = json.loads((textureRoot / "Data_SurfaceSources.json").read_text(encoding="utf-8"))
        self.root["surfaceSourceVersion"] = surfaceManifest["version"]
        factorsFile = self.modelDir / "Data_KawasakiType88SurfaceFactors.json"
        surfaceFactors = json.loads(factorsFile.read_text(encoding="utf-8")) if factorsFile.exists() else {}
        baseFactors = surfaceFactors.get("baseColourFactors", {})
        opaqueFactor = float(surfaceFactors.get("opaqueGlobalBaseColourFactorLinear", 1.))
        assert math.isfinite(opaqueFactor) and 0 < opaqueFactor <= 1, opaqueFactor
        self.root["opaqueGlobalBaseColourFactorLinear"] = opaqueFactor
        family = {"Fabric": "Fabric", "LowerWingFabric": "Fabric", "Fuselage": "Fuselage", "FuselageMetal": "Fuselage",
                  "UpperWing": "UpperWing", "LowerUnderside": "LowerUnderside", "Tail": "FabricPlain", "Fin": "Fin",
                  "Aluminum": "Aluminum", "Steel": "Steel", "Exhaust": "Exhaust", "Rubber": "Rubber",
                  "Leather": "Leather", "Wood": "Wood", "Cockpit": "Cockpit", "CockpitLining": "CockpitLining", "LowerHousing": "LowerHousing", "LowerPocket": "LowerHousing"}
        detail = {"LowerWingFabric": "Fabric", "FuselageMetal": "Aluminum", "Fuselage": "Fabric", "UpperWing": "Fabric",
                  "LowerUnderside": "Fabric", "Tail": "Fabric", "Fin": "Fabric", "Cockpit": "Steel", "CockpitLining": "Fabric", "LowerHousing": "Aluminum", "LowerPocket": "Aluminum"}
        uvMappedFamilies = {"Fabric", "LowerWingFabric", "Fuselage", "FuselageMetal", "UpperWing", "LowerUnderside", "Tail", "Fin", "Wood", "Rubber", "Leather", "LowerHousing", "LowerPocket"}
        finishes = self.cockpitData.get("finishes", {})
        family.update({key: key for key in finishes})
        detail.update({key: finish["detailKind"] for key, finish in finishes.items() if finish.get("detailKind")})
        noDetailFamilies = {key for key, finish in finishes.items() if not finish.get("detailKind")}
        uvMappedFamilies.update(finishes)
        if self.cowlingData.get("jointFinish"):
            family["CowlingJoint"] = "CowlingJoint"
            detail["CowlingJoint"] = "Steel"
            uvMappedFamilies.add("CowlingJoint")
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
                if channel == "Normal" and key in noDetailFamilies:
                    continue
                texture = nodes.new("ShaderNodeTexImage")
                channelSource = detail.get(key, key) if channel == "Normal" else ("LowerWingFabric" if key == "LowerWingFabric" and channel == "Base" else source)
                filename = "Texture_Type88" + channelSource + channel + ".png"
                texture.image = bpy.data.images.load(str(textureRoot / filename), check_existing=True)
                texture.image.colorspace_settings.name = "sRGB" if channel == "Base" else "Non-Color"
                # AO strength changes how the exporter groups the ORM image.
                # Preserve the established runtime sampler for every MR role
                # explicitly, independently of the base-color or AO sampler.
                if channel == "Orm":
                    clampMr = {"Fabric", "UpperWing", "LowerWingFabric", "LowerUnderside",
                               "Fuselage", "FuselageMetal", "Fin"}
                    texture.extension = "EXTEND" if key in clampMr else "REPEAT"
                else:
                    texture.extension = "REPEAT" if channel == "Normal" or key not in uvMappedFamilies else "EXTEND"
                texture.label = "Actual-scale detail" if channel == "Normal" else "Authored " + channel
                links.new((detailUv if channel == "Normal" else uv).outputs["UV"], texture.inputs["Vector"])
                if channel == "Base":
                    # Saved Blender role factors are float32. Compose the new
                    # calibration in that same order so a fresh reconstruction
                    # reproduces an edited source without double-rounding drift.
                    roleFactor = struct.unpack("<f", struct.pack("<f", float(baseFactors.get(key, 1.))))[0]
                    factor = roleFactor * opaqueFactor
                    assert 0 < factor <= 1, (key, factor)
                    if factor == 1.:
                        links.new(texture.outputs["Color"], shader.inputs["Base Color"])
                    else:
                        multiply = nodes.new("ShaderNodeMix")
                        multiply.name = "UniformBaseColourFactor"
                        multiply.data_type = "RGBA"
                        multiply.blend_type = "MULTIPLY"
                        multiply.inputs[0].default_value = 1.
                        multiply.inputs[7].default_value = (factor, factor, factor, 1.)
                        links.new(texture.outputs["Color"], multiply.inputs[6])
                        links.new(multiply.outputs[2], shader.inputs["Base Color"])
                        mat["uniformBaseColourFactorLinear"] = factor
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
            mat["opaqueCalibrationFactorLinear"] = opaqueFactor
        # Plain exported roles (for example ink and gauge ivory) obey the same
        # complete-asset calibration. Glass remains neutral and transmissive.
        for key, mat in self.materials.items():
            if key == "Glass" or key in family:
                continue
            shader = mat.node_tree.nodes.get("Principled BSDF")
            socket = shader.inputs["Base Color"]
            assert not socket.is_linked, key
            rgba = list(socket.default_value)
            socket.default_value = tuple(value * opaqueFactor if index < 3 else value
                                         for index, value in enumerate(rgba))
            mat["uniformBaseColourFactorLinear"] = opaqueFactor
            mat["opaqueCalibrationFactorLinear"] = opaqueFactor
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
            # The port lips inherited their UVs before the reference finish
            # changed from Steel to Exhaust. Keep that established mapping;
            # only the individual stacks use the per-object exhaust offset.
            if key == "Exhaust" and not ob.name.startswith("ExhaustPortTrim"):
                seed = sum((i + 1) * ord(c) for i, c in enumerate(ob.name))
                offset = ((seed % 29) / 29, (seed % 43) / 43)
                for data in sourceUv.data:
                    data.uv.x += offset[0]
                    data.uv.y += offset[1]
            tile = .0832 if detail.get(key, key) in ("Fabric", "Leather") else .20
            if key in ("Fuselage", "FuselageMetal"):
                extent = (11.90, 2.60)
            elif key in ("UpperWing", "LowerUnderside", "LowerWingFabric") or (key == "Fabric" and ("Wing" in ob.name or "Aileron" in ob.name)):
                extent = (15, 2.092026 if key == "UpperWing" or "UpperWing" in ob.name or ("Aileron" in ob.name and "Lower" not in ob.name) else 1.72)
            elif key == "Fin":
                extent = (4.4, 1.6)
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
        self.RestoreAuthoredUvLayout()

    def RestoreAuthoredUvLayout(self):
        """Keep approved modifier-generated UVs stable across rebuilds."""
        file = self.sourceRoot / ("Data_KawasakiType88AuthoredUv" + self.detail.title() + ".json")
        if not file.exists():
            file = self.modelDir / "Rebuild" / file.name
        if not file.exists():
            raise FileNotFoundError("Missing authored UV reconstruction data: " + str(file))
        import base64
        import hashlib
        import struct
        import zlib
        import numpy as np
        layout = json.loads(file.read_text(encoding="utf-8"))
        assert layout["schema"] == "KawasakiType88AuthoredUvV1" and layout["detail"] == self.detail
        for name, record in layout["objects"].items():
            ob = next(ob for ob in self.meshes if ob.name == name)
            mesh = ob.data
            signature = hashlib.sha256(struct.pack("<3I", len(mesh.vertices), len(mesh.polygons), len(mesh.loops)))
            for loop in mesh.loops:
                signature.update(struct.pack("<I", loop.vertex_index))
            for polygon in mesh.polygons:
                signature.update(struct.pack("<I", polygon.loop_total))
            assert signature.hexdigest() == record["topologySha256"], ("Authored UV topology differs", name)
            for layerName, encoded in record["layers"].items():
                assert layerName != "UvOcclusion" and mesh.uv_layers.get(layerName), (name, layerName)
                payload = zlib.decompress(base64.b64decode(encoded, validate=True))
                assert len(payload) == len(mesh.loops) * 8, (name, layerName)
                values = np.frombuffer(payload, dtype="<f4").reshape(-1, 2)
                assert np.isfinite(values).all(), (name, layerName)
                mesh.uv_layers[layerName].data.foreach_set("uv", values.ravel())
        self.root["authoredUvLayoutSha256"] = hashlib.sha256(file.read_bytes()).hexdigest()
        self.root["authoredUvLayoutScope"] = "Approved actual mesh UV layers restored only after exact object topology/corner validation."

    def ApplyOcclusionUvLayout(self, mesh, ranges):
        """Restore an authored external atlas when its corner topology matches."""
        file = self.sourceRoot / ("Data_KawasakiType88OcclusionUv" + self.detail.title() + ".json")
        if not file.exists():
            file = self.modelDir / "Rebuild" / file.name
        if not file.exists():
            raise FileNotFoundError("Missing occlusion UV reconstruction data: " + str(file))
        import base64
        import hashlib
        import struct
        import zlib
        import numpy as np
        layout = json.loads(file.read_text(encoding="utf-8"))
        assert layout["schema"] == "KawasakiType88OcclusionUvV1" and layout["detail"] == self.detail
        records = layout["objects"]
        assert set(records) == {ob.name for ob, _, _ in ranges}, "Occlusion atlas object set differs"
        target = mesh.uv_layers.get("UvOcclusion")
        for ob, offset, count in ranges:
            record = records[ob.name]
            source = ob.data
            signature = hashlib.sha256(struct.pack("<3I", len(source.vertices), len(source.polygons), len(source.loops)))
            for loop in source.loops:
                signature.update(struct.pack("<I", loop.vertex_index))
            for polygon in source.polygons:
                signature.update(struct.pack("<I", polygon.loop_total))
            assert signature.hexdigest() == record["topologySha256"], ("Occlusion atlas topology differs", ob.name)
            payload = zlib.decompress(base64.b64decode(record["uvFloat32ZlibBase64"], validate=True))
            assert len(payload) == count * 8, ("Occlusion atlas corner count differs", ob.name)
            values = np.frombuffer(payload, dtype="<f4").reshape(count, 2)
            assert np.isfinite(values).all() and values.min() >= -1e-6 and values.max() <= 1 + 1e-6, ob.name
            for i, value in enumerate(values):
                target.data[offset + i].uv = value
        self.root["occlusionUvLayoutSha256"] = hashlib.sha256(file.read_bytes()).hexdigest()
        self.root["occlusionUvLayoutScope"] = "Existing normalized atlas retained; geometric occlusion is freshly baked."
        self.Progress("RestoredOcclusionUvLayout", objects=len(records), file=str(file))
        return True

    def BakeOcclusion(self, resolution=None, samples=16):
        """One temporary bake proxy; copy packed UV loops back to editable parts.

        Baking hundreds of separate selected objects repeats scene setup. A
        transient assembled proxy gives the same geometric occlusion in one
        bake; no source mesh or movable node is merged in the saved project.
        """
        scene = bpy.context.scene
        size = resolution or (4096 if self.high else 2048)
        self.Progress("PreparingOcclusionProxy")
        image = bpy.data.images.new("Texture_Type88AssemblyAo", width=size, height=size, alpha=False)
        image.generated_color = (1, 1, 1, 1)
        image.colorspace_settings.name = "Non-Color"
        bpy.ops.object.select_all(action="DESELECT")
        verts, faces, ranges = [], [], []
        loopOffset = 0
        hidden, transparent = {}, []
        bpy.context.view_layer.update()
        for ob in self.meshes:
            hidden[ob.name] = ob.hide_render
            ob.hide_render = True
            if ob.data.materials and all(material == self.materials["Glass"] for material in ob.data.materials):
                transparent.append(ob)
                continue
            offset = len(verts)
            verts.extend(tuple(ob.matrix_world @ vertex.co) for vertex in ob.data.vertices)
            faces.extend(tuple(offset + i for i in poly.vertices) for poly in ob.data.polygons)
            ranges.append((ob, loopOffset, len(ob.data.loops)))
            loopOffset += len(ob.data.loops)
        mesh = bpy.data.meshes.new("ToolAssemblyOcclusionProxyMesh")
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        assert len(mesh.loops) == loopOffset, "Occlusion proxy changed corner ordering"
        proxy = bpy.data.objects.new("ToolAssemblyOcclusionProxy", mesh)
        self.stageColl.objects.link(proxy)
        proxy.select_set(True)
        bpy.context.view_layer.objects.active = proxy
        mesh.uv_layers.new(name="UvOcclusion")
        if not self.ApplyOcclusionUvLayout(mesh, ranges):
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
        occlusion = bakeMat.node_tree.nodes.new("ShaderNodeAmbientOcclusion")
        occlusion.inputs["Distance"].default_value = .30
        occlusion.samples = 16
        occlusion.only_local = False
        emission = bakeMat.node_tree.nodes.new("ShaderNodeEmission")
        bakeMat.node_tree.links.new(occlusion.outputs["AO"], emission.inputs["Color"])
        outputNode = next(node for node in bakeMat.node_tree.nodes if node.type == "OUTPUT_MATERIAL")
        bakeMat.node_tree.links.new(emission.outputs["Emission"], outputNode.inputs["Surface"])
        scene.render.engine = "CYCLES"
        scene.cycles.samples = samples
        scene.render.threads_mode = "FIXED"
        scene.render.threads = 4
        scene.render.bake.use_selected_to_active = False
        scene.render.bake.margin = 10
        scene.render.bake.use_clear = True
        scene.world.color = (.8, .8, .8)
        self.Progress("BakingOcclusion", resolution=size)
        bpy.ops.object.bake(type="EMIT")
        # Suppress Monte Carlo speckle without repainting geometric occlusion.
        # A one-texel separable filter stays inside the existing bake margin.
        import numpy as np
        pixels = np.empty(size * size * 4, dtype=np.float32)
        image.pixels.foreach_get(pixels)
        pixels = pixels.reshape((size, size, 4))
        ao = pixels[:, :, 0].copy()
        for axis in (0, 1):
            padding = [(0, 0), (0, 0)]
            padding[axis] = (1, 1)
            padded = np.pad(ao, padding, mode="edge")
            if axis == 0:
                ao = .2 * padded[:-2] + .6 * padded[1:-1] + .2 * padded[2:]
            else:
                ao = .2 * padded[:, :-2] + .6 * padded[:, 1:-1] + .2 * padded[:, 2:]
        pixels[:, :, :3] = ao[:, :, None]
        image.pixels.foreach_set(pixels.ravel())
        image.update()
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
        for ob in transparent:
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
            if mat == self.materials["Glass"]:
                continue
            nodes, links = mat.node_tree.nodes, mat.node_tree.links
            texture = nodes.new("ShaderNodeTexImage")
            texture.name = "AssemblyAoBaked"
            texture.image = image
            uv = nodes.new("ShaderNodeUVMap")
            uv.uv_map = "UvOcclusion"
            links.new(uv.outputs["UV"], texture.inputs["Vector"])
            occlusion = nodes.new("ShaderNodeGroup")
            occlusion.node_tree = group
            factorsFile = self.modelDir / "Data_KawasakiType88SurfaceFactors.json"
            factors = json.loads(factorsFile.read_text(encoding="utf-8")) if factorsFile.exists() else {}
            strength = float(factors.get("assemblyOcclusionStrength", 1.))
            assert 0. <= strength <= 1., strength
            if strength < 1.:
                mix = nodes.new("ShaderNodeMix")
                mix.name = "AssemblyOcclusionStrength"
                mix.data_type = "RGBA"
                mix.blend_type = "MIX"
                mix.inputs[0].default_value = strength
                mix.inputs[6].default_value = (1., 1., 1., 1.)
                links.new(texture.outputs["Color"], mix.inputs[7])
                links.new(mix.outputs[2], occlusion.inputs["Occlusion"])
            else:
                links.new(texture.outputs["Color"], occlusion.inputs["Occlusion"])
            self.root["assemblyOcclusionStrength"] = strength
        for ob in self.meshes:
            uv = ob.data.uv_layers.get("UvSurface")
            ob.data.uv_layers.active = uv
            uv.active_render = True
        scene["surfaceStage"] = "UV PBR plus baked assembly occlusion"
        scene["occlusionBakeSamples"] = samples
        scene["occlusionNodeSamples"] = 16
        scene["occlusionRadiusM"] = .30
        scene["occlusionTransparentExcluded"] = True
        scene["occlusionFilter"] = "Separable [0.2, 0.6, 0.2], one texel inside bake margin"
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
            ("ReferenceMuseum", (-11.89151574965536, 21.65799278539144, .6349742654383759), (0, 1.7, 0), 13.792923310324952, 0),
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
                data.shift_x = -.49026538836903455 / scale
                data.shift_y = -.20440654915649972 / scale
            ob = bpy.data.objects.new("Camera" + name, data)
            self.stageColl.objects.link(ob)
            ob.location = P(pos)
            if name in ("ReferenceMuseum", "PlanElevation"):
                normal = (Vector(pos) - Vector(target)).normalized()
                right = Vector((0, 0, 1))
                right = (right - normal * normal.dot(right)).normalized()
                up = normal.cross(right).normalized()
                matrix = Matrix((P(right), P(up), P(normal))).transposed().to_4x4()
                ob.rotation_euler = (matrix @ Matrix.Rotation(math.radians(2.4100124311212983 if name == "ReferenceMuseum" else 0), 4, "Z")).to_euler()
            else:
                quat = (P(target) - ob.location).to_track_quat("-Z", "Y")
                ob.rotation_euler = (quat.to_matrix().to_4x4() @ Matrix.Rotation(math.radians(roll), 4, "Z")).to_euler()
        scene.camera = bpy.data.objects["CameraReferenceHistoricII"]

    def Save(self, recalculate=True):
        for path in (self.sourceRoot, self.modelDir, self.reviewDir):
            path.mkdir(parents=True, exist_ok=True)
        if recalculate:
            self.Recalculate()
        bpy.context.view_layer.update()
        self.root["buildVersion"] = VERSION
        self.root["buildStage"] = self.stage
        if self.root.get("surfaceSourceVersion"):
            self.root["surfaceVersion"] = self.root["surfaceSourceVersion"]
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
        # Joining rigid parts preserves their already-authored corner normals.
        # Recalculating after the join would smooth unrelated part boundaries.
        self.Save(recalculate=not (self.stage == "pbr" and not self.high))


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
