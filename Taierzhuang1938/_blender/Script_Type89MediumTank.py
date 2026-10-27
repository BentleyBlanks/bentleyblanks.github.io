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
from types import SimpleNamespace
from mathutils import Vector, Matrix
sys.path.insert(0,str(Path(__file__).resolve().parent))
from Script_Type89DetailedParts import BuildPerforatedGuard,BuildChannelTail,BuildMainGunHardware,BuildCastTrackShoe,BuildTrackFender,BuildBowMgJacket,BuildSideVisionLatch,BuildRearDriveBearingCover,BuildRearApronDetail,RefineTensionerContour,RefineTensionerRail,SampleTrackFenderHeight
from Script_Type89TrackPath import BuildTangentTrackPath
from Script_Type89CastWheel import BuildCastWheelFlange
from Script_Type89RearGunExterior import BuildRearGunExterior
from Script_Type89Tensioner import BuildTensionerFace
from Script_Type89SkirtAssembly import BuildSkirtAssembly
from Script_Type89BogieUnits import BuildBogieUnits
from Script_Type89Underfloor import BuildUnderfloor
from Script_Type89OuterBogieCheek import BuildOuterBogieCheeks
from Script_Type89GlbCleanup import CleanGlb
from Script_Type89FrontDoor import BuildFrontDoor
from Script_Type89FrontRoundCover import BuildFrontRoundCover
from Script_Type89BowMachineGun import BuildBowMachineGunMount,CutBowMountBore,ApplyBowAssemblyScale
from Script_Type89TurretApertures import BuildTurretSmallAperture
from Script_Type89RearTurretCover import BuildRearTurretCover

repoDir = Path(__file__).resolve().parents[2]
sourceRoot = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank')
reviewRoot = repoDir / 'Taierzhuang1938/_shots/Type89MediumTank'
sourceDir = sourceRoot / os.environ.get('TYPE89_SOURCE_SUBDIR','')
reviewDir = reviewRoot / os.environ.get('TYPE89_REVIEW_SUBDIR','')
assert sourceDir.resolve().is_relative_to(sourceRoot.resolve()) and reviewDir.resolve().is_relative_to(reviewRoot.resolve())
assetDir = repoDir / 'Taierzhuang1938/Model/Type89MediumTank'
quality = os.environ.get('TYPE89_QUALITY', 'High')
stage = os.environ.get('TYPE89_STAGE', 'Gray')
segments = 64 if quality == 'High' else 24
parts = {}
materials = {}
partStats = {'rivetHeads':0,'hexFasteners':0}
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
# Denser working reconstruction of the visible exterior. Native17 and2007
# show substantially more than four ribs over the exposed half-circle.
# Conic/occlusion uncertainty still prevents a factory-total certification.
frontIdlerRibCount = 14
# Side19's visible rim and belt envelope contradict the inherited large rear
# wheel. These are working photo/clearance parameters;13teeth/81links are not
# asserted as factory counts. Front idler tooth count still needs photo proof.
rearSprocketY = -2.12
rearSprocketHeight = .777
sprocketTeeth = 13
upperSagDepths = [.065,.025,.025,.025,.010]
refineTensionerDetails = True
tensionerPhotoSettings = json.loads((assetDir/'Data_SkirtAssemblyReconstruction.json').read_text(encoding='utf8'))
runningGearSettings = json.loads((assetDir/'Data_RunningGearReconstruction.json').read_text(encoding='utf8'))
turretPatternSettings = json.loads((assetDir/'Data_TurretFastenerReconstruction.json').read_text(encoding='utf8'))
rearCoverSettings = json.loads((assetDir/'Data_RearTurretCoverReconstruction.json').read_text(encoding='utf8'))
bowMountSettings = json.loads((assetDir/'Data_BowMountReconstruction.json').read_text(encoding='utf8'))
frontDoorSettings = json.loads((assetDir/'Data_FrontDoorReconstruction.json').read_text(encoding='utf8'))
frontRoundCoverSettings = json.loads((assetDir/'Data_FrontRoundCoverReconstruction.json').read_text(encoding='utf8'))
sideHullMountSamples = json.loads((assetDir/'Data_SideHullMountSamples.json').read_text(encoding='utf8'))
# Native19/2007 guard evidence: circular holes, horizontal strip and unequal
# panels. Dimensions/hidden mounts remain reconstruction parameters.
exhaustGuardSettings = {'length':.760,'flatRise':.150,'crownRise':.085,'innerFootLift':.035,'halfWidth':.120,
    'columns':42,'pitch':.018,'holeRadius':.0055,'roundHoles':True,'bandFractions':[0,.286,.576,1],
    'crossBandWidth':.021,'concealExit':True,'lampMountToFender':True,'position':[-.830,-1.695,1.285],
    'silencerHalfLength':.350,'silencerHeight':.110,'mountHeight':.020,'mountWidth':.240,'lampX':-.830}
fenderHeightOffset = -.045
fenderFrontRise = .045
trackPitchM = .150
trackWidthM = .320
trackLinksPerSide = 81
roadWheelPairs = [(.80,.45),(.10,-.25),(-.66,-1.01),(-1.36,-1.71)]
# Primary-photo axle rays and the independent side view agree on a falling
# return run. The previous equal-height row lifted the belt and led its front
# three rollers too far forward.
returnRollerStations = [(.812,1.078),(.049,1.050),(-.686,1.016),(-1.414,.973)]
# Two independent native-photo rim measurements give67.7/68.9mm for the
# visible outer ring. Adopt70mm including its small rolled edge;82mm enlarged
# every return wheel against the measured axle spacing and the big end wheels.
returnRollerRadius = .070


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
    if not closeProfile and capEnds:
        # A planar end plate must not inherit radial cylinder normals. Those
        # bent cap normals projected as inverted black patches on opened lids.
        obj.data.polygons[-2].use_smooth=False
        obj.data.polygons[-1].use_smooth=False
    obj.location = position
    return obj


def Tube(name, start, end, radius, material, parent=None, count=None, capEnds=True):
    delta = Vector(end)-Vector(start)
    obj = Lathe(name, [(radius,0),(radius,delta.length)], start, material, parent, count=count or (16 if quality == 'High' else 8),capEnds=capEnds)
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = delta.to_track_quat('Z', 'Y')
    return obj


