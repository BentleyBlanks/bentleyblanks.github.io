"""Second-pass clothing construction for Luo. Executed in the builder namespace.

No garment or equipment material samples the dressed turnaround. Silhouette,
seams, pockets and folds are geometry; woven cotton is a continuous 3D material.
The original character reference is used only for the head and design comparison.
"""

def ClothMaterial(name,color,scale=1,wear=.22):
    m=BasicMaterial(name,color,.94);nt=m.node_tree;n=nt.nodes;l=nt.links;bs=n.get('Principled BSDF')
    coord=n.new('ShaderNodeTexCoord')
    broad=n.new('ShaderNodeTexNoise');broad.inputs['Scale'].default_value=14*scale;broad.inputs['Detail'].default_value=4;broad.inputs['Roughness'].default_value=.72;l.new(coord.outputs['Object'],broad.inputs['Vector'])
    small=n.new('ShaderNodeTexNoise');small.inputs['Scale'].default_value=170*scale;small.inputs['Detail'].default_value=2;l.new(coord.outputs['Object'],small.inputs['Vector'])
    mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=.25;l.new(broad.outputs['Fac'],mix.inputs[1]);l.new(small.outputs['Fac'],mix.inputs[2])
    ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.27;ramp.color_ramp.elements[1].position=.61
    ramp.color_ramp.elements[0].color=(*(c*(1-wear) for c in color),1)
    ramp.color_ramp.elements[1].color=(*(c*(1+wear) for c in color),1);l.new(mix.outputs[0],ramp.inputs[0]);l.new(ramp.outputs[0],bs.inputs['Base Color'])
    warp=n.new('ShaderNodeTexWave');warp.wave_type='BANDS';warp.bands_direction='X';warp.inputs['Scale'].default_value=630*scale;warp.inputs['Distortion'].default_value=1.4;warp.inputs['Detail Scale'].default_value=2
    weft=n.new('ShaderNodeTexWave');weft.wave_type='BANDS';weft.bands_direction='Z';weft.inputs['Scale'].default_value=660*scale;weft.inputs['Distortion'].default_value=1.1
    for wave in [warp,weft]:l.new(coord.outputs['Object'],wave.inputs['Vector'])
    weave=n.new('ShaderNodeMixRGB');weave.blend_type='MULTIPLY';weave.inputs[0].default_value=1;l.new(warp.outputs[0],weave.inputs[1]);l.new(weft.outputs[0],weave.inputs[2])
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.34;bump.inputs['Distance'].default_value=.00028;l.new(weave.outputs[0],bump.inputs['Height']);l.new(bump.outputs[0],bs.inputs['Normal'])
    atlasPath=out/'References/Texture_LuoTextileAtlas.png'
    if atlasPath.exists():
        atlas=bpy.data.images.load(str(atlasPath),check_existing=True);atlas.pack()
        if 'Blanket' in name or 'Shoe' in name:offset=(0,0)
        elif any(tag in name for tag in ['Canvas','Repair','Canteen','Scabbard']):offset=(.5,.5)
        elif any(tag in name for tag in ['Puttee','Hemp','Stitch']):offset=(.5,0)
        else:offset=(0,.5)
        sep=n.new('ShaderNodeSeparateXYZ');l.new(coord.outputs['Object'],sep.inputs[0]);textures=[]
        for first,second in [(0,2),(1,2),(0,1)]:
            combine=n.new('ShaderNodeCombineXYZ')
            for target,sourceIndex in enumerate([first,second]):
                mul=n.new('ShaderNodeMath');mul.operation='MULTIPLY';mul.inputs[1].default_value=14*scale;l.new(sep.outputs[sourceIndex],mul.inputs[0])
                fract=n.new('ShaderNodeMath');fract.operation='FRACT';l.new(mul.outputs[0],fract.inputs[0])
                span=n.new('ShaderNodeMath');span.operation='MULTIPLY_ADD';span.inputs[1].default_value=.494;span.inputs[2].default_value=offset[target]+.003;l.new(fract.outputs[0],span.inputs[0]);l.new(span.outputs[0],combine.inputs[target])
            tex=n.new('ShaderNodeTexImage');tex.image=atlas;tex.extension='EXTEND';tex['LuoPreserveVector']=True;l.new(combine.outputs[0],tex.inputs['Vector']);textures.append(tex)
        normal=n.new('ShaderNodeNewGeometry');axes=n.new('ShaderNodeSeparateXYZ');l.new(normal.outputs['Normal'],axes.inputs[0]);factors=[]
        for axis in [0,2]:
            absolute=n.new('ShaderNodeMath');absolute.operation='ABSOLUTE';l.new(axes.outputs[axis],absolute.inputs[0])
            blend=n.new('ShaderNodeMapRange');blend.inputs['From Min'].default_value=.34;blend.inputs['From Max'].default_value=.80;l.new(absolute.outputs[0],blend.inputs['Value']);factors.append(blend)
        sides=n.new('ShaderNodeMixRGB');l.new(factors[0].outputs[0],sides.inputs[0]);l.new(textures[0].outputs['Color'],sides.inputs[1]);l.new(textures[1].outputs['Color'],sides.inputs[2])
        top=n.new('ShaderNodeMixRGB');l.new(factors[1].outputs[0],top.inputs[0]);l.new(sides.outputs[0],top.inputs[1]);l.new(textures[2].outputs['Color'],top.inputs[2])
        albedo=n.new('ShaderNodeMixRGB');albedo.inputs[0].default_value=.23 if offset==(0,.5) else (.12 if 'Shoe' in name else (.18 if 'Scabbard' in name else (.20 if 'Repair' in name else .58)));l.new(ramp.outputs[0],albedo.inputs[1]);l.new(top.outputs[0],albedo.inputs[2]);l.new(albedo.outputs[0],bs.inputs['Base Color'])
        micro=n.new('ShaderNodeBump');micro.inputs['Strength'].default_value=.26;micro.inputs['Distance'].default_value=.00018;l.new(top.outputs[0],micro.inputs['Height']);l.new(bump.outputs[0],micro.inputs['Normal']);l.new(micro.outputs[0],bs.inputs['Normal'])
    bs.inputs['Sheen Weight'].default_value=.12;bs.inputs['Specular IOR Level'].default_value=.25
    return m

def TailoredMaterials():
    global cloth,patchCloth,pocketCloth,canvas,blanket,rope,thread,wrapCloth,shoeCloth,sheathCloth,capCloth
    cloth=ClothMaterial('Material_LuoTwill',(.125,.146,.166),1,.48)
    capCloth=ClothMaterial('Material_LuoCapCotton',(.127,.146,.164),1,.33)
    patchCloth=ClothMaterial('Material_LuoRepairCloth',(.104,.111,.112),1,.34)
    pocketCloth=ClothMaterial('Material_LuoPocketCotton',(.136,.153,.166),1,.27)
    canvas=ClothMaterial('Material_LuoCanvas',(.186,.162,.119),.8,.32)
    blanket=ClothMaterial('Material_LuoWoolBlanket',(.112,.119,.117),.65,.23)
    wrapCloth=ClothMaterial('Material_LuoPutteeCotton',(.242,.224,.193),.9,.35)
    shoeCloth=ClothMaterial('Material_LuoShoeCotton',(.030,.029,.025),1.1,.35)
    sheathCloth=ClothMaterial('Material_LuoScabbardCloth',(.062,.064,.061),.9,.32)
    rope=ClothMaterial('Material_LuoHemp',(.231,.194,.139),1.3,.24)
    thread=ClothMaterial('Material_LuoStitch',(.22,.219,.191),1,.13)

