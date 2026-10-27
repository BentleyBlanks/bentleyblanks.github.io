"""Bind exact authored image pixels and record the checked release identities.

Ordinary Python/Pillow. Geometry/accessor payloads are preserved byte-for-byte
when exporter channel packing is replaced with the matching baked PNG payload.
"""
import pathlib,json,struct,hashlib,io,os,sys
import numpy as np
from PIL import Image,ImageChops

repo=pathlib.Path(__file__).resolve().parents[2]
asset=pathlib.Path(os.environ.get('KI4_RELEASE_ASSET_ROOT',str(repo/'tmp/NakajimaKi4/ReferenceV48_GameRelease')))
source=pathlib.Path(os.environ.get('KI4_RELEASE_SOURCE_ROOT','C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/ReferenceV48_GameRelease'))
Hash=lambda data:hashlib.sha256(data).hexdigest()


def Read(path):
    data=path.read_bytes();length,kind=struct.unpack_from('<II',data,12)
    assert kind==0x4e4f534a
    g=json.loads(data[20:20+length]);offset=20+length
    size,kind=struct.unpack_from('<II',data,offset);assert kind==0x004e4942
    return data,g,data[offset+8:offset+8+size]


def Write(path,g,binary):
    g['buffers'][0]['byteLength']=len(binary)
    text=json.dumps(g,separators=(',',':'),ensure_ascii=False).encode('utf8');text+=b' '*((-len(text))%4)
    binary+=b'\0'*((-len(binary))%4)
    data=struct.pack('<III',0x46546c67,2,28+len(text)+len(binary))+struct.pack('<II',len(text),0x4e4f534a)+text+struct.pack('<II',len(binary),0x004e4942)+binary
    path.write_bytes(data)


def ImagePath(name):
    if name.endswith('.png'):name=name[:-4]
    path=source/'Textures'/(name+'.png')
    assert path.exists(),('Every exported image must have an exact authored input',name)
    return path


def ExpectedImage(name):
    # glTF packs same-sized UV1 AO and UV0 MR inputs into one RGB image;
    # each texture binding still uses its own declared UV set/channel.
    names=name.split('-')
    if len(names)==2 and any('GeometryAo' in value for value in names):
        aoName=next(value for value in names if 'GeometryAo' in value)
        mrName=next(value for value in names if value!=aoName)
        assert mrName.endswith('Orm')
        ao=Image.open(ImagePath(aoName)).convert('RGB');mr=Image.open(ImagePath(mrName)).convert('RGB')
        assert ao.size==mr.size
        image=Image.merge('RGB',(ao.getchannel('R'),mr.getchannel('G'),mr.getchannel('B')))
        stream=io.BytesIO();image.save(stream,format='PNG')
        return stream.getvalue(),[str(ImagePath(aoName)),str(ImagePath(mrName))]
    path=ImagePath(name)
    return path.read_bytes(),[str(path)]


def BindImages(path):
    original,g,binary=Read(path)
    replacements={};rows=[]
    imageViews={image['bufferView'] for image in g['images']}
    geometry={i:Hash(binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]) for i,v in enumerate(g['bufferViews']) if i not in imageViews}
    for image in g['images']:
        view=g['bufferViews'][image['bufferView']];payload=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
        expected,inputs=ExpectedImage(image['name'])
        before=Image.open(io.BytesIO(payload));baked=Image.open(io.BytesIO(expected))
        assert before.size==baked.size
        changed=ImageChops.difference(before.convert('RGBA'),baked.convert('RGBA')).getbbox() is not None
        if changed:replacements[image['bufferView']]=expected;image['mimeType']='image/png'
        rows.append({'name':image['name'],'size':list(baked.size),'exporterPixelsRestored':changed,'expectedPngSha256':Hash(expected),'sourceInputs':inputs})
    if replacements:
        archive=source/'Exports/RawExporter';archive.mkdir(exist_ok=True)
        rawPath=archive/(path.stem+'_BeforeImageBinding.glb')
        if not rawPath.exists():rawPath.write_bytes(original)
        chunks=[];offset=0
        for i,view in enumerate(g['bufferViews']):
            assert view.get('buffer',0)==0
            payload=replacements.get(i,binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])
            pad=(-offset)%4
            if pad:chunks.append(b'\0'*pad);offset+=pad
            view['byteOffset']=offset;view['byteLength']=len(payload);chunks.append(payload);offset+=len(payload)
        Write(path,g,b''.join(chunks))
    final,after,newBinary=Read(path)
    assert {i:Hash(newBinary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]) for i,v in enumerate(after['bufferViews']) if i not in imageViews}==geometry
    return {'path':str(path),'beforeSha256':Hash(original),'afterSha256':Hash(final),'geometryViewPayloadsUnchanged':True,'images':rows}


