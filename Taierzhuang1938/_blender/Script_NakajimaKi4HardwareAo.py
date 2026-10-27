"""Scoped V30 hardware PBR/AO, keeping the reviewed aircraft image/UV bytes.

High stage saves a new exclusive V31 author. Low stage is transient: project
the high AO field onto the exact existing game triangles; never save it.
"""
import bpy,os,pathlib,json,hashlib,math,ast,array,struct,time,re
import numpy as np
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

repo=pathlib.Path(os.environ['KI4_REPO_ROOT']).resolve()
source=pathlib.Path(os.environ['KI4_SOURCE_ROOT']).resolve()
asset=pathlib.Path(os.environ['KI4_ASSET_ROOT']).resolve()
author=source/'Scene_NakajimaKi4.blend'
assert re.fullmatch(r'ReferenceV3[1234](?:_[A-Za-z0-9]+)?',source.name) and pathlib.Path(bpy.data.filepath).resolve()==author
root=bpy.data.objects['NakajimaKi4'];scene=bpy.context.scene
names=sorted(set(json.loads(root['oleoNewPartsJson'])+json.loads(root['mainGearNewPartsJson'])))
assert len(names)==46
targets=[bpy.data.objects[n] for n in names]
helper={};helperPath=repo/'Taierzhuang1938/_blender/Script_NakajimaKi4GeometryAo.py'
exec(compile(helperPath.read_text(encoding='utf8'),str(helperPath),'exec'),helper)
tree=ast.parse((repo/'Taierzhuang1938/_blender/Script_NakajimaKi4MainGearUpdate.py').read_text(encoding='utf8'))
fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='MeshFingerprint')
exec(compile(ast.Module(body=[fn],type_ignores=[]),'SourceFingerprint','exec'),globals())
Hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def Unwrap(objects):
    hashes={obj.name:helper['AoUvHash'](obj.data) for obj in objects}
    proxy,mapping=helper['AoProxy'](objects,'Temp_HardwareAoUnwrap')
    uv=proxy.data.uv_layers.new(name='GeometryAO');proxy.data.uv_layers.active=uv
    bpy.ops.object.select_all(action='DESELECT');proxy.select_set(True);bpy.context.view_layer.objects.active=proxy
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.002,correct_aspect=False,scale_to_bounds=True)
    bpy.ops.uv.pack_islands(rotate=True,scale=True,margin=.003,margin_method='FRACTION',shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    layers={obj:obj.data.uv_layers.get('GeometryAO') or obj.data.uv_layers.new(name='GeometryAO') for obj in objects}
    for i,(obj,k) in enumerate(mapping):layers[obj].data[k].uv=proxy.data.uv_layers['GeometryAO'].data[i].uv
    helper['RemoveAoProxy'](proxy)
    for obj in objects:obj.data.uv_layers.active_index=0;obj.data.uv_layers[0].active_render=True
    if os.environ.get('KI4_REPAIR_AO_UV','0')=='1':
        repairPath=repo/'Taierzhuang1938/_blender/Script_NakajimaKi4HardwareUv1.py';repair={};exec(compile(repairPath.read_text(encoding='utf8'),str(repairPath),'exec'),repair);repairRecord=repair['RepairHardwareAoUv'](objects,helper);(asset/'Evidence/Data_HardwareGameUv1Repair.json').write_text(json.dumps(repairRecord,indent=2),encoding='utf8')
    assert hashes=={obj.name:helper['AoUvHash'](obj.data) for obj in objects},'Primary UV0 changed'
    return hashes

def Image(name,black=False):
    im=bpy.data.images.new(name,width=2048,height=2048,alpha=True,float_buffer=True)
    im.colorspace_settings.name='Non-Color';im.generated_color=(0,0,0,0) if black else (1,1,1,1)
    pixels=np.zeros(2048*2048*4,dtype=np.float32) if black else np.ones(2048*2048*4,dtype=np.float32)
    im.pixels.foreach_set(pixels);return im

def SaveImage(im):
    p=source/'Textures'/(im.name+'.png');im.filepath_raw=str(p);im.file_format='PNG';im.save();im.pack();return {'path':str(p),'sha256':Hash(p),'size':list(im.size)}

def SetupBake():
    scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.use_denoising=False;scene.cycles.device='CPU'
    scene.render.threads_mode='FIXED';scene.render.threads=min(8,os.cpu_count() or 4)
    scene.render.bake.margin=6;scene.render.bake.use_clear=False

def Export(objects,path):
    bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
    for name in ['Pivot_WheelLeft','Pivot_WheelRight']:bpy.data.objects[name].select_set(True)
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_texcoords=True,export_normals=True,export_tangents=True,export_animations=False,export_cameras=False,export_lights=False)

