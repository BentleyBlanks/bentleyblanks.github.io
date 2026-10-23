"""Reference V3: anatomical surface cues and skinned, directional short-fur cards."""
import bpy,bmesh,math,random,json,hashlib,bisect
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import numpy as np
furRepeatM=.22

def Smooth(a,b,value):
    t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)

def HairMaterial(base):
    source=base/'SourceTextures/Texture_DonkeyShortFurCardsSource.png'
    image=bpy.data.images.load(str(source),check_existing=True)
    image.name='Texture_DonkeyShortCoatBase';image.scale(1024,1024)
    pixels=np.array(image.pixels[:],dtype=np.float32).reshape(1024,1024,4)
    sourceGray=pixels[:,:,:3]@np.array([.2126,.7152,.0722],dtype=np.float32)
    # Bake a restrained albedo from the generated reference. Individual strand
    # relief belongs in the normal map; pigment must not duplicate dark clump
    # shadows. The untouched generated source remains preserved alongside it.
    for row in range(2):
        for column in range(2):
            gray=sourceGray[row*512:(row+1)*512,column*512:(column+1)*512]
            alpha=pixels[row*512:(row+1)*512,column*512:(column+1)*512,3]
            average=float(np.mean(gray[alpha>.6]))
            neutral=.50+.10*np.clip(gray/max(.01,average)-1,-1,1)
            encoded=1.055*neutral**(1/2.4)-.055
            pixels[row*512:(row+1)*512,column*512:(column+1)*512,:3]=encoded[:,:,None]
    image.pixels.foreach_set(pixels.ravel());image.update()
    image.filepath_raw=str(base/'SourceTextures/Texture_DonkeyShortCoatBase.png');image.file_format='PNG';image.save();image.pack()
    linear=np.where(pixels[:,:,:3]<=.04045,pixels[:,:,:3]/12.92,((pixels[:,:,:3]+.055)/1.055)**2.4)
    tileMeans=[]
    for tile in range(4):
        row=1-tile//2;column=tile%2
        block=linear[row*512:(row+1)*512,column*512:(column+1)*512]
        mask=pixels[row*512:(row+1)*512,column*512:(column+1)*512,3]>.6
        tileMeans.append(np.maximum(.01,np.mean(block[mask],axis=0)).tolist())
    gray=sourceGray
    dx=(np.roll(gray,-1,axis=1)-np.roll(gray,1,axis=1))*.9
    dy=(np.roll(gray,-1,axis=0)-np.roll(gray,1,axis=0))*.9
    normalPixels=np.empty_like(pixels);length=np.sqrt(dx*dx+dy*dy+1)
    normalPixels[:,:,0]=(-dx/length+1)*.5;normalPixels[:,:,1]=(-dy/length+1)*.5
    normalPixels[:,:,2]=(1/length+1)*.5;normalPixels[:,:,3]=1
    normal=bpy.data.images.new('Texture_DonkeyShortCoatNormal',width=1024,height=1024,alpha=False)
    normal.colorspace_settings.name='Non-Color';normal.pixels.foreach_set(normalPixels.ravel())
    normal.filepath_raw=str(base/'SourceTextures/Texture_DonkeyShortCoatNormal.png');normal.file_format='PNG';normal.save();normal.pack()
    material=bpy.data.materials.new('DonkeyShortCoatPbr');material.use_nodes=True
    material.use_backface_culling=False
    nodes,links=material.node_tree.nodes,material.node_tree.links;shader=nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value=.86;shader.inputs['Specular IOR Level'].default_value=.22
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
    texture=nodes.new('ShaderNodeTexImage');texture.image=image;links.new(uv.outputs[0],texture.inputs[0])
    paint=nodes.new('ShaderNodeVertexColor');paint.layer_name='HairTint'
    multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
    links.new(texture.outputs['Color'],multiply.inputs[1]);links.new(paint.outputs[0],multiply.inputs[2]);links.new(multiply.outputs[0],shader.inputs['Base Color'])
    cutoff=nodes.new('ShaderNodeMath');cutoff.operation='GREATER_THAN';cutoff.inputs[1].default_value=.45
    links.new(texture.outputs['Alpha'],cutoff.inputs[0]);links.new(cutoff.outputs[0],shader.inputs['Alpha'])
    normalTexture=nodes.new('ShaderNodeTexImage');normalTexture.image=normal;links.new(uv.outputs[0],normalTexture.inputs[0])
    normalNode=nodes.new('ShaderNodeNormalMap');normalNode.uv_map='UVMap'
    links.new(normalTexture.outputs[0],normalNode.inputs['Color']);links.new(normalNode.outputs[0],shader.inputs['Normal'])
    material['alphaMode']='MASK';material['alphaCutoff']=.45
    material['tileLinearMeans']=json.dumps(tileMeans)
    return material

