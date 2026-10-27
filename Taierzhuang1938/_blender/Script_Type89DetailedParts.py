"""Reference-visible thin sheet and cast-detail builders for Type89MediumTank."""
import bpy
import bmesh
import math
import numpy as np
import json
from pathlib import Path
from mathutils import Vector


def BuildBowMgJacket(quality,parent,steel,Mesh,PolygonPrism,Lathe,Tube,CutOpening,settings=None):
    # Native2007 shows a strongly tapered perforated sleeve. The prior
    # near-cylinder exaggerated the muzzle diameter and its swept volume.
    settings=settings or {};outer=settings.get('jacketOuterProfileM',[[.047,.012],[.046,.030],[.015,.360],[.011,.390]]);wall=settings.get('jacketWallThicknessM',.0025)
    profile=[tuple(p)for p in outer]+[(r-wall,y)for r,y in reversed(outer)]
    jacket=Lathe('BowMgPerforatedJacket',profile,(0,0,.010),steel,parent,'Y',48 if quality=='High' else 32,closeProfile=True)
    def Radius(y):
        for (a,s),(b,t)in zip(outer,outer[1:]):
            if s<=y<=t:return a+(b-a)*(y-s)/(t-s),(b-a)/(t-s)
        raise ValueError('Vent outside authored sleeve')
    if quality in ['High','Game']:
        for y in [.075,.120,.165,.210,.255,.300,.345]:
            for angle in [math.pi/6+i*math.pi/3 for i in range(6)]:
                radius,slope=Radius(y);radial=Vector((math.cos(angle),0,math.sin(angle)));direction=Vector((math.cos(angle),-slope,math.sin(angle))).normalized()
                center=Vector((0,y,.010))+radial*(radius-wall/2)
                cutter=Tube('BowMgJacketVentCutter',center-direction*.007,center+direction*.007,.0035,steel,parent,12 if quality=='High' else 8)
                CutOpening([jacket],cutter)
        if quality=='High':
            bevel=jacket.modifiers.new('VentCastingEdges','BEVEL');bevel.width=.0004;bevel.segments=2
        else:
            # Retain the real holes; their sub-millimetre edge radius is
            # projected from High. Split the bore rims instead of blending
            # outer/inner wall normals into dark serrated shading.
            jacket.data.set_sharp_from_angle(angle=math.radians(35));jacket.data.update()
        normals=jacket.modifiers.new('VentCornerNormals','WEIGHTED_NORMAL');normals.keep_sharp=True
    scale=settings.get('assemblyScale',1.0);outside=settings.get('barrelOutsideRadiusM',.0075)/scale;bore=settings.get('nominalBarrelBoreRadiusM',.00325)/scale
    Lathe('BowMgBarrel',[(outside,.09),(outside,.397),(bore,.397),(bore,.32)],(0,0,.010),steel,parent,'Y',24 if quality=='High' else 12)
    support=[(-.034,-.050),(.034,-.050),(.034,-.028),(.027,-.028),(.027,-.042),(-.027,-.042),(-.027,-.028),(-.034,-.028)]
    PolygonPrism('BowMgLowerMuzzleSupport',support,'Y',.035,(0,.350,.010),steel,parent,.001 if quality=='High' else 0)


def SampleTrackFenderHeight(quality,y,heightOffset=0):
    if y>=-2.10:return 1.320+heightOffset
    # Match the actual straight LOD segments at the rear lamp's mounting foot.
    steps=12 if quality=='High' else 4;spacing=.550/steps
    distance=max(0,min(.550,-y-2.10));index=min(steps-1,int(distance/spacing));t=(distance-index*spacing)/spacing
    a=1.320+heightOffset-.170*(index*spacing/.725)**2
    b=1.320+heightOffset-.170*((index+1)*spacing/.725)**2
    return a*(1-t)+b*t


