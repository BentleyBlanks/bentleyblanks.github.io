"""Part-aware photographic limb pigment; bake-only cylindrical correspondence.

Visible source strips belong to the same anatomical limb. Occluded inner and
back faces extend that limb's coat, rather than projecting another leg, belly,
floor, rope or background through the model. No new runtime material or image.
"""
import bpy,json,math,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector

def InstallLegPigment(scene,skin,rig,base):
    project=Path(scene['DonkeyCartProject']);ns={};file=project/'_blender/Script_DonkeyLegSections.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),ns)
    stems,masses,profiles=ns['MeasureLegSections'](skin,True);curve=ns['Curve'];smooth=ns['Smooth']
    source=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020/References/Image_DonkeyOriginalThreeView.png')
    original=bpy.data.images.load(str(source),check_existing=False)
    rgb=np.array(original.pixels[:],dtype=np.float32).reshape(1024,1536,4)[::-1,:,:3];bpy.data.images.remove(original)
    detailNamespace={};detailFile=project/'_blender/Script_DonkeyPhotoDetail.py';exec(compile(detailFile.read_text(encoding='utf-8'),detailFile.name,'exec'),detailNamespace)
    albedoNamespace={};albedoFile=project/'_blender/Script_DonkeyLegAlbedo.py';exec(compile(albedoFile.read_text(encoding='utf-8'),albedoFile.name,'exec'),albedoNamespace)
    atlas,sourceRecord=albedoNamespace['BuildLegAlbedo'](rgb,detailNamespace['BoxBlur'])
    height,tileWidth,bodyWidth,gutter=1024,384,256,64
    image=bpy.data.images.new('Texture_DonkeyLegPigment',width=tileWidth*4,height=height,alpha=False);image.colorspace_settings.name='sRGB'
    image.pixels.foreach_set(atlas[::-1].copy().ravel());path=base/'SourceTextures/Texture_DonkeyLegPigment.png';image.filepath_raw=str(path);image.file_format='PNG';image.save();content=path.read_bytes();image.pack(data=content,data_len=len(content))
    layer=skin.data.uv_layers.get('LegPigmentUV') or skin.data.uv_layers.new(name='LegPigmentUV')
    mask=skin.data.attributes.get('LegPigmentBlend') or skin.data.attributes.new('LegPigmentBlend','FLOAT','POINT')
    protection=skin.data.attributes.get('LegProjectionProtection') or skin.data.attributes.new('LegProjectionProtection','FLOAT','POINT')
    coordinates=[];paint=skin.data.color_attributes['CoatColor'];count=0
    for vertex,row in zip(skin.data.vertices,masses):
        stem=max(stems,key=lambda s:row[s]);p=vertex.co
        if row[stem]<.40:stem='Donkey'+('Front' if p.y>.40 else 'Rear')+('Left' if p.x<0 else 'Right')
        index=stems.index(stem);front='Front' in stem;rows=profiles[stem]
        cx,cy,wx,wy=[curve([(r[0],r[c]) for r in rows],p.z) for c in (1,2,3,4)]
        theta=(math.atan2((p.x-cx)/max(.01,wx*.5),(p.y-cy)/max(.01,wy*.5))+math.pi)/(2*math.pi)
        coordinates.append((index,theta,p.z/.90))
        ownership=smooth(.45,.85,row[stem])
        amount=ownership*(1-smooth(.66,.74,p.z) if front else 1-smooth(.67,.86,p.z))
        mask.data[vertex.index].value=amount
        protected=amount;protection.data[vertex.index].value=protected
        if amount>0:
            col=int(np.clip(index*tileWidth+gutter+theta*(bodyWidth-1),0,tileWidth*4-1));line=int(np.clip((1-p.z/.90)*(height-1),0,height-1));value=atlas[line,col,:3]
            value=np.where(value<=.04045,value/12.92,((value+.055)/1.055)**2.4)
            old=Vector(paint.data[vertex.index].color[:3]);paint.data[vertex.index].color=(*old.lerp(Vector(value/.75),protected),1);count+=1
    for face in skin.data.polygons:
        votes=[coordinates[i][0] for i in face.vertices];tile=max(set(votes),key=votes.count)
        angles=[coordinates[skin.data.loops[l].vertex_index][1] for l in face.loop_indices];crosses=max(angles)-min(angles)>.5
        for loop,a in zip(face.loop_indices,angles):
            i=skin.data.loops[loop].vertex_index
            if crosses and a<.5:a+=1
            layer.data[loop].uv=((tile*tileWidth+gutter+a*(bodyWidth-1))/(tileWidth*4),coordinates[i][2])
    materials=[]
    for material in skin.data.materials:
        if not material or not material.name.startswith(('DonkeyCartGreyCoat','DonkeyLowerLegShortFur','DonkeyCartFaceFur')):continue
        nodes,links=material.node_tree.nodes,material.node_tree.links;shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');previous=shader.inputs['Base Color'].links[0].from_socket
        uv=nodes.new('ShaderNodeUVMap');uv.uv_map='LegPigmentUV';texture=nodes.new('ShaderNodeTexImage');texture.image=image;texture.extension='EXTEND';links.new(uv.outputs[0],texture.inputs[0])
        blend=nodes.new('ShaderNodeAttribute');blend.attribute_name='LegPigmentBlend';mix=nodes.new('ShaderNodeMixRGB');links.new(blend.outputs['Fac'],mix.inputs[0]);links.new(previous,mix.inputs[1]);links.new(texture.outputs['Color'],mix.inputs[2]);links.new(mix.outputs[0],shader.inputs['Base Color']);materials.append(material.name)
    record={**sourceRecord,'source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'atlas':str(path),'sha256':hashlib.sha256(content).hexdigest(),'vertices':count,'materials':materials,
        'runtime':'baked into existing UV0 2K Base Color; shared UV1 fur normal unchanged; no additional runtime image or projection'}
    (base/'SourceTextures/Data_LegPigment.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8');scene['DonkeyLegPigmentRevision']='20261025SourceScaleAlbedoV29';return record
