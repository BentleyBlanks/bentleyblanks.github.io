"""Editable Type 89 Otsu reconstruction, executed through this worktree's BlenderMCP.

Blender +Y is the nose, +Z up; glTF export is metres, +Y up, nose -Z.
The source is independent of the older Type89Tank asset and never overwrites it.
Gray geometry acceptance precedes PBR. See Model/Type89MediumTank/Data_References.md.
"""
import bpy
import bmesh
import json
import hashlib
import math
import os
import sys
from pathlib import Path
from mathutils import Vector, Matrix
sys.path.insert(0,str(Path(__file__).resolve().parent))
from Script_Type89DetailedParts import BuildPerforatedGuard,BuildChannelTail,BuildMainGunHardware,BuildCastTrackShoe,BuildTrackFender,BuildBowMgJacket

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
trackLinksPerSide = 74
roadWheelPairs = [(.80,.45),(.10,-.25),(-.66,-1.01),(-1.36,-1.71)]
# Primary-photo axle rays and the independent side view agree on a falling
# return run. The previous equal-height row lifted the belt and led its front
# three rollers too far forward.
returnRollerStations = [(.812,1.078),(.049,1.050),(-.686,1.016),(-1.414,.973)]


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
    height=.005*radius/.009
    if quality!='High':
        vertices=[(radius*math.cos(i*math.pi/3),radius*math.sin(i*math.pi/3),0) for i in range(6)]+[(0,0,height)]
        # The backing disk is buried in its plate and never contributes to the
        # visible rivet. Spend those triangles on reference-visible hardware.
        faces=[(i,(i+1)%6,6) for i in range(6)]
        obj=Mesh('Rivet',vertices,faces,material or materials['Armor'],parent,smooth=True)
        obj.location=position
        obj.rotation_mode='QUATERNION';obj.rotation_quaternion=Vector(normal).to_track_quat('Z','Y')
        return obj
    count = 10 if quality == 'High' else 6
    profile = [(radius,0),(radius*.95,height*.25),(radius*.72,height*.72),(radius*.28,height)] if quality == 'High' else [(radius,0),(radius*.76,height)]
    obj = Lathe('Rivet', profile, position, material or materials['Armor'], parent, count=count)
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = Vector(normal).to_track_quat('Z','Y')
    return obj


def HexBolt(position, normal, parent, radius=.011, depth=.009, material=None):
    vertices=[(radius*math.cos(i*math.pi/3),radius*math.sin(i*math.pi/3),z) for z in [0,depth] for i in range(6)]
    faces=[(i,(i+1)%6,(i+1)%6+6,i+6) for i in range(6)]+[tuple(range(6,12))]
    obj=Mesh('HexFastener',vertices,faces,material or materials['Armor'],parent,.0008 if quality=='High' else 0)
    obj.location=position;obj.rotation_mode='QUATERNION';obj.rotation_quaternion=Vector(normal).to_track_quat('Z','Y')
    return obj


def ShallowHatchLid(parent, side, hingeOffset=.260, closedOffset=0):
    # The real lids are shallow dished shells with a turned skirt, not flat
    # half-discs. Geometry follows the 2007 inside view and 2025 closed caps.
    n=40 if quality=='High' else 20
    angles=[(0 if side>0 else math.pi)+i*math.pi/n for i in range(n+1)]
    vertices=[]
    for radius,z in [(.001,.004),(.245,.003),(.302,-.004),(.298,-.016),(.298,-.050),(.291,-.050),(.291,-.017),(.243,-.006),(.001,-.006)]:
        vertices.extend((radius*math.cos(a),radius*math.sin(a)-side*hingeOffset,z+closedOffset) for a in angles)
    faces=[]
    for row in range(8):
        for i in range(n):
            a=row*(n+1)+i;faces.append((a,a+1,a+n+2,a+n+1))
    for i in range(n):faces.append((8*(n+1)+i,8*(n+1)+i+1,i+1,i))
    faces.append(tuple(row*(n+1) for row in reversed(range(9))))
    faces.append(tuple(row*(n+1)+n for row in range(9)))
    lid=Mesh('DishedCommanderLid',vertices,faces,materials['Armor'],parent,smooth=True)
    hole=PolygonPrism('LidHandOpening',[(.043*math.cos(i*2*math.pi/24),.024*math.sin(i*2*math.pi/24)) for i in range(24)],'Z',.14,(-side*.158,side*(.118-hingeOffset),closedOffset),materials['Shadow'],parent,0)
    CutOpening([lid],hole)
    return lid


