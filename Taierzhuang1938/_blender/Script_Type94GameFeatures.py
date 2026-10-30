"""Feature-aware game derivative; immutable high and V58 sources remain intact.

Small bearing profiles keep coherent sections instead of free vertex collapse.
Convex fittings use only source vertices, and thin curved panels use planar
dissolution. Actual movement and detail gates remain independent requirements.
"""
import ast,bpy,bmesh,hashlib,importlib.util,json,math,os,time,numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
repo=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2])))
base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'GameTrialV59';acc=root/'Acceptance'
for p in [root,acc,root/'Exports']:p.mkdir(parents=True,exist_ok=True)
assert not bpy.data.filepath
highManifest=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV56.json').read_text())
oldManifest=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_GameTrialV58.json').read_text())
oldProof=json.loads((base/'GameTrialV58/Acceptance/Data_GameTrialReductionV58.json').read_text())
for manifest in [highManifest,oldManifest]:assert hashlib.sha256(Path(manifest['sourceBlend']).read_bytes()).hexdigest()==manifest['sourceBlendSha256']
assert oldManifest['sha256']==oldProof['sha256']
priorCertificate=json.loads((base/'GameTrialV58/Acceptance/Data_ComposedActualSurfaceCertificateV58.json').read_text());assert priorCertificate['passed']and priorCertificate['sha256']==oldManifest['sha256']
assert highManifest['sha256']==oldProof['sourceGlbSha256']==priorCertificate['referenceSha256']
assert highManifest['sourceBlendSha256']==priorCertificate['sourceExportChecks'][0]['sourceBlendSha256']
priorScript=(repo/oldManifest['producer']).read_bytes()
assert oldManifest['producerSha256']in[hashlib.sha256(priorScript).hexdigest(),hashlib.sha256(priorScript.replace(b'\r\n',b'\n')).hexdigest()]
file=repo/'Taierzhuang1938/_blender/Script_Type94Export.py';spec=importlib.util.spec_from_file_location('FeatureExport',file);exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)
tree=ast.parse((repo/'Taierzhuang1938/_blender/Script_Type94GameTrial.py').read_text());scope=dict(bpy=bpy,np=np,math=math,Vector=Vector,BVHTree=BVHTree,CERT_LIMIT=.002998)
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in ['Count','Surface','Certify','LooseParts']],type_ignores=[]),'<V58 certified surface functions>','exec'),scope)
Count=scope['Count'];LooseParts=scope['LooseParts'];Certify=scope['Certify'];started=time.time()

def State(mesh):
    return dict(points=[tuple(v.co)for v in mesh.vertices],faces=[tuple(p.vertices)for p in mesh.polygons],uv=[tuple(v.uv)for v in mesh.uv_layers.active.data],normals=[tuple(n.vector)for n in mesh.corner_normals],smooth=[p.use_smooth for p in mesh.polygons],slots=[p.material_index for p in mesh.polygons],materials=[m.name for m in mesh.materials])

def Make(points,faces,materials):
    mesh=bpy.data.meshes.new('Mesh_Type94FeatureTrial');mesh.from_pydata(points,[],faces);mesh.update()
    for name in materials:mesh.materials.append(bpy.data.materials[name])
    mesh.uv_layers.new(name='UVMap');return mesh

def Restore(state):
    mesh=Make(state['points'],state['faces'],state['materials'])
    for v,uv in zip(mesh.uv_layers.active.data,state['uv']):v.uv=uv
    for p,s,m in zip(mesh.polygons,state['smooth'],state['slots']):p.use_smooth=s;p.material_index=m
    mesh.normals_split_custom_set(state['normals']);return mesh

def Split(mesh,ids):
    vertices=sorted({i for f in ids for i in mesh.polygons[f].vertices});lookup={i:j for j,i in enumerate(vertices)}
    part=Make([mesh.vertices[i].co for i in vertices],[[lookup[i]for i in mesh.polygons[f].vertices]for f in ids],[m.name for m in mesh.materials]);normals=[]
    for p,f in zip(part.polygons,ids):
        old=mesh.polygons[f];p.use_smooth=old.use_smooth;p.material_index=old.material_index
        for a,b in zip(p.loop_indices,old.loop_indices):part.uv_layers.active.data[a].uv=mesh.uv_layers.active.data[b].uv;normals.append(mesh.corner_normals[b].vector.copy())
    part.normals_split_custom_set(normals);return part

