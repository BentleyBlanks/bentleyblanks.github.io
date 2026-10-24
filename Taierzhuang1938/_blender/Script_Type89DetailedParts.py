"""Reference-visible thin sheet and cast-detail builders for Type89MediumTank."""
import bpy
import bmesh
import math
import numpy as np
from mathutils import Vector


def BuildBowMgJacket(quality,parent,steel,Mesh,PolygonPrism,Lathe,Tube,CutOpening):
    # The2007 primary has an exposed perforated cylindrical jacket. The later
    # 2025 pointed protective cover is a different removable accessory state.
    profile=[(.032,.012),(.047,.045),(.047,.365),(.043,.390),
             (.0405,.390),(.0445,.363),(.0445,.048),(.0295,.014)]
    jacket=Lathe('BowMgPerforatedJacket',profile,(0,0,.010),steel,parent,'Y',48 if quality=='High' else 16,closeProfile=True)
    if quality=='High':
        for y in [.075,.120,.165,.210,.255,.300,.345]:
            for angle in [math.pi/6+i*math.pi/3 for i in range(6)]:
                direction=Vector((math.cos(angle),0,math.sin(angle)))
                center=Vector((0,y,.010))+direction*.046
                cutter=Tube('BowMgJacketVentCutter',center-direction*.007,center+direction*.007,.0035,steel,parent,12)
                CutOpening([jacket],cutter)
        bevel=jacket.modifiers.new('VentCastingEdges','BEVEL');bevel.width=.0004;bevel.segments=2
        normals=jacket.modifiers.new('VentCornerNormals','WEIGHTED_NORMAL');normals.keep_sharp=True
    Lathe('BowMgBarrel',[(.014,.09),(.014,.393),(.008,.393),(.008,.32)],(0,0,.010),steel,parent,'Y',24 if quality=='High' else 12)
    support=[(-.034,-.050),(.034,-.050),(.034,-.028),(.027,-.028),(.027,-.042),(-.027,-.042),(-.027,-.028),(-.034,-.028)]
    PolygonPrism('BowMgLowerMuzzleSupport',support,'Y',.035,(0,.350,.010),steel,parent,.001 if quality=='High' else 0)


def BuildTrackFender(quality,parent,side,armor,Mesh,Tube):
    # Originals19 and31 show the rear shelf continuing beyond the belt, then
    # rolling down into a rounded end. The former end stopped over the wheel
    # and could only be lowered until it hit the belt.
    stations=[(1.62,1.305,.175),(1.57,1.320,.175),(-2.10,1.320,.175)]
    longitudinal=12 if quality=='High' else 4
    capSteps=10 if quality=='High' else 3
    def Height(y):return 1.320-.170*((-y-2.10)/.725)**2
    for i in range(1,longitudinal+1):
        y=-2.10-.550*i/longitudinal;stations.append((y,Height(y),.175))
    for i in range(1,capSteps):
        angle=i*math.pi/(2*capSteps);y=-2.65-.175*math.sin(angle)
        stations.append((y,Height(y),.175*math.cos(angle)))
    vertices=[];faces=[]
    for y,z,width in stations:
        vertices.extend((side*.905+x,y,z+depth) for depth in [0,-.008] for x in [-width,width])
    for i in range(len(stations)-1):
        a=i*4;b=a+4
        faces.extend([(a,a+1,b+1,b),(a+2,b+2,b+3,a+3),
                      (a,b,b+2,a+2),(a+1,a+3,b+3,b+1)])
    faces.append((0,2,3,1))
    tip=len(vertices);vertices.extend([(side*.905,-2.825,1.150),(side*.905,-2.825,1.142)])
    a=(len(stations)-1)*4
    faces.extend([(a,a+1,tip),(a+2,tip+1,a+3),(a,tip,tip+1,a+2),(a+1,a+3,tip+1,tip)])
    Mesh('TrackFender',vertices,faces,armor,parent,smooth=False)
    Tube('FenderLip',(side*1.079,1.57,1.32),(side*1.079,-2.10,1.32),.009,armor,parent)
    curve=[Vector((side*(.905+w),y,z)) for y,z,w in stations[2:]]
    curve.append(Vector((side*.905,-2.825,1.15)))
    curve.extend(Vector((side*(.905-w),y,z)) for y,z,w in reversed(stations[2:]))
    count=12 if quality=='High' else 4;vertices=[];faces=[]
    for i,point in enumerate(curve):
        tangent=(curve[min(i+1,len(curve)-1)]-curve[max(0,i-1)]).normalized()
        horizontal=tangent.cross(Vector((0,0,1))).normalized();normal=horizontal.cross(tangent).normalized()
        for j in range(count):
            angle=2*math.pi*j/count
            vertices.append(tuple(point+.009*(math.cos(angle)*horizontal+math.sin(angle)*normal)))
    for i in range(len(curve)-1):
        for j in range(count):faces.append((i*count+j,i*count+(j+1)%count,(i+1)*count+(j+1)%count,(i+1)*count+j))
    Mesh('FenderRolledRearEdge',vertices,faces,armor,parent,smooth=True)


