"""Build the closed Gongxian-pattern game prop and export the common GLB and TZM."""

import json
import math
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

PROJECT = Path(__file__).resolve().parents[1]
SOURCE = Path.home() / "OneDrive/AI/Models/Blender/Taierzhuang1938/GongxianGrenadeReference_20261126"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from TzmCore import Node, WriteTzm

LENGTH = 0.22  # Existing game/animation envelope.
GRIP_OFFSET = 0.035
SEGMENTS = 96
TRIANGLE_BUDGET = 10000
ATLAS_GUTTER = 12 / 1024
MESH_NAME = "Model_GongxianGrenade"

# Each point is (axial fraction, radius / total length). The visible side profile
# follows the labeled factory display. Side renders were overlaid on its traced
# outline to refine the wood and visible head taper. The continuous skin is
# game geometry.
PROFILE = (
    # Heel, with a narrow edge and a dark face.
    ("iron", (0.195, 0.264), (
        (0.000, 0.049), (0.0015, 0.053), (0.004, 0.056), (0.010, 0.058),
        (0.018, 0.058), (0.038, 0.0568), (0.048, 0.0556), (0.052, 0.0524),
    )),
    # Wooden handle. The thicker ends frame a comparatively narrow center.
    ("wood", (0.032, 0.968), (
        (0.052, 0.0524), (0.060, 0.0558), (0.078, 0.0592), (0.100, 0.0633),
        (0.137, 0.0676), (0.171, 0.0697), (0.232, 0.0720), (0.295, 0.0696),
        (0.364, 0.0640), (0.420, 0.0630), (0.467, 0.0647), (0.507, 0.0703),
        (0.548, 0.0816), (0.578, 0.0940), (0.602, 0.1007), (0.606, 0.1012),
    )),
    # Short dark shoulder and recessed line under the head.
    ("iron", (0.300, 0.432), (
        (0.606, 0.1012), (0.609, 0.1025), (0.615, 0.1057), (0.622, 0.1075),
        (0.628, 0.1082), (0.634, 0.1105), (0.642, 0.1157), (0.650, 0.1236),
        (0.661, 0.1329), (0.671, 0.1374),
    )),
    # Broad dark head, with a slight taper toward the crown in the side view.
    ("iron", (0.470, 0.725), (
        (0.671, 0.1374), (0.680, 0.1394), (0.725, 0.1396), (0.801, 0.1380),
        (0.880, 0.1348), (0.949, 0.1324), (0.978, 0.1318), (0.988, 0.1305),
        (0.995, 0.1284), (1.000, 0.1247),
    )),
)