def Transfer(mesh,source):
    source.calc_loop_triangles();triangles=list(source.loop_triangles);tree=BVHTree.FromPolygons([v.co for v in source.vertices],[tuple(t.vertices)for t in triangles],all_triangles=True);normals=[]
    for face in mesh.polygons:
        centre=sum((mesh.vertices[i].co for i in face.vertices),Vector())/len(face.vertices);hit=tree.find_nearest(centre);tri=triangles[hit[2]];a,b,c=[np.array(source.vertices[i].co,dtype=float)for i in tri.vertices];v0=b-a;v1=c-a;den=float((v0@v0)*(v1@v1)-(v0@v1)**2)
        face.use_smooth=source.polygons[tri.polygon_index].use_smooth
        for li in face.loop_indices:
            p=np.array(mesh.vertices[mesh.loops[li].vertex_index].co,dtype=float);v=p-a
            y=float(((v1@v1)*(v@v0)-(v0@v1)*(v@v1))/den)if abs(den)>1e-24 else 0.;z=float(((v0@v0)*(v@v1)-(v0@v1)*(v@v0))/den)if abs(den)>1e-24 else 0.;weights=[1-y-z,y,z]
            uv=sum((source.uv_layers.active.data[i].uv*w for i,w in zip(tri.loops,weights)),Vector((0,0)));mesh.uv_layers.active.data[li].uv=uv
            n=sum((source.corner_normals[i].vector*w for i,w in zip(tri.loops,weights)),Vector());normals.append(n.normalized()if n.length>1e-10 else face.normal)
    mesh.normals_split_custom_set(normals);return mesh

def Planar(source):
    mesh=source.copy();bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.dissolve_limit(bm,angle_limit=math.radians(.1),use_dissolve_boundaries=False,verts=list(bm.verts),edges=list(bm.edges),delimit={'UV','NORMAL','MATERIAL','SEAM'})
    bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY',ngon_method='BEAUTY');bm.to_mesh(mesh);bm.free();mesh.update();return Transfer(mesh,source)

def Convex(source,old):
    p=np.array([tuple(v.co)for v in source.vertices],dtype=float);source.calc_loop_triangles();t=np.array([tuple(f.vertices)for f in source.loop_triangles]);tri=p[t];normal=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);length=np.linalg.norm(normal,axis=1);valid=length>1e-12
    normal=normal[valid]/length[valid,None];origin=tri[valid,0]
    # A rounded Bevel face may have micrometre-scale nonplanarity after its
    # float32 source bake. This selects a candidate only; the unchanged surface
    # certificate and actual zero-exclusion motion gates still decide safety.
    if np.max(np.einsum('fvi,fi->fv',p[None,:,:]-origin[:,None,:],normal))>2e-5:return None
    q=np.array([tuple(v.co)for v in old.vertices]);ids=np.unique(np.argmin(np.sum((q[:,None,:]-p[None,:,:])**2,axis=2),axis=1))
    if len(ids)<4:return None
    bm=bmesh.new();verts=[bm.verts.new(p[i])for i in ids]
    try:
        bmesh.ops.convex_hull(bm,input=verts,use_existing_faces=False)
        unused=[v for v in bm.verts if not v.link_faces]
        if unused:bmesh.ops.delete(bm,geom=unused,context='VERTS')
        if not bm.faces or abs(bm.calc_volume())<1e-16:bm.free();return None
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.verts.ensure_lookup_table();bm.verts.index_update()
        mesh=Make([tuple(v.co)for v in bm.verts],[tuple(v.index for v in f.verts)for f in bm.faces],[m.name for m in source.materials]);bm.free();return Transfer(mesh,source)
    except RuntimeError:bm.free();return None