def Surface(name,points,faces,weights,material,thickness=0,subdivision=0):
    ob=Mesh(name,points,faces,weights,material)
    if subdivision:
        mod=ob.modifiers.new('TailoredSubdivision','SUBSURF');mod.levels=subdivision;mod.render_levels=subdivision
    if thickness:
        mod=ob.modifiers.new('FabricThickness','SOLIDIFY');mod.thickness=thickness;mod.offset=0
    return ob

def PathResample(points,steps=8):
    result=[]
    for i in range(len(points)-1):
        for j in range(steps):result.append(Vector(points[i]).lerp(Vector(points[i+1]),j/steps))
    result.append(Vector(points[-1]));return result

def StitchPath(name,path,weights,material=None,spacing=.006,radius=.00042):
    points=[Vector(p) for p in path];verts=[];faces=[]
    for a,b in zip(points,points[1:]):
        delta=b-a;length=delta.length
        for j in range(max(1,int(length/spacing))):
            start=a+delta*((j+.12)/max(1,int(length/spacing)));end=a+delta*((j+.64)/max(1,int(length/spacing)))
            axis=delta.normalized();u=axis.cross(Vector((0,1,0)))
            if u.length<.01:u=axis.cross(Vector((1,0,0)))
            u.normalize();v=axis.cross(u);base=len(verts)
            for p in [start,end]:
                for k in range(4):verts.append(p+radius*(u*math.cos(k*math.pi/2)+v*math.sin(k*math.pi/2)))
            for k in range(4):faces.append((base+k,base+(k+1)%4,base+4+(k+1)%4,base+4+k))
    return Mesh(name,verts,faces,weights,material or thread)

def RoundedLoft(name,rings,weights,material,segments=64,power=3.2,fold=.0015):
    points=[];faces=[]
    for j,(x,y,z,rx,ry) in enumerate(rings):
        for i in range(segments):
            a=2*math.pi*i/segments;ca=math.cos(a);sa=math.sin(a)
            cx=math.copysign(abs(ca)**(2/power),ca);sy=math.copysign(abs(sa)**(2/power),sa)
            crease=fold*(math.sin(a*9+j*.8)+.5*math.sin(a*17-j*.7))
            points.append((x+(rx+crease)*cx,y+(ry+crease)*sy,z+.0007*math.sin(a*13+j)))
    for j in range(len(rings)-1):
        for i in range(segments):faces.append((j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i))
    faces.extend([tuple(reversed(range(segments))),tuple((len(rings)-1)*segments+i for i in range(segments))])
    return Mesh(name,points,faces,weights,material)

def JacketProfile(z):
    rows=[(.847,.181,.107),(.90,.184,.110),(.98,.177,.107),(1.06,.164,.103),(1.125,.155,.093),(1.20,.171,.107),(1.30,.184,.117),(1.39,.187,.111),(1.45,.184,.101),(1.495,.169,.078),(1.565,.054,.060)]
    if z<=rows[0][0]:return rows[0][1:]
    for (a,x,y),(b,xx,yy) in zip(rows,rows[1:]):
        if z<=b:
            t=(z-a)/(b-a);return Mix(x,xx,t),Mix(y,yy,t)
    return rows[-1][1:]

def FrontSurface(x,z):
    rx,ry=JacketProfile(z)
    return -ry*math.sqrt(max(.04,1-(x/rx)**2))

def JacketWeights(p):
    x,y,z=p;side='L' if x>0 else 'R'
    rx,_=JacketProfile(z)
    # Below the armhole, the two shells have an actual air gap. Never blend
    # the inner cuff into the pelvis merely because it is near the coat hem.
    lower=Smooth(.195,.201,abs(x));upper=Smooth(.140,.223,abs(x))
    arm=Mix(lower,upper,Smooth(1.30,1.43,z))
    tw=TorsoWeights(p);aw=ArmWeights(p,side);weights={n:w*(1-arm) for n,w in tw.items()}
    for n,w in aw.items():weights[n]=weights.get(n,0)+w*arm
    return {n:w for n,w in weights.items() if w>1e-6}

def BindRelaxed(ob,weights):
    names={}
    for vertex in ob.data.vertices:
        p=vertex.co.copy();w=weights(p);total=sum(w.values());w={n:v/total for n,v in w.items() if v>1e-6}
        for n,v in w.items():
            if n not in names:names[n]=ob.vertex_groups.new(name=n)
            names[n].add([vertex.index],v,'REPLACE')
        vertex.co=BlendMatrix(w).inverted()@p
    ob.parent=rig;mod=ob.modifiers.new('SharedNraSkin','ARMATURE');mod.object=rig

