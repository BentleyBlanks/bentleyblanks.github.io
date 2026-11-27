"""Build the Type 30 exterior game prop from a prepared material atlas.

Run Build through the worktree's BlenderMCP session. Coordinates describe the
proportions of the game asset. The receiver and jacket are solid exterior meshes.
"""

import json
from math import atan2, cos, pi, sin, tau
from pathlib import Path
import runpy

import bpy
from mathutils import Matrix, Vector


ASSET = "Asset_Type30Hmg"
STUDIO = "Review_Type30Hmg"
AO_PART_ATTRIBUTE = "Type30AoPart"
FINISHES = {
    "WaterJacket": ((0, 1), (0.039, 0.034, 0.022), 0.61, 0.35),
    "AgedBrass": ((1, 1), (0.172, 0.086, 0.029), 0.79, 0.43),
    "BrassFace": ((2, 1), (0.154, 0.133, 0.106), 0.74, 0.49),
    "BluedSteel": ((0, 0), (0.041, 0.044, 0.043), 0.79, 0.43),
    "TripodSteel": ((1, 0), (0.045, 0.048, 0.031), 0.34, 0.46),
    "DarkWalnut": ((2, 0), (0.044, 0.027, 0.017), 0.00, 0.60),
    "Rubber": (None, (0.009, 0.011, 0.011), 0.00, 0.78),
    "DarkRecess": (None, (0.012, 0.014, 0.014), 0.24, 0.62),
}
RUBBED_FINISHES = {"SteelRub": "BluedSteel", "TripodRub": "TripodSteel"}
PLANAR_PHOTO_FACES = {
    "LeftSidePanel": (("LeftSidePanel", 1, -1, False),),
    "RearPlate": (("RearPlate", 0, -1, True),),
    "RightSidePanel": (("RightSidePanel", 1, 1, True),),
    "RightCradleCheek": (("RightCradleCheek", 1, 1, True),),
    "LeftCradleCheek": (("LeftCradleCheek", 1, -1, False),),
    "ReceiverShell": (("ReceiverShell", 1, 1, True),),
    "UpperCover": (("UpperCover", 2, 1, False), ("UpperCoverRightSide", 1, 1, True)),
}


def Material(name, color, metalness, roughness):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metalness
    shader.inputs["Roughness"].default_value = roughness
    return material


def MappedFinishTextures(material, directory, rect):
    x, y, width, height = rect
    nodes, links = material.node_tree.nodes, material.node_tree.links
    uv = nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (3840 / width, 2160 / height, 1.)
    mapping.inputs["Location"].default_value = (-x / width, -(2160 - y - height) / height, 0.)
    links.new(uv.outputs["UV"], mapping.inputs["Vector"])

    def LoadTexture(name, colorSpace):
        image = bpy.data.images.load(str(directory / f"Texture_Type30Hmg{name}.png"), check_existing=False)
        if tuple(image.size) != (width, height):
            raise ValueError(f"Unexpected mapped Type 30 texture size for {image.name}")
        image.colorspace_settings.name = colorSpace
        image.pack()
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = image
        texture.extension = "EXTEND"
        links.new(mapping.outputs["Vector"], texture.inputs["Vector"])
        return texture.outputs["Color"]

    return LoadTexture


def BindMappedClearcoat(material, load, prefix, roughness, roughnessFromGreen=False):
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes["Principled BSDF"]
    shader.inputs["Coat Roughness"].default_value = roughness
    coverage = nodes.new("ShaderNodeSeparateColor")
    links.new(load(f"{prefix}Clearcoat", "Non-Color"), coverage.inputs["Color"])
    links.new(coverage.outputs["Red"], shader.inputs["Coat Weight"])
    if roughnessFromGreen:
        scale = nodes.new("ShaderNodeMath")
        scale.operation = "MULTIPLY"
        scale.inputs[1].default_value = roughness
        links.new(coverage.outputs["Green"], scale.inputs[0])
        links.new(scale.outputs[0], shader.inputs["Coat Roughness"])
    normal = nodes.new("ShaderNodeNormalMap")
    normal.uv_map = "UVMap"
    links.new(load(f"{prefix}ClearcoatNormal", "Non-Color"), normal.inputs["Color"])
    links.new(normal.outputs["Normal"], shader.inputs["Coat Normal"])


def RearLegMaterial(steel, atlasDir, photoRegions):
    directory = Path(atlasDir)
    descriptor = directory / "Data_Type30HmgRearSpecularity.json"
    if not descriptor.is_file():
        return
    config = json.loads(descriptor.read_text(encoding="utf-8"))
    rect = photoRegions.get("RearLeg") if photoRegions else None
    if not rect or tuple(config["rect"]) != tuple(rect):
        raise ValueError("The rear-leg specularity texture must match its atlas region")
    material = steel.copy()
    material.name = "Material_Type30RearLegSteel"
    nodes, links = material.node_tree.nodes, material.node_tree.links
    load = MappedFinishTextures(material, directory, rect)
    shader = nodes["Principled BSDF"]
    shader.inputs["IOR"].default_value = config["ior"]
    links.new(load("RearSpecularity", "sRGB"), shader.inputs["Specular Tint"])
    if "clearcoatRoughness" in config:
        BindMappedClearcoat(material, load, "Rear", config["clearcoatRoughness"])
    return material


