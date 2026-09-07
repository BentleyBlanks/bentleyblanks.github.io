"""Package editable production-model support profiles in the private library.

The source GLB's meshes, skin, inverse binds and node hierarchy are retained.
Animation data, an external game-scale parent and the physical bench are appended.
Materials use the game's PBR bridge. Blender imports that same complete package
and keeps all five height profiles as separate NLA tracks for further editing.
"""
from pathlib import Path
import argparse, copy, hashlib, json, re, struct, sys
import bpy


def ReadGlb(file):
    data=file.read_bytes();cursor=12;document=None;binary=None
    assert data[:4]==b'glTF'
    while cursor<len(data):
        length,kind=struct.unpack_from('<II',data,cursor);payload=data[cursor+8:cursor+8+length];cursor+=8+length
        if kind==0x4e4f534a:document=json.loads(payload)
        elif kind==0x004e4942:binary=payload
    assert document and binary is not None
    return document,binary


def WriteGlb(file,document,binary):
    encoded=json.dumps(document,separators=(',',':')).encode('utf-8');encoded+=b' '*((-len(encoded))%4)
    binary+=b'\0'*((-len(binary))%4)
    file.write_bytes(struct.pack('<III',0x46546c67,2,28+len(encoded)+len(binary))
        +struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary)


def AddGamePreview(document,binary,model):
    def Access(values,width,component=5126,position=False):
        nonlocal binary
        data=struct.pack('<'+('f' if component==5126 else 'H')*len(values),*values)
        document['bufferViews'].append(dict(buffer=0,byteOffset=len(binary),byteLength=len(data)));binary+=data
        accessor=dict(bufferView=len(document['bufferViews'])-1,componentType=component,count=len(values)//width,
            type='SCALAR' if width==1 else 'VEC'+str(width))
        if position:accessor.update(min=[-.5]*3,max=[.5]*3)
        document['accessors'].append(accessor);return len(document['accessors'])-1
    positions=[];normals=[];indices=[]
    faces=[([1,0,0],[(.5,-.5,-.5),(.5,.5,-.5),(.5,.5,.5),(.5,-.5,.5)]),
        ([-1,0,0],[(-.5,-.5,.5),(-.5,.5,.5),(-.5,.5,-.5),(-.5,-.5,-.5)]),
        ([0,1,0],[(-.5,.5,-.5),(-.5,.5,.5),(.5,.5,.5),(.5,.5,-.5)]),
        ([0,-1,0],[(-.5,-.5,.5),(-.5,-.5,-.5),(.5,-.5,-.5),(.5,-.5,.5)]),
        ([0,0,1],[(-.5,-.5,.5),(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5)]),
        ([0,0,-1],[(.5,-.5,-.5),(-.5,-.5,-.5),(-.5,.5,-.5),(.5,.5,-.5)])]
    for normal,vertices in faces:
        start=len(positions)//3
        for point in vertices:positions.extend(point);normals.extend(normal)
        indices.extend(start+i for i in [0,1,2,0,2,3])
    for material in document.get('materials',[]):
        pbr=material.setdefault('pbrMetallicRoughness',{});pbr['metallicFactor']=0
        pbr['roughnessFactor']=max(.58,pbr.get('roughnessFactor',1))
    material=len(document['materials']);document['materials'].append(dict(name='Material_TrainBenchWood',
        pbrMetallicRoughness=dict(baseColorFactor=[.26,.13,.055,1],metallicFactor=0,roughnessFactor=.85)))
    mesh=len(document['meshes']);document['meshes'].append(dict(name='Mesh_TrainBenchBox',primitives=[dict(
        attributes=dict(POSITION=Access(positions,3,position=True),NORMAL=Access(normals,3)),indices=Access(indices,1,5123),material=material)]))
    scene=document['scenes'][document.get('scene',0)];anchor=len(document['nodes'])
    document['nodes'].append(dict(name='Transform_ActualGameScale',children=scene['nodes'],scale=[model['nominalScale']]*3))
    scene['nodes']=[anchor]
    def Box(name,point,size):
        scene['nodes'].append(len(document['nodes']));document['nodes'].append(dict(name=name,mesh=mesh,translation=list(point),scale=list(size)))
    offset=model['seatForwardOffsetM'];Box('Prop_TrainBenchSeat',(0,.41,-offset),(1.2,.14,.68))
    for side,x in enumerate([-.5,.5]):
        for end,z in enumerate([-.27,.27]):Box(f'Prop_TrainBenchLeg{side}{end}',(x,.17,z-offset),(.07,.34,.07))
    document['buffers']=[{'byteLength':len(binary)}]
    return binary


