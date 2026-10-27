"""Independent V38-derived, height-bounded shared-datum GRAY candidate.

Execute through the worktree's Script_BlenderMcp entry. This preserves V38 and
all packed PBR inputs, but marks changed geometry/AO and whole fidelity pending.
The photographic body/thrust alignment is inferred, never a factory angle.
"""
import bpy,pathlib,os,json,math,hashlib,re,ast,array,struct,shutil
import numpy as np
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree

scriptPath=pathlib.Path(globals().get('__file__','Taierzhuang1938/_blender/Script_NakajimaKi4DatumCandidate.py')).resolve()
repo=scriptPath.parents[2];base=pathlib.Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/ReferenceV38/Scene_NakajimaKi4.blend')
sourceRoot=pathlib.Path(os.environ.get('KI4_SOURCE_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/ReferenceV40'))
asset=pathlib.Path(os.environ.get('KI4_ASSET_ROOT',str(repo/'tmp/NakajimaKi4/ReferenceV40')))
fitPath=pathlib.Path(os.environ.get('KI4_SHARED_FIT',str(repo/'tmp/NakajimaKi4/ShapeStudyV39/Data_NominalBoundedGeometry.json')))
assert pathlib.Path(bpy.data.filepath).resolve()==base.resolve(),'Open the protected V38 source first'
assert hashlib.sha256(base.read_bytes()).hexdigest()=='039d08ab88076bfae50301b12bb04aebb5b44de7b20153e6d225ef281554a529'
assert not sourceRoot.exists(),'Use a NEW external candidate directory'
assert not (asset/'Model_NakajimaKi4HighGray.glb').exists(),'Do not overwrite a previous candidate export'
fit=json.loads(fitPath.read_text(encoding='utf8'));assert fit['allNominalDimensionGatesPassed'] is True
assert not bpy.context.scene.get('Ki4DatumMutationInProgress',False),'Reload the protected base after an interrupted mutation'
assert 'Frame_SharedWingDatumV40' not in bpy.data.objects and 'Frame_SharedEngineDatumV40' not in bpy.data.objects,'Reload the protected base after an interrupted mutation'
root=bpy.data.objects['NakajimaKi4'];assert root.get('version')=='20261027ReferenceV38';assert bpy.context.scene.get('BlenderMcpTask') in [None,'NakajimaKi4']
assert all(abs(root.matrix_world[i][j]-(1 if i==j else 0))<1e-7 for i in range(4)for j in range(4))
body=bpy.data.objects['Fuselage_Monocoque'];rivets=bpy.data.objects['Surface_FlushRivetHeads']
originalObjects=list(root.children_recursive);originalMeshes=[o for o in originalObjects if o.type=='MESH'];assert len(originalMeshes)==928
tree=ast.parse(scriptPath.with_name('Script_NakajimaKi4MainGearUpdate.py').read_text(encoding='utf8'));fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='MeshFingerprint');exec(compile(ast.Module(body=[fn],type_ignores=[]),'Fingerprint','exec'),globals())
def EvaluatedTriangles(objects):
 dg=bpy.context.evaluated_depsgraph_get();counts={}
 for obj in objects:
  evaluated=obj.evaluated_get(dg);mesh=evaluated.to_mesh();mesh.calc_loop_triangles();counts[obj.name]=len(mesh.loop_triangles);evaluated.to_mesh_clear()
 return counts
