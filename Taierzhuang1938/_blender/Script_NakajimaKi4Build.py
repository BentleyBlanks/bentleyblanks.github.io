"""Photo/manual-led Ki-4 authoring source. Execute through Script_BlenderMcp.mjs.

The original editable source is external; repository outputs contain no review images.
Build stage defaults to gray. Set KI4_STAGE=pbr only after checking gray renders.
Blender coordinates: X lateral, +Y nose, Z up; glTF converts nose to -Z.
"""
import bpy, bmesh, math, json, os, pathlib, random, hashlib
from mathutils import Vector,Matrix,Quaternion
from mathutils.bvhtree import BVHTree
from math import sin, cos, pi, sqrt

scriptPath=pathlib.Path(globals().get('__file__','Taierzhuang1938/_blender/Script_NakajimaKi4Build.py')).resolve()
repoRoot = scriptPath.parents[2]
assetRoot = pathlib.Path(os.environ.get('KI4_ASSET_ROOT',str(repoRoot / 'Taierzhuang1938/Model/NakajimaKi4')))
sourceRoot = pathlib.Path(os.environ.get('KI4_SOURCE_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/SurfaceV2'))
evidenceRoot = sourceRoot / 'Evidence'
for folder in [assetRoot, sourceRoot, evidenceRoot]: folder.mkdir(parents=True, exist_ok=True)
stage = os.environ.get('KI4_STAGE', 'gray')
fuselageSurfaceProfile=os.environ.get('KI4_FUSELAGE_SURFACE_PROFILE','LegacySurfaceV2')
assert fuselageSurfaceProfile in ['LegacySurfaceV2','Photo02QuietRoughness']
if stage=='pbr':
    materialRecipe=json.loads((sourceRoot/'Textures/Data_TextureRecipes.json').read_text(encoding='utf8'))['Fuselage']
    assert materialRecipe.get('fuselageSurfaceProfile','LegacySurfaceV2')==fuselageSurfaceProfile,'Bake the declared body-surface profile before rebuilding PBR'
    if fuselageSurfaceProfile=='Photo02QuietRoughness':
        assert materialRecipe['roughnessContrast']['reviewedDecodedRgbSha256']=='64111b2ce75cca5803731a0e9dc5b2d7c5018ad0f3df72b70f50fbf8317a5726'
        assert materialRecipe['channels']['Orm']['sha256']==hashlib.sha256((sourceRoot/'Textures/Texture_Ki4FuselageOrm.png').read_bytes()).hexdigest(),'The declared roughness recipe must bind the actual input PNG'
geometryAoEnabled=os.environ.get('KI4_GEOMETRY_AO','0')=='1'
assert not geometryAoEnabled or stage=='pbr','Geometry AO requires the complete PBR materials'
geometryProfile=os.environ.get('KI4_GEOMETRY_PROFILE','ManualV3')
assert geometryProfile in ['ManualV3','PhotoMountCandidateV4'], 'Unknown Ki4 geometry profile'
observerConfiguration=os.environ.get('KI4_OBSERVER_CONFIGURATION','TwinReconstruction')
assert observerConfiguration in ['TwinReconstruction','Photo02Carrier'], 'Unknown observer exterior configuration'
observerFinish=os.environ.get('KI4_OBSERVER_FINISH','DarkSteel')
assert observerFinish in ['DarkSteel','PaintedGray'], 'Unknown observer finish profile'
noseOffsetM=.548 if geometryProfile=='PhotoMountCandidateV4' else 0
bodyFrontY=2.25-noseOffsetM if noseOffsetM else 2.580
scene = bpy.context.scene
assert scene.get('BlenderMcpTask') in [None, 'NakajimaKi4'], 'Refusing another task scene'
if bpy.data.filepath:
    assert 'NakajimaKi4' in bpy.data.filepath, 'Refusing another source project'
for collection in list(bpy.data.collections):
    if collection.name in ['Source_EditableCurveGuides','Source_UnresolvedObserverAccessories']:
        for guide in list(collection.objects):bpy.data.objects.remove(guide,do_unlink=True)
        bpy.data.collections.remove(collection)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.data.orphans_purge(do_recursive=True)
scene['BlenderMcpTask'] = 'NakajimaKi4'
scene.unit_settings.system = 'METRIC'; scene.unit_settings.scale_length = 1;scene.unit_settings.length_unit='METERS'
random.seed(94)
root = bpy.data.objects.new('NakajimaKi4', None); scene.collection.objects.link(root)
root['source'] = 'NDL 8815746, May 1937 manual + three original Ki-4 photographs'
root['historicalScope'] = 'Same-type reference; Tengxian participation not established by this model'
root['dimensionsSource'] = 'NDL canvas 5: span12.000m, length8.250m, height3.310m'
root['reconstructionScope'] = 'Unresolved colors, hidden internals and precise serial are inferred'
root['version'] = os.environ.get('KI4_CANDIDATE_VERSION','20261025ReferenceV11')
root['aluminumPbrBasis']='Conductor normal-incidence reflectance; generic Filament aluminum sRGB.91,.92,.92, with inferred oxide/patina on skin/cast parts. Historical color not established.'
root['geometryProfile']=geometryProfile;root['frontInstallationOffsetM']=noseOffsetM
root['fuselageSurfaceProfile']=fuselageSurfaceProfile
root['fuselageSurfaceScope']='The optional Photo02QuietRoughness profile changes only the body ORM green-channel variance around its retained mean. Base, normal, AO and metallic values are retained. Appearance reconstruction, not a historical roughness measurement.'
if noseOffsetM:
    root['version']='20261024PhotoMountCandidateV4'
    root['dimensionsSource']='Unverified photo-mount candidate: shared printed wing/tail dimensions; the forward548mm mount bay is omitted as a hypothesis. Not an accepted historical subtype.'

def Material(name, color, rough=.5, metal=0):
    mat=bpy.data.materials.new('Material_'+name); mat.use_nodes=True
    bs=mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*((.43,.43,.43) if stage=='gray' else color),1)
    bs.inputs['Roughness'].default_value=.72 if stage=='gray' else rough
    bs.inputs['Metallic'].default_value=0 if stage=='gray' else metal
    return mat

mats={
 'Skin':Material('AluminumSkin',(.48,.51,.50),.47,.75),
 'Fabric':Material('SilverDopedLinen',(.56,.58,.56),.67,.05),
 'TailFabric':Material('DopedLinenTail',(.53,.52,.475),.64,.02),
 'RibTape':Material('DopedLinenRibTape',(.60,.59,.56),.76,.02),
 'EngineCast':Material('EngineCastAluminum',(.45,.46,.43),.61,.78),
 'Cowl':Material('DarkCowlEnamel',(.018,.023,.024),.36,.15),
 'Steel':Material('OxidizedSteel',(.105,.12,.125),.48,.8),
 'Bright':Material('MachinedAluminum',(.46,.5,.52),.32,.9),
 'Tire':Material('WeatheredRubber',(.028,.031,.029),.87,0),
 'Dark':Material('CockpitShadow',(.035,.04,.034),.8,0),
 'Leather':Material('SeatAndCoaming',(.12,.071,.039),.7,0),
 'Exhaust':Material('HeatOxidizedExhaust',(.13,.085,.058),.83,.65),
 'Red':Material('HinomaruVermilion',(.36,.018,.012),.65,0),
 'Dial':Material('InstrumentFaces',(.012,.016,.015),.5,.12),
 'Wire':Material('RiggingCable',(.16,.18,.18),.38,.95)
}
uvDomains={'Skin':(1.5,1.5),'Bright':(1.5,1.5),'Steel':(.5,.5),'Wire':(.5,.5),'EngineCast':(.5,.5),'Exhaust':(1.5,.34),'Leather':(.4,.4),'Tire':(2.70,.29),'Fabric':(6,2),'RibTape':(.014,.20)}
glass=Material('Windscreen',(.94,.97,.96),.06,0)
if stage!='gray':
    # KHR_materials_transmission represents a complete glass surface; alpha is
    # geometric coverage. The old .32 alpha incorrectly removed most of it.
    bs=glass.node_tree.nodes.get('Principled BSDF');bs.inputs['Transmission Weight'].default_value=.94
    bs.inputs['Alpha'].default_value=1;bs.inputs['IOR'].default_value=1.48
    glass['surfaceScope']='Full-coverage thin transmissive glass; tint/roughness inferred, not measured Ki-4 glazing'

def Parent(obj, parent=root):
    obj.parent=parent
    return obj

def Mesh(name, verts, faces, mat='Skin', uv=None, parent=None, smooth=True):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free();mesh.update()
    obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj);Parent(obj,parent or root)
    mesh.materials.append(mats[mat] if isinstance(mat,str) else mat)
    if uv is not None:
        layer=mesh.uv_layers.new(name='UVMap')
        for poly in mesh.polygons:
            for idx in poly.loop_indices: layer.data[idx].uv=uv[mesh.loops[idx].vertex_index]
    else:
        layer=mesh.uv_layers.new(name='UVMap')
        for poly in mesh.polygons:
            axis=max(range(3), key=lambda i:abs(poly.normal[i])); a,b=[i for i in range(3) if i!=axis]
            for idx in poly.loop_indices:
                v=mesh.vertices[mesh.loops[idx].vertex_index].co
                domain=uvDomains.get(mat,(1.5,1.5)) if isinstance(mat,str) else (1.5,1.5)
                layer.data[idx].uv=(v[a]/domain[0],v[b]/domain[1])
    for p in mesh.polygons:p.use_smooth=smooth
    return obj

def Pivot(name, position, axis, limits):
    obj=bpy.data.objects.new(name,None);scene.collection.objects.link(obj);Parent(obj);obj.location=position
    obj['sourceHingeAxis']=axis;obj['hingeAxis']={'X':'X','Y':'-Z','Z':'Y'}[axis];obj['rangeDegrees']=limits;obj['units']='meters'
    return obj

def MoveUnder(obj,parent):
    bpy.context.view_layer.update()
    world=obj.matrix_world.copy();obj.parent=parent;obj.matrix_world=world
    return obj

def Tube(name,a,b,r,mat='Steel',sides=12,parent=None):
    a,b=Vector(a),Vector(b);d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides,radius=r,depth=d.length,location=(a+b)/2)
    obj=bpy.context.object;obj.name=name;obj.rotation_mode='QUATERNION';obj.rotation_quaternion=d.to_track_quat('Z','Y')
    obj.data.materials.append(mats[mat]);Parent(obj)
    # Cylindrical wall and planar caps use actual metre UVs. Primitive default
    # UVs otherwise squash a 1.5m metal sample into a 20mm pushrod or bolt.
    domain=uvDomains.get(mat)
    for p in obj.data.polygons:
        p.use_smooth=abs(p.normal.z)<.5
        if domain:
            angles=[math.atan2(obj.data.vertices[obj.data.loops[i].vertex_index].co.y,obj.data.vertices[obj.data.loops[i].vertex_index].co.x)%(2*pi) for i in p.loop_indices]
            crosses=max(angles)-min(angles)>pi
            for idx,angle in zip(p.loop_indices,angles):
                v=obj.data.vertices[obj.data.loops[idx].vertex_index].co
                if abs(p.normal.z)<.5:
                    if crosses and angle<pi:angle+=2*pi
                    obj.data.uv_layers.active.data[idx].uv=(angle*r/domain[0],(v.z+d.length/2)/domain[1])
                else:obj.data.uv_layers.active.data[idx].uv=(v.x/domain[0],v.y/domain[1])
    if parent:MoveUnder(obj,parent)
    return obj

def Ellipsoid(name,loc,scale,mat='Skin',seg=32,rings=16,parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=loc)
    obj=bpy.context.object;obj.name=name;obj.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.append(mats[mat]);Parent(obj)
    if mat in uvDomains:
        # Approximate ellipsoid meridian lengths preserve the selected sample scale.
        domain=uvDomains[mat]
        for loop in obj.data.uv_layers.active.data:
            loop.uv.x*=2*pi*sqrt((scale[0]**2+scale[1]**2)/2)/domain[0]
            loop.uv.y*=pi*sqrt((scale[0]**2+scale[2]**2)/2)/domain[1]
    for p in obj.data.polygons:p.use_smooth=True
    if parent:MoveUnder(obj,parent)
    return obj

def Curve(name,pts,r,mat='Wire',closed=False,parent=None):
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.resolution_u=2;data.bevel_depth=r;data.bevel_resolution=2
    sp=data.splines.new('POLY');sp.points.add(len(pts)-1)
    for p,co in zip(sp.points,pts):p.co=(*co,1)
    sp.use_cyclic_u=closed
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);data.materials.append(mats[mat]);Parent(obj)
    if parent:MoveUnder(obj,parent)
    return obj

def ExhaustPipe(name,control,r):
    # Smooth the photographed collector bends and unwrap by path arc length.
    controls=[Vector(p) for p in control];points=[]
    for k in range(len(controls)-1):
        a=controls[max(0,k-1)];b=controls[k];c=controls[k+1];d=controls[min(len(controls)-1,k+2)]
        for j in range(8):
            t=j/8
            points.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
    points.append(controls[-1]);vv=[];ff=[];uv=[];arc=0;nr=16
    for k,point in enumerate(points):
        tangent=(points[min(k+1,len(points)-1)]-points[max(0,k-1)]).normalized()
        across=tangent.cross(Vector((1,0,0))).normalized();up=tangent.cross(across).normalized()
        if k:arc+=(point-points[k-1]).length
        for j in range(nr+1):
            angle=2*pi*j/nr;vv.append(point+r*(across*cos(angle)+up*sin(angle)));uv.append((arc/1.5,angle*r/.34))
    for k in range(len(points)-1):
        for j in range(nr):
            a=k*(nr+1)+j;ff.append((a,a+1,a+nr+2,a+nr+1))
    return Mesh(name,vv,ff,'Exhaust',uv)

