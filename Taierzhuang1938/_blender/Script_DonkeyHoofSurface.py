"""Resolved horn lamellae and restrained dirt for the bare donkey atlas."""
import bpy,bmesh,math,json,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector


def ReferenceHornPalette(base):
    source=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020/References/Image_DonkeyOriginalThreeView.png')
    image=bpy.data.images.load(str(source),check_existing=False)
    rgb=np.array(image.pixels[:],dtype=np.float32).reshape(1024,1536,4)[::-1,:,:3];bpy.data.images.remove(image)
    boxes={'ToeLeft':[81,897,103,919],'ToeRight':[203,899,232,918],'HeelLeft':[1319,901,1336,916],'HeelRight':[1444,903,1463,916]}
    samples={key:rgb[top:bottom,left:right].reshape(-1,3) for key,(left,top,right,bottom) in boxes.items()}
    linear={key:np.where(value<=.04045,value/12.92,((value+.055)/1.055)**2.4) for key,value in samples.items()}
    calibration=np.array([1,1.03,1.10])*(.50/.75)
    palette={'toe':np.mean([np.median(linear[k],axis=0) for k in ['ToeLeft','ToeRight']],axis=0)*calibration,
             'heel':np.mean([np.median(linear[k],axis=0) for k in ['HeelLeft','HeelRight']],axis=0)*calibration,
             'dust':np.quantile(np.concatenate([linear[k] for k in ['ToeLeft','ToeRight']]),.80,axis=0)*calibration,
             'toeMottle':np.quantile(np.concatenate([linear[k] for k in ['ToeLeft','ToeRight']]),.10,axis=0)*calibration,
             'heelMottle':np.quantile(np.concatenate([linear[k] for k in ['HeelLeft','HeelRight']]),.80,axis=0)*calibration}
    record={'source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sourceBoxes':boxes,
            'calibrationLinearRgb':calibration.tolist(),'paletteLinearRgb':{key:value.tolist() for key,value in palette.items()},
            'method':'visible toe and heel wall samples from the original front/rear photographs; toe dust uses the 80th percentile within those same wall samples'}
    (base/'SourceTextures/Data_HoofPigment.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
    return palette,record


def RefineHoofSurface(skin):
    palette,pigmentRecord=ReferenceHornPalette(Path(bpy.context.scene['DonkeySourceRoot']))
    material=bpy.data.materials['DonkeyHoofHorn'];material.use_nodes=True
    nodes,links=material.node_tree.nodes,material.node_tree.links;nodes.clear()
    shader=nodes.new('ShaderNodeBsdfPrincipled');output=nodes.new('ShaderNodeOutputMaterial');links.new(shader.outputs['BSDF'],output.inputs['Surface'])
    shader.inputs['Roughness'].default_value=.78;shader.inputs['Specular IOR Level'].default_value=.20
    def Connect(value,socket):
        if isinstance(value,(int,float,tuple,list,np.ndarray)):socket.default_value=tuple(value) if isinstance(value,(tuple,list,np.ndarray)) else value
        else:links.new(value,socket)
    def Math(operation,*values):
        node=nodes.new('ShaderNodeMath');node.operation=operation
        for value,socket in zip(values,node.inputs):Connect(value,socket)
        return node.outputs[0]
    def Smooth(a,b,value):
        t=Math('MINIMUM',1,Math('MAXIMUM',0,Math('DIVIDE',Math('SUBTRACT',value,a),b-a)))
        return Math('MULTIPLY',Math('MULTIPLY',t,t),Math('SUBTRACT',3,Math('MULTIPLY',2,t)))
    def Mix(amount,a,b,blend='MIX'):
        node=nodes.new('ShaderNodeMixRGB');node.blend_type=blend
        for value,socket in zip([amount,a,b],node.inputs):Connect(value,socket)
        return node.outputs[0]
    coordinate=nodes.new('ShaderNodeAttribute');coordinate.attribute_name='HoofRestCoordinates'
    variation=nodes.new('ShaderNodeAttribute');variation.attribute_name='HoofVariation'
    separate=nodes.new('ShaderNodeSeparateXYZ');links.new(coordinate.outputs['Vector'],separate.inputs[0]);x,y,z=separate.outputs
    planar=nodes.new('ShaderNodeCombineXYZ');links.new(x,planar.inputs['X']);links.new(y,planar.inputs['Y'])
    radial=nodes.new('ShaderNodeVectorMath');radial.operation='NORMALIZE';links.new(planar.outputs[0],radial.inputs[0])
    facing=nodes.new('ShaderNodeSeparateXYZ');links.new(radial.outputs[0],facing.inputs[0]);toe=Smooth(-.65,.65,facing.outputs['Y'])
    def Noise(stretch,detail):
        scale=nodes.new('ShaderNodeVectorMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=stretch;links.new(coordinate.outputs['Vector'],scale.inputs[0])
        node=nodes.new('ShaderNodeTexNoise');node.noise_dimensions='4D';node.inputs['Scale'].default_value=1;node.inputs['Detail'].default_value=detail
        links.new(scale.outputs[0],node.inputs['Vector']);links.new(Math('MULTIPLY',variation.outputs['Fac'],3.173),node.inputs['W']);return node.outputs['Fac']
    grain=Noise((650,650,24),2);dirt=Noise((70,70,70),2);growth=Noise((31,31,31),1);mottle=Noise((125,125,60),3)
    color=Mix(toe,tuple(palette['heel'])+(1,),tuple(palette['toe'])+(1,))
    patch=Mix(toe,tuple(palette['heelMottle'])+(1,),tuple(palette['toeMottle'])+(1,))
    color=Mix(Math('MULTIPLY',.75,Smooth(.38,.64,mottle)),color,patch)
    crown=Math('SUBTRACT',1,Math('MULTIPLY',.25,Smooth(.040,.068,z)));color=Mix(1,color,crown,'MULTIPLY')
    dust=Math('MULTIPLY',Math('SUBTRACT',1,Smooth(.004,.050,z)),Math('ADD',.25,Math('MULTIPLY',.45,dirt)))
    dust=Math('MULTIPLY',dust,Math('ADD',.15,Math('MULTIPLY',.85,toe)));color=Mix(dust,color,tuple(palette['dust'])+(1,))
    phase=Math('ADD',Math('MULTIPLY',z,2*math.pi*65),Math('MULTIPLY',growth,1.1));wave=Math('SINE',phase)
    modulation=Math('MULTIPLY',Math('ADD',.90,Math('MULTIPLY',.20,grain)),Math('ADD',.988,Math('MULTIPLY',.012,wave)))
    links.new(Mix(1,color,modulation,'MULTIPLY'),shader.inputs['Base Color'])
    links.new(Math('ADD',.68,Math('MULTIPLY',.20,dirt)),shader.inputs['Roughness'])
    lamellae=nodes.new('ShaderNodeBump');lamellae.inputs['Strength'].default_value=.12;lamellae.inputs['Distance'].default_value=.00032;links.new(wave,lamellae.inputs['Height'])
    micro=nodes.new('ShaderNodeBump');micro.inputs['Strength'].default_value=.12;micro.inputs['Distance'].default_value=.00025;links.new(grain,micro.inputs['Height']);links.new(lamellae.outputs['Normal'],micro.inputs['Normal']);links.new(micro.outputs['Normal'],shader.inputs['Normal'])
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
    coordinates=skin.data.attributes.get('HoofRestCoordinates') or skin.data.attributes.new('HoofRestCoordinates','FLOAT_VECTOR','POINT')
    variation=skin.data.attributes.get('HoofVariation') or skin.data.attributes.new('HoofVariation','FLOAT','POINT');ownerAttribute=skin.data.attributes['FootOwner']
    for vertex in skin.data.vertices:
        owner=ownerAttribute.data[vertex.index].value
        if owner not in centres:continue
        p=vertex.co-centres[owner];p.z=vertex.co.z;coordinates.data[vertex.index].vector=p;variation.data[vertex.index].value=owner
    bpy.context.scene['DonkeyReferenceHornCharts']=True
    return {'material':material.name,'roughnessRange':[.68,.88],'lamellaePerMetre':65,'longitudinalGrainScale':[650,650,24],'pigment':pigmentRecord,
        'lamellaReliefM':.00032*.12,'grainReliefM':.00025*.12,'geometryRidgeMaxDepthM':maximum,'geometryAddedTriangles':added,
        'runtime':'shallow real horn relief; baked existing UV0 base, normal and ORM; no additional runtime material or image'}
