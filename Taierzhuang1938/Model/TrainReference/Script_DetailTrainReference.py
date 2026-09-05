"""Detail pass executed in the builder namespace, before rigid consolidation.
All dimensions in metres. Fittings follow the supplied inferred design.
"""
def Rivet(center,axis,parent,radius=.016):
    # Low hemispherical head: avoid the oversized bright hexagons of the blockout.
    rotation={'X':Matrix.Rotation(math.pi/2,3,'Y'),'Y':Matrix.Rotation(math.pi/2,3,'X'),'Z':Matrix.Identity(3)}[axis]
    vertices=[]
    for h,r in [(-.008,radius),(.002,radius),(.010,radius*.65)]:
        for i in range(6): vertices.append(rotation @ Vector((r*math.cos(i*math.tau/6),r*math.sin(i*math.tau/6),h))+Vector(center))
    faces=[tuple(range(12,18))]+[(k*6+i,k*6+(i+1)%6,(k+1)*6+(i+1)%6,(k+1)*6+i) for k in range(2) for i in range(6)]
    return Mesh('Model_DomedRivet',vertices,faces,iron,parent)

def Handwheel(name,center,radius,axis,parent,material=steel):
    Ring(name,center,radius,radius-.014,.018,axis,material,parent,20)
    Cylinder(name+'Hub',center,.034,.048,axis,material,parent,12)
    for i in range(4):
        a=i*math.tau/4; offset={'X':(0,radius*math.cos(a),radius*math.sin(a)),'Y':(radius*math.cos(a),0,radius*math.sin(a)),'Z':(radius*math.cos(a),radius*math.sin(a),0)}[axis]
        Bar(name+'Spoke',center,Vector(center)+Vector(offset),.013,.013,material,parent)

def Flange(name,center,radius,axis,parent,material=iron):
    Cylinder(name,center,radius,.045,axis,material,parent,20)
    for j in range(6):
        a=j*math.tau/6
        dx,dy,dz={'X':(.028,radius*.78*math.cos(a),radius*.78*math.sin(a)),'Y':(radius*.78*math.cos(a),.028,radius*.78*math.sin(a)),'Z':(radius*.78*math.cos(a),radius*.78*math.sin(a),.028)}[axis]
        Bolt(name+'Stud',(center[0]+dx,center[1]+dy,center[2]+dz),axis,parent,.013)

activeCollection=locoCollection
# Boiler seams, saddle brackets, lapped sheets, washout fittings.
for x in [-3.18,-1.32,.65,2.76,4.22]:
    for j in range(23):
        a=-.36+j*(math.pi+.72)/22
        Rivet((x,.891*math.cos(a),2.62+.891*math.sin(a)),'X',loco,.014)
