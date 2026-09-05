"""Run this Blender Text once to enable the Melee action library sidebar."""
import bpy

ACTIONS=['Guard','Advance','Retreat','Light','LightAlt','Charge','Heavy','Parry','Deflected','Push','Pushed','Hit','Bind','BindWin','BindLose','Fall','Ground','GroundWin','GroundLose','Pressure','Rise']

def SelectMeleeAction(role='Nra',weapon='Dadao',action='Guard'):
 scene=bpy.data.scenes['Scene_FirstPersonMelee' if role=='FirstPerson' else 'Scene_MeleeCombat']
 bpy.context.window.scene=scene
 arm=bpy.data.objects['Melee'+role]
 name=weapon+action
 arm.animation_data_create();arm.animation_data.action=bpy.data.actions['Animation_'+role+name]
 for kind in ['Dadao','Bayonet']:
  obj=bpy.data.objects.get('Model_'+role+kind)
  if obj:
   for child in [obj,*obj.children_recursive]:
    child.hide_render=kind!=weapon;child.hide_set(kind!=weapon)
   if kind==weapon:
    obj.animation_data_create();obj.animation_data.action=bpy.data.actions['Animation_'+role+'Weapon'+name]
 if role=='FirstPerson':
  for label in ['CameraCarrier','GripCarrier']:
   obj=bpy.data.objects['Animation_'+label];obj.animation_data.action=bpy.data.actions['Animation_'+label+name]
 scene.frame_start=1;scene.frame_end=31;scene.frame_set(1)
 for obj in bpy.context.selected_objects:obj.select_set(False)
 arm.hide_set(False);arm.select_set(True);bpy.context.view_layer.objects.active=arm
 return arm

class MELEE_OT_SelectAction(bpy.types.Operator):
 bl_idname='melee.select_action';bl_label='播放所选动作'
 def execute(self,context):
  wm=context.window_manager;SelectMeleeAction(wm.meleeRole,wm.meleeWeapon,wm.meleeAction);return {'FINISHED'}
class MELEE_PT_ActionLibrary(bpy.types.Panel):
 bl_label='大刀与刺刀 · 动作库';bl_idname='MELEE_PT_ActionLibrary';bl_space_type='VIEW_3D';bl_region_type='UI';bl_category='Melee'
 def draw(self,context):
  layout=self.layout;wm=context.window_manager
  layout.prop(wm,'meleeRole',text='对象');layout.prop(wm,'meleeWeapon',text='武器');layout.prop(wm,'meleeAction',text='动作')
  layout.operator('melee.select_action');layout.label(text='空格播放 · 时间轴逐帧检查')
  layout.label(text='运行时速度由战斗状态机决定')

def RegisterMeleeLibrary():
 for cls in [MELEE_OT_SelectAction,MELEE_PT_ActionLibrary]:
  old=getattr(bpy.types,cls.__name__,None)
  if old:bpy.utils.unregister_class(old)
  bpy.utils.register_class(cls)
 bpy.types.WindowManager.meleeRole=bpy.props.EnumProperty(items=[('Nra','国军全身',''),('Ija','日军全身',''),('FirstPerson','第一人称双臂','')])
 bpy.types.WindowManager.meleeWeapon=bpy.props.EnumProperty(items=[('Dadao','大刀',''),('Bayonet','刺刀','')])
 bpy.types.WindowManager.meleeAction=bpy.props.EnumProperty(items=[(a,a,'') for a in ACTIONS])

RegisterMeleeLibrary()
