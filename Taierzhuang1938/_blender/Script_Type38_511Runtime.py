"""Import the approved Type38 reduction and add the playable rear-sight notch.

Only the sight crosspiece changes. All 116 accepted embedded image payloads and
all other mesh accessors remain the source bytes. Original/high-poly files stay
in OneDrive. Run through scripts/Script_BlenderMcp.mjs start --batch.
"""
import bpy, os, json, struct, hashlib, copy
from pathlib import Path
import numpy as np
from mathutils import Matrix, Vector, Quaternion

repo=Path(os.environ['TYPE38_REPO_ROOT'])
base=Path(os.environ.get('TYPE38_AUDIT_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type38_511Audit_20261108'))
source=base/'Reduction68K_20261108/Exports/Model_Type38_511_Reduced68K.glb'
assert hashlib.sha256(source.read_bytes()).hexdigest()=='1abb1e89443bd420b1ff86eba80584ee20c87ce68a2969c7c4739cc038fd6f82'
work=repo/'tmp/Type38Integration';work.mkdir(parents=True,exist_ok=True)
out=repo/'Taierzhuang1938/Model/Type38_511';out.mkdir(parents=True,exist_ok=True)
def Read(p):
    b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),b[28+n:]
original,originalBin=Read(source)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source),merge_vertices=True)
head=next(o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('SourceObject')=='Exterior_ShortTransverseHead71')
head.data.calc_loop_triangles();before=len(head.data.loop_triangles)
bpy.ops.mesh.primitive_cube_add(size=1,location=(-.000284,.3081,.061))
cutter=bpy.context.object;cutter.name='SightNotchCutter';cutter.dimensions=(.0045,.024,.008)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
bpy.context.view_layer.objects.active=head
modifier=head.modifiers.new('PlayableRearSightNotch','BOOLEAN');modifier.operation='DIFFERENCE';modifier.solver='EXACT';modifier.object=cutter
bpy.ops.object.modifier_apply(modifier=modifier.name)
bpy.data.objects.remove(cutter,do_unlink=True)
modifier=head.modifiers.new('StableSightTriangles','TRIANGULATE')
bpy.ops.object.modifier_apply(modifier=modifier.name)
head.data.calc_loop_triangles();after=len(head.data.loop_triangles)
assert after!=before,(before,after)
for obj in bpy.context.selected_objects:obj.select_set(False)
head.select_set(True)
draft=work/'Model_SightNotch.glb'
bpy.ops.export_scene.gltf(filepath=str(draft),export_format='GLB',use_selection=True,export_yup=True,
    export_texcoords=True,export_normals=True,export_tangents=True,export_materials='NONE',export_extras=True,export_animations=False)
geometry,data=Read(draft)
def Worlds(doc):
    result={}
    def Walk(index,parent):
        n=doc['nodes'][index]
        if 'matrix' in n:m=Matrix([n['matrix'][i::4] for i in range(4)])
        else:
            q=n.get('rotation',[0,0,0,1]);m=Matrix.LocRotScale(Vector(n.get('translation',[0,0,0])),Quaternion((q[3],q[0],q[1],q[2])),Vector(n.get('scale',[1,1,1])))
        result[index]=parent@m
        for child in n.get('children',[]):Walk(child,result[index])
    for index in doc['scenes'][doc.get('scene',0)]['nodes']:Walk(index,Matrix.Identity(4))
    return result
oldNode=next(i for i,n in enumerate(original['nodes']) if n.get('extras',{}).get('SourceObject')=='Exterior_ShortTransverseHead71')
newNode=next(i for i,n in enumerate(geometry['nodes']) if n.get('extras',{}).get('SourceObject')=='Exterior_ShortTransverseHead71')
transform=Worlds(original)[oldNode].inverted()@Worlds(geometry)[newNode]
primitive=geometry['meshes'][geometry['nodes'][newNode]['mesh']]['primitives'][0]
payload=bytearray(originalBin);doc=copy.deepcopy(original)
widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4};types={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}
def AddAccessor(index,semantic):
    a=geometry['accessors'][index];v=geometry['bufferViews'][a['bufferView']];width=widths[a['type']];dtype=np.dtype(types[a['componentType']])
    array=np.ndarray((a['count'],width),dtype=dtype,buffer=data,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*dtype.itemsize),dtype.itemsize)).copy()
    if semantic=='POSITION':array=np.array([tuple(transform@Vector(p)) for p in array],dtype='<f4')
    elif semantic=='NORMAL':array=np.array([tuple((transform.to_3x3().inverted().transposed()@Vector(p)).normalized()) for p in array],dtype='<f4')
    elif semantic=='TANGENT':
        array=np.array([(*tuple((transform.to_3x3()@Vector(p[:3])).normalized()),p[3]) for p in array],dtype='<f4')
    while len(payload)%4:payload.append(0)
    viewIndex=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':len(payload),'byteLength':array.nbytes,'target':34963 if semantic=='INDEX' else 34962})
    payload.extend(array.tobytes())
    accessor={k:v for k,v in a.items() if k not in ['bufferView','byteOffset','min','max']}
    accessor.update(bufferView=viewIndex,min=array.min(axis=0).tolist(),max=array.max(axis=0).tolist())
    index=len(doc['accessors']);doc['accessors'].append(accessor);return index
oldPrimitive=doc['meshes'][doc['nodes'][oldNode]['mesh']]['primitives'][0]
attrs={name:AddAccessor(index,name) for name,index in primitive['attributes'].items()}
doc['meshes'][doc['nodes'][oldNode]['mesh']]['primitives']=[{'attributes':attrs,'indices':AddAccessor(primitive['indices'],'INDEX'),'material':oldPrimitive['material'],'mode':4}]
total=69454-before+after
doc['asset']['extras']={**doc['asset'].get('extras',{}),'runtimeTriangles':total,'rearSightNotchWidthM':.0045}
while len(payload)%4:payload.append(0)
doc['buffers']=[{'byteLength':len(payload)}]
j=json.dumps(doc,separators=(',',':')).encode('utf8');j+=b' '*((-len(j))%4)
result=struct.pack('<4sII',b'glTF',2,28+len(j)+len(payload))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(payload),0x004e4942)+payload
target=out/'Model_Type38_511.glb';target.write_bytes(result)
report={'schema':'Type38_511RuntimeSource','version':1,'generator':'_blender/Script_Type38_511Runtime.py',
    'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'runtimeSha256':hashlib.sha256(result).hexdigest(),
    'sourceTriangles':473796,'approvedReductionTriangles':69454,'triangles':total,'parts':45,'images':116,
    'adaptation':{'part':'Exterior_ShortTransverseHead71','sourceTriangles':before,'runtimeTriangles':after,'notchWidthM':.0045,'notchDepthM':.004},
    'reconstructionScope':'Dots作者外观与美术旧化；照门缺口、握持和动作接入为游戏适配，不据此认定滕县某支实物的细节。','historicalReferences':[]}
report['imagePayloads']=[]
for imageIndex,image in enumerate(original['images']):
    view=original['bufferViews'][image['bufferView']];start=view.get('byteOffset',0)
    raw=originalBin[start:start+view['byteLength']]
    report['imagePayloads'].append({'index':imageIndex,'name':image.get('name'),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
(out/'Data_Type38_511.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print('TYPE38_RUNTIME_BUILT',json.dumps(report,ensure_ascii=False),flush=True)
