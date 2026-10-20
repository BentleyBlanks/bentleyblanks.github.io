"""V6 cloth study: thin folded fabric, hand-shaped creases and dense fold ends."""
import math
import bpy
import bmesh
from mathutils import Vector

reliefPixels=None

def ConfigureEndRelief(path):
    global reliefPixels
    image=bpy.data.images.load(str(path),check_existing=False);image.colorspace_settings.name='Non-Color'
    reliefPixels=(int(image.size[0]),int(image.size[1]),list(image.pixels))


def EndRelief(y,z):
    if reliefPixels is None:return 0
    width,height,pixels=reliefPixels
    u=max(0,min(width-1,(y+.13)/.13*(width-1)));v=max(0,min(height-1,(z+.15)/.30*(height-1)))
    x0=int(u);y0=int(v);x1=min(width-1,x0+1);y1=min(height-1,y0+1);tx=u-x0;ty=v-y0
    value=(pixels[(y0*width+x0)*4]*(1-tx)+pixels[(y0*width+x1)*4]*tx)*(1-ty)
    value+=(pixels[(y1*width+x0)*4]*(1-tx)+pixels[(y1*width+x1)*4]*tx)*ty
    return (value-.5)*.0016


def SoftFrontDepth(x,z,detail=0):
    edge=max(abs(x)/.19,abs(z)/.15)
    roll=.011*max(0,(edge-.72)/.28)**1.65
    pressure=sum(math.exp(-((x-band)/.017)**2) for band in (-.103,.089))
    pressure+=sum(math.exp(-((z-band)/.017)**2) for band in (.05,-.06))
    depth=-.126+roll+.0038*min(1.65,pressure)
    depth+=.0010*math.sin(x*33+z*14)*math.cos(z*29-.4)
    if detail:
        wrinkles=0
        paths=((- .188,.136,-.119,.066),(-.187,.113,-.153,.067),(-.188,.006,-.117,.035),(-.183,-.015,-.142,.027),(-.188,-.132,-.116,-.077),(-.163,-.142,-.119,-.092),(.184,.018,.111,.047),(.183,-.006,.143,.030),(.184,-.132,.113,-.078),(.149,-.145,.109,-.097),(-.071,.144,-.024,.087),(-.047,.146,-.005,.105),(.012,-.144,.067,-.084),(.044,-.144,.077,-.108),(.172,.135,.139,.082),(-.186,-.092,-.154,-.102),(.182,-.092,.155,-.104))
        for index,(a,b,c,d) in enumerate(paths):
            start=Vector((a,b));end=Vector((c,d));point=Vector((x,z));delta=end-start
            t=max(0,min(1,(point-start).dot(delta)/delta.length_squared))
            across=Vector((-delta.y,delta.x)).normalized()
            signed=(point-start-delta*t).dot(across)
            signed-=.0023*math.sin(t*math.pi*1.7+index*.8)*math.sin(math.pi*t)
            width=.0011+.0017*math.sin(math.pi*t)
            fade=math.sin(math.pi*t)**.7
            ridge=math.exp(-(signed/width)**2)
            trough=.55*math.exp(-((signed-width*1.9)/(width*1.5))**2)
            wrinkles+=(.0020+.0007*math.sin(index*2.1))*fade*(ridge-trough)
        depth-=wrinkles
    # The civilian coat is tucked behind a turned upper corner.
    depth+=.011*max(0,min(1,(x-.095)/.065))*max(0,min(1,(z-.075)/.065))
    return max(-.130,depth)