def CastWheelFlange(parent, radius, discSign, driven=False):
    # Two mirrored cast flanges. The old model put both pressed faces toward
    # +X, leaving the main photograph's left wheel face flat and featureless.
    innerCount=36 if quality=='High' else 18
    outerCount=innerCount*4
    rimMax=sprocketPitchRadius-.006 if driven else radius
    rimMin=radius*.91 if not driven else min(radius,rimMax-.027)
    sections=[(.035,-.020,innerCount,False),(.70*radius,-.020,innerCount,False),(rimMax,-.020,outerCount,True),(rimMax,.020,outerCount,True),(.78*radius,.020,innerCount,False),(.24*radius,.005,innerCount,False),(.035,.020,innerCount,False)]
    vertices=[];rings=[];faces=[]
    for r,offset,count,wave in sections:
        ring=[]
        for i in range(count):
            angle=2*math.pi*i/count
            value=rimMin+(rimMax-rimMin)*(.5+.5*math.cos(18*angle)) if wave else r
            ring.append(len(vertices));vertices.append((discSign*(.057+offset),math.cos(angle)*value,math.sin(angle)*value))
        rings.append(ring)
    for a,b in zip(rings,rings[1:]):
        if len(a)==len(b):
            for i in range(len(a)):faces.append((a[i],a[(i+1)%len(a)],b[(i+1)%len(b)],b[i]))
        else:
            small,large=(a,b) if len(a)<len(b) else (b,a)
            reverse=len(a)>len(b);ratio=len(large)//len(small)
            for i in range(len(small)):
                for j in range(ratio):
                    face=(small[i],large[(i*ratio+j)%len(large)],large[(i*ratio+j+1)%len(large)])
                    faces.append(tuple(reversed(face)) if reverse else face)
                face=(small[i],large[((i+1)*ratio)%len(large)],small[(i+1)%len(small)])
                faces.append(tuple(reversed(face)) if reverse else face)
    Mesh('CastScallopedWheelFlange',vertices,faces,materials['Armor'],parent,smooth=True)
    # Cast ribs are retained as relief; photos do not prove that every dark
    # recess is a through-opening, so no unsupported empty web is invented.
    for i in range(8):
        angle=2*math.pi*i/8+.12
        radial=Vector((0,math.cos(angle),math.sin(angle)));tangent=Vector((0,-math.sin(angle),math.cos(angle)))
        v=[]
        for x in [discSign*.061,discSign*.077]:
            for r,w in [(.24*radius,.014),(.76*radius,.022)]:
                v.extend(tuple(Vector((x,0,0))+radial*r+tangent*s*w) for s in [-1,1])
        Mesh('CastRadialWheelRib',v,[(0,2,3,1),(0,4,6,2),(1,3,7,5),(4,5,7,6),(2,6,7,3)],materials['Armor'],parent,.003 if quality=='High' else 0,smooth=True)


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
    if result.data.uv_layers:
        result.data.uv_layers.active_index=0
        result.data.uv_layers.active.active_render=True
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
    # Each visible armor sheet is planar. The old broad side quad also covered
    # the bow chamfer, so its four corners were non-coplanar and triangulation
    # produced a diagonal lighting patch absent from the photographs.
    sideSlopeZ=(.830-.860)/(1.67-1.35)
    sideSlopeY=-sideSlopeZ*(1.78-1.35)/(1.195+.72)
    sideBaseX=.860+sideSlopeY*(1.03+.72)
    rearTopX=.690+sideSlopeZ*(1.30-1.26)
    hullVertices=[(-.760,1.539,1.35),(.760,1.539,1.35),(-.860,1.195,1.78),(.860,1.195,1.78),(-.860,-.72,1.35),(.860,-.72,1.35),(-.830,-.72,1.67),(.830,-.72,1.67),(-.690,-2.14,1.26),(.690,-2.14,1.26),(-rearTopX,-2.14,1.30),(rearTopX,-2.14,1.30),(-sideBaseX,1.03,1.35),(sideBaseX,1.03,1.35)]
    hullFaces=[(0,1,3,2),(0,12,4,5,13,1),(2,3,7,6),(12,2,6,4),(0,2,12),(13,5,7,3),(1,13,3),(4,8,9,5),(6,7,11,10),(4,6,10,8),(5,9,11,7),(8,10,11,9)]
    for face in hullFaces:
        # Validate the authored double-precision coordinates before Blender's
        # float32 storage; its sub-micron rounding is not an armor bend.
        a,b,c=[hullVertices[i] for i in face[:3]]
        u=[b[j]-a[j] for j in range(3)];v=[c[j]-a[j] for j in range(3)]
        normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        length=math.sqrt(sum(value*value for value in normal));normal=[value/length for value in normal]
        error=max(abs(sum((hullVertices[i][j]-a[j])*normal[j] for j in range(3))) for i in face)
        assert error<1e-7,('Non-planar armor plate',face,error)
    upperBody=Mesh('UpperHull',hullVertices,hullFaces,armor,hull,.004)
    # The outer cabin roof falls aft, while the circular mounting seat stays
    # level. Most of this support is concealed by the turret overhang.
    Lathe('TurretRoofPedestal',[(.04,1.54),(.616,1.54),(.616,1.825),(.04,1.825)],(0,.20,0),armor,hull,count=64 if quality=='High' else 32,closeProfile=True)
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
    RivetLine((-.669,.020,frontLength/2-.045),(.669,.020,frontLength/2-.045),.113,(0,1,0),front,.010)
    # The driver-side lower row alternates between two heights. These are
    # reconstructed plate coordinates from original photos16/20, rather than
    # an invented regular spacing along the full bottom edge.
    lowerBowRivets=[(.50524,-.56536),(.42756,-.55092),(.34473,-.58220),(.26664,-.54728),(.18807,-.57858),(.10514,-.54458),(-.13193,-.55551),(-.21270,-.54857),(-.29008,-.54817),(-.36917,-.54403),(-.45238,-.54920),(-.53278,-.54693)]
    for x,z in lowerBowRivets:Rivet((x,.020,z),(0,1,0),front,.009)
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
    latchPosition=inverseHinge@(Vector((-.105,.067,-.275))-hingeOrigin)
    latch=Node('Node_BowDoorLatch',latchPosition,hatch,axis='localY',rangeDegrees=[-35,35])
    PolygonPrism('BowLatchBase',[(-.035,-.055),(.035,-.055),(.050,.025),(0,.070),(-.050,.025)],'Y',.012,(0,0,0),armor,latch,.003)
    for a,b in [((0,.020,-.040),(.020,.035,.105)),((.020,.035,.105),(.065,.044,.073)),((.065,.044,.073),(.060,.044,-.030)),((.060,.044,-.030),(0,.020,-.040))]:
        Tube('BowLatchLoop',a,b,.009,armor,latch,12 if quality=='High' else 8)
    for z in [-.04,.035]:
        Rivet((-.027,.014,z),(0,1,0),latch,.008)
    # Driver's vision flap: vehicle right, not the early-model reversed layout.
    cutter=PolygonPrism('DriverVisionOpeningCutter',RoundedRectangle(.280,.145,.008,3 if quality=='High' else 1),'Y',.30,(.235,-.06,.41),black,front,0)
    CutOpening([bowPlate,upperBody],cutter)
    Box('DriverVisionRecess',(.235,-.085,.41),(.290,.012,.155),black,front,.003)
    vision = Node('Node_DriverVisionFlap',(.235,.047,.595),front,axis='localX',rangeDegrees=[0,105])
    visor=PolygonPrism('DriverOuterVisorLeaf',RoundedRectangle(.42,.36,.027,6 if quality=='High' else 3),'Y',.022,(0,0,-.185),armor,vision,.001)
    peeper=PolygonPrism('DriverPeeperPlate',RoundedRectangle(.235,.215,.018,6 if quality=='High' else 3),'Y',.012,(0,.020,-.185),armor,vision,.001)
    aperture=[(.070*math.cos(math.pi+i*math.pi/(32 if quality=='High' else 16)),-.185+.070*math.sin(math.pi+i*math.pi/(32 if quality=='High' else 16))) for i in range((32 if quality=='High' else 16)+1)]
    cutter=PolygonPrism('DriverHalfRoundAperture',aperture,'Y',.14,(0,.02,0),black,vision,0)
    CutOpening([visor,peeper],cutter)
    shutter=Node('Node_DriverPortShutter',(0,.030,-.185),vision,axis='localY',rangeDegrees=[0,180])
    shutterOutline=[(.075*math.cos(i*math.pi/(32 if quality=='High' else 16)),.075*math.sin(i*math.pi/(32 if quality=='High' else 16))) for i in range((32 if quality=='High' else 16)+1)]
    PolygonPrism('DriverRoundShutter',shutterOutline,'Y',.006,(0,0,0),armor,shutter,.0008 if quality=='High' else 0)
    Lathe('DriverShutterKnob',[(.031,0),(.034,.008),(.029,.016)],(0,.038,-.173),armor,vision,'Y',40 if quality=='High' else 20)
    for x in [-.135,.135]:
        Tube('DriverVisorHingePin',(x-.035,0,0),(x+.035,0,0),.014,steel,vision)
        Box('DriverFixedHingeLeaf',(.235+x,.028,.587),(.070,.018,.065),armor,front,.003)
        for dx in [-.021,.021]:HexBolt((.235+x+dx,.040,.569),(0,1,0),front,.007,.006)
    for x in [-.088,.088]:
        for z in [-.263,-.107]:Rivet((x,.029,z),(0,1,0),vision,.012)
    # Ball machine-gun mantlet, mounted on the other side of the bow.
    mg = Node('Node_BowMgMount',(-.40,.065,.350),front)
    flangeSteps=48 if quality=='High' else 24
    flange=[(.191*math.cos(math.radians(-60+300*i/flangeSteps)),.191*math.sin(math.radians(-60+300*i/flangeSteps))) for i in range(flangeSteps+1)]
    flange.extend([(-.092,-.203),(-.065,-.218),(.065,-.218),(.092,-.203)])
    PolygonPrism('BowMgFlange',flange,'Y',.020,(0,-.003,0),armor,mg,.002 if quality=='High' else 0)
    Lathe('BowMgTurnedSeat',[(.172,-.002),(.172,.009),(.146,.016)],(0,0,0),armor,mg,'Y',48 if quality=='High' else 16)
    Lathe('BowMgBall',[(.141,0),(.134,.045),(.112,.085),(.060,.113)],(0,0,0),armor,mg,'Y',48 if quality=='High' else 20)
    # The exposed2007 jacket differs from the later pointed protective cover.
    mgGun = Node('Node_BowMachineGun',(0,.085,0),mg,axis='localZ',rangeDegrees=[-12,12])
    mgGun.rotation_euler.x=-frontAngle
    BuildBowMgJacket(quality,mgGun,steel,Mesh,PolygonPrism,Lathe,Tube,CutOpening)
    for degrees in [0,45,90,135,180,220,320]:
        angle=math.radians(degrees)
        HexBolt((math.cos(angle)*.170,.008,math.sin(angle)*.170),(0,1,0),mg,.009,.006)
    for x in [-.052,.052]:HexBolt((x,.008,-.194),(0,1,0),mg,.009,.006)
    cutter=Lathe('RoundBowPortCutter',[(.066,-.12),(.066,.12)],(-.13,.012,.30),black,front,'Y',40 if quality=='High' else 20)
    CutOpening([bowPlate,upperBody],cutter)
    Lathe('RoundBowPortInterior',[(.065,0),(.065,.004)],(-.13,-.080,.30),black,front,'Y',32 if quality=='High' else 16)
    roundCover=Node('Node_BowRoundPortCover',(-.13,.047,.389),front,axis='localX',rangeDegrees=[0,180])
    Lathe('BowRoundPort',[(.071,0),(.071,.012)],(0,-.015,-.089),armor,roundCover,'Y',40 if quality=='High' else 20)
    Lathe('BowRoundPortLip',[(.069,0),(.075,.003),(.075,.012),(.069,.016)],(0,-.014,-.089),armor,roundCover,'Y',40 if quality=='High' else 20)
    # The2007 photograph shows the five-point badge on the inner/open face.
    starVertices=[(0,-.023,-.089)]
    for i in range(10):
        angle=-math.pi/2+i*math.pi/5;radius=.055 if i%2==0 else .025
        starVertices.append((radius*math.cos(angle),-.017 if i%2==0 else -.015,-.089+radius*math.sin(angle)))
    star=Mesh('BowCoverInsideStar',starVertices,[(0,i+1,(i+1)%10+1) for i in range(10)],armor,roundCover)
    badge=star.data.attributes.new('MuseumBadge','FLOAT','POINT')
    for value in badge.data:value.value=1.0
    # Original16 resolves the hinge above the cover, with a rounded leaf on
    # its face and two round rivets. It is not a lower-mounted latch.
    PolygonPrism('RoundPortHingeLeaf',RoundedRectangle(.072,.042,.007,3 if quality=='High' else 1),'Y',.010,(0,.005,-.019),armor,roundCover,.001 if quality=='High' else 0)
    for x in [-.024,.024]:Rivet((x,.012,-.029),(0,1,0),roundCover,.010)
    for x in [-.153,-.107]:
        Box('RoundPortFixedHingeLeaf',(x,.043,.395),(.021,.012,.033),armor,front,.001 if quality=='High' else 0)
    for index,(a,b) in enumerate([(-.166,-.145),(-.144,-.116),(-.115,-.094)]):
        Tube('RoundPortHingeKnuckle',(a,.057,.389),(b,.057,.389),.008,armor,front,12 if quality=='High' else 6)
    # The front photograph shows one central clevis, above the lower bevel.
    tow=Node('Node_BowTowClevis',(0,.040,-frontLength/2+.13),front)
    Box('TowClevisMount',(0,0,0),(.13,.018,.18),armor,tow,.004)
    ears=[]
    for x in [-.045,.045]:
        ears.append(PolygonPrism('TowClevisEyePlate',[(0,-.075),(.055,-.075),(.120,-.050),(.140,0),(.120,.050),(.055,.075),(0,.075)],'X',.024,(x,0,0),armor,tow,.003))
        for z in [-.060,.060]:
            Rivet((x,.012,z),(0,1,0),tow,.009)
    cutter=Lathe('TowEyeBoreCutter',[(.026,-.12),(.026,.12)],(0,.095,.010),black,tow,'X',48 if quality=='High' else 20)
    CutOpening(ears,cutter)
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
        HullRivetLine(side,-1.98,1.305,1.54,1.385,.135)
        HullRivetLine(side,-.65,1.642,1.15,1.741,.135)
        for y in [-.63,-.05,.53,1.13,1.46]:
            roofZ=1.67+(y+.72)/1.915*.11
            HullRivetLine(side,y,1.41,y,min(1.75,roofZ-.035),.10)
        sideVisionSample=HullSurface(side,1.03,1.60)
        sideVisionX=sideVisionSample[0].x if sideVisionSample else side*.82
        cutter=Box('SideVisionOpeningCutter',(sideVisionX,1.03,1.60),(.25,.155,.185),black,hull,0)
        CutOpening([upperBody],cutter)
        Box('SideVisionRecess',(sideVisionX-side*.09,1.03,1.60),(.012,.160,.190),black,hull,.003)
        sideHatch=Node('Node_SideVisionFlap'+('Left' if side<0 else 'Right'),(sideVisionX+side*.025,1.135,1.60),hull,axis='localZ',rangeDegrees=[-175,0] if side<0 else [0,175])
        Box('SideVisionCover',(0,-.102,0),(.024,.20,.22),armor,sideHatch,.004)
        Tube('SideVisionHinge',(0,0,-.11),(0,0,.11),.012,steel,sideHatch)
        BuildTrackFender(quality,hull,side,armor,Mesh,Tube)
        for y in [-1.88,-1.15,-.45,.28,1.00]:
            PolygonPrism('FenderSupport',[(y-.09,1.29),(y+.09,1.29),(y-.06,1.27)],'X',.025,(side*.92,0,0),armor,hull)
        # The primary photo puts this thin inner guide behind the idler axis,
        # not ahead of it. Keep its sheet inboard of the moving track belt.
        deflectorOutline=[(1.70,1.175),(1.70,1.51),(1.32,1.40),(1.32,1.16),(1.67,1.14),(1.686,1.145),(1.697,1.158)]
        PolygonPrism('FrontMudDeflector',deflectorOutline,'X',.004,(side*.690,0,0),armor,hull,.0008 if quality=='High' else 0)
        a=Vector((1.682,1.488));b=Vector((1.339,1.179));direction=(b-a).normalized();normal=Vector((-direction.y,direction.x))*.010
        rib=[tuple(a-normal),tuple(a+normal),tuple(b+normal),tuple(b-normal)]
        PolygonPrism('DeflectorPressedRib',rib,'X',.006,(side*.695,0,0),armor,hull,.001 if quality=='High' else 0)
        Tube('DeflectorTopHem',(side*.690,1.70,1.51),(side*.690,1.32,1.40),.005,armor,hull,12 if quality=='High' else 8)
        for y in [1.37,1.64]:HexBolt((side*.696,y,1.17),(side,0,0),hull,.0065,.006)
    # Bolted rear engine deck, louvred cooling doors, exhaust and guard cage.
    rearSlope=math.atan2(.37,1.42)
    engine=Node('Node_EngineDeck',(0,-1.43,1.485),hull)
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
    exhaust=Node('Node_ExhaustGuard',(-.76,-1.68,1.39),hull)
    Tube('ExhaustSilencer',(0,.42,.06),(0,-.42,.06),.098,materials['Exhaust'],exhaust,32)
    Tube('ExhaustExit',(0,-.42,.06),(0,-.55,.11),.035,materials['Exhaust'],exhaust,16)
    BuildPerforatedGuard(quality,exhaust,armor,materials['Guard'],Mesh,PolygonPrism,HexBolt)
    for y in [-.34,.34]:
        Box('ExhaustMount',(0,y,-.04),(.24,.05,.06),armor,exhaust)
    # Rear-facing round lamp visible beside the shield in the running-car view.
    lamp=Node('Node_RearLamp',(-.76,-2.17,1.43),hull,reconstruction='glazed round fitting follows Tsuchiura rear photograph')
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
    BuildChannelTail(quality,hull,armor,Mesh,PolygonPrism,HexBolt)
    return hull


