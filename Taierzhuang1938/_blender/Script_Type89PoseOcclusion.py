"""Geometry-derived high AO study for side lids and their fixed rebates.

Static AO traces a joined static assembly with articulated closures omitted.
Each moving lid traces only its own rigid mesh. Existing UVs, geometry,
Base/Normal and ORM green/blue are retained. This is not a global AO disable.
"""
import bpy,sys,json,hashlib,os
from pathlib import Path
import numpy as np
here=Path(__file__).resolve().parent;repo=here.parents[1];sys.path.insert(0,str(here))
import Script_Type89PbrBake as bake
def Arg(name,default=None):return next((v.split('=',1)[1]for v in sys.argv if v.startswith('--'+name+'=')),default)
inputFile=Path(Arg('input'));outputBlend=Path(Arg('blend'));outputGlb=Path(Arg('export'));outputReport=Path(Arg('report'));mapDir=Path(Arg('maps'))
for p in [outputBlend.parent,outputGlb.parent,outputReport.parent,mapDir]:p.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(inputFile));root=bpy.data.objects['Model_Type89MediumTank'];scene=bpy.context.scene
assert scene['BlenderMcpTask']=='Type89MediumTank'and scene['Type89Quality']=='High'
meshes=[o for o in root.children_recursive if o.type=='MESH'];unique=bake.UniqueMeshes(root)
staticTargets={'Mesh_SideVisionFrameLeft','Mesh_SideVisionFrameRight'};movingTargets={'Mesh_SideVisionFlapLeft','Mesh_SideVisionFlapRight'}
assert staticTargets|movingTargets<=set(o.name for o in meshes)
material=next(m for o in unique for m in o.data.materials if m and m.get('Type89Role')=='Armor')
ormNode=next(n for n in material.node_tree.nodes if n.type=='TEX_IMAGE'and n.label=='Orm');originalImage=ormNode.image;w,h=originalImage.size;assert w==h
raw=np.empty(w*h*4,np.float32);originalImage.pixels.foreach_get(raw);raw=raw.reshape(h,w,4);old=raw.copy();size=w
def Role(m):return m.get('Type89Role',m.name.split('.')[0])
def Mask(objects):
    mask=np.zeros((size,size),bool)
    for obj in objects:
        mesh=obj.data;mesh.calc_loop_triangles();uv=mesh.uv_layers.active.data
        for tri in mesh.loop_triangles:
            if Role(mesh.materials[tri.material_index])!='Armor':continue
            p=np.array([uv[i].uv[:]for i in tri.loops],np.float64)*size;a,b,c=p;u=b-a;v=c-a;det=u[0]*v[1]-u[1]*v[0]
            if abs(det)<1e-12:continue
            lo=np.maximum(0,np.floor(p.min(axis=0)).astype(int));hi=np.minimum(size,np.ceil(p.max(axis=0)).astype(int))
            if np.any(hi<=lo):continue
            xx,yy=np.meshgrid(np.arange(lo[0],hi[0])+.5,np.arange(lo[1],hi[1])+.5);dx=xx-a[0];dy=yy-a[1]
            beta=(dx*v[1]-dy*v[0])/det;gamma=(u[0]*dy-u[1]*dx)/det;inside=(beta>=-1e-7)&(gamma>=-1e-7)&(beta+gamma<=1+1e-7)
            mask[lo[1]:hi[1],lo[0]:hi[0]]|=inside
    return mask
def Expand(mask,steps):
    result=mask.copy()
    for _ in range(steps):
        old=result.copy();result[1:]|=old[:-1];result[:-1]|=old[1:];result[:,1:]|=old[:,:-1];result[:,:-1]|=old[:,1:]
    return result
allMapped=Mask(unique);masks={name:Mask([next(o for o in meshes if o.name==name)])for name in staticTargets|movingTargets}
for name,mask in masks.items():assert mask.any(),name
excludedTokens=['CommanderHatch','DriverVisionFlap','DriverPortShutter','BowRoundPortCover','SideVisionFlap','SideVisionLatch','BowHatch','EngineHatch','SuspensionCover']
staticSources=[o for o in meshes if not any(t in o.name for t in excludedTokens)]
visibility={o:(o.hide_render,o.hide_get())for o in bpy.context.scene.objects}
for obj in bpy.context.scene.objects:bake.Visible(obj,False)
flagName='PoseAoReceiver'
for obj in staticSources:
    flag=obj.data.attributes.get(flagName)or obj.data.attributes.new(flagName,'FLOAT','FACE')
    for i,polygon in enumerate(obj.data.polygons):flag.data[i].value=float(obj.name in staticTargets and Role(obj.data.materials[polygon.material_index])=='Armor')
staticProxy=bake.Proxy(staticSources,'PoseAo_StaticWithoutClosures');temporary=[staticProxy]
for obj in staticSources:
    flag=obj.data.attributes.get(flagName)
    if flag:obj.data.attributes.remove(flag)