def Box(name,loc,scale,mat='Steel',bevel=.01,parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);obj=bpy.context.object;obj.name=name;obj.dimensions=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);obj.data.materials.append(mats[mat]);Parent(obj)
    if bevel:
        mod=obj.modifiers.new('EdgeRadius','BEVEL');mod.width=bevel;mod.segments=3
        obj.modifiers.new('WeightedNormals','WEIGHTED_NORMAL')
    if parent:MoveUnder(obj,parent)
    return obj

def Interp(table,t,col=1):
    if t<=table[0][0]:return table[0][col]
    if t>=table[-1][0]:return table[-1][col]
    for a,b in zip(table,table[1:]):
        if a[0]<=t<=b[0]:
            f=(t-a[0])/(b[0]-a[0]);return a[col]*(1-f)+b[col]*f

# Canvas64 has frames 1,2,3,4,4.5,5,6,7. The last frame is the rudder
# post, not the rudder's aft tip. Heights/oval ratios are proportional traces
# calibrated to the dimensioned bays, not individually printed dimensions.
wheelRadius=.43;wheelStation=1.64
frameStations=[wheelStation-.860]
for spacing in [.945,1.130,.515,.620,.615,.560,.215]:frameStations.append(frameStations[-1]-spacing)
sections=[(-3.820,.088,.2675,1.80),(-3.605,.147,.300,1.80),(-3.045,.248,.3675,1.81),(-2.430,.358,.4475,1.82),(-1.810,.430,.510,1.84),(-1.295,.490,.565,1.85),(-.165,.575,.6775,1.87),(.780,.625,.715,1.87),(1.650,.620,.680,1.88),(2.300,.610,.625,1.90),(2.580,.590,.590,1.90)]
if noseOffsetM:sections=[p for p in sections if p[0]<=.780]+[(1.15,.622,.700,1.81),(1.47,.617,.660,1.81),(bodyFrontY,.608,.608,1.81)]
bodyAxisZ=1.810
tailPostTilt=math.radians(8)
sections=[(y,rx,rz,bodyAxisZ) for y,rx,rz,_ in sections]
root['fuselageFrameStationsBlenderY']=frameStations
root['fuselageSectionScope']='Canvas64 bay-calibrated oval traces; frame1..7 including frame4.5; skin ends at rudder post'
root['bodyLongitudinalAxisHeightM']=bodyAxisZ
root['gearDatumScope']='Canvas86 nominal extended gear: axis-to-ground1810mm; detailed parked shock compression inferred'
root['rudderHingeForwardTiltDegrees']=8.0
profileScript=scriptPath.with_name('Script_NakajimaKi4FuselageProfile.py')
exec(compile(profileScript.read_text(encoding='utf8'),str(profileScript),'exec'),globals())
if fuselageExteriorProfile!='ManualV20':root['fuselageSectionScope']='Manual64 structural bay/ellipsoid reference inputs; photographic exterior hypotheses are declared separately in the profile metadata. Skin ends at the retained rudder post.'
def BodyPoint(y,theta,offset=0):
    rx=Interp(sections,y,1)+offset;rz=Interp(sections,y,2)+offset;zc=Interp(sections,y,3)
    z=zc+rz*cos(theta)+DorsalLift(y,theta)-BodyLowerEnvelope(y)*max(0,-cos(theta))**2-BodyUpperEnvelope(y)*max(0,cos(theta))**2
    postBlend=max(0,min(1,(-3.605-y)/.215))
    return (rx*sin(theta),y+postBlend*math.tan(tailPostTilt)*(z-bodyAxisZ),z)

def DorsalLift(y,theta):
    # Canvas64 and Photo02 show the raised shoulder between the two cockpits.
    # Its height/profile are bay-calibrated reconstruction, not printed dimensions.
    return .12*math.exp(-((y-frameStations[1])/.22)**4)*max(0,cos(theta))**8

def BodySurfaceNormal(y,theta):
    epsilon=.00001
    tangentTheta=Vector(BodyPoint(y,theta+epsilon))-Vector(BodyPoint(y,theta-epsilon))
    tangentY=Vector(BodyPoint(y+epsilon,theta))-Vector(BodyPoint(y-epsilon,theta))
    return tangentTheta.cross(tangentY).normalized()

def BodyTopSurface(y,x):
    rx=Interp(sections,y,1);rz=Interp(sections,y,2);zc=Interp(sections,y,3)
    fraction=max(-1,min(1,x/rx));theta=math.asin(fraction)
    return zc+rz*sqrt(max(0,1-fraction*fraction))+DorsalLift(y,theta)-BodyUpperEnvelope(y)*max(0,cos(theta))**2
verts=[];uv=[];faces=[];rings=130;sides=72
for j in range(rings+1):
    y=sections[0][0]+(sections[-1][0]-sections[0][0])*j/rings
    for k in range(sides+1):
        theta=2*pi*k/sides;verts.append(BodyPoint(y,theta));uv.append((j/rings,k/sides))
for j in range(rings):
    for k in range(sides):
        a=j*(sides+1)+k;faces.append((a,a+sides+1,a+sides+2,a+1))
faces.append(tuple(range(sides,-1,-1)));faces.append(tuple(rings*(sides+1)+k for k in range(sides+1)))
body=Mesh('Fuselage_Monocoque',verts,faces,'Skin',uv)
# Weld the coincident UV seam before CSG. Loop UVs remain separate across the seam.
bm=bmesh.new();bm.from_mesh(body.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.000001);bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
assert all(e.is_manifold for e in bm.edges), 'Fuselage must be watertight before cockpit CSG'
bm.to_mesh(body.data);bm.free()