def BuildCastTrackShoe(quality,pitchScale,track,steel,Mesh,PolygonPrism,RoundedRectangle,CutOpening,Lathe,Tube):
    # Native originals16/20 show three shallow keyways in the broad leading
    # flange, a deep central relief at the trailing edge, and short, angled
    # outer windows. A rectangle with four equal-style slots misses that cast
    # outline. Keep the game silhouette; project the small pin-eye bores.
    outline=[(-.183,-.068),(-.130,-.068),(-.123,-.055),(-.116,-.068),
             (-.007,-.068),(0,-.054),(.007,-.068),(.116,-.068),
             (.123,-.055),(.130,-.068),(.183,-.068),(.177,-.034),
             (.170,.010),(.126,.061),(.018,.061),(.012,.043),(0,.036),
             (-.012,.043),(-.018,.061),(-.126,.061),(-.170,.010),(-.177,-.034)]
    plate=PolygonPrism('CastShoePlate',outline,'Z',.025,(0,0,0),track,None,0)
    for side in [-1,1]:
        # The two large cast openings have a straight grouser-side shoulder
        # and a tapered, rounded guide-side heel. Equal capsule slots made the
        # centre web and the lower corners read unlike originals16/20.
        center=[(.027,-.039),(.083,-.039),(.092,-.027),(.087,.020),
                (.073,.040),(.043,.043),(.027,.029),(.020,-.020)]
        cutter=PolygonPrism('ShoeCenterWindow',[(side*x,y) for x,y in center],'Z',.12,(0,0,0),track,None,0)
        CutOpening([plate],cutter)
        outer=[(.113,-.022),(.151,-.022),(.147,.014),(.138,.027),(.118,.027),(.111,.015)]
        cutter=PolygonPrism('ShoeOuterWindow',[(side*x,y) for x,y in outer],'Z',.12,(0,0,0),track,None,0)
        CutOpening([plate],cutter)
    # The photographed leading flange is a thick part of the casting, not a
    # sharp rectangular bar laid over a thin plate. A planar fall keeps the web
    # normals continuous and leaves the guide-side clearance unchanged.
    for vertex in plate.data.vertices:
        if vertex.co.z>0:vertex.co.z=.022-.162*vertex.co.y
    for x in [-.161,.161]:
        cutter=Lathe('ShoePinEyeCutter',[(.0085,-.07),(.0085,.07)],(x,-.052,0),track,None,'Z',20 if quality=='High' else 10)
        CutOpening([plate],cutter)
    # Cast edges affect both the silhouette and the moving grazing highlight.
    # Keep a real four-millimetre chamfer in the game mesh; a normal-map-only
    # corner left each link looking like a sharp rectangular toy casting.
    modifier=plate.modifiers.new('RoundedCastEdges','BEVEL');modifier.width=.0040;modifier.segments=4 if quality=='High' else 1
    modifier=plate.modifiers.new('CastCornerNormals','WEIGHTED_NORMAL');modifier.keep_sharp=True
    for x in [-.122,0,.122]:
        # The pin eyes belong to the same casting. They are not separate,
        # uniformly bright machined-steel tubes. Keep their outer crown behind
        # the true trailing relief instead of filling that photographed notch.
        if quality=='High':
            Lathe('ShoePinBarrel',[(.0133,-.036),(.01805,-.031),(.019,-.023),(.019,.023),(.01805,.031),(.0133,.036)],(x,.057*pitchScale,-.010),track,None,'X',16,closeProfile=True)
        else:
            Lathe('ShoePinBarrel',[(.0133,-.036),(.019,-.036),(.019,.036),(.0133,.036)],(x,.057*pitchScale,-.010),track,None,'X',8,closeProfile=True)
    # The solid end buttons of the old shoe were unsupported by the close-up;
    # the small circles on the outside flange are the pin-eye bores above.
    PolygonPrism('ShoeGuideHorn',[(y*pitchScale,z) for y,z in [(-.037,-.014),(-.016,-.065),(.014,-.065),(.038,-.014)]],'X',.032,(0,0,0),track,None,.003 if quality=='High' else 0)
    return plate