def BindMappedSpecularity(material, directory, descriptorName, textureName, rect):
    descriptor = directory / descriptorName
    if not descriptor.is_file():
        return
    config = json.loads(descriptor.read_text(encoding="utf-8"))
    level = config["specularLevel"]
    if not rect or tuple(config["rect"]) != tuple(rect) or not .5 <= level <= 1.:
        raise ValueError(f"The specularity texture must match the material atlas region in {descriptor}")
    load = MappedFinishTextures(material, directory, rect)
    shader = material.node_tree.nodes["Principled BSDF"]
    shader.inputs["Specular IOR Level"].default_value = level
    material.node_tree.links.new(load(textureName, "sRGB"), shader.inputs["Specular Tint"])
    if "clearcoatRoughness" in config:
        BindMappedClearcoat(material, load, textureName.removesuffix("Specularity"), config["clearcoatRoughness"],
                            roughnessFromGreen=config.get("clearcoatRoughnessFromGreen", False))


def AtlasMaterials(atlasDir, photoRegions=None):
    maps = {}
    if atlasDir is not None:
        for name in ("BaseColor", "MetallicRoughness", "Normal"):
            image = bpy.data.images.load(str(Path(atlasDir) / f"Texture_Type30Hmg{name}.png"), check_existing=False)
            if tuple(image.size) != (3840, 2160):
                raise ValueError(f"Unexpected Type 30 atlas size for {image.name}: {tuple(image.size)}")
            image.colorspace_settings.name = "sRGB" if name == "BaseColor" else "Non-Color"
            image.pack()
            maps[name] = image
    materials = {}
    finishes = FINISHES
    if maps and photoRegions and "HangingHose" in photoRegions:
        finishes = {**FINISHES, "HoseExterior": FINISHES["Rubber"]}
    for name, (tile, color, metalness, roughness) in finishes.items():
        material = Material(f"Material_Type30{name}", color, metalness, roughness)
        materials[name] = material
        if not maps or (tile is None and name != "HoseExterior"):
            continue
        nodes, links = material.node_tree.nodes, material.node_tree.links
        shader = nodes.get("Principled BSDF")
        for row, (channel, image) in enumerate(maps.items()):
            texture = nodes.new("ShaderNodeTexImage")
            texture.image = image
            texture.label = channel
            texture.location = (-570, 400 - 280 * row)
            if channel == "Normal":
                normal = nodes.new("ShaderNodeNormalMap")
                normal.location = (-270, -150)
                normal.inputs["Strength"].default_value = 0.70
                links.new(texture.outputs["Color"], normal.inputs["Color"])
                links.new(normal.outputs["Normal"], shader.inputs["Normal"])
            elif channel == "MetallicRoughness":
                packed = nodes.new("ShaderNodeSeparateColor")
                packed.location = (-270, 100)
                links.new(texture.outputs["Color"], packed.inputs["Color"])
                links.new(packed.outputs["Green"], shader.inputs["Roughness"])
                links.new(packed.outputs["Blue"], shader.inputs["Metallic"])
            else:
                links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    if atlasDir is not None:
        directory = Path(atlasDir)
        BindMappedSpecularity(materials["WaterJacket"], directory, "Data_Type30HmgJacketReflection.json",
                              "JacketSpecularity", (0, 0, 1280, 1080))
        BindMappedSpecularity(materials["BluedSteel"], directory, "Data_Type30HmgLeftPanelReflection.json",
                              "LeftPanelSpecularity", (photoRegions or {}).get("LeftSidePanel"))
        ferrule = directory / "Data_Type30HmgFerruleReflection.json"
        if ferrule.is_file():
            config = json.loads(ferrule.read_text(encoding="utf-8"))
            rect = (photoRegions or {}).get("HoseFerruleSide")
            if not rect or tuple(config["rect"]) != tuple(rect):
                raise ValueError("The ferrule reflection must match the ferrule atlas region")
            brass = materials["AgedBrass"]
            load = MappedFinishTextures(brass, directory, rect)
            BindMappedClearcoat(brass, load, "Ferrule", config["clearcoatRoughness"], roughnessFromGreen=True)
        rearLeg = RearLegMaterial(materials["TripodSteel"], atlasDir, photoRegions)
        if rearLeg is not None:
            materials["RearLegSteel"] = rearLeg
        BindMappedSpecularity(materials["TripodSteel"], directory, "Data_Type30HmgForelegSpecularity.json",
                              "ForelegSpecularity", (photoRegions or {}).get("LeftForwardLeg"))
    for name, source in RUBBED_FINISHES.items():
        materials[name] = materials[source]
    return materials