def Lathe(source):
    p=np.array([tuple(v.co)for v in source.vertices],dtype=float);centre=p.mean(axis=0);delta=p-centre;values,axes=np.linalg.eigh(delta.T@delta/len(p))
    for axisIndex in range(3):
        others=[i for i in range(3)if i!=axisIndex]
        if abs(values[others[0]]-values[others[1]])>max(values[others[0]],values[others[1]])*.0002:continue
        axis=axes[:,axisIndex];u=axes[:,others[0]];v=np.cross(axis,u);z=delta@axis;r=np.linalg.norm(delta-z[:,None]*axis,axis=1);groups={}
        for i in range(len(p)):groups.setdefault((round(z[i]/1e-6),round(r[i]/1e-6)),[]).append(i)
        counts={len(ids)for ids in groups.values()}
        if len(counts)!=1:continue
        n=counts.pop()
        if n<16 or len(groups)<2 or len(groups)>16:continue
        angles=np.arctan2(delta@v,delta@u);phase=float(np.angle(np.mean(np.exp(1j*n*angles)))/n);rings=[];ringByVertex={};valid=True
        for ids in groups.values():
            slots={int(round((angles[i]-phase)*n/math.tau))%n:i for i in ids}
            if len(slots)!=n or np.std(z[ids])>5e-7 or np.std(r[ids])>5e-7:valid=False;break
            ringIndex=len(rings);rings.append(slots)
            for i in ids:ringByVertex[i]=ringIndex
        if not valid:continue
        bands={};caps={}
        for face in source.polygons:
            ids=sorted({ringByVertex[i]for i in face.vertices})
            if len(ids)>2:valid=False;break
            (caps if len(ids)==1 else bands).setdefault(tuple(ids),[]).append(face.index)
        if not valid or not bands:continue
        target=8 if n%8==0 else(max(k for k in [10,12,16]if k<n and n%k==0)if any(k<n and n%k==0 for k in [10,12,16])else n)
        if target==n:continue
        step=n//target;chosen=list(range(0,n,step));points=[];lookup={};minimumRadius=float(r.min())
        for ri,slots in enumerate(rings):
            inner=not caps and abs(float(np.mean([r[i]for i in slots.values()]))-minimumRadius)<2e-6
            for slot in chosen:
                index=slots[slot];point=p[index].copy()
                if inner:point+=(delta[index]-axis*z[index])*(1/math.cos(math.pi/target)-1)
                lookup[(ri,slot)]=len(points);points.append(point)
        faces=[]
        for (ra,rb),ids in bands.items():
            oldCentres=np.array([tuple(source.polygons[i].center)for i in ids])
            for slot in chosen:
                nextSlot=(slot+step)%n;face=[lookup[(ra,slot)],lookup[(ra,nextSlot)],lookup[(rb,nextSlot)],lookup[(rb,slot)]];coords=np.array([points[i]for i in face]);normal=np.cross(coords[1]-coords[0],coords[2]-coords[0]);old=source.polygons[ids[int(np.argmin(np.sum((oldCentres-coords.mean(axis=0))**2,axis=1)))]]
                if float(normal@np.array(old.normal))<0:face.reverse()
                faces.append(face)
        for (ri,),ids in caps.items():
            face=[lookup[(ri,slot)]for slot in chosen];coords=np.array([points[i]for i in face]);normal=np.cross(coords[1]-coords[0],coords[2]-coords[0])
            if float(normal@np.array(source.polygons[ids[0]].normal))<0:face.reverse()
            faces.append(face)
        mesh=Make(points,faces,[m.name for m in source.materials]);return Transfer(mesh,source)
    return None

def Combine(parts,materials):
    states=[State(p)for p in parts];points=[];faces=[];uv=[];normals=[];smooth=[];slots=[]
    for s in states:
        offset=len(points);points.extend(s['points']);faces.extend(tuple(i+offset for i in f)for f in s['faces']);uv.extend(s['uv']);normals.extend(s['normals']);smooth.extend(s['smooth']);slots.extend(s['slots'])
    return Restore(dict(points=points,faces=faces,uv=uv,normals=normals,smooth=smooth,slots=slots,materials=materials))

