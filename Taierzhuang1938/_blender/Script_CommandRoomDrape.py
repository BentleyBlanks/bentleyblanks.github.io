"""Art-directed empty garments, following the user's side-hung coat / crushed cap.

Metres, Blender Z up. Broad structural drape is geometry; weave is a PBR tile.
The coat is gathered at one hook, with a collapsed torso and hollow open sleeves.
"""
hx=.942;hy=-.092;hz=.907
capCloth=Material('CommandRoomCapCloth',(.19,.17,.14),.96,'CommandRoomCapCloth')

def Band(u,v):
    a=u*math.tau
    roll=.0038*math.sin(math.pi*v)+.003*Ridge(v-.47-.12*math.sin(a*3),.2)*math.sin(math.pi*v)
    # A stitched folded band retains more structure than the collapsed crown.
    rx=.146+roll+.002*math.sin(3*a+.4);ry=.131+roll+.0025*math.cos(2*a-.5)
    return Vector((hx+rx*math.cos(a),hy+ry*math.sin(a),hz+.003+.047*v+.002*math.sin(3*a+.4)))

def CapEdge(a):
    # Unequal high lobes and a deep front-left compression, no level top seam.
    x=hx-.011+(.131+.007*math.sin(a*3+.4))*math.cos(a)
    y=hy+.010+(.113+.006*math.cos(a*2))*math.sin(a)
    z=hz+.123+.017*math.sin(a*2-.5)+.012*math.cos(a*3+.8)
    z-=.026*math.exp(-(AngleDistance(a,-2.2)/.40)**2)
    return Vector((x,y,z))

def Crown(t,a):
    p=Band(a/math.tau,1).lerp(CapEdge(a),t)
    # Shoulder overhang and diagonal folds connect the band to the buckled top.
    radial=.012*math.sin(math.pi*t)
    for ca,ct,amp,angleWidth,slope in [(-2.25,.51,.024,.16,-.8),(-1.30,.63,-.016,.20,.5),
        (-.35,.50,.020,.23,-.65),(.5,.50,-.011,.24,.6),(1.55,.60,.014,.23,-.4),(2.7,.4,-.018,.22,.55)]:
        radial+=amp*Ridge(AngleDistance(a,ca+slope*(t-ct)),angleWidth)*math.sin(math.pi*t)**.9
    p+=Vector((math.cos(a)*radial,math.sin(a)*radial,0))
    p.z+=.005*math.sin(a*3+t*4)*math.sin(math.pi*t)
    return p

def CapTop(u,v):
    a=u*math.tau;r=1-v
    center=Vector((hx-.030,hy+.005,hz+.101))
    p=center.lerp(CapEdge(a),r)
    x=p.x-hx;y=p.y-hy
    # Large soft valleys buckle the top instead of decorative small ripples.
    w=max(0,1-r*r)
    p.z-=.025*math.exp(-((x+.035)/.043)**2-((y+.015)/.063)**2)*w
    for y0,amp,width,slope,xc,length in [(-.055,.031,.018,.36,-.035,.095),
        (.021,.038,.019,-.55,.030,.085),(.069,.019,.014,.25,-.055,.080)]:
        path=y-y0-slope*x-.6*x*x
        p.z+=amp*Ridge(path,width)*math.exp(-((x-xc)/length)**4)*w
    p.z+=.0011*noise.noise_vector(Vector((x*43,y*43,4)))[0]*w
    return p

Shell(Surface('CapFoldedBand',160,24,Band,capCloth,lambda u,v:(u*.89,v*.048)),.0022)
Surface('CapCrushedCrown',192,64,lambda u,v:Crown(v,u*math.tau),capCloth,lambda u,v:(u*.85,v*.09))
Surface('CapBuckledTop',192,64,CapTop,capCloth,lambda u,v:(.18+(1-v)*math.cos(u*math.tau)*.132,.2+(1-v)*math.sin(u*math.tau)*.118))

def Visor(u,v):
    a=math.pi*1.055+u*math.pi*.89
    extension=.057*math.sin(u*math.pi)**.7
    p=Band(a/math.tau,.03)
    p.x+=extension*v*1.06*math.cos(a);p.y+=extension*v*math.sin(a)
    p.z-=.009*v*math.sin(u*math.pi)**2+.005*math.sin(v*math.pi)
    p.z+=.002*math.sin(u*8+.2)*v
    return p

