"""Conforming abrasion on existing contact and rolled-wing triangles.

Only material/index partitions change. No vertices, UVs, normals, tangents or
animation data move. Native sources show the same abrasion; canonical exports
restore base slots during geometry packaging, then apply abrasion afterwards.
"""
import json,struct,argparse,contextlib,importlib.util
from pathlib import Path
import numpy as np

NAME='Material_IsuzuAbradedSteel'
RUST_NAME='Material_IsuzuLipRust'
RUST_UV_SCALE=.75/.20
BASE=[.48,.50,.52,1]
ROUGHNESS_FACTOR=.45
PROFILE={'version':80,'layer':'Visible contact abrasion and broken oxidation along rolled wing lips','baseLinear':BASE,'roughnessMultiplierOnSteelOrm':ROUGHNESS_FACTOR,'geometryChangedByPartition':False,'rustBaseSrgb8':[102,59,32],'rustTrianglesPerRuntimeWing':8,'lipRustUvScale':RUST_UV_SCALE,'scope':'Artistic service wear at contact patches,bonnet seams,hinges and rolled edges;contact-patch enlargement belongs to the PBR source recipe,not this material partition. Not measured historical damage.'}

def FenderSelection(triangles):
    p=np.asarray(triangles,dtype=np.float64);centres=p.mean(axis=1);outer=np.abs(p[:,:,0]).max();lo=p[:,:,1].min();hi=p[:,:,1].max();span=np.ptp(p,axis=1)
    area=np.linalg.norm(np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0]),axis=1)/2
    candidates=np.where((np.abs(centres[:,0])>outer-.025)&(span[:,0]<.027)&(span[:,1]<.14)&(area<.0012)&(area>1e-9))[0]
    if len(candidates)<4:raise RuntimeError('Insufficient narrow outer-wing faces for abrasion')
    selected=set()
    for t in [.16,.37,.63,.83]:
        available=[i for i in candidates if int(i) not in selected]
        chosen=min(available,key=lambda i:abs(centres[i,1]-(lo+t*(hi-lo)))+.25*(outer-abs(centres[i,0])))
        selected.add(int(chosen))
    return selected

def FenderRustSelection(triangles,occupied,keys=None):
    p=np.asarray(triangles,dtype=np.float64);centres=p.mean(axis=1);outer=np.abs(p[:,:,0]).max();lo=p[:,:,1].min();hi=p[:,:,1].max();span=np.ptp(p,axis=1)
    area=np.linalg.norm(np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0]),axis=1)/2
    keys=list(range(len(p))) if keys is None else keys
    blocked={keys[i] for i in occupied};selected=set()
    candidates=[int(i) for i in np.where((np.abs(centres[:,0])>outer-.025)&(span[:,0]<.027)&(span[:,1]<.14)&(area<.0012)&(area>1e-9))[0] if keys[int(i)] not in blocked]
    for t in [.08,.20,.30,.44,.56,.70,.81,.93]:
        available=[i for i in candidates if keys[i] not in blocked]
        if not available:raise RuntimeError('Insufficient independent rolled-lip faces for local oxidation')
        chosen=min(available,key=lambda i:abs(centres[i,1]-(lo+t*(hi-lo)))+.25*(outer-abs(centres[i,0])))
        selected.add(chosen);blocked.add(keys[chosen])
    return selected

