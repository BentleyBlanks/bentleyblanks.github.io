"""BlenderMCP iteration: CC0 MakeHuman facial topology, fitted pinna, root-weighted pale vellus.
Run only in this task's DirectionalAnatomy source project. No other Blender file is overwritten.
"""
import bpy, bmesh, math, json, random
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
SOURCE=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/DirectionalAnatomy')
BASE=Path('C:/Users/Bentl/AppData/Roaming/Blender Foundation/Blender/5.1/extensions/user_default/mpfb/data/3dobjs/base.obj')
api={'__file__':str(ROOT/'Script_BuildImmersiveEar.py')}
exec(compile((ROOT/'Script_BuildImmersiveEar.py').read_text(encoding='utf-8'),api['__file__'],'exec'),api)
Mesh,Mat,Apply,V=[api[k] for k in ['Mesh','Mat','Apply','V']]

def Remove(name):
    obj=bpy.data.objects.get(name)
    if obj:bpy.data.objects.remove(obj,do_unlink=True)

def Head():
    # The distributed MakeHuman base.obj explicitly declares CC0 (September 2020).
    points=[];faces=[];body=False
    for line in BASE.read_text().splitlines():
        bits=line.split()
        if not bits:continue
        if bits[0]=='v':points.append(tuple(map(float,bits[1:4])))
        if bits[0]=='g':body=bits[1]=='body'
        if bits[0]=='f' and body:
            f=[int(b.split('/')[0])-1 for b in bits[1:]]
            if all(points[i][1]>5.55 for i in f):faces.append(f)
    used=sorted({i for f in faces for i in f});lookup={old:i for i,old in enumerate(used)}
    # Human faces +Z; rotate the lateral head so the treated ear looks toward game -Z.
    vertices=[]
    for i in used:
        x,y,z=points[i]
        vertices.append(((z-.22)*100-28,(y-7.13)*100+4,(x+.79)*100+14))
    Remove('Model_Temple')
    obj=Mesh('Model_Temple',vertices,[[lookup[i] for i in f] for f in faces],Mat('Material_AnatomicalHead',(.60,.40,.31),.58))
    # 平滑处理侧底模耳廓，保留连续头皮，实际耳廓由独立解剖模型提供。
    bm=bmesh.new();bm.from_mesh(obj.data)
    native=[v for v in bm.verts if -31<v.co.x<25 and -42<v.co.z<39 and -v.co.y<48]
    for _ in range(100):bmesh.ops.smooth_vert(bm,verts=native,factor=.62,use_axis_x=True,use_axis_y=True,use_axis_z=True)
    bm.to_mesh(obj.data);bm.free()
    sub=obj.modifiers.new('FacialSubdivision','SUBSURF');sub.levels=1;Apply(obj,sub)
    # The treated-side base ear is recessed behind our continuous pinna, not doubled.
    for v in obj.data.vertices:
        p=(v.co.x,v.co.z,-v.co.y)
        if -25<p[0]<14 and -33<p[1]<35 and p[2]<15:
            blend=math.exp(-((p[0]+4)/17)**4-(p[1]/28)**4)
            v.co.y-=blend*9
    uv=obj.data.uv_layers.new(name='UVMap')
    for poly in obj.data.polygons:
        for l in poly.loop_indices:
            v=obj.data.vertices[obj.data.loops[l].vertex_index].co
            uv.data[l].uv=((v.x+60)/220,(v.z+140)/280)
    obj['source']='MakeHuman CC0 base mesh; facial head crop, subdivision and ear fitting in BlenderMCP'
    print('HEAD',len(obj.data.vertices),len(obj.data.polygons))