bpy.context.view_layer.update()
for obj in originalMeshes:obj.data.calc_loop_triangles()
rawTrianglesBefore=sum(len(o.data.loop_triangles)for o in originalMeshes);evaluatedBefore=EvaluatedTriangles(originalMeshes);assert sum(evaluatedBefore.values())==351020,sum(evaluatedBefore.values())
before={o.name:MeshFingerprint(o)for o in originalMeshes};imagesBefore={i.name:hashlib.sha256(i.packed_file.data).hexdigest()for i in bpy.data.images if i.packed_file};assert len(imagesBefore)==40
shared=json.loads(json.dumps(fit['shared']));shared['additionalWingPositionGltfM'][1]-=1e-5
theta=math.radians(shared['thrustBodyPitchDegrees']);R=Matrix.Rotation(theta,4,'X');wingOrigin=Vector((0,1.2813982901,2.8206334265));engineOrigin=Vector((0,2.25,1.81));d=shared['additionalWingPositionGltfM'];wingDelta=Vector((d[0],-d[2],d[1]));wingMatrix=Matrix.Translation(wingOrigin+wingDelta)@R@Matrix.Translation(-wingOrigin);engineMatrix=Matrix.Translation(engineOrigin)@R@Matrix.Translation(-engineOrigin)
oldLower=np.array(json.loads(root['lowerExteriorOffsetsJson']));oldUpper=np.array(json.loads(root['upperExteriorOffsetsJson']));newLower=np.array(shared['lowerExteriorOffsetsYM']);newUpper=np.array(shared['upperExteriorOffsetsYM']);assert np.max(abs(oldLower[:,0]-newLower[:,0]))<1e-12 and np.max(abs(oldUpper[:,0]-newUpper[:,0]))<1e-12
station=oldLower[:,0];width=np.array([.088,.147,.248,.358,.430,.490,.575,.625,.620,.610,.590]);axisHeight=float(root['bodyLongitudinalAxisHeightM'])
def Slopes(table):
 h=np.diff(table[:,0]);delta=np.diff(table[:,1])/h;slopes=np.zeros(len(table))
 for i in range(1,len(table)-1):
  if delta[i-1]*delta[i]<=0:continue
  w1=2*h[i]+h[i-1];w2=h[i]+2*h[i-1];slopes[i]=(w1+w2)/(w1/delta[i-1]+w2/delta[i])
 return slopes
def Evaluate(table,y):
 slopes=Slopes(table);index=np.clip(np.searchsorted(table[:,0],y,side='right')-1,0,len(table)-2);h=table[index+1,0]-table[index,0];t=np.clip((y-table[index,0])/h,0,1)
 value=(2*t**3-3*t*t+1)*table[index,1]+(t**3-2*t*t+t)*h*slopes[index]+(-2*t**3+3*t*t)*table[index+1,1]+(t**3-t*t)*h*slopes[index+1]
 return np.where((y>table[0,0])&(y<table[-1,0]),np.maximum(0,value),0)
def Displacement(points):
 y=points[:,1];co2=np.clip(1-(points[:,0]/np.interp(y,station,width))**2,0,1);lower=np.where(points[:,2]<axisHeight,co2,0);upper=np.where(points[:,2]>axisHeight,co2,0)
 dz=-(Evaluate(newLower,y)-Evaluate(oldLower,y))*lower-(Evaluate(newUpper,y)-Evaluate(oldUpper,y))*upper;delta=np.zeros_like(points);delta[:,2]=dz;return delta
def WorldVertices(obj):
 p=np.empty(len(obj.data.vertices)*3,dtype=np.float32);obj.data.vertices.foreach_get('co',p);p=p.reshape(-1,3).astype(float);M=np.array(obj.matrix_world);return p@M[:3,:3].T+M[:3,3]
def SetWorldVertices(obj,p):
 if obj.data.users>1:obj.data=obj.data.copy()
 M=np.array(obj.matrix_world.inverted());local=p@M[:3,:3].T+M[:3,3];obj.data.vertices.foreach_set('co',np.asarray(local,dtype=np.float32).ravel());obj.data.update()
 if obj.data.has_custom_normals:obj.data.normals_split_custom_set([(0.,0.,0.)]*len(obj.data.loops))
def Components(mesh):
 parent=list(range(len(mesh.vertices)))
 def Find(i):
  while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
  return i
 for edge in mesh.edges:
  a,b=map(Find,edge.vertices)
  if a!=b:parent[b]=a
 groups={}
 for i in range(len(parent)):groups.setdefault(Find(i),[]).append(i)
 return list(groups.values())
rivetGroups=Components(rivets.data);assert len(rivetGroups)==1512,('Original rivet component count',len(rivetGroups))
def HasAncestor(obj,names):
 while obj and obj!=root:
  if obj.name in names:return True
  obj=obj.parent
 return False
