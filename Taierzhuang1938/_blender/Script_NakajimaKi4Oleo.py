"""Nominal spring-free oleo from Canvas88; installation is reconstructed.

Printed: eye span1020.5mm, spring free238.8mm, external tube436.2mm.
Canvas86 upper reference line33deg is perpendicular to the strut in front view.
Unprinted radii, nine visible turns, phase and fitting detail remain inferred.
"""
import bpy,bmesh,math
from mathutils import Vector


def BuildOleoAssemblies(root,steel,bright,quality='Source',freeCamberDegrees=0.):
    created=[];scene=bpy.context.scene
    freeLength=1.0205;springLength=.2388;tubeLength=.4362
    hinge=Vector((0,math.sqrt(1.2**2-.146**2),-.146)).normalized()
    frameY=.780;axisZ=1.810;station=1.640;radius=.430
    springTurns=9;wireRadius=.0085;coilRadius=.0360
    coilSteps=48 if quality=='Source' else 16
    wireSides=10 if quality=='Source' else 6
    latheSides=32 if quality=='Source' else 16

    def Mesh(name,vertices,faces,material=steel,smooth=False,parent=None):
        data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.update()
        bm=bmesh.new();bm.from_mesh(data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=2e-6)
        bmesh.ops.dissolve_degenerate(bm,edges=bm.edges,dist=2e-6);bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
        bm.to_mesh(data);bm.free();data.update()
        obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.parent=parent or root;data.materials.append(material)
        for polygon in data.polygons:polygon.use_smooth=smooth
        created.append(obj);return obj

    def Cylinder(name,a,b,r,material=steel,sides=20):
        a,b=Vector(a),Vector(b);axis=(b-a).normalized();basis=Vector((0,1,0))
        if abs(axis.dot(basis))>.95:basis=Vector((1,0,0))
        first=(basis-axis*axis.dot(basis)).normalized();second=axis.cross(first);vertices=[];faces=[]
        for center in [a,b]:
            for index in range(sides):
                t=2*math.pi*index/sides;vertices.append(center+r*(first*math.cos(t)+second*math.sin(t)))
        for index in range(sides):nxt=(index+1)%sides;faces.append((index,nxt,nxt+sides,index+sides))
        faces.extend([tuple(range(sides-1,-1,-1)),tuple(range(sides,2*sides))])
        return Mesh(name,vertices,faces,material,True)

    def Boolean(obj,tool,operation):
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        modifier=obj.modifiers.new('Oleo'+operation,'BOOLEAN');modifier.operation=operation;modifier.solver='EXACT';modifier.object=tool
        bpy.ops.object.modifier_apply(modifier=modifier.name);bpy.data.objects.remove(tool,do_unlink=True)

    def Eye(name,center,outer=.020,inner=.0085,depth=.028):
        center=Vector(center);x=Vector((1,0,0));z=hinge.cross(x).normalized();vertices=[];faces=[];sides=20
        for along,r in [(-depth/2,outer),(depth/2,outer),(depth/2,inner),(-depth/2,inner)]:
            for i in range(sides):
                t=2*math.pi*i/sides;vertices.append(center+hinge*along+r*(x*math.cos(t)+z*math.sin(t)))
        for ring in range(4):
            for i in range(sides):j=(i+1)%sides;k=(ring+1)%4;faces.append((ring*sides+i,ring*sides+j,k*sides+j,k*sides+i))
        return Mesh(name,vertices,faces,steel,True)

    def Lathe(name,start,axis,profile,material=steel):
        axis=Vector(axis).normalized();first=(hinge-axis*hinge.dot(axis)).normalized();second=axis.cross(first);vertices=[];faces=[]
        for d,r in profile:
            for i in range(latheSides):
                t=2*math.pi*i/latheSides;vertices.append(start+axis*d+r*(first*math.cos(t)+second*math.sin(t)))
        for row in range(len(profile)-1):
            for i in range(latheSides):j=(i+1)%latheSides;faces.append((row*latheSides+i,row*latheSides+j,(row+1)*latheSides+j,(row+1)*latheSides+i))
        faces.extend([tuple(range(latheSides-1,-1,-1)),tuple(range((len(profile)-1)*latheSides,len(profile)*latheSides))])
        return Mesh(name,vertices,faces,material,True)

    records=[]
    for side,label in [(-1,'Left'),(1,'Right')]:
        upper=Vector((side*.425,frameY+.9187,axisZ-.4456))
        # The side-view longitudinal offset is an installation hypothesis.
        dy=station-upper.y;projected=math.sqrt(freeLength**2-dy**2)
        lower=upper+Vector((side*projected*math.cos(math.radians(57)),dy,-projected*math.sin(math.radians(57))))
        axis=(lower-upper).normalized();first=(hinge-axis*hinge.dot(axis)).normalized();second=axis.cross(first)
        Eye('Oleo_UpperEye'+label,upper);Eye('Oleo_LowerEye'+label,lower)
        Cylinder('Oleo_UpperPin'+label,upper-hinge*.040,upper+hinge*.040,.0069,bright,16)
        Cylinder('Oleo_LowerPin'+label,lower-hinge*.065,lower+hinge*.065,.0069,bright,16)
        Lathe('Oleo_UpperNeck'+label,upper,axis,[(.012,.015),(.040,.015),(.048,.023)])
        Lathe('Oleo_InnerGuide'+label,upper,axis,[(.048,.017),(.3318,.017),(.5543,.017)],bright)
        Lathe('Oleo_UpperSpringSeat'+label,upper,axis,[(.045,.025),(.048,.0445),(.054,.0445)])
        Lathe('Oleo_LowerSpringSeat'+label,upper,axis,[(.2808,.0445),(.2868,.0445),(.2928,.024)])
        Lathe('Oleo_ConnectorHousing'+label,upper,axis,[(.2928,.020),(.3318,.020),(.348,.028),(.450,.028),(.4693,.023),(.5323,.023),(.5543,.0225)])
        tubeEnd=freeLength-.030;tubeStart=tubeEnd-tubeLength
        Lathe('Oleo_ExternalTube'+label,upper,axis,[(tubeStart,.0225),(tubeEnd,.0225)])
        Lathe('Oleo_LowerNeck'+label,upper,axis,[(tubeEnd,.015),(freeLength-.012,.015)])

        # Account for wire projection when enforcing the actual free envelope.
        lo,hi=0.,springLength
        for _ in range(50):
            axial=(lo+hi)/2;rise=axial/(2*math.pi*springTurns*coilRadius);extent=wireRadius/math.sqrt(1+rise*rise)
            if axial+2*extent>springLength:hi=axial
            else:lo=axial
        axial=(lo+hi)/2;rise=axial/(2*math.pi*springTurns*coilRadius);extent=wireRadius/math.sqrt(1+rise*rise)
        startDistance=.048+extent;vertices=[];faces=[];rings=springTurns*coilSteps+1
        for index in range(rings):
            fraction=index/(rings-1);angle=2*math.pi*springTurns*fraction
            radial=first*math.cos(angle)+second*math.sin(angle)
            tangent=(axis*axial+(second*math.cos(angle)-first*math.sin(angle))*(2*math.pi*springTurns*coilRadius)).normalized()
            cross=tangent.cross(radial).normalized();center=upper+axis*(startDistance+axial*fraction)+radial*coilRadius
            for wire in range(wireSides):
                t=math.pi/2+2*math.pi*wire/wireSides;vertices.append(center+wireRadius*(radial*math.cos(t)+cross*math.sin(t)))
        for row in range(rings-1):
            for i in range(wireSides):j=(i+1)%wireSides;faces.append((row*wireSides+i,row*wireSides+j,(row+1)*wireSides+j,(row+1)*wireSides+i))
        faces.extend([tuple(range(wireSides-1,-1,-1)),tuple(range((rings-1)*wireSides,rings*wireSides))])
        spring=Mesh('Oleo_CoilSpring'+label,vertices,faces,steel,True)
        spring['freeEnvelopeM']=springLength;spring['turnCount']=springTurns;spring['turnCountScope']='Nine turns interpreted from the visible original assembled view; exact spring/gauge data not established'

        # The old solid inner hub is rebuilt as the fixed brake/axle carrier,
        # matching Canvas87's non-rotating axle/brake attachment relationship.
        old=bpy.data.objects['WheelHub_'+label+'-1'];world=old.matrix_world.copy();old.parent=root;old.matrix_world=world;old.name='LandingGear_AxleCarrier'+label
        camber=math.radians(freeCamberDegrees);axleDirection=Vector((side*math.cos(camber),0,-math.sin(camber)))
        wheelCenter=Vector((side*1.125,station,radius))
        axle=wheelCenter+axleDirection*((.925-1.125)/math.cos(camber));end=wheelCenter+axleDirection*((1.255-1.125)/math.cos(camber))
        shaft=Cylinder('Temp_FixedAxle'+label,axle-axleDirection*.035,end,.022,bright,24)
        Boolean(old,shaft,'UNION')
        notch=Cylinder('Temp_OleoClevisSlot',lower-hinge*.020,lower+hinge*.020,.023,steel,32)
        Boolean(old,notch,'DIFFERENCE')
        hole=Cylinder('Temp_OleoCarrierPin',lower-hinge*.09,lower+hinge*.09,.0085,steel,24)
        Boolean(old,hole,'DIFFERENCE');created.append(old)
        old['fixedAxleAndBrakeCarrier']=True
        old['reconstructionScope']='Fixed axle and upper lower-oleo fork from Canvas87. Carrier sizes, clearance and brake shell remain inferred; not a factory brake reconstruction.'
        # Existing rotating rim/cap exterior stays; hidden axle bores are opened.
        wheelBores=[]
        for name in ['WheelRim_'+label+'-1','WheelRim_'+label+'1','WheelHub_'+label+'1']:
            obj=bpy.data.objects[name]
            a=wheelCenter+axleDirection*((.85-1.125)/math.cos(camber));b=wheelCenter+axleDirection*(((1.265 if 'WheelHub_' in name else 1.31)-1.125)/math.cos(camber))
            cutter=Cylinder('Temp_WheelAxleBore',a,b,.026,steel,24)
            Boolean(obj,cutter,'DIFFERENCE');created.append(obj);obj['grayReviewPbrPending']=True;wheelBores.append(name)
        records.append({'side':label,'upperEyeBlenderM':list(upper),'lowerEyeBlenderM':list(lower),'actualNominalEyeLengthM':(lower-upper).length,'springFreeLengthM':springLength,'externalTubeLengthM':tubeLength,'frontProjectedAxisDegrees':57,'upperReferenceLineDegrees':33,'axleCarrierBlenderM':list(axle),'wheelBores':wheelBores,'quality':quality})

    objects=[]
    for obj in created:
        try:
            if obj.name in bpy.data.objects and not obj.name.startswith('Temp_') and obj not in objects:objects.append(obj)
        except ReferenceError:pass
    for obj in objects:
        bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=3e-6);bmesh.ops.dissolve_degenerate(bm,edges=bm.edges,dist=3e-6)
        bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
        assert all(e.is_manifold for e in bm.edges),('Open oleo/wheel solid',obj.name)
        bm.to_mesh(obj.data);bm.free();obj.data.update()
        for layer in list(obj.data.uv_layers):obj.data.uv_layers.remove(layer)
        uv=obj.data.uv_layers.new(name='UVMap')
        for polygon in obj.data.polygons:
            normalAxis=max(range(3),key=lambda i:abs(polygon.normal[i]));a,b=[i for i in range(3) if i!=normalAxis]
            for loop in polygon.loop_indices:
                point=obj.data.vertices[obj.data.loops[loop].vertex_index].co;uv.data[loop].uv=(point[a]/.5,point[b]/.5)
        ao=obj.data.uv_layers.new(name='GeometryAO')
        for item in ao.data:item.uv=(0,0)
        obj['grayReviewPbrPending']=True
    root['oleoFreeEyeLengthM']=freeLength;root['oleoSpringFreeLengthM']=springLength;root['oleoExternalTubeLengthM']=tubeLength
    root['mainGearFreeCamberDegrees']=freeCamberDegrees
    root['oleoInstallationScope']='Nominal spring-free component lengths from Canvas88.57deg front axis inferred perpendicular to Canvas86 upper33deg line; lower longitudinal station and all fitting/coil radii reconstructed. Full-load/camber/park stance remains unverified.'
    return {'newParts':[obj.name for obj in objects],'records':records,'quality':quality,'scope':root['oleoInstallationScope']}
