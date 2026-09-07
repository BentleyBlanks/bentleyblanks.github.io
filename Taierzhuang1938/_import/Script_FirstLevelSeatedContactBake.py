"""Fit original-rig seated sequences to a measured 0.48 m bench and fixed soles.

V1/raw stay immutable. Root/support and two-bone leg corrections are authored;
they are never described as unmodified recovery. No mission facts are written.
"""
from pathlib import Path
import argparse,copy,hashlib,json,math,sys
import bpy,numpy as np
from mathutils import Matrix,Vector


def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--clip',choices=['TrainBenchRise','TrainMealCutOffer'],required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    root=args.root.resolve();name=args.clip;group='FirstLevelSeatedV2'
    assert not (root/'Video/Sources/FirstLevelV1'/name/'Data_RetargetAssessment_V2.json').exists(),\
        'V2 has recorded visual evidence. Make a new revision before modifying reviewed output.'
    out=root/'Models'/group;blends=root/'Blender'/group
    out.mkdir(parents=True,exist_ok=True);blends.mkdir(parents=True,exist_ok=True)
    Read=lambda p:json.loads(p.read_text(encoding='utf-8'))
    Hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    catalog=Read(root/'Preview/Data_Catalog.json')
    entry=next(a for a in catalog['actions'] if a['id']==name)
    variant=next(v for v in entry['variants'] if v['id']=='Nra-v1-'+name)
    raw=Read(root/variant['review']['recoveryTracks'][0]['path'])
    assert Hash(root/raw['sourceCache'])==raw['sourceCacheSha256']
    with np.load(root/raw['sourceCache']) as data:assert np.array_equal(data['worldJoints'],np.array(raw['positions']))
    sourceBlend=root/variant['blend'];sourceHash=Hash(sourceBlend)
    bpy.ops.wm.open_mainfile(filepath=str(sourceBlend));scene=bpy.context.scene
    arm=next(o for o in scene.objects if o.type=='ARMATURE')
    body=next(o for o in scene.objects if o.type=='MESH' and o.vertex_groups)
    prefix='Bip002 '
    Bone=lambda p:arm.pose.bones[prefix+p]
    World=lambda b:arm.matrix_world@b.matrix
    Point=lambda p:World(Bone(p)).translation.copy()
    def MeshPoints():
        bpy.context.view_layer.update()
        obj=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=obj.to_mesh()
        coordinates=np.empty(len(mesh.vertices)*3,dtype=np.float32)
        mesh.vertices.foreach_get('co',coordinates);m=np.array(obj.matrix_world)
        points=coordinates.reshape(-1,3)@m[:3,:3].T+m[:3,3];obj.to_mesh_clear();return points
    count=scene.frame_end;fps=scene.render.fps
    originals=[];worlds=[]
    for frame in range(1,count+1):
        scene.frame_set(frame);bpy.context.view_layer.update()
        originals.append({b.name:b.matrix_basis.copy() for b in arm.pose.bones})
        worlds.append({b.name:World(b).copy() for b in arm.pose.bones})
    scene.frame_set(1);bpy.context.view_layer.update()
    rest={b.name:[list(row) for row in b.matrix_local] for b in arm.data.bones}
    parents={b.name:b.parent.name if b.parent else None for b in arm.data.bones}
    startPelvis=Point('Pelvis');initialPoints=MeshPoints()
    footVertices={};footTargets={};footMatrices={};toeBasis={}
    groups={g.name:g.index for g in body.vertex_groups}
    for side in ['L','R']:
        ids={groups[prefix+side+' '+p] for p in ['Foot','Toe0']}
        vertices=[v.index for v in body.data.vertices if sum(g.weight for g in v.groups if g.group in ids)>.65]
        assert len(vertices)>50
        footVertices[side]=vertices
        footTargets[side]=Point(side+' Foot')
        footTargets[side].z+=.002-float(initialPoints[vertices,2].min())
        footMatrices[side]=World(Bone(side+' Foot')).copy()
        toeBasis[side]=Bone(side+' Toe0').matrix_basis.copy()
    # Fixed material point region over the bench, including the actual coat hem.
    # This reports the original mesh's required pelvis height, not an invented
    # claim that its cloth already fits the legacy 0.60 m pelvis placeholder.
    supportGroups={groups[prefix+p] for p in ['Pelvis','Spine','L Thigh','R Thigh']}
    seatVertices=[v.index for v in body.data.vertices if
        sum(g.weight for g in v.groups if g.group in supportGroups)>.5
        and initialPoints[v.index,2]<startPelvis.z]
    assert len(seatVertices)>20
    seatTop=.48
    seatBounds=[(startPelvis.x-.55,startPelvis.y-.17,.44),
        (startPelvis.x+.55,startPelvis.y+.21,seatTop)]
    def SeatMinimum(points):
        # Use the complete physical footprint, including the rear coat corners.
        region=points[seatVertices]
        mask=(region[:,0]>seatBounds[0][0])&(region[:,0]<seatBounds[1][0])&\
            (region[:,1]>seatBounds[0][1])&(region[:,1]<seatBounds[1][1])
        return float(region[mask,2].min()) if mask.any() else seatTop+.002
    arm.animation_data_clear()
    actionName='Animation_Nra_'+name+'_V2'
    action=bpy.data.actions.new(actionName);action.use_fake_user=True
    arm.animation_data_create();arm.animation_data.action=action
    for b in arm.pose.bones:b.rotation_mode='QUATERNION'
    def Smooth(t):
        t=max(0,min(1,t));return t*t*(3-2*t)
    def Aim(bone,child,target):
        world=World(bone);start=world.translation.copy()
        delta=(World(child).translation-start).rotation_difference(target-start)
        matrix=delta.to_matrix().to_4x4()@world;matrix.translation=start
        bone.matrix=arm.matrix_world.inverted()@matrix;bpy.context.view_layer.update()
    def SolveLeg(side,target):
        a,b,c=[Bone(side+' '+p) for p in ['Thigh','Calf','Foot']]
        hip,knee,ankle=[World(v).translation.copy() for v in [a,b,c]]
        l1=(knee-hip).length;l2=(ankle-knee).length;delta=target-hip
        distance=delta.length
        assert abs(l1-l2)+1e-5<distance<(l1+l2)*.9995,(name,side,distance,l1+l2)
        forward=delta.normalized();pole=knee-hip;pole-=forward*pole.dot(forward)
        if pole.length<.001:pole=Vector((0,-1,0))-forward*(-forward.y)
        pole.normalize();along=(l1*l1-l2*l2+distance*distance)/(2*distance)
        desired=hip+forward*along+pole*math.sqrt(max(0,l1*l1-along*along))
        Aim(a,b,desired);Aim(b,c,target)
        matrix=footMatrices[side].copy();matrix.translation=target
        c.matrix=arm.matrix_world.inverted()@matrix
        Bone(side+' Toe0').matrix_basis=toeBasis[side]
        bpy.context.view_layer.update()
    reports=[];previous={};baselineLengths={}
    for frame in range(1,count+1):
        scene.frame_set(frame)
        for b in arm.pose.bones:b.matrix_basis=originals[frame-1][b.name]
        bpy.context.view_layer.update()
        seconds=(frame-1)/fps
        # Source observation: feet stay planted through the bench rise. Root
        # leaves the seat during the observed 4.5–5.8 s rise, retaining its timing.
        seated=1 if name=='TrainMealCutOffer' else 1-Smooth((seconds-4.5)/1.3)
        originalPelvis=Point('Pelvis')
        shift=Vector(((startPelvis.x-originalPelvis.x)*seated,
            (startPelvis.y-originalPelvis.y)*seated,0))
        current=World(Bone('Pelvis'));current.translation+=shift
        Bone('Pelvis').matrix=arm.matrix_world.inverted()@current;bpy.context.view_layer.update()
        baseSeat=SeatMinimum(MeshPoints())
        shift.z=(seatTop+.002-baseSeat)*seated
        current=World(Bone('Pelvis'));current.translation.z+=shift.z
        Bone('Pelvis').matrix=arm.matrix_world.inverted()@current;bpy.context.view_layer.update()
        # Bound root height by both original leg reaches before IK; no stretch.
        reachDrop=0
        for side in ['L','R']:
            hip,knee,ankle=[Point(side+' '+p) for p in ['Thigh','Calf','Foot']]
            reach=((hip-knee).length+(knee-ankle).length)*.998
            d=hip-footTargets[side];horizontal=d.x*d.x+d.y*d.y
            assert horizontal<reach*reach
            reachDrop=max(reachDrop,hip.z-footTargets[side].z-math.sqrt(reach*reach-horizontal))
        if reachDrop>0:
            current=World(Bone('Pelvis'));current.translation.z-=reachDrop
            Bone('Pelvis').matrix=arm.matrix_world.inverted()@current;bpy.context.view_layer.update()
        for side in ['L','R']:SolveLeg(side,footTargets[side])
        # The coat and upper thighs deform with the new knees. Correct support
        # against their evaluated skin, then solve the same fixed foot targets.
        if seated>0:
            for _ in range(16):
                error=seatTop+.002-SeatMinimum(MeshPoints())
                # During departure only resolve penetration; preserve the rise.
                if seated<.999:error=max(0,error)
                if abs(error)<.00002:break
                current=World(Bone('Pelvis'));current.translation.z+=error
                Bone('Pelvis').matrix=arm.matrix_world.inverted()@current;bpy.context.view_layer.update()
                for side in ['L','R']:SolveLeg(side,footTargets[side])
        points=MeshPoints();pelvis=Point('Pelvis');rootShift=pelvis-originalPelvis
        maxLengthError=0
        for side in ['L','R']:
            for parent,child in [('Thigh','Calf'),('Calf','Foot'),('Foot','Toe0')]:
                key=side+parent
                length=(Point(side+' '+parent)-Point(side+' '+child)).length
                baselineLengths.setdefault(key,(worlds[0][prefix+side+' '+parent].translation-worlds[0][prefix+side+' '+child].translation).length)
                maxLengthError=max(maxLengthError,abs(length-baselineLengths[key]))
        untouched=[b for b in arm.pose.bones if (b==Bone('Pelvis') or Bone('Pelvis') in b.parent_recursive)
            and not any(t in b.name for t in ['Thigh','Calf','Foot','Toe'])]
        relativeError=max((World(b).translation-worlds[frame-1][b.name].translation-rootShift).length for b in untouched)
        reports.append(dict(frame=frame,sourceSeconds=seconds,seatedWeight=seated,pelvis=list(pelvis),
            rootCorrectionMeters=list(rootShift),seatMinimumZ=SeatMinimum(points),
            footMinimumZ={s:float(points[footVertices[s],2].min()) for s in ['L','R']},
            footTargets={s:list(footTargets[s]) for s in ['L','R']},
            footError=max((Point(s+' Foot')-footTargets[s]).length for s in ['L','R']),
            maxLengthError=maxLengthError,upperBodyRelativeError=relativeError,
            kneeCorrection={s:(Point(s+' Calf')-worlds[frame-1][prefix+s+' Calf'].translation-rootShift).length for s in ['L','R']}))
        for b in arm.pose.bones:
            if b.name in previous and b.rotation_quaternion.dot(previous[b.name])<0:b.rotation_quaternion.negate()
            previous[b.name]=b.rotation_quaternion.copy()
            for prop in ['location','rotation_quaternion','scale']:b.keyframe_insert(data_path=prop,frame=frame)
        if frame%120==0:print(name,frame,count,flush=True)
    assert max(r['footError'] for r in reports)<.00003
    assert max(r['maxLengthError'] for r in reports)<.00003
    assert max(r['upperBodyRelativeError'] for r in reports)<.00003
    assert {b.name:[list(row) for row in b.matrix_local] for b in arm.data.bones}==rest
    assert {b.name:b.parent.name if b.parent else None for b in arm.data.bones}==parents
    wood=bpy.data.materials.new('Material_TrainBenchContact');wood.diffuse_color=(.30,.19,.10,1)
    wood.use_nodes=True
    shader=wood.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=wood.diffuse_color
    shader.inputs['Roughness'].default_value=.85
    props=[]
    for label,center,size in [('Seat',(startPelvis.x,startPelvis.y+.02,.46),(1.1,.38,.04)),
        *[(f'Leg{x}{y}',(startPelvis.x+x*.45,startPelvis.y+.02+y*.13,.22),(.07,.07,.44)) for x in [-1,1] for y in [-1,1]]]:
        bpy.ops.mesh.primitive_cube_add(size=1,location=center)
        obj=bpy.context.object;obj.name='Prop_TrainBench'+label;obj.scale=size;obj.data.materials.append(wood);props.append(obj)
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:key.interpolation='LINEAR'
    scene.frame_set(1);bpy.ops.object.select_all(action='DESELECT')
    for obj in [arm,body]+props:obj.select_set(True)
    bpy.context.view_layer.objects.active=arm
    glb=out/(actionName+'.glb');blend=blends/f'Scene_Nra_{name}_V2.blend'
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,use_active_scene=True,
        export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name=actionName,
        export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True,export_skins=True,export_yup=True,export_extras=True)
    scene['contactPolicy']='V2 authored seat and two-bone leg support. Original bind and raw recovery unchanged.'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
    assert Hash(sourceBlend)==sourceHash
    report=dict(status='numeric_checks_passed_pending_visual_review',sourceVariant=variant['id'],sourceBlendSha256=sourceHash,
        sourceCacheSha256=raw['sourceCacheSha256'],sourceVideoSha256=Hash(root/variant['review']['sourceVideo']),
        path=glb.relative_to(root).as_posix(),blend=blend.relative_to(root).as_posix(),clip=actionName,
        seatTopMeters=seatTop,seatBounds=seatBounds,seatVertices=seatVertices,footVertices=footVertices,frames=count,samples=reports,
        originalBindUnchanged=True,originalHierarchyUnchanged=True,
        maxFootError=max(r['footError'] for r in reports),maxLengthError=max(r['maxLengthError'] for r in reports),
        maxUpperBodyRelativeError=max(r['upperBodyRelativeError'] for r in reports),
        maxRootCorrection=max(Vector(r['rootCorrectionMeters']).length for r in reports),
        maxKneeCorrection=max(max(r['kneeCorrection'].values()) for r in reports),
        visualAcceptance=False,runtimeEnabled=False)
    (out/f'Data_{name}ContactValidation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    registered={k:copy.deepcopy(v) for k,v in entry.items() if k not in ['variants','latestByFaction']}
    review=copy.deepcopy(variant['review'])
    review.update(retargetReport=f'Models/{group}/Data_{name}ContactValidation.json',
        sourceAssessment='V2：原始恢复保持不变；按实际蒙皮修正座面、固定鞋底与腿部支撑。原骨长和上身相对运动保留，手部与道具尚待修正。',
        retargetNotes='Authored root and leg IK; not full-body raw fidelity. See per-frame correction distances.')
    registered['variants']=[dict(id='Nra-v2-'+name,faction='Nra',revisionOrder=2,label='V2 · 座凳与鞋底接触',
        status='待审阅 · 支撑修正',path=report['path'],blend=report['blend'],clip=actionName,review=review,travelMeters=None)]
    manifest=out/'Data_Versions.json';entries=Read(manifest)['actions'] if manifest.exists() else []
    entries=[a for a in entries if a['id']!=name]+[registered]
    manifest.write_text(json.dumps(dict(actions=entries),ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['frames','maxFootError','maxLengthError','maxUpperBodyRelativeError','maxRootCorrection','maxKneeCorrection']},ensure_ascii=True))


if __name__=='__main__':Main()
