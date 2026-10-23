"""Apply the appearance recipe after Blender has switched to the derived scene."""
import bpy,json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

scene=bpy.context.scene;project=Path(scene['DonkeyCartProject']);base=Path(scene['DonkeySourceRoot'])
if Path(bpy.data.filepath).resolve()!=(base/'Scene_Donkey.blend').resolve():raise RuntimeError('Refinement requires the standalone source')
namespace={}
exec(compile((project/'_blender/Script_DonkeyAppearance.py').read_text(encoding='utf-8'),'Script_DonkeyAppearance.py','exec'),namespace)
skin=bpy.data.objects['DonkeyContinuousSkin'];rig=bpy.data.objects['DonkeyRig'];lip=bpy.data.objects['DonkeyMouthSeam']
appearance=namespace['RefineAppearance'](skin,rig,bpy.data.collections['DonkeyEditable'],base)
coatNamespace={}
exec(compile((project/'_blender/Script_DonkeyCoat.py').read_text(encoding='utf-8'),'Script_DonkeyCoat.py','exec'),coatNamespace)
coat=coatNamespace['RefineCoat'](scene,base)
surface=BVHTree.FromPolygons([skin.matrix_world@v.co for v in skin.data.vertices],[tuple(p.vertices) for p in skin.data.polygons])
before=max(surface.find_nearest(lip.matrix_world@v.co)[3] for v in lip.data.vertices)
inverse=lip.matrix_world.inverted()
for start in range(0,len(lip.data.vertices),6):
    ring=list(lip.data.vertices)[start:start+6];centre=sum((lip.matrix_world@v.co for v in ring),Vector())/6
    point,normal,_,_=surface.find_nearest(centre)
    for vertex in ring:vertex.co=inverse@(point+normal*.0003+(lip.matrix_world@vertex.co-centre)*.65)
lip.data.update();after=max(surface.find_nearest(lip.matrix_world@v.co)[3] for v in lip.data.vertices)
if after>.0025:raise RuntimeError('Refined mouth seam floats off muzzle: '+str(after))
record=json.loads((base/'Data_Derivation.json').read_text(encoding='utf-8'))
record['appearance']=appearance
record['coat']=coat
record['mouthSeamConform']['refinedMaxDistanceBeforeM']=before
record['mouthSeamConform']['refinedMaxDistanceAfterM']=after
(base/'Data_Derivation.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(base/'Scene_Donkey.blend'))
print(json.dumps(appearance))
