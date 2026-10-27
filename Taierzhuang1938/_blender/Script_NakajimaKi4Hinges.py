"""Rounded Ki-4 aileron noses and concentric fixed-wing coves.

Executed in the build namespace after WingPoint. The hinge is a single straight
axis; hidden nose radii and 3mm radial clearance are functional reconstruction.
"""
aileronSectionCache={}
aileronInboardSpan=1.85
aileronOutboardSpan=5.28
aileronEndGap=.015

def AileronAxis(side):
    ends=[]
    # Canvas73: calibrated visible aileron ends at about1.85m and5.28m;
    # the hidden axis is placed30mm aft of the traced front-joint line.
    # These scan-derived positions are not individually printed dimensions.
    for span,y in [(aileronInboardSpan,.34),(aileronOutboardSpan,.82)]:
        y+=wingInstallationY
        lo,hi=0,1
        for _ in range(38):
            t=(lo+hi)/2;top=Vector(WingPoint(side*span,t,'Upper',True));bottom=Vector(WingPoint(side*span,t,'Upper',False))
            if (top.y+bottom.y)/2>y:lo=t
            else:hi=t
        top=Vector(WingPoint(side*span,(lo+hi)/2,'Upper',True));bottom=Vector(WingPoint(side*span,(lo+hi)/2,'Upper',False))
        ends.append(Vector((side*span,y,(top.z+bottom.z)/2)))
    return ends

def AileronSection(side,span):
    key=(side,round(span,7))
    if key in aileronSectionCache:return aileronSectionCache[key]
    first,last=AileronAxis(side)
    center=first.lerp(last,(span-aileronInboardSpan)/(aileronOutboardSpan-aileronInboardSpan))
    axis=(last-first).normalized()*side
    fore=(Vector((0,1,0))-axis*axis.y).normalized();up=axis.cross(fore).normalized()
    def FindZero(fn,lastT):
        lo,hi=0,lastT
        assert fn(lo)>0 and fn(hi)<=0
        for _ in range(38):
            mid=(lo+hi)/2
            if fn(mid)>0:lo=mid
            else:hi=mid
        return (lo+hi)/2
    hingeT=[FindZero(lambda t:(Vector(WingPoint(side*span,t,'Upper',top))-center).dot(fore),1) for top in [True,False]]
    joins=[Vector(WingPoint(side*span,t,'Upper',top)) for t,top in zip(hingeT,[True,False])]
    radius=max(abs((p-center).dot(up)) for p in joins)
    assert .02<radius<.10
    coveRadius=radius+.003
    cutT=[];cutAngles=[];cutTargets=[]
    for top,limit in zip([True,False],hingeT):
        def CircleDistance(t):
            d=Vector(WingPoint(side*span,t,'Upper',top))-center
            return d.dot(fore)**2+d.dot(up)**2-coveRadius**2
        t=FindZero(CircleDistance,limit);d=Vector(WingPoint(side*span,t,'Upper',top))-center
        angle=math.atan2(d.dot(up),d.dot(fore))
        cutT.append(t);cutAngles.append(angle);cutTargets.append(center+coveRadius*(fore*cos(angle)+up*sin(angle)))
    data={'center':center,'axis':axis,'fore':fore,'up':up,'radius':radius,'coveRadius':coveRadius,'hingeT':hingeT,'joins':joins,'cutT':cutT,'cutAngles':cutAngles,'cutTargets':cutTargets}
    aileronSectionCache[key]=data;return data

def HingedWingSurfacePoint(side,span,t,top,moving,extra=0):
    d=AileronSection(side,span);i=0 if top else 1
    raw=Vector(WingPoint(side*span,t,'Upper',top))
    if moving:
        q=max(0,min(1,(t-d['hingeT'][i])/(1-d['hingeT'][i])))
        target=d['center']+d['up']*d['radius']*(1 if top else -1)
        raw+=(target-d['joins'][i])*(1-q)**4
    else:
        q=max(0,min(1,t/d['cutT'][i]))
        raw+=(d['cutTargets'][i]-Vector(WingPoint(side*span,d['cutT'][i],'Upper',top)))*q**8
    raw.z+=extra
    return raw

