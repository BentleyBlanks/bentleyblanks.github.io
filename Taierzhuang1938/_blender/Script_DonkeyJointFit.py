"""Replay authored joint weights and sub-pixel rest corrections on a fixed skin."""
import bpy,json,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree


def ProtectAbdomenCore(skin):
    def Smooth(a,b,value):
        t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)
    appearance=skin.data.attributes.get('LimbAppearanceMass')
    if not appearance:raise RuntimeError('Abdomen protection requires authored anatomical ownership')
    changed=0;beforeMax=0;afterMax=0
    for vertex in skin.data.vertices:
        x,y,z=vertex.co
        core=abs(x)<.08 and .20<=y<=.34 and .56<=z<=.78
        row={skin.vertex_groups[g.group].name:g.weight for g in vertex.groups}
        leg=sum(value for name,value in row.items() if name.startswith(('DonkeyFront','DonkeyRear')))
        if core:beforeMax=max(beforeMax,leg)
        amount=Smooth(.16,.20,y)*(1-Smooth(.34,.40,y))*Smooth(.52,.56,z)*(1-Smooth(.78,.84,z))*(1-Smooth(.08,.12,abs(x)))
        if amount>0 and leg>1e-8 and sum(appearance.data[vertex.index].color)<.05:
            row={name:value*(1-amount) for name,value in row.items()};row['DonkeyBodyPivot']=row.get('DonkeyBodyPivot',0)+amount
            row=dict(sorted(((name,value) for name,value in row.items() if value>1e-8),key=lambda item:-item[1])[:4]);total=sum(row.values())
            for group in list(vertex.groups):skin.vertex_groups[group.group].remove([vertex.index])
            for name,value in row.items():skin.vertex_groups[name].add([vertex.index],value/total,'REPLACE')
            changed+=1
        if core:afterMax=max(afterMax,sum(value for name,value in row.items() if name.startswith(('DonkeyFront','DonkeyRear'))))
    skin.data.update()
    if afterMax>=.002:raise RuntimeError('Abdomen core still follows a leg')
    return {'method':'anatomically axial ventral core follows body; smooth perimeter and cached limb ownership protect the thighs',
        'vertices':changed,'maximumCoreLegWeightBefore':beforeMax,'maximumCoreLegWeightAfter':afterMax,'geometryDisplacementM':0}


def ApplyJointFit(scene,skin,rig):
    if scene.get('DonkeyJointFitReport'):
        return json.loads(scene['DonkeyJointFitReport'])
    project=Path(scene['DonkeyCartProject']);file=project/'_blender/Data_DonkeyJointFitV35.json'
    data=json.loads(file.read_text(encoding='utf-8'));mesh=skin.data
    if len(mesh.vertices)!=data['sourceVertexCount']:raise RuntimeError('Joint fit source vertex count changed')
    if any(name not in rig.data.bones for name in data['bones']):raise RuntimeError('Joint fit skeleton changed')
    namespace={};edgeFile=project/'_blender/Script_DonkeyJointEdges.py'
    exec(compile(edgeFile.read_text(encoding='utf-8'),edgeFile.name,'exec'),namespace)
    edges=namespace['ApplyJointEdges'](skin,data['edges'])
    positions=[v.co.copy() for v in mesh.vertices]
    weights=[{skin.vertex_groups[g.group].name:g.weight for g in v.groups} for v in mesh.vertices]
    tree=KDTree(len(positions))
    for i,p in enumerate(positions):tree.insert(p,i)
    tree.balance();used=set();maximumMatch=0;maximumMove=0
    def Decode(row):return {data['bones'][i]:float(value) for i,value in row}
    def Difference(a,b):return max((abs(a.get(name,0)-b.get(name,0)) for name in set(a)|set(b)),default=0)
    for row in data['vertices']:
        reference=Vector(row['sourcePosition']);expected=Decode(row['sourceWeights']);preferred=row['sourceVertex']
        candidates=[]
        if preferred<len(positions) and (positions[preferred]-reference).length<=.000002:
            candidates.append((Difference(weights[preferred],expected),(positions[preferred]-reference).length,preferred))
        candidates.extend((Difference(weights[index],expected),distance,index) for _,index,distance in tree.find_range(reference,.000002) if index not in used)
        candidates=sorted(item for item in candidates if item[2] not in used)
        if not candidates or candidates[0][0]>.0001:raise RuntimeError('Joint fit could not match the authored source skin')
        _,distance,index=candidates[0];used.add(index);maximumMatch=max(maximumMatch,distance)
        target=Vector(row['position']);move=(target-reference).length
        if move>data['maximumSurfaceCorrectionM']+1e-7:raise RuntimeError('Joint fit exceeds its reference-pixel surface bound')
        newWeights=Decode(row['weights'])
        if len(newWeights)>4 or abs(sum(newWeights.values())-1)>1e-6:raise RuntimeError('Invalid authored joint weights')
        if positions[index].z<.105 and (move>1e-8 or Difference(weights[index],newWeights)>1e-6):
            raise RuntimeError('Joint fit changed a protected hoof')
        vertex=mesh.vertices[index];vertex.co=Vector(row.get('intermediatePosition',row['position']));maximumMove=max(maximumMove,move)
        for group in list(vertex.groups):skin.vertex_groups[group.group].remove([index])
        for name,value in newWeights.items():
            group=skin.vertex_groups.get(name) or skin.vertex_groups.new(name=name)
            group.add([index],value,'REPLACE')
    mesh.update();edgesAfter=namespace['ApplyJointEdges'](skin,data.get('edgesAfter',[]))
    finalTree=KDTree(len(mesh.vertices))
    for vertex in mesh.vertices:finalTree.insert(vertex.co,vertex.index)
    finalTree.balance()
    for row in data['vertices']:
        intermediate=Vector(row.get('intermediatePosition',row['position']));target=Vector(row['position'])
        if (target-intermediate).length<1e-10:continue
        candidates=finalTree.find_range(intermediate,.000002)
        if not candidates:raise RuntimeError('Final joint surface correction lost its source vertex')
        _,index,_=min(candidates,key=lambda item:item[2]);mesh.vertices[index].co=target
    mesh.update();abdomen=ProtectAbdomenCore(skin)
    scene['DonkeyReferenceJointArcs']=data['jointArcsM'];scene.render.fps=data['animationBakeFps']
    report={'version':data['version'],'method':data['method'],'recipe':file.name,'recipeSha256':hashlib.sha256(file.read_bytes()).hexdigest(),
        'vertices':len(used),'maximumCoordinateMatchErrorM':maximumMatch,'maximumSurfaceCorrectionM':maximumMove,
        'surfaceCorrectionSourcePixels':maximumMove*data['referencePixelsPerMetre'],'edges':edges,'edgesAfter':edgesAfter,'maximumInfluences':max(len(v.groups) for v in mesh.vertices),
        'jointArcsM':data['jointArcsM'],'animationBakeFps':data['animationBakeFps'],'boneCount':len(rig.data.bones),'morphTargetsAdded':0,'abdomenProtection':abdomen}
    scene['DonkeyJointFitReport']=json.dumps(report)
    return report
