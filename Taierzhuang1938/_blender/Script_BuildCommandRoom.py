"""Rebuild the reference-matched command-room menu scene through Blender MCP.
Run with Script_BlenderMcp exec --file; COMMAND_ROOM_ROOT may override checkout.
Source .blend and Imagegen sources remain outside the repository.
"""
import bpy, math, random, json, os, shutil
from pathlib import Path
from mathutils import Vector, Matrix
ROOT = Path(os.environ.get("COMMAND_ROOM_ROOT", r"C:\Users\Bentl\Documents\bentleyblanks_Codex_CommandRoomMenu_20261004"))
GAME = ROOT / "Taierzhuang1938"
SOURCE = Path(r"C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\CommandRoom")
SOURCE.mkdir(parents=True, exist_ok=True)
if bpy.data.filepath and Path(bpy.data.filepath).resolve() != (SOURCE/"Scene_CommandRoom.blend").resolve():
    raise RuntimeError("Open this task's CommandRoom blend before rebuilding; refusing to replace another scene")
TEXTURES=SOURCE/"Textures"
TEXTURES.mkdir(exist_ok=True)
for path in (GAME/"Texture").glob("Texture_CommandRoom*.webp"):
    shutil.copy2(path,TEXTURES/path.name)
SHOTS = GAME / "_shots" / "CommandRoom"
SHOTS.mkdir(parents=True, exist_ok=True)
random.seed(1938)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for data in list(bpy.data.materials): bpy.data.materials.remove(data)
for data in list(bpy.data.meshes):
    if not data.users: bpy.data.meshes.remove(data)
for data in list(bpy.data.images):
    if not data.users and data.type!='RENDER_RESULT':bpy.data.images.remove(data)
    elif data.source=="FILE": data.reload()
scene=bpy.context.scene
scene.unit_settings.system="METRIC"
materials={}
def Material(name, color=(.4,.36,.3), rough=.9, texture=None, paper=False):
    mat=bpy.data.materials.new(name); mat.diffuse_color=(*color,1); mat.use_nodes=True
    p=mat.node_tree.nodes.get("Principled BSDF"); p.inputs["Base Color"].default_value=(*color,1)
    p.inputs["Roughness"].default_value=rough; p.inputs["Specular IOR Level"].default_value=.22
    if texture:
        suffix="Image" if paper else "Base"
        path=TEXTURES/("Texture_"+texture+suffix+".webp")
        if path.exists():
            t=mat.node_tree.nodes.new("ShaderNodeTexImage"); t.image=bpy.data.images.load(str(path),check_existing=True)
            mat.node_tree.links.new(t.outputs["Color"],p.inputs["Base Color"])
        if not paper:
            np=TEXTURES/("Texture_"+texture+"Normal.webp")
            if np.exists():
                n=mat.node_tree.nodes.new("ShaderNodeTexImage"); n.image=bpy.data.images.load(str(np),check_existing=True); n.image.colorspace_settings.name="Non-Color"
                normal=mat.node_tree.nodes.new("ShaderNodeNormalMap"); normal.inputs["Strength"].default_value=.18 if texture=="CommandRoomCloth" else .5
                mat.node_tree.links.new(n.outputs["Color"],normal.inputs["Color"]); mat.node_tree.links.new(normal.outputs["Normal"],p.inputs["Normal"])
            op=TEXTURES/("Texture_"+texture+"Orm.webp")
            if op.exists():
                n=mat.node_tree.nodes.new("ShaderNodeTexImage"); n.image=bpy.data.images.load(str(op),check_existing=True); n.image.colorspace_settings.name="Non-Color"
                separate=mat.node_tree.nodes.new("ShaderNodeSeparateColor")
                mat.node_tree.links.new(n.outputs["Color"],separate.inputs["Color"]); mat.node_tree.links.new(separate.outputs["Green"],p.inputs["Roughness"])
    materials[name]=mat
    return mat
