"""Keep the complete folded civilian garment and its actual V10 cloth knot.

The exposed corner is reduced separately, so its high tessellation cannot
consume the concealed torso, collar and sleeves.  The source assembly is read
only.  All output vertices use the receiving game part's local space.
"""
import math
import array
import hashlib
import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform


generator = 'SichuanGameJacketV10'


def SourceName(obj):
    return obj.get('PackSourceName', obj.name)


def TriangleCount(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def SimpleMaterial(button=False):
    name = 'Material_GameSichuanClothButtonV10' if button else 'Material_GameSichuanJacketV10'
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (.09, .115, .13, 1) if button else (.065, .095, .12, 1)
        bsdf.inputs['Roughness'].default_value = .96
        bsdf.inputs['Metallic'].default_value = 0
    material.use_backface_culling = False
    return material


def EvaluatedData(source, gamePart):
    evaluated = source.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    try:
        transform = gamePart.matrix_world.inverted_safe() @ source.matrix_world
        positions = [transform @ vertex.co for vertex in mesh.vertices]
        layer = mesh.uv_layers.get('SurfaceUV') or mesh.uv_layers.active
        assert layer is not None, 'The jacket must retain its authored surface UV'
        polygons = []
        for polygon in mesh.polygons:
            polygons.append((tuple(polygon.vertices), [layer.data[index].uv.copy()
                                                      for index in polygon.loop_indices]))
        return positions, polygons
    finally:
        evaluated.to_mesh_clear()


def CreateMesh(name, positions, polygons, gamePart, material, source):
    used = sorted({index for vertices, uv in polygons for index in vertices})
    remap = {index: compact for compact, index in enumerate(used)}
    mesh = bpy.data.meshes.new(name + 'Mesh')
    mesh.from_pydata([positions[index] for index in used], [], [
        tuple(remap[index] for index in vertices) for vertices, uv in polygons])
    mesh.update()
    layer = mesh.uv_layers.new(name='SurfaceUV')
    for polygon, (_, coordinates) in zip(mesh.polygons, polygons):
        for loopIndex, uv in zip(polygon.loop_indices, coordinates):
            layer.data[loopIndex].uv = uv
        polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = gamePart
    mesh.materials.append(material)
    obj['PackSourceName'] = SourceName(source)
    obj['GameGenerator'] = generator
    obj['SourceHighObject'] = source.name
    return obj


def DissolveCoplanar(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(.75),
                            verts=list(bm.verts), edges=list(bm.edges),
                            use_dissolve_boundaries=False, delimit={'MATERIAL'})
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def LimitTriangles(obj, target):
    """Collapse only this freshly created game mesh, never the source mesh."""
    before = TriangleCount(obj)
    if before <= target:
        return before
    assert target >= 4
    modifier = obj.modifiers.new('GameGarmentReduction', 'DECIMATE')
    modifier.decimate_type = 'COLLAPSE'
    modifier.use_collapse_triangulate = True
    # Search the actual evaluated triangle result instead of assuming ratio
    # times polygon count equals exported triangles for the original n-gons.
    lower, upper = 0.0, 1.0
    best = None
    for iteration in range(12):
        ratio = target / before if iteration == 0 else (lower + upper) * .5
        modifier.ratio = max(.0001, min(.9999, ratio))
        bpy.context.view_layer.update()
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True,
                                              depsgraph=bpy.context.evaluated_depsgraph_get())
        mesh.calc_loop_triangles()
        triangles = len(mesh.loop_triangles)
        if triangles <= target and triangles > 0:
            lower = ratio
            if best is not None:
                bpy.data.meshes.remove(best)
            best = mesh
        else:
            upper = ratio
            bpy.data.meshes.remove(mesh)
        if triangles == target:
            break
    obj.modifiers.remove(modifier)
    assert best is not None, (obj.name, target)
    old = obj.data
    obj.data = best
    if old.users == 0:
        bpy.data.meshes.remove(old)
    if obj.data.uv_layers.get('SurfaceUV'):
        obj.data.uv_layers.active = obj.data.uv_layers['SurfaceUV']
    return TriangleCount(obj)


def IsExposedCorner(vertices, coordinates, positions):
    for index, uv in zip(vertices, coordinates):
        point = positions[index]
        expectedV = .02 + .46 * (.90 + (point.z - .144) / .56)
        if not (.785 < uv.x < .820 and abs(uv.y - expectedV) < .010
                and point.x > .103 and point.z > .071):
            return False
    return True