def Jacket():
    parts=[];points=[];faces=[];nz=110;na=112
    for j in range(nz):
        z=.847+j*(1.565-.847)/(nz-1);rx,ry=JacketProfile(z)
        for i in range(na):
            a=2*math.pi*i/na
            lower=math.exp(-((z-.99)/.13)**2);waist=math.exp(-((z-1.15)/.05)**2);upper=math.exp(-((z-1.30)/.16)**2)
            wrinkle=.0060*lower*math.sin(a*13+z*3)+.0042*upper*math.sin(a*10+z*21)+.0042*waist*math.sin(a*21-z*47)
            for h,amp,phase in [(1.065,.005,.6),(1.171,.0042,2.1),(1.345,.0038,4.0)]:
                wrinkle+=amp*math.exp(-((z-h-.048*math.sin(a+phase))/.012)**2)*(.3+.7*abs(math.cos(a+phase)))
            zz=z+.0017*lower*math.sin(a*17)-.020*Smooth(1.49,1.565,z)*max(0,-math.sin(a))
            zz+=.0022*(1-Smooth(.847,.859,z))*(math.sin(a*31)+.4*math.sin(a*53))
            points.append(((rx+wrinkle)*math.cos(a),(ry+wrinkle)*math.sin(a)+.003,zz))
    for j in range(nz-1):
        for i in range(na):faces.append((j*na+i,j*na+(i+1)%na,(j+1)*na+(i+1)%na,(j+1)*na+i))
    faces.extend([tuple(reversed(range(na))),tuple((nz-1)*na+i for i in range(na))])
    parts.append(Mesh('Mesh_LuoJacketShell',points,faces,None,cloth))
    for side,sign in [('L',1),('R',-1)]:
        rings=[]
        for j in range(75):
            t=j/74;z=.905+t*.575
            rx=.047+.008*math.sin(t*math.pi*.8);ry=.050+.011*math.sin(t*math.pi*.85)
            if t>.85:rx*=max(.08,math.sqrt(max(0,1-((t-.85)/.15)**2)));ry*=max(.08,math.sqrt(max(0,1-((t-.85)/.15)**2)))
            x=sign*(.258-.098*Smooth(1.30,1.480,z));y=.020-.008*math.sin(t*math.pi)
            rings.append((x,y,z,rx,ry))
        ob=Loft('Mesh_LuoSleeveShell'+side,rings,80,None,cloth,wrinkle=0)
        for v in ob.data.vertices:
            p=v.co;z=p.z;t=(z-.905)/.575;c=Vector((sign*(.258-.098*Smooth(1.30,1.480,z)),.020-.008*math.sin(t*math.pi),z));d=p-c;a=math.atan2(d.y,d.x)
            fold=.0018*math.sin(a*7+z*10)
            for h,amp,phase in [(1.172,.0062,.4),(1.198,-.0045,2.0),(1.225,.0064,3.3)]:
                fold+=amp*math.exp(-((z-h-.024*math.sin(a+phase))/.011)**2)*(.30+.70*(.5+.5*math.sin(a+phase)))
            fold+=.0015*math.exp(-((z-.949)/.025)**2)*math.sin(a*5+z*31)
            if d.length:p+=d.normalized()*fold
        for mod in list(ob.modifiers):ob.modifiers.remove(mod)
        parts.append(ob)
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:p.select_set(True)
    ob=parts[0];bpy.context.view_layer.objects.active=ob;bpy.ops.object.join();ob.name='Mesh_LuoTunic'
    ob.data.remesh_voxel_size=.0048;bpy.ops.object.voxel_remesh()
    smooth=ob.modifiers.new('ClothSurfaceRelax','SMOOTH');smooth.factor=.48;smooth.iterations=3;bpy.ops.object.modifier_apply(modifier=smooth.name)
    for poly in ob.data.polygons:poly.use_smooth=True
    BindRelaxed(ob,JacketWeights)
    mod=ob.modifiers.new('TailoredSurface','SUBSURF');mod.levels=1;mod.render_levels=1
    return ob

def Collar():
    # A closed collar stand and a folded strip, sewn all around the neckline.
    # The front edges open at the placket; the rear remains wrapped around the neck.
    weights=TorsoWeights;segments=72;rows=8;points=[];faces=[]
    for j in range(rows):
        t=j/(rows-1)
        for i in range(segments+1):
            a=.055+(2*math.pi-.11)*i/segments
            zTop=1.554+.032*(1-math.cos(a))/2
            points.append((.055*math.sin(a),-.009-.064*math.cos(a),zTop-.030*(1-t)))
    for j in range(rows-1):
        for i in range(segments):a=j*(segments+1)+i;faces.append((a,a+1,a+segments+2,a+segments+1))
    Surface('Mesh_LuoCollarStand',points,faces,weights,cloth,.002)
    for sign in [-1,1]:
        points=[];faces=[];ns=40;nt=9
        for j in range(nt):
            t=j/(nt-1)
            for i in range(ns):
                a=.055+(math.pi-.055)*i/(ns-1);zTop=1.555+.032*(1-math.cos(a))/2
                inner=Vector((sign*.055*math.sin(a),-.009-.065*math.cos(a),zTop))
                # Piecewise outer boundary creates a deliberate pointed lapel.
                if a<.73:
                    q=(a-.055)/(.73-.055);x=sign*Mix(.010,.074,q);z=Mix(1.544,1.505,q);y=FrontSurface(x,z)-.004
                    outer=Vector((x,y,z))
                elif a<1.5:
                    q=(a-.73)/(.77);tip=Vector((sign*.074,FrontSurface(sign*.074,1.505)-.004,1.505));end=Vector((sign*.069,-.012,1.553));outer=tip.lerp(end,q)
                else:outer=Vector((sign*.069*math.sin(a),-.009-.079*math.cos(a),zTop-.027))
                p=inner.lerp(outer,t);p.y-=.0015*math.sin(t*math.pi);points.append(p)
        for j in range(nt-1):
            for i in range(ns-1):a=j*ns+i;faces.append((a,a+1,a+ns+1,a+ns))
        Surface('Mesh_LuoCollarFold'+str(sign),points,faces,weights,pocketCloth,.0022)
        border=[Vector(points[(nt-1)*ns+i])+Vector((0,-.0008,.0002)) for i in range(ns)]
        StitchPath('Mesh_LuoCollarTopstitch'+str(sign),border,weights,spacing=.004)

def Pocket(name,cx,bottom,width,height):
    points=[];faces=[];nx=17;nz=19
    for j in range(nz):
        v=j/(nz-1);z=bottom+height*v
        for i in range(nx):
            u=i/(nx-1);rounding=1-.13*(1-Smooth(0,.15,v));x=cx+(u-.5)*width*rounding
            puff=.0018+.0065*math.sin(math.pi*u)**.7*Smooth(0,.18,v)
            puff+=.0015*math.sin(u*29+v*9)*math.sin(math.pi*u)*math.sin(math.pi*v)
            points.append((x,FrontSurface(x,z)-puff,z))
    for j in range(nz-1):
        for i in range(nx-1):a=j*nx+i;faces.append((a,a+1,a+nx+1,a+nx))
    Surface('Mesh_Luo'+name+'Pocket',points,faces,TorsoWeights,pocketCloth,.0014)
    indices=[*range(nx),*[j*nx+nx-1 for j in range(1,nz)],*[(nz-1)*nx+i for i in range(nx-2,-1,-1)],*[j*nx for j in range(nz-2,0,-1)]]
    path=[Vector(points[i])+Vector((0,-.001,0)) for i in indices];path.append(path[0]);StitchPath('Mesh_Luo'+name+'PocketStitch',path,TorsoWeights,spacing=.0045)
    # The flap overlaps the bag mouth and has an actual lower edge and cloth thickness.
    top=bottom+height+.008;points=[];faces=[];nr=9
    for j in range(nr):
        t=j/(nr-1)
        for i in range(nx):
            u=i/(nx-1);x=cx+(u-.5)*(width+.006)*(1-.08*t)
            z=top-t*(.027+.012*(1-abs(2*u-1)))
            y=FrontSurface(x,z)-.004-.006*math.sin(t*math.pi/2)-.001*math.sin(u*13)*math.sin(t*math.pi)
            points.append((x,y,z))
    for j in range(nr-1):
        for i in range(nx-1):a=j*nx+i;faces.append((a,a+1,a+nx+1,a+nx))
    Surface('Mesh_Luo'+name+'PocketFlap',points,faces,TorsoWeights,cloth,.0018)
    StitchPath('Mesh_Luo'+name+'FlapStitch',[Vector(p)+Vector((0,-.001,0)) for p in points[-nx:]],TorsoWeights,spacing=.004)
    z=top-.027;Ellipsoid('Mesh_Luo'+name+'PocketButton',(cx,FrontSurface(cx,z)-.013,z),(.0036,.0015,.0036),button,TorsoWeights)