def IsWing(o):return bool(re.match(r'^(UpperWing_|LowerWing_|RibTape_(Upper|Lower)|AileronHingePin|Interplane_|FlyingWire_|Turnbuckle_|LightBombRack|RackHook)',o.name))or HasAncestor(o,{'Pivot_AileronLeft','Pivot_AileronRight'})
def IsEngine(o):return bool(re.match(r'^(Cowl|Engine|CylinderCoolingFin|RockerCover|Pushrod|IgnitionLead|Exhaust)',o.name))or HasAncestor(o,{'Pivot_Propeller'})
wingObjects=[o for o in originalObjects if IsWing(o)];engineObjects=[o for o in originalObjects if IsEngine(o)];assert not(set(wingObjects)&set(engineObjects))
wingTop=[o for o in wingObjects if o.parent not in wingObjects];engineTop=[o for o in engineObjects if o.parent not in engineObjects]
cabane=[bpy.data.objects['Cabane_'+n+side]for n in ['Front','Rear']for side in ['Left','Right']]
bodyDeformed=[o for o in originalMeshes if o.name=='Fuselage_Monocoque'or o.name.startswith(('Cockpit_Coaming','Cockpit_Lining','ObserverRingSupport'))]
windscreenGroups={i:[o for o in originalMeshes if re.match(r'^Windscreen(?:SideFrame|Side|Frame)?'+str(i)+r'(?:$|-?1$)',o.name)]for i in [1,2]}
assert all(len(v)==6 for v in windscreenGroups.values()),{k:[o.name for o in v]for k,v in windscreenGroups.items()}
observer=bpy.data.objects['Pivot_ObserverYaw']
while observer.parent and observer.parent!=root:observer=observer.parent
assert observer!=root;observerMeshes=[o for o in [observer]+list(observer.children_recursive)if o.type=='MESH']
allowed={o.name for o in wingObjects+engineObjects+cabane+bodyDeformed+observerMeshes+[rivets]if o.type=='MESH'}|{o.name for v in windscreenGroups.values()for o in v}
bpy.context.scene['Ki4DatumMutationInProgress']=True
sourceRoot.mkdir(parents=True);asset.mkdir(parents=True,exist_ok=True);(sourceRoot/'Evidence').mkdir();(sourceRoot/'Scripts').mkdir();(sourceRoot/'Exports').mkdir();(asset/'Evidence').mkdir(exist_ok=True)
appliedRecord={'state':'HeightBoundedSharedDatumGrayReconstructionCandidate_NotReferenceOrPbrAccepted','seedFitPath':str(fitPath),'seedFitSha256':hashlib.sha256(fitPath.read_bytes()).hexdigest(),'sharedApplied':shared,'floatHeightMarginM':1e-5,'photo02':fit['photo02'],'photo03':fit['photo03'],'ground':fit['ground'],'scope':'Unconfirmed photographic body/thrust alignment and exterior. Original whole-aircraft dimension gates enforced; no final photo, PBR, motion or game budget approval.'};(sourceRoot/'Data_DatumCandidateParameters.json').write_text(json.dumps(appliedRecord,indent=2),encoding='utf8')
shutil.copy2(fitPath,sourceRoot/'Data_NumericalFitSeed.json')
changedBody=[]
for obj in bodyDeformed:
 p=WorldVertices(obj);delta=Displacement(p);SetWorldVertices(obj,p+delta);changedBody.append({'name':obj.name,'maxDisplacementM':float(np.max(np.linalg.norm(delta,axis=1)))})
