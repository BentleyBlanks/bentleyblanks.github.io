
"""Share the calibrated HanYang materials without changing authored geometry."""
from collections import defaultdict
from copy import deepcopy
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import struct
import subprocess
import sys

import numpy as np
from PIL import Image


GUTTER = 32
BLOCK = 4
LIMIT = 4096


def ReadGlb(path):
    raw = path.read_bytes()
    magic, version, size, length = struct.unpack_from('<4sIII', raw)
    assert magic == b'glTF' and version == 2 and size == len(raw)
    return json.loads(raw[20:20+length]), memoryview(raw)[28+length:]


def Roles():
    dataFile = (Path(__file__).resolve().parents[1]/'Data_HanYang173R.mjs').as_uri()
    script = """const d=(await import(process.argv[1])).HANYANG_173R;
console.log(JSON.stringify({wood:d.wood, stockReturn:d.stockReturn, boltBody:d.bolt,
    cockingPiece:d.cocking,frontSight:d.frontSight,rearSight:d.rearSight,trigger:[d.trigger]}));"""
    data = json.loads(subprocess.check_output(['node','--input-type=module','-e',script,dataFile], text=True))
    wood = set(data.pop('wood'))
    stockReturn = data.pop('stockReturn')
    roles = {part:role for role,parts in data.items() for part in parts}
    roles[stockReturn] = 'body'
    return wood, roles


def Slots(material):
    pbr = material['pbrMetallicRoughness']
    result = [pbr['baseColorTexture'], pbr['metallicRoughnessTexture'], material['normalTexture']]
    if 'occlusionTexture' in material:
        result.append(material['occlusionTexture'])
    return result


def AllSlots(material):
    result = Slots(material)
    coat = material.get('extensions',{}).get('KHR_materials_clearcoat',{})
    if 'clearcoatTexture' in coat:
        result.append(coat['clearcoatTexture'])
    return result


def TileBounds(uv,size):
    begin = np.floor((uv.min(axis=0)*size-GUTTER)/BLOCK).astype(int)*BLOCK
    end = np.ceil((uv.max(axis=0)*size+GUTTER)/BLOCK).astype(int)*BLOCK
    return (*map(int,begin),*map(int,end-begin))


def PageSize(page):
    return (max(x+p['crop'][2] for p,x,_ in page),
            max(y+p['crop'][3] for p,_,y in page))


def PlacePage(page,part):
    w,h = part['crop'][2:]
    width,height = PageSize(page)
    xs = {0, *(x+p['crop'][2] for p,x,_ in page)}
    ys = {0, *(y+p['crop'][3] for p,_,y in page)}
    for x in xs:
        for y in ys:
            if x+w>LIMIT or y+h>LIMIT:
                continue
            if any(x<ox+obj['crop'][2] and x+w>ox and y<oy+obj['crop'][3] and y+h>oy
                   for obj,ox,oy in page):
                continue
            newWidth,newHeight = max(width,x+w),max(height,y+h)
            yield newWidth*newHeight-width*height,max(newWidth,newHeight),y,x


def PackPages(parts):
    """Try tall, wide and area-first orders without rotating texture charts."""
    candidates=[]
    for key in (lambda wh:wh[0]*wh[1],lambda wh:(wh[1],wh[0]),lambda wh:(wh[0],wh[1])):
        pages=[]
        for part in sorted(parts,key=lambda obj:key(obj['crop'][2:]),reverse=True):
            w,h=part['crop'][2:]
            assert 0<w<=LIMIT and 0<h<=LIMIT
            fit=min(((delta,side,y,x,index) for index,page in enumerate(pages)
                     for delta,side,y,x in PlacePage(page,part)),default=None)
            if fit is None:
                pages.append([(part,0,0)])
            else:
                _,_,y,x,index=fit
                pages[index].append((part,x,y))
        candidates.append(pages)
    return min(candidates,key=lambda pages:(len(pages),sum(w*h for w,h in map(PageSize,pages))))


def BuildRuntime(inputDir, outputDir):
    doc, binary = ReadGlb(inputDir/'Model_HanYang173R.glb')
    report = json.loads((inputDir/'Data_GameGeometry.json').read_text(encoding='utf8'))
    assert sha256((inputDir/'Model_HanYang173R.glb').read_bytes()).hexdigest()==report['gameSha256']
    BatchRuntime(doc,binary,report,outputDir)


