"""Fit the scanned Type 11 hands against evaluated production geometry.

Run in this task's BlenderMCP scene with FPS_PROJECT_ROOT set. The input is
Script_FpsWeaponGripExport --only=Type11 --data-only. No mesh, bone length,
weapon mount or sight geometry is modified. Output rotations remain editable
beside the saved calibration scene; runtime application is a separate step.
"""
import bpy, json, math, re, shutil, hashlib
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

assert bpy.context.scene.get('BlenderMcpTask') == 'Type11ScannedHands_20261015'
project = Path(FPS_PROJECT_ROOT).resolve()
folder = Path(globals().get('FPS_TYPE11_INPUT', project/'_shots/Type11ScanHands/Package'))
source = Path(globals().get('FPS_TYPE11_SOURCE', Path.home()/'OneDrive/AI/Models/Blender/Taierzhuang1938/Type11ScannedHands_20261015'))
source.mkdir(parents=True, exist_ok=True)
inputPath=folder/'Data_Type11.json'
if not inputPath.exists():
    inputPath=folder/'Data_Type11HandInput.json'
pkg = json.loads(inputPath.read_text(encoding='utf-8'))
assert pkg['fixedRestLengths'], 'Fit the scanned fixed-length rig, not the legacy arms.'
if inputPath.resolve() != (source/'Data_Type11HandInput.json').resolve():
    shutil.copyfile(inputPath, source/'Data_Type11HandInput.json')
M = lambda a: Matrix([a[i::4] for i in range(4)])
Q = lambda a: Quaternion((a[3], *a[:3]))
QA = lambda q: [round(v,9) for v in (q.x,q.y,q.z,q.w)]
vertices = [Vector(t[j:j+3]) for t in pkg['gun'] for j in (0,3,6)]
bvh = BVHTree.FromPolygons(vertices, [(i,i+1,i+2) for i in range(0,len(vertices),3)])
inverseWeapon = M(pkg['weaponMatrix']).inverted()
boneWorlds = dict(zip(pkg['boneNames'],map(M,pkg['boneMatrices'])))
reports, corrections, finalTransforms = [], {'r':{},'l':{}}, {}
triggerRotations = {}
trigger = Vector((.002,-.040,-.123102539))

def Signed(point):
    nearest,normal,index,distance = bvh.find_nearest(point)
    return -distance if distance < .022 and (point-nearest).dot(normal) < -1e-6 else distance

