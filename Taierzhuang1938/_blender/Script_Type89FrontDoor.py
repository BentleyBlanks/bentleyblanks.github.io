"""Photographed three-hinge front door and oval latch; hidden depths inferred."""
import math
from mathutils import Vector,Matrix


def RoundedOutline(corners,radii,quality):
    result=[]
    for i,point in enumerate(corners):
        p=Vector(point);previous=Vector(corners[i-1]);following=Vector(corners[(i+1)%len(corners)])
        a=(previous-p).normalized();b=(following-p).normalized();angle=math.acos(max(-1,min(1,a.dot(b))));radius=radii[i]
        distance=min(radius/math.tan(angle/2),(previous-p).length*.40,(following-p).length*.40);radius=distance*math.tan(angle/2)
        centre=p+(a+b).normalized()*radius/math.sin(angle/2);start=p+a*distance-centre;end=p+b*distance-centre
        first=math.atan2(start.y,start.x);delta=math.atan2(start.x*end.y-start.y*end.x,start.dot(end))
        if delta<0:delta+=2*math.pi
        steps=6 if quality=='High'else(3 if radius>.030 else 2)
        result.extend((centre.x+radius*math.cos(first+delta*j/steps),centre.y+radius*math.sin(first+delta*j/steps))for j in range(steps+1))
    return result


