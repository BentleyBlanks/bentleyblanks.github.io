"""K08: selected C, a worn chopping table, hand-forged cleaver and rolling pin.

Run through Script_BlenderMcp.mjs exec --file. Blender axes are X=length,
Y=depth, Z=up. glTF export converts to Y up; front is Blender +Y / glTF -Z.
Each independent asset root is at its own bottom centre. The output directory
is outside the repository. Historical form details are design inferences.

The six imagegen source PNGs and their provenance remain in the stable asset
root's MaterialSources folder. Default outputs go to its Delivery subdirectory;
K08_OUTPUT_ROOT can select another output folder without moving source inputs.
The saved .blend and SourceExports retain editable split parts. Runtime GLBs
use the embedded K08StaticGlbV2 recipe; no worktree tmp helper is needed.
"""
import bpy
import math
import random
import json
import os
import struct
from array import array
from pathlib import Path
from mathutils import Vector, Quaternion
import numpy as np
import bmesh

ASSET_ROOT = Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K08_ChoppingTableSet')
# Keep the approved artistic source and its frozen review packages untouched.
# Rebuilds read stable source images and write editable sources/runtime exports
# into a separate delivery directory; no worktree temporary file is required.
MATERIAL_SOURCES = ASSET_ROOT / 'MaterialSources'
OUT = Path(os.environ.get('K08_OUTPUT_ROOT', str(ASSET_ROOT / 'Delivery')))
OUT.mkdir(parents=True, exist_ok=True)
SHOTS = OUT / 'Acceptance'
SHOTS.mkdir(exist_ok=True)
random.seed(308)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras, bpy.data.lights):
    for block in list(datablocks):
        if block.users == 0:
            datablocks.remove(block)

woodNormalCache={}
def worktop_source_atlas(image, width=1024, halfHeight=1024):
    """Two distinct crops from a photographic source, cross-faded along grain.

    This keeps old wood fibre scale legible over the 1.4 m surface without
    stamping one short source tile twice. The separate use mask remains in
    object coordinates and is applied only after this atlas is assembled.
    """
    sourceW,sourceH=image.size
    scaledW=max(2,round(sourceW*halfHeight/sourceH))
    copy=image.copy(); copy.scale(scaledW,halfHeight)
    pixels=array('f',[0.0])*(scaledW*halfHeight*4); copy.pixels.foreach_get(pixels)
    source=np.frombuffer(pixels,dtype=np.float32).reshape(halfHeight,scaledW,4).copy()
    bpy.data.images.remove(copy)
    mid=scaledW//2
    if mid<2: raise RuntimeError('Wood source is too narrow')
    def crop_resample(start,end):
        x=np.linspace(start,end-1,width,dtype=np.float32)
        lo=np.floor(x).astype(np.int32); hi=np.minimum(lo+1,end-1); t=(x-lo)[None,:,None]
        return source[:,lo,:]*(1-t)+source[:,hi,:]*t
    a=crop_resample(0,mid); b=crop_resample(scaledW-mid,scaledW)
    overlap=round(halfHeight*.12); total=halfHeight*2
    def resize_rows(tile,length):
        y=np.linspace(0,halfHeight-1,length,dtype=np.float32)
        lo=np.floor(y).astype(np.int32); hi=np.minimum(lo+1,halfHeight-1); t=(y-lo)[:,None,None]
        return tile[lo,:,:]*(1-t)+tile[hi,:,:]*t
    aa=resize_rows(a,halfHeight+overlap); bb=resize_rows(b,halfHeight+overlap)
    result=np.empty((total,width,4),dtype=np.float32)
    split=halfHeight-overlap
    result[:split]=aa[:split]
    alpha=np.linspace(0,1,overlap*2,dtype=np.float32); alpha=alpha*alpha*(3-2*alpha)
    result[split:halfHeight+overlap]=aa[split:]*(1-alpha[:,None,None])+bb[:overlap*2]*alpha[:,None,None]
    result[halfHeight+overlap:]=bb[overlap*2:]
    return result

