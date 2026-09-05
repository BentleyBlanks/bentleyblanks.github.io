"""Run through BlenderMCP execute_blender_code_for_cli in the dedicated blend.
Reference interpretation, not a documented locomotive class. Metres; +X forward,
+Y left; Z up. glTF export is +X forward, Y up; its wheel axis is local -Z.
"""
import bpy, math, json, random
from pathlib import Path
from mathutils import Vector, Matrix

assetDir = Path(bpy.data.filepath).parent
def Progress(message):
    with (assetDir/'Data_BuildProgress.txt').open('a',encoding='utf-8') as stream: stream.write(message+'\n')
Progress('Starting dedicated train build')
assert assetDir.name == 'TrainReference', 'Use the dedicated train project only'
bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
scene = bpy.context.scene
scene.name = 'Scene_TrainReferenceRig'
scene.unit_settings.system = 'METRIC'
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.render.threads_mode = 'FIXED'
scene.render.threads = 4
scene.render.resolution_x = 1600
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.fps = 30
scene.frame_end = 241
scene.world = bpy.data.worlds.new('Scene_StudioWorld')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.32,.37,.44,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .45
scene.view_settings.view_transform = 'AgX'
rng = random.Random(1938)

def Collection(name):
    collection = bpy.data.collections.new(name)
    scene.collection.children.link(collection)
    return collection

locoCollection = Collection('Model_Locomotive')
wagonCollection = Collection('Model_Gondola')
studioCollection = Collection('Scene_Studio')
referenceCollection = Collection('Scene_References')
activeCollection = locoCollection

def Mesh(name, vertices, faces, material, parent=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    activeCollection.objects.link(obj)
    if parent: obj.parent = parent
    return obj

def Empty(name, collection):
    obj = bpy.data.objects.new(name,None)
    collection.objects.link(obj)
    obj.empty_display_type = 'PLAIN_AXES'
    obj.empty_display_size = .35
    return obj

def Material(name, color, metal=0, rough=.65):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color,1)
    material.use_nodes = True
    bsdf=material.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(*color,1)
    bsdf.inputs['Metallic'].default_value=metal
    bsdf.inputs['Roughness'].default_value=rough
    return material

iron=Material('Material_AgedIron',(.063,.072,.073),.75,.59)
steel=Material('Material_WornSteel',(.27,.29,.28),.82,.36)
rim=Material('Material_PolishedWheelTread',(.38,.39,.37),.9,.29)
black=Material('Material_Soot',(.018,.021,.023),.3,.83)
rust=Material('Material_OxidizedEdges',(.18,.125,.075),.55,.75)
brass=Material('Material_AgedBrass',(.37,.25,.09),.76,.4)
glass=Material('Material_CabGlass',(.09,.16,.17),.3,.22)
ivory=Material('Material_StencilIvory',(.7,.67,.54),.1,.8)
woodMats=[Material('Material_WeatheredPlank'+str(i),(.145+i*.009,.124+i*.008,.09+i*.007),0,.89) for i in range(6)]
for material in [iron]+woodMats:
    nodes=material.node_tree.nodes; links=material.node_tree.links
    tex=nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=36 if material==iron else 5
    tex.inputs['Detail'].default_value=3
    coord=nodes.new('ShaderNodeTexCoord'); mapping=nodes.new('ShaderNodeVectorMath'); mapping.operation='MULTIPLY'
    mapping.inputs[1].default_value=(1,18,24) if material!=iron else (1,1,1)
    links.new(coord.outputs['Generated'],mapping.inputs[0]); links.new(mapping.outputs[0],tex.inputs['Vector'])
    bump=nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.19; bump.inputs['Distance'].default_value=.025 if material!=iron else .009
    links.new(tex.outputs['Fac'],bump.inputs['Height']); links.new(bump.outputs[0],nodes['Principled BSDF'].inputs['Normal'])

def Box(name, center, size, material=iron, parent=None, bevel=0):
    x,y,z=center; a,b,c=[v/2 for v in size]
    vertices=[(x+u*a,y+v*b,z+w*c) for u,v,w in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    obj=Mesh(name,vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],material,parent)
    if bevel:
        mod=obj.modifiers.new('SoftEdges','BEVEL'); mod.width=bevel; mod.segments=2
    return obj

def Cylinder(name, center, radius, length, axis='Z', material=iron, parent=None, segments=32, radiusTop=None):
    rotation={'Z':Matrix.Identity(3),'Y':Matrix.Rotation(math.pi/2,3,'X'),'X':Matrix.Rotation(math.pi/2,3,'Y')}[axis]
    vertices=[]
    for end in [-1,1]:
        r=radiusTop if end==1 and radiusTop is not None else radius
        for i in range(segments):
            v=rotation @ Vector((r*math.cos(i*math.tau/segments),r*math.sin(i*math.tau/segments),end*length/2)) + Vector(center)
            vertices.append(v)
    faces=[tuple(reversed(range(segments))),tuple(range(segments,2*segments))]
    faces += [(i,(i+1)%segments,(i+1)%segments+segments,i+segments) for i in range(segments)]
    obj=Mesh(name,vertices,faces,material,parent)
    for p in obj.data.polygons[2:]: p.use_smooth=True
    return obj