def Body():
    Jacket();Collar()
    for side,sign in [('L',1),('R',-1)]:
        rings=[]
        for j in range(95):
            t=j/94;z=.373+.61*t
            width=.057+.025*Smooth(0,.12,t)+.003*math.sin(t*math.pi)
            depth=.062+.031*Smooth(0,.15,t)+.006*math.sin(t*math.pi)
            rings.append((sign*(.102-.008*Smooth(.7,1,t)),.014,z,width,depth))
        ob=Loft('Mesh_LuoTrousers'+side,rings,80,None,cloth,wrinkle=0)
        for mod in list(ob.modifiers):ob.modifiers.remove(mod)
        for v in ob.data.vertices:
            p=v.co;z=p.z;cx=sign*(.102-.008*Smooth(.80,.983,z));d=Vector((p.x-cx,p.y-.014,0));a=math.atan2(d.y,d.x)
            bunch=0
            for h,amp,phase in [(.392,.010,.6),(.421,-.007,1.9),(.451,.009,3.0),(.478,-.0045,4.2)]:
                bunch+=amp*math.exp(-((z-h-.024*math.sin(a+phase))/.012)**2)*(.30+.70*(.5+.5*math.cos(a+phase)))
            knee=.0038*math.exp(-((z-.55-.02*math.sin(a))/.055)**2)*math.sin(z*47-a*2)
            vertical=.003*math.sin(a*7+z*3)+.0018*math.sin(a*13-z*8)
            if d.length:p+=d.normalized()*(bunch+knee+vertical)
        BindRelaxed(ob,lambda p,s=side:LegWeights(p,s));mod=ob.modifiers.new('TailoredSurface','SUBSURF');mod.levels=1;mod.render_levels=1
        # Overlapping cloth bands with gently wrinkled edges rather than wire coils.
        Loft('Mesh_LuoPuttee'+side,[(sign*.101,.024,z,.044+.012*t,.049+.014*t) for t,z in [(0,.111),(.1,.14),(.45,.23),(.75,.31),(1,.382)]],64,{'Bip001 '+side+' Calf':1},wrapCloth,wrinkle=.0006)
        verts=[];faces=[];count=650;turns=9.2
        for j in range(count):
            t=j/(count-1);a=t*2*math.pi*turns;z=.124+.257*t+.0018*math.sin(a*.73)+.0012*math.sin(a*2.3)
            for edge in [-1,1]:
                zz=z+edge*(.015+.0018*math.sin(a*.4))+.0006*math.sin(a*11)
                height=max(0,min(1,(zz-.111)/.271))
                rr=.044+.012*height+.0018+.0005*math.sin(a*6+zz*31)+.0004*edge
                # The calf grows faster in depth than in width. Match both
                # radii so the upper front cannot poke through the cloth band.
                verts.append((sign*.101+rr*math.cos(a),.024+(rr+.005+.002*height)*math.sin(a),zz))
        for j in range(count-1):faces.append((j*2,j*2+1,j*2+3,j*2+2))
        Surface('Mesh_LuoPutteeBand'+side,verts,faces,{'Bip001 '+side+' Calf':1},wrapCloth,.0007)
        shoe=Loft('Mesh_LuoClothShoe'+side,[(sign*.102,-.039,.008,.052,.111),(sign*.102,-.039,.013,.053,.112),(sign*.102,-.039,.025,.053,.112),(sign*.102,-.042,.043,.050,.107),(sign*.102,-.030,.069,.046,.089),(sign*.102,.011,.091,.037,.056),(sign*.102,.022,.108,.032,.045)],64,{'Bip001 '+side+' Foot':1},shoeCloth,wrinkle=.0006)
        path=[(sign*.102+.053*math.cos(a),-.039+.112*math.sin(a),.019) for a in [i*2*math.pi/96 for i in range(97)]]
        Tube('Mesh_LuoShoeSole'+side,path,.004,shoeCloth,{'Bip001 '+side+' Foot':1},8)
        StitchPath('Mesh_LuoShoeSoleStitch'+side,[(x,y,z+.0028) for x,y,z in path],{'Bip001 '+side+' Foot':1},spacing=.006)
    path=[(0,FrontSurface(0,z)-.002,z) for z in [.85+i*.70/70 for i in range(71)]]
    Strap('Mesh_LuoFrontPlacket',path,.017,pocketCloth,TorsoWeights)
    for z in [1.501,1.415,1.329,1.243,1.157,1.060,.965]:
        Ellipsoid('Mesh_LuoButton'+str(z),(0,FrontSurface(0,z)-.006,z),(.0045,.0018,.0045),button,TorsoWeights)
    Loft('Mesh_LuoBelt',[(0,.002,1.101,.165,.104),(0,.002,1.132,.164,.102)],96,{'Bip001 Spine':1},leather,0)
    Tube('Mesh_LuoBeltBuckle',[(-.019,-.108,1.102),(.019,-.108,1.102),(.019,-.108,1.137),(-.019,-.108,1.137),(-.019,-.108,1.102)],.0021,steel,{'Bip001 Spine':1},8)
    Tube('Mesh_LuoBeltPin',[(0,-.11,1.103),(0,-.11,1.135)],.0012,steel,{'Bip001 Spine':1},6)
    RefineFootwear()

def RefineFootwear():
    ankle=BasicMaterial('Material_LuoAnkleSkin',(.29,.205,.145),.80)
    for side,sign in [('L',1),('R',-1)]:
        shoe=bpy.data.objects['Mesh_LuoClothShoe'+side]
        for v in shoe.data.vertices:
            p=shoe.matrix_world@v.co
            if p.z>.075:
                if p.z>.102:
                    p.x=sign*.102+(p.x-sign*.102)*1.24;p.y=.022+(p.y-.022)*1.15
                p.z=.075+(p.z-.075)*.30;v.co=shoe.matrix_world.inverted()@p
        def Weights(p,s=side):
            t=Smooth(.075,.135,p.z);return {'Bip001 '+s+' Foot':1-t,'Bip001 '+s+' Calf':t}
        Loft('Mesh_LuoAnkle'+side,[(sign*.102,.024,z,rx,ry) for z,rx,ry in [(.058,.031,.039),(.080,.033,.041),(.10,.036,.044),(.124,.039,.047),(.143,.041,.049)]],48,Weights,ankle,0)
        path=[(sign*.102+.038*math.cos(a),.023+.050*math.sin(a),.085) for a in [i*2*math.pi/64 for i in range(65)]]
        Tube('Mesh_LuoShoeOpening'+side,path,.0016,shoeCloth,{'Bip001 '+side+' Foot':1},8)