Shell(Surface('CapCurvedVisor',112,28,Visor,capCloth,lambda u,v:(u*.32,v*.075),reverse=True),.0026)
Curve('CapVisorBinding',[Visor(i/160,1) for i in range(161)],.0009,thread)
for v in [.15,.31,.47,.63,.79,.94]:
    Curve('CapVisorSewnLine',[Visor(i/160,v)+Vector((0,0,.00032)) for i in range(161)],.00019,thread)
for t in [0,1]:Curve('CapCrownPiping',[Crown(t,i/224*math.tau) for i in range(225)],.00048,thread)
for v in [.08,.91]:Curve('CapBandStitch',[Band(i/192,v)+Vector((math.cos(i/192*math.tau)*.00045,math.sin(i/192*math.tau)*.00045,0)) for i in range(193)],.00024,thread)
for a in [-math.pi/2,math.pi/2]:Curve('CapPanelSeam',[Crown(i/96,a)+Vector((math.cos(a)*.0005,math.sin(a)*.0005,0)) for i in range(97)],.0003,thread)
for z in [.015,.038]:Button('CapSewnButton',(hx,hy-.135,hz+z),.0085)

coatx=-.35;coaty=1.23;coatTop=2.655;coatLength=1.32
Cube('CoatRack',(coatx,1.405,2.72),(.48,.044,.075),wood,.006)
Curve('CoatHook',[(coatx,1.4,2.73),(coatx,1.26,2.73),(coatx,1.215,2.77),(coatx,1.22,2.80)],.008,iron)
Curve('CoatHangingLoop',[(coatx-.018,coaty-.005,coatTop-.016),(coatx-.024,coaty+.016,coatTop+.060),
    (coatx-.015,coaty+.016,coatTop+.109),(coatx+.012,coaty+.016,coatTop+.116),
    (coatx+.023,coaty+.014,coatTop+.064),(coatx+.018,coaty-.004,coatTop-.016)],.0042,cloth)

def DrapeBody(t,a):
    # Width grows from the actual attachment, without square padded shoulders.
    width=SmoothProfile(t,[(0,.027),(.12,.086),(.32,.159),(.65,.202),(1,.215)])
    depth=SmoothProfile(t,[(0,.018),(.16,.044),(.45,.059),(1,.061)])
    # Side-on front opening winds out of sight. The visible back is one long
    # gravity-draped panel with unequal deep folds emanating from the hook.
    folds=0
    for ca,amp,w,slope in [(-2.80,.026,.22,.32),(-2.15,-.025,.29,-.17),
        (-1.72,.041,.28,.30),(-.92,-.029,.27,-.25),(-.30,.024,.25,.19),
        (.52,.025,.22,.12),(1.18,-.023,.29,-.13),(2.1,.035,.28,-.24)]:
        folds+=amp*Ridge(AngleDistance(a,ca+slope*t+.09*math.sin(t*6+ca)),w)*math.sin(min(1,t/.28)*math.pi/2)
    folds+=.0024*noise.noise_vector(Vector((math.cos(a)*7,math.sin(a)*7,t*8)))[0]*t
    x=(width+folds)*math.cos(a);y=(depth+folds)*math.sin(a)
    angle=math.radians(61)+.16*math.sin(t*math.pi)
    p=Vector((coatx+.006+.018*t+x*math.cos(angle)-y*math.sin(angle),
        coaty-.012-.054*t+x*math.sin(angle)+y*math.cos(angle),
        coatTop-coatLength*t+.055*math.sin(a*2+.8)*t**4+.023*math.cos(a-.5)*t))
    # The empty lower body compresses towards the wall, keeping its folds
    # behind the chair crest instead of occupying a person's torso volume.
    flatten=SmoothProfile(t,[(0,0),(.25,0),(.65,1),(1,1)])
    p.y=coaty+(p.y-coaty)*(1-.30*flatten)+.028*flatten
    return p

def DrapeAngle(u,t):
    gap=.08+.34*t*t
    return -math.pi/2+gap+u*(math.tau-2*gap)

Shell(Surface('CoatGatheredBody',160,144,lambda u,v:DrapeBody(v,DrapeAngle(u,v)),cloth,lambda u,v:(u*.92,v*1.32),reverse=True),.0032)
for u in [0,1]:
    Curve('CoatOpenFrontEdge',[DrapeBody(i/144,DrapeAngle(u,i/144)) for i in range(145)],.0015,thread)
    Curve('CoatOpenFrontStitch',[DrapeBody(i/144,DrapeAngle(u,i/144)+(.025 if u==0 else -.025)) for i in range(16,145)],.00038,thread)