# Rivet heads follow their skin by rigid component transforms; ring dimensions
# and the 1512 closed component topologies remain unchanged.
p=WorldVertices(rivets);q=p.copy();rivetErrors=[]
for group in rivetGroups:
 indices=np.array(group);vertices=p[indices];center=vertices.mean(axis=0);cov=(vertices-center).T@(vertices-center);_,vectors=np.linalg.eigh(cov);normal=vectors[:,0];epsilon=1e-4;J=np.eye(3)
 for i in range(3):
  e=np.eye(3)[i]*epsilon;J[:,i]+=(Displacement((center+e)[None,:])[0]-Displacement((center-e)[None,:])[0])/(2*epsilon)
 newNormal=np.linalg.solve(J.T,normal);newNormal/=np.linalg.norm(newNormal);rotation=Vector(normal).rotation_difference(Vector(newNormal)).to_matrix();rr=np.array(rotation);moved=(vertices-center)@rr.T+center+Displacement(center[None,:])[0];q[indices]=moved;rivetErrors.append(float(max(abs(np.linalg.norm(moved-moved.mean(axis=0),axis=1)-np.linalg.norm(vertices-center,axis=1)))))
SetWorldVertices(rivets,q);assert max(rivetErrors)<1e-8
rivetSaved=WorldVertices(rivets);rivetQuantizedErrors=[]
for group in rivetGroups:
 indices=np.array(group);aa=p[indices];bb=rivetSaved[indices];rivetQuantizedErrors.append(float(max(abs(np.linalg.norm(aa-aa.mean(axis=0),axis=1)-np.linalg.norm(bb-bb.mean(axis=0),axis=1)))))
assert max(rivetQuantizedErrors)<1e-6
def FrameObjects(name,objects,origin,delta,rotation):
 frame=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(frame);frame.parent=root;frame.location=origin;frame.empty_display_type='ARROWS';frame.empty_display_size=.15;bpy.context.view_layer.update();inverse=frame.matrix_world.inverted()
 matrices={o.name:o.matrix_world.copy()for o in objects}
 for o in objects:o.parent=frame;o.matrix_parent_inverse=Matrix.Identity(4);o.matrix_basis=inverse@matrices[o.name]
 frame.location=origin+delta;frame.rotation_euler=rotation;bpy.context.view_layer.update();return frame
