"""Lossless WebP packaging with exact non-image GLB byte preservation."""
import argparse,hashlib,json,struct
from io import BytesIO
from pathlib import Path
from PIL import Image

def Pack(source,output):
    raw=source.read_bytes()
    magic,version,total=struct.unpack_from('<III',raw)
    if magic!=0x46546C67 or version!=2 or total!=len(raw):raise ValueError('Invalid GLB header')
    jsonLength,jsonType=struct.unpack_from('<II',raw,12)
    if jsonType!=0x4E4F534A:raise ValueError('Expected GLB JSON chunk')
    document=json.loads(raw[20:20+jsonLength]);binary=raw[28+jsonLength:]
    def View(index):
        item=document['bufferViews'][index];start=item.get('byteOffset',0)
        return binary[start:start+item['byteLength']]
    imageViews={item['bufferView'] for item in document.get('images',[])}
    geometryBefore=hashlib.sha256(b''.join(View(i) for i in range(len(document['bufferViews'])) if i not in imageViews)).hexdigest()
    changes={};converted=set();images=[]
    output.parent.mkdir(parents=True,exist_ok=True)
    for index,item in enumerate(document.get('images',[])):
        sourcePixels=Image.open(BytesIO(View(item['bufferView']))).convert('RGBA')
        encoded=BytesIO();sourcePixels.save(encoded,format='WEBP',lossless=True,method=6,exact=True)
        content=encoded.getvalue();decoded=Image.open(BytesIO(content)).convert('RGBA')
        if decoded.size!=sourcePixels.size or decoded.tobytes()!=sourcePixels.tobytes():raise RuntimeError('WebP changed pixels')
        changes[item['bufferView']]=content;converted.add(index);item['mimeType']='image/webp'
        name=item.get('name','Texture_DonkeyCartImage%02d'%index)
        if not name.startswith('Texture_'):name='Texture_DonkeyCart'+name.replace('.','')
        texturePath=output.parent/(name+'.webp');texturePath.write_bytes(content)
        images.append({'name':name,'file':texturePath.name,'size':list(decoded.size),'bytes':len(content),
                       'sha256':hashlib.sha256(content).hexdigest(),'lossless':True})
    for texture in document.get('textures',[]):
        if texture.get('source') in converted:texture.setdefault('extensions',{})['EXT_texture_webp']={'source':texture.pop('source')}
    for key in ('extensionsUsed','extensionsRequired'):
        document[key]=list(dict.fromkeys(document.get(key,[])+['EXT_texture_webp']))
    chunks=[];position=0;geometryAfter=[]
    for index,item in enumerate(document['bufferViews']):
        content=changes.get(index,View(index))
        if index not in imageViews:geometryAfter.append(content)
        item['byteOffset']=position;item['byteLength']=len(content)
        padded=content+b'\0'*(-len(content)%4);chunks.append(padded);position+=len(padded)
    if geometryBefore!=hashlib.sha256(b''.join(geometryAfter)).hexdigest():raise RuntimeError('Geometry, skin or action bytes changed')
    document['buffers'][0]['byteLength']=position
    text=json.dumps(document,separators=(',',':')).encode();text+=b' '*(-len(text)%4)
    blob=b''.join(chunks)
    body=struct.pack('<II',len(text),0x4E4F534A)+text+struct.pack('<II',len(blob),0x004E4942)+blob
    output.write_bytes(struct.pack('<III',0x46546C67,2,12+len(body))+body)
    report={'source':str(source),'output':str(output),'bytes':output.stat().st_size,'geometrySkinActionsUnchanged':True,
            'nonImageBufferSha256':geometryBefore,'images':images,'animations':[a.get('name') for a in document.get('animations',[])],
            'skins':[{'name':s.get('name'),'jointCount':len(s['joints'])} for s in document.get('skins',[])]}
    (output.parent/'Data_DonkeyCartPacking.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--input',type=Path,default=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020/Model_DonkeyCartUnpacked.glb'))
    parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'Model/DonkeyCart/Model_DonkeyCart.glb')
    args=parser.parse_args();Pack(args.input,args.output)
