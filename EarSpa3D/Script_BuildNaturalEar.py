"""BlenderMCP 自建自然耳道与耵聍。先加载原独立工程，再在新的 NaturalEar 工程执行 BuildNatural()。
过程材质由可重建的像素函数生成；不是照片或外部模型。纹理打包进 GLB，原文件留 Blender 源目录。
"""
import bpy, math, random, json, zlib, struct
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
BASE={'__file__':str(ROOT/'Script_BuildImmersiveEar.py')}
exec(compile((ROOT/'Script_BuildImmersiveEar.py').read_text(encoding='utf-8'),str(ROOT/'Script_BuildImmersiveEar.py'),'exec'),BASE)
Mesh,Mat,V,Apply,Ellipsoid=[BASE[k] for k in ['Mesh','Mat','V','Apply','Ellipsoid']]
BLEND=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/NaturalEar/Model_NaturalEar.blend')

def Remove(names):
    for name in names:
        obj=bpy.data.objects.get(name)
        if obj:bpy.data.objects.remove(obj,do_unlink=True)

def Png(name,pixels):
    folder=BLEND.parent/'Textures';folder.mkdir(parents=True,exist_ok=True)
    path=folder/(name+'.png')
    data=np.uint8(np.clip(pixels,0,1)*255);h,w,c=data.shape
    def Chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    raw=b''.join(b'\0'+data[i].tobytes() for i in range(h))
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+Chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+Chunk(b'IDAT',zlib.compress(raw,7))+Chunk(b'IEND',b''))
    image=bpy.data.images.load(str(path),check_existing=False);image.pack();return image

def Noise(n,size,seed):
    rng=np.random.default_rng(seed);grid=rng.random((size+1,size+1))*2-1
    yy,xx=np.mgrid[0:n,0:n]*size/n;ix=xx.astype(int);iy=yy.astype(int);tx=xx-ix;ty=yy-iy
    tx=tx*tx*(3-2*tx);ty=ty*ty*(3-2*ty)
    return (grid[iy,ix]*(1-tx)+grid[iy,ix+1]*tx)*(1-ty)+(grid[iy+1,ix]*(1-tx)+grid[iy+1,ix+1]*tx)*ty

def Maps(name,base,isSkin=False,rough=.5):
    n=1024 if isSkin else 512
    vv,uu=np.mgrid[0:n,0:n]/n
    wave=Noise(n,18,417)
    fine=Noise(n,190,815)
    tiny=np.random.default_rng(21 if isSkin else len(name)*19).normal(0,.7,(n,n))
    height=wave*.045+fine*.018+tiny*.003
    color=np.tile(np.array(base),(n,n,1))+(wave*.028+fine*.007)[...,None]
    if isSkin:
        # 细小皮纹不组成整圈等距管纹；深部更薄、更平滑。
        for j in range(2 if name=='NaturalPinna' else 5):
            line=(j+.6)/10+.022*np.sin(vv*9+j)+.007*np.sin(vv*51+j*2)
            crease=np.exp(-((uu-line)/.0016)**2)*(.4+.6*np.sin(vv*12+j)**2)
            height-=crease*.025
            color-=crease[...,None]*np.array([.006,.009,.008])
        # 低对比的皮下毛细血管，限于局部，避免染成红色管腔。
        for j in range(5):
            line=.12+j*.18+.024*np.sin(vv*7+j)+.006*np.sin(vv*26+j)
            vein=np.exp(-((uu-line)/.0018)**2)*np.exp(-((vv-(.25+j*.1))/.17)**2)
            color+=vein[...,None]*np.array([.018,-.028,-.023])
        rng=random.Random(818)
        for i in range(450):
            x=rng.randrange(n);y=rng.randrange(int(n*.36));r=rng.uniform(1.1,2.4)
            x0,x1=max(0,x-7),min(n,x+8);y0,y1=max(0,y-7),min(n,y+8)
            yy,xx=np.mgrid[y0:y1,x0:x1];pore=np.exp(-((xx-x)**2+(yy-y)**2)/(r*r))
            height[y0:y1,x0:x1]-=pore*.24
            color[y0:y1,x0:x1]-=pore[...,None]*.025
        height*=1-vv*.7
    else:
        # 蜡质的叠层纹、干裂细缝与斑驳，不采用光滑糖果色。
        layers=Noise(n,42,122)
        cracks=np.exp(-(Noise(n,22,624)/.033)**2)*np.maximum(0,Noise(n,7,818))
        height+=layers*.07-cracks*.18
        color+=(layers*.032-cracks*.05)[...,None]
        color+=np.sin(uu*13+vv*17)[...,None]*np.array([.045,.027,.012])
    albedo=Png('Texture_'+name+'Color',color)
    dy,dx=np.gradient(height);scale=22 if isSkin else 18
    normal=np.dstack((-dx*scale,dy*scale,np.ones_like(dx)));normal/=np.linalg.norm(normal,axis=2)[...,None]
    normal=Png('Texture_'+name+'Normal',normal*.5+.5);normal.colorspace_settings.name='Non-Color'
    roughness=np.clip(rough+wave*.10+fine*.018,.2,.9)
    roughmap=Png('Texture_'+name+'Roughness',np.dstack((np.ones_like(uu),roughness,np.zeros_like(uu))));roughmap.colorspace_settings.name='Non-Color'
    return albedo,normal,roughmap