wingFrame=FrameObjects('Frame_SharedWingDatumV40',wingTop,wingOrigin,wingDelta,(theta,0,0));engineFrame=FrameObjects('Frame_SharedEngineDatumV40',engineTop,engineOrigin,Vector(),(theta,0,0));wingFrame['alignmentScope']='Photographic reconstruction hypothesis; original relative wing incidences and internal geometry retained';engineFrame['alignmentScope']='Complete engine retained rigidly; unconfirmed body/thrust relationship'
bodyTree=BVHTree.FromPolygons([Vector(p)for p in WorldVertices(body)],[list(p.vertices)for p in body.data.polygons])
cabaneRecords=[]
for obj in cabane:
 mesh=obj.data;z=[v.co.z for v in mesh.vertices];lo,hi=min(z),max(z);caps=[]
 for value in [lo,hi]:
  points=[obj.matrix_world@v.co for v in mesh.vertices if abs(v.co.z-value)<1e-6];caps.append(sum(points,Vector())/len(points))
 lower,upper=sorted(caps,key=lambda p:p.z);targetLower=lower+Vector(Displacement(np.array([lower]))[0]);targetUpper=wingMatrix@upper;outward=(targetUpper-targetLower).normalized();oldLength=(upper-lower).length
 hit,normal,face,distance=bodyTree.ray_cast(targetLower+outward*.01,-outward,.8);assert hit is not None,(obj.name,'Body skin ray missed');cosine=normal.dot(outward);assert cosine>.1,(obj.name,cosine)
 basisX=(obj.matrix_world.to_3x3()@Vector((1,0,0))).normalized();basisY=(obj.matrix_world.to_3x3()@Vector((0,1,0))).normalized();rx=max(abs(v.co.x)for v in mesh.vertices)*obj.scale.x;ry=max(abs(v.co.y)for v in mesh.vertices)*obj.scale.y
 projectedRadius=math.hypot(rx*normal.dot(basisX),ry*normal.dot(basisY));insertion=(projectedRadius+.003)/cosine;assert insertion<.15,(obj.name,insertion);oldGapAlongAxis=(targetLower-hit).dot(outward);targetLower=hit-outward*insertion;axis=targetUpper-targetLower;scale=obj.scale.copy();scale.z=axis.length/(hi-lo);obj.location=(targetLower+targetUpper)/2;obj.rotation_mode='QUATERNION';obj.rotation_quaternion=axis.to_track_quat('Z','Y');obj.scale=scale
 # Primary steel UVs use the actual ellipse arc and changed axial length.
 uv=mesh.uv_layers.get('UVMap');assert uv is not None
 angles=np.linspace(0,2*math.pi,2049);speed=np.sqrt((rx*np.sin(angles))**2+(ry*np.cos(angles))**2);arc=np.r_[0,np.cumsum((speed[:-1]+speed[1:])/2*np.diff(angles))]
 for polygon in mesh.polygons:
  values=[math.atan2(mesh.vertices[mesh.loops[i].vertex_index].co.y,mesh.vertices[mesh.loops[i].vertex_index].co.x)%(2*math.pi)for i in polygon.loop_indices];crosses=max(values)-min(values)>math.pi
  for index,angle in zip(polygon.loop_indices,values):
   point=mesh.vertices[mesh.loops[index].vertex_index].co
   if abs(polygon.normal.z)<.5:
    if crosses and angle<math.pi:angle+=2*math.pi
    u=(np.interp(angle%(2*math.pi),angles,arc)+math.floor(angle/(2*math.pi))*arc[-1])/1.5;uv.data[index].uv=(u,(point.z-lo)*scale.z/1.5)
   else:uv.data[index].uv=(point.x*scale.x/1.5,point.y*scale.y/1.5)
 mesh.update();bpy.context.view_layer.update();actual=[]
 for value in [lo,hi]:
  points=[obj.matrix_world@v.co for v in mesh.vertices if abs(v.co.z-value)<1e-6];actual.append(sum(points,Vector())/len(points))
 actual=sorted(actual,key=lambda p:p.z);error=max((actual[0]-targetLower).length,(actual[1]-targetUpper).length);assert error<2e-6,(obj.name,error);cabaneRecords.append({'name':obj.name,'lowerBodyBlenderM':list(targetLower),'upperWingBlenderM':list(targetUpper),'capAlignmentErrorM':error,'newLengthM':axis.length,'originalLengthM':oldLength,'bodySkinHitBlenderM':list(hit),'bodySkinNormalBlender':list(normal),'oldAirGapAlongAxisM':oldGapAlongAxis,'hiddenInsertionAlongAxisM':insertion,'primarySteelUvDomainM':[1.5,1.5]})
screenDeltas={}
for index,objects in windscreenGroups.items():
 points=WorldVertices(bpy.data.objects['Windscreen'+str(index)]);foot=points[points[:,2]<points[:,2].min()+.001];anchor=foot.mean(axis=0);delta=Vector(Displacement(anchor[None,:])[0]);screenDeltas[index]=delta
 for obj in objects:obj.matrix_world=Matrix.Translation(delta)@obj.matrix_world
observerAnchor=np.array(observer.matrix_world.translation);observerDelta=Vector(Displacement(observerAnchor[None,:])[0]);observer.matrix_world=Matrix.Translation(observerDelta)@observer.matrix_world
guideUpdates=[]
for guide in list(bpy.data.objects):
 if not guide.name.startswith('SourceGuide_'):continue
 originalName=guide.name[len('SourceGuide_'):]
 if re.match(r'^(Engine|Exhaust|Ignition)',originalName):guide.matrix_world=engineMatrix@guide.matrix_world;guideUpdates.append(guide.name)
 elif originalName.startswith('Windscreen'):
  match=re.search(r'(?:Frame|SideFrame)([12])',originalName)
  if match:guide.matrix_world=Matrix.Translation(screenDeltas[int(match[1])])@guide.matrix_world;guideUpdates.append(guide.name)
 elif originalName.startswith('Observer'):guide.matrix_world=Matrix.Translation(observerDelta)@guide.matrix_world;guideUpdates.append(guide.name)