def SurfaceTrees():
    from mathutils.bvhtree import BVHTree
    bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();trees={}
    for key in ['Tunic','TrousersL','TrousersR']:
        obj=bpy.data.objects['Mesh_Luo'+key];ev=obj.evaluated_get(dg);me=ev.to_mesh()
        trees[key]=BVHTree.FromPolygons([ev.matrix_world@v.co for v in me.vertices],[list(p.vertices) for p in me.polygons])
        ev.to_mesh_clear()
    return trees

def Tailoring():
    trees=SurfaceTrees()
    for side,sign in [('L',1),('R',-1)]:
        Pocket('Chest'+side,sign*.097,1.310,.083,.105)
        Pocket('Skirt'+side,sign*.107,.888,.092,.131)
        # Curved inset sleeve seams make the shoulder's cut readable from every side.
        armhole=[(sign*(.164+.019*math.sin(a)),.012+.067*math.sin(a),1.429+.073*math.cos(a)) for a in [i*2*math.pi/96 for i in range(97)]]
        armhole=[hit+normal*.0007 if hit is not None else Vector(p) for p in armhole for hit,normal,_,_ in [trees['Tunic'].find_nearest(Vector(p))]]
        StitchPath('Mesh_LuoArmholeStitch'+side,armhole,JacketWeights,spacing=.006,radius=.00045)
        points=[];faces=[];nx=19;nz=29
        for j in range(nz):
            v=j/(nz-1);z=1.064+.151*v
            for i in range(nx):
                u=i/(nx-1);a=-.43+1.20*u;t=(z-.905)/.60;cx=sign*(.238-.052*t)
                y=.018+.064*math.sin(a);zz=z+.003*math.sin(u*5)
                hit,normal,_,_=trees['Tunic'].ray_cast(Vector((sign*.45,y,zz)),Vector((-sign,0,0)),.35)
                points.append(hit+normal*.0018 if hit is not None else Vector((cx+sign*.056*math.cos(a),y,zz)))
        for j in range(nz-1):
            for i in range(nx-1):a=j*nx+i;faces.append((a,a+1,a+nx+1,a+nx))
        Surface('Mesh_LuoElbowPatch'+side,points,faces,lambda p,s=side:ArmWeights(p,s),patchCloth,.001)
        boundary=[*points[:nx],*[points[j*nx+nx-1] for j in range(1,nz)],*reversed(points[-nx:]),*[points[j*nx] for j in range(nz-2,0,-1)],points[0]]
        StitchPath('Mesh_LuoElbowRepairStitch'+side,boundary,lambda p,s=side:ArmWeights(p,s),spacing=.008,radius=.0006)
        # Separate hand-sewn shoulder repair, conformed to the sleeve cap.
        points=[];faces=[];sx=17;sz=19
        for j in range(sz):
            v=j/(sz-1);z=1.365+.076*v
            for i in range(sx):
                u=i/(sx-1);y=-.030+.072*u;zz=z+.002*math.sin(u*8)+.001*math.sin(v*11)
                hit,normal,_,_=trees['Tunic'].ray_cast(Vector((sign*.45,y,zz)),Vector((-sign,0,0)),.38)
                points.append(hit+normal*.0019 if hit is not None else Vector((sign*.225,y,zz)))
        for j in range(sz-1):
            for i in range(sx-1):a=j*sx+i;faces.append((a,a+1,a+sx+1,a+sx))
        Surface('Mesh_LuoShoulderPatch'+side,points,faces,JacketWeights,patchCloth,.001)
        boundary=[*points[:sx],*[points[j*sx+sx-1] for j in range(1,sz)],*reversed(points[-sx:]),*[points[j*sx] for j in range(sz-2,0,-1)],points[0]]
        StitchPath('Mesh_LuoShoulderRepairStitch'+side,boundary,JacketWeights,spacing=.007,radius=.0006)
        points=[];faces=[]
        for j in range(29):
            t=j/28;z=.43+.152*t
            for i in range(21):
                u=i/20;x=sign*.102+(u-.5)*.077;y=.014-.095*math.sqrt(max(.1,1-((x-sign*.102)/.084)**2))-.0025
                zz=z+.003*math.sin(u*4)
                hit,normal,_,_=trees['Trousers'+side].ray_cast(Vector((x,-.4,zz)),Vector((0,1,0)),.7)
                points.append(hit+normal*.0018 if hit is not None else Vector((x,y,zz)))
        for j in range(28):
            for i in range(20):a=j*21+i;faces.append((a,a+1,a+22,a+21))
        Surface('Mesh_LuoKneePatch'+side,points,faces,lambda p,s=side:LegWeights(p,s),patchCloth,.001)
        boundary=[*points[:21],*[points[j*21+20] for j in range(1,29)],*reversed(points[-21:]),*[points[j*21] for j in range(27,0,-1)],points[0]]
        StitchPath('Mesh_LuoKneeRepairStitch'+side,boundary,lambda p,s=side:LegWeights(p,s),spacing=.008,radius=.0006)
        # Sleeve cuff seams and sparse loose fibres, not a solid jagged border.
        path=[(sign*.258+.049*math.cos(a),.020+.053*math.sin(a),.913) for a in [i*2*math.pi/72 for i in range(73)]]
        StitchPath('Mesh_LuoCuffStitch'+side,path,lambda p,s=side:ArmWeights(p,s),spacing=.0045)
        FrayedEdge('Mesh_LuoCuffFray'+side,path,lambda p,s=side:ArmWeights(p,s),.003)
    # Irregular repair on the right rear thigh.
    points=[];faces=[];nx=19;nz=23
    for j in range(nz):
        v=j/(nz-1);z=.715+.105*v
        for i in range(nx):
            u=i/(nx-1);x=-.10+(u-.5)*.073+.003*math.sin(v*7);zz=z+.002*math.sin(u*11)
            hit,normal,_,_=trees['TrousersR'].ray_cast(Vector((x,.45,zz)),Vector((0,-1,0)),.75)
            points.append(hit+normal*.0019 if hit is not None else Vector((x,.111,zz)))
    for j in range(nz-1):
        for i in range(nx-1):a=j*nx+i;faces.append((a,a+1,a+nx+1,a+nx))
    Surface('Mesh_LuoRearThighPatch',points,faces,lambda p:LegWeights(p,'R'),patchCloth,.001)
    boundary=[*points[:nx],*[points[j*nx+nx-1] for j in range(1,nz)],*reversed(points[-nx:]),*[points[j*nx] for j in range(nz-2,0,-1)],points[0]]
    StitchPath('Mesh_LuoRearThighRepairStitch',boundary,lambda p:LegWeights(p,'R'),spacing=.007,radius=.0006)
    for ySign in [-1,1]:
        path=[]
        for i in range(65):
            a=(0 if ySign>0 else math.pi)+i*math.pi/64;path.append((.181*math.cos(a),.003+.108*math.sin(a),.854+.001*math.sin(a*17)))
        StitchPath('Mesh_LuoHemStitch'+str(ySign),path,TorsoWeights,spacing=.005)
        FrayedEdge('Mesh_LuoHemFray'+str(ySign),path,TorsoWeights,.004)