for side in [-1,1]:
    for x in [-2.85,-.7,1.4,3.75]:
        Box('Model_BoilerSaddle',(x,side*.49,1.71),(.16,.43,.47),black,loco,.025)
        for dx in [-.075,.075]: Bolt('Model_SaddleFootBolt',(x+dx,side*.66,1.52),'Z',loco,.023)
    for z in [2.22,2.54]:
        for x in [-3.25,-3.04,-2.82,-2.60]: Rivet((x,side*.873,z),'Y',loco,.014)
    for x in [-3.12,-2.62]:
        Flange('Model_WashoutPlug',(x,side*.856,2.53),.064,'Y',loco)
    # Feedwater, injector and air lines with flanged joints and pipe clamps.
    Pipe('Model_LowerFeedwaterPipe',[(-5.1,side*.97,1.28),(-4.9,side*1.02,1.1),(-4.32,side*1.02,1.1),(-4.12,side*1.06,1.33),(-3.2,side*1.07,1.49),(-3.02,side*1.07,1.98),(-2.80,side*1.01,2.06),(2.8,side*1.01,2.06),(3.13,side*.87,2.3)],.032,iron,loco)
    Pipe('Model_UpperServicePipe',[(-3.52,side*.77,2.98),(-3.27,side*.91,2.93),(-1.3,side*.92,2.93),(-1.1,side*.94,2.7),(3.7,side*.94,2.7),(3.96,side*.72,2.51)],.022,iron,loco)
    Pipe('Model_AirBrakePipe',[(-5.54,side*.97,1.44),(-4.55,side*.98,1.44),(-4.27,side*.97,1.56),(4.2,side*.97,1.56),(4.45,side*.77,1.4),(5.95,side*.7,1.4)],.018,steel,loco)
    for x in [-2.65,-1.1,.7,2.55]:
        Flange('Model_FeedwaterUnion',(x,side*1.01,2.06),.053,'X',loco)
        for z,y in [(2.93,.92),(2.06,1.01)]:
            Box('Model_PipeClip',(x,side*y,z),(.048,.078,.10),iron,loco,.006)
    Cylinder('Model_InjectorBody',(-4.12,side*1.08,1.44),.085,.36,'X',brass,loco,16)
    Flange('Model_InjectorFlange',(-4.29,side*1.08,1.44),.109,'X',loco)
    Pipe('Model_InjectorSteam',[(-3.32,side*.67,3.43),(-3.48,side*.99,3.25),(-3.48,side*1.06,2.14),(-4.12,side*1.08,1.58)],.018,brass,loco)
    Handwheel('Model_InjectorValve',(-4.13,side*1.13,1.61),.075,'Y',loco,brass)
    # Sand delivery terminates ahead of the tread without entering its swept volume.
    for sourceX,targetX in [(2.65,2.98),(.2,-.2)]:
        Pipe('Model_SandDelivery',[(sourceX,side*.32,3.55),(sourceX+.08,side*.70,3.21),(sourceX+.12,side*.97,2.45),(sourceX+.16,side*1.00,1.54),(targetX,side*.98,.33),(targetX,side*.78,.10)],.017,iron,loco)
    # Flat spring packs have clamps, equalizer pivots, and fixed hangers.
    for x in driverXs:
        Box('Model_SpringCenterStrap',(x,side*.55,1.37),(.105,.15,.19),iron,loco,.008)
        for dx in [-.51,.51]:
            Bar('Model_SuspensionHanger',(x+dx,side*.57,1.39),(x+dx,side*.57,1.02),.055,.07,iron,loco)
            Cylinder('Model_SpringPivot',(x+dx,side*.62,1.05),.052,.065,'Y',steel,loco,12)
    # Braced running boards and visible end connections.
    for x in [-3.15,-1.55,.05,1.65,3.25,4.86]:
        Bar('Model_RunningBoardBrace',(x,side*.58,1.30),(x,side*1.2,1.69),.065,.06,iron,loco)
        Rivet((x,side*1.307,1.71),'Y',loco,.016)
    for i in range(45):
        x=-3.32+i*.194
        Box('Model_BoardTread',(x,side*1.07,1.827),(.065,.27,.009),black,loco)
    # Cylinder rear gland and drain cocks, feed pipe, and bolted steam chest lid.
    Flange('Model_RearCylinderCover',(4.285,side*1.17,.73),.275,'X',loco)
    Cylinder('Model_PistonGland',(4.225,side*1.17,.73),.099,.12,'X',steel,loco,20)
    for x in [4.48,5.2]:
        Cylinder('Model_CylinderDrainCock',(x,side*1.17,.402),.032,.13,'Z',brass,loco,12)
        Pipe('Model_DrainCockOutlet',[(x,side*1.17,.35),(x+.10,side*1.17,.31)],.015,iron,loco)
    Pipe('Model_DrainCockRod',[(4.44,side*1.30,.43),(5.24,side*1.30,.43)],.013,steel,loco)
    Box('Model_SteamChestCover',(4.90,side*1.17,1.228),(.91,.51,.043),iron,loco,.016)
    for x in [4.53,4.76,5.0,5.26]:
        for y in [side*1.17-.19,side*1.17+.19]: Bolt('Model_ChestCoverNut',(x,y,1.26),'Z',loco,.018)
    slider=bpy.data.objects['Model_Crosshead'+('Left' if side==1 else 'Right')]
    for z in [-.113,.113]: Box('Model_CrossheadGib',(0,0,z),(.31,.26,.039),steel,slider,.009)
    Cylinder('Model_CrossheadOilCup',(0,0,.17),.028,.071,'Z',brass,slider,12)
    for x in [3.24,4.35]:
        Box('Model_GuideBracket',(x,side*1.17,.94),(.10,.42,.1),iron,loco,.012)
        for y in [side*1.17-.15,side*1.17+.15]: Bolt('Model_GuideMountNut',(x,y,1.0),'Z',loco,.02)

