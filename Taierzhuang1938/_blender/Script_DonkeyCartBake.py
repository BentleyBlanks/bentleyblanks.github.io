"""Editable reference-led donkey and two-wheel cart, metres, Blender +Y forward.

Run with this task's Script_BlenderMcp.mjs exec. Sources and review images stay
outside Git. Retained CC0 equine skin is anatomically reshaped, reweighted and
recoloured; harness, cart, groom, joints and actions are authored for this donkey.
"""
import bpy, bmesh, math, json, random
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

project = Path(bpy.context.scene.get('DonkeyCartProject', 'C:/Users/Bentl/Documents/bentleyblanks_Codex_DonkeyCart_20261020/Taierzhuang1938'))
sourceDir = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020')
reviewDir = sourceDir / 'Review'
reviewDir.mkdir(parents=True, exist_ok=True)
rng = random.Random(19381020)
headForwardScale=.80
headPollY=1.08
headVerticalOffset=-.03
hindForwardShift=.135
animalPlacementY=-.215
wheelRadius=.40

if bpy.context.object and bpy.context.object.mode != 'OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
for obj in list(bpy.data.objects): bpy.data.objects.remove(obj, do_unlink=True)
scene = bpy.context.scene
scene['DonkeyCartProject'] = str(project)
scene['BlenderMcpTask'] = 'DonkeyCart20261020'
scene.unit_settings.system = 'METRIC'
scene.render.fps = 30
scene.frame_start = 1
scene.frame_end = 49

def Collection(name):
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if col.name not in scene.collection.children: scene.collection.children.link(col)
    return col

donkeyCol = Collection('DonkeyEditable')
cartCol = Collection('CartEditable')
harnessCol = Collection('HarnessEditable')
studioCol = Collection('ReviewStudio')

def MoveTo(obj, col):
    for old in list(obj.users_collection): old.objects.unlink(obj)
    col.objects.link(obj)
    return obj

def Material(name, color, roughness=.8, metallic=0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    shader = nodes.new('ShaderNodeBsdfPrincipled')
    mat.node_tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    mat.diffuse_color = (*color, 1)
    return mat

def SurfaceNoise(mat, scale, strength, distance, stretch=(1,1,1)):
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    tex = nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value = scale
    tex.inputs['Detail'].default_value = 3
    coord = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeVectorMath'); mapping.operation = 'MULTIPLY'
    mapping.inputs[1].default_value = stretch
    links.new(coord.outputs['Object'], mapping.inputs[0]); links.new(mapping.outputs['Vector'],tex.inputs['Vector'])
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=strength;bump.inputs['Distance'].default_value=distance
    links.new(tex.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])
    return tex

wood = Material('DonkeyCartWeatheredElm', (.205,.170,.126), .91)
woodDark = Material('DonkeyCartEndGrain', (.115,.088,.060), .94)
iron = Material('DonkeyCartOxidisedIron', (.074,.063,.049), .76, .50)
leather = Material('DonkeyCartOldLeather', (.054,.035,.020), .92)
cloth = Material('DonkeyCartPaddedHemp', (.095,.071,.048), .98)
hemp = Material('DonkeyCartTwistedHemp', (.145,.111,.070), .93)
hair = Material('DonkeyCartDarkHair', (.016,.014,.011), .81)
eyeMat = Material('DonkeyCartEye', (.008,.005,.003), .16)
mouthMat = Material('DonkeyCartMouth', (.043,.037,.030), .79)
SurfaceNoise(wood, 7, .47, .012, (8, .16, 10))
SurfaceNoise(woodDark, 13, .40, .006, (7,.4,8))
SurfaceNoise(iron, 45, .38, .002)
SurfaceNoise(leather, 140, .30, .0014)
SurfaceNoise(cloth, 240, .55, .0018)
SurfaceNoise(hemp, 290, .47, .001)
hempNodes,hempLinks=hemp.node_tree.nodes,hemp.node_tree.links
ropeUv=hempNodes.new('ShaderNodeUVMap');ropeUv.uv_map='RopeUV'
splitUv=hempNodes.new('ShaderNodeSeparateXYZ');hempLinks.new(ropeUv.outputs['UV'],splitUv.inputs[0])
strandCount=hempNodes.new('ShaderNodeMath');strandCount.operation='MULTIPLY';strandCount.inputs[1].default_value=3;hempLinks.new(splitUv.outputs['X'],strandCount.inputs[0])
lay=hempNodes.new('ShaderNodeMath');lay.operation='ADD';hempLinks.new(strandCount.outputs[0],lay.inputs[0]);hempLinks.new(splitUv.outputs['Y'],lay.inputs[1])
phase=hempNodes.new('ShaderNodeMath');phase.operation='MULTIPLY';phase.inputs[1].default_value=2*math.pi;hempLinks.new(lay.outputs[0],phase.inputs[0])
groove=hempNodes.new('ShaderNodeMath');groove.operation='SINE';hempLinks.new(phase.outputs[0],groove.inputs[0])
twist=hempNodes.new('ShaderNodeBump');twist.inputs['Strength'].default_value=.40;twist.inputs['Distance'].default_value=.0016
hempLinks.new(groove.outputs[0],twist.inputs['Height']);hempLinks.new(next(n for n in hempNodes if n.type=='BUMP' and n!=twist).outputs['Normal'],twist.inputs['Normal']);hempLinks.new(twist.outputs['Normal'],hempNodes.get('Principled BSDF').inputs['Normal'])

def TintNoise(mat, low, high):
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    tex=next(node for node in nodes if node.bl_idname=='ShaderNodeTexNoise')
    ramp=nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position=.22;ramp.color_ramp.elements[0].color=(*low,1)
    ramp.color_ramp.elements[1].position=.80;ramp.color_ramp.elements[1].color=(*high,1)
    links.new(tex.outputs['Fac'],ramp.inputs['Fac']);links.new(ramp.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])

TintNoise(wood,(.055,.052,.046),(.240,.225,.200))
TintNoise(iron,(.065,.060,.052),(.220,.140,.070))
TintNoise(cloth,(.040,.029,.019),(.127,.095,.063))
elmImage=bpy.data.images.load(str(sourceDir/'SourceTextures/Texture_DonkeyCartWeatheredElmSource.png'),check_existing=True);elmImage.pack()
for timber in (wood,woodDark):
    nodes,links=timber.node_tree.nodes,timber.node_tree.links;shader=nodes.get('Principled BSDF')
    coordinate=nodes.new('ShaderNodeAttribute');coordinate.attribute_name='TimberCoordinates'
    imageNode=nodes.new('ShaderNodeTexImage');imageNode.image=elmImage;links.new(coordinate.outputs['Vector'],imageNode.inputs['Vector'])
    neutral=nodes.new('ShaderNodeHueSaturation');neutral.inputs['Saturation'].default_value=.18;links.new(imageNode.outputs['Color'],neutral.inputs['Color'])
    gain=nodes.new('ShaderNodeMixRGB');gain.blend_type='MULTIPLY';gain.inputs[0].default_value=1;gain.inputs[2].default_value=(2.4,2.4,2.4,1);links.new(neutral.outputs['Color'],gain.inputs[1])
    sourceLink=next((l.from_socket for l in links if l.to_socket==shader.inputs['Base Color']),None)
    multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=.78
    if sourceLink:links.new(sourceLink,multiply.inputs[1])
    else:multiply.inputs[1].default_value=shader.inputs['Base Color'].default_value
    links.new(gain.outputs['Color'],multiply.inputs[2]);links.new(multiply.outputs['Color'],shader.inputs['Base Color'])
    bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.45;bump.inputs['Distance'].default_value=.0025
    links.new(imageNode.outputs['Color'],bump.inputs['Height']);links.new(bump.outputs['Normal'],shader.inputs['Normal'])
ironNodes,ironLinks=iron.node_tree.nodes,iron.node_tree.links
ironNoise=next(node for node in ironNodes if node.type=='TEX_NOISE');ironShader=ironNodes.get('Principled BSDF')
for socket,low,high in [('Metallic',.70,.05),('Roughness',.65,.98)]:
    remap=ironNodes.new('ShaderNodeMapRange');remap.inputs['From Min'].default_value=.30;remap.inputs['From Max'].default_value=.75;remap.inputs['To Min'].default_value=low;remap.inputs['To Max'].default_value=high
    ironLinks.new(ironNoise.outputs['Fac'],remap.inputs['Value']);ironLinks.new(remap.outputs['Result'],ironShader.inputs[socket])

