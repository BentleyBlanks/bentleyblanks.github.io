"""Reopen the saved source, then import the actual GLB and sweep its real hinges.
Run on this task's BlenderMCP instance, with the saved source freshly opened.
Evidence is external and never committed. No source file is overwritten.
"""
import bpy,json,pathlib,math,re,hashlib,os
from mathutils import Vector,Quaternion
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri
sourceRoot=pathlib.Path(os.environ.get('KI4_SOURCE_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/SurfaceV2'))
repoRoot=pathlib.Path(globals().get('__file__','Taierzhuang1938/_blender/Script_NakajimaKi4Audit.py')).resolve().parents[2]
assetRoot=pathlib.Path(os.environ.get('KI4_ASSET_ROOT',str(repoRoot/'Taierzhuang1938/Model/NakajimaKi4')))
output=sourceRoot/'Evidence'
assert pathlib.Path(bpy.data.filepath).resolve()==(sourceRoot/'Scene_NakajimaKi4.blend').resolve(), 'Open the saved source first'
assert bpy.context.scene.get('BlenderMcpTask')=='NakajimaKi4'
assert bpy.context.scene.unit_settings.scale_length==1
source=bpy.data.objects.get('NakajimaKi4');assert source
fuselageProfile=source.get('fuselageExteriorProfile','ManualV20')
if fuselageProfile in ['Photo02LowerEnvelope','Photo02Envelope','Photo02InstallationEnvelope']:
    lowerOffsets=json.loads(source['lowerExteriorOffsetsJson'])
    assert len(lowerOffsets)==11 and max(row[1] for row in lowerOffsets)>.10
    assert all(row[1]==0 for row in lowerOffsets if row[0]>=-.165 or row[0]<=-3.605), 'Keep forward installation and tail controls outside the exterior trial'
if fuselageProfile in ['Photo02Envelope','Photo02InstallationEnvelope']:
    upperOffsets=json.loads(source['upperExteriorOffsetsJson']);assert len(upperOffsets)==11
    assert all(row[1]==0 for row in upperOffsets if row[0]>=-.165 or row[0]<=-3.605)
if source.get('observerConfiguration')=='Photo02Carrier':
    optionalNames=json.loads(source['optionalObserverArmamentJson'])
    assert len(optionalNames)==28 and len(set(optionalNames))==28
    optionalObjects=[bpy.data.objects[name] for name in optionalNames]
    assert all(obj.parent is None and obj.hide_render and obj.hide_viewport for obj in optionalObjects), 'Keep the complete optional armament hidden outside the exported hierarchy'
    assert all(obj.get('optionalParentName')=='Pivot_ObserverGunElevation' and len(obj['optionalLocalMatrix'])==16 for obj in optionalObjects), 'Retain restorable local transforms for every optional armament part'
    assert not any(obj in source.children_recursive for obj in optionalObjects)
    assert len(bpy.data.collections['Source_UnresolvedObserverAccessories'].objects)==32, 'Retain28 firearm parts and4 unresolved feed mockups'
sourcePivots=[o for o in source.children_recursive if o.name.startswith('Pivot_')]
assert len(sourcePivots)==10 and all(p.children for p in sourcePivots)
if source.get('observerFinish')=='PaintedGray':
    paintedNames=set(json.loads(source['observerPaintedPartsJson']))
    actualPainted={obj.name for obj in source.children_recursive if obj.type in ['MESH','CURVE'] and any(mat.name=='Material_ObserverPaintedMetal' for mat in obj.data.materials)}
    assert len(paintedNames)==21 and paintedNames==actualPainted,'Saved source coating must remain limited to the declared21 carriage parts'
hingeSections=source['aileronHingeSections'].to_dict()
assert set(hingeSections)=={'Left','Right'}
for label in ['Left','Right']:
    assert abs(abs(bpy.data.objects['Pivot_Aileron'+label].matrix_world.translation.x)-1.85)<.00001, 'Retain the scan-calibrated aileron inboard station'
    assert abs(bpy.data.objects['Aileron_'+label]['axleBoreRadiusM']-.0037)<.000001, 'The actual moving nose needs a bearing bore around the fixed hinge pin'
