"""Resolved horn lamellae and restrained dirt for the bare donkey atlas."""
import bpy,bmesh,math
from mathutils import Vector

def RefineHoofSurface(skin):
    material=bpy.data.materials['DonkeyHoofHorn'];material.use_nodes=True
    nodes,links=material.node_tree.nodes,material.node_tree.links;nodes.clear()
    shader=nodes.new('ShaderNodeBsdfPrincipled');output=nodes.new('ShaderNodeOutputMaterial');links.new(shader.outputs['BSDF'],output.inputs['Surface'])
    shader.inputs['Roughness'].default_value=.68;shader.inputs['Specular IOR Level'].default_value=.24
    coordinate=nodes.new('ShaderNodeTexCoord');stretch=nodes.new('ShaderNodeVectorMath');stretch.operation='MULTIPLY';stretch.inputs[1].default_value=(120,120,9)
    links.new(coordinate.outputs['Object'],stretch.inputs[0]);grain=nodes.new('ShaderNodeTexNoise');grain.inputs['Scale'].default_value=1;grain.inputs['Detail'].default_value=1
    links.new(stretch.outputs[0],grain.inputs['Vector']);ramp=nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position=.15;ramp.color_ramp.elements[0].color=(.067,.058,.046,1)
    ramp.color_ramp.elements[1].position=.86;ramp.color_ramp.elements[1].color=(.190,.160,.125,1)
    links.new(grain.outputs['Fac'],ramp.inputs['Fac'])
    dirt=nodes.new('ShaderNodeTexNoise');dirt.inputs['Scale'].default_value=35;dirt.inputs['Detail'].default_value=2;links.new(coordinate.outputs['Object'],dirt.inputs['Vector'])
    dirtRamp=nodes.new('ShaderNodeValToRGB');dirtRamp.color_ramp.elements[0].position=.34;dirtRamp.color_ramp.elements[0].color=(.44,.39,.31,1)
    dirtRamp.color_ramp.elements[1].position=.72;dirtRamp.color_ramp.elements[1].color=(1,1,1,1);links.new(dirt.outputs['Fac'],dirtRamp.inputs['Fac'])
    mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=.42;links.new(ramp.outputs['Color'],mix.inputs[1]);links.new(dirtRamp.outputs['Color'],mix.inputs[2])
    separate=nodes.new('ShaderNodeSeparateXYZ');links.new(coordinate.outputs['Object'],separate.inputs[0])
    phase=nodes.new('ShaderNodeMath');phase.operation='MULTIPLY';phase.inputs[1].default_value=2*math.pi*75;links.new(separate.outputs['Z'],phase.inputs[0])
    wave=nodes.new('ShaderNodeMath');wave.operation='SINE';links.new(phase.outputs[0],wave.inputs[0])
    pigment=nodes.new('ShaderNodeMath');pigment.operation='MULTIPLY_ADD';pigment.inputs[1].default_value=.06;pigment.inputs[2].default_value=1;links.new(wave.outputs[0],pigment.inputs[0])
    color=nodes.new('ShaderNodeMixRGB');color.blend_type='MULTIPLY';color.inputs[0].default_value=1;links.new(mix.outputs[0],color.inputs[1]);links.new(pigment.outputs[0],color.inputs[2]);links.new(color.outputs[0],shader.inputs['Base Color'])
    lamellae=nodes.new('ShaderNodeBump');lamellae.inputs['Strength'].default_value=.32;lamellae.inputs['Distance'].default_value=.0013;links.new(wave.outputs[0],lamellae.inputs['Height'])
    micro=nodes.new('ShaderNodeBump');micro.inputs['Strength'].default_value=.14;micro.inputs['Distance'].default_value=.0004;links.new(grain.outputs['Fac'],micro.inputs['Height']);links.new(lamellae.outputs['Normal'],micro.inputs['Normal']);links.new(micro.outputs['Normal'],shader.inputs['Normal'])
    # A few extra wall rings carry shallow real horn relief. The standing rim
    # is untouched, and the existing integer owner/deform layers interpolate.
    bm=bmesh.new();bm.from_mesh(skin.data)
    horn=skin.data.materials.find(material.name);before=sum(len(f.verts)-2 for f in bm.faces)
    for height in (.014,.025,.036,.047,.058,.064):
        faces=[f for f in bm.faces if f.material_index==horn]
        geometry=set(faces)|{e for f in faces for e in f.edges}|{v for f in faces for v in f.verts}
        bmesh.ops.bisect_plane(bm,geom=list(geometry),dist=1e-7,plane_co=(0,0,height),plane_no=(0,0,1),clear_inner=False,clear_outer=False)
    owners=bm.verts.layers.int['FootOwner'];centres={}
    for owner in range(1,5):
        points=[v.co for v in bm.verts if v[owners]==owner and v.co.z<.006]
        centres[owner]=sum(points,Vector())/len(points)
    maximum=0
    for vertex in {v for f in bm.faces if f.material_index==horn for v in f.verts}:
        z=vertex.co.z
        if not .010<z<.068:continue
        def Smooth(a,b,value):
            t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)
        envelope=Smooth(.010,.020,z)*(1-Smooth(.058,.068,z))
        displacement=.00065*math.sin(2*math.pi*65*z)*envelope
        direction=vertex.co-centres[vertex[owners]];direction.z=0
        if direction.length>1e-6:vertex.co+=direction.normalized()*displacement;maximum=max(maximum,abs(displacement))
    added=sum(len(f.verts)-2 for f in bm.faces)-before
    if added>1600:raise RuntimeError('Hoof ring refinement exceeded its local triangle allowance')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(skin.data);bm.free();skin.data.update()
    return {'material':material.name,'roughness':.68,'lamellaePerMetre':75,'longitudinalGrainScale':[120,120,9],
        'lamellaReliefM':.0013*.32,'geometryRidgeMaxDepthM':maximum,'geometryAddedTriangles':added,
        'runtime':'shallow real horn relief; baked existing UV0 base, normal and ORM; no additional runtime material or image'}
