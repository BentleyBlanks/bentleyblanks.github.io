"""Rebuild the reference-matched command-room menu scene through Blender MCP.
Run with Script_BlenderMcp exec --file; COMMAND_ROOM_ROOT may override checkout.
Source .blend and Imagegen sources remain outside the repository.
"""
import bpy, math, random, json, os, shutil
from pathlib import Path
from mathutils import Vector, Matrix
ROOT = Path(os.environ.get("COMMAND_ROOM_ROOT", r"C:\Users\Bentl\Documents\bentleyblanks_Codex_CommandRoomMenu_20261004"))
GAME = ROOT / "Taierzhuang1938"
SOURCE = Path(os.environ.get("COMMAND_ROOM_SOURCE", r"C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\CommandRoom"))
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
                normal=mat.node_tree.nodes.new("ShaderNodeNormalMap"); normal.inputs["Strength"].default_value=.18 if texture in ("CommandRoomCloth","CommandRoomCapCloth") else .5
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
dust=Material("CommandRoomDust",(.42,.39,.33),.99)
graphite=Material("CommandRoomGraphite",(.023,.022,.02),.77)
pencilWood=Material("CommandRoomPencilWood",(.48,.34,.20),.9)
pencilPaint=Material("CommandRoomPencilPaint",(.26,.115,.033),.86)
inkGlass=Material("CommandRoomInkGlass",(.045,.028,.016),.30)
paperEdge=Material("CommandRoomPaperEdge",(.47,.42,.33),.96)
def Mesh(name, verts, faces, mat, uvs=None, smooth=False):
    if name in {"CoatBody", "CoatSleeve", "DipPenNib"}: faces=[tuple(reversed(face)) for face in faces]
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
            if mat==wood and name.startswith(("TablePlank","TableLongApron","TableApronLowerLip","ChairCrest","WindowHeadSill","CabinetTop","CabinetDrawerRail","CabinetBasePlinth")):
                a,b=((1,0) if axis==2 else (2,0) if axis==1 else (1,2))
            uv.data[li].uv=(co[a]/tile+loc[a]*.31,co[b]/tile+loc[b]*.17)
    if bevel:
        m=ob.modifiers.new("Worn edges","BEVEL"); m.width=bevel;m.segments=5
        bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=m.name)
        if mat==wood:
            # Integral hand-worn corners and uneven timber, never separate chips.
            from mathutils import noise
            for v in ob.data.vertices:
                p=v.co;edge=sorted(abs(p[i])/(size[i]*.5) for i in range(3))[-2]
                n=noise.noise_vector((p+Vector(loc))*27)[0]
                v.co+=v.normal*(-max(0,n-.12)*.0045*edge**5)
            ob.data.update()
            colors=ob.data.color_attributes.new(name='TimberWear',type='FLOAT_COLOR',domain='POINT')
            for v in ob.data.vertices:
                p=v.co;edge=sorted(abs(p[i])/(size[i]*.5) for i in range(3))[-2]
                n=noise.noise_vector((p+Vector(loc))*8)[0]
                wear=.88+.22*n+.23*max(0,min(1,edge))**9
                colors.data[v.index].color=(wear,wear*.984,wear*.95,1)
        if name.startswith("TablePlank"):
            for v in ob.data.vertices:
                edge=max(abs(v.co.x)/(size[0]*.5),abs(v.co.y)/(size[1]*.5))
                v.co.z+=max(0,edge-.92)*.025*math.sin(v.co.x*47+v.co.y*113)
            ob.data.update()
        for poly in ob.data.polygons:poly.use_smooth=True
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
Cube("Floor",(1.5,0,-.09),(13,12,.18),plaster,.01)
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
courtyardPath=GAME/'_blender/Script_CommandRoomCourtyard.py'
exec(compile(courtyardPath.read_text(encoding='utf-8'),str(courtyardPath),'exec'),globals())
# Build the reference-matched wall skin with coherent lime/earth/brick relief.
wallPath=GAME/'_blender/Script_CommandRoomWallWear.py'
exec(compile(wallPath.read_text(encoding='utf-8'),str(wallPath),'exec'),globals())
furniturePath=GAME/'_blender/Script_CommandRoomFurniture.py'
exec(compile(furniturePath.read_text(encoding='utf-8'),str(furniturePath),'exec'),globals())
# Chair behind desk, deliberately empty.
cx=.02;cy=.84
Cube("ChairSeat",(cx,cy,.48),(.75,.47,.055),wood,.018)
for x in [cx-.34,cx+.34]:
    Cube("ChairBackPost",(x,cy+.19,.7025),(.046,.055,1.405),wood,.009)
    Cube("ChairFrontLeg",(x,cy-.18,.23),(.05,.05,.46),wood,.007)
