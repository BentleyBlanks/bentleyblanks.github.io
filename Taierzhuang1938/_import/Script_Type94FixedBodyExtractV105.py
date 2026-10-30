"""Read current fixed-body surfaces from actual GLB for reference fitting."""
from pathlib import Path
import hashlib,importlib.util,json,numpy as np
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'ReferenceV105'
for name in ['Acceptance','Inputs','Rebuild']:(root/name).mkdir(parents=True,exist_ok=True)
manifest=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV102.json').read_text());file=Path(__file__).with_name('Script_VerifyType94GameV100.py');spec=importlib.util.spec_from_file_location('FixedBody105Actual',file);actual=importlib.util.module_from_spec(spec);spec.loader.exec_module(actual);model=actual.Read(manifest['sourceGlb'],False);assert model['sha256']==manifest['sha256']
ground=json.loads((repo/'tmp/Type94TowMaterialReferenceV96/Data_Model.json').read_text())['variants']['V96']['audit']['groundCompensationM'];p,t=actual.Mesh(model,'Geometry_Hull_Paint');world=(np.c_[p,np.ones(len(p))]@model['worldMatrices']['Geometry_Hull_Paint'].T)[:,:3];points=world[:,[0,2,1]]*[1,-1,1]-[0,0,ground];vertices,codes=np.unique(points,axis=0,return_inverse=True);faces=codes[t];parents=np.arange(len(vertices))
def Find(i):
    while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
    return i
for face in faces:
    a=Find(face[0])
    for i in face[1:]:
        b=Find(i)
        if a!=b:parents[b]=a
components={}
for i in range(len(vertices)):components.setdefault(Find(i),[]).append(i)
groups=[np.array(ids)for ids in components.values()];candidates=[]
normal=np.asarray(json.loads((base/'ReferenceV73/Inputs/Data_FrontFastenerObservationsV73.json').read_text())['normal'])
for index,ids in enumerate(groups):
    v=vertices[ids]
    if 10<=len(v)<=100 and max(np.ptp(v,axis=0))<.06:
        depth=v@normal;crown=v[depth>depth.max()-2e-6].mean(axis=0);candidates.append(dict(component=index,sourceVertexCount=len(v),crown=crown,minimum=v.min(axis=0),maximum=v.max(axis=0)))
earOwner='Geometry_FrontCornerEarRight_Paint';ep,et=actual.Mesh(model,earOwner);ew=(np.c_[ep,np.ones(len(ep))]@model['worldMatrices'][earOwner].T)[:,:3];earVertices,earCodes=np.unique(ew[:,[0,2,1]]*[1,-1,1]-[0,0,ground],axis=0,return_inverse=True);earParents=np.arange(len(earVertices))
def EarFind(i):
    while earParents[i]!=i:earParents[i]=earParents[earParents[i]];i=earParents[i]
    return i
for face in earCodes[et]:
    a=EarFind(face[0])
    for i in face[1:]:earParents[EarFind(i)]=a
earParts={}
for i in range(len(earVertices)):earParts.setdefault(EarFind(i),[]).append(i)
assert sorted(map(len,earParts.values()))==[16,18,18]
heads=[]
for ids in earParts.values():
    if len(ids)!=18:continue
    v=earVertices[ids];depth=v@normal;heads.append(v[depth>depth.max()-2e-6].mean(axis=0))
