"""Tailored geometry from the three Imagegen turnarounds in the .blend Source folder.
Executed by Script_BuildCommandRoom.py in its authoring context before batching.
"""
thread=Material('CommandRoomThread',(.20,.185,.151),.97)
inkGlass.diffuse_color=(.052,.023,.007,1)
inkGlass.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.052,.023,.007,1)
inkGlass.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.14
inkGlass.node_tree.nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value=.50

def Shell(ob,thickness):
    m=ob.modifiers.new('Physical fabric thickness','SOLIDIFY');m.thickness=thickness
    bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=m.name)
    return ob

def Surface(name,nu,nv,point,mat,uvpoint=None,reverse=False):
    verts=[];uv=[];faces=[]
    for j in range(nv+1):
        for i in range(nu+1):
            u=i/nu;v=j/nv;verts.append(tuple(point(u,v)))
            uv.append(uvpoint(u,v) if uvpoint else (u,v))
    for j in range(nv):
        for i in range(nu):
            k=j*(nu+1)+i;f=(k,k+1,k+nu+2,k+nu+1)
            faces.append(tuple(reversed(f)) if reverse else f)
    return Mesh(name,verts,faces,mat,uv,True)

def Button(name,center,radius,normal=(0,-1,0)):
    c=Vector(center);n=Vector(normal).normalized();a=Vector((1,0,0));b=n.cross(a).normalized()
    # Rounded rim, inset face and four thread holes remain actual geometry.
    profiles=[(-.001,radius*.74),(0,radius),(.002,radius),(.003,radius*.76),(.0022,0)]
    verts=[];uv=[];sides=32
    for depth,r in profiles:
        for i in range(sides+1):
            t=math.tau*i/sides;verts.append(tuple(c+n*depth+a*(r*math.cos(t))+b*(r*math.sin(t))));uv.append((i/sides,depth))
    faces=[(j*(sides+1)+i,j*(sides+1)+i+1,(j+1)*(sides+1)+i+1,(j+1)*(sides+1)+i) for j in range(4) for i in range(sides)]
    ob=Mesh(name,verts,faces,iron,uv,True)
    for x in [-1,1]:
        for y in [-1,1]:
            p=c+n*.0028+a*(x*radius*.26)+b*(y*radius*.26)
            Rod(name+'Hole',p,p+n*.0003,radius*.12,graphite,8)
    Curve(name+'Thread',[c+n*.0036-a*radius*.27-b*radius*.27,c+n*.0038+a*radius*.27+b*radius*.27],.00045,thread)
    return ob

# Rounded glass flask. Each ring follows the reference's square-to-neck transition.
ix=.53;iy=.27;iz=.905
profiles=[(0,.021,.018,4),(.0015,.028,.024,4.5),(.004,.0315,.026,4.5),
 (.009,.032,.026,4.5),(.042,.032,.026,4.5),(.047,.030,.024,4),
 (.051,.026,.021,3.5),(.054,.019,.018,2.4),(.057,.016,.016,2),
 (.061,.016,.016,2),(.062,.020,.020,2),(.065,.020,.020,2),(.066,.017,.017,2)]
vs=[];uv=[];ns=80
for j,(z,rx,ry,power) in enumerate(profiles):
    for i in range(ns+1):
        a=math.tau*i/ns;c=math.cos(a);s=math.sin(a)
        x=rx*math.copysign(abs(c)**(2/power),c);y=ry*math.copysign(abs(s)**(2/power),s)
        vs.append((ix+x,iy+y,iz+z));uv.append((i/ns,z*12))
faces=[(j*(ns+1)+i,j*(ns+1)+i+1,(j+1)*(ns+1)+i+1,(j+1)*(ns+1)+i) for j in range(len(profiles)-1) for i in range(ns)]
faces.extend([tuple(reversed(range(ns))),tuple((len(profiles)-1)*(ns+1)+i for i in range(ns))])
Mesh('InkBottleGlass',vs,faces,inkGlass,uv,True)
# Screw cap has molded fine flutes, rounded edges and concentric top lip.
def LidPoint(u,v):
    a=u*math.tau;z=.065+.015*v
    edge=.0008*math.sin(math.pi*v)**.4
    r=.019+edge+.00045*math.cos(a*48)*math.sin(math.pi*v)**.25
    return (ix+r*math.cos(a),iy+r*math.sin(a),iz+z)
