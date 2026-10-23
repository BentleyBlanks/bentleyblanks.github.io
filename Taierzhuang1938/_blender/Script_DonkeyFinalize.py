"""Describe the verified standalone GLB and archive its independent source."""
import bpy,json,hashlib
from pathlib import Path
from mathutils import Vector,Matrix

scene=bpy.context.scene;project=Path(scene['DonkeyCartProject']);base=Path(scene['DonkeySourceRoot'])
output=project/'Model/Donkey';asset=output/'Model_Donkey.glb'
def Read(path):return json.loads(path.read_text(encoding='utf-8'))
parent=Read(project/'Model/DonkeyCart/Data_DonkeyCart.json')
parentTextures=Read(project/'Model/DonkeyCart/Data_DonkeyCartTextures.json')
packing=Read(output/'Data_DonkeyPacking.json');bake=Read(base/'Review/Data_ExportBake.json')
imported=Read(base/'Review/Data_ImportedGlbVerification.json');derivation=Read(base/'Data_Derivation.json')
native=Read(base/'Review/Data_AnimationMeasurements.json')
sha=hashlib.sha256(asset.read_bytes()).hexdigest()
if imported['assetSha256']!=sha:raise RuntimeError('Verification belongs to an older GLB')
if hashlib.sha256(Path(derivation['source']).read_bytes()).hexdigest()!=derivation['sourceSha256']:raise RuntimeError('Parent source changed during derivation')
if bpy.data.objects.get('DonkeyCartRig') or any(o.name.startswith(('Harness','Halter','Cart','Wheel')) for o in bpy.data.objects):raise RuntimeError('Non-animal objects remain')
scene.frame_set(0);bpy.context.view_layer.update()
runtimeNames=[row.get('meshName','DonkeyRuntime') for row in bake['batches']]
points=[bpy.data.objects[name].matrix_world@v.co for name in runtimeNames for v in bpy.data.objects[name].data.vertices]
points=[Vector((p.x,p.z,-p.y)) for p in points]
low=[min(p[i] for p in points) for i in range(3)];high=[max(p[i] for p in points) for i in range(3)]
textures={'schema':'tengxian-independent-prop-textures-v1','asset':'Donkey','version':'20261023FurV3',
 'uv':'unique accessory atlas UV0; repeated fibre Base/Normal on UV1 with RuntimeCoatTint anatomy pigment; reused edge tuft cells with per-root HairTint',
 'colorSpace':parentTextures['colorSpace'],'sizeReason':'1024 repeated fibre Base/Normal at 0.22 m retains coarse short strands in close views. Accessories use 2048 Base / 1024 baked Normal / 512 ORM; edge tuft Base alpha and Normal 1024. Seven unique images, shared ORM.',
 'source':{k:v for k,v in parentTextures['source'].items() if k!='elmInput'},
 'bake':parentTextures['bake'],'textures':packing['images']}