def Main():
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--verify',action='store_true')
    parser.add_argument('--group',default='FirstLevelTrainSupportV1')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);root=args.root.resolve()
    project=Path(__file__).resolve().parents[1];group=args.group
    assert re.fullmatch(r'FirstLevelTrainSupportV[1-9]\d*',group)
    out=root/'Models'/group;blends=root/'Blender'/group;blends.mkdir(parents=True,exist_ok=True)
    if args.verify:
        VerifyProjects(root,out)
        return
    assert not (out/'Data_VisualAssessment.json').exists(),'Reviewed version is immutable; create another version.'
    bake=json.loads((out/'Data_SupportBakeValidation.json').read_text(encoding='utf-8'));records=[]
    Hash=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    for model in bake['results']:
        name=model['id'];original=project/'Model/Character'/('Model_'+name+'.glb')
        animation=out/('Animation_'+name+'FirstLevelTrainSupport.glb')
        document,binary=ReadGlb(original);curves,curveBytes=ReadGlb(animation)
        assert [n.get('name') for n in document['nodes']]==[n.get('name') for n in curves['nodes']]
        assert [n.get('children') for n in document['nodes']]==[n.get('children') for n in curves['nodes']]
        originalBind=copy.deepcopy(document['skins']);originalNodes=copy.deepcopy(document['nodes'])
        viewOffset=len(document['bufferViews']);accessorOffset=len(document['accessors'])
        for view in curves['bufferViews']:
            view=copy.deepcopy(view);view['byteOffset']=view.get('byteOffset',0)+len(binary);document['bufferViews'].append(view)
        for accessor in curves['accessors']:
            accessor=copy.deepcopy(accessor);accessor['bufferView']+=viewOffset;document['accessors'].append(accessor)
        document['animations']=copy.deepcopy(curves['animations'])
        for action in document['animations']:
            for sampler in action['samplers']:
                sampler['input']+=accessorOffset;sampler['output']+=accessorOffset
        binary+=curveBytes;document['buffers']=[{'byteLength':len(binary)}]
        assert document['skins']==originalBind and document['nodes']==originalNodes
        binary=AddGamePreview(document,binary,model)
        assert document['skins']==originalBind and document['nodes'][:len(originalNodes)]==originalNodes
        package=out/('Model_'+name+'TrainSupport.glb');WriteGlb(package,document,binary)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        # The glTF importer converts seconds using the current scene frame rate.
        scene=bpy.context.scene;scene.render.fps=60;scene.frame_start=0;scene.frame_end=478
        bpy.ops.import_scene.gltf(filepath=str(package))
        anchor=scene.objects['Transform_ActualGameScale']
        armatures=[o for o in scene.objects if o.type=='ARMATURE'];assert len(armatures)==1
        arm=armatures[0];assert arm.animation_data
        tracks=list(arm.animation_data.nla_tracks);assert len(tracks)==5,len(tracks)
        for track in tracks:
            assert len(track.strips)==1
            strip=track.strips[0]
            assert abs(strip.frame_start)<.001 and abs(strip.frame_end-478)<.001,(track.name,strip.frame_start,strip.frame_end)
        arm.animation_data.action=None
        for track in tracks:track.mute='Bench100' not in track.name
        assert sum(not t.mute for t in tracks)==1,[t.name for t in tracks]
        for obj in scene.objects:
            if obj.type=='MESH' and obj.vertex_groups:
                for mat in obj.data.materials:
                    if mat and mat.use_nodes:
                        for node in mat.node_tree.nodes:
                            if node.type=='BSDF_PRINCIPLED':
                                node.inputs['Metallic'].default_value=0
                                node.inputs['Roughness'].default_value=max(.58,node.inputs['Roughness'].default_value)
        scene['sourceAnimation']=str(animation);scene['sourceAnimationSha256']=Hash(animation)
        scene['sourceModelSha256']=Hash(original)
        scene['contactPolicy']='Authored production-scale root/leg/palm support. Original recovery and V3 unchanged.'
        scene['profileInstructions']='Select one Bench96/98/100/102/104 NLA track; set Transform_ActualGameScale to nominalScale times that percentage.'
        scene['nominalScale']=model['nominalScale'];scene['seatForwardOffsetM']=model['seatForwardOffsetM'];scene['runtimeEnabled']=False
        scene.frame_set(0);bpy.context.view_layer.update();bpy.ops.file.pack_all()
        blend=blends/('Scene_'+name+'TrainSupport.blend');bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
        records.append(dict(id=name,model=package.relative_to(root).as_posix(),modelSha256=Hash(package),
            animation=animation.relative_to(root).as_posix(),animationSha256=Hash(animation),
            blend=blend.relative_to(root).as_posix(),blendSha256=Hash(blend),originalModelSha256=Hash(original),
            bones=len(arm.data.bones),tracks=[t.name for t in tracks],originalBindAndHierarchyPreserved=True))
        print(json.dumps(records[-1]),flush=True)
    (out/'Data_EditableProjects.json').write_text(json.dumps(dict(group=group,results=records),indent=2),encoding='utf-8')


