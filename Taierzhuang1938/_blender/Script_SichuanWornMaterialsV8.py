"""One coherent old cotton/straw palette, independent of geometry detail."""
import bpy
from pathlib import Path
imageCache={}

def MakeWornMaterial(role,folder,name,narrow=False,patch=False,shade=1,coordinateRoot=None,fold=False,button=False):
    material=bpy.data.materials.new(name);material.use_nodes=True;material['AtlasRegion']=role
    material['WornStudy']='V08 shared dust and fibre palette';material['NarrowTape']=narrow
    material['WearPatch']=patch;material['WearFold']=fold;material['WearButton']=button;material['StrawTone']=shade
    nodes=material.node_tree.nodes;links=material.node_tree.links;nodes.clear()
    out=nodes.new('ShaderNodeOutputMaterial');shader=nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Metallic'].default_value=0;shader.inputs['Roughness'].default_value=.95
    shader.inputs['Sheen Weight'].default_value=0 if role=='straw' else .08 if role=='jacket' else .12 if role=='binding' else .14
    shader.inputs['Specular IOR Level'].default_value=.25 if role=='straw' else .30 if role=='jacket' else .40 if role=='binding' else .50
    links.new(shader.outputs['BSDF'],out.inputs['Surface'])
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
    oldRect={'cloth':(.02,.52),'binding':(.02,.02),'jacket':(.52,.02),'straw':(.52,.52)}[role]
    origin=nodes.new('ShaderNodeVectorMath');origin.operation='SUBTRACT';origin.inputs[1].default_value=(*oldRect,0);links.new(uv.outputs['UV'],origin.inputs[0])
    scale=nodes.new('ShaderNodeVectorMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=(1/.46,1/.46,1);links.new(origin.outputs[0],scale.inputs[0]);vector=scale.outputs[0]
    if narrow:
        shift=nodes.new('ShaderNodeVectorMath');shift.operation='SUBTRACT';shift.inputs[1].default_value=(.42,0,0);links.new(vector,shift.inputs[0]);vector=shift.outputs[0]
    extent=(.044,.050) if patch else (.13,.30) if fold else (.38,.30) if role=='cloth' else (.026,.18) if role=='binding' else (.008,.006) if button else (1.24,.56) if role=='jacket' else (.08,.08)
    material['FabricExtentM']=extent
    repeat=nodes.new('ShaderNodeVectorMath');repeat.operation='MULTIPLY';repeat.inputs[1].default_value=(extent[0]/.08/(.16 if narrow else 1),extent[1]/.08,1);links.new(vector,repeat.inputs[0])
    fract=nodes.new('ShaderNodeVectorMath');fract.operation='FRACTION';links.new(repeat.outputs[0],fract.inputs[0])
    atlasScale=nodes.new('ShaderNodeVectorMath');atlasScale.operation='MULTIPLY';atlasScale.inputs[1].default_value=(.484,.484,1);links.new(fract.outputs[0],atlasScale.inputs[0])
    offset=nodes.new('ShaderNodeVectorMath');offset.operation='ADD';offset.inputs[1].default_value={'cloth':(.008,.508,0),'binding':(.508,.508,0),'jacket':(.008,.008,0),'straw':(.508,.008,0)}[role];links.new(atlasScale.outputs[0],offset.inputs[0])
    images={}
    for channel in ('Base','Normal','Roughness'):
        if channel not in imageCache:imageCache[channel]=bpy.data.images.load(str(Path(folder)/('Texture_SichuanWornFibersV08'+channel+'.png')),check_existing=False)
        image=imageCache[channel]
        image.colorspace_settings.name='sRGB' if channel=='Base' else 'Non-Color';image.pack();images[channel]=image
    tex=nodes.new('ShaderNodeTexImage');tex.image=images['Base'];links.new(offset.outputs[0],tex.inputs['Vector']);colour=tex.outputs['Color']
    tint=nodes.new('ShaderNodeHueSaturation');tint.inputs['Saturation'].default_value=.92 if role=='straw' else 1.30 if role=='jacket' else .88;tint.inputs['Value'].default_value=.65*shade if role=='straw' else .38 if role=='jacket' else .97 if not patch else .90;links.new(colour,tint.inputs['Color']);colour=tint.outputs[0]
    if role=='straw':
        wheat=nodes.new('ShaderNodeMixRGB');wheat.blend_type='MULTIPLY';wheat.inputs[0].default_value=1;wheat.inputs[2].default_value=(1,.90,.45,1);links.new(colour,wheat.inputs[1]);colour=wheat.outputs[0]
    if role=='jacket':
        indigo=nodes.new('ShaderNodeMixRGB');indigo.blend_type='MULTIPLY';indigo.inputs[0].default_value=1;indigo.inputs[2].default_value=(.60,.80,1,1);links.new(colour,indigo.inputs[1]);colour=indigo.outputs[0]
    # Shared, restrained soil tint keeps accessories and cloth in one age range.
    coordinates=nodes.new('ShaderNodeTexCoord');coordinates.object=coordinateRoot or bpy.data.objects['Pack_Root']
    rest=nodes.new('ShaderNodeVectorMath');rest.operation='ADD'
    pack=bpy.data.objects['Pack_Root'];rest.inputs[1].default_value=tuple(pack.matrix_world.inverted()@coordinates.object.matrix_world.translation)
    links.new(coordinates.outputs['Object'],rest.inputs[0]);position=rest.outputs[0]
    material['WearCoordinateRoot']=coordinates.object.name
    noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=18;noise.inputs['Detail'].default_value=3;noise.inputs['Roughness'].default_value=.7;links.new(position,noise.inputs['Vector'])
    amount=nodes.new('ShaderNodeMath');amount.operation='MULTIPLY';amount.inputs[1].default_value=.14;links.new(noise.outputs['Fac'],amount.inputs[0])
    xyz=nodes.new('ShaderNodeSeparateXYZ');links.new(position,xyz.inputs[0])
    lower=nodes.new('ShaderNodeMapRange');lower.clamp=True;lower.inputs['From Min'].default_value=-.14;lower.inputs['From Max'].default_value=.01;lower.inputs['To Min'].default_value=.20;lower.inputs['To Max'].default_value=0;links.new(xyz.outputs['Z'],lower.inputs['Value'])
    soil=nodes.new('ShaderNodeMath');soil.operation='ADD';links.new(amount.outputs[0],soil.inputs[0]);links.new(lower.outputs['Result'],soil.inputs[1])
    dirt=nodes.new('ShaderNodeMixRGB');dirt.blend_type='MULTIPLY';dirt.inputs[2].default_value=(.38,.34,.29,1);links.new(soil.outputs[0],dirt.inputs[0]);links.new(colour,dirt.inputs[1]);links.new(dirt.outputs[0],shader.inputs['Base Color'])
    normal=nodes.new('ShaderNodeTexImage');normal.image=images['Normal'];links.new(offset.outputs[0],normal.inputs['Vector'])
    normalMap=nodes.new('ShaderNodeNormalMap');normalMap.uv_map='UVMap';normalMap.inputs['Strength'].default_value=.20 if role=='binding' else .35 if role=='straw' else .32;links.new(normal.outputs['Color'],normalMap.inputs['Color']);links.new(normalMap.outputs['Normal'],shader.inputs['Normal'])
    rough=nodes.new('ShaderNodeTexImage');rough.image=images['Roughness'];links.new(offset.outputs[0],rough.inputs['Vector']);links.new(rough.outputs['Color'],shader.inputs['Roughness'])
    return material

def ApplyWornMaterials(root,folder):
    mapping={}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        assembly=obj
        while assembly.parent and assembly.parent!=root:assembly=assembly.parent
        coordinateRoot=assembly if assembly.name in ('Pack_Jacket','Pack_StrawMat','Pack_Sandals') else root
        for index,old in enumerate(obj.data.materials):
            role=old.get('AtlasRegion','cloth');narrow='NarrowCottonTape' in old.name or old.get('NarrowTape',False)
            patch=bool(old.get('WearPatch',False) or 'Patch' in old.name or (obj.name=='Pack_Bundle' and index==3))
            fold=bool(old.get('WearFold',False) or 'Fold' in old.name or (obj.name=='Pack_Bundle' and index==2))
            button=bool(old.get('WearButton',False) or 'Button' in old.name or obj.name=='StudyV7_ClothKnotButton')
            # The joined civilian garment inherited a historical object name
            # containing "Button"; only its separate knot is button-sized.
            if obj.name=='Pack_ClothButtonLoop' and index==1:button=False
            shade=old.get('StrawTone',None)
            if shade is None and role=='straw' and old.use_nodes:
                hue=next((n for n in old.node_tree.nodes if n.bl_idname=='ShaderNodeHueSaturation'),None)
                shade=hue.inputs['Value'].default_value/.65 if hue else 1
            if shade is None:shade=1
            style='Patch' if patch else 'Fold' if fold else 'Button' if button else 'NarrowTape' if narrow else 'Base'
            key=(role,style,coordinateRoot.name,round(float(shade),3))
            if key not in mapping:
                name='Material_SichuanV8_'+coordinateRoot.name.replace('Pack_','')+'_'+role.title()+style
                mapping[key]=MakeWornMaterial(role,folder,name,narrow=narrow,patch=patch,shade=shade,coordinateRoot=coordinateRoot,fold=fold,button=button)
            obj.data.materials[index]=mapping[key]
    return mapping
