"""经 BlenderMCP 在独立后台 Blender 执行；三套独立三视图作为源工程参考。
尖端位于原点，杆沿游戏 +Y；Three/Blender 换轴沿用原 builder。
"""
import bpy, math, random, json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
SOURCE=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/TactilePbr')
N={'__file__':str(ROOT/'Script_BuildNaturalEar.py')}
exec(compile((ROOT/'Script_BuildNaturalEar.py').read_text(encoding='utf-8'),N['__file__'],'exec'),N)
Mesh,Mat,V,Apply,Ellipsoid=[N[k] for k in ['Mesh','Mat','V','Apply','Ellipsoid']]

def Lathe(name,profile,mat,sides=32,offset=lambda y:(0,0),flat=1):
    verts=[];faces=[]
    for i,(y,r) in enumerate(profile):
        x,z=offset(y)
        for j in range(sides):
            a=j/sides*math.tau;verts.append((x+r*math.cos(a),y,z+r*math.sin(a)*flat))
            if i:
                k=(i-1)*sides+j;n=(i-1)*sides+(j+1)%sides;faces.append((k,n,n+sides,k+sides))
    obj=Mesh(name,verts,faces,mat)
    uv=obj.data.uv_layers.new(name='UVMap')
    for p in obj.data.polygons:
        for l in p.loop_indices:
            i=obj.data.loops[l].vertex_index;uv.data[l].uv=(i%sides/sides,i//sides/max(1,len(profile)-1))
    return obj

def Grip(name,start,end,r,mat,tier):
    profile=[(start,0),(start,r*.85),(start+.06,r)]
    for i in range(1,65):
        y=start+(end-start)*i/65
        # 真实切削环槽，等级越高分区越精细，端面留出抛光倒角。
        groove=.015 if tier==0 else .025
        rr=r-(groove if i%3==0 and 7<i<57 else 0)
        rr*=1+.05*math.sin(i/65*math.pi)
        profile.append((y,rr))
    profile.extend([(end-.05,r),(end,r*.85),(end,0)])
    return Lathe(name,profile,mat)

def Tools(tier,edition):
    suffix='_'+edition
    steel=Mat('Material_ToolSteel'+edition,(.44,.46,.47) if tier==0 else (.72,.76,.79),.43 if tier==0 else .24 if tier==1 else .13,.78,.18)
    handle=Mat('Material_ToolHandle'+edition,(.37,.215,.085) if tier==0 else (.55,.60,.62) if tier==1 else (.68,.65,.55),.65 if tier==0 else .28 if tier==1 else .19,0 if tier==0 else .8,.12)
    rubber=Mat('Material_ToolRubber'+edition,(.44,.37,.26) if tier==0 else (.15,.18,.19),.8 if tier==0 else .52)
    glass=Mat('Material_ToolGlass'+edition,(.76,.84,.86),.14 if tier==0 else .07,.06,.95)
    fibre=Mat('Material_ToolFibre'+edition,(.56,.48,.33) if tier==0 else (.82,.78,.66),.9)
    # 勺头双面薄壳，卷圆勺沿；基础竹勺与金属精修勺在厚度和收口上有区别。
    verts=[];faces=[];cols=48;rows=12
    for side in range(2):
        for i in range(rows):
            r=i/(rows-1)
            for j in range(cols):
                a=j/cols*math.tau;x=math.cos(a)*r*(.34 if tier==2 else .40);y=math.sin(a)*r*.57
                z=.15*r*r-(.064 if tier==0 else .038 if tier==1 else .025)*side
                verts.append((x,y,z))
                if i<rows-1:
                    k=side*rows*cols+i*cols+j;n=side*rows*cols+i*cols+(j+1)%cols;face=(k,n,n+cols,k+cols);faces.append(face if not side else face[::-1])
    for j in range(cols):
        k=(rows-1)*cols+j;n=(rows-1)*cols+(j+1)%cols;faces.append((k,k+rows*cols,n+rows*cols,n))
    Mesh('Model_ScoopHead'+suffix,verts,faces,handle if tier==0 else steel)
    import sys
    if str(ROOT) not in sys.path:sys.path.insert(0,str(ROOT))
    from Script_ScoopGripGeometry import ScoopGripGeometry
    positions,normals,uvs,faces=ScoopGripGeometry(tier)
    shaft=Mesh('Model_ScoopShaft'+suffix,positions,faces,handle)
    uv=shaft.data.uv_layers.new(name='UVMap')
    for loop in shaft.data.loops:
        u,v=uvs[loop.vertex_index];uv.data[loop.index].uv=(u,1-v)
    shaft.data.normals_split_custom_set_from_vertices([V(n) for n in normals])
    for side,label in [(-1,'Left'),(1,'Right')]:
        # 镊臂由扁弹片收束到圆钝夹尖，前端细齿是几何，不是贴一张黑条。
        prof=[(0,.048),(.08,.057),(.25,.060),(.7,.058),(1.6,.055),(3,.077),(6,.12),(11,.18),(16.8,.13),(17,.04)]
        off=lambda y,s=side:(s*(.08+.29*math.sin(min(1,y/17)*math.pi)),.018*math.sin(y*.2))
        jaw=Lathe('Model_ForcepsJaw'+label+suffix,prof,steel,16,off,.62 if tier==0 else .40)
        teeth=[]
        for i in range(7+tier*3):
            y=.1+i*.12;x,z=off(y);teeth.append(Ellipsoid('JawToothTemp',(x-side*.045,y,z),(.02,.025,.026),steel,8,4))
        Join(jaw,teeth)
    Grip('Model_ForcepsGrip'+suffix,16.65,20,.21,handle,tier)
    # 管口内外两层相连，保留真实孔洞与玻璃壁厚。
    outer=[(0,.105),(.08,.12),(.5,.13),(1.8,.19),(5.5,.19)]
    inner=[(5.5,.145),(1.8,.145),(.5,.085),(.08,.075),(0,.065),(0,.105)]
    pipette=Lathe('Model_DropperPipette'+suffix,outer+inner,glass,32)
    markings=[]
    for i in range(3,13):
        y=i*.36;markings.append(Lathe('DropperEtchTemp',[(y,.193),(y+.025,.193)],steel,12))
    Join(pipette,markings)
    bulb=Ellipsoid('Model_DropperBulb'+suffix,(0,7.4,0),(.52,1.9,.52),rubber,32,24)
    collar=Grip('DropperCollarTemp',5.4,5.85,.28,handle,tier);Join(bulb,[collar])
    Grip('Model_BrushGrip'+suffix,1.65,20,.17 if tier==0 else .21,handle,tier)
    verts=[];faces=[];rng=random.Random(532+tier)
    count=70+tier*35
    for i in range(count):
        a=i*2.399;r=math.sqrt((i+.5)/count)*.43;x=math.cos(a)*r;z=math.sin(a)*r;start=len(verts)
        for j in range(7):
            t=j/6;y=.05+t*1.75;rr=.007*(1-t)+.005
            for k in range(4):
                aa=k/4*math.tau;verts.append((x*(1-t*.6)+math.cos(aa)*rr,y,z*(1-t*.6)+math.sin(aa)*rr))
                if j<6:
                    n=start+j*4+k;m=start+j*4+(k+1)%4;faces.append((n,m,m+4,n+4))
    Mesh('Model_Brush'+suffix,verts,faces,fibre)
    offset=lambda y:(0,.13*min(1,max(0,(y-1)/2)))
    tube=Lathe('Model_Suction'+suffix,[(0,.25),(.07,.27),(1,.26),(3,.26),(12,.26),(19,.26),(19,.19),(12,.19),(3,.19),(1,.19),(0,.18),(0,.25)],steel,32,offset)
    grip=Grip('SuctionGripTemp',12,19,.33,handle,tier);Join(tube,[grip])

def Join(target,objects):
    bpy.ops.object.select_all(action='DESELECT');target.select_set(True)
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=target;bpy.ops.object.join();target.select_set(False)

def Build():
    assert Path(bpy.data.filepath).name in ['Model_NaturalEar.blend','Model_TactilePbr.blend']
    SOURCE.mkdir(parents=True,exist_ok=True)
    N['BLEND']=SOURCE/'Model_TactilePbr.blend'
    N['Canal'](hairCount=196,hairColor=(.31,.235,.15),hairRadius=.0045)
    for o in list(bpy.data.objects):
        if any(o.name.startswith('Model_'+p) for p in ['Scoop','Forceps','Dropper','Brush','Suction']):bpy.data.objects.remove(o,do_unlink=True)
    for tier,edition in enumerate(['Basic','Refined','Master']):Tools(tier,edition)
    import bmesh
    for obj in bpy.data.objects:
        if obj.type!='MESH':continue
        bm=bmesh.new();bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
        bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.000001)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    # 基础节点名兼容游戏入口；参考图平面只在源工程展示，不进入运行时 GLB。
    for obj in list(bpy.data.objects):
        if obj.name.endswith('_Basic'):
            clone=obj.copy();clone.data=obj.data.copy();clone.name=obj.name[:-6];bpy.context.collection.objects.link(clone)
    collection=bpy.data.collections.new('Reference_ThreeViewSets');bpy.context.scene.collection.children.link(collection)
    for i,edition in enumerate(['Basic','Refined','Master']):
        p=SOURCE/'References'/('Reference_Tools'+edition+'ThreeView.png')
        assert p.is_file(),str(p)
        img=bpy.data.images.load(str(p),check_existing=True);img.pack()
        ref=bpy.data.objects.new('Reference_'+edition,None);ref.empty_display_type='IMAGE';ref.data=img;ref.empty_display_size=35;ref.location=(i*40-40,35,0);ref.hide_render=True;collection.objects.link(ref)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'Model_TactilePbr.blend'))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH' and obj.name.startswith('Model_'):obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'Models/Model_ImmersiveEar.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_texcoords=True,export_normals=True)
    print('TACTILE_BUILD_COMPLETE',len([o for o in bpy.data.objects if o.type=='MESH']))

if __name__=='__main__':Build()
