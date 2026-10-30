"""Isuzu Type 94 6x4 cargo truck. Run through Script_BlenderMcp.mjs exec.

Authoring: metres, Blender +Y nose / +Z up -> glTF -Z nose / +Y up.
1936 factory manual: 5.400m length, 1.900m width, 2.250m cab height,
2.800m front-to-first-rear axle, 1.100m rear axle spacing, 1.500/1.450m tracks.
The closed front-quarter period photo is the current primary appearance reference.
The production photograph remains a secondary assembly/proportion comparison.
The museum vehicle is a four-wheel postwar conversion and supplies no axle data.
"""
import bpy, math, json, os, random, importlib.util
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion

WORKSPACE = Path(os.environ['ISUZU_WORKSPACE']).resolve() if os.environ.get('ISUZU_WORKSPACE') else (Path(__file__).resolve().parents[2] if '__file__' in globals() else Path(bpy.context.scene.get('IsuzuWorkspace', os.getcwd())))
if not (WORKSPACE/'Taierzhuang1938/_blender/Script_IsuzuType94TruckBuild.py').is_file():raise RuntimeError('Invalid explicit Isuzu authoring workspace: '+str(WORKSPACE))
wheelLodSpec=importlib.util.spec_from_file_location('IsuzuWheelLod',str(WORKSPACE/'Taierzhuang1938/_blender/Script_IsuzuType94TruckWheelLod.py'));wheelLod=importlib.util.module_from_spec(wheelLodSpec);wheelLodSpec.loader.exec_module(wheelLod)
SOURCE = Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/IsuzuType94Truck')
OUT = WORKSPACE / 'Taierzhuang1938/Model/IsuzuType94Truck'
QA = WORKSPACE / 'tmp/IsuzuType94Truck'
for directory in (SOURCE,OUT,QA): directory.mkdir(parents=True,exist_ok=True)
random.seed(94)
PI = math.pi
MODEL_REVISION = '20261030LocalizedMetalWearV80Candidate'
ROAD_WHEEL_LUG_PHASE_DEG = 22.5
ROAD_WHEEL_NUT_SEAT_PROFILE = ((.150,.090),(.150,.137),(.110,.141),(.095,.126))
WHEEL_VENT_PITCH_RADIUS_M = .218
WHEEL_VENT_RADIAL_SEMIAXIS_M = .0235
WHEEL_VENT_TANGENTIAL_SEMIAXIS_M = .0355
WHEEL_HUB_CAP_CORNER_RADIUS_M = .056
WHEEL_HUB_CAP_PHASE_DEG = 30.0
MIRROR_HEAD_DROP_M = .040
MIRROR_STALK_RADIUS_M = .008
MIRROR_FAR_YAW_DEG = 32.0
MIRROR_NEAR_HEAD_INSET_M = .040
CANVAS_TEXTURE_TILE_M = .04
CANVAS_MACRO_TEXTURE_TILE_M = 2.5
CANVAS_WRAP_CENTRE_Z_M = 1.9
CANVAS_WRAP_RADIUS_M = .82
PRIMARY_CANVAS_FORE_EXTRA_M = .070
PRIMARY_CANVAS_REAR_EXTRA_M = .200
PRIMARY_CANVAS_HEM_LIFT_M = (.050,.030)
PRIMARY_CANVAS_HEADER_FOLDS_M = ((.75,-.18,-.025,.050),(.66,-.03,-.018,.045),(.42,-.25,-.016,.060))
PRIMARY_CAMERA_LOCATION = (3.4544020392720944, 7.5249575579067205, .1835406937489481)
PRIMARY_CAMERA_TARGET = (1.1841114766847056, .02894883718095631, 1.8131523101256621)
PRIMARY_CAMERA_LENS_MM = 60.282808321893924
PRIMARY_CAMERA_ROLL_DEG = .7515795712757953
PRIMARY_CAMERA_PRINCIPAL_PX = (117.81971576462536, 99.35291160468394)
PRIMARY_REFERENCE_STEER_INNER_DEG = 12.0
PRIMARY_CAB_SIDE_RELIEF_M = .085
PRIMARY_CAB_CAMBER_RELIEF_M = .040
PRIMARY_CAB_FRONT_LIFT_M = .020
PRIMARY_CAB_WINDOW_LIFT_M = .120
PRIMARY_DOOR_SILL_FORE_LIFT_M = .140
PRIMARY_DOOR_SILL_REAR_LOCK_PHASE = .040
PRIMARY_DOOR_SILL_FRAME_LOWER_Z_M = 1.80
SPARE_WHEEL_CENTRE_M = (.87,.45,1.07)
CANVAS_CLOSURE_LOWER_ADJUSTMENTS_M = ((0,0),(-.010,-.019),(.074,-.021))
CANVAS_FRONT_CLOSURE_OUTWARD_M = .003
CANVAS_FRONT_EDGE_EXTENSION_M = .200
CANVAS_FRONT_ANCHOR_EXTENSION_M = .075
PRIMARY_CLOSURE_SHIFTS_M = ((0,.095,-.162),(0,.300,-.183),(0,.222,-.196))
PRIMARY_CLOSURE_FREE_EXTRA_M = (0,.006,.012)
PRIMARY_FORE_FLAP_SHIFT_M = PRIMARY_CLOSURE_SHIFTS_M[0]
FRONT_BUMPER_CENTRE_Z = .62
FRONT_BUMPER_WIDTH_M = 1.58
FRONT_BUMPER_MOUNT_Z = .61
FRONT_FENDER_CROWN_LIFT_M = .180
FRONT_FENDER_FORE_START_RAD = .55
FRONT_FENDER_FORE_LIP_Y_M = 2.435
FRONT_FENDER_FORE_RADIUS_M = (FRONT_FENDER_FORE_LIP_Y_M-1.82)/math.cos(FRONT_FENDER_FORE_START_RAD)
FRONT_FENDER_FORE_TAPER_M = .055
FRONT_FENDER_INNER_FORE_EXTRA_X_M = .120
FRONT_FENDER_INNER_FORE_SETBACK_Y_M = .100
FRONT_FENDER_INNER_FORE_DROP_Z_M = .030
FRONT_STAR_FORWARD_M = .060
FRONT_CROSSBAR_FORWARD_M = .043
REAR_CHEEK_FRONT_RELIEF_M = .125
REAR_CHEEK_EARLY_OPEN_DEG = 20
FRONT_BUMPER_HEIGHT_M = .09
FRONT_BUMPER_FACE_Y = 2.4325
FRONT_BUMPER_RIVET_FRONT_Y = 2.448
FRONT_TOW_EYE_LIFT_M = .10
CANOPY_FRONT_OPENING_HALF_M = .78
CANOPY_FRONT_CURTAIN_EDGE_RAW_Z = 2.37
CANOPY_FRONT_CURTAIN_SAG_M = .005
CANOPY_FRONT_CURTAIN_TILT_M = -.055
CANOPY_FRONT_BOW_SETBACK_M = .025
CANOPY_FRONT_CORNER_FOLD_DEPTH_M = .03
REAR_FENDER_HEIGHT_OFFSET_M = .09
REAR_FENDER_CARGO_RELIEF_M = .002
BONNET_PANEL_RAW_Y = (1.5824301589848826, 2.26162)
BONNET_SIDE_OUTER_START_RAW_Y = 1.4328226366576962
BONNET_FIXED_REAR_RAW_Y = (1.26,1.30)
BONNET_REFERENCE_TOP_DEG = 23.38
BONNET_REFERENCE_SIDE_DEG = 131.36
BONNET_REFERENCE_CHEEK_DEG = 70
BONNET_TAPER_M = .29
BONNET_WORLD_REAR_Y = 1.01
BONNET_WORLD_FRONT_Y = 2.34
BONNET_WORLD_LENGTH = BONNET_WORLD_FRONT_Y-BONNET_WORLD_REAR_Y
BONNET_TOP_REAR_Z = 1.63
BONNET_TOP_HEIGHT_DIFFERENCE = .15
BONNET_SHOULDER_REAR_Z = 1.46
BONNET_SHOULDER_HEIGHT_DIFFERENCE = .16
FRONT_RADIATOR_DROP_M = .09
FRONT_HEADLIGHT_DROP_M = -0.04659748335532808
FRONT_LAMP_SCALE = 0.9765564830997069
FRONT_LAMP_BARREL_SHORTEN_RAW_M = .092
FRONT_HEADLIGHT_FORWARD_M = 0.20711164990165098
FRONT_HEADLIGHT_ABS_X = .469
FRONT_FRAME_FOOT_ABS_X = .635
FRONT_FRAME_FOOT_Y = 2.10
FRONT_CROSSBAR_DROP_M = -.085
FRONT_RADIATOR_WIDTH_SCALE = .30/.435
FRONT_RADIATOR_REARWARD_M = .03
REFERENCE_STEER_INNER_DEG = 16
REFERENCE_CAMERA_LOCATION = (9.206558945812747,7.199037546820066,.7101724024734355)
REFERENCE_CAMERA_TARGET = (1.6450328819905113,1.4536783547661836,.9634930301747016)
REFERENCE_CAMERA_LENS_MM = 68.97640203785065
REFERENCE_CAMERA_ROLL_DEG = -1.4982668252879088
REFERENCE_PRINCIPAL_POINT_PX = (347.48289911704575,249.55055332194243)
CARGO_PHOTO_FRONT_Y = -.35
CARGO_PHOTO_REAR_Y = -2.947
CANVAS_PHOTO_FRONT_Y = -.38
CANVAS_PHOTO_REAR_Y = -2.877
CANVAS_BAYS = 3
CAB_LONGITUDINAL_SCALE = 1.29/1.05
DOOR_HINGE_ABS_X = .785
DOOR_HINGE_RAW_Y = 1.135
TAILGATE_AXIS_RAW_Y = -2.70
BONNET_INSPECTION_POSES = ((0,0,0),(6/60,25,-30),(8/60,35,-40),(11/60,50,-50),(17/60,80,-65),(18/60,85,-65),(19/60,90,-60),(.5,90,-60),(1,BONNET_REFERENCE_TOP_DEG,BONNET_REFERENCE_SIDE_DEG))


def BonnetRearCheekAngle(phase):
    if phase<=19/60:return REAR_CHEEK_EARLY_OPEN_DEG*max(0,min(1,phase/.1))
    return REAR_CHEEK_EARLY_OPEN_DEG+(BONNET_REFERENCE_CHEEK_DEG-REAR_CHEEK_EARLY_OPEN_DEG)*max(0,min(1,(phase-19/60)/(.5-19/60)))


def BonnetInspectionAngles(phase):
    """Collision-checked joint-space path; hardware/operation remains inferred.

    Counterfold the side leaf during the lift, then fold while lowering to the
    photographed rest pose. Each waypoint lies on an actual animation frame.
    Linear authoring preserves the verified straight path between waypoints.
    """
    phase=max(0,min(1,phase))
    for start,end in zip(BONNET_INSPECTION_POSES,BONNET_INSPECTION_POSES[1:]):
        if phase<=end[0]:
            weight=(phase-start[0])/(end[0]-start[0])
            return (start[1]+(end[1]-start[1])*weight,start[2]+(end[2]-start[2])*weight)
    return BONNET_INSPECTION_POSES[-1][1:]


def BonnetShoulder(y, side=1):
    t=(y-1.15)/1.19
    return Vector((side*(.61-BONNET_TAPER_M*t),y,BONNET_SHOULDER_REAR_Z-BONNET_SHOULDER_HEIGHT_DIFFERENCE*t))


def BonnetLowerZ(y):
    return .97-.14*(y-1.15)/1.19


def RearCheekRawEdge(side):
    upper=BonnetShoulder(BONNET_FIXED_REAR_RAW_Y[0],side)
    lower=BonnetShoulder(BONNET_FIXED_REAR_RAW_Y[1],side);lower.z=BonnetLowerZ(lower.y)
    return upper,lower

def Mesh(name, vertices, faces, material='Paint', parent=None, smooth=False):
    mesh = bpy.data.meshes.new(name+'Mesh')
    mesh.from_pydata(vertices, [], faces);mesh.update()
    obj = bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    obj.data.materials.append(MATS[material]);obj['MaterialZone']=material
    if parent: Parent(obj,parent)
    if smooth:
        for poly in mesh.polygons:poly.use_smooth=True
    return obj

def Parent(obj,parent):
    world=obj.matrix_world.copy();obj.parent=parent;obj.matrix_world=world

def Pivot(name,location=(0,0,0),parent=None,axis=None,limits=None):
    obj=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(obj)
    obj.empty_display_type='PLAIN_AXES';obj.empty_display_size=.12;obj.matrix_world=Matrix.Translation(Vector(location))
    if parent:Parent(obj,parent)
    if axis:obj['MotionAxisBlender']=axis
    if limits:obj['MotionRangeDegrees']=limits
    return obj

def Bevel(obj,width=.006,segments=3):
    bevel=obj.modifiers.new('ManufacturedEdgeRadius','BEVEL');bevel.width=width;bevel.segments=segments
    bevel.limit_method='ANGLE'
    normal=obj.modifiers.new('AreaWeightedNormals','WEIGHTED_NORMAL');normal.keep_sharp=True;normal.weight=40
    return obj

def Box(name,location,size,material='Paint',parent=None,bevel=.004):
    x,y,z=location;hx,hy,hz=[n*.5 for n in size]
    vertices=[(x+a*hx,y+b*hy,z+c*hz) for a,b,c in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]]
    obj=Mesh(name,vertices,[(2,6,4,0),(5,7,3,1),(4,5,1,0),(3,7,6,2),(1,3,2,0),(6,7,5,4)],material,parent,smooth=material=='Leather')
    if bevel:Bevel(obj,bevel)
    return obj

def Cylinder(name,center,radius,depth,material='Steel',axis='Z',parent=None,segments=48,radius2=None):
    vertices=[]
    for d,r in [(-depth/2,radius),(depth/2,radius if radius2 is None else radius2)]:
        for i in range(segments):
            a=2*PI*i/segments;u,v=r*math.cos(a),r*math.sin(a)
            p=(d,u,v) if axis=='X' else ((u,d,v) if axis=='Y' else (u,v,d))
            vertices.append(tuple(center[k]+p[k] for k in range(3)))
    faces=[tuple(range(segments-1,-1,-1)),tuple(range(segments,segments*2))]
    faces += [(i,(i+1)%segments,(i+1)%segments+segments,i+segments) for i in range(segments)]
    if axis=='Y':faces=[tuple(reversed(f)) for f in faces]
    obj=Mesh(name,vertices,faces,material,parent,True)
    for face in obj.data.polygons[:2]:face.use_smooth=False
    return obj

def Sphere(name,center,scale,material='Steel',parent=None,segments=32,rings=16):
    vertices=[(center[0],center[1],center[2]+scale[2])]
    for j in range(1,rings):
        t=PI*j/rings
        for i in range(segments):
            a=2*PI*i/segments;vertices.append((center[0]+scale[0]*math.sin(t)*math.cos(a),center[1]+scale[1]*math.sin(t)*math.sin(a),center[2]+scale[2]*math.cos(t)))
    vertices.append((center[0],center[1],center[2]-scale[2]));bottom=len(vertices)-1
    faces=[(0,1+i,1+(i+1)%segments) for i in range(segments)]
    faces += [(1+j*segments+i,1+(j+1)*segments+i,1+(j+1)*segments+(i+1)%segments,1+j*segments+(i+1)%segments) for j in range(rings-2) for i in range(segments)]
    faces += [(bottom,1+(rings-2)*segments+(i+1)%segments,1+(rings-2)*segments+i) for i in range(segments)]
    return Mesh(name,vertices,faces,material,parent,True)

def RevolveY(name,centre,profile,material='Steel',parent=None,closed=False,reverse=False,segments=48):
    """Revolve a radial section without closing its open front with a solid disk."""
    vertices=[];rings=[]
    for radius,dy in profile:
        if radius==0:
            rings.append([len(vertices)]);vertices.append((centre[0],centre[1]+dy,centre[2]))
        else:
            ring=[]
            for i in range(segments):
                angle=2*PI*i/segments;ring.append(len(vertices));vertices.append((centre[0]+radius*math.cos(angle),centre[1]+dy,centre[2]+radius*math.sin(angle)))
            rings.append(ring)
    faces=[];pairs=list(zip(rings,rings[1:]))
    if closed:pairs.append((rings[-1],rings[0]))
    for a,b in pairs:
        for i in range(segments):
            j=(i+1)%segments
            if len(a)==1:face=(a[0],b[i],b[j])
            elif len(b)==1:face=(a[i],b[0],a[j])
            else:face=(a[i],b[i],b[j],a[j])
            faces.append(tuple(reversed(face)) if reverse else face)
    return Mesh(name,vertices,faces,material,parent,True)

def Tube(name,points,radius,material='Steel',parent=None,segments=8):
    pts=[Vector(p) for p in points];vertices=[]
    for i,point in enumerate(pts):
        tangent=(pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)]).normalized()
        up=Vector((0,0,1)) if abs(tangent.z)<.95 else Vector((0,1,0))
        u=tangent.cross(up).normalized();v=tangent.cross(u).normalized()
        for k in range(segments):
            a=2*PI*k/segments;vertices.append(tuple(point+radius*(math.cos(a)*u+math.sin(a)*v)))
    faces=[(j*segments+k,j*segments+(k+1)%segments,(j+1)*segments+(k+1)%segments,(j+1)*segments+k) for j in range(len(pts)-1) for k in range(segments)]
    faces += [tuple(range(segments-1,-1,-1)),tuple((len(pts)-1)*segments+k for k in range(segments))]
    return Mesh(name,vertices,faces,material,parent,True)

def RingX(name,center,profile,material='Paint',parent=None,segments=96,reverse=False):
    vertices=[];x,y,z=center
    for lateral,radius in profile:
        for k in range(segments):
            a=2*PI*k/segments;vertices.append((x+lateral,y+radius*math.cos(a),z+radius*math.sin(a)))
    faces=[(j*segments+k,j*segments+(k+1)%segments,((j+1)%len(profile))*segments+(k+1)%segments,((j+1)%len(profile))*segments+k) for j in range(len(profile)) for k in range(segments)]
    if reverse:faces=[tuple(reversed(f)) for f in faces]
    return Mesh(name,vertices,faces,material,parent,True)

def PlateYZ(name,x,outline,thickness,material='Paint',parent=None,bevel=.004):
    vertices=[(x+d,y,z) for d in [-thickness/2,thickness/2] for y,z in outline];n=len(outline)
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    obj=Mesh(name,vertices,faces,material,parent)
    if bevel:Bevel(obj,bevel)
    return obj

def Bolt(name,point,axis='X',parent=None,radius=.012,material='Steel'):
    return Cylinder(name,point,radius,.014,material,axis,parent,6)

def ArcPoints(center,radius,start,end,steps=32,axis='X'):
    x,y,z=center
    return [(x,y+radius*math.cos(start+(end-start)*i/steps),z+radius*math.sin(start+(end-start)*i/steps)) for i in range(steps+1)]

def Materials():
    values={'Paint':(.32,.32,.32,1),'Chassis':(.20,.20,.20,1),'Steel':(.24,.24,.24,1),'Reflector':(.70,.70,.70,1),'LampGlass':(.52,.52,.52,1),'Rubber':(.18,.18,.18,1),'Canvas':(.45,.45,.45,1),'Wood':(.38,.38,.38,1),'Leather':(.23,.23,.23,1),'Glass':(.38,.40,.41,1),'Light':(.66,.66,.66,1),'Dark':(.08,.08,.08,1),'Stencil':(.55,.55,.55,1),'Rust':(.20,.20,.20,1)}
    result={}
    for name,color in values.items():
        mat=bpy.data.materials.new('Material_Isuzu'+name);mat.diffuse_color=color;mat.use_nodes=True
        node=mat.node_tree.nodes.get('Principled BSDF');node.inputs['Base Color'].default_value=color;node.inputs['Roughness'].default_value=.72
        result[name]=mat
    return result

def PressedDiscProfile(radius):
    t=max(0,min(1,(.246-radius)/(.246-.141)));return .103+.007*t*t*(3-2*t)

def PressedDiscGeometry(x,y,z,sign):
    """One welded annular pressing with eight constrained oval openings."""
    from mathutils.geometry import delaunay_2d_cdt
    points=[];loops=[]
    for radius,count in [(.246,64),(.141,32)]:
        loop=[]
        for i in range(count):
            a=math.tau*i/count;loop.append(len(points));points.append(Vector((radius*math.cos(a),radius*math.sin(a))))
        loops.append(loop)
    for j in range(8):
        a=math.tau*j/8;loop=[]
        for i in range(24):
            # Front/rear elevations in the1936manual show tangential ovals.
            # Drawing ratios set these reconstruction values; no printed hole
            # dimensions or historical pressing depth are claimed. Convert to
            # raw coordinates before MakeWheel's existing metal unit fit.
            t=math.tau*i/24;radialScale=.2864/.266
            r=(WHEEL_VENT_PITCH_RADIUS_M+WHEEL_VENT_RADIAL_SEMIAXIS_M*math.cos(t))/radialScale
            v=WHEEL_VENT_TANGENTIAL_SEMIAXIS_M*math.sin(t)/radialScale
            loop.append(len(points));points.append(Vector((r*math.cos(a)-v*math.sin(a),r*math.sin(a)+v*math.cos(a))))
        loops.append(loop)
    edges=[(loop[i],loop[(i+1)%len(loop)]) for loop in loops for i in range(len(loop))]
    verts,cdtEdges,triangles,origVerts,origEdges,origFaces=delaunay_2d_cdt(points,edges,[],0,1e-7,False)
    def Inside(p,loop):
        return all((points[b]-points[a]).cross(p-points[a])>=-1e-9 for a,b in zip(loop,loop[1:]+loop[:1]))
    front=[tuple(face) for face in triangles if not any(Inside(sum((verts[i] for i in face),Vector((0,0)))/len(face),loop) for loop in loops[1:])]
    count=len(verts);vertices=[(x+sign*(PressedDiscProfile(v.length)-depth),y+v.x,z+v.y) for depth in [0,.004] for v in verts]
    # CDT front is CCW in the YZ plane. Every triangle shares boundary vertices.
    front=[face if sign>0 else tuple(reversed(face)) for face in front]
    faces=front+[tuple(reversed(tuple(i+count for i in f))) for f in front]
    edgeCounts={};edgeDirections={}
    for f in front:
        for a,b in zip(f,f[1:]+f[:1]):
            key=tuple(sorted((a,b)));edgeCounts[key]=edgeCounts.get(key,0)+1;edgeDirections[key]=(a,b)
    boundary=[edgeDirections[k] for k,n in edgeCounts.items() if n==1]
    faces.extend((b,a,a+count,b+count) for a,b in boundary)
    return vertices,faces,len(front)

def SetPressedDiscNormals(mesh,centre,sign,frontCount):
    mesh.update();normalList=[];radialScale=.2864/.266;axialScale=.1524/.25
    for p in mesh.polygons:
        front=p.index<frontCount;back=frontCount<=p.index<2*frontCount
        for li in p.loop_indices:
            v=mesh.vertices[mesh.loops[li].vertex_index].co
            if front or back:
                dy,dz=v.y-centre[1],v.z-centre[2];r=math.hypot(dy,dz);rawR=r/radialScale;t=max(0,min(1,(.246-rawR)/(.246-.141)))
                slope=-.007*6*t*(1-t)/(.246-.141)*axialScale/radialScale
                n=Vector((sign,-slope*dy/r,-slope*dz/r)).normalized();normalList.append(n if front else -n)
            else:normalList.append(p.normal.copy())
        p.use_smooth=front or back
    mesh.normals_split_custom_set(normalList)