shaft=bpy.data.objects['Propeller_DriveShaft']
assert shaft.parent==bpy.data.objects['Pivot_Propeller'], 'Drive shaft must share the propeller axis and rotation'
shaftPoints=[shaft.matrix_world@v.co for v in shaft.data.vertices]
casePoints=[bpy.data.objects['Engine_Crankcase'].matrix_world@v.co for v in bpy.data.objects['Engine_Crankcase'].data.vertices]
hubPoints=[bpy.data.objects['Propeller_Hub'].matrix_world@v.co for v in bpy.data.objects['Propeller_Hub'].data.vertices]
assert min(p.y for p in shaftPoints)<max(p.y for p in casePoints)-.010, 'Shaft must enter the actual front crankcase'
assert max(p.y for p in shaftPoints)>min(p.y for p in hubPoints)+.025, 'Shaft must enter the actual hub, closing the former axial gap'
engineAxis=source['engineAxisBlenderM']
assert all(math.hypot(p.x-engineAxis[0],p.z-engineAxis[2])<.0751 for p in shaftPoints), 'Shaft remains coaxial and inside the front-case bore'
packed=[i for i in bpy.data.images if i.packed_file]
recipes=json.loads((sourceRoot/'Textures/Data_TextureRecipes.json').read_text(encoding='utf8'))
expectedImages={f'Texture_Ki4{name}{channel}.png' for name in recipes for channel in ['Base','Normal','Orm']}
geometryAo=bool(source.get('geometryAo',{}).get('enabled',False))
if geometryAo:
    expectedImages.add('Texture_Ki4GeometryAo.png')
    guides=[o for o in bpy.data.objects if o.type=='CURVE' and o.get('sourceGuideFor')]
    assert len(guides)==35 and all(o.parent is None and o.hide_render for o in guides),'Retain all35 editable curve guides outside the exported hierarchy'
    assert all(len(o.data.uv_layers)>=2 and o.data.uv_layers.get('GeometryAO') and o.data.uv_layers[0].active_render for o in source.children_recursive if o.type=='MESH'),'Geometry AO must use a distinct UV1 without replacing primary UV0'
    for obj in source.children_recursive:
        if obj.type!='MESH' or not obj.name.startswith('RibTape_'):continue
        desired=1 if 'Top' in obj.name else -1;transform=obj.matrix_world.to_3x3().inverted().transposed()
        assert desired*sum((transform@p.normal).normalized().z*p.area for p in obj.data.polygons)>0,'AO rib tape must face outward: '+obj.name
assert len(packed)==len(expectedImages), 'Every authored Base/Normal/ORM set must be packed in editable source'
assert {pathlib.Path(i.filepath).name for i in packed}==expectedImages, 'Packed source images must match the actual bake recipe'
for script in (repoRoot/'Taierzhuang1938/_blender').glob('Script_NakajimaKi4*.py'):
    archived=bpy.data.texts.get(script.name)
    assert archived and archived.as_string()==script.read_text(encoding='utf8'), 'Editable source must archive the current rebuild/audit script: '+script.name
