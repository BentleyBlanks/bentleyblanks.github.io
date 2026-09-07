"""Create private editable pairs from independently verified original-rig GLBs."""
from pathlib import Path
import argparse, copy, hashlib, json, re, sys
import bpy


def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--group',default='FirstLevelCarryV11')
    parser.add_argument('--verify',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    root=args.root.resolve();group=args.group;assert re.fullmatch(r'FirstLevelCarryV[1-9]\d*',group)
    revision=int(group.split('V')[-1]);out=root/'Models'/group;blends=root/'Blender'/group
    if args.verify:
        from mathutils import Vector
        projects=json.loads((out/'Data_EditableProjects.json').read_text(encoding='utf-8'))
        validation=json.loads((out/'Data_IndependentValidation.json').read_text(encoding='utf-8'))
        expected=json.loads((root/'Models'/validation['fitReport']).read_text(encoding='utf-8'))
        results=[]
        for record in projects['results']:
            bpy.ops.wm.open_mainfile(filepath=str(root/record['blend']));maximum=0.0
            for role in ['Front','Rear']:
                arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE' and o.name.startswith(role+'_'))
                profile=next(p for m in expected['results'] if m['id']==record['id'] for p in m['profiles'] if p['role']==role and p['size']==1)
                for frame in [0,15,30,60,90,120]:
                    bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
                    for part,point in [('Pelvis',profile['frames'][frame]['pelvis'])]+[(side+' Hand',profile['frames'][frame]['hands'][side]['wrist']) for side in ['L','R']]+[(side+' Foot',profile['frames'][frame]['feet'][side]['ankle']) for side in ['L','R']]:
                        bone=next(b for b in arm.pose.bones if b.name.replace('_',' ').endswith(' '+part))
                        actual=(arm.matrix_world@bone.matrix).translation;goal=Vector((-point[0],point[2],point[1]))
                        maximum=max(maximum,(actual-goal).length)
            assert maximum<.00005,(record['id'],maximum)
            results.append(dict(id=record['id'],maxPositionErrorM=maximum,blend=record['blend']))
        report=out/'Data_EditableProjectValidation.json';assert not report.exists()
        report.write_text(json.dumps(dict(status='reopened_projects_match_production_trial',results=results),indent=2),encoding='utf-8')
        print(json.dumps(dict(status='reopened_projects_match_production_trial',results=results)),flush=True)
        return
    assert not (out/'Data_EditableProjects.json').exists(),'Preserve existing projects; use another version'
    validation=json.loads((out/'Data_IndependentValidation.json').read_text(encoding='utf-8'))
    assert validation['status']=='export_matches_trial_requires_visual_acceptance'
    expected=json.loads((root/'Models'/validation['fitReport']).read_text(encoding='utf-8'))
    grip_height=expected.get('gripHeightM',.88);bed_height=grip_height-.12;speed=expected.get('referenceSpeedMps',.55)
    blends.mkdir(parents=True,exist_ok=True);records=[]
    Hash=lambda file:hashlib.sha256(file.read_bytes()).hexdigest()
    for model in expected['results']:
        name=model['id'];number=int(name[-2:]);bpy.ops.wm.read_factory_settings(use_empty=True)
        scene=bpy.context.scene;scene.name='Scene_'+name+'_CarryPair';scene.render.fps=60;scene.frame_start=0;scene.frame_end=120
        sources=[]
        for role in ['Front','Rear']:
            file=out/f'Model_{name}_Carry{role}.glb';before=set(scene.objects)
            bpy.ops.import_scene.gltf(filepath=str(file))
            imported=set(scene.objects)-before
            for obj in imported:
                obj.name=role+'_'+obj.name
                data=obj.animation_data
                if data and data.nla_tracks:
                    tracks=list(data.nla_tracks);assert len(tracks)==1,(obj.name,len(tracks))
                    strip=tracks[0].strips[0];data.action=strip.action
                    if hasattr(data,'action_slot') and hasattr(strip,'action_slot') and strip.action_slot:
                        data.action_slot=strip.action_slot
                    for track in tracks:track.mute=True
            sources.append(dict(role=role,path=file.relative_to(root).as_posix(),sha256=Hash(file)))
        material=bpy.data.materials.new('Material_ActualGameStretcher');material.use_nodes=True
        shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.32,.19,.075,1);shader.inputs['Metallic'].default_value=0;shader.inputs['Roughness'].default_value=.85
        # Blender Z up, original game GLB +Z maps to Blender -Y.
        boxes=[('Bed',(0,0,bed_height),(.58,1.85,.14))]
        for sign in [-1,1]:
            boxes.append((f'Rail{sign}',(sign*.29,0,grip_height),(.065,2.15,.065)))
            boxes.append((f'Cross{sign}',(0,sign*.68,grip_height-.045),(.65,.065,.06)))
        for suffix,position,size in boxes:
            bpy.ops.mesh.primitive_cube_add(size=1,location=position);obj=bpy.context.object;obj.name='Prop_FirstLevel'+suffix;obj.scale=size;obj.data.materials.append(material)
        scene['sourcePolicy']='V10-derived torso; pelvis placement and lower-limb support gait authored after recovery. Two-person source crop experiment. Not gameplay accepted.'
        scene['sourceRangeSeconds']=[137/30,197/30];scene['referenceSpeedMps']=speed;scene['trialBedHeightM']=bed_height;scene['trialGripHeightM']=grip_height
        scene['geometryStatus']=expected.get('geometryStatus','current_r12')
        scene.frame_set(30);bpy.context.view_layer.update()
        for img in bpy.data.images:
            if img.source=='FILE' and img.has_data and not img.packed_file:img.pack()
        blend=blends/f'Scene_{name}_CarryPair_V{revision}.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
        file=out/f'Model_{name}_CarryPair.glb';clip=f'FirstLevelCarryPair{number}'
        bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',export_animations=True,
            export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name=clip,
            export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True,export_yup=True)
        assert file.is_file() and file.stat().st_size>100000 and blend.is_file()
        records.append(dict(id=name,sources=sources,path=file.relative_to(root).as_posix(),sha256=Hash(file),clip=clip,
            blend=blend.relative_to(root).as_posix(),blendSha256=Hash(blend)))
    catalog=json.loads((root/'Preview/Data_Catalog.json').read_text(encoding='utf-8'));actions=[]
    for actionId,role in [('CarryStretcherFront','Front'),('CarryStretcherRear','Rear'),('StretcherPair','Pair')]:
        source=next(a for a in catalog['actions'] if a['id']==actionId)
        v10=next(v for v in source['variants'] if v['id']=='Nra-v10-'+actionId)
        variant=copy.deepcopy(v10);variant.update(id=f'Nra-v{revision}-'+actionId,revisionOrder=revision,
            label=f'V{revision} · 原骨架接触试制（握高 {grip_height:.2f} 米）',status='实验 · 待动作与近景审阅',
            path=f'Models/{group}/Model_LugouNra01_Carry{role}.glb',
            clip='FirstLevelCarryPair1' if role=='Pair' else 'FirstLevelCarry'+role+'Walk100',
            blend=records[0]['blend'],travelMeters=[0,0,speed*2])
        variant['review']['retargetReport']=f'Models/{group}/Data_IndependentValidation.json'
        variant['review']['retargetNotes']=f'原视频及 raw 保留。按原游戏人物归一化，骨盆位置、双脚支撑步态与手臂接触为后期重建；{speed:.2f} m/s 为制作参考速度，非单目实测地速。试制握高 {grip_height:.2f} 米，床面 {bed_height:.2f} 米；游戏尺寸尚未改动。未接入游戏。'
        actions.append(dict(id=actionId,label=source['label'],loop=True,cameraDistance=6.5,
            description=f'{len(records)} 套原人物／三档身高接触试制；当前预览为 NRA01 标准身高。仍需姿态与掌指近景验收。',variants=[variant]))
    (out/'Data_EditableProjects.json').write_text(json.dumps(dict(status='editable_candidate_not_game_accepted',results=records),ensure_ascii=False,indent=2),encoding='utf-8')
    (out/'Data_Versions.json').write_text(json.dumps(dict(actions=actions),ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(dict(group=group,projects=len(records),registeredActions=len(actions))),flush=True)


if __name__=='__main__':Main()
