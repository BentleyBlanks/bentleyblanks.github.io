"""Explicit circular wheel sections and closed running path for body trials.

Axial width, tooth count and clearances remain declared reconstruction inputs.
The two shoulder planes are constrained; they do not survey the wheel gauge.
"""
import math
from mathutils import Vector


def RoundedPolygon(points, radius):
    result=[]
    for index,point in enumerate(points):
        a=Vector(points[index-1]);b=Vector(point);c=Vector(points[(index+1)%len(points)])
        u=(a-b).normalized();v=(c-b).normalized();angle=math.acos(max(-1,min(1,u.dot(v))))
        trim=min(radius/math.tan(angle/2),(a-b).length*.4,(c-b).length*.4)
        actualRadius=trim*math.tan(angle/2)
        centre=b+(u+v).normalized()*(actualRadius/math.sin(angle/2))
        start=b+u*trim;end=b+v*trim
        startAngle=math.atan2(start.y-centre.y,start.x-centre.x)
        endAngle=math.atan2(end.y-centre.y,end.x-centre.x)
        while endAngle<startAngle:endAngle+=math.tau
        for step in range(7):
            theta=startAngle+(endAngle-startAngle)*step/6
            result.append((centre.x+actualRadius*math.cos(theta),centre.y+actualRadius*math.sin(theta)))
    return result


def BuildDriveWeb(name, pivot, api, layout):
    radius=layout['driveMetalRadiusM'];spec=layout['driveWeb']
    web=api['Cylinder'](name+'_CastWeb',(0,0,0),radius-.010,spec['depthM'],axis='X',parent=pivot,vertices=96)
    inner=radius*spec['holeInnerRadiusRatio'];outer=radius*spec['holeOuterRadiusRatio']
    wi=radius*spec['holeInnerWidthRatio'];wo=radius*spec['holeOuterWidthRatio']
    outline=RoundedPolygon([(inner,-wi/2),(outer,-wo/2),(outer,wo/2),(inner,wi/2)],spec['holeCornerRadiusM'])
    for index in range(8):
        angle=(index+.5)*math.tau/8;radial=Vector((math.cos(angle),math.sin(angle)));tangent=Vector((-radial.y,radial.x));points=[]
        for x in [-.08,.08]:
            for r,t in outline:
                p=radial*r+tangent*t;points.append((x,p.x,p.y))
        count=len(outline);faces=[tuple(reversed(range(count))),tuple(range(count,count*2))]
        faces += [(i,(i+1)%count,(i+1)%count+count,i+count)for i in range(count)]
        cutter=api['Mesh']('TemporaryDriveWebWindow',points,faces,'Dark',pivot)
        api['CutWith'](web,cutter)
    pivot['DriveWebApertureCount']=8
    pivot['DriveWebSectionInferred']=True
    pivot['DriveWebReference']='Kubinka official photos2and7: broad cast web with eight compact outer windows'
    return web


