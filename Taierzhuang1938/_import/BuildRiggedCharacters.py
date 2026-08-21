"""Build the redistributable FPS-arms, NRA, IJA and civilian GLBs.

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
    shader.inputs["Alpha"].default_value = 1.0
    links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    # Uniform atlases have no cutouts. Linking an otherwise unused PNG alpha
    # channel makes Blender export alphaMode=BLEND; Three.js then disables
    # depth writes for the whole soldier and body parts show through the head.
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


def FixOpaquePalette(body, palette):
    """Repair Quaternius FBX materials and apply the game's period palette.

    Blender 5 imports this pack's diffuse alpha as zero. Exporting untouched
    therefore writes alphaMode=MASK with baseColorFactor.a=0, making the whole
    downloaded character invisible in Three.js.
    """
    for material in body.data.materials:
        if material is None:
            continue
        color = palette.get(material.name, tuple(material.diffuse_color[:3]))
        material.diffuse_color = (*color, 1.0)
        material.use_nodes = True
        shader = material.node_tree.nodes.get("Principled BSDF")
        if shader:
            shader.inputs["Base Color"].default_value = (*color, 1.0)
            shader.inputs["Alpha"].default_value = 1.0
            shader.inputs["Roughness"].default_value = 0.88


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

QUATERNIUS_SEGMENT_BY_BONE = {
    "Body": "hips", "Hips": "hips",
    "Abdomen": "chest", "Torso": "chest",
    "Neck": "neck", "Head": "neck", "Head_end": "neck",
    "Shoulder.L": "chest", "Shoulder.R": "chest",
    "UpperArm.L": "armL", "LowerArm.L": "foreL", "Fist.L": "foreL", "Fist.L_end": "foreL",
    "UpperArm.R": "armR", "LowerArm.R": "foreR", "Fist.R": "foreR", "Fist.R_end": "foreR",
    "UpperLeg.L": "thighL", "LowerLeg.L": "shinL", "LowerLeg.L_end": "shinL", "Foot.L": "footL",
    "UpperLeg.R": "thighR", "LowerLeg.R": "shinR", "LowerLeg.R_end": "shinR", "Foot.R": "footR",
}

IJA_PIVOT_BONES = {
    "hips": "Hips", "chest": "Spine", "neck": "Neck",
    "armL": "LeftArm", "foreL": "LeftForeArm", "armR": "RightArm", "foreR": "RightForeArm",
    "thighL": "LeftUpLeg", "shinL": "LeftLeg", "footL": "LeftFoot",
    "thighR": "RightUpLeg", "shinR": "RightLeg", "footR": "RightFoot",
}

QUATERNIUS_PIVOT_BONES = {
    "hips": "Hips", "chest": "Abdomen", "neck": "Neck",
    "armL": "UpperArm.L", "foreL": "LowerArm.L", "armR": "UpperArm.R", "foreR": "LowerArm.R",
    "thighL": "UpperLeg.L", "shinL": "LowerLeg.L", "footL": "Foot.L",
    "thighR": "UpperLeg.R", "shinR": "LowerLeg.R", "footR": "Foot.R",
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


def BuildRigidSegments(body, armature, height, segment_by_bone, pivot_bones, facing_turn=math.pi):
    """Bake a downloaded skinned mesh into the game's proven 13 rigid joints.

    The old implementation guessed a limb from its XYZ position, then guessed a
    pivot from that limb's bounding box. That is why shoulders, sleeves and the
    helmet visibly separated in the actor editor. Here every face follows the
    source FBX's actual skin weights and every segment pivots around the source
    skeleton's real rest bone before it is aligned to the gameplay skeleton.
    """
    source_mesh = body.data.copy()
    world_positions = [body.matrix_world @ vertex.co for vertex in source_mesh.vertices]
    minimum = Vector(tuple(min(point[axis] for point in world_positions) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in world_positions) for axis in range(3)))
    source_height = max(0.001, maximum.z - minimum.z)
    scale = height / source_height
    foot_center = Vector(((minimum.x + maximum.x) * 0.5,
                          (minimum.y + maximum.y) * 0.5, minimum.z))
    normalize = (Matrix.Rotation(facing_turn, 4, "Z") @ Matrix.Scale(scale, 4)
                 @ Matrix.Translation(-foot_center))
    group_names = {group.index: group.name for group in body.vertex_groups}
    face_segments = []
    for polygon in source_mesh.polygons:
        votes = {}
        for vertex_index in polygon.vertices:
            for membership in body.data.vertices[vertex_index].groups:
                key = segment_by_bone.get(group_names.get(membership.group))
                if key:
                    votes[key] = votes.get(key, 0.0) + membership.weight
        if votes:
            face_segments.append(max(votes, key=votes.get))
        else:
            # A source accessory without weights belongs to the closest broad
            # body region. This is a last-resort path, not the normal rig path.
            center = normalize @ body.matrix_world @ polygon.center
            face_segments.append("neck" if center.z > 0.84 * height else
                                 ("chest" if center.z > 0.58 * height else "hips"))

    pivots = OldRigPivots(height)
    target_directions = {
        "hips": Vector((0, 0, 1)), "chest": Vector((0, 0, 1)), "neck": Vector((0, 0, 1)),
        "armL": Vector((0, 0, -1)), "foreL": Vector((0, 0, -1)),
        "armR": Vector((0, 0, -1)), "foreR": Vector((0, 0, -1)),
        "thighL": Vector((0, 0, -1)), "shinL": Vector((0, 0, -1)),
        "thighR": Vector((0, 0, -1)), "shinR": Vector((0, 0, -1)),
        # Blender +Y becomes glTF -Z, which is forward everywhere in the game.
        "footL": Vector((0, 1, 0)), "footR": Vector((0, 1, 0)),
    }
    def PruneChestOutliers(mesh):
        """Remove disconnected source-skin scraps incorrectly weighted to chest.

        The CC0 soldier contains small, unweighted hand/accessory islands.  The
        source FBX assigns those islands to the torso, so after the chest is
        re-pivoted they render as two floating hands far outside the body.
        A real torso/shoulder component reaches the chest centre; discard only
        disconnected components whose every vertex is beyond that envelope.
        """
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bm.faces.ensure_lookup_table()
        seen = set()
        discard = []
        for face in bm.faces:
            if face.index in seen:
                continue
            component = []
            pending = [face]
            seen.add(face.index)
            while pending:
                current = pending.pop()
                component.append(current)
                for edge in current.edges:
                    for neighbour in edge.link_faces:
                        if neighbour.index not in seen:
                            seen.add(neighbour.index)
                            pending.append(neighbour)
            vertices = {vertex for part in component for vertex in part.verts}
            if vertices and min(abs(vertex.co.x) for vertex in vertices) > 0.28:
                discard.extend(component)
        if discard:
            bmesh.ops.delete(bm, geom=discard, context="FACES")
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()

    built = []
    for segment, pivot in pivots.items():
        mesh = source_mesh.copy()
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
        bone = armature.data.bones.get(pivot_bones[segment])
        if bone is None:
            raise RuntimeError(f"{body.name}: missing pivot bone {pivot_bones[segment]}")
        source_head = normalize @ armature.matrix_world @ bone.head_local
        source_tail = normalize @ armature.matrix_world @ bone.tail_local
        source_direction = (source_tail - source_head).normalized()
        rotation = source_direction.rotation_difference(target_directions[segment]).to_matrix().to_4x4()
        transform = (Matrix.Translation(pivot) @ rotation @ Matrix.Translation(-source_head)
                     @ normalize @ body.matrix_world)
        mesh.transform(Matrix.Translation(-pivot) @ transform)
        if segment == "chest":
            PruneChestOutliers(mesh)
        if segment == "neck" and mesh.vertices:
            # Some Quaternius characters deliberately use a chibi head: after
            # body-height normalization the head alone is roughly 0.58 m wide
            # and reaches 0.62 m above the neck.  The game is realistic rather
            # than stylised, so cap each axis at the established Actor human
            # proportions. The Japanese source still reads too large from the
            # tactical camera, so use compact limits for every imported head.
            # Blender space is X width / Y depth / Z up.  glTF export maps Z
            # to Three.js Y later, so perform the cap before that conversion.
            half_x = max(abs(vertex.co.x) for vertex in mesh.vertices)
            half_y = max(abs(vertex.co.y) for vertex in mesh.vertices)
            top_z = max(vertex.co.z for vertex in mesh.vertices)
            scale_x = min(1.0, (0.048 * height) / max(half_x, 1e-6))
            scale_y = min(1.0, (0.060 * height) / max(half_y, 1e-6))
            scale_z = min(1.0, (0.125 * height) / max(top_z, 1e-6))
            for vertex in mesh.vertices:
                vertex.co.x *= scale_x
                vertex.co.y *= scale_y
                vertex.co.z *= scale_z
            mesh.update()
        obj = bpy.data.objects.new(f"Segment_{segment}", mesh)
        bpy.context.collection.objects.link(obj)
        obj.location = pivot
        built.append(obj)
    bpy.data.meshes.remove(source_mesh)
    return built


def BuildSegmentHelmet(height=1.62):
    pivot = OldRigPivots(height)["neck"]
    # The imported face is deliberately compact.  The previous 24.3 cm dome
    # and 26.2 cm brim read as a cartoon mushroom above its 15 cm face at the
    # close combat camera.  A Type 90 still needs a visible turned-out brim,
    # but it should sit over the brow instead of swallowing the whole head.
    material = MakeFlatMaterial("Material_IjaHelmet", (0.10, 0.095, 0.060), 0.94, 0.04)
    star_material = MakeFlatMaterial("Material_IjaHelmetStar", (0.36, 0.18, 0.035), 0.76, 0.04)
    # `primitive_uv_sphere_add` makes a full sphere.  Keep only the upper
    # half below, otherwise its lower hemisphere becomes a visor-sized ball
    # over the soldier's eyes.
    head_z = 0.922 * height
    # 19.9 cm dome / 20.9 cm brim on the 1.62 m reference soldier: a realistic
    # Type 90 silhouette without the previous over-sized "mushroom" profile.
    radius = 0.0615 * height

    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12)
    dome = bpy.context.object
    dome.name = "Segment_neck_HelmetDome"
    dome.scale = (radius, radius * 0.93, 0.056 * height)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bm = bmesh.new()
    bm.from_mesh(dome.data)
    lower_faces = [face for face in bm.faces if face.calc_center_median().z < -1e-6]
    bmesh.ops.delete(bm, geom=lower_faces, context="FACES")
    bm.to_mesh(dome.data)
    bm.free()
    dome.data.update()
    dome.data.transform(Matrix.Translation(Vector((0, 0, head_z)) - pivot))
    dome.location = pivot
    dome.data.materials.append(material)

    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius * 1.05, depth=0.009 * height)
    brim = bpy.context.object
    brim.name = "Segment_neck_HelmetBrim"
    brim.scale.y = 0.88
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    brim.data.transform(Matrix.Translation(Vector((0, 0, 0.924 * height)) - pivot))
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


def BuildSegmentMoustache(height=1.62):
    """Create optional upper-lip lobes that follow the existing neck joint."""
    pivot = OldRigPivots(height)["neck"]
    material = MakeFlatMaterial("Material_IjaMoustache", (0.050, 0.032, 0.020), 0.95)
    for side, suffix in ((-1, "L"), (1, "R")):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6)
        lobe = bpy.context.object
        lobe.name = f"Segment_neck_Moustache{suffix}"
        lobe.scale = (0.026 * height, 0.006 * height, 0.008 * height)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        lobe.data.transform(Matrix.Translation(Vector((side * 0.020 * height, 0.118 * height,
                                                       0.902 * height)) - pivot))
        lobe.location = pivot
        lobe.data.materials.append(material)


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
    BuildRigidSegments(body, armature, 1.62, SEGMENT_BY_BONE, IJA_PIVOT_BONES)
    BuildSegmentHelmet()
    BuildSegmentMoustache()
    AddSoldierActions(armature)
    armature.data.pose_position = "POSE"
    ExportGlb(MODEL / "Model_IjaSoldier.glb")


def BuildQuaterniusCharacter(source_name, output_name, height, palette, facing_turn=math.pi):
    ClearScene()
    bpy.ops.import_scene.fbx(filepath=str(SOURCE / source_name))
    armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
    body = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.name == "Body")
    armature.data.pose_position = "REST"
    bpy.context.view_layer.update()
    FixOpaquePalette(body, palette)
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH" and obj is not body:
            bpy.data.objects.remove(obj, do_unlink=True)
    BuildRigidSegments(body, armature, height, QUATERNIUS_SEGMENT_BY_BONE,
                       QUATERNIUS_PIVOT_BONES, facing_turn)
    ExportGlb(MODEL / output_name)


if __name__ == "__main__":
    BuildArms()
    BuildSoldier()
    nra_palette = {
        "Skin": (0.48, 0.31, 0.20), "Face": (0.48, 0.31, 0.20),
        "Main": (0.16, 0.20, 0.27), "Helmet": (0.14, 0.18, 0.24),
        "Black": (0.025, 0.025, 0.028), "Grey": (0.20, 0.22, 0.25),
    }
    civilian_palette = {
        "Skin": (0.48, 0.31, 0.20), "Face": (0.48, 0.31, 0.20),
        "Shirt": (0.52, 0.48, 0.39), "Pants": (0.075, 0.095, 0.15),
        "Belt": (0.055, 0.042, 0.030), "Hair": (0.018, 0.014, 0.011),
    }
    BuildQuaterniusCharacter("Model_BlueSoldierMale.fbx", "Model_NraSoldier.glb", 1.66, nra_palette)
    BuildQuaterniusCharacter("Model_CasualMale.fbx", "Model_CivilianMale.glb", 1.60, civilian_palette)
    BuildQuaterniusCharacter("Model_CasualFemale.fbx", "Model_CivilianFemale.glb", 1.57, civilian_palette)
    print("Built FPS arms plus IJA, NRA and civilian character models")
