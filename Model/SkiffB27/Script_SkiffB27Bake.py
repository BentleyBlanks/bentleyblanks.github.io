"""Source-driven B27 repair/export without retriangulating the authored GLB.

Run inside Blender through scripts/Script_BlenderMcp.mjs exec. Initialize once
from the preserved B27 source/template; later exports need only the packed final
blend and this directory. The blend contains the integrity-checked original GLB,
original source coordinates and record/corner correspondence, not a second
ordinary glTF export. No Linux paths, subprocess Blender, flock or paid API.
"""
import argparse
import base64
import copy
import hashlib
import json
import math
import sys
import zlib
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from Script_SkiffB27Pack import GLB, EncodeTemplate, DecodeTemplate

Center = np.array([.00020641088485717773, -.06716883182525635, -.14005334675312042])
Scale = .8948437418327958
Axis = np.array([[-1., 0, 0], [0, 0, 1], [0, 1, 0]])


def PackJson(value):
    return base64.b64encode(zlib.compress(json.dumps(value,separators=(',',':')).encode(),9)).decode()


def UnpackJson(value):
    return json.loads(zlib.decompress(base64.b64decode(value)))


def SetText(name, value):
    text = bpy.data.texts.get(name) or bpy.data.texts.new(name)
    text.clear()
    if name.startswith('Data_'):
        value='\n'.join(value[i:i+2048] for i in range(0,len(value),2048))
    text.write(value)


def RuntimePositions(obj):
    return (np.array([(obj.matrix_world @ v.co)[:] for v in obj.data.vertices])-Center) @ Axis.T * Scale


def SetRuntimePositions(obj, points):
    inverse = obj.matrix_world.inverted()
    for vertex, point in zip(obj.data.vertices, points):
        vertex.co = inverse @ Vector(Axis.T @ point / Scale + Center)


def WidthSlope(z,stations,factors):
    index=int(np.clip(np.searchsorted(stations,z,side='right')-1,0,len(stations)-2))
    return (factors[index+1]-factors[index])/(stations[index+1]-stations[index])


def RoleImageNode(material,role):
    shader=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    socket=shader.inputs[{'Base':'Base Color','Normal':'Normal','Orm':'Roughness'}[role]]
    def Walk(inputSocket):
        for link in inputSocket.links:
            node=link.from_node
            if node.type=='TEX_IMAGE':return node
            for child in node.inputs:
                found=Walk(child)
                if found:return found
        return None
    result=Walk(socket);assert result is not None,(material.name,role)
    return result


def CreateCorrespondence(glb, objects):
    snapshot={};lookup=[];uvs={}
    for obj in objects:
        positions=RuntimePositions(obj)
        snapshot[obj.name]={'local':[list(v.co) for v in obj.data.vertices],
            'runtime':positions.tolist(),'matrix':np.array(obj.matrix_world).tolist(),
            'polygons':[list(p.vertices) for p in obj.data.polygons],
            'uv':[list(v.uv) for v in obj.data.uv_layers.active.data] if obj.data.uv_layers.active else []}
        snapshot[obj.name]['cornerNormals']=[list(n.vector) for n in obj.data.corner_normals]
        for vertex, point in zip(obj.data.vertices,positions):lookup.append((obj.name,vertex.index,point))
        if obj.data.uv_layers.active:
            for loop in obj.data.loops:
                u,v=obj.data.uv_layers.active.data[loop.index].uv
                uvs.setdefault((obj.name,loop.vertex_index),[]).append((loop.index,np.array([u,1-v])))
    tree=KDTree(len(lookup))
    for index,(_,_,point) in enumerate(lookup):tree.insert(Vector(point),index)
    tree.balance();maps={}
    for mi,pi,_,primitive in glb.Primitives():
        positions=glb.Accessor(primitive['attributes']['POSITION'])
        uv=glb.Accessor(primitive['attributes']['TEXCOORD_0'])
        rows=[]
        for point,tex in zip(positions,uv):
            candidates=tree.find_range(Vector(point),3e-6)
            assert candidates,'Original source/runtime correspondence lost'
            def Score(candidate):
                _,index,distance=candidate;name,vi,_=lookup[index]
                score=min((np.linalg.norm(t-tex) for _,t in uvs.get((name,vi),[])),default=1e6)
                return score,distance,index
            _,index,_=min(candidates,key=Score);name,vi,_=lookup[index]
            loops=uvs.get((name,vi),[])
            li=min(loops,key=lambda entry:np.linalg.norm(entry[1]-tex))[0] if loops else -1
            rows.append([name,vi,li])
        maps[f'{mi}:{pi}']=rows
    return {'snapshot':snapshot,'maps':maps}


