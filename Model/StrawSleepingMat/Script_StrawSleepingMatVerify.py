"""Independently decode the delivered GLBs and check the requested contracts."""
import argparse
import hashlib
import io
import json
import struct
from pathlib import Path
import numpy as np
from PIL import Image

componentTypes = {5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}
typeWidths = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}


def ReadGlb(file):
    raw = file.read_bytes()
    magic,version,length = struct.unpack_from('<III',raw)
    assert magic == 0x46546C67 and version == 2 and length == len(raw), 'Bad GLB header'
    offset = 12
    document,binary = None,None
    while offset < length:
        count,kind = struct.unpack_from('<II',raw,offset)
        data = raw[offset+8:offset+8+count]
        if kind == 0x4E4F534A: document = json.loads(data)
        if kind == 0x004E4942: binary = data
        offset += count+8
    assert document and binary is not None
    return document,binary


def Accessor(document,binary,index):
    definition = document['accessors'][index]
    view = document['bufferViews'][definition['bufferView']]
    dtype = np.dtype(componentTypes[definition['componentType']])
    columns = typeWidths[definition['type']]
    stride = view.get('byteStride',columns*dtype.itemsize)
    offset = view.get('byteOffset',0)+definition.get('byteOffset',0)
    result = np.ndarray((definition['count'],columns),dtype=dtype,buffer=binary,
                        offset=offset,strides=(stride,dtype.itemsize)).copy()
    assert np.isfinite(result).all(), 'Nonfinite accessor'
    return result