def Ring(name,center,outer,inner,width,axis='Y',material=steel,parent=None,segments=48):
    rotation={'Z':Matrix.Identity(3),'Y':Matrix.Rotation(math.pi/2,3,'X'),'X':Matrix.Rotation(math.pi/2,3,'Y')}[axis]
    vertices=[]
    for z,r in [(-width/2,outer),(width/2,outer),(-width/2,inner),(width/2,inner)]:
        for i in range(segments): vertices.append(rotation @ Vector((r*math.cos(i*math.tau/segments),r*math.sin(i*math.tau/segments),z))+Vector(center))
    faces=[]
    for a,b in [(0,1),(1,3),(3,2),(2,0)]:
        for i in range(segments):
            j=(i+1)%segments; faces.append((a*segments+i,a*segments+j,b*segments+j,b*segments+i))
    obj=Mesh(name,vertices,faces,material,parent)
    for p in obj.data.polygons: p.use_smooth=True
    return obj

def Bar(name,start,end,width,depth,material=steel,parent=None):
    a,b=Vector(start),Vector(end); delta=b-a
    obj=Box(name,(0,0,delta.length/2),(width,depth,delta.length),material,parent)
    obj.location=a
    obj.rotation_mode='QUATERNION'; obj.rotation_quaternion=delta.to_track_quat('Z','Y')
    return obj

def Pipe(name,points,radius=.024,material=iron,parent=None):
    curve=bpy.data.curves.new(name,'CURVE'); curve.dimensions='3D'; curve.bevel_depth=radius; curve.bevel_resolution=1; curve.resolution_u=2
    spline=curve.splines.new('POLY'); spline.points.add(len(points)-1)
    for p,co in zip(spline.points,points): p.co=(*co,1)
    obj=bpy.data.objects.new(name,curve); activeCollection.objects.link(obj); obj.parent=parent; curve.materials.append(material)
    return obj

def Bolt(name,center,axis='Y',parent=None,radius=.024):
    return Cylinder(name,center,radius,.025,axis,steel,parent,6)

def Driver(obj,path,index,expr,root):
    driver=obj.driver_add(path,index).driver
    driver.type='SCRIPTED'; driver.expression=expr
    var=driver.variables.new(); var.name='s'; var.type='SINGLE_PROP'; var.targets[0].id=root; var.targets[0].data_path='["TravelMeters"]'

loco=Empty('Model_LocomotiveRoot',locoCollection)
wagon=Empty('Model_GondolaRoot',wagonCollection)
for root in [loco,wagon]:
    root['TravelMeters']=0.0
    root.id_properties_ui('TravelMeters').update(description='Signed accumulated path distance in metres; drives wheel and rod geometry, independent of FPS',soft_min=-25,soft_max=25)
    root['ModelForward']='+X'; root['WheelAxisBlender']='+Y'; root['WheelAxisGltf']='-Z'
    for f,s in [(1,0),(91,5),(121,5),(211,0),(241,0)]:
        root['TravelMeters']=s; root.keyframe_insert(data_path='["TravelMeters"]',frame=f)
    Driver(root,'location',0,'s',root)
    for slot in root.animation_data.action.slots:
        for layer in root.animation_data.action.layers:
            for strip in layer.strips:
                bag=strip.channelbag(slot)
                if bag:
                    for fc in bag.fcurves:
                        for k in fc.keyframe_points: k.interpolation='LINEAR'
loco['Reference']='Texture_LocomotiveThreeView.png; inferred 2-10-0; no tender in reference'
loco['DriverRadiusMeters']=.73
loco['CrankRadiusMeters']=.32
loco['MainRodLengthMeters']=2.9
loco['RailGaugeMeters']=1.435
wagon['Reference']='Texture_GondolaThreeView.png; two fixed axles; no bogie steering'
wagon['WheelRadiusMeters']=.46
wagon.location.y=-5.3

# Static superstructure: boiler and smokebox, bands, doors and fine fittings.
Box('Model_LocomotiveFrame',(0,0,1.18),(11.7,1.16,.25),black,loco,.025)
for side in [-1,1]:
    Box('Model_MainFrameRail',(0,side*.53,.99),(10.9,.14,.48),iron,loco,.014)
    Box('Model_RunningBoard',(.3,side*1.04,1.76),(10.9,.50,.12),iron,loco,.025)
    Box('Model_RunningBoardEdge',(.3,side*1.28,1.71),(10.9,.045,.16),steel,loco)