# True open cockpit apertures; their rims follow the local curved fuselage surface.
# Canvas64 gives adjacent cockpit frame bays of 945mm and 1130mm. Place the
# openings within those bays instead of the former unsupported 1.31m pitch.
cockpitPitch=(.945+1.130)/2
cockpits=[((frameStations[0]+frameStations[1])/2,.34,.36),((frameStations[1]+frameStations[2])/2,.355,.46)]
root['cockpitCenterPitchM']=cockpitPitch
root['cockpitPlacementScope']='Opening centers reconstructed from adjacent frame-bay midpoints; exact seat placement remains inferred'
for idx,(cy,rx,ry) in enumerate(cockpits):
    bpy.ops.mesh.primitive_cylinder_add(vertices=128,radius=1,depth=1.80,location=(0,cy,2.60))
    cutter=bpy.context.object;cutter.name='Temp_CockpitCutter';cutter.scale=(rx,ry,1)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    mod=body.modifiers.new('CockpitAperture'+str(idx),'BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
    bpy.context.view_layer.objects.active=body;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
    assert max(v.co.z for v in body.data.vertices)<max(s[2]+s[3] for s in sections)+.121, 'Cockpit CSG introduced an exterior cutter surface'
    pts=[]
    for k in range(100):
        a=2*pi*k/100;x=rx*sin(a);y=cy+ry*cos(a);localRx=Interp(sections,y,1);rz=Interp(sections,y,2);zc=Interp(sections,y,3)
        theta=math.asin(max(-1,min(1,x/localRx)));z=BodyTopSurface(y,x)+.008
        pts.append((x,y,z))
    # Explicit metre UVs around the leather tube prevent stretched upholstery grain.
    vv=[];ff=[];uv=[];arc=0;nr=12
    coamingRadius=.021 if idx==0 else .012
    for i in range(len(pts)+1):
        k=i%len(pts);point=Vector(pts[k]);tangent=(Vector(pts[(k+1)%len(pts)])-Vector(pts[(k-1)%len(pts)])).normalized()
        up=(Vector((0,0,1))-tangent*tangent.z).normalized();across=tangent.cross(up).normalized()
        if i:arc+=(point-Vector(pts[(k-1)%len(pts)])).length
        for j in range(nr+1):
            a=2*pi*j/nr;vv.append(point+coamingRadius*(up*cos(a)+across*sin(a)));uv.append((arc/.4,a*coamingRadius/.4))
    for i in range(len(pts)):
        for j in range(nr):a=i*(nr+1)+j;ff.append((a,a+nr+1,a+nr+2,a+1))
    Mesh('Cockpit_Coaming'+str(idx+1),vv,ff,'Leather',uv)
    # Curved cockpit well lining is a separate dark surface below each opening.
    vv=[];ff=[]
    for level in [0,1]:
        for k in range(64):
            a=2*pi*k/64;x=rx*.94*sin(a);y=cy+ry*.94*cos(a)
            theta=math.asin(max(-1,min(1,x/Interp(sections,y,1))))
            z=1.76 if level==0 else BodyTopSurface(y,x)-.025
            vv.append((x,y,z))
    for k in range(64):ff.append((k,(k+1)%64,(k+1)%64+64,k+64))
    Mesh('Cockpit_Lining'+str(idx+1),vv,ff,'Dark')
    Box('Cockpit_Floor'+str(idx+1),(0,cy,1.77),(.52,.65,.025),'Dark')
    seatFacing=1 if idx==0 else -1
    seat=Ellipsoid('Seat_Cushion'+str(idx+1),(0,cy-seatFacing*.1,1.93),(.235,.21,.065),'Leather')
    seat=Ellipsoid('Seat_Back'+str(idx+1),(0,cy-seatFacing*.28,2.11),(.24,.06,.26),'Leather')
    if idx==1:
        seat.rotation_euler.x=-.35
        seat['poseScope']='Rear-facing observer/gunner pose shown in NDL118 installation view; reclined backrest/adjustment remains inferred'
    Tube('ControlStick'+str(idx+1),(0,cy+.12,1.81),(0,cy+.08,2.14),.016)
    Ellipsoid('StickGrip'+str(idx+1),(0,cy+.08,2.14),(.025,.034,.065),'Dark',16,8)
    for side in [-1,1]:Tube('RudderPedal'+str(idx+1),(side*.16,cy+.27,1.9),(side*.06,cy+.27,1.9),.014)

# UIUC NACA M6 profile, as identified by manual printed p.2.
upper=[(0,0),(.0125,.0197),(.025,.0281),(.05,.0403),(.075,.0494),(.1,.0571),(.15,.0682),(.2,.0755),(.25,.0801),(.3,.0822),(.4,.0805),(.5,.0726),(.6,.0603),(.7,.0458),(.8,.0306),(.9,.0155),(.95,.0088),(1,.0026)]
lower=[(0,0),(.0125,-.0176),(.025,-.022),(.05,-.0273),(.075,-.0303),(.1,-.0324),(.15,-.0347),(.2,-.0362),(.25,-.0371),(.3,-.0379),(.4,-.039),(.5,-.0394),(.6,-.0382),(.7,-.0348),(.8,-.0283),(.9,-.0177),(.95,-.0108),(1,.0026)]
# x, leading edge, trailing edge. These traces follow NDL canvases 73/74.
planScript=scriptPath.with_name('Script_NakajimaKi4WingPlan.py')
exec(compile(planScript.read_text(encoding='utf8'),str(planScript),'exec'),globals())
root['upperWingPlanformScope']='NDL canvas73: printed6000mm half span/2000mm maximum outline chord, recalibrated scan contour. Rounded angular interpolation/adaptive span sampling replace the former rear-shifted elliptical tip. Scan positions remain reconstruction.'
root['lowerWingPlanformScope']='NDL canvas74:3790mm outer panel and nominal1250mm chord; approximate8.52m general span retained. Skew-calibrated contour, with nominal chord preferred at ambiguous root margin lines and a guide-overlapped inferred rounded apex.'
wingInstallationY=float(os.environ.get('KI4_WING_INSTALL_Y','0'))
wingInstallationZ=float(os.environ.get('KI4_WING_INSTALL_Z','0'))
assert abs(wingInstallationY)<=.25 and abs(wingInstallationZ)<=.025
root['wingInstallationOffsetBlenderM']=[0,wingInstallationY,wingInstallationZ]
root['wingInstallationScope']='Common absolute wing-system location is a photographic reconstruction input. Printed spans/chords, gap, stagger, incidence/dihedral and straight-spar separations are retained. Spar fittings, coves, struts, wires and racks follow the actual installation.'
# Manual73 labels 1..38, with 196/204/178/160/98mm outer intervals;
# Manual74 labels 1..23 and visibly closer tip ribs. Inner station positions are
# calibrated from the drawing; exact unreadable manufacturing intervals remain inferred.
upperRibs=[4.322*i/26 for i in range(27)]
for interval in [.196,.204,.196,.204,.178,.160,.098,.098,.098,.098,.098]:upperRibs.append(upperRibs[-1]+interval)
lowerRibs=[.47+(3.147-.47)*i/15 for i in range(16)]+[3.341,3.549,3.752,3.852,3.956,4.057,4.151]
def WingPoint(x,t,which='Upper',top=True,extra=0):
    a=abs(x)
    le,te=UpperPlanform(a) if which=='Upper' else LowerPlanform(a)
    chord=max(.001,le-te)
    incidence=math.radians(2 if which=='Upper' else 4)
    dy=(.25-t)*chord;dz=chord*Interp(upper if top else lower,t)
    y=le-.25*chord+dy*cos(incidence)-dz*sin(incidence)
    z=(2.823 if which=='Upper' else 1.228)+abs(x)*math.tan(math.radians(4))
    z+=dy*sin(incidence)+dz*cos(incidence)+extra
    # restrained rib scalloping between real rib stations, disappearing at the spars.
    ribs=([0]+upperRibs+[6]) if which=='Upper' else ([0]+lowerRibs+[4.26])
    ribFraction=0
    for first,last in zip(ribs,ribs[1:]):
        if first<=a<=last and last>first:
            ribFraction=(a-first)/(last-first);break
    scallop=(sin(pi*ribFraction)**2)*sin(pi*t)**2
    z+=(-.0024 if top else .0015)*scallop
    return (x,y+wingInstallationY,z+wingInstallationZ)

def UpperSparPoint(x,rear=False,top=False):
    # Canvas73 prints900mm between the two straight spars. Their absolute
    # positions relative to the outer leading skin are scan-calibrated.
    targetY=(.90 if rear else 1.80)+wingInstallationY;lo,hi=0.,1.
    assert WingPoint(x,1,'Upper',top)[1]<targetY<WingPoint(x,0,'Upper',top)[1]
    for _ in range(36):
        t=(lo+hi)/2
        if WingPoint(x,t,'Upper',top)[1]>targetY:lo=t
        else:hi=t
    return WingPoint(x,(lo+hi)/2,'Upper',top)

def LowerSparPoint(x,rear=False,top=True):
    # The lower drawing prints150/480/620mm chordwise segments. The two rear
    # spars almost align after the printed472.5mm stagger, matching the V-post.
    targetY=(.8975 if rear else 1.3775)+wingInstallationY;lo,hi=0.,1.
    assert WingPoint(x,1,'Lower',top)[1]<targetY<WingPoint(x,0,'Lower',top)[1]
    for _ in range(36):
        t=(lo+hi)/2
        if WingPoint(x,t,'Lower',top)[1]>targetY:lo=t
        else:hi=t
    return WingPoint(x,(lo+hi)/2,'Lower',top)

def WingPanel(name,which,side,x0,x1,t0=0,t1=1,parent=None):
    xs=UpperSpanSamples(x0,x1) if which=='Upper' else LowerSpanSamples(x0,x1)
    nx=len(xs)-1;nt=42;vv=[];ff=[];uv=[]
    for top in [True,False]:
        for i in range(nx+1):
            x=side*xs[i]
            for j in range(nt+1):
                q=(1-cos(pi*j/nt))/2;t=t0+(t1-t0)*q
                vv.append(WingPoint(x,t,which,top))
                chordM=math.dist(WingPoint(x,0,which,top),WingPoint(x,1,which,top))
                uv.append((abs(x)/6,t*chordM/2 if top else 2-t*chordM/2))
    layer=(nx+1)*(nt+1)
    for f in range(2):
        for i in range(nx):
            for j in range(nt):
                a=f*layer+i*(nt+1)+j;face=(a,a+nt+1,a+nt+2,a+1)
                ff.append(face if (side==1)==(f==0) else face[::-1])
    for i in [0,nx]:
        for j in range(nt):
            a=i*(nt+1)+j;ff.append((a,a+1,a+1+layer,a+layer))
    for j in [0,nt]:
        for i in range(nx):
            a=i*(nt+1)+j;ff.append((a,a+nt+1,a+nt+1+layer,a+layer))
    obj=Mesh(name,vv,ff,'Fabric',uv)
    if parent:MoveUnder(obj,parent)
    return obj

hingeScript=scriptPath.with_name('Script_NakajimaKi4Hinges.py')
exec(compile(hingeScript.read_text(encoding='utf8'),str(hingeScript),'exec'),globals())
root['aileronHingeScope']='Straight physical axes, rounded noses and concentric3mm coves replace a chord-fraction gap that was17..40mm wide and departed from its axis by up to72mm. Hidden nose/cove dimensions are functional reconstruction.'
root['aileronPlanformScope']='NDL canvas73 scan-calibrated about1.85..5.28m span stations replace the former2.40..5.83m outboard placement. Hidden hinge line/radii are reconstructed; not individually printed factory dimensions.'
root['upperWingSparScope']='NDL canvas73 printed900mm spar separation. Straight approximate source Y1.80/.90m replaces chord-fraction anchors that curved with the trailing outline. Exact fittings and absolute scan position remain reconstruction.'
root['lowerWingSparScope']='NDL canvas74 printed150/480/620mm segments; straight sourceY1.3775/.8975m spars replace chord fractions. Interplane V-post lower foot follows the rear spar; lateral support stations and exact fittings remain reconstruction.'
root['aileronHingeSections']={}
ailerons={}
for side,label in [(-1,'Left'),(1,'Right')]:
    WingPanel('UpperWing_Inboard'+label,'Upper',side,0,aileronInboardSpan)
    HingedUpperPanel('UpperWing_Main'+label,side)
    WingPanel('UpperWing_Tip'+label,'Upper',side,aileronOutboardSpan+aileronEndGap,6.0)
    hinge=AileronAxis(side)[0]
    pivot=Pivot('Pivot_Aileron'+label,hinge,'X',[-18,18]);ailerons[label]=pivot
    tipHinge=AileronAxis(side)[1]
    hingeDirection=(tipHinge-Vector(hinge))*side
    pivot.rotation_mode='QUATERNION';pivot.rotation_quaternion=hingeDirection.to_track_quat('X','Z')
    HingedUpperPanel('Aileron_'+label,side,True,pivot)
    axisStart=Vector(hinge);axisEnd=Vector(tipHinge)
    Tube('AileronHingePin'+label,axisStart,axisEnd,.0025,'Steel',10)
    root['aileronHingeSections'][label]=[{'centerBlenderM':list(d['center']),'foreBlender':list(d['fore']),'upBlender':list(d['up']),'radiusM':d['radius'],'radialClearanceM':.003} for d in [AileronSection(side,s) for s in [2.1,3.55,4.9]]]
    WingPanel('LowerWing_'+label,'Lower',side,0,4.26)
    for which,ribPositions in [('Upper',upperRibs),('Lower',lowerRibs)]:
        for i,position in enumerate(ribPositions):
            if position==0 and side<0:continue
            x=side*position
            for top in [True,False]:
                hasAileron=which=='Upper' and aileronInboardSpan+aileronEndGap<abs(x)<aileronOutboardSpan
                if hasAileron:
                    section=AileronSection(side,position);faceIndex=0 if top else 1
                    chordM=math.dist(WingPoint(x,0,which,top),WingPoint(x,1,which,top))
                    ranges=[(0,section['cutT'][faceIndex]-.012/chordM,None),(section['hingeT'][faceIndex]+.012/chordM,1,pivot)]
                else:ranges=[(0,1,None)]
                for start,end,moving in ranges:
                    vv=[];ff=[];uv=[]
                    tapeChord=math.dist(WingPoint(x,0,which,top),WingPoint(x,1,which,top))
                    for j in range(37):
                        t=start+(end-start)*(1-cos(pi*j/36))/2
                        for d in [-.007,.007]:
                            point=HingedWingSurfacePoint(side,abs(x+d),t,top,moving is not None,.0018 if top else -.0018) if hasAileron else WingPoint(x+d,t,which,top,.0018 if top else -.0018)
                            vv.append(point);uv.append(((d+.007)/.014,t*tapeChord/.20))
                    for j in range(36):a=j*2;ff.append((a,a+1,a+3,a+2))
                    tape=Mesh('RibTape_'+which+label+str(i)+('Top' if top else 'Bottom')+str(start),vv,ff,'RibTape',uv)
                    if moving:MoveUnder(tape,moving)
    # One interplane compression post and two cabane pairs, per original wing general drawing.
    lowerA=LowerSparPoint(side*2.80,True,True)
    upperA=UpperSparPoint(side*3.68,False,False)
    upperB=UpperSparPoint(side*3.68,True,False)
    for n,end,radius in [('Front',upperA,.028),('Rear',upperB,.026)]:
        strut=Tube('Interplane_'+n+label,lowerA,end,radius,'Skin',20);strut.scale.x=.40;strut.scale.y=1.60
    for n,rear,ybot in [('Front',False,1.35),('Rear',True,.25)]:
        end=UpperSparPoint(side*.49,rear,False)
        strut=Tube('Cabane_'+n+label,(side*.51,ybot,2.25),end,.023,'Steel',20);strut.scale.x=.42;strut.scale.y=1.55
    # Flying and landing cables cross between wing spars with local turnbuckles.
    cableEnds=[(LowerSparPoint(side*.58,False,True),upperA),(LowerSparPoint(side*.58,True,True),upperB),(UpperSparPoint(side*.50,False,False),lowerA),(UpperSparPoint(side*.50,True,False),LowerSparPoint(side*2.80,True,True))]
    for i,(a,b) in enumerate(cableEnds):
        Tube('FlyingWire_'+label+str(i),a,b,.0042,'Wire',8)
        va,vb=Vector(a),Vector(b);d=(vb-va).normalized();Tube('Turnbuckle_'+label+str(i),va+d*.08,va+d*.17,.009,'Steel',10)

# Tail outlines traced from manual canvases 83/84. Separate moving elevator halves.
def FlatAirfoil(name,outline,axis='horizontal',thickness=.035,mat='TailFabric',parent=None):
    # Sample the measured outline, then use smooth chordwise thickness. A
    # centroid-based radial height field created visible fan-shaped creases.
    # Preserve the original outline's hinges and interpolate only curved outer edges.
    refined=[]
    for i,p1 in enumerate(outline):
        p0=Vector(outline[(i-1)%len(outline)]);p1=Vector(p1);p2=Vector(outline[(i+1)%len(outline)]);p3=Vector(outline[(i+2)%len(outline)])
        outlineSteps=24 if axis=='vertical' else 6
        for k in range(outlineSteps):
            t=k/outlineSteps
            onTailPost=axis=='vertical' and abs((p2.y-p1.y)-math.tan(tailPostTilt)*(p2.z-p1.z))<.00001
            if onTailPost or (axis=='vertical' and abs(p1.y-p2.y)<.015) or (axis=='horizontal' and (abs(p1.y-p2.y)<.015 or abs(p1.x-p2.x)<.015)):q=p1.lerp(p2,t)
            else:
                # Monotone component tangents retain the measured outline's
                # extrema; ordinary Catmull-Rom inflated the 4.36m tail span.
                before=p1-p0;delta=p2-p1;after=p3-p2
                m1=Vector(tuple(2*before[k]*delta[k]/(before[k]+delta[k]) if before[k]*delta[k]>0 else 0 for k in range(3)))
                m2=Vector(tuple(2*delta[k]*after[k]/(delta[k]+after[k]) if delta[k]*after[k]>0 else 0 for k in range(3)))
                q=(2*t**3-3*t*t+1)*p1+(t**3-2*t*t+t)*m1+(-2*t**3+3*t*t)*p2+(t**3-t*t)*m2
            refined.append(tuple(q))
    controls=outline;outline=refined
    spanIndex=0 if axis=='horizontal' else 2
    spanMin=min(p[spanIndex] for p in outline);spanMax=max(p[spanIndex] for p in outline)
    intervals=max(8,math.ceil((spanMax-spanMin)/(.03 if axis=='vertical' else .06)))
    spans=sorted(set(round(value,8) for value in [spanMin,spanMax]+[p[spanIndex] for p in controls]+[spanMin+(spanMax-spanMin)*i/intervals for i in range(intervals+1)]))
    if name=='Rudder':spans=sorted(set(spans+[2.85,2.87,2.89,2.91]))
    elif name=='VerticalFin':spans=sorted(set(spans+[2.745,2.765,2.785,2.805]))
    if axis=='vertical':
        # A balance-horn ledge changes chord discontinuously. Two rows either
        # side of it retain that ledge; one row would bevel away the whole step.
        ledges={p[2] for p,q in zip(controls,controls[1:]+controls[:1]) if abs(p[2]-q[2])<.0000001 and abs(p[1]-q[1])>.01 and spanMin+.0001<p[2]<spanMax-.0001}
        spans=sorted(set(value+offset for value in spans for offset in ([-.00025,.00025] if any(abs(value-z)<.0000001 for z in ledges) else [0])))
    def Chord(coordinate):
        epsilon=.000001
        assert spanMin-epsilon<=coordinate<=spanMax+epsilon, name+' sample lies outside its reference span'
        coordinate=max(spanMin,min(spanMax,coordinate));hits=[]
        for first,last in zip(outline,outline[1:]+outline[:1]):
            a=first[spanIndex];b=last[spanIndex]
            if abs(b-a)<1e-9:
                if abs(coordinate-a)<=epsilon:hits.extend([first[1],last[1]])
                continue
            if min(a,b)-epsilon<=coordinate<=max(a,b)+epsilon:
                factor=max(0,min(1,(coordinate-a)/(b-a)));hits.append(first[1]+factor*(last[1]-first[1]))
        assert hits, name+' has no reference chord at its sampled span'
        return max(hits),min(hits)
    nt=24;row=nt+1;rowSamples=[]
    if axis=='vertical':
        baseYs=[p[1]-math.tan(tailPostTilt)*(p[2]-bodyAxisZ) for p in controls]
        commonColumns=[i*.02 for i in range(math.floor(min(baseYs)/.02),math.ceil(max(baseYs)/.02)+1)]
        commonColumns += [rudderHingeY,rudderHingeY+.002,rudderHingeY+.205,rudderHingeY+.208]
    for coordinate in spans:
        leading,trailing=Chord(coordinate);chord=max(0,leading-trailing)
        if chord<.00001:trailing=leading;chord=0
        shear=math.tan(tailPostTilt)*(coordinate-bodyAxisZ) if axis=='vertical' else 0
        if axis=='vertical':
            leadBase=leading-shear;trailBase=trailing-shear
            if not chord:samples=[leadBase]
            else:
                values=[leadBase,trailBase]+[y for y in commonColumns if trailBase+.00001<y<leadBase-.00001]
                values += [leadBase-q*chord for q in [.002,.008,.02,.05,.10,.20,.35,.5,.65,.8,.9,.95,.98,.992,.998]]
                samples=[]
                for value in sorted(values,reverse=True):
                    if not samples or samples[-1]-value>.000001:samples.append(value)
                samples[-1]=trailBase
        else:samples=[leading-(1-cos(pi*j/nt))/2*chord for j in range(row)]
        rowSamples.append((coordinate,leading,trailing,shear,samples))
    vv=[];uv=[];ff=[];skinRows=[]
    normal=Vector((0,0,1) if axis=='horizontal' else (1,0,0))
    for top in [1,-1]:
        rows=[]
        for coordinate,leading,trailing,shear,samples in rowSamples:
            indices=[]
            for sample in samples:
                indices.append(len(vv));pointY=sample+shear
                point=Vector((coordinate,pointY,controls[0][2])) if axis=='horizontal' else Vector((controls[0][0],pointY,coordinate))
                def ProfileFactor(lead,trail):
                    length=lead-trail
                    if length<=.000001:return 0
                    q=(lead-pointY)/length
                    if abs(q)<1e-7:q=0
                    if abs(q-1)<1e-7:q=1
                    if not 0<=q<=1:return 0
                    shape=(.2969*sqrt(q)-.1260*q-.3516*q*q+.2843*q**3-.1036*q**4)/.1000
                    return max(0,shape)*min(1,length/.35)
                factor=ProfileFactor(leading,trailing)
                # Blend adjoining airfoil fields over80mm instead of remapping
                # thickness over a planform ledge. Retain a finite thin edge
                # so the two skins do not collapse into a nonmanifold sheet.
                if axis=='vertical' and name=='Rudder' and coordinate>2.83:
                    mainLeading=min(leading,rudderHingeY+math.tan(tailPostTilt)*(coordinate-bodyAxisZ))
                    blend=max(0,min(1,(coordinate-2.83)/.08));blend=max(.001,blend*blend*(3-2*blend))
                    factor=ProfileFactor(mainLeading,trailing)*(1-blend)+factor*blend
                elif axis=='vertical' and name=='VerticalFin' and coordinate<2.825:
                    upperTrailing=max(trailing,rudderHingeY+.208+math.tan(tailPostTilt)*(coordinate-bodyAxisZ))
                    blend=max(0,min(1,(coordinate-(2.825-.08))/.08));blend=min(.999,blend*blend*(3-2*blend))
                    factor=factor*(1-blend)+ProfileFactor(leading,upperTrailing)*blend
                point+=normal*top*thickness*factor
                vv.append(point)
                if mat=='TailFabric':
                    physicalU=(point.x+2.18)/4.36 if axis=='horizontal' else (point.z-1.42)/1.8085
                    physicalV=(point.y+4.567)/1.60 if axis=='horizontal' else (point.y+4.70)/1.85
                    pixelY=(16 if axis=='horizontal' else 1040)+(1-physicalV)*992
                    uv.append(((16+physicalU*4064)/4096,1-pixelY/2048))
                else:
                    domain=uvDomains.get(mat,(1.5,1.5));uv.append(((point.x+6)/domain[0],(point.y+5)/domain[1]) if axis=='horizontal' else ((point.y+5)/domain[0],point.z/domain[1]))
            rows.append(indices)
        skinRows.append(rows)
    for side in range(2):
        for i in range(len(spans)-1):
            first=skinRows[side][i];last=skinRows[side][i+1]
            if axis=='horizontal':
                for j in range(nt):
                    face=(first[j],first[j+1],last[j+1],last[j]);ff.append(face if side==0 else face[::-1])
            else:
                # Align physical chord stations, so a new horn adds vertices
                # only in that horn instead of pulling every interior column.
                aa=bb=0;firstY=rowSamples[i][4];lastY=rowSamples[i+1][4]
                while aa<len(first)-1 or bb<len(last)-1:
                    if aa==len(first)-1:
                        face=(first[aa],last[bb],last[bb+1]);bb+=1
                    elif bb==len(last)-1:
                        face=(first[aa],last[bb],first[aa+1]);aa+=1
                    elif abs(firstY[aa+1]-lastY[bb+1])<.000001:
                        face=(first[aa],last[bb],last[bb+1],first[aa+1]);aa+=1;bb+=1
                    elif firstY[aa+1]>lastY[bb+1]:
                        face=(first[aa],last[bb],first[aa+1]);aa+=1
                    else:
                        face=(first[aa],last[bb],last[bb+1]);bb+=1
                    ff.append(face if side==0 else face[::-1])
    for i in [0,len(spans)-1]:
        for j in range(len(skinRows[0][i])-1):
            face=(skinRows[0][i][j],skinRows[0][i][j+1],skinRows[1][i][j+1],skinRows[1][i][j]);ff.append(face if i==0 else face[::-1])
    obj=Mesh(name,vv,ff,mat,uv)
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.0000001);bmesh.ops.dissolve_degenerate(bm,edges=bm.edges,dist=.00000001)
    loose=[e for e in bm.edges if not e.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='EDGES')
    loose=[v for v in bm.verts if not v.link_edges]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    if bm.calc_volume(signed=True)<0:bmesh.ops.reverse_faces(bm,faces=bm.faces)
    assert all(e.is_manifold for e in bm.edges), name+' must be a closed airfoil before clearance operations'
    bm.to_mesh(obj.data);bm.free()
    if parent:MoveUnder(obj,parent)
    return obj

