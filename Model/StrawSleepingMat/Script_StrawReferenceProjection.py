"""Project the approved imagegen references into production material UVs.

Run through the isolated BlenderMCP instance. This is an emission UV bake;
the source images stay in the local Blender project's References directory.
No screenshot, review page or reference sheet is copied into the repository.
"""
import bpy
import math
import json
import numpy as np
from pathlib import Path

scene=bpy.context.scene
assert scene.get('BlenderMcpTask')=='StrawSleepingMat'
root=Path(scene['StrawMatRoot'])
references=Path(bpy.data.filepath).parent/'References'
source=root/'Source'
profileRows=np.array([232,280,312,350,390],dtype=float)
profileRgb=np.array([[185,147,111],[181,146,109],[165,132,97],[132,100,70],[81,61,41]],dtype=float)/255
profileLinear=np.where(profileRgb<=.04045,profileRgb/12.92,((profileRgb+.055)/1.055)**2.4)
profileLuma=profileLinear@np.array([.2126,.7152,.0722])
profilePolynomial=np.polyfit((profileRows-224)/176,profileLuma,3)


def LightCorrection(state,v):
    if state!='Rolled':return 1.0
    y=312-88*math.cos(math.pi+math.tau*v)
    light=float(np.polyval(profilePolynomial,(y-224)/176))
    return max(.85,min(5.0,.30/max(.03,light)))


def SourceUV(state,u,v):
    if state=='Flat':
        return ((59+1137*u)/1254,1-(727-492*v)/1254)
    # The side reference is an orthographic cylinder projection. Sampling
    # cos(theta) undoes its foreshortening for the wrap, rather than stretching
    # the narrow photographed face linearly around the whole circumference.
    knots=[(0,65),(.25,350),(.75,952),(1,1272)]
    for (a,x0),(b,x1) in zip(knots,knots[1:]):
        if u<=b+1e-6:
            x=x0+(x1-x0)*(u-a)/(b-a)
            break
    theta=math.pi+math.tau*v
    y=312-88*math.cos(theta)
    return (x/1774,1-y/887)


def Bake(state):
    image=bpy.data.images.load(str(references/f'Reference_StrawSleepingMat{state}.png'),check_existing=False)
    image.colorspace_settings.name='sRGB'
    output=bpy.data.images.new(f'Projection_{state}',width=1024,height=512,alpha=False)
    output.colorspace_settings.name='sRGB'
    mesh=bpy.data.meshes.new('Projection_Mesh')
    vertices=[];faces=[]
    steps=64
    for y in range(steps+1):
        for x in range(steps+1):vertices.append((x/steps,y/steps,0))
    for y in range(steps):
        for x in range(steps):
            a=y*(steps+1)+x;faces.append((a,a+1,a+steps+2,a+steps+1))
    mesh.from_pydata(vertices,[],faces);mesh.update()
    correction=mesh.attributes.new('ProjectionLightCorrection','FLOAT','POINT')
    for vertex,attribute in zip(mesh.vertices,correction.data):
        attribute.value=LightCorrection(state,vertex.co.y)
    targetUV=mesh.uv_layers.new(name='UVMap')
    referenceUV=mesh.uv_layers.new(name='ReferenceUV')
    for face in mesh.polygons:
        for loop in face.loop_indices:
            vertex=mesh.vertices[mesh.loops[loop].vertex_index].co
            u,v=vertex.x,vertex.y
            targetUV.data[loop].uv=(u,v)
            referenceUV.data[loop].uv=SourceUV(state,u,v)
    mesh.uv_layers.active=targetUV
    obj=bpy.data.objects.new('Projection_Object',mesh)
    scene.collection.objects.link(obj)
    material=bpy.data.materials.new('Projection_Material');material.use_nodes=True
    nodes=material.node_tree.nodes;links=material.node_tree.links;nodes.clear()
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='ReferenceUV'
    texture=nodes.new('ShaderNodeTexImage');texture.image=image
    attribute=nodes.new('ShaderNodeAttribute');attribute.attribute_name='ProjectionLightCorrection'
    multiply=nodes.new('ShaderNodeVectorMath');multiply.operation='SCALE'
    limit=nodes.new('ShaderNodeVectorMath');limit.operation='MINIMUM';limit.inputs[1].default_value=(.8,.8,.8)
    emit=nodes.new('ShaderNodeEmission');out=nodes.new('ShaderNodeOutputMaterial')
    links.new(uv.outputs['UV'],texture.inputs['Vector'])
    links.new(texture.outputs['Color'],multiply.inputs[0])
    links.new(attribute.outputs['Fac'],multiply.inputs['Scale'])
    links.new(multiply.outputs['Vector'],limit.inputs[0])
    links.new(limit.outputs['Vector'],emit.inputs['Color'])
    links.new(emit.outputs['Emission'],out.inputs['Surface'])
    target=nodes.new('ShaderNodeTexImage');target.image=output;nodes.active=target
    obj.data.materials.append(material)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    scene.render.engine='CYCLES';scene.cycles.samples=1
    scene.render.bake.use_clear=True;scene.render.bake.margin=2
    bpy.ops.object.bake(type='EMIT')
    file=source/f'Texture_Straw{state}ReferenceProjection.png'
    output.filepath_raw=str(file);output.file_format='PNG';output.save()
    bpy.data.objects.remove(obj,do_unlink=True)
    print('PROJECTED '+str(file),flush=True)
    return {'state':state,'source':str(references/f'Reference_StrawSleepingMat{state}.png'),
            'output':file.name,'method':'Blender emission UV projection from user-approved imagegen reference',
            'broadLightRemoval':'Row-median cubic lighting profile, linear colour, factor .85..5; stains and fine woven fibres preserved' if state=='Rolled' else 'none'}


records=[Bake('Flat'),Bake('Rolled')]
(source/'Data_ReferenceProjection.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
scene['StrawMatBlendName']='Scene_StrawSleepingMatDetail.blend'