def BuildAssembly(api, layout):
    wheel, cylinder, rod, plate = (api[name] for name in ['Wheel', 'Cylinder', 'Rod', 'Plate'])
    hull = api['PARTS']['Hull']
    hull['RunningAssemblyLayout'] = api['lowerLayoutFile']
    hull['RunningGearDimensionsInferred'] = True
    hull['RunningGearWholeReferenceAccepted'] = False
    hull['RoadWheelForwardM'] = [row[0] for row in layout['roadCentersYZM']]
    hull['TyreOuterShoulderPlanesM'] = [-layout['outerShoulderPlaneXM'], layout['outerShoulderPlaneXM']]
    armSpec=layout.get('armChannelSection');armBuilder=None;pivotCoverBuilder=None;armRecords=[]
    if armSpec:
        import importlib.util
        file=api['ROOT']/'Taierzhuang1938/_blender/Script_Type94SuspensionArm.py'
        moduleSpec=importlib.util.spec_from_file_location('Type94SuspensionArm',file)
        module=importlib.util.module_from_spec(moduleSpec);moduleSpec.loader.exec_module(module);armBuilder=module.BuildArm;pivotCoverBuilder=module.BuildPivotCover
    for side, label in [(-1, 'Left'), (1, 'Right')]:
        x = side*layout['trackCenterXM']
        for index, (y, z) in enumerate(layout['roadCentersYZM']):
            pivot = wheel('Wheel_'+label+'_Road'+str(index), (x,y,z), layout['roadTreadRadiusM'], side)
            pivot['TyreShoulderRadiusM'] = layout['roadTreadRadiusM']-.008
            pivot['TyreShoulderHalfWidthM'] = layout['tyreHalfWidthM']
        y,z = layout['driveCenterYZM']
        drive = wheel('Wheel_'+label+'_Drive', (x,y,z), layout['driveMetalRadiusM']+.012, side, 'Drive')
        drive['SprocketTeethInferred'] = True
        y,z = layout['idlerCenterYZM']
        wheel('Wheel_'+label+'_Idler', (x,y,z), layout['idlerRadiusM'], side, 'Idler')
        for index, (y,z) in enumerate(layout['returnCentersYZM']):
            wheel('Wheel_'+label+'_Return'+str(index), (x,y,z), layout['returnRadiusM'], side, 'Return')
        def X(offset):return side*(layout['trackCenterXM']+offset)
        for index, bogie in enumerate(layout['bogies']):
            y,z = bogie['pivotYZM']
            if pivotCoverBuilder and armSpec.get('bogieCoverProfile'):
                pivotCoverBuilder('Suspension_'+label+'_Bellcrank'+str(index),side,layout['trackCenterXM'],(y,z),armSpec['bogieCoverProfile'],api['Lathe'],hull)
            else:
                cylinder('Suspension_'+label+'_Bellcrank'+str(index), (X(.069),y,z), .057,.075,axis='X',vertices=24)
            for roadIndex in bogie['roadIndices']:
                wy,wz = layout['roadCentersYZM'][roadIndex]
                if armBuilder:
                    cylinder('Suspension_'+label+'_WheelJournal',(X(.082),wy,wz),.031,.032,axis='X',vertices=20)
                    record=armBuilder('Suspension_'+label+'_ArmChannel'+str(roadIndex),side,layout['trackCenterXM'],(y,z),(wy,wz),armSpec,api['Mesh'],hull)
                    record.update(label=label,roadIndex=roadIndex,bogieIndex=index);armRecords.append(record)
                else:
                    rod('Suspension_'+label+'_Arm',(X(.076),y,z),(X(.078),wy,wz),.022,segments=12)
                    cylinder('Suspension_'+label+'_WheelJournal',(X(.082),wy,wz),.031,.032,axis='X',vertices=20)
                    direction=Vector((wy-y,wz-z)).normalized();perpendicular=Vector((-direction.y,direction.x))*.025
                    a=Vector((y,z));b=Vector((wy,wz));outline=[a+perpendicular,b+perpendicular,b-perpendicular,a-perpendicular]
                    plate('Suspension_'+label+'_CastArmFace',[(X(.105),p.x,p.y)for p in outline],.017,bevel=.004)
            endY,endZ = bogie['springEndYZM']
            rod('Suspension_'+label+'_UpperCrank',(X(.074),y,z),(X(.070),endY,endZ),.019)
        spring=layout['spring'];a,b=spring['endForwardM'];springZ=spring['heightM']
        cylinder('Suspension_'+label+'_SpringHousing',(X(.070),(a+b)/2,springZ),.043,b-a,axis='Y',vertices=24)
        for y in [a,b]:cylinder('Suspension_'+label+'_SpringCap',(X(.070),y,springZ),.060,.035,axis='Y',vertices=24)
        iy,iz=layout['idlerCenterYZM']
        rod('Suspension_'+label+'_IdlerArm',(X(.066),iy+.18,iz+.07),(X(.066),iy,iz),.019)
        rod('Suspension_'+label+'_TensionScrew',(X(.066),iy+.31,iz+.07),(X(.066),iy+.04,iz+.07),.012,'Steel')
    if armSpec:
        import json
        hull['ArmChannelLayout']=api['lowerLayoutFile'];hull['ArmChannelSectionInferred']=True
        hull['ArmChannelRecessDepthM']=armSpec['recessDepthM'];hull['ArmChannelAxesUnchanged']=True
        hull['ArmChannelRecordsJson']=json.dumps(armRecords,separators=(',',':'))
        if armSpec.get('bogieCoverProfile'):hull['BogieCoverProfileInferred']=True