def BuildTrackFender(quality,parent,side,armor,Mesh,Tube,heightOffset=0,frontRise=0):
    # Native19 and the2007 primary show the shelf beyond the belt, then
    # rolling down into a rounded end. The former end stopped over the wheel
    # and could only be lowered until it hit the belt.
    stations=[(1.62,1.305+heightOffset,.175),(1.57,1.320+heightOffset,.175),(-2.10,1.320+heightOffset,.175)]
    if frontRise:
        # Keep the observed flat shelf low while rolling its concealed front
        # mouth up over the idler wrap, rather than pushing the whole shelf up.
        base=1.320+heightOffset
        stations=[(1.62,1.305+heightOffset+frontRise,.175),(1.605,base+frontRise*.35,.175),
                  (1.585,base+frontRise*.07,.175),(1.57,base,.175),(-2.10,base,.175)]
    rearStart=len(stations)-1
    longitudinal=12 if quality=='High' else 4
    capSteps=10 if quality=='High' else 3
    def Height(y):return 1.320+heightOffset-.170*((-y-2.10)/.725)**2
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
    tip=len(vertices);vertices.extend([(side*.905,-2.825,1.150+heightOffset),(side*.905,-2.825,1.142+heightOffset)])
    a=(len(stations)-1)*4
    faces.extend([(a,a+1,tip),(a+2,tip+1,a+3),(a,tip,tip+1,a+2),(a+1,a+3,tip+1,tip)])
    Mesh('TrackFender',vertices,faces,armor,parent,smooth=False)
    Tube('FenderLip',(side*1.079,1.57,1.32+heightOffset),(side*1.079,-2.10,1.32+heightOffset),.009,armor,parent)
    curve=[Vector((side*(.905+w),y,z)) for y,z,w in stations[rearStart:]]
    curve.append(Vector((side*.905,-2.825,1.15+heightOffset)))
    curve.extend(Vector((side*(.905-w),y,z)) for y,z,w in reversed(stations[rearStart:]))
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
    def CastWindow(corners,radius):
        # Originals16/20 resolve continuous round cast shoulders, not the
        # former four straight corner clips. Preserve their tapered footprint.
        steps=6 if quality=='High' else 3
        result=[]
        for (cx,cy),start in zip(corners,[-math.pi,-math.pi/2,0,math.pi/2]):
            for i in range(steps+1):
                angle=start+math.pi/2*i/steps
                result.append((cx+radius*math.cos(angle),cy+radius*math.sin(angle)))
        return result
    for side in [-1,1]:
        # The two large cast openings have a straight grouser-side shoulder
        # and a tapered, rounded guide-side heel. Equal capsule slots made the
        # centre web and the lower corners read unlike originals16/20.
        center=CastWindow([(.036,-.024),(.076,-.024),(.072,.028),(.041,.028)],.015)
        cutter=PolygonPrism('ShoeCenterWindow',[(side*x,y) for x,y in center],'Z',.12,(0,0,0),track,None,0)
        CutOpening([plate],cutter)
        outer=CastWindow([(.120,-.012),(.141,-.012),(.138,.017),(.120,.017)],.009)
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
    modifier=plate.modifiers.new('RoundedCastEdges','BEVEL');modifier.width=.0040;modifier.segments=4 if quality=='High' else 2
    # Fillet the actual face/wall junctions. Boolean tessellation diagonals
    # and the sampled curved walls are not separate cast edges to bevel.
    modifier.limit_method='ANGLE';modifier.angle_limit=math.radians(60)
    modifier=plate.modifiers.new('CastCornerNormals','WEIGHTED_NORMAL');modifier.keep_sharp=True
    for x in [-.122,0,.122]:
        # The pin eyes belong to the same casting. They are not separate,
        # uniformly bright machined-steel tubes. Keep their outer crown behind
        # the true trailing relief instead of filling that photographed notch.
        if quality=='High':
            Lathe('ShoePinBarrel',[(.0133,-.036),(.01805,-.031),(.019,-.023),(.019,.023),(.01805,.031),(.0133,.036)],(x,.057*pitchScale,-.010),track,None,'X',16,closeProfile=True)
        else:
            Lathe('ShoePinBarrel',[(.0133,-.036),(.019,-.036),(.019,.036),(.0133,.036)],(x,.057*pitchScale,-.010),track,None,'X',12,closeProfile=True)
    # The solid end buttons of the old shoe were unsupported by the close-up;
    # the small circles on the outside flange are the pin-eye bores above.
    PolygonPrism('ShoeGuideHorn',[(y*pitchScale,z) for y,z in [(-.037,-.014),(-.016,-.065),(.014,-.065),(.038,-.014)]],'X',.032,(0,0,0),track,None,.003 if quality=='High' else 0)
    return plate