def refined_wood_material(name, source_name, physical_u, physical_v, tone, grip=False):
    """Build embedded diffuse, height-derived normal and roughness from a local source.

    Source PNGs are retained in this asset's OneDrive MaterialSources directory;
    provenance and hash are stored alongside them. They are new material sources,
    not a projection of the concept image. Height units are metres.
    """
    sourcePath=MATERIAL_SOURCES/source_name
    if not sourcePath.is_file(): raise FileNotFoundError('Missing material source '+str(sourcePath))
    image=bpy.data.images.load(str(sourcePath),check_existing=True)
    if name=='VillageTimber_HeavyWear':
        w,h=1024,2048; rgba=worktop_source_atlas(image,w,h//2)
    else:
        sourceW,sourceH=image.size
        maxSize=768 if name.startswith('VillageTimber_Frame') else 1024
        ratio=min(1,maxSize/max(sourceW,sourceH))
        w,h=round(sourceW*ratio),round(sourceH*ratio)
        resized=image.copy(); resized.scale(w,h)
        pixels=array('f',[0.0])*(w*h*4); resized.pixels.foreach_get(pixels)
        bpy.data.images.remove(resized)
        rgba=np.frombuffer(pixels,dtype=np.float32).reshape(h,w,4).copy()
    yy,xx=np.mgrid[0:h,0:w].astype(np.float32); u=xx/w; v=yy/h
    if name in ('VillageTimber_HandGrip','VillageTimber_RollingHandle'):
        # A tool handle wraps around U; blend just the atlas edges so the
        # photographic source has no artificial lengthwise texture seam.
        band=max(2,round(w*.08))
        left=rgba[:,:band,:3].copy(); right=rgba[:,-band:,:3][:,::-1,:].copy()
        t=np.linspace(0,1,band,dtype=np.float32); t=t*t*(3-2*t)
        amount=(.5*(1-t))[None,:,None]
        rgba[:,:band,:3]=left*(1-amount)+right*amount
        rgba[:,-band:,:3]=(right*(1-amount)+left*amount)[:,::-1,:]
    work=np.zeros((h,w),dtype=np.float32)
    sourceWear=None
    if name=='VillageTimber_HeavyWear':
        # The clean underlying grain and the separately generated scarred wood
        # are blended only where food was repeatedly chopped. It is a single
        # worktop atlas; the mask is not repeated on individual boards.
        sourceWear=rgba[:,:,:3]@np.array([.2126,.7152,.0722],dtype=np.float32)
        # Keep the scar source's irregular medium-scale pigmentation while
        # reducing its overly even cross-hatch; actual cut geometry and the
        # underlying wood provide the fine-scale detail.
        scarFx=np.fft.rfftfreq(w)[None,:]; scarFy=np.fft.fftfreq(h)[:,None]
        scarFilter=np.exp(-2*math.pi**2*3.5**2*(scarFx*scarFx+scarFy*scarFy))
        for channel in range(3):
            original=rgba[:,:,channel].copy()
            softened=np.fft.irfft2(np.fft.rfft2(original)*scarFilter,s=(h,w)).astype(np.float32)
            rgba[:,:,channel]=original*.85+softened*.15
        basePath=MATERIAL_SOURCES/'Texture_K08_ChoppingWood_Source.png'
        if not basePath.is_file(): raise FileNotFoundError('Missing material source '+str(basePath))
        baseSource=bpy.data.images.load(str(basePath),check_existing=True)
        under=worktop_source_atlas(baseSource,w,h//2)
        # Asymmetric cutting zones; broad but softly irregular, not circular
        # mottling or lighting/shadow baked into albedo.
        wu=u+.025*np.sin(v*24)+.009*np.sin(v*65)
        wv=v+.018*np.sin(u*31)+.009*np.sin(u*71)
        zone1=np.exp(-((wu-.48)/.31)**4-((wv-.39)/.24)**4)
        zone2=np.exp(-((wu-.53)/.25)**4-((wv-.72)/.16)**4)
        work=np.clip(np.maximum(zone1,zone2),0,1)
        # The underlying wood remains visible away from chopping. The scar
        # material is concentrated in work zones, preventing an even grid.
        fraction=.12+.78*work
        rgba[:,:,:3]=under[:,:,:3]*(1-fraction[:,:,None])+rgba[:,:,:3]*fraction[:,:,None]
    lum=rgba[:,:,:3]@np.array([.2126,.7152,.0722],dtype=np.float32)
    fy=np.fft.fftfreq(h)[:,None]; fx=np.fft.rfftfreq(w)[None,:]; spectrum=np.fft.rfft2(lum)
    def blur(sigma):
        filt=np.exp(-2*math.pi**2*sigma**2*(fx*fx+fy*fy))
        return np.fft.irfft2(spectrum*filt,s=(h,w)).astype(np.float32)
    small=blur(2); medium=blur(12)
    if name=='VillageTimber_HeavyWear':
        # The local fibres and chopping depressions remain independent of the
        # dark pigment: a dirty area must still have readable wood relief.
        height=(lum-small)*.0015+(small-medium)*.0020
    elif name=='VillageTimber_HandGrip':
        # The handle occupies only 0.133 m: retain the same physical relief
        # while using the full nonrepeating source along its length.
        height=(lum-small)*.00010+(small-medium)*.00013
    else:
        height=(lum-small)*.00042+(small-medium)*.00052
    dy,dx=np.gradient(height,physical_v/h,physical_u/w)
    normal=np.dstack((-dx,-dy,np.ones_like(dx)))
    normal/=np.maximum(np.linalg.norm(normal,axis=2,keepdims=True),1e-9)
    normal=(normal*.5+.5).astype(np.float32)
    edge=np.exp(-u/.035)+np.exp(-(1-u)/.035) if name=='VillageTimber_HeavyWear' else np.zeros_like(u)
    if grip=='rolling':
        # Hands contact the two ends; the middle stays rougher and less dark.
        hold=np.clip(np.exp(-((v-.08)/.09)**4)+np.exp(-((v-.75)/.09)**4),0,1)
        hold*=np.clip(.70+.65*(medium-lum),.42,1)
    else:
        hold=np.exp(-((v-.57)/.08)**4) if grip else np.zeros_like(v)
    patchContact=np.zeros((h,w),dtype=np.float32)
    if name=='VillageTimber_RepairPatch':
        # Subtle local patina where each wooden peg compresses the old patch.
        for pv in (.139,.861):
            patchContact+=np.exp(-((u-.5)/.15)**2-((v-pv)/.065)**2)
        patchContact=np.clip(patchContact,0,1)
    frameFootMask=np.zeros((h,w),dtype=np.float32); frameJointMask=np.zeros((h,w),dtype=np.float32)
    if name=='VillageTimber_FrameLeg':
        # V is longitudinal along a leg. Fade dirt and contact continuously,
        # so a single piece of wood never develops a hard material seam.
        frameFootMask=np.exp(-((v-.23)/.075)**4)*(.70+.30*np.clip((medium-lum)*4,0,1))
        frameJointMask=np.exp(-((v-.77)/.070)**4)
    handledPatina=np.zeros((h,w),dtype=np.float32)
    if grip:
        # Use low-frequency dark regions from a separate wood source as an
        # irregular pigment mask, modulated by real handling zones. Blurring
        # removes its cut lines: they are not transferred to the handle.
        maskPath=MATERIAL_SOURCES/'Texture_K08_ChoppingWood_Source2.png'
        maskSource=bpy.data.images.load(str(maskPath),check_existing=True)
        maskCopy=maskSource.copy(); maskCopy.scale(w,h)
        maskPixels=array('f',[0.0])*(w*h*4); maskCopy.pixels.foreach_get(maskPixels)
        maskRgb=np.frombuffer(maskPixels,dtype=np.float32).reshape(h,w,4)[:,:,:3].copy()
        bpy.data.images.remove(maskCopy)
        maskLum=maskRgb@np.array([.2126,.7152,.0722],dtype=np.float32)
        maskSpectrum=np.fft.rfft2(maskLum)
        lowPass=np.exp(-2*math.pi**2*24**2*(fx*fx+fy*fy))
        pigment=np.fft.irfft2(maskSpectrum*lowPass,s=(h,w)).astype(np.float32)
        handledPatina=np.clip((np.percentile(pigment,65)-pigment)*4,0,.42)*(.55+.45*hold)
    base=rgba[:,:,:3].copy()*np.array(tone,dtype=np.float32)[None,None,:]
    stain=np.clip((.17-medium)*2,0,.32)
    # Worked-in colour is material pigment/patina, not a contact shadow.
    base*=np.clip(1-.14*edge-.10*work-.18*hold,.45,1)[:,:,None]
    base*=np.clip(1-.75*handledPatina,.60,1)[:,:,None]
    base*=np.clip(1-.24*patchContact*(.7+.3*np.clip(1-lum,0,1)),.70,1)[:,:,None]
    if grip=='rolling':
        # Pale exposed fibres in the handled zones come from the source wood,
        # interrupting the hand-oil patina without an even dark ring.
        touchFibre=np.clip((lum-small)*2.5,0,.12)*hold
        base+=touchFibre[:,:,None]*np.array([.15,.11,.075],dtype=np.float32)[None,None,:]
    if name=='VillageTimber_FrameLeg':
        # Fine dry earth on the lower foot, restrained and broken by the wood.
        dust=.22*frameFootMask
        base=base*(1-dust[:,:,None])+np.array([.11,.095,.075],dtype=np.float32)[None,None,:]*dust[:,:,None]
        # Exposed weathered fibres come from the material source; keep them
        # locally variable along the leg rather than painting uniform bands.
        frameFibre=lum-medium
        base*=np.clip(1+1.5*frameFibre,.70,1.25)[:,:,None]
        base+=np.clip(frameFibre,0,.10)[:,:,None]*np.array([.12,.10,.08],dtype=np.float32)[None,None,:]
    if name=='VillageTimber_HeavyWear':
        # Dark pigment and exposed fibres follow the source's fine cut pattern
        # only inside the chosen chopping zones, rather than a repeated overlay.
        micro=(lum-small)*work
        pigment=np.clip((.18-sourceWear)*2.0,0,.24)*work
        # Medium-size ingrained wear is taken from irregular dark regions in
        # the material source, not painted circular stains or cast shadows.
        wearSpectrum=np.fft.rfft2(sourceWear)
        # Preserve irregular broken pigment edges; a very broad blur turns
        # them into synthetic, smooth clouds rather than ingrained wear.
        wearFilter=np.exp(-2*math.pi**2*5**2*(fx*fx+fy*fy))
        worn=np.fft.irfft2(wearSpectrum*wearFilter,s=(h,w)).astype(np.float32)
        darkPatch=np.clip((np.percentile(worn,72)-worn)*6.0,0,.5)*(.55+.45*work)
        # Break the pigment with real pale wood fibres and mid-scale grain
        # from the *separate underlying source*. This changes albedo only: the
        # independently calculated normal and physical roughness stay fixed.
        underLum=under[:,:,:3]@np.array([.2126,.7152,.0722],dtype=np.float32)
        underSpectrum=np.fft.rfft2(underLum)
        def under_blur(sigma):
            filt=np.exp(-2*math.pi**2*sigma**2*(fx*fx+fy*fy))
            return np.fft.irfft2(underSpectrum*filt,s=(h,w)).astype(np.float32)
        underFine=under_blur(3); underMedium=under_blur(18)
        fibre=np.clip((underLum-underFine)*10,0,.8)
        midGrain=np.clip((underFine-underMedium)*5+.08,0,.6)
        q25,q70=np.percentile(underMedium,[25,70])
        openWood=np.clip((underMedium-q25)/max(q70-q25,1e-6),0,1)
        revealSeed=np.clip(.70*fibre+.55*midGrain+.35*openWood,0,.85)
        reveal=1-(1-revealSeed)**2
        # The front half of the working surface was handled and used more.
        # Existing dark features in the underlying wood supply additional
        # irregular wear rather than making two identical central stains.
        frontUse=np.clip((u-.42)/.35,0,1)
        regionalDirt=np.clip((q70-underMedium)*7,0,.32)*frontUse
        visualDark=np.maximum(darkPatch*(1-.72*reveal)*(.60+.45*frontUse),regionalDirt)
        visualDark=np.clip(visualDark,0,.5)
        base*=np.clip(1+3.0*micro-.55*pigment-.78*visualDark,.38,1.35)[:,:,None]
        exposed=np.clip((underLum-underMedium)*1.7,0,.18)*darkPatch*(.4+.6*work)
        base+=exposed[:,:,None]*np.array([.45,.35,.25],dtype=np.float32)[None,None,:]
        stain=np.maximum(stain,darkPatch)
    microCavity=np.clip((small-lum)*4,0,.35)
    rough=np.clip(.91-.12*np.clip(lum,0,1)+.045*stain+.08*microCavity-.11*edge-.055*work-.16*hold+.10*handledPatina-.045*patchContact,.62,.96).astype(np.float32)
    if name=='VillageTimber_FrameLeg': rough=np.clip(rough+.06*frameFootMask-.09*frameJointMask,.67,.98)
    if name=='VillageTimber_HandledEdge': rough=np.maximum(.68,rough-.09)
    if name=='VillageTimber_HeavyWear' and os.environ.get('K08_MATERIAL_DEBUG')=='1':
        debugDir=OUT/'MaterialTrials'; debugDir.mkdir(exist_ok=True)
        np.savez_compressed(debugDir/'Data_K08_WorkMask.npz',work=work,fraction=fraction,pigment=pigment,darkPatch=darkPatch,visualDark=visualDark,reveal=reveal)
        print('K08_WORK_MASK',json.dumps({
            'work_p10_p50_p90':[round(float(x),4) for x in np.percentile(work,[10,50,90])],
            'fraction_p10_p50_p90':[round(float(x),4) for x in np.percentile(fraction,[10,50,90])],
            'dark_p10_p50_p90':[round(float(x),4) for x in np.percentile(darkPatch,[10,50,90])],
            'worked_area_fraction':round(float(np.mean(work>.5)),4)}))
    def packed(label,rgb,noncolor):
        result=bpy.data.images.new(name+'_'+label,width=w,height=h,alpha=True)
        if noncolor: result.colorspace_settings.name='Non-Color'
        if rgb.ndim==2: rgb=np.repeat(rgb[:,:,None],3,axis=2)
        pixels=np.concatenate((rgb,np.ones((h,w,1),dtype=np.float32)),axis=2)
        result.pixels.foreach_set(pixels.ravel()); result.pack(); return result
    baseImage=packed('Base',base,False)
    normalKey=(source_name,physical_u,physical_v)
    normalImage=woodNormalCache.get(normalKey)
    if normalImage is None:
        normalImage=packed('Normal',normal,True); woodNormalCache[normalKey]=normalImage
    roughImage=packed('Roughness',rough,True)
    mat=bpy.data.materials.new(name); mat.use_nodes=True
    nodes=mat.node_tree.nodes; links=mat.node_tree.links; bs=nodes['Principled BSDF']
    tex=nodes.new('ShaderNodeTexImage'); tex.image=baseImage; links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    tex=nodes.new('ShaderNodeTexImage'); tex.image=roughImage; links.new(tex.outputs['Color'],bs.inputs['Roughness'])
    tex=nodes.new('ShaderNodeTexImage'); tex.image=normalImage
    normalNode=nodes.new('ShaderNodeNormalMap'); links.new(tex.outputs['Color'],normalNode.inputs['Color']); links.new(normalNode.outputs['Normal'],bs.inputs['Normal'])
    return mat

wood = refined_wood_material('VillageTimber_Aged','Texture_K08_AgedTimber_Source.png',.42,1.4,(.78,.67,.56))
woodEnd = refined_wood_material('VillageTimber_WornEnd','Texture_K08_AgedTimber_Source.png',.42,1.4,(.66,.56,.46))
woodTop = refined_wood_material('VillageTimber_HeavyWear','Texture_K08_ChoppingWood_Source2.png',.6,1.4,(.78,.68,.58))
woodGrip = refined_wood_material('VillageTimber_HandGrip','Texture_K08_HandledWood_Source2.png',.126,.133,(.95,.95,.90),True)
woodRolling = refined_wood_material('VillageTimber_RollingHandle','Texture_K08_HandledWood_Source2.png',.22,.588,(1.05,1.05,1.0),'rolling')
woodCross = refined_wood_material('VillageTimber_EndGrain','Texture_K08_EndGrain_Source.png',.30,.30,(.90,.78,.66))
woodPatch = refined_wood_material('VillageTimber_RepairPatch','Texture_K08_AgedTimber_Source.png',.052,.18,(.84,.73,.62))
woodExposed = refined_wood_material('VillageTimber_ExposedFibre','Texture_K08_AgedTimber_Source.png',.42,1.4,(1.0,.89,.76))
frameLeg = refined_wood_material('VillageTimber_FrameLeg','Texture_K08_AgedTimber_Source.png',.42,1.4,(1.20,1.12,1.0))
woodTouch = refined_wood_material('VillageTimber_HandledEdge','Texture_K08_AgedTimber_Source.png',.6,1.4,(.72,.63,.53))

def corner_transition_material(frontMaterial,endMaterial):
    """Bake a small continuous 2.4 cm corner transition from adjoining wood.

    It samples the actual front and end-grain material coordinates at the
    two boundaries, then derives separate normal and roughness for the arc.
    """
    def image_of(mat,suffix):
        target=mat.name+'_'+suffix
        return next(n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.name==target)
    def sample(image,u,v):
        iw,ih=image.size; pixels=array('f',[0.0])*(iw*ih*4); image.pixels.foreach_get(pixels)
        data=np.frombuffer(pixels,dtype=np.float32).reshape(ih,iw,4)
        x=(u%1)*(iw-1); y=(v%1)*(ih-1)
        x0=np.floor(x).astype(np.int32); y0=np.floor(y).astype(np.int32)
        x1=np.minimum(x0+1,iw-1); y1=np.minimum(y0+1,ih-1)
        tx=(x-x0)[:,:,None]; ty=(y-y0)[:,:,None]
        return ((data[y0,x0,:3]*(1-tx)+data[y0,x1,:3]*tx)*(1-ty)+
                (data[y1,x0,:3]*(1-tx)+data[y1,x1,:3]*tx)*ty)
    w=h=256; yy,xx=np.mgrid[0:h,0:w].astype(np.float32); t=xx/(w-1); z=.781+yy/(h-1)*.065
    angle=t*(math.pi/2); radius=.024; cx=.7-radius; cy=.3-radius
    y=cy+radius*np.sin(angle)
    frontU=(y+z)*2; frontV=cx*1.1+radius*1.1*(1-t)
    endU=y*2+.5; endV=(z-.78)*5+.3
    blend=t*t*(3-2*t)
    front=sample(image_of(frontMaterial,'Base'),frontU,frontV)
    end=sample(image_of(endMaterial,'Base'),endU,endV)
    base=end*(1-blend[:,:,None])+front*blend[:,:,None]
    frontR=sample(image_of(frontMaterial,'Roughness'),frontU,frontV)[:,:,0]
    endR=sample(image_of(endMaterial,'Roughness'),endU,endV)[:,:,0]
    rough=np.clip(endR*(1-blend)+frontR*blend,.65,.98).astype(np.float32)
    lum=base@np.array([.2126,.7152,.0722],dtype=np.float32)
    fy=np.fft.fftfreq(h)[:,None]; fx=np.fft.rfftfreq(w)[None,:]
    filt=np.exp(-2*math.pi**2*2**2*(fx*fx+fy*fy))
    low=np.fft.irfft2(np.fft.rfft2(lum)*filt,s=(h,w)).astype(np.float32)
    height=(lum-low)*.00012; dy,dx=np.gradient(height,.065/h,(radius*math.pi/2)/w)
    normal=np.dstack((-dx,-dy,np.ones_like(dx))); normal/=np.maximum(np.linalg.norm(normal,axis=2,keepdims=True),1e-9)
    normal=(normal*.5+.5).astype(np.float32)
    def packed(label,value,noncolor):
        image=bpy.data.images.new('VillageTimber_RoundedEdge_'+label,width=w,height=h,alpha=True)
        if noncolor: image.colorspace_settings.name='Non-Color'
        if value.ndim==2: value=np.repeat(value[:,:,None],3,axis=2)
        image.pixels.foreach_set(np.concatenate((value.astype(np.float32),np.ones((h,w,1),dtype=np.float32)),axis=2).ravel()); image.pack(); return image
    mat=bpy.data.materials.new('VillageTimber_RoundedEdge');mat.use_nodes=True
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=nodes['Principled BSDF']
    for label,value,socket,noncolor in [('Base',base,'Base Color',False),('Roughness',rough,'Roughness',True)]:
        tex=nodes.new('ShaderNodeTexImage');tex.image=packed(label,value,noncolor);tex.extension='EXTEND';links.new(tex.outputs['Color'],bs.inputs[socket])
    tex=nodes.new('ShaderNodeTexImage');tex.image=packed('Normal',normal,True);tex.extension='EXTEND'
    norm=nodes.new('ShaderNodeNormalMap');links.new(tex.outputs['Color'],norm.inputs['Color']);links.new(norm.outputs['Normal'],bs.inputs['Normal'])
    return mat

woodCorner=corner_transition_material(woodTouch,woodCross)

def refined_iron_material(name, sharpened=False):
    """Worked carbon steel; source2 supplies fine wear rather than thick rust.

    Broad illumination is partially flattened before restrained tonal detail
    is mapped to the effective reflectance of the continuous aged surface.
    Only the sharpened edge represents exposed, uncoated steel.
    """
    path=MATERIAL_SOURCES/'Texture_K08_ForgedIron_Source2.png'
    if not path.is_file(): raise FileNotFoundError('Missing material source '+str(path))
    source=bpy.data.images.load(str(path),check_existing=True)
    sourceW,sourceH=source.size
    ratio=min(1,1024/max(sourceW,sourceH));w,h=round(sourceW*ratio),round(sourceH*ratio)
    resized=source.copy();resized.scale(w,h)
    values=array('f',[0.0])*(w*h*4);resized.pixels.foreach_get(values);bpy.data.images.remove(resized)
    rgb=np.frombuffer(values,dtype=np.float32).reshape(h,w,4)[:,:,:3]
    lum=rgb@np.array([.2126,.7152,.0722],dtype=np.float32)
    fy=np.fft.fftfreq(h)[:,None];fx=np.fft.rfftfreq(w)[None,:]
    def Filter(data,sigmaX,sigmaY=None):
        sigmaY=sigmaX if sigmaY is None else sigmaY
        weight=np.exp(-2*math.pi**2*((sigmaX*fx)**2+(sigmaY*fy)**2))
        return np.fft.irfft2(np.fft.rfft2(data)*weight,s=(h,w)).astype(np.float32)
    def SmoothRange(data,low,high):
        t=np.clip((data-low)/max(high-low,1e-6),0,1)
        return t*t*(3-2*t)
    def EncodeSrgb(data):
        data=np.clip(data,0,1)
        return np.where(data<=.0031308,data*12.92,1.055*np.power(data,1/2.4)-.055).astype(np.float32)
    small=Filter(lum,1.7);medium=Filter(lum,7);broad=Filter(lum,30)
    fine=lum-small;pits=small-medium
    warmth=Filter((rgb[:,:,0]-rgb[:,:,1])/(lum+.03),1.1)
    rust=SmoothRange(warmth,.12,.28)
    steel=np.dstack([np.full_like(lum,.46),np.full_like(lum,.48),np.full_like(lum,.49)])
    if sharpened:
        # UV V now runs from the thin apex (0) to the grind shoulder (1).
        # Residual patina fades into the body at the shoulder instead of
        # outlining the entire lower blade with a uniformly bright stripe.
        vRows=(np.arange(h,dtype=np.float32)+.5)[:,None]/h
        profile=Filter(lum,25).mean(axis=0)
        irregular=np.clip((profile-np.mean(profile))/max(float(np.std(profile)),1e-6),-1.6,1.6)
        shoulderPatina=SmoothRange(vRows+.035*irregular[None,:],.40,.99)
        grinding=Filter(lum,1.1,36)-Filter(lum,18)
        grindTone=np.clip(grinding*.25,-.018,.018)
        linearBase=steel*(.94-.62*shoulderPatina[:,:,None])*(1+grindTone[:,:,None])
        metal=.985-.07*shoulderPatina-.05*rust
        rough=np.clip(.36+.15*shoulderPatina+.025*rust+np.clip(-grinding*.35,-.025,.035),.33,.56)
        height=grinding*.000080+fine*.000001
    else:
        # Keep source-shaped scratches and mottling at restrained contrast.
        # Partial flat-field correction removes large photographic lighting
        # gradients without erasing the actual worked surface into black paint.
        detail=Filter(lum,.65)
        median=max(float(np.median(detail)),1e-5)
        illumination=np.maximum(Filter(detail,80),median*.30)
        tone=.5*np.power(np.maximum(detail,median*.1)/median,.65)
        tone+=.5*np.power(np.maximum(detail,median*.1)/illumination,.45)
        tone=np.clip(tone,.70,1.42)
        color=np.stack([Filter(rgb[:,:,i],.7) for i in range(3)],axis=2)
        colorLum=np.maximum(color@np.array([.2126,.7152,.0722],dtype=np.float32),median*.12)
        chroma=np.clip(color/colorLum[:,:,None],.76,1.28)
        chroma=1+.65*(chroma-1)
        aged=np.dstack([np.full_like(lum,.115),np.full_like(lum,.119),np.full_like(lum,.121)])
        linearBase=aged*tone[:,:,None]*chroma
        metal=.97-.94*rust
        rough=np.clip(.50+.12*rust+np.clip(-pits*.65,-.045,.055),.43,.76)
        height=fine*.000070+pits*.00015+(medium-broad)*.00070
        # Discontinuous work wear just above the ground edge changes the
        # response of existing marks; it is not painted as a pale stripe.
        vRows=(np.arange(h,dtype=np.float32)+.5)[:,None]/h
        nearEdge=np.exp(-.5*((vRows-.075)/.038)**2)
        wear=nearEdge*SmoothRange(Filter(lum,4,11),*np.percentile(lum,[53,86]))
        rough=np.clip(rough-.075*wear,.39,.76)
        height+=fine*.000025*wear
    dy,dx=np.gradient(height,(.006 if sharpened else .22)/h,(.25 if sharpened else .29)/w)
    normal=np.dstack((-dx,-dy,np.ones_like(dx)))
    normal/=np.maximum(np.linalg.norm(normal,axis=2,keepdims=True),1e-9)
    normal=(normal*.5+.5).astype(np.float32)
    def Packed(label,data,noncolor):
        image=bpy.data.images.new(name+'_'+label,width=w,height=h,alpha=True)
        if noncolor:image.colorspace_settings.name='Non-Color'
        if data.ndim==2:data=np.repeat(data[:,:,None],3,axis=2)
        rgba=np.concatenate((data.astype(np.float32),np.ones((h,w,1),dtype=np.float32)),axis=2)
        image.pixels.foreach_set(rgba.ravel());image.pack();return image
    baseImage=Packed('Base',EncodeSrgb(linearBase),False)
    normalImage=Packed('Normal',normal,True)
    mrImage=Packed('MetallicRoughness',np.dstack((np.ones_like(rough),rough,metal)),True)
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=nodes['Principled BSDF']
    tex=nodes.new('ShaderNodeTexImage');tex.image=baseImage
    if sharpened:tex.extension='EXTEND'
    links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    tex=nodes.new('ShaderNodeTexImage');tex.image=mrImage
    if sharpened:tex.extension='EXTEND'
    split=nodes.new('ShaderNodeSeparateColor');links.new(tex.outputs['Color'],split.inputs['Color'])
    links.new(split.outputs['Green'],bs.inputs['Roughness']);links.new(split.outputs['Blue'],bs.inputs['Metallic'])
    tex=nodes.new('ShaderNodeTexImage');tex.image=normalImage
    if sharpened:tex.extension='EXTEND'
    normalNode=nodes.new('ShaderNodeNormalMap');links.new(tex.outputs['Color'],normalNode.inputs['Color'])
    links.new(normalNode.outputs['Normal'],bs.inputs['Normal'])
    return mat
iron=refined_iron_material('HandForgedIron_Oxidised')
edge=refined_iron_material('HandForgedIron_CuttingEdge',True)

def root(name):
    ob = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(ob)
    ob.empty_display_type = 'PLAIN_AXES'
    ob['origin'] = 'bottom centre; Blender Z up; glTF Y up; front glTF -Z'
    return ob

def parent(ob, rootOb, mat):
    ob.parent = rootOb
    if mat:
        ob.data.materials.append(mat)
    return ob

def bevel(ob, amount=.003, segments=2):
    mod = ob.modifiers.new('WornEdges', 'BEVEL')
    mod.width = amount
    mod.segments = segments
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob

def project_timber_uv(ob, size):
    """Project final faces; grain runs lengthwise, end faces use both cross axes."""
    data=ob.data
    data.update()
    uv=data.uv_layers.active or data.uv_layers.new(name='UVMap')
    longAxis=max(range(3),key=lambda n:size[n])
    basis=[Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1))]
    offsetSeed=(sum(ord(c) for c in ob.name)*.137+abs(ob.location.x)*3.17+abs(ob.location.y)*5.11+ob.location.z*2.53)%1
    uCenter=.18+.64*offsetSeed
    for poly in data.polygons:
        normalAxis=max(range(3),key=lambda n:abs(poly.normal[n]))
        if normalAxis==longAxis:
            uAxis,vAxis=[n for n in range(3) if n!=normalAxis]
            uScale=vScale=1/.42
        else:
            uAxis=next(n for n in range(3) if n not in (longAxis,normalAxis))
            vAxis=longAxis
            uScale,vScale=1/.42,1/1.4
        # Keep the UV basis consistently handed for tangent-space normal maps.
        handed=1 if basis[uAxis].cross(basis[vAxis]).dot(poly.normal)>=0 else -1
        for li in poly.loop_indices:
            point=data.vertices[data.loops[li].vertex_index].co
            uv.data[li].uv=(uCenter+handed*point[uAxis]*uScale,.5+point[vAxis]*vScale)

