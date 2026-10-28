"""Reference-width correction after strict joint fitting; hoof and root protected."""
import json,hashlib
from pathlib import Path
import numpy as np
_sectionNamespace={}
if '__file__' in globals():_sectionFile=Path(__file__).with_name('Script_DonkeySectionCurve.py')
else:
    import bpy
    _sectionFile=Path(bpy.context.scene['DonkeyCartProject'])/'_blender/Script_DonkeySectionCurve.py'
exec(compile(_sectionFile.read_text(encoding='utf-8'),_sectionFile.name,'exec'),_sectionNamespace)
SampleSectionCurve=_sectionNamespace['SampleSectionCurve']

def Smooth(a,b,value):
    t=np.clip((value-a)/(b-a),0,1);return t*t*(3-2*t)

def ForeField(points,masses,recipe):
    result=np.array(points,dtype=float,copy=True);height=result[:,2]
    support=Smooth(*recipe['lowerFadeM'],height)*(1-Smooth(*recipe['upperFadeM'],height))
    for label,side in enumerate(['Left','Right']):
        rows=np.array(recipe['profiles'][side]);a,b,c,d=[SampleSectionCurve(height,rows,i) for i in [1,2,3,4]]
        wanted=c+(points[:,0]-a)*(d-c)/np.maximum(.02,b-a)
        amount=recipe['strength']*support*Smooth(*recipe['ownershipFade'],masses[:,label]);result[:,0]+=(wanted-points[:,0])*amount
    return result

def ForeJacobian(points,masses,recipe):
    result=np.empty((len(points),3,3));epsilon=.00002
    for axis in range(3):
        a=points.copy();b=points.copy();a[:,axis]+=epsilon;b[:,axis]-=epsilon
        result[:,:,axis]=(ForeField(a,masses,recipe)-ForeField(b,masses,recipe))/(2*epsilon)
    return result

def FitForeSilhouette(scene,skin):
    import bpy,bmesh
    from mathutils import Vector
    if scene.get('DonkeyForeSilhouetteReport'):return json.loads(scene['DonkeyForeSilhouetteReport'])
    if not scene.get('DonkeyChestVolumeReport') or not scene.get('DonkeyJointPlanesReport'):raise RuntimeError('Fore silhouette requires completed joint planes and chest volume')
    path=Path(scene['DonkeyCartProject'])/'_blender/Data_DonkeyForeSilhouetteV48.json';recipe=json.loads(path.read_text(encoding='utf-8'))
    masses=np.array([[sum(g.weight for g in v.groups if skin.vertex_groups[g.group].name.startswith('DonkeyFront'+side)) for side in ['Left','Right']] for v in skin.data.vertices]);points=np.array([v.co for v in skin.data.vertices],dtype=float);target=ForeField(points,masses,recipe);distance=np.linalg.norm(target-points,axis=1);ids=np.flatnonzero(distance>1e-9)
    jac=ForeJacobian(points[ids],masses[ids],recipe);minimum=float(np.linalg.det(jac).min());protected=float(distance[(points[:,2]<=recipe['lowerFadeM'][0])|(points[:,2]>=recipe['upperFadeM'][1])|(masses.max(axis=1)<=recipe['ownershipFade'][0])].max(initial=0))
    if minimum<.65 or distance.max()>.015 or protected>1e-9 or np.max(abs(target[:,1:]-points[:,1:]))>1e-9:raise RuntimeError('Fore silhouette exceeded its orientation, displacement or protection bounds')
    normals=None
    if skin.data.has_custom_normals:
        allJac=ForeJacobian(points,masses,recipe);vertices=np.array([loop.vertex_index for loop in skin.data.loops]);normals=np.array([n.vector for n in skin.data.corner_normals]);normals=np.einsum('nij,nj->ni',np.linalg.inv(allJac[vertices]).transpose(0,2,1),normals);normals/=np.maximum(1e-12,np.linalg.norm(normals,axis=1))[:,None]
    for i in ids:skin.data.vertices[int(i)].co=Vector(target[i])
    if normals is not None:skin.data.normals_split_custom_set(normals.tolist())
    skin.data.update();bm=bmesh.new();bm.from_mesh(skin.data);boundary=sum(e.is_boundary for e in bm.edges);nonmanifold=sum(not e.is_manifold for e in bm.edges);volume=bm.calc_volume(signed=True);bm.free()
    if boundary or nonmanifold or volume<=0:raise RuntimeError('Fore silhouette damaged the closed skin')
    report={'version':'20261027ForeSilhouetteV48','recipe':str(path),'recipeSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'sourceImageSha256':recipe['sourceImageSha256'],'sourceBaselineGlbSha256':recipe['sourceBaselineGlbSha256'],
        'method':'partial X-only correspondence to original frontal leg boundaries, inset for short fur; measured current sections retain their depth and height; smooth ownership and height fades protect axillae and hoof points',
        'sectionInterpolation':'C1 monotone cubic; measured section landmarks retained','referenceBoundaryInsetPixels':recipe['referenceBoundaryInsetPixels'],'strength':recipe['strength'],'lowerFadeM':recipe['lowerFadeM'],'upperFadeM':recipe['upperFadeM'],'ownershipFade':recipe['ownershipFade'],
        'verticesChanged':int(len(ids)),'maximumDisplacementM':float(distance.max()),'minimumSampledJacobian':minimum,'maximumProtectedDisplacementM':protected,'boundaryEdges':boundary,'nonmanifoldEdges':nonmanifold,'signedVolumeM3':volume,
        'sideDepthAndHeightChanged':False,'bonesChanged':0,'weightsChanged':False,'trianglesAdded':0,'normalTransform':'inverse-transpose local field Jacobian'}
    scene['DonkeyForeSilhouetteReport']=json.dumps(report);(Path(scene['DonkeySourceRoot'])/'Review/Data_ForeSilhouette.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');return report
