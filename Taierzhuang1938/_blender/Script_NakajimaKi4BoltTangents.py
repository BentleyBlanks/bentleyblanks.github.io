"""MikkTSpace tangent corners for unchanged game wheel bolts; no source save."""
import bpy,pathlib,os,json,struct,numpy as np
repo=pathlib.Path(os.environ['KI4_REPO_ROOT']);asset=pathlib.Path(os.environ['KI4_ASSET_ROOT']);blob=(repo/'tmp/NakajimaKi4/ReferenceV30/Model_NakajimaKi4Gray.glb').read_bytes();length=struct.unpack_from('<I',blob,12)[0];g=json.loads(blob[20:20+length]);binary=blob[28+length:]
changed=set(json.loads((asset/'Evidence/Data_HardwareHighAo.json').read_text())['partNames']);parents={c:n['name'] for n in g['nodes'] for c in n.get('children',[])}
def Read(i):
    a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];dtype=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']]);w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    return np.ndarray((a['count'],w),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*dtype.itemsize),dtype.itemsize)).copy()
result={}
for ni,n in enumerate(g['nodes']):
    if 'mesh' not in n or not parents[ni].startswith('Pivot_Wheel'):continue
    p=g['meshes'][n['mesh']]['primitives'][0]
    if g['materials'][p['material']]['name']!='Material_OxidizedSteel':continue
    attrs={k:Read(v) for k,v in p['attributes'].items()};indices=Read(p['indices']).ravel();selected=[]
    for r in n['extras']['sourceDeltaParts']:
        rn=r.get('names') or [r['name']]
        if any(name in changed for name in rn):continue
        selected.extend(map(int,indices[r['firstIndex']:r['firstIndex']+r['indexCount']]))
    used=sorted(set(selected));remap={v:k for k,v in enumerate(used)};mesh=bpy.data.meshes.new('Temp_ActualBoltMikk');mesh.from_pydata([attrs['POSITION'][k] for k in used],[],[tuple(remap[v] for v in selected[k:k+3]) for k in range(0,len(selected),3)]);mesh.update();uv=mesh.uv_layers.new(name='UVMap')
    for loop in mesh.loops:uv.data[loop.index].uv=attrs['TEXCOORD_0'][used[loop.vertex_index]]
    for face in mesh.polygons:face.use_smooth=True
    mesh.normals_split_custom_set([tuple(attrs['NORMAL'][used[loop.vertex_index]]) for loop in mesh.loops]);mesh.calc_tangents(uvmap='UVMap');rows={}
    for i,face in enumerate(mesh.polygons):
        key=','.join(map(str,selected[i*3:i*3+3]));rows[key]=[value for k in face.loop_indices for value in [*mesh.loops[k].tangent,mesh.loops[k].bitangent_sign]]
    result[str(p['indices'])]=rows;bpy.data.meshes.remove(mesh)
(asset/'Evidence/Data_ActualBoltMikkTangents.json').write_text(json.dumps({'state':'ActualRetainedBoltMikkCornerTangents','byIndexAccessor':result,'scope':'Calculated by Blender MikkTSpace from exact existing game positions, custom normals and UV0. Per-corner output permits vertex splitting without changing any old triangle-corner attributes; audit scene never saved.'}),encoding='utf8')
print(json.dumps({'wheelGroups':len(result),'triangles':sum(map(len,result.values()))}))
