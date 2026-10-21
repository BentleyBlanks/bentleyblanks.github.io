"""Topology, real root deformation and attached harness contact over one walk."""
import bpy,bmesh,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

scene=bpy.context.scene
base=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020')
skin=bpy.data.objects['DonkeyContinuousSkin'];rig=bpy.data.objects['DonkeyRig']
parent=list(range(len(skin.data.vertices)))
def Find(i):
    while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
    return i
for edge in skin.data.edges:
    a,b=[Find(i) for i in edge.vertices]
    if a!=b:parent[b]=a
rows=[{skin.vertex_groups[g.group].name:g.weight for g in v.groups if g.weight>1e-7} for v in skin.data.vertices]
torso=max((v.index for v in skin.data.vertices if v.co.z>.75),key=lambda i:sum(w for n,w in rows[i].items() if n in ('DonkeyBodyPivot','DonkeyThoraxPivot','DonkeyChestPivot','DonkeyPelvisPivot')))
torsoComponent=Find(torso)
legPaths={}
solePaths={};hoofDimensions={};hornWeightErrors=[];lowerForeignWeights=[]
owners=skin.data.attributes.get('FootOwner')
if owners is None:raise RuntimeError('Rebuilt lower legs have no ownership attribute')
hornIndices={v for p in skin.data.polygons if skin.data.materials[p.material_index].name.startswith('DonkeyHoofHorn') for v in p.vertices}
for owner,stem in enumerate(('DonkeyFrontLeft','DonkeyFrontRight','DonkeyRearLeft','DonkeyRearRight'),1):
    lowerForeignWeights.extend(sum(weight for name,weight in rows[v.index].items() if not name.startswith(stem)) for v in skin.data.vertices if owners.data[v.index].value==owner)
    points=[v for v in skin.data.vertices if owners.data[v.index].value==owner and v.index in hornIndices]
    if not points:raise RuntimeError('A hoof has no separate horn wall: '+stem)
    solePaths[stem]=all(Find(v.index)==torsoComponent for v in points)
    hoofDimensions[stem]=[max(v.co[i] for v in points)-min(v.co[i] for v in points) for i in range(3)]
    hornWeightErrors.extend(abs(1-rows[v.index].get(stem+'HoofPivot',0)) for v in points)
for front in ('Front','Rear'):
    for side in ('Left','Right'):
        stem='Donkey'+front+side
        sample=max((v.index for v in skin.data.vertices if .45<v.co.z<.82),key=lambda i:rows[i].get(stem+'ElbowPivot',0))
        if rows[sample].get(stem+'ElbowPivot',0)<.25:raise RuntimeError('Limb has no supported upper skin envelope: '+stem)
        legPaths[stem]=Find(sample)==torsoComponent

rootEdges=[]
for edge in skin.data.edges:
    a,b=[skin.data.vertices[i] for i in edge.vertices]
    length=(a.co-b.co).length
    if length<.002 or min(a.co.z,b.co.z)<.58:continue
    masses=[sum(w for n,w in rows[i].items() if any(token in n for token in ('FrontLeft','FrontRight','RearLeft','RearRight'))) for i in edge.vertices]
    if any(.05<mass<.95 for mass in masses):rootEdges.append((a.index,b.index,length))

def Evaluated(obj,deps):
    evaluated=obj.evaluated_get(deps);mesh=evaluated.to_mesh()
    points=[evaluated.matrix_world@v.co for v in mesh.vertices]
    faces=[tuple(p.vertices) for p in mesh.polygons]
    evaluated.to_mesh_clear()
    return points,faces