def ApplyNative(root,material,rustMaterial):
    import bpy
    names={int(k):v for k,v in root.get('SourcePartNames',{}).items()};wings={};wear=[]
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        mesh=obj.data;mesh.calc_loop_triangles();labels=mesh.attributes.get('_SOURCE_PART_ID')
        for tri in mesh.loop_triangles:
            part=names[int(round(labels.data[tri.vertices[0]].value))] if labels else obj.name
            if part.startswith('Wear_'):wear.append((obj,tri.polygon_index))
            elif part.startswith('FrontFender_RolledLip'):
                wings.setdefault(part,[]).append((obj,tri.polygon_index,[tuple(obj.matrix_world@mesh.vertices[i].co) for i in tri.vertices]))
    chosen=list(wear);rustChosen=[];wingRows=[]
    for part,faces in wings.items():
        triangles=[f[2] for f in faces];indices=FenderSelection(triangles);rust=FenderRustSelection(triangles,indices,[(id(f[0]),f[1]) for f in faces]);chosen.extend((faces[i][0],faces[i][1]) for i in indices);rustChosen.extend((faces[i][0],faces[i][1]) for i in rust);wingRows.append({'part':part,'selectedSourceTriangles':len(indices),'rustSourceFaces':len(rust)})
    if len(wings)!=2:raise RuntimeError('Both front wings required for native abrasion')
    for obj,index in set(chosen):
        slot=next((i for i,m in enumerate(obj.data.materials) if m==material),None)
        if slot is None:slot=len(obj.data.materials);obj.data.materials.append(material)
        obj.data.polygons[index].material_index=slot
    for obj,index in set(rustChosen):
        slot=next((i for i,m in enumerate(obj.data.materials) if m==rustMaterial),None)
        if slot is None:slot=len(obj.data.materials);obj.data.materials.append(rustMaterial)
        obj.data.polygons[index].material_index=slot
    root['MetalWearProfileJson']=json.dumps(PROFILE);return {'wearPolygons':len(set(wear)),'wings':wingRows}

@contextlib.contextmanager
def BaseMaterialExport(root):
    saved=[]
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        slots={i for i,m in enumerate(obj.data.materials) if m and m.name.startswith((NAME,RUST_NAME))}
        for face in obj.data.polygons:
            if face.material_index in slots:saved.append((face,face.material_index));face.material_index=0
    try:yield
    finally:
        for face,index in saved:face.material_index=index