Surface('InkBottleLid',192,6,LidPoint,iron)
Surface('InkBottleLidTop',80,8,lambda u,v:(ix+.019*(1-v)*math.cos(u*math.tau),iy+.019*(1-v)*math.sin(u*math.tau),iz+.080+.0007*math.sin(v*math.pi*.5)),iron)
for z,r in [(.066,.0196),(.079,.0195),(.0615,.0188),(.006,.031)]:
    if z<.01:continue
    Curve('InkBottleMoldRim',[(ix+r*math.cos(i/80*math.tau),iy+r*math.sin(i/80*math.tau),iz+z) for i in range(81)],.0004,iron if z>.065 else inkGlass)
# Irregular small paper label; its dark ink marks have no invented brand.
def LabelPoint(u,v):
    x=(u-.5)*.040;z=.014+v*.027
    x+=.00045*math.sin(v*61)*(abs(u-.5)*2)**10
    z+=.0004*math.sin(u*51)*(abs(v-.5)*2)**10
    return (ix+x,iy-.02645-.0007*math.sin(u*math.pi),iz+z)
Surface('InkBottleLabel',24,16,LabelPoint,paperEdge)
for inset in [.06,.09]:
    pts=[]
    for u,v in [(inset,inset),(1-inset,inset),(1-inset,1-inset),(inset,1-inset),(inset,inset)]:
        p=Vector(LabelPoint(u,v));p.y-=.0003;pts.append(p)
    Curve('InkBottleLabelRule',pts,.00015,graphite)
inkRandom=random.Random(811)
for i in range(13):
    u=inkRandom.uniform(.23,.8);v=inkRandom.uniform(.18,.83);c=Vector(LabelPoint(u,v));c.y-=.00035;r=inkRandom.uniform(.00015,.0011)
    Mesh('InkBottleLabelStain',[tuple(c)]+[tuple(c+Vector((math.cos(j/8*math.tau)*r,0,math.sin(j/8*math.tau)*r))) for j in range(8)],[(0,j+1,(j+1)%8+1) for j in range(8)],graphite)

# Soft cap. Unequal pinched folds replace the old polygonal drum silhouette.
hx=.942;hy=-.092;hz=.907
def AngleDistance(a,b):return math.atan2(math.sin(a-b),math.cos(a-b))
folds=[(-2.8,.016,.20,.46),(-2.15,-.010,.13,.66),(-1.45,.013,.17,.80),(-.5,-.009,.16,.58),(.35,.014,.21,.65),(1.6,-.012,.20,.76),(2.3,.009,.13,.4)]
def Crown(t,a):
    rx=.148*(1+.045*math.sin(math.pi*t)-.075*t);ry=.130*(1+.045*math.sin(math.pi*t)-.06*t)
    fold=0
    for center,amp,width,height in folds:
        d=AngleDistance(a,center+.20*t)
        fold+=amp*math.exp(-(d/width)**2)*math.sin(math.pi*t)**.7
    fold+=.0025*math.sin(a*13+t*9)*math.sin(math.pi*t)
    z=hz+.045+.067*t + .007*math.sin(a*3+.8)*t + .004*math.sin(a*7)*math.sin(t*math.pi)
    return Vector((hx+(rx+fold)*math.cos(a),hy+(ry+fold)*math.sin(a),z))
Surface('CapSoftCrown',128,32,lambda u,v:Crown(v,u*math.tau),cloth,lambda u,v:(u*.90,v*.23))
def TopPoint(u,v):
    a=u*math.tau;r=1-v;p=Vector((hx-.008,hy+.004,hz+.112)).lerp(Crown(1,a),r)
    p.z+=(-.022*math.exp(-((r-.42)/.32)**2)+.010*math.sin(a*3+r*8))*math.sin(math.pi*r)
    for crease in [-2.6,-.7,1.3]:
        p.z+=.013*math.exp(-(AngleDistance(a,crease+.18*r)/.13)**2)*math.sin(math.pi*r)
    return p
Surface('CapSoftTop',128,24,TopPoint,cloth,lambda u,v:(.5+(1-v)*math.cos(u*math.tau)*.30,.5+(1-v)*math.sin(u*math.tau)*.26))
def BandPoint(u,v):
    a=u*math.tau;ripple=.0012*math.sin(a*12+v*3)*math.sin(math.pi*v)
    return Vector((hx+(.148+ripple)*math.cos(a),hy+(.130+ripple)*math.sin(a),hz+.004+v*.041+.002*math.sin(a*3)*math.sin(math.pi*v)))
Shell(Surface('CapFoldedBand',128,10,BandPoint,cloth,lambda u,v:(u*.90,v*.17)),.0018)
for t in [0,1]:
    Curve('CapCrownPiping',[Crown(t,i/128*math.tau) for i in range(129)],.0008,thread)
