"""Rebuild the Sichuan messenger from five named Tripo source GLBs.

Run with scripts/Script_BlenderMcp.mjs start --batch. Sources and the editable
assembly remain in the .blend; the GLB and FBX contain one joined export mesh.
"""
import bpy
import bmesh
import json
import math
from pathlib import Path
from mathutils import Matrix, Vector
import numpy as np

source_dir = Path(r'C:\Users\Bentl\OneDrive\Sync\饮河\FPS\角色\Tripo\33_川军传令兵')
project_dir = Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\SichuanMessengerPartsMerge_20261111')
review_dir = project_dir / 'Review'
project_dir.mkdir(parents=True, exist_ok=True)
review_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene['BlenderMcpTask'] = 'SichuanMessengerPartsMerge_20261111'
scene.unit_settings.system = 'METRIC'

assembly = bpy.data.collections.new('Assembly')
scene.collection.children.link(assembly)
sources = bpy.data.collections.new('Sources')
scene.collection.children.link(sources)
source_names = ['Body', 'HeadBald', 'LeftHand', 'LeftFoot', 'FieldCap']
parts = {}

def coords(obj):
    return [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]

def bounds(obj):
    values = coords(obj)
    return ([min(p[i] for p in values) for i in range(3)],
            [max(p[i] for p in values) for i in range(3)])

def duplicate(source, name):
    obj = source.copy()
    obj.data = source.data.copy()
    obj.name = name
    assembly.objects.link(obj)
    obj.matrix_world = source.matrix_world.copy()
    return obj

def rename_source_materials(obj, role):
    obj.data.name = f'Mesh_SichuanMessenger_{role}_Source'
    for index, material in enumerate(obj.data.materials):
        if material:
            material.name = f'Material_SichuanMessenger_{role}' + (f'_{index+1}' if index else '')
            image_nodes = [node for node in material.node_tree.nodes if node.type == 'TEX_IMAGE']
            for node, suffix in zip(image_nodes, ('BaseColor', 'Orm', 'Normal')):
                node.name = f'Image_{suffix}'
                if node.image:
                    node.image.name = f'Texture_SichuanMessenger_{role}_{suffix}'

for role in source_names:
    source_file = source_dir / f'Model_SichuanMessenger_{role}_Source.glb'
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(source_file))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    meshes = [obj for obj in imported if obj.type == 'MESH']
    assert len(meshes) == 1, (role, len(meshes))
    obj = meshes[0]
    obj.name = f'Source_{role}'
    rename_source_materials(obj, role)
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    sources.objects.link(obj)
    obj.hide_render = True
    obj.hide_set(True)
    parts[role] = obj

body = duplicate(parts['Body'], 'Part_Body')
body_scale = 1.15 / 0.9380395412445068
for vertex in body.data.vertices:
    p = vertex.co
    arm_extra = max(abs(p.y) - 0.20, 0.0) * 0.36
    p.y = (p.y + math.copysign(arm_extra, p.y)) * body_scale
    p.x *= body_scale
    p.z = p.z * body_scale + 0.38
    # The reference's standing rear collar meets the nape well above the
    # front lapels. Lift only the fabric around the back of the neck.
    neck_weight = max(0.0, min(1.0, (0.18 - abs(p.y)) / 0.08))
    back_weight = max(0.0, min(1.0, (0.10 - p.x) / 0.20))
    upper_weight = max(0.0, min(1.0, (p.z - 1.42) / 0.11))
    p.z += 0.05 * neck_weight * back_weight * upper_weight
body.data.update()
body_min, body_max = bounds(body)

head = duplicate(parts['HeadBald'], 'Part_HeadBald')
head_scale = 0.38
head_scale_z = 0.32
# Preserve the chin height while shortening the generated head toward its crown.
head_shift_z = 1.4079222989082336 + (head_scale - head_scale_z) * 0.33
for vertex in head.data.vertices:
    p = vertex.co
    p.x *= head_scale
    p.y *= head_scale
    p.z = p.z * head_scale_z + head_shift_z
    # The generated bust has broad shoulders. Only the neck goes through the collar.
    weight = max(0.0, min(1.0, (1.61 - p.z) / 0.09))
    radius = math.hypot(p.x / 0.075, p.y / 0.075)
    if radius > 1:
        factor = (1 - weight) + weight / radius
        p.x *= factor
        p.y *= factor
head.data.update()

hair = duplicate(head, 'Part_HairShort')
hair_mesh = bmesh.new()
hair_mesh.from_mesh(hair.data)
excluded = []
for face in hair_mesh.faces:
    point = face.calc_center_median()
    hairline_x = min(0.035, -0.045 + 0.65 * (point.z - 1.575))
    if point.z < 1.575 or point.x > hairline_x:
        excluded.append(face)