def BuildGeometry():
    vertices, faces, faceUvs = [], [], []
    previous = None
    for region, (v0, v1), points in PROFILE:
        u0 = 0.0 if region == "wood" else 0.5
        u0 += ATLAS_GUTTER
        uSpan = 0.5 - 2 * ATLAS_GUTTER
        start, finish = points[0][0], points[-1][0]
        for index, (height, radius) in enumerate(points):
            # Reuse the boundary ring between adjacent materials.
            if index == 0 and previous is not None:
                continue
            ring = len(vertices)
            for segment in range(SEGMENTS):
                angle = segment * math.tau / SEGMENTS
                variation = (0.00033 * math.cos(3 * angle + height * 7)
                             + 0.00022 * math.sin(7 * angle - height * 9))
                r = LENGTH * (radius + variation)
                vertices.append((r * math.cos(angle), r * math.sin(angle), LENGTH * (height - 0.5)))

            if previous is not None:
                lowerV = v0 + (v1 - v0) * ((points[index - 1][0] - start) / (finish - start))
                upperV = v0 + (v1 - v0) * ((height - start) / (finish - start))
                for segment in range(SEGMENTS):
                    adjacent = (segment + 1) % SEGMENTS
                    lowerU = u0 + uSpan * segment / SEGMENTS
                    upperU = u0 + uSpan * (segment + 1) / SEGMENTS
                    faces.append((previous + segment, previous + adjacent, ring + adjacent, ring + segment))
                    faceUvs.append(((lowerU, lowerV), (upperU, lowerV), (upperU, upperV), (lowerU, upperV)))
            previous = ring

    # Planar UVs across both closed faces. Separate atlas patches avoid a radial
    # seam through the center and reserve the side strips for the rolled profile.
    for ring, isHead, center, halfWidth in (
        (0, False, (0.77, 0.108), 0.059),
        (previous, True, (0.76, 0.865), 0.118),
    ):
        pole = len(vertices)
        vertices.append((0, 0, vertices[ring][2]))
        scale = halfWidth / math.hypot(*vertices[ring][:2])
        for segment in range(SEGMENTS):
            a = ring + segment
            b = ring + (segment + 1) % SEGMENTS
            if not isHead:
                a, b = b, a
            uvA = (center[0] + vertices[a][0] * scale, center[1] + vertices[a][1] * scale)
            uvB = (center[0] + vertices[b][0] * scale, center[1] + vertices[b][1] * scale)
            faces.append((pole, a, b))
            faceUvs.append((center, uvA, uvB))

    mesh = bpy.data.meshes.new("Mesh_GongxianGrenade")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name="UVMap")
    for face, coordinates in zip(mesh.polygons, faceUvs, strict=True):
        face.use_smooth = True
        for loop, coordinate in zip(face.loop_indices, coordinates, strict=True):
            uv.data[loop].uv = coordinate

    obj = bpy.data.objects.new(MESH_NAME, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def TzmRoot(obj):
    root = Node("root")
    body = root.Child("body")
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(Matrix.Rotation(math.pi, 4, "X"))
    bmesh.ops.translate(bm, verts=list(bm.verts), vec=(0, 0, -GRIP_OFFSET))
    body.Add("grenade", bm, tile="sourceUv")
    body.Child("muzzle", t=(0, 0, -LENGTH / 2 - GRIP_OFFSET))
    body.Child("gripR", t=(0, 0, 0))
    return root


def ValidateGeometry(mesh):
    mesh.calc_loop_triangles()
    triangles = len(mesh.loop_triangles)
    if triangles > TRIANGLE_BUDGET:
        raise ValueError(f"Grenade has {triangles:,} triangles, budget is {TRIANGLE_BUDGET:,}")
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        if not all(edge.is_manifold and edge.is_contiguous for edge in bm.edges) or bm.calc_volume(signed=True) <= 0:
            raise ValueError("Grenade exterior must be consistently wound and closed")
    finally:
        bm.free()
    return triangles


def BuildMaterial():
    material = bpy.data.materials.new("Material_GongxianGrenade")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    textures = {}
    for index, name in enumerate(("Base", "Normal", "Orm")):
        image = bpy.data.images.load(str(PROJECT / "Texture" / f"Texture_Grenade{name}.webp"))
        image.colorspace_settings.name = "sRGB" if name == "Base" else "Non-Color"
        image.pack()
        texture = nodes.new("ShaderNodeTexImage")
        texture.label = name
        texture.image = image
        texture.location = (-640, 340 - index * 270)
        textures[name] = texture

    surface = nodes.get("Principled BSDF")
    links.new(textures["Base"].outputs["Color"], surface.inputs["Base Color"])
    normal = nodes.new("ShaderNodeNormalMap")
    normal.location = (-300, 70)
    normal.inputs["Strength"].default_value = 0.9
    links.new(textures["Normal"].outputs["Color"], normal.inputs["Color"])
    links.new(normal.outputs["Normal"], surface.inputs["Normal"])
    orm = nodes.new("ShaderNodeSeparateColor")
    orm.location = (-300, -200)
    links.new(textures["Orm"].outputs["Color"], orm.inputs["Color"])
    links.new(orm.outputs["Green"], surface.inputs["Roughness"])
    links.new(orm.outputs["Blue"], surface.inputs["Metallic"])
    return material


def BuildStudio(scene):
    world = bpy.data.worlds.new("World_GrenadeStudio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.23, 0.23, 0.23, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.50
    scene.world = world
    cameraData = bpy.data.cameras.new("Camera_GrenadeStudio")
    camera = bpy.data.objects.new("Camera_GrenadeStudio", cameraData)
    scene.collection.objects.link(camera)
    camera.location = (0.24, -0.52, 0.16)
    camera.rotation_euler = (-camera.location).to_track_quat("-Z", "Y").to_euler()
    cameraData.type = "ORTHO"
    cameraData.ortho_scale = 0.27
    scene.camera = camera

    for name, location, power, size in (
        ("Key", (0.16, -0.22, 0.23), 2.3, 0.25),
        ("Fill", (-0.24, -0.15, 0.12), 1.3, 0.28),
        ("Rim", (0.15, 0.20, 0.15), 2.7, 0.19),
    ):
        data = bpy.data.lights.new(f"Light_{name}", "AREA")
        data.energy = power
        data.shape = "DISK"
        data.size = size
        light = bpy.data.objects.new(f"Light_{name}", data)
        scene.collection.objects.link(light)
        light.location = location
        light.rotation_euler = (-light.location).to_track_quat("-Z", "Y").to_euler()

    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 920
    scene.render.resolution_y = 920
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "AgX"
    scene.render.filepath = str(SOURCE / "Preview_GongxianGrenade.png")


def Build():
    scene = bpy.context.scene
    if any(obj.type == "MESH" for obj in scene.objects):
        raise RuntimeError("Build requires a task-owned empty scene")
    SOURCE.mkdir(parents=True, exist_ok=True)
    scene.unit_settings.system = "METRIC"

    obj = BuildGeometry()
    triangles = ValidateGeometry(obj.data)
    obj.data.materials.append(BuildMaterial())
    obj["HistoricalScope"] = "Gongxian-pattern exterior study. Tengxian issue batch unverified."
    obj["Reference"] = "Factory display side view and Culture Taiwan 18000005525 archival photo (1958)."
    obj["RuntimeAxis"] = "Head -Z. Centered GLB. TZM uses the existing grip origin."

    tzm = PROJECT / "Model" / "Model_Grenade.tzm.json"
    glb = PROJECT / "Model" / "Model_Type24Grenade.glb"
    stats = WriteTzm(TzmRoot(obj), str(tzm), "Grenade",
                     "Closed Gongxian-pattern exterior. Reference photos inform the visible silhouette.", audit=True)

    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    # Blender +Y becomes glTF -Z. Restore the editable upright pose after export.
    obj.data.transform(Matrix.Rotation(-math.pi / 2, 4, "X"))
    try:
        bpy.ops.export_scene.gltf(
            filepath=str(glb), export_format="GLB", use_selection=True, export_apply=True,
            export_yup=True, export_animations=False, export_extras=True,
            export_materials="EXPORT", export_image_format="JPEG", export_jpeg_quality=93,
        )
    finally:
        obj.data.transform(Matrix.Rotation(math.pi / 2, 4, "X"))
    obj.data.update()

    for path in sorted((SOURCE / "References").glob("Reference_*.jpg")):
        reference = bpy.data.images.load(str(path))
        reference.pack()
        reference.use_fake_user = True
    BuildStudio(scene)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / f"{MESH_NAME}.blend"))
    report = {"triangles": triangles, "tzm": stats, "glbBytes": glb.stat().st_size, "source": bpy.data.filepath}
    (SOURCE / "Data_GrenadeBuild.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    return report


if __name__ == "__main__":
    print(json.dumps(Build()))