body=bpy.data.objects['Fuselage_Monocoque']
bodyPoints=[body.matrix_world@v.co for v in body.data.vertices]
assert abs(min(v.y-math.tan(math.radians(8))*(v.z-1.810) for v in bodyPoints)+3.820)<.002, 'Skin must stop at the inclined manual frame7 rudder post'
bodyHeight=max(v.z for v in bodyPoints)-min(v.z for v in bodyPoints)
assert 1.50<bodyHeight<1.52, 'Retain the oval hull and raised inter-cockpit shoulder'
frame1Points=[v for v in bodyPoints if abs(v.y-.78)<.03]
frame1Height=max(v.z for v in frame1Points)-min(v.z for v in frame1Points)
assert 1.425<frame1Height<1.435, 'Retain the tall oval frame trace instead of the former flattened fuselage'
rudderSource=bpy.data.objects['Rudder'];rudderSource.data.calc_loop_triangles()
rudderSourceArea=sum(abs((rudderSource.data.vertices[t.vertices[1]].co-rudderSource.data.vertices[t.vertices[0]].co).cross(rudderSource.data.vertices[t.vertices[2]].co-rudderSource.data.vertices[t.vertices[0]].co).x)/2 for t in rudderSource.data.loop_triangles)/2
assert rudderSourceArea>=rudderSource['referenceSideAreaBeforePocketM2']*.98, 'Motion clearance must retain the complete visible rudder'
fin=bpy.data.objects['VerticalFin'];fin.data.calc_loop_triangles()
finArea=sum(abs((fin.matrix_world@fin.data.vertices[t.vertices[1]].co-fin.matrix_world@fin.data.vertices[t.vertices[0]].co).cross(fin.matrix_world@fin.data.vertices[t.vertices[2]].co-fin.matrix_world@fin.data.vertices[t.vertices[0]].co).x)/2 for t in fin.data.loop_triangles)/2
expectedFinArea=fin.get('referenceSideAreaBeforePocketM2')
assert expectedFinArea and expectedFinArea*.90<finArea<expectedFinArea*1.01, 'The fixed fin must retain its reference silhouette, not merely its object name'
tailObjects=[bpy.data.objects[name] for name in ['Tailplane_Left','Tailplane_Right','Elevator_Left','Elevator_Right']]
tailPoints=[o.matrix_world@v.co for o in tailObjects for v in o.data.vertices]
tailSpan=max(p.x for p in tailPoints)-min(p.x for p in tailPoints);tailChord=max(p.y for p in tailPoints)-min(p.y for p in tailPoints)
assert abs(tailSpan-4.36)<.003 and abs(tailChord-1.407)<.003, 'Canvas83 horizontal tail envelope'
sourceInfo={'file':bpy.data.filepath,'packedImages':len(packed),'objects':len(source.children_recursive),'meshes':sum(o.type=='MESH' for o in source.children_recursive),'curves':sum(o.type=='CURVE' for o in source.children_recursive),'pivots':[o.name for o in sourcePivots],'reopened':True}
sourceInfo['servicePhotoCameraProfile']=source.get('servicePhotoCameraProfile','Photo02LegacyCamera')
sourceInfo['fuselageSurfaceProfile']=source.get('fuselageSurfaceProfile','LegacySurfaceV2')
if geometryAo:sourceInfo['geometryAo']={'enabled':True,'editableGuideCurves':len(guides),'uvLayer':'GeometryAO','uvIndex':1}
sourceInfo['referenceShape']={'fixedFinSideAreaM2':finArea,'horizontalTailSpanM':tailSpan,'horizontalTailMaxChordM':tailChord,'rudderHingeBlenderM':list(bpy.data.objects['Pivot_Rudder'].matrix_world.translation)}
sourceInfo['referenceShape'].update({'fuselageHeightM':bodyHeight,'rudderSideAreaM2':rudderSourceArea,'cockpitPitchM':source['cockpitCenterPitchM']})
upperSkin=[o for o in source.children_recursive if o.type=='MESH' and o.name.startswith(('UpperWing_','Aileron_'))]
upperPoints=[o.matrix_world@v.co for o in upperSkin for v in o.data.vertices]
upperChord=max(p.y for p in upperPoints)-min(p.y for p in upperPoints)
assert abs(upperChord-2)<.008,'Canvas73 printed2000mm maximum outline chord'
tipPoints=[p for p in upperPoints if abs(p.x)>5.9999]
wingInstallation=source.get('wingInstallationOffsetBlenderM',[0,0,0]);wingOffsetY=wingInstallation[1]
assert tipPoints and abs(sum(p.y for p in tipPoints)/len(tipPoints)-(1.3984+wingOffsetY))<.005,'Retain the rounded tip station in its declared installation frame'
sourceInfo['referenceShape']['upperMaximumChordM']=upperChord
lowerSkin=[o for o in source.children_recursive if o.type=='MESH' and o.name.startswith('LowerWing_')]
lowerPoints=[o.matrix_world@v.co for o in lowerSkin for v in o.data.vertices]
lowerSpan=max(p.x for p in lowerPoints)-min(p.x for p in lowerPoints);lowerChord=max(p.y for p in lowerPoints)-min(p.y for p in lowerPoints)
assert abs(lowerSpan-8.52)<.002 and abs(lowerChord-1.25)<.008,'Retain approximate8520mm general span and nominal1250mm lower chord'
sourceInfo['referenceShape']['lowerSpanM']=lowerSpan;sourceInfo['referenceShape']['lowerMaximumChordM']=lowerChord
sparReferencePoints=[];sparSeparations=[];lowerReferencePoints=[];lowerSeparations=[];lowerVJointY=[]
for label in ['Left','Right']:
    ends=[]
    for part in ['Front','Rear']:
        obj=bpy.data.objects['Interplane_'+part+label];zmin=min(v.co.z for v in obj.data.vertices);zmax=max(v.co.z for v in obj.data.vertices)
        ends.append(obj.matrix_world@Vector((0,0,zmax)))
        lowerEnd=obj.matrix_world@Vector((0,0,zmin));assert abs(lowerEnd.y-(.8975+wingOffsetY))<.0001,'Interplane V-post must meet the lower rear spar in its declared installation'
        lowerVJointY.append(lowerEnd.y)
        ring=[v.co.copy() for v in obj.data.vertices if abs(v.co.z-zmin)<.000001][::2]
        for f in [0,.5,1]:
            for p in ring:sparReferencePoints.append(obj.matrix_world@Vector((p.x,p.y,zmin+(zmax-zmin)*f)))
    separation=ends[0].y-ends[1].y;assert abs(separation-.9)<.0001,'Upper struts must meet the actual straight900mm-separated spars'
    sparSeparations.append(separation)
    lowerEnds=[]
    for i in [0,1]:
        obj=bpy.data.objects['FlyingWire_'+label+str(i)];zmin=min(v.co.z for v in obj.data.vertices);zmax=max(v.co.z for v in obj.data.vertices)
        lowerEnds.append(obj.matrix_world@Vector((0,0,zmin)))
        ring=[v.co.copy() for v in obj.data.vertices if abs(v.co.z-zmin)<.000001][::2]
        for f in [0,.5,1]:
            for p in ring:lowerReferencePoints.append(obj.matrix_world@Vector((p.x,p.y,zmin+(zmax-zmin)*f)))
    separation=lowerEnds[0].y-lowerEnds[1].y;assert abs(separation-.48)<.0001,'Lower flying wires must meet the actual480mm-separated spars'
    lowerSeparations.append(separation)
