"""Donkey-sized four-beat walk, planted soles, quiet idle and distance wheel clip.

The two-link plus folding cannon solver follows the audited OxCart convention;
all joint origins, step lengths, timing, shoulder excursions and skin are new.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Matrix,Vector

scene=bpy.context.scene
assetName=globals().get('DonkeyAssetName','DonkeyCart');standalone=assetName=='Donkey'
base=Path(scene['DonkeySourceRoot']) if standalone else Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020')
rig=bpy.data.objects['DonkeyRig'];cart=None if standalone else bpy.data.objects['DonkeyCartRig'];skin=bpy.data.objects['DonkeyContinuousSkin']
rest={b.name:b.matrix_local.copy() for b in rig.data.bones}
origins={b.name:b.head_local.copy() for b in rig.data.bones}
suffixes=['Pivot','ElbowPivot','KneePivot','HoofPivot']
stride=.68;walkFrames=36;period=walkFrames/scene.render.fps

def Wrap(value):return math.atan2(math.sin(value),math.cos(value))

def Solve(points,target,fold):
    p0,p1,p2,p3=[Vector((0,p.y,p.z)) for p in points]
    folded=Matrix.Rotation(fold,3,'X')@(p3-p2)
    upper,lower=p1-p0,p2+folded-p1
    reach=Vector((0,target[0],target[1]))-p0
    a,b,d=upper.length,lower.length,reach.length
    bend=1 if (p3-p0).y*upper.z-(p3-p0).z*upper.y>0 else -1
    clamped=max(abs(a-b)+1e-6,min(a+b-1e-6,d))
    alpha=math.acos(max(-1,min(1,(a*a+clamped*clamped-b*b)/(2*a*clamped))))
    angle=math.atan2(reach.z,reach.y)+bend*alpha
    knee=p0+a*Vector((0,math.cos(angle),math.sin(angle)))
    delta=Vector((0,target[0],target[1]))-knee
    lowerAngle=math.atan2(delta.z,delta.y)
    pivot=Wrap(angle-math.atan2(upper.z,upper.y))
    elbow=Wrap(lowerAngle-math.atan2(lower.z,lower.y)-pivot)
    return pivot,elbow,pivot+elbow+fold,abs(d-clamped)

def FootTarget(point,phase,front):
    duty=.64 if front else .66;sweep=stride*duty
    if phase<duty:return point.y+sweep/2-stride*phase,point.z,0,True
    u=(phase-duty)/(1-duty)
    tangent=-(1-duty)/duty
    eased=u*u*(3-2*u)+tangent*u*(1-u)*(1-2*u)
    arc=math.sin(math.pi*u)**2
    return point.y-sweep/2+sweep*eased,point.z+(.085 if front else .070)*arc,arc,False

def WorldPose(phase,idle=False):
    # A standing limb is almost straight. During locomotion the torso settles
    # into its support limbs instead of forcing the knee backward for reach.
    bob=(-.004+.0025*math.sin(2*math.pi*phase) if idle else -.032+.005*math.sin(4*math.pi*phase-.5))
    worlds={'DonkeyRoot':rest['DonkeyRoot'].copy(),'DonkeyHitchPivot':rest['DonkeyHitchPivot'].copy()}
    movement=Matrix.Translation((.002*math.sin(2*math.pi*phase),0,bob))
    worlds['DonkeyBodyPivot']=movement@rest['DonkeyBodyPivot']
    axial=['DonkeyThoraxPivot']+(['DonkeyChestPivot'] if 'DonkeyChestPivot' in rest else [])+['DonkeyPelvisPivot','DonkeyNeckPivot','DonkeyHeadPivot','DonkeyTailPivot','DonkeyTailTipPivot','DonkeyEarLeftPivot','DonkeyEarRightPivot']
    for name in axial:
        parent=rig.data.bones[name].parent.name
        local=rest[parent].inverted()@rest[name]
        angle=0;axis='X'
        if name=='DonkeyNeckPivot':angle=(.009 if idle else .014)*math.sin(2*math.pi*phase+.6)
        if name=='DonkeyHeadPivot':angle=(.007 if idle else .012)*math.sin(2*math.pi*phase+1.2)
        if name=='DonkeyTailPivot':angle=.020*math.sin(2*math.pi*phase+.3);axis='Y'
        if name=='DonkeyTailTipPivot':angle=.025*math.sin(2*math.pi*phase-.5);axis='Y'
        if 'Ear' in name:angle=.014*math.sin(2*math.pi*phase+(-.7 if 'Left' in name else .9));axis='Z'
        worlds[name]=worlds[parent]@local@Matrix.Rotation(angle,4,axis)
    metrics=[]
    for front in (True,False):
        for side in ('Left','Right'):
            stem='Donkey'+('Front' if front else 'Rear')+side
            names=[stem+s for s in suffixes];p=[origins[n].copy() for n in names]
            offset=(.75 if front else 0)+(.5 if side=='Right' else 0)
            step=(phase+offset)%1
            ty,tz,arc,planted=(p[3].y,p[3].z,0,True) if idle else FootTarget(p[3],step,front)
            rootShift=(ty-p[3].y)*(.22 if front else .07) if not idle else 0
            shifted=[point+Vector((0,rootShift,bob)) for point in p]
            fold=(-.60 if front else .48)*arc
            pivot,elbow,cannon,miss=Solve(shifted,(ty,tz),fold)
            angles=[pivot,pivot+elbow,cannon,-.20*arc]
            points=[shifted[0]]
            for i in range(1,4):points.append(points[i-1]+Matrix.Rotation(angles[i-1],3,'X')@(p[i]-p[i-1]))
            for name,point,angle in zip(names,points,angles):worlds[name]=Matrix.Translation(point)@Matrix.Rotation(angle,4,'X')
            metrics.append({'stem':stem,'step':step,'planted':planted,'target':[ty,tz],'foot':list(points[3]),'miss':miss})
    return worlds,metrics

def ApplyWorlds(worlds,frame=None):
    for bone in rig.data.bones:
        parent=bone.parent
        localRest=rest[parent.name].inverted()@rest[bone.name] if parent else rest[bone.name]
        localPose=worlds[parent.name].inverted()@worlds[bone.name] if parent else worlds[bone.name]
        pose=rig.pose.bones[bone.name];pose.rotation_mode='QUATERNION';pose.matrix_basis=localRest.inverted()@localPose
        if frame is not None:
            pose.keyframe_insert('location',frame=frame);pose.keyframe_insert('rotation_quaternion',frame=frame)

def ClearAnimations(obj):
    obj.animation_data_clear()
    for bone in obj.pose.bones:bone.matrix_basis=Matrix.Identity(4)

for obj in (rig,cart):
    if obj:ClearAnimations(obj)
for name in ('DonkeyWalk','DonkeyIdle','CartRoll'):
    action=bpy.data.actions.get(name)
    if action:bpy.data.actions.remove(action)

results=[]
for name,start,count,idle in (('DonkeyWalk',1,walkFrames,False),('DonkeyIdle',61,90,True)):
    rig.animation_data_create();action=bpy.data.actions.new(name);rig.animation_data.action=action
    worst=0
    for i in range(count+1):
        worlds,metrics=WorldPose(i/count,idle)
        worst=max(worst,max(m['miss'] for m in metrics))
        ApplyWorlds(worlds,start+i)
    track=rig.animation_data.nla_tracks.new();track.name=name
    strip=track.strips.new(name,start,action);strip.extrapolation='NOTHING'
    strip.action_frame_start=start;strip.action_frame_end=start+count
    rig.animation_data.action=None
    results.append({'action':name,'durationS':count/scene.render.fps,'worstSolverMissM':worst})

if cart:
    cart.animation_data_create();roll=bpy.data.actions.new('CartRoll');cart.animation_data.action=roll
    for i in range(61):
        for name in ('WheelLeft','WheelRight'):
            bone=cart.pose.bones[name];bone.rotation_mode='QUATERNION';bone.rotation_quaternion=Matrix.Rotation(-2*math.pi*i/60,3,'X').to_quaternion()
            bone.keyframe_insert('rotation_quaternion',frame=181+i)
    track=cart.animation_data.nla_tracks.new();track.name='CartRoll';strip=track.strips.new('CartRoll',181,roll);strip.extrapolation='NOTHING'
    strip.action_frame_start=181;strip.action_frame_end=241;cart.animation_data.action=None
rig['strideM']=stride;rig['walkPeriodS']=period;rig['gaitDutyFront']=.64;rig['gaitDutyRear']=.66
rig['walkStanceCompressionM']=.032;rig['idleStanceCompressionM']=.004
rig['walkCoordinateSystem']='Blender +Y forward; glTF -Z forward; stride clock follows distance'
rig['sourceRigReuse']='Audited four-pivot limb hierarchy and two-link/folding-cannon solver; donkey rest origins, skin, gait and all harness rebuilt'
if cart:cart['rollDistancePerCycleM']=2*math.pi*cart['wheelRadiusM'];cart['rollClipDurationS']=2

# Lead endpoints remain above the ground as the head nods and breathes.
if not standalone:
    lead=bpy.data.objects['HalterHangingLead']
    lead.vertex_groups.clear()
    for vertex in lead.data.vertices:
        t=max(0,min(1,(.954-vertex.co.z)/.936));head=(1-t)**1.8
        for name,value in (('DonkeyHeadPivot',head),('DonkeyHitchPivot',1-head)):
            if value>1e-8:
                group=lead.vertex_groups.get(name) or lead.vertex_groups.new(name=name);group.add([vertex.index],value,'REPLACE')

# Measure actual evaluated skin, rather than only the IK marker's algebra.
soleIndices={}
for front in ('Front','Rear'):
    for side in ('Left','Right'):
        stem='Donkey'+front+side;idx=skin.vertex_groups[stem+'HoofPivot'].index
        soleIndices[stem]=[v.index for v in skin.data.vertices if v.co.z<.035 and any(g.group==idx and g.weight>.98 for g in v.groups)]
measurements=[]
for frame in range(1,walkFrames+2):
    scene.frame_set(frame);bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
    evaluated=skin.evaluated_get(deps);mesh=evaluated.to_mesh()
    _,metrics=WorldPose((frame-1)/walkFrames)
    for item in metrics:
        indices=soleIndices[item['stem']]
        points=[mesh.vertices[i].co for i in indices]
        if not points:raise RuntimeError('Missing actual sole surface: '+item['stem'])
        item['frame']=frame;item['minSoleZ']=min(v.z for v in points)
        item['meanSoleY']=sum(v.y for v in points)/len(points)
        measurements.append(item)
    evaluated.to_mesh_clear()
planted=[row for row in measurements if row['planted']]
drift=[]
for stem in soleIndices:
    rows=[row for row in measurements if row['stem']==stem]
    for a,b in zip(rows,rows[1:]):
        if a['planted'] and b['planted'] and 0<b['step']-a['step']<.1:
            drift.append(abs(b['meanSoleY']-a['meanSoleY']+stride/walkFrames))
report={'actions':results,'strideM':stride,'periodS':period,'speedMps':stride/period,
        'stanceSoleRangeM':[min(r['minSoleZ'] for r in planted),max(r['minSoleZ'] for r in planted)],
        'worstStanceDriftPerFrameM':max(drift),'worstSolverMissM':max(r['miss'] for r in measurements),'measurements':measurements}
(base/'Review/Data_AnimationMeasurements.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
scene.frame_start=1;scene.frame_end=241;scene.frame_set(0)
for filename in ('Script_DonkeyCartAnimate.py','Script_DonkeyCartReview.py'):
    text=bpy.data.texts.get(filename) or bpy.data.texts.new(filename);text.clear()
    text.write((Path(scene['DonkeyCartProject'])/'_blender'/filename).read_text(encoding='utf-8'))
bpy.ops.wm.save_as_mainfile(filepath=str(base/('Scene_'+assetName+'.blend')))
print(json.dumps({k:v for k,v in report.items() if k!='measurements'}))
if report['worstSolverMissM']>.0001:raise RuntimeError('Donkey limb target leaves reachable volume')
if min(r['minSoleZ'] for r in planted)<-.0005 or max(r['minSoleZ'] for r in planted)>.002:raise RuntimeError('Actual planted sole leaves ground tolerance')
if max(drift)>.0001:raise RuntimeError('Actual planted sole slides against travelled distance')
