"""Photo/manual-led Ki-4 authoring source. Execute through Script_BlenderMcp.mjs.

The original editable source is external; repository outputs contain no review images.
Build stage defaults to gray. Set KI4_STAGE=pbr only after checking gray renders.
Blender coordinates: X lateral, +Y nose, Z up; glTF converts nose to -Z.
"""
import bpy, bmesh, math, json, os, pathlib, random
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
from math import sin, cos, pi, sqrt

scriptPath=pathlib.Path(globals().get('__file__','Taierzhuang1938/_blender/Script_NakajimaKi4Build.py')).resolve()
repoRoot = scriptPath.parents[2]
assetRoot = repoRoot / 'Taierzhuang1938/Model/NakajimaKi4'
sourceRoot = pathlib.Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4')
evidenceRoot = sourceRoot / 'Evidence'
for folder in [assetRoot, sourceRoot, evidenceRoot]: folder.mkdir(parents=True, exist_ok=True)
stage = os.environ.get('KI4_STAGE', 'gray')
scene = bpy.context.scene
assert scene.get('BlenderMcpTask') in [None, 'NakajimaKi4'], 'Refusing another task scene'
if bpy.data.filepath:
    assert 'NakajimaKi4' in bpy.data.filepath, 'Refusing another source project'
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
root['version'] = '20261023ReferenceV1'

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
glass=Material('Windscreen',(.52,.63,.62),.12,0)
if stage!='gray':
    bs=glass.node_tree.nodes.get('Principled BSDF');bs.inputs['Transmission Weight'].default_value=.65
    bs.inputs['Alpha'].default_value=.32;bs.inputs['IOR'].default_value=1.48

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
                layer.data[idx].uv=(v[a]*.5,v[b]*.5)
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
    for p in obj.data.polygons:p.use_smooth=True
    if parent:MoveUnder(obj,parent)
    return obj

def Ellipsoid(name,loc,scale,mat='Skin',seg=32,rings=16,parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=loc)
    obj=bpy.context.object;obj.name=name;obj.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.append(mats[mat]);Parent(obj)
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

