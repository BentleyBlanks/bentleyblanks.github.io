"""Small rounded joint planes with axial extents and hoof surfaces protected."""
import numpy as np

def Smooth(a,b,v):
    t=np.clip((v-a)/(b-a),0,1);return t*t*(3-2*t)

def PlaneField(points,labels,mass,profiles,stems):
    result=np.array(points,dtype=float,copy=True);z=result[:,2]
    for label,stem in enumerate(stems):
        ids=np.flatnonzero((labels==label)&(mass>.75)&(z>.135)&(z<.52))
        if not len(ids):continue
        p=result[ids].copy();rows=np.array(profiles[stem]);cx,cy,wx,wy=[np.interp(p[:,2],rows[:,0],rows[:,k]) for k in [1,2,3,4]]
        delta=p[:,:2]-np.stack((cx,cy),axis=1);unit=delta/np.maximum(.01,np.stack((wx,wy),axis=1)*.5);radius=np.linalg.norm(unit,axis=1);unit/=np.maximum(.001,radius)[:,None]
        joint=np.maximum(np.exp(-((p[:,2]-.375)/.033)**2),np.exp(-((p[:,2]-.165)/.027)**2));power=2.12+.88*joint
        gain=(np.abs(unit[:,0])**power+np.abs(unit[:,1])**power)**(-1/power)-1
        amount=.75*Smooth(.135,.155,p[:,2])*(1-Smooth(.48,.52,p[:,2]))*Smooth(.75,.95,mass[ids])
        result[ids,:2]+=delta*(gain*amount)[:,None]
    return result

def PlaneJacobian(points,labels,mass,profiles,stems):
    result=np.empty((len(points),3,3));epsilon=.00002
    for axis in range(3):
        plus=points.copy();minus=points.copy();plus[:,axis]+=epsilon;minus[:,axis]-=epsilon
        result[:,:,axis]=(PlaneField(plus,labels,mass,profiles,stems)-PlaneField(minus,labels,mass,profiles,stems))/(2*epsilon)
    return result


def ApplyJointPlanes(scene,skin):
    import bpy,bmesh,json
    from pathlib import Path
    from mathutils import Vector
    if scene.get('DonkeyJointPlanesReport'):return json.loads(scene['DonkeyJointPlanesReport'])
    if not scene.get('DonkeyHindArchBindingReport'):raise RuntimeError('Joint planes require completed medial-thigh fairing and binding')
    namespace={};file=Path(scene['DonkeyCartProject'])/'_blender/Script_DonkeyLegSections.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace)
    stems,rows,profiles=namespace['MeasureLegSections'](skin,True)
    mass=np.array([[row[stem] for stem in stems] for row in rows]);labels=mass.argmax(axis=1);mass=mass.max(axis=1)
    points=np.array([v.co for v in skin.data.vertices],dtype=float);target=PlaneField(points,labels,mass,profiles,stems);distance=np.linalg.norm(target-points,axis=1);ids=np.flatnonzero(distance>1e-9)
    jac=PlaneJacobian(points[ids],labels[ids],mass[ids],profiles,stems);minimum=float(np.linalg.det(jac).min())
    protected=float(distance[(points[:,2]<=.135)|(points[:,2]>=.52)].max(initial=0))
    if distance.max()>.0055 or minimum<.70 or protected>1e-9:raise RuntimeError('Joint planes exceeded protected anatomy or orientation bounds')
    normals=None
    if skin.data.has_custom_normals:
        allJac=PlaneJacobian(points,labels,mass,profiles,stems);vertices=np.array([loop.vertex_index for loop in skin.data.loops]);normals=np.array([n.vector for n in skin.data.corner_normals]);normals=np.einsum('nij,nj->ni',np.linalg.inv(allJac[vertices]).transpose(0,2,1),normals);normals/=np.maximum(1e-12,np.linalg.norm(normals,axis=1))[:,None]
    for i in ids:skin.data.vertices[int(i)].co=Vector(target[i])
    if normals is not None:skin.data.normals_split_custom_set(normals.tolist())
    skin.data.update();bm=bmesh.new();bm.from_mesh(skin.data);boundary=sum(e.is_boundary for e in bm.edges);nonmanifold=sum(not e.is_manifold for e in bm.edges);volume=bm.calc_volume(signed=True);bm.free()
    if boundary or nonmanifold or volume<=0:raise RuntimeError('Joint plane field damaged the closed skin')
    report={'version':'20261026JointPlanesV44','method':'rounded carpal and fetlock cross-section planes with axial extents preserved; applied after the strict joint fit, lower-limb relief and medial-thigh fairing/binding',
        'heightRangeM':[.135,.52],'maximumDisplacementM':float(distance.max()),'maximumDisplacementLimitM':.0055,'minimumSampledJacobian':minimum,
        'maximumProtectedHoofAndRootDisplacementM':protected,'verticesChanged':int(len(ids)),'boundaryEdges':boundary,'nonmanifoldEdges':nonmanifold,'signedVolumeM3':volume,
        'bonesChanged':0,'weightsChanged':False,'trianglesAdded':0,'normalTransform':'inverse-transpose local field Jacobian for existing custom corner normals'}
    scene['DonkeyJointPlanesReport']=json.dumps(report);return report