bpy.context.view_layer.update();after={o.name:MeshFingerprint(o)for o in originalMeshes};unchanged={name:value for name,value in before.items()if name not in allowed};assert unchanged=={name:after[name]for name in unchanged},'Unrelated source mesh/UV/normal/material/transform changed';assert imagesBefore=={i.name:hashlib.sha256(i.packed_file.data).hexdigest()for i in bpy.data.images if i.packed_file}
low=np.full(3,np.inf);high=-low
for obj in originalMeshes:
 points=WorldVertices(obj);low=np.minimum(low,points.min(axis=0));high=np.maximum(high,points.max(axis=0))
dimensions=high-low;assert abs(dimensions[0]-12)<.002 and abs(dimensions[1]-8.25)<.05 and abs(dimensions[2]-3.31)<.04,dimensions.tolist()
triangles=0
for obj in originalMeshes:obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
assert triangles==rawTrianglesBefore,('Raw topology count changed',rawTrianglesBefore,triangles)
evaluatedAfter=EvaluatedTriangles(originalMeshes);assert evaluatedAfter==evaluatedBefore,'Evaluated per-part topology changed';evaluatedTriangles=sum(evaluatedAfter.values());assert evaluatedTriangles==351020,evaluatedTriangles
root['version']='20261027ReferenceV40GrayDatum';root['cabaneBodyConnection']='Axis extensions intersect actual body skin; internal sockets inferred';root['grayExportPreservesGlassRoles']=True;root['geometryUpdateScope']='HeightBoundedSharedPhotographicDatumGrayCandidate_PbrAndWholeFidelityPending';root['referenceFidelityPassed']=False;root['canonicalPromoted']=False;root['geometryAoPendingForChangedGeometry']=True;root['fuselageExteriorProfile']='SharedPhotographicEnvelopeV40';root['lowerExteriorOffsetsJson']=json.dumps(shared['lowerExteriorOffsetsYM']);root['upperExteriorOffsetsJson']=json.dumps(shared['upperExteriorOffsetsYM']);root['sharedDatumCandidateJson']=json.dumps(shared);root['wingDatumTransformBlenderMatrix']=json.dumps([list(row)for row in wingMatrix]);root['engineDatumTransformBlenderMatrix']=json.dumps([list(row)for row in engineMatrix]);root['bodyThrustAngleIsFactoryConfirmed']=False;root['wingInstallationScope']='Original printed wingform retained in Frame_SharedWingDatumV40; use full shared-datum matrix with legacy local offsets. Absolute installation is a photographic hypothesis.';root['engineAxisBlenderM']=list(engineMatrix@Vector((0,2.86,1.81)));root['nominalDimensionsCandidateBlenderM']=dimensions.tolist()
for path in [scriptPath]:
 text=bpy.data.texts.get(path.name)or bpy.data.texts.new(path.name);text.clear();text.write(path.read_text(encoding='utf8'));text.use_fake_user=True;shutil.copy2(path,sourceRoot/'Scripts'/path.name)
