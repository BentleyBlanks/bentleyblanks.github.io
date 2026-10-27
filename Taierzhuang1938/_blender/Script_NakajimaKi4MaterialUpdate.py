"""Update one reviewed material while retaining a verified Ki-4 source/LOD/AO.

Run through Script_BlenderMcp after opening a copy of the verified baseline
author in the new source directory. All geometry and other image payloads
come from hash-verified baseline exports; no remeshing or UV/AO rebake occurs.
"""
import bpy,pathlib,os,json,struct,hashlib,shutil

scriptPath=pathlib.Path(__file__).resolve();repoRoot=scriptPath.parents[2]
sourceRoot=pathlib.Path(os.environ['KI4_SOURCE_ROOT']).resolve();assetRoot=pathlib.Path(os.environ['KI4_ASSET_ROOT']).resolve()
baselineSource=pathlib.Path(os.environ['KI4_MATERIAL_BASELINE_ROOT']).resolve();baselineAsset=pathlib.Path(os.environ['KI4_BASELINE_ASSET_ROOT']).resolve()
assert sourceRoot!=baselineSource and assetRoot!=baselineAsset,'Never overwrite the verified baseline'
assert pathlib.Path(bpy.data.filepath).resolve()==sourceRoot/'Scene_NakajimaKi4.blend'
assert bpy.context.scene.get('BlenderMcpTask')=='NakajimaKi4'
def Hash(data):return hashlib.sha256(data).hexdigest()
baselineAudit=json.loads((baselineSource/'Data_ExportAudit.json').read_text(encoding='utf8'))
assert Hash((sourceRoot/'Scene_NakajimaKi4.blend').read_bytes())==baselineAudit['source']['sha256'],'Open an unchanged copy of the verified baseline author first'
root=bpy.data.objects['NakajimaKi4'];assert root['version']==baselineAudit['version']
assert sum(o.type=='MESH' for o in root.children_recursive)==baselineAudit['high']['meshes']==902
profile=os.environ['KI4_FUSELAGE_SURFACE_PROFILE'];assert profile=='Photo02QuietRoughness'
recipe=json.loads((sourceRoot/'Textures/Data_TextureRecipes.json').read_text(encoding='utf8'))['Fuselage']
assert recipe['fuselageSurfaceProfile']==profile and recipe['roughnessContrast']['reviewedDecodedRgbSha256']=='64111b2ce75cca5803731a0e9dc5b2d7c5018ad0f3df72b70f50fbf8317a5726'
ormPath=sourceRoot/'Textures/Texture_Ki4FuselageOrm.png';ormBytes=ormPath.read_bytes()
assert Hash(ormBytes)==recipe['channels']['Orm']['sha256'] and ormBytes[:8]==b'\x89PNG\r\n\x1a\n'
assert struct.unpack_from('>II',ormBytes,16)==(4096,2048)

