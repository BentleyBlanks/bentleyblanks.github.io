"""Archive current rebuild sources and save a clean, editable external project."""
import bpy,json
from pathlib import Path
from mathutils import Vector,Matrix
scene=bpy.context.scene;project=Path(scene['DonkeyCartProject'])
base=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020')
for file in sorted((project/'_blender').glob('Script_DonkeyCart*')):
    if file.suffix not in ('.py','.mjs'):continue
    text=bpy.data.texts.get(file.name) or bpy.data.texts.new(file.name);text.clear();text.write(file.read_text(encoding='utf-8'));text.use_fake_user=True
record=base/'Data_ImageGeneration.json'
text=bpy.data.texts.get(record.name) or bpy.data.texts.new(record.name);text.clear();text.write(record.read_text(encoding='utf-8'));text.use_fake_user=True
scene.frame_set(0)
for name in ('DonkeyRig','DonkeyCartRig'):
    rig=bpy.data.objects[name];rig.data.pose_position='POSE'
    for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
scene.frame_start=1;scene.frame_end=37
camera=bpy.data.objects['ReviewCamera'];camera.location=(-4,5,2.8);camera.rotation_euler=(Vector((0,-.45,.81))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=3.85
scene.render.resolution_x=640;scene.render.resolution_y=400;scene.render.resolution_percentage=100
recovery=base/'Recovery';recovery.mkdir(exist_ok=True);bpy.context.preferences.filepaths.temporary_directory=str(recovery)
for action in bpy.data.actions:
    if action.name not in ('DonkeyWalk','DonkeyIdle','CartRoll') and action.users<=int(action.use_fake_user):action.use_fake_user=False
bpy.data.orphans_purge(do_local_ids=True,do_linked_ids=True,do_recursive=True)
for image in bpy.data.images:
    if image.users and image.type=='IMAGE' and not image.packed_file:
        try:image.pack()
        except RuntimeError:pass
bpy.ops.object.select_all(action='DESELECT');rig=bpy.data.objects['DonkeyRig'];rig.hide_set(False);rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.wm.save_as_mainfile(filepath=str(base/'Scene_DonkeyCart.blend'))
print(json.dumps({'source':str(base/'Scene_DonkeyCart.blend'),'bytes':(base/'Scene_DonkeyCart.blend').stat().st_size,'meshDatablocks':len(bpy.data.meshes),'images':len(bpy.data.images),'actions':[a.name for a in bpy.data.actions]}))
