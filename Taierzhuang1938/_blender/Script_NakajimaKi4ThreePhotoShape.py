"""Independent V41-derived editable three-photo shape candidate.

Preserve the protected source and packed inputs. Rebuild actual attachments,
retain unit-scale control pivots, save the complete author before gray export.
This candidate remains unaccepted until exact native/reference/PBR checks pass.
"""
import bpy,pathlib,os,json,hashlib,ast,array,struct,math,shutil,re
import numpy as np
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree

scriptPath=pathlib.Path(globals().get('__file__','Taierzhuang1938/_blender/Script_NakajimaKi4ThreePhotoShape.py')).resolve();repo=scriptPath.parents[2]
parameterPath=pathlib.Path(os.environ.get('KI4_FIT_PARAMETERS',str(repo/'tmp/NakajimaKi4/ReferenceV42_ThreePhotoShape/Data_ThreePhotoShapeParameters.json')))
parameterBytes=parameterPath.read_bytes();parameters=json.loads(parameterBytes);shared=parameters['shared'];base=pathlib.Path(parameters['inputSource']);sourceRoot=pathlib.Path(parameters['sourceRoot']);asset=pathlib.Path(parameters['assetRoot'])
assert pathlib.Path(bpy.data.filepath).resolve()==base.resolve()
assert hashlib.sha256(base.read_bytes()).hexdigest()==parameters['inputSourceSha256']=='c82a0ba3c2e7934d41599369c688716ed7b99ca77fd386edde4d8172ec284eb5'
assert not sourceRoot.exists(),'Use a NEW external source directory'
assert not(asset/'Model_NakajimaKi4HighGray.glb').exists()
root=bpy.data.objects['NakajimaKi4'];assert root['version']=='20261027ReferenceV41TailStationGray'
assert not bpy.context.scene.get('Ki4ThreePhotoShapeMutationInProgress',False),'Reopen the protected source after an interrupted mutation'
assert max(abs(root.matrix_world[i][j]-(1 if i==j else 0))for i in range(4)for j in range(4))<1e-7
objects=list(root.children_recursive);meshes=[o for o in objects if o.type=='MESH'];assert len(meshes)==928

def LoadFunctions(path,names):
 tree=ast.parse(path.read_text(encoding='utf8'))
 for name in names:
  node=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name==name);exec(compile(ast.Module(body=[node],type_ignores=[]),str(path),'exec'),globals())
LoadFunctions(scriptPath.with_name('Script_NakajimaKi4MainGearUpdate.py'),['MeshFingerprint'])
LoadFunctions(scriptPath.with_name('Script_NakajimaKi4DatumCandidate.py'),['EvaluatedTriangles','Slopes','Evaluate','Displacement','WorldVertices','SetWorldVertices','Components','HasAncestor','IsWing','IsEngine'])
bpy.context.view_layer.update();before={o.name:MeshFingerprint(o)for o in meshes};packedBefore={image.name:hashlib.sha256(image.packed_file.data).hexdigest()for image in bpy.data.images if image.packed_file};assert len(packedBefore)==40
for obj in meshes:obj.data.calc_loop_triangles()
rawBefore=sum(len(o.data.loop_triangles)for o in meshes);evaluatedBefore=EvaluatedTriangles(meshes);assert rawBefore==348908 and sum(evaluatedBefore.values())==351020
oldLower=np.array(json.loads(root['lowerExteriorOffsetsJson']));oldUpper=np.array(json.loads(root['upperExteriorOffsetsJson']));newLower=np.array(shared['lowerExteriorOffsetsYM']);newUpper=np.array(shared['upperExteriorOffsetsYM']);assert np.max(abs(oldLower[:,0]-newLower[:,0]))<1e-12
station=oldLower[:,0];width=np.array([.088,.147,.248,.358,.430,.490,.575,.625,.620,.610,.590]);axisHeight=float(root['bodyLongitudinalAxisHeightM'])
C=np.array([[1,0,0],[0,0,1],[0,-1,0]],float)
def Gltf(points):return np.asarray(points)@C.T
def Blender(points):return np.asarray(points)@C
def Rotation(axis,angle):
 x,y,z=axis;c=math.cos(angle);s=math.sin(angle);a=1-c;return np.array([[c+x*x*a,x*y*a-z*s,x*z*a+y*s],[y*x*a+z*s,c+y*y*a,y*z*a-x*s],[z*x*a-y*s,z*y*a+x*s,c+z*z*a]])
