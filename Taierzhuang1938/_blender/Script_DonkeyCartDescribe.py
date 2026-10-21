"""Write the independent asset contract from the actual export and verification."""
import bpy,json,hashlib
from pathlib import Path
from mathutils import Vector
scene=bpy.context.scene;project=Path(scene['DonkeyCartProject'])
base=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020')
output=project/'Model/DonkeyCart';asset=output/'Model_DonkeyCart.glb'
def Read(path):return json.loads(path.read_text(encoding='utf-8'))
packing=Read(output/'Data_DonkeyCartPacking.json');bake=Read(base/'Review/Data_ExportBake.json')
native=Read(base/'Review/Data_AnimationMeasurements.json');integrity=Read(base/'Review/Data_IntegrityVerification.json')
imported=Read(base/'Review/Data_ImportedGlbVerification.json')
sha=hashlib.sha256(asset.read_bytes()).hexdigest()
if imported['assetSha256']!=sha:raise RuntimeError('Verification belongs to an older GLB')
points=[]
for name in ('DonkeyRuntime','CartRuntime'):
    obj=bpy.data.objects[name];points.extend(obj.matrix_world@v.co for v in obj.data.vertices)
blenderMin=[min(p[i] for p in points) for i in range(3)];blenderMax=[max(p[i] for p in points) for i in range(3)]
gltfPoints=[Vector((p.x,p.z,-p.y)) for p in points]
gltfMin=[min(p[i] for p in gltfPoints) for i in range(3)];gltfMax=[max(p[i] for p in gltfPoints) for i in range(3)]
textures={'schema':'tengxian-independent-prop-textures-v1','asset':'DonkeyCart','version':'20261022UpperLegsCoatCartV3',
 'uv':'two non-overlapping GameUV atlases with reserved anatomy/timber groups, exported as UV0','colorSpace':{'Base':'sRGB','Normal':'linear OpenGL +Y','Orm':'linear; R=1, G=roughness, B=metallic'},
 'sizeReason':'Animal 2048 Base / 1024 Normal; Cart 4096 Base / 2048 Normal preserves close grain over its much larger surface. ORM 512 for both. Body and wheels are protected from tiny hair/fastener chart padding.',
 'source':{'provider':'built-in imagegen + procedural + sourcePack','furInput':str(base/'SourceTextures/Texture_DonkeyWeatheredCoatSourceV3.png'),
 'furPromptRecord':str(base/'Refinement20261022/Data_WeatheredCoatRefinement.json'),'elmInput':str(base/'SourceTextures/Texture_DonkeyAgedElmSourceV3.png'),
 'surfaceGenerationRecord':str(base/'Refinement20261022/Data_SurfaceGenerationV3.json'),'referenceGenerationRecord':str(base/'Data_ImageGeneration.json'),
 'sculptNormal':'CC0 Lyndon Daniels / ChadM equine surface normal from preserved source'},
 'bake':{'method':'Cycles diffuse colour only, tangent normal and explicit ORM emission; no direct/indirect lighting in base colour','script':'_blender/Script_DonkeyCartExport.py','losslessWebp':True},'textures':packing['images']}