def cube(name, center, size, mat, rootOb, amount=.003):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    ob = bpy.context.object
    ob.name = name
    ob.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    parent(ob, rootOb, mat)
    if amount:
        bevel(ob, amount)
    if mat and mat.name.startswith('VillageTimber'):
        project_timber_uv(ob,size)
        longAxis=max(range(3),key=lambda n:size[n])
        ob.data.materials.append(woodCross)
        for face in ob.data.polygons:
            if abs(face.normal[longAxis])>.8: face.material_index=len(ob.data.materials)-1
    return ob

def beam(name, a, b, width, depth, mat, rootOb):
    a, b = Vector(a), Vector(b)
    ob = cube(name, (a + b) * .5, (width, depth, (b-a).length), mat, rootOb, .003)
    if name == 'TrestleLeg':
        # Disturb the actual edge silhouette instead of relying only on texture.
        bm=bmesh.new(); bm.from_mesh(ob.data)
        bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=1,use_grid_fill=True)
        longEdges=[e for e in bm.edges if abs(e.verts[0].co.z-e.verts[1].co.z)>.20]
        bmesh.ops.subdivide_edges(bm,edges=longEdges,cuts=2,use_grid_fill=True)
        for vert in bm.verts:
            z=vert.co.z
            vert.co.x += .0025*math.sin(z*39 + a.x*31 + a.y*7)+.0007*math.sin(z*91+a.y*13)
            vert.co.y += .0028*math.sin(z*31 + a.x*19 - a.y*11)+.0007*math.sin(z*83-a.x*11)
            if z<-.43*(b-a).length and abs(vert.co.x)>width*.42:
                # Small softened foot-corner loss, without moving the floor.
                vert.co.x-=math.copysign(.0015*(.5+.5*math.sin(vert.co.y*91)),vert.co.x)
        bm.to_mesh(ob.data); bm.free(); ob.data.update()
        project_timber_uv(ob,(width,depth,(b-a).length))
        # One continuous leg material carries local foot dirt and joint wear.
        ob.data.materials.append(frameLeg); legMaterial=len(ob.data.materials)-1
        for face in ob.data.polygons:
            if abs(face.normal.z)>.8: continue
            face.material_index=legMaterial
    ob.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return ob

def cylinder(name, center, radius, depth, mat, rootOb, axis='Z', vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=center)
    ob = bpy.context.object
    ob.name = name
    if axis == 'X': ob.rotation_euler[1] = math.pi / 2
    if axis == 'Y': ob.rotation_euler[0] = math.pi / 2
    parent(ob, rootOb, mat)
    # The shallow wood pegs must retain a real sidewall after beveling.
    bevel(ob, min(.0002, depth*.1), 2)
    if mat and mat.name.startswith('VillageTimber') and name!='RepairWoodPeg':
        ob.data.materials.append(woodCross)
        for poly in ob.data.polygons:
            if abs(poly.normal.z)>.8: poly.material_index=len(ob.data.materials)-1
    return ob

