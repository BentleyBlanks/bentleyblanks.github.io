"""Photo-traced front tensioner study; depths remain reconstruction parameters."""
from mathutils import Vector
from Script_Type89DetailedParts import RefineTensionerRail,RefineTensionerContour
import math


def BuildTensionerFace(quality,owner,centerX,normalSign,prefix,plate,settings,
                      armor,steel,PolygonPrism,Mesh,Tube,Box,Lathe,HexBolt,Rivet,RivetLine,CasePoint):
    def FaceX(offset=0):return centerX+normalSign*offset
    # The old fixed-assembly join used its first collar as the coordinate
    # basis. Retain that zero-geometry basis while the cylinder is refitted.
    anchor=Mesh('AuthoringFrontTensionerJoinBasis',[],[],armor,owner)
    anchor.location=(FaceX(),1.565,.85)
    centerX-=normalSign*(settings.get('legacyPlateCenterAbsX',1.044)-settings['frontPlateCenterAbsX'])
    if settings.get('outlineYZ'):
        plate=RefineTensionerContour(settings['outlineYZ'],settings['outlineRoundingM'],4 if quality=='High'else 1)
    PolygonPrism(prefix+'TensionerHousing',plate,'X',settings['plateThicknessM'],(FaceX(),0,0),armor,owner,.004)
    if settings.get('upperPatchOutlineYZ'):
        PolygonPrism(prefix+'TensionerUpperLap',settings['upperPatchOutlineYZ'],'X',settings['upperPatchThicknessM'],(FaceX(.020),0,0),armor,owner,.0008)
    # Pair independently traced band edges, retaining their varying width and
    # the actual nonuniform fastening stations rather than a regular pattern.
    steps=6 if quality=='High'else 4
    outer=RefineTensionerRail(settings['stripOuterYZ'],steps)
    inner=RefineTensionerRail(settings['stripInnerYZ'],steps)
    assert len(outer)==len(inner)
    vertices=[]
    for a,b in zip(outer,inner):
        for depth in [settings['stripBackOffsetM'],settings['stripFrontOffsetM']]:
            vertices.extend([(FaceX(depth),*a),(FaceX(depth),*b)])
    faces=[]
    for i in range(len(outer)-1):
        a=i*4;b=a+4
        faces.extend([(a,a+1,b+1,b),(a+2,b+2,b+3,a+3),(a,b,b+2,a+2),(a+1,a+3,b+3,b+1)])
    faces.extend([(0,2,3,1),tuple(range(len(vertices)-4,len(vertices)))])
    strip=Mesh(prefix+'IdlerStampedFlange',vertices,faces,armor,owner,.001)
    strip['ReconstructionRevision']=settings['revision']
    for y,z in settings['stripHeadsYZ']:Rivet((FaceX(.028),y,z),(normalSign,0,0),owner,.008)
    for y,z in settings['lowerHeadsYZ']:Rivet((FaceX(.019),y,z),(normalSign,0,0),owner,.008)
    for y,z in settings.get('lowerJoinFixedHeadsYZ',[]):Rivet((FaceX(.019),y,z),(normalSign,0,0),owner,.006)
    # The visible upper and seam crowns are independent photo stations.
    for y,z in settings['upperHousingHeadsYZ']+settings['seamHeadsYZ']:Rivet((FaceX(.019),y,z),(normalSign,0,0),owner,.010)
    cylinder=settings['cylinder'];offsets=cylinder.get('axisOutwardOffsetsM',[0,0]);front=Vector((FaceX(offsets[0]),*cylinder['axisYZ'][0]));rear=Vector((FaceX(offsets[1]),*cylinder['axisYZ'][1]));axis=(front-rear).normalized()
    Tube(prefix+'TensionerGreaseCylinder',rear,front,cylinder['radiusM'],armor,owner,20)
    def AxisZ(y):return rear.z+(y-rear.y)*(front.z-rear.z)/(front.y-rear.y)
    clamp=settings['clamp'];assert clamp['headsPerRail']==len(clamp['topYZ'])==len(clamp['bottomYZ'])==5
    for points,offset in [(clamp['topYZ'],clamp['upperOffsetM']),(clamp['bottomYZ'],clamp['lowerOffsetM'])]:
        a,b=clamp['railEndpointsY'];center=(a+b)/2
        rail=Box(prefix+'TensionerClampRail',(FaceX(.009),center,AxisZ(center)+offset),(.025,(b-a)/(axis.y),.034),armor,owner,.002)
        rail.rotation_euler.x=math.atan2(axis.z,axis.y)
        for y,z in points:HexBolt((FaceX(.026),y,z),(normalSign,0,0),owner,clamp['headRadiusM'],clamp['headDepthM'])
    for point in [rear-axis*.005,front+axis*.004]:
        collar=Lathe(prefix+'GreaseCylinderEndCollar',[(.044,-.007),(.049,0),(.049,.010),(.040,.018)],point,armor,owner,'Z',24 if quality=='High'else 16)
        collar.rotation_mode='QUATERNION';collar.rotation_quaternion=axis.to_track_quat('Z','Y')
    HexBolt(front+axis*.026,axis,owner,.019,.023)
    Tube(prefix+'GreaseCylinderLockWire',front+axis*.018+Vector((normalSign*.023,0,-.016)),front-axis*.006+Vector((normalSign*.031,0,.020)),.003,steel,owner,8)
