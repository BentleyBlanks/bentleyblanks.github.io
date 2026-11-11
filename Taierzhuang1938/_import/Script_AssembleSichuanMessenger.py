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
body.data.update()
body_min, body_max = bounds(body)

head = duplicate(parts['HeadBald'], 'Part_HeadBald')
head_scale = 0.38
head_shift_z = 1.78 - 0.9791518449783325 * head_scale
for vertex in head.data.vertices:
    p = vertex.co
    p.x *= head_scale
    p.y *= head_scale
    p.z = p.z * head_scale + head_shift_z
    # The generated bust has broad shoulders. Only the neck goes through the collar.
    weight = max(0.0, min(1.0, (1.61 - p.z) / 0.09))
    radius = math.hypot(p.x / 0.075, p.y / 0.075)
    if radius > 1:
        factor = (1 - weight) + weight / radius
        p.x *= factor
        p.y *= factor
head.data.update()

cap = duplicate(parts['FieldCap'], 'Part_FieldCap')
for vertex in cap.data.vertices:
    p = vertex.co
    p.x = p.x * 0.29 + 0.01
    p.y *= 0.29
    p.z = p.z * 0.19 + 1.705
cap.data.update()

hand_source = parts['LeftHand']
hand = duplicate(hand_source, 'Part_Hand_L')
hand_rotation = Matrix.Rotation(math.radians(135), 3, 'Y')
raw_hand = [hand_rotation @ v.co for v in hand.data.vertices]
wrist_candidates = [p for p in raw_hand if p.y < min(q.y for q in raw_hand) + 0.08]
wrist = sum(wrist_candidates, Vector()) / len(wrist_candidates)
hand_scale = 0.225
cuff = [p for p in coords(body) if p.y > body_max[1] - 0.025]
cuff_center = sum(cuff, Vector()) / len(cuff)
hand_target = Vector((cuff_center.x, body_max[1] - 0.018, cuff_center.z))
for vertex, rotated in zip(hand.data.vertices, raw_hand):
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
for name, loc in [('Front', (3.6, 0, 1.02)), ('Side', (0, -3.6, 1.02)), ('Back', (-3.6, 0, 1.02))]:
    cam.location = loc
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(review_dir / f'Preview_SichuanMessenger_{name}.png')
    bpy.ops.render.render(write_still=True)

report = {'bodyScale': body_scale, 'headScale': head_scale, 'headShiftZ': head_shift_z,
          'handScale': hand_scale, 'footScale': list(foot_scale),
          'parts': {o.name: {'bounds': bounds(o), 'vertices': len(o.data.vertices),
                             'triangles': sum(len(p.vertices)-2 for p in o.data.polygons)}
                    for o in assembly.objects}}
(project_dir / 'Data_SichuanMessengerAssembly.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(project_dir / 'Scene_SichuanMessenger.blend'), compress=True)

# Keep the editable seven pieces in the source scene; join only a temporary
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
bpy.ops.export_scene.gltf(filepath=str(source_dir / 'Model_SichuanMessenger_Merged_V1.glb'),
                          export_format='GLB', use_selection=True, export_apply=True)
bpy.ops.export_scene.fbx(filepath=str(source_dir / 'Model_SichuanMessenger_Merged_V1.fbx'),
                         use_selection=True, path_mode='COPY', embed_textures=True,
                         apply_unit_scale=True, add_leaf_bones=False)
print('Exported', export_mesh.name, 'triangles', sum(len(p.vertices)-2 for p in export_mesh.data.polygons))
print(json.dumps(report, ensure_ascii=False))
