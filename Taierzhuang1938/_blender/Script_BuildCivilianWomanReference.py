"""Middle-aged refugee woman, authored with BlenderMCP on the shared 53+13 rig.

Only the face samples the character photographs. Cloth, repairs and equipment
are real geometry with independent textiles, avoiding projected accessory ghosts.
WOMAN_CONFIG overrides repo/references/output/render without editing this file.
"""
import bpy, bmesh, math, json, hashlib
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

cfg=globals().get('WOMAN_CONFIG',{})
repo=Path(cfg.get('repo',Path(__file__).resolve().parents[2]))
source=Path(cfg.get('references',r'C:/Users/Bentl/OneDrive/Sync/饮河/FPS/角色/百姓/08_中年_女子'))
out=Path(cfg.get('output',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/CivilianWomanReference_20260929'))
out.mkdir(parents=True,exist_ok=True);review=out/'Review';review.mkdir(exist_ok=True)
asset=repo/'Taierzhuang1938/Model/Character'
helper=Path(__file__).with_name('Script_CivilianWomanTools.py')
exec(compile(helper.read_text(encoding='utf8'),str(helper),'exec'))

def Clear():
    assert not bpy.data.filepath or Path(bpy.data.filepath).parent==out,'Refuse another task scene'
    if bpy.context.object and bpy.context.object.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
    for obj in list(bpy.data.objects):bpy.data.objects.remove(obj,do_unlink=True)
    for items in [bpy.data.actions,bpy.data.materials,bpy.data.meshes,bpy.data.armatures]:
        for item in list(items):items.remove(item)
    for im in list(bpy.data.images):
        if im.type not in ['RENDER_RESULT','COMPOSITING']:bpy.data.images.remove(im)

def Cloth(name,color,quadrant,wear=.22):
    m=BasicMaterial('Material_CivilianWoman'+name,color,.93);n=m.node_tree.nodes;l=m.node_tree.links;bs=n.get('Principled BSDF')
    coord=n.new('ShaderNodeTexCoord');noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=18;noise.inputs['Detail'].default_value=4
    l.new(coord.outputs['Object'],noise.inputs[0]);ramp=n.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color=(*(v*(1-wear) for v in color),1);ramp.color_ramp.elements[1].color=(*(v*(1+wear) for v in color),1)
    l.new(noise.outputs['Fac'],ramp.inputs[0]);sep=n.new('ShaderNodeSeparateXYZ');l.new(coord.outputs['Object'],sep.inputs[0]);samples=[]
    for first,second in [(0,2),(1,2),(0,1)]:
        combine=n.new('ShaderNodeCombineXYZ')
        for target,index in enumerate([first,second]):
            mul=n.new('ShaderNodeMath');mul.operation='MULTIPLY';mul.inputs[1].default_value=8;l.new(sep.outputs[index],mul.inputs[0])
            fract=n.new('ShaderNodeMath');fract.operation='FRACT';l.new(mul.outputs[0],fract.inputs[0])
            span=n.new('ShaderNodeMath');span.operation='MULTIPLY_ADD';span.inputs[1].default_value=.48;span.inputs[2].default_value=quadrant[target]+.01
            l.new(fract.outputs[0],span.inputs[0]);l.new(span.outputs[0],combine.inputs[target])
        tex=n.new('ShaderNodeTexImage');tex.image=atlas;tex['PreserveVector']=True;l.new(combine.outputs[0],tex.inputs['Vector']);samples.append(tex)
    geo=n.new('ShaderNodeNewGeometry');normal=n.new('ShaderNodeSeparateXYZ');l.new(geo.outputs['Normal'],normal.inputs[0]);factors=[]
    for index in [0,2]:
        absn=n.new('ShaderNodeMath');absn.operation='ABSOLUTE';l.new(normal.outputs[index],absn.inputs[0]);factor=n.new('ShaderNodeMapRange')
        factor.inputs['From Min'].default_value=.30;factor.inputs['From Max'].default_value=.85;l.new(absn.outputs[0],factor.inputs['Value']);factors.append(factor)
    side=n.new('ShaderNodeMixRGB');l.new(factors[0].outputs[0],side.inputs[0]);l.new(samples[0].outputs[0],side.inputs[1]);l.new(samples[1].outputs[0],side.inputs[2])
    top=n.new('ShaderNodeMixRGB');l.new(factors[1].outputs[0],top.inputs[0]);l.new(side.outputs[0],top.inputs[1]);l.new(samples[2].outputs[0],top.inputs[2])
    mix=n.new('ShaderNodeMixRGB');mix.inputs[0].default_value=.32;l.new(ramp.outputs[0],mix.inputs[1]);l.new(top.outputs[0],mix.inputs[2]);l.new(mix.outputs[0],bs.inputs['Base Color'])
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.24;bump.inputs['Distance'].default_value=.0003;l.new(top.outputs[0],bump.inputs['Height']);l.new(bump.outputs[0],bs.inputs['Normal'])
    bs.inputs['Sheen Weight'].default_value=.12;bs.inputs['Specular IOR Level'].default_value=.22
    return m

def HeadMaterial():
    m=BasicMaterial('Material_CivilianWomanFace',(.30,.19,.13),.73);n=m.node_tree.nodes;l=m.node_tree.links;bs=n.get('Principled BSDF')
    tex=[]
    for view in ['Front','Side']:
        uv=n.new('ShaderNodeUVMap');uv.uv_map='UV_'+view;t=n.new('ShaderNodeTexImage');t.image=images[view];t.extension='EXTEND';l.new(uv.outputs[0],t.inputs[0]);tex.append(t)
    side=n.new('ShaderNodeVertexColor');side.layer_name='PhotoSide';mix=n.new('ShaderNodeMixRGB');l.new(side.outputs[0],mix.inputs[0]);l.new(tex[0].outputs[0],mix.inputs[1]);l.new(tex[1].outputs[0],mix.inputs[2])
    valid=n.new('ShaderNodeVertexColor');valid.layer_name='PhotoCoverage';clean=n.new('ShaderNodeMixRGB');clean.inputs[1].default_value=(.29,.18,.115,1)
    l.new(valid.outputs[0],clean.inputs[0]);l.new(mix.outputs[0],clean.inputs[2]);l.new(clean.outputs[0],bs.inputs['Base Color']);bs.inputs['Subsurface Weight'].default_value=.055
    noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=760;noise.inputs['Detail'].default_value=2
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.11;bump.inputs['Distance'].default_value=.00016;l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],bs.inputs['Normal'])
    return m