bpy.ops.wm.open_mainfile(filepath=oldManifest['sourceBlend']);oldStates={r['mesh']:State(bpy.data.objects[r['mesh']].data)for r in oldProof['records']}
bpy.ops.wm.open_mainfile(filepath=highManifest['sourceBlend']);scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette';asset=bpy.data.objects['Type94Tankette'];actual={asset}|set(asset.children_recursive);records=[]
for number,oldRecord in enumerate(oldProof['records']):
    name=oldRecord['mesh'];obj=bpy.data.objects[name];shared=obj.data;users=[o for o in actual if o.type=='MESH'and o.data==shared];high=exporter.TriangulatedCopy(shared);old=Restore(oldStates[name]);protected=any(token in name for token in ['Hinge','Hatch','Conforming','Latch','InferredInterior','MachineGun'])
    if not protected:low=old;parts=oldRecord['parts'];strategy='Exact retained V58 certified mesh'
    else:
        highParts=LooseParts(high);parts=[];meshes=[];offset=0
        assert len(highParts)==len(oldRecord['parts'])
        for index,(ids,prior)in enumerate(zip(highParts,oldRecord['parts'])):
            source=Split(high,ids);previous=Split(old,list(range(offset,offset+prior['candidateTriangles'])));offset+=prior['candidateTriangles'];assert Count(source)==prior['sourceTriangles']
            exact=name in ['Geometry_MachineGunFixedMount_Paint','Geometry_MachineGunPitch_Paint','Rear_InferredInteriorCam','Rear_InferredInteriorSpindle']or(name=='Geometry_Hatch_RearCargo_Paint'and index in [0,7])or(name=='Geometry_MachineGunPitch_Steel'and index==4)
            candidate=None;method='Exact high feature'
            if not exact:
                candidate=Lathe(source);method='Coherent lathe sections with conservative inner opening'
                if candidate is None:candidate=Convex(source,previous);method='Convex hull of original source vertices'
                if candidate is None:candidate=Planar(source);method='Planar dissolution retaining UV and normal boundaries'
            if candidate is not None and Count(candidate)<Count(source):
                candidate=exporter.TriangulatedCopy(candidate)
                f=Certify(source,candidate);reverse=Certify(candidate,source)
                if not(f['certified']and reverse['certified']):candidate=source;method='Exact high feature after certificate fallback'
            else:candidate=source
            retained=candidate==source
            if retained:f=dict(certified=True,certifiedUpperM=0.);reverse=dict(f)
            meshes.append(candidate);parts.append(dict(sourceTriangles=Count(source),candidateTriangles=Count(candidate),exactRetained=retained,method=method,forward=f,reverse=reverse))
        assert offset==Count(old);low=Combine(meshes,[m.name for m in high.materials]);strategy='Protect feature components independently'
    for user in users:user.data=low
    record=dict(mesh=name,role=oldRecord['role'],instances=len(users),sourceTriangles=Count(high),candidateTriangles=Count(low),looseParts=oldRecord['looseParts'],parts=parts,strategy=strategy);records.append(record)
    (acc/'Data_GameFeatureProgressV59.json').write_text(json.dumps(dict(completedGroups=number+1,totalGroups=len(oldProof['records']),records=records,elapsedSeconds=time.time()-started),indent=2)+'\n');print('TYPE94_FEATURE_GROUP',number+1,name,Count(low),flush=True)
total=sum(r['candidateTriangles']*r['instances']for r in records);blend=root/'Scene_Type94TanketteGameTrialV59.blend';scene['GameTrialRevision']='GameTrialV59';scene['WholeReferenceAccepted']=False;bpy.ops.wm.save_as_mainfile(filepath=str(blend));bpy.ops.object.select_all(action='DESELECT')
for obj in actual:obj.select_set(True)
glb=root/'Exports/Model_Type94TanketteGameTrialV59.glb';exporter.ExportGltf(glb)
report=dict(schema='Type94FeatureGameTrialV1',sourceGlbSha256=highManifest['sha256'],referenceBlendSha256=highManifest['sourceBlendSha256'],priorGlbSha256=oldManifest['sha256'],priorBlendSha256=oldManifest['sourceBlendSha256'],priorCertificate='GameTrialV58/Acceptance/Data_ComposedActualSurfaceCertificateV58.json',triangles=total,withinBudget=total<80000,triangleLimitExclusive=80000,allLocalSurfacesCertified=all(p['forward']['certified']and p['reverse']['certified']for r in records for p in r['parts']),records=records,sourceBlend=str(blend),sourceBlendSha256=hashlib.sha256(blend.read_bytes()).hexdigest(),sourceGlb=str(glb),sha256=hashlib.sha256(glb.read_bytes()).hexdigest(),elapsedSeconds=time.time()-started,wholeReferenceAccepted=False,gameDerivativeAccepted=False,complete=False)
(acc/'Data_GameTrialReductionV59.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(triangles=total,withinBudget=total<80000,sha256=report['sha256']),indent=2),flush=True)
