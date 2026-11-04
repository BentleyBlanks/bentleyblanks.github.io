"""Rebuild Shunzi V5 from the preserved V4 source, changing only the cap.

Run with Script_BlenderMcp exec --file. Sources and editable scenes stay in OneDrive.
V4's non-cap coordinates, UVs and embedded images remain byte-identical in V5.
"""
import bpy, bmesh, json, math, struct, hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree

root = Path.cwd().resolve()
assets = Path(r'C:/Users/Bentl/OneDrive/Sync/饮河/FPS/角色/Tripo/01_顺子')
legacy = Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/ShunziPartsMerge_20261103/Shunzi_PartsMerge_V1.blend')
work = Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/ShunziRevision_20261104')
work.mkdir(parents=True, exist_ok=True)
source = assets / 'Shunzi_Merged_V4.glb'
output = assets / 'Shunzi_Merged_V5.glb'
assert Path(bpy.data.filepath).resolve() == legacy.resolve(), 'Load the preserved Shunzi_PartsMerge_V1.blend before running this rebuild'
sc = bpy.data.scenes['Scene']; bpy.context.window.scene = sc
hat, head = bpy.data.objects['Hat_A'], bpy.data.objects['Head_A']
oldHat = np.array([v.co for v in hat.data.vertices], dtype=np.float64)
axis = np.array([0.0, -0.0231810286])
headShape=np.array([v.co for v in head.data.vertices])
originalHead=np.array([v.co for v in bpy.data.objects['Head_W'].data.vertices])
aboveChin=headShape[:,2]>=1.575
a=headShape[aboveChin];b=originalHead[aboveChin]
headScale=np.sum((a-a.mean(0))*(b-b.mean(0)))/np.sum((b-b.mean(0))**2)
headOffset=a.mean(0)-headScale*b.mean(0)
headShapeError=float(np.linalg.norm(b*headScale+headOffset-a,axis=1).max())
assert headShapeError<0.000001, 'The preserved original head must not be deformed'

def Warp(points):
    result = points.copy()
    h = points[:,2] + math.tan(math.radians(15)) * (points[:,1]-axis[1])
    g = np.exp(-((h-1.745)/0.026)**2)
    result[:,0] = axis[0] + (points[:,0]-axis[0])*(1+0.08*g)
    return result

newHat = Warp(oldHat)
hat.data.vertices.foreach_set('co', newHat.ravel()); hat.data.update()
bm = bmesh.new(); bm.from_mesh(hat.data)
seen, loops = set(), []
for edge in bm.edges:
    if not edge.is_boundary or edge in seen: continue
    todo, verts, edges = [edge], set(), []
    seen.add(edge)
    while todo:
        e = todo.pop(); edges.append(e); verts.update(e.verts)
        for v in e.verts:
            for nxt in v.link_edges:
                if nxt.is_boundary and nxt not in seen:
                    seen.add(nxt); todo.append(nxt)
    loops.append((sum(e.calc_length() for e in edges), [v.index for v in verts], [(e.verts[0].index,e.verts[1].index) for e in edges]))
loops.sort(reverse=True)
rimIds, rimEdges = loops[0][1:]
print('CAP_OPENING', round(loops[0][0],4), 'm,',len(rimIds),'vertices')
bm.free()

raw = source.read_bytes(); jsonLength = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20+jsonLength]); oldBin = raw[28+jsonLength:]
assert len(doc['meshes']) == 1 and len(doc['materials']) == 1 and not doc.get('skins')
primitive = doc['meshes'][0]['primitives'][0]
types = {5126:np.dtype('<f4'),5125:np.dtype('<u4'),5123:np.dtype('<u2'),5121:np.dtype('u1')}
widths = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
def ReadAccessor(index):
    a = doc['accessors'][index]; view = doc['bufferViews'][a['bufferView']]
    assert not view.get('byteStride') and not a.get('byteOffset')
    start = view.get('byteOffset',0)
    return np.frombuffer(oldBin,types[a['componentType']],a['count']*widths[a['type']],start).reshape(a['count'],widths[a['type']]).copy()

position = ReadAccessor(primitive['attributes']['POSITION'])
normal = ReadAccessor(primitive['attributes']['NORMAL'])
uv = ReadAccessor(primitive['attributes']['TEXCOORD_0'])
indices = ReadAccessor(primitive['indices']).reshape(-1,3)
assert set(primitive['attributes']) == {'POSITION','NORMAL','TEXCOORD_0'}
# V4's export has identity mesh nodes; convert glTF Y-up into the preserved Blender Z-up source.
points = position[:,[0,2,1]].astype(np.float64); points[:,1] *= -1
normals = normal[:,[0,2,1]].astype(np.float64); normals[:,1] *= -1
tree = KDTree(len(oldHat))
for i,p in enumerate(oldHat): tree.insert(Vector(p),i)
tree.balance()
capMask = np.zeros(len(points),bool); sourceIndex = np.full(len(points),-1,int)
for i,p in enumerate(points):
    _,j,d = tree.find(Vector(p))
    if d < 0.000002: capMask[i]=True; sourceIndex[i]=j
