"""Editable Type 89 Otsu reconstruction, executed through this worktree's BlenderMCP.

Blender +Y is the nose, +Z up; glTF export is metres, +Y up, nose -Z.
The source is independent of the older Type89Tank asset and never overwrites it.
Gray geometry acceptance precedes PBR. See Model/Type89MediumTank/Data_References.md.
"""
import bpy
import bmesh
import json
import math
import os
from pathlib import Path
from mathutils import Vector, Matrix

repoDir = Path(__file__).resolve().parents[2]
sourceDir = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank')
reviewDir = repoDir / 'Taierzhuang1938/_shots/Type89MediumTank'
assetDir = repoDir / 'Taierzhuang1938/Model/Type89MediumTank'
quality = os.environ.get('TYPE89_QUALITY', 'High')
stage = os.environ.get('TYPE89_STAGE', 'Gray')
segments = 64 if quality == 'High' else 24
parts = {}
materials = {}
trackPath = []
trackLength = 0.0
sprocketPitchRadius = .428
trackLinkMesh = None
roadWheelRadius = .140
roadWheelHeight = .220
leadingWheelY = 1.45
leadingWheelRadius = .149
leadingWheelPitchRadius = .173
leadingWheelHeight = .236
wheelCenterX = .907
frontIdlerY = 1.88
rearSprocketY = -2.18
trackPitchM = .150
roadWheelPairs = [(.80,.45),(.10,-.25),(-.66,-1.01),(-1.36,-1.71)]


