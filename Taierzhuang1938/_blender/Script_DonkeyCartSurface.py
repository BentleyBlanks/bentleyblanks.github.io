"""Directional short coat, aged elm and hand-worked cart detail for this asset."""
import bpy,math,random,hashlib,json
from mathutils import Vector,Matrix

def Smooth(a,b,value):
    t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)

def Nodes(material):
    material.use_nodes=True;material.node_tree.nodes.clear()
    nodes,links=material.node_tree.nodes,material.node_tree.links
    shader=nodes.new('ShaderNodeBsdfPrincipled');out=nodes.new('ShaderNodeOutputMaterial');links.new(shader.outputs[0],out.inputs[0])
    return nodes,links,shader

def ConfigureCoat(material,image,sculpt=None):
    nodes,links,shader=Nodes(material);shader.inputs['Roughness'].default_value=.72;shader.inputs['Specular IOR Level'].default_value=.18
    paint=nodes.new('ShaderNodeVertexColor');paint.layer_name='CoatColor'
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='CoatFlowUV'
    fur=nodes.new('ShaderNodeTexImage');fur.image=image;links.new(uv.outputs[0],fur.inputs['Vector'])
    value=nodes.new('ShaderNodeRGBToBW');links.new(fur.outputs['Color'],value.inputs[0])
    remap=nodes.new('ShaderNodeMapRange');remap.clamp=True
    for name,v in [('From Min',.025),('From Max',.32),('To Min',.63),('To Max',1.45)]:remap.inputs[name].default_value=v
    links.new(value.outputs[0],remap.inputs['Value'])
    multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
    neutral=nodes.new('ShaderNodeHueSaturation');neutral.inputs['Saturation'].default_value=.30;links.new(fur.outputs['Color'],neutral.inputs['Color'])
    gain=nodes.new('ShaderNodeMixRGB');gain.blend_type='MULTIPLY';gain.inputs[0].default_value=1;gain.inputs[2].default_value=(8,8,8,1)
    links.new(neutral.outputs['Color'],gain.inputs[1]);links.new(paint.outputs[0],multiply.inputs[1]);links.new(gain.outputs[0],multiply.inputs[2])
    tint=nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1;tint.inputs[2].default_value=(1.02,1.0,.98,1)
    links.new(multiply.outputs[0],tint.inputs[1]);links.new(tint.outputs[0],shader.inputs['Base Color'])
    coord=nodes.new('ShaderNodeTexCoord');patch=nodes.new('ShaderNodeTexNoise');patch.inputs['Scale'].default_value=18;patch.inputs['Detail'].default_value=3
    links.new(coord.outputs['Object'],patch.inputs['Vector'])
    patchRange=nodes.new('ShaderNodeMapRange');patchRange.inputs['To Min'].default_value=.78;patchRange.inputs['To Max'].default_value=1.22
    links.new(patch.outputs['Fac'],patchRange.inputs['Value'])
    pattern=nodes.new('ShaderNodeMixRGB');pattern.blend_type='MULTIPLY';pattern.inputs[0].default_value=1
    links.new(tint.outputs[0],pattern.inputs[1]);links.new(patchRange.outputs[0],pattern.inputs[2]);links.new(pattern.outputs[0],shader.inputs['Base Color'])
    rough=nodes.new('ShaderNodeMapRange')
    for name,v in [('From Min',.025),('From Max',.32),('To Min',.58),('To Max',.78)]:rough.inputs[name].default_value=v
    links.new(value.outputs[0],rough.inputs['Value']);links.new(rough.outputs[0],shader.inputs['Roughness'])
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.35;bump.inputs['Distance'].default_value=.0012
    links.new(remap.outputs[0],bump.inputs['Height']);links.new(bump.outputs['Normal'],shader.inputs['Normal'])
    if sculpt:
        tex=nodes.new('ShaderNodeTexImage');tex.image=sculpt
        original=nodes.new('ShaderNodeUVMap');original.uv_map='UVMap';links.new(original.outputs[0],tex.inputs['Vector'])
        normal=nodes.new('ShaderNodeNormalMap');normal.uv_map='UVMap';normal.inputs['Strength'].default_value=.22
        links.new(tex.outputs[0],normal.inputs['Color']);links.new(normal.outputs[0],bump.inputs['Normal'])

