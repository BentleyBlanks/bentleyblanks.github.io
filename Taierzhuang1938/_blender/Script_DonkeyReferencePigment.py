"""Bake visible reference RGB into the coat without exaggerated luma ratios."""
import bpy,json,hashlib
from pathlib import Path
import numpy as np
from mathutils import Vector

def InstallReferencePigment(scene,skin,rig,base):
    project=Path(scene['DonkeyCartProject']);namespace={}
    file=project/'_blender/Script_DonkeyReferenceMasks.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace)
    occlusion=namespace['BuildOcclusionWeights']();facialFeatures=namespace['BuildFacialFeatureWeights']();arrays=[]
    paths=[Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020/References/Image_DonkeyOriginalThreeView.png'),base/'Image_NakedAnatomyGuide.png']
    for path in paths:
        image=bpy.data.images.load(str(path),check_existing=False)
        if tuple(image.size)!=(1536,1024):image.scale(1536,1024)
        arrays.append(np.array(image.pixels[:],dtype=np.float32).reshape(1024,1536,4)[::-1,:,:3]);bpy.data.images.remove(image)
    blurNamespace={};file=project/'_blender/Script_DonkeyPhotoDetail.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),blurNamespace)
    blur=blurNamespace['BoxBlur'];yy,xx=np.indices((1024,1536));images={};records=[]
    for view,(left,right) in {'Side':(335,1217),'Front':(34,280),'Rear':(1225,1518)}.items():
        blend=occlusion[view][:,:,None];rgb=arrays[0]*(1-blend)+arrays[1]*blend
        seed=(rgb.mean(axis=2)<.69).astype(np.float32)
        confidence=np.clip((blur(blur(seed))-.35)/.40,0,1)
        confidence*=((xx>left)&(xx<right)&(yy>30)&(yy<925))
        confidence*=1-facialFeatures[view]
        linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
        low=np.stack([blur(linear[:,:,channel],1) for channel in range(3)],axis=2)
        linear=np.clip(linear+1.25*(linear-low),0,1)
        rgb=np.where(linear<=.0031308,linear*12.92,1.055*linear**(1/2.4)-.055)
        pixels=np.ones((1024,1536,4),dtype=np.float32);pixels[:,:,:3]=rgb;pixels[:,:,3]=confidence
        name='Texture_DonkeyReference'+view+'Pigment'
        image=bpy.data.images.new(name,width=1536,height=1024,alpha=True);image.colorspace_settings.name='sRGB';image.alpha_mode='CHANNEL_PACKED'
        image.pixels.foreach_set(pixels[::-1].copy().ravel());path=base/'SourceTextures'/(name+'.png');image.filepath_raw=str(path);image.file_format='PNG';image.save()
        content=path.read_bytes();image.pack(data=content,data_len=len(content));images[view]=image
        records.append({'view':view,'path':str(path),'sha256':hashlib.sha256(content).hexdigest(),'size':[1536,1024]})
    transform=rig.matrix_world.inverted()@skin.matrix_world;normalMatrix=transform.to_3x3().inverted().transposed()
    attribute=skin.data.attributes.get('ReferenceSurfaceNormal') or skin.data.attributes.new('ReferenceSurfaceNormal','FLOAT_VECTOR','POINT')
    for vertex in skin.data.vertices:attribute.data[vertex.index].vector=(normalMatrix@vertex.normal).normalized()
    scope=skin.data.attributes.get('ReferencePigmentScope') or skin.data.attributes.new('ReferencePigmentScope','FLOAT','POINT')
    for value in scope.data:value.value=1
    if scene.get('DonkeyReferenceChestRevision'):
        underside=skin.data.attributes.get('ChestUndersideBlend') or skin.data.attributes.new('ChestUndersideBlend','FLOAT','POINT')
        def Smooth(a,b,v):
            t=max(0,min(1,(v-a)/(b-a)));return t*t*(3-2*t)
        for vertex in skin.data.vertices:
            p=transform@vertex.co;n=(normalMatrix@vertex.normal).normalized()
            area=Smooth(.50,.60,p.y)*(1-Smooth(.86,.96,p.y))*Smooth(.55,.60,p.z)*(1-Smooth(.70,.76,p.z))*(1-Smooth(.18,.22,abs(p.x)))
            vertical=abs(n.y)/max(.001,float(np.hypot(n.y,n.z)));weight=area*Smooth(.40,.80,-n.z)*(1-Smooth(.45,.70,vertical))
            underside.data[vertex.index].value=weight;scope.data[vertex.index].value=1-weight
    eye=bpy.data.objects['DonkeyEyeLeft'];eyeMatrix=rig.matrix_world.inverted()@eye.matrix_world
    eyeCentre=sum((eyeMatrix@v.co for v in eye.data.vertices),Vector())/len(eye.data.vertices);eyeCentre.x=abs(eyeCentre.x)
    ppm=(925-302)/1.10;anchor=scene['DonkeyReferenceFitAnchorY'];gain=.50;mixStrength=.95;materials=[]
    eyeProtection=(.028,.028,.012) if scene.get('DonkeyHeadFitReport') else (.040,.040,.020)
    for material in skin.data.materials:
        if not material:continue
        furry=material.name.startswith(('DonkeyCartGreyCoat','DonkeyLowerLegShortFur','DonkeyCartFaceFur'))
        nasal=bool(scene.get('DonkeyMuzzleRevision')) and material.name.startswith('DonkeyNasalPad')
        if not (furry or nasal):continue
        nodes,links=material.node_tree.nodes,material.node_tree.links
        shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');previous=shader.inputs['Base Color'].links[0].from_socket
        def Math(operation,a,b=0):
            node=nodes.new('ShaderNodeMath');node.operation=operation
            for index,value in enumerate((a,b)):
                if isinstance(value,(int,float)):node.inputs[index].default_value=value
                else:links.new(value,node.inputs[index])
            return node.outputs[0]
        def Clamp(value):return Math('MINIMUM',1,Math('MAXIMUM',0,value))
        def Scale(color,value):
            node=nodes.new('ShaderNodeVectorMath');node.operation='SCALE';links.new(color,node.inputs[0])
            if isinstance(value,(int,float)):node.inputs['Scale'].default_value=value
            else:links.new(value,node.inputs['Scale'])
            return node.outputs['Vector']
        def Add(a,b):
            node=nodes.new('ShaderNodeVectorMath');node.operation='ADD';links.new(a,node.inputs[0]);links.new(b,node.inputs[1]);return node.outputs['Vector']
        coords=nodes.new('ShaderNodeAttribute');coords.attribute_name='ReferenceCoordinates';position=nodes.new('ShaderNodeSeparateXYZ');links.new(coords.outputs['Vector'],position.inputs[0]);x,y,z=position.outputs
        visibility=nodes.new('ShaderNodeAttribute');visibility.attribute_name='ReferenceViewWeights';weights=nodes.new('ShaderNodeSeparateXYZ');links.new(visibility.outputs['Vector'],weights.inputs[0])
        normal=nodes.new('ShaderNodeAttribute');normal.attribute_name='ReferenceSurfaceNormal';normalize=nodes.new('ShaderNodeVectorMath');normalize.operation='NORMALIZE';links.new(normal.outputs['Vector'],normalize.inputs[0])
        components=nodes.new('ShaderNodeSeparateXYZ');links.new(normalize.outputs['Vector'],components.inputs[0]);nx,ny,nz=components.outputs
        us={'Side':Math('ADD',707/1536,Math('MULTIPLY',-ppm/1536,Math('SUBTRACT',y,anchor))),
            'Front':Math('ADD',156.5/1536,Math('MULTIPLY',-ppm/1536,x)),
            'Rear':Math('ADD',1394/1536,Math('MULTIPLY',ppm/1536,x))}
        vv=Math('ADD',1-925/1024,Math('MULTIPLY',ppm/1024,z));colors=[];valid=[]
        directions={'Side':(-.4,.5,.76),'Front':(-.3,.5,.81),'Rear':(.3,-.5,.81)}
        normals={'Side':(Math('MULTIPLY',-1,Math('ABSOLUTE',nx)),ny,nz),
            'Front':(Math('MULTIPLY',-1,nx),Math('ABSOLUTE',ny),nz),
            'Rear':(Math('MULTIPLY',-1,nx),Math('MULTIPLY',-1,Math('ABSOLUTE',ny)),nz)}
        for index,view in enumerate(('Side','Front','Rear')):
            uv=nodes.new('ShaderNodeCombineXYZ');links.new(us[view],uv.inputs['X']);links.new(vv,uv.inputs['Y'])
            texture=nodes.new('ShaderNodeTexImage');texture.image=images[view];texture.extension='EXTEND';texture.interpolation='Closest';links.new(uv.outputs[0],texture.inputs['Vector'])
            weight=Math('MULTIPLY',weights.outputs[index],texture.outputs['Alpha']);valid.append(weight)
            direction=Vector(directions[view]).normalized();parts=[Math('MULTIPLY',component,value) for component,value in zip(normals[view],direction)]
            dot=Math('ADD',parts[0],Math('ADD',parts[1],parts[2]));irradiance=Math('ADD',.55,Math('MULTIPLY',.45,Math('MAXIMUM',0,dot)))
            colors.append(Scale(texture.outputs['Color'],Math('DIVIDE',weight,irradiance)))
        validTotal=Math('ADD',valid[0],Math('ADD',valid[1],valid[2]));total=Math('ADD',weights.outputs[0],Math('ADD',weights.outputs[1],weights.outputs[2]))
        pigment=Scale(Add(colors[0],Add(colors[1],colors[2])),Math('DIVIDE',gain,Math('MAXIMUM',.001,validTotal)))
        tint=nodes.new('ShaderNodeVectorMath');tint.operation='MULTIPLY';tint.inputs[1].default_value=(1,1.03,1.10);links.new(pigment,tint.inputs[0]);pigment=tint.outputs['Vector']
        confidence=Clamp(Math('DIVIDE',validTotal,Math('MAXIMUM',.001,total)))
        fade=Clamp(Math('DIVIDE',Math('SUBTRACT',y,.88),.10));smooth=Math('MULTIPLY',Math('MULTIPLY',fade,fade),Math('SUBTRACT',3,Math('MULTIPLY',2,fade)))
        body=Math('SUBTRACT',1,smooth)
        dx=Math('DIVIDE',Math('SUBTRACT',Math('ABSOLUTE',x),eyeCentre.x),eyeProtection[0]);dy=Math('DIVIDE',Math('SUBTRACT',y,eyeCentre.y),eyeProtection[1]);dz=Math('DIVIDE',Math('SUBTRACT',z,eyeCentre.z),eyeProtection[2])
        distance=Math('SQRT',Math('ADD',Math('MULTIPLY',dx,dx),Math('ADD',Math('MULTIPLY',dy,dy),Math('MULTIPLY',dz,dz))))
        fadeEye=Clamp(Math('DIVIDE',Math('SUBTRACT',distance,.7),.4));eyeKeep=Math('MULTIPLY',Math('MULTIPLY',fadeEye,fadeEye),Math('SUBTRACT',3,Math('MULTIPLY',2,fadeEye)))
        strength=Math('ADD',Math('MULTIPLY',mixStrength,body),Math('MULTIPLY',.88,Math('MULTIPLY',smooth,eyeKeep)))
        scope=nodes.new('ShaderNodeAttribute');scope.attribute_name='ReferencePigmentScope'
        amount=Math('MULTIPLY',scope.outputs['Fac'],Math('MULTIPLY',strength,confidence))
        if scene.get('DonkeyReferenceLegSections'):
            leg=nodes.new('ShaderNodeAttribute');leg.attribute_name='LegProjectionProtection';amount=Math('MULTIPLY',amount,Math('SUBTRACT',1,Clamp(leg.outputs['Fac'])))
        if scene.get('DonkeyTailRootRevision'):
            repair=nodes.new('ShaderNodeAttribute');repair.attribute_name='TailRootRepairBlend';amount=Math('MULTIPLY',amount,Math('SUBTRACT',1,Clamp(repair.outputs['Fac'])))
        mix=nodes.new('ShaderNodeMixRGB');links.new(amount,mix.inputs[0]);links.new(previous,mix.inputs[1]);links.new(pigment,mix.inputs[2]);links.new(mix.outputs[0],shader.inputs['Base Color']);materials.append(material.name)
    record={'method':'full reference RGB with per-view normal-based illumination compensation for body, facial fur and the V14 nasal pad; the pad retains its independent skin normal; anatomical feature footprints and hidden/background pixels retain calibrated appearance',
        'linearGain':gain,'linearGainRgb':[.50,.515,.55],'mixStrength':mixStrength,'headTransitionY':[.88,.98],
        'headMixStrength':.88,'eyeProtectionRadiiM':list(eyeProtection),'nasalCavityProtection':'source cavity and oral crease/highlight footprints excluded from colour projection',
        'fineCompensation':{'radiusPixels':1,'amount':1.25,'sourceSampling':'Closest during offline bake; ordinary filtered runtime sampler unchanged'},'images':records,'materials':materials,
        'sources':[{'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()} for path in paths],
        'runtime':'offline UV0 bake into existing 2K base; no additional runtime image, material, camera projection or shader'}
    (base/'SourceTextures/Data_ReferencePigment.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8');return record
