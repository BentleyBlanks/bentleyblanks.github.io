"""Continuous reference head fit after the eyes and nasal channels are closed.

The same smooth map moves skin, lids, corneas, mouth and ear surfaces together.
The ocular twist preserves radius, avoiding a second cut through an old socket.
"""
import math,json
from pathlib import Path
import numpy as np

PPM=(925-302)/1.10
FRONT=[((925-v)/PPM,.692091405+(707-u)/PPM) for v,u in [(430,352),(420,347),(410,344),(400,342),(390,343),(380,348),(370,356),(360,361),(350,366),(340,371),(330,376),(320,381),(300,389),(280,397),(260,405),(240,415),(220,425),(200,435),(180,449)]]
WIDTH=[(.80,1),(.90,1.01),(.96,1.015),(1.05,1.025),(1.18,1.04),(1.25,1.025),(1.32,1),(1.65,1)]
EYES=np.array([[-.0956988856,1.1589083672,1.1898943186],[.0956315249,1.1590181589,1.1898990870]])

def Smooth(a,b,value):
    t=np.clip((value-a)/(b-a),0,1);return t*t*(3-2*t)

def Curve(rows,value):
    x=np.array([r[0] for r in rows]);y=np.array([r[1] for r in rows]);slopes=np.diff(y)/np.diff(x);m=np.zeros(len(x));m[0]=slopes[0];m[-1]=slopes[-1]
    for i,(a,b) in enumerate(zip(slopes,slopes[1:]),1):m[i]=0 if a*b<=0 else 2*a*b/(a+b)
    k=np.clip(np.searchsorted(x,value,side='right')-1,0,len(x)-2);h=x[k+1]-x[k];t=np.clip((value-x[k])/h,0,1)
    return (2*t**3-3*t*t+1)*y[k]+(t**3-2*t*t+t)*h*m[k]+(-2*t**3+3*t*t)*y[k+1]+(t**3-t*t)*h*m[k+1]

def Volume(points):
    result=np.asarray(points,dtype=np.float64).copy();y,z=result[:,1].copy(),result[:,2].copy()
    # The delivered anterior side contour is already within one source pixel.
    # Keep its Y/Z profile; adjust the measured narrow frontal skull only.
    result[:,0]*=1+(Curve(WIDTH,z)-1)*Smooth(1.0,1.10,y)
    return result

def Deform(points,eyes=EYES):
    result=Volume(points);centres=Volume(eyes)
    for side,centre in enumerate(centres):
        delta=result-centre;radius=np.linalg.norm(delta,axis=1);weight=1-Smooth(0,.09,radius)
        angle=math.radians(8)*(1 if side==0 else -1)*weight
        c,s=np.cos(angle),np.sin(angle);x,y=delta[:,0].copy(),delta[:,1].copy()
        result[:,0]=centre[0]+x*c-y*s;result[:,1]=centre[1]+x*s+y*c
        result[:,1]+=.005*weight
        result[:,2]=centre[2]+(result[:,2]-centre[2])*(1-.08*weight)-.0085*weight
    return result

def Jacobian(points,eyes=EYES):
    result=np.empty((len(points),3,3));eps=.00005
    for axis in range(3):
        plus=points.copy();minus=points.copy();plus[:,axis]+=eps;minus[:,axis]-=eps
        result[:,:,axis]=(Deform(plus,eyes)-Deform(minus,eyes))/(2*eps)
    return result

