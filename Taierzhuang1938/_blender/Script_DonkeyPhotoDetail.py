"""Reference hair luminance detail, de-lit locally and baked into ordinary UV0 PBR."""
import bpy,json,hashlib
from pathlib import Path
import numpy as np
from mathutils import Vector

def BoxBlur(values,radius=4):
    size=radius*2+1
    padded=np.pad(values,((0,0),(radius,radius)),mode='edge')
    summed=np.pad(np.cumsum(padded,axis=1,dtype=np.float64),((0,0),(1,0)))
    result=(summed[:,size:]-summed[:,:-size])/size
    padded=np.pad(result,((radius,radius),(0,0)),mode='edge')
    summed=np.pad(np.cumsum(padded,axis=0,dtype=np.float64),((1,0),(0,0)))
    return ((summed[size:]-summed[:-size])/size).astype(np.float32)

def BuildDetailImages(base):
    original=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020/References/Image_DonkeyOriginalThreeView.png')
    guide=base/'Image_NakedAnatomyGuide.png';arrays=[]
    for path in (original,guide):
        image=bpy.data.images.load(str(path),check_existing=False)
        if tuple(image.size)!=(1536,1024):image.scale(1536,1024)
        arrays.append(np.array(image.pixels[:],dtype=np.float32).reshape(1024,1536,4)[::-1,:,:3]);bpy.data.images.remove(image)
    maskNamespace={};file=Path(bpy.context.scene['DonkeyCartProject'])/'_blender/Script_DonkeyReferenceMasks.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),maskNamespace)
    occlusion=maskNamespace['BuildOcclusionWeights']()
    facialFeatures=maskNamespace['BuildFacialFeatureWeights']()
    yy,xx=np.indices((1024,1536));result={};records=[]
    for name,(left,right) in {'Side':(335,1217),'Front':(34,280),'Rear':(1225,1518)}.items():
        cavity=facialFeatures[name]
        ratios=[];confidences=[]
        for imageIndex,rgb in enumerate(arrays):
            linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
            luminance=linear@np.array((.2126,.7152,.0722),dtype=np.float32)
            valid=(rgb.mean(axis=2)<.69)&(xx>left)&(xx<right)&(yy>30)&(yy<925)
            weight=valid.astype(np.float32);numerator=BoxBlur(BoxBlur(luminance*weight));denominator=BoxBlur(BoxBlur(weight))
            low=numerator/np.maximum(.001,denominator)
            confidence=(denominator>.5)&(xx>left)&(xx<right)&(yy>30)&(yy<925)
            contrast=2.30 if imageIndex==0 else 1.0
            ratio=np.clip(1+contrast*(luminance/np.maximum(.005,low)-1),.35 if imageIndex==0 else .50,2.15 if imageIndex==0 else 1.80);ratio[~confidence]=1
            ratio=ratio*(1-cavity)+cavity
            ratios.append(ratio);confidences.append(confidence.astype(np.float32))
        blend=occlusion[name];a=(1-blend)*confidences[0];b=blend*confidences[1];confidence=a+b
        ratio=(ratios[0]*a+ratios[1]*b)/np.maximum(.001,confidence);ratio[confidence<.001]=1
        values=np.ones((1024,1536,4),dtype=np.float32);values[:,:,:3]=(ratio*.5)[:,:,None]
        values[:,:,3]=confidence.astype(np.float32)
        image=bpy.data.images.new('Texture_DonkeyReference'+name+'Detail',width=1536,height=1024,alpha=True)
        image.alpha_mode='CHANNEL_PACKED'
        image.colorspace_settings.name='Non-Color';image.pixels.foreach_set(values[::-1].copy().ravel())
        path=base/'SourceTextures'/('Texture_DonkeyReference'+name+'Detail.png')
        image.filepath_raw=str(path);image.file_format='PNG';image.save();content=path.read_bytes();image.pack(data=content,data_len=len(content))
        result[name]=image;records.append({'view':name,'path':str(path),'sha256':hashlib.sha256(content).hexdigest(),'size':[1536,1024]})
    return result,{'method':'masked luminance / normalized local blur; two 9-pixel box passes; original detail contrast 2.30 and guide detail contrast 1.0; ratios clamped separately','contrast':2.30,'occludedGuideContrast':1.0,'cavityProtection':'feathered source nostril shadows and oral crease/highlight footprints excluded from pigment-like detail; anatomical creases remain geometry',
        'original':str(original),'originalSha256':hashlib.sha256(original.read_bytes()).hexdigest(),
        'occludedGuide':str(guide),'guideSha256':hashlib.sha256(guide.read_bytes()).hexdigest(),'images':records,
        'occlusionMasks':'_blender/Script_DonkeyReferenceMasks.py; geometric rope footprints including shaded edges; feathered normalized-detail blending'}