def FrayedEdge(name,path,weights,length):
    verts=[];faces=[]
    for i,p in enumerate(path[:-1]):
        if i%3==1:continue
        p=Vector(p);d=(Vector(path[i+1])-p).normalized();normal=Vector((p.x,p.y,0)).normalized()
        p+=normal*.0008;end=p+Vector((.0006*math.sin(i*2.3),.0006*math.cos(i),-length*(.45+.55*abs(math.sin(i*2.1)))))
        base=len(verts);verts.extend([p-d*.00027,p+d*.00027,end+d*.00013,end-d*.00013]);faces.append((base,base+1,base+2,base+3))
    Mesh(name,verts,faces,weights,thread)

def Cap():
    weights={'Bip001 Head':1};segments=112;points=[];faces=[]
    # Squared soft crown: near-vertical side wall with a shallow cloth top.
    levels=[(0,.090,.105),( .12,.093,.109),(.45,.093,.105),(.80,.086,.096),(1,.076,.084)]
    for j,(t,rx,ry) in enumerate(levels):
        for i in range(segments):
            a=i*2*math.pi/segments;front=max(0,-math.sin(a))
            zBase=1.687+.046*(1-math.sin(a))/2;zTop=1.782+.037*(1-math.sin(a))/2
            wrinkle=.0024*math.sin(a*7+.5)+.0014*math.sin(a*13+t*3)
            ca=math.cos(a);sa=math.sin(a)
            points.append(((rx+wrinkle)*math.copysign(abs(ca)**.76,ca),.003+(ry+wrinkle)*math.copysign(abs(sa)**.76,sa),Mix(zBase,zTop,t)+.0022*math.sin(a*5)*math.sin(t*math.pi)))
    for j in range(len(levels)-1):
        for i in range(segments):faces.append((j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i))
    # Concentric top panel remains flat, with small asymmetric soft dents.
    prev=(len(levels)-1)*segments
    for j in range(1,12):
        r=1-j/12;base=len(points)
        for i in range(segments):
            a=i*2*math.pi/segments;z=Mix(1.803,1.782+.037*(1-math.sin(a))/2,r)+.003*(1-r*r)
            z+=.0015*math.sin(a*4+r*3)*r
            ca=math.cos(a);sa=math.sin(a)
            points.append((.076*r*math.copysign(abs(ca)**.76,ca),.003+.084*r*math.copysign(abs(sa)**.76,sa),z))
        for i in range(segments):faces.append((prev+i,prev+(i+1)%segments,base+(i+1)%segments,base+i))
        prev=base
    center=len(points);points.append((0,.003,1.806))
    for i in range(segments):faces.append((prev+i,prev+(i+1)%segments,center))
    ob=Surface('Mesh_LuoCapCrown',points,faces,weights,capCloth,.0015)
    # Mesh() may have added a subdivision modifier; the dense grid already defines the contour.
    for mod in list(ob.modifiers):
        if mod.type=='SUBSURF':mod.levels=1;mod.render_levels=1
    points=[];faces=[]
    for j in range(5):
        t=j/4
        for i in range(segments+1):
            a=i*2*math.pi/segments;front=max(0,-math.sin(a));z=1.688+.046*(1-math.sin(a))/2+.022*t
            ca=math.cos(a);sa=math.sin(a)
            points.append(((.095+.003*t)*math.copysign(abs(ca)**.76,ca),.003+(.111+.002*t)*math.copysign(abs(sa)**.76,sa),z))
    for j in range(4):
        for i in range(segments):a=j*(segments+1)+i;faces.append((a,a+1,a+segments+2,a+segments+1))
    bandMaterial=ClothMaterial('Material_LuoCapBandCotton',(.106,.125,.143),1,.30)
    Surface('Mesh_LuoCapBand',points,faces,weights,bandMaterial,.0012)
    for j in [0,4]:
        path=[Vector((p[0]*1.006,p[1]*1.006,p[2])) for p in points[j*(segments+1):(j+1)*(segments+1)]]
        StitchPath('Mesh_LuoCapBandStitch'+str(j),path,weights,spacing=.004,radius=.00032)
    # Short curved cloth bill, sewn into the front band, with a thin reinforced rim.
    points=[];faces=[];nx=81;ny=13
    for j in range(ny):
        t=j/(ny-1)
        for i in range(nx):
            a=-1.12+2.24*i/(nx-1);x=(.084+.009*t)*math.sin(a)
            y=.003-(.103+.038*t)*math.cos(a);z=1.744-.011*t-.013*math.sin(a)**2
            points.append((x,y,z+.002*math.sin(math.pi*t)))
    for j in range(ny-1):
        for i in range(nx-1):a=j*nx+i;faces.append((a,a+1,a+nx+1,a+nx))
    Surface('Mesh_LuoCapBrim',points,faces,weights,capCloth,.002)
    StitchPath('Mesh_LuoCapBillStitch',[Vector(p)+Vector((0,-.0002,.0013)) for p in points[-nx:]],weights,spacing=.0035,radius=.00032)
    # The cap insignia is its own blue enamel disc and twelve-ray white sun.
    blue=BasicMaterial('Material_LuoBadgeBlue',(.023,.057,.133),.68,.12)
    white=BasicMaterial('Material_LuoBadgeWhite',(.66,.65,.59),.75,.05)
    center=Vector((0,-.099,1.789));Ellipsoid('Mesh_LuoCapBadge',center,(.0115,.002,.0115),blue,weights)
    verts=[];faces=[]
    for i in range(12):
        a=i*math.pi/6;base=len(verts)
        verts.extend([center+Vector((.0056*math.sin(a-.18),-.0022,.0056*math.cos(a-.18))),center+Vector((.010*math.sin(a),-.0022,.010*math.cos(a))),center+Vector((.0056*math.sin(a+.18),-.0022,.0056*math.cos(a+.18)))])
        faces.append((base+2,base+1,base))
    Mesh('Mesh_LuoCapSunRays',verts,faces,weights,white)
    Ellipsoid('Mesh_LuoCapSunDisc',center+Vector((0,-.0024,0)),(.0049,.0003,.0049),white,weights)
    Ellipsoid('Mesh_LuoCapFrontButton',(0,-.104,1.763),(.004,.0014,.004),button,weights)
    # Back band tab and top seam; no thick cord around the cap.
    Strap('Mesh_LuoCapBackTab',[(-.032,.119,1.708),(0,.120,1.708),(.032,.119,1.708)],.012,capCloth,weights)
    Ellipsoid('Mesh_LuoCapBackButton',(.021,.122,1.710),(.0036,.0014,.0036),button,weights)
    path=[(0,.003+.080*t,1.806-.019*t-.004*abs(t)) for t in [-1+i*2/64 for i in range(65)]]
    StitchPath('Mesh_LuoCapTopSeam',path,weights,spacing=.004,radius=.0003)
    # The adopted head is centred behind its nose, not at the world origin.
    # Fit the whole cap to the measured scalp bounds rather than centring a cylinder.
    for ob in list(bpy.context.scene.objects):
        if ob.type=='MESH' and ob.name.startswith('Mesh_LuoCap'):
            for vertex in ob.data.vertices:vertex.co.y=.003+(vertex.co.y-.003)*1.10-.036
    ConformCapSeam()