for side,label in [(-1,'Left'),(1,'Right')]:
    outline=[(0,-3.365,1.82),(.42,-3.18,1.82),(.98,-3.16,1.82),(1.55,-3.28,1.82),(1.99,-3.55,1.82),(2.18,-3.84,1.82),(2.13,-4.00,1.82),(.0,-4.00,1.82)]
    outline=[(side*x,y,z) for x,y,z in outline];FlatAirfoil('Tailplane_'+label,outline,thickness=.042)
    pivot=Pivot('Pivot_Elevator'+label,(0,-4.025,1.82),'X',[-25,25])
    # Canvas83's inner elevator edge opens aft around the rudder, rather than
    # remaining a straight 180mm gap over the entire chord.
    outline=[(.18,-4.045,1.82),(2.12,-4.045,1.82),(2.00,-4.25,1.82),(1.6,-4.46,1.82),(.95,-4.567,1.82),(.46,-4.535,1.82),(.32,-4.30,1.82)]
    FlatAirfoil('Elevator_'+label,[(side*x,y,z) for x,y,z in outline],thickness=.032,parent=pivot)
    braceY=-3.65;braceTheta=pi-math.asin(side*.08/Interp(sections,braceY,1))
    braceMount=BodyPoint(braceY,braceTheta,-.002)
    Tube('TailplaneBrace_'+label,braceMount,(side*1.52,-3.71,1.80),.012,'Steel')
# Canvas84: 1808.5mm overall height, 875mm maximum aft rudder chord,
# 205mm forward balance horn. The old hinge at -4.25m halved the rudder chord.
rudderHingeY=-3.825
hingePosition=Vector((0,rudderHingeY,bodyAxisZ))
hingeAxis=Vector((0,sin(tailPostTilt),cos(tailPostTilt)))
def TailPoint(point):
    x,y,z=point
    return (x,y+math.tan(tailPostTilt)*(z-bodyAxisZ),z)
def TailSweep(angle,includeIncidence=False):
    rotation=Quaternion(hingeAxis,math.radians(angle)).to_matrix().to_4x4()
    if includeIncidence:rotation=Matrix.Rotation(math.radians(3+40/60),4,'Z')@rotation
    return Matrix.Translation(hingePosition)@rotation@Matrix.Translation(-hingePosition)
# Canvas64/84: post leans forward8deg. Shear the body-coordinate outline
# along the post while retaining the drawing's vertical height/chord dimensions;
# the actual moving node rotates about that inclined post, not world vertical.
finOutline=[(0,-2.90,1.84),(0,-3.14,2.00),(0,-3.32,2.40),(0,-3.48,2.90),(0,rudderHingeY+.208,3.155),(0,rudderHingeY+.208,2.825),(0,rudderHingeY+.002,2.825),(0,rudderHingeY+.002,1.79)]
fin=FlatAirfoil('VerticalFin',[TailPoint(p) for p in finOutline],'vertical',.045)
fin.data.calc_loop_triangles()
finAreaBeforePocket=sum(abs((fin.data.vertices[t.vertices[1]].co-fin.data.vertices[t.vertices[0]].co).cross(fin.data.vertices[t.vertices[2]].co-fin.data.vertices[t.vertices[0]].co).x)/2 for t in fin.data.loop_triangles)/2
fin['referenceSideAreaBeforePocketM2']=finAreaBeforePocket
rudder=Pivot('Pivot_Rudder',hingePosition,'Z',[-25,25])
rudder.rotation_mode='QUATERNION';rudder.rotation_quaternion=Quaternion(Vector((1,0,0)),-tailPostTilt)
rudder['manualHingeForwardTiltDegrees']=8.0
rudderOutline=[(0,rudderHingeY,1.42),(0,rudderHingeY,2.83),(0,rudderHingeY+.205,2.83),(0,rudderHingeY+.205,3.16),(0,-3.99,3.2285),(0,-4.30,3.03),(0,-4.58,2.70),(0,-4.70,2.10),(0,-4.67,1.62),(0,-4.25,1.42)]
rudderMesh=FlatAirfoil('Rudder',[TailPoint(p) for p in rudderOutline],'vertical',.035,parent=rudder)
for obj in [fin,rudderMesh]:
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.0000001)
    bmesh.ops.dissolve_degenerate(bm,edges=bm.edges,dist=.00000001);bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    bm.to_mesh(obj.data);bm.free()
# A small hidden hinge-post pocket only. The former long tail cone cutter
# removed a visible hole from the rudder even after the false cone was gone.
rudderMesh.data.calc_loop_triangles()
rudderAreaBeforePocket=sum(abs((rudderMesh.data.vertices[t.vertices[1]].co-rudderMesh.data.vertices[t.vertices[0]].co).cross(rudderMesh.data.vertices[t.vertices[2]].co-rudderMesh.data.vertices[t.vertices[0]].co).x)/2 for t in rudderMesh.data.loop_triangles)/2
clearanceSections=[(y,Interp(sections,y,1)+.008,Interp(sections,y,2)+.008,Interp(sections,y,3)) for y in [-3.840,-3.820,-3.720,-3.600]]
vv=[];ff=[];nr=12;ns=64
for j in range(nr+1):
    y=-3.840+(.240*j/nr);rx=Interp(clearanceSections,y,1);rz=Interp(clearanceSections,y,2);zc=Interp(clearanceSections,y,3)
    for k in range(ns):a=2*pi*k/ns;vv.append(TailPoint((rx*sin(a),y,zc+rz*cos(a))))
for j in range(nr):
    for k in range(ns):a=j*ns+k;b=j*ns+(k+1)%ns;ff.append((a,b,b+ns,a+ns))
ff.append(tuple(range(ns-1,-1,-1)));ff.append(tuple(nr*ns+k for k in range(ns)))
cutter=Mesh('Temp_RudderTailConeClearance',vv,ff,'Dark')
mod=rudderMesh.modifiers.new('TailConeMotionClearance','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
bpy.context.view_layer.objects.active=rudderMesh;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
rudderMesh.data.calc_loop_triangles()
rudderArea=sum(abs((rudderMesh.data.vertices[t.vertices[1]].co-rudderMesh.data.vertices[t.vertices[0]].co).cross(rudderMesh.data.vertices[t.vertices[2]].co-rudderMesh.data.vertices[t.vertices[0]].co).x)/2 for t in rudderMesh.data.loop_triangles)/2
assert rudderArea>=rudderAreaBeforePocket*.98, 'Hinge-post pocket must not remove the visible rudder silhouette'
rudderMesh['referenceSideAreaBeforePocketM2']=rudderAreaBeforePocket
rudderMesh['inferredDetail']='Small hidden hinge-post pocket; no tail-cone silhouette cutout; motion must be audited'
# Only the forward balance horn overlaps the fixed fin. A closed convex envelope
# avoids the invalid whole-rudder offset cutter that erased almost the entire fin.
horn=[v.co.copy() for v in rudderMesh.data.vertices if v.co.y-math.tan(tailPostTilt)*(v.co.z-bodyAxisZ)>rudderHingeY-.005 and v.co.z>2.825]
assert horn
bm=bmesh.new()
for angle in range(-25,26,5):
    transform=TailSweep(angle)
    for point in horn:
        swept=transform@point
        for x in [-.003,.003]:
            for y in [-.003,.003]:
                for z in [-.002,.002]:bm.verts.new(swept+Vector((x,y,z)))
bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.00001)
bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
loose=[v for v in bm.verts if not v.link_faces]
if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
toolMesh=bpy.data.meshes.new('BalanceHornEnvelope');bm.to_mesh(toolMesh);bm.free();toolMesh.materials.append(mats['TailFabric'])
tool=bpy.data.objects.new('Temp_RudderBalanceSweep',toolMesh);scene.collection.objects.link(tool)
mod=fin.modifiers.new('BalanceHornClearance','BOOLEAN');mod.operation='DIFFERENCE';mod.object=tool;mod.solver='EXACT'
bpy.context.view_layer.objects.active=fin;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(tool,do_unlink=True)
fin.data.calc_loop_triangles()
finSideArea=sum(abs((fin.data.vertices[t.vertices[1]].co-fin.data.vertices[t.vertices[0]].co).cross(fin.data.vertices[t.vertices[2]].co-fin.data.vertices[t.vertices[0]].co).x)/2 for t in fin.data.loop_triangles)/2
assert finSideArea>=finAreaBeforePocket*.90, 'Fixed fin must retain at least 90% of its measured pre-pocket silhouette'
bm=bmesh.new();bm.from_mesh(fin.data)
assert all(e.is_manifold for e in bm.edges), 'Balance clearance must leave a closed fixed-fin mesh'
bm.free()
fin['sideAreaM2']=finSideArea
fin['inferredDetail']='Internal balance-horn pocket from swept rudder volume; external assembly outline retained'
fin['internalMotionClearanceM']=.010
finFrame=bpy.data.objects.new('Frame_VerticalTailIncidence',None);scene.collection.objects.link(finFrame);Parent(finFrame)
finFrame.location=hingePosition;MoveUnder(fin,finFrame);MoveUnder(rudder,finFrame)
finFrame.rotation_euler.z=math.radians(3+40/60)
finFrame['manualSetting']='NDL canvas6: vertical surface set left 3deg40min relative to fuselage axis'

