"""Editable refinement of the retained Type89 PBR; geometry is read-only."""
import bpy,json,hashlib,sys,math
from pathlib import Path
import numpy as np

here=Path(__file__).resolve().parent;repo=here.parents[1];sys.path.insert(0,str(here))
def Arg(name,default=None):return next((v.split('=',1)[1]for v in sys.argv if v.startswith('--'+name+'=')),default)
phase=Arg('phase','Extract');assert phase in ['Extract','Apply']and bpy.app.background
sourceRoot=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank')
baseline=Path(Arg('baseline',str(sourceRoot/'History/GeometryV54SurfaceV12Release_b24618b4')))
output=Path(Arg('output',str(sourceRoot/'SurfaceV13')));assert output.resolve().is_relative_to(sourceRoot.resolve())
review=repo/'Taierzhuang1938/_shots/Type89MediumTank/SurfaceV13Study';review.mkdir(parents=True,exist_ok=True);output.mkdir(parents=True,exist_ok=True)
profileFile=repo/'Taierzhuang1938/Model/Type89MediumTank/Data_PaintFinishProfile.json';profile=json.loads(profileFile.read_text(encoding='utf8'));profileSha=hashlib.sha256(profileFile.read_bytes()).hexdigest();manifestFile=output/'Data_PaintFinishBuild.json'
def Sha(file):return hashlib.sha256(Path(file).read_bytes()).hexdigest()
def Role(material):return material.get('Type89Role',material.name.split('.')[0])
def Unique(root):
    seen=set();result=[]
    for obj in root.children_recursive:
        if obj.type=='MESH'and obj.data not in seen:seen.add(obj.data);result.append(obj)
    return result
def Geometry(root):
    digest=hashlib.sha256();triangles=0
    for obj in sorted([root]+list(root.children_recursive),key=lambda o:o.name):
        digest.update(obj.name.encode());digest.update((obj.parent.name if obj.parent else '').encode());digest.update(np.asarray(obj.matrix_local,dtype=np.float32).tobytes())
        if obj.type!='MESH':continue
        mesh=obj.data;mesh.calc_loop_triangles();triangles+=len(mesh.loop_triangles)
        for values,key,width,dtype in [(mesh.vertices,'co',3,np.float32),(mesh.loops,'vertex_index',1,np.int32),(mesh.corner_normals,'vector',3,np.float32),(mesh.uv_layers.active.data,'uv',2,np.float32),(mesh.polygons,'material_index',1,np.int32)]:
            data=np.empty(len(values)*width,dtype=dtype);values.foreach_get(key,data);digest.update(data.tobytes())
    return {'sha256':digest.hexdigest(),'triangles':triangles}
def BadgeMask(meshes,size):
    mask=np.zeros((size,size),bool);faces=0;frontFaces=0
    for obj in meshes:
        mesh=obj.data;attribute=mesh.attributes.get('MuseumBadge')
        if not attribute:continue
        flags=np.empty(len(mesh.vertices),np.float32);attribute.data.foreach_get('value',flags)
        if not np.any(flags>.5):continue
        mesh.calc_loop_triangles();uv=mesh.uv_layers.active.data
        for tri in mesh.loop_triangles:
            if not all(flags[i]>.5 for i in tri.vertices):continue
            if tri.normal.y<-.9:frontFaces+=1
            p=np.asarray([uv[i].uv[:]for i in tri.loops])*size;a,b,c=p;u=b-a;v=c-a;det=u[0]*v[1]-u[1]*v[0]
            if abs(det)<1e-12:continue
            low=np.maximum(0,np.floor(p.min(axis=0)).astype(int)-1);high=np.minimum(size,np.ceil(p.max(axis=0)).astype(int)+1)
            xx,yy=np.meshgrid(np.arange(low[0],high[0])+.5,np.arange(low[1],high[1])+.5);dx=xx-a[0];dy=yy-a[1];s=(dx*v[1]-dy*v[0])/det;t=(u[0]*dy-u[1]*dx)/det
            mask[low[1]:high[1],low[0]:high[0]]|=(s>=-1e-6)&(t>=-1e-6)&(s+t<=1+1e-6);faces+=1
    assert frontFaces==10 and mask.any(),f'Protect all tagged badge surfaces, including its ten raised front facets: front={frontFaces}, mapped={faces}'
    for iteration in range(3):
        old=mask.copy();mask[1:]|=old[:-1];mask[:-1]|=old[1:];mask[:,1:]|=old[:,:-1];mask[:,:-1]|=old[:,1:]
    return mask