def ConformCapSeam():
    from mathutils.bvhtree import BVHTree
    bpy.context.view_layer.update();ob=bpy.data.objects['Mesh_LuoCapCrown'];ev=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh()
    tree=BVHTree.FromPolygons([ev.matrix_world@v.co for v in me.vertices],[list(p.vertices) for p in me.polygons]);ev.to_mesh_clear()
    seam=bpy.data.objects['Mesh_LuoCapTopSeam']
    # Project each whole stitch, preserving its cross-section. Per-vertex
    # projection collapses both sides onto one plane and causes z-fighting.
    for start in range(0,len(seam.data.vertices),8):
        vertices=list(seam.data.vertices[start:start+8]);p=sum((seam.matrix_world@v.co for v in vertices),Vector())/len(vertices)
        hit,normal,_,_=tree.ray_cast(p+Vector((0,0,.04)),Vector((0,0,-1)),.12)
        if hit is not None:
            delta=seam.matrix_world.inverted().to_3x3()@(hit+normal*.00055-p)
            for v in vertices:v.co+=delta

def BagFlap(name,cx,y,top,width,height,weights,material):
    points=[];faces=[];nx=25;ny=15
    for j in range(ny):
        t=j/(ny-1)
        for i in range(nx):
            u=i/(nx-1);x=cx+(u-.5)*width*(1-.15*t)
            z=top-height*t*(.77+.23*(1-abs(2*u-1)))
            yy=y-.010*math.sin(math.pi*t*.7)-.0025*math.sin(u*17)*math.sin(t*math.pi)
            points.append((x,yy,z))
    for j in range(ny-1):
        for i in range(nx-1):a=j*nx+i;faces.append((a,a+1,a+nx+1,a+nx))
    Surface(name,points,faces,weights,material,.0018)
    boundary=[*points[:nx],*[points[j*nx+nx-1] for j in range(1,ny)],*reversed(points[-nx:]),*[points[j*nx] for j in range(ny-2,0,-1)],points[0]]
    StitchPath(name+'Stitch',[Vector(p)+Vector((0,-.001,0)) for p in boundary],weights,spacing=.005,radius=.00048)

def Equipment():
    for sign in [-1,1]:
        x=sign*.098
        rings=[(x,-.139,z,rx,ry) for z,rx,ry in [(1.112,.035,.009),(1.12,.048,.020),(1.135,.052,.024),(1.17,.053,.023),(1.215,.054,.022),(1.25,.051,.017),(1.27,.048,.010)]]
        RoundedLoft('Mesh_LuoAmmoPouch'+str(sign),rings,TorsoWeights,canvas,64,3.7,.0012)
        BagFlap('Mesh_LuoAmmoFlap'+str(sign),x,-.163,1.272,.104,.060,TorsoWeights,canvas)
        Ellipsoid('Mesh_LuoPouchStud'+str(sign),(x,-.176,1.23),(.004,.0015,.004),button,TorsoWeights)
        # Side gusset and double bottom seam are visible in profile.
        for edge in [-1,1]:
            path=[(x+edge*.051,-.160,z) for z in [1.124+i*.126/24 for i in range(25)]]
            StitchPath('Mesh_LuoPouchEdge'+str(sign)+str(edge),path,TorsoWeights,spacing=.005)
        strapPath=[(x,-.155,1.269),(sign*.111,-.115,1.36),(sign*.124,-.086,1.46),(sign*.125,-.011,1.501),(sign*.117,.071,1.474),(sign*.084,.120,1.33)]
        Strap('Mesh_LuoAmmoSling'+str(sign),PathResample(strapPath),.015,canvas,{'Bip001 Spine2':1})
        StitchPath('Mesh_LuoSlingStitch'+str(sign),PathResample(strapPath),{'Bip001 Spine2':1},spacing=.007,radius=.00035)
    packWeights={'Bip001 Spine1':.4,'Bip001 Spine2':.6}
    rings=[]
    for j in range(53):
        t=j/52;z=.995+.31*t
        rx=.139*math.sin(math.pi*(.13+.80*t))**.4;ry=.049*math.sin(math.pi*(.14+.81*t))**.6
        rings.append((-.024+.035*t,.165+.008*t,z,rx,ry))
    RoundedLoft('Mesh_LuoHaversack',rings,packWeights,canvas,80,2.8,.0032)
    for sign in [-1,1]:
        strapPath=[(sign*.10,.213,1.03),(sign*.118,.207,1.23),(sign*.116,.143,1.39),(sign*.119,.056,1.486),(sign*.123,-.01,1.504)]
        Strap('Mesh_LuoPackSling'+str(sign),PathResample(strapPath),.021,canvas,{'Bip001 Spine2':1})
    # Top gathering stitches and lacing cinch the cloth instead of leaving a bare cone.
    for i in range(9):
        x=-.062+i*.015
        Tube('Mesh_LuoPackGather'+str(i),[(x,.207,1.274),(x*.62,.204,1.302),(x*.3,.193,1.321)],.0009,thread,packWeights,6)
    Tube('Mesh_LuoPackDrawstring',[(-.05,.207,1.299),(0,.21,1.319),(.05,.207,1.299)],.002,rope,packWeights,8)
    # Broad wool roll with real cloth end layers, not a coil made from thick rope.
    points=[];faces=[];nx=71;na=96
    for j in range(nx):
        x=-.154+.308*j/(nx-1)
        for i in range(na):
            a=2*math.pi*i/na;r=.044+.0015*math.sin(a*8+x*9)+.0012*math.sin(x*81+a*3)
            r-=.004*math.exp(-((abs(x)-.101)/.014)**2)
            points.append((x,.177+r*math.cos(a),1.382+r*math.sin(a)))
    for j in range(nx-1):
        for i in range(na):faces.append((j*na+i,j*na+(i+1)%na,(j+1)*na+(i+1)%na,(j+1)*na+i))
    faces.extend([tuple(reversed(range(na))),tuple((nx-1)*na+i for i in range(na))])
    Mesh('Mesh_LuoBlanketRoll',points,faces,{'Bip001 Spine2':1},blanket)
    for sign in [-1,1]:
        path=[]
        for j in range(360):
            t=j/359;a=t*math.pi*2*5;r=.003+.040*t
            path.append((sign*.155,.177+r*math.cos(a),1.382+r*math.sin(a)))
        Tube('Mesh_LuoBlanketLayerEdge'+str(sign),path,.0011,blanket,{'Bip001 Spine2':1},6)
        path=[(sign*.101,.177+.042*math.cos(a),1.382+.042*math.sin(a)) for a in [i*2*math.pi/64 for i in range(65)]]
        Tube('Mesh_LuoBlanketTie'+str(sign),path,.0017,rope,{'Bip001 Spine2':1},8)
    for i,(a,b) in enumerate([((-.045,.224,1.327),(.039,.225,1.426)),((.045,.224,1.327),(-.039,.225,1.426)),((0,.225,1.38),(-.035,.219,1.257)),((.005,.225,1.38),(.037,.219,1.27))]):
        Tube('Mesh_LuoPackTie'+str(i),PathResample([a,b]),.0018,rope,{'Bip001 Spine2':1},6)
    Canteen();Dadao()