def Finish(obj,name,mat,col,smooth=False,bevel=0):
    obj.name=name; MoveTo(obj,col)
    obj.data.materials.clear(); obj.data.materials.append(mat)
    if smooth:
        for face in obj.data.polygons: face.use_smooth=True
    if bevel:
        mod=obj.modifiers.new('WornArris','BEVEL');mod.width=bevel;mod.segments=2
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
        normals=obj.modifiers.new('TimberNormals','WEIGHTED_NORMAL');normals.keep_sharp=True
    return obj

def Mesh(name,verts,faces,mat,col,smooth=True):
    data=bpy.data.meshes.new(name+'Mesh');data.from_pydata(verts,[],faces);data.update()
    obj=bpy.data.objects.new(name,data);col.objects.link(obj)
    obj.data.materials.append(mat)
    for face in obj.data.polygons:face.use_smooth=smooth
    return obj

def Box(name,center,size,mat=wood,col=cartCol,bevel=.006):
    if name.startswith(('CartFloorPlank','CartSideBoard','CartEndBoard')):
        return Plank(name,center,size,mat,col)
    bpy.ops.mesh.primitive_cube_add(size=1,location=center)
    obj=bpy.context.object;obj.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return Finish(obj,name,mat,col,False,bevel)

def Plank(name,center,size,mat,col):
    crossX,length,crossZ=size;axisX=name.startswith('CartEndBoard')
    if axisX:crossX,length=size[1],size[0]
    w,h=crossX/2,crossZ/2;r=min(.004,w*.3,h*.3)
    corners=[(-w+r,-h),(w-r,-h),(w,-h+r),(w,h-r),(w-r,h),(-w+r,h),(-w,h-r),(-w,-h+r)]
    verts=[];faces=[];bend=rng.uniform(-.005,.005);warp=rng.uniform(-.004,.004);phase=rng.uniform(0,6.28)
    for station in range(10):
        t=station/9;yy=(t-.5)*length
        for xx,zz in corners:
            edgeWear=(rng.uniform(-.002,.002) if station in (0,9) else 0)
            verts.append((xx+warp*math.sin(math.pi*t),yy,zz+bend*math.sin(math.pi*t)+.0008*math.sin(t*9+phase)+edgeWear))
        if station:
            for j in range(8):faces.append(((station-1)*8+j,(station-1)*8+(j+1)%8,station*8+(j+1)%8,station*8+j))
    faces.extend([tuple(reversed(range(8))),tuple(72+j for j in range(8))])
    obj=Mesh(name,verts,faces,mat,col,False);obj.location=center
    if axisX:obj.rotation_euler.z=math.pi/2
    return obj

def Ellipsoid(name,center,size,mat,col,segments=20,rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=center)
    obj=bpy.context.object;obj.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return Finish(obj,name,mat,col,True)

def Tube(name,points,radius,mat=hemp,col=harnessCol,sides=8,closed=False):
    points=[Vector(p) for p in points];verts=[];faces=[]
    for i,point in enumerate(points):
        tangent=(points[(i+1)%len(points)]-points[(i-1)%len(points)]).normalized() if closed else (points[min(i+1,len(points)-1)]-points[max(i-1,0)]).normalized()
        a=tangent.cross(Vector((1,0,0)))
        if a.length<.01:a=tangent.cross(Vector((0,0,1)))
        a.normalize();b=tangent.cross(a).normalized()
        r=radius[i] if isinstance(radius,(list,tuple)) else radius
        for j in range(sides):
            angle=2*math.pi*j/sides;verts.append(tuple(point+r*(math.cos(angle)*a+math.sin(angle)*b)))
        if i:
            for j in range(sides):faces.append(((i-1)*sides+j,(i-1)*sides+(j+1)%sides,i*sides+(j+1)%sides,i*sides+j))
    if closed:
        for j in range(sides):faces.append(((len(points)-1)*sides+j,(len(points)-1)*sides+(j+1)%sides,(j+1)%sides,j))
    else:
        faces.extend([tuple(reversed(range(sides))),tuple((len(points)-1)*sides+j for j in range(sides))])
    obj=Mesh(name,verts,faces,mat,col)
    if mat==hemp:
        uv=obj.data.uv_layers.new(name='RopeUV');distance=[0]
        for a,b in zip(points,points[1:]):distance.append(distance[-1]+(b-a).length)
        pitch=(radius[0] if isinstance(radius,(list,tuple)) else radius)*7
        for face in obj.data.polygons:
            for loop in face.loop_indices:
                vertex=obj.data.loops[loop].vertex_index;station=vertex//sides;j=vertex%sides
                uv.data[loop].uv=(j/sides,distance[station]/pitch)
    return obj

def Beam(name,start,end,width,depth,mat=wood,col=cartCol):
    a,b=Vector(start),Vector(end);obj=Box(name,(a+b)*.5,(width,depth,(b-a).length),mat,col)
    obj.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return obj

def LeatherRibbon(name,points,width=.047,thickness=.006,closed=False):
    points=[Vector(p) for p in points];verts=[];faces=[]
    for i,p in enumerate(points):
        tangent=(points[(i+1)%len(points)]-points[(i-1)%len(points)]).normalized() if closed else (points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
        normal=Vector((tangent.z,0,-tangent.x)).normalized()
        for a,b in ((-1,-1),(1,-1),(1,1),(-1,1)):verts.append(p+normal*a*thickness/2+Vector((0,b*width/2,0)))
        if i:
            for j in range(4):faces.append(((i-1)*4+j,(i-1)*4+(j+1)%4,i*4+(j+1)%4,i*4+j))
    if closed:
        for j in range(4):faces.append(((len(points)-1)*4+j,(len(points)-1)*4+(j+1)%4,(j+1)%4,j))
    else:faces.extend([(3,2,1,0),tuple((len(points)-1)*4+j for j in range(4))])
    return Mesh(name,verts,faces,leather,harnessCol,False)

def Cylinder(name,center,radius,depth,mat=iron,col=cartCol,sides=20):
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides,radius=radius,depth=depth,location=center,rotation=(0,math.pi/2,0))
    obj=bpy.context.object;return Finish(obj,name,mat,col,True,.0015)

def Ring(name,x,y,z,inner,outer,width,mat,col=cartCol,count=64):
    verts=[];faces=[]
    for xx in (x-width/2,x+width/2):
        for r in (inner,outer):
            for i in range(count):
                a=2*math.pi*i/count;verts.append((xx,y+r*math.sin(a),z+r*math.cos(a)))
    for i in range(count):
        j=(i+1)%count
        faces.extend([(i,j,count+j,count+i),(2*count+i,3*count+i,3*count+j,2*count+j),
                      (count+i,count+j,3*count+j,3*count+i),(i,2*count+i,2*count+j,j)])
    return Mesh(name,verts,faces,mat,col)

def FelloeSegment(name,x,y,z,start,end):
    inner,outer,width=.342,.438,.079;steps=12;count=steps+1;verts=[];faces=[]
    for xx in (x-width/2,x+width/2):
        for radius in (inner,outer):
            for i in range(count):
                angle=start+(end-start)*i/steps;verts.append(Vector((xx,y+radius*math.sin(angle),z+radius*math.cos(angle))))
    for i in range(steps):
        j=i+1
        faces.extend([(i,j,count+j,count+i),(2*count+i,3*count+i,3*count+j,2*count+j),
            (count+i,count+j,3*count+j,3*count+i),(i,2*count+i,2*count+j,j)])
    faces.extend([(0,count,3*count,2*count),(steps,2*count+steps,3*count+steps,count+steps)])
    mid=(start+end)/2;frame=Matrix.Translation((x,y+.4045*math.sin(mid),z+.4045*math.cos(mid)))@Matrix.Rotation(-mid,4,'X')
    obj=Mesh(name,[frame.inverted()@p for p in verts],faces,wood,cartCol);obj.matrix_world=frame
    return obj

def Smooth(a,b,value):
    t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)

def HeadY(value):return headPollY+(value-.92)*(headForwardScale/.94)

def HeadZ(value):return value+headVerticalOffset

def HeadPoint(point):return Vector((point[0],HeadY(point[1]),HeadZ(point[2])))

with bpy.data.libraries.load(str(sourceDir/'ReuseAudit/Scene_Round14Candidate.blend'),link=False) as (old,new):
    new.objects=['HorseBatch','HorseRig']