# The 1937 manual gives round/oval frames with a continuous monocoque, not a box fuselage.
sections=[(-4.56,.055,.10,1.77),(-4.25,.11,.16,1.77),(-3.70,.18,.245,1.78),(-3.05,.27,.32,1.79),(-2.35,.36,.39,1.80),(-1.55,.46,.46,1.82),(-.7,.53,.52,1.84),(.1,.575,.56,1.86),(.9,.60,.58,1.87),(1.65,.615,.595,1.87),(2.30,.61,.59,1.87),(2.58,.59,.58,1.87)]
def BodyPoint(y,theta,offset=0):
    rx=Interp(sections,y,1)+offset;rz=Interp(sections,y,2)+offset;zc=Interp(sections,y,3)
    return (rx*sin(theta),y,zc+rz*cos(theta))
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
cockpits=[(.18,.34,.49),(-1.13,.355,.53)]
for idx,(cy,rx,ry) in enumerate(cockpits):
    bpy.ops.mesh.primitive_cylinder_add(vertices=128,radius=1,depth=1.80,location=(0,cy,2.60))
    cutter=bpy.context.object;cutter.name='Temp_CockpitCutter';cutter.scale=(rx,ry,1)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    mod=body.modifiers.new('CockpitAperture'+str(idx),'BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
    bpy.context.view_layer.objects.active=body;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
    assert max(v.co.z for v in body.data.vertices)<2.50, 'Cockpit CSG introduced an exterior cutter surface'
    pts=[]
    for k in range(100):
        a=2*pi*k/100;x=rx*sin(a);y=cy+ry*cos(a);localRx=Interp(sections,y,1);rz=Interp(sections,y,2);zc=Interp(sections,y,3)
        z=zc+rz*sqrt(max(0,1-(x/localRx)**2))+.008
        pts.append((x,y,z))
    Curve('Cockpit_Coaming'+str(idx+1),pts,.021,'Leather',True)
    # Curved cockpit well lining is a separate dark surface below each opening.
    vv=[];ff=[]
    for level in [0,1]:
        for k in range(64):
            a=2*pi*k/64;x=rx*.94*sin(a);y=cy+ry*.94*cos(a)
            z=1.76 if level==0 else Interp(sections,y,3)+Interp(sections,y,2)*sqrt(max(0,1-(x/Interp(sections,y,1))**2))-.025
            vv.append((x,y,z))
    for k in range(64):ff.append((k,(k+1)%64,(k+1)%64+64,k+64))
    Mesh('Cockpit_Lining'+str(idx+1),vv,ff,'Dark')
    Box('Cockpit_Floor'+str(idx+1),(0,cy,1.77),(.52,.65,.025),'Dark')
    seat=Ellipsoid('Seat_Cushion'+str(idx+1),(0,cy-.1,1.93),(.235,.21,.065),'Leather')
    seat=Ellipsoid('Seat_Back'+str(idx+1),(0,cy-.28,2.11),(.24,.06,.26),'Leather')
    Tube('ControlStick'+str(idx+1),(0,cy+.12,1.81),(0,cy+.08,2.14),.016)
    Ellipsoid('StickGrip'+str(idx+1),(0,cy+.08,2.14),(.025,.034,.065),'Dark',16,8)
    for side in [-1,1]:Tube('RudderPedal'+str(idx+1),(side*.16,cy+.27,1.9),(side*.06,cy+.27,1.9),.014)

# UIUC NACA M6 profile, as identified by manual printed p.2.
upper=[(0,0),(.0125,.0197),(.025,.0281),(.05,.0403),(.075,.0494),(.1,.0571),(.15,.0682),(.2,.0755),(.25,.0801),(.3,.0822),(.4,.0805),(.5,.0726),(.6,.0603),(.7,.0458),(.8,.0306),(.9,.0155),(.95,.0088),(1,.0026)]
lower=[(0,0),(.0125,-.0176),(.025,-.022),(.05,-.0273),(.075,-.0303),(.1,-.0324),(.15,-.0347),(.2,-.0362),(.25,-.0371),(.3,-.0379),(.4,-.039),(.5,-.0394),(.6,-.0382),(.7,-.0348),(.8,-.0283),(.9,-.0177),(.95,-.0108),(1,.0026)]
# x, leading edge, trailing edge. These traces follow NDL canvases 73/74.
upperOutline=[(0,2.00,.64),(.40,2.00,.57),(.70,2.00,.20),(1.10,2.00,-.11),(1.75,2.00,-.25),(2.5,2.00,-.20),(3.5,2.00,-.05),(4.40,1.99,.12),(5.05,1.94,.29),(5.5,1.81,.50),(5.83,1.58,.72),(6.0,1.15,1.15)]
lowerOutline=[(0,.76,-.96),(.47,.76,-.96),(1.5,.76,-.94),(2.5,.76,-.78),(3.20,.75,-.56),(3.70,.68,-.30),(4.03,.53,-.06),(4.26,.27,.27)]
# Manual73 labels 1..38, with 196/204/178/160/98mm outer intervals;
# Manual74 labels 1..23 and visibly closer tip ribs. Inner station positions are
# calibrated from the drawing; exact unreadable manufacturing intervals remain inferred.
upperRibs=[4.322*i/26 for i in range(27)]
for interval in [.196,.204,.196,.204,.178,.160,.098,.098,.098,.098,.098]:upperRibs.append(upperRibs[-1]+interval)
lowerRibs=[.47+(3.147-.47)*i/15 for i in range(16)]+[3.341,3.549,3.752,3.852,3.956,4.057,4.151]
def WingPoint(x,t,which='Upper',top=True,extra=0):
    table=upperOutline if which=='Upper' else lowerOutline;a=abs(x)
    le=Interp(table,a,1);te=Interp(table,a,2);chord=max(.001,le-te)
    if which=='Upper' and a>5.05:
        arc=sqrt(max(0,1-((a-5.05)/.95)**2));le=1.15+.79*arc;te=1.15-.86*arc
    elif which=='Lower' and a>3.20:
        arc=sqrt(max(0,1-((a-3.20)/1.06)**2));le=.095+.655*arc;te=.095-.655*arc
    if which=='Upper':
        le=2+(le-2)*(2.0/2.25);te=2+(te-2)*(2.0/2.25)
    else:
        le=1.5275+(le-.76)*(1.25/1.72);te=1.5275+(te-.76)*(1.25/1.72)
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
    return (x,y,z)

def WingPanel(name,which,side,x0,x1,t0=0,t1=1,parent=None):
    nx=max(12,int((x1-x0)/.065));nt=42;vv=[];ff=[];uv=[]
    for top in [True,False]:
        for i in range(nx+1):
            x=side*(x0+(x1-x0)*i/nx)
            for j in range(nt+1):
                q=(1-cos(pi*j/nt))/2;t=t0+(t1-t0)*q
                vv.append(WingPoint(x,t,which,top));uv.append((abs(x)/6,t if top else 2-t))
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

ailerons={}
for side,label in [(-1,'Left'),(1,'Right')]:
    WingPanel('UpperWing_Inboard'+label,'Upper',side,0,2.40)
    WingPanel('UpperWing_Main'+label,'Upper',side,2.40,5.83,0,.74)
    WingPanel('UpperWing_Tip'+label,'Upper',side,5.83,6.0)
    hinge=(Vector(WingPoint(side*2.4,.755,'Upper',True))+Vector(WingPoint(side*2.4,.755,'Upper',False)))/2
    pivot=Pivot('Pivot_Aileron'+label,hinge,'X',[-18,18]);ailerons[label]=pivot
    tipHinge=(Vector(WingPoint(side*5.815,.755,'Upper',True))+Vector(WingPoint(side*5.815,.755,'Upper',False)))/2
    hingeDirection=(tipHinge-Vector(hinge))*side
    pivot.rotation_mode='QUATERNION';pivot.rotation_quaternion=hingeDirection.to_track_quat('X','Z')
    WingPanel('Aileron_'+label,'Upper',side,2.415,5.815,.76,1,pivot)
    WingPanel('LowerWing_'+label,'Lower',side,0,4.26)
    for which,ribPositions in [('Upper',upperRibs),('Lower',lowerRibs)]:
        for i,position in enumerate(ribPositions):
            if position==0 and side<0:continue
            x=side*position
            for top in [True,False]:
                ranges=[(0,.738,None),(.762,1,pivot)] if which=='Upper' and 2.415<abs(x)<5.815 else [(0,1,None)]
                for start,end,moving in ranges:
                    vv=[];ff=[];uv=[]
                    for j in range(37):
                        t=start+(end-start)*(1-cos(pi*j/36))/2
                        for d in [-.007,.007]:
                            vv.append(WingPoint(x+d,t,which,top,.0008 if top else -.0008));uv.append((abs(x+d)/6,t if top else 2-t))
                    for j in range(36):a=j*2;ff.append((a,a+1,a+3,a+2))
                    tape=Mesh('RibTape_'+which+label+str(i)+('Top' if top else 'Bottom')+str(start),vv,ff,'Fabric',uv)
                    if moving:MoveUnder(tape,moving)
    # One interplane compression post and two cabane pairs, per original wing general drawing.
    lowerA=WingPoint(side*2.80,.48,'Lower',True)
    upperA=WingPoint(side*3.68,.24,'Upper',False)
    upperB=WingPoint(side*3.68,.64,'Upper',False)
    for n,end,radius in [('Front',upperA,.028),('Rear',upperB,.026)]:
        strut=Tube('Interplane_'+n+label,lowerA,end,radius,'Skin',20);strut.scale.x=.40;strut.scale.y=1.60
    for n,t,ybot in [('Front',.20,1.35),('Rear',.64,.25)]:
        end=WingPoint(side*.49,t,'Upper',False)
        strut=Tube('Cabane_'+n+label,(side*.51,ybot,2.25),end,.023,'Steel',20);strut.scale.x=.42;strut.scale.y=1.55
    # Flying and landing cables cross between wing spars with local turnbuckles.
    cableEnds=[(WingPoint(side*.58,.24,'Lower',True),upperA),(WingPoint(side*.58,.74,'Lower',True),upperB),(WingPoint(side*.50,.24,'Upper',False),lowerA),(WingPoint(side*.50,.64,'Upper',False),WingPoint(side*2.80,.74,'Lower',True))]
    for i,(a,b) in enumerate(cableEnds):
        Tube('FlyingWire_'+label+str(i),a,b,.0042,'Wire',8)
        va,vb=Vector(a),Vector(b);d=(vb-va).normalized();Tube('Turnbuckle_'+label+str(i),va+d*.08,va+d*.17,.009,'Steel',10)

# Tail outlines traced from manual canvases 83/84. Separate moving elevator halves.
def FlatAirfoil(name,outline,axis='horizontal',thickness=.035,mat='Fabric',parent=None):
    # Radial loft with rounded rim and a cambered center; full thickness goes to zero at the outline.
    # Preserve the original outline's hinges and interpolate only curved outer edges.
    refined=[]
    for i,p1 in enumerate(outline):
        p0=Vector(outline[(i-1)%len(outline)]);p1=Vector(p1);p2=Vector(outline[(i+1)%len(outline)]);p3=Vector(outline[(i+2)%len(outline)])
        for k in range(6):
            t=k/6
            if (axis=='vertical' and abs(p1.y-p2.y)<.015) or (axis=='horizontal' and (abs(p1.y-p2.y)<.015 or abs(p1.x-p2.x)<.015)):q=p1.lerp(p2,t)
            else:q=.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t)
            refined.append(tuple(q))
    outline=refined
    center=Vector(tuple(sum(p[k] for p in outline)/len(outline) for k in range(3)))
    vv=[];uv=[];ff=[];n=len(outline);nr=8
    normal=Vector((0,0,1) if axis=='horizontal' else (1,0,0))
    for top in [1,-1]:
        for r in range(nr+1):
            fac=.001+.999*r/nr
            for i,p in enumerate(outline):
                point=center+(Vector(p)-center)*fac+normal*top*thickness*sqrt(max(0,1-fac*fac))
                vv.append(point);uv.append((point.x*.25+.5,point.y*.25+.5) if axis=='horizontal' else (point.y*.25+.5,point.z*.25))
    layer=(nr+1)*n
    for f in range(2):
        for r in range(nr):
            for i in range(n):
                a=f*layer+r*n+i;b=f*layer+r*n+(i+1)%n;c=b+n;d=a+n
                ff.append((a,b,c,d) if f==0 else (d,c,b,a))
        ff.append(tuple(f*layer+i for i in range(n)))
    for i in range(n):ff.append((nr*n+i,nr*n+(i+1)%n,nr*n+(i+1)%n+layer,nr*n+i+layer))
    obj=Mesh(name,vv,ff,mat,uv)
    if parent:MoveUnder(obj,parent)
    return obj