bpy.context.scene['Ki4DatumMutationInProgress']=False
author=sourceRoot/'Scene_NakajimaKi4.blend';bpy.ops.wm.save_as_mainfile(filepath=str(author),compress=True);authorSha=hashlib.sha256(author.read_bytes()).hexdigest();assert hashlib.sha256(base.read_bytes()).hexdigest()=='039d08ab88076bfae50301b12bb04aebb5b44de7b20153e6d225ef281554a529'
receipt={'state':'SavedIndependentHeightBoundedGrayDatumAuthor_NotPbrOrReferenceAccepted','inputSource':str(base),'sourcePath':str(author),'sourceSha256':authorSha,'seedFitSha256':appliedRecord['seedFitSha256'],'appliedShared':shared,'floatHeightMarginM':1e-5,'meshCount':len(originalMeshes),'triangles':evaluatedTriangles,'rawTriangles':triangles,'nominalDimensionsBlenderM':dimensions.tolist(),'unchangedSourceMeshes':unchanged,'changedSourceMeshes':{name:after[name]for name in before if after[name]!=before[name]},'original40PackedImagesUnchanged':imagesBefore,'bodyDeformation':changedBody,'rigidRivetComponents':len(rivetGroups),'rivetRigidRadiusErrorMaxM':max(rivetErrors),'rivetSavedQuantizedRadiusErrorMaxM':max(rivetQuantizedErrors),'wingTopObjects':[o.name for o in wingTop],'engineTopObjects':[o.name for o in engineTop],'cabaneConnections':cabaneRecords,'guideUpdates':guideUpdates,'scope':'Gray review candidate only. Printed dimensions remain within inherited gates. Shared body/thrust angle and external skin are inferred. All changed PBR/AO, exact source/reference/control/budget checks and canonical publication pending.'}
for directory in [sourceRoot/'Evidence',asset/'Evidence']:(directory/'Data_DatumCandidateAuthor.json').write_text(json.dumps(receipt,indent=2),encoding='utf8')
# Export gray from a transient state AFTER saving the complete editable author.
gray=bpy.data.materials.new('Material_Ki4DatumGrayReviewOnly');gray.use_nodes=True;bs=gray.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.43,.43,.43,1);bs.inputs['Roughness'].default_value=.72;bs.inputs['Metallic'].default_value=0
glassSlots={obj.name:list(obj.data.materials)for obj in originalMeshes if re.match(r'^Windscreen(?:[12]|Side[12]-?1)$',obj.name)}
for obj in originalMeshes:
 obj.data.materials.clear()
 for material in glassSlots.get(obj.name,[gray]):obj.data.materials.append(material)
bpy.ops.object.select_all(action='DESELECT')
for obj in [root]+list(root.children_recursive):obj.select_set(True)
bpy.context.view_layer.objects.active=root
target=sourceRoot/'Exports/Model_NakajimaKi4HighGray.glb';bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_normals=True,export_tangents=True,export_materials='EXPORT',export_animations=False,export_cameras=False,export_lights=False)
shutil.copy2(target,asset/target.name);receipt['grayExportPath']=str(target);receipt['grayExportSha256']=hashlib.sha256(target.read_bytes()).hexdigest()
for directory in [sourceRoot/'Evidence',asset/'Evidence']:(directory/'Data_DatumCandidateAuthor.json').write_text(json.dumps(receipt,indent=2),encoding='utf8')
recipe={'state':receipt['state'],'inputSource':str(base),'inputSourceSha256':'039d08ab88076bfae50301b12bb04aebb5b44de7b20153e6d225ef281554a529','sourceSha256':authorSha,'parameters':'Data_DatumCandidateParameters.json','script':str(scriptPath),'environment':{'KI4_SHARED_FIT':str(sourceRoot/'Data_NumericalFitSeed.json'),'KI4_SOURCE_ROOT':'Use a NEW external directory','KI4_ASSET_ROOT':'Use an ignored worktree directory'},'steps':['Open protected V38 through Script_BlenderMcp and execute DatumCandidate with this saved numerical seed.','Retain printed nominal dimension gates; transform wing/engine rigidly, skin by old-to-new smooth field,1512 heads by rigid components; rebuild cabane cap connections; retain unrelated source and40packed images.','Save editable source BEFORE replacing material slots for transient gray export. Never save transient gray export state over author.','Reopen author for fingerprint/image/dimension/source-script verification; stop owned Blender and scan.','Actual GLB reimport, exact source photo/caster/control checks, PBR/AO and game derivative remain required.']};(sourceRoot/'Data_BuildRecipe.json').write_text(json.dumps(recipe,indent=2),encoding='utf8');print(json.dumps({'state':receipt['state'],'source':str(author),'sha256':authorSha,'graySha256':receipt['grayExportSha256'],'triangles':evaluatedTriangles,'rawTriangles':triangles,'nominalDimensionsBlenderM':dimensions.tolist(),'unchangedMeshCount':len(unchanged),'changedMeshCount':len(receipt['changedSourceMeshes']),'packedImagesUnchanged':len(imagesBefore),'rivetComponents':len(rivetGroups),'cabaneMaxCapErrorM':max(r['capAlignmentErrorM']for r in cabaneRecords)}),flush=True)
