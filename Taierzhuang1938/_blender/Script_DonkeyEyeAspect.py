"""Shared eye-aperture aspect and orientation fit after the strict joint pass."""
import json,math
from pathlib import Path
import numpy as np

def Smooth(a,b,v):
    t=np.clip((v-a)/(b-a),0,1);return t*t*(3-2*t)

def EyeAspectField(points,frames):
    result=np.asarray(points,dtype=float).copy()
    for frame in frames:
        centre=np.array(frame['centre']);axis=np.array(frame['axis']);delta=result-centre;radius=np.linalg.norm(delta,axis=1);weight=1-Smooth(.035,.080,radius);delta-=axis[None,:]*(delta@axis*(.10*weight))[:,None];direction=-1 if frame['side']=='Left' else 1;angle=math.radians(8)*direction*weight;c,s=np.cos(angle),np.sin(angle);x,y=delta[:,0].copy(),delta[:,1].copy();delta[:,0]=x*c-y*s;delta[:,1]=x*s+y*c
        turn=math.radians(8)*direction;c0,s0=math.cos(turn),math.sin(turn);nx,ny,nz=frame['normal'];normal=np.array([nx*c0-ny*s0,nx*s0+ny*c0,nz]);roll=math.radians(-12*direction)*(1-Smooth(.035,.080,np.linalg.norm(delta,axis=1)));cr,sr=np.cos(roll),np.sin(roll);parallel=(delta@normal)[:,None]*normal;result=centre+delta*cr[:,None]+np.cross(normal,delta)*sr[:,None]+parallel*(1-cr[:,None])
    return result

def EyeAspectJacobian(points,frames):
    result=np.empty((len(points),3,3));epsilon=.00002
    for axis in range(3):
        a=points.copy();b=points.copy();a[:,axis]+=epsilon;b[:,axis]-=epsilon;result[:,:,axis]=(EyeAspectField(a,frames)-EyeAspectField(b,frames))/(2*epsilon)
    return result

def FitEyeAspect(scene,skin,rig,collection):
    import bpy
    from mathutils import Vector
    if scene.get('DonkeyEyeAspectReport'):return json.loads(scene['DonkeyEyeAspectReport'])
    if not scene.get('DonkeyOrbitalFitReport'):raise RuntimeError('Eye aspect requires the post-joint orbital orientation fit')
    inverse=rig.matrix_world.inverted();frames=[]
    for side,sign in [('Left',-1),('Right',1)]:
        eye=bpy.data.objects['DonkeyEye'+side];matrix=inverse@eye.matrix_world;points=np.array([matrix@v.co for v in eye.data.vertices]);centre=points.mean(axis=0);values,vectors=np.linalg.eigh(np.cov((points-centre).T));normal=vectors[:,0];normal*=sign if normal[0]>0 else -sign;up=vectors[:,1];up*=1 if up[2]>0 else -1;axis=np.cross(up,normal);axis/=np.linalg.norm(axis);frames.append({'side':side,'centre':centre.tolist(),'axis':axis.tolist(),'normal':normal.tolist(),'up':up.tolist()})
    objects={};minimum=1;protected=0
    for obj in list(collection.all_objects):
        if obj.type!='MESH':continue
        matrix=inverse@obj.matrix_world;back=matrix.inverted();points=np.array([matrix@v.co for v in obj.data.vertices],dtype=float);target=EyeAspectField(points,frames);moves=np.linalg.norm(target-points,axis=1);ids=np.flatnonzero(moves>1e-9)
        if obj==skin:protected=float(moves[(points[:,1]<=1.0)|(points[:,2]<=1.0)|(points[:,2]>=1.30)].max(initial=0))
        if not len(ids):continue
        jac=EyeAspectJacobian(points[ids],frames);minimum=min(minimum,float(np.linalg.det(jac).min()));normals=None
        if obj.data.has_custom_normals:
            vertices=np.array([loop.vertex_index for loop in obj.data.loops]);original=np.array([n.vector for n in obj.data.corner_normals]);toRig=np.array(matrix.to_3x3().inverted().transposed());toObject=np.array(back.to_3x3().inverted().transposed());mapped=original@toRig.T;allJac=EyeAspectJacobian(points,frames);mapped=np.einsum('nij,nj->ni',np.linalg.inv(allJac[vertices]).transpose(0,2,1),mapped);mapped=mapped@toObject.T;mapped/=np.maximum(1e-12,np.linalg.norm(mapped,axis=1))[:,None];normals=mapped
        for i in ids:obj.data.vertices[int(i)].co=back@Vector(target[i])
        if normals is not None:obj.data.normals_split_custom_set(normals.tolist())
        obj.data.update();objects[obj.name]={'verticesChanged':int(len(ids)),'maximumDisplacementM':float(moves.max())}
    if minimum<.65 or protected>1e-8:raise RuntimeError('Eye aspect folded its surface or moved protected anatomy')
    report={'version':'20261027EyeAspectV51','method':'common compact map rotates closed orbital skin, globe and wet lids eight degrees toward the front, shortens the aperture axis ten percent and adds twelve degrees of shared eye-corner roll; original eye centres retained; front/side aperture balance checked together',
        'frames':frames,'forwardRotationDegrees':8,'apertureAxisScale':.90,'rollDegrees':12,'coreRadiusM':.035,'supportRadiusM':.080,'minimumSampledJacobian':minimum,'maximumProtectedDisplacementM':protected,'objects':objects,'bonesChanged':0,'weightsChanged':False,'trianglesAdded':0,'normalTransform':'inverse-transpose local field Jacobian'}
    scene['DonkeyEyeAspectReport']=json.dumps(report);(Path(scene['DonkeySourceRoot'])/'Review/Data_EyeAspect.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');return report
