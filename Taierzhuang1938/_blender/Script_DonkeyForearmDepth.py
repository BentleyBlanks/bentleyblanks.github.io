"""Compact side-depth fit of the upper forearms after the strict joint recipe."""
import json,hashlib
from pathlib import Path
import numpy as np

def Smooth(a,b,v):
    t=np.clip((v-a)/(b-a),0,1);return t*t*(3-2*t)

def DepthField(points,masses,recipe):
    result=np.array(points,dtype=float,copy=True);height=points[:,2];support=Smooth(*recipe['lowerFadeM'],height)*(1-Smooth(*recipe['upperFadeM'],height))
    for label,side in enumerate(['Left','Right']):
        rows=np.array(recipe['profiles'][side]);centre,width,target=[np.interp(height,rows[:,0],rows[:,i]) for i in [1,2,3]];amount=recipe['strength']*support*Smooth(*recipe['ownershipFade'],masses[:,label]);result[:,1]+=(points[:,1]-centre)*(target/np.maximum(.03,width)-1)*amount
    return result

def DepthJacobian(points,masses,recipe):
    result=np.empty((len(points),3,3));epsilon=.00002
    for axis in range(3):
        a=points.copy();b=points.copy();a[:,axis]+=epsilon;b[:,axis]-=epsilon;result[:,:,axis]=(DepthField(a,masses,recipe)-DepthField(b,masses,recipe))/(2*epsilon)
    return result

def FitForearmDepth(scene,skin):
    import bpy,bmesh
    from mathutils import Vector
    if scene.get('DonkeyForearmDepthReport'):return json.loads(scene['DonkeyForearmDepthReport'])
    if not scene.get('DonkeyHoofColumnsReport'):raise RuntimeError('Forearm depth requires the completed post-joint anatomical fits')
    path=Path(scene['DonkeyCartProject'])/'_blender/Data_DonkeyForearmDepthV50.json';recipe=json.loads(path.read_text(encoding='utf-8'));masses=np.array([[sum(g.weight for g in v.groups if skin.vertex_groups[g.group].name.startswith('DonkeyFront'+side)) for side in ['Left','Right']] for v in skin.data.vertices]);points=np.array([v.co for v in skin.data.vertices],dtype=float);target=DepthField(points,masses,recipe);distance=np.linalg.norm(target-points,axis=1);ids=np.flatnonzero(distance>1e-9);jac=DepthJacobian(points[ids],masses[ids],recipe);minimum=float(np.linalg.det(jac).min());protected=float(distance[(points[:,2]<=recipe['lowerFadeM'][0])|(points[:,2]>=recipe['upperFadeM'][1])|(masses.max(axis=1)<=recipe['ownershipFade'][0])].max(initial=0))
    if minimum<.65 or distance.max()>.012 or protected>1e-9 or np.max(abs(target[:,[0,2]]-points[:,[0,2]]))>1e-9:raise RuntimeError('Forearm depth exceeded displacement, orientation or protected bounds')
    normals=None
    if skin.data.has_custom_normals:
        allJac=DepthJacobian(points,masses,recipe);vertices=np.array([loop.vertex_index for loop in skin.data.loops]);normals=np.array([n.vector for n in skin.data.corner_normals]);normals=np.einsum('nij,nj->ni',np.linalg.inv(allJac[vertices]).transpose(0,2,1),normals);normals/=np.maximum(1e-12,np.linalg.norm(normals,axis=1))[:,None]
    for i in ids:skin.data.vertices[int(i)].co=Vector(target[i])
    if normals is not None:skin.data.normals_split_custom_set(normals.tolist())
    skin.data.update();bm=bmesh.new();bm.from_mesh(skin.data);boundary=sum(e.is_boundary for e in bm.edges);nonmanifold=sum(not e.is_manifold for e in bm.edges);volume=bm.calc_volume(signed=True);bm.free()
    if boundary or nonmanifold or volume<=0:raise RuntimeError('Forearm depth damaged the closed skin')
    report={'version':'20261027ForearmDepthV50','recipe':str(path),'recipeSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'sourceBaselineGlbSha256':recipe['sourceBaselineGlbSha256'],'sourceImageSha256':recipe['sourceImageSha256'],'method':'partial side-depth correspondence to the visible original forearm with fur allowance; current centre paths and frontal widths retained; compact height and ownership fades protect the axillary roots, lower limbs and hooves',
        'referenceBoundaryInsetPixels':recipe['referenceBoundaryInsetPixels'],'strength':recipe['strength'],'lowerFadeM':recipe['lowerFadeM'],'upperFadeM':recipe['upperFadeM'],'ownershipFade':recipe['ownershipFade'],'verticesChanged':int(len(ids)),'maximumDisplacementM':float(distance.max()),'minimumSampledJacobian':minimum,'maximumProtectedDisplacementM':protected,
        'boundaryEdges':boundary,'nonmanifoldEdges':nonmanifold,'signedVolumeM3':volume,'bonesChanged':0,'weightsChanged':False,'trianglesAdded':0,'frontalWidthAndHeightChanged':False,'normalTransform':'inverse-transpose local field Jacobian'}
    scene['DonkeyForearmDepthReport']=json.dumps(report);(Path(scene['DonkeySourceRoot'])/'Review/Data_ForearmDepth.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');return report