Cylinder('Model_Boiler',(.45,0,2.62),.88,8.4,'X',iron,loco,64)
Cylinder('Model_Smokebox',(4.85,0,2.62),.9,1.35,'X',black,loco,64)
for x in [-3.55,-2.15,-.25,1.7,3.6,4.15,5.47]:
    Ring('Model_BoilerBand',(x,0,2.62),.902,.876,.06,'X',steel,loco,64)
    for j in range(18):
        a=j*math.tau/18
        Bolt('Model_BoilerRivet',(x+.038,.902*math.cos(a),2.62+.902*math.sin(a)),'X',loco,.018)
Cylinder('Model_SmokeboxDoor',(5.57,0,2.62),.77,.12,'X',iron,loco,64)
Ring('Model_SmokeboxDoorRim',(5.65,0,2.62),.73,.68,.065,'X',steel,loco,48)
for j in range(16):
    a=j*math.tau/16; Bolt('Model_DoorBolt',(5.7,.69*math.cos(a),2.62+.69*math.sin(a)),'X',loco,.034)
for z in [2.31,2.93]: Box('Model_DoorHinge',(5.76,-.41,z),(.075,.58,.075),steel,loco,.012)
Ring('Model_DoorHandle',(5.79,0,2.62),.18,.154,.028,'X',brass,loco,24)
for j in range(4):
    a=j*math.tau/4; Bar('Model_HandleSpoke',(5.8,0,2.62),(5.8,.17*math.cos(a),2.62+.17*math.sin(a)),.017,.017,brass,loco)
Cylinder('Model_ChimneyBase',(4.8,0,3.48),.4,.16,'Z',iron,loco,40)
Cylinder('Model_Chimney',(4.8,0,3.96),.26,.85,'Z',black,loco,40,.32)
Ring('Model_ChimneyLip',(4.8,0,4.405),.355,.25,.065,'Z',steel,loco,40)
Cylinder('Model_ChimneyDarkMouth',(4.8,0,4.37),.25,.012,'Z',black,loco,40)
for x,r,h in [(2.65,.37,.48),(.2,.44,.55),(-2.0,.28,.35)]:
    Cylinder('Model_DomeFlange',(x,0,3.43),r+.10,.09,'Z',steel,loco,40)
    Cylinder('Model_Dome',(x,0,3.48+h*.32),r,h*.64,'Z',iron,loco,40)
    vertices=[]
    for ringIndex in range(9):
        a=ringIndex*math.pi/16
        for j in range(40):
            t=j*math.tau/40; vertices.append((x+r*max(.001,math.cos(a))*math.cos(t),r*max(.001,math.cos(a))*math.sin(t),3.48+h*.64+r*.75*math.sin(a)))
    dome=Mesh('Model_RoundedDomeCap',vertices,[(k*40+j,k*40+(j+1)%40,(k+1)*40+(j+1)%40,(k+1)*40+j) for k in range(8) for j in range(40)],iron,loco)
    for polygon in dome.data.polygons: polygon.use_smooth=True
    Bolt('Model_DomeCapBolt',(x,0,3.48+h*.64+r*.75+.016),'Z',loco,.035)
Cylinder('Model_Whistle',(-2.9,-.26,3.72),.04,.45,'Z',brass,loco,16)
Cylinder('Model_Bell',(1.3,0,3.58),.15,.24,'Z',brass,loco,24,.045)
Cylinder('Model_HeadlightHousing',(5.47,0,3.66),.21,.38,'X',iron,loco,32)
Cylinder('Model_HeadlightLens',(5.67,0,3.66),.172,.015,'X',ivory,loco,32)
Ring('Model_HeadlightRim',(5.69,0,3.66),.212,.177,.035,'X',steel,loco,32)
for side in [-1,1]:
    Pipe('Model_BoilerHandrail',[(5.36,side*.69,3.18),(4.8,side*.86,3.19),(-3.7,side*.86,3.19)],.023,steel,loco)
    Pipe('Model_SteamPipe',[(3.6,side*.77,2.35),(3.6,side*.95,2.08),(-2.9,side*.95,2.08),(-3.3,side*.73,2.48)],.055,iron,loco)
    Pipe('Model_SandLine',[(.2,side*.36,3.53),(.3,side*.89,2.6),(.7,side*.99,1.42)],.018,brass,loco)
    for x in [-3,-1,1,3,4.8]: Bar('Model_HandrailStand',(x,side*.76,3.16),(x,side*.89,3.19),.022,.022,iron,loco)

