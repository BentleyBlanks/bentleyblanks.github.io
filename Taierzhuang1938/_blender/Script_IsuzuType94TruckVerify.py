"""Reopen the real exported GLB in this task's dedicated Blender instance.

Sources and the verification .blend remain outside the repository. This checks
imported geometry, PBR images, pivots and units; visual approval remains separate.
"""
import bpy,json,math,hashlib,importlib.util,os
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

SOURCE=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/IsuzuType94Truck')
WORKSPACE=Path(os.environ.get('ISUZU_WORKSPACE') or bpy.context.scene.get('IsuzuWorkspace',Path.cwd())).resolve()
if not (WORKSPACE/'Taierzhuang1938/_blender/Script_IsuzuType94TruckVerify.py').is_file():raise RuntimeError('Invalid explicit Isuzu verification workspace: '+str(WORKSPACE))
QA=WORKSPACE/'tmp/IsuzuType94Truck';FILE=WORKSPACE/'Taierzhuang1938/Model/IsuzuType94Truck/Model_IsuzuType94Truck.glb'

def HeaderSurfaceAudit(root,source):
 names={int(k):v for k,v in root['SourcePartNames'].items()};triangles=[]
 for obj in root.children_recursive:
  if obj.type!='MESH':continue
  mesh=obj.data;attribute=mesh.attributes.get('_SOURCE_PART_ID')
  if attribute is None:continue
  mesh.calc_loop_triangles();normalMatrix=obj.matrix_world.to_3x3().inverted().transposed()
  for tri in mesh.loop_triangles:
   if names.get(int(round(attribute.data[tri.vertices[0]].value)))!='Canvas_FrontHeaderValance':continue
   triangles.append({'p':[obj.matrix_world@mesh.vertices[i].co for i in tri.vertices],'n':[(normalMatrix@mesh.corner_normals[i].vector).normalized() for i in tri.loops]})
 if not triangles:raise RuntimeError('Actual header part missing')
 def Tree(records):
  return BVHTree.FromPolygons([p for tri in records for p in tri['p']],[(3*i,3*i+1,3*i+2) for i in range(len(records))],all_triangles=True)
 sourceTriangles=source['triangles'];sourceTree=Tree(sourceTriangles);runtimeTree=Tree(triangles)
 def Normal(tri,point):
  a,b,c=tri['p'];e0=b-a;e1=c-a;v=point-a;d00=e0.dot(e0);d01=e0.dot(e1);d11=e1.dot(e1);d20=v.dot(e0);d21=v.dot(e1);den=d00*d11-d01*d01
  if abs(den)<1e-20:return (b-a).cross(c-a).normalized()
  u=(d11*d20-d01*d21)/den;t=(d00*d21-d01*d20)/den
  return (tri['n'][0]*(1-u-t)+tri['n'][1]*u+tri['n'][2]*t).normalized()
 def Compare(records,target,targetTree):
  distances=[];angles=[];maximumPoint=None
  for tri in records:
   for weights in [(1/3,1/3,1/3),(.5,.25,.25),(.25,.5,.25),(.25,.25,.5)]:
    point=sum((p*w for p,w in zip(tri['p'],weights)),Vector());a,b,c=tri['p'];facing=(b-a).cross(c-a).normalized()
    candidates=[hit for hit in targetTree.find_nearest_range(point,.020) if hit[1].dot(facing)>.2]
    if not candidates:
     nearest=targetTree.find_nearest(point)
     raise RuntimeError('Header same-facing nearest-surface lookup failed: '+str({'point':list(point),'facing':list(facing),'nearestPoint':list(nearest[0]) if nearest[0] else None,'nearestNormal':list(nearest[1]) if nearest[1] else None,'distance':nearest[3],'facingDot':nearest[1].dot(facing) if nearest[1] else None}))
    hit,normal,index,distance=min(candidates,key=lambda hit:hit[3])
    if not distances or distance>max(distances):maximumPoint={'pointBlenderM':list(point),'nearestPointBlenderM':list(hit),'targetTriangle':index}
    distances.append(distance);angles.append(math.degrees(Normal(tri,point).angle(Normal(target[index],hit))))
  distances.sort();angles.sort()
  def Percentile(values,p):return values[min(len(values)-1,int((len(values)-1)*p))]
  return {'samples':len(distances),'maximumPositionDifferenceM':distances[-1],'position95M':Percentile(distances,.95),'meanPositionDifferenceM':sum(distances)/len(distances),'normal95Degrees':Percentile(angles,.95),'maximumNormalDegrees':angles[-1],'maximumPositionSample':maximumPoint}
 highToLow=Compare(sourceTriangles,triangles,runtimeTree);lowToHigh=Compare(triangles,sourceTriangles,sourceTree)
 return {'sourceTriangles':len(sourceTriangles),'runtimeTriangles':len(triangles),'highToLow':highToLow,'lowToHigh':lowToHigh,'scope':'Actual source and actual GLB header triangle-centre plus three interior barycentric samples, both directions. Nearest surface with matching geometric facing (dot>0.2) distinguishes the two3mm-separated skins. Interpolated authored corner normals. Sampled errors only, not a continuous bound or photographic acceptance.'}