def BuildRearDriveBearingCover(quality,side,parent,axleY,armor,Mesh,PolygonPrism,Lathe,HexBolt,Rivet,axleZ=.790,Tube=None,CutOpening=None):
    # Photo19's visible contour/rivet centres, inverted in the independently
    # calibrated side camera and expressed relative to the visible axle.
    # The former650mm-long cover and208mm boss were oversized in that view.
    # Thickness, hidden lower edge and the small boss fastener count remain
    # reconstruction parameters rather than factory dimensions.
    shift=axleY+2.18;shiftZ=axleZ-.790
    outline=[(-1.8589,.9155),(-2.1316,.9077)]
    count=16 if quality=='High' else 10
    for controls in [((-2.1316,.9077),(-2.243,.9077),(-2.284,.856),(-2.2806,.7837)),
                     ((-2.2806,.7837),(-2.2806,.695),(-2.216,.649),(-2.1193,.6081))]:
        for i in range(1,count+1):
            t=i/count
            outline.append(tuple((1-t)**3*controls[0][j]+3*(1-t)**2*t*controls[1][j]+3*(1-t)*t*t*controls[2][j]+t**3*controls[3][j] for j in [0,1]))
    outline.append((-1.8589,.6081))
    PolygonPrism('RearDriveBearingCover',[(y+shift,z+shiftZ) for y,z in outline],'X',.014,(side*1.037,0,0),armor,parent,.0025)
    boss=[(.061,0),(.061,.003),(.054,.009),(.047,.011)]
    bearing=Lathe('RearDriveBearingBoss',[(r,side*offset) for r,offset in boss],(side*1.044,axleY,axleZ),armor,parent,'X',48 if quality=='High' else 32)
    nut=HexBolt((side*1.062,axleY,axleZ),(side,0,0),parent,.026,.018)
    if side<0:
        # Same-car2007 and2025 resolve a circular centre, an asymmetric
        # upper/side locking plate and a separate opening. The old sixfold
        # pattern is contradicted on this visible side. Bore/neck depth and
        # sheet thickness below are reconstruction values, not factory data.
        assert Tube is not None and CutOpening is not None
        Tube('RearBossConnectingNeck',(-1.054,axleY,axleZ),(-1.066,axleY,axleZ),.018,armor,parent,32 if quality=='High' else 24)
        bm=bmesh.new();bm.from_mesh(nut.data);bm.verts.ensure_lookup_table()
        bm.faces.new([bm.verts[i]for i in reversed(range(6))]);bm.normal_update();bm.to_mesh(nut.data);bm.free()
        cutter=Tube('RearNutRecessCutter',(-1.086,axleY,axleZ),(-1.072,axleY,axleZ),.0065,armor,parent,32 if quality=='High' else 24)
        CutOpening([nut],cutter)
        outline=[(.02992702,-.01411718),(.03143120,.00335336),(.02665496,.02177149),(.01452112,.04010344),
                 (.00023174,.05635977),(-.00804567,.06139988),(-.01975369,.05614847),(-.02315712,.04687899),
                 (-.01825047,.03359127),(-.00597596,.02038288),(.00934601,.00310224),(.01730514,-.01426417),(.02237773,-.02139491)]
        PolygonPrism('RearBossAsymmetricPlate',[(axleY+y,axleZ+z)for y,z in outline],'X',.0025,(-1.059,0,0),armor,parent,.0006)
        HexBolt((-1.064,axleY-.00489034,axleZ+.05392825),(-1,0,0),parent,.006,.004)
        cutter=Tube('RearBossObservedHoleCutter',(-1.070,axleY-.04876202,axleZ+.02549000),(-1.045,axleY-.04876202,axleZ+.02549000),.004,armor,parent,24 if quality=='High' else 16)
        CutOpening([bearing],cutter)
        parent['rearBearingDetailEvidence']='Left visible2007/2025: circular centre/asymmetric plate; hidden neck/depth and tiny fixing state inferred'
    else:
        # Opposite exterior occupancy remains an open reference question;
        # do not mirror the observed left locking-plate orientation into it.
        for i in range(6):
            angle=2*math.pi*i/6
            HexBolt((side*1.057,axleY+math.cos(angle)*.048,axleZ+math.sin(angle)*.048),(side,0,0),parent,.005,.004)
    for y,z in [(-1.8741,.8928),(-1.9745,.8908),(-2.0732,.8888),(-2.1732,.8868),(-2.2363,.8573),
                (-2.2655,.7921),(-2.2424,.7088),(-2.1815,.6538),(-1.8698,.8028),(-1.8732,.699)]:
        Rivet((side*1.047,y+shift,z+shiftZ),(side,0,0),parent,.008)
    band=[(-1.8584,.7054),(-1.9264,.7097),(-2.0,.7026),(-2.0532,.6792),(-2.0963,.6394),(-2.110,.618)]
    vertices=[];faces=[]
    for i,(y,z) in enumerate(band):
        tangent=(Vector(band[min(len(band)-1,i+1)])-Vector(band[max(0,i-1)])).normalized()
        normal=Vector((-tangent.y,tangent.x))*.006
        for x in [side*1.044,side*1.048]:
            vertices.extend((x,y+shift+dy,z+shiftZ+dz) for dy,dz in [tuple(normal),tuple(-normal)])
    for i in range(len(band)-1):
        a=i*4;b=(i+1)*4
        faces.extend([(a,a+1,b+1,b),(a+2,b+2,b+3,a+3),(a,b,b+2,a+2),(a+1,a+3,b+3,b+1)])
    faces.extend([(0,2,3,1),tuple(range((len(band)-1)*4,len(vertices)))])
    if side>0:Mesh('RearBearingPressedBand',vertices,faces,armor,parent,.001)


