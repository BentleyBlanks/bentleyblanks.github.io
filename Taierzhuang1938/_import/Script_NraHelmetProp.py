"""He Youtian's headgear as a hand prop (2026-10-12 R2-Anim; REL/附件/briefs/Brief_R2_Anim.md item 2).

The storyboard calls it 钢盔, but NRA02 (He Youtian's body, Data_FirstLevelP012Cast modelVariant 1) wears the peaked
field cap of the uniform, and it is not a mesh or a material of its own: it is part of the uniform's cloth primitive
(`Material #1721585337`, the whole uniform), plus the cap badge (`Material #1721585500`, 48 triangles, already its own
primitive). What tells the cap apart is the skin: every cloth vertex of the cap rides the head bone alone, nothing else
of the uniform does (the collar rides the neck and the spine). This script cuts those cloth triangles (all three
vertices with head weight >= HEAD_WEIGHT) and the badge out of the bind pose into an unskinned prop:

  Model/Model_NraHelmet.glb  (prop name `helmet`, Data_OpeningStoryboardsAnimation props.helmet.redraftA)
    origin   the crown's centre on the brim plane (the cap's lowest ring)
    -Z       out of the crown (the prop tracks' `axis`)
    +Y       toward the peak (the tracks' `up`: "up toward the brim front")
    metres   runtime metres (the GLB's bind pose times RUNTIME_SCALE, the factor between NRA02's GLB and the runtime body)
    materials  `Material #1721585337` (cloth: the atlas's base colour at 256 px, UVs unchanged) and `Material #1721585500`
             (the badge, its own 6 KB texture); a runtime may instead bind clones of the wearer's own two materials by name.

Run headless from the worktree root:
  blender -b --python-exit-code 1 --python Taierzhuang1938/_import/Script_NraHelmetProp.py -- <worktree>/Taierzhuang1938 [<review dir>]
"""
import bpy, bmesh, sys, json, math
from pathlib import Path
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
project = Path(argv[0])
review = Path(argv[1]) if len(argv) > 1 else None
SOURCE = project / 'Model/Character/Model_TengxianNra02.glb'
OUT = project / 'Model/Model_NraHelmet.glb'
CLOTH, BADGE = 'Material #1721585337', 'Material #1721585500'
HEAD_WEIGHT = .9              # a cap triangle: all three vertices ride the head bone at least this much
# runtime / GLB: NRA02's GLB is 1.817 m to the cap top, the runtime body 1.66 m (Script_Actor height); measured in the browser on the
# skinned cap itself (largest vertex-to-vertex span 0.2446 m at runtime against 0.2677 in the GLB: 0.9135)
RUNTIME_SCALE = float(argv[2]) if len(argv) > 2 else .9135
ATLAS_PX = 256

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
body = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
arm.data.pose_position = 'REST'
bpy.context.view_layer.update()
head = next(g.index for g in body.vertex_groups if g.name.endswith('Head') and 'Nub' not in g.name)
slots = {s.material.name: i for i, s in enumerate(body.material_slots) if s.material}
me = body.data
world = body.matrix_world


def HeadWeight(v):
    return sum(g.weight for g in v.groups if g.group == head)


cap = [p for p in me.polygons if p.material_index == slots[CLOTH] and all(HeadWeight(me.vertices[i]) >= HEAD_WEIGHT for i in p.vertices)]
badge = [p for p in me.polygons if p.material_index == slots[BADGE]]
loose = [p for p in me.polygons if p.material_index == slots[CLOTH] and any(HeadWeight(me.vertices[i]) > .05 for i in p.vertices)
         and not all(HeadWeight(me.vertices[i]) >= HEAD_WEIGHT for i in p.vertices)]
tris = lambda polys: sum(len(p.vertices) - 2 for p in polys)
print('NRA_CAP cloth tris', tris(cap), 'badge tris', tris(badge), 'cloth tris partly on the head (left on the body)', tris(loose))