def SurfaceShape(skin):
    bm=bmesh.new();bm.from_mesh(skin.data)
    before=sum(len(face.verts)-2 for face in bm.faces)
    edges=[edge for edge in bm.edges if all(-.02<v.co.y<.59 and .69<v.co.z<1.07 and abs(v.co.x)>.05 for v in edge.verts)
           and abs(edge.verts[0].co.y-edge.verts[1].co.y)>.028]
    if edges:bmesh.ops.subdivide_edges(bm,edges=edges,cuts=1,use_grid_fill=True)
    after=sum(len(face.verts)-2 for face in bm.faces)
    if after-before>10000:raise RuntimeError('Rib-surface refinement exceeds the reserved geometry budget')
    bm.to_mesh(skin.data);bm.free();skin.data.update()
    skin['ribSurfaceAddedTriangles']=after-before
    for vertex in skin.data.vertices:
        if len(vertex.groups)<=4:continue
        top=sorted(((g.group,g.weight) for g in vertex.groups),key=lambda row:row[1],reverse=True)[:4];total=sum(w for _,w in top)
        for group in list(vertex.groups):skin.vertex_groups[group.group].remove([vertex.index])
        for group,weight in top:skin.vertex_groups[group].add([vertex.index],weight/total,'REPLACE')
    for vertex in skin.data.vertices:
        x,y,z=vertex.co
        flank=Smooth(-.08,.04,y)*(1-Smooth(.48,.60,y))*Smooth(.68,.82,z)*(1-Smooth(.99,1.08,z))*Smooth(.065,.13,abs(x))
        u=y+.15*(z-.85)+.018*math.sin(z*5)
        rib=max(math.exp(-((u-centre)/.016)**2) for centre in (.035,.120,.200,.285,.370,.455,.535))
        vertex.co.x+=(1 if x>=0 else -1)*(rib*.009-.003)*flank
        crest=math.exp(-((y+.055)/.11)**2)*Smooth(.97,1.07,z)
        vertex.co.z+=.016*crest
        # A visible scapular plane and a leaner flank replace the inflated oval.
        hollow=math.exp(-((y-.49)/.12)**2-((z-.84)/.14)**2)*Smooth(.05,.12,abs(x))
        vertex.co.x*=1-.045*hollow
        cheek=math.exp(-((y-1.12)/.10)**2-((z-1.155)/.05)**2)
        vertex.co.x*=1-.05*cheek
    skin.data.update()