metadata={'version':os.environ['KI4_CANDIDATE_VERSION'],'fuselageSurfaceProfile':profile,'fuselageSurfaceScope':'Reviewed body roughness variance only; mean roughness, base/normal maps, metallic/AO and all geometry/UVs are retained. Inferred appearance, not a measured historical finish.','materialUpdateBaselineVersion':baselineAudit['version'],'materialUpdateScope':'Texture_Ki4FuselageOrm green channel only; verified baseline geometry, UVs, controls, LOD and geometry AO retained'}
def UpdatedGlb(path,expected):
    original=path.read_bytes();assert Hash(original)==expected['sha256']
    magic,version,length=struct.unpack_from('<III',original,0);assert magic==0x46546c67 and version==2 and length==len(original)
    size,kind=struct.unpack_from('<II',original,12);assert kind==0x4e4f534a
    g=json.loads(original[20:20+size]);binSize,binKind=struct.unpack_from('<II',original,20+size);assert binKind==0x004e4942
    binary=bytearray(original[28+size:28+size+binSize]);assert len(binary)==binSize
    i=next(i for i,image in enumerate(g['images']) if image.get('name')=='Texture_Ki4FuselageOrm');image=g['images'][i];assert image['mimeType']=='image/png'
    viewIndex=image['bufferView'];assert all(a.get('bufferView')!=viewIndex for a in g['accessors']),'Image storage must not alias a geometry accessor'
    view=g['bufferViews'][viewIndex];offset=view.get('byteOffset',0);capacity=view['byteLength']
    users=[]
    for mat in g['materials']:
        texture=mat.get('pbrMetallicRoughness',{}).get('metallicRoughnessTexture')
        if texture and g['textures'][texture['index']]['source']==i:users.append(mat['name'])
    assert users==['Material_FuselageAluminum'],'The reviewed map belongs only to the body material'
    if len(ormBytes)<=capacity:
        binary[offset:offset+capacity]=ormBytes+b'\0'*(capacity-len(ormBytes));view['byteLength']=len(ormBytes);policy='Replace within the original image payload; zero unused tail; geometry offsets unchanged'
    else:
        offset=len(binary);binary.extend(ormBytes);view['byteOffset']=offset;view['byteLength']=len(ormBytes);g['buffers'][0]['byteLength']=len(binary);policy='Append larger image payload; geometry offsets unchanged'
    extras=next(n['extras'] for n in g['nodes'] if n.get('name')=='NakajimaKi4');extras.update(metadata)
    encoded=json.dumps(g,ensure_ascii=False,separators=(',',':')).encode('utf8');encoded+=b' '*((-len(encoded))%4);binary+=b'\0'*((-len(binary))%4)
    result=struct.pack('<III',magic,2,28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary
    return result,{'baselineSha256':Hash(original),'sha256':Hash(result),'bytes':len(result),'policy':policy,'imageName':image['name'],'geometryAccessorCount':len(g['accessors']),'imageCount':len(g['images'])}

highBytes,highRecord=UpdatedGlb(baselineSource/'Exports/Model_NakajimaKi4High.glb',baselineAudit['high'])
gameBytes,gameRecord=UpdatedGlb(baselineAsset/'Model_NakajimaKi4.glb',baselineAudit['runtime'])
old=bpy.data.images.get('Texture_Ki4FuselageOrm.png')
if old is None:old=next(i for i in bpy.data.images if pathlib.Path(i.filepath).name=='Texture_Ki4FuselageOrm.png')
oldName=old.name;nodes=[];materials=[]
for mat in bpy.data.materials:
    if not mat.use_nodes:continue
    for node in mat.node_tree.nodes:
        if node.type=='TEX_IMAGE' and node.image==old:nodes.append(node);materials.append(mat.name)
assert set(materials)=={'Material_FuselageAluminum'} and nodes
new=bpy.data.images.load(str(ormPath),check_existing=False);new.colorspace_settings.name='Non-Color';new.pack()
assert Hash(bytes(new.packed_file.data))==Hash(ormBytes),'The author must pack the exact reviewed PNG'
for node in nodes:node.image=new
bpy.data.images.remove(old);new.name=oldName
for key,value in metadata.items():root[key]=value
for path in sorted(scriptPath.parent.glob('Script_NakajimaKi4*.py')):
    text=bpy.data.texts.get(path.name) or bpy.data.texts.new(path.name);text.clear();text.write(path.read_text(encoding='utf8'));text.use_fake_user=True
assert sum(bool(image.packed_file) for image in bpy.data.images)==37
bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot/'Scene_NakajimaKi4.blend'))
(sourceRoot/'Exports').mkdir(exist_ok=True);assetRoot.mkdir(exist_ok=True)
(sourceRoot/'Exports/Model_NakajimaKi4High.glb').write_bytes(highBytes);(assetRoot/'Model_NakajimaKi4.glb').write_bytes(gameBytes)
evidence=sourceRoot/'Evidence';evidence.mkdir(exist_ok=True)
for name in ['Data_GameDerivation.json','Data_GameNormalTransfer.json']:shutil.copy2(baselineSource/'Evidence'/name,evidence/name)
record={'state':'ActualMaterialOnlySourceAndExportUpdate','baselineVersion':baselineAudit['version'],'version':metadata['version'],'baselineSourceSha256':baselineAudit['source']['sha256'],'sourceSha256':Hash((sourceRoot/'Scene_NakajimaKi4.blend').read_bytes()),'high':highRecord,'runtime':gameRecord,'changedImage':'Texture_Ki4FuselageOrm','reviewedDecodedRgbSha256':recipe['roughnessContrast']['reviewedDecodedRgbSha256'],'geometryRebuilt':False,'uvsRepacked':False,'geometryAoRebaked':False,'inheritedGeometricDerivationBaseline':baselineAudit['high']['sha256'],'scope':'One reviewed material image and declared root metadata updated by this script. Both source author and actual exports retain the verified baseline geometry, UVs, LOD, controls, other images and geometry AO. Fresh reopen/runtime audit is still required.'}
(evidence/'Data_MaterialOnlyUpdate.json').write_text(json.dumps(record,indent=2),encoding='utf8')
print(json.dumps(record),flush=True)