def Caps(obj):
 z=[v.co.z for v in obj.data.vertices];points=[]
 for value in [min(z),max(z)]:
  p=[obj.matrix_world@v.co for v in obj.data.vertices if abs(v.co.z-value)<1e-6];points.append(sum(p,Vector())/len(p))
 return sorted(points,key=lambda p:p.z)

wingObjects=[o for o in objects if IsWing(o)];engineObjects=[o for o in objects if IsEngine(o)];body=bpy.data.objects['Fuselage_Monocoque'];rivets=bpy.data.objects['Surface_FlushRivetHeads'];bodyDeformed=[o for o in meshes if o.name=='Fuselage_Monocoque'or o.name.startswith(('Cockpit_Coaming','Cockpit_Lining','ObserverRingSupport'))]
screens={i:[o for o in meshes if re.match(r'^Windscreen(?:SideFrame|Side|Frame)?'+str(i)+r'(?:$|-?1$)',o.name)]for i in [1,2]};assert all(len(values)==6 for values in screens.values())
observer=bpy.data.objects['Pivot_ObserverYaw']
while observer.parent and observer.parent!=root:observer=observer.parent
observerMeshes=[o for o in [observer]+list(observer.children_recursive)if o.type=='MESH'];cabane=[bpy.data.objects['Cabane_'+position+side]for position in ['Front','Rear']for side in ['Left','Right']];braces=[bpy.data.objects['TailplaneBrace_'+side]for side in ['Left','Right']];oldRodCaps={o.name:Caps(o)for o in cabane+braces}
allowed={o.name for o in wingObjects+engineObjects+bodyDeformed+observerMeshes+cabane+braces+[rivets]if o.type=='MESH'}|{o.name for values in screens.values()for o in values}|{'Rudder','Tailplane_Left','Tailplane_Right','Elevator_Left','Elevator_Right'}
wingFrame=bpy.data.objects['Frame_SharedWingDatumV40'];engineFrame=bpy.data.objects['Frame_SharedEngineDatumV40'];oldWingMatrix=wingFrame.matrix_world.copy();oldEngineMatrix=engineFrame.matrix_world.copy()
bpy.context.scene['Ki4ThreePhotoShapeMutationInProgress']=True
bodyRows=[]
for obj in bodyDeformed:
 p=WorldVertices(obj);delta=Displacement(p);SetWorldVertices(obj,p+delta);bodyRows.append({'name':obj.name,'maximumDisplacementM':float(np.linalg.norm(delta,axis=1).max())})
groups=Components(rivets.data);assert len(groups)==1512;p=WorldVertices(rivets);q=p.copy();radiusErrors=[]
for indices in groups:
 indices=np.array(indices);points=p[indices];center=points.mean(axis=0);_,vectors=np.linalg.eigh((points-center).T@(points-center));normal=vectors[:,0];J=np.eye(3);epsilon=1e-4
 for axisIndex in range(3):
  e=np.eye(3)[axisIndex]*epsilon;J[:,axisIndex]+=(Displacement((center+e)[None,:])[0]-Displacement((center-e)[None,:])[0])/(2*epsilon)
 targetNormal=np.linalg.solve(J.T,normal);targetNormal/=np.linalg.norm(targetNormal);R=np.array(Vector(normal).rotation_difference(Vector(targetNormal)).to_matrix());moved=(points-center)@R.T+center+Displacement(center[None,:])[0];q[indices]=moved
SetWorldVertices(rivets,q);savedRivets=WorldVertices(rivets)
for indices in groups:
 aa=p[indices];bb=savedRivets[indices];radiusErrors.append(float(max(abs(np.linalg.norm(aa-aa.mean(axis=0),axis=1)-np.linalg.norm(bb-bb.mean(axis=0),axis=1)))))