def VerifyProjects(root,out):
    records=json.loads((out/'Data_EditableProjects.json').read_text())['results'];results=[]
    for record in records:
        file=root/record['blend'];assert hashlib.sha256(file.read_bytes()).hexdigest()==record['blendSha256']
        bpy.ops.wm.open_mainfile(filepath=str(file));scene=bpy.context.scene
        assert scene.render.fps==60 and scene.frame_start==0 and scene.frame_end==478
        assert scene['sourceAnimationSha256']==record['animationSha256']
        arm=next(o for o in scene.objects if o.type=='ARMATURE');assert len(arm.data.bones)==record['bones']
        tracks=list(arm.animation_data.nla_tracks);assert [t.name for t in tracks]==record['tracks']
        anchor=scene.objects['Transform_ActualGameScale'];prepared=[];offset=scene.get('seatForwardOffsetM',.24)
        for obj in scene.objects:
            if obj.type!='MESH' or not obj.vertex_groups:continue
            feet={s:[] for s in ['L','R']}
            for vertex in obj.data.vertices:
                for side in feet:
                    weight=sum(g.weight for g in vertex.groups if obj.vertex_groups[g.group].name.replace('_',' ').endswith((' '+side+' Foot',' '+side+' Toe0')))
                    if weight>.65:feet[side].append(vertex.index)
            prepared.append((obj,feet))
        samples=[]
        for selected in tracks:
            size=int(selected.name.split('Bench')[1])/100;anchor.scale=(scene['nominalScale']*size,)*3
            for track in tracks:track.mute=track!=selected
            for frame in [0,120,270,312,330,478]:
                scene.frame_set(frame);bpy.context.view_layer.update();soles={s:float('inf') for s in ['L','R']};collisions=0;seatGap=float('inf')
                for obj,feet in prepared:
                    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
                    points=[evaluated.matrix_world@v.co for v in mesh.vertices]
                    for side in feet:soles[side]=min(soles[side],min(points[i].z for i in feet[side]))
                    collisions+=sum(abs(p.x)<.6 and offset-.34<p.y<offset+.34 and .34<p.z<.48 for p in points)
                    if frame<=270:seatGap=min(seatGap,min((p.z-.48 for p in points if abs(p.x)<.6 and offset-.34<p.y<offset+.34),default=float('inf')))
                    evaluated.to_mesh_clear()
                assert collisions==0,(record['id'],size,frame,collisions)
                # The editable Blender representation has float armature
                # conversion error; measure it separately from physical contact.
                # Contact uses the same 1.5--3 mm bounds as the independent GLB check.
                deviation=max(abs(value-.002) for value in soles.values())
                assert all(.0015<value<.003 for value in soles.values()),(record['id'],size,frame,soles)
                if frame<=270:assert .0003<seatGap<.006,(record['id'],size,frame,seatGap)
                samples.append(dict(sizeScale=size,frame=frame,soles=soles,soleDeviationM=deviation,benchPenetratingVertices=collisions,seatGap=seatGap if frame<=270 else None))
        results.append(dict(id=record['id'],blend=record['blend'],blendSha256=record['blendSha256'],maxSoleConversionDeviationM=max(s['soleDeviationM'] for s in samples),samples=samples))
        print('Verified editable project',record['id'],len(samples),'samples',flush=True)
    (out/'Data_EditableProjectValidation.json').write_text(json.dumps(dict(status='reopened_keyframe_contacts_checked_interpolation_still_requires_review',results=results),indent=2))


if __name__=='__main__':Main()