def HingedUpperPanel(name,side,moving=False,parent=None):
    start,end=(aileronInboardSpan+aileronEndGap,aileronOutboardSpan) if moving else (aileronInboardSpan,aileronOutboardSpan+aileronEndGap)
    rows=math.ceil((end-start)/.055);skinSteps=42;capSteps=28
    vv=[];uv=[];ff=[];profileCount=None;noseSamples=[]
    for row in range(rows+1):
        span=start+(end-start)*row/rows;d=AileronSection(side,span)
        chord=math.dist(WingPoint(side*span,0,'Upper',True),WingPoint(side*span,1,'Upper',True))
        profile=[]
        def Add(point,t,top):profile.append((point,(abs(point.x)/6,t*chord/2 if top else 2-t*chord/2)))
        if moving:
            for top in [True,False]:
                for j in range(skinSteps+1):
                    if not top and j==0:continue
                    q=(1-cos(pi*j/skinSteps))/2
                    t=d['hingeT'][0]+(1-d['hingeT'][0])*q if top else 1-(1-d['hingeT'][1])*q
                    Add(HingedWingSurfacePoint(side,span,t,top,True),t,top)
            for j in range(1,capSteps):
                a=-pi/2+pi*j/capSteps;point=d['center']+d['radius']*(d['fore']*cos(a)+d['up']*sin(a))
                noseSamples.append(len(vv)+len(profile));Add(point,d['hingeT'][0 if a>=0 else 1],a>=0)
        else:
            for j in range(skinSteps+1):
                q=(1-cos(pi*j/skinSteps))/2;t=d['cutT'][0]*q
                Add(HingedWingSurfacePoint(side,span,t,True,False),t,True)
            for j in range(1,capSteps):
                a=d['cutAngles'][0]+(d['cutAngles'][1]-d['cutAngles'][0])*j/capSteps
                point=d['center']+d['coveRadius']*(d['fore']*cos(a)+d['up']*sin(a));Add(point,d['cutT'][0 if a>=0 else 1],a>=0)
            for j in range(skinSteps+1):
                q=(1-cos(pi*j/skinSteps))/2;t=d['cutT'][1]*(1-q)
                Add(HingedWingSurfacePoint(side,span,t,False,False),t,False)
        if profileCount is None:profileCount=len(profile)
        assert len(profile)==profileCount
        vv.extend(p for p,_ in profile);uv.extend(tex for _,tex in profile)
    for row in range(rows):
        for k in range(profileCount):
            a=row*profileCount+k;b=row*profileCount+(k+1)%profileCount
            ff.append((a,b,b+profileCount,a+profileCount))
    ff.append(tuple(range(profileCount-1,-1,-1)))
    ff.append(tuple(rows*profileCount+k for k in range(profileCount)))
    obj=Mesh(name,vv,ff,'Fabric',uv)
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.0000001);bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    assert all(e.is_manifold for e in bm.edges),name+' must be a closed loft'
    assert bm.calc_volume()>0,name+' must face outward'
    bm.to_mesh(obj.data);bm.free()
    if moving:
        first,last=AileronAxis(side);direction=(last-first).normalized()
        cutter=Tube('Temp_AileronAxleBore',first-direction*.1,last+direction*.1,.0037,'Steel',32)
        mod=obj.modifiers.new('AxleBearingBore','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter;mod.solver='EXACT'
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
        bm=bmesh.new();bm.from_mesh(obj.data)
        assert all(e.is_manifold for e in bm.edges),name+' axle bore must retain a closed surface'
        bm.free()
        obj['axleBoreRadiusM']=.0037
    # The concave cove turns back under the skin at a real sheet edge. Averaging
    # across that edge spread opposite-facing normals over the reduced skin.
    obj.data.update();obj.data.set_sharp_from_angle(angle=math.radians(60))
    if parent:MoveUnder(obj,parent)
    obj['gameSurfaceToleranceM']=.0005 if moving else .0008
    obj['hingeConstruction']='Straight physical axis with concentric rounded moving nose and3mm radial fixed cove; hidden section is functional reconstruction, not a printed factory measurement'
    obj['coveRadialClearanceM']=.003
    obj['hingeRadiusRangeM']=[min(AileronSection(side,start+(end-start)*i/rows)['radius'] for i in range(rows+1)),max(AileronSection(side,start+(end-start)*i/rows)['radius'] for i in range(rows+1))]
    return obj

def CacheFabricSurfaceNormals(objects):
    # Cache the evaluated high mesh, before reduction or joining. A fresh
    # evaluated mesh also avoids stale corner-normal caches after BMesh welds.
    points=[];triangles=[];normals=[];depsgraph=bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        obj.data.update();evaluated=obj.evaluated_get(depsgraph);mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=depsgraph);mesh.calc_loop_triangles()
        offset=len(points);points.extend(obj.matrix_world@v.co for v in mesh.vertices)
        transform=obj.matrix_world.to_3x3().inverted().transposed()
        for tri in mesh.loop_triangles:
            triangles.append(tuple(offset+k for k in tri.vertices))
            normals.append([(transform@mesh.corner_normals[k].vector).normalized() for k in tri.loops])
        evaluated.to_mesh_clear()
    return BVHTree.FromPolygons(points,triangles,all_triangles=True),points,triangles,normals