bmesh.ops.delete(hair_mesh, geom=excluded, context='FACES')
unused = [vertex for vertex in hair_mesh.verts if not vertex.link_faces]
if unused:
    bmesh.ops.delete(hair_mesh, geom=unused, context='VERTS')
hair_mesh.to_mesh(hair.data)
hair_mesh.free()
hair.data.update()
assert len(hair.data.polygons) > 100
for vertex in hair.data.vertices:
    vertex.co += vertex.normal * 0.0008
hair_material = bpy.data.materials.new('Material_SichuanMessenger_ShortHair')
hair_material.use_nodes = True
hair_shader = hair_material.node_tree.nodes.get('Principled BSDF')
hair_shader.inputs['Roughness'].default_value = 0.92
noise = np.random.default_rng(1938)
size = 512
strand_values = noise.uniform(0.012, 0.045, size)
grain = noise.uniform(-0.008, 0.008, (size, size))
shade = np.clip(strand_values[None, :] + grain, 0.005, 0.065)
pixels = np.empty((size, size, 4), dtype=np.float32)
pixels[:, :, 0] = shade
pixels[:, :, 1] = shade * 0.91
pixels[:, :, 2] = shade * 0.78
pixels[:, :, 3] = 1.0
hair_texture = bpy.data.images.new('Texture_SichuanMessenger_ShortHair', width=size, height=size, alpha=True)
hair_texture.pixels.foreach_set(pixels.ravel())
hair_texture.pack()
hair_node = hair_material.node_tree.nodes.new('ShaderNodeTexImage')
hair_node.name = 'Image_ShortHair'
hair_node.image = hair_texture
hair_material.node_tree.links.new(hair_node.outputs['Color'], hair_shader.inputs['Base Color'])
hair.data.materials.clear()
hair.data.materials.append(hair_material)

cap = duplicate(parts['FieldCap'], 'Part_FieldCap')
for vertex in cap.data.vertices:
    p = vertex.co
    p.x = p.x * 0.27 + 0.023
    p.y *= 0.24
    p.z = p.z * 0.21 + 1.650
    # Keep the front brim above the brows while lowering the rear hem.
    p.z += 0.13 * (p.x - 0.155)
cap.data.update()

hand_source = parts['LeftHand']
hand = duplicate(hand_source, 'Part_Hand_L')
# The Tripo front view shows the back of this hand. The -45 degree roll puts
# that surface upward, leaving the palm facing down as in the T-pose reference.
hand_rotation = Matrix.Rotation(math.radians(-45), 3, 'Y')
raw_hand = [hand_rotation @ v.co for v in hand.data.vertices]
wrist_candidates = [p for p in raw_hand if p.y < min(q.y for q in raw_hand) + 0.08]
wrist = sum(wrist_candidates, Vector()) / len(wrist_candidates)
hand_scale = 0.195
cuff = [p for p in coords(body) if p.y > body_max[1] - 0.025]
cuff_center = sum(cuff, Vector()) / len(cuff)
hand_target = Vector((cuff_center.x, body_max[1] - 0.018, cuff_center.z))
for vertex, rotated in zip(hand.data.vertices, raw_hand):
    axial = max(0.0, rotated.y - wrist.y)
    palm_weight = min(1.0, axial / 0.25)
    finger_weight = max(0.0, min(1.0, (axial - 0.25) / 0.60))
    lateral_factor = 1.0 - 0.20 * palm_weight - 0.40 * finger_weight
    rotated.x = wrist.x + (rotated.x - wrist.x) * lateral_factor
    vertex.co = (rotated - wrist) * hand_scale + hand_target
hand.data.update()

hand_right = duplicate(hand, 'Part_Hand_R')
for vertex in hand_right.data.vertices:
    vertex.co.y *= -1
mesh = bmesh.new(); mesh.from_mesh(hand_right.data)
bmesh.ops.reverse_faces(mesh, faces=list(mesh.faces))
mesh.to_mesh(hand_right.data); mesh.free(); hand_right.data.update()