def EndPolygons(obj, positions):
    """Select real short end faces, never the long ribbon faces of a curved rib."""
    selected=[]
    if obj.name.startswith('BentRib'):
        for polygon in obj.data.polygons:
            points=positions[list(polygon.vertices)];center=points.mean(0)
            side=positions[positions[:,0]*(1 if center[0]>0 else -1)>0]
            normal=np.cross(points[1]-points[0],points[2]-points[0]);normal/=max(np.linalg.norm(normal),1e-20)
            if len(side) and center[1]>side[:,1].max()-.025 and normal[1]>.42:selected.append(polygon.index)
    elif obj.name.startswith('BrokenThwart'):
        low,high=positions[:,0].min(),positions[:,0].max()
        for polygon in obj.data.polygons:
            points=positions[list(polygon.vertices)];center=points.mean(0)
            normal=np.cross(points[1]-points[0],points[2]-points[0]);normal/=max(np.linalg.norm(normal),1e-20)
            if abs(normal[0])>.6 and min(center[0]-low,high-center[0])<.028:selected.append(polygon.index)
    return selected


def SliceInnerWidth(snapshot,z):
    widths=[]
    for name in ['HullStrake-1_0_0','HullStrake1_0_0']:
        record=snapshot[name];p=np.array(record['runtime']);obj=bpy.data.objects[name]
        obj.data.calc_loop_triangles();tri=p[np.array([t.vertices[:] for t in obj.data.loop_triangles])]
        points=[]
        for a,b in [(0,1),(1,2),(2,0)]:
            start=tri[:,a];end=tri[:,b];mask=(start[:,2]-z)*(end[:,2]-z)<=0
            mask&=np.abs(end[:,2]-start[:,2])>1e-9
            t=(z-start[mask,2])/(end[mask,2]-start[mask,2])
            points.extend(start[mask]+t[:,None]*(end[mask]-start[mask]))
        widths.append(float(np.abs(np.array(points)[:,0]).min()))
    return max(widths)+.005


def SliceSoleWidth(obj,positions,z):
    obj.data.calc_loop_triangles()
    triangles=positions[np.array([t.vertices[:] for t in obj.data.loop_triangles])]
    values=[]
    for a,b in [(0,1),(1,2),(2,0)]:
        start,end=triangles[:,a],triangles[:,b]
        mask=(start[:,2]-z)*(end[:,2]-z)<=0
        mask&=np.abs(end[:,2]-start[:,2])>1e-9
        t=(z-start[mask,2])/(end[mask,2]-start[mask,2])
        values.extend(np.abs(start[mask,0]+t*(end[mask,0]-start[mask,0])))
    if not values:
        values=np.abs(positions[np.argsort(np.abs(positions[:,2]-z))[:8],0]).tolist()
    return max(values)


