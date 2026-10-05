"""Reference-driven cap, tailored coat and thick amber ink bottle.
Executed by the command-room authoring script; dimensions are metres.
"""
from mathutils import noise

def SmoothProfile(t, stops):
    for i in range(len(stops)-1):
        a,x=stops[i];b,y=stops[i+1]
        if t<=b:
            f=max(0,min(1,(t-a)/(b-a)));f=f*f*(3-2*f)
            return x+(y-x)*f
    return stops[-1][1]

def AngleDistance(a,b):return (a-b+math.pi)%math.tau-math.pi

def Ridge(x,w):
    # A compressed cloth crease: narrow raised ridge and adjacent shallow valley.
    return math.exp(-(x/w)**2)-.48*math.exp(-((x-w*1.4)/(w*1.5))**2)

# Bottle follows the square body / circular neck proportions of the turnaround.
ix=.53;iy=.27;iz=.905
glass=inkGlass.node_tree.nodes.get('Principled BSDF')
glass.inputs['Base Color'].default_value=(.62,.29,.065,1)
glass.inputs['Roughness'].default_value=.16
glass.inputs['IOR'].default_value=1.51
glass.inputs['Transmission Weight'].default_value=.92
glass.inputs['Specular IOR Level'].default_value=.5
inkGlass.diffuse_color=(.62,.29,.065,1)
inkLiquid=Material('CommandRoomInkLiquid',(.003,.002,.001),.14)
lidMat=Material('CommandRoomInkLid',(.037,.025,.015),.39)
labelMat=Material('CommandRoomInkLabel',(.56,.44,.29),.97,'CommandRoomInkLabel',True)
profiles=[(0,.022,4),(.001,.027,4.8),(.003,.0295,5),(.006,.030,5),
 (.039,.030,5),(.043,.0285,4.5),(.046,.026,4),(.049,.020,2.7),
 (.051,.0165,2),(.054,.0165,2),(.055,.020,2),(.058,.020,2),(.059,.017,2)]
def BottleRing(z,r,power):
    return [(ix+r*math.copysign(abs(math.cos(i/96*math.tau))**(2/power),math.cos(i/96*math.tau)),
             iy+r*math.copysign(abs(math.sin(i/96*math.tau))**(2/power),math.sin(i/96*math.tau)),iz+z) for i in range(97)]
# Closed shell with an inner cavity and a real 3 mm glass foot.
inner=[(z,max(.001,r-.0018),p) for z,r,p in reversed(profiles[3:])]
inner.extend([(.004,.026,5),(.004,0,2)])
allProfiles=profiles+inner
verts=[p for z,r,power in allProfiles for p in BottleRing(z,r,power)]
uv=[(i/96,z*12) for z,r,power in allProfiles for i in range(97)]
faces=[(j*97+i,j*97+i+1,(j+1)*97+i+1,(j+1)*97+i) for j in range(len(allProfiles)-1) for i in range(96)]
faces.append(tuple(reversed(range(96))))
Mesh('InkBottleGlass',verts,faces,inkGlass,uv,True)
liquid=Cube('InkBottleLiquid',(ix,iy,iz+.022),(.055,.055,.034),inkLiquid,.005)
def Lid(u,v):
    a=u*math.tau
    r=.0188+.0008*math.sin(v*math.pi)**.3+.00032*math.cos(a*64)*math.sin(v*math.pi)**.2
    return (ix+r*math.cos(a),iy+r*math.sin(a),iz+.058+.013*v)
Surface('InkBottleLid',256,8,Lid,lidMat)
Surface('InkBottleLidTop',96,8,lambda u,v:(ix+.0188*(1-v)*math.cos(u*math.tau),iy+.0188*(1-v)*math.sin(u*math.tau),iz+.071+.0004*math.sin(v*math.pi/2)),lidMat)
for z in [.0588,.0702]:
    Curve('InkBottleLidLip',[(ix+.0194*math.cos(i/96*math.tau),iy+.0194*math.sin(i/96*math.tau),iz+z) for i in range(97)],.00025,lidMat)