def BatchRuntime(doc,binary,report,outputDir):
    assert len(doc['buffers'])==1 and doc['asset']['extras']['calibratedBaseColor']
    wood,roles = Roles()
    previous=report.get('batching',{})
    previousTiles=previous.get('tiles',{})
    originalImages,originalTextures = doc['images'],doc['textures']
    originalMaterials = doc['materials']
    originalRecords={row['name']:row for row in report['texturePayloads']}
    views=doc['bufferViews']
    blocks=[binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']] for v in views]
    parts,groups = [],defaultdict(list)
    originalPartCount = len(report['parts'])
    surfaceRecords={part['part']:part['rebake'] for part in report['parts']}
    sizes={name:row['textureSize'] for name,row in surfaceRecords.items()}

    for node in doc['nodes']:
        if 'mesh' not in node:
            continue
        name=node['name']
        primitive,=doc['meshes'][node['mesh']]['primitives']
        source=originalMaterials[primitive['material']]
        role=roles.get(name,'body')
        node.setdefault('extras',{})['hanYangRole']=role
        entry={'name':name,'primitive':primitive,'source':source,'role':role}
        parts.append(entry)
        if name in wood or role=='trigger':
            continue
        slots = Slots(source)
        sampler=originalTextures[slots[0]['index']]['sampler']
        assert all(set(slot)<= {'index','scale','strength','texCoord'} and not slot.get('texCoord') for slot in slots)
        assert all(originalTextures[slot['index']]['sampler']==sampler for slot in slots)
        signature=deepcopy(source)
        signature.pop('name',None)
        for slot in Slots(signature):
            slot.pop('index')
        uv=doc['accessors'][primitive['attributes']['TEXCOORD_0']]
        assert uv['type']=='VEC2' and uv['componentType']==5126
        assert not uv.get('byteOffset') and not views[uv['bufferView']].get('byteStride')
        values=np.frombuffer(blocks[uv['bufferView']],dtype='<f4').reshape(-1,2)
        oldTile=previousTiles.get(name)
        crop=tuple(oldTile['crop']) if oldTile else TileBounds(values,sizes[name])
        entry.update(accessor=uv,uv=values,size=sizes[name],crop=crop,oldTile=oldTile)
        groups[(role,sampler,json.dumps(signature,sort_keys=True))].append(entry)

    materials,images,textures,records=[],[],[],[]
    tiles={}
    shared=set()
    existingTextures={}

    def NewView(content,target=None):
        index=len(views)
        views.append({'buffer':0,**({'target':target} if target else {})})
        blocks.append(content)
        return index

    def KeepTexture(index):
        if index not in existingTextures:
            texture=deepcopy(originalTextures[index])
            src=texture['extensions']['EXT_texture_webp']['source']
            texture['extensions']['EXT_texture_webp']['source']=len(images)
            images.append(deepcopy(originalImages[src]))
            records.append(originalRecords[originalImages[src]['name']])
            existingTextures[index]=len(textures)
            textures.append(texture)
        return existingTextures[index]

    def NewAtlas(label,role,canvas,sampler,coverage):
        name=f'{label}_{role}'
        output=BytesIO()
        canvas.save(output,'WEBP',lossless=True,method=4)
        content=output.getvalue()
        assert Image.open(BytesIO(content)).convert('RGB').tobytes()==canvas.tobytes(), name
        index=len(textures)
        textures.append({'sampler':sampler,'extensions':{'EXT_texture_webp':{'source':len(images)}}})
        images.append({'name':name,'mimeType':'image/webp','bufferView':NewView(content)})
        records.append({'name':name,'sha256':sha256(content).hexdigest(),
                        'sourceSha256':sha256(canvas.tobytes()).hexdigest(),
                        'mimeType':'image/webp','islandCoverage':coverage,'rebake':True})
        return index

    for (role,sampler,_), compatible in groups.items():
        for page in PackPages(compatible):
            if len(page)<2 and not page[0][0]['oldTile']:
                continue
            width,height=PageSize(page)
            coverage = round(sum(surfaceRecords[part['name']]['uvCoverage']*part['size']**2
                                 for part,_,_ in page)/(width*height),6)
            label=f'HanYang173R_{role}_Atlas{len(materials)+1}'
            material=deepcopy(page[0][0]['source'])
            material['name']=label
            for channel,(kind,neutral) in enumerate([('BaseColor',(0,0,0)),('ORM',(255,128,0)),('Normal',(128,128,255))]):
                canvas=Image.new('RGB',(width,height),neutral)
                for part,x,y in page:
                    slot=Slots(part['source'])[channel]
                    image=originalImages[originalTextures[slot['index']]['extensions']['EXT_texture_webp']['source']]
                    pixels=np.asarray(Image.open(BytesIO(bytes(blocks[image['bufferView']]))).convert('RGB'))
                    if part['oldTile']:
                        left,top,w,h=part['oldTile']['placement']
                        sample=pixels[top:top+h,left:left+w]
                    else:
                        n=part['size']
                        assert pixels.shape[:2]==(n,n)
                        left,top,w,h=part['crop']
                        rows=np.clip(np.arange(top,top+h),0,n-1)
                        columns=np.clip(np.arange(left,left+w),0,n-1)
                        sample=pixels[rows[:,None],columns[None,:]]
                    canvas.paste(Image.fromarray(sample),(x,y))
                index=NewAtlas(label,kind,canvas,sampler,coverage)
                Slots(material)[channel]['index']=index
                if channel==1 and 'occlusionTexture' in material:
                    material['occlusionTexture']['index']=index
            for part,x,y in page:
                left,top,w,h=part['crop']
                originalUv=part['uv'].astype(np.float64)
                if part['oldTile']:
                    oldX,oldY=part['oldTile']['placement'][:2]
                    pixel=originalUv*part['oldTile']['size']-[oldX,oldY]
                else:
                    pixel=originalUv*part['size']-[left,top]
                relocated=((pixel+[x,y])/[width,height]).astype('<f4')
                assert np.isfinite(relocated).all() and relocated.min()>=0 and relocated.max()<=1
                accessor=part['accessor']
                accessor['bufferView']=NewView(relocated.tobytes(),34962)
                if 'min' in accessor: accessor['min']=relocated.min(axis=0).tolist()
                if 'max' in accessor: accessor['max']=relocated.max(axis=0).tolist()
                part['primitive']['material']=len(materials)
                tiles[part['name']]={'crop':part['crop'],'placement':[x,y,w,h],
                                     'size':[width,height],'sourceSize':part['size']}
                shared.add(part['name'])
            materials.append(material)

    for part in parts:
        if part['name'] in shared:
            continue
        material=deepcopy(part['source'])
        for slot in AllSlots(material):
            slot['index']=KeepTexture(slot['index'])
        part['primitive']['material']=len(materials)
        materials.append(material)
    assert len(parts)==originalPartCount and len(materials)<originalPartCount
    batches={(part['role'],part['primitive']['material']) for part in parts}
    report['batching']={'originalMeshes':originalPartCount,'renderMeshes':len(batches),
                         'authoredSha256':previous.get('authoredSha256',report['gameSha256']),
                         'materials':len(materials),'sourceImages':previous.get('sourceImages',len(originalImages)),
                         'images':len(images),'gutter':GUTTER,'tiles':tiles}
    doc['asset']['extras']['hanYangBatching']=1
    doc['materials'],doc['images'],doc['textures']=materials,images,textures
    used=sorted({a['bufferView'] for a in doc['accessors']}|{image['bufferView'] for image in images})
    lookup={}
    payload=bytearray()
    packedViews=[]
    for index in used:
        lookup[index]=len(packedViews)
        content=blocks[index]
        packedViews.append(dict(views[index],byteOffset=len(payload),byteLength=len(content)))
        payload.extend(content)
        payload.extend(bytes((-len(content))%4))
    for item in [*doc['accessors'],*images]:
        item['bufferView']=lookup[item['bufferView']]
    doc['bufferViews']=packedViews
    doc['buffers'][0]['byteLength']=len(payload)
    header=json.dumps(doc,separators=(',',':')).encode()
    header+=b' '*((-len(header))%4)
    output=(struct.pack('<4sII',b'glTF',2,28+len(header)+len(payload))
            +struct.pack('<I4s',len(header),b'JSON')+header+struct.pack('<I4s',len(payload),b'BIN\0')+payload)
    report['gameSha256']=sha256(output).hexdigest()
    report['texturePayloads']=records
    report['runtimeNormalPacking']['images']=sum(image['name'].endswith('_Normal') for image in images)
    outputDir.mkdir(parents=True,exist_ok=True)
    (outputDir/'Model_HanYang173R.glb').write_bytes(output)
    (outputDir/'Data_GameGeometry.json').write_text(json.dumps(report,indent=2)+'\n', encoding='utf8')
    print(originalPartCount,'source parts,',len(batches),'render batches,',len(originalImages),'->',len(images),'maps')


if __name__=='__main__':
    BuildRuntime(Path(sys.argv[1]),Path(sys.argv[2]))

