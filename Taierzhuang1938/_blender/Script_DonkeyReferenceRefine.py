"""Apply the measured V4 recipe in a separate request after opening Blender."""
import bpy,json
from pathlib import Path

scene=bpy.context.scene;project=Path(scene['DonkeyCartProject']);base=Path(scene['DonkeySourceRoot'])
namespace={}
exec(compile((project/'_blender/Script_DonkeyReferenceFit.py').read_text(encoding='utf-8'),'Script_DonkeyReferenceFit.py','exec'),namespace)
report=namespace['ApplyReferenceFit'](scene,base)
record=json.loads((base/'Data_Derivation.json').read_text(encoding='utf-8'))
record['referenceFit']=report
record['referenceRetainedObjects']=sorted(o.name for o in bpy.data.collections['DonkeyEditable'].all_objects)
record['coat'].update(report['groom'])
record['coat'].update({'version':report['version'],'detailNormalUv':'FurDetailUV; measured short-coat flow, 0.45 m per texture repeat',
    'detailTexelsPerMetre':1024/.45,'pigment':'calibrated three-view charcoal gray, pale underside and short muzzle; dark chest, coarse short fibre microcontrast',
    'bodyShape':'measured body and foot stance, closed rebuilt neck, rounded sternum, corrected eyes, nasal apertures, ears, mane and tail brush'})
record['geometrySkinAndActions']='V4 reference fit from preserved bare V3; 28 compatible bones, new rest joints and re-solved walk/idle; closed manifold skin'
(base/'Data_Derivation.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(base/'Scene_Donkey.blend'))
print(json.dumps(report))