def BuildRearApronDetail(quality,parent,axleY,axleZ,armor,Mesh,PolygonPrism,Lathe,Rivet,Tube,CutOpening,coverRearY,outerFoldHeight,bottomHeight):
    """Photo-visible left rear termination; concealed attachment stays inferred."""
    dataFile=Path(__file__).resolve().parents[1]/'Model/Type89MediumTank/Data_RearApronReconstruction.json'
    data=json.loads(dataFile.read_text(encoding='utf8'));assert data['leftOnly']
    def Points(offsets):return [(axleY+y,axleZ+z)for y,z in offsets]
    def Plate(name,section,rounding):
        outline=Points(section['outlineOffsetsYZ'])
        steps=8 if quality=='High' else 5
        if name=='RearApronWideCurvedFlange':
            count=len(section['upperNative']);upper=outline[:count];lower=list(reversed(outline[count:]))
            outline=RefineTensionerRail(upper,steps)+list(reversed(RefineTensionerRail(lower,steps)))
        else:
            outline=[outline[0]]+RefineTensionerRail(outline[1:5],steps)+[outline[-1]]
        return PolygonPrism(name,outline,'X',section['backX']-section['frontX'],((section['backX']+section['frontX'])/2,0,0),armor,parent,.0007)
    apron=Plate('RearApronTermination',data['apron'],.0015)
    flange=Plate('RearApronWideCurvedFlange',data['flange'],.004)
    outline=Points(data['apron']['outlineOffsetsYZ']);frontTop=outline[0];frontBottom=outline[-1]
    transition=data['frontTransition'];frontY=coverRearY-transition['longitudinalClearanceM']
    PolygonPrism('RearApronFrontTransition',[(frontY,outerFoldHeight),frontTop,frontBottom,(frontY,bottomHeight)],'X',transition['backX']-transition['frontX'],((transition['frontX']+transition['backX'])/2,0,0),armor,parent,.0007)
    for key in ['apronCrowns','flangeCrowns']:
        section=data[key]
        for y,z in Points(section['offsetsYZ']):Rivet((section['baseX'],y,z),(-1,0,0),parent,section['radiusM'])
    section=data['lowerRoundFeatures']
    for y,z in Points(section['offsetsYZ']):
        x=section['frontX'];cutter=Tube('RearApronRoundFeatureCutter',(x-.003,y,z),(x+section['blindDepthM'],y,z),section['radiusM'],armor,parent,24 if quality=='High' else 16)
        CutOpening([flange],cutter)
    parent['rearApronEvidence']='Visible2007/2025 lower plate, broad curved flange and fittings; thickness/fixed hidden attachment/round-feature occupancy inferred'