def BuildMainGunHardware(quality,gunPitch,recoil,armor,steel,shadow,Mesh,PolygonPrism,RoundedRectangle,CutOpening,Lathe,Tube,Box):
    # Original16 resolves a C-shaped outer shield and a separate narrow sight
    # slit behind its notch; treating them as one closed square hole was wrong.
    shield=PolygonPrism('MantletSightShield',RoundedRectangle(.185,.240,.002,3 if quality=='High' else 1),'Y',.016,(-.0775,.090,-.035),armor,gunPitch,.001 if quality=='High' else 0)
    notch=PolygonPrism('SightInnerNotch',RoundedRectangle(.110,.075,.001,3 if quality=='High' else 1),'Y',.10,(-.035,.090,-.020),shadow,gunPitch,0)
    CutOpening([shield],notch)
    optic=Box('OpticBackingPlate',(-.035,.030,-.020),(.110,.008,.095),armor,gunPitch,0)
    slit=PolygonPrism('OpticVerticalSlit',RoundedRectangle(.024,.070,.010,5 if quality=='High' else 2),'Y',.08,(-.025,.030,-.024),shadow,gunPitch,0)
    CutOpening([optic],slit)
    Box('OpticInteriorShadow',(-.025,.008,-.024),(.028,.004,.090),shadow,gunPitch,0)
    relief=Lathe('SightBarrelClearance',[(.073,-.10),(.073,.20)],(.075,0,.032),shadow,gunPitch,'Y',48 if quality=='High' else 24)
    CutOpening([shield,optic],relief)
    if quality=='High':
        for a,b in [((-.164,.0994,.085),(.009,.0994,.085)),((-.164,.0994,-.155),(.009,.0994,-.155)),((-.170,.0994,-.149),(-.170,.0994,.079))]:
            Tube('SightShieldWeld',a,b,.0015,armor,gunPitch,8)

    # A flat exposed muzzle annulus, rather than a smoothed, inflated torus.
    count=64 if quality=='High' else 24
    barrel=Lathe('GunBarrel',[(.067,0),(.067,.11),(.055,.17),(.042,.36),(.038,.84),(.041,.855),(.041,.89),(.0285,.89),(.0285,.72)],(0,0,.032),armor,recoil,'Y',count)
    barrel.data.materials.append(steel);barrel.data.materials.append(shadow)
    for polygon in barrel.data.polygons:
        if 6*count<=polygon.index<7*count:
            polygon.use_smooth=False;polygon.material_index=1
    barrel.data.polygons[-1].material_index=2;barrel.data.polygons[-1].use_smooth=False
    # The32-sided dark liner must stay inside the24-sided game bore's chords;
    # a0.1mm radial offset intersected those chords and looked like rifling.
    linerRadius=.0284 if quality=='High' else .0280
    assert quality=='High' or linerRadius<.0285*math.cos(math.pi/24)-.0002
    Lathe('MuzzleBore',[(linerRadius,.71),(linerRadius,.884)],(0,0,.032),shadow,recoil,'Y',32,capEnds=False)

    # The photographed front is a flat truncated circular plate. The body
    # remains round farther back and tapers into this D-section front cover.
    sections=[(.02,.060,-.088,.80),(.10,.068,-.088,.72),(.60,.068,-.088,.40),(.66,.065,-.060,0),(.70,.065,-.060,0)]
    count=48 if quality=='High' else 20;vertices=[];faces=[]
    for y,radius,centerZ,upper in sections:
        for i in range(count):
            angle=i*2*math.pi/count;sine=math.sin(angle)
            vertices.append((radius*math.cos(angle),y,centerZ+radius*(sine if sine<=0 else sine*upper)))
    for row in range(len(sections)-1):
        for i in range(count):
            j=(i+1)%count;faces.append((row*count+i,row*count+j,(row+1)*count+j,(row+1)*count+i))
    faces.extend([tuple(reversed(range(count))),tuple((len(sections)-1)*count+i for i in range(count))])
    housing=Mesh('RecoilFormedHousing',vertices,faces,armor,recoil,smooth=True)
    housing.data.polygons[-1].use_smooth=False;housing.data.polygons[-2].use_smooth=False
    for side in [-1,1]:
        Tube('RecoilRod',(side*.050,.08,-.026),(side*.050,.66,-.026),.008,armor,recoil,24 if quality=='High' else 8)
        for y in [.08,.64]:
            Lathe('RecoilRodCollar',[(.009,-.006),(.011,-.005),(.011,.005),(.009,.006)],(side*.050,y,-.026),armor,recoil,'Y',24 if quality=='High' else 8,closeProfile=True)
            barrelRadius=.067 if y<.11 else .042+(.038-.042)*(y-.36)/(.84-.36)
            startAngle=math.atan2(-.026-.032,.050);endAngle=math.radians(40)
            steps=8 if quality=='High' else 4
            path=[Vector((.050,-.026))]
            path.extend(Vector(((barrelRadius+.0025)*math.cos(startAngle+(endAngle-startAngle)*i/steps),.032+(barrelRadius+.0025)*math.sin(startAngle+(endAngle-startAngle)*i/steps))) for i in range(steps+1))
            left=[];right=[]
            for i,point in enumerate(path):
                tangent=(path[min(i+1,len(path)-1)]-path[max(0,i-1)]).normalized();normal=Vector((-tangent.y,tangent.x))*.0015
                left.append((side*(point.x+normal.x),point.y+normal.y));right.append((side*(point.x-normal.x),point.y-normal.y))
            PolygonPrism('RecoilRetainerStrap',left+list(reversed(right)),'Y',.015,(0,y,0),armor,recoil,.0005 if quality=='High' else 0)