def Info(path):
    data,g,binary=Read(path)
    return {'path':str(path),'sha256':Hash(data),'bytes':len(data),'triangles':sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives']),'meshes':len(g['meshes']),'images':len(g.get('images',[]))}


def FinalizeEncoding(path,optimizeImages):
    original,g,raw=Read(path);binary=bytearray(raw);processed={};rows=[]
    def Attribute(index,components):
        accessor=g['accessors'][index];view=g['bufferViews'][accessor['bufferView']]
        assert accessor['componentType']==5126
        offset=view.get('byteOffset',0)+accessor.get('byteOffset',0)
        return np.ndarray(shape=(accessor['count'],components),dtype='<f4',buffer=binary,offset=offset,strides=(view.get('byteStride',components*4),4))
    for mesh in g['meshes']:
        for primitive in mesh['primitives']:
            fields=primitive['attributes']
            if 'TANGENT' not in fields:continue
            tangentId=fields['TANGENT'];normalId=fields['NORMAL']
            if tangentId in processed:assert processed[tangentId]==normalId;continue
            processed[tangentId]=normalId
            normals=Attribute(normalId,3).astype(np.float64);normals/=np.linalg.norm(normals,axis=1)[:,None]
            target=Attribute(tangentId,4);tangents=target[:,:3].astype(np.float64)
            beforeDot=np.abs(np.sum(normals*tangents,axis=1))
            tangents-=normals*np.sum(normals*tangents,axis=1)[:,None]
            lengths=np.linalg.norm(tangents,axis=1);bad=lengths<1e-10
            for i in np.flatnonzero(bad):
                axis=np.eye(3)[np.argmin(np.abs(normals[i]))];tangents[i]=np.cross(normals[i],axis)
            tangents/=np.linalg.norm(tangents,axis=1)[:,None]
            assert np.all(np.abs(np.abs(target[:,3])-1)<1e-6)
            target[:,:3]=tangents.astype(np.float32)
            rows.append({'accessor':tangentId,'corners':len(tangents),'maximumNormalDotBefore':float(beforeDot.max()),
                         'maximumNormalDotAfter':float(np.abs(np.sum(normals*target[:,:3],axis=1)).max()),'degenerateUvFallbackCorners':int(bad.sum())})
    replacements={};images=[]
    if optimizeImages:
        for image in g['images']:
            view=g['bufferViews'][image['bufferView']];data=bytes(binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])
            if image['mimeType']!='image/png' or data[24]!=16:continue
            pic=Image.open(io.BytesIO(data));stream=io.BytesIO();pic.save(stream,format='PNG',optimize=True,compress_level=9);encoded=stream.getvalue()
            assert ImageChops.difference(pic.convert('RGBA'),Image.open(io.BytesIO(encoded)).convert('RGBA')).getbbox() is None
            if len(encoded)<len(data):replacements[image['bufferView']]=encoded
            images.append({'name':image['name'],'beforeBytes':len(data),'afterBytes':min(len(data),len(encoded)),
                           'decodedRgba8Unchanged':True,'scope':'Exact browser-visible decoded PNG pixels and dimensions retained; PNG16 AO storage encoded as PNG8.'})
    chunks=[];offset=0
    for i,view in enumerate(g['bufferViews']):
        data=replacements.get(i,bytes(binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]))
        pad=(-offset)%4
        if pad:chunks.append(b'\0'*pad);offset+=pad
        view['byteOffset']=offset;view['byteLength']=len(data);chunks.append(data);offset+=len(data)
    Write(path,g,b''.join(chunks));final,after,newBinary=Read(path)
    # All non-tangent attributes and indices must retain exact payload bytes.
    originalG=ReadDataJson(original);originalBin=raw
    for mesh in originalG['meshes']:
        for primitive in mesh['primitives']:
            for key,index in list(primitive['attributes'].items())+[('INDICES',primitive['indices'])]:
                if key=='TANGENT':continue
                accessor=originalG['accessors'][index];view=originalG['bufferViews'][accessor['bufferView']]
                newView=after['bufferViews'][accessor['bufferView']]
                assert originalBin[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]==newBinary[newView.get('byteOffset',0):newView.get('byteOffset',0)+newView['byteLength']]
    return {'path':str(path),'beforeSha256':Hash(original),'afterSha256':Hash(final),'tangents':rows,'images':images,'nonTangentGeometryPayloadsUnchanged':True,'bytes':len(final)}