# Duplex compressor: steam cylinder, ribbed pump cylinder and associated piping.
for side in [-1,1]:
    y=side*.99;x=-2.47
    Cylinder('Model_CompressorSteamCylinder',(x,y,2.20),.135,.31,'Z',iron,loco,20)
    Cylinder('Model_CompressorAirCylinder',(x,y,1.93),.115,.19,'Z',iron,loco,20)
    for z in [1.84,1.885,1.93,1.975,2.03,2.06,2.35]:
        Cylinder('Model_CompressorFin',(x,y,z),.149,.018,'Z',iron,loco,20)
    Cylinder('Model_CompressorPiston',(x,y,2.052),.039,.14,'Z',steel,loco,12)
    for dx in [-.10,.10]: Cylinder('Model_PumpTieRod',(x+dx,y,2.22),.012,.39,'Z',steel,loco,8)
    Pipe('Model_PumpSteamLine',[(x,y,2.39),(x,y,2.57),(-2.8,y,2.62),(-2.91,side*.69,3.25)],.021,iron,loco)
    Cylinder('Model_AirReservoir',(-3.6,side*.67,1.31),.155,.95,'X',iron,loco,24)
    for dx in [-.32,.32]: Ring('Model_ReservoirStrap',(-3.6+dx,side*.67,1.31),.164,.154,.055,'X',steel,loco,24)

# Cab window channels, hinges, rivet rows, vent hatch and functioning access openings.
for side in [-1,1]:
    y=side*1.26
    for x0,x1 in [(-5.36,-4.41),(-4.29,-3.56)]:
        for z in [2.73,3.48]: Box('Model_WindowChannel',((x0+x1)/2,y+side*.062,z),(x1-x0,.049,.041),steel,loco,.006)
        for x in [x0,x1]: Box('Model_WindowChannel',(x,y+side*.062,3.105),(.043,.048,.79),steel,loco,.006)
    for j in range(13):
        x=-5.36+j*.143
        for z in [1.98,2.56,3.57]: Rivet((x,y+side*.066,z),'Y',loco,.016)
    Box('Model_CabNumberPlate',(-4.61,y+side*.075,2.3),(.6,.025,.2),black,loco,.012)
    for x in [-4.86,-4.36]: Rivet((x,y+side*.096,2.30),'Y',loco,.013)
    for z in [1.17,1.52]:
        for j in range(5): Box('Model_CabStepTread',(-5.62+j*.068,side*1.17,z+.04),(.019,.40,.013),black,loco)
    Bar('Model_CabStepStringer',(-5.85,side*1.37,.84),(-5.31,side*1.37,1.83),.056,.065,iron,loco)
    Pipe('Model_CabRearRail',[(-5.62,side*1.22,1.93),(-5.75,side*1.22,2.8),(-5.64,side*.77,2.8),(-5.64,side*.77,1.94)],.025,iron,loco)
Box('Model_RoofVentBase',(-4.49,0,4.024),(.70,.79,.035),black,loco,.04)
Box('Model_RoofVentHatch',(-4.49,0,4.063),(.65,.73,.048),iron,loco,.03)
Pipe('Model_RoofVentHandle',[(-4.53,-.13,4.09),(-4.53,-.13,4.16),(-4.53,.13,4.16),(-4.53,.13,4.09)],.014,steel,loco)
for x in [-5.44,-3.49]:
    for j in range(13):
        y=-1.36+j*.227;z=3.73+.3*(1-(y/1.45)**2)+.006
        Rivet((x,y,z),'Z',loco,.014)
cabTimber=Material('Material_CabTimber',(.055,.042,.029),0,.87)
for y in [-.76,.76]:
    # Tiny cab seats do not justify embedding the entire gondola texture set.
    Box('Model_CabSeat',(-4.89,y,2.33),(.49,.39,.09),cabTimber,loco,.035)
    Cylinder('Model_SeatPedestal',(-4.89,y,2.11),.046,.39,'Z',iron,loco,12)