def AtlasUv(finish, u, v):
    surface = RUBBED_FINISHES.get(finish, finish)
    tile = FINISHES[surface][0]
    if tile is None:
        return u, v
    if finish in RUBBED_FINISHES:
        v = 0.040 + v * 0.155
    elif surface in {"BluedSteel", "TripodSteel"}:
        v = 0.30 + v * 0.665
    else:
        v = 0.024 + v * 0.952
    return (tile[0] + 0.025 + u * 0.95) / 3, (tile[1] + v) / 2


def PhotoUv(rect, u, v):
    left, top, width, height = rect
    inset = 7
    return ((left + inset + u * (width - 2 * inset)) / 3840,
            1 - (top + inset + (1 - v) * (height - 2 * inset)) / 2160)


def HoseLongitudinalUv(u, winding):
    # Give the photographed section more texels per unit of length.
    first, last = winding["visibleAlong"]
    start, end = winding["atlasDetailAlong"]
    if u < first:
        return u * start / first
    if u > last:
        return end + (u - last) * (1 - end) / (1 - last)
    return start + (u - first) * (end - start) / (last - first)


def PlanarUv(mesh, finish, photoFaces):
    uv = mesh.uv_layers.new(name="UVMap")
    minimum = [min(vertex.co[axis] for vertex in mesh.vertices) for axis in range(3)]
    ranges = [max(vertex.co[axis] for vertex in mesh.vertices) - minimum[axis] for axis in range(3)]
    extent = max(max(ranges), 0.003)
    span = min(1.0, max(0.20, extent * 1.9))
    for polygon in mesh.polygons:
        axis = max(range(3), key=lambda index: abs(polygon.normal[index]))
        uAxis, vAxis = [(1, 2), (0, 2), (0, 1)][axis]
        direction = polygon.normal[axis]
        photographed = photoFaces.get((axis, 1 if direction > 0 else -1)) if abs(direction) > .9 else None
        for loop in polygon.loop_indices:
            point = mesh.vertices[mesh.loops[loop].vertex_index].co
            if photographed is not None:
                rect, flipU, rotate = photographed
                u = (point[uAxis] - minimum[uAxis]) / ranges[uAxis]
                v = (point[vAxis] - minimum[vAxis]) / ranges[vAxis]
                u = 1 - u if flipU else u
                uv.data[loop].uv = PhotoUv(rect, v, 1 - u) if rotate else PhotoUv(rect, u, v)
            else:
                u = 0.5 + (point[uAxis] - minimum[uAxis] - ranges[uAxis] / 2) * span / extent
                v = 0.5 + (point[vAxis] - minimum[vAxis] - ranges[vAxis] / 2) * span / extent
                uv.data[loop].uv = AtlasUv(finish, u, v)


