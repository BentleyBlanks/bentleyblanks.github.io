"""Lossless, same-resolution PNG -> WebP packaging; preserve every geometry byte."""
import argparse
import copy
import hashlib
import io
import json
import struct
from pathlib import Path
from PIL import Image

def Hash(data):return hashlib.sha256(data).hexdigest()
def ReadGlb(file):
    raw=Path(file).read_bytes()
    assert struct.unpack_from('<III',raw)==(0x46546c67,2,len(raw))
    size,kind=struct.unpack_from('<II',raw,12);assert kind==0x4e4f534a
    doc=json.loads(raw[20:20+size]);offset=20+size
    length,kind=struct.unpack_from('<II',raw,offset);assert kind==0x004e4942
    return doc,raw[offset+8:offset+8+length]
def View(doc,binary,index):
    view=doc['bufferViews'][index];assert view.get('buffer',0)==0
    start=view.get('byteOffset',0);return binary[start:start+view['byteLength']]
def GeometryHash(doc,binary):
    imageViews={image['bufferView'] for image in doc['images']}
    return Hash(b''.join(View(doc,binary,index) for index in range(len(doc['bufferViews'])) if index not in imageViews))
def PixelHash(data):
    image=Image.open(io.BytesIO(data));image.load()
    return list(image.size),Hash(image.convert('RGBA').tobytes())
def Pack(file):
    doc,binary=ReadGlb(file);before=file.read_bytes();geometry=GeometryHash(doc,binary)
    doc=copy.deepcopy(doc);replacements={};converted=set();images=[]
    for index,image in enumerate(doc['images']):
        source=View(doc,binary,image['bufferView']);dimensions,pixels=PixelHash(source)
        output=source
        if image['mimeType']=='image/png':
            buffer=io.BytesIO();Image.open(io.BytesIO(source)).save(buffer,format='WEBP',lossless=True,method=6,exact=True)
            candidate=buffer.getvalue()
            if PixelHash(candidate)==(dimensions,pixels) and len(candidate)<len(source):
                output=candidate;replacements[image['bufferView']]=output;image['mimeType']='image/webp';converted.add(index)
        images.append({'index':index,'dimensions':dimensions,'rgbaSha256':pixels,'beforeBytes':len(source),'afterBytes':len(output)})
    for texture in doc['textures']:
        if texture.get('source') in converted:
            texture.setdefault('extensions',{})['EXT_texture_webp']={'source':texture.pop('source')}
    if converted:
        for key in ['extensionsUsed','extensionsRequired']:
            doc[key]=sorted(set(doc.get(key,[])+['EXT_texture_webp']))
    chunks=[];offset=0
    for index,view in enumerate(doc['bufferViews']):
        data=replacements.get(index,View(doc,binary,index))
        view['byteOffset']=offset;view['byteLength']=len(data)
        padded=data+b'\0'*((-len(data))%4);chunks.append(padded);offset+=len(padded)
    packedBinary=b''.join(chunks);doc['buffers'][0]['byteLength']=len(packedBinary)
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
    output=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(packedBinary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(packedBinary),0x004e4942)+packedBinary
    file.write_bytes(output)
    afterDoc,afterBinary=ReadGlb(file);assert GeometryHash(afterDoc,afterBinary)==geometry
    for row,image in zip(images,afterDoc['images']):assert PixelHash(View(afterDoc,afterBinary,image['bufferView']))==(row['dimensions'],row['rgbaSha256'])
    return {'file':file.name,'beforeBytes':len(before),'afterBytes':len(output),'beforeSha256':Hash(before),'afterSha256':Hash(output),'geometrySha256':geometry,'images':images}
def Main():
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parent);args=parser.parse_args()
    previousFile=args.root/'Data_TexturePacking.json'
    previous=json.loads(previousFile.read_text()).get('models',[]) if previousFile.exists() else []
    report=[]
    for file in sorted(args.root.glob('Model_WarDamagedTree*.glb')):
        row=Pack(file)
        prior=next((item for item in previous if item['file']==file.name and item['afterSha256']==row['beforeSha256']),None)
        report.append(prior if prior and row['beforeSha256']==row['afterSha256'] else row)
    assert len(report)==3
    (args.root/'Data_TexturePacking.json').write_text(json.dumps({'method':'Lossless same-resolution WebP; decoded RGBA and all non-image buffers verified byte-for-byte','models':report},indent=2)+'\n',encoding='utf-8')
    print(json.dumps([{k:r[k] for k in ['file','beforeBytes','afterBytes','geometrySha256']} for r in report],indent=2))
if __name__=='__main__':Main()