# Canvas83 leaves the center of the horizontal tail open around the rudder
# post. Clear the small swept footprint in the fixed tailplane, rather than
# deleting a large visible section of rudder to hide this intersection.
crossingPoints=[v.co.copy() for v in rudderMesh.data.vertices if 1.68<v.co.z<1.96]
assert crossingPoints
bm=bmesh.new()
for angle in range(-25,26,5):
    transform=TailSweep(angle,True)
    for point in crossingPoints:
        swept=transform@point
        for offset in [(0,0,-.010),(0,0,.010),(-.008,-.008,0),(-.008,.008,0),(.008,-.008,0),(.008,.008,0)]:bm.verts.new(swept+Vector(offset))
bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.00001)
bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
loose=[v for v in bm.verts if not v.link_faces]
if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
toolMesh=bpy.data.meshes.new('TailplanePostEnvelope');bm.to_mesh(toolMesh);bm.free();toolMesh.materials.append(mats['TailFabric'])
tool=bpy.data.objects.new('Temp_TailplaneRudderPostClearance',toolMesh);scene.collection.objects.link(tool)
for name in ['Tailplane_Left','Tailplane_Right']:
    obj=bpy.data.objects[name]
    mod=obj.modifiers.new('RudderPostClearance','BOOLEAN');mod.operation='DIFFERENCE';mod.object=tool;mod.solver='EXACT'
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name)
    obj['inferredDetail']='Small center notch follows rudder-post sweep; full outer reference outline preserved'
bpy.data.objects.remove(tool,do_unlink=True)

# Engine/cowling: shallow Townend-style ring, visible nine-cylinder Ha-8 radial.
engineBefore=set(root.children_recursive)
engineFrame=None
if noseOffsetM:
    engineFrame=bpy.data.objects.new('Frame_EngineInstallation',None);scene.collection.objects.link(engineFrame);Parent(engineFrame)
engineY=2.86;engineZ=bodyAxisZ
root['engineAxisBlenderM']=[0,engineY-noseOffsetM,engineZ]
def RevolveY(name,profile,mat='Cowl',n=96,parent=None):
    vv=[];ff=[];uv=[]
    distances=[0]
    for first,last in zip(profile,profile[1:]):distances.append(distances[-1]+math.dist(first,last))
    for j,(y,r) in enumerate(profile):
        for k in range(n+1):
            a=2*pi*k/n;vv.append((r*sin(a),y,engineZ+r*cos(a)))
            if mat=='Cowl':uv.append((k/n,distances[j]/distances[-1]))
            else:
                tile=.5 if mat=='EngineCast' else 1.5;uv.append((a*r/tile,distances[j]/tile))
    for j in range(len(profile)-1):
        for k in range(n):
            a=j*(n+1)+k;ff.append((a,a+1,a+n+2,a+n+1))
    obj=Mesh(name,vv,ff,mat,uv)
    if parent:MoveUnder(obj,parent)
    return obj
# Retain the observed outer lip/envelope. The inner diffuser opens behind the
# inlet to clear the actual rocker-cover envelope at the cylinder plane; the
# former straight .617..637m throat cut through all9 covers.
cowlProfile=[(2.63,.674),(2.65,.704),(2.74,.725),(3.06,.725),(3.16,.702),(3.19,.66),(3.16,.626),(2.98,.705),(2.73,.700),(2.63,.674)]
RevolveY('Cowl_AnnularRing',cowlProfile)
root['cowlInnerScope']='Inner diffuser reconstructed around actual cylinder/rocker-cover clearance; forward lip120mm shorter based on visible photographic boundaries in all3 views; rear mount/engine/propeller retained. Not a printed factory section.'
for k in range(12):
    a=2*pi*k/12;normal=Vector((sin(a),0,cos(a)));center=Vector((.724*sin(a),2.735,engineZ+.724*cos(a)))
    Tube('CowlQuarterTurnFastener'+str(k),center,center+normal*.0014,.0030,'Steel',12)
RevolveY('Engine_AdapterPanels',[(2.25,.608),(2.38,.626),(2.67,.657)],'Skin')
RevolveY('Engine_Crankcase',[(2.69,.28),(2.87,.29),(3.02,.20),(3.10,.14)],'EngineCast',64)
for i in range(9):
    a=2*pi*i/9;radial=Vector((sin(a),0,cos(a)));base=Vector((0,engineY,engineZ))
    Tube('Engine_Cylinder'+str(i),base+radial*.24,base+radial*.57,.092,'Steel',24)
    for k in range(24):
        r=.31+k*(.22/23);Tube('CylinderCoolingFin'+str(i)+'_'+str(k),base+radial*(r-.0016),base+radial*(r+.0016),.110-(k/23)*.006,'Steel',24)
    head=base+radial*.60;cover=Ellipsoid('RockerCover'+str(i),head,(.10,.095,.065),'EngineCast',24,12)
    cover.rotation_mode='QUATERNION';cover.rotation_quaternion=radial.to_track_quat('Z','Y')
    for delta in [-.045,.045]:
        start=base+radial*.18+Vector((delta,.12,0));end=base+radial*.55+Vector((delta,.07,0));Tube('Pushrod'+str(i)+str(delta),start,end,.010,'Bright',10)
    Curve('IgnitionLead'+str(i),[tuple(base+radial*.20+Vector((0,.17,0))),tuple(base+radial*.38+Vector((.03,.15,0))),tuple(base+radial*.57+Vector((.02,.10,0)))],.005,'Dark')
    ang=2*pi*i/9+.14
    Tube('EngineMountBolt'+str(i),(sin(ang)*.22,3.035,engineZ+cos(ang)*.22),(sin(ang)*.22,3.055,engineZ+cos(ang)*.22),.013,'Bright',6)

prop=Pivot('Pivot_Propeller',(0,3.45,engineZ),'Y',[0,360])
# JACAR C01004104400, whole-engine section figure1, shows the continuous
# output shaft between the front case and propeller boss. The earlier model
# left a210mm axial gap. These hidden shaft dimensions are reconstructed.
shaft=Tube('Propeller_DriveShaft',(0,3.085,engineZ),(0,3.345,engineZ),.075,'Bright',32,prop)
shaft['preserveAssemblyPart']=True
shaft['reconstructionScope']='Coaxial shaft follows1935 engine section figure1; hidden diameter and overlap are inferred, not printed factory dimensions'
root['propellerDriveConnection']='Continuous coaxial output shaft bridges actual crankcase front and propeller hub; JACAR C01004104400 figure1'
RevolveY('Propeller_Hub',[(3.31,.115),(3.49,.14),(3.55,.115)],'Bright',64,prop)
Tube('Propeller_FrontCap',(0,3.535,engineZ),(0,3.55,engineZ),.115,'Bright',64,prop)
for k in range(6):
    a=2*pi*k/6;x=.075*sin(a);z=engineZ+.075*cos(a)
    Tube('Propeller_HubBolt'+str(k),(x,3.549,z),(x,3.556,z),.011,'Steel',6,prop)
for side in [-1,1]:
    vv=[];ff=[];uv=[];bladeShape=[(.12,.055,0),(.25,.11,.02),(.5,.15,.04),(.85,.16,.08),(1.14,.125,.12),(1.36,.07,.14),(1.45,0,.14)]
    angle=.87
    for surf in [-1,1]:
        for j,(r,w,sweep) in enumerate(bladeShape):
            twist=.62-.38*r/1.45
            for edge in [-1,1]:
                xx=side*(edge*w+sweep);zz=side*r;y=3.465+edge*w*sin(twist)+surf*.012*sin(pi*r/1.45)
                x=xx*cos(angle)+zz*sin(angle);z=engineZ-xx*sin(angle)+zz*cos(angle)
                vv.append((x,y,z));uv.append((r/1.45,(edge+1)/4+(surf+1)/4))
    n=len(bladeShape)*2
    for f in range(2):
        for j in range(len(bladeShape)-1):
            a=f*n+j*2;ff.append((a,a+1,a+3,a+2) if f==0 else (a+2,a+3,a+1,a))
    for e in [0,1]:
        for j in range(len(bladeShape)-1):
            a=j*2+e;ff.append((a,a+2,a+2+n,a+n))
    obj=Mesh('Propeller_Blade'+str(side),vv,ff,'Bright',uv);MoveUnder(obj,prop)

if engineFrame:
    for obj in list(root.children_recursive):
        if obj not in engineBefore and obj!=engineFrame and obj.parent==root:MoveUnder(obj,engineFrame)

# Divided undercarriage: two separately driven wheel hubs and compliant tires.
wheelScale=wheelRadius/.43
wheelBaseProfile=[(-.13,.22),(-.15,.30),(-.11,.39),(-.055,.43),(.055,.43),(.11,.39),(.15,.30),(.13,.22)]
wheelProfileDistances=[0]
for first,last in zip(wheelBaseProfile,wheelBaseProfile[1:]):wheelProfileDistances.append(wheelProfileDistances[-1]+math.dist(first,last)*wheelScale)
uvDomains['Tire']=(2*pi*wheelRadius,wheelProfileDistances[-1])
root['mainWheelCenterBlenderM']=[0,wheelStation,wheelRadius]
root['wheelShapeScope']='Canvas86 explicitly specifies860x300mm low-pressure Bendix braked wheels; fore/aft station remains reconstruction; 2.25m center track follows the general specification'
root['tireSectionWidthM']=.30*wheelScale;root['tireMeridianLengthM']=wheelProfileDistances[-1]
for side,label in [(-1,'Left'),(1,'Right')]:
    wc=(side*1.125,wheelStation,wheelRadius);pivot=Pivot('Pivot_Wheel'+label,wc,'X',[0,360]);pivot['rollingRadiusM']=wheelRadius
    # Canvas86 locates the shock mount 425mm outboard, 918.7mm ahead of
    # frame1, 445.6mm below the fuselage axis. The lower belly fitting is
    # 645mm below the axis; fork/clevis separation is inferred.
    shockUpper=Vector((side*.425,frameStations[0]+.9187,bodyAxisZ-.4456))
    shockLower=Vector((side*1.095,wheelStation,wheelRadius));shockAxis=(shockLower-shockUpper).normalized();shockLength=(shockLower-shockUpper).length
    Tube('LandingGear_ShockBarrel'+label,shockUpper,shockUpper+shockAxis*(shockLength*.57),.039,'Steel',20)
    Tube('LandingGear_ShockPiston'+label,shockUpper+shockAxis*(shockLength*.50),shockLower,.023,'Bright',20)
    for distance in [.025,shockLength*.54]:
        point=shockUpper+shockAxis*distance;Tube('LandingGear_ShockCollar'+label+str(distance),point,point+shockAxis*.024,.043,'Steel',16)
    for name,offset in [('Fore',.105),('Aft',-.105)]:
        Tube('LandingGear_'+name+'Stay'+label,(side*.10,frameStations[0]+offset,bodyAxisZ-.645),(side*1.095,wheelStation+offset*.50,wheelRadius),.026,'Steel',16)
    # Axial lathe around X; the central dished hubs never rotate about Z.
    profile=[(x*wheelScale,r*wheelScale) for x,r in wheelBaseProfile]
    vv=[];ff=[];uv=[]
    for j,(x,r) in enumerate(profile):
        for k in range(65):
            a=2*pi*k/64;vv.append((wc[0]+x,wc[1]+r*sin(a),wc[2]+r*cos(a)));uv.append((k/64,wheelProfileDistances[j]/wheelProfileDistances[-1]))
    for j in range(len(profile)-1):
        for k in range(64):
            a=j*65+k;ff.append((a,a+65,a+66,a+1))
    tire=Mesh('Tire_'+label,vv,ff,'Tire',uv);MoveUnder(tire,pivot)
    for s in [-1,1]:
        Tube('WheelRim_'+label+str(s),(wc[0]+s*.11*wheelScale,wc[1],wc[2]),(wc[0]+s*.125*wheelScale,wc[1],wc[2]),.24*wheelScale,'Steel',48,pivot)
        Tube('WheelHub_'+label+str(s),(wc[0]+s*.12*wheelScale,wc[1],wc[2]),(wc[0]+s*.16*wheelScale,wc[1],wc[2]),.095*wheelScale,'Steel',32,pivot)
        for k in range(8):
            a=2*pi*k/8;cy=wc[1]+.16*wheelScale*sin(a);cz=wc[2]+.16*wheelScale*cos(a)
            Tube('HubBolt_'+label+str(s)+str(k),(wc[0]+s*.125*wheelScale,cy,cz),(wc[0]+s*.137*wheelScale,cy,cz),.012*wheelScale,'Steel',6,pivot)
    # Circular tire molding lines; fine localized weathering comes from the PBR pass.
    for s in [-1,1]:
        shoulderX=.15+(.11-.15)*(.325-.30)/(.39-.30)-.001
        Curve('TireMoldLine_'+label+str(s),[(wc[0]+s*shoulderX*wheelScale,wc[1]+.325*wheelScale*sin(2*pi*k/80),wc[2]+.325*wheelScale*cos(2*pi*k/80)) for k in range(80)],.0025*wheelScale,'Tire',True,pivot)