textures['source']['shortFurCards']=Read(base/'SourceTextures/Data_FurGeneration.json')
textures['source']['shortFurFibres']=Read(base/'SourceTextures/Data_FiberGeneration.json')
textures['source']['shortFurRefinement']=Read(base/'SourceTextures/Data_ShortFiberGeneration.json')
(output/'Data_DonkeyTextures.json').write_text(json.dumps(textures,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
contract={'schema':'tengxian-independent-rigged-prop-v1','id':'Donkey','version':'20261023FurV3','asset':asset.name,
 'textureManifest':'Data_DonkeyTextures.json','sha256':sha,'bytes':asset.stat().st_size,'units':'metres','upAxis':'+Y','facingAxis':'-Z',
 'sourceCoordinates':parent['sourceCoordinates'],'pivotM':[0,0,0],'nominalWithersHeightM':parent['nominalWithersHeightM'],
 'boundsM':{'min':low,'max':high,'dimensions':[high[i]-low[i] for i in range(3)]},
 'feet':{**parent['feet'],'frontCarpusHeightM':.39,'rearHockHeightM':.38},'upperForelegs':parent['upperForelegs'],
 'coat':{**derivation['coat'],'sourceScript':'_blender/Script_DonkeyCoat.py','shadow':'groomCastShadow=false; body and accessories cast shadows, micro-fibre layer receives them'},
 'triangles':{'total':bake['totalTriangles'],'limit':80000,'byBatch':{r['label']:r['triangles'] for r in bake['batches']},'decimated':False},
 'runtime':{'meshes':runtimeNames,'skins':packing['skins'],'materials':3,'maxInfluences':4,'morphTargets':0,
 'uvAtlasCoverage':{r['label']:r['atlasCoverage'] for r in bake['batches']},'averageTexelsPerMetre':{r['label']:r['atlasTexelsPerMetre'] for r in bake['batches']}},
 'animations':{name:parent['animations'][name] for name in ('DonkeyWalk','DonkeyIdle')},
 'motion':'Advance the root along local -Z. Walk time = distance / 0.68 * 1.2 seconds; Idle uses an independent 3-second clock.',
 'derivation':{'parentAsset':'../DonkeyCart/Model_DonkeyCart.glb','parentAssetSha256':parent['sha256'],
 'source':derivation['source'],'sourceSha256':derivation['sourceSha256'],'retainedCollection':'DonkeyEditable',
 'retainedObjectCount':len(derivation['retainedObjects']),'removedObjectCount':len(derivation['removedObjects']),
 'scope':'animal body, eyes, ears, mane, tail and short fur only; no cart, shafts, collar, straps, halter or lead rope',
 'mouthSeamConform':derivation['mouthSeamConform'],
 'appearance':derivation['appearance'],
 'coat':derivation['coat'],
 'skeleton':'28 bone names and hierarchy retained; carpus/hock lowered by 9 cm, both actions re-solved. Unused DonkeyHitchPivot retained for compatibility.'},
 'verification':{'reimportedStanceSoleRangeM':imported['stanceSoleRangeM'],'reimportedStanceDriftPerFrameM':imported['worstStanceDriftPerFrameM'],
 'sampleCount':len(imported['samples']),'webpPixelsUnchanged':True,'geometrySkinActionsUnchangedDuringPacking':packing['geometrySkinActionsUnchanged'],
 'nativeStanceSoleRangeM':native['stanceSoleRangeM'],'nativeStanceDriftPerFrameM':native['worstStanceDriftPerFrameM'],
 'reimportedIdleStanceSoleRangeM':imported['idleStanceSoleRangeM'],
 'parentSourceUnchanged':True,'sourceAnatomyEvidence':'V2 bone layout and hoof surfaces retained. Selected torso edges are subdivided for rib/scapula form; inserted weights are interpolated and normalized to four influences. Both clips and the packed GLB are independently sampled.'},
 'editableSource':str(base/'Scene_Donkey.blend'),'credits':parent['credits'],
 'reconstructionScope':'灰驴的比例、毛色与表面细节沿用用户参考图创作复原；尺寸为建模定标，不作为史料规格。',
 'historicalReferences':[],'rebuild':'node Taierzhuang1938/_blender/Script_DonkeyRebuild.mjs'}
(output/'Data_Donkey.json').write_text(json.dumps(contract,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for file in sorted((project/'_blender').glob('Script_Donkey*')):
    if file.suffix not in ('.py','.mjs'):continue
    text=bpy.data.texts.get(file.name) or bpy.data.texts.new(file.name);text.clear();text.write(file.read_text(encoding='utf-8'));text.use_fake_user=True
for file in (base/'Data_Derivation.json',output/'Data_Donkey.json',output/'Data_DonkeyTextures.json'):
    text=bpy.data.texts.get(file.name) or bpy.data.texts.new(file.name);text.clear();text.write(file.read_text(encoding='utf-8'));text.use_fake_user=True
for file in (base/'SourceTextures').glob('Data_*Generation.json'):
    text=bpy.data.texts.get(file.name) or bpy.data.texts.new(file.name);text.clear();text.write(file.read_text(encoding='utf-8'));text.use_fake_user=True
rig=bpy.data.objects['DonkeyRig'];rig.data.pose_position='POSE'
for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
scene.frame_start=1;scene.frame_end=37
camera=bpy.data.objects['ReviewCamera'];camera.location=(-4,5,2.8);camera.rotation_euler=(Vector((0,0,.81))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=2.5
scene.render.resolution_x=640;scene.render.resolution_y=400;scene.render.resolution_percentage=100
for action in bpy.data.actions:
    if action.name not in ('DonkeyWalk','DonkeyIdle') and action.users<=int(action.use_fake_user):action.use_fake_user=False
bpy.data.orphans_purge(do_local_ids=True,do_linked_ids=True,do_recursive=True)
for image in bpy.data.images:
    if image.users and image.type=='IMAGE' and not image.packed_file:image.pack()
bpy.ops.object.select_all(action='DESELECT');rig.hide_set(False);rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.wm.save_as_mainfile(filepath=str(base/'Scene_Donkey.blend'))
print(json.dumps({'asset':str(asset),'sha256':sha,'triangles':bake['totalTriangles'],'dimensionsM':contract['boundsM']['dimensions'],'source':str(base/'Scene_Donkey.blend')}))