assert capMask.sum() > 1400
newPoints = points.copy(); newNormals = normals.copy()
newPoints[capMask] = Warp(points[capMask])
h = points[capMask,2]+math.tan(math.radians(15))*(points[capMask,1]-axis[1])
g = np.exp(-((h-1.745)/0.026)**2); gp = g*(-2*(h-1.745)/0.026**2)
n = normals[capMask].copy(); nx = n[:,0]/(1+0.08*g)
n[:,0] = nx; n[:,1] -= (points[capMask,0]-axis[0])*0.08*gp*math.tan(math.radians(15))*nx
n[:,2] -= (points[capMask,0]-axis[0])*0.08*gp*nx
newNormals[capMask] = n/np.linalg.norm(n,axis=1)[:,None]

# A thin fabric return under the opening closes the widened band onto the original skull.
# It is cap geometry. No skull vertices are moved, hidden, darkened or repainted.
headBvh = BVHTree.FromPolygons([v.co for v in head.data.vertices],[tuple(p.vertices) for p in head.data.polygons])
extraPos, extraUv = [], []
capUv = {}
for i in np.where(capMask)[0]: capUv.setdefault(int(sourceIndex[i]),uv[i])
segmentCount = 96
outer, inner = [], []
for i in range(segmentCount):
    theta = math.tau*i/segmentCount; direction = np.array([math.sin(theta),-math.cos(theta)])
    hits = []
    for a,b in rimEdges:
        va,vb = newHat[a],newHat[b]; delta = vb[:2]-va[:2]
        matrix = np.column_stack((direction,-delta))
        if abs(np.linalg.det(matrix)) < 1e-10: continue
        radius,t = np.linalg.solve(matrix,va[:2]-axis)
        if radius > 0 and -1e-5 <= t <= 1.00001: hits.append((radius,va+(vb-va)*t,a,b,t))
    assert hits, ('missing cap rim direction',i)
    radius,p,a,b,t = min(hits,key=lambda x:x[0])
    outer.append(p)
    z = p[2]-0.0015
    hit = headBvh.ray_cast(Vector((axis[0],axis[1],z)),Vector((*direction,0)),0.4)
    assert hit[0] is not None, ('missing skull below cap',i,z)
    q = np.array([axis[0]+direction[0]*(hit[3]+0.0012),axis[1]+direction[1]*(hit[3]+0.0012),z])
    inner.append(q)
    texture = capUv[a]*(1-t)+capUv[b]*t
    extraUv.extend([texture.tolist(),(texture+np.array([0,0.0004])).tolist()])
    extraPos.extend([p.tolist(),q.tolist()])
capFaces = indices[np.all(capMask[indices],axis=1)]
capBvh = BVHTree.FromPolygons([Vector(p) for p in points],[tuple(int(x) for x in f) for f in capFaces],all_triangles=True)
extraPos,extraUv,extraIndices = [],[],[]
for i in range(segmentCount):
    nxt=(i+1)%segmentCount
    midpoint=(outer[i]+outer[nxt])/2
    nearest=capBvh.find_nearest(Vector(midpoint))
    tex=uv[capFaces[nearest[2]]]
    # Each quad samples one original cloth triangle, so interpolation never crosses atlas islands.
    patch=np.array([[.45,.45,.1],[.1,.8,.1],[.1,.45,.45],[.45,.1,.45]])@tex
    a=len(extraPos)
    extraPos.extend([outer[i],outer[nxt],inner[nxt],inner[i]])
    extraUv.extend(patch)
    extraIndices.extend([[a,a+2,a+1],[a,a+3,a+2]])
extraPos = np.asarray(extraPos)
extraIndices = np.array(extraIndices,dtype=np.uint32)
extraNormal = np.zeros_like(extraPos)
for a,b,c in extraIndices:
    n = np.cross(extraPos[b]-extraPos[a],extraPos[c]-extraPos[a])
    for j in (a,b,c): extraNormal[j]+=n
extraNormal /= np.maximum(np.linalg.norm(extraNormal,axis=1)[:,None],1e-12)
newPoints = np.vstack((newPoints,extraPos)); newNormals = np.vstack((newNormals,extraNormal))
newPosition = newPoints[:,[0,2,1]]; newPosition[:,2]*=-1
newNormal = newNormals[:,[0,2,1]]; newNormal[:,2]*=-1
newUv = np.vstack((uv,np.asarray(extraUv)))
newIndices = np.vstack((indices,extraIndices+len(points)))