original=next(obj for obj in new.objects if obj.type=='MESH')
oldRig=next(obj for obj in new.objects if obj.type=='ARMATURE')
oldOrigins={b.name:b.head_local.copy() for b in oldRig.data.bones}
oldRows=[{original.vertex_groups[g.group].name:g.weight for g in v.groups} for v in original.data.vertices]

frontP=[Vector((0,.68,.91)),Vector((0,.665,.72)),Vector((0,.68,.48)),Vector((0,.645,.155))]
rearP=[Vector((0,-.25,.94)),Vector((0,-.06,.73)),Vector((0,-.33,.47)),Vector((0,-.295,.155))]
for point in rearP:point.y+=hindForwardShift
targetOrigins={'DonkeyRoot':Vector((0,0,0)),'DonkeyBodyPivot':Vector((0,.3,.79)),
 'DonkeyThoraxPivot':Vector((0,.64,.93)),'DonkeyNeckPivot':Vector((0,.67,.98)),
 'DonkeyHeadPivot':Vector((0,headPollY,HeadZ(1.30))),'DonkeyPelvisPivot':Vector((0,-.23+hindForwardShift,.94)),
 'DonkeyTailPivot':Vector((0,-.30+hindForwardShift,.97)),'DonkeyTailTipPivot':Vector((0,-.35+hindForwardShift,.58)),
 'DonkeyEarLeftPivot':Vector((-.068,headPollY,1.28)),'DonkeyEarRightPivot':Vector((.068,headPollY,1.28)),
 'DonkeyHitchPivot':Vector((0,0,0))}
legSuffixes=['Pivot','ElbowPivot','KneePivot','HoofPivot']
for front,positions in ((True,frontP),(False,rearP)):
    for side,sign in (('Left',-1),('Right',1)):
        for i,suffix in enumerate(legSuffixes):
            p=positions[i].copy();p.x=sign*(([.110,.100,.090,.090] if front else [.105,.100,.100,.100])[i])
            stanceOffset=(.025 if side=='Right' else -.010) if front else (-.025 if side=='Right' else .012)
            p.y+=stanceOffset*i/3
            targetOrigins['Donkey'+('Front' if front else 'Rear')+side+suffix]=p

def AdaptSegment(point,a,b,c,d,radial=.75):
    axis=b-a; u=axis.normalized();newAxis=d-c;v=newAxis.normalized()
    t=(point-a).dot(u);offset=point-a-t*u
    return c+newAxis*(t/axis.length)+u.rotation_difference(v)@offset*radial

def AdaptPoint(point,row):
    result=Vector((0,0,0));total=0
    for name,weight in row.items():
        if 'Harness' in name or name=='HorseHitchPivot':continue
        targetName=name.replace('Horse','Donkey',1)
        if any(token in name for token in ('FrontLeft','FrontRight','RearLeft','RearRight')):
            idx=next(i for i,s in enumerate(legSuffixes) if name.endswith(s)) if not name.endswith(('ElbowPivot','KneePivot','HoofPivot')) else (1 if name.endswith('ElbowPivot') else 2 if name.endswith('KneePivot') else 3)
            stem=name[:-len(legSuffixes[idx])]
            if idx<3:
                radial=.50 if idx==0 else .59 if idx==1 else .62
                out=AdaptSegment(point,oldOrigins[name],oldOrigins[stem+legSuffixes[idx+1]],targetOrigins[targetName],targetOrigins[(stem+legSuffixes[idx+1]).replace('Horse','Donkey',1)],radial)
            else:
                out=targetOrigins[targetName]+Vector(((point.x-oldOrigins[name].x)*.68,(point.y-oldOrigins[name].y)*.85,(point.z-oldOrigins[name].z)*.8))
        elif 'Ear' in name:
            origin=oldOrigins[name];sign=-1 if 'Left' in name else 1
            rise=(point.z-origin.z)
            out=Vector((sign*.068+(point.x-origin.x)*.78,.92+(point.y-origin.y)*.75-rise*.20,1.33+rise*2.8))
        elif 'Head' in name or 'Eye' in name:
            origin=oldOrigins['HorseHeadPivot'];out=Vector((point.x*.8,headPollY+(point.y-origin.y)*headForwardScale,HeadZ(1.30)+(point.z-origin.z)*.82))
        elif 'Neck' in name:
            out=AdaptSegment(point,oldOrigins['HorseNeckPivot'],oldOrigins['HorseHeadPivot'],targetOrigins['DonkeyNeckPivot'],targetOrigins['DonkeyHeadPivot'],.66)
        elif 'Tail' in name:
            yy=(point.y-3.3)*.9+.3
            yy+=.14*(1-Smooth(-.46,-.12,yy))
            yy+=hindForwardShift*(1-Smooth(-.05,.50,yy))
            out=Vector((point.x*.55,yy,min(.995,point.z*.79)))
        else:
            yy=(point.y-3.3)*.9+.3
            yy+=.14*(1-Smooth(-.46,-.12,yy))
            yy+=hindForwardShift*(1-Smooth(-.05,.50,yy))
            out=Vector((point.x*.66,yy,point.z*.79))
        result+=out*weight;total+=weight
    if total<.01:return Vector((point.x*.66,(point.y-3.3)*.9+.3,point.z*.79))
    result/=total
    # The source's jaw carried neck weights. Refit the entire skull spatially,
    # so shortening the neck cannot pull the lower lip below the donkey's chin.
    headFit=Smooth(4.19,4.36,point.y)*Smooth(.92,1.04,point.z)
    headPoint=Vector((point.x*.8,headPollY+(point.y-oldOrigins['HorseHeadPivot'].y)*headForwardScale,HeadZ(1.30)+(point.z-oldOrigins['HorseHeadPivot'].z)*.82))
    if headPoint.z>1.25:headPoint.z=1.25+(headPoint.z-1.25)*.5
    result=result.lerp(headPoint,headFit)
    sternum=(1-Smooth(.045,.11,abs(result.x)))*Smooth(.53,.70,result.z)*(1-Smooth(.78,.96,result.z))*Smooth(.60,.78,result.y)
    result.y-=.115*sternum
    result.z+=.016*sternum
    pouch=(1-Smooth(.035,.105,abs(result.x)))*Smooth(.57,.73,result.y)*Smooth(.42,.56,result.z)*(1-Smooth(.70,.82,result.z))
    result.z+=.115*pouch;result.y-=.035*pouch
    axial=sum(w for name,w in row.items() if any(n in name for n in ('Body','Pelvis','Thorax')))
    thin=Smooth(.15,.75,axial)*Smooth(.57,.72,result.z)*(1-Smooth(.68,.85,result.y))
    result.x*=1-.23*thin
    bellyWindow=Smooth(-.44,-.26,result.y)*(1-Smooth(.48,.66,result.y))
    result.z+=.042*(1-Smooth(.64,.78,result.z))*bellyWindow*Smooth(.35,.85,axial)
    faceMass=sum(w for name,w in row.items() if 'Head' in name)
    muzzle=Smooth(HeadY(1.025),HeadY(1.11),result.y)*(1-Smooth(1.09,1.18,result.z))*faceMass
    result.x*=1+.34*muzzle
    result.z+=.010*muzzle
    # Narrow abdominal flank, shallow visible ribs and a modest dorsal ridge.
    flank=(1-Smooth(.42,.61,abs(result.y-.2)))*Smooth(.63,.85,result.z)*(1-Smooth(1.02,1.11,result.z))
    result.x*=1-.065*flank
    result.x+=math.copysign(.0060*math.sin((result.y+.45)*62)*flank*Smooth(.07,.15,abs(result.x)),result.x or 1)
    if result.z<.025:result.z-=.0038*(1-Smooth(.008,.025,result.z))
    return result