if phase=='Extract':
    rows=[]
    for quality in ['Game','High']:
        file=baseline/f'Scene_Type89MediumTank{quality}Pbr.blend';bpy.ops.wm.open_mainfile(filepath=str(file));root=bpy.data.objects['Model_Type89MediumTank'];assert bpy.context.scene['BlenderMcpTask']=='Type89MediumTank'and bpy.context.scene['Type89Quality']==quality
        assert root['geometryVersion']=='20261027GeometryV54'and root['surfaceRevision']=='SurfaceV12'
        meshes=Unique(root);materials={Role(m):m for obj in meshes for m in obj.data.materials if m};assert len(materials)==9
        maps={};mapDir=output/'Maps'/quality/'Baseline';mapDir.mkdir(parents=True,exist_ok=True)
        for role in ['Armor','Guard']:
            for label in ['Base','Orm','MicroCoatData']:
                image=next(n.image for n in materials[role].node_tree.nodes if n.type=='TEX_IMAGE'and n.label==label);assert image.packed_file
                key=role+label;target=mapDir/(key+'.png');target.write_bytes(bytes(image.packed_file.data));maps[key]={'file':str(target),'name':image.name,'space':image.colorspace_settings.name,'sha256':Sha(target),'size':list(image.size)}
        size=maps['ArmorOrm']['size'][0];mask=BadgeMask(meshes,size);maskFile=mapDir/'Data_BadgeMask.npy';np.save(maskFile,mask)
        rows.append({'quality':quality,'blend':str(file),'sourceSha256':Sha(file),'glb':str(baseline/f'Model_Type89MediumTank{quality}Pbr.glb'),'glbSha256':Sha(baseline/f'Model_Type89MediumTank{quality}Pbr.glb'),'geometry':Geometry(root),'maps':maps,'badgeMask':str(maskFile),'badgePixels':int(mask.sum())})
    result={'status':'BaselineExtracted','profileSha256':profileSha,'profile':profile,'rows':rows};manifestFile.write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps({'status':result['status'],'qualities':[r['quality']for r in rows]}),flush=True)
else:
    import Script_Type89PbrBake as bake
    manifest=json.loads(manifestFile.read_text(encoding='utf8'));assert manifest['profileSha256']==profileSha
    mapsReport=json.loads((output/'Data_PaintFinishMaps.json').read_text(encoding='utf8'));assert mapsReport['pass']and mapsReport['profileSha256']==profileSha
    results=[]
    for row in manifest['rows']:
        quality=row['quality'];assert Sha(row['blend'])==row['sourceSha256'];bpy.ops.wm.open_mainfile(filepath=row['blend']);root=bpy.data.objects['Model_Type89MediumTank'];before=Geometry(root);assert before==row['geometry']
        meshes=Unique(root);used={m for obj in meshes for m in obj.data.materials if m};materials={Role(m):m for m in used}
        for key,source in row['maps'].items():
            updated=Path(next(r for r in mapsReport['rows']if r['quality']==quality)['files'][key]);old=bpy.data.images.get(source['name']);assert old
            replacement=bpy.data.images.load(str(updated),check_existing=False);replacement.colorspace_settings.name=source['space'];replacement.pack()
            for material in used:
                for node in material.node_tree.nodes:
                    if node.type=='TEX_IMAGE'and node.image==old:node.image=replacement
            old.name='PreviousSurfaceV12_'+source['name'];replacement.name=source['name']
            if old.users==0:bpy.data.images.remove(old)
        for role,settings in profile['roles'].items():
            material=materials[role];nodes=material.node_tree.nodes;links=material.node_tree.links;shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');socket=shader.inputs['Coat Roughness'];assert len(socket.links)==1
            prior=socket.links[0].from_socket;factor=nodes.new('ShaderNodeMath');factor.operation='MULTIPLY';factor.label='PaintFinishCoatRoughnessScale';factor.inputs[1].default_value=settings['coatRoughnessScale'];links.new(prior,factor.inputs[0]);links.new(factor.outputs[0],socket)
            normal=next(n for n in nodes if n.label=='MicroFilmNormal');normal.inputs['Strength'].default_value=settings['fineNormalScale'];mapping=next(n for n in nodes if n.label=='MicroFilmPhysicalRepeat');oldTile=.224 if role=='CastArmor'else .168;scale=mapping.inputs['Scale'].default_value;mapping.inputs['Scale'].default_value=(scale[0]*oldTile/settings['fineTileM'],scale[1]*oldTile/settings['fineTileM'],1)
            material['MicroSurfaceTileM']=settings['fineTileM'];material['MicroSurfaceNormalScale']=settings['fineNormalScale'];material['PaintFinishRevision']=profile['revision']
        root['surfaceRevision']=profile['revision'];root['paintFinish']={'profileSha256':profileSha,'scriptSha256':Sha(__file__),'baselineSurface':'SurfaceV12','newDamageMask':False,'geometryUnchanged':True,'classification':'Appearance reconstruction'};root['pbrProbe']=False
        text=bpy.data.texts.get('Data_Type89PaintFinishProfile.json')or bpy.data.texts.new('Data_Type89PaintFinishProfile.json');text.clear();text.write(profileFile.read_text(encoding='utf8'))
        assert Geometry(root)==before,'Material refinement changed source geometry, UVs, normals or rig transforms'
        blend=output/f'Scene_Type89MediumTank{quality}Pbr.blend';export=review/f'Model_Type89MediumTank{quality}SourceExport.glb';bpy.ops.wm.save_as_mainfile(filepath=str(blend));bake.Export(root,export)
        results.append({'quality':quality,'blend':str(blend),'sha256':Sha(blend),'export':str(export),'exportSha256':Sha(export),'geometry':before})
    result={'pass':True,'status':'EditableSourcesUpdated_IndependentExportCheckRequired','profileSha256':profileSha,'rows':results};(output/'Data_PaintFinishSources.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps({'pass':True,'qualities':[r['quality']for r in results]}),flush=True)