def Ear():
    ear=bpy.data.objects['Model_OuterEar']
    # Keep the sealed canal entry fixed. Round the scapha, deepen concha and soften rim underside.
    for v in ear.data.vertices:
        x,y,z=v.co.x,v.co.z,-v.co.y
        d=math.hypot(x,y);weight=min(1,max(0,(d-4)/6))
        concha=.55*math.exp(-((x+4)/6)**2-((y-3)/10)**2)
        fossa=.38*math.exp(-((x+10)/2.8)**2-((y-14)/7)**2)
        v.co.y-=(concha+fossa)*weight
    sub=ear.modifiers.new('PinnaCartilageContinuity','SUBSURF');sub.levels=1;Apply(ear,sub)
    # Smooth bony transition with local, non-annular skin folds; same displacement written to profile.
    profile=json.loads((ROOT/'Data_CanalProfile.json').read_text())
    if not profile[0].get('directionalEdition'):
        for i,f in enumerate(profile):
            for j in range(64):
                a=j/64*math.tau;outer=math.exp(-((i-13)/14)**2)
                f['radii'][j]+=(.10*math.cos(a*2+.4)+.06*math.sin(a*3+i*.11))*outer
        profile[0]['directionalEdition']=1
        (ROOT/'Data_CanalProfile.json').write_text(json.dumps(profile,separators=(',',':')))
    wall=bpy.data.objects['Model_Canal']
    old=wall.data
    cols=128;rows=len(profile);verts=[];faces=[]
    smooth=[[sum(profile[k]['radii'][j] for k in range(max(0,i-3),min(rows,i+4)))/(min(rows,i+4)-max(0,i-3)) for j in range(64)] for i in range(rows)]
    for i,f in enumerate(profile):
        for j in range(cols+1):
            a=j/cols*math.tau;k=j/cols*64;lo=int(k)%64;t=k-int(k)
            r=smooth[i][lo]*(1-t)+smooth[i][(lo+1)%64]*t+.012*math.sin(a*11+i*.18)*math.sin(i*.41+a*3)
            direction=Vector(f['up'])*math.cos(a)+Vector(f['right'])*math.sin(a)
            verts.append(tuple(Vector(f['center'])+direction*r))
            if i<rows-1 and j<cols:
                n=i*(cols+1)+j;faces.append((n,n+cols+1,n+cols+2,n+1))
    replacement=Mesh('CanalReplacement',verts,faces,wall.data.materials[0]);wall.data=replacement.data;bpy.data.objects.remove(replacement,do_unlink=True)
    uv=wall.data.uv_layers.new(name='UVMap')
    for poly in wall.data.polygons:
        for l in poly.loop_indices:
            i=wall.data.loops[l].vertex_index;uv.data[l].uv=(i%(cols+1)/cols,i//(cols+1)/(rows-1))
    bm=bmesh.new();bm.from_mesh(wall.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.to_mesh(wall.data);bm.free()
    solid=wall.modifiers.new('CanalTissueThickness','SOLIDIFY');solid.thickness=.7;solid.offset=-1;Apply(wall,solid)
    Hair(profile,smooth)

def Hair(profile,smooth):
    Remove('Model_CanalHair');rng=random.Random(911);verts=[];faces=[];weights=[]
    for hair in range(360):
        depth=rng.randint(1,29);f=profile[depth];a=rng.random()*math.tau
        outward=Vector(f['up'])*math.cos(a)+Vector(f['right'])*math.sin(a)
        k=a/math.tau*64;j=int(k);radius=smooth[depth][j]*(1-(k-j))+smooth[depth][(j+1)%64]*(k-j)
        base=Vector(f['center'])+outward*(radius-.025)
        toward=(Vector(profile[max(0,depth-1)]['center'])-Vector(f['center'])).normalized()
        side=outward.cross(toward).normalized();length=rng.uniform(.25,.83);start=len(verts)
        for step in range(8):
            t=step/7;p=base-outward*(math.sin(t*1.2)*length*.58)+toward*(t*length*.62)+side*(math.sin(t*2.2)*length*.10)
            r=.0048*(1-t)**.8+.00045
            for k in range(4):
                angle=k/4*math.tau;verts.append(tuple(p+r*(side*math.cos(angle)+outward*math.sin(angle))));weights.append((t,hair/360))
                if step<7:
                    n=start+step*4+k;m=start+step*4+(k+1)%4;faces.append((n,m,m+4,n+4))
    obj=Mesh('Model_CanalHair',verts,faces,Mat('Material_PaleVellus',(.64,.65,.64),.86))
    uv=obj.data.uv_layers.new(name='UVMap')
    for poly in obj.data.polygons:
        for l in poly.loop_indices:uv.data[l].uv=weights[obj.data.loops[l].vertex_index]
    obj['hairCount']=360;obj['rootWeights']='UV.x 0=root 1=tip; UV.y strand phase'

def Feather():
    ref=SOURCE/'References/Reference_FeatherWandThreeView.png'
    if ref.is_file():
        img=bpy.data.images.load(str(ref),check_existing=True);img.pack()
        if not bpy.data.objects.get('Reference_FeatherWand'):
            obj=bpy.data.objects.new('Reference_FeatherWand',None);obj.empty_display_type='IMAGE';obj.data=img;obj.empty_display_size=36;obj.hide_render=True;bpy.context.collection.objects.link(obj)
    for edition,thickness,barbs in [('Basic',.64,68),('Refined',.74,88),('Master',.84,108)]:
        for name in ['Model_FeatherTuft','Model_FeatherGrip']:Remove(name+'_'+edition)
        fibre=Mat('Material_FeatherIvory',(.79,.79,.72),.86)
        verts=[];faces=[];rng=random.Random(228)
        def Strand(a,b,c,radius):
            start=len(verts)
            for j in range(6):
                t=j/5;p=(1-t)**2*a+2*t*(1-t)*b+t*t*c
                r=radius*(1-t)+.0007
                for k in range(4):
                    angle=k*math.tau/4;verts.append(tuple(p+Vector((math.cos(angle)*r,0,math.sin(angle)*r))))
                    if j<5:
                        n=start+j*4+k;m=start+j*4+(k+1)%4;faces.append((n,m,m+4,n+4))
        Strand(Vector((0,0,0)),Vector((.08,1.5,0)),Vector((0,4,0)),.028)
        for i in range(barbs):
            t=(i+.5)/barbs;angle=i*2.39996
            width=math.sin(t*math.pi)**.7*thickness
            root=Vector((.06*math.sin(t*math.pi),.14+t*2.4,0));out=Vector((math.cos(angle)*width,-.4,math.sin(angle)*width*.55))
            tip=root+out;Strand(root,root+out*.68+Vector((0,.18,0)),tip,.009)
            for k in range(2):
                branch=root+out*(.48+k*.17);Strand(branch,branch+out*.17+Vector((0,-.11,0)),branch+out*.30+Vector((0,-.24-rng.random()*.12,0)),.0032)
        Mesh('Model_FeatherTuft_'+edition,verts,faces,fibre)
        handle=Mat('Material_ToolHandle_Feather_'+edition,(.27,.17,.08) if edition=='Basic' else (.44,.49,.50),.55 if edition=='Basic' else .24,0 if edition=='Basic' else .85)
        api['Tube']('Model_FeatherGrip_'+edition,[(0,3.0,0),(0,5,0),(0,10,0),(0,18,0)],.17 if edition=='Basic' else .19,handle)
    for name in ['Model_FeatherTuft','Model_FeatherGrip']:
        Remove(name);obj=bpy.data.objects[name+'_Basic'];copy=obj.copy();copy.data=obj.data.copy();copy.name=name;bpy.context.collection.objects.link(copy)

def RefineTools():
    tools={'__file__':str(ROOT/'Script_BuildTactileTools.py')}
    exec(compile((ROOT/'Script_BuildTactileTools.py').read_text(encoding='utf-8'),tools['__file__'],'exec'),tools)
    for tier,edition in enumerate(['Basic','Refined','Master']):
        suffix='_'+edition
        for part in ['Model_ScoopHead','Model_ForcepsJawLeft','Model_ForcepsJawRight']:
            obj=bpy.data.objects[part+suffix]
            if obj.get('precisionRefined'):continue
            bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.00001);bm.to_mesh(obj.data);bm.free()
            sub=obj.modifiers.new('RoundedWorkingEdges','SUBSURF');sub.levels=1;Apply(obj,sub);obj['precisionRefined']=True
        pipe=bpy.data.objects['Model_DropperPipette'+suffix]
        if not pipe.get('precisionRefined'):
            liquid=Mat('Material_ToolLiquid'+edition,(.67,.80,.72),.06,0,.9)
            b=liquid.node_tree.nodes.get('Principled BSDF');b.inputs['Transmission Weight'].default_value=.6;b.inputs['IOR'].default_value=1.33
            meniscus=tools['Lathe']('DropperLiquidTemp',[(.22,0),(.24,.052),(.55,.079),(1.8,.13),(3.63,.13),(3.66,.12),(3.62,0)],liquid,48)
            tools['Join'](pipe,[meniscus]);pipe['precisionRefined']=True
        Remove('Model_Brush'+suffix)
        verts=[];faces=[];rng=random.Random(301+tier);count=180+tier*60
        for i in range(count):
            a=i*2.399;r=math.sqrt((i+.5)/count)*(.42+tier*.025);x=math.cos(a)*r;z=math.sin(a)*r;start=len(verts)
            length=1.5+rng.random()*.38;bend=rng.uniform(.04,.18)
            for j in range(10):
                t=j/9;y=1.85-length*(1-t);radius=.0025+.005*t;curve=(1-t)**2
                for k in range(4):
                    aa=k/4*math.tau;verts.append((x*(1-t*.53)+math.cos(a)*bend*curve+math.cos(aa)*radius,y,z*(1-t*.53)+math.sin(a)*bend*curve+math.sin(aa)*radius))
                    if j<9:
                        n=start+j*4+k;m=start+j*4+(k+1)%4;faces.append((n,m,m+4,n+4))
        obj=Mesh('Model_Brush'+suffix,verts,faces,Mat('Material_ToolFibre'+edition,(.71,.70,.62),.75))
        for name in ['Model_ScoopHead','Model_ForcepsJawLeft','Model_ForcepsJawRight','Model_DropperPipette','Model_Brush']:
            if edition=='Basic':
                Remove(name);obj=bpy.data.objects[name+suffix];copy=obj.copy();copy.data=obj.data.copy();copy.name=name;bpy.context.collection.objects.link(copy)

def Build():
    assert Path(bpy.data.filepath).resolve()==(SOURCE/'Model_DirectionalAnatomy.blend').resolve()
    import sys
    if '--head-only' in sys.argv:Head()
    else:
        if '--feather-only' not in sys.argv and '--tools-only' not in sys.argv:Head();Ear()
        if '--tools-only' not in sys.argv:Feather()
        RefineTools()
    for obj in bpy.data.objects:
        if obj.type=='MESH' and obj.name!='Model_Canal':
            bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'Model_DirectionalAnatomy.blend'))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH' and obj.name.startswith('Model_'):obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'Models/Model_ImmersiveEar.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True)
    print('DIRECTIONAL_ANATOMY_READY')

if __name__=='__main__':Build()