for y,z in [(-.53,2.73),(.53,2.73),(0,2.97)]:
    Handwheel('Model_BackheadValve',(-3.82,y,z),.10,'X',loco,brass)
    Pipe('Model_CabCopperPipe',[(-3.72,y,z),(-3.76,y,2.55),(-3.73,y*.5,2.14)],.018,brass,loco)
Box('Model_FireDoorLatch',(-3.77,.06,2.3),(.047,.42,.034),steel,loco,.009)
for y in [-.22,.22]: Bolt('Model_FireDoorHinge',(-3.77,y,2.29),'X',loco,.04)
# Lamps, braced bell mounting, safety valves and hollow chimney inner wall.
Bar('Model_BellBracket',(1.3,-.20,3.44),(1.3,-.20,3.92),.025,.027,iron,loco)
Pipe('Model_BellYoke',[(1.3,-.2,3.91),(1.3,0,3.99),(1.3,.2,3.91),(1.3,.2,3.45)],.024,iron,loco)
Cylinder('Model_BellClapper',(1.3,0,3.44),.035,.10,'Z',black,loco,12)
Pipe('Model_BellCord',[(1.3,-.2,3.91),(-3.47,-.32,3.68),(-3.74,-.35,3.25)],.006,black,loco)
for y in [-.12,.12]:
    Cylinder('Model_SafetyValve',(-2.0,y,3.94),.036,.15,'Z',brass,loco,12)
    Cylinder('Model_SafetyValveCap',(-2.0,y,4.02),.048,.03,'Z',brass,loco,12)
for y in [-.98,.98]:
    Box('Model_MarkerLampBracket',(5.95,y,1.43),(.13,.19,.08),iron,loco,.012)
    Cylinder('Model_MarkerLamp',(5.95,y,1.59),.068,.2,'Z',iron,loco,16)
    Cylinder('Model_MarkerGlass',(6.013,y,1.61),.041,.012,'X',ivory,loco,16)
Ring('Model_ChimneyInnerWall',(4.8,0,4.25),.251,.225,.29,'Z',black,loco,32)
for obj in list(locoCollection.objects):
    if obj.name.startswith('Model_ChimneyDarkMouth'):
        for v in obj.data.vertices: v.co.z-=.28
# Moving big ends retain oilers, wedge keys and split cotter ends on the rod pivots.
for record in rodRecords:
    rod=bpy.data.objects[record['name']]
    for x in [0,record['length']]:
        Cylinder('Model_BearingOilCup',(x,0,.145),.024,.061,'Z',brass,rod,10)
        Box('Model_BearingWedge',(x+.06,0,.015),(.034,.12,.15),iron,rod,.006)

