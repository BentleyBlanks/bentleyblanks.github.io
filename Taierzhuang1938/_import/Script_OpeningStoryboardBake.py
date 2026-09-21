"""01–03 storyboard actions; execute through scripts/Script_BlenderMcp.mjs exec.

Uses the production-rig importer, two-bone IK, palm solver and original-local-frame
exporter of the existing captives baker. It never replaces meshes or inverse binds.
OPENING_PROJECT points at this task's Taierzhuang1938 directory. Source scenes stay
under OneDrive/AI/Models/Blender; review renders are local, 1280x720.
"""
import bpy, os, runpy, json, math, hashlib
from pathlib import Path
from mathutils import Vector

project = Path(os.environ['OPENING_PROJECT'])
private = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/OpeningStoryboards_20260922')
output = project / 'Animation/OpeningStoryboards'
reviews = project.parent / 'tmp/OpeningStoryboards/BlenderReview'
for folder in (private, output, reviews): folder.mkdir(parents=True, exist_ok=True)
os.environ['CAPTIVES_PROJECT'] = str(project)
os.environ['CAPTIVES_SKIP_BLEND'] = '1'
base = runpy.run_path(str(project / '_import/Script_MachineGunCaptivesBake.py'), run_name='OpeningRigLibrary')
FPS = 24
VERSION = '20260922OpeningStoryboardsV1'
# name: duration, loop, weapon-hold. Distinct actions match the authored keyframes.
CLIPS = {
 'SupplyReceive':(3,True,'free'), 'ClipLoad':(3,True,'free'),
 'MessengerReport':(3,True,'oneHandRight'), 'DuckBlast':(1.2,False,'free'),
 'WoundedReach':(3,True,'free'), 'CaptiveHeld':(3,True,'free'),
 'CollarControl':(2,True,'oneHandRight'), 'BayonetClearWood':(1.6,False,'twoHand'),
 'CollarDrag':(2.2,False,'oneHandRight'), 'ButtThreat':(1.4,False,'twoHand'),
 'InterrogateCrouch':(3,True,'free'), 'InterpreterPoint':(3,True,'free'),
 'CreepDadao':(1.8,True,'oneHandRight'), 'DadaoAmbush':(.85,False,'oneHandRight'),
 'RifleDeflect':(.8,False,'oneHandRight'), 'PullComrade':(2,False,'free'),
 'KickRifle':(1.2,False,'free'), 'PointBlockade':(3,True,'oneHandRight'),
 'ShotCollapse':(1.6,False,'free'), 'GuardTurn':(1.2,False,'twoHand'),
}
MODELS = ['LugouNra02','LugouNra05','LugouIja01','LugouIja02','LugouIja03']