# the new mesh: bind-pose world coordinates, UVs, the two materials
bm = bmesh.new()
uvLayer = bm.loops.layers.uv.new('UVMap')
src = me.uv_layers.active.data
index = {}
for p in cap + badge:
    verts = []
    for li, vi in zip(p.loop_indices, p.vertices):
        if vi not in index:
            index[vi] = bm.verts.new(world @ me.vertices[vi].co)
        verts.append(index[vi])
    try:
        f = bm.faces.new(verts)
    except ValueError:
        continue
    f.material_index = 0 if p.material_index == slots[CLOTH] else 1
    f.smooth = True
    for loop, li in zip(f.loops, p.loop_indices):
        loop[uvLayer].uv = src[li].uv
pts = [v.co.copy() for v in bm.verts]
brim = min(p.z for p in pts)
crown = [p for p in pts if p.z > brim + .04]
centre = Vector((sum(p.x for p in crown) / len(crown), sum(p.y for p in crown) / len(crown), brim))
top = max(p.z for p in pts)
front = min(p.y for p in pts)
print('NRA_CAP bind pose: brim z %.3f top %.3f (%.3f high), crown centre (%.3f, %.3f), peak %.3f ahead of it' % (brim, top, top - brim, centre.x, centre.y, centre.y - front))
# to the prop frame: origin on the crown centre at the brim; Blender +Z (out of the crown) -> +Y, -Y (the peak) -> +Z,
# which the glTF export (+Y up, -Z forward) writes as -Z out of the crown and +Y toward the peak
frame = Matrix.Scale(RUNTIME_SCALE, 4) @ Matrix.Rotation(-math.pi / 2, 4, 'X') @ Matrix.Translation(-centre)
bmesh.ops.transform(bm, matrix=frame, verts=bm.verts)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
mesh = bpy.data.meshes.new('NraHelmet')
bm.to_mesh(mesh)
bm.free()
prop = bpy.data.objects.new('NraHelmet', mesh)
bpy.context.scene.collection.objects.link(prop)


def Material(name, image, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = 0.0
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = image
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    return m


def BaseImage(name):
    node = next(n for n in bpy.data.materials[name].node_tree.nodes if n.type == 'TEX_IMAGE' and any(
        l.to_socket.name == 'Base Color' for out in n.outputs for l in out.links))
    return node.image


clothImage, badgeImage = BaseImage(CLOTH), BaseImage(BADGE)
for m in list(bpy.data.materials):            # the body's own materials go: the prop's take their exact names
    m.name = 'Source_' + m.name
atlas = clothImage.copy()
atlas.name = 'NraHelmet_Cloth'
atlas.scale(ATLAS_PX, ATLAS_PX)
mesh.materials.append(Material(CLOTH, atlas, .9))
mesh.materials.append(Material(BADGE, badgeImage, .86))
for o in list(bpy.context.scene.objects):
    if o is not prop:
        bpy.data.objects.remove(o, do_unlink=True)
lo = Vector([min(v.co[k] for v in mesh.vertices) for k in range(3)])
hi = Vector([max(v.co[k] for v in mesh.vertices) for k in range(3)])
print('NRA_CAP prop bounds (Blender, m):', tuple(round(c, 3) for c in lo), tuple(round(c, 3) for c in hi), 'tris', sum(len(p.vertices) - 2 for p in mesh.polygons))
bpy.ops.object.select_all(action='DESELECT')
prop.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT), export_format='GLB', use_selection=True, export_image_format='WEBP',
                          export_animations=False, export_skins=False, export_morph=False, export_apply=True,
                          export_extras=False, export_yup=True)
print('NRA_CAP wrote', OUT, OUT.stat().st_size, 'bytes')
if review:
    review.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'TEXTURE'
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.world = bpy.data.worlds.new('w')
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = .42
    c = (lo + hi) / 2
    for name, d in (('side', Vector((1, 0, 0))), ('peak', Vector((0, 0, 1))), ('under', Vector((0, -.3, -1))), ('crown', Vector((.3, .6, -1)))):
        cam.location = c - d.normalized() * 2 if name in ('under', 'crown') else c + d.normalized() * 2
        cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(review / ('NraHelmet_%s.png' % name))
        bpy.ops.render.render(write_still=True)
print('NRA_CAP done')