def BuildSideVisionLatch(quality,side,parent,armor,steel,Node,Box,Tube,Lathe):
    # Native2007 resolves two thin lower bars and two open lobes at their end.
    # The root pivot, folded storage pose and deployment timing are an explicit
    # functional reconstruction. They avoid forcing the observed open bars
    # through solid hull metal when the independently hinged cover is closed.
    x=-side*.022
    Box('SideVisionLatchRoot',(x,-.125,-.135),(.008,.022,.028),armor,parent,.001)
    Tube('SideVisionLatchPivot',(x-side*.005,-.125,-.135),(x+side*.005,-.125,-.135),.005,steel,parent,16 if quality=='High' else 10)
    latch=Node('Node_SideVisionLatch'+('Left' if side<0 else 'Right'),(x,-.125,-.135),parent,
               axis='localX',latchFoldDegrees=90,latchDeployStartDegrees=90,latchDeployEndDegrees=150,
               reconstruction='Photo-visible bars/eyes; hidden pivot and folding sequence inferred')
    latch.rotation_euler.x=math.pi/2
    for z in [.008,-.007]:
        Box('SideVisionLowerLatchBar',(0,.075,z),(.004,.156,.005),armor,latch,.0008)
    Tube('SideVisionLatchEndStem',(0,.140,-.007),(0,.140,.023),.0025,armor,latch,12 if quality=='High' else 8)
    for y in [.1355,.1445]:
        Lathe('SideVisionOpenWingEye',[(.0033,-.0013),(.0058,-.0013),(.0058,.0013),(.0033,.0013)],
              (0,y,.023),armor,latch,'X',24 if quality=='High' else 16,closeProfile=True)


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


def RefineTensionerContour(points,distance,steps):
    result=[]
    for i,point in enumerate(points):
        p=Vector(point);a=Vector(points[i-1]);b=Vector(points[(i+1)%len(points)])
        trim=min(distance,(a-p).length*.35,(b-p).length*.35)
        a=p+(a-p).normalized()*trim;b=p+(b-p).normalized()*trim
        for j in range(steps+1):
            t=j/steps;result.append(tuple(a*(1-t)**2+p*(2*t*(1-t))+b*t*t))
    return result


def RefineTensionerRail(points,steps):
    # Preserve fastener stations while rounding the photographed cast bends.
    result=[]
    for i in range(len(points)-1):
        a,b,c,d=[Vector(points[max(0,min(len(points)-1,j))]) for j in [i-1,i,i+1,i+2]]
        for j in range(steps):
            t=j/steps
            result.append(tuple(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)))
    return result+[tuple(points[-1])]


