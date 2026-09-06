"""Package task-owned editable FPS and untouched recovery stages via BlenderMCP."""
from pathlib import Path
import bpy,sys,json,runpy
project=Path(__file__).resolve().parents[1];root=Path(r'C:\Users\Bentl\OneDrive\Sync\饮河\FPS\视频转骨骼')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(project/'Model/Model_FpsArmsNraSkeletal01.glb'))
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');arm.name='MeleeFirstPerson'
path=root/'Blender/MeleeVideoV1/Scene_MeleeVideoFirstPerson.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(path),compress=True)
for weapon in ['Dadao','Bayonet']:
 script=project/'_blender/Script_MeleeFirstPersonBake.py'
 scope={'__file__':str(script),'MELEE_PROJECT_ROOT':str(project),'MELEE_WEAPON':weapon}
 exec(compile(script.read_text(encoding='utf-8'),str(script),'exec'),scope)
for action in bpy.data.actions:
 if action.name.startswith('Animation_FirstPerson'):
  name=action.name.replace('Animation_FirstPersonWeapon','').replace('Animation_FirstPerson','')
  source=json.loads((project/'Data_MeleeVideoAnimations.mjs').read_text(encoding='utf-8').split(' = ',1)[1].strip().rstrip(';'))['clips'].get(name)
  if source:
   action['source']='GVHMR video / '+source['source'];action['sourceFrames']=source['sourceFrames'];action['sourceSha256']=source['sourceSha256']
for scene in list(bpy.data.scenes):
 if scene.name!='Scene_FirstPersonMelee':bpy.data.scenes.remove(scene)
for name in ['Script_MeleeVideoPrepare.py','Script_MeleeVideoContact.py']:
 text=bpy.data.texts.new(name);text.write((project/'_import'/name).read_text(encoding='utf-8'))
bpy.context.scene['reviewStatus']='Video-derived FPS retarget; grip and anatomy tested in production renderer'
bpy.ops.wm.save_as_mainfile(filepath=str(path),compress=True)
for source,name in [('DadaoCutsV1','DadaoLight'),('DadaoParriesV1','DadaoParryLeft'),('StaffThrustsV1','BayonetLight'),('BayonetParriesV1','BayonetParryLeft')]:
 sys.argv=['Script_MotionRawSkeleton.py','--','--root',str(root),'--raw',f'Models/RecoveryPreview/Data_V1_{name}RawJoints.json','--name',source]
 runpy.run_path(str(project/'_import/Script_MotionRawSkeleton.py'),run_name='__main__')
versions=root/'Models/MeleeVideoV1/Data_Versions.json';data=json.loads(versions.read_text(encoding='utf-8'))
recipes=json.loads((root/'Models/MeleeVideoV1/Data_Recipes.json').read_text(encoding='utf-8'))
for entry in data['actions']:
 for v in entry['variants']:
  source=recipes[entry['id']]['source'];v['review']['recoveryBlend']=f'Blender/RawRecovery/Scene_{source}RawRecovery_V1.blend';v['review']['recoveryGlb']=f'Models/RecoveryPreview/Animation_{source}RawRecovery_V1.glb'
  v['review']['firstPersonBlend']=path.relative_to(root).as_posix()
versions.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print('MELEE_VIDEO_SOURCE_PACKAGE_COMPLETE',flush=True)
