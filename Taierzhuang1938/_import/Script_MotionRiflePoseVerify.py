"""Blender audit of recovered wrist direction, arm reach and unchanged body motion."""
from pathlib import Path
import argparse,json,sys,math
import bpy,numpy as np
from mathutils import Vector,Matrix

parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,required=True)
parser.add_argument('--group',default='ReviewV6')
parser.add_argument('--revision',type=int,default=6)
parser.add_argument('--baseline-group',default='ReviewV5')
parser.add_argument('--baseline-revision',type=int,default=5)
parser.add_argument('--clip',default='RifleCrouchAdvance')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
root=args.root;clip=args.clip
motion=json.loads((root/'Models/_Cache'/args.group/f'Data_{clip}Motion.json').read_text(encoding='utf-8'))
count=motion['cycleFrames'];seam=motion.get('seamBlendSourceFrames',6)*2
report={'status':'passed','scope':'Actual editable rigs, source wrist baseline in anatomical body coordinates, identical body/legs versus prior revision','factions':[]}

def BodyBasis(left):
    left=left.copy();left.z=0;left.normalize()
    return Matrix((left,Vector((-left.y,left.x,0)),Vector((0,0,1)))).transposed()

for faction in ['Nra','Ija']:
    prefix='Bip002 ' if faction=='Nra' else 'Bip001 '
    scenes={};names=None
    for label,group,revision in [('before',args.baseline_group,args.baseline_revision),('after',args.group,args.revision)]:
        bpy.ops.wm.open_mainfile(filepath=str(root/'Blender'/group/f'Scene_{faction}_{clip}_V{revision}.blend'))
        arm=bpy.data.objects[f'Rig_{faction}Infantry']
        names=[b.name for b in arm.pose.bones]
        matrices=[];positions=[]
        for frame in range(1,count+2):
            bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
            matrices.append([np.array(arm.matrix_world@arm.pose.bones[n].matrix) for n in names])
            positions.append([(arm.matrix_world@arm.pose.bones[n].head)[:] for n in names])
        scenes[label]={'matrices':np.array(matrices),'positions':np.array(positions)}
    invariant=[i for i,n in enumerate(names) if not any(p in n for p in ['UpperArm','Forearm','Hand','Finger'])]
    bodyDelta=float(np.max(np.abs(scenes['after']['matrices'][:,invariant]-scenes['before']['matrices'][:,invariant])))
    assert bodyDelta<1e-5,('Body/leg changes',faction,bodyDelta)
    after=scenes['after'];before=scenes['before'];errors=[];beforeErrors=[];sampled=[];elbowBends=[]
    for frame in range(count+1):
        index=0 if frame==count else frame
        source=[Vector(p) for p in motion['sourceRelativeJoints'][index]]
        sourceBasis=BodyBasis(source[16]-source[17])
        sourceSpan=(sourceBasis.transposed()@(source[20]-source[21])).normalized()
        for label,data in [('before',before),('after',after)]:
            def P(part):return Vector(data['positions'][frame,names.index(prefix+part)])
            basis=BodyBasis(P('L UpperArm')-P('R UpperArm'))
            span=(basis.transposed()@(P('L Hand')-P('R Hand'))).normalized()
            angle=math.degrees(sourceSpan.angle(span))
            (errors if label=='after' else beforeErrors).append(angle)
            if label=='after':
                for s in ['L','R']:
                    a=P(s+' Forearm')-P(s+' UpperArm');b=P(s+' Hand')-P(s+' Forearm')
                    elbowBends.append(math.degrees(a.angle(b)))
                if frame in [0,28,58,94,115,count]:
                    sampled.append({'frame':frame+1,'sourceSeconds':motion['sourceFrameIndices'][index]/30,
                     'sourceAngleFromBodyLateralDegrees':math.degrees(math.atan2(abs(sourceSpan.y),abs(sourceSpan.x))),
                     'modelAngleFromBodyLateralDegrees':math.degrees(math.atan2(abs(span.y),abs(span.x))),
                     'directionErrorDegrees':angle})
    stableMax=max(errors[:count-seam]);assert stableMax<1,('Wrist direction lost',faction,stableMax)
    assert max(errors)<5,('Grip seam exceeds source tolerance',faction,max(errors))
    poseJoin=float(np.max(np.abs(after['matrices'][0]-after['matrices'][-1])))
    assert poseJoin<1e-5,('Loop pose',faction,poseJoin)
    grip=json.loads((root/'Models'/args.group/f'Data_{faction}_{clip}_RecoveredGrip.json').read_text(encoding='utf-8'))
    gripError=max(s['gripErrorMeters'] for s in grip['samples']);assert gripError<1e-5
    wristError=max(s['maxWristTargetErrorMeters'] for s in grip['samples']);assert wristError<.025
    hands=[names.index(prefix+s+' Hand') for s in ['L','R']]
    velocities=np.diff(after['positions'][:,hands],axis=0)*60
    joinVelocity=float(np.max(np.linalg.norm(velocities[0]-velocities[-1],axis=1)))
    assert joinVelocity<.15,('Wrist loop velocity jump',faction,joinVelocity)
    report['factions'].append({'faction':faction,'frames':count+1,'unchangedBodyBoneCount':len(invariant),
     'maxBodyMatrixDelta':bodyDelta,'baselineMaxWristDirectionErrorDegrees':max(beforeErrors),
     'maxWristDirectionErrorOutsideSeamDegrees':stableMax,'maxWristDirectionErrorDegrees':max(errors),
     'maxGripErrorMeters':gripError,'maxWristTargetErrorMeters':wristError,
     'elbowBendDegrees':[min(elbowBends),max(elbowBends)],'loopPoseMatrixDelta':poseJoin,
     'maxWristLoopVelocityDifferenceMetersPerSecond':joinVelocity,'poseSamples':sampled})
target=root/'Models'/args.group/'Data_RecoveredRiflePoseValidation.json'
target.write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report),flush=True)
