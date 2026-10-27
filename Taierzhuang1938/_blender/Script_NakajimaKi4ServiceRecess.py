"""True service apertures; retained skin triangles and UV0 stay outside cuts.

Executed before AO. Louvre outlines use curved-surface coordinates; the
outlet uses its photographed Y/Z outline. Cavity depths remain inferred.
"""
serviceRecessDepth=.020
outletRecessDepth=.025


def ServiceCross(a,b,p):
    return (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x)


def SplitServicePolygon(polygon,a,b):
    inside=[];outside=[]
    for previous,current in zip(polygon[-1:]+polygon[:-1],polygon):
        d0=ServiceCross(a,b,previous[2]);d1=ServiceCross(a,b,current[2])
        if (d0>=0)!=(d1>=0):
            factor=d0/(d0-d1)
            intersection=tuple(x.lerp(y,factor) for x,y in zip(previous,current))
            inside.append(intersection);outside.append(intersection)
        (inside if d1>=0 else outside).append(current)
    return inside,outside


def SubtractServicePolygon(polygon,path):
    # A separating cutter edge proves this triangle is entirely outside.
    # Preserve it intact instead of partitioning it along unrelated edges.
    if any(all(ServiceCross(a,b,point[2])<0 for point in polygon) for a,b in zip(path,path[1:]+path[:1])):return [polygon]
    outside=[];inside=polygon
    for a,b in zip(path,path[1:]+path[:1]):
        if len(inside)<3:break
        inside,fragment=SplitServicePolygon(inside,a,b)
        if len(fragment)>=3:outside.append(fragment)
    return outside


def ServiceCutPaths(buried=False):
    cuts=[]
    for side in [-1,1]:
        for row,spec in serviceFeatures.items():
            for kind in ['bank','single']:
                quad=spec[kind]
                width=(ServicePoint(*quad[1],side)-ServicePoint(*quad[0],side)).length
                height=(ServicePoint(*quad[3],side)-ServicePoint(*quad[0],side)).length
                # The buried2mm margin is covered by the rim and clears all
                # coincident retained skin layers from the visible opening.
                margin=.020 if buried else .002
                du=margin/width;dv=margin/height
                path=ServicePerimeter(-du,1+du,-dv,1+dv,1) if kind=='bank' else [(.5+(u-.5)*(1+2*du),.5+(v-.5)*(1+2*dv)) for u,v in RoundedServicePath()]
                cuts.append({'name':row+kind+str(side),'side':side,'domain':'YTheta','path':[ServiceQuad(quad,u,v) for u,v in path]})
        cuts.append({'name':'Outlet'+str(side),'side':side,'domain':'YZ','path':[Vector((y,z)) for y,z in OutletPath(1.15 if buried else .91)]})
    for cut in cuts:
        path=cut['path'];area=sum(a.x*b.y-a.y*b.x for a,b in zip(path,path[1:]+path[:1]))/2
        assert area>0,'Service cutter boundary must have consistent winding'
        cut['minimum']=Vector((min(p.x for p in path),min(p.y for p in path)))
        cut['maximum']=Vector((max(p.x for p in path),max(p.y for p in path)))
    return cuts