def InstallReferenceDetail(scene,skin,rig,collection,base):
    images,record=BuildDetailImages(base);inverse=rig.matrix_world.inverted()
    viewNamespace={};file=Path(scene['DonkeyCartProject'])/'_blender/Script_DonkeyReferenceViews.py'
    exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),viewNamespace)
    viewSampler=viewNamespace['BuildViewSampler'](skin)
    eye=bpy.data.objects['DonkeyEyeLeft'];eyeMatrix=inverse@eye.matrix_world
    eyeCentre=sum((eyeMatrix@v.co for v in eye.data.vertices),Vector())/len(eye.data.vertices);eyeCentre.x=abs(eyeCentre.x)
    materials=set()
    for obj in collection.objects:
        if obj.type!='MESH':continue
        furry=[m for m in obj.data.materials if m and m.name.startswith(('DonkeyCartGreyCoat','DonkeyLowerLegShortFur','DonkeyCartFaceFur','DonkeyCartEarInterior','DonkeyNasalPad'))]
        if not furry:continue
        materials.update(furry);transform=inverse@obj.matrix_world
        attribute=obj.data.attributes.get('ReferenceCoordinates') or obj.data.attributes.new('ReferenceCoordinates','FLOAT_VECTOR','POINT')
        weights=obj.data.attributes.get('ReferenceViewWeights') or obj.data.attributes.new('ReferenceViewWeights','FLOAT_VECTOR','POINT')
        normalMatrix=transform.to_3x3().inverted().transposed()
        for vertex in obj.data.vertices:
            point=transform@vertex.co;attribute.data[vertex.index].vector=point
            weights.data[vertex.index].vector=viewSampler(point,(normalMatrix@vertex.normal).normalized(),True)
    ppm=(925-302)/1.10;anchor=scene['DonkeyReferenceFitAnchorY']
    for material in materials:
        nodes,links=material.node_tree.nodes,material.node_tree.links
        shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');paint=next(n for n in nodes if n.type=='VERTEX_COLOR')
        fibre=next((n for n in nodes if n.type=='TEX_IMAGE' and n.image and n.image.name=='Texture_DonkeyCoatDetailBase'),None)
        nasalPad=material.name.startswith('DonkeyNasalPad')
        def Math(operation,a,b=0):
            node=nodes.new('ShaderNodeMath');node.operation=operation
            for index,value in enumerate((a,b)):
                if isinstance(value,(int,float)):node.inputs[index].default_value=value
                else:links.new(value,node.inputs[index])
            return node.outputs[0]
        def Clamp(value):return Math('MINIMUM',1,Math('MAXIMUM',0,value))
        attribute=nodes.new('ShaderNodeAttribute');attribute.attribute_name='ReferenceCoordinates'
        position=nodes.new('ShaderNodeSeparateXYZ');links.new(attribute.outputs['Vector'],position.inputs[0]);x,y,z=position.outputs
        visibility=nodes.new('ShaderNodeAttribute');visibility.attribute_name='ReferenceViewWeights'
        normal=nodes.new('ShaderNodeSeparateXYZ');links.new(visibility.outputs['Vector'],normal.inputs[0])
        weights=dict(zip(('Side','Front','Rear'),normal.outputs))
        us={'Side':Math('ADD',707/1536,Math('MULTIPLY',-ppm/1536,Math('SUBTRACT',y,anchor))),
            'Front':Math('ADD',156.5/1536,Math('MULTIPLY',-ppm/1536,x)),
            'Rear':Math('ADD',1394/1536,Math('MULTIPLY',ppm/1536,x))}
        v=Math('ADD',1-925/1024,Math('MULTIPLY',ppm/1024,z));terms=[];validWeights=[]
        for name in ('Side','Front','Rear'):
            vector=nodes.new('ShaderNodeCombineXYZ');links.new(us[name],vector.inputs['X']);links.new(v,vector.inputs['Y'])
            texture=nodes.new('ShaderNodeTexImage');texture.image=images[name];texture.extension='EXTEND';links.new(vector.outputs[0],texture.inputs['Vector'])
            channel=nodes.new('ShaderNodeSeparateColor');channel.mode='RGB';links.new(texture.outputs['Color'],channel.inputs[0])
            weight=Math('MULTIPLY',weights[name],texture.outputs['Alpha']);validWeights.append(weight)
            terms.append(Math('MULTIPLY',weight,Math('MULTIPLY',2,channel.outputs['Red'])))
        total=Math('ADD',weights['Side'],Math('ADD',weights['Front'],weights['Rear']))
        validTotal=Math('ADD',validWeights[0],Math('ADD',validWeights[1],validWeights[2]))
        photographic=Math('DIVIDE',Math('ADD',terms[0],Math('ADD',terms[1],terms[2])),Math('MAXIMUM',.001,validTotal))
        if nasalPad:photographic=Math('ADD',1,Math('DIVIDE',Math('SUBTRACT',photographic,1),2.3))
        confidence=Clamp(Math('DIVIDE',validTotal,Math('MAXIMUM',.001,total)))
        dx=Math('DIVIDE',Math('SUBTRACT',Math('ABSOLUTE',x),eyeCentre.x),.050)
        dy=Math('DIVIDE',Math('SUBTRACT',y,eyeCentre.y),.050);dz=Math('DIVIDE',Math('SUBTRACT',z,eyeCentre.z),.035)
        distance=Math('SQRT',Math('ADD',Math('MULTIPLY',dx,dx),Math('ADD',Math('MULTIPLY',dy,dy),Math('MULTIPLY',dz,dz))))
        protectEye=Math('SUBTRACT',1,Clamp(Math('DIVIDE',Math('SUBTRACT',distance,.7),.5)))
        protectNose=Math('MULTIPLY',Clamp(Math('DIVIDE',Math('SUBTRACT',y,1.16),.08)),Clamp(Math('DIVIDE',Math('SUBTRACT',1.10,z),.10)))
        protect=protectEye if nasalPad else Math('MAXIMUM',protectEye,protectNose)
        if fibre:
            luminance=nodes.new('ShaderNodeRGBToBW');links.new(fibre.outputs['Color'],luminance.inputs[0]);generic=Math('DIVIDE',luminance.outputs[0],.55)
        else:generic=1
        usePhoto=Math('MULTIPLY',confidence,Math('SUBTRACT',1,protect))
        detail=Math('ADD',Math('MULTIPLY',photographic,usePhoto),Math('MULTIPLY',generic,Math('SUBTRACT',1,usePhoto)))
        multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
        links.new(paint.outputs['Color'],multiply.inputs[1]);links.new(Math('MULTIPLY',.75,detail),multiply.inputs[2]);links.new(multiply.outputs[0],shader.inputs['Base Color'])
    scene['DonkeyReferencePhotoDetail']='20261024ReferenceDetailV2'
    record['visibility']='fitted-skin BVH depth test from axial source cameras; 4 mm surface tolerance; source-vertex weights baked into UV0'
    record['materials']=[m.name for m in materials];record['runtime']='baked UV0 base colour; independent tiled UV1 fibre normal; no camera projection in GLB'
    (base/'SourceTextures/Data_ReferencePhotoDetail.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
    return record