def BuildSoftBundle(CreateMesh,unusedDepth,clothMaterial,backMaterial,foldMaterial,parent,high=False):
    if not high:
        source=BuildSoftBundle(CreateMesh,unusedDepth,clothMaterial,backMaterial,foldMaterial,parent,True)
        source.name='Study_SoftBundleHigh';source.parent=None
        source['SichuanHighSource']=True
        low=source.copy();low.data=source.data.copy();low.name='Pack_Bundle';low.parent=parent
        low['SichuanHighSource']=False;bpy.context.scene.collection.objects.link(low)
        low.data.calc_loop_triangles();initial=len(low.data.loop_triangles)
        bpy.ops.object.select_all(action='DESELECT');low.select_set(True);bpy.context.view_layer.objects.active=low
        decimate=low.modifiers.new('VisibleClothRetopology','DECIMATE');decimate.ratio=4500/initial;decimate.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=decimate.name)
        # Quadric reduction can move the originally planar contact leaf a few
        # micrometres and overshoot a soft silhouette. Preserve the authored
        # attachment plane and physical envelope explicitly before normals.
        for vertex in low.data.vertices:
            vertex.co.x=max(-.1898,min(.1898,vertex.co.x))
            vertex.co.z=max(-.1498,min(.1498,vertex.co.z))
            vertex.co.y=0 if vertex.co.y>-.0015 else max(-.1290,vertex.co.y)
        low.data.update()
        transfer=low.modifiers.new('SculptedClothNormals','DATA_TRANSFER');transfer.object=source
        transfer.use_loop_data=True;transfer.data_types_loops={'CUSTOM_NORMAL'};transfer.loop_mapping='POLYINTERP_NEAREST'
        bpy.ops.object.modifier_apply(modifier=transfer.name)
        # Large contact-plane triangles must not interpolate a corner normal
        # from an adjacent turned fold. Their entire surface is exactly flat.
        normals=[tuple(corner.vector) for corner in low.data.corner_normals]
        for polygon in low.data.polygons:
            if all(abs(low.data.vertices[index].co.y)<1e-9 for index in polygon.vertices):
                polygon.use_smooth=False;polygon.material_index=1
                for index in polygon.loop_indices:
                    normals[index]=(0,1,0)
                    point=low.data.vertices[low.data.loops[index].vertex_index].co
                    low.data.uv_layers.active.data[index].uv=(.02+.46*(point.x+.19)/.38,.52+.46*(point.z+.15)/.30)
        low.data.normals_split_custom_set(normals)
        source.hide_render=True;source.hide_set(True)
        low['HighSource']=source.name
        return low
    nx,nz=(80,64) if high else (24,20)
    verts=[];uvs=[];faces=[];roles=[]
    def FrontPoint(s,t):
        z=.1498*t
        radius=.028
        q=max(0,(abs(z)-(.1498-radius))/radius)
        halfWidth=.1898-radius*(1-math.sqrt(max(0,1-q*q)))
        x=s*halfWidth
        edgePressure=sum(math.exp(-((x-band)/.020)**2) for band in (-.103,.089))
        z-=math.copysign(.0015*edgePressure*abs(t)**12,z)
        return (x,SoftFrontDepth(x,z,1 if high else 0),z)
    for row in range(nz+1):
        for column in range(nx+1):
            x,y,z=FrontPoint(column/nx*2-1,row/nz*2-1)
            verts.append((x,y,z));uvs.append(((x+.19)/.38,(z+.15)/.30))
    for row in range(nz):
        for column in range(nx):
            a=row*(nx+1)+column;faces.append((a,a+1,a+nx+2,a+nx+1));roles.append('front')
    perimeter=list(range(nx+1))+[row*(nx+1)+nx for row in range(1,nz+1)]
    perimeter+=[nz*(nx+1)+column for column in range(nx-1,-1,-1)]
    perimeter+=[row*(nx+1) for row in range(nz-1,0,-1)]
    previous=perimeter
    depths=(-.103,-.065,-.020,0) if not high else tuple(-.108+index*.108/32 for index in range(33))
    for depth in depths:
        current=[]
        for vertex in perimeter:
            x,frontY,z=verts[vertex]
            fraction=max(0,min(1,-depth/.13))
            # Front/back edges turn in; the side cut is recessed for the
            # folded cloth lips, which carry the final width silhouette.
            side=abs(x)/.1898
            cutEnd=max(0,min(1,(depth+.100)/.045))
            frontTurn=max(0,min(1,(depth+.110)/.032))
            contactTurn=max(0,min(1,-depth/.007))
            inset=.0158*side**5*frontTurn*contactTurn
            x-=math.copysign(inset,x)
            sideWrinkle=(.0017*math.sin(z*81+depth*97)+.0009*math.sin(z*173-depth*113))
            sideWrinkle*=math.sin(math.pi*fraction)*side**8
            sideWrinkle+=EndRelief(depth,z)*math.sin(math.pi*fraction)*side**8
            x=math.copysign(min(.1898,abs(x)+sideWrinkle),x)
            z-=math.copysign(.0010*math.sin(math.pi*fraction)*(abs(z)/.15)**5,z)
            current.append(len(verts));verts.append((x,depth,z));uvs.append(((x+.19)/.38,(z+.15)/.30))
        for index in range(len(perimeter)):
            following=(index+1)%len(perimeter)
            faces.append((previous[index],current[index],current[following],previous[following]));roles.append('fold')
        previous=current
    backCenter=len(verts);verts.append((0,0,0));uvs.append((.5,.5))
    for index in range(len(previous)):
        faces.append((backCenter,previous[(index+1)%len(previous)],previous[index]));roles.append('back')

    # Digitized centre lines from the approved right-end crop (193 x 501).
    # Screen X is physical front-to-back depth; screen Y is blanket height.
    foldStartVertex=len(verts)
    endContours=[
        [(92,16),(86,26),(81,46),(80,82),(84,138),(88,190),(82,248),(79,310),(84,350),(90,410),(91,455),(110,479),(131,477),(148,490),(164,473),(169,449),(165,386),(168,335),(168,255),(173,198),(170,148),(174,90),(171,45),(163,24),(150,15),(130,12),(110,17),(92,16)],
        [(116,30),(108,52),(110,103),(111,140),(115,180),(107,215),(114,277),(111,330),(109,376),(118,430),(116,463),(127,478),(137,470),(145,448),(143,408),(146,363),(145,308),(152,259),(153,216),(148,169),(146,120),(143,73),(140,45),(129,34),(116,30)]
    ]
    # Two nested returns at the top, two adjacent returns at the bottom:
    # this is one folded-sheet boundary rather than two closed nested rings.
    outline=[(92,16),(110,17),(130,12),(150,15),(163,24),(171,45),(174,90),(170,148),(173,198),(168,255),(168,335),(165,386),(169,449),(164,473),(153,492),(142,485),(137,470),(145,448),(143,408),(146,363),(145,308),(152,259),(153,216),(148,169),(146,120),(143,73),(140,45),(129,38),(116,36),(108,56),(110,103),(111,140),(115,180),(107,215),(114,277),(111,330),(109,376),(118,430),(116,463),(109,488),(98,493),(91,481),(91,455),(90,410),(84,350),(79,310),(82,248),(88,190),(84,138),(80,82),(81,46),(86,26),(92,16)]
    def Profile(contour):return [(x/193*.13-.13,(.15-y/501*.30)*.97) for x,y in contour]
    for sign in (-1,1):
        for layer,profile in enumerate([Profile(outline if sign>0 else endContours[0])]):
            points=[]
            samples=10 if high else 2
            for index in range(len(profile)-1):
                count=len(profile)-1
                p0=Vector(profile[(index-1)%count]);p1=Vector(profile[index]);p2=Vector(profile[index+1]);p3=Vector(profile[(index+2)%count])
                for sample in range(samples):
                    t=sample/samples
                    points.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
            points.append(Vector(profile[-1]))
            arc=[0.0]
            for previousPoint,nextPoint in zip(points,points[1:]):arc.append(arc[-1]+(nextPoint-previousPoint).length)
            rows=[]
            # Closed elliptical fold edges retain actual rolled thickness.
            # Their rear halves are embedded in the continuous cloth mass.
            crossCount=12 if high else 8
            for index,point in enumerate(points[:-1]):
                count=len(points)-1
                tangent=(points[(index+1)%count]-points[(index-1)%count]).normalized();across=Vector((-tangent.y,tangent.x))
                compression=sum(math.exp(-((point.y-band)/.023)**2) for band in (.05,-.06))
                loosen=max(0,min(1,(-point.y-.070)/.055))
                phase=arc[index]/arc[-1]*math.tau*max(1,round(arc[-1]*137/math.tau))+layer*2.3
                finePhase=arc[index]/arc[-1]*math.tau*max(1,round(arc[-1]*440/math.tau))
                half=(.0072 if sign>0 else .0075)*(1+.12*math.sin(point.y*37+layer*1.7)-loosen*.05+loosen*.08*math.sin(phase))*(1-.17*compression)
                ring=[]
                for column in range(crossCount):
                    angle=column*math.tau/crossCount;s=math.sin(angle);outward=math.cos(angle)
                    yz=point+across*half*s
                    yz.x+=.0011*math.sin(yz.y*39+layer*1.2)+loosen*.0008*math.sin(phase+.7*s)
                    yz.y+=loosen*.0007*math.sin(phase*.73+1.5*s)
                    pleat=loosen*.0008*math.sin(phase+2.5*s)*max(0,outward)**2
                    fine=.0004*math.sin(finePhase+layer*2.7+s*1.8)*max(0,outward)**2
                    radius=.0105*(1+.04*math.sin(point.y*87+layer*2))
                    relief=EndRelief(yz.x,yz.y)*.35
                    x=sign*min(.1898,.1785+radius*outward-.0012*compression+.0005*math.sin(point.y*48+layer)+pleat+fine+relief)
                    ring.append(len(verts));verts.append((x,yz.x,max(-.1498,min(.1498,yz.y))));uvs.append(((yz.x+.13)/.13,(yz.y+.15)/.30))
                rows.append(ring)
            for a,b in zip(rows,rows[1:]+rows[:1]):
                for column in range(crossCount):
                    following=(column+1)%crossCount
                    faces.append((a[column],a[following],b[following],b[column]));roles.append('fold')
    obj=CreateMesh('Pack_Bundle',verts,faces,uvs,clothMaterial,parent)
    obj.data.materials.append(backMaterial);obj.data.materials.append(foldMaterial)
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    for face in bm.faces:
        center=face.calc_center_median()
        if all(abs(v.co.y)<1e-7 for v in face.verts):
            if face.normal.y<0:face.normal_flip()
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    for polygon in obj.data.polygons:
        if all(abs(obj.data.vertices[index].co.y)<1e-7 for index in polygon.vertices):polygon.material_index=1;polygon.use_smooth=False
        elif min(polygon.vertices)>=foldStartVertex or abs(polygon.normal.x)>.35 or abs(polygon.normal.z)>.65:
            polygon.material_index=2
            if min(polygon.vertices)>=foldStartVertex:
                for loop in polygon.loop_indices:
                    point=obj.data.vertices[obj.data.loops[loop].vertex_index].co
                    obj.data.uv_layers.active.data[loop].uv=(.02+.46*(point.y+.13)/.13,.52+.46*(point.z+.15)/.30)
    obj['Construction']='Soft folded blanket volume with exposed compressed cloth ends'
    return obj