Cube("ChairCrest",(cx,cy+.19,1.34),(.75,.063,.13),wood,.016)
Cube("ChairBackSlat",(cx,cy+.19,.915),(.055,.036,.85),wood,.008)
for x in [cx-.34,cx+.34]:Cube("ChairSideRung",(x,cy,.23),(.028,.43,.03),wood,.006)
# Paper meshes preserve the approved artwork and readable handwriting.
def Paper(name,cx,cy,z,w,h,mat,angle=0,wall=False):
    nx=32;ny=24;vs=[];uvs=[]
    for j in range(ny+1):
        v=j/ny
        for i in range(nx+1):
            u=i/nx;px=(u-.5)*w;py=(v-.5)*h
            edge=(max(0,abs(u-.5)-.43)/.07)**2*.008+(max(0,abs(v-.5)-.43)/.07)**2*.007
            cr=.0018*math.sin(u*math.pi*4)+.002*math.cos(v*math.pi*6)+edge
            if wall:
                # Mostly touching plaster; only the free bottom lip curls.
                pins=min(math.hypot(u-pu,v-pv) for pu,pv in [(.025,.965),(.975,.965),(.025,.045),(.975,.045)])
                cr=(.0008*(1+math.sin(u*19)*math.sin(v*13))+.004*(1-v)**14*(.6+.4*math.sin(u*15)**2))*min(1,pins/.055)
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
wallPaper=Paper("WallMapPaper",1.26,1.427,1.82,2.18,1.45,mapmat,wall=True)
for u,v in [(.025,.965),(.975,.965),(.025,.045),(.975,.045)]:
    x=1.26+(u-.5)*2.18;z=1.82+(v-.5)*1.45
    Rod('WallMapPinShaft',(x,1.418,z),(x,1.466,z),.0018,iron,12)
    Rod('WallMapPinHead',(x,1.418,z),(x,1.421,z),.0065,iron,24)
Paper("DeskMap",tx,ty-.10,.894,2.60,1.78,mapmat,math.radians(40)-.035)
# Telegram silhouette is built with the detailed props below.
# Ordinary 18.5 cm hexagonal pencils with exposed timber and graphite points.
for i in range(2):
    name=f"Pencil{i}";a=Vector((.02+i*.06,.015+i*.052,.910))
    d=Vector((.87,-.493+ i*.055,0)).normalized();b=a+d*.162
    Rod(name+"Shaft",a,b,.0035,pencilPaint,6)
    Rod(name+"ButtWood",a-d*.0005,a,.0035,pencilWood,6)
    Rod(name+"ButtLead",a-d*.00065,a-d*.00055,.0009,graphite,8)
    bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=.0035,radius2=.00065,depth=.020,location=b+d*.010)
    o=bpy.context.object;o.name=name+"Sharpening";o.rotation_euler=d.to_track_quat("Z","Y").to_euler();o.data.materials.append(pencilWood)
    bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=.00065,radius2=.00005,depth=.003,location=b+d*.0215)
    o=bpy.context.object;o.name=name+"Lead";o.rotation_euler=d.to_track_quat("Z","Y").to_euler();o.data.materials.append(graphite)
ruler=Cube("WoodRuler",(.46,-.27,.910),(.34,.032,.005),pencilWood,.001);ruler.rotation_euler.z=-.70
for i in range(31):
    local=Vector((-.15+i*.010,.011,.0027));ang=-.70
    p=Vector((.46+local.x*math.cos(ang)-local.y*math.sin(ang),-.27+local.x*math.sin(ang)+local.y*math.cos(ang),.913))
    q=p+Vector((math.sin(ang),-math.cos(ang),0))*(.012 if i%5==0 else .006)
    Rod("RulerTick",p,q,.00028,graphite,4)
