"""Fixed, skinned mane ribbons with a matte extracted from the actual reference."""
import bpy,json,math,hashlib
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
        row=dict(sorted(row.items(),key=lambda item:item[1],reverse=True)[:4]);total=sum(row.values())
        return point,{key:value/total for key,value in row.items() if value>0}
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
        bg=Luminance(Sample(707-ppm*(root.y+growth.y*.12-anchor),925-ppm*(root.z+growth.z*.12),'Side'))
        for row in range(96):
            d=height-(height+below)*row/95;p=root+growth*d
            value=Luminance(Sample(707-ppm*(p.y-anchor),925-ppm*p.z,'Side'))
            opacity=max(0,min(1,(bg-value)/max(.1,bg-.007)));alpha[row,column]=opacity if opacity>.04 else 0
    eye=bpy.data.objects['DonkeyEyeLeft'];matrix=rig.matrix_world.inverted()@eye.matrix_world
    eyeY=sum((matrix@v.co).y for v in eye.data.vertices)/len(eye.data.vertices);foreY=eyeY-.040;foreRoot,_=Root(0,foreY)
    for column in range(128):
        x=-.045+.090*column/127;bg=Luminance(Sample(156.5-ppm*x,925-ppm*(foreRoot.z+.12),'Front'))
        for row in range(128):
            d=foreHeight-(foreHeight+below)*row/127;value=Luminance(Sample(156.5-ppm*x,925-ppm*(foreRoot.z+d),'Front'))
            opacity=max(0,min(1,(bg-value)/max(.1,bg-.007)));alpha[128+row,column]=opacity if opacity>.04 else 0
    values=np.ones((256,512,4),dtype=np.float32);values[:,:,:3]=.73535698;values[:,:,3]=alpha
    image=bpy.data.images.new('Texture_DonkeyManeBase',width=512,height=256,alpha=True);image.colorspace_settings.name='sRGB';image.alpha_mode='CHANNEL_PACKED'
    image.pixels.foreach_set(values[::-1].copy().ravel());path=base/'SourceTextures/Texture_DonkeyManeBase.png';image.filepath_raw=str(path);image.file_format='PNG';image.save();content=path.read_bytes();image.pack(data=content,data_len=len(content))
    material=bpy.data.materials.new('DonkeyManePbr');material.use_nodes=True;material.use_backface_culling=False
    if hasattr(material,'surface_render_method'):material.surface_render_method='BLENDED'
    material['alphaMode']='BLEND';material['groomCastShadow']=False
    nodes,links=material.node_tree.nodes,material.node_tree.links;shader=nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.90;shader.inputs['Specular IOR Level'].default_value=.10
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap';texture=nodes.new('ShaderNodeTexImage');texture.image=image;texture.extension='EXTEND';links.new(uv.outputs[0],texture.inputs[0])
    paint=nodes.new('ShaderNodeVertexColor');paint.layer_name='HairTint';multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
    links.new(texture.outputs['Color'],multiply.inputs[1]);links.new(paint.outputs['Color'],multiply.inputs[2]);links.new(multiply.outputs[0],shader.inputs['Base Color']);links.new(texture.outputs['Alpha'],shader.inputs['Alpha'])
    vertices=[];faces=[];uvs=[];weights=[]
    roots=[]
    for index in range(40):
        root,bones=Root(0,.635+.415*index/39);roots.append((root,bones))
        for t in (0,.5,1):
            vertices.append(root+growth*((height+below)*t-below));uvs.append((index/39,.625+.375*t));weights.append(bones)
        if index:
            a=(index-1)*3;b=index*3;faces.extend(((a,a+1,b+1,b),(a+1,a+2,b+2,b+1)))
    def CrossCard(root,bones,axis,width,uvRect,cardHeight,direction):
        start=len(vertices);left,bottom,right,top=uvRect
        for t in (0,.5,1):
            centre=root+direction*((cardHeight+below)*t-below)
            vertices.extend((centre-axis*width/2,centre+axis*width/2));weights.extend((bones,bones));uvs.extend(((left,bottom+(top-bottom)*t),(right,bottom+(top-bottom)*t)))
        faces.extend(((start,start+1,start+3,start+2),(start+2,start+3,start+5,start+4)))
    for index in range(12):
        t=(index+.5)/12;root,bones=Root(0,.635+.415*t)
        occupied=np.where(alpha[:96,round(t*511)]>.08)[0]
        extent=max(.006,height-(height+below)*int(occupied[0])/95) if len(occupied) else .006
        # The transverse cards use the photographed pointed forelock, avoiding
        # solid rectangular strips when looking along the neck.
        CrossCard(root,bones,Vector((1,0,0)),.020,(0,0,.25,.5),extent*1.15,growth)
    foreRoot,foreBones=Root(0,foreY)
    foreStart=len(vertices)
    for column in range(13):
        t=column/12;root,bones=Root(-.045+.09*t,foreY)
        for level in (0,.5,1):
            vertices.append(root+Vector((0,-.020*level*level,(foreHeight+below)*level-below)))
            uvs.append((.25*t,.5*level));weights.append(bones)
        if column:
            a=foreStart+(column-1)*3;b=foreStart+column*3
            faces.extend(((a,a+1,b+1,b),(a+1,a+2,b+2,b+1)))
    CrossCard(foreRoot,foreBones,Vector((0,1,0)),.010,(0,0,.25,.5),foreHeight,Vector((0,-.12,1)).normalized())
    mesh=bpy.data.meshes.new('DonkeyReferenceMane');mesh.from_pydata(vertices,[],faces);mesh.materials.append(material);mesh.update()
    for face in mesh.polygons:face.use_smooth=True
    layer=mesh.uv_layers.new(name='UVMap');tint=mesh.color_attributes.new(name='HairTint',type='FLOAT_COLOR',domain='POINT')
    for loop in mesh.loops:layer.data[loop.index].uv=uvs[loop.vertex_index]
    for value in tint.data:value.color=(.014,.013,.011,1)
    mesh.color_attributes.active_color_index=0;mesh.color_attributes.render_color_index=0
    obj=bpy.data.objects.new('DonkeyReferenceMane',mesh);collection.objects.link(obj);obj.parent=rig
    for index,bones in enumerate(weights):
        for name,value in bones.items():
            group=obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name);group.add([index],value,'REPLACE')
    modifier=obj.modifiers.new('DonkeyManeSkin','ARMATURE');modifier.object=rig
    obj['coatCardCount']=len(faces);obj['groomCastShadow']=False;obj.visible_shadow=False
    bpy.context.scene['DonkeyManeTufts']='[]';bpy.context.scene['DonkeyReferenceMane']=True
    return {'mainRows':40,'crossCards':12,'forelockColumns':13,'forelockCrossCards':1,'triangles':sum(len(f)-2 for f in faces),'exportLayer':'DonkeyManeRuntime',
            'method':'fixed skinned ribbons with reference-derived alpha silhouette','texture':str(path),'textureSha256':hashlib.sha256(content).hexdigest(),'sourceSha256':hashlib.sha256(original.read_bytes()).hexdigest()}
