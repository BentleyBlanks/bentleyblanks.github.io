"""Closed recessed suspension-arm skin; visible contour, inferred sections.

The journal and bogie axes are inputs and are never moved. The old overlapping
rod/flat plate proxies are replaced by one closed channel. Manufacturing method,
unseen back gauge, flange width and recess depth are reconstruction inputs.
"""
import math
from mathutils import Vector


def Capsule(start, end, radius, steps):
    points=[]
    for centre,first in [(end,math.pi/2),(start,-math.pi/2)]:
        for i in range(steps+1):
            angle=first-i*math.pi/steps
            points.append((centre+radius*math.cos(angle),radius*math.sin(angle)))
    return points


def BuildPivotCover(name, side, trackCenter, centreYZ, spec, latheFactory, parent):
    radius=spec['radiusM'];back=spec['backOffsetM'];rim=spec['rimOffsetM'];crown=spec['crownOffsetM'];steps=spec['radialSteps']
    assert back<rim<crown
    profile=[(0,side*back),(radius,side*back),(radius,side*rim)]
    for i in range(1,steps+1):
        fraction=1-i/steps;profile.append((radius*fraction,side*(rim+(crown-rim)*(1-fraction*fraction))))
    obj=latheFactory(name,profile,(side*trackCenter,*centreYZ),axis='X',parent=parent,segments=spec['angularSegments'])
    for polygon in obj.data.polygons[:spec['angularSegments']]:polygon.use_smooth=False
    return obj


def BuildArm(name, side, trackCenter, startYZ, endYZ, spec, meshFactory, parent):
    start=Vector(startYZ);end=Vector(endYZ);direction=(end-start).normalized();cross=Vector((-direction.y,direction.x));length=(end-start).length
    radius=spec['halfWidthM'];rim=spec['rimWidthM'];inset=spec['channelEndInsetM'];steps=spec['endSegments']
    assert length>2*inset and 0<rim<radius and 0<spec['recessDepthM']<spec['thicknessM']
    outer=Capsule(0,length,radius,steps);inner=Capsule(inset,length-inset,radius-rim,steps);count=len(outer)
    centre=trackCenter+spec['axialCenterOffsetM'];back=centre-spec['thicknessM']/2;front=centre+spec['thicknessM']/2;floor=front-spec['recessDepthM'];points=[]
    for x,loop in [(back,outer),(front,outer),(front,inner),(floor,inner)]:
        for u,v in loop:
            p=start+direction*u+cross*v;points.append((side*x,p.x,p.y))
    faces=[tuple(reversed(range(count))),tuple(range(3*count,4*count))]
    for i in range(count):
        j=(i+1)%count
        faces.extend([(i,j,j+count,i+count),(i+count,j+count,j+2*count,i+2*count),(i+2*count,j+2*count,j+3*count,i+3*count)])
    if side>0:faces=[tuple(reversed(face))for face in faces]
    obj=meshFactory(name,points,faces,'Paint',parent,spec['edgeBevelM'])
    for index,face in enumerate(obj.data.polygons):
        # The web and flange faces remain flat; only the curved side walls
        # share smooth shading. The edge radius is real geometry.
        face.use_smooth=index>=2 and (index-2)%3 in [0,2]
    middle=(start+end)/2
    return dict(side=side,startYZ=list(start),endYZ=list(end),lengthM=length,
        frontXM=side*front,backXM=side*back,floorXM=side*floor,
        floorProbeBeforeGroundM=[side*floor,middle.x,middle.y],
        upperRimProbeBeforeGroundM=[side*front,*(middle+cross*(radius-rim/2))],
        lowerRimProbeBeforeGroundM=[side*front,*(middle-cross*(radius-rim/2))])
