"""Project validated retained-high side-cover AO without changing other fields."""
import bpy,sys,json,hashlib,os
from pathlib import Path
import numpy as np
here=Path(__file__).resolve().parent;sys.path.insert(0,str(here))
import Script_Type89PbrBake as bake
def Arg(n,d=None):return next((v.split('=',1)[1]for v in sys.argv if v.startswith('--'+n+'=')),d)
sourceFile=Path(Arg('source'));targetFile=Path(Arg('target'));quality=Arg('quality','Game');outputBlend=Path(Arg('blend'));outputGlb=Path(Arg('export'));reportFile=Path(Arg('report'));mapDir=Path(Arg('maps'));revision=Arg('revision','SurfaceV11PoseOcclusionStudy')
for p in [outputBlend.parent,outputGlb.parent,reportFile.parent,mapDir]:p.mkdir(parents=True,exist_ok=True)
parts=('Mesh_SideVisionFrameLeft','Mesh_SideVisionFrameRight','Mesh_SideVisionFlapLeft','Mesh_SideVisionFlapRight')
def ArmorImage(root):
    material=next(m for o in bake.UniqueMeshes(root)for m in o.data.materials if m and m.get('Type89Role')=='Armor')
    return next(n.image for n in material.node_tree.nodes if n.type=='TEX_IMAGE'and n.label=='Orm')
def Pixels(image):
    w,h=image.size;assert w==h;raw=np.empty(w*h*4,np.float32);image.pixels.foreach_get(raw);return raw.reshape(h,w,4)
def SaveImage(name,raw,path):
    image=bpy.data.images.new(name,width=raw.shape[1],height=raw.shape[0],alpha=True);image.colorspace_settings.name='Non-Color';image.pixels.foreach_set(raw.reshape(-1));image.update();image.filepath_raw=str(path);image.file_format='PNG';image.save();return image
bpy.ops.wm.open_mainfile(filepath=str(sourceFile));highRoot=bpy.data.objects['Model_Type89MediumTank'];assert bpy.context.scene['Type89Quality']=='High'and highRoot.get('poseOcclusionStudy')
sourceVersion=highRoot['geometryVersion'];highMeshes=bake.UniqueMeshes(highRoot);highProxy=bake.Proxy(highMeshes,'PoseAoHighSource');highOrm=Pixels(ArmorImage(highRoot));highAo=np.ones_like(highOrm);highAo[:,:,:3]=highOrm[:,:,0,None]
bake.mapDir=mapDir;SaveImage('PoseAoHighScalar',highAo,mapDir/'Texture_Type89HighArmorAo.png')
with bpy.data.libraries.load(str(targetFile),link=False)as(fr,to):
    names=[n for n in fr.objects if n=='Model_Type89MediumTank'or n.startswith(('Node_','Mesh_'))];to.objects=list(names)
collection=bpy.data.collections.new('PoseAoTargetStudy');bpy.context.scene.collection.children.link(collection);objects={}
for name,obj in zip(names,to.objects):
    if obj is None:continue
    collection.objects.link(obj);obj.name='PoseAoTarget_'+name;objects[name]=obj
targetRoot=objects['Model_Type89MediumTank'];targetVersion=targetRoot['geometryVersion']
if targetVersion!=sourceVersion:
    proof=Path(Arg('cache-proof'));cache=json.loads(proof.read_text(encoding='utf8'))
    assert cache['sourceGeometryVersion']==sourceVersion and cache['targetGeometryVersion']==targetVersion and cache['outsideChangedRegionGeometryExact']and cache['targetPartsGeometryExact']and cache['minimumChangedRegionDistanceM']>.16,'Cross-version AO cache lacks spatial/geometry proof'
