"""Render source-derived action previews with actual floor and a following camera."""
from pathlib import Path
import bpy,json,math
from mathutils import Vector,Matrix
runtime=Path.home()/'Downloads/GVHMR/InfantryActions_20260905';folder=runtime/'PreviewFrames';folder.mkdir(exist_ok=True)
catalog=json.loads((runtime/'Deliverables/Data_AnimationCatalog.json').read_text())
exec(compile(Path(__file__).with_name('Script_InfantrySelector.py').read_text(encoding='utf-8'),'InfantrySelector','exec'))
for entry in catalog:
 faction,clip=entry['faction'],entry['clip']
 if clip=='RifleCrouchAdvance':continue
 scene=SelectInfantryClip(faction,clip)
 scene.render.engine='BLENDER_EEVEE'
 if hasattr(scene,'eevee'):scene.eevee.taa_render_samples=16
 scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100
 scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
 floor=bpy.data.objects['Scene_'+faction+'Floor'].data.materials[0]
 for n in floor.node_tree.nodes:
  if n.type=='TEX_CHECKER':n.inputs['Scale'].default_value=2/(entry['referenceSpeedMps']*entry['durationSeconds']) if 'RootMotion' in clip else 4
 projectile=[];release=None;velocity=Vector((0,-7,2.3))
 if clip=='GrenadeThrow':
  prop=bpy.data.objects['Socket_'+faction+'InfantryGrenade'];scene.frame_set(130);release=prop.matrix_world.copy()
  for child in prop.children:
   obj=bpy.data.objects.new('Preview_'+child.name,child.data);scene.collection.objects.link(obj);obj.matrix_world=release@child.matrix_local;projectile.append((obj,child.matrix_local.copy()))
 for view in ['ThreeQuarter','Side']:
  scene.camera=bpy.data.objects['Scene_'+faction+view];camera=scene.camera;initial=camera.location.copy()
  camera.data.ortho_scale=2.4 if clip=='GrenadeThrow' else (2.35 if view=='Side' else 2.25)
  lights={o.name:o.location.copy() for o in scene.objects if o.type=='LIGHT'}
  limit=entry['frames']-1 if entry['loop'] else entry['frames']
  for sample,frame in enumerate(range(1,limit+1,2)):
   scene.frame_set(frame);offset=Vector((0,-entry['referenceSpeedMps']*(frame-1)/60,0)) if 'RootMotion' in clip else Vector()
   camera.location=initial+offset+(Vector((0,-.18,0)) if view=='Side' and clip!='GrenadeThrow' else Vector())
   for name,location in lights.items():bpy.data.objects[name].location=location+offset
   if projectile:
    t=(frame-130)/60
    for obj,local in projectile:
     obj.hide_render=t<=0 or t>.6
     if t>0:
      matrix=release@Matrix.Rotation(t*7,4,'X');matrix.translation=release.translation+velocity*t+Vector((0,0,-4.905*t*t));obj.matrix_world=matrix@local
   scene.render.filepath=str(folder/f'Texture_{faction}_{clip}_{view}_{sample:04d}.png')
   if not Path(scene.render.filepath).exists() or (globals().get('INFANTRY_REFRESH_SIDE',False) and view=='Side' and clip!='GrenadeThrow'):bpy.ops.render.render(write_still=True)
   if sample%30==0:print('PREVIEW',faction,clip,view,sample,flush=True)
  camera.location=initial
  for name,location in lights.items():bpy.data.objects[name].location=location
 for obj,_ in projectile:bpy.data.objects.remove(obj,do_unlink=True)
print('RENDER_COMPLETE',flush=True)
