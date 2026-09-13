"""Run in the reviewed NRA05 Blender file. Preserve the shipped body GLB byte-for-byte
except appended face joints, replacement skin weights and three oral primitives.
Blender source: OneDrive/AI/Models/Blender/Taierzhuang1938/Nra05FacialTalk_20260913.
"""
import bpy, json, struct, math, os
from mathutils import Matrix, Quaternion, Vector, kdtree

repo = os.environ.get('NRA_FACIAL_REPO', r'C:\Users\Bentl\Documents\Program\bentleyblanks_Codex_Nra05FacialTalk_20260913')
directory = os.path.join(repo, 'Taierzhuang1938', 'Model', 'Character')
scene = bpy.context.scene
assert scene.name == 'Scene_Nra05FacialTalk'
rig = scene.objects['Rig_LugouCharacter']; body = scene.objects['John_Body003']
names = [b.name for b in rig.data.bones if b.name.startswith('Face_')]
assert len(names) == 11
playing = bpy.context.screen.is_animation_playing
if playing: bpy.ops.screen.animation_play()
frame = scene.frame_current
action = rig.animation_data.action or bpy.data.actions['Animation_Nra05Speaking']
rig.animation_data.action = action

def Trs(matrix):
    p,q,s = matrix.decompose()
    return {'translation':list(p),'rotation':[q.x,q.y,q.z,q.w],'scale':list(s)}

# Sample only the authored facial channels. Body/head motion stays with game clips.
poses = {}
for label,f in [('Open',140),('Wide',44),('Round',55),('Blink',74),('Rest',1)]:
    scene.frame_set(f); bpy.context.view_layer.update()
    poses[label] = {name:Trs(rig.pose.bones[name].parent.matrix.inverted() @ rig.pose.bones[name].matrix) for name in names}
rig.animation_data.action = None
for bone in rig.pose.bones: bone.matrix_basis.identity()
bpy.context.view_layer.update()
conversion = Matrix.Rotation(-math.pi/2,4,'X')
bytesIn = open(os.path.join(directory,'Model_LugouNra05.glb'),'rb').read()
jsonLength = struct.unpack_from('<I',bytesIn,12)[0]
doc = json.loads(bytesIn[20:20+jsonLength]); binary = bytearray(bytesIn[28+jsonLength:])
parents = {child:i for i,node in enumerate(doc['nodes']) for child in node.get('children',[])}
worlds = {}
def World(index):
    if index in worlds:return worlds[index]
    node=doc['nodes'][index]
    if 'matrix' in node:local=Matrix([node['matrix'][i:i+4] for i in range(0,16,4)]).transposed()
    else:
        x,y,z,w=node.get('rotation',[0,0,0,1])
        local=Matrix.LocRotScale(Vector(node.get('translation',[0,0,0])),Quaternion((w,x,y,z)),Vector(node.get('scale',[1,1,1])))
    worlds[index]=World(parents[index])@local if index in parents else local
    return worlds[index]
nodeByName={n.get('name'):i for i,n in enumerate(doc['nodes'])}
meshIndex=next(i for i,n in enumerate(doc['nodes']) if n.get('mesh')==0)
meshWorld=World(meshIndex)
# This shipped GLB bakes positions in world metres and inverse binds in that
# same space. Preserve its existing convention (Blender imports it re-localized).
toMesh=conversion
skin=doc['skins'][0]

def ReadAccessor(index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    fmt={5126:'f',5123:'H',5125:'I',5121:'B'}[a['componentType']]
    size=struct.calcsize(fmt)*count;start=v.get('byteOffset',0)+a.get('byteOffset',0)
    return [struct.unpack_from('<'+fmt*count,binary,start+i*v.get('byteStride',size)) for i in range(a['count'])]

def Accessor(values,kind,component=5126):
    while len(binary)%4:binary.append(0)
    offset=len(binary);fmt={5126:'f',5123:'H',5125:'I'}[component]
    for row in values:binary.extend(struct.pack('<'+fmt*len(row),*row))
    view=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(binary)-offset})
    result={'bufferView':view,'componentType':component,'count':len(values),'type':kind}
    if kind=='VEC3':
        result['min']=[min(row[k] for row in values) for k in range(3)]
        result['max']=[max(row[k] for row in values) for k in range(3)]
    doc['accessors'].append(result);return len(doc['accessors'])-1

headWorld=World(nodeByName['Bip002 Head'])
blenderHead=conversion@rig.matrix_world@rig.data.bones['Bip002 Head'].matrix_local
headError=max(abs(headWorld[i][j]-blenderHead[i][j]) for i in range(4) for j in range(4))
assert headError<.0001, ('Head bind changed',headError)
ibm=ReadAccessor(skin['inverseBindMatrices'])
for name in names:
    bone=rig.data.bones[name];parent=nodeByName[bone.parent.name]
    world=conversion@rig.matrix_world@bone.matrix_local
    node={'name':name,**Trs(World(parent).inverted()@world)}
    index=len(doc['nodes']);doc['nodes'].append(node);nodeByName[name]=index;worlds[index]=world
    doc['nodes'][parent].setdefault('children',[]).append(index)
    skin['joints'].append(index)
    inverse=world.inverted()
    ibm.append(tuple(inverse[row][col] for col in range(4) for row in range(4)))