skinMaterial=Material('DonkeyCartGreyCoat',(.055,.052,.047),.92)
nodes,links=skinMaterial.node_tree.nodes,skinMaterial.node_tree.links
nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value=.22
attribute=nodes.new('ShaderNodeVertexColor');attribute.layer_name='CoatColor'
links.new(attribute.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
coatNoise=SurfaceNoise(skinMaterial,170,.24,.0012,(1,1,3))
furImage=bpy.data.images.load(str(sourceDir/'SourceTextures/Texture_DonkeyShortFurSource.png'),check_existing=True);furImage.pack()
fur=nodes.new('ShaderNodeTexImage');fur.image=furImage;fur.projection='BOX';fur.projection_blend=.25
furCoord=nodes.new('ShaderNodeTexCoord');furScale=nodes.new('ShaderNodeVectorMath');furScale.operation='SCALE';furScale.inputs['Scale'].default_value=6.6667
links.new(furCoord.outputs['Object'],furScale.inputs[0]);links.new(furScale.outputs['Vector'],fur.inputs['Vector'])
furGain=nodes.new('ShaderNodeMixRGB');furGain.blend_type='MULTIPLY';furGain.inputs[0].default_value=1;furGain.inputs[2].default_value=(3.4,3.4,3.4,1)
furNeutral=nodes.new('ShaderNodeHueSaturation');furNeutral.inputs['Saturation'].default_value=.28
links.new(fur.outputs['Color'],furNeutral.inputs['Color']);links.new(furNeutral.outputs['Color'],furGain.inputs[1])
multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=.92
links.new(attribute.outputs['Color'],multiply.inputs[1]);links.new(furGain.outputs['Color'],multiply.inputs[2]);links.new(multiply.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
furBump=nodes.new('ShaderNodeBump');furBump.inputs['Strength'].default_value=.44;furBump.inputs['Distance'].default_value=.0020
links.new(fur.outputs['Color'],furBump.inputs['Height']);links.new(furBump.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])
# The retained topology's sculpted tangent normal remains useful after resculpting.
oldCoat=next(m for m in original.data.materials if m and m.name.startswith('HorseBayCoat'))
normalImages=[n.image for n in oldCoat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and ('Norm' in n.image.name or 'Normal' in n.image.name)]
if normalImages:
    tex=nodes.new('ShaderNodeTexImage');tex.image=normalImages[0];tex.image.pack();tex.image.colorspace_settings.name='Non-Color'
    normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.30
    links.new(tex.outputs['Color'],normal.inputs['Color'])
    links.new(normal.outputs['Normal'],furBump.inputs['Normal'])

keepNames={'HorseBayCoat'}
allowed={i for i,m in enumerate(original.data.materials) if m and any(m.name.startswith(n) for n in keepNames)}
def KeepFace(face):
    return face.material_index in allowed and not any(sum(w for name,w in oldRows[i].items() if 'Ear' in name)>.22 for i in face.vertices)

used=sorted({i for face in original.data.polygons if KeepFace(face) for i in face.vertices})
indexMap={old:i for i,old in enumerate(used)}
vertices=[AdaptPoint(original.data.vertices[i].co,oldRows[i]) for i in used]
anatomyNamespace={}
exec(compile((project/'_blender/Script_DonkeyCartAnatomy.py').read_text(encoding='utf-8'),'Script_DonkeyCartAnatomy.py','exec'),anatomyNamespace)
faces=[tuple(indexMap[i] for i in p.vertices) for p in original.data.polygons if KeepFace(p)]
anatomyNamespace['RefitUpperForelimbs'](vertices,[oldRows[i] for i in used],targetOrigins,faces)
skin=Mesh('DonkeyContinuousSkin',vertices,faces,skinMaterial,donkeyCol)
skin.data.materials.append(eyeMat);skin.data.materials.append(mouthMat)
selectedFaces=[p for p in original.data.polygons if KeepFace(p)]
uv=skin.data.uv_layers.new(name='UVMap')
originalUv=original.data.uv_layers.active
for face,sourceFace in zip(skin.data.polygons,selectedFaces):
    sourceMat=original.data.materials[sourceFace.material_index].name
    face.material_index=1 if sourceMat.startswith('HorseAssetEye') else 0
    for loop,sourceLoop in zip(face.loop_indices,sourceFace.loop_indices): uv.data[loop].uv=originalUv.data[sourceLoop].uv

def CoatColor(point,limbMass=0):
    x,y,z=point
    base=Vector((.028,.027,.025));light=Vector((.265,.263,.245))
    belly=(1-Smooth(.66,.80,z))*Smooth(-.48,-.29,y)*(1-Smooth(.56,.74,y))
    muzzle=Smooth(HeadY(1.035),HeadY(1.115),y)*(1-Smooth(HeadZ(1.08),HeadZ(1.18),z))
    ring=max(math.exp(-((y-HeadY(.985))**2/(.025**2)+(z-HeadZ(1.221))**2/(.027**2)+(abs(x)-.064)**2/(.06**2))),0)
    innerLeg=(1-Smooth(.075,.13,abs(x)))*(1-Smooth(.48,.75,z))*.43
    belly*=1-Smooth(.15,.65,limbMass)
    innerLeg*=1-Smooth(.15,.65,limbMass)
    mask=max(belly*.90,muzzle,ring*.84,innerLeg)
    color=base.lerp(light,mask)
    if z<.105:color=Vector((.135,.125,.105))
    variation=1+.055*math.sin(y*37+z*61)+rng.uniform(-.035,.035)
    return (*[v*variation for v in color],1)

colors=skin.data.color_attributes.new(name='CoatColor',type='FLOAT_COLOR',domain='POINT')
for v in skin.data.vertices:
    limbMass=sum(weight for name,weight in oldRows[used[v.index]].items() if name.startswith(('HorseFront','HorseRear')))
    colors.data[v.index].color=CoatColor(v.co,limbMass)

parents={'DonkeyRoot':None,'DonkeyBodyPivot':'DonkeyRoot','DonkeyThoraxPivot':'DonkeyBodyPivot',
 'DonkeyNeckPivot':'DonkeyThoraxPivot','DonkeyHeadPivot':'DonkeyNeckPivot','DonkeyPelvisPivot':'DonkeyBodyPivot',
 'DonkeyTailPivot':'DonkeyPelvisPivot','DonkeyTailTipPivot':'DonkeyTailPivot',
 'DonkeyEarLeftPivot':'DonkeyHeadPivot','DonkeyEarRightPivot':'DonkeyHeadPivot','DonkeyHitchPivot':'DonkeyRoot'}
for front in ('Front','Rear'):
    for side in ('Left','Right'):
        stem='Donkey'+front+side
        for i,suffix in enumerate(legSuffixes):parents[stem+suffix]=stem+legSuffixes[i-1] if i else 'DonkeyRoot'

def MakeRig(name,origins,parents,col):
    data=bpy.data.armatures.new(name);rig=bpy.data.objects.new(name,data);col.objects.link(rig)
    bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    for name,point in origins.items():
        bone=data.edit_bones.new(name);bone.head=point;bone.tail=point+Vector((0,.075,0))
    for name,parent in parents.items():
        if parent:data.edit_bones[name].parent=data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False);rig.show_in_front=True
    return rig

rig=MakeRig('DonkeyRig',targetOrigins,parents,donkeyCol)
rig.location.y=animalPlacementY;rig['animalPlacementY']=animalPlacementY
rig['withersHeightM']=1.10;rig['strideM']=.68;rig['forwardAxis']='+Y';rig['restPose']='Independent donkey anatomy, four soles on z=0.0004'
rig['topologyLicense']='CC0; Lyndon Daniels / ChadM; https://opengameart.org/content/rigged-horse; independently reshaped donkey anatomy'

def Bind(obj,owner,weights=None,bone=None):
    if weights:
        for i,row in enumerate(weights):
            total=sum(row.values())
            for name,value in row.items():
                group=obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
                if total:group.add([i],value/total,'REPLACE')
    else:
        group=obj.vertex_groups.new(name=bone);group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
    obj.parent=owner;mod=obj.modifiers.new('DonkeySkin' if owner==rig else 'CartSkin','ARMATURE');mod.object=owner
    return obj

Bind(skin,rig,bone='DonkeyBodyPivot')
for obj in new.objects:bpy.data.objects.remove(obj,do_unlink=True)

# Close the old short-ear roots before fitting the donkey's independent pinnae.
bm=bmesh.new();bm.from_mesh(skin.data)
earEdges=[edge for edge in bm.edges if edge.is_boundary and all(v.co.y>.80 and v.co.z>1.25 for v in edge.verts)]
if earEdges:bmesh.ops.holes_fill(bm,edges=earEdges,sides=128)
bm.to_mesh(skin.data);bm.free();skin.data.update()
skinNamespace={}
exec(compile((project/'_blender/Script_DonkeyCartSkin.py').read_text(encoding='utf-8'),'Script_DonkeyCartSkin.py','exec'),skinNamespace)
feetNamespace={}
exec(compile((project/'_blender/Script_DonkeyCartFeet.py').read_text(encoding='utf-8'),'Script_DonkeyCartFeet.py','exec'),feetNamespace)
feetNamespace['RebuildLowerLegs'](skin,rig,skinMaterial)
skinNamespace['RebindDonkeySkin'](rig,skin)
feetNamespace['BindLowerLegs'](skin,rig)
anatomyNamespace['CleanAxialWeights'](skin)

