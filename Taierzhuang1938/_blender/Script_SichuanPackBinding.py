"""One routed cloth strip: two cross passes, two upright passes and shoulders."""
import math
import bpy
from mathutils import Vector


def BuildBinding(CreateMesh,MakeRoot,AddTube,AddRibbon,SurfaceDepth,materials,parent,softCloth=False,refined=False,sideSurfaceDepth=None,pointMapper=None,highDensity=False):
    root=MakeRoot('Pack_Binding',parent)
    controls=[]

    def Points(points,axis,shoulder=False):
        for point in points:
            point=Vector(point)
            if refined and point.x>.193 and abs(point.y+.064)<1e-7:point.y+=.039
            direction=Vector(axis)
            if pointMapper is not None:
                direction=(pointMapper(point+direction*.001)-pointMapper(point-direction*.001)).normalized()
                point=pointMapper(point)
            controls.append((point,direction,shoulder))

    # The first complete turn is the upper cross pass. Transfers follow the
    # undersides of existing cloth passes, outside the blanket itself.
    Points([(.194,-.064,.050),(.194,-.111,.050),(.174,-.130,.050),
            (-.174,-.130,.050),(-.194,-.111,.050),(-.194,-.018,.050),
            (-.180,.003,.050),(.180,.003,.050),(.194,-.018,.050),
            (.194,-.064,.050)],(0,0,1))
    Points([(.194,-.018,.050),(.180,.0012,.050),(.089,.0012,.050)],(0,0,1))
    Points([(.089,.0012,.132)],(1,0,0))

    for side,x in ((1,.089),(-1,-.103)):
        Points([(x,.002,.133),(x,-.017,.149),(x,-.099,.149),
                (x,-.123,.132),(x,-.128,.105),(x,-.128,-.105),
                (x,-.118,-.137),(x,-.092,-.151),(x,-.022,-.151),
                (x,.003,-.135)],(1,0,0))
        # The free loops sweep laterally toward the hips. Their ribbon width
        # follows a transported frame through the rounded heel of each loop.
        Points([(x+side*.009,.024,-.141),(x+side*.039,.060,-.133),
                (x+side*.045,.088,-.091),(x+side*.035,.099,-.019),
                (x+side*.020,.082,.062),(x+side*.004,.039,.121),
                (x,.003,.135)],(1,0,0),True)
        if side==1:
            Points([(x,-.020,.150),(x,-.067,.150)],(1,0,0))
            Points([(-.103,-.067,.150)],(0,1,0))
            Points([(-.103,-.020,.150)],(1,0,0))

    Points([(-.103,.0012,.124),(-.125,.0012,.050),(-.148,.0012,-.060)],(1,0,0))
    Points([(-.180,.003,-.060)],(0,0,1))
    Points([(.180,.003,-.060),(.194,-.018,-.060),(.194,-.111,-.060),
            (.174,-.130,-.060),(-.174,-.130,-.060),(-.194,-.111,-.060),
            (-.194,-.018,-.060),(-.180,.003,-.060)],(0,0,1))
    Points([(-.174,.0012,-.060),(.130,.0012,-.060)],(0,0,1))
    Points([(.110,.0012,.050)],(1,0,0))
    Points([(.180,.0012,.050),(.194,-.018,.050),(.194,-.064,.050)],(0,0,1))

    # Quadratic corner rounding gives bounded curvature without Catmull-Rom
    # overshoot at the contact plane and shoulder attachments.
    rounded=[]
    for index,(point,axis,shoulder) in enumerate(controls):
        if index in (0,len(controls)-1):
            rounded.append((point,axis,shoulder));continue
        previous,nextPoint=controls[index-1][0],controls[index+1][0]
        a=(point-previous).length;b=(nextPoint-point).length
        distance=min(.027,a*.40,b*.40) if shoulder else min(.012,a*.24,b*.24)
        start=point+(previous-point).normalized()*distance
        end=point+(nextPoint-point).normalized()*distance
        rounded.append((start,axis,shoulder))
        steps=(1,2,3) if refined and shoulder else (1,2) if refined else (2,)
        for step in steps:
            t=step/(3 if refined and shoulder else 2)
            p=(1-t)**2*start+2*(1-t)*t*point+t*t*end
            rounded.append((p,axis,shoulder))

    samples=[rounded[0]];distances=[0.0];distance=0;repeat=.18
    for (start,startAxis,s1),(end,endAxis,s2) in zip(rounded,rounded[1:]):
        length=(end-start).length
        if length<1e-8:continue
        spacing=.008 if highDensity else .040 if refined else .050
        fractions={step/max(1,math.ceil(length/spacing)) for step in range(1,max(1,math.ceil(length/spacing))+1)}
        seam=(math.floor(distance/repeat)+1)*repeat
        while seam<distance+length-1e-7:
            fractions.add((seam-distance)/length);seam+=repeat
        for t in sorted(fractions):
            samples.append((start.lerp(end,t),startAxis.lerp(endAxis,t).normalized(),s1 or s2));distances.append(distance+length*t)
        distance+=length

    verts=[];faces=[];uvs=[];rings=[];vertexDistances=[];vertexU=[]
    previousWidth=None
    for index,(point,axis,shoulder) in enumerate(samples):
        tangent=(samples[min(index+1,len(samples)-1)][0]-samples[max(0,index-1)][0]).normalized()
        width=axis-tangent*axis.dot(tangent)
        transported=None if previousWidth is None else previousWidth-tangent*previousWidth.dot(tangent)
        if width.length<.08:width=transported if transported is not None and transported.length>.08 else tangent.cross(Vector((0,1,0)))
        width.normalize()
        if transported is not None and width.dot(transported)<0:width.negate()
        if shoulder:
            normal=tangent.cross(width).normalized()
            twist=(.40 if softCloth else .28)*min(1,max(0,point.y/.055))
            width=width*math.cos(twist)+normal*math.sin(twist)
        previousWidth=width.copy()
        frontDepthLimit=-.095 if refined else -.105
        frontHeightLimit=.1505 if refined else .140
        isFront=point.y<frontDepthLimit and abs(point.x)<.179 and abs(point.z)<frontHeightLimit
        if isFront:
            depth=min(SurfaceDepth(point.x+width.x*a*.013,point.z+width.z*a*.013,.0017) for a in (-1,0,1))
            # Upright passes lie over the cross passes at four intersections.
            if abs(width.x)>.7:depth-=.0017*sum(math.exp(-((point.z-band)/.019)**2) for band in (.05,-.06))
            point=Vector((point.x,depth,point.z))
        ring=[]
        crossValues=(-1,-2/3,-1/3,0,1/3,2/3,1) if highDensity else (-1,0,1) if isFront else (-1,1)
        for across in crossValues:
            variation=1+.055*math.sin(distances[index]*43+.4)+.020*math.sin(distances[index]*127+across) if softCloth else 1+.012*math.sin(index*1.43+across)
            p=point+width*(.013*across)*variation
            if isFront:p.y-=.00065*(1-across*across)
            if isFront and softCloth:
                crossing=.0017*sum(math.exp(-((point.z-band)/.019)**2) for band in (.05,-.06)) if abs(width.x)>.7 else 0
                p.y=SurfaceDepth(p.x,p.z,.0015)-crossing-.00025*(1-across*across)
            if refined and sideSurfaceDepth is not None and abs(p.x)>(.150 if pointMapper is not None else .180) and -.122<p.y<-.001 and abs(p.z)<(.153 if pointMapper is not None else .143):
                p.x=sideSurfaceDepth(1 if p.x>0 else -1,p.y,p.z)
            ring.append(len(verts));verts.append(tuple(p));u=.42+.16*(across+1)/2
            uvs.append((u,(distances[index]/repeat)%1));vertexDistances.append(distances[index]);vertexU.append(u)
        rings.append(ring)
    for a,b in zip(rings,rings[1:]):
        if highDensity:
            for column in range(len(a)-1):faces.append((a[column],a[column+1],b[column+1],b[column]))
        elif len(a)==len(b)==2:faces.append((a[0],a[1],b[1],b[0]))
        elif len(a)==len(b)==3:faces.extend(((a[0],a[1],b[1],b[0]),(a[1],a[2],b[2],b[1])))
        elif len(a)==2:faces.extend(((a[0],a[1],b[1],b[0]),(a[1],b[2],b[1])))
        else:faces.extend(((a[0],a[1],b[0]),(a[1],a[2],b[1],b[0])))
    if softCloth:
        # Keep the entire ribbon face outside the low-poly cloth, including
        # its interior: fitting vertices alone lets long triangles cut in.
        positions=[Vector(point) for point in verts]
        weights=((1/3,1/3,1/3),(.5,.5,0),(.5,0,.5),(0,.5,.5))
        for iteration in range(3):
            for face in faces:
                if not all(positions[index].y<(-.095 if refined else -.105) and abs(positions[index].x)<.179 and abs(positions[index].z)<(.1505 if refined else .140) for index in face):continue
                triangles=((face[0],face[1],face[2]),) if len(face)==3 else ((face[0],face[1],face[2]),(face[0],face[2],face[3]),(face[0],face[1],face[3]),(face[1],face[2],face[3]))
                push=0
                for triangle in triangles:
                    for barycentric in weights:
                        point=sum((positions[index]*weight for index,weight in zip(triangle,barycentric)),Vector())
                        push=max(push,point.y-SurfaceDepth(point.x,point.z,.0013))
                if push>0:
                    for index in face:positions[index].y-=push+.0001
        verts=[tuple(point) for point in positions]
    strip=CreateMesh('Pack_ContinuousClothStrap',verts,faces,uvs,materials['binding'],root)
    for polygon in strip.data.polygons:
        tile=math.floor((min(vertexDistances[strip.data.loops[i].vertex_index] for i in polygon.loop_indices)+1e-7)/repeat)
        for loopIndex in polygon.loop_indices:
            index=strip.data.loops[loopIndex].vertex_index
            strip.data.uv_layers.active.data[loopIndex].uv=(.02+.46*vertexU[index],.02+.46*max(0,min(1,vertexDistances[index]/repeat-tile)))
    strip['ContinuousStrip']=True;strip['OuterGridPasses']=[2,2];strip['ShoulderLoops']=2
    if refined:
        bpy.ops.object.select_all(action='DESELECT');strip.select_set(True);bpy.context.view_layer.objects.active=strip
        solid=strip.modifiers.new('RealCottonTapeThickness','SOLIDIFY');solid.thickness=.0009;solid.offset=-.35;solid.use_even_offset=False
        bpy.ops.object.modifier_apply(modifier=solid.name)
        strip.data.set_sharp_from_angle(angle=math.radians(45))
    if softCloth:
        def KnotRibbon(name,points,widths):
            if 'Loop' in name:
                smooth=[];smoothWidths=[]
                for index in range(len(points)-1):
                    p0=Vector(points[max(0,index-1)]);p1=Vector(points[index]);p2=Vector(points[index+1]);p3=Vector(points[min(len(points)-1,index+2)])
                    for t in ((0,.25,.5,.75) if refined else (0,.5)):
                        smooth.append(tuple(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)))
                        smoothWidths.append(widths[index]*(1-t)+widths[index+1]*t)
                points=smooth+[points[-1]];widths=smoothWidths+[widths[-1]]
            positions=[];coordinates=[];polygons=[]
            for index,point in enumerate(points):
                tangent=(Vector(points[min(index+1,len(points)-1)])-Vector(points[max(0,index-1)])).normalized()
                across=Vector((0,-tangent.z,tangent.y)).normalized()
                if refined:
                    twist=.65*math.sin(index/max(1,len(points)-1)*math.tau+.6)
                    across=across*math.cos(twist)+Vector((1,0,0))*math.sin(twist)
                for side in (-1,0,1):
                    p=Vector(point)+across*(widths[index]*.5*side);p.x+=.0012*(1-side*side)
                    if refined:
                        p.x-=.008
                        p.y=-.025+(p.y+.064)*.55
                        if 'Tail' not in name:p.z=.050+(p.z-.050)*.70
                        else:p.z=.050+(p.z-.050)*.78
                    if pointMapper is not None:p=pointMapper(p)
                    positions.append(tuple(p));coordinates.append(((side+1)/2,index/(len(points)-1)))
            for index in range(len(points)-1):
                for cross in range(2):
                    a=index*3+cross;polygons.append((a,a+1,a+4,a+3))
            cloth=CreateMesh(name,positions,polygons,coordinates,materials['binding'],root)
            for polygon in cloth.data.polygons:
                if polygon.normal.x<0:polygon.flip()
            cloth.data.update()
            if refined:
                bpy.ops.object.select_all(action='DESELECT');cloth.select_set(True);bpy.context.view_layer.objects.active=cloth
                solid=cloth.modifiers.new('CottonKnotThickness','SOLIDIFY');solid.thickness=.0012;solid.offset=0;solid.use_even_offset=False
                bpy.ops.object.modifier_apply(modifier=solid.name)
                cloth.data.set_sharp_from_angle(angle=math.radians(45))
        KnotRibbon('Pack_SoftKnotOver',[(.198,-.044,.058),(.204,-.054,.054),(.209,-.065,.049),(.204,-.076,.046),(.198,-.084,.051)],[.019,.015,.010,.014,.018])
        KnotRibbon('Pack_SoftKnotUnder',[(.198,-.048,.041),(.201,-.055,.048),(.204,-.064,.056),(.201,-.073,.059),(.198,-.079,.055)],[.014,.012,.009,.012,.016])
        KnotRibbon('Pack_SoftKnotLoopLeft',[(.203,-.064,.052),(.207,-.048,.073),(.204,-.035,.066),(.199,-.043,.040),(.203,-.062,.049)],[.008,.010,.012,.010,.008])
        KnotRibbon('Pack_SoftKnotLoopRight',[(.204,-.066,.051),(.208,-.083,.069),(.204,-.096,.057),(.199,-.082,.033),(.204,-.067,.049)],[.008,.010,.012,.010,.008])
        KnotRibbon('Pack_SoftKnotTail',[(.202,-.062,.047),(.206,-.066,.024),(.202,-.073,.002),(.196,-.068,-.015)],[.014,.017,.019,.020])
        return root
    AddTube('Pack_SideClothKnot',[(.195,-.049,.05),(.199,-.061,.058),(.199,-.079,.052),(.197,-.065,.042),(.195,-.049,.05)],.0043,materials['binding'],root,sides=4)
    for sign in (-1,1):
        AddRibbon('Pack_SideKnotLoop%d'%sign,[(.199,-.064,.05),(.200,-.064+sign*.013,.060),(.200,-.064+sign*.021,.047),(.199,-.064,.05)],.010,materials['binding'],root,axis='z')
    AddRibbon('Pack_SideKnotTail',[(.199,-.066,.05),(.201,-.071,.022),(.202,-.078,.004)],.017,materials['binding'],root,axis='y')
    return root