def BuildFrontDoor(quality,front,targets,settings,armor,steel,shadow,
                   Node,Mesh,PolygonPrism,RoundedRectangle,CutOpening,Box,Tube,Lathe,Rivet):
    axis=Vector(settings['hingeAxisPointM']);tilt=settings['hingeAxisTiltYRadians'];slope=math.tan(tilt)
    def OuterX(z):return axis.x+slope*(z-axis.z)+settings['hingeToLeafEdgeM']
    corners=[(settings['inboardEdgeXM'],settings['topZM']),(OuterX(settings['topZM']),settings['topZM']),
             (OuterX(settings['bottomZM']),settings['bottomZM']),(settings['inboardChamferEndXM'],settings['bottomZM']),
             (settings['inboardEdgeXM'],settings['inboardChamferStartZM'])]
    outline=RoundedOutline(corners,settings['cornerRadiiM'],quality);centre=Vector((-.29,-.207))
    def Scaled(scale):return [tuple(centre+(Vector(p)-centre)*scale)for p in outline]
    # The visible returns are painted steel. Darkness belongs to the separate
    # inferred cabin back, rather than a cutter material on the exposed edge.
    cutter=PolygonPrism('BowDoorOpeningCutter',Scaled(.965),'Y',.36,(0,-.06,0),armor,front,0);CutOpening(targets,cutter)
    # The inside lip's millimetre edge radius is retained in High and baked
    # to Game; the photographed outer door contour keeps its real bevel.
    rebate=PolygonPrism('BowDoorOverlappingRebate',Scaled(1.015),'Y',.012,(0,.006,0),armor,front,.001)
    cutter=PolygonPrism('BowDoorRebateBore',Scaled(.930),'Y',.08,(0,.006,0),armor,front,0);CutOpening([rebate],cutter)
    PolygonPrism('BowDoorInteriorBack',Scaled(.965),'Y',.010,(0,-.16,0),shadow,front,0)
    hatch=Node('Node_BowHatch',axis,front,axis='localZ',rangeDegrees=[0,65],hingeDescription='Three photographed stations; camera-conditioned lower outline and small edge tilt')
    if settings.get('bowGunDoorStow'):hatch['bowGunDoorStow']=settings['bowGunDoorStow']
    hatch.rotation_euler.y=tilt;inverse=Matrix.Rotation(tilt,3,'Y').inverted();local=[]
    for x,z in outline:
        p=inverse@(Vector((x,settings['faceFrontYM'],z))-axis);local.append((p.x,p.z))
    middleY=settings['faceFrontYM']-settings['plateThicknessM']/2-axis.y
    PolygonPrism('BowAccessDoor',local,'Y',settings['plateThicknessM'],(0,middleY,0),armor,hatch,.002)
    fixed=Node('Node_BowDoorFixedHinge',axis,front);fixed.rotation_euler.y=tilt
    for station in settings['hingeStationsSourceZM']:
        z=(station-axis.z)/math.cos(tilt)
        movingY=settings['faceFrontYM']+settings['hingeMovingLeafDepthM']/2-axis.y
        Box('BowDoorMovingHingeLeaf',(settings['hingeMovingLeafCentreXM'],movingY,z),
            (settings['hingeMovingLeafWidthM'],settings['hingeMovingLeafDepthM'],settings['hingeMovingLeafHeightM']),armor,hatch,.001)
        foot=RoundedRectangle(.050,.115,.012,4 if quality=='High'else 2)
        PolygonPrism('BowDoorFixedBearingFoot',foot,'Y',.010,(-.007,-.012,z),armor,fixed,.0008 if quality=='High'else 0)
        for a,b,parent in [(z-.055,z-.020,fixed),(z-.019,z+.019,hatch),(z+.020,z+.055,fixed)]:
            Tube('BowDoorInterleavedKnuckle',(0,0,a),(0,0,b),settings['hingeBarrelRadiusM'],armor,parent,16 if quality=='High'else 10)
        Tube('BowDoorHingeAxle',(0,0,z-.062),(0,0,z+.062),.005,steel,fixed,12 if quality=='High'else 8)
        for x in settings['hingeMovingHeadXM']:Rivet((x,movingY+settings['hingeMovingLeafDepthM']/2+.0003,z),(0,1,0),hatch,settings['hingeMovingHeadRadiusM'])
        for dz in [-.043,.043]:Rivet((-.007,-.0067,z+dz),(0,1,0),fixed,settings['hingeFixedHeadRadiusM'])
    latchPosition=inverse@(Vector(settings['latchPositionM'])-axis);latch=Node('Node_BowDoorLatch',latchPosition,hatch,axis='localY',rangeDegrees=[-35,35],visibleHandle='Closed elongated oval; fixed body catch is separate')
    # Compensate the door-axis lean so the photographed latch plate/handle
    # are authored in the bow plane, while following the moving door.
    latch.rotation_euler.y=-tilt
    plate=[(.048,.038),(-.023,.038),(-.050,.010),(-.027,-.058),(-.015,-.068),(.017,-.071),(.048,-.042)]
    PolygonPrism('BowLatchBase',RoundedOutline(plate,[.006]*len(plate),quality),'Y',.008,(0,0,0),armor,latch,.0006 if quality=='High'else 0)
    bossProfile=[(.023,.004),(.025,.013),(.024,.035)]
    Lathe('BowLatchPivotBoss',bossProfile,(0,0,0),armor,latch,'Y',32 if quality=='High'else 16)
    for x,z in [(.021,.034),(-.021,.031),(-.039,.003),(-.020,-.046),(.014,-.060)]:Rivet((x,.0043,z),(0,1,0),latch,.0055)
    tiltLoop=settings['latchLoopTiltRadians'];major=Vector((math.sin(tiltLoop),0,math.cos(tiltLoop)));minor=Vector((math.cos(tiltLoop),0,-math.sin(tiltLoop)))
    centreLoop=Vector((0,.034,settings['latchLoopCentreOffsetZM']));around=48 if quality=='High'else 24;cross=12 if quality=='High'else 8;vertices=[];normals=[]
    for i in range(around):
        a=2*math.pi*i/around;point=centreLoop+major*(settings['latchLoopMajorRadiusM']*math.cos(a))+minor*(settings['latchLoopMinorRadiusM']*math.sin(a))
        tangent=(-major*settings['latchLoopMajorRadiusM']*math.sin(a)+minor*settings['latchLoopMinorRadiusM']*math.cos(a)).normalized();radial=Vector((tangent.z,0,-tangent.x))
        for j in range(cross):
            b=2*math.pi*j/cross;normal=radial*math.cos(b)+Vector((0,1,0))*math.sin(b);vertices.append(tuple(point+normal*settings['latchLoopTubeRadiusM']));normals.append(tuple(normal))
    faces=[(i*cross+j,i*cross+(j+1)%cross,((i+1)%around)*cross+(j+1)%cross,((i+1)%around)*cross+j)for i in range(around)for j in range(cross)]
    loop=Mesh('BowLatchOvalHandle',vertices,faces,armor,latch,smooth=True);loop.data.normals_split_custom_set_from_vertices(normals)
    catch=Node('Node_BowDoorCatch',parent=front,visibleCatch='Separate three-head frame strip; hidden attachment depth inferred')
    x,y,z=settings['latchPositionM'];PolygonPrism('BowDoorFixedCatch',RoundedRectangle(.027,.087,.005,4 if quality=='High'else 2),'Y',.007,(x+.061,.0185,z-.005),armor,catch,.0006 if quality=='High'else 0)
    for dz in [-.035,0,.035]:Rivet((x+.064,.0223,z-.005+dz),(0,1,0),catch,.0035)
    hatch['visibleHingeGroups']=3;hatch['frontDoorMetricCertified']=False
    return hatch