def MakeWheel(name,x,y,z,parent,spare=False):
    pivot=Pivot(name,(x,y,z),parent,None if spare else 'X',None if spare else [-360,360])
    pivot['SourceWheelRawCentreM']=[x,y,z]
    if spare:pivot['IsSpareWheel']=True
    else:pivot['RollingRadiusM']=.4318
    pivot['FactoryTyreDesignation']='34 x 6 inches, factory manual section 98 (printed p.55)'
    sign=-1 if x<0 else 1
    # Narrow 1930s tyres: crown, sidewall, bead and rim seat are modelled in section.
    section=[(-.108,.245),(-.119,.277),(-.125,.330),(-.116,.384),(-.089,.424),(-.052,.439),(0,.442),(.052,.439),(.089,.424),(.116,.384),(.125,.330),(.119,.277),(.108,.245)]
    RingX(name+'_Tyre',(x,y,z),section,'Rubber',pivot,112)
    for side in [-1,1]:
        RingX(name+'_SidewallBead'+str(side),(x,y,z),[(side*.124,.282),(side*.128,.284),(side*.129,.288),(side*.125,.290)],'Rubber',pivot,96)
        RingX(name+'_SidewallRib'+str(side),(x,y,z),[(side*.119,.350),(side*.122,.352),(side*.122,.356),(side*.119,.357)],'Rubber',pivot,96)
    # Three staggered rows of discrete diagonal tread lugs, clipped to a rounded crown.
    tv=[];tf=[]
    for step in range(54):
        for lane in range(3):
            angle=2*PI*(step+(lane%2)*.45)/54;xc=(lane-1)*.066
            for dx,da,dr in [(-.030,-.030,0),(-.030,.030,0),(.030,.030,0),(.030,-.030,0),(-.028,-.029,.012),(-.028,.029,.012),(.028,.029,.012),(.028,-.029,.012)]:
                a=angle+da+dx*.48*(-1 if lane==0 else 1);r=.433+dr-.012*(abs(xc)/.1)**2
                tv.append((x+xc+dx,y+r*math.cos(a),z+r*math.sin(a)))
            base=len(tv)-8;tf.extend(tuple(base+i for i in f) for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
    Mesh(name+'_TreadLugs',tv,tf,'Rubber',pivot)
    # Pressed disc has actual open oval ventilation holes, never black decals.
    RingX(name+'_Rim',(x,y,z),[(-.098,.231),(-.112,.244),(-.112,.260),(-.102,.266),(.102,.266),(.112,.260),(.112,.244),(.098,.231)],'Paint',pivot,96)
    verts,faces,frontCount=PressedDiscGeometry(x,y,z,sign)
    disc=Mesh(name+'_PerforatedDisc',verts,faces,'Paint',pivot,True)
    disc['PressedDiscFrontTriangles']=frontCount
    disc['PressedDiscOvalHoles']=8
    disc['PressedDiscSurface']='Continuous axisymmetric steel pressing; concealed thickness/profile reconstructed'
    disc['VentPatternEvidence']='1936manual scan09front/rear side elevations:8tangential ovals.0.218mpitch radius,0.0235mradial and0.0355mtangential semiaxes reconstructed from scan ratios,not printed manufacturing dimensions.'
    disc['PreserveRuntimeTopology']=True
    disc['RuntimeBudgetLocked']=True
    # The road-wheel collar must bridge the hub and the existing nut backs.
    # Its flat annulus is at .150rawX: .157nut centre minus .014/2 depth.
    # The old shallow cone left every nut floating about27mm after unit fit.
    # This hidden hub/seat profile is a construction reconstruction; the
    # unhubbed spare keeps its independently mounted inner rim unchanged.
    innerProfile=ROAD_WHEEL_NUT_SEAT_PROFILE if not spare else [(.102,.104),(.115,.128),(.110,.141),(.095,.126)]
    collar=RingX(name+'_InnerDisc',(x,y,z),[(sign*a,r) for a,r in innerProfile],'Paint',pivot,80,reverse=sign>0)
    collar['RingReverseWinding']=sign>0
    if not spare:
        Cylinder(name+'_Hub',(x+sign*.12,y,z),.095,.075,'Paint','X',pivot,48)
        cap= Cylinder(name+'_HubCap',(x+sign*.163,y,z),WHEEL_HUB_CAP_CORNER_RADIUS_M/(.2864/.266),.022,'Paint','X',pivot,6)
        centre=Vector((x+sign*.163,y,z));rotation=Matrix.Rotation(math.radians(WHEEL_HUB_CAP_PHASE_DEG),3,'X')
        for vertex in cap.data.vertices:vertex.co=centre+rotation@(vertex.co-centre)
        for face in cap.data.polygons:face.use_smooth=False
        cap.data.update();cap['OutlineEvidence']='1936manual scan09front/rear side drawings show a smaller six-sided central outline;56mmcorner radius and30degreephase reconstructed from scan ratios,not printed dimensions. Axial position/depth retained and unproven.'
        for b in range(8):
            a=2*PI*b/8+math.radians(ROAD_WHEEL_LUG_PHASE_DEG)
            Bolt(name+'_Lug'+str(b),(x+sign*.157,y+.110*math.cos(a),z+.110*math.sin(a)),'X',pivot,.013,'Steel')
    # Factory nominal 34x6 high-pressure tyre. Preserve the eight-hole pressed
    # rim, fit a 22-inch bead seat and a 6-inch section instead of a modern wide tyre.
    for obj in pivot.children:
        if obj.type!='MESH':continue
        for vertex in obj.data.vertices:
            point=vertex.co;point.x=x+(point.x-x)*(.1524/.25)
            yy=point.y-y;zz=point.z-z;radius=math.hypot(yy,zz)
            if radius>1e-8:
                newRadius=.2794+(radius-.245)*(.4318-.2794)/(.445-.245) if obj.get('MaterialZone')=='Rubber' else radius*(.2864/.266)
                point.y=y+yy*newRadius/radius;point.z=z+zz*newRadius/radius
    wheelLod.SeatTreadBase(bpy.data.objects[name+'_TreadLugs'],bpy.data.objects[name+'_Tyre'])
    ROOT['TreadBaseOverlapM']=.0015
    ROOT['TreadBasePlacementEvidence']='High-source base corners conform to actual carcass with1.5mmconstruction overlap. Top corners,nominal34x6envelope and inferred54x3pattern retained; exact historical tread mould unproven.'
    SetPressedDiscNormals(disc.data,(x,y,z),sign,frontCount)
    return pivot


def SideSpare():
    """Photo-supported spare with inferred carrier, attached to the moving door.

    This is a normal34x6 tyre and an unhubbed eight-hole rim. The period photo
    establishes its presence and side orientation, not concealed fastenings or
    the carrier's exact mounting. Keep it outside the road-wheel roll hierarchy.
    """
    x,y,z=SPARE_WHEEL_CENTRE_M;door=bpy.data.objects['Door_Right']
    spare=MakeWheel('SpareWheel',x,y,z,door,spare=True)
    spare['MountingEvidence']='Side spare visible in primary front-quarter photo; concealed door carrier/locking hardware reconstructed and clearance tested'
    PlateYZ('SpareCarrier_Backplate',.791,[(y-.17,z-.13),(y+.17,z-.13),(y+.17,z+.13),(y-.17,z+.13)],.014,'Paint',door,.006)
    Cylinder('SpareCarrier_Spindle',(.85,y,z),.040,.13,'Chassis','X',door,32)
    Cylinder('SpareCarrier_CentreSeat',(.924,y,z),.102,.018,'Paint','X',door,48)
    PlateYZ('SpareCarrier_LockingBar',.941,[(y-.125,z-.020),(y+.125,z-.020),(y+.125,z+.020),(y-.125,z+.020)],.008,'Steel',door,.003)
    Cylinder('SpareCarrier_LockingNut',(.942,y,z),.019,.012,'Steel','X',door,6)
    for dy in [-.12,.12]:
        for dz in [-.08,.08]:Cylinder('SpareCarrier_BackplateRivet'+str(dy)+str(dz),(.785,y+dy,z+dz),.009,.054,'Paint','X',door,8)
    ROOT['SideSpareCentreBlenderM']=[x,y,z]
    ROOT['SideSpareTyreDesignation']='34x6; matches six road tyres'
    ROOT['SideSpareParent']='Door_Right'
    ROOT['SideSpareCarrierHistoricallyProven']=False
    ROOT['SideSparePositionEvidence']='Primary-photo visible lower contour;100mm lower than V43 with unchanged34x6tyre dimensions and camera. Exact mount and obscured rim/upper contour remain reconstruction.'
    FitSpareReverseMount()


def FitSpareReverseMount():
    """Expose the inward rim bowl and rebuild its inferred carrier contacts.

    Both period photographs show a recessed spare face. Its exact mounting,
    pressing depth and bright-ring correspondence remain reconstruction.
    """
    from mathutils.bvhtree import BVHTree
    spare=bpy.data.objects['SpareWheel'];centre=spare.matrix_world.translation.copy()
    spare.matrix_world=Matrix.Translation(centre)@Matrix.Rotation(math.pi,4,'Z')@Matrix.Translation(-centre)@spare.matrix_world
    spare.rotation_mode='QUATERNION';spare['RestRotationBlenderWxyz']=list(spare.matrix_basis.to_quaternion());bpy.context.view_layer.update()
    # Author the rest geometry in the same physical projection frame as the
    # other wheels. Keep the actual spare pivot reversed, bake each child's
    # installation transform into its editable positions and corner normals,
    # then let AssignUV apply the existing world-sized source projection.
    for obj in spare.children_recursive:
        if obj.type!='MESH':continue
        matrix=obj.matrix_world.copy();normalMatrix=matrix.to_3x3().inverted().transposed();normals=[tuple((normalMatrix@n.vector).normalized()) for n in obj.data.corner_normals]
        obj.data.transform(matrix);obj.matrix_world=Matrix.Identity(4);obj.data.update();obj.data.normals_split_custom_set(normals)
    bpy.context.view_layer.update()
    collar=bpy.data.objects['SpareWheel_InnerDisc'];deps=bpy.context.evaluated_depsgraph_get();ev=collar.evaluated_get(deps);mesh=ev.to_mesh()
    tree=BVHTree.FromPolygons([collar.matrix_world@v.co for v in mesh.vertices],[tuple(p.vertices) for p in mesh.polygons],all_triangles=False);ev.to_mesh_clear()
    bar=bpy.data.objects['SpareCarrier_LockingBar'];ev=bar.evaluated_get(deps);mesh=ev.to_mesh();points=[bar.matrix_world@v.co for v in mesh.vertices];back=min(p.x for p in points);feet=[p for p in points if abs(p.x-back)<1e-6];seatDeltas=[]
    for point in feet:
        hit=tree.ray_cast(Vector((1.2,point.y,point.z)),Vector((-1,0,0)),.6)[0]
        if hit is not None:seatDeltas.append(hit.x-point.x)
    ev.to_mesh_clear()
    if len(seatDeltas)<4:raise RuntimeError('Reversed spare does not support locking-bar feet')
    barBack=back+max(seatDeltas);barFront=barBack+.008
    targets={'SpareCarrier_Spindle':(.785,.807),'SpareCarrier_CentreSeat':(.795,.813),'SpareCarrier_LockingBar':(barBack,barFront),'SpareCarrier_LockingNut':(barFront,barFront+.012)}
    targets.update({obj.name:(.758,.799) for obj in ROOT.children_recursive if obj.name.startswith('SpareCarrier_BackplateRivet')})
    for name,target in targets.items():
        obj=bpy.data.objects[name];matrix=obj.matrix_world.copy();inverse=matrix.inverted();points=[matrix@v.co for v in obj.data.vertices];minimum=min(p.x for p in points);maximum=max(p.x for p in points)
        for vertex in obj.data.vertices:
            point=matrix@vertex.co;point.x=target[0]+(point.x-minimum)*(target[1]-target[0])/(maximum-minimum);vertex.co=inverse@point
        obj.data.update()
    ROOT['SideSpareRimFace']='Inward bowl, reversed about vertical axis; same centre and nominal tyre/rim sizes'
    ROOT['SideSpareMountEvidence']='Primary and supplementary period photos support a recessed spare face. Coupled spindle,pad,locking bar,nut and four fixing pins rebuilt for actual contact. Exact factory hardware,bowl depth and bright-ring position unproven.'
    ROOT['SideSpareMountCarrierParts']=list(targets)

def FitFarMirrorOrientation():
    """Keep the inferred mount, turn its round head toward a rearward view.

    Applied after body fitting so longitudinal fitting cannot stretch a turned
    round cap. The primary photo does not prove this exact adjustment angle.
    """
    back=bpy.data.objects['Mirror_BackLeft'];centre=sum((back.matrix_world@v.co for v in back.data.vertices),Vector())/len(back.data.vertices)
    rotation=Matrix.Rotation(math.radians(MIRROR_FAR_YAW_DEG),3,'Z')
    for name in ['Mirror_BackLeft','Mirror_GlassLeft']:
        obj=bpy.data.objects[name];matrix=obj.matrix_world.copy();inverse=matrix.inverted()
        for vertex in obj.data.vertices:vertex.co=inverse@(centre+rotation@(matrix@vertex.co-centre))
        obj.data.update()
    bpy.context.view_layer.update();normal=rotation@Vector((0,1,0));stalk=bpy.data.objects['Mirror_StalkLeft'];tip=sum((stalk.matrix_world@v.co for v in stalk.data.vertices[-10:]),Vector())/10
    eye=bpy.data.objects['SteeringWheel'].matrix_world.translation+Vector((0,-.12,.26))
    eyeDirection=(eye-centre).normalized();glassNormal=-normal;rearDirection=2*glassNormal*glassNormal.dot(eyeDirection)-eyeDirection
    ROOT['MirrorFarYawDegrees']=MIRROR_FAR_YAW_DEG;ROOT['MirrorFarCapNormalBlender']=list(normal);ROOT['MirrorFarCentreBlenderM']=list(centre);ROOT['MirrorFarStalkTipBlenderM']=list(tip);ROOT['MirrorAssumedDriverEyeBlenderM']=list(eye);ROOT['MirrorFarReflectedSceneDirection']=list(rearDirection)
    ROOT['MirrorFarConfigurationHistoricallyProven']=False
    ROOT['MirrorReconstructionEvidence']='Near head/stalk retained from primary. Far mount and presence remain inferred;32degree head yaw removes the parallel front-facing disc hypothesis and gives a rearward view from a reconstructed eye point. No exact historical angle or mirror-count certification.'


def Leaf(name,x,y,length,centerZ,curvature,thickness=.006,width=.065,parent=None):
    vertices=[];steps=24
    for j in range(steps+1):
        dy=-length/2+length*j/steps;z=centerZ+curvature*dy*dy
        vertices.extend([(x-width/2,y+dy,z-thickness/2),(x+width/2,y+dy,z-thickness/2),(x+width/2,y+dy,z+thickness/2),(x-width/2,y+dy,z+thickness/2)])
    faces=[(j*4+k,(j+1)*4+k,(j+1)*4+(k+1)%4,j*4+(k+1)%4) for j in range(steps) for k in range(4)]
    faces.extend([(0,1,2,3),tuple(steps*4+k for k in [3,2,1,0])])
    return Mesh(name,vertices,faces,'Chassis',parent)

def Chassis():
    for side in [-1,1]:
        x=side*.46
        Box('Chassis_Rail'+str(side),(x,-.10,.63),(.075,5.02,.18),'Chassis',ROOT,.009)
        Box('Chassis_RailLipTop'+str(side),(x,-.10,.726),(.105,5.02,.014),'Chassis',ROOT,.003)
        for j in range(24):Bolt('Chassis_Rivet'+str(side)+'_'+str(j),(x+side*.045,-2.43+j*.20,.645),'X',ROOT,.009,'Chassis')
    for y in [-2.40,-1.86,-.60,.24,1.03,1.9,2.28]:Box('Chassis_Crossmember'+str(y),(0,y,.49 if abs(y-.24)<.001 else .61),(1.0,.09,.12),'Chassis',ROOT,.006)
    for axle,y in [('Front',1.82),('Rear1',-.98),('Rear2',-2.08)]:
        if axle=='Front':
            Tube('FrontAxle_Beam',[(-.65,y,.4318),(-.40,y,.3418),(.40,y,.3418),(.65,y,.4318)],.044,'Chassis',ROOT,12)
            rod=Pivot('SteeringTieRod',(0,y-.13,.4218),ROOT,'Z',[-10,10])
            Cylinder('Steering_TieRod',(0,y-.13,.4218),.014,1.20,'Steel','X',rod,16)
        else:
            Cylinder(axle+'_Axle',(0,y,.4318),.055,1.47,'Chassis','X',ROOT,32)
            Sphere(axle+'_Differential',(0,y,.4318),(.19,.18,.1518),'Chassis',ROOT)
            Cylinder(axle+'_DifferentialCover',(0,y-.14,.4318),.118,.055,'Chassis','Y',ROOT,32)
            for k in range(8):
                a=k*2*PI/8;Bolt(axle+'_CoverBolt'+str(k),(.115*math.cos(a),y-.177,.4318+.115*math.sin(a)),'Y',ROOT,.010,'Steel')
        for side in [-1,1]:
            if axle=='Front':
                for leaf in range(8):Leaf('Front_Leaf'+str(side)+'_'+str(leaf),side*.45,y,1.12-leaf*.085,.565-leaf*.0075,.12/(.56**2),.0075,parent=ROOT)
            Box(axle+'_SpringSeat'+str(side),(side*.45,y,.50),(.09,.16,.040),'Chassis',ROOT,.004)
            for d in [-.06,.06]:Tube(axle+'_SpringUbolt'+str(side)+str(d),[(side*.45-.05,y+d,.55),(side*.45-.05,y+d,.37),(side*.45+.05,y+d,.37),(side*.45+.05,y+d,.55)],.008,'Steel',ROOT,6)
    # Factory rear equalizer: inverted semi-elliptic springs centred between
    # the driven axles, rather than two independent modern rear leaf packs.
    Cylinder('Rear_TrunnionShaft',(0,-1.53,.60),.065,1.03,'Chassis','X',ROOT,32)
    for side in [-1,1]:
        Box('Rear_TrunnionBearing'+str(side),(side*.45,-1.53,.62),(.14,.18,.16),'Chassis',ROOT,.014)
        for leaf in range(18):Leaf('Rear_EqualizerLeaf'+str(side)+'_'+str(leaf),side*.45,-1.53,1.16-leaf*.035,.65-leaf*.005,-.13/(.58**2),.005,parent=ROOT)
        for leaf in range(12):Leaf('Rear_LowerEqualizerLeaf'+str(side)+'_'+str(leaf),side*.45,-1.53,1.16-leaf*.035,.292+leaf*.004,.06/(.58**2),.004,parent=ROOT)
        for y in [-.98,-2.08]:Cylinder('Rear_EqualizerEndBearing'+str(side)+str(y),(side*.45,y,.4318),.103,.095,'Chassis','X',ROOT,32)
        for dy in [-.075,.075]:Tube('Rear_TrunnionUbolt'+str(side)+str(dy),[(side*.45-.047,-1.53+dy,.685),(side*.45-.047,-1.53+dy,.52),(side*.45+.047,-1.53+dy,.52),(side*.45+.047,-1.53+dy,.685)],.008,'Steel',ROOT,6)
    Tube('Driveline_PropellerShaft',[(0,.17,.65),(0,-.98,.4318),(0,-2.08,.4318)],.036,'Chassis',ROOT,16)
    for y in [.12,-.80,-1.2,-1.91]:
        z=.65+(.4318-.65)*(.17-y)/1.15 if y>-.98 else .4318
        Cylinder('Driveline_UniversalJoint'+str(y),(0,y,z),.057,.10,'Steel','Y',ROOT,16)
    Box('Transmission_Gearbox',(0,.46,.79),(.29,.48,.40),'Chassis',ROOT,.05)
    for side in [-1,1]:Tube('Transmission_Mount'+str(side),[(side*.12,.24,.66),(side*.23,.24,.55)],.016,'Chassis',ROOT,8)
    Box('FuelTank_Left',(-.65,-.05,.68),(.34,.74,.30),'Paint',ROOT,.035)
    for y in [-.33,.24]:Box('FuelTank_Strap'+str(y),(-.65,y,.685),(.354,.035,.315),'Chassis',ROOT,.008)
    Cylinder('FuelTank_Filler',(-.70,.19,.856),.035,.03,'Steel','Z',ROOT,24)
    Cylinder('Exhaust_Silencer',(.38,-.65,.45),.075,.75,'Chassis','Y',ROOT,32)
    Tube('Exhaust_Pipe',[(.38,-1.025,.45),(.38,-1.08,.46),(.38,-2.47,.47),(.54,-2.59,.49)],.023,'Chassis',ROOT,12)

def Fenders():
    def ForeOuterX(y):
        t=max(0,min(1,(y-1.82)/(FRONT_FENDER_FORE_LIP_Y_M-1.82)));return .945-FRONT_FENDER_FORE_TAPER_M*t*t*(3-2*t)
    for side in [-1,1]:
        # Front arch follows the tyre, then sweeps down into the running board.
        profile=[]
        for i in range(49):
            original=-.13+2.53*i/48
            t=original if original>=PI/2 else FRONT_FENDER_FORE_START_RAD+(PI/2-FRONT_FENDER_FORE_START_RAD)*(original+.13)/(PI/2+.13)
            radius=FRONT_FENDER_FORE_RADIUS_M if math.cos(t)>0 else .535
            y=1.82+radius*math.cos(t);z=.44+.535*math.sin(t)+FRONT_FENDER_CROWN_LIFT_M*max(0,math.sin(t))
            profile.append((y,z))
        # the rear edge of the front wing tapers into the footboard
        p0=profile[-1];p1=(1.20,.555+FRONT_FENDER_CROWN_LIFT_M*(.555-.44)/.535);p2=(1.00,.44);p3=(.65,.44)
        for k in range(1,25):
            t=k/24;s=1-t;profile.append(tuple(s**3*p0[i]+3*s*s*t*p1[i]+3*s*t*t*p2[i]+t**3*p3[i] for i in range(2)))
        vertices=[]
        for y,z in profile:
            bayT=max(0,min(1,(y-BONNET_WORLD_REAR_Y)/BONNET_WORLD_LENGTH))
            # The leading inner corner recedes and dishes down; a straight
            # transverse lip made the visible near wing extend into the grille.
            # Fade this reconstruction to zero at the unchanged arch crown.
            foreT=max(0,min(1,(y-1.82)/(FRONT_FENDER_FORE_LIP_Y_M-1.82)))
            foreWeight=foreT*foreT*(3-2*foreT)
            inner=max(.34,.61-BONNET_TAPER_M*bayT+.025)+FRONT_FENDER_INNER_FORE_EXTRA_X_M*foreWeight
            for k in range(9):
                t=k/8;outer=ForeOuterX(y);x=side*(inner+(outer-inner)*t);innerWeight=(1-t)*foreWeight
                vertices.append((x,y-FRONT_FENDER_INNER_FORE_SETBACK_Y_M*innerWeight,z+.028*math.sin(PI*t)-FRONT_FENDER_INNER_FORE_DROP_Z_M*innerWeight))
        faces=[(j*9+k,j*9+k+1,(j+1)*9+k+1,(j+1)*9+k) for j in range(len(profile)-1) for k in range(8)]
        if side>0:faces=[tuple(reversed(f)) for f in faces]
        obj=Mesh('FrontFender_'+str(side),vertices,faces,'Paint',ROOT,True)
        solid=obj.modifiers.new('RolledSheetThickness','SOLIDIFY');solid.thickness=.0018
        Tube('FrontFender_RolledLip'+str(side),[(side*ForeOuterX(y),y,z) for y,z in profile],.008,'Paint',ROOT,8)
        # Long continuous rear mudguard over the tandem, with short straight crown.
        outline=[]
        for i in range(25):
            a=-.05+PI*.5*i/24;outline.append((-.98+.53*math.cos(a),.44+.53*math.sin(a)))
        for i in range(1,10):outline.append((-.98-1.10*i/10,.97))
        for i in range(25):
            a=PI*.5+(PI*.5+.05)*i/24;outline.append((-2.08+.53*math.cos(a),.44+.53*math.sin(a)))
        vertices=[(side*(.55+.39*k/5),y,z+.018*math.sin(PI*k/5)) for y,z in outline for k in range(6)]
        faces=[(j*6+k,j*6+k+1,(j+1)*6+k+1,(j+1)*6+k) for j in range(len(outline)-1) for k in range(5)]
        if side>0:faces=[tuple(reversed(f)) for f in faces]
        obj=Mesh('RearFender_'+str(side),vertices,faces,'Paint',ROOT,True);mod=obj.modifiers.new('RolledSheetThickness','SOLIDIFY');mod.thickness=.0018
        Tube('RearFender_RolledLip'+str(side),[(side*.94,y,z) for y,z in outline],.008,'Paint',ROOT,8)
        Box('RunningBoard_'+str(side),(side*.725,.37,.415),(.45,1.13,.048),'Paint',ROOT,.013)
        for lane in range(5):Box('RunningBoard_TreadRib'+str(side)+str(lane),(side*(.57+lane*.074),.37,.444),(.015,.99,.009),'Paint',ROOT,.003)
        PlateYZ('RearMudflap_'+str(side),side*.75,[(-2.61,.64),(-2.64,.25),(-2.68,.24),(-2.68,.65)],.30,'Rubber',ROOT,.002)

    # Raised primary-photo wings need the authored continuous curvature and
    # rolled edge. Collapse reduction transferred visibly buckled highlights.
    for obj in ROOT.children_recursive:
        if obj.type=='MESH' and obj.name.startswith('FrontFender_'):
            obj['PreserveRuntimeTopology']=True;obj['RuntimeBudgetLocked']=True
    ROOT['FrontWingForeStartRadians']=FRONT_FENDER_FORE_START_RAD
    ROOT['FrontWingForeLipCentreYM']=FRONT_FENDER_FORE_LIP_Y_M
    ROOT['FrontWingForeRadiusM']=FRONT_FENDER_FORE_RADIUS_M
    ROOT['FrontWingForeTaperM']=FRONT_FENDER_FORE_TAPER_M
    ROOT['FrontWingInnerForeExtraXM']=FRONT_FENDER_INNER_FORE_EXTRA_X_M
    ROOT['FrontWingInnerForeSetbackYM']=FRONT_FENDER_INNER_FORE_SETBACK_Y_M
    ROOT['FrontWingInnerForeDropZM']=FRONT_FENDER_INNER_FORE_DROP_Z_M
    ROOT['FrontWingProfileEvidence']='Primary-photo outer leading tip and1936factory frontal photograph support short wings with recessed/dished inner corners.55mm outer fore-tip taper blends to zero at unchanged1.900m crown width;120mm inner narrowing,100mm setback and30mm dish retained. These are photo reconstruction parameters,not factory pressing dimensions; camera remains uncalibrated.'


def FitRearFenderCargoContacts():
    """Fit the visible rear lip, then cope the hidden sheet around the bed.

    The two bright curved bands in the original photograph independently place
    the existing rear profile about90mm higher. Keep the cargo, axles, tyres,
    width and longitudinal positions. Hidden relief is reconstruction, not an
    assertion about factory sheet-metal joinery.
    """
    from mathutils.bvhtree import BVHTree
    objects=list(ROOT.children_recursive);count=len(objects)
    guards=[o for o in objects if o.type=='MESH' and o.name.startswith(('RearFender_','RearMudflap_'))]
    for obj in guards:
        matrix=obj.matrix_world.copy();inverse=matrix.inverted()
        for vertex in obj.data.vertices:
            point=matrix@vertex.co;point.z+=REAR_FENDER_HEIGHT_OFFSET_M;vertex.co=inverse@point
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
    def Tree(obj):
        ev=obj.evaluated_get(deps);mesh=ev.to_mesh()
        result=BVHTree.FromPolygons([obj.matrix_world@v.co for v in mesh.vertices],[tuple(p.vertices) for p in mesh.polygons],all_triangles=False)
        ev.to_mesh_clear();return result
    cargo=[o for o in objects if o.type=='MESH' and o.name.startswith(('Cargo_','Tailgate_')) and not o.name.startswith('Cargo_CanvasBow')]
    trees={o.name:Tree(o) for o in cargo};cuts=[]
    for obj in guards:
        if not obj.name.startswith('RearFender_'):continue
        for other in cargo:
            deps.update()
            if not Tree(obj).overlap(trees[other.name]):continue
            points=[other.matrix_world@Vector(v) for v in other.bound_box]
            lower=Vector([min(p[k] for p in points)-REAR_FENDER_CARGO_RELIEF_M for k in range(3)])
            upper=Vector([max(p[k] for p in points)+REAR_FENDER_CARGO_RELIEF_M for k in range(3)])
            mesh=bpy.data.meshes.new('RearFenderCopingToolMesh')
            mesh.from_pydata([(x,y,z) for x in [lower.x,upper.x] for y in [lower.y,upper.y] for z in [lower.z,upper.z]],[],[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)])
            mesh.update();cutter=bpy.data.objects.new('RearFenderCopingTool',mesh);bpy.context.collection.objects.link(cutter)
            for selected in list(bpy.context.view_layer.objects):selected.select_set(False)
            obj.select_set(True);bpy.context.view_layer.objects.active=obj
            modifier=obj.modifiers.new('InferredCargoCoping','BOOLEAN');modifier.operation='DIFFERENCE';modifier.solver='EXACT';modifier.object=cutter
            names=[m.name for m in obj.modifiers]
            with bpy.context.temp_override(object=obj,active_object=obj,selected_objects=[obj],selected_editable_objects=[obj]):
                for name in names:bpy.ops.object.modifier_apply(modifier=name)
            data=cutter.data;bpy.data.objects.remove(cutter,do_unlink=True);bpy.data.meshes.remove(data)
            cuts.append({'fender':obj.name,'cargo':other.name})
            bpy.context.view_layer.update();deps.update()
    collisions=[]
    for obj in guards:
        tree=Tree(obj)
        for name,other in trees.items():
            overlap=tree.overlap(other)
            if overlap:collisions.append({'fender':obj.name,'cargo':name,'facePairs':len(overlap)})
    report={'heightOffsetM':REAR_FENDER_HEIGHT_OFFSET_M,'reliefM':REAR_FENDER_CARGO_RELIEF_M,'guardParts':len(guards),'cargoParts':len(cargo),'surfaceQueries':len(guards)*len(cargo),'cuts':cuts,'collisions':collisions}
    (QA/'Data_RearFenderSource.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    if len(guards)!=6 or len(ROOT.children_recursive)!=count or collisions:raise RuntimeError('Rear fender cargo fit failed: '+str(report))
    ROOT['RearFenderHeightOffsetM']=REAR_FENDER_HEIGHT_OFFSET_M
    ROOT['RearFenderCargoReliefM']=REAR_FENDER_CARGO_RELIEF_M
    ROOT['RearFenderCopingReportJson']=json.dumps(cuts)
    ROOT['RearFenderEvidence']='Original600x410 rear curved-lip bands; radii, width, axles and camera retained.90mm height correction and hidden cargo copings reconstructed, not factory manufacturing dimensions.'


def RadiatorCrownZ(x):
    return 1.615-.125*(abs(x)/.435)**3.2

def RadiatorVentZ(x):
    return RadiatorCrownZ(x)-.034-.100*math.exp(-(x/.075)**2)

def BuildRadiatorFront():
    xs=sorted(set([-.435+.87*i/64 for i in range(65)]+[-.013,.013]))
    top=[(x,RadiatorCrownZ(x)) for x in xs]
    outline=[(-.395,.90),(-.31,.795),(0,.765),(.31,.795),(.395,.90),(.435,1.29)]+list(reversed(top))+[(-.435,1.29)]
    Mesh('Radiator_DarkCore',[(x,2.379,z) for x,z in outline],[tuple(range(len(outline)))],'Dark',ROOT)
    rim=Tube('Radiator_OuterSurround',[(x,2.386,z) for x,z in outline+[outline[0]]],.020,'Paint',ROOT,12)
    for v in rim.data.vertices:v.co.y=2.386+(v.co.y-2.386)*(.006/.020)
    band=[]
    barTop=RadiatorVentZ(.013)
    for x,z in top:band.extend([(x,2.389,z),(x,2.389,barTop if abs(x)<=.013 else RadiatorVentZ(x))])
    header=Mesh('Radiator_UpperHeader',band,[(2*i,2*i+2,2*i+3,2*i+1) for i in range(len(top)-1)],'Paint',ROOT)
    solid=header.modifiers.new('PressedHeaderThickness','SOLIDIFY');solid.thickness=.002;solid.offset=-1
    spine=Mesh('Radiator_CenterMullion',[(-.013,2.389,.79),(.013,2.389,.79),(.013,2.389,barTop),(-.013,2.389,barTop)],[(0,3,2,1)],'Paint',ROOT)
    solid=spine.modifiers.new('PressedSpineThickness','SOLIDIFY');solid.thickness=.002;solid.offset=-1
    for i in range(-27,28):
        x=i*.0145;bottom=.79+.115*(abs(x)/.43)**2
        Tube('Radiator_VerticalFin'+str(i),[(x,2.383,bottom),(x,2.383,RadiatorVentZ(x))],.0034,'Paint',ROOT,4)
    for z in [.98,1.29]:Tube('Radiator_HorizontalBrace'+str(z),[(-.405,2.383,z),(.405,2.383,z)],.005,'Paint',ROOT,6)
    Tube('Radiator_FillerNeck',[(0,2.33,1.48),(0,2.33,1.632)],.022,'Steel',ROOT,24)
    profile=[(0,-.008),(.038,-.008),(.043,-.005),(.043,.002),(.041,.006),(.033,.009),(0,.009)]
    vertices=[];faces=[];rings=[];segments=48
    for r,z in profile:
        ring=[]
        for i in range(segments if r else 1):
            a=2*math.pi*i/segments;ring.append(len(vertices));vertices.append((r*math.cos(a),2.33+r*math.sin(a),1.637+z))
        rings.append(ring)
    for a,b in zip(rings,rings[1:]):
        for i in range(segments):
            j=(i+1)%segments
            if len(a)==1:face=(a[0],b[j],b[i])
            elif len(b)==1:face=(a[i],a[j],b[0])
            else:face=(a[i],a[j],b[j],b[i])
            faces.append(face)
    Mesh('Radiator_FillerCap',vertices,faces,'Steel',ROOT,True)
    for obj in ROOT.children_recursive:
        if obj.type=='MESH' and obj.name.startswith('Radiator_'):
            obj['PreserveRuntimeTopology']=True;obj['RuntimeBudgetLocked']=True
    ROOT['RadiatorCrownEvidence']='Original1936 front/side/plan distinguish continuous exterior crown, twin inner openings and flat cap; exact curves and dimensions reconstructed'
    ROOT['RadiatorCapDiameterM']=.086;ROOT['RadiatorCapThicknessM']=.017
    ROOT['RadiatorCapCentreBlender']=[0,2.30,1.547]


def FitServiceSaddle():
    """Separate the centre service saddle without changing the closed surface.

    The station plane is perpendicular to the unchanged bonnet hinge axis, so
    the trimmed moving edge remains behind the fixed saddle throughout lift.
    This concealed collar and its seam are reconstructed, not factory hardware.
    """
    import bpy
    from mathutils import Vector
    root=ROOT;axis=(bpy.data.objects['Hood_Right'].matrix_world.to_quaternion()@Vector((0,1,0))).normalized()
    yScale=BONNET_WORLD_LENGTH/1.19;yOffset=BONNET_WORLD_FRONT_Y-yScale*2.34
    stationY=yScale*BONNET_PANEL_RAW_Y[1]+yOffset-.008
    stationZ=BONNET_TOP_REAR_Z-BONNET_TOP_HEIGHT_DIFFERENCE*(stationY-BONNET_WORLD_REAR_Y)/BONNET_WORLD_LENGTH
    station=axis.dot(Vector((0,stationY,stationZ)));changed=[]
    cutter=Cylinder('Tool_RadiatorServiceHole',(0,2.30,1.50),.025,.40,'Dark','Z',None,48)
    try:
        for side in [-1,1]:
            obj=bpy.data.objects['BonnetTop_'+str(side)];matrix=obj.matrix_world.copy();inverse=matrix.inverted();points=[matrix@v.co for v in obj.data.vertices]
            rear=[];front=[]
            for k in range(5):
                a=points[11*17+k];b=points[12*17+k]
                if k<4:
                    moving=a.lerp(b,(station-.0015-axis.dot(a))/axis.dot(b-a))
                    fixed=a.lerp(b,(station+.0015-axis.dot(a))/axis.dot(b-a))
                    obj.data.vertices[12*17+k].co=inverse@moving
                else:
                    moving=a.lerp(b,1-.0045/axis.dot(b-a));fixed=a.lerp(b,1-.0015/axis.dot(b-a));obj.data.vertices[12*17+k].co=inverse@moving
                rear.append(fixed);front.append(b)
            obj.data.update();obj['PreserveRuntimeTopology']=True;obj['RuntimeBudgetLocked']=True;changed.append(obj.name)
            vertices=[tuple(p) for p in rear+front];faces=[(k,k+1,5+k+1,5+k) for k in range(4)]
            if side<0:faces=[tuple(reversed(f)) for f in faces]
            collar=Mesh('Nose_ServiceSaddle'+str(side),vertices,faces,'Paint',root,True)
            solid=collar.modifiers.new('PressedSaddleThickness','SOLIDIFY');solid.thickness=.0015;solid.offset=0
            boolean=collar.modifiers.new('ActualFillerClearanceHole','BOOLEAN');boolean.operation='DIFFERENCE';boolean.solver='EXACT';boolean.object=cutter
            bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();deps.update()
            mesh=bpy.data.meshes.new_from_object(collar.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
            oldMesh=collar.data;collar.modifiers.clear();collar.data=mesh;bpy.data.meshes.remove(oldMesh)
            collar['PreserveRuntimeTopology']=True;collar['RuntimeBudgetLocked']=True
            collar['ConstructionEvidence']='Inferred fixed centre service saddle and25mm neck clearance cutout; closed shell retained, exact historical joint unproven'
            changed.append(collar.name)
        for obj in root.children_recursive:
            if obj.type!='MESH' or not obj.name.startswith('BonnetHinge_'):continue
            matrix=obj.matrix_world.copy();inverse=matrix.inverted();count=0
            for v in obj.data.vertices:
                p=matrix@v.co;extra=axis.dot(p)-(station-.003)
                if extra>0:p-=axis*extra;v.co=inverse@p;count+=1
            if count:obj.data.update();changed.append(obj.name)
    finally:
        data=cutter.data;bpy.data.objects.remove(cutter,do_unlink=True);bpy.data.meshes.remove(data)
    old=bpy.data.objects['Engine_CoolantHose'];points=[old.matrix_world@v.co for v in old.data.vertices];centres=[sum(points[i:i+12],Vector())/12 for i in range(0,len(points),12)]
    tank=bpy.data.objects['Radiator_UpperTank'];bounds=[tank.matrix_world@v.co for v in tank.data.vertices];tankY=min(p.y for p in bounds);tankZ=(min(p.z for p in bounds)+max(p.z for p in bounds))/2
    route=[Vector((0,tankY+.027,tankZ+.005)),Vector((.10,centres[2].y+.022,1.415))]+centres[2:]
    bpy.data.objects.remove(old,do_unlink=True)
    hose=Tube('Engine_CoolantHose',[tuple(p) for p in route],.0225,'Rubber',root,12);hose['PreserveRuntimeTopology']=True;hose['RuntimeBudgetLocked']=True;changed.append(hose.name)
    root['RadiatorServiceStationY']=stationY;root['RadiatorServiceStationZ']=stationZ;root['RadiatorServiceAxis']=list(axis);root['RadiatorServiceGapM']=.003;root['RadiatorNeckHoleRadiusM']=.025;root['CoolantTankConnectionM']=list(route[0])
    root['RadiatorServiceEvidence']='Factory closed nose informs crown and flat cap; saddle split, neck clearance and concealed hose routing inferred, actual full motion checked separately'
    return changed


def Front():
    # Hood top: two lobes, shallow centre hinge, narrowing towards the radiator.
    for side in [-1,1]:
        topPivotZ=BONNET_TOP_REAR_Z-BONNET_TOP_HEIGHT_DIFFERENCE*(1.70-1.15)/1.19
        hood=Pivot('Hood_'+('Left' if side<0 else 'Right'),(0,1.70,topPivotZ),ROOT,'Y',[0,100])
        hood.matrix_world=Matrix.Translation(Vector((0,1.70,topPivotZ))) @ Matrix.Rotation(-math.atan2(BONNET_TOP_HEIGHT_DIFFERENCE,1.19),4,'X')
        vertices=[]
        for j in range(13):
            t=j/12;baseY=1.15+1.19*t
            for k in range(17):
                a=(PI*.5)*k/16
                # Set the outer front corners back from the fixed radiator.
                # The centre hinge keeps its original straight end position.
                y=baseY-.05*1.19/BONNET_WORLD_LENGTH*math.sin(a)**2*t**8
                profileT=(y-1.15)/1.19;w=.61-BONNET_TAPER_M*profileT;top=BONNET_TOP_REAR_Z-BONNET_TOP_HEIGHT_DIFFERENCE*profileT
                x=side*w*math.sin(a);z=top-(top-BonnetShoulder(y).z)*(1-math.cos(a))
                vertices.append((x,y,z))
        faces=[(j*17+k,j*17+k+1,(j+1)*17+k+1,(j+1)*17+k) for j in range(12) for k in range(16)]
        if side<0:faces=[tuple(reversed(face)) for face in faces]
        obj=Mesh('BonnetTop_'+str(side),vertices,faces,'Paint',hood,True);sol=obj.modifiers.new('BonnetSheetThickness','SOLIDIFY');sol.thickness=.0015
        panelStart,panelEnd=BONNET_PANEL_RAW_Y
        outerStart=BONNET_SIDE_OUTER_START_RAW_Y
        sideCenter=BonnetShoulder((outerStart+panelEnd)/2,side)
        sidePivot=Pivot('HoodSide_'+('Left' if side<0 else 'Right'),sideCenter,hood,'Y',[-180,180])
        sidePivot.matrix_world=Matrix.Translation(sideCenter)@Vector((0,1,0)).rotation_difference(Vector((-side*BONNET_TAPER_M,1.19,-BONNET_SHOULDER_HEIGHT_DIFFERENCE)).normalized()).to_matrix().to_4x4()
        # Tapered side skin with real open louver slots, joined to the top through
        # a separate longitudinal hinge. The photographed panel folds upwards;
        # its complete outline, rather than only the louver ROI, is fitted.
        ventYs=[panelStart+.045+k*(panelEnd-panelStart-.09)/29 for k in range(30)]
        boundaries=[panelStart,panelEnd]
        for y in ventYs:boundaries.extend([y-.003,y+.003])
        boundaries=sorted(boundaries);vertices=[]
        for y in boundaries:
            t=(y-1.15)/1.19;w=.61-BONNET_TAPER_M*t
            shoulder=BonnetShoulder(y).z
            for z in [BonnetLowerZ(y),shoulder-.285,shoulder-.055,shoulder]:vertices.append((side*w,y,z))
        faces=[]
        for j in range(len(boundaries)-1):
            middle=(boundaries[j]+boundaries[j+1])/2
            slot=any(abs(middle-y)<.0031 for y in ventYs)
            for k in range(3):
                if slot and k==1:continue
                face=(j*4+k,(j+1)*4+k,(j+1)*4+k+1,j*4+k+1)
                faces.append(tuple(reversed(face)) if side<0 else face)
        panel=Mesh('BonnetSide_Sheet'+str(side),vertices,faces,'Paint',sidePivot)
        panel['PreserveRuntimeTopology']=True;sol=panel.modifiers.new('VentedSheetThickness','SOLIDIFY');sol.thickness=.002
        # The plain rear transition tapers to the shoulder instead of making an
        # oversized rectangular raised panel. Its diagonal relief and the cowl
        # below it are explicit reconstruction, not proven factory hardware.
        rearTip=BonnetShoulder(outerStart,side);rearUpper=BonnetShoulder(panelStart,side)
        rearLower=rearUpper.copy();rearLower.z=BonnetLowerZ(panelStart)
        triangle=Mesh('BonnetSide_RearTransition'+str(side),[tuple(rearTip),tuple(rearLower),tuple(rearUpper)],[(0,1,2)] if side>0 else [(2,1,0)],'Paint',sidePivot)
        sol=triangle.modifiers.new('RearTransitionThickness','SOLIDIFY');sol.thickness=.002
        # Keep the existing fixed rear body. An independently hinged plain
        # cheek fills the shortened side leaf's rear region; its hardware and
        # operation are explicit reconstruction,not a newly established fact.
        fixedStart,fixedPanelStart=BONNET_FIXED_REAR_RAW_Y;fixed=[]
        rearWidth=abs(BonnetShoulder(fixedStart).x)
        for y,z in [(1.15,.97),(fixedPanelStart,BonnetLowerZ(fixedPanelStart)),(fixedStart,BonnetShoulder(fixedStart).z),(1.15,BONNET_SHOULDER_REAR_Z)]:
            width=.73+(rearWidth-.73)*(y-1.15)/(fixedStart-1.15) if y<fixedStart else abs(BonnetShoulder(y).x)
            fixed.append((side*width,y,z))
        scuttle=Mesh('BonnetRearScuttle_'+str(side),fixed,[(0,1,2,3)] if side>0 else [(3,2,1,0)],'Paint',ROOT);sol=scuttle.modifiers.new('ScuttleSheetThickness','SOLIDIFY');sol.thickness=.002
        shoulder=[(side*.61,1.15,BONNET_SHOULDER_REAR_Z),(side*.73,1.15,BONNET_SHOULDER_REAR_Z),tuple(BonnetShoulder(fixedStart,side))]
        Mesh('BonnetRearShoulder_'+str(side),shoulder,[(0,1,2)] if side>0 else [(2,1,0)],'Paint',ROOT)
        oldTip,oldBottom=RearCheekRawEdge(side);axisStart=oldTip+Vector((side*.007,0,0));axisEnd=oldBottom+Vector((side*.007,0,0))
        suffix='Left' if side<0 else 'Right';cheek=Pivot('RearCheek_'+suffix,axisStart,ROOT,'Z',[-90,0] if side<0 else [0,90])
        cheek.matrix_world=Matrix.Translation(axisStart)@Vector((0,0,1)).rotation_difference((axisEnd-axisStart).normalized()).to_matrix().to_4x4()
        # Inset4mm in final metric space; offset3mm outward from the old skin.
        a=BONNET_WORLD_LENGTH/1.19;b=BONNET_WORLD_FRONT_Y-a*2.34
        quad=[p.copy() for p in [oldTip,oldBottom,rearLower,rearTip]];quad[2].z+=REAR_CHEEK_FRONT_RELIEF_M
        metric=[Vector((p.x,a*p.y+b,p.z)) for p in quad];inset=[]
        for i,p in enumerate(metric):
            u=(metric[(i-1)%4]-p).normalized();v=(metric[(i+1)%4]-p).normalized();bisector=(u+v).normalized();q=p+bisector*(.004/math.sqrt(max(1e-8,(1-u.dot(v))/2)))
            inset.append((q.x+side*.003,(q.y-b)/a,q.z))
        sheet=Mesh('BonnetRearCheek_Sheet'+str(side),inset,[(0,1,2,3)] if side>0 else [(3,2,1,0)],'Paint',cheek)
        solid=sheet.modifiers.new('RearCheekSheetThickness','SOLIDIFY');solid.thickness=.002;sheet['PreserveRuntimeTopology']=True;sheet['RuntimeBudgetLocked']=True
        for j,(lo,hi) in enumerate([(.03,.30),(.35,.65),(.70,.97)]):
            barrel=Tube('BonnetRearCheekBarrel_'+suffix+'_'+str(j),[tuple(axisStart.lerp(axisEnd,k)) for k in [lo,hi]],.007,'Steel',cheek if j==1 else ROOT,12)
            barrel['RearCheekRoundRadiusM']=.007;barrel['PreserveRuntimeTopology']=True;barrel['RuntimeBudgetLocked']=True
        pin=Tube('BonnetRearCheekPin_'+suffix,[tuple(axisStart),tuple(axisEnd)],.003,'Steel',ROOT,12)
        pin['RearCheekRoundRadiusM']=.003;pin['PreserveRuntimeTopology']=True;pin['RuntimeBudgetLocked']=True
        front=[]
        for y,upper in [(panelEnd,False),(2.34,False),(2.34,True),(panelEnd,True)]:
            p=BonnetShoulder(y,side)
            if not upper:p.z=BonnetLowerZ(y)
            front.append(tuple(p))
        apron=Mesh('BonnetFrontApron_'+str(side),front,[(0,1,2,3)] if side>0 else [(3,2,1,0)],'Paint',ROOT)
        sol=apron.modifiers.new('ApronSheetThickness','SOLIDIFY');sol.thickness=.002
        # Close-spaced vertical louvers match the early photographic body.
        for k,y in enumerate(ventYs):
            ztop=BonnetShoulder(y).z
            w=.61-BONNET_TAPER_M*(y-1.15)/1.19
            Tube('BonnetLouverLip_'+str(side)+'_'+str(k),[(side*(w+.0035),y+.003,ztop-.285),(side*(w+.0035),y+.003,ztop-.055)],.0025,'Paint',sidePivot,6)
        for y in [panelStart+.06,panelEnd-.06]:
            w=.61-BONNET_TAPER_M*(y-1.15)/1.19
            z=BonnetLowerZ(y)+.04
            Cylinder('BonnetLatch_'+str(side)+str(y),(side*(w+.014),y,z),.012,.10,'Steel','Z',sidePivot,12)
            Tube('BonnetLatchHandle_'+str(side)+str(y),[(side*(w+.02),y-.026,z),(side*(w+.035),y,z),(side*(w+.02),y+.026,z)],.008,'Steel',sidePivot,8)
        for j in range(12):
            y=1.20+j*.095
            if j%2==(1 if side>0 else 0):Tube('BonnetHinge_'+str(side)+str(j),[(0,yy,BONNET_TOP_REAR_Z-BONNET_TOP_HEIGHT_DIFFERENCE*(yy-1.15)/1.19) for yy in [y-.0325,y+.0325]],.008,'Steel',hood,12)
            y=outerStart+.015+j*(panelEnd-outerStart-.065)/12
            Tube('BonnetSideHinge_'+str(side)+str(j),[tuple(BonnetShoulder(yy,side)) for yy in [y,y+.045]],.005,'Paint',hood if j%2==0 else sidePivot,10)
    BuildRadiatorFront()
    Box('Radiator_UpperTank',(0,2.31,1.47),(.60,.10,.08),'Chassis',ROOT,.018)
    # Front crossbar carries a five-point army star and headlamps.
    star=[]
    for i in range(10):
        a=PI*.5+2*PI*i/10;r=.070 if i%2==0 else .029;star.append((r*math.cos(a),2.375+FRONT_STAR_FORWARD_M,1.185+r*math.sin(a)))
    obj=Mesh('Radiator_ArmyStar',star,[tuple(range(10))],'Stencil',ROOT);sol=obj.modifiers.new('StarThickness','SOLIDIFY');sol.thickness=.006
    for side in [-1,1]:
        x=side*FRONT_HEADLIGHT_ABS_X
        centre=(x,2.17,1.30)
        short=FRONT_LAMP_BARREL_SHORTEN_RAW_M
        RevolveY('Headlight_Bucket'+str(side),centre,[(0,-.12),(.045,-.112),(.085,-.085),(.115,-.045),(.126,0),(.123,.097-short)],'Paint',ROOT)
        RevolveY('Headlight_Rim'+str(side),centre,[(r,dy-short) for r,dy in [(.123,.079),(.126,.085),(.126,.113),(.121,.116),(.111,.109),(.111,.083)]],'Steel',ROOT,closed=True)
        RevolveY('Headlight_Reflector'+str(side),centre,[(.109*i/10,.015+.09*(i/10)**2-short) for i in range(11)],'Reflector',ROOT,reverse=True)
        RevolveY('Headlight_FlutedGlass'+str(side),centre,[(.111*i/10,.116+.018*(1-(i/10)**2)-short) for i in range(11)],'LampGlass',ROOT,reverse=True)
        for f in range(-6,7):
            xx=f*.014;h=math.sqrt(.107**2-xx**2);points=[]
            for j in range(9):
                zz=-h+2*h*j/8;dy=.116+.018*(1-(xx*xx+zz*zz)/(.111**2))+.0007-short;points.append((x+xx,centre[1]+dy,centre[2]+zz))
            Tube('Headlight_GlassFlute'+str(side)+'_'+str(f),points,.0012,'LampGlass',ROOT,6)
        Sphere('Headlight_Bulb'+str(side),(x,centre[1]+.03-short,centre[2]),(.010,.020,.010),'Light',ROOT,20,12)
    blade=Box('Bumper_FrontBlade',(0,2.40,FRONT_BUMPER_CENTRE_Z),(FRONT_BUMPER_WIDTH_M,.065,FRONT_BUMPER_HEIGHT_M),'Paint',ROOT,.012)
    blade['PreserveRuntimeTopology']=True;blade['RuntimeBudgetLocked']=True
    for side in [-1,1]:
        Box('Bumper_Mount'+str(side),(side*.46,2.28,FRONT_BUMPER_MOUNT_Z),(.08,.22,.08),'Chassis',ROOT,.007)
        rivetBack=FRONT_BUMPER_FACE_Y-.0003;rivetDepth=FRONT_BUMPER_RIVET_FRONT_Y-rivetBack
        for x in [side*.46,side*.70]:Cylinder('Bumper_Rivet'+str(x),(x,(rivetBack+FRONT_BUMPER_RIVET_FRONT_Y)/2,FRONT_BUMPER_CENTRE_Z),.013,rivetDepth,'Paint','Y',ROOT,6)
        Tube('Front_TowEye'+str(side),[(x,2.40,z+FRONT_TOW_EYE_LIFT_M) for x,z in [(side*.46,.47),(side*.46-.05,.42),(side*.46,.39),(side*.46+.05,.42),(side*.46,.47)]],.012,'Steel',ROOT,8)
    ROOT['FrontBumperCentreZM']=FRONT_BUMPER_CENTRE_Z
    ROOT['FrontBumperHeightM']=FRONT_BUMPER_HEIGHT_M
    ROOT['FrontBumperWidthM']=FRONT_BUMPER_WIDTH_M
    ROOT['FrontFenderCrownLiftM']=FRONT_FENDER_CROWN_LIFT_M
    ROOT['FrontTowEyeLiftM']=FRONT_TOW_EYE_LIFT_M
    ROOT['FrontBumperEvidence']='Original front blade upper/lower contrast edges at fixed camera,width and longitudinal extent.90mm blade height and mounting/eye contact reconstruction, not printed factory component dimensions.'
    # The actual lamp body/lens and army-star highlights independently locate
    # these parts in the photo. Keep the mudguard mounting feet fixed; lowering
    # the entire crossbar by the radiator correction would flatten its arch.
    for obj in ROOT.children_recursive:
        if obj.type!='MESH' or not obj.name.startswith(('Radiator_','Headlight_')):continue
        if obj.name.startswith(('Radiator_VerticalFin','Radiator_HorizontalBrace','Radiator_CenterMullion')):
            obj['PreserveRuntimeTopology']=True;obj['RuntimeBudgetLocked']=True
        for vertex in obj.data.vertices:
            if obj.name=='Radiator_ArmyStar':vertex.co.z-=FRONT_CROSSBAR_DROP_M
            elif obj.name.startswith('Radiator_'):
                vertex.co.z-=FRONT_RADIATOR_DROP_M;vertex.co.y-=FRONT_RADIATOR_REARWARD_M
                if not obj.name.startswith(('Radiator_FillerNeck','Radiator_FillerCap')):vertex.co.x*=FRONT_RADIATOR_WIDTH_SCALE
            else:
                side=1 if vertex.co.x>0 else -1;centre=Vector((side*FRONT_HEADLIGHT_ABS_X,2.17,1.30));vertex.co=centre+(vertex.co-centre)*FRONT_LAMP_SCALE
                vertex.co.z-=FRONT_HEADLIGHT_DROP_M;vertex.co.y+=FRONT_HEADLIGHT_FORWARD_M


def FitFrontFrameContacts():
    """Fit the narrower lamp bridge to the actual sheet-metal fender surface."""
    from mathutils.bvhtree import BVHTree
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();vertices=[];faces=[]
    for obj in ROOT.children_recursive:
        if obj.type!='MESH' or not obj.name.startswith('FrontFender_'):continue
        ev=obj.evaluated_get(deps);mesh=ev.to_mesh();offset=len(vertices);vertices.extend(obj.matrix_world@v.co for v in mesh.vertices);faces.extend(tuple(offset+i for i in p.vertices) for p in mesh.polygons);ev.to_mesh_clear()
    tree=BVHTree.FromPolygons(vertices,faces,all_triangles=False);feet={};barZ=1.14-.75*FRONT_CROSSBAR_DROP_M
    def AlignedCollar(name,point,direction,radius,depth):
        obj=Cylinder(name,tuple(point),radius,depth,'Paint','Z',ROOT,24);rotation=Vector((0,0,1)).rotation_difference(direction.normalized())
        for v in obj.data.vertices:v.co=point+rotation@(v.co-point)
        return obj
    for side in [-1,1]:
        hit,normal,face,distance=tree.ray_cast(Vector((side*FRONT_FRAME_FOOT_ABS_X,FRONT_FRAME_FOOT_Y,1.8)),Vector((0,0,-1)))
        if hit is None:raise RuntimeError('Lamp bridge anchor misses fender: '+str(side))
        if normal.z<0:normal=-normal
        feet[side]=hit+normal*.014;AlignedCollar('Headlight_FenderAnchor'+str(side),hit+normal*.004,normal,.026,.008)
        start=Vector((side*FRONT_HEADLIGHT_ABS_X,2.34,barZ));end=Vector((side*FRONT_HEADLIGHT_ABS_X,2.18+FRONT_HEADLIGHT_FORWARD_M,1.30-FRONT_HEADLIGHT_DROP_M-.06*FRONT_LAMP_SCALE))
        Tube('Headlight_Stalk'+str(side),[tuple(start),tuple(end)],.014,'Paint',ROOT,10);AlignedCollar('Headlight_StemCollar'+str(side),start,(end-start),.023,.018)
    Tube('Headlight_Crossbar',[tuple(feet[-1]),(-FRONT_HEADLIGHT_ABS_X,2.34,barZ),(0,2.375+FRONT_CROSSBAR_FORWARD_M,1.18-FRONT_CROSSBAR_DROP_M),(FRONT_HEADLIGHT_ABS_X,2.34,barZ),tuple(feet[1])],.020,'Paint',ROOT,12)
    ROOT['FrontFrameEvidence']='Approximate1936front-drawing proportions; fender anchor pads and bridge fitted to actual evaluated wing surfaces; hidden fastenings reconstructed'

def Cabin():
    # Fixed cabin shell, separate lower doors and open upper sliding-window apertures.
    Box('Cabin_Floor',(0,.65,.88),(1.47,1.08,.075),'Paint',ROOT,.012)
    Box('Cabin_RearLower',(0,.12,1.34),(1.50,.056,.88),'Paint',ROOT,.015)
    Box('Cabin_RearUpperLeft',(-.57,.12,1.945),(.36,.056,.40),'Paint',ROOT,.015)
    Box('Cabin_RearUpperRight',(.57,.12,1.945),(.36,.056,.40),'Paint',ROOT,.015)
    Box('Cabin_RearWindowBottom',(0,.12,1.775),(.83,.056,.065),'Paint',ROOT,.008)
    Box('Cabin_RearWindowTop',(0,.12,2.145),(.83,.056,.065),'Paint',ROOT,.008)
    Box('Cabin_RearGlass',(0,.12,1.96),(.79,.008,.30),'Glass',ROOT,.009)
    # A shaped bulkhead under the bonnet, not a cuboid protruding into the
    # quarter-round top leaves. All coordinates remain authoring metres.
    cowlVertices=[];cowlFaces=[];cowlRows=17;cowlRoofPoints=33;cowlRing=cowlRoofPoints+2
    cabOffset=.93-CAB_LONGITUDINAL_SCALE*1.17
    for row in range(cowlRows):
        v=row/(cowlRows-1);y=1.095+.15*v;worldY=CAB_LONGITUDINAL_SCALE*y+cabOffset
        t=max(0,min(1,(worldY-BONNET_WORLD_REAR_Y)/BONNET_WORLD_LENGTH))
        hoodWidth=.61-BONNET_TAPER_M*t;frontT=max(0,(CAB_LONGITUDINAL_SCALE*1.245+cabOffset-BONNET_WORLD_REAR_Y)/BONNET_WORLD_LENGTH)
        frontWidth=.61-BONNET_TAPER_M*frontT-.01;width=.715+(frontWidth-.715)*v
        top=BONNET_TOP_REAR_Z-BONNET_TOP_HEIGHT_DIFFERENCE*t;shoulder=BONNET_SHOULDER_REAR_Z-BONNET_SHOULDER_HEIGHT_DIFFERENCE*t
        cross=[(-width,1.22),(width,1.22)]
        for i in range(cowlRoofPoints):
            x=width*(1-2*i/(cowlRoofPoints-1));ratio=min(1,abs(x)/hoodWidth)
            z=top-(top-shoulder)*(1-math.sqrt(max(0,1-ratio*ratio)))-.04;cross.append((x,z))
        cowlVertices.extend((x,y,z) for x,z in cross)
    cowlFaces=[tuple(range(cowlRing)),tuple(reversed([(cowlRows-1)*cowlRing+i for i in range(cowlRing)]))]
    for row in range(cowlRows-1):
        for i in range(cowlRing):
            j=(i+1)%cowlRing;a=row*cowlRing+i;b=row*cowlRing+j;cowlFaces.append((a,a+cowlRing,b+cowlRing,b))
    cowl=Mesh('Cabin_Cowl',cowlVertices,cowlFaces,'Chassis',ROOT,True)
    for polygon in cowl.data.polygons[:2]:polygon.use_smooth=False
    Box('Cabin_Dashboard',(0,1.05,1.50),(1.39,.095,.26),'Paint',ROOT,.018)
    for side in [-1,1]:
        Tube('Cabin_Apost'+str(side),[(side*.73,1.17,1.57),(side*.73,1.10,2.13)],.024,'Paint',ROOT,12)
        Tube('Cabin_Bpost'+str(side),[(side*.75,.15,.94),(side*.75,.15,2.145)],.023,'Paint',ROOT,12)
        Tube('Windshield_LowerSeal'+str(side),[(side*.02,1.164,1.67),(side*.70,1.164,1.67)],.012,'Rubber',ROOT,8)
        Mesh('Windshield_Glass'+str(side),[(side*.022,1.165,1.685),(side*.702,1.165,1.685),(side*.702,1.103,2.12),(side*.022,1.103,2.12)],[(3,2,1,0)] if side>0 else [(0,1,2,3)],'Glass',ROOT)
    Tube('Windshield_CenterPost',[(0,1.18,1.64),(0,1.11,2.15)],.017,'Paint',ROOT,8)
    Tube('Windshield_UpperSeal',[(-.74,1.103,2.145),(.74,1.103,2.145)],.017,'Paint',ROOT,8)
    # Cambered metal cab roof with rolled overhang and a short flat rain visor.
    vertices=[]
    for j in range(17):
        y=.055+1.19*j/16
        for i in range(33):
            x=-.82+1.64*i/32;z=2.19+.060*(1-(x/.82)**4)-.025*j/16
            vertices.append((x,y,z))
    faces=[(j*33+i,j*33+i+1,(j+1)*33+i+1,(j+1)*33+i) for j in range(16) for i in range(32)]
    obj=Mesh('Cabin_CamberedRoof',vertices,faces,'Paint',ROOT,True);mod=obj.modifiers.new('RoofThickness','SOLIDIFY');mod.thickness=.013
    for side in [-1,1]:Tube('Cabin_RainGutter'+str(side),[(side*.82,.05,2.185),(side*.82,1.245,2.16)],.011,'Paint',ROOT,8)
    Tube('Cabin_RoofFrontLip',[(-.82,1.25,2.16),(0,1.25,2.22),(.82,1.25,2.16)],.009,'Paint',ROOT,8)
    for side in [-1,1]:
        name='Left' if side<0 else 'Right';door=Pivot('Door_'+name,(side*DOOR_HINGE_ABS_X,DOOR_HINGE_RAW_Y,1.19),ROOT,'Z',[0,78])
        PlateYZ('DoorPanel_'+name,side*.748,[(.18,.96),(1.13,.96),(1.13,1.65),(.18,1.65)],.034,'Paint',door,.012)
        # Stepped outer pressing, narrow lower sill and two side-window frames.
        PlateYZ('DoorLowerPressing_'+name,side*.770,[(.25,1.01),(1.06,1.01),(1.06,1.27),(.25,1.27)],.007,'Paint',door,.016)
        Tube('Door_WindowRearFrame'+name,[(side*.75,.19,1.64),(side*.75,.19,2.13)],.017,'Paint',door,8)
        Tube('Door_WindowFrontFrame'+name,[(side*.75,1.10,1.64),(side*.75,1.08,2.115)],.017,'Paint',door,8)
        Tube('Door_WindowUpperFrame'+name,[(side*.75,.19,2.135),(side*.75,1.08,2.115)],.017,'Paint',door,8)
        Tube('Door_WindowLowerChannel'+name,[(side*.777,.20,1.65),(side*.777,1.10,1.65)],.012,'Paint',door,8)
        for z in [1.11,1.49]:
            Cylinder('Door_Hinge'+name+str(z),(side*DOOR_HINGE_ABS_X,DOOR_HINGE_RAW_Y,z),.017,.075,'Steel','Z',door,16)
            Box('Door_HingeLeaf'+name+str(z),(side*.777,1.087,z),(.011,.10,.052),'Paint',door,.003)
        Cylinder('Door_HandleBoss'+name,(side*.785,.34,1.51),.023,.018,'Steel','X',door,20)
        Tube('Door_Handle'+name,[(side*.804,.34,1.51),(side*.823,.30,1.51),(side*.823,.23,1.51)],.010,'Steel',door,8)
        Box('Door_InnerTrim'+name,(side*.723,.66,1.32),(.012,.80,.48),'Paint',door,.016)
        Tube('Door_InteriorPull'+name,[(side*.705,.51,1.45),(side*.68,.51,1.41),(side*.68,.65,1.41),(side*.705,.65,1.45)],.012,'Leather',door,10)
        inset=MIRROR_NEAR_HEAD_INSET_M if side>0 else 0;headX=side*1.015-inset;midX=side*.97-inset*.5
        mirrors=[Tube('Mirror_Stalk'+name,[(side*.77,1.12,1.91),(midX,1.17,1.98-MIRROR_HEAD_DROP_M),(headX,1.17,2.015-MIRROR_HEAD_DROP_M)],MIRROR_STALK_RADIUS_M,'Paint',ROOT,10),Cylinder('Mirror_Back'+name,(headX,1.175,2.03-MIRROR_HEAD_DROP_M),.060,.014,'Paint','Y',ROOT,32),Cylinder('Mirror_Glass'+name,(headX,1.164,2.03-MIRROR_HEAD_DROP_M),.052,.004,'Steel','Y',ROOT,32)]
        for obj in mirrors:obj['PreserveRuntimeTopology']=True;obj['RuntimeBudgetLocked']=True
    ROOT['MirrorHeadDropM']=MIRROR_HEAD_DROP_M;ROOT['MirrorStalkRadiusM']=MIRROR_STALK_RADIUS_M
    ROOT['MirrorNearHeadInsetM']=MIRROR_NEAR_HEAD_INSET_M
    ROOT['MirrorReconstructionEvidence']='Approximate near-side mirror centre in primary photograph;40mm head lowering,40mm near-head inward adjustment and16mm stalk diameter reconstructed. Near stalk base retained. Far configuration and camera remain unproven.'
    # Two upholstered cushions, metal seat frame and right-hand steering.
    Box('Cabin_BenchCushion',(0,.43,1.10),(1.29,.54,.19),'Leather',ROOT,.06)
    back=Box('Cabin_BenchBack',(0,.20,1.39),(1.29,.15,.48),'Leather',ROOT,.06)
    for x in [-.52,.52]:Tube('Cabin_SeatFrame'+str(x),[(x,.23,.93),(x,.23,1.10),(x,.69,1.10),(x,.69,.93)],.018,'Chassis',ROOT,10)
    for x in [-.38,.38]:
        for y in [.31,.55]:Cylinder('Cabin_SeatButton'+str(x)+str(y),(x,y,1.198),.011,.004,'Leather','Z',ROOT,16)
    columnLowerY=.74+(.13/.155)*.47/CAB_LONGITUDINAL_SCALE
    Tube('Steering_Column',[(.42,columnLowerY,1.18),(.42,.74,1.65)],.024,'Chassis',ROOT,16)
    # Steering wheel lives in its own inclined frame.
    steering=Pivot('SteeringWheel',(.42,.74,1.65),ROOT,'Z',[-540,540])
    steering.matrix_world=Matrix.Translation(Vector((.42,.74,1.65)))@Matrix.Rotation(math.atan2(.13,.155),4,'X')
    points=[(.42+.205*math.cos(2*PI*i/64),.74+.155*math.sin(2*PI*i/64),1.65+.13*math.sin(2*PI*i/64)) for i in range(65)]
    Tube('Steering_Rim',points,.013,'Leather',steering,10)
    for a in [PI/2,PI*7/6,PI*11/6]:Tube('Steering_Spoke'+str(a),[(.42,.74,1.65),(.42+.197*math.cos(a),.74+.15*math.sin(a),1.65+.125*math.sin(a))],.010,'Steel',steering,8)
    Sphere('Steering_HornButton',(.42,.74,1.65),(.041,.030,.033),'Chassis',steering,24,12)
    for x,y,h in [(.02,.72,.52),(-.17,.65,.42),(.17,.55,.37)]:
        Tube('Cabin_GearLever'+str(x),[(x,y,.93),(x,y-.06,.93+h)],.010,'Steel',ROOT,10)
        Sphere('Cabin_GearKnob'+str(x),(x,y-.06,.93+h),(.026,.026,.026),'Rubber',ROOT,20,10)
    for x in [.25,.40,.55]:Box('Cabin_Pedal'+str(x),(x,.99,.99),(.070,.13,.018),'Rubber',ROOT,.005)
    for x,r in [(.39,.066),(.20,.032),(.57,.032),(-.10,.028)]:
        Cylinder('Dashboard_InstrumentBezel'+str(x),(x,.994,1.52),r,.011,'Steel','Y',ROOT,48)
        Cylinder('Dashboard_InstrumentFace'+str(x),(x,.984,1.52),r*.88,.005,'Dark','Y',ROOT,48)
        Tube('Dashboard_InstrumentNeedle'+str(x),[(x,.978,1.52),(x-r*.43,.978,1.52+r*.47)],.0017,'Stencil',ROOT,4)
        for k in range(10):
            a=2*PI*k/12;Tube('Dashboard_Tick'+str(x)+str(k),[(x+r*.72*math.cos(a),.977,1.52+r*.72*math.sin(a)),(x+r*.80*math.cos(a),.977,1.52+r*.80*math.sin(a))],.0011,'Stencil',ROOT,4)
    for x in [-.50,-.38,-.26]:Cylinder('Dashboard_PullSwitch'+str(x),(x,.973,1.47),.014,.035,'Rubber','Y',ROOT,16)
    for side in [-1,1]:
        Tube('Windshield_WiperArm'+str(side),[(side*.38,1.105,2.10),(side*.26,1.151,1.86)],.005,'Steel',ROOT,6)
        Tube('Windshield_WiperBlade'+str(side),[(side*.26-.14,1.153,1.86),(side*.26+.14,1.153,1.86)],.007,'Rubber',ROOT,6)

def Engine():
    def Bezier(p0,p1,p2,p3,steps=8):
        p0,p1,p2,p3=map(Vector,(p0,p1,p2,p3))
        return [tuple((1-t)**3*p0+3*(1-t)**2*t*p1+3*(1-t)*t*t*p2+t**3*p3) for t in [i/steps for i in range(steps+1)]]
    Box('Engine_Block',(0,1.71,1.05),(.42,.75,.39),'Chassis',ROOT,.043)
    Box('Engine_CylinderHead',(0,1.71,1.30),(.37,.77,.11),'Steel',ROOT,.022)
    Box('Engine_HeadGasketJoint',(0,1.71,1.245),(.418,.772,.008),'Chassis',ROOT,.002)
    # The factory photographs show a flat side-valve head, not an OHV cover.
    Box('Engine_FlatHeadTop',(0,1.71,1.363),(.36,.74,.026),'Steel',ROOT,.009)
    Box('Engine_OilPan',(0,1.71,.80),(.34,.81,.15),'Chassis',ROOT,.035)
    Box('Engine_OilPanFlange',(0,1.71,.877),(.44,.84,.026),'Steel',ROOT,.006)
    for y in [1.34,1.47,1.60,1.73,1.86,1.99,2.10]:
        for side in [-1,1]:Bolt('Engine_PanBolt'+str(y)+str(side),(side*.199,y,.893),'Z',ROOT,.009,'Steel')
    Cylinder('Engine_Distributor',(.245,1.43,1.265),.045,.09,'Rubber','Z',ROOT,24)
    # The two original engine photographs show a broad cast front return, not
    # a thin straight pipe. This is its exterior envelope, not passage CAD.
    path=[(-.287,1.38,1.18),(-.287,1.56,1.18),(-.287,1.76,1.18),(-.287,1.92,1.18)]
    path+=Bezier(path[-1],(-.287,2.03,1.18),(-.287,2.055,1.14),(-.287,2.055,1.08))[1:]
    path+=Bezier(path[-1],(-.287,2.055,.995),(-.287,2.015,.995),(-.287,1.94,.995))[1:]
    # The centreline is planar. Keep the lateral section basis fixed through
    # the full return; the general tube's up-axis switch twists this elbow.
    points=[Vector(p) for p in path];vertices=[];segments=16
    for index,point in enumerate(points):
        tangent=(points[min(index+1,len(points)-1)]-points[max(0,index-1)]).normalized()
        lateral=Vector((1,0,0));radial=tangent.cross(lateral).normalized()
        for k in range(segments):
            angle=2*PI*k/segments
            vertices.append(tuple(point+.050*math.cos(angle)*lateral+.055*math.sin(angle)*radial))
    faces=[(j*segments+k,j*segments+(k+1)%segments,(j+1)*segments+(k+1)%segments,(j+1)*segments+k) for j in range(len(points)-1) for k in range(segments)]
    faces += [tuple(range(segments-1,-1,-1)),tuple((len(points)-1)*segments+k for k in range(segments))]
    Mesh('Engine_ExhaustManifold',vertices,faces,'Chassis',ROOT,True)
    Tube('Engine_ExhaustDownpipe',[(-.287,1.36,1.17),(-.33,1.30,1.05),(-.38,1.28,.86)],.025,'Chassis',ROOT,12)
    Cylinder('Engine_CarburetorBody',(-.31,1.40,1.055),.045,.14,'Chassis','Z',ROOT,24)
    Cylinder('Engine_CarburetorNeck',(-.31,1.40,1.135),.026,.05,'Steel','Z',ROOT,20)
    Box('Engine_CarburetorFoot',(-.31,1.40,.989),(.112,.102,.024),'Chassis',ROOT,.006)
    for j in range(6):
        y=1.43+j*.105
        Cylinder('Engine_SparkPlug'+str(j),(-.08,y,1.392),.012,.040,'Light','Z',ROOT,16)
        angle=2*PI*j/6;terminal=(.245+.025*math.cos(angle),1.43+.025*math.sin(angle),1.318)
        middle=(.24,y-.025,1.385)
        wire=Bezier((-.08,y,1.414),(-.02,y,1.440),(.16,y-.01,1.455),middle)
        wire+=Bezier(middle,(.275,y-.06,1.33),(.285,terminal[1]+.015,1.29),terminal)[1:]
        Tube('Engine_IgnitionLead'+str(j),wire,.0045,'Rubber',ROOT,6)
        Cylinder('Engine_IgnitionBoot'+str(j),(-.08,y,1.414),.009,.015,'Rubber','Z',ROOT,12)
        Cylinder('Engine_DistributorTerminal'+str(j),(terminal[0],terminal[1],1.315),.009,.018,'Rubber','Z',ROOT,12)
        Tube('Engine_ExhaustBranch'+str(j),[(-.21,y,1.235),(-.26,y,1.235),(-.287,y,1.17)],.023,'Chassis',ROOT,10)
        for side in [-1,1]:Bolt('Engine_HeadStud'+str(j)+str(side),(side*.151,y,1.386),'Z',ROOT,.010,'Steel')
    Box('Engine_SideValveChamberCover',(-.224,1.71,1.10),(.026,.62,.22),'Chassis',ROOT,.012)
    for y in [1.43,1.71,1.99]:
        for z in [1.025,1.175]:Bolt('Engine_SideCoverBolt'+str(y)+str(z),(-.241,y,z),'X',ROOT,.009,'Steel')
    for index,y in enumerate([1.48,1.69,1.90]):Box('Engine_BlockSideRib'+str(index),(.2175,y,1.115),(.015,.030,.246),'Chassis',ROOT,.003)
    Box('Engine_BlockSideUpperLedge',(.214,1.71,1.242),(.018,.76,.012),'Chassis',ROOT,.003)
    # Preserve the1.240m mounting base and diameter; trim only4mm from the
    # reconstructed canister top to clear the actual reduced closed hood.
    Cylinder('Engine_AirCleaner',(-.26,1.72,1.348),.085,.216,'Chassis','Z',ROOT,32)
    Tube('Engine_IntakeHose',[(-.26,1.72,1.39),(-.23,1.92,1.41),(0,1.92,1.37)],.035,'Rubber',ROOT,12)
    # Reconstructed45mm hose keeps both ports and clears both the actual
    # reduced closed bonnet and the complete360degree fan sweep.
    hose=Tube('Engine_CoolantHose',[(0,2.32,1.425),(.10,2.25,1.42),(.13,2.205,1.40),(.13,2.155,1.39),(.08,2.08,1.38),(0,2.02,1.38)],.0225,'Rubber',ROOT,12)
    hose['PreserveRuntimeTopology']=True;hose['RuntimeBudgetLocked']=True
    Cylinder('Engine_CrankPulley',(0,2.13,.925),.083,.045,'Steel','Y',ROOT,40)
    Cylinder('Engine_FanPulley',(0,2.13,1.17),.052,.04,'Steel','Y',ROOT,32)
    Cylinder('Engine_CrankSnout',(0,2.105,.925),.025,.05,'Steel','Y',ROOT,24)
    Cylinder('Engine_FanShaft',(0,2.145,1.17),.025,.10,'Steel','Y',ROOT,24)
    spread=math.acos((.083-.052)/(1.17-.925));hi=PI*.5+spread;lo=PI*.5-spread
    belt=[(.083*math.cos(hi),2.141,.925+.083*math.sin(hi))]
    for k in range(17):
        a=hi+(lo-hi)*k/16;belt.append((.052*math.cos(a),2.141,1.17+.052*math.sin(a)))
    for k in range(17):
        a=lo+(hi-2*PI-lo)*k/16;belt.append((.083*math.cos(a),2.141,.925+.083*math.sin(a)))
    beltPoints=[Vector(p) for p in belt[:-1]];vertices=[]
    for index,point in enumerate(beltPoints):
        tangent=(beltPoints[(index+1)%len(beltPoints)]-beltPoints[(index-1)%len(beltPoints)]).normalized();radial=tangent.cross(Vector((0,1,0))).normalized()
        for k in range(6):
            angle=2*PI*k/6;vertices.append(tuple(point+radial*(.004*math.cos(angle))+Vector((0,.0055*math.sin(angle),0))))
    faces=[(j*6+k,j*6+(k+1)%6,((j+1)%len(beltPoints))*6+(k+1)%6,((j+1)%len(beltPoints))*6+k) for j in range(len(beltPoints)) for k in range(6)]
    Mesh('Engine_FanBelt',vertices,faces,'Rubber',ROOT,True)
    dynamoX=.305;dynamoPulleyRadius=.050
    Cylinder('Engine_Dynamo',(dynamoX,1.99,1.18),.065,.14,'Chassis','Y',ROOT,40)
    Cylinder('Engine_DynamoPulley',(dynamoX,2.13,1.18),dynamoPulleyRadius,.025,'Steel','Y',ROOT,32)
    Cylinder('Engine_DynamoShaft',(dynamoX,2.09,1.18),.018,.085,'Steel','Y',ROOT,24)
    for y in [1.94,2.04]:RevolveY('Engine_DynamoBand'+str(y),(dynamoX,y,1.18),[(.0645,-.008),(.0685,-.008),(.0685,.008),(.0645,.008)],'Steel',ROOT,closed=True,segments=32)
    for y in [1.92,2.05]:Tube('Engine_DynamoBracket'+str(y),[(.21,y,1.105),(dynamoX,y,1.105)],.014,'Steel',ROOT,8)
    profile=[(-.17,.83),(.17,.83),(.19,.92),(.18,1.04),(.10,1.13),(.08,1.23),(-.08,1.23),(-.12,1.16),(-.18,1.05),(-.19,.93)]
    n=len(profile);vertices=[(x,y,z) for y in [2.0725,2.0975] for x,z in profile]
    faces=[tuple(range(n)),tuple(reversed(range(n,2*n)))]+[(i,i+n,(i+1)%n+n,(i+1)%n) for i in range(n)]
    Bevel(Mesh('Engine_TimingCover',vertices,faces,'Chassis',ROOT),.008,3)
    for index,(x,z) in enumerate([(-.145,.86),(.145,.86),(-.165,1.02),(.165,1.02),(-.065,1.195),(.065,1.195)]):Bolt('Engine_TimingCoverBolt'+str(index),(x,2.104,z),'Y',ROOT,.009,'Steel')
    Cylinder('Engine_FanHub',(0,2.18,1.17),.052,.035,'Steel','Y',ROOT,32)
    # Six separate paddles can be resolved in both original engine photographs.
    for k in range(6):
        a=k*PI/3;radial=Vector((math.sin(a),0,math.cos(a)));chord=Vector((math.cos(a),0,-math.sin(a)));vertices=[]
        for r,width in [(.045,.035),(.09,.065),(.16,.070),(.21,.065)]:
            sweep=.025*(r-.045)/(.21-.045)
            for edge in [-.5,.5]:
                point=Vector((0,2.18,1.17))+radial*r+chord*(sweep+edge*width);point.y+=edge*width*math.tan(math.radians(18));vertices.append(tuple(point))
        blade=Mesh('Engine_FanBlade'+str(k),vertices,[(j*2,j*2+1,j*2+3,j*2+2) for j in range(3)],'Chassis',ROOT,True)
        solid=blade.modifiers.new('PressedFanSheet','SOLIDIFY');solid.thickness=.0025;blade['PreserveRuntimeTopology']=True;blade['RuntimeBudgetLocked']=True
    Box('Engine_Battery',(-.40,1.13,1.02),(.23,.24,.19),'Rubber',ROOT,.014)
    # The original engine photographs show a full rear coupling housing and
    # the dynamo on the opposite visible side to the curved manifold. Exact
    # installed dimensions remain photographic reconstruction.
    for obj in list(ROOT.children_recursive):
        if obj.type!='MESH' or not obj.name.startswith('Engine_') or obj.name=='Engine_Battery':continue
        rigid=obj.name.startswith(('Engine_SparkPlug','Engine_HeadStud','Engine_PanBolt','Engine_SideCoverBolt','Engine_IgnitionBoot','Engine_DistributorTerminal','Engine_TimingCoverBolt'))
        centerY=sum(v.co.y for v in obj.data.vertices)/len(obj.data.vertices)
        for vertex in obj.data.vertices:
            vertex.co.y+=.2*(centerY-2.18) if rigid else .2*(vertex.co.y-2.18)
    Cylinder('Engine_ClutchBellHousing',(0,.98,.925),.15,.34,'Chassis','Y',ROOT,48,radius2=.23)
    Cylinder('Engine_GearboxInput',(0,.75,.925),.045,.15,'Steel','Y',ROOT,24)
    Cylinder('Engine_Starter',(.245,1.00,.99),.055,.24,'Chassis','Y',ROOT,32)
    Cylinder('Engine_StarterFlange',(.245,1.13,.99),.067,.025,'Steel','Y',ROOT,32)
    Cylinder('Engine_StarterTerminal',(.245,1.02,1.052),.013,.025,'Rubber','Z',ROOT,16)
    for side in [-1,1]:Tube('Engine_RearMount'+str(side),[(side*.20,1.14,.94),(side*.38,1.14,.77),(side*.46,1.14,.73)],.018,'Chassis',ROOT,10)
    Tube('Engine_ExhaustCrossover',[(-.38,1.10,.86),(-.38,.98,.50),(.38,.72,.45),(.38,-.275,.45)],.025,'Chassis',ROOT,12)
    # Two pulley tangent runs and both wraps form one complete dynamo belt.
    dx=dynamoX;dz=1.18-.925;length=math.hypot(dx,dz);angle=math.atan2(dz,dx);spread=math.acos((.083-dynamoPulleyRadius)/length)
    hi=angle+spread;lo=angle-spread;path=[]
    path.append((.083*math.cos(hi),2.124,.925+.083*math.sin(hi)))
    for j in range(25):
        t=hi+(lo-hi)*j/24;path.append((dx+dynamoPulleyRadius*math.cos(t),2.124,1.18+dynamoPulleyRadius*math.sin(t)))
    for j in range(25):
        t=lo+(hi-2*PI-lo)*j/24;path.append((.083*math.cos(t),2.124,.925+.083*math.sin(t)))
    pts=[Vector(p) for p in path[:-1]];vertices=[]
    for index,point in enumerate(pts):
        tangent=(pts[(index+1)%len(pts)]-pts[(index-1)%len(pts)]).normalized()
        radial=tangent.cross(Vector((0,1,0))).normalized()
        for k in range(6):
            theta=2*PI*k/6
            vertices.append(tuple(point+radial*(.004*math.cos(theta))+Vector((0,.006*math.sin(theta),0))))
    faces=[(j*6+k,j*6+(k+1)%6,((j+1)%len(pts))*6+(k+1)%6,((j+1)%len(pts))*6+k) for j in range(len(pts)) for k in range(6)]
    Mesh('Engine_DynamoBelt',vertices,faces,'Rubber',ROOT,True)
    ROOT['EngineLongitudinalPhotoScale']=1.2
    ROOT['EngineAirCleanerBottomM']=1.24
    ROOT['EngineAirCleanerTopM']=1.456
    ROOT['EngineAirCleanerTopTrimM']=.004
    ROOT['EngineFanBladeCount']=6
    ROOT['EngineCoolantHoseDiameterM']=.045
    ROOT['EngineAccessoryEvidence']='Factory two-sided photographs show six separate fan paddles and inform cast manifold envelope, crossed ignition wiring and front-drive parts; passages, installed dimensions, exact routing and unseen details reconstructed.'

def Cargo():
    cargo=Pivot('CargoBed',(0,0,0),ROOT)
    for x in [-.58,.58]:Box('Cargo_LongitudinalBeam'+str(x),(x,-1.20,.84),(.11,2.95,.18),'Wood',cargo,.010)
    for y in [-2.52,-1.85,-1.12,-.40,.17]:Box('Cargo_CrossBearer'+str(y),(0,y,.92),(1.82,.09,.12),'Wood',cargo,.007)
    for k in range(13):Box('Cargo_FloorPlank'+str(k),(-.84+k*.14,-1.20,1.005),(.137,2.90,.052),'Wood',cargo,.003)
    for side in [-1,1]:
        for row in range(3):Box('Cargo_SidePlank'+str(side)+'_'+str(row),(side*.8975,-1.21,1.12+row*.147),(.045,2.96,.140),'Wood',cargo,.003)
        for y in [.245-2.875*k/CANVAS_BAYS for k in range(CANVAS_BAYS+1)]:
            Box('Cargo_SteelUpright'+str(side)+str(y),(side*.928,y,1.27),(.044,.045,.52),'Paint',cargo,.004)
            for z in [1.12,1.28,1.43]:Cylinder('Cargo_CarriageBolt'+str(side)+str(y)+str(z),(side*.948,y,z),.009,.004,'Paint','X',cargo,8)
            Tube('Cargo_RopeHook'+str(side)+str(y),[(side*.932,y,1.09),(side*.943,y,1.02),(side*.943,y+.045,1.045)],.007,'Steel',cargo,8)
        Box('Cargo_TopRail'+str(side),(side*.916,-1.195,1.52),(.068,3.01,.068),'Paint',cargo,.006)
    for row in range(4):Box('Cargo_FrontBoard'+str(row),(0,.269,1.105+row*.145),(1.78,.044,.14),'Wood',cargo,.003)
    for x in [-.80,0,.80]:Box('Cargo_FrontUpright'+str(x),(x,.295,1.32),(.05,.025,.62),'Paint',cargo,.004)
    tail=Pivot('Tailgate',(0,TAILGATE_AXIS_RAW_Y,1.065),ROOT,'X',[0,100])
    for row in range(3):Box('Tailgate_Plank'+str(row),(0,-2.672,1.14+row*.145),(1.79,.045,.14),'Wood',tail,.003)
    for x in [-.76,-.30,.30,.76]:
        Box('Tailgate_Strap'+str(x),(x,-2.705,1.32),(.045,.025,.50),'Paint',tail,.003)
        for z in [1.13,1.28,1.43]:Bolt('Tailgate_Bolt'+str(x)+str(z),(x,-2.728,z),'Y',tail,.008,'Paint')
    for x in [-.65,.65]:
        Cylinder('Tailgate_Hinge'+str(x),(x,TAILGATE_AXIS_RAW_Y,1.065),.023,.16,'Steel','X',tail,24)
        Box('Tailgate_HingeLeaf'+str(x),(x,-2.72,1.14),(.072,.018,.19),'Paint',tail,.004)
    for side in [-1,1]:
        Tube('Tailgate_Latch'+str(side),[(side*.88,-2.72,1.46),(side*.91,-2.72,1.48),(side*.94,-2.68,1.49)],.009,'Steel',tail,8)
    for side in [-1,1]:
        Box('Rear_LampBracket'+str(side),(side*.68,-2.53,.87),(.12,.16,.05),'Chassis',ROOT,.004)
        Cylinder('Rear_LampHousing'+str(side),(side*.68,-2.63,.87),.046,.06,'Paint','Y',ROOT,32)
        Cylinder('Rear_LampLens'+str(side),(side*.68,-2.663,.87),.037,.009,'Light','Y',ROOT,32)
    Tube('Rear_TowLoop',[(-.055,-2.58,.57),(-.065,-2.67,.52),(0,-2.695,.49),(.065,-2.67,.52),(.055,-2.58,.57)],.017,'Steel',ROOT,12)

def Canvas():
    canvas=Pivot('CargoCanvas',(0,0,0),ROOT);canvas['VisibilityControl']=True
    # Cross-section is a rounded-shoulder rectangle rather than a cylindrical tarp.
    cross=[(-.918,1.51),(-.925,1.81),(-.923,2.17),(-.902,2.41),(-.856,2.53),(-.75,2.60),(-.53,2.64),(0,2.655),(.53,2.64),(.75,2.60),(.856,2.53),(.902,2.41),(.923,2.17),(.925,1.81),(.918,1.51)]
    def Drape(x,z,t,tension=True):
        h=max(0,min(1,(z-1.51)/1.145));side=1 if x>0 else -1
        phase=t*CANVAS_BAYS%1;between=math.sin(PI*phase)**2
        sideWeight=max(0,min(1,(abs(x)-.62)/.28))
        # Broad hanging volume and converging diagonal folds carry gravity and
        # tie tension. Microtexture cannot substitute for these centimetre folds.
        fan=0;pin=0
        for k in range(CANVAS_BAYS+1):
            d=(t-k/CANVAS_BAYS)*2.78;reach=.10+.43*h
            fan+=.019*math.sin(2*PI*d/(.115+.13*h)+.35)*math.exp(-(d/reach)**2)*math.exp(-h*1.7)
            pin+=math.exp(-(d/.055)**2)
        hanging=.025*between*math.sin(PI*h)+.013*math.sin(2*PI*(2.2*phase+.18)+h*.7)*(1-h)*math.sin(PI*phase)
        # Persistent set wrinkles in used heavy canvas. All bow planes and
        # lower sewn boundaries remain pinned; hidden-side ageing is inferred.
        setWrinkle=.0055*between*math.sin(PI*h)*math.sin(3*PI*phase+1.2*h+.45*side)
        # Diagonal creases descend from the front lower window corners toward
        # the lower tie rows. Fade before the bow centres and attachment hems.
        # Free window flaps remain separate from this main-sheet tension field.
        fold=0
        if tension:
            def Smooth(value):
                value=max(0,min(1,value));return value*value*(3-2*value)
            envelope=Smooth((h-.16)/.12)*(1-Smooth((h-.47)/.19))
            for k,windowFrontY in [(1,-.4675),(2,-1.4467)]:
                target=(.16-windowFrontY)/2.78
                centre=k/3+(target-k/3)*Smooth((h-.10)/.32)
                d=(t-centre)*2.78
                fold-=.045*envelope*math.exp(-(d/.045)**2)
        dx=side*sideWeight*(hanging+fan+fold+setWrinkle-.025*pin*(1-h)**3)
        dz=-between*(.019*(1-h)+.061*h**3)+.005*math.sin(phase*2*PI+h*4)*(1-h)*sideWeight
        dz+=.0035*between*h**3*math.sin(x*7.5+phase*5.1+.4*side)
        return (x+dx,.16-2.78*t,z+dz)
    def SideX(z):
        positive=cross[len(cross)//2:]
        for (x0,z0),(x1,z1) in zip(positive,positive[1:]):
            if z1<=z<=z0:return x0+(x1-x0)*(z-z0)/(z1-z0)
        return .918
    # Linear subdivided cross profile preserves the squarish period silhouette.
    dense=[]
    for i in range(len(cross)-1):
        for j in range(6):
            t=j/6;dense.append((cross[i][0]*(1-t)+cross[i+1][0]*t,cross[i][1]*(1-t)+cross[i+1][1]*t))
    dense.append(cross[-1]);nx=len(dense);ny=97;vertices=[]
    for j in range(ny):
        t=j/(ny-1);y=.16-2.78*t
        for i,(x,z) in enumerate(dense):
            vertices.append(Drape(x,z,t))
    faces=[(j*nx+i,(j+1)*nx+i,(j+1)*nx+i+1,j*nx+i+1) for j in range(ny-1) for i in range(nx-1)]
    obj=Mesh('Canvas_MainCover',vertices,faces,'Canvas',canvas,True);mod=obj.modifiers.new('CanvasThickness','SOLIDIFY');mod.thickness=.004
    # Front and rear curtains use a panel grid to keep actual gravity creases.
    for end,y in [('Rear',-2.62)]:
        verts=[];faces=[]
        for j in range(41):
            h=j/40;z=1.53+1.124*h
            width=SideX(z)
            for i in range(49):
                u=i/48;x=-width+2*width*u
                p=Drape(x,z,1)
                ripple=(.010*math.sin(u*61+h*10)+.015*math.sin(u*29-h*13)*math.sin(PI*u))*(1-h)*math.sin(PI*u)
                verts.append((p[0],y+ripple,p[2]+.008*math.sin(u*30)*(1-h)*math.sin(PI*u)))
        for j in range(40):
            for i in range(48):a=j*49+i;faces.append((a,a+1,a+50,a+49))
        if end=='Front':faces=[tuple(reversed(f)) for f in faces]
        obj=Mesh('Canvas_'+end+'Curtain',verts,faces,'Canvas',canvas,True);mod=obj.modifiers.new('CurtainThickness','SOLIDIFY');mod.thickness=.003
        obj['BoundaryEvidence']='Rear curtain follows shared main-cover cross-section and rear plane; hidden seam/tailoring reconstructed'
        Tube('Canvas_'+end+'VerticalLap',[(0,y-.006,1.55),(0,y-.006,2.64)],.009,'Canvas',canvas,6)
    # The original dark mouth starts below the outer roof edge. Preserve its
    # broad cloth header and rolled lower hem rather than opening to the roof.
    def HeaderTop(x):
        x=abs(x);section=[(0,2.655),(.53,2.64),(.75,2.60),(.856,2.53),(.902,2.41)]
        for (x0,z0),(x1,z1) in zip(section,section[1:]):
            if x<=x1:return z0+(z1-z0)*(x-x0)/(x1-x0)
        return 2.41
    def HeaderBottom(x):
        t=x/CANOPY_FRONT_OPENING_HALF_M
        return CANOPY_FRONT_CURTAIN_EDGE_RAW_Z-CANOPY_FRONT_CURTAIN_SAG_M*(1-t*t)+CANOPY_FRONT_CURTAIN_TILT_M*t
    vertices=[];rows=10;cols=64
    for row in range(rows+1):
        t=row/rows
        for col in range(cols+1):
            upperX=-.90+1.80*col/cols;lowerX=upperX*CANOPY_FRONT_OPENING_HALF_M/.90
            # Retain the sewn outer edge; the interior gets the primary-photo
            # diagonal field below instead of unrelated periodic corrugations.
            edgeRipple=1-min(1,32*min(col/cols,1-col/cols))
            x=upperX*(1-t)+lowerX*t;z=HeaderTop(upperX)*(1-t)+HeaderBottom(lowerX)*t+.006*math.sin(upperX*43+t*9)*math.sin(PI*t)*edgeRipple
            y=.145+.015*math.sin(PI*t)+.007*math.sin(upperX*31+t*5)*math.sin(PI*t)*edgeRipple;vertices.append((x,y,z))
    faces=[(row*(cols+1)+col,row*(cols+1)+col+1,(row+1)*(cols+1)+col+1,(row+1)*(cols+1)+col) for row in range(rows) for col in range(cols)]
    header=Mesh('Canvas_FrontHeaderValance',vertices,faces,'Canvas',canvas,True);solid=header.modifiers.new('HeaderClothThickness','SOLIDIFY');solid.thickness=.003
    header['Evidence']='Broad light cloth band above the photographed dark mouth; unseen folds and retaining hardware reconstructed'
    Tube('Canvas_FrontRolledCurtain',[(x,.150,HeaderBottom(x)) for x in [-CANOPY_FRONT_OPENING_HALF_M+2*CANOPY_FRONT_OPENING_HALF_M*j/64 for j in range(65)]],.032,'Canvas',canvas,12)
    for tieLabel in [-.58,0,.58]:
        x=tieLabel*CANOPY_FRONT_OPENING_HALF_M/.89
        Tube('Canvas_FrontRollTie'+str(tieLabel),[(x,.150+.034*math.cos(2*PI*i/24),HeaderBottom(x)+.034*math.sin(2*PI*i/24)) for i in range(25)],.0045,'Canvas',canvas,6)
    for side in [-1,1]:
        vertices=[]
        for j in range(17):
            t=j/16
            for i in range(9):
                u=i/8;oldX=.89+.025*math.sin(PI*t)+.018*math.sin(PI*u)*t
                innerX=CANOPY_FRONT_OPENING_HALF_M+(.92-CANOPY_FRONT_OPENING_HALF_M)*u+.012*math.sin(PI*u)*math.sin(PI*t)
                blend=max(0,min(1,t/.35));blend=blend*blend*(3-2*blend)
                x=side*(oldX+(innerX-oldX)*blend);y=.145-CANOPY_FRONT_CORNER_FOLD_DEPTH_M*u-.022*math.sin(PI*t);z=2.54-.36*t+.018*math.sin(PI*u)*t
                vertices.append((x,y,z))
        faces=[(j*9+i,j*9+i+1,(j+1)*9+i+1,(j+1)*9+i) for j in range(16) for i in range(8)]
        obj=Mesh('Canvas_FrontCornerFold'+str(side),vertices,faces,'Canvas',canvas,True);modifier=obj.modifiers.new('FoldedCanvasThickness','SOLIDIFY');modifier.thickness=.003
    ROOT['CanvasFrontOpeningWidthM']=2*CANOPY_FRONT_OPENING_HALF_M
    ROOT['CanvasFrontCurtainEdgeRawZ']=CANOPY_FRONT_CURTAIN_EDGE_RAW_Z
    ROOT['CanvasFrontCurtainSagM']=CANOPY_FRONT_CURTAIN_SAG_M
    ROOT['CanvasFrontCurtainTiltM']=CANOPY_FRONT_CURTAIN_TILT_M
    ROOT['CanvasFrontCornerFoldDepthM']=CANOPY_FRONT_CORNER_FOLD_DEPTH_M
    ROOT['CanvasFrontMouthEvidence']='Original600x410 positive valance-to-dark-mouth edge; narrower roll and unequal suspension heights reconstructed. Hidden folds and ties are not factory tailoring measurements.'
    for side in [-1,1]:
        Tube('Canvas_LowerBoundHem'+str(side),[(p[0]+side*.004,p[1],p[2]+.012) for p in [Drape(side*.918,1.51,j/64) for j in range(65)]],.008,'Canvas',canvas,8)
        for k in range(CANVAS_BAYS+1):
            y=.16-2.78*k/CANVAS_BAYS
            path=[Drape(x,z+.004,k/CANVAS_BAYS) for x,z in dense]
            Tube('Canvas_ReinforcedSeam'+str(side)+str(k),[(x,y,z) for x,y,z in path if x*side>=0],.004,'Canvas',canvas,6)
            Cylinder('Canvas_Eyelet'+str(side)+str(k),(side*.93,y,1.55),.016,.007,'Steel','X',canvas,20)
            Cylinder('Canvas_EyeletHole'+str(side)+str(k),(side*.936,y,1.55),.008,.009,'Dark','X',canvas,16)
            Tube('Canvas_Lashing'+str(side)+str(k),[(side*.94,y,1.55),(side*.943,y+.025,1.37),(side*.943,y,1.07),(side*.943,y-.025,1.37),(side*.94,y,1.55)],.0045,'Canvas',canvas,8)
            # Reinforcing strip follows a narrow vertical band, with real loop knots.
            verts=[]
            for row in range(9):
                z=1.56+.34*row/8
                for yy in [y-.0325,y+.0325]:
                    t=max(0,min(1,(.16-yy)/2.78));p=Drape(side*SideX(z),z,t);verts.append((p[0]+side*.005,p[1],p[2]))
            strip=Mesh('Canvas_TieReinforcement'+str(side)+str(k),verts,[(j*2,j*2+1,j*2+3,j*2+2) for j in range(8)],'Canvas',canvas,True)
            solid=strip.modifiers.new('ReinforcementThickness','SOLIDIFY');solid.thickness=.002
    # Auxiliary assembly-photo base panels. Primary front-quarter refinement
    # is applied later; the unseen side remains a mirrored reconstruction.
    for side in [-1,1]:
        for index in range(3):
            centerY,width=[(.0067,.43),(-.78,.625),(-1.7767,.66)][index]
            closureTop,closureHeight=[(2.331,.308),(2.308,.290),(2.329,.345)][index]
            verts=[];rows=12;cols=8
            def ClosurePoint(u,v):
                yy=centerY+(u-.5)*width;z=closureTop-closureHeight*v;t=(.16-yy)/2.78
                p=Drape(side*SideX(z),z,t,tension=False)
                free=.008+.026*v*v+.011*math.sin(PI*u)*math.sin(2*PI*v)
                # Broad diagonal set folds stop at the stitched outline.
                # They express repeated folding,not a torn or loose attachment.
                envelope=math.sin(PI*u)*math.sin(PI*v)
                free+=envelope*(.016-.012*math.exp(-((u-(.23+.18*v))/.105)**2)-.009*math.exp(-((u-(.76-.17*v))/.12)**2)+.004*math.sin(3*PI*u+v+index*.8))
                if index==0:free+=CANVAS_FRONT_CLOSURE_OUTWARD_M
                lift,tilt=CANVAS_CLOSURE_LOWER_ADJUSTMENTS_M[index]
                # Preserve the sewn top exactly; the photo's continuous lower
                # hem is distinct from the darker main-sheet fold below it.
                lowerAdjustment=(lift+tilt*(2*u-1))*v
                return (p[0]+side*free,yy,p[2]+.013*math.sin(2*PI*u+.7*index)*v*v-.009*math.sin(PI*u)*v+lowerAdjustment)
            for row in range(rows+1):
                v=row/rows;z=closureTop-closureHeight*v
                for column in range(cols+1):
                    u=column/cols;yy=centerY+(u-.5)*width
                    verts.append(ClosurePoint(u,v))
            faces=[(row*(cols+1)+column,row*(cols+1)+column+1,(row+1)*(cols+1)+column+1,(row+1)*(cols+1)+column) for row in range(rows) for column in range(cols)]
            if side>0:faces=[tuple(reversed(face)) for face in faces]
            obj=Mesh('Canvas_SideClosure'+str(side)+'_'+str(index),verts,faces,'Canvas',canvas,True)
            solid=obj.modifiers.new('CanvasClosureThickness','SOLIDIFY');solid.thickness=.002
            obj['Evidence']='Auxiliary assembly-photo base; nearest panel refined against primary front-quarter later. Opposite-side arrangement inferred'
            for direction in [-1,1]:
                Tube('Canvas_ClosureSideHem'+str(side)+'_'+str(index)+'_'+str(direction),[ClosurePoint((direction+1)/2,j/12) for j in range(13)],.0035,'Canvas',canvas,6)
            Tube('Canvas_ClosureLowerHem'+str(side)+'_'+str(index),[ClosurePoint(j/20,1) for j in range(21)],.004,'Canvas',canvas,6)
    for y in [.16-2.78*k/CANVAS_BAYS for k in range(CANVAS_BAYS+1)]:
        Tube('Cargo_CanvasBow'+str(y),[(x*.977,y,z-.025) for x,z in dense],.012,'Paint',ROOT,8)
    ROOT['CanvasDiagonalFoldDepthM']=.045
    ROOT['CanvasServiceRelaxationJson']=json.dumps({'version':76,'roofSagBetweenBowsNominalM':.061,'additionalSetWrinkleM':.0055,'closureInteriorCreasesM':[.012,.009],'bowPlanesAndSewnBoundariesPinned':True,'scope':'Heavy used-canvas appearance informed by period photos and film cloth behaviour;not measured Japanese tailoring or historic damage'})
    ROOT['CanvasDiagonalFoldEvidence']='Main-sheet diagonal gravity/tie creases follow primary-photo window hems; exact depth and hidden-side repetition reconstructed. Free window flaps are authored separately from this main-sheet tension field.'
    ROOT['CanvasClosureLowerAdjustmentsJson']=json.dumps(CANVAS_CLOSURE_LOWER_ADJUSTMENTS_M)
    ROOT['CanvasClosureFrontOutwardM']=CANVAS_FRONT_CLOSURE_OUTWARD_M
    ROOT['CanvasClosureContourEvidence']='Auxiliary assembly-photo panels are a starting shape only. All three closures are subsequently placed against primary-photo outline hypotheses; hidden-side mirroring and exact tailoring remain reconstruction.'

def SetupCamera(name,location,target,lens=52,ortho=None):
    data=bpy.data.cameras.new(name);obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj)
    obj.location=location;obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler();data.lens=lens
    if name=='Camera_ProductionMatch':
        obj.rotation_mode='QUATERNION';obj.rotation_quaternion=obj.rotation_euler.to_quaternion()@Quaternion(Vector((0,0,1)),math.radians(REFERENCE_CAMERA_ROLL_DEG))
        data.sensor_fit='HORIZONTAL';data.shift_x=(300-REFERENCE_PRINCIPAL_POINT_PX[0])/600;data.shift_y=(REFERENCE_PRINCIPAL_POINT_PX[1]-205)/600
    if name=='Camera_HistoricalPrimary':
        obj.rotation_mode='QUATERNION';obj.rotation_quaternion=obj.rotation_euler.to_quaternion()@Quaternion(Vector((0,0,1)),math.radians(PRIMARY_CAMERA_ROLL_DEG));data.sensor_fit='HORIZONTAL';data.shift_x=(300-PRIMARY_CAMERA_PRINCIPAL_PX[0])/600;data.shift_y=(PRIMARY_CAMERA_PRINCIPAL_PX[1]-172.5)/600
    if ortho:data.type='ORTHO';data.ortho_scale=ortho
    return obj

def Studio():
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32
    scene.cycles.use_denoising=True
    scene.render.resolution_x=1200;scene.render.resolution_y=690;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
    world=bpy.data.worlds.new('World_IsuzuNeutralStudio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.4,.4,.4,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5;scene.world=world
    ground=Box('Studio_Ground',(0,0,-.05),(200,200,.10),'Paint',None,0);ground['ExportExclude']=True
    floorMaterial=bpy.data.materials.new('Material_StudioGround');floorMaterial.use_nodes=True;node=floorMaterial.node_tree.nodes.get('Principled BSDF');node.inputs['Base Color'].default_value=(.18,.18,.18,1);node.inputs['Roughness'].default_value=.92
    ground.data.materials.clear();ground.data.materials.append(floorMaterial)
    for name,location,power,size in [('Key',(-5,3,8),1700,6),('Fill',(5,2,5),1000,5),('Rim',(1,-6,7),1600,5)]:
        data=bpy.data.lights.new('Studio_'+name,'AREA');data.energy=power;data.shape='DISK';data.size=size
        obj=bpy.data.objects.new(data.name,data);bpy.context.collection.objects.link(obj);obj.location=location;obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler();obj['ExportExclude']=True
    # Actual hub caps and both front tyre contours constrain this camera.
    # Lens shift models an unknown principal point in the cropped600x410 scan.
    SetupCamera('Camera_ProductionMatch',REFERENCE_CAMERA_LOCATION,REFERENCE_CAMERA_TARGET,REFERENCE_CAMERA_LENS_MM)
    SetupCamera('Camera_HistoricalPrimary',PRIMARY_CAMERA_LOCATION,PRIMARY_CAMERA_TARGET,PRIMARY_CAMERA_LENS_MM)
    SetupCamera('Camera_Side',(-10,0,1.42),(0,0,1.33),52,6.25)
    SetupCamera('Camera_Front',(0,10,2.0),(0,0,1.3),52,3.4)
    SetupCamera('Camera_RearQuarter',(-6,-8,4.4),(0,-.4,1.25),55)
    scene.camera=bpy.data.objects['Camera_HistoricalPrimary']

def FitPrimaryCanvasHeaderFolds():
    """Crease the actual front header while pinning every attachment edge.

    Centre paths follow visible diagonal dark-line hypotheses in the selected
    photograph. Their depth, backside shape and tailoring remain reconstructed.
    Apply after the shared body/profile fits so displacements stay in metres.
    """
    obj=bpy.data.objects['Canvas_FrontHeaderValance']
    if len(obj.data.vertices)!=11*65:raise RuntimeError('Front header source grid changed')
    maximum=0;changed=0
    for index,vertex in enumerate(obj.data.vertices):
        row,col=divmod(index,65)
        if row in (0,10) or col in (0,64):continue
        t=row/10;u=col/64;x=(2*u-1)*.9
        envelope=math.sin(PI*t)**2*min(1,8*min(u,1-u))**2
        displacement=0
        for centre,slope,amplitude,width in PRIMARY_CANVAS_HEADER_FOLDS_M:
            ratio=(x-(centre+slope*(t-.5)))/width
            displacement+=amplitude*(1-2*ratio*ratio)*math.exp(-ratio*ratio)
        displacement*=envelope;vertex.co.y+=displacement
        maximum=max(maximum,abs(displacement));changed+=abs(displacement)>1e-9
    obj.data.update()
    ROOT['PrimaryCanvasHeaderFoldsJson']=json.dumps(PRIMARY_CANVAS_HEADER_FOLDS_M)
    ROOT['PrimaryCanvasHeaderMaximumDisplacementM']=maximum
    ROOT['PrimaryCanvasHeaderChangedVertices']=changed
    ROOT['PrimaryCanvasHeaderBoundaryPinned']=True
    ROOT['PrimaryCanvasHeaderEvidence']='Selected600x345primary front-header diagonal crease hypotheses. All four source-grid boundaries and rolled-curtain/corner attachments retained. Exact16mmmaximum surface relief,hidden side and tailoring reconstructed; not recovered historical cloth dimensions or illumination.'


def CanvasMainUV(point):
    """Continuous fabric around both shoulders; no dominant-axis UV switch.

    The authored radius stays below the actual minimum surface radius, keeping
    the projection nonexpanding. Yarn pitch varies gently with cover curvature.
    """
    return (point.y/CANVAS_TEXTURE_TILE_M,CANVAS_WRAP_RADIUS_M*math.atan2(point.x,point.z-CANVAS_WRAP_CENTRE_Z_M)/CANVAS_TEXTURE_TILE_M)

def AssignUV(objects=None):
    # Deterministic physical projection. Smooth sidewalls/canvas have their own unwrap.
    for obj in (bpy.data.objects if objects is None else objects):
        if obj.type!='MESH' or obj.get('ExportExclude'):continue
        layer=obj.data.uv_layers.new(name='UVMap') if not obj.data.uv_layers else obj.data.uv_layers.active
        zone=obj.get('MaterialZone','Paint')
        scale={'Paint':.75,'Chassis':.65,'Steel':.35,'Reflector':.35,'LampGlass':1,'Rubber':.35,'Canvas':CANVAS_TEXTURE_TILE_M,'Wood':.60,'Leather':.30,'Glass':1,'Light':.15,'Dark':.35,'Stencil':.30,'Rust':.20}[zone]
        for polygon in obj.data.polygons:
            normal=polygon.normal;axis=max(range(3),key=lambda k:abs(normal[k]))
            # A crease can turn the local normal past45degrees. Keep the side
            # fabric projection continuous instead of flipping its weave axes.
            sideCanvas=zone=='Canvas' and obj.name=='Canvas_MainCover' and abs(polygon.center.x)>.86 and polygon.center.z<2.45
            for li in polygon.loop_indices:
                point=obj.data.vertices[obj.data.loops[li].vertex_index].co
                u,v=(point.y,point.z) if sideCanvas or axis==0 else ((point.x,point.z) if axis==1 else (point.x,point.y))
                if zone=='Wood' and axis==2:u,v=point.y,point.x
                layer.data[li].uv=CanvasMainUV(point) if zone=='Canvas' and obj.name=='Canvas_MainCover' else (u/scale,v/scale)
        obj['TextureScaleM']=scale

def FitReferenceBody():
    """Calibrate photographic body placement without altering verified axle anchors.

    The primary truck has a longer cab and bonnet and a shorter cargo body than
    a naive equal division of the chassis. These are photo-derived body dimensions.
    """
    def Warp(objects,scale,offset):
        transform=Matrix.Identity(4);transform[1][1]=scale;transform[1][3]=offset
        for obj in objects:
            if obj.type!='MESH':continue
            matrix=obj.matrix_world.copy();local=matrix.inverted()@transform@matrix
            for vertex in obj.data.vertices:vertex.co=local@vertex.co
    def MovePivot(obj,y,tilt=None):
        worlds={child:child.matrix_world.copy() for child in obj.children}
        loc=obj.matrix_world.translation.copy();loc.y=y
        matrix=Matrix.Translation(loc)@obj.matrix_world.to_3x3().to_4x4()
        if tilt is not None:matrix=Matrix.Translation(loc)@Matrix.Rotation(tilt,4,'X')
        obj.matrix_world=matrix;bpy.context.view_layer.update()
        for child,world in worlds.items():child.matrix_world=world
    meshes=list(ROOT.children_recursive)
    cabPrefixes=('Cabin_','DoorPanel_','DoorLower','Door_','Windshield_','Mirror_','Steering_','Dashboard_')
    steeringParts=[o for o in meshes if o.type=='MESH' and o.name.startswith('Steering_') and o.name!='Steering_Column']
    cab=[o for o in meshes if o.type=='MESH' and o.name.startswith(cabPrefixes) and o not in steeringParts]
    a=CAB_LONGITUDINAL_SCALE;b=.93-a*1.17;Warp(cab,a,b)
    Warp(steeringParts,1,a*.74+b-.74)
    for name in ['Door_Left','Door_Right','SteeringWheel']:
        p=bpy.data.objects[name];MovePivot(p,a*p.matrix_world.translation.y+b)
    a=BONNET_WORLD_LENGTH/1.19;b=BONNET_WORLD_FRONT_Y-a*2.34
    Warp([o for o in meshes if o.name.startswith(('Bonnet','Hood_','HoodSide_'))],a,b)
    for name in ['Hood_Left','Hood_Right']:
        p=bpy.data.objects[name];MovePivot(p,a*1.70+b,-math.atan2(BONNET_TOP_HEIGHT_DIFFERENCE,BONNET_WORLD_LENGTH))
    for side in [-1,1]:
        p=bpy.data.objects['HoodSide_'+('Left' if side<0 else 'Right')];worlds={child:child.matrix_world.copy() for child in p.children}
        center=BonnetShoulder((BONNET_SIDE_OUTER_START_RAW_Y+BONNET_PANEL_RAW_Y[1])/2,side);center.y=a*center.y+b
        p.matrix_world=Matrix.Translation(center)@Vector((0,1,0)).rotation_difference(Vector((-side*BONNET_TAPER_M,BONNET_WORLD_LENGTH,-BONNET_SHOULDER_HEIGHT_DIFFERENCE)).normalized()).to_matrix().to_4x4();bpy.context.view_layer.update()
        for child,world in worlds.items():child.matrix_world=world
        p=bpy.data.objects['RearCheek_'+('Left' if side<0 else 'Right')];worlds={child:child.matrix_world.copy() for child in p.children}
        start,end=RearCheekRawEdge(side);start.x+=side*.007;end.x+=side*.007;start.y=a*start.y+b;end.y=a*end.y+b
        p.matrix_world=Matrix.Translation(start)@Vector((0,0,1)).rotation_difference((end-start).normalized()).to_matrix().to_4x4();bpy.context.view_layer.update()
        for child,world in worlds.items():child.matrix_world=world
    for obj in meshes:
        radius=obj.get('RearCheekRoundRadiusM')
        if not radius or obj.type!='MESH':continue
        matrix=obj.matrix_world.copy();inverse=matrix.inverted();half=len(obj.data.vertices)//2;points=[matrix@v.co for v in obj.data.vertices]
        centres=[sum(points[:half],Vector())/half,sum(points[half:],Vector())/half];axis=(centres[1]-centres[0]).normalized()
        for i,(vertex,point) in enumerate(zip(obj.data.vertices,points)):
            centre=centres[0 if i<half else 1];radial=point-centre;radial-=axis*radial.dot(axis);vertex.co=inverse@(centre+radial.normalized()*radius)
        obj.data.update()
    # Fit the inferred body skin within the factory nominal overall length.
    # Axles, tyre size and track remain independent metric anchors.
    a=(CARGO_PHOTO_FRONT_Y-CARGO_PHOTO_REAR_Y)/2.995;b=CARGO_PHOTO_REAR_Y+2.70*a
    Warp([o for o in meshes if o.name.startswith('Cargo_') and not o.name.startswith('Cargo_CanvasBow')],a,b)
    a=(CANVAS_PHOTO_FRONT_Y-CANVAS_PHOTO_REAR_Y)/2.79;b=CANVAS_PHOTO_REAR_Y+2.63*a
    Warp([o for o in meshes if o.name.startswith(('Canvas_','Cargo_CanvasBow'))],a,b)
    rearDelta=CARGO_PHOTO_REAR_Y+2.70
    Warp([o for o in meshes if o.name.startswith('Tailgate_') or o.name.startswith('Rear_Lamp')],1,.03+rearDelta)
    MovePivot(bpy.data.objects['Tailgate'],TAILGATE_AXIS_RAW_Y+.03+rearDelta)
    ROOT['CargoRearOffsetM']=rearDelta
    ROOT['CargoPhotoRearY']=CARGO_PHOTO_REAR_Y
    ROOT['BodyLengthEvidence']='Factory nominal5.400m overall target, unchanged metric axles/tyres/tracks, inferred skin fitted through a cropped-photo camera; exact photographed chassis identity remains unproven.'
    # Factory nominal width excludes the projecting mirrors. Keep the verified
    # axle tracks; fit only the sheet-metal wings and the cargo hardware.
    ROOT['CargoWidthScale']=1.0
    for prefixes,key in [(('FrontFender_','RearFender_','RunningBoard_'),'FenderWidthScale')]:
        objects=[o for o in meshes if o.type=='MESH' and o.name.startswith(prefixes)]
        extent=max(abs((o.matrix_world@v.co).x) for o in objects for v in o.data.vertices)
        factor=min(1,.950/extent);ROOT[key]=factor
        for obj in objects:
            matrix=obj.matrix_world.copy();inverse=matrix.inverted()
            for vertex in obj.data.vertices:
                point=matrix@vertex.co;point.x*=factor;vertex.co=inverse@point
    ROOT['BodyCalibration']=f'Cab rear -0.36m / cowl +0.93m; cargo front {CARGO_PHOTO_FRONT_Y}m / rear {CARGO_PHOTO_REAR_Y}m; skin reconstructed inside nominal5.400m overall'

def FitCabPhotographicHeight():
    """Fit the hard-cab door to measured photo edges; retain roof height/cowl.

    The factory manual establishes chassis/overall anchors; the hard-cab skin is
    photo-derived. At the calibrated camera, observed sill rows 192/202 and lower
    door rows 277/278 require a taller, lower side panel than the first grey pass.
    These two z anchors are reconstruction, not claimed factory measurements.
    """
    a=.75/.69;b=.74-a*.96
    def Height(z):
        if z<=1.70:return a*z+b
        if z>=2.10:return z
        return (a*1.70+b)+(z-1.70)*(2.10-(a*1.70+b))/.40
    prefixes=('DoorPanel_','DoorLower','Door_','Cabin_Rear','Cabin_Bpost','Cabin_Floor','Cabin_Bench','Cabin_Seat','Cabin_Gear','Cabin_Pedal')
    for obj in list(ROOT.children_recursive):
        if obj.type!='MESH' or not obj.name.startswith(prefixes):continue
        matrix=obj.matrix_world.copy();inverse=matrix.inverted()
        extra=.10 if obj.name.startswith(('Cabin_Floor','Cabin_Bench')) else (.04 if obj.name.startswith('Cabin_Pedal') else 0)
        for vertex in obj.data.vertices:
            point=matrix@vertex.co;point.z=Height(point.z)+extra;vertex.co=inverse@point
    for name in ['Door_Left','Door_Right']:
        obj=bpy.data.objects[name];worlds={child:child.matrix_world.copy() for child in obj.children};matrix=obj.matrix_world.copy();matrix.translation.z=Height(matrix.translation.z);obj.matrix_world=matrix;bpy.context.view_layer.update()
        for child,world in worlds.items():child.matrix_world=world
    for side in [-1,1]:Tube('Cabin_DoorFrontSeal'+str(side),[(side*.73,.855,1.49),(side*.73,.855,1.68)],.013,'Rubber',ROOT,8)
    ROOT['CabDoorPhotoZAnchorsM']=[.74,1.49]
    ROOT['CabDoorEvidence']='Photo-derived side door, panel/cab interior height reconstructed; original factory chassis/cab maximum height retained'

def FitCabAndCoverPhotographicDetails():
    """Raked rear wall and sloping sill; keep the actual2.250m roof crown.

    The camera is chosen within the wheel-anchor annotation uncertainty, with
    the photographed front steering pose included. Dimensions here remain
    photographic reconstruction rather than independently stated specifications.
    """
    def Clamp(value):return max(0,min(1,value))
    def Rake(point):return .24*Clamp((point.z-1.49)/.65)*Clamp((.70-point.y)/1.0)
    bpy.context.view_layer.update()
    for obj in list(ROOT.children_recursive):
        if obj.type!='MESH':continue
        if obj.name.startswith(('Door_HingeLeft','Door_HingeRight')):continue
        roof=obj.name.startswith(('Cabin_CamberedRoof','Cabin_RainGutter','Cabin_RoofFrontLip'))
        structural=obj.name.startswith(('Cabin_Rear','Cabin_Bpost','DoorPanel','DoorLower','Door_','Windshield_'))
        cab=structural or obj.name.startswith('Cabin_')
        cloth=obj.name.startswith(('Canvas_','Cargo_CanvasBow'))
        lamp=obj.name.startswith('Rear_Lamp')
        if not (roof or cab or cloth or lamp):continue
        matrix=obj.matrix_world.copy();inverse=matrix.inverted()
        for vertex in obj.data.vertices:
            point=matrix@vertex.co
            if roof or cab:
                rear=Clamp((.88-point.y)/1.166)
                if structural:
                    sill=Clamp((point.z-1.35)/.14)*Clamp((2.12-point.z)/.63)
                    lowerDoor=obj.name.startswith(('DoorPanel_','Door_WindowLowerChannel','Door_InnerTrim')) or obj.name.startswith('Door_WindowFrontFrame') and point.z<PRIMARY_DOOR_SILL_FRAME_LOWER_Z_M
                    foreWeight=Clamp((1-rear-PRIMARY_DOOR_SILL_REAR_LOCK_PHASE)/(1-PRIMARY_DOOR_SILL_REAR_LOCK_PHASE))
                    primaryDoor=PRIMARY_DOOR_SILL_FORE_LIFT_M*foreWeight if lowerDoor else 0
                    point.z+=(.16*rear-.057+primaryDoor)*sill
                    point.y+=.04*(1-rear)*sill
                point.y+=.07*rear
            if roof:
                weight=Clamp((point.y+.439857)/1.462)
                point.y+=Rake(point)+.088*(1-weight)-.06*weight
                point.z-=.085*(abs(point.x)/.82)**2
                point.x*=.79/.82
            elif structural:point.y+=Rake(point)
            if cab and not roof:point.z-=.045*Clamp((point.z-1.65)/.47)*(abs(point.x)/.82)**2
            if cloth:
                rawZ=point.z;lengthPhase=Clamp((CANVAS_PHOTO_FRONT_Y-point.y)/(CANVAS_PHOTO_FRONT_Y-CANVAS_PHOTO_REAR_Y))
                point.z+=.04-.05*Clamp((rawZ-2.43)/.225)-(.02+.08*lengthPhase)*Clamp((rawZ-2.35)/.305)
            if lamp:point.z+=.04
            if obj.name.startswith(('Cabin_Floor','Cabin_Bench','Cabin_Seat','Cabin_Gear','Cabin_Pedal')):point.z+=.20
            vertex.co=inverse@point
    for name in ['CargoBed','Tailgate']:bpy.data.objects[name].location.z+=.04
    # Body fitting stretches longitudinal cabin geometry; restore round hinge
    # sections so their cap centrelines stay on one straight physical shaft.
    for obj in list(ROOT.children_recursive):
        if obj.type!='MESH' or not obj.name.startswith(('Door_HingeLeft','Door_HingeRight')):continue
        matrix=obj.matrix_world.copy();inverse=matrix.inverted();points=[matrix@v.co for v in obj.data.vertices]
        centerY=sum(p.y for p in points)/len(points)
        for vertex,point in zip(obj.data.vertices,points):
            point.y=centerY+(point.y-centerY)/CAB_LONGITUDINAL_SCALE;vertex.co=inverse@point
    tunnel=Box('Cabin_TransmissionTunnel',(0,.57,1.00),(.42,.82,.12),'Paint',ROOT,.025)
    for vertex in tunnel.data.vertices:
        if vertex.co.z>1.0:vertex.co.z+=.09*Clamp((vertex.co.y-.16)/.82)
    for side in [-1,1]:Box('Cabin_LowerFirewallSide'+str(side),(side*.46,.96,1.08),(.50,.03,.30),'Paint',ROOT,.008)
    Box('Cabin_LowerFirewallCenter',(0,.96,1.195),(.42,.03,.09),'Paint',ROOT,.006)
    for obj in list(ROOT.children_recursive):
        if obj.type!='MESH' or not obj.name.startswith('Cabin_GearLever'):continue
        half=len(obj.data.vertices)//2;matrix=obj.matrix_world
        start=sum((matrix@v.co for v in obj.data.vertices[:half]),Vector())/half
        end=sum((matrix@v.co for v in obj.data.vertices[half:]),Vector())/half
        slope=.09/.82;delta=end-start
        weight=(1.06+slope*(start.y-.16)-start.z)/(delta.z-slope*delta.y)
        point=start.lerp(end,weight);normal=Vector((0,-slope,1)).normalized()
        Tube('Cabin_GearBoot'+obj.name.removeprefix('Cabin_GearLever'),[tuple(point-normal*.009),tuple(point+normal*.009)],.025,'Rubber',ROOT,20)
    ROOT['CargoHeightOffsetM']=.04
    ROOT['CanopyUpperHeightOffsetM']=-.03
    ROOT['CanopyTopCompressionM']=.05
    ROOT['CanopyRoofLongitudinalDropM']=[.02,.10]
    ROOT['CabInteriorFloorLiftM']=.20
    ROOT['CabSillEvidence']='Photo-derived sloping upper door edge and raked rear post; maximum roof crown remains2.250m'
    ROOT['PrimaryDoorSillForeLiftM']=PRIMARY_DOOR_SILL_FORE_LIFT_M
    ROOT['PrimaryDoorSillEvidence']='Closed primary side-window lower-channel hypothesis; only door pressing, inner trim and moving window frame change. Windscreen, cowl, hinges, roof and hidden-side correspondence retain separate evidence limits.'


def FitCanvasFrontBoundary():
    """Extend the cloth lip so the foremost flap is attached to real cloth.

    The main photograph leaves a short cloth margin ahead of the first flap.
    Keep the already fitted flap, roof crown, steel bows and chassis anchors;
    only the front cloth edge/hem and its sewn fittings gain an overhang. Exact
    seam allowance and the loose front lip remain photographic reconstruction.
    """
    distance=CANVAS_FRONT_EDGE_EXTENSION_M;blendLength=.35
    frontHardware={prefix+str(side)+'0' for prefix in ['Canvas_ReinforcedSeam','Canvas_Eyelet','Canvas_EyeletHole','Canvas_Lashing','Canvas_TieReinforcement'] for side in [-1,1]}
    def Clamp(value):return max(0,min(1,value))
    def Shift(point,lashing=False,anchor=False):
        fore=Clamp((point.y-CANVAS_PHOTO_FRONT_Y+blendLength)/blendLength)
        height=Clamp((2.64-point.z)/.30)
        bottom=Clamp((point.z-1.1)/.4) if lashing else 1
        return (CANVAS_FRONT_ANCHOR_EXTENSION_M if anchor else distance)*fore*height*bottom
    for obj in ROOT.children_recursive:
        if obj.type!='MESH':continue
        name=obj.name
        if not (name=='Canvas_MainCover' or name.startswith(('Canvas_Front','Canvas_LowerBoundHem')) or name in frontHardware):continue
        matrix=obj.matrix_world.copy();inverse=matrix.inverted()
        # Small metal grommets translate rigidly with their cloth attachment.
        rigid=name.startswith(('Canvas_Eyelet','Canvas_EyeletHole'))
        anchor=name in frontHardware
        delta=Shift(sum((matrix@v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices),anchor=anchor) if rigid else None
        for vertex in obj.data.vertices:
            point=matrix@vertex.co;point.y+=delta if rigid else Shift(point,name.startswith('Canvas_Lashing'),anchor);vertex.co=inverse@point
    ROOT['CanopyFrontEdgeExtensionM']=distance
    ROOT['CanopyFrontAnchorExtensionM']=CANVAS_FRONT_ANCHOR_EXTENSION_M
    ROOT['CanopyFrontEdgeExtensionHeightRangeM']=[2.34,2.64]
    ROOT['CanopyFrontEdgeExtensionBlendLengthM']=blendLength
    bow=bpy.data.objects['Cargo_CanvasBow0.16'];matrix=bow.matrix_world.copy();inverse=matrix.inverted()
    for vertex in bow.data.vertices:
        point=matrix@vertex.co;point.y-=CANOPY_FRONT_BOW_SETBACK_M;vertex.co=inverse@point
    ROOT['CanopyFrontBowRetained']=False
    ROOT['CanopyFrontBowSetbackM']=CANOPY_FRONT_BOW_SETBACK_M
    ROOT['CanopyFrontBoundaryEvidence']='Short front cloth margin in primary photo; complete upper flap attachment checked on actual runtime triangles. Seam allowance and loose lip are reconstructed.'


def FitPrimaryCanvasProfile():
    """Photo-guided upper profile with unchanged lower skirt and cargo anchors.

    Undo the former assembly-photo upper compression, then apply a modest rear
    rake. Cargo-cover height/tailoring are inferred; cab/chassis dimensions stay.
    """
    def Clamp(v):return max(0,min(1,v))
    def Smooth(v):v=Clamp(v);return v*v*(3-2*v)
    def Old(raw,phase):return raw+.04-.05*Clamp((raw-2.43)/.225)-(.02+.08*phase)*Clamp((raw-2.35)/.305)
    maximumLift=0;changed=0
    for obj in ROOT.children_recursive:
        if obj.type!='MESH' or not obj.name.startswith(('Canvas_','Cargo_CanvasBow')):continue
        matrix=obj.matrix_world.copy();inverse=matrix.inverted()
        for vertex in obj.data.vertices:
            p=matrix@vertex.co
            if p.z<=2.15:continue
            phase=Clamp((CANVAS_PHOTO_FRONT_Y-p.y)/(CANVAS_PHOTO_FRONT_Y-CANVAS_PHOTO_REAR_Y));low=p.z-.1;high=p.z+.4
            for iteration in range(26):
                mid=(low+high)/2
                if Old(mid,phase)<p.z:low=mid
                else:high=mid
            raw=(low+high)/2
            delta=.05*Clamp((raw-2.43)/.225)+(.02+.08*phase)*Clamp((raw-2.35)/.305)+(PRIMARY_CANVAS_FORE_EXTRA_M+(PRIMARY_CANVAS_REAR_EXTRA_M-PRIMARY_CANVAS_FORE_EXTRA_M)*phase)*Smooth((raw-2.17)/.485)
            p.z+=delta;vertex.co=inverse@p;maximumLift=max(maximumLift,delta);changed+=delta>1e-6
        obj.data.update()
        if obj.name.startswith('Cargo_CanvasBow'):obj['PreserveRuntimeTopology']=True;obj['RuntimeBudgetLocked']=True
    ROOT['PrimaryCanvasProfileMode']='Upper assembly-compression restoration and rear rake; lower skirt/cargo unchanged'
    ROOT['PrimaryCanvasProfileExtraM']=[PRIMARY_CANVAS_FORE_EXTRA_M,PRIMARY_CANVAS_REAR_EXTRA_M]
    ROOT['PrimaryCanvasProfileMaximumLiftM']=maximumLift
    ROOT['PrimaryCanvasProfileVertices']=changed
    ROOT['PrimaryCanvasProfileEvidence']='Visible primary front-quarter roof/shoulder silhouette; exact height, bow section and tailoring reconstructed. Not a new factory overall-height specification.'


def FitPrimaryForeFlap():
    """Place all three closures and hems on the actual main cloth.

    The primary photo controls this candidate. Exact tailoring and the hidden
    side are inferred; the old assembly-photo panel is only a starting mesh.
    """
    from mathutils.bvhtree import BVHTree
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();cover=bpy.data.objects['Canvas_MainCover'];ev=cover.evaluated_get(deps);mesh=ev.to_mesh()
    tree=BVHTree.FromPolygons([cover.matrix_world@v.co for v in mesh.vertices],[tuple(p.vertices) for p in mesh.polygons],all_triangles=False);ev.to_mesh_clear()
    groups=[]
    for index in range(3):
        exact={'Canvas_SideClosure'+str(side)+'_'+str(index) for side in [-1,1]}|{'Canvas_ClosureLowerHem'+str(side)+'_'+str(index) for side in [-1,1]}
        selected=[o for o in ROOT.children_recursive if o.type=='MESH' and (o.name in exact or o.name.startswith(('Canvas_ClosureSideHem1_'+str(index)+'_','Canvas_ClosureSideHem-1_'+str(index)+'_')))]
        if len(selected)!=8:raise RuntimeError('Each primary closure requires exactly eight disjoint skin/hem parts')
        groups.append(selected)
    if len({o for group in groups for o in group})!=24:raise RuntimeError('Primary closure groups overlap')
    misses=[];count=0
    for index,selected in enumerate(groups):
        skin=bpy.data.objects['Canvas_SideClosure1_'+str(index)];points=[skin.matrix_world@v.co for v in skin.data.vertices];low=min(p.z for p in points);high=max(p.z for p in points)
        for obj in selected:
            side=1 if 'Hem1_' in obj.name or 'Closure1_' in obj.name else -1;matrix=obj.matrix_world.copy();inverse=matrix.inverted()
            for vertex in obj.data.vertices:
                p=matrix@vertex.co;old=tree.ray_cast(p+Vector((side*.15,0,0)),Vector((-side,0,0)),.35)
                gap=max(.005,min(.05,side*(p.x-old[0].x))) if old[0] is not None else .012
                v=max(0,min(1,(high-p.z)/(high-low)));fade=max(0,min(1,v/.25));fade=fade*fade*(3-2*fade)
                p+=Vector(PRIMARY_CLOSURE_SHIFTS_M[index]);hit=tree.ray_cast(p+Vector((side*.20,0,0)),Vector((-side,0,0)),.50)
                if hit[0] is None:misses.append(obj.name)
                else:p.x=hit[0].x+side*(gap+PRIMARY_CLOSURE_FREE_EXTRA_M[index]*fade)
                vertex.co=inverse@p;count+=1
            obj.data.update()
            if index==0:obj['PreserveRuntimeTopology']=True;obj['RuntimeBudgetLocked']=True
            obj['PrimaryPhotoRole']='Free closure and hems placed against primary-photo outline hypothesis; source dimensions,hidden-side mirroring and exact tailoring inferred'
    if misses:raise RuntimeError('Primary fore flap misses actual main cloth: '+str(sorted(set(misses))))
    ROOT['PrimaryForeFlapShiftM']=list(PRIMARY_FORE_FLAP_SHIFT_M);ROOT['PrimaryForeFlapRefitVertices']=count
    ROOT['PrimaryClosureShiftsJson']=json.dumps(PRIMARY_CLOSURE_SHIFTS_M);ROOT['PrimaryClosureFreeExtraM']=list(PRIMARY_CLOSURE_FREE_EXTRA_M)
    ROOT['PrimaryForeFlapEvidence']='Primary600x345complete closure outline hypotheses replace assembly-photo positions for all three skins/hems. Actual main-cloth rays preserve top support; rear free portion has12mm additional reconstructed outward clearance, fading at the top. Placement and hidden-side mirroring are inferred,not factory tailoring measurements.'

def FitCanvasLowerOverlap():
    """Fit the loose skirt to the primary cloth/cargo boundary.

    Replace the old assembly-photo120mmfore drop. The primary exposes more of
    the rigid upper cargo rail; rear/fore50/30mm lifts are reconstruction values.
    Keep the existing lateral envelope,window flaps,bows,cargo and camera.
    """
    def Smooth(value):
        value=max(0,min(1,value));return value*value*(3-2*value)
    def Delta(point,lash=False,anchorFloor=None):
        forward=max(0,min(1,(point.y+2.869)/2.566))
        lower=1-Smooth((point.z-1.55)/.40)
        lateral=1-Smooth((point.z-1.70)/.30)
        anchor=Smooth((point.z-1.08)/.47) if lash else 1
        side=Smooth((abs(point.x)-.70)/.20);sign=1 if point.x>=0 else -1
        lift=PRIMARY_CANVAS_HEM_LIFT_M[0]*(1-forward)+PRIMARY_CANVAS_HEM_LIFT_M[1]*forward
        zDelta=lift*lower*anchor
        if lash:
            # Preserve the actual lowest tube ring, rather than assuming that
            # an old pre-body-fit1.08m height still identifies the cargo anchor.
            lock=Smooth((point.z-anchorFloor)/.16)
            oldDrop=-.12*forward*lower*anchor;zDelta=oldDrop+(zDelta-oldDrop)*lock
        return Vector((sign*.8*(.9775-abs(point.x))*lateral*anchor*side,0,zDelta))
    changed=0
    for obj in ROOT.children_recursive:
        if obj.type!='MESH' or not obj.name.startswith(('Canvas_MainCover','Canvas_LowerBoundHem','Canvas_ReinforcedSeam','Canvas_TieReinforcement','Canvas_Eyelet','Canvas_Lashing','Canvas_FrontCornerFold')):continue
        matrix=obj.matrix_world.copy();inverse=matrix.inverted()
        rigid=obj.name.startswith('Canvas_Eyelet')
        centre=sum((matrix@v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
        lash=obj.name.startswith('Canvas_Lashing');anchorFloor=min((matrix@v.co).z for v in obj.data.vertices)+.012 if lash else None
        rigidDelta=Delta(centre) if rigid else None
        for vertex in obj.data.vertices:
            point=matrix@vertex.co;delta=rigidDelta if rigid else Delta(point,lash,anchorFloor)
            if delta.length>1e-8:vertex.co=inverse@(point+delta);changed+=1
        obj.data.update()
    ROOT['CanvasLowerOverlapFrontDropM']=0.0
    ROOT['PrimaryCanvasHemLiftRearForeM']=list(PRIMARY_CANVAS_HEM_LIFT_M)
    ROOT['PrimaryCanvasHemLashingLockBandM']=[.012,.16]
    ROOT['CanvasLowerOverlapOuterTargetM']=.9775
    ROOT['CanvasLowerOverlapLateralCompression']=.2
    ROOT['CanvasLowerOverlapLateralFadeHeightM']=[1.70,2.00]
    ROOT['CanvasLowerOverlapVertices']=changed
    ROOT['CanvasLowerOverlapEvidence']='Primary600x345cloth/cargo boundary replaces the auxiliary assembly-photo120mmfore drop.50/30mmrear/fore lift before lower fade exposes the unchanged upper rail; sewn reinforcements and rigid eyelets move with the skirt,lash lower anchors retained. Six visible boundary rows have3..4pxannotation uncertainty; exact tailoring and hidden side remain reconstruction.'


def FitCanvasBowContacts():
    """Drape the side skin outside the real bows after all body/lip fitting.

    The lower pin field used to pull the cloth through the support tubes.
    Sample the actual support and undeformed cloth surfaces, then apply one
    smooth displacement field to the sheet and its sewn reinforcement pieces.
    """
    from mathutils.bvhtree import BVHTree
    bpy.context.view_layer.update()
    def Tree(obj):
        vertices=[obj.matrix_world@v.co for v in obj.data.vertices]
        return BVHTree.FromPolygons(vertices,[tuple(p.vertices) for p in obj.data.polygons],all_triangles=False)
    main=bpy.data.objects['Canvas_MainCover'];cloth=Tree(main);bows=[]
    for obj in ROOT.children_recursive:
        if obj.type=='MESH' and obj.name.startswith('Cargo_CanvasBow'):
            y=sum((obj.matrix_world@v.co).y for v in obj.data.vertices)/len(obj.data.vertices)
            bows.append((y,Tree(obj)))
    changed=0;maximum=0
    for obj in ROOT.children_recursive:
        if obj.type!='MESH' or not obj.name.startswith(('Canvas_MainCover','Canvas_LowerBoundHem','Canvas_ReinforcedSeam','Canvas_TieReinforcement')):continue
        matrix=obj.matrix_world.copy();inverse=matrix.inverted()
        for vertex in obj.data.vertices:
            point=matrix@vertex.co
            if abs(point.x)<.80 or point.z>2.10:continue
            sign=1 if point.x>0 else -1;direction=Vector((-sign,0,0));outside=Vector((sign*1.5,point.y,point.z))
            skin=cloth.ray_cast(outside,direction,3)[0]
            if skin is None:continue
            shift=0
            for y,tree in bows:
                if abs(point.y-y)>.14:continue
                support=tree.ray_cast(Vector((sign*1.5,y,point.z)),direction,3)[0]
                if support is None:continue
                #4mm sheet thickness plus3mm installed clearance. The same
                # field preserves the existing sewn-piece offsets to the skin.
                required=max(0,abs(support.x)+.007-abs(skin.x))
                shift=max(shift,required*math.exp(-((point.y-y)/.04)**2))
            if shift>1e-7:
                point.x+=sign*shift;vertex.co=inverse@point;changed+=1;maximum=max(maximum,shift)
    ROOT['CanvasBowContactVertices']=changed;ROOT['CanvasBowContactMaxOutwardM']=maximum
    ROOT['CanvasBowTargetClearanceM']=.003


def FitCowlCollar():
    """Close the windshield/bonnet junction with a narrow fixed outer skin.

    Rear crown1.630m is a photo/connection reconstruction; front crown1.400m
    remains unchanged. The old curved object is an internal engine bulkhead,
    coated like the chassis. The separate exterior collar keeps body enamel.
    """
    seals=[bpy.data.objects['Windshield_LowerSeal'+str(side)] for side in [-1,1]]
    points=[obj.matrix_world@v.co for obj in seals for v in obj.data.vertices]
    rearY=sum(p.y for p in points)/len(points);rearZ=min(p.z for p in points)
    foreY=BONNET_WORLD_REAR_Y-.002;rows=2
    cross=[-.73,-.70]+[.61*math.sin(-PI*.5+PI*i/32) for i in range(33)]+[.70,.73]
    vertices=[]
    for row in range(rows+1):
        t=row/rows
        for x in cross:
            edge=max(0,min(1,(abs(x)-.70)/.03));back=rearZ-(rearZ-1.57)*edge*edge
            q=math.sqrt(max(0,1-(abs(x)/.61)**2));fore=BONNET_SHOULDER_REAR_Z+(BONNET_TOP_REAR_Z-BONNET_SHOULDER_REAR_Z)*q
            vertices.append((x,rearY+(foreY-rearY)*t,back*(1-t)+fore*t))
    count=len(cross);faces=[(j*count+k,j*count+k+1,(j+1)*count+k+1,(j+1)*count+k) for j in range(rows) for k in range(count-1)]
    top=Mesh('Cabin_CowlCollarTop',vertices,faces,'Paint',ROOT,True);solid=top.modifiers.new('CollarMetalThickness','SOLIDIFY');solid.thickness=.0012
    top['PreserveRuntimeTopology']=True;top['RuntimeBudgetLocked']=True
    for side in [-1,1]:
        vertices=[(side*.73,rearY,1.22),(side*.73,foreY,1.22),(side*.73,foreY,1.46),(side*.73,rearY,1.57)]
        obj=Mesh('Cabin_CowlCollarSide'+str(side),vertices,[(0,1,2,3)] if side>0 else [(3,2,1,0)],'Paint',ROOT)
        solid=obj.modifiers.new('CollarSideMetalThickness','SOLIDIFY');solid.thickness=.0012;obj['PreserveRuntimeTopology']=True;obj['RuntimeBudgetLocked']=True
    ROOT['BonnetRearCrownM']=BONNET_TOP_REAR_Z
    ROOT['BonnetFrontCrownM']=BONNET_TOP_REAR_Z-BONNET_TOP_HEIGHT_DIFFERENCE
    ROOT['CowlCollarRearY']=rearY;ROOT['CowlCollarRearZ']=rearZ;ROOT['CowlCollarForeY']=foreY
    ROOT['CowlCollarEvidence']='Fixed painted collar between actual lower windshield seal and bonnet rear profile;1.630m crown, panel thickness and junction details reconstructed. Internal bulkhead uses chassis coating.'


def FitCabRoofContacts(frameDropM=.035):
    """Separate the moving window frame from the fixed roof/weather header."""
    from mathutils.bvhtree import BVHTree
    for side in ['Left','Right']:
        for prefix in ['Door_WindowUpperFrame','Door_WindowRearFrame','Door_WindowFrontFrame']:
            obj=bpy.data.objects[prefix+side];matrix=obj.matrix_world.copy();inverse=matrix.inverted();half=len(obj.data.vertices)//2
            for i,vertex in enumerate(obj.data.vertices):
                if prefix!='Door_WindowUpperFrame' and i<half:continue
                point=matrix@vertex.co;point.z-=frameDropM;vertex.co=inverse@point
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();roof=bpy.data.objects['Cabin_CamberedRoof'];ev=roof.evaluated_get(deps);mesh=ev.to_mesh()
    tree=BVHTree.FromPolygons([roof.matrix_world@v.co for v in mesh.vertices],[tuple(p.vertices) for p in mesh.polygons],all_triangles=False);ev.to_mesh_clear()
    def CapCentre(obj,upper):
        half=len(obj.data.vertices)//2;vertices=obj.data.vertices[half:] if upper else obj.data.vertices[:half]
        return sum((obj.matrix_world@v.co for v in vertices),Vector())/len(vertices)
    for side,sign in [('Left',-1),('Right',1)]:
        frame=bpy.data.objects['Door_WindowUpperFrame'+side];start=CapCentre(frame,False);end=CapCentre(frame,True)
        vertices=[frame.matrix_world@v.co for v in frame.data.vertices];radiusZ=max(abs(p.z-(start.z+(end.z-start.z)*(p.y-start.y)/(end.y-start.y))) for p in vertices)
        rear=CapCentre(bpy.data.objects['Cabin_Bpost'+str(sign)],True);front=CapCentre(bpy.data.objects['Cabin_Apost'+str(sign)],True);ys=[rear.y-.020+(front.y-rear.y+.040)*i/16 for i in range(17)]
        strip=[];seal=[]
        for y in ys:
            frameTop=start.z+(end.z-start.z)*(y-start.y)/(end.y-start.y)+radiusZ
            hit=tree.ray_cast(Vector((sign*.748,y,1.75)),Vector((0,0,1)))[0]
            if hit is None:raise RuntimeError('Side header falls outside roof footprint: '+str((side,y)))
            bottom=frameTop+.004;top=hit.z+.001
            if bottom>=top:raise RuntimeError('Window-frame roof clearance is too small for fixed header')
            strip.extend([(sign*.748,y,bottom),(sign*.748,y,top)]);seal.append((sign*.75,y,frameTop+.002))
        faces=[(i*2,(i+1)*2,(i+1)*2+1,i*2+1) for i in range(16)]
        if sign<0:faces=[tuple(reversed(face)) for face in faces]
        header=Mesh('Cabin_SideHeader'+side,strip,faces,'Paint',ROOT);solid=header.modifiers.new('HeaderMetalThickness','SOLIDIFY');solid.thickness=.012;solid.offset=0
        header['ConstructionEvidence']='Reconstructed fixed side header and weatherseal; exact factory fastening unverified'
        Tube('Cabin_SideHeaderSeal'+side,seal,.002,'Rubber',ROOT,6)
    # Two flat panes sit in a straight fixed upper seal. Close the arched band
    # above it instead of leaving an opening through the metal cab roof.
    upper=bpy.data.objects['Windshield_UpperSeal'];matrix=upper.matrix_world.copy();inverse=matrix.inverted()
    for vertex in upper.data.vertices:
        point=matrix@vertex.co;point.z-=frameDropM;vertex.co=inverse@point
    upperPoints=[matrix@v.co for v in upper.data.vertices];upperCentre=sum(upperPoints,Vector())/len(upperPoints);upperRadius=max(p.z-upperCentre.z for p in upperPoints)
    lowerPoints=[obj.matrix_world@v.co for side in [-1,1] for obj in [bpy.data.objects['Windshield_LowerSeal'+str(side)]] for v in obj.data.vertices];lowerCentre=sum(lowerPoints,Vector())/len(lowerPoints)
    for side in [-1,1]:
        glass=bpy.data.objects['Windshield_Glass'+str(side)];gm=glass.matrix_world.copy();gi=gm.inverted();points=[gm@v.co for v in glass.data.vertices];mid=(min(p.z for p in points)+max(p.z for p in points))/2
        for vertex,point in zip(glass.data.vertices,points):
            high=point.z>mid;point.y=upperCentre.y if high else lowerCentre.y;point.z=upperCentre.z+.001 if high else lowerCentre.z-.001;vertex.co=gi@point
    frontY=upperCentre.y+.004;bottom=upperCentre.z+upperRadius-.001;front=[]
    for i in range(33):
        x=-.72+1.44*i/32;hit=tree.ray_cast(Vector((x,frontY,1.75)),Vector((0,0,1)))[0]
        if hit is None or hit.z<=bottom:raise RuntimeError('Front header misses roof or upper weatherseal')
        front.extend([(x,frontY,bottom),(x,frontY,hit.z+.001)])
    panel=Mesh('Cabin_FrontHeader',front,[(i*2,i*2+1,(i+1)*2+1,(i+1)*2) for i in range(32)],'Paint',ROOT);solid=panel.modifiers.new('FrontHeaderMetalThickness','SOLIDIFY');solid.thickness=.012;solid.offset=0
    panel['ConstructionEvidence']='Reconstructed fixed arched front header; closes roof/windscreen band; exact factory construction unverified'
    ROOT['CabRoofContactReconstruction']='Moving upper window frame below fixed side header; thin rubber weatherseal is intended closed contact'
    ROOT['WindscreenReconstruction']='Two planar front panes, straight upper weatherseal and fixed arched metal header'


def FitPrimaryCabProfile():
    """Restore a shallower hard-cab crown for the closed front-quarter primary.

    The2.250m maximum remains fixed. Roof/upper-window skin is reconstructed;
    neither the old assembly-photo outline nor the guessed camera proves tooling.
    """
    for obj in list(ROOT.children_recursive):
        if obj.type!='MESH':continue
        roof=obj.name.startswith(('Cabin_CamberedRoof','Cabin_RainGutter','Cabin_RoofFrontLip'))
        upper=obj.name.startswith(('Cabin_Rear','Cabin_Apost','Cabin_Bpost','Door_Window','Windshield_'))
        if not roof and not upper:continue
        matrix=obj.matrix_world.copy();inverse=matrix.inverted()
        for vertex in obj.data.vertices:
            p=matrix@vertex.co;front=max(0,min(1,(p.y+.04894333)/1.01108621))
            delta=PRIMARY_CAB_SIDE_RELIEF_M*(abs(p.x)/.79)**2+PRIMARY_CAB_CAMBER_RELIEF_M*(abs(p.x)/.79)**4+PRIMARY_CAB_FRONT_LIFT_M*front if roof else PRIMARY_CAB_WINDOW_LIFT_M*max(0,min(1,(p.z-1.65)/.45))
            p.z+=delta;vertex.co=inverse@p
        obj.data.update()
    for obj in list(ROOT.children_recursive):
        if obj.name.startswith(('Cabin_SideHeader','Cabin_FrontHeader')):bpy.data.objects.remove(obj,do_unlink=True)
    # Frames have already received their clearance drop. Rebuild mating headers
    # from actual modified surfaces without applying that drop a second time.
    FitCabRoofContacts(frameDropM=0)
    for obj in ROOT.children_recursive:
        if obj.name=='Cabin_CamberedRoof' or obj.name in ['Cabin_SideHeaderLeft','Cabin_SideHeaderRight','Cabin_FrontHeader']:
            obj['PreserveRuntimeTopology']=True;obj['RuntimeBudgetLocked']=True
    roof=bpy.data.objects['Cabin_CamberedRoof'];corners=[roof.matrix_world@roof.data.vertices[i].co for i in [16*33+32,16*33,32,0]]
    ROOT['PrimaryCabRoofCornersBlender']=[v for p in corners for v in p]
    ROOT['PrimaryCabRoofReliefM']=[PRIMARY_CAB_SIDE_RELIEF_M,PRIMARY_CAB_CAMBER_RELIEF_M,PRIMARY_CAB_FRONT_LIFT_M]
    ROOT['PrimaryCabWindowLiftM']=PRIMARY_CAB_WINDOW_LIFT_M
    ROOT['PrimaryCabProfileEvidence']='Closed front-quarter hard-cab silhouette; shallower roof and taller upper frames reconstructed.2.250mmaximum retained; exact profile and camera not independently measured.'
    CopePrimaryCabSupports()


def CopePrimaryCabSupports():
    """Terminate fixed upper pillars/rear framing beneath the actual roof skin."""
    from mathutils.bvhtree import BVHTree
    bpy.context.view_layer.update();roof=bpy.data.objects['Cabin_CamberedRoof'];ev=roof.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh()
    tree=BVHTree.FromPolygons([roof.matrix_world@v.co for v in mesh.vertices],[tuple(p.vertices) for p in mesh.polygons],all_triangles=False);ev.to_mesh_clear();rows=[]
    for obj in ROOT.children_recursive:
        if obj.type!='MESH' or not obj.name.startswith(('Cabin_Rear','Cabin_Apost','Cabin_Bpost','Windshield_CenterPost')):continue
        matrix=obj.matrix_world.copy();inverse=matrix.inverted();changed=0;maximumTrim=0;fallback=0
        for vertex in obj.data.vertices:
            p=matrix@vertex.co
            if p.z<1.75:continue
            hit=tree.ray_cast(Vector((p.x,p.y,1.70)),Vector((0,0,1)))[0]
            if hit is None:
                nearest=tree.find_nearest(Vector((p.x,p.y,2.25)))
                if nearest[0] is None:raise RuntimeError('No roof edge for inferred cab support coping')
                ceiling=nearest[0].z-.015;fallback+=1
            else:ceiling=hit.z-.002
            if p.z>ceiling:
                maximumTrim=max(maximumTrim,p.z-ceiling);p.z=ceiling;vertex.co=inverse@p;changed+=1
        obj.data.update()
        if changed:rows.append({'name':obj.name,'verticesCoped':changed,'maximumTrimM':maximumTrim,'outsideFootprintQueries':fallback})
    ROOT['PrimaryCabCopingReport']=json.dumps(rows)
    ROOT['PrimaryCabCopingEvidence']='Fixed pillar/rear-wall ends fitted beneath evaluated roof.2mmassembly allowance and nearest-edge fallback for hidden rear framing are reconstructed, not factory joinery measurements.'


def VerifyPrimaryCabProfile():
    scene=bpy.context.scene;camera=bpy.data.objects['Camera_HistoricalPrimary'];roof=bpy.data.objects['Cabin_CamberedRoof'];observed=[[217,26],[394,43]]
    def Pixel(p):
        return ReferencePixel(camera,p,600,345)
    actual=[Pixel(roof.matrix_world@roof.data.vertices[i].co) for i in [16*33+32,16*33]]
    before=[Pixel(Vector(p)) for p in [(.79,.9621428847,2.08),(-.79,.9621428847,2.08)]]
    rms=lambda rows:math.sqrt(sum((v-t)**2 for p,target in zip(rows,observed) for v,t in zip(p,target))/4)
    maximum=max((roof.matrix_world@v.co).z for v in roof.data.vertices)
    allCabMaximum=max((o.matrix_world@v.co).z for o in ROOT.children_recursive if o.type=='MESH' and o.name.startswith(('Cabin_','Door_','DoorPanel_','DoorLower','Windshield_','Mirror_')) for v in o.data.vertices)
    report={'primaryPhoto':'Reference_HistoricalFront.jpg','cameraCalibrated':False,'observationsApproximate':True,'observedRoofFrontCornersPx':observed,'baselineV37Px':before,'actualRoofFrontCornersPx':actual,'baselineRmsPx':rms(before),'currentRmsPx':rms(actual),'roofMaximumM':maximum,'allCabStructureMaximumM':allCabMaximum,'wholeReferenceAcceptance':False,'progressScope':'Two roof-corner projections only, not full cab or whole-vehicle matching'}
    (QA/'Data_PrimaryCabSource.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    if abs(maximum-2.25)>.0001 or allCabMaximum>2.251 or report['currentRmsPx']>=report['baselineRmsPx']*.65:raise RuntimeError('Primary cab-profile progress/complete-cab metric anchor check failed')


def EmbedRecipeTexts():
    for suffix in ['Build.py','Textures.py','Pbr.py','Weathering.py','MetalWear.py','WheelLod.py','CabLod.py','Clean.mjs','SurfaceAudit.mjs','Verify.py','Record.mjs','Rebuild.mjs']:
        name='Script_IsuzuType94Truck'+suffix;text=bpy.data.texts.get(name) or bpy.data.texts.new(name);text.from_string((WORKSPACE/'Taierzhuang1938/_blender'/name).read_text(encoding='utf8'))


def SaveAndExport(stage='Grey'):
    EmbedRecipeTexts()
    scene=bpy.context.scene
    scene['AssetId']='IsuzuType94Truck';scene['IsuzuWorkspace']=str(WORKSPACE);scene['ModelStage']=stage
    scene['EvidenceBoundary']='Closed front-quarter period photo is primary;1936factory manual dimensional anchors; production photo secondary assembly evidence; museum four-wheel conversion excluded from chassis; exact historical identity unproven'
    cover=bpy.data.objects['Canvas_MainCover'];ROOT['PrimaryCanvasSourceMainTopM']=max((cover.matrix_world@v.co).z for v in cover.data.vertices)
    scene['FactoryNominalDimensionsM']=[5.4,1.9,2.25];scene['WheelbaseM']=[2.8,1.1]
    scene['PhotographicBodyLengthEstimatedM']=2.448-CARGO_PHOTO_REAR_Y+.005
    scene['NominalLengthConflict']=False
    scene['LengthEvidence']='Factory5.400m target is matched by the reconstructed asset; this does not establish the photographed chassis identity.'
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/('Scene_IsuzuType94Truck'+stage+'.blend')))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in ROOT.children_recursive+[ROOT]:obj.select_set(True)
    bpy.context.view_layer.objects.active=ROOT
    import contextlib,io
    for obj in ROOT.children_recursive:
        if obj.type=='MESH':
            mod=obj.modifiers.new('ExportTriangulation','TRIANGULATE');mod.keep_custom_normals=True
    with contextlib.redirect_stdout(io.StringIO()):
        bpy.ops.export_scene.gltf(filepath=str((QA if stage=='Grey' else OUT)/('Model_IsuzuType94Truck'+stage+'.glb')),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_animations=False,export_tangents=True)
    deps=bpy.context.evaluated_depsgraph_get();triangles=0
    for obj in ROOT.children_recursive:
        if obj.type=='MESH':
            mesh=obj.evaluated_get(deps).to_mesh();mesh.calc_loop_triangles();triangles+=len(mesh.loop_triangles);obj.evaluated_get(deps).to_mesh_clear()
    report={'stage':stage,'meshes':sum(o.type=='MESH' for o in ROOT.children_recursive),'triangles':triangles,'source':str(SOURCE/('Scene_IsuzuType94Truck'+stage+'.blend')),'dimensionsAnchorsM':[5.4,1.9,2.25],'wheelbaseM':[2.8,1.1],'rootChildren':len(ROOT.children),'movableNodes':[o.name for o in ROOT.children_recursive if o.type=='EMPTY' and o.get('MotionAxisBlender')]}
    (QA/('Data_'+stage+'Build.json')).write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report))

def Render(name='Camera_HistoricalPrimary',file='Scene_IsuzuGrey.png',width=1200,height=690):
    if os.environ.get('ISUZU_SKIP_STUDIO_RENDERS')=='1':
        print('Skipped optional studio preview: '+file,flush=True);return
    scene=bpy.context.scene;scene.camera=bpy.data.objects[name];scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.filepath=str(QA/file)
    bpy.ops.render.render(write_still=True)

def PoseJointAngle(name,angle):
    """Rotate on the authored local hinge, including its baseline inclination."""
    obj=bpy.data.objects[name]
    if 'RestRotationBlenderWxyz' not in obj:obj['RestRotationBlenderWxyz']=list(obj.matrix_basis.to_quaternion())
    base=Quaternion(obj['RestRotationBlenderWxyz']);axis={'X':(1,0,0),'Y':(0,1,0),'Z':(0,0,1)}[obj['MotionAxisBlender']]
    obj.rotation_mode='QUATERNION';obj.rotation_quaternion=base@Quaternion(Vector(axis),angle)

def SteeringSolution(inner):
    """One physical fixed-length1.20m linkage for preview and exported clips."""
    def Endpoint(side,angle):
        dx=-side*.05;dy=-.13
        return Vector((side*.65+dx*math.cos(angle)-dy*math.sin(angle),1.82+dx*math.sin(angle)+dy*math.cos(angle),.4218))
    if abs(inner)<1e-9:return 0,Endpoint(-1,0),Endpoint(1,0)
    left=Endpoint(-1,inner);lo=0;hi=inner
    for _ in range(48):
        mid=(lo+hi)/2;right=Endpoint(1,mid)
        if (right-left).length>1.20:hi=mid
        else:lo=mid
    outer=(lo+hi)/2
    return outer,left,Endpoint(1,outer)


def PoseSteering(inner):
    outer,left,right=SteeringSolution(inner)
    PoseJointAngle('Steer_Left',inner);PoseJointAngle('Steer_Right',outer)
    PoseJointAngle('SteeringWheel',inner*16.5)
    rod=bpy.data.objects['SteeringTieRod'];mid=(left+right)/2
    rod.location=(mid.x,mid.y,.4218)
    PoseJointAngle('SteeringTieRod',math.atan2(right.y-left.y,right.x-left.x))


def PoseReferenceInspection():
    PoseJointAngle('Hood_Right',-math.radians(BONNET_REFERENCE_TOP_DEG))
    PoseJointAngle('HoodSide_Right',-math.radians(BONNET_REFERENCE_SIDE_DEG))
    PoseJointAngle('RearCheek_Right',math.radians(BONNET_REFERENCE_CHEEK_DEG))
    PoseSteering(math.radians(REFERENCE_STEER_INNER_DEG))

def VerifyBonnetHinges():
    """Compare actual sheet-edge vertices with each authored closed hinge axis."""
    bpy.context.view_layer.update();checks=[]
    for side in [-1,1]:
        suffix='Left' if side<0 else 'Right'
        for pivotName,meshName,isTop in [('Hood_'+suffix,'BonnetTop_'+str(side),True),('HoodSide_'+suffix,'BonnetSide_Sheet'+str(side),False)]:
            pivot=bpy.data.objects[pivotName];mesh=bpy.data.objects[meshName]
            points=[mesh.matrix_world@v.co for v in mesh.data.vertices]
            endpoints=[points[0],points[12*17]] if isTop else [points[3],points[-1]]
            edge=(endpoints[1]-endpoints[0]).normalized()
            axis=(pivot.matrix_world.to_3x3()@Vector((0,1,0))).normalized()
            angle=axis.angle(edge)
            distances=[(point-pivot.matrix_world.translation).cross(axis).length for point in endpoints]
            checks.append({'node':pivotName,'axisErrorRad':angle,'maxHingeEdgeDistanceM':max(distances)})
            if angle>1e-5 or max(distances)>.0001:raise RuntimeError('Bonnet hinge is not on the actual sheet edge: '+str(checks[-1]))
            pivot['HingeClosedEndpointsGltf']=[component for point in endpoints for component in [point.x,point.z,-point.y]]
            if not isTop:pivot['PanelLowerClosedEndpointGltf']=[points[0].x,points[0].z,-points[0].y]
            pivot['HingeEvidence']='Photo-derived panel edge and inferred longitudinal joint; not independently proven historical hardware'
    ROOT['BonnetReferenceTopDegrees']=BONNET_REFERENCE_TOP_DEG
    ROOT['BonnetReferenceSideDegrees']=BONNET_REFERENCE_SIDE_DEG
    ROOT['BonnetPanelRawY']=list(BONNET_PANEL_RAW_Y)
    ROOT['BonnetSideOuterStartRawY']=BONNET_SIDE_OUTER_START_RAW_Y
    ROOT['BonnetFixedRearRawY']=list(BONNET_FIXED_REAR_RAW_Y)
    ROOT['BonnetRearCheekReferenceDegrees']=BONNET_REFERENCE_CHEEK_DEG
    ROOT['BonnetRearCheekAxisOutwardM']=.007;ROOT['BonnetRearCheekSkinOutwardM']=.003;ROOT['BonnetRearCheekInsetM']=.004
    ROOT['BonnetRearCheekInspectionWaypoints']=[0,0,.1,REAR_CHEEK_EARLY_OPEN_DEG,19/60,REAR_CHEEK_EARLY_OPEN_DEG,.5,BONNET_REFERENCE_CHEEK_DEG,1,BONNET_REFERENCE_CHEEK_DEG]
    ROOT['BonnetRearCheekEvidence']='Independent rear plain service leaves are a mechanically tested photographic reconstruction; no surviving factory hinge drawing was found. Not historical hardware certification.'
    ROOT['BonnetRearCheekFrontReliefM']=REAR_CHEEK_FRONT_RELIEF_M
    ROOT['BonnetRearCheekEarlyDegrees']=REAR_CHEEK_EARLY_OPEN_DEG
    ROOT['BonnetWorldRearY']=BONNET_WORLD_REAR_Y;ROOT['BonnetWorldLength']=BONNET_WORLD_LENGTH
    ROOT['HeadlightCentreTrackM']=2*FRONT_HEADLIGHT_ABS_X;ROOT['HeadlightForwardCorrectionM']=FRONT_HEADLIGHT_FORWARD_M;ROOT['HeadlightHeightCorrectionM']=-FRONT_HEADLIGHT_DROP_M
    ROOT['HeadlightLampScale']=FRONT_LAMP_SCALE;ROOT['RadiatorWidthScale']=FRONT_RADIATOR_WIDTH_SCALE;ROOT['BonnetFrontWidthM']=2*(.61-BONNET_TAPER_M)
    ROOT['HeadlightLampBarrelShortenRawM']=FRONT_LAMP_BARREL_SHORTEN_RAW_M
    ROOT['ReferenceSteerInnerDegrees']=REFERENCE_STEER_INNER_DEG
    ROOT['ReferenceCameraLocationBlender']=list(REFERENCE_CAMERA_LOCATION)
    ROOT['ReferenceCameraTargetBlender']=list(REFERENCE_CAMERA_TARGET)
    ROOT['ReferenceCameraLensMm']=REFERENCE_CAMERA_LENS_MM
    ROOT['ReferenceCameraRollDegrees']=REFERENCE_CAMERA_ROLL_DEG
    ROOT['ReferencePrincipalPointPixels']=list(REFERENCE_PRINCIPAL_POINT_PX)
    ROOT['CrossbarHeightCorrectionM']=-FRONT_CROSSBAR_DROP_M
    ROOT['RadiatorHeightCorrectionM']=-FRONT_RADIATOR_DROP_M
    ROOT['BonnetRearCrownM']=BONNET_TOP_REAR_Z
    ROOT['BonnetFrontCrownM']=BONNET_TOP_REAR_Z-BONNET_TOP_HEIGHT_DIFFERENCE
    ROOT['StarForwardCorrectionM']=FRONT_STAR_FORWARD_M
    (QA/'Data_BonnetSourceHinges.json').write_text(json.dumps({'checks':checks,'physicalSheetEdgesVerified':True},indent=2),encoding='utf8')

def VerifyMechanicalAxes():
    """Check real hardware centres, and that moving barrels stay on the body."""
    bpy.context.view_layer.update();checks=[]
    def Sections(name):
        obj=bpy.data.objects[name];half=len(obj.data.vertices)//2;matrix=obj.matrix_world
        return [sum((matrix@v.co for v in obj.data.vertices[:half]),Vector())/half,sum((matrix@v.co for v in obj.data.vertices[half:]),Vector())/half]
    definitions=[]
    for side in ['Left','Right']:definitions.append(('Door_'+side,['Door_Hinge'+side+str(z) for z in [1.11,1.49]],'Z',math.radians(-76 if side=='Left' else 76)))
    definitions.append(('Tailgate',['Tailgate_Hinge'+str(x) for x in [-.65,.65]],'X',math.radians(94)))
    definitions.append(('SteeringWheel',['Steering_Column'],'Z',None))
    for side in ['Left','Right']:definitions.append(('Steer_'+side,['Front_Kingpin'+side],'Z',None))
    for side in ['Left','Right']:definitions.append(('RearCheek_'+side,['BonnetRearCheekBarrel_'+side+'_1'],'Z',math.radians(-90 if side=='Left' else 90)))
    for name,parts,axisName,turn in definitions:
        node=bpy.data.objects[name];axis=(node.matrix_world.to_3x3()@Vector({'X':(1,0,0),'Z':(0,0,1)}[axisName])).normalized();origin=node.matrix_world.translation
        points=[point for part in parts for point in Sections(part)];deviation=max((point-origin).cross(axis).length for point in points)
        checks.append({'feature':name+' real hardware axis','maxDistanceM':deviation,'toleranceM':.0001,'passed':deviation<.0001})
        ordered=sorted(points,key=lambda p:p.dot(axis));ends=[ordered[0],ordered[-1]]
        node['MechanicalAxisClosedEndpointsGltf']=[v for p in ends for v in [p.x,p.z,-p.y]]
        node['MechanicalAxisEvidence']='Measured actual source hardware cap centres, not only an invariant pivot'
        if turn is not None:
            PoseJointAngle(name,turn);bpy.context.view_layer.update();moved=[point for part in parts for point in Sections(part)]
            drift=max((a-b).length for a,b in zip(points,moved));checks.append({'feature':name+' moving hinge barrels stay fixed on shaft','maxDriftM':drift,'toleranceM':.0001,'passed':drift<.0001})
            PoseJointAngle(name,0);bpy.context.view_layer.update()
    report={'checks':checks,'failed':[c for c in checks if not c['passed']]}
    (QA/'Data_MechanicalAxisSource.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    if report['failed']:raise RuntimeError('Actual hardware axis verification failed: '+str(report['failed']))


def ReferencePixel(camera,point,width,height):
    """Explicit horizontal-sensor projection, independent of preview aspect."""
    p=camera.matrix_world.inverted()@point;focal=camera.data.lens*width/camera.data.sensor_width;depth=-p.z
    return [width*.5-camera.data.shift_x*width+focal*p.x/depth,height*.5+camera.data.shift_y*width-focal*p.y/depth]


def VerifyPhotographicBody(gate=True):
    """Independent image annotations catch the old short body and missing flaps."""
    from bpy_extras.object_utils import world_to_camera_view
    bpy.context.view_layer.update()
    scene=bpy.context.scene;camera=bpy.data.objects['Camera_ProductionMatch'];checks=[]
    def Pixel(point):
        return ReferencePixel(camera,point,600,410)
    rail=bpy.data.objects['Cargo_TopRail1'];points=[rail.matrix_world@v.co for v in rail.data.vertices]
    rear=Vector((max(p.x for p in points),min(p.y for p in points),max(p.z for p in points)))
    actual=Pixel(rear);observed=[65,211]
    checks.append({'feature':'Near rear top-rail corner','observedPx':observed,'actualPx':actual,'tolerancePx':4,'passed':max(abs(a-b) for a,b in zip(actual,observed))<4})
    # The old rear lower bound166 followed the main-sheet fold below the flap.
    # The continuous flap hem is near157–159; retain the original5px box gate
    # and verify the actual imported lower boundary more strictly afterwards.
    boxes=[[210,113,244,149],[155,124,198,156],[97,130,138,159]]
    for index,observed in enumerate(boxes):
        obj=bpy.data.objects['Canvas_SideClosure1_'+str(index)];pixels=[Pixel(obj.matrix_world@v.co) for v in obj.data.vertices]
        actual=[min(p[0] for p in pixels),min(p[1] for p in pixels),max(p[0] for p in pixels),max(p[1] for p in pixels)]
        checks.append({'feature':'Photographed canvas closure '+str(index),'observedBoxPx':observed,'actualBoxPx':actual,'tolerancePx':5,'passed':max(abs(a-b) for a,b in zip(actual,observed))<5})
    report={'source':'Secondary600x410production/assembly photograph; retained cargo-component landmarks, not current primary acceptance','gateForCurrentPrimary':gate,'checks':checks,'nominalLengthConflict':False}
    (QA/'Data_PhotographicBodyLandmarks.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    if gate and any(not c['passed'] for c in checks):raise RuntimeError('Photo body landmark verification failed: '+str(checks))

def VerifyPhotographicCab(gate=True):
    from bpy_extras.object_utils import world_to_camera_view
    bpy.context.view_layer.update();scene=bpy.context.scene;camera=bpy.data.objects['Camera_ProductionMatch'];checks=[]
    def Pixel(point):
        return ReferencePixel(camera,point,600,410)
    panel=bpy.data.objects['DoorPanel_Right'];points=[panel.matrix_world@v.co for v in panel.data.vertices];outside=max(p.x for p in points)
    corners=[p for p in points if p.x>outside-.0001]
    observed=[[266,277],[356,277],[359,202],[268,194]]
    for index,(point,target) in enumerate(zip(corners,observed)):
        actual=Pixel(point);checks.append({'feature':'Near door corner '+str(index),'actualPx':actual,'observedPx':target,'tolerancePx':3,'passed':max(abs(a-b) for a,b in zip(actual,target))<3})
    ROOT['CabDoorCornersGltf']=[v for p in corners for v in [p.x,p.z,-p.y]]
    roof=bpy.data.objects['Cabin_CamberedRoof'];roofPoints=[roof.matrix_world@roof.data.vertices[i].co for i in [32,16*33+32]]
    for index,(point,target) in enumerate(zip(roofPoints,[[274,142],[359,132]])):
        actual=Pixel(point);checks.append({'feature':'Near roof corner '+str(index),'actualPx':actual,'observedPx':target,'tolerancePx':5,'passed':max(abs(a-b) for a,b in zip(actual,target))<5})
    ROOT['CabRoofNearCornersGltf']=[v for p in roofPoints for v in [p.x,p.z,-p.y]]
    far=roof.matrix_world@roof.data.vertices[16*33].co;ROOT['CabFarForeRoofGltf']=[far.x,far.z,-far.y]
    (QA/'Data_PhotographicCabSource.json').write_text(json.dumps({'source':'Secondary600x410production/assembly photograph; manual edge annotations','gateForCurrentPrimary':gate,'checks':checks,'note':'Old assembly outline is retained as diagnostic evidence. User changed primary appearance target to the closed600x345front-quarter photograph.'},indent=2),encoding='utf8')
    if gate and any(not c['passed'] for c in checks):raise RuntimeError('Photo cab landmark verification failed: '+str(checks))


def VerifyReferencePose(gate=True):
    from bpy_extras.object_utils import world_to_camera_view
    bpy.context.view_layer.update();scene=bpy.context.scene;camera=bpy.data.objects['Camera_ProductionMatch'];checks=[]
    def Pixel(point):
        return ReferencePixel(camera,point,600,410)
    for name,target in zip(['Wheel_FrontRight','Wheel_Rear1Right','Wheel_Rear2Right'],[[446,309],[208,310],[134,310]]):
        obj=bpy.data.objects[name+'_HubCap'];points=[obj.matrix_world@v.co for v in obj.data.vertices];center=sum(points,Vector())/len(points)
        actual=Pixel(center);checks.append({'feature':'Actual posed hub '+name,'actualPx':actual,'observedPx':target,'tolerancePx':2,'passed':max(abs(a-b) for a,b in zip(actual,target))<2})
    wheel=bpy.data.objects['Wheel_FrontRight'];center=wheel.matrix_world.translation
    for sign,target in [(1,258),(-1,360)]:
        actual=Pixel(center+Vector((0,0,sign*.4318)))[1]
        checks.append({'feature':'Nominal34-inch tyre '+('crown' if sign>0 else 'ground'),'actualRow':actual,'observedRow':target,'tolerancePx':2,'passed':abs(actual-target)<2})
    raw=list(ROOT['CabFarForeRoofGltf']);far=Vector((raw[0],-raw[2],raw[1]));direction=(far-camera.location).normalized()
    obj=bpy.data.objects['BonnetSide_Sheet1'].evaluated_get(bpy.context.evaluated_depsgraph_get());inverse=obj.matrix_world.inverted()
    hit,point,normal,face=obj.ray_cast(inverse@camera.location,inverse.to_3x3()@direction)
    occluded=hit and (obj.matrix_world@point-camera.location).length<(far-camera.location).length-.01
    checks.append({'feature':'Raised side leaf actually occludes far visor corner','passed':bool(occluded)})
    (QA/'Data_ReferencePoseSource.json').write_text(json.dumps({'checks':checks,'steerInnerDeg':REFERENCE_STEER_INNER_DEG,'gateForCurrentPrimary':gate,'role':'Secondary production/assembly inspection pose; not current primary closed appearance'},indent=2),encoding='utf8')
    if gate and any(not c['passed'] for c in checks):raise RuntimeError('Reference pose verification failed: '+str(checks))

def Build():
    global MATS,ROOT
    if bpy.data.filepath and not Path(bpy.data.filepath).resolve().is_relative_to(SOURCE.resolve()):
        raise RuntimeError('Refusing to replace a Blender scene outside the IsuzuType94Truck source directory')
    # Rebuilding this task-owned file must not depend on selection, local view
    # or object visibility left by an earlier inspection.
    bpy.context.scene.frame_set(1)
    for obj in list(bpy.data.objects):bpy.data.objects.remove(obj,do_unlink=True)
    bpy.context.view_layer.update()
    for data in list(bpy.data.materials):bpy.data.materials.remove(data)
    bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1
    MATS=Materials();ROOT=Pivot('IsuzuType94Truck');ROOT['NoseDirectionBlender']='+Y';ROOT['NoseDirectionGltf']='-Z'
    ROOT['ReferenceConfiguration']='Complete ordinary6x4cargo truck; user-selected closed front-quarter period photograph is primary. Production photograph is secondary assembly evidence; four-wheel museum conversion is not chassis evidence.'
    ROOT['ReferenceCandidateVersion']=MODEL_REVISION
    ROOT['PrimaryFrontEvidence']='Closed-front-quarter photo-guided front revision; symmetric lamps and unchanged factory chassis anchors. Lamp spacing,bumper width,fore-tip pressing and camera/crop/steering remain reconstruction; exact variant and optics unproven';ROOT['PrimaryReferenceImage']='Reference_HistoricalFront.jpg';ROOT['PrimaryCameraLocationBlender']=list(PRIMARY_CAMERA_LOCATION);ROOT['PrimaryCameraTargetBlender']=list(PRIMARY_CAMERA_TARGET);ROOT['PrimaryCameraLensMm']=PRIMARY_CAMERA_LENS_MM;ROOT['PrimaryCameraRollDegrees']=PRIMARY_CAMERA_ROLL_DEG;ROOT['PrimaryCameraCalibrated']=False;ROOT['PrimaryCameraPrincipalPointPixels']=list(PRIMARY_CAMERA_PRINCIPAL_PX)
    ROOT['PrimaryReferenceSteerInnerDegrees']=PRIMARY_REFERENCE_STEER_INNER_DEG
    ROOT['PrimaryReferencePoseEvidence']='Visible near lower tyre arcs,far tyre outer arc and near tandem arcs inform a joint camera/steering hypothesis. Axle spacing/tracks and nominal tyres held fixed; caps,bright blobs,axle-shadow-contaminated rows and road lines excluded.12degreeinner reference steering is inferred,not a factory angle. Exported rest pose remains straight.'
    ROOT['PressedDiscMethod']='Continuous welded axisymmetric pressing with eight actual oval holes, explicit sheet walls and analytic front normals; protected through runtime LOD'
    ROOT['PressedDiscHistoricalProfileProven']=False
    ROOT['WheelHubCapCornerRadiusM']=WHEEL_HUB_CAP_CORNER_RADIUS_M
    ROOT['WheelHubCapPhaseDegrees']=WHEEL_HUB_CAP_PHASE_DEG
    ROOT['WheelHubCapOutlineEvidence']='1936manual scan09front/rear central outlines measured at approximately56.8/55.1mmcorner radius relative to34x6tyres.56mmcommon radius,six flats and drawing phase are reconstruction;cap function,photo variant and axial depth unproven.'
    ROOT['WheelVentPitchRadiusM']=WHEEL_VENT_PITCH_RADIUS_M
    ROOT['WheelVentRadialSemiaxisM']=WHEEL_VENT_RADIAL_SEMIAXIS_M
    ROOT['WheelVentTangentialSemiaxisM']=WHEEL_VENT_TANGENTIAL_SEMIAXIS_M
    ROOT['WheelVentPatternEvidence']='1936factory manual scan09:16front/rear drawing outlines have tangential major axes and pitch/tyre radius approximately0.50. Dimensions here are draw-derived reconstruction,not printed factory measurements; rim,tyre,nuts,hub and axial profile retained.'
    ROOT['RoadWheelLugPhaseDegrees']=ROAD_WHEEL_LUG_PHASE_DEG
    ROOT['RoadWheelNutSeatProfileMetres']=[value for a,r in ROAD_WHEEL_NUT_SEAT_PROFILE for value in [a*.1524/.25,r*.2864/.266]]
    ROOT['RoadWheelNutSeatEvidence']='Six reconstructed hub mounting collars bridge existing hub cylinders to unchanged nut backs. Flat support annulus and concealed hub engagement correct a27mm source gap; this profile is not a factory measurement. Tyres,outer rims,perforated pressings,hubs,caps,nut positions and unhubbed side spare retained.'
    ROOT['RoadWheelLugClockingEvidence']='1936factory overall drawing, scan09: front and rear side elevations show eight wheel nuts halfway between eight ventilation openings.22.5degrees is the reconstructed half-pitch of the evenly spaced8+8patterns, not a printed angle or a photographed wheel roll phase. Rim/hub dimensions and axial profile remain inferred.'
    Chassis();Fenders();Front();Cabin();Engine();Cargo();Canvas();FitReferenceBody();FitFrontFrameContacts();FitCabPhotographicHeight();FitCabAndCoverPhotographicDetails();FitRearFenderCargoContacts();FitCanvasFrontBoundary();FitPrimaryCanvasProfile();FitCanvasBowContacts();FitCanvasLowerOverlap();FitPrimaryForeFlap();FitCabRoofContacts();FitPrimaryCabProfile();FitCowlCollar();FitPrimaryCanvasHeaderFolds();VerifyBonnetHinges()
    for side in [-1,1]:
        name='Left' if side<0 else 'Right'
        steering=Pivot('Steer_'+name,(side*.65,1.82,.4318),ROOT,'Z',[-28,28])
        Cylinder('Front_Kingpin'+name,(side*.65,1.82,.4318),.028,.14,'Steel','Z',ROOT,24)
        Cylinder('Front_StubAxle'+name,(side*.70,1.82,.4318),.035,.20,'Steel','X',steering,24)
        Tube('Front_SteeringArm'+name,[(side*.65,1.82,.4318),(side*.60,1.69,.4218)],.018,'Steel',steering,10)
        MakeWheel('Wheel_Front'+name,side*.75,1.82,.4318,steering)
        MakeWheel('Wheel_Rear1'+name,side*.725,-.98,.4318,ROOT)
        MakeWheel('Wheel_Rear2'+name,side*.725,-2.08,.4318,ROOT)
    SideSpare()
    FitFarMirrorOrientation()
    FitServiceSaddle();VerifyBonnetHinges();VerifyMechanicalAxes();AssignUV();Studio();VerifyPhotographicBody(gate=False);VerifyPhotographicCab(gate=False);VerifyPrimaryCabProfile();SaveAndExport('Grey')
    PoseReferenceInspection()
    VerifyReferencePose(gate=False)
    Render(name='Camera_ProductionMatch',file='Scene_GreySecondaryAssembly.png',width=1500,height=1025)
    PoseJointAngle('Hood_Right',0);PoseJointAngle('HoodSide_Right',0)
    PoseJointAngle('RearCheek_Right',0)
    PoseSteering(0)

if __name__ in ('__main__','builtins'):Build()