def TrackHull(drivePitchRadius, layout, convexHull):
    offset=layout['beltCentreOffsetM']
    circles=[(*layout['driveCenterYZM'],drivePitchRadius),(*layout['idlerCenterYZM'],layout['idlerRadiusM']+offset)]
    circles += [(y,z,layout['roadTreadRadiusM']+offset)for y,z in layout['roadCentersYZM']]
    circles += [(y,z,layout['returnRadiusM']+offset)for y,z in layout['returnCentersYZM']]
    points=[(y+r*math.cos(i*math.tau/160),z+r*math.sin(i*math.tau/160))for y,z,r in circles for i in range(160)]
    hull=convexHull(points);dy,dz=layout['driveCenterYZM'];iy,iz=layout['idlerCenterYZM']
    frontTop=(dy,dz+drivePitchRadius);rearTop=(iy,iz+layout['idlerRadiusM']+offset)
    frontIndex=min(range(len(hull)),key=lambda i:math.dist(hull[i],frontTop));rearIndex=min(range(len(hull)),key=lambda i:math.dist(hull[i],rearTop))
    assert frontIndex<rearIndex
    anchors=[frontTop]+[(y,z+layout['returnRadiusM']+offset)for y,z in layout['returnCentersYZM']]+[rearTop]
    guided=[]
    for index,(a,b)in enumerate(zip(anchors,anchors[1:])):
        sag=.012 if index==1 else .003
        for step in range(32):
            t=step/32;blend=t*t*(3-2*t)
            guided.append((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*blend-sag*math.sin(math.pi*t)**2))
    guided.append(rearTop);hull=hull[:frontIndex]+guided+hull[rearIndex+1:]
    distances=[0.]
    for index in range(len(hull)):distances.append(distances[-1]+math.dist(hull[index],hull[(index+1)%len(hull)]))
    return hull,distances


def SolvePath(layout, convexHull):
    target=layout['drivePitchRadiusTargetM'];teeth=layout['sprocketTeeth']
    _,initialDistances=TrackHull(target,layout,convexHull)
    estimate=round(initialDistances[-1]/(math.tau*target/teeth));solutions=[]
    for count in range(estimate-2,estimate+3):
        radius=target
        for iteration in range(80):
            hull,distances=TrackHull(radius,layout,convexHull);corrected=teeth*distances[-1]/count/math.tau;error=abs(corrected-radius)
            if error<1e-10:break
            radius=corrected
        else:raise RuntimeError('Explicit running assembly path did not converge')
        pitch=distances[-1]/count
        solutions.append((abs(corrected-target),count,hull,distances,dict(linkCount=count,pitchM=pitch,drivePitchRadiusM=corrected,radiusResidualM=error,iterations=iteration+1)))
    chosen=min(solutions,key=lambda row:row[0])
    report=dict(method='Lock each integer link count, solve circumference, choose closest declared drive working radius',
        linkCount=chosen[1],lengthM=chosen[3][-1],drivePitchRadiusTargetM=target,candidates=[row[4]for row in solutions],
        historicalPitchEstablished=False,toothCountMeasured=False)
    return chosen[2],chosen[3],report