wood=Material("CommandRoomWood",(.19,.155,.12),.9,"CommandRoomWood")
plaster=Material("CommandRoomPlaster",(.36,.34,.3),.94,"CommandRoomPlaster")
cloth=Material("CommandRoomCloth",(.17,.16,.14),.97,"CommandRoomCloth")
mapmat=Material("CommandRoomMap",(.58,.51,.4),.95,"CommandRoomMap",True)
letter=Material("CommandRoomLetter",(.64,.61,.51),.97,"CommandRoomLetter",True)
iron=Material("CommandRoomIron",(.08,.075,.063),.83)
brick=Material("CommandRoomBrick",(.21,.20,.18),.96)
dust=Material("CommandRoomDust",(.42,.39,.33),.99)
graphite=Material("CommandRoomGraphite",(.023,.022,.02),.77)
pencilWood=Material("CommandRoomPencilWood",(.35,.24,.14),.9)
paperEdge=Material("CommandRoomPaperEdge",(.47,.42,.33),.96)
def Mesh(name, verts, faces, mat, uvs=None, smooth=False):
    if name in {"CoatBody", "CoatSleeve"}: faces=[tuple(reversed(face)) for face in faces]
    data=bpy.data.meshes.new(name); data.from_pydata(verts,[],faces); data.update()
    ob=bpy.data.objects.new(name,data); scene.collection.objects.link(ob); ob.data.materials.append(mat)
    if uvs:
        layer=data.uv_layers.new(name="UVMap")
        for poly in data.polygons:
            for li in poly.loop_indices: layer.data[li].uv=uvs[data.loops[li].vertex_index]
    for p in data.polygons:p.use_smooth=smooth
    return ob
def Cube(name, loc, size, mat=wood, bevel=.008):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); ob=bpy.context.object; ob.name=name; ob.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); ob.data.materials.append(mat)
    # Physical projection: one tile covers 1.4 m wood / 1.8 m plaster.
    tile=1.8 if mat==plaster else 1.4
    uv=ob.data.uv_layers.active
    for p in ob.data.polygons:
        axis=max(range(3),key=lambda i:abs(p.normal[i]))
        for li in p.loop_indices:
            co=ob.data.vertices[ob.data.loops[li].vertex_index].co
            a,b=((0,1) if axis==2 else (0,2) if axis==1 else (1,2))
            if mat==wood and name.startswith(("TablePlank","TableLongApron","ChairCrest","WindowHeadSill","CabinetTop")):
                a,b=((1,0) if axis==2 else (2,0) if axis==1 else (1,2))
            uv.data[li].uv=(co[a]/tile+loc[a]*.31,co[b]/tile+loc[b]*.17)
    if bevel:
        m=ob.modifiers.new("Worn edges","BEVEL"); m.width=bevel;m.segments=3
        bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=m.name)
        if name.startswith("TablePlank"):
            for v in ob.data.vertices:
                edge=max(abs(v.co.x)/(size[0]*.5),abs(v.co.y)/(size[1]*.5))
                v.co.z+=max(0,edge-.92)*.025*math.sin(v.co.x*47+v.co.y*113)
            ob.data.update()
        m=ob.modifiers.new("Surface normals","WEIGHTED_NORMAL");m.keep_sharp=True
        bpy.ops.object.modifier_apply(modifier=m.name)
    return ob
def Rod(name,a,b,r,mat=iron,vertices=10):
    a,b=Vector(a),Vector(b);d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=d.length,location=(a+b)*.5)
    ob=bpy.context.object;ob.name=name;ob.rotation_euler=d.to_track_quat("Z","Y").to_euler();ob.data.materials.append(mat)
    return ob
def Curve(name,pts,r,mat):
    data=bpy.data.curves.new(name,"CURVE");data.dimensions="3D";data.resolution_u=1;data.bevel_depth=r;data.bevel_resolution=2
    sp=data.splines.new("POLY");sp.points.add(len(pts)-1)
    for p,co in zip(sp.points,pts):p.co=(*co,1)
    ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.data.materials.append(mat)
    bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.convert(target="MESH");ob.select_set(False)
    return ob