replacement = {}
for name,array in [('POSITION',newPosition),('NORMAL',newNormal),('TEXCOORD_0',newUv)]:
    a=doc['accessors'][primitive['attributes'][name]]; a['count']=len(array)
    if name=='POSITION': a['min']=array.min(0).tolist();a['max']=array.max(0).tolist()
    replacement[a['bufferView']]=array.astype('<f4').tobytes()
a=doc['accessors'][primitive['indices']];a['count']=newIndices.size;a['componentType']=5125
replacement[a['bufferView']]=newIndices.astype('<u4').tobytes()
chunks=[];offset=0
for i,view in enumerate(doc['bufferViews']):
    padding=(-offset)%4
    if padding: chunks.append(bytes(padding));offset+=padding
    data=replacement.get(i,oldBin[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])
    view['byteOffset']=offset;view['byteLength']=len(data);chunks.append(data);offset+=len(data)
binary=b''.join(chunks);binary+=bytes((-len(binary))%4)
doc['buffers'][0]['byteLength']=len(binary)
doc['asset']['generator']='Script_ShunziCapBake.py V5, cap-only revision'
for node in doc['nodes']:
    if 'mesh' in node: node['name']='Shunzi_Merged_V5'
doc['meshes'][0]['name']='Shunzi_Merged_V5'
encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
glb=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary
output.write_bytes(glb)

# Evidence used by binding: final vertex part labels (including the cap lining).
labels=np.full(len(newPoints),-1,int)
for part,name in enumerate(['Body_A','Head_A','Hat_A','Hand_L','Foot_R','Hand_R','Foot_L']):
    obj=bpy.data.objects[name];kdt=KDTree(len(obj.data.vertices))
    for j,v in enumerate(obj.data.vertices): kdt.insert(v.co,j)
    kdt.balance()
    for i,p in enumerate(newPoints[:len(points)]):
        if labels[i]>=0: continue
        _,_,distance=kdt.find(Vector(p))
        if distance<0.000002:labels[i]=part
labels[len(points):]=2
assert (labels>=0).all(), ('unidentified source vertices',int((labels<0).sum()))
np.save(work/'Data_ShunziV5Parts.npy',labels)
assert np.array_equal(newPosition[:len(points)][~capMask].astype('<f4'),position[~capMask])
assert np.array_equal(newNormal[:len(points)][~capMask].astype('<f4'),normal[~capMask])
assert np.array_equal(newUv[:len(points)],uv)

sc['ShunziProjectRoot']=str(root)
bpy.ops.wm.save_as_mainfile(filepath=str(work/'Scene_ShunziRevision_V5.blend'))
# Export the newly built GLB, never the mixed source/check scene.
before=set(bpy.data.objects)
chk=bpy.data.scenes.new('ShunziV5Export');bpy.context.window.scene=chk
with bpy.context.temp_override(scene=chk,view_layer=chk.view_layers[0]):bpy.ops.import_scene.gltf(filepath=str(output))
new=[o for o in bpy.data.objects if o not in before and o.type=='MESH']
assert len(new)==1
for o in chk.objects:o.select_set(False)
new[0].select_set(True);bpy.context.view_layer.objects.active=new[0]
# FBX needs actual texture paths; retain the original embedded bytes without re-encoding.
textureDir=work/'Textures';textureDir.mkdir(exist_ok=True)
imageIndex=0
for material in new[0].data.materials:
    for node in material.node_tree.nodes:
        if node.type=='TEX_IMAGE' and node.image:
            image=node.image
            if image.packed_file:
                imageBytes=bytes(image.packed_file.data)
                suffix='.jpg' if imageBytes[:2]==b'\xff\xd8' else '.png'
                destination=textureDir/f'Texture_ShunziV5Image{imageIndex}{suffix}'
                destination.write_bytes(imageBytes)
                image.filepath=str(destination)
                imageIndex+=1
bpy.ops.export_scene.fbx(filepath=str(assets/'Shunzi_Merged_V5.fbx'),use_selection=True,object_types={'MESH'},path_mode='COPY',embed_textures=True,axis_forward='-Z',axis_up='Y',add_leaf_bones=False,bake_anim=False)
bpy.ops.wm.save_as_mainfile(filepath=str(work/'Scene_ShunziRevision_V5.blend'))
report={'schema':1,'source':str(source),'output':str(output),'sourceSha256':hashlib.sha256(raw).hexdigest(),'outputSha256':hashlib.sha256(glb).hexdigest(),'triangles':len(newIndices),'vertices':len(newPosition),'capVerticesChanged':int(capMask.sum()),'liningVertices':len(extraPos),'liningTriangles':len(extraIndices),'nonCapPositionsUnchanged':True,'nonCapNormalsUnchanged':True,'existingUvsUnchanged':True,'embeddedImagesUnchanged':True,'crownM':float(newPoints[:,2].max()),'sourceHeadAboveChinMaxErrorM':headShapeError,'bandWidthIncrease':0.08}
(work/'Data_ShunziCapRevisionV5.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=1))