def ConfigureWood(material,image,dark=False):
    nodes,links,shader=Nodes(material);shader.inputs['Roughness'].default_value=.87;shader.inputs['Specular IOR Level'].default_value=.20
    coordinate=nodes.new('ShaderNodeUVMap');coordinate.uv_map='TimberFlowUV'
    tex=nodes.new('ShaderNodeTexImage');tex.image=image;links.new(coordinate.outputs[0],tex.inputs['Vector'])
    neutral=nodes.new('ShaderNodeHueSaturation');neutral.inputs['Saturation'].default_value=.35;links.new(tex.outputs['Color'],neutral.inputs['Color'])
    tint=nodes.new('ShaderNodeAttribute');tint.attribute_name='TimberTint'
    multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
    links.new(neutral.outputs['Color'],multiply.inputs[1]);links.new(tint.outputs['Color'],multiply.inputs[2])
    gain=nodes.new('ShaderNodeMixRGB');gain.blend_type='MULTIPLY';gain.inputs[0].default_value=1;gain.inputs[2].default_value=((.24,.24,.23,1) if dark else (.34,.34,.33,1))
    links.new(multiply.outputs[0],gain.inputs[1]);links.new(gain.outputs[0],shader.inputs['Base Color'])
    edge=nodes.new('ShaderNodeBevel');edge.inputs['Radius'].default_value=.0013;edge.samples=4
    height=nodes.new('ShaderNodeMapRange');height.inputs['From Min'].default_value=.10;height.inputs['From Max'].default_value=.60
    links.new(tex.outputs['Color'],height.inputs['Value'])
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.38;bump.inputs['Distance'].default_value=.0020
    links.new(height.outputs[0],bump.inputs['Height']);links.new(edge.outputs['Normal'],bump.inputs['Normal']);links.new(bump.outputs[0],shader.inputs['Normal'])
    rough=nodes.new('ShaderNodeMapRange');rough.inputs['To Min'].default_value=.88;rough.inputs['To Max'].default_value=.98
    links.new(tex.outputs['Color'],rough.inputs['Value']);links.new(rough.outputs[0],shader.inputs['Roughness'])

def EndGrain():
    material=bpy.data.materials.new('DonkeyCartExposedEndGrain');nodes,links,shader=Nodes(material)
    shader.inputs['Roughness'].default_value=.92
    attr=nodes.new('ShaderNodeAttribute');attr.attribute_name='TimberCoordinates'
    separate=nodes.new('ShaderNodeSeparateXYZ');links.new(attr.outputs['Vector'],separate.inputs[0])
    planar=nodes.new('ShaderNodeCombineXYZ');links.new(separate.outputs['X'],planar.inputs['X']);links.new(separate.outputs['Z'],planar.inputs['Z'])
    length=nodes.new('ShaderNodeVectorMath');length.operation='LENGTH';links.new(planar.outputs[0],length.inputs[0])
    phase=nodes.new('ShaderNodeMath');phase.operation='MULTIPLY';phase.inputs[1].default_value=90;links.new(length.outputs['Value'],phase.inputs[0])
    wave=nodes.new('ShaderNodeMath');wave.operation='SINE';links.new(phase.outputs[0],wave.inputs[0])
    ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.065,.057,.045,1);ramp.color_ramp.elements[1].color=(.15,.13,.10,1)
    links.new(wave.outputs[0],ramp.inputs[0]);links.new(ramp.outputs[0],shader.inputs['Base Color'])
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.20;bump.inputs['Distance'].default_value=.0007
    links.new(wave.outputs[0],bump.inputs['Height']);links.new(bump.outputs[0],shader.inputs['Normal'])
    return material

def ConfigureCloth(material):
    nodes,links,shader=Nodes(material);shader.inputs['Roughness'].default_value=.95
    coord=nodes.new('ShaderNodeTexCoord');weave=nodes.new('ShaderNodeTexNoise');weave.inputs['Scale'].default_value=700;weave.inputs['Detail'].default_value=2
    links.new(coord.outputs['Object'],weave.inputs['Vector'])
    ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.075,.055,.035,1);ramp.color_ramp.elements[1].color=(.105,.079,.050,1)
    links.new(weave.outputs['Fac'],ramp.inputs[0]);links.new(ramp.outputs[0],shader.inputs['Base Color'])
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.30;bump.inputs['Distance'].default_value=.00022
    links.new(weave.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs[0],shader.inputs['Normal'])