def BuildChannelTail(quality,parent,armor,Mesh,PolygonPrism,HexBolt):
    # Side-photo 19 places the tip above the previous flat reconstruction.
    # Lift the complete channel, braces, gussets and their fasteners together.
    baseMesh=Mesh;basePrism=PolygonPrism;baseBolt=HexBolt
    def Lift(y):return .120*max(0,min(1,(-y-2.14)/1.20))
    def Mesh(name,vertices,*args,**kwargs):
        return baseMesh(name,[(x,y,z+Lift(y)) for x,y,z in vertices],*args,**kwargs)
    def PolygonPrism(name,outline,axis,depth,center,*args,**kwargs):
        assert axis=='X'
        return basePrism(name,[(y,z+Lift(y+center[1])) for y,z in outline],axis,depth,center,*args,**kwargs)
    def HexBolt(position,*args,**kwargs):
        x,y,z=position
        return baseBolt((x,y,z+Lift(y)),*args,**kwargs)
    def FlatBar(name,start,end,width,thickness):
        a=Vector(start);b=Vector(end);direction=(b-a).normalized();normal=Vector((0,0,1))
        normal=(normal-direction*normal.dot(direction)).normalized();across=normal.cross(direction)*width/2
        v=[tuple(point+across*s+normal*t*thickness/2) for point in [a,b] for s,t in [(-1,-1),(1,-1),(1,1),(-1,1)]]
        return Mesh(name,v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],armor,parent,.001 if quality=='High' else 0)
    count=48 if quality=='High' else 12
    control=[Vector((-2.09,.58)),Vector((-2.70,.62)),Vector((-3.24,.76)),Vector((-3.34,1.02))]
    points=[]
    for i in range(count+1):
        t=i/count;point=control[0]*(1-t)**3+control[1]*3*(1-t)**2*t+control[2]*3*(1-t)*t*t+control[3]*t**3
        height=.080*(1-t)+.025*t;points.append((point.x,point.y,height))
    for side in [-1,1]:
        outer=[(y,z) for y,z,h in points]+[(y,z+h) for y,z,h in reversed(points)]
        PolygonPrism('TailCurvedChannelWeb',outer,'X',.009,(side*.523,0,0),armor,parent,.001 if quality=='High' else 0)
        for upper,width in [(False,.075),(True,.052)]:
            vertices=[];faces=[]
            for y,z,h in points:
                for x in [-width/2,width/2]:vertices.append((side*.49+x,y,z+(h if upper else 0)))
            for i in range(count):faces.append((2*i,2*i+1,2*i+3,2*i+2))
            flange=Mesh('TailRunnerFlange',vertices,faces,armor,parent,smooth=True)
            solid=flange.modifiers.new('ChannelFlangeThickness','SOLIDIFY');solid.thickness=.008
        FlatBar('TailUpperRailFlange',(side*.49,-2.14,.86),(side*.49,-3.30,1.035),.075,.009)
        PolygonPrism('TailUpperRailWeb',[(-2.14,.81),(-2.14,.86),(-3.30,1.035),(-3.30,.985)],'X',.008,(side*.523,0,0),armor,parent,.001 if quality=='High' else 0)
        gusset=[(-3.30,1.025),(-2.99,.978),(-3.155,.858)]
        PolygonPrism('TailTipRivetedGusset',gusset,'X',.008,(side*.532,0,0),armor,parent,.001 if quality=='High' else 0)
        for y,z in [(-3.245,1.003),(-3.10,.979),(-3.18,.914),(-3.22,.954),(-3.14,.945)]:HexBolt((side*.538,y,z),(side,0,0),parent,.009,.006)
        for i in range(2,count-1,max(1,count//8)):
            y,z,h=points[i];HexBolt((side*.529,y,z+h*.50),(side,0,0),parent,.007,.005)
        PolygonPrism('TailRootMount',[(-2.10,.59),(-2.10,.89),(-2.30,.86),(-2.34,.62)],'X',.012,(side*.535,0,0),armor,parent,.002 if quality=='High' else 0)
        for y,z in [(-2.16,.65),(-2.16,.82),(-2.28,.67),(-2.28,.81)]:HexBolt((side*.543,y,z),(side,0,0),parent,.011,.008)
    FlatBar('TailFlatDiagonalLeft',(-.49,-2.23,.874),(.49,-3.145,1.012),.045,.009)
    FlatBar('TailFlatDiagonalRight',(.49,-2.23,.880),(-.49,-3.145,1.018),.045,.009)
    FlatBar('TailFlatCrossBrace',(-.53,-3.163,1.014),(.53,-3.163,1.014),.050,.012)
    for x,y,z in [(-.49,-2.23,.890),(.49,-2.23,.896),(-.49,-3.145,1.030),(.49,-3.145,1.024),(0,-2.687, .963)]:HexBolt((x,y,z),(0,0,1),parent,.010,.007)


def BuildPerforatedGuard(quality,parent,armor,guardMaterial,Mesh,PolygonPrism,HexBolt):
    guardLength=.88;halfLength=guardLength/2
    profile=[(-.155,0),(-.155,.095)]
    profile.extend((-.082+.073*math.cos(math.pi-i*math.pi/24),.095+.085*math.sin(math.pi-i*math.pi/24)) for i in range(1,13))
    profile.append((.082,.180))
    profile.extend((.082+.073*math.cos(math.pi/2-i*math.pi/24),.095+.085*math.sin(math.pi/2-i*math.pi/24)) for i in range(1,13))
    profile.append((.155,0))
    lengths=[math.hypot(b[0]-a[0],b[1]-a[1]) for a,b in zip(profile,profile[1:])]
    arcLength=sum(lengths)
    def ProfileAt(t):
        distance=max(0,min(1,t))*arcLength
        for i,length in enumerate(lengths):
            if distance<=length or i==len(lengths)-1:
                a,b=profile[i],profile[i+1];fraction=distance/length
                return (a[0]+(b[0]-a[0])*fraction,a[1]+(b[1]-a[1])*fraction)
            distance-=length
    def Point(s,y,depth=0):
        t=max(0,min(1,s/arcLength));x,z=ProfileAt(t)
        a=Vector(ProfileAt(max(0,t-.00001)));b=Vector(ProfileAt(min(1,t+.00001)))
        tangent=(b-a).normalized();normal=Vector((-tangent.y,0,tangent.x))
        return tuple(Vector((x,y,z))+normal*depth)
    cols=51;rows=round(arcLength/.017);cellS=arcLength/rows;cellY=guardLength/cols
    half=.00425;corner=.00115;vertices=[];faces=[]
    if quality=='High':
        angles=sorted(set([round(i*math.pi/6,10) for i in range(12)]+[round(math.atan2(y*cellY,x*cellS)%(2*math.pi),10) for x,y in [(-1,-1),(-1,1),(1,-1),(1,1)]]))
        def HoleRadius(angle):
            x,y=abs(math.cos(angle)),abs(math.sin(angle));distance=half/max(x,y)
            if min(x,y)*distance<=half-corner:return distance
            c=half-corner;dot=c*(x+y)
            return dot+math.sqrt(max(0,dot*dot-2*c*c+corner*corner))
        for row in range(rows):
            for col in range(cols):
                centerS=(row+.5)*cellS;centerY=-halfLength+(col+.5)*cellY;rings=[]
                for depth,outer in [(.0008,True),(.0008,False),(-.0008,True),(-.0008,False)]:
                    ring=[]
                    for angle in angles:
                        x,y=math.cos(angle),math.sin(angle)
                        distance=min(cellS/2/max(abs(x),1e-8),cellY/2/max(abs(y),1e-8)) if outer else HoleRadius(angle)
                        ring.append(len(vertices));vertices.append(Point(centerS+x*distance,centerY+y*distance,depth))
                    rings.append(ring)
                n=len(angles);of,inf,ob,inb=rings
                for i in range(n):
                    j=(i+1)%n
                    faces.extend([(of[i],of[j],inf[j],inf[i]),(ob[j],ob[i],inb[i],inb[j]),(inf[i],inf[j],inb[j],inb[i])])
        guard=Mesh('PunchedSheetGuardHigh',vertices,faces,guardMaterial,parent)
        bm=bmesh.new();bm.from_mesh(guard.data)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0000005)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(guard.data);bm.free()
    else:
        segments=32;uvs=[]
        for i in range(segments+1):
            for j,y in enumerate([-halfLength,halfLength]):
                vertices.append(Point(arcLength*i/segments,y));uvs.append((i/segments,j))
        for i in range(segments):faces.append((i*2,i*2+1,i*2+3,i*2+2))
        guard=Mesh('PunchedSheetGuardGame',vertices,faces,guardMaterial,parent,smooth=True)
        uv=guard.data.uv_layers.new(name='GuardPreviewUV')
        for loop in guard.data.loops:uv.data[loop.index].uv=uvs[loop.vertex_index]
        coordinates=guard.data.attributes.new('GuardCoord','FLOAT_VECTOR','POINT')
        for i,(u,v) in enumerate(uvs):coordinates.data[i].vector=(u,v,0)
        size=2048;u=(np.arange(size,dtype=np.float32)+.5)/size
        ds=(np.mod(u*rows,1)-.5)*cellS;dy=(np.mod(u*cols,1)-.5)*cellY
        qx=np.abs(ds[None,:])-(half-corner);qy=np.abs(dy[:,None])-(half-corner)
        distance=np.sqrt(np.maximum(qx,0)**2+np.maximum(qy,0)**2)+np.minimum(np.maximum(qx,qy),0)-corner
        pixels=np.ones((size,size,4),dtype=np.float32)
        pixels[:,:,3]=np.clip(.5+distance/(max(arcLength,guardLength)/size),0,1)
        image=bpy.data.images.new('Texture_Type89GuardPreviewMask',width=size,height=size,alpha=True)
        image.colorspace_settings.name='Non-Color';image.pixels.foreach_set(pixels.reshape(-1));image.pack()
        nodes=guardMaterial.node_tree.nodes;links=guardMaterial.node_tree.links
        tex=nodes.new('ShaderNodeTexImage');tex.image=image
        coordinates=nodes.new('ShaderNodeUVMap');coordinates.uv_map='GuardPreviewUV'
        links.new(coordinates.outputs['UV'],tex.inputs['Vector'])
        clip=nodes.new('ShaderNodeMath');clip.operation='GREATER_THAN';clip.inputs[1].default_value=.5
        links.new(tex.outputs['Alpha'],clip.inputs[0]);links.new(clip.outputs[0],nodes.get('Principled BSDF').inputs['Alpha'])
        guardMaterial.use_backface_culling=False
        for key,value in {'GuardRows':rows,'GuardColumns':cols,'GuardArcLength':arcLength,'GuardLength':guardLength,'GuardHoleHalf':half,'GuardHoleCorner':corner}.items():guardMaterial[key]=value
    guard['perforationColumns']=cols;guard['perforationRows']=rows
    guard['holeWidthM']=half*2;guard['sheetThicknessM']=.0016
    parent['perforationColumns']=cols;parent['perforationRows']=rows
    parent['guardPanels']=3;parent['guardHoleWidthM']=half*2;parent['guardSheetThicknessM']=.0016
    for y in [-halfLength,-guardLength/6,guardLength/6,halfLength]:
        v=[];f=[]
        for i in range(33):
            for offset in [-.014,.014]:v.append(Point(arcLength*i/32,y+offset,.002))
        for i in range(32):f.append((i*2,i*2+1,i*2+3,i*2+2))
        band=Mesh('GuardPressedBand',v,f,armor,parent,smooth=True)
        if quality=='High':
            solid=band.modifiers.new('PressedBandThickness','SOLIDIFY');solid.thickness=.002
        for x in [-.14,.14]:HexBolt((x,y,.018),(0,0,1),parent,.006,.005)
    for y in [-halfLength-.003,halfLength+.003]:PolygonPrism('GuardEndPlate',profile,'Y',.002,(0,y,0),armor,parent,.001 if quality=='High' else 0)
    return guard