def ReferencePigment(skin):
    colors=skin.data.color_attributes['CoatColor']
    for vertex in skin.data.vertices:
        color=Vector(colors.data[vertex.index].color[:3]);brightness=sum(color)/3
        pale=Smooth(.08,.18,brightness)
        limb=sum(g.weight for g in vertex.groups if skin.vertex_groups[g.group].name.startswith(('DonkeyFront','DonkeyRear')))
        factor=(.65+.15*Smooth(.5,.9,limb))*(1-pale)+pale
        x,y,z=vertex.co;u=y+.15*(z-.85)+.018*math.sin(z*5)
        wear=max(math.exp(-((u-centre)/.016)**2) for centre in (.035,.120,.200,.285,.370,.455,.535))
        wear*=Smooth(.72,.84,z)*(1-Smooth(1.0,1.08,z))*Smooth(.06,.13,abs(x))
        color*=factor;color.x*=1+.45*wear;color.y*=1+.28*wear;color.z*=1+.12*wear
        colors.data[vertex.index].color=(*color,1)
    for side in ('Left','Right'):
        ring=bpy.data.objects['DonkeyPaleEyeRing'+side];eye=bpy.data.objects['DonkeyEye'+side]
        transform=skin.parent.matrix_world.inverted()@ring.matrix_world
        centre=skin.parent.matrix_world.inverted()@eye.matrix_world.translation
        attr=ring.data.color_attributes.get('CoatColor')
        if not attr:continue
        for vertex in ring.data.vertices:
            p=transform@vertex.co;upper=Smooth(centre.z-.003,centre.z+.010,p.z)
            old=Vector(attr.data[vertex.index].color[:3]);target=Vector((.035,.031,.024))
            attr.data[vertex.index].color=(*old.lerp(target,upper*.85),1)
        ear=bpy.data.objects['DonkeyPinna'+side];transform=skin.parent.matrix_world.inverted()@ear.matrix_world
        colors=ear.data.color_attributes['CoatColor'];sign=-1 if side=='Left' else 1
        for vertex in ear.data.vertices:
            p=transform@vertex.co;t=max(0,min(1,(p.z-1.335)/.255));centre=sign*(.068+.060*t)
            across=abs(p.x-centre)/max(.012,.048*(1-.25*t))
            inner=(1-Smooth(.48,.90,across))*max(0,math.sin(math.pi*t))**.45
            value=Vector((.035,.031,.025)).lerp(Vector((.14,.115,.082)),inner*.85)
            colors.data[vertex.index].color=(*value,1)

def FineMane(rig,collection):
    rng=random.Random(19381024);vertices=[];faces=[];rows=[]
    inverse=rig.matrix_world.inverted();sources=[o for o in collection.objects if o.name.startswith('DonkeyStiffMane')]
    material=sources[0].data.materials[0]
    for obj in sources:
        transform=inverse@obj.matrix_world;points=[transform@v.co for v in obj.data.vertices]
        root=sum(points[:4],Vector())/4;tip=sum(points[-4:],Vector())/4
        row={obj.vertex_groups[g.group].name:g.weight for g in obj.data.vertices[0].groups}
        direction=tip-root
        across=direction.cross(Vector((1,0,0))).normalized();other=direction.normalized().cross(across)
        for strand in range(3):
            start=root+Vector((rng.uniform(-.004,.004),rng.uniform(-.004,.004),0))
            end=start+direction*rng.uniform(.78,1.15)+Vector((rng.uniform(-.003,.003),rng.uniform(-.003,.003),0))
            for axis in (across,other):
                first=len(vertices)
                for t in (0,.55,1):
                    centre=start.lerp(end,t);width=.00055*(1-t)+.00008*t
                    vertices.extend([centre-axis*width,centre+axis*width]);rows.extend([row,row])
                faces.extend([(first,first+1,first+3,first+2),(first+2,first+3,first+5,first+4)])
        bpy.data.objects.remove(obj,do_unlink=True)
    mesh=bpy.data.meshes.new('DonkeyManeFineFibres');mesh.from_pydata(vertices,[],faces);mesh.materials.append(material);mesh.update()
    obj=bpy.data.objects.new('DonkeyManeFineFibres',mesh);collection.objects.link(obj);obj.parent=rig
    for i,row in enumerate(rows):
        for name,value in row.items():
            group=obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name);group.add([i],value,'REPLACE')
    modifier=obj.modifiers.new('DonkeyManeSkin','ARMATURE');modifier.object=rig

