"""Assemble both recovered bearers with a single editable synchronized stretcher."""
from pathlib import Path
import sys,argparse,json,math
import bpy
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);parser.add_argument('--faction',required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);root=args.root;faction=args.faction
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.name='Scene_'+faction+'StretcherPair';scene.render.fps=60;scene.frame_start=1;scene.frame_end=121
height=.984 if faction=='Nra' else .91;scale=1 if faction=='Nra' else .876513/.942464
for role,offset in [('Front',-1.25),('Rear',1.25)]:
 before=set(scene.objects);bpy.ops.import_scene.gltf(filepath=str(root/f'Models/ReviewV2/Animation_{faction}_CarryStretcher{role}_V2.glb'))
 imported=set(scene.objects)-before
 for obj in list(imported):
  if obj.name.startswith('Prop_'):imported.remove(obj);bpy.data.objects.remove(obj,do_unlink=True)
 for obj in imported:
  if obj.parent is None:obj.location.y+=offset
  obj.name=role+'_'+obj.name
# glTF imports start at frame 0; this review scene exports frame 1 through 121.
for act in bpy.data.actions:
 for layer in act.layers:
  for strip in layer.strips:
   for bag in strip.channelbags:
    for curve in bag.fcurves:
     for key in curve.keyframe_points:key.co.x+=1
     curve.update()
def Material(name,color):
 mat=bpy.data.materials.new(name);mat.use_nodes=True;node=mat.node_tree.nodes['Principled BSDF'];node.inputs['Base Color'].default_value=(*color,1);node.inputs['Roughness'].default_value=.85;return mat
wood=Material('Material_StretcherWood',(.29,.18,.085));canvas=Material('Material_StretcherCanvas',(.32,.34,.24))
parts=[]
for x in [-.27*scale,.27*scale]:
 bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.018,depth=3.05,location=(x,.065*scale,height));obj=bpy.context.object;obj.name='Prop_StretcherPole';obj.rotation_euler.x=math.pi/2;obj.data.materials.append(wood);parts.append(obj)
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,.065*scale,height-.025));bed=bpy.context.object;bed.name='Prop_StretcherCanvas';bed.scale=(.51*scale,1.98,.026);bed.data.materials.append(canvas);parts.append(bed)
for obj in parts:
 z=obj.location.z
 for i in range(121):obj.location.z=z+.004*math.cos(i/120*math.tau);obj.keyframe_insert(data_path='location',frame=i+1)
for act in bpy.data.actions:
 act.use_fake_user=True
 for layer in act.layers:
  for strip in layer.strips:
   for bag in strip.channelbags:
    for curve in bag.fcurves:
     for key in curve.keyframe_points:key.interpolation='LINEAR'
scene.world=bpy.data.worlds.new('World_Review');scene.world.color=(.2,.2,.2);scene['reviewStatus']='Local review: paired animation with shared grip poles; no patient model'
bpy.ops.object.select_all(action='SELECT');scene.frame_set(1)
name='Animation_'+faction+'_StretcherPair_V2';out=root/'Models/ReviewV2';path=out/(name+'.glb');blend=root/f'Blender/ReviewV2/Scene_{faction}_StretcherPair_V2.blend'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name=name,export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True,export_yup=True)
for img in bpy.data.images:
 if img.source=='FILE' and img.has_data and not img.packed_file:img.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
(out/f'Data_{faction}_StretcherPair_Validation.json').write_text(json.dumps({'status':'requires_visual_review','variants':[{'id':'StretcherPair','faction':faction,'path':path.relative_to(root).as_posix(),'clip':name,'blend':blend.relative_to(root).as_posix(),'loop':True}],'sharedGripHeight':height,'sourceFrames':[137,197]},indent=2),encoding='utf-8')