def SilhouetteMaterial():
    material=bpy.data.materials.get('DonkeyCoatSilhouetteFibre') or bpy.data.materials.new('DonkeyCoatSilhouetteFibre')
    nodes,links,shader=Nodes(material);shader.inputs['Roughness'].default_value=.70;shader.inputs['Specular IOR Level'].default_value=.18
    paint=nodes.new('ShaderNodeVertexColor');paint.layer_name='CoatColor'
    multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1;multiply.inputs[2].default_value=(.32,.32,.32,1)
    links.new(paint.outputs[0],multiply.inputs[1]);links.new(multiply.outputs[0],shader.inputs['Base Color'])
    return material

def ReplaceRigidMesh(obj,vertices,faces):
    bone=obj.vertex_groups[0].name if len(obj.vertex_groups) else None
    old=obj.data;mesh=bpy.data.meshes.new(obj.name+'Refined');mesh.from_pydata(vertices,[],faces);mesh.update()
    for material in old.materials:mesh.materials.append(material)
    obj.data=mesh;obj.vertex_groups.clear()
    if bone:obj.vertex_groups.new(name=bone).add(list(range(len(vertices))),1,'REPLACE')
    for face in mesh.polygons:face.use_smooth=False
    for modifier in list(obj.modifiers):
        if modifier.type!='ARMATURE':obj.modifiers.remove(modifier)

def RefineSpoke(obj):
    world=[obj.matrix_world@v.co for v in obj.data.vertices]
    # The original local Z axis follows the spoke; preserve the authored hub
    # and rim insertion positions rather than guessing endpoints from a bbox.
    axis=(obj.matrix_world.to_3x3()@Vector((0,0,1))).normalized()
    centre=sum(world,Vector())/len(world);projections=[(p-centre).dot(axis) for p in world]
    start=centre+axis*min(projections);length=max(projections)-min(projections)
    x=Vector((1,0,0));z=x.cross(axis).normalized();basis=Matrix((x,axis,z)).transposed()
    inverse=obj.matrix_world.inverted();verts=[];faces=[]
    for station in range(5):
        t=station/4;halfX=(.041-.010*t)/2;halfZ=(.051-.017*t)/2;r=.004
        cross=[(-halfX+r,-halfZ),(halfX-r,-halfZ),(halfX,-halfZ+r),(halfX,halfZ-r),(halfX-r,halfZ),(-halfX+r,halfZ),(-halfX,halfZ-r),(-halfX,-halfZ+r)]
        for xx,zz in cross:verts.append(inverse@(start+basis@Vector((xx,t*length,zz))))
        if station:
            for j in range(8):faces.append(((station-1)*8+j,(station-1)*8+(j+1)%8,station*8+(j+1)%8,station*8+j))
    faces.extend([tuple(reversed(range(8))),tuple(32+j for j in range(8))]);ReplaceRigidMesh(obj,verts,faces)

def RefineSmallIronHead(obj):
    cx=(max(v.co.x for v in obj.data.vertices)+min(v.co.x for v in obj.data.vertices))/2
    cy=(max(v.co.y for v in obj.data.vertices)+min(v.co.y for v in obj.data.vertices))/2
    radius=max(math.hypot(v.co.x-cx,v.co.y-cy) for v in obj.data.vertices)
    low=min(v.co.z for v in obj.data.vertices);high=max(v.co.z for v in obj.data.vertices)
    verts=[];faces=[]
    for row,(z,r) in enumerate(((low,radius*.78),((low+high)*.5,radius),(high,radius*.78))):
        for j in range(8):
            theta=j*math.pi/4;verts.append((cx+r*math.cos(theta),cy+r*math.sin(theta),z))
        if row:
            for j in range(8):faces.append(((row-1)*8+j,(row-1)*8+(j+1)%8,row*8+(j+1)%8,row*8+j))
    faces.extend([tuple(reversed(range(8))),tuple(16+j for j in range(8))]);ReplaceRigidMesh(obj,verts,faces)

