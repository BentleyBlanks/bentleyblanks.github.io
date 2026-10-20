"""Encode Blender's unique-surface colour/normal/AO bakes as 1024 PBR maps."""
import argparse
from pathlib import Path
import hashlib
import json
from datetime import datetime
import numpy as np
from PIL import Image


def Main():
    parser=argparse.ArgumentParser();parser.add_argument('--project',type=Path,required=True);parser.add_argument('--review',type=Path,required=True)
    args=parser.parse_args();modelPath=args.project/'Model/SichuanBlanketPack'
    baseArray=np.asarray(Image.open(args.review/'SurfaceBake_Base.png').convert('RGB'),dtype=np.float32)
    normalArray=np.asarray(Image.open(args.review/'SurfaceBake_Normal.png').convert('RGB'),dtype=np.float32)
    aoArray=np.asarray(Image.open(args.review/'SurfaceBake_Ao.png').convert('RGB'),dtype=np.float32)[...,0]
    valid=(aoArray>2)&(baseArray.max(axis=-1)>4)&(normalArray[...,2]>=120)
    for _ in range(16):
        count=np.zeros(valid.shape,dtype=np.float32)
        sums=[np.zeros_like(baseArray),np.zeros_like(normalArray),np.zeros_like(aoArray)]
        for dy,dx in ((-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)):
            shifted=np.roll(valid,(dy,dx),(0,1));count+=shifted
            for target,source in zip(sums,(baseArray,normalArray,aoArray)):
                mask=shifted[...,None] if source.ndim==3 else shifted
                target+=np.roll(source,(dy,dx),(0,1))*mask
        fill=(~valid)&(count>0)
        for target,total in zip((baseArray,normalArray,aoArray),sums):
            denominator=count[...,None] if target.ndim==3 else count
            averaged=total/np.maximum(denominator,1)
            target[fill]=averaged[fill]
        valid|=fill
    normalArray[~valid]=[127.5,127.5,255]
    aoArray[~valid]=255
    base=Image.fromarray(np.clip(baseArray,0,255).astype(np.uint8)).resize((1024,1024),Image.Resampling.LANCZOS)
    channels=[np.asarray(Image.fromarray(normalArray[...,c],'F').resize((1024,1024),Image.Resampling.BOX)) for c in range(3)]
    normals=np.stack(channels,axis=-1)/127.5-1
    normals[normals[...,2]<0]*=-1
    normals[...,2]=np.maximum(normals[...,2],.20)
    normals/=np.maximum(np.linalg.norm(normals,axis=-1,keepdims=True),1e-6)
    normal=Image.fromarray(np.clip((normals*.5+.5)*255,0,255).astype(np.uint8))
    ao=np.asarray(Image.fromarray(aoArray,'F').resize((1024,1024),Image.Resampling.BOX)).clip(0,255).astype(np.uint8)
    uvRows=json.loads((args.review/'Data_SurfaceUv.json').read_text(encoding='utf-8'))
    colour=np.asarray(base).copy();samples={}
    for row in uvRows:
        uv=np.asarray(row['uv']);center=uv.mean(axis=0)*1024
        x,y=np.clip(center.astype(int),0,1023);value=colour[y,x]
        if int(value.sum())>8:samples.setdefault(row['material'],[]).append(value)
    means={name:np.median(np.asarray(values),axis=0).astype(np.uint8) for name,values in samples.items()}
    defaults={'cloth':[177,166,147],'binding':[98,97,93],'straw':[157,134,99],'jacket':[33,46,64]}
    repaired=0
    for row in uvRows:
        triangle=np.asarray(row['uv'])*1024;a,b,c=triangle
        low=np.maximum(0,np.floor(triangle.min(axis=0)-2).astype(int));high=np.minimum(1023,np.ceil(triangle.max(axis=0)+2).astype(int))
        if np.any(high<low):continue
        yy,xx=np.mgrid[low[1]:high[1]+1,low[0]:high[0]+1];point=np.stack((xx+.5,yy+.5),axis=-1)
        ab=b-a;ac=c-a;determinant=ab[0]*ac[1]-ab[1]*ac[0]
        if abs(determinant)<1e-12:continue
        delta=point-a
        u=(delta[...,0]*ac[1]-delta[...,1]*ac[0])/determinant
        v=(ab[0]*delta[...,1]-ab[1]*delta[...,0])/determinant
        inside=(u>=0)&(v>=0)&(u+v<=1)
        distance=np.full(inside.shape,np.inf)
        for start,end in ((a,b),(b,c),(c,a)):
            edge=end-start;t=np.clip(np.sum((point-start)*edge,axis=-1)/max(float(edge@edge),1e-12),0,1)
            distance=np.minimum(distance,np.sum((point-(start+t[...,None]*edge))**2,axis=-1))
        target=colour[low[1]:high[1]+1,low[0]:high[0]+1]
        missing=(target.sum(axis=-1)<4)&(inside|(distance<=2.25))
        if missing.any():
            target[missing]=means.get(row['material'],np.array(defaults[row['region']],dtype=np.uint8));repaired+=int(missing.sum())
    base=Image.fromarray(colour)
    orm=np.zeros((1024,1024,3),dtype=np.uint8);orm[...,0]=ao;orm[...,1]=242
    outputs=[]
    for channel,image in [('Base',base),('Normal',normal),('Orm',Image.fromarray(orm))]:
        path=modelPath/('Texture_SichuanBlanketPack'+channel+'.webp')
        image.save(path,format='WEBP',quality=92 if channel=='Base' else 100,lossless=channel!='Base',method=6,use_sharp_yuv=True)
        payload=path.read_bytes();outputs.append({'channel':channel,'path':str(path),'width':1024,'height':1024,'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest()})
    recordPath=args.project/'_import/SichuanBlanketPack/Data_SichuanBlanketPackTextureBake.json'
    record=json.loads(recordPath.read_text(encoding='utf-8'))
    seedPath=Path.home()/'OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack/Source/MaterialAtlasV03'
    study=[]
    for channel in ('Base','Normal','Orm'):
        path=seedPath/('Texture_SichuanBlanketPack'+channel+'.webp');payload=path.read_bytes()
        study.append({'channel':channel,'path':str(path),'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest()})
    record['materialStudyOutputs']=study;record['outputs']=outputs
    strawPath=seedPath.parent/'MaterialAtlasV04'
    record['strawStudy']=json.loads((strawPath/'Data_StrawStudy.json').read_text(encoding='utf-8'))
    record['strawStudy']['prompt']='_import/SichuanBlanketPack/Data_ImagegenPromptV04.txt'
    fabricPath=seedPath.parent/'MaterialAtlasV05'
    record['fabricStudy']=json.loads((fabricPath/'Data_FabricStudy.json').read_text(encoding='utf-8'))
    record['fabricStudy']['prompt']='_import/SichuanBlanketPack/Data_ImagegenPromptV05.txt'
    record['surfaceBake']={'generator':'Script_SichuanPackSurfaceBake.py@4','resolution':[1024,1024],'intermediateResolution':[2048,2048],'padding':'16 source pixels of co-valid colour/normal/AO coverage dilation; outward-hemisphere unit-normal downsampling for thin two-sided cotton','uv':'Unique non-overlapping GameUV','normalSource':'Sculpted high-resolution cloth projected to the bundle; other assemblies self-baked','ao':'Cycles self-only AmbientOcclusion, 0.025 metre distance; cotton strength .45, jacket .25, other fibres .65','metallicPixels':[0,0],'roughnessPixels':[242,242],'aoRange':[int(ao.min()),int(ao.max())],'albedoContainsLighting':False,'normalEncoding':'Lossless WebP; vector channels remain exact after decode'}
    record['surfaceBake']['subpixelCoverageRepair']={'texels':repaired,'method':'Fill only uncovered raster texels inside actual triangles or their 1.5px edge padding, using the already-baked median of the same source material'}
    record['surfaceBake']['albedoContainsLighting']='Cotton wear uses a blurred normalized reference ratio; no side-fold photo is used as albedo. Generated yarn shading is an approximation, not measured intrinsic albedo.'
    record['surfaceBake']['date']=datetime.now().astimezone().date().isoformat()
    recordPath.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    manifestPath=modelPath/'Data_SichuanBlanketPackTextures.json'
    manifest=json.loads(manifestPath.read_text(encoding='utf-8'))
    manifest['schema']='tengxian-model-textures-v2';manifest['date']=record['surfaceBake']['date']
    if 'quadrants' in manifest.get('atlas',{}):manifest['materialStudyAtlas']=manifest['atlas']
    manifest['atlas']={'layout':'unique-surface-uv','uvOrigin':'bottom-left','uvSet':'GameUV','texCoord':1,'packing':'Minimum-stretch unwrap; six-direction self-visibility allocates 1.90 density to the outer front and 0.20 to concealed cloth; non-overlapping concave islands, explicit 0.003 fractional margin','bakeResolution':[2048,2048],'runtimeResolution':[1024,1024]}
    manifest['source']['ref']='Image_SichuanFabricStudyV05.png'
    manifest['source']['path']=str(fabricPath/'Image_SichuanFabricStudyV05.png')
    sourceImage=Image.open(fabricPath/'Image_SichuanFabricStudyV05.png')
    manifest['source']['width'],manifest['source']['height']=sourceImage.size
    manifest['source']['sha256']=hashlib.sha256((fabricPath/'Image_SichuanFabricStudyV05.png').read_bytes()).hexdigest()
    manifest['source']['prompt']='_import/SichuanBlanketPack/Data_ImagegenPromptV05.txt'
    manifest['source']['date']='2026-10-20'
    manifest['source']['persistentPrompt']=str(seedPath.parent/'Data_ImagegenPromptV05.txt')
    manifest['atlasReason']='Independent imagegen fibre studies are reprojected onto unique non-overlapping GameUV islands; sculpted cloth supplies the broad fold relief.'
    manifest['referenceSamples']={'path':str(seedPath.parent/'Image_SichuanBlanketPackThreeViewV02.png'),'provider':'imagegen, approved reference','cottonPixels':[248,394,484,508],'greyClothPixels':[209,218,232,315],'use':'Unshadowed interior material samples, blended with the generated albedo study; no whole concept projection'}
    manifest['referenceClothBake']='_import/Script_SichuanPackReferenceCloth.py'
    manifest['referenceSamples']['cottonFacePixels']=[77,194,680,695]
    manifest['referenceSamples']['cottonSidePixels']=[755,194,948,695]
    manifest['referenceSamples'].pop('cottonSidePixels',None)
    manifest['referenceSamples']['use']='Blurred normalized front/back wear ratio only; fabric yarn and indigo/grey cloth come from the independent V05 study'
    manifest['referenceSamples']['cottonProcess']='_import/Script_SichuanFabricStudy.py: calibrated sRGB colour, 8cm effective tile and fine 55/65 micrometre normal relief'
    manifest['surfaceBake']='_blender/Script_SichuanPackSurfaceBake.py';manifest['surfaceEncoder']='_import/Script_SichuanPackSurfaceMaps.py'
    manifest['files']=[{'path':str(Path('Model/SichuanBlanketPack')/Path(row['path']).name).replace('\\','/'),'channel':row['channel'],'width':1024,'height':1024,'colorSpace':'sRGB' if row['channel']=='Base' else 'linear','bytes':row['bytes'],'sha256':row['sha256'],'encoding':'WebP q92' if row['channel']=='Base' else 'lossless WebP'} for row in outputs]
    manifest['totalBytes']=sum(row['bytes'] for row in outputs)
    manifest['strawStudy']=record['strawStudy']
    manifest['fabricStudy']=record['fabricStudy']
    manifest['physicalMeaning']='Rough nonmetal natural fibres. ORM R is baked self-occlusion; G is 242/255; B is zero. Sculpted fold normals are projected from the high source; V05 cotton carries normalized reference wear without painted side-fold shadows.'
    manifest['verification']={'allMaps1024':True,'allMetalZero':True,'surfaceUvReprojected':True,'aoRange':[int(ao.min()),int(ao.max())]}
    manifestPath.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('SURFACE_MAPS_ENCODED',sum(row['bytes'] for row in outputs),flush=True)


if __name__=='__main__':Main()