bpy.context.view_layer.update();targetMeshes=bake.UniqueMeshes(targetRoot);targetProxy=bake.Proxy(targetMeshes,'PoseAoTargetProxy');old=Pixels(ArmorImage(targetRoot));size=old.shape[0]
scalar=np.ones_like(old);scalar[:,:,:3]=old[:,:,0,None];image=SaveImage('PoseAoTargetScalar',scalar,mapDir/('Texture_Type89'+quality+'ArmorAoBefore.png'))
repair=bake.DetailProjectionRepair(highProxy,targetProxy,targetMeshes,tuple('PoseAoTarget_'+n for n in parts));result=repair.Repair(image,'Ao',force=True);newAo=Pixels(image)[:,:,0]
def Mask(objects,names=None):
    mask=np.zeros((size,size),bool)
    for obj in objects:
        if names and obj.name not in names:continue
        mesh=obj.data;mesh.calc_loop_triangles();uv=mesh.uv_layers.active.data
        for tri in mesh.loop_triangles:
            if bake.RoleOf(mesh.materials[tri.material_index])not in ['Armor','CastArmor']:continue
            p=np.array([uv[i].uv[:]for i in tri.loops])*size;a,b,c=p;u=b-a;v=c-a;det=u[0]*v[1]-u[1]*v[0]
            if abs(det)<1e-12:continue
            lo=np.maximum(0,np.floor(p.min(axis=0)).astype(int));hi=np.minimum(size,np.ceil(p.max(axis=0)).astype(int))
            if np.any(hi<=lo):continue
            xx,yy=np.meshgrid(np.arange(lo[0],hi[0])+.5,np.arange(lo[1],hi[1])+.5);dx=xx-a[0];dy=yy-a[1];bary=(dx*v[1]-dy*v[0])/det;gamma=(u[0]*dy-u[1]*dx)/det
            mask[lo[1]:hi[1],lo[0]:hi[0]]|=(bary>=-1e-7)&(gamma>=-1e-7)&(bary+gamma<=1+1e-7)
    return mask
core=Mask(targetMeshes,set('PoseAoTarget_'+n for n in parts));allMapped=Mask(targetMeshes);changed=np.abs(newAo-old[:,:,0])>1e-7;core|=changed
other=allMapped&~core;guard=other.copy();guard[1:]|=other[:-1];guard[:-1]|=other[1:];guard[:,1:]|=other[:,:-1];guard[:,:-1]|=other[:,1:]
valid=core.copy();values=newAo.copy()
for iteration in range(2):
    oldValid=valid.copy();pending=~valid&~guard
    for dy,dx in [(0,1),(0,-1),(1,0),(-1,0)]:
        shifted=np.roll(oldValid,(dy,dx),(0,1));sourceValues=np.roll(values,(dy,dx),(0,1))
        if dy>0:shifted[:dy]=False
        if dy<0:shifted[dy:]=False
        if dx>0:shifted[:,:dx]=False
        if dx<0:shifted[:,dx:]=False
        take=shifted&pending;values[take]=sourceValues[take];valid[take]=True;pending[take]=False
patched=old.copy();patched[:,:,0][valid]=values[valid];assert np.array_equal(patched[:,:,1:],old[:,:,1:]);assert np.array_equal(patched[:,:,0][~valid],old[:,:,0][~valid])
ormFile=mapDir/('Texture_Type89'+quality+'ArmorPoseOrm.png');orm=SaveImage('Texture_Type89'+quality+'ArmorPoseOrm',patched,ormFile);orm.pack()
bpy.ops.wm.open_mainfile(filepath=str(targetFile));root=bpy.data.objects['Model_Type89MediumTank'];assert root['geometryVersion']==targetVersion and bpy.context.scene['Type89Quality']==quality
oldImage=ArmorImage(root);newImage=bpy.data.images.load(str(ormFile),check_existing=False);newImage.colorspace_settings.name='Non-Color';newImage.pack()
for obj in bake.UniqueMeshes(root):
    for m in obj.data.materials:
        if not m or not m.use_nodes:continue
        for n in m.node_tree.nodes:
            if n.type=='TEX_IMAGE'and n.image==oldImage:n.image=newImage
root['surfaceRevision']=revision;root['pbrProbe']=Arg('working','false')!='true';root['poseOcclusionCorrection']={'source':str(sourceFile),'sourceGeometryVersion':sourceVersion,'parts':list(parts),'onlyOrmRedChanged':True,'nearestHighLimitM':.035,'physicalDistanceM':.16}
bpy.ops.wm.save_as_mainfile(filepath=str(outputBlend));bake.Export(root,outputGlb)
report={'status':'ProjectedPoseOcclusion_ActualFileAndRenderAuditRequired','quality':quality,'sourceGeometryVersion':sourceVersion,'targetGeometryVersion':targetVersion,'input':str(targetFile),'source':str(sourceFile),'blend':str(outputBlend),'glb':str(outputGlb),'glbSha256':hashlib.sha256(outputGlb.read_bytes()).hexdigest(),'projection':result,'changedAoTexels':int(np.count_nonzero(patched[:,:,0]!=old[:,:,0])),'outsideScopeExact':True,'ormGreenBlueAlphaExact':True,'goalComplete':False}
reportFile.write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report),flush=True)
