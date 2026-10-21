"""Fit the actual front game tape over the actual game cloth, not only HighV10.

Only pack-local Y can change.  X/Z route, width and high-source references
remain fixed.  Projected low-triangle overlap vertices plus dense barycentric
samples constrain the entire piecewise-planar front; actual BVH distances are
then checked at every retained sample.  No texture or source mesh is changed.
"""
import math

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree


generator='SichuanMainBindingClearanceV10'
baselineName='MainBindingClearanceBaselineV10'


def Cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])


def Weights(point,triangle):
    a,b,c=triangle;den=Cross(a,b,c)
    if abs(den)<1e-14:return None
    values=[Cross(point,b,c)/den,Cross(a,point,c)/den,Cross(a,b,point)/den]
    values=[max(0.0,min(1.0,value))for value in values]
    total=sum(values)
    return tuple(value/total for value in values)if total else None


def Clip(subject,clip):
    clip=list(clip)
    if Cross(*clip)<0:clip.reverse()
    result=list(subject)
    for a,b in zip(clip,clip[1:]+clip[:1]):
        old,result=result,[]
        if not old:break
        for p,q in zip(old,old[1:]+old[:1]):
            sp,sq=Cross(a,b,p),Cross(a,b,q)
            insideP,insideQ=sp>=-1e-13,sq>=-1e-13
            if insideP:result.append(p)
            if insideP!=insideQ and abs(sp-sq)>1e-20:
                fraction=sp/(sp-sq)
                result.append(tuple(p[axis]+(q[axis]-p[axis])*fraction for axis in (0,1)))
    return result


def MinimumBoundedShifts(constraints,vertices,maximumShiftM,toleranceM=2e-9,maxSweeps=3000):
    """Hildreth projection: minimum squared shift under sparse half-spaces.

    Unlike one-way sequential pushes, dual corrections can undo an earlier
    displacement when a later constraint supplies the shared support instead.
    Explicit lower/upper half-spaces make the physical displacement cap part
    of the optimization, rather than a silent final clamp.
    """
    compact={vertex:index for index,vertex in enumerate(sorted(vertices))}
    unique={}
    for ids,weights,required in constraints:
        key=tuple(sorted((compact[vertex],round(weight,10))for vertex,weight in zip(ids,weights)if weight>1e-12))
        if not key:continue
        unique[key]=max(unique.get(key,float('-inf')),required)
    rows=[(tuple(index for index,weight in key),tuple(weight for index,weight in key),required)
          for key,required in unique.items()if required>0]
    for index in range(len(compact)):
        rows.append(((index,),(-1.0,),-maximumShiftM))
        rows.append(((index,),(1.0,),0.0))
    norms=[sum(weight*weight for weight in weights)for ids,weights,required in rows]
    dual=[0.0]*len(rows);values=[0.0]*len(compact)
    for sweep in range(maxSweeps):
        maximumChange=0.0
        for row,((ids,weights,required),norm)in enumerate(zip(rows,norms)):
            deficit=required-sum(values[index]*weight for index,weight in zip(ids,weights))
            updated=max(0.0,dual[row]+deficit/norm)
            change=updated-dual[row]
            if change:
                for index,weight in zip(ids,weights):values[index]+=change*weight
                maximumChange=max(maximumChange,abs(change)*math.sqrt(norm))
                dual[row]=updated
        if maximumChange<=toleranceM:
            violation=max((required-sum(values[index]*weight for index,weight in zip(ids,weights))
                           for ids,weights,required in rows),default=0.0)
            if violation<=toleranceM:break
    else:raise RuntimeError('Bounded minimum-displacement tape solve did not converge')
    if min(values,default=0)<-toleranceM or max(values,default=0)>maximumShiftM+toleranceM:
        raise RuntimeError('Bounded tape solver exceeded its physical displacement limits')
    return {vertex:max(0.0,min(maximumShiftM,values[index]))for vertex,index in compact.items()}, {
        'method':'Hildreth sparse dual half-space projection; minimum sum of squared Y shifts',
        'sweeps':sweep+1,'uniqueSupportConstraints':len(unique),'variableVertices':len(compact),
        'maximumConstraintViolationM':max(0.0,violation),'maximumOutwardShiftM':max(values,default=0.0),
        'sumSquaredShiftM2':sum(value*value for value in values),'hardShiftLimitM':maximumShiftM}


