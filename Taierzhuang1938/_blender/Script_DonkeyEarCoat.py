"""Reference frontal inner-pinna and rear-ear coat, baked into existing UV0."""
import json,hashlib
from pathlib import Path
import numpy as np

def ReferenceEarConfidence(rgb):
    confidence=np.zeros(rgb.shape[:2],dtype=np.float32);profiles={}
    for name,left,right,top,bottom in [('FrontLeft',50,132,15,215),('FrontRight',182,264,15,215),('RearLeft',1250,1385,20,235),('RearRight',1403,1520,20,235)]:
        bounds=[]
        for y in range(top,bottom):
            dark=np.mean(rgb[max(0,y-2):y+3,left:right],axis=2)<.69;active=np.where(np.sum(dark,axis=0)>=3)[0]
            if len(active)<3:continue
            lo,hi=int(active[0]+left),int(active[-1]+left);x=np.arange(lo,hi+1);amount=np.clip((np.minimum(x-lo,hi-x)+.5)/1.5,0,1)
            fade=1 if name.startswith('Front') else 1-max(0,min(1,(y-200)/30))
            confidence[y,x]=np.maximum(confidence[y,x],amount*fade);bounds.append([y,lo,hi])
        profiles[name]=bounds
    return confidence,profiles

def InstallEarCoat(scene,rig,base):
    import bpy
    source=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020/References/Image_DonkeyOriginalThreeView.png')
    original=bpy.data.images.load(str(source),check_existing=False);rgb=np.array(original.pixels[:],dtype=np.float32).reshape(1024,1536,4)[::-1,:,:3];bpy.data.images.remove(original)
    confidence,profiles=ReferenceEarConfidence(rgb)
    pixels=np.ones((1024,1536,4),dtype=np.float32);pixels[:,:,:3]=rgb;pixels[:,:,3]=confidence
    image=bpy.data.images.get('Texture_DonkeyEarReferenceBase') or bpy.data.images.new('Texture_DonkeyEarReferenceBase',width=1536,height=1024,alpha=True)
    image.colorspace_settings.name='sRGB';image.alpha_mode='CHANNEL_PACKED';image.pixels.foreach_set(pixels[::-1].copy().ravel());path=base/'SourceTextures/Texture_DonkeyEarReferenceBase.png';image.filepath_raw=str(path);image.file_format='PNG';image.save();content=path.read_bytes();image.pack(data=content,data_len=len(content))
    inverse=rig.matrix_world.inverted();ppm=(925-302)/1.10;objects=[];materials={}
    for side in ['Left','Right']:
        for prefix in ['DonkeyPinna','DonkeyRolledEarRim']:
            obj=bpy.data.objects[prefix+side];matrix=inverse@obj.matrix_world;normalMatrix=matrix.to_3x3().inverted().transposed();points=[matrix@v.co for v in obj.data.vertices]
            blend=obj.data.attributes.get('EarFrontBlend') or obj.data.attributes.new('EarFrontBlend','FLOAT','POINT')
            front=obj.data.uv_layers.get('ReferenceEarFrontUV') or obj.data.uv_layers.new(name='ReferenceEarFrontUV');rear=obj.data.uv_layers.get('ReferenceEarRearUV') or obj.data.uv_layers.new(name='ReferenceEarRearUV')
            for vertex in obj.data.vertices:
                normal=(normalMatrix@vertex.normal).normalized();t=max(0,min(1,(normal.y+.20)/.40));blend.data[vertex.index].value=t*t*(3-2*t)
            for loop in obj.data.loops:
                p=points[loop.vertex_index];v=925-ppm*p.z
                front.data[loop.index].uv=((156.5-ppm*p.x)/1536,1-v/1024)
                rear.data[loop.index].uv=((1394+ppm*p.x)/1536,1-(1.12*v+10)/1024)
            for slot,old in enumerate(list(obj.data.materials)):
                if old.get('DonkeyEarReferenceCoat'):
                    continue
                if old.name not in materials:
                    material=old.copy();material.name=old.name+'EarReference';material['DonkeyEarReferenceCoat']=True;nodes,links=material.node_tree.nodes,material.node_tree.links;shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
                    previous=shader.inputs['Base Color'].links[0].from_socket if shader.inputs['Base Color'].links else None;fallback=tuple(shader.inputs['Base Color'].default_value)
                    paint=nodes.new('ShaderNodeAttribute');paint.attribute_name='EarFrontBlend';textures=[]
                    for uvName in ['ReferenceEarRearUV','ReferenceEarFrontUV']:
                        uv=nodes.new('ShaderNodeUVMap');uv.uv_map=uvName;texture=nodes.new('ShaderNodeTexImage');texture.image=image;texture.extension='EXTEND';links.new(uv.outputs[0],texture.inputs[0]);textures.append(texture)
                    color=nodes.new('ShaderNodeMixRGB');links.new(paint.outputs['Fac'],color.inputs[0]);links.new(textures[0].outputs['Color'],color.inputs[1]);links.new(textures[1].outputs['Color'],color.inputs[2])
                    alpha=nodes.new('ShaderNodeMixRGB');links.new(paint.outputs['Fac'],alpha.inputs[0]);links.new(textures[0].outputs['Alpha'],alpha.inputs[1]);links.new(textures[1].outputs['Alpha'],alpha.inputs[2])
                    gain=nodes.new('ShaderNodeMixRGB');gain.blend_type='MULTIPLY';gain.inputs[0].default_value=1;links.new(color.outputs[0],gain.inputs[1]);gain.inputs[2].default_value=(.50,.515,.55,1)
                    final=nodes.new('ShaderNodeMixRGB');links.new(alpha.outputs[0],final.inputs[0]);final.inputs[1].default_value=fallback
                    if previous:links.new(previous,final.inputs[1])
                    links.new(gain.outputs[0],final.inputs[2]);links.new(final.outputs[0],shader.inputs['Base Color']);materials[old.name]=material
                obj.data.materials[slot]=materials[old.name]
            objects.append(obj.name)
    report={'version':'20261025EarCoatV32','source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'image':str(path),'imageSha256':hashlib.sha256(content).hexdigest(),'objects':objects,'sourceSize':[1536,1024],'rearVerticalRegistration':[1.12,10],'linearGain':[.50,.515,.55],'sourceSilhouetteRows':profiles,'paleForegroundPixelsRetained':int(np.count_nonzero((rgb.mean(axis=2)>.68)&(confidence>.95))),'method':'fixed frontal inner-pinna/rear coat correspondence with silhouette-filled confidence that retains bright inner-ear hairs; smooth normal-facing blend; source RGB baked into existing UV0; no view-dependent runtime material'}
    (base/'SourceTextures/Data_EarCoat.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');scene['DonkeyEarCoatRevision']=report['version'];return report
