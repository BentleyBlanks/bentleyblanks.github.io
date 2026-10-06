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

coatPath=GAME/'_blender/Script_CommandRoomSimulatedCoat.py'
exec(compile(coatPath.read_text(encoding='utf-8'),str(coatPath),'exec'),globals())