def mesh(name, verts, faces, mat, rootOb, uvs='PLANAR'):
    data = bpy.data.meshes.new(name + '_Mesh')
    data.from_pydata(verts, [], faces)
    data.update()
    ob = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(ob)
    parent(ob, rootOb, mat)
    uv = data.uv_layers.new(name='UVMap')
    for polygon in data.polygons:
        for i in polygon.loop_indices:
            v = data.vertices[data.loops[i].vertex_index].co
            uv.data[i].uv = ((v.y + v.z) * 2.0, v.x * 1.1)
    return ob

table = root('ChoppingTable_Intact')
table['target_envelope_m'] = '1.4 x 0.6 x 0.85; width x depth x height'
# Two planks. Top is a genuine triangulated surface; narrow shallow cuts
# are depressed vertices rather than lines floating over a flat slab.
def cut_outline(plank,outline,bottom,label):
    n=len(outline)
    vertices=[(px,py,z) for z in (bottom,.852) for px,py in outline]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    for i in range(n):
        j=(i+1)%n
        faces.append((i,j,j+n,i+n))
    # Boolean cuts are transactional: a failed intersecting cut must never
    # silently delete a board or leave it open.
    backup=plank.data.copy()
    data=bpy.data.meshes.new('CutterMesh'); data.from_pydata(vertices,[],faces); data.update()
    cutter=bpy.data.objects.new('Cutter',data); bpy.context.collection.objects.link(cutter)
    mod=plank.modifiers.new(label,'BOOLEAN'); mod.operation='DIFFERENCE'; mod.object=cutter
    bpy.context.view_layer.objects.active=plank
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
        plank.data.validate(verbose=False,clean_customdata=False)
        bm=bmesh.new(); bm.from_mesh(plank.data)
        valid=len(bm.faces)>50 and all(e.is_manifold for e in bm.edges) and abs(bm.calc_volume())>.001
        bm.free()
    except Exception:
        valid=False
        if mod.name in plank.modifiers: plank.modifiers.remove(mod)
    bpy.data.objects.remove(cutter,do_unlink=True)
    if not valid:
        damaged=plank.data; plank.data=backup
        if damaged.users==0: bpy.data.meshes.remove(damaged)
        return False
    if backup.users==0: bpy.data.meshes.remove(backup)
    return True

def incision(plank,x,y,length,width,angle,bottom,label):
    # A shallow diamond-section cut has tapered tips; it is real recessed mesh.
    dx,dy=math.cos(angle),math.sin(angle)
    side=(-dy,dx)
    outline=[(x-dx*length*.5,y-dy*length*.5),
             (x+side[0]*width*.5,y+side[1]*width*.5),
             (x+dx*length*.5,y+dy*length*.5),
             (x-side[0]*width*.5,y-side[1]*width*.5)]
    return cut_outline(plank,outline,bottom,label)

def unite_fibre(plank,x,y,length,width):
    """Union a fine raised splinter into the board; it is not a loose prop."""
    base=.8425; peak=.8455
    verts=[(x,y,base),(x+length,y,base),(x+length*.78,y+width,base),(x+length*.43,y+width*.55,peak)]
    faces=[(0,2,1),(0,1,3),(1,2,3),(2,0,3)]
    backup=plank.data.copy(); data=bpy.data.meshes.new('FibreUnionMesh'); data.from_pydata(verts,[],faces); data.update()
    fibre=bpy.data.objects.new('FibreUnion',data); bpy.context.collection.objects.link(fibre)
    modifier=plank.modifiers.new('RootedFibre','BOOLEAN'); modifier.operation='UNION'; modifier.object=fibre
    bpy.context.view_layer.objects.active=plank
    try:
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        plank.data.validate(verbose=False,clean_customdata=False)
        bm=bmesh.new(); bm.from_mesh(plank.data)
        valid=len(bm.faces)>50 and all(e.is_manifold for e in bm.edges) and abs(bm.calc_volume())>.001
        bm.free()
    except Exception:
        valid=False
    bpy.data.objects.remove(fibre,do_unlink=True)
    if not valid:
        damaged=plank.data; plank.data=backup
        if damaged.users==0: bpy.data.meshes.remove(damaged)
        return False
    if backup.users==0: bpy.data.meshes.remove(backup)
    return True

for board in range(2):
    y0 = -.3 + board * .3 + (0 if board == 0 else .003)
    y1 = -.3 + (board + 1) * .3 - (0 if board == 1 else .003)
    # Extra end samples let the worn end roll down over a few centimetres
    # rather than making one long, artificial bevel across a whole grid cell.
    xPositions=sorted(set([-.7+1.4*i/16 for i in range(17)]+[.675,.688,.695]))
    nx, ny = len(xPositions)-1, 6
    verts = []; bottomXY=[]
    cuts = [(-.51, .035, .004), (-.19, .065, .0035), (.22, .105, .0045), (.47, .15, .003)]
    for j in range(ny+1):
        for i in range(nx+1):
            originalX=xPositions[i]; x=originalX
            y = y0 + (y1-y0)*j/ny
            if j in (0,ny) and i not in (0,nx):
                y += .0020*math.sin(i*1.17+board*2)
                y=max(-.3,min(.3,y))
            z = .846 - board*.0012 - (.0025 if i in (0,nx) or j in (0,ny) else 0)
            z -= .0012*(.5+.5*math.sin(i*.59+j*.85+board))
            if x>.675 and abs(y)>.20:
                along=np.clip((x-.675)/.025,0,1)
                towardCorner=np.clip((abs(y)-.20)/.10,0,1)
                z-=(.0045 if board==0 else .0070)*along*towardCorner
            if originalX>.675:
                # A shallow, unevenly hand-worn upper end edge; the bottom
                # stays full size so this does not shrink the 1.4 m envelope.
                along=np.clip((originalX-.675)/.025,0,1)
                contact=.65+.35*math.exp(-((y-.20)/.085)**2)
                x-=.012*along*contact
            for cx, cy, dep in cuts:
                if abs(x-cx) < .024 and abs((y-y0)-cy) < .045:
                    z -= dep * (1-abs(x-cx)/.024) * (1-abs((y-y0)-cy)/.045)
            verts.append((x,y,z)); bottomXY.append((originalX,y))
    faces=[]
    row=nx+1
    for j in range(ny):
        for i in range(nx):
            a=j*row+i
            faces.append((a,a+1,a+1+row,a+row))
    # Match every top boundary vertex with a bottom vertex so the slab is
    # watertight before any boolean cuts (no giant warped edge n-gons).
    offset=len(verts)
    verts.extend([(x,y,.781) for x,y in bottomXY])
    for j in range(ny):
        for i in range(nx):
            a=j*row+i
            faces.append((offset+a,offset+a+row,offset+a+row+1,offset+a+1))
    for i in range(nx):
        a=i; b=i+1
        faces.append((b,a,offset+a,offset+b))
        a=ny*row+i; b=a+1
        faces.append((a,b,offset+b,offset+a))
    for j in range(ny):
        a=j*row; b=(j+1)*row
        faces.append((a,b,offset+b,offset+a))
        a=j*row+nx; b=(j+1)*row+nx
        faces.append((b,a,offset+a,offset+b))
    plank=mesh('TopPlank_%02d'%board,verts,faces,woodTop,table)
    if board==1:
        # One physical, tapered and forked split follows the grain inside the
        # 0.36 m inspection area. Its branch is part of one closed cutter.
        x,y=-.16,.055
        split=[(-.055,0),(-.048,-.0018),(-.038,-.0038),(-.027,-.0022),(-.016,-.0032),
               (-.004,-.0018),(.009,-.0004),(.020,-.0012),(.034,.0004),(.047,.0010),(.055,.0020),
               (.047,.0028),(.034,.0016),(.022,.0016),(.041,.018),(.040,.020),(.012,.0028),
               (.009,.0012),(-.004,.0006),(-.016,-.0016),(-.027,.0002),(-.038,-.0016),(-.048,.0006)]
        if not cut_outline(plank,[(x+dx,y+dy) for dx,dy in split],.842,'ForkedWorkSplit'):
            raise RuntimeError('Forked work-area split did not preserve the board')
        for i,(fx,fy) in enumerate([(-.219,.057),(-.127,.052),(-.142,.067)]):
            if not unite_fibre(plank,fx,fy,.016+i*.002,.0015+i*.0003):
                raise RuntimeError('Could not connect raised fibre %d to the board' % i)
    # Small real recesses cut into the wood, with irregular positions and widths.
    cutRng = random.Random(104+board)
    # Rejection sampling spaces real grooves without a regular decorative grid
    # and avoids intersecting cuts that could tear the mesh.
    accepted=0; positions=[]
    for attempt in range(300):
        if accepted==24: break
        xpos = cutRng.uniform(-.53,.53)
        ypos = cutRng.uniform(y0+.035,y1-.035)
        if any(((xpos-x)/.075)**2+((ypos-y)/.035)**2<1 for x,y in positions): continue
        if board==1 and -.25<xpos<-.07 and .025<ypos<.10: continue
        if board==1 and xpos<-.22 and abs(ypos-.205)<.035: continue
        if incision(plank,xpos,ypos,cutRng.uniform(.018,.050),cutRng.uniform(.0025,.0045),
                    math.pi*.5+cutRng.uniform(-.45,.45),.8427,'IncisedCut'):
            accepted+=1; positions.append((xpos,ypos))
    if accepted!=24: raise RuntimeError('Could not produce 24 valid spaced incisions on board %d (accepted %d)' % (board,accepted))
    # The repair cleat crosses an actual long split; a short fork breaks away.
    if board == 1:
        for index in range(8):
            if not incision(plank,-.27-index*.048,.205+math.sin(index*1.3)*.001,
                            .056,.0025,-.03*math.sin(index*1.3),.840,'RepairedSplit'):
                raise RuntimeError('Repair split failed on board %d' % board)
        if not incision(plank,-.305,.196,.075,.0015,.25,.841,'SplitFork'):
            raise RuntimeError('Repair split fork failed on board %d' % board)
    # A handful of small actual chips interrupt exposed, long outer edges.
    outside=y0 if board==0 else y1
    for i,x in enumerate((-.51,.14,.53)):
        if not incision(plank,x,outside,.026+i*.006,.009,(-.08+i*.07),.835,'WornEdgeChip'):
            raise RuntimeError('Edge chip failed on board %d' % board)
    for cornerX in (-.697,.697):
        if board==1 and cornerX>0: continue
        if not incision(plank,cornerX,outside,.016,.008,.78,.833,'WornCornerChip'):
            raise RuntimeError('Corner chip failed on board %d' % board)
    if board==1:
        # One visible front corner has a hand-worn, slightly irregular round
        # outline; the other corners keep different small chips, not a CAD fillet.
        radius=.024; cx=.7-radius; cy=.3-radius; pad=.025
        wornCorner=[(cx+radius,cy),(.7+pad,cy),(.7+pad,.3+pad),(cx,.3+pad),(cx,cy+radius)]
        for k in range(1,9):
            theta=(math.pi/2)*(1-k/9)
            r=radius+.0008*math.sin(theta*5)
            wornCorner.append((cx+r*math.cos(theta),cy+r*math.sin(theta)))
        if not cut_outline(plank,wornCorner,.780,'HandWornFrontCorner'):
            raise RuntimeError('Worn front corner did not preserve the board')
        # One modest chipped fibre interrupts the otherwise smooth arc.
        if not incision(plank,.693,.293,.012,.005,-.35,.839,'FrontCornerFibreChip'):
            raise RuntimeError('Front corner fibre chip did not preserve the board')
        if not incision(plank,.60,outside,.035,.012,.035,.837,'FrontEdgeNick'):
            raise RuntimeError('Front edge nick did not preserve the board')
    # Repair tiny duplicate elements created by intersecting cuts and require
    # the final, actual exported slab to be a closed two-manifold mesh.
    plank.data.validate(verbose=True,clean_customdata=False)
    bm=bmesh.new(); bm.from_mesh(plank.data)
    broken=sum(1 for edge in bm.edges if not edge.is_manifold)
    bm.free()
    if broken or len(plank.data.polygons)<50: raise RuntimeError('%s has invalid geometry: %d non-manifold edges' % (plank.name,broken))
    # End-grain and darkened handled edges use the same existing timber source,
    # with distinct mapping and roughness. Crevice walls are dirt-darkened.
    # Booleans can insert empty cutter-material slots. Replace the complete
    # slot list so no exported primitive silently receives the white default.
    plank.data.materials.clear()
    plank.data.materials.append(woodTop)
    plank.data.materials.append(woodEnd)
    plank.data.materials.append(woodTouch)
    plank.data.materials.append(woodCross)
    plank.data.materials.append(woodExposed)
    plank.data.materials.append(woodCorner)
    for face in plank.data.polygons:
        c=face.center
        face.material_index=0
        isFibre=(board==1 and c.z>.84455 and any(fx-.001<c.x<fx+.021 and fy-.001<c.y<fy+.004 for fx,fy in [(-.219,.057),(-.127,.052),(-.142,.067)]))
        if isFibre:
            face.material_index=4
            normalAxis=max(range(3),key=lambda n:abs(face.normal[n]))
            uAxis,vAxis={0:(1,2),1:(2,0),2:(1,0)}[normalAxis]
            basis=[Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1))]
            handed=1 if basis[uAxis].cross(basis[vAxis]).dot(face.normal)>=0 else -1
            for li in face.loop_indices:
                point=plank.data.vertices[plank.data.loops[li].vertex_index].co
                plank.data.uv_layers.active.data[li].uv=(.5+handed*point[uAxis]/.42,.5+point[vAxis]/1.4)
        elif face.normal.z>.7:
            # Only tiny recess floors receive dark ingrained material. Large
            # edge triangles can be slightly lower too; assigning them caused
            # unnatural rectangular stains at the board perimeter.
            if c.z<.8435 and face.area<.00015 and abs(c.y)<.28: face.material_index=1
            # One atlas covers the full worktop once, with no repeated boards.
            for li in face.loop_indices:
                point=plank.data.vertices[plank.data.loops[li].vertex_index].co
                plank.data.uv_layers.active.data[li].uv=((point.y+.3)/.6,(point.x+.7)/1.4)
        elif board==1 and c.x>.672 and c.y>.272 and abs(face.normal.z)<.7:
            # Continuous arc unwrap on the one hand-rounded front corner;
            # do not switch abruptly between end-grain and long-grain slots.
            face.material_index=5
            cx=.7-.024; cy=.3-.024
            for li in face.loop_indices:
                point=plank.data.vertices[plank.data.loops[li].vertex_index].co
                angle=math.atan2(max(0,point.y-cy),max(0,point.x-cx))
                plank.data.uv_layers.active.data[li].uv=(angle/(math.pi/2),(point.z-.781)/.065)
        elif abs(face.normal.x)>.75 and abs(c.x)>.68:
            face.material_index=3
            for li in face.loop_indices:
                point=plank.data.vertices[plank.data.loops[li].vertex_index].co
                plank.data.uv_layers.active.data[li].uv=(point.y*2+.5,(point.z-.78)*5+.3)
        elif abs(c.y)>.283 and c.z>.83 and math.sin(c.x*11+board)>-.45:
            face.material_index=2
        elif board==1 and -.23<c.x<-.09 and .050<c.y<.083 and .840<c.z<.845 and abs(face.normal.z)<.65:
            face.material_index=4
            normalAxis=max(range(3),key=lambda n:abs(face.normal[n]))
            uAxis,vAxis={0:(1,2),1:(2,0),2:(1,0)}[normalAxis]
            basis=[Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1))]
            handed=1 if basis[uAxis].cross(basis[vAxis]).dot(face.normal)>=0 else -1
            for li in face.loop_indices:
                point=plank.data.vertices[plank.data.loops[li].vertex_index].co
                plank.data.uv_layers.active.data[li].uv=(.5+handed*point[uAxis]/.42,.5+point[vAxis]/1.4)
        elif .839<c.z<.8445 and abs(face.normal.z)<.65 and abs(c.y)<.29:
            face.material_index=1
    # Union/boolean-created internal faces can have an empty UV island. Project
    # only collapsed faces by their dominant normal; retain authored top UVs.
    uv=plank.data.uv_layers.active
    basis=[Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1))]
    for face in plank.data.polygons:
        points=[uv.data[i].uv for i in face.loop_indices]
        signed=sum(points[i].x*points[(i+1)%len(points)].y-points[(i+1)%len(points)].x*points[i].y for i in range(len(points)))
        if abs(signed)>1e-12: continue
        normalAxis=max(range(3),key=lambda n:abs(face.normal[n]))
        uAxis,vAxis={0:(1,2),1:(2,0),2:(1,0)}[normalAxis]
        handed=1 if basis[uAxis].cross(basis[vAxis]).dot(face.normal)>=0 else -1
        for li in face.loop_indices:
            point=plank.data.vertices[plank.data.loops[li].vertex_index].co
            uv.data[li].uv=(.5+handed*point[uAxis]/.6,.5+point[vAxis]/1.4)