# Solid enclosure with a true window opening. Camera is inside southern half.
Cube("Floor",(0,0,-.09),(7,7,.18),plaster,.01)
wy=1.55
Cube("WallBelowWindow",(-1.58,wy,.75),(2.84,.24,1.50),plaster,0)
Cube("WallAboveWindow",(-1.58,wy,3.40),(2.84,.24,.55),plaster,0)
Cube("WallLeft",(-2.435,wy,2.315),(1.13,.24,1.63),plaster,0)
Cube("WallWindowPier",(-.665,wy,2.315),(1.01,.24,1.63),plaster,0)
Cube("WallMap",(3.145,wy,1.75),(6.61,.24,3.5),plaster,0)
Cube("SideWall",(-3.1,-.6,1.7),(.25,4.7,3.5),plaster,.004)
# Window: dark timber, recessed sill, tall narrow panes.
wx=-1.52; left=-1.87;right=-1.17;bottom=1.50;top=3.13
for x in [left,right]:Cube("WindowJamb",(x,wy-.14,(bottom+top)/2),(.10,.34,top-bottom+.1),wood,.009)
for z in [bottom,top]:Cube("WindowHeadSill",(wx,wy-.17,z),(.82,.38,.10),wood,.009)
for x in [-1.65,-1.40]:Cube("WindowMullion",(x,wy-.08,(bottom+top)/2),(.026,.12,top-bottom),wood,.004)
for z in [1.79,2.08,2.37,2.66,2.95]:Cube("WindowCrossbar",(wx,wy-.08,z),(.68,.12,.032),wood,.004)
# Pale outdoor wall / distant leafless branches; no second interior light.
outside=Material("CommandRoomOutside",(.62,.64,.63),1)
outside.node_tree.nodes.get("Principled BSDF").inputs["Emission Color"].default_value=(.40,.47,.50,1)
outside.node_tree.nodes.get("Principled BSDF").inputs["Emission Strength"].default_value=.75
Cube("DistantCourtyard",(0,4.2,1.8),(8,.18,4),outside,.0)
def Branch(a,d,length,r,depth):
    a=Vector(a);d=Vector(d).normalized(); b=a+d*length
    Curve("BareBranch",[a,a+d*length*.43+Vector((.025,0,0)),b],r,iron)
    if depth:
        for side in [-1,1]:
            Branch(b,(d.x+side*random.uniform(.30,.65),d.y+random.uniform(-.10,.10),d.z),length*random.uniform(.58,.75),r*.62,depth-1)
for x in [-2.35,-.55]: Branch((x,3.8,.6),(random.uniform(-.1,.1),0,1),.72,.017,4)
# Weathered wall repairs, exposed brick patches, subtly irregular edges.
for cx,cz,sx,sz in [(-.52,2.72,.55,.6),(.55,1.10,.7,.44),(2.5,.70,.65,.55),(-2.6,.55,.58,.8)]:
    n=17;vs=[(cx,wy-.135,cz)]
    for i in range(n):
        a=i*math.tau/n;r=random.uniform(.83,1)
        vs.append((cx+math.cos(a)*sx*.5*r,wy-.135,cz+math.sin(a)*sz*.5*r))
    Mesh("ExposedMortar",vs,[(0,i+1,(i+1)%n+1) for i in range(n)],plaster,[(x/1.8,z/1.8) for x,y,z in vs])
    for row in range(int(sz/.115)):
        for col in range(3):
            bx=cx+(col-1)*.18+(row%2)*.05;bz=cz+(row-(sz/.115-1)/2)*.11
            if ((bx-cx)/(sx*.47))**2+((bz-cz)/(sz*.47))**2<.78:
                Cube("OldBrick",(bx,wy-.140,bz),(.168+random.uniform(-.012,.008),.013,.087),brick,.003)