sourceInfo['referenceShape']['upperSparSeparationM']=sparSeparations
sourceInfo['referenceShape']['lowerSparSeparationM']=lowerSeparations
sourceInfo['wingInstallationOffsetBlenderM']=list(wingInstallation)
sourceRudderAxis=bpy.data.objects['Pivot_Rudder'].matrix_world.to_quaternion()@Vector((0,0,1))
sourceRudderTilt=math.degrees(math.acos(max(-1,min(1,sourceRudderAxis.z))))
assert abs(sourceRudderTilt-8)<.001 and sourceRudderAxis.y>0, 'Canvas64/84 hinge must lean forward8deg'
sourceInfo['referenceShape']['rudderForwardTiltDegrees']=sourceRudderTilt
bodyTree=BVHTree.FromPolygons(bodyPoints,[list(p.vertices) for p in body.data.polygons])
windscreenFootGaps=[]
for name in ['Windscreen1','Windscreen2']:
    obj=bpy.data.objects[name];points=[obj.matrix_world@v.co for v in obj.data.vertices]
    lowest=min(p.z for p in points);feet=[p for p in points if p.z<lowest+.00001]
    assert len(feet)==2, 'Identify both actual front frame corners'
    for foot in feet:
        hit=bodyTree.ray_cast(foot+Vector((0,0,.25)),Vector((0,0,-1)),1)[0]
        assert hit is not None, 'Windscreen corner must be over mounting skin'
        gap=foot.z-hit.z;assert .003<gap<.009, 'Windscreen frame floats above its real mounting skin'
        windscreenFootGaps.append(gap)
sourceInfo['referenceShape']['windscreenFootGapsM']=windscreenFootGaps
braceDistances=[]
for name in ['TailplaneBrace_Left','TailplaneBrace_Right']:
    brace=bpy.data.objects[name];mount=brace.matrix_world@Vector((0,0,min(v.co.z for v in brace.data.vertices)))
    distance=bodyTree.find_nearest(mount)[3];assert distance is not None and distance<.006, 'Tailplane brace must meet the actual fuselage skin'
    braceDistances.append(distance)
sourceInfo['referenceShape']['tailBraceMountSkinDistanceM']=braceDistances
sourceInfo['fuselageExteriorProfile']=fuselageProfile
if fuselageProfile in ['Photo02LowerEnvelope','Photo02Envelope','Photo02InstallationEnvelope']:
    sourceInfo['lowerExteriorOffsets']=lowerOffsets
    sourceInfo['lowerExteriorShapeScope']=source['lowerExteriorShapeScope']
if fuselageProfile in ['Photo02Envelope','Photo02InstallationEnvelope']:
    sourceInfo['upperExteriorOffsets']=upperOffsets
    sourceInfo['upperExteriorShapeScope']=source['upperExteriorShapeScope']
if source.get('servicePanelProfile')=='Photo02GroupedBanks':
    ventSpec=json.loads(source['engineVentBanksJson'])
    assert ventSpec['Upper']['count']==6 and ventSpec['Lower']['count']==7
    skinVertices=[];skinFaces=[]
    for name in ['Fuselage_Monocoque','Engine_AdapterPanels','EngineServicePanel1','EngineServicePanel-1']:
        obj=bpy.data.objects[name];obj.data.calc_loop_triangles();offset=len(skinVertices)
        skinVertices.extend(obj.matrix_world@v.co for v in obj.data.vertices)
        skinFaces.extend(tuple(offset+i for i in tri.vertices) for tri in obj.data.loop_triangles)
    skinTree=BVHTree.FromPolygons(skinVertices,skinFaces,all_triangles=True);recessGaps=[]
    for side in [-1,1]:
        names=['ExhaustCollectorCavity'+str(side)]
        for row,count in [('Upper',6),('Lower',7)]:
            for index in range(count):assert bpy.data.objects.get('EngineLouvreBank'+row+'Slat'+str(side)+'_'+str(index))
            names+=['EngineLouvreBank'+row+'Backing'+str(side),'EngineLouvreSingle'+row+'Backing'+str(side)]
        for name in names:
            obj=bpy.data.objects[name];obj.data.calc_loop_triangles()
            for tri in obj.data.loop_triangles:
                points=[obj.matrix_world@obj.data.vertices[i].co for i in tri.vertices];center=sum(points,Vector())/3
                outward=Vector((center.x,0,center.z-source['bodyLongitudinalAxisHeightM'])).normalized()
                normal=(points[1]-points[0]).cross(points[2]-points[0]).normalized()
                assert normal.dot(outward)>.5,'Visible backing normals must face outside: '+name
                hit,_,_,distance=skinTree.ray_cast(center+outward*.1,-outward,.3)
                assert distance is not None
                # A backing outside the skin extends the inward ray beyond its
                # .1m approach to the backing. Measure center minus skin hit.
                gap=(center-hit).dot(outward);recessGaps.append(gap)
                assert gap>.00025,'Backing triangulation must remain outside the actual retained skin: '+name
    sourceInfo['servicePanelRecessClearance']={'samples':len(recessGaps),'minOutsideSkinGapM':min(recessGaps),'scope':'Actual backing triangle centroids vs actual body/adapter/cover BVH; protects against flat ngons hidden inside curved skin.'}
serviceProbes=[]
if source.get('servicePanelProfile')=='Photo02RecessedBanks':
    serviceAuditPath=pathlib.Path(__file__).with_name('Script_NakajimaKi4ServiceAudit.py')
    exec(compile(serviceAuditPath.read_text(encoding='utf8'),str(serviceAuditPath),'exec'),globals())
    serviceApertureAudit,serviceProbes=AuditServiceSource(source,bpy.data.objects)
    sourceInfo['servicePanelApertureClearance']=serviceApertureAudit