# A recessed dark timber spline closes the seam, avoiding a bright crack to air.
cube('BoardSeamRecess',(0,0,.832),(1.4,.0058,.012),woodEnd,table,.0002)
# Two trestles, splayed outwards in depth, identical height and support points.
for x in (-.54, .54):
    for sign in (-1,1):
        sx=1 if x>0 else -1
        beam('TrestleLeg', (x+sx*.018,sign*.245,.0025), (x-sx*.012,sign*.195,.781), .075,.075,wood,table)
    cube('TrestleTopRail',(x,0,.755),(.095,.45,.065),woodEnd,table)
    cube('TrestleLowerRail',(x,0,.215),(.065,.47,.058),wood,table)
# Long front and rear braces and apron, with real joints and wooden pegs.
cube('LongStretcher',(0,0,.22),(1.10,.05,.06),woodEnd,table)
for y in (-.18,.18):
    cube('UpperApron',(0,y,.715),(1.07,.045,.09),wood,table)
    for x in (-.54,.54):
        cylinder('WoodenJointPeg',(x,y-.028,.22),.007,.009,woodEnd,table,'Y')
# Small flush wood pegs mark the upper mortise shoulders on the visible side.
for x,y in [(-.54,.235),(.54,.237)]: cylinder('UpperJointPeg',(x,y,.725),.0055,.004,woodEnd,table,'Y')
# Repaired split uses a real thin wood cleat and wooden dowels, not screws.
patchOutline=[(-.090,-.023),(-.071,-.026),(-.041,-.024),(-.008,-.026),(.026,-.023),(.057,-.026),(.087,-.024),
              (.090,.021),(.073,.025),(.043,.023),(.010,.026),(-.023,.023),(-.057,.026),(-.088,.024)]
count=len(patchOutline); patchVerts=[]
for layer in range(3):
    for index,(x,y) in enumerate(patchOutline):
        inset=.97 if layer==2 else 1
        z=(.8428,.8473,.8488)[layer]
        if layer==2: z-=.00045*(.5+.5*math.sin(index*1.71))
        patchVerts.append((-.48+x*inset,.205+y*inset,z))
patchFaces=[tuple(reversed(range(count))),tuple(range(count*2,count*3))]
for layer in range(2):
    for i in range(count):
        a=layer*count+i; b=layer*count+(i+1)%count
        patchFaces.append((a,b,b+count,a+count))
cleat=mesh('RepairCleat',patchVerts,patchFaces,woodPatch,table)
cleat.data.materials.append(woodCross)
project_timber_uv(cleat,(.18,.052,.006))
for face in cleat.data.polygons:
    if abs(face.normal.x)>.8: face.material_index=1
    if face.normal.z>.7:
        for li in face.loop_indices:
            point=cleat.data.vertices[cleat.data.loops[li].vertex_index].co
            cleat.data.uv_layers.active.data[li].uv=((point.y-.205+.026)/.052,(point.x+.48+.09)/.18)
for x in (-.415,-.545): cylinder('RepairWoodPeg',(x,.205,.8483),.005,.002,woodEnd,table)

cleaver = root('KitchenCleaver_Intact')
def BladeEdgeHeight(x):
    u=max(0,min(1,(x+.235)/.25))
    toeRadius=.004
    toeDistance=min(0,x+.231)
    toe=toeRadius-math.sqrt(max(0,toeRadius*toeRadius-toeDistance*toeDistance)) if x<-.231 else 0
    return .0052+toe+.0005*u**5
def BladeGroundWidth(u):
    return .0047+.0011*math.sin(math.pi*.9*u+.20)+.00035*math.sin(math.pi*2*u+1)
# A closed real grind: broad primary taper, a slightly steeper secondary face,
# and an 80 micrometre apex. Dense toe samples give the worn lower corner a
# smooth radius; the rest of the cutting line has a restrained continuous belly.
v=[];f=[];edgeFaces=[]
oldU=np.linspace(0,1,8)
oldTop=[.13-.0013*math.sin(i*1.7) for i in range(8)]
oldShoulder=[.021+.002*math.sin(i*1.1) for i in range(8)]
bladeSections=sorted({round(x,9) for x in ([-.235,-.2348,-.2344,-.2338,-.2328,-.231]+
                         [-.231+.246*i/20 for i in range(21)]+
                         [-.235+.25*i/7 for i in range(8)])})
for x in bladeSections:
    u=max(0,min(1,(x+.235)/.25))
    top=float(np.interp(u,oldU,oldTop));shoulder=float(np.interp(u,oldU,oldShoulder))
    bottom=BladeEdgeHeight(x)
    bevelEnd=bottom+BladeGroundWidth(u)
    bevelHalfWidth=.00145+.00008*math.cos(u*math.pi*1.4)
    v.extend([(x,-.003,top),(x,.003,top),(x,-.003,shoulder),(x,.003,shoulder),
              (x,-bevelHalfWidth,bevelEnd),(x,bevelHalfWidth,bevelEnd),(x,-.00004,bottom),(x,.00004,bottom)])
for i in range(len(bladeSections)-1):
    a=i*8; b=(i+1)*8
    f.extend([(a,a+1,b+1,b),(a,b,b+2,a+2),(a+1,a+3,b+3,b+1)])
    f.extend([(a+2,b+2,b+4,a+4),(a+3,a+5,b+5,b+3)])
    edgeFaces.extend([len(f),len(f)+1,len(f)+2])
    f.extend([(a+4,b+4,b+6,a+6),(a+5,a+7,b+7,b+5),(a+6,b+6,b+7,a+7)])
last=(len(bladeSections)-1)*8
f.extend([(0,2,4,6,7,5,3,1),tuple(last+i for i in (0,1,3,5,7,6,4,2))])
blade=mesh('ForgedBlade',v,f,iron,cleaver)
blade.data.materials.append(edge)
for poly in blade.data.polygons:
    if poly.index in edgeFaces: poly.material_index=1
# Keep the final softening smaller than the actual thin apex.
bevel(blade,.000012,2)
# The integral iron neck narrows out of the upper heel, then continues inside
# the grip. Union it into the blade so the connection is a single solid.
neckProfile=[(-.004,.099),(.015,.103),(.033,.105),(.120,.106),
             (.120,.116),(.035,.118),(.018,.123),(-.004,.129)]
neckVertices=[(x,y,z) for y in (-.0023,.0023) for x,z in neckProfile]
neckCount=len(neckProfile)
neckFaces=[tuple(range(neckCount)),tuple(reversed(range(neckCount,neckCount*2)))]
neckFaces += [(i,i+neckCount,(i+1)%neckCount+neckCount,(i+1)%neckCount) for i in range(neckCount)]
neck=mesh('IntegralIronNeck',neckVertices,neckFaces,iron,cleaver)
bevel(neck,.00045,2)
bpy.context.view_layer.objects.active=blade
union=blade.modifiers.new('IntegralForgedNeck','BOOLEAN');union.operation='UNION';union.solver='EXACT';union.object=neck
bpy.ops.object.modifier_apply(modifier=union.name)
bpy.data.objects.remove(neck,do_unlink=True)
# Broad blade faces use X/Z. Narrow spine, edge and end faces use the two
# axes perpendicular to their dominant normal; no face projects to a line.
for poly in blade.data.polygons:
    normalAxis=max(range(3),key=lambda n:abs(poly.normal[n]))
    axes={0:(1,2),1:(0,2),2:(0,1)}[normalAxis]
    basis=[Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1))]
    handed=1 if basis[axes[0]].cross(basis[axes[1]]).dot(poly.normal)>=0 else -1
    for li in poly.loop_indices:
        point=blade.data.vertices[blade.data.loops[li].vertex_index].co
        if poly.material_index==1:
            u=max(0,min(1,(point.x+.235)/.25))
            if normalAxis==1:
                # Do not clamp V: tiny bevel-transition faces must retain
                # nondegenerate UV areas; the sampler extends border values.
                uv=((u if handed>0 else 1-u),(point.z-BladeEdgeHeight(point.x))/BladeGroundWidth(u))
            elif normalAxis==2:
                uv=((u if handed>0 else 1-u),.02+point.y/.00008*.04)
            else:
                uv=((.5+handed*point.y*150),point.z*4.5)
            blade.data.uv_layers.active.data[li].uv=uv
        else:
            blade.data.uv_layers.active.data[li].uv=(handed*point[axes[0]]*3.5,point[axes[1]]*4.5)