def RefineCart(cartRig):
    changed=[]
    for obj in list(bpy.data.objects):
        if obj.type!='MESH' or obj.parent!=cartRig:continue
        if obj.name.startswith('WheelSpoke') and not obj.name.startswith('WheelSpokeHub'):RefineSpoke(obj)
        if obj.name.startswith(('CartStakeNail','HubPlateRivet','TyreRivet')):RefineSmallIronHead(obj)
        world=obj.matrix_world;inverse=world.inverted()
        if obj.name.startswith(('CartFloorPlank','CartSideBoard','CartEndBoard')):
            points=[v.co for v in obj.data.vertices];spans=[max(p[i] for p in points)-min(p[i] for p in points) for i in range(3)]
            axis=max(range(3),key=lambda i:spans[i]);cross=max((i for i in range(3) if i!=axis),key=lambda i:spans[i])
            phase=int(hashlib.sha256(obj.name.encode()).hexdigest()[:4],16)/65535*2*math.pi
            for vertex in obj.data.vertices:
                p=vertex.co;t=p[axis]/spans[axis]+.5;edge=Smooth(.65,.90,abs(p[cross])/(spans[cross]/2))
                chip=.0035*(.5+.5*math.sin(t*31+phase))**8*edge
                p[cross]-=math.copysign(chip,p[cross])
        if obj.name.startswith('CartShaft'):
            for vertex in obj.data.vertices:
                p=world@vertex.co;p.z-=.065*Smooth(.86,1.06,-p.y);vertex.co=inverse@p
        elif not obj.name.startswith(('Wheel','HubPlate','Tyre','Harness')):
            for vertex in obj.data.vertices:
                p=world@vertex.co;p.y=-1.58+(p.y+1.58)*.80;p.z-=.070*Smooth(.40,.54,p.z);vertex.co=inverse@p
            changed.append(obj.name)
        obj.data.update()
    cartRig['authoredBedLengthM']=1.52*.80;cartRig['cartRefinement']='shorter lower bed; tapered elm spokes; domed small iron fasteners'
    print(json.dumps({'refinedCartComponents':len(changed),'bedLengthM':cartRig['authoredBedLengthM']}))

def TimberCoordinates(objects,wood,woodDark):
    end=EndGrain()
    for obj in objects:
        if obj.type!='MESH' or not any(m in (wood,woodDark) for m in obj.data.materials):continue
        rng=random.Random(int(hashlib.sha256(obj.name.encode()).hexdigest()[:8],16))
        points=[v.co for v in obj.data.vertices];spans=[max(p[i] for p in points)-min(p[i] for p in points) for i in range(3)]
        axis=max(range(3),key=lambda i:spans[i]);other=[i for i in range(3) if i!=axis]
        coords=obj.data.attributes.get('TimberCoordinates') or obj.data.attributes.new('TimberCoordinates','FLOAT_VECTOR','POINT')
        tint=obj.data.color_attributes.get('TimberTint') or obj.data.color_attributes.new(name='TimberTint',type='FLOAT_COLOR',domain='POINT')
        offset=(rng.uniform(-2,2),rng.uniform(-2,2),rng.uniform(-2,2));tone=rng.uniform(.77,1.08)
        for vertex in obj.data.vertices:
            p=vertex.co;coords.data[vertex.index].vector=(p[other[0]]/.22+offset[0],p[axis]/.72+offset[1],p[other[1]]/.22+offset[2])
            tint.data[vertex.index].color=(tone,tone*.985,tone*.96,1)
        obj.data.materials.append(end);endIndex=len(obj.data.materials)-1
        uv=obj.data.uv_layers.get('TimberFlowUV') or obj.data.uv_layers.new(name='TimberFlowUV')
        for face in obj.data.polygons:
            if abs(face.normal[axis])>.92:face.material_index=endIndex
            normalAxis=max(other,key=lambda i:abs(face.normal[i]));crossAxis=next(i for i in other if i!=normalAxis)
            for loopIndex in face.loop_indices:
                p=obj.data.vertices[obj.data.loops[loopIndex].vertex_index].co
                uv.data[loopIndex].uv=(p[crossAxis]/.22+offset[0],p[axis]/.72+offset[1])

def CoatCoordinates(objects,image):
    for obj in objects:
        if obj.type!='MESH' or not any(m and m.use_nodes and any(n.type=='TEX_IMAGE' and n.image==image for n in m.node_tree.nodes) for m in obj.data.materials):continue
        uv=obj.data.uv_layers.get('CoatFlowUV') or obj.data.uv_layers.new(name='CoatFlowUV')
        for face in obj.data.polygons:
            normal=face.normal;axis=max(range(3),key=lambda i:abs(normal[i]))
            for loopIndex in face.loop_indices:
                p=obj.data.vertices[obj.data.loops[loopIndex].vertex_index].co
                a,b=(p.y-.30*p.z,p.z) if axis==0 else (p.x,p.z) if axis==1 else (p.x,p.y)
                uv.data[loopIndex].uv=(a/.20,b/.20)