# Cab with actual window openings, open rear, arched roof and interior controls.
Box('Model_CabFloor',(-4.48,0,1.84),(2.05,2.7,.17),iron,loco,.03)
for side in [-1,1]:
    y=side*1.26
    Box('Model_CabLowerWall',(-4.47,y,2.24),(2,.1,.77),iron,loco,.018)
    for x in [-5.42,-4.35,-3.5]: Box('Model_CabWindowPost',(x,y,3.08),(.12,.13,.94),iron,loco,.012)
    Box('Model_CabTopRail',(-4.47,y,3.6),(2.04,.14,.16),iron,loco,.022)
    Box('Model_CabWindowSill',(-4.47,y,2.65),(2.02,.15,.065),steel,loco)
    Box('Model_CabGlass',(-3.95,y,3.1),(.6,.026,.76),glass,loco)
    for x in [-5.36,-3.58]:
        for z in [2.0,2.2,2.4,2.58]: Bolt('Model_CabRivet',(x,y+side*.066,z),'Y',loco)
    for z,x in [(1.52,-5.4),(1.17,-5.65),(.84,-5.86)]: Box('Model_CabStep',(x,side*1.17,z),(.39,.47,.07),steel,loco)
    Pipe('Model_CabGrab',[(-5.6,side*1.3,.85),(-5.65,side*1.3,2.95),(-5.39,side*1.3,3.02)],.025,steel,loco)
Box('Model_CabFrontPanel',(-3.46,0,3.38),(.09,2.42,.47),iron,loco)
vertices=[]
for x in [-5.62,-3.26]:
    for k in range(17):
        y=-1.45+2.9*k/16; vertices.append((x,y,3.73+.3*(1-(y/1.45)**2)))
roof=Mesh('Model_ArchedCabRoof',vertices,[(17+k,18+k,k+1,k) for k in range(16)],iron,loco)
for polygon in roof.data.polygons: polygon.use_smooth=True
mod=roof.modifiers.new('RoofThickness','SOLIDIFY'); mod.thickness=.075
for x in [-5.61,-3.27]: Pipe('Model_RoofRim',[(x,-1.45+2.9*k/24,3.73+.3*(1-((-1.45+2.9*k/24)/1.45)**2)) for k in range(25)],.035,steel,loco)
Box('Model_Backhead',(-3.58,0,2.56),(.18,1.42,1.1),black,loco,.12)
for y in [-.42,0,.42]:
    Cylinder('Model_PressureGauge',(-3.72,y,3.11),.102,.04,'X',brass,loco,20)
    Cylinder('Model_GaugeFace',(-3.748,y,3.11),.084,.008,'X',ivory,loco,20)
    Bar('Model_GaugeNeedle',(-3.754,y,3.11),(-3.754,y+.04,3.16),.01,.01,black,loco)
Cylinder('Model_FireboxDoor',(-3.71,0,2.29),.32,.035,'X',iron,loco,32)
Pipe('Model_CabRegulator',[(-3.72,.48,2.75),(-4.22,.48,2.9)],.026,brass,loco)

Progress('Static locomotive complete')
wheelRecords=[]; rodRecords=[]
def WheelPair(prefix,x,r,root,driving=False):
    for side,sideName in [(-1,'Right'),(1,'Left')]:
        phase=math.pi/2 if driving and side==1 else 0
        pivot=Empty(prefix+sideName,activeCollection); pivot.parent=root; pivot.location=(x,side*.78,r)
        pivot['WheelRadiusMeters']=r; pivot['PhaseRadians']=phase; pivot['WheelAxleX']=x
        Driver(pivot,'rotation_euler',1,f's/{r}+{phase}',root)
        Ring('Model_WheelTyre',(0,0,0),r,r-.083,.135,'Y',rim,pivot,48)
        Ring('Model_WheelRim',(0,0,0),r-.082,r-.125,.14,'Y',iron,pivot,48)
        # Inside flange touches gauge face; steel tread lies on the rail head.
        Ring('Model_WheelFlange',(0,-side*.081,0),r+.028,r-.073,.024,'Y',steel,pivot,48)
        Cylinder('Model_WheelHub',(0,0,0),r*.18,.20,'Y',iron,pivot,24)
        for j in range(12 if driving else 10):
            a=j*math.tau/(12 if driving else 10)
            Bar('Model_WheelSpoke',(.11*math.cos(a),0,.11*math.sin(a)),((r-.12)*math.cos(a),0,(r-.12)*math.sin(a)),.067,.074,iron,pivot)
        Cylinder('Model_AxleCap',(0,side*.12,0),r*.105,.045,'Y',steel,pivot,20)
        if driving:
            # Crescent counterweight opposite the crank pin, genuinely part of the wheel.
            vertices=[]
            for y in [-.06,.06]:
                for rad in [r*.5,r*.81]:
                    for j in range(13):
                        a=math.pi-.75+j*1.5/12; vertices.append((rad*math.cos(a),y,rad*math.sin(a)))
            faces=[]
            for j in range(12):
                faces += [(j,j+1,14+j,13+j),(26+j,39+j,40+j,27+j),(j,26+j,27+j,j+1),(13+j,14+j,40+j,39+j)]
            faces += [(0,13,39,26),(12,38,51,25)]
            Mesh('Model_WheelCounterweight',vertices,faces,iron,pivot)
            Cylinder('Model_CrankBoss',(.32,side*.105,0),.115,.08,'Y',iron,pivot,24)
            Cylinder('Model_CrankPin',(.32,side*(.28 if abs(x-.9)<.01 else .22),0),.054,.36 if abs(x-.9)<.01 else .20,'Y',steel,pivot,20)
        wheelRecords.append({'name':pivot.name,'root':root.name,'radius':r,'phase':phase,'x':x,'side':side})
    axle=Empty(prefix+'Axle',activeCollection); axle.parent=root; axle.location=(x,0,r); Driver(axle,'rotation_euler',1,f's/{r}',root)
    Cylinder('Model_AxleShaft',(0,0,0),.075,1.58,'Y',steel,axle,20)