def Label(u,v):
    x=(u-.5)*.045+.00035*math.sin(v*57)*(abs(u-.5)*2)**12
    z=.011+v*.028+.00025*math.sin(u*89)*(abs(v-.5)*2)**12
    # Conform to the fifth-power rounded square, including the curved corners.
    y=-.030*(1-(abs(x)/.030)**5)**.2-.00015
    return (ix+x,iy+y,iz+z)
Surface('InkBottleLabel',48,24,Label,labelMat,lambda u,v:(.022+.956*u,.025+.95*v))

# Cap: low, soft asymmetric crown. Local diagonal compression creases are
# concentrated between the rigid band and the sewn oval top, not periodic waves.
hx=.942;hy=-.092;hz=.907
capCreases=[(-2.96,.30,.010,.075,.43),(-2.43,.48,.013,.12,-.55),(-1.90,.22,.009,.07,.64),
 (-1.55,.58,.014,.10,-.32),(-1.12,.34,.012,.075,.62),(-.58,.62,.016,.12,-.38),
 (.03,.33,.008,.065,.43),(.47,.47,.012,.095,-.4),(1.16,.30,.009,.08,.7),
 (1.82,.60,.012,.10,-.5),(2.45,.43,.013,.10,.45)]
def Crown(t,a):
    top=.109+.009*math.sin(a*2+.4)+.0045*math.sin(a*5-.7)
    # The crown starts exactly on the band's irregular upper lip. A constant
    # lower ring cuts through that lip and creates alternating black slivers.
    joinRipple=.0018*noise.noise_vector(Vector((math.cos(a)*7,math.sin(a)*7,3)))[0]
    base=.057+.0025*math.sin(a*3+.3)
    rx=.148+joinRipple*(1-t)+.003*math.sin(math.pi*t)-.006*t
    ry=.133+joinRipple*(1-t)+.003*math.sin(math.pi*t)-.004*t
    fold=0
    for ca,ct,amp,w,slope in capCreases:
        d=AngleDistance(a,ca+slope*(t-ct))
        fold+=amp*1.10*Ridge(d,w)*math.exp(-((t-ct)/.42)**4)*math.sin(math.pi*t)**1.1
    # Long oblique sag between the stiff folded band and the crown panel.
    fold-=.006*Ridge(t-.40-.13*math.sin(a*2+.6),.10)*math.exp(-(AngleDistance(a,-1.7)/1.4)**4)
    fold+=.0028*noise.noise_vector(Vector((math.cos(a)*5,math.sin(a)*5,t*6)))[0]*math.sin(math.pi*t)
    return Vector((hx-.011*t+(rx+fold)*math.cos(a),hy+.009*t+(ry+fold)*math.sin(a),hz+base+(top-base)*math.sin(t*math.pi/2)))
Surface('CapSoftCrown',192,48,lambda u,v:Crown(v,u*math.tau),cloth,lambda u,v:(u*.91,v*.075))
def CapTop(u,v):
    a=u*math.tau;r=1-v
    edge=Crown(1,a);center=Vector((hx-.011,hy+.009,hz+.098))
    p=center.lerp(edge,r)
    # Buckled cloth panel, compressed along two diagonal crease paths.
    x=p.x-hx;y=p.y-hy
    weight=math.sin(math.pi*r)**1.25
    p.z+=(-.017*math.exp(-((x+.025)/.065)**2-((y-.012)/.072)**2))*weight
    # Independent bent compression ridges cross the panel; none radiates
    # from the pole, avoiding the previous star-shaped pinched top.
    for y0,amp,w,slope,xc,length in [(-.068,.011,.010,.30,-.025,.12),(-.014,.009,.013,-.42,.045,.09),(.049,.014,.012,.35,-.05,.10),(.088,-.008,.015,-.2,.005,.11)]:
        path=y-y0-slope*x-.24*x*x
        p.z+=amp*Ridge(path,w)*math.exp(-((x-xc)/length)**4)*weight
    p.z+=.003*noise.noise_vector(Vector((x*40,y*40,2.3)))[0]*weight
    return p
