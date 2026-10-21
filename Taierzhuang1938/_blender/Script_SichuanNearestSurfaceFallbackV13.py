"""Deterministic closest-actual-surface texture baking for real missed ray texels."""
import bpy,numpy as np,json,hashlib,runpy,gc,time
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

def Hash(data):return hashlib.sha256(data).hexdigest()
def Unit(a):
    n=np.linalg.norm(a,axis=-1,keepdims=True);return a/np.maximum(n,1e-20)
def Sample(image,uv):
    uv=np.asarray(uv);w=image.shape[1];h=image.shape[0]
    x=np.clip(uv[...,0]*w-.5,0,w-1);y=np.clip((1-uv[...,1])*h-.5,0,h-1)
    a=x.astype(int);b=y.astype(int);c=np.minimum(a+1,w-1);d=np.minimum(b+1,h-1);s=(x-a)[...,None];t=(y-b)[...,None]
    return (image[b,a]*(1-s)*(1-t)+image[b,c]*s*(1-t)+image[d,a]*(1-s)*t+image[d,c]*s*t)/255.0
def Linear(v):return np.where(v<=.04045,v/12.92,((v+.055)/1.055)**2.4)
def Srgb(v):return np.where(v<=.0031308,v*12.92,1.055*np.maximum(v,0)**(1/2.4)-.055)
def BaseSample(image,uv):
    # Decode before interpolation, rather than interpolating encoded sRGB.
    uv=np.asarray(uv);w=image.shape[1];h=image.shape[0];x=np.clip(uv[...,0]*w-.5,0,w-1);y=np.clip((1-uv[...,1])*h-.5,0,h-1)
    a=x.astype(int);b=y.astype(int);c=np.minimum(a+1,w-1);d=np.minimum(b+1,h-1);s=(x-a)[...,None];t=(y-b)[...,None]
    return Linear(image[b,a,:3]/255.)*(1-s)*(1-t)+Linear(image[b,c,:3]/255.)*s*(1-t)+Linear(image[d,a,:3]/255.)*(1-s)*t+Linear(image[d,c,:3]/255.)*s*t
def Arrays(obj):
    mesh=obj.data;mesh.calc_loop_triangles();mesh.calc_tangents(uvmap=mesh.uv_layers.active.name)
    def Get(seq,key,dim,dtype=np.float32):
        a=np.empty(len(seq)*dim,dtype);seq.foreach_get(key,a);return a.reshape(-1,dim) if dim>1 else a
    pos=Get(mesh.vertices,'co',3);loops=Get(mesh.loops,'vertex_index',1,np.int32);tri=Get(mesh.loop_triangles,'loops',3,np.int32)
    matrix=np.asarray(obj.matrix_world);assert np.linalg.det(matrix[:3,:3])>0,'Reflections require explicit tangent handedness compensation';world=pos@matrix[:3,:3].T+matrix[:3,3]
    n=Unit(Get(mesh.corner_normals,'vector',3)@np.linalg.inv(matrix[:3,:3]));t=Get(mesh.loops,'tangent',3)@matrix[:3,:3].T;t=Unit(t-n*(n*t).sum(axis=1,keepdims=True))
    return {'world':world,'loops':loops,'tri':tri,'uv':Get(mesh.uv_layers.active.data,'uv',2),'n':n,'t':t,'sign':Get(mesh.loops,'bitangent_sign',1)}
def Basis(data,loops,bary):
    n=Unit((data['n'][loops]*bary[:,None]).sum(axis=0));t=(data['t'][loops]*bary[:,None]).sum(axis=0);t=Unit(t-n*np.dot(n,t));sign=1 if np.dot(data['sign'][loops],bary)>=0 else -1
    return n,t,np.cross(n,t)*sign,sign