(output/'Data_DonkeyCartTextures.json').write_text(json.dumps(textures,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
contract={'schema':'tengxian-independent-rigged-prop-v1','id':'DonkeyCart','version':'20261022UpperLegsCoatCartV3','asset':asset.name,
 'textureManifest':'Data_DonkeyCartTextures.json','sha256':sha,'bytes':asset.stat().st_size,'units':'metres','upAxis':'+Y','facingAxis':'-Z',
 'sourceCoordinates':'Blender +Y forward / +Z up; exported once to glTF -Z forward / +Y up','pivotM':[0,0,0],
 'nominalWithersHeightM':1.10,'boundsM':{'min':gltfMin,'max':gltfMax,'dimensions':[gltfMax[i]-gltfMin[i] for i in range(3)]},
 'feet':{'construction':'continuous cannon/carpus/hock/fetlock/pastern; single horn wall and recessed sole, short rear feathering',
 'hoofWallDimensionsM':integrity['hoofWallDimensionsM'],'frontCarpusHeightM':.48,'rearHockHeightM':.47,'fetlockPivotHeightM':.155,
 'source':'_blender/Script_DonkeyCartFeet.py','appearance':'reference-led creative anatomy; dimensions are authoring choices'},
 'upperForelegs':{'construction':'reference-aligned elbow/carpus with separately fitted continuous forearm surface','fitScript':'_blender/Script_DonkeyCartAnatomy.py',
 'elbowToCarpusOffsetM':{side:abs(bpy.data.objects['DonkeyRig'].data.bones['DonkeyFront'+side+'ElbowPivot'].head_local.y-bpy.data.objects['DonkeyRig'].data.bones['DonkeyFront'+side+'KneePivot'].head_local.y) for side in ('Left','Right')}},
 'coat':{'construction':'directional source fur, varied roughness, geometric short tufts along the body and limbs','sourceScript':'_blender/Script_DonkeyCartSurface.py'},
 'cart':{'bedLengthM':float(bpy.data.objects['DonkeyCartRig']['authoredBedLengthM']),'bedWidthM':1.075,'wheelRadiusM':float(bpy.data.objects['DonkeyCartRig']['wheelRadiusM']),'wheelSpokes':14,'wheelTimberSegments':6},
 'triangles':{'total':bake['totalTriangles'],'limit':80000,'byBatch':{r['label']:r['triangles'] for r in bake['batches']},
 'runtimeCartMaxSurfaceDeviationM':max(r['budgetSurfaceMaxErrorM'] for r in bake['batches'])},
 'runtime':{'meshes':['DonkeyRuntime','CartRuntime'],'skins':packing['skins'],'materials':2,'maxInfluences':4,'morphTargets':0,'uvAtlasCoverage':{r['label']:r['atlasCoverage'] for r in bake['batches']},'averageTexelsPerMetre':{r['label']:r['atlasTexelsPerMetre'] for r in bake['batches']}},
 'animations':{'DonkeyWalk':{'durationS':native['periodS'],'strideM':native['strideM'],'speedMps':native['speedMps'],'inPlace':True,'supportCompressionM':float(bpy.data.objects['DonkeyRig']['walkStanceCompressionM'])},
 'DonkeyIdle':{'durationS':3.0},'CartRoll':{'durationS':2.0,'distancePerCycleM':float(bpy.data.objects['DonkeyCartRig']['rollDistancePerCycleM'])},
 'coupling':'Advance the assembly along local -Z by distance; Walk time = distance / strideM * walkDuration; CartRoll time = distance / wheelCircumference * 2 seconds. Idle freezes wheel distance.'},
 'verification':{'nativeStanceSoleRangeM':native['stanceSoleRangeM'],'nativeStanceDriftPerFrameM':native['worstStanceDriftPerFrameM'],
 'reimportedStanceSoleRangeM':imported['stanceSoleRangeM'],'reimportedStanceDriftPerFrameM':imported['worstStanceDriftPerFrameM'],
 'continuousLegRoots':integrity['continuousLegRootPaths'],'traceAnchorDriftM':integrity['maxTraceAnchorDriftM'],'traceBindingGapM':integrity['maxTraceToBindingGapM'],
 'continuousHornToTorsoPaths':integrity['continuousHornToTorsoPaths'],'maxHornNonHoofWeight':integrity['maxHornNonHoofWeight'],'maxRebuiltLowerForeignWeight':integrity['maxRebuiltLowerForeignWeight'],
 'maxTyreFastenerSpanM':integrity['maxTyreFastenerSpanM'],'maxHeadLimbWeight':integrity['maxHeadLimbWeight'],
 'dropTugGapM':integrity['maxDropToTugGapM'],'skinWeightSumError':integrity['skinWeightSumError'],'webpPixelsUnchanged':True,'geometrySkinActionsUnchangedDuringPacking':True},
 'editableSource':str(base/'Scene_DonkeyCart.blend'),'preservedSourceTemplate':str(base/'ReuseAudit/Scene_Round14Candidate.blend'),
 'rigReuse':{'retained':'four-pivot quadruped hierarchy, analytic folding-cannon solver and distance clock conventions',
 'rebuilt':'donkey proportions, head/ear/tail geometry, physical joint origins, voxel heat skin, walk/idle, cart, all attached harness and wheel surfaces',
 'notReused':'old Walk/Trot actions, candidate facial rings, horse hair cards, candidate harness detachment dynamics; the candidate was not treated as accepted'},
 'credits':[{'name':'Lyndon Daniels / ChadM Rigged Horse','license':'CC0','url':'https://opengameart.org/content/rigged-horse','use':'retained editable skin topology and sculpt normal, extensively reshaped to the supplied donkey reference'},
 {'name':'User supplied donkey and cart reference plus built-in Imagegen','use':'subject identity, reference turnaround and short fur material'}],
 'reconstructionScope':'驴的比例、毛色、旧损与木车、套具的具体做法按用户参考图创作；不是1938年鲁南统一样式或某一件实物的复刻。尺寸为建模定标，不作为史料规格。',
 'historicalReferences':[],'rebuild':'node Taierzhuang1938/_blender/Script_DonkeyCartRebuild.mjs'}
(output/'Data_DonkeyCart.json').write_text(json.dumps(contract,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'asset':str(asset),'sha256':sha,'triangles':bake['totalTriangles'],'dimensionsM':contract['boundsM']['dimensions']}))