Surface('CapSoftTop',192,40,CapTop,cloth,lambda u,v:(.5+(1-v)*math.cos(u*math.tau)*.15,.5+(1-v)*math.sin(u*math.tau)*.14))
def Band(u,v):
    a=u*math.tau
    ripple=.0018*noise.noise_vector(Vector((math.cos(a)*7,math.sin(a)*7,v*3)))[0]
    ripple+=.0020*Ridge(v-.40-.17*math.sin(a*4+.5),.17)*math.sin(math.pi*v)
    return Vector((hx+(.148+ripple)*math.cos(a),hy+(.133+ripple)*math.sin(a),hz+.003+v*.054+.0025*math.sin(a*3+.3)))
Shell(Surface('CapFoldedBand',160,16,Band,cloth,lambda u,v:(u*.91,v*.05)),.002)
def Visor(u,v):
    a=math.pi*1.09+u*math.pi*.82
    extent=math.sin(u*math.pi)**.65
    p=Band(a/math.tau,0)
    p.x+=.065*v*extent*1.1*math.cos(a);p.y+=.065*v*extent*math.sin(a)
    p.z+=-.002*v+.0025*math.sin(u*12+.4)*v
    return p
Shell(Surface('CapCurvedVisor',96,24,Visor,cloth,lambda u,v:(u*.30,v*.10),reverse=True),.0024)
Curve('CapVisorBinding',[Visor(i/144,1) for i in range(145)],.0008,thread)
for v in [.16,.30,.44,.58,.72,.86]:
    Curve('CapVisorSewnLine',[Visor(i/144,v)+Vector((0,0,.00030)) for i in range(145)],.00016,thread)
for t in [0,1]:Curve('CapCrownPiping',[Crown(t,i/192*math.tau) for i in range(193)],.00065,thread)
for v in [.09,.91]:Curve('CapBandStitch',[Band(i/160,v)+Vector((math.cos(i/160*math.tau)*.0006,math.sin(i/160*math.tau)*.0006,0)) for i in range(161)],.00028,thread)
for a in [-math.pi/2,math.pi/2,math.pi]:Curve('CapPanelSeam',[Crown(i/64,a)+Vector((math.cos(a)*.0006,math.sin(a)*.0006,0)) for i in range(65)],.00034,thread)
for z in [.018,.043]:Button('CapSewnButton',(hx,hy-.135,hz+z),.008)

# Coat proportions and tailoring correspond to the front/back reference.
coatx=-.35;coaty=1.23;coatTop=2.655;coatLength=1.28
Cube('CoatRack',(coatx,1.405,2.72),(.48,.044,.075),wood,.006)
Curve('CoatHook',[(coatx,1.4,2.73),(coatx,1.26,2.73),(coatx,1.215,2.77),(coatx,1.22,2.80)],.008,iron)
Curve('CoatHangingLoop',[(coatx-.022,coaty,coatTop-.005),(coatx-.025,coaty+.016,coatTop+.060),
    (coatx-.018,coaty+.016,coatTop+.100),(coatx+.010,coaty+.016,coatTop+.112),
    (coatx+.025,coaty+.016,coatTop+.074),(coatx+.022,coaty,coatTop-.005)],.0045,cloth)
def Body(t,a):
    width=SmoothProfile(t,[(0,.063),(.10,.227),(.27,.217),(.51,.226),(1,.258)])
    depth=SmoothProfile(t,[(0,.046),(.15,.075),(.48,.066),(1,.073)])
    folds=0
    for ca,amp,w,slope in [(-2.75,.013,.17,.09),(-2.2,.018,.20,-.16),(-1.80,.011,.15,.1),
      (-1.26,.015,.18,.12),(-.76,.018,.16,-.13),(-.25,.012,.18,.17),(.40,.011,.2,-.10),
      (.9,.015,.17,.13),(1.45,.016,.19,-.18),(2.05,.014,.16,.16),(2.65,.012,.19,-.1)]:
        folds+=amp*1.75*Ridge(AngleDistance(a,ca+slope*t+.09*math.sin(t*6+ca)),w)*(.40+.60*t)
    # Diagonal shoulder drag lines soften into long gravity folds below the waist.
    folds+=.011*Ridge(t-.16-.065*math.cos(a*3+.3),.021)*math.exp(-((t-.15)/.15)**2)
    folds+=.004*noise.noise_vector(Vector((math.cos(a)*8,math.sin(a)*8,t*9)))[0]
    # Fabric hangs from the narrow neck: two broad off-center front folds and
    # local diagonal tension at pocket attachments, not a filled torso.
    folds+=.012*Ridge(AngleDistance(a,-1.13-.19*t),.11)*math.sin(math.pi*t)**.5
    folds-=.011*Ridge(t-.55-.06*math.cos(a*2),.026)*math.exp(-(AngleDistance(a,-1.3)/.9)**4)
    return Vector((coatx-.028*t+(width+folds)*math.cos(a),coaty+(depth+folds)*math.sin(a),coatTop-coatLength*t+.017*math.sin(a*3+.7)*t**5+.007*math.cos(a)*t))