def NodeMatrix(node):
    if 'matrix' in node:
        return np.array(node['matrix']).reshape((4,4),order='F')
    result = np.eye(4)
    x,y,z,w = node.get('rotation',[0,0,0,1])
    result[:3,:3] = np.array([
        [1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
        [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
        [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]) @ np.diag(node.get('scale',[1,1,1]))
    result[:3,3] = node.get('translation',[0,0,0])
    return result


def VerifyAsset(file,limit,isFlat):
    document,binary = ReadGlb(file)
    assert all('uri' not in item for item in document.get('buffers',[])), 'External buffer'
    positions=[]
    triangleCount=0
    degenerate=0
    def Visit(nodeIndex,parent):
        nonlocal triangleCount,degenerate
        node=document['nodes'][nodeIndex]
        transform=parent@NodeMatrix(node)
        if 'mesh' in node:
            # A mesh root with identity transform preserves bottom-centre pivot.
            assert np.allclose(transform,np.eye(4),atol=1e-6), 'Unexpected root transform'
            for primitive in document['meshes'][node['mesh']]['primitives']:
                assert primitive.get('mode',4)==4
                attributes=primitive['attributes']
                assert all(key in attributes for key in ['POSITION','NORMAL','TANGENT','TEXCOORD_0'])
                points=Accessor(document,binary,attributes['POSITION'])
                normals=Accessor(document,binary,attributes['NORMAL'])
                assert np.allclose(np.linalg.norm(normals,axis=1),1,atol=.015), 'Invalid normals'
                tangents=Accessor(document,binary,attributes['TANGENT'])
                assert np.allclose(np.linalg.norm(tangents[:,:3],axis=1),1,atol=.015),'Invalid tangent length'
                assert np.allclose(np.abs(tangents[:,3]),1,atol=1e-5),'Invalid tangent handedness'
                assert np.allclose(np.sum(normals*tangents[:,:3],axis=1),0,atol=.015),'Tangent not orthogonal to normal'
                indices=Accessor(document,binary,primitive['indices']).reshape(-1,3)
                assert indices.max() < len(points)
                triangleCount += len(indices)
                tri=points[indices]
                area=np.linalg.norm(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]),axis=1)
                degenerate += int(np.count_nonzero(area<1e-12))
                positions.append(points)
        for child in node.get('children',[]): Visit(child,transform)
    for index in document['scenes'][document.get('scene',0)]['nodes']: Visit(index,np.eye(4))
    positions=np.concatenate(positions)
    low,high=positions.min(axis=0),positions.max(axis=0)
    dimensions=high-low
    assert triangleCount <= limit,(triangleCount,limit)
    assert degenerate == 0, f'{degenerate} degenerate triangles'
    assert abs(low[1])<1e-6,'Bottom must touch Y=0'
    assert np.allclose((low+high)[[0,2]]/2,0,atol=.0001),'Pivot is not bottom-centre of bounds'
    if isFlat:
        assert abs(dimensions[0]-1.8)<.03 and abs(dimensions[2]-.9)<.03
        assert .005 <= dimensions[1] <= .035
        interior=positions[(abs(positions[:,0])<.79)&(abs(positions[:,2])<.34)]
        pairs={}
        for x,y,z in interior:
            pairs.setdefault((round(float(x),5),round(float(z),5)),set()).add(round(float(y),6))
        thicknesses=[max(v)-min(v) for v in pairs.values() if len(v)==2]
        assert len(thicknesses)>50 and abs(float(np.median(thicknesses))-.005)<2e-5
    else:
        assert abs(dimensions[0]-.9)<.025
        assert .12 <= dimensions[2] <= .15
        assert .17 <= dimensions[1] <= .32,'Carrying loop missing or excessively large'
    materials=document['materials']
    for material in materials:
        assert material.get('alphaMode')=='MASK','Frayed grass must use alpha clipping, not blending'
        assert .20<=material.get('alphaCutoff',0)<=.5,'Unexpected fibre cutoff'
        assert all(key in material for key in ['normalTexture','occlusionTexture','pbrMetallicRoughness'])
        pbr=material['pbrMetallicRoughness']
        assert 'baseColorTexture' in pbr and 'metallicRoughnessTexture' in pbr
        baseImage=document['images'][document['textures'][pbr['baseColorTexture']['index']]['source']]
        baseView=document['bufferViews'][baseImage['bufferView']]
        baseStart=baseView.get('byteOffset',0)
        base=Image.open(io.BytesIO(binary[baseStart:baseStart+baseView['byteLength']])).convert('RGBA')
        alpha=np.asarray(base.getchannel('A'))
        assert (alpha[:896]==255).all() and (alpha[896:,:512]==255).all(),'Opaque surface accidentally cut out'
        coverage=float((alpha[896:,512:]>=material['alphaCutoff']*255).mean())
        assert .03<coverage<.65,'Fibre cutout is empty or a solid rectangle'
        ormTexture=document['textures'][pbr['metallicRoughnessTexture']['index']]
        ormImage=document['images'][ormTexture['source']]
        view=document['bufferViews'][ormImage['bufferView']]
        start=view.get('byteOffset',0)
        orm=np.asarray(Image.open(io.BytesIO(binary[start:start+view['byteLength']])).convert('RGB'))
        assert orm.shape[:2]==(1024,1024)
        assert orm[:,:,2].max()==0,'Straw must be nonmetallic'
        assert orm[:,:,1].min()>=200,'Unexpected glossy/plastic roughness'
    imageSizes=[]
    for image in document['images']:
        assert 'uri' not in image,'GLB must contain textures'
        view=document['bufferViews'][image['bufferView']]
        start=view.get('byteOffset',0)
        size=Image.open(io.BytesIO(binary[start:start+view['byteLength']])).size
        assert size==(1024,1024)
        imageSizes.append(size)
    return {'file':file.name,'triangles':triangleCount,'limit':limit,'boundsMin':low.tolist(),
            'boundsMax':high.tolist(),'dimensionsMeters':dimensions.tolist(),
            'pivot':'bottom-centre, identity root, minimum Y=0',
            'degenerateTriangles':degenerate,'embeddedTextureSizes':imageSizes,
            'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}


def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',default=str(Path(__file__).resolve().parent))
    parser.add_argument('--report',required=True)
    args=parser.parse_args()
    root=Path(args.root)
    maps={}
    for state in ['Flat','Rolled']:
        maps[state]={}
        for channel in ['BaseColor','Normal','Roughness','AO']:
            file=root/'Texture'/f'Texture_StrawSleepingMat{state}{channel}.png'
            image=Image.open(file)
            assert image.size==(1024,1024)
            if channel=='Normal':
                normal=np.asarray(image.convert('RGB'),dtype=float)/127.5-1
                assert np.allclose(np.linalg.norm(normal,axis=2),1,atol=.02),'Invalid tangent normal map'
            maps[state][channel]={'size':list(image.size),'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
    report={'result':'PASS','independentGlbDecode':True,'assets':[
        VerifyAsset(root/'Model_StrawSleepingMatFlat.glb',2000,True),
        VerifyAsset(root/'Model_StrawSleepingMatRolled.glb',1200,False)],'maps':maps}
    Path(args.report).write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2))


if __name__=='__main__': Main()
