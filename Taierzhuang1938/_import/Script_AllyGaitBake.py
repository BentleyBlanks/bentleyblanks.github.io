"""Five shared NRA gait clips, authored through BlenderMCP. Run Prepare.mjs first.

ALLY_GAIT_PROJECT points to Taierzhuang1938. Uses the production importer, IK and
source-frame exporter; saves the editable action library outside the repository.
Only ordinary ally locomotion consumes these clips; cinematics retain ownership.
"""
import bpy, os, json, math, runpy, hashlib
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion

project = Path(os.environ['ALLY_GAIT_PROJECT'])
os.environ['CAPTIVES_PROJECT'] = str(project)
os.environ['CAPTIVES_SKIP_BLEND'] = '1'
source = json.loads((project.parent / 'tmp/AllyGait/Data_AllyGaitSource.json').read_text())
helpers = runpy.run_path(str(project / '_import/Script_MachineGunCaptivesBake.py'), run_name='AllyGaitHelpers')
convert = helpers['convert']
private = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/AllyGait_20260927/Upright')
output = project / 'Animation/AllyGait'
private.mkdir(parents=True, exist_ok=True)
output.mkdir(parents=True, exist_ok=True)

def Bake(ctx):
    arm, names = ctx['arm'], ctx['names']
    Bone, Put, Point, BWorld, Update = [ctx[k] for k in ['Bone','Put','Point','BWorld','Update']]
    factor = ctx['authoringFactor']
    def SourceMatrix(flat):
        m = Matrix([flat[i::4] for i in range(4)])
        m.translation *= factor
        return convert @ m
    def Imported(pose):
        return {n: SourceMatrix(pose[n]) @ ctx['corrections'][n].inverted() for n in names}
    rest, ready = Imported(source['rest']), Imported(source['ready'])
    prefix = 'Bip001 '
    def Q(part, angle):
        return Quaternion((1,0,0), angle) @ rest[prefix+part].to_quaternion()
    def Place(part, point, q):
        Put(Bone(part), Matrix.LocRotScale(point,q,Vector((1,1,1))))
    clips, report = [], {}
    relaxed = json.loads((project/'Animation/RelaxedGait/Data_RelaxedGait.json').read_text())
    specs = [('AllyCrouchReady',True,True,False),('AllyCrouchCarry',True,False,False),
             ('AllyCarryWalk',False,False,False),('AllyCarryStand',False,False,True),
             ('AllyCrouchCarryStand',True,False,True)]
    for clipId, low, aiming, idle in specs:
        raw = source['clips']['RelaxedStand' if idle else 'RelaxedWalk']
        count = len(raw['frames'])-1
        duration = raw['duration']
        action = bpy.data.actions.new(clipId)
        action.use_fake_user = True
        arm.animation_data_create(); arm.animation_data.action = action
        samples, props, floors, leans = [], [], [], []
        for f, rawPose in enumerate(raw['frames']):
            bpy.context.scene.frame_set(f+1)
            frame = Imported(rawPose)
            for n in names: Put(arm.pose.bones[n],frame[n])
            pelvis = Point(Bone('Pelvis'))
            centre = rest[prefix+'Pelvis'].translation
            pelvis.x = centre.x + (pelvis.x-centre.x)*(.25 if low else .5)
            if low: pelvis.z -= .23*factor
            Place('Pelvis',pelvis,Q('Pelvis',.12 if low else .025))
            # The feet retain the source's heel/toe roll. Shorten the travel of the
            # crouched feet, then solve both legs at the lower pelvis (no bone scaling).
            for side in ['L','R']:
                foot = frame[prefix+side+' Foot'].copy()
                if low: foot.translation.y *= .62
                pole = Point(Bone(side+' Thigh')) + Vector((0,-1,0))
                ctx['Chain'](Bone(side+' Thigh'),Bone(side+' Calf'),Bone(side+' Foot'),foot.translation,pole)
                Put(Bone(side+' Foot'),foot)
            # Absolute chest pitch/roll stay quiet while the pelvis and knees move.
            # Head remains almost level; the bend comes from hips and spine.
            parent='Pelvis'
            for part, share in [('Spine',.55),('Spine1',.85),('Spine2',1),('Neck',.55),('Head',.12)]:
                parentDelta=BWorld(Bone(parent)).to_quaternion() @ rest[prefix+parent].to_quaternion().inverted()
                offset=rest[prefix+part].translation-rest[prefix+parent].translation
                point=Point(Bone(parent))+parentDelta @ offset
                angle=(.47 if low else .055)*share + .003*math.sin(f/count*math.tau*2)
                Place(part,point,Q(part,angle)); parent=part
            chestDelta=BWorld(Bone('Spine2')).to_quaternion() @ rest[prefix+'Spine2'].to_quaternion().inverted()
            for side in ['L','R']:
                clav=side+' Clavicle'; shoulder=side+' UpperArm'
                for part in [clav,shoulder]:
                    point=Point(Bone('Spine2'))+chestDelta @ (rest[prefix+part].translation-rest[prefix+'Spine2'].translation)
                    Place(part,point,chestDelta @ rest[prefix+part].to_quaternion())
                template=ready if aiming else frame
                shift=Point(Bone(shoulder))-template[prefix+shoulder].translation
                for n in names:
                    if n.startswith(prefix+side+' ') and any(t in n for t in ['UpperArm','Forearm','Hand','Finger']):
                        m=template[n].copy();m.translation+=shift;Put(arm.pose.bones[n],m)
                if not aiming and side=='R':
                    # Right hand carries beside the hip; left hand is free to swing/talk.
                    shoulderPoint=Point(Bone(shoulder))
                    wrist=Vector((shoulderPoint.x-.085*factor, -.15*factor,
                                  pelvis.z+(.015 if low else -.20)*factor))
                    ctx['Chain'](Bone('R UpperArm'),Bone('R Forearm'),Bone('R Hand'),wrist,
                                 shoulderPoint+Vector((-.25, .05, -.35))*factor)
                    # The walk already curls its fingers. Reset those joints before
                    # wrapping this stock; adding another curl turns the palm inside out.
                    for n in names:
                        if n.startswith(prefix+'R Finger'):
                            arm.pose.bones[n].matrix_basis=ctx['rest'][n]
                    Update()
                    # Thumb up, palm inward: hold an upright stock beside the body.
                    # The straight index lies along the stock, outside the trigger guard.
                    ctx['TurnPalm']('R', (0,-.9945,-.1045),(1,0,0))
                    ctx['CurlFingers']('R',Vector((1,0,0)),.95,indexAmount=0)
                    ctx['Aim'](Bone('R Finger1'),Bone('R Finger11'),
                               Point(Bone('R Finger1'))+Vector((0,-.1045,.9945)))
            # Correct measured skin contact, preserving the authored foot transforms.
            floor,_=ctx['LowestVertex']()
            if abs(floor-.004*factor)>.00005:
                ctx['Move'](Bone('Pelvis'),Point(Bone('Pelvis'))+Vector((0,0,.004*factor-floor)))
            Update()
            floors.append(ctx['LowestVertex']()[0]/factor)
            axis=Point(Bone('Neck'))-Point(Bone('Pelvis'))
            leans.append(math.degrees(math.atan2(-axis.y,axis.z)))
            samples.append(ctx['SourcePose']())
            # A rifle's local -Z is its muzzle direction. Convert Blender world to
            # source glTF coordinates; runtime keeps the real weapon dimensions.
            grip=ctx['GripPoint']('R')
            direction=Vector((0,-.1045,.9945)).normalized()
            up=Vector((0,.9945,.1045)).normalized()
            right=direction.cross(up).normalized()
            prop=Matrix(((right.x,up.x,-direction.x,grip.x),
                         (right.y,up.y,-direction.y,grip.y),
                         (right.z,up.z,-direction.z,grip.z),(0,0,0,1)))
            prop=convert.inverted() @ prop
            pp,qq,_=prop.decompose()
            props.append([*(pp/factor),qq.x,qq.y,qq.z,qq.w])
            for pb in arm.pose.bones:
                pb.keyframe_insert('location',frame=f+1,group=pb.name)
                pb.keyframe_insert('rotation_quaternion',frame=f+1,group=pb.name)
        tracks=[]
        times=[round(duration*f/count,6) for f in range(count+1)]
        # SourcePose includes all translations to preserve Blender's glTF bone-frame correction.
        for i,n in enumerate(names):
            for prop,offset,width,kind in [('position',0,3,'vector'),('quaternion',3,4,'quaternion')]:
                values=[v for s in samples for v in s[i*7+offset:i*7+offset+width]]
                tracks.append({'name':n.replace(' ','_')+'.'+prop,'type':kind,'times':times,'values':values})
        if not aiming:
            for prop,offset,width,kind in [('position',0,3,'vector'),('quaternion',3,4,'quaternion')]:
                tracks.append({'name':'AllyRifle.'+prop,'type':kind,'times':times,'values':[round(v,6) for s in props for v in s[offset:offset+width]]})
        clips.append({'name':clipId,'uuid':clipId,'duration':duration,'tracks':tracks,'blendMode':2500})
        report[clipId]={'duration':duration,'referenceMps':0 if idle else relaxed['walk']['referenceSpeedMps']*(.62 if low else 1),
                        'contacts':{} if idle else relaxed['walk']['contacts'],
                        'floorM':[min(floors),max(floors)],'leanDeg':[min(leans),max(leans)]}
        print(clipId,report[clipId],flush=True)
    data={'schema':1,'revision':'20260927AllyGaitV2Upright','skeleton':'TengxianHumanoidV1','clips':clips,'profiles':report}
    text=json.dumps(data,separators=(',',':'))
    (output/'Animation_TengxianAllyGait.json').write_text(text,encoding='utf-8')
    # Put the first action on the timeline for direct editing/review.
    arm.animation_data.action=bpy.data.actions['AllyCrouchReady']
    scene=bpy.context.scene;scene.render.fps=30;scene.frame_start=1;scene.frame_end=33;scene.frame_set(9)
    helpers['Op'](bpy.ops.wm.save_as_mainfile,filepath=str(private/'Scene_AllyGait.blend'))
    print(json.dumps({'file':str(output/'Animation_TengxianAllyGait.json'),'sha256':hashlib.sha256(text.encode()).hexdigest(),'blend':bpy.data.filepath}))

helpers['Bake']('TengxianNra02',probe=Bake)
