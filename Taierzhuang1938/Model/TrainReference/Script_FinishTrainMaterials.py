"""Unmodified ImageGen base colors with inferred micro-surface data, not scans.
OpenGL tangent normals; ORM = AO/roughness/metallic, stored in linear space.
"""
import bpy, numpy as np, json, hashlib
from pathlib import Path
assetDir=Path(bpy.data.filepath).parent

def Image(name):
    img=bpy.data.images.get(name)
    if img is None:
        img=bpy.data.images.load(str(assetDir/(name+'.png')),check_existing=True);img.name=name
    img.colorspace_settings.name='sRGB';img.pack()
    return img

def DataImage(name,values):
    height,width=values.shape[:2]
    img=bpy.data.images.get(name) or bpy.data.images.new(name,width,height,alpha=True)
    img.colorspace_settings.name='Non-Color'
    pixels=np.ones((height,width,4),dtype=np.float32)
    pixels[:,:,:3]=values[:,:,None] if values.ndim==2 else values
    img.pixels.foreach_set(pixels.ravel());img.filepath_raw=str(assetDir/(name+'.png'));img.file_format='PNG';img.save();img.pack()
    return img

maps={};provenance=[]
for kind in ['Wood','Iron']:
    albedo=Image('Texture_Train'+kind+'Albedo')
    pixels=np.empty(len(albedo.pixels),dtype=np.float32);albedo.pixels.foreach_get(pixels)
    color=pixels.reshape((albedo.size[1],albedo.size[0],4))[:,:,:3]
    luma=color @ np.array([.2126,.7152,.0722],dtype=np.float32)
    low,high=np.percentile(luma,[2,98]);height=np.clip((luma-low)/max(high-low,.0001),0,1)
    dx=(np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))*.5
    dy=(np.roll(height,-1,axis=0)-np.roll(height,1,axis=0))*.5
    strength=1.3 if kind=='Wood' else .65
    normal=np.stack((-dx*strength,-dy*strength,np.ones_like(height)),axis=2)
    normal/=np.linalg.norm(normal,axis=2,keepdims=True)
    normalMap=DataImage('Texture_Train'+kind+'Normal',normal*.5+.5)
    if kind=='Wood': rough=.79+.15*(1-height);metal=np.zeros_like(height)
    else:
        rust=np.clip((color[:,:,0]-color[:,:,2])*12,0,1)
        rough=np.clip(.72-.19*height+.16*rust,.42,.9)
        metal=np.clip(.65+.30*height-.7*rust,0,1)
    ormMap=DataImage('Texture_Train'+kind+'Orm',np.stack((np.ones_like(height),rough,metal),axis=2))
    DataImage('Texture_Train'+kind+'Height',height)
    maps[kind]=(albedo,normalMap,ormMap)
    provenance.append({'material':kind,'generator':'Codex CLI gpt-5.6-sol / built-in image_gen__imagegen (tier 1)','albedo':albedo.name+'.png','albedoSha256':hashlib.sha256((assetDir/(albedo.name+'.png')).read_bytes()).hexdigest(),'size':list(albedo.size),'derivedMaps':['Normal (+Y / OpenGL)','ORM (R=1, G=roughness, B=metallic)','Height (inferred micro relief)'],'albedoModified':False,'shaderTreatment':'Six per-plank baseColorFactor tints, texture pixels unchanged' if kind=='Wood' else 'Original base color; revised physical UV scale'})

for mat in bpy.data.materials:
    if mat.name=='Material_AgedIron' or mat.name.startswith('Material_WeatheredPlank'):
        nodes=mat.node_tree.nodes;links=mat.node_tree.links
        nodes.clear();out=nodes.new('ShaderNodeOutputMaterial');bsdf=nodes.new('ShaderNodeBsdfPrincipled');links.new(bsdf.outputs[0],out.inputs['Surface'])
        albedo,normalImg,ormImg=maps['Wood' if 'Plank' in mat.name else 'Iron']
        tex=nodes.new('ShaderNodeTexImage');tex.image=albedo;tex.extension='REPEAT'
        if 'Plank' in mat.name:
            shade=int(mat.name[-1])*.023
            multiply=nodes.new('ShaderNodeMix');multiply.data_type='RGBA';multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
            multiply.inputs[7].default_value=(.34+shade,.32+shade,.27+shade,1)
            links.new(tex.outputs['Color'],multiply.inputs[6]);links.new(multiply.outputs[2],bsdf.inputs['Base Color'])
        else: links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
        normalTex=nodes.new('ShaderNodeTexImage');normalTex.image=normalImg
        normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.55
        links.new(normalTex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs[0],bsdf.inputs['Normal'])
        ormTex=nodes.new('ShaderNodeTexImage');ormTex.image=ormImg
        separate=nodes.new('ShaderNodeSeparateColor');separate.mode='RGB';links.new(ormTex.outputs['Color'],separate.inputs['Color'])
        links.new(separate.outputs['Green'],bsdf.inputs['Roughness']);links.new(separate.outputs['Blue'],bsdf.inputs['Metallic'])

for collectionName in ['Model_Locomotive','Model_Gondola']:
    for obj in bpy.data.collections[collectionName].objects:
        if obj.type!='MESH':continue
        mesh=obj.data;uv=mesh.uv_layers.new(name='TextureSurfaceMeters') if not mesh.uv_layers else mesh.uv_layers.active
        for polygon in mesh.polygons:
            axis=max(range(3),key=lambda i:abs(polygon.normal[i]))
            for loopIndex in polygon.loop_indices:
                co=mesh.vertices[mesh.loops[loopIndex].vertex_index].co
                isWood=any('Plank' in material.name for material in mesh.materials)
                u,v=(co.y*.42,co.z*.6) if axis==0 else (co.x*(.15 if isWood else .43),(co.z if axis==1 else co.y)*.6)
                uv.data[loopIndex].uv=(u,v)
(assetDir/'Data_TrainPbr.json').write_text(json.dumps(provenance,indent=2),encoding='utf-8')
bpy.data.orphans_purge(do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=str(assetDir/'Scene_TrainReferenceRig.blend'),compress=True)
result={'imagegenAlbedos':[value[0].name for value in maps.values()],'normalAndOrmMaps':True,'packed':True,'provenance':provenance}