driverXs=[2.5,.9,-.7,-2.3,-3.9]
for i,x in enumerate(driverXs): WheelPair('Model_Driver'+str(i+1),x,.73,loco,True)
WheelPair('Model_LeadingWheel',5.17,.44,loco)
Box('Model_LeadingTruck',(4.96,0,.78),(1.7,1.1,.14),iron,loco)
for side,sideName in [(-1,'Right'),(1,'Left')]:
    phase=math.pi/2 if side==1 else 0; a=f'(s/.73+{phase})'; y=side*1.035
    for i in range(4):
        # Each fixed length coupling rod translates with equal-phase crank pins.
        rod=Empty('Model_CouplingRod'+sideName+str(i+1),activeCollection); rod.parent=loco
        rod.location=(driverXs[i+1],y,.73)
        Box('Model_CouplingBar',(.8,0,0),(1.6,.08,.09),steel,rod,.025)
        for x in [0,1.6]: Ring('Model_CouplingBearing',(x,0,0),.115,.055,.09,'Y',steel,rod,24)
        Driver(rod,'location',0,f'{driverXs[i+1]}+.32*cos{a}',loco)
        Driver(rod,'location',2,f'.73-.32*sin{a}',loco)
        rodRecords.append({'name':rod.name,'kind':'coupling','length':1.6,'phase':phase,'axleX':driverXs[i+1],'side':side})
    main=Empty('Model_MainRod'+sideName,activeCollection); main.parent=loco; main.location.y=side*1.17
    Box('Model_MainRodBeam',(1.45,0,0),(2.9,.09,.125),steel,main,.035)
    for x,r in [(0,.15),(2.9,.105)]: Ring('Model_MainRodBearing',(x,0,0),r,.057,.10,'Y',steel,main,24)
    Driver(main,'location',0,f'.9+.32*cos{a}',loco); Driver(main,'location',2,f'.73-.32*sin{a}',loco)
    Driver(main,'rotation_euler',1,f'-asin(.32*sin{a}/2.9)',loco)
    rodRecords.append({'name':main.name,'kind':'main','length':2.9,'phase':phase,'axleX':.9,'side':side})
    slider=Empty('Model_Crosshead'+sideName,activeCollection); slider.parent=loco; slider.location=(0,side*1.17,.73)
    Driver(slider,'location',0,f'.9+.32*cos{a}+sqrt(2.9*2.9-.32*.32*sin{a}*sin{a})',loco)
    Box('Model_CrossheadBlock',(0,0,0),(.25,.24,.22),iron,slider,.035)
    Cylinder('Model_CrossheadPin',(0,side*.14,0),.061,.05,'Y',steel,slider,16)
    Cylinder('Model_PistonRod',(.55,0,0),.043,1.10,'X',rim,slider,20)
    for z in [.57,.89]: Box('Model_SlideGuide',(3.8,side*1.17,z),(1.24,.11,.07),steel,loco,.012)
    Cylinder('Model_CylinderBlock',(4.87,side*1.17,.73),.29,1.10,'X',iron,loco,32)
    Cylinder('Model_CylinderCover',(5.445,side*1.17,.73),.30,.07,'X',steel,loco,32)
    for j in range(10):
        t=j*math.tau/10; Bolt('Model_CylinderBolt',(5.49,side*1.17+.24*math.cos(t),.73+.24*math.sin(t)),'X',loco,.026)
    Box('Model_SteamChest',(4.9,side*1.17,1.09),(.88,.49,.23),iron,loco,.08)
    Pipe('Model_CylinderSteamSupply',[(4.75,side*.64,2.4),(4.9,side*.95,1.63),(4.9,side*1.17,1.21)],.085,iron,loco)
    for x in driverXs:
        Box('Model_AxleBox',(x,side*.60,.78),(.25,.2,.36),iron,loco,.03)
        for k in range(4):
            Pipe('Model_DriverLeafSpring',[(x+u*(.53-k*.055),side*.55,1.3+k*.025+.13*u*u) for u in [-1,-.75,-.5,-.25,0,.25,.5,.75,1]],.016,steel,loco)
    for x in [1.75,.15,-1.45,-3.05,-4.62]: Box('Model_BrakeShoe',(x,side*.79,.7),(.105,.17,.36),rust,loco,.025)