def ReadDataJson(data):
    return json.loads(data[20:20+struct.unpack_from('<I',data,12)[0]])


if '--images' in sys.argv:
    rows=[BindImages(source/'Exports/Model_NakajimaKi4High.glb'),BindImages(asset/'Model_NakajimaKi4.glb')]
    game=json.loads((asset/'Evidence/Data_ReleaseGame.json').read_text(encoding='utf8'))
    game['runtimeSha256']=rows[1]['afterSha256']
    high=json.loads((asset/'Evidence/Data_ReleaseHigh.json').read_text(encoding='utf8'))
    high['highGlbSha256']=rows[0]['afterSha256']
    for folder in [asset/'Evidence',source/'Evidence']:
        (folder/'Data_ReleaseGame.json').write_text(json.dumps(game,indent=2),encoding='utf8')
        (folder/'Data_ReleaseHigh.json').write_text(json.dumps(high,indent=2),encoding='utf8')
        (folder/'Data_ReleaseImageBinding.json').write_text(json.dumps(rows,indent=2),encoding='utf8')
    print(json.dumps([{'path':row['path'],'restoredImages':sum(i['exporterPixelsRestored'] for i in row['images']),'sha256':row['afterSha256']} for row in rows]))
elif '--finalize' in sys.argv:
    rows=[FinalizeEncoding(source/'Exports/Model_NakajimaKi4High.glb',False),FinalizeEncoding(asset/'Model_NakajimaKi4.glb',True)]
    assert rows[1]['bytes']<100*1024*1024,'GitHub single-file ceiling'
    game=json.loads((asset/'Evidence/Data_ReleaseGame.json').read_text(encoding='utf8'));game['runtimeSha256']=rows[1]['afterSha256']
    high=json.loads((asset/'Evidence/Data_ReleaseHigh.json').read_text(encoding='utf8'));high['highGlbSha256']=rows[0]['afterSha256']
    for folder in [asset/'Evidence',source/'Evidence']:
        (folder/'Data_ReleaseGame.json').write_text(json.dumps(game,indent=2),encoding='utf8')
        (folder/'Data_ReleaseHigh.json').write_text(json.dumps(high,indent=2),encoding='utf8')
        (folder/'Data_ReleaseEncoding.json').write_text(json.dumps(rows,indent=2),encoding='utf8')
    print(json.dumps([{'sha256':row['afterSha256'],'bytes':row['bytes'],'tangentAccessors':len(row['tangents']),'pngStorageOptimized':len(row['images'])} for row in rows]))