def RepairGeometry(metadata,objects,recipe):
    byName={o.name:o for o in objects};snapshot=metadata['snapshot'];changes=[]
    for item in recipe:
        obj=byName[item['object']];positions=RuntimePositions(obj)
        SetRuntimePositions(obj,positions+np.array(item['runtimeDelta']))
        changes.append(item)
    keel=byName['KeelSole'];original=np.array(snapshot[keel.name]['runtime'])
    stations=np.linspace(original[:,2].min(),original[:,2].max(),81)
    targets=np.array([SliceInnerWidth(snapshot,float(z)) for z in stations])
    # Normalize each existing transverse ring. The sole overlaps the inner
    # garboard edges by 5mm; neither side silhouette nor damage is moved.
    ringWidths=np.array([SliceSoleWidth(keel,original,float(z)) for z in stations])
    factors=np.maximum(1.,targets/ringWidths)
    custom=np.asarray(snapshot[keel.name]['cornerNormals'])
    fixed=original.copy();fixed[:,0]*=np.interp(original[:,2],stations,factors)
    SetRuntimePositions(keel,fixed)
    keel.data.update();bpy.context.view_layer.update()
    metadata['keel']={'stations':stations.tolist(),'factors':factors.tolist(),
        'overlapM':.005,'maximumVertexMoveM':float(np.linalg.norm(fixed-original,axis=1).max())}
    # Apply the same inverse deformation Jacobian to source custom normals.
    localJ=[]
    world=np.array(keel.matrix_world.to_3x3())
    for point in original:
        factor=np.interp(point[2],stations,factors);gradient=WidthSlope(point[2],stations,factors)
        runtimeJ=np.eye(3);runtimeJ[0,0]=factor;runtimeJ[0,2]=point[0]*gradient
        localJ.append(np.linalg.inv(world) @ Axis.T @ runtimeJ @ Axis @ world)
    out=[]
    for loop,normal in zip(keel.data.loops,custom):
        n=np.linalg.inv(localJ[loop.vertex_index]).T@normal;out.append((n/np.linalg.norm(n)).tolist())
    # Legacy INT16_2D custom normals lose up to .2 degrees on narrow normal
    # fans. Blender 5.2 also supports native FLOAT_VECTOR corner normals (the
    # Set Mesh Normal node writes this same attribute). Preserve the actual
    # inverse-J result, without a modifier or relaxed acceptance threshold.
    attribute=keel.data.attributes.get('custom_normal')
    if attribute and attribute.data_type!='FLOAT_VECTOR':
        keel.data.attributes.remove(attribute);attribute=None
    if attribute is None:attribute=keel.data.attributes.new(name='custom_normal',type='FLOAT_VECTOR',domain='CORNER')
    attribute.data.foreach_set('vector',np.asarray(out,dtype='float32').reshape(-1))
    keel.data.update()
    metadata['nailChanges']=changes