def VerifyImportedCanvasHeader(root,source,check):
    names={int(k):v for k,v in root['SourcePartNames'].items()};faces=[]
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        mesh=obj.data;attribute=mesh.attributes.get('_SOURCE_PART_ID')
        if attribute is None:continue
        for face in mesh.polygons:
            if names.get(int(round(attribute.data[face.vertices[0]].value)))=='Canvas_FrontHeaderValance':faces.append([obj.matrix_world@mesh.vertices[i].co for i in face.vertices])
    Key=lambda p:tuple(round(v,6) for v in p)
    def TriangleKey(points):
        values=[Key(p) for p in points];return min(tuple(values[i:]+values[:i]) for i in range(3))
    count=715;sourceRim=[tri for tri in source['triangles'] if not any(all(layer*count<=i<(layer+1)*count for i in tri['indices']) for layer in range(2))];rimKeys={TriangleKey(tri['p']) for tri in sourceRim};boundary={layer*count+i for layer in range(2) for i in range(count) if i//65 in (0,10) or i%65 in (0,64)}
    points={Key(p):p for face in faces for p in face};edges={};centre=sum(points.values(),Vector())/max(1,len(points));volume=0
    for face in faces:
        keys=[Key(p) for p in face]
        for a,b in zip(keys,keys[1:]+keys[:1]):edge=tuple(sorted((a,b)));edges[edge]=edges.get(edge,0)+1
        a,b,c=[p-centre for p in face];volume+=a.dot(b.cross(c))/6
    missing=sum(min(((source['p'][i]-p).length for p in points.values()),default=1e6)>1e-6 for i in boundary);rimMatches=sum(TriangleKey(face) in rimKeys for face in faces);badEdges=sum(n!=2 for n in edges.values());euler=len(points)-len(edges)+len(faces)
    topology={'triangles':len(faces),'vertices':len(points),'sourceBoundaryVertices':len(boundary),'missingSourceBoundaryVertices':missing,'sourceRimTrianglesRetained':rimMatches,'nonManifoldEdges':badEdges,'euler':euler,'signedVolumeM3':volume}
    check(len(faces)==1496 and not missing and rimMatches==296 and not badEdges and euler==2 and volume>0,'Actual cloth header retains two closed skins,all source attachment vertices and thickness rim',topology)
    try:surface=HeaderSurfaceAudit(root,source)
    except RuntimeError as error:
        surface={'error':str(error)}
        check(False,'Actual header geometry stays within sampled0.6mm of its own source-facing surface',surface)
        check(False,'Actual header preserves separately sampled source normal fields',surface)
        return {'topology':topology,'surface':surface}
    rows=[surface['highToLow'],surface['lowToHigh']]
    check(all(row['maximumPositionDifferenceM']<.0006 and row['position95M']<.0002 for row in rows),'Actual header geometry stays within sampled0.6mm of its own source-facing surface',surface)
    check(all(row['normal95Degrees']<6 and row['maximumNormalDegrees']<25 for row in rows),'Actual header preserves separately sampled source normal fields',surface)
    return {'topology':topology,'surface':surface,'positionSampleLimitM':.0006,'normal95LimitDegrees':6,'normalMaximumLimitDegrees':25,'continuousErrorBoundClaimed':False}


def VerifyImportedBonnetClearance(root, scene, check):
    """Replay the actual imported BonnetOpen tracks on the actual game triangles.

    Point-domain source IDs survive merging/LOD, so radiator fins cannot be
    mistaken for a lamp or a bonnet mating seam during collision verification.
    """
    from mathutils.bvhtree import BVHTree
    from collections import Counter
    names={int(k):v for k,v in root.get('SourcePartNames',{}).items()}
    parts={};missing=[];mixed=0;invalid=0
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attribute=obj.data.attributes.get('_SOURCE_PART_ID')
        if attribute is None:missing.append(obj.name);continue
        values=[int(round(v.value)) for v in attribute.data]
        for polygon in obj.data.polygons:
            ids={values[i] for i in polygon.vertices}
            if len(ids)!=1:mixed+=1;continue
            partId=next(iter(ids))
            if partId not in names:invalid+=1;continue
            key=(obj.name,partId)
            part=parts.setdefault(key,{'object':obj,'id':partId,'name':names[partId],'faces':[]})
            part['faces'].append(tuple(polygon.vertices))
    check(bool(names) and not missing and not mixed and not invalid,'Actual game triangles retain unambiguous original part labels',{'mappedParts':len(parts),'namedParts':len(names),'missingMeshAttributes':missing,'mixedPartFaces':mixed,'invalidPartFaces':invalid})
    if not names or missing or mixed or invalid:return {'collisions':[],'validPartLabels':False}
    movingParents={'Hood_Left','Hood_Right','HoodSide_Left','HoodSide_Right','RearCheek_Left','RearCheek_Right'}
    for part in parts.values():
        obj=part['object'];used=sorted({i for f in part['faces'] for i in f});remap={old:i for i,old in enumerate(used)}
        part['vertices']=[obj.data.vertices[i].co.copy() for i in used];part['faces']=[tuple(remap[i] for i in f) for f in part['faces']]
        ancestor=obj.parent;part['moving']=False
        while ancestor:
            if ancestor.name in movingParents:part['moving']=True;break
            ancestor=ancestor.parent
    leaves=[p for p in parts.values() if p['name'].startswith(('BonnetTop_','BonnetSide_Sheet','BonnetSide_RearTransition','BonnetRearCheek_Sheet'))]
    fixed=[p for p in parts.values() if not p['moving'] and not p['name'].startswith('Bonnet')]
    fixedCowl=[p for p in parts.values() if not p['moving'] and p['name'].startswith(('BonnetRearScuttle_','BonnetRearShoulder_'))]
    check(len(leaves)==8,'All eight delivered main and rear-cheek bonnet skin pieces are individually identifiable',len(leaves))
    saved=[];tracks=[];closed={o:o.matrix_basis.copy() for o in root.children_recursive if o.name in movingParents};oldFrame=scene.frame_current
    for obj in root.children_recursive:
        data=obj.animation_data
        if not data:continue
        saved.append((obj,data.action,data.action_slot,data.use_nla,[(t,t.mute) for t in data.nla_tracks]))
        data.action=None;data.use_nla=True
        for track in data.nla_tracks:
            selected=any(strip.action and 'BonnetOpen' in strip.action.name for strip in track.strips)
            track.mute=not selected
            if selected:tracks.extend(track.strips)
    check(len(tracks)>=6,'Actual exported six-node BonnetOpen animation tracks are available for replay',len(tracks))
    collisions=[];queries=0;movingPairQueries=0;rearCowlQueries=0;sameSideCheekQueries=0
    def TopAwayFromCentreMate(part):
        # Both top leaves share the central hinge. Exclude only its10mm mating
        # strip; the rest of the two actual sheets must also clear each other.
        sign=-1 if part['name'].endswith('-1') else 1
        world=[part['object'].matrix_world@v for v in part['vertices']];vertices=[];faces=[]
        for face in part['faces']:
            polygon=[world[i] for i in face];clipped=[]
            for a,b in zip(polygon,polygon[1:]+polygon[:1]):
                va=sign*a.x;vb=sign*b.x;insideA=va>=.010;insideB=vb>=.010
                if insideA:clipped.append(a)
                if insideA!=insideB:clipped.append(a+(b-a)*((.010-va)/(vb-va)))
            if len(clipped)<3:continue
            offset=len(vertices);vertices.extend(clipped);faces.append(tuple(range(offset,len(vertices))))
        return BVHTree.FromPolygons(vertices,faces,all_triangles=False)
    if len(tracks)>=6:
        first=min(t.frame_start for t in tracks);last=max(t.frame_end for t in tracks);scene.frame_set(int(first),subframe=first-int(first));bpy.context.view_layer.update()
        vertices=[];faces=[];owners=[]
        for part in fixed:
            offset=len(vertices);vertices.extend(part['object'].matrix_world@v for v in part['vertices']);faces.extend(tuple(offset+i for i in f) for f in part['faces']);owners.extend([part['name']]*len(part['faces']))
        obstacle=BVHTree.FromPolygons(vertices,faces,all_triangles=False)
        cowlVertices=[];cowlFaces=[];cowlOwners=[]
        for part in fixedCowl:
            offset=len(cowlVertices);cowlVertices.extend(part['object'].matrix_world@v for v in part['vertices']);cowlFaces.extend(tuple(offset+i for i in f) for f in part['faces']);cowlOwners.extend([part['name']]*len(part['faces']))
        cowlObstacle=BVHTree.FromPolygons(cowlVertices,cowlFaces,all_triangles=False)
        for i in range(121):
            frame=first+(last-first)*i/120;scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
            movingTrees=[]
            for part in leaves:
                tree=BVHTree.FromPolygons([part['object'].matrix_world@v for v in part['vertices']],part['faces'],all_triangles=False);hits=tree.overlap(obstacle);queries+=1
                if hits:collisions.append({'frame':frame,'part':part['name'],'obstacles':dict(Counter(owners[j] for _,j in hits))})
                if part['name'].startswith('BonnetRearCheek_Sheet'):
                    hits=tree.overlap(cowlObstacle);rearCowlQueries+=1
                    if hits:collisions.append({'frame':frame,'part':part['name'],'obstacles':dict(Counter(cowlOwners[j] for _,j in hits))})
                movingTrees.append((part,tree))
            for j,(a,ta) in enumerate(movingTrees):
                for b,tb in movingTrees[j+1:]:
                    sameSide=a['name'].endswith('-1')==b['name'].endswith('-1')
                    cheekPair=a['name'].startswith('BonnetRearCheek_Sheet') or b['name'].startswith('BonnetRearCheek_Sheet')
                    if sameSide and not cheekPair:continue
                    if a['name'].startswith('BonnetTop_') and b['name'].startswith('BonnetTop_'):hits=TopAwayFromCentreMate(a).overlap(TopAwayFromCentreMate(b))
                    else:hits=ta.overlap(tb)
                    movingPairQueries+=1
                    if sameSide:sameSideCheekQueries+=1
                    if hits:collisions.append({'frame':frame,'part':a['name'],'obstacles':{('SameSideMoving:' if sameSide else 'OppositeMoving:')+b['name']:len(hits)}})
    for obj,action,slot,useNla,states in saved:
        data=obj.animation_data
        for track,mute in states:track.mute=mute
        data.use_nla=useNla;data.action=action
        if action and slot:data.action_slot=slot
    for obj,matrix in closed.items():obj.matrix_basis=matrix
    scene.frame_set(oldFrame);bpy.context.view_layer.update()
    check(len(tracks)>=6 and not collisions,'Actual GLB bonnet and rear cheeks clear static truck,cowl,and moving skins over121poses',{'queries':queries,'rearCowlQueries':rearCowlQueries,'movingPairQueries':movingPairQueries,'sameSideCheekQueries':sameSideCheekQueries,'collisions':collisions[:12]})
    return {'validPartLabels':True,'trackedSourceParts':len(names),'deliveredParts':len(parts),'staticParts':len(fixed),'movingSkins':len(leaves),'sampledPoses':121,'surfaceQueries':queries,'rearCowlQueries':rearCowlQueries,'movingPairQueries':movingPairQueries,'sameSideCheekQueries':sameSideCheekQueries,'collisions':collisions,'scope':'Actual imported eight skins and six-node BonnetOpen tracks. Original main-leaf fixed mating panels excluded; new rear cheeks additionally tested against all fixed rear scuttle/shoulder surfaces and same-side main leaves. Opposite-side checks retained; only original top-top10mm centre hinge mate excluded.'}

def VerifyImportedDoorRoofClearance(root,scene,check):
    """Replay complete doors against the actual cab and all fixed canvas/bows.

    The free fore lip, eyelets and sewn reinforcement can occupy different
    envelopes from the metal header. They must participate in every rebuild,
    rather than only a temporary expanded acceptance script.
    """
    from mathutils.bvhtree import BVHTree
    from collections import Counter
    names={int(k):v for k,v in root.get('SourcePartNames',{}).items()};moving={};fixed=[];frameNames=set();clothNames=set();bowNames=set();mirrorNames=set()
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attribute=obj.data.attributes.get('_SOURCE_PART_ID')
        if attribute is None:continue
        values=[int(round(v.value)) for v in attribute.data]
        for polygon in obj.data.polygons:
            ids={values[i] for i in polygon.vertices}
            if len(ids)!=1:continue
            partId=next(iter(ids));name=names.get(partId,'')
            isFrame=name.startswith(('Door_WindowUpperFrame','Door_WindowRearFrame','Door_WindowFrontFrame'))
            isDoor=name.startswith(('Door_','DoorPanel_','DoorLower'))
            isCloth=name.startswith('Canvas_');isBow=name.startswith('Cargo_CanvasBow');isMirror=name.startswith('Mirror_')
            isRoof=isCloth or isBow or isMirror or name=='Cabin_CamberedRoof' or name.startswith(('Cabin_RainGutter','Cabin_CowlCollar')) or name in ['Cabin_SideHeaderLeft','Cabin_SideHeaderRight','Cabin_FrontHeader']
            if isCloth:clothNames.add(name)
            if isBow:bowNames.add(name)
            if isMirror:mirrorNames.add(name)
            if isFrame:frameNames.add(name)
            if not(isDoor or isRoof):continue
            part=moving.setdefault((obj.name,partId),{'object':obj,'name':name,'faces':[]}) if isDoor else None
            if isDoor:part['faces'].append(tuple(polygon.vertices))
            else:fixed.append((obj,name,tuple(polygon.vertices)))
    check(len(frameNames)==6 and len(moving)>=6 and bool(fixed),'Actual complete doors, six window frames and roof/header/cowl surfaces are identified',{'movingFrames':len(frameNames),'movingDoorParts':len(moving),'fixedTriangles':len(fixed)})
    expectedCloth={name for name in names.values() if name.startswith('Canvas_')}
    expectedBows={name for name in names.values() if name.startswith('Cargo_CanvasBow')}
    expectedMirrors={name for name in names.values() if name.startswith('Mirror_')}
    check(bool(expectedCloth) and bool(expectedBows) and bool(expectedMirrors) and clothNames==expectedCloth and bowNames==expectedBows and mirrorNames==expectedMirrors,'Every actual canvas surface, support bow and fixed mirror participates in complete-door clearance',{'canvasParts':len(clothNames),'bowParts':len(bowNames),'fixedMirrorParts':len(mirrorNames),'missingCanvas':sorted(expectedCloth-clothNames),'missingBows':sorted(expectedBows-bowNames),'missingMirrors':sorted(expectedMirrors-mirrorNames)})
    saved=[];tracks=[];oldFrame=scene.frame_current;closed={o:o.matrix_basis.copy() for o in root.children_recursive if o.name in ['Door_Left','Door_Right']}
    for obj in root.children_recursive:
        data=obj.animation_data
        if not data:continue
        saved.append((obj,data.action,data.action_slot,data.use_nla,[(t,t.mute) for t in data.nla_tracks]));data.action=None;data.use_nla=True
        for track in data.nla_tracks:
            selected=any(strip.action and 'DoorsOpen' in strip.action.name for strip in track.strips);track.mute=not selected
            if selected:tracks.extend(track.strips)
    check(len(tracks)>=2,'Actual exported DoorsOpen tracks are available for contact replay',len(tracks))
    collisions=[];queries=0
    if len(frameNames)==6 and len(tracks)>=2:
        first=min(t.frame_start for t in tracks);last=max(t.frame_end for t in tracks);scene.frame_set(int(first),subframe=first-int(first));bpy.context.view_layer.update()
        vertices=[];faces=[];owners=[]
        for obj,name,polygon in fixed:
            start=len(vertices);vertices.extend(obj.matrix_world@obj.data.vertices[i].co for i in polygon);faces.append(tuple(range(start,start+len(polygon))));owners.append(name)
        obstacle=BVHTree.FromPolygons(vertices,faces,all_triangles=False)
        for part in moving.values():
            obj=part['object'];used=sorted({i for face in part['faces'] for i in face});remap={old:i for i,old in enumerate(used)};part['vertices']=[obj.data.vertices[i].co.copy() for i in used];part['faces']=[tuple(remap[i] for i in face) for face in part['faces']]
        for i in range(121):
            frame=first+(last-first)*i/120;scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
            for part in moving.values():
                tree=BVHTree.FromPolygons([part['object'].matrix_world@v for v in part['vertices']],part['faces'],all_triangles=False);hits=tree.overlap(obstacle);queries+=1
                if hits:collisions.append({'frame':frame,'part':part['name'],'obstacles':dict(Counter(owners[j] for _,j in hits))})
    for obj,action,slot,useNla,states in saved:
        data=obj.animation_data
        for track,mute in states:track.mute=mute
        data.use_nla=useNla;data.action=action
        if action and slot:data.action_slot=slot
    for obj,matrix in closed.items():obj.matrix_basis=matrix
    scene.frame_set(oldFrame);bpy.context.view_layer.update()
    check(len(tracks)>=2 and len(frameNames)==6 and not collisions,'Actual GLB complete doors clear roof, headers, cowl, all canvas, bows and fixed mirrors over121poses',{'queries':queries,'collisions':collisions[:12]})
    return {'movingFrames':len(frameNames),'movingDoorParts':len(moving),'canvasParts':len(clothNames),'bowParts':len(bowNames),'fixedMirrorParts':len(mirrorNames),'sampledPoses':121,'surfaceQueries':queries,'collisions':collisions,'scope':'Actual imported complete doors and DoorsOpen tracks vs roof, metal headers, fixed cowl collar, all canvas skins, sewn details, eyelets, lashings, support bows and all fixed mirror heads/stalks; intended rubber weatherseal contact excluded'}


def VerifyImportedCanopySupport(root,check):
    """Ray-test actual upper flap edges against the actual main cloth skin.

    Lower edges deliberately hang free. Source IDs identify the cloth surface
    after merging/LOD; a nearby bow or another flap cannot satisfy this check.
    """
    from mathutils.bvhtree import BVHTree
    names={int(k):v for k,v in root.get('SourcePartNames',{}).items()};parts={}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attribute=obj.data.attributes.get('_SOURCE_PART_ID')
        if attribute is None:continue
        values=[int(round(v.value)) for v in attribute.data]
        for face in obj.data.polygons:
            name=names.get(values[face.vertices[0]],'')
            if name!='Canvas_MainCover' and not name.startswith('Canvas_SideClosure'):continue
            part=parts.setdefault(name,{'vertices':[],'faces':[]});offset=len(part['vertices'])
            part['vertices'].extend(obj.matrix_world@obj.data.vertices[i].co for i in face.vertices)
            part['faces'].append(tuple(range(offset,len(part['vertices']))))
    cover=parts.get('Canvas_MainCover');rows=[]
    if cover:
        tree=BVHTree.FromPolygons(cover['vertices'],cover['faces'],all_triangles=False)
        for name,part in parts.items():
            if not name.startswith('Canvas_SideClosure'):continue
            side=-1 if name.startswith('Canvas_SideClosure-1_') else 1;top=max(p.z for p in part['vertices'])
            upper={tuple(round(v,5) for v in p):p for p in part['vertices'] if p.z>top-.012};points=[]
            for point in upper.values():
                hit=tree.ray_cast(point+Vector((side*.02,0,0)),Vector((-side,0,0)),.13)
                points.append({'pointBlender':list(point),'coveredByMainCloth':hit[0] is not None,'distanceToCoverM':hit[3] if hit[0] is not None else None})
            rows.append({'name':name,'upperEdgePoints':len(points),'unsupported':sum(not p['coveredByMainCloth'] for p in points),'points':points})
    check(len(rows)==6 and all(row['upperEdgePoints'] and row['unsupported']==0 for row in rows),'Actual six flap upper edges attach to main cloth after reduction',{'closures':[{k:row[k] for k in ['name','upperEdgePoints','unsupported']} for row in rows]})
    return {'closures':rows,'scope':'Actual imported upper attachment edges and main canvas triangles; lower hanging edges intentionally free','historicalSeamAllowanceProven':False}


def VerifyImportedCowlJunction(root,check):
    from mathutils.bvhtree import BVHTree
    names={int(k):v for k,v in root.get('SourcePartNames',{}).items()};parts={}
    targets={'BonnetTop_1','BonnetTop_-1','Nose_ServiceSaddle1','Nose_ServiceSaddle-1','Cabin_Cowl','Cabin_CowlCollarTop'}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        ids=obj.data.attributes.get('_SOURCE_PART_ID')
        if ids is None:continue
        values=[int(round(v.value)) for v in ids.data]
        for face in obj.data.polygons:
            name=names.get(values[face.vertices[0]],'')
            if name not in targets:continue
            part=parts.setdefault(name,{'vertices':[],'faces':[],'materials':set()});offset=len(part['vertices'])
            part['vertices'].extend(obj.matrix_world@obj.data.vertices[i].co for i in face.vertices);part['faces'].append(tuple(range(offset,len(part['vertices']))))
            part['materials'].add(obj.data.materials[face.material_index].name)
    crowns={}
    for name in ['BonnetTop_1','BonnetTop_-1']:
        points=parts.get(name,{}).get('vertices',[]);fixed=parts.get('Nose_ServiceSaddle'+name.removeprefix('BonnetTop_'),{}).get('vertices',[])
        rear=max((p.z for p in points if p.y<1.015 and abs(p.x)<.025),default=-1);front=max((p.z for p in points+fixed if p.y>2.335 and abs(p.x)<.025),default=-1);crowns[name]={'rearM':rear,'frontM':front}
    expectedRear=float(root['BonnetRearCrownM']);expectedFront=float(root['BonnetFrontCrownM'])
    check(all(abs(c['rearM']-expectedRear)<.002 and abs(c['frontM']-expectedFront)<.002 for c in crowns.values()),'Actual complete closed hood crowns match declared primary-front profile',{'crowns':crowns,'expectedRearM':expectedRear,'expectedFrontM':expectedFront,'includesFixedServiceSaddle':True})
    axis=Vector(root['RadiatorServiceAxis']);station=axis.dot(Vector((0,root['RadiatorServiceStationY'],root['RadiatorServiceStationZ'])))-float(root['RadiatorServiceGapM'])/2
    movingFront={name:max((axis.dot(p) for p in parts[name]['vertices'] if abs(p.x)<.025),default=-1) for name in ['BonnetTop_1','BonnetTop_-1']}
    check(all(abs(v-station)<.001 for v in movingFront.values()),'Actual moving bonnet centre-front stops at the declared service station',{'actualAxialPositionsM':movingFront,'expectedAxialPositionM':station,'toleranceM':.001})
    bulkhead=parts.get('Cabin_Cowl',{});materials=list(bulkhead.get('materials',[]))
    check(bool(materials) and all(m.startswith('Material_IsuzuChassis') for m in materials),'Actual internal engine bulkhead uses chassis coating',materials)
    collar=parts.get('Cabin_CowlCollarTop');columns=[]
    if collar:
        tree=BVHTree.FromPolygons(collar['vertices'],collar['faces'],all_triangles=False);y=float(root['CowlCollarRearY'])+.0001;z=float(root['CowlCollarRearZ'])
        for x in [-.68,-.51,-.34,-.17,0,.17,.34,.51,.68]:
            hit=tree.ray_cast(Vector((x,y,2.0)),Vector((0,0,-1)),1.0);height=hit[0].z if hit[0] is not None else None;columns.append({'x':x,'nativeY':y,'collarTopM':height,'distanceToSealBottomM':None if height is None else height-z})
    check(len(columns)==9 and all(p['collarTopM'] is not None and abs(p['distanceToSealBottomM'])<.002 for p in columns),'Actual fixed cowl collar closes all nine lower-seal columns',columns)
    return {'crowns':crowns,'internalBulkheadMaterials':materials,'sealColumns':columns,'historicalCowlDimensionsProven':False}


def VerifyImportedEngineAssembly(root,check):
    from mathutils.bvhtree import BVHTree
    names={int(k):v for k,v in root.get('SourcePartNames',{}).items()};parts={}
    wanted={'Engine_Dynamo','Engine_DynamoShaft','Engine_DynamoPulley','Engine_FanBelt','Engine_CoolantHose'}|{'Engine_FanBlade'+str(i) for i in range(6)}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        ids=obj.data.attributes.get('_SOURCE_PART_ID')
        if ids is None:continue
        values=[int(round(v.value)) for v in ids.data]
        for face in obj.data.polygons:
            name=names.get(values[face.vertices[0]],'')
            if name not in wanted:continue
            part=parts.setdefault(name,{'vertices':[],'faces':[]});offset=len(part['vertices']);part['vertices'].extend(obj.matrix_world@obj.data.vertices[i].co for i in face.vertices);part['faces'].append(tuple(range(offset,len(part['vertices']))))
    blades=[];trees=[]
    for i in range(6):
        part=parts.get('Engine_FanBlade'+str(i));angle=i*math.pi/3
        radial=[p.x*math.sin(angle)+(p.z-1.17)*math.cos(angle) for p in part['vertices']] if part else []
        blades.append({'name':'Engine_FanBlade'+str(i),'minimumRadiusM':min(radial,default=-1),'maximumRadiusM':max(radial,default=-1)})
        if part:trees.append(BVHTree.FromPolygons(part['vertices'],part['faces'],all_triangles=False))
    overlapPairs=[]
    for i,a in enumerate(trees):
        for j,b in enumerate(trees[i+1:],i+1):
            if a.overlap(b):overlapPairs.append([i,j])
    fanParts=[name for name in names.values() if name.startswith('Engine_FanBlade')]
    check(len(trees)==6 and len(fanParts)==6 and root.get('EngineFanBladeCount')==6 and all(b['minimumRadiusM']>.030 and b['maximumRadiusM']<.216 for b in blades) and not overlapPairs,'Actual six factory-photo fan paddles are radial, separate and not duplicated full bars',{'blades':blades,'overlapPairs':overlapPairs})
    spans={name:[min((p.y for p in parts.get(name,{}).get('vertices',[])),default=1e9),max((p.y for p in parts.get(name,{}).get('vertices',[])),default=-1e9)] for name in ['Engine_Dynamo','Engine_DynamoShaft','Engine_DynamoPulley']}
    body,shaft,pulley=(spans[n] for n in ['Engine_Dynamo','Engine_DynamoShaft','Engine_DynamoPulley'])
    check(shaft[0]<=body[1] and shaft[1]>=pulley[0] and shaft[0]<shaft[1],'Actual dynamo shaft bridges housing to pulley',spans)
    belt=parts.get('Engine_FanBelt');boundary=0
    if belt:
        # Weld coincident exported loop vertices, then every edge of the closed
        # belt tube must have exactly two incident faces.
        from collections import Counter
        vertexIds={};indices=[]
        for p in belt['vertices']:
            key=tuple(round(v,6) for v in p);vertexIds.setdefault(key,len(vertexIds));indices.append(vertexIds[key])
        edges=Counter(tuple(sorted((indices[f[j]],indices[f[(j+1)%len(f)]]))) for f in belt['faces'] for j in range(len(f)))
        boundary=sum(count!=2 for count in edges.values())
    check(belt is not None and boundary==0,'Actual fan belt is a closed two-wrap loop',{'nonManifoldEdges':boundary})
    fan=[p for i in range(6) for p in parts.get('Engine_FanBlade'+str(i),{}).get('vertices',[])];hose=parts.get('Engine_CoolantHose');distances=[]
    fanRadius=max((math.hypot(p.x,p.z-1.17) for p in fan),default=0);minimumY=min((p.y for p in fan),default=0);maximumY=max((p.y for p in fan),default=0)
    def Clip(poly,bound,greater):
        result=[]
        for a,b in zip(poly,poly[1:]+poly[:1]):
            ia=a.y>=bound if greater else a.y<=bound;ib=b.y>=bound if greater else b.y<=bound
            if ia:result.append(a)
            if ia!=ib:result.append(a+(b-a)*((bound-a.y)/(b.y-a.y)))
        return result
    if hose:
        for face in hose['faces']:
            poly=Clip(Clip([hose['vertices'][i] for i in face],minimumY,True),maximumY,False)
            if len(poly)<3:continue
            q=[Vector((p.x,p.z-1.17)) for p in poly];best=float('inf');area=0;positive=False;negative=False
            for a,b in zip(q,q[1:]+q[:1]):
                edge=b-a;t=max(0,min(1,-a.dot(edge)/edge.length_squared)) if edge.length_squared else 0;best=min(best,(a+edge*t).length);cross=a.x*b.y-a.y*b.x;area+=cross;positive|=cross>1e-12;negative|=cross< -1e-12
            distances.append(0 if abs(area)>1e-10 and not(positive and negative) else best)
    gap=min(distances,default=-1)-fanRadius
    check(bool(distances) and gap>.003,'Actual coolant hose clears complete360degree fan envelope',{'fanRadiusM':fanRadius,'minimumSweptGapM':gap,'clippedHosePolygons':len(distances)})
    return {'blades':blades,'overlappingBladePairs':overlapPairs,'dynamoSpansNativeY':spans,'fanBeltNonManifoldEdges':boundary,'coolantFanSweptGapM':gap,'historicalEngineDimensionsProven':False}



def VerifyImportedCanopyBowClearance(root,check):
    """All real imported main/front-cloth triangles against all support bows."""
    from mathutils.bvhtree import BVHTree
    names={int(k):v for k,v in root.get('SourcePartNames',{}).items()};parts={}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attribute=obj.data.attributes.get('_SOURCE_PART_ID')
        if attribute is None:continue
        values=[int(round(v.value)) for v in attribute.data]
        for face in obj.data.polygons:
            name=names.get(values[face.vertices[0]],'')
            clothPart=name=='Canvas_MainCover' or name.startswith(('Canvas_FrontHeaderValance','Canvas_FrontRolledCurtain','Canvas_FrontRollTie','Canvas_FrontCornerFold'))
            if not clothPart and not name.startswith('Cargo_CanvasBow'):continue
            part=parts.setdefault(name,{'vertices':[],'faces':[]});offset=len(part['vertices'])
            part['vertices'].extend(obj.matrix_world@obj.data.vertices[i].co for i in face.vertices)
            part['faces'].append(tuple(range(offset,len(part['vertices']))))
    clothParts=[(n,p) for n,p in parts.items() if n.startswith('Canvas_')];cloth={'vertices':[],'faces':[]}
    for _,part in clothParts:
        offset=len(cloth['vertices']);cloth['vertices'].extend(part['vertices']);cloth['faces'].extend(tuple(offset+i for i in face) for face in part['faces'])
    bows=[(n,p) for n,p in parts.items() if n.startswith('Cargo_CanvasBow')];collisions=[]
    if cloth:
        skin=BVHTree.FromPolygons(cloth['vertices'],cloth['faces'],all_triangles=False)
        for name,part in bows:
            tree=BVHTree.FromPolygons(part['vertices'],part['faces'],all_triangles=False);hits=skin.overlap(tree)
            if hits:collisions.append({'bow':name,'surfaceFacePairs':len(hits)})
    result={'clothParts':[n for n,_ in clothParts],'clothTriangles':len(cloth['faces']),'supportBows':len(bows),'bowTriangles':sum(len(p['faces']) for _,p in bows),'collisions':collisions,'scope':'All actual imported main cloth, valance, rolled curtain, roll ties, corner folds and support-bow surfaces; no contact or height region excluded'}
    check(len(clothParts)==8 and len(bows)==4 and not collisions,'Actual main and front canopy cloth clear all four real support bows',result)
    return result


def VerifyImportedRearFenderContacts(root,check):
    """Check the delivered guard triangles against the complete cargo members."""
    from mathutils.bvhtree import BVHTree
    names={int(k):v for k,v in root.get('SourcePartNames',{}).items()};parts={}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attribute=obj.data.attributes.get('_SOURCE_PART_ID')
        if attribute is None:continue
        labels=[names.get(int(round(value.value)),'') for value in attribute.data]
        for poly in obj.data.polygons:
            label=labels[poly.vertices[0]]
            guard=label.startswith(('RearFender_','RearMudflap_'))
            cargo=label.startswith(('Cargo_','Tailgate_')) and not label.startswith('Cargo_CanvasBow')
            if not (guard or cargo):continue
            part=parts.setdefault(label,{'vertices':[],'faces':[],'guard':guard})
            start=len(part['vertices']);part['vertices'].extend(obj.matrix_world@obj.data.vertices[i].co for i in poly.vertices)
            part['faces'].append(tuple(range(start,len(part['vertices']))))
    trees={name:BVHTree.FromPolygons(p['vertices'],p['faces'],all_triangles=False) for name,p in parts.items()}
    guards=[name for name,p in parts.items() if p['guard']];cargo=[name for name,p in parts.items() if not p['guard']]
    collisions=[]
    for guard in guards:
        for member in cargo:
            overlap=trees[guard].overlap(trees[member])
            if overlap:collisions.append({'guard':guard,'cargo':member,'facePairs':len(overlap)})
    crowns={name:max(v.z for v in parts[name]['vertices']) for name in guards if name.startswith('RearFender_RolledLip')}
    check(len(guards)==6 and len(cargo)>=90,'Actual six rear guard/flap parts and complete cargo members survive export',{'guards':guards,'cargoParts':len(cargo)})
    check(not collisions,'Actual raised rear guard and flap surfaces clear cargo wood and mounting pieces',{'surfaceQueries':len(guards)*len(cargo),'collisions':collisions})
    check(len(crowns)==2 and all(1.05<z<1.08 for z in crowns.values()),'Actual two rear rolled crowns retain the photo-derived height',crowns)
    return {'guardParts':len(guards),'cargoParts':len(cargo),'surfaceQueries':len(guards)*len(cargo),'collisions':collisions,'crownHeightsM':crowns,'scope':'Actual reimported game triangles and source-part IDs. Hidden cutbacks are reconstruction; no cargo member or other visible vehicle part is removed.'}


def VerifyImportedClothCargo(root,check):
    """Recheck the real lower cloth surfaces after every packaged export."""
    from mathutils.bvhtree import BVHTree
    names={int(k):v for k,v in root.get('SourcePartNames',{}).items()};parts={}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attr=obj.data.attributes.get('_SOURCE_PART_ID')
        if attr is None:continue
        for poly in obj.data.polygons:
            name=names.get(int(round(attr.data[poly.vertices[0]].value)),'')
            cloth=name.startswith(('Canvas_MainCover','Canvas_LowerBoundHem','Canvas_ReinforcedSeam','Canvas_TieReinforcement','Canvas_FrontCornerFold'))
            cargo=name.startswith(('Cargo_','Tailgate_')) and not name.startswith('Cargo_CanvasBow')
            if not (cloth or cargo):continue
            part=parts.setdefault(name,{'vertices':[],'faces':[],'cloth':cloth});start=len(part['vertices'])
            part['vertices'].extend(obj.matrix_world@obj.data.vertices[i].co for i in poly.vertices)
            part['faces'].append(tuple(range(start,len(part['vertices']))))
    trees={name:BVHTree.FromPolygons(p['vertices'],p['faces'],all_triangles=False) for name,p in parts.items()}
    cloth=[n for n,p in parts.items() if p['cloth']];cargo=[n for n,p in parts.items() if not p['cloth']];collisions=[]
    for a in cloth:
        for b in cargo:
            hits=trees[a].overlap(trees[b])
            if hits:collisions.append({'cloth':a,'cargo':b,'facePairs':len(hits)})
    report={'clothParts':len(cloth),'cargoParts':len(cargo),'surfaceQueries':len(cloth)*len(cargo),'collisions':collisions,'scope':'Actual main cloth, binding hem, sewn reinforcements and front corner folds vs cargo. Eyelets and lashings intentionally attach to mounting pieces; cloth queries have no contact exception.'}
    check(len(cloth)>=21 and len(cargo)>=100 and not collisions,'Actual lower cloth and sewn surfaces clear the full cargo structure',report)
    return report


def VerifyImportedFrontBumper(root,check):
    """Measure the delivered blade and its actual mounting/eye/chip geometry."""
    from mathutils.bvhtree import BVHTree
    names={int(k):v for k,v in root.get('SourcePartNames',{}).items()};parts={}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attr=obj.data.attributes.get('_SOURCE_PART_ID')
        if attr is None:continue
        for face in obj.data.polygons:
            name=names.get(int(round(attr.data[face.vertices[0]].value)),'')
            if not (name.startswith(('Bumper_','Front_TowEye','Wear_Bumper')) or name in ['Chassis_Rail-1','Chassis_Rail1']):continue
            p=parts.setdefault(name,{'vertices':[],'faces':[]});offset=len(p['vertices'])
            p['vertices'].extend(obj.matrix_world@obj.data.vertices[i].co for i in face.vertices);p['faces'].append(tuple(range(offset,len(p['vertices']))))
    def Bounds(name):
        p=parts[name]['vertices'];return [[min(v[k] for v in p) for k in range(3)],[max(v[k] for v in p) for k in range(3)]]
    blade=parts['Bumper_FrontBlade'];box=Bounds('Bumper_FrontBlade');height=box[1][2]-box[0][2];centre=(box[0][2]+box[1][2])/2
    expectedHeight=float(root['FrontBumperHeightM']);expectedCentre=float(root['FrontBumperCentreZM']);expectedWidth=float(root['FrontBumperWidthM'])
    check(abs(height-expectedHeight)<.002 and abs(centre-expectedCentre)<.002 and abs(box[1][0]-box[0][0]-expectedWidth)<.003,'Actual front blade retains declared primary-photo width,height and centre',{'heightM':height,'centreM':centre,'widthM':box[1][0]-box[0][0],'expectedHeightM':expectedHeight,'expectedCentreM':expectedCentre,'expectedWidthM':expectedWidth})
    def Overlap(a,b):return [min(a[1][k],b[1][k])-max(a[0][k],b[0][k]) for k in range(3)]
    contacts=[];valid=True
    for side in [-1,1]:
        mount=Bounds('Bumper_Mount'+str(side));rail=Bounds('Chassis_Rail'+str(side))
        a=Overlap(mount,box);b=Overlap(mount,rail);eye=parts['Front_TowEye'+str(side)]['vertices']
        connected=any(all(box[0][k]+1e-5<v[k]<box[1][k]-1e-5 for k in range(3)) for v in eye)
        valid=valid and min(a)>0 and min(b)>0 and connected
        contacts.append({'side':side,'mountBladeOverlapM':a,'mountRailOverlapM':b,'eyeEntersBlade':connected})
    rivets=[name for name in parts if name.startswith('Bumper_Rivet')];gaps=[Bounds(name)[0][1]-box[1][1] for name in rivets]
    valid=valid and len(rivets)==4 and all(-.001<g<.0005 for g in gaps)
    check(valid,'Actual front blade stays attached to frame mounts,rivets and both tow eyes',{'contacts':contacts,'rivetBackGapsM':gaps})
    tree=BVHTree.FromPolygons(blade['vertices'],blade['faces'],all_triangles=False);distances=[]
    for name,p in parts.items():
        if name.startswith('Wear_Bumper'):
            for v in p['vertices']:
                nearest=tree.find_nearest(v)
                distances.append(nearest[3] if nearest[0] is not None else float('inf'))
    maximum=max(distances,default=float('inf'))
    check(len(distances)>=30 and maximum<.001,'Actual bumper contact chips remain within1mm of the delivered blade',{'samples':len(distances),'maximumSurfaceDistanceM':maximum})
    return {'heightM':height,'centreM':centre,'mountContacts':contacts,'rivetBackGapsM':gaps,'chipSamples':len(distances),'maximumChipSurfaceDistanceM':maximum}


def VerifyImportedWearSurfaces(root,check):
    """Measure actual wear triangles against their real final support meshes."""
    from mathutils.bvhtree import BVHTree
    groups={
        'DoorContact':(('Wear_DoorContact',),('DoorPanel_','DoorLowerPressing_','Door_Border'),0,10),
        'RunningBoard':(('Wear_RunningBoard',),('RunningBoard_',),2,16),
        'Bumper':(('Wear_Bumper',),('Bumper_FrontBlade',),1,10),
        'RearHinge':(('Oxide_RearHinge',),('Tailgate_Hinge',),1,8),
        'BonnetSeam':(('Oxide_BonnetSeam',),('BonnetSide_Sheet',),0,8),
    }
    names={int(k):v for k,v in root['SourcePartNames'].items()};parts={}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        mesh=obj.data;attr=mesh.attributes.get('_SOURCE_PART_ID')
        if attr is None:continue
        mesh.calc_loop_triangles()
        for tri in mesh.loop_triangles:
            name=names[int(round(attr.data[tri.vertices[0]].value))]
            if any(name.startswith(patch+support) for patch,support,axis,count in groups.values()):parts.setdefault(name,[]).append([obj.matrix_world@mesh.vertices[i].co for i in tri.vertices])
    rows=[]
    for group,(prefix,support,axis,count) in groups.items():
        faces=[tri for name,triangles in parts.items() if name.startswith(support) for tri in triangles]
        tree=BVHTree.FromPolygons([p for tri in faces for p in tri],[tuple(range(i*3,i*3+3)) for i in range(len(faces))],all_triangles=True);patches=[]
        for name,triangles in parts.items():
            if not name.startswith(prefix):continue
            points=list({tuple(round(v,7) for v in p):p for tri in triangles for p in tri}.values())+[sum(tri,Vector())/3 for tri in triangles]
            outward=Vector((0,0,0));outward[axis]=(1 if points[0].x>0 else -1) if axis==0 else (-1 if group=='RearHinge' else 1);samples=[]
            for p in points:
                hit=tree.ray_cast(p+outward*.08,-outward,.16);gap=hit[3]-.08 if hit[0] is not None else None;samples.append({'pointBlenderM':list(p),'signedGapM':gap})
            gaps=[sample['signedGapM'] for sample in samples if sample['signedGapM'] is not None];missing=len(samples)-len(gaps)
            patches.append({'name':name,'samples':samples,'missingSamples':missing,'minimumSignedGapM':min(gaps) if gaps else None,'maximumSignedGapM':max(gaps) if gaps else None,'passed':not missing and all(.00005<=gap<=.0006 for gap in gaps)})
        row={'group':group,'patches':patches,'expectedPatches':count,'passed':len(patches)==count and all(patch['passed'] for patch in patches)}
        check(row['passed'],'Actual '+group+' wear/oxide surfaces retain50..600micrometre support separation',row);rows.append(row)
    return {'groups':rows,'patches':sum(len(row['patches']) for row in rows),'passed':all(row['passed'] for row in rows),'scope':'Actual imported vertices and triangle centroids,outward-axis support rays. Rendering/construction offset only; neither exact historical corrosion placement nor full material/reference acceptance.'}


def MeasureLegacyClosureContours(root):
    """Retain auxiliary assembly-photo metrics as explicit diagnostics.

    These original thresholds are retained; this is not the user's primary
    front-quarter appearance target or a whole-reference acceptance claim.
    """
    names={int(k):v for k,v in root.get('SourcePartNames',{}).items()}
    position=Vector(root['ReferenceCameraLocationBlender']);target=Vector(root['ReferenceCameraTargetBlender'])
    forward=(target-position).normalized();right=forward.cross(Vector((0,0,1))).normalized();up=right.cross(forward)
    roll=math.radians(root['ReferenceCameraRollDegrees']);r=math.cos(roll)*right+math.sin(roll)*up;u=-math.sin(roll)*right+math.cos(roll)*up
    focal=root['ReferenceCameraLensMm']*600/36;principal=list(root['ReferencePrincipalPointPixels'])
    def Pixel(point):
        delta=point-position;depth=delta.dot(forward)
        return (principal[0]+focal*delta.dot(r)/depth,principal[1]-focal*delta.dot(u)/depth)
    samples={1:[(161,154),(176,154),(181,154),(186,154),(191,155)],2:[(107,158),(112,157),(117,157),(122,157),(127,157),(132,155)]}
    triangles={index:[] for index in samples}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attr=obj.data.attributes.get('_SOURCE_PART_ID')
        if attr is None:continue
        obj.data.calc_loop_triangles()
        for tri in obj.data.loop_triangles:
            name=names.get(int(round(attr.data[tri.vertices[0]].value)),'')
            for index in samples:
                if name=='Canvas_SideClosure1_'+str(index):triangles[index].append([Pixel(obj.matrix_world@obj.data.vertices[i].co) for i in tri.vertices])
    results=[]
    for index,observed in samples.items():
        rows=[]
        for x,y in observed:
            values=[]
            for triangle in triangles[index]:
                for k in range(3):
                    a,b=triangle[k],triangle[(k+1)%3]
                    if min(a[0],b[0])<=x<=max(a[0],b[0]) and abs(b[0]-a[0])>1e-8:values.append(a[1]+(x-a[0])/(b[0]-a[0])*(b[1]-a[1]))
            actual=max(values) if values else None;rows.append({'x':x,'observedY':y,'actualY':actual,'errorPx':actual-y if actual is not None else None})
        complete=all(row['errorPx'] is not None for row in rows);rms=math.sqrt(sum(row['errorPx']**2 for row in rows)/len(rows)) if complete else None;maximum=max(abs(row['errorPx']) for row in rows) if complete else None
        result={'index':index,'samples':len(rows),'missingProjectionColumns':[row['x'] for row in rows if row['actualY'] is None],'rmsPx':rms,'maximumPx':maximum,'rows':rows}
        result['legacyWouldPass']=bool(triangles[index]) and complete and rms<2 and maximum<3;results.append(result)
    return {'closures':results,'sourcePhoto':'Reference_Production.jpg','role':'Auxiliary unchanged-panel regression only; not primary appearance acceptance','scope':'Actual imported source-part triangles and11legacy lower-hem samples; unchanged2pxRMS/3pxmaximum. Current primary appearance and unseen tailoring remain separately reviewed.'}


def VerifyImportedClosureContours(root,check):
    """Check actual near panel/hem outlines in the selected primary camera.

    Legacy middle/rear panels are now intentionally repositioned. Keep their
    old camera/threshold results visible, while gating the new primary target.
    """
    recipe=json.loads((FILE.parent/'Data_PrimaryReferenceFit.json').read_text(encoding='utf8'))['primaryCanvasClosures'];names={int(k):v for k,v in root['SourcePartNames'].items()}
    position=Vector(root['PrimaryCameraLocationBlender']);forward=(Vector(root['PrimaryCameraTargetBlender'])-position).normalized();r0=forward.cross(Vector((0,0,1))).normalized();u0=r0.cross(forward);angle=math.radians(root['PrimaryCameraRollDegrees']);r=math.cos(angle)*r0+math.sin(angle)*u0;u=-math.sin(angle)*r0+math.cos(angle)*u0;focal=root['PrimaryCameraLensMm']*600/36;pp=root['PrimaryCameraPrincipalPointPixels'];points={i:[] for i in range(3)}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attr=obj.data.attributes.get('_SOURCE_PART_ID')
        if attr is None:continue
        for vertex,value in zip(obj.data.vertices,attr.data):
            name=names[int(round(value.value))]
            for index in points:
                if name in ['Canvas_SideClosure1_'+str(index),'Canvas_ClosureLowerHem1_'+str(index)] or name.startswith('Canvas_ClosureSideHem1_'+str(index)+'_'):
                    d=obj.matrix_world@vertex.co-position;points[index].append((pp[0]+focal*d.dot(r)/d.dot(forward),pp[1]-focal*d.dot(u)/d.dot(forward)))
    rows=[]
    for panel in recipe['nearPanels']:
        index=panel['index'];p=points[index];actual=[min(v[0] for v in p),min(v[1] for v in p),max(v[0] for v in p),max(v[1] for v in p)] if p else [1e6]*4;errors=[a-b for a,b in zip(actual,panel['boundsPixels'])];rms=math.sqrt(sum(v*v for v in errors)/4);maximum=max(map(abs,errors));row={'index':index,'expectedBoundsPixels':panel['boundsPixels'],'actualBoundsPixels':actual,'rmsPx':rms,'maximumPx':maximum,'usedSourceParts':4}
        check(bool(p) and rms<panel['maximumRmsPx'] and maximum<panel['maximumCoordinateErrorPx'],'Actual primary-photo closure '+str(index)+' outline retains2pxRMS/3pxmaximum',row);rows.append(row)
    return {'closures':rows,'sourcePhoto':recipe['source'],'role':'Primary visible outline hypothesis,not calibrated tailoring or whole-reference acceptance','scope':'Actual near skins and all three hems projected in the primary camera; four bound coordinates per panel. Width,height and hidden seam identity remain inferred.','legacyAssemblyRegression':MeasureLegacyClosureContours(root),'historicalTailoringMeasured':False}


def VerifyImportedClosureMainClearance(root,check):
    """All six full flap skins against the main cloth, without contact exclusions."""
    from mathutils.bvhtree import BVHTree
    names={int(k):v for k,v in root.get('SourcePartNames',{}).items()};parts={}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attr=obj.data.attributes.get('_SOURCE_PART_ID')
        if attr is None:continue
        for face in obj.data.polygons:
            name=names.get(int(round(attr.data[face.vertices[0]].value)),'')
            if name!='Canvas_MainCover' and not name.startswith('Canvas_SideClosure'):continue
            part=parts.setdefault(name,{'vertices':[],'faces':[]});offset=len(part['vertices'])
            part['vertices'].extend(obj.matrix_world@obj.data.vertices[i].co for i in face.vertices);part['faces'].append(tuple(range(offset,len(part['vertices']))))
    main=parts['Canvas_MainCover'];tree=BVHTree.FromPolygons(main['vertices'],main['faces'],all_triangles=False);collisions=[];flaps=0
    for name,part in parts.items():
        if not name.startswith('Canvas_SideClosure'):continue
        flaps+=1;overlap=tree.overlap(BVHTree.FromPolygons(part['vertices'],part['faces'],all_triangles=False))
        if overlap:collisions.append({'closure':name,'surfaceFacePairs':len(overlap)})
    result={'closures':flaps,'mainTriangles':len(main['faces']),'collisions':collisions,'scope':'All six actual imported closure skins vs full main cloth surface; no seam, height or contact area excluded. Thin-hem clearances are reconstruction.'}
    check(flaps==6 and not collisions,'All six full cloth closure skins clear the main cover',result)
    return result


def VerifyImportedSpareMount(skins,carrier,centre,check):
    """Measure the real reversed rim and coupled hardware at the closed pose."""
    from mathutils.bvhtree import BVHTree
    parts={p['name']:{'points':[p['object'].matrix_world@v for v in p['vertices']],'faces':p['faces']} for p in skins+carrier}
    trees={name:BVHTree.FromPolygons(p['points'],p['faces'],all_triangles=False) for name,p in parts.items()};plate=parts['SpareWheel_PerforatedDisc']['points'];offset=sum(p.x for p in plate)/len(plate)-centre.x
    check(-.075<offset<-.055,'Actual spare pressing is recessed on the inward side of its unchanged tyre centre',{'meanAxialOffsetM':offset,'historicalDepthProven':False})
    collisions=[]
    for a in [n for n in parts if n.startswith('SpareWheel_')]:
        for b in [n for n in parts if n.startswith('SpareCarrier_')]:
            if (a,b)==('SpareWheel_InnerDisc','SpareCarrier_LockingBar'):continue
            hits=trees[a].overlap(trees[b])
            if hits:collisions.append({'wheel':a,'carrier':b,'pairs':len(hits)})
    check(not collisions,'Actual spare and carrier avoid unintended surface penetration',{'collisions':collisions,'contactExclusion':'InnerDisc/LockingBar,measured separately at actual back feet'})
    bounds={name:[min(p.x for p in part['points']),max(p.x for p in part['points'])] for name,part in parts.items() if name.startswith('SpareCarrier_')};connections=[]
    for a,b,minimum in [('Backplate','Spindle',.001),('Spindle','CentreSeat',.001),('CentreSeat','LockingBar',.001),('LockingBar','LockingNut',-.000001)]:
        x,y=bounds['SpareCarrier_'+a],bounds['SpareCarrier_'+b];overlap=min(x[1],y[1])-max(x[0],y[0]);connections.append({'from':a,'to':b,'axialOverlapM':overlap,'passed':overlap>=minimum})
    check(all(c['passed'] for c in connections),'Actual carrier spindle,pad,bar and nut retain a continuous axial connection',connections)
    bar=parts['SpareCarrier_LockingBar']['points'];back=min(p.x for p in bar);feet=[p for p in bar if abs(p.x-back)<1e-6];gaps=[]
    for p in feet:
        hit=trees['SpareWheel_InnerDisc'].ray_cast(Vector((1.2,p.y,p.z)),Vector((-1,0,0)),.6)[0]
        if hit is not None:gaps.append(back-hit.x)
    support={'samples':len(gaps),'minimumGapM':min(gaps,default=-1),'maximumGapM':max(gaps,default=1)}
    check(len(gaps)>=4 and support['minimumGapM']>-1e-6 and support['maximumGapM']<.001,'Actual locking-bar back feet contact the reversed collar within1mm',support)
    valid=-.075<offset<-.055 and not collisions and all(c['passed'] for c in connections) and len(gaps)>=4 and support['minimumGapM']>-1e-6 and support['maximumGapM']<.001
    return {'passed':bool(valid),'meanPressingAxialOffsetM':offset,'unintendedIntersections':collisions,'connections':connections,'barSupport':support,'historicalHardwareProven':False}


def VerifyImportedSideSpare(root,scene,check):
    """Validate the delivered spare, its mount and its actual door animation."""
    from mathutils.bvhtree import BVHTree
    names={int(k):v for k,v in root['SourcePartNames'].items()};parts={}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attr=obj.data.attributes.get('_SOURCE_PART_ID')
        if attr is None:continue
        ids=[int(round(v.value)) for v in attr.data]
        for face in obj.data.polygons:
            partId=ids[face.vertices[0]];name=names[partId]
            part=parts.setdefault((obj.name,name),{'object':obj,'name':name,'faces':[]});part['faces'].append(tuple(face.vertices))
    for part in parts.values():
        obj=part['object'];used=sorted({i for f in part['faces'] for i in f});remap={old:i for i,old in enumerate(used)}
        part['vertices']=[obj.data.vertices[i].co.copy() for i in used];part['faces']=[tuple(remap[i] for i in f) for f in part['faces']]
        ancestor=obj.parent;part['door']=False
        while ancestor:
            if ancestor.name in ['Door_Right','Door_Left']:part['door']=True;break
            ancestor=ancestor.parent
    def Obstacle(values):
        vertices=[];faces=[];owners=[]
        for p in values:
            offset=len(vertices);vertices.extend(p['object'].matrix_world@v for v in p['vertices']);faces.extend(tuple(offset+i for i in f) for f in p['faces']);owners.extend([p['name']]*len(p['faces']))
        return BVHTree.FromPolygons(vertices,faces,all_triangles=False),owners
    spare=bpy.data.objects.get('SpareWheel');skins=[p for p in parts.values() if p['name'].startswith('SpareWheel_')];carrier=[p for p in parts.values() if p['name'].startswith('SpareCarrier_')]
    valid=spare is not None and spare.parent.name=='Door_Right' and not spare.get('MotionAxisBlender') and not spare.animation_data and len(skins)==9 and len(carrier)==9
    check(valid,'Actual side spare has tyre, unhubbed rim and inferred carrier on door; no seventh road-wheel rolling node',{'spareParts':len(skins),'carrierParts':len(carrier),'parent':spare.parent.name if spare else None})
    if not valid:return {'passed':False,'collisions':[]}
    saved=[];strips=[];oldFrame=scene.frame_current
    for obj in root.children_recursive:
        if not obj.animation_data:continue
        d=obj.animation_data;saved.append((obj,d.action,d.action_slot,d.use_nla,[(t,t.mute) for t in d.nla_tracks]));d.action=None;d.use_nla=True
        for track in d.nla_tracks:
            selected=any(strip.action and 'DoorsOpen' in strip.action.name for strip in track.strips);track.mute=not selected
            if selected:strips.extend(track.strips)
    check(bool(strips),'Actual exported DoorsOpen tracks are available for side-spare sweep')
    collisions=[];queries=0;dimensions={};mountPins=[];mount={}
    if strips:
        first=min(t.frame_start for t in strips);last=max(t.frame_end for t in strips);scene.frame_set(int(first),subframe=first-int(first));bpy.context.view_layer.update()
        centre=spare.matrix_world.translation.copy();tyre=[p['object'].matrix_world@v for p in skins if p['name'].endswith(('Tyre','TreadLugs')) for v in p['vertices']]
        dimensions={'centreBlenderM':list(centre),'maximumTyreRadiusM':max(math.hypot(v.y-centre.y,v.z-centre.z) for v in tyre),'tyreWidthM':max(v.x for v in tyre)-min(v.x for v in tyre)}
        check(abs(dimensions['maximumTyreRadiusM']-.4318)<.002 and abs(dimensions['tyreWidthM']-.1524)<.012,'Actual spare retains factory34x6 nominal size',dimensions)
        panel=next(p for p in parts.values() if p['name']=='DoorPanel_Right');panelPoints=[panel['object'].matrix_world@v for v in panel['vertices']]
        for p in carrier:
            if not p['name'].startswith('SpareCarrier_BackplateRivet'):continue
            points=[p['object'].matrix_world@v for v in p['vertices']]
            overlap=min(max(v.x for v in points),max(v.x for v in panelPoints))-max(min(v.x for v in points),min(v.x for v in panelPoints))
            mountPins.append({'name':p['name'],'doorSkinAxialOverlapM':overlap})
        check(len(mountPins)==4 and all(p['doorSkinAxialOverlapM']>.001 for p in mountPins),'Four carrier fixing pins reach the actual moving door skin',mountPins)
        mount=VerifyImportedSpareMount(skins,carrier,centre,check)
        fixed,owners=Obstacle([p for p in parts.values() if not p['door']])
        for sample in range(121):
            frame=first+(last-first)*sample/120;scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
            ownDoor,doorNames=Obstacle([p for p in parts.values() if p['door'] and not p['name'].startswith(('SpareWheel_','SpareCarrier_'))])
            for p in skins+carrier:
                tree=BVHTree.FromPolygons([p['object'].matrix_world@v for v in p['vertices']],p['faces'],all_triangles=False);hits=tree.overlap(fixed);queries+=1
                if hits:collisions.append({'phase':sample/120,'part':p['name'],'fixed':sorted({owners[j] for i,j in hits})})
                if p in skins:
                    hits=tree.overlap(ownDoor);queries+=1
                    if hits:collisions.append({'phase':sample/120,'part':p['name'],'movingDoor':sorted({doorNames[j] for i,j in hits})})
    for obj,action,slot,use,tracks in saved:
        d=obj.animation_data;d.action=action
        if action and slot:d.action_slot=slot
        d.use_nla=use
        for track,mute in tracks:track.mute=mute
    scene.frame_set(oldFrame);bpy.context.view_layer.update()
    check(bool(strips) and not collisions,'Complete spare/carrier door sweep clears fixed truck; spare skin also clears its own complete door',{'poses':121,'surfaceQueries':queries,'collisions':collisions})
    return {'passed':bool(strips) and not collisions and mount.get('passed',False),'dimensions':dimensions,'mountPins':mountPins,'mount':mount,'sampledPoses':121,'surfaceQueries':queries,'collisions':collisions,'mountingHistoricallyProven':False,'scope':'Actual packaged geometry and actual DoorsOpen tracks. Inferred carrier/door fixing overlaps are intended; tyre and rim have no own-door contact exclusion. Reversed rim/carrier contacts measured separately in closed pose. BonnetOpen sweep independently includes the spare as a fixed obstacle.'}


def VerifyImportedWheelNutSeats(root,check):
    """Measure support under real nut back footprints, not producer metadata."""
    from mathutils.bvhtree import BVHTree
    names={int(k):v for k,v in root['SourcePartNames'].items()};parts={}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attr=obj.data.attributes.get('_SOURCE_PART_ID')
        if attr is None:continue
        for face in obj.data.polygons:
            name=names[int(round(attr.data[face.vertices[0]].value))]
            if not name.startswith('Wheel_') or not (name.endswith(('_InnerDisc','_Hub','_HubCap','_PerforatedDisc')) or '_Lug' in name):continue
            part=parts.setdefault(name,{'vertices':[],'faces':[]});first=len(part['vertices']);part['vertices'].extend(obj.matrix_world@obj.data.vertices[i].co for i in face.vertices);part['faces'].append(tuple(first+i for i in range(len(face.vertices))))
    def Tree(values):
        points=[];faces=[]
        for p in values:
            first=len(points);points.extend(p['vertices']);faces.extend(tuple(first+i for i in f) for f in p['faces'])
        return BVHTree.FromPolygons(points,faces,all_triangles=False)
    rows=[];hubRows=[];offset=.01;limit=.002
    for wheel in ['Wheel_'+axle+side for axle in ['Front','Rear1','Rear2'] for side in ['Left','Right']]:
        sign=-1 if wheel.endswith('Left') else 1
        collar=parts.get(wheel+'_InnerDisc');hub=parts.get(wheel+'_Hub')
        support=[parts[wheel+'_'+suffix] for suffix in ['InnerDisc','PerforatedDisc','Hub','HubCap'] if wheel+'_'+suffix in parts]
        tree=Tree(support) if support else None
        volume=0;centre=bpy.data.objects[wheel].matrix_world.translation
        if collar:
            for face in collar['faces']:
                a,b,c=[collar['vertices'][i]-centre for i in face];volume+=a.dot(b.cross(c))/6
        hubRows.append({'wheel':wheel,'collarReachesHub':bool(collar and hub and Tree([collar]).overlap(Tree([hub]))),'signedCollarVolumeM3':volume})
        for i in range(8):
            name=wheel+'_Lug'+str(i);part=parts.get(name)
            if not part:
                rows.append({'name':name,'passed':False,'reason':'Missing actual nut geometry'});continue
            points=list({tuple(round(v,7) for v in p):p for p in part['vertices']}.values());back=min(sign*p.x for p in points);foot=[p for p in points if abs(sign*p.x-back)<1e-6]
            if foot:foot.append(sum(foot,Vector())/len(foot))
            samples=[]
            for p in foot:
                origin=p+Vector((sign*offset,0,0));hit=tree.ray_cast(origin,Vector((-sign,0,0)),.1) if tree else (None,None,None,None)
                gap=hit[3]-offset if hit[0] is not None else None;samples.append({'pointBlenderM':list(p),'signedSupportGapM':gap})
            gaps=[s['signedSupportGapM'] for s in samples];valid=bool(gaps) and all(g is not None and -.0001<=g<=limit for g in gaps)
            rows.append({'name':name,'backFootprintSamples':samples,'maximumSupportGapM':max((g for g in gaps if g is not None),default=None),'passed':valid})
    check(len(rows)==48 and all(r.get('backFootprintSamples') for r in rows),'All48actual wheel nuts retain measurable rear footprints',{'nuts':len(rows),'samples':sum(len(r.get('backFootprintSamples',[])) for r in rows)})
    check(len(rows)==48 and all(r['passed'] for r in rows),'Actual nut back footprints meet the reconstructed collar within2mmLOD allowance',{'runtimeAllowanceM':limit,'maximumSourceNutAxialLodLossObservedBeforeRepairM':.003414,'rows':rows})
    check(len(hubRows)==6 and all(r['collarReachesHub'] for r in hubRows),'All six mounting collars physically reach their actual wheel hubs',hubRows)
    check(len(hubRows)==6 and all(r['signedCollarVolumeM3']>1e-8 for r in hubRows),'All six mounting collars retain outward oriented volume',hubRows)
    return {'nuts':rows,'hubContacts':hubRows,'runtimeContactAllowanceM':limit,'passed':len(rows)==48 and all(r['passed'] for r in rows) and all(r['collarReachesHub'] and r['signedCollarVolumeM3']>1e-8 for r in hubRows),'historicalProfileProven':False,'scope':'Actual imported triangle footprints and BVH support/hub contact. The2mmruntime construction limit is retained; axial bounds are repaired from current high source. Independent source/runtime contacts are also checked at1micrometre. No nut or hub is excluded from this gate.'}


def VerifyImportedPressedDiscs(root,check):
    """Check real exported topology, eight openings and the authored smooth field."""
    names={int(k):v for k,v in root['SourcePartNames'].items()};parts={};lugPoints={}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attr=obj.data.attributes.get('_SOURCE_PART_ID')
        if attr is None:continue
        ids=[int(round(v.value)) for v in attr.data];normalMatrix=obj.matrix_world.to_3x3().inverted().transposed()
        for p in obj.data.polygons:
            name=names[ids[p.vertices[0]]]
            if name.startswith('Wheel_') and '_Lug' in name:
                points=lugPoints.setdefault(name,{})
                for vi in p.vertices:
                    point=obj.matrix_world@obj.data.vertices[vi].co;points[tuple(round(v,7) for v in point)]=point
            if not name.endswith('_PerforatedDisc'):continue
            part=parts.setdefault(name,{'points':[],'lookup':{},'faces':[],'normals':[]});face=[];normals=[]
            for li in p.loop_indices:
                vi=obj.data.loops[li].vertex_index;point=obj.matrix_world@obj.data.vertices[vi].co;key=tuple(round(v,6) for v in point)
                if key not in part['lookup']:part['lookup'][key]=len(part['points']);part['points'].append(point)
                face.append(part['lookup'][key]);normals.append((normalMatrix@obj.data.corner_normals[li].vector).normalized())
            part['faces'].append(tuple(face));part['normals'].append(normals)
    check(len(parts)==7,'All six road-wheel discs and side spare retain identifiable pressing surfaces',list(parts))
    rows=[];clockRows=[];radialScale=.2864/.266;axialScale=.1524/.25
    for name,part in parts.items():
        centre=bpy.data.objects[name.removesuffix('_PerforatedDisc')].matrix_world.translation;sign=-1 if centre.x<0 or name=='SpareWheel_PerforatedDisc' else 1
        points=part['points'];edgeCounts={};adjacency={};frontEdges={};frontFaces=0;backFaces=0;errors=[];tilts=[]
        for face,normals in zip(part['faces'],part['normals']):
            front=True;back=True;expected=[]
            for i in face:
                p=points[i];dy,dz=p.y-centre.y,p.z-centre.z;r=math.hypot(dy,dz);t=max(0,min(1,(.246-r/radialScale)/(.246-.141)))
                h=(.103+.007*t*t*(3-2*t))*axialScale;front&=abs(p.x-centre.x-sign*h)<.00001;back&=abs(p.x-centre.x-sign*(h-.004*axialScale))<.00001
                slope=-.007*6*t*(1-t)/(.246-.141)*axialScale/radialScale;expected.append(Vector((sign,-slope*dy/r,-slope*dz/r)).normalized())
            if front:
                frontFaces+=1
                for n,e in zip(normals,expected):errors.append(math.degrees(n.angle(e)));tilts.append(math.degrees(math.acos(max(-1,min(1,sign*n.x)))))
            if back:backFaces+=1
            for a,b in zip(face,face[1:]+face[:1]):
                edge=tuple(sorted((a,b)));edgeCounts[edge]=edgeCounts.get(edge,0)+1;adjacency.setdefault(a,set()).add(b);adjacency.setdefault(b,set()).add(a)
                if front:frontEdges[edge]=frontEdges.get(edge,0)+1
        def Components(graph):
            remaining=set(graph);groups=[]
            while remaining:
                pending=[next(iter(remaining))];group=set()
                while pending:
                    i=pending.pop()
                    if i in group:continue
                    group.add(i);pending.extend(graph.get(i,set())-group)
                remaining-=group;groups.append(group)
            return groups
        boundaries={}
        for (a,b),count in frontEdges.items():
            if count==1:boundaries.setdefault(a,set()).add(b);boundaries.setdefault(b,set()).add(a)
        loops=Components(boundaries);vents=[loop for loop in loops if len(loop)==12 and .205<math.hypot(*[(sum(points[i][k] for i in loop)/len(loop)-centre[k]) for k in [1,2]])<.231]
        euler=len(points)-len(edgeCounts)+len(part['faces']);components=len(Components(adjacency));badEdges=sum(n!=2 for n in edgeCounts.values())
        row={'name':name,'vertices':len(points),'triangles':len(part['faces']),'connectedComponents':components,'nonManifoldEdges':badEdges,'eulerCharacteristic':euler,'frontTriangles':frontFaces,'backTriangles':backFaces,'frontBoundaryLoopVertices':sorted(map(len,loops)),'ovalOpenings':len(vents),'maximumFrontNormalErrorDegrees':max(errors,default=180),'maximumFrontNormalTiltDegrees':max(tilts,default=180)}
        check(components==1 and badEdges==0 and euler==-16,'Actual pressing is one closed connected sheet with nine tunnels: '+name,row)
        check(len(loops)==10 and len(vents)==8 and all(len(n)==2 for n in boundaries.values()),'Actual pressing retains eight oval openings plus central and outer boundaries: '+name,row)
        check(frontFaces==136 and backFaces==136 and row['maximumFrontNormalErrorDegrees']<.2 and row['maximumFrontNormalTiltDegrees']<3.5 and row['frontBoundaryLoopVertices']==[8]+[12]*8+[16],'Actual sampled plate retains declared boundary counts and smooth source normal field: '+name,row)
        patterns=[];factor=2/(1+math.cos(math.pi/12))
        for loop in vents:
            mid=sum((points[i] for i in loop),Vector())/len(loop);radial=Vector((0,mid.y-centre.y,mid.z-centre.z)).normalized();tangent=Vector((0,-radial.z,radial.y))
            offsets=[points[i]-mid for i in loop];rr=sum(p.dot(radial)**2 for p in offsets)/len(loop);tt=sum(p.dot(tangent)**2 for p in offsets)/len(loop);rt=sum(p.dot(radial)*p.dot(tangent) for p in offsets)/len(loop)
            radialSemi=math.sqrt(2*rr)/factor;tangentSemi=math.sqrt(2*tt)/factor;tilt=abs(math.degrees(.5*math.atan2(2*rt,tt-rr)))
            residual=max(abs((p.dot(radial)/(factor*.0235))**2+(p.dot(tangent)/(factor*.0355))**2-1) for p in offsets)
            patterns.append({'pitchRadiusM':math.hypot(mid.y-centre.y,mid.z-centre.z),'radialSemiaxisM':radialSemi,'tangentialSemiaxisM':tangentSemi,'majorAxisFromTangentDegrees':tilt,'expandedSourceEllipseMaximumResidual':residual})
        row['ventPatterns']=patterns
        check(len(patterns)==8 and all(abs(p['pitchRadiusM']-.218)<.000002 and abs(p['radialSemiaxisM']-.0235)<.000002 and abs(p['tangentialSemiaxisM']-.0355)<.000002 and p['majorAxisFromTangentDegrees']<.02 and p['expandedSourceEllipseMaximumResidual']<.0002 for p in patterns),'Actual eight apertures retain drawing-derived tangential ellipse pattern: '+name,{'patterns':patterns,'method':'Independent actual12point boundary moments and ellipse residual,removing documented minimax expansion. Values are construction targets,not historical tolerances.'})
        if name.startswith('Wheel_'):
            prefix=name.removesuffix('_PerforatedDisc');ventCentres=[sum((points[i] for i in loop),Vector())/len(loop) for loop in vents]
            ventAngles=[math.atan2(p.z-centre.z,p.y-centre.y) for p in ventCentres];nuts=[]
            for i in range(8):
                nutName=prefix+'_Lug'+str(i);values=list(lugPoints.get(nutName,{}).values())
                if not values:continue
                nut=Vector([(min(p[k] for p in values)+max(p[k] for p in values))/2 for k in range(3)]);angle=math.atan2(nut.z-centre.z,nut.y-centre.y)
                separation=min((abs(math.atan2(math.sin(angle-a),math.cos(angle-a))) for a in ventAngles),default=math.pi)
                nuts.append({'name':nutName,'centreBlenderM':list(nut),'nearestVentSeparationDegrees':math.degrees(separation),'halfPitchErrorDegrees':abs(math.degrees(separation)-22.5)})
            clockRows.append({'wheel':prefix,'nuts':nuts,'ventCentresBlenderM':[list(p) for p in ventCentres],'maximumHalfPitchErrorDegrees':max((n['halfPitchErrorDegrees'] for n in nuts),default=180)})
        rows.append(row)
    check(len(clockRows)==6 and len(lugPoints)==48 and all(len(row['nuts'])==8 for row in clockRows),'All six actual road wheels retain eight independently identifiable wheel nuts',{'wheels':len(clockRows),'nuts':len(lugPoints)})
    check(len(clockRows)==6 and all(row['maximumHalfPitchErrorDegrees']<2.5 for row in clockRows),'Actual wheel nuts lie halfway between real ventilation openings within2.5degreeLOD tolerance',clockRows)
    return {'discs':rows,'fastenerClocking':{'wheels':clockRows,'expectedHalfPitchDegrees':22.5,'lodToleranceDegrees':2.5,'factoryEvidence':'1936overall drawing,front and rear side elevations,scan09','exactHistoricalAnglePrinted':False,'scope':'Nut centres from actual exported part bounds; ventilation centres from actual12vertex aperture boundary loops. Relative pattern only, independent of wheel roll phase.'},'historicalPressingProfileProven':False,'scope':'Actual packaged triangles welded by1micrometre positions for topology only; imported corner normals retain the same0.2degreefield bound.512triangle pressings retain8physical tunnels,12station minimax tangential apertures,concealed16station outer edge and8station collar-matched centre. High-source24station contour and runtime12station contours share drawing-derived pitch/semiaxes. Not historical tooling measurements.'}


def VerifyImportedWheelSurfaces(root,check):
    """Verify real casing/lug topology and actual buried support points."""
    from mathutils.bvhtree import BVHTree
    names={int(k):v for k,v in root['SourcePartNames'].items()};parts={}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attr=obj.data.attributes.get('_SOURCE_PART_ID')
        if attr is None:continue
        for face in obj.data.polygons:
            name=names[int(round(attr.data[face.vertices[0]].value))]
            if not ((name.startswith(('Wheel_','SpareWheel_')) and name.endswith(('_Tyre','_TreadLugs'))) or name=='SpareWheel_InnerDisc'):continue
            part=parts.setdefault(name,{'points':[],'lookup':{},'faces':[]});indices=[]
            for i in face.vertices:
                point=obj.matrix_world@obj.data.vertices[i].co;key=tuple(round(v,6) for v in point)
                if key not in part['lookup']:part['lookup'][key]=len(part['points']);part['points'].append(point)
                indices.append(part['lookup'][key])
            part['faces'].append(tuple(indices))
    section=[(-.108,.245),(-.119,.277),(-.125,.330),(-.116,.384),(-.089,.424),(-.052,.439),(0,.442),(.052,.439),(.089,.424),(.116,.384),(.125,.330),(.119,.277),(.108,.245)]
    profile=[(x*.6096,.2794+(r-.245)*.762) for x,r in section];rows=[]
    def Topology(part):
        edges={};graph={}
        for face in part['faces']:
            for a,b in zip(face,face[1:]+face[:1]):edge=tuple(sorted((a,b)));edges[edge]=edges.get(edge,0)+1;graph.setdefault(a,set()).add(b);graph.setdefault(b,set()).add(a)
        remaining=set(graph);components=[]
        while remaining:
            pending=[next(iter(remaining))];group=set()
            while pending:
                i=pending.pop()
                if i in group:continue
                group.add(i);pending.extend(graph[i]-group)
            remaining-=group;components.append(group)
        return edges,components
    for wheel in ['SpareWheel']+['Wheel_'+a+b for a in ['Front','Rear1','Rear2'] for b in ['Left','Right']]:
        centre=bpy.data.objects[wheel].matrix_world.translation;body=parts[wheel+'_Tyre'];edges,groups=Topology(body);stations=[[] for _ in profile];maximum=0
        for point in body['points']:
            axial=point.x-centre.x;radius=math.hypot(point.y-centre.y,point.z-centre.z);errors=[math.hypot(axial-x,radius-r) for x,r in profile];j=min(range(13),key=lambda i:errors[i]);maximum=max(maximum,errors[j]);stations[j].append(math.atan2(point.z-centre.z,point.y-centre.y))
        gaps=[]
        for angles in stations:
            angles.sort()
            gaps.extend(abs(math.degrees((angles[(i+1)%len(angles)]-a)%math.tau)-360/28) for i,a in enumerate(angles))
        bodyResult={'wheel':wheel,'triangles':len(body['faces']),'positions':len(body['points']),'profileStations':list(map(len,stations)),'maximumProfileErrorM':maximum,'maximumAngularGapErrorDegrees':max(gaps,default=180),'nonManifoldEdges':sum(v!=2 for v in edges.values()),'components':len(groups),'eulerCharacteristic':len(body['points'])-len(edges)+len(body['faces'])}
        check(len(body['faces'])==728 and len(body['points'])==364 and list(map(len,stations))==[28]*13 and maximum<.00002 and bodyResult['maximumAngularGapErrorDegrees']<.001 and not bodyResult['nonManifoldEdges'] and len(groups)==1 and bodyResult['eulerCharacteristic']==0,'Actual tyre retains13source profile rings and28uniform closed stations: '+wheel,bodyResult)
        tree=BVHTree.FromPolygons(body['points'],body['faces'],all_triangles=True);lugs=parts[wheel+'_TreadLugs'];edges,groups=Topology(lugs);volumes=[];support=[];counts=[]
        for group in groups:
            faces=[face for face in lugs['faces'] if face[0] in group];middle=sum((lugs['points'][i] for i in group),Vector())/len(group);volume=sum((lugs['points'][f[0]]-middle).dot((lugs['points'][f[1]]-middle).cross(lugs['points'][f[2]]-middle))/6 for f in faces);volumes.append(volume);counts.append((len(group),len(faces)))
            apex=min((lugs['points'][i] for i in group),key=lambda p:math.hypot(p.y-centre.y,p.z-centre.z));radial=Vector((0,apex.y-centre.y,apex.z-centre.z)).normalized();hit=tree.ray_cast(apex+radial*.05,-radial,.1);support.append(hit[3]-.05 if hit[0] is not None else None)
        lugResult={'wheel':wheel,'components':len(groups),'triangles':len(lugs['faces']),'componentSizes':sorted(set(counts)),'minimumSignedVolumeM3':min(volumes,default=0),'nonManifoldEdges':sum(v!=2 for v in edges.values()),'minimumApexGapM':min((v for v in support if v is not None),default=None),'maximumApexGapM':max((v for v in support if v is not None),default=None),'missingSupport':sum(v is None for v in support)}
        check(len(groups)==162 and len(lugs['faces'])==972 and set(counts)=={(5,6)} and min(volumes,default=0)>1e-9 and not lugResult['nonManifoldEdges'] and all(v is not None and -.0016<v<-.0014 for v in support),'Actual162tread blocks are closed positive-volume supported solids: '+wheel,lugResult);rows.append({'body':bodyResult,'lugs':lugResult})
    spare=parts['SpareWheel_InnerDisc'];centre=bpy.data.objects['SpareWheel'].matrix_world.translation;volume=sum((spare['points'][f[0]]-centre).dot((spare['points'][f[1]]-centre).cross(spare['points'][f[2]]-centre))/6 for f in spare['faces']);check(volume>0,'Actual spare collar normals face outward with positive enclosed volume',volume)
    return {'wheels':rows,'spareCollarSignedVolumeM3':volume,'scope':'Actual imported surface topology,regular source-section coordinates,positive lug volumes and direct casing support rays.20umprofile/1.5mmburial are modelling checks,not period tyre manufacturing tolerances. Source-top and dense view errors are separately audited.'}


def VerifyImportedAnalyticRims(root,check):
    """Check delivered section stations, roundness, topology and normal symmetry."""
    names={int(k):v for k,v in root['SourcePartNames'].items()};parts={}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attr=obj.data.attributes.get('_SOURCE_PART_ID')
        if attr is None:continue
        matrix=obj.matrix_world;normalMatrix=matrix.to_3x3().inverted().transposed()
        for face in obj.data.polygons:
            name=names[int(round(attr.data[face.vertices[0]].value))]
            if not (name.endswith('_Rim') and (name.startswith('Wheel_') or name=='SpareWheel_Rim')):continue
            part=parts.setdefault(name,{'points':[],'lookup':{},'faces':[],'normals':[]});indices=[]
            for li in face.loop_indices:
                point=matrix@obj.data.vertices[obj.data.loops[li].vertex_index].co;key=tuple(round(v,6) for v in point)
                if key not in part['lookup']:part['lookup'][key]=len(part['points']);part['points'].append(point)
                indices.append(part['lookup'][key]);part['normals'].append((point,(normalMatrix@obj.data.corner_normals[li].vector).normalized()))
            part['faces'].append(tuple(indices))
    check(len(parts)==7,'All six road rims and side-spare rim retain identifiable analytical surfaces',list(parts))
    profile=[(-.098,.231),(-.112,.244),(-.112,.260),(-.102,.266),(.102,.266),(.112,.260),(.112,.244),(.098,.231)]
    profile=[(x*.1524/.25,r*.2864/.266) for x,r in profile];counts=[24,24,24,32,32,24,24,24];rows=[]
    for name,part in parts.items():
        centre=bpy.data.objects[name.removesuffix('_Rim')].matrix_world.translation;stations=[[] for _ in profile];maximum=0;edgeCounts={};adjacency={}
        for point in part['points']:
            axial=point.x-centre.x;radial=math.hypot(point.y-centre.y,point.z-centre.z);distances=[math.hypot(axial-x,radial-r) for x,r in profile];station=min(range(8),key=lambda i:distances[i]);maximum=max(maximum,distances[station]);stations[station].append(math.atan2(point.z-centre.z,point.y-centre.y))
        for face in part['faces']:
            for a,b in zip(face,face[1:]+face[:1]):
                edge=tuple(sorted((a,b)));edgeCounts[edge]=edgeCounts.get(edge,0)+1;adjacency.setdefault(a,set()).add(b);adjacency.setdefault(b,set()).add(a)
        pending=[0] if part['points'] else [];visited=set()
        while pending:
            i=pending.pop()
            if i in visited:continue
            visited.add(i);pending.extend(adjacency.get(i,set())-visited)
        gapErrors=[]
        for angles,count in zip(stations,counts):
            angles.sort()
            for i,a in enumerate(angles):gapErrors.append(abs(math.degrees((angles[(i+1)%len(angles)]-a)%(2*math.pi))-360/count))
        normalErrors=[]
        for p,n in part['normals']:
            dy,dz=p.y-centre.y,p.z-centre.z;r=math.hypot(dy,dz);normalErrors.append(math.degrees(math.asin(min(1,abs((-dz*n.y+dy*n.z)/r)))))
        row={'name':name,'triangles':len(part['faces']),'vertices':len(part['points']),'profileStationVertices':list(map(len,stations)),'maximumProfileStationErrorM':maximum,'maximumAngularGapErrorDegrees':max(gapErrors,default=180),'maximumCircumferentialNormalTiltDegrees':max(normalErrors,default=180),'nonManifoldEdges':sum(n!=2 for n in edgeCounts.values()),'eulerCharacteristic':len(part['points'])-len(edgeCounts)+len(part['faces']),'connected':len(visited)==len(part['points'])};rows.append(row)
    check(len(rows)==7 and all(r['triangles']==416 and r['vertices']==208 and r['profileStationVertices']==counts and r['maximumProfileStationErrorM']<.00002 and not r['nonManifoldEdges'] and r['eulerCharacteristic']==0 and r['connected'] for r in rows),'Actual rim triangles retain all eight source section stations as closed connected rings',rows)
    check(len(rows)==7 and all(r['maximumAngularGapErrorDegrees']<.001 and r['maximumCircumferentialNormalTiltDegrees']<.05 for r in rows),'Actual rim circumference spacing and smooth normal fields remain rotationally symmetric',rows)
    return {'rims':rows,'profileSegments':counts,'historicalSectionProven':False,'scope':'Actual delivered triangles and corner normals.20micrometre source-station tolerance and0.05degreecircumferential normal bound are LOD fidelity checks,not historical manufacturing tolerances.'}


def VerifyImportedPrimaryCab(root,check):
    from mathutils.bvhtree import BVHTree
    names={int(k):v for k,v in root['SourcePartNames'].items()};vertices=[];faces=[];cabMaximum=-1e9
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attr=obj.data.attributes.get('_SOURCE_PART_ID')
        if attr is None:continue
        for face in obj.data.polygons:
            name=names[int(round(attr.data[face.vertices[0]].value))]
            if name.startswith(('Cabin_','Door_','DoorPanel_','DoorLower','Windshield_','Mirror_')):cabMaximum=max(cabMaximum,max((obj.matrix_world@obj.data.vertices[i].co).z for i in face.vertices))
            if name!='Cabin_CamberedRoof':continue
            off=len(vertices);vertices.extend(obj.matrix_world@obj.data.vertices[i].co for i in face.vertices);faces.append(tuple(range(off,len(vertices))))
    check(bool(vertices),'Actual primary-cab roof triangles remain identifiable')
    if not vertices:return None
    maximum=max(p.z for p in vertices);check(abs(maximum-2.25)<.001,'Actual packaged cab roof retains2.250mmaximum after primary-profile correction',maximum)
    check(cabMaximum<=2.251,'All actual cab/door/glazing/mirror structures stay within nominal2.250m; no pillar or rear-frame overshoot',cabMaximum)
    tree=BVHTree.FromPolygons(vertices,faces,all_triangles=False);raw=list(root['PrimaryCabRoofCornersBlender']);corners=[];gaps=[]
    for i in range(0,len(raw),3):
        target=Vector(raw[i:i+3]);hit=tree.find_nearest(target);corners.append(hit[0] if hit[0] is not None else target);gaps.append(hit[3] if hit[0] is not None else 1e9)
    check(len(corners)==4 and max(gaps)<.001,'Actual roof retains all four declared profile corners within1mm',gaps)
    c=Vector(root['PrimaryCameraLocationBlender']);f=(Vector(root['PrimaryCameraTargetBlender'])-c).normalized();r0=f.cross(Vector((0,0,1))).normalized();u0=r0.cross(f);roll=math.radians(root['PrimaryCameraRollDegrees']);r=math.cos(roll)*r0+math.sin(roll)*u0;u=-math.sin(roll)*r0+math.cos(roll)*u0;fx=root['PrimaryCameraLensMm']*600/36;principal=list(root.get('PrimaryCameraPrincipalPointPixels',[300,172.5]))
    def Pixel(p):
        d=p-c;return [principal[0]+fx*d.dot(r)/d.dot(f),principal[1]-fx*d.dot(u)/d.dot(f)]
    observed=[[217,26],[394,43]];actual=[Pixel(p) for p in corners[:2]];before=[Pixel(Vector(p)) for p in [(.79,.9621428847,2.08),(-.79,.9621428847,2.08)]];rms=lambda values:math.sqrt(sum((v-t)**2 for row,target in zip(values,observed) for v,t in zip(row,target))/4)
    baselineRms=rms(before);currentRms=rms(actual);check(currentRms<baselineRms*.65,'Actual roof-corner projections improve on V37 under unchanged primary camera hypothesis',{'baselineRmsPx':baselineRms,'currentRmsPx':currentRms,'observationsApproximate':True,'scope':'Two corners only; not whole-reference acceptance'})
    return {'roofMaximumM':maximum,'allCabStructureMaximumM':cabMaximum,'cornerNearestSurfaceGapsM':gaps,'actualRoofFrontCornersPx':actual,'baselineV37RmsPx':baselineRms,'currentRmsPx':currentRms,'primaryCameraCalibrated':False,'wholeReferenceAcceptance':False,'observationsApproximate':True}


def VerifyImportedPrimaryDoorSill(root,check):
    """Check the visible near sill junction without using the hidden far glass."""
    names={int(k):v for k,v in root['SourcePartNames'].items()};points=[]
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attr=obj.data.attributes.get('_SOURCE_PART_ID')
        if attr is None:continue
        for vertex,value in zip(obj.data.vertices,attr.data):
            if names[int(round(value.value))]=='Door_WindowLowerChannelRight':points.append(obj.matrix_world@vertex.co)
    check(bool(points),'Actual near-side moving lower window channel remains identifiable')
    if not points:return None
    fore=max(p.y for p in points);cap=[p for p in points if p.y>fore-.01];centre=sum(cap,Vector())/len(cap)
    c=Vector(root['PrimaryCameraLocationBlender']);f=(Vector(root['PrimaryCameraTargetBlender'])-c).normalized();r0=f.cross(Vector((0,0,1))).normalized();u0=r0.cross(f);roll=math.radians(root['PrimaryCameraRollDegrees']);r=math.cos(roll)*r0+math.sin(roll)*u0;u=-math.sin(roll)*r0+math.cos(roll)*u0;fx=root['PrimaryCameraLensMm']*600/36;principal=list(root['PrimaryCameraPrincipalPointPixels']);delta=centre-c
    pixel=[principal[0]+fx*delta.dot(r)/delta.dot(f),principal[1]-fx*delta.dot(u)/delta.dot(f)];observed=[210,115];error=math.hypot(pixel[0]-observed[0],pixel[1]-observed[1])
    check(error<5 and abs(root.get('PrimaryDoorSillForeLiftM',0)-.14)<1e-6,'Actual moving sill front junction agrees with approximate visible primary-photo corner within5px',{'pixel':pixel,'observed':observed,'errorPx':error,'annotationUncertaintyPx':4,'primaryCameraCalibrated':False})
    return {'foreCentreBlenderM':list(centre),'forePixel':pixel,'observedForePixel':observed,'errorPx':error,'annotationUncertaintyPx':4,'reconstructionLiftM':root['PrimaryDoorSillForeLiftM'],'rearJunctionOccluded':True,'farGlassLowerCornerUsed':False,'wholeReferenceAccepted':False,'scope':'One visible near-side moving-sill junction in600x345primary. Fixed cowl,front windscreen,roof,hinges and photographed hidden rear corner do not supply invented annotations.'}


def VerifyImportedFrontWingProfile(root,check):
    """Measure the short lip on the delivered triangles, not its node origin."""
    names={int(k):v for k,v in root['SourcePartNames'].items()};wanted={'FrontFender_-1','FrontFender_1','FrontFender_RolledLip-1','FrontFender_RolledLip1'};parts={n:{} for n in wanted}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attr=obj.data.attributes.get('_SOURCE_PART_ID')
        if attr is None:continue
        for vertex,value in zip(obj.data.vertices,attr.data):
            name=names[int(round(value.value))]
            if name in parts:
                p=obj.matrix_world@vertex.co;parts[name][tuple(round(v,7) for v in p)]=p
    check(all(parts.values()),'Both actual front-wing sheets and continuous rolled lips remain identifiable')
    if not all(parts.values()):return None
    fore=[p for values in parts.values() for p in values.values() if p.y>1.82];minimum=min(p.z for p in fore);maximum=max(p.y for p in fore)
    bumperTop=root['FrontBumperCentreZM']+root['FrontBumperHeightM']/2
    first=root['FrontWingForeStartRadians'];height=.44+(.535+root['FrontFenderCrownLiftM'])*math.sin(first)
    innerHeight=height-root['FrontWingInnerForeDropZM']
    outerFore=[p for name,values in parts.items() if 'RolledLip' in name for p in values.values() if p.y>1.82]
    outerMinimum=min(p.z for p in outerFore)
    check(minimum>max(bumperTop+.05,innerHeight-.003) and outerMinimum>.79 and maximum<=2.4481,'Actual short front wings retain outer-lip height and declared inner-sheet floor above bumper without extending5.400m length',{'minimumForeHeightM':minimum,'minimumOuterLipHeightM':outerMinimum,'declaredInnerHeightM':innerHeight,'sheetToleranceM':.003,'bumperTopM':bumperTop,'maximumForeYM':maximum})
    scale=root['FenderWidthScale'];tips={};errors=[]
    for side in [-1,1]:
        target=Vector((side*(.945-root.get('FrontWingForeTaperM',0))*scale,root['FrontWingForeLipCentreYM'],height));nearest=sorted(parts['FrontFender_RolledLip'+str(side)].values(),key=lambda p:(p-target).length_squared)[:8];centre=sum(nearest,Vector())/len(nearest);tips[str(side)]=centre;errors.append((centre-target).length)
    check(max(errors)<.001,'Actual rolled front-lip endpoint centres retain the declared reconstructed profile within1mm',errors)
    c=Vector(root['PrimaryCameraLocationBlender']);f=(Vector(root['PrimaryCameraTargetBlender'])-c).normalized();r0=f.cross(Vector((0,0,1))).normalized();u0=r0.cross(f);roll=math.radians(root['PrimaryCameraRollDegrees']);r=math.cos(roll)*r0+math.sin(roll)*u0;u=-math.sin(roll)*r0+math.cos(roll)*u0;fx=root['PrimaryCameraLensMm']*600/36;pp=list(root['PrimaryCameraPrincipalPointPixels']);delta=tips['-1']-c;pixel=[pp[0]+fx*delta.dot(r)/delta.dot(f),pp[1]-fx*delta.dot(u)/delta.dot(f)];observed=[553,207];error=math.hypot(pixel[0]-observed[0],pixel[1]-observed[1])
    check(error<5,'Actual far outer front lip matches the approximate visible primary-photo tip within5px',{'pixel':pixel,'observed':observed,'errorPx':error,'annotationUncertaintyPx':3})
    # Read the delivered solid sheet around the reconstructed inner leading
    # corner. The unchanged outer tip and the new inner corner are independent
    # observations; an invisible far-side seam is not made a photo landmark.
    innerX=(.345+root['FrontWingInnerForeExtraXM'])*scale;innerY=root['FrontWingForeLipCentreYM']-root['FrontWingInnerForeSetbackYM'];innerZ=height-root['FrontWingInnerForeDropZM']
    innerTips={};innerErrors=[]
    for side in [-1,1]:
        target=Vector((side*innerX,innerY,innerZ));nearest=sorted(parts['FrontFender_'+str(side)].values(),key=lambda p:(p-target).length_squared)[:2];centre=sum(nearest,Vector())/len(nearest);innerTips[str(side)]=centre;innerErrors.append((centre-target).length)
    check(max(innerErrors)<.002,'Both delivered inner leading corners retain the declared recessed/dished sheet within2mm',innerErrors)
    delta=innerTips['1']-c;innerPixel=[pp[0]+fx*delta.dot(r)/delta.dot(f),pp[1]-fx*delta.dot(u)/delta.dot(f)];innerObserved=[353,207];innerError=math.hypot(innerPixel[0]-innerObserved[0],innerPixel[1]-innerObserved[1])
    check(innerError<5,'Visible near inner front-wing corner agrees with approximate primary-photo tip within5px',{'pixel':innerPixel,'observed':innerObserved,'errorPx':innerError,'annotationUncertaintyPx':4})
    return {'minimumForeHeightM':minimum,'minimumOuterLipHeightM':outerMinimum,'bumperTopM':bumperTop,'maximumForeYM':maximum,'endpointErrorsM':errors,'endpointCentresBlenderM':{n:list(p) for n,p in tips.items()},'farLipPixel':pixel,'observedFarLipPixel':observed,'errorPx':error,'annotationUncertaintyPx':3,'innerEndpointCentresBlenderM':{n:list(p) for n,p in innerTips.items()},'innerEndpointErrorsM':innerErrors,'nearInnerPixel':innerPixel,'observedNearInnerPixel':innerObserved,'nearInnerErrorPx':innerError,'nearInnerAnnotationUncertaintyPx':4,'cameraCalibrated':False,'factoryPressingDimensionsProven':False,'scope':'Actual delivered sheets, unchanged outer rolled lips and recessed/dished inner corners. Visible near inner tip guided by primary photo; hidden far inner seam is not an observed calibration point. Exact pressing and camera remain reconstructed; no whole-model acceptance.'}


def VerifyImportedRadiatorGrid(root,check):
    names={int(k):v for k,v in root['SourcePartNames'].items()};parts={}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attr=obj.data.attributes.get('_SOURCE_PART_ID')
        if attr is None:continue
        for face in obj.data.polygons:
            name=names[int(round(attr.data[face.vertices[0]].value))]
            if not name.startswith('Radiator_VerticalFin'):continue
            part=parts.setdefault(name,{'points':[],'lookup':{},'faces':[]});f=[]
            for i in face.vertices:
                p=obj.matrix_world@obj.data.vertices[i].co;key=tuple(round(v,6) for v in p)
                if key not in part['lookup']:part['lookup'][key]=len(part['points']);part['points'].append(p)
                f.append(part['lookup'][key])
            part['faces'].append(f)
    rows=[]
    for name,p in parts.items():
        edges={};adj={}
        for f in p['faces']:
            for a,b in zip(f,f[1:]+f[:1]):
                key=tuple(sorted((a,b)));edges[key]=edges.get(key,0)+1;adj.setdefault(a,set()).add(b);adj.setdefault(b,set()).add(a)
        seen=set();stack=[0]
        while stack:
            i=stack.pop()
            if i in seen:continue
            seen.add(i);stack.extend(adj.get(i,set())-seen)
        rows.append({'name':name,'vertices':len(p['points']),'triangles':len(p['faces']),'nonManifoldEdges':sum(n!=2 for n in edges.values()),'euler':len(p['points'])-len(edges)+len(p['faces']),'oneContinuousRod':len(seen)==len(p['points']),'heightM':max(v.z for v in p['points'])-min(v.z for v in p['points'])})
    check(len(rows)==55 and all(r['oneContinuousRod'] and r['nonManifoldEdges']==0 and r['euler']==2 and r['heightM']>.5 for r in rows),'All55actual grille fins survive as continuous closed rods; no decimation fragments',rows)
    return {'rods':rows,'authoredCount':55,'countHistoricallyMeasured':False,'scope':'Actual packaged grid topology/extent, not a claim that historical fin count was independently measured.'}


def VerifyImportedNoseService(root,check):
    """Inspect actual nose triangles, cutout, cap and rear-tank connection."""
    from mathutils.bvhtree import BVHTree
    names={int(k):v for k,v in root['SourcePartNames'].items()};parts={}
    wanted={'Radiator_FillerCap','Radiator_FillerNeck','Radiator_UpperHeader','Radiator_OuterSurround','Radiator_UpperTank','Nose_ServiceSaddle-1','Nose_ServiceSaddle1','Engine_CoolantHose'}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        ids=obj.data.attributes.get('_SOURCE_PART_ID')
        if ids is None:continue
        for face in obj.data.polygons:
            name=names[int(round(ids.data[face.vertices[0]].value))]
            if name not in wanted:continue
            p=parts.setdefault(name,{'vertices':[],'faces':[]});offset=len(p['vertices']);p['vertices'].extend(obj.matrix_world@obj.data.vertices[i].co for i in face.vertices);p['faces'].append(tuple(range(offset,len(p['vertices']))))
    check(set(parts)==wanted and all(p['faces'] for p in parts.values()),'Actual crown,flat cap,two fixed service saddles and connected hose are present',sorted(parts))
    if set(parts)!=wanted:return {'missing':sorted(wanted-set(parts))}
    trees={n:BVHTree.FromPolygons(p['vertices'],p['faces'],all_triangles=False) for n,p in parts.items()}
    holes=[]
    for name in ['Nose_ServiceSaddle-1','Nose_ServiceSaddle1']:
        radius=min(math.hypot(p.x,p.y-2.30) for p in parts[name]['vertices']);pairs=len(trees[name].overlap(trees['Radiator_FillerNeck']))
        holes.append({'name':name,'minimumNeckAxisRadiusM':radius,'neckSurfaceIntersections':pairs})
    check(all(.024<r['minimumNeckAxisRadiusM']<.027 and r['neckSurfaceIntersections']==0 for r in holes),'Actual fixed saddle has a25mm neck cutout and no pipe penetration',holes)
    def Bounds(name):
        p=parts[name]['vertices'];return {'min':[min(v[k] for v in p) for k in range(3)],'max':[max(v[k] for v in p) for k in range(3)]}
    cap=Bounds('Radiator_FillerCap');capSize=[b-a for a,b in zip(cap['min'],cap['max'])]
    check(abs(capSize[0]-.086)<.001 and abs(capSize[1]-.086)<.001 and abs(capSize[2]-.017)<.001,'Actual cap retains the reviewed shallow86x17mm radial shape',cap)
    tank=Bounds('Radiator_UpperTank');anchor=Vector(root['CoolantTankConnectionM']);nearest=trees['Engine_CoolantHose'].find_nearest(anchor);gap=nearest[3] if nearest else 1e9
    inside=all(tank['min'][k]+.005<anchor[k]<tank['max'][k]-.005 for k in range(3))
    check(inside and gap<.001,'Actual hose terminal enters the rear tank volume',{'anchorM':list(anchor),'insideActualTankBounds':inside,'nearestActualHoseSurfaceM':gap,'tank':tank})
    hose=Bounds('Engine_CoolantHose')
    check(hose['max'][1]<=tank['max'][1]+.001,'Actual coolant hose stays behind the tank front and cannot pierce the radiator face',{'hoseMaxY':hose['max'][1],'tankMaxY':tank['max'][1]})
    crown=parts['Radiator_OuterSurround']['vertices'];top=max(p.z for p in crown);centreTop=max(p.z for p in crown if abs(p.x)<.020)
    check(centreTop>=top-.002,'Actual exterior radiator crown rises continuously across the centre; inner twin opening is separate',{'crownTopM':top,'centreTopM':centreTop})
    return {'holes':holes,'cap':cap,'hose':hose,'tank':tank,'hoseTerminalSurfaceGapM':gap,'crownTopM':top,'centreTopM':centreTop,'constructionAndDimensionsInferred':True}

def VerifyImportedSurfaceNormals(root,check):
    """Check decoded corner normals on physical flat mirror/wood faces."""
    names={int(k):v for k,v in root['SourcePartNames'].items()}
    mirrors={n for n in names.values() if n.startswith(('Mirror_Back','Mirror_Glass'))}
    wood={n for n in names.values() if n.startswith(('Cargo_SidePlank','Cargo_FloorPlank','Cargo_FrontBoard','Tailgate_Plank'))}
    rows={n:{'planeSamples':0,'maximumDeviationDeg':0,'triangles':0} for n in mirrors|wood}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        mesh=obj.data;attr=mesh.attributes.get('_SOURCE_PART_ID')
        if attr is None:continue
        normalMatrix=obj.matrix_world.to_3x3().inverted().transposed()
        for face in mesh.polygons:
            name=names[int(round(attr.data[face.vertices[0]].value))]
            if name not in rows:continue
            row=rows[name];row['triangles']+=len(face.vertices)-2
            axis=1 if name in mirrors or name.startswith(('Cargo_FrontBoard','Tailgate_Plank')) else (2 if name.startswith('Cargo_FloorPlank') else 0)
            expected=Vector(root.get('MirrorFarCapNormalBlender',[0,1,0])).normalized() if name in mirrors and name.endswith('Left') else Vector((0,1,0)) if name in mirrors else Vector(tuple(1 if i==axis else 0 for i in range(3)))
            geometric=(normalMatrix@face.normal).normalized()
            if abs(geometric.dot(expected))<.99999:continue
            for li in face.loop_indices:
                normal=(normalMatrix@mesh.corner_normals[li].vector).normalized();angle=math.degrees(math.acos(min(1,abs(normal.dot(expected)))))
                row['planeSamples']+=1;row['maximumDeviationDeg']=max(row['maximumDeviationDeg'],angle)
    check(len(mirrors)==4 and all(rows[n]['planeSamples']>0 and rows[n]['maximumDeviationDeg']<1 and rows[n]['triangles']>=120 for n in mirrors),'Actual four circular mirror caps retain planar normals and circular topology',{n:rows[n] for n in sorted(mirrors)})
    check(len(wood)==26 and all(rows[n]['planeSamples']>0 and rows[n]['maximumDeviationDeg']<2 for n in wood),'Actual26 cargo/floor/front/tailgate plank planes retain flat shading',{n:rows[n] for n in sorted(wood)})
    return {'parts':rows,'mirrorParts':len(mirrors),'woodParts':len(wood),'geometryAndImageAcceptanceEstablished':False}


def VerifyImportedFarMirrorPose(root,check):
    """Measure the delivered case, its stalk contact and declared rear view."""
    names={int(k):v for k,v in root['SourcePartNames'].items()};parts={n:{} for n in ['Mirror_BackLeft','Mirror_GlassLeft','Mirror_StalkLeft']}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attr=obj.data.attributes.get('_SOURCE_PART_ID')
        if attr is None:continue
        for vertex,value in zip(obj.data.vertices,attr.data):
            name=names[int(round(value.value))]
            if name in parts:
                p=obj.matrix_world@vertex.co;parts[name][tuple(round(v,7) for v in p)]=p
    check(all(parts.values()),'Actual far mirror back, glass and supporting stalk remain independently identifiable')
    if not all(parts.values()):return None
    back=list(parts['Mirror_BackLeft'].values());centre=sum(back,Vector())/len(back);declared=Vector(root['MirrorFarCentreBlenderM']);normal=Vector(root['MirrorFarCapNormalBlender']).normalized();offsets=[p-centre for p in back];halfThickness=max(abs(p.dot(normal)) for p in offsets);radii=[(p-normal*p.dot(normal)).length for p in offsets]
    check((centre-declared).length<.0001 and max(abs(r-.060) for r in radii)<.0001,'Actual turned mirror retains its mount centre and120mm round case without stretching',{'centreErrorM':(centre-declared).length,'radiusRangeM':[min(radii),max(radii)],'halfThicknessM':halfThickness})
    target=Vector(root['MirrorFarStalkTipBlenderM']);nearest=sorted(parts['Mirror_StalkLeft'].values(),key=lambda p:(p-target).length_squared)[:10];tip=sum(nearest,Vector())/len(nearest);delta=tip-centre;axial=abs(delta.dot(normal));radial=(delta-normal*delta.dot(normal)).length
    check(len(nearest)==10 and (tip-target).length<.0001 and axial<halfThickness and radial<.058,'Actual stalk end remains embedded in the turned mirror case',{'tipErrorM':(tip-target).length,'axialDistanceM':axial,'radialDistanceM':radial,'caseHalfThicknessM':halfThickness})
    eye=Vector(root['MirrorAssumedDriverEyeBlenderM']);view=(eye-centre).normalized();glassNormal=-normal;rear=2*glassNormal*glassNormal.dot(view)-view
    check(rear.y<-.90,'Turned mirror gives a rearward field from the explicitly inferred driver-eye point',{'eyePointBlenderM':list(eye),'reflectedSceneDirection':list(rear),'historicalEyeAndAdjustmentProven':False})
    return {'centreBlenderM':list(centre),'yawDegrees':root['MirrorFarYawDegrees'],'capNormalBlender':list(normal),'radiusRangeM':[min(radii),max(radii)],'caseHalfThicknessM':halfThickness,'stalkTipErrorM':(tip-target).length,'stalkTipAxialDistanceM':axial,'stalkTipRadialDistanceM':radial,'assumedEyePointBlenderM':list(eye),'reflectedSceneDirection':list(rear),'historicalConfigurationProven':False,'scope':'Actual delivered circle and stalk geometry; eye point and32degree adjustment are reconstruction parameters, not historical measurements or whole-photo acceptance.'}

def VerifyImportedPrimaryCanvas(root,check):
    names={int(k):v for k,v in root['SourcePartNames'].items()};main=[];bows={}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attr=obj.data.attributes.get('_SOURCE_PART_ID')
        if attr is None:continue
        for i,v in enumerate(attr.data):
            name=names[int(round(v.value))];p=obj.matrix_world@obj.data.vertices[i].co
            if name=='Canvas_MainCover':main.append(p)
            if name.startswith('Cargo_CanvasBow'):bows.setdefault(name,[]).append(p)
    top=max((p.z for p in main),default=-1);declared=float(root['PrimaryCanvasSourceMainTopM'])
    check(bool(main) and abs(top-declared)<.010,'Actual upper canvas retains declared source envelope within10mm; not factory overall height',{'actualTopM':top,'declaredSourceTopM':declared})
    rows=[{'name':n,'minZ':min(p.z for p in ps),'maxZ':max(p.z for p in ps)} for n,ps in bows.items()]
    check(len(rows)==4 and all(r['maxZ']>2.60 and r['minZ']<1.80 for r in rows),'All four actual primary-profile support bows span lower mounting to raised roof',rows)
    return {'actualMainTopM':top,'sourceMainTopM':declared,'bowHeights':rows,'factoryOverallCoverHeightProven':False,'wholeReferenceAccepted':False}


def Verify():
    wheelSpec=importlib.util.spec_from_file_location('VerifySourceWheelLod',str(WORKSPACE/'Taierzhuang1938/_blender/Script_IsuzuType94TruckWheelLod.py'));wheelLod=importlib.util.module_from_spec(wheelSpec);wheelSpec.loader.exec_module(wheelLod)
    cabSpec=importlib.util.spec_from_file_location('VerifySourceCabLod',str(WORKSPACE/'Taierzhuang1938/_blender/Script_IsuzuType94TruckCabLod.py'));cabLod=importlib.util.module_from_spec(cabSpec);cabSpec.loader.exec_module(cabLod)
    sourceSamples={obj.name:wheelLod.SourcePart(obj) for obj in bpy.data.objects if obj.type=='MESH' and (obj.name=='Cabin_CamberedRoof' or obj.name.startswith('Wheel_') and ('_Lug' in obj.name or obj.name.endswith(('_Hub','_HubCap'))))}
    headerSource=wheelLod.SourcePart(bpy.data.objects['Canvas_FrontHeaderValance'])
    if len(sourceSamples)!=61:raise RuntimeError('Actual verification requires current high-source roof and60wheel hardware parts')
    if not bpy.data.filepath or not Path(bpy.data.filepath).resolve().is_relative_to(SOURCE.resolve()):
        raise RuntimeError('Verification may replace only this task\'s saved Blender scene')
    report={'file':str(FILE),'sha256':hashlib.sha256(FILE.read_bytes()).hexdigest(),'source':bpy.data.filepath,'checks':[]}
    def Check(ok,name,actual=None):
        report['checks'].append({'passed':bool(ok),'name':name,'actual':actual})
    # Measure the authored high-source cab before replacing the saved game scene.
    roof=bpy.data.objects.get('Source_Cabin_CamberedRoof') or bpy.data.objects.get('Cabin_CamberedRoof')
    if roof:
        height=max((roof.matrix_world@v.co).z for v in roof.data.vertices)
        Check(abs(height-2.25)<.001,'Source cab roof matches factory 2.250m anchor',height)
    for obj in list(bpy.data.objects):bpy.data.objects.remove(obj,do_unlink=True)
    for action in list(bpy.data.actions):bpy.data.actions.remove(action)
    for material in list(bpy.data.materials):bpy.data.materials.remove(material)
    # The authoring AO helper is not part of GLB. Drop unused source node groups
    # so this is genuinely a clean importer check rather than reusing a legacy
    # settings group with a different Blender-version socket interface.
    for group in list(bpy.data.node_groups):
        if group.users==0:bpy.data.node_groups.remove(group)
    for image in list(bpy.data.images):
        if image.type!='RENDER_RESULT':bpy.data.images.remove(image)
    window=bpy.context.window_manager.windows[0];area=next((a for a in window.screen.areas if a.type=='VIEW_3D'),window.screen.areas[0]);region=next((r for r in area.regions if r.type=='WINDOW'),None)
    with bpy.context.temp_override(window=window,area=area,region=region):bpy.ops.import_scene.gltf(filepath=str(FILE),merge_vertices=False)
    scene=bpy.context.scene;scene.frame_set(0);root=bpy.data.objects.get('IsuzuType94Truck')
    Check(root is not None,'Real GLB imports with the correct root')
    if not root:raise RuntimeError('No truck root after import')
    partNames={int(k):v for k,v in root.get('SourcePartNames',{}).items()};panePoints={-1:[],1:[]}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        attr=obj.data.attributes.get('_SOURCE_PART_ID')
        if attr is None:continue
        for i,value in enumerate(attr.data):
            name=partNames.get(int(round(value.value)),'')
            for side in [-1,1]:
                if name=='Windshield_Glass'+str(side):panePoints[side].append(obj.matrix_world@obj.data.vertices[i].co)
    deviations={}
    for side,points in panePoints.items():
        unique=list({tuple(round(v,6) for v in point):point for point in points}.values());deviation=float('inf')
        if len(unique)>=3:
            origin=unique[0];normal=None
            for a in unique[1:]:
                for b in unique[2:]:
                    cross=(a-origin).cross(b-origin)
                    if cross.length>1e-7:normal=cross.normalized();break
                if normal is not None:break
            if normal is not None:deviation=max(abs((point-origin).dot(normal)) for point in unique)
        deviations[str(side)]=deviation
    Check(all(value<.0001 for value in deviations.values()),'Actual exported front glazing retains two planar panes within0.1mm',deviations)
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();cloud=[];fixedCloud=[];canvasCloud=[];triangles=0;degenerate=0;meshes=[]
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        meshes.append(obj.name);ev=obj.evaluated_get(deps);mesh=ev.to_mesh();mesh.calc_loop_triangles();matrix=obj.matrix_world
        labels=mesh.attributes.get('_SOURCE_PART_ID')
        for index,vertex in enumerate(mesh.vertices):
            point=tuple(matrix@vertex.co);cloud.append(point)
            cloth=partNames.get(int(round(labels.data[index].value)),'').startswith('Canvas_') if labels else False
            if cloth:canvasCloud.append(point)
            elif point[2]<1.8:fixedCloud.append(point)
        triangles+=len(mesh.loop_triangles)
        for triangle in mesh.loop_triangles:
            p=[matrix@mesh.vertices[i].co for i in triangle.vertices]
            if (p[1]-p[0]).cross(p[2]-p[0]).length<1e-12:degenerate+=1
        ev.to_mesh_clear()
    minimum=[min(p[k] for p in cloud) for k in range(3)];maximum=[max(p[k] for p in cloud) for k in range(3)]
    nominalWidth=max(p[0] for p in cloud if p[2]<1.8)-min(p[0] for p in cloud if p[2]<1.8)
    fixedWidth=max(p[0] for p in fixedCloud)-min(p[0] for p in fixedCloud)
    canvasWidth=max(p[0] for p in canvasCloud)-min(p[0] for p in canvasCloud)
    lowerCanvas=[p for p in canvasCloud if p[2]<1.8]
    lowerCanvasWidth=max(p[0] for p in lowerCanvas)-min(p[0] for p in lowerCanvas)
    Check(0<triangles<=80000,'Imported runtime stays within 80k vehicle budget',triangles)
    Check(degenerate==0,'Imported geometry contains no zero-area triangles',degenerate)
    # Front bumper extent2.448 + rear tailgate bolt extent2.952.
    Check(abs(maximum[1]-minimum[1]-5.400)<.003,'Actual complete extent matches factory nominal5.400m within3mm',maximum[1]-minimum[1])
    Check(abs(fixedWidth-1.9)<.003,'Fixed body below mirrors retains1.900m within3mm; loose textile excluded by actual part ID',{'fixedWidthM':fixedWidth,'bodyWithLooseClothWidthM':nominalWidth})
    Check(1.90<lowerCanvasWidth<1.97,'Actual lower loose canvas and bindings have a separately measured narrow overhang below1.8m',{'lowerCanvasWidthM':lowerCanvasWidth,'completeCanvasWidthM':canvasWidth})
    Check(abs(minimum[2])<.0002,'Tyres contact the authoring ground plane',minimum[2])
    points={name:list(bpy.data.objects[name].matrix_world.translation) for name in ['Wheel_FrontLeft','Wheel_FrontRight','Wheel_Rear1Left','Wheel_Rear1Right','Wheel_Rear2Left','Wheel_Rear2Right']}
    Check(abs(points['Wheel_FrontRight'][0]-points['Wheel_FrontLeft'][0]-1.5)<1e-5,'Reimported front track is 1.500m',points)
    Check(abs(points['Wheel_Rear1Right'][0]-points['Wheel_Rear1Left'][0]-1.45)<1e-5,'Reimported rear track is 1.450m')
    Check(abs(points['Wheel_FrontLeft'][1]-points['Wheel_Rear1Left'][1]-2.8)<1e-5,'Reimported first wheelbase is 2.800m')
    Check(abs(points['Wheel_Rear1Left'][1]-points['Wheel_Rear2Left'][1]-1.1)<1e-5,'Reimported tandem wheelbase is 1.100m')
    images=[{'name':image.name,'width':image.size[0],'height':image.size[1],'colourSpace':image.colorspace_settings.name} for image in bpy.data.images if image.type=='IMAGE']
    Check(len(images)==24 and all(i['width']==2048 and i['height']==2048 for i in images),'All 24 actual Base/Normal/ORM images import at 2048px',images)
    pivotNames=[o.name for o in root.children_recursive if o.type=='EMPTY' and o.get('MotionAxisBlender')]
    Check(len(pivotNames)==19 and all(name in pivotNames for name in ['RearCheek_Left','RearCheek_Right']),'Nineteen operating nodes include two independent rear service leaves',pivotNames)
    Check(all(name in pivotNames for name in ['Door_Left','Door_Right','Hood_Left','Hood_Right','Steer_Left','Steer_Right','Tailgate','SteeringWheel','SteeringTieRod']),'Independent operating nodes survive real reimport',pivotNames)
    Check(all(bpy.data.objects[name].parent.name.startswith('Steer_') for name in ['Wheel_FrontLeft','Wheel_FrontRight']),'Front wheel rolling nodes remain below steering pivots')
    Check(all(abs(value-1)<1e-5 for obj in root.children_recursive for value in obj.scale),'No exported node uses deformation through scale')
    for name in ['Hood_Left','Hood_Right','HoodSide_Left','HoodSide_Right']:
        obj=bpy.data.objects[name];raw=list(obj.get('HingeClosedEndpointsGltf',[]))
        if len(raw)!=6:
            Check(False,'Reimported hinge carries source sheet-edge evidence: '+name)
            continue
        endpoints=[Vector((raw[i],-raw[i+2],raw[i+1])) for i in [0,3]]
        edge=(endpoints[1]-endpoints[0]).normalized();axis=(obj.matrix_world.to_3x3()@Vector((0,1,0))).normalized()
        angle=min(axis.angle(edge),axis.angle(-edge))
        distance=max((point-obj.matrix_world.translation).cross(axis).length for point in endpoints)
        Check(angle<1e-5 and distance<.0001,'Reimported physical hinge coincides with source sheet edge: '+name,{'angleRad':angle,'distanceM':distance})
    for name in ['Door_Left','Door_Right','Tailgate','SteeringWheel','Steer_Left','Steer_Right','RearCheek_Left','RearCheek_Right']:
        obj=bpy.data.objects[name];raw=list(obj.get('MechanicalAxisClosedEndpointsGltf',[]))
        if len(raw)!=6:
            Check(False,'Physical hardware axis evidence survived reimport: '+name)
            continue
        points=[Vector((raw[i],-raw[i+2],raw[i+1])) for i in [0,3]]
        axisName=obj['MotionAxisBlender'];axis=(obj.matrix_world.to_3x3()@Vector({'X':(1,0,0),'Z':(0,0,1)}[axisName])).normalized()
        distance=max((point-obj.matrix_world.translation).cross(axis).length for point in points)
        Check(distance<.0001,'Imported joint matches actual source hardware centreline: '+name,distance)
    report['engineAssembly']=VerifyImportedEngineAssembly(root,Check)
    report['cowlJunction']=VerifyImportedCowlJunction(root,Check)
    report['canopySupport']=VerifyImportedCanopySupport(root,Check)
    report['canopyBowClearance']=VerifyImportedCanopyBowClearance(root,Check)
    report['canvasHeaderSurface']=VerifyImportedCanvasHeader(root,headerSource,Check)
    report['rearFenderCargoClearance']=VerifyImportedRearFenderContacts(root,Check)
    report['clothCargoClearance']=VerifyImportedClothCargo(root,Check)
    report['frontBumperAttachments']=VerifyImportedFrontBumper(root,Check)
    report['wearSurfaces']=VerifyImportedWearSurfaces(root,Check)
    report['canvasClosureContours']=VerifyImportedClosureContours(root,Check)
    report['canvasClosureMainClearance']=VerifyImportedClosureMainClearance(root,Check)
    report['runtimeClearance']=VerifyImportedBonnetClearance(root,scene,Check)
    report['doorRoofClearance']=VerifyImportedDoorRoofClearance(root,scene,Check)
    report['sideSpare']=VerifyImportedSideSpare(root,scene,Check)
    report['wheelNutSeats']=VerifyImportedWheelNutSeats(root,Check)
    report['cabWheelSourceSampling']=cabLod.VerifyCurrentSamples(root,sourceSamples,Check)
    report['pressedWheelDiscs']=VerifyImportedPressedDiscs(root,Check)
    report['wheelSurfaces']=VerifyImportedWheelSurfaces(root,Check)
    report['analyticRims']=VerifyImportedAnalyticRims(root,Check)
    report['primaryCabProfile']=VerifyImportedPrimaryCab(root,Check)
    report['primaryDoorSill']=VerifyImportedPrimaryDoorSill(root,Check)
    report['frontWingProfile']=VerifyImportedFrontWingProfile(root,Check)
    report['radiatorGrid']=VerifyImportedRadiatorGrid(root,Check)
    report['noseService']=VerifyImportedNoseService(root,Check)
    report['surfaceNormals']=VerifyImportedSurfaceNormals(root,Check)
    report['farMirrorPose']=VerifyImportedFarMirrorPose(root,Check)
    report['primaryCanvasProfile']=VerifyImportedPrimaryCanvas(root,Check)
    report.update({'triangles':triangles,'meshes':len(meshes),'boundsBlender':{'min':minimum,'max':maximum},'bodyWidthExcludingMirrorsM':nominalWidth,'fixedBodyWidthBelowMirrorsM':fixedWidth,'looseCanvasAndBindingsWidthM':canvasWidth,'lowerLooseCanvasAndBindingsWidthM':lowerCanvasWidth,'pivotNames':pivotNames,'images':images,'importedActions':[a.name for a in bpy.data.actions]})
    spec=importlib.util.spec_from_file_location('TruckStudio',str(WORKSPACE/'Taierzhuang1938/_blender/Script_IsuzuType94TruckBuild.py'));B=importlib.util.module_from_spec(spec);spec.loader.exec_module(B);B.MATS=B.Materials();B.ROOT=root;B.Studio()
    scene['ModelStage']='ExportReimportVerification';scene['IsuzuWorkspace']=str(WORKSPACE);scene['VerifiedGlbSha256']=report['sha256']
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'Scene_IsuzuType94TruckReimport.blend'),compress=True)
    B.Render(file='Scene_ReimportClosed.png',width=1800,height=1035)
    B.PoseReferenceInspection()
    B.Render(name='Camera_ProductionMatch',file='Scene_ReimportReference.png',width=1800,height=1230)
    failed=[c for c in report['checks'] if not c['passed']];report['failed']=failed
    (QA/'Data_ReimportVerification.json').write_text(json.dumps(report,indent=2,allow_nan=False),encoding='utf8');print(json.dumps({'triangles':triangles,'meshes':len(meshes),'checks':len(report['checks']),'failed':failed,'bounds':report['boundsBlender']}))
    if failed:raise RuntimeError('Real GLB reimport verification failed')

if __name__ in ('__main__','builtins'):Verify()
