"""Author the opening's 10 motions on the two approved production rigs in Blender.

Run inside BlenderMCP's execute_blender_code_for_cli / run_blender_cli. Meshes,
skins and original local bone frames stay unchanged in the runtime asset. The
editable Blender actions and scene are saved outside the Pages repository.
"""
import bpy, json, math, struct, hashlib, os
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion

project = Path(os.environ.get('CARRIAGE_PROJECT', str(Path.cwd() / 'Taierzhuang1938')))
private = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/CarriageOpeningDialogue')
output = project / 'Animation/FirstLevelCarriage'
output.mkdir(parents=True, exist_ok=True)
private.mkdir(parents=True, exist_ok=True)
fps = 24
definitions = {
    'WallStandIdle': (4, True), 'WallCrouchIdle': (4, True),
    'LiuCountTalk': (4.5, True), 'HeReplyTalk': (4, True),
    'LuoBriefing': (5, True), 'AlarmDropCrouch': (0.8, False),
    'LuoCrouchReassure': (4.5, True), 'YaowaAlarmCrouch': (3, True),
    'LuoStaggerRecover': (4.8, False), 'LuoHelpUp': (4.4, False),
}
modelClips = {
    'LugouNra02': ['WallStandIdle','WallCrouchIdle','AlarmDropCrouch','LiuCountTalk','HeReplyTalk','YaowaAlarmCrouch'],
    'LugouNra05': ['WallStandIdle','WallCrouchIdle','AlarmDropCrouch','LuoBriefing','LuoCrouchReassure','LuoStaggerRecover','LuoHelpUp'],
}
convert = Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
convertInv = convert.inverted()
Clamp = lambda x,a=0,b=1:max(a,min(b,x))
Smooth = lambda x:Clamp(x)*Clamp(x)*(3-2*Clamp(x))
Mix = lambda a,b,x:a+(b-a)*x

def ReadGlb(path):
    data=path.read_bytes();length=struct.unpack_from('<I',data,12)[0]
    return json.loads(data[20:20+length])

def NodeMatrix(node):
    if 'matrix' in node:return Matrix([node['matrix'][i::4] for i in range(4)])
    p=node.get('translation',[0,0,0]);q=node.get('rotation',[0,0,0,1]);s=node.get('scale',[1,1,1])
    return Matrix.LocRotScale(Vector(p),Quaternion((q[3],q[0],q[1],q[2])),Vector(s))