penStart=Vector((.29,.19,.910));penDirection=Vector((.89,-.456,0)).normalized()
penSide=Vector((-penDirection.y,penDirection.x,0));vs=[];uvs=[]
profiles=[(0,.0015),(.035,.0032),(.095,.0042),(.135,.0036),(.157,.0025)]
for j,(along,radius) in enumerate(profiles):
    for i in range(17):
        a=i/16*math.tau
        vs.append(tuple(penStart+penDirection*along+penSide*(math.cos(a)*radius)+Vector((0,0,math.sin(a)*radius))))
        uvs.append((i/16,along*4))
Mesh("DipPenHandle",vs,[(j*17+i,j*17+i+1,(j+1)*17+i+1,(j+1)*17+i) for j in range(len(profiles)-1) for i in range(16)],pencilPaint,uvs,True)
vs=[];uvs=[]
for j,(along,width) in enumerate([(.153,.0024),(.164,.004),(.174,.003),(.185,.0002)]):
    for i in range(9):
        across=(i/8-.5)*2
        vs.append(tuple(penStart+penDirection*along+penSide*(across*width)+Vector((0,0,.0012*(1-across*across)))))
        uvs.append((i/8,j/3))
ob=Mesh("DipPenNib",vs,[(j*9+i,j*9+i+1,(j+1)*9+i+1,(j+1)*9+i) for j in range(3) for i in range(8)],iron,uvs,True)
mod=ob.modifiers.new("Thin steel nib","SOLIDIFY");mod.thickness=.0004
bpy.context.view_layer.objects.active=ob;bpy.ops.object.modifier_apply(modifier=mod.name)
# Refinements follow the saved Imagegen turnaround references.
detailsPath=GAME/"_blender/Script_CommandRoomDetails.py"
exec(compile(detailsPath.read_text(encoding="utf-8"),str(detailsPath),"exec"),globals())
# Scale the bottle to a 95 mm height; pencils retain their 185 mm length.
for ob in list(scene.objects):
    if ob.type=='MESH' and ob.name.startswith('InkBottle'):
        ob.matrix_world=Matrix.Translation((ix,iy,iz))@Matrix.Scale(1.34,4)@Matrix.Translation((-ix,-iy,-iz))@ob.matrix_world
# A small open wooden pencil tray, 23 x 8 cm, supplies an everyday scale cue.
bx=.26;by=.11;bz=.904
Cube('PencilBoxBase',(bx,by,bz),(.230,.080,.007),wood,.002)
for side in [-1,1]:
    Cube('PencilBoxLongRim',(bx,by+side*.037,bz+.010),(.230,.006,.020),wood,.002)
    Cube('PencilBoxEndRim',(bx+side*.112,by,bz+.010),(.006,.068,.020),wood,.002)
for ob in list(scene.objects):
    if ob.name.startswith(('Pencil0','Pencil1')):
        # Lay both pencils lengthwise in the tray without touching its walls.
        index=0 if ob.name.startswith('Pencil0') else 1
        pivot=Vector((.02+index*.06,.015+index*.052,.910))
        angle=-math.atan2(-.493+index*.055,.87)
        ob.matrix_world=Matrix.Translation((bx-.09,by+(index-.5)*.025,bz+.0073))@Matrix.Rotation(angle,4,'Z')@Matrix.Translation(-pivot)@ob.matrix_world
bpy.context.view_layer.update()
tableTransform=Matrix.Translation((tx,ty,0))@Matrix.Rotation(math.radians(40),4,"Z")@Matrix.Translation((-tx,-ty,0))
backdropTransform=Matrix.Translation((-.85,-2.5,1.9))@Matrix.Scale(1.235,4)@Matrix.Translation((.85,2.5,-1.9))
# Keep the chair crest at its reference height but place its feet on the floor.
# Turn it toward the diagonal desk and retreat along the desk's rear normal.
chairTransform=backdropTransform.copy();chairTransform[2][2]=.90;chairTransform[2][3]=0
chairPivot=chairTransform@Vector((cx,cy,0))
chairTransform=(Matrix.Translation((-.18*math.sin(math.radians(40)),.18*math.cos(math.radians(40)),0))
    @Matrix.Translation(chairPivot)@Matrix.Rotation(math.radians(30),4,"Z")
    @Matrix.Translation(-chairPivot)@chairTransform)