def ProjectFabricSurfaceNormals(reference,obj):
    # Assign after the final static merge, so joining cannot reinterpret the
    # encoded custom-normal basis around the concave skin/cove transition.
    tree,sourcePoints,triangles,sourceNormals=reference;candidate=obj.data;candidate.update()
    # Independent corner spaces are required at the reduced crease. Otherwise
    # Blender averages distinct projected skin/cove normals back together.
    for edge in candidate.edges:edge.use_edge_sharp=True
    normals=[None]*len(candidate.loops);distances=[];world=obj.matrix_world;toLocal=world.to_3x3().transposed();normalWorld=world.to_3x3().inverted().transposed();fallbacks=0
    for poly in candidate.polygons:
        center=poly.center;faceNormal=(normalWorld@poly.normal).normalized()
        for loopIndex in poly.loop_indices:
            point=candidate.vertices[candidate.loops[loopIndex].vertex_index].co
            # Probe into the triangle, beyond the submillimeter reduction error,
            # to select its own side of the high-source crease at shared corners.
            near=tree.find_nearest_range(world@point,.004)
            compatible=[r for r in near if r[1].dot(faceNormal)>.9]
            if not compatible:compatible=[r for r in near if r[1].dot(faceNormal)>.5]
            if compatible:hit,_,index,distance=min(compatible,key=lambda r:r[3])
            else:
                probe=world@point.lerp(center,.01);hit,_,index,distance=tree.find_nearest(probe);fallbacks+=1
            assert hit is not None
            a,b,c=[sourcePoints[k] for k in triangles[index]];e=b-a;f=c-a;d=hit-a
            denominator=e.dot(e)*f.dot(f)-e.dot(f)**2
            if abs(denominator)<1e-20:normal=sourceNormals[index][0]
            else:
                u=(f.dot(f)*d.dot(e)-e.dot(f)*d.dot(f))/denominator
                v=(e.dot(e)*d.dot(f)-e.dot(f)*d.dot(e))/denominator
                normal=(sourceNormals[index][0]*(1-u-v)+sourceNormals[index][1]*u+sourceNormals[index][2]*v).normalized()
            normals[loopIndex]=tuple((toLocal@normal).normalized());distances.append(distance)
    assert all(n is not None for n in normals)
    candidate.normals_split_custom_set(normals)
    assert candidate.has_custom_normals
    return {'name':obj.name,'method':'Evaluated high-surface corner normals projected in world space after final merge, with source-face orientation matching at creases','corners':len(normals),'orientationFallbackCorners':fallbacks,'maxProjectionDistanceM':max(distances)}