for v in [.09,.90]:
    pts=[BandPoint(i/128,v)+Vector((math.cos(i/128*math.tau)*.0005,math.sin(i/128*math.tau)*.0005,0)) for i in range(129)]
    Curve('CapBandStitch',pts,.00035,thread)
# Short oval cloth visor, constructed as a real thin curved shell.
def Visor(u,v):
    a=math.pi*1.10+u*math.pi*.80
    extent=math.sin(u*math.pi)**.75
    r=.128+.073*v*extent
    return Vector((hx+r*1.10*math.cos(a),hy+r*math.sin(a),hz+.005+.004*(1-v)+.006*math.cos(a*2)+.002*math.sin(u*19)*v))
Shell(Surface('CapCurvedVisor',72,18,Visor,cloth,lambda u,v:(u*.65,v*.22),reverse=True),.0022)
Curve('CapVisorBinding',[Visor(i/96,1) for i in range(97)],.0011,thread)
for v in [.17,.31,.45,.59,.73,.87]:
    Curve('CapVisorSewnLine',[Visor(i/96,v)+Vector((0,0,.00065)) for i in range(97)],.00030,thread)
for z in [.017,.037]:Button('CapSewnButton',(hx,hy-.132,hz+z),.0075)
# A few actual panel seams travel down into the irregular crown.
for a in [-math.pi/2,math.pi/2,math.pi]:
    Curve('CapPanelSeam',[Crown(i/40,a)+Vector((math.cos(a)*.0006,math.sin(a)*.0006,0)) for i in range(41)],.00042,thread)

# Hanging long military coat: joined shoulders, real open cuffs and split front hem.
coatx=-.35;coaty=1.23
Cube('CoatRack',(coatx,1.405,2.72),(.48,.044,.075),wood,.006)
Curve('CoatHook',[(coatx,1.4,2.73),(coatx,1.26,2.73),(coatx,1.215,2.77),(coatx,1.22,2.80)],.008,iron)
def Body(t,a):
    width=.070+.178*min(1,t/.10)
    width*=1-.12*math.sin(math.pi*t)
    drift=-.050*t+.012*math.sin(t*4)
    # broad gravity folds with smaller gathered creases near shoulder and waist
    fold=(.014+.024*t)*math.sin(a*7+t*2.5)+.008*math.sin(a*13-t*3)
    fold+=.007*math.sin(t*27+a*4)*math.exp(-((t-.40)/.15)**2)
    depth=.078+.012*math.sin(math.pi*t)
    return Vector((coatx+drift+(width+fold)*math.cos(a),coaty+(depth+fold)*math.sin(a)-.012*math.sin(t*7),2.655-1.48*t+.022*math.sin(a*2+.8)*t**4))
def BodyAngle(u,t):
    gap=.012+.10*max(0,(t-.65)/.35)
    return -math.pi/2+gap+u*(math.tau-2*gap)
Shell(Surface('CoatTailoredBody',96,88,lambda u,v:Body(v,BodyAngle(u,v)),cloth,lambda u,v:(u*1.0,v*1.5),reverse=True),.003)
def Front(t):return Body(t,-math.pi/2)
# Both placket edges and hem have small stitched raised borders.
for u in [0,1]:
    Curve('CoatFrontEdge',[Body(i/100,BodyAngle(u,i/100))+Vector((0,-.0015,0)) for i in range(101)],.0011,cloth)
    Curve('CoatPlacketStitch',[Body(i/100,BodyAngle(u,i/100))+Vector((.008 if u==0 else -.008,-.002,0)) for i in range(5,101)],.0005,thread)
Curve('CoatHemBinding',[Body(.995,BodyAngle(i/120,.995)) for i in range(121)],.0014,cloth)
Curve('CoatBackSeam',[Body(i/90,math.pi/2)+Vector((0,.0015,0)) for i in range(91)],.0007,thread)
for t in [.16,.29,.42,.55,.68]:
    p=Front(t)+Vector((.007,-.005,0));Button('CoatSewnButton',p,.009)
    Curve('CoatButtonhole',[p+Vector((.012,-.001,0)),p+Vector((.025,-.001,0))],.0007,graphite)
# Tailored collar wraps around neck; two downward folded points meet the placket.
def Collar(u,v):
    a=-math.pi/2+u*math.tau;r=.074+.035*v
    z=2.658+.025*(1-v)-.085*v*(.45+.55*max(0,-math.sin(a)))
    return (coatx+r*math.cos(a),coaty+r*.78*math.sin(a)-.011*v,z)