for ob in list(scene.objects):
    if ob.type=="MESH" and ob.name.startswith("Cap"):
        inverse=ob.matrix_world.inverted()
        for v in ob.data.vertices:
            p=ob.matrix_world@v.co
            v.co=inverse@(Vector((hx,hy,hz))+(Matrix.Rotation(math.radians(-35),3,"Z")@(p-Vector((hx,hy,hz))))*1.0)
    if ob.name.startswith('Coat'):
        ob.matrix_world=Matrix.Translation((0,0,-.39))@ob.matrix_world
    if ob.name.startswith(("Table","DryMortar")):
        ob.matrix_world=tableTransform@ob.matrix_world
    elif ob.type=="MESH" and ob.name.startswith("Chair"):
        ob.matrix_world=chairTransform@ob.matrix_world
    elif ob.type=="MESH" and not ob.name.startswith(("DeskMap","Telegram","Pencil","Ruler","WoodRuler","InkBottle","DipPen","Cap","Floor","SideWall")):
        ob.matrix_world=backdropTransform@ob.matrix_world
    if ob.type=="MESH" and len(ob.data.materials) and ob.data.materials[0] in (cloth,capCloth):
        for uv in ob.data.uv_layers:
            for corner in uv.data: corner.uv*=4
# Validate the furniture before material batching removes individual part names.
from mathutils.bvhtree import BVHTree
bpy.context.view_layer.update()
def WorldBvh(objects):
    verts=[];faces=[]
    for ob in objects:
        start=len(verts);verts.extend(ob.matrix_world@v.co for v in ob.data.vertices)
        faces.extend(tuple(start+i for i in p.vertices) for p in ob.data.polygons)
    return BVHTree.FromPolygons(verts,faces)
supportObjects=[o for o in scene.objects if o.type=='MESH' and o.name.startswith(('TablePlank','DeskMap','Telegram'))]
# Seat the telegram as a thin shell, preserving the two distinct paper surfaces.
paperSupport=WorldBvh([o for o in supportObjects if not o.name.startswith('Telegram')])
for ob in [o for o in supportObjects if o.name.startswith('Telegram')]:
    delta=-100
    for vertex in ob.data.vertices:
        p=ob.matrix_world@vertex.co
        hit,normal,index,distance=paperSupport.ray_cast(Vector((p.x,p.y,3)),Vector((0,0,-1)),4)
        if hit is not None:delta=max(delta,hit.z+.0006-p.z)
    ob.matrix_world=Matrix.Translation((0,0,delta))@ob.matrix_world
bpy.context.view_layer.update()
supportTree=WorldBvh(supportObjects)
propContacts={}
for group,prefixes in {'PencilTray':('PencilBox','Pencil0','Pencil1'),'Ruler':('WoodRuler','RulerTick'),
    'InkBottle':('InkBottle',),'DipPen':('DipPen',),'Cap':('Cap',)}.items():
    obs=[o for o in scene.objects if o.type=='MESH' and o.name.startswith(prefixes)]
    points=[o.matrix_world@v.co for o in obs for v in o.data.vertices]
    points.extend(o.matrix_world@p.center for o in obs for p in o.data.polygons)
    delta=-100.0
    for p in points:
        hit,normal,index,distance=supportTree.ray_cast(Vector((p.x,p.y,3)),Vector((0,0,-1)),4)
        if hit is not None:delta=max(delta,hit.z+.0006-p.z)
    assert delta>-10, f'{group} is off the desk'
    for o in obs:o.matrix_world=Matrix.Translation((0,0,delta))@o.matrix_world
    bpy.context.view_layer.update()
    overlaps=len(WorldBvh(obs).overlap(supportTree))
    assert overlaps==0, f'{group} intersects its support: {overlaps} triangle pairs'
    propContacts[group]={'heightAdjustment':delta,'surfaceGap':.0006,'supportIntersections':overlaps}