skin['inverseBindMatrices']=Accessor(ibm,'MAT4')
jointByName={doc['nodes'][node]['name']:i for i,node in enumerate(skin['joints'])}
tree=kdtree.KDTree(len(body.data.vertices))
for v in body.data.vertices:tree.insert(toMesh@body.matrix_world@v.co,v.index)
tree.balance()

def Weights(obj,vertex):
    items=sorted([(jointByName[obj.vertex_groups[g.group].name],g.weight) for g in vertex.groups
                  if obj.vertex_groups[g.group].name in jointByName and g.weight>1e-7],key=lambda x:-x[1])[:4]
    assert items
    total=sum(w for _,w in items)
    return tuple([i for i,_ in items]+[0]*(4-len(items))),tuple([w/total for _,w in items]+[0]*(4-len(items)))

matched=0;maxDistance=0
for primitive in doc['meshes'][0]['primitives']:
    js=[];ws=[]
    for point in ReadAccessor(primitive['attributes']['POSITION']):
        _,index,distance=tree.find(Vector(point));maxDistance=max(maxDistance,distance)
        assert distance<.001,('Source vertex unmatched',point,distance)
        j,w=Weights(body,body.data.vertices[index]);js.append(j);ws.append(w);matched+=1
    primitive['attributes']['JOINTS_0']=Accessor(js,'VEC4',5123)
    primitive['attributes']['WEIGHTS_0']=Accessor(ws,'VEC4')

oral={}
for obj in scene.objects:
    if obj.type!='MESH' or obj==body:continue
    category='Teeth' if obj.name.startswith('Mesh_Tooth') else 'Tongue' if obj.name=='Mesh_Tongue' else 'Cavity'
    oral.setdefault(category,[]).append(obj)
oralTriangles=0
for category,objects in oral.items():
    pos=[];norm=[];js=[];ws=[]
    for obj in objects:
        ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());data=ev.to_mesh();data.calc_loop_triangles()
        matrix=toMesh@ev.matrix_world;normalMatrix=matrix.to_3x3().inverted().transposed()
        for tri in data.loop_triangles:
            for index in tri.vertices:
                vertex=data.vertices[index]
                pos.append(tuple(matrix@vertex.co));norm.append(tuple((normalMatrix@vertex.normal).normalized()))
                j,w=Weights(obj,vertex);js.append(j);ws.append(w)
        ev.to_mesh_clear()
    color={'Cavity':[.008,.001,.002,1],'Teeth':[.30,.255,.19,1],'Tongue':[.12,.022,.027,1]}[category]
    material={'name':'Material_Facial'+category,'pbrMetallicRoughness':{'baseColorFactor':color,'metallicFactor':0,'roughnessFactor':.85},'doubleSided':True}
    # Keep a regular PBR material so the game's unified G-buffer/velocity paths apply.
    materialIndex=len(doc['materials']);doc['materials'].append(material)
    doc['meshes'][0]['primitives'].append({'attributes':{'POSITION':Accessor(pos,'VEC3'),'NORMAL':Accessor(norm,'VEC3'),
        'JOINTS_0':Accessor(js,'VEC4',5123),'WEIGHTS_0':Accessor(ws,'VEC4')},'material':materialIndex,'mode':4})
    oralTriangles+=len(pos)//3

doc['nodes'][meshIndex].setdefault('extras',{})['facialSource']='Nra05FacialTalk_20260913'
doc.setdefault('extras',{})['facialRig']={'schema':1,'source':'Animation_Nra05FacialTalk.blend','bones':names,'poses':poses}
doc['buffers'][0]['byteLength']=len(binary)
encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);binary+=b'\0'*((-len(binary))%4)
result=struct.pack('<5I',0x46546c67,2,28+len(encoded)+len(binary),len(encoded),0x4e4f534a)+encoded+struct.pack('<2I',len(binary),0x004e4942)+binary
target=os.path.join(directory,'Model_LugouNra05Facial.glb');open(target,'wb').write(result)
rig.animation_data.action=action;scene.frame_set(frame)
if playing:bpy.ops.screen.animation_play()
print(json.dumps({'output':target,'bytes':len(result),'originalNodesPreserved':len(nodeByName)-len(names),'faceBones':len(names),'matchedVertices':matched,'maxVertexMatchDistance':maxDistance,'headBindError':headError,'oralTriangles':oralTriangles}))