def BodyAngle(u,t):
    gap=.007+.48*max(0,1-t/.16)+.10*max(0,(t-.67)/.33)
    return -math.pi/2+gap+u*(math.tau-2*gap)
Shell(Surface('CoatTailoredBody',160,120,lambda u,v:Body(v,BodyAngle(u,v)),cloth,lambda u,v:(u*1.1,v*1.28),reverse=True),.003)
def Front(t):return Body(t,-math.pi/2)
for u in [0,1]:
    Curve('CoatFrontEdge',[Body(i/120,BodyAngle(u,i/120))+Vector((0,-.0012,0)) for i in range(121)],.0012,thread)
    Curve('CoatPlacketStitch',[Body(i/120,BodyAngle(u,i/120))+Vector((.008 if u==0 else -.008,-.002,0)) for i in range(8,121)],.00038,thread)
# Wide overlapping front button placket, extending only as far as the skirt split.
def Placket(u,v):
    t=.14+v*.59;p=Front(t);p.x+=(u-.5)*.034;p.y-=.003+.002*math.sin(u*math.pi);return p
Shell(Surface('CoatOverlapPlacket',12,64,Placket,cloth,lambda u,v:(u*.04,v*.78),reverse=True),.002)
for t in [.155,.265,.38,.49,.60]:
    p=Front(t)+Vector((.003,-.006,0));Button('CoatSewnButton',p,.0118)
    Curve('CoatButtonhole',[p+Vector((.014,-.001,0)),p+Vector((.030,-.001,0))],.00055,graphite)
Curve('CoatHemBinding',[Body(.997,BodyAngle(i/180,.997)) for i in range(181)],.0014,thread)
Curve('CoatHemStitch',[Body(.975,BodyAngle(i/180,.975)) for i in range(181)],.00040,thread)
Curve('CoatBackSeam',[Body(i/120,math.pi/2)+Vector((0,.0015,0)) for i in range(121)],.0005,thread)
# Separate left/right folded collar leaves; strong triangular points are essential.
def Collar(side,u,v):
    inner=Vector((coatx+side*(.035+.040*u),coaty-.090+.165*u,coatTop-.09*(1-u)+.025*math.sin(u*math.pi)))
    outer=Vector((coatx+side*(.122+.015*math.sin(u*math.pi)-.048*u),coaty-.133+.208*u,coatTop-.17*(1-u)**1.4-.026*u))
    p=inner.lerp(outer,v);p.y-=.010*math.sin(v*math.pi);p.z+=.009*math.sin(v*math.pi)*math.sin(u*math.pi)
    return p
for side in [-1,1]:
    Shell(Surface('CoatPointedCollar',36,24,lambda u,v,s=side:Collar(s,u,v),cloth,lambda u,v:(u*.20,v*.17),reverse=side>0),.004)
    Curve('CoatCollarStitch',[Collar(side,i/72,.94)+Vector((0,-.001,.001)) for i in range(73)],.0004,thread)
    Curve('CoatCollarPointStitch',[Collar(side,.025,i/36)+Vector((0,-.001,.001)) for i in range(37)],.0004,thread)