activeCollection=wagonCollection
# U-channel side posts, inner angle brackets, end straps and real hinge barrels.
for side in [-1,1]:
    for x in [-4,-2.48,-.94,.94,2.48,4]:
        for dx in [-.082,.082]: Box('Model_StanchionFlange',(x+dx,side*1.50,1.89),(.026,.15,1.73),iron,wagon,.004)
        Box('Model_InnerPostStrap',(x,side*1.354,1.9),(.077,.031,1.64),iron,wagon)
        for z in [1.40,1.92,2.47]: Rivet((x,side*1.332,z),'Y',wagon,.014)
        for dx in [-.069,.069]: Rivet((x+dx,side*1.53,1.11),'Y',wagon,.017)
    for x in [-.78,.78]:
        for dx in [-.115,0,.115]: Cylinder('Model_HingeKnuckle',(x+dx,side*1.56,1.16),.05,.104,'X',iron,wagon,12)
        Cylinder('Model_HingePin',(x,side*1.56,1.16),.023,.40,'X',steel,wagon,12)
        Box('Model_DoorHingeLeaf',(x,side*1.538,1.34),(.17,.04,.35),iron,wagon,.009)
        for z in [1.3,1.45]: Rivet((x,side*1.568,z),'Y',wagon,.018)
        Box('Model_LatchKeeper',(x+(.17 if x<0 else -.17),side*1.62,1.82),(.1,.055,.19),iron,wagon,.012)
        Ring('Model_LatchSafetyLoop',(x,side*1.66,1.73),.037,.026,.012,'Y',steel,wagon,12)
    # More floor fasteners and shallow board checks rather than thick raised streaks.
    for x in [-3.78,-2.65,0,2.65,3.78]:
        for j in range(7): Rivet((x,side*(.1+j*.188),1.18),'Z',wagon,.013)
    for i in range(35):
        row=i%6; x=rng.uniform(-3.78,3.45);z=1.29+row*.246+rng.uniform(-.067,.067);length=rng.uniform(.08,.38)
        Mesh('Model_PlankSplit',[(x,side*1.478,z),(x+length*.45,side*1.479,z+.003),(x+length,side*1.478,z+.0005)],[(0,1,2)],black,wagon)
    # Diagonal axle guards, keeper plates and spring U bolts.
    for x in [-2.45,2.45]:
        for dx in [-.27,.27]:
            Bar('Model_WIronBrace',(x+dx,side*1.02,.88),(x+dx*.45,side*1.02,.38),.075,.08,iron,wagon)
            Rivet((x+dx,side*1.10,.86),'Y',wagon,.022)
        Box('Model_AxleboxKeeper',(x,side*1.03,.285),(.32,.08,.054),iron,wagon,.009)
        Box('Model_SpringSaddle',(x,side*.99,.75),(.20,.24,.063),iron,wagon,.012)
        for dx in [-.092,.092]:
            Pipe('Model_SpringUBolt',[(x+dx,side*.88,.55),(x+dx,side*.88,.80),(x+dx,side*1.1,.80),(x+dx,side*1.1,.55)],.014,steel,wagon)
            Bolt('Model_SpringClampNut',(x+dx,side*1.1,.56),'Z',wagon,.022)
        Box('Model_AxleboxOilLid',(x,side*1.115,.606),(.15,.19,.029),steel,wagon,.012)
        for dx in [-.09,.09]: Rivet((x+dx,side*1.125,.46),'Y',wagon,.016)
    # End post gussets: thin triangular plates, not solid blocks.
    for x in [-3.85,3.85]:
        direction=1 if x<0 else -1
        Mesh('Model_CornerGusset',[(x,side*1.535,1.02),(x+direction*.37,side*1.535,1.02),(x,side*1.535,1.36)],[(0,1,2)],iron,wagon)
        for dx,z in [(0,1.29),(.08,1.11),(.28,1.055)]: Rivet((x+direction*dx,side*1.548,z),'Y',wagon,.015)
for x in [-4.0,4.0]:
    direction=1 if x>0 else -1
    Box('Model_EndTopCap',(x,0,2.755),(.18,2.89,.055),iron,wagon,.008)
    for y in [-1.22,-.95,-.68,-.40,.40,.68,.95,1.22]: Rivet((x+direction*.105,y,1.0),'X',wagon,.02)
    Box('Model_CouplerWearPlate',(x+direction*.135,0,.965),(.047,.46,.36),steel,wagon,.018)
    for y in [-.19,.19]:
        for z in [.84,1.1]: Bolt('Model_DraftPlateBolt',(x+direction*.17,y,z),'X',wagon,.026)
    Cylinder('Model_KnucklePivot',(x+direction*.75,.045,.965),.04,.35,'Z',steel,wagon,12)
    Pipe('Model_UncouplingLever',[(x+direction*.23,-1.31,1.20),(x+direction*.23,-1.14,1.27),(x+direction*.23,-.35,1.27),(x+direction*.72,0,1.15)],.018,steel,wagon)
# Transverse brake beams, equalizing lever, rod clevises, reservoir and main air pipe.
for x in [-2.85,-2.04,2.04,2.85]:
    Box('Model_BrakeCrossBeam',(x,0,.46),(.068,1.6,.068),iron,wagon)
    for y in [-.57,.57]: Bolt('Model_BrakeBeamPin',(x,y,.51),'Z',wagon,.021)