def lathe(name, rings, centerZ, mat, rootOb, segments=24, radialDepthScale=1.0):
    verts=[]; faces=[]
    for x,r in rings:
        for k in range(segments):
            angle=2*math.pi*k/segments
            verts.append((x, radialDepthScale*r*math.cos(angle), centerZ+r*math.sin(angle)))
    for i in range(len(rings)-1):
        for j in range(segments):
            a=i*segments+j; b=i*segments+(j+1)%segments
            faces.append((a,b,b+segments,a+segments))
    faces.append(tuple(reversed(range(segments))))
    faces.append(tuple((len(rings)-1)*segments+j for j in range(segments)))
    ob=mesh(name,verts,faces,mat,rootOb)
    ob.data.materials.append(woodCross)
    uv=ob.data.uv_layers.active
    for poly in ob.data.polygons:
        cap=len(poly.vertices)==segments
        if cap: poly.material_index=1
        indices=[ob.data.loops[li].vertex_index%segments for li in poly.loop_indices]
        seam=not cap and 0 in indices and segments-1 in indices
        for li in poly.loop_indices:
            vertex=ob.data.loops[li].vertex_index
            if cap:
                x,y,z=verts[vertex]
                radius=rings[0][1] if vertex<segments else rings[-1][1]
                sign=-1 if vertex<segments else 1
                uv.data[li].uv=(.5+sign*.25*y/(radius*radialDepthScale),.5+.25*(z-centerZ)/radius)
            else:
                k=vertex%segments
                vCoord=((verts[vertex][0]-rings[0][0])/(rings[-1][0]-rings[0][0])) if name=='OldWoodHandle' else (verts[vertex][0]+.25)*1.7
                uCoord=(segments if seam and k==0 else k)/segments
                # Put the unwrap seam away from the visible front; preserve the
                # natural grain direction instead of synthetic wavy stripes.
                uCoord+=(.35 if name=='PlainRollingPin' else .28)
                uv.data[li].uv=(uCoord,vCoord)
    for poly in ob.data.polygons: poly.use_smooth = len(poly.vertices)==4
    return ob

rings=[]
for t in [0,.015,.04,.08,.14,.22,.35,.50,.65,.80,.90,.96,1]:
    shoulder=min(1,t/.20);shoulder=shoulder*shoulder*(3-2*shoulder)
    butt=max(0,(t-.85)/.15);butt=butt*butt*(3-2*butt)
    r=(.012+.0065*shoulder)*(1-.12*butt)+.0002*math.sin(t*7)
    rings.append((.028+t*.120,r))
lathe('OldWoodHandle',rings,.1115,woodGrip,cleaver,radialDepthScale=.82)
# Wooden pins traverse the tang and handle.
for x in (.058,.108): cylinder('HandleWoodPin',(x,0,.1115),.0023,.030,wood,cleaver,'Y',12)
# Looking from the specified glTF -Z front, show the blade on the left as in C.
turn=Quaternion((0,0,1),math.pi)
for ob in cleaver.children:
    ob.location=turn @ ob.location
    ob.rotation_euler=(turn @ ob.rotation_euler.to_quaternion()).to_euler()

roller = root('RollingPin_Intact')
rollRings=[]
positions=[-.210,-.209,-.207,-.204,-.200,-.195,-.185]
positions += [-.165+i*.033 for i in range(11)]
positions += [.185,.195,.200,.204,.207,.209,.210]
for x in positions:
    endDistance=min(x+.210,.210-x)
    # A short rounded shoulder and broad end face, not a pencil-shaped cone.
    t=min(1,max(0,endDistance/.015))
    r=(.027+.008*math.sin(t*math.pi/2))*(1+.018*math.sin(x*13+.4))
    rollRings.append((x,r))
lathe('PlainRollingPin',rollRings,.0355,woodRolling,roller)

assets=[table,cleaver,roller]
def descendants(ob):
    result=[ob]
    for child in ob.children: result.extend(descendants(child))
    return result

# Explicit triangulation lets Blender generate MikkTSpace tangents for n-gon
# caps and boolean-cut planks while preserving their per-loop UV coordinates.
for asset in assets:
    for ob in descendants(asset):
        if ob.type!='MESH': continue
        bm=bmesh.new(); bm.from_mesh(ob.data)
        bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY',ngon_method='BEAUTY')
        bm.to_mesh(ob.data); bm.free(); ob.data.update()

def measure(rootOb):
    points=[]; triangles=0; names=set()
    deps=bpy.context.evaluated_depsgraph_get()
    for ob in descendants(rootOb):
        if ob.type!='MESH': continue
        evaluated=ob.evaluated_get(deps)
        m=evaluated.to_mesh()
        m.calc_loop_triangles()
        triangles+=len(m.loop_triangles)
        points.extend([ob.matrix_world @ p.co for p in m.vertices])
        names.update(mat.name for mat in ob.data.materials if mat)
        evaluated.to_mesh_clear()
    low=[min(p[i] for p in points) for i in range(3)]
    high=[max(p[i] for p in points) for i in range(3)]
    return {'bounds_min_blender_m':low,'bounds_max_blender_m':high,
            'dimensions_xyz_m':[high[i]-low[i] for i in range(3)],
            'triangles':triangles,'materials':sorted(names)}

# Centre each asset on its own footprint and put the lowest point on the floor.
bpy.context.view_layer.update()
exportOnly=os.environ.get('K08_EXPORT_ONLY','')
if exportOnly and exportOnly not in {item.name for item in assets}:
    raise RuntimeError('Unknown K08_EXPORT_ONLY '+exportOnly)
for item in assets:
    data=measure(item)
    low,high=data['bounds_min_blender_m'],data['bounds_max_blender_m']
    offset=Vector((-(low[0]+high[0])*.5,-(low[1]+high[1])*.5,-low[2]))
    for ob in item.children: ob.location += offset
bpy.context.view_layer.update()

def repair_exported_tangents(path):
    """Fix invalid MikkTSpace vertices from actual glTF position/UV derivatives.

    Blender occasionally emits a zero or non-orthogonal tangent on tiny bevel
    triangles even when UV areas are nonzero. Recompute those vertices using
    adjacent triangle derivatives and Gram-Schmidt against the exported normal.
    Geometric positions, UVs, materials and already valid tangents are untouched.
    """
    blob=bytearray(path.read_bytes())
    jsonSize=struct.unpack_from('<I',blob,12)[0]
    doc=json.loads(blob[20:20+jsonSize])
    binStart=28+jsonSize
    def values(index):
        accessor=doc['accessors'][index]
        view=doc['bufferViews'][accessor['bufferView']]
        width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[accessor['type']]
        dtype={5121:np.dtype('u1'),5123:np.dtype('<u2'),5125:np.dtype('<u4'),5126:np.dtype('<f4')}[accessor['componentType']]
        offset=binStart+view.get('byteOffset',0)+accessor.get('byteOffset',0)
        stride=view.get('byteStride',dtype.itemsize*width)
        return np.ndarray((accessor['count'],width),dtype=dtype,buffer=blob,offset=offset,strides=(stride,dtype.itemsize))
    fixed=0
    for meshData in doc['meshes']:
        for primitive in meshData['primitives']:
            attr=primitive['attributes']
            if 'TANGENT' not in attr:
                raise RuntimeError('Missing tangent in '+meshData.get('name','mesh'))
            pos=values(attr['POSITION']).astype(np.float64)
            uv=values(attr['TEXCOORD_0']).astype(np.float64)
            normal=values(attr['NORMAL']).astype(np.float64)
            tangent=values(attr['TANGENT'])
            vectors=tangent[:,:3].astype(np.float64)
            lengths=np.linalg.norm(vectors,axis=1)
            dots=np.abs(np.sum(normal*vectors,axis=1))
            bad=(~np.isfinite(vectors).all(axis=1)) | (np.abs(lengths-1)>.001) | (dots>.001)
            if not np.any(bad): continue
            indices=values(primitive['indices']).reshape(-1).astype(np.int64).reshape(-1,3)
            p0,p1,p2=(pos[indices[:,i]] for i in range(3))
            u0,u1,u2=(uv[indices[:,i]] for i in range(3))
            e1,e2=p1-p0,p2-p0; d1,d2=u1-u0,u2-u0
            det=d1[:,0]*d2[:,1]-d1[:,1]*d2[:,0]
            area=np.linalg.norm(np.cross(e1,e2),axis=1)
            valid=(np.abs(det)>1e-18)&(area>1e-18)
            ts=np.zeros_like(e1); bs=np.zeros_like(e1)
            ts[valid]=(e1[valid]*d2[valid,1,None]-e2[valid]*d1[valid,1,None])/det[valid,None]
            bs[valid]=(e2[valid]*d1[valid,0,None]-e1[valid]*d2[valid,0,None])/det[valid,None]
            sums=np.zeros_like(pos); bitans=np.zeros_like(pos)
            for corner in range(3):
                np.add.at(sums,indices[valid,corner],ts[valid]*area[valid,None])
                np.add.at(bitans,indices[valid,corner],bs[valid]*area[valid,None])
            for i in np.flatnonzero(bad):
                n=normal[i]/np.linalg.norm(normal[i]); candidate=sums[i]-n*np.dot(n,sums[i])
                magnitude=np.linalg.norm(candidate)
                if magnitude<1e-16:
                    raise RuntimeError('Cannot reconstruct tangent for %s vertex %d' % (meshData.get('name'),i))
                candidate/=magnitude
                orientation=np.dot(np.cross(n,candidate),bitans[i])
                tangent[i,:3]=candidate
                tangent[i,3]=(-1 if orientation<0 else 1) if abs(orientation)>1e-16 else (-1 if tangent[i,3]<0 else 1)
                fixed+=1
    path.write_bytes(blob)
    print('K08_TANGENT_REPAIRS',path.name,fixed)