for i in range(16):
    x=random.uniform(-2.9,3);z=random.uniform(.4,3.2)
    if -2.3<x<-.7 and z>1.15:continue
    pts=[(x+math.sin(j*1.7+i)*.015,wy-.124,z-j*.055) for j in range(random.randint(3,9))]
    Curve("PlasterHairline",pts,.0008,brick)
# Four-board command table: genuine thickness, apron rails and joinery.
tx=.250;ty=.462;tz=.84;tw=3.10;td=2.30
for i in range(5):
    Cube("TablePlank",(tx,ty+(i-2)*td/5,tz),(tw,td/5-.006,.09),wood,.012)
for x in [tx-tw/2+.12,tx+tw/2-.12]:
    for y in [ty-td/2+.13,ty+td/2-.13]:
        Cube("TableLeg",(x,y,.405),(.13,.13,.81),wood,.012)
for y in [ty-td/2+.12,ty+td/2-.12]:Cube("TableLongApron",(tx,y,.697),(tw-.17,.075,.2),wood,.007)
for x in [tx-tw/2+.15,tx+tw/2-.15]:Cube("TableShortApron",(x,ty,.697),(.08,td-.24,.2),wood,.008)
# Table scars as fine physical wood lines; light dust and small rubble at rear edges.
for i in range(40):
    x=random.uniform(tx-tw/2+.03,tx+tw/2-.03); y=random.choice([ty-td/2+.04,ty+td/2-.04])+random.uniform(-.026,.026)
    Curve("TableScratch",[(x,y,.887),(x+random.uniform(.02,.08),y+.001,.887)],.00055,dust)
for i in range(110):
    x=random.uniform(tx-tw/2+.04,tx+tw/2-.04); y=ty+random.choice([-td/2+.04,td/2-.07])+random.uniform(-.025,.04)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=random.uniform(.002,.009),location=(x,y,.891))
    o=bpy.context.object;o.name="DryMortarGrain";o.scale.z=.35;o.data.materials.append(dust)
# Chair behind desk, deliberately empty.
cx=.02;cy=.84
Cube("ChairSeat",(cx,cy,.48),(.51,.47,.055),wood,.018)
for x in [cx-.34,cx+.34]:
    Cube("ChairBackPost",(x,cy+.19,.73),(.046,.055,1.35),wood,.009)
    Cube("ChairFrontLeg",(x,cy-.18,.23),(.05,.05,.46),wood,.007)
Cube("ChairCrest",(cx,cy+.19,1.34),(.75,.063,.13),wood,.016)
Cube("ChairBackSlat",(cx,cy+.19,.91),(.055,.036,.55),wood,.008)
for x in [cx-.225,cx+.225]:Cube("ChairSideRung",(x,cy,.23),(.028,.43,.03),wood,.006)
# Low timber cabinet left of chair.
cabx=-1.33;caby=1.03
Cube("CabinetBody",(cabx,caby,.67),(.94,.54,1.31),wood,.009)
Cube("CabinetTop",(cabx,caby,1.365),(1.04,.62,.06),wood,.011)
for z in [1.13,.83,.53,.23]:
    Cube("CabinetPanel",(cabx,caby-.284,z),(.80,.023,.265),wood,.006)
    for x in [cabx-.32,cabx+.32]:Cube("CabinetFrame",(x,caby-.304,z),(.032,.03,.265),wood,.004)
    Rod("IronPull",(cabx-.07,caby-.334,z+.06),(cabx+.07,caby-.334,z+.06),.011,iron)