def SurfaceMaterial(name,base,isSkin=False,rough=.5):
    mat=Mat('Material_'+name,(1,1,1),rough,coat=.09 if isSkin else .03)
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
    for node in list(nodes):
        if node.type not in ['BSDF_PRINCIPLED','OUTPUT_MATERIAL']:nodes.remove(node)
    images=Maps(name,base,isSkin,rough)
    tex=nodes.new('ShaderNodeTexImage');tex.image=images[0];links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    texn=nodes.new('ShaderNodeTexImage');texn.image=images[1]
    normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.65 if isSkin else .75
    links.new(texn.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
    texr=nodes.new('ShaderNodeTexImage');texr.image=images[2]
    sep=nodes.new('ShaderNodeSeparateColor');links.new(texr.outputs['Color'],sep.inputs['Color']);links.new(sep.outputs['Green'],bsdf.inputs['Roughness'])
    return mat

def Canal(hairCount=58,hairColor=(.08,.047,.025),hairRadius=.009):
    Remove(['Model_Canal','Model_Eardrum','Model_CanalHair'])
    mat=SurfaceMaterial('NaturalCanal',(.66,.435,.345),True,.48)
    profile=json.loads((ROOT/'Data_CanalProfile.json').read_text())
    verts,faces=[],[];cols=96;rows=len(profile)
    radii=np.array([f['radii'] for f in profile])
    smoothed=np.array([radii[max(0,i-3):min(rows,i+4)].mean(axis=0) for i in range(rows)])
    for i,f in enumerate(profile):
        for j in range(cols+1):
            angle=j/cols*math.tau;k=(j/cols*64)%64;lo=int(k)
            radius=smoothed[i,lo]*(1-(k-lo))+smoothed[i,(lo+1)%64]*(k-lo)
            # 极小几何皮纹。宽度、中心线与厚度保持解剖采样，触点再向导出表面投影。
            radius+=.012*math.sin(angle*11+i*.18)*math.sin(i*.41+angle*3)
            direction=np.array(f['up'])*math.cos(angle)+np.array(f['right'])*math.sin(angle)
            verts.append((np.array(f['center'])+radius*direction).tolist())
            if i<rows-1 and j<cols:
                k=i*(cols+1)+j;faces.append((k,k+cols+1,k+cols+2,k+1))
    obj=Mesh('Model_Canal',verts,faces,mat)
    uv=obj.data.uv_layers.new(name='UVMap')
    for poly in obj.data.polygons:
        for loop in poly.loop_indices:
            vid=obj.data.loops[loop].vertex_index;uv.data[loop].uv=(vid%(cols+1)/cols,vid//(cols+1)/(rows-1))
    import bmesh
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001);bm.to_mesh(obj.data);bm.free()
    solid=obj.modifiers.new('CanalThickness','SOLIDIFY');solid.thickness=.7;solid.offset=-1;Apply(obj,solid)
    # 鼓膜是一张微凹、略倾斜的椭圆膜，位于管腔末端而不是白色球体。
    f=profile[-3];center=np.array(f['center']);up=np.array(f['up']);right=np.array(f['right']);tangent=np.cross(right,up)
    verts=[(center+tangent*.35).tolist()];faces=[]
    for ring in range(1,13):
        r=ring/12
        for j in range(64):
            a=j/64*math.tau
            verts.append((center+up*(math.cos(a)*4.3*r)+right*(math.sin(a)*4.3*r)+tangent*(.35*(1-r*r)+math.sin(a)*r*.6)).tolist())
    for j in range(64):faces.append((0,1+j,1+(j+1)%64))
    for ring in range(11):
        for j in range(64):
            k=1+ring*64+j;n=1+ring*64+(j+1)%64;faces.append((k,k+64,n+64,n))
    drum=Mesh('Model_Eardrum',verts,faces,Mat('Material_NaturalMembrane',(.27,.235,.21),.3,coat=.25))
    # 耳毛只在外侧软骨段，稀疏、很细并向耳口倾斜；合并一个 mesh。
    rng=random.Random(905);hv=[];hf=[]
    for hair in range(hairCount):
        depth=rng.randint(2,23);f=profile[depth];angle=rng.random()*math.tau
        outward=np.array(f['up'])*math.cos(angle)+np.array(f['right'])*math.sin(angle)
        radius=smoothed[depth,int(angle/math.tau*64)%64]
        base=np.array(f['center'])+outward*(radius-.006)
        toward=np.array(profile[max(0,depth-1)]['center'])-np.array(f['center']);toward/=np.linalg.norm(toward)
        length=rng.uniform(.24,.72);side=np.cross(outward,toward);start=len(hv)
        for k in range(6):
            t=k/5;p=base-outward*(math.sin(t*1.3)*length*.65)+toward*(t*length*.65)+side*(math.sin(t*2.4)*length*.12)
            r=hairRadius*(1-t)+.0007
            for j in range(4):
                a=j/4*math.tau;hv.append((p+r*(side*math.cos(a)+outward*math.sin(a))).tolist())
                if k<5:
                    n=start+k*4+j;m=start+k*4+(j+1)%4;hf.append((n,m,m+4,n+4))
    Mesh('Model_CanalHair',hv,hf,Mat('Material_FineHair',hairColor,.82))
    print('NATURAL_CANAL',len(verts),'drum vertices; hairs',hairCount)

def Wax():
    Remove(['Model_WaxDry','Model_WaxWet','Model_WaxFirm'])
    for idx,(name,col,rough) in enumerate([('Dry',(.60,.45,.265),.78),('Wet',(.39,.225,.095),.4),('Firm',(.45,.29,.135),.61)]):
        mat=SurfaceMaterial('NaturalWax'+name,col,False,rough)
        if name=='Dry':
            verts=[];faces=[];cols=48;rows=11
            for side in range(2):
                for i in range(rows):
                    r=i/(rows-1)
                    for j in range(cols):
                        a=j/cols*math.tau
                        edge=1+.14*math.sin(3*a+.4)+.065*math.sin(7*a+1.2)+.035*math.sin(13*a)
                        x=math.cos(a)*r*.86*edge;y=math.sin(a)*r*1.04*edge
                        curl=.16*max(0,x+.25)**2+.085*math.sin(a*3+r*5)*r*r
                        z=-.16+curl+(0 if side else .06+.10*(1-r*r))
                        z+=.012*math.sin(y*30+x*8)*r
                        verts.append((x,y,z))
                        if i<rows-1:
                            k=side*rows*cols+i*cols+j;n=side*rows*cols+i*cols+(j+1)%cols
                            face=(k,n,n+cols,k+cols);faces.append(face if side==0 else face[::-1])
            for j in range(cols):
                k=(rows-1)*cols+j;n=(rows-1)*cols+(j+1)%cols
                faces.append((k,k+rows*cols,n+rows*cols,n))
            obj=Mesh('Model_WaxDry',verts,faces,mat)
            uv=obj.data.uv_layers.new(name='UVMap')
            for p in obj.data.polygons:
                for l in p.loop_indices:
                    v=verts[obj.data.loops[l].vertex_index];uv.data[l].uv=(v[0]/2.3+.5,v[1]/2.6+.5)
        else:
            obj=Ellipsoid('Model_Wax'+name,(0,0,0),(.77,.93,.36 if name=='Wet' else .28),mat,48,24)
            for v in obj.data.vertices:
                x,y,z=v.co.x,v.co.z,-v.co.y;a=math.atan2(y,x)
                radial=1+.18*math.sin(a*3+idx)+.08*math.sin(a*5-1)+.04*math.cos(a*9)
                x*=radial;y*=radial
                z=max(-.2,z+.065*math.sin(x*12+y*4)*math.cos(y*10)-.035*math.sin(y*23+x*7))
                v.co=V((x,y,z))
            obj.data.update()
    print('NATURAL_WAX_BUILT')

def BuildNatural():
    assert bpy.data.filepath.replace('\\','/').endswith('/EarSpa3D/NaturalEar/Model_NaturalEar.blend')
    Canal();Wax();Outer();ExtraTools()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'Models'/'Model_ImmersiveEar.glb'),export_format='GLB',export_yup=True,export_apply=True,export_cameras=False,export_lights=False)
    print('EXPORTED_NATURAL',BLEND)