assert max(radiusErrors)<1e-6
screenDeltas={}
for index,values in screens.items():
 points=WorldVertices(bpy.data.objects['Windscreen'+str(index)]);foot=points[points[:,2]<points[:,2].min()+.001];delta=Vector(Displacement(foot.mean(axis=0)[None,:])[0]);screenDeltas[index]=delta
 for obj in values:obj.matrix_world=Matrix.Translation(delta)@obj.matrix_world
observerDelta=Vector(Displacement(np.array(observer.matrix_world.translation)[None,:])[0]);observer.matrix_world=Matrix.Translation(observerDelta)@observer.matrix_world
theta=math.radians(shared['thrustBodyPitchDegrees']);d=shared['additionalWingPositionGltfM'];wingFrame.location=(0,1.2813982901-d[2],2.8206334265+d[1]);wingFrame.rotation_euler=(theta,0,0);engineFrame.location=(0,2.25,1.81);engineFrame.rotation_euler=(theta,0,0);bpy.context.view_layer.update();wingDelta=wingFrame.matrix_world@oldWingMatrix.inverted();engineDelta=engineFrame.matrix_world@oldEngineMatrix.inverted()

# Shape the unprinted aft rudder contour while retaining its post, balance horn,
# maximum chord and height. The smooth chord map has a positive Jacobian.
rudder=bpy.data.objects['Rudder'];oldRudder=Gltf(WorldVertices(rudder));hinge=np.array(shared['originalRudderHingeCenterGltfM']);hingeAxis=np.array(shared['originalRudderHingeAxisGltf']);aft=np.array(shared['rudderChordAftDirectionGltf']);envelope=np.array(shared['rudderEnvelopeGltfYAndChordM']);axisPoints=hinge+(oldRudder[:,1,None]-hinge[1])/hingeAxis[1]*hingeAxis;u=(oldRudder-axisPoints)@aft;chord=np.interp(oldRudder[:,1],envelope[:,0],envelope[:,1]);maximum=shared['rudderPrimaryMaximumChordM'];peak=shared['rudderProfilePeakGltfY'];minimum=float(oldRudder[:,1].min())
def Bump(y,low,high):
 t=np.clip((y-low)/(high-low),0,1);return np.where((y>low)&(y<high),np.sin(np.pi*t)**2,0.)
upper,lower=shared['rudderProfileAmplitudes'];dc=upper*Bump(oldRudder[:,1],peak,shared['rudderProfileUpperEndGltfY'])*(maximum-chord if upper>=0 else chord)+lower*Bump(oldRudder[:,1],minimum,peak)*(maximum-chord if lower>=0 else chord);fraction=np.clip(u/np.maximum(chord,1e-6),0,1);shift=np.where(u>0,dc*fraction*fraction*(3-2*fraction),0);newRudder=oldRudder+shift[:,None]*aft;assert 1-1.5*max(abs(upper),abs(lower))>.45
edges=np.array([list(edge.vertices)for edge in rudder.data.edges]);ys=np.unique(np.round(oldRudder[:,1],6));ys=np.clip(ys,minimum+2e-6,float(oldRudder[:,1].max())-2e-6)
def Envelope(points):
 axisPoints=hinge+(points[:,1,None]-hinge[1])/hingeAxis[1]*hingeAxis;q=np.c_[(points-axisPoints)@aft,points[:,1]];a=q[edges[:,0]];b=q[edges[:,1]];delta=b-a;result=[]
 for start in range(0,len(ys),64):
  y=ys[start:start+64,None];mask=(np.minimum(a[:,1],b[:,1])[None,:]<=y)&(np.maximum(a[:,1],b[:,1])[None,:]>=y)&(abs(delta[:,1])[None,:]>1e-10);values=a[None,:,0]+(y-a[None,:,1])/np.where(abs(delta[None,:,1])>1e-10,delta[None,:,1],1)*delta[None,:,0];result.extend(np.max(np.where(mask,values,-1e4),axis=1))
 return np.array(result)
