"""Portable glTF micro-surface study on the retained complete PBR source.

Macro Base/Normal/ORM and all geometry remain the input source. A periodic
fine normal uses KHR_texture_transform; clearcoat/specular keep the mean paint
Fresnel approximately unchanged while adding a separately resolved film field.
This is an appearance reconstruction, not a factory coating chemistry claim.
"""
import bpy,os,sys,json,math,hashlib
import numpy as np
from pathlib import Path

here=Path(__file__).resolve().parent;repo=here.parents[1]
def Arg(name,default=None):return next((v.split('=',1)[1]for v in sys.argv if v.startswith('--'+name+'=')),default)
quality=Arg('quality','Game');revision=Arg('revision','SurfaceV10FilmCastWorking');working=Arg('working','false')=='true'
inputFile=Path(Arg('input'));outputBlend=Path(Arg('blend'));outputGlb=Path(Arg('export'));reportFile=Path(Arg('report'));mapDir=Path(Arg('maps'))
assert quality in ['High','Game']
for directory in [outputBlend.parent,outputGlb.parent,reportFile.parent,mapDir]:directory.mkdir(parents=True,exist_ok=True)
os.environ['TYPE89_PBR_REVISION']=revision
sys.path.insert(0,str(here))
import Script_Type89PbrBake as bake
bpy.ops.wm.open_mainfile(filepath=str(inputFile))
assert bpy.context.scene.get('BlenderMcpTask')=='Type89MediumTank'
root=bpy.data.objects['Model_Type89MediumTank'];assert root['geometryVersion']==Arg('geometry-version','20261026GeometryV41')
meshes=bake.UniqueMeshes(root)
def Role(material):return material.get('Type89Role',material.name.split('.')[0])
used={material for obj in meshes for material in obj.data.materials if material}
byRole={Role(material):material for material in used}
assert len(used)==8 and all(role in byRole for role in ['Armor','Guard','Track'])
beforeTriangles=0
for obj in root.children_recursive:
    if obj.type=='MESH':obj.data.calc_loop_triangles();beforeTriangles+=len(obj.data.loop_triangles)

def Image(name,size,pixels,path):
    image=bpy.data.images.new(name,width=size,height=size,alpha=False,float_buffer=False)
    image.colorspace_settings.name='Non-Color';image.pixels.foreach_set(pixels.reshape(-1));image.update()
    image.filepath_raw=str(path);image.file_format='PNG';image.save();image.pack();return image

# Separate periodic fields keep smooth coating grain distinct from a shallow,
# irregular cast skin. These are bounded appearance-reconstruction parameters,
# not measurements of the restored car's microscopic surface.
size=2048;slope=float(Arg('tile-slope','.13'));filmTileM=float(Arg('film-tile-m','.192'));castTileM=float(Arg('cast-tile-m','.256'));tileFiles={}
def FineTile(kind,seed):
    rng=np.random.default_rng(seed);white=rng.normal(size=(size,size)).astype(np.float32);spectrum=np.fft.rfft2(white)
    fy=np.fft.fftfreq(size)*size;fx=np.fft.rfftfreq(size)*size;radius=np.sqrt(fy[:,None]**2+fx[None,:]**2)
    def Band(low,high):
        filt=np.exp(-(radius/high)**4)*(1-np.exp(-(radius/low)**4))
        value=np.fft.irfft2(spectrum*filt,s=(size,size)).astype(np.float32);return value/max(float(value.std()),1e-8)
    if kind=='Film':
        meso=Band(32,90);grain=Band(90,220);fine=Band(220,520)
        height=meso*.25+grain*.60+fine*.15
    else:
        meso=Band(14,48);grain=Band(48,150);fine=Band(150,380)
        pores=np.maximum(0,-grain-1.15)**2
        height=meso*.45+grain*.47+fine*.08-pores*.24
    dx=(np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))*.5
    dy=(np.roll(height,-1,axis=0)-np.roll(height,1,axis=0))*.5
    rms=float(np.sqrt(np.mean(dx*dx+dy*dy)));dx*=slope/rms;dy*=slope/rms
    length=np.sqrt(1+dx*dx+dy*dy);pixels=np.ones((size,size,4),np.float32);pixels[:,:,0]=.5-.5*dx/length;pixels[:,:,1]=.5-.5*dy/length;pixels[:,:,2]=.5+.5/length
    name='Texture_Type89Fine'+kind+'Normal';tileFile=mapDir/(name+'.png');tileFiles[kind]=str(tileFile)
    return Image(name,size,pixels,tileFile)
