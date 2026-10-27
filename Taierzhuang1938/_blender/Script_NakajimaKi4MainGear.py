"""Canvas86/87 rigid main V-leg and body fittings.

Printed side-view eye separation1200mm and axis drops791/645mm are retained.
Section widths, round-over, fasteners and fitting-to-exterior connections are
reconstruction. This module does not establish a loaded suspension position.
"""
import bpy, bmesh, math, json
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def BuildMainVLegs(root, body, material, firstFrameY, bodyAxisZ, wheelStation,
                  wheelRadius, mountLateral=.10, axleInnerLateral=1.095,reuseBodyFittings=False,solidEyeUnion=False,axleCarrierZ=None):
    scene=bpy.context.scene
    created=[]
    sideSeparation=1.200
    foreDrop=.791
    aftDrop=.645
    foreLead=math.sqrt(sideSeparation**2-(foreDrop-aftDrop)**2)
    hingeAxis=Vector((0,foreLead,-(foreDrop-aftDrop))).normalized()
    lateral=Vector((1,0,0))
    up=(Vector((0,0,1))-hingeAxis*hingeAxis.z).normalized()
    bodyTree=BVHTree.FromPolygons([body.matrix_world@v.co for v in body.data.vertices],
                                 [list(p.vertices) for p in body.data.polygons])

    def Mesh(name, vertices, faces, smooth=False):
        data=bpy.data.meshes.new(name)
        data.from_pydata(vertices,[],faces);data.update()
        bm=bmesh.new();bm.from_mesh(data)
        bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=1e-7)
        bmesh.ops.dissolve_degenerate(bm,edges=bm.edges,dist=1e-9)
        bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
        if solidEyeUnion:
            bmesh.ops.triangulate(bm,faces=list(bm.faces))
            if bm.calc_volume(signed=True)<0:bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
        bm.to_mesh(data);bm.free();data.update()
        obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj)
        obj.parent=root;obj.data.materials.append(material)
        for polygon in data.polygons:polygon.use_smooth=smooth
        created.append(obj)
        return obj

    def ApplyBoolean(obj, tool, operation):
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True);bpy.context.view_layer.objects.active=obj
        modifier=obj.modifiers.new('SourceAssembly'+operation,'BOOLEAN')
        modifier.operation=operation;modifier.solver='MANIFOLD' if solidEyeUnion else 'EXACT';modifier.object=tool
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        bpy.data.objects.remove(tool,do_unlink=True)

    def Cylinder(name, center, axis, radius, length, sides=16):
        axis=Vector(axis).normalized();center=Vector(center)
        first=(lateral-axis*axis.x).normalized() if abs(axis.x)<.95 else Vector((0,1,0))
        second=axis.cross(first).normalized();vertices=[];faces=[]
        for depth in [-length/2,length/2]:
            for index in range(sides):
                angle=2*math.pi*index/sides
                vertices.append(center+axis*depth+radius*(first*math.cos(angle)+second*math.sin(angle)))
        for index in range(sides):
            nxt=(index+1)%sides;faces.append((index,nxt,nxt+sides,index+sides))
        faces.extend([tuple(range(sides-1,-1,-1)),tuple(range(sides,2*sides))])
        return Mesh(name,vertices,faces,True)

    def Eye(name, point, axis, outer=.034, inner=.011, length=.030, sides=20):
        axis=Vector(axis).normalized();first=(lateral-axis*axis.x).normalized()
        second=axis.cross(first).normalized();point=Vector(point);vertices=[];faces=[]
        for distance,radius in [(-length/2,outer),(length/2,outer),(length/2,inner),(-length/2,inner)]:
            for index in range(sides):
                angle=2*math.pi*index/sides
                vertices.append(point+axis*distance+radius*(first*math.cos(angle)+second*math.sin(angle)))
        for ring in range(4):
            for index in range(sides):
                nxt=(index+1)%sides;other=(ring+1)%4
                faces.append((ring*sides+index,ring*sides+nxt,other*sides+nxt,other*sides+index))
        return Mesh(name,vertices,faces,True)

    def Arm(name, start, end, normal):
        start,end=Vector(start),Vector(end);direction=(end-start).normalized()
        fore=normal.cross(direction).normalized()
        if fore.dot(hingeAxis)<0:fore.negate()
        vertices=[];faces=[];sections=8;halfProfile=12
        # A generic closed streamlined section follows the source A-A form.
        # It is not identified as a particular NACA production section.
        profile=[]
        for surface,indices in [(1,range(halfProfile+1)),(-1,range(halfProfile-1,0,-1))]:
            for index in indices:
                x=(1-math.cos(math.pi*index/halfProfile))/2
                thickness=5*.27*(.2969*math.sqrt(x)-.1260*x-.3516*x*x+.2843*x**3-.1036*x**4)
                profile.append((.40-x,surface*thickness))
        for index in range(sections+1):
            t=index/sections;point=start.lerp(end,t)
            chord=.108+.052*t+.026*math.exp(-((t-.94)/.18)**2)
            for chordwise,thickness in profile:
                vertices.append(point+fore*(chordwise*chord)+normal*(thickness*chord))
        count=len(profile)
        for row in range(sections):
            for index in range(count):
                nxt=(index+1)%count;faces.append((row*count+index,row*count+nxt,(row+1)*count+nxt,(row+1)*count+index))
        faces.extend([tuple(range(count-1,-1,-1)),tuple(range(sections*count,(sections+1)*count))])
        obj=Mesh(name,vertices,faces,True)
        obj['sectionScope']='Streamlined shape traced in kind from Canvas87 A-A; inferred108..186mm chord and section thickness, not a factory measurement'
        return obj

    def BodyFitting(label, point):
        point=Vector(point);contacts=[]
        for along in [-.030,.030]:
            for xOffset in [-.045,0,.045]:
                start=point+hingeAxis*along+lateral*xOffset-up*1.5
                hit=bodyTree.ray_cast(start,up,3.)
                assert hit[0] is not None, ('Main-gear fitting misses the actual skin',label,tuple(start))
                contacts.append({'surfaceBlenderM':list(hit[0]),'fromEyeAlongUpM':(hit[0]-point).dot(up),'alongPinM':along,'lateralOffsetM':xOffset})
        # The aft eye can already be inside the inferred exterior envelope.
        height=max(.070,max(row['fromEyeAlongUpM'] for row in contacts)+.012)
        plates=[]
        for index,along in enumerate([-.030,.030]):
            outline=[(-.048,height),(.048,height),(.050,.020),(.037,-.030),(-.037,-.030),(-.050,.020)]
            vertices=[];faces=[]
            for thickness in [-.004,.004]:
                for x,z in outline:vertices.append(point+hingeAxis*(along+thickness)+lateral*x+up*z)
            count=len(outline)
            for k in range(count):faces.append((k,(k+1)%count,(k+1)%count+count,k+count))
            faces.extend([tuple(range(count-1,-1,-1)),tuple(range(count,2*count))])
            plate=Mesh('LandingGear_BodyFitting'+label+str(index+1),vertices,faces)
            cutter=Cylinder('Temp_MainGearBodyEye',point+hingeAxis*along,hingeAxis,.0125,.025,20)
            ApplyBoolean(plate,cutter,'DIFFERENCE')
            plate['fittingScope']='Paired fork ears follow Canvas87 in kind. Plate dimensions and installed link to the inferred exterior are reconstruction.'
            plates.append(plate.name)
        pin=Cylinder('LandingGear_BodyPin'+label,point,hingeAxis,.009,.094,16)
        pin['preserveAssemblyPart']=True
        return {'eyeBlenderM':list(point),'pinAxisBlender':list(hingeAxis),'plateHeightM':height,'actualSkinSamples':contacts,'plates':plates,'pin':pin.name,'skinInsetM':.012}

    records=[]
    for side,label in [(-1,'Left'),(1,'Right')]:
        fore=Vector((side*mountLateral,firstFrameY+foreLead,bodyAxisZ-foreDrop))
        aft=Vector((side*mountLateral,firstFrameY,bodyAxisZ-aftDrop))
        foot=Vector((side*axleInnerLateral,wheelStation,wheelRadius if axleCarrierZ is None else axleCarrierZ))
        normal=(fore-aft).cross(foot-aft).normalized()
        if normal.x<0:normal.negate()
        directions=[(foot-fore).normalized(),(foot-aft).normalized()]
        arms=[Arm('LandingGear_MainVFrame'+label,fore+directions[0]*.018,foot+directions[0]*.018,normal),
              Arm('Temp_MainVAft'+label,aft+directions[1]*.018,foot+directions[1]*.018,normal)]
        ApplyBoolean(arms[0],arms[1],'UNION')
        # The source V has a reinforced web at the axle, not crossing loose rods.
        vertices=[]
        for center in [foot,foot-directions[0]*.24,foot-directions[1]*.24]:
            for offset in [-.048,.048]:
                for thickness in [-.022,.022]:vertices.append(center+hingeAxis*offset+normal*thickness)
        bm=bmesh.new()
        for p in vertices:bm.verts.new(p)
        bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
        if solidEyeUnion:
            loose=[vertex for vertex in bm.verts if not vertex.link_faces]
            if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
            bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bmesh.ops.triangulate(bm,faces=list(bm.faces))
            if bm.calc_volume(signed=True)<0:bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
        webData=bpy.data.meshes.new('MainVWeb');bm.to_mesh(webData);bm.free()
        web=bpy.data.objects.new('Temp_MainVWeb'+label,webData);scene.collection.objects.link(web);web.data.materials.append(material)
        ApplyBoolean(arms[0],web,'UNION')
        for point,name in [(fore,'Fore'),(aft,'Aft')]:
            eye=Cylinder('Temp_MainV'+name+label,point,hingeAxis,.034,.030,20) if solidEyeUnion else Eye('Temp_MainV'+name+label,point,hingeAxis)
            ApplyBoolean(arms[0],eye,'UNION')
        # Closed bores are real geometry. A pin is narrower than its bore.
        for point in [fore,aft]:
            cutter=Cylinder('Temp_MainVPinBore',point,hingeAxis,.011,.14,20)
            ApplyBoolean(arms[0],cutter,'DIFFERENCE')
        arms[0]['mainGearDatumsBlenderM']=[list(fore),list(aft),list(foot)]
        arms[0]['mainGearScope']='Rigid streamlined V-leg from Canvas86/87; widths, web, bores and hidden fittings remain reconstruction'
        arms[0]['preserveAssemblyPart']=True
        if reuseBodyFittings:
            for direction in ['Fore','Aft']:
                for suffix in ['1','2']:assert 'LandingGear_BodyFitting'+direction+label+suffix in bpy.data.objects
                assert 'LandingGear_BodyPin'+direction+label in bpy.data.objects
            foreFitting={'eyeBlenderM':list(fore),'scope':'Previously verified body fittings retained unchanged'}
            aftFitting={'eyeBlenderM':list(aft),'scope':'Previously verified body fittings retained unchanged'}
        else:
            foreFitting=BodyFitting('Fore'+label,fore)
            aftFitting=BodyFitting('Aft'+label,aft)
        assert abs((fore-aft).length-sideSeparation)<1e-7
        records.append({'side':label,'foreEyeBlenderM':list(fore),'aftEyeBlenderM':list(aft),'footBlenderM':list(foot),'actualSideEyeSeparationM':math.hypot(fore.y-aft.y,fore.z-aft.z),'foreDropM':bodyAxisZ-fore.z,'aftDropM':bodyAxisZ-aft.z,'hingeAxisBlender':list(hingeAxis),'foreFitting':foreFitting,'aftFitting':aftFitting})

    # New geometry needs fresh primary and geometry-AO UV work after gray review.
    objects=[]
    for obj in created:
        try:
            if obj.name in bpy.data.objects and not obj.name.startswith('Temp_'):objects.append(obj)
        except ReferenceError:
            pass
    for obj in objects:
        bm=bmesh.new();bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=3e-6)
        bmesh.ops.dissolve_degenerate(bm,edges=bm.edges,dist=3e-6)
        bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY',ngon_method='BEAUTY')
        bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=3e-6)
        bmesh.ops.dissolve_degenerate(bm,edges=bm.edges,dist=3e-6)
        loose=[vertex for vertex in bm.verts if not vertex.link_faces]
        if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
        bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
        assert all(edge.is_manifold for edge in bm.edges), ('Open main-gear source solid',obj.name)
        unvisited=set(bm.verts);components=0
        while unvisited:
            components+=1;stack=[unvisited.pop()]
            while stack:
                vertex=stack.pop()
                for edge in vertex.link_edges:
                    other=edge.other_vert(vertex)
                    if other in unvisited:unvisited.remove(other);stack.append(other)
        assert components==1, ('Main-gear component must be one connected solid',obj.name,components)
        bm.to_mesh(obj.data);bm.free();obj.data.update()
        layer=obj.data.uv_layers.new(name='UVMap')
        for polygon in obj.data.polygons:
            axis=max(range(3),key=lambda i:abs(polygon.normal[i]));a,b=[i for i in range(3) if i!=axis]
            for index in polygon.loop_indices:
                p=obj.data.vertices[obj.data.loops[index].vertex_index].co;layer.data[index].uv=(p[a]/.5,p[b]/.5)
        obj['grayReviewPbrPending']=True
    root['mainGearInstallationProfile']='Canvas86RigidVFrame'
    root['mainGearBodyEyeSeparationM']=sideSeparation
    root['mainGearForeBodyAxisDropM']=foreDrop
    root['mainGearAftBodyAxisDropM']=aftDrop
    root['mainGearForeLeadFromFirstFrameM']=foreLead
    root['mainGearSource']='NDL8815746 Canvas86 body-eye datums; Canvas87 reinforced streamlined V-leg and body fittings'
    root['mainGearReconstructionScope']='V-section widths, web, pin/plate dimensions and attachment to inferred exterior reconstructed. Existing wheel track/station and oleo/load state retained for independent review; not a validated loaded suspension.'
    root['mainGearAxleCarrierHalfSpanM']=axleInnerLateral
    root['mainGearNewPartsJson']=json.dumps([obj.name for obj in objects])
    return {'profile':'Canvas86RigidVFrame','printedSideEyeSeparationM':sideSeparation,'foreLeadFromFirstFrameM':foreLead,'records':records,'newParts':[obj.name for obj in objects],'scope':root['mainGearReconstructionScope']}