# Paper meshes preserve the approved artwork and readable handwriting.
def Paper(name,cx,cy,z,w,h,mat,angle=0,wall=False):
    nx=32;ny=24;vs=[];uvs=[]
    for j in range(ny+1):
        v=j/ny
        for i in range(nx+1):
            u=i/nx;px=(u-.5)*w;py=(v-.5)*h
            edge=(max(0,abs(u-.5)-.43)/.07)**2*.008+(max(0,abs(v-.5)-.43)/.07)**2*.007
            cr=.0018*math.sin(u*math.pi*4)+.002*math.cos(v*math.pi*6)+edge
            x=px*math.cos(angle)-py*math.sin(angle);y=px*math.sin(angle)+py*math.cos(angle)
            vs.append((cx+x,cy-cr,z+py) if wall else (cx+x,cy+y,z+cr))
            uvs.append((u,v))
    fs=[]
    for j in range(ny):
        for i in range(nx):
            a=j*(nx+1)+i;fs.append((a,a+1,a+nx+2,a+nx+1))
    ob=Mesh(name,vs,fs,mat,uvs,True)
    m=ob.modifiers.new("Paper thickness","SOLIDIFY");m.thickness=.0007
    bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.modifier_apply(modifier=m.name);ob.select_set(False)
    return ob
Paper("WallMap",1.26,1.385,1.82,2.18,1.45,mapmat,wall=True)
Paper("DeskMap",tx,ty-.10,.894,2.80,2.00,mapmat,math.radians(40)-.035)
Paper("Telegram",-.142,-.629,.920,.65,.85,letter,-.26)
# Visible ordinary wood pencils with graphite tips; no envelopes / books.
for i in range(2):
    a=Vector((.09+i*.065,.025+i*.038,.925));b=a+Vector((.27,-.14,0))
    Rod("PencilShaft",a,b,.0036,pencilWood,6)
    d=(b-a).normalized()
    bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=.0037,radius2=.0010,depth=.026,location=b+d*.013)
    o=bpy.context.object;o.name="PencilSharpening";o.rotation_euler=d.to_track_quat("Z","Y").to_euler();o.data.materials.append(pencilWood)
    Rod("PencilLead",b+d*.024,b+d*.03,.001,graphite,8)
ruler=Cube("WoodRuler",(.48,-.37,.925),(.58,.045,.009),pencilWood,.001);ruler.rotation_euler.z=-.70
for i in range(51):
    local=Vector((-.28+i*.0112,.010,.005));ang=-.70
    p=Vector((.48+local.x*math.cos(ang)-local.y*math.sin(ang),-.37+local.x*math.sin(ang)+local.y*math.cos(ang),.931))
    q=p+Vector((math.sin(ang),-math.cos(ang),0))*(.013 if i%5==0 else .006)
    Rod("RulerTick",p,q,.00035,graphite,4)
# Soft cap: shaped crown, raised seam, band, short stitched brim, two buttons.
hx=.942;hy=-.092;hz=.907
n=72;rings=18;vs=[];uvs=[]
def CapRing(t,a):
    rad=1+.05*math.sin(t*math.pi)-.12*t
    ripple=1+.028*math.sin(a*7+t*7)+.012*math.sin(a*13-t*4)
    return Vector((hx+.168*rad*math.cos(a)*ripple,hy+.146*rad*math.sin(a)*ripple,hz+.065+.088*t+.006*math.sin(a*5)*rad))
for j in range(rings+1):
    t=j/rings;rad=math.sin((1-t)*math.pi*.5)
    for i in range(n+1):
        a=i/n*math.tau
        rad=1+.05*math.sin(t*math.pi)-.12*t
        ripple=1+.018*math.sin(a*7+t*7)+.010*math.sin(a*13-t*4)
        vs.append(tuple(CapRing(t,a)))
        uvs.append((i/n*1.1,t*.45))
fs=[]
for j in range(rings):
    for i in range(n):
        a=j*(n+1)+i;fs.append((a,a+1,a+n+2,a+n+1))
Mesh("CapCrown",vs,fs,cloth,uvs,True)
vs=[];uvs=[]
for j in range(13):
    r=j/12
    for i in range(n+1):
        a=i/n*math.tau
        p=Vector((hx,hy,hz+.159)).lerp(CapRing(1,a),r)
        p.z+=.006*math.sin(r*math.pi)*math.sin(a*3+.4)
        vs.append(tuple(p))
        uvs.append((.5+r*math.cos(a)*.2,.5+r*math.sin(a)*.2))
