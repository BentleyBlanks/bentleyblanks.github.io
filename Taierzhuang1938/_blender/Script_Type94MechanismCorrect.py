"""Synchronize the editable source and final GLB mechanism coordinates.

The commander hatch front hinge follows the primary original photograph. Its
closed lid world geometry is preserved when correcting an older source pivot.
"""
import bpy
import json
import math
import os
from pathlib import Path
from mathutils import Vector

SOURCE=Path(os.environ.get('TYPE94_SOURCE_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette'))
REPO=Path(os.environ.get('TYPE94_REPO_ROOT',str(Path(__file__).resolve().parents[2] if '__file__' in globals() else Path.cwd())))


def CorrectMechanism():
    assert bpy.context.scene.get('BlenderMcpTask')=='Type94Tankette'
    lid=bpy.data.objects['Hatch_Commander']
    if lid.location.y<0:
        delta=.556
        lid.location.y+=delta
        for child in lid.children:
            if child.type=='MESH':
                for vertex in child.data.vertices:vertex.co.y-=delta
                child.data.update()
        turret=bpy.data.objects.get('Geometry_TurretYaw_Paint')
        mesh=turret.data
        adjacency=[set() for _ in mesh.vertices]
        for edge in mesh.edges:
            a,b=edge.vertices;adjacency[a].add(b);adjacency[b].add(a)
        unseen=set(range(len(mesh.vertices)))
        while unseen:
            seed=unseen.pop();group=[seed];stack=[seed]
            while stack:
                for v in adjacency[stack.pop()]:
                    if v in unseen:unseen.remove(v);group.append(v);stack.append(v)
            points=[mesh.vertices[v].co for v in group]
            center=sum(points,Vector())/len(points)
            extent=[max(p[k] for p in points)-min(p[k] for p in points) for k in range(3)]
            if abs(abs(center.x)-.18)<.055 and -.30<center.y<-.19 and .50<center.z<.55 and max(extent)<.15:
                for v in group:mesh.vertices[v].co.y+=.49
        mesh.update()
    library={'__name__':'Type94GeometryLibrary'}
    source=REPO/'Taierzhuang1938/_blender/Script_Type94TanketteBuild.py'
    exec(compile(source.read_text(encoding='utf-8'),str(source),'exec'),library)
    points,distances=library['TrackPath']()
    count=library.get('TrackLinkCount',lambda d:round(d[-1]/.0762))(distances);pitch=distances[-1]/count
    path={'points':[list(p) for p in points],'distances':distances,'lengthM':distances[-1],
          'linkCount':count,'pitchM':pitch,'sprocketTeeth':22,'drivePitchRadiusM':22*pitch/math.tau,
          'idlerWrapRadiusM':.197,'returnWrapRadiusM':.0725}
    lower=library.get('LOWER_LAYOUT')
    if lower:
        path.update(sprocketTeeth=lower['sprocketTeeth'],drivePitchRadiusM=lower['sprocketTeeth']*pitch/math.tau,
            idlerWrapRadiusM=lower['idlerRadiusM']+lower['beltCentreOffsetM'],
            returnWrapRadiusM=lower['returnRadiusM']+lower['beltCentreOffsetM'])
    if library.get('TRACK_PATH_SOLUTION'):path['solver']=library['TRACK_PATH_SOLUTION']
    for side,label in [(-1,'Left'),(1,'Right')]:
        links=sorted([o for o in bpy.data.objects if o.name.startswith('TrackLink_'+label+'_')],key=lambda o:o['TrackIndex'])
        assert len(links)==count,'Track topology changed; rebuild required'
        control=bpy.data.objects['Track_'+label]
        control['PitchM']=pitch;control['LoopLengthM']=distances[-1]
        for index,link in enumerate(links):
            p,a=library['PathSample'](points,distances,index*pitch)
            link.location=(side*library['TRACK_CENTER_X'],p.x,p.y);link.rotation_euler.x=a+math.pi
        for wheel in [o for o in bpy.data.objects if o.name.startswith('Wheel_'+label+'_')]:
            if wheel.name.endswith('Drive'):
                wheel['PitchRadiusM']=path['drivePitchRadiusM']
                driveY,driveZ=wheel.location.y,wheel.location.z
                wrapped=[link for link in links if abs(math.hypot(link.location.y-driveY,link.location.z-driveZ)-path['drivePitchRadiusM'])<.002]
                front=min(wrapped,key=lambda link:abs(math.atan2(link.location.z-driveZ,link.location.y-driveY)))
                angle=math.atan2(front.location.z-driveZ,front.location.y-driveY)
                if lower:
                    shoe=library['TRACK_SHOE_LAYOUT']
                    frontInner=pitch/2-shoe['frontBeamInsetFromHalfPitchM']-shoe['crossBeamDepthM']/2
                    rearInner=-(pitch-.020)/2+.009/2
                    centreY=(frontInner+rearInner)/2
                    bpy.context.view_layer.update()
                    opening=front.matrix_world@Vector((0,centreY,0));origin=wheel.matrix_world.translation
                    angle=math.atan2(opening.z-origin.z,opening.y-origin.y)
                    wheel['SprocketWindowCenterYLocalM']=centreY
                    wheel['SprocketPhaseUsesDeclaredShoeOpening']=True
                period=math.tau/path['sprocketTeeth']
                phase=(angle+period/2)%period-period/2
                wheel['PitchPhaseRad']=phase;wheel.rotation_euler.x=phase
    bpy.context.view_layer.update()
    meshes=[o for o in bpy.data.objects if o.type=='MESH']
    minimum=min((o.matrix_world@v.co).z for o in meshes for v in o.data.vertices)
    bpy.data.objects['Type94Tankette'].location.z-=minimum
    bpy.context.scene['MechanismStatus']='Front-hinged commander lid; pitch-matched sprockets; movement acceptance pending'
    bpy.context.scene['Type94TrackPathJson']=json.dumps(path)
    (SOURCE/'Acceptance/Data_Mechanism.json').write_text(json.dumps({'path':path,'acceptance':'Pending motion clearance inspection'},indent=2),encoding='utf-8')
    return path


if globals().get('__name__') in (None,'__main__'):
    CorrectMechanism()
