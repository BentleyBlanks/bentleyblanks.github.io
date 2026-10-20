"""Decode final tree assets independently and verify their authored contracts."""
import argparse
import hashlib
import io
import json
from collections import Counter
from pathlib import Path
import numpy as np
from PIL import Image
from Script_WarDamagedTreesPack import ReadGlb,View,GeometryHash

def Accessor(doc,binary,index):
    item=doc['accessors'][index];view=doc['bufferViews'][item['bufferView']]
    dtype=np.dtype({5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[item['componentType']])
    width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[item['type']]
    result=np.ndarray((item['count'],width),dtype=dtype,buffer=binary,offset=view.get('byteOffset',0)+item.get('byteOffset',0),strides=(view.get('byteStride',width*dtype.itemsize),dtype.itemsize)).copy()
    assert np.isfinite(result).all()
    return result
def Matrix(node):
    if 'matrix' in node:return np.array(node['matrix']).reshape((4,4),order='F')
    x,y,z,w=node.get('rotation',[0,0,0,1]);result=np.eye(4)
    result[:3,:3]=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])@np.diag(node.get('scale',[1,1,1]))
    result[:3,3]=node.get('translation',[0,0,0]);return result
def Verify(file,record):
    doc,binary=ReadGlb(file);points=[];count=0;colors=[]
    def Visit(index,parent):
        nonlocal count
        node=doc['nodes'][index];matrix=parent@Matrix(node)
        if 'mesh' in node:
            for primitive in doc['meshes'][node['mesh']]['primitives']:
                assert primitive.get('mode',4)==4
                attributes=primitive['attributes'];assert {'POSITION','NORMAL','TEXCOORD_0','COLOR_0'}<=set(attributes)
                position=Accessor(doc,binary,attributes['POSITION']);normal=Accessor(doc,binary,attributes['NORMAL'])
                assert np.allclose(np.linalg.norm(normal,axis=1),1,atol=.015)
                Accessor(doc,binary,attributes['TEXCOORD_0']);colors.append(Accessor(doc,binary,attributes['COLOR_0']))
                indices=Accessor(doc,binary,primitive['indices']).reshape(-1,3);assert indices.min()>=0 and indices.max()<len(position)
                triangle=position[indices];assert np.all(np.linalg.norm(np.cross(triangle[:,1]-triangle[:,0],triangle[:,2]-triangle[:,0]),axis=1)>1e-12)
                count+=len(indices);points.append((matrix@np.column_stack([position,np.ones(len(position))]).T).T[:,:3])
        for child in node.get('children',[]):Visit(child,matrix)
    for index in doc['scenes'][doc.get('scene',0)]['nodes']:Visit(index,np.eye(4))
    assert count==record['triangles'],(file.name,count,record['triangles'])
    points=np.concatenate(points);low=points.min(axis=0);high=points.max(axis=0)
    assert np.allclose(low,record['boundsMin'],atol=.00003) and np.allclose(high,record['boundsMax'],atol=.00003)
    assert len(doc['images'])==12 and all('uri' not in item for item in doc.get('buffers',[])+doc['images'])
    texturePixels=[];textureDimensions=[]
    for image in doc['images']:
        raw=View(doc,binary,image['bufferView']);decoded=Image.open(io.BytesIO(raw));decoded.load()
        textureDimensions.append('x'.join(map(str,decoded.size)))
        texturePixels.append(hashlib.sha256(decoded.convert('RGBA').tobytes()).hexdigest())
    assert dict(Counter(textureDimensions))==record['textureDimensionCounts']
    assert Counter(texturePixels)==Counter(record['rgbaImageSha256']), 'Authored texture pixels changed'
    return {'file':file.name,'triangles':count,'boundsMin':low.tolist(),'boundsMax':high.tolist(),'geometrySha256':GeometryHash(doc,binary),'rgbaImageSha256':texturePixels,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
def Main():
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parent);parser.add_argument('--report',type=Path);args=parser.parse_args()
    records=json.loads((args.root/'Data_Asset.json').read_text(encoding='utf-8'))['models']
    result={'result':'PASS','models':[Verify(args.root/item['file'],item) for item in records]}
    if args.report:args.report.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'result':'PASS','models':[{k:r[k] for k in ['file','triangles','boundsMin','boundsMax']} for r in result['models']]},indent=2))
if __name__=='__main__':Main()