def Outer():
    Remove(['Model_OuterEar'])
    mat=SurfaceMaterial('NaturalPinna',(.79,.585,.49),True,.63)
    verts=[];faces=[];cols=96;rows=56
    profile=json.loads((ROOT/'Data_CanalProfile.json').read_text());first=profile[0].copy();first['radii']=np.array([f['radii'] for f in profile[:4]]).mean(axis=0)
    stem=[(-4,-12),(-8,-8),(-10,-1),(-10,8),(-7,16),(-6,21)]
    branch=[(-9,8),(-5,10),(-1,13),(1,17)]
    def Distance(x,y,path):
        best=1000
        for a,b in zip(path,path[1:]):
            dx,dy=b[0]-a[0],b[1]-a[1];t=max(0,min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)))
            best=min(best,math.hypot(x-a[0]-t*dx,y-a[1]-t*dy))
        return best
    for i in range(rows+1):
        r=i/rows
        for j in range(cols+1):
            a=j/cols*math.tau;s=math.cos(a)
            outerX=-5-14.5*math.sin(a)*(1+.10*s)
            outerY=3+27*s
            # 耳垂变窄，前侧耳轮向头部收束，保持实拍中的纵长轮廓。
            if s<-.6:outerX=-2+(outerX+2)*(1-(-s-.6)*.55)
            rk=(j/cols*64)%64;ri=int(rk);radius=first['radii'][ri]*(1-(rk-ri))+first['radii'][(ri+1)%64]*(rk-ri)
            radius+=.012*math.sin(a*11)*math.sin(a*3)
            hole=np.array(first['center'])+radius*(np.array(first['up'])*math.cos(a)+np.array(first['right'])*math.sin(a))
            holeX,holeY=hole[:2]
            t=r**.82;x=holeX*(1-t)+outerX*t;y=holeY*(1-t)+outerY*t
            helix=4.1*math.exp(-((r-.88)/.10)**2)
            anti=2.6*math.exp(-(Distance(x,y,stem)/1.7)**2)
            crus=2.0*math.exp(-(Distance(x,y,branch)/1.25)**2)
            tragus=3.0*math.exp(-((x-3.8)/1.6)**2-((y+.7)/2.6)**2)
            antiTragus=2.0*math.exp(-((x+3.3)/2.2)**2-((y+7.7)/1.4)**2)
            lobule=1.25*math.exp(-((x+2)/6.0)**2-((y+20)/4.8)**2)
            z=hole[2]*(1-r)**3-.8*r-helix-(anti+crus+tragus+antiTragus+lobule)*min(1,r/.2)
            z+=.028*math.sin(x*2.3+y*.8)*math.sin(y*1.7)
            verts.append((x,y,z))
            if i<rows and j<cols:
                k=i*(cols+1)+j;faces.append((k,k+1,k+cols+2,k+cols+1))
    obj=Mesh('Model_OuterEar',verts,faces,mat)
    uv=obj.data.uv_layers.new(name='UVMap')
    for poly in obj.data.polygons:
        for l in poly.loop_indices:
            p=verts[obj.data.loops[l].vertex_index];uv.data[l].uv=((p[0]+21)/35,(p[1]+25)/56)
    solid=obj.modifiers.new('SoftTissueThickness','SOLIDIFY');solid.thickness=1.05;solid.offset=-1;Apply(obj,solid)
    import bmesh
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    print('REFERENCE_PINNA_BUILT',len(verts))

