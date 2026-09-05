"""Task-owned background bake, dispatched via BlenderMCP without switching another scene."""
from pathlib import Path
import sys, bpy, json
root=Path(__file__).resolve().parents[1]
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
assert Path(bpy.data.filepath).name=='Scene_MeleeFusion.blend', 'Only the task-owned source may be saved'
scope={'MELEE_PROJECT_ROOT':str(root),'__file__':str(__file__)}
if args and args[0]=='verify':
 result={'file':bpy.data.filepath,'actors':{role:sum(a.name.startswith('Animation_'+role) and not a.name.startswith('Animation_'+role+'Weapon') for a in bpy.data.actions) for role in ['Nra','Ija','FirstPerson']},'actions':len(bpy.data.actions),'packedImages':sum(bool(i.packed_file) for i in bpy.data.images),'texts':[t.name for t in bpy.data.texts],'scenes':[s.name for s in bpy.data.scenes]}
 print(json.dumps(result,ensure_ascii=False),flush=True)
 (Path(bpy.data.filepath).parent/'Data_SourceVerification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
elif args and args[0]=='studio':
 p=root/'_blender/Script_MeleeStudio.py'
 exec(compile(p.read_text(encoding='utf-8'),str(p),'exec'),scope)
elif args and args[0]=='firstperson':
 for weapon in ['Dadao','Bayonet']:
  scope['MELEE_WEAPON']=weapon
  p=root/'_blender/Script_MeleeFirstPersonBake.py'
  exec(compile(p.read_text(encoding='utf-8'),str(p),'exec'),scope)
 p=root/'_blender/Script_MeleeStudio.py'
 exec(compile(p.read_text(encoding='utf-8'),str(p),'exec'),scope)
else:
 if args:scope['MELEE_ACTIONS']=args
 for faction in ['Nra','Ija']:
  scope['MELEE_FACTION']=faction
  p=root/'_blender/Script_MeleeAnimationBake.py'
  exec(compile(p.read_text(encoding='utf-8'),str(p),'exec'),scope)
  print(scope['result'],flush=True)
print('MELEE_FUSION_BAKE_COMPLETE',flush=True)