def Canteen():
    weights={'Bip001 Spine1':1};center=Vector((.116,.231,1.077));rx=.069;ry=.036;rz=.088
    cover=ClothMaterial('Material_LuoCanteenCover',(.163,.166,.152),1,.33)
    Ellipsoid('Mesh_LuoCanteen',center,(rx,ry,rz),cover,weights)
    Loft('Mesh_LuoCanteenNeck',[(.116,.231,1.15,.017,.015),(.116,.231,1.173,.012,.011)],32,weights,steel,0)
    Loft('Mesh_LuoCanteenCap',[(.116,.231,1.169,.016,.014),(.116,.231,1.180,.013,.012),(.116,.231,1.184,.009,.009)],32,weights,steel,0)
    def NetPoint(a,t):return center+Vector(((rx+.0025)*math.cos(t)*math.cos(a),(ry+.0025)*math.cos(t)*math.sin(a),(rz+.0025)*math.sin(t)))
    rows=7;columns=10;nodes={}
    for j in range(rows):
        t=-1.34+j*2.68/(rows-1)
        for i in range(columns):nodes[j,i]=NetPoint((i+(j%2)*.5)*2*math.pi/columns,t)
    for j in range(rows-1):
        for i in range(columns):
            a=nodes[j,i]
            for step in [0,-1] if j%2==0 else [0,1]:
                b=nodes[j+1,(i+step)%columns];mid=(a+b)/2
                # Reproject interpolated cord onto the flattened oval cover.
                path=[]
                for k in range(9):
                    p=a.lerp(b,k/8)-center;unit=Vector((p.x/(rx+.003),p.y/(ry+.003),p.z/(rz+.003))).normalized()
                    path.append(center+Vector((unit.x*(rx+.003),unit.y*(ry+.003),unit.z*(rz+.003))))
                Tube('Mesh_LuoCanteenNet'+str(j)+'_'+str(i)+'_'+str(step),path,.00115,rope,weights,6)
    for (j,i),p in nodes.items():
        if j in [0,rows-1]:continue
        d=(p-center).normalized();u=d.cross(Vector((0,0,1))).normalized();v=d.cross(u)
        path=[p+u*.002*math.cos(a)+v*.002*math.sin(a)+d*.0006 for a in [k*2*math.pi/12 for k in range(13)]]
        Tube('Mesh_LuoCanteenKnot'+str(j)+'_'+str(i),path,.0008,rope,weights,5)
    Tube('Mesh_LuoCanteenHanger',PathResample([(.144,.163,1.30),(.154,.239,1.246),(.134,.268,1.164),(.116,.255,1.179)]),.0024,rope,{'Bip001 Spine1':.4,'Bip001 Spine2':.6},8)

def Dadao():
    weights={'Bip001 Spine2':1};top=Vector((.135,.273,1.436));tip=Vector((-.248,.262,.690));axis=(tip-top).normalized();across=Vector((axis.z,0,-axis.x)).normalized();depth=Vector((0,1,0))
    points=[];faces=[];ns=70;nr=24
    for j in range(ns):
        t=j/(ns-1);c=top.lerp(tip,t);width=.0305*(1-.12*t)
        if t>.955:width*=max(.10,math.sqrt(max(0,1-((t-.955)/.045)**2)))
        for i in range(nr):
            a=i*2*math.pi/nr;ca=math.cos(a);sa=math.sin(a)
            x=math.copysign(abs(ca)**.5,ca);y=math.copysign(abs(sa)**.5,sa)
            points.append(c+across*width*x+depth*(.0085+.0006*math.sin(t*31))*y)
    for j in range(ns-1):
        for i in range(nr):faces.append((j*nr+i,j*nr+(i+1)%nr,(j+1)*nr+(i+1)%nr,(j+1)*nr+i))
    faces.extend([tuple(reversed(range(nr))),tuple((ns-1)*nr+i for i in range(nr))])
    Mesh('Mesh_LuoDadaoScabbard',points,faces,weights,sheathCloth)
    gripCloth=ClothMaterial('Material_LuoGripWrap',(.038,.037,.033),1,.30)
    for sign in [-1,1]:
        path=[top.lerp(tip,t)+across*sign*.029*(1-.12*t)+depth*.009 for t in [j*.94/95 for j in range(96)]]
        StitchPath('Mesh_LuoScabbardSeam'+str(sign),path,weights,spacing=.006,radius=.00045)
    gripEnd=top-axis*.181
    Tube('Mesh_LuoDadaoGrip',[top,gripEnd],.014,leather,weights,24)
    # The guard is a thin flat plate, not a bent rod.
    c=top-axis*.005;verts=[]
    for t in [-.004,.004]:
        for u,v in [(-.045,-.013),(.045,-.013),(.049,.013),(-.049,.013)]:verts.append(c+axis*t+across*u+depth*v)
    faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    ob=Mesh('Mesh_LuoDadaoGuard',verts,faces,weights,steel);bev=ob.modifiers.new('GuardWornEdges','BEVEL');bev.width=.002;bev.segments=3
    for sign in [-1,1]:
        path=[]
        for j in range(320):
            t=j/319;c=top.lerp(gripEnd,t);a=sign*t*2*math.pi*10
            path.append(c+across*.0147*math.cos(a)+depth*.0147*math.sin(a))
        Tube('Mesh_LuoDadaoGripLace'+str(sign),path,.0009,gripCloth,weights,6)
    c=gripEnd-axis*.015;path=[c+across*.017*math.cos(a)+axis*.017*math.sin(a) for a in [j*2*math.pi/64 for j in range(65)]]
    Tube('Mesh_LuoDadaoPommelRing',path,.0026,steel,weights,12)
    for j in range(3):
        t=.19+j*.018;c=top.lerp(tip,t);path=[]
        for k in range(65):
            a=k*2*math.pi/64;ca=math.cos(a);sa=math.sin(a)
            path.append(c+across*.032*math.copysign(abs(ca)**.5,ca)+depth*.010*math.copysign(abs(sa)**.5,sa))
        Tube('Mesh_LuoScabbardTie'+str(j),path,.0015,rope,weights,6)
    c=top.lerp(tip,.23)+depth*.014
    Tube('Mesh_LuoScabbardTieEnds',PathResample([c,c+across*.028+axis*.061,c+across*.005+axis*.025,c-across*.026+axis*.049]),.0015,rope,weights,6)