class Prop:
    def __init__(self, root, materials, photoRegions, hoseWinding=None, leftForelegWear=None):
        self.root = root
        self.materials = materials
        self.photoRegions = photoRegions
        self.hoseWinding = hoseWinding
        self.leftForelegWear = leftForelegWear

    def Group(self, name):
        self.collection = bpy.data.collections.new(name)
        self.root.children.link(self.collection)

    def Mesh(self, name, vertices, faces, finish, bevel=0, project=True):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        if project:
            photoFaces = {(axis, direction): (self.photoRegions[region], flipU, region == "LeftCradleCheek")
                          for region, axis, direction, flipU in PLANAR_PHOTO_FACES.get(name, ())
                          if region in self.photoRegions}
            PlanarUv(mesh, finish, photoFaces)
        obj = bpy.data.objects.new(name, mesh)
        self.collection.objects.link(obj)
        mesh.materials.append(self.materials[finish])
        if bevel:
            modifier = obj.modifiers.new("RoundedEdges", "BEVEL")
            modifier.width = bevel
            modifier.segments = 3
            modifier.harden_normals = True
            obj.modifiers.new("WeightedNormals", "WEIGHTED_NORMAL")
        return obj

    def Profile(self, name, outline, y, width, finish="BluedSteel", bevel=0.003):
        area = sum(x * nz - nx * z for (x, z), (nx, nz) in zip(outline, outline[1:] + outline[:1]))
        if area < 0:
            outline = tuple(reversed(outline))
        n = len(outline)
        vertices = [(x, edge, z) for edge in (y - width / 2, y + width / 2) for x, z in outline]
        faces = [tuple(range(n)), tuple(reversed(range(n, n * 2)))]
        for i in range(n):
            nextIndex = (i + 1) % n
            faces.append((i, n + i, n + nextIndex, nextIndex))
        return self.Mesh(name, vertices, faces, finish, bevel)

    def Box(self, name, center, size, finish="BluedSteel", bevel=0.002):
        x, y, z = center
        dx, dy, dz = (value / 2 for value in size)
        return self.Profile(name, ((x - dx, z - dz), (x + dx, z - dz), (x + dx, z + dz), (x - dx, z + dz)), y, 2 * dy, finish, bevel)

    def Turned(self, name, start, end, rings, finish, sides=40):
        start, end = Vector(start), Vector(end)
        delta = end - start
        orientation = delta.to_track_quat("Z", "Y")
        # Align oxidation in the source swatch with the top of the piece.
        upInRing = orientation.inverted() @ Vector((0, 0, 1))
        topCorner = round(sides * atan2(upInRing.y, upInRing.x) / tau)
        phase = (sides // 2 - topCorner) % sides
        vertices = []
        for along, radius in rings:
            for i in range(sides):
                angle = tau * i / sides
                vertices.append(start + orientation @ Vector((radius * cos(angle), radius * sin(angle), 0)) + along * delta)
        faces = [tuple(reversed(range(sides)))]
        for ring in range(len(rings) - 1):
            a, b = ring * sides, (ring + 1) * sides
            for i in range(sides):
                j = (i + 1) % sides
                faces.append((a + i, a + j, b + j, b + i))
        faces.append(tuple(range(len(vertices) - sides, len(vertices))))
        obj = self.Mesh(name, vertices, faces, finish, project=False)
        mesh = obj.data
        uv = mesh.uv_layers.new(name="UVMap")
        photoRect = self.photoRegions.get(name)
        rearFaceRect = self.photoRegions.get(f"{name}RearFace")
        topFaceRect = self.photoRegions.get(f"{name}Top")
        surfaceRect = self.photoRegions.get(f"{name}Side")
        endRect = self.photoRegions.get(f"{name}Face")
        rearAtEnd = rearFaceRect is not None and end.x < start.x
        if rearFaceRect is not None or topFaceRect is not None:
            rimRadius = max(radius for _, radius in rings)
        wrap = name not in {"SwivelRing", "TripodSwivel"} and (photoRect is not None or finish in {"WaterJacket", "AgedBrass"})
        wear = self.leftForelegWear if name == "LeftForwardLeg" else None
        if wear is not None:
            alongMin, alongMax = wear["along"]
            arcMin, arcMax = wear["arc"]
            ringPositions = {along for along, _ in rings}
            if (not wrap or not {alongMin, alongMax} <= ringPositions
                    or not all(round(value * sides) == value * sides for value in (arcMin, arcMax))):
                raise ValueError("The left foreleg wear chart must end at existing face boundaries")
            wearRect = self.photoRegions["LeftForwardLegWear"]
        for polygon in mesh.polygons:
            side = 0 < polygon.index < len(faces) - 1
            polygon.use_smooth = side
            rearSurface = polygon.index >= len(faces) - 1 - sides if rearAtEnd else polygon.index <= sides
            if rearFaceRect is not None and rearSurface:
                # The collar's rear disc and adjoining bevel share a planar
                # swatch. Their +X axis puts the image's right edge at -Y.
                rearCenter = end if rearAtEnd else start
                for loop in polygon.loop_indices:
                    radial = mesh.vertices[mesh.loops[loop].vertex_index].co - rearCenter
                    uv.data[loop].uv = PhotoUv(rearFaceRect, .5 - radial.y / (2 * rimRadius),
                                               .5 + radial.z / (2 * rimRadius))
                continue
            if topFaceRect is not None and polygon.index >= len(faces) - 1 - sides:
                # The foot's crown and adjoining bevel share the photographed paint.
                for loop in polygon.loop_indices:
                    radial = mesh.vertices[mesh.loops[loop].vertex_index].co - end
                    uv.data[loop].uv = PhotoUv(topFaceRect, .5 + radial.x / (2 * rimRadius),
                                               .5 + radial.y / (2 * rimRadius))
                continue
            if side:
                ring, i = divmod(polygon.index - 1, sides)
                if wrap:
                    i = (i + phase) % sides
                u0, u1 = i / sides, (i + 1) / sides
                v0, v1 = rings[ring][0], rings[ring + 1][0]
                coordinates = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
                if wrap:
                    coordinates = [(along, 1 - arc) for arc, along in coordinates]
            else:
                uvRadius = 0.466 if name == "BrassEndPlate" else (0.46 if endRect is not None else 0.27)
                coordinates = [(0.5 + uvRadius * cos(tau * i / sides), 0.5 + uvRadius * sin(tau * i / sides))
                               for i in (mesh.loops[loop].vertex_index % sides for loop in polygon.loop_indices)]
            chart = (surfaceRect or photoRect) if side else endRect
            if (side and wear is not None and alongMin <= v0 < v1 <= alongMax
                    and arcMin <= u0 < u1 <= arcMax):
                chart = wearRect
                coordinates = [((along - alongMin) / (alongMax - alongMin),
                                (v - (1 - arcMax)) / (arcMax - arcMin)) for along, v in coordinates]
            for loop, (u, v) in zip(polygon.loop_indices, coordinates):
                uv.data[loop].uv = PhotoUv(chart, u, v) if chart is not None else AtlasUv(finish, u, v)
        return obj

    def Pin(self, name, start, end, radius, finish="BluedSteel", sides=28):
        return self.Turned(name, start, end, ((0, radius * 0.83), (0.12, radius),
                                             (0.88, radius), (1, radius * 0.83)), finish, sides)

    def Hose(self, name, points, radius):
        curve = bpy.data.curves.new(name, "CURVE")
        curve.dimensions = "3D"
        curve.resolution_u = 10
        curve.bevel_depth = radius
        curve.bevel_resolution = 4
        curve.use_fill_caps = True
        spline = curve.splines.new("BEZIER")
        spline.bezier_points.add(len(points) - 1)
        for point, coordinates in zip(spline.bezier_points, points):
            point.co = coordinates
            point.handle_left_type = point.handle_right_type = "AUTO"
        obj = bpy.data.objects.new(name, curve)
        self.collection.objects.link(obj)
        mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.curves.remove(curve)
        mesh.materials.append(self.materials["Rubber"])
        photoRect = self.photoRegions.get(name)
        if photoRect is not None:
            mesh.materials.append(self.materials["HoseExterior"])
        uv = mesh.uv_layers.active.data if photoRect is not None else None
        for face in mesh.polygons:
            face.use_smooth = True
            # The generated tube already has an axial U and a wrapped V.
            # Its triangle caps retain the plain material and existing UVs.
            if photoRect is not None and len(face.vertices) == 4:
                face.material_index = 1
                for index in face.loop_indices:
                    u, v = uv[index].uv
                    if self.hoseWinding is not None:
                        u = HoseLongitudinalUv(u, self.hoseWinding)
                    uv[index].uv = PhotoUv(photoRect, u, v)
        obj = bpy.data.objects.new(name, mesh)
        self.collection.objects.link(obj)

    def Loop(self, name, center, radius, thickness, twist):
        vertices, faces = [], []
        for i in range(12):
            along = tau * i / 12
            for j in range(6):
                around = tau * j / 6
                orbit = (radius + thickness * cos(around)) * cos(along)
                rim = thickness * sin(around)
                z = 1.3 * (radius + thickness * cos(around)) * sin(along)
                vertices.append((center[0] + orbit * cos(twist) - rim * sin(twist),
                                 center[1] + orbit * sin(twist) + rim * cos(twist), center[2] + z))
                faces.append((i * 6 + j, ((i + 1) % 12) * 6 + j,
                              ((i + 1) % 12) * 6 + (j + 1) % 6, i * 6 + (j + 1) % 6))
        obj = self.Mesh(name, vertices, faces, "BluedSteel")
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def Jacket(prop):
    prop.Group("Jacket")
    axisZ = 0.788
    prop.Turned("WaterJacket", (0.002, 0, axisZ), (0.590, 0, axisZ),
                ((0, 0.056), (0.012, 0.061), (0.040, 0.061), (0.928, 0.059), (0.980, 0.059), (1, 0.057)), "WaterJacket", 64)
    prop.Pin("RearJacketCollar", (-0.020, 0, axisZ), (0.028, 0, axisZ), 0.064, "BluedSteel", 56)
    prop.Pin("BrassFaceBand", (0.553, 0, axisZ), (0.602, 0, axisZ), 0.061, "AgedBrass", 64)
    prop.Pin("BrassEndPlate", (0.598, 0, axisZ), (0.608, 0, axisZ), 0.054, "BrassFace", 56)
    prop.Pin("FrontShoulder", (0.604, 0, 0.760), (0.621, 0, 0.760), 0.021, "AgedBrass", 12)
    prop.Pin("MuzzleExterior", (0.617, 0, 0.760), (0.649, 0, 0.760), 0.013)
    prop.Pin("MuzzleShadow", (0.6488, 0, 0.760), (0.6498, 0, 0.760), 0.0061, "DarkRecess", 24)
    prop.Pin("UpperFaceCap", (0.605, 0, 0.812), (0.612, 0, 0.812), 0.014, "BrassFace", 24)
    prop.Box("ForwardSightBase", (0.557, 0, 0.851), (0.040, 0.028, 0.012), bevel=0.003)
    prop.Profile("ForwardSightOutline", ((0.542, 0.851), (0.548, 0.882), (0.561, 0.887),
                                         (0.570, 0.876), (0.572, 0.851)), 0, 0.013)
    prop.Pin("HoseFitting", (0.580, -0.035, 0.744), (0.581, -0.058, 0.720), 0.012, "AgedBrass", 12)
    prop.Pin("HoseFerrule", (0.581, -0.055, 0.725), (0.582, -0.065, 0.709), 0.009, "AgedBrass", 18)


def Receiver(prop):
    prop.Group("Receiver")
    prop.Profile("ReceiverShell", ((-0.454, 0.803), (-0.423, 0.815), (-0.075, 0.815), (-0.022, 0.796),
                                   (-0.020, 0.712), (-0.054, 0.689), (-0.138, 0.684), (-0.140, 0.663),
                                   (-0.205, 0.653), (-0.215, 0.674), (-0.421, 0.678), (-0.454, 0.702)), 0, 0.107, bevel=0.004)
    prop.Profile("UpperCover", ((-0.448, 0.804), (-0.422, 0.830), (-0.257, 0.830), (-0.244, 0.822),
                                (-0.071, 0.822), (-0.040, 0.805)), 0, 0.105, bevel=0.004)
    prop.Box("FrontBridge", (-0.084, 0, 0.796), (0.063, 0.125, 0.041), bevel=0.0035)
    prop.Box("RearPlate", (-0.443, 0, 0.750), (0.028, 0.115, 0.112), bevel=0.005)
    prop.Box("RearSightBase", (-0.342, 0, 0.837), (0.080, 0.027, 0.015))
    prop.Box("RearSightFoldedLeaf", (-0.356, 0, 0.844), (0.061, 0.017, 0.012))
    for side, name in ((-1, "Left"), (1, "Right")):
        prop.Profile(f"{name}SidePanel", ((-0.435, 0.793), (-0.114, 0.793), (-0.108, 0.704),
                                          (-0.201, 0.693), (-0.431, 0.693)), side * 0.053, 0.009, bevel=0.002)
        prop.Box(f"{name}FrontInset", (-0.081, side * 0.063, 0.786), (0.042, 0.004, 0.012), "DarkRecess", 0.001)
        prop.Box(f"{name}Fitting", (-0.066, side * 0.063, 0.784), (0.014, 0.007, 0.023), bevel=0.0015)
        for i, (x, z) in enumerate(((-0.411, 0.775), (-0.411, 0.709), (-0.286, 0.706), (-0.176, 0.704), (-0.118, 0.775))):
            prop.Pin(f"{name}Rivet{i + 1:02}", (x, 0.056 * side, z), (x, 0.061 * side, z), 0.0055, sides=18)
    prop.Box("LeftExteriorRail", (-0.238, -0.062, 0.779), (0.135, 0.010, 0.013), bevel=0.0024)
    prop.Pin("RightExteriorKnob", (-0.219, 0.055, 0.772), (-0.219, 0.079, 0.772), 0.011)
    prop.Pin("RearGripCollar", (-0.448, 0, 0.746), (-0.491, 0, 0.746), 0.020)
    prop.Profile("WalnutGrip", ((-0.514, 0.755), (-0.478, 0.752), (-0.466, 0.736),
                                 (-0.480, 0.714), (-0.485, 0.681), (-0.488, 0.650), (-0.532, 0.648),
                                 (-0.538, 0.660), (-0.523, 0.690), (-0.519, 0.718), (-0.524, 0.738)),
                 0, 0.046, "DarkWalnut", 0.008)
    prop.Profile("GripHeel", ((-0.535, 0.653), (-0.488, 0.653), (-0.487, 0.646), (-0.533, 0.644)),
                 0, 0.044, bevel=0.002)
    prop.Profile("GuardOutline", ((-0.477, 0.726), (-0.467, 0.723), (-0.458, 0.687), (-0.421, 0.689),
                                   (-0.418, 0.705), (-0.410, 0.703), (-0.414, 0.681), (-0.464, 0.677)), 0, 0.016)


def Tripod(prop):
    prop.Group("Tripod")
    cast = "TripodSteel"
    outline = ((-0.188, 0.689), (-0.147, 0.701), (-0.078, 0.700), (-0.034, 0.730), (0.012, 0.731),
               (0.091, 0.702), (0.114, 0.676), (0.101, 0.649), (0.069, 0.623), (0.032, 0.602),
               (-0.041, 0.591), (-0.112, 0.613), (-0.164, 0.654))
    for side, label in ((-1, "Left"), (1, "Right")):
        prop.Profile(f"{label}CradleCheek", outline, side * 0.045, 0.019, "BluedSteel", 0.0045)
        prop.Pin(f"{label}CradlePivot", (0.014, side * 0.049, 0.683), (0.014, side * 0.073, 0.683), 0.018, cast)
        prop.Pin(f"{label}PivotEnd", (0.014, side * 0.070, 0.683), (0.014, side * 0.079, 0.683), 0.010, "SteelRub", 14)
    prop.Pin("CradleCrossPin", (0.030, -0.062, 0.618), (0.030, 0.062, 0.618), 0.017, cast)
    prop.Turned("TripodSwivel", (0.035, 0, 0.495), (0.035, 0, 0.623),
                ((0, 0.059), (0.05, 0.066), (0.30, 0.066), (0.35, 0.056), (0.59, 0.052),
                 (0.66, 0.044), (0.90, 0.036), (1, 0.031)), cast, 48)
    prop.Pin("SwivelRing", (0.035, 0, 0.539), (0.035, 0, 0.552), 0.058, "TripodRub", 48)
    legs = (
        ("LeftForward", (0.066, -0.044, 0.505), (0.495, -0.359, 0.020)),
        ("RightForward", (0.066, 0.044, 0.505), (0.495, 0.359, 0.020)),
        ("Rear", (-0.017, 0, 0.506), (-0.805, 0, 0.018)),
    )
    for name, start, end in legs:
        start, end = Vector(start), Vector(end)
        leg = prop.Turned(f"{name}Leg", start, end, ((0, 0.025), (0.052, 0.028), (0.140, 0.025),
                         (0.177, 0.020), (0.883, 0.016), (0.960, 0.019), (1, 0.015)), cast, 32)
        if name == "Rear" and "RearLegSteel" in prop.materials:
            leg.data.materials[0] = prop.materials["RearLegSteel"]
        prop.Pin(f"{name}LegCollar", start.lerp(end, 0.12), start.lerp(end, 0.19), 0.026, cast)
        prop.Pin(f"{name}Foot", (end.x, end.y, 0.002), (end.x, end.y, 0.028), 0.035, cast, 32)
        prop.Box(f"{name}FootTab", (end.x + (0.012 if name != "Rear" else -0.018), end.y, 0.011),
                 (0.069, 0.039, 0.018), cast, 0.006)
    prop.Pin("HingeCrossbar", (0.037, -0.074, 0.493), (0.037, 0.074, 0.493), 0.015, "SteelRub")
    prop.Pin("RearBrace", (-0.047, 0.026, 0.599), (-0.288, 0.026, 0.369), 0.008, cast, 24)
    prop.Pin("RearBraceSleeve", (-0.077, 0.026, 0.570), (-0.186, 0.026, 0.466), 0.014, cast, 24)


def Fittings(prop):
    prop.Group("WaterJacketFittings")
    prop.Hose("HangingHose", ((0.582, -0.064, 0.711), (0.591, -0.090, 0.645), (0.603, -0.095, 0.491),
                              (0.623, -0.122, 0.298), (0.661, -0.199, 0.124), (0.638, -0.256, 0.035),
                              (0.594, -0.288, 0.009), (0.541, -0.313, 0.009)), 0.008)
    for i in range(10):
        prop.Loop(f"CapRetainingChain{i + 1:02}", (0.598, -0.004 - 0.0017 * i, 0.731 - 0.010 * i),
                  0.0046, 0.0011, pi / 2 * (i % 2))


def RemoveCollection(collection):
    for child in list(collection.children):
        RemoveCollection(child)
    dataCollections = {"MESH": bpy.data.meshes, "CAMERA": bpy.data.cameras, "LIGHT": bpy.data.lights}
    for obj in list(collection.objects):
        data, kind = obj.data, obj.type
        bpy.data.objects.remove(obj, do_unlink=True)
        if kind in dataCollections and not data.users:
            dataCollections[kind].remove(data)
    bpy.data.collections.remove(collection)


def UseStudio(scene):
    studio = bpy.data.collections.new(STUDIO)
    scene.collection.children.link(studio)
    ground = bpy.data.meshes.new("ReviewGround")
    ground.from_pydata([(-30, -30, 0), (30, -30, 0), (30, 30, 0), (-30, 30, 0)], [], [(0, 1, 2, 3)])
    floor = bpy.data.objects.new("ReviewGround", ground)
    studio.objects.link(floor)
    ground.materials.append(Material("Material_Type30ReviewGround", (0.153, 0.176, 0.177), 0, 0.84))
    target = Vector((-0.04, 0, 0.45))
    sources = (
        ("Key", (0.05, -2.2, 2.2), 320, 2.20, (1.0, 0.94, 0.85)),
        ("Fill", (1.7, 0.32, 1.35), 140, 1.45, (0.83, 0.92, 1.0)),
        ("Rim", (-0.7, 1.7, 2.5), 340, 1.85, (0.92, 0.97, 1.0)),
    )
    for name, position, energy, size, color in sources:
        objectName = f"Review{name}"
        light = bpy.data.lights.new(objectName, "AREA")
        light.energy, light.shape, light.size, light.color = energy, "DISK", size, color
        obj = bpy.data.objects.new(objectName, light)
        studio.objects.link(obj)
        obj.location = position
        obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()
    cameras = (
        ("Hero", (1.03, -2.03, 1.36), (-0.02, 0, 0.415), 2.04),
        ("Left", (0.0, -3.1, 0.66), (-0.07, 0, 0.432), 1.94),
        ("Rear", (-1.05, 2.12, 1.22), (-0.04, 0, 0.425), 2.0),
        ("Detail", (1.10, -1.8, 1.18), (0.045, 0, 0.729), 1.20),
    )
    for name, position, lookAt, scale in cameras:
        objectName = f"Review{name}"
        data = bpy.data.cameras.new(objectName)
        obj = bpy.data.objects.new(objectName, data)
        studio.objects.link(obj)
        data.type, data.ortho_scale = "ORTHO", scale
        obj.location = position
        obj.rotation_euler = (Vector(lookAt) - obj.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = bpy.data.objects["ReviewHero"]
    scene.world = bpy.data.worlds.new("World_Type30Review")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.32, 0.36, 0.41, 1)
    background.inputs["Strength"].default_value = 0.27
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1560, 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"


def MakeExportMeshes(asset, exportCollection, trackAoParts=False):
    depgraph = bpy.context.evaluated_depsgraph_get()
    gameOrientation = Matrix.Rotation(-pi / 2, 4, "Z")
    merged = []
    partIndex = 0
    for collection in asset.children:
        parts = []
        for part in collection.objects:
            mesh = bpy.data.meshes.new_from_object(part.evaluated_get(depgraph), preserve_all_data_layers=True, depsgraph=depgraph)
            if trackAoParts:
                labels = mesh.attributes.new(AO_PART_ATTRIBUTE, "INT", "FACE").data
                labels.foreach_set("value", [partIndex] * len(labels))
                partIndex += 1
            obj = bpy.data.objects.new(part.name + "Export", mesh)
            exportCollection.objects.link(obj)
            obj.matrix_world = gameOrientation @ part.matrix_world
            parts.append(obj)
        bpy.ops.object.select_all(action="DESELECT")
        for obj in parts:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        if len(parts) > 1:
            bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        obj.name = collection.name
        triangles = obj.modifiers.new("ExportTriangles", "TRIANGULATE")
        triangles.keep_custom_normals = True
        bpy.ops.object.modifier_apply(modifier=triangles.name)
        merged.append(obj)
    return merged


def OcclusionTools():
    return runpy.run_path(str(Path(__file__).with_name("Script_Type30HmgOcclusion.py")))


def ExportGlb(asset, destination, aoDir=None):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    exportCollection = bpy.data.collections.new("Type30GlbExport")
    scene.collection.children.link(exportCollection)
    aoDir = aoDir or asset.get("AssemblyAoDirectory")
    aoNodes = []
    try:
        merged = MakeExportMeshes(asset, exportCollection)
        if aoDir is not None:
            ao = OcclusionTools()
            ao["ApplyLayout"](merged, Path(aoDir))
            ao["Bind"](merged, ao["LoadImage"](Path(aoDir)), aoNodes)
        bpy.ops.object.select_all(action="DESELECT")
        for obj in merged:
            obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(destination), export_format="GLB", use_selection=True,
                                  export_yup=True, export_tangents=True)
    finally:
        for graph, node in reversed(aoNodes):
            graph.nodes.remove(node)
        RemoveCollection(exportCollection)


