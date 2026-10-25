"""Reference V3: anatomical surface cues and skinned, directional short-fur cards."""
import bpy,bmesh,math,random,json,hashlib,bisect
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
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

def BuildGroom(skin,rig,collection,material,count=21000,pigmentSampler=None):
    rng=random.Random(19381023);skin.data.calc_loop_triangles()
    useFringe=bool(bpy.context.scene.get('DonkeyReferencePaleFringe')) and pigmentSampler is not None
    referenceFlow={}
    if bpy.context.scene.get('DonkeyReferenceFitRevision'):
        file=__import__('pathlib').Path(bpy.context.scene['DonkeyCartProject'])/'_blender/Script_DonkeyCoatFlow.py'
        exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),referenceFlow)
    triangles=[];cumulative=[];total=0;coronetTriangles=[];coronetCumulative=[];coronetArea=0
    for triangle in skin.data.loop_triangles:
        face=skin.data.polygons[triangle.polygon_index]
        materialName=skin.data.materials[face.material_index].name
        if not materialName.startswith(('DonkeyCartGreyCoat','DonkeyLowerLegShortFur')):continue
        points=[skin.data.vertices[i].co for i in triangle.vertices];centre=sum(points,Vector())/3
        if bpy.context.scene.get('DonkeyReferenceFitRevision') and materialName.startswith('DonkeyLowerLegShortFur') and .065<centre.z<.083:
            coronetArea+=triangle.area;coronetCumulative.append(coronetArea);coronetTriangles.append(triangle)
        minimumFurZ=.12 if bpy.context.scene.get('DonkeyReferenceFitRevision') else .20
        if centre.z<minimumFurZ:continue
        if centre.y>1.16 and centre.z<1.13:continue
        area=triangle.area
        density=(.80 if bpy.context.scene.get('DonkeyJointFitReport') else .55) if centre.z<.55 else .65 if centre.y>.95 else 1
        if bpy.context.scene.get('DonkeyLowerLimbReliefReport') and .12<centre.z<.53:
            joint=max(math.exp(-((centre.z-.375)/.045)**2),math.exp(-((centre.z-.165)/.035)**2))
            density*=1+1.4*joint
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
    def Fiber(root,normal,flow,width,length,row,tile,color,liftScale=1,twist=0):
        flow-=normal*flow.dot(normal)
        if flow.length<.01:flow=normal.cross(Vector((1,0,0)))
        flow.normalize();across=flow.cross(normal).normalized();start=len(vertices)
        lift=rng.uniform(.0007,.0022)*liftScale
        if twist:
            direction=(flow*length+normal*lift).normalized();across=(across*math.cos(twist)+direction.cross(across)*math.sin(twist)).normalized()
        lower=root-normal*(.0002+(.55*width*abs(across.dot(normal)) if twist else 0));upper=root+flow*length+normal*lift
        vertices.extend([lower-across*width/2,lower+across*width/2,upper]);faces.append((start,start+1,start+2))
        normals.extend([tuple(normal)]*3)
        left=.5*(tile%2);bottom=.5*(1-tile//2)
        u,v=left+.25,bottom+.07
        uvs.extend([(u-.0002,v),(u+.0002,v),(u,v+.0004)])
        tint=tuple(min(1,max(.003,color[i]*.75/means[tile][i])) for i in range(3))+(1,)
        colors.extend([tint,tint,tuple(min(1,value*1.10) for value in tint[:3])+(1,)])
        rows.extend([row]*3)
        return lift
    color=skin.data.color_attributes['CoatColor']
    coronetFibres=min(480,count) if coronetTriangles else 0
    bellyFibres=0;bellyLengths=[];bellyLifts=[];bellyStripSamples=[]
    jointFibres=0;jointLengths=[];jointLifts=[]
    fringeFibres=0;fringeLengths=[];fringeLifts=[];fringeStripSamples=[];fringeTags={};fringeRoots={};fringeTips={};fringeTargets={};fringeDonors=[];redistributed=0
    def FringeAmounts(root,normal,foreMass):
        medial=max(0,normal.x*(1 if root.x<0 else -1))
        fore=Smooth(.45,.54,root.z)*(1-Smooth(.69,.77,root.z))*Smooth(.45,.55,root.y)*(1-Smooth(.86,.96,root.y))*Smooth(.45,.85,foreMass)*Smooth(.20,.65,medial)
        breast=(1-Smooth(.12,.18,abs(root.x)))*Smooth(.56,.64,root.z)*(1-Smooth(.76,.83,root.z))*Smooth(.55,.62,root.y)*(1-Smooth(.90,1.0,root.y))*Smooth(.10,.60,-normal.z)*(1-Smooth(.35,.70,foreMass))
        brightness=float(np.mean(pigmentSampler(root))) if max(fore,breast)>0 else 0
        breast*=Smooth(.025,.10,brightness);fore*=Smooth(.06,.16,brightness)
        return max(fore,breast),breast
    bodyTufts=0;bodyTuftLimit=bpy.context.scene.get('DonkeyReferenceBodyTuftLimit')
    for sample in range(count):
        coronet=sample<coronetFibres
        triangle=coronetTriangles[bisect.bisect_left(coronetCumulative,rng.random()*coronetArea)] if coronet else triangles[bisect.bisect_left(cumulative,rng.random()*total)]
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
        belly=0;fringe=0;breastFringe=0;jointFur=0
        if referenceFlow:
            limbMass=sum(w for name,w in row.items() if name.startswith(('DonkeyFront','DonkeyRear')))
            appearance=skin.data.attributes.get('LimbAppearanceMass')
            if appearance:limbMass=sum(sum(appearance.data[i].color)*w for i,w in zip(ids,bary))
            flow=referenceFlow['HairFlow'](root,limbMass)
            if bpy.context.scene.get('DonkeyLowerLimbReliefReport') and limbMass>.80 and .12<root.z<.53:
                jointFur=max(math.exp(-((root.z-.375)/.045)**2),math.exp(-((root.z-.165)/.035)**2))
                flow+=Vector((.38*math.tanh(root.x/.04),-.24,0))*jointFur
            # Pale ventral hairs hang down and stand farther off the skin.
            # Keep the same samples/random draws and leave limb/coronet fur
            # outside this bounded, softly blended anatomical region.
            belly=Smooth(.15,.65,-normal.z)*Smooth(.55,.61,root.z)*(1-Smooth(.77,.84,root.z))*Smooth(-.08,.02,root.y)*(1-Smooth(.50,.60,root.y))*Smooth(.06,.14,brightness)*(1-Smooth(.35,.65,limbMass))
            if belly>0:flow=flow.lerp(Vector((0,-.4,-1)).normalized(),belly)
            if useFringe:
                foreMass=sum(sum(appearance.data[i].color[:2])*w for i,w in zip(ids,bary)) if appearance else sum(w for name,w in row.items() if name.startswith('DonkeyFront'))
                fringe,breastFringe=FringeAmounts(root,normal,foreMass) if belly<.01 else (0,0)
                if fringe>0:flow=flow.lerp(Vector((.65*math.tanh(root.x/.035)*breastFringe/max(.0001,fringe),-.25,-1)).normalized(),fringe)
        elif root.y>.88:flow=Vector((0,.45,-1))
        elif root.z<.62:flow=Vector((0,-.12,-1))
        elif root.y>.58:flow=Vector((0,-.72,-.75))
        else:flow=Vector((0,-1,-.30))
        flow+=Vector((rng.uniform(-.2,.2),rng.uniform(-.14,.14),rng.uniform(-.14,.14)))
        length=rng.uniform(.009,.014) if coronet else rng.uniform(.012,.023) if root.z<.20 else rng.uniform(.006,.013) if root.z>.60 else rng.uniform(.004,.009)
        width=rng.uniform(.0007,.0012) if coronet else rng.uniform(.00025,.00065)
        first=len(vertices)
        lift=Fiber(root,normal,flow,width*(1+.75*belly+.5*fringe),length*(1+.55*belly+1.6*fringe+1.3*breastFringe+1.25*jointFur),row,tile,rootColor,1+2*belly+7*fringe+2*jointFur,.75*fringe)
        if jointFur>.10:
            jointFibres+=1;jointLengths.append(length*(1+1.25*jointFur));jointLifts.append(lift)
        if belly>.01:
            bellyFibres+=1;bellyLengths.append(length*(1+.55*belly));bellyLifts.append(lift)
        if belly>.65:bellyStripSamples.append((first,root.copy(),normal.copy(),flow.copy(),dict(row),rootColor.copy(),belly))
        if fringe>0:
            fringeTags.update({first+i:fringe for i in range(3)})
            fringeRoots.update({first+i:root.copy() for i in range(3)});fringeTips.update({first+i:float(i==2) for i in range(3)})
        if fringe>.01:
            fringeFibres+=1;fringeLengths.append(length*(1+1.6*fringe+1.3*breastFringe));fringeLifts.append(lift)
        if fringe>.60:fringeStripSamples.append((first,root.copy(),normal.copy(),flow.copy(),dict(row),rootColor.copy(),fringe,breastFringe))
        if useFringe and fringe>.30:
            key=tuple(triangle.vertices);weight=triangle.area*max(fringe,2*breastFringe)
            if key not in fringeTargets or weight>fringeTargets[key][1]:fringeTargets[key]=(triangle,weight)
        if useFringe and not coronet and belly<.01 and fringe<.01 and -.10<root.y<.94 and .25<root.z<1.14:fringeDonors.append(first)
        if normal.z>.55 and root.z>.75 and rng.random()<.075:
            tuftWidth=rng.uniform(.008,.014);tuftLength=rng.uniform(.010,.017)
            # Preserve random draws and all fine-fringe slots; bound only
            # the additional dorsal cards after a changed skin tessellation.
            if bodyTuftLimit is None or bodyTufts<bodyTuftLimit:
                Add(root,normal,flow,tuftWidth,tuftLength,row,tile,.0014,rootColor);bodyTufts+=1
    if useFringe and fringeTargets and fringeDonors:
        originalRng=rng;rng=random.Random(19381029);targets=list(fringeTargets.values());cdf=[];weightTotal=0
        for _,weight in targets:weightTotal+=weight;cdf.append(weightTotal)
        appearance=skin.data.attributes['LimbAppearanceMass']
        for first in rng.sample(fringeDonors,min(4000,len(fringeDonors))):
            accepted=None
            for attempt in range(12):
                triangle=targets[bisect.bisect_left(cdf,rng.random()*weightTotal)][0];a,b=rng.random(),rng.random()
                if a+b>1:a,b=1-a,1-b
                bary=(1-a-b,a,b);ids=triangle.vertices;root=sum((skin.data.vertices[i].co*w for i,w in zip(ids,bary)),Vector());normal=sum((skin.data.vertices[i].normal*w for i,w in zip(ids,bary)),Vector()).normalized()
                foreMass=sum(sum(appearance.data[i].color[:2])*w for i,w in zip(ids,bary));amount,breastAmount=FringeAmounts(root,normal,foreMass)
                if amount>.55:accepted=(amount,breastAmount);break
            if accepted is None:continue
            weights={}
            for i,w in zip(ids,bary):
                for group in skin.data.vertices[i].groups:
                    name=skin.vertex_groups[group.group].name;weights[name]=weights.get(name,0)+group.weight*w
            row=dict(sorted(weights.items(),key=lambda item:-item[1])[:4]);totalWeight=sum(row.values());row={name:w/totalWeight for name,w in row.items()}
            pigment=sum((Vector(color.data[i].color[:3])*w for i,w in zip(ids,bary)),Vector());flow=referenceFlow['HairFlow'](root,foreMass).lerp(Vector((.65*math.tanh(root.x/.035)*breastAmount/max(.0001,amount),-.25,-1)).normalized(),amount)
            flow+=Vector((rng.uniform(-.2,.2),rng.uniform(-.14,.14),rng.uniform(-.14,.14)));length=rng.uniform(.006,.013)*(1+1.6*amount+1.3*breastAmount);width=rng.uniform(.00025,.00065)*(1+.5*amount)
            start=len(vertices);faceCount=len(faces);lift=Fiber(root,normal,flow,width,length,row,2,pigment,1+7*amount,.75*amount)
            for values in [vertices,normals,uvs,rows,colors]:values[first:first+3]=values[start:start+3];del values[start:]
            del faces[faceCount:]
            for i in range(3):fringeTags[first+i]=amount;fringeRoots[first+i]=root.copy();fringeTips[first+i]=float(i==2)
            fringeFibres+=1;fringeLengths.append(length);fringeLifts.append(lift);redistributed+=1
            if amount>.60:fringeStripSamples.append((first,root.copy(),normal.copy(),flow.copy(),dict(row),pigment.copy(),amount,breastAmount))
        rng=originalRng
    # Reuse pairs of existing fine triangles for fine tapered strips. This
    # improves the ventral fringe without adding triangles or random draws.
    bellyStrips=min(400,len(bellyStripSamples)//2)
    for index in range(bellyStrips):
        a,b=bellyStripSamples[index*2:index*2+2];first,root,normal,flow,row,pigment,amount=a
        across=flow.cross(normal).normalized();length=.016+.006*amount;width=.0012+.0008*amount
        lower=root-normal*.0003-flow*.001;upper=root+flow*length+normal*(.003+.0035*amount)
        corners=[lower-across*width/2,lower+across*width/2,upper+across*width*.15,upper-across*width*.15]
        coordinates=[(.2498,.0700),(.2502,.0700),(.2502,.0704),(.2498,.0704)];tint=tuple(min(1,max(.003,pigment[c]*.75/means[2][c])) for c in range(3))+(1,)
        for vertex,corner in zip([a[0],a[0]+1,a[0]+2,b[0],b[0]+1,b[0]+2],[0,1,2,0,2,3]):
            vertices[vertex]=corners[corner];uvs[vertex]=coordinates[corner];normals[vertex]=tuple(normal);rows[vertex]=dict(row)
            colors[vertex]=tuple(min(1,v*(1.06 if corner>=2 else 1)) for v in tint[:3])+(1,)
    regions['2']+=bellyStrips
    # Four existing fibres become a two-segment curved wisp. All duplicated
    # shared corners retain the same skin weights through both segments.
    fringeStrips=min(1000,len(fringeStripSamples)//4)
    for index in range(fringeStrips):
        a,b,c,d=fringeStripSamples[index*4:index*4+4];first,root,normal,flow,row,pigment,amount,breastAmount=a
        flow-=normal*flow.dot(normal);flow.normalize();across=flow.cross(normal).normalized()
        length=(.024+.010*amount)*(1+.55*breastAmount/max(.0001,amount));width=.0006+.0007*amount;upper=root+flow*length+normal*(.006+.010*amount)
        direction=(upper-root).normalized();angle=.70+.20*((index*7)%5)/4;across=(across*math.cos(angle)+direction.cross(across)*math.sin(angle)).normalized()
        lower=root-normal*(.0003+width*.45*abs(across.dot(normal)))-flow*.001
        curl=(.003+.004*((index*11)%7)/6)*(1 if index%3 else -1)
        middle=root+flow*length*.50+normal*(.006+.010*amount)*.85+across*curl*.20
        upper=root+flow*length*.92+normal*(.006+.010*amount)*.90+across*curl
        corners=[lower-across*width/2,lower+across*width/2,middle+across*width*.55,middle-across*width*.55,upper+across*width*.10,upper-across*width*.10]
        coordinates=[(.2498,.0700),(.2502,.0700),(.2502,.0702),(.2498,.0702),(.2502,.0704),(.2498,.0704)];tint=tuple(min(1,max(.003,pigment[k]*.75/means[2][k])) for k in range(3))+(1,)
        slots=[s+i for s in [a[0],b[0],c[0],d[0]] for i in range(3)]
        for vertex,corner in zip(slots,[0,1,2,0,2,3,3,2,4,3,4,5]):
            vertices[vertex]=corners[corner];uvs[vertex]=coordinates[corner];normals[vertex]=tuple(normal);rows[vertex]=dict(row);fringeTags[vertex]=amount
            fringeRoots[vertex]=root.copy();fringeTips[vertex]=float(corner>=4)
            colors[vertex]=tuple(min(1,v*(1.06 if corner>=4 else 1)) for v in tint[:3])+(1,)
    regions['2']+=2*fringeStrips
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
        if bpy.context.scene.get('DonkeyReferenceFineTail'):break
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
    if useFringe:
        attribute=mesh.attributes.new(name='PaleFringeBlend',type='FLOAT',domain='POINT')
        for i,weight in fringeTags.items():attribute.data[i].value=weight
        roots=mesh.attributes.new(name='PaleFringeRoot',type='FLOAT_VECTOR',domain='POINT');tips=mesh.attributes.new(name='PaleFringeTip',type='FLOAT',domain='POINT')
        for i,point in fringeRoots.items():roots.data[i].vector=point;tips.data[i].value=fringeTips[i]
    uv=mesh.uv_layers.new(name='UVMap')
    for loop in mesh.loops:uv.data[loop.index].uv=uvs[loop.vertex_index]
    obj=bpy.data.objects.new('DonkeyShortCoatCards',mesh);collection.objects.link(obj);obj.parent=rig
    for index,row in enumerate(rows):
        for name,weight in row.items():
            group=obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name);group.add([index],weight,'REPLACE')
    modifier=obj.modifiers.new('DonkeyCoatSkin','ARMATURE');modifier.object=rig
    obj['coatAlphaCutoff']=.45;obj['coatCardCount']=sum(len(f)==4 for f in faces)+bellyStrips+2*fringeStrips;obj['coatFibreCount']=count-2*bellyStrips-4*fringeStrips;obj['coatRootSamples']=count;obj['groomPrimitiveCount']=len(faces);obj['coatDensityPerM2']=count/total
    obj.visible_shadow=False;obj['groomCastShadow']=False
    return obj,{'fibres':count-2*bellyStrips-4*fringeStrips,'rootSamples':count,'bodyTufts':bodyTufts,'bodyTuftLimit':bodyTuftLimit,'coronetFibres':coronetFibres,'coronetAreaM2':coronetArea,'coronetLengthM':[.009,.014],'coronetWidthM':[.0007,.0012],'cards':sum(len(f)==4 for f in faces)+bellyStrips+2*fringeStrips,'triangles':sum(len(f)-2 for f in faces),'regionCards':regions,'sampledSurfaceM2':total,'maxInfluences':4,
        'lowerLimbFur':{'sampleFibres':jointFibres,'jointDensityGain':2.4,'maximumLengthGain':2.25,'maximumLiftGain':3,'lengthRangeM':[min(jointLengths,default=0),max(jointLengths,default=0)],'liftRangeM':[min(jointLifts,default=0),max(jointLifts,default=0)],'method':'redistribute the fixed fine-fibre sample budget toward carpal/fetlock coats; longer, splayed tips follow their shallow joint relief'},
        'paleFringe':{'sampleFibres':fringeFibres,'redistributedBodySamples':redistributed,'curvedWisps':fringeStrips,'lengthRangeM':[min(fringeLengths,default=0),max(fringeLengths,default=0)],'liftRangeM':[min(fringeLifts,default=0),max(fringeLifts,default=0)],'wispLengthRangeM':[.030,.0527],'wispLiftRangeM':[.012,.016],'wispRootWidthRangeM':[.00102,.0013],'wispSegments':2,'method':'pale medial foreleg and breast fibres lengthened and lifted; body fine-fibre slots reallocated to the pale fringe with an independent deterministic stream; four existing triangles reused per curved strand; root sample and triangle budgets retained'},
        'bellyCoat':{'sampleFibres':bellyFibres,'fineFibres':bellyFibres-2*bellyStrips,'pairedStrips':bellyStrips,'sampleLengthRangeM':[min(bellyLengths,default=0),max(bellyLengths,default=0)],'sampleLiftRangeM':[min(bellyLifts,default=0),max(bellyLifts,default=0)],'stripLengthRangeM':[.0199,.022],'stripLiftRangeM':[.005275,.0065],'method':'bounded pale ventral fibres: downward/backward flow, up to 1.55x length and 3x normal lift; pairs of existing fine triangles reused as narrow opaque tapered strips; same source samples, random sequence and triangle budget'}}

def FringeLinearPixels(image):
    loaded=bpy.data.images.load(bpy.path.abspath(image.filepath_raw),check_existing=False);width,height=loaded.size
    pixels=np.array(loaded.pixels[:],dtype=np.float32).reshape(height,width,4)[:,:,:3];bpy.data.images.remove(loaded)
    return np.where(pixels<=.04045,pixels/12.92,((pixels+.055)/1.055)**2.4)

def FringeSamplePixels(pixels,uv):
    height,width=pixels.shape[:2];x=max(0,min(width-1,float(uv[0])*(width-1)));y=max(0,min(height-1,float(uv[1])*(height-1)));i,j=int(x),int(y);fx,fy=x-i,y-j
    return (pixels[j,i]*(1-fx)+pixels[j,min(width-1,i+1)]*fx)*(1-fy)+(pixels[min(height-1,j+1),i]*(1-fx)+pixels[min(height-1,j+1),min(width-1,i+1)]*fx)*fy

def BuildBodyPigmentSampler(animal,sourceSpace):
    bpy.context.view_layer.update()
    image=next(n.image for m in animal.data.materials for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.name.startswith('Texture_DonkeyAnimalBase'))
    pixels=FringeLinearPixels(image);animal.data.calc_loop_triangles();triangles=list(animal.data.loop_triangles)
    tree=BVHTree.FromPolygons([v.co for v in animal.data.vertices],[tuple(t.vertices) for t in triangles],all_triangles=True);transform=animal.matrix_world.inverted()@sourceSpace.matrix_world;uvMap=animal.data.uv_layers['UVMap'];cache={}
    report={'sourceSpace':sourceSpace.name,'bodyImage':image.name,'bodyPath':bpy.path.abspath(image.filepath_raw),'roots':0,'maximumSurfaceDistanceM':0,'samples':[]}
    def SampleRoot(root):
        point=transform@root;key=tuple(round(c,7) for c in point)
        if key not in cache:
            hit,_,index,distance=tree.find_nearest(point)
            if distance>.002:raise RuntimeError('Fringe pigment root is outside the corresponding body surface: '+str(distance))
            triangle=triangles[index];points=[animal.data.vertices[i].co for i in triangle.vertices];bary=barycentric_transform(hit,*points,Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
            uv=sum((uvMap.data[loop].uv*w for loop,w in zip(triangle.loops,bary)),Vector((0,0)));cache[key]=FringeSamplePixels(pixels,uv)
            report['roots']=len(cache);report['maximumSurfaceDistanceM']=max(report['maximumSurfaceDistanceM'],distance)
            if len(report['samples'])<12:report['samples'].append({'root':list(root),'distanceM':distance,'uv':list(uv),'linearRgb':cache[key].tolist()})
        return cache[key]
    return SampleRoot,report

def MatchPaleFringePigment(coat,animal,bodySampler=None):
    """Match new fringe roots to the actual baked body, after the UV0 bake."""
    mask=coat.data.attributes.get('PaleFringeBlend');roots=coat.data.attributes.get('PaleFringeRoot');tips=coat.data.attributes.get('PaleFringeTip')
    if not mask or not roots:return None
    bpy.context.view_layer.update()
    if bodySampler is None:bodySampler,_=BuildBodyPigmentSampler(animal,coat)
    image=next(n.image for n in coat.data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.name.startswith('Texture_DonkeyShortCoatBase'))
    pixels=FringeLinearPixels(image);uvs={loop.vertex_index:coat.data.uv_layers.active.data[loop.index].uv.copy() for loop in coat.data.loops};paint=coat.data.color_attributes['HairTint'];changes=[]
    for vertex in coat.data.vertices:
        i=vertex.index
        if mask.data[i].value<=0:continue
        target=bodySampler(roots.data[i].vector)*(1+.04*(tips.data[i].value if tips else 0));tint=np.clip(target/np.maximum(.01,FringeSamplePixels(pixels,uvs[i])),.003,1)
        old=np.array(paint.data[i].color[:3]);paint.data[i].color=(*tint,1);changes.append(float(np.max(np.abs(tint-old))))
    return {'method':'new fringe tints sampled from actual baked body UV0 at stored surface roots; atlas pigment normalized per vertex','vertices':len(changes),'maximumTintChange':max(changes,default=0),'hairImage':image.name,'existingGroomOutsideFringeChanged':False}

def RebuildPaleFringeAfterBake(skin,rig,collection,original,animal):
    sampler,samplerReport=BuildBodyPigmentSampler(animal,skin)
    candidate,report=BuildGroom(skin,rig,collection,original.data.materials[0],pigmentSampler=sampler)
    if len(candidate.data.vertices)!=len(original.data.vertices) or len(candidate.data.loops)!=len(original.data.loops):raise RuntimeError('Pale fringe changed the source vertex/triangle budget')
    mask=candidate.data.attributes['PaleFringeBlend'];oldNormals=[None]*len(original.data.vertices);newNormals=[None]*len(candidate.data.vertices)
    for loop in original.data.loops:oldNormals[loop.vertex_index]=original.data.corner_normals[loop.index].vector.copy()
    for loop in candidate.data.loops:newNormals[loop.vertex_index]=candidate.data.corner_normals[loop.index].vector.copy()
    preserved=0
    for a,b in zip(original.data.vertices,candidate.data.vertices):
        if mask.data[b.index].value>0:continue
        b.co=a.co;candidate.data.color_attributes['HairTint'].data[b.index].color=original.data.color_attributes['HairTint'].data[a.index].color;newNormals[b.index]=oldNormals[a.index];preserved+=1
        oldWeights={original.vertex_groups[g.group].name:g.weight for g in a.groups};newWeights={candidate.vertex_groups[g.group].name:g.weight for g in b.groups}
        if oldWeights!=newWeights:raise RuntimeError('Untouched fringe-exterior skin weights changed')
    for a,b in zip(original.data.loops,candidate.data.loops):
        if mask.data[b.vertex_index].value<=0:candidate.data.uv_layers.active.data[b.index].uv=original.data.uv_layers.active.data[a.index].uv
    candidate.data.normals_split_custom_set_from_vertices(newNormals);candidate.data.update()
    report['pigmentTransfer']=MatchPaleFringePigment(candidate,animal,sampler);report['pigmentSampler']=samplerReport;report['exteriorVerticesPreserved']=preserved
    name=original.name;bpy.data.objects.remove(original,do_unlink=True);candidate.name=name
    return candidate,report
