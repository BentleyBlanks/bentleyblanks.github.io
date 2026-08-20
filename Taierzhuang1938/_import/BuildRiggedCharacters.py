"""Build the redistributable FPS-arms and IJA-soldier GLBs.

Run with Blender 5.x:
  blender --background --python Taierzhuang1938/_import/BuildRiggedCharacters.py

The source assets remain in _import/Source so the build is reproducible. Runtime
files are written to Taierzhuang1938/Model with textures embedded in each GLB.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "_import" / "Source"
MODEL = ROOT / "Model"


def ClearScene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    for collection in (bpy.data.armatures, bpy.data.meshes,
                       bpy.data.materials, bpy.data.images):
        for block in list(collection):
            if getattr(block, "users", 0) == 0:
                collection.remove(block)


def MakeTexturedMaterial(name, image, roughness=0.86):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = 0.0
    links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    links.new(texture.outputs["Alpha"], shader.inputs["Alpha"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    return material


def MakeFlatMaterial(name, color, roughness=0.9, metallic=0.0):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return material


def ExportGlb(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_apply=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_skins=True,
        export_morph=False,
        export_lights=False,
        export_cameras=False,
        export_yup=True,
    )


def SubdivideAndSmooth(obj, level=1):
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    modifier = obj.modifiers.new("Modifier_SurfacePolish", "SUBSURF")
    modifier.subdivision_type = "CATMULL_CLARK"
    modifier.levels = level
    modifier.render_levels = level
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def NewAction(armature, name, frame_end):
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    armature.animation_data_create()
    armature.animation_data.action = action
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = frame_end
    return action


def KeyRotation(bone, frame, xyz):
    bone.rotation_mode = "XYZ"
    bone.rotation_euler = xyz
    bone.keyframe_insert(data_path="rotation_euler", frame=frame)


def BuildArms():
    ClearScene()
    bpy.ops.import_scene.gltf(filepath=str(SOURCE / "Model_WradArms.glb"))
    armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
    mesh = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
    armature.name = "Rig_FpsArms"
    mesh.name = "Mesh_FpsArms"
    SubdivideAndSmooth(mesh)
    if mesh.data.materials:
        mesh.data.materials[0].name = "Material_FpsSkin"

    # The source is authored in large arbitrary units. Keeping the armature's
    # bind matrices intact and scaling its root is the safest deterministic
    # normalization: shoulder-to-shoulder becomes about 0.46 m.
    armature.scale = (0.12, 0.12, 0.12)

    action = NewAction(armature, "GripIdle", 48)
    curl = {
        "1": 0.62,
        "2": 0.82,
        "3": 0.68,
    }
    for frame, breathe in ((1, -0.012), (24, 0.012), (48, -0.012)):
        for side in ("l", "r"):
            for finger in ("index", "middle", "ring", "pinky"):
                for joint, angle in curl.items():
                    bone = armature.pose.bones.get(f"finger_{finger}{joint}.{side}")
                    if bone:
                        KeyRotation(bone, frame, (angle, 0.0, 0.0))
            for joint, angle in (("1", 0.42), ("2", 0.55), ("3", 0.38)):
                bone = armature.pose.bones.get(f"finger_thumb{joint}.{side}")
                if bone:
                    KeyRotation(bone, frame, (angle * 0.45, angle, -angle * 0.25))
            bicep = armature.pose.bones.get(f"bicep.{side}")
            if bicep:
                KeyRotation(bicep, frame, (0.0, breathe, 0.0))
    armature.animation_data.action = action
    ExportGlb(MODEL / "Model_FpsArms.glb")


def RecolorUniform(source_path, output_path):
    image = bpy.data.images.load(str(source_path), check_existing=False)
    image.name = "Texture_IjaSoldier"
    pixels = list(image.pixels)
    for index in range(0, len(pixels), 4):
        red, green, blue, alpha = pixels[index:index + 4]
        # Preserve skin, leather, buttons and metal. Replace black wool and the
        # red armband with a dusty 1938 khaki/olive palette.
        if red > 0.42 and green > 0.20 and red > blue * 1.8:
            continue
        if red > 0.35 and green < 0.18 and blue < 0.18:
            pixels[index:index + 3] = (0.25, 0.25, 0.10)
            continue
        if max(red, green, blue) < 0.24:
            detail = 0.72 + (red + green + blue) * 0.72
            pixels[index:index + 3] = (
                0.42 * detail,
                0.37 * detail,
                0.23 * detail,
            )
    image.pixels.foreach_set(pixels)
    image.filepath_raw = str(output_path)
    image.file_format = "PNG"
    image.save()
    image.pack()
    return image


def ParentToHead(obj, armature):
    world = obj.matrix_world.copy()
    obj.parent = armature
    obj.parent_type = "BONE"
    obj.parent_bone = "Head"
    obj.matrix_world = world


def WorldBounds(obj):
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    return minimum, maximum


def BuildHelmet(armature, body):
    helmet_material = MakeFlatMaterial("Material_IjaHelmet", (0.20, 0.22, 0.12))
    star_material = MakeFlatMaterial("Material_IjaHelmetStar", (0.48, 0.12, 0.08), 0.72, 0.05)
    minimum, maximum = WorldBounds(body)
    height = maximum.z - minimum.z
    center_x = (minimum.x + maximum.x) * 0.5
    center_y = (minimum.y + maximum.y) * 0.5
    dome_z = maximum.z - height * 0.070
    brim_z = maximum.z - height * 0.112
    radius = height * 0.096

    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12,
                                        location=(center_x, center_y, dome_z))
    dome = bpy.context.object
    dome.name = "Mesh_IjaHelmetDome"
    dome.scale = (radius, radius * 0.92, height * 0.066)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    dome.data.materials.append(helmet_material)
    ParentToHead(dome, armature)

    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius * 1.13, depth=height * 0.010,
                                        location=(center_x, center_y, brim_z))
    brim = bpy.context.object
    brim.name = "Mesh_IjaHelmetBrim"
    brim.scale.y = 0.88
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    brim.data.materials.append(helmet_material)
    ParentToHead(brim, armature)

    front_y = minimum.y - height * 0.005
    star_z = maximum.z - height * 0.083
    vertices = [(center_x, front_y, star_z)]
    for point in range(10):
        angle = math.pi * 0.5 + point * math.pi / 5
        star_radius = height * (0.013 if point % 2 == 0 else 0.0055)
        vertices.append((center_x + math.cos(angle) * star_radius, front_y,
                         star_z + math.sin(angle) * star_radius))
    faces = [(0, point + 1, ((point + 1) % 10) + 1) for point in range(10)]
    mesh = bpy.data.meshes.new("Mesh_IjaHelmetStar")
    mesh.from_pydata(vertices, [], faces)
    star = bpy.data.objects.new("Mesh_IjaHelmetStar", mesh)
    bpy.context.collection.objects.link(star)
    star.data.materials.append(star_material)
    ParentToHead(star, armature)


def AddSoldierActions(armature):
    poses = {
        "Idle": {
            1: {"Spine2": (0.00, 0.00, -0.018)},
            24: {"Spine2": (0.018, 0.00, 0.018)},
            48: {"Spine2": (0.00, 0.00, -0.018)},
        },
        "Walk": {
            1: {"LeftUpLeg": (0.58, 0, 0), "RightUpLeg": (-0.58, 0, 0),
                "LeftArm": (-0.38, 0, 0), "RightArm": (0.38, 0, 0)},
            13: {"LeftUpLeg": (-0.58, 0, 0), "RightUpLeg": (0.58, 0, 0),
                 "LeftArm": (0.38, 0, 0), "RightArm": (-0.38, 0, 0)},
            25: {"LeftUpLeg": (0.58, 0, 0), "RightUpLeg": (-0.58, 0, 0),
                 "LeftArm": (-0.38, 0, 0), "RightArm": (0.38, 0, 0)},
        },
        "AimRifle": {
            1: {"LeftArm": (-0.72, 0.18, -0.82), "LeftForeArm": (-1.10, 0.0, 0.0),
                "RightArm": (-0.82, -0.12, 0.68), "RightForeArm": (-1.24, 0.0, 0.0)},
            30: {"LeftArm": (-0.72, 0.18, -0.82), "LeftForeArm": (-1.10, 0.0, 0.0),
                 "RightArm": (-0.82, -0.12, 0.68), "RightForeArm": (-1.24, 0.0, 0.0)},
        },
        "Death": {
            1: {"Hips": (0, 0, 0), "Spine2": (0, 0, 0)},
            28: {"Hips": (0.35, 0.10, 0.18), "Spine2": (0.72, 0.12, 0.18),
                 "Head": (0.35, 0.0, 0.18)},
            48: {"Hips": (1.34, 0.12, 0.25), "Spine2": (0.38, 0.0, 0.12),
                 "Head": (0.28, 0.0, 0.12)},
        },
    }
    for name, frames in poses.items():
        action = NewAction(armature, name, max(frames))
        for frame, rotations in frames.items():
            for bone_name, rotation in rotations.items():
                bone = armature.pose.bones.get(bone_name)
                if bone:
                    KeyRotation(bone, frame, rotation)
        armature.animation_data.action = action


SEGMENT_BY_BONE = {
    "Hips": "hips",
    "Spine": "hips", "Spine1": "chest", "Spine2": "chest",
    "Neck": "neck", "Head": "neck", "HeadTop_End": "neck",
    "LeftShoulder": "chest", "RightShoulder": "chest",
    "LeftArm": "armL", "RightArm": "armR",
    "LeftForeArm": "foreL", "LeftHand": "foreL",
    "RightForeArm": "foreR", "RightHand": "foreR",
    "LeftUpLeg": "thighL", "RightUpLeg": "thighR",
    "LeftLeg": "shinL", "RightLeg": "shinR",
    "LeftFoot": "footL", "LeftToeBase": "footL", "LeftToe_End": "footL",
    "RightFoot": "footR", "RightToeBase": "footR", "RightToe_End": "footR",
}


def OldRigPivots(height=1.62):
    return {
        "hips": Vector((0, 0, 0.520 * height)),
        "chest": Vector((0, 0, 0.600 * height)),
        "neck": Vector((0, 0, 0.855 * height)),
        "armL": Vector((-0.113 * height, 0, 0.800 * height)),
        "armR": Vector((0.113 * height, 0, 0.800 * height)),
        "foreL": Vector((-0.113 * height, 0, 0.635 * height)),
        "foreR": Vector((0.113 * height, 0, 0.635 * height)),
        "thighL": Vector((-0.050 * height, 0, 0.520 * height)),
        "thighR": Vector((0.050 * height, 0, 0.520 * height)),
        "shinL": Vector((-0.050 * height, 0, 0.285 * height)),
        "shinR": Vector((0.050 * height, 0, 0.285 * height)),
        "footL": Vector((-0.050 * height, 0, 0.055 * height)),
        "footR": Vector((0.050 * height, 0, 0.055 * height)),
    }


def BuildRigidSegments(body, height=1.62):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = body.evaluated_get(depsgraph)
    source_mesh = bpy.data.meshes.new_from_object(
        evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
    world_positions = [body.matrix_world @ vertex.co for vertex in source_mesh.vertices]
    minimum = Vector(tuple(min(point[axis] for point in world_positions) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in world_positions) for axis in range(3)))
    source_height = max(0.001, maximum.z - minimum.z)
    scale = height / source_height
    foot_center = Vector(((minimum.x + maximum.x) * 0.5,
                          (minimum.y + maximum.y) * 0.5, minimum.z))
    normalize = Matrix.Scale(scale, 4) @ Matrix.Translation(-foot_center) @ body.matrix_world
    normalized_positions = [normalize @ vertex.co for vertex in source_mesh.vertices]
    vertex_segments = []
    for position in normalized_positions:
        x, z = position.x, position.z
        side = "L" if x < 0 else "R"
        if z < 0.13 * height:
            segment = f"foot{side}"
        elif z < 0.30 * height:
            segment = f"shin{side}"
        elif z < 0.52 * height:
            segment = f"thigh{side}"
        elif z < 0.61 * height:
            segment = "hips"
        elif abs(x) > 0.12 * height and z > 0.60 * height:
            segment = f"fore{side}" if abs(x) > 0.30 * height else f"arm{side}"
        elif z < 0.855 * height:
            segment = "chest"
        else:
            segment = "neck"
        vertex_segments.append(segment)

    face_segments = []
    for polygon in source_mesh.polygons:
        votes = {}
        for vertex_index in polygon.vertices:
            key = vertex_segments[vertex_index]
            votes[key] = votes.get(key, 0) + 1
        face_segments.append(max(votes, key=votes.get))

    pivots = OldRigPivots(height)
    built = []
    for segment, pivot in pivots.items():
        mesh = source_mesh.copy()
        mesh.transform(normalize)
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bm.faces.ensure_lookup_table()
        remove_faces = [face for face in bm.faces if face_segments[face.index] != segment]
        bmesh.ops.delete(bm, geom=remove_faces, context="FACES")
        loose = [vertex for vertex in bm.verts if not vertex.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context="VERTS")
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()
        coords = [vertex.co for vertex in mesh.vertices]
        if coords and segment.startswith(("arm", "fore", "thigh", "shin", "foot")):
            low = Vector(tuple(min(point[axis] for point in coords) for axis in range(3)))
            high = Vector(tuple(max(point[axis] for point in coords) for axis in range(3)))
            if segment.endswith("L") and segment.startswith(("arm", "fore")):
                source_pivot = Vector((high.x, (low.y + high.y) * 0.5, (low.z + high.z) * 0.5))
                source_direction = Vector((-1, 0, 0))
            elif segment.endswith("R") and segment.startswith(("arm", "fore")):
                source_pivot = Vector((low.x, (low.y + high.y) * 0.5, (low.z + high.z) * 0.5))
                source_direction = Vector((1, 0, 0))
            else:
                source_pivot = Vector(((low.x + high.x) * 0.5, (low.y + high.y) * 0.5, high.z))
                source_direction = Vector((0, 0, -1))
            target_direction = Vector((0, 0, -1))
            rotation = source_direction.rotation_difference(target_direction).to_matrix().to_4x4()
            mesh.transform(Matrix.Translation(pivot) @ rotation @ Matrix.Translation(-source_pivot))
        mesh.transform(Matrix.Translation(-pivot))
        obj = bpy.data.objects.new(f"Segment_{segment}", mesh)
        bpy.context.collection.objects.link(obj)
        obj.location = pivot
        built.append(obj)
    bpy.data.meshes.remove(source_mesh)
    return built


def BuildSegmentHelmet(height=1.62):
    pivot = OldRigPivots(height)["neck"]
    material = MakeFlatMaterial("Material_IjaHelmet", (0.20, 0.22, 0.12))
    star_material = MakeFlatMaterial("Material_IjaHelmetStar", (0.48, 0.12, 0.08), 0.72, 0.05)
    head_z = 0.952 * height
    radius = 0.098 * height

    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12)
    dome = bpy.context.object
    dome.name = "Segment_neck_HelmetDome"
    dome.scale = (radius, radius * 0.92, 0.067 * height)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    dome.data.transform(Matrix.Translation(Vector((0, 0, head_z)) - pivot))
    dome.location = pivot
    dome.data.materials.append(material)

    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius * 1.13, depth=0.010 * height)
    brim = bpy.context.object
    brim.name = "Segment_neck_HelmetBrim"
    brim.scale.y = 0.88
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    brim.data.transform(Matrix.Translation(Vector((0, 0, 0.897 * height)) - pivot))
    brim.location = pivot
    brim.data.materials.append(material)

    front_y = 0.105 * height
    star_z = 0.925 * height
    vertices = [(0, front_y, star_z)]
    for point in range(10):
        angle = math.pi * 0.5 + point * math.pi / 5
        r = height * (0.013 if point % 2 == 0 else 0.0055)
        vertices.append((math.cos(angle) * r, front_y, star_z + math.sin(angle) * r))
    faces = [(0, point + 1, ((point + 1) % 10) + 1) for point in range(10)]
    mesh = bpy.data.meshes.new("Mesh_IjaHelmetStar")
    mesh.from_pydata([Vector(vertex) - pivot for vertex in vertices], [], faces)
    star = bpy.data.objects.new("Segment_neck_HelmetStar", mesh)
    bpy.context.collection.objects.link(star)
    star.location = pivot
    star.data.materials.append(star_material)


def BuildSoldier():
    ClearScene()
    bpy.ops.import_scene.fbx(filepath=str(SOURCE / "Model_LowpolyWw2Soldier.fbx"))
    armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
    body = next(obj for obj in bpy.context.scene.objects
                if obj.type == "MESH" and obj.name.startswith("Soldier"))
    armature.name = "Rig_IjaSoldier"
    body.name = "Mesh_IjaSourceSkin"
    armature.data.pose_position = "REST"
    bpy.context.view_layer.update()
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH" and obj is not body:
            bpy.data.objects.remove(obj, do_unlink=True)

    uniform = RecolorUniform(SOURCE / "Texture_LowpolyWw2Soldier.png",
                             MODEL / "Texture_IjaSoldier.png")
    material = MakeTexturedMaterial("Material_IjaUniform", uniform)
    body.data.materials.clear()
    body.data.materials.append(material)
    BuildRigidSegments(body)
    BuildSegmentHelmet()
    AddSoldierActions(armature)
    armature.data.pose_position = "POSE"
    ExportGlb(MODEL / "Model_IjaSoldier.glb")


if __name__ == "__main__":
    BuildArms()
    BuildSoldier()
    print("Built Model_FpsArms.glb and Model_IjaSoldier.glb")