# Rebuild facial features on the newly measured surface; the candidate's buried
# eyes, lid rings and hanging lip pieces were explicitly excluded above.
faceFur=skinMaterial.copy();faceFur.name='DonkeyCartFaceFur'
for node in list(faceFur.node_tree.nodes):
    if node.type=='NORMAL_MAP' or (node.type=='TEX_IMAGE' and node.image in normalImages):faceFur.node_tree.nodes.remove(node)
orbitMat=Material('DonkeyCartEyelid',(.048,.038,.029),.83)
nostrilMat=Material('DonkeyCartNostrilInterior',(.018,.014,.011),.78)
skin.data.materials.append(nostrilMat);nostrilIndex=len(skin.data.materials)-1

def SurfaceTree():return BVHTree.FromPolygons([v.co for v in skin.data.vertices],[tuple(p.vertices) for p in skin.data.polygons],all_triangles=False)
faceTree=SurfaceTree()
def SurfacePoint(point,normal,outset=.001):
    hit=faceTree.ray_cast(Vector(point)+normal*.08,-normal,.18)
    return hit[0]+normal*outset if hit[0] is not None else Vector(point)

def FaceBasis(normal):
    u=Vector((0,0,1)).cross(normal).normalized();v=normal.cross(u).normalized()
    return u,v,Matrix((u,v,normal)).transposed().to_quaternion()

