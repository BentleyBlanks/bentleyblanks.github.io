"""Record inspected byte identities after source reopening + actual GLB motion audit.
Run with ordinary Python + Pillow after Script_NakajimaKi4Audit.py has passed.
This records evidence; it never automatically approves reference matching.
"""
import pathlib,struct,json,hashlib,io,os
from PIL import Image,ImageChops
repoRoot=pathlib.Path(__file__).resolve().parents[2]
root=pathlib.Path(os.environ.get('KI4_SOURCE_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/SurfaceV2'))
asset=pathlib.Path(os.environ.get('KI4_ASSET_ROOT',str(repoRoot/'Taierzhuang1938/Model/NakajimaKi4')))
def Hash(data):return hashlib.sha256(data).hexdigest()
def Glb(p):
    b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);return b,j,b[28+n:]
def Info(p):
    b,j,raw=Glb(p)
    return {'path':str(p.relative_to(repoRoot)) if p.is_relative_to(repoRoot) else str(p),'sha256':Hash(b),'bytes':len(b),'triangles':sum(j['accessors'][p['indices']]['count']//3 for m in j['meshes'] for p in m['primitives']),'meshes':len(j['meshes']),'images':len(j.get('images',[]))}
runtime=Info(asset/'Model_NakajimaKi4.glb');high=Info(root/'Exports/Model_NakajimaKi4High.glb')
motion=json.loads((root/'Evidence/Data_ReopenAndMotionAudit.json').read_text(encoding='utf8'))
assert motion['runtimeSha256']==runtime['sha256'], 'Motion audit must refer to the current delivered bytes'
assert motion['sourceSha256']==Hash((root/'Scene_NakajimaKi4.blend').read_bytes()), 'Reopen the latest saved source'
assert motion['actualGlbReimport'] and not any(r['staticTriangleIntersections'] for r in motion['motion'])
assert not any(r['triangleIntersections'] for r in motion['combinedControlPoses'])
assert motion['cowlEngineClearance']['trueTriangleIntersections']==0, 'The fixed cowl must clear the actual cast engine parts'
assert motion['observerGlassClearance']['trueTriangleIntersections']==0, 'The parked observer frame must clear the actual glazing'
assert motion['aileronNoseCove']['actualGlbReimport'] and motion['aileronNoseCove']['maxActualSurfaceDistanceM']<.0014, 'Actual game aileron nose and fixed cove must share their true straight axis'
assert motion['aileronNoseCove']['maxHighToGameNormalDifferenceDegrees']<5, 'Game hinge skin must retain the actual high-source normal field'
assert motion['upperWingSpars']['actualGlbReimport'] and motion['upperWingSpars']['maxRuntimeSurfaceDistanceM']<.002,'Actual upper struts must preserve the straight-spar installation'
assert motion['lowerWingSpars']['actualGlbReimport'] and motion['lowerWingSpars']['maxRuntimeSurfaceDistanceM']<.002,'Actual lower wire/strut fittings must preserve the printed480mm spar separation'
assert len(motion['combinedObserverControlPoses'])==9 and not any(r['staticTriangleIntersections'] or r['gunObstacleTriangleIntersections'] for r in motion['combinedObserverControlPoses']), 'Combined observer control poses must be clear'
_,g,raw=Glb(asset/'Model_NakajimaKi4.glb');images=[]
recipes=json.loads((root/'Textures/Data_TextureRecipes.json').read_text(encoding='utf8'))
expectedNames={f'Texture_Ki4{name}{channel}' for name in recipes for channel in ['Base','Normal','Orm']}
geometryAo=next(n.get('extras',{}).get('geometryAo',{}) for n in g['nodes'] if n.get('name')=='NakajimaKi4')
if geometryAo.get('enabled'):expectedNames.add('Texture_Ki4GeometryAo')
assert {i['name'] for i in g['images']}==expectedNames, 'Every baked material channel must be embedded exactly once'
for image in g['images']:
    view=g['bufferViews'][image['bufferView']];data=raw[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']];pic=Image.open(io.BytesIO(data));pic.load()
    bakedPath=root/'Textures'/(image['name']+'.png');baked=Image.open(bakedPath).convert('RGB')
    assert pic.size==baked.size and ImageChops.difference(pic.convert('RGB'),baked).getbbox() is None, image['name']+' exported pixels differ from the current bake'
    images.append({'name':image.get('name'),'size':list(pic.size),'mode':pic.mode,'sha256':Hash(data),'bytes':len(data),'bakedSha256':Hash(bakedPath.read_bytes()),'decodedRgbSha256':Hash(pic.convert('RGB').tobytes()),'allPixelsMatchBake':True})
def TextureImage(index):return g['images'][g['textures'][index]['source']]['name']
for mat in g['materials']:
    if any(word in mat['name'] for word in ['Shadow','InstrumentFaces','Windscreen']):continue
    pbr=mat['pbrMetallicRoughness'];base=TextureImage(pbr['baseColorTexture']['index']);normal=TextureImage(mat['normalTexture']['index']);orm=TextureImage(pbr['metallicRoughnessTexture']['index'])
    assert base.endswith('Base') and normal==base[:-4]+'Normal' and orm==base[:-4]+'Orm', mat['name']+' must use the same authored PBR set'
    if geometryAo.get('enabled'):
        assert TextureImage(mat['occlusionTexture']['index'])=='Texture_Ki4GeometryAo' and mat['occlusionTexture'].get('texCoord')==1, mat['name']+' must use the unique geometric/micro AO atlas on UV1'
        assert all(t.get('texCoord',0)==0 for t in [pbr['baseColorTexture'],pbr['metallicRoughnessTexture'],mat['normalTexture']]),mat['name']+' must retain all primary material channels on UV0'
    else:assert TextureImage(mat['occlusionTexture']['index'])==orm, mat['name']+' must preserve AO/Roughness/Metallic packing'
derivation=json.loads((root/'Evidence/Data_GameDerivation.json').read_text(encoding='utf8'))
version=next(n['extras']['version'] for n in g['nodes'] if n.get('name')=='NakajimaKi4')
record={'version':version,'runtime':runtime,'high':high,'source':{'path':str(root/'Scene_NakajimaKi4.blend'),'sha256':motion['sourceSha256'],**motion['source']},'dimensionsGltfXyzM':[motion['dimensionsBlenderXyzM'][0],motion['dimensionsBlenderXyzM'][2],motion['dimensionsBlenderXyzM'][1]],'pbrImages':images,'gameDerivation':derivation,'rigidMotionAudit':{'actualGlbReimport':True,'singleComponentSamples':len(motion['motion']),'combinedControlSamples':len(motion['combinedControlPoses']),'trueTriangleIntersections':0,'maxRadialDriftM':max(r['maxRadialDriftM'] for r in motion['motion']),'maxPivotDriftM':max(r['pivotDriftM'] for r in motion['motion'])},'scriptHashPolicy':'UTF-8 with LF line endings; all binary asset hashes remain exact','scripts':{p.name:Hash(p.read_text(encoding='utf8').encode('utf8')) for p in pathlib.Path(__file__).parent.glob('Script_NakajimaKi4*.py')}}
record['cowlEngineClearance']=motion['cowlEngineClearance']
record['observerGlassClearance']=motion['observerGlassClearance']
record['observerCarrierConnections']=motion['observerCarrierConnections']
record['aileronNoseCove']=motion['aileronNoseCove']
record['upperWingSpars']=motion['upperWingSpars']
record['lowerWingSpars']=motion['lowerWingSpars']
record['combinedObserverControlPoses']=motion['combinedObserverControlPoses']
if 'servicePanelApertureClearance' in motion:record['servicePanelApertureClearance']=motion['servicePanelApertureClearance']
if geometryAo.get('enabled'):
    record['geometryAo']=json.loads((root/'Textures/Data_GeometryAo.json').read_text(encoding='utf8'))
    previous=pathlib.Path(os.environ['KI4_MATERIAL_BASELINE_ROOT'])
    previousRecipe=json.loads((previous/'Textures/Data_TextureRecipes.json').read_text(encoding='utf8'))
    addedSets=set(recipes)-set(previousRecipe)
    assert set(previousRecipe)<=set(recipes),'Do not remove existing material sets'
    finish=next(n.get('extras',{}).get('observerFinish','DarkSteel') for n in g['nodes'] if n.get('name')=='NakajimaKi4')
    assert addedSets<=({'PaintedFrame'} if finish=='PaintedGray' else set()),'Only the explicitly declared observer coating may add a material set'
    if finish=='PaintedGray':assert 'PaintedFrame' in recipes
    surfaceProfile=next(n.get('extras',{}).get('fuselageSurfaceProfile','LegacySurfaceV2') for n in g['nodes'] if n.get('name')=='NakajimaKi4')
    assert surfaceProfile in ['LegacySurfaceV2','Photo02QuietRoughness']
    allowedChanges={'Texture_Ki4FuselageOrm.png'} if surfaceProfile=='Photo02QuietRoughness' else set()
    unchanged=[];changed=[]
    for name in previousRecipe:
        for channel in ['Base','Normal','Orm']:
            filename=f'Texture_Ki4{name}{channel}.png';currentFile=root/'Textures'/filename;previousFile=previous/'Textures'/filename
            if Hash(currentFile.read_bytes())==Hash(previousFile.read_bytes()):unchanged.append(filename);continue
            assert filename in allowedChanges,filename+' must retain its original full-resolution pixels'
            before=Image.open(previousFile).convert('RGB');after=Image.open(currentFile).convert('RGB');assert before.size==after.size==(4096,2048)
            assert ImageChops.difference(before.getchannel('R'),after.getchannel('R')).getbbox() is None,'Body ORM AO bytes must be retained'
            assert ImageChops.difference(before.getchannel('B'),after.getchannel('B')).getbbox() is None,'Body ORM metallic bytes must be retained'
            reviewed='64111b2ce75cca5803731a0e9dc5b2d7c5018ad0f3df72b70f50fbf8317a5726'
            assert Hash(after.tobytes())==reviewed,'The changed body map must match the two-light-reviewed target pixels'
            changed.append({'file':filename,'previousPngSha256':Hash(previousFile.read_bytes()),'currentPngSha256':Hash(currentFile.read_bytes()),'decodedRgbSha256':reviewed,'changedChannels':['G'],'aoMetallicBytesRetained':True,'size':[4096,2048]})
    record['unchangedPrimaryMaterialFiles']=unchanged
    record['changedPrimaryMaterialFiles']=changed
    record['fuselageSurfaceProfile']=surfaceProfile
    if surfaceProfile=='Photo02QuietRoughness':
        reviewed='64111b2ce75cca5803731a0e9dc5b2d7c5018ad0f3df72b70f50fbf8317a5726'
        actual=next(image for image in images if image['name']=='Texture_Ki4FuselageOrm')
        assert actual['decodedRgbSha256']==reviewed
        record['fuselageRoughnessAdjustment']={'profile':surfaceProfile,'factor':.25,'reviewedDecodedRgbSha256':reviewed,'actualExportedDecodedRgbSha256':actual['decodedRgbSha256'],'recipe':recipes['Fuselage']['roughnessContrast'],'scope':'Only reviewed body roughness variance changes. No new material set, albedo/normal edit, metallic/AO edit or geometry change is authorized by this profile.'}
    record['baselineMaterialSets']=sorted(previousRecipe)
    record['addedMaterialSets']=sorted(addedSets)
    record['addedMaterialFiles']=[f'Texture_Ki4{name}{channel}.png' for name in sorted(addedSets) for channel in ['Base','Normal','Orm']]
    if finish=='PaintedGray':
        paintOrm=Image.open(root/'Textures/Texture_Ki4PaintedFrameOrm.png').convert('RGB');extrema=paintOrm.getextrema()
        assert extrema[2]==(0,0) and 110<=extrema[1][0]<=extrema[1][1]<=135,'Coating must remain a neutral rough dielectric'
        record['paintedFrameOrmExtrema']=extrema
    if geometryAo.get('seamStitchingEnabled'):
        agreement=json.loads((root/'Evidence/Data_AoFieldAgreement.json').read_text(encoding='utf8'))
        assert agreement['ok'] and agreement['samples']==35 and agreement['tolerance']==1/255
        assert agreement['runtimeSha256']==runtime['sha256'] and agreement['highSha256']==high['sha256'], 'AO field proof must bind both actual current GLBs'
        assert agreement['maxAoDifference']<=1/255, 'Do not weaken the actual high/game AO seam tolerance'
        fieldTest=repoRoot/'Taierzhuang1938/Script_NakajimaKi4AoFieldTest.mjs'
        assert agreement['testScriptSha256']==Hash(fieldTest.read_text(encoding='utf8').encode('utf8'))
        record['aoFieldAgreement']=agreement
(asset/'Data_ExportAudit.json').write_text(json.dumps(record,indent=2,ensure_ascii=False),encoding='utf8')
refs=[]
for name in ['Ki-4_94siki-tei.jpg','Nakajima_Ki-4.jpg','Ki-4_01_00086145.jpg']:
    p=root.parent/'References'/name;pic=Image.open(p);refs.append({'file':name,'source':'https://commons.wikimedia.org/wiki/File:'+name,'originalSha256':Hash(p.read_bytes()),'bytes':p.stat().st_size,'dimensions':list(pic.size)})
(asset/'Data_ReferenceArchive.json').write_text(json.dumps({'archive':str(root.parent/'References'),'surfaceReferenceArchive':str(root/'References'),'photos':refs,'manualManifest':'https://dl.ndl.go.jp/api/iiif/8815746/manifest.json','manualCanvasNumbersUsed':[5,6,64,68,72,73,74,75,83,84,86,88,89,90,99,100,118],'privacy':'Historical originals and review sheets retained locally; material albedo input sources are versioned for rebuilding'},indent=2,ensure_ascii=False),encoding='utf8')
print(json.dumps({'runtime':runtime,'high':high,'maxSampledGameSurfaceErrorM':max(r['maxVertexSurfaceErrorM'] for r in derivation),'motionSamples':len(motion['motion'])+len(motion['combinedControlPoses'])}))
