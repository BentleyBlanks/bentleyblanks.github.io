"""V9 reference-led grass sheet roll and worn, cupped transverse-woven sandals.

BuildStrawHighV9(packRoot, materials) keeps the V8 assembly/mesh names so the
wear/fibre pass can find the same semantic surfaces. Dimensions are metres.
"""
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

def LoosePlait(mesh,path,radius=.0042,hint=(0,-1,0),closed=False,pitch=.013,seed=0):
    """Three coarse flattened straw bundles, with unequal hand-plaited spacing."""
    path=[Vector(p) for p in path]
    if closed:path=path+[path[0]]
    arc=[0]
    for a,b in zip(path,path[1:]):arc.append(arc[-1]+(b-a).length)
    for strand in range(3):
        points=[]
        for i,p in enumerate(path):
            tangent=(path[min(i+1,len(path)-1)]-path[max(0,i-1)]).normalized()
            normal=Vector(hint(p) if callable(hint) else hint);normal-=tangent*normal.dot(tangent);normal.normalize()
            side=tangent.cross(normal).normalized()
            phase=arc[i]/pitch*tau+.23*math.sin(arc[i]*130+seed)+strand*tau/3
            swell=1+.10*math.sin(arc[i]*87+seed)+.05*math.sin(arc[i]*219+strand)
            points.append(p+radius*swell*(.53*math.cos(phase)*side+.39*math.sin(phase)*normal))
        mesh.Tube(points,radius*.53,radius*.36,hint=hint,sides=8,shade=(strand+seed)%3)