def RingButton(source, gamePart):
    """Retain both actual closed cloth paths as double-sided cotton ribbons."""
    positions, polygons = EvaluatedData(source, gamePart)
    # The V7 rounded cloth knot remains the V10 source.  Its figure-eight tube
    # has 72 by 12 vertices; its loop eye has 40 by 10.  Verify before reading.
    assert len(positions) == 72 * 12 + 40 * 10, (
        'Unexpected current cloth-knot topology', len(positions))
    resultPositions, resultPolygons = [], []
    offset = 0
    for ringCount, columns, samples in ((72, 12, 6), (40, 10, 6)):
        start = len(resultPositions)
        rowIndices = [round(index * ringCount / samples) % ringCount
                      for index in range(samples)]
        columnIndices = [0, columns // 2]
        for row in rowIndices:
            resultPositions.extend(positions[offset + row * columns + column].copy()
                                   for column in columnIndices)
        for row in range(samples):
            ids = (start + row * 2, start + row * 2 + 1,
                   start + ((row + 1) % samples) * 2 + 1,
                   start + ((row + 1) % samples) * 2)
            coordinates = []
            for index in ids:
                point = resultPositions[index]
                coordinates.append(Vector((.70 + point.x - .15,
                                           .45 + point.z - .12)))
            resultPolygons.append((ids, coordinates))
        offset += ringCount * columns
    obj = CreateMesh('Game_ClothKnotButton', resultPositions, resultPolygons,
                     gamePart, SimpleMaterial(True), source)
    obj['ClosedClothKnot'] = True
    obj['SourceTubes'] = 2
    obj['GameTwoSidedCloth'] = True
    obj['GameKnotConstruction'] = 'Two actual closed paths; six-station double-sided cotton ribbons'
    return obj


def MaximumSurfaceDistance(points, obj):
    obj.data.calc_loop_triangles()
    tree = BVHTree.FromPolygons([vertex.co.copy() for vertex in obj.data.vertices],
                               [tuple(triangle.vertices) for triangle in obj.data.loop_triangles],
                               all_triangles=True)
    values = [tree.find_nearest(point)[3] for point in points]
    assert all(value is not None for value in values)
    return max(values, default=0)


def UvArea(mesh):
    mesh.calc_loop_triangles()
    uv = mesh.uv_layers.get('SurfaceUV') or mesh.uv_layers.active
    result=0
    for triangle in mesh.loop_triangles:
        a=uv.data[triangle.loops[1]].uv-uv.data[triangle.loops[0]].uv
        b=uv.data[triangle.loops[2]].uv-uv.data[triangle.loops[0]].uv
        result+=abs(a.x*b.y-a.y*b.x)*.5
    return result


def LegacySampleCornerUv(corner, target=72):
    """Unused legacy experiment: folded source UVs are not a unique 3D map."""
    mesh = corner.data
    mesh.calc_loop_triangles()
    uvLayer = mesh.uv_layers['SurfaceUV']
    values = sorted(set(tuple(point.uv) for point in uvLayer.data))
    def Cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    lower,upper=[],[]
    for p in values:
        while len(lower)>1 and Cross(lower[-2],lower[-1],p)<=1e-9:lower.pop()
        lower.append(p)
    for p in reversed(values):
        while len(upper)>1 and Cross(upper[-2],upper[-1],p)<=1e-9:upper.pop()
        upper.append(p)
    hull=lower[:-1]+upper[:-1]
    if len(hull)<3:raise RuntimeError('Actual exposed corner UV footprint is degenerate')
    sourceUv,sourcePoints,sourceFaces=[],[],[]
    sourceSign=0
    for triangle in mesh.loop_triangles:
        base=len(sourceUv)
        coords=[uvLayer.data[index].uv.copy() for index in triangle.loops]
        sourceSign+=Cross(*coords)
        sourceUv.extend(Vector((p.x,p.y,0))for p in coords)
        sourcePoints.extend(mesh.vertices[index].co.copy()for index in triangle.vertices)
        sourceFaces.append((base,base+1,base+2))
    tree=BVHTree.FromPolygons(sourceUv,sourceFaces,all_triangles=True)
    def Sample(p):
        hit,normal,index,distance=tree.find_nearest(Vector((p[0],p[1],0)))
        if hit is None or distance>1e-6:raise RuntimeError('Corner UV left the actual high footprint')
        a,b,c=sourceFaces[index]
        return barycentric_transform(hit,sourceUv[a],sourceUv[b],sourceUv[c],sourcePoints[a],sourcePoints[b],sourcePoints[c])
    points,coordinates=[],[]
    # Densify each real hull edge, preserving all five measured corners (or
    # however many a later source actually has), including its tiny returns.
    for a,b in zip(hull,hull[1:]+hull[:1]):
        segments=max(1,math.ceil((Sample(b)-Sample(a)).length/.009))
        for step in range(segments):
            fraction=step/segments
            p=tuple(a[axis]*(1-fraction)+b[axis]*fraction for axis in (0,1))
            coordinates.append(p);points.append(Sample(p))
    boundaryCount=len(points)
    if boundaryCount>target:raise RuntimeError('Actual corner boundary alone exceeds triangle budget')
    center=tuple(sum(p[axis]for p in hull)/len(hull)for axis in (0,1))
    centerIndex=len(points);coordinates.append(center);points.append(Sample(center))
    faces=[(index,(index+1)%boundaryCount,centerIndex)for index in range(boundaryCount)]
    # Refine both shared edges and interiors.  Centroid-only subdivision would
    # leave a curved radial edge coarse forever, despite adding many faces.
    while len(faces)<target:
        edgeFaces={};candidates=[];remaining=target-len(faces)
        for index,face in enumerate(faces):
            for a,b in zip(face,face[1:]+face[:1]):edgeFaces.setdefault(tuple(sorted((a,b))),[]).append(index)
            if remaining>=2:
                p=tuple(sum(coordinates[i][axis]for i in face)/3 for axis in (0,1));sample=Sample(p)
                error=(sample-sum((points[i]for i in face),Vector())/3).length
                span=max((points[a]-points[b]).length for a,b in zip(face,face[1:]+face[:1]))
                candidates.append((round(error,9),span,'Face',index,p,sample))
        for (a,b),owners in edgeFaces.items():
            if len(owners)>2:raise RuntimeError('Corner sampling created a non-manifold edge')
            if len(owners)>remaining:continue
            p=tuple((coordinates[a][axis]+coordinates[b][axis])*.5 for axis in (0,1));sample=Sample(p)
            error=(sample-(points[a]+points[b])*.5).length
            candidates.append((round(error,9),(points[a]-points[b]).length,'Edge',(a,b),p,sample))
        if not candidates:break
        error,span,kind,key,p,sample=max(candidates,key=lambda row:(row[0],row[1]))
        middle=len(points);points.append(sample);coordinates.append(p)
        if kind=='Face':
            a,b,c=faces.pop(key);faces.extend(((a,b,middle),(b,c,middle),(c,a,middle)))
        else:
            rebuilt=[]
            for face in faces:
                split=False
                for position in range(3):
                    a,b,c=face[position],face[(position+1)%3],face[(position+2)%3]
                    if tuple(sorted((a,b)))==key:
                        rebuilt.extend(((a,middle,c),(middle,b,c)));split=True;break
                if not split:rebuilt.append(face)
            faces=rebuilt
    if sourceSign<0:faces=[tuple(reversed(face))for face in faces]
    result=bpy.data.meshes.new('Geometry_GameActualJacketCorner')
    result.from_pydata(points,[],faces);result.update()
    for material in mesh.materials:result.materials.append(material)
    uv=result.uv_layers.new(name='SurfaceUV')
    for loop in result.loops:uv.data[loop.index].uv=coordinates[loop.vertex_index]
    oldArea=UvArea(mesh);newArea=UvArea(result)
    if abs(newArea-oldArea)>max(1e-8,oldArea*.001):
        bpy.data.meshes.remove(result);raise RuntimeError('Actual jacket-corner UV footprint changed')
    corner.data=result
    if mesh.users==0:bpy.data.meshes.remove(mesh)
    return {'method':'Actual convex high UV footprint; complete hull, real barycentric edge/interior samples',
            'footprintHullVertexCount':len(hull),'retainedHullCoordinates':[list(p)for p in hull],
            'initialBoundarySamples':boundaryCount,'sourceUvArea':oldArea,'gameUvArea':newArea,
            'triangles':len(faces)}


def UvHash(mesh):
    digest=hashlib.sha256()
    for layer in mesh.uv_layers:
        values=array.array('f',[0])*(len(layer.data)*2)
        layer.data.foreach_get('uv',values)
        digest.update(layer.name.encode('utf-8'));digest.update(values.tobytes())
    return digest.hexdigest()


def RefitSourceFeatures(obj,sourcePoints,tolerance=.004,candidateCount=8,maxMoves=8):
    """Recover a lost true 3D fold point without changing topology or UVs."""
    mesh=obj.data;mesh.calc_loop_triangles()
    triangles=[tuple(triangle.vertices)for triangle in mesh.loop_triangles]
    vertices=[vertex.co.copy()for vertex in mesh.vertices]
    incident=[[]for vertex in vertices]
    for index,triangle in enumerate(triangles):
        for vertex in triangle:incident[vertex].append(index)
    uvBefore=UvHash(mesh)
    def Distances(points):
        tree=BVHTree.FromPolygons(points,triangles,all_triangles=True)
        distances=[tree.find_nearest(point)[3]for point in sourcePoints]
        if any(value is None for value in distances):raise RuntimeError('Empty actual garment surface during feature refit')
        return distances
    distances=Distances(vertices);initial=max(distances,default=0);moves=[];rejected=[]
    for iteration in range(maxMoves):
        before=max(distances,default=0)
        if before<=tolerance:break
        sourceIndex=max(range(len(distances)),key=lambda index:distances[index])
        destination=sourcePoints[sourceIndex].copy()
        candidates=sorted(range(len(vertices)),key=lambda index:(vertices[index]-destination).length_squared)[:candidateCount]
        best=None
        for index in candidates:
            original=vertices[index].copy();minimumDot=1.0;minimumAreaRatio=float('inf');valid=True
            if any(other!=index and (point-destination).length_squared<1e-20 for other,point in enumerate(vertices)):
                rejected.append({'sourcePoint':sourceIndex,'vertex':index,'reason':'Would duplicate an existing vertex'})
                continue
            for faceIndex in incident[index]:
                a,b,c=triangles[faceIndex]
                old=(vertices[b]-vertices[a]).cross(vertices[c]-vertices[a])
                points=[destination if vertex==index else vertices[vertex]for vertex in (a,b,c)]
                new=(points[1]-points[0]).cross(points[2]-points[0])
                if old.length<=1e-12 or new.length<=1e-12:
                    valid=False;reason='Degenerate incident triangle';break
                dot=old.dot(new)/(old.length*new.length)
                if dot<=0:
                    valid=False;reason='Would flip an incident triangle';break
                minimumDot=min(minimumDot,dot);minimumAreaRatio=min(minimumAreaRatio,new.length/old.length)
            if not valid:
                rejected.append({'sourcePoint':sourceIndex,'vertex':index,'reason':reason})
                continue
            vertices[index]=destination
            trial=Distances(vertices);maximum=max(trial,default=0)
            vertices[index]=original
            if maximum>=before-1e-7:
                rejected.append({'sourcePoint':sourceIndex,'vertex':index,'reason':'No strict all-source maximum improvement','maxErrorM':maximum})
                continue
            key=(maximum,sum(trial)/max(1,len(trial)),(destination-original).length)
            if best is None or key<best['key']:
                best={'key':key,'vertex':index,'original':original,'point':destination.copy(),
                      'distances':trial,'minimumNormalDot':minimumDot,'minimumAreaRatio':minimumAreaRatio}
        if best is None:break
        index=best['vertex'];vertices[index]=best['point'];distances=best['distances']
        moves.append({'sourcePointIndex':sourceIndex,'lowVertexIndex':index,
                      'oldPosition':list(best['original']),'newPosition':list(best['point']),
                      'relocationM':(best['point']-best['original']).length,
                      'beforeMaxSourceDistanceM':before,'afterMaxSourceDistanceM':max(distances,default=0),
                      'incidentTrianglesChecked':len(incident[index]),
                      'minimumIncidentNormalDot':best['minimumNormalDot'],
                      'minimumIncidentAreaRatio':best['minimumAreaRatio']})
    for vertex,point in zip(mesh.vertices,vertices):vertex.co=point
    mesh.update()
    if UvHash(mesh)!=uvBefore:raise RuntimeError('3D garment feature refit changed UV attributes')
    return {'method':'3D QEM followed by constrained relocation to actual high source points',
            'candidateCount':candidateCount,'maxMoves':maxMoves,'actualMoves':moves,
            'sourcePointsChecked':len(sourcePoints),'beforeMaxSourceDistanceM':initial,
            'afterMaxSourceDistanceM':max(distances,default=0),'allowedMaxSourceDistanceM':tolerance,
            'uvAttributeHashBefore':uvBefore,'uvAttributeHashAfter':UvHash(mesh),
            'uvAttributesUnchanged':True,'topologyUnchanged':True,
            'rejectedCandidates':rejected}


def BuildLowJacket(highPart, gamePart, budget=212):
    assert isinstance(budget, int) and budget >= 212, 'Retain the measured full garment: 140 body + 48 corner + 24 knot'
    sources = {SourceName(obj): obj for obj in (highPart, *highPart.children_recursive)
               if obj.type == 'MESH'}
    garmentName = next((name for name in ('Pack_IndigoShortJacket', 'Pack_ClothButtonLoop')
                        if name in sources), None)
    assert garmentName is not None, list(sources)
    assert 'StudyV7_ClothKnotButton' in sources
    for obj in list(gamePart.children_recursive):
        if obj.get('GameGenerator') == generator:
            bpy.data.objects.remove(obj, do_unlink=True)
    # The V6 save joined the full jacket into the active button-loop object;
    # V7 removed the old button faces, retaining this historical object name.
    source = sources[garmentName]
    positions, polygons = EvaluatedData(source, gamePart)
    bodyPolygons, cornerPolygons = [], []
    for vertices, uv in polygons:
        target = cornerPolygons if IsExposedCorner(vertices, uv, positions) else bodyPolygons
        target.append((vertices, uv))
    assert bodyPolygons and cornerPolygons, (len(bodyPolygons), len(cornerPolygons))
    material = SimpleMaterial()
    body = CreateMesh('Game_IndigoShortJacket', positions, bodyPolygons,
                      gamePart, material, source)
    corner = CreateMesh('Game_JacketExposedCorner', positions, cornerPolygons,
                        gamePart, material, source)
    bodySource = [vertex.co.copy() for vertex in body.data.vertices]
    cornerSource = [vertex.co.copy() for vertex in corner.data.vertices]
    beforeBody, beforeCorner = TriangleCount(body), TriangleCount(corner)
    bodyUvBefore=UvArea(body.data)
    cornerUvBefore=UvArea(corner.data)
    button = RingButton(sources['StudyV7_ClothKnotButton'], gamePart)
    buttonTriangles = TriangleCount(button)
    DissolveCoplanar(body)
    # Preserve the full garment first; use remaining geometry on the exposed
    # corner's broad, shallow wrinkle.  Cloth microrelief is a normal-map task.
    remaining = budget - buttonTriangles
    cornerReserve = min(72, remaining - 140)
    bodyTarget = 140
    bodyTriangles = LimitTriangles(body, bodyTarget)
    LimitTriangles(corner,min(cornerReserve,remaining-bodyTriangles))
    cornerRefit=RefitSourceFeatures(corner,cornerSource,.004,8,8)
    cornerTriangles = TriangleCount(corner)
    bodyError = MaximumSurfaceDistance(bodySource, body)
    cornerError = MaximumSurfaceDistance(cornerSource, corner)
    assert bodyError <= .004, ('Full folded garment lost shape', bodyError)
    assert cornerError <= .004, ('Exposed jacket corner lost shape', cornerError)
    total = bodyTriangles + cornerTriangles + buttonTriangles
    assert total <= budget, (total, budget)
    for obj in (body, corner):
        obj['GameTwoSidedCloth'] = True
    body['FullCivilianGarment'] = True
    body['RetainedParts'] = 'Folded torso, sleeves, collar, front placket, hem'
    gamePart['Control'] = 'Hide or translate this independent full garment to withdraw it'
    gamePart['FullCivilianGarment'] = True
    for key in ('PatternDimensionsM', 'TorsoWidthM', 'Construction', 'Garment'):
        if key in highPart:
            gamePart[key] = highPart[key]
    return {'generator': generator, 'budget': budget, 'triangles': total,
            'fullGarmentRetained': True, 'sourceUntouched': True,
            'objects': [{'object': body.name, 'sourceTriangles': beforeBody,
                         'triangles': bodyTriangles, 'maxSourceSurfaceDistanceM': bodyError},
                        {'object': corner.name, 'sourceTriangles': beforeCorner,
                         'triangles': cornerTriangles, 'maxSourceSurfaceDistanceM': cornerError,
                         'sourceFeatureRefit':cornerRefit},
                        {'object': button.name, 'triangles': buttonTriangles,
                         'closedClothPaths': 2,'geometry':'Double-sided actual cloth loop ribbons'}],
            'bodySourceUvArea':bodyUvBefore,'bodyGameUvArea':UvArea(body.data),
            'bodySourceUvAreaRatio':UvArea(body.data)/bodyUvBefore,
            'cornerSourceUvArea':cornerUvBefore,'cornerGameUvArea':UvArea(corner.data),
            'cornerSourceUvAreaRatio':UvArea(corner.data)/cornerUvBefore,
            'uvAreaScope':'Actual 3D LOD attribute approximation is measured; exact source UV footprint is not claimed',
            'allocation':{'bodyBudget':140,'cornerBudget':cornerReserve,'buttonBudget':24},
            'allowedBodySurfaceErrorM':.004,'allowedCornerSurfaceErrorM':.004,
            'independentRoot': gamePart.name, 'twoSidedThinCloth': True}