oldEnvelope=Envelope(oldRudder);newEnvelope=Envelope(newRudder);assert oldEnvelope.min()>-1 and newEnvelope.min()>-1
areaDelta=float(np.trapezoid(newEnvelope-oldEnvelope,ys));oldBeforePocket=float(rudder['referenceSideAreaBeforePocketM2']);SetWorldVertices(rudder,Blender(newRudder));rudder['previousReferenceSideAreaBeforePocketM2']=oldBeforePocket;rudder['referenceSideAreaBeforePocketM2']=oldBeforePocket+areaDelta;rudder['contourUpdateScope']='Smooth photographic aft contour; same maximum875mm chord,1808.5mm height,205mm balance horn and inclined hinge. Before-pocket area updated by the independent exact side-envelope area delta; original98percent pocket-retention gate stays.'
rudder.data.calc_loop_triangles();rudderSideArea=sum(abs((rudder.data.vertices[t.vertices[1]].co-rudder.data.vertices[t.vertices[0]].co).cross(rudder.data.vertices[t.vertices[2]].co-rudder.data.vertices[t.vertices[0]].co).x)/2 for t in rudder.data.loop_triangles)/2;assert rudderSideArea>=rudder['referenceSideAreaBeforePocketM2']*.98

tailCenter=np.array(shared['tailSourceFrameCenterGltfM']);height=shared['tailHeightOffsetM'];incidence=math.radians(shared['tailIncidenceDegrees']);dihedral=math.radians(shared['tailDihedralDegrees']);tip=shared['tailTipSweepM'];tailRear=tailCenter[2]-.025;tailFrames={};tailRows=[]
def TailTip(points,label):
 table=np.array(shared['tailLeadingProfilesGltfAbsXAndZ']['tailFixedNear'if label=='Right'else'tailFixedFar']);span=np.abs(points[:,0]);b=np.clip((span-.98)/(2.18-.98),0,1)**2;distance=tailRear-np.interp(span,table[:,0],table[:,1]);weight=np.clip((tailRear-points[:,2])/np.maximum(distance,1e-6),0,1);result=points.copy();result[:,2]+=tip*b*weight;return result
def TailTransform(points,label,shape=False):
 p=TailTip(np.asarray(points),label)if shape else np.asarray(points).copy();p=p-tailCenter;p[:,0]/=math.cos(dihedral);side=1 if label=='Right'else-1;R=Rotation([0,0,1],side*dihedral)@Rotation([1,0,0],incidence);return p@R.T+tailCenter+[0,height,0]
for label in ['Left','Right']:
 fixed=bpy.data.objects['Tailplane_'+label];pivot=bpy.data.objects['Pivot_Elevator'+label];elevator=bpy.data.objects['Elevator_'+label];assert [o.name for o in pivot.children_recursive if o.type=='MESH']==[elevator.name]
 fixedOld=Gltf(WorldVertices(fixed));elevatorOld=Gltf(WorldVertices(elevator));fixedShape=TailTip(fixedOld,label);fixedShape[:,0]/=math.cos(dihedral);elevatorShape=elevatorOld.copy();elevatorShape[:,0]/=math.cos(dihedral)
 SetWorldVertices(fixed,Blender(fixedShape));SetWorldVertices(elevator,Blender(elevatorShape))
 # Regenerate the existing normalized physical tail-atlas coordinates before
 # rigid installation. Do not change or regenerate any packed image here.
 for obj,points in [(fixed,fixedShape),(elevator,elevatorShape)]:
  uv=obj.data.uv_layers.get('UVMap');assert uv
  for loop in obj.data.loops:
   x,y,z=points[loop.vertex_index];physicalU=(x+2.18)/4.36;physicalV=(-z-shared['originalTailForwardShiftM']+4.567)/1.60;pixelY=16+(1-physicalV)*992;uv.data[loop.index].uv=((16+physicalU*4064)/4096,1-pixelY/2048)
 frameName='Frame_HorizontalTail'+label+'V42';assert frameName not in bpy.data.objects;frame=bpy.data.objects.new(frameName,None);bpy.context.scene.collection.objects.link(frame);frame.parent=root;frame.location=Vector(Blender(tailCenter));bpy.context.view_layer.update();inverse=frame.matrix_world.inverted()
 for obj in [fixed,pivot]:
  world=obj.matrix_world.copy();obj.parent=frame;obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=inverse@world
 side=1 if label=='Right'else-1;R=Rotation([0,0,1],side*dihedral)@Rotation([1,0,0],incidence);frame.rotation_mode='QUATERNION';frame.rotation_quaternion=Matrix((C.T@R@C).tolist()).to_quaternion();frame.location=Vector(Blender(tailCenter+np.array([0,height,0])));frame['installationScope']='Photographic reconstruction hypothesis, not a factory incidence/dihedral setting';tailFrames[label]=frame;tailRows.append({'side':label,'newFrame':frameName})
