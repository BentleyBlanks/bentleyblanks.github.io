"""Reference-silhouette ribbons and curved skinned fibres give the mane volume."""
import bpy,json,math,hashlib,random
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

def RebuildReferenceMane(skin,rig,collection):
    for obj in list(collection.objects):
        if obj.name=='DonkeyManeFineFibres' or obj.name.startswith(('DonkeyForelockFibre','DonkeyReferenceMane')):
            bpy.data.objects.remove(obj,do_unlink=True)
    skin.data.calc_loop_triangles();triangles=list(skin.data.loop_triangles)
    tree=BVHTree.FromPolygons([v.co for v in skin.data.vertices],[tuple(t.vertices) for t in triangles],all_triangles=True)
    def Root(x,y):
        point,_,index,_=tree.ray_cast(Vector((x,y,2)),Vector((0,0,-1)),2)
        if point is None:raise RuntimeError('Reference mane has no skin root')
        ids=triangles[index].vertices;a,b,c=[skin.data.vertices[i].co for i in ids]
        bary=barycentric_transform(point,a,b,c,Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
        row={}
        for vertex,weight in zip(ids,bary):
            for g in skin.data.vertices[vertex].groups:
                name=skin.vertex_groups[g.group].name;row[name]=row.get(name,0)+g.weight*weight
        row=dict(sorted(((key,value) for key,value in row.items() if value>0),key=lambda item:item[1],reverse=True)[:4]);total=sum(row.values())
        if total<=0:raise RuntimeError('Mane root has no positive skin weights')
        return point,{key:value/total for key,value in row.items()}
    project=Path(bpy.context.scene['DonkeyCartProject']);base=Path(bpy.context.scene['DonkeySourceRoot'])
    maskNamespace={};file=project/'_blender/Script_DonkeyReferenceMasks.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),maskNamespace);masks=maskNamespace['BuildOcclusionWeights']()
    original=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020/References/Image_DonkeyOriginalThreeView.png')
    arrays=[]
    for path in (original,base/'Image_NakedAnatomyGuide.png'):
        image=bpy.data.images.load(str(path),check_existing=False)
        if tuple(image.size)!=(1536,1024):image.scale(1536,1024)
        arrays.append(np.array(image.pixels[:],dtype=np.float32).reshape(1024,1536,4)[::-1,:,:3]);bpy.data.images.remove(image)
    def Sample(u,v,view):
        u=max(0,min(1534,float(u)));v=max(0,min(1022,float(v)));x,y=int(u),int(v);a,b=u-x,v-y
        samples=[]
        for image in arrays:samples.append(image[y,x]*(1-a)*(1-b)+image[y,x+1]*a*(1-b)+image[y+1,x]*(1-a)*b+image[y+1,x+1]*a*b)
        blend=float(masks[view][y,x]);return samples[0]*(1-blend)+samples[1]*blend
    def Luminance(rgb):
        linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
        return float(linear@np.array((.2126,.7152,.0722)))
    group=skin.vertex_groups['DonkeyFrontLeftHoofPivot'].index
    soles=[v.co.y for v in skin.data.vertices if v.co.z<.035 and any(g.group==group and g.weight>.98 for g in v.groups)]
    anchor=sum(soles)/len(soles);ppm=(925-302)/1.10;growth=Vector((0,-.4,1)).normalized();height=.130;below=.010;foreHeight=.165
    alpha=np.zeros((256,512),dtype=np.float32)
    for column in range(512):
        y=.635+.415*column/511;root,_=Root(0,y)
        bg=Luminance(Sample(707-ppm*(root.y+growth.y*.18-anchor),925-ppm*(root.z+growth.z*.18),'Side'))
        for row in range(96):
            d=height-(height+below)*row/95;p=root+growth*d
            value=Luminance(Sample(707-ppm*(p.y-anchor),925-ppm*p.z,'Side'))
            opacity=max(0,min(1,(bg-value)/max(.1,bg-.007)));alpha[row,column]=opacity if opacity>.04 else 0
    eye=bpy.data.objects['DonkeyEyeLeft'];matrix=rig.matrix_world.inverted()@eye.matrix_world
    eyeY=sum((matrix@v.co).y for v in eye.data.vertices)/len(eye.data.vertices)
    foreY=float(bpy.context.scene.get('DonkeyReferenceForelockY',eyeY-.040));bpy.context.scene['DonkeyReferenceForelockY']=foreY
    foreRoot,_=Root(0,foreY);foreRgb=np.zeros((128,128,3),dtype=np.float32)
    for column in range(128):
        x=-.045+.090*column/127;bg=Luminance(Sample(156.5-ppm*x,925-ppm*max(1.50,foreRoot.z+.20),'Front'))
        for row in range(128):
            d=foreHeight-(foreHeight+below)*row/127;rgb=Sample(156.5-ppm*x,925-ppm*(foreRoot.z+d),'Front');foreRgb[row,column]=rgb;value=Luminance(rgb)
            opacity=max(0,min(1,(bg-value)/max(.1,bg-.007)));alpha[128+row,column]=opacity if opacity>.04 else 0
    values=np.ones((256,512,4),dtype=np.float32);values[:,:,:3]=.73535698;values[:,:,3]=alpha
    foreFade=np.clip((foreHeight-(foreHeight+below)*np.arange(128)/127)/.030,0,1)
    values[128:,:128,:3]=foreRgb;values[128:,:128,3]=alpha[128:,:128]*.30*foreFade[:,None]
    image=bpy.data.images.get('Texture_DonkeyManeBase') or bpy.data.images.new('Texture_DonkeyManeBase',width=512,height=256,alpha=True)
    if tuple(image.size)!=(512,256):image.scale(512,256)
    image.colorspace_settings.name='sRGB';image.alpha_mode='CHANNEL_PACKED'
    image.pixels.foreach_set(values[::-1].copy().ravel());path=base/'SourceTextures/Texture_DonkeyManeBase.png';image.filepath_raw=str(path);image.file_format='PNG';image.save();content=path.read_bytes();image.pack(data=content,data_len=len(content))
    material=bpy.data.materials.get('DonkeyManePbr') or bpy.data.materials.new('DonkeyManePbr');material.use_nodes=True;material.use_backface_culling=False
    if hasattr(material,'surface_render_method'):material.surface_render_method='BLENDED'
    material['alphaMode']='BLEND';material['groomCastShadow']=False
    nodes,links=material.node_tree.nodes,material.node_tree.links;nodes.clear()
    shader=nodes.new('ShaderNodeBsdfPrincipled');output=nodes.new('ShaderNodeOutputMaterial');links.new(shader.outputs['BSDF'],output.inputs['Surface'])
    shader.inputs['Roughness'].default_value=.90;shader.inputs['Specular IOR Level'].default_value=.10
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap';texture=nodes.new('ShaderNodeTexImage');texture.image=image;texture.extension='EXTEND';links.new(uv.outputs[0],texture.inputs[0])
    paint=nodes.new('ShaderNodeVertexColor');paint.layer_name='HairTint';multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
    links.new(texture.outputs['Color'],multiply.inputs[1]);links.new(paint.outputs['Color'],multiply.inputs[2]);links.new(multiply.outputs[0],shader.inputs['Base Color']);links.new(texture.outputs['Alpha'],shader.inputs['Alpha'])
    vertices=[];faces=[];uvs=[];weights=[]
    for index in range(40):
        root,bones=Root(0,.635+.415*index/39)
        for t in (0,.5,1):
            vertices.append(root+growth*((height+below)*t-below));uvs.append((index/39,.625+.375*t));weights.append(bones)
        if index:
            a=(index-1)*3;b=index*3;faces.extend(((a,a+1,b+1,b),(a+1,a+2,b+2,b+1)))
    foreStart=len(vertices)
    # The curved front layer carries the reference's subpixel flyaways and
    # shaft highlights. Fine 3D fibres still give oblique views their volume.
    for index in range(32):
        x=-.045+.090*index/31;root,bones=Root(x,foreY)
        for t in (0,.5,1):
            d=(foreHeight+below)*t-below
            vertices.append(Vector((x,root.y+.012+.20*d+.007*math.sin(math.pi*t),foreRoot.z+d)))
            uvs.append((index/31*127/512,1/256+t*127/256));weights.append(bones)
        if index:
            a=foreStart+(index-1)*3;b=foreStart+index*3;faces.extend(((a,a+1,b+1,b),(a+1,a+2,b+2,b+1)))
    # Curved fibres provide transverse thickness and the entire forelock;
    # cross-cards create an unnaturally straight dark strip from axial views.
    mesh=bpy.data.meshes.new('DonkeyReferenceMane');mesh.from_pydata(vertices,[],faces);mesh.materials.append(material);mesh.update()
    for face in mesh.polygons:face.use_smooth=True
    layer=mesh.uv_layers.new(name='UVMap');tint=mesh.color_attributes.new(name='HairTint',type='FLOAT_COLOR',domain='POINT')
    for loop in mesh.loops:layer.data[loop.index].uv=uvs[loop.vertex_index]
    for index,value in enumerate(tint.data):value.color=(.90,.927,.99,1) if index>=foreStart else (.014,.013,.011,1)
    mesh.color_attributes.active_color_index=0;mesh.color_attributes.render_color_index=0
    obj=bpy.data.objects.new('DonkeyReferenceMane',mesh);collection.objects.link(obj);obj.parent=rig
    for index,bones in enumerate(weights):
        for name,value in bones.items():
            group=obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name);group.add([index],value,'REPLACE')
    modifier=obj.modifiers.new('DonkeyManeSkin','ARMATURE');modifier.object=rig
    obj['coatCardCount']=len(faces);obj['groomCastShadow']=False;obj.visible_shadow=False
    volumeVertices=[];volumeFaces=[];volumeUvs=[];volumeWeights=[];volumeColors=[]
    rng=random.Random(19381028)
    def AddVolumeStrand(root,bones,direction,length,bend,radius,tintGain=1,bendMid=.45):
        start=len(volumeVertices);points=[root-Vector((0,0,.002)),root+direction*(length*.52)+bend*bendMid+Vector((0,rng.uniform(-.004,.004),0)),root+direction*length+bend]
        for level,point in enumerate(points[:2]):
            tangent=(points[1]-points[0] if level==0 else points[2]-points[0]).normalized()
            across=Vector((1,0,0));across=(across-tangent*across.dot(tangent)).normalized();other=tangent.cross(across).normalized()
            for j in range(3):
                angle=2*math.pi*j/3;volumeVertices.append(point+(radius if level==0 else radius*.65)*(across*math.cos(angle)+other*math.sin(angle)))
        volumeVertices.append(points[2]);volumeWeights.extend([bones]*7)
        gain=rng.uniform(.65,1.45)*tintGain
        volumeColors.extend([(.014*gain,.013*gain,.011*gain,1)]*6+[(.0154*gain,.0143*gain,.0121*gain,1)])
        u,v=.25,.57;epsilon=.0002
        volumeFaces.append((start+2,start+1,start));volumeUvs.append(((u-epsilon,v-epsilon),(u+epsilon,v-epsilon),(u,v+epsilon)))
        for j in range(3):
            a,b=start+j,start+(j+1)%3;c,d=start+3+j,start+3+(j+1)%3
            lo=u-epsilon+2*epsilon*j/3;hi=u-epsilon+2*epsilon*(j+1)/3
            volumeFaces.append((a,b,d,c));volumeUvs.append(((lo,v),(hi,v),(hi,v+epsilon),(lo,v+epsilon)))
            volumeFaces.append((c,d,start+6));volumeUvs.append(((lo,v+epsilon),(hi,v+epsilon),((lo+hi)/2,v+2*epsilon)))
    def AddForelockStrand(root,bones,direction,length,bend,halfWidth):
        # A fibre is a bent, tapered strip, rather than a millimetre-wide solid
        # cone. Independent strip angles preserve volume from front/side views.
        start=len(volumeVertices);points=[root-Vector((0,0,.002)),root+direction*(length*.48)+bend*.34,root+direction*length+bend]
        tangent=(points[-1]-points[0]).normalized();angle=rng.uniform(0,2*math.pi)
        across=Vector((math.cos(angle),math.sin(angle),0));across-=tangent*across.dot(tangent);across.normalize()
        gain=rng.uniform(.65,1.55)*3.7
        for level,(point,taper) in enumerate(zip(points,(1,.62,.025))):
            volumeVertices.extend((point-across*halfWidth*taper,point+across*halfWidth*taper))
            volumeWeights.extend((bones,bones));color=(.014*gain*(1+.12*level),.013*gain*(1+.12*level),.011*gain*(1+.12*level),1)
            volumeColors.extend((color,color))
        u,v=.25,.57;epsilon=.0002
        for level in range(2):
            a=start+level*2;volumeFaces.append((a,a+1,a+3,a+2))
            volumeUvs.append(((u-epsilon,v),(u+epsilon,v),(u+epsilon,v+epsilon),(u-epsilon,v+epsilon)))
    for strand in range(1100):
        y=.635+.415*(strand+.5)/256 if strand<256 else rng.uniform(.635,1.05)
        root,bones=Root(rng.uniform(-.0045,.0045),y);column=round((y-.635)/.415*511)
        occupied=np.where(alpha[:96,column]>.24)[0];extent=max(.003,height-(height+below)*int(occupied[0])/95) if len(occupied) else .003
        length=extent*(.985 if strand<256 else rng.uniform(.55,.99));spread=max(-.020,min(.020,rng.gauss(0,.009)))
        AddVolumeStrand(root,bones,growth,length,Vector((spread,rng.uniform(-.0015,.0015),0)),rng.uniform(.00022,.00038),4.0)
    foreProfile=[]
    for column in range(128):
        occupied=np.where(alpha[128:,column]>.65)[0]
        foreProfile.append(max(.008,foreHeight-(foreHeight+below)*int(occupied[0])/127) if len(occupied) else .008)
    # Strong foreground contrast separates the real three peaks from the
    # studio background gradient. Connected upper lobes define whole tufts.
    groups=[];cut=max(foreProfile)*.82
    for column in range(8,120):
        if foreProfile[column]<=cut:continue
        if not groups or column>groups[-1][-1]+4:groups.append([column])
        else:groups[-1].append(column)
    groups=[group for group in groups if len(group)>=3]
    tuftColumns=[max(group,key=lambda column:foreProfile[column]) for group in groups]
    if not groups:raise RuntimeError('Reference forelock has no usable connected upper lobes')
    for strand in range(760):
        tufted=strand<360
        if tufted:
            group=groups[strand%len(groups)];tipColumn=rng.uniform(group[0],group[-1])
            tipX=-.045+.09*tipColumn/127+rng.gauss(0,.0025)
            tipX=max(-.043,min(.043,tipX))
        else:tipX=rng.uniform(-.043,.043)
        x=max(-.038,min(.038,tipX*.75+rng.gauss(0,.010))) if tufted else rng.uniform(-.038,.038)
        y=foreY+rng.gauss(0,.004);root,bones=Root(x,y);column=round((tipX+.045)/.09*127)
        extent=foreProfile[column];direction=Vector((0,.20,1)).normalized()
        targetZ=foreRoot.z+extent*(.60+.41*rng.random()**.70 if tufted else rng.uniform(.25,.70))
        length=max(.003,(targetZ-root.z)/direction.z)
        AddForelockStrand(root,bones,direction,length,Vector((tipX-x,(tipX/.045)*.006+rng.uniform(-.005,.005),0)),rng.uniform(.00020,.00045))
    volumeMesh=bpy.data.meshes.new('DonkeyReferenceManeVolume');volumeMesh.from_pydata(volumeVertices,[],volumeFaces);volumeMesh.update()
    volumeMesh.materials.append(bpy.data.objects['DonkeyShortCoatCards'].data.materials[0])
    for face in volumeMesh.polygons:face.use_smooth=True
    uv=volumeMesh.uv_layers.new(name='UVMap');paint=volumeMesh.color_attributes.new(name='HairTint',type='FLOAT_COLOR',domain='POINT')
    for face,coordinates in zip(volumeMesh.polygons,volumeUvs):
        for loop,coordinate in zip(face.loop_indices,coordinates):uv.data[loop].uv=coordinate
    for value,color in zip(paint.data,volumeColors):value.color=color
    volumeMesh.color_attributes.active_color_index=0;volumeMesh.color_attributes.render_color_index=0
    if hasattr(volumeMesh,'normals_split_custom_set_from_vertices'):volumeMesh.normals_split_custom_set_from_vertices([v.normal[:] for v in volumeMesh.vertices])
    volume=bpy.data.objects.new('DonkeyReferenceManeVolume',volumeMesh);collection.objects.link(volume);volume.parent=rig
    for index,bones in enumerate(volumeWeights):
        for name,value in bones.items():
            group=volume.vertex_groups.get(name) or volume.vertex_groups.new(name=name);group.add([index],value,'REPLACE')
    modifier=volume.modifiers.new('DonkeyManeVolumeSkin','ARMATURE');modifier.object=rig
    volume['coatCardCount']=len(volumeFaces);volume['groomCastShadow']=False;volume.visible_shadow=False
    bpy.context.scene['DonkeyManeTufts']='[]';bpy.context.scene['DonkeyReferenceMane']=True
    return {'mainRows':40,'crossCards':0,'forelockColumns':32,'forelockCrossCards':0,'forelockLayer':'curved front reference RGB/alpha at 0.30 opacity, 30 mm root fade, backed by individual 3D strands','triangles':sum(len(f)-2 for f in faces),'exportLayer':'DonkeyManeRuntime',
            'forelockRootY':foreY,'volumeFibres':{'main':1100,'forelock':760,'forelockPeakColumns':sorted(tuftColumns),'forelockLobeColumns':[[group[0],group[-1]] for group in groups],'forelockForegroundAlpha':.65,'forelockUpperLobeFraction':.82,'forelockTuftedFibres':360,'forelockHalfWidthM':[.00020,.00045],'forelockRootSpreadStdM':.010,'triangles':sum(len(f)-2 for f in volumeFaces),'mainTintGain':4.0,'forelockTintGain':3.7,'pathBendFraction':{'main':.45,'forelock':.34},'spread':'fine curved strips spread across three reference lobes; staggered lengths and narrow tapered tips replace solid cones','exportLayer':'DonkeyCoatRuntime','material':'DonkeyShortCoatPbr','alpha':'MASK 0.45; depth writing','sourceObject':volume.name},
            'method':'reference-alpha side ribbon, curved triangular-tube main mane and fine curved forelock strips rooted to actual skin','texture':str(path),'textureSha256':hashlib.sha256(content).hexdigest(),'sourceSha256':hashlib.sha256(original.read_bytes()).hexdigest()}
