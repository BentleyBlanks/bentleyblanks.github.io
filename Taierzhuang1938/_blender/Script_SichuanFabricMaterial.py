"""Fine cloth shading in physical scale, kept separate from broad wear."""
import bpy


def ApplyFabric(material,role,folder,extent,narrowTape=False,wear=None,normalStrength=.75):
    region=material['AtlasRegion'];rect={'cloth':(.02,.52),'binding':(.02,.02),'jacket':(.52,.02)}[region]
    material.use_nodes=True;nodes=material.node_tree.nodes;links=material.node_tree.links;nodes.clear()
    out=nodes.new('ShaderNodeOutputMaterial');shader=nodes.new('ShaderNodeBsdfPrincipled');shader.inputs['Roughness'].default_value=.95;shader.inputs['Metallic'].default_value=0;links.new(shader.outputs['BSDF'],out.inputs['Surface'])
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
    origin=nodes.new('ShaderNodeVectorMath');origin.operation='SUBTRACT';origin.inputs[1].default_value=(*rect,0)
    normalize=nodes.new('ShaderNodeVectorMath');normalize.operation='MULTIPLY';normalize.inputs[1].default_value=(1/.46,1/.46,1)
    links.new(uv.outputs['UV'],origin.inputs[0]);links.new(origin.outputs[0],normalize.inputs[0]);plain=normalize.outputs[0]
    vector=plain
    if narrowTape:
        shift=nodes.new('ShaderNodeVectorMath');shift.operation='SUBTRACT';shift.inputs[1].default_value=(.42,0,0);links.new(vector,shift.inputs[0]);vector=shift.outputs[0]
    scale=nodes.new('ShaderNodeVectorMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=(extent[0]/.08/(.16 if narrowTape else 1),extent[1]/.08,1);links.new(vector,scale.inputs[0])
    base=nodes.new('ShaderNodeTexImage');base.image=bpy.data.images.load(str(folder/f'Texture_Fabric{role}Base.png'),check_existing=True);base.image.colorspace_settings.name='sRGB';links.new(scale.outputs[0],base.inputs['Vector']);colour=base.outputs['Color']
    if wear:
        mask=nodes.new('ShaderNodeTexImage');mask.image=bpy.data.images.load(str(folder/f'Texture_CottonWear{wear}.png'),check_existing=True);mask.image.colorspace_settings.name='Non-Color';mask.extension='EXTEND';links.new(plain,mask.inputs['Vector'])
        ratio=nodes.new('ShaderNodeVectorMath');ratio.operation='SCALE';ratio.inputs['Scale'].default_value=2;links.new(mask.outputs['Color'],ratio.inputs[0])
        multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=.95;links.new(colour,multiply.inputs[1]);links.new(ratio.outputs[0],multiply.inputs[2]);colour=multiply.outputs[0]
    links.new(colour,shader.inputs['Base Color'])
    normal=nodes.new('ShaderNodeTexImage');normal.image=bpy.data.images.load(str(folder/f'Texture_Fabric{role}Normal.png'),check_existing=True);normal.image.colorspace_settings.name='Non-Color';links.new(scale.outputs[0],normal.inputs['Vector'])
    bump=nodes.new('ShaderNodeNormalMap');bump.uv_map='UVMap';bump.inputs['Strength'].default_value=normalStrength;links.new(normal.outputs['Color'],bump.inputs['Color']);links.new(bump.outputs['Normal'],shader.inputs['Normal'])
    material['FabricStudyV05']=role
