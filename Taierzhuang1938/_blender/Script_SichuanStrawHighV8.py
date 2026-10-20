"""Actual rolled grass sheet and braided, heel-up hanging sandals for V8."""
import bpy,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree

tau=math.tau

def SmoothPath(points,steps=5,closed=False):
    points=[Vector(p) for p in points];result=[];count=len(points)
    for i in range(count if closed else count-1):
        p0=points[(i-1)%count] if closed else points[max(0,i-1)]
        p1=points[i];p2=points[(i+1)%count];p3=points[(i+2)%count] if closed else points[min(count-1,i+2)]
        for j in range(steps):
            t=j/steps
            result.append(.5*(2*p1+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
    if not closed:result.append(points[-1])
    return result

class StrawMesh:
    def __init__(self,role='straw'):
        self.vertices=[];self.faces=[];self.uvs=[];self.faceMaterials=[];self.role=role;self.strand=0
    def Tube(self,path,width,depth=None,hint=(0,-1,0),closed=False,sides=6,shade=None):
        path=[Vector(p) for p in path]
        if len(path)<2:return
        if closed:path.append(path[0])
        depth=width if depth is None else depth;first=len(self.vertices);arc=0
        shade=(self.strand*37%13)%3 if shade is None else shade;self.strand+=1
        for i,p in enumerate(path):
            if i:arc+=(p-path[i-1]).length
            tangent=(path[min(i+1,len(path)-1)]-path[max(0,i-1)]).normalized()
            n=Vector(hint(p) if callable(hint) else hint);n-=tangent*n.dot(tangent)
            if n.length<.01:n=tangent.cross(Vector((0,0,1)))
            n.normalize();side=tangent.cross(n).normalized()
            for j in range(sides):
                angle=tau*j/sides;self.vertices.append(tuple(p+width*math.cos(angle)*side+depth*math.sin(angle)*n));self.uvs.append((j/sides,arc/.08))
        for i in range(len(path)-1):
            for j in range(sides):
                a=first+i*sides+j;b=first+i*sides+(j+1)%sides
                self.faces.append((a,a+sides,b+sides,b));self.faceMaterials.append(shade)
        if not closed:
            self.faces.extend((tuple(first+i for i in range(sides)),tuple(reversed([first+(len(path)-1)*sides+i for i in range(sides)]))))
            self.faceMaterials.extend((shade,shade))
    def Braid(self,path,radius=.0024,hint=(0,-1,0),closed=False,pitch=.008):
        path=[Vector(p) for p in path];arc=[0]
        for a,b in zip(path,path[1:]):arc.append(arc[-1]+(b-a).length)
        for strand in range(3):
            points=[]
            for i,p in enumerate(path):
                tangent=(path[min(i+1,len(path)-1)]-path[max(0,i-1)]).normalized()
                normal=Vector(hint(p) if callable(hint) else hint);normal-=tangent*normal.dot(tangent);normal.normalize();side=tangent.cross(normal).normalized()
                angle=arc[i]/pitch*tau+strand*tau/3
                points.append(p+radius*.51*(math.cos(angle)*side+math.sin(angle)*normal))
            self.Tube(points,radius*.49,hint=hint,closed=closed,sides=6,shade=strand)
    def Write(self,name,materials,parent):
        mesh=bpy.data.meshes.new(name+'Geometry');mesh.from_pydata(self.vertices,[],self.faces);mesh.update()
        for m in materials:mesh.materials.append(m)
        rect=(.52,.52) if self.role=='straw' else (.02,.02)
        uv=mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops:
            u,v=self.uvs[loop.vertex_index];uv.data[loop.index].uv=(rect[0]+.46*u,rect[1]+.46*v)
        for polygon,shade in zip(mesh.polygons,self.faceMaterials):polygon.material_index=min(shade,len(materials)-1);polygon.use_smooth=True
        obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj);obj.parent=parent
        return obj

def BuildStrawHighV8(packRoot,materials):
    scene=bpy.context.scene
    palette=[]
    for i,tone in enumerate((.94,1.0,1.045)):
        material=materials['straw'].copy();material.name='Material_V8StrawTone%d'%i;material['StrawTone']=tone;palette.append(material)
    def Root(name):
        root=bpy.data.objects.new(name,None);scene.collection.objects.link(root);root.parent=packRoot;root.empty_display_size=.025;return root
    matRoot=Root('Pack_StrawMat');sandals=Root('Pack_Sandals')
    matRoot['Construction']='True rolled woven grass sheet, exposed layered ends and interlaced grass strips'
    matRoot['Control']='Hide this assembly, including its retaining tapes'
    sandals['SandalCount']=2;sandals['Construction']='Heel-up braided grass sandals, open woven footbeds, thick plaited edges and thin hanging cord'
    half=.202;cy=-.067;cz=.1805;inner=.004;outer=.0285;turns=5.0;total=turns*tau;endAngle=1.35;phase=endAngle-total;pitch=(outer-inner)/turns
    def Compression(x):return 1-.030*sum(math.exp(-((x-band)/.017)**2) for band in (-.103,.089))
    def RolledRadius(x,angle,radius):
        return radius*Compression(x)*(1+.035*math.sin(angle*2+.7)+.015*math.sin(angle*5+x*30)+.007*math.sin(x*37+angle*3))
    def Radius(x,angle):
        back=(endAngle-angle)%tau
        if back<1e-8 and angle<endAngle-.1:back=tau
        return RolledRadius(x,angle,outer-pitch*back/tau)
    def MatPoint(x,angle,extra=0):
        radius=Radius(x,angle)+extra
        edge=.00065*math.sin(angle*19+math.sin(angle*5))*(abs(x)/half)**8
        return Vector((x+edge,cy+radius*1.015*math.cos(angle),cz+radius*.985*math.sin(angle)))
    def Radial(p):return Vector((0,(p.y-cy)/1.015,(p.z-cz)/.985)).normalized()
    def TapePoint(x,angle):
        back=(endAngle-angle)%tau;mean=outer-pitch*back/tau
        after=(angle-endAngle)%tau
        if after<.60:
            t=after/.60;eased=t*t*(3-2*t)
            mean=outer*(1-eased)+mean*eased
        radius=RolledRadius(x,angle,mean)+.0047
        return Vector((x,cy+radius*1.015*math.cos(angle),cz+radius*.985*math.sin(angle)))
    # The sheet itself rolls through its whole length; there are no solid caps.
    sheet=StrawMesh();nx=48;nt=600
    for row in range(nt+1):
        t=row/nt*total;angle=t+phase
        for col in range(nx+1):
            x=-half+2*half*col/nx;radius=RolledRadius(x,angle,inner+(outer-inner)*t/total)
            edge=.0007*math.sin(angle*17+.4*math.sin(angle*5))*(abs(x)/half)**8
            sheet.vertices.append((x+edge,cy+1.015*radius*math.cos(angle),cz+.985*radius*math.sin(angle)))
            sheet.uvs.append(((x+half)/.08,((inner+radius)*.5*t)/.08))
    for row in range(nt):
        for col in range(nx):
            a=row*(nx+1)+col;sheet.faces.append((a,a+nx+1,a+nx+2,a+1));sheet.faceMaterials.append(1)
    obj=sheet.Write('Pack_TrueRolledGrassSheet',palette,matRoot)
    solid=obj.modifiers.new('GrassSheetThickness','SOLIDIFY');solid.thickness=.0042;solid.offset=0
    # Flat grass strips physically cross over and under on the outer turn.
    weave=StrawMesh();circ=tau*.0295;strandCount=18;spacing=circ/strandCount;steps=112
    for family in (1,-1):
        for index in range(strandCount):
            path=[];previousS=None
            for j in range(steps+1):
                x=-half+2*half*j/steps;s=index*spacing+family*x
                wrapped=s%circ;angle=endAngle-tau+wrapped/circ*tau
                if previousS is not None and abs(wrapped-previousS)>circ/2:
                    weave.Tube(path,.00270,.00048,Radial,sides=8);path=[]
                wave=(1 if family==1 else -1)*.00055*math.tanh(3*math.cos(math.pi*.5*((s+family*x)/spacing+index)+math.pi*.25))
                path.append(MatPoint(x,angle,.00295+wave));previousS=wrapped
            weave.Tube(path,.00270,.00048,Radial,sides=8)
    # Bound cut edges follow the actual spiral, with tight irregular layers.
    for sign in (-1,1):
        edge=[]
        for i in range(nt+1):
            t=i/nt*total;angle=t+phase;x=sign*(half+.0004)
            radius=RolledRadius(x,angle,inner+(outer-inner)*t/total)
            edge.append((x+sign*.0004*math.sin(angle*17),cy+1.015*radius*math.cos(angle),cz+.985*radius*math.sin(angle)))
        weave.Braid(edge,.00205,(sign,0,0))
    # A few broken fibres at the cut ends stop the roll reading as a moulding.
    for sign in (-1,1):
        for i in range(24):
            angle=i*tau/24+.10*math.sin(i*4.7);p=MatPoint(sign*half,angle,.0033)
            q=p+Vector((sign*(.0016+.0018*(.5+.5*math.sin(i*7.3))),.0008*math.sin(i),.0009*math.cos(i*3)))
            weave.Tube((p,(p+q)/2+Radial(p)*.0005,q),.00016,hint=Radial,sides=4)
    weave.Write('Pack_InterlacedMatGrass',palette,matRoot)
    body=bpy.data.objects['Pack_Bundle'];tree=BVHTree.FromObject(body,bpy.context.evaluated_depsgraph_get())
    crown=tree.ray_cast(Vector((0,cy,.4)),Vector((0,0,-1)),.5)[0]
    if crown is not None:matRoot.location.z=crown.z-MatPoint(0,math.pi*1.5,.0038).z-.0003
    # Retaining tapes follow the woven surface and join the existing uprights.
    tapes=StrawMesh('binding')
    for x in (-.103,.089):
        first=len(tapes.vertices);cross=8;segments=80
        for row in range(segments+1):
            angle=row/segments*tau
            for col in range(cross+1):
                u=col/cross;px=x+(u-.5)*.026
                tapes.vertices.append(tuple(TapePoint(px,angle)));tapes.uvs.append((u,row/segments))
        for row in range(segments):
            for col in range(cross):
                a=first+row*(cross+1)+col;tapes.faces.append((a,a+cross+1,a+cross+2,a+1));tapes.faceMaterials.append(0)
        for front in (True,False):
            start=TapePoint(x,math.pi if front else 0)
            end=Vector((x,-.126 if front else .001,.137-matRoot.location.z))
            if front:
                hit=tree.ray_cast(Vector((x,-.3,.137)),Vector((0,1,0)),.4)[0]
                if hit is not None:end.y=hit.y-.002
            control=(start+end)/2;control.y+=-.004 if front else .003
            path=[]
            for k in range(17):
                t=k/16;path.append((1-t)**2*start+2*(1-t)*t*control+t*t*end)
            base=len(tapes.vertices)
            for k,p in enumerate(path):
                for col in range(7):
                    u=col/6;tapes.vertices.append(tuple(p+Vector(((u-.5)*.026,0,0))));tapes.uvs.append((u,k/16))
            for k in range(16):
                for col in range(6):
                    a=base+k*7+col;tapes.faces.append((a,a+7,a+8,a+1) if front else (a,a+1,a+8,a+7));tapes.faceMaterials.append(0)
    tape=tapes.Write('Pack_MatCottonRetainers', [materials['binding']],matRoot)
    thick=tape.modifiers.new('CottonTapeThickness','SOLIDIFY');thick.thickness=.0009;thick.offset=0
    # Grass shoes hang by their narrow heels, with the rounded toes below.
    widthAxis=Vector((.974,.226,0));normal=Vector((.226,-.974,0))
    knots=[(-.086,.003),(-.078,.015),(-.060,.020),(-.030,.021),(.008,.024),(.041,.027),(.067,.025),(.083,.015),(.091,.002)]
    def Half(length):
        if length<knots[0][0] or length>knots[-1][0]:return 0
        for (a,w),(b,v) in zip(knots,knots[1:]):
            if a<=length<=b:return w+(v-w)*(length-a)/(b-a)
        return .002
    centers=(Vector((-.226,-.104,.002)),Vector((-.212,-.078,-.012)))
    hangs=[]
    for number,center in enumerate(centers,1):
        yaw=-.095 if number==1 else .075
        def Shoe(w,l,h):
            w*=.87
            u=w*math.cos(yaw)-l*math.sin(yaw);v=w*math.sin(yaw)+l*math.cos(yaw)
            curl=.0030*(abs(l)/.091)**4+.0018*(abs(w)/.027)**2
            return center+widthAxis*u+Vector((0,0,-v))+normal*(h+curl)
        outline=[]
        for i in range(35):
            l=-.086+i/34*.177;outline.append((Half(l),l))
        for i in range(34,-1,-1):
            l=-.086+i/34*.177;outline.append((-Half(l),l))
        base=StrawMesh()
        for h in (-.0015,.002):
            for w,l in outline:base.vertices.append(tuple(Shoe(w*.95,l,h)));base.uvs.append(((w+.03)/.08,(l+.09)/.08))
        n=len(outline);base.faces.extend((tuple(reversed(range(n))),tuple(n+i for i in range(n))));base.faceMaterials.extend((0,0))
        for i in range(n):base.faces.append((i,(i+1)%n,(i+1)%n+n,i+n));base.faceMaterials.append(0)
        base.faces=[tuple(reversed(face)) for face in base.faces]
        base.Write('Pack_GrassSandal%02dFoundation'%number,palette,sandals)
        woven=StrawMesh()
        # The approved footbed has a bold plaited chevron, not fine cloth.
        rowStep=.0064;columnStep=.0052
        for row in range(-19,18):
            path=[]
            for j in range(65):
                w=-.029+j/64*.058;bend=math.sqrt(w*w+.0012**2)-.0012;l=row*rowStep+bend*1.35
                if abs(w)<Half(l)*.94:
                    h=.0056+.0010*math.cos(math.pi*(row+w/columnStep));path.append(Shoe(w,l,h))
                elif len(path)>1:
                    woven.Tube(path,.00190,.00135,normal,sides=8);path=[]
            if len(path)>1:woven.Tube(path,.00190,.00135,normal,sides=8)
        for column in range(-4,5):
            w=column*columnStep;path=[]
            for j in range(100):
                l=-.086+j/99*.177
                if abs(w)<Half(l)*.94:
                    bend=math.sqrt(w*w+.0012**2)-.0012
                    h=.0056-.0010*math.cos(math.pi*((l-bend*1.35)/rowStep+column));path.append(Shoe(w,l,h))
                elif len(path)>1:
                    woven.Tube(path,.0012,.0010,normal,sides=6);path=[]
            if len(path)>1:woven.Tube(path,.0012,.0010,normal,sides=6)
        rim=SmoothPath([Shoe(w,l,.008) for w,l in outline],3,closed=True)
        woven.Braid(rim,.0041,normal,closed=True,pitch=.012)
        # Open braided laces replace the former flat, bag-like upper panel.
        for l in (-.012,.027):
            hwidth=Half(l)
            path=[Shoe(across*hwidth,l+.004*math.cos(across*math.pi),.006+.014*(1-across*across)) for across in (-1,-.75,-.5,-.25,0,.25,.5,.75,1)]
            woven.Braid(SmoothPath(path,4),.0018,normal)
        heel=[Shoe(-.020,-.033,.008),Shoe(-.016,-.069,.019),Shoe(0,-.078,.021),Shoe(.015,-.067,.019),Shoe(.020,-.032,.008)]
        woven.Braid(SmoothPath(heel,8),.0021,normal)
        instep=[Shoe(-.020,-.034,.009),Shoe(.009,-.006,.021),Shoe(.017,-.036,.014),Shoe(.016,-.066,.011)]
        woven.Braid(SmoothPath(instep,8),.0014,normal)
        woven.Write('Pack_GrassSandal%02dBraidedWeave'%number,palette,sandals)
        hangs.append(Shoe(0,-.077,.020))
    cords=StrawMesh()
    anchor=Vector((-.194,-.096,.118))
    contact=tree.ray_cast(Vector((-.35,anchor.y,anchor.z)),Vector((1,0,0)),.30)[0]
    if contact is not None:anchor.x=contact.x-.0012
    loop=[]
    guides=[Vector((anchor.x,y,z)) for y,z in ((-.096,.118),(-.087,.134),(-.070,.143),(-.064,.140),(-.078,.129),(-.092,.120))]
    for p in SmoothPath(guides,6,closed=True):
        hit=tree.ray_cast(Vector((-.35,p.y,p.z)),Vector((1,0,0)),.30)[0]
        if hit is not None:p.x=hit.x-.0012
        loop.append(p)
    cords.Braid(loop,.0011,(-1,0,0),closed=True)
    knot=[anchor+Vector((-.0005,.0023*math.cos(i*tau/24),.0023*math.sin(i*tau/24))) for i in range(24)]
    cords.Braid(knot,.00085,(-1,0,0),closed=True)
    for i,end in enumerate(hangs):
        path=SmoothPath((anchor,Vector((-.207,-.108,.104)),end+Vector((-.004,-.002,.008)),end),12)
        cords.Braid(path,.00115,normal)
    cords.Write('Pack_ThinSandalHangingTwine',palette,sandals)
    matRoot['NominalDimensionsM']=[.404,.066,.064]
    return matRoot,sandals