def CutServiceSkin(obj,cuts):
    original=obj.data;original.calc_loop_triangles();vertices=[];faces=[];faceUvs=[];vertexMap={};removedArea=0.;cutTriangles=0
    def Domain(point,cut):
        return Vector((point.y,math.atan2(point.x*cut['side'],point.z-engineZ))) if cut['domain']=='YTheta' else Vector((point.y,point.z))
    def AddFace(polygon):
        indices=[];uvs=[]
        for point,uv,_ in polygon:
            key=tuple(round(v*1e8) for v in point)
            if key not in vertexMap:vertexMap[key]=len(vertices);vertices.append(point)
            if not indices or indices[-1]!=vertexMap[key]:indices.append(vertexMap[key]);uvs.append(uv)
        if len(indices)>1 and indices[0]==indices[-1]:indices.pop();uvs.pop()
        if len(set(indices))<3:return
        for i in range(1,len(indices)-1):
            ids=(indices[0],indices[i],indices[i+1]);a,b,c=[vertices[k] for k in ids]
            if (b-a).cross(c-a).length<1e-12:continue
            faces.append(ids);faceUvs.append((uvs[0],uvs[i],uvs[i+1]))
    for triangle in original.loop_triangles:
        polygon=[(original.vertices[k].co.copy(),original.uv_layers[0].data[loop].uv.copy(),Vector((0,0))) for k,loop in zip(triangle.vertices,triangle.loops)]
        fragments=[polygon];originalArea=triangle.area
        for cut in cuts:
            if all(point.x*cut['side']<=0 for point,_,_ in polygon):continue
            candidates=[]
            for fragment in fragments:
                projected=[(point,uv,Domain(point,cut)) for point,uv,_ in fragment]
                if any(max(p[2][axis] for p in projected)<cut['minimum'][axis] or min(p[2][axis] for p in projected)>cut['maximum'][axis] for axis in [0,1]):
                    candidates.append(projected);continue
                candidates.extend(SubtractServicePolygon(projected,cut['path']))
            fragments=candidates
        retainedArea=0.
        for fragment in fragments:
            for i in range(1,len(fragment)-1):retainedArea+=(fragment[i][0]-fragment[0][0]).cross(fragment[i+1][0]-fragment[0][0]).length/2
            AddFace(fragment)
        if originalArea-retainedArea>1e-10:cutTriangles+=1;removedArea+=originalArea-retainedArea
    mesh=bpy.data.meshes.new(original.name+'_ServiceApertures');mesh.from_pydata(vertices,[],faces);mesh.update()
    for material in original.materials:mesh.materials.append(material)
    layer=mesh.uv_layers.new(name='UVMap')
    for polygon,uvs in zip(mesh.polygons,faceUvs):
        polygon.use_smooth=True
        for loop,uv in zip(polygon.loop_indices,uvs):layer.data[loop].uv=uv
    obj.data=mesh
    assert removedArea>.001 and cutTriangles>0,'Every retained skin layer must contain actual service apertures: '+obj.name
    obj['serviceApertures']=True
    return {'name':obj.name,'trianglesBefore':len(original.loop_triangles),'trianglesAfter':len(faces),'cutOriginalTriangles':cutTriangles,'removedSkinAreaM2':removedArea,'uv0Policy':'Original triangle interpolation; surrounding geometry retained'}


def CutServiceApertures():
    records=[]
    for name in ['Fuselage_Monocoque','Engine_AdapterPanels','EngineServicePanel1','EngineServicePanel-1']:
        buried=name in ['Fuselage_Monocoque','Engine_AdapterPanels']
        records.append(CutServiceSkin(bpy.data.objects[name],ServiceCutPaths(buried)))
        records[-1]['buriedLayerClearanceMarginM']=.020 if buried else .002
    root['serviceSkinCutAuditJson']=json.dumps(records)
    root['serviceRecessDepthM']=serviceRecessDepth;root['outletRecessDepthM']=outletRecessDepth
    root['serviceApertureCount']=10
    TrimServiceSeams(ServiceCutPaths())


def TrimServiceSeams(cuts):
    def Inside(point):
        for cut in cuts:
            if point.x*cut['side']<=0:continue
            p=Vector((point.y,math.atan2(point.x*cut['side'],point.z-engineZ))) if cut['domain']=='YTheta' else Vector((point.y,point.z))
            if all(ServiceCross(a,b,p)>=0 for a,b in zip(cut['path'],cut['path'][1:]+cut['path'][:1])):return True
        return False
    for name in ['EnginePanelSeam2.25','EnginePanelSeam2.63']:
        obj=bpy.data.objects[name];spline=obj.data.splines[0];points=[Vector(p.co[:3]) for p in spline.points]
        if not any(Inside(p) for p in points):continue
        start=next(i for i,p in enumerate(points) if not Inside(p));points=points[start:]+points[:start]+[points[start]];parts=[];segment=[points[0]]
        for a,b in zip(points,points[1:]):
            oldInside=Inside(a);newInside=Inside(b)
            if oldInside!=newInside:
                lo,hi=0.,1.
                for _ in range(24):
                    mid=(lo+hi)/2
                    if Inside(a.lerp(b,mid))==oldInside:lo=mid
                    else:hi=mid
                boundary=a.lerp(b,(lo+hi)/2)
                if newInside:segment.append(boundary);parts.append(segment);segment=[]
                else:segment=[boundary]
            if not newInside:segment.append(b)
        if segment:parts.append(segment)
        if len(parts)>1 and (parts[-1][-1]-parts[0][0]).length<1e-8:parts[0]=parts[-1][:-1]+parts[0];parts.pop()
        obj.data.splines.clear()
        for points in parts:
            if len(points)<2:continue
            spline=obj.data.splines.new('POLY');spline.points.add(len(points)-1)
            for p,point in zip(spline.points,points):p.co=(*point,1)
        obj['apertureTrimmed']=True