bpy.context.view_layer.update()
# The rudder atlas is measured in the un-yawed original body plane.
finFrame=bpy.data.objects['Frame_VerticalTailIncidence'];unYaw=finFrame.matrix_world.inverted();uv=rudder.data.uv_layers.get('UVMap');assert uv
for loop in rudder.data.loops:
 p=unYaw@(rudder.matrix_world@rudder.data.vertices[loop.vertex_index].co)+finFrame.matrix_world.translation;physicalU=(p.z-1.42)/1.8085;physicalV=(p.y+4.70)/1.85;pixelY=1040+(1-physicalV)*992;uv.data[loop.index].uv=((16+physicalU*4064)/4096,1-pixelY/2048)

bodyTree=BVHTree.FromPolygons([Vector(p)for p in WorldVertices(body)],[list(face.vertices)for face in body.data.polygons]);rodRows=[]
def Tree(obj):return BVHTree.FromPolygons([Vector(p)for p in WorldVertices(obj)],[list(face.vertices)for face in obj.data.polygons])
def Inside(tree,point):
 hit,normal,index,distance=tree.find_nearest(point);return hit is not None and normal.dot(point-hit)<=1e-5
def PlaceRod(obj,lower,upper):
 values=[v.co.z for v in obj.data.vertices];lo,hi=min(values),max(values);axis=upper-lower;scale=obj.scale.copy();scale.z=axis.length/(hi-lo);obj.location=(lower+upper)/2;obj.rotation_mode='QUATERNION';obj.rotation_quaternion=axis.to_track_quat('Z','Y');obj.scale=scale;obj.data.update();bpy.context.view_layer.update();return lo,hi