def BuildGroom(skin,rig,collection,material,count=21000):
    rng=random.Random(19381023);skin.data.calc_loop_triangles()
    referenceFlow={}
    if bpy.context.scene.get('DonkeyReferenceFitRevision'):
        file=__import__('pathlib').Path(bpy.context.scene['DonkeyCartProject'])/'_blender/Script_DonkeyCoatFlow.py'
        exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),referenceFlow)
    triangles=[];cumulative=[];total=0
    for triangle in skin.data.loop_triangles:
        face=skin.data.polygons[triangle.polygon_index]
        materialName=skin.data.materials[face.material_index].name
        if not materialName.startswith(('DonkeyCartGreyCoat','DonkeyLowerLegShortFur')):continue
        points=[skin.data.vertices[i].co for i in triangle.vertices];centre=sum(points,Vector())/3
        minimumFurZ=.12 if bpy.context.scene.get('DonkeyReferenceFitRevision') else .20
        if centre.z<minimumFurZ:continue
        if centre.y>1.16 and centre.z<1.13:continue
        area=triangle.area
        density=.55 if centre.z<.55 else .65 if centre.y>.95 else 1
        total+=area*density;cumulative.append(total);triangles.append(triangle)
    if not triangles:raise RuntimeError('No furry skin surface')
    vertices=[];faces=[];uvs=[];rows=[];colors=[];normals=[];regions={str(i):0 for i in range(4)}
    means=json.loads(material['tileLinearMeans'])
    surface=BVHTree.FromPolygons([v.co for v in skin.data.vertices],[tuple(p.vertices) for p in skin.data.polygons])
    def Add(root,normal,flow,width,length,row,tile,lift=.0010,color=(.042,.040,.035),project=True):
        flow=flow-normal*flow.dot(normal)
        if flow.length<.05:flow=normal.cross(Vector((1,0,0)))
        if flow.length<.05:flow=normal.cross(Vector((0,1,0)))
        flow.normalize();across=flow.cross(normal).normalized()
        start=len(vertices)
        # Roots penetrate the skin; fine tips lie almost tangent to its surface.
        lower=root+normal*.0011-flow*length*.12
        upper=root+flow*length*.88+normal*lift
        corners=[lower-across*width/2,lower+across*width/2,upper+across*width/2,upper-across*width/2]
        if project:
            for j,p in enumerate(corners):
                point,surfaceNormal,_,_=surface.find_nearest(p)
                corners[j]=point+surfaceNormal*(.0011 if j<2 else max(.0011,lift))
        vertices.extend(corners);normals.extend([tuple(normal)]*4)
        faces.append((start,start+1,start+2,start+3))
        left=.5*(tile%2);bottom=.5*(1-tile//2)
        uvs.extend([(left,bottom),(left+.5,bottom),(left+.5,bottom+.5),(left,bottom+.5)])
        tint=tuple(min(1,max(.01,color[i]*.75/means[tile][i])) for i in range(3))+(1,)
        colors.extend([tint]*4);rows.extend([row]*4);regions[str(tile)]+=1
    def Fiber(root,normal,flow,width,length,row,tile,color):
        flow-=normal*flow.dot(normal)
        if flow.length<.01:flow=normal.cross(Vector((1,0,0)))
        flow.normalize();across=flow.cross(normal).normalized();start=len(vertices)
        lower=root-normal*.0002;upper=root+flow*length+normal*rng.uniform(.0007,.0022)
        vertices.extend([lower-across*width/2,lower+across*width/2,upper]);faces.append((start,start+1,start+2))
        normals.extend([tuple(normal)]*3)
        left=.5*(tile%2);bottom=.5*(1-tile//2)
        u,v=left+.25,bottom+.07
        uvs.extend([(u-.0002,v),(u+.0002,v),(u,v+.0004)])
        tint=tuple(min(1,max(.003,color[i]*.75/means[tile][i])) for i in range(3))+(1,)
        colors.extend([tint,tint,tuple(min(1,value*1.10) for value in tint[:3])+(1,)])
        rows.extend([row]*3)
    color=skin.data.color_attributes['CoatColor']
    for sample in range(count):
        triangle=triangles[bisect.bisect_left(cumulative,rng.random()*total)]
        a,b=rng.random(),rng.random()
        if a+b>1:a,b=1-a,1-b
        bary=(1-a-b,a,b);ids=triangle.vertices
        root=sum((skin.data.vertices[i].co*w for i,w in zip(ids,bary)),Vector())
        normal=sum((skin.data.vertices[i].normal*w for i,w in zip(ids,bary)),Vector()).normalized()
        weights={}
        for i,w in zip(ids,bary):
            for group in skin.data.vertices[i].groups:
                name=skin.vertex_groups[group.group].name;weights[name]=weights.get(name,0)+group.weight*w
        row=dict(sorted(weights.items(),key=lambda item:item[1],reverse=True)[:4]);weightSum=sum(row.values());row={name:w/weightSum for name,w in row.items()}
        brightness=sum(sum(color.data[i].color[:3])/3*w for i,w in zip(ids,bary))
        rootColor=sum((Vector(color.data[i].color[:3])*w for i,w in zip(ids,bary)),Vector())
        pale=Smooth(.065,.17,brightness)
        tile=2 if rng.random()<pale else (1 if rng.random()<.12 else 0)
        if referenceFlow:
            limbMass=sum(w for name,w in row.items() if name.startswith(('DonkeyFront','DonkeyRear')))
            flow=referenceFlow['HairFlow'](root,limbMass)
        elif root.y>.88:flow=Vector((0,.45,-1))
        elif root.z<.62:flow=Vector((0,-.12,-1))
        elif root.y>.58:flow=Vector((0,-.72,-.75))
        else:flow=Vector((0,-1,-.30))
        flow+=Vector((rng.uniform(-.2,.2),rng.uniform(-.14,.14),rng.uniform(-.14,.14)))
        length=rng.uniform(.012,.023) if root.z<.20 else rng.uniform(.006,.013) if root.z>.60 else rng.uniform(.004,.009)
        Fiber(root,normal,flow,rng.uniform(.00025,.00065),length,row,tile,rootColor)
        if normal.z>.55 and root.z>.75 and rng.random()<.075:
            Add(root,normal,flow,rng.uniform(.008,.014),rng.uniform(.010,.017),row,tile,.0014,rootColor)
    # Soft ear rims and terminal tail brush share the same cutout atlas.
    for side in ('Left','Right'):
        ear=bpy.data.objects['DonkeyPinna'+side];ear.data.calc_loop_triangles()
        transform=rig.matrix_world.inverted()@ear.matrix_world
        for sample in range(180):
            triangle=rng.choice(list(ear.data.loop_triangles));a,b=rng.random(),rng.random()
            if a+b>1:a,b=1-a,1-b
            points=[transform@ear.data.vertices[i].co for i in triangle.vertices]
            root=points[0]*(1-a-b)+points[1]*a+points[2]*b
            normal=transform.to_3x3()@triangle.normal;normal.normalize()
            Add(root,normal,Vector((0,.12,1)),rng.uniform(.004,.007),rng.uniform(.005,.010),{'DonkeyEar'+side+'Pivot':1},3,.001,(.068,.063,.052),False)
    if bpy.context.scene.get('DonkeyReferenceFitRevision'):
        stem=bpy.data.objects['DonkeyThinTail'];matrix=rig.matrix_world.inverted()@stem.matrix_world
        stemPoints=[matrix@v.co for v in stem.data.vertices]
        for sample in range(48):
            height=rng.uniform(.90,.99);nearest=sorted(stemPoints,key=lambda p:abs(p.z-height))[:12];centre=sum(nearest,Vector())/len(nearest);centre.z=height
            angle=rng.uniform(0,2*math.pi);normal=Vector((math.cos(angle),math.sin(angle),0))
            root=centre+normal*rng.uniform(.008,.012)
            Add(root,normal,Vector((0,0,-1)),rng.uniform(.003,.005),rng.uniform(.010,.018),{'DonkeyTailPivot':1},0,.001,(.020,.019,.018),False)
    for sample in range(90):
        angle=rng.random()*2*math.pi;normal=Vector((math.cos(angle),math.sin(angle),0))
        if bpy.context.scene.get('DonkeyReferenceFitRevision'):
            stem=bpy.data.objects['DonkeyThinTail'];matrix=rig.matrix_world.inverted()@stem.matrix_world
            height=rng.uniform(.74,.88);points=sorted((matrix@v.co for v in stem.data.vertices),key=lambda p:abs(p.z-height))[:12]
            centre=sum(points,Vector())/len(points);centre.z=height
            root=centre+normal*rng.uniform(.002,.007);length=height-rng.uniform(.31,.46)
            flow=Vector((0,rng.uniform(-.12,.015),-1)).normalized();across=flow.cross(normal).normalized();start=len(vertices)
            width=rng.uniform(.008,.017)
            for t,half in ((0,width*.45),(.55,width*.55),(1,.0003)):
                centre=root+flow*length*t+normal*(.002*math.sin(math.pi*t))
                vertices.extend((centre-across*half,centre+across*half));normals.extend((tuple(normal),tuple(normal)))
                uvs.extend(((0,.5+.5*t),(.5,.5+.5*t)))
                tint=tuple(min(1,max(.003,value*.75/means[0][i])) for i,value in enumerate((.012,.011,.010)))+(1,)
                colors.extend((tint,tint));rows.extend(({'DonkeyTailTipPivot':1},{'DonkeyTailTipPivot':1}))
            faces.extend(((start,start+1,start+3,start+2),(start+2,start+3,start+5,start+4)));regions['0']+=2
            continue
        else:root=Vector((.010,-.295,rng.uniform(.43,.49)))+normal*rng.uniform(.002,.009);length=rng.uniform(.15,.20)
        Add(root,normal,Vector((0,-.035,-1)),rng.uniform(.010,.019),length,{'DonkeyTailTipPivot':1},0,.001,(.012,.011,.010),False)
    mesh=bpy.data.meshes.new('DonkeyShortCoatCards');mesh.from_pydata(vertices,[],faces);mesh.update();mesh.materials.append(material)
    for face in mesh.polygons:face.use_smooth=True
    mesh.normals_split_custom_set_from_vertices(normals)
    tint=mesh.color_attributes.new(name='HairTint',type='FLOAT_COLOR',domain='POINT')
    for i,value in enumerate(colors):tint.data[i].color=value
    uv=mesh.uv_layers.new(name='UVMap')
    for loop in mesh.loops:uv.data[loop.index].uv=uvs[loop.vertex_index]
    obj=bpy.data.objects.new('DonkeyShortCoatCards',mesh);collection.objects.link(obj);obj.parent=rig
    for index,row in enumerate(rows):
        for name,weight in row.items():
            group=obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name);group.add([index],weight,'REPLACE')
    modifier=obj.modifiers.new('DonkeyCoatSkin','ARMATURE');modifier.object=rig
    obj['coatAlphaCutoff']=.45;obj['coatCardCount']=sum(len(f)==4 for f in faces);obj['coatFibreCount']=count;obj['groomPrimitiveCount']=len(faces);obj['coatDensityPerM2']=count/total
    obj.visible_shadow=False;obj['groomCastShadow']=False
    return obj,{'fibres':count,'cards':sum(len(f)==4 for f in faces),'triangles':sum(len(f)-2 for f in faces),'regionCards':regions,'sampledSurfaceM2':total,'maxInfluences':4}

def DetailCoat(base,skin,collection):
    image=bpy.data.images.load(str(base/'SourceTextures/Texture_DonkeyCoatFiberShortSource.png'),check_existing=True)
    image.pack();copy=image.copy();copy.scale(1024,1024)
    p=np.array(copy.pixels[:],dtype=np.float32).reshape(1024,1024,4)
    gray=p[:,:,:3]@np.array([.2126,.7152,.0722],dtype=np.float32)
    pigment=np.clip(.55+.25*(gray/max(.01,float(np.mean(gray)))-1),.30,.80)
    albedo=np.ones_like(p);albedo[:,:,:3]=(1.055*pigment**(1/2.4)-.055)[:,:,None]
    tile=bpy.data.images.new('Texture_DonkeyCoatDetailBase',width=1024,height=1024,alpha=False)
    tile.pixels.foreach_set(albedo.ravel());tile.filepath_raw=str(base/'SourceTextures/Texture_DonkeyCoatDetailBase.png');tile.file_format='PNG';tile.save();tile.pack()
    blur=sum(np.roll(np.roll(gray,dy,axis=0),dx,axis=1) for dy in (-4,0,4) for dx in (-4,0,4))/9
    height=gray-blur
    dx=(np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))*3.2
    dy=(np.roll(height,-1,axis=0)-np.roll(height,1,axis=0))*3.2
    length=np.sqrt(dx*dx+dy*dy+1);values=np.empty_like(p)
    values[:,:,0]=(-dx/length+1)*.5;values[:,:,1]=(-dy/length+1)*.5;values[:,:,2]=(1/length+1)*.5;values[:,:,3]=1
    values[:8,:8,:3]=(.5,.5,1)
    normal=bpy.data.images.new('Texture_DonkeyCoatDetailNormal',width=1024,height=1024,alpha=False)
    normal.colorspace_settings.name='Non-Color';normal.pixels.foreach_set(values.ravel())
    normal.filepath_raw=str(base/'SourceTextures/Texture_DonkeyCoatDetailNormal.png');normal.file_format='PNG';normal.save();normal.pack()
    materials={m for obj in collection.objects if obj.type=='MESH' for m in obj.data.materials if m and m.name.startswith(('DonkeyCartGreyCoat','DonkeyLowerLegShortFur','DonkeyCartFaceFur','DonkeyCartEarInterior'))}
    for material in materials:
        nodes,links=material.node_tree.nodes,material.node_tree.links;nodes.clear()
        shader=nodes.new('ShaderNodeBsdfPrincipled');shader.inputs['Roughness'].default_value=.84;shader.inputs['Specular IOR Level'].default_value=.20
        output=nodes.new('ShaderNodeOutputMaterial');links.new(shader.outputs[0],output.inputs[0])
        uv=nodes.new('ShaderNodeUVMap');uv.uv_map='CoatFlowUV'
        tex=nodes.new('ShaderNodeTexImage');tex.image=tile;links.new(uv.outputs[0],tex.inputs[0])
        paint=nodes.new('ShaderNodeVertexColor');paint.layer_name='CoatColor'
        gain=nodes.new('ShaderNodeMixRGB');gain.blend_type='MULTIPLY';gain.inputs[0].default_value=1;gain.inputs[2].default_value=(.75/.55,.75/.55,.75/.55,1)
        links.new(paint.outputs[0],gain.inputs[1])
        multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
        links.new(gain.outputs[0],multiply.inputs[1]);links.new(tex.outputs[0],multiply.inputs[2]);links.new(multiply.outputs[0],shader.inputs['Base Color'])
        normalTexture=nodes.new('ShaderNodeTexImage');normalTexture.image=normal;links.new(uv.outputs[0],normalTexture.inputs[0])
        mapping=nodes.new('ShaderNodeNormalMap');mapping.uv_map='CoatFlowUV';mapping.inputs['Strength'].default_value=.65
        links.new(normalTexture.outputs[0],mapping.inputs['Color']);links.new(mapping.outputs[0],shader.inputs['Normal'])
    for obj in collection.objects:
        if obj.type!='MESH' or obj.name=='DonkeyShortCoatCards':continue
        source=obj.data.uv_layers.get('CoatFlowUV')
        if not source:continue
        layer=obj.data.uv_layers.new(name='FurDetailUV')
        transform=skin.parent.matrix_world.inverted()@obj.matrix_world
        for face in obj.data.polygons:
            furry=obj.data.materials[face.material_index] in materials
            normal=transform.to_3x3()@face.normal;axis=max(range(3),key=lambda i:abs(normal[i]))
            for loop in face.loop_indices:
                p=transform@obj.data.vertices[obj.data.loops[loop].vertex_index].co
                if axis==0:
                    head=Smooth(.84,1.00,p.y);leg=1-Smooth(.53,.68,p.z)
                    dy=-1*(1-head)+.45*head;dz=-.30*(1-head)-head
                    dy=dy*(1-leg)-.12*leg;dz=dz*(1-leg)-leg
                    length=math.hypot(dy,dz);dy/=length;dz/=length
                    coord=((dz*p.y-dy*p.z)/furRepeatM,(dy*p.y+dz*p.z)/furRepeatM)
                elif axis==1:coord=(p.x/furRepeatM,-p.z/furRepeatM)
                else:coord=(p.x/furRepeatM,-p.y/furRepeatM)
                source.data[loop].uv=coord
                layer.data[loop].uv=coord if furry else (.003,.003)