Curve('CoatUnevenHem',[DrapeBody(.998,DrapeAngle(i/192,.998)) for i in range(193)],.0015,thread)
Curve('CoatBackSeam',[DrapeBody(i/144,math.pi/2) for i in range(145)],.00045,thread)

# A small folded collar lies against the gathered neck, turned away from camera.
def FoldedCollar(u,v):
    a=-1.1+u*4.7
    p=DrapeBody(.055+.085*v,a)
    p+=Vector((.008*math.sin(a)*v,-.013*math.sin(v*math.pi),.009*math.sin(u*math.pi)*v))
    return p
Shell(Surface('CoatFoldedCollar',72,22,FoldedCollar,cloth,lambda u,v:(u*.3,v*.13),reverse=True),.004)
Curve('CoatCollarStitch',[FoldedCollar(i/96,1) for i in range(97)],.00045,thread)

def SleeveCenter(side,t):
    if side<0:
        return Vector((coatx-.025-.172*t-.047*math.sin(math.pi*t),
            coaty-.058-.187*t**1.5-.09*t**6,coatTop-.17-.70*t+.065*t**6))
    return Vector((coatx+.018+.121*t+.026*math.sin(math.pi*t),
        coaty+.018-.020*t,coatTop-.22-.875*t))

def HangingSleeve(side,t,a):
    c=SleeveCenter(side,t)
    tangent=(SleeveCenter(side,min(1,t+.002))-SleeveCenter(side,max(0,t-.002))).normalized()
    axis=Vector((1,0,0));axis=(axis-tangent*axis.dot(tangent)).normalized()
    other=tangent.cross(axis).normalized()
    radius=SmoothProfile(t,[(0,.030),(.15,.075),(.48,.079),(.76,.067),(1,.076 if side<0 else .063)])
    depth=radius*(.54+.13*t*t)
    fold=0
    for ca,amp,w,slope in [(-2.4,.013,.28,.31),(-1.25,-.014,.23,-.20),(-.62,.018,.31,.18),(1.1,.011,.3,-.25)]:
        fold+=amp*Ridge(AngleDistance(a,ca+slope*t),w)*math.sin(math.pi*min(.95,t+.03))**.5
    # Very broad, localized elbow drag, not accordion-shaped concentric rings.
    fold+=.012*Ridge(t-.51-.12*math.cos(a),.062)*math.exp(-(AngleDistance(a,-1.3)/1.0)**4)
    fold-=.010*Ridge(t-.72+.07*math.sin(a),.052)*math.exp(-(AngleDistance(a,-2.1)/.8)**4)
    p=c+axis*((radius+fold)*math.cos(a))+other*((depth+fold)*math.sin(a))
    p.z+=.017*math.sin(a*2+.7)*t**8
    return p

for side in [-1,1]:
    Shell(Surface('CoatEmptySleeve',96,112,lambda u,v,s=side:HangingSleeve(s,v,u*math.tau),cloth,lambda u,v:(u*.47,v*.86),reverse=True),.0035)
    for t in [.96,1]:Curve('CoatCuffBinding',[HangingSleeve(side,t,i/128*math.tau) for i in range(129)],.0014 if t==1 else .00045,thread)
    Curve('CoatSleeveLongSeam',[HangingSleeve(side,i/128,1.7) for i in range(129)],.00045,thread)
    # A turned-back hem gives the cuff real visible inner depth.
    def Cuff(u,v,s=side):
        p=HangingSleeve(s,1-v*.052,u*math.tau)
        center=SleeveCenter(s,1-v*.052)
        return center+(p-center)*(.966-.020*v)
    Surface('CoatCuffInnerFold',96,10,Cuff,cloth,lambda u,v:(u*.47,.89+v*.043))

# One partially hidden button and pocket edge on the turned-away front tell
# the garment's construction without restoring the old dress-form silhouette.
for t in [.35,.49,.64]:
    p=DrapeBody(t,DrapeAngle(0,t)+.03)
    Button('CoatSideButton',p+Vector((.003,-.002,0)),.010,(.87,-.5,0))