foot = duplicate(parts['LeftFoot'], 'Part_Foot_L')
raw_foot = [v.co.copy() for v in foot.data.vertices]
top_raw = [p for p in raw_foot if p.z > 0.74]
top_center = sum(top_raw, Vector()) / len(top_raw)
body_leg = [p for p in coords(body) if p.y > 0 and p.z < 0.40]
leg_center = sum(body_leg, Vector()) / len(body_leg)
foot_scale = Vector((0.32, 0.35, 0.53))
toe_out = Matrix.Rotation(math.radians(-6), 3, 'Z')
top_scaled = toe_out @ Vector((top_center.x * foot_scale.x, top_center.y * foot_scale.y, top_center.z * foot_scale.z))
foot_shift = Vector((leg_center.x - top_scaled.x, leg_center.y + 0.03 - top_scaled.y, 0))
for vertex, point in zip(foot.data.vertices, raw_foot):
    p = toe_out @ Vector((point.x * foot_scale.x, point.y * foot_scale.y, point.z * foot_scale.z))
    # Draw the top of the wrap into the trouser opening. The shoe keeps its
    # wider stance while the hidden cuff aligns with the leg center.
    tuck = max(0.0, min(1.0, (p.z - 0.30) / 0.08))
    p.x += 0.03 * tuck
    p.y -= 0.04 * tuck
    vertex.co = p + foot_shift
foot.data.update()

foot_right = duplicate(foot, 'Part_Foot_R')
for vertex in foot_right.data.vertices:
    vertex.co.y *= -1
mesh = bmesh.new(); mesh.from_mesh(foot_right.data)
bmesh.ops.reverse_faces(mesh, faces=list(mesh.faces))
mesh.to_mesh(foot_right.data); mesh.free(); foot_right.data.update()

for obj in sources.objects:
    obj.hide_render = True
    obj.hide_set(True)
for obj in assembly.objects:
    obj.hide_render = False
    obj.hide_set(False)

scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.render.resolution_x = 640
scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
world = bpy.data.worlds.new('ReviewWorld')
scene.world = world
world.use_nodes = True
world.node_tree.nodes.get('Background').inputs['Color'].default_value = (1, 1, 1, 1)
world.node_tree.nodes.get('Background').inputs['Strength'].default_value = 0.7
for name, loc, power, size in [('Key', (3, -3, 4), 850, 4), ('Fill', (-2, 2, 3), 450, 5)]:
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.shape, data.size = power, 'DISK', size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (Vector((0, 0, 0.9)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
cam_data = bpy.data.cameras.new('ReviewCamera')
cam = bpy.data.objects.new('ReviewCamera', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam_data.type = 'ORTHO'
cam_data.ortho_scale = 2.08
center = Vector((0, 0, 0.93))
for name, loc in [('Front', (3.6, 0, 1.02)), ('LeftSide', (0, 3.6, 1.02)), ('Back', (-3.6, 0, 1.02))]:
    cam.location = loc
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(review_dir / f'Preview_SichuanMessenger_V5_{name}.png')
    bpy.ops.render.render(write_still=True)

report = {'bodyScale': body_scale, 'headScale': head_scale, 'headScaleZ': head_scale_z,
          'headShiftZ': head_shift_z,
          'handScale': hand_scale, 'footScale': list(foot_scale),
          'parts': {o.name: {'bounds': bounds(o), 'vertices': len(o.data.vertices),
                             'triangles': sum(len(p.vertices)-2 for p in o.data.polygons)}
                    for o in assembly.objects}}
(project_dir / 'Data_SichuanMessengerAssembly_V5.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(project_dir / 'Scene_SichuanMessenger_V5.blend'), compress=True)

# Keep the editable assembly pieces in the source scene; join only a temporary
# duplicate for file export. Material slots remain separate at full resolution.
for obj in bpy.context.selected_objects:
    obj.select_set(False)
export_parts = []
for obj in assembly.objects:
    copy = obj.copy()
    copy.data = obj.data.copy()
    copy.name = f'Export_{obj.name}'
    scene.collection.objects.link(copy)
    copy.hide_set(False)
    copy.select_set(True)
    export_parts.append(copy)
bpy.context.view_layer.objects.active = export_parts[0]
bpy.ops.object.join()
export_mesh = bpy.context.view_layer.objects.active
export_mesh.name = 'Model_SichuanMessenger_Merged'
export_mesh.data.name = 'Mesh_SichuanMessenger_Merged'
bpy.ops.export_scene.gltf(filepath=str(source_dir / 'Model_SichuanMessenger_Merged_V5.glb'),
                          export_format='GLB', use_selection=True, export_apply=True)
bpy.ops.export_scene.fbx(filepath=str(source_dir / 'Model_SichuanMessenger_Merged_V5.fbx'),
                         use_selection=True, path_mode='COPY', embed_textures=True,
                         apply_unit_scale=True, add_leaf_bones=False)
print('Exported', export_mesh.name, 'triangles', sum(len(p.vertices)-2 for p in export_mesh.data.polygons))
print(json.dumps(report, ensure_ascii=False))