Shell(Surface('CoatFoldedCollar',80,10,Collar,cloth,lambda u,v:(u*.45,v*.20),reverse=True),.004)
Curve('CoatCollarStitch',[Vector(Collar(i/100,.92))+Vector((0,-.001,.001)) for i in range(101)],.0006,thread)

def Sleeve(side,t,a):
    c=Vector((coatx+side*(.223+.055*math.sin(t*math.pi*.9))-.033*t,coaty-.025-.090*t-.025*math.sin(math.pi*t),2.515-(.865 if side<0 else .82)*t))
    radius=.080-.024*t
    wrinkle=.014*math.sin(t*29+a*2)*math.exp(-((t-.56)/.22)**2)+.005*math.sin(a*7+t*6)
    return c+Vector(((radius+wrinkle)*math.cos(a),(radius*.76+wrinkle)*math.sin(a),.012*math.sin(a)-.045*side*math.cos(a)*(1-t)**3))
for side in [-1,1]:
    Shell(Surface('CoatTailoredSleeve',56,52,lambda u,v,side=side:Sleeve(side,v,u*math.tau),cloth,lambda u,v:(u*.47,v*.89),reverse=True),.003)
    for t in [.02,.95,1]:
        Curve('CoatSleeveSeam',[Sleeve(side,t,i/72*math.tau) for i in range(73)],.001 if t==1 else .0005,cloth if t==1 else thread)
    Curve('CoatSleeveLongSeam',[Sleeve(side,i/64,math.pi*1.3) for i in range(65)],.00055,thread)
# Patch pockets follow the front surface instead of floating in front of it.
for side in [-1,1]:
    def Pocket(u,v,side=side):
        t=.55+.215*v;xoffset=side*.132+(u-.5)*.115
        a=-math.pi/2+xoffset/.235
        p=Body(t,a);p.y-=.004+.008*math.sin(u*math.pi)*math.sin(v*math.pi)
        return p
    Shell(Surface('CoatPatchPocket',20,24,Pocket,cloth,lambda u,v:(u*.20,v*.33),reverse=True),.002)
    for u in [.03,.97]:Curve('CoatPocketStitch',[Pocket(u,i/32)+Vector((0,-.001,0)) for i in range(33)],.00055,thread)
    Curve('CoatPocketBottomStitch',[Pocket(i/32,.97)+Vector((0,-.001,0)) for i in range(33)],.00055,thread)
    def Flap(u,v):
        p=Pocket(u,v*.16);p.y-=.008*math.sin(v*math.pi*.65)+.003;p.z+=.004
        return p
    Shell(Surface('CoatPocketFlap',24,8,Flap,cloth,lambda u,v:(u*.2,v*.09),reverse=True),.003)
    Curve('CoatFlapStitch',[Flap(i/36,.92)+Vector((0,-.001,0)) for i in range(37)],.00055,thread)
# Simple rear half-belt, visible in the source turnaround and inspection view.
def Belt(u,v):
    p=Body(.44+v*.043,math.pi/2+(u-.5)*1.05);p.y+=.004
    return p
Shell(Surface('CoatRearBelt',32,6,Belt,cloth,lambda u,v:(u*.25,v*.08),reverse=True),.003)

# Trace the original yellowed paper's silhouette, excluding its white photo backdrop.
outline=json.loads((GAME/'_blender/Data_CommandRoomPaperOutline.json').read_text())['uvOutline']
vs=[];uvs=[];n=len(outline);rings=[1,.985,.94,.80,.55,.25]
def LetterVertex(u,v):
    px=(u-.5)*.65;py=(v-.5)*.85;angle=-.26
    edge=(max(0,abs(u-.5)-.43)/.07)**2*.006+(max(0,abs(v-.5)-.43)/.07)**2*.006
    cr=.0018*math.sin(u*math.pi*4)+.002*math.cos(v*math.pi*6)+edge
    return (-.142+px*math.cos(angle)-py*math.sin(angle),-.629+px*math.sin(angle)+py*math.cos(angle),.920+cr)
for r in rings:
    for u,v in outline:
        u=.5+(u-.5)*r;v=.5+(v-.5)*r
        vs.append(LetterVertex(u,v));uvs.append((u,v))
faces=[]
for j in range(len(rings)-1):
    for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
vs.append(LetterVertex(.5,.5));uvs.append((.5,.5));c=len(vs)-1
faces.extend(((len(rings)-1)*n+i,(len(rings)-1)*n+(i+1)%n,c) for i in range(n))
Shell(Mesh('Telegram',vs,faces,letter,uvs,True),.00055)