def Coupler(x,z,root):
    direction=1 if x>0 else -1
    Box('Model_DraftBox',(x,0,z),(.56,.39,.24),iron,root,.05)
    Box('Model_CouplerShank',(x+direction*.40,0,z),(.62,.16,.15),steel,root,.025)
    Box('Model_KnuckleOuter',(x+direction*.72,.075,z),(.27,.27,.29),iron,root,.06)
    Box('Model_KnuckleHook',(x+direction*.84,-.105,z),(.17,.18,.23),iron,root,.045)
    Pipe('Model_BrakeHose',[(x,-.49,z+.07),(x+direction*.29,-.49,z-.05),(x+direction*.36,-.49,z-.35),(x+direction*.48,-.49,z-.39)],.03,black,root)
    for i in range(5): Ring('Model_SafetyChain',(x+direction*.30,.41,z-.16-i*.083),.066,.047,.022,'Y' if i%2 else 'X',steel,root,12)

for x in [-5.82,5.98]:
    Box('Model_BufferBeam',(x,0,1.09),(.22,2.6,.43),iron,loco,.025)
    for y in [-1.14,-.94,-.6,.6,.94,1.14]: Bolt('Model_BufferRivet',(x+(.13 if x>0 else -.13),y,1.12),'X',loco,.032)
    Coupler(x,1.03,loco)
for y in [-1.1,-.88,-.66,-.44,-.22,0,.22,.44,.66,.88,1.1]: Bar('Model_PilotBar',(6.05,y,.94),(6.46,y,.18),.045,.045,steel,loco)
Box('Model_PilotBottom',(6.47,0,.2),(.09,2.35,.08),steel,loco)

# Gondola, two rigid axles, separate timber planks, door ironwork, frame/brakes.
Progress('Locomotive mechanism complete')
activeCollection=wagonCollection
for side in [-1,1]: Box('Model_GondolaSolebar',(0,side*1.17,.86),(8.15,.17,.35),iron,wagon,.02)
for x in [-3.97,-2.65,-1.3,0,1.3,2.65,3.97]: Box('Model_GondolaCrossmember',(x,0,.89),(.14,2.62,.20),iron,wagon)
for i in range(14): Box('Model_GondolaFloorPlank',(0,-1.26+i*.194,1.12),(7.92,.187,.11),woodMats[i%6],wagon,.007)
for side in [-1,1]:
    y=side*1.42
    for row in range(6):
        for start,end in [(-3.98,-.94),(-.9,.9),(.94,3.98)]:
            Box('Model_GondolaSidePlank',((start+end)/2,y,1.29+row*.246),(end-start,.105,.233),woodMats[(row+int(side))%6],wagon,.008)
    for x in [-4,-2.48,-.94,.94,2.48,4]:
        Box('Model_GondolaStanchion',(x,y+side*.073,1.88),(.145,.10,1.82),iron,wagon,.012)
        Box('Model_StanchionCap',(x,y,2.76),(.19,.21,.055),steel,wagon)
        for z in [1.15,1.40,1.67,1.94,2.21,2.49,2.69]: Bolt('Model_StanchionRivet',(x,y+side*.135,z),'Y',wagon)
    Box('Model_GondolaTopRail',(0,y,2.755),(8.1,.18,.07),iron,wagon,.012)
    Box('Model_GondolaBottomRail',(0,y+side*.065,1.12),(8.12,.1,.24),iron,wagon,.014)
    for x in [-3.7,-3.1,-1.8,-1.4,0,1.4,1.8,3.1,3.7]: Bolt('Model_SolebarRivet',(x,y+side*.125,1.13),'Y',wagon)
    for x in [-.78,.78]:
        Box('Model_DoorLatch',(x,y+side*.16,1.81),(.40,.08,.065),steel,wagon,.017)
        Bolt('Model_DoorLatchPivot',(x,y+side*.215,1.81),'Y',wagon,.036)
        Cylinder('Model_DoorHinge',(x,y+side*.12,1.14),.055,.31,'X',steel,wagon,16)
    for x in [-3.7,3.7]:
        Pipe('Model_GondolaGrab',[(x,y+side*.14,2.31),(x,y+side*.30,2.31),(x,y+side*.30,1.83),(x,y+side*.14,1.83)],.025,steel,wagon)
        Pipe('Model_GondolaStep',[(x-.16,y,.98),(x-.16,y+side*.2,.45),(x+.16,y+side*.2,.45),(x+.16,y,.98)],.024,steel,wagon)