# NDL canvas89: a shock strut, lower frame links and a short curved shoe.
# Frame5/6 spacing is fixed by canvas64; the old long bent wire was not this assembly.
skidFrame5Y=frameStations[5]
skidUpper=Vector((0,skidFrame5Y,2.025))
skidAxisAngle=math.radians(26.5)
# Canvas90 (figure27) dimensions the upper-eye-to-shoe-mount total1000mm.
# Derive the parked attitude from this geometry, never the other way round.
skidLength=1.000
skidDirection=Vector((0,-sin(skidAxisAngle),-cos(skidAxisAngle)))
skidLower=skidUpper+skidDirection*skidLength
mount=Box('TailSkidLowerMountBody',skidLower-skidDirection*.050,(.075,.075,.100),'Steel',.003)
mount.rotation_mode='QUATERNION';mount.rotation_quaternion=skidDirection.to_track_quat('Z','Y');mount['preserveAssemblyPart']=True
for distance in [.925,.975]:
    point=skidUpper+skidDirection*distance;Tube('TailSkidMountBolt'+str(distance),point+Vector((-.046,0,0)),point+Vector((.046,0,0)),.007,'Bright',6)
Tube('TailSkidUpperNeck',skidUpper+skidDirection*.025,skidUpper+skidDirection*.100,.022,'Steel',16)
Tube('TailSkidShockBarrel',skidUpper+skidDirection*.100,skidUpper+skidDirection*.34,.031,'Steel',20)
Tube('TailSkidPiston',skidUpper+skidDirection*.27,skidLower-skidDirection*.080,.017,'Bright',16)
for distance in [.31]:
    point=skidUpper+skidDirection*distance;Tube('TailSkidShockCollar'+str(distance),point,point+skidDirection*.020,.035,'Steel',20)
for side in [-1,1]:
    linkJoint=skidLower-skidDirection*.075
    Tube('TailSkidLowerLink'+str(side),(side*.13,skidFrame5Y,1.49),(side*.035,linkJoint.y,linkJoint.z),.012,'Steel',12)
vv=[];ff=[];eyeSides=16
for x,radius in [(-.0125,.030),(.0125,.030),(.0125,.014),(-.0125,.014)]:
    for k in range(eyeSides):
        a=2*pi*k/eyeSides;vv.append(skidUpper+Vector((x,radius*cos(a),radius*sin(a))))
for ring in range(4):
    for k in range(eyeSides):
        kk=(k+1)%eyeSides;nextRing=(ring+1)%4;ff.append((ring*eyeSides+k,ring*eyeSides+kk,nextRing*eyeSides+kk,nextRing*eyeSides+k))
eye=Mesh('TailSkidUpperEye',vv,ff,'Steel');eye['preserveAssemblyPart']=True
for polygon in eye.data.polygons:polygon.use_smooth=abs(polygon.normal.x)<.5
Tube('TailSkidUpperPin',skidUpper+Vector((-.038,0,0)),skidUpper+Vector((.038,0,0)),.009,'Bright',6)
shoeProfile=[(skidLower.y+dy,skidLower.z+dz) for dy,dz in [(.145,.04),(.065,-.04),(-.115,-.060),(-.225,-.03),(-.265,.01)]]
neckY=skidLower.y+.020
first,last=next((a,b) for a,b in zip(shoeProfile,shoeProfile[1:]) if min(a[0],b[0])<=neckY<=max(a[0],b[0]))
shoeSlope=(last[1]-first[1])/(last[0]-first[0]);shoeNormal=Vector((0,-shoeSlope,1)).normalized()
shoeZ=first[1]+(neckY-first[0])*shoeSlope
# End the cast neck inside the actual sole thickness, without a floating gap.
shoeNeckBase=Vector((0,neckY,shoeZ))-shoeNormal*.003
neck=Box('TailSkidShoeNeck',shoeNeckBase+shoeNormal*.0325,(.048,.075,.065),'Steel',.002)
neck.rotation_euler.x=math.atan(shoeSlope)
vv=[];uv=[];ff=[]
for side in [-1,1]:
    for y,z in shoeProfile:vv.append((side*.045,y,z));uv.append(((y+4.23)/.5,(side*.045+.045)/.5))
for k in range(len(shoeProfile)-1):ff.append((k,k+1,k+1+len(shoeProfile),k+len(shoeProfile)))
shoe=Mesh('TailSkidShoe',vv,ff,'Steel',uv)
mod=shoe.modifiers.new('ShoeSteelThickness','SOLIDIFY');mod.thickness=.006
root['tailSkidReference']='NDL canvas90 figure27:1000mm upper-eye-to-shoe-mount total; canvas89 figure26:26deg30min axis and frame5 links. Mount placement, shoe and unresolved spring/cover details remain reconstruction.'
root['frameStationBlenderYm']=frameStations
root['tailSkidShockAxisDegrees']=26.5
root['tailSkidShockTotalLengthM']=skidLength
root['tailSkidUpperEyeBlenderM']=list(skidUpper);root['tailSkidShoeMountBlenderM']=list(skidLower)
bpy.context.view_layer.update()
evaluated=shoe.evaluated_get(bpy.context.evaluated_depsgraph_get());sample=bpy.data.meshes.new_from_object(evaluated)
shoePoints=[shoe.matrix_world@v.co for v in sample.vertices];bpy.data.meshes.remove(sample)
def SkidGroundHeight(point,angle):return wheelRadius+(point.z-wheelRadius)*cos(angle)+(point.y-wheelStation)*sin(angle)
lo,hi=0,.5
for _ in range(40):
    angle=(lo+hi)/2
    if min(SkidGroundHeight(point,angle) for point in shoePoints)>0:lo=angle
    else:hi=angle
parkAngle=(lo+hi)/2;contact=min(shoePoints,key=lambda point:SkidGroundHeight(point,parkAngle))
root['parkedGroundContactBlenderM']=list(contact);root['parkedPitchDegrees']=math.degrees(parkAngle)

# Photo-resolved windscreen shapes, hinged observer ring and forward gun troughs.
for idx,(cy,rx,ry) in enumerate(cockpits):
    y=cy+ry*.78
    # Seat both front frame corners on the real oval skin. The centre-height
    # approximation left the observer frame about67mm above its mounting skin.
    footTheta=math.asin(.29/Interp(sections,y,1))
    footZ=BodyPoint(y,footTheta)[2]+.006
    z=footZ+.035
    # Photo02's shield leans aft and has triangular side returns. A lone
    # forward-leaning pentagon appeared as an unsupported thin stick in side view.
    vv=[(-.29,y,z-.035),(-.23,y-.075,z+.25),(0,y-.11,z+.32),(.23,y-.075,z+.25),(.29,y,z-.035)]
    screen=Mesh('Windscreen'+str(idx+1),vv,[(0,1,2,3,4)],glass,smooth=False)
    Curve('WindscreenFrame'+str(idx+1),vv,.006,'Steel')
    screenReturnLength=.22 if idx==1 and fuselageExteriorProfile in ['Photo02Envelope','Photo02InstallationEnvelope'] else .26
    if idx==1:
        root['observerWindscreenReturnLengthM']=screenReturnLength
        root['observerWindscreenReturnScope']='Inferred triangular return fits the actual revised skin and clears the complete moving ring; no historical factory dimension is claimed.'
    for side,lowerIndex,upperIndex in [(-1,0,1),(1,4,3)]:
        rearY=y-screenReturnLength;rearX=side*(rx*sqrt(max(0,1-((rearY-cy)/ry)**2))+.007)
        rearTheta=math.asin(max(-1,min(1,rearX/Interp(sections,rearY,1))))
        rearZ=BodyTopSurface(rearY,rearX)+.009
        corners=[vv[lowerIndex],vv[upperIndex],(rearX,rearY,rearZ)]
        Mesh('WindscreenSide'+str(idx+1)+str(side),corners,[(0,1,2)],glass,smooth=False)
        Curve('WindscreenSideFrame'+str(idx+1)+str(side),corners,.006,'Steel',True)
    if idx==0:
        panel=Box('PilotInstrumentPanel',(0,cy+.38,2.10),(.53,.03,.28),'Dark')
        for n,(x,z,r) in enumerate([(-.16,2.14,.052),(0,2.14,.063),(.16,2.14,.052),(-.10,2.01,.036),(.08,2.01,.036)]):
            Tube('InstrumentBezel'+str(n),(x,cy+.35,z),(x,cy+.33,z),r,'Bright',32)
            Tube('InstrumentDial'+str(n),(x,cy+.327,z),(x,cy+.323,z),r*.87,'Dial',32)
            Curve('InstrumentNeedle'+str(n),[(x,cy+.32,z),(x+r*.5,cy+.32,z+r*.2)],.0015,'Bright')
    else:
        # Photo02 visible rear/upper arc, constrained by an actual circular
        # support ring. Exact mount subtype/hidden fittings remain reconstructed.
        ringRadius=.37;ringCy=cy-.07;ringZ=2.40;sideX=.27;ringTilt=-.14
        halfSpan=.220;arcHeight=.320;aftLean=.030
        def ObserverLocalPoint(x,y,height):return Vector((x,ringCy+y*cos(ringTilt)-height*sin(ringTilt),ringZ+y*sin(ringTilt)+height*cos(ringTilt)))
        observerFrame=bpy.data.objects.new('Frame_ObserverMount',None);scene.collection.objects.link(observerFrame);Parent(observerFrame)
        observerFrame.location=(0,ringCy,ringZ)
        observerYaw=Pivot('Pivot_ObserverYaw',(0,ringCy,ringZ),'Z',[-15,15]);observerYaw.rotation_euler.x=ringTilt;MoveUnder(observerFrame,observerYaw)
        observerFrame['reconstructionScope']='Parked support/cradle from visible Photo02 arc and installation drawing; subtype, fittings and motion limits not established'
        observerFrame['authoringYawAxis']='Z (glTF Y), centered on the circular base; parked pose only is verified'
        ring=[ObserverLocalPoint(ringRadius*sin(2*pi*k/96),ringRadius*cos(2*pi*k/96),0) for k in range(96)]
        Curve('ObserverGunRing',ring,.014,'Steel',True,observerFrame)
        def ObserverArcPoint(side,angle):return ObserverLocalPoint(side*sideX,halfSpan*cos(angle)-aftLean*sin(angle),arcHeight*sin(angle))
        for side in [-1,1]:
            arc=[ObserverArcPoint(side,1.77+(3.10-1.77)*k/16) for k in range(17)]
            arcObject=Curve('ObserverMountArc'+str(side),arc,.009,'Steel',parent=observerFrame)
            arcObject['preserveAssemblyPart']=True
            arcObject['authoringPolylineBlenderM']=[value for point in arc for value in point]
            braceTop=ObserverArcPoint(side,1.77);braceBase=ObserverLocalPoint(side*.23,sqrt(ringRadius**2-.23**2),0)
            Tube('ObserverDiagonalBrace'+str(side),braceBase,braceTop,.006,'Steel',8,observerFrame)
            supportTheta=math.asin(side*ringRadius/Interp(sections,ringCy,1));support=Vector(BodyPoint(ringCy,supportTheta))
            Tube('ObserverRingSupport'+str(side),support-Vector((0,0,.006)),(side*ringRadius,ringCy,ringZ-.023),.012,'Steel',8)
            rearFoot=ObserverLocalPoint(side*sideX,-sqrt(ringRadius**2-sideX**2),0);lowerRail=ObserverArcPoint(side,3.10)
            Tube('ObserverRearRailFoot'+str(side),rearFoot,lowerRail,.010,'Steel',8,observerFrame)
        pivotPoint=ObserverArcPoint(1,3.10)
        for side in [-1,1]:
            Tube('ObserverCradleSideAxle'+str(side),(side*(sideX-.035),pivotPoint.y,pivotPoint.z),(side*(sideX+.018),pivotPoint.y,pivotPoint.z),.012,'Steel',12,observerFrame)
            Tube('ObserverCradlePivotCap'+str(side),(side*(sideX-.005),pivotPoint.y,pivotPoint.z),(side*(sideX+.018),pivotPoint.y,pivotPoint.z),.022,'Steel',16,observerFrame)
        # Exterior-only twin flexible installation. A same-type historical close
        # view and AWM RELAWM29260 support the twin receivers, tubular cradle,
        # fluted jackets and buffer/grip forms. Parked angle and hidden fittings
        # remain photographic reconstruction; this contains no firing mechanism.
        gunOrigin=Vector((0,pivotPoint.y,pivotPoint.z))
        Tube('ObserverLowerGunShaft',(-sideX,gunOrigin.y,gunOrigin.z),(sideX,gunOrigin.y,gunOrigin.z),.012,'Steel',12,observerFrame)
        gunPivot=Pivot('Pivot_ObserverGunElevation',gunOrigin,'X',[-10,10]);MoveUnder(gunPivot,observerFrame)
        gunPivot['sourceHingeAxis']='-X';gunPivot['hingeAxis']='-X';gunPivot['poseScope']='Relative demonstration range about the inferred10deg low parked body-axis elevation; not a factory travel limit'
        gunPitch=math.radians(10)
        gunRotation=Matrix.Rotation(-gunPitch,4,'X')
        def GunPoint(x,along,height):return gunOrigin+Vector((x,-along*cos(gunPitch)+height*sin(gunPitch),along*sin(gunPitch)+height*cos(gunPitch)))
        def GunBox(name,x,along,height,size,mat='Steel',bevel=.003):
            obj=Box(name,(0,0,0),size,mat,bevel);obj.matrix_world=Matrix.Translation(GunPoint(x,along,height))@gunRotation;MoveUnder(obj,gunPivot);return obj
        for side,label in [(-1,'Left'),(1,'Right')]:
            gx=side*.075
            GunBox('ObserverGunReceiver'+label,gx,.04,.09,(.072,.30,.085),'Steel',.006)
            # The tall rectangular feed mockups are not resolved in the selected
            # low parked Photo02. Keep editable optional meshes outside the
            # default export rather than imposing another aircraft's loading.
            unresolved=bpy.data.collections.get('Source_UnresolvedObserverAccessories')
            if not unresolved:unresolved=bpy.data.collections.new('Source_UnresolvedObserverAccessories');scene.collection.children.link(unresolved)
            for accessoryName,along,height,size,bevel in [('ObserverGunFeedCase'+label,-.015,.172,(.087,.19,.080),.004),('ObserverGunFeedLid'+label,-.015,.215,(.091,.195,.008),.0015)]:
                accessory=GunBox(accessoryName,gx,along,height,size,'Steel',bevel);world=accessory.matrix_world.copy();accessory.parent=None;accessory.matrix_world=world
                for collection in list(accessory.users_collection):collection.objects.unlink(accessory)
                unresolved.objects.link(accessory);accessory.hide_render=True;accessory.hide_viewport=True;accessory.hide_set(True);accessory['unresolvedAccessoryFor']='Observer flexible installation; feed appearance/loading not proven for selected Photo02'
            GunBox('ObserverGunSidePlate'+label,gx+side*.038,.045,.09,(.006,.225,.059),'Steel',.002)
            # Longitudinal fluting on the exterior jacket, separate from the bore.
            vv=[];ff=[];uv=[];n=48
            for station in [.205,.465]:
                for k in range(n):
                    a=2*pi*k/n;radius=.0245+.0018*cos(8*a);vv.append(GunPoint(gx+radius*cos(a),station,.09+radius*sin(a)));uv.append((k/n,station/.5))
            for k in range(n):ff.append((k,(k+1)%n,(k+1)%n+n,k+n))
            jacket=Mesh('ObserverGunFlutedJacket'+label,vv,ff,'Steel',uv);MoveUnder(jacket,gunPivot)
            Tube('ObserverGunBarrel'+label,GunPoint(gx,.44,.09),GunPoint(gx,.945,.09),.011,'Steel',24,gunPivot)
            Tube('ObserverGunMuzzleCollar'+label,GunPoint(gx,.925,.09),GunPoint(gx,.959,.09),.013,'Steel',24,gunPivot)
            # Recessed dark muzzle face is visual geometry only.
            Tube('ObserverGunMuzzleInset'+label,GunPoint(gx,.9588,.09),GunPoint(gx,.9591,.09),.006,'Dark',16,gunPivot)
            grip=GunBox('ObserverGunGrip'+label,gx,-.065,-.005,(.038,.045,.12),'Dark',.006)
            Curve('ObserverGunGripGuard'+label,[GunPoint(gx+side*.032,-.12,.05),GunPoint(gx+side*.032,-.12,-.075),GunPoint(gx+side*.032,.02,-.075),GunPoint(gx+side*.032,.02,.05)],.004,'Steel',parent=gunPivot)
            pad=Ellipsoid('ObserverGunBufferPad'+label,GunPoint(gx,-.115,.092),(.034,.020,.047),'Leather',24,12,gunPivot);pad.rotation_euler.x=-gunPitch
            Tube('ObserverGunCockingStem'+label,GunPoint(gx+side*.050,.025,.12),GunPoint(gx+side*.080,.025,.12),.0045,'Steel',12,gunPivot)
            Tube('ObserverGunCockingKnob'+label,GunPoint(gx+side*.080,.015,.12),GunPoint(gx+side*.080,.040,.12),.007,'Steel',12,gunPivot)
            for offset in [-.075,.035,.12]:
                Tube('ObserverGunSideFastener'+label+str(offset),GunPoint(gx+side*.041,offset,.095),GunPoint(gx+side*.045,offset,.095),.004,'Steel',8,gunPivot)
            Tube('ObserverGunCradleRail'+label,GunPoint(side*.13,-.115,.035),GunPoint(side*.13,.22,.035),.009,'Steel',12,gunPivot)
            vv=[];ff=[];n=24
            for x,radius in [(side*.13-.0125,.035),(side*.13+.0125,.035),(side*.13+.0125,.0128),(side*.13-.0125,.0128)]:
                for k in range(n):
                    a=2*pi*k/n;vv.append(GunPoint(x,-radius*cos(a),radius*sin(a)))
            for ring in range(4):
                for k in range(n):ff.append((ring*n+k,ring*n+(k+1)%n,((ring+1)%4)*n+(k+1)%n,((ring+1)%4)*n+k))
            bearing=Mesh('ObserverGunTrunnionBearing'+label,vv,ff,'Steel');MoveUnder(bearing,gunPivot)
        for station in [-.07,.18]:Tube('ObserverGunCradleCrossbar'+str(station),GunPoint(-.13,station,.035),GunPoint(.13,station,.035),.009,'Steel',12,gunPivot)
        GunBox('ObserverGunCentralRib',0,.06,.050,(.036,.33,.018),'Steel',.002)
        root['observerConfiguration']=observerConfiguration
        optionalArmament=[]
        if observerConfiguration=='Photo02Carrier':
            firearmPrefixes=('ObserverGunReceiver','ObserverGunSidePlate','ObserverGunFlutedJacket','ObserverGunBarrel','ObserverGunMuzzle','ObserverGunGrip','ObserverGunBufferPad','ObserverGunCocking','ObserverGunSideFastener')
            for obj in list(gunPivot.children_recursive):
                if not obj.name.startswith(firearmPrefixes):continue
                world=obj.matrix_world.copy();local=obj.matrix_local.copy()
                obj['optionalParentName']=obj.parent.name
                obj['optionalLocalMatrix']=[value for row in local for value in row]
                obj['unresolvedAccessoryFor']='Optional twin exterior corroborated by a different aircraft photograph; selected Photo02 loading is unresolved'
                obj.parent=None;obj.matrix_world=world
                for collection in list(obj.users_collection):collection.objects.unlink(obj)
                unresolved.objects.link(obj);obj.hide_render=True;obj.hide_viewport=True;obj.hide_set(True)
                optionalArmament.append(obj.name)
            assert len(optionalArmament)==28, 'Preserve the complete optional exterior assembly'
        root['optionalObserverArmamentJson']=json.dumps(sorted(optionalArmament))
        root['observerMountScope']='Visible Photo02 rail/carriage with independent yaw/elevation. Crossshaft now meets the low rail end, without an invented100mm hanging fork; rear rail feet meet the actual circular base. Photo02Carrier omits the unproven long twin exterior from default export and retains all28 firearm parts as hidden editable source options. This does not establish historical absence, exact mount subtype or factory travel limits. No firing mechanism.'