for side in ['r','l']:
    chains = {}
    for name,c in pkg['chain'][side].items():
        match = re.search(r'finger(\d)(\d)?$',name,re.I)
        chains[name] = {**c,'digit':int(match[1]),'segment':int(match[2] or 0),
            'W':M(c['world']),'P':M(c['parentWorld']),'q':Q(c['local']),
            'axisV':Vector(c['axis']),'spreadV':Vector(c['spreadAxis'])}
    for digit in range(5):
        names = sorted([n for n,c in chains.items() if c['digit']==digit],key=lambda n:chains[n]['segment'])
        points, replayError = [], 0
        for mesh in pkg['skin']:
            skinMatrices = [inverseWeapon@boneWorlds[name]@M(bind)@M(mesh['bindMatrix'])
                for name,bind in zip(mesh['bones'],mesh['inverseBinds'])]
            for i in range(len(mesh['pos'])//3):
                influences = [(mesh['bones'][mesh['infl'][i*4+k]],mesh['wts'][i*4+k],mesh['infl'][i*4+k])
                    for k in range(4) if mesh['wts'][i*4+k]>0]
                if max(influences,key=lambda x:x[1])[0] not in names:
                    continue
                rest = Vector(mesh['rest'][i*3:i*3+3])
                point = Vector(mesh['pos'][i*3:i*3+3])
                components = [(name,weight,skinMatrices[index]@rest) for name,weight,index in influences]
                replayError = max(replayError,(sum((p*w for n,w,p in components),Vector())-point).length)
                points.append((point,components))
        assert replayError < .000003, f'Production skin replay differs by {replayError} m'
        pad = pkg['pads'][f'{side}{digit}2']
        padPoint = chains[pad['bone']]['W']@Vector(pad['point'])

        def FK(parameters):
            parent,transforms,rotations = None,{},{}
            for name in names:
                c=chains[name];segment=c['segment'];q=c['q'].copy()
                if digit==0 and segment==0:
                    for axis,angle in zip([(1,0,0),(0,1,0),(0,0,1)],parameters[:3]):
                        q=q@Quaternion(Vector(axis),math.radians(angle))
                else:
                    angle=parameters[segment+2] if digit==0 else parameters[segment]
                    q=q@Quaternion(c['axisV'],math.radians(angle))
                    if segment==0:
                        q=Quaternion(c['spreadV'],math.radians(parameters[3]))@q
                world=(c['P'] if parent is None else parent)@Matrix.LocRotScale(Vector(c['position']),q,Vector(c['scale']))
                transforms[name]=world@c['W'].inverted()
                rotations[str(digit)+(str(segment) if segment else '')]=QA(q)
                parent=world
            return transforms,rotations

        def Evaluate(parameters,full=False):
            transforms,rotations=FK(parameters)
            depths=[]
            for point,influences in (points if full else points[::6]):
                p=sum(((transforms[name]@component if name in transforms else component)*weight
                    for name,weight,component in influences),Vector())
                depths.append(max(0,-Signed(p)))
            excess=[max(0,d-.0012) for d in depths]
            penetration=max(excess,default=0)
            rms=math.sqrt(sum(d*d for d in excess)/max(1,len(excess)))
            tip=transforms[pad['bone']]@padPoint
            gap=(tip-trigger).length if side=='r' and digit==1 else abs(Signed(tip))
            score=250*penetration+20*rms+60*max(0,gap-.001)+800*max(0,gap-.0028)+.00003*sum(d*d for d in parameters)
            if side=='r' and digit==1:
                normal=(transforms[pad['bone']]@chains[pad['bone']]['W']).to_3x3()@Vector((0,1,0))
                score+=max(0,.60-normal.normalized().z)*.4
            return score,max(depths,default=0),gap,rotations

        parameters=[0.]*(5 if digit==0 else 4)
        before=Evaluate(parameters,True);winner=parameters.copy();globalBest=before[0]
        starts=[parameters.copy()]
        if digit==0:
            starts += [[-6,-6,-6,-6,6],[6,0,0,0,0],[0,6,0,0,0],[0,0,6,0,0],[0,0,-6,0,0],
                [18,-12,-18,12,-12],[-18,-12,12,-12,12]]
        for start in starts:
            parameters=start.copy();best=Evaluate(parameters)[0]
            for step in [6,3,1.5,.75,.25]:
                for iteration in range(6):
                    changed=False
                    for index in range(len(parameters)):
                        for sign in [-1,1]:
                            limit=(42 if index<3 else 28) if digit==0 else 18
                            trial=parameters.copy();trial[index]=max(-limit,min(limit,trial[index]+sign*step))
                            score=Evaluate(trial)[0]
                            if score<best-1e-8:
                                parameters=trial;best=score;changed=True
                    if not changed:
                        break
            fullScore=Evaluate(parameters,True)[0]
            if fullScore<globalBest:
                globalBest=fullScore;winner=parameters.copy()
        # Coupled curls can travel around a grip edge while retaining the pad
        # contact; a one-axis search can be trapped against that edge.
        parameters=winner.copy();best=Evaluate(parameters)[0]
        for step in [4,2,1,.5,.25]:
            for iteration in range(4):
                changed=False
                for i in range(len(parameters)):
                    for j in range(i+1,len(parameters)):
                        for ratio in [.5,1,2]:
                            for si in [-1,1]:
                                for sj in [-1,1]:
                                    trial=parameters.copy()
                                    for axis,offset in [(i,si*step),(j,sj*step*ratio)]:
                                        limit=(42 if axis<3 else 28) if digit==0 else 18
                                        trial[axis]=max(-limit,min(limit,trial[axis]+offset))
                                    score=Evaluate(trial)[0]
                                    if score<best-1e-8:
                                        parameters=trial;best=score;changed=True
                if not changed:
                    break
        if Evaluate(parameters,True)[0]<globalBest:
            winner=parameters.copy()
        # Refine against every skin vertex, including small protrusions that
        # are deliberately absent from the coarse search sample.
        parameters=winner.copy();best=Evaluate(parameters,True)[0]
        for step in [.75,.25,.1]:
            for iteration in range(5):
                changed=False
                for index in range(len(parameters)):
                    for sign in [-1,1]:
                        limit=(42 if index<3 else 28) if digit==0 else 18
                        trial=parameters.copy();trial[index]=max(-limit,min(limit,trial[index]+sign*step))
                        score=Evaluate(trial,True)[0]
                        if score<best-1e-8:
                            parameters=trial;best=score;changed=True
                if not changed:
                    break
        winner=parameters.copy()
        transforms,rotations=FK(winner)
        finalTransforms.update(transforms)
        corrections[side].update(rotations)
        after=Evaluate(winner,True)
        if side=='r' and digit==1:
            for name in names:
                c=chains[name];segment=c['segment'];key='1'+(str(segment) if segment else '')
                triggerRotations[key]=QA(Q(rotations[key])@Quaternion(c['axisV'],math.radians([0,2,1][segment])))
        reports.append({'side':side,'digit':digit,'replayErrorM':replayError,'parameters':winner,
            'beforePenMm':before[1]*1000,'beforeGapMm':before[2]*1000,'penMm':after[1]*1000,'gapMm':after[2]*1000})
        print(json.dumps(reports[-1]),flush=True)

result={'weapon':'Type11','inputSha256':hashlib.sha256(inputPath.read_bytes()).hexdigest(),
    'contacts':corrections,'triggerRotations':triggerRotations,'reports':reports}
(source/'Data_Type11HandFit.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
(folder/'Data_Type11HandFit.json').write_text(json.dumps(result,indent=2),encoding='utf-8')

# An editable, neutral-light calibration scene accompanies the numerical fit.
scene=bpy.context.scene
for obj in list(scene.objects):
    bpy.data.objects.remove(obj,do_unlink=True)
scene.name='Scene_Type11ScannedHandFit'
def Mesh(name,positions,faces,color):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(positions,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj)
    material=bpy.data.materials.new('Material_'+name);material.diffuse_color=(*color,1);obj.data.materials.append(material)
    return obj
Mesh('Mesh_Type11Reference',[p[:] for p in vertices],[(i,i+1,i+2) for i in range(0,len(vertices),3)],(.10,.11,.12))
for mesh in pkg['skin']:
    skinMatrices=[inverseWeapon@boneWorlds[name]@M(bind)@M(mesh['bindMatrix']) for name,bind in zip(mesh['bones'],mesh['inverseBinds'])]
    positions=[]
    for i in range(len(mesh['pos'])//3):
        rest=Vector(mesh['rest'][i*3:i*3+3]);p=Vector()
        for k in range(4):
            weight=mesh['wts'][i*4+k]
            if weight<=0:
                continue
            index=mesh['infl'][i*4+k];name=mesh['bones'][index];component=skinMatrices[index]@rest
            p+=(finalTransforms[name]@component if name in finalTransforms else component)*weight
        positions.append(p[:])
    indices=mesh['idx'] or list(range(len(positions)))
    obj=Mesh('Mesh_Type11ScannedHands',positions,[tuple(indices[i:i+3]) for i in range(0,len(indices),3)],(.55,.37,.25))
    for poly in obj.data.polygons:
        poly.use_smooth=True
text=bpy.data.texts.get('Data_Type11HandFit.json') or bpy.data.texts.new('Data_Type11HandFit.json');text.clear();text.write(json.dumps(result,indent=2))
script=bpy.data.texts.get('Script_Type11HandFit.py') or bpy.data.texts.new('Script_Type11HandFit.py');script.clear();script.write((project/'_blender/Script_Type11HandFit.py').read_text(encoding='utf-8'))
scene['ProductionPackage']='Data_Type11HandInput.json'
scene['FitChanges']='Finger rotations only; weapon, palms, shoulders and fixed bone translations preserved.'
scene['ScanAttribution']='Artec Group inc., Hand scan, CC BY 3.0; registered scan surface from the shared FPS hand asset. See License_ArtecHand.txt.'
bpy.ops.wm.save_as_mainfile(filepath=str(source/'Model_Type11ScannedHands.blend'),compress=True)
print(json.dumps({'source':str(source),'maximumPenMm':max(r['penMm'] for r in reports),'maximumGapMm':max(r['gapMm'] for r in reports)}))
