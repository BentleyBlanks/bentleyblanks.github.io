"""Rebuild only the selected early Type 94 museum-reference asset.

Blender +Y is vehicle forward; glTF export converts this to -Z, metres, ground
origin. Run through scripts/Script_BlenderMcp.mjs exec --file. Source .blend and
acceptance renders are external to the repository. No other model is opened.
"""
import bpy
import bmesh
import math
import json
import os
from collections import namedtuple
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(os.environ.get('TYPE94_REPO_ROOT', str(Path(__file__).resolve().parents[2] if '__file__' in globals() else Path.cwd())))
SOURCE = Path(os.environ.get('TYPE94_SOURCE_ROOT', r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\Type94Tankette'))
OUT = ROOT / 'Taierzhuang1938/Model/Type94Tankette'
QUALITY = os.environ.get('TYPE94_QUALITY', 'High')
SEGMENTS = 48 if QUALITY == 'High' else 24
BEVEL_SEGMENTS = 3 if QUALITY == 'High' else 1
REVISION = 'ShapeV37'
RUNNING_GEAR_LAYOUT = None
ROAD_FORWARD_M = [.69,.20,-.39,-.88]
BOGIE_LAYOUT = [(.445,.34,[0,1],.35),(-.635,.34,[2,3],-.54)]
runningGearFile = os.environ.get('TYPE94_RUNNING_GEAR_LAYOUT')
if runningGearFile:
    assert Path(runningGearFile).name==runningGearFile,'Running-gear layout must be an asset-relative filename'
    RUNNING_GEAR_LAYOUT=json.loads((OUT/runningGearFile).read_text(encoding='utf-8'))
    assert RUNNING_GEAR_LAYOUT['schema']=='Type94RunningGearLayoutV1'
    REVISION=RUNNING_GEAR_LAYOUT['revision']
    assert REVISION.startswith('ShapeV') and REVISION.replace('_','').isalnum()
    ROAD_FORWARD_M=RUNNING_GEAR_LAYOUT['roadForwardM']
    assert len(ROAD_FORWARD_M)==4 and all(math.isfinite(y) for y in ROAD_FORWARD_M)
    assert all(a-b>.393 for a,b in zip(ROAD_FORWARD_M,ROAD_FORWARD_M[1:])), 'Road tyres need positive physical spacing'
    assert RUNNING_GEAR_LAYOUT['roadRadiusM']==.1905 and RUNNING_GEAR_LAYOUT['roadAxisHeightM']==.215
    assert RUNNING_GEAR_LAYOUT['trackCenterXM']==.684,'This trial retains the V37 axial section'
    BOGIE_LAYOUT=[]
    for row in RUNNING_GEAR_LAYOUT['bogies']:
        indices=row['roadIndices'];assert len(indices)==2 and ROAD_FORWARD_M[indices[1]]<row['pivotForwardM']<ROAD_FORWARD_M[indices[0]]
        assert .235<row['pivotHeightM']<.52
        BOGIE_LAYOUT.append((row['pivotForwardM'],row['pivotHeightM'],indices,row['springEndForwardM']))
    assert len(BOGIE_LAYOUT)==2
TRACK_SHOE_LAYOUT=None
trackShoeFile=os.environ.get('TYPE94_TRACK_SHOE_LAYOUT')
if trackShoeFile:
    assert not RUNNING_GEAR_LAYOUT,'Combine component trials only in an explicit, separately verified layout'
    assert Path(trackShoeFile).name==trackShoeFile
    TRACK_SHOE_LAYOUT=json.loads((OUT/trackShoeFile).read_text(encoding='utf-8'))
    assert TRACK_SHOE_LAYOUT['schema']=='Type94TrackShoeLayoutV1'
    assert TRACK_SHOE_LAYOUT['overallWidthM']==.164
    REVISION=TRACK_SHOE_LAYOUT['revision']
    assert REVISION.startswith('ShapeV')and REVISION.replace('_','').isalnum()
MATERIALS = {}
BODY_LAYOUT=None
DRIVER_LAYOUT=None
bodyLayoutFile=os.environ.get('TYPE94_BODY_LAYOUT')
if bodyLayoutFile:
    assert not RUNNING_GEAR_LAYOUT and not TRACK_SHOE_LAYOUT and not os.environ.get('TYPE94_TURRET_LAYOUT'),'Full-body trials require their own explicit component selection'
    assert Path(bodyLayoutFile).name==bodyLayoutFile
    BODY_LAYOUT=json.loads((OUT/bodyLayoutFile).read_text(encoding='utf-8'))
    assert BODY_LAYOUT['schema']=='Type94BodyLayoutV1'
    DRIVER_LAYOUT=BODY_LAYOUT['driver']
TURRET_LAYOUT=None
turretLayoutFile=BODY_LAYOUT['turretLayout']if BODY_LAYOUT else os.environ.get('TYPE94_TURRET_LAYOUT')
if turretLayoutFile:
    assert not RUNNING_GEAR_LAYOUT and not TRACK_SHOE_LAYOUT,'Combine trials only in an explicit verified configuration'
    assert Path(turretLayoutFile).name==turretLayoutFile
    TURRET_LAYOUT=json.loads((OUT/turretLayoutFile).read_text(encoding='utf-8'))
    assert TURRET_LAYOUT['schema']=='Type94TurretEnvelopeLayoutV1'
    REVISION=TURRET_LAYOUT['revision']
    assert REVISION.startswith('ShapeV')and REVISION.replace('_','').isalnum()
if BODY_LAYOUT:
    REVISION=BODY_LAYOUT['revision']
    assert REVISION.startswith('ShapeV')and REVISION.replace('_','').isalnum()
LOWER_LAYOUT=None
lowerLayoutFile=BODY_LAYOUT.get('runningAssembly')if BODY_LAYOUT else None
if lowerLayoutFile:
    assert Path(lowerLayoutFile).name==lowerLayoutFile
    LOWER_LAYOUT=json.loads((OUT/lowerLayoutFile).read_text(encoding='utf-8'))
    assert LOWER_LAYOUT['schema']=='Type94RunningAssemblyV1'
    assert LOWER_LAYOUT['sprocketTeeth']==22,'The current drive constructor has22teeth'
    assert LOWER_LAYOUT['tyreHalfWidthM']==.0525,'The retained tyre constructor has105mmwidth'
    assert abs(LOWER_LAYOUT['trackCenterXM']+LOWER_LAYOUT['tyreHalfWidthM']-LOWER_LAYOUT['outerShoulderPlaneXM'])<1e-12
    trackShoeFile=BODY_LAYOUT['trackShoeLayout']
    assert Path(trackShoeFile).name==trackShoeFile
    TRACK_SHOE_LAYOUT=json.loads((OUT/trackShoeFile).read_text(encoding='utf-8'))
    assert TRACK_SHOE_LAYOUT['schema']=='Type94TrackShoeLayoutV1'
PARTS = {}
REAR_HULL_Y = -1.12
REAR_DOOR_CENTER_Z = .76
REAR_DOOR_HEIGHT = .48
TRACK_WIDTH_M = .164
REAR_FRAME_EXTENSION_M = .065  # Concealed drawbar section, constrained by the 3.084 m early specification.
DRIVE_CENTER_Y = 1.195
DRIVE_CENTER_Z = .605  # Photo-derived early high sprocket; SS26's approximate 25 in is a cross-check, not a museum survey.
TRACK_CENTER_X = .684  # Existing coherent wheel/arm section; overall width does not determine shoe centre planes.
if LOWER_LAYOUT:
    TRACK_CENTER_X=LOWER_LAYOUT['trackCenterXM']
    DRIVE_CENTER_Y,DRIVE_CENTER_Z=LOWER_LAYOUT['driveCenterYZM']
    ROAD_FORWARD_M=[row[0]for row in LOWER_LAYOUT['roadCentersYZM']]
FRONT_ARMOR_TOP_Y = 1.20
FRONT_ARMOR_BOTTOM_Y = 1.26
FRONT_ARMOR_TOP_Z = .81
FRONT_ARMOR_BOTTOM_Z = .51
FRONT_ARMOR_HALF_WIDTH = LOWER_LAYOUT['frontArmorHalfWidthM']if LOWER_LAYOUT else .60
GLACIS_REAR_Y = -.18
GLACIS_REAR_Z = 1.075
FOREBODY_LAYOUT=BODY_LAYOUT.get('forebody')if BODY_LAYOUT else None
if FOREBODY_LAYOUT:
    FRONT_ARMOR_TOP_Y,FRONT_ARMOR_TOP_Z=FOREBODY_LAYOUT['frontArmorTopYZM']
    FRONT_ARMOR_BOTTOM_Y,FRONT_ARMOR_BOTTOM_Z=FOREBODY_LAYOUT['frontArmorBottomYZM']
    GLACIS_REAR_Z=FOREBODY_LAYOUT['rearDeckHeightM']
    GLACIS_PROFILE=FOREBODY_LAYOUT['glacisProfileYZM']
    assert all(a[0]>b[0]for a,b in zip(GLACIS_PROFILE,GLACIS_PROFILE[1:]))
    assert GLACIS_PROFILE[0]==[FRONT_ARMOR_TOP_Y,FRONT_ARMOR_TOP_Z]
    assert GLACIS_PROFILE[-1]==[GLACIS_REAR_Y,GLACIS_REAR_Z]
GLACIS_SLOPE = (GLACIS_REAR_Z-FRONT_ARMOR_TOP_Z)/(FRONT_ARMOR_TOP_Y-GLACIS_REAR_Y)
if FOREBODY_LAYOUT:
    # The engine service lid lies wholly on the upper deck segment.
    (a,za),(b,zb)=GLACIS_PROFILE[-2:]
    GLACIS_SLOPE=(zb-za)/(a-b)
GLACIS_PITCH = -math.atan(GLACIS_SLOPE)
REAR_ARMOR_LAYOUT = json.loads((OUT/'Data_RearArmorReferenceLayoutV28.json').read_text(encoding='utf-8'))
if FOREBODY_LAYOUT:
    REAR_ARMOR_LAYOUT['geometryEstimate']['fixedTopAnchorBeforeGroundM'][2]=GLACIS_REAR_Z
import importlib.util
rearArmorSpec=importlib.util.spec_from_file_location('Type94RearArmor',ROOT/'Taierzhuang1938/_blender/Script_Type94RearArmor.py')
rearArmor=importlib.util.module_from_spec(rearArmorSpec);rearArmorSpec.loader.exec_module(rearArmor)


def GlacisHeight(y):
    if FOREBODY_LAYOUT:
        for (a,za),(b,zb)in zip(GLACIS_PROFILE,GLACIS_PROFILE[1:]):
            if y>=b:return za+(zb-za)*(a-y)/(a-b)
    return GLACIS_REAR_Z-(y-GLACIS_REAR_Y)*GLACIS_SLOPE


def FenderHeight(y):
    profile=FOREBODY_LAYOUT['fenderProfileYZM']if FOREBODY_LAYOUT else[(1.35,.870),(1.22,.935),(1.12,.950),(.35,.840),(-.69,.790),(-1.22,.790),(-1.48,.730)]
    for (a,za),(b,zb) in zip(profile,profile[1:]):
        if b<=y<=a:return za+(zb-za)*(a-y)/(a-b)
    return profile[0][1] if y>profile[0][0] else profile[-1][1]


def FrontDetailHeight(offset):
    """Place fittings in the declared front panel without scaling round bores."""
    factor=(FRONT_ARMOR_TOP_Z-FRONT_ARMOR_BOTTOM_Z)/.30 if FOREBODY_LAYOUT else 1.
    return FRONT_ARMOR_BOTTOM_Z+offset*factor


def TurretRadiusAt(z):
    if TURRET_LAYOUT:
        return TURRET_LAYOUT['roofRadiusM']+TURRET_LAYOUT['coneSlope']*(TURRET_LAYOUT['roofZLocalM']-z)
    return .419+(.352-.419)*(z-.105)/(.494-.105)


def TurretFrontAt(z):
    return .9*TurretRadiusAt(z)+.004


def FenderSurfaceHeight(x,y):
    outer=FenderHeight(y)
    inner=FenderInnerHeight(y)
    return inner+(outer-inner)*max(0,min(1,(abs(x)-.55)/.26))


def FenderInnerHeight(y):
    outer=FenderHeight(y)
    if FOREBODY_LAYOUT:
        rise=FOREBODY_LAYOUT['frontFenderInnerRiseM']
        return outer+rise*max(0,min(1,(y-.35)/.70))
    # The raised front belt needs the mudguard's inner lip above its shoes.
    # A short inferred mounting flange joins that lip to the lower glacis.
    return max(min(outer,GlacisHeight(y)),outer-.020) if y>-.18 else outer


def Reset():
    # Guard against the bootstrap ever connecting to another session's scene.
    task = bpy.context.scene.get('BlenderMcpTask')
    if task != 'Type94Tankette':
        raise RuntimeError('Wrong Blender task: ' + repr(task))
    if bpy.data.filepath and str(SOURCE).lower() not in bpy.data.filepath.lower():
        raise RuntimeError('Refusing to replace unrelated source: ' + bpy.data.filepath)
    for other in list(bpy.data.scenes):
        if other!=bpy.context.scene and other.get('BlenderMcpTask')=='Type94Tankette' and other.name.startswith('Scene_Type94Actual'):
            for obj in list(other.objects):
                if len(obj.users_scene)==1:bpy.data.objects.remove(obj,do_unlink=True)
            bpy.data.scenes.remove(other)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for datablock in list(bpy.data.materials):
        bpy.data.materials.remove(datablock)
    for image in list(bpy.data.images):
        if image.users==0 and image.type not in ['RENDER_RESULT','COMPOSITING']:
            bpy.data.images.remove(image)
    scene = bpy.context.scene
    if 'Type94ArticulationVersion' in scene:del scene['Type94ArticulationVersion']
    if 'Type94DetailsVersion' in scene:del scene['Type94DetailsVersion']
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    scene['AssetId'] = 'Type94Tankette'
    scene['ReferenceVersion'] = 'Kubinka early running gear, 25 August 2017'
    scene['AcceptanceStatus'] = 'In progress, shape comparison pending'
    scene['BlenderMcpTask'] = 'Type94Tankette'
    scene['Type94FixedFlangeFastenerCount'] = 6
    scene['Type94MgRoundOpeningRequired'] = True
    scene['Type94TurretFrontLayout'] = BODY_LAYOUT.get('turretFrontLayout','Data_TurretFrontLayoutV32.json')if BODY_LAYOUT else 'Data_TurretFrontLayoutV32.json'
    scene['Type94GlacisPitchRad'] = GLACIS_PITCH
    scene['Type94GlacisSlope'] = GLACIS_SLOPE
    SOURCE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    (SOURCE / 'Acceptance').mkdir(exist_ok=True)
    for role in ['Paint', 'Steel', 'Track', 'Rubber', 'Dark', 'Glass', 'Rust', 'White', 'Red']:
        material = bpy.data.materials.new('Material_Type94' + role)
        material.use_nodes = True
        material.use_backface_culling = True
        material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (.37,.37,.37,1)
        material.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .62
        material.diffuse_color = (.37,.37,.37,1)
        MATERIALS[role] = material


def Empty(name, loc=(0,0,0), parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.parent = parent
    obj.empty_display_size = .06
    return obj


def Mesh(name, vertices, faces, role='Paint', parent=None, bevel=0):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent or PARTS.get('Hull')
    obj.data.materials.append(MATERIALS[role])
    obj['SurfaceRole'] = role
    if bevel:
        modifier = obj.modifiers.new('ManufacturedEdgeRadius', 'BEVEL')
        modifier.width = bevel
        modifier.segments = BEVEL_SEGMENTS
    return obj


def Box(name, center, size, role='Paint', parent=None, bevel=.0015):
    a,b,c = [value*.5 for value in size]
    x,y,z = center
    vertices = [(x+sx*a,y+sy*b,z+sz*c) for sz in (-1,1) for sy in (-1,1) for sx in (-1,1)]
    return Mesh(name,vertices,[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],role,parent,bevel)


def Cylinder(name, center, radius, depth, role='Paint', axis='Z', parent=None, vertices=None):
    n = vertices or SEGMENTS
    points=[]
    for offset in (-depth/2,depth/2):
        for j in range(n):
            angle=j*math.tau/n
            u,v=radius*math.cos(angle),radius*math.sin(angle)
            p=(u,v,offset) if axis=='Z' else ((offset,u,v) if axis=='X' else (u,offset,v))
            points.append(tuple(center[k]+p[k] for k in range(3)))
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]
    faces += [(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
    if axis=='Y':
        faces=[tuple(reversed(face)) for face in faces]
    obj=Mesh(name,points,faces,role,parent,.0008)
    for polygon in obj.data.polygons[2:]:
        polygon.use_smooth=True
    return obj


def Lathe(name, profile, center, axis='Z', role='Paint', parent=None, segments=None):
    n=segments or SEGMENTS
    vertices=[]
    for r,d in profile:
        for i in range(n):
            a=i*math.tau/n
            p=(r*math.cos(a),r*math.sin(a),d) if axis=='Z' else ((d,r*math.cos(a),r*math.sin(a)) if axis=='X' else (r*math.cos(a),d,r*math.sin(a)))
            vertices.append(tuple(center[k]+p[k] for k in range(3)))
    faces=[]
    for ring in range(len(profile)-1):
        for i in range(n):
            faces.append((ring*n+i,ring*n+(i+1)%n,(ring+1)*n+(i+1)%n,(ring+1)*n+i))
    if axis=='Y':
        faces=[tuple(reversed(face)) for face in faces]
    obj=Mesh(name,vertices,faces,role,parent)
    for polygon in obj.data.polygons:
        polygon.use_smooth=True
    return obj


def Rod(name, a, b, radius, role='Paint', parent=None, segments=12):
    direction=Vector(b)-Vector(a)
    obj=Cylinder(name,(0,0,0),radius,direction.length,role,'Z',parent,segments)
    obj.location=(Vector(a)+Vector(b))*.5
    obj.rotation_euler=direction.to_track_quat('Z','Y').to_euler()
    return obj


def CurveTube(name, points, radius, role='Paint', parent=None):
    curve=bpy.data.curves.new(name,'CURVE')
    curve.dimensions='3D'
    curve.resolution_u=2
    curve.bevel_depth=radius
    curve.bevel_resolution=3 if QUALITY=='High' else 1
    spline=curve.splines.new('POLY')
    spline.points.add(len(points)-1)
    for p,co in zip(spline.points,points):
        p.co=(*co,1)
    obj=bpy.data.objects.new(name,curve)
    bpy.context.collection.objects.link(obj)
    obj.parent=parent or PARTS['Hull']
    obj.data.materials.append(MATERIALS[role])
    obj['SurfaceRole']=role
    return obj


def Rivet(name, point, normal=(0,0,1), radius=.006, parent=None, role='Paint'):
    profile=[(0,-.001),(radius,-.001),(radius,.001),(radius*.83,.003),(radius*.45,.0047),(0,.0051)]
    obj=Lathe(name,profile,(0,0,0),role=role,parent=parent,segments=12 if QUALITY=='High' else 8)
    obj.location=point
    obj.rotation_euler=Vector(normal).to_track_quat('Z','Y').to_euler()
    return obj


def RivetRow(name, a, b, spacing=.09, normal=(0,0,1), parent=None):
    a,b=Vector(a),Vector(b)
    count=max(1,round((b-a).length/spacing))
    for i in range(count+1):
        Rivet(name+'_'+str(i),a.lerp(b,i/count),normal,parent=parent)


def ApplyObjectModifiers(obj):
    bpy.context.view_layer.objects.active=obj
    for modifier in list(obj.modifiers):bpy.ops.object.modifier_apply(modifier=modifier.name)


def ShellThickness(obj, thickness=.008):
    modifier=obj.modifiers.new('RealArmorThickness','SOLIDIFY')
    modifier.thickness=thickness;modifier.offset=-1;modifier.use_even_offset=True
    return obj


def CutWith(obj,cutter):
    bpy.context.view_layer.update()
    ApplyObjectModifiers(cutter)
    ApplyObjectModifiers(obj)
    cutter.data.materials.clear()
    if obj.data.materials:cutter.data.materials.append(obj.data.materials[0])
    modifier=obj.modifiers.new('RealOpening','BOOLEAN')
    modifier.operation='DIFFERENCE';modifier.solver='EXACT';modifier.object=cutter
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    data=cutter.data;bpy.data.objects.remove(cutter,do_unlink=True)
    if data.users==0:bpy.data.meshes.remove(data)
    return obj


def CutBox(obj,center,size,radius=0):
    return CutWith(obj,Box('TemporaryOpeningCutter',center,size,'Dark',obj.parent,radius))


def RoofFrame(name,center,outer,inner,z,parent=None):
    x,y=center;ow,ol=outer;iw,il=inner
    loops=[(x+sx*w/2,y+sy*l/2,z) for w,l in [(ow,ol),(iw,il)] for sx,sy in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    obj=Mesh(name,loops,[(i,(i+1)%4,(i+1)%4+4,i+4) for i in range(4)],parent=parent)
    return ShellThickness(obj)


def Plate(name, points, thickness=.008, role='Paint', parent=None, bevel=.002):
    # Points counter-clockwise when viewed from the outside.
    normal=(Vector(points[1])-Vector(points[0])).cross(Vector(points[2])-Vector(points[0])).normalized()
    vertices=[tuple(Vector(p)-normal*thickness*.5) for p in points]+[tuple(Vector(p)+normal*thickness*.5) for p in points]
    n=len(points)
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return Mesh(name,vertices,faces,role,parent,bevel)


def AperturePlate(name, outer, inner, thickness=.008, role='Paint', parent=None, bevel=0):
    """A planar four-sided frame with an explicit through-opening.

    Outer and inner loops have the same winding. Avoid a Boolean on thin
    gasket stock: a failed subtraction can leave the cutter's front cap.
    """
    assert len(outer)==len(inner)==4
    points=[Vector(p) for p in outer]+[Vector(p) for p in inner]
    normal=(points[1]-points[0]).cross(points[2]-points[0]).normalized()
    vertices=[tuple(p-normal*thickness/2) for p in points]+[tuple(p+normal*thickness/2) for p in points]
    faces=[]
    for i in range(4):
        j=(i+1)%4
        front=(i+8,j+8,j+12,i+12)
        faces.extend([front,tuple(reversed((i,j,j+4,i+4))),
                      (i,j,j+8,i+8),(i+4,i+12,j+12,j+4)])
    return Mesh(name,vertices,faces,role,parent,bevel)


def RoundedPlate(name, center, width, length, thickness, corner=.035, role='Paint', parent=None, pitch=0):
    points=[]
    for cx,cy,start in [(width/2-corner,length/2-corner,0),(-width/2+corner,length/2-corner,90),(-width/2+corner,-length/2+corner,180),(width/2-corner,-length/2+corner,270)]:
        for step in range(7):
            angle=math.radians(start+step*15)
            x=cx+corner*math.cos(angle)
            y=cy+corner*math.sin(angle)
            points.append((x, y*math.cos(pitch), y*math.sin(pitch)))
    points=[tuple(p[k]+center[k] for k in range(3)) for p in points]
    return Plate(name,points,thickness,role,parent,.0015)


def Handle(name, center, width=.07, height=.027, parent=None, plane='XY'):
    x,y,z=center
    if plane=='XY':
        points=[(x-width/2,y,z),(x-width/2,y,z+height*.6),(x-width*.35,y,z+height),(x+width*.35,y,z+height),(x+width/2,y,z+height*.6),(x+width/2,y,z)]
    else:
        points=[(x,y-width/2,z),(x-height*.6,y-width/2,z),(x-height,y-width*.35,z),(x-height,y+width*.35,z),(x-height*.6,y+width/2,z),(x,y+width/2,z)]
    CurveTube(name,points,.004,parent=parent)


def Hinge(name, center, length, axis='X', parent=None):
    x,y,z=center
    for i in range(5):
        p=list(center)
        p[0 if axis=='X' else 1]+=(i-2)*length/5
        Cylinder(name+'Knuckle'+str(i),p,.012,length/5-.001,axis=axis,parent=parent,vertices=16)
    if axis=='X':
        Box(name+'Leaf',(x,y-.027,z-.008),(length,.055,.007),parent=parent)
    else:
        Box(name+'Leaf',(x,y,z+.018),(.009,length,.036),parent=parent)


def SideVisionPort(name,mount,side,width,height,centerZ,coverN,thickness,hingeN,backing,conforming=False,layoutData=None,openingSize=None,
                   hingeAxisZ=.005,fixedFootAxisOffset=.012,movingLeafLowerInset=.016,movingLeafBoltFraction=.75):
    """Independent side cover; concealed bearings and backing sections inferred.

    N is the outward normal coordinate of the mount, Y fore/aft and Z up.
    A curved turret backing is sampled on the actual uncut shell before the
    common through-opening is cut. The driver wall uses its actual flat plane.
    """
    layout=layoutData if layoutData is not None else json.loads((OUT/'Data_SidePortReferenceLayoutV21.json').read_text(encoding='utf-8'))
    def Point(n,y,z):return Vector((side*n,y,z))
    def RectLoop(w,h,zc,steps=16):
        corners=[(-w/2,zc-h/2),(w/2,zc-h/2),(w/2,zc+h/2),(-w/2,zc+h/2)]
        return [(a[0]+(b[0]-a[0])*i/steps,a[1]+(b[1]-a[1])*i/steps)
                for a,b in zip(corners,corners[1:]+corners[:1])for i in range(steps)]
    backN=coverN-thickness/2;frontN=coverN+thickness/2;sealFrontN=backN-.0003
    outerWidth=width+.014;outerHeight=height+.012
    holeWidth=.130 if name.startswith('DriverPort')else .115
    holeHeight=.075 if name.startswith('DriverPort')else .085
    if openingSize is not None:holeWidth,holeHeight=openingSize
    outer=RectLoop(outerWidth,outerHeight,centerZ);inner=RectLoop(holeWidth,holeHeight,centerZ);count=len(outer)
    frameBack=[]
    if conforming:
        frameFrontN=sealFrontN-.001
        vertices=[Point(backing(y,z),y,z)for y,z in outer+inner]+[Point(frameFrontN,y,z)for y,z in outer+inner]
        frameBack=[tuple(p)for p in vertices[:count]]
        faces=[]
        for i in range(count):
            j=(i+1)%count
            faces.extend([(i,j,j+count,i+count),(i+2*count,i+3*count,j+3*count,j+2*count),
                          (i,i+2*count,j+2*count,j),(i+count,j+count,j+3*count,i+3*count)])
        Mesh(name+'_ConformingFrame',vertices,faces,parent=mount)
        sealBackN=frameFrontN
    else:sealBackN=backing(0,centerZ)
    seam=Box(name+'_Seal',Point((sealBackN+sealFrontN)/2,0,centerZ),
             (sealFrontN-sealBackN,outerWidth,outerHeight),'Dark',mount,.002)
    CutBox(seam,Point(0,0,centerZ),(.20,holeWidth,holeHeight))
    fixedName=('DriverPortHingeFixed' if name=='DriverPortLeft'else 'DriverPortHingeFixedRight')if name.startswith('DriverPort')else 'TurretPortHingeFixed'+name.removeprefix('TurretPort')
    fixed=Empty(fixedName,parent=mount)
    fixed['ReferenceScope']='Two visible hinge stations; concealed fork eyes, pin section and backing fit inferred'
    axisZ=hingeAxisZ;axis=Point(hingeN,0,axisZ);footZ=axisZ+fixedFootAxisOffset
    port=Empty('Hatch_'+name,axis,mount)
    port['HingeAxisLocal']='Y';port['OpenSignLocal']=-side
    port['HingeContactExclusionM']=0.;port['TargetHingeInMountM']=tuple(axis)
    port['HingePinRadiusM']=.0035;port['HingeBearingInnerRadiusM']=.0039
    port['CoverSizeM']=(width,height,thickness);port['CoverCenterInMountM']=tuple(Point(coverN,0,centerZ))
    port['OpeningSizeM']=(holeWidth,holeHeight)
    port['FixedFootAxisOffsetM']=fixedFootAxisOffset
    port['MovingLeafLowerInsetM']=movingLeafLowerInset
    port['MovingLeafBoltFraction']=movingLeafBoltFraction
    port['ReferenceScope']='Kubinka visible closed cover and fitting count; exact local dimensions, hidden bearings and travel inferred'
    port['FixedHingeOwner']=fixedName;port['ClosedSealGapM']=.0003
    def Moving(n,y,z):return Point(n,y,z)-axis
    Box(name+'_Cover',Moving(coverN,0,centerZ),(thickness,width,height),parent=port,bevel=.007 if conforming else .008)
    topZ=centerZ+height/2;footContacts=[];axisPoints=[]
    for index,fraction in enumerate(layout['hingeCrossFractions']):
        station=fraction*width;pin=Point(hingeN,station,axisZ);axisPoints.extend(pin)
        Cylinder(name+'_HingePin'+str(index),pin,.0035,.056,axis='Y',parent=fixed,vertices=24)
        for offset in [-.017,.017]:
            Lathe(name+'_FixedEye'+str(index),[(.0039,-.005),(.008,-.005),(.008,.005),(.0039,.005),(.0039,-.005)],
                  Point(hingeN,station+offset,axisZ),'Y',parent=fixed,segments=32)
            # A small solid foot follows the actual body at every back-grid
            # vertex. Its outer face is planar for the fixed strap and bolt.
            ys=[station+offset-.008+j*.004 for j in range(5)];zs=[footZ-.006+j*.003 for j in range(5)]
            back=[(backing(y,z),y,z)for z in zs for y in ys];padFront=max(p[0]for p in back)+.004
            vertices=[Point(*p)for p in back]+[Point(padFront,y,z)for _,y,z in back];faces=[]
            for row in range(4):
                for col in range(4):
                    i=row*5+col;faces.extend([(i,i+1,i+6,i+5),(i+25,i+30,i+31,i+26)])
            rim=list(range(5))+[row*5+4 for row in range(1,5)]+list(range(23,19,-1))+[row*5 for row in range(3,0,-1)]
            for i,j in zip(rim,rim[1:]+rim[:1]):faces.append((i,i+25,j+25,j))
            Mesh(name+'_FixedFoot'+str(index),vertices,faces,parent=fixed)
            footContacts.extend(Point(backing(station+offset,footZ),station+offset,footZ))
            upper=Point(padFront+.001,station+offset,footZ);lower=Point(hingeN-.004,station+offset,axisZ+.004)
            Plate(name+'_FixedLeaf'+str(index),[upper+Vector((0,-.006,0)),upper+Vector((0,.006,0)),
                  lower+Vector((0,.005,0)),lower+Vector((0,-.005,0))],.003,parent=fixed,bevel=.0005)
            Rivet(name+'_FixedFootBolt'+str(index),Point(padFront+.001,station+offset,footZ+.002),(side,0,0),.0038,fixed)
        Lathe(name+'_MovingEye'+str(index),[(.0039,-.008),(.008,-.008),(.008,.008),(.0039,.008),(.0039,-.008)],
              Moving(hingeN,station,axisZ),'Y',parent=port,segments=32)
        upper=Point(hingeN-.004,station,axisZ-.004);lower=Point(frontN+.0013,station,topZ-movingLeafLowerInset)
        Plate(name+'_MovingLeaf'+str(index),[upper+Vector((0,-.007,0))-axis,lower+Vector((0,-.009,0))-axis,
              lower+Vector((0,.009,0))-axis,upper+Vector((0,.007,0))-axis],.003,parent=port,bevel=.0005)
        leafNormal=Vector((side,0,-(hingeN-.004-frontN-.0013)/(upper.z-lower.z))).normalized()
        Rivet(name+'_MovingLeafBolt'+str(index),upper.lerp(lower,movingLeafBoltFraction)+leafNormal*.0025-axis,leafNormal,.0045,port)
    fasteners=layout['coverFasteners']
    port['CoverFastenerCrossFractions']=fasteners['crossFractions']
    port['CoverFastenerDownFraction']=fasteners['downFraction']
    for fraction in fasteners['crossFractions']:
        Rivet(name+'_LowerCoverBolt',Moving(frontN+.001,fraction*width,topZ-fasteners['downFraction']*height),(side,0,0),.0045,port)
    fitting=layout['edgeFitting'];fy=fitting['crossFraction']*width
    port['EdgeFittingCrossFraction']=fitting['crossFraction']
    port['EdgeFittingDownFractions']=(fitting['topDownFraction'],fitting['bottomDownFraction'])
    z1=topZ-fitting['topDownFraction']*height;z2=topZ-fitting['bottomDownFraction']*height
    Rod(name+'_EdgeFittingRod',Moving(frontN+.003,fy,z1),Moving(frontN+.003,fy,z2),.0018,parent=port,segments=12)
    for z in [z1,z2]:Rivet(name+'_EdgeFittingCollar',Moving(frontN+.001,fy,z),(side,0,0),.003,port)
    fixed['FootContactPointsInMountM']=footContacts;fixed['HingeAxisPointsInMountM']=axisPoints
    fixed['FrameBackOuterPointsInMountM']=[value for point in frameBack for value in point]
    port['LowerCoverFastenerCount']=2;port['EdgeFittingFunction']='Unverified; visible rod and collars only'
    return port


def NoseHousing():
    """Raised photographic cowl with a sloping roof and rounded front.

    Local dimensions are image-derived estimates, not a museum survey. This
    is a removable transmission housing; unsupported rear hinges are omitted.
    """
    owner=Empty('NoseHousing',parent=PARTS['Hull'])
    width=.74;rearY=.62;frontY=FRONT_ARMOR_TOP_Y;centerX=-.135;frontRadius=.20
    cornerSteps=24 if QUALITY=='High' else 12
    outline=[]
    for x,y,r,start,steps in [(width/2-frontRadius,frontY-frontRadius,frontRadius,0,cornerSteps),
                              (-width/2+frontRadius,frontY-frontRadius,frontRadius,90,cornerSteps),
                              (-width/2+.008,rearY+.008,.008,180,3),
                              (width/2-.008,rearY+.008,.008,270,3)]:
        for step in range(steps+1):
            a=math.radians(start+90*step/steps)
            outline.append((centerX+x+r*math.cos(a),y+r*math.sin(a)))
    def Deck(y):return GlacisHeight(y)+.006
    topRear=Deck(rearY)+.120;topFront=Deck(frontY)+.140
    slope=(topFront-topRear)/(frontY-rearY)
    vertices=[(x,y,Deck(y)) for x,y in outline]+[(x,y,topRear+slope*(y-rearY)) for x,y in outline]
    n=len(outline)
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    Mesh('Nose_TransmissionHousing',vertices,faces,parent=owner,bevel=.002)
    handleY=frontY-.045
    topNormal=Vector((0,-slope,1)).normalized()
    handleCenter=Vector((centerX,handleY,topRear+slope*(handleY-rearY)))-topNormal*.0003
    profile=[(-.075/2,0),(-.075/2,.027*.6),(-.075*.35,.027),(.075*.35,.027),(.075/2,.027*.6),(.075/2,0)]
    handlePoints=[handleCenter+Vector((x,0,0))+topNormal*z for x,z in profile]
    CurveTube('Nose_LiftHandle',handlePoints,.004,parent=owner)
    owner['NoseHandleFootCentersM']=[value for p in [handlePoints[0],handlePoints[-1]] for value in p]
    surfaces=[];surfaceNormals=[]
    for x,offset in [(-.080,.021),(-.365,.027)]:
        candidates=[]
        for (xa,ya),(xb,yb) in zip(outline,outline[1:]+outline[:1]):
            if abs(xb-xa)<1e-10 or (x-xa)*(x-xb)>1e-12:continue
            t=(x-xa)/(xb-xa);normal=Vector((yb-ya,xa-xb,0)).normalized()
            candidates.append((ya+(yb-ya)*t,normal))
        y,normal=max(candidates,key=lambda candidate:candidate[0])
        assert normal.y>.5,'Nose fastener must attach to the front wall'
        surfaces.extend((x,y,topRear+slope*(y-rearY)-offset));surfaceNormals.extend(normal)
        point=Vector((x,y,topRear+slope*(y-rearY)-offset))+normal*.0008
        Rivet('Nose_FrontFastener',point,normal,.0055,owner)
    owner['ReferenceBasis']='Kubinka 2017 front skirt and shallow top; local dimensions estimated'
    owner['FrontRiseM']=.140;owner['RearRiseM']=.120
    owner['CoverWidthM']=width;owner['CoverCenterXM']=centerX
    owner['FrontCornerRadiusM']=frontRadius
    owner['NoseFrontFastenerSurfacePointsM']=surfaces
    owner['NoseFrontFastenerSurfaceNormals']=surfaceNormals
    owner['ReferenceScope']='Same-vehicle nose corners and fastener comparison; hidden rear skirt, exact local dimensions and gauge registration remain estimated'
    return owner


def FinalDriveHousings():
    """Fixed rounded cheeks around the drive shafts, seen at both front corners.

    The primary photo supports the rounded casing and forward joint fasteners.
    Radius, section depth and hidden rear mounting are local estimates. These
    belong to the hull; the sprockets retain their independent rotating nodes.
    """
    radialScale=.91
    def CasingRadius(r):
        value=r*radialScale
        if not LOWER_LAYOUT:return value
        bore=.066*radialScale
        return bore+(value-bore)*(LOWER_LAYOUT['driveMetalRadiusM']/.2547)
    def Axial(x):return x+(TRACK_CENTER_X-.684)if LOWER_LAYOUT else x
    section=[(.066,.535),(.195,.535),(.225,.555),(.238,.584),(.239,.600),
             (.230,.615),(.205,.624),(.170,.627),(.070,.613),(.066,.600),(.066,.535)]
    for side,label in [(-1,'Left'),(1,'Right')]:
        owner=Empty('FinalDriveHousing'+label,parent=PARTS['Hull'])
        cheek=Lathe('FinalDrive_'+label+'_CastCheek',[(CasingRadius(r),side*Axial(x)) for r,x in section],
                    (0,DRIVE_CENTER_Y,DRIVE_CENTER_Z),'X',parent=owner)
        for vertex in cheek.data.vertices:vertex.co.z=max(vertex.co.z,DRIVE_CENTER_Z-.117*radialScale)
        cheek.data.update()
        # Narrow raised retaining seam, rather than a second wheel or flat disk.
        band=Lathe('FinalDrive_'+label+'_RetainingBand',[(CasingRadius(r),side*Axial(x)) for r,x in
                   [(.236,.590),(.2405,.593),(.2405,.603),(.237,.606),(.236,.590)]],(0,DRIVE_CENTER_Y,DRIVE_CENTER_Z),'X',parent=owner)
        for vertex in band.data.vertices:vertex.co.z=max(vertex.co.z,DRIVE_CENTER_Z-.115*radialScale)
        band.data.update()
        for index,degrees in enumerate([-24,0,24,48,72]):
            angle=math.radians(degrees);normal=(0,math.cos(angle),math.sin(angle))
            bolt=Rivet('FinalDrive_'+label+'_JointBolt'+str(index),
                       (side*Axial(.598),DRIVE_CENTER_Y+CasingRadius(.241)*normal[1],DRIVE_CENTER_Z+CasingRadius(.241)*normal[2]),normal,.0065,owner)
            if not LOWER_LAYOUT:bolt.scale=(1,radialScale,radialScale)
        owner['ReferenceBasis']='Kubinka 2017 original, near and far front-corner rounded casings'
        owner['Unverified']='Photo-derived local section and fastener spacing; lower cut follows the modeled belly; rear attachment inferred'


def FrontArmorNormal():
    return Vector((0,1,(FRONT_ARMOR_BOTTOM_Y-FRONT_ARMOR_TOP_Y)/(FRONT_ARMOR_TOP_Z-FRONT_ARMOR_BOTTOM_Z))).normalized()


def FrontArmorPoint(x,z,normalOffset=0):
    y=FRONT_ARMOR_BOTTOM_Y+(FRONT_ARMOR_TOP_Y-FRONT_ARMOR_BOTTOM_Y)*(z-FRONT_ARMOR_BOTTOM_Z)/(FRONT_ARMOR_TOP_Z-FRONT_ARMOR_BOTTOM_Z)
    return Vector((x,y,z))+FrontArmorNormal()*normalOffset


def Hull():
    root=Empty('Type94Tankette')
    root['Units']='metres'
    root['Front']='+Y in Blender, -Z in glTF'
    PARTS['Root']=root
    hull=Empty('Hull',parent=root)
    PARTS['Hull']=hull
    # Faceted lower bathtub and its front armour surface.
    rings=[(FRONT_ARMOR_BOTTOM_Y,.54,FRONT_ARMOR_BOTTOM_Z,FRONT_ARMOR_TOP_Z),(1.12,.55,.31,GlacisHeight(1.12)),(-1.08,.56,.31,.91),(REAR_HULL_Y,.54,.33,GLACIS_REAR_Z)]
    vertices=[]
    for y,w,low,high in rings:
        vertices += [(-w,y,low),(w,y,low),(w,y,high),(-w,y,high)]
    vertices[2]=(FRONT_ARMOR_HALF_WIDTH,FRONT_ARMOR_TOP_Y,FRONT_ARMOR_TOP_Z)
    vertices[3]=(-FRONT_ARMOR_HALF_WIDTH,FRONT_ARMOR_TOP_Y,FRONT_ARMOR_TOP_Z)
    vertices[14]=(.60,REAR_HULL_Y,GLACIS_REAR_Z)
    vertices[15]=(-.60,REAR_HULL_Y,GLACIS_REAR_Z)
    faces=[(3,2,1,0),(12,13,14,15)]
    for j in range(len(rings)-1):
        faces += [(j*4+i,j*4+(i+1)%4,(j+1)*4+(i+1)%4,(j+1)*4+i) for i in [0,1,3]]
    tub=ShellThickness(Mesh('Hull_LowerBathtub',vertices,faces))
    # Preserve the already checked forward inner shell. Changing the rear
    # before even-offset solidification also changes neighboring inner faces.
    # Copy the original corner IDs through Solidify, then pose only its rear.
    cornerIds=tub.data.attributes.new('RearArmorCornerId','INT','POINT')
    for i,value in enumerate(cornerIds.data):value.value=i
    ApplyObjectModifiers(tub)
    cornerIds=tub.data.attributes['RearArmorCornerId'];ids=[value.value for value in cornerIds.data]
    assert all(ids.count(i)==2 for i in [12,13,14,15]),'Rear shell corner identity was not preserved by solidification'
    # Even-offset mitering of the very short last bathtub segment pulled the
    # rear's inner face up to 74 mm inward near the door. Keep every outer
    # vertex and the forward shell, but give this rear plate its declared
    # inferred 8 mm normal thickness before the common rigid pose.
    for sourceId in [12,13,14,15]:
        pair=[vertex for vertex,identity in zip(tub.data.vertices,ids) if identity==sourceId]
        outer=min(pair,key=lambda vertex:(vertex.co-Vector(vertices[sourceId])).length)
        assert (outer.co-Vector(vertices[sourceId])).length<2e-6
        inner=next(vertex for vertex in pair if vertex.index!=outer.index)
        inner.co.y=REAR_HULL_Y+.008
    hull['RearArmorInnerThicknessM']=.008
    hull['RearArmorInnerThicknessScope']='Inferred 8mm rear armor; rear-only miter correction, not measured museum thickness'
    rearPose=rearArmor.RearArmorTransform(REAR_ARMOR_LAYOUT)
    for vertex,sourceId in zip(tub.data.vertices,ids):
        if sourceId in [12,13,14,15]:vertex.co=rearPose@vertex.co
    tub.data.attributes.remove(cornerIds);tub.data.update()
    hull['FrontArmorProbeHeightM']=FrontDetailHeight(.14)
    hull['FrontArmorProbeForwardM']=FrontArmorPoint(0,FrontDetailHeight(.14)).y
    hull['FrontArmorTopForwardM']=FRONT_ARMOR_TOP_Y
    hull['FrontArmorBottomForwardM']=FRONT_ARMOR_BOTTOM_Y
    hull['EarlyDriveCenterHeightM']=DRIVE_CENTER_Z
    hull['FrontGeometryScope']='High early sprocket supported by SS26 and Kubinka silhouette; local nose/deck/fender dimensions remain photo-derived estimates'
    rearCutter=Box('TemporaryInclinedRearArmorOpening',(0,REAR_HULL_Y-.01,REAR_DOOR_CENTER_Z),(.54,.30,REAR_DOOR_HEIGHT-.06),'Dark',hull,.035)
    rearCutter.matrix_basis=rearArmor.RearArmorTransform(REAR_ARMOR_LAYOUT)@rearCutter.matrix_basis
    CutWith(tub,rearCutter)
    # Long sloping engine plate, widening into the raised fighting compartment.
    if FOREBODY_LAYOUT:
        deckSections=[]
        for index,((ya,za),(yb,zb))in enumerate(zip(GLACIS_PROFILE,GLACIS_PROFILE[1:])):
            wa=FRONT_ARMOR_HALF_WIDTH if index==0 else .60
            leftA=FOREBODY_LAYOUT.get('engineLeftUpperHalfWidthM',wa)if index else wa
            leftB=FOREBODY_LAYOUT.get('engineLeftUpperHalfWidthM',.60)
            deckSections.append(Plate('Armor_LongGlacis'+str(index),[(-leftA,ya,za),(wa,ya,za),(.60,yb,zb),(-leftB,yb,zb)],.012,bevel=.003))
        hull['ForebodyLayoutInferred']=True
        hull['ForebodyProfileBeforeGroundM']=[v for row in GLACIS_PROFILE for v in row]
        hull['ForebodyProfileScope']=FOREBODY_LAYOUT['scope']
    else:
        deckSections=[Plate('Armor_LongGlacis',[(-FRONT_ARMOR_HALF_WIDTH,FRONT_ARMOR_TOP_Y,FRONT_ARMOR_TOP_Z),(FRONT_ARMOR_HALF_WIDTH,FRONT_ARMOR_TOP_Y,FRONT_ARMOR_TOP_Z),(.60,GLACIS_REAR_Y,GLACIS_REAR_Z),(-.60,GLACIS_REAR_Y,GLACIS_REAR_Z)],.012,bevel=.003)]
    for glacis in deckSections:
        if DRIVER_LAYOUT:
            frontY=DRIVER_LAYOUT['bottomForwardM']-.030
            rearY=DRIVER_LAYOUT['topForwardM']-.283+.020
            CutBox(glacis,(DRIVER_LAYOUT['centerXM'],(frontY+rearY)/2,1.05),(DRIVER_LAYOUT['widthM']-.070,frontY-rearY,.8))
            hull['BodyTrialLayout']=bodyLayoutFile
            hull['DriverDimensionsInferred']=True
        else:CutBox(glacis,(.305,.09,1.05),(.48,.34,.8))
        CutBox(glacis,(-.32,.015,1.02),(.34,.31,.50),.025)
    if FOREBODY_LAYOUT and 'engineLeftUpperHalfWidthM'in FOREBODY_LAYOUT:
        for y in [-.055,.215]:
            Plate('Engine_HingeArmorLedge',[(x,yy,GlacisHeight(yy))for x,yy in[(-.585,y-.055),(-.535,y-.055),(-.535,y+.055),(-.585,y+.055)]],.012,bevel=.0005)
    roof=Plate('Armor_FightingRoof',[(-.60,-.18,GLACIS_REAR_Z),(.60,-.18,GLACIS_REAR_Z),(.60,REAR_HULL_Y,GLACIS_REAR_Z),(-.60,REAR_HULL_Y,GLACIS_REAR_Z)],.012)
    turretCentre=TURRET_LAYOUT['pivotBlenderM']if FOREBODY_LAYOUT else[0,-.58,GLACIS_REAR_Z]
    CutWith(roof,Cylinder('TemporaryTurretOpening',(turretCentre[0],turretCentre[1],GLACIS_REAR_Z),.30,.12,'Dark',parent=hull,vertices=64))
    cornerContacts=[]
    # Close the gap between the tapered rear bathtub and the two upper-side
    # sheets. The thin triangular transition is inferred, not a copied weld.
    cornerZ=.72;sideX=.598
    oldJoinZ=.33+(sideX-.54)/(.60-.54)*(GLACIS_REAR_Z-.33)
    for side in [-1,1]:
        x=side*.598
        Plate('Armor_UpperSide'+str(side),[(x,rearArmor.RearArmorForwardAtHeight(.72,REAR_ARMOR_LAYOUT),.72),(x,-.18,.72),(x,-.18,GLACIS_REAR_Z),(x,REAR_HULL_Y,GLACIS_REAR_Z)],.009)
        halfWidth=rearArmor.RearArmorHalfWidthAtHeight(cornerZ,REAR_ARMOR_LAYOUT)
        a=(side*halfWidth,rearArmor.RearArmorForwardAtHeight(cornerZ,REAR_ARMOR_LAYOUT),cornerZ)
        b=(side*sideX,a[1],cornerZ)
        c=rearPose@Vector((side*sideX,REAR_HULL_Y,oldJoinZ))
        winding=(0,1,2) if side>0 else (0,2,1)
        ShellThickness(Mesh('Rear_ArmorCornerSeal'+str(side),[a,b,c],[winding],parent=hull),.008)
        checkZ=.80;checkX=side*(sideX+rearArmor.RearArmorHalfWidthAtHeight(checkZ,REAR_ARMOR_LAYOUT))*.5
        cornerContacts.extend((checkX,rearArmor.RearArmorForwardAtHeight(checkZ,REAR_ARMOR_LAYOUT),checkZ))
        if FOREBODY_LAYOUT and FOREBODY_LAYOUT.get('planarGlacisCheeks'):
            spec=importlib.util.spec_from_file_location('Type94ForebodyPanels',ROOT/'Taierzhuang1938/_blender/Script_Type94ForebodyPanels.py')
            module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
            module.BuildGlacisSide(globals(),side)
        else:
            cheekX=FRONT_ARMOR_HALF_WIDTH-.045 if LOWER_LAYOUT else .555
            cheek=[(side*cheekX,FRONT_ARMOR_BOTTOM_Y-.015,FRONT_ARMOR_TOP_Z)]
            if FOREBODY_LAYOUT:cheek.extend((side*.60,y,z)for y,z in GLACIS_PROFILE[1:-1])
            cheek.extend([(side*.60,-.18,GLACIS_REAR_Z),(side*.60,-.18,.69)])
            Plate('Armor_GlacisCheek'+str(side),cheek,.008)
        # Continuous thin fender with downturn at front and relieved raised rear tip.
        ys=sorted(set([row[0]for row in FOREBODY_LAYOUT['fenderProfileYZM']]+[1.05,.2,-.65,-1.08]),reverse=True)if FOREBODY_LAYOUT else[1.35,1.22,1.12,1.05,.35,.2,-.65,-.69,-1.08,-1.22,-1.48]
        profile=[(y,FenderHeight(y))for y in ys]
        for i in range(len(profile)-1):
            ya,za=profile[i]; yb,zb=profile[i+1]
            innerFront=.55 if FOREBODY_LAYOUT else(.60 if i==0 else .55)
            innerZa=FenderInnerHeight(ya)
            innerZb=FenderInnerHeight(yb)
            Plate('Fender_'+str(side)+'_'+str(i),[(side*innerFront,ya,innerZa),(side*.81,ya,za),(side*.81,yb,zb),(side*.55,yb,innerZb)],.006,bevel=.001)
            lowerA=min(innerZa,GlacisHeight(ya));lowerB=min(innerZb,GlacisHeight(yb))
            if innerZa-lowerA>.0001 or innerZb-lowerB>.0001:
                flange=[]
                if innerZa-lowerA>.0001:flange.append((side*innerFront,ya,lowerA))
                flange.extend([(side*innerFront,ya,innerZa),(side*.55,yb,innerZb)])
                if innerZb-lowerB>.0001:flange.append((side*.55,yb,lowerB))
                Plate('FenderRootFlange_'+str(side)+'_'+str(i),flange,.004,bevel=0)
        for y in [1.05,.2,-.65,-1.08]:
            rootX=min(.59,TRACK_CENTER_X-TRACK_WIDTH_M*.5-.045)
            inner=FenderSurfaceHeight(rootX,y);outer=FenderSurfaceHeight(.77,y)
            # Rise beside the belt, then run above it; a straight diagonal
            # through the shoe envelope is not a viable cantilever support.
            outline=[(side*rootX,y,inner-.08)]
            if FOREBODY_LAYOUT:
                # The projecting web has a real 8mm vertical section. A
                # triangular zero-height tip creates unstable bevel slivers.
                outline.extend([(side*(rootX+.020),y,inner-.012),(side*.77,y,outer-.012),
                                (side*.77,y,outer-.004),(side*rootX,y,inner-.004)])
            else:
                if outer>inner+.001:outline.append((side*(rootX+.038),y,inner-.004))
                outline.extend([(side*.77,y,outer-.004),(side*rootX,y,inner-.004)])
            Plate('FenderBracket_'+str(side)+'_'+str(y),outline,.011,bevel=.0005 if FOREBODY_LAYOUT else .002)
            Rivet('FenderBolt', (side*.75,y,FenderSurfaceHeight(.75,y)+.007),radius=.005)
        # Rivet lines on the side roof joint and front plate edges.
        sideRivetZ=GLACIS_REAR_Z-.035 if FOREBODY_LAYOUT else 1.04
        RivetRow('SideRivetTop'+str(side),(side*.605,-1.10,sideRivetZ),(side*.605,-.20,sideRivetZ),.085,(side,0,0))
        if FOREBODY_LAYOUT:
            def RowX(y):return side*(.526+(.57-.526)*(FRONT_ARMOR_TOP_Y-y)/(FRONT_ARMOR_TOP_Y+.12))
            for index,((ya,za),(yb,zb))in enumerate(zip(GLACIS_PROFILE,GLACIS_PROFILE[1:])):
                slope=(zb-za)/(ya-yb)
                a=Vector((RowX(ya),ya,za+.009));b=Vector((RowX(yb),yb,zb+.009))
                count=max(1,round((b-a).length/.10))
                for i in range(0 if index==0 else 1,count+1):
                    Rivet('GlacisRivet'+str(side)+'_'+str(index)+'_'+str(i),a.lerp(b,i/count),(0,slope,1))
        else:RivetRow('GlacisRivet'+str(side),(side*.526,FRONT_ARMOR_TOP_Y,GlacisHeight(FRONT_ARMOR_TOP_Y)+.009),(side*.57,-.12,GlacisHeight(-.12)+.009),.10,(0,GLACIS_SLOPE,1))
        RivetRow('FrontEdge'+str(side),FrontArmorPoint(side*.51,FRONT_ARMOR_BOTTOM_Z+.04,.001),FrontArmorPoint(side*.51,FRONT_ARMOR_TOP_Z-.03,.001),.085,FrontArmorNormal())
    hull['RearCornerSealRequired']=True
    hull['RearCornerSealProbePointsBeforeGroundM']=cornerContacts
    hull['RearCornerSealScope']='Thin rear/upper-side corner closure inferred to avoid an unsealed transition; exact manufactured joint not photographed'
    for z in [FRONT_ARMOR_BOTTOM_Z+.03,FRONT_ARMOR_TOP_Z-.03]:
        RivetRow('FrontRivet',FrontArmorPoint(-.49,z,.001),FrontArmorPoint(.49,z,.001),.095,FrontArmorNormal())
    FinalDriveHousings()
    # Glacis service lid: low rounded nose hood, not a separate gun mount.
    NoseHousing()
    # Engine top service hatch, matching the left-front deck of the primary image.
    seam=RoundedPlate('Engine_TopSeam',(-.32,.02,GlacisHeight(.02)+.0187),.41,.45,.006,.045,role='Dark',pitch=GLACIS_PITCH)
    CutBox(seam,(-.32,.015,1.02),(.34,.31,.50),.025)
    flange=Empty('EngineFrontFlangeFixed',parent=hull)
    flange['ReferenceScope']='Three front flange fasteners visible in both Kubinka originals; local spacing and head section photo-estimated'
    normal=Vector((0,GLACIS_SLOPE,1)).normalized()
    for x in [-.206,-.345,-.466]:
        point=Vector((x,.308,GlacisHeight(.308)))+normal*.007
        Rivet('Engine_FrontFlangeRivet',point,normal,.006,flange)
    engineHingeZ=GlacisHeight(-.21)+.022
    hatch=Empty('Hatch_Engine',(-.32,-.21,engineHingeZ),hull)
    hatch['TargetHingeM']=(-.32,-.21,engineHingeZ)
    PARTS['EngineHatch']=hatch
    RoundedPlate('Engine_TopHatch',(0,.23,-GLACIS_SLOPE*.23),.398,.438,.009,.044,parent=hatch,pitch=GLACIS_PITCH)
    # The master has two fore/aft hinges on the outer edge. Their real rigid
    # interfaces are added after the legacy closed-lid seating pass below.
    Handle('Engine_TopLift',(0,.38,-GLACIS_SLOPE*.38+.026),.06,parent=hatch)
    # Surface-mounted bracket, pin and independently hinged U shackle.
    normal=FrontArmorNormal();angle=math.atan2(normal.z,normal.y)
    mount=FrontArmorPoint(0,FrontDetailHeight(.171),.020)
    bracketHeight=.20*(FRONT_ARMOR_TOP_Z-FRONT_ARMOR_BOTTOM_Z)/.30 if FOREBODY_LAYOUT else .20
    bracket=Box('Tow_FrontBracket',(0,0,0),(.065,.04,bracketHeight),bevel=.003)
    bracket.location=mount;bracket.rotation_euler.x=angle
    pin=mount+Vector((0,.037*math.cos(angle)+.010*math.sin(angle),.037*math.sin(angle)-.010*math.cos(angle)))
    Cylinder('Tow_FrontPin',pin,.012,.12,axis='X',vertices=24)
    Lathe('Tow_FrontMountEye',[(.0125,-.020),(.025,-.020),(.025,.020),(.0125,.020),(.0125,-.020)],
          pin,'X',segments=24)
    shackle=Empty('TowShackleFront',pin,hull);shackle.rotation_euler.x=angle
    shackle['HingeAxisLocal']='X';shackle['TravelScope']='Tested demonstration 0-80 degrees; service stops not surveyed'
    points=[(-.04,0,-.022)]
    for i in range(17):
        a=math.pi+i*math.pi/16;points.append((.04*math.cos(a),.010,-.036+.055*math.sin(a)))
    points.append((.04,0,-.022));CurveTube('Tow_FrontShackle',points,.009,parent=shackle)
    for side in [-1,1]:
        Lathe('Tow_FrontShackleEye'+str(side),[(.0125,-.007),(.021,-.007),(.021,.007),(.0125,.007),(.0125,-.007)],
              (side*.04,0,0),'X',parent=shackle,segments=24)
    Rivet('Tow_BracketTop',FrontArmorPoint(0,FrontDetailHeight(.245),.041),normal,.009)
    Rivet('Tow_BracketBottom',FrontArmorPoint(0,FrontDetailHeight(.095),.041),normal,.009)
    # Primary exhibit's small white Hinomaru placard, surface later assigned.
    Plate('Marking_Hinomaru',[FrontArmorPoint(x,FrontDetailHeight(z-.38),.00045) for x,z in [(-.454,.49),(-.285,.49),(-.285,.62),(-.454,.62)]],.0007,'White',bevel=0)
    disc=Cylinder('Marking_RedDisc',(0,0,0),.043,.0009,'Red','Y',vertices=48)
    disc.location=FrontArmorPoint(-.37,FrontDetailHeight(.175),.00135);disc.rotation_euler.x=angle
    for modifier in list(disc.modifiers):disc.modifiers.remove(modifier)


def CorrectEngineHinge():
    """Keep the seated lid; author its side hinge and rear longitudinal handle.

    The two visible knuckles establish the longitudinal outer-edge axis.
    Hidden fork construction, bearing clearance and travel remain inferred.
    """
    hatch=PARTS['EngineHatch']
    bpy.context.view_layer.update()
    closed={child:child.matrix_world.copy() for child in hatch.children}
    pivot=(-.535,.08,GlacisHeight(.08)+.040)
    hatch.matrix_basis=Matrix.Translation(Vector(pivot))@Matrix.Rotation(GLACIS_PITCH,4,'X')
    bpy.context.view_layer.update()
    for child,world in closed.items():child.matrix_world=world
    cover=next(child for child in closed if child.type=='MESH')
    mesh=cover.data
    adjacent=[set() for _ in mesh.vertices]
    for edge in mesh.edges:
        a,b=edge.vertices;adjacent[a].add(b);adjacent[b].add(a)
    unseen=set(range(len(mesh.vertices)));handleVertices=[]
    while unseen:
        seed=unseen.pop();group=[seed];pending=[seed]
        while pending:
            for vertex in adjacent[pending.pop()]:
                if vertex in unseen:unseen.remove(vertex);group.append(vertex);pending.append(vertex)
        points=[cover.matrix_world@mesh.vertices[v].co for v in group]
        width=max(p.x for p in points)-min(p.x for p in points)
        depth=max(p.y for p in points)-min(p.y for p in points)
        if .05<width<.10 and depth<.025:handleVertices.extend(group)
    assert len(handleVertices)==(60 if QUALITY=='High' else 36),'Expected only the previous engine lift handle'
    bm=bmesh.new();bm.from_mesh(mesh);bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[bm.verts[i] for i in handleVertices],context='VERTS')
    bm.to_mesh(mesh);bm.free();mesh.update()
    hatch['TargetHingeM']=pivot
    hatch['HingeAxisLocal']='Y'
    hatch['OpenSignLocal']=-1
    hatch['HingePinRadiusM']=.0045
    hatch['HingeBearingInnerRadiusM']=.005
    hatch['ReferenceScope']='Kubinka fore/aft knuckles on outer edge; concealed fork, clearance and demonstration travel inferred'
    fixed=Empty('EngineHingeFixed',parent=PARTS['Hull'])
    fixed.matrix_basis=hatch.matrix_basis.copy()
    fixed['ReferenceScope']=hatch['ReferenceScope']
    for index,y in enumerate([-.135,.135]):
        Cylinder('EngineHinge_Pin'+str(index),(0,y,0),.0045,.078,axis='Y',parent=fixed,vertices=24)
        Box('EngineHinge_FixedBase'+str(index),(-.028,y,-.035),(.040,.080,.004),parent=fixed,bevel=.001)
        for offset in [-.025,.025]:
            Lathe('EngineHinge_FixedEye'+str(index),[(.005,-.0085),(.010,-.0085),(.010,.0085),(.005,.0085),(.005,-.0085)],
                  (0,y+offset,0),'Y',parent=fixed,segments=24)
            Plate('EngineHinge_FixedFork'+str(index),[(-.028,y+offset-.008,-.033),(-.028,y+offset+.008,-.033),
                  (-.005,y+offset+.008,-.005),(-.005,y+offset-.008,-.005)],.003,parent=fixed,bevel=.0007)
        Lathe('EngineHinge_MovingEye'+str(index),[(.005,-.011),(.010,-.011),(.010,.011),(.005,.011),(.005,-.011)],
              (0,y,0),'Y',parent=hatch,segments=24)
        Plate('EngineHinge_MovingLeaf'+str(index),[(.005,y-.009,-.006),(.005,y+.009,-.006),
              (.050,y+.013,-.0135),(.050,y-.013,-.0135)],.003,parent=hatch,bevel=.0007)
        Rivet('EngineHinge_MovingLeafBolt'+str(index),(.042,y,-.011),(0,0,1),.0045,hatch)
        Rivet('EngineHinge_FixedBaseBolt'+str(index),(-.037,y,-.032),(0,0,1),.0045,fixed)
    # Both originals place the lift near the rear hinge, with its feet mainly
    # fore/aft. Ratios are measured against hinge separation, not whole-car
    # dimensions. Exact rod size and the small skew remain photo estimates.
    inverse=hatch.matrix_world.inverted()
    plane=max((p for p in mesh.polygons if p.normal.z>.8),key=lambda p:p.area)
    point=inverse@(cover.matrix_world@mesh.vertices[plane.vertices[0]].co)
    normal=(inverse.to_3x3()@cover.matrix_world.to_3x3()@plane.normal).normalized()
    center=Vector((.290,-.135-.028,0))
    center.z=point.z-(normal.x*(center.x-point.x)+normal.y*(center.y-point.y))/normal.z-.0003
    skew=math.radians(12);direction=Vector((math.sin(skew),math.cos(skew),0))
    width=.050;height=.027
    profile=[(-width/2,0),(-width/2,height*.6),(-width*.35,height),
             (width*.35,height),(width/2,height*.6),(width/2,0)]
    points=[center+direction*t+Vector((0,0,z)) for t,z in profile]
    CurveTube('Engine_LiftHandleRearLongitudinal',points,.004,parent=hatch)
    hatch['EngineHandleFootCentersLocal']=[value for p in [points[0],points[-1]] for value in p]
    hatch['EngineHandleFootSpanM']=width
    hatch['EngineHandleHeightM']=height
    hatch['EngineHandleForwardSkewDeg']=12
    hatch['EngineHandlePlacementScope']='Both Kubinka originals: rear handle, mainly fore/aft; local size and skew photo-estimated, no metric survey'
    newParts=[obj for obj in bpy.data.objects if obj.parent in {hatch,fixed} and obj not in closed]
    ApplyModifiersAndUv(newParts)
    JoinStaticDetails({hatch.name,fixed.name})
    bpy.context.view_layer.update()


def Driver():
    # Offset to the vehicle's right, ahead of the rear turret.
    layout=json.loads((OUT/'Data_DriverReferenceLayoutV19.json').read_text(encoding='utf-8'))
    frameCenterX=.305;frameWidth=layout['frameWidthM'];frameTopZ=1.23;frameBottomZ=GlacisHeight(.315)
    frameTopY=.183;frameBottomY=.315;frameRearY=-.10;frameRearBottomZ=1.075;frontSlopeY=.132
    if DRIVER_LAYOUT:
        frameCenterX=DRIVER_LAYOUT['centerXM'];frameWidth=DRIVER_LAYOUT['widthM']
        frameTopZ=DRIVER_LAYOUT['topZM'];frameBottomZ=DRIVER_LAYOUT['bottomZM']
        frameTopY=DRIVER_LAYOUT['topForwardM'];frameBottomY=DRIVER_LAYOUT['bottomForwardM']
        frameRearY=frameTopY-.283;frameRearBottomZ=GlacisHeight(frameRearY)
        frontSlopeY=frameBottomY-frameTopY
    driverPoint=namedtuple('DriverPoint','x y z')
    def DesignPoint(x,y,z):
        # Keep the old scalar literals in double precision until the original
        # primitive constructor converts them; early float32 changes bevels.
        if not DRIVER_LAYOUT:return driverPoint(x,y,z)
        return Vector((frameCenterX+(x-.305)*frameWidth/layout['frameWidthM'],y+frameTopY-.183,z+frameTopZ-1.23))
    frameHeight=frameTopZ-frameBottomZ;nearX=frameCenterX-frameWidth/2;farX=frameCenterX+frameWidth/2
    vertices=[(nearX,frameBottomY,frameBottomZ),(farX,frameBottomY,frameBottomZ),(farX,frameTopY,frameTopZ),(nearX,frameTopY,frameTopZ),
              (nearX,frameRearY,frameRearBottomZ),(farX,frameRearY,frameRearBottomZ),(farX,frameRearY,frameTopZ),(nearX,frameRearY,frameTopZ)]
    PARTS['Hull']['DriverFrontFrameCornersM']=[value for i in [2,3,0,1] for value in vertices[i]]
    visorCenterX=frameCenterX+layout['cover']['centerCross']*frameWidth
    visorWidth=layout['cover']['widthRatio']*frameWidth
    visorTopZ=frameTopZ-layout['cover']['topDown']*frameHeight
    visorBottomZ=frameTopZ-layout['cover']['bottomDown']*frameHeight
    visorPinZ=DesignPoint(.305,.202,1.250).z;visorPinY=DesignPoint(.305,.202,1.250).y
    visorNormal=Vector((0,frameHeight,frontSlopeY)).normalized()
    def FrontFramePoint(x,z):return (x,frameTopY+(frameTopZ-z)*frontSlopeY/frameHeight,z)
    def VisorWorld(x,z,normalOffset=0):
        return Vector(FrontFramePoint(x,z))+visorNormal*(layout['cover']['normalStandOffM']+normalOffset)
    opening=[(visorCenterX-.1175,frameTopZ-.82*frameHeight),(visorCenterX+.1175,frameTopZ-.82*frameHeight),
             (visorCenterX+.1175,frameTopZ-.20*frameHeight),(visorCenterX-.1175,frameTopZ-.20*frameHeight)]
    AperturePlate('Driver_FrontArmor',[vertices[i] for i in [0,1,2,3]],
                  [FrontFramePoint(x,z) for x,z in opening],.009,bevel=.0015)
    Plate('Driver_RearArmor',[vertices[i] for i in [4,7,6,5]],.009)
    sideLeft=Plate('Driver_LeftArmor',[vertices[i] for i in [0,3,7,4]],.009)
    CutBox(sideLeft,DesignPoint(.04,.01,1.15),(.14,.13,.075))
    sideRight=Plate('Driver_RightArmor',[vertices[i] for i in [1,5,6,2]],.009)
    CutBox(sideRight,(farX-.010,DesignPoint(.305,.01,1.15).y,DesignPoint(.305,.01,1.15).z),(.14,.13,.075))
    RoofFrame('Driver_RoofFrame',(frameCenterX,DesignPoint(.305,.0415,1.23).y),(frameWidth,.283),(.405,.19),frameTopZ)
    if DRIVER_LAYOUT:
        # Close the small inferred base skirt against the selected deck.
        # The four photo-control frame sites remain explicit above that skirt.
        k=frontSlopeY/frameHeight
        if FOREBODY_LAYOUT:
            feetCandidates=[]
            for (ya,za),(yb,zb)in zip(GLACIS_PROFILE,GLACIS_PROFILE[1:]):
                slope=(zb-za)/(ya-yb)
                y=(frameTopY+k*(frameTopZ-za-slope*ya))/(1-k*slope)
                if yb<=y<=ya:feetCandidates.append(y)
            assert len(feetCandidates)==1,'Cabin front must intersect exactly one declared deck segment'
            footY=feetCandidates[0]
        else:footY=(frameTopY+k*(frameTopZ-GLACIS_REAR_Z-GLACIS_SLOPE*GLACIS_REAR_Y))/(1-k*GLACIS_SLOPE)
        footZ=GlacisHeight(footY)
        assert footZ<frameBottomZ and frameBottomY<footY<frameBottomY+.030
        feet=[(nearX,footY,footZ),(farX,footY,footZ)]
        # The new deck can leave only a few millimetres of exposed skirt.
        # Leave this inferred narrow wedge sharp. Bevel overlap clamping at
        # its acute rear corners otherwise creates submicron sliver faces.
        skirtBevel=0 if FOREBODY_LAYOUT else .002
        Plate('Driver_FrontBaseSkirt',[vertices[0],feet[0],feet[1],vertices[1]],.009,bevel=skirtBevel)
        Plate('Driver_LeftBaseSkirt',[vertices[0],vertices[4],feet[0]],.009,bevel=skirtBevel)
        Plate('Driver_RightBaseSkirt',[vertices[1],feet[1],vertices[5]],.009,bevel=skirtBevel)
        PARTS['Hull']['DriverBaseSkirtInferred']=True
        PARTS['Hull']['DriverBaseSkirtHeightM']=frameBottomZ-footZ
    # The central flap is considerably narrower than the surrounding plate.
    # Its two small hinges are distinct from the large outer frame fittings.
    # Closed proportions follow Kubinka; the open ArmorSchool photo confirms
    # the central flap and hinge ownership, not hidden museum dimensions.
    visor=Empty('Hatch_DriverVisor',(visorCenterX,visorPinY,visorPinZ),PARTS['Hull'])
    visor['TargetHingeM']=(visorCenterX,visorPinY,visorPinZ)
    visor['ReferenceScope']='Kubinka closed central panel; ArmorSchool open central flap corroborates hinge ownership; local dimensions and concealed bearing section inferred'
    visor['CoverWidthM']=visorWidth
    visor['HingePinRadiusM']=.004
    visor['HingeBearingInnerRadiusM']=.0044
    PARTS['DriverVisor']=visor
    def VisorLocal(x,z,normalOffset=0):return VisorWorld(x,z,normalOffset)-visor.location
    halfSeam=visorWidth/2+.005
    # A positive hidden gap prevents coincident seal/lid faces at the exact
    # closed pose. The 0.3 mm clearance is inferred, not a surveyed tolerance.
    visor['ClosedSealGapM']=.0003
    visor['FullBodyContactExclusionM']=0.
    sealOffset=-.009/2-.004/2-visor['ClosedSealGapM']
    AperturePlate('Driver_VisorSeam',[VisorWorld(x,z,sealOffset) for x,z in
                  [(visorCenterX-halfSeam,visorBottomZ-.004),(visorCenterX+halfSeam,visorBottomZ-.004),
                   (visorCenterX+halfSeam,visorTopZ+.004),(visorCenterX-halfSeam,visorTopZ+.004)]],
                  [VisorWorld(x,z,sealOffset) for x,z in opening],.004,'Dark')
    pitch=-math.atan2(visorNormal.y,visorNormal.z)
    flap=RoundedPlate('Driver_VisorFlap',VisorLocal(visorCenterX,(visorTopZ+visorBottomZ)/2),
                      visorWidth,math.hypot(visorTopZ-visorBottomZ,(visorTopZ-visorBottomZ)*visorNormal.z/visorNormal.y),
                      .009,.006,parent=visor,pitch=pitch)
    sight=layout['sight'];sightX=frameCenterX+sight['centerCross']*frameWidth;sightZ=frameTopZ-sight['centerDown']*frameHeight
    sightCenter=VisorLocal(sightX,sightZ);down=Vector((0,visorNormal.z,-visorNormal.y));sightWidth=sight['widthRatio']*frameWidth
    # Only the fine outer mouth is observed. The hidden splay provides actual
    # clearance for front-normal, horizontal and reference-camera sight rays.
    rings=[(-.03,.012),(-.00451,.012),(.00451,sight['heightM']),(.03,sight['heightM'])]
    cutterPoints=[]
    for depth,height in rings:
        for x,y in [(-sightWidth/2,-height/2),(sightWidth/2,-height/2),(sightWidth/2,height/2),(-sightWidth/2,height/2)]:
            cutterPoints.append(sightCenter+Vector((x,0,0))+down*y+visorNormal*depth)
    cutterFaces=[(3,2,1,0),(12,13,14,15)]
    for ring in range(3):
        for i in range(4):cutterFaces.append((ring*4+i,ring*4+(i+1)%4,(ring+1)*4+(i+1)%4,(ring+1)*4+i))
    CutWith(flap,Mesh('TemporaryDriverVisorSightChannel',cutterPoints,cutterFaces,'Dark',visor))
    visor['SightChannelScope']='Visible narrow outer mouth from primary; hidden inward splay inferred for actual viewing clearance'
    visor['SightOuterCenterLocalM']=list(VisorLocal(sightX,sightZ,.0045))
    visor['SightNormalLocalM']=list(visorNormal)
    for control in layout['coverFasteners']:
        x=frameCenterX+control['cross']*frameWidth;z=frameTopZ-control['down']*frameHeight
        Rivet('Driver_VisorFlapFastener',VisorLocal(x,z,.0055),visorNormal,.0065,visor)
    fixedHinges=Empty('DriverVisorHingeFixed',parent=PARTS['Hull'])
    fixedHinges['ReferenceScope']='Two central transverse pins; hidden bearing thickness/clearance inferred'
    for index,station in enumerate([.248,.378]):
        x=DesignPoint(station,.202,1.250).x
        pin=(x,visorPinY,visorPinZ)
        Cylinder('DriverVisor_HingePin'+str(index),pin,.004,.080,axis='X',parent=fixedHinges,vertices=24)
        for offset in [-.0275,.0275]:
            Box('DriverVisor_HingeBase'+str(index),(x+offset,DesignPoint(.305,.188,1.238).y,DesignPoint(.305,.188,1.238).z),(.020,.028,.014),parent=fixedHinges,bevel=.002)
            Lathe('DriverVisor_FixedBearing'+str(index),[(.0044,-.009),(.0095,-.009),(.0095,.009),(.0044,.009),(.0044,-.009)],
                  (x+offset,visorPinY,visorPinZ),'X',parent=fixedHinges,segments=24)
        Lathe('DriverVisor_MovingBearing'+str(index),[(.0044,-.013),(.0085,-.013),(.0085,.013),(.0044,.013),(.0044,-.013)],
              (x-visorCenterX,0,0),'X',parent=visor,segments=24)
        leafTop=Vector((x-visorCenterX,.0055,-.0055))
        leafBottom=VisorLocal(x,visorTopZ-.004,.004)
        Plate('DriverVisor_MovingLeaf'+str(index),[leafTop+Vector((-.011,0,0)),leafTop+Vector((.011,0,0)),
              leafBottom+Vector((.0155,0,0)),leafBottom+Vector((-.0155,0,0))],.005,parent=visor,bevel=.002)
        leafNormal=Vector((0,-(leafBottom.z-leafTop.z),leafBottom.y-leafTop.y)).normalized()
        leafBolt=leafTop.lerp(leafBottom,(.028-.0055)/(-leafBottom.z-.0055))+leafNormal*.0027
        Rivet('DriverVisor_LeafBolt'+str(index),leafBolt,leafNormal,.0053,visor)
    roofFixed=Empty('DriverRoofHingeFixed',parent=PARTS['Hull'])
    roofFixed['ReferenceScope']='Forward roof hinge axis follows the master front fittings and open-roof photographs; concealed fork and bearing section inferred'
    for station in [.140,.490]:
        x=DesignPoint(station,.202,1.250).x
        Cylinder('Driver_RoofFixedPin',(x,visorPinY,visorPinZ),.0045,.069,axis='X',parent=roofFixed,vertices=24)
        for offset in [-.0245,.0245]:
            Box('Driver_RoofFixedBase',(x+offset,DesignPoint(.305,.188,1.238).y,DesignPoint(.305,.188,1.238).z),(.018,.028,.014),parent=roofFixed,bevel=.002)
            Lathe('Driver_RoofFixedEye',[(.005,-.009),(.0095,-.009),(.0095,.009),(.005,.009),(.005,-.009)],
                  (x+offset,visorPinY,visorPinZ),'X',parent=roofFixed,segments=24)
        top=Vector((x,DesignPoint(.305,.202,1.242).y,DesignPoint(.305,.202,1.242).z));bottom=Vector((x,DesignPoint(.305,.2115,1.205).y,DesignPoint(.305,.2115,1.205).z))
        if DRIVER_LAYOUT:
            legacyHeight=1.23-GlacisHeight(.315)
            footZ=frameTopZ-.025*frameHeight/legacyHeight
            bottom=Vector(FrontFramePoint(x,footZ))+visorNormal*.0033
            roofFixed['CabinFootSurfaceInferred']=True
        notch=top.lerp(bottom,.005/.037)
        if DRIVER_LAYOUT:notch=top.lerp(bottom,.005/(top.z-bottom.z))
        Plate('Driver_RoofFixedLeaf',[top+Vector((-.027,0,0)),top+Vector((-.0145,0,0)),
              notch+Vector((-.0145,0,0)),notch+Vector((.0145,0,0)),top+Vector((.0145,0,0)),
              top+Vector((.027,0,0)),bottom+Vector((.0295,0,0)),bottom+Vector((-.0295,0,0))],
              .006,parent=roofFixed,bevel=.001)
        normal=Vector((0,-(bottom.z-top.z),bottom.y-top.y)).normalized()
        for offset in [-.017,.017]:
            Rivet('Driver_RoofFixedLeafBolt',top.lerp(bottom,.68)+Vector((offset,0,0))+normal*.0033,normal,.0045,roofFixed)
    for control in layout['frameFasteners']:
        x=frameCenterX+control['cross']*frameWidth;z=frameTopZ-control['down']*frameHeight
        point=Vector(FrontFramePoint(x,z))+visorNormal*.0055
        radius=.005 if control['name'].startswith('FarStrip')else .006
        Rivet('DriverFrontReferenceRivet',point,visorNormal,radius)
    # Closed side vision cover with the exact raised plate / screw motif.
    portX=nearX-.007
    mount=Empty('DriverPortMount',(portX,DesignPoint(.305,.01,1.205).y,DesignPoint(.305,.01,1.205).z),PARTS['Hull'])
    SideVisionPort('DriverPortLeft',mount,-1,.181,.112,-.055,.010,.011,.029,lambda y,z:-.0025)
    rightMount=Empty('DriverPortMountRight',(farX+.007,DesignPoint(.305,.01,1.205).y,DesignPoint(.305,.01,1.205).z),PARTS['Hull'])
    rightPort=SideVisionPort('DriverPortRight',rightMount,1,.181,.112,-.055,.010,.011,.029,lambda y,z:-.0025)
    rightPort['ReferenceScope']='Outer driver-side cover visible in the independent 2017 Game*Spark photograph; exact size, placement and concealed section share the existing estimate, not a survey'
    PARTS['Hull']['DriverRightPortRequired']=True
    PARTS['Hull']['DriverRightPortReference']='Reference_PatriotReport2017A.jpg'
    # The access lid opens toward the nose. Preserve the old closed lid and
    # handle world geometry, but put its pivot on the observed front hinges.
    hatch=Empty('Hatch_DriverRoof',(frameCenterX,visorPinY,visorPinZ),PARTS['Hull'])
    hatch['TargetHingeM']=(frameCenterX,visorPinY,visorPinZ)
    hatch['OpenSignLocal']=-1
    hatch['HingeAxisLocal']='X'
    hatch['FullBodyContactExclusionM']=0.
    hatch['ReferenceScope']='Forward-opening roof corroborated by Shuri open-roof photo; closed lid shape retained from master study; hidden bearings and demonstration stop inferred'
    PARTS['DriverHatch']=hatch
    RoundedPlate('Driver_RoofHatch',Vector(DesignPoint(.305,.040,1.240))-hatch.location,.46,.23,.010,.025,parent=hatch)
    Handle('Driver_RoofHandle',Vector(DesignPoint(.305,.070,1.252))-hatch.location,.07,parent=hatch)
    for station in [.140,.490]:
        x=DesignPoint(station,.202,1.250).x
        Lathe('Driver_RoofMovingEye',[(.005,-.012),(.0095,-.012),(.0095,.012),(.005,.012),(.005,-.012)],
              (x-frameCenterX,0,0),'X',parent=hatch,segments=24)
        front=Vector((x-frameCenterX,-.006,-.006));back=Vector((x-frameCenterX,-.065,-.0035))
        Plate('Driver_RoofMovingLeaf',[front+Vector((-.010,0,0)),back+Vector((-.012,0,0)),
              back+Vector((.012,0,0)),front+Vector((.010,0,0))],.006,parent=hatch,bevel=.001)
        normal=Vector((0,back.z-front.z,-(back.y-front.y))).normalized()
        Rivet('Driver_RoofMovingLeafBolt',front.lerp(back,.85)+normal*.0033,normal,.0045,hatch)


def Turret():
    pivot=Empty('TurretYaw',tuple(TURRET_LAYOUT['pivotBlenderM'])if TURRET_LAYOUT else(0,-.58,1.0746),PARTS['Hull'])
    PARTS['Turret']=pivot
    roofDelta=TURRET_LAYOUT['roofZLocalM']-.511 if TURRET_LAYOUT else 0.
    coneSlope=TURRET_LAYOUT['coneSlope']if TURRET_LAYOUT else .17
    if TURRET_LAYOUT:
        pivot['TurretEnvelopeLayout']=turretLayoutFile;pivot['RoofGeometryDeltaZ']=roofDelta
        pivot['TurretDimensionsInferred']=True
    rivetLayout=json.loads((OUT/'Data_TurretRivetLayoutV25.json').read_text(encoding='utf-8'))
    portLayout=json.loads((OUT/'Data_TurretPortReferenceLayoutV26.json').read_text(encoding='utf-8'))
    sideSector=json.loads((OUT/'Data_TurretSideSectorV35.json').read_text(encoding='utf-8'))
    sector=sideSector['geometryEstimate']
    rivetLayout['retainedColumnYLocalM']=sector['pairedColumnYLocalTurretM']
    for key in ['coverWidthM','coverHeightM','openingWidthM','openingHeightM']:
        portLayout['geometryEstimate'][key]=sector[key]
    rearLayout=json.loads((OUT/'Data_TurretRearLayoutV27.json').read_text(encoding='utf-8'))
    bearingProfile=[(.30,0),(.425,0),(.431,.018),(.431,.032),(.401,.04),(.397,.042),(.30,.042),(.30,0)]
    if TURRET_LAYOUT:
        radialDelta=TurretRadiusAt(.105)-.419
        bearingProfile=[(r+radialDelta,z)for r,z in bearingProfile]
    Lathe('Turret_Bearing',bearingProfile,(0,0,0),parent=pivot)
    # Faceted tapered shell has a short undercut below the main cone.
    n=48
    shellProfile=[(.374,.045),(.382,.045),(.419,.105),(.352,.494),(.345,.503),(.270,.503),(.270,.491),(.337,.491),(.344,.487),(.411,.105),(.374,.053),(.374,.045)]
    if TURRET_LAYOUT:
        rr=TURRET_LAYOUT['roofRadiusM'];rz=TURRET_LAYOUT['roofZLocalM'];rb=TurretRadiusAt(.105)
        shellProfile=[(rb-.045,.045),(rb-.037,.045),(rb,.105),(TurretRadiusAt(rz-.017),rz-.017),
            (rr-.006,rz-.008),(.270,rz-.008),(.270,rz-.020),(rr-.014,rz-.020),
            (rr-.007,rz-.024),(rb-.008,.105),(rb-.045,.053),(rb-.045,.045)]
    shell=Lathe('Turret_TaperedArmor',shellProfile,(0,0,0),parent=pivot,segments=n)
    for vertex in shell.data.vertices:
        # The photographed turret has a broad flat front and a rounded rear.
        r=math.hypot(vertex.co.x,vertex.co.y)
        if r>(TURRET_LAYOUT['roofRadiusM']-.016 if TURRET_LAYOUT else .335) and vertex.co.y>r*.90:
            vertex.co.y=r*.90
    shell.data.update()
    for face in shell.data.polygons:face.use_smooth=abs(face.normal.z)<.98 and abs(face.normal.y)<.95
    frontPoints=[(-.18,.377,.109),(.18,.377,.109),(.15,.327,.475),(-.15,.327,.475)]
    if TURRET_LAYOUT:frontPoints=[(x,TurretFrontAt(z),z)for x,y,z in frontPoints]
    frontArmor=Plate('Turret_FrontArmor',frontPoints,.009,parent=pivot)
    gunInitialY=TurretFrontAt(.30)+(.353-(.377+(.327-.377)*(.30-.109)/(.475-.109)))if TURRET_LAYOUT else .353
    gunShift=gunInitialY-.353
    # The ball's back reaches the armor at the downward limit. A real opening
    # through both armor layers is required, not a collision exclusion.
    for owner in [shell,frontArmor]:
        cutter=Cylinder('TemporaryMgSocketOpening',(0,.36+gunShift,.30),.116,.25,'Dark','Y',pivot,64)
        CutWith(owner,cutter)
    pivot['MgSocketOpeningRequired']=True
    pivot['MgSocketOpeningCenterLocalM']=(0,.36+gunShift,.30)
    pivot['MgSocketOpeningRadiusM']=.116
    pivot['MgSocketOpeningSectionInferred']=True
    lip=[(.337,.502),(.351,.502),(.351,.511),(.335,.512)]
    if TURRET_LAYOUT:lip=[(r+TURRET_LAYOUT['roofRadiusM']-.351,z+roofDelta)for r,z in lip]
    Lathe('Turret_RoofLip',lip,(0,0,0),parent=pivot)
    for level,radius in [(.078,.402),(.139,.413),(.447,.361)]:
        for i in range(24):
            a=i*math.tau/24
            if level==.139 and math.sin(a)>.70:
                continue
            # The photographed five-row paired strip owns this part of the
            # upper row; do not overlay a second generic pair on it.
            if level==.447 and abs(radius*math.cos(a))>.28:
                columnY=radius*math.sin(a)
                if -.23<columnY<-.06 or min(rivetLayout['retainedColumnYLocalM'])-.015<columnY<max(rivetLayout['retainedColumnYLocalM'])+.015:
                    continue
            rear=rearLayout['geometryEstimate']
            rearAngle=(a-rear['centerAngleRad']+math.pi)%math.tau-math.pi
            if rear['bottomZInTurretM']-.006<level<rear['topZInTurretM']+.006 and abs(rearAngle)<.36:
                continue
            if TURRET_LAYOUT:
                radial=Vector((math.cos(a),math.sin(a),0));hit,point,normal,face=shell.ray_cast(radial*.65+Vector((0,0,level)),-radial,distance=1.)
                if hit:Rivet('Turret_SeamRivet',point+normal*.001,normal,.0055,pivot)
            else:Rivet('Turret_SeamRivet',(radius*math.cos(a),radius*math.sin(a),level),(math.cos(a),math.sin(a),.17),.0055,pivot)
    for angle in [-.3,.45,1.95,2.8,3.5,4.1]:
        # These two legacy columns ran through the dedicated paired strips.
        if angle in [-.3,3.5,.45,2.8]:continue
        for z in [.21,.295,.38,.45]:
            r=TurretRadiusAt(z)+.001 if TURRET_LAYOUT else .437-z*.17
            Rivet('Turret_PanelRivet',(r*math.cos(angle),r*math.sin(angle),z),(math.cos(angle),math.sin(angle),coneSlope),.0052,pivot)
    # Front mounting and the very short MG retain a common moving owner.
    gun=Empty('MachineGunPitch',(0,gunInitialY,.30),pivot)
    if TURRET_LAYOUT:
        gun['TargetAimPivotM']=(0,gunInitialY+.064,.30)
        gun['DriverRoofGunMinElevationDegrees']=BODY_LAYOUT.get('driverRoofGunMinElevationDegrees',TURRET_LAYOUT['driverRoofGunMinElevationDegrees'])if BODY_LAYOUT else TURRET_LAYOUT['driverRoofGunMinElevationDegrees']
        gun['DriverRoofGunPoseInferred']=True
    PARTS['Gun']=gun
    gun['CaliberM']=.0065
    Lathe('MG_OuterMount',[(.078,-.005),(.151,-.005),(.157,.012),(.148,.028),(.125,.035),(.115,.047)],(0,0,0),'Y',parent=gun)
    frontLayoutFile=BODY_LAYOUT.get('turretFrontLayout','Data_TurretFrontLayoutV32.json')if BODY_LAYOUT else 'Data_TurretFrontLayoutV32.json'
    assert Path(frontLayoutFile).name==frontLayoutFile
    frontLayout=json.loads((OUT/frontLayoutFile).read_text(encoding='utf-8'))
    ballProfile=frontLayout.get('movingFrontBall',{}).get('latheProfileRYBeforeReanchorM',[(0,.028),(.103,.028),(.112,.055),(.101,.10),(0,.10)])
    ball=Lathe('MG_CentralBall',ballProfile,(0,0,0),'Y','Paint',gun)
    # Clean coincident lathe-axis vertices before the real round bore.
    bm=bmesh.new();bm.from_mesh(ball.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-7)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ball.data);bm.free();ball.data.update()
    opening=frontLayout['roundOpening']
    openingCenter=opening['centerBeforeGunReanchorM']
    cutter=Cylinder('TemporaryMgRoundOpening',(openingCenter[0],.064,openingCenter[2]),opening['adoptedRadiusM'],.14,'Dark','Y',gun,48)
    CutWith(ball,cutter)
    for polygon in ball.data.polygons:
        if abs(polygon.normal.y)>.9999:polygon.use_smooth=False
    flangeLayout=json.loads((OUT/'Data_MgFlangeReferenceV31.json').read_text(encoding='utf-8'))
    flange=flangeLayout['geometryEstimate']
    for i in range(flange['fastenerCount']):
        a=math.radians(flange['angleOffsetDegrees']+i*flange['angleStepDegrees'])
        head=Cylinder('MG_MountBolt',
                      (flange['boltCircleRadiusM']*math.cos(a),flange['axialCenterBeforeDetailCorrectionM'],
                       flange['boltCircleRadiusM']*math.sin(a)),
                      flange['headCircumradiusM'],flange['headDepthM'],axis='Y',parent=gun,
                      vertices=flange['sectionSides'])
        for polygon in head.data.polygons:polygon.use_smooth=False
        head.modifiers['ManufacturedEdgeRadius'].width=flange['headBevelM']
    # Both dates show a raised leaning fitting, not a flat black triangle.
    # Its root embeds in the ball; depth, attachment and function are inferred.
    # The dark region below it is unresolved and is not blindly cut through.
    fitting=frontLayout['raisedFitting']
    Plate('MG_FrontRaisedFitting',[(x,fitting['centerYBeforeGunReanchorM'],z)
          for x,z in fitting['outlineXZBeforeGunReanchorM']],fitting['thicknessM'],
          fitting['surfaceRole'],gun,fitting['edgeBevelM'])
    gun['MgFrontRaisedFittingRequired']=True
    gun['MgFrontRaisedFittingLayout']=frontLayoutFile
    gun['MgFrontRaisedFittingFunctionAccepted']=False
    gun['MgFrontRaisedFittingDepthInferred']=True
    gun['MgFrontRaisedFittingIndependentMotion']=False
    gun['MgFrontRaisedFittingFrontProbePointsLocalM']=[v for point in fitting['frontProbePointsAfterGunReanchorM'] for v in point]
    gun['MgFrontRaisedFittingRootYLocalM']=fitting['rootYAfterGunReanchorM']
    gun['MgLowerDarkNotchClassification']=fitting['lowerDarkNotchClassification']
    barrelAxisZ=frontLayout.get('barrel',{}).get('axisZBeforeReanchorM',-.005)
    if 'barrel'in frontLayout:
        gun['MgBarrelAxisZLocalM']=barrelAxisZ
        gun['MgFrontFaceRadiusM']=frontLayout['movingFrontBall']['frontFaceRadiusM']
        gun['MgFrontProfileInferred']=True
    Lathe('MG_CoolingJacket',[(.0084,.099),(.0175,.099),(.0175,.29),(.0147,.315),(.0126,.34),(.0084,.34)],(0,0,barrelAxisZ),'Y','Steel',gun,32)
    for y in [.13,.27]:
        Cylinder('MG_JacketCollar',(0,y,barrelAxisZ),.0195,.007,'Steel','Y',gun,24)
    Lathe('MG_Muzzle',[(.00325,.31),(.012,.31),(.0113,.385),(.00325,.385),(.00325,.365)],(0,0,barrelAxisZ),'Y','Steel',gun,32)
    # This is now the sole dark sibling; preserve its public owner name even
    # though JoinStaticDetails deliberately skips singleton groups.
    Cylinder('Geometry_MachineGunPitch_Dark',(0,.376,barrelAxisZ),.00325,.001,'Dark','Y',gun,20)
    if frontLayout.get('barrel',{}).get('frontSightRetained',True):
        Box('MG_FrontSight',(0,.30,barrelAxisZ+.0265 if 'barrel'in frontLayout else .0215),(.009,.015,.025),'Steel',gun,.001)
    # Visor covers on each side: raised rectangular armor, four studs and latch.
    for side in [-1,1]:
        label='Left' if side<0 else 'Right'
        angle=sector['portAngleFromSideRad'];mountZ=sector['portMountZLocalTurretM']
        mountRadius=TurretRadiusAt(mountZ)if TURRET_LAYOUT else .419+(.352-.419)*(mountZ-.105)/(.494-.105)
        mount=Empty('TurretPortMount'+label,(side*mountRadius*math.cos(angle),mountRadius*math.sin(angle),mountZ),pivot)
        mount.rotation_euler.y=-side*(math.atan(coneSlope)if TURRET_LAYOUT else .17);mount.rotation_euler.z=side*angle
        mount['SideSectorLayout']='Data_TurretSideSectorV35.json'
        mount['AngleFromSideRad']=angle
        bpy.context.view_layer.update()
        toShell=shell.matrix_world.inverted()@mount.matrix_world;toMount=toShell.inverted()
        def Backing(y,z):
            start=toShell@Vector((side*.12,y,z));direction=(toShell.to_3x3()@Vector((-side,0,0))).normalized()
            hit,point,normal,face=shell.ray_cast(start,direction,distance=.40)
            if not hit:raise RuntimeError('Missing turret backing surface: '+label+' '+str((y,z)))
            return side*(toMount@point).x
        estimate=portLayout['geometryEstimate'];centerZ=estimate['coverCenterZInMountM']
        opening=(estimate['openingWidthM'],estimate['openingHeightM'])
        port=SideVisionPort('TurretPort'+label,mount,side,estimate['coverWidthM'],estimate['coverHeightM'],centerZ,.012,.013,.032,Backing,
                            conforming=True,layoutData=portLayout['localFittings'],openingSize=opening,
                            hingeAxisZ=estimate['hingeAxisZInMountM'],fixedFootAxisOffset=estimate['fixedFootAxisOffsetM'],
                            movingLeafLowerInset=estimate['movingLeafLowerInsetM'],movingLeafBoltFraction=estimate['movingLeafBoltFraction'])
        port['ReferenceLayout']='Data_TurretSideSectorV35.json'
        port['BaseFittingLayout']='Data_TurretPortReferenceLayoutV26.json'
        port['ReferenceScope']='Front-side sector and compact cover estimated from selected same-vehicle photos; cone profile, absolute dimensions, hidden opening and opposite side inferred'
        cutter=Box('TemporaryTurretPortOpening',(0,0,centerZ),(.24,*opening),'Dark',mount,0)
        backup=cutter.copy();backup.data=cutter.data.copy();bpy.context.collection.objects.link(backup)
        CutWith(shell,cutter)
        CutWith(frontArmor,backup)
        bpy.context.view_layer.update()
        contacts=[];normals=[]
        pairedSites=[]
        if TURRET_LAYOUT:pairedSites=[(site['yM'],site['zM'])for site in TURRET_LAYOUT['pairedRivetSites']]
        else:
            for down in rivetLayout['downFractions']:
                z=rivetLayout['retainedTopLocalM']+(rivetLayout['retainedBottomLocalM']-rivetLayout['retainedTopLocalM'])*down
                pairedSites.extend((y,z)for y in rivetLayout['retainedColumnYLocalM'])
        for y,z in pairedSites:
            hit,point,normal,face=shell.ray_cast(Vector((side*.60,y,z)),Vector((-side,0,0)),distance=.50)
            if not hit or side*normal.x<.7:raise RuntimeError('Missing paired-rivet outer cone surface: '+label)
            Rivet('Turret_PairedRivet',point+normal*.001,normal,.0057,pivot)
            contacts.extend(point);normals.extend(normal)
        pivot['PairedRivetSurfacePoints'+label+'LocalM']=contacts
        pivot['PairedRivetSurfaceNormals'+label+'Local']=normals
    pivot['PairedRivetRowsPerColumn']=rivetLayout['rowsPerColumn']
    pivot['PairedRivetLayout']='Data_TurretRivetLayoutV25.json'
    pivot['PairedRivetOppositeSideInferred']=rivetLayout['oppositeSidePatternInferred']
    pivot['PairedRivetSectorLayout']='Data_TurretSideSectorV35.json'
    pivot['PairedRivetColumnYLocalM']=sector['pairedColumnYLocalTurretM']
    # Closed round commander lid, hinged at the front on a separate control.
    lid=Empty('Hatch_Commander',(0,.245,.525),pivot)
    PARTS['CommanderHatch']=lid
    lid['HingeAxisLocal']='X';lid['OpenSignLocal']=-1
    lid['TargetHingeM']=(0,.245,.525)
    lid['HingePinRadiusM']=.004;lid['HingeBearingInnerRadiusM']=.0044
    lid['HingeBearingOuterRadiusM']=.0095;lid['HingeContactExclusionM']=0.
    lid['FrontChordYLocalTurretM']=.228
    lid['RoofOpeningFrontYLocalTurretM']=.213
    lid['SealInnerFrontYLocalTurretM']=.216
    lid['SealOuterFrontYLocalTurretM']=.232
    lid['ReferenceScope']='Kubinka closed twin front hinges and rounded rear lid; open front-chord form corroborated by supplementary vehicle; hidden bearing section and travel inferred'
    Lathe('Turret_HatchSeam',[(.269,.509),(.292,.509),(.292,.5137),(.269,.5137),(.269,.509)],(0,0,0),role='Dark',parent=pivot)
    Cylinder('Turret_HatchLid',(0,-.245,-.005),.286,.012,parent=lid)
    fixed=Empty('CommanderHingeFixed',parent=pivot)
    fixed['ReferenceScope']='Separate fixed pins and open annular eyes; concealed bearing dimensions inferred'
    stations=frontLayout['commanderHinge']['pinStationsXLocalTurretM']
    fixed['RoofFootCentersLocalTurretM']=[value for x in stations for offset in [-.026,.026] for value in (x+offset,.246,.503)]
    fixed['PinStationsXLocalTurretM']=stations
    fixed['RelativeStationLayout']='Data_TurretFrontLayoutV32.json'
    fixed['RelativeStationsConditional']=True
    for index,x in enumerate(stations):
        pin=Vector((x,.245,.525))
        Cylinder('Commander_HingePin'+str(index),pin,.004,.078,axis='X',parent=fixed,vertices=24)
        for offset in [-.026,.026]:
            Lathe('Commander_FixedBearing'+str(index),[(.0044,-.009),(.0095,-.009),(.0095,.009),(.0044,.009),(.0044,-.009)],
                  pin+Vector((offset,0,0)),axis='X',parent=fixed,segments=32)
            top=pin+Vector((offset,.004,-.005))
            foot=Vector((x+offset,.249,.5065))
            Plate('Commander_FixedLeaf'+str(index),[top+Vector((-.007,0,0)),top+Vector((.007,0,0)),
                  foot+Vector((.009,0,0)),foot+Vector((-.009,0,0))],.004,parent=fixed,bevel=.0008)
            Box('Commander_FixedRoofFoot'+str(index),(x+offset,.246,.505),(.018,.020,.004),parent=fixed,bevel=.0005)
            Rivet('Commander_FixedLeafBolt'+str(index),(x+offset,.250,.508),(0,0,1),.004,fixed)
        localPin=pin-lid.location
        Lathe('Commander_MovingBearing'+str(index),[(.0044,-.012),(.0095,-.012),(.0095,.012),(.0044,.012),(.0044,-.012)],
              localPin,axis='X',parent=lid,segments=32)
        front=pin+Vector((0,-.004,.004));rear=Vector((x,.190,.5273))
        Plate('Commander_MovingLeaf'+str(index),[front+Vector((-.010,0,0))-lid.location,
              front+Vector((.010,0,0))-lid.location,rear+Vector((.012,0,0))-lid.location,
              rear+Vector((-.012,0,0))-lid.location],.003,parent=lid,bevel=.0006)
        leafNormal=Vector((0,-(front.z-rear.z)/(front.y-rear.y),1)).normalized()
        boltPoint=front.lerp(rear,(front.y-.201)/(front.y-rear.y))+leafNormal*(.0015+.001)
        Rivet('Commander_MovingLeafBolt'+str(index),boltPoint-lid.location,leafNormal,.004,lid)
    Handle('Turret_HatchLift',(0,-.085,.004),.085,parent=lid)
    import importlib.util
    rearSpec=importlib.util.spec_from_file_location('Type94TurretRear',ROOT/'Taierzhuang1938/_blender/Script_Type94TurretRear.py')
    rearModule=importlib.util.module_from_spec(rearSpec);rearSpec.loader.exec_module(rearModule)
    PARTS['TurretRear']=rearModule.BuildTurretRear(shell,pivot,globals(),rearLayout)
    if TURRET_LAYOUT:
        lid.location.z+=roofDelta;fixed.location.z+=roofDelta
        lid['TargetHingeM']=(0,.245,.525+roofDelta)
        fixed['RoofFootCentersLocalTurretM']=[value+(roofDelta if i%3==2 else 0)for i,value in enumerate(fixed['RoofFootCentersLocalTurretM'])]
        for obj in [bpy.data.objects.get('Turret_HatchSeam')]:
            if obj:obj.location.z+=roofDelta


def VentHousing():
    """Projecting three-slot shroud seen on the Kubinka left-front engine side.

    The prior flat plate missed the top hood, end walls and lower apron. Local
    dimensions are photo estimates. The visible catches are authored closed;
    their operating travel and concealed fastenings have not been established.
    """
    if BODY_LAYOUT and BODY_LAYOUT.get('ventLayout'):
        spec=importlib.util.spec_from_file_location('Type94VentHousing',ROOT/'Taierzhuang1938/_blender/Script_Type94VentHousing.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        return module.BuildVent(globals(),json.loads((OUT/BODY_LAYOUT['ventLayout']).read_text(encoding='utf-8')))
    owner=Empty('VentHousing',parent=PARTS['Hull'])
    layout=json.loads((OUT/'Data_VentTopLapV37.json').read_text(encoding='utf-8'))
    estimate=layout['geometryEstimate']
    front=.30;rear=-.14
    profile=[(-.605,.791),(-.605,1.025),(-.624,1.025),(-.756,.949),
             (-.756,.857),(-.797,.807),(-.806,.793),(-.797,.791)]
    for label,y in [('Front',front),('Rear',rear)]:
        Plate('Vent_EndWall'+label,[(x,y,z) for x,z in profile],.006,parent=owner,bevel=.0015)
    for label,a,b in [('Back',0,1),('TopMount',1,2),('TopHood',2,3),
                      ('LowerApron',4,5),('ApronBend',5,6),('Foot',6,7),('Base',7,0)]:
        x1,z1=profile[a];x2,z2=profile[b]
        Plate('Vent_'+label,[(x1,rear,z1),(x2,rear,z2),(x2,front,z2),(x1,front,z1)],
              .006,parent=owner,bevel=.0015)
    # Both originals show the upper rear sheet overlapping the forward top
    # sheet. It is a raised lap edge, not an invented fourth through-slot.
    topRear=Vector((profile[2][0],0,profile[2][1]));topFront=Vector((profile[3][0],0,profile[3][1]))
    along=(topFront-topRear).normalized();outward=Vector((along.z,0,-along.x))
    def TopPoint(fraction,y,offset=0):
        point=topRear+(topFront-topRear)*fraction+outward*offset;point.y=y;return point
    end=estimate['lapEndFractionAlongTopSlope'];lapOffset=estimate['lapNormalOffsetM'];sheet=estimate['sheetThicknessM']
    Plate('Vent_TopRearLap',[TopPoint(f,y,lapOffset) for f,y in [(0,rear),(end,rear),(end,front),(0,front)]],
          sheet,parent=owner,bevel=.0007)
    # Four narrow rails enclose three real openings, with a recessed dark back.
    for index,z in enumerate([.943,.9165,.890,.8635]):
        Box('Vent_LouverRail'+str(index),(-.761,.08,z),(.022,.428,.013),parent=owner,bevel=.0015)
    interior=Box('Vent_RecessedInterior',(-.721,.08,.901),(.006,.422,.090),'Dark',owner,.001)
    interior.name='Geometry_VentHousing_Dark'
    for index,y in enumerate([-.075,.225]):
        pin=Vector((-.630,y,1.030))+outward*lapOffset
        Cylinder('Vent_TopCatchPin'+str(index),pin,.010,.055,axis='Y',parent=owner,vertices=24)
        for offset in [-.019,.019]:
            Cylinder('Vent_CatchPinCollar'+str(index),pin+Vector((0,offset,0)),.012,.008,axis='Y',parent=owner,vertices=24)
        strapThickness=estimate['catchStrapThicknessM'];strapOffset=lapOffset+sheet/2+strapThickness/2+estimate['catchClosedGapM']
        root=estimate['catchRootFractionAlongTopSlope'];tip=estimate['catchTipFractionAlongTopSlope']
        Plate('Vent_TopCatchStrap'+str(index),[TopPoint(f,yy,strapOffset)for f,yy in [(root,y-.012),(tip,y-.012),(tip,y+.012),(root,y+.012)]],
              strapThickness,parent=owner,bevel=.001)
        foot=TopPoint(estimate['catchFootBoltFractionAlongTopSlope'],y,strapOffset+strapThickness/2)
        Rivet('Vent_CatchFoot'+str(index),foot,outward,.006,owner)
    owner['ReferenceBasis']='Kubinka 2017 original crop: projecting hood, three slots, flared lower apron and two top catches'
    owner['Unverified']='Photo-estimated local dimensions; hidden internals and catch travel not surveyed'
    owner['TopLapRequired']=True;owner['TopLapLayout']='Data_VentTopLapV37.json'
    owner['TopLapNormal']=tuple(outward);owner['TopLapOffsetM']=lapOffset;owner['TopLapSheetThicknessM']=sheet
    owner['TopLapClosedGapM']=estimate['closedNormalGapM'];owner['TopLapIsFourthThroughSlot']=False
    owner['TopLapProbeBasePointsM']=[value for f,y in [(end-.03,-.07),(end-.03,.22),(end+.03,-.07),(end+.03,.22)]for value in TopPoint(f,y)]
    owner['CatchFootCentersM']=[value for y in [-.075,.225]for value in TopPoint(estimate['catchFootBoltFractionAlongTopSlope'],y,strapOffset+strapThickness/2)]
    owner['CatchStrapOffsetM']=strapOffset;owner['CatchStrapThicknessM']=strapThickness
    return owner


def RearCargoDoor():
    """Selected exterior with an explicitly inferred interior lock."""
    layout=json.loads((OUT/'Data_RearMechanismLayoutV22.json').read_text(encoding='utf-8'))
    rearY=REAR_HULL_Y;centerZ=REAR_DOOR_CENTER_Z;doorY=rearY-.022;axis=Vector((.316,rearY-.038,centerZ))
    fixed=Empty('RearDoorHingeFixed',parent=PARTS['Hull'])
    fixed['ReferenceScope']='Two vertical hinges corroborated by supplementary vehicles; selected rear hidden; exact section, stations and backing inferred'
    frame=RoundedPlate('Rear_DoorFrame',(0,0,0),.62,REAR_DOOR_HEIGHT+.015,.011,.060,parent=fixed)
    frame.location=(0,rearY-.0055,centerZ);frame.rotation_euler.x=math.pi/2
    CutBox(frame,(0,rearY-.01,centerZ),(.54,.30,REAR_DOOR_HEIGHT-.06),.035)
    gap=RoundedPlate('Rear_DoorGap',(0,0,0),.62,REAR_DOOR_HEIGHT+.015,.0037,.060,role='Dark')
    gap.location=(0,rearY-.01285,centerZ);gap.rotation_euler.x=math.pi/2
    CutBox(gap,(0,rearY-.01,centerZ),(.54,.30,REAR_DOOR_HEIGHT-.06),.035)
    door=Empty('Hatch_RearCargo',axis,PARTS['Hull']);PARTS['RearDoor']=door
    door['TargetHingeM']=tuple(axis);door['HingeAxisLocal']='Z';door['OpenSignLocal']=1
    door['HingeContactExclusionM']=0.;door['FixedHingeOwner']='RearDoorHingeFixed';door['ClosedSealGapM']=.0003
    door['DoorCenterBeforeGroundM']=(0,doorY,centerZ);door['DoorSizeM']=(.60,REAR_DOOR_HEIGHT,.014)
    door['LatchTurnerName']='RearDoorLatchTurner';door['LatchReleaseFraction']=layout['latchReleaseFraction']
    door['ReferenceScope']='Shared rear door hinge/handle type; Kubinka hidden dimensions, internal backing and release travel inferred'
    cover=RoundedPlate('Rear_CargoDoor',(0,0,0),.60,REAR_DOOR_HEIGHT,.014,.055,parent=door)
    cover.location=Vector((0,doorY,centerZ))-axis;cover.rotation_euler.x=math.pi/2
    contacts=[];pinCenters=[]
    for index,offsetZ in enumerate(layout['hingeOffsetsZFromDoorCenterM']):
        pin=Vector((axis.x,axis.y,centerZ+offsetZ));pinCenters.extend(pin)
        Cylinder('Rear_DoorHingePin'+str(index),pin,.0045,.085,axis='Z',parent=fixed,vertices=32)
        Box('Rear_DoorFixedFoot'+str(index),(.350,rearY-.002,pin.z),(.024,.004,.072),parent=fixed,bevel=0)
        for x in [.338,.362]:
            for z in [pin.z-.036,pin.z+.036]:contacts.extend((x,rearY,z))
        webInner=pin+Vector((.0085,.0085,0));webOuter=Vector((.350,rearY-.0048,pin.z))
        webNormal=Vector((webOuter.y-webInner.y,-(webOuter.x-webInner.x),0)).normalized()
        Plate('Rear_DoorFixedLeafWeb'+str(index),[webInner+Vector((0,0,-.032)),webOuter+Vector((0,0,-.032)),
              webOuter+Vector((0,0,.032)),webInner+Vector((0,0,.032))],.004,parent=fixed,bevel=.0005)
        for offset in [-.027,.027]:
            center=pin+Vector((0,0,offset))
            Lathe('Rear_DoorFixedEye'+str(index),[(.0049,-.007),(.0105,-.007),(.0105,.007),(.0049,.007),(.0049,-.007)],center,parent=fixed,segments=32)
            outer=Vector((.350,rearY-.0048,center.z));inner=center+Vector((.005,.004,0))
            Plate('Rear_DoorFixedLeaf'+str(index),[inner+Vector((0,0,-.006)),outer+Vector((0,0,-.008)),
                  outer+Vector((0,0,.008)),inner+Vector((0,0,.006))],.003,parent=fixed,bevel=.0005)
            boltBase=webOuter.lerp(webInner,.22)+Vector((0,0,offset))
            Rivet('Rear_DoorFixedLeafBolt'+str(index),boltBase+webNormal*.003,webNormal,.0045,fixed)
        Lathe('Rear_DoorMovingEye'+str(index),[(.0049,-.012),(.0105,-.012),(.0105,.012),(.0049,.012),(.0049,-.012)],pin-axis,parent=door,segments=32)
        inner=pin+Vector((-.004,.004,0));outer=Vector((.278,doorY-.0083,pin.z))
        Plate('Rear_DoorMovingLeaf'+str(index),[inner+Vector((0,0,-.009))-axis,outer+Vector((0,0,-.012))-axis,
              outer+Vector((0,0,.012))-axis,inner+Vector((0,0,.009))-axis],.003,parent=door,bevel=.0005)
        normal=Vector((-(outer.y-inner.y),outer.x-inner.x,0)).normalized()
        if normal.y>0:normal=-normal
        Rivet('Rear_DoorMovingLeafBolt'+str(index),inner.lerp(outer,.75)+normal*.0025-axis,normal,.005,door)
    fixed['FootContactPointsBeforeGroundM']=contacts;fixed['PinCentersBeforeGroundM']=pinCenters
    faceLayout=json.loads((OUT/'Data_RearDoorFaceLayoutV29.json').read_text(encoding='utf-8'))
    faceSpec=importlib.util.spec_from_file_location('Type94RearDoor',ROOT/'Taierzhuang1938/_blender/Script_Type94RearDoor.py')
    face=importlib.util.module_from_spec(faceSpec);faceSpec.loader.exec_module(face)
    keeper=face.BuildRearDoorFace(globals(),cover,door,axis,rearY,doorY,centerZ,REAR_DOOR_HEIGHT,faceLayout)
    rearArmor.PoseRearArmorInterface(PARTS['Hull'],fixed,door,keeper,gap,REAR_ARMOR_LAYOUT)


def RearAndVents():
    # The high chamfered box behind the Kubinka vehicle is a separate trailer.
    # Its silhouette must not be merged into the tankette's rear hull.
    VentHousing()
    # Visible fittings belong to the main hull side plates.
    for side in [-1,1]:
        for y in [-.81,REAR_HULL_Y+.05]:
            Box('Rear_LatchBase',(side*.599,y,1.014),(.012,.045,.05),bevel=.002)
            Rod('Rear_LatchToggle',(side*.613,y,1.018),(side*.613,y,1.067),.006)
        # Thin lifting loops, pipe fittings follow the two visible side plates.
        Cylinder('Rear_SideHandleMount',(side*.607,-.65,1.035),.022,.017,axis='X',vertices=24)
        points=[]
        for index in range(17):
            angle=index*math.pi/32
            points.append((side*.621,-.65-.34*math.sin(angle),.919+.116*math.cos(angle)))
        CurveTube('Rear_SideHandleArc',points,.009)
        Lathe('Rear_SideHandleEye',[(.010,-.0045),(.019,-.0045),(.019,.0045),(.010,.0045),(.010,-.0045)],
              (side*.621,-.99,.900),'X',segments=24)
    RearCargoDoor()
    Box('Rear_TowCrossmember',(0,-1.47-REAR_FRAME_EXTENSION_M,.405),(.88,.055,.045),bevel=.003)
    for side in [-1,1]:
        Rod('Rear_TowSupport',(side*.41,-1.1,.4),(side*.41,-1.48-REAR_FRAME_EXTENSION_M,.405),.02)
    coupling=Box('Rear_TrailerCoupling',(0,-1.505-REAR_FRAME_EXTENSION_M,.415),(.12,.07,.045),bevel=.006)
    coupling['ReferenceScope']='Rear drawbar extension inferred to retain the early nominal envelope; hidden by the separate trailer in the primary photo'
    Cylinder('Rear_TrailerPin',(0,-1.505-REAR_FRAME_EXTENSION_M,.45),.013,.07,'Steel',vertices=16)


def RoadWheelMetal(name,radius,side,pivot):
    """Six cast ribs and a wide dished bead, following visible wheel sections.

    Rib widths and dish depths are image-derived estimates; the authoritative
    nominal outer wheel diameter is kept unchanged by this face refinement.
    """
    outer=radius-.023;inner=outer-.024
    Lathe(name+'_Rim',[(inner,-.033),(outer-.012,-.047),(outer-.0025,-.047),(outer,-.042),
                      (outer,.042),(outer-.0025,.047),(outer-.012,.047),(inner,.033),(inner,-.033)],
          (0,0,0),'X',parent=pivot)
    Lathe(name+'_Dish',[(.057,side*.052),(.070,side*.047),(.080,side*.038),(.080,side*.026),
                       (.066,side*.038),(.057,side*.052)],(0,0,0),'X',parent=pivot)
    for j in range(6):
        angle=j*math.tau/6
        radial=Vector((math.cos(angle),math.sin(angle)))
        tangent=Vector((-radial.y,radial.x))
        points=[]
        for r,width,halfDepth in [(.055,.026,.042),(.078,.018,.032),(.121,.018,.032),(.148,.028,.042)]:
            if LOWER_LAYOUT:r=.055+(r-.055)*(radius-.023-.055)/(.1905-.023-.055)
            for x,sign in [(-halfDepth,-1),(-halfDepth,1),(halfDepth,1),(halfDepth,-1)]:
                yz=radial*r+tangent*(sign*width*.5)
                points.append((x,yz.x,yz.y))
        faces=[(3,2,1,0),(12,13,14,15)]
        for segment in range(3):
            faces.extend([(segment*4+i,segment*4+(i+1)%4,(segment+1)*4+(i+1)%4,(segment+1)*4+i) for i in range(4)])
        Mesh(name+'_CastRib'+str(j),points,faces,parent=pivot,bevel=.002)


def OpenWheelWebs(name,radius,pivot):
    """Eight narrow cast ribs; retain the original rim and shaft dimensions."""
    if LOWER_LAYOUT and name.endswith('_Drive'):
        script=ROOT/'Taierzhuang1938/_blender/Script_Type94RunningAssembly.py'
        spec=importlib.util.spec_from_file_location('Type94DriveWeb',script)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        module.BuildDriveWeb(name,pivot,globals(),LOWER_LAYOUT)
        return
    outer=radius-.019
    for index in range(8):
        angle=index*math.tau/8;radial=Vector((math.cos(angle),math.sin(angle)))
        tangent=Vector((-radial.y,radial.x));points=[]
        for r,width,halfDepth in [(.056,.036,.029),(.087,.025,.025),
                                   (outer-.023,.025,.025),(outer,.040,.029)]:
            for x,sign in [(-halfDepth,-1),(-halfDepth,1),(halfDepth,1),(halfDepth,-1)]:
                yz=radial*r+tangent*(sign*width*.5);points.append((x,yz.x,yz.y))
        faces=[(3,2,1,0),(12,13,14,15)]
        for segment in range(3):
            faces.extend([(segment*4+i,segment*4+(i+1)%4,(segment+1)*4+(i+1)%4,(segment+1)*4+i) for i in range(4)])
        Mesh(name+'_CastRib'+str(index),points,faces,parent=pivot,bevel=.002)


def Wheel(name, center, radius, side, kind='Road'):
    pivot=Empty(name,center,PARTS['Hull'])
    PARTS[name]=pivot
    depth=.105 if kind=='Road' else .115
    n=SEGMENTS
    # Rubber annulus, dished steel rims, open spokes and a domed hub.
    if kind=='Road':
        Lathe(name+'_Tyre',[(radius-.025,-depth/2),(radius-.008,-depth/2),(radius,-depth*.35),(radius,depth*.35),(radius-.008,depth/2),(radius-.025,depth/2)],(0,0,0),'X','Rubber',pivot)
        RoadWheelMetal(name,radius,side,pivot)
    else:
        r=radius-.012
        Lathe(name+'_Rim',[(r-.024,-.049),(r,-.049),(r,.049),(r-.024,.049),(r-.024,-.049)],(0,0,0),'X','Paint',pivot)
        if kind=='Return':
            Cylinder(name+'_Disc',(0,0,0),radius-.019,.07,parent=pivot,axis='X')
            Lathe(name+'_Tyre',[(radius-.012,-.040),(radius-.003,-.040),(radius,-.028),(radius,.028),(radius-.003,.040),(radius-.012,.040),(radius-.012,-.040)],(0,0,0),'X','Rubber',pivot)
        else:
            OpenWheelWebs(name,radius,pivot)
        if kind=='Drive':
            axialScale=TRACK_WIDTH_M/.20
            for j in range(22):
                a=j*math.tau/22
                for x in [-.031*axialScale,.031*axialScale]:
                    tooth=Box(name+'_Tooth',(0,0,0),(.016*axialScale,.028,.032),'Steel',pivot,.002)
                    tooth.rotation_euler.x=a-math.pi/2
                    tooth.location=(x,r*math.cos(a),r*math.sin(a))
    radialScale=.5 if kind=='Return' else 1
    axialScale=.6 if kind=='Return' else 1
    Lathe(name+'_Hub',[(r*radialScale,d*axialScale) for r,d in [(0,-.065),(.049,-.065),(.06,-.041),(.06,.041),(.049,.065),(0,.065)]],(0,0,0),'X',parent=pivot)
    for j in range(6):
        a=j*math.tau/6
        bolt=Rivet(name+'_HubBolt',(side*.069*axialScale,.037*radialScale*math.cos(a),.037*radialScale*math.sin(a)),(side,0,0),.0045*radialScale,pivot)
        bolt.scale.z=axialScale
    pivot['WheelRadiusM']=radius
    pivot['SpinAxis']='X'
    return pivot


def RunningGear():
    if LOWER_LAYOUT:
        script=ROOT/'Taierzhuang1938/_blender/Script_Type94RunningAssembly.py'
        spec=importlib.util.spec_from_file_location('Type94RunningAssembly',script)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        module.BuildAssembly(globals(),LOWER_LAYOUT)
        return
    if RUNNING_GEAR_LAYOUT:
        PARTS['Hull']['RunningGearLayout']=runningGearFile
        PARTS['Hull']['RunningGearDimensionsInferred']=True
        PARTS['Hull']['RunningGearWholeReferenceAccepted']=False
        PARTS['Hull']['RoadWheelForwardM']=ROAD_FORWARD_M
        PARTS['Hull']['BogiePivotForwardHeightM']=[v for y,z,_,_ in BOGIE_LAYOUT for v in [y,z]]
    for side,label in [(-1,'Left'),(1,'Right')]:
        x=side*TRACK_CENTER_X
        for i,y in enumerate(ROAD_FORWARD_M):
            Wheel('Wheel_'+label+'_Road'+str(i),(x,y,.215),.1905,side)
        Wheel('Wheel_'+label+'_Drive',(x,DRIVE_CENTER_Y,DRIVE_CENTER_Z),.2667,side,'Drive')
        Wheel('Wheel_'+label+'_Idler',(x,-1.22,.49),.1905,side,'Idler')
        for i,y in enumerate([.35,-.69]):
            Wheel('Wheel_'+label+'_Return'+str(i),(x,y,.601),.066,side,'Return')
        # Hara bell-crank pairs and long armored horizontal spring housing.
        for i,(y,pivotZ,roadIndices,springEnd) in enumerate(BOGIE_LAYOUT):
            roads=[ROAD_FORWARD_M[index] for index in roadIndices]
            p=(side*.753,y,pivotZ)
            Cylinder('Suspension_'+label+'_Bellcrank'+str(i),p,.057,.075,axis='X',vertices=24)
            for wy in roads:
                Rod('Suspension_'+label+'_Arm',(side*.76,y,pivotZ),(side*.762,wy,.215),.022,segments=12)
                Cylinder('Suspension_'+label+'_WheelJournal',(side*.766,wy,.215),.031,.032,axis='X',vertices=20)
                direction=Vector((wy-y,.215-pivotZ)).normalized()
                perpendicular=Vector((-direction.y,direction.x))*.025
                a=Vector((y,pivotZ));b=Vector((wy,.215))
                outline=[a+perpendicular,b+perpendicular,b-perpendicular,a-perpendicular]
                Plate('Suspension_'+label+'_CastArmFace',[(side*.789,q.x,q.y) for q in outline],.017,bevel=.004)
            Rod('Suspension_'+label+'_UpperCrank',(side*.758,y,pivotZ),(side*.754,springEnd,.493),.019)
        Cylinder('Suspension_'+label+'_SpringHousing',(side*.754,-.095,.493),.043,.85,axis='Y',vertices=24)
        for y in [-.54,.35]:
            Cylinder('Suspension_'+label+'_SpringCap',(side*.754,y,.493),.060,.035,axis='Y',vertices=24)
        # Idler tension arm and adjuster, no large late ground-contact wheel.
        Rod('Suspension_'+label+'_IdlerArm',(side*.75,-1.04,.56),(side*.75,-1.22,.49),.019)
        Rod('Suspension_'+label+'_TensionScrew',(side*.75,-.91,.56),(side*.75,-1.18,.56),.012,'Steel')


def ConvexHull(points):
    points=sorted(set(points))
    def Cross(o,a,b):
        return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    lower=[]
    for p in points:
        while len(lower)>=2 and Cross(lower[-2],lower[-1],p)<=0:
            lower.pop()
        lower.append(p)
    upper=[]
    for p in reversed(points):
        while len(upper)>=2 and Cross(upper[-2],upper[-1],p)<=0:
            upper.pop()
        upper.append(p)
    return lower[:-1]+upper[:-1]


TRACK_PATH_SOLUTION = None


def TrackHull(drivePitchRadius):
    if LOWER_LAYOUT:
        script=ROOT/'Taierzhuang1938/_blender/Script_Type94RunningAssembly.py'
        spec=importlib.util.spec_from_file_location('Type94RunningPath',script)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        return module.TrackHull(drivePitchRadius,LOWER_LAYOUT,ConvexHull)
    circles=[(DRIVE_CENTER_Y,DRIVE_CENTER_Z,drivePitchRadius),(-1.22,.49,.197),(ROAD_FORWARD_M[0],.215,.197),(ROAD_FORWARD_M[-1],.215,.197),(.35,.601,.0725),(-.69,.601,.0725)]
    points=[]
    for y,z,r in circles:
        for i in range(160):
            a=i*math.tau/160
            points.append((y+r*math.cos(a),z+r*math.sin(a)))
    hull=ConvexHull(points)
    frontTop=(DRIVE_CENTER_Y,DRIVE_CENTER_Z+drivePitchRadius)
    rearTop=(-1.22,.687)
    frontIndex=min(range(len(hull)),key=lambda i:(hull[i][0]-frontTop[0])**2+(hull[i][1]-frontTop[1])**2)
    rearIndex=min(range(len(hull)),key=lambda i:(hull[i][0]-rearTop[0])**2+(hull[i][1]-rearTop[1])**2)
    assert frontIndex<rearIndex,'Unexpected authored path winding'
    anchors=[frontTop,(.35,.6735),(-.69,.6735),rearTop]
    guided=[]
    for segment,(a,b) in enumerate(zip(anchors,anchors[1:])):
        sag=.012 if segment==1 else .003
        for step in range(32):
            t=step/32;blend=t*t*(3-2*t)
            guided.append((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*blend-sag*math.sin(math.pi*t)**2))
    guided.append(rearTop)
    hull=hull[:frontIndex]+guided+hull[rearIndex+1:]
    distances=[0]
    for i in range(len(hull)):
        distances.append(distances[-1]+(Vector(hull[(i+1)%len(hull)])-Vector(hull[i])).length)
    return hull,distances


def TrackPath():
    global TRACK_PATH_SOLUTION
    if LOWER_LAYOUT:
        script=ROOT/'Taierzhuang1938/_blender/Script_Type94RunningAssembly.py'
        spec=importlib.util.spec_from_file_location('Type94RunningSolve',script)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        hull,distances,TRACK_PATH_SOLUTION=module.SolvePath(LOWER_LAYOUT,ConvexHull)
        return hull,distances
    drivePitchRadius=22*.0762/math.tau
    if not RUNNING_GEAR_LAYOUT:
        # Preserve the verified legacy generation exactly.
        for iteration in range(12):
            hull,distances=TrackHull(drivePitchRadius)
            count=round(distances[-1]/.0762)
            corrected=22*(distances[-1]/count)/math.tau
            if abs(corrected-drivePitchRadius)<1e-9:break
            drivePitchRadius=corrected
        return hull,distances
    # Lock each discrete count while solving its continuous pitch radius.
    # Re-rounding during the iteration can alternate between N and N+1.
    _,initialDistances=TrackHull(drivePitchRadius)
    approximate=round(initialDistances[-1]/.0762);solutions=[]
    for count in [approximate-1,approximate,approximate+1]:
        radius=drivePitchRadius
        for iteration in range(64):
            hull,distances=TrackHull(radius)
            corrected=22*(distances[-1]/count)/math.tau
            error=abs(corrected-radius)
            if error<1e-9:break
            radius=corrected
        else:raise RuntimeError('Track count/radius solution did not converge')
        pitch=distances[-1]/count
        solutions.append((abs(pitch-.0762),count,hull,distances,dict(linkCount=count,iterations=iteration+1,pitchM=pitch,drivePitchRadiusM=corrected,radiusResidualM=error)))
    chosen=min(solutions,key=lambda row:row[0])
    TRACK_PATH_SOLUTION=dict(method='Fixed integer counts solved independently; choose closest nominal3in pitch',linkCount=chosen[1],lengthM=chosen[3][-1],candidates=[row[4]for row in solutions])
    return chosen[2],chosen[3]


def TrackLinkCount(distances):
    if RUNNING_GEAR_LAYOUT or LOWER_LAYOUT:
        assert TRACK_PATH_SOLUTION and abs(TRACK_PATH_SOLUTION['lengthM']-distances[-1])<1e-8
        return TRACK_PATH_SOLUTION['linkCount']
    return round(distances[-1]/.0762)


def PathSample(path,distances,s):
    from bisect import bisect_right
    s=s%distances[-1]
    i=min(bisect_right(distances,s)-1,len(path)-1)
    a,b=Vector(path[i]),Vector(path[(i+1)%len(path)])
    t=(s-distances[i])/(distances[i+1]-distances[i])
    p=a.lerp(b,t)
    tangent=(b-a).normalized()
    # A CCW YZ hull has its outward normal to the right of the tangent.
    angle=math.atan2(tangent.y,tangent.x)
    return p,angle


def BuildLegacyTrackShoe(pitch,templateParent):
    pieces=[]
    for x in [-.063,.063]:
        pieces.append(Box('Track_ShoeSide',(x,0,0),(.043,pitch-.009,.012),'Track',templateParent,.002))
    for y in [-(pitch-.02)/2,(pitch-.02)/2]:
        pieces.append(Box('Track_ShoeRail',(0,y,0),(.184,.013,.014),'Track',templateParent,.0015))
    pieces.append(Box('Track_CenterWeb',(0,0,-.002),(.041,.048,.012),'Track',templateParent,.001))
    pieces.append(Box('Track_Grouser',(0,0,.009),(.191,.012,.010),'Track',templateParent,.001))
    pieces.append(Cylinder('Track_HingePin',(0,pitch/2-.005,-.002),.0085,.20,'Track','X',templateParent,12 if QUALITY=='High' else 8))
    # Center guide horn points toward the inside of the track loop.
    for x in [-.076,.076]:
        vertices=[(x-.006,-.016,-.005),(x+.006,-.016,-.005),(x+.006,.016,-.005),(x-.006,.016,-.005),(x-.003,-.009,-.039),(x+.003,-.009,-.039),(x+.003,.009,-.039),(x-.003,.009,-.039)]
        pieces.append(Mesh('Track_OuterGuideHorn',vertices,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'Track',templateParent,.001))
    return pieces


def Tracks():
    path,distances=TrackPath()
    count=TrackLinkCount(distances)
    pitch=distances[-1]/count
    PARTS['TrackPath']={'points':[list(p) for p in path],'distances':distances,'lengthM':distances[-1],'linkCount':count,'pitchM':pitch,
                       'sprocketTeeth':22,'drivePitchRadiusM':22*pitch/math.tau,'idlerWrapRadiusM':.197,'returnWrapRadiusM':.0725}
    if LOWER_LAYOUT:
        PARTS['TrackPath'].update(sprocketTeeth=LOWER_LAYOUT['sprocketTeeth'],drivePitchRadiusM=LOWER_LAYOUT['sprocketTeeth']*pitch/math.tau,
            idlerWrapRadiusM=LOWER_LAYOUT['idlerRadiusM']+LOWER_LAYOUT['beltCentreOffsetM'],
            returnWrapRadiusM=LOWER_LAYOUT['returnRadiusM']+LOWER_LAYOUT['beltCentreOffsetM'])
    if TRACK_PATH_SOLUTION:PARTS['TrackPath']['solver']=TRACK_PATH_SOLUTION
    templateParent=Empty('TrackTemplate',parent=PARTS['Root'])
    if TRACK_SHOE_LAYOUT:
        shoeModulePath=ROOT/'Taierzhuang1938/_blender/Script_Type94TrackShoe.py'
        spec=importlib.util.spec_from_file_location('Type94CastShoe',shoeModulePath)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        pieces=module.BuildCastShoe(pitch,templateParent,globals(),TRACK_SHOE_LAYOUT)
    else:pieces=BuildLegacyTrackShoe(pitch,templateParent)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in pieces:
        bpy.context.view_layer.objects.active=obj
        obj.select_set(True)
        for mod in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.objects.active=pieces[0]
    bpy.ops.object.join()
    template=pieces[0]
    template.name='TrackShoeTemplate'
    data=template.data
    data.name='Mesh_ArticulatedTrackShoe'
    # The provisional specification gives164mmtrackwidth. This retained model
    # uses it as an overall authored envelope; museum pin/plate width identity
    # remains unresolved. Legacy axial scaling leaves pitch/wrap unchanged.
    if not TRACK_SHOE_LAYOUT:
        for vertex in data.vertices:vertex.co.x*=TRACK_WIDTH_M/.20
    data.update()
    for side,label in [(-1,'Left'),(1,'Right')]:
        control=Empty('Track_'+label,parent=PARTS['Root'])
        control['LinkCount']=count
        control['PitchM']=pitch
        control['LoopLengthM']=distances[-1]
        control['TrackWidthM']=TRACK_WIDTH_M
        control['TrackCenterXM']=side*TRACK_CENTER_X
        if TRACK_SHOE_LAYOUT:
            control['TrackShoeLayout']=trackShoeFile
            control['TrackShoeDimensionsInferred']=True
        for i in range(count):
            obj=bpy.data.objects.new('TrackLink_'+label+'_'+str(i).zfill(3),data)
            bpy.context.collection.objects.link(obj)
            obj.parent=control
            obj['TrackIndex']=i
            obj['SurfaceRole']='Track'
            p,a=PathSample(path,distances,i*pitch)
            obj.location=(side*TRACK_CENTER_X,p.x,p.y)
            # Local +Y tangent, local +Z outward, X width.
            obj.rotation_euler.x=a+math.pi
    bpy.data.objects.remove(template,do_unlink=True)
    bpy.data.objects.remove(templateParent,do_unlink=True)


def ApplyModifiersAndUv(objects=None):
    visited=set()
    for obj in list(bpy.data.objects if objects is None else objects):
        if obj.type=='CURVE':
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active=obj
            bpy.ops.object.convert(target='MESH')
        if obj.type!='MESH':
            continue
        bpy.context.view_layer.objects.active=obj
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        if obj.data.as_pointer() in visited:
            continue
        visited.add(obj.data.as_pointer())
        bm=bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
        bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-7)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
        if 'WearZone' not in obj.data.attributes:
            wear=obj.data.attributes.new('WearZone','FLOAT','FACE')
            zone=.95 if any(token in obj.name for token in ['Hinge','Latch','Tow','Handle']) else (.60 if 'Rivet' in obj.name else (.45 if any(token in obj.name for token in ['Hatch','Fender','Cover']) else .08))
            if obj.name.startswith('Vent_'):
                zone=.85 if 'Catch' in obj.name else .45
            elif obj.name.startswith('FinalDrive_'):
                zone=.60 if 'JointBolt' in obj.name else .30
            elif obj.name.startswith('Wheel_') and '_CastRib' in obj.name:
                zone=.40
            elif '_Road' in obj.name and any(token in obj.name for token in ['_Rim','_Dish','_CastRib']):
                zone=.55 if '_Rim' in obj.name else .40
            for value in wear.data:value.value=zone
        if not obj.data.uv_layers:
            uv=obj.data.uv_layers.new(name='UVMap')
            # Deterministic face-local UVs; replaced by surface authoring stage.
            for polygon in obj.data.polygons:
                coords=[obj.data.vertices[v].co for v in polygon.vertices]
                normal=polygon.normal
                drop=max(range(3),key=lambda k:abs(normal[k]))
                axes=[k for k in range(3) if k!=drop]
                minimum=[min(p[k] for p in coords) for k in axes]
                span=[max(p[k] for p in coords)-minimum[j] for j,k in enumerate(axes)]
                for li,point in zip(polygon.loop_indices,coords):
                    uv.data[li].uv=[(point[k]-minimum[j])/max(span[j],.0001) for j,k in enumerate(axes)]
    bpy.ops.object.select_all(action='DESELECT')


def JoinStaticDetails(parentNames=None):
    # Merge only static siblings with their role. Motion nodes remain independent.
    groups={}
    for obj in list(bpy.data.objects):
        if obj.type!='MESH' or obj.name.startswith('TrackLink_'):
            continue
        key=(obj.parent.name if obj.parent else '',obj.get('SurfaceRole','Paint'))
        if parentNames is not None and key[0] not in parentNames:continue
        groups.setdefault(key,[]).append(obj)
    for (parentName,role),objects in groups.items():
        if len(objects)<2:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join()
        objects[0].name='Geometry_'+parentName+'_'+role


def Studio():
    scene=bpy.context.scene
    scene.render.engine='CYCLES'
    scene.cycles.samples=32
    scene.cycles.use_denoising=True
    scene.render.resolution_x=1280
    scene.render.resolution_y=853
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.render.film_transparent=True
    scene.view_settings.view_transform='AgX'
    world=bpy.data.worlds.new('World_Type94Studio')
    world.use_nodes=True
    world.node_tree.nodes['Background'].inputs['Color'].default_value=(.65,.70,.78,1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
    scene.world=world
    for name,loc,energy,size in [('Key',(-3,4,6),900,4),('Fill',(4,1,3),350,3),('Rim',(0,-4,4),600,3)]:
        data=bpy.data.lights.new('Light_'+name,'AREA')
        data.energy=energy
        data.shape='DISK'
        data.size=size
        obj=bpy.data.objects.new('Light_'+name,data)
        bpy.context.collection.objects.link(obj)
        obj.location=loc
        obj.rotation_euler=(Vector((0,0,.75))-obj.location).to_track_quat('-Z','Y').to_euler()
    specs=[('Reference',(-2.7,3.7,2.22),(0,0,.82),44,None),
           ('Side',(-5,0,.81),(0,0,.81),50,3.65),
           ('Front',(0,5,.82),(0,0,.82),50,2.15),
           ('Rear',(-2.8,-4,2.3),(0,0,.78),48,None)]
    for name,loc,target,lens,ortho in specs:
        data=bpy.data.cameras.new('Camera_'+name)
        data.lens=lens
        if ortho:
            data.type='ORTHO'
            data.ortho_scale=ortho
        obj=bpy.data.objects.new('Camera_'+name,data)
        bpy.context.collection.objects.link(obj)
        obj.location=loc
        obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    scene.camera=bpy.data.objects['Camera_Reference']
    fitPath=SOURCE/'Acceptance/Data_CameraFit.json'
    if fitPath.exists():
        fit=json.loads(fitPath.read_text(encoding='utf-8'))
        camera=scene.camera
        camera.location=fit['positionBlender']
        camera.rotation_euler=(Vector(fit['targetBlender'])-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.lens=fit['lensMm']
        camera.data.shift_x=fit['shiftX']
        camera.data.shift_y=fit['shiftY']
    scene.frame_start=1
    scene.frame_end=120
    scene.render.fps=30


def SaveAndExport():
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    meshes=[obj for obj in bpy.data.objects if obj.type=='MESH']
    triangles=sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in meshes)
    points=[obj.matrix_world@v.co for obj in meshes for v in obj.data.vertices]
    PARTS['Root'].location.z=-min((o.matrix_world@v.co).z for o in meshes for v in o.data.vertices)
    bpy.context.view_layer.update()
    points=[obj.matrix_world@v.co for obj in meshes for v in obj.data.vertices]
    bounds=[[min(p[k] for p in points) for k in range(3)],[max(p[k] for p in points) for k in range(3)]]
    manifest={'id':'Type94Tankette','revision':REVISION,'quality':QUALITY,'triangles':triangles,'meshNodes':len(meshes),
              'blenderBoundsM':bounds,'front':'+Y','up':'+Z','units':'metres','path':PARTS['TrackPath'],
              'acceptance':'Pending actual reference, surface and reimport inspection'}
    (SOURCE / 'Acceptance' / ('Data_'+REVISION+QUALITY+'.json')).write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    scenePath=SOURCE / ('Scene_Type94Tankette'+QUALITY+REVISION+'.blend')
    bpy.ops.wm.save_as_mainfile(filepath=str(scenePath))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.data.objects:
        if obj.type not in ['CAMERA','LIGHT']:
            obj.select_set(True)
    export=OUT / ('Model_Type94Tankette'+('High' if QUALITY=='High' else '')+'.glb')
    if QUALITY=='High':
        export=SOURCE / 'Exports' / export.name
        if RUNNING_GEAR_LAYOUT or TRACK_SHOE_LAYOUT or TURRET_LAYOUT or BODY_LAYOUT:export=export.with_name('Model_Type94TanketteHigh'+REVISION+'.glb')
        export.parent.mkdir(exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(export),export_format='GLB',use_selection=True,export_yup=True,
                              export_apply=False,export_animations=False,export_extras=True)
    print(json.dumps({'source':str(scenePath),'export':str(export),'triangles':triangles,'meshNodes':len(meshes),'bounds':bounds},indent=2))


def Main():
    Reset()
    Hull()
    Driver()
    Turret()
    RearAndVents()
    RunningGear()
    Tracks()
    ApplyModifiersAndUv()
    JoinStaticDetails()
    import importlib.util
    articulationSpec=importlib.util.spec_from_file_location('Type94Articulation',ROOT/'Taierzhuang1938/_blender/Script_Type94Articulation.py')
    articulation=importlib.util.module_from_spec(articulationSpec);articulationSpec.loader.exec_module(articulation);articulation.CorrectArticulation()
    detailSpec=importlib.util.spec_from_file_location('Type94DetailCorrect',ROOT/'Taierzhuang1938/_blender/Script_Type94DetailCorrect.py')
    detail=importlib.util.module_from_spec(detailSpec);detailSpec.loader.exec_module(detail);detail.CorrectDetails()
    CorrectEngineHinge()
    Studio()
    SaveAndExport()


if globals().get('__name__') in (None, '__main__'):
    Main()