def High():
    assert Hash(author)=='c8c55aa82304f5a7a3a69a1ac260fd0e9d9258629dfb8cc82ca3c3ff7c607532'
    before={o.name:MeshFingerprint(o) for o in root.children_recursive if o.type=='MESH' and o.name not in names}
    images={im.name:hashlib.sha256(im.packed_file.data).hexdigest() for im in bpy.data.images if im.packed_file}
    assert len(images)==37
    primary=Unwrap(targets);im=Image('Texture_Ki4HardwareGeometryAoHigh')
    mats={o:list(o.data.materials) for o in targets};hide={o:o.hide_render for o in scene.objects};temporary=[]
    SetupBake();scene.render.bake.use_selected_to_active=False
    for obj in targets:
        original=mats[obj][0];mat=bpy.data.materials.new('Temp_HardwareAo_'+obj.name);mat.use_nodes=True
        nodes=mat.node_tree.nodes;nodes.clear();links=mat.node_tree.links
        out=nodes.new('ShaderNodeOutputMaterial');em=nodes.new('ShaderNodeEmission');ao=nodes.new('ShaderNodeAmbientOcclusion');ao.samples=64;ao.inputs['Distance'].default_value=2.
        links.new(ao.outputs['AO'],em.inputs['Color']);links.new(em.outputs[0],out.inputs[0])
        orm=next((n.image for n in original.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and 'Orm' in n.image.name),None)
        if orm:
            uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap';tex=nodes.new('ShaderNodeTexImage');tex.image=orm;split=nodes.new('ShaderNodeSeparateColor');mul=nodes.new('ShaderNodeMath');mul.operation='MULTIPLY'
            links.new(uv.outputs[0],tex.inputs[0]);links.new(tex.outputs['Color'],split.inputs[0]);links.new(split.outputs['Red'],mul.inputs[0]);links.new(ao.outputs['AO'],mul.inputs[1]);links.new(mul.outputs[0],em.inputs[0])
        target=nodes.new('ShaderNodeTexImage');target.image=im;nodes.active=target;obj.data.materials.clear();obj.data.materials.append(mat);temporary.append(mat)
        obj.data.uv_layers['GeometryAO'].active_render=True
    opaque=[o for o in root.children_recursive if o.type=='MESH' and o.name!='Surface_FlushRivetHeads' and not helper['AoGlass'](o)]
    batches=[]
    try:
        for group in ['Fixed','Pivot_WheelLeft','Pivot_WheelRight']:
            selected=[o for o in targets if helper['AoMovingGroup'](o)==group]
            for obj in scene.objects:obj.hide_render=obj not in opaque or helper['AoMovingGroup'](obj)!=group
            bpy.ops.object.select_all(action='DESELECT')
            for obj in selected:obj.select_set(True)
            bpy.context.view_layer.objects.active=selected[0];started=time.time();bpy.ops.object.bake(type='EMIT',uv_layer='GeometryAO',use_clear=False,use_selected_to_active=False)
            batches.append({'group':group,'targets':[o.name for o in selected],'occluders':sum(not o.hide_render for o in opaque),'seconds':time.time()-started})
    finally:
        for o,value in hide.items():o.hide_render=value
        for obj,materials in mats.items():
            obj.data.materials.clear()
            for mat in materials:obj.data.materials.append(mat)
            obj.data.uv_layers.active_index=0;obj.data.uv_layers[0].active_render=True
        for mat in temporary:bpy.data.materials.remove(mat)
    imageRecord=SaveImage(im);clones={}
    for obj in targets:
        old=obj.data.materials[0]
        if old not in clones:
            mat=old.copy();mat.name='Material_Ki4Hardware'+old.name.removeprefix('Material_');clones[old]=mat
        obj.data.materials[0]=clones[old]
    class Scoped:children_recursive=targets
    helper['BindGeometryAo'](Scoped,im)
    assert before=={o.name:MeshFingerprint(o) for o in root.children_recursive if o.type=='MESH' and o.name not in names}
    assert all(hashlib.sha256(bpy.data.images[name].packed_file.data).hexdigest()==value for name,value in images.items())
    root['version']='20261026ReferenceV31';root['hardwareAoScope']='46 changed/inherited main-gear and wheel-metal parts only; new unique AO UV1, existing primary material UV0 and tile images retained. Actual high fixed/same-wheel-group occlusion; loading not adopted.'
    root['geometryAoPendingForChangedGeometry']=True;root['hardwareOwnAoPending']=False;root['hardwareAoImage']=im.name;root['grayCompositionOnly']=False
    path=repo/'Taierzhuang1938/_blender/Script_NakajimaKi4HardwareAo.py';text=bpy.data.texts.get(path.name) or bpy.data.texts.new(path.name);text.clear();text.write(path.read_text(encoding='utf8'));text.use_fake_user=True
    (source/'Scripts'/path.name).write_text(path.read_text(encoding='utf8'),encoding='utf8')
    bpy.ops.wm.save_as_mainfile(filepath=str(author));patch=asset/'Model_HardwareHighPatch.glb';Export(targets,patch)
    result={'state':'ScopedHighHardwareAoBakedAndAuthorSaved_LowPending','sourceSha256':Hash(author),'patchSha256':Hash(patch),'image':imageRecord,'partNames':names,'primaryUv0Hashes':primary,'unchangedMeshFingerprints':before,'unchangedPackedImages':images,'batches':batches,'scope':'Independent V31 author from protected V30. No retained aircraft geometry/material/image changed.64 AO rays,2m range,2048 atlas; moving wheel groups isolated. No complete PBR/fidelity approval.'}
    for folder in [source/'Evidence',asset/'Evidence']:(folder/'Data_HardwareHighAo.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    print(json.dumps({'state':result['state'],'sourceSha256':result['sourceSha256'],'targets':len(targets),'untouched':len(before),'batches':batches}),flush=True)

def Low():
    record=json.loads((asset/'Evidence/Data_HardwareHighAo.json').read_text())
    assert Hash(author)==record['sourceSha256'] and root['version']==os.environ.get('KI4_CANDIDATE_VERSION','20261026ReferenceV31')
    # This saved author contains only the high scene; set a precise remaining
    # gate before making any transient game objects. Earlier receipt retained.
    if not root.get('geometryAoPendingForChangedGeometry',True):
        root['geometryAoPendingForChangedGeometry']=True;root['hardwareOwnAoPending']=False
        root['hardwareAoRemaining']='Retained receiver contact fields, complete source/runtime/PBR/motion/reference gates still pending.'
        bpy.ops.wm.save_as_mainfile(filepath=str(author));record['sourceBeforeScopeClarificationSha256']=record['sourceSha256'];record['sourceSha256']=Hash(author)
        for folder in [source/'Evidence',asset/'Evidence']:(folder/'Data_HardwareHighAo.json').write_text(json.dumps(record,indent=2),encoding='utf8')
    base=repo/'tmp/NakajimaKi4/ReferenceV30/Model_NakajimaKi4Gray.glb';blob=base.read_bytes();assert Hash(base)=='ec318c6ca505426ab00e7c3d9e8e43eaf28a7972ad6ddd91785f1ca5afe796e0'
    length=struct.unpack_from('<I',blob,12)[0];g=json.loads(blob[20:20+length]);binary=blob[28+length:];worlds={};parents={}
    def Visit(i,parent,pi=None):
        n=g['nodes'][i]
        if 'matrix' in n:m=Matrix(np.array(n['matrix']).reshape(4,4).T.tolist())
        else:
            from mathutils import Quaternion
            q=n.get('rotation',[0,0,0,1]);m=Matrix.LocRotScale(Vector(n.get('translation',[0,0,0])),Quaternion((q[3],*q[:3])),Vector(n.get('scale',[1,1,1])))
        worlds[i]=parent@m;parents[i]=pi
        for c in n.get('children',[]):Visit(c,worlds[i],i)
    for i in g['scenes'][g.get('scene',0)]['nodes']:Visit(i,Matrix.Identity(4))
    def Accessor(i):
        a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];kind={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];width={'VEC2':2,'VEC3':3,'VEC4':4,'SCALAR':1}[a['type']];dtype=np.dtype(kind)
        return np.ndarray((a['count'],width),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*dtype.itemsize),dtype.itemsize)).copy()
    axis=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)));low={};incoming={}
    for i,node in enumerate(g['nodes']):
        if 'mesh' not in node:continue
        p=g['meshes'][node['mesh']]['primitives'][0];attrs={k:Accessor(v) for k,v in p['attributes'].items()};ix=Accessor(p['indices']).ravel()
        for part in node.get('extras',{}).get('sourceDeltaParts',node.get('extras',{}).get('mainGearGamePartRanges',[])):
            partNames=part.get('names') or [part.get('name')]
            if len(partNames)!=1 or partNames[0] not in names:continue
            name=partNames[0];assert name not in low
            selected=ix[part['firstIndex']:part['firstIndex']+part['indexCount']];used=sorted(set(map(int,selected)));remap={v:k for k,v in enumerate(used)}
            parentName=g['nodes'][parents[i]]['name'];parent=bpy.data.objects[parentName];transform=parent.matrix_world.inverted()@axis@worlds[i];normal=transform.to_3x3().inverted().transposed()
            vertices=[transform@Vector(attrs['POSITION'][k]) for k in used];faces=[tuple(remap[int(v)] for v in selected[k:k+3]) for k in range(0,len(selected),3)]
            mesh=bpy.data.meshes.new('GameHardware_'+name);mesh.from_pydata(vertices,[],faces);mesh.update();obj=bpy.data.objects.new(mesh.name,mesh);scene.collection.objects.link(obj);obj.parent=parent
            uv=mesh.uv_layers.new(name='UVMap')
            for loop in mesh.loops:uv.data[loop.index].uv=attrs['TEXCOORD_0'][used[loop.vertex_index]]
            for poly in mesh.polygons:poly.use_smooth=True
            mesh.normals_split_custom_set([tuple((normal@Vector(attrs['NORMAL'][used[loop.vertex_index]])).normalized()) for loop in mesh.loops])
            mesh.materials.append(bpy.data.objects[name].data.materials[0]);obj['sourceDeltaPart']=name;obj['sourceParentName']=parentName;low[name]=obj
            incoming[name]={'triangles':len(faces),'primaryUv0Hash':helper['AoUvHash'](mesh)}
    assert set(low)==set(names),(set(names)-set(low))
    lowTargets=list(low.values());primary=Unwrap(lowTargets);im=Image('Texture_Ki4HardwareGeometryAoGame',True);highImage=bpy.data.images[root['hardwareAoImage']]
    sourceMaterials={o:list(o.data.materials) for o in targets};temporary=[];hidden={o:o.hide_render for o in scene.objects};SetupBake()
    scene.render.bake.use_selected_to_active=True;scene.render.bake.cage_extrusion=.003;scene.render.bake.max_ray_distance=.010
    for obj in targets:
        mat=bpy.data.materials.new('Temp_HardwareAoProjectionSource');mat.use_nodes=True;ns=mat.node_tree.nodes;ns.clear();lk=mat.node_tree.links
        out=ns.new('ShaderNodeOutputMaterial');em=ns.new('ShaderNodeEmission');uv=ns.new('ShaderNodeUVMap');uv.uv_map='GeometryAO';tex=ns.new('ShaderNodeTexImage');tex.image=highImage;split=ns.new('ShaderNodeSeparateColor');combine=ns.new('ShaderNodeCombineColor');combine.inputs['Green'].default_value=1
        lk.new(uv.outputs[0],tex.inputs[0]);lk.new(tex.outputs['Color'],split.inputs[0]);lk.new(split.outputs['Red'],combine.inputs['Red']);lk.new(combine.outputs[0],em.inputs[0]);lk.new(em.outputs[0],out.inputs[0]);obj.data.materials.clear();obj.data.materials.append(mat);temporary.append(mat)
    mat=bpy.data.materials.new('Temp_HardwareAoProjectionTarget');mat.use_nodes=True;target=mat.node_tree.nodes.new('ShaderNodeTexImage');target.image=im;mat.node_tree.nodes.active=target;temporary.append(mat)
    try:
        for obj in scene.objects:obj.hide_render=obj not in targets+lowTargets
        for name,obj in low.items():
            obj.data.materials.clear();obj.data.materials.append(mat);obj.data.uv_layers['GeometryAO'].active_render=True
            bpy.ops.object.select_all(action='DESELECT');bpy.data.objects[name].select_set(True);obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.bake(type='EMIT',uv_layer='GeometryAO',use_clear=False,use_selected_to_active=True,cage_extrusion=.003,max_ray_distance=.010)
    finally:
        for obj,values in sourceMaterials.items():
            obj.data.materials.clear()
            for value in values:obj.data.materials.append(value)
        for obj,value in hidden.items():obj.hide_render=value
    pixels=np.empty(2048*2048*4,dtype=np.float32);im.pixels.foreach_get(pixels);pixels=pixels.reshape(2048,2048,4)
    sourcePixels=np.empty(2048*2048*4,dtype=np.float32);highImage.pixels.foreach_get(sourcePixels);sourcePixels=sourcePixels.reshape(2048,2048,4)
    coverage=np.zeros((2048,2048),dtype=bool);missed=0;fallback=0;maxDistance=0.;perPart=[]
    for name,obj in low.items():
        mesh=obj.data;mesh.calc_loop_triangles();high=bpy.data.objects[name];hm=high.data;hm.calc_loop_triangles();ht=list(hm.loop_triangles);hv=[high.matrix_world@v.co for v in hm.vertices]
        bvh=BVHTree.FromPolygons(hv,[list(t.vertices) for t in ht],all_triangles=True);partMiss=0
        for tri in mesh.loop_triangles:
            uv=np.array([mesh.uv_layers['GeometryAO'].data[k].uv[:] for k in tri.loops])*2048;mn=np.maximum(0,np.ceil(uv.min(0)-.5).astype(int));mx=np.minimum(2047,np.floor(uv.max(0)-.5).astype(int))
            if np.any(mx<mn):continue
            xx,yy=np.meshgrid(np.arange(mn[0],mx[0]+1)+.5,np.arange(mn[1],mx[1]+1)+.5);d=uv[1:]-uv[0];det=d[0,0]*d[1,1]-d[0,1]*d[1,0]
            if abs(det)<1e-12:continue
            dx=xx-uv[0,0];dy=yy-uv[0,1];b=(dx*d[1,1]-dy*d[1,0])/det;c=(d[0,0]*dy-d[0,1]*dx)/det;a=1-b-c;inside=(a>=-1e-6)&(b>=-1e-6)&(c>=-1e-6);yi=yy.astype(int);xi=xx.astype(int);coverage[yi[inside],xi[inside]]=True
            missing=inside&(pixels[yi,xi,1]<.5)
            if not np.any(missing):continue
            vp=[obj.matrix_world@mesh.vertices[k].co for k in tri.vertices];normal=(obj.matrix_world.to_3x3().inverted().transposed()@tri.normal).normalized()
            for y,x,aa,bb,cc in zip(yi[missing],xi[missing],a[missing],b[missing],c[missing]):
                if pixels[y,x,1]>=.5:continue
                point=vp[0]*float(aa)+vp[1]*float(bb)+vp[2]*float(cc);nearest=bvh.find_nearest(point);assert nearest[0] is not None
                hit,n,index,distance=nearest
                candidates=[r for r in bvh.find_nearest_range(point,max(distance+1e-5,1e-5)) if r[1].dot(normal)>.5]
                if candidates:hit,n,index,distance=min(candidates,key=lambda r:r[3])
                assert distance<=.0025,(name,'AO projection misses source tolerance',distance)
                t=ht[index];p,q,r=[hv[k] for k in t.vertices];tu=[Vector((*hm.uv_layers['GeometryAO'].data[k].uv,0)) for k in t.loops];at=barycentric_transform(hit,p,q,r,*tu)
                sx=float(at.x)*2048-.5;sy=float(at.y)*2048-.5;x0=math.floor(sx);y0=math.floor(sy);tx=sx-x0;ty=sy-y0
                def Sample(x,y):return float(sourcePixels[max(0,min(2047,y)),max(0,min(2047,x)),0])
                value=(Sample(x0,y0)*(1-tx)+Sample(x0+1,y0)*tx)*(1-ty)+(Sample(x0,y0+1)*(1-tx)+Sample(x0+1,y0+1)*tx)*ty
                pixels[y,x]=[value,1,0,1];fallback+=1;partMiss+=1;maxDistance=max(maxDistance,distance)
        perPart.append({'name':name,'triangles':len(mesh.loop_triangles),'nearestPhysicalSourceFallbackTexels':partMiss})
    missed=int(np.sum(coverage&(pixels[:,:,1]<.5)));assert missed==0
    value=pixels[:,:,0].copy();value[pixels[:,:,1]<.5]=1;pixels[:,:,:3]=value[:,:,None];pixels[:,:,3]=1;im.pixels.foreach_set(pixels.ravel());im.update();imageRecord=SaveImage(im)
    clones={}
    for name,obj in low.items():
        original=bpy.data.objects[name].data.materials[0]
        if original not in clones:
            clone=original.copy();clone.name=original.name+'Game';clones[original]=clone
            for node in clone.node_tree.nodes:
                if node.type=='TEX_IMAGE' and node.image==highImage:node.image=im
        obj.data.materials.clear();obj.data.materials.append(clones[original]);obj.data.uv_layers.active_index=0;obj.data.uv_layers[0].active_render=True
    patch=asset/'Model_HardwareGamePatch.glb';Export(lowTargets,patch)
    result={'state':'ActualGameHardwareAoProjectedFromHigh_TransientSceneNotSaved','sourceSha256':Hash(author),'runtimeGrayBaseSha256':Hash(base),'patchSha256':Hash(patch),'image':imageRecord,'incoming':incoming,'primaryUv0Hashes':primary,'coverageTexels':int(sum(coverage.ravel())),'unresolvedMisses':missed,'nearestPhysicalSourceFallbackTexels':fallback,'maxFallbackSourceDistanceM':maxDistance,'parts':perPart,'scope':'Exact V30 game triangle sets and primary UV0; unique new AO UV1. High physical AO projected with3mm cage/10mm ray; missed covered texels sampled from nearest compatible actual source within2.5mm. New atlas only; transient scene never saved. Complete retained-receiver AO/motion/PBR/reference acceptance still pending.'}
    for folder in [source/'Evidence',asset/'Evidence']:(folder/'Data_HardwareGameAo.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    print(json.dumps({k:v for k,v in result.items() if k not in ['incoming','primaryUv0Hashes','parts']}),flush=True)

if os.environ.get('KI4_HARDWARE_STAGE','High')=='High':High()
else:Low()
