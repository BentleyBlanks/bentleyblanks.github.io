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
    handQ={s:ctx['BWorld'](Bone(s+' Hand')).to_quaternion() for s in ['L','R']}
    feet={s:Point(Bone(s+' Foot')) for s in ['L','R']}
    print('PRONE_BASE',dict(pelvis=list(pelvis),hands={s:list(p) for s,p in hands.items()},feet={s:list(p) for s,p in feet.items()}))
    regions={s:{'foot':ctx['GroupSets'](lambda n,s=s: s+' Foot' in n or s+' Toe' in n or s+' Calf' in n),'hand':ctx['GroupSets'](lambda n,s=s: s+' Hand' in n or s+' Finger' in n)} for s in ['L','R']}
    tracks={n:{'position':[],'quaternion':[]} for n in names}; times=[]; minima=[]
    def Cycle(phase):
        phase%=1
        if phase<STANCE: return .5-phase/STANCE,0
        u=(phase-STANCE)/(1-STANCE)
        return -.5+(u*u*(3-2*u)), math.sin(math.pi*u)**2
    def GroundLeg(side,target,sign):
        a,b,c=[Bone(side+' '+part) for part in ['Thigh','Calf','Foot']]
        start,mid,end=Point(a),Point(b),Point(c)
        l1,l2=(mid-start).length,(end-mid).length
        direction=target-start; distance=max(abs(l1-l2)+.0001,min(direction.length,l1+l2-.0001));direction.normalize()
        centre=start+direction*((l1*l1-l2*l2+distance*distance)/(2*distance))
        radius=math.sqrt(max(0,l1*l1-(centre-start).length_squared))
        up=Vector((0,0,1));up=(up-direction*up.dot(direction)).normalized()
        across=direction.cross(up).normalized()
        cosine=max(-1,min(1,(.14-centre.z)/max(.0001,radius*up.z)))
        sine=math.sqrt(max(0,1-cosine*cosine))
        kneeA=centre+radius*(up*cosine+across*sine);kneeB=centre+radius*(up*cosine-across*sine)
        knee=max([kneeA,kneeB],key=lambda p:p.x*sign)
        Aim(a,b,knee);Aim(b,c,target)
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
            target=feet[side].copy(); target.y=.64-stride*SPEED*DURATION*STANCE
            target.x=sign*(.24+.045*lift); target.z=.080+.035*lift
            pole=Vector((sign*.70,.15,.065))
            GroundLeg(side,target,sign)
            p=Point(Bone(side+' Foot')); q=Quaternion((1,0,0),math.pi) @ ctx['footQuats'][side]
            ctx['Put'](Bone(side+' Foot'),Matrix.LocRotScale(p,q,Vector((1,1,1))))
            # Contralateral reach; right hand keeps the rifle, left palm plants on the soil.
            reach,handLift=Cycle(phase+offset+.5)
            target=Vector((sign*.27,(-.52-reach*SPEED*DURATION*STANCE) if side=='L' else (-.57-reach*.24),.075 if side=='L' else .16))
            target.z+=handLift*.065
            Chain(Bone(side+' UpperArm'),Bone(side+' Forearm'),Bone(side+' Hand'),target,
                  Vector((sign*.53,-.12,.06)))
            if side=='L':
                for pb in arm.pose.bones:
                    if 'L Finger' in pb.name: pb.matrix_basis=ctx['rest'][pb.name]
                Update();ctx['TurnPalm']('L',(0,-1,0),(0,0,-1))
            else:
                matrix=ctx['BWorld'](Bone('R Hand')); p,q,s=matrix.decompose()
                ctx['Put'](Bone('R Hand'),Matrix.LocRotScale(p,handQ['R'],s))
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
                    else: Chain(Bone(side+' '+upperRole),Bone(side+' '+lowerRole),end,target,Vector(pole))
                    p,q,scale=ctx['BWorld'](end).decompose();ctx['Put'](end,Matrix.LocRotScale(p,rotation,scale))
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
    manifest={'version':'20260927ProneCrawlV1','skeleton':'TengxianHumanoidV1','clip':'ProneCrawl','fps':FPS,'duration':DURATION,
              'referenceMps':SPEED/f,'stance':STANCE,'minimumSkinHeight':round(min(minima)/f,6),
              'source':'BlenderMCP / Script_ProneCrawlBake.py','referenceModel':'TengxianNra02'}
    (output/'Data_ProneCrawl.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    scene.render.fps=FPS;scene.frame_start=1;scene.frame_end=round(DURATION*FPS);scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(private/'Animation_ProneCrawl.blend'))
    print('PRONE_BAKED',json.dumps(manifest))

helper['Bake']('TengxianNra02',probe=Bake)