Mesh("CapTop",vs,[(j*(n+1)+i,(j+1)*(n+1)+i,(j+1)*(n+1)+i+1,j*(n+1)+i+1) for j in range(12) for i in range(n)],cloth,uvs,True)
vs=[];uvs=[]
for j in range(4):
    for i in range(n+1):
        a=i/n*math.tau
        p=Vector((hx+.164*math.cos(a),hy+.143*math.sin(a),hz)).lerp(CapRing(0,a),j/3)
        vs.append(tuple(p))
        uvs.append((i/n*.8,j*.023))
Mesh("CapBand",vs,[(j*(n+1)+i,j*(n+1)+i+1,(j+1)*(n+1)+i+1,(j+1)*(n+1)+i) for j in range(3) for i in range(n)],cloth,uvs,True)
for j in [0,1,3]:
    Curve("CapStitch",[(hx+.168*math.cos(i/n*math.tau),hy+.147*math.sin(i/n*math.tau),hz+.008+j*.017) for i in range(n+1)],.00045,cloth)
vs=[];uvs=[]
for j in range(6):
    t=j/5
    for i in range(31):
        a=math.pi*1.13+i/30*math.pi*.74;r=.15+.082*t*math.sin(i/30*math.pi)**.6
        vs.append((hx+r*math.cos(a),hy+r*.96*math.sin(a),hz+.007-.012*t+.011*math.cos(a*2)))
        uvs.append((i/30*.35,t*.15))
Mesh("CapVisor",vs,[(j*31+i,(j+1)*31+i,(j+1)*31+i+1,j*31+i+1) for j in range(5) for i in range(30)],cloth,uvs,True)
for z in [.036,.063]:
    Rod("CapButton",(hx-.024,hy-.144,hz+z),(hx-.024,hy-.151,hz+z),.008,iron,24)
# Hanging folded coat, sculpted as draping fabric rather than a flat card.
coatx=-.35;coaty=1.27
Cube("CoatRack",(coatx,1.405,2.72),(.48,.044,.075),wood,.006)
Rod("CoatHook",(coatx,1.4,2.73),(coatx,1.23,2.75),.012,iron)
def Drape(name,xoffset,length,width,depth,phase):
    nx=26;ny=44;vs=[];uvs=[]
    for j in range(ny+1):
        t=j/ny;span=width*(.38+.62*min(1,t*4))
        for i in range(nx+1):
            u=i/nx;fold=math.sin(u*math.pi*4+phase+t*.8)*(.018+.035*t)
            x=coatx+xoffset+(u-.5)*span+.023*math.sin(t*6+phase)
            y=coaty-depth-fold-.09*math.sin(t*2.8)
            z=2.70-t*length+.018*math.sin(u*13)*(t**5)
            vs.append((x,y,z));uvs.append((u*width,t*length))
    fs=[(j*(nx+1)+i,j*(nx+1)+i+1,(j+1)*(nx+1)+i+1,(j+1)*(nx+1)+i) for j in range(ny) for i in range(nx)]
    ob=Mesh(name,vs,fs,cloth,uvs,True)
    mod=ob.modifiers.new("Cloth thickness","SOLIDIFY");mod.thickness=.004
    bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.modifier_apply(modifier=mod.name);ob.select_set(False)
# Tubular tailoring with shoulders, collar opening, sleeves and front buttons.
vs=[];uvs=[];nc=64;nr=40
for j in range(nr+1):
    t=j/nr; width=.065+.12*min(1,t/.14)
    width*=1-.18*math.sin(t*math.pi)
    for i in range(nc+1):
        a=i/nc*math.tau
        fold=(.012+.027*t)*math.sin(a*7+t*2.6)+.010*math.sin(a*13-t*9)
        gather=.013*math.sin(t*32+a*4)*math.sin(math.pi*t)**2
        vs.append((coatx-.11*t+.021*math.sin(t*5)+(width+fold+gather)*math.cos(a+.25*t),1.225+(.082+fold+gather)*math.sin(a)-.029*math.sin(t*7),2.66-t*1.56+.090*math.sin(a*2+.8)*t**3))
        uvs.append((i/nc*.8,t*1.6))
