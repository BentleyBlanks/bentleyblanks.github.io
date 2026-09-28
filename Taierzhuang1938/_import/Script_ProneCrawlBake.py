"""One shared prone locomotion cycle, authored through the task-owned BlenderMCP.

Run with Script_BlenderMcp.mjs exec --file. PRONE_PROJECT selects the checkout;
the editable scene and review images stay outside the published repository.
Preserves the shipped rig, skin and bone lengths. Exports Three AnimationClip JSON.
"""
import bpy, os, json, runpy, math, struct
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion

project = Path(os.environ.get('PRONE_PROJECT', str(Path.cwd() / 'Taierzhuang1938')))
os.environ['CAPTIVES_PROJECT'] = str(project)
os.environ['CAPTIVES_SKIP_BLEND'] = '1'
helper = runpy.run_path(str(project / '_import/Script_MachineGunCaptivesBake.py'), run_name='ProneHelpers')
output = project / 'Animation/ProneCrawl'
private = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/ProneCrawl_20260927')
FPS, DURATION, SPEED, STANCE = 30, 2.0, .32, .64

def Bake(ctx):
    arm, scene, names = ctx['arm'], ctx['scene'], ctx['names']
    Bone, Point, Update, Move, Tilt, Chain, Aim = [ctx[k] for k in ('Bone','Point','Update','Move','Tilt','Chain','Aim')]
    f = ctx['authoringFactor']
    restHinge = {}
    for side in 'LR':
        upper=Bone(side+' UpperArm');lower=Bone(side+' Forearm')
        upperRest=arm.matrix_world @ upper.bone.matrix_local
        lowerRest=arm.matrix_world @ lower.bone.matrix_local
        direction=(lowerRest.translation-upperRest.translation).normalized()
        restHinge[side]=upperRest.to_quaternion().inverted() @ direction.cross(Vector((0,-1,0))).normalized()
    # Read the full-size shipped prone hold as the neutral pose, before authoring motion.
    raw = ctx['source'].read_bytes(); length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+length]); binary = raw[28+length:]
    def Read(index):
        a=doc['accessors'][index]; v=doc['bufferViews'][a['bufferView']]
        count={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']]
        return struct.unpack_from('<'+'f'*count, binary, v.get('byteOffset',0)+a.get('byteOffset',0))
    nodes = [dict(n) for n in doc['nodes']]
    clip = next(a for a in doc['animations'] if a['name']=='StandFireCrouch')
    for channel in clip['channels']:
        s=clip['samplers'][channel['sampler']]; nodes[channel['target']['node']][channel['target']['path']]=Read(s['output'])
    parents={c:i for i,n in enumerate(nodes) for c in n.get('children',[])}; world={}
    def World(i):
        if i not in world:
            n=dict(nodes[i]); n['translation']=[v*f for v in n.get('translation',[0,0,0])]
            world[i]=(World(parents[i]) if i in parents else Matrix.Identity(4)) @ helper['NodeMatrix'](n)
        return world[i]
    index={n.get('name'):i for i,n in enumerate(nodes)}
    for pb in arm.pose.bones:
        if pb.name in index:
            ctx['Put'](pb, helper['convert'] @ World(index[pb.name]) @ ctx['corrections'][pb.name].inverted())
    base={pb.name:pb.matrix_basis.copy() for pb in arm.pose.bones}
    pelvis=Point(Bone('Pelvis')); pelvis.z=.235; hands={s:Point(Bone(s+' Hand')) for s in ['L','R']}
    feet={s:Point(Bone(s+' Foot')) for s in ['L','R']}
    print('PRONE_BASE',dict(pelvis=list(pelvis),hands={s:list(p) for s,p in hands.items()},feet={s:list(p) for s,p in feet.items()}))
    regions={s:{'foot':ctx['GroupSets'](lambda n,s=s: s+' Foot' in n or s+' Toe' in n or s+' Calf' in n),'hand':ctx['GroupSets'](lambda n,s=s: s+' Hand' in n or s+' Finger' in n)} for s in ['L','R']}
    tracks={n:{'position':[],'quaternion':[]} for n in names}; times=[]; minima=[]
    def Cycle(phase):
        phase%=1
        if phase<STANCE: return .5-phase/STANCE,0
        u=(phase-STANCE)/(1-STANCE)
        h=u*u*u*(10+u*(-15+6*u)); tangent=-(1-STANCE)/STANCE
        return -.5+(1-tangent)*h+tangent*u, math.sin(math.pi*u)**2
    def GroundLeg(side,target,sign):
        a,b,c=[Bone(side+' '+part) for part in ['Thigh','Calf','Foot']]
        Chain(a,b,c,target,Vector((sign*.70,.2,.10)))
    def ProneFoot(side):
        # Follow the calf in yaw, with toes pointing down/back. A 180-degree
        # world flip put the toe ABOVE the ankle and twisted the ankle sideways.
        foot=Bone(side+' Foot'); p=Point(foot)
        shin=p-Point(Bone(side+' Calf'))
        yaw=math.atan2(-shin.x,shin.y)
        q=Quaternion((0,0,1),yaw) @ Quaternion((1,0,0),math.radians(132)) @ ctx['footQuats'][side]
        ctx['Put'](foot,Matrix.LocRotScale(p,q,Vector((1,1,1))))
    def ArmPole(side):
        return (Point(Bone('R UpperArm'))+Vector((.02,-.20,-.15))) if side=='R' else Vector((.53,-.12,.06))
    def CarryFingers(normal):
        # Short fingers meet the side of the stock; they cannot reach under it
        # with the same curl as the middle finger without crossing the wood.
        for finger,angles in [(1,(1.0,.65)),(2,(1.0,.65)),(3,(.85,.70)),(4,(.50,.70))]:
            for suffix,childSuffix,angle in [('', '1', angles[0]),('1','2',angles[1])]:
                joint,child=Bone('R Finger'+str(finger)+suffix),Bone('R Finger'+str(finger)+childSuffix)
                at=Point(joint); forward=(Point(child)-at).normalized()
                bend=(normal-forward*normal.dot(forward)).normalized()
                Aim(joint,child,at+forward*math.cos(angle)+bend*math.sin(angle))
            if finger in (1,2): Tilt(Bone('R Finger'+str(finger)+'2'),y=-.40)
    def AlignWrist():
        hand,forearm=Bone('R Hand'),Bone('R Forearm'); matrix=ctx['BWorld'](hand)
        relative=(forearm.bone.matrix_local.inverted() @ hand.bone.matrix_local).to_quaternion()
        p,_,scale=ctx['BWorld'](forearm).decompose()
        ctx['Put'](forearm,Matrix.LocRotScale(p,matrix.to_quaternion() @ relative.inverted(),scale))
        Aim(forearm,hand,matrix.translation);ctx['Put'](hand,matrix)
    def ArmHinge(side):
        # Positions alone do not define an anatomical elbow: shortest-arc Aim
        # can leave the upper arm rolled 180 degrees and bend through its back.
        upper,lower,hand=[Bone(side+' '+part) for part in ('UpperArm','Forearm','Hand')]
        forearm=ctx['BWorld'](lower).copy();p=Point(upper)
        u=(Point(lower)-p).normalized();v=(Point(hand)-Point(lower)).normalized()
        hinge=ctx['BWorld'](upper).to_quaternion() @ restHinge[side]
        want=u.cross(v).normalized()
        angle=math.atan2(u.dot(hinge.cross(want)),hinge.dot(want))
        ctx['Put'](upper,Matrix.Translation(p) @ Quaternion(u,angle).to_matrix().to_4x4() @ Matrix.Translation(-p) @ ctx['BWorld'](upper))
        ctx['Put'](lower,forearm)
    def CarryArm(phase):
        # Elbow outside the torso, fingers toward the centre. The old outward
        # palm needed a backwards elbow or >120 degrees of forearm twist.
        upper,lower,hand=[Bone('R '+part) for part in ('UpperArm','Forearm','Hand')]
        shoulder=Point(upper);height=Point(hand).z
        upperLength=(Point(lower)-shoulder).length;lowerLength=(Point(hand)-Point(lower)).length
        matrix=ctx['BWorld'](hand);dx=-.17;dz=height+.045-shoulder.z
        ahead=math.sqrt(max(.003,upperLength**2-dx**2-dz**2))
        elbow=shoulder+Vector((dx,-ahead,dz))
        reach,_=Cycle(phase);yaw=-.12+.24*reach
        horizontal=math.sqrt(lowerLength**2-.045**2)
        wrist=elbow+Vector((math.cos(yaw)*horizontal,math.sin(yaw)*horizontal,-.045))
        Aim(upper,lower,elbow);Aim(lower,hand,wrist)
        matrix.translation=Point(hand);ctx['Put'](hand,matrix)
        AlignWrist()
    for frame in range(round(DURATION*FPS)+1):
        t=frame/FPS; phase=t/DURATION
        for pb in arm.pose.bones: pb.matrix_basis=base[pb.name]
        Update()
        sway=math.sin(phase*math.tau)
        Move(Bone('Pelvis'), pelvis+Vector((.016*sway,0,.008*(1-math.cos(phase*math.tau*2)))))
        Tilt(Bone('Pelvis'),z=.045*sway)
        Tilt(Bone('Spine2'),z=-.07*sway)
        Tilt(Bone('Neck'),x=-.35)
        Tilt(Bone('Head'),x=-.25)
        for side,sign,offset in [('L',1,0),('R',-1,.5)]:
            stride,lift=Cycle(phase+offset)
            # Rear toe pushes while the other knee draws out and forward, then swaps.
            target=feet[side].copy(); target.y=.58-stride*SPEED*DURATION*STANCE
            target.x=sign*(.24+.045*lift); target.z=.080+.035*lift
            pole=Vector((sign*.70,.15,.065))
            GroundLeg(side,target,sign)
            ProneFoot(side)
            # Contralateral reach; right hand keeps the rifle, left palm plants on the soil.
            reach,handLift=Cycle(phase+offset+.5)
            # Keep the carrying wrist ahead of its shoulder. Retracting behind
            # it folds the short upper arm upward and over-flexes the wrist.
            target=Vector((sign*(.27 if side=='L' else .38),(-.52-reach*SPEED*DURATION*STANCE) if side=='L' else (-.64-reach*.18),.075 if side=='L' else .16))
            target.z+=handLift*.065
            Chain(Bone(side+' UpperArm'),Bone(side+' Forearm'),Bone(side+' Hand'),target,
                  ArmPole(side))
            if side=='L':
                for pb in arm.pose.bones:
                    if 'L Finger' in pb.name: pb.matrix_basis=ctx['rest'][pb.name]
                Update();ctx['TurnPalm']('L',(0,-1,0),(0,0,-1))
            else:
                # Overhand carry around the middle of the wooden fore-end:
                # fingers run across the rifle, palm down, thumb opposite them.
                for pb in arm.pose.bones:
                    if 'R Finger' in pb.name: pb.matrix_basis=ctx['rest'][pb.name]
                Update();normal=ctx['TurnPalm']('R',(1,0,0),(0,0,-1))
                CarryFingers(normal)
                grip=ctx['GripPoint']('R')
                Aim(Bone('R Finger0'),Bone('R Finger01'),grip+Vector((-.060,.028,-.02)))
                Aim(Bone('R Finger01'),Bone('R Finger02'),grip+Vector((-.055,.009,-.04)))
        # Measure each actual skin patch and settle it separately. Lifting the
        # whole body by its single lowest vertex leaves the other three limbs hovering.
        for contactPass in range(3):
            low,_=ctx['LowestVertex']()
            if low<.003: Move(Bone('Pelvis'),Point(Bone('Pelvis'))+Vector((0,0,.003-low)))
            for side,sign,offset in [('L',1,0),('R',-1,.5)]:
                _,lift=Cycle(phase+offset); _,handLift=Cycle(phase+offset+.5)
                for kind,endRole,upperRole,lowerRole,want,pole in [
                    ('foot','Foot','Thigh','Calf',.006+.035*lift,(sign*.70,.15,.12)),
                    ('hand','Hand','UpperArm','Forearm',(.006 if side=='L' else .095)+.065*handLift,(sign*.53,-.12,.08)),
                ]:
                    end=Bone(side+' '+endRole); matrix=ctx['BWorld'](end); rotation=matrix.to_quaternion()
                    target=Point(end); target.z+=want-ctx['LowestOf'](regions[side][kind])
                    if kind=='foot': GroundLeg(side,target,sign)
                    else: Chain(Bone(side+' '+upperRole),Bone(side+' '+lowerRole),end,target,ArmPole(side))
                    p,q,scale=ctx['BWorld'](end).decompose();ctx['Put'](end,Matrix.LocRotScale(p,rotation,scale))
                    if kind=='foot': ProneFoot(side)
        CarryArm(phase)
        for side in 'LR': ArmHinge(side)
        # Ground the visible skin, not the skeleton pivots.
        low,_=ctx['LowestVertex']()
        if low<.003: Move(Bone('Pelvis'),Point(Bone('Pelvis'))+Vector((0,0,.003-low)))
        low,_=ctx['LowestVertex'](); minima.append(low)
        if frame in [0,15,30,45]: print('CONTACT',frame,ctx['RegionLows']())
        values=ctx['SourcePose'](); times.append(round(t,6))
        for i,n in enumerate(names):
            tracks[n]['position'].extend(values[i*7:i*7+3]); tracks[n]['quaternion'].extend(values[i*7+3:i*7+7])
        for pb in arm.pose.bones:
            pb.keyframe_insert('location',frame=frame+1); pb.keyframe_insert('rotation_quaternion',frame=frame+1)
    data={'name':'ProneCrawl','duration':DURATION,'tracks':[]}
    for n,props in tracks.items():
        for prop,values in props.items():
            data['tracks'].append({'name':n.replace(' ','_')+'.'+prop,'type':'vector' if prop=='position' else 'quaternion','times':times,'values':values})
    output.mkdir(parents=True,exist_ok=True); private.mkdir(parents=True,exist_ok=True)
    (output/'Animation_TengxianHumanoidV1ProneCrawl.json').write_text(json.dumps(data,separators=(',',':')),encoding='utf-8')
    manifest={'version':'20260928ProneCrawlV4','skeleton':'TengxianHumanoidV1','clip':'ProneCrawl','fps':FPS,'duration':DURATION,
              'referenceMps':SPEED/f,'stance':STANCE,'minimumSkinHeight':round(min(minima)/f,6),
              'source':'BlenderMCP / Script_ProneCrawlBake.py','referenceModel':'TengxianNra02'}
    (output/'Data_ProneCrawl.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    scene.render.fps=FPS;scene.frame_start=1;scene.frame_end=round(DURATION*FPS);scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(private/'Animation_ProneCrawl.blend'))
    print('PRONE_BAKED',json.dumps(manifest))

helper['Bake']('TengxianNra02',probe=Bake)

