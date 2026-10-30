"""Restore actual authored Mikk frames after exact surface/normal/UV binding."""
import base64,bpy,hashlib,importlib.util,io,json,struct,numpy as np
from pathlib import Path
TEXT_NAME='Data_Type94AuthoredTangentFramesV102'
path=Path(__file__).with_name('Script_Type94Export.py');spec=importlib.util.spec_from_file_location('Stable102OriginalExport',path);original=importlib.util.module_from_spec(spec);spec.loader.exec_module(original)
TriangulatedCopy=original.TriangulatedCopy

def Read(payload):
    n=struct.unpack_from('<I',payload,12)[0];doc=json.loads(payload[20:20+n]);binary=payload[28+n:]
    def Access(index):
        a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];dtype=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]);width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        return np.ndarray((a['count'],width),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dtype.itemsize*width),dtype.itemsize)).copy()
    return doc,binary,Access

def Canonical(attrs,faces):
    p=attrs['POSITION'][faces];start=np.lexsort((p[:,:,2],p[:,:,1],p[:,:,0]),axis=1)[:,0];rotation=(start[:,None]+[0,1,2])%3
    rows=np.hstack([np.take_along_axis(attrs[k][faces],rotation[:,:,None],axis=1).reshape(len(faces),-1)for k in ['POSITION','NORMAL','TEXCOORD_0']]).astype('<f4');rows[rows==0]=0
    order=np.lexsort(rows.T[::-1]);return hashlib.sha256(rows[order].tobytes()).hexdigest(),rotation,order

def StoreFrames(referenceFile,expectedSha256):
    payload=Path(referenceFile).read_bytes();assert hashlib.sha256(payload).hexdigest()==expectedSha256;doc,binary,access=Read(payload);records={};buffers={}
    for node in sorted([n for n in doc['nodes']if'mesh'in n],key=lambda n:n['name']):
        parts=[]
        for primitive in doc['meshes'][node['mesh']]['primitives']:
            material=doc['materials'][primitive['material']]
            if'normalTexture'not in material:continue
            attrs={k:access(v)for k,v in primitive['attributes'].items()};faces=access(primitive['indices']).ravel().reshape(-1,3);digest,rotation,order=Canonical(attrs,faces);tangents=np.take_along_axis(attrs['TANGENT'][faces],rotation[:,:,None],axis=1)[order];key=hashlib.sha256(tangents.tobytes()).hexdigest();buffers[key]=tangents
            parts.append(dict(material=material['name'],geometryNormalUvSha256=digest,triangles=len(faces),tangents=key))
        if parts:records[node['name']]=parts
    data=io.BytesIO();np.savez_compressed(data,**buffers);encoded=base64.b64encode(data.getvalue()).decode('ascii');cache=dict(schema='Type94AuthoredMikkFramesV1',referenceSha256=expectedSha256,records=records,dataChunks=[encoded[i:i+120]for i in range(0,len(encoded),120)],binding='Exact material and oriented POSITION/NORMAL/TEXCOORD_0 triangles; numeric signed zero normalized in digest')
    print('TYPE94_FRAME_CACHE_READY',len(records),len(buffers),len(data.getvalue()),flush=True)
    # Blender text insertion is quadratic for megabyte-long single lines.
    # Short chunks retain the exact NPZ bytes and keep author data inspectable.
    text=bpy.data.texts.get(TEXT_NAME)or bpy.data.texts.new(TEXT_NAME);text.clear();text.write(json.dumps(cache,indent=1));print('TYPE94_FRAME_CACHE_PACKED',flush=True);return dict(mappedOwners=len(records),uniqueFrameArrays=len(buffers),embeddedBytes=len(data.getvalue()))