Mesh("CoatBody",vs,[(j*(nc+1)+i,j*(nc+1)+i+1,(j+1)*(nc+1)+i+1,(j+1)*(nc+1)+i) for j in range(nr) for i in range(nc)],cloth,uvs,True)
for side in [-1,1]:
    vs=[];uvs=[];ns=30;nl=28
    for j in range(nl+1):
        t=j/nl;center=Vector((coatx+side*(.15+.050*math.sin(t*math.pi))-.14*t,1.21-.13*t+(0.03 if side>0 else -.04)-.022*math.sin(t*math.pi),2.48-(.84 if side>0 else .99)*t))
        r=.08-.025*t
        for i in range(ns+1):
            a=i/ns*math.tau;rr=r+.009*math.sin(t*23+a*3)+.006*math.sin(a*7+t*5)
            vs.append(tuple(center+Vector((rr*math.cos(a),rr*math.sin(a),.01*math.sin(a)))))
            uvs.append((i/ns*.35,t*.86))
    Mesh("CoatSleeve",vs,[(j*(ns+1)+i,j*(ns+1)+i+1,(j+1)*(ns+1)+i+1,(j+1)*(ns+1)+i) for j in range(nl) for i in range(ns)],cloth,uvs,True)
for z in [2.32,2.12,1.92,1.72,1.52]:
    Rod("CoatButton",(coatx-.025,1.132,z),(coatx-.025,1.124,z),.008,iron,16)
# Camera-facing lapels make the folded coat read as tailoring.
Mesh("CoatLapelLeft",[(-.46,1.13,2.64),(-.31,1.07,2.63),(-.27,1.08,2.22),(-.43,1.13,2.40)],[(0,1,2,3)],cloth,[(0,0),(1,0),(1,1),(0,1)],True)
Mesh("CoatLapelRight",[(-.27,1.08,2.63),(-.12,1.13,2.64),(-.10,1.09,2.38),(-.23,1.05,2.20)],[(0,1,2,3)],cloth,[(0,0),(1,0),(1,1),(0,1)],True)
bpy.context.view_layer.update()
tableTransform=Matrix.Translation((tx,ty,0))@Matrix.Rotation(math.radians(40),4,"Z")@Matrix.Translation((-tx,-ty,0))
backdropTransform=Matrix.Translation((-.85,-2.5,1.9))@Matrix.Scale(1.235,4)@Matrix.Translation((.85,2.5,-1.9))
for ob in list(scene.objects):
    if ob.type=="MESH" and ob.name.startswith("Cap"):
        inverse=ob.matrix_world.inverted()
        for v in ob.data.vertices:
            p=ob.matrix_world@v.co
            v.co=inverse@(Vector((hx,hy,hz))+(Matrix.Rotation(math.radians(-35),3,"Z")@(p-Vector((hx,hy,hz))))*1.45)
    if ob.name.startswith(("Table","DryMortar")):
        ob.matrix_world=tableTransform@ob.matrix_world
    elif ob.type=="MESH" and not ob.name.startswith(("DeskMap","Telegram","Pencil","Ruler","WoodRuler","Cap","Floor","SideWall")):
        ob.matrix_world=backdropTransform@ob.matrix_world
    if ob.type=="MESH" and len(ob.data.materials) and ob.data.materials[0]==cloth:
        for uv in ob.data.uv_layers:
            for corner in uv.data: corner.uv*=6