def Bake(modelId):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene;scene.render.fps=fps
    source=project/'Model/Character'/('Model_'+modelId+'.glb')
    document=ReadGlb(source);nodes=document['nodes'];parents={c:i for i,n in enumerate(nodes) for c in n.get('children',[])}
    nodeIndex={n.get('name'):i for i,n in enumerate(nodes)}
    sourceWorld={}
    def WorldOf(i):
        if i not in sourceWorld:sourceWorld[i]=(WorldOf(parents[i]) if i in parents else Matrix.Identity(4))@NodeMatrix(nodes[i])
        return sourceWorld[i]
    for i in range(len(nodes)):WorldOf(i)
    bpy.ops.import_scene.gltf(filepath=str(source))
    arm=next(o for o in scene.objects if o.type=='ARMATURE')
    arm.animation_data_clear()
    for pb in arm.pose.bones:pb.matrix_basis.identity();pb.rotation_mode='QUATERNION'
    bpy.context.view_layer.update()
    meshes=[o for o in scene.objects if o.type=='MESH' and o.vertex_groups and any(m.type=='ARMATURE' for m in o.modifiers)]
    for o in scene.objects:
        if o.type=='MESH' and o not in meshes:o.hide_render=True;o.hide_viewport=True
    for o in meshes:
        for material in o.data.materials:
            if material and material.use_nodes:
                for node in material.node_tree.nodes:
                    if node.type=='BSDF_PRINCIPLED':node.inputs['Metallic'].default_value=0;node.inputs['Roughness'].default_value=.75
    names=[p.name for p in arm.pose.bones if p.name in nodeIndex]
    prefix=next(n for n in names if n.endswith(' Pelvis')).split(' ')[0]
    Bone=lambda role:arm.pose.bones[prefix+' '+role]
    armInv=arm.matrix_world.inverted()
    corrections={name:(arm.matrix_world@arm.data.bones[name].matrix_local).inverted()@convert@sourceWorld[nodeIndex[name]] for name in names}
    rest={p.name:p.matrix_basis.copy() for p in arm.pose.bones}
    BWorld=lambda pb:arm.matrix_world@pb.matrix
    Point=lambda pb:BWorld(pb).translation.copy()
    Update=lambda:bpy.context.view_layer.update()
    def Put(pb,matrix):pb.matrix=armInv@matrix;Update()
    def Move(pb,point):
        matrix=BWorld(pb);matrix.translation=Vector(point);Put(pb,matrix)
    def Tilt(pb,x=0,y=0,z=0):
        matrix=BWorld(pb);point=matrix.translation.copy()
        rotation=Quaternion((0,0,1),z)@Quaternion((0,1,0),y)@Quaternion((1,0,0),x)
        Put(pb,Matrix.Translation(point)@rotation.to_matrix().to_4x4()@Matrix.Translation(-point)@matrix)
    def Aim(pb,child,target):
        at=Point(pb);direction=Point(child)-at
        delta=direction.rotation_difference(Vector(target)-at)
        Put(pb,Matrix.Translation(at)@delta.to_matrix().to_4x4()@Matrix.Translation(-at)@BWorld(pb))
    def TurnPalm(side,forward,normal):
        hand=Bone(side+' Hand');forward=Vector(forward).normalized();normal=Vector(normal).normalized()
        Aim(hand,Bone(side+' Finger2'),Point(hand)+forward)
        across=Point(Bone(side+' Finger1'))-Point(Bone(side+' Finger4'))
        current=forward.cross(across).normalized()*(1 if side=='L' else -1)
        normal=(normal-forward*normal.dot(forward)).normalized()
        angle=math.atan2(forward.dot(current.cross(normal)),current.dot(normal))
        at=Point(hand);delta=Quaternion(forward,angle)
        Put(hand,Matrix.Translation(at)@delta.to_matrix().to_4x4()@Matrix.Translation(-at)@BWorld(hand))
        return normal
    def CurlFingers(side,normal,amount,indexAmount=None):
        for finger in range(1,5):
            value=indexAmount if finger==1 and indexAmount is not None else amount
            for suffix,childSuffix,factor in [('', '1',.75),('1','2',1)]:
                joint=Bone(side+' Finger'+str(finger)+suffix);child=Bone(side+' Finger'+str(finger)+childSuffix)
                at=Point(joint);forward=(Point(child)-at).normalized()
                bend=(Vector(normal)-forward*Vector(normal).dot(forward)).normalized()
                Aim(joint,child,at+forward*math.cos(value*factor)+bend*math.sin(value*factor))
    def Chain(a,b,c,target,pole):
        start=Point(a);mid=Point(b);end=Point(c);target=Vector(target);pole=Vector(pole)
        l1=(mid-start).length;l2=(end-mid).length;direction=target-start
        distance=Clamp(direction.length,abs(l1-l2)+.0001,l1+l2-.0001);direction.normalize()
        bend=pole-start;bend-=direction*bend.dot(direction);bend.normalize()
        along=(l1*l1-l2*l2+distance*distance)/(2*distance)
        knee=start+direction*along+bend*math.sqrt(max(0,l1*l1-along*along))
        Aim(a,b,knee);Aim(b,c,target)
    footQuats={side:BWorld(Bone(side+' Foot')).to_quaternion() for side in ['L','R']}
    footHeight={side:Point(Bone(side+' Foot')).z for side in ['L','R']}
    restPelvis=Point(Bone('Pelvis')).z
    # Source +Z maps to Blender -Y, then CharacterModel's pi-yaw gives actor -Z.
    sourceFacing={side:((Point(Bone(side+' Toe0'))-Point(Bone(side+' Foot'))).normalized())[:] for side in ['L','R']}
    assert sum(v[1] for v in sourceFacing.values()) < -1,sourceFacing
    framesByClip={};metrics=[];samplesForProof=[]
    def Author(clip,time):
        for pb in arm.pose.bones:pb.matrix_basis=rest[pb.name]
        Update()
        duration=definitions[clip][0];phase=2*math.pi*time/duration;breath=math.sin(phase)
        crouch=1 if clip in ['WallCrouchIdle','LuoCrouchReassure','YaowaAlarmCrouch'] else 0
        if clip=='AlarmDropCrouch':crouch=Smooth(time/.66)
        px=0;py=.065;pz=Mix(restPelvis,.52,crouch);torso=-.055
        feetY=Mix(-.045,-.23,crouch);hands={};torsoSide=0;turn=0
        if clip=='LuoStaggerRecover':
            # Braces on the floor, first stand attempt fails, shoulder catches
            # against the wall, then a second effort reaches stable standing.
            keys=[(0,.29,.10,.48),(0.6,.31,.12,.35),(1.45,.70,.035,.16),(1.85,.48,.16,.27),(2.55,.50,.15,.16),(3.45,.86,.085,.08),(4.35,restPelvis,.065,-.035),(4.8,restPelvis,.065,-.04)]
            first,last=keys[0],keys[-1]
            for a,b in zip(keys,keys[1:]):
                if a[0]<=time<=b[0]:first,last=a,b;break
            w=Smooth((time-first[0])/max(.001,last[0]-first[0]))
            pz=Mix(first[1],last[1],w);py=Mix(first[2],last[2],w);torso=Mix(first[3],last[3],w)
            crouch=Clamp((restPelvis-pz)/(restPelvis-.52));feetY=Mix(-.045,-.23,crouch)
            px=.095*math.sin(time*2.7)*Smooth((4.4-time)/1.2);torsoSide=.1*math.sin(time*3.1)*Smooth((4.4-time)/1.2)
        if clip=='LuoHelpUp':
            bend=Smooth(time/1.3)*(1-Smooth((time-2.1)/1.5));torso=.30*bend
            torso=.55*bend;pz-=.41*bend;py-=.10*bend;feetY=-.075
        pz+=.004*breath if definitions[clip][1] else 0
        Move(Bone('Pelvis'),(px,py,pz));Tilt(Bone('Pelvis'),x=torso*.3,y=torsoSide)
        Tilt(Bone('Spine'),x=torso*.35);Tilt(Bone('Spine1'),x=torso*.35)
        Tilt(Bone('Spine2'),z=.015*breath)
        head=Bone('Head')
        Tilt(head,x=(.10 if clip=='LiuCountTalk' else .03)+.014*math.sin(phase*2),z=turn)
        for side,sign in [('L',1),('R',-1)]:
            foot=Bone(side+' Foot')
            target=(sign*.125,feetY+(0.025 if side=='R' else 0),footHeight[side]+.003)
            Chain(Bone(side+' Thigh'),Bone(side+' Calf'),foot,target,(sign*.19,-.85,.5))
            matrix=BWorld(foot);location=matrix.translation.copy();_,_,scale=matrix.decompose()
            Put(foot,Matrix.LocRotScale(location,footQuats[side],scale))
        chest=Point(Bone('Spine2'));h=Point(head).z
        # Neutral hands rest against thighs rather than holding invisible guns.
        hands={'L':(.22,-.13,chest.z-.43),'R':(-.21,-.14,chest.z-.45)}
        if crouch>.01:
            hands={'L':(.20,-.35,chest.z-.30),'R':(-.20,-.34,chest.z-.29)}
        gesture=(1-math.cos(phase))/2
        if clip=='LiuCountTalk':
            hands={'L':(.07,-.36,chest.z-.27),'R':(-.045+.025*math.sin(phase*4),-.365,chest.z-.25+.012*math.cos(phase*4))}
            Tilt(head,x=.11,z=-.05)
        if clip=='HeReplyTalk':
            hands['R']=(-.26-.07*gesture,-.30-.10*gesture,chest.z-.26+.13*gesture)
            Tilt(head,z=.10+.055*math.sin(phase))
        if clip=='LuoBriefing':
            hands['R']=(-.22-.10*gesture,-.28-.22*gesture,chest.z-.15+.17*gesture)
            hands['L']=(.20,-.16,chest.z-.37)
            Tilt(head,z=.12*math.sin(phase))
        if clip=='AlarmDropCrouch':
            for side,sign in [('L',1),('R',-1)]:hands[side]=(sign*.19,Mix(-.14,-.06,crouch),Mix(chest.z-.42,h+.035,crouch))
            Tilt(head,x=.18*crouch)
        if clip=='LuoCrouchReassure':
            hands['L']=(.19,-.16,chest.z-.39)
            hands['R']=(-.26,-.43,chest.z-.20+.08*math.sin(phase))
            Tilt(head,z=.10*math.sin(phase))
        if clip=='YaowaAlarmCrouch':
            hands['L']=(.17,-.08,h-.045);hands['R']=(-.20,-.31,chest.z-.23)
            Tilt(head,z=-.18+.05*math.sin(phase*2))
        if clip=='LuoStaggerRecover':
            wall=Smooth(time/.65)*(1-Smooth((time-3.5)/.6))
            hands['L']=(.25,Mix(-.23,.18,wall),max(.14,chest.z-.25))
            hands['R']=(-.26,-.28,max(.13,chest.z-.34))
            Tilt(head,x=.10*(1-Smooth((time-3.7)/.65)))
        if clip=='LuoHelpUp':
            reach=Smooth(time/1.25);pull=Smooth((time-2.1)/1.45);release=Smooth((time-3.7)/.7)
            hands['R']=(Mix(-.12,-.20,pull),Mix(-.23,Mix(-.62,-.29,pull),reach),Mix(chest.z-.37,Mix(.49,chest.z-.10,pull),reach))
            hands['L']=(.18,Mix(-.22,-.43,pull),Mix(chest.z-.37,chest.z-.17,pull))
            for side in hands:
                x,y,z=hands[side];hands[side]=(x,Mix(y,-.18,release),Mix(z,chest.z-.36,release))
            Tilt(head,x=.12*(1-pull))
        for side,sign in [('L',1),('R',-1)]:
            Chain(Bone(side+' UpperArm'),Bone(side+' Forearm'),Bone(side+' Hand'),hands[side],(sign*.65,-.13,chest.z-.35))
        if clip=='LiuCountTalk':
            normal=TurnPalm('L',(-.2,-1,0),(0,0,1));CurlFingers('L',normal,.16)
            normal=TurnPalm('R',(1,-.15,-.20),(0,0,-1));CurlFingers('R',normal,.65,indexAmount=.08)
        elif clip=='HeReplyTalk':
            normal=TurnPalm('R',(-.1,-1,.1),(0,0,1));CurlFingers('R',normal,.13)
        elif clip in ['LuoBriefing','LuoCrouchReassure']:
            normal=TurnPalm('R',(0,-1,0),(0,0,-1));CurlFingers('R',normal,.13 if clip=='LuoCrouchReassure' else .5,indexAmount=.035)
        elif clip=='LuoHelpUp':
            normal=TurnPalm('R',(0,-1,-.1),(0,0,1));CurlFingers('R',normal,.12+.8*Smooth((time-1.25)/.7)*(1-Smooth((time-3.6)/.8)))
            normal=TurnPalm('L',(0,-1,-.05),(0,0,-1));CurlFingers('L',normal,.2)
        Update()
    def SourcePose():
        current={name:convertInv@BWorld(arm.pose.bones[name])@corrections[name] for name in names}
        result=[]
        for name in names:
            index=nodeIndex[name];parent=parents.get(index);parentName=nodes[parent].get('name') if parent is not None else None
            pm=current.get(parentName,sourceWorld[parent]) if parent is not None else Matrix.Identity(4)
            p,q,s=(pm.inverted()@current[name]).decompose()
            result.extend([*p,q.x,q.y,q.z,q.w])
        return [round(v,7) for v in result]
    for clip in modelClips[modelId]:
        duration,loop=definitions[clip];count=math.ceil(duration*fps)+1;step=duration/(count-1)
        action=bpy.data.actions.new(clip);arm.animation_data_create();arm.animation_data.action=action
        values=[];metric=[]
        for frame in range(count):
            arm.animation_data.action=None
            time=frame*step;Author(clip,time);values.extend(SourcePose())
            arm.animation_data.action=action
            for name in names:
                pb=arm.pose.bones[name]
                pb.keyframe_insert('location',frame=frame);pb.keyframe_insert('rotation_quaternion',frame=frame);pb.keyframe_insert('scale',frame=frame)
            if frame in [0,count//3,2*count//3,count-1]:
                scene.frame_set(frame);Update()
                meshBounds=[]
                for mesh in meshes:
                    evaluated=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());geometry=evaluated.to_mesh()
                    coords=[evaluated.matrix_world@v.co for v in geometry.vertices]
                    meshBounds.append({'min':[min(v[i] for v in coords) for i in range(3)],'max':[max(v[i] for v in coords) for i in range(3)]});evaluated.to_mesh_clear()
                metric.append({'time':round(time,4),'headM':round(Point(Bone('Head')).z,4),'pelvisM':round(Point(Bone('Pelvis')).z,4),'meshBounds':meshBounds})
        framesByClip[clip]={'duration':duration,'loop':loop,'frameCount':count,'values':values}
        action.use_fake_user=True
        arm.animation_data.action=None
        track=arm.animation_data.nla_tracks.new();track.name=clip;track.mute=True
        track.strips.new(clip,0,action)
        metrics.append({'clip':clip,'samples':metric})
        print('Carriage authored '+modelId+' '+clip,flush=True)
    arm.animation_data.action=bpy.data.actions['WallStandIdle'];scene.frame_start=0;scene.frame_end=96;scene.frame_set(0)
    for track in arm.animation_data.nla_tracks:track.mute=True
    # Private original-mesh proof scene: a timber wall at actor-back +Z and floor.
    def Material(name,color):
        mat=bpy.data.materials.new(name);mat.diffuse_color=(*color,1);return mat
    def Box(name,location,scale,mat):
        bpy.ops.mesh.primitive_cube_add(size=1,location=location);o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(mat);return o
    timber=Material('Material_CarriageProofTimber',(.16,.11,.075));floor=Material('Material_CarriageProofFloor',(.12,.14,.15))
    Box('Prop_ProofFloor',(0,0,-.04),(3,3,.08),floor)
    Box('Prop_ProofWall',(0,.32,.7),(3,.10,1.4),timber)
    bpy.ops.object.camera_add(location=(-2.7,-3.7,2.5));camera=bpy.context.object;camera.name='Camera_CarriagePoseReview'
    camera.rotation_euler=(Vector((0,0,.85))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=2.5;scene.camera=camera
    for name,point,power,size in [('Light_Key',(-2,-3,4),550,4),('Light_Fill',(3,-1,3),400,3)]:
        bpy.ops.object.light_add(type='AREA',location=point);lamp=bpy.context.object;lamp.name=name;lamp.data.energy=power;lamp.data.shape='DISK';lamp.data.size=size;lamp.rotation_euler=(Vector((0,0,.9))-lamp.location).to_track_quat('-Z','Y').to_euler()
    scene.render.engine='CYCLES';scene.cycles.samples=12;scene.render.resolution_x=640;scene.render.resolution_y=720;scene.render.resolution_percentage=100
    if not scene.world:scene.world=bpy.data.worlds.new('World_CarriageProof')
    scene.world.color=(.22,.22,.22)
    scene['authoringTool']='BlenderMCP blmcp.tools_helpers.blender_cli.run_blender_cli'
    scene['runtimeCoordinatePolicy']='Original GLB bone frames, source +Z facing, runtime CharacterModel yaw PI -> actor -Z; no Actor world-root tracks'
    scene['originalSourceSha256']=hashlib.sha256(source.read_bytes()).hexdigest()
    scene['reviewActions']='Select an action on the original armature; NLA copies are muted for reference'
    bpy.ops.file.pack_all();blend=private/('Scene_'+modelId+'CarriageOpening.blend');bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
    asset={'schema':1,'modelId':modelId,'authoringTool':scene['authoringTool'],'originalModelSha256':scene['originalSourceSha256'],'fps':fps,'stride':7,'bones':names,'clips':framesByClip}
    file=output/('Animation_'+modelId+'CarriageOpening.json');temporary=file.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(asset,separators=(',',':')),encoding='utf-8');temporary.replace(file)
    validation={'modelId':modelId,'sourceFacingBlender':sourceFacing,'runtimeForward':[0,0,-1],'clipCount':len(framesByClip),'samples':metrics,'blend':str(blend),'file':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
    (private/('Data_'+modelId+'CarriageOpeningValidation.json')).write_text(json.dumps(validation,indent=2),encoding='utf-8')
    return validation

selected=os.environ.get('CARRIAGE_MODEL')
results=[Bake(modelId) for modelId in modelClips if not selected or selected==modelId]
manifest={'schema':1,'version':'20260912OpeningV1','authoringTool':'BlenderMCP','actorForward':[0,0,-1],
    'floorClearanceM':.003,'scope':'First level stage one carriage opening only',
    'clips':{name:{'duration':duration,'loop':loop} for name,(duration,loop) in definitions.items()},'models':[]}
for modelId in modelClips:
    file=output/('Animation_'+modelId+'CarriageOpening.json')
    if file.exists():
        manifest['models'].append({'id':modelId,'file':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),
            'clipIds':modelClips[modelId],'originalModelSha256':hashlib.sha256((project/'Model/Character'/('Model_'+modelId+'.glb')).read_bytes()).hexdigest()})
manifestFile=output/'Data_FirstLevelCarriageAnimation.json';temporary=manifestFile.with_suffix('.json.tmp')
temporary.write_text(json.dumps(manifest,indent=2),encoding='utf-8');temporary.replace(manifestFile)
result={'models':results,'runtimeDirectory':str(output)}
