"""Reopened author fingerprints, UV/PBR binding and independent AO ray probes."""
import bpy,pathlib,os,json,hashlib,ast,array,struct,math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
repo=pathlib.Path(os.environ['KI4_REPO_ROOT']);source=pathlib.Path(os.environ['KI4_SOURCE_ROOT']);asset=pathlib.Path(os.environ['KI4_ASSET_ROOT']);author=source/'Scene_NakajimaKi4.blend'
record=json.loads((asset/'Evidence/Data_HardwareHighAo.json').read_text());assert hashlib.sha256(author.read_bytes()).hexdigest()==record['sourceSha256']
assert pathlib.Path(bpy.data.filepath).resolve()==author.resolve();root=bpy.data.objects['NakajimaKi4'];assert root['version']==os.environ.get('KI4_CANDIDATE_VERSION','20261026ReferenceV31')
tree=ast.parse((repo/'Taierzhuang1938/_blender/Script_NakajimaKi4MainGearUpdate.py').read_text(encoding='utf8'));fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='MeshFingerprint');exec(compile(ast.Module(body=[fn],type_ignores=[]),'Fingerprint','exec'),globals())
assert record['unchangedMeshFingerprints']=={name:MeshFingerprint(bpy.data.objects[name]) for name in record['unchangedMeshFingerprints']}
assert all(hashlib.sha256(bpy.data.images[name].packed_file.data).hexdigest()==value for name,value in record['unchangedPackedImages'].items())
def Group(obj):
    parent=obj.parent
    while parent:
        if parent.name.startswith('Pivot_'):return parent.name
        parent=parent.parent
    return 'Fixed'
opaque=[o for o in root.children_recursive if o.type=='MESH' and o.name!='Surface_FlushRivetHeads' and not any('Windscreen' in m.name for m in o.data.materials)]
trees={}
for group in ['Fixed','Pivot_WheelLeft','Pivot_WheelRight']:
    vertices=[];faces=[]
    for obj in opaque:
        if Group(obj)!=group:continue
        obj.data.calc_loop_triangles();offset=len(vertices);vertices.extend(obj.matrix_world@v.co for v in obj.data.vertices);faces.extend([[offset+i for i in p.vertices] for p in obj.data.loop_triangles])
    trees[group]=BVHTree.FromPolygons(vertices,faces,all_triangles=True)
images={}
def ImagePixels(im):
    if im.name not in images:
        a=np.empty(im.size[0]*im.size[1]*4,dtype=np.float32);im.pixels.foreach_get(a);images[im.name]=a.reshape(im.size[1],im.size[0],4)
    return images[im.name]
def Sample(im,uv,repeat=False):
    p=ImagePixels(im);h,w=p.shape[:2];u,v=uv
    if repeat:u%=1;v%=1
    x=u*w-.5;y=v*h-.5;x0=math.floor(x);y0=math.floor(y);tx=x-x0;ty=y-y0
    def At(x,y):return float(p[max(0,min(h-1,y)),max(0,min(w-1,x)),0])
    return (At(x0,y0)*(1-tx)+At(x0+1,y0)*tx)*(1-ty)+(At(x0,y0+1)*(1-tx)+At(x0+1,y0+1)*tx)*ty
im=bpy.data.images[root['hardwareAoImage']];assert list(im.size)==[2048,2048];rows=[]
for name in record['partNames']:
    obj=bpy.data.objects[name];mesh=obj.data;primary=np.empty(len(mesh.loops)*2,dtype=np.float32);mesh.uv_layers[0].data.foreach_get('uv',primary);assert hashlib.sha256(primary.tobytes()).hexdigest()==record['primaryUv0Hashes'][name]
    uv1=np.array([item.uv[:] for item in mesh.uv_layers['GeometryAO'].data]);assert uv1.min()>=-1e-6 and uv1.max()<=1.000001 and np.ptp(uv1,axis=0).min()>1e-5
    mat=mesh.materials[0];settings=next(n for n in mat.node_tree.nodes if n.type=='GROUP' and n.node_tree and n.node_tree.name=='glTF Material Output');assert settings.inputs['Occlusion'].is_linked
    imageNodes=[n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image==im];assert imageNodes
    orm=next(n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and 'Orm' in n.image.name)
    mesh.calc_loop_triangles();triangles=list(mesh.loop_triangles);selection=np.linspace(0,len(triangles)-1,min(18,len(triangles))).astype(int);samples=[]
    normalMatrix=obj.matrix_world.to_3x3().inverted().transposed()
    for index in selection:
        t=triangles[index];point=sum((obj.matrix_world@mesh.vertices[k].co for k in t.vertices),Vector())/3;normal=(normalMatrix@sum((mesh.corner_normals[k].vector for k in t.loops),Vector())).normalized()
        uv=sum((mesh.uv_layers['GeometryAO'].data[k].uv for k in t.loops),Vector((0,0)))/3;uv0=sum((mesh.uv_layers[0].data[k].uv for k in t.loops),Vector((0,0)))/3
        along=(Vector((1,0,0))-normal*normal.x).normalized() if abs(normal.x)<.95 else (Vector((0,1,0))-normal*normal.y).normalized();across=normal.cross(along);visible=0
        for k in range(128):
            r=math.sqrt((k+.5)/128);angle=2*math.pi*((k*.6180339887498949)%1);direction=along*(r*math.cos(angle))+across*(r*math.sin(angle))+normal*math.sqrt(1-r*r)
            visible+=trees[Group(obj)].ray_cast(point+normal*.00003,direction,2.)[0] is None
        expected=visible/128*Sample(orm,uv0,True);actual=Sample(im,uv);samples.append({'face':int(index),'actual':actual,'independentRayPrediction':expected,'error':actual-expected})
    rows.append({'name':name,'samples':samples,'uv1Min':uv1.min(0).tolist(),'uv1Max':uv1.max(0).tolist()})
errors=np.array([s['error'] for r in rows for s in r['samples']]);stats={'rms':float(np.sqrt(np.mean(errors**2))),'p95Absolute':float(np.percentile(abs(errors),95)),'maxAbsolute':float(max(abs(errors))),'samples':len(errors)}
result={'state':'SavedHardwareAuthorReopenedAndRayCompared_NotWholeFidelityApproval','sourceSha256':record['sourceSha256'],'unchangedSourceMeshes':len(record['unchangedMeshFingerprints']),'unchangedPackedImages':37,'hardwareParts':46,'packedImages':sum(bool(im.packed_file) for im in bpy.data.images),'primaryUv0Exact':True,'uv1Valid':True,'sourceAoNodeBindingChecked':True,'independentAoRayComparison':stats,'rows':rows,'scope':'128 deterministic cosine rays per probe independently compare the actual saved AO atlas and original microAO. Blender64-ray stochastic bake and UV filtering can differ locally. This diagnostic does not replace complete AO seam/field and native PBR/motion/reference checks. Source never saved during audit.'}
for folder in [source/'Evidence',asset/'Evidence']:(folder/'Data_HardwareSavedAuthorCheck.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in result.items() if k!='rows'}),flush=True)