# Lighting: single sun through actual left aperture, soft indirect fill.
world=bpy.data.worlds.new("CommandRoomAmbient");scene.world=world;world.use_nodes=True
world.node_tree.nodes["Background"].inputs["Color"].default_value=(.48,.52,.57,1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value=.55
bpy.ops.object.light_add(type="AREA",location=(-1.5,1.86,2.6))
light=bpy.context.object;light.name="WindowSky";light.location=backdropTransform@light.location;light.data.energy=150;light.data.shape="RECTANGLE";light.data.size=1.54;light.data.size_y=1.85
light.rotation_euler=(Vector((.3,-.7,.8))-light.location).to_track_quat("-Z","Y").to_euler()
bpy.ops.object.light_add(type="SUN",location=(-3,5,5))
sun=bpy.context.object;sun.name="LeftWindowSun";sun.data.energy=2.8;sun.data.angle=.05
sun.rotation_euler=Vector((.80,-1.6,-1.25)).to_track_quat("-Z","Y").to_euler()
# Camera is a real glTF camera; reference matching is evaluated from render.
bpy.ops.object.camera_add(location=(-.85,-2.50,1.90))
cam=bpy.context.object;cam.name="CommandRoomCamera"
cam.rotation_euler=(Vector((-.40,.50,1.20))-cam.location).to_track_quat("-Z","Y").to_euler()
cam.data.lens=29;cam.data.sensor_width=36;cam.data.clip_start=.05;cam.data.clip_end=80
scene.camera=cam
scene.render.engine="CYCLES";scene.cycles.samples=64;scene.cycles.use_denoising=True
scene.cycles.device='CPU'
scene.render.resolution_x=1672;scene.render.resolution_y=941;scene.render.resolution_percentage=100
scene.view_settings.view_transform="AgX";scene.view_settings.look="AgX - Medium High Contrast";scene.view_settings.exposure=.35
# Merge static meshes by material to keep realtime draw count proportional to materials.
bpy.ops.object.select_all(action="DESELECT")
for mat in materials.values():
    obs=[o for o in scene.objects if o.type=="MESH" and len(o.data.materials)==1 and o.data.materials[0]==mat]
    if not obs:continue
    for o in obs:o.select_set(True)
    bpy.context.view_layer.objects.active=obs[0]
    if len(obs)>1: bpy.ops.object.join()
    bpy.context.object.name="Room_"+mat.name
    bpy.ops.object.select_all(action="DESELECT")
scene["commandRoomReference"]="0471bcd3/image-3.png; handwritten letter image-1; wall map image-2"
scene["coordinateSystem"]="Author Blender Z-up, camera faces +Y; glTF export Y-up"
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/"Scene_CommandRoom.blend"))
# GLB keeps geometry/material identifiers, external WebP textures are loaded by runtime.
links=[]
for mat in materials.values():
    for link in list(mat.node_tree.links):
        if link.to_node.type=="BSDF_PRINCIPLED":
            links.append((mat,link.from_socket,link.to_socket));mat.node_tree.links.remove(link)
bpy.ops.object.select_all(action="DESELECT")
for ob in scene.objects:
    if ob.type in {"MESH","CAMERA"}:ob.select_set(True)
(GAME/"Model").mkdir(exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(GAME/"Model"/"Model_CommandRoom.glb"),export_format="GLB",use_selection=True,export_cameras=True,export_lights=False,export_animations=False,export_extras=True)
for mat,a,b in links:mat.node_tree.links.new(a,b)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/"Scene_CommandRoom.blend"))
scene.render.filepath=str(SHOTS/"Scene_CommandRoomBlender.png")
bpy.ops.render.render(write_still=True)
summary={"blend":str(SOURCE/"Scene_CommandRoom.blend"),"glb":str(GAME/"Model"/"Model_CommandRoom.glb"),"meshes":len([o for o in scene.objects if o.type=="MESH"]),"triangles":sum(len(p.vertices)-2 for o in scene.objects if o.type=="MESH" for p in o.data.polygons),"camera":{"position":list(cam.location),"rotation":list(cam.rotation_euler),"lens":cam.data.lens},"materials":list(materials),"render":scene.render.filepath}
(SHOTS/"Data_CommandRoomBuild.json").write_text(json.dumps(summary,indent=2),encoding="utf-8")
print(json.dumps(summary))