def ApplyReferenceHead(scene,skin,rig,collection):
    import bpy
    from mathutils import Vector
    if scene.get('DonkeyHeadFitReport'):return json.loads(scene['DonkeyHeadFitReport'])
    inverse=rig.matrix_world.inverted();eyes=[]
    for side in ['Left','Right']:
        obj=bpy.data.objects['DonkeyEye'+side];matrix=inverse@obj.matrix_world
        eyes.append(sum((matrix@v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices))
    eyes=np.array(eyes);objects={};minimumJacobian=1;protectedMaximum=0
    for obj in list(collection.all_objects):
        if obj.type!='MESH':continue
        matrix=inverse@obj.matrix_world;back=matrix.inverted();original=np.array([matrix@v.co for v in obj.data.vertices]);target=Deform(original,eyes);change=np.linalg.norm(target-original,axis=1);indices=np.flatnonzero(change>1e-9)
        if obj==skin:
            protected=(original[:,1]<=1.0)|(original[:,2]<.80)
            protectedMaximum=float(change[protected].max(initial=0))
        if not len(indices):continue
        jacobian=Jacobian(original[indices],eyes);minimumJacobian=min(minimumJacobian,float(np.linalg.det(jacobian).min()))
        if minimumJacobian<=.15:raise RuntimeError('Reference head field folds its local surface')
        loopNormals=None
        if obj.data.has_custom_normals:
            ids=np.array([loop.vertex_index for loop in obj.data.loops]);originalNormals=np.array([n.vector for n in obj.data.corner_normals]);normalToRig=np.array(matrix.to_3x3().inverted().transposed());normalToObject=np.array(back.to_3x3().inverted().transposed())
            mapped=originalNormals@normalToRig.T;allJacobian=Jacobian(original,eyes)
            mapped=np.einsum('nij,nj->ni',np.linalg.inv(allJacobian[ids]).transpose(0,2,1),mapped);mapped=mapped@normalToObject.T;mapped/=np.maximum(1e-12,np.linalg.norm(mapped,axis=1))[:,None];loopNormals=mapped
        for i in indices:obj.data.vertices[int(i)].co=back@Vector(target[i])
        if loopNormals is not None:obj.data.normals_split_custom_set(loopNormals.tolist())
        obj.data.update();objects[obj.name]={'vertices':int(len(indices)),'maximumDisplacementM':float(change.max())}
    if protectedMaximum>1e-8:raise RuntimeError('Head fit moved protected trunk or limbs')
    bpy.ops.object.select_all(action='DESELECT');rig.hide_set(False);rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT');bones={}
    for bone in rig.data.edit_bones:
        if bone.name not in ['DonkeyNeckPivot','DonkeyHeadPivot','DonkeyEarLeftPivot','DonkeyEarRightPivot']:continue
        old=bone.head.copy();bone.head=Vector(Deform(np.array([old]),eyes)[0]);bone.tail=bone.head+Vector((0,.075,0));bones[bone.name]=list(bone.head-old)
    bpy.ops.object.mode_set(mode='OBJECT')
    eyeResponse={}
    for prefix,colour,roughness,specular in [('DonkeyCartEye',(.0035,.0028,.0023,1),.20,.50),('DonkeyCartEyelid',(.006,.0045,.0035,1),.38,.40)]:
        material=next(m for m in bpy.data.materials if m.name.startswith(prefix));shader=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        shader.inputs['Base Color'].default_value=colour;shader.inputs['Roughness'].default_value=roughness;shader.inputs['Specular IOR Level'].default_value=specular
        if prefix=='DonkeyCartEye':shader.inputs['IOR'].default_value=1.40
        eyeResponse[material.name]={'baseLinearRgb':list(colour[:3]),'roughness':roughness,'specularIorLevel':specular}
    report={'version':'20261025HeadV31','method':'modest frontal skull width with compact radial orbital twist and two-view eye position fit; closed surfaces move together after orbital reconstruction; existing anterior contour retained','eyeCentresBeforeM':eyes.tolist(),'eyeCentresAfterM':Deform(eyes,eyes).tolist(),'orbitalRadiusM':.09,'eyeOutwardRotationDegrees':8,'eyeDownshiftM':.0085,'eyeAdvanceM':.005,'orbitalVerticalGain':-.08,'widthScaleByHeight':WIDTH,'anteriorSideProfilePreserved':True,'minimumSampledJacobian':minimumJacobian,'maximumProtectedPointDisplacementM':protectedMaximum,'objects':objects,'boneDisplacementsM':bones}
    report['eyeSurfaceResponse']=eyeResponse
    scene['DonkeyHeadFitReport']=json.dumps(report);base=Path(scene['DonkeySourceRoot']);(base/'Review/Data_HeadFit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    return report