else:
    motion=json.loads((asset/'Evidence/Data_ReleaseReopenAndMotion.json').read_text(encoding='utf8'))
    game=json.loads((asset/'Evidence/Data_ReleaseGame.json').read_text(encoding='utf8'))
    runtime=Info(asset/'Model_NakajimaKi4.glb');high=Info(source/'Exports/Model_NakajimaKi4High.glb')
    assert runtime['sha256']==motion['runtimeSha256']==game['runtimeSha256']
    assert motion['sourceSha256']==Hash((source/'Scene_NakajimaKi4.blend').read_bytes())
    assert motion['gameSourceSha256']==Hash(pathlib.Path(motion['gameSourcePath']).read_bytes())
    assert motion['motionSamples']==80 and motion['trueMotionTriangleIntersections']==0
    assert motion['runtimeServiceAudit']['runtimeObstructions']==0
    assert runtime['triangles']<=180000
    assert motion['gameSourceReopened']['triangles']==runtime['triangles']
    ao=json.loads((asset/'Evidence/Data_AoFieldAgreement.json').read_text(encoding='utf8'))
    assert ao['ok'] and ao['maxAoDifference']<=1/255 and ao['samples']==35
    assert ao['runtimeSha256']==runtime['sha256'] and ao['highSha256']==high['sha256']
    _,g,binary=Read(asset/'Model_NakajimaKi4.glb');images=[]
    for image in g['images']:
        view=g['bufferViews'][image['bufferView']];payload=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
        pic=Image.open(io.BytesIO(payload));expectedBytes,inputs=ExpectedImage(image['name']);expected=Image.open(io.BytesIO(expectedBytes))
        assert pic.size==expected.size and ImageChops.difference(pic.convert('RGBA'),expected.convert('RGBA')).getbbox() is None
        images.append({'name':image['name'],'size':list(pic.size),'sha256':Hash(payload),'decodedRgbSha256':Hash(pic.convert('RGB').tobytes()),'bakedSha256':Hash(expectedBytes),'sourceInputs':inputs,'allPixelsMatchBake':True})
    row={'releaseProfile':'ReferenceV48GameRelease','version':'20261028ReferenceV48GameRelease','runtime':runtime,'high':high,
         'source':{'path':str(source/'Scene_NakajimaKi4.blend'),'sha256':motion['sourceSha256'],'packedImages':len(motion['sourcePackedImages']),'reopened':True},
         'gameSource':motion['gameSourceReopened'],'dimensionsGltfXyzM':[motion['dimensionsBlenderXyzM'][0],motion['dimensionsBlenderXyzM'][2],motion['dimensionsBlenderXyzM'][1]],
         'sourceServiceAudit':motion['sourceServiceAudit'],'runtimeServiceAudit':motion['runtimeServiceAudit'],
         'rigidMotionAudit':{'actualGlbReimport':True,'totalSamples':80,'trueTriangleIntersections':0,'maxRadialDriftM':max(r['radialDriftM'] for r in motion['singlePivotSamples'])},
         'cowlEngineClearance':motion['cowlEngineClearance'],'aoFieldAgreement':ao,'pbrImages':images,
         'actualHighToGameNormalField':motion['actualHighToGameNormalField'],
         'savedLowToActualRuntimeNormalField':motion['savedLowToActualRuntimeNormalField'],
         'normalInterpolationDiagnostic':motion['highLowCapAndSurfaceInterpolationDiagnostic'],
         'gameDerivation':game['parts'],'scripts':{p.name:Hash(p.read_text(encoding='utf8').encode('utf8')) for p in pathlib.Path(__file__).parent.glob('Script_NakajimaKi4*.py')},
         'referenceFidelityPassed':False,'originalPhotoFitFailuresRetained':True,
         'deliveryScope':'User requested current iteration configured and submitted after major technical checks; exact photograph reconstruction remains unapproved.'}
    (asset/'Data_ExportAudit.json').write_text(json.dumps(row,indent=2,ensure_ascii=False),encoding='utf8')
    print(json.dumps({'runtime':runtime,'sourceSha256':motion['sourceSha256'],'gameSourceReopened':True,'pbrImages':len(images),'motionSamples':80}))