def ShortCoatGroom(skin,rig,collection,material):
    rng=random.Random(19381022);vertices=[];faces=[];rows=[];colors=[]
    candidates=[v for v in skin.data.vertices if .56<v.co.z<1.18 and -.35<v.co.y<.95 and (abs(v.normal.z)>.23 or abs(v.normal.y)>.30)]
    for source in rng.sample(candidates,min(1900,len(candidates))):
        normal=source.normal.normalized();axis=(normal*.8+Vector((0,-.35,-.20))).normalized()
        tangent=axis.cross(Vector((1,0,0)))
        if tangent.length<.1:tangent=axis.cross(Vector((0,1,0)))
        tangent.normalize();cross=axis.cross(tangent);root=source.co-normal*.0007;width=rng.uniform(.00015,.00035)
        start=len(vertices)
        for theta in (0,2*math.pi/3,4*math.pi/3):vertices.append(root+width*(math.cos(theta)*tangent+math.sin(theta)*cross))
        vertices.append(root+axis*rng.uniform(.004,.008))
        faces.extend([(start,start+1,start+3),(start+1,start+2,start+3),(start+2,start,start+3),(start+2,start+1,start)])
        row={skin.vertex_groups[g.group].name:g.weight for g in source.groups};rows.extend([row]*4)
        color=skin.data.color_attributes['CoatColor'].data[source.index].color;colors.extend([tuple(color)]*4)
    data=bpy.data.meshes.new('DonkeyShortCoatSilhouette');data.from_pydata(vertices,[],faces);data.materials.append(material)
    for face in data.polygons:face.use_smooth=True
    obj=bpy.data.objects.new('DonkeyShortCoatSilhouette',data);collection.objects.link(obj);obj.parent=rig
    attribute=data.color_attributes.new(name='CoatColor',type='FLOAT_COLOR',domain='POINT')
    for i,row in enumerate(rows):
        attribute.data[i].color=colors[i]
        for name,value in row.items():
            group=obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name);group.add([i],value,'REPLACE')
    mod=obj.modifiers.new('DonkeyCoatSkin','ARMATURE');mod.object=rig
    return obj

def RefineSurfaces(scene,sourceDir,skin,rig,cartRig,donkeyCol,wood,woodDark,iron,cloth,leather,hemp):
    fur=bpy.data.images.load(str(sourceDir/'SourceTextures/Texture_DonkeyWeatheredCoatSourceV3.png'),check_existing=True);fur.pack()
    elm=bpy.data.images.load(str(sourceDir/'SourceTextures/Texture_DonkeyAgedElmSourceV3.png'),check_existing=True);elm.pack()
    sourceMaterials={m for obj in bpy.data.objects if obj.type=='MESH' and obj.parent==rig for m in obj.data.materials if m}
    for material in sourceMaterials:
        if material.name.startswith('DonkeyCartEarInterior'):
            for node in material.node_tree.nodes:
                if node.type=='TEX_IMAGE':
                    node.image=fur;node.projection='FLAT';uv=material.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map='CoatFlowUV';material.node_tree.links.new(uv.outputs[0],node.inputs['Vector'])
        if material.name.startswith('DonkeyCartDarkHair'):
            shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.66;shader.inputs['Specular IOR Level'].default_value=.34
        if not material.name.startswith(('DonkeyCartGreyCoat','DonkeyCartFaceFur','DonkeyLowerLegShortFur')):continue
        sculpt=next((n.image for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.colorspace_settings.name=='Non-Color'),None) if material.name.startswith('DonkeyCartGreyCoat') else None
        ConfigureCoat(material,fur,sculpt)
    ConfigureWood(wood,elm);ConfigureWood(woodDark,elm,True)
    for node in iron.node_tree.nodes:
        if node.type=='VALTORGB':
            node.color_ramp.elements[0].position=.40;node.color_ramp.elements[1].position=.80
            node.color_ramp.elements[0].color=(.018,.017,.015,1);node.color_ramp.elements[1].color=(.080,.043,.022,1)
    for material,distance in ((cloth,.00035),(leather,.0003),(hemp,.00045)):
        for node in material.node_tree.nodes:
            if node.type=='BUMP':
                twist=material==hemp and any(link.from_node.type=='MATH' for link in node.inputs['Height'].links)
                node.inputs['Distance'].default_value=.0012 if twist else distance
    ConfigureCloth(cloth)
    RefineCart(cartRig)
    ShortCoatGroom(skin,rig,donkeyCol,SilhouetteMaterial())
    objects=list(bpy.data.objects);TimberCoordinates(objects,wood,woodDark);CoatCoordinates(objects,fur)
    scene['DonkeySurfaceRevision']='20261022UpperLegsCoatCartV3'
