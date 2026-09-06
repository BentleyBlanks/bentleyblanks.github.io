"""Refit the sword and grasp in V7 projects, preserving elbow/body matrices.

Only hands, the rigid prop, and minimal forearm contact corrections are editable.
Elbows, upper arms, legs, root motion and timing stay fixed. Forearm lengths and
the actual wrist correction from V7 are checked and reported on every frame.
"""
from pathlib import Path
import argparse, hashlib, json, math, sys
import bpy,numpy as np
from mathutils import Matrix,Vector,Quaternion

def Unit(v):return v.normalized()
def Basis(a,b):
    x=Unit(a);y=b-x*b.dot(x)
    if y.length<1e-6:y=Vector((0,0,1))-x*x.z
    y.normalize();return Matrix((x,y,x.cross(y))).transposed()

def Main():
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);parser.add_argument('--faction',required=True);parser.add_argument('--clip',required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);root=args.root;faction=args.faction;clip=args.clip
    out=root/'Models/ReviewV8';blendOut=root/'Blender/ReviewV8';blendOut.mkdir(parents=True,exist_ok=True)
    motion=json.loads((root/f'Models/_Cache/ReviewV7/Data_{clip}Motion.json').read_text(encoding='utf-8'))
    source='DadaoParriesV1' if 'Parry' in clip else 'DadaoCutsV1'
    track=json.loads((out/f'Data_{source}BladeTrack.json').read_text(encoding='utf-8'))
    raw=json.loads((root/motion['review']['recoveryTracks'][0]['path']).read_text(encoding='utf-8'))
    transform=Matrix(((1,0,0),(0,0,-1),(0,1,0)))@Matrix.Rotation(raw['viewerYawRadians'],3,'Y')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(root/f'Models/SourceCharacters/Model_Lugou{faction}01.glb'))
    referenceArm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');referenceAction=bpy.data.actions['RifleRun']
    referenceArm.animation_data.action=referenceAction;referenceArm.animation_data.action_slot=referenceAction.slots[0]
    bpy.context.scene.frame_set(1);bpy.context.view_layer.update()
    thumbReference={b.name:b.rotation_quaternion.copy() for b in referenceArm.pose.bones if 'Finger0' in b.name}
    sourceBlend=root/f'Blender/ReviewV7/Scene_{faction}_{clip}_V7.blend'
    bpy.ops.wm.open_mainfile(filepath=str(sourceBlend));scene=bpy.context.scene
    arm=bpy.data.objects['Rig_'+faction+'Infantry'];prop=bpy.data.objects['Model_'+faction+'MeleeVideoDadao'];body=bpy.data.objects['Model_'+faction+'InfantryBody']
    prefix='Bip002 ' if faction=='Nra' else 'Bip001 '
    def N(s):return prefix+s
    def W(b):return arm.matrix_world@b.matrix
    rest={b.name:arm.matrix_world@b.matrix_local for b in arm.data.bones}
    heads={n:m.translation for n,m in rest.items()}
    protected=[b.name for b in arm.pose.bones if not any(x in b.name for x in [' Hand',' Finger',' Forearm'])]
    native={}
    for side in ['R','L']:
        wrist=heads[N(side+' Hand')];knuckles=sum((heads[N(side+' Finger'+str(k))] for k in range(1,5)),Vector())/4
        forward=knuckles-wrist;across=heads[N(side+' Finger1')]-heads[N(side+' Finger4')]
        dorsal=forward.cross(across).normalized()*(1 if side=='R' else -1)
        grip=forward*.85-dorsal*.022
        inv=rest[N(side+' Hand')].to_quaternion().inverted()
        native[side]={'palm':inv@grip,'across':inv@across,'radius':grip.length,'dorsal':dorsal}
    original=[]
    for f in range(scene.frame_start,scene.frame_end+1):
        scene.frame_set(f);bpy.context.view_layer.update()
        original.append({'matrices':{n:W(arm.pose.bones[n]).copy() for n in protected},
                         'wrists':{s:W(arm.pose.bones[N(s+' Hand')]).translation.copy() for s in ['R','L']},
                         'forearms':{s:W(arm.pose.bones[N(s+' Forearm')]).copy() for s in ['R','L']},
                         'hands':{s:W(arm.pose.bones[N(s+' Hand')]).copy() for s in ['R','L']},'prop':prop.matrix_world.copy()})
    arm.animation_data.action=arm.animation_data.action.copy();action=arm.animation_data.action;action.name=f'Animation_{faction}_{clip}_V8'
    if action.slots:arm.animation_data.action_slot=action.slots[0]
    prop.animation_data_clear();prop.animation_data_create();prop.animation_data.action=bpy.data.actions.new(action.name+'_Dadao');prop.rotation_mode='QUATERNION'
    report=[];previous={};previousHands={};previousOrigin=None;previousMidpoint=None;inverse=arm.matrix_world.inverted()
    # Solve the whole take's depth branch jointly. Independent frame minima
    # can jump between near/far solutions by 100 degrees in a single frame.
    angles=np.linspace(-65,65,261);costs=[];candidates=[]
    for i,old in enumerate(original):
        index=round((motion['sourceFrameIndices'][i]-track['sourceFrameIndices'][0])*2)
        rotation=transform@Matrix(track['worldPropRotations'][index]);plane=transform@Matrix(track['worldObservationPlanes'][index])
        normal=plane.col[2].normalized();screen=plane.col[0].normalized();span=old['wrists']['L']-old['wrists']['R'];row=[];frames=[]
        for angle in angles:
            candidate=Quaternion(normal,math.radians(angle)).to_matrix()@rotation;shaft=candidate@Vector((0,0,1))
            spacing=float(np.clip(span.dot(shaft),.085,.20));mismatch=(span-shaft*spacing).length
            residual=max(0,mismatch-native['R']['radius']-native['L']['radius'])
            row.append(100*residual*residual+.00000008*angle*angle if (-shaft).dot(screen)>.12 else 1e6);frames.append(candidate)
        costs.append(row);candidates.append(frames)
    costs=np.array(costs);dp=costs[0].copy();back=[]
    for row in costs[1:]:
        nextDp=np.full(len(angles),np.inf);parents=np.zeros(len(angles),int)
        for j in range(len(angles)):
            lo=max(0,j-8);hi=min(len(angles),j+9);values=dp[lo:hi]+.000005*(angles[lo:hi]-angles[j])**2
            parent=lo+int(np.argmin(values));parents[j]=parent;nextDp[j]=row[j]+values[parent-lo]
        dp=nextDp;back.append(parents)
    choice=[int(np.argmin(dp))]
    for parents in reversed(back):choice.append(int(parents[choice[-1]]))
    choice.reverse()
    fingerCurls={}
    scene.frame_set(1)
    for b in arm.pose.bones:
        if ' Finger' not in b.name:continue
        digit=b.name.rsplit('Finger',1)[1];joint=0 if len(digit)==1 else int(digit[-1])
        axis,_=b.rotation_quaternion.to_axis_angle()
        fingerCurls[b.name]=Quaternion(axis,math.radians(([55,65,45] if digit.startswith('0') else [88,92,60])[joint]))
        if b.name in thumbReference:fingerCurls[b.name]=thumbReference[b.name]
    for i,old in enumerate(original):
        frame=i+1;scene.frame_set(frame);bpy.context.view_layer.update()
        sourceFrame=motion['sourceFrameIndices'][i];index=round((sourceFrame-track['sourceFrameIndices'][0])*2)
        rotation=candidates[i][choice[i]];depthCorrection=float(angles[choice[i]])
        wrists={s:v.copy() for s,v in old['wrists'].items()};rightGrip=Vector((0,0,.035))
        # Depth is unobserved by a single image line. Fit that one free angle
        # to each character's unchanged wrists; never alter the visible line
        # to disguise a bad fit. A small regularizer retains the depth prior.
        shaft=rotation@Vector((0,0,1));blade=-shaft
        # Keep the support hand on the actual handle (mesh ends at z=.27).
        support=np.clip((wrists['L']-wrists['R']).dot(shaft),.085,.20)
        leftGrip=Vector((0,0,rightGrip.z+support));grips={'R':rightGrip,'L':leftGrip}
        centers={s:wrists[s]-rotation@grips[s] for s in ['R','L']}
        r=native['R']['radius'];l=native['L']['radius'];delta=centers['L']-centers['R'];distance=delta.length;axis=Unit(delta)
        # Intersection of wrist-to-grip spheres, closest to the previous palm
        # side. If incompatible, preserve the arms and record the actual gap.
        along=(r*r-l*l+distance*distance)/(2*distance)
        if abs(r-l)<=distance<=r+l:
            radius=math.sqrt(max(0,r*r-along*along));center=centers['R']+axis*along
            midpoint=(wrists['R']+wrists['L'])*.5
            follow=old['prop'].translation if previousOrigin is None else previousOrigin+midpoint-previousMidpoint
            hint=follow-center;hint-=axis*hint.dot(axis)
            if hint.length<1e-6:hint=rotation.col[1]-axis*rotation.col[1].dot(axis)
            origin=center+Unit(hint)*radius
        else:
            origin=centers['R']+axis*(distance+r-l)*.5
        # Put the rigid handle inside both fixed-elbow reach shells before
        # solving wrists. This also prevents fully straight arm singularities.
        for _ in range(40):
            for side in ['R','L']:
                elbow=old['forearms'][side].translation;length=(old['wrists'][side]-elbow).length
                center=elbow-rotation@grips[side];delta=origin-center;distance=delta.length
                low=abs(length-native[side]['radius'])+.001;high=length+native[side]['radius']-.001
                if distance>high:origin=center+Unit(delta)*high
                elif distance<low:origin=center+Unit(delta)*low
        matrix=rotation.to_4x4();matrix.translation=origin;prop.matrix_world=matrix
        previousOrigin=origin.copy();previousMidpoint=(old['wrists']['R']+old['wrists']['L'])*.5
        # Some monocular wrist spans cannot fit the handle and both palms at
        # once. Preserve each elbow and forearm length, moving the wrist to
        # the closest point on the elbow/grip sphere intersection only then.
        for side in ['R','L']:
            grip=matrix@grips[side];elbow=old['forearms'][side].translation
            armLength=(old['wrists'][side]-elbow).length;handLength=native[side]['radius']
            gap=abs((grip-wrists[side]).length-handLength)
            if gap>.0005:
                axis=grip-elbow;distance=axis.length;axis.normalize()
                if not abs(armLength-handLength)<=distance<=armLength+handLength:
                    raise ValueError(f'{clip} frame {frame}: contact outside fixed-elbow reach')
                along=(armLength*armLength-handLength*handLength+distance*distance)/(2*distance)
                center=elbow+axis*along;radius=math.sqrt(max(0,armLength*armLength-along*along))
                radial=old['wrists'][side]-center;radial-=axis*radial.dot(axis)
                wrists[side]=center+Unit(radial)*radius
            b=arm.pose.bones[N(side+' Forearm')]
            swing=(old['wrists'][side]-elbow).rotation_difference(wrists[side]-elbow).to_matrix().to_4x4()
            world=swing@old['forearms'][side];world.translation=elbow;desired=inverse@world;parent=b.parent
            b.matrix_basis=b.bone.convert_local_to_pose(desired,b.bone.matrix_local,parent_matrix=parent.matrix,parent_matrix_local=parent.bone.matrix_local,invert=True)
            if b.name in previous and b.rotation_quaternion.dot(previous[b.name])<0:b.rotation_quaternion.negate()
            previous[b.name]=b.rotation_quaternion.copy()
            for key in ['location','rotation_quaternion','scale']:b.keyframe_insert(data_path=key,frame=frame,group=b.name)
            bpy.context.view_layer.update()
        contact={};wristError=0
        for side in ['R','L']:
            b=arm.pose.bones[N(side+' Hand')];target=matrix@grips[side];aim=target-wrists[side]
            handRotation=Basis(aim,blade)@Basis(native[side]['palm'],native[side]['across']).transposed()
            if side in previousHands:
                before=previousHands[side];q=(before@native[side]['palm']).rotation_difference(aim)@before
                axis=Unit(aim);a=q@native[side]['across'];a-=axis*a.dot(axis);a.normalize()
                goal=handRotation@native[side]['across'];goal-=axis*goal.dot(axis);goal.normalize()
                twist=math.atan2(axis.dot(a.cross(goal)),a.dot(goal))
                q=Quaternion(axis,float(np.clip(twist,-math.radians(10),math.radians(10))))@q;handRotation=q.to_matrix()
            previousHands[side]=handRotation.to_quaternion()
            # Retain native object/bone scale while changing orientation only.
            world=handRotation.to_4x4()@Matrix.Diagonal((*old['hands'][side].to_scale(),1));world.translation=wrists[side]
            desired=inverse@world;parent=b.parent
            b.matrix_basis=b.bone.convert_local_to_pose(desired,b.bone.matrix_local,parent_matrix=parent.matrix,parent_matrix_local=parent.bone.matrix_local,invert=True)
            b.rotation_mode='QUATERNION'
            if b.name in previous and b.rotation_quaternion.dot(previous[b.name])<0:b.rotation_quaternion.negate()
            previous[b.name]=b.rotation_quaternion.copy()
            for key in ['location','rotation_quaternion','scale']:b.keyframe_insert(data_path=key,frame=frame,group=b.name)
            bpy.context.view_layer.update()
            actual=W(b);palm=actual.translation+actual.to_quaternion()@native[side]['palm'];contact[side]=(palm-target).length
            wristError=max(wristError,(actual.translation-wrists[side]).length)
        if 'prop' in previous and prop.rotation_quaternion.dot(previous['prop'])<0:prop.rotation_quaternion.negate()
        for name,q in fingerCurls.items():
            b=arm.pose.bones[name];b.rotation_quaternion=q;b.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=name)
        previous['prop']=prop.rotation_quaternion.copy()
        for key in ['location','rotation_quaternion','scale']:prop.keyframe_insert(data_path=key,frame=frame)
        bpy.context.view_layer.update()
        difference=max(float(np.abs(np.array(W(arm.pose.bones[n]))-np.array(old['matrices'][n])).max()) for n in protected)
        forearmLength=max(abs((W(arm.pose.bones[N(s+' Hand')]).translation-W(arm.pose.bones[N(s+' Forearm')]).translation).length-(old['wrists'][s]-old['forearms'][s].translation).length) for s in ['R','L'])
        forearmAngle=max(math.degrees((old['wrists'][s]-old['forearms'][s].translation).angle(wrists[s]-old['forearms'][s].translation)) for s in ['R','L'])
        report.append({'frame':frame,'sourceFrame':sourceFrame,'bodyMatrixDelta':difference,'wristTargetError':wristError,
                       'wristPositionDelta':max((wrists[s]-old['wrists'][s]).length for s in ['R','L']),
                       'forearmCorrectionDegrees':forearmAngle,'forearmLengthError':forearmLength,'wristPositions':{s:list(wrists[s]) for s in ['R','L']},
                       'contactResidual':contact,'depthFitDegrees':depthCorrection,'supportGripZ':float(leftGrip.z),'bladeDirection':list(blade),'propMatrix':list(map(list,prop.matrix_world))})
    for act in [action,prop.animation_data.action]:
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:key.interpolation='LINEAR'
    maxBody=max(s['bodyMatrixDelta'] for s in report);maxWrist=max(s['wristPositionDelta'] for s in report)
    assert maxBody<2e-5,maxBody
    assert max(s['wristTargetError'] for s in report)<2e-5
    assert max(s['forearmLengthError'] for s in report)<2e-5
    scene['swordPolicy']='Video blade-line observations; inferred depth; fixed V7 elbows, upper arms and body; minimal fixed-length forearm contact correction plus grasp'
    scene['reviewStatus']='Local review; blade depth and grip contact require visual review';scene.frame_set(1)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [arm,body,prop]+list(prop.children_recursive):obj.hide_set(False);obj.select_set(True)
    bpy.context.view_layer.objects.active=arm
    path=out/(action.name+'.glb');blend=blendOut/f'Scene_{faction}_{clip}_V8.blend'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name=action.name,export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True,export_skins=True,export_yup=True,export_extras=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
    result={'status':'requires_visual_review','sourceBlend':sourceBlend.relative_to(root).as_posix(),'sourceBlendSha256':hashlib.sha256(sourceBlend.read_bytes()).hexdigest(),
            'bodyPolicy':'V7 elbows, upper arms and body fixed; minimal forearm swing keeps original lengths and closes otherwise incompatible grips','protectedBones':protected,
            'palmRadius':{s:native[s]['radius'] for s in native},'maxBodyMatrixDelta':maxBody,'maxWristPositionDelta':maxWrist,
            'maxForearmCorrectionDegrees':max(s['forearmCorrectionDegrees'] for s in report),'maxForearmLengthError':max(s['forearmLengthError'] for s in report),
            'maxContactResidual':max(max(s['contactResidual'].values()) for s in report),'samples':report,
            'path':path.relative_to(root).as_posix(),'blend':blend.relative_to(root).as_posix(),'clip':action.name}
    (out/f'Data_{faction}_{clip}_Validation.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print('DONE',faction,clip,'body',maxBody,'wrist',maxWrist,'contact',result['maxContactResidual'],flush=True)

if __name__=='__main__':Main()