for x in [-4.0,4.0]:
    for row in range(6): Box('Model_GondolaEndPlank',(x,0,1.29+row*.246),(.11,2.77,.233),woodMats[row%6],wagon,.007)
    for y in [-1.34,0,1.34]:
        Box('Model_GondolaEndStanchion',(x+( .075 if x>0 else -.075),y,1.87),(.11,.14,1.77),iron,wagon,.012)
        for z in [1.2,1.47,1.74,2.01,2.28,2.55]: Bolt('Model_EndRivet',(x+(.14 if x>0 else -.14),y,z),'X',wagon)
    Box('Model_GondolaEndBeam',(x,0,.99),(.19,2.9,.29),iron,wagon,.015)
    Coupler(x,.96,wagon)
for i,x in enumerate([-2.45,2.45]):
    WheelPair('Model_GondolaWheel'+str(i+1),x,.46,wagon)
    for side in [-1,1]:
        Box('Model_GondolaAxleBox',(x,side*.99,.46),(.25,.24,.29),iron,wagon,.05)
        Cylinder('Model_AxleBoxCover',(x,side*1.125,.46),.102,.024,'Y',steel,wagon,20)
        for k in range(6):
            Pipe('Model_GondolaLeafSpring',[(x+u*(.82-k*.076),side*.99,.60+k*.025+.20*u*u) for u in [-1,-.75,-.5,-.25,0,.25,.5,.75,1]],.013,steel,wagon)
        for dx in [-.78,.78]:
            Bar('Model_SpringHanger',(x+dx,side*.99,.79),(x+dx,side*.99,.94),.066,.07,iron,wagon)
            Cylinder('Model_SpringShackle',(x+dx,side*1.015,.81),.066,.11,'Y',iron,wagon,16)
        for dx in [-.41,.41]:
            Box('Model_GondolaBrakeShoe',(x+dx,side*.78,.44),(.075,.15,.22),rust,wagon,.02)
            Bar('Model_BrakeHanger',(x+dx,side*.78,.55),(x+dx*1.2,side*.78,.88),.04,.04,iron,wagon)
        Bar('Model_BrakeRigging',(-2.85,side*.65,.55),(2.85,side*.65,.55),.025,.025,steel,wagon)
Cylinder('Model_BrakeCylinder',(0,0,.68),.14,.58,'X',iron,wagon,24)
Pipe('Model_HandBrakeStaff',[(4.18,.68,.89),(4.18,.68,2.43)],.028,steel,wagon)
Ring('Model_HandBrakeWheel',(4.18,.68,2.43),.17,.143,.026,'X',steel,wagon,24)
for j in range(4):
    a=j*math.tau/4; Bar('Model_BrakeWheelSpoke',(4.18,.68,2.43),(4.18,.68+.15*math.cos(a),2.43+.15*math.sin(a)),.018,.018,steel,wagon)

# Low polygon scratched wood detail, visible and portable in glTF.
for side in [-1,1]:
    for i in range(60):
        x=rng.uniform(-3.83,3.6); z=rng.uniform(1.21,2.65); length=rng.uniform(.10,.5)
        Box('Model_PlankWeathering',(x,side*1.476,z),(length,.002,rng.uniform(.0015,.004)),woodMats[(i+3)%6],wagon)

def Label(name,text,location,rotation,size,parent):
    curve=bpy.data.curves.new(name,'FONT'); curve.body=text; curve.size=size; curve.extrude=0
    curve.materials.append(ivory)
    obj=bpy.data.objects.new(name,curve); activeCollection.objects.link(obj); obj.parent=parent; obj.location=location; obj.rotation_euler=rotation
    return obj
Label('Model_WagonStencilRight','15 t\nV 25217',(-3.55,-1.481,2.31),(math.pi/2,0,0),.18,wagon)
Label('Model_WagonCapacityRight','LOAD 15 t\nTARE 7.2 t',(2.80,-1.481,1.87),(math.pi/2,0,0),.112,wagon)
Label('Model_WagonStencilLeft','15 t\nV 25217',(3.55,1.481,2.31),(math.pi/2,0,math.pi),.18,wagon)

# Consolidate rigid meshes per parent and material: retain every mechanical pivot.
def Consolidate(collection):
    groups={}
    bpy.context.view_layer.update()
    depsgraph=bpy.context.evaluated_depsgraph_get()
    for obj in list(collection.objects):
        if obj.type not in {'MESH','CURVE','FONT'}: continue
        key=(obj.parent.name if obj.parent else '',obj.data.materials[0].name if obj.data.materials else '')
        groups.setdefault(key,[]).append(obj)
    mergedData=[]
    for (parentName,materialName),objects in groups.items():
        vertices=[]; faces=[]; smooth=[]
        for obj in objects:
            evaluated=obj.evaluated_get(depsgraph); mesh=evaluated.to_mesh()
            offset=len(vertices)
            vertices.extend([tuple(obj.matrix_local @ v.co) for v in mesh.vertices])
            faces.extend([tuple(offset+i for i in p.vertices) for p in mesh.polygons])
            smooth.extend([p.use_smooth for p in mesh.polygons])
            evaluated.to_mesh_clear()
        mergedData.append((parentName,materialName,objects,vertices,faces,smooth))
    for parentName,materialName,objects,vertices,faces,smooth in mergedData:
        mesh=bpy.data.meshes.new(parentName+'_'+materialName)
        mesh.from_pydata(vertices,[],faces); mesh.materials.append(bpy.data.materials[materialName]); mesh.update()
        for p,flag in zip(mesh.polygons,smooth): p.use_smooth=flag
        merged=bpy.data.objects.new(parentName+'_'+materialName.removeprefix('Material_'),mesh)
        collection.objects.link(merged)
        if parentName: merged.parent=bpy.data.objects[parentName]
        for obj in objects: bpy.data.objects.remove(obj,do_unlink=True)