before=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(assetRoot/'Model_NakajimaKi4.glb'))
new=set(bpy.data.objects)-before
def BaseName(o):return re.sub(r'\.\d{3}$','',o.name)
gameRoot=next(o for o in new if BaseName(o)=='NakajimaKi4')
nodes={BaseName(o):o for o in new};pivots={n:o for n,o in nodes.items() if n.startswith('Pivot_')}
assert len(pivots)==10
bpy.context.view_layer.update()
points=[o.matrix_world@v.co for o in new if o.type=='MESH' for v in o.data.vertices]
serviceRuntimeAudit=AuditServiceRuntime(new,serviceProbes) if serviceProbes else None
minimum=[min(v[i] for v in points) for i in range(3)];maximum=[max(v[i] for v in points) for i in range(3)]
dimensions=[maximum[i]-minimum[i] for i in range(3)]
expectedLength=7.73 if source.get('geometryProfile')=='PhotoMountCandidateV4' else 8.25
assert abs(dimensions[0]-12)<.002
assert abs(dimensions[1]-expectedLength)<.05
assert abs(dimensions[2]-3.31)<.04
propPos=pivots['Pivot_Propeller'].matrix_world.translation
rudderPos=pivots['Pivot_Rudder'].matrix_world.translation
assert abs((propPos.y-rudderPos.y)-(expectedLength-.875-.100))<.05, 'Reimported propeller/post separation must match the declared configuration'
def HasPivotAncestor(obj):
    parent=obj.parent
    while parent:
        if parent in pivots.values():return True
        parent=parent.parent
    return False
static=[o for o in new if o.type=='MESH' and not HasPivotAncestor(o)]
def Tree(objects):
    vv=[];ff=[]
    for obj in objects:
        offset=len(vv);vv.extend(obj.matrix_world@v.co for v in obj.data.vertices)
        ff.extend(tuple(offset+i for i in p.vertices) for p in obj.data.polygons)
    assert all(len(f)==3 for f in ff), 'Audit the actual triangulated GLB'
    return {'bvh':BVHTree.FromPolygons(vv,ff,epsilon=0),'vertices':vv,'faces':ff}
def TrianglePenetrates(a,b):
    eps=.0000002
    na=(a[1]-a[0]).cross(a[2]-a[0]);nb=(b[1]-b[0]).cross(b[2]-b[0])
    if na.length<eps*eps or nb.length<eps*eps:return False
    na.normalize();nb.normalize()
    da=[(p-b[0]).dot(nb) for p in a];db=[(p-a[0]).dot(na) for p in b]
    if min(da)>eps or max(da)<-eps or min(db)>eps or max(db)<-eps:return False
    if max(abs(d) for d in da)<eps and max(abs(d) for d in db)<eps:
        # Coplanar triangles: require positive projected overlap, not a shared edge.
        for tri in [a,b]:
            for i in range(3):
                axis=na.cross(tri[(i+1)%3]-tri[i]);axis.normalize()
                pa=[p.dot(axis) for p in a];pb=[p.dot(axis) for p in b]
                if min(max(pa),max(pb))-max(min(pa),min(pb))<=eps:return False
        return True
    for edges,tri in [(a,b),(b,a)]:
        for i in range(3):
            start=edges[i];delta=edges[(i+1)%3]-start
            if delta.length_squared<eps*eps:continue
            hit=intersect_ray_tri(tri[0],tri[1],tri[2],delta,start,True)
            if hit is None:continue
            t=(hit-start).dot(delta)/delta.length_squared
            if eps<t<1-eps:return True
    return False
def Intersections(a,b):
    candidates=a['bvh'].overlap(b['bvh']);count=0
    for i,j in candidates:
        aa=[a['vertices'][k] for k in a['faces'][i]];bb=[b['vertices'][k] for k in b['faces'][j]]
        if TrianglePenetrates(aa,bb):count+=1
    return count,len(candidates)

def NormalIndex(objects):
    vertices=[];faces=[];normals=[]
    for obj in objects:
        mesh=obj.data;mesh.calc_loop_triangles();offset=len(vertices)
        vertices.extend(obj.matrix_world@v.co for v in mesh.vertices)
        transform=obj.matrix_world.to_3x3().inverted().transposed()
        for tri in mesh.loop_triangles:
            faces.append(tuple(offset+k for k in tri.vertices))
            normals.append([(transform@mesh.corner_normals[k].vector).normalized() for k in tri.loops])
    return BVHTree.FromPolygons(vertices,faces,all_triangles=True),vertices,faces,normals