def ConformMainBindingToGameBundle(root,clearanceM=.0003,barySteps=6,maxIterations=8,maximumShiftM=.006):
    if root is None or root.name!='Pack_Root':raise RuntimeError('Pass the actual game Pack_Root')
    if not math.isfinite(clearanceM)or not 0<clearanceM<=.002:raise RuntimeError('Use a physical tape clearance up to 2 mm')
    if not math.isfinite(maximumShiftM)or not 0<maximumShiftM<=.006:raise RuntimeError('Tape repair displacement cannot exceed 6 mm')
    objects={obj.name:obj for obj in root.children_recursive}
    tape=objects.get('Game_ContinuousClothStrap')
    surfaces=[objects.get(name)for name in ('Game_RelaxedFrontLeafV10','Game_BundleEnvelopeV10')]
    if tape is None or any(obj is None for obj in surfaces):raise RuntimeError('Actual main tape, front leaf and envelope are required')
    if tape.modifiers or any(obj.modifiers for obj in surfaces):raise RuntimeError('Conform only frozen game geometry')
    references={key:tape.get(key)for key in ('SourceHighObject','BakeSourceNames','PackSourceName','SupportHighObject')}
    if tape.data.users>1:tape.data=tape.data.copy()
    mesh=tape.data;trianglesBefore=sum(len(face.vertices)-2 for face in mesh.polygons)
    if any(len(face.vertices)!=3 for face in mesh.polygons):
        bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free();mesh.update()
    baseline=mesh.attributes.get(baselineName)
    if baseline is None:
        baseline=mesh.attributes.new(baselineName,'FLOAT_VECTOR','POINT')
        for vertex,value in zip(mesh.vertices,baseline.data):value.vector=vertex.co
    if baseline.domain!='POINT'or baseline.data_type!='FLOAT_VECTOR'or len(baseline.data)!=len(mesh.vertices):
        raise RuntimeError('Tape baseline attributes do not match its actual vertices')
    intoRoot=root.matrix_world.inverted_safe()@tape.matrix_world
    intoTape=intoRoot.inverted_safe()
    original=[intoRoot@value.vector for value in baseline.data]
    current=[intoRoot@vertex.co for vertex in mesh.vertices]
    triangles=[tuple(face.vertices)for face in mesh.polygons]
    bodyPoints,bodyFaces,bodyTriangles=[],[],[]
    for surface in surfaces:
        transform=root.matrix_world.inverted_safe()@surface.matrix_world
        surface.data.calc_loop_triangles();offset=len(bodyPoints)
        points=[transform@vertex.co for vertex in surface.data.vertices]
        bodyPoints.extend(points)
        for triangle in surface.data.loop_triangles:
            ids=tuple(triangle.vertices);bodyFaces.append(tuple(offset+index for index in ids))
            p=[points[index]for index in ids];xz=[(point.x,point.z)for point in p]
            if abs(Cross(*xz))>1e-12:
                bodyTriangles.append({'points':p,'xz':xz,'low':(min(q[0]for q in xz),min(q[1]for q in xz)),
                                      'high':(max(q[0]for q in xz),max(q[1]for q in xz))})
    tree=BVHTree.FromPolygons(bodyPoints,bodyFaces,all_triangles=True)
    rayStart=min(point.y for point in bodyPoints)-.05
    rayLength=max(point.y for point in bodyPoints)-rayStart+.05
    safety=.000002
    selected=[];constraints=[];samples=[];overlaps=0;rejected=[]
    for index,ids in enumerate(triangles):
        p=[original[vertex]for vertex in ids]
        normal=(p[1]-p[0]).cross(p[2]-p[0])
        if normal.length<1e-14:continue
        center=sum(p,Vector())/3
        # Back transfers, free shoulder loops and side/top-facing segments
        # keep their source route.  A shared front-transition row can follow.
        # The top/bottom transfer sheets overlap the blanket in X/Z while
        # passing around its edge. They are not its front-facing tape. The
        # failed loose normal test (.25) pulled those transfers forward by
        # 81 mm. Actual front sheets are strongly Y-facing (measured >=.88).
        if center.y>=-.065 or abs(normal.normalized().y)<.65:continue
        xz=[(point.x,point.z)for point in p]
        if abs(Cross(*xz))<1e-12:continue
        faceConstraints=[];faceSamples=[];faceOverlaps=0
        low=(min(q[0]for q in xz),min(q[1]for q in xz));high=(max(q[0]for q in xz),max(q[1]for q in xz))
        for body in bodyTriangles:
            if any(body['high'][axis]<low[axis]-1e-10 or body['low'][axis]>high[axis]+1e-10 for axis in (0,1)):continue
            polygon=Clip(body['xz'],xz)
            if not polygon:continue
            faceOverlaps+=1
            for point in polygon:
                weights=Weights(point,xz);bodyWeights=Weights(point,body['xz'])
                if weights is None or bodyWeights is None:continue
                y=sum(weight*q.y for weight,q in zip(bodyWeights,body['points']))
                required=sum(q.y*weight for q,weight in zip(p,weights))-y+clearanceM+safety
                faceConstraints.append((ids,weights,required))
                faceSamples.append((ids,weights))
        for a in range(barySteps+1):
            for b in range(barySteps-a+1):
                weights=(a/barySteps,b/barySteps,1-(a+b)/barySteps)
                point=sum((q*weight for q,weight in zip(p,weights)),Vector())
                hit=tree.ray_cast(Vector((point.x,rayStart,point.z)),Vector((0,1,0)),rayLength)[0]
                if hit is not None:
                    required=point.y-hit.y+clearanceM+safety
                    faceConstraints.append((ids,weights,required))
                faceSamples.append((ids,weights))
        maximumRequired=max((required for ids,weights,required in faceConstraints),default=0)
        if maximumRequired>maximumShiftM:
            rejected.append({'triangle':index,'vertices':list(ids),'center':list(center),
                             'normalY':normal.normalized().y,'maximumProjectedRequiredShiftM':maximumRequired,
                             'reason':'Not a local front support within the hard displacement limit'})
            continue
        if faceConstraints:
            selected.append(index);constraints.extend(faceConstraints);samples.extend(faceSamples);overlaps+=faceOverlaps
    if not selected or not constraints:raise RuntimeError('No actual front tape/cloth overlap was found')
    movedCandidates={vertex for index in selected for vertex in triangles[index]}
    # Restore every vertex from this helper's own saved original baseline.
    # This also repairs a previous failed version's transferred vertices when
    # they are correctly excluded by the stricter front-face classification.
    output=[point.copy()for point in original]
    solves=[];extraDistanceCorrections=0
    # The projection test above excludes intersections everywhere on each
    # overlapping pair of planar triangles.  This second check enforces true
    # 3D distance at all critical and dense barycentric sample points too.
    for iteration in range(maxIterations):
        shifts,solve=MinimumBoundedShifts(constraints,movedCandidates,maximumShiftM)
        solves.append(solve)
        for vertex in movedCandidates:output[vertex].y=original[vertex].y-shifts[vertex]
        additions=[]
        for ids,weights in samples:
            point=sum((output[vertex]*weight for vertex,weight in zip(ids,weights)),Vector())
            nearest=tree.find_nearest(point)
            if nearest[0]is None:raise RuntimeError('Actual cloth BVH became empty')
            if nearest[3]>=clearanceM+safety*.25:continue
            available=sum((maximumShiftM-shifts[vertex])*weight for vertex,weight in zip(ids,weights))
            candidate=point.copy();candidate.y-=available
            if available<=0 or tree.find_nearest(candidate)[3]<clearanceM+safety:
                raise RuntimeError('True tape/cloth clearance would require exceeding 6 mm: '+str((ids,weights,tuple(point),nearest[3])))
            lo,hi=0.0,available
            for attempt in range(28):
                middle=(lo+hi)/2;candidate.y=point.y-middle
                if tree.find_nearest(candidate)[3]>=clearanceM+safety:hi=middle
                else:lo=middle
            required=sum(shifts[vertex]*weight for vertex,weight in zip(ids,weights))+hi
            additions.append((ids,weights,required));extraDistanceCorrections+=1
        if not additions:break
        constraints.extend(additions)
    else:raise RuntimeError('Physical tape/cloth clearance did not converge inside its hard displacement limit')
    # Validate in working coordinates before making any geometry mutation.
    actual=output
    maximumXZ=max((math.hypot(a.x-b.x,a.z-b.z)for a,b in zip(actual,current)),default=0)
    if maximumXZ>1e-7:raise RuntimeError('Tape conformance changed its X/Z route or width')
    minimumGap=float('inf');minimumDistance=float('inf')
    for ids,weights,required in constraints:
        shift=sum((original[vertex].y-actual[vertex].y)*weight for vertex,weight in zip(ids,weights))
        minimumGap=min(minimumGap,shift-required+clearanceM+safety)
    for ids,weights in samples:
        point=sum((actual[vertex]*weight for vertex,weight in zip(ids,weights)),Vector())
        minimumDistance=min(minimumDistance,tree.find_nearest(point)[3])
    if minimumGap<clearanceM-1e-7 or minimumDistance<clearanceM-1e-7:
        raise RuntimeError('Measured game tape clearance remains below target: '+str((minimumGap,minimumDistance,clearanceM)))
    maximumShift=max((original[index].y-actual[index].y for index in movedCandidates),default=0)
    if maximumShift>maximumShiftM+1e-7:raise RuntimeError('Tape conformance exceeded its hard 6 mm displacement limit')
    for key,value in references.items():
        if tape.get(key)!=value:raise RuntimeError('Tape high-source reference changed')
    after=sum(len(face.vertices)-2 for face in mesh.polygons)
    if after!=trianglesBefore:raise RuntimeError('Tape conformance changed actual triangle count')
    for vertex,point in enumerate(output):mesh.vertices[vertex].co=intoTape@point
    mesh.update()
    tape['GameBindingClearanceGenerator']=generator
    tape['GameBindingClearanceM']=clearanceM
    return {'generator':generator,'object':tape.name,'surfaces':[obj.name for obj in surfaces],
            'frontTriangles':len(selected),'actualTriangles':after,'trianglesUnchanged':True,
            'projectedSurfaceTriangleOverlaps':overlaps,'planarCriticalConstraints':len(constraints),
            'barycentricAndCriticalSamples':len(samples),'barycentricGridSteps':barySteps,
            'clearanceTargetM':clearanceM,'minimumProjectedOutwardGapM':minimumGap,
            'minimumActualBvhDistanceM':minimumDistance,'maxXZChangeM':maximumXZ,
            'maxAdditionalOutwardYM':maximumShift,'hardMaximumOutwardYM':maximumShiftM,
            'movedVertices':sum((actual[index]-current[index]).length>1e-8 for index in movedCandidates),
            'extraBvhDistanceCorrections':extraDistanceCorrections,
            'minimumDisplacementSolves':solves,'rejectedNonlocalTriangles':rejected,
            'frontNormalAbsoluteYThreshold':.65,
            'originalSourceReferences':references,'sourceReferencesUnchanged':True,
            'geometryMethod':'Strongly front-facing local tape only; bounded minimum squared -Y shift; actual low triangle overlap extrema and BVH clearance',
            'baselineAttribute':baselineName,'reentrantFromOriginalBaseline':True}
