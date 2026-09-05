"""Export bone-parented props through temporary object-parented world-motion bakes.

Blender 5.1 glTF exports animated bone-parent offsets with the display bone tail
twice on these imported rigs. A temporary object-parent bake avoids that path;
the editable blend retains the original bone parenting and actions.
"""
import bpy
from mathutils import Matrix
def ExportInfantry(filepath,animationName):
 scene=bpy.context.scene
 arm=next(o for o in scene.objects if o.type=='ARMATURE')
 props=[o for o in scene.objects if o.name.startswith('Socket_') and o.name.endswith(('InfantryRifle','InfantryGrenade'))]
 factor=2 if 'GrenadeThrow' in animationName else 1
 originalStart,originalEnd,originalFps=scene.frame_start,scene.frame_end,scene.render.fps
 originalArmAction=arm.animation_data.action
 saved=[];temporary=[]
 for prop in props:
  saved.append((prop,prop.parent_type,prop.parent_bone,prop.matrix_parent_inverse.copy(),prop.animation_data.action))
  matrices=[]
  for exportFrame in range(originalStart*factor,originalEnd*factor+1):
   frame=exportFrame/factor;scene.frame_set(int(frame),subframe=frame%1);matrices.append((exportFrame,prop.matrix_world.copy()))
  action=bpy.data.actions.new(animationName+'_Export_'+prop.name);temporary.append(action)
  prop.parent_type='OBJECT';prop.parent_bone='';prop.matrix_parent_inverse=Matrix.Identity(4);prop.animation_data.action=action
  previous=None
  for frame,matrix in matrices:
   prop.matrix_basis=arm.matrix_world.inverted()@matrix
   if previous is not None and prop.rotation_quaternion.dot(previous)<0:prop.rotation_quaternion.negate()
   previous=prop.rotation_quaternion.copy()
   for path in ['location','rotation_quaternion','scale']:prop.keyframe_insert(data_path=path,frame=frame)
  for layer in action.layers:
   for strip in layer.strips:
    for bag in strip.channelbags:
     for curve in bag.fcurves:
      for key in curve.keyframe_points:key.interpolation='CONSTANT' if 'Grenade' in prop.name and curve.data_path=='scale' else 'LINEAR'
 if factor>1:
  sampledArm=originalArmAction.copy();temporary.append(sampledArm)
  for layer in sampledArm.layers:
   for strip in layer.strips:
    for bag in strip.channelbags:
     for curve in bag.fcurves:
      for key in curve.keyframe_points:key.co.x*=factor
      curve.update()
  arm.animation_data.action=sampledArm
  scene.render.fps=originalFps*factor;scene.frame_start=originalStart*factor;scene.frame_end=originalEnd*factor
 try:
  scene.frame_set(scene.frame_start)
  bpy.ops.export_scene.gltf(filepath=str(filepath),export_format='GLB',use_selection=True,use_active_scene=True,
   export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name=animationName,export_frame_range=True,
   export_force_sampling=True,export_anim_slide_to_zero=True,export_anim_single_armature=True,export_skins=True,export_yup=True,export_extras=True)
 finally:
  arm.animation_data.action=originalArmAction;scene.render.fps=originalFps;scene.frame_start=originalStart;scene.frame_end=originalEnd
  for prop,parentType,parentBone,inverse,action in saved:
   prop.parent_type=parentType;prop.parent_bone=parentBone;prop.matrix_parent_inverse=inverse;prop.animation_data.action=action
  for action in temporary:bpy.data.actions.remove(action)
  scene.frame_set(scene.frame_start+1);scene.frame_set(scene.frame_start)