def CapPoints(obj,value):return[obj.matrix_world@v.co for v in obj.data.vertices if abs(v.co.z-value)<1e-6]
def UpdateRod(obj,lowerGuess,upperGuess,upperTree=None):
 direction=(upperGuess-lowerGuess).normalized();hit,normal,index,distance=bodyTree.ray_cast(lowerGuess+direction*.25,-direction,1.0);assert hit is not None and normal.dot(direction)>.1,(obj.name,'Body connection ray')
 track=direction.to_track_quat('Z','Y').to_matrix();basisX=track@Vector((1,0,0));basisY=track@Vector((0,1,0));rx=max(abs(v.co.x)for v in obj.data.vertices)*obj.scale.x;ry=max(abs(v.co.y)for v in obj.data.vertices)*obj.scale.y
 projectedRadius=math.hypot(rx*normal.dot(basisX),ry*normal.dot(basisY));lowerInsertion=(projectedRadius+.003)/normal.dot(direction);upperInsertion=.020;lower=hit-direction*lowerInsertion;upper=upperGuess.copy()
 if upperTree:
  upperHit,upperNormal,index,distance=upperTree.ray_cast(upperGuess-direction*.20,direction,.8);assert upperHit is not None and upperNormal.dot(direction)<-.1,(obj.name,'Tail connection ray');upperRadius=math.hypot(rx*upperNormal.dot(basisX),ry*upperNormal.dot(basisY));upperInsertion=(upperRadius+.003)/(-upperNormal.dot(direction));upper=upperHit+direction*upperInsertion
 for attempt in range(20):
  lo,hi=PlaceRod(obj,lower,upper);lowerInside=all(Inside(bodyTree,p)for p in CapPoints(obj,lo));upperInside=not upperTree or all(Inside(upperTree,p)for p in CapPoints(obj,hi))
  if lowerInside and upperInside:break
  if not lowerInside:lowerInsertion+=.004;lower=hit-direction*lowerInsertion
  if not upperInside:upperInsertion+=.003;upper=upperHit+direction*upperInsertion
 assert lowerInside and upperInside,(obj.name,'Cap insertion failed',lowerInsertion,upperInsertion)
 assert lowerInsertion<.15 and upperInsertion<.08
 # True metre UVs on the unchanged elliptical steel cross section.
 mesh=obj.data;rx=max(abs(v.co.x)for v in mesh.vertices)*obj.scale.x;ry=max(abs(v.co.y)for v in mesh.vertices)*obj.scale.y;angles=np.linspace(0,2*math.pi,2049);speed=np.sqrt((rx*np.sin(angles))**2+(ry*np.cos(angles))**2);arc=np.r_[0,np.cumsum((speed[:-1]+speed[1:])/2*np.diff(angles))];uv=mesh.uv_layers.get('UVMap');assert uv
 for face in mesh.polygons:
  values=[math.atan2(mesh.vertices[mesh.loops[i].vertex_index].co.y,mesh.vertices[mesh.loops[i].vertex_index].co.x)%(2*math.pi)for i in face.loop_indices];crosses=max(values)-min(values)>math.pi
  for loopIndex,angle in zip(face.loop_indices,values):
   p=mesh.vertices[mesh.loops[loopIndex].vertex_index].co
   if abs(face.normal.z)<.5:
    if crosses and angle<math.pi:angle+=2*math.pi
    u=(np.interp(angle%(2*math.pi),angles,arc)+math.floor(angle/(2*math.pi))*arc[-1])/1.5;uv.data[loopIndex].uv=(u,(p.z-lo)*obj.scale.z/1.5)
   else:uv.data[loopIndex].uv=(p.x*obj.scale.x/1.5,p.y*obj.scale.y/1.5)
 actual=Caps(obj);error=max((actual[0]-lower).length,(actual[1]-upper).length);assert error<3e-6;rodRows.append({'name':obj.name,'lowerBodyBlenderM':list(lower),'upperJointBlenderM':list(upper),'capAlignmentErrorM':error,'lowerCapInsideBodyHull':lowerInside,'upperCapInsideTailHull':upperInside if upperTree else None,'lowerHiddenInsertionM':lowerInsertion,'upperHiddenInsertionM':upperInsertion if upperTree else None,'primarySteelUvDomainM':[1.5,1.5]})
for obj in cabane:
 lower,upper=oldRodCaps[obj.name];targetLower=lower+Vector(Displacement(np.array(lower)[None,:])[0]);targetUpper=wingDelta@upper;UpdateRod(obj,targetLower,targetUpper)
for obj in braces:
 label='Left'if obj.name.endswith('Left')else'Right';lower,upper=oldRodCaps[obj.name];targetLower=lower+Vector(Displacement(np.array(lower)[None,:])[0]);targetUpper=Vector(Blender(TailTransform(Gltf(np.array(upper)[None,:]),label,True))[0]);UpdateRod(obj,targetLower,targetUpper,Tree(bpy.data.objects['Tailplane_'+label]))
guideUpdates=[]
for guide in list(bpy.data.objects):
 if not guide.name.startswith('SourceGuide_'):continue
 name=guide.name[len('SourceGuide_'):]
 if re.match(r'^(Engine|Exhaust|Ignition)',name):guide.matrix_world=engineDelta@guide.matrix_world;guideUpdates.append(guide.name)
 elif name.startswith('Windscreen'):
  match=re.search(r'(?:Frame|SideFrame)([12])',name)
  if match:guide.matrix_world=Matrix.Translation(screenDeltas[int(match[1])])@guide.matrix_world;guideUpdates.append(guide.name)
 elif name.startswith('Observer'):guide.matrix_world=Matrix.Translation(observerDelta)@guide.matrix_world;guideUpdates.append(guide.name)
bpy.context.view_layer.update();after={o.name:MeshFingerprint(o)for o in meshes};unchanged={name:value for name,value in before.items()if name not in allowed};assert unchanged=={name:after[name]for name in unchanged};assert packedBefore=={image.name:hashlib.sha256(image.packed_file.data).hexdigest()for image in bpy.data.images if image.packed_file}
evaluatedAfter=EvaluatedTriangles(meshes);assert evaluatedAfter==evaluatedBefore
low=np.full(3,np.inf);high=-low
for obj in meshes:
 p=WorldVertices(obj);low=np.minimum(low,p.min(axis=0));high=np.maximum(high,p.max(axis=0))