def OptimizeStaticGlb(path):
    import copy
    import hashlib
    import json
    import os
    from pathlib import Path
    import struct
    import tempfile
    import numpy as np

    recipeVersion = 'K08StaticGlbV2'
    filePath = Path(path)
    originalBytes = filePath.read_bytes()
    if len(originalBytes) < 28:
        raise ValueError('Truncated GLB')
    magic, version, declaredLength = struct.unpack_from('<III', originalBytes, 0)
    if (magic, version, declaredLength) != (0x46546C67, 2, len(originalBytes)):
        raise ValueError('Expected a complete GLB 2 file')
    jsonLength, jsonType = struct.unpack_from('<II', originalBytes, 12)
    binaryHeader = 20 + jsonLength
    if jsonType != 0x4E4F534A or binaryHeader + 8 > len(originalBytes):
        raise ValueError('Expected JSON followed by BIN')
    binaryLength, binaryType = struct.unpack_from('<II', originalBytes, binaryHeader)
    if binaryType != 0x004E4942 or binaryHeader + 8 + binaryLength != len(originalBytes):
        raise ValueError('Only a JSON and embedded BIN chunk are supported')
    document = json.loads(originalBytes[20:binaryHeader])
    binaryBytes = originalBytes[binaryHeader + 8:]
    allowedTopKeys = {'asset', 'scene', 'scenes', 'nodes', 'meshes', 'materials',
                      'textures', 'images', 'samplers', 'accessors', 'bufferViews',
                      'buffers', 'extras', 'extensionsUsed', 'extensionsRequired'}
    if set(document) - allowedTopKeys:
        raise ValueError('Unsupported top-level GLB semantics: ' + str(set(document) - allowedTopKeys))

    def RejectExtensions(value):
        if isinstance(value, dict):
            if value.get('extensions'):
                raise ValueError('GLB extensions are unsupported by this recipe')
            for key, child in value.items():
                if key != 'extras':
                    RejectExtensions(child)
        elif isinstance(value, list):
            for child in value:
                RejectExtensions(child)

    RejectExtensions(document)
    if document.get('extensionsUsed') or document.get('extensionsRequired'):
        raise ValueError('GLB extensions are unsupported by this recipe')
    if len(document.get('scenes', [])) != 1 or document.get('scene', 0) != 0:
        raise ValueError('Expected one active scene')
    sceneRoots = document['scenes'][0].get('nodes', [])
    if len(sceneRoots) != 1:
        raise ValueError('Expected one independent asset root')
    if len(document.get('buffers', [])) != 1 or 'uri' in document['buffers'][0]:
        raise ValueError('Expected one embedded buffer')
    if document['buffers'][0]['byteLength'] > len(binaryBytes):
        raise ValueError('Truncated embedded buffer')
    nodes = document.get('nodes', [])
    meshes = document.get('meshes', [])
    rootIndex = sceneRoots[0]
    if rootIndex < 0 or rootIndex >= len(nodes) or 'mesh' in nodes[rootIndex]:
        raise ValueError('Expected an empty independent asset root')
    if not nodes[rootIndex].get('name'):
        raise ValueError('Asset root requires a stable name')
    materials = document.get('materials', [])
    if not materials:
        raise ValueError('Material-free assets are unsupported')
    for material in materials:
        if set(material) - {'name', 'pbrMetallicRoughness', 'normalTexture', 'occlusionTexture',
                            'emissiveTexture', 'emissiveFactor', 'alphaMode', 'alphaCutoff',
                            'doubleSided', 'extras'}:
            raise ValueError('Unsupported material semantics')
        if material.get('alphaMode', 'OPAQUE') == 'BLEND':
            raise ValueError('Transparent draw-order semantics cannot be consolidated')
        metallicRoughness = material.get('pbrMetallicRoughness', {})
        if set(metallicRoughness) - {'baseColorFactor', 'baseColorTexture', 'metallicFactor',
                                   'roughnessFactor', 'metallicRoughnessTexture', 'extras'}:
            raise ValueError('Unsupported metallic-roughness semantics')
        textureInfos = [material[key] for key in ['normalTexture', 'occlusionTexture', 'emissiveTexture']
                        if key in material]
        textureInfos += [metallicRoughness[key] for key in ['baseColorTexture', 'metallicRoughnessTexture']
                         if key in metallicRoughness]
        if any(info.get('texCoord', 0) != 0 for info in textureInfos):
            raise ValueError('Only UV0 texture bindings are supported')

    def ReadAccessor(accessorIndex, expectedType=None, expectedComponent=None):
        accessor = document['accessors'][accessorIndex]
        if set(accessor) - {'bufferView', 'byteOffset', 'componentType', 'count', 'type', 'min', 'max', 'normalized', 'name'}:
            raise ValueError('Unsupported accessor semantics')
        if accessor.get('normalized', False) or 'bufferView' not in accessor:
            raise ValueError('Sparse or normalized accessors are unsupported')
        if expectedType is not None and accessor['type'] != expectedType:
            raise ValueError('Unexpected accessor type')
        if expectedComponent is not None and accessor['componentType'] != expectedComponent:
            raise ValueError('Unexpected accessor component type')
        componentTypes = {5121: np.dtype('u1'), 5123: np.dtype('<u2'),
                          5125: np.dtype('<u4'), 5126: np.dtype('<f4')}
        componentCounts = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
        if accessor['componentType'] not in componentTypes or accessor['type'] not in componentCounts:
            raise ValueError('Unsupported accessor storage')
        view = document['bufferViews'][accessor['bufferView']]
        if view.get('buffer', 0) != 0 or 'byteStride' in view:
            raise ValueError('Only tightly packed embedded accessors are supported')
        dtype = componentTypes[accessor['componentType']]
        columns = componentCounts[accessor['type']]
        offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        byteCount = accessor['count'] * columns * dtype.itemsize
        if accessor['count'] <= 0 or offset < 0 or accessor.get('byteOffset', 0) < 0 or accessor.get('byteOffset', 0) + byteCount > view['byteLength'] or offset + byteCount > len(binaryBytes):
            raise ValueError('Accessor exceeds its declared buffer view')
        result = np.frombuffer(binaryBytes, dtype=dtype, count=accessor['count'] * columns,
                               offset=offset).reshape(accessor['count'], columns).copy()
        if not np.all(np.isfinite(result)):
            raise ValueError('Nonfinite accessor')
        return result

    def NodeMatrix(node):
        if set(node) - {'name', 'children', 'mesh', 'translation', 'rotation', 'extras'}:
            raise ValueError('Only rigid translation/rotation nodes are supported')
        translation = np.asarray(node.get('translation', [0, 0, 0]), dtype=np.float64)
        quaternion = np.asarray(node.get('rotation', [0, 0, 0, 1]), dtype=np.float64)
        if translation.shape != (3,) or quaternion.shape != (4,) or not np.all(np.isfinite(translation)) or not np.all(np.isfinite(quaternion)):
            raise ValueError('Invalid rigid transform')
        if abs(float(quaternion @ quaternion) - 1) > 1e-5:
            raise ValueError('Quaternion is not unit length within export precision')
        x, y, z, w = quaternion
        matrix = np.eye(4, dtype=np.float64)
        # Do not renormalize the source quaternion: retain the glTF loader's
        # Matrix4.compose arithmetic, including original float precision.
        matrix[:3, :3] = [[1 - 2 * (y*y + z*z), 2 * (x*y - z*w), 2 * (x*z + y*w)],
                          [2 * (x*y + z*w), 1 - 2 * (x*x + z*z), 2 * (y*z - x*w)],
                          [2 * (x*z - y*w), 2 * (y*z + x*w), 1 - 2 * (x*x + y*y)]]
        matrix[:3, 3] = translation
        if np.linalg.det(matrix[:3, :3]) <= 0:
            raise ValueError('Reflected transforms are unsupported')
        return matrix

    NodeMatrix(nodes[rootIndex])
    groups = {}
    sourceNodes = []
    visited = set()
    sourcePrimitiveCount = 0
    sourceTriangleCount = 0

    def VisitNode(nodeIndex, parentMatrix):
        nonlocal sourcePrimitiveCount, sourceTriangleCount
        if nodeIndex in visited or nodeIndex < 0 or nodeIndex >= len(nodes):
            raise ValueError('Repeated, cyclic, or missing scene node')
        visited.add(nodeIndex)
        node = nodes[nodeIndex]
        relativeMatrix = parentMatrix @ NodeMatrix(node)
        sourceNodes.append({'nodeIndex': nodeIndex, 'name': node.get('name'),
                            'extras': copy.deepcopy(node.get('extras')),
                            'sourceNode': copy.deepcopy(node),
                            'rootRelativeMatrix': relativeMatrix.tolist()})
        if 'mesh' in node:
            mesh = meshes[node['mesh']]
            if set(mesh) - {'name', 'primitives'}:
                raise ValueError('Unsupported mesh semantics')
            for primitive in mesh['primitives']:
                if set(primitive) - {'attributes', 'indices', 'material', 'mode'}:
                    raise ValueError('Unsupported primitive semantics')
                if primitive.get('mode', 4) != 4 or 'indices' not in primitive or 'material' not in primitive:
                    raise ValueError('Only indexed material-assigned TRIANGLES are supported')
                if set(primitive['attributes']) != {'POSITION', 'NORMAL', 'TANGENT', 'TEXCOORD_0'}:
                    raise ValueError('Expected exactly POSITION/NORMAL/TANGENT/TEXCOORD_0')
                materialIndex = primitive['material']
                if materialIndex < 0 or materialIndex >= len(materials):
                    raise ValueError('Invalid material reference')
                attributes = {semantic: ReadAccessor(primitive['attributes'][semantic], dataType, 5126)
                              for semantic, dataType in [('POSITION', 'VEC3'), ('NORMAL', 'VEC3'),
                                                         ('TANGENT', 'VEC4'), ('TEXCOORD_0', 'VEC2')]}
                vertexCount = len(attributes['POSITION'])
                if any(len(values) != vertexCount for values in attributes.values()):
                    raise ValueError('Attribute counts disagree')
                indexAccessor = document['accessors'][primitive['indices']]
                if indexAccessor['componentType'] not in {5121, 5123, 5125}:
                    raise ValueError('Indices require an unsigned integer type')
                indices = ReadAccessor(primitive['indices'], 'SCALAR').reshape(-1).astype(np.uint32)
                if len(indices) % 3 or not len(indices) or int(indices.max()) >= vertexCount:
                    raise ValueError('Invalid triangle indices')
                linear = relativeMatrix[:3, :3]
                attributes['POSITION'] = (attributes['POSITION'].astype(np.float64) @ linear.T + relativeMatrix[:3, 3]).astype('<f4')
                normalMatrix = np.linalg.inv(linear).T
                attributes['NORMAL'] = (attributes['NORMAL'].astype(np.float64) @ normalMatrix.T).astype('<f4')
                tangents = attributes['TANGENT'].copy()
                tangents[:, :3] = (tangents[:, :3].astype(np.float64) @ linear.T).astype('<f4')
                attributes['TANGENT'] = tangents
                group = groups.setdefault(materialIndex, {'attributes': {key: [] for key in attributes},
                                                          'indices': [], 'vertexCount': 0})
                for semantic, values in attributes.items():
                    group['attributes'][semantic].append(values)
                group['indices'].append(indices + group['vertexCount'])
                group['vertexCount'] += vertexCount
                sourcePrimitiveCount += 1
                sourceTriangleCount += len(indices) // 3
        for childIndex in node.get('children', []):
            VisitNode(childIndex, relativeMatrix)

    # The root's transform remains on the preserved root; only descendants are baked.
    visited.add(rootIndex)
    sourceNodes.append({'nodeIndex': rootIndex, 'name': nodes[rootIndex].get('name'),
                        'extras': copy.deepcopy(nodes[rootIndex].get('extras')),
                        'sourceNode': copy.deepcopy(nodes[rootIndex]), 'preservedRoot': True})
    for childIndex in nodes[rootIndex].get('children', []):
        VisitNode(childIndex, np.eye(4, dtype=np.float64))
    if visited != set(range(len(nodes))) or not groups:
        raise ValueError('Expected all nodes to belong to the one asset root')

    output = copy.deepcopy(document)
    operationalSceneMetadata = []
    for sceneIndex, sceneInfo in enumerate(output['scenes']):
        extras = sceneInfo.get('extras', {})
        if 'BlenderMcpTask' in extras:
            operationalSceneMetadata.append({'scene': sceneIndex, 'key': 'BlenderMcpTask',
                                             'value': extras.pop('BlenderMcpTask')})
        if not extras:
            sceneInfo.pop('extras', None)
    output.pop('extensionsUsed', None)
    output.pop('extensionsRequired', None)
    output['accessors'] = []
    output['bufferViews'] = []
    output['buffers'] = [{'byteLength': 0}]
    newBinary = bytearray()

    def AddBufferView(payload, target=None):
        while len(newBinary) % 4:
            newBinary.append(0)
        result = {'buffer': 0, 'byteOffset': len(newBinary), 'byteLength': len(payload)}
        if target is not None:
            result['target'] = target
        viewIndex = len(output['bufferViews'])
        output['bufferViews'].append(result)
        newBinary.extend(payload)
        return viewIndex

    def AddAccessor(values, componentType, dataType, target, bounds=False):
        accessor = {'bufferView': AddBufferView(values.tobytes(order='C'), target),
                    'componentType': componentType, 'count': len(values), 'type': dataType}
        if bounds:
            accessor['min'] = values.min(axis=0).astype(float).tolist()
            accessor['max'] = values.max(axis=0).astype(float).tolist()
        accessorIndex = len(output['accessors'])
        output['accessors'].append(accessor)
        return accessorIndex

    primitives = []
    for materialIndex in sorted(groups):
        group = groups[materialIndex]
        attributes = {semantic: np.concatenate(parts, axis=0).astype('<f4', copy=False)
                      for semantic, parts in group['attributes'].items()}
        indexValues = np.concatenate(group['indices'])
        indexComponent = 5123 if int(indexValues.max()) <= 65535 else 5125
        indexValues = indexValues.astype('<u2' if indexComponent == 5123 else '<u4')
        primitive = {'attributes': {}, 'material': materialIndex}
        for semantic, dataType in [('POSITION', 'VEC3'), ('NORMAL', 'VEC3'),
                                    ('TANGENT', 'VEC4'), ('TEXCOORD_0', 'VEC2')]:
            primitive['attributes'][semantic] = AddAccessor(attributes[semantic], 5126, dataType, 34962,
                                                           bounds=semantic == 'POSITION')
        primitive['indices'] = AddAccessor(indexValues, indexComponent, 'SCALAR', 34963)
        primitives.append(primitive)

    imageRemap = {}
    imageKeys = {}
    imageAliases = []
    newImages = []
    imagePayloadBytesBefore = 0
    imagePayloadBytesAfter = 0
    for imageIndex, imageInfo in enumerate(document.get('images', [])):
        if set(imageInfo) - {'bufferView', 'mimeType', 'name', 'extras'} or 'bufferView' not in imageInfo or 'mimeType' not in imageInfo:
            raise ValueError('Only embedded image payloads are supported')
        view = document['bufferViews'][imageInfo['bufferView']]
        if view.get('buffer', 0) != 0 or 'byteStride' in view:
            raise ValueError('Invalid embedded image buffer view')
        start = view.get('byteOffset', 0)
        end = start + view['byteLength']
        if start < 0 or end > len(binaryBytes):
            raise ValueError('Truncated embedded image')
        payload = binaryBytes[start:end]
        imagePayloadBytesBefore += len(payload)
        imageKey = (imageInfo['mimeType'], payload)
        if imageKey not in imageKeys:
            newImage = copy.deepcopy(imageInfo)
            newImage['bufferView'] = AddBufferView(payload)
            imageKeys[imageKey] = len(newImages)
            newImages.append(newImage)
            imagePayloadBytesAfter += len(payload)
        newIndex = imageKeys[imageKey]
        imageRemap[imageIndex] = newIndex
        imageAliases.append({'sourceIndex': imageIndex, 'outputIndex': newIndex,
                             'name': imageInfo.get('name'), 'extras': copy.deepcopy(imageInfo.get('extras')),
                             'mimeType': imageInfo['mimeType'], 'payloadBytes': len(payload),
                             'payloadSha256': hashlib.sha256(payload).hexdigest()})
    output['images'] = newImages
    textureKeys = {}
    textureRemap = {}
    newTextures = []
    for textureIndex, texture in enumerate(document.get('textures', [])):
        if set(texture) - {'source', 'sampler', 'name', 'extras'} or 'source' not in texture:
            raise ValueError('Unsupported texture semantics')
        newTexture = copy.deepcopy(texture)
        newTexture['source'] = imageRemap[newTexture['source']]
        if 'sampler' in newTexture and not 0 <= newTexture['sampler'] < len(document.get('samplers', [])):
            raise ValueError('Invalid sampler reference')
        textureKey = json.dumps(newTexture, sort_keys=True, separators=(',', ':'))
        if textureKey not in textureKeys:
            textureKeys[textureKey] = len(newTextures)
            newTextures.append(newTexture)
        textureRemap[textureIndex] = textureKeys[textureKey]
    output['textures'] = newTextures
    for material in output['materials']:
        for textureKey in ['normalTexture', 'occlusionTexture', 'emissiveTexture']:
            if textureKey in material:
                material[textureKey]['index'] = textureRemap[material[textureKey]['index']]
        metallicRoughness = material.get('pbrMetallicRoughness', {})
        for textureKey in ['baseColorTexture', 'metallicRoughnessTexture']:
            if textureKey in metallicRoughness:
                metallicRoughness[textureKey]['index'] = textureRemap[metallicRoughness[textureKey]['index']]

    rootNode = copy.deepcopy(nodes[rootIndex])
    rootNode['children'] = [1]
    sourceNodeMetadata = {'recipeVersion': recipeVersion, 'sourceNodes': sourceNodes,
                          'sourceMeshes': [{'meshIndex': index, 'name': mesh.get('name')}
                                           for index, mesh in enumerate(meshes)]}
    output['nodes'] = [rootNode, {'name': rootNode['name'] + '_StaticMerged', 'mesh': 0,
                                 'extras': {'staticOptimizationSource': sourceNodeMetadata}}]
    output['meshes'] = [{'name': rootNode['name'] + '_StaticMergedMesh', 'primitives': primitives}]
    output['scenes'][0]['nodes'] = [0]
    output['buffers'][0]['byteLength'] = len(newBinary)
    jsonBytes = json.dumps(output, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')
    jsonBytes += b' ' * ((-len(jsonBytes)) % 4)
    newBinary += b'\x00' * ((-len(newBinary)) % 4)
    resultBytes = (struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(jsonBytes) + 8 + len(newBinary)) +
                   struct.pack('<II', len(jsonBytes), 0x4E4F534A) + jsonBytes +
                   struct.pack('<II', len(newBinary), 0x004E4942) + newBinary)
    report = {'recipeVersion': recipeVersion, 'path': str(filePath),
              'beforeSha256': hashlib.sha256(originalBytes).hexdigest(),
              'afterSha256': hashlib.sha256(resultBytes).hexdigest(),
              'before': {'bytes': len(originalBytes), 'primitives': sourcePrimitiveCount,
                         'triangles': sourceTriangleCount, 'materials': len(materials),
                         'images': len(document.get('images', [])), 'textures': len(document.get('textures', []))},
              'after': {'bytes': len(resultBytes), 'primitives': len(primitives),
                        'triangles': sourceTriangleCount, 'materials': len(output['materials']),
                        'images': len(newImages), 'textures': len(newTextures)},
              'imagePayloadBytesBefore': imagePayloadBytesBefore,
              'imagePayloadBytesAfter': imagePayloadBytesAfter,
              'imageAliases': imageAliases, 'textureRemap': textureRemap,
              'sourceNodeMetadata': sourceNodeMetadata,
              'operationalSceneMetadata': operationalSceneMetadata}
    if (sourcePrimitiveCount == len(primitives) and len(document.get('images', [])) == len(newImages)
            and len(document.get('textures', [])) == len(newTextures)):
        # An already consolidated asset has no resource or draw-count benefit.
        # Keep its exact original bytes rather than bake an unnecessary transform.
        if not operationalSceneMetadata:
            report['afterSha256'] = report['beforeSha256']
            report['after'] = copy.deepcopy(report['before'])
            report['changed'] = False
            report['reason'] = 'Already one primitive per material with no duplicate embedded resources'
            return report
        # Preserve an already consolidated asset's geometry and image BIN bytes.
        # Only remove the wrapper's changing session label from scene metadata.
        unchangedDocument = copy.deepcopy(document)
        for sceneInfo in unchangedDocument['scenes']:
            sceneExtras = sceneInfo.get('extras', {})
            sceneExtras.pop('BlenderMcpTask', None)
            if not sceneExtras:
                sceneInfo.pop('extras', None)
        unchangedJson = json.dumps(unchangedDocument, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')
        unchangedJson += b' ' * ((-len(unchangedJson)) % 4)
        resultBytes = (struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(unchangedJson) + 8 + len(binaryBytes)) +
                       struct.pack('<II', len(unchangedJson), 0x4E4F534A) + unchangedJson +
                       struct.pack('<II', len(binaryBytes), 0x004E4942) + binaryBytes)
        report['afterSha256'] = hashlib.sha256(resultBytes).hexdigest()
        report['after'] = copy.deepcopy(report['before'])
        report['after']['bytes'] = len(resultBytes)
    report['changed'] = True
    report['reason'] = ('Consolidated static material groups and exact embedded-resource duplicates'
                        if sourcePrimitiveCount != len(primitives) else
                        'Preserved geometry/image BIN and removed the operational scene label only')
    temporaryPath = None
    try:
        with tempfile.NamedTemporaryFile(prefix=filePath.name + '.', suffix='.tmp',
                                         dir=str(filePath.parent), delete=False) as temporaryFile:
            temporaryPath = Path(temporaryFile.name)
            temporaryFile.write(resultBytes)
            temporaryFile.flush()
            os.fsync(temporaryFile.fileno())
        if filePath.read_bytes() != originalBytes:
            raise RuntimeError('Input GLB changed during optimization')
        os.replace(str(temporaryPath), str(filePath))
        temporaryPath = None
    finally:
        if temporaryPath is not None:
            temporaryPath.unlink(missing_ok=True)
    return report