def Material(name, color, roughness=.7, metallic=0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    material.diffuse_color = (*color, 1)
    materials[name] = material
    return material


def Node(name, position=(0, 0, 0), parent=None, **properties):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = position
    if parent:
        obj.parent = parent
    obj.empty_display_size = .06
    for key, value in properties.items():
        if key=='axis' and value in ['localX','localY','localZ']:
            obj['sourceAxis']=value
            obj['runtimeAxis']={'localX':'+X','localY':'-Z','localZ':'+Y'}[value]
        else:
            obj[key] = value
    parts[name] = obj
    return obj


def Mesh(name, vertices, faces, material, parent=None, bevel=0, smooth=False):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    finish=mesh.attributes.new('SurfaceFinish','FLOAT','POINT')
    finishValue=0.0 if any(token in name for token in ['BowMg','TurretMg']) else 1.0
    for value in finish.data:value.value=finishValue
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    mesh.materials.append(material)
    if smooth:
        for polygon in mesh.polygons:
            polygon.use_smooth = True
    if bevel:
        modifier = obj.modifiers.new('EdgeRadius', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 3 if quality == 'High' else 1
        modifier.affect = 'EDGES'
        modifier = obj.modifiers.new('CornerNormals', 'WEIGHTED_NORMAL')
        modifier.keep_sharp = True
        modifier.weight = 50
    return obj


def Box(name, position, size, material, parent=None, bevel=.002):
    x, y, z = [value / 2 for value in size]
    vertices = [(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]
    obj = Mesh(name, vertices, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], material, parent, bevel)
    obj.location = position
    return obj


def PolygonPrism(name, outline, axis, depth, center, material, parent=None, bevel=.002):
    vertices = []
    for side in [-1, 1]:
        for a, b in outline:
            if axis == 'X':
                vertices.append((center[0]+side*depth/2, center[1]+a, center[2]+b))
            elif axis == 'Y':
                vertices.append((center[0]+a, center[1]+side*depth/2, center[2]+b))
            else:
                vertices.append((center[0]+a, center[1]+b, center[2]+side*depth/2))
    count = len(outline)
    faces = [tuple(reversed(range(count))), tuple(range(count, 2*count))]
    faces.extend((i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count))
    return Mesh(name, vertices, faces, material, parent, bevel)


def RoundedRectangle(width, height, radius, steps):
    outline=[]
    for x,y,start in [(width/2-radius,height/2-radius,0),(-width/2+radius,height/2-radius,math.pi/2),(-width/2+radius,-height/2+radius,math.pi),(width/2-radius,-height/2+radius,math.pi*1.5)]:
        for i in range(steps+1):
            angle=start+i*math.pi/2/steps
            outline.append((x+radius*math.cos(angle),y+radius*math.sin(angle)))
    return outline


def CutOpening(targets, cutter):
    bpy.context.view_layer.update()
    for target in targets:
        modifier=target.modifiers.new('FunctionalOpening','BOOLEAN')
        modifier.operation='DIFFERENCE';modifier.solver='EXACT';modifier.object=cutter
        bpy.context.view_layer.objects.active=target
        while target.modifiers.find(modifier.name)>0:
            bpy.ops.object.modifier_move_up(modifier=modifier.name)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    mesh=cutter.data
    bpy.data.objects.remove(cutter,do_unlink=True)
    if mesh.users==0:bpy.data.meshes.remove(mesh)


def Lathe(name, profile, position, material, parent=None, axis='Z', count=None, smooth=True, closeProfile=False, capEnds=True):
    count = count or segments
    vertices = []
    for radius, offset in profile:
        for i in range(count):
            angle = 2*math.pi*i/count
            if axis == 'X':
                vertices.append((offset, radius*math.cos(angle), radius*math.sin(angle)))
            elif axis == 'Y':
                vertices.append((radius*math.cos(angle), offset, radius*math.sin(angle)))
            else:
                vertices.append((radius*math.cos(angle), radius*math.sin(angle), offset))
    faces = []
    for row in range(len(profile)-1):
        for i in range(count):
            j = (i+1)%count
            faces.append((row*count+i, row*count+j,(row+1)*count+j,(row+1)*count+i))
    if closeProfile:
        for i in range(count):
            j=(i+1)%count
            faces.append(((len(profile)-1)*count+i,(len(profile)-1)*count+j,j,i))
    elif capEnds:
        faces.append(tuple(reversed(range(count))))
        faces.append(tuple((len(profile)-1)*count+i for i in range(count)))
    obj = Mesh(name, vertices, faces, material, parent, smooth=smooth)
    obj.location = position
    return obj


def Tube(name, start, end, radius, material, parent=None, count=None, capEnds=True):
    delta = Vector(end)-Vector(start)
    obj = Lathe(name, [(radius,0),(radius,delta.length)], start, material, parent, count=count or (16 if quality == 'High' else 8),capEnds=capEnds)
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = delta.to_track_quat('Z', 'Y')
    return obj


def Rivet(position, normal, parent, radius=.009, material=None):
    if quality!='High':
        vertices=[(radius*math.cos(i*math.pi/3),radius*math.sin(i*math.pi/3),0) for i in range(6)]+[(0,0,.0075)]
        faces=[(i,(i+1)%6,6) for i in range(6)]+[(5,4,3,2,1,0)]
        obj=Mesh('Rivet',vertices,faces,material or materials['Armor'],parent,smooth=True)
        obj.location=position
        obj.rotation_mode='QUATERNION';obj.rotation_quaternion=Vector(normal).to_track_quat('Z','Y')
        return obj
    count = 10 if quality == 'High' else 6
    profile = [(radius,0),(radius*.95,.002),(radius*.72,.006),(radius*.28,.008)] if quality == 'High' else [(radius,0),(radius*.76,.006)]
    obj = Lathe('Rivet', profile, position, material or materials['Armor'], parent, count=count)
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = Vector(normal).to_track_quat('Z','Y')
    return obj


def RivetLine(start, end, spacing, normal, parent, radius=.009):
    delta = Vector(end)-Vector(start)
    count = max(1, round(delta.length/spacing))
    for i in range(count+1):
        Rivet(Vector(start)+delta*i/count, normal, parent, radius)


def JoinObjects(objects, name, parent):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.convert(target='MESH')
    if len(objects)>1:
        bpy.ops.object.join()
    result = bpy.context.object
    matrix = result.matrix_world.copy()
    result.name = name
    result.parent = parent
    result.matrix_parent_inverse = Matrix.Identity(4)
    localMatrix = parent.matrix_world.inverted() @ matrix if parent else matrix
    result.data.transform(localMatrix)
    result.matrix_basis = Matrix.Identity(4)
    return result


def JoinStaticChildren(parent):
    objects = sorted([obj for obj in list(parent.children) if obj.type == 'MESH'],key=lambda obj:obj.name)
    if not objects:
        return
    return JoinObjects(objects, 'Mesh_' + parent.name.replace('Node_',''), parent)


def HullGeometry(root):
    armor = materials['Armor']
    steel = materials['Steel']
    black = materials['Shadow']
    hull = Node('Node_Hull', parent=root)
    lowerBody=PolygonPrism('LowerHull', [(-2.07,.51),(-2.13,1.22),(-1.95,1.35),(1.539,1.35),(1.98,.80),(1.69,.60),(-1.74,.44)], 'X', 1.33, (0,0,0), armor, hull, .007)
    # The sloping front and its rear-facing top edge belong to the later hull.
    hullVertices=[(-.760,1.539,1.35),(.760,1.539,1.35),(-.860,1.195,1.78),(.860,1.195,1.78),(-.860,-.72,1.35),(.860,-.72,1.35),(-.830,-.72,1.82),(.830,-.72,1.82),(-.690,-2.14,1.34),(.690,-2.14,1.34),(-.690,-2.14,1.50),(.690,-2.14,1.50)]
    hullFaces=[(0,1,3,2),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3),(4,8,9,5),(6,7,11,10),(4,6,10,8),(5,9,11,7),(8,10,11,9)]
    upperBody=Mesh('UpperHull',hullVertices,hullFaces,armor,hull,.004)
    frontAngle = math.atan2(.785,.98)
    frontNormal = Vector((0,math.cos(frontAngle),math.sin(frontAngle)))
    frontBottom = Vector((0,1.98,.80))
    frontUp = Vector((0,-.785,.98)).normalized()
    frontLength = math.hypot(.785,.98)
    frontOrigin = frontBottom + frontUp * (frontLength/2)
    front = Node('Node_BowPlate', frontOrigin, hull)
    front.rotation_euler[0] = frontAngle
    # Local Y is the outward plate normal, local Z rises up the sloping face.
    bowPlate=PolygonPrism('BowArmorPlate',[(-.530,-frontLength/2),(.530,-frontLength/2),(.715,frontLength/2),(-.715,frontLength/2)],'Y',.018,(0,.006,0),armor,front,.003)
    for sign in [-1,1]:
        RivetLine((sign*.507,.020,-frontLength/2+.045),(sign*.678,.020,frontLength/2-.045),.12,(0,1,0),front,.010)
    for z,halfWidth in [(-frontLength/2+.044,.493),(frontLength/2-.045,.669)]:
        RivetLine((-halfWidth,.020,z),(halfWidth,.020,z),.113,(0,1,0),front,.010)
    # Distinct seams and bolted access panel on the vehicle's left side.
    hatchOutline=[(-.500,-.500),(-.055,-.500),(-.055,.175),(-.13,.270),(-.26,.270),(-.30,.215),(-.39,.198),(-.48,.215),(-.52,.270),(-.610,.270)]
    innerDoorOutline=[(-.32+(x+.32)*.965,-.115+(z+.115)*.965) for x,z in hatchOutline]
    cutter=PolygonPrism('BowDoorOpeningCutter',innerDoorOutline,'Y',.36,(0,-.06,0),black,front,0)
    CutOpening([bowPlate,upperBody,lowerBody],cutter)
    PolygonPrism('BowDoorInteriorBack',innerDoorOutline,'Y',.010,(0,-.16,0),black,front,0)
    hingeAngle=math.atan2(-.110,.770)
    hingeOrigin=Vector((-.555,.032,-.115))
    hatch=Node('Node_BowHatch',hingeOrigin,front,axis='localZ',rangeDegrees=[0,70],hingeDescription='sloping outboard hinge follows trapezoidal plate edge')
    hatch.rotation_euler.y=hingeAngle
    inverseHinge=Matrix.Rotation(hingeAngle,3,'Y').inverted()
    doorOutline=[]
    for x,z in hatchOutline:
        point=inverseHinge@(Vector((x,.032,z))-hingeOrigin)
        doorOutline.append((point.x,point.z))
    PolygonPrism('BowAccessDoor',doorOutline,'Y',.021,(0,0,0),armor,hatch,.005)
    for z in [-.31,-.08,.15,.34]:
        Tube('BowDoorHinge',(-.012,.027,z-.052),(-.012,.027,z+.052),.017,armor,hatch)
        Box('HingeLeaf',(.055,.027,z),(.10,.018,.035),armor,hatch)
    latch=Node('Node_BowDoorLatch',(-.015,.067,-.115),front,axis='localY',rangeDegrees=[-35,35])
    PolygonPrism('BowLatchBase',[(-.035,-.055),(.035,-.055),(.050,.025),(0,.070),(-.050,.025)],'Y',.012,(0,0,0),armor,latch,.003)
    Tube('BowLatchLever',(0,.020,-.040),(.020,.035,.105),.011,steel,latch)
    for z in [-.04,.035]:
        Rivet((-.027,.014,z),(0,1,0),latch,.008)
    # Driver's vision flap: vehicle right, not the early-model reversed layout.
    cutter=PolygonPrism('DriverVisionOpeningCutter',RoundedRectangle(.280,.145,.008,3 if quality=='High' else 1),'Y',.30,(.31,-.06,.41),black,front,0)
    CutOpening([bowPlate,upperBody],cutter)
    Box('DriverVisionRecess',(.31,-.085,.41),(.290,.012,.155),black,front,.003)
    vision = Node('Node_DriverVisionFlap',(.31,.047,.51),front,axis='localX',rangeDegrees=[0,105])
    Box('DriverVisionCover',(0,.005,-.096),(.31,.026,.19),armor,vision,.008)
    Box('DriverVisionSlit',(0,.021,-.066),(.19,.004,.016),black,vision,.002)
    Tube('DriverHinge',(-.155,0,0),(.155,0,0),.015,armor,vision)
    Tube('VisionHandle',(-.054,.042,-.13),(.054,.042,-.13),.009,steel,vision)
    for x in [-.12,.12]:
        for z in [-.165,-.035]:
            Rivet((x,.024,z),(0,1,0),vision,.008)
    # Ball machine-gun mantlet, mounted on the other side of the bow.
    mg = Node('Node_BowMgMount',(-.40,.065,.425),front)
    Lathe('BowMgFlange',[(.191,-.015),(.191,.005),(.172,.014),(.146,.016)],(0,0,0),armor,mg,'Y',48 if quality=='High' else 24)
    Lathe('BowMgBall',[(.141,0),(.134,.045),(.112,.085),(.060,.113)],(0,0,0),armor,mg,'Y',48 if quality=='High' else 20)
    # Open, shielded black muzzle jacket is visible in the 2007 reference.
    mgGun = Node('Node_BowMachineGun',(0,.085,0),mg,axis='localZ',rangeDegrees=[-12,12])
    mgGun.rotation_euler.x=-frontAngle
    outer=[(-.041,-.026),(.041,-.026),(.050,.035),(.035,.057),(-.035,.057),(-.050,.035)]
    inner=[(x*.72,z*.72+.004) for x,z in outer]
    jacketVertices=[]
    for y in [.015,.310]:
        jacketVertices.extend((x,y,z) for x,z in outer)
        jacketVertices.extend((x,y,z) for x,z in inner)
    jacketFaces=[]
    for i in range(6):
        j=(i+1)%6
        jacketFaces.extend([(i,j,j+12,i+12),(i+6,i+18,j+18,j+6),(i+12,j+12,j+18,i+18),(j,i,i+6,j+6)])
    Mesh('BowMgOpenJacket',jacketVertices,jacketFaces,steel,mgGun,.001)
    Lathe('BowMgBarrel',[(.014,.09),(.014,.32),(.008,.32),(.008,.26)],(0,0,.010),steel,mgGun,'Y',16)
    for i in range(10):
        angle=2*math.pi*i/10
        Rivet((math.cos(angle)*.170,.013,math.sin(angle)*.170),(0,1,0),mg,.009)
    Lathe('BowRoundPort',[(.071,0),(.071,.012)],(-.13,.032,.30),armor,front,'Y',24)
    # The front photograph shows one central clevis, above the lower bevel.
    tow=Node('Node_BowTowClevis',(0,.040,-frontLength/2+.13),front)
    Box('TowClevisMount',(0,0,0),(.13,.018,.18),armor,tow,.004)
    for x in [-.045,.045]:
        Box('TowClevisEar',(x,.045,0),(.024,.075,.14),armor,tow,.006)
        for z in [-.060,.060]:
            Rivet((x,.012,z),(0,1,0),tow,.009)
    Tube('TowClevisPin',(-.068,.082,.018),(.068,.082,.018),.013,steel,tow,20 if quality=='High' else 12)
    Box('TowClevisHeel',(0,.030,-.062),(.11,.035,.025),armor,tow,.003)
    bpy.context.view_layer.update()
    def HullSurface(side,y,z):
        hit,point,normal,_=upperBody.ray_cast(Vector((side*2,y,z)),Vector((-side,0,0)))
        return (point,normal) if hit else None
    def HullRivetLine(side,startY,startZ,endY,endZ,spacing):
        length=math.hypot(endY-startY,endZ-startZ)
        count=max(1,round(length/spacing))
        for i in range(count+1):
            t=i/count
            sample=HullSurface(side,startY*(1-t)+endY*t,startZ*(1-t)+endZ*t)
            if sample:
                point,normal=sample
                Rivet(point+normal*.001,normal,hull)
    for side in [-1,1]:
        # Side plate taper and riveted angle flanges.
        for z,yStart,yEnd in [(1.385,-1.98,1.54),(1.775,-.65,1.40)]:
            HullRivetLine(side,yStart,z,yEnd,z,.135)
        for y in [-.63,-.05,.53,1.13,1.46]:
            HullRivetLine(side,y,1.41,y,1.75,.10)
        sideVisionSample=HullSurface(side,1.03,1.60)
        sideVisionX=sideVisionSample[0].x if sideVisionSample else side*.82
        cutter=Box('SideVisionOpeningCutter',(sideVisionX,1.03,1.60),(.25,.155,.185),black,hull,0)
        CutOpening([upperBody],cutter)
        Box('SideVisionRecess',(sideVisionX-side*.09,1.03,1.60),(.012,.160,.190),black,hull,.003)
        sideHatch=Node('Node_SideVisionFlap'+('Left' if side<0 else 'Right'),(sideVisionX+side*.025,1.135,1.60),hull,axis='localZ',rangeDegrees=[-175,0] if side<0 else [0,175])
        Box('SideVisionCover',(0,-.102,0),(.024,.20,.22),armor,sideHatch,.004)
        Tube('SideVisionHinge',(0,0,-.11),(0,0,.11),.012,steel,sideHatch)
        # Fender horizontal shelf and rolled outer edge, flared downward at rear.
        fenderPoints=[(2.07,1.22),(1.57,1.40),(-2.10,1.40),(-2.37,1.33),(-2.29,1.29),(-2.05,1.37),(1.58,1.37),(2.07,1.19)]
        PolygonPrism('TrackFender',fenderPoints,'X',.35,(side*.905,0,0),armor,hull,.003)
        Tube('FenderLip',(side*1.079,1.57,1.40),(side*1.079,-2.10,1.40),.011,armor,hull)
        for y in [-1.88,-1.15,-.45,.28,1.00]:
            PolygonPrism('FenderSupport',[(y-.09,1.37),(y+.09,1.37),(y-.06,1.17)],'X',.025,(side*.92,0,0),armor,hull)
        # Tall triangular bow deflector characteristic of this surviving tank.
        PolygonPrism('FrontMudDeflector',[(2.04,1.14),(2.04,1.53),(1.66,1.40),(1.66,1.16)],'X',.018,(side*.86,0,0),armor,hull)
        Tube('BowDeflectorBrace',(side*.865,2.02,1.16),(side*.865,1.67,1.40),.012,armor,hull)
    # Bolted rear engine deck, louvred cooling doors, exhaust and guard cage.
    rearSlope=math.atan2(.32,1.42)
    engine=Node('Node_EngineDeck',(0,-1.43,1.66),hull)
    engine.rotation_euler.x=rearSlope
    Box('EngineDeckShadow',(0,0,-.14),(1.36,1.35,.012),black,engine)
    for x in [-.37,.37]:
        sign=-1 if x<0 else 1
        door=Node('Node_EngineHatch'+('Left' if x<0 else 'Right'),(sign*.04,0,.022),engine,axis='localY',rangeDegrees=[0,65],reconstruction='hinge detail inferred from exterior photographs')
        localX=x-sign*.04
        Box('EngineDoor',(localX,0,0),(.65,1.31,.023),armor,door,.003)
        Tube('EngineHatchHinge',(0,-.52,.004),(0,.52,.004),.012,steel,door)
        cutter=Box('EngineOpeningCutter',(x,0,-.025),(.61,1.23,.30),black,engine,0)
        CutOpening([upperBody],cutter)
        # The Tsuchiura car has broad smooth access panels; grilles occupy
        # local bands, unlike the full-deck louvres of the initial draft.
        ventBands=[(localX,.30,.45,.45)] if sign>0 else [(localX-sign*.12,0,.20,1.02)]
        for ventX,ventY,ventWidth,ventLength in ventBands:
            Box('EngineVentRecess',(ventX,ventY,.015),(ventWidth,ventLength,.006),black,door,.002)
            count=max(4,round(ventLength/.036))
            for i in range(count):
                y=ventY-ventLength/2+(i+.5)*ventLength/count
                lip=Box('EngineVentLouvre',(ventX,y,.026),(ventWidth+.008,.022,.012),armor,door,.001)
                lip.rotation_euler.x=.24
        RivetLine((localX-.28,-.59,.017),(localX-.28,.59,.017),.12,(0,0,1),door,.008)
        RivetLine((localX+.28,-.59,.017),(localX+.28,.59,.017),.12,(0,0,1),door,.008)
        for y in [-.61,.61]:
            Tube('DeckHandle',(localX-.055,y,.043),(localX+.055,y,.043),.010,steel,door)
    # Main reference puts the long perforated exhaust cage on the left rear shelf.
    exhaust=Node('Node_ExhaustGuard',(-.76,-1.47,1.59),hull)
    Tube('ExhaustSilencer',(0,.54,.01),(0,-.53,.01),.098,materials['Exhaust'],exhaust,32)
    Tube('ExhaustExit',(0,-.53,.01),(0,-.69,.06),.035,materials['Exhaust'],exhaust,16)
    # Rounded rectangular perforated heat shield, with actual open grid cells.
    guardProfile=[(-.155,0),(-.155,.095),(-.145,.135),(-.120,.166),(-.082,.180),(.082,.180),(.120,.166),(.145,.135),(.155,.095),(.155,0)]
    def ProfileAt(t):
        lengths=[math.hypot(b[0]-a[0],b[1]-a[1]) for a,b in zip(guardProfile,guardProfile[1:])]
        distance=t*sum(lengths)
        for i,length in enumerate(lengths):
            if distance<=length or i==len(lengths)-1:
                a,b=guardProfile[i],guardProfile[i+1];fraction=distance/length
                return (a[0]+(b[0]-a[0])*fraction,a[1]+(b[1]-a[1])*fraction)
            distance-=length
    guardVertices=[];guardFaces=[]
    def GuardQuad(a,b,c,d):
        base=len(guardVertices);guardVertices.extend([a,b,c,d]);guardFaces.append((base,base+1,base+2,base+3))
    for i in range(23):
        t=i/22
        xA,zA=ProfileAt(max(0,t-.0045));xB,zB=ProfileAt(min(1,t+.0045))
        GuardQuad((xA,-.56,zA),(xA,.56,zA),(xB,.56,zB),(xB,-.56,zB))
    for i in range(33):
        y=-.56+i*1.12/32
        for a,b in zip(guardProfile,guardProfile[1:]):
            GuardQuad((a[0],y-.003,a[1]),(b[0],y-.003,b[1]),(b[0],y+.003,b[1]),(a[0],y+.003,a[1]))
    guard=Mesh('PerforatedExhaustGuard',guardVertices,guardFaces,armor,exhaust)
    if quality=='High':
        modifier=guard.modifiers.new('GuardSheetThickness','SOLIDIFY');modifier.thickness=.0018
        modifier=guard.modifiers.new('GuardRoundedStripEdges','BEVEL');modifier.width=.00065;modifier.segments=2
    for y in [-.56,-.28,0,.28,.56]:
        for a,b in zip(guardProfile,guardProfile[1:]):
            Tube('GuardPanelFrame',(a[0],y,a[1]),(b[0],y,b[1]),.005,armor,exhaust,8 if quality=='High' else 6)
    for y in [-.47,.47]:
        Box('ExhaustMount',(0,y,-.07),(.24,.05,.06),armor,exhaust)
    # Rear-facing round lamp visible beside the shield in the running-car view.
    lamp=Node('Node_RearLamp',(-.96,-2.12,1.63),hull,reconstruction='glazed round fitting follows Tsuchiura rear photograph')
    lamp.rotation_euler.z=math.pi
    Lathe('RearLampHousing',[(.055,-.04),(.094,0),(.104,.055),(.103,.092),(.091,.103)],(0,0,0),armor,lamp,'Y',48 if quality=='High' else 16)
    Lathe('RearLampReflector',[(.006,.012),(.050,.030),(.086,.078),(.089,.098)],(0,0,0),steel,lamp,'Y',48 if quality=='High' else 16)
    Lathe('RearLampBezel',[(.091,.087),(.105,.087),(.105,.106),(.090,.110)],(0,0,0),armor,lamp,'Y',48 if quality=='High' else 16,closeProfile=True)
    lensProfile=[(.0001,.107)]
    lensSteps=12 if quality=='High' else 4
    lensProfile.extend((.089*i/lensSteps,.116+.010*(1-(i/lensSteps)**2)) for i in range(1,lensSteps+1))
    lensProfile.extend([(.089,.106),(.0001,.101)])
    Lathe('RearLampGlass',lensProfile,(0,0,0),materials['Glass'],lamp,'Y',64 if quality=='High' else 16)
    Tube('RearLampStem',(0,0,-.06),(0,0,-.18),.016,steel,lamp,16 if quality=='High' else 8)
    # Trench-crossing tail is deliberately included in overall length.
    for side in [-1,1]:
        outline=[(-2.09,.58),(-3.180,.81),(-3.340,1.02),(-3.270,1.045),(-3.101,.92),(-2.14,.86)]
        PolygonPrism('TailSkidArm',outline,'X',.075,(side*.49,0,0),armor,hull,.004)
        for y,z in [(-2.23,.78),(-2.63,.84),(-3.05,.91)]:
            Rivet((side*.535,y,z),(side,0,0),hull,.011)
    Tube('TailCrossBrace',(-.52,-3.162,.88),(.52,-3.162,.88),.029,armor,hull,16)
    Tube('TailDiagonal',(-.49,-2.23,.75),(.49,-3.145,.90),.025,armor,hull,12)
    Tube('TailDiagonal',(.49,-2.23,.75),(-.49,-3.145,.90),.025,armor,hull,12)
    return hull


def Wheel(parent, name, position, radius, width=.23, side=1, road=True):
    pivot=Node(name,position,parent,axis='localX',radiusM=radius)
    armor=materials['Armor']
    steel=materials['Steel']
    if road:
        # Two flanged roadwheel discs straddle the guide teeth.
        for sign in [-1,1]:
            x=sign*.057
            if quality=='High':
                profile=[(.018,x-.026),(radius*.62,x-.026),(radius*.87,x-.015),(radius*.94,x-.024),(radius,x-.021),(radius,x+.021),(radius*.89,x+.021),(radius*.83,x+.005),(radius*.40,x+.005),(.035,x+.025),(.018,x+.025)]
                Lathe('PressedRoadWheel',profile,(0,0,0),armor,pivot,'X',segments//2)
                Lathe('RoadRimWear',[(radius*.98,x-.022),(radius*1.006,x-.022),(radius*1.006,x+.022),(radius*.98,x+.022)],(0,0,0),materials['Rubber'],pivot,'X',segments//2,closeProfile=True)
            else:
                profile=[(.018,x-.020),(radius*.75,x-.020),(radius,x-.020),(radius,x+.020),(radius*.85,x+.002),(.034,x+.002),(.034,x+.020),(.018,x+.020)]
                disc=Lathe('PressedRoadWheel',profile,(0,0,0),armor,pivot,'X',16,capEnds=False)
                disc.data.materials.append(materials['Rubber'])
                for polygon in disc.data.polygons:
                    if 2*16<=polygon.index<3*16:polygon.material_index=1
        Lathe('HubCap',[(.034,side*.105),(.034,side*.123),(.025,side*.132)],(0,0,0),armor,pivot,'X',20 if quality=='High' else 8)
        Tube('RoadHubNeck',(side*.078,0,0),(side*.107,0,0),.026,armor,pivot,16 if quality=='High' else 8)
        Tube('RoadInnerAxle',(-.105,0,0),(.105,0,0),.020,armor,pivot,16 if quality=='High' else 8,capEnds=quality=='High')
    else:
        innerRadius=.016 if radius<.10 else .035
        bossRadius=.025 if radius<.10 else .080
        hubRadius=.012 if radius<.10 else .065
        for discSign in [-1,1]:
            x=discSign*.057
            profile=[(innerRadius,x-.024),(radius*.67,x-.024),(radius*.90,x-.020),(radius,x-.020),(radius,x+.020),(radius*.91,x+.020),(radius*.84,x+.004),(bossRadius,x+.004),(bossRadius*.81,x+.027),(innerRadius,x+.027)] if quality=='High' else [(innerRadius,x-.020),(radius,x-.020),(radius,x+.020),(radius*.82,x+.002),(bossRadius,x+.002),(innerRadius,x+.024)]
            Lathe('IdlerPressedDisc',profile,(0,0,0),armor,pivot,'X',segments if quality=='High' else (12 if radius<.1 else 24))
        Lathe('IdlerCentralHub',[(hubRadius*.84,-width/2),(hubRadius,-width*.4),(hubRadius,width*.4),(hubRadius*.84,width/2)],(0,0,0),armor,pivot,'X',24 if quality=='High' else 12)
        for i in range(10):
            angle=i*2*math.pi/10
            Rivet((side*width*.30,math.cos(angle)*radius*.72,math.sin(angle)*radius*.72),(side,0,0),pivot,.010)
    return pivot


def Suspension(hull, side):
    label='Left' if side<0 else 'Right'
    group=Node('Node_Suspension'+label,parent=hull)
    armor=materials['Armor']
    x=side*wheelCenterX
    for pair,(yA,yB) in enumerate(roadWheelPairs):
        bogie=Node('Node_Bogie%s%02d'%(label,pair+1),(side*.74,(yA+yB)/2,.53),group,axis='localX')
        Tube('BogieAxle',(0,0,0),(side*.18,0,0),.055,armor,bogie)
        for y in [yA,yB]:
            Tube('BogieArm',(0,0,0),(side*.14,y-(yA+yB)/2,roadWheelHeight-.53),.034,armor,bogie)
            Wheel(bogie,'Node_RoadWheel%s%02d'%(label,pair*2+(1 if y==yA else 2)),(side*(wheelCenterX-.74),y-(yA+yB)/2,roadWheelHeight-.53),roadWheelRadius,side=side)
        for leaf in range(5):
            length=.57-leaf*.06
            Box('LeafSpring',(side*.02,0,.17+leaf*.014),(.07,length,.012),materials['Steel'],bogie,.002 if quality=='High' else 0)
        for dy in [-.18,.18]:
            Tube('SpringClamp',(-.025,dy,.15),(-.025,dy,.24),.011,armor,bogie)
    Wheel(group,'Node_LeadingWheel'+label,(x,leadingWheelY,leadingWheelHeight),leadingWheelRadius,side=side)
    Tube('LeadingWheelIndependentArm',(side*.72,leadingWheelY+.16,.50),(side*.90,leadingWheelY,leadingWheelHeight),.029,armor,group)
    idler=Wheel(group,'Node_FrontIdler'+label,(x,frontIdlerY,.850),.433,.25,side,False)
    idler['geometryRadiusM']=.433
    idler['radiusM']=.451
    rear=Wheel(group,'Node_RearSprocket'+label,(x,rearSprocketY,.790),.390,.25,side,False)
    rear['geometryRadiusM']=.390
    rear['radiusM']=sprocketPitchRadius
    rear['toothCount']=18
    for i in range(18):
        angle=math.pi*2*i/18
        for sx in [-.055,.055]:
            tooth=Box('SprocketTooth',(sx,math.cos(angle)*.397,math.sin(angle)*.397),(.045,.056,.049),materials['Steel'],rear,.004)
            tooth.rotation_euler.x=angle
    for i,y in enumerate([1.03,.22,-.60,-1.41]):
        Wheel(group,'Node_ReturnRoller%s%02d'%(label,i+1),(x,y,1.210),.082,.13,side,False)
        Tube('RollerBracket',(side*.65,y,1.16),(side*.90,y,1.21),.035,armor,group)
    # Front idler tensioning housing is fixed; the wheel rotates behind it.
    plate=[(2.04,1.10),(1.94,1.22),(1.33,1.22),(1.22,1.18),(1.18,1.03),(.91,.87),(.68,.67),(.45,.59),(.45,.38),(.78,.37),(1.22,.38),(1.48,.42),(1.72,.51),(1.99,.68),(2.05,.83)]
    PolygonPrism('TensionerHousing',plate,'X',.036,(side*1.044,0,0),armor,group,.012)
    if quality=='High':
        # Raised stamped reinforcement visible below the idler adjuster. Its
        # relief/fasteners project into the game's dedicated normal/ORM atlas.
        rail=[(2.00,.83),(1.86,.83),(1.74,.91),(1.63,.93),(1.30,.93),(1.18,.89),(1.02,.74),(.82,.60),(.66,.58)]
        railVertices=[]
        for i,(y,z) in enumerate(rail):
            a=Vector(rail[max(0,i-1)]);b=Vector(rail[min(len(rail)-1,i+1)])
            tangent=(b-a).normalized();normal=Vector((-tangent.y,tangent.x))*.017
            for x in [side*1.064,side*1.072]:
                railVertices.extend([(x,y+normal.x,z+normal.y),(x,y-normal.x,z-normal.y)])
        railFaces=[]
        for i in range(len(rail)-1):
            base=i*4;nextBase=(i+1)*4
            railFaces.extend([(base,base+1,nextBase+1,nextBase),(base+2,nextBase+2,nextBase+3,base+3),(base,nextBase,nextBase+2,base+2),(base+1,base+3,nextBase+3,nextBase+1)])
        railFaces.extend([(0,2,3,1),tuple(range((len(rail)-1)*4,len(railVertices)))])
        Mesh('IdlerStampedFlange',railVertices,railFaces,armor,group,.002)
        for y,z in rail:
            Rivet((side*1.073,y,z),(side,0,0),group,.007)
    for a,b in [((1.34,1.20),(1.92,1.20)),((1.95,1.11),(1.95,.87))]:
        RivetLine((side*1.061,a[0],a[1]),(side*1.061,b[0],b[1]),.11,(side,0,0),group,.010)
    Tube('TensionerGreaseCylinder',(side*1.044,1.48,1.02),(side*1.044,1.95,1.02),.045,armor,group,20)
    # Sloping removable suspension covers, folded vertical bottom skirts.
    for panel,(frontY,rearY) in enumerate([(1.51,.48),(.48,-.61),(-.61,-1.67)]):
        panelNode=Node('Node_SuspensionCover%s%02d'%(label,panel+1),(side*.754,frontY,1.045),group,axis='localY',rangeDegrees=[0,45])
        length=frontY-rearY
        vertices=[(0,0,0),(0,-length,0),(side*.276,-length,-.446),(side*.276,0,-.446),(side*.276,0,-.675),(side*.276,-length,-.675)]
        Mesh('SlopingSuspensionCover',vertices,[(0,1,2,3),(3,2,5,4)],armor,panelNode,0)
        solid=panelNode.children[-1].modifiers.new('ArmorSheetThickness','SOLIDIFY'); solid.thickness=.008
        for y in [-.04,-length+.04]:
            for t in [0,.25,.5,.75,1]:
                Rivet((side*(.276*t+.006),y,-.366*t),(side*.80,0,.60),panelNode,.007)
        for j in range(6):
            y=-length*j/5
            Tube('SkirtHinge',(side*.280,y-.024,-.368),(side*.280,y+.024,-.368),.009,armor,panelNode,8)
        RivetLine((side*.283,-.04,-.51),(side*.283,-length+.04,-.51),.21,(side,0,0),panelNode,.008)
    return group


def ConvexHull(points):
    points=sorted(set(points))
    def Cross(o,a,b):
        return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    lower=[]
    for point in points:
        while len(lower)>=2 and Cross(lower[-2],lower[-1],point)<=0:
            lower.pop()
        lower.append(point)
    upper=[]
    for point in reversed(points):
        while len(upper)>=2 and Cross(upper[-2],upper[-1],point)<=0:
            upper.pop()
        upper.append(point)
    return lower[:-1]+upper[:-1]


def BuildTrackPath():
    global trackPath,trackLength,sprocketPitchRadius
    for iteration in range(12):
        circles=[(frontIdlerY,.85,.451),(rearSprocketY,.79,sprocketPitchRadius),(leadingWheelY,leadingWheelHeight,leadingWheelPitchRadius),(roadWheelPairs[0][0],roadWheelHeight,roadWheelRadius+.020),(roadWheelPairs[-1][-1],roadWheelHeight,roadWheelRadius+.020)]
        circles.extend((y,1.210,.100) for y in [1.03,.22,-.60,-1.41])
        points=[]
        for y,z,radius in circles:
            points.extend((y+radius*math.cos(i*2*math.pi/240),z+radius*math.sin(i*2*math.pi/240)) for i in range(240))
        hull=ConvexHull(points)
        trackPath=[]
        trackLength=0.0
        for i,a in enumerate(hull):
            b=hull[(i+1)%len(hull)]
            distance=math.hypot(b[0]-a[0],b[1]-a[1])
            trackPath.append({'a':a,'b':b,'s':trackLength,'length':distance})
            trackLength+=distance
        # One complete belt must pass exactly the same number of teeth as shoes.
        linkCount=round(trackLength/trackPitchM)
        matchedRadius=trackLength/linkCount*18/(2*math.pi)
        if abs(matchedRadius-sprocketPitchRadius)<1e-9:
            break
        sprocketPitchRadius=matchedRadius


def TrackPoint(distance):
    distance%=trackLength
    for segment in trackPath:
        if distance<=segment['s']+segment['length']+.000001:
            t=(distance-segment['s'])/segment['length']
            a,b=segment['a'],segment['b']
            y=a[0]*(1-t)+b[0]*t
            z=a[1]*(1-t)+b[1]*t
            # Reverse the longitudinal shoe axis so local Z is the exterior
            # normal of the anticlockwise path; guide teeth face the wheels.
            theta=math.atan2(b[1]-a[1],b[0]-a[0])+math.pi
            return y,z,theta
    raise RuntimeError('Track sample outside path')


def TrackSample(distance):
    pitch=trackLength/round(trackLength/trackPitchM)
    a=TrackPoint(distance-pitch/2)
    b=TrackPoint(distance+pitch/2)
    return ((a[0]+b[0])/2,(a[1]+b[1])/2,math.atan2(b[1]-a[1],b[0]-a[0])+math.pi)


def TrackGeometry(hull,side):
    global trackLinkMesh
    label='Left' if side<0 else 'Right'
    group=Node('Node_Track'+label,parent=hull,loopLengthM=trackLength,axis='independentDistanceM')
    steel=materials['Track']
    pin=materials['Steel']
    pitchScale=trackPitchM/.119
    if trackLinkMesh is None:
        before=set(bpy.data.objects)
        # Four real cast openings: two large rounded centre windows, two
        # smaller outer windows. The primary close-up distinguishes these.
        outline=[(-.174,-.067),(.174,-.067),(.183,-.052),(.174,.058),(.151,.068),(-.151,.068),(-.174,.058),(-.183,-.052)]
        plate=PolygonPrism('CastShoePlate',outline,'Z',.025,(0,0,0),steel,None,0)
        for x,width,height,radius in [(-.137,.035,.060,.009),(-.055,.070,.086,.015),(.055,.070,.086,.015),(.137,.035,.060,.009)]:
            holeOutline=RoundedRectangle(width,height,radius,4 if quality=='High' else 1)
            cutter=PolygonPrism('ShoeWindowCutter',holeOutline,'Z',.10,(x,0,0),steel,None,0)
            modifier=plate.modifiers.new('CastThroughWindow','BOOLEAN');modifier.operation='DIFFERENCE';modifier.solver='EXACT';modifier.object=cutter
            bpy.context.view_layer.objects.active=plate
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            cutterMesh=cutter.data
            bpy.data.objects.remove(cutter,do_unlink=True)
            if cutterMesh.users==0:bpy.data.meshes.remove(cutterMesh)
        if quality=='High':
            modifier=plate.modifiers.new('RoundedCastEdges','BEVEL');modifier.width=.0025;modifier.segments=3
            modifier=plate.modifiers.new('CastCornerNormals','WEIGHTED_NORMAL');modifier.keep_sharp=True
        Box('ShoeGrouser',(0,-.049*pitchScale,.023),(.362,.015*pitchScale,.020),steel,None,.003 if quality=='High' else 0)
        for x in [-.122,0,.122]:
            Tube('ShoePinBarrel',(x-.036,.057*pitchScale,-.009),(x+.036,.057*pitchScale,-.009),.018,pin,None,12 if quality=='High' else 8,capEnds=quality=='High')
        for x in [-.18,.18]:
            if quality=='High':
                Lathe('ShoePinEnd',[(.016,-.003),(.016,.003)],(x,.057*pitchScale,-.009),pin,None,'X',12)
            else:
                pinVertices=[(x+(.003 if x>0 else -.003),.057*pitchScale+.016*math.cos(i*math.pi/4),-.009+.016*math.sin(i*math.pi/4)) for i in range(8)]
                Mesh('ShoePinEnd',pinVertices,[tuple(range(8)) if x>0 else tuple(reversed(range(8)))],pin)
        PolygonPrism('ShoeGuideHorn',[(y*pitchScale,z) for y,z in [(-.037,-.014),(-.016,-.065),(.014,-.065),(.038,-.014)]],'X',.032,(0,0,0),steel,None,.003 if quality=='High' else 0)
        shoeObjects=sorted(set(bpy.data.objects)-before,key=lambda obj:obj.name)
        template=JoinObjects(shoeObjects,'Mesh_CastTrackShoe',None)
        trackLinkMesh=template.data
        bpy.data.objects.remove(template,do_unlink=True)
    count=round(trackLength/trackPitchM)
    group['linkCount']=count
    group['pitchM']=trackLength/count
    for i in range(count):
        y,z,theta=TrackSample(i*trackLength/count)
        pivot=Node('Node_TrackLink%s%03d'%(label,i),(side*wheelCenterX,y,z),group,phaseM=i*trackLength/count)
        pivot.rotation_euler.x=theta
        obj=bpy.data.objects.new('Mesh_TrackLink%s%03d'%(label,i),trackLinkMesh)
        bpy.context.collection.objects.link(obj)
        obj.parent=pivot
    return group


def TurretGeometry(hull):
    armor=materials['Armor']
    steel=materials['Steel']
    shadow=materials['Shadow']
    turret=Node('Node_TurretYaw',(0,.20,1.82),hull,axis='localZ',rangeDegrees=[-180,180])
    Lathe('TurretRace',[(.616,0),(.644,.014),(.644,.047),(.620,.055)],(0,0,0),steel,turret)
    # Late turret has a flat front and extended rounded rear; a circular cone
    # misses its top-view planform and the side silhouette of the primary car.
    def PlanPoint(angle,z):
        scale=(.717-(z-.055)/.604*.097)/.717
        sine=math.sin(angle)
        x=.717*scale*math.cos(angle)
        y=(.720 if sine>=0 else .900)*scale*sine
        return (x,min(y,.640*scale),z)
    def PlanNormal(angle,z):
        a=Vector(PlanPoint(angle-.0001,z));b=Vector(PlanPoint(angle+.0001,z))
        tangent=b-a
        return Vector((tangent.y,-tangent.x,.000025)).normalized()
    # Cut-out at the flat front is a real opening.
    count=72 if quality=='High' else 40
    vertices=[]
    for z in [.055,.659]:
        vertices.extend(PlanPoint(2*math.pi*i/count,z) for i in range(count))
    faces=[]
    for i in range(count):
        mid=(i+.5)*2*math.pi/count
        if abs(mid-math.pi/2)<.305:
            continue
        faces.append((i,(i+1)%count,(i+1)%count+count,i+count))
    shell=Mesh('TurretArmoredShell',vertices,faces,armor,turret,smooth=True)
    solid=shell.modifiers.new('TurretWallThickness','SOLIDIFY'); solid.thickness=.016
    topOutline=[PlanPoint(2*math.pi*i/count,.659)[:2] for i in range(count)]
    roof=PolygonPrism('TurretRoof',topOutline,'Z',.012,(0,0,.666),armor,turret,0)
    cutter=Lathe('CommanderOpeningCutter',[(.244,-.10),(.244,.10)],(0,-.13,.666),shadow,turret,count=64 if quality=='High' else 32)
    CutOpening([roof],cutter)
    Lathe('TurretInteriorShadow',[(.242,0),(.242,.008)],(0,-.13,.535),shadow,turret,count=48 if quality=='High' else 24)
    rimVertices=[]
    for offset,z in [(1.0,.650),(1.009,.650),(1.009,.669),(.991,.674)]:
        rimVertices.extend((x*offset,y*offset,z) for x,y in topOutline)
    rimFaces=[]
    for row in range(3):
        for i in range(count):
            j=(i+1)%count;rimFaces.append((row*count+i,row*count+j,(row+1)*count+j,(row+1)*count+i))
    Mesh('TurretTopRim',rimVertices,rimFaces,armor,turret,smooth=True)
    for i in range(44):
        angle=i*2*math.pi/44
        for z in [.083,.622]:
            if abs(angle-math.pi/2)<.31:
                continue
            point=Vector(PlanPoint(angle,z));normal=PlanNormal(angle,z)
            Rivet(point+normal*.001,normal,turret,.009)
    for angle in [-2.7,-1.75,-.75,.42,1.05,2.08,2.70]:
        for offset in [-.020,.020]:
            for z in [.14,.25,.36,.47,.57]:
                a=angle+offset
                point=Vector(PlanPoint(a,z));normal=PlanNormal(a,z)
                Rivet(point+normal*.001,normal,turret,.008)
    # Gun mantlet is trapezoidal, with separate pitch and recoil nodes.
    mantletOutline=[(-.265,.064),(.265,.064),(.244,.659),(-.244,.659)]
    PolygonPrism('MantletFrame',mantletOutline,'Y',.080,(0,.675,0),armor,turret,.003)
    Box('MantletOpening',(0,.711,.349),(.352,.008,.343),shadow,turret,.002)
    for x in [-.225,.225]:
        RivetLine((x,.713,.148),(x,.713,.552),.085,(0,1,0),turret,.009)
    for z in [.144,.553]:
        RivetLine((-.20,.713,z),(.20,.713,z),.080,(0,1,0),turret,.009)
    gunPitch=Node('Node_MainGunPitch',(0,.704,.365),turret,axis='localX',rangeDegrees=[-12,20])
    for x in [-.162,.162]:
        Box('GunYokeSide',(x,.010,0),(.030,.13,.31),armor,gunPitch,.004)
    for z in [-.151,.147]:
        Box('GunYokeCrossmember',(0,.010,z),(.34,.08,.025),armor,gunPitch,.003)
    for xA,xB,zA,zB in [(-.165,-.120,-.135,.150),(-.082,-.015,-.135,.150),(-.120,-.082,.085,.150),(-.120,-.082,-.135,.015)]:
        Box('MantletSightShield',((xA+xB)/2,.090,(zA+zB)/2),(xB-xA,.025,zB-zA),armor,gunPitch,.002)
    for x in [-.18,.18]:
        Lathe('GunTrunnion',[(.071,-.014),(.071,.014)],(x,0,0),steel,gunPitch,'X',24)
    recoil=Node('Node_MainGunRecoil',(.075,.025,0),gunPitch,axis='localY',rangeM=[-.10,0])
    Lathe('GunBarrel',[(.067,0),(.067,.11),(.055,.17),(.042,.36),(.038,.84),(.046,.85),(.046,.89),(.0285,.89),(.0285,.72)],(0,0,.032),armor,recoil,'Y',48 if quality=='High' else 24)
    Lathe('MuzzleBore',[(.0284,.71),(.0284,.884)],(0,0,.032),shadow,recoil,'Y',32)
    # Large lower recoil housing and narrow parallel rod are prominent in photo 02.
    Lathe('RecoilSleeve',[(.060,.02),(.068,.10),(.068,.62),(.051,.66),(.051,.70)],(0,0,-.088),armor,recoil,'Y',32 if quality=='High' else 20)
    Tube('RecoilRod',(.10,.08,-.026),(.10,.66,-.026),.015,steel,recoil,16)
    Tube('RecoilEndBrace',(-.072,.62,-.088),(.108,.62,-.026),.018,armor,recoil,12)
    # Photographs show the exposed tube appreciably shorter than the first pass.
    bpy.context.view_layer.update()
    for gunPart in recoil.children:
        if gunPart.type=='MESH':
            gunPart.matrix_basis=Matrix.Diagonal((1,.80,1,1))@gunPart.matrix_basis
    # Rear-facing turret machine gun remains a real independent pivot.
    rearMg=Node('Node_TurretMachineGun',(-.420,-.665,.355),turret,axis='localX',rangeDegrees=[-10,10])
    rearMg.rotation_euler.z=math.radians(135)
    Lathe('TurretMgFlange',[(.135,-.01),(.135,.015),(.110,.035)],(0,0,0),armor,rearMg,'Y',32)
    Lathe('TurretMgBall',[(.107,.015),(.100,.068),(.047,.100)],(0,0,0),armor,rearMg,'Y',32)
    Lathe('TurretMgJacket',[(.037,.080),(.034,.30),(.028,.36),(.017,.36),(.017,.29)],(0,0,0),steel,rearMg,'Y',20)
    # Low Otsu cupola; split hatches have their own longitudinal hinges.
    cupola=Node('Node_CommanderCupola',(0,-.13,.672),turret)
    Lathe('CupolaRing',[(.304,0),(.310,.016),(.310,.038),(.285,.050),(.245,.050),(.245,.015)],(0,0,0),armor,cupola, count=64 if quality=='High' else 32,closeProfile=True)
    for side in [-1,1]:
        hatch=Node('Node_CommanderHatch'+('Front' if side>0 else 'Rear'),(0,side*.260,.055),cupola,axis='localX',rangeDegrees=[-105,0] if side>0 else [0,105])
        angles=[(0 if side>0 else math.pi)+i*math.pi/24 for i in range(25)]
        outline=[(.294*math.cos(a),.294*math.sin(a)-side*.260) for a in angles]
        PolygonPrism('CommanderHatchLid',outline,'Z',.016,(0,0,0),armor,hatch,.002)
        for x in [-.145,.145]:
            Tube('CommanderHatchHinge',(x-.035,0,0),(x+.035,0,0),.014,steel,hatch)
        Tube('CommanderHatchHandle',(-.045,-side*.14,.029),(.045,-side*.14,.029),.009,steel,hatch)
    # Rear hatch and rectangular observation port: inset panels and fasteners.
    rearVision=Node('Node_TurretRearVision',(.34,-.73,.35),turret,axis='localZ')
    rearVision.rotation_euler.z=.53
    Box('RearVisionFrame',(0,0,0),(.24,.024,.21),armor,rearVision,.006)
    Box('RearVisionSlot',(0,-.015,.025),(.13,.005,.014),shadow,rearVision,.001)
    for x in [-.095,.095]:
        for z in [-.075,.075]:
            Rivet((x,-.016,z),(0,-1,0),rearVision,.008)
    return turret


def Studio(root):
    scene=bpy.context.scene
    scene.render.engine='CYCLES'
    scene.cycles.samples=32
    scene.cycles.use_denoising=True
    scene.render.resolution_x=1280
    scene.render.resolution_y=960
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.world.color=(.18,.18,.18)
    world=scene.world
    world.use_nodes=True
    world.node_tree.nodes['Background'].inputs['Color'].default_value=(.35,.35,.35,1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
    scene.view_settings.view_transform='AgX'
    ground=Box('StudioGround',(0,0,-.041),(200,200,.04),materials['Ground'],None,0)
    ground['ReviewOnly']=True
    for name,position,power,size in [('Key',(-3,4,7),1100,5),('Fill',(4,2,5),900,4),('Rim',(1,-5,6),1200,4)]:
        data=bpy.data.lights.new('Light_'+name,'AREA')
        data.energy=power
        data.shape='DISK'
        data.size=size
        obj=bpy.data.objects.new('Light_'+name,data)
        bpy.context.collection.objects.link(obj)
        obj.location=position
        obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
        obj['ReviewOnly']=True
    cameras=[('FrontLeft',(-6.3,8.2,3.8),(0,-.25,1.23),48),('Front',(0,9.8,2.35),(0,0,1.27),54),('Left',(-9,-.6,2.5),(0,-.6,1.23),53),('RearLeft',(-6,-8,3.7),(0,-.6,1.22),48),('FrontRight',(6.2,7.7,3.5),(0,-.25,1.24),48)]
    for name,position,target,lens in cameras:
        data=bpy.data.cameras.new('Camera_'+name)
        data.lens=lens
        obj=bpy.data.objects.new('Camera_'+name,data)
        bpy.context.collection.objects.link(obj)
        obj.location=position
        obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
        obj['ReviewOnly']=True
    scene.camera=bpy.data.objects['Camera_FrontLeft']


def ExportGray(root):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [root]+list(root.children_recursive):
        obj.select_set(True)
    filepath=reviewDir/('Model_Type89MediumTank%s%s.glb'%(quality,stage))
    bpy.ops.export_scene.gltf(filepath=str(filepath),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
    print('GLB',filepath)


def RenderViews(names=('FrontLeft','Front','Left','RearLeft','FrontRight')):
    scene=bpy.context.scene
    for name in names:
        scene.camera=bpy.data.objects['Camera_'+name]
        scene.render.filepath=str(reviewDir/('Scene_%s%s_%s.png'%(quality,stage,name)))
        bpy.ops.render.render(write_still=True)


def Main():
    assert not bpy.data.filepath or 'Type89MediumTank' in bpy.data.filepath, 'Wrong source project; never clear another scene'
    assert bpy.context.scene.get('BlenderMcpTask') in [None,'Type89MediumTank'], 'Wrong MCP task'
    for directory in [sourceDir,reviewDir,assetDir]:
        directory.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.data.orphans_purge(do_recursive=True)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)
    for name,color,roughness,metallic in [('Armor',(.40,.40,.40),.78,0),('Steel',(.34,.34,.34),.72,0),('Track',(.32,.32,.32),.80,0),('Rubber',(.26,.26,.26),.90,0),('Shadow',(.09,.09,.09),.90,0),('Exhaust',(.30,.30,.30),.85,0),('Glass',(.65,.65,.65),.24,0),('Ground',(.22,.22,.22),.9,0)]:
        Material(name,color,roughness,metallic)
    bpy.context.scene.unit_settings.system='METRIC'
    bpy.context.scene.unit_settings.scale_length=1
    bpy.context.scene['BlenderMcpTask']='Type89MediumTank'
    bpy.context.scene['Type89Stage']=stage
    bpy.context.scene['Type89Quality']=quality
    root=Node('Model_Type89MediumTank',assetVersion='20261023GeometryV14',geometryVersion='20261023GeometryV14',variant='Type89Otsu_Tsuchiura',sourceNose='+Y',exportNose='-Z',units='metres',acceptance='IN_PROGRESS_GRAY')
    hull=HullGeometry(root)
    BuildTrackPath()
    motionPath={'length':trackLength,'segments':trackPath,'linksPerSide':round(trackLength/trackPitchM),'pitchM':trackLength/round(trackLength/trackPitchM),'sprocketTeeth':18,'sprocketPitchRadiusM':sprocketPitchRadius,'units':'metres','authoringUp':'+Z','authoringNose':'+Y','runtimeUp':'+Y','runtimeNose':'-Z'}
    (reviewDir/'Data_TrackPath.json').write_text(json.dumps(motionPath),encoding='utf8')
    (assetDir/'Data_TrackPath.json').write_text(json.dumps(motionPath,indent=2),encoding='utf8')
    for side in [-1,1]:
        Suspension(hull,side)
        TrackGeometry(hull,side)
    TurretGeometry(hull)
    # Collapse only fixed meshes per pivot; all functional pivots survive.
    for obj in [obj for obj in root.children_recursive if obj.type=='EMPTY' and not obj.name.startswith('Node_TrackLink')]:
        JoinStaticChildren(obj)
    bpy.context.view_layer.update()
    minGround = min((obj.matrix_world@vertex.co).z for obj in root.children_recursive if obj.type=='MESH' for vertex in obj.data.vertices)
    hull.location.z-=minGround
    root['groundCorrectionM']=minGround
    bpy.context.view_layer.update()
    Studio(root)
    scene=bpy.context.scene
    scene.frame_start=1
    scene.frame_end=121
    bpy.ops.wm.save_as_mainfile(filepath=str(sourceDir/('Scene_Type89MediumTank%s%s.blend'%(quality,stage))))
    ExportGray(root)
    depsgraph=bpy.context.evaluated_depsgraph_get()
    triangles=0
    for obj in root.children_recursive:
        if obj.type=='MESH':
            evaluated=obj.evaluated_get(depsgraph)
            mesh=evaluated.to_mesh()
            mesh.calc_loop_triangles()
            triangles+=len(mesh.loop_triangles)
            evaluated.to_mesh_clear()
    report={'stage':stage,'quality':quality,'triangles':triangles,'nodeCount':len(list(root.children_recursive)),'trackLengthM':trackLength,'trackLinksPerSide':parts['Node_TrackLeft']['linkCount'],'sourceBlend':bpy.data.filepath,'geometryAccepted':False,'materialAccepted':False,'dimensionsStatus':'photo-proportioned; primary dimension source still under verification'}
    (reviewDir/('Data_%s%sBuild.json'%(quality,stage))).write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps(report))
    if os.environ.get('TYPE89_RENDER','1')=='1':
        RenderViews(tuple(os.environ.get('TYPE89_VIEWS','FrontLeft,Front,RearLeft').split(',')))


if __name__=='__main__':
    Main()