def RestoreFrames(filepath):
    cache=json.loads(bpy.data.texts[TEXT_NAME].as_string());arrays=np.load(io.BytesIO(base64.b64decode(''.join(cache['dataChunks']))));doc,binary,access=Read(Path(filepath).read_bytes());binary=bytearray(binary);owners={};rows=[]
    for node in doc['nodes']:
        if'mesh'in node:owners.setdefault(node['mesh'],[]).append(node['name'])
    def Accessor(data,component,typeName):
        binary.extend(b'\0'*((-len(binary))%4));offset=len(binary);binary.extend(data.tobytes());doc['bufferViews'].append(dict(buffer=0,byteOffset=offset,byteLength=data.nbytes));view=len(doc['bufferViews'])-1
        doc['accessors'].append(dict(bufferView=view,componentType=component,count=len(data),type=typeName));return len(doc['accessors'])-1
    mapped=0
    for index,names in owners.items():
        for primitive in doc['meshes'][index]['primitives']:
            material=doc['materials'][primitive['material']]
            if'normalTexture'not in material:continue
            records=[]
            for name in names:
                entries=[r for r in cache['records'][name]if r['material']==material['name']];assert len(entries)==1;records.append(entries[0])
            assert all(r==records[0]for r in records);record=records[0];attrs={k:access(v)for k,v in primitive['attributes'].items()};faces=access(primitive['indices']).ravel().reshape(-1,3);digest,rotation,order=Canonical(attrs,faces)
            assert digest==record['geometryNormalUvSha256']and len(faces)==record['triangles'],('Authored tangent cache invalid after surface edit',names,material['name'])
            canonical=arrays[record['tangents']];rotated=np.empty_like(canonical);rotated[order]=canonical;target=np.empty_like(rotated);np.put_along_axis(target,rotation[:,:,None],rotated,axis=1)
            perVertex=attrs['TANGENT'].copy();seen=np.zeros(len(perVertex),bool);conflict=False
            for corner in range(3):
                ids=faces[:,corner];values=target[:,corner];prior=seen[ids]
                if np.any(prior&np.any(perVertex[ids]!=values,axis=1)):conflict=True
                _,first,inverse=np.unique(ids,return_index=True,return_inverse=True)
                if not np.array_equal(values,values[first][inverse]):conflict=True
                perVertex[ids]=values;seen[ids]=True
            before=attrs['TANGENT'][faces].copy()
            if conflict:
                # Split only tangent seams, preserving actual exported corner
                # positions/normals/UVs and every triangle's original winding.
                keys=['POSITION']+sorted(k for k in attrs if k!='POSITION');expanded={k:(target if k=='TANGENT'else v[faces]).reshape(-1,v.shape[1])for k,v in attrs.items()};joined=np.hstack([expanded[k]for k in keys]);unique,first,inverse=np.unique(joined,axis=0,return_index=True,return_inverse=True)
                for key in keys:
                    a=doc['accessors'][primitive['attributes'][key]];values=expanded[key][first];primitive['attributes'][key]=Accessor(values,a['componentType'],a['type'])
                    if key=='POSITION':doc['accessors'][primitive['attributes'][key]].update(min=values.min(axis=0).tolist(),max=values.max(axis=0).tolist())
                primitive['indices']=Accessor(inverse.astype('<u4').reshape(-1,1),5125,'SCALAR')
            else:primitive['attributes']['TANGENT']=Accessor(perVertex,5126,'VEC4')
            rows.append(dict(owners=names,material=material['name'],triangles=len(faces),surfaceNormalUvExact=True,authoredFrameCornerChanges=int(np.any(before!=target,axis=2).sum()),vertexSeamSplitRequired=conflict,maximumFrameComponentChange=float(np.max(abs(before-target)))))
        if any('normalTexture'in doc['materials'][p['material']]for p in doc['meshes'][index]['primitives']):mapped+=len(names)
    assert mapped==len(cache['records'])
    doc['buffers'][0]['byteLength']=len(binary);binary.extend(b'\0'*((-len(binary))%4));encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
    out=struct.pack('<4sII',b'glTF',2,28+len(encoded)+len(binary))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+struct.pack('<I4s',len(binary),b'BIN\0')+binary;Path(filepath).write_bytes(out)
    return dict(passed=True,referenceSha256=cache['referenceSha256'],records=rows,actualCornerFramesFromSavedAuthorData=True,otherOriginalBinaryBytesPreserved=True)

def ExportGltf(filepath):
    assert TEXT_NAME in bpy.data.texts
    original.ExportGltf(filepath);report=RestoreFrames(filepath);(Path(filepath).parent.parent/'Acceptance'/('Data_AuthoredFrames'+Path(filepath).stem+'.json')).write_text(json.dumps(report,indent=2)+'\n')