dimensions=high-low;assert abs(dimensions[0]-12)<.002 and abs(dimensions[1]-8.25)<.05 and abs(dimensions[2]-3.31)<.04;expected=np.array(parameters['nominalDimensionsGltfM'])[[0,2,1]];assert max(abs(dimensions-expected))<3e-5,(dimensions.tolist(),expected.tolist())
controls=[o for o in root.children_recursive if o.name.startswith('Pivot_')];assert len(controls)==10
for pivot in controls:assert max(abs(value-1)for value in pivot.matrix_world.to_scale())<2e-6,pivot.name
root['wingDatumTransformBlenderMatrix']=json.dumps([list(row)for row in wingFrame.matrix_world@Matrix.Translation(Vector((0,-1.2813982901,-2.8206334265)))])
root['engineDatumTransformBlenderMatrix']=json.dumps([list(row)for row in engineFrame.matrix_world@Matrix.Translation(Vector((0,-2.25,-1.81)))])
root['fuselageExteriorProfile']='SharedThreePhotoEnvelopeV42'
root['version']='20261027ReferenceV42ThreePhotoShapeGray';root['referenceFidelityPassed']=False;root['canonicalPromoted']=False;root['geometryAoPendingForChangedGeometry']=True;root['threePhotoParametersSha256']=hashlib.sha256(parameterBytes).hexdigest();root['lowerExteriorOffsetsJson']=json.dumps(shared['lowerExteriorOffsetsYM']);root['upperExteriorOffsetsJson']=json.dumps(shared['upperExteriorOffsetsYM']);root['sharedDatumCandidateJson']=json.dumps({key:value for key,value in shared.items()if'Envelope'not in key and'Profiles'not in key});root['bodyThrustAngleIsFactoryConfirmed']=False;root['tailInstallationHeightFactoryConfirmed']=False;root['tailInstallationIncidenceFactoryConfirmed']=False;root['tailInstallationDihedralFactoryConfirmed']=False;root['tailElevatorAxisBlenderM']=list(bpy.data.objects['Pivot_ElevatorRight'].matrix_world.translation);root['engineAxisBlenderM']=list(engineDelta@Vector(root['engineAxisBlenderM']));root['nominalDimensionsCandidateBlenderM']=dimensions.tolist();root['geometryUpdateScope']='Three-photo unprinted contour reconstruction; several original reference and ground gates still fail; PBR/AO and complete native/game approval pending'
sourceRoot.mkdir(parents=True);(sourceRoot/'Evidence').mkdir();(sourceRoot/'Scripts').mkdir();(sourceRoot/'Exports').mkdir();(asset/'Evidence').mkdir(exist_ok=True);shutil.copy2(parameterPath,sourceRoot/parameterPath.name)
for name in ['Script_NakajimaKi4ThreePhotoShape.py','Script_NakajimaKi4DatumCandidate.py','Script_NakajimaKi4MainGearUpdate.py']:
 path=scriptPath.with_name(name);text=bpy.data.texts.get(name)or bpy.data.texts.new(name);text.clear();text.write(path.read_text(encoding='utf8'));text.use_fake_user=True;shutil.copy2(path,sourceRoot/'Scripts'/name)
