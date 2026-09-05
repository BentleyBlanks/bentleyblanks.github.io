"""Run in Blender's Text Editor once to add the Infantry Actions sidebar."""
import bpy
CLIPS=['RifleCrouchAdvance','RifleCrouchAdvanceRootMotion','StandToKneel','KneelHold','KneelToStand','GrenadeThrow']
LABELS=['低姿持枪推进（原地）','低姿持枪推进（位移）','站立转单膝跪地','跪姿持枪保持','跪姿起身','过肩投掷']
def SelectInfantryClip(faction,clip):
 scene=bpy.data.scenes['Scene_'+faction+'InfantryActions'];bpy.context.window.scene=scene
 name='Animation_'+faction+'_'+clip
 for objectName,suffix in [('Rig_'+faction+'Infantry',''),('Socket_'+faction+'InfantryRifle','_Rifle'),('Socket_'+faction+'InfantryGrenade','_Grenade')]:
  obj=bpy.data.objects.get(objectName)
  if obj and bpy.data.actions.get(name+suffix):obj.animation_data_create();obj.animation_data.action=bpy.data.actions[name+suffix]
 scene.frame_start=1;scene.frame_end=int(bpy.data.actions[name].frame_range[1])-(1 if 'Crouch' in clip or clip=='KneelHold' else 0)
 scene.frame_set(2);scene.frame_set(1);scene['selectedClip']=clip
 scene.timeline_markers.clear()
 if clip=='GrenadeThrow':scene.timeline_markers.new('Release / 释放',frame=130)
 for o in scene.objects:
  if o.name.startswith('Preview_'):o.hide_render=clip!='GrenadeThrow';o.hide_viewport=clip!='GrenadeThrow'
 return scene
class INFANTRY_OT_Select(bpy.types.Operator):
 bl_idname='infantry.select_clip';bl_label='选择动画'
 faction:bpy.props.StringProperty();clip:bpy.props.StringProperty()
 def execute(self,context):SelectInfantryClip(self.faction,self.clip);return {'FINISHED'}
class INFANTRY_PT_Actions(bpy.types.Panel):
 bl_label='步兵动作 / Infantry Actions';bl_idname='INFANTRY_PT_actions';bl_space_type='VIEW_3D';bl_region_type='UI';bl_category='Infantry'
 def draw(self,context):
  for faction,label in [('Nra','国军'),('Ija','日军')]:
   box=self.layout.box();box.label(text=label)
   for clip,title in zip(CLIPS,LABELS):
    op=box.operator('infantry.select_clip',text=title);op.faction=faction;op.clip=clip
for cls in [INFANTRY_OT_Select,INFANTRY_PT_Actions]:
 old=getattr(bpy.types,cls.__name__,None)
 if old:bpy.utils.unregister_class(old)
 bpy.utils.register_class(cls)