Progress('Geometry complete, consolidating rigid meshes')
scene.frame_set(1)
Consolidate(locoCollection); Consolidate(wagonCollection)
Progress('Consolidation complete')
manifest={'units':'meters','forward':'+X','blenderUp':'+Z','gltfUp':'+Y','gltfWheelAxis':'-Z','wheelbaseReferenceInferred':True,'wheels':wheelRecords,'rods':rodRecords,'sourceViews':['Reference/Texture_LocomotiveThreeView.png','Reference/Texture_GondolaThreeView.png'],'quarteringSource':'https://en.wikisource.org/wiki/Steam_Locomotive_Construction_and_Maintenance/Chapter_VI'}
manifest['triangles']={c.name:sum(len(p.vertices)-2 for o in c.objects if o.type=='MESH' for p in o.data.polygons) for c in [locoCollection,wagonCollection]}
manifest['meshObjects']={c.name:sum(o.type=='MESH' for o in c.objects) for c in [locoCollection,wagonCollection]}
(assetDir/'Data_TrainRig.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')

for name,file in [('Locomotive','Texture_LocomotiveThreeView.png'),('Gondola','Texture_GondolaThreeView.png')]:
    img=bpy.data.images.load(str(assetDir/'Reference'/file)); img.pack()
    ref=Empty('Texture_Reference'+name,referenceCollection); ref.empty_display_type='IMAGE'; ref.data=img; ref.empty_display_size=12
    ref.hide_render=True; ref.hide_viewport=True
referenceCollection.hide_render=True

activeCollection=studioCollection
ground=Material('Material_StudioGround',(.15,.175,.19),.12,.84)
Box('Scene_Ground',(1,-2.65,-.36),(200,200,.2),ground)
for lane in [0,-5.3]:
    for side in [-1,1]:
        y=lane+side*.755
        Box('Scene_RailHead',(1,y,-.026),(45,.075,.052),rim)
        Box('Scene_RailWeb',(1,y,-.105),(45,.035,.11),iron)
        Box('Scene_RailFoot',(1,y,-.171),(45,.135,.04),iron)
    for i in range(63): Box('Scene_Sleeper',(-21+i*.7,lane,-.22),(.22,2.3,.13),woodMats[i%6])
def Camera(name,location,target,scale):
    data=bpy.data.cameras.new(name); data.type='ORTHO'; data.ortho_scale=scale; data.lens=48; data.clip_end=500
    obj=bpy.data.objects.new(name,data); studioCollection.objects.link(obj); obj.location=location; obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    return obj
scene.camera=Camera('Scene_CameraHero',(17,-24,15),(1,-2.25,1.65),21.5)
Camera('Scene_CameraLocomotive',(15,-21,10),(0,0,1.9),16.3)
Camera('Scene_CameraGondola',(11,-19,9),(0,-5.3,1.3),11.5)
Camera('Scene_CameraSide',(0,-24,1.95),(0,0,1.95),15.0)
Camera('Scene_CameraFront',(25,0,2.25),(0,0,2.25),5.5)
Camera('Scene_CameraTop',(0,0,28),(0,0,0),15)
Camera('Scene_CameraMechanism',(1,-18,2.3),(1,0,.8),10.7)
for name,location,power,size in [('Key',(1,-9,13),2400,9),('Rim',(-5,6,10),3100,8),('Front',(10,-1,7),1700,7)]:
    data=bpy.data.lights.new('Scene_'+name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size
    light=bpy.data.objects.new('Scene_'+name,data); studioCollection.objects.link(light); light.location=location; light.rotation_euler=(Vector((0,-2,1.6))-light.location).to_track_quat('-Z','Y').to_euler()
for frame,name in [(1,'Forward'),(91,'Stop'),(121,'Reverse'),(211,'Stop')]: scene.timeline_markers.new(name,frame=frame)
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(assetDir/'Scene_TrainReferenceRig.blend'),compress=True)
Progress('Saved complete train project')
result={'blend':str(assetDir/'Scene_TrainReferenceRig.blend'),'triangles':manifest['triangles'],'meshObjects':manifest['meshObjects'],'wheels':len(wheelRecords),'mechanicalRods':len(rodRecords)}