chairObjects=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('Chair')]
tableObjects=[o for o in scene.objects if o.type=='MESH' and o.name.startswith(('TablePlank','TableLeg','TableLongApron','TableShortApron'))]
chairOverlaps=len(WorldBvh(chairObjects).overlap(WorldBvh(tableObjects)))
assert chairOverlaps==0, f'Chair intersects table: {chairOverlaps} triangle pairs'
coatObjects=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('Coat') and o.data.materials[0]==cloth]
coatChairOverlaps=len(WorldBvh(coatObjects).overlap(WorldBvh(chairObjects)))
assert coatChairOverlaps==0, f'Hanging coat intersects chair: {coatChairOverlaps} triangle pairs'
chairFloor=min((o.matrix_world@v.co).z for o in chairObjects for v in o.data.vertices)
assert abs(chairFloor)<.001, f'Chair feet off the floor: {chairFloor}'
# Lighting: single sun through actual left aperture, soft indirect fill.
world=bpy.data.worlds.new("CommandRoomAmbient");scene.world=world;world.use_nodes=True
world.node_tree.nodes["Background"].inputs["Color"].default_value=(.48,.52,.57,1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value=.55
bpy.ops.object.light_add(type="AREA",location=(-1.5,1.86,2.6))
light=bpy.context.object;light.name="WindowSky";light.location=backdropTransform@light.location;light.data.energy=230;light.data.shape="RECTANGLE";light.data.size=1.54;light.data.size_y=1.85
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
scene.render.engine="CYCLES";scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.cycles.device='CPU'
scene.render.resolution_x=1672;scene.render.resolution_y=941;scene.render.resolution_percentage=100
scene.view_settings.view_transform="AgX";scene.view_settings.look="AgX - Medium High Contrast";scene.view_settings.exposure=.35
# Merge static meshes by material to keep realtime draw count proportional to materials.
for ob in scene.objects:
    if ob.type!='MESH':continue
    # Joining timber with authored wear to ordinary timber otherwise fills the
    # latter's missing glTF COLOR_0 with black. White is the neutral multiplier.
    if ob.data.materials[0] in (wood,plaster,mortarMat) and not ob.data.color_attributes:
        color=ob.data.color_attributes.new(name='TimberWear' if ob.data.materials[0]==wood else 'FreshLimeSection',type='FLOAT_COLOR',domain='POINT')
        for vertex in color.data:vertex.color=(1,1,1,1)
    asset=1 if ob.name.startswith('Cap') else 2 if ob.name.startswith('Coat') else 3 if ob.name.startswith('InkBottle') else 4 if ob.name.startswith('Table') else 5 if ob.name.startswith('Cabinet') else 0
    attr=ob.data.attributes.new(name='InspectionAsset',type='INT',domain='FACE')
    for p in attr.data:p.value=asset
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
# Keep the live asset intact until the lighting bake exports its matching UV1.
bpy.ops.export_scene.gltf(filepath=str(SHOTS/"Model_CommandRoomUnbaked.glb"),export_format="GLB",use_selection=True,export_cameras=True,export_lights=False,export_animations=False,export_extras=True,export_vertex_color='ACTIVE')
for mat,a,b in links:mat.node_tree.links.new(a,b)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/"Scene_CommandRoom.blend"))
scene.render.filepath=str(SHOTS/"Scene_CommandRoomBlender.png")
bpy.ops.render.render(write_still=True)
summary={"blend":str(SOURCE/"Scene_CommandRoom.blend"),"glb":str(GAME/"Model"/"Model_CommandRoom.glb"),"meshes":len([o for o in scene.objects if o.type=="MESH"]),"triangles":sum(len(p.vertices)-2 for o in scene.objects if o.type=="MESH" for p in o.data.polygons),"camera":{"position":list(cam.location),"rotation":list(cam.rotation_euler),"lens":cam.data.lens},"materials":list(materials),"render":scene.render.filepath,"chairTableIntersections":chairOverlaps,"coatChairIntersections":coatChairOverlaps,"chairFloor":chairFloor,"propContacts":propContacts,"capDimensions":capDimensions,"inkBottleHeightM":.071*1.34,"pencilTraySizeM":[.230,.080,.027]}
(SHOTS/"Data_CommandRoomBuild.json").write_text(json.dumps(summary,indent=2),encoding="utf-8")
print(json.dumps(summary))
result=summary