Bar('Model_BrakeEqualizer',(-.2,-.6,.57),(.2,.6,.57),.066,.045,iron,wagon)
for x in [-2.04,2.04]:
    Bar('Model_BrakePullRod',(x,0,.5),(.15 if x>0 else -.15,.46 if x>0 else -.46,.57),.025,.025,steel,wagon)
Cylinder('Model_AirReservoir',(1.1,.3,.68),.145,.67,'X',iron,wagon,20)
Pipe('Model_MainBrakePipe',[(-4.26,-.32,.83),(4.28,-.32,.83)],.022,iron,wagon)
Pipe('Model_ReservoirBranch',[(1.35,-.32,.83),(1.35,.3,.83),(1.35,.3,.69)],.017,steel,wagon)
Box('Model_HandbrakeRatchetCase',(4.2,.68,1.23),(.15,.20,.25),iron,wagon,.02)
for j in range(10):
    a=j*math.tau/10
    Box('Model_HandbrakeRatchetTooth',(4.21,.68+.105*math.cos(a),1.23+.105*math.sin(a)),(.1,.028,.028),steel,wagon)
Pipe('Model_HandbrakePullRod',[(4.2,.68,1.11),(4.2,.68,.51),(3.78,.68,.51),(2.86,.4,.51)],.025,iron,wagon)
detailFeatures=['Tapered cast wheel spokes','Forged I-section rods and oil cups','Flat stacked leaf springs and suspension hangers','Feedwater injector, duplex compressor and air lines','Cylinder glands, chest bolts and drain cocks','Cab window channels, roof vent and controls','Gondola channel posts, working-shape hinge fittings and axle guards','Underframe brake beams and coupler release bars','Fixed-setting return crank, eccentric rod, rocker and valve slide']

# Closed four-bar drive + horizontal valve slider. This is the simplified
# fixed-setting model-engineering arrangement, not full Walschaerts lap/lead.
# Every displayed bar has a fixed length and its joints coincide in both directions.
activeCollection=locoCollection
valveRecords=[]
def LinkDriver(obj,path,index,expression,variables):
    fc=obj.driver_add(path,index)
    driver=fc.driver;driver.type='SCRIPTED';driver.expression=expression
    for name,(target,dataPath) in variables.items():
        var=driver.variables.new();var.name=name;var.type='SINGLE_PROP'
        var.targets[0].id=target;var.targets[0].data_path=dataPath

