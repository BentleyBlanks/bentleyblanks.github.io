"""Rasterize object-space timber and patina into the actual Blender export UVs."""
import hashlib
import io
import json
import os
import struct
from pathlib import Path
import moderngl
from Script_HanYangTimberFrames import RepairTimberFrames, SmoothStockCrest
from Script_HanYangBandProfiles import FollowFrontBandOutline, ShapeBandProfile, ShapeStockEnd
from Script_HanYangRingFinish import CloseFittingShell, PoseRingNode, SmoothRingFrames, VertexDistance
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

archive = Path(os.environ.get('HANYANG_SOURCE_DIR', 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R'))
revision = archive / 'ExteriorFinish_20261122'
charts = json.loads((revision/'Data_Charts.json').read_text())
detailMaps = np.load(revision/'Data_DetailUv.npz', allow_pickle=False)
contactFields = np.load(revision/'Data_ContactVisibility.npz', allow_pickle=False)
timberHandling = np.load(revision/'Data_TimberHandling.npz', allow_pickle=False)
report = json.loads((revision/'Input_R2.json').read_text())
version = '173R-20261124R25'
context = moderngl.create_standalone_context()
vertexShader = '''#version 330
in vec2 uv; in vec3 pos; in vec3 normal; in vec4 tangent; in float access,handling;
out vec3 point,faceNormal; out vec4 basis; out float visibility,woodExposure;
void main(){gl_Position=vec4(uv*2.-1.,0.,1.);point=pos;faceNormal=normal;basis=tangent;visibility=access;woodExposure=handling;}
'''
fragmentShader=Path(__file__).with_name('Shader_HanYangMaterial.frag').read_text(encoding='utf8')
ordinaryProgram=context.program(vertex_shader=vertexShader,fragment_shader=fragmentShader)
bandProgram=context.program(vertex_shader=vertexShader,fragment_shader=fragmentShader.replace('#version 330','#version 330\n#define BAND_FINISH',1))
rearTrimProgram=context.program(vertex_shader=vertexShader,fragment_shader=fragmentShader.replace('#version 330','#version 330\n#define BAND_FINISH\n#define REAR_TRIM_FINISH',1))
stockProgram=context.program(vertex_shader=vertexShader,fragment_shader=fragmentShader.replace('#version 330','#version 330\n#define STOCK_CREST_WEAR',1))


def StockImpressionTexture():
    # Trace the two observable contours in the Lu stock photograph. Only the
    # outline drives the bake; wood fibres and the response to light are separate.
    outlines = [
        [(26,20),(55,16),(61,18),(59,26),(43,29),(39,34),(40,41),
         (45,46),(53,47),(64,44),(69,47),(72,58),(75,87),(73,96),
         (60,99),(43,101),(40,97),(40,90),(45,89),(50,91),(59,89),
         (62,85),(60,66),(57,60),(49,57),(34,60),(31,54)],
        [(78,15),(106,9),(112,10),(116,17),(124,89),(121,92),(94,98),
         (91,94),(90,84),(95,84),(108,82),(110,80),(107,53),(87,56),(83,51)],
        [(91,25),(104,22),(106,40),(94,44),(91,40)],
    ]
    scale=4
    mask=Image.new('L',(140*scale,120*scale))
    pen=ImageDraw.Draw(mask)
    for index,ring in enumerate(outlines):
        pen.polygon([(x*scale,y*scale) for x,y in ring], fill=0 if index==2 else 255)
    inside=np.asarray(mask)>0
    distance=(ndimage.distance_transform_edt(inside)-ndimage.distance_transform_edt(~inside))/scale
    field=np.clip(.5+distance/10.,0.,1.)
    texture=context.texture(mask.size,1,np.rint(field*255).astype('u1').tobytes())
    texture.filter=(moderngl.LINEAR,moderngl.LINEAR)
    texture.repeat_x=False
    texture.repeat_y=False
    return texture


impressionTexture=StockImpressionTexture()


def Read(path):
    raw = path.read_bytes(); size = struct.unpack_from('<I', raw, 12)[0]
    return json.loads(raw[20:20+size]), raw[28+size:]


def View(doc, binary, index):
    view = doc['bufferViews'][index]; start = view.get('byteOffset', 0)
    return binary[start:start+view['byteLength']]


def Array(doc, binary, index):
    acc = doc['accessors'][index]; dtype = {5126:'<f4',5125:'<u4',5123:'<u2'}[acc['componentType']]
    return np.frombuffer(View(doc,binary,acc['bufferView']),dtype,offset=acc.get('byteOffset',0)).reshape(acc['count'],-1)


doc, binary = Read(revision/'Input_R2.glb')
doc['samplers']=[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}]
blocks = [View(doc,binary,index) for index in range(len(doc['bufferViews']))]
partRecords = {item['part']:item for item in report['parts']}
imageRecords = {item['name']:item for item in report['texturePayloads']}
library=revision/'SurfaceScans'
scanSources=json.loads(Path(__file__).with_name('Data_HanYangScanSources.json').read_text())
maps={}
for kind,asset in [('Wood','black_walnut_veneer_02'),('Steel','metal_plate_02'),('OldWood','fine_grained_wood'),('OldSteel','rusty_metal_04')]:
    channels={}
    for source in [item for item in scanSources if item['asset']==asset]:
        content=(library/source['file']).read_bytes()
        assert hashlib.sha256(content).hexdigest()==source['sha256'],source['file']
        img=Image.open(io.BytesIO(content))
        channels[source['role']]=img.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    size=channels['Diffuse'].size
    assert all(image.size==size for image in channels.values())
    surface=Image.merge('RGB',(channels['Rough'].convert('L'),channels.get('Metal',Image.new('L',size)).convert('L'),Image.new('L',size)))
    maps[kind]=[]
    for image in [channels['Diffuse'].convert('RGB'),surface,channels['nor_gl'].convert('RGB')]:
        tex=context.texture(size,3,image.tobytes());tex.filter=(moderngl.LINEAR,moderngl.LINEAR)
        maps[kind].append(tex)

approved=revision/'Input_ExteriorGeometry.glb'
assert hashlib.sha256(approved.read_bytes()).hexdigest()=='e125056b12391f022f7e22969bb3acdf192295be711995b6ac43b958b31f47ec'
approvedDoc,approvedBinary=Read(approved)


def NewView(content, target=None):
    index = len(blocks); blocks.append(content)
    doc['bufferViews'].append({'buffer':0, **({'target':target} if target else {})})
    return index


frameRepairs={};ringPresentation={};closedFittings={};filmPayloads=[]
bandProfiles={}
bandNode=next(node for node in approvedDoc['nodes'] if node['name']=='FrontBand_ContinuousEnvelopeContact')
bandSurface=approvedDoc['meshes'][bandNode['mesh']]['primitives'][0]['attributes']['POSITION']
bandPoints=Array(approvedDoc,approvedBinary,bandSurface).astype(np.float64)
frontBandBounds=(bandPoints.min(axis=0),bandPoints.max(axis=0))
frontBandFloor=float(frontBandBounds[0][1])
rearNode=next(node for node in approvedDoc['nodes'] if node.get('name')=='RearBand_ControlledCrown')
rearPosition=approvedDoc['meshes'][rearNode['mesh']]['primitives'][0]['attributes']['POSITION']
rearPoints=ShapeBandProfile(rearNode['name'],{'POSITION':Array(approvedDoc,approvedBinary,rearPosition)})['POSITION'].astype(np.float64)
rearBandBounds=(rearPoints.min(axis=0),rearPoints.max(axis=0))
capNode=next(node for node in approvedDoc['nodes'] if node.get('name','').startswith('ButtCap_'))
capSurface=approvedDoc['meshes'][capNode['mesh']]['primitives'][0]['attributes']['POSITION']
capPoints=Array(approvedDoc,approvedBinary,capSurface).astype(np.float64)
capBounds=(capPoints.min(axis=0),capPoints.max(axis=0))
for node in doc['nodes']:
    if 'mesh' not in node: continue
    name = node['name']; prim = doc['meshes'][node['mesh']]['primitives'][0]; record=partRecords[name]
    detailChart=name+'_UV' in detailMaps
    program=stockProgram if name.startswith('MainWood_') else ordinaryProgram
    if name=='FrontBand_ContinuousEnvelopeContact':program=bandProgram
    if name in ('RearBand_ControlledCrown','RearBand_ExternalAttachmentBridge','RearBand_ExternalAttachmentLoop'):
        program=rearTrimProgram
    if program is stockProgram:
        impressionTexture.use(6)
        program['stockImpression']=6
    if name in charts or detailChart:
        update,meshBinary=(approvedDoc,approvedBinary) if name in charts else (doc,binary)
        incoming=update['meshes'][node['mesh']]['primitives'][0]
        incomingNode=next(item for item in update['nodes'] if item.get('name')==name)
        for key in ('rotation','translation','scale','matrix'):
            assert node.get(key)==incomingNode.get(key), (name,key)
        streams={semantic:Array(update,meshBinary,accId).copy() for semantic,accId in incoming['attributes'].items()}
        streams,faceIndices,repairs=RepairTimberFrames(name,streams,Array(update,meshBinary,incoming['indices']))
        streams=ShapeStockEnd(name,streams,capBounds)
        if name.startswith('MainWood_'):
            priorNormals=streams['NORMAL']
            streams=SmoothStockCrest(name,streams,faceIndices)
            crestNormalCount=int(np.sum(np.linalg.norm(streams['NORMAL']-priorNormals,axis=1)>1e-4))
            streams,faceIndices,endFrameRepairs=RepairTimberFrames(name,streams,faceIndices)
        if detailChart:
            sourceCorners=faceIndices.ravel()
            uv=detailMaps[name+'_UV']
            tangents=detailMaps[name+'_Tangent']
            assert len(sourceCorners)==len(uv)==len(tangents),name
            cornerKeys=np.column_stack((sourceCorners.astype('<u4'),uv.view('<u4'),tangents.view('<u4')))
            _,firstCorner,remap=np.unique(cornerKeys,axis=0,return_index=True,return_inverse=True)
            streams={key:array[sourceCorners[firstCorner]] for key,array in streams.items()}
            streams.update(TEXCOORD_0=uv[firstCorner],TANGENT=tangents[firstCorner])
            faceIndices=remap.astype(faceIndices.dtype).reshape(-1,1)
        if name in ('FrontBand_ContinuousEnvelopeContact','RearBand_ControlledCrown'):
            streams=ShapeBandProfile(name,streams)
            bandProfiles[name]=(streams['POSITION'],faceIndices)
        streams=SmoothRingFrames(name,streams,faceIndices)
        previousFaceCount=faceIndices.size//3
        streams,faceIndices=CloseFittingShell(name,streams,faceIndices,rearBandBounds)
        if faceIndices.size//3!=previousFaceCount:
            closedFittings[name]=(streams['POSITION'],faceIndices,previousFaceCount)
        if repairs:frameRepairs[name]=repairs
        for semantic in ['POSITION','NORMAL','TEXCOORD_0','TANGENT','indices']:
            isIndex = semantic=='indices'; oldIndex = prim['indices'] if isIndex else prim['attributes'][semantic]
            newIndex = incoming['indices'] if isIndex else incoming['attributes'][semantic]
            accessor = update['accessors'][newIndex].copy(); data = faceIndices if isIndex else streams[semantic]
            accessor['count']=len(data)
            if 'min' in accessor:accessor['min']=data.min(axis=0).tolist()
            if 'max' in accessor:accessor['max']=data.max(axis=0).tolist()
            accessor.pop('byteOffset',None); accessor['bufferView']=NewView(data.tobytes(),34963 if isIndex else 34962); doc['accessors'][oldIndex]=accessor
    def Attribute(semantic):
        acc=doc['accessors'][prim['attributes'][semantic]]
        return np.frombuffer(blocks[acc['bufferView']],'<f4').reshape(acc['count'],-1)
    indices=doc['accessors'][prim['indices']]; ind=blocks[indices['bufferView']]; record['gameTriangles']=indices['count']//3
    displayed=PoseRingNode(name,node,Attribute('POSITION'),rearBandBounds)
    if displayed:ringPresentation[name]=displayed
    if name=='FrontSideBoss_LowRoundedExterior':
        # Match the small visible silhouette underneath the band on the Lu specimen.
        points=Attribute('POSITION')
        centre=(points.min(axis=0)+points.max(axis=0))/2
        underside=frontBandFloor-float(np.ptp(points[:,0]))*.38
        bandWidth=float(np.ptp(bandProfiles['FrontBand_ContinuousEnvelopeContact'][0][:,2]))
        node['translation']=[-float(centre[1]),underside+float(centre[0]),.14*bandWidth]
        node['rotation']=[0.,0.,-2**-.5,2**-.5]
    wood=name in report['materialMatch']['woodParts']; size=4096 if name.startswith('MainWood') else record['rebake']['textureSize']
    resources=[]; bind=[]
    for attribute,semantic,width in [('uv','TEXCOORD_0',2),('pos','POSITION',3),('normal','NORMAL',3),('tangent','TANGENT',4)]:
        buf=context.buffer(Attribute(semantic).tobytes());resources.append(buf);bind.append((buf,str(width)+'f',attribute))
    vertexCount=len(Attribute('POSITION'))
    visibility=contactFields[name] if name in contactFields else np.ones(vertexCount,'<f4')
    assert visibility.shape==(vertexCount,) and np.all((visibility>=0)&(visibility<=1)),name
    accessBuffer=context.buffer(visibility.astype('<f4',copy=False).tobytes());resources.append(accessBuffer);bind.append((accessBuffer,'1f','access'))
    handling=timberHandling[name] if wood else visibility
    handlingBuffer=context.buffer(handling.astype('<f4',copy=False).tobytes());resources.append(handlingBuffer);bind.append((handlingBuffer,'1f','handling'))
    indexBuffer=context.buffer(ind);vao=context.vertex_array(program,bind,indexBuffer,index_element_size={5125:4,5123:2}[indices['componentType']]);resources.extend([vao,indexBuffer]);
    oiledStock=name.startswith('MainWood_')
    frontFilm=name.startswith('FrontWood_')
    targets=[context.texture((size,size),4) for role in range(4 if oiledStock or frontFilm else 3)]; frame=context.framebuffer(targets);frame.use();frame.clear();context.viewport=(0,0,size,size)
    program['wood']=wood;program['foreEnd']=name.startswith('FrontWood_');program['knob']=name=='HandleSphere';program['buttCap']=name.startswith('ButtCap_');program['worn']=1.0 if name.startswith(('Handle','RearSmall','MiddleSide','SideWood','FrontBand','RearBand')) else .16
    program['handguard']=name.startswith('UpperWood_');program['stock']=oiledStock
    program['longShell']=name.startswith('LongOuterSteel_')
    program['underTrim']=name=='FrontSideBoss_LowRoundedExterior'
    across=Attribute('POSITION')[:,0];program['acrossRange']=(float(across.min()),float(across.max()))
    program['trimFinish']=1 if name.endswith('ExternalAttachmentLoop') else 2 if name.endswith('ExternalAttachmentBridge') else 3 if name=='FrontBandSideStrip' else 0
    program['band']=name.startswith(('RearBand_Controlled','FrontBand_Continuous','ReceiverOuterCollar'))
    program['guard']=name.startswith('LowerPlateGuard');program['disk']=name.startswith(('SideWoodButton','MiddleSideDisk'))
    along=-Attribute('POSITION')[:,2];program['alongRange']=(float(along.min()),float(along.max()))
    height=Attribute('POSITION')[:,1];program['heightRange']=(float(height.min()),float(height.max()))
    family=next((index for index,prefixes in [(1,('RearBand_Controlled',)),(7,('FrontBand_Continuous',)),(2,('LongOuterSteel','ReceiverOuter','HY150_VisualFrontSleeve')),(3,('LowerPlateGuard',)),(4,('Handle','RearSmall','RearCocking','RearTopExternal')),(5,('SideWoodButton','MiddleSideDisk','FrontSideBoss'))] if name.startswith(prefixes)),6)
    program['steelFamily']=family
    program['finishGroup']=1 if name.startswith(('LongOuterSteel_','HY150_VisualFrontSleeve')) else 2 if name=='HandledCylinder' else 3 if name.startswith(('ReceiverOuterCollar','RearOuterCover_')) else 4 if name=='SideWoodButton' else 0
    program['seed']=(node['mesh']*.373)%13.
    for unit,(uniform,tex) in enumerate(zip(('pigmentMap','surfaceMap','detailMap'),maps['Wood' if wood else 'Steel'])):
        tex.use(unit);program[uniform]=unit
    for unit,(uniform,tex) in enumerate(zip(('wearColor','wearSurface','wearNormal'),maps['OldWood' if wood else 'OldSteel']),3):
        tex.use(unit);program[uniform]=unit
    vao.render()
    material=doc['materials'][prim['material']];pbr=material['pbrMetallicRoughness']; slots=[pbr['baseColorTexture'],pbr['metallicRoughnessTexture'],material['normalTexture']]
    if wood:material.setdefault('extensions',{})['KHR_materials_specular']={'specularFactor':.54 if name.startswith('FrontWood_') else .17 if name.startswith('UpperWood_') else .24}
    if name in contactFields:
        material['occlusionTexture']={**pbr['metallicRoughnessTexture'],'strength':.85}
    for channel,(role,slot) in enumerate(zip(['BaseColor','ORM','Normal'],slots)):
        pixels=np.frombuffer(frame.read(attachment=channel,components=4,alignment=1),np.uint8).reshape(size,size,4)
        if channel==0:
            mask=pixels[:,:,3]>0;coverage=float(mask.mean());assert coverage>.0001,(name,coverage)
            missing=ndimage.distance_transform_edt(~mask,return_distances=False,return_indices=True)
        rgb=np.ascontiguousarray(pixels[missing[0],missing[1],:3]); output=io.BytesIO();Image.fromarray(rgb).save(output,'WEBP',lossless=True,method=1)
        content=output.getvalue();assert np.array_equal(rgb,np.asarray(Image.open(io.BytesIO(content)).convert('RGB')))
        tex=doc['textures'][slot['index']];image=doc['images'][tex['extensions']['EXT_texture_webp']['source'] if 'extensions' in tex else tex['source']]
        tex.pop('source',None);tex['extensions']={'EXT_texture_webp':{'source':doc['images'].index(image)}};tex['sampler']=0
        image.update(bufferView=NewView(content),mimeType='image/webp'); imageRecords[image['name']].update(sha256=hashlib.sha256(content).hexdigest(),sourceSha256=hashlib.sha256(rgb.tobytes()).hexdigest(),mimeType='image/webp',islandCoverage=round(coverage,6))
    if oiledStock or frontFilm:
        plane=np.frombuffer(frame.read(attachment=3,components=1,alignment=1),np.uint8).reshape(size,size)
        field=Image.fromarray(plane[missing[0],missing[1]]).resize((1024,1024),Image.Resampling.BOX)
        image=Image.merge('RGB',(field,Image.new('L',field.size),Image.new('L',field.size)))
        output=io.BytesIO();image.save(output,'WEBP',lossless=True,method=4);content=output.getvalue()
        assert Image.open(io.BytesIO(content)).convert('RGB').tobytes()==image.tobytes()
        filmPayloads.append((not oiledStock,material,name+'_OilFilm',content,hashlib.sha256(image.tobytes()).hexdigest(),coverage))
    if frontFilm:
        # The finished pattern is attached to its existing UVs as the covered end bends.
        shaped=FollowFrontBandOutline({key:Attribute(key) for key in ('POSITION','NORMAL','TANGENT')},frontBandBounds)
        for key,values in shaped.items():
            accessor=doc['accessors'][prim['attributes'][key]]
            blocks[accessor['bufferView']]=values.tobytes()
            if 'min' in accessor:accessor['min']=values.min(axis=0).tolist()
            if 'max' in accessor:accessor['max']=values.max(axis=0).tolist()
    if name in charts or detailChart:
        points=Attribute('POSITION'); idx=np.frombuffer(ind,'<u4' if indices['componentType']==5125 else '<u2').reshape(-1,3);tr=points[idx]; surface=np.linalg.norm(np.cross(tr[:,1]-tr[:,0],tr[:,2]-tr[:,0]),axis=1).sum()/2
        record['rebake'].update(pxPerMm=round(float(size*np.sqrt(coverage/surface)/1000),2))
    record['rebake'].update(textureSize=size, tiledUv=False,tileMeters=None,uvCoverage=round(coverage,6))
    for item in [frame,*targets,*resources]:item.release()
    print(name, record['gameTriangles'], round(coverage,3),flush=True)

for frontFilm,material,imageName,content,rawDigest,coverage in sorted(filmPayloads,key=lambda payload:payload[0]):
    imageIndex=len(doc['images']);textureIndex=len(doc['textures'])
    doc['images'].append({'name':imageName,'mimeType':'image/webp','bufferView':NewView(content)})
    doc['textures'].append({'sampler':0,'extensions':{'EXT_texture_webp':{'source':imageIndex}}})
    report['texturePayloads'].append({'name':imageName,'mimeType':'image/webp','sha256':hashlib.sha256(content).hexdigest(),'sourceSha256':rawDigest,'islandCoverage':round(coverage,6),'rebake':True})
    material['extensions']['KHR_materials_clearcoat']={'clearcoatFactor':.72 if frontFilm else .34,'clearcoatTexture':{'index':textureIndex},'clearcoatRoughnessFactor':.245 if frontFilm else .18}
used=sorted({a['bufferView'] for a in doc['accessors']}|{i['bufferView'] for i in doc['images']});lookup={};views=[];payload=bytearray()
for index in used:
    lookup[index]=len(views);data=blocks[index];views.append(dict(doc['bufferViews'][index],byteOffset=len(payload),byteLength=len(data)));payload.extend(data);payload.extend(bytes((-len(payload))%4))
for item in [*doc['accessors'],*doc['images']]:item['bufferView']=lookup[item['bufferView']]
doc['extensionsUsed']=sorted(set(doc.get('extensionsUsed',[]))|{'KHR_materials_specular','KHR_materials_clearcoat'})
doc['bufferViews']=views;doc['buffers'][0]['byteLength']=len(payload); report['triangles']=sum(row['gameTriangles'] for row in partRecords.values());assert report['triangles']<=80000
report['materialMatch'].update(version=version,geometry='Exterior finish, Blender edge and UV pass',scope='Object-space baked, non-repeating wood and steel; visible exterior only.')
report['materialMatch']['previousSourceAssets']=report['materialMatch']['sourceAssets']
report['materialMatch']['sourceAssets']=scanSources
report['exteriorFinish']={'version':version,'baseline':report['gameSha256'],'newCharts':sorted(set(charts)|{key.removesuffix('_UV') for key in detailMaps.files if key.endswith('_UV')}),'museumObject':'Te Papa 58119','museumImages':[131447,131366,131367,131438,131440],'triangleLimit':80000}
audit=json.loads((revision/'Data_ExteriorSurface.json').read_text())
original=archive/'DotsDelivery/HanYang_173R_Runtime_GLB_PBR/Hanyang173R_final.glb'
assert hashlib.sha256(original.read_bytes()).hexdigest()=='3f380317c1930c7c141f6f0c0abb415a336354e25b78f24cc7bb9aa8c650a38c'
for sourceName,file in [('Dots',original),('R2',revision/'Input_R2.glb')]:
    surfaceDoc,surfaceBinary=Read(file)
    reshaped={name:(points,faces) for name,(points,faces,_) in closedFittings.items()}
    for name,(points,faces) in (reshaped|bandProfiles).items():
        sourceNode=next(node for node in surfaceDoc['nodes'] if node.get('name')==name)
        primitive=surfaceDoc['meshes'][sourceNode['mesh']]['primitives'][0]
        sourcePoints=Array(surfaceDoc,surfaceBinary,primitive['attributes']['POSITION'])
        sourceFaces=Array(surfaceDoc,surfaceBinary,primitive['indices'])
        audit[name]['to'+sourceName+'M']=VertexDistance(points,sourcePoints,sourceFaces)
        audit[name]['from'+sourceName+'M']=VertexDistance(sourcePoints,points,faces)
assert set(audit)==set(partRecords)
for name,distances in audit.items():
    partRecords[name].update(gameToSourceMaxM=distances['toDotsM'],sourceToGameMaxM=distances['fromDotsM'])
report['exteriorFinish'].update(surfaceComparisons=audit,deviationScope='Bidirectional maximum vertex-to-mesh distances against Dots and R2 in part-local metres. No museum geometry measurement is implied. surfaceRepair and mechanismRepair are historical baselines.')
report['textureFill']='Closest occupied atlas texel, independently per part, using the rasterized UV mask; lossless WebP. sourceSha256 hashes the final decoded RGB.'
report['rebake']='R25: tapered rear-band relief, patinated heel and solid display trim with a hanging worn loop. Portable calibrated base colour and prior wood finish retained.'
report['exteriorFinish']['ringPresentation']=ringPresentation
report['exteriorFinish']['frontTrimPresentation']='Underside silhouette, rigid display pose estimated from the Lu profile photograph.'
report['exteriorFinish']['closedFittings']={name:{'before':before,'after':faces.size//3} for name,(_,faces,before) in closedFittings.items()}
report['exteriorFinish']['timberFrameRepairs']=frameRepairs
report['exteriorFinish']['smoothedCrestNormals']=crestNormalCount
report['exteriorFinish']['endFrameRepairs']=endFrameRepairs
report['runtimeNormalPacking']={'runtimeBits':8,'images':44,'source':'OpenGL material normals reoriented into the exported tangent frame, independent of pigment.'}
report['runtimeLosslessPacking']='Per-image WebP lossless; round-trip RGB equality checked.'
report['exteriorFinish']['contactVisibility']={'parts':sorted(contactFields.files),'channel':'linear ORM red','strength':.85,'sampling':'32 cosine-weighted directions per fixed exterior vertex; inter-part only, short range with distance falloff.'}
doc['asset']['extras'].update(gameTriangles=report['triangles'],materialMatch=version,rebake=report['rebake'],calibratedBaseColor=True);doc['extensionsRequired']=['EXT_texture_webp']
header=json.dumps(doc,separators=(',',':')).encode();header+=b' '*((-len(header))%4);out=struct.pack('<4sII',b'glTF',2,28+len(header)+len(payload))+struct.pack('<I4s',len(header),b'JSON')+header+struct.pack('<I4s',len(payload),b'BIN\0')+payload
report['gameSha256']=hashlib.sha256(out).hexdigest();(revision/'Model_HanYang173R.glb').write_bytes(out);(revision/'Data_GameGeometry.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print('READY',report['triangles'],len(out),report['gameSha256'])