ringSource=bpy.data.objects['ObserverGunRing'];ringSource.data.calc_loop_triangles()
ringVertices=[ringSource.matrix_world@v.co for v in ringSource.data.vertices]
ringFaces=[tuple(t.vertices) for t in ringSource.data.loop_triangles]
ringTree=BVHTree.FromPolygons(ringVertices,ringFaces,all_triangles=True)
carrierFeet=[];carrierAxisErrors=[]
carrierPivot=bpy.data.objects['Pivot_ObserverGunElevation'].matrix_world.translation
for side in [-1,1]:
    foot=bpy.data.objects['ObserverRearRailFoot'+str(side)]
    ends=[foot.matrix_world@Vector((0,0,z)) for z in [min(v.co.z for v in foot.data.vertices),max(v.co.z for v in foot.data.vertices)]]
    signed=[]
    for point in ends:
        nearest,normal,_,distance=ringTree.find_nearest(point)
        signed.append((point-nearest).dot(normal))
    assert min(signed)<-.009, 'Rear rail foot must enter the actual circular ring tube, not end beside it'
    cap=bpy.data.objects['ObserverCradlePivotCap'+str(side)].matrix_world.translation
    axisError=math.hypot(cap.y-carrierPivot.y,cap.z-carrierPivot.z)
    assert axisError<.00001, 'The visible low side caps and carriage must share one crossshaft'
    carrierFeet.append({'side':side,'endpointsBlenderM':[list(p) for p in ends],'signedRingDistancesM':signed})
    carrierAxisErrors.append(axisError)
carrierConnectionAudit={'scope':'Saved source geometry: rear-foot endpoints enter the actual ring tube; low caps and carriage share one shaft. Runtime derivation is checked separately.','feet':carrierFeet,'maxCrossshaftAxisErrorM':max(carrierAxisErrors)}

def InterpolatedNormal(index,point):
    tree,vertices,faces,normals=index;hit,_,face,distance=tree.find_nearest(point)
    assert hit is not None
    a,b,c=[vertices[k] for k in faces[face]];e=b-a;f=c-a;d=hit-a
    denominator=e.dot(e)*f.dot(f)-e.dot(f)**2
    if abs(denominator)<1e-20:return normals[face][0],distance
    u=(f.dot(f)*d.dot(e)-e.dot(f)*d.dot(f))/denominator;v=(e.dot(e)*d.dot(f)-e.dot(f)*d.dot(e))/denominator
    normal=(normals[face][0]*(1-u-v)+normals[face][1]*u+normals[face][2]*v).normalized()
    return normal,distance
actualCowl=[o for o in new if o.type=='MESH' and o.name.split('.')[0]=='Cowl_AnnularRing']
actualCast=[o for o in new if o.type=='MESH' and any(str(name).startswith('RockerCover') for name in o.get('sourceParts',[]))]
assert len(actualCowl)==1 and len(actualCast)==1, 'Actual cowl and complete cast engine assembly must be identifiable'
cowlCrossings,cowlCandidates=Intersections(Tree(actualCowl),Tree(actualCast))
assert cowlCrossings==0, 'Fixed cowl inner wall intersects the actual crankcase/rocker covers'
cowlClearanceAudit={'trueTriangleIntersections':cowlCrossings,'bvhCandidates':cowlCandidates,'scope':'Fixed cowl vs actual cast crankcase and all9 rocker covers; deliberately seated adapter/fasteners excluded'}
def ObserverAncestor(obj):
    parent=obj.parent
    while parent:
        if parent.name.startswith('Frame_ObserverMount'):return True
        parent=parent.parent
    return False
observerMeshes=[o for o in new if o.type=='MESH' and ObserverAncestor(o)]
actualGlass=[o for o in new if o.type=='MESH' and 'Windscreen1' in o.get('sourceParts',[])]
assert observerMeshes and len(actualGlass)==1, 'Actual parked observer frame and glazing must be identifiable'
observerCrossings,observerCandidates=Intersections(Tree(observerMeshes),Tree(actualGlass))
assert observerCrossings==0, 'Observer support intersects actual glazing in the parked reference pose'
observerClearanceAudit={'trueTriangleIntersections':observerCrossings,'bvhCandidates':observerCandidates,'scope':'Complete parked observer ring/cradle/braces vs actual windscreen glazing; no unverified motion range is asserted'}
staticTree=Tree(static)
sparDistances=[staticTree['bvh'].find_nearest(p)[3] for p in sparReferencePoints]
assert all(d is not None and d<.002 for d in sparDistances),'Actual runtime struts must retain the new physical spar fittings'
sparAudit={'actualGlbReimport':True,'printedSparSeparationM':.9,'sourceMeasuredSeparationM':sparSeparations,'sampledSurfacePoints':len(sparDistances),'maxRuntimeSurfaceDistanceM':max(sparDistances),'scope':'Caps and mid-wall samples of all4 actual interplane struts; endpoints follow the straight spars, not changing chord fractions. Absolute spar position and fittings remain scan-calibrated reconstruction.'}
lowerDistances=[staticTree['bvh'].find_nearest(p)[3] for p in lowerReferencePoints]
assert all(d is not None and d<.002 for d in lowerDistances),'Actual lower flying-wire attachment surfaces must be preserved'
lowerSparAudit={'actualGlbReimport':True,'printedChordSegmentsM':[.15,.48,.62],'printedSparSeparationM':.48,'sourceMeasuredSeparationM':lowerSeparations,'lowerVJointSourceYM':lowerVJointY,'sampledSurfacePoints':len(lowerDistances),'maxRuntimeSurfaceDistanceM':max(lowerDistances),'scope':'Actual flying-wire endpoints/mid-wall samples and V-post rear-spar feet; absolute reference origin and fittings remain reconstruction.'}
hingeSamples=[]
for label,sections in hingeSections.items():
    movingTree=Tree([o for o in pivots['Pivot_Aileron'+label].children_recursive if o.type=='MESH'])
    for section in sections:
        center=Vector(section['centerBlenderM']);fore=Vector(section['foreBlender']);up=Vector(section['upBlender'])
        for kind,tree,radius,angles in [('nose',movingTree,section['radiusM'],[-75,-45,0,45,75]),('cove',staticTree,section['radiusM']+section['radialClearanceM'],[-45,0,45])]:
            for angle in angles:
                a=math.radians(angle);point=center+radius*(fore*math.cos(a)+up*math.sin(a));distance=tree['bvh'].find_nearest(point)[3]
                assert distance is not None and distance<.0014, 'Actual GLB '+label+' '+kind+' no longer follows the straight concentric hinge section'
                hingeSamples.append({'side':label,'kind':kind,'sectionBlenderX':center.x,'angleDegrees':angle,'actualSurfaceDistanceM':distance})