def ApplyGlb(path):
    spec=importlib.util.spec_from_file_location('IsuzuWeathering',Path(__file__).with_name('Script_IsuzuType94TruckWeathering.py'));w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
    raw,g,data=w.ReadGlb(path);original=data;steel=next(m for m in g['materials'] if m['name']=='Material_IsuzuSteel');material=json.loads(json.dumps(steel));material['name']=NAME
    pbr=material['pbrMetallicRoughness'];pbr.pop('baseColorTexture',None);pbr['baseColorFactor']=BASE;pbr['roughnessFactor']=pbr.get('roughnessFactor',1)*ROUGHNESS_FACTOR;pbr['metallicFactor']=1
    material.setdefault('extras',{})['AbrasionProfileJson']=json.dumps(PROFILE);matIndex=len(g['materials']);g['materials'].append(material)
    rustMaterial=json.loads(json.dumps(next(m for m in g['materials'] if m['name']=='Material_IsuzuRust')));rustMaterial['name']=RUST_NAME
    for info in [rustMaterial['pbrMetallicRoughness'].get('baseColorTexture'),rustMaterial['pbrMetallicRoughness'].get('metallicRoughnessTexture'),rustMaterial.get('normalTexture'),rustMaterial.get('occlusionTexture')]:
        if info is not None:info.setdefault('extensions',{})['KHR_texture_transform']={'scale':[RUST_UV_SCALE,RUST_UV_SCALE],'offset':[0,1-RUST_UV_SCALE]}
    rustMaterial.setdefault('extras',{})['LocalizedOxideProfileJson']=json.dumps(PROFILE);rustIndex=len(g['materials']);g['materials'].append(rustMaterial);g['extensionsUsed']=list(dict.fromkeys(g.get('extensionsUsed',[])+['KHR_texture_transform']))
    root=next(n for n in g['nodes'] if n.get('name')=='IsuzuType94Truck');names={int(k):v for k,v in root.get('extras',{}).get('SourcePartNames',{}).items()};records=[];wings={}
    def Access(index):
        a=g['accessors'][index];v=g['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];size=np.dtype(dtype).itemsize
        return np.ndarray((a['count'],width),dtype=dtype,buffer=original,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*size),size)).copy()
    def Matrix(n):
        if 'matrix' in n:return np.array(n['matrix']).reshape(4,4).T
        x,y,z,q=n.get('rotation',[0,0,0,1]);m=np.eye(4);m[:3,:3]=np.array([[1-2*(y*y+z*z),2*(x*y-z*q),2*(x*z+y*q)],[2*(x*y+z*q),1-2*(x*x+z*z),2*(y*z-x*q)],[2*(x*z-y*q),2*(y*z+x*q),1-2*(x*x+y*y)]])@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0]);return m
    def Walk(i,parent):
        node=g['nodes'][i];matrix=parent@Matrix(node)
        if 'mesh' in node:
            for primitive in g['meshes'][node['mesh']]['primitives']:
                indices=Access(primitive['indices']).ravel().reshape(-1,3);positions=Access(primitive['attributes']['POSITION']);world=positions@matrix[:3,:3].T+matrix[:3,3];world=world[:,[0,2,1]]*np.array([1,-1,1]);ids=Access(primitive['attributes']['_SOURCE_PART_ID']).ravel() if '_SOURCE_PART_ID' in primitive['attributes'] else None
                parts=[names[int(round(ids[t[0]]))] if ids is not None else node.get('name','') for t in indices];record={'primitive':primitive,'indices':indices,'selected':set(),'rust':set(),'node':node.get('name'),'mesh':g['meshes'][node['mesh']]};records.append(record)
                for t,part in enumerate(parts):
                    if part.startswith('Wear_'):record['selected'].add(t)
                    elif part.startswith('FrontFender_RolledLip'):wings.setdefault(part,[]).append((record,t,world[indices[t]].tolist()))
        for child in node.get('children',[]):Walk(child,matrix)
    for i in g['scenes'][g.get('scene',0)]['nodes']:Walk(i,np.eye(4))
    wingRows=[]
    for part,faces in wings.items():
        triangles=[f[2] for f in faces];selected=FenderSelection(triangles);rust=FenderRustSelection(triangles,selected)
        for i in selected:faces[i][0]['selected'].add(faces[i][1])
        for i in rust:faces[i][0]['rust'].add(faces[i][1])
        wingRows.append({'part':part,'triangles':len(selected),'rustTriangles':len(rust),'areaM2':float(sum(np.linalg.norm(np.cross(np.array(faces[i][2])[1]-faces[i][2][0],np.array(faces[i][2])[2]-faces[i][2][0]))/2 for i in selected))})
    if len(wings)!=2:raise RuntimeError('Both actual GLB wings required')
    def IndexAccessor(indices,previous):
        nonlocal data
        flat=np.asarray(indices).ravel();maximum=int(flat.max());kind=5123 if maximum<=65535 else 5125;payload=flat.astype('<u2' if kind==5123 else '<u4').tobytes();data+=b'\0'*((-len(data))%4);offset=len(data);data+=payload
        view=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(payload),'target':34963});index=len(g['accessors']);g['accessors'].append({'bufferView':view,'componentType':kind,'count':len(flat),'type':'SCALAR','min':[int(flat.min())],'max':[maximum]});return index
    rows=[]
    for record in records:
        selected=record['selected'];rust=record['rust']
        if not selected and not rust:continue
        primitive=record['primitive'];indices=record['indices'];base=json.loads(json.dumps(primitive));keep=np.array([i not in selected and i not in rust for i in range(len(indices))]);replacements=[]
        if keep.any():primitive['indices']=IndexAccessor(indices[keep],primitive['indices'])
        for chosen,index in [(selected,matIndex),(rust,rustIndex)]:
            if not chosen:continue
            mask=np.array([i in chosen for i in range(len(indices))]);part=json.loads(json.dumps(base));part['indices']=IndexAccessor(indices[mask],base['indices']);part['material']=index;replacements.append(part)
        if not keep.any():primitive.update(replacements.pop(0))
        record['mesh']['primitives'].extend(replacements);rows.append({'node':record['node'],'abradedTriangles':len(selected),'rustTriangles':len(rust)})
    root.setdefault('extras',{})['MetalWearProfileJson']=json.dumps(PROFILE);w.WriteGlb(path,g,data)
    return {'profile':PROFILE,'originalAttributeBinPrefixRetained':data.startswith(original),'abradedTriangles':sum(r['abradedTriangles'] for r in rows),'rustLipTriangles':sum(r['rustTriangles'] for r in rows),'wings':wingRows,'rows':rows,'materialIndex':matIndex,'rustLipMaterialIndex':rustIndex}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--glb',required=True);p.add_argument('--report');args=p.parse_args();report=ApplyGlb(args.glb)
    if args.report:Path(args.report).write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    print(json.dumps({k:v for k,v in report.items() if k!='rows'}),flush=True)