tile=FineTile('Film',89026);castTile=FineTile('Cast',89027)

densities={}
for role in ['Armor','Guard']:
    area=uvArea=0
    for obj in meshes:
        mesh=obj.data;mesh.calc_loop_triangles();uv=mesh.uv_layers.active.data
        for tri in mesh.loop_triangles:
            if Role(mesh.materials[tri.material_index])!=role:continue
            a,b,c=[uv[i].uv for i in tri.loops];u=b-a;v=c-a;area+=tri.area;uvArea+=abs(u.x*v.y-u.y*v.x)*.5
    assert area>0 and uvArea>0
    densities[role]={'areaM2':area,'uvArea':uvArea,'uvUnitsPerM':math.sqrt(uvArea/area)}

coatingFiles={};layerSettings={};coatWeight=.8;specularFactor=.2
def AddLayer(material,role,strength,tileM):
    nodes=material.node_tree.nodes;links=material.node_tree.links;shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
    ormNode=next(n for n in nodes if n.type=='TEX_IMAGE'and n.label=='Orm');orm=ormNode.image
    w,h=orm.size;assert w==h;raw=np.empty(w*h*4,np.float32);orm.pixels.foreach_get(raw);raw=raw.reshape(h,w,4)
    paint=np.ones_like(raw);paint[:,:,0]=coatWeight*(1-np.clip(raw[:,:,2],0,1));paint[:,:,1]=raw[:,:,1]
    coatFile=mapDir/('Texture_Type89'+quality+role+'MicroCoat.png');coat=Image('Texture_Type89'+quality+role+'MicroCoat',w,paint,coatFile);coatingFiles[role]=str(coatFile)
    shader.inputs['Specular IOR Level'].default_value=specularFactor*.5
    shader.inputs['Coat Weight'].default_value=1;shader.inputs['Coat Roughness'].default_value=1
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap';uv.label='MicroFilmUv0'
    tex=nodes.new('ShaderNodeTexImage');tex.image=coat;tex.label='MicroCoatData';links.new(uv.outputs['UV'],tex.inputs['Vector'])
    split=nodes.new('ShaderNodeSeparateColor');split.mode='RGB';links.new(tex.outputs['Color'],split.inputs[0]);links.new(split.outputs['Red'],shader.inputs['Coat Weight']);links.new(split.outputs['Green'],shader.inputs['Coat Roughness'])
    mapping=nodes.new('ShaderNodeMapping');mapping.vector_type='POINT';mapping.label='MicroFilmPhysicalRepeat'
    repeat=1/(densities[role]['uvUnitsPerM']*tileM);mapping.inputs['Scale'].default_value=(repeat,repeat,1);links.new(uv.outputs['UV'],mapping.inputs['Vector'])
    normalTex=nodes.new('ShaderNodeTexImage');normalTex.image=tile;normalTex.label='MicroNormal';normalTex.extension='REPEAT';links.new(mapping.outputs['Vector'],normalTex.inputs['Vector'])
    normal=nodes.new('ShaderNodeNormalMap');normal.uv_map='UVMap';normal.label='MicroFilmNormal';normal.inputs['Strength'].default_value=strength;links.new(normalTex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],shader.inputs['Coat Normal'])
    material['MicroSurfaceRevision']=revision;material['MicroSurfaceTileM']=tileM;material['MicroSurfaceNormalScale']=strength
    layerSettings[role]={'tileM':tileM,'uvRepeat':repeat,'normalScale':strength,'dielectricSpecularFactor':specularFactor,'maximumCoatWeight':coatWeight,'coatRoughness':'Existing roughness field, unchanged','normalField':'Film'}