hingeAudit={'actualGlbReimport':True,'samples':hingeSamples,'maxActualSurfaceDistanceM':max(r['actualSurfaceDistanceM'] for r in hingeSamples),'scope':'48 independent surface queries on actual imported game triangles against straight-axis rounded nose and concentric cove; complete moving-vs-fixed collision audit includes the hinge pins'}
normalSamples=[]
for label,sections in hingeSections.items():
    denseSections=[]
    for i in range(11):
        f=i/10;first,last=sections[0],sections[-1]
        denseSections.append({'centerBlenderM':list(Vector(first['centerBlenderM']).lerp(Vector(last['centerBlenderM']),f)),'radiusM':first['radiusM']*(1-f)+last['radiusM']*f})
    for part,sign in [('UpperWing_Main',1),('Aileron_',-1)]:
        name=part+label;high=NormalIndex([bpy.data.objects[name]])
        low=NormalIndex([o for o in new if o.type=='MESH' and (BaseName(o)==name or name in o.get('sourceParts',[]))])
        for section in denseSections:
            center=Vector(section['centerBlenderM'])
            for factor in [.6,1,1.5,2.5]:
                probe=center+Vector((0,sign*section['radiusM']*factor,-.5))
                hit=high[0].ray_cast(probe,Vector((0,0,1)),1)[0]
                assert hit is not None,'Identify actual underside skin beside the hinge'
                highNormal,_=InterpolatedNormal(high,hit);lowNormal,distance=InterpolatedNormal(low,hit)
                angle=math.degrees(highNormal.angle(lowNormal));assert distance<.0015 and angle<5,'Game hinge skin changed its high-source shading normal'
                normalSamples.append({'side':label,'part':name,'spanM':abs(center.x),'offsetFactor':factor,'surfaceDistanceM':distance,'normalDifferenceDegrees':angle})
hingeAudit['outerSkinNormalSamples']=normalSamples
hingeAudit['maxHighToGameNormalDifferenceDegrees']=max(r['normalDifferenceDegrees'] for r in normalSamples)
motion=[]
for name,p in sorted(pivots.items()):
    p.rotation_mode='QUATERNION';rest=p.rotation_quaternion.copy();center=p.matrix_world.translation.copy()
    meshChildren=[o for o in p.children_recursive if o.type=='MESH'];assert meshChildren
    axis=Vector((0,0,1)) if name=='Pivot_ObserverYaw' else Vector((-1,0,0)) if name=='Pivot_ObserverGunElevation' else Vector((1,0,0)) if any(w in name for w in ['Aileron','Elevator','Wheel']) else Vector((0,0,1)) if 'Rudder' in name else Vector((0,1,0))
    initial=[o.matrix_world@v.co for o in meshChildren for v in o.data.vertices]
    radii=[(v-center).length for v in initial]
    angles=[-15,-7.5,0,7.5,15] if name=='Pivot_ObserverYaw' else [-10,-5,0,5,10] if name=='Pivot_ObserverGunElevation' else range(0,361,45) if any(w in name for w in ['Wheel','Propeller']) else [-18,-9,0,9,18] if 'Aileron' in name else [-25,-12.5,0,12.5,25]
    for angle in angles:
        p.rotation_quaternion=rest@Quaternion(axis,math.radians(angle));bpy.context.view_layer.update()
        actual=[o.matrix_world@v.co for o in meshChildren for v in o.data.vertices]
        drift=max(abs((v-center).length-r) for v,r in zip(actual,radii))
        pivotDrift=(p.matrix_world.translation-center).length
        assert drift<.00001 and pivotDrift<.000001, name+' must be rigid about its real hinge'
        obstacleTree=staticTree
        if name=='Pivot_ObserverGunElevation':
            moving=set(meshChildren)
            obstacleTree=Tree([o for o in new if o.type=='MESH' and o not in moving])
        collisions,candidates=Intersections(Tree(meshChildren),obstacleTree) if 'Wheel' not in name else (None,None)
        motion.append({'pivot':name,'angleDegrees':angle,'maxRadialDriftM':drift,'pivotDriftM':pivotDrift,'staticTriangleIntersections':collisions,'staticBvhCandidates':candidates})
    p.rotation_quaternion=rest;bpy.context.view_layer.update()
