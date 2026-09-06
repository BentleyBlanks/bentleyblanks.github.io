"""Reassemble faithful bearers; disclose the shared rigid stretcher fit residuals."""
from pathlib import Path
import argparse,json,sys
import bpy,numpy as np
from mathutils import Vector,Matrix
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);parser.add_argument('--group',default='ReviewV7');parser.add_argument('--faction',required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);root=args.root;out=root/'Models'/args.group;faction=args.faction
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.render.fps=60;scene.frame_start=1;scene.frame_end=121
rigs={}
for role,offset in [('Front',-1.25),('Rear',1.25)]:
 before=set(scene.objects);bpy.ops.import_scene.gltf(filepath=str(out/f'Animation_{faction}_CarryStretcher{role}_V7.glb'));imported=set(scene.objects)-before
 for obj in list(imported):
  if obj.name.startswith('Prop_'):imported.remove(obj);bpy.data.objects.remove(obj,do_unlink=True)
 for obj in imported:
  if not obj.parent:obj.location.y+=offset
  obj.name=role+'_'+obj.name
 rigs[role]=next(o for o in imported if o.type=='ARMATURE')
for act in bpy.data.actions:
 for layer in act.layers:
  for strip in layer.strips:
   for bag in strip.channelbags:
    for curve in bag.fcurves:
     for key in curve.keyframe_points:key.co.x+=1
     curve.update()
def Wrists():
 return np.array([list(arm.matrix_world@next(b for b in arm.pose.bones if b.name.replace('_',' ').endswith(side+' Hand')).head) for arm in rigs.values() for side in ['L','R']])
samples=[]
for frame in range(1,122):scene.frame_set(frame);bpy.context.view_layer.update();samples.append(Wrists())
width=float(np.median([np.linalg.norm(s[0]-s[1]) for s in samples]));length=2.5
local=np.array([[width/2,-length/2,0],[-width/2,-length/2,0],[width/2,length/2,0],[-width/2,length/2,0]])
carrier=bpy.data.objects.new('Prop_SharedStretcher',None);scene.collection.objects.link(carrier);carrier.rotation_mode='QUATERNION'
def Material(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);return m
wood=Material('Material_StretcherWood',(.29,.18,.085));canvas=Material('Material_StretcherCanvas',(.32,.34,.24))
for x in [-width/2,width/2]:
 bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.018,depth=length+.55);o=bpy.context.object;o.name='Prop_StretcherPole';o.parent=carrier;o.location.x=x;o.rotation_euler.x=1.5707963267948966;o.data.materials.append(wood)
bpy.ops.mesh.primitive_cube_add(size=1);o=bpy.context.object;o.name='Prop_StretcherCanvas';o.parent=carrier;o.location.z=-.025;o.scale=(width,length-.5,.026);o.data.materials.append(canvas)
residuals=[];previous=None
for index,points in enumerate(samples):
 center=points.mean(0);u,s,vt=np.linalg.svd(local.T@(points-center));rotation=vt.T@u.T
 if np.linalg.det(rotation)<0:vt[-1]*=-1;rotation=vt.T@u.T
 matrix=Matrix(rotation).to_4x4();matrix.translation=Vector(center);carrier.matrix_world=matrix
 if previous and previous.dot(carrier.rotation_quaternion)<0:carrier.rotation_quaternion.negate()
 previous=carrier.rotation_quaternion.copy()
 for prop in ['location','rotation_quaternion']:carrier.keyframe_insert(data_path=prop,frame=index+1)
 residuals.append(np.linalg.norm(local@rotation.T+center-points,axis=1).tolist())
name=f'Animation_{faction}_StretcherPair_V7';path=out/(name+'.glb');blend=root/'Blender'/args.group/f'Scene_{faction}_StretcherPair_V7.blend'
scene['reviewStatus']='Multi-person crop experiment: fixed rigid stretcher fitted to independently recovered wrists; no forced hand IK';scene['maxGripResidualMeters']=float(np.max(residuals))
scene.frame_set(1);bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name=name,export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True,export_yup=True)
for img in bpy.data.images:
 if img.source=='FILE' and img.has_data and not img.packed_file:img.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
(out/f'Data_{faction}_StretcherPair_Validation.json').write_text(json.dumps({'status':'experimental_contact_residual','maxGripResidualMeters':float(np.max(residuals)),'gripResiduals':residuals,
 'variants':[{'id':'StretcherPair','faction':faction,'path':path.relative_to(root).as_posix(),'blend':blend.relative_to(root).as_posix(),'clip':name,'sourceFrames':[137,197],'loop':True}]},indent=2),encoding='utf-8')
print('DONE',faction,'StretcherPair',float(np.max(residuals)),flush=True)