def HeadUv(p):
    # Measured photograph landmarks, in source pixels, registered to the preserved
    # lip and eyelid loops of the inherited facial mesh.
    anchors=[(1.451,207),(1.50,180),(1.575,147),(1.607,131),(1.611,127),(1.616,123),(1.650,108),(1.686,83.2),(1.704,71),(1.745,45),(1.81,14)]
    py=950-p.z*512
    for (a,y),(b,yy) in zip(anchors,anchors[1:]):
        if a<=p.z<=b:py=Mix(y,yy,(p.z-a)/(b-a));break
    return ((302+p.x*580)/512,1-py/1024)


def SourceSkin():
    for obj in list(bpy.context.scene.objects):
        if obj.type!='MESH':continue
        material=obj.data.materials[0].name if obj.data.materials else ''
        if material in ['Material #1721585337','Material #1721585500'] or not obj.vertex_groups:
            bpy.data.objects.remove(obj,do_unlink=True);continue
        if material=='Material #26':
            obj.name='Mesh_CivilianWomanHead'
            for v in obj.data.vertices:
                p=obj.matrix_world@v.co
                # Reshape only the lower facial silhouette; preserve the eye/lip loops.
                p.x*=1-.13*math.exp(-((p.z-1.586)/.049)**2)
                v.co=obj.matrix_world.inverted()@p
            obj.data.materials.clear();obj.data.materials.append(headMat)
            front=obj.data.uv_layers.active;front.name='UV_Front';side=obj.data.uv_layers.new(name='UV_Side')
            blend=obj.data.color_attributes.new(name='PhotoSide',type='FLOAT_COLOR',domain='CORNER');cover=obj.data.color_attributes.new(name='PhotoCoverage',type='FLOAT_COLOR',domain='CORNER')
            for i,loop in enumerate(obj.data.loops):
                p=obj.matrix_world@obj.data.vertices[loop.vertex_index].co;py=950-p.z*512+6*math.exp(-((p.z-1.61)/.045)**2)
                front.data[i].uv=HeadUv(p)
                side.data[i].uv=((244+p.y*508)/512,1-(953-p.z*512)/1024)
                sw=Smooth(.048,.085,abs(p.x));valid=(1-Smooth(.025,.063,p.y))*Smooth(1.495,1.545,p.z)*(1-Smooth(1.755,1.785,p.z));valid*=1-(1-Smooth(1.59,1.645,p.z))*Smooth(-.13,-.07,p.y)
                blend.data[i].color=(sw,sw,sw,1);cover.data[i].color=(valid,valid,valid,1)
            bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000015);bm.to_mesh(obj.data);bm.free()
            mod=obj.modifiers.new('FaceSurface','SUBSURF');mod.levels=2;mod.render_levels=2
        elif material=='John_All Body':
            obj.name='Mesh_CivilianWomanHands';bm=bmesh.new();bm.from_mesh(obj.data)
            bmesh.ops.delete(bm,geom=[v for v in bm.verts if abs((obj.matrix_world@v.co).x)<.675],context='VERTS');bm.to_mesh(obj.data);bm.free()
            for v in obj.data.vertices:
                p=obj.matrix_world@v.co;p.x+=.025*(1 if p.x>0 else -1);p.y-=.026;v.co=obj.matrix_world.inverted()@p
            m=obj.data.materials[0];bs=m.node_tree.nodes.get('Principled BSDF')
            if bs and bs.inputs['Base Color'].is_linked:
                sock=bs.inputs['Base Color'].links[0].from_socket;mix=m.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=.35;mix.inputs[2].default_value=(.62,.51,.42,1)
                m.node_tree.links.new(sock,mix.inputs[1]);m.node_tree.links.new(mix.outputs[0],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.76
        elif material=='Material_FacialOral':
            obj.name='Mesh_CivilianWomanOral'
            for v in obj.data.vertices:
                p=obj.matrix_world@v.co;p.x*=.82;p.y+=.009;v.co=obj.matrix_world.inverted()@p
        else:obj.name='Mesh_CivilianWomanEyes'
        if obj.type=='MESH':
            for poly in obj.data.polygons:poly.use_smooth=True

def JacketProfile(z):
    rows=[(.85,.189,.128),(.91,.191,.128),(1.04,.181,.119),(1.17,.163,.105),(1.30,.173,.119),(1.41,.172,.105),(1.48,.180,.081),(1.509,.145,.073),(1.535,.056,.063)]
    if z<=rows[0][0]:return rows[0][1:]
    for (a,x,y),(b,xx,yy) in zip(rows,rows[1:]):
        if z<=b:return Mix(x,xx,(z-a)/(b-a)),Mix(y,yy,(z-a)/(b-a))
    return rows[-1][1:]

def FrontSurface(x,z):
    rx,ry=JacketProfile(z);return .006-ry*math.sqrt(max(.03,1-(x/rx)**2))

def JacketWeights(p):
    x,y,z=p;side='L' if x>0 else 'R';rx,_=JacketProfile(z)
    arm=Mix(Smooth(rx+.007,rx+.034,abs(x)),Smooth(.136,.214,abs(x)),Smooth(1.33,1.45,z));weights={n:w*(1-arm) for n,w in TorsoWeights(p).items()}
    for n,w in ArmWeights(p,side).items():weights[n]=weights.get(n,0)+w*arm
    return {n:w for n,w in weights.items() if w>1e-6}

def Jacket():
    parts=[];points=[];faces=[];nz=100;na=96
    for j in range(nz):
        z=.85+j*.685/(nz-1);rx,ry=JacketProfile(z)
        for i in range(na):
            a=2*math.pi*i/na;lo=1-Smooth(1.13,1.42,z)
            fold=.0033*lo*math.sin(11*a+4*z)+.0018*math.sin(7*a+z*16)
            for h,amp,phase in [(1.05,.003,1),(1.26,.0025,2.4),(1.37,.0028,4)]:fold+=amp*math.exp(-((z-h-.045*math.sin(a+phase))/.017)**2)
            zz=z+.0015*(1-Smooth(.85,.88,z))*math.sin(29*a)
            points.append(((rx+fold)*math.cos(a),.006+(ry+fold)*math.sin(a),zz))
    for j in range(nz-1):
        for i in range(na):faces.append((j*na+i,j*na+(i+1)%na,(j+1)*na+(i+1)%na,(j+1)*na+i))
    faces.extend([tuple(reversed(range(na))),tuple((nz-1)*na+i for i in range(na))]);parts.append(Mesh('Mesh_CivilianWomanJacketShell',points,faces,None,cloth))
    for side,sign in [('L',1),('R',-1)]:
        rings=[]
        for j in range(72):
            t=j/71;z=.93+t*.568;rx=.044+.010*math.sin(t*math.pi*.9);ry=.051+.009*math.sin(t*math.pi)
            if t>.86:rx*=max(.12,math.sqrt(max(0,1-((t-.86)/.14)**2)));ry*=max(.12,math.sqrt(max(0,1-((t-.86)/.14)**2)))
            rings.append((sign*(.277-.087*Smooth(1.27,1.498,z)),.027,z,rx,ry))
        ob=Loft('Mesh_CivilianWomanSleeveShell'+side,rings,64,None,cloth,0)
        for mod in list(ob.modifiers):ob.modifiers.remove(mod)
        for v in ob.data.vertices:
            p=v.co;z=p.z;c=Vector((sign*(.277-.087*Smooth(1.27,1.498,z)),.027,z));d=p-c;a=math.atan2(d.y,d.x);fold=.0015*math.sin(a*6+z*11)
            for h,amp,phase in [(1.12,.0033,.3),(1.17,-.0035,2),(1.21,.0045,3.5),(.96,.0025,4.5)]:fold+=amp*math.exp(-((z-h-.02*math.sin(a+phase))/.011)**2)
            if d.length:p+=d.normalized()*fold
        parts.append(ob)
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:p.select_set(True)
    ob=parts[0];bpy.context.view_layer.objects.active=ob;bpy.ops.object.join();ob.name='Mesh_CivilianWomanTunic'
    ob.data.remesh_voxel_size=.0045;bpy.ops.object.voxel_remesh();smooth=ob.modifiers.new('RelaxCloth','SMOOTH');smooth.factor=.4;smooth.iterations=3;bpy.ops.object.modifier_apply(modifier=smooth.name)
    for poly in ob.data.polygons:poly.use_smooth=True
    BindRelaxed(ob,JacketWeights);mod=ob.modifiers.new('ClothSurface','SUBSURF');mod.levels=1;mod.render_levels=1
    # Short soft stand collar, continuously wrapping the neck with a small front opening.
    points=[];faces=[];ns=73
    for j in range(5):
        t=j/4
        for i in range(ns):
            a=.11+(2*math.pi-.22)*i/(ns-1);zt=1.542+.012*(1-math.cos(a))*.5
            points.append((.057*math.sin(a),-.006-.065*math.cos(a),zt-.025*(1-t)))
    for j in range(4):
        for i in range(ns-1):a=j*ns+i;faces.append((a,a+1,a+ns+1,a+ns))
    Surface('Mesh_CivilianWomanCollar',points,faces,TorsoWeights,cloth,.002)
    path=[(x,FrontSurface(x,z)-.003,z) for x,z in [(0,1.532),(-.035,1.477),(-.075,1.405),(-.12,1.322),(-.143,1.25)]]
    Strap('Mesh_CivilianWomanDiagonalPlacket',PathResample(path,6),.016,cloth,TorsoWeights)
    StitchPath('Mesh_CivilianWomanPlacketStitch',path,TorsoWeights,spacing=.004)
    for k,(x,z) in enumerate([(-.012,1.513),(-.05,1.45),(-.09,1.377),(-.13,1.297)]):
        y=FrontSurface(x,z)-.007
        path=[(x+.015*math.cos(a),y-.001*math.sin(a),z+.004*math.sin(a)) for a in [i*2*math.pi/36 for i in range(37)]]
        Tube('Mesh_CivilianWomanFrogLoop'+str(k),path,.0016,scarf,TorsoWeights,6)
        Ellipsoid('Mesh_CivilianWomanFrogKnot'+str(k),(x,y-.002,z),(.0045,.003,.003),scarf,TorsoWeights)

def Pants():
    for side,sign in [('L',1),('R',-1)]:
        rings=[]
        for j in range(76):
            z=.104+j*.87/75;t=(z-.104)/.87;rx=.050+.036*math.sin(t*math.pi*.78);ry=.055+.043*math.sin(t*math.pi*.78)
            rings.append((sign*(.10-.014*Smooth(.72,.97,z)),.018,z,rx,ry))
        ob=Loft('Mesh_CivilianWomanTrousers'+side,rings,64,lambda p,s=side:LegWeights(p,s),pants,0)
        # Cloth folds are authored in relaxed space and returned to the common bind.
        for v in ob.data.vertices:
            w={ob.vertex_groups[g.group].name:g.weight for g in v.groups};mat=BlendMatrix(w);p=mat@v.co;z=p.z;cx=sign*(.10-.014*Smooth(.72,.97,z));a=math.atan2(p.y-.018,p.x-cx)
            fold=.0028*math.sin(a*9+z*3)+.0018*math.sin(a*16-z*9)
            for h,amp,phase in [(.15,.006,0),(.20,-.003,1),(.49,.004,3),(.54,-.003,1.3),(.69,.003,5)]:fold+=amp*math.exp(-((z-h-.028*math.sin(a+phase))/.013)**2)
            p.x+=fold*math.cos(a);p.y+=fold*math.sin(a);v.co=mat.inverted()@p
        # Layered cloth sole, fitted shoe upper and visible ankle.
        foot={'Bip001 '+side+' Foot':1}
        Loft('Mesh_CivilianWomanAnkle'+side,[(sign*.10,.018,z,.034,.038) for z in [.071,.10,.123]],32,foot,skin,0)
        Loft('Mesh_CivilianWomanClothShoe'+side,[(sign*.10,-.042,.010,.051,.113),(sign*.10,-.043,.023,.052,.113),(sign*.10,-.041,.043,.050,.108),(sign*.10,-.033,.064,.045,.093),(sign*.10,.017,.083,.036,.050)],48,foot,scarf,.0004)
        for layer in range(3):
            path=[(sign*.10+.052*math.cos(a),-.043+.114*math.sin(a),.012+layer*.0035) for a in [i*2*math.pi/64 for i in range(65)]]
            Tube('Mesh_CivilianWomanShoeSole'+side+str(layer),path,.0019,sole,foot,6)
        opening=[(sign*.10+.036*math.cos(a),.017+.049*math.sin(a),.081) for a in [i*2*math.pi/48 for i in range(49)]]
        Tube('Mesh_CivilianWomanShoeOpening'+side,opening,.002,scarf,foot,6)
        StitchPath('Mesh_CivilianWomanShoeStitch'+side,[(sign*.10,-.142,.047),(sign*.10,-.10,.067),(sign*.10,-.045,.078)],foot,sole,.004)

def Patch(name,cx,cz,width,height,fn,weights,mat):
    points=[];faces=[];nx=13;nz=15
    for j in range(nz):
        v=j/(nz-1);z=cz+(v-.5)*height
        for i in range(nx):
            u=i/(nx-1);x=cx+(u-.5)*width+.0009*math.sin(v*31);points.append(fn(x,z,u,v))
    for j in range(nz-1):
        for i in range(nx-1):a=j*nx+i;faces.append((a,a+1,a+nx+1,a+nx))
    Surface('Mesh_CivilianWoman'+name,points,faces,weights,mat,.001)
    edge=[*range(nx),*[j*nx+nx-1 for j in range(1,nz)],*range(nz*nx-2,(nz-1)*nx-1,-1),*[j*nx for j in range(nz-2,0,-1)]]
    border=[Vector(points[i])+Vector((0,-.0007,0)) for i in edge];border.append(border[0]);StitchPath('Mesh_CivilianWoman'+name+'Stitch',border,weights,spacing=.0042)

def Repairs():
    Patch('HemPatch',.093,.986,.069,.075,lambda x,z,u,v:(x,FrontSurface(x,z)-.006-.001*math.sin(u*18+v*10),z),TorsoWeights,repair)
    Patch('SideHemPatch',-.15,1.018,.051,.064,lambda x,z,u,v:(x,FrontSurface(x,z)-.006,z),TorsoWeights,repair)
    for side,sign in [('L',1),('R',-1)]:
        Patch('KneePatch'+side,sign*.105,.469,.060,.12,lambda x,z,u,v,s=sign:(x,.018-.083*math.sqrt(max(.12,1-((x-s*.1)/.079)**2))-.005,z),lambda p,s=side:LegWeights(p,s),pantsPatch)
        # Elbow patch wraps around the outside rather than floating as a flat plate.
        points=[];faces=[];nr=16;na=13
        for j in range(nr):
            z=1.063+j*.115/(nr-1)
            for i in range(na):
                a=-.7+1.8*i/(na-1);points.append((sign*(.241+.055*math.cos(a)),.027+.061*math.sin(a),z))
        for j in range(nr-1):
            for i in range(na-1):a=j*na+i;faces.append((a,a+1,a+na+1,a+na))
        Surface('Mesh_CivilianWomanElbowPatch'+side,points,faces,lambda p,s=side:ArmWeights(p,s),repair,.001)
        edge=[*range(na),*[j*na+na-1 for j in range(1,nr)],*range(nr*na-2,(nr-1)*na-1,-1),*[j*na for j in range(nr-2,0,-1)]]
        border=[points[i] for i in edge];border.append(border[0]);StitchPath('Mesh_CivilianWomanElbowStitch'+side,border,lambda p,s=side:ArmWeights(p,s),spacing=.0045)
        for k,z in enumerate([.919,.932]):
            path=[(sign*.277+.044*math.cos(a),.027+.052*math.sin(a),z) for a in [i*2*math.pi/64 for i in range(65)]]
            StitchPath('Mesh_CivilianWomanCuffStitch'+side+str(k),path,lambda p,s=side:ArmWeights(p,s),spacing=.004)
    path=[]
    for i in range(129):
        a=i*2*math.pi/128;path.append((.189*math.cos(a),.006+.128*math.sin(a),.856+.0015*math.sin(29*a)))
    StitchPath('Mesh_CivilianWomanHemStitch',path,TorsoWeights,spacing=.004)
    # Irregular tiny frayed strips around the worn hem, not repeated large teeth.
    verts=[];faces=[]
    for j in range(132):
        a=2*math.pi*j/132;c=Vector((.189*math.cos(a),.006+.128*math.sin(a),.852));t=Vector((-.0006*math.sin(a),.0006*math.cos(a),0));b=len(verts)
        verts.extend([c-t,c+t,c+Vector((.0003,0,-.002-.003*(.5+.5*math.sin(j*8.12))))]);faces.append((b,b+1,b+2))
    Mesh('Mesh_CivilianWomanHemFray',verts,faces,TorsoWeights,thread)

def Headscarf():
    head={'Bip001 Head':1};points=[];faces=[];na=96;nr=38
    for j in range(nr):
        t=j/(nr-1)
        for i in range(na):
            a=2*math.pi*i/na;front=.5+.5*math.cos(a);bottom=1.630+.137*front**2
            z=Mix(bottom,1.831,t);r=math.cos(t*math.pi/2)**.24
            fold=.0025*math.sin(a*9+t*13)+.0014*math.sin(a*17-t*9)
            points.append(((.103*r+fold*r)*math.sin(a),.005-(.123*r+fold*r)*math.cos(a)-.017*front**4*(1-Smooth(.35,.7,t)),z))
    for j in range(nr-1):
        for i in range(na):faces.append((j*na+i,j*na+(i+1)%na,(j+1)*na+(i+1)%na,(j+1)*na+i))
    Surface('Mesh_CivilianWomanHeadscarf',points,faces,head,scarf,.0015)
    StitchPath('Mesh_CivilianWomanHeadscarfHem',[points[i] for i in range(na)]+[points[0]],head,thread,.0045)
    Ellipsoid('Mesh_CivilianWomanScarfKnot',(0,.117,1.643),(.031,.026,.030),scarf,head)
    for sign in [-1,1]:
        pts=[];faces=[];nx=9;nz=30
        for j in range(nz):
            t=j/(nz-1);z=1.643-t*(.175 if sign>0 else .146);cx=sign*(.009+.038*t);cy=.135+.012*math.sin(t*5)
            for i in range(nx):
                u=i/(nx-1);width=.036*(1-.35*t);pts.append((cx+(u-.5)*width,cy+.010*math.sin(u*math.pi*3+t*5),z-.008*math.sin(u*math.pi)*t))
        for j in range(nz-1):
            for i in range(nx-1):a=j*nx+i;faces.append((a,a+1,a+nx+1,a+nx))
        Surface('Mesh_CivilianWomanScarfTail'+str(sign),pts,faces,head,scarf,.0018)
    # A few gray strands emerging naturally under the front edge.
    for j in range(18):
        x=-.064+j*.128/17;path=[]
        for k in range(9):
            t=k/8;xx=x*(1+.12*t);path.append((xx,-.100*math.sqrt(max(.1,1-(xx/.097)**2))-.003,1.764-t*(.013+.010*abs(math.sin(j*2.3)))))
        Tube('Mesh_CivilianWomanHair'+str(j),path,.00038,hair,head,4)

def Backpack():
    weights={'Bip001 Spine1':.3,'Bip001 Spine2':.7};points=[];faces=[];na=72;nr=44
    for j in range(nr):
        t=j/(nr-1);z=.995+t*.40;rows=[(.995,.075,.026),(1.025,.125,.063),(1.10,.143,.079),(1.19,.129,.075),(1.28,.099,.061),(1.355,.038,.033),(1.395,.025,.016)];rx,ry=rows[-1][1:]
        for (a,x,y),(b,xx,yy) in zip(rows,rows[1:]):
            if a<=z<=b:rx=Mix(x,xx,(z-a)/(b-a));ry=Mix(y,yy,(z-a)/(b-a));break
        for i in range(na):
            a=2*math.pi*i/na;pleat=(.003+.006*t*t)*math.sin(a*13+t*4)+.002*math.sin(a*23-t*9)
            points.append(((rx+pleat)*math.cos(a),.173+(ry+pleat*.7)*math.sin(a),z+.003*math.sin(a*5)))
    for j in range(nr-1):
        for i in range(na):faces.append((j*na+i,j*na+(i+1)%na,(j+1)*na+(i+1)%na,(j+1)*na+i))
    faces.extend([tuple(reversed(range(na))),tuple((nr-1)*na+i for i in range(na))]);Mesh('Mesh_CivilianWomanBackpack',points,faces,weights,canvas)
    for sign in [-1,1]:
        path=[(sign*.111,.195,1.06),(sign*.133,.148,1.24),(sign*.116,.087,1.43),(sign*.12,.031,1.496),(sign*.119,-.041,1.48),(sign*.134,-.089,1.386),(sign*.150,-.077,1.26),(sign*.174,-.028,1.17),(sign*.189,.01,1.135),(sign*.174,.091,1.115),(sign*.111,.16,1.06)]
        dense=PathResample(path,9);Strap('Mesh_CivilianWomanBackpackStrap'+str(sign),dense,.022,canvas,TorsoWeights)
        for edge in [-1,1]:StitchPath('Mesh_CivilianWomanBackpackStrapStitch'+str(sign)+str(edge),[Vector(p)+Vector((edge*.008,-.001,0)) for p in dense],TorsoWeights,thread,.005)
    # Gathered mouth, fabric knot, bow loops, and two wrinkled hanging ties.
    Ellipsoid('Mesh_CivilianWomanBackpackKnot',(0,.210,1.374),(.027,.020,.023),canvas,weights)
    for sign in [-1,1]:
        path=[]
        for i in range(41):
            a=i*2*math.pi/40;path.append((sign*(.016+.042*(1-math.cos(a))*.5),.207+.016*math.sin(a),1.386+.030*math.sin(a)))
        Panel('Mesh_CivilianWomanBackpackKnotFold'+str(sign),[(sign*.010,.222,1.378),(sign*.029,.214,1.416),(sign*.071,.224,1.396),(sign*.045,.237,1.376)],.002,weights,canvas)
        pts=[];faces=[]
        for j in range(27):
            t=j/26
            for i in range(7):
                u=i/6;pts.append((sign*(.009+.045*t)+(u-.5)*.024,.247+.023*math.sin(t*2.5)+.004*math.sin(u*14+t*4),1.37-.205*t))
        for j in range(26):
            for i in range(6):a=j*7+i;faces.append((a,a+1,a+8,a+7))
        Surface('Mesh_CivilianWomanBackpackTie'+str(sign),pts,faces,weights,canvas,.002)
    seam=[(.137*math.sin(a),.173+.077*math.cos(a),1.068+.009*math.sin(3*a)) for a in [i*2*math.pi/80 for i in range(81)]]
    # Sack is seamed down the sides; no floating circular seam.


def ConformDetails():
    # Snap attachments against the evaluated relaxed cloth. The resulting points
    # return through the same inverse skin blend; no pose is applied to the bind.
    bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();trees={}
    for name in ['Tunic','TrousersL','TrousersR','Backpack']:
        ob=bpy.data.objects['Mesh_CivilianWoman'+name];ev=ob.evaluated_get(dg);me=ev.to_mesh()
        verts=[ev.matrix_world@v.co for v in me.vertices];trees[name]=BVHTree.FromPolygons(verts,[list(p.vertices) for p in me.polygons]);ev.to_mesh_clear()
    for ob in list(bpy.context.scene.objects):
        if ob.type!='MESH':continue
        name=ob.name;patch=any(tag in name for tag in ['HemPatch','KneePatch','ElbowPatch','ElbowStitch','Placket','BackpackStrap','BackpackTie'])
        if not patch:continue
        side='L' if name.endswith('L') or 'KneePatchL' in name else 'R';target='Backpack' if 'BackpackTie' in name else ('Trousers'+side if 'Knee' in name else 'Tunic')
        for vertex in ob.data.vertices:
            w={ob.vertex_groups[g.group].name:g.weight for g in vertex.groups};mat=BlendMatrix(w);p=mat@vertex.co
            if 'Elbow' in name:
                sign=1 if p.x>0 else -1;origin=Vector((sign*.7,p.y,p.z));direction=Vector((-sign,0,0))
            elif 'BackpackStrap' in name and p.z<1.25 and abs(p.y)<.065:
                sign=1 if p.x>0 else -1;origin=Vector((sign*.189,p.y,p.z));direction=Vector((-sign,0,0))
            elif 'BackpackStrap' in name and p.z>1.44:
                origin=Vector((p.x,p.y,1.9));direction=Vector((0,0,-1))
            else:
                sign=-1 if p.y<.03 else 1;origin=Vector((p.x,sign*.7,p.z));direction=Vector((0,-sign,0))
            hit,normal,_,_=trees[target].ray_cast(origin,direction)
            if hit is not None:
                offset=.008 if 'BackpackStrap' in name else (.004 if 'Stitch' not in name else .005)
                vertex.co=mat.inverted()@(hit-direction*offset)
    # Save native construction statistics to support the review and export.
    # The upper trouser volume must remain beneath the tunic in the reference pose.
    for side in ['L','R']:
        ob=bpy.data.objects['Mesh_CivilianWomanTrousers'+side]
        for vertex in ob.data.vertices:
            w={ob.vertex_groups[g.group].name:g.weight for g in vertex.groups};mat=BlendMatrix(w);p=mat@vertex.co
            if p.z<.83:continue
            for sign in [-1,1]:
                hit,_,_,_=trees['Tunic'].ray_cast(Vector((p.x,sign*.7,max(.86,p.z))),Vector((0,-sign,0)))
                if hit is not None:
                    if sign>0:p.y=min(p.y,hit.y-.016)
                    else:p.y=max(p.y,hit.y+.016)
            vertex.co=mat.inverted()@p
    # Slightly lift each frog toggle without flattening its cross-section.
    for ob in bpy.context.scene.objects:
        if ob.type=='MESH' and 'Frog' in ob.name:
            for vertex in ob.data.vertices:
                w={ob.vertex_groups[g.group].name:g.weight for g in vertex.groups};mat=BlendMatrix(w);p=mat@vertex.co;p.y-=.004;vertex.co=mat.inverted()@p
    hand=bpy.data.objects['Mesh_CivilianWomanHands'];m=hand.data.materials[0];bs=m.node_tree.nodes.get('Principled BSDF')
    sock=bs.inputs['Base Color'].links[0].from_socket;hs=m.node_tree.nodes.new('ShaderNodeHueSaturation');hs.inputs['Saturation'].default_value=.65;hs.inputs['Value'].default_value=.72
    m.node_tree.links.new(sock,hs.inputs['Color']);m.node_tree.links.new(hs.outputs[0],bs.inputs['Base Color'])
    bpy.context.scene['ReferenceModelBuild']='CivilianWoman08 2026-09-29 revision 3'

Clear();rig=ImportSource();bodyBind={b.name:[list(row) for row in b.matrix_local] for b in rig.data.bones if not b.name.startswith('Face_')}
SetRelaxed();skinMatrices=SkinMatrices()
images={v:bpy.data.images.load(str(source/f),check_existing=True) for v,f in [('Front','正面.png'),('Side','侧面.png'),('Back','背面.png')]}
for im in images.values():im.pack()
atlasPath=out/'References/Texture_CivilianWomanTextileAtlas.png';assert atlasPath.exists(),atlasPath
atlas=bpy.data.images.load(str(atlasPath),check_existing=True);atlas.pack()
cloth=Cloth('IndigoCotton',(.040,.048,.058),(0,.5),.50);pants=Cloth('DustyTrousers',(.079,.069,.056),(.5,.5),.45)
scarf=Cloth('CharcoalCotton',(.026,.026,.028),(0,0),.24);canvas=Cloth('SackCanvas',(.142,.114,.081),(.5,0),.25)
repair=Cloth('IndigoRepair',(.12,.12,.105),(.5,.5),.25);pantsPatch=Cloth('TrouserRepair',(.058,.065,.067),(0,.5),.23)
thread=BasicMaterial('Material_CivilianWomanThread',(.24,.215,.174),.95);sole=BasicMaterial('Material_CivilianWomanSole',(.19,.17,.137),.96)
skin=BasicMaterial('Material_CivilianWomanAnkleSkin',(.30,.19,.124),.76);hair=BasicMaterial('Material_CivilianWomanHair',(.044,.039,.034),.79);headMat=HeadMaterial()
SourceSkin();Jacket();Pants();Repairs();Headscarf();Backpack();ConformDetails();SetupStudio();SetRelaxed()
rig['SkeletonContract']='TengxianHumanoidV1';rig['SourceModel']='Model_TengxianNra05Facial.glb';rig['SourceBodyBind']=json.dumps(bodyBind)
rig['ReferenceCharacter']='Middle-aged civilian woman 08';rig['ReferencePose']='Relaxed; identical shared T bind retained'
bpy.context.scene['BlenderMcpTask']='CivilianWomanReference';PrepareEditor()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'Model_CivilianWomanReference.blend'))
for view in cfg.get('render',['Front','Side','Back']):Render(view)
print('Civilian woman build complete',str(out/'Model_CivilianWomanReference.blend'))