def RefineCoat(scene,base):
    skin=bpy.data.objects['DonkeyContinuousSkin'];rig=bpy.data.objects['DonkeyRig'];collection=bpy.data.collections['DonkeyEditable']
    if scene.get('DonkeyCoatRevision')=='20261023FurV3':raise RuntimeError('Load the V2 source before applying V3 coat')
    SurfaceShape(skin)
    ReferencePigment(skin);FineMane(rig,collection)
    # Match the undercoat pigment to card roots. The old coarse photo tint was
    # being multiplied twice; keep its microrelief while removing that blotch.
    for material in skin.data.materials:
        if not material.name.startswith(('DonkeyCartGreyCoat','DonkeyLowerLegShortFur')):continue
        nodes,links=material.node_tree.nodes,material.node_tree.links;shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
        paint=next(n for n in nodes if n.type=='VERTEX_COLOR')
        pigment=nodes.new('ShaderNodeMixRGB');pigment.blend_type='MULTIPLY';pigment.inputs[0].default_value=1;pigment.inputs[2].default_value=(.75,.75,.75,1)
        links.new(paint.outputs[0],pigment.inputs[1]);links.new(pigment.outputs[0],shader.inputs['Base Color'])
    previous=bpy.data.objects.get('DonkeyShortCoatSilhouette')
    if previous:bpy.data.objects.remove(previous,do_unlink=True)
    DetailCoat(base,skin,collection)
    material=HairMaterial(base);obj,report=BuildGroom(skin,rig,collection,material)
    scene['DonkeyCoatRevision']='20261023FurV3'
    report.update({'version':scene['DonkeyCoatRevision'],'method':'individual skinned short fibres, limited alpha-cutout edge tufts and tiled fibre normal detail on UV1',
                  'source':str(base/'SourceTextures/Texture_DonkeyShortFurCardsSource.png'),
                  'sourceSha256':hashlib.sha256((base/'SourceTextures/Texture_DonkeyShortFurCardsSource.png').read_bytes()).hexdigest(),
                  'alphaCutoff':.45,'material':'DonkeyShortCoatPbr','bodyShape':'shallow individual rib arcs, scapular hollow and pelvic crest',
                  'geometryBudget':80000,'runtimeGroomName':'DonkeyCoatRuntime','ribSurfaceAddedTriangles':skin['ribSurfaceAddedTriangles'],
                  'pigment':'charcoal gray-brown, warm worn rib peaks, pale underside and muzzle, subdued upper eyelid',
                  'detailNormalUv':'FurDetailUV; author-scaled short-coat flow, 0.22 m per texture repeat',
                  'detailTexelsPerMetre':1024/furRepeatM})
    (base/'Review/Data_CoatRefinement.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    return report