def ExtraTools():
    Remove(['Model_Brush','Model_BrushGrip','Model_Suction'])
    wood=Mat('Material_BrushWood',(.26,.13,.055),.5)
    fibre=Mat('Material_SoftBristle',(.54,.36,.18),.82)
    BASE['Tube']('Model_BrushGrip',[(0,1.6,0),(0,7,0),(0,18,0)],.14,wood)
    verts=[];faces=[];rng=random.Random(91)
    for i in range(44):
        a=i*2.399;r=math.sqrt((i+.5)/44)*.53;x=math.cos(a)*r;z=math.sin(a)*r
        start=len(verts)
        for j in range(4):
            t=j/3;y=.1+t*1.75;rr=.014*(1-t)+.01
            for k in range(4):
                aa=k/4*math.tau;verts.append((x*(1-t*.5)+math.cos(aa)*rr,y,z*(1-t*.5)+math.sin(aa)*rr))
                if j<3:
                    n=start+j*4+k;m=start+j*4+(k+1)%4;faces.append((n,m,m+4,n+4))
    Mesh('Model_Brush',verts,faces,fibre)
    steel=Mat('Material_SuctionSteel',(.46,.54,.56),.22,.75)
    verts=[];faces=[]
    for layer,radius in enumerate([.5,.42]):
        for j in range(12):
            y=j*1.5
            for k in range(20):
                a=k/20*math.tau;verts.append((math.cos(a)*radius,y,math.sin(a)*radius))
                if j<11:
                    n=layer*240+j*20+k;m=layer*240+j*20+(k+1)%20
                    faces.append((n,m,m+20,n+20) if not layer else (n,n+20,m+20,m))
    for k in range(20):faces.append((k,(k+1)%20,(k+1)%20+240,k+240))
    Mesh('Model_Suction',verts,faces,steel)
    print('EXTRA_TOOLS_BUILT')
