"""Restore frontal pigment to the guarded downward-facing pectoral skin."""
import bpy,json,hashlib
import numpy as np
from pathlib import Path

def InstallChestPigment(scene,skin,base):
    if not skin.data.attributes.get('ChestUndersideBlend'):raise RuntimeError('Chest pigment requires the authored underside mask')
    project=Path(scene['DonkeyCartProject']);ns={};file=project/'_blender/Script_DonkeyReferenceMasks.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),ns)
    occlusion=ns['BuildOcclusionWeights']()['Front']
    source=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020/References/Image_DonkeyOriginalThreeView.png')
    image=bpy.data.images.load(str(source),check_existing=False);rgb=np.array(image.pixels[:],dtype=np.float32).reshape(1024,1536,4)[::-1,:,:3];bpy.data.images.remove(image)
    linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4);valid=(rgb.mean(axis=2)<.66).astype(np.float32);changes=0
    for y in range(500,651):
        xs=np.arange(70,246);blocked=(occlusion[y,xs]>.02);known=xs[(~blocked)&(valid[y,xs]>.5)]
        if len(known)<8:continue
        target=xs[blocked]
        for channel in range(3):linear[y,target,channel]=np.interp(target,known,linear[y,known,channel])
        valid[y,target]=np.interp(target,known,valid[y,known]);changes+=len(target)
    pixels=np.ones((1024,1536,4),dtype=np.float32);pixels[:,:,:3]=np.where(linear<=.0031308,linear*12.92,1.055*np.maximum(0,linear)**(1/2.4)-.055);pixels[:,:,3]=valid
    image=bpy.data.images.new('Texture_DonkeyChestPigment',width=1536,height=1024,alpha=True);image.alpha_mode='CHANNEL_PACKED';image.colorspace_settings.name='sRGB';image.pixels.foreach_set(pixels[::-1].copy().ravel());image.update()
    path=base/'SourceTextures/Texture_DonkeyChestPigment.png';image.filepath_raw=str(path);image.file_format='PNG';image.save();image.pack()
    probe=bpy.data.images.load(str(path),check_existing=False);decoded=np.array(probe.pixels[:],dtype=np.float32).reshape(1024,1536,4)[::-1];bpy.data.images.remove(probe)
    error=float(np.max(np.abs(decoded-pixels)))
    if error>1.1/255 or np.mean(decoded[520:590,90:225,:3])<.05:raise RuntimeError('Saved chest pigment pixels differ from the source buffer')
    materials=[]
    for material in skin.data.materials:
        if not material or not material.name.startswith(('DonkeyCartGreyCoat','DonkeyLowerLegShortFur','DonkeyCartFaceFur')):continue
        nodes,links=material.node_tree.nodes,material.node_tree.links;shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');previous=shader.inputs['Base Color'].links[0].from_socket
        def Math(operation,a,b=0):
            n=nodes.new('ShaderNodeMath');n.operation=operation
            for index,value in enumerate((a,b)):
                if isinstance(value,(int,float)):n.inputs[index].default_value=value
                else:links.new(value,n.inputs[index])
            return n.outputs[0]
        coordinate=nodes.new('ShaderNodeAttribute');coordinate.attribute_name='ReferenceCoordinates';separate=nodes.new('ShaderNodeSeparateXYZ');links.new(coordinate.outputs['Vector'],separate.inputs[0]);x,y,z=separate.outputs
        uv=nodes.new('ShaderNodeCombineXYZ');ppm=(925-302)/1.10;links.new(Math('ADD',156.5/1536,Math('MULTIPLY',-ppm/1536,x)),uv.inputs[0]);links.new(Math('ADD',1-925/1024,Math('MULTIPLY',ppm/1024,z)),uv.inputs[1])
        texture=nodes.new('ShaderNodeTexImage');texture.image=image;texture.extension='EXTEND';links.new(uv.outputs[0],texture.inputs[0])
        normal=nodes.new('ShaderNodeAttribute');normal.attribute_name='ReferenceSurfaceNormal';separateNormal=nodes.new('ShaderNodeSeparateXYZ');links.new(normal.outputs['Vector'],separateNormal.inputs[0]);nx,ny,nz=separateNormal.outputs
        light=np.array([-.3,.5,.81]);light/=np.linalg.norm(light);dot=Math('ADD',Math('MULTIPLY',-float(light[0]),nx),Math('ADD',Math('MULTIPLY',float(light[1]),Math('ABSOLUTE',ny)),Math('MULTIPLY',float(light[2]),nz)));irradiance=Math('ADD',.55,Math('MULTIPLY',.45,Math('MAXIMUM',0,dot)))
        scale=nodes.new('ShaderNodeVectorMath');scale.operation='SCALE';links.new(texture.outputs['Color'],scale.inputs[0]);links.new(Math('DIVIDE',.50,irradiance),scale.inputs['Scale'])
        tint=nodes.new('ShaderNodeVectorMath');tint.operation='MULTIPLY';tint.inputs[1].default_value=(1,1.03,1.10);links.new(scale.outputs['Vector'],tint.inputs[0])
        guard=nodes.new('ShaderNodeAttribute');guard.attribute_name='ChestUndersideBlend';amount=Math('MULTIPLY',guard.outputs['Fac'],texture.outputs['Alpha']);mix=nodes.new('ShaderNodeMixRGB');links.new(amount,mix.inputs[0]);links.new(previous,mix.inputs[1]);links.new(tint.outputs['Vector'],mix.inputs[2]);links.new(mix.outputs[0],shader.inputs['Base Color']);materials.append(material.name)
    report={'version':'20261027ChestPigmentV47','source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'ropePixelsInterpolated':changes,'mask':'ChestUndersideBlend','materials':materials,'sourceImage':str(path),'savedPixelMaximumError':error,'method':'visible original frontal RGB and local horizontal interpolation over known rope footprints; protected chest underside only; existing frontal illumination compensation, no synthetic pigment or guide fill'}
    (base/'SourceTextures/Data_ChestPigment.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');return report