def ForebodyPoint(y,theta,offset=0):
    radius=Interp([(2.25,.608),(2.38,.626),(2.67,.657)],y,1)+offset
    return (radius*sin(theta),y,engineZ+radius*cos(theta))

def ForebodyPatch(name,yValues,thetaValues,side,mat,offset):
    vv=[];uv=[];ff=[];columns=len(thetaValues)
    for y in yValues:
        for theta in thetaValues:
            lift=offset(y) if callable(offset) else offset
            vv.append(ForebodyPoint(y,side*theta,lift));uv.append((y/1.5,side*theta*.64/1.5))
    for i in range(len(yValues)-1):
        for j in range(columns-1):
            a=i*columns+j;face=(a,a+columns,a+columns+1,a+1)
            ff.append(face if side>0 else face[::-1])
    return Mesh(name,vv,ff,mat,uv)

serviceScript=scriptPath.with_name('Script_NakajimaKi4ServicePanels.py')
exec(compile(serviceScript.read_text(encoding='utf8'),str(serviceScript),'exec'),globals())
for side in [-1,1]:
    BuildServicePanel(side)
    BuildExhaustOutlet(side)
    if side==1:
        for cy in [2.25,2.63]:
            pts=[ForebodyPoint(cy,2*pi*k/100,.002) for k in range(100)];Curve('EnginePanelSeam'+str(cy),pts,.0010,'Steel',True)
    # Small external light bomb racks; no invented bomb load on this parked reference.
    for n in range(3):
        x=side*(.9+n*.32);anchor=WingPoint(x,.62,'Lower',False);y=anchor[1];z=anchor[2]-.04
        Box('LightBombRack'+str(side)+str(n),(x,y,z),(.075,.32,.037),'Steel',.006)
        for d in [-.10,.10]:Tube('RackHook'+str(side)+str(n)+str(d),(x,y+d,z-.02),(x,y+d,z-.09),.008,'Steel',10)

CutServiceApertures()

# SurfaceV2 shallow flush-head relief. The UV fastener seats remain under these
# real heads; all heads are combined into one static mesh, not 1500 draw calls.
rivetDescriptors=[]
for station in [-3.605,-3.045,-2.430,-1.810,-1.295,-.165,.780,1.65,2.30]:
    for offset in [-.010,.010]:
        y=station+offset
        if not sections[0][0]<=y<=sections[-1][0]:continue
        for k in range(84):
            theta=2*pi*k/84;point=Vector(BodyPoint(y,theta));rx=Interp(sections,y,1);rz=Interp(sections,y,2)
            if cos(theta)>0 and any((point.x/cx)**2+((y-cy)/cl)**2<1.12 for cy,cx,cl in cockpits):continue
            profileNormalAffected=BodyProfileNormalAffected(y,cos(theta))
            normal=BodySurfaceNormal(y,theta) if profileNormalAffected else Vector((sin(theta)/rx,0,cos(theta)/rz)).normalized()
            along=(Vector((0,1,0))-normal*normal.y).normalized() if profileNormalAffected else Vector((0,1,0))
            cross=normal.cross(along).normalized()
            rivetDescriptors.append((point.copy(),normal,along,cross))
def RivetGeometry(sides):
    vv=[];ff=[];uv=[]
    for point,normal,along,cross in rivetDescriptors:
        base=len(vv)
        for radius,height in [(.0028,.00008),(.0021,.00050),(.0006,.00068)]:
            for j in range(sides):
                a=2*pi*j/sides;vv.append(point+normal*height+along*(radius*cos(a))+cross*(radius*sin(a)));uv.append((.5+.48*cos(a),.5+.48*sin(a)))
        for ring in range(2):
            for j in range(sides):a=base+ring*sides+j;b=base+ring*sides+(j+1)%sides;ff.append((a,b,b+sides,a+sides))
        ff.append(tuple(base+2*sides+j for j in range(sides)))
    return vv,ff,uv
rivetVerts,rivetFaces,rivetUv=RivetGeometry(8)
rivetObject=Mesh('Surface_FlushRivetHeads',rivetVerts,rivetFaces,'Bright',rivetUv)
rivetObject['preserveAssemblyPart']=True;rivetObject['rivetCount']=len(rivetDescriptors);rivetObject['ringSides']=8

if engineFrame:
    for obj in list(root.children):
        if obj.name.startswith(('EngineServicePanel','EngineLouvre','EnginePanelSeam','ExhaustCollector')):MoveUnder(obj,engineFrame)
    engineFrame.location.y=-noseOffsetM
    root['geometryHypothesis']='Forward548mm bearer bay omitted only for a reversible photographic test. The manual8.25m configuration is preserved independently; no historical variant acceptance is asserted.'

def PbrTextures(mat, name):
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=nodes.get('Principled BSDF')
    images={}
    for channel in ['Base','Normal','Orm']:
        path=sourceRoot/'Textures'/('Texture_Ki4'+name+channel+'.png')
        assert path.exists(), 'Run Script_NakajimaKi4SurfaceBake.py before the PBR build'
        image=bpy.data.images.load(str(path),check_existing=True)
        image.colorspace_settings.name='sRGB' if channel=='Base' else 'Non-Color'
        tex=nodes.new('ShaderNodeTexImage');tex.image=image;tex.label='Ki4 '+channel;tex.location=(-700,250-150*len(images));images[channel]=tex
    links.new(images['Base'].outputs['Color'],bs.inputs['Base Color'])
    normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=1;links.new(images['Normal'].outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bs.inputs['Normal'])
    separate=nodes.new('ShaderNodeSeparateColor');separate.mode='RGB';links.new(images['Orm'].outputs['Color'],separate.inputs['Color'])
    links.new(separate.outputs['Green'],bs.inputs['Roughness']);links.new(separate.outputs['Blue'],bs.inputs['Metallic'])
    group=bpy.data.node_groups.get('glTF Material Output')
    if not group:
        from io_scene_gltf2.blender.com.material_helpers import create_settings_group
        group=create_settings_group('glTF Material Output')
    ao=nodes.new('ShaderNodeGroup');ao.node_tree=group;links.new(separate.outputs['Red'],ao.inputs['Occlusion'])
    mat['pbrSource']='Script_NakajimaKi4SurfaceBake.py: '+name
    mat['packing']='Base=sRGB, tangent Normal=OpenGL linear, ORM=AO/Roughness/Metallic linear'

