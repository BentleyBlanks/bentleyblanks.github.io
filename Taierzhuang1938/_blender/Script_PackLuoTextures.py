"""Pack the baked standalone GLB with standard JPEG/PNG glTF textures.

Run with normal Python/Pillow; the original lossless maps remain in the private
Blender source. Geometry, accessor layout and animations are unchanged.
"""
import io, json, struct
from pathlib import Path
from PIL import Image

repo=Path(__file__).resolve().parents[2]
path=repo/'Taierzhuang1938/Model/Character/Model_TengxianLuoReference.glb'
raw=path.read_bytes();size=struct.unpack_from('<I',raw,12)[0]
doc=json.loads(raw[20:20+size]);binary=raw[28+size:]
replacements={};report=[]
for entry in doc['images']:
    index=entry['bufferView'];view=doc['bufferViews'][index];offset=view.get('byteOffset',0)
    data=binary[offset:offset+view['byteLength']]
    image=Image.open(io.BytesIO(data));name=entry.get('name','')
    encoded=io.BytesIO()
    if 'Base' in name and 'Skin' not in name:
        image.convert('RGB').save(encoded,format='JPEG',quality=95,subsampling=0,optimize=True)
        entry['mimeType']='image/jpeg'
    elif 'Normal' in name and max(image.size)>2048:
        image=image.resize((2048,2048),Image.Resampling.LANCZOS)
        image.save(encoded,format='PNG',optimize=True)
    else:
        image.save(encoded,format='PNG',optimize=True)
    replacements[index]=encoded.getvalue()
    report.append({'name':name,'resolution':list(image.size),'mimeType':entry['mimeType'],'bytes':len(replacements[index])})
packed=bytearray()
for index,view in enumerate(doc['bufferViews']):
    offset=view.get('byteOffset',0);data=replacements.get(index,binary[offset:offset+view['byteLength']])
    packed.extend(b'\0'*((-len(packed))%4));view['byteOffset']=len(packed);view['byteLength']=len(data);view['buffer']=0;packed.extend(data)
packed.extend(b'\0'*((-len(packed))%4));doc['buffers']=[{'byteLength':len(packed)}]
doc.setdefault('extras',{})['packedTextures']=report
data=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode('utf8');data+=b' '*((-len(data))%4)
result=struct.pack('<III',0x46546C67,2,28+len(data)+len(packed))+struct.pack('<II',len(data),0x4E4F534A)+data+struct.pack('<II',len(packed),0x004E4942)+packed
path.write_bytes(result)
print(json.dumps({'beforeBytes':len(raw),'afterBytes':len(result),'textures':report},indent=2))
