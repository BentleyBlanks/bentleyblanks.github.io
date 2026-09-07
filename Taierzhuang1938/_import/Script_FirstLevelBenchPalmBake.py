"""Author thigh/palm support over the immutable seated V2 original-rig take.

Contact follows a triangle on the actual thigh skin. V2 body/legs and raw
recovery remain unchanged; only arm and finger rotations are authored in V3.
"""
from pathlib import Path
import argparse,copy,hashlib,json,math,sys
import bpy,numpy as np
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree


def Main():
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);root=args.root.resolve()
    name='TrainBenchRise';group='FirstLevelBenchV3'
    assert not (root/'Video/Sources/FirstLevelV1'/name/'Data_RetargetAssessment_V3.json').exists(),\
        'V3 has recorded visual evidence. Make a new revision before modifying reviewed output.'
    Read=lambda p:json.loads(p.read_text(encoding='utf-8'))
    Hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    catalog=Read(root/'Preview/Data_Catalog.json');entry=next(a for a in catalog['actions'] if a['id']==name)
    source=next(v for v in entry['variants'] if v['id']=='Nra-v2-'+name)
    sourcePath=root/source['blend'];sourceHash=Hash(sourcePath)
    bpy.ops.wm.open_mainfile(filepath=str(sourcePath));scene=bpy.context.scene
    arm=next(o for o in scene.objects if o.type=='ARMATURE')
    body=next(o for o in scene.objects if o.type=='MESH' and o.vertex_groups)
    Bone=lambda p:arm.pose.bones['Bip002 '+p]
    World=lambda b:arm.matrix_world@b.matrix
    Point=lambda p:World(Bone(p)).translation.copy()
    def MeshPoints():
        bpy.context.view_layer.update()
        obj=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=obj.to_mesh()
        p=[obj.matrix_world@v.co for v in mesh.vertices];obj.to_mesh_clear();return p
    def Basis(f,d):
        f=f.normalized();d=(d-f*d.dot(f)).normalized()
        return Matrix((f,d,f.cross(d))).transposed()
    def Aim(a,b,target):
        m=World(a);origin=m.translation.copy()
        m=(Point(b.name.removeprefix('Bip002 '))-origin).rotation_difference(target-origin).to_matrix().to_4x4()@m
        m.translation=origin;a.matrix=arm.matrix_world.inverted()@m;bpy.context.view_layer.update()
    def SolveArm(side,target):
        a,b,c=[Bone(side+' '+p) for p in ['UpperArm','Forearm','Hand']]
        shoulder,elbow,wrist=[World(v).translation.copy() for v in [a,b,c]]
        l1=(elbow-shoulder).length;l2=(wrist-elbow).length;delta=target-shoulder
        assert abs(l1-l2)+1e-5<delta.length<(l1+l2)*.998,(side,delta.length,l1+l2,list(shoulder),list(target))
        direction=delta.normalized();pole=elbow-shoulder;pole-=direction*pole.dot(direction);pole.normalize()
        along=(l1*l1-l2*l2+delta.length_squared)/(2*delta.length)
        desired=shoulder+direction*along+pole*math.sqrt(max(0,l1*l1-along*along))
        Aim(a,b,desired);Aim(b,c,target)
    count=scene.frame_end;fps=scene.render.fps;originals=[];worlds=[]
    rest={b.name:[list(row) for row in b.matrix_local] for b in arm.data.bones}
    for frame in range(1,count+1):
        scene.frame_set(frame);bpy.context.view_layer.update()
        originals.append({b.name:b.matrix_basis.copy() for b in arm.pose.bones})
        worlds.append({b.name:World(b).copy() for b in arm.pose.bones})
    scene.frame_set(1);bpy.context.view_layer.update();points=MeshPoints()
    body.data.calc_loop_triangles();triangles=[tuple(t.vertices) for t in body.data.loop_triangles]
    calibration={}
    for side in ['L','R']:
        hand=Bone(side+' Hand');inv=(arm.matrix_world@hand.bone.matrix_local).inverted()
        roots=[inv@(arm.matrix_world@Bone(side+' Finger'+str(i)).bone.matrix_local).translation for i in range(1,5)]
        forward=sum(roots,Vector())/4;across=roots[0]-roots[-1]
        if side=='L':across.negate()
        dorsal=forward.cross(across).normalized();scale=World(hand).to_scale()
        palm=forward*.55-dorsal*(.014/scale.x)
        # The original character has shorter arms than the recovered performer.
        # Move support to the proximal thigh instead of stretching its bones.
        # This is an authored contact relocation, not preserved source wrists.
        hip=Point(side+' Thigh');knee=Point(side+' Calf');f=(knee-hip).normalized()
        d=(Vector((0,0,1))-f*f.z).normalized();center=hip.lerp(knee,.08)
        groupIndex=body.vertex_groups['Bip002 '+side+' Thigh'].index
        thighIds={v.index for v in body.data.vertices if sum(g.weight for g in v.groups if g.group==groupIndex)>.65}
        faces=[t for t in triangles if all(i in thighIds for i in t)]
        tree=BVHTree.FromPolygons(points,faces,all_triangles=True)
        location,normal,triIndex,distance=tree.ray_cast(center+d*.4,-d,.8)
        assert triIndex is not None,(side,'No thigh skin intersection')
        triangle=faces[triIndex];a,b,c=[points[i] for i in triangle]
        bc=np.linalg.lstsq(np.array([list(b-a),list(c-a)]).T,np.array(location-a),rcond=None)[0]
        bary=[1-float(bc.sum()),float(bc[0]),float(bc[1])]
        handIds=[v.index for v in body.data.vertices if sum(g.weight for g in v.groups
            if body.vertex_groups[g.group].name.startswith('Bip002 '+side+' Hand') or
            body.vertex_groups[g.group].name.startswith('Bip002 '+side+' Finger'))>.8]
        calibration[side]=dict(native=Basis(forward,dorsal),palm=palm,scale=scale,triangle=triangle,bary=bary,
            faces=faces,handVertices=handIds)
    arm.animation_data_clear();actionName='Animation_Nra_TrainBenchRise_V3'
    action=bpy.data.actions.new(actionName);action.use_fake_user=True
    arm.animation_data_create();arm.animation_data.action=action
    changed=[b for b in arm.pose.bones if any(p in b.name for p in ['UpperArm','Forearm','Hand','Finger'])]
    unchanged=[b for b in arm.pose.bones if b not in changed];previous={};samples=[]
    for frame in range(1,count+1):
        scene.frame_set(frame)
        for b in arm.pose.bones:b.matrix_basis=originals[frame-1][b.name];b.rotation_mode='QUATERNION'
        bpy.context.view_layer.update();seconds=(frame-1)/fps
        release=max(0,min(1,(seconds-5.2)/.5));weight=1-release*release*(3-2*release)
        supportPoints=MeshPoints();contacts={}
        if weight>0:
            for side,cfg in calibration.items():
                hand=Bone(side+' Hand');a,b,c=[supportPoints[i] for i in cfg['triangle']]
                surface=sum((supportPoints[i]*w for i,w in zip(cfg['triangle'],cfg['bary'])),Vector())
                normal=(b-a).cross(c-a).normalized()
                if normal.z<0:normal.negate()
                f=(Point(side+' Calf')-Point(side+' Thigh')).normalized()
                orientation=Basis(f,normal)@cfg['native'].transposed()
                palm=Vector([v*s for v,s in zip(cfg['palm'],cfg['scale'])])
                target=surface+normal*.002
                for finger in [p for p in arm.pose.bones if p.name.startswith('Bip002 '+side+' Finger')]:
                    old=originals[frame-1][finger.name].decompose()
                    finger.matrix_basis=Matrix.LocRotScale(old[0],old[1].slerp(Matrix.Identity(3).to_quaternion(),weight),old[2])
                # Fit the skin, not merely the calibrated wrist point. Nearest
                # thigh faces check the palm and finger surface separately.
                tree=BVHTree.FromPolygons(supportPoints,cfg['faces'],all_triangles=True)
                gap=0
                for _ in range(5):
                    originalHand=worlds[frame-1][hand.name]
                    wrist=originalHand.translation.lerp(target-orientation@palm,weight)
                    rotation=originalHand.to_quaternion().slerp(orientation.to_quaternion(),weight)
                    SolveArm(side,wrist)
                    hand.matrix=arm.matrix_world.inverted()@Matrix.LocRotScale(wrist,rotation,cfg['scale'])
                    handPoints=MeshPoints();distances=[]
                    for i in cfg['handVertices']:
                        hit,n,index,dist=tree.find_nearest(handPoints[i])
                        if n.dot(normal)<0:n.negate()
                        if dist<.16:distances.append((handPoints[i]-hit).dot(n))
                    assert distances
                    gap=min(distances)
                    if abs(gap-.001)<.0001 or weight<1:break
                    target+=normal*(.001-gap)
                contacts[side]=dict(surface=list(surface),normal=list(normal),target=list(target),
                    palmLocal=list(cfg['palm']),minimumHandThighGap=gap,
                    wristCorrection=(Point(side+' Hand')-worlds[frame-1][hand.name].translation).length)
                if weight==1:assert .0008<gap<.0012,(seconds,side,gap)
        bpy.context.view_layer.update()
        error=max(max(abs(x-y) for row,prior in zip(World(b),worlds[frame-1][b.name]) for x,y in zip(row,prior)) for b in unchanged)
        assert error<.00003,error
        samples.append(dict(frame=frame,sourceSeconds=seconds,contactWeight=weight,contacts=contacts,unchangedBodyMatrixError=error))
        for bone in arm.pose.bones:
            if bone.name in previous and bone.rotation_quaternion.dot(previous[bone.name])<0:bone.rotation_quaternion.negate()
            previous[bone.name]=bone.rotation_quaternion.copy()
            for prop in ['location','rotation_quaternion','scale']:bone.keyframe_insert(data_path=prop,frame=frame)
        if frame%120==0:print(name,frame,count,flush=True)
    assert {b.name:[list(row) for row in b.matrix_local] for b in arm.data.bones}==rest
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:key.interpolation='LINEAR'
    out=root/'Models'/group;blends=root/'Blender'/group
    out.mkdir(parents=True,exist_ok=True);blends.mkdir(parents=True,exist_ok=True)
    glb=out/(actionName+'.glb');blend=blends/'Scene_Nra_TrainBenchRise_V3.blend'
    scene.frame_set(1);bpy.ops.object.select_all(action='DESELECT')
    for obj in scene.objects:
        if obj==arm or obj==body or obj.name.startswith('Prop_TrainBench'):obj.select_set(True)
    bpy.context.view_layer.objects.active=arm
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,use_active_scene=True,
        export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name=actionName,
        export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True,export_skins=True,export_yup=True,export_extras=True)
    scene['contactPolicy']='V3 authored arms and relaxed fingers; V2 body and lower limbs unchanged.'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True);assert Hash(sourcePath)==sourceHash
    report=dict(status='numeric_checks_passed_pending_export_and_visual_review',sourceVariant=source['id'],
        sourceBlend=source['blend'],sourceBlendSha256=sourceHash,path=glb.relative_to(root).as_posix(),
        modelSha256=Hash(glb),blend=blend.relative_to(root).as_posix(),clip=actionName,frames=count,samples=samples,
        originalBindUnchanged=True,runtimeEnabled=False,visualAcceptance=False,
        contactSourceSeconds=[0,5.2],releaseSourceSeconds=[5.2,5.7],
        calibration={side:dict(triangle=c['triangle'],bary=c['bary'],palmLocal=list(c['palm']),handVertices=c['handVertices']) for side,c in calibration.items()})
    reportPath=out/'Data_TrainBenchRisePalmValidation.json';reportPath.write_text(json.dumps(report,indent=2),encoding='utf-8')
    registered={k:copy.deepcopy(v) for k,v in entry.items() if k not in ['variants','latestByFaction']}
    review=copy.deepcopy(source['review']);review.update(retargetReport=reportPath.relative_to(root).as_posix(),
        sourceAssessment='V3：V2 座凳与双脚保持；新增双掌扶腿、指部放松与起身松手。手臂为后期修正，待掌面近景审阅。',
        retargetNotes='Authored arm/finger rotations over V2 support, original recovery unchanged.')
    registered['variants']=[dict(id='Nra-v3-'+name,faction='Nra',revisionOrder=3,label='V3 · 双掌扶腿与起身松手',
        status='待审阅 · 掌腿接触',path=report['path'],blend=report['blend'],clip=actionName,review=review,travelMeters=None)]
    (out/'Data_Versions.json').write_text(json.dumps(dict(actions=[registered]),ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(dict(frames=count,maxBodyError=max(s['unchangedBodyMatrixError'] for s in samples),
        maxWristCorrection=max(c['wristCorrection'] for s in samples for c in s['contacts'].values()))))


if __name__=='__main__':Main()
