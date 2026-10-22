"""Derive an unhitched donkey from the preserved editable V3 animal collection."""
import bpy,json,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

project=Path(bpy.context.scene['DonkeyCartProject'])
source=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020/Scene_DonkeyCart.blend')
base=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Donkey/20261022')
if source.resolve()==(base/'Scene_Donkey.blend').resolve():raise RuntimeError('The derivative must use a separate source file')
sourceSha=hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(source))
scene=bpy.context.scene
scene['DonkeyCartProject']=str(project);scene['DonkeySourceRoot']=str(base)
scene['BlenderMcpTask']='Donkey'
scene['DonkeyVerifySkipStatic']=False
animalCollection=bpy.data.collections['DonkeyEditable']
animalObjects=set(animalCollection.all_objects)
if bpy.data.objects['DonkeyRig'] not in animalObjects:raise RuntimeError('Missing editable donkey rig')
if any(o.name.startswith(('Cart','Harness','Halter','Wheel')) for o in animalObjects):raise RuntimeError('Animal collection contains tack or cart geometry')
keep=animalObjects|set(bpy.data.collections['ReviewStudio'].all_objects)
removed=sorted(o.name for o in bpy.data.objects if o not in keep)
for obj in list(bpy.data.objects):
    if obj not in keep:bpy.data.objects.remove(obj,do_unlink=True)
for collection in list(bpy.data.collections):
    if collection.name not in ('DonkeyEditable','ReviewStudio'):bpy.data.collections.remove(collection)
for action in list(bpy.data.actions):
    if action.name not in ('DonkeyWalk','DonkeyIdle'):bpy.data.actions.remove(action)
for obj in animalObjects:obj.hide_render=False;obj.hide_set(False)
rig=bpy.data.objects['DonkeyRig']
if len(rig.data.bones)!=28:raise RuntimeError('Unexpected source animal skeleton')
scene.frame_set(0)
bpy.context.view_layer.update()
# The old decorative mouth tube floats 3-4 cm off the V3 muzzle. Fit its five
# six-vertex ring centres to the actual skin; preserve tube thickness and weights.
skin=bpy.data.objects['DonkeyContinuousSkin'];lip=bpy.data.objects['DonkeyMouthSeam']
surface=BVHTree.FromPolygons([skin.matrix_world@v.co for v in skin.data.vertices],[tuple(p.vertices) for p in skin.data.polygons])
if len(lip.data.vertices)!=30:raise RuntimeError('Unexpected mouth seam topology')
beforeDistances=[surface.find_nearest(lip.matrix_world@v.co)[3] for v in lip.data.vertices]
inverse=lip.matrix_world.inverted()
for start in range(0,len(lip.data.vertices),6):
    ring=list(lip.data.vertices)[start:start+6]
    centre=sum((lip.matrix_world@v.co for v in ring),Vector())/6
    point,normal,_,_=surface.find_nearest(centre)
    delta=point+normal*.0003-centre
    for vertex in ring:vertex.co=inverse@(lip.matrix_world@vertex.co+delta)
lip.data.update()
afterDistances=[surface.find_nearest(lip.matrix_world@v.co)[3] for v in lip.data.vertices]
if max(afterDistances)>.0025:raise RuntimeError('Decorative lip still floats off the muzzle')
base.mkdir(parents=True,exist_ok=True);(base/'Review').mkdir(exist_ok=True)
(base/'Recovery').mkdir(exist_ok=True)
bpy.context.preferences.filepaths.temporary_directory=str(base/'Recovery')
record={'source':str(source),'sourceSha256':sourceSha,'retainedCollection':'DonkeyEditable',
        'retainedObjects':sorted(o.name for o in animalObjects),'removedObjects':removed,
        'geometrySkinAndActions':'animal surfaces, weights, rig transforms and DonkeyWalk/DonkeyIdle retained without retargeting; decorative mouth seam fitted to the muzzle',
        'mouthSeamConform':{'maxDistanceBeforeM':max(beforeDistances),'maxDistanceAfterM':max(afterDistances),'vertices':30,'weightsUnchanged':True}}
(base/'Data_Derivation.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
# Save to the independent destination before any export or material bake.
bpy.ops.wm.save_as_mainfile(filepath=str(base/'Scene_Donkey.blend'))
if hashlib.sha256(source.read_bytes()).hexdigest()!=sourceSha:raise RuntimeError('Parent source file was changed')
print(json.dumps({'derivedSource':str(base/'Scene_Donkey.blend'),'retainedObjects':len(animalObjects),'removedObjects':len(removed),'parentSourceUnchanged':True}))