def BakeNearestFallback(repo,projectionFile,inputsFile,outputDir):
    started=time.time();repo,projectionFile,inputsFile,outputDir=map(Path,(repo,projectionFile,inputsFile,outputDir));outputDir.mkdir(parents=True,exist_ok=True)
    projection=json.loads(projectionFile.read_text());inputs=json.loads(inputsFile.read_text())
    helper=runpy.run_path(str(repo/'Taierzhuang1938/_blender/Script_SichuanQualityNormalTransferV13.py'))
    ex=runpy.run_path(str(repo/'Taierzhuang1938/_blender/Script_SichuanLodExportV13.py'));evidence=ex['Evidence']
    assert evidence(projectionFile)==inputs['projection'];high=bpy.data.objects[bpy.context.scene['ProjectionHighRoot']];highParts=ex['PartObjects'](high)
    result={'generator':'SichuanNearestSurfaceFallbackV13','sourceProjection':evidence(projectionFile),'sourceImageInputs':evidence(inputsFile),'sourceHighRuntime':projection['sourceHighRuntime'],'sourceHighBlend':projection['sourceHighBlend'],'resolutionPerPart':[4096,4096],'method':'Only actual low UV-covered black/transparent ray-miss texels are baked from the nearest actual high triangle with valid source atlas samples; physical barycentric source sampling, no invented colours or neighbouring target-pixel fill','pixelPaintingUsed':False,'baseColourPolicy':'Explicit RGBA8 decode, sRGB to linear before bilinear interpolation, linear to sRGB after; PNG top-row-first and Blender UV bottom-row-first converted explicitly','normalPolicy':'Actual high and final low active-UV Mikk corner TBN; world inverse-transpose normals, linear tangents, Gram-Schmidt and actual UV handedness','parts':{},'objects':[]}
    for role in projection['partSubset']:
        target=bpy.data.objects[role];lowBefore=helper['MeshEvidence'](target.data);ld=Arrays(target)
        current=next(o for o in projection['objects'] if o['kind']=='Low' and o['part']==role);assert lowBefore==current['before']==current['after']
        src={ch:np.memmap(inputs['parts'][role]['high'][ch]['path'],dtype=np.uint8,mode='r',shape=(4096,4096,4)) for ch in ('Base','Orm','Normal')}
        dst={ch:np.fromfile(inputs['parts'][role]['low'][ch]['path'],np.uint8).reshape(4096,4096,4) for ch in src}
        highData=[];vertices=[];faces=[];faceMap=[];highRows=[];excluded=0
        for obj in highParts[role]:
            before=helper['MeshEvidence'](obj.data);d=Arrays(obj);uv=d['uv'][d['tri']].mean(axis=1)
            valid=(Sample(src['Base'],uv)[...,:3].sum(axis=1)>0)&(Sample(src['Orm'],uv)[...,1]>0)
            excluded+=int((~valid).sum());offset=len(vertices);vertices.extend(Vector(p) for p in d['world']);index=len(highData)
            for ti in np.flatnonzero(valid):faces.append(tuple(int(v)+offset for v in d['loops'][d['tri'][ti]]));faceMap.append((index,int(ti)))
            highData.append(d);highRows.append((obj,before))
        assert faces;bvh=BVHTree.FromPolygons(vertices,faces,all_triangles=True);corrected=set();samples=[];maximumDistance=0;maximumSampleDistance=0
        for ti,loops in enumerate(ld['tri']):
            uv=ld['uv'][loops];area=np.cross(uv[1]-uv[0],uv[2]-uv[0]);
            if abs(area)<1e-20:continue
            lo=np.maximum(np.ceil(uv.min(axis=0)*4096-.5).astype(int),0);hi=np.minimum(np.floor(uv.max(axis=0)*4096-.5).astype(int),4095)
            if np.any(hi<lo):continue
            xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1),np.arange(lo[1],hi[1]+1));xt=xx.ravel();yb=yy.ravel();yt=4095-yb
            bad=(dst['Base'][yt,xt,:3].sum(axis=1)==0)|(dst['Orm'][yt,xt,1]==0)|(dst['Base'][yt,xt,3]==0)|(dst['Normal'][yt,xt,3]==0)|(dst['Orm'][yt,xt,3]==0)
            if not bad.any():continue
            xt=xt[bad];yb=yb[bad];points=np.column_stack(((xt+.5)/4096,(yb+.5)/4096));v=points-uv[0]
            b1=(v[:,0]*(uv[2,1]-uv[0,1])-v[:,1]*(uv[2,0]-uv[0,0]))/area;b2=((uv[1,0]-uv[0,0])*v[:,1]-(uv[1,1]-uv[0,1])*v[:,0])/area;b0=1-b1-b2
            inside=(b0>=-1e-7)&(b1>=-1e-7)&(b2>=-1e-7)
            for x,y,weights in zip(xt[inside],yb[inside],np.column_stack((b0,b1,b2))[inside]):
                row=4095-int(y);x=int(x);pixel=row*4096+x
                if pixel in corrected:continue
                point=(ld['world'][ld['loops'][loops]]*weights[:,None]).sum(axis=0);nearest,normal,fi,distance=bvh.find_nearest(Vector(point));assert nearest is not None
                si,st=faceMap[fi];sd=highData[si];sl=sd['tri'][st];verts=sd['world'][sd['loops'][sl]]
                # Explicit actual nearest-point barycentrics, including edge clamps.
                a=verts[1]-verts[0];b=verts[2]-verts[0];p=np.asarray(nearest)-verts[0];den=np.dot(a,a)*np.dot(b,b)-np.dot(a,b)**2
                sb1=(np.dot(b,b)*np.dot(p,a)-np.dot(a,b)*np.dot(p,b))/den;sb2=(np.dot(a,a)*np.dot(p,b)-np.dot(a,b)*np.dot(p,a))/den;sb=np.array([1-sb1-sb2,sb1,sb2]);sb=np.maximum(sb,0);sb/=sb.sum()
                # Source-atlas boundary filtering never invents data: move on this
                # same actual high triangle toward its validated interior sample.
                for shift in (0,.05,.25,.5,1):
                    sampleBary=sb*(1-shift)+np.ones(3)/3*shift;suv=(sd['uv'][sl]*sampleBary[:,None]).sum(axis=0)
                    base=BaseSample(src['Base'],suv);orm=Sample(src['Orm'],suv)
                    if base.sum()>0 and orm[1]>0:break
                assert base.sum()>0 and orm[1]>0
                sampleWorld=(verts*sampleBary[:,None]).sum(axis=0);sampleDistance=float(np.linalg.norm(sampleWorld-point));maximumSampleDistance=max(maximumSampleDistance,sampleDistance)
                hn,ht,hb,hs=Basis(sd,sl,sampleBary);encoded=Sample(src['Normal'],suv)[:3]*2-1;world=Unit(ht*encoded[0]+hb*encoded[1]+hn*encoded[2])
                ln,lt,lb,ls=Basis(ld,loops,weights);lowNormal=Unit(np.array([np.dot(world,lt),np.dot(world,lb),np.dot(world,ln)]))*.5+.5
                dst['Base'][row,x,:3]=np.rint(np.clip(Srgb(base),0,1)*255).astype(np.uint8);dst['Orm'][row,x,:3]=np.rint(np.clip(orm[:3],0,1)*255).astype(np.uint8);dst['Normal'][row,x,:3]=np.rint(np.clip(lowNormal,0,1)*255).astype(np.uint8)
                for ch in dst:dst[ch][row,x,3]=255
                corrected.add(pixel);maximumDistance=max(maximumDistance,float(distance))
                if len(samples)<24:samples.append({'x':x,'yBottom':int(y),'lowTriangle':ti,'sourceObject':highRows[si][0].name,'sourceTriangle':st,'sourceBarycentric':sampleBary.tolist(),'sourceUv':suv.tolist(),'nearestDistanceM':float(distance),'sourceInteriorShiftFraction':shift,'sourceSampleWorldPoint':sampleWorld.tolist(),'lowWorldPoint':point.tolist(),'sourceSampleDistanceM':sampleDistance,'sourceHandedness':hs,'lowHandedness':ls})
        records={};mask=np.zeros(4096*4096,bool);mask[list(corrected)]=True
        for channel,data in dst.items():
            original=np.memmap(inputs['parts'][role]['low'][channel]['path'],np.uint8,mode='r',shape=(4096*4096,4));output=data.reshape(-1,4)
            assert np.array_equal(original[~mask],output[~mask]);outsideHash=Hash(output[~mask].tobytes());file=outputDir/(role+'_'+channel+'.rgba');data.tofile(file)
            records[channel]={**evidence(file),'outsideFallbackMaskBeforeSha256':outsideHash,'outsideFallbackMaskAfterSha256':outsideHash,'unchangedPixelsVerified':True,'changedPixels':int(np.any(original!=output,axis=1).sum())}
        after=helper['MeshEvidence'](target.data);assert lowBefore==after
        result['objects'].append({'kind':'Low','part':role,'originalName':role,'before':lowBefore,'after':after})
        for obj,before in highRows:
            after=helper['MeshEvidence'](obj.data);assert before==after;result['objects'].append({'kind':'High','part':role,'originalName':ex['Name'](obj),'before':before,'after':after})
        maskFile=outputDir/(role+'_CorrectedTexels.uint32');np.asarray(sorted(corrected),dtype='<u4').tofile(maskFile)
        result['parts'][role]={'correctedUvCoveredRayMissPixels':len(corrected),'correctedTexels':{**evidence(maskFile),'encoding':'uint32-le, PNG top-row-first flat pixel index'},'excludedHighTrianglesWithInvalidSourceAtlasCentroids':excluded,'maximumNearestSurfaceDistanceM':maximumDistance,'maximumActualSourceSampleDistanceM':maximumSampleDistance,'samples':samples,'outputs':records,'beforeImages':projection['atlases'][role]['images']}
        print('NEAREST_SURFACE_PART_COMPLETE',role,len(corrected),maximumDistance,flush=True)
        del src,dst,highData,bvh,vertices,faces;gc.collect()
    result['seconds']=time.time()-started;result['imagesEncoded']=False
    result['selectionPolicy']='Actual UV-covered texel centres only: Base RGB sum zero, ORM roughness G zero, or any Base/ORM/Normal alpha zero. Roughness zero is explicitly treated as an unwritten dry-material sample.'
    result['highSurfacePolicy']='Nearest actual high triangle with valid Base/ORM centroid atlas samples. If the nearest UV boundary sample is black, sample barycentrically toward the same triangle centroid; actual shift and sampled distance are recorded.'
    file=outputDir/'Data_NearestSurfaceFallbackV13.json';file.write_text(json.dumps(result,indent=2)+'\n');print('NEAREST_SURFACE_FALLBACK_COMPLETE',str(file));return result