def PrepareMaterials(metadata,objects,products):
    wood=bpy.data.materials['Material_StrandedSkiffWeatheredWood']
    end=bpy.data.materials['Material_StrandedSkiffBareInnerWood']
    metadata['endPolygons']={};metadata['uvScaleObjects']=[]
    for obj in objects:
        positions=RuntimePositions(obj);selected=EndPolygons(obj,positions)
        metadata['endPolygons'][obj.name]=selected
        # Keep 4 author material identities. BareInnerWood is now end-grain;
        # its former long faces use the existing weathered side-grain set.
        for polygon in obj.data.polygons:
            if obj.data.materials[polygon.material_index]==end:
                if wood.name not in obj.data.materials:obj.data.materials.append(wood)
                polygon.material_index=list(obj.data.materials).index(wood)
        if selected:
            if end.name not in obj.data.materials:obj.data.materials.append(end)
            for index in selected:obj.data.polygons[index].material_index=list(obj.data.materials).index(end)
        if obj.name.startswith('BentRib'):
            metadata['uvScaleObjects'].append(obj.name)
            for uv in obj.data.uv_layers.active.data:uv.uv*=1.85
        # Project each short end in a stable plane shared by the complete
        # ragged cap; independently phase ends to avoid repeated striped cuts.
        if selected:
            axes=(0,2) if obj.name.startswith('BentRib') else (1,2)
            digest=int(hashlib.sha256(obj.name.encode()).hexdigest()[:8],16)
            phase=np.array([.18+(digest%97)/97*.30,.18+((digest//97)%89)/89*.30])
            center=positions.mean(0)[list(axes)]
            for index in selected:
                polygon=obj.data.polygons[index]
                for li in polygon.loop_indices:
                    vi=obj.data.loops[li].vertex_index
                    tex=(positions[vi,list(axes)]-center)*3.5+phase
                    obj.data.uv_layers.active.data[li].uv=(tex[0],1-tex[1])
    bindings={}
    for role,product in products.items():
        image=bpy.data.images.load(str(product['path']),check_existing=False)
        image.name=f'Texture_SkiffB27EndGrain{role}'
        image.colorspace_settings.name='sRGB' if role=='Base' else 'Non-Color';image.pack()
        node=RoleImageNode(end,role)
        node.image=image;bindings[role]=image.name
    metadata['endImages']=bindings


def SyncSourceMaterials(metadata,objects,original):
    """The archived blend had material-slot drift; runtime provenance is authority."""
    byName={o.name:o for o in objects};assigned={};vertexPolygons={}
    sourcePoints={name:np.asarray(data['runtime']) for name,data in metadata['snapshot'].items()}
    for name,obj in byName.items():
        lookup={}
        for polygon in obj.data.polygons:
            for vi in polygon.vertices:lookup.setdefault(vi,set()).add(polygon.index)
        vertexPolygons[name]=lookup
    for mi,pi,_,primitive in original.Primitives():
        mapping=metadata['maps'][f'{mi}:{pi}'];points=original.Accessor(primitive['attributes']['POSITION'])
        for ti,triangle in enumerate(original.Accessor(primitive['indices']).reshape(-1,3)):
            name=mapping[int(triangle[0])][0];obj=byName[name];vertices=[mapping[int(i)][1] for i in triangle]
            candidateIds=set.intersection(*(vertexPolygons[name][vi] for vi in vertices))
            normal=np.cross(points[triangle[1]]-points[triangle[0]],points[triangle[2]]-points[triangle[0]])
            def Score(poly):
                p=sourcePoints[name][list(poly.vertices)]
                n=np.cross(p[1]-p[0],p[2]-p[0]);n/=max(np.linalg.norm(n),1e-20)
                return -float(np.dot(n,normal)),poly.index
            index=next(iter(candidateIds)) if len(candidateIds)==1 else min(candidateIds,key=lambda i:Score(obj.data.polygons[i]))
            polygon=obj.data.polygons[index]
            isEnd=polygon.index in metadata['endPolygons'].get(name,[])
            material=3 if isEnd else (2 if primitive['material']==3 else primitive['material'])
            key=(name,polygon.index)
            assert key not in assigned or assigned[key]==material,(key,assigned.get(key),material)
            assigned[key]=material
    for (name,index),material in assigned.items():
        obj=byName[name];mat=bpy.data.materials[original.j['materials'][material]['name']]
        if mat.name not in obj.data.materials:obj.data.materials.append(mat)
        obj.data.polygons[index].material_index=list(obj.data.materials).index(mat)
    metadata['sourceMaterialAssignmentsSynchronizedToRuntimeTriangles']=len(assigned)


def AddAccessor(glb,array,definition):
    array=np.ascontiguousarray(array);glb.payload.extend(b'\0'*(-len(glb.payload)%4))
    view=len(glb.j['bufferViews']);glb.j['bufferViews'].append({'buffer':0,'byteOffset':len(glb.payload),'byteLength':array.nbytes})
    glb.payload.extend(array.tobytes());ac=copy.deepcopy(definition);ac['bufferView']=view;ac.pop('byteOffset',None);ac['count']=len(array)
    if 'min' in ac:ac['min']=array.min(0).tolist()
    if 'max' in ac:ac['max']=array.max(0).tolist()
    result=len(glb.j['accessors']);glb.j['accessors'].append(ac);return result


def Export(output):
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    metadata=UnpackJson(bpy.data.texts['Data_SkiffB27Correspondence'].as_string())
    original=GLB(DecodeTemplate(bpy.data.texts['Data_SkiffB27Template'].as_string()));glb=GLB(bytes(original.Serialize()))
    originalDefs=copy.deepcopy(original.j['accessors']);glb.j['accessors']=[]
    objects={o.name:o for o in bpy.data.collections['StrandedSkiffA'].objects if o.type=='MESH'}
    assert set(objects)==set(metadata['snapshot']),'Asset object membership changed'
    for name,obj in objects.items():
        assert np.array_equal(np.array(obj.matrix_world),np.array(metadata['snapshot'][name]['matrix'])),name+' matrix changed'
        assert [list(p.vertices) for p in obj.data.polygons]==metadata['snapshot'][name]['polygons'],name+' topology changed'
    positions={name:RuntimePositions(o) for name,o in objects.items()};snapshot=metadata['snapshot']
    vertexPolygons={}
    for name,obj in objects.items():
        lookup={}
        for polygon in obj.data.polygons:
            for vi in polygon.vertices:lookup.setdefault(vi,set()).add(polygon.index)
        vertexPolygons[name]=lookup
    buckets={i:{'attributes':{},'definitions':{},'records':[],'triangles':[],'indices':[],
        'changedTangentRecords':[],'changedNormalRecords':[],'lookup':{}} for i in range(4)}
    capTriangles=[];keelSourceRecords=[];maxSourceError=0
    for mi,pi,_,primitive in original.Primitives():
        mapping=metadata['maps'][f'{mi}:{pi}'];attrs={key:original.Accessor(ai).copy() for key,ai in primitive['attributes'].items()}
        keelSourceRecords.extend([[mi,pi,ri] for ri,row in enumerate(mapping) if row[0]=='KeelSole'])
        indices=original.Accessor(primitive['indices']).reshape(-1,3)
        for ti,tri in enumerate(indices):
            owners={mapping[int(ri)][0] for ri in tri};assert len(owners)==1,(mi,pi,ti,owners)
            name=next(iter(owners));obj=objects[name];vertices=[mapping[int(ri)][1] for ri in tri]
            # Runtime triangles keep authored diagonals. Find their native
            # polygon by vertex membership rather than Blender tessellation.
            polygonIds=set.intersection(*(vertexPolygons[name][vi] for vi in vertices))
            assert polygonIds,(name,vertices)
            reference=attrs['POSITION'][tri]
            referenceNormal=np.cross(reference[1]-reference[0],reference[2]-reference[0])
            def PolygonScore(index):
                poly=obj.data.polygons[index]
                p=np.array(snapshot[name]['runtime'])[list(poly.vertices)]
                n=np.cross(p[1]-p[0],p[2]-p[0]);n/=max(np.linalg.norm(n),1e-20)
                return -float(np.dot(n,referenceNormal)),index
            polygonIndex=next(iter(polygonIds)) if len(polygonIds)==1 else min(polygonIds,key=PolygonScore)
            polygon=obj.data.polygons[polygonIndex]
            isEnd=polygon.index in metadata['endPolygons'].get(name,[])
            sourceMaterial=obj.data.materials[polygon.material_index].name
            material=3 if isEnd else (2 if primitive['material']==3 else primitive['material'])
            assert sourceMaterial==original.j['materials'][material]['name'],(name,polygon.index,sourceMaterial,material)
            bucket=buckets[material]
            if isEnd:capTriangles.append([mi,pi,ti])
            cornerValues=[]
            for ri in tri:
                ri=int(ri);_,vi,li=mapping[ri];value={key:array[ri].copy() for key,array in attrs.items()}
                if obj.data.uv_layers.active:
                    li=next(l for l in polygon.loop_indices if obj.data.loops[l].vertex_index==vi)
                delta=positions[name][vi]-np.array(snapshot[name]['runtime'][vi])
                if np.linalg.norm(delta)>1e-9:value['POSITION']+=delta
                normalChanged=False;tangentChanged=False
                if name=='KeelSole':
                    keel=metadata['keel'];old=attrs['POSITION'][ri].astype(float);factor=np.interp(old[2],keel['stations'],keel['factors'])
                    grad=WidthSlope(old[2],keel['stations'],keel['factors'])
                    jac=np.eye(3);jac[0,0]=factor;jac[0,2]=old[0]*grad
                    n=np.linalg.inv(jac).T@value['NORMAL'];n/=np.linalg.norm(n);value['NORMAL']=n.astype('<f4')
                    t=jac@value['TANGENT'][:3];t-=n*np.dot(t,n);value['TANGENT'][:3]=t/np.linalg.norm(t)
                    normalChanged=True;tangentChanged=True
                if li>=0:
                    u,v=obj.data.uv_layers.active.data[li].uv
                    oldU,oldV=snapshot[name]['uv'][li]
                    value['TEXCOORD_0']+=np.array([u-oldU,oldV-v])
                if isEnd:
                    li=next(l for l in polygon.loop_indices if obj.data.loops[l].vertex_index==vi)
                    u,v=obj.data.uv_layers.active.data[li].uv;value['TEXCOORD_0']=np.array([u,1-v],dtype='<f4');tangentChanged=True
                cornerValues.append((ri,value,normalChanged,tangentChanged))
            if isEnd:
                p=np.array([v[1]['POSITION'] for v in cornerValues]);uv=np.array([v[1]['TEXCOORD_0'] for v in cornerValues])
                e1,e2=p[1]-p[0],p[2]-p[0];d1,d2=uv[1]-uv[0],uv[2]-uv[0];det=d1[0]*d2[1]-d1[1]*d2[0]
                assert abs(det)>1e-12,(name,ti,'end UV degeneracy')
                tangent=(e1*d2[1]-e2*d1[1])/det;bitangent=(e2*d1[0]-e1*d2[0])/det
                for _,value,_,_ in cornerValues:
                    n=value['NORMAL'];t=tangent-n*np.dot(n,tangent);t/=np.linalg.norm(t)
                    value['TANGENT']=np.array([*t,1 if np.dot(np.cross(n,t),bitangent)>0 else -1],dtype='<f4')
            for ri,value,nc,tc in cornerValues:
                key=(mi,pi,ri,*tuple(value['TEXCOORD_0']),*(tuple(value['TANGENT']) if isEnd else ()))
                if key not in bucket['lookup']:
                    idx=len(bucket['records']);bucket['lookup'][key]=idx;bucket['records'].append([mi,pi,ri])
                    if nc:bucket['changedNormalRecords'].append(idx)
                    if tc:bucket['changedTangentRecords'].append(idx)
                    for semantic,array in value.items():
                        bucket['attributes'].setdefault(semantic,[]).append(array)
                        bucket['definitions'][semantic]=originalDefs[primitive['attributes'][semantic]]
                bucket['indices'].append(bucket['lookup'][key])
            bucket['triangles'].append([mi,pi,ti])
    newPrimitives=[];provenance=[]
    for material,bucket in buckets.items():
        attributes={key:AddAccessor(glb,np.array(values,dtype=original.Accessor(original.j['meshes'][bucket['records'][0][0]]['primitives'][bucket['records'][0][1]]['attributes'][key]).dtype),bucket['definitions'][key]) for key,values in bucket['attributes'].items()}
        ids=np.array(bucket['indices'],dtype='<u4').reshape(-1,1)
        index=AddAccessor(glb,ids,{'componentType':5125,'type':'SCALAR','count':len(ids)})
        newPrimitives.append({'attributes':attributes,'indices':index,'material':material,'mode':4})
        provenance.append({k:v for k,v in bucket.items() if k in ['records','triangles','changedNormalRecords','changedTangentRecords']}|{'mesh':0 if material==0 else 1,'primitive':0 if material==0 else material-1})
    glb.j['meshes'][0]['primitives']=newPrimitives[:1];glb.j['meshes'][1]['primitives']=newPrimitives[1:]
    # Match each end-grain texture role to its existing texture/image binding.
    mat=glb.j['materials'][3]
    for role,ti in [('Base',mat['pbrMetallicRoughness']['baseColorTexture']['index']),('Normal',mat['normalTexture']['index']),('Orm',mat['pbrMetallicRoughness']['metallicRoughnessTexture']['index'])]:
        texture=glb.j['textures'][ti];ii=texture.get('source',texture.get('extensions',{}).get('EXT_texture_webp',{}).get('source'))
        sourceMaterial=bpy.data.materials[mat['name']]
        image=RoleImageNode(sourceMaterial,role).image
        assert image.packed_file
        data=bytes(image.packed_file.data);glb.ReplaceImage(ii,data,mimeType='image/webp',name=image.name)
    raw=glb.Serialize();(output/'Model_SkiffB27.glb').write_bytes(raw)
    policy={'endgrainTriangles':capTriangles,'keelSourceRecords':keelSourceRecords,'uvRecipes':{'ribUniformScale':1.85,'endPlanarScalePerM':3.5},'maxGlbBytes':9000000,'maxReplacementImageBytes':1000000,
        'normalChanges':'KeelSole only; inverse transpose piecewise-linear deformation Jacobian','nailChanges':metadata['nailChanges'],'keel':metadata['keel']}
    (output/'Data_CornerProvenance.json').write_text(json.dumps({'primitives':provenance,'policy':policy},separators=(',',':'))+'\n',encoding='utf-8')
    records=sum(len(b['records']) for b in buckets.values())
    report={'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'triangles':sum(len(b['triangles']) for b in buckets.values()),'vertexRecords':records,'materials':4,'primitives':4,'images':9,
        'nailsReseated':len(metadata['nailChanges']),'endgrainTriangles':len(capTriangles),'source':bpy.data.filepath,'keel':metadata['keel'],'templateSha256':hashlib.sha256(original.Serialize()).hexdigest()}
    assert report['triangles']==49944 and records<90000
    (output/'Data_Build.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,indent=2))
    return report


def Main(argv=None):
    parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--initialize',action='store_true');parser.add_argument('--template',type=Path);parser.add_argument('--recipe',type=Path);parser.add_argument('--endgrain-master',type=Path);parser.add_argument('--save-source',type=Path)
    args=parser.parse_args(argv)
    bpy.ops.wm.open_mainfile(filepath=str(args.source),load_ui=False,use_scripts=False)
    objects=[o for o in bpy.data.collections['StrandedSkiffA'].objects if o.type=='MESH']
    assert len(objects)==302
    if args.initialize:
        assert args.template and args.recipe and args.endgrain_master and args.save_source
        print('SKIFF: correspondence',flush=True)
        template=GLB.Read(args.template);metadata=CreateCorrespondence(template,objects)
        print('SKIFF: repair geometry',flush=True)
        RepairGeometry(metadata,objects,json.loads(args.recipe.read_text(encoding='utf-8-sig')))
        from Script_SkiffB27EndGrain import BakeEndGrain
        print('SKIFF: bake end grain',flush=True)
        products=BakeEndGrain(args.endgrain_master,args.save_source.parent/'PBR')
        print('SKIFF: prepare materials',flush=True)
        PrepareMaterials(metadata,objects,products)
        print('SKIFF: synchronize source materials',flush=True)
        SyncSourceMaterials(metadata,objects,template)
        print('SKIFF: store template',flush=True)
        SetText('Data_SkiffB27Template',EncodeTemplate(args.template.read_bytes()))
        print('SKIFF: store correspondence',flush=True)
        SetText('Data_SkiffB27Correspondence',PackJson(metadata))
        for file in Path(__file__).parent.glob('Script_SkiffB27*.py'):SetText(file.name,file.read_text(encoding='utf-8'))
        bpy.context.preferences.filepaths.save_version=0
        print('SKIFF: save source',flush=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(args.save_source))
    print('SKIFF: export',flush=True)
    return Export(args.output)


if __name__=='__main__':
    Main(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
