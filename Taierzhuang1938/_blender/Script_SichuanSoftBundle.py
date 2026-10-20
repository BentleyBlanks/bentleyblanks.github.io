"""Soft textile volume and exposed folded ends for reference-matching studies."""
import math
import bpy
import bmesh
from mathutils import Vector


def SoftFrontDepth(x,z,detail=0):
    edge=max(abs(x)/.19,abs(z)/.15)
    roll=.014*max(0,(edge-.73)/.27)**1.7
    pressure=sum(math.exp(-((x-band)/.017)**2) for band in (-.103,.089))
    pressure+=sum(math.exp(-((z-band)/.017)**2) for band in (.05,-.06))
    depth=-.128+roll+.008*min(1.65,pressure)
    depth+=.0015*math.sin(x*33+z*14)*math.cos(z*29-.4)
    if detail:
        wrinkles=0
        for index,(a,b,c,d) in enumerate(((-.183,.130,-.123,.063),(-.175,.005,-.116,.035),(-.18,-.125,-.116,-.075),(.176,.025,.109,.048),(.175,-.125,.112,-.078),(-.073,.130,-.015,.069),(.018,-.137,.070,-.083))):
            start=Vector((a,b));end=Vector((c,d));point=Vector((x,z));delta=end-start
            t=max(0,min(1,(point-start).dot(delta)/delta.length_squared))
            distance=(point-start-delta*t).length
            width=.0028+.0025*math.sin(math.pi*t)
            wrinkles+=.0022*math.sin(math.pi*t)*math.exp(-(distance/width)**2)
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
        decimate=low.modifiers.new('VisibleClothRetopology','DECIMATE');decimate.ratio=840/initial;decimate.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=decimate.name)
        transfer=low.modifiers.new('SculptedClothNormals','DATA_TRANSFER');transfer.object=source
        transfer.use_loop_data=True;transfer.data_types_loops={'CUSTOM_NORMAL'};transfer.loop_mapping='POLYINTERP_NEAREST'
        bpy.ops.object.modifier_apply(modifier=transfer.name)
        source.hide_render=True;source.hide_set(True)
        low['HighSource']=source.name
        return low
    nx,nz=(64,52) if high else (12,10)
    verts=[];uvs=[];faces=[];roles=[]
    def FrontPoint(s,t):
        z=.1498*t
        radius=.023
        q=max(0,(abs(z)-(.1498-radius))/radius)
        halfWidth=.1898-radius*(1-math.sqrt(max(0,1-q*q)))
        x=s*halfWidth
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
    depths=(-.103,-.065,-.020,0) if not high else tuple(-.108+index*.108/16 for index in range(17))
    for depth in depths:
        current=[]
        for vertex in perimeter:
            x,frontY,z=verts[vertex]
            fraction=max(0,min(1,-depth/.13))
            # Front/back edges turn in; the side cut is recessed for the
            # folded cloth lips, which carry the final width silhouette.
            side=abs(x)/.1898
            inset=.014*math.sin(math.pi*fraction)**.7*side**5
            x-=math.copysign(inset,x)
            z-=math.copysign(.0035*math.sin(math.pi*fraction)*(abs(z)/.15)**5,z)
            current.append(len(verts));verts.append((x,depth,z));uvs.append(((x+.19)/.38,(z+.15)/.30))
        for index in range(len(perimeter)):
            following=(index+1)%len(perimeter)
            faces.append((previous[index],current[index],current[following],previous[following]));roles.append('fold')
        previous=current
    backCenter=len(verts);verts.append((0,0,0));uvs.append((.5,.5))
    for index in range(len(previous)):
        faces.append((backCenter,previous[(index+1)%len(previous)],previous[index]));roles.append('back')

    profiles=[
        [(-.014,.121),(-.027,.139),(-.057,.143),(-.087,.136),(-.108,.116),(-.114,.076),(-.115,.013),(-.112,-.061),(-.106,-.116),(-.092,-.136),(-.066,-.142),(-.037,-.137),(-.021,-.119),(-.016,-.076),(-.016,.026)],
        [(-.036,.084),(-.041,.111),(-.057,.126),(-.077,.119),(-.086,.088),(-.084,.027),(-.087,-.052),(-.079,-.113),(-.062,-.130),(-.044,-.122),(-.034,-.098),(-.032,-.027),(-.035,.044)],
        [(-.055,.079),(-.060,.102),(-.072,.096),(-.076,.065),(-.071,.012),(-.074,-.055),(-.068,-.105),(-.057,-.117),(-.049,-.098),(-.051,-.032),(-.052,.041)]
    ]
    for sign in (-1,1):
        for layer,profile in enumerate(profiles if sign>0 else profiles[:1]):
            points=[]
            samples=6 if high else 1
            for index in range(len(profile)-1):
                p0=Vector(profile[max(0,index-1)]);p1=Vector(profile[index]);p2=Vector(profile[index+1]);p3=Vector(profile[min(len(profile)-1,index+2)])
                for sample in range(samples):
                    t=sample/samples
                    points.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
            points.append(Vector(profile[-1]))
            rows=[]
            crossValues=(-1,-.7,-.35,0,.35,.7,1) if high else (-1,0,1)
            for index,point in enumerate(points):
                tangent=(points[min(index+1,len(points)-1)]-points[max(0,index-1)]).normalized();across=Vector((-tangent.y,tangent.x))
                compression=sum(math.exp(-((point.y-band)/.023)**2) for band in (.05,-.06))
                half=(.0115-layer*.0015)*(1+.13*math.sin(point.y*37+layer*1.7))*(1-.16*compression)
                ring=[]
                for s in crossValues:
                    yz=point+across*half*s
                    yz.x+=.0018*math.sin(yz.y*39+layer*1.2)
                    x=sign*(.174+.0155*math.cos(s*math.pi/2)-.0023*compression+.0008*math.sin(point.y*48+layer))
                    ring.append(len(verts));verts.append((x,yz.x,max(-.1498,min(.1498,yz.y))));uvs.append(((yz.x+.13)/.13,(yz.y+.15)/.30))
                rows.append(ring)
            for a,b in zip(rows,rows[1:]):
                for column in range(len(crossValues)-1):faces.append((a[column],a[column+1],b[column+1],b[column]));roles.append('fold')
    obj=CreateMesh('Pack_Bundle',verts,faces,uvs,clothMaterial,parent)
    obj.data.materials.append(backMaterial);obj.data.materials.append(foldMaterial)
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    for face in bm.faces:
        center=face.calc_center_median()
        if all(abs(v.co.y)<1e-7 for v in face.verts):
            if face.normal.y<0:face.normal_flip()
        elif abs(center.x)>.173 and abs(face.normal.x)>.3:
            if center.x*face.normal.x<0:face.normal_flip()
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    for polygon in obj.data.polygons:
        if all(abs(obj.data.vertices[index].co.y)<1e-7 for index in polygon.vertices):polygon.material_index=1;polygon.use_smooth=False
        elif abs(polygon.normal.x)>.35 or abs(polygon.normal.z)>.65:polygon.material_index=2
    obj['Construction']='Soft folded blanket volume with exposed compressed cloth ends'
    return obj
