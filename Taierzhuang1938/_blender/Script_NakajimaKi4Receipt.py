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
_,g,raw=Glb(asset/'Model_NakajimaKi4.glb');images=[]
recipes=json.loads((root/'Textures/Data_TextureRecipes.json').read_text(encoding='utf8'))
expectedNames={f'Texture_Ki4{name}{channel}' for name in recipes for channel in ['Base','Normal','Orm']}
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
    assert TextureImage(mat['occlusionTexture']['index'])==orm, mat['name']+' must preserve AO/Roughness/Metallic packing'
derivation=json.loads((root/'Evidence/Data_GameDerivation.json').read_text(encoding='utf8'))
record={'version':'20261023SurfaceV2','runtime':runtime,'high':high,'source':{'path':str(root/'Scene_NakajimaKi4.blend'),'sha256':motion['sourceSha256'],**motion['source']},'dimensionsGltfXyzM':[motion['dimensionsBlenderXyzM'][0],motion['dimensionsBlenderXyzM'][2],motion['dimensionsBlenderXyzM'][1]],'pbrImages':images,'gameDerivation':derivation,'rigidMotionAudit':{'actualGlbReimport':True,'singleComponentSamples':len(motion['motion']),'combinedControlSamples':len(motion['combinedControlPoses']),'trueTriangleIntersections':0,'maxRadialDriftM':max(r['maxRadialDriftM'] for r in motion['motion']),'maxPivotDriftM':max(r['pivotDriftM'] for r in motion['motion'])},'scriptHashPolicy':'UTF-8 with LF line endings; all binary asset hashes remain exact','scripts':{p.name:Hash(p.read_text(encoding='utf8').encode('utf8')) for p in pathlib.Path(__file__).parent.glob('Script_NakajimaKi4*.py')}}
(asset/'Data_ExportAudit.json').write_text(json.dumps(record,indent=2,ensure_ascii=False),encoding='utf8')
refs=[]
for name in ['Ki-4_94siki-tei.jpg','Nakajima_Ki-4.jpg','Ki-4_01_00086145.jpg']:
    p=root.parent/'References'/name;pic=Image.open(p);refs.append({'file':name,'source':'https://commons.wikimedia.org/wiki/File:'+name,'originalSha256':Hash(p.read_bytes()),'bytes':p.stat().st_size,'dimensions':list(pic.size)})
(asset/'Data_ReferenceArchive.json').write_text(json.dumps({'archive':str(root.parent/'References'),'surfaceReferenceArchive':str(root/'References'),'photos':refs,'manualManifest':'https://dl.ndl.go.jp/api/iiif/8815746/manifest.json','manualCanvasNumbersUsed':[5,6,64,68,72,73,74,75,83,84,96,99,100,118],'privacy':'Historical originals and review sheets retained locally; material albedo input sources are versioned for rebuilding'},indent=2,ensure_ascii=False),encoding='utf8')
print(json.dumps({'runtime':runtime,'high':high,'maxSampledGameSurfaceErrorM':max(r['maxVertexSurfaceErrorM'] for r in derivation),'motionSamples':len(motion['motion'])+len(motion['combinedControlPoses'])}))