def Wheel(parent, name, position, radius, width=.23, side=1, road=True):
    pivot=Node(name,position,parent,axis='localX',radiusM=radius)
    armor=materials['Armor']
    steel=materials['Steel']
    if road:
        # Two flanged roadwheel discs straddle the guide teeth.
        for sign in [-1,1]:
            x=.057
            if quality=='High':
                profile=[(.018,x-.026),(radius*.62,x-.026),(radius*.87,x-.015),(radius*.94,x-.024),(radius,x-.021),(radius,x+.021),(radius*.89,x+.021),(radius*.83,x-.004),(radius*.60,x-.015),(radius*.40,x-.015),(.035,x+.025),(.018,x+.025)]
                profile=[(r,sign*offset) for r,offset in profile]
                Lathe('PressedRoadWheel',profile,(0,0,0),armor,pivot,'X',segments//2)
                rim=[(r,sign*offset) for r,offset in [(radius*.98,x-.022),(radius*1.006,x-.022),(radius*1.006,x+.022),(radius*.98,x+.022)]]
                Lathe('RoadRimWear',rim,(0,0,0),materials['Rubber'],pivot,'X',segments//2,closeProfile=True)
            else:
                # The old intermediate back ring was exactly coplanar. Its
                # removal preserves both faces and spends no silhouette detail.
                profile=[(.018,x-.020),(radius,x-.020),(radius,x+.020),(radius*.85,x-.003),(radius*.60,x-.015),(.034,x-.015),(.034,x+.020),(.018,x+.020)]
                profile=[(r,sign*offset) for r,offset in profile]
                disc=Lathe('PressedRoadWheel',profile,(0,0,0),armor,pivot,'X',16,capEnds=False)
                disc.data.materials.append(materials['Rubber'])
                for polygon in disc.data.polygons:
                    if 16<=polygon.index<2*16:polygon.material_index=1
        hub=Lathe('HubCap',[(.025,side*.077),(.025,side*.090),(.018,side*.096)],(0,0,0),armor,pivot,'X',24 if quality=='High' else 12)
        if quality!='High':
            # Its rear disk lies inside the wheel's coplanar hub annulus and
            # the through axle. Remove only that fully buried disk, retaining
            # the visible turned sides/front and all pressed-wheel geometry.
            bm=bmesh.new();bm.from_mesh(hub.data)
            buried=[face for face in bm.faces if len(face.verts)==12 and all(abs(v.co.x-side*.077)<1e-6 for v in face.verts)]
            assert len(buried)==1
            bmesh.ops.delete(bm,geom=buried,context='FACES_ONLY');bm.to_mesh(hub.data);bm.free()
        HexBolt((side*.097,0,0),(side,0,0),pivot,.011,.008)
        Tube('RoadHubNeck',(side*.065,0,0),(side*.080,0,0),.022,armor,pivot,16 if quality=='High' else 8)
        Tube('RoadInnerAxle',(-.105,0,0),(.105,0,0),.020,armor,pivot,16 if quality=='High' else 8,capEnds=quality=='High')
    else:
        innerRadius=.016 if radius<.10 else .035
        bossRadius=.025 if radius<.10 else .080
        hubRadius=.012 if radius<.10 else .065
        for discSign in [-1,1]:
            if radius>.2:
                CastWheelFlange(pivot,radius,discSign,'RearSprocket' in name)
            else:
                x=.057
                profile=[(innerRadius,x-.024),(radius*.67,x-.024),(radius*.90,x-.020),(radius,x-.020),(radius,x+.020),(radius*.91,x+.020),(radius*.84,x+.004),(bossRadius,x+.004),(bossRadius*.81,x+.027),(innerRadius,x+.027)] if quality=='High' else [(innerRadius,x-.020),(radius,x-.020),(radius,x+.020),(radius*.82,x+.002),(bossRadius,x+.002),(innerRadius,x+.024)]
                Lathe('IdlerPressedDisc',[(r,discSign*offset) for r,offset in profile],(0,0,0),armor,pivot,'X',segments if quality=='High' else 12)
        Lathe('IdlerCentralHub',[(hubRadius*.84,-width/2),(hubRadius,-width*.4),(hubRadius,width*.4),(hubRadius*.84,width/2)],(0,0,0),armor,pivot,'X',24 if quality=='High' else 12)
        if radius<.1:HexBolt((side*.089,0,0),(side,0,0),pivot,.008,.006)
    return pivot


def Suspension(hull, side):
    label='Left' if side<0 else 'Right'
    group=Node('Node_Suspension'+label,parent=hull)
    armor=materials['Armor']
    steel=materials['Steel']
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
    armOutline=[(leadingWheelY-.04,.23),(leadingWheelY+.06,.24),(leadingWheelY+.19,.49),(leadingWheelY+.30,.67),(leadingWheelY+.25,.73),(leadingWheelY+.11,.58),(leadingWheelY-.01,.36)]
    PolygonPrism('LeadingWheelForgedArm',armOutline,'X',.055,(side*.978,0,0),armor,group,.005)
    for y,z in [(leadingWheelY+.06,.32),(leadingWheelY+.16,.49),(leadingWheelY+.23,.63)]:
        HexBolt((side*1.010,y,z),(side,0,0),group,.014,.011)
    idler=Wheel(group,'Node_FrontIdler'+label,(x,frontIdlerY,.850),.433,.25,side,False)
    idler['geometryRadiusM']=.433
    idler['radiusM']=.451
    rear=Wheel(group,'Node_RearSprocket'+label,(x,rearSprocketY,.790),.390,.25,side,False)
    rear['geometryRadiusM']=sprocketPitchRadius-.006
    rear['radiusM']=sprocketPitchRadius
    rear['toothCount']=18
    coverOutline=[(-1.70,.980),(-2.15,.980)]
    coverOutline.extend((rearSprocketY-.170*math.cos(angle),.790+.190*math.sin(angle)) for angle in [math.pi/2-i*math.pi/12 for i in range(13)])
    coverOutline.extend([(-2.14,.600),(-1.70,.640)])
    PolygonPrism('RearDriveBearingCover',coverOutline,'X',.014,(side*1.037,0,0),armor,group,.004)
    bossProfile=[(.104,0),(.104,.005),(.086,.015),(.077,.018)]
    Lathe('RearDriveBearingBoss',[(r,side*offset) for r,offset in bossProfile],(side*1.044,rearSprocketY,.790),armor,group,'X',40 if quality=='High' else 24)
    HexBolt((side*1.064,rearSprocketY,.790),(side,0,0),group,.033,.020)
    for i in range(6):
        angle=2*math.pi*i/6;HexBolt((side*1.064,rearSprocketY+math.cos(angle)*.078,.790+math.sin(angle)*.078),(side,0,0),group,.007,.006)
    for y in [-1.75,-1.88,-2.01,-2.14]:Rivet((side*1.047,y,.958),(side,0,0),group,.009)
    for angle in [math.pi/2-i*math.pi/6 for i in range(7)]:Rivet((side*1.047,rearSprocketY-.148*math.cos(angle),.790+.165*math.sin(angle)),(side,0,0),group,.008)
    for i,(y,z) in enumerate(returnRollerStations):
        Wheel(group,'Node_ReturnRoller%s%02d'%(label,i+1),(x,y,z),.082,.13,side,False)
        Tube('RollerBracket',(side*.65,y,z-.05),(side*.85,y,z),.025,armor,group)
    # Front idler tensioning housing is fixed; the wheel rotates behind it.
    def CasePoint(y,z):
        def Smooth(value):
            t=max(0,min(1,value));return t*t*(3-2*t)
        return (y,z-.17*Smooth((y-.65)/.65)*Smooth((z-.40)/.45))
    plate=[(2.04,1.10),(1.94,1.22),(1.33,1.22),(1.22,1.18),(1.18,1.03),(.91,.87),(.68,.67),(.45,.59),(.45,.38),(.78,.37),(1.22,.38),(1.48,.42),(1.72,.51),(1.99,.68),(2.05,.83)]
    plate=[CasePoint(y,z) for y,z in plate]
    PolygonPrism('TensionerHousing',plate,'X',.036,(side*1.044,0,0),armor,group,.004)
    if quality in ['High','Game']:
        # Raised stamped reinforcement visible below the idler adjuster. Its
        # relief/fasteners project into the game's dedicated normal/ORM atlas.
        rail=[CasePoint(y,z) for y,z in [(2.00,.83),(1.86,.83),(1.74,.91),(1.63,.93),(1.30,.93),(1.18,.89),(1.02,.74),(.82,.60),(.66,.58)]]
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
        a=CasePoint(*a);b=CasePoint(*b)
        RivetLine((side*1.061,a[0],a[1]),(side*1.061,b[0],b[1]),.11,(side,0,0),group,.010)
    Tube('TensionerGreaseCylinder',(side*1.044,1.57,.85),(side*1.044,2.04,.85),.045,armor,group,20)
    for z in [.788,.915]:
        Box('TensionerClampRail',(side*1.053,1.805,z),(.025,.47,.034),armor,group,.002)
        for j in range(6):HexBolt((side*1.070,1.58+j*.087,z),(side,0,0),group,.0105,.009)
    for y in [1.565,2.044]:
        Lathe('GreaseCylinderEndCollar',[(.044,-.007),(.049,0),(.049,.010),(.040,.018)],(side*1.044,y,.85),armor,group,'Y',24 if quality=='High' else 16)
    HexBolt((side*1.044,2.066,.85),(0,1,0),group,.019,.023)
    Tube('GreaseCylinderLockWire',(side*1.067,2.058,.834),(side*1.075,2.034,.870),.003,steel,group,8)
    # Sloping removable suspension covers, folded vertical bottom skirts.
    for panel,(frontY,rearY) in enumerate([(1.51,.48),(.48,-.61),(-.61,-1.67)]):
        panelNode=Node('Node_SuspensionCover%s%02d'%(label,panel+1),(side*.754,frontY,1.045),group,axis='localY',rangeDegrees=[0,45])
        length=frontY-rearY
        vertices=[(0,0,0),(0,-length,0),(side*.276,-length,-.446),(side*.276,0,-.446),(side*.276,0,-.675),(side*.276,-length,-.675)]
        Mesh('SlopingSuspensionCover',vertices,[(0,1,2,3),(3,2,5,4)],armor,panelNode,0)
        solid=panelNode.children[-1].modifiers.new('ArmorSheetThickness','SOLIDIFY'); solid.thickness=.008
        for y in [-.04,-length+.04]:
            for t in [0,.25,.5,.75,1]:
                Rivet((side*(.276*t+.006),y,-.446*t+.003),(side*.850,0,.526),panelNode,.007)
        # Same-car originals17/19 resolve a middle hinge row in the slope and
        # three hinges per panel at the lower fold. The old six-per-panel
        # cylinders duplicated the joints and omitted every middle leaf.
        slopeAngle=side*math.atan2(.446,.276)
        slopeNormal=Vector((side*.850,0,.526))
        for y in [-.08,-length*.50,-length+.08]:
            center=Vector((side*.138,y,-.223))+slopeNormal*.004
            leaf=Box('SuspensionMiddleHingeLeaf',center,(.073,.073,.002),armor,panelNode,.0008 if quality=='High' else 0)
            leaf.rotation_euler.y=slopeAngle
            pinCenter=center+slopeNormal*.004
            Tube('SuspensionMiddleHinge',pinCenter+Vector((0,-.038,0)),pinCenter+Vector((0,.038,0)),.0065,armor,panelNode,12 if quality=='High' else 6)
            for delta in [-.026,.026]:
                point=center+Vector((side*.526*delta,0,-.850*delta))+slopeNormal*.0015
                Rivet(point,slopeNormal,panelNode,.0045)
            Tube('SkirtHinge',(side*.282,y-.032,-.446),(side*.282,y+.032,-.446),.007,armor,panelNode,12 if quality=='High' else 6)
            Box('SkirtHingeLeaf',(side*.282,y,-.463),(.002,.070,.034),armor,panelNode,.0008 if quality=='High' else 0)
            for dy in [-.023,.023]:Rivet((side*.284,y+dy,-.475),(side,0,0),panelNode,.0045)
        # The vertical skirt joins have paired upright rivets, rather than the
        # unsupported long horizontal row across each blank lower sheet.
        for y in [-.023,-length+.023]:
            for z in [-.505,-.578,-.651]:Rivet((side*.283,y,z),(side,0,0),panelNode,.006)
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
        circles=[(frontIdlerY,.85,.451),(rearSprocketY,.79,sprocketPitchRadius),(leadingWheelY,leadingWheelHeight,leadingWheelPitchRadius),(roadWheelPairs[0][0],roadWheelHeight,roadWheelRadius+.024),(roadWheelPairs[-1][-1],roadWheelHeight,roadWheelRadius+.024)]
        points=[]
        for y,z,radius in circles:
            points.extend((y+radius*math.cos(i*2*math.pi/240),z+radius*math.sin(i*2*math.pi/240)) for i in range(240))
        hull=ConvexHull(points)
        frontIndex=max(range(len(hull)),key=lambda i:hull[i][0])
        lower=hull[:frontIndex+1]
        # The heavy upper run rests on its four rollers and sags between them;
        # a single convex envelope bridges over the photographed lower row.
        supports=[(frontIdlerY,.85,.451)]+[(y,z,.106) for y,z in returnRollerStations]+[(rearSprocketY,.79,sprocketPitchRadius)]
        sagDepths=[.065,.025,.025,.025,.060]
        def UpperHeight(y):
            candidates=[z+math.sqrt(max(0,radius*radius-(y-center)**2)) for center,z,radius in supports if abs(y-center)<=radius]
            if rearSprocketY<=y<=frontIdlerY:
                for i,(a,b) in enumerate(zip(supports,supports[1:])):
                    if b[0]<=y<=a[0]:
                        t=(a[0]-y)/(a[0]-b[0])
                        candidates.append((a[1]+a[2])*(1-t)+(b[1]+b[2])*t-4*sagDepths[i]*t*(1-t))
                        break
            return max(candidates)
        start=lower[-1][0];end=lower[0][0];steps=math.ceil((start-end)/.004)
        upper=[(start+(end-start)*i/steps,UpperHeight(start+(end-start)*i/steps)) for i in range(1,steps)]
        hull=lower+upper
        trackPath=[]
        trackLength=0.0
        for i,a in enumerate(hull):
            b=hull[(i+1)%len(hull)]
            distance=math.hypot(b[0]-a[0],b[1]-a[1])
            trackPath.append({'a':a,'b':b,'s':trackLength,'length':distance})
            trackLength+=distance
        # One complete belt must pass exactly the same number of teeth as shoes.
        linkCount=trackLinksPerSide
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
    pitch=trackLength/trackLinksPerSide
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
        BuildCastTrackShoe(quality,pitchScale,steel,pin,Mesh,PolygonPrism,RoundedRectangle,CutOpening,Lathe,Tube)
        shoeObjects=sorted(set(bpy.data.objects)-before,key=lambda obj:obj.name)
        template=JoinObjects(shoeObjects,'Mesh_CastTrackShoe',None)
        trackLinkMesh=template.data
        bpy.data.objects.remove(template,do_unlink=True)
    count=trackLinksPerSide
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
    bodyCompression=.500/.604
    def BodyZ(z):
        return z if z<=.055 else .055+(z-.055)*bodyCompression
    cupolaRaise=.672-BodyZ(.672)
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
    cutter=Lathe('CommanderOpeningCutter',[(.289,-.10),(.289,.10)],(0,-.13,.666),shadow,turret,count=64 if quality=='High' else 32)
    CutOpening([roof],cutter)
    Lathe('TurretInteriorShadow',[(.288,0),(.288,.008)],(0,-.13,.535),shadow,turret,count=48 if quality=='High' else 24)
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
    # Paired stiffener seams and the lower mounting groups visible in the
    # primary original. The old seven uniform five-pair ladders omitted the
    # characteristic wider groups around the lower side attachment points.
    sideSeams=[1.95,2.49,3.045]
    seamAngles=sideSeams+[math.pi-angle for angle in sideSeams]+[-1.75,-math.pi+1.75]
    for angle in seamAngles:
        for offset in [-.020,.020]:
            for z in [.11,.21,.31,.41,.51,.61]:
                a=angle+offset
                point=Vector(PlanPoint(a,z));normal=PlanNormal(a,z)
                Rivet(point+normal*.001,normal,turret,.009)
    for seam in [2.49,3.045,math.pi-2.49,math.pi-3.045]:
        for offset in [-.20,.20]:
            for z in [.105,.175,.245]:
                angle=seam+offset;point=Vector(PlanPoint(angle,z));normal=PlanNormal(angle,z)
                Rivet(point+normal*.001,normal,turret,.009)
    # Gun mantlet is trapezoidal, with separate pitch and recoil nodes.
    mantletOutline=[(-.265,.1214),(.265,.1214),(.244,.5805),(-.244,.5805)]
    mantletFrame=PolygonPrism('MantletFrame',mantletOutline,'Y',.024,(0,.675,0),armor,turret,.002)
    cutter=PolygonPrism('MantletActualOpening',RoundedRectangle(.380,.338,.006,4 if quality=='High' else 2),'Y',.20,(0,.675,.351),shadow,turret,0)
    CutOpening([mantletFrame],cutter)
    collarVertices=[]
    for frontSide in [False,True]:
        for x,z in mantletOutline:
            scale=(.717-(z-.055)/.604*.097)/.717
            collarVertices.append((x,.663 if frontSide else .640*scale-.005,z))
    collar=Mesh('MantletWeldedCollar',collarVertices,[(i,(i+1)%4,(i+1)%4+4,i+4) for i in range(4)],armor,turret)
    solid=collar.modifiers.new('CollarSheetThickness','SOLIDIFY');solid.thickness=.016
    Box('MantletInteriorShadow',(0,.612,.351),(.380,.008,.338),shadow,turret,.001)
    for x in [-.225,.225]:
        RivetLine((x,.6875,.148),(x,.6875,.552),.085,(0,1,0),turret,.009)
    for z in [.144,.553]:
        for j in range(6):HexBolt((-.20+j*.080,.6875,z),(0,1,0),turret,.012,.008)
    gunPitch=Node('Node_MainGunPitch',(0,.704,.295),turret,axis='localX',rangeDegrees=[-12,20])
    for x in [-.162,.162]:
        Box('GunYokeSide',(x,.010,0),(.030,.13,.248),armor,gunPitch,.004)
    for z in [-.108,.126]:
        Box('GunYokeCrossmember',(0,.010,z),(.34,.08,.025),armor,gunPitch,.003)
    for x in [-.18,.18]:
        Lathe('GunTrunnion',[(.071,-.014),(.071,.014)],(x,0,0),steel,gunPitch,'X',24)
    recoil=Node('Node_MainGunRecoil',(.075,.025,0),gunPitch,axis='localY',rangeM=[-.10,0])
    BuildMainGunHardware(quality,gunPitch,recoil,armor,steel,shadow,Mesh,PolygonPrism,RoundedRectangle,CutOpening,Lathe,Tube,Box)
    # Photographs show the exposed tube appreciably shorter than the first pass.
    bpy.context.view_layer.update()
    for gunPart in recoil.children:
        if gunPart.type=='MESH':
            gunPart.matrix_basis=Matrix.Diagonal((1,.80,1,1))@gunPart.matrix_basis
    # Rear-facing turret machine gun remains a real independent pivot.
    rearMg=Node('Node_TurretMachineGun',(-.420,-.665,BodyZ(.355)),turret,axis='localX',rangeDegrees=[-10,10])
    rearMg.rotation_euler.z=math.radians(135)
    Lathe('TurretMgFlange',[(.135,-.01),(.135,.015),(.110,.035)],(0,0,0),armor,rearMg,'Y',32)
    Lathe('TurretMgBall',[(.107,.015),(.100,.068),(.047,.100)],(0,0,0),armor,rearMg,'Y',32)
    Lathe('TurretMgJacket',[(.037,.080),(.034,.30),(.028,.36),(.017,.36),(.017,.29)],(0,0,0),steel,rearMg,'Y',20)
    # Low Otsu cupola; split hatches have their own longitudinal hinges.
    # Keep the photographed closed/open cap height while exposing the riser
    # above the shorter main shell. The old tall shell hid this cylinder.
    cupola=Node('Node_CommanderCupola',(0,-.13,BodyZ(.672)),turret)
    Lathe('CupolaRing',[(.290,0),(.310,.010),(.310,.040+cupolaRaise),(.307,.050+cupolaRaise),(.302,.050+cupolaRaise),(.302,.010),(.290,.010)],(0,0,0),armor,cupola, count=64 if quality=='High' else 32,closeProfile=True)
    for side in [-1,1]:
        hingeOffset=.360 if side>0 else .260
        hingeHeight=(.020 if side>0 else .055)+cupolaRaise
        # The turned front skirt otherwise crossed the seat by1.6mm at rest.
        closedOffset=.055-(hingeHeight-cupolaRaise)+(.002 if side>0 else 0)
        hatch=Node('Node_CommanderHatch'+('Front' if side>0 else 'Rear'),(0,side*hingeOffset,hingeHeight),cupola,axis='localX',rangeDegrees=[-180,0] if side>0 else [0,180],hingeReconstruction='front hinge outreach calibrated from the 2007 open-cover silhouette; closed leaf position retained')
        ShallowHatchLid(hatch,side,hingeOffset,closedOffset)
        for x in [-.145,.145]:
            Tube('CommanderHatchPin',(x-.035,0,0),(x+.035,0,0),.012,steel,hatch)
            Tube('CommanderFixedBearing',(x-.038,side*hingeOffset,hingeHeight),(x+.038,side*hingeOffset,hingeHeight),.018,armor,cupola)
            if side>0:
                a=Vector((0,0));b=Vector((-.100,closedOffset));d=(b-a).normalized();n=Vector((-d.y,d.x))*.007
                PolygonPrism('CommanderHingeOutreach',[tuple(a+n),tuple(a-n),tuple(b-n),tuple(b+n)],'X',.030,(x,0,0),armor,hatch,.001 if quality=='High' else 0)
                Box('CommanderBearingFoot',(x,side*hingeOffset,.007+cupolaRaise),(.090,.060,.014),armor,cupola,.002)
        Tube('CommanderHatchHandle',(-.045,side*(.12-hingeOffset),.029+closedOffset),(.045,side*(.12-hingeOffset),.029+closedOffset),.009,steel,hatch)
    # Rear hatch and rectangular observation port: inset panels and fasteners.
    rearVision=Node('Node_TurretRearVision',(.34,-.73,BodyZ(.35)),turret,axis='localZ')
    rearVision.rotation_euler.z=.53
    Box('RearVisionFrame',(0,0,0),(.24,.024,.21),armor,rearVision,.006)
    Box('RearVisionSlot',(0,-.015,.025),(.13,.005,.014),shadow,rearVision,.001)
    for x in [-.095,.095]:
        for z in [-.075,.075]:
            Rivet((x,-.016,z),(0,-1,0),rearVision,.008)
    for obj in list(turret.children):
        if obj.type!='MESH':continue
        if obj.name.startswith(('Rivet','HexFastener')):
            normal=obj.rotation_quaternion@Vector((0,0,1));normal.z/=bodyCompression
            obj.location.z=BodyZ(obj.location.z);obj.rotation_quaternion=normal.normalized().to_track_quat('Z','Y')
            continue
        matrix=obj.matrix_basis.copy();inverse=matrix.inverted()
        for vertex in obj.data.vertices:
            point=matrix@vertex.co;point.z=BodyZ(point.z);vertex.co=inverse@point
        obj.data.update()
    turret['bodyHeightM']=.500
    turret['cupolaRiserAddedM']=cupolaRaise
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
    for name,color,roughness,metallic in [('Armor',(.40,.40,.40),.78,0),('Steel',(.34,.34,.34),.72,0),('Track',(.32,.32,.32),.80,0),('Rubber',(.26,.26,.26),.90,0),('Shadow',(.09,.09,.09),.90,0),('Exhaust',(.30,.30,.30),.85,0),('Glass',(.65,.65,.65),.24,0),('Guard',(.40,.40,.40),.78,0),('Ground',(.22,.22,.22),.9,0)]:
        Material(name,color,roughness,metallic)
    bpy.context.scene.unit_settings.system='METRIC'
    bpy.context.scene.unit_settings.scale_length=1
    bpy.context.scene['BlenderMcpTask']='Type89MediumTank'
    bpy.context.scene['Type89Stage']=stage
    bpy.context.scene['Type89Quality']=quality
    root=Node('Model_Type89MediumTank',assetVersion='20261024GeometryV26',geometryVersion='20261024GeometryV26',variant='Type89Otsu_Tsuchiura',sourceNose='+Y',exportNose='-Z',units='metres',acceptance='IN_PROGRESS_GRAY')
    recipe=Path(__file__).read_bytes()+(Path(__file__).parent/'Script_Type89DetailedParts.py').read_bytes()
    root['geometryRecipeSha256']=hashlib.sha256(recipe).hexdigest()
    hull=HullGeometry(root)
    BuildTrackPath()
    motionPath={'length':trackLength,'segments':trackPath,'linksPerSide':trackLinksPerSide,'pitchM':trackLength/trackLinksPerSide,'sprocketTeeth':18,'sprocketPitchRadiusM':sprocketPitchRadius,'units':'metres','authoringUp':'+Z','authoringNose':'+Y','runtimeUp':'+Y','runtimeNose':'-Z'}
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