def BakeRig(ctx):
    arm, scene, names = ctx['arm'], ctx['scene'], ctx['names']
    modelId = ctx['modelId']
    def Reset():
        for bone in arm.pose.bones: bone.matrix_basis = ctx['rest'][bone.name]
        ctx['Update']()
    def Pose(clip,t,lift):
        Reset()
        duration=CLIPS[clip][0]; u=min(1,t/duration); wave=math.sin(2*math.pi*u)
        if clip in ('ButtThreat','ShotCollapse','BayonetClearWood'):
            source={'ButtThreat':'IjaRifleButtStrike','ShotCollapse':'CaptiveStruckDown',
                    'KickRifle':'IjaKickPrisoner','BayonetClearWood':'IjaBayonetDownThrust'}[clip]
            ctx['Author'](source,t*base['DEFINITIONS'][source][0]/duration,lift)
            return
        kneel=clip in ('SupplyReceive','ClipLoad','DuckBlast','CaptiveHeld','InterrogateCrouch','InterpreterPoint','PullComrade')
        p=ctx['KneelBase']() if kneel else ctx['StandBase'](0,wave*.15)
        z=p['pelvis'][2]; chest=z+(ctx['restChest']-ctx['restPelvis'])*.92
        p.update(bend=.12+.015*wave,head=(.03,0,.035*wave),
          hands={'L':(.23,-.27,chest-.2),'R':(-.22,-.22,chest-.18)},
          armPoles={'L':(.8,.05,chest-.35),'R':(-.8,.05,chest-.35)},
          palms={'L':((0,-1,0),(0,0,1),.45),'R':((0,-1,0),(0,0,1),.75)})
        if clip=='SupplyReceive':
            p['hands']['L']=(.12,-.53,chest-.13+.04*wave)
            p['hands']['R']=(-.23,-.12,z-.05)
            p['palms']['L']=((0,-1,0),(0,0,1),.15)
        elif clip=='ClipLoad':
            p['hands']={'L':(.13,-.39,chest-.15),'R':(-.08,-.36,chest+.02+.10*wave)}
            p['palms']={'L':((1,0,0),(0,0,1),1.1),'R':((0,-1,0),(-1,0,0),1.25)}
            p['head']=(.25,0,0)
        elif clip=='DuckBlast':
            w=base['Smooth'](u*3); p['bend']=.14+.40*w
            p['hands']={'L':(.20,-.38,chest+.34*w),'R':(-.23,-.32,chest+.34*w)}
            p['head']=(.5*w,0,0)
        elif clip=='WoundedReach':
            p['pelvis']=(0,.30,.27); p['pelvisTilt']=(-.80,.20,0)
            p['ankles']={'L':(.22,-.46,.16),'R':(-.23,-.44,.17)}
            p['hands']={'L':(.16,-.65,.48+.015*wave),'R':(-.23,-.22,.33)}
            p['palms']={'L':((0,-1,0),(1,0,0),1.25),'R':((0,-1,0),(0,0,-1),.45)}
            p['bend']=.18; p['head']=(.30,0,0)
        elif clip=='CaptiveHeld':
            p['hands']={'L':(.21,.14,chest-.24),'R':(-.21,.13,chest-.25)}
            p['head']=(-.18,0,.13*wave);p['bend']=.16+.025*wave
        elif clip in ('CollarControl','CollarDrag'):
            w=base['Smooth'](u) if clip=='CollarDrag' else .5+.05*wave
            p['bend']=.38-.18*w
            p['hands']['L']=(.10,-.58+.20*w,chest-.38)
            p['hands']['R']=(-.27,-.20,chest-.15)
            p['palms']['L']=((0,-1,0),(1,0,0),1.6)
        elif clip=='InterrogateCrouch':
            p['bend']=.28
            p['hands']={'L':(.08,-.53,chest-.25),'R':(-.17,-.46,chest+.1+.035*wave)}
            p['palms']['L']=((0,-1,0),(1,0,0),1.6)
            p['palms']['R']=((0,-1,0),(0,0,-1),1.5,0)
            p['head']=(.08,0,.06*wave)
        elif clip=='InterpreterPoint':
            p['hands']['R']=(-.12,-.50,chest+.03+.04*wave)
            p['palms']['R']=((0,-1,0),(0,0,-1),1.5,0)
            p['hands']['L']=(.28,-.05,chest-.29)
        elif clip=='CreepDadao':
            ctx['Author']('CaptiveHandsUpWalk',t,0)
            p['pelvis']=(0,.04,ctx['restPelvis']-.15+.012*wave)
            for side,sign in [('L',1),('R',-1)]:
                phase=2*math.pi*u+(0 if side=='L' else math.pi)
                p['ankles'][side]=(sign*.16,.20*math.sin(phase),ctx['ankleZ']+.055*max(0,math.cos(phase)))
            Reset();p['bend']=.30;p['hands']['R']=(-.30,-.19,chest-.25)
        elif clip=='DadaoAmbush':
            w=base['Smooth']((u-.15)/.55)
            p['twist']=.60-1.0*w;p['bend']=.15+.2*math.sin(math.pi*u)
            p['hands']['R']=(-.42+.64*w,-.25-.23*math.sin(math.pi*u),chest+.35-.60*w)
            p['hands']['L']=(.30,-.45,chest+.03)
            p['palms']['R']=((0,-1,0),(1,0,0),1.35)
        elif clip=='RifleDeflect':
            w=math.sin(math.pi*u);p['twist']=-.40*w;p['bend']=.18+.18*w
            p['hands']['L']=(.16+.27*w,-.52,chest+.04)
        elif clip=='PullComrade':
            w=base['Smooth'](u);p['bend']=.42-.34*w
            p['hands']={'L':(.10,-.57+.30*w,chest-.20+.12*w),'R':(-.10,-.57+.30*w,chest-.20+.12*w)}
            p['palms']={s:((0,-1,0),(0,0,1),1.6) for s in ('L','R')}
        elif clip=='KickRifle':
            w=math.sin(math.pi*u)
            p['ankles']['R']=(-.16,-.15-.55*w,ctx['ankleZ']+.10*w)
            p['bend']=.16+.12*w
            p['hands']['L']=(.10,-.47,chest-.30)
            p['hands']['R']=(-.30,.04,chest-.25)
        elif clip=='PointBlockade':
            p['hands']['L']=(.32,-.62,chest+.14+.015*wave)
            p['palms']['L']=((0,-1,0),(0,0,-1),1.5,0)
            p['head']=(0,0,-.25)
        elif clip=='GuardTurn':
            p['twist']=.5*base['Smooth'](u)
            p['hands']={'L':(.16,-.56,chest),'R':(-.16,-.28,chest-.06)}
        ctx['ApplyPose'](p,lift)
    clips={}; reports=[]
    arm.animation_data_create()
    for clip,(duration,loop,hold) in CLIPS.items():
        action=bpy.data.actions.new(clip);values=[];count=math.ceil(duration*FPS)+1
        lows=[]
        for frame in range(count):
            arm.animation_data.action=None
            t=frame*duration/(count-1)
            Pose(clip,t,0); low,_=ctx['LowestVertex'](); Pose(clip,t,.003-low)
            values.extend(ctx['SourcePose']()); lows.append(low)
            arm.animation_data.action=action
            for name in names:
                bone=arm.pose.bones[name]
                bone.keyframe_insert('location',frame=frame)
                bone.keyframe_insert('rotation_quaternion',frame=frame)
        if loop: values[-len(names)*7:]=values[:len(names)*7]
        action.use_fake_user=True;arm.animation_data.action=None
        track=arm.animation_data.nla_tracks.new();track.name=clip;track.mute=True;track.strips.new(clip,0,action)
        clips[clip]={'duration':duration,'loop':loop,'weaponHold':hold,'frameCount':count,'values':values}
        reports.append({'clip':clip,'frames':count,'floorCorrectionMin':min(lows),'floorCorrectionMax':max(lows)})
    source=project/'Model/Character'/('Model_'+modelId+'.glb')
    asset={'schema':1,'modelId':modelId,'fps':FPS,'stride':7,'bones':names,'clips':clips,
           'originalModelSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'authoringTool':'Blender '+bpy.app.version_string+' via BlenderMCP'}
    file=output/('Animation_'+modelId+'OpeningStoryboards.json')
    file.write_text(json.dumps(asset,separators=(',',':')),encoding='utf-8')
    arm.animation_data.action=bpy.data.actions['InterrogateCrouch' if 'Ija' in modelId else 'SupplyReceive']
    scene.frame_start=0;scene.frame_end=72;scene.frame_set(12)
    camera=base['Add'](bpy.ops.object.camera_add,location=(-2.5,-3.0,1.6))
    camera.rotation_euler=(Vector((0,0,.8))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO';camera.data.ortho_scale=4.2;scene.camera=camera
    scene.render.engine='BLENDER_WORKBENCH';scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
    scene.display.shading.color_type='MATERIAL';scene.display.shading.light='STUDIO'
    scene['BlenderMcpTask']='OpeningStoryboardRebuild';scene['StoryboardSource']='3e260335331c814681bbcbf89ddcfecb'
    base['Op'](bpy.ops.file.pack_all)
    blend=private/('Scene_'+modelId+'OpeningStoryboards.blend')
    base['Op'](bpy.ops.wm.save_as_mainfile,filepath=str(blend),compress=True)
    scene.render.filepath=str(reviews/('Review_'+modelId+'.png'));base['Op'](bpy.ops.render.render,write_still=True)
    print('OPENING_BAKED',modelId,len(clips),str(file),flush=True)
    return {'id':modelId,'file':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),
            'originalModelSha256':asset['originalModelSha256'],'blend':str(blend),'clips':reports}

selected=os.environ.get('OPENING_MODEL','').split(',')
results=[base['Bake'](modelId,probe=BakeRig) for modelId in MODELS if selected==[''] or modelId in selected]
existing=output/'Data_OpeningStoryboardsAnimation.json'
if selected!=[''] and existing.exists():
    updated={row['id']:row for row in results}
    updated={**{row['id']:row for row in json.loads(existing.read_text())['models']},**updated}
    results=[updated[modelId] for modelId in MODELS if modelId in updated]
manifest={'schema':1,'version':VERSION,'fps':FPS,'actorForward':[0,0,-1],'blendSeconds':.12,
          'clips':{name:{'duration':d,'loop':loop,'weaponHold':hold} for name,(d,loop,hold) in CLIPS.items()},'models':results}
(output/'Data_OpeningStoryboardsAnimation.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('OPENING_COMPLETE',len(results),flush=True)