for side,label in [(-1,'Left'),(1,'Right')]:
    outline=[(0,-3.38,1.82),(.42,-3.18,1.82),(.98,-3.14,1.82),(1.55,-3.28,1.82),(1.99,-3.55,1.82),(2.18,-3.84,1.82),(2.13,-4.00,1.82),(.0,-4.00,1.82)]
    outline=[(side*x,y,z) for x,y,z in outline];FlatAirfoil('Tailplane_'+label,outline,thickness=.042)
    pivot=Pivot('Pivot_Elevator'+label,(0,-4.025,1.82),'X',[-25,25])
    outline=[(.18,-4.045,1.82),(2.12,-4.045,1.82),(2.00,-4.25,1.82),(1.6,-4.47,1.82),(.95,-4.58,1.82),(.22,-4.54,1.82),(.18,-4.40,1.82)]
    FlatAirfoil('Elevator_'+label,[(side*x,y,z) for x,y,z in outline],thickness=.032,parent=pivot)
    Tube('TailplaneBrace_'+label,(side*.18,-3.65,1.43),(side*1.52,-3.71,1.80),.012,'Steel')
finOutline=[(0,-2.90,1.84),(0,-3.14,2.00),(0,-3.33,2.40),(0,-3.49,2.82),(0,-3.68,3.00),(0,-3.88,3.05),(0,-4.04,3.02),(0,-4.21,2.84),(0,-4.21,1.79)]
fin=FlatAirfoil('VerticalFin',finOutline,'vertical',.045)
rudder=Pivot('Pivot_Rudder',(0,-4.25,1.80),'Z',[-25,25])
rudderOutline=[(0,-4.25,1.42),(0,-4.25,2.83),(0,-4.12,3.02),(0,-4.37,3.03),(0,-4.57,2.85),(0,-4.69,2.52),(0,-4.70,1.78),(0,-4.60,1.52)]
rudderMesh=FlatAirfoil('Rudder',rudderOutline,'vertical',.035,parent=rudder)
for obj in [fin,rudderMesh]:
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=.0000001)
    bmesh.ops.dissolve_degenerate(bm,edges=bm.edges,dist=.00000001);bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    bm.to_mesh(obj.data);bm.free()