def BuildPerforatedGuard(quality,parent,armor,guardMaterial,Mesh,PolygonPrism,HexBolt,settings=None):
    settings=settings or {}
    guardLength=settings.get('length',.88);halfLength=guardLength/2
    flatRise=settings.get('flatRise',.095);crownRise=settings.get('crownRise',.085)
    innerFootLift=settings.get('innerFootLift',0)
    halfWidth=settings.get('halfWidth',.155);cornerWidth=settings.get('cornerWidth',.073)
    crownHalfWidth=halfWidth-cornerWidth
    assert crownHalfWidth>0
    profile=[(-halfWidth,0),(-halfWidth,flatRise)]
    profile.extend((-crownHalfWidth+cornerWidth*math.cos(math.pi-i*math.pi/24),flatRise+crownRise*math.sin(math.pi-i*math.pi/24)) for i in range(1,13))
    profile.append((crownHalfWidth,flatRise+crownRise))
    profile.extend((crownHalfWidth+cornerWidth*math.cos(math.pi/2-i*math.pi/24),flatRise+crownRise*math.sin(math.pi/2-i*math.pi/24)) for i in range(1,13))
    profile.append((halfWidth,innerFootLift))
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
    cols=settings.get('columns',51);rows=round(arcLength/settings.get('pitch',.017));cellS=arcLength/rows;cellY=guardLength/cols
    half=settings.get('holeRadius',.00425);corner=half if settings.get('roundHoles') else .00115
    vertices=[];faces=[]
    if quality=='High':
        angleCount=24 if settings.get('roundHoles') else 12
        angles=sorted(set([round(i*2*math.pi/angleCount,10) for i in range(angleCount)]+[round(math.atan2(y*cellY,x*cellS)%(2*math.pi),10) for x,y in [(-1,-1),(-1,1),(1,-1),(1,1)]]))
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
    bandFractions=settings.get('bandFractions',[0,1/3,2/3,1])
    for y in [halfLength-guardLength*fraction for fraction in bandFractions]:
        v=[];f=[]
        for i in range(33):
            for offset in [-.014,.014]:v.append(Point(arcLength*i/32,y+offset,.002))
        for i in range(32):f.append((i*2,i*2+1,i*2+3,i*2+2))
        band=Mesh('GuardPressedBand',v,f,armor,parent,smooth=True)
        if quality=='High':
            solid=band.modifiers.new('PressedBandThickness','SOLIDIFY');solid.thickness=.002
        for x in [-halfWidth+.015,halfWidth-.015]:HexBolt((x,y,.018),(0,0,1),parent,.006,.005)
    if settings.get('crossBandWidth'):
        # Both native2007 and2025 views show this strip beneath the crown.
        width=settings['crossBandWidth']
        for centre in [flatRise,arcLength-(flatRise-innerFootLift)]:
            v=[];f=[];steps=8 if quality=='High' else 4
            for i in range(steps+1):
                s=centre-width/2+width*i/steps
                for y in [-halfLength,halfLength]:v.append(Point(s,y,.002))
            for i in range(steps):f.append((i*2,i*2+1,i*2+3,i*2+2))
            band=Mesh('GuardHorizontalPressedBand',v,f,armor,parent,smooth=True)
            solid=band.modifiers.new('CrossBandThickness','SOLIDIFY');solid.thickness=.002
    for y in [-halfLength-.003,halfLength+.003]:
        PolygonPrism('GuardEndPlate',profile,'Y',.002,(0,y,0),armor,parent,.001 if quality=='High' else 0)
    parent['holeShape']='Circular' if settings.get('roundHoles') else 'RoundedSquareWorkingLegacy'
    parent['bandFractions']=bandFractions
    parent['horizontalBandWidthM']=settings.get('crossBandWidth',0)
    parent['guardWidthM']=halfWidth*2
    return guard
