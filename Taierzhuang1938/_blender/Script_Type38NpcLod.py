"""Geometry-only NPC sight-frame LOD; FPS and all 116 source images remain unchanged."""
import bpy, os, json, hashlib, struct
from pathlib import Path
import numpy as np
from mathutils import Matrix, Vector, Quaternion
from mathutils.bvhtree import BVHTree

repo=Path(os.environ['TYPE38_REPO_ROOT'])
folder=repo/'Taierzhuang1938/Model/Type38_511'
source=folder/'Model_Type38_511.glb'
assert hashlib.sha256(source.read_bytes()).hexdigest()=='77768c563db9fe7a3db3b0fd937279b4b6d05eb058cc441cafb3bcda0e668ad5'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source),merge_vertices=True)
part='Exterior_FoldedFrame12'
obj=next(o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('SourceObject')==part)
obj.data.calc_loop_triangles();before=len(obj.data.loop_triangles)
for selected in bpy.context.selected_objects:selected.select_set(False)
obj.select_set(True);bpy.context.view_layer.objects.active=obj
modifier=obj.modifiers.new('NpcSightTopology','DECIMATE')
modifier.decimate_type='COLLAPSE';modifier.ratio=.2;modifier.use_collapse_triangulate=True
bpy.ops.object.modifier_apply(modifier=modifier.name)
modifier=obj.modifiers.new('StableNpcTriangles','TRIANGULATE')
bpy.ops.object.modifier_apply(modifier=modifier.name)
obj.data.calc_loop_triangles();after=len(obj.data.loop_triangles)
target=folder/'Model_Type38_511NpcLod.glb'
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_yup=True,
    export_texcoords=True,export_normals=True,export_tangents=True,export_materials='NONE',export_extras=True,export_animations=False)

def Read(p):
    raw=p.read_bytes();n=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+n]),raw[28+n:]
old,oldBin=Read(source);doc,data=Read(target)
widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4};types={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}
def Values(d,b,i):
    a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];w=widths[a['type']];dtype=np.dtype(types[a['componentType']])
    return np.ndarray((a['count'],w),dtype=dtype,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dtype.itemsize),dtype.itemsize)).copy()
def Worlds(d):
    result={}
    def Walk(i,parent):
        n=d['nodes'][i]
        if 'matrix' in n:m=Matrix([n['matrix'][k::4] for k in range(4)])
        else:
            q=n.get('rotation',[0,0,0,1]);m=Matrix.LocRotScale(Vector(n.get('translation',[0,0,0])),Quaternion((q[3],q[0],q[1],q[2])),Vector(n.get('scale',[1,1,1])))
        result[i]=parent@m
        for child in n.get('children',[]):Walk(child,result[i])
    for i in d['scenes'][d.get('scene',0)]['nodes']:Walk(i,Matrix.Identity(4))
    return result
oi=next(i for i,n in enumerate(old['nodes']) if n.get('extras',{}).get('SourceObject')==part)
ni=next(i for i,n in enumerate(doc['nodes']) if n.get('extras',{}).get('SourceObject')==part)
op=old['meshes'][old['nodes'][oi]['mesh']]['primitives'][0];p=doc['meshes'][doc['nodes'][ni]['mesh']]['primitives'][0]
h={k:Values(old,oldBin,i) for k,i in op['attributes'].items()};a={k:Values(doc,data,i) for k,i in p['attributes'].items()}
indices=Values(old,oldBin,op['indices']).reshape(-1,3);uv=h['TEXCOORD_0'].astype(float)
edge1=uv[indices[:,1]]-uv[indices[:,0]];edge2=uv[indices[:,2]]-uv[indices[:,0]]
valid=np.abs(edge1[:,0]*edge2[:,1]-edge1[:,1]*edge2[:,0])>1e-16
uvIndices=indices[valid];tree=BVHTree.FromPolygons([Vector((u,v,0)) for u,v in uv],[tuple(t) for t in uvIndices],all_triangles=True)
toNew=Worlds(doc)[ni].inverted()@Worlds(old)[oi];normalMatrix=toNew.to_3x3().inverted().transposed();tangentMatrix=toNew.to_3x3()
normals=np.zeros((len(a['POSITION']),3),dtype='<f4');tangents=np.zeros((len(a['POSITION']),4),dtype='<f4');uvMiss=0.
for i,point in enumerate(a['TEXCOORD_0']):
    nearest,_,triangle,distance=tree.find_nearest(Vector((float(point[0]),float(point[1]),0)));uvMiss=max(uvMiss,distance)
    tri=uvIndices[triangle];p0,p1,p2=uv[tri];e1=p1-p0;e2=p2-p0;delta=np.array((nearest.x,nearest.y))-p0;denom=e1[0]*e2[1]-e1[1]*e2[0]
    w1=(delta[0]*e2[1]-delta[1]*e2[0])/denom;w2=(e1[0]*delta[1]-e1[1]*delta[0])/denom;weights=np.array((1-w1-w2,w1,w2))
    normal=(normalMatrix@Vector(weights@h['NORMAL'][tri])).normalized();tangent=tangentMatrix@Vector(weights@h['TANGENT'][tri,:3]);tangent=(tangent-normal*tangent.dot(normal)).normalized()
    normals[i]=normal;tangents[i,:3]=tangent;tangents[i,3]=-1 if weights@h['TANGENT'][tri,3]<0 else 1
payload=bytearray(data)
def Add(array,kind):
    while len(payload)%4:payload.append(0)
    vi=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':len(payload),'byteLength':array.nbytes,'target':34962});payload.extend(array.tobytes())
    ai=len(doc['accessors']);doc['accessors'].append({'bufferView':vi,'componentType':5126,'count':len(array),'type':kind});return ai
p['attributes']['NORMAL']=Add(normals,'VEC3');p['attributes']['TANGENT']=Add(tangents,'VEC4')
# Independent bidirectional surface samples, in the original local frame.
newPoints=[toNew.inverted()@Vector(v) for v in a['POSITION']];newIndices=Values(doc,data,p['indices']).reshape(-1,3)
oldPoints=[Vector(v) for v in h['POSITION']];oldTree=BVHTree.FromPolygons(oldPoints,[tuple(t) for t in indices],all_triangles=True);newTree=BVHTree.FromPolygons(newPoints,[tuple(t) for t in newIndices],all_triangles=True)
deviation=0.
for points,tris,other in [(oldPoints,indices,newTree),(newPoints,newIndices,oldTree)]:
    samples=list(points)+[(points[t[0]]+points[t[1]]+points[t[2]])/3 for t in tris]
    for v in samples:deviation=max(deviation,other.find_nearest(v)[3])
assert after<2000 and deviation<.0002,(after,deviation)
while len(payload)%4:payload.append(0)
doc['buffers']=[{'byteLength':len(payload)}];j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
target.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(j)+len(payload))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(payload),0x004e4942)+payload)
report={'schema':'Type38NpcSightLod','version':1,'generator':'_blender/Script_Type38NpcLod.py',
 'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),
 'part':part,'before':before,'after':after,'fpsTriangles':69586,'npcTriangles':69586-before+after,
 'collapseRatio':.2,'maxSampledSurfaceDeviationM':deviation,'maxUvProjectionDistance':uvMiss,'uvShadingFramesTransferred':True,'imagesAdded':0,'sourceImagesChanged':0}
(folder/'Data_Type38NpcLod.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print('TYPE38_NPC_LOD',json.dumps(report),flush=True)