# Hidden clearance around the fixed tail cone; visible outer outline is unchanged.
# The exact internal recess is a functional reconstruction, not proven by the photos.
clearanceSections=[(-4.61,.008,.030,1.77),(-4.59,.058,.095,1.77),(-4.56,.080,.125,1.77),(-4.25,.135,.185,1.77),(-4.06,.155,.215,1.775)]
vv=[];ff=[];nr=32;ns=64
for j in range(nr+1):
    y=-4.61+(.55*j/nr);rx=Interp(clearanceSections,y,1);rz=Interp(clearanceSections,y,2);zc=Interp(clearanceSections,y,3)
    for k in range(ns):a=2*pi*k/ns;vv.append((rx*sin(a),y,zc+rz*cos(a)))
for j in range(nr):
    for k in range(ns):a=j*ns+k;b=j*ns+(k+1)%ns;ff.append((a,b,b+ns,a+ns))
ff.append(tuple(range(ns-1,-1,-1)));ff.append(tuple(nr*ns+k for k in range(ns)))
cutter=Mesh('Temp_RudderTailConeClearance',vv,ff,'Dark')
mod=rudderMesh.modifiers.new('TailConeMotionClearance','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
bpy.context.view_layer.objects.active=rudderMesh;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
rudderMesh['inferredDetail']='Curved clearance follows the fixed tail cone instead of cutting an oversized rectangular opening; validated through +-25deg'
# Machine a balance-horn pocket from the actual swept control volume. This keeps
# the combined outside silhouette while clearing the fixed fin's internal edges.
hingePosition=Vector((0,-4.25,1.80))
for angle in range(-25,26,5):
    tool=bpy.data.objects.new('Temp_RudderBalanceSweep',rudderMesh.data.copy());scene.collection.objects.link(tool)
    tool.data.update()
    for vertex in tool.data.vertices:vertex.co+=vertex.normal*.010
    tool.data.update()
    tool.matrix_world=Matrix.Translation(hingePosition)@Matrix.Rotation(math.radians(angle),4,'Z')@Matrix.Translation(-hingePosition)
    mod=fin.modifiers.new('BalanceHornClearance'+str(angle),'BOOLEAN');mod.operation='DIFFERENCE';mod.object=tool
    bpy.context.view_layer.objects.active=fin;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(tool,do_unlink=True)
fin['inferredDetail']='Internal balance-horn pocket from swept rudder volume; external assembly outline retained'
fin['internalMotionClearanceM']=.010
finFrame=bpy.data.objects.new('Frame_VerticalTailIncidence',None);scene.collection.objects.link(finFrame);Parent(finFrame)
finFrame.location=(0,-4.25,1.80);MoveUnder(fin,finFrame);MoveUnder(rudder,finFrame)
finFrame.rotation_euler.z=math.radians(3+40/60)
finFrame['manualSetting']='NDL canvas6: vertical surface set left 3deg40min relative to fuselage axis'

# Engine/cowling: shallow Townend-style ring, visible nine-cylinder Ha-8 radial.
engineY=2.86;engineZ=1.90
def RevolveY(name,profile,mat='Cowl',n=96,parent=None):
    vv=[];ff=[];uv=[]
    for j,(y,r) in enumerate(profile):
        for k in range(n+1):
            a=2*pi*k/n;vv.append((r*sin(a),y,engineZ+r*cos(a)));uv.append((k/n,j/max(1,len(profile)-1)))
    for j in range(len(profile)-1):
        for k in range(n):
            a=j*(n+1)+k;ff.append((a,a+1,a+n+2,a+n+1))
    obj=Mesh(name,vv,ff,mat,uv)
    if parent:MoveUnder(obj,parent)
    return obj
RevolveY('Cowl_AnnularRing',[(2.63,.674),(2.65,.704),(2.74,.725),(3.18,.725),(3.28,.702),(3.31,.66),(3.28,.626),(3.22,.617),(2.73,.637),(2.63,.674)])
RevolveY('Engine_AdapterPanels',[(2.25,.608),(2.38,.626),(2.67,.657)],'Skin')
RevolveY('Engine_Crankcase',[(2.69,.28),(2.87,.29),(3.02,.20),(3.10,.14)],'Steel',64)
for i in range(9):
    a=2*pi*i/9;radial=Vector((sin(a),0,cos(a)));base=Vector((0,engineY,engineZ))
    Tube('Engine_Cylinder'+str(i),base+radial*.24,base+radial*.57,.092,'Steel',24)
    for k in range(12):
        r=.31+k*.020;Tube('CylinderCoolingFin'+str(i)+'_'+str(k),base+radial*(r-.004),base+radial*(r+.004),.110-(k/12)*.006,'Steel',24)
    head=base+radial*.60;cover=Ellipsoid('RockerCover'+str(i),head,(.10,.095,.065),'Cowl',24,12)
    cover.rotation_mode='QUATERNION';cover.rotation_quaternion=radial.to_track_quat('Z','Y')
    for delta in [-.045,.045]:
        start=base+radial*.18+Vector((delta,.12,0));end=base+radial*.55+Vector((delta,.07,0));Tube('Pushrod'+str(i)+str(delta),start,end,.010,'Bright',10)
    Curve('IgnitionLead'+str(i),[tuple(base+radial*.20+Vector((0,.17,0))),tuple(base+radial*.38+Vector((.03,.15,0))),tuple(base+radial*.57+Vector((.02,.10,0)))],.005,'Dark')
    ang=2*pi*i/9+.14
    Tube('EngineMountBolt'+str(i),(sin(ang)*.22,3.035,engineZ+cos(ang)*.22),(sin(ang)*.22,3.055,engineZ+cos(ang)*.22),.013,'Bright',6)

prop=Pivot('Pivot_Propeller',(0,3.45,engineZ),'Y',[0,360])
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

# Divided undercarriage: two separately driven wheel hubs and compliant tires.
for side,label in [(-1,'Left'),(1,'Right')]:
    wc=(side*1.125,1.23,.43);pivot=Pivot('Pivot_Wheel'+label,wc,'X',[0,360]);pivot['rollingRadiusM']=.43
    for name,start in [('Main',(side*.54,1.40,1.58)),('Aft',(side*.48,.13,1.49)),('Drag',(side*.38,1.98,1.67))]:
        Tube('LandingGear_'+name+label,start,(side*1.095,1.23,.43),.035 if name=='Main' else .025,'Steel',16)
    # Axial lathe around X; the central dished hubs never rotate about Z.
    profile=[(-.13,.22),(-.145,.30),(-.11,.39),(-.055,.43),(.055,.43),(.11,.39),(.145,.30),(.13,.22)]
    vv=[];ff=[];uv=[]
    for j,(x,r) in enumerate(profile):
        for k in range(65):
            a=2*pi*k/64;vv.append((wc[0]+x,wc[1]+r*sin(a),wc[2]+r*cos(a)));uv.append((k/64,j/(len(profile)-1)))
    for j in range(len(profile)-1):
        for k in range(64):
            a=j*65+k;ff.append((a,a+65,a+66,a+1))
    tire=Mesh('Tire_'+label,vv,ff,'Tire',uv);MoveUnder(tire,pivot)
    for s in [-1,1]:
        Tube('WheelRim_'+label+str(s),(wc[0]+s*.11,wc[1],wc[2]),(wc[0]+s*.125,wc[1],wc[2]),.24,'Skin',48,pivot)
        Tube('WheelHub_'+label+str(s),(wc[0]+s*.12,wc[1],wc[2]),(wc[0]+s*.16,wc[1],wc[2]),.095,'Steel',32,pivot)
        for k in range(8):
            a=2*pi*k/8;cy=wc[1]+.16*sin(a);cz=wc[2]+.16*cos(a)
            Tube('HubBolt_'+label+str(s)+str(k),(wc[0]+s*.125,cy,cz),(wc[0]+s*.137,cy,cz),.012,'Steel',6,pivot)
    # Circular tire molding lines; fine localized weathering comes from the PBR pass.
    for s in [-1,1]:
        Curve('TireMoldLine_'+label+str(s),[(wc[0]+s*.134,wc[1]+.325*sin(2*pi*k/80),wc[2]+.325*cos(2*pi*k/80)) for k in range(80)],.0025,'Tire',True,pivot)
Curve('TailSkid',[(0,-3.98,1.51),(0,-4.27,1.03),(0,-4.54,.78),(0,-4.66,.77)],.028,'Steel')

# Photo-resolved windscreen shapes, hinged observer ring and forward gun troughs.
for idx,(cy,rx,ry) in enumerate(cockpits):
    y=cy+ry*.78;z=Interp(sections,y,3)+Interp(sections,y,2)*.95
    vv=[(-.29,y,z),(-.23,y+.08,z+.25),(0,y+.15,z+.32),(.23,y+.08,z+.25),(.29,y,z)]
    screen=Mesh('Windscreen'+str(idx+1),vv,[(0,1,2,3,4)],glass,smooth=False)
    Curve('WindscreenFrame'+str(idx+1),vv,.008,'Steel')
    if idx==0:
        panel=Box('PilotInstrumentPanel',(0,cy+.38,2.10),(.53,.03,.28),'Dark')
        for n,(x,z,r) in enumerate([(-.16,2.14,.052),(0,2.14,.063),(.16,2.14,.052),(-.10,2.01,.036),(.08,2.01,.036)]):
            Tube('InstrumentBezel'+str(n),(x,cy+.35,z),(x,cy+.33,z),r,'Bright',32)
            Tube('InstrumentDial'+str(n),(x,cy+.327,z),(x,cy+.323,z),r*.87,'Dial',32)
            Curve('InstrumentNeedle'+str(n),[(x,cy+.32,z),(x+r*.5,cy+.32,z+r*.2)],.0015,'Bright')
    else:
        ring=[(.37*sin(2*pi*k/96),cy+.47*cos(2*pi*k/96),2.27) for k in range(96)]
        Curve('ObserverGunRing',ring,.014,'Steel',True)
        for s in [-1,1]:
            Tube('ObserverGunSupport'+str(s),(s*.26,cy-.15,2.27),(s*.095,cy-.44,2.43),.014,'Steel')
            Tube('ObserverTwinGun'+str(s),(s*.045,cy-.28,2.43),(s*.045,cy-1.03,2.58),.018,'Steel',16)
            Box('ObserverGunReceiver'+str(s),(s*.045,cy-.34,2.44),(.055,.23,.065),'Steel')
for side in [-1,1]:
    for n in range(5):
        y=2.35+n*.043
        Curve('CowlCoolingSlot'+str(side)+str(n),[(side*.58,y,2.19),(side*.61,y,2.06)],.013,'Dark')
    Curve('ExhaustCollector'+str(side),[(side*.61,2.68,1.74),(side*.68,2.42,1.60),(side*.69,1.78,1.40),(side*.70,1.21,1.36)],.053,'Exhaust')
    Tube('ExhaustOutlet'+str(side),(side*.70,1.24,1.36),(side*.70,1.13,1.35),.056,'Dark',24)
    for cy in [2.08,2.43]:
        pts=[BodyPoint(cy,2*pi*k/100,.003) for k in range(100)];Curve('EnginePanelSeam'+str(side)+str(cy),pts,.0014,'Steel',True)
    # Small external light bomb racks; no invented bomb load on this parked reference.
    for n in range(3):
        x=side*(.9+n*.32);anchor=WingPoint(x,.62,'Lower',False);y=anchor[1];z=anchor[2]-.04
        Box('LightBombRack'+str(side)+str(n),(x,y,z),(.075,.32,.037),'Steel',.006)
        for d in [-.10,.10]:Tube('RackHook'+str(side)+str(n)+str(d),(x,y+d,z-.02),(x,y+d,z-.09),.008,'Steel',10)

def PbrTextures(mat, name):
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=nodes.get('Principled BSDF')
    images={}
    for channel in ['Base','Normal','Orm']:
        path=sourceRoot/'Textures'/('Texture_Ki4'+name+channel+'.png')
        assert path.exists(), 'Run Script_NakajimaKi4Textures.py before the PBR build'
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
    mat['pbrSource']='Script_NakajimaKi4Textures.py: '+name
    mat['packing']='Base=sRGB, tangent Normal=OpenGL linear, ORM=AO/Roughness/Metallic linear'

if stage=='pbr':
    bodyMat=mats['Skin'].copy();bodyMat.name='Material_FuselageAluminum';body.data.materials.clear();body.data.materials.append(bodyMat)
    PbrTextures(bodyMat,'Fuselage')
    for mat,name in [(mats['Skin'],'Aluminum'),(mats['Bright'],'Aluminum'),(mats['Fabric'],'Linen'),(mats['Cowl'],'Cowl'),(mats['Steel'],'Steel'),(mats['Wire'],'Steel'),(mats['Tire'],'Rubber'),(mats['Exhaust'],'Exhaust'),(mats['Leather'],'Leather')]:PbrTextures(mat,name)
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
for sourceScript in [scriptPath,scriptPath.with_name('Script_NakajimaKi4Textures.py'),scriptPath.with_name('Script_NakajimaKi4Audit.py')]:
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
    bpy.ops.export_scene.gltf(filepath=str(assetRoot/filename),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_animations=False,export_yup=True)

def DeriveGame():
    records=[]
    for obj in list(root.children_recursive):
        if obj.type!='MESH':continue
        bpy.context.view_layer.objects.active=obj
        for mod in list(obj.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
        original=obj.data;original.calc_loop_triangles()
        before=len(original.loop_triangles)
        if before<1200 or not obj.name.startswith(('Fuselage','UpperWing','LowerWing','Aileron','Tailplane','Elevator','VerticalFin','Rudder')):continue
        sourceTree=BVHTree.FromPolygons([v.co for v in original.vertices],[list(p.vertices) for p in original.polygons])
        selected=None
        for ratio in [.35,.5,.7,.85]:
            mod=obj.modifiers.new('GameSurfaceReduction','DECIMATE');mod.ratio=ratio;mod.use_collapse_triangulate=True
            dg=bpy.context.evaluated_depsgraph_get();evaluated=obj.evaluated_get(dg);candidate=bpy.data.meshes.new_from_object(evaluated)
            obj.modifiers.remove(mod)
            candidateTree=BVHTree.FromPolygons([v.co for v in candidate.vertices],[list(p.vertices) for p in candidate.polygons])
            error=max([sourceTree.find_nearest(v.co)[3] or 0 for v in candidate.vertices]+[candidateTree.find_nearest(v.co)[3] or 0 for v in original.vertices])
            # 2mm maximum sampled bidirectional surface deviation, never an unconditional budget collapse.
            if error<=.002:
                selected=candidate;records.append({'name':obj.name,'before':before,'after':sum(len(p.vertices)-2 for p in candidate.polygons),'ratio':ratio,'maxVertexSurfaceErrorM':error});break
            bpy.data.meshes.remove(candidate)
        if selected:obj.data=selected
        else:records.append({'name':obj.name,'before':before,'after':before,'ratio':1,'maxVertexSurfaceErrorM':0})
    # Merge only siblings sharing a material. Every moving part stays under its true hinge.
    groups={}
    for obj in list(root.children_recursive):
        if obj.type=='MESH' and len(obj.data.materials)==1:groups.setdefault((obj.parent.name,obj.data.materials[0].name),[]).append(obj)
    for (parentName,matName),objects in groups.items():
        if len(objects)<2:continue
        sourceNames=[o.name for o in objects];bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
        combined=bpy.context.object;combined.name='Mesh_'+parentName.removeprefix('Pivot_')+'_'+matName.removeprefix('Material_')
        combined['sourceParts']=sourceNames
    (evidenceRoot/'Data_GameDerivation.json').write_text(json.dumps(records,indent=2),encoding='utf8')

if stage=='gray':Export('Model_NakajimaKi4Gray.glb')
else:
    exportRoot=sourceRoot/'Exports';exportRoot.mkdir(exist_ok=True)
    Export(exportRoot/'Model_NakajimaKi4High.glb')
    DeriveGame();Export('Model_NakajimaKi4.glb')
stats={'stage':stage,'objects':len(root.children_recursive),'meshes':sum(o.type=='MESH' for o in root.children_recursive),'exportSceneTriangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in root.children_recursive if o.type=='MESH'),'pivots':[o.name for o in root.children_recursive if o.name.startswith('Pivot_')],'source':str(sourceRoot/'Scene_NakajimaKi4.blend')}
(evidenceRoot/'Data_BuildStats.json').write_text(json.dumps(stats,indent=2),encoding='utf8');print(json.dumps(stats))
