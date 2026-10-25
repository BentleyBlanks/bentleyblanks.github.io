"""Three-dimensional elbow/stifle arcs with the requested hoof targets locked."""
from mathutils import Matrix,Vector
import math


def Smooth(a,b,value):
    t=max(0,min(1,(value-a)/(b-a)))
    return t*t*(3-2*t)


def ReachCompression(origins,phase,bob,footTarget,centred=True):
    required=0
    for front in [True,False]:
        kind='Front' if front else 'Rear'
        for side in ['Left','Right']:
            stem='Donkey'+kind+side;names=[stem+s for s in ['Pivot','ElbowPivot','KneePivot','HoofPivot']]
            point=origins[names[3]].copy()
            if centred:point.y=sum(origins['Donkey'+kind+s+'HoofPivot'].y for s in ['Left','Right'])/2
            step=(phase+(.75 if front else 0)+(.5 if side=='Right' else 0))%1
            ty,tz,_,_=footTarget(point,step,front)
            root=origins[names[0]]+Vector((0,(ty-point.y)*.22 if front else 0,bob))
            length=sum((origins[b]-origins[a]).length for a,b in zip(names,names[1:]))-.001
            horizontal=(origins[names[3]].x-root.x)**2+(ty-root.y)**2
            if horizontal>=length*length:raise RuntimeError('Hoof stride exceeds anatomical limb reach')
            need=root.z-tz-math.sqrt(length*length-horizontal);pad=.0005
            amount=0 if need<=-pad else need if need>=pad else (need+pad)**2/(4*pad)
            required=max(required,amount)
    if required>.006:raise RuntimeError('Limb target needs excessive stance compression')
    return required


def SolveLimbClearance(worlds,metrics,origins,settings,stride=.68):
    report=[]
    for metric in metrics:
        stem=metric['stem'];front='Front' in stem
        amount=settings.get(stem,0)
        if not amount:continue
        kind='Front' if front else 'Rear'
        centre=sum(origins['Donkey'+kind+side+'HoofPivot'].y for side in ['Left','Right'])/2
        reach=(centre-metric['target'][0]) if front else (metric['target'][0]-centre)
        reach/=stride*(.64 if front else .66)*.5
        activation=Smooth(.10,.85,reach) if front else Smooth(-.15,.65,reach)
        if not front and not metric['planted']:
            swing=(metric['step']-.66)/(1-.66)
            activation=max(activation,Smooth(0,.15,swing)*(1-Smooth(.85,1,swing)))
        amount*=activation
        if amount<1e-8 and metric['miss']<1e-6:continue
        names=[stem+suffix for suffix in ['Pivot','ElbowPivot','KneePivot','HoofPivot']]
        initial=[worlds[name].translation.copy() for name in names]
        points=[p.copy() for p in initial]
        lengths=[(origins[b]-origins[a]).length for a,b in zip(names,names[1:])]
        sign=-1 if stem.endswith('Left') else 1
        points[1].x+=sign*amount
        points[2].x+=sign*amount*(.27 if front else .40)
        anchor=initial[0]
        requested=Vector((origins[names[3]].x,metric['target'][0],metric['target'][1]))
        target=anchor+Matrix.Rotation(metric['swingSplayRad'],3,'Y')@(requested-anchor)
        if (target-anchor).length>sum(lengths)+1e-6:raise RuntimeError('Requested hoof target is outside the full three-link limb reach')
        for iteration in range(4096):
            points[3]=target.copy()
            for i in [2,1,0]:
                points[i]=points[i+1]+(points[i]-points[i+1]).normalized()*lengths[i]
            points[0]=anchor.copy()
            for i in [1,2,3]:
                points[i]=points[i-1]+(points[i]-points[i-1]).normalized()*lengths[i-1]
            if (points[3]-target).length<1e-7:break
        error=(points[3]-target).length
        if error>1e-5:raise RuntimeError('Limb clearance failed to retain hoof target: '+str(error))
        for i in range(3):
            rotation=worlds[names[i]].to_quaternion()
            before=rotation@(origins[names[i+1]]-origins[names[i]])
            after=points[i+1]-points[i]
            correction=before.rotation_difference(after)
            worlds[names[i]]=Matrix.Translation(points[i])@(correction@rotation).to_matrix().to_4x4()
        worlds[names[3]].translation=target
        metric['sagittalSolverMissM']=metric['miss'];metric['miss']=error;metric['foot']=list(target)
        report.append({'stem':stem,'upperJointLateralShiftM':points[1].x-initial[1].x,
            'lowerJointLateralShiftM':points[2].x-initial[2].x,'hoofErrorM':error})
    return report