for obj in staticSources:bake.Visible(obj,False)
scratch=bpy.data.images.new('PoseAoScratch',width=4,height=4,alpha=True);scratch.colorspace_settings.name='Non-Color'
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=4;scene.render.threads_mode='FIXED';scene.render.threads=2
scene.render.bake.use_selected_to_active=False;scene.render.bake.use_clear=False;scene.render.bake.margin=4
reports=[];combinedMask=np.zeros((size,size),bool)
def BakeAo(obj,label):
    image=bpy.data.images.new('PoseAo_'+label,width=size,height=size,alpha=True);image.colorspace_settings.name='Non-Color';image.generated_color=(1,1,1,1)
    roles=[Role(m)for m in obj.data.materials];flag=obj.data.attributes.get(flagName)
    materialIndices=[int(roles[p.material_index]=='Armor'and (flag is None or flag.data[p.index].value>.5))for p in obj.data.polygons]
    assert any(materialIndices),'No requested AO receiver faces'
    obj.data.materials.clear()
    for i in range(2):
        m=bpy.data.materials.new('PoseAo_'+label+'_'+str(i));m.use_nodes=True;nodes=m.node_tree.nodes;links=m.node_tree.links;nodes.clear()
        output=nodes.new('ShaderNodeOutputMaterial');emission=nodes.new('ShaderNodeEmission');ao=nodes.new('ShaderNodeAmbientOcclusion');ao.only_local=True;ao.samples=32;ao.inputs['Distance'].default_value=.16
        links.new(ao.outputs['AO'],emission.inputs['Color']);links.new(emission.outputs[0],output.inputs['Surface'])
        target=nodes.new('ShaderNodeTexImage');target.image=image if i==1 else scratch;nodes.active=target;obj.data.materials.append(m)
    for polygon,index in zip(obj.data.polygons,materialIndices):polygon.material_index=index
    assert [p.material_index for p in obj.data.polygons]==materialIndices,'AO receivers lost their original role partition'
    for item in bpy.context.scene.objects:item.select_set(False)
    bake.Visible(obj,True);obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.bake(type='EMIT',use_selected_to_active=False,use_clear=False,margin=4)
    values=np.empty(size*size*4,np.float32);image.pixels.foreach_get(values);values=values.reshape(size,size,4)
    image.filepath_raw=str(mapDir/('Texture_Type89HighPoseAo'+label+'.png'));image.file_format='PNG';image.save();bake.Visible(obj,False)
    return values[:,:,0].copy()
def Apply(values,names,label):
    global combinedMask
    core=np.logical_or.reduce([masks[n]for n in names]);other=Expand(allMapped&~core,1);patch=core|(Expand(core,2)&~other)
    before=old[:,:,0][core];after=values[core]
    assert np.isfinite(after).all()and np.min(after)>=0 and np.max(after)<=1
    raw[:,:,0][patch]=values[patch];combinedMask|=patch
    reports.append({'label':label,'parts':sorted(names),'coreTexels':int(core.sum()),'patchedTexels':int(patch.sum()),'oldMeanAo':float(before.mean()),'newMeanAo':float(after.mean()),'oldFractionBelowPointOne':float(np.mean(before<.1)),'newFractionBelowPointOne':float(np.mean(after<.1))})
Apply(BakeAo(staticProxy,'Static'),staticTargets,'StaticAssemblyWithoutClosures')
for name in sorted(movingTargets):
    original=next(o for o in meshes if o.name==name);obj=original.copy();obj.data=original.data.copy();obj.parent=None;obj.matrix_world=original.matrix_world.copy();obj.name='PoseAo_'+name;bpy.context.scene.collection.objects.link(obj);temporary.append(obj)
    Apply(BakeAo(obj,name),{name},'RigidLidSelfOnly')
assert np.array_equal(raw[:,:,1:],old[:,:,1:]);assert np.array_equal(raw[:,:,0][~combinedMask],old[:,:,0][~combinedMask])
newImage=bpy.data.images.new('Texture_Type89HighArmorPoseOrm',width=size,height=size,alpha=True);newImage.colorspace_settings.name='Non-Color';newImage.pixels.foreach_set(raw.reshape(-1));newImage.update();newImage.filepath_raw=str(mapDir/'Texture_Type89HighArmorPoseOrm.png');newImage.file_format='PNG';newImage.save();newImage.pack()
for obj in unique:
    for m in obj.data.materials:
        if not m or not m.use_nodes:continue
        for n in m.node_tree.nodes:
            if n.type=='TEX_IMAGE'and n.image==originalImage:n.image=newImage
for obj in temporary:
    mesh=obj.data;bpy.data.objects.remove(obj,do_unlink=True)
    if mesh.users==0:bpy.data.meshes.remove(mesh)
for obj,(hidden,viewport)in visibility.items():obj.hide_render=hidden;obj.hide_set(viewport)
root['surfaceRevision']='SurfaceV11PoseAoHighStudy';root['pbrProbe']=True;root['poseOcclusionStudy']={'parts':sorted(staticTargets|movingTargets),'distanceM':.16,'samples':32,'staticClosuresExcluded':True,'onlyOrmRedChanged':True}
bpy.ops.wm.save_as_mainfile(filepath=str(outputBlend));bake.Export(root,outputGlb)
report={'status':'HighPoseOcclusionStudy_ActualRenderAndGameTransferRequired','input':str(inputFile),'blend':str(outputBlend),'glb':str(outputGlb),'glbSha256':hashlib.sha256(outputGlb.read_bytes()).hexdigest(),'maps':str(mapDir),'geometryVersion':root['geometryVersion'],'reports':reports,'changedAoTexels':int(np.count_nonzero(raw[:,:,0]!=old[:,:,0])),'outsidePatchExact':True,'ormGreenBlueAlphaExact':True,'distanceM':.16,'samples':32,'limits':['High-only study; final game projection and ownership/pixel audits remain required.','The closure-free static assembly and each rigid lid use real geometry AO; no global AO intensity change.'],'goalComplete':False}
outputReport.write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report),flush=True)