optimizationReports={}
for item in assets:
    if exportOnly and item.name!=exportOnly: continue
    bpy.ops.object.select_all(action='DESELECT')
    for ob in descendants(item): ob.select_set(True)
    bpy.context.view_layer.objects.active=item
    glbPath=OUT/('Model_K08_'+item.name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(glbPath),
        export_format='GLB',use_selection=True,export_yup=True,export_apply=True,
        export_animations=False,export_extras=True,export_tangents=True)
    repair_exported_tangents(glbPath)
    # Retain the split-source export before runtime-only consolidation.
    rawExportDirectory=OUT/'SourceExports'
    rawExportDirectory.mkdir(exist_ok=True)
    (rawExportDirectory/glbPath.name).write_bytes(glbPath.read_bytes())
    optimizationReports[item.name]=OptimizeStaticGlb(glbPath)
(OUT/'Data_K08_OptimizationReport.json').write_text(json.dumps(optimizationReports,indent=2),encoding='utf-8')

# A neutral studio for actual rendered inspections; never included in exports.
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=500
scene.render.resolution_y=354
scene.render.resolution_percentage=100
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.38,.38,.38,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.85
scene.view_settings.view_transform='AgX'
groundmat=bpy.data.materials.new('StudioGround')
groundmat.diffuse_color=(.32,.32,.32,1)
groundmat.use_nodes=True
groundmat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.32,.32,.32,1)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.002))
ground=bpy.context.object; ground.name='StudioGround'; ground.data.materials.append(groundmat)
def light(name,loc,power,size):
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size
    ob=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(ob); ob.location=loc
    ob.rotation_euler=(Vector((0,0,.4))-ob.location).to_track_quat('-Z','Y').to_euler()
light('StudioKey',(-2,-3,4),420,3.5)
light('StudioFill',(2,2,3),220,3)
camData=bpy.data.cameras.new('StudioCamera'); camera=bpy.data.objects.new('StudioCamera',camData)
bpy.context.collection.objects.link(camera); scene.camera=camera; camData.type='ORTHO'
def render(item, name, loc, target, scale):
    for other in assets:
        for ob in descendants(other): ob.hide_render = other!=item
    camera.location=loc
    camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    camData.ortho_scale=scale
    scene.render.filepath=str(SHOTS/name)
    if os.environ.get('K08_SKIP_ALL_RENDER') != '1':
        bpy.ops.render.render(write_still=True)

render(table,'K08_Table_Front.png',(0,4,.425),(0,0,.425),1.8)
render(table,'K08_Table_Side.png',(4,0,.425),(0,0,.425),1.34)
render(table,'K08_Table_Top.png',(0,0,4),(0,0,.425),1.7)
render(table,'K08_Table_45.png',(2,3,2.1),(0,0,.42),1.8)
render(table,'K08_Table_Detail.png',(-1,1,1.5),(-.38,.16,.83),.60)
if os.environ.get('K08_SKIP_CLEAVER_RENDER') != '1':
    render(cleaver,'K08_Cleaver_Front.png',(0,2,.07),(0,0,.07),.52)
    render(cleaver,'K08_Cleaver_Side.png',(2,0,.07),(0,0,.07),.19)
    render(cleaver,'K08_Cleaver_45.png',(1,2,1.3),(-.04,0,.065),.52)
    render(cleaver,'K08_Cleaver_Detail.png',(.5,1,.65),(-.02,0,.075),.27)
render(roller,'K08_RollingPin_Front.png',(0,2,.025),(0,0,.025),.58)
render(roller,'K08_RollingPin_Side.png',(2,0,.025),(0,0,.025),.10)
render(roller,'K08_RollingPin_45.png',(1,2,1), (0,0,.024),.58)
render(roller,'K08_RollingPin_Detail.png',(-.8,1,.5),(-.19,0,.024),.20)
for item in assets:
    for ob in descendants(item): ob.hide_render=False
bpy.context.view_layer.update()
report={item.name:measure(item) for item in assets}
(OUT/'Data_K08_ModelReport.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Scene_K08_ChoppingTableSet.blend'))
print('K08_REPORT',json.dumps(report))