def Sleeve(side,t,a):
    c=Vector((coatx+side*(.189+.128*t+.018*math.sin(t*math.pi))-.018*t,
        coaty-.015-.065*t-.021*math.sin(math.pi*t)+side*.014*t,coatTop-.125-(.742+side*.011)*t))
    radius=SmoothProfile(t,[(0,.016),(.075,.078),(.25,.067),(.54,.064),(1,.053)])
    fold=0
    # Each elbow crease occupies only part of the sleeve circumference. The
    # staggered chevrons cannot turn into the old stacked ring/accordion shape.
    for ct,amp,slope,ca,spread in [(.33,.019,.09,-1.9,.90),(.47,-.019,-.15,-.82,.83),(.55,.024,.12,-1.6,1.0),(.65,-.015,-.13,-2.1,.8),(.75,.011,.08,-.4,.7)]:
        fold+=amp*Ridge(t-ct-side*.012-slope*math.cos(a+side*.5),.027)*math.exp(-(AngleDistance(a,ca+side*.24)/spread)**4)
    for ca in [-2.3,-1.0,.3,1.9]:
        fold+=.007*Ridge(AngleDistance(a,ca+.16*math.sin(t*5+ca)),.22)*math.sin(math.pi*t)**.6
    fold+=.0025*noise.noise_vector(Vector((math.cos(a)*4,math.sin(a)*4,t*8)))[0]
    return c+Vector(((radius+fold)*math.cos(a),(radius*.77+fold)*math.sin(a),.030*side*math.cos(a)*(1-t)**3))
for side in [-1,1]:
    Shell(Surface('CoatTailoredSleeve',88,92,lambda u,v,s=side:Sleeve(s,v,u*math.tau),cloth,lambda u,v:(u*.50,v*.75),reverse=True),.003)
    for t in [.025,.954,1]:Curve('CoatSleeveSeam',[Sleeve(side,t,i/100*math.tau) for i in range(101)],.0012 if t==1 else .00040,thread)
    Curve('CoatSleeveLongSeam',[Sleeve(side,i/96,math.pi*1.3) for i in range(97)],.00045,thread)
for side in [-1,1]:
    def Pocket(u,v,side=side):
        t=.545+.207*v
        xoffset=side*.146+(u-.5)*.148
        a=-math.pi/2+math.asin(xoffset/.245)
        p=Body(t,a);p.y-=.006+.005*math.sin(u*math.pi)*math.sin(v*math.pi)
        return p
    Shell(Surface('CoatPatchPocket',36,38,Pocket,cloth,lambda u,v:(u*.15,v*.265),reverse=True),.002)
    for u in [.035,.965]:Curve('CoatPocketStitch',[Pocket(u,i/48)+Vector((0,-.001,0)) for i in range(49)],.00040,thread)
    Curve('CoatPocketBottomStitch',[Pocket(i/48,.97)+Vector((0,-.001,0)) for i in range(49)],.00040,thread)
    def Flap(u,v):
        p=Pocket(u,v*.23);p.y-=.004+.008*math.sin(v*math.pi*.6);p.z+=.006;return p
    Shell(Surface('CoatPocketFlap',36,14,Flap,cloth,lambda u,v:(u*.15,v*.062),reverse=True),.003)
    Curve('CoatFlapStitch',[Flap(i/48,.92)+Vector((0,-.001,0)) for i in range(49)],.00040,thread)
def Belt(u,v):
    p=Body(.445+v*.045,math.pi/2+(u-.5)*1.0);p.y+=.005;return p
Shell(Surface('CoatRearBelt',48,10,Belt,cloth,lambda u,v:(u*.23,v*.06),reverse=True),.003)
for u in [.12,.88]:Button('CoatBeltButton',Belt(u,.5)+Vector((0,.003,0)),.01,(0,1,0))

# Diffuse wear is stored in vertex colour, independent of light/shadow baking.
# This gives each panel broad irregular fading without repeating painted folds.
for ob in list(scene.objects):
    if ob.type!='MESH' or not ob.name.startswith(('Cap','Coat')) or ob.data.materials[0]!=cloth:continue
    colors=ob.data.color_attributes.new(name='ClothWear',type='FLOAT_COLOR',domain='POINT')
    for v in ob.data.vertices:
        p=ob.matrix_world@v.co
        n=noise.multi_fractal(p*19,1.0,2.1,3)
        small=noise.noise_vector(p*155)[0]
        fade=.82+.34*n+.04*small
        colors.data[v.index].color=(fade,fade,fade,1)