def Rivet(position, normal, parent, radius=.009, material=None):
    partStats['rivetHeads']+=1
    height=.005*radius/.009
    if quality!='High':
        # A pressed round head needs actual shoulder volume. A six-face cone
        # projected as chipped holes at the user's inspection distance.
        count=8
        vertices=[(radius*math.cos(i*2*math.pi/count),radius*math.sin(i*2*math.pi/count),0) for i in range(count)]
        vertices.extend((radius*.74*math.cos(i*2*math.pi/count),radius*.74*math.sin(i*2*math.pi/count),height*.70) for i in range(count))
        vertices.append((0,0,height))
        faces=[(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
        faces.extend((i+count,(i+1)%count+count,count*2) for i in range(count))
        obj=Mesh('Rivet',vertices,faces,material or materials['Armor'],parent,smooth=True)
        analytic=[]
        for x,y,z in vertices:
            value=Vector((x/(radius*radius),y/(radius*radius),z/(height*height)))
            analytic.append(tuple(value.normalized()) if value.length else (0,0,1))
        obj.data.normals_split_custom_set_from_vertices(analytic)
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
    partStats['hexFasteners']+=1
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
    # Same-car17/2007 shows the left exterior ribs. The flat face at image
    # right in photo20 is the LEFT wheel's inboard face, and photo17's far
    # wheel corroborates the other flat inboard face. Opposite exterior
    # symmetry remains inferred; do not use a global X sign for both wheels.
    outwardSign=1 if parent.location.x>0 else -1
    return BuildCastWheelFlange(quality,parent,radius,discSign,sprocketPitchRadius,materials['Armor'],Mesh,driven,sprocketTeeth if driven else 18,ribbed=driven or discSign==outwardSign,ribCount=8 if driven else frontIdlerRibCount)


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
    if parent.name=='Node_TurretYaw':
        # V40 used the first lower frame hex head as the join coordinate
        # basis. Removing it must not re-round all untouched turret vertices
        # through a different translated matrix. A zero-geometry authoring
        # anchor retains that basis and contributes no exported component.
        anchor=Mesh('AuthoringTurretJoinBasis',[],[],materials['Armor'],parent)
        anchor.location=(-.20,.6875,.144)
        anchor.rotation_mode='QUATERNION'
        anchor.rotation_quaternion=Vector((0,1,0)).to_track_quat('Z','Y')
        # Fastener pivots were compressed/re-oriented with the500mm turret
        # body before V40 joined them. Repeat that exact float32 path; using
        # the uncompressed144mm location is a different coordinate basis.
        normal=anchor.rotation_quaternion@Vector((0,0,1))
        normal.z/=.500/.604
        anchor.location.z=.055+(anchor.location.z-.055)*(.500/.604)
        anchor.rotation_quaternion=normal.normalized().to_track_quat('Z','Y')
        objects.insert(0,anchor)
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
    supportProfile=hashlib.sha256(json.dumps({'vertices':hullVertices,'faces':hullFaces},separators=(',',':')).encode()).hexdigest()
    assert supportProfile==sideHullMountSamples['supportProfileSha256'],'Side support shape changed; recalibrate mounting samples'
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
    BuildFrontDoor(quality,front,[bowPlate,upperBody,lowerBody],frontDoorSettings,armor,steel,black,Node,Mesh,PolygonPrism,RoundedRectangle,CutOpening,Box,Tube,Lathe,Rivet)
    # Driver's vision flap: vehicle right, not the early-model reversed layout.
    cutter=PolygonPrism('DriverVisionOpeningCutter',RoundedRectangle(.280,.145,.008,3 if quality=='High' else 1),'Y',.30,(.235,-.06,.41),black,front,0)
    CutOpening([bowPlate,upperBody],cutter)
    Box('DriverVisionRecess',(.235,-.085,.41),(.290,.012,.155),black,front,.003)
    vision = Node('Node_DriverVisionFlap',(.235,.047,.595),front,axis='localX',rangeDegrees=[0,105])
    visor=PolygonPrism('DriverOuterVisorLeaf',RoundedRectangle(.42,.36,.027,6 if quality=='High' else 3),'Y',.022,(0,0,-.185),armor,vision,.001)
    # Native16 shows the closed lower half-port recessed behind the peeper
    # face. The hidden blind rotary pocket and its depth are functional
    # reconstruction parameters, rather than verified factory construction.
    # Boolean material transfer must leave the visible return walls painted.
    # A dark cutter introduced an unrelated black inner lip in the V38 bake.
    pocket=Lathe('DriverShutterStoragePocket',[(.078,-.008),(.078,.012)],(0,0,-.185),armor,vision,'Y',64)
    CutOpening([visor],pocket)
    peeper=PolygonPrism('DriverPeeperPlate',RoundedRectangle(.235,.215,.018,6 if quality=='High' else 3),'Y',.012,(0,.020,-.185),armor,vision,.001)
    aperture=[(.070*math.cos(math.pi+i*math.pi/(32 if quality=='High' else 16)),-.185+.070*math.sin(math.pi+i*math.pi/(32 if quality=='High' else 16))) for i in range((32 if quality=='High' else 16)+1)]
    cutter=PolygonPrism('DriverHalfRoundAperture',aperture,'Y',.14,(0,.02,0),black,vision,0)
    CutOpening([visor,peeper],cutter)
    shutter=Node('Node_DriverPortShutter',(0,.003,-.185),vision,axis='localY',rangeDegrees=[0,180],constructionEvidence='Native16 visible recessed face; hidden rotary pocket and20mm closed-face setback are inferred')
    shutterOutline=[(.075*math.cos(i*math.pi/(32 if quality=='High' else 16)),.075*math.sin(i*math.pi/(32 if quality=='High' else 16))) for i in range((32 if quality=='High' else 16)+1)]
    PolygonPrism('DriverRoundShutter',shutterOutline,'Y',.006,(0,0,0),armor,shutter,.0008 if quality=='High' else 0)
    Lathe('DriverShutterKnob',[(.031,0),(.034,.008),(.029,.016)],(0,.038,-.173),armor,vision,'Y',40 if quality=='High' else 20)
    for x in [-.135,.135]:
        Tube('DriverVisorHingePin',(x-.035,0,0),(x+.035,0,0),.014,steel,vision)
        Box('DriverFixedHingeLeaf',(.235+x,.028,.587),(.070,.018,.065),armor,front,.003)
        for dx in [-.021,.021]:HexBolt((.235+x+dx,.040,.569),(0,1,0),front,.007,.006)
    for x in [-.088,.088]:
        for z in [-.263,-.107]:Rivet((x,.029,z),(0,1,0),vision,.012)
    # Separate photographed hood/ball layers, cut on the original hull parts.
    mg=Node('Node_BowMgMount',tuple(bowMountSettings['mountPositionM']),front)
    mgGun=Node('Node_BowMachineGun',(0,.085,0),mg,axis='localZ',rangeDegrees=[-10,10],pitchRangeDegrees=[-8,8],rangeEvidence='Model display limits; not sourced factory arcs')
    mgGun.rotation_euler.x=-frontAngle
    BuildBowMachineGunMount(quality,mg,mgGun,None,bowMountSettings,armor,black,Node,Mesh,PolygonPrism,Lathe,HexBolt,CutOpening,JoinStaticChildren,consolidate=False)
    BuildBowMgJacket(quality,parts['Node_BowMgJacket'],steel,Mesh,PolygonPrism,Lathe,Tube,CutOpening,bowMountSettings)
    ApplyBowAssemblyScale(mg,bowMountSettings)
    root['bowMgCastHoodStudy']='OpenFixedCastHood_SeparateMovingBall_FunctionalBore'
    BuildFrontRoundCover(quality,front,[bowPlate,upperBody],frontRoundCoverSettings,armor,black,Node,Mesh,Lathe,PolygonPrism,RoundedRectangle,CutOpening,Box,Tube,Rivet)
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
        key=str(side)+':'+float(y).hex()+':'+float(z).hex()
        saved=sideHullMountSamples['qualities'][quality]['samples'][key]
        assert bool(hit)==saved['hit'],'Side support visibility changed'
        if not hit:return None
        checkedPoint=Vector(saved['point']);checkedNormal=Vector(saved['normal'])
        # A new hole changes Blender's global Bevel overlap clamp; the
        # diagnostic measured0.64mmat the lower lip. Keep the authored mounts
        # exact and validate seating using the existing rigid-hardware limit.
        # Raw support shape and unchanged output components are checked apart.
        assert (point-checkedPoint).length<sideHullMountSamples['seatToleranceM'],'Checked side mount no longer seats on its support'
        return checkedPoint,checkedNormal
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
        sideVisionY=.950;sideVisionZ=1.565
        sideVisionSample=HullSurface(side,sideVisionY,sideVisionZ)
        sideVisionX=sideVisionSample[0].x if sideVisionSample else side*.82
        sideNormal=sideVisionSample[1] if sideVisionSample else Vector((side,0,.093)).normalized()
        sideUp=(Vector((0,0,1))-sideNormal*sideNormal.z).normalized()
        sideX=sideNormal*side;sideY=sideUp.cross(sideX).normalized()
        sideRotation=Matrix((sideX,sideY,sideUp)).transposed().to_quaternion()
        cutter=Box('SideVisionOpeningCutter',(sideVisionX,sideVisionY,sideVisionZ),(.30,.142,.322),black,hull,0)
        CutOpening([upperBody],cutter)
        frameCenter=Vector((sideVisionX,sideVisionY,sideVisionZ))+sideNormal*.002
        sideFrame=Node('Node_SideVisionFrame'+('Left' if side<0 else 'Right'),frameCenter,hull)
        sideFrame.rotation_mode='QUATERNION';sideFrame.rotation_quaternion=sideRotation
        frame=PolygonPrism('SideVisionRebatedFrame',RoundedRectangle(.195,.390,.010,5 if quality=='High' else 2),'X',.006,(0,0,0),armor,sideFrame,.001)
        cutter=PolygonPrism('SideVisionFrameBore',RoundedRectangle(.142,.322,.006,4 if quality=='High' else 2),'X',.08,(0,0,0),black,sideFrame,0)
        CutOpening([frame],cutter)
        Box('SideVisionRecess',(-side*.075,0,0),(.010,.145,.325),black,sideFrame,0)
        hingeLocation=frameCenter+sideRotation@Vector((side*.014,.086,0))
        sideHatch=Node('Node_SideVisionFlap'+('Left' if side<0 else 'Right'),hingeLocation,hull,axis='localZ',rangeDegrees=[-175,0] if side<0 else [0,175])
        sideHatch.rotation_mode='QUATERNION';sideHatch.rotation_quaternion=sideRotation
        # Back of the closed lid seats half a millimetre beyond the frame's
        # outer face; the old position overlapped its rebate by three mm.
        cover=PolygonPrism('SideVisionRoundedCover',RoundedRectangle(.170,.360,.010,6 if quality=='High' else 3),'X',.008,(-side*.0065,-.086,0),armor,sideHatch,.0008)
        slit=Box('SideVisionTrueSlit',(-side*.0065,-.086,0),(.06,.070,.0025),black,sideHatch,0)
        CutOpening([cover],slit)
        for a,b,moving in [(-.150,-.103,False),(-.102,-.052,True),(-.051,.051,False),(.052,.102,True),(.103,.150,False)]:
            parent=sideHatch if moving else sideFrame
            x=0 if moving else side*.014;y=0 if moving else .086
            Tube('SideVisionInterleavedKnuckle',(x,y,a),(x,y,b),.010,armor,parent,16 if quality=='High' else 10)
        Tube('SideVisionFixedHingePin',(side*.014,.086,-.158),(side*.014,.086,.158),.004,steel,sideFrame,12 if quality=='High' else 8)
        for z in [-.115,.115]:
            Box('SideVisionHingeLug',(-side*.005,-.025,z),(.014,.055,.025),armor,sideHatch,.001)
            Rivet((-side*.002,-.027,z),(side,0,0),sideHatch,.007)
        for z in [-.105,.105]:Rivet((-side*.002,-.130,z),(side,0,0),sideHatch,.006)
        BuildSideVisionLatch(quality,side,sideHatch,armor,steel,Node,Box,Tube,Lathe)
        BuildTrackFender(quality,hull,side,armor,Mesh,Tube,fenderHeightOffset,fenderFrontRise)
        for y in [-1.88,-1.15,-.45,.28,1.00]:
            PolygonPrism('FenderSupport',[(y-.09,1.29+fenderHeightOffset),(y+.09,1.29+fenderHeightOffset),(y-.06,1.27+fenderHeightOffset)],'X',.025,(side*.92,0,0),armor,hull)
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
    guardSettings=exhaustGuardSettings or {}
    exhaust=Node('Node_ExhaustGuard',tuple(guardSettings.get('position',[-.76,-1.68,1.39])),hull)
    silencerHalfLength=guardSettings.get('silencerHalfLength',.42);silencerHeight=guardSettings.get('silencerHeight',.06)
    Tube('ExhaustSilencer',(0,silencerHalfLength,silencerHeight),(0,-silencerHalfLength,silencerHeight),.098,materials['Exhaust'],exhaust,32)
    if not guardSettings.get('concealExit'):
        Tube('ExhaustExit',(0,-silencerHalfLength,silencerHeight),(0,guardSettings.get('exitY',-.55),silencerHeight+.05),.035,materials['Exhaust'],exhaust,16)
    BuildPerforatedGuard(quality,exhaust,armor,materials['Guard'],Mesh,PolygonPrism,HexBolt,exhaustGuardSettings)
    for y in [-.34,.34]:
        Box('ExhaustMount',(0,y,guardSettings.get('mountHeight',-.04)),(guardSettings.get('mountWidth',.24),.05,.06),armor,exhaust)
    # Rear-facing round lamp visible beside the shield in the running-car view.
    lamp=Node('Node_RearLamp',(guardSettings.get('lampX',-.76),-2.17,1.43),hull,reconstruction='glazed round fitting follows Tsuchiura rear photograph')
    lamp.rotation_euler.z=math.pi
    Lathe('RearLampHousing',[(.055,-.04),(.094,0),(.104,.055),(.103,.092),(.091,.103)],(0,0,0),armor,lamp,'Y',48 if quality=='High' else 16)
    Lathe('RearLampReflector',[(.006,.012),(.050,.030),(.086,.078),(.089,.098)],(0,0,0),steel,lamp,'Y',48 if quality=='High' else 16)
    Lathe('RearLampBezel',[(.091,.087),(.105,.087),(.105,.106),(.090,.110)],(0,0,0),armor,lamp,'Y',48 if quality=='High' else 16,closeProfile=True)
    lensProfile=[(.0001,.107)]
    lensSteps=12 if quality=='High' else 4
    lensProfile.extend((.089*i/lensSteps,.116+.010*(1-(i/lensSteps)**2)) for i in range(1,lensSteps+1))
    lensProfile.extend([(.089,.106),(.0001,.101)])
    Lathe('RearLampGlass',lensProfile,(0,0,0),materials['Glass'],lamp,'Y',64 if quality=='High' else 16)
    if guardSettings.get('lampMountToFender'):
        lampFoot=SampleTrackFenderHeight(quality,-2.17,fenderHeightOffset)-1.43
        Tube('RearLampStem',(0,0,-.06),(0,0,lampFoot+.008),.016,steel,lamp,16 if quality=='High' else 8)
        Box('RearLampMountingFoot',(0,0,lampFoot+.004),(.070,.060,.008),armor,lamp,.001)
        lamp['mountReconstruction']='Simple stem/foot on the photographed fender; concealed fasteners inferred'
    else:
        Tube('RearLampStem',(0,0,-.06),(0,0,-.18),.016,steel,lamp,16 if quality=='High' else 8)
    BuildChannelTail(quality,hull,armor,Mesh,PolygonPrism,HexBolt)
    # Freeze each original part's outer bevel before adding the concealed MG
    # socket. Otherwise a short edge in the socket changes the global Bevel
    # overlap clamp on distant side supports. The parts are still separate,
    # so unrelated components cannot be retessellated by this operation.
    bpy.context.view_layer.update()
    for original in [bowPlate,upperBody]:
        bpy.context.view_layer.objects.active=original
        for modifier in list(original.modifiers):bpy.ops.object.modifier_apply(modifier=modifier.name)
    mg['boardBoreCoatingRepair']=CutBowMountBore(quality,mg,[bowPlate,upperBody],bowMountSettings,armor,Lathe,CutOpening)
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
                # Original2007 wheels have a broad pressed outer lip and a
                # shallow dish with a rolled transition. The previous narrow
                # lip/deep cone made the small wheels look like toy bowls.
                profile=[(.018,x-.026),(radius*.62,x-.026),(radius*.87,x-.015),(radius*.94,x-.024),
                         (radius,x-.021),(radius,x+.017),(radius*.975,x+.021),
                         (radius*.82,x+.021),(radius*.76,x+.017),(radius*.70,x+.008),
                         (radius*.60,x+.004),(radius*.24,x+.004),(.025,x+.014),(.018,x+.014)]
                profile=[(r,sign*offset) for r,offset in profile]
                disc=Lathe('PressedRoadWheel',profile,(0,0,0),armor,pivot,'X',segments//2)
                # These annuli are pressed planes. Smoothing them into the
                # adjacent rolled edge inflated the photographed flat lip.
                for polygon in disc.data.polygons:
                    if polygon.index//(segments//2) in [6,10,12]:polygon.use_smooth=False
                # The contact band below owns the nominal outer cylinder.
                # Remove the coincident painted wall underneath it, keeping
                # one physical surface instead of inflating the high wheel.
                bm=bmesh.new();bm.from_mesh(disc.data);bm.faces.ensure_lookup_table()
                buried=[face for face in bm.faces if face.index//(segments//2)==4]
                bmesh.ops.delete(bm,geom=buried,context='FACES_ONLY')
                bm.to_mesh(disc.data);bm.free();disc.data.update()
                # A thin contact skin follows the measured radius; the old
                # .6percent oversize inflated high wheels into narrow shoes.
                rim=[(r,sign*offset) for r,offset in [(radius*.98,x-.022),(radius,x-.022),(radius,x+.022),(radius*.98,x+.022)]]
                Lathe('RoadRimWear',rim,(0,0,0),materials['Rubber'],pivot,'X',segments//2,closeProfile=True)
            else:
                # Retain the pressed shoulder and rolled rim in the actual
                # game silhouette. Sixteen-sided bowls lost these transitions
                # even when their high-source normals were projected correctly.
                # Native2007 wheel crops and original20 show a broad shallow
                # pressed face around a compact hub. The former40%-radius,
                # 30mm-high centre cone exaggerated the hub into a bulb.
                profile=[(.018,x-.026),(radius*.62,x-.026),(radius*.87,x-.015),(radius*.94,x-.024),
                         (radius,x-.021),(radius,x+.017),(radius*.975,x+.021),
                         (radius*.82,x+.021),(radius*.76,x+.017),(radius*.70,x+.008),
                         (radius*.60,x+.004),(radius*.24,x+.004),(.025,x+.014),(.018,x+.014)]
                profile=[(r,sign*offset) for r,offset in profile]
                discSegments=32
                disc=Lathe('PressedRoadWheel',profile,(0,0,0),armor,pivot,'X',discSegments,capEnds=False)
                disc.data.materials.append(materials['Rubber'])
                for polygon in disc.data.polygons:
                    if 4*discSegments<=polygon.index<5*discSegments:polygon.material_index=1
                    if polygon.index//discSegments in [6,10,12]:polygon.use_smooth=False
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
        if name.startswith('Node_LeadingWheel'):
            # Native16/20 exposes the inboard centre/hex end as well. Other
            # hidden roadwheel ends and exact bearing internals are not added.
            innerSign=-side
            Lathe('InboardLeadingHubCap',[(.025,innerSign*.077),(.025,innerSign*.090),(.018,innerSign*.096)],(0,0,0),armor,pivot,'X',24 if quality=='High' else 12)
            HexBolt((innerSign*.097,0,0),(innerSign,0,0),pivot,.011,.008)
            Tube('InboardLeadingHubNeck',(innerSign*.065,0,0),(innerSign*.080,0,0),.022,armor,pivot,16 if quality=='High' else 8)
    else:
        innerRadius=.016 if radius<.10 else .035
        bossRadius=.025 if radius<.10 else .080
        hubRadius=.012 if radius<.10 else .065
        for discSign in [-1,1]:
            if radius>.2:
                CastWheelFlange(pivot,radius,discSign,'RearSprocket' in name)
            else:
                x=.057
                profile=[(innerRadius,x-.024),(radius*.67,x-.024),(radius*.90,x-.020),(radius,x-.020),(radius,x+.020),(radius*.91,x+.020),(radius*.84,x+.004),(bossRadius,x+.004),(bossRadius*.81,x+.027),(innerRadius,x+.027)]
                Lathe('IdlerPressedDisc',[(r,discSign*offset) for r,offset in profile],(0,0,0),armor,pivot,'X',segments if quality=='High' else 24)
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
    Wheel(group,'Node_LeadingWheel'+label,(x,leadingWheelY,leadingWheelHeight),leadingWheelRadius,side=side)
    armOutline=[(leadingWheelY-.04,.23),(leadingWheelY+.06,.24),(leadingWheelY+.19,.49),(leadingWheelY+.30,.67),(leadingWheelY+.25,.73),(leadingWheelY+.11,.58),(leadingWheelY-.01,.36)]
    # Both2007 leading-wheel faces are fully visible. The arm belongs between
    # the paired discs; its old X=.978 placed a broad blade in front of the
    # outer dish. Retain the forged support without covering that visible face.
    PolygonPrism('LeadingWheelForgedArm',armOutline,'X',.055,(side*wheelCenterX,0,0),armor,group,.005)
    for index,(y,z) in enumerate([(leadingWheelY+.06,.32),(leadingWheelY+.16,.49),(leadingWheelY+.23,.63)]):
        # The lower head sits inside the paired discs; keep it flush enough
        # to clear the back of the rotating pressed wheel away from its axle.
        HexBolt((side*(wheelCenterX+(.028 if index==0 else .032)),y,z),(side,0,0),group,.014,.003 if index==0 else .006)
    idler=Wheel(group,'Node_FrontIdler'+label,(x,frontIdlerY,.850),.433,.25,side,False)
    idler['geometryRadiusM']=.433
    idler['radiusM']=.451
    idler['ribCountWorking']=frontIdlerRibCount
    idler['ribCountFactoryVerified']=False
    rear=Wheel(group,'Node_RearSprocket'+label,(x,rearSprocketY,rearSprocketHeight),sprocketPitchRadius,.25,side,False)
    rear['geometryRadiusM']=sprocketPitchRadius-.006
    rear['radiusM']=sprocketPitchRadius
    rear['toothCount']=sprocketTeeth
    BuildRearDriveBearingCover(quality,side,group,rearSprocketY,armor,Mesh,PolygonPrism,Lathe,HexBolt,Rivet,rearSprocketHeight,Tube=Tube,CutOpening=CutOpening)
    for i,(y,z) in enumerate(returnRollerStations):
        Wheel(group,'Node_ReturnRoller%s%02d'%(label,i+1),(x,y,z),returnRollerRadius,.13,side,False)
        Tube('RollerBracket',(side*.65,y,z-.05),(side*.85,y,z),.025,armor,group)
    # Front idler tensioning housing is fixed; the wheel rotates behind it.
    def CasePoint(y,z):
        def Smooth(value):
            t=max(0,min(1,value));return t*t*(3-2*t)
        return (y,z-.17*Smooth((y-.65)/.65)*Smooth((z-.40)/.45))
    plate=[(2.04,1.10),(1.94,1.22),(1.33,1.22),(1.22,1.18),(1.18,1.03),(.91,.87),(.68,.67),(.45,.59),(.58,.38),(.78,.37),(1.22,.38),(1.48,.42),(1.72,.51),(1.99,.68),(2.05,.83)]
    plate=[CasePoint(y,z) for y,z in plate]
    if refineTensionerDetails:plate=RefineTensionerContour(plate,.030,5 if quality=='High' else 3)
    def TensionerFace(owner,centerX,normalSign,prefix=''):
        if tensionerPhotoSettings:
            return BuildTensionerFace(quality,owner,centerX,normalSign,prefix,plate,tensionerPhotoSettings,
                armor,steel,PolygonPrism,Mesh,Tube,Box,Lathe,HexBolt,Rivet,RivetLine,CasePoint)
        def FaceX(offset=0):return centerX+normalSign*offset
        PolygonPrism(prefix+'TensionerHousing',plate,'X',.036,(FaceX(),0,0),armor,owner,.004)
        # Preserve the observed pressed strip and fastening stations on each
        # visible face. Inboard offsets/hidden attachment remain reconstructed.
        rail=[CasePoint(y,z) for y,z in [(2.00,.83),(1.86,.83),(1.74,.91),(1.63,.93),(1.30,.93),(1.18,.89),(1.02,.74),(.82,.60),(.66,.58),(.46,.58)]]
        railStations=list(rail)
        if refineTensionerDetails:rail=RefineTensionerRail(rail,5 if quality=='High' else 3)
        railVertices=[]
        for i,(y,z) in enumerate(rail):
            a=Vector(rail[max(0,i-1)]);b=Vector(rail[min(len(rail)-1,i+1)])
            tangent=(b-a).normalized();normal=Vector((-tangent.y,tangent.x))*.017
            for x in [FaceX(.020),FaceX(.028)]:
                railVertices.extend([(x,y+normal.x,z+normal.y),(x,y-normal.x,z-normal.y)])
        railFaces=[]
        for i in range(len(rail)-1):
            base=i*4;nextBase=(i+1)*4
            railFaces.extend([(base,base+1,nextBase+1,nextBase),(base+2,nextBase+2,nextBase+3,base+3),(base,nextBase,nextBase+2,base+2),(base+1,base+3,nextBase+3,nextBase+1)])
        railFaces.extend([(0,2,3,1),tuple(range((len(rail)-1)*4,len(railVertices)))])
        Mesh(prefix+'IdlerStampedFlange',railVertices,railFaces,armor,owner,.002)
        for y,z in railStations:Rivet((FaceX(.029),y,z),(normalSign,0,0),owner,.007)
        for a,b in [((1.34,1.20),(1.92,1.20)),((1.95,1.11),(1.95,.87))]:
            a=CasePoint(*a);b=CasePoint(*b)
            RivetLine((FaceX(.017),a[0],a[1]),(FaceX(.017),b[0],b[1]),.11,(normalSign,0,0),owner,.010)
        Tube(prefix+'TensionerGreaseCylinder',(FaceX(),1.57,.85),(FaceX(),2.04,.85),.045,armor,owner,20)
        for z in [.788,.915]:
            Box(prefix+'TensionerClampRail',(FaceX(.009),1.805,z),(.025,.47,.034),armor,owner,.002)
            for j in range(6):HexBolt((FaceX(.026),1.58+j*.087,z),(normalSign,0,0),owner,.0105,.009)
        for y in [1.565,2.044]:
            Lathe(prefix+'GreaseCylinderEndCollar',[(.044,-.007),(.049,0),(.049,.010),(.040,.018)],(FaceX(),y,.85),armor,owner,'Y',24 if quality=='High' else 16)
        HexBolt((FaceX(),2.066,.85),(0,1,0),owner,.019,.023)
        Tube(prefix+'GreaseCylinderLockWire',(FaceX(.023),2.058,.834),(FaceX(.031),2.034,.870),.003,steel,owner,8)
    TensionerFace(group,side*1.044,side)
    inner=Node('Node_InboardIdlerSupport'+label,parent=group,geometryRole='fixed inboard tensioner face',constructionEvidence='Native17far and20 show the inboard plate/cylinder; exact offsets, paired construction and concealed attachment remain inferred')
    TensionerFace(inner,side*(2*wheelCenterX-1.044),-side,'Inboard')
    # Sloping removable suspension covers, folded vertical bottom skirts.
    # The smaller measured return wheels lower the upper belt. Lower only the
    # inner cover fold20mm; keep the photographed outer fold/bottom in place.
    # This clears the rear top rivets without lifting the belt off its rollers.
    coverInnerHeight=1.025
    coverSlopeDrop=.426
    coverSkirtDrop=.655
    skirtRearBottomHeight=None
    if tensionerPhotoSettings and tensionerPhotoSettings.get('skirtAssembly'):
        skirtRearBottomHeight=BuildSkirtAssembly(quality,side,group,tensionerPhotoSettings,armor,Node,Mesh,Box,Tube,Rivet)
    coverRanges=[] if skirtRearBottomHeight is not None else [(1.51,.48),(.48,-.61),(-.61,-1.67)]
    for panel,(frontY,rearY) in enumerate(coverRanges):
        panelNode=Node('Node_SuspensionCover%s%02d'%(label,panel+1),(side*.754,frontY,coverInnerHeight),group,axis='localY',rangeDegrees=[0,45])
        length=frontY-rearY
        # Original17 exposes a slanted cheek/skirt lap: the lower front corner
        # of the second skirt reaches forward under the tensioner cheek. Keep
        # the cheek's thickness outside the skirt instead of a butt-ended box.
        frontLowerLap=.10 if panel==1 else 0
        vertices=[(0,0,0),(0,-length,0),(side*.276,-length,-coverSlopeDrop),(side*.276,0,-coverSlopeDrop),(side*.276,frontLowerLap,-coverSkirtDrop),(side*.276,-length,-coverSkirtDrop)]
        Mesh('SlopingSuspensionCover',vertices,[(0,1,2,3),(3,2,5,4)],armor,panelNode,0)
        solid=panelNode.children[-1].modifiers.new('ArmorSheetThickness','SOLIDIFY'); solid.thickness=.008
        slopeNormal=Vector((side*coverSlopeDrop,0,.276)).normalized()
        for y in [-.04,-length+.04]:
            for t in [0,.25,.5,.75,1]:
                Rivet((side*(.276*t+.006),y,-coverSlopeDrop*t+.003),slopeNormal,panelNode,.007)
        # Same-car originals17/19 resolve a middle hinge row in the slope and
        # three hinges per panel at the lower fold. The old six-per-panel
        # cylinders duplicated the joints and omitted every middle leaf.
        slopeAngle=side*math.atan2(coverSlopeDrop,.276)
        for y in [-.08,-length*.50,-length+.08]:
            center=Vector((side*.138,y,-coverSlopeDrop*.5))+slopeNormal*.004
            leaf=Box('SuspensionMiddleHingeLeaf',center,(.073,.073,.002),armor,panelNode,.0008 if quality=='High' else 0)
            leaf.rotation_euler.y=slopeAngle
            pinCenter=center+slopeNormal*.004
            Tube('SuspensionMiddleHinge',pinCenter+Vector((0,-.038,0)),pinCenter+Vector((0,.038,0)),.0065,armor,panelNode,12 if quality=='High' else 6)
            for delta in [-.026,.026]:
                point=center+Vector((side*slopeNormal.z*delta,0,-abs(slopeNormal.x)*delta))+slopeNormal*.0015
                Rivet(point,slopeNormal,panelNode,.0045)
            Tube('SkirtHinge',(side*.282,y-.032,-coverSlopeDrop),(side*.282,y+.032,-coverSlopeDrop),.007,armor,panelNode,12 if quality=='High' else 6)
            Box('SkirtHingeLeaf',(side*.282,y,-coverSlopeDrop-.017),(.002,.070,.034),armor,panelNode,.0008 if quality=='High' else 0)
            for dy in [-.023,.023]:Rivet((side*.284,y+dy,-coverSlopeDrop-.029),(side,0,0),panelNode,.0045)
        # The vertical skirt joins have paired upright rivets, rather than the
        # unsupported long horizontal row across each blank lower sheet.
        for y in [-.023,-length+.023]:
            for drop in [.059,.132,.205]:
                lap=frontLowerLap*drop/(coverSkirtDrop-coverSlopeDrop) if y==-.023 else 0
                Rivet((side*.283,y+lap,-coverSlopeDrop-drop),(side,0,0),panelNode,.006)
        if panel==0 and tensionerPhotoSettings:
            for y,z in tensionerPhotoSettings.get('lowerJoinMovingHeadsYZ',[]):
                Rivet((side*.283,y-frontY,z-coverInnerHeight),(side,0,0),panelNode,.006)
    # The raised cheek flange turns onto the adjacent folded cover. Its short
    # bent lap is visible beside the rear-most cheek rivet in original17.
    lapSlopeNormal=Vector((side*coverSlopeDrop,0,.276)).normalized()
    lapEndY=tensionerPhotoSettings.get('foldedLapEndY',.46) if tensionerPhotoSettings else .46
    lapHalfWidth=tensionerPhotoSettings.get('foldedLapHalfWidthM',.014) if tensionerPhotoSettings else .014
    lapStartZ=tensionerPhotoSettings.get('foldedLapStartZ',.580) if tensionerPhotoSettings else .580
    lapEndZ=tensionerPhotoSettings.get('foldedLapEndZ',.580) if tensionerPhotoSettings else .580
    lapSlopeZs=tensionerPhotoSettings.get('foldedLapSlopeZs',[.602,.635]) if tensionerPhotoSettings else [.602,.635]
    lapSlopeOffsets=tensionerPhotoSettings.get('foldedLapSlopeYOffsets',[-.06,-.06]) if tensionerPhotoSettings else [-.06,-.06]
    lapWidthScales=tensionerPhotoSettings.get('foldedLapWidthScales',[1,1,1,1]) if tensionerPhotoSettings else [1,1,1,1]
    lapPath=[Vector((side*1.068,lapEndY+.09,lapStartZ)),Vector((side*1.068,lapEndY,lapEndZ))]
    for dy,z in zip(lapSlopeOffsets,lapSlopeZs):
        y=lapEndY+dy
        surfaceX=.754+.276*(coverInnerHeight-z)/coverSlopeDrop
        lapPath.append(Vector((side*surfaceX,y,z))+lapSlopeNormal*.003)
    lapNormals=[Vector((side,0,0)),Vector((side,0,0)),lapSlopeNormal,lapSlopeNormal]
    lapVertices=[];lapFaces=[]
    for i,point in enumerate(lapPath):
        tangent=(lapPath[min(i+1,len(lapPath)-1)]-lapPath[max(0,i-1)]).normalized()
        width=lapNormals[i].cross(tangent).normalized()*lapHalfWidth*lapWidthScales[i]
        for depth in [-.002,.002]:
            for sign in [-1,1]:lapVertices.append(tuple(point+lapNormals[i]*depth+width*sign))
    for i in range(len(lapPath)-1):
        a=i*4;b=a+4
        lapFaces.extend([(a,a+1,b+1,b),(a+2,b+2,b+3,a+3),(a,b,b+2,a+2),(a+1,a+3,b+3,b+1)])
    lapFaces.extend([(0,2,3,1),(12,13,15,14)])
    Mesh('TensionerSkirtFoldedLap',lapVertices,lapFaces,armor,group,.0007,smooth=True)
    Rivet(lapPath[-1]+lapSlopeNormal*.0025,lapSlopeNormal,group,.006)
    if side<0:BuildRearApronDetail(quality,group,rearSprocketY,rearSprocketHeight,armor,Mesh,PolygonPrism,Lathe,Rivet,Tube,CutOpening,-1.67,coverInnerHeight-coverSlopeDrop,skirtRearBottomHeight if skirtRearBottomHeight is not None else coverInnerHeight-coverSkirtDrop)
    BuildBogieUnits(quality,side,group,runningGearSettings,armor,Node,Mesh,PolygonPrism,HexBolt)
    BuildOuterBogieCheeks(quality,side,group,runningGearSettings,armor,Node,PolygonPrism,Lathe,HexBolt)
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
    global trackPath,trackLength,sprocketPitchRadius,trackPitchM
    settings=SimpleNamespace(frontIdlerY=frontIdlerY,rearSprocketY=rearSprocketY,
        leadingWheelY=leadingWheelY,leadingWheelHeight=leadingWheelHeight,
        leadingWheelPitchRadius=leadingWheelPitchRadius,roadWheelPairs=roadWheelPairs,
        roadWheelHeight=roadWheelHeight,roadWheelRadius=roadWheelRadius,
        returnRollerRadius=returnRollerRadius,returnRollerStations=returnRollerStations,
        trackLinksPerSide=trackLinksPerSide,sprocketPitchRadius=sprocketPitchRadius,
        rearSprocketHeight=rearSprocketHeight,sprocketTeeth=sprocketTeeth,
        upperSagDepths=upperSagDepths,ConvexHull=ConvexHull)
    BuildTangentTrackPath(settings)
    trackPath=settings.trackPath;trackLength=settings.trackLength
    sprocketPitchRadius=settings.sprocketPitchRadius;trackPitchM=settings.trackPitchM



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
    group=Node('Node_Track'+label,parent=hull,loopLengthM=trackLength,widthM=trackWidthM,axis='independentDistanceM')
    steel=materials['Track']
    pin=materials['Steel']
    pitchScale=trackPitchM/.119
    if trackLinkMesh is None:
        before=set(bpy.data.objects)
        BuildCastTrackShoe(quality,pitchScale,steel,pin,Mesh,PolygonPrism,RoundedRectangle,CutOpening,Lathe,Tube)
        shoeObjects=sorted(set(bpy.data.objects)-before,key=lambda obj:obj.name)
        # Preserve the native-photo pattern proportions while correcting the
        # whole casting's transverse width. The366mm prototype exceeded the
        # actual front-photo edges;320mm fits them without moving any axles.
        bpy.ops.object.select_all(action='DESELECT')
        transverse=Matrix.Diagonal((trackWidthM/.366,1,1,1))
        for obj in shoeObjects:
            obj.matrix_world=transverse@obj.matrix_world
            obj.select_set(True)
        bpy.context.view_layer.objects.active=shoeObjects[0]
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        # The casting neck ends at the outside of each paired wheel, rather
        # than crossing its flange after the width correction. Trim only the
        # inner ends of the two outer pin eyes; the centre knuckle/guide and
        # the photographed slot stations retain their scaled locations.
        for obj in shoeObjects:
            if not obj.name.startswith('ShoePinBarrel'):continue
            for vertex in obj.data.vertices:
                if .06<abs(vertex.co.x)<.081:
                    vertex.co.x=math.copysign(.081,vertex.co.x)
            obj.data.update()
        template=JoinObjects(shoeObjects,'Mesh_CastTrackShoe',None)
        # A real fillet trims the outline's former sharp extrema. Fit the
        # evaluated casting, including its rounded silhouette, to the adopted
        # photo-calibrated width instead of assuming the raw polygon survives.
        actualWidth=max(vertex.co.x for vertex in template.data.vertices)-min(vertex.co.x for vertex in template.data.vertices)
        template.scale.x*=trackWidthM/actualWidth
        bpy.context.view_layer.objects.active=template
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
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
    # Retain the complete front wall. Removing a full-height angular strip
    # for the gun left a real exposed gap above and below the mantlet frame.
    count=72 if quality=='High' else 40
    vertices=[]
    for z in [.055,.659]:
        vertices.extend(PlanPoint(2*math.pi*i/count,z) for i in range(count))
    faces=[]
    for i in range(count):
        mid=(i+.5)*2*math.pi/count
        faces.append((i,(i+1)%count,(i+1)%count+count,i+count))
    shell=Mesh('TurretArmoredShell',vertices,faces,armor,turret,smooth=True)
    for polygon in shell.data.polygons:
        if all(abs(shell.data.vertices[i].co.y-.640*((.717-(shell.data.vertices[i].co.z-.055)/.604*.097)/.717))<1e-6 for i in polygon.vertices):polygon.use_smooth=False
    solid=shell.modifiers.new('TurretWallThickness','SOLIDIFY'); solid.thickness=.016
    bpy.context.view_layer.objects.active=shell
    bpy.ops.object.modifier_apply(modifier=solid.name)
    cutter=PolygonPrism('TurretFrontGunOpening',RoundedRectangle(.426,.390,.008,4 if quality=='High' else 2),'Y',.46,(0,.610,.351),shadow,turret,0)
    CutOpening([shell],cutter)
    BuildTurretSmallAperture(quality,turret,shell,turretPatternSettings,armor,shadow,PlanPoint,PolygonPrism,CutOpening)
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
    for x in [-.20,-.12,-.04,.04,.12,.20]:
        z=.622;scale=(.717-(z-.055)/.604*.097)/.717
        Rivet((x,.640*scale+.001,z),PlanNormal(math.pi/2,z),turret,.009)
    # Paired stiffener seams and the lower mounting groups visible in the
    # primary original. The old seven uniform five-pair ladders omitted the
    # characteristic wider groups around the lower side attachment points.
    sideSeams=[1.95,2.49,3.045]
    seamAngles=sideSeams+[math.pi-angle for angle in sideSeams]+[-1.75,-math.pi+1.75]
    for angle in seamAngles:
        observed=next((g for g in turretPatternSettings['groups']if abs(angle-g['angleRadians'])<1e-10),None)
        offsets=observed['angularOffsets']if observed else[-.020,.020]
        heights=observed['rowZ']if observed else[.11,.21,.31,.41,.51,.61]
        for offset in offsets:
            for z in heights:
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
        RivetLine((x,.6875,.148),(x,.6875,.552),.085,(0,1,0),turret,.012)
    # Native16/20 show seven uniformly spaced ROUND lower heads, including
    # the two column feet. Six lower hex heads crowded those corner feet and
    # created eight heads. Keep the upper mixed fastening row independent.
    # This restored-car head radius is photo-proportioned, not a factory spec.
    for j in range(1,6):Rivet((-.225+j*.075,.6875,.148),(0,1,0),turret,.012)
    for j in range(6):HexBolt((-.20+j*.080,.6875,.553),(0,1,0),turret,.012,.008)
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
    rearMgMount=Node('Node_TurretMgMount',(-.420,-.665,BodyZ(.355)),turret)
    rearMgMount.rotation_euler.z=math.radians(135)
    Lathe('TurretMgFlange',[(.135,-.01),(.135,.015),(.110,.035)],(0,0,0),armor,rearMgMount,'Y',64)
    rearMg=Node('Node_TurretMachineGun',parent=rearMgMount,axis='localX',rangeDegrees=[-10,10],yawRangeDegrees=[-10,10],rangeEvidence='Model display clearance limits; not a sourced factory firing arc')
    Lathe('TurretMgBall',[(.107,.015),(.100,.068),(.047,.100)],(0,0,0),armor,rearMg,'Y',32)
    BuildRearGunExterior(quality,rearMgMount,rearMg,armor,steel,PolygonPrism,Lathe,CutOpening)
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
    rearVision=Node('Node_TurretRearVision',(.34,-.73,BodyZ(.35)),turret,axis='localZ')
    rearVision.rotation_euler.z=.53
    root=turret
    while root.parent is not None:root=root.parent
    root['rearTurretCoverStudy']='PairedClosedLeaves_CentreStrip_FourExternalHinges'
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
    # Solidify's narrow top/bottom caps must not pull the two shell rings'
    # smooth normals toward horizontal. That interpolation falsely bowed the
    # straight conical plate and produced a broad, plastic-looking highlight.
    bm=bmesh.new();bm.from_mesh(shell.data);bm.normal_update()
    for edge in bm.edges:
        if len(edge.link_faces)==2 and (edge.calc_face_angle()>math.radians(35) or any(not face.smooth for face in edge.link_faces)):
            edge.smooth=False
    bm.to_mesh(shell.data);bm.free();shell.data.update()
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
    print('EXPORT_CLEANUP',json.dumps(CleanGlb(filepath)))
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
    root=Node('Model_Type89MediumTank',assetVersion='20261027GeometryV54',geometryVersion='20261027GeometryV54',variant='Type89Otsu_Tsuchiura',sourceNose='+Y',exportNose='-Z',units='metres',acceptance='IN_PROGRESS_GRAY',runtimeEnclosedShoeCleanup=quality=='Game')
    recipe=Path(__file__).read_bytes()+b''.join((Path(__file__).parent/name).read_bytes() for name in ['Script_Type89DetailedParts.py','Script_Type89TrackPath.py','Script_Type89CastWheel.py'])
    recipe+=(assetDir/'Data_RearApronReconstruction.json').read_bytes()
    recipe+=(Path(__file__).parent/'Script_Type89RearGunExterior.py').read_bytes()+(assetDir/'Data_RearGunExterior.json').read_bytes()
    recipe+=(Path(__file__).parent/'Script_Type89Tensioner.py').read_bytes()+(Path(__file__).parent/'Script_Type89SkirtAssembly.py').read_bytes()+(assetDir/'Data_SkirtAssemblyReconstruction.json').read_bytes()
    recipe+=b''.join((Path(__file__).parent/name).read_bytes()for name in ['Script_Type89BogieUnits.py','Script_Type89Underfloor.py','Script_Type89OuterBogieCheek.py','Script_Type89ShoeHiddenSurface.py','Script_Type89GlbCleanup.py'])+(assetDir/'Data_RunningGearReconstruction.json').read_bytes()
    recipe+=b''.join((Path(__file__).parent/name).read_bytes()for name in ['Script_Type89FrontDoor.py','Script_Type89FrontRoundCover.py','Script_Type89BowMachineGun.py','Script_Type89TurretApertures.py','Script_Type89RearTurretCover.py'])
    recipe+=b''.join((assetDir/name).read_bytes()for name in ['Data_FrontDoorReconstruction.json','Data_FrontRoundCoverReconstruction.json','Data_BowMountReconstruction.json','Data_TurretFastenerReconstruction.json','Data_RearTurretCoverReconstruction.json'])
    recipe+=(assetDir/'Data_SideHullMountSamples.json').read_bytes()
    root['geometryRecipeSha256']=hashlib.sha256(recipe).hexdigest()
    hull=HullGeometry(root)
    BuildUnderfloor(quality,hull,runningGearSettings,materials['Armor'],Node,Mesh,HexBolt)
    BuildTrackPath()
    motionPath={'geometryVersion':root['geometryVersion'],'pathModel':'C1TangentParabolic','length':trackLength,'segments':trackPath,'linksPerSide':trackLinksPerSide,'pitchM':trackLength/trackLinksPerSide,'sprocketTeeth':sprocketTeeth,'sprocketPitchRadiusM':sprocketPitchRadius,'units':'metres','authoringUp':'+Z','authoringNose':'+Y','runtimeUp':'+Y','runtimeNose':'-Z'}
    (reviewDir/'Data_TrackPath.json').write_text(json.dumps(motionPath),encoding='utf8')
    (sourceDir/'Data_TrackPath.json').write_text(json.dumps(motionPath,indent=2),encoding='utf8')
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
    # Preserve the already reviewed rear-cover joining basis: its study was
    # authored on the grounded source. This avoids re-rounding its corners.
    surface=BuildRearTurretCover(quality,parts['Node_TurretRearVision'],rearCoverSettings,materials['Armor'],Node,Box,PolygonPrism,RoundedRectangle,Tube,Rivet,CutOpening)
    bpy.context.view_layer.update();JoinStaticChildren(surface)
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
    report={'stage':stage,'quality':quality,'triangles':triangles,'nodeCount':len(list(root.children_recursive)),'partStats':partStats,'trackLengthM':trackLength,'trackLinksPerSide':parts['Node_TrackLeft']['linkCount'],'sourceBlend':bpy.data.filepath,'geometryAccepted':False,'materialAccepted':False,'dimensionsStatus':'photo-proportioned; primary dimension source still under verification'}
    (reviewDir/('Data_%s%sBuild.json'%(quality,stage))).write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps(report))
    if os.environ.get('TYPE89_RENDER','1')=='1':
        RenderViews(tuple(os.environ.get('TYPE89_VIEWS','FrontLeft,Front,RearLeft').split(',')))


if __name__=='__main__':
    Main()