bpy.context.scene['Ki4ThreePhotoShapeMutationInProgress']=False;author=sourceRoot/'Scene_NakajimaKi4.blend'
record={'state':'IndependentThreePhotoShapeAuthor_SavePending_ReferenceAndPbrUnaccepted','inputSource':str(base),'inputSourceSha256':parameters['inputSourceSha256'],'inputHighGraySha256':parameters['inputHighGraySha256'],'sourcePath':str(author),'sourceSha256':None,'parameterSha256':hashlib.sha256(parameterBytes).hexdigest(),'meshCount':928,'rawTriangles':rawBefore,'evaluatedTriangles':sum(evaluatedAfter.values()),'nominalDimensionsBlenderM':dimensions.tolist(),'unchangedSourceMeshes':unchanged,'changedSourceMeshes':{name:after[name]for name in before if after[name]!=before[name]},'allExpectedSourceMeshes':after,'originalPackedImagesUnchanged':packedBefore,'bodyChanges':bodyRows,'rivetComponents':1512,'rivetSavedRadiusErrorMaxM':max(radiusErrors),'rodConnections':rodRows,'tailFrames':tailRows,'rudderBeforePocketAreaOldM2':oldBeforePocket,'rudderBeforePocketAreaNewM2':rudder['referenceSideAreaBeforePocketM2'],'rudderIndependentEnvelopeAreaDeltaM2':areaDelta,'rudderActualSideAreaM2':rudderSideArea,'scope':parameters['scope']}
for directory in [sourceRoot/'Evidence',asset/'Evidence']:(directory/'Data_ThreePhotoShapeAuthor.json').write_text(json.dumps(record,indent=2),encoding='utf8')
bpy.ops.wm.save_as_mainfile(filepath=str(author),compress=True);record['sourceSha256']=hashlib.sha256(author.read_bytes()).hexdigest();record['state']='SavedIndependentThreePhotoShapeAuthor_ExactNativeAndPbrPending'
for directory in [sourceRoot/'Evidence',asset/'Evidence']:(directory/'Data_ThreePhotoShapeAuthor.json').write_text(json.dumps(record,indent=2),encoding='utf8')
# Transient gray export after the complete editable, packed author is saved.
gray=bpy.data.materials.new('Material_Ki4ThreePhotoGrayReviewOnly');gray.use_nodes=True;bs=gray.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.43,.43,.43,1);bs.inputs['Roughness'].default_value=.72;glass={o.name:list(o.data.materials)for o in meshes if re.match(r'^Windscreen(?:[12]|Side[12]-?1)$',o.name)}
for obj in meshes:
 obj.data.materials.clear()
 for material in glass.get(obj.name,[gray]):obj.data.materials.append(material)
bpy.ops.object.select_all(action='DESELECT')
for obj in [root]+list(root.children_recursive):obj.select_set(True)
bpy.context.view_layer.objects.active=root;target=sourceRoot/'Exports/Model_NakajimaKi4HighGray.glb';bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_normals=True,export_tangents=False,export_materials='EXPORT',export_animations=False,export_cameras=False,export_lights=False);shutil.copy2(target,asset/target.name);record['grayExportSha256']=hashlib.sha256(target.read_bytes()).hexdigest();record['grayExportPath']=str(target)
for directory in [sourceRoot/'Evidence',asset/'Evidence']:(directory/'Data_ThreePhotoShapeAuthor.json').write_text(json.dumps(record,indent=2),encoding='utf8')
recipe={'state':record['state'],'inputSource':str(base),'inputSourceSha256':parameters['inputSourceSha256'],'outputSourceSha256':record['sourceSha256'],'parameters':parameterPath.name,'script':scriptPath.name,'steps':['Open protected V41 through the owned worktree BlenderMCP helper. Use new external source and ignored asset directories in the frozen parameters.','Retarget shared body/wing/engine, rigid rivet components and skin attachments. Reconstruct the unprinted rudder/outer-tail contours; retain primary dimensions and true unit-scale hinges.','Rebuild six rod endpoints into the actual body/tail hulls and metre steel UVs. Keep all original packed inputs. Save author before transient gray/clear-glass export.','Reopen source, reimport actual GLB, verify mesh/image identity, all photographed features, actual casters and full motion. Stop the owned Blender and scan.','Several original numeric reference/ground gates remain failed in this gray candidate. PBR/AO, game derivation and canonical publication remain mandatory and unapproved.']};(sourceRoot/'Data_BuildRecipe.json').write_text(json.dumps(recipe,indent=2),encoding='utf8');print(json.dumps({'state':record['state'],'source':str(author),'sourceSha256':record['sourceSha256'],'graySha256':record['grayExportSha256'],'triangles':record['evaluatedTriangles'],'changedMeshes':len(record['changedSourceMeshes']),'unchangedMeshes':len(unchanged),'dimensionsBlenderM':dimensions.tolist(),'packedImages':len(packedBefore),'rodEndpoints':len(rodRows),'rudderAreaRetention':rudderSideArea/rudder['referenceSideAreaBeforePocketM2']}),flush=True)