AddLayer(byRole['Armor'],'Armor',1.2,filmTileM);AddLayer(byRole['Guard'],'Guard',1.2,filmTileM)
cast=byRole['Armor'].copy();cast.name='Material_Type89'+quality+'CastArmor';cast['Type89Role']='CastArmor'
nodes=cast.node_tree.nodes
next(n for n in nodes if n.label=='MicroFilmNormal').inputs['Strength'].default_value=1.45
next(n for n in nodes if n.label=='MicroNormal').image=castTile
repeat=1/(densities['Armor']['uvUnitsPerM']*castTileM)
next(n for n in nodes if n.label=='MicroFilmPhysicalRepeat').inputs['Scale'].default_value=(repeat,repeat,1)
cast['MicroSurfaceTileM']=castTileM;cast['MicroSurfaceNormalScale']=1.45
layerSettings['CastArmor']={**layerSettings['Armor'],'tileM':castTileM,'uvRepeat':repeat,'normalScale':1.45,'normalField':'Cast'}
# On these continuous curved cast pieces the mesh already carries the curved
# profile. Let the shallow foundry field affect diffuse shading, while retaining
# the full original baked macro normal on the upper reflection layer. Rolled
# plate/rivet/cover material bindings are untouched. This is standard glTF,
# not a runtime normal-combining shader or a claim to preserve cast shading.
links=cast.node_tree.links;shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
macroNormal=shader.inputs['Normal'].links[0].from_socket
fineNormal=next(n for n in nodes if n.label=='MicroFilmNormal')
fineNormal.inputs['Strength'].default_value=.85
links.new(fineNormal.outputs['Normal'],shader.inputs['Normal'])
links.new(macroNormal,shader.inputs['Coat Normal'])
cast['MicroSurfaceNormalScale']=.85;cast['MicroSurfaceNormalMode']='FineDiffuse_OriginalMacroReflection'
layerSettings['CastArmor'].update({'normalScale':.85,'normalMode':'FineDiffuse_OriginalMacroReflection','macroNormalRetainedOn':'Coat Normal'})
castFaces=0
for obj in meshes:
    mesh=obj.data;attribute=mesh.attributes.get('SurfaceCastWheel');ballVertices=set()
    if obj.name in ['Mesh_BowMgMount','Mesh_BowMgBall','Mesh_TurretMachineGun']:
        adjacency=[[]for v in mesh.vertices]
        for edge in mesh.edges:
            a,b=edge.vertices;adjacency[a].append(b);adjacency[b].append(a)
        unseen=set(range(len(mesh.vertices)))
        while unseen:
            ids=[unseen.pop()]
            for i in ids:
                for j in adjacency[i]:
                    if j in unseen:unseen.remove(j);ids.append(j)
            extent=[max(mesh.vertices[i].co[a]for i in ids)-min(mesh.vertices[i].co[a]for i in ids)for a in range(3)]
            if .18<extent[0]<.32 and extent[1]>.05 and extent[2]>.18:ballVertices.update(ids)
    selected=[]
    for face in mesh.polygons:
        if Role(mesh.materials[face.material_index])!='Armor':continue
        if (attribute and all(attribute.data[i].value>.5 for i in face.vertices))or all(i in ballVertices for i in face.vertices):selected.append(face)
    if selected:
        index=len(mesh.materials);mesh.materials.append(cast)
        for face in selected:face.material_index=index
        castFaces+=len(selected)
assert castFaces>1000
root['surfaceRevision']=revision;root['pbrProbe']=not working;root['acceptance']='WORKING_FINE_SURFACE_FIDELITY_OPEN'if working else'MICRO_SURFACE_STUDY_PENDING_REVIEW'
root['microSurface']={'portableExtensions':'KHR_materials_clearcoat,KHR_materials_specular,KHR_texture_transform','macroTextureSetsRetained':True,'fineTile':2048,'castFaces':castFaces,'sourceScriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
afterTriangles=0
for obj in root.children_recursive:
    if obj.type=='MESH':obj.data.calc_loop_triangles();afterTriangles+=len(obj.data.loop_triangles)
assert beforeTriangles==afterTriangles
bpy.ops.wm.save_as_mainfile(filepath=str(outputBlend));bake.Export(root,outputGlb)
report={'status':'PortableMicroSurfaceStudy_ActualRenderRequired','quality':quality,'input':str(inputFile),'inputSha256':hashlib.sha256(inputFile.read_bytes()).hexdigest(),'blend':str(outputBlend),'glb':str(outputGlb),'glbSha256':hashlib.sha256(outputGlb.read_bytes()).hexdigest(),'revision':revision,'geometryVersion':root['geometryVersion'],'sourceTrianglesBeforeAndAfter':beforeTriangles,'castFaces':castFaces,'periodicTiles':tileFiles,'tileRmsSlope':slope,'coatingFiles':coatingFiles,'uvDensities':densities,'layerSettings':layerSettings,'scope':'Fine surface-normal study using portable glTF layers; macro maps/geometry retained. No factory coating chemistry claim; not accepted/published.','goalComplete':False}
reportFile.write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report),flush=True)