for side,sideName in [(-1,'Right'),(1,'Left')]:
    phase=0 if side==-1 else math.pi/2;y=side*1.34
    wheel=bpy.data.objects['Model_Driver2'+sideName]
    # Return crank is fixed to the main crank pin, offset a quarter turn at the axle.
    Bar('Model_ReturnCrank',(.32,side*.56,0),(0,side*.56,.18),.075,.055,steel,wheel)
    Cylinder('Model_ReturnCrankSpacer',(.32,side*.53,0),.061,.18,'Y',steel,wheel,16)
    Cylinder('Model_EccentricPin',(0,side*.56,.18),.037,.13,'Y',steel,wheel,16)
    point=Empty('Model_EccentricPoint'+sideName,activeCollection);point.parent=loco;point.location.y=y
    Driver(point,'location',0,f'.9+.18*sin(s/.73+{phase})',loco)
    Driver(point,'location',2,f'.73+.18*cos(s/.73+{phase})',loco)
    inputs={'ex':(point,'location[0]'),'ez':(point,'location[2]')}
    d=Empty('Model_ValveDistance'+sideName,activeCollection);d.parent=loco
    LinkDriver(d,'location',0,'sqrt((ex-2.77)**2+(ez-1.36)**2)',inputs)
    c=Empty('Model_ValveProjection'+sideName,activeCollection);c.parent=loco
    LinkDriver(c,'location',0,'(.32**2-1.91**2+d*d)/(2*d)',{'d':(d,'location[0]')})
    h=Empty('Model_ValveAltitude'+sideName,activeCollection);h.parent=loco
    LinkDriver(h,'location',0,'sqrt(max(0,.32**2-c*c))',{'c':(c,'location[0]')})
    variables={**inputs,'d':(d,'location[0]'),'c':(c,'location[0]'),'h':(h,'location[0]')}
    pin=Empty('Model_RockerPin'+sideName,activeCollection);pin.parent=loco;pin.location.y=y
    LinkDriver(pin,'location',0,'2.77+c*(ex-2.77)/d-h*(ez-1.36)/d',variables)
    LinkDriver(pin,'location',2,'1.36+c*(ez-1.36)/d+h*(ex-2.77)/d',variables)
    inputs={**inputs,'bx':(pin,'location[0]'),'bz':(pin,'location[2]')}
    eccentric=Empty('Model_EccentricRod'+sideName,activeCollection);eccentric.parent=loco;eccentric.location.y=y
    RodSection(1.91,.055,.045,eccentric)
    for x in [0,1.91]: Ring('Model_EccentricBearing',(x,0,0),.060,.035,.064,'Y',steel,eccentric,16)
    LinkDriver(eccentric,'location',0,'ex',inputs);LinkDriver(eccentric,'location',2,'ez',inputs)
    LinkDriver(eccentric,'rotation_euler',1,'-atan2(bz-ez,bx-ex)',inputs)
    rocker=Empty('Model_ValveRocker'+sideName,activeCollection);rocker.parent=loco;rocker.location=(2.77,y,1.36)
    for dx in [-.044,.044]: Box('Model_ExpansionLinkCheek',(dx,0,-.02),(.031,.059,.73),steel,rocker,.012)
    for z in [-.35,0,.31]: Box('Model_ExpansionLinkBridge',(0,0,z),(.11,.062,.054),iron,rocker,.009)
    for z in [0,-.32]: Cylinder('Model_LinkPivot',(0,0,z),.048,.093,'Y',steel,rocker,14)
    LinkDriver(rocker,'rotation_euler',1,'-atan2(bx-2.77,1.36-bz)',inputs)
    Bar('Model_LinkSupport',(2.77,side*1.08,1.69),(2.77,y,1.36),.064,.083,iron,loco)
    # Radius pin is held at 55% of the rocker arm; no variable cutoff control.
    radiusPoint=Empty('Model_RadiusPin'+sideName,activeCollection);radiusPoint.parent=loco;radiusPoint.location.y=y
    LinkDriver(radiusPoint,'location',0,'2.77+.55*(bx-2.77)',inputs)
    LinkDriver(radiusPoint,'location',2,'1.36+.55*(bz-1.36)',inputs)
    radiusVars={'fx':(radiusPoint,'location[0]'),'fz':(radiusPoint,'location[2]')}
    stem=Empty('Model_ValveStem'+sideName,activeCollection);stem.parent=loco;stem.location.y=y;stem.location.z=1.13
    LinkDriver(stem,'location',0,'fx+sqrt(1.25**2-(1.13-fz)**2)',radiusVars)
    Cylinder('Model_ValveSpindle',(.29,0,0),.024,.58,'X',rim,stem,16)
    Cylinder('Model_ValveFork',(0,0,0),.046,.105,'Y',steel,stem,12)
    radiusRod=Empty('Model_RadiusRod'+sideName,activeCollection);radiusRod.parent=loco;radiusRod.location.y=y
    Box('Model_RadiusBar',(.625,0,0),(1.25,.040,.048),steel,radiusRod,.007)
    for x in [0,1.25]: Ring('Model_RadiusBearing',(x,0,0),.042,.024,.064,'Y',steel,radiusRod,12)
    LinkDriver(radiusRod,'location',0,'fx',radiusVars);LinkDriver(radiusRod,'location',2,'fz',radiusVars)
    LinkDriver(radiusRod,'rotation_euler',1,'-asin((1.13-fz)/1.25)',radiusVars)
    Cylinder('Model_ValveStemGuide',(4.37,y,1.13),.061,.18,'X',iron,loco,16)
    valveRecords.append({'side':side,'phase':phase,'eccentricRod':eccentric.name,'rocker':rocker.name,'radiusRod':radiusRod.name,'stem':stem.name,'eccentricLength':1.91,'rockerLength':.32,'radiusLength':1.25,'plane':1.34,'pivot':[2.77,1.36],'fixedSetting':.55})