def BuildStrawHighV9(packRoot,materials):
    scene=bpy.context.scene
    palette=[]
    for i,tone in enumerate((.84,1.0,1.105)):
        material=materials['straw'].copy();material.name='Material_V9StrawTone%d'%i;material['StrawTone']=tone;palette.append(material)
    def Root(name):
        root=bpy.data.objects.new(name,None);scene.collection.objects.link(root);root.parent=packRoot;root.empty_display_size=.025;return root
    matRoot=Root('Pack_StrawMat');sandals=Root('Pack_Sandals')
    matRoot['Construction']='Continuous rolled flat grass sheet, uneven cut laminae, flattened inner tuck and irregular interlacing; no coiled rope end trim'
    matRoot['Control']='Hide this assembly, including its retaining tapes'
    sandals['SandalCount']=2;sandals['Construction']='Heel-up cupped grass sandals, broad irregular transverse bundles, sparse warp, loose thick plaited edges and thin hanging cord'
    # Keep the final cut/tucked tail beneath the roll; placing this step on
    # top created the V9 preview's long rigid axial ridge.
    half=.202;cy=-.067;cz=.1805;inner=.0035;outer=.0285;turns=4.65;total=turns*tau;endAngle=-math.pi*.5;phase=endAngle-total;pitch=(outer-inner)/turns
    def Compression(x):return 1-.030*sum(math.exp(-((x-band)/.017)**2) for band in (-.103,.089))
    def RolledRadius(x,angle,radius):
        # The sheet keeps an oval, slightly crushed section. Adjacent windings
        # share the same broad distortion, rather than becoming separate ropes.
        common=1+.055*math.sin(angle*2+.7)+.028*math.sin(angle*3-1)+.012*math.sin(angle*5+x*21)
        loose=.00045*math.sin(angle*1.4+x*13)*min(1,radius/.014)
        return radius*Compression(x)*common+loose
    def RollPoint(x,angle,radius,flatten=1):
        depth=max(0,min(1,(radius-inner)/(outer-inner)))
        # Different winding centres and local flattening break the concentric
        # mathematical spiral without turning each winding into a rope.
        dy=.00075*math.sin(depth*5.7+.3)*(1-depth*.35)
        dz=.00065*math.sin(depth*7.1+1.0)*(1-depth*.30)
        return Vector((x,cy+dy+radius*1.245*math.cos(angle),cz+dz+radius*1.025*math.sin(angle)*flatten))
    def Radius(x,angle):
        back=(endAngle-angle)%tau
        if back<1e-8 and angle<endAngle-.1:back=tau
        return RolledRadius(x,angle,outer-pitch*back/tau)
    def MatPoint(x,angle,extra=0):
        radius=Radius(x,angle)+extra
        edge=(.00065*math.sin(angle*19+math.sin(angle*5))+.0004*math.sin(angle*7.3))*(abs(x)/half)**8
        return RollPoint(x+edge,angle,radius)
    def Radial(p):return Vector((0,(p.y-cy)/1.245,(p.z-cz)/1.025)).normalized()
    def TapePoint(x,angle):
        back=(endAngle-angle)%tau;mean=outer-pitch*back/tau
        after=(angle-endAngle)%tau
        if after<.60:
            t=after/.60;eased=t*t*(3-2*t)
            mean=outer*(1-eased)+mean*eased
        radius=RolledRadius(x,angle,mean)+.0047
        return RollPoint(x,angle,radius)
    # The sheet itself rolls through its whole length; there are no solid caps.
    sheet=StrawMesh();nx=48;nt=600
    for row in range(nt+1):
        t=row/nt*total;angle=t+phase
        for col in range(nx+1):
            x=-half+2*half*col/nx;radius=RolledRadius(x,angle,inner+(outer-inner)*t/total)
            edge=(.0008*math.sin(angle*17+.4*math.sin(angle*5))+.0005*math.sin(angle*7.3))*(abs(x)/half)**8
            # Close the innermost tuck into an uneven flattened fold instead
            # of a conspicuous round axial hole.
            innerFlatten=.60+.40*min(1,t/(tau*.65))
            sheet.vertices.append(tuple(RollPoint(x+edge,angle,radius,innerFlatten)))
            sheet.uvs.append(((x+half)/.08,((inner+radius)*.5*t)/.08))
    for row in range(nt):
        for col in range(nx):
            a=row*(nx+1)+col;sheet.faces.append((a,a+nx+1,a+nx+2,a+1));sheet.faceMaterials.append(1)
    obj=sheet.Write('Pack_TrueRolledGrassSheet',palette,matRoot)
    solid=obj.modifiers.new('GrassSheetThickness','SOLIDIFY');solid.thickness=.00465;solid.offset=0
    # Flat grass strips physically cross over and under on the outer turn.
    weave=StrawMesh();circ=tau*.0295;strandCount=25;spacing=circ/strandCount;steps=420
    for family in (1,-1):
        for index in range(strandCount):
            path=[];previousS=None
            for j in range(steps+1):
                x=-half+2*half*j/steps
                # The common warp deforms both families together, preserving
                # the true crossing indices rather than inventing extra phase.
                drift=.00038*math.sin(x*32)+.00020*math.sin(x*61)
                s=index*spacing+family*x*.94+drift
                wrapped=s%circ;angle=endAngle-tau+wrapped/circ*tau
                if previousS is not None and abs(wrapped-previousS)>circ/2:
                    weave.Tube(path,.00192*(1+.10*math.sin(index*2.7+family)),.00028,Radial,sides=8,shade=(index+(family<0))%3);path=[]
                # At a crossing, 2*k*x=(j-i)*spacing and parity(i+j)
                # equals parity(j-i). Thus the two continuous strip families
                # need opposite heights with NO additional index phase. The
                # short visible lozenges are actual occlusion by the crossing
                # strip, not capped little flakes.
                crossing=math.tanh(3.0*math.cos(tau*.94*x/spacing))
                lift=.00295+family*.00110*crossing
                lift+=.00010*math.sin(x*131+index*2.31)
                path.append(MatPoint(x,angle,lift));previousS=wrapped
            weave.Tube(path,.00192*(1+.10*math.sin(index*2.7+family)),.00028,Radial,sides=8,shade=(index+(family<0))%3)
    # Short, crushed grass bundles cover the exposed end of each winding.
    # They are broad radially but very shallow axially: no smooth paper-band
    # annulus, continuous fine tree rings, or round cord tracing the spiral.
    for sign in (-1,1):
        edge=[];edgeLengths=[0]
        for i in range(nt+1):
            t=i/nt*total;angle=t+phase;x=sign*(half+.00055)
            radius=RolledRadius(x,angle,inner+(outer-inner)*t/total)
            p=RollPoint(x,angle,radius,.60+.40*min(1,t/(tau*.65)))
            edge.append(p)
            if i:edgeLengths.append(edgeLengths[-1]+(p-edge[-2]).length)
        first=0;bundle=0
        while first<nt:
            goal=edgeLengths[first]+.0062+.0043*(.5+.5*math.sin(bundle*2.371+sign))
            last=first+2
            while last<nt and edgeLengths[last]<goal:last+=1
            a=max(0,first-1);b=min(nt,last+1)
            steps=max(5,b-a);sides=10;origin=len(weave.vertices)
            radialWidth=.00370*(1+.13*math.sin(bundle*1.937+sign))
            shallowDepth=.00072*(1+.25*math.sin(bundle*2.731))
            for row in range(steps+1):
                t=row/steps;index=a+(b-a)*t;i=min(nt-1,int(index));f=index-i
                p=edge[i]*(1-f)+edge[i+1]*f
                radial=Radial(p);tangent=(edge[min(nt,i+2)]-edge[max(0,i-1)]).normalized()
                tip=.67+.33*math.sin(math.pi*t)**.45
                offset=.00042+.00021*math.sin(bundle*2.117)+.00032*math.sin(math.pi*t)
                p+=Vector((sign*offset,0,0))+radial*(.00032*math.sin(bundle*1.713+t*2.7))
                for j in range(sides):
                    angle=tau*j/sides;rib=1+.055*math.sin(angle*3+t*4.1+bundle)
                    q=p+radial*(radialWidth*tip*math.cos(angle)*rib)+Vector((sign*shallowDepth*tip*math.sin(angle),0,0))
                    weave.vertices.append(tuple(q));weave.uvs.append((.13+j/sides*.085,(edgeLengths[a]+(edgeLengths[b]-edgeLengths[a])*t)/.08))
            for row in range(steps):
                for j in range(sides):
                    p=origin+row*sides+j;q=origin+row*sides+(j+1)%sides
                    weave.faces.append((p,p+sides,q+sides,q));weave.faceMaterials.append((bundle*7+bundle//4)%3)
            for row,reverse in ((0,True),(steps,False)):
                cap=tuple(origin+row*sides+j for j in range(sides))
                weave.faces.append(tuple(reversed(cap)) if reverse else cap);weave.faceMaterials.append(bundle%3)
            # One or two split longitudinal fibres die within each coarse
            # bundle rather than tracing the entire spiral as fine rings.
            for strand in range(1+bundle%2):
                path=[];fraction=(-.38 if strand==0 else .43)
                for row in range(7):
                    t=.10+.78*row/6;index=a+(b-a)*t;i=min(nt-1,int(index));f=index-i
                    p=edge[i]*(1-f)+edge[i+1]*f;radial=Radial(p)
                    offset=.00042+.00021*math.sin(bundle*2.117)+.00032*math.sin(math.pi*t)
                    p+=radial*(radialWidth*fraction+.00022*math.sin(t*4+bundle))+Vector((sign*(offset+shallowDepth*.96),0,0))
                    path.append(p)
                weave.Tube(path,.00019,.00010,(sign,0,0),sides=5,shade=(bundle+strand+1)%3)
            first=last;bundle+=1
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
            distances=[0]
            for a,b in zip(path,path[1:]):distances.append(distances[-1]+(b-a).length)
            for k,p in enumerate(path):
                for col in range(7):
                    u=col/6;tapes.vertices.append(tuple(p+Vector(((u-.5)*.026,0,0))));tapes.uvs.append((u,distances[k]/.18))
            for k in range(16):
                for col in range(6):
                    a=base+k*7+col;tapes.faces.append((a,a+7,a+8,a+1) if front else (a,a+1,a+8,a+7));tapes.faceMaterials.append(0)
    tape=tapes.Write('Pack_MatCottonRetainers', [materials['binding']],matRoot)
    thick=tape.modifiers.new('CottonTapeThickness','SOLIDIFY');thick.thickness=.0009;thick.offset=0
    # Grass shoes hang by their narrow heels, with the rounded toes below.
    widthAxis=Vector((.974,.226,0));normal=Vector((.226,-.974,0))
    # The reference toes are broad and round, while the heels above are narrow.
    # V8 additionally scaled every width by .87, creating thin leaf silhouettes.
    knots=[(-.086,.0025),(-.081,.010),(-.072,.0175),(-.052,.023),(-.020,.0275),(.014,.0325),(.046,.0330),(.071,.0275),(.087,.0175),(.094,.003)]
    def Half(length):
        if length<knots[0][0] or length>knots[-1][0]:return 0
        for (a,w),(b,v) in zip(knots,knots[1:]):
            if a<=length<=b:return w+(v-w)*(length-a)/(b-a)
        return .002
    # Registered to the approved front view: the front shoe overlaps the left
    # blanket edge, and the rear shoe is partly occluded rather than floating
    # outside/back of the pack. Keep the root and hanging-anchor route fixed.
    centers=(Vector((-.206,-.139,.002)),Vector((-.192,-.113,-.012)))
    hangs=[]
    for number,center in enumerate(centers,1):
        yaw=-.095 if number==1 else .075
        widthScale=.865 if number==1 else .81
        lengthScale=.86
        def Shoe(w,l,h):
            relative=w/max(.003,Half(l));w*=widthScale
            # Shorten around each existing centre, keeping the present widths
            # and the same curled sole profile. Every rim, lace, foundation
            # and hanging target passes through this common mapping.
            mappedLength=l*lengthScale
            u=w*math.cos(yaw)-mappedLength*math.sin(yaw);v=w*math.sin(yaw)+mappedLength*math.cos(yaw)
            # Worn grass soles form a shallow irregular bowl. Raising the rim
            # and curled toe is visible in silhouette, not only in the shader.
            curl=.0075*((l+.014)/.108)**2+.0060*min(1.1,abs(relative))**2.2
            curl+=.0010*math.sin(l*71+number*.8)*relative+.0007*math.sin(w*133+l*37)
            return center+widthAxis*u+Vector((0,0,-v))+normal*(h+curl)
        outline=[]
        for i in range(35):
            l=-.086+i/34*.180;outline.append((Half(l),l))
        for i in range(34,-1,-1):
            l=-.086+i/34*.180;outline.append((-Half(l),l))
        base=StrawMesh()
        # A curved quad foundation, rather than two non-planar n-gons that
        # triangulate into an artificially flat board underneath the weave.
        foundationRows=60;foundationCross=18;layerSize=(foundationRows+1)*(foundationCross+1)
        # A few actual little open gaps, rather than black paint over a solid
        # wicker board. Most are partly concealed by the compressed bundles.
        openCells={(11,4),(20,12),(28,7),(37,13),(46,5),(51,10)}
        for layer,h in enumerate((-.0020,.0015)):
            for row in range(foundationRows+1):
                l=-.086+row/foundationRows*.180;halfWidth=Half(l)*.95
                for column in range(foundationCross+1):
                    across=column/foundationCross*2-1;w=across*halfWidth
                    irregular=.00035*math.sin(l*289+number+across*11)*abs(across)**4
                    base.vertices.append(tuple(Shoe(w,l,h+irregular)));base.uvs.append(((w+.035)/.08,(l+.09)/.08))
            for row in range(foundationRows):
                for column in range(foundationCross):
                    if (row,column) in openCells:continue
                    a=layer*layerSize+row*(foundationCross+1)+column
                    face=(a,a+foundationCross+1,a+foundationCross+2,a+1)
                    base.faces.append(face if layer==1 else tuple(reversed(face)));base.faceMaterials.append(1)
        for row,column in openCells:
            a=row*(foundationCross+1)+column;corners=(a,a+foundationCross+1,a+foundationCross+2,a+1)
            for a,b in zip(corners,corners[1:]+corners[:1]):
                base.faces.append((a,b,b+layerSize,a+layerSize));base.faceMaterials.append(0)
        for row in range(foundationRows):
            for column in (0,foundationCross):
                a=row*(foundationCross+1)+column;b=a+foundationCross+1
                face=(a,b,b+layerSize,a+layerSize)
                base.faces.append(face if column==0 else tuple(reversed(face)));base.faceMaterials.append(0)
        for row in (0,foundationRows):
            for column in range(foundationCross):
                a=row*(foundationCross+1)+column;b=a+1
                face=(a,b,b+layerSize,a+layerSize)
                base.faces.append(tuple(reversed(face)) if row==0 else face);base.faceMaterials.append(0)
        base.Write('Pack_GrassSandal%02dFoundation'%number,palette,sandals)
        woven=StrawMesh()
        # Compressed short crosswise/diagonal flat straw bundles. Continuous
        # straight longitudinal rails made the previous preview a wicker grid.
        rowCenters=[];rowL=-.081;row=0
        while rowL<.091:
            rowCenters.append(rowL);rowL+=.0049+.00065*(.5+.5*math.sin(row*2.17+number));row+=1
        for row,rowL in enumerate(rowCenters):
            maxWidth=Half(rowL)*.94;segments=max(2,round(2*maxWidth/.0105))
            for segment in range(segments):
                left=-maxWidth+2*maxWidth*segment/segments
                right=-maxWidth+2*maxWidth*(segment+1)/segments
                overlap=.00065;path=[];sign=1 if (row+segment)%2 else -1
                for j in range(11):
                    t=j/10;w=(left-overlap)*(1-t)+(right+overlap)*t
                    l=rowL+sign*.00135*(2*t-1)+.00045*math.sin(segment*2.31+row*.91)+.00025*math.sin(t*math.pi*2+row)
                    h=.0035+.00032*math.sin(t*math.pi)+.00022*math.sin(row*2.27+segment*1.79)
                    if abs(w)<=Half(l)*.98:path.append(Shoe(w,l,h))
                # Length compression already brings the rows 14% closer.
                # This small extra flattening closes regular dark slots
                # without replacing the irregular open foundation cells.
                width=.00250*(1+.10*math.sin(row*2.31+segment*1.77))
                if len(path)>1:woven.Tube(path,width,.00065,normal,sides=8,shade=(row+segment)%3)
                if len(path)>4 and (row+segment)%4==1:
                    split=[p+normal*(.00062+.00006*math.sin(i)) for i,p in enumerate(path[1:-1])]
                    woven.Tube(split,.00016,.00010,normal,sides=4,shade=(row+segment+1)%3)
        # Sparse buried warp appears only in short interruptions; no full
        # length pole remains to divide the sole into rectangular cells.
        for column,fraction in enumerate((-.68,-.23,.28,.74)):
            for segment in range(8):
                start=-.079+segment*.0215+.001*math.sin(column+segment)
                path=[]
                for j in range(12):
                    l=start+j/11*.014;w=fraction*Half(l)+.00045*math.sin(l*107+column*1.37)
                    path.append(Shoe(w,l,.00225+.00025*math.sin(j*.8+segment)))
                woven.Tube(path,.00043,.00026,normal,sides=6,shade=(column+segment)%3)
        rim=SmoothPath([Shoe(w,l,.0072+.0006*math.sin(i*1.8+number)) for i,(w,l) in enumerate(outline)],4,closed=True)
        LoosePlait(woven,rim,.00435,normal,closed=True,pitch=.0141,seed=number)
        # Open braided laces replace the former flat, bag-like upper panel.
        for l in (-.013,.027):
            hwidth=Half(l)
            path=[Shoe(across*hwidth,l+.004*math.cos(across*math.pi),.006+.014*(1-across*across)) for across in (-1,-.75,-.5,-.25,0,.25,.5,.75,1)]
            LoosePlait(woven,SmoothPath(path,5),.00185,normal,pitch=.012,seed=number+3)
        heel=[Shoe(-.020,-.033,.008),Shoe(-.016,-.069,.019),Shoe(0,-.078,.021),Shoe(.015,-.067,.019),Shoe(.020,-.032,.008)]
        LoosePlait(woven,SmoothPath(heel,8),.0021,normal,pitch=.0125,seed=number+5)
        instep=[Shoe(-.020,-.034,.009),Shoe(.009,-.006,.021),Shoe(.017,-.036,.014),Shoe(.016,-.066,.011)]
        LoosePlait(woven,SmoothPath(instep,8),.0014,normal,pitch=.011,seed=number+7)
        # Broken ends are sparse and confined to worn perimeter/strap joins.
        for i in range(15):
            l=-.075+i/14*.160;sign=-1 if i%2 else 1;w=sign*Half(l)
            p=Shoe(w,l,.0075);q=Shoe(w+sign*(.0018+.0012*(.5+.5*math.sin(i*3.1))),l+.0016*math.sin(i*2.7),.009)
            woven.Tube((p,(p+q)*.5+normal*.0005,q),.00018,.00011,normal,sides=4,shade=i%3)
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
    matRoot['NominalDimensionsM']=[.404,.078,.068]
    return matRoot,sandals