report={'source':sourceInfo,'sourceSha256':hashlib.sha256((sourceRoot/'Scene_NakajimaKi4.blend').read_bytes()).hexdigest(),'runtimeSha256':hashlib.sha256((assetRoot/'Model_NakajimaKi4.glb').read_bytes()).hexdigest(),'actualGlbReimport':True,'gameMeshes':sum(o.type=='MESH' for o in new),'dimensionsBlenderXyzM':dimensions,'boundsBlenderXyzM':[minimum,maximum],'propellerCenterBlenderM':list(propPos),'rudderCenterBlenderM':list(rudderPos),'motion':motion,'wheelRadiusM':pivots['Pivot_WheelLeft'].get('rollingRadiusM')}
report['aileronNoseCove']=hingeAudit
report['upperWingSpars']=sparAudit
if serviceRuntimeAudit:report['servicePanelApertureClearance']=serviceRuntimeAudit
report['lowerWingSpars']=lowerSparAudit
report['cowlEngineClearance']=cowlClearanceAudit
report['observerGlassClearance']=observerClearanceAudit
report['observerCarrierConnections']=carrierConnectionAudit
combined=[]
rudder=pivots['Pivot_Rudder'];rudderRest=rudder.rotation_quaternion.copy()
elevators=[pivots['Pivot_ElevatorLeft'],pivots['Pivot_ElevatorRight']];elevatorRest=[p.rotation_quaternion.copy() for p in elevators]
for rudderAngle in [-25,0,25]:
    for elevatorAngle in [-25,0,25]:
        rudder.rotation_quaternion=rudderRest@Quaternion(Vector((0,0,1)),math.radians(rudderAngle))
        for p,q in zip(elevators,elevatorRest):p.rotation_quaternion=q@Quaternion(Vector((1,0,0)),math.radians(elevatorAngle))
        bpy.context.view_layer.update()
        count,candidates=Intersections(Tree([o for o in rudder.children_recursive if o.type=='MESH']),Tree([o for p in elevators for o in p.children_recursive if o.type=='MESH']))
        combined.append({'rudderDegrees':rudderAngle,'elevatorDegrees':elevatorAngle,'triangleIntersections':count,'bvhCandidates':candidates})
rudder.rotation_quaternion=rudderRest
for p,q in zip(elevators,elevatorRest):p.rotation_quaternion=q
bpy.context.view_layer.update();report['combinedControlPoses']=combined
observerCombined=[];yaw=pivots['Pivot_ObserverYaw'];gun=pivots['Pivot_ObserverGunElevation'];yawRest=yaw.rotation_quaternion.copy();gunRest=gun.rotation_quaternion.copy()
for yawAngle in [-15,0,15]:
    for elevationAngle in [-10,0,10]:
        yaw.rotation_quaternion=yawRest@Quaternion(Vector((0,0,1)),math.radians(yawAngle));gun.rotation_quaternion=gunRest@Quaternion(Vector((-1,0,0)),math.radians(elevationAngle));bpy.context.view_layer.update()
        yawMeshes=[o for o in yaw.children_recursive if o.type=='MESH'];gunMeshes=[o for o in gun.children_recursive if o.type=='MESH'];gunSet=set(gunMeshes)
        fixedCount,_=Intersections(Tree(yawMeshes),staticTree)
        frameCount,_=Intersections(Tree(gunMeshes),Tree([o for o in new if o.type=='MESH' and o not in gunSet]))
        observerCombined.append({'yawDegrees':yawAngle,'elevationDegrees':elevationAngle,'staticTriangleIntersections':fixedCount,'gunObstacleTriangleIntersections':frameCount})
yaw.rotation_quaternion=yawRest;gun.rotation_quaternion=gunRest;bpy.context.view_layer.update();report['combinedObserverControlPoses']=observerCombined
(output/'Data_ReopenAndMotionAudit.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps({'source':sourceInfo,'gameMeshes':report['gameMeshes'],'dimensionsM':dimensions,'motionPoses':len(motion),'intersections':[(r['pivot'],r['angleDegrees'],r['staticTriangleIntersections']) for r in motion if r['staticTriangleIntersections']]}))
assert not any(r['staticTriangleIntersections'] for r in motion), 'A rotating component intersects fixed geometry'
assert not any(r['triangleIntersections'] for r in combined), 'Rudder and elevator intersect in combined extreme poses'
assert not any(r['staticTriangleIntersections'] or r['gunObstacleTriangleIntersections'] for r in observerCombined), 'Observer yaw/elevation combination intersects obstacles'