earUpper=max(heads,key=lambda p:p[2]);earReference=json.loads((base/'FrontCornerV81/Acceptance/Data_EarPairIdentityV81.json').read_text());oldUpper=next(r['fitFrameM']for r in earReference['heads']if r['name']=='UpperHead');assert np.linalg.norm(earUpper-oldUpper)<2e-6
front=json.loads((base/'ReferenceV104/Inputs/Data_FixedFrontObservationsV104.json').read_text());rows=[];bindings=[];excluded=[]
for row in front['rows']:
    # V74 explicitly left these curved-casing observations unplaced. Their
    # conditional plane rays are not current vehicle surfaces or camera data.
    if row['name']in ['NearMiddleEdge','NearBottomEdge']:
        excluded.append(dict(name=row['name'],reason='V74 explicitly unplaced curved-casing observation; conditional front-plane point is not actual modeled crown',photographicObservationRetained=True));continue
    expected=np.asarray(row['fitFrameConditionalPointM'])
    if row['name']=='FarUpperEdge':part=dict(crown=earUpper,component='UpperHead',sourceVertexCount=18);owner=earOwner;bindingKind='V81 actual ear head replaces obsolete V73 conditional plane point'
    else:part=min(candidates,key=lambda c:np.linalg.norm(c['crown']-expected));owner='Geometry_Hull_Paint';bindingKind='Actual retained V74 angular crown';assert np.linalg.norm(part['crown']-expected)<2e-6,row['name']
    delta=float(np.linalg.norm(part['crown']-expected));bindings.append(dict(name=row['name'],owner=owner,bindingKind=bindingKind,component=part['component'],sourceVertexCount=part['sourceVertexCount'],actualCrownFitFrameM=part['crown'].tolist(),conditionalDatumDifferenceM=delta,feature='Actual angular crown face mean along front-plane normal; not mechanical axis'))
    for camera,pixel in [('2017',row['primaryNative']),('2014',row['secondaryNative'])]:rows.append(dict(name=row['name'],camera=camera,pointFitFrameM=part['crown'].tolist(),observedNative=pixel,sigmaNative=4 if camera=='2017'else row['sigmaNative'],group='Front',training=row['training'],primaryPlacementPhotoGuided=True,correspondence='Candidate same crown face centre; profile remains inferred'))
rear=json.loads((base/'ReferenceV88/Acceptance/Data_ActualRearSkinEdgeV89.json').read_text());observations=json.loads((base/'ReferenceV88/Inputs/Data_RearJunctionsV88.json').read_text())['rows'];rearBindings=[]
rearOwner='Geometry_NoseHousing_Paint';rp,rt=actual.Mesh(model,rearOwner);rw=(np.c_[rp,np.ones(len(rp))]@model['worldMatrices'][rearOwner].T)[:,:3];rearVertices=rw[:,[0,2,1]]*[1,-1,1]-[0,0,ground]
for name,old in zip(['CowlRearNear','CowlRearFar'],rear['actualRearEdgeFitFrameM']):
    distances=np.linalg.norm(rearVertices-old,axis=1);i=int(np.argmin(distances));delta=float(distances[i]);assert delta<2e-6,(name,delta);value=rearVertices[i];rearBindings.append(dict(name=name,owner=rearOwner,actualVertexFitFrameM=value.tolist(),oldReadoutDifferenceM=delta))
    for obs in observations:rows.append(dict(name=name,camera=obs['camera'],pointFitFrameM=value.tolist(),observedNative=obs['nearNative'if name.endswith('Near')else'farNative'],sigmaNative=obs['sigmaNative'],group='Rear',training=True,correspondence='Approximate apparent junction compared to actual beveled skin edge; not a surveyed sharp vertex'))
report=dict(schema='Type94CurrentFixedBodyReadoutV1',sourceGlb=manifest['sourceGlb'],sha256=model['sha256'],groundCompensationM=ground,hullPositionFaceSha256=hashlib.sha256(vertices.astype('<f8').tobytes()+faces.astype('<i8').tobytes()).hexdigest(),hullGeometricComponents=len(groups),frontBindings=bindings,excludedFrontObservations=excluded,rearBindings=rearBindings,rows=rows,driverMidSurfaceDatumsExcluded=True,geometryChanged=False,cameraChanged=False,wholeReferenceAccepted=False,scope='Fresh actual exported fixed surfaces. Image correspondences remain approximate and primary placement is photo guided; no survey or independent primary test is implied.')
(root/'Acceptance/Data_ActualFixedBodyV105.json').write_text(json.dumps(report,indent=2)+'\n');(root/'Inputs/Data_FixedBodyObservationsV105.json').write_text(json.dumps(dict(rows=rows,sourceReadoutSha256=hashlib.sha256((root/'Acceptance/Data_ActualFixedBodyV105.json').read_bytes()).hexdigest(),notBlindHoldout=True),indent=2)+'\n');print(json.dumps(dict(hullComponents=len(groups),frontCrownCount=len(bindings),rearVertices=len(rearBindings),rows=len(rows),maximumFrontDatumDifferenceM=max(r['conditionalDatumDifferenceM']for r in bindings))))