for side,label in ((-1,'Left'),(1,'Right')):
    hit=faceTree.ray_cast(Vector((side*.5,HeadY(.985),HeadZ(1.220))),Vector((-side,0,0)),1)
    if hit[0] is None:raise RuntimeError('No donkey orbital skin surface')
    centre=hit[0];normal=Vector((side*.78,.62,.03)).normalized();u,v,rotation=FaceBasis(normal)
    eye=Ellipsoid('DonkeyEye'+label,centre+normal*.004,(.018,.0105,.0085),eyeMat,donkeyCol,24,16)
    eye.rotation_mode='QUATERNION';eye.rotation_quaternion=rotation;Bind(eye,rig,bone='DonkeyHeadPivot')
    verts=[];faces=[];count=40
    rings=[(.021,.0135),(.029,.021),(.040,.030)]
    for row,(rx,ry) in enumerate(rings):
        for j in range(count):
            angle=2*math.pi*j/count;p=centre+u*(rx*math.cos(angle))+v*(ry*math.sin(angle))
            verts.append(SurfacePoint(p,normal,.0013))
        if row:
            for j in range(count):faces.append(((row-1)*count+j,row*count+j,row*count+(j+1)%count,(row-1)*count+(j+1)%count))
    ring=Mesh('DonkeyPaleEyeRing'+label,verts,faces,faceFur,donkeyCol)
    colors=ring.data.color_attributes.new(name='CoatColor',type='FLOAT_COLOR',domain='POINT')
    for vertex in ring.data.vertices:
        color=[(.310,.300,.270,1),(.200,.190,.170,1),(.050,.047,.042,1)][vertex.index//count]
        colors.data[vertex.index].color=color
    Bind(ring,rig,bone='DonkeyHeadPivot')
    pts=[centre+u*(.0205*math.cos(2*math.pi*j/count))+v*(.0125*math.sin(2*math.pi*j/count))+normal*.003 for j in range(count)]
    Bind(Tube('DonkeyEyelidMargin'+label,pts,.0018,orbitMat,donkeyCol,6,True),rig,bone='DonkeyHeadPivot')

    noseHit=faceTree.ray_cast(Vector((side*.4,HeadY(1.125),HeadZ(1.005))),Vector((-side,0,0)),.8)
    if noseHit[0] is None:raise RuntimeError('No donkey nostril surface')
    noseNormal=Vector((side*.68,.73,.05)).normalized();nu,nv,nr=FaceBasis(noseNormal)
    cutter=Ellipsoid('NostrilCutter'+label,noseHit[0]+noseNormal*.004,(.0125,.022,.020),nostrilMat,donkeyCol,20,14)
    cutter.rotation_mode='QUATERNION';cutter.rotation_quaternion=nr
    cutter.parent=rig
    cutter.data.materials.clear()
    for mat in skin.data.materials:cutter.data.materials.append(mat)
    for poly in cutter.data.polygons:poly.material_index=nostrilIndex
    boolean=skin.modifiers.new('TrueNostrilCavity'+label,'BOOLEAN');boolean.operation='DIFFERENCE';boolean.solver='EXACT';boolean.object=cutter
    bpy.context.view_layer.objects.active=skin;bpy.ops.object.modifier_apply(modifier=boolean.name)
    bpy.data.objects.remove(cutter,do_unlink=True)

headGroup=skin.vertex_groups['DonkeyHeadPivot']
for vertex in skin.data.vertices:
    row={g.group:g.weight for g in vertex.groups if g.weight>1e-8}
    if not row and vertex.co.y>HeadY(1.05) and vertex.co.z>.88:
        headGroup.add([vertex.index],1,'REPLACE');continue
    total=sum(row.values())
    if not total:raise RuntimeError('New skin surface has no physical bone owner')
    if len(row)>4 or abs(total-1)>1e-6:
        top=sorted(row.items(),key=lambda item:item[1],reverse=True)[:4];total=sum(w for _,w in top)
        for group in list(vertex.groups):skin.vertex_groups[group.group].remove([vertex.index])
        for group,weight in top:skin.vertex_groups[group].add([vertex.index],weight/total,'REPLACE')

lip=Tube('DonkeyMouthSeam',[HeadPoint(p) for p in [(-.061,1.118,.934),(-.040,1.140,.927),(0,1.151,.923),(.040,1.140,.927),(.061,1.118,.934)]],.0019,mouthMat,donkeyCol,6)
Bind(lip,rig,bone='DonkeyHeadPivot')

# Separate concave pinnae have the donkey's broad open conch and rounded tips.
earInner=Material('DonkeyCartEarInterior',(.065,.041,.025),.97)
SurfaceNoise(earInner,180,.25,.001)
en,el=earInner.node_tree.nodes,earInner.node_tree.links
earFur=en.new('ShaderNodeTexImage');earFur.image=furImage;earFur.projection='BOX';earFur.projection_blend=.2
earCoord=en.new('ShaderNodeTexCoord');earScale=en.new('ShaderNodeVectorMath');earScale.operation='SCALE';earScale.inputs['Scale'].default_value=14
el.new(earCoord.outputs['Object'],earScale.inputs[0]);el.new(earScale.outputs['Vector'],earFur.inputs['Vector'])
earTone=en.new('ShaderNodeMixRGB');earTone.blend_type='MULTIPLY';earTone.inputs[0].default_value=1;earTone.inputs[2].default_value=(.80,.84,.90,1)
el.new(earFur.outputs['Color'],earTone.inputs[1]);el.new(earTone.outputs['Color'],en.get('Principled BSDF').inputs['Base Color'])
earBump=en.new('ShaderNodeBump');earBump.inputs['Strength'].default_value=.4;earBump.inputs['Distance'].default_value=.0012
el.new(earFur.outputs['Color'],earBump.inputs['Height']);el.new(earBump.outputs['Normal'],en.get('Principled BSDF').inputs['Normal'])
for side,label in ((-1,'Left'),(1,'Right')):
    verts=[];faces=[];crossCount=16
    widths=[.014,.030,.043,.048,.044,.035,.025,.013,.0015]
    for i,width in enumerate(widths):
        t=i/(len(widths)-1)
        centre=Vector((side*(.068+.110*t),headPollY-.001+.105*t+side*.015*t,1.280+.280*t))
        tangent=Vector((.85*side,.53,0)).normalized()
        for j in range(crossCount):
            a=2*math.pi*j/crossCount
            p=centre+tangent*(width*math.cos(a))+Vector((0,(.007*(1-t)+.001)*math.sin(a),0))
            p.y-=.020*math.sin(math.pi*t)*(1-abs(math.cos(a)))
            verts.append(p)
        if i:
            for j in range(crossCount):faces.append(((i-1)*crossCount+j,(i-1)*crossCount+(j+1)%crossCount,i*crossCount+(j+1)%crossCount,i*crossCount+j))
    faces.extend([tuple(reversed(range(crossCount))),tuple((len(widths)-1)*crossCount+j for j in range(crossCount))])
    ear=Mesh('DonkeyPinna'+label,verts,faces,skinMaterial,donkeyCol);ear.data.materials.append(earInner)
    c=ear.data.color_attributes.new(name='CoatColor',type='FLOAT_COLOR',domain='POINT')
    for vertex in ear.data.vertices:c.data[vertex.index].color=(.061,.054,.043,1)
    for polygon in ear.data.polygons:
        if polygon.index%crossCount in range(3,7):polygon.material_index=1
    subdivision=ear.modifiers.new('RoundedPinnaFolds','SUBSURF');subdivision.levels=1;subdivision.render_levels=1
    bpy.context.view_layer.objects.active=ear;bpy.ops.object.modifier_apply(modifier=subdivision.name)
    Bind(ear,rig,bone='DonkeyEar'+label+'Pivot')
    outline=[verts[i*crossCount] for i in range(len(widths))]+[verts[i*crossCount+crossCount//2] for i in reversed(range(len(widths)))]
    Bind(Tube('DonkeyRolledEarRim'+label,outline,.0022,hair,donkeyCol,6,True),rig,bone='DonkeyEar'+label+'Pivot')

# Thin donkey tail with a modest terminal brush, never a horse's full hair curtain.
tailPoints=[(0,-.30,.97),(.005,-.345,.915),(.009,-.365,.80),(.010,-.375,.65),(.010,-.38,.49),(.01,-.39,.38)]
tailPoints=[(x,y+hindForwardShift,z) for x,y,z in tailPoints]
tail=Tube('DonkeyThinTail',tailPoints,[.021,.017,.013,.010,.008,.006],hair,donkeyCol,10)
Bind(tail,rig,bone='DonkeyTailPivot')
for i in range(65):
    phase=rng.uniform(0,2*math.pi);r=rng.uniform(.003,.014);endZ=rng.uniform(.24,.38)
    pts=[(.01+r*math.cos(phase),-.378+hindForwardShift+r*math.sin(phase),.52),(.01+r*1.2*math.cos(phase),-.39+hindForwardShift+r*math.sin(phase),.40),
         (.012+r*math.cos(phase),-.40+hindForwardShift+r*math.sin(phase),endZ)]
    Bind(Tube('DonkeyTailFibre%03d'%i,pts,[.0013,.0010,.00025],hair,donkeyCol,4),rig,bone='DonkeyTailTipPivot')
for i in range(160):
    t=(i+rng.random())/160;y=.63+(headPollY-.63)*t
    candidates=[v.co.z for v in skin.data.vertices if abs(v.co.x)<.032 and abs(v.co.y-y)<.026]
    z=max(candidates,default=1.095+.231*t)+.003
    length=rng.uniform(.023,.045);x=rng.uniform(-.012,.012)
    pts=[(x,y,z),(x*.9,y-.01,z+length*.65),(x*1.3,y-.017,z+length)]
    Bind(Tube('DonkeyStiffMane%03d'%i,pts,[.0018,.0013,.00015],hair,donkeyCol,4),rig,bone='DonkeyNeckPivot' if t<.72 else 'DonkeyHeadPivot')
maneBase=[]
for i in range(24):
    y=.63+(headPollY-.63)*i/23;candidates=[v.co.z for v in skin.data.vertices if abs(v.co.x)<.032 and abs(v.co.y-y)<.026]
    maneBase.append((0,y,max(candidates,default=1.2)-.003))
Bind(Tube('DonkeyDenseManeBase',maneBase,.006,hair,donkeyCol,6),rig,bone='DonkeyNeckPivot')
foreheadTree=SurfaceTree()
for i in range(28):
    x=rng.uniform(-.015,.015);y=HeadY(rng.uniform(.935,.968))
    hit=foreheadTree.ray_cast(Vector((x,y,1.7)),Vector((0,0,-1)),.6)
    if hit[0] is None:continue
    p=hit[0];length=rng.uniform(.013,.028)
    pts=[p,p+Vector((rng.uniform(-.003,.003),.003,length*.7)),p+Vector((rng.uniform(-.006,.006),.006,length))]
    Bind(Tube('DonkeyForelockFibre%02d'%i,pts,[.001,.0006,.00012],hair,donkeyCol,4),rig,bone='DonkeyHeadPivot')

# Cart joinery: the bed, transverse axle, fore/aft rails and two actual shafts.
cartOrigins={'CartRoot':Vector((0,0,0)),'CartDeck':Vector((0,-1.45,.60)),
 'WheelLeft':Vector((-.660,-1.58,wheelRadius)),'WheelRight':Vector((.660,-1.58,wheelRadius))}
cartRig=MakeRig('DonkeyCartRig',cartOrigins,{'CartRoot':None,'CartDeck':'CartRoot','WheelLeft':'CartRoot','WheelRight':'CartRoot'},cartCol)
cartRig['wheelRadiusM']=wheelRadius
cartRig['forwardAxis']='+Y'
for i in range(6):
    obj=Box('CartFloorPlank%02d'%i,(-.435+i*.174,-1.43,.590),(.169,1.52,.057),wood)
    obj.rotation_euler.y=rng.uniform(-.003,.003)
for side in (-1,1):
    x=side*.535
    Box('CartLongitudinalSill'+str(side),(side*.40,-1.44,.528),(.105,1.68,.115),woodDark)
    for row in range(3):
        obj=Box('CartSideBoard%d_%d'%(side,row),(x,-1.43,.685+.112*row),(.048,1.49,.107),wood)
        obj.rotation_euler.y=rng.uniform(-.004,.004)
    for j,y in enumerate((-.72,-.99,-1.68,-2.15)):
        top=rng.uniform(1.005,1.055)
        Box('CartSideStake%d_%d'%(side,j),(x+side*.029,y,(.55+top)/2),(.071,.077,top-.55),woodDark)
        for z in (.64,.86):Cylinder('CartStakeNail%d_%d_%s'%(side,j,z),(x+side*.068,y,z),.013,.012,iron,sides=10)
    # A single tapered timber forms each shaft; all rings and bindings remain separate.
    points=[(side*.31,.52,.817),(side*.33,.30,.780),(side*.385,-.35,.680),(side*.43,-.86,.582),(side*.43,-1.06,.565)]
    verts=[];faces=[]
    for i,(xx,yy,zz) in enumerate(points):
        width=.055+.018*i/4;depth=.066+.022*i/4
        verts.extend([(xx+sx*width/2,yy,zz+sz*depth/2) for sx,sz in ((-1,-1),(1,-1),(1,1),(-1,1))])
        if i:
            for j in range(4):faces.append(((i-1)*4+j,(i-1)*4+(j+1)%4,i*4+(j+1)%4,i*4+j))
    faces.extend([(3,2,1,0),(16,17,18,19)])
    shaft=Mesh('CartShaft'+str(side),verts,faces,wood,cartCol,False)
    mod=shaft.modifiers.new('ShaftHandWornEdges','BEVEL');mod.width=.007;mod.segments=2
    bpy.context.view_layer.objects.active=shaft;bpy.ops.object.modifier_apply(modifier=mod.name)
for end,y in (('Front',-.69),('Rear',-2.19)):
    Box('CartEndSill'+end,(0,y,.563),(1.17,.11,.103),woodDark)
    for row in range(3):Box('CartEndBoard%s%d'%(end,row),(0,y,.685+.112*row),(1.075,.046,.107),wood)
    for x in (-.47,.47):Box('CartEndStake%s%s'%(end,x),(x,y+(-.037 if end=='Rear' else .037),.80),(.067,.075,.49),woodDark)
Box('CartTransverseAxle',(0,-1.58,wheelRadius),(1.48,.12,.115),woodDark)
for side in (-1,1):Box('CartAxleBearingBlock'+str(side),(side*.40,-1.58,.465),(.115,.19,.090),woodDark)
for side in (-1,1):
    Beam('CartDiagonalUnderbrace'+str(side),(side*.46,-.78,.515),(side*.14,-1.59,wheelRadius-.047),.055,.061,woodDark)

for side,label in ((-1,'Left'),(1,'Right')):
    x=side*.660;y=-1.58;z=.445
    wheelObjects=[]
    for segment in range(6):
        a=segment*math.pi/3+.0025;b=(segment+1)*math.pi/3-.0025
        wheelObjects.append(FelloeSegment('WheelWoodFelloe%sSegment%02d'%(label,segment),x,y,z,a,b))
    wheelObjects.append(Ring('WheelForgedTyre'+label,x,y,z,.435,.445,.086,iron))
    for faceSide in (-1,1):
        wheelObjects.append(Ring('WheelForgedFaceBand%s%s'%(label,faceSide),x+faceSide*.043,y,z,.417,.444,.006,iron))
    for i in range(14):
        a=2*math.pi*i/14+.17
        start=(x,y+.066*math.sin(a),z+.066*math.cos(a));end=(x,y+.395*math.sin(a),z+.395*math.cos(a))
        wheelObjects.append(Beam('WheelSpoke%s%02d'%(label,i),start,end,.033,.039,wood))
    wheelObjects.append(Cylinder('WheelHubElm'+label,(x,y,z),.100,.22,woodDark,sides=24))
    wheelObjects.append(Cylinder('WheelHubIronBand'+label,(x+side*.059,y,z),.103,.034,iron,sides=24))
    wheelObjects.append(Cylinder('WheelSpokeHubPlate'+label,(x+side*.112,y,z),.108,.012,iron,sides=32))
    wheelObjects.append(Cylinder('WheelBearingCap'+label,(x+side*.127,y,z),.066,.018,iron,sides=24))
    wheelObjects.append(Cylinder('WheelAxleEnd'+label,(x+side*.145,y,z),.037,.042,iron,sides=16))
    for i in range(8):
        a=2*math.pi*i/8
        wheelObjects.append(Cylinder('HubPlateRivet%s%02d'%(label,i),(x+side*.120,y+.089*math.sin(a),z+.089*math.cos(a)),.0055,.008,iron,sides=8))
    for i in range(28):
        a=2*math.pi*i/28;rr=.426
        wheelObjects.append(Cylinder('TyreRivet%s%02d'%(label,i),(x+side*.047,y+rr*math.sin(a),z+rr*math.cos(a)),.0045,.007,iron,sides=8))
    for obj in wheelObjects:
        world=obj.matrix_world.copy();inverse=world.inverted();factor=wheelRadius/.445
        for vertex in obj.data.vertices:
            point=world@vertex.co;point.y=y+(point.y-y)*factor;point.z=wheelRadius+(point.z-z)*factor;vertex.co=inverse@point
        Bind(obj,cartRig,bone='Wheel'+label)
for obj in list(cartCol.objects):
    if obj.type=='MESH' and not obj.parent:Bind(obj,cartRig,bone='CartDeck')

# Irregular drying splits on the visible faces break the mechanically perfect grain.
splitMat=Material('DonkeyCartElmSplits',(.045,.034,.023),1)
for side in (-1,1):
    for i in range(20):
        y=rng.uniform(-2.12,-.83);length=rng.uniform(.07,.33);z=rng.uniform(.645,.94)
        pts=[(side*.561,y+length*t/5,z+.0015*math.sin(t*1.7+i)) for t in range(6)]
        Bind(Tube('CartDryingSplit%d_%02d'%(side,i),pts,rng.uniform(.00065,.0012),splitMat,cartCol,4),cartRig,bone='CartDeck')

# An oval cloth pad around the neck; rope edging, lacing and a leather outer band.
collarPoints=[]
for i in range(64):
    a=2*math.pi*i/64
    collarPoints.append((.175*math.sin(a),.730-.105*math.cos(a),.92+.225*math.cos(a)))
for shift in (-.028,.028):
    verts=[];faces=[]
    for i,point in enumerate(collarPoints):
        theta=2*math.pi*i/len(collarPoints);outward=Vector((math.sin(theta),0,math.cos(theta)))
        radial=.025*(1+.075*math.sin(theta*7)+.025*math.cos(theta*13))
        depth=.042*(1+.045*math.sin(theta*9))
        for j in range(12):
            phi=2*math.pi*j/12
            verts.append(Vector(point)+Vector((0,shift+depth*math.sin(phi),0))+outward*(radial*math.cos(phi)))
    for i in range(len(collarPoints)):
        for j in range(12):faces.append((i*12+j,((i+1)%len(collarPoints))*12+j,((i+1)%len(collarPoints))*12+(j+1)%12,i*12+(j+1)%12))
    pad=Mesh('HarnessClothCollar'+str(shift),verts,faces,cloth,harnessCol)
    Bind(pad,rig,bone='DonkeyThoraxPivot')
for shift in (-.065,.065):
    points=[(x,y+shift,z) for x,y,z in collarPoints]
    Bind(Tube('HarnessCollarRopeEdge'+str(shift),points,.009,hemp,harnessCol,7,True),rig,bone='DonkeyThoraxPivot')
for j in range(14):
    a=2*math.pi*j/14
    p=Vector(collarPoints[int(j*64/14)]);pts=[]
    tangent=Vector((.175*math.cos(a),.105*math.sin(a),-.225*math.sin(a))).normalized()
    for k in range(20):
        t=2*math.pi*k/20;pts.append(p+Vector((0,1,0))*.078*math.cos(t)+tangent.cross(Vector((0,1,0)))*.0295*math.sin(t))
    Bind(Tube('HarnessPadLacing%02d'%j,pts,.0045,hemp,harnessCol,6,True),rig,bone='DonkeyThoraxPivot')

for side in (-1,1):
    # Upper traces transfer traction from the neck pad to the bed's shaft tenon.
    points=[]
    for i in range(28):
        t=i/27;points.append((side*(.205+.223*t),.735-(1.605+animalPlacementY)*t,.945-.303*t-.027*math.sin(math.pi*t)))
    trace=Tube('HarnessUpperTrace'+str(side),points,.011,hemp,harnessCol,8)
    rows=[]
    for i in range(len(points)):
        t=i/(len(points)-1)
        rows.extend([{'DonkeyThoraxPivot':1-t,'DonkeyHitchPivot':t}]*8)
    Bind(trace,rig,rows)
    for y,xx,zz in ((-.86,.430,.582),(-.12,.365,.716)):
        pts=[]
        for i in range(96):
            t=i/95;a=t*math.pi*2*4
            cs,sn=math.cos(a),math.sin(a)
            pts.append((side*xx+.044*math.copysign(abs(cs)**.25,cs),y+(t-.5)*.060,zz+.053*math.copysign(abs(sn)**.25,sn)))
        Bind(Tube('HarnessShaftBinding%s_%s'%(side,y),pts,.008,hemp,harnessCol,6),cartRig,bone='CartDeck')
    # Leather tug loops around the timber, sewn to the collar-side drop strap.
    bandY=.58;bandPoints=[Vector((side*.290,bandY,.69)),Vector((side*.290,bandY,.82))]
    bandTree=SurfaceTree()
    for z in (.94,1.02,1.075):
        hit=bandTree.ray_cast(Vector((side*.5,bandY,z)),Vector((-side,0,0)),1)
        bandPoints.append(Vector((hit[0].x+side*.004 if hit[0] is not None else side*.13,bandY,z)))
    top=bandTree.ray_cast(Vector((0,bandY,1.5)),Vector((0,0,-1)),.8)
    topZ=top[0].z+.004 if top[0] is not None else 1.11
    bandPoints.extend([Vector((side*.055,bandY,topZ-.005)),Vector((0,bandY,topZ))])
    drop=LeatherRibbon('HarnessLeatherDrop'+str(side),bandPoints)
    Bind(drop,rig,bone='DonkeyThoraxPivot')
    pts=[]
    for i in range(32):
        cs,sn=math.cos(2*math.pi*i/32),math.sin(2*math.pi*i/32)
        pts.append((side*.324+.035*math.copysign(abs(cs)**.25,cs),bandY+animalPlacementY,.793+.044*math.copysign(abs(sn)**.25,sn)))
    Bind(LeatherRibbon('HarnessShaftTug'+str(side),pts,.035,.006,True),cartRig,bone='CartDeck')
    # Real knot coils and short tails.
    knotT=.23;kp=(side*(.205+.223*knotT),.735-(1.605+animalPlacementY)*knotT,.945-.303*knotT-.027*math.sin(math.pi*knotT))
    for j in range(3):
        pts=[(kp[0]+.015*math.cos(2*math.pi*k/20),kp[1]+(j-1)*.009,kp[2]+.015*math.sin(2*math.pi*k/20)) for k in range(20)]
        knot=Tube('HarnessTraceKnot%s_%s'%(side,j),pts,.006,hemp,harnessCol,6,True)
        Bind(knot,rig,[{'DonkeyThoraxPivot':1-knotT,'DonkeyHitchPivot':knotT} for _ in knot.data.vertices])

# Rope halter follows the face, with paired cheek lines and a hanging lead.
headAxis=Vector((0,.11,-.37)).normalized();cross=headAxis.cross(Vector((1,0,0))).normalized()
noseCenter=Vector((0,HeadY(1.075),HeadZ(1.06)))
headGroupIndex=skin.vertex_groups['DonkeyHeadPivot'].index
headVertices={v.index for v in skin.data.vertices if any(g.group==headGroupIndex and g.weight>.65 for g in v.groups)}
skullTree=BVHTree.FromPolygons([v.co for v in skin.data.vertices],[tuple(p.vertices) for p in skin.data.polygons if all(i in headVertices for i in p.vertices)],all_triangles=False)
pts=[]
for i in range(48):
    angle=2*math.pi*i/48;direction=(Vector((1,0,0))*math.cos(angle)+cross*math.sin(angle)).normalized()
    hit=skullTree.ray_cast(noseCenter+direction*.24,-direction,.40)
    pts.append(hit[0]+direction*.007 if hit[0] is not None else noseCenter+direction*.07)
noseSides={1:pts[0],-1:pts[24]}
Bind(Tube('HalterNoseRope',pts,.0075,hemp,harnessCol,8,True),rig,bone='DonkeyHeadPivot')
for side in (-1,1):
    cheekKeys=[noseSides[side]]+[HeadPoint(p) for p in [(side*.092,.972,1.097),(side*.094,.905,1.19),(side*.077,.887,1.283),(side*.061,.885,1.335)]]
    pts=[];halterTree=SurfaceTree()
    for a,b in zip(cheekKeys,cheekKeys[1:]):
        for i in range(6):
            point=a.lerp(b,i/6);hit=halterTree.ray_cast(Vector((side*.5,point.y,point.z)),Vector((-side,0,0)),1)
            if hit[0] is not None:point.x=hit[0].x+side*.0075
            pts.append(point)
    pts.append(cheekKeys[-1])
    Bind(Tube('HalterCheekRope'+str(side),pts,.007,hemp,harnessCol,8),rig,bone='DonkeyHeadPivot')
pts=[HeadPoint(p) for p in [(-.061,.885,1.335),(-.055,.865,1.34),(0,.853,1.342),(.055,.865,1.34),(.061,.885,1.335)]]
Bind(Tube('HalterPollRope',pts,.007,hemp,harnessCol,8),rig,bone='DonkeyHeadPivot')
pts=[noseSides[-1],HeadPoint((-.06,1.052,.966)),HeadPoint((0,1.047,.947)),HeadPoint((.06,1.052,.966)),noseSides[1]]
Bind(Tube('HalterUnderJaw',pts,.007,hemp,harnessCol,8),rig,bone='DonkeyHeadPivot')
leadPoints=[(x,HeadY(1.047)+.005+(y-1.075)*.26,z+headVerticalOffset*z/.954) for x,y,z in [(.012,1.075,.947),(.012,1.10,.87),(.014,1.12,.72),(.016,1.13,.52),(.020,1.14,.30),(.027,1.18,.075),(.035,1.24,.022),(.036,1.31,.0075)]]
Bind(Tube('HalterHangingLead',leadPoints,.0065,hemp,harnessCol,8),rig,bone='DonkeyHeadPivot')

surfaceNamespace={}
exec(compile((project/'_blender/Script_DonkeyCartSurface.py').read_text(encoding='utf-8'),'Script_DonkeyCartSurface.py','exec'),surfaceNamespace)
surfaceNamespace['RefineSurfaces'](scene,sourceDir,skin,rig,cartRig,donkeyCol,wood,woodDark,iron,cloth,leather,hemp)

# Closed editable parts must have outward winding, including mirrored pinnae,
# lofted boards and hollow wheel rings. Keep deliberately open face overlays.
for col in (donkeyCol,cartCol,harnessCol):
    for obj in col.objects:
        if obj.type!='MESH':continue
        bm=bmesh.new();bm.from_mesh(obj.data)
        if all(edge.is_manifold for edge in bm.edges):
            bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
            if bm.calc_volume(signed=True)<0:bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
            bm.to_mesh(obj.data);obj.data.update()
        bm.free()

# Keep each editable component while leaving a neutral non-export studio.
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,-.45,0))
ground=Finish(bpy.context.object,'ReviewGround',Material('ReviewWarmGrey',(.47,.445,.41),1),studioCol)
ground.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value=.18
world=bpy.data.worlds.new('DonkeyCartNeutralStudio');scene.world=world;world.use_nodes=True
world.node_tree.nodes.get('Background').inputs[0].default_value=(.72,.70,.66,1)
world.node_tree.nodes.get('Background').inputs[1].default_value=.85
worldNodes,worldLinks=world.node_tree.nodes,world.node_tree.links
cameraBackground=worldNodes.new('ShaderNodeBackground');cameraBackground.inputs['Color'].default_value=(.72,.70,.68,1);cameraBackground.inputs['Strength'].default_value=1.9
cameraRay=worldNodes.new('ShaderNodeLightPath');mixBackground=worldNodes.new('ShaderNodeMixShader')
worldLinks.new(cameraRay.outputs['Is Camera Ray'],mixBackground.inputs[0]);worldLinks.new(worldNodes.get('Background').outputs[0],mixBackground.inputs[1]);worldLinks.new(cameraBackground.outputs[0],mixBackground.inputs[2]);worldLinks.new(mixBackground.outputs[0],worldNodes.get('World Output').inputs['Surface'])
ground.is_shadow_catcher=True;scene.render.film_transparent=True
if hasattr(scene,'compositing_node_group'):
    compositor=bpy.data.node_groups.new('DonkeyReviewCompositor','CompositorNodeTree');scene.compositing_node_group=compositor
    compositor.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
    output=compositor.nodes.new('NodeGroupOutput')
else:
    scene.use_nodes=True;compositor=scene.node_tree;compositor.nodes.clear();output=compositor.nodes.new('CompositorNodeComposite')
layers=compositor.nodes.new('CompositorNodeRLayers');background=compositor.nodes.new('CompositorNodeRGB')
background.outputs[0].default_value=(1.368,1.330,1.292,1)
over=compositor.nodes.new('CompositorNodeAlphaOver')
factor=next((socket for socket in over.inputs if socket.type=='VALUE'),None)
if factor:factor.default_value=1.0
imageInputs=[socket for socket in over.inputs if socket.type=='RGBA']
compositor.links.new(background.outputs[0],imageInputs[0]);compositor.links.new(layers.outputs['Image'],imageInputs[1])
compositor.links.new(over.outputs[0],output.inputs[0])
for name,position,power,size in [('ReviewKey',(-3,4,6),850,5),('ReviewFill',(4,1,3),500,4),('ReviewRim',(0,-4,4),650,3)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(name,data);studioCol.objects.link(obj);obj.location=position
    obj.rotation_euler=(Vector((0,-.3,.7))-obj.location).to_track_quat('-Z','Y').to_euler()
cameraData=bpy.data.cameras.new('ReviewCamera');camera=bpy.data.objects.new('ReviewCamera',cameraData);studioCol.objects.link(camera)
scene.camera=camera;cameraData.type='ORTHO'
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'

def RenderReview(name,position,target,scale,width,height):
    camera.location=position;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    cameraData.ortho_scale=scale;scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100
    scene.render.filepath=str(reviewDir/('Render_'+name+'.png'));bpy.ops.render.render(write_still=True)

scene.frame_set(1)
textName='Script_DonkeyCartBake.py'
text=bpy.data.texts.get(textName) or bpy.data.texts.new(textName);text.clear();text.write((project/'_blender'/textName).read_text(encoding='utf-8'))
for image in bpy.data.images:
    if image.size[0]>0 and image.type=='IMAGE' and not image.packed_file:
        try:image.pack()
        except Exception:pass
bpy.ops.wm.save_as_mainfile(filepath=str(sourceDir/'Scene_DonkeyCart.blend'))
RenderReview('Side',(-7,-.49,1.14),(0,-.49,.86),3.83,640,360)
bpy.ops.wm.save_as_mainfile(filepath=str(sourceDir/'Scene_DonkeyCart.blend'))
print(json.dumps({'saved':str(sourceDir/'Scene_DonkeyCart.blend'),'review':str(reviewDir/'Render_Side.png'),
 'meshCount':sum(o.type=='MESH' for o in donkeyCol.objects)+sum(o.type=='MESH' for o in cartCol.objects)+sum(o.type=='MESH' for o in harnessCol.objects),
 'skinVertices':len(skin.data.vertices),'donkeyBones':len(rig.data.bones)}))