def Render(reviewDir, views, percentage=100):
    reviewDir = Path(reviewDir)
    reviewDir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    originalCamera = scene.camera
    originalPercentage = scene.render.resolution_percentage
    try:
        scene.render.resolution_percentage = percentage
        for view in views:
            scene.camera = bpy.data.objects[f"Review{view}"]
            scene.render.filepath = str(reviewDir / f"Preview_Type30Hmg{view}.png")
            bpy.ops.render.render(write_still=True)
    finally:
        scene.camera = originalCamera
        scene.render.resolution_percentage = originalPercentage


def Build(sourcePath, atlasDir=None, glbPath=None, aoDir=None):
    sourcePath = Path(sourcePath).resolve()
    if bpy.data.filepath and Path(bpy.data.filepath).resolve() != sourcePath:
        raise RuntimeError(f"Unexpected active Blender file: {bpy.data.filepath}")
    if glbPath is not None and atlasDir is None:
        raise RuntimeError("A prepared material atlas is required for GLB export")
    if aoDir is None:
        previous = bpy.data.collections.get(ASSET)
        aoDir = previous.get("AssemblyAoDirectory") if previous is not None else None
        if atlasDir is not None:
            packagedAo = Path(atlasDir).resolve().parent / "AssemblyAO"
            if packagedAo.is_dir():
                aoDir = packagedAo
    scene = bpy.context.scene
    for name in (ASSET, STUDIO):
        if collection := bpy.data.collections.get(name):
            RemoveCollection(collection)
    for material in list(bpy.data.materials):
        if not material.users and material.name.startswith("Material_Type30"):
            bpy.data.materials.remove(material)
    for image in list(bpy.data.images):
        if not image.users and image.name.startswith("Texture_Type30Hmg"):
            bpy.data.images.remove(image)
    if not bpy.data.filepath:
        if (collection := bpy.data.collections.get("Collection")) and set(collection.objects.keys()) <= {"Cube", "Camera", "Light"}:
            RemoveCollection(collection)
    scene.name = "Scene_Type30Hmg"
    asset = bpy.data.collections.new(ASSET)
    scene.collection.children.link(asset)
    asset["Reference"] = "Nanjing City Wall Museum reconstruction and period photographs of the Chinese Type 30"
    asset["Description"] = "Exterior game prop with a solid visual shell. Pointing along Blender +X."
    manifest = Path(atlasDir) / "Data_Type30HmgAtlas.json" if atlasDir is not None else None
    atlas = json.loads(manifest.read_text(encoding="utf-8")) if manifest is not None and manifest.is_file() else {}
    photoRegions = atlas.get("photoRegions", {})
    prop = Prop(asset, AtlasMaterials(atlasDir, photoRegions), photoRegions, atlas.get("hoseLongitudinalUv"),
                atlas.get("leftForelegWear"))
    Jacket(prop)
    Receiver(prop)
    Tripod(prop)
    Fittings(prop)
    if aoDir is not None:
        OcclusionTools()["PackIntoSource"](asset, Path(aoDir))
    UseStudio(scene)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"
    sourcePath.parent.mkdir(parents=True, exist_ok=True)
    if glbPath is not None and aoDir is not None:
        ExportGlb(asset, glbPath)
        bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.wm.save_as_mainfile(filepath=str(sourcePath), compress=True)
    if glbPath is not None and aoDir is None:
        ExportGlb(asset, glbPath)
    print(f"Type 30 · {len(asset.all_objects)} exterior objects · Blender {bpy.app.version_string}")