if stage=='pbr':
    paintedParts=[]
    if observerFinish=='PaintedGray':
        observerPaint=Material('ObserverPaintedMetal',(.402,.402,.376),.48,0)
        PbrTextures(observerPaint,'PaintedFrame')
        framePrefixes=('ObserverGunRing','ObserverMountArc','ObserverDiagonalBrace','ObserverRingSupport','ObserverRearRailFoot','ObserverCradleSideAxle','ObserverCradlePivotCap','ObserverLowerGunShaft','ObserverGunCradleRail','ObserverGunTrunnionBearing','ObserverGunCradleCrossbar','ObserverGunCentralRib')
        for obj in root.children_recursive:
            if obj.type not in ['MESH','CURVE'] or not obj.name.startswith(framePrefixes):continue
            changed=False
            for index,mat in enumerate(obj.data.materials):
                if mat==mats['Steel']:obj.data.materials[index]=observerPaint;changed=True
            if changed:paintedParts.append(obj.name)
        assert len(paintedParts)==21, 'Apply the coating to the reconstructed carriage only, not firearm or engine parts'
    root['observerFinish']=observerFinish
    root['observerPaintedPartsJson']=json.dumps(sorted(paintedParts))
    root['observerFinishScope']='Neutral gray dielectric coating inferred from the selected Photo02 member brightness. Exact historical coating, hue and wear are not measured; shared engine/firearm steel is retained.'
    bodyMat=mats['Skin'].copy();bodyMat.name='Material_FuselageAluminum';body.data.materials.clear();body.data.materials.append(bodyMat)
    PbrTextures(bodyMat,'Fuselage')
    for mat,name in [(mats['Skin'],'Aluminum'),(mats['Bright'],'Aluminum'),(mats['Fabric'],'Linen'),(mats['TailFabric'],'TailFabric'),(mats['RibTape'],'RibTape'),(mats['EngineCast'],'EngineCast'),(mats['Cowl'],'Cowl'),(mats['Steel'],'Steel'),(mats['Wire'],'Steel'),(mats['Tire'],'Rubber'),(mats['Exhaust'],'Exhaust'),(mats['Leather'],'Leather')]:PbrTextures(mat,name)
    for image in bpy.data.images:
        if image.source=='FILE':image.pack()

# Retain exact pivots in both the high source and the glTF hierarchy.
bpy.context.view_layer.update()
for obj in list(root.children_recursive):
    if obj.type=='MESH' and not obj.data.uv_layers:
        bpy.context.view_layer.objects.active=obj;obj.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT');obj.select_set(False)

def Camera(name,loc,target,orthographic=0,lens=65):
    data=bpy.data.cameras.new(name);obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler();data.lens=lens
    if orthographic:data.type='ORTHO';data.ortho_scale=orthographic
    return obj
def Area(name,loc,power,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(Vector((0,0,1.5))-obj.location).to_track_quat('-Z','Y').to_euler()
    return obj
Area('StudioKey',(5,7,10),1800,8);Area('StudioFill',(-7,1,5),1000,7);Area('StudioRim',(0,-7,7),1600,6)
scene.world.color=(.25,.25,.25)
ground=Box('Review_Ground',(0,0,-.045),(200,200,.06),'Fabric',0);ground.parent=None
gray=bpy.data.materials.new('Review_GroundMaterial');gray.diffuse_color=(.19,.205,.20,1);ground.data.materials.clear();ground.data.materials.append(gray)
cameras=[Camera('Camera_Photo02',(15,9,4.5),(0,-.4,1.7),lens=64),Camera('Camera_Photo01',(11,17,4.4),(0,-.2,1.65),lens=64),Camera('Camera_Side',(17,0,2.0),(0,-.4,1.9),13),Camera('Camera_Front',(0,22,2.0),(0,0,1.75),13),Camera('Camera_Top',(0,0,22),(0,0,0),14),Camera('Camera_Detail',(4,6,3.6),(0,1.9,2.0),lens=72)]
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1280;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.camera=cameras[0]
# Packed source keeps all authoring objects; exporter selection excludes review camera, floor and lighting.
for obj in root.children_recursive:
    if obj.type!='MESH':continue
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.0000001)
    bmesh.ops.dissolve_degenerate(bm,edges=bm.edges,dist=.00000001)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(obj.data);bm.free()
def SetRibTapeFacing():
    for obj in root.children_recursive:
        if obj.type!='MESH' or not obj.name.startswith('RibTape_'):continue
        desired=1 if 'Top' in obj.name else -1;transform=obj.matrix_world.to_3x3().inverted().transposed()
        direction=sum((transform@p.normal).normalized().z*p.area for p in obj.data.polygons)
        if direction*desired<0:
            bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.normal_update();bm.to_mesh(obj.data);bm.free();obj.data.update()
        obj['outwardTapeFacing']='Top' if desired>0 else 'Bottom'

def SetTailSharpness():
    # Split the two sides at knife edges and ledge caps; averaging across a
    # near180deg trailing edge made spurious dark triangles on the fabric.
    for obj in root.children_recursive:
        if obj.type=='MESH' and any(obj.name==name or obj.name.startswith(name+'.') for name in ['VerticalFin','Rudder']):
            obj.data.set_sharp_from_angle(angle=math.radians(80))
SetTailSharpness();SetRibTapeFacing()
if geometryAoEnabled:
    aoScript=scriptPath.with_name('Script_NakajimaKi4GeometryAo.py')
    exec(compile(aoScript.read_text(encoding='utf8'),str(aoScript),'exec'),globals())
    aoImage,aoRecord=BakeGeometryAo(root,sourceRoot,evidenceRoot,rivetDescriptors,
        size=int(os.environ.get('KI4_AO_SIZE','2048')),samples=int(os.environ.get('KI4_AO_SAMPLES','64')))
    BindGeometryAo(root,aoImage)
    root['geometryAo']={'enabled':True,'uvLayer':'GeometryAO','uvIndex':1,'imageName':'Texture_Ki4GeometryAo','distanceM':2.,'resolution':aoRecord['resolution'],'movingPolicy':aoRecord['movingPolicy'],'fixedPolicy':aoRecord['fixedPolicy']}
    root['geometryAo']['seamStitchingEnabled']=True
    root['geometryAo']['seamStitchingScope']='Fuselage_Monocoque smooth same-material UV1 boundaries only; primary material maps unchanged'
    root['editableGuideCurves']=aoRecord['editableGuideCurves']
for sourceScript in sorted(scriptPath.parent.glob('Script_NakajimaKi4*.py')):
    text=bpy.data.texts.get(sourceScript.name) or bpy.data.texts.new(sourceScript.name)
    text.clear();text.write(sourceScript.read_text(encoding='utf8'));text.use_fake_user=True
bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot/'Scene_NakajimaKi4.blend'))
geometryPrepared=False
def Export(filename):
    global geometryPrepared
    bpy.ops.object.select_all(action='DESELECT')
    curves=[obj for obj in root.children_recursive if obj.type=='CURVE']
    for obj in curves:obj.select_set(True)
    if curves:
        bpy.context.view_layer.objects.active=curves[0];bpy.ops.object.convert(target='MESH')
    if not geometryPrepared:
        for obj in root.children_recursive:
            if obj.type!='MESH':continue
            bm=bmesh.new();bm.from_mesh(obj.data)
            bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.0000001)
            bmesh.ops.dissolve_degenerate(bm,edges=bm.edges,dist=.00000001)
            bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(obj.data);bm.free()
        geometryPrepared=True
    for obj in root.children_recursive:
        if obj.type!='MESH' or obj.data.uv_layers:continue
        layer=obj.data.uv_layers.new(name='UVMap')
        for poly in obj.data.polygons:
            axis=max(range(3),key=lambda i:abs(poly.normal[i]));a,b=[i for i in range(3) if i!=axis]
            for idx in poly.loop_indices:
                v=obj.data.vertices[obj.data.loops[idx].vertex_index].co;layer.data[idx].uv=(v[a],v[b])
    bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
    for obj in root.children_recursive:obj.select_set(True)
    SetTailSharpness();SetRibTapeFacing()
    bpy.ops.export_scene.gltf(filepath=str(assetRoot/filename),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_animations=False,export_yup=True)

def DeriveGame():
    records=[]
    bpy.context.view_layer.update()
    fabricNormalReference=CacheFabricSurfaceNormals([o for o in root.children_recursive if o.type=='MESH' and any(m==mats['Fabric'] for m in o.data.materials)])
    for obj in list(root.children_recursive):
        if obj.type!='MESH':continue
        bpy.context.view_layer.objects.active=obj
        for mod in list(obj.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
        original=obj.data;original.calc_loop_triangles()
        before=len(original.loop_triangles)
        if obj.name=='Surface_FlushRivetHeads':
            # Keep every physical head and its three height rings. Six radial
            # sides free budget for visible reference equipment, with an actual
            # sampled surface-error check against the eight-sided high source.
            vv,ff,uv=RivetGeometry(6);candidate=bpy.data.meshes.new('Mesh_FlushRivetGame6');candidate.from_pydata(vv,[],ff);candidate.update()
            layer=candidate.uv_layers.new(name='UVMap')
            for poly in candidate.polygons:
                poly.use_smooth=True
                for loopIndex in poly.loop_indices:layer.data[loopIndex].uv=uv[candidate.loops[loopIndex].vertex_index]
            for material in original.materials:candidate.materials.append(material)
            if geometryAoEnabled:AssignRivetAoUv(candidate,obj.matrix_world,rivetDescriptors)
            sourceTree=BVHTree.FromPolygons([v.co for v in original.vertices],[list(p.vertices) for p in original.polygons])
            candidateTree=BVHTree.FromPolygons([v.co for v in candidate.vertices],[list(p.vertices) for p in candidate.polygons])
            error=max([sourceTree.find_nearest(v.co)[3] or 0 for v in candidate.vertices]+[candidateTree.find_nearest(v.co)[3] or 0 for v in original.vertices])
            assert error<.0008, 'Rivet LOD must preserve the high-source surface at submillimeter scale'
            obj.data=candidate;obj['ringSides']=6
            records.append({'name':obj.name,'before':before,'after':sum(len(p.vertices)-2 for p in candidate.polygons),'ratio':sum(len(p.vertices)-2 for p in candidate.polygons)/before,'maxVertexSurfaceErrorM':error,'rivetCount':len(rivetDescriptors),'highRingSides':8,'gameRingSides':6});continue
        if before<1200 or not obj.name.startswith(('Fuselage','UpperWing','LowerWing','Aileron','Tailplane','Elevator','VerticalFin','Rudder')):continue
        sourceTree=BVHTree.FromPolygons([v.co for v in original.vertices],[list(p.vertices) for p in original.polygons])
        selected=None
        ratios=[.15,.2,.3,.35,.5,.7,.85] if obj.name in ['VerticalFin','Rudder'] else [.295,.3,.35,.5,.7,.85]
        for ratio in ratios:
            mod=obj.modifiers.new('GameSurfaceReduction','DECIMATE');mod.ratio=ratio;mod.use_collapse_triangulate=True
            dg=bpy.context.evaluated_depsgraph_get();evaluated=obj.evaluated_get(dg);candidate=bpy.data.meshes.new_from_object(evaluated)
            obj.modifiers.remove(mod)
            candidateTree=BVHTree.FromPolygons([v.co for v in candidate.vertices],[list(p.vertices) for p in candidate.polygons])
            error=max([sourceTree.find_nearest(v.co)[3] or 0 for v in candidate.vertices]+[candidateTree.find_nearest(v.co)[3] or 0 for v in original.vertices])
            # 2mm maximum sampled bidirectional surface deviation, never an unconditional budget collapse.
            if error<=obj.get('gameSurfaceToleranceM',.002):
                selected=candidate;records.append({'name':obj.name,'before':before,'after':sum(len(p.vertices)-2 for p in candidate.polygons),'ratio':ratio,'maxVertexSurfaceErrorM':error});break
            bpy.data.meshes.remove(candidate)
        if selected:obj.data=selected
        else:records.append({'name':obj.name,'before':before,'after':before,'ratio':1,'maxVertexSurfaceErrorM':0})
    # Merge only siblings sharing a material. Every moving part stays under its true hinge.
    groups={}
    for obj in list(root.children_recursive):
        if obj.type=='MESH' and len(obj.data.materials)==1 and not obj.get('preserveAssemblyPart'):groups.setdefault((obj.parent.name,obj.data.materials[0].name),[]).append(obj)
    for (parentName,matName),objects in groups.items():
        if len(objects)<2:continue
        sourceNames=[o.name for o in objects];bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
        combined=bpy.context.object;combined.name='Mesh_'+parentName.removeprefix('Pivot_')+'_'+matName.removeprefix('Material_')
        combined['sourceParts']=sourceNames
    bpy.context.view_layer.update()
    normalRecords=[ProjectFabricSurfaceNormals(fabricNormalReference,o) for o in root.children_recursive if o.type=='MESH' and any(m==mats['Fabric'] for m in o.data.materials)]
    (evidenceRoot/'Data_GameNormalTransfer.json').write_text(json.dumps(normalRecords,indent=2),encoding='utf8')
    (evidenceRoot/'Data_GameDerivation.json').write_text(json.dumps(records,indent=2),encoding='utf8')

if stage=='gray':Export('Model_NakajimaKi4Gray.glb')
else:
    exportRoot=sourceRoot/'Exports';exportRoot.mkdir(exist_ok=True)
    Export(exportRoot/'Model_NakajimaKi4High.glb')
    DeriveGame();Export('Model_NakajimaKi4.glb')
stats={'stage':stage,'objects':len(root.children_recursive),'meshes':sum(o.type=='MESH' for o in root.children_recursive),'exportSceneTriangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in root.children_recursive if o.type=='MESH'),'pivots':[o.name for o in root.children_recursive if o.name.startswith('Pivot_')],'source':str(sourceRoot/'Scene_NakajimaKi4.blend')}
(evidenceRoot/'Data_BuildStats.json').write_text(json.dumps(stats,indent=2),encoding='utf8');print(json.dumps(stats))