ratios=[];contacts=[];anchorErrors=[]
for frame in range(1,38):
    scene.frame_set(frame);bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
    skinPoints,_=Evaluated(skin,deps)
    for a,b,length in rootEdges:ratios.append(((skinPoints[a]-skinPoints[b]).length/length,frame,a,b))
    for side in (-1,1):
        trace=bpy.data.objects['HarnessUpperTrace'+str(side)]
        points,_=Evaluated(trace,deps);centre=sum(points[-8:],Vector())/8
        anchor=Vector((side*.428,-.87,.642));anchorErrors.append((centre-anchor).length)
        binding=bpy.data.objects['HarnessShaftBinding%s_-0.86'%side]
        bindingPoints,bindingFaces=Evaluated(binding,deps)
        bindingTree=BVHTree.FromPolygons(bindingPoints,bindingFaces,all_triangles=False)
        traceGap=max(0,bindingTree.find_nearest(centre)[3]-.011)
        drop=bpy.data.objects['HarnessLeatherDrop'+str(side)]
        dropPoints,dropFaces=Evaluated(drop,deps);dropTree=BVHTree.FromPolygons(dropPoints,dropFaces,all_triangles=False)
        tug=bpy.data.objects['HarnessShaftTug'+str(side)]
        tugPoints,_=Evaluated(tug,deps)
        tugGap=min(dropTree.find_nearest(point)[3] for point in tugPoints)
        contacts.append({'frame':frame,'side':side,'traceToBindingGapM':traceGap,'dropToTugGapM':tugGap})

report={'continuousLegRootPaths':legPaths,'rootEdgeCount':len(rootEdges),
 'continuousHornToTorsoPaths':solePaths,'hoofWallDimensionsM':hoofDimensions,'maxHornNonHoofWeight':max(hornWeightErrors),'maxRebuiltLowerForeignWeight':max(lowerForeignWeights),
 'rootEdgeStretchRange':[min(row[0] for row in ratios),max(row[0] for row in ratios)],
 'worstRootEdge':list(max(ratios)),
 'maxTraceAnchorDriftM':max(anchorErrors),
 'maxTraceToBindingGapM':max(c['traceToBindingGapM'] for c in contacts),
 'maxDropToTugGapM':max(c['dropToTugGapM'] for c in contacts),
 'skinWeightSumError':max(abs(sum(row.values())-1) for row in rows),
 'maxSkinInfluences':max(len(row) for row in rows),'contacts':contacts}
padVolumes=[]
for obj in bpy.data.objects:
    if obj.name.startswith('HarnessClothCollar') and obj.type=='MESH':
        bm=bmesh.new();bm.from_mesh(obj.data);padVolumes.append(bm.calc_volume(signed=True));bm.free()
report['paddedCollarSignedVolumesM3']=padVolumes
heads=[]
for obj in bpy.data.objects:
    if obj.type=='MESH' and obj.name.startswith('TyreRivet') and obj.parent==bpy.data.objects['DonkeyCartRig']:
        points=[obj.matrix_world@v.co for v in obj.data.vertices]
        heads.append(max(max(p[i] for p in points)-min(p[i] for p in points) for i in range(3)))
report['maxTyreFastenerSpanM']=max(heads)
report['maxHeadLimbWeight']=max((sum(weight for name,weight in rows[v.index].items() if name.startswith(('DonkeyFront','DonkeyRear'))) for v in skin.data.vertices if v.co.y>1.06 and v.co.z>.98),default=0)
(base/'Review/Data_IntegrityVerification.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
scene.frame_set(0)
print(json.dumps({k:v for k,v in report.items() if k!='contacts'}))
if not all(legPaths.values()):raise RuntimeError('A donkey leg root is not topologically continuous with its torso')
if not all(solePaths.values()):raise RuntimeError('A horn wall is detached from the continuous lower leg')
if max(hornWeightErrors)>1e-6:raise RuntimeError('Hard hoof horn must move rigidly with its hoof bone')
if max(lowerForeignWeights)>1e-6:raise RuntimeError('Chest/body weights must not pull the rebuilt lower-leg seam')
if report['skinWeightSumError']>1e-5 or report['maxSkinInfluences']>4:raise RuntimeError('Invalid runtime skin weights')
if report['maxTraceAnchorDriftM']>.0001:raise RuntimeError('Trace endpoint detaches from the cart')
if report['maxTraceToBindingGapM']>.003 or report['maxDropToTugGapM']>.005:raise RuntimeError('Harness connections leave their contact tolerance')
if len(padVolumes)!=2 or min(padVolumes)<=0:raise RuntimeError('Padded collar must have two closed outward-facing volumes')
if report['maxTyreFastenerSpanM']>.020:raise RuntimeError('Wheel fastener reconstruction enlarged a small rivet')
if report['maxHeadLimbWeight']>1e-6:raise RuntimeError('Limb motion must not pull the upper neck or muzzle surface')
