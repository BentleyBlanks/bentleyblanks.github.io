"""Rebuild the three K09 utensils selected from Concept/K09_C.png.

Run with the repository BlenderMCP wrapper; the .blend and individual GLBs are
written to the user's OneDrive, never into the repository. Dimensions and
details are informed design estimates, not measurements from a period object.
The utensils use a flat resting pose; glTF is metre-scale Y-up with the origin
at the bottom centre, width on X and handle-to-working-end length on Z.
"""
import bpy
import math
import json
import random
import os
import hashlib
import struct
from datetime import datetime, timezone
import numpy as np
from mathutils import Vector
from mathutils.geometry import tessellate_polygon
from pathlib import Path

random.seed(1938)
outputRoot = Path(r"C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\VillageInteriorProps\K09_KitchenUtensils")
outputRoot.mkdir(parents=True, exist_ok=True)
artifactRoot=Path(os.environ.get('K09_ARTIFACT_ROOT',str(outputRoot)));artifactRoot.mkdir(parents=True,exist_ok=True)
renderRoot = artifactRoot / 'Acceptance'
renderRoot.mkdir(exist_ok=True)
willowBakeDirectory=outputRoot/'Refinement/WillowSurfaceBake/DoubleBindingV90'
willowTriangleLimit=3500  # Working target; user removed the strict3300 cap2026-11-03 and requested completion.

for ownedObject in list(bpy.data.objects):bpy.data.objects.remove(ownedObject,do_unlink=True)
# This Blender instance is task-owned; clear orphaned scene datablocks so a
# second rebuild produces stable material/mesh names rather than .001 suffixes.
for block in list(bpy.data.meshes): bpy.data.meshes.remove(block)
for block in list(bpy.data.curves): bpy.data.curves.remove(block)
for block in list(bpy.data.cameras): bpy.data.cameras.remove(block)
for block in list(bpy.data.lights): bpy.data.lights.remove(block)
for mat in list(bpy.data.materials): bpy.data.materials.remove(mat, do_unlink=True)
for image in list(bpy.data.images):
    if image.name.startswith('Texture_K09'): bpy.data.images.remove(image,do_unlink=True)
for col in list(bpy.data.collections):
    if col.name != 'Collection':
        bpy.data.collections.remove(col)
scene = bpy.context.scene
if scene.world is None:scene.world=bpy.data.worlds.new('K09World')
scene.unit_settings.system = 'METRIC'

textureRoot=Path.cwd()/'Taierzhuang1938'/'Texture'
buildScript=Path.cwd()/'Taierzhuang1938'/'_blender'/'VillageInteriorProps'/'Build_K09_KitchenUtensils.py'
buildSha256=hashlib.sha256(buildScript.read_bytes()).hexdigest()
ironSource=outputRoot/'Refinement'/'MaterialSources'/'Texture_K09_BlackenedIron_AlbedoSource.png'
ironSourceSha256='A6BC1178F4475BD0D371D954189FC4C938FDF441F13C43E0D2A1415A51DEEA21'
ironMaps=None
agedElmMaps=None
spatulaGripFinishMaps=None
willowBindingMaps=None
graterSurfaceRoleReport={}

# Front-view contour anchors from the selected C; the253mm whole length
# remains a design estimate. Pixel traces do not imply historical dimensions.
spatulaPixelToMetre=.253/350
spatulaReferenceCentreX=278.5
spatulaBladeBase=.128-(630-492)*spatulaPixelToMetre
spatulaBladeLength=.128-spatulaBladeBase
spatulaBladeFieldWidth=.101
spatulaSideRows=(510,520,540,560,580,600,610,615,620,625,628,630)
spatulaLeftPixels=(208,209,211,214,217,222,228,233,240,254,262,264)
spatulaRightPixels=(346,347,345,342,338,334,329,325,318,304,295,292)
spatulaCrownColumns=(208,212,220,230,240,250,260,270,280,290,300,310,320,330,338,342,346,347)
spatulaCrownRows=(508,501,497,496,494,493,493,492,493,493,494,495,496,498,501,503,508,511)
def SpatulaBladeEdges(t):
    pixelY=630-(630-492)*t
    return tuple((float(np.interp(pixelY,spatulaSideRows,values))+margin-spatulaReferenceCentreX)*spatulaPixelToMetre for values,margin in ((spatulaLeftPixels,-.5),(spatulaRightPixels,.5)))
def SpatulaWorkingEdgeY(x):
    pixelX=spatulaReferenceCentreX+np.asarray(x)/spatulaPixelToMetre
    return .128-(np.interp(pixelX,spatulaCrownColumns,spatulaCrownRows)-492)*spatulaPixelToMetre
def GraterCrownArch(fraction):return .05+.95*np.maximum(0,1-(np.abs(np.asarray(fraction))/.85)**4)**.20
def GraterHeightArch(fraction):return .05+.95*GraterCrownArch(fraction)

def GraterOpeningY(i,j,fraction):
    mx,my,hx,hy=GraterCell(i,j);end=my-hy+.0018
    return end+(my+graterExitCrown-end)*GraterExitArch(fraction)+GraterCutSlope(i,j)*hx*fraction

def GraterExitArch(fraction):return np.interp(np.asarray(fraction),(-.85,-.425,0,.425,.85),(0,.75**.55,1,.75**.55,0))
def GraterExitY(i,j,fraction):
    mx,my,hx,hy=GraterCell(i,j);end=my-hy+.0008
    return end+(my+graterExitCrown-end)*GraterExitArch(fraction)+GraterCutSlope(i,j)*hx*fraction

graterHandleReferenceCentrePx=143.5
graterHandlePixelToMetre=.1595/245
graterHandleHoleX=(84.5-graterHandleReferenceCentrePx)*graterHandlePixelToMetre
graterHandleHoleFromButt=.0159
graterWorkingHalfWidth=.063
graterCutHalfWidth=.0215
graterCutRise=.0018
graterCutDepth=.0045
graterExitEnd=.0014
graterExitCrown=.0010
graterCrownReach=-.0021

# Opening centres traced from the complete selected C front panel.
# Image-derived design anchors, not historical object measurements.
graterOpeningPixels=((113,131,148,166,183,198,216,235,252,265,282,302,319),
                     (115,133,152,169,186,203,221,238,255,272,289,306,323,341),
                     (122,139,157,176,192,208,226,245,264,282,299,317))
graterColumnCounts=tuple(len(column) for column in graterOpeningPixels)
graterAtlasRows=max(graterColumnCounts)
graterColumnX=np.asarray([(pixel-126)/178*.126 for pixel in (66,126,181)])
graterRowsMy=np.asarray([[.09-(column[min(index,len(column)-1)]-59)/317*.18+.0010 for index in range(graterAtlasRows)] for column in graterOpeningPixels])
graterCellIds=[(i,j) for i,count in enumerate(graterColumnCounts) for j in range(count)]

def GraterCell(i,j):
    mx=graterColumnX[i];my=graterRowsMy[i,j]
    hx=graterCutHalfWidth*(.94+.11*np.sin(i*4.3+j*1.7))
    hy=graterCutDepth*(1+.06*np.cos(i*2.1+j*2.6))
    return mx,my,hx,hy


def GraterCutSlope(i,j):
    return -.06+.07*np.sin(i*2.4+j*1.7)


def GraterRubPhase(i,j,u,v=1.):
    phase=u*(9+i*.7)+v*3+i*4+j*1.7
    toothContact=.70+.30*np.sin(i*2.9+j*.73+1.2)**2
    return .28+.72*(.5+.5*np.sin(phase))**2*toothContact


def SurfacePhotoBlur(array,sigma=1.4):
    output=np.asarray(array,dtype=np.float32)
    radius=max(1,int(math.ceil(sigma*3)));axisValues=np.arange(-radius,radius+1,dtype=np.float32);weights=np.exp(-.5*(axisValues/sigma)**2);weights/=weights.sum()
    for axis in (0,1):
        padding=[(0,0)]*output.ndim;padding[axis]=(radius,radius);padded=np.pad(output,padding,mode='edge');filtered=np.zeros_like(output)
        for offset,weight in enumerate(weights):
            slices=[slice(None)]*output.ndim;slices[axis]=slice(offset,offset+output.shape[axis]);filtered+=padded[tuple(slices)]*weight
        output=filtered
    return output

def IronSurfaceUv(x,y,grater=False):
    # The complete face uses the retained material field. The older 2.5/m
    # projection showed only a small, nearly uniform crop of the source.
    if grater:return .5+x*(.90/(2*graterWorkingHalfWidth)),.5+y*(.90/.180)
    return .5+x*(.90/spatulaBladeFieldWidth),.08+(y-spatulaBladeBase)*(.84/spatulaBladeLength)

def InferredIronMaps():
    # Retain the verified diffuse source's actual mottled forged-iron field.
    # Rust/metal classification and shallow surface relief are inferred,
    # explicitly not a measured scan or a baked lighting layer.
    global ironMaps
    if ironMaps:return ironMaps
    if not ironSource.exists() or hashlib.sha256(ironSource.read_bytes()).hexdigest().upper()!=ironSourceSha256:
        raise RuntimeError('Missing or changed K09 iron material source: '+str(ironSource))
    source=bpy.data.images.load(str(ironSource),check_existing=True);source.pack();w,h=source.size
    a=np.empty(w*h*4,dtype=np.float32);source.pixels.foreach_get(a);a=a.reshape((h,w,4));rgb=a[:,:,:3]
    oxide=np.clip((rgb[:,:,0]-rgb[:,:,2]-.012)*10,0,.95)
    # Remove small photographic highlights from the rust mask while retaining
    # broad irregular oxidation islands. Never derive height from every speck.
    oxide=(oxide+np.roll(oxide,3,0)+np.roll(oxide,-3,0)+np.roll(oxide,3,1)+np.roll(oxide,-3,1))/5
    substrate=np.ones((h,w,4),dtype=np.float32)
    # Remove the source's tiny photographic glitter from diffuse colour. Its
    # broad forged/rust pattern remains, while shallow relief carries pitting.
    matte=SurfacePhotoBlur(rgb,1.45)
    matteLight=matte[:,:,0]*.2126+matte[:,:,1]*.7152+matte[:,:,2]*.0722;oil=np.clip((.28-matteLight)/.12,0,1);coat=np.maximum(oxide,.78+.18*np.clip((.46-matteLight)/.28,0,1))
    metalGrain=np.clip(matteLight/max(float(matteLight.mean()),.03),.45,1.65)**.28
    cleanIron=np.asarray((.67,.68,.655))*metalGrain[:,:,None]
    exposure=np.clip((matteLight-.44)/.20,0,1)
    substrate[:,:,:3]=np.clip(matte*np.asarray((.96,.95,.94))*(1-.5*exposure[:,:,None])+cleanIron*(.5*exposure[:,:,None]),.035,.82)
    base=bpy.data.images.new('Texture_K09_IronCompositeBase',width=w,height=h,alpha=True);base.pixels.foreach_set(substrate.ravel());base.pack()
    # Correlate the inferred relief with the diffuse source's broad pitting.
    luma=rgb[:,:,0]*.2126+rgb[:,:,1]*.7152+rgb[:,:,2]*.0722
    softened=(luma+np.roll(luma,2,0)+np.roll(luma,-2,0)+np.roll(luma,2,1)+np.roll(luma,-2,1))/5
    # Infer a bounded, shallow hammered field from the retained source.
    # The 0.10mm band amplitude is an artistic estimate, not a surface scan.
    hammerBand=SurfacePhotoBlur(luma,2)-SurfacePhotoBlur(luma,18);hammerScale=max(float(np.quantile(np.abs(hammerBand),.85)),.02)
    relief=.000055*oxide+.000035*(luma-softened)+.00010*np.tanh(hammerBand/hammerScale)
    dx=(np.roll(relief,-1,1)-np.roll(relief,1,1))*(w/.12)*.5;dy=(np.roll(relief,-1,0)-np.roll(relief,1,0))*(h/.15)*.5
    normals=np.stack((-dx,-dy,np.ones_like(dx)),axis=2);normals/=np.linalg.norm(normals,axis=2)[:,:,None];normalPixels=np.ones((h,w,4),dtype=np.float32);normalPixels[:,:,:3]=normals*.5+.5
    ni=bpy.data.images.new('Texture_K09_InferredForgedIronNormal',width=w,height=h,alpha=True);ni.colorspace_settings.name='Non-Color';ni.pixels.foreach_set(normalPixels.ravel());ni.pack()
    orm=np.ones((h,w,4),dtype=np.float32);orm[:,:,1]=np.clip(.68+.18*coat-.20*exposure,0,.95);orm[:,:,2]=np.clip(.10+.12*(1-oxide)+.60*exposure,0,1)
    oi=bpy.data.images.new('Texture_K09_InferredIronOrm',width=w,height=h,alpha=True);oi.colorspace_settings.name='Non-Color';oi.pixels.foreach_set(orm.ravel());oi.pack()
    ironMaps=(base,ni,oi);return ironMaps

def AgedElmMaps():
    global agedElmMaps
    if agedElmMaps:return agedElmMaps
    path=outputRoot/'Refinement/MaterialSources/Texture_K09_AgedElm_AlbedoSource.png';assert hashlib.sha256(path.read_bytes()).hexdigest()=='ef05961499ec1717920084d79bf68ceaf14a28464ebd6a96f035af58742add97','Missing or changed retained old-elm source'
    base=bpy.data.images.load(str(path),check_existing=True);base.colorspace_settings.name='sRGB';base.pack();width,height=base.size;pixels=np.empty(width*height*4,dtype=np.float32);base.pixels.foreach_get(pixels);pixels=pixels.reshape(height,width,4);luma=pixels[:,:,0]*.2126+pixels[:,:,1]*.7152+pixels[:,:,2]*.0722
    relief=.00010*np.clip((luma-SurfacePhotoBlur(luma,2))*3,-1,1);dx=(np.roll(relief,-1,1)-np.roll(relief,1,1))*(width/.16)*.5;dy=(np.roll(relief,-1,0)-np.roll(relief,1,0))*(height/.24)*.5;normal=np.stack((-dx,-dy,np.ones_like(dx)),axis=2);normal/=np.linalg.norm(normal,axis=2)[:,:,None];normalPixels=np.ones((height,width,4),dtype=np.float32);normalPixels[:,:,:3]=normal*.5+.5
    ni=bpy.data.images.new('Texture_K09_AgedElmInferredNormal',width=width,height=height,alpha=True);ni.colorspace_settings.name='Non-Color';ni.pixels.foreach_set(normalPixels.ravel());ni.pack()
    finish=np.clip((.42-SurfacePhotoBlur(luma,3))/.24,0,1);orm=np.ones((height,width,4),dtype=np.float32);orm[:,:,1]=.82-.20*finish;orm[:,:,2]=0;oi=bpy.data.images.new('Texture_K09_AgedElmInferredOrm',width=width,height=height,alpha=True);oi.colorspace_settings.name='Non-Color';oi.pixels.foreach_set(orm.ravel());oi.pack();agedElmMaps=(base,ni,oi);return agedElmMaps

def SpatulaGripFinishMaps():
    global spatulaGripFinishMaps
    if spatulaGripFinishMaps:return spatulaGripFinishMaps
    path=outputRoot/'Refinement/MaterialSources/Texture_K09_SpatulaFineGrip_AlbedoSource.png'
    assert hashlib.sha256(path.read_bytes()).hexdigest()=='9afbb78ff816401cddcd2e1079235efe2f9f07a702c9ac1e7e9bf0509ac87662'
    source=bpy.data.images.load(str(path),check_existing=True);source.colorspace_settings.name='sRGB';source.pack()
    width,height=source.size;pixels=np.empty(width*height*4,dtype=np.float32);source.pixels.foreach_get(pixels);pixels=pixels.reshape(height,width,4)
    luma=pixels[:,:,0]*.2126+pixels[:,:,1]*.7152+pixels[:,:,2]*.0722
    # Fine fragmented oil/finish is retained from the new single source.
    # Subpixel colour filtering removes tiny generated glitter; real shader
    # reflection is authored independently through roughness and shallow grain.
    pixels[:,:,:3]=SurfacePhotoBlur(pixels[:,:,:3],.8)
    luma=pixels[:,:,0]*.2126+pixels[:,:,1]*.7152+pixels[:,:,2]*.0722
    low,high=np.quantile(SurfacePhotoBlur(luma,2),(.25,.90))
    exposed=np.clip((luma-low)/max(float(high-low),1e-5),0,1)
    pixels[:,:,:3]=np.clip(pixels[:,:,:3]*(1.16+.14*exposed[:,:,None])*np.asarray((.98,1.01,1.05)),.005,.95)
    luma=pixels[:,:,0]*.2126+pixels[:,:,1]*.7152+pixels[:,:,2]*.0722
    base=bpy.data.images.new('Texture_K09_SpatulaGripCalibratedBase',width=width,height=height,alpha=True)
    base.pixels.foreach_set(pixels.ravel());base.pack()
    blurred=SurfacePhotoBlur(luma,2);filmLow,filmHigh=np.quantile(blurred,(.18,.70))
    coating=np.clip((filmHigh-blurred)/max(float(filmHigh-filmLow),1e-5),0,1)
    relief=.000012*coating+.000015*np.tanh((luma-SurfacePhotoBlur(luma,1.5))/.04)
    dx=(np.roll(relief,-1,1)-np.roll(relief,1,1))*(width/.0625)*.5
    dy=(np.roll(relief,-1,0)-np.roll(relief,1,0))*(height/.15)*.5
    normal=np.stack((-dx,-dy,np.ones_like(dx)),axis=2);normal/=np.linalg.norm(normal,axis=2)[:,:,None]
    normalPixels=np.ones((height,width,4),dtype=np.float32);normalPixels[:,:,:3]=normal*.5+.5
    ni=bpy.data.images.new('Texture_K09_SpatulaGripFinishNormal',width=width,height=height,alpha=True)
    ni.colorspace_settings.name='Non-Color';ni.pixels.foreach_set(normalPixels.ravel());ni.pack()
    orm=np.ones((height,width,4),dtype=np.float32);orm[:,:,1]=.84-.16*coating;orm[:,:,2]=0
    oi=bpy.data.images.new('Texture_K09_SpatulaGripFinishOrm',width=width,height=height,alpha=True)
    oi.colorspace_settings.name='Non-Color';oi.pixels.foreach_set(orm.ravel());oi.pack()
    spatulaGripFinishMaps=(base,ni,oi)
    return spatulaGripFinishMaps


def WillowBindingMaps():
    global willowBindingMaps
    if willowBindingMaps:return willowBindingMaps
    path=outputRoot/'Refinement/MaterialSources/Texture_K09_WillowSurface_AlbedoSource.png'
    assert hashlib.sha256(path.read_bytes()).hexdigest()=='f769bf7fe84ce60fefadbba5ba6135363c75aedfb77865c116ac23c121179c85'
    base=bpy.data.images.load(str(path),check_existing=True);base.colorspace_settings.name='sRGB';base.pack();width,height=base.size
    pixels=np.empty(width*height*4,np.float32);base.pixels.foreach_get(pixels);pixels=pixels.reshape(height,width,4);rgb=pixels[:,:,:3]
    luma=rgb[:,:,0]*.2126+rgb[:,:,1]*.7152+rgb[:,:,2]*.0722
    relief=.000020*np.tanh((luma-SurfacePhotoBlur(luma,2))/.05)
    bindingU=(np.arange(width,dtype=np.float32)[None,:]+.5)/width*.08
    bindingV=(np.arange(height,dtype=np.float32)[:,None]+.5)/height*.16
    # Tangent-space LOD for fine parallel split fibres, not painted light.
    bindingPhase=2*np.pi*(bindingU/.0012+.06*np.sin(2*np.pi*bindingV/.012))
    relief+=.00018*np.cos(bindingPhase)*(.82+.18*np.sin(2*np.pi*bindingV/.009)**2)
    dx=(np.roll(relief,-1,1)-np.roll(relief,1,1))*(width/.08)*.5;dy=(np.roll(relief,-1,0)-np.roll(relief,1,0))*(height/.16)*.5
    vectors=np.stack((-dx,-dy,np.ones_like(dx)),axis=2);vectors/=np.linalg.norm(vectors,axis=2)[:,:,None]
    normal=np.ones((height,width,4),np.float32);normal[:,:,:3]=vectors*.5+.5
    ni=bpy.data.images.new('Texture_K09_WillowBindingNormal',width=width,height=height,alpha=True);ni.colorspace_settings.name='Non-Color';ni.pixels.foreach_set(normal.ravel());ni.pack()
    orm=np.ones((height,width,4),np.float32);orm[:,:,1]=np.clip(.79+.08*(SurfacePhotoBlur(luma,3)-.5),.75,.86);orm[:,:,2]=0
    oi=bpy.data.images.new('Texture_K09_WillowBindingOrm',width=width,height=height,alpha=True);oi.colorspace_settings.name='Non-Color';oi.pixels.foreach_set(orm.ravel());oi.pack()
    willowBindingMaps=(base,ni,oi);return willowBindingMaps

def CuttingWearMaps():
    # An atlas follows the actual root-to-crown coordinates of each tongue.
    # Wear removes oxide and changes the physical PBR response on part of the
    # convex rubbing face. No light, white highlight, or shadow is painted in.
    base,normal,orm=InferredIronMaps();w,h=base.size
    source=np.empty(w*h*4,dtype=np.float32);base.pixels.foreach_get(source);source=source.reshape((h,w,4))
    packed=np.empty(w*h*4,dtype=np.float32);orm.pixels.foreach_get(packed);packed=packed.reshape((h,w,4))
    size=1024;yy,xx=np.mgrid[0:size,0:size];u=(xx+.5)/size;v=(yy+.5)/size
    ci=np.minimum((u*3).astype(int),2);atlasRow=np.minimum((v*graterAtlasRows).astype(int),graterAtlasRows-1)
    cj=np.minimum(atlasRow,np.asarray(graterColumnCounts)[ci]-1)
    tu=np.clip((u*3-ci-.02)/.96,0,1);tv=np.clip((v*graterAtlasRows-atlasRow-.04)/.92,0,1)
    mx,my,hx,hy=GraterCell(ci,cj)

    px=mx+hx*.85*(tu*2-1);arch=GraterCrownArch((tu*2-1)*.85)
    py=my-hy+tv*((hy+graterCrownReach)*arch)+GraterCutSlope(ci,cj)*(px-mx)
    sourceU,sourceV=IronSurfaceUv(px,py,True);sx=np.clip((sourceU*w).astype(int),0,w-1);sy=np.clip((sourceV*h).astype(int),0,h-1)
    color=source[sy,sx].copy();pbr=packed[sy,sx].copy()
    crown=np.exp(-((tv-(.98+.015*np.sin(ci*3+cj)))/.24)**2)
    across=np.exp(-((tu-(.49+.06*np.sin(ci+cj*2)))/.55)**2)
    # Repeated food/cleaning contact leaves interrupted rubbing stretches;
    # each actual tongue retains its own dark intervals and asymmetric ends.
    broken=GraterRubPhase(ci,cj,tu,tv)
    rawWear=np.clip(crown*across*broken,0,1);wear=np.clip((rawWear-.08)/.52,0,1);wear=wear*wear*(3-2*wear)
    bare=np.stack([.76+.025*np.sin(px*280+py*190)**2,.77+.024*np.sin(px*280+py*190)**2,.745+.022*np.sin(px*280+py*190)**2],axis=2)
    color[:,:,:3]=color[:,:,:3]*(1-wear[:,:,None])+bare*wear[:,:,None]
    pbr[:,:,1]=pbr[:,:,1]*(1-wear)+(.32+.07*(1-broken))*wear
    pbr[:,:,2]=pbr[:,:,2]*(1-wear)+.95*wear
    sourceNormal=np.empty(w*h*4,dtype=np.float32);normal.pixels.foreach_get(sourceNormal);sourceNormal=sourceNormal.reshape(h,w,4);mappedNormal=sourceNormal[sy,sx].copy();ni=bpy.data.images.new('Texture_K09_ConvexTongueMappedNormal',width=size,height=size,alpha=True);ni.colorspace_settings.name='Non-Color';ni.pixels.foreach_set(mappedNormal.astype(np.float32).ravel());ni.pack()
    bi=bpy.data.images.new('Texture_K09_ConvexTongueWearBase',width=size,height=size,alpha=True);bi.pixels.foreach_set(color.astype(np.float32).ravel());bi.pack()
    oi=bpy.data.images.new('Texture_K09_ConvexTongueWearOrm',width=size,height=size,alpha=True);oi.colorspace_settings.name='Non-Color';oi.pixels.foreach_set(pbr.astype(np.float32).ravel());oi.pack()
    return bi,ni,oi

def SpatulaFaceMaps():
    sourcePath=outputRoot/'Refinement/MaterialSources/Texture_K09_SpatulaOxideFieldV56_AlbedoSource.png'
    assert hashlib.sha256(sourcePath.read_bytes()).hexdigest()=='70afbe18ea1a7a43e4975b7bdf0c2ebeb7083fc8f7a71de50973fffe4e559423'
    image=bpy.data.images.load(str(sourcePath),check_existing=True);image.colorspace_settings.name='sRGB';image.pack();w,h=image.size
    pixels=np.empty(w*h*4,np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(h,w,4);rgb=pixels[:,:,:3]
    retainedPath=outputRoot/'Refinement/MaterialSources/Texture_K09_SpatulaGrayOxide_AlbedoSource.png'
    assert hashlib.sha256(retainedPath.read_bytes()).hexdigest()=='dec2e2e621a1b4e935eca26870c626bbce8e41199d000bd9969ced9aa26079a5'
    retained=bpy.data.images.load(str(retainedPath),check_existing=True);assert tuple(retained.size)==(w,h)
    retainedPixels=np.empty(w*h*4,np.float32);retained.pixels.foreach_get(retainedPixels);retainedRgb=retainedPixels.reshape(h,w,4)[:,:,:3]
    retainedMacro=SurfacePhotoBlur(retainedRgb,9);fineDetail=retainedRgb-retainedMacro
    v=np.arange(h,dtype=np.float32)[:,None]/h;macroBlend=.12*(.30+.70*v)
    rgb=np.clip(rgb*(1-macroBlend[:,:,None])+retainedMacro*macroBlend[:,:,None]+.20*fineDetail,.025,.92)
    rgb=np.clip(rgb*(1.0+.06*v[:,:,None]),.025,.92)

    # The reference-guided primary field carries the oxidation pattern.
    # Mild colour low-pass suppresses submillimetre source micro-light rims;
    # normal/roughness/metal response are inferred separately below.
    # Preserve the retained macro oxidation field. A zero-mean source
    # grain band is sampled over a smaller material region so its particles
    # remain visible at the reference tool scale instead of averaging away.
    grain=SurfacePhotoBlur(rgb,.65)-SurfacePhotoBlur(rgb,5)
    yy,xx=np.mgrid[0:h,0:w];sx=(.11+.50*(xx+.5)/w)*(w-1);sy=(.21+.50*(yy+.5)/h)*(h-1)
    x0=np.floor(sx).astype(int);y0=np.floor(sy).astype(int);x1=np.minimum(x0+1,w-1);y1=np.minimum(y0+1,h-1);fx=(sx-x0)[:,:,None];fy=(sy-y0)[:,:,None]
    visibleGrain=(grain[y0,x0]*(1-fx)+grain[y0,x1]*fx)*(1-fy)+(grain[y1,x0]*(1-fx)+grain[y1,x1]*fx)*fy
    visibleGrain-=visibleGrain.mean(axis=(0,1),keepdims=True)
    matte=np.clip(SurfacePhotoBlur(rgb,2.2)+.70*visibleGrain,.025,.92)
    luma=matte[:,:,0]*.2126+matte[:,:,1]*.7152+matte[:,:,2]*.0722
    rust=np.clip((matte[:,:,0]-matte[:,:,2]-.025)/.13,0,1)
    grey=np.clip((SurfacePhotoBlur(luma,2)-.18)/.18,0,1)*(1-.75*rust)
    band=SurfacePhotoBlur(luma,2)-SurfacePhotoBlur(luma,16);scale=max(float(np.quantile(np.abs(band),.85)),.012)
    fine=luma-SurfacePhotoBlur(luma,1.5)
    relief=.000035*np.tanh(band/scale)+.000012*np.tanh(fine/.03)-.000040*grey
    dx=(np.roll(relief,-1,1)-np.roll(relief,1,1))*(w/.12)*.5;dy=(np.roll(relief,-1,0)-np.roll(relief,1,0))*(h/.15)*.5
    vector=np.stack((-dx,-dy,np.ones_like(dx)),axis=2);vector/=np.linalg.norm(vector,axis=2)[:,:,None]
    normal=np.ones((h,w,4),np.float32);normal[:,:,:3]=vector*.5+.5
    ni=bpy.data.images.new('Texture_K09_GrayOxideInferredNormal',width=w,height=h,alpha=True);ni.colorspace_settings.name='Non-Color';ni.pixels.foreach_set(normal.ravel());ni.pack()
    colour=np.ones((h,w,4),np.float32);metalMix=.24*grey
    colour[:,:,:3]=matte*(1-metalMix[:,:,None])+np.asarray((.73,.74,.72))[None,None,:]*metalMix[:,:,None]
    bi=bpy.data.images.new('Texture_K09_GrayOxideBase',width=w,height=h,alpha=True);bi.pixels.foreach_set(colour.ravel());bi.pack()
    pbr=np.ones((h,w,4),np.float32);pbr[:,:,1]=np.clip(.80-.22*grey+.04*rust,.54,.90);pbr[:,:,2]=np.clip(.14+.70*grey-.10*rust,.05,.90)
    oi=bpy.data.images.new('Texture_K09_GrayOxideInferredOrm',width=w,height=h,alpha=True);oi.colorspace_settings.name='Non-Color';oi.pixels.foreach_set(pbr.ravel());oi.pack()
    return bi,ni,oi

def SpatulaBindingMaps():
    base,normal,orm=InferredIronMaps();width,height=base.size
    pixels=np.empty(width*height*4,dtype=np.float32);base.pixels.foreach_get(pixels);pixels=pixels.reshape(height,width,4)
    oxide=np.clip((pixels[:,:,0]-pixels[:,:,2]-.012)/.13,0,1)
    color=np.ones_like(pixels);color[:,:,:3]=np.clip(pixels[:,:,:3]*.78,.045,.68)
    bi=bpy.data.images.new('Texture_K09_SpatulaBindingBase',width=width,height=height,alpha=True);bi.pixels.foreach_set(color.ravel());bi.pack()
    packed=np.ones_like(pixels);packed[:,:,1]=np.clip(.52+.25*oxide,.45,.86);packed[:,:,2]=.80*(1-oxide)+.10*oxide
    oi=bpy.data.images.new('Texture_K09_SpatulaBindingOrm',width=width,height=height,alpha=True);oi.colorspace_settings.name='Non-Color';oi.pixels.foreach_set(packed.ravel());oi.pack()
    return bi,normal,oi


def GraterCrestMaps():
    base,normal,orm=InferredIronMaps();w,h=base.size
    source=np.empty(w*h*4,np.float32);base.pixels.foreach_get(source);source=source.reshape(h,w,4)
    packed=np.empty(w*h*4,np.float32);orm.pixels.foreach_get(packed);packed=packed.reshape(h,w,4)
    size=1024;yy,xx=np.mgrid[:size,:size];u=(xx+.5)/size;v=(yy+.5)/size
    ci=np.minimum((u*3).astype(int),2);row=np.minimum((v*graterAtlasRows).astype(int),graterAtlasRows-1);cj=np.minimum(row,np.asarray(graterColumnCounts)[ci]-1)
    tu=np.clip((u*3-ci-.02)/.96,0,1);tv=np.clip((v*graterAtlasRows-row-.04)/.92,0,1)
    mx,my,hx,hy=GraterCell(ci,cj);fraction=(tu*2-1)*.85;px=mx+hx*fraction
    py=my-hy+(hy+graterCrownReach)*GraterCrownArch(fraction)+GraterCutSlope(ci,cj)*(px-mx)
    su,sv=IronSurfaceUv(px,py,True);sx=np.clip((su*w).astype(int),0,w-1);sy=np.clip((sv*h).astype(int),0,h-1)
    colour=source[sy,sx].copy();pbr=packed[sy,sx].copy()
    # Millimetre-sized interruptions on the actual cut wall. These select
    # oxidized or exposed material; there is no painted highlight layer.
    lengthM=2*hx*.85;phase=2*np.pi*(tu*lengthM/.0032+ci*.61+cj*.217)
    field=np.clip((np.sin(phase)+.35+.25*np.sin(phase*.37+cj)) /1.1,0,1);field=field*field*(3-2*field)
    warmth=colour[:,:,0]-colour[:,:,2];neutral=np.clip(1-(warmth-.03)/.16,.25,1)
    cuttingLand=np.exp(-((tv-.99)/.40)**2)
    polish=(.32+.64*field)*(.65+.35*neutral)*cuttingLand
    metal=np.asarray((.78,.79,.775))[None,None,:]
    colour[:,:,:3]=colour[:,:,:3]*(1-polish[:,:,None])+metal*polish[:,:,None]
    pbr[:,:,1]=pbr[:,:,1]*(1-polish)+.19*polish;pbr[:,:,2]=pbr[:,:,2]*(1-polish)+.96*polish
    bi=bpy.data.images.new('Texture_K09_CutCrestBase',width=size,height=size,alpha=True);bi.pixels.foreach_set(colour.ravel());bi.pack()
    oi=bpy.data.images.new('Texture_K09_CutCrestOrm',width=size,height=size,alpha=True);oi.colorspace_settings.name='Non-Color';oi.pixels.foreach_set(pbr.ravel());oi.pack()
    return bi,normal,oi

def Material(name, color, roughness=0.8, metallic=0.0, texture=None, tint=(1,1,1), wear=False):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if texture=='iron':
        nodes=mat.node_tree.nodes;links=mat.node_tree.links;base,normal,orm=InferredIronMaps()
        if name=='ForgedIron_WornCuttingFlap':
            base,normal,orm=CuttingWearMaps()
        elif name=='ForgedIron_SpatulaFace':
            base,normal,orm=SpatulaFaceMaps()
        elif name=='ForgedIron_CuttingEdge':base,normal,orm=GraterCrestMaps()
        elif name=='ForgedIron_TarnishedBinding':base,normal,orm=SpatulaBindingMaps()
        node=nodes.new('ShaderNodeTexImage');node.image=base;links.new(node.outputs['Color'],bsdf.inputs['Base Color'])
        if name!='ForgedIron_CuttingEdge':
            node=nodes.new('ShaderNodeTexImage');node.image=normal;nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.12 if name=='ForgedIron_WornCuttingFlap' else .22 if name=='ForgedIron_TarnishedBinding' else .60;links.new(node.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bsdf.inputs['Normal'])
        node=nodes.new('ShaderNodeTexImage');node.image=orm;sep=nodes.new('ShaderNodeSeparateColor');links.new(node.outputs['Color'],sep.inputs[0]);links.new(sep.outputs['Green'],bsdf.inputs['Roughness']);links.new(sep.outputs['Blue'],bsdf.inputs['Metallic'])
    elif texture:
        families={'wood':'VillageTimber','wicker':'TreeBark','iron':'BeishaheSteel'}
        family=families[texture]
        nodes=mat.node_tree.nodes;links=mat.node_tree.links
        def SourceTexture(suffix, noncolor=False):
            if name=='OldFibreBinding':return WillowBindingMaps()[{'Base':0,'Normal':1,'Orm':2}[suffix]]
            if name=='VillageTimber_SpatulaGrip':
                return SpatulaGripFinishMaps()[{'Base':0,'Normal':1,'Orm':2}[suffix]]
            if name.startswith('VillageTimber'):
                return AgedElmMaps()[{'Base':0,'Normal':1,'Orm':2}[suffix]]
            path=textureRoot/('Texture_'+family+suffix+'.webp')
            if not path.exists(): raise FileNotFoundError(path)
            image=bpy.data.images.load(str(path),check_existing=True)
            if noncolor:image.colorspace_settings.name='Non-Color'
            image.pack();return image
        src=SourceTexture('Base');w,h=src.size;pixels=np.empty(w*h*4,dtype=np.float32);src.pixels.foreach_get(pixels);pixels=pixels.reshape((h,w,4));rawTimber=pixels[:,:,:3].copy()
        dark=0
        oxide=None
        if texture=='iron':
            # Existing steel albedo's red-biased flecks select oxide; the
            # resulting mask also changes roughness/metalness, not just color.
            oxide=np.clip((pixels[:,:,0]-pixels[:,:,2]-.006)*9,0,.65)
        if wear:
            vv=np.arange(h,dtype=np.float32)[:,None]/h;uu=np.arange(w,dtype=np.float32)[None,:]/w
            hand=np.exp(-((vv-.48)/.20)**4);rim=np.exp(-((vv-.16)/.065)**2)+np.exp(-((vv-.87)/.08)**2)
            holeU=.50 if 'SpatulaGrip' in name else .45
            hole=np.sqrt(((uu-holeU)/.048)**2+((vv-.204)/.065)**2)
            holeWear=np.exp(-((hole-.62)/.22)**2)*(.7+.3*np.sin(uu*71+vv*89)**2)
            dark=np.clip(.34*hand*(.60+.40*np.sin(uu*19+vv*7)**2)+.17*rim+.35*holeWear,0,.65)[:,:,None]
        pixels[:,:,:3]=np.clip(pixels[:,:,:3]*np.array(tint,dtype=np.float32)*(1-dark),0,1)
        if name.startswith('VillageTimber'):
            # Retain the actual irregular old-finish/exposed-fibre field from
            # this item's verified synthetic old-elm source, not an oval mask.
            gain=1.75 if name=='VillageTimber_RepairElm' else 1.12 if name.endswith('_Worn') else .82 if name=='VillageTimber_SpatulaGrip' else .97 if 'Grip' in name else 1.0
            contact=1-.10*np.exp(-((np.arange(h,dtype=np.float32)[:,None]/h-.49)/.34)**4) if 'Grip' in name else 1.0
            pixels[:,:,:3]=np.clip(rawTimber*gain*np.asarray(contact)[:,:,None] if 'Grip' in name else rawTimber*gain,.025,.90)
            if name=='VillageTimber_SpatulaGrip':pixels[:,:,:3]=np.clip(rawTimber,.005,.95)
            if name=='VillageTimber_GraterHandle':pixels[:,:,:3]=np.clip(rawTimber*np.asarray((1.10,1.02,.90)),.02,.88)
            if name=='VillageTimber':pixels[:,:,:3]=np.clip(pixels[:,:,:3]*np.asarray((1.16,1.06,.94)),.02,.92)
        if name in ('VillageTimber','VillageTimber_GraterHandle','VillageTimber_Worn'):
            # The same old-elm field identifies retained finish and exposed
            # grain. Reduce yellow bias and retain darker finish islands.
            timberLight=rawTimber[:,:,0]*.2126+rawTimber[:,:,1]*.7152+rawTimber[:,:,2]*.0722
            oldFilm=np.clip((.40-SurfacePhotoBlur(timberLight,4))/.25,0,1)
            body=pixels[:,:,:3];neutral=body[:,:,0]*.2126+body[:,:,1]*.7152+body[:,:,2]*.0722
            body=body*.84+neutral[:,:,None]*.16
            pixels[:,:,:3]=np.clip(body*(1-.12*oldFilm[:,:,None]),.02,.92)
        if texture=='wicker':
            # Broad, lengthwise bleaching and oil-darkened intervals sit over
            # the shared bark grain; different UV offsets vary each real reed.
            vv=np.arange(h,dtype=np.float32)[:,None]/h;uu=np.arange(w,dtype=np.float32)[None,:]/w
            bleach=np.clip((np.sin(vv*21+2*np.sin(uu*17))-.10)*.30,0,.26)
            oil=np.clip((np.sin(vv*13+uu*11+1.7)-.45)*.23,0,.13)
            pale=np.array([.31,.285,.23],dtype=np.float32)
            pixels[:,:,:3]=pixels[:,:,:3]*(1-bleach[:,:,None])+pale*bleach[:,:,None]
            pixels[:,:,:3]*=1-oil[:,:,None]
        if oxide is not None:
            rusty=np.array([.29,.13,.065],dtype=np.float32)
            pixels[:,:,:3]=pixels[:,:,:3]*(1-oxide[:,:,None]) + rusty*oxide[:,:,None]
        image=bpy.data.images.new('Texture_K09_'+name+'_Base',width=w,height=h,alpha=True);image.pixels.foreach_set(pixels.ravel());image.pack()
        node=nodes.new('ShaderNodeTexImage');node.image=image;links.new(node.outputs['Color'],bsdf.inputs['Base Color'])
        normal=nodes.new('ShaderNodeTexImage');normal.image=SourceTexture('Normal',True);normalmap=nodes.new('ShaderNodeNormalMap');normalmap.inputs['Strength'].default_value=.55 if name=='OldFibreBinding' else .32 if texture=='wicker' else .48
        links.new(normal.outputs['Color'],normalmap.inputs['Color']);links.new(normalmap.outputs['Normal'],bsdf.inputs['Normal'])
        orm=nodes.new('ShaderNodeTexImage');orm.image=SourceTexture('Orm',True)
        if oxide is not None:
            src=orm.image;ow,oh=src.size;p=np.empty(ow*oh*4,dtype=np.float32);src.pixels.foreach_get(p);p=p.reshape((oh,ow,4));fy=h//oh;fx=w//ow
            mask=oxide.reshape(oh,fy,ow,fx).mean(axis=(1,3)) if h%oh==0 and w%ow==0 else np.zeros((oh,ow),dtype=np.float32)
            p[:,:,1]=np.clip(p[:,:,1]+.12*mask,0,1);p[:,:,2]=np.clip(.65*(1-mask)+.08*mask,0,1)
            image=bpy.data.images.new('Texture_K09_'+name+'_Orm',width=ow,height=oh,alpha=True);image.colorspace_settings.name='Non-Color';image.pixels.foreach_set(p.ravel());image.pack();orm.image=image
        if wear:
            src=orm.image;w,h=src.size;p=np.empty(w*h*4,dtype=np.float32);src.pixels.foreach_get(p);p=p.reshape((h,w,4));vv=np.arange(h,dtype=np.float32)[:,None]/h
            hand=np.exp(-((vv-.48)/.20)**4);p[:,:,1]=np.clip(p[:,:,1]*(1-.40*hand),.35,1)
            image=bpy.data.images.new('Texture_K09_'+name+'_Orm',width=w,height=h,alpha=True);image.colorspace_settings.name='Non-Color';image.pixels.foreach_set(p.ravel());image.pack();orm.image=image
        sep=nodes.new('ShaderNodeSeparateColor');links.new(orm.outputs['Color'],sep.inputs[0]);links.new(sep.outputs['Green'],bsdf.inputs['Roughness']);links.new(sep.outputs['Blue'],bsdf.inputs['Metallic'])
    return mat

wicker = [Material('Wicker', (0.31,0.19,0.09),texture='wicker',tint=(1.25,1.16,.94)), Material('Wicker_Worn', (0.40,0.26,0.13),texture='wicker',tint=(1.55,1.45,1.20)), Material('Wicker_Dark', (0.22,0.14,0.07),texture='wicker',tint=(.96,.86,.70))]
wood = Material('VillageTimber', (0.32,0.19,0.085),texture='wood',tint=(1.08,.88,.67))
woodGrip = Material('VillageTimber_Grip', (0.32,0.19,0.085),texture='wood',tint=(.84,.77,.67),wear=True)
woodSpatula = Material('VillageTimber_SpatulaGrip', (0.32,0.19,0.085),texture='wood',tint=(.80,.74,.66),wear=True)
woodGraterHandle = Material('VillageTimber_GraterHandle',(.30,.20,.11),texture='wood')
woodWorn = Material('VillageTimber_Worn', (0.40,0.26,0.13),texture='wood',tint=(1.24,1.09,.89))
woodRepair = Material('VillageTimber_RepairElm',(.40,.29,.18),texture='wood')
iron = Material('ForgedIron', (0.37,0.30,0.24), 0.88, 0.2,texture='iron',tint=(1.04,.94,.83))
ironWorn = Material('ForgedIron_Worn', (0.42,0.30,0.19), 0.82, 0.2,texture='iron',tint=(1.02,.86,.72))
ironTeeth = Material('ForgedIron_WornCuttingFlap', (0.37,0.30,0.24),texture='iron')
ironCutEdge = Material('ForgedIron_CuttingEdge', (.62,.63,.60),texture='iron')
ironSpatula = Material('ForgedIron_SpatulaFace', (0.37,0.30,0.24),texture='iron')
ironEdge = Material('ForgedIron_UsedEdge', (0.45,0.45,0.43), 0.43, 0.78)
ironBinding = Material('ForgedIron_TarnishedBinding', (.18,.17,.145), .57, .55,texture='iron')
fibre = Material('OldFibreBinding', (0.31,0.235,0.14),texture='wood',tint=(1.02,.98,.86))

def NewCollection(name):
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    root = bpy.data.objects.new(name + '_Intact', None)
    col.objects.link(root)
    return col, root

def Link(obj, col, root, mat=None):
    for old in list(obj.users_collection): old.objects.unlink(obj)
    col.objects.link(obj)
    obj.parent = root
    if mat: obj.data.materials.append(mat)
    return obj

def Mesh(name, verts, faces, col, root, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    col.objects.link(obj)
    obj.parent = root
    obj.data.materials.append(mat)
    uv=data.uv_layers.new(name='UVMap')
    for polygon in data.polygons:
        for loopIndex in polygon.loop_indices:
            co=data.vertices[data.loops[loopIndex].vertex_index].co
            uv.data[loopIndex].uv=(.5+co.x*2+co.z*.5,.5+co.y*2+co.z*.4)
    return obj

def Box(name, center, size, col, root, mat, bevel=0.0015):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if 'wood rail' in name.lower() or 'splice' in name.lower():
        rng=random.Random(name)
        for vertex in obj.data.vertices:
            vertex.co.x+=rng.uniform(-.0011,.0011)
            vertex.co.y+=rng.uniform(-.0009,.0009)
            vertex.co.z+=rng.uniform(-.00065,.00065)
    Link(obj, col, root, mat)
    if bevel:
        mod = obj.modifiers.new('Worn edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 2 if name=='Left wood rail' else 1
        mod.affect = 'EDGES'
        mod2 = obj.modifiers.new('Corner normals', 'WEIGHTED_NORMAL')
    return obj

def Rod(name, points, radius, col, root, mat, sides=3, flatWeave=False, ringIndexOffset=0,sectionScales=None,sectionWidths=None):
    # Explicit polygonal rods keep the game geometry predictable; there is
    # real space between strands instead of a painted weave.
    verts, faces = [], []
    lengths=[0.0]
    for i in range(1,len(points)):lengths.append(lengths[-1]+(Vector(points[i])-Vector(points[i-1])).length)
    phase=random.Random(name).uniform(0,2*math.pi)
    for i, p in enumerate(points):
        p = Vector(p)
        tangent = Vector(points[min(i+1,len(points)-1)]) - Vector(points[max(i-1,0)])
        tangent.normalize()
        ref = Vector((0,0,1)) if abs(tangent.z) < .85 else Vector((1,0,0))
        if name.startswith(('Willow warp','Willow weft')):ref=Vector((0,0,1))
        if name=='Old iron grip binding':ref=Vector((0,1,0))
        u = tangent.cross(ref).normalized()
        v = tangent.cross(u).normalized()
        if name=='Tucked binding tail':
            # Keep a thin front ribbon's width horizontal and its thickness
            # vertical. A Frenet reference switch at a steep bend twists the
            # triangular section through itself even on a monotone path.
            planar=Vector((tangent.x,tangent.y,0)).normalized();u=Vector((planar.y,-planar.x,0));v=Vector((0,0,-1))
        elif name.startswith('Willow weft'):
            # Oblique, parallel sections keep the thin triangular strip
            # ordered through each steep under/over bend. Rotating these
            # almost-flat sections can fold a triangulated side into its
            # opposite side even on a monotone centreline.
            u=Vector((0,-1,0));v=Vector((0,0,-1))
        for j in range(sides):
            a=2*math.pi*j/sides-(math.pi/6 if flatWeave else 0)
            radiusIndex=max(0,i-ringIndexOffset);localRadius=radius*(1+.08*math.sin(radiusIndex*.8+phase)+.035*math.sin(radiusIndex*2.1+phase))
            if name.startswith('Rim split fibre '):localRadius*=float(np.interp(i/(len(points)-1),(0,.5,1),(1,.65,.10)))
            if name.startswith('Irregular repair strand ') and name!='Irregular repair strand 00':localRadius*=float(np.interp(i/(len(points)-1),(0,.15,.75,1),(.22,1.0,.90,.25)))
            if flatWeave and name.startswith(('Willow warp','Willow weft')):
                localRadius*=sectionScales[i] if sectionScales is not None else 1.0
            pressure=.65+.25*abs(tangent.z) if 0<i<len(points)-1 else 0
            profileWidth=(1.42+.08*pressure if pressure else 1.0) if flatWeave else 1.0
            profileHeight=.90-.08*pressure if flatWeave else 1.0
            if name.startswith('Willow weft'):
                sectionRow=int(name.rsplit(' ',1)[-1]);fraction=max(0,min(1,(p.x-cx)/(2*willowBowlRadius)+.5));sectionFalloff=math.sin(math.pi*fraction)**.65
                sectionWidth=1+sectionFalloff*(.08*math.sin(sectionRow*1.9+.4)+.06*math.sin(2*math.pi*fraction+sectionRow*.9))
                profileHeight*=.36*(1+.25*sectionFalloff);profileWidth*=1.40*sectionWidth
            elif name.startswith('Willow warp'):
                profileWidth*=1.16 if int(name.rsplit(' ',1)[-1]) in (3,5,7,9,11) else 1.06
            if name.startswith('Rim split fibre '):profileHeight=.24
            if name=='Tucked binding tail':profileWidth=1.60;profileHeight=.60
            if name.startswith('Willow weft'):profileWidth*=1.15
            elif name.startswith('Willow warp'):profileWidth*=1.15 if int(name.rsplit(' ',1)[-1]) in (3,5,7,9,11) else 1.10
            if flatWeave and sectionWidths is not None:profileWidth*=sectionWidths[i]/max(sectionScales[i],1e-8)
            verts.append(tuple(p + localRadius*(math.cos(a)*u*profileWidth+math.sin(a)*v*profileHeight)))
    for i in range(len(points)-1):
        for j in range(sides):
            a=i*sides+j; b=i*sides+(j+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple((len(points)-1)*sides+j for j in range(sides)))
    obj=Mesh(name, verts, faces, col, root, mat)
    uv=obj.data.uv_layers.active;offset=random.Random(name+'uv').uniform(.16,.72)
    for poly in obj.data.polygons:
        poly.use_smooth=(len(poly.vertices)==4)
        for li in poly.loop_indices:
            vi=obj.data.loops[li].vertex_index;k=vi%sides;index=vi//sides
            if len(poly.vertices)==4: uv.data[li].uv=(offset+.07*k/(sides-1),.08+lengths[index]*3.4)
            else:
                angle=2*math.pi*k/sides;uv.data[li].uv=(offset+.01*math.cos(angle),.08+lengths[index]*3.4+.01*math.sin(angle))
    return obj

def CylinderBetween(name, a, b, radius, col, root, mat, vertices=10):
    a,b=Vector(a),Vector(b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=(b-a).length, location=(a+b)*.5)
    obj=bpy.context.object
    obj.name=name
    obj.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return Link(obj,col,root,mat)

def FitVisibleCane(obj,supportObjects,maxAdjustment=.0012):
    from mathutils.bvhtree import BVHTree
    bpy.context.view_layer.objects.active=obj;modifier=obj.modifiers.new('Final cane triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=modifier.name);bpy.context.view_layer.update()
    deps=bpy.context.evaluated_depsgraph_get();trees=[WillowWorldTree(support) for support in supportObjects];original=[vertex.co.copy() for vertex in obj.data.vertices];inverse=obj.matrix_world.inverted()
    for iteration in range(24):
        tree=WillowWorldTree(obj);affected={}
        for index,supportTree in enumerate(trees):
            for faceIndex,_ in tree.overlap(supportTree):
                for vertexIndex in obj.data.polygons[faceIndex].vertices:affected.setdefault(vertexIndex,set()).add(index)
        if not affected:break
        for vertexIndex,indices in affected.items():
            point=obj.matrix_world@obj.data.vertices[vertexIndex].co
            for index in indices:
                hit=trees[index].find_nearest(point);assert hit[0] is not None;gap=(point-hit[0]).dot(hit[1]);point+=hit[1]*min(.00022,max(.00008,.00010-gap))
            obj.data.vertices[vertexIndex].co=inverse@point
            assert (obj.data.vertices[vertexIndex].co-original[vertexIndex]).length<=maxAdjustment,'Visible cane needs a different local route'
        obj.data.update();bpy.context.view_layer.update()
    else:raise RuntimeError('Visible cane contact did not resolve')
    finalTree=WillowWorldTree(obj);assert all(not finalTree.overlap(supportTree) for supportTree in trees),'Visible cane still cuts a support'
    selfHits=[(a,b) for a,b in finalTree.overlap(finalTree) if a<b and not set(obj.data.polygons[a].vertices).intersection(obj.data.polygons[b].vertices)]
    assert not selfHits,'Visible cane has an unshared self intersection'
    return {'iterations':iteration,'maxVertexAdjustmentM':max((vertex.co-before).length for vertex,before in zip(obj.data.vertices,original)),'maxAllowedAdjustmentM':maxAdjustment,'supportIntersections':0}

def ChipWood(obj, location, radius):
    # Remove a small physical notch in a worn exterior corner. This is not a
    # painted dark mark; the cutter is deleted after its boolean is applied.
    bpy.context.view_layer.objects.active=obj
    for modifier in list(obj.modifiers):bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=radius,location=location)
    cutter=bpy.context.object;bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('Old corner chip','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
    bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
    return obj

def HangingHandle(name, length, width, thickness, y0, z0, col, root, mat):
    y1 = y0-length
    if 'Grater' in name:
        # Cross rail and projecting handle are one worn board. The curved
        # shoulders belong to the silhouette, rather than a cube butted to it.
        # The selected C handle is offset toward the left rail. The outline
        # below follows its front contour; the metric scale is a design estimate.
        def GripPoint(pixelX,pixelY):return ((pixelX-graterHandleReferenceCentrePx)*graterHandlePixelToMetre,y0-(pixelY-442)*(.045/85))
        right=[GripPoint(x,y) for x,y in ((121,450),(113,460),(111,480),(112,505),(107,520),(100,525),(89,527))]
        left=[GripPoint(x,y) for x,y in ((84,527),(68,525),(61,520),(56,505),(53,480),(47,460),(43,450))]
        outline=[(-graterWorkingHalfWidth,y0+.016),(graterWorkingHalfWidth,y0+.016),(graterWorkingHalfWidth,y0+.001),*right,*left,(-graterWorkingHalfWidth,y0+.001)]
        count=len(outline);verts=[(x,y,z0+s*thickness*.5) for s in (-1,1) for x,y in outline]
        faces=[tuple(range(count)),tuple(reversed(range(count,count*2)))]
        faces.extend((i,i+count,(i+1)%count+count,(i+1)%count) for i in range(count))
        obj=Mesh(name,verts,faces,col,root,mat)
        bpy.context.view_layer.objects.active=obj
        bevel=obj.modifiers.new('Rounded worn grip','BEVEL'); bevel.width=.0022; bevel.segments=1
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    else:
        profileSides=10 if 'Skimmer' in name else 12;verts=[];faces=[];rings=[(0,.82),(.035,.95),(.20,1.0),(.50,.98),(.78,.96),(.94,.92),(.98,.78),(1,.25)]
        if 'Spatula' in name:rings=[(0,.77),(.04,.79),(.105,.84),(.23,.93),(.355,.97),(.48,1.015),(.605,1.04),(.73,1.04),(.825,.995),(.8875,.95),(.95,.725),(.981,.565),(1,.24)]
        if 'Skimmer' in name:rings=[(0,.68),(.20,.88),(.91,.92),(1,.64)]
        for t,scale in rings:
            y=y0-length*t
            for k in range(profileSides):
                a=2*math.pi*k/profileSides;wobble=1+.055*math.sin(3*a+5*t)+.025*math.sin(7*a-9*t)
                fittedTip=.005*max(0,1-t/.20) if 'Skimmer' in name else 0
                verts.append((width*.5*scale*wobble*math.cos(a)+.0004*math.sin(t*5),y,z0+fittedTip+thickness*.5*scale*wobble*math.sin(a)))
        for i in range(len(rings)-1):
            for k in range(profileSides):
                a=i*profileSides+k;b=i*profileSides+(k+1)%profileSides;faces.append((a,b,b+profileSides,a+profileSides))
        faces.extend([tuple(reversed(range(profileSides))),tuple((len(rings)-1)*profileSides+k for k in range(profileSides))])
        obj=Mesh(name,verts,faces,col,root,mat)
        for poly in obj.data.polygons:poly.use_smooth=True
    bpy.context.view_layer.objects.active=obj
    holeY=y1+(graterHandleHoleFromButt if 'Grater' in name else .0215 if 'Spatula' in name else .013)
    holeX=graterHandleHoleX if 'Grater' in name else -.0008 if 'Spatula' in name else 0
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=min(width*.19,.0042 if 'Grater' in name else .0041 if 'Spatula' in name else .0037),depth=thickness*3,location=(holeX,holeY,z0))
    cutter=bpy.context.object
    for vertex in cutter.data.vertices:
        a=math.atan2(vertex.co.y,vertex.co.x);gain=1+.22*math.exp(-((a-1.05)/.33)**2)+.12*math.exp(-((a+1.55)/.30)**2)
        vertex.co.x*=gain;vertex.co.y*=gain
    bpy.context.view_layer.objects.active=obj
    cut=obj.modifiers.new('Actual hanging hole','BOOLEAN'); cut.operation='DIFFERENCE'; cut.object=cutter
    bpy.ops.object.modifier_apply(modifier=cut.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    if 'Grater' not in name:
        # Shallow, real gouges in the exposed upper timber, not painted lines.
        for k in range(2):
            bpy.ops.mesh.primitive_cube_add(size=1,location=((-1 if k==0 else 1)*width*.22,y1+length*(.33+.24*k),z0+thickness*.44))
            scratch=bpy.context.object; scratch.dimensions=(.00065,length*.22,.0014)
            bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
            bpy.context.view_layer.objects.active=obj
            groove=obj.modifiers.new('Long grip wear','BOOLEAN'); groove.operation='DIFFERENCE'; groove.object=scratch
            bpy.ops.object.modifier_apply(modifier=groove.name)
            bpy.data.objects.remove(scratch,do_unlink=True)
        if 'Spatula' in name:
            # A shallow irregular split runs from the hanging hole toward the
            # rounded butt. It does not seal or replace the real through-hole.
            crackPoints=[(-.00095,y1-.0005),(-.00060,y1+.004),(-.00098,y1+.009),(-.00070,holeY-.001)]
            crackVerts=[]
            for x,y in crackPoints:
                for z in (z0+thickness*.20,z0+thickness):
                    crackVerts.extend([(x-.00034,y,z),(x+.00034,y,z)])
            crackFaces=[(0,2,3,1),(12,13,15,14)]
            for ring in range(len(crackPoints)-1):
                a=ring*4;b=a+4
                crackFaces.extend([(a,b,b+1,a+1),(a+2,a+3,b+3,b+2),(a,a+2,b+2,b),(a+1,b+1,b+3,a+3)])
            scratch=Mesh('Spatula butt split cutter',crackVerts,crackFaces,col,root,mat)
            bpy.context.view_layer.objects.active=obj
            split=obj.modifiers.new('Shallow butt split','BOOLEAN');split.operation='DIFFERENCE';split.object=scratch
            bpy.ops.object.modifier_apply(modifier=split.name);bpy.data.objects.remove(scratch,do_unlink=True)
    from mathutils.bvhtree import BVHTree
    bpy.context.view_layer.update()
    tree=BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get())
    hole=tree.ray_cast(Vector((holeX,holeY-obj.location.y,-.1)),Vector((0,0,1)),.2)[0]
    assert hole is None, name+' hanging hole is obstructed'
    if 'Grater' not in name:
        bpy.context.view_layer.objects.active=obj
        tri=obj.modifiers.new('Stable triangulation','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
    if 'Spatula' in name:
        # The shifted real hole/split can create Boolean triangles with a
        # submicrometre altitude. Remove those slivers in geometry before UVs.
        import bmesh
        cleanWood=bmesh.new();cleanWood.from_mesh(obj.data);beforeFaces=len(cleanWood.faces)
        bmesh.ops.dissolve_degenerate(cleanWood,edges=list(cleanWood.edges),dist=.00001)
        bmesh.ops.remove_doubles(cleanWood,verts=list(cleanWood.verts),dist=.0000001)
        cleanWood.normal_update();bmesh.ops.recalc_face_normals(cleanWood,faces=list(cleanWood.faces))
        assert all(edge.is_manifold for edge in cleanWood.edges),'Spatula Boolean repair left an open timber boundary'
        obj['wood_boolean_cleanup_removed_faces']=beforeFaces-len(cleanWood.faces)
        cleanWood.to_mesh(obj.data);cleanWood.free();obj.data.update()
    if 'Skimmer' in name:
        # Removing a redundant shaft ring can expose a tiny Boolean fin at
        # the hanging hole. It is not an authored splinter or a hole wall.
        import bmesh
        handleMesh=bmesh.new();handleMesh.from_mesh(obj.data)
        fins=[face for face in handleMesh.faces if len(face.verts)==3 and face.calc_area()<1e-6
              and sum(edge.is_boundary for edge in face.edges)==2 and any(len(edge.link_faces)>2 for edge in face.edges)]
        if fins:
            bmesh.ops.delete(handleMesh,geom=fins,context='FACES_ONLY')
            wireEdges=[edge for edge in handleMesh.edges if not edge.link_faces]
            if wireEdges:bmesh.ops.delete(handleMesh,geom=wireEdges,context='EDGES')
            looseVertices=[vertex for vertex in handleMesh.verts if not vertex.link_edges]
            if looseVertices:bmesh.ops.delete(handleMesh,geom=looseVertices,context='VERTS')
        assert all(edge.is_manifold for edge in handleMesh.edges),'Skimmer grip has an unresolved Boolean boundary'
        handleMesh.to_mesh(obj.data);handleMesh.free();obj.data.update();obj['removed_boolean_fin_faces']=len(fins)
    obj['hanging_hole_local_center']=[holeX,holeY,z0]
    return y1,obj

def RoundedWrap(name,width,thickness,y0,z0,length,col,root,mat,turns=5,steps=31,gripLength=.100,sides=5,fitObjects=None):
    verts=[];faces=[];fitReport=None;supportNormals=[];supportOffset=.00065 if name=='Old iron grip binding' and fitObjects else .00028
    if fitObjects:
        from mathutils.bvhtree import BVHTree
        bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
        surfaces=[BVHTree.FromObject(o,deps) for o in fitObjects];supportTriangles=[];sectionCache={}
        for target in fitObjects:
            evaluated=target.evaluated_get(deps);data=evaluated.to_mesh();data.calc_loop_triangles()
            supportTriangles.extend([[target.matrix_world@data.vertices[i].co for i in tri.vertices] for tri in data.loop_triangles]);evaluated.to_mesh_clear()
        supportTriangles=np.asarray(supportTriangles,dtype=np.float64)
        minY=supportTriangles[:,:,1].min(axis=1);maxY=supportTriangles[:,:,1].max(axis=1)
    def Cross2(a,b):return a[0]*b[1]-a[1]*b[0]
    def HullSurface(angle,y):
        # A tensioned strip follows the convex section of the actual gathered
        # reeds/wood. This replaces a fixed ellipse and radial inflation.
        key=round(float(y),8)
        if key not in sectionCache:
            points=[]
            for triangle in supportTriangles[(minY<=y)&(maxY>=y)]:
                for j in range(3):
                    a=triangle[j];b=triangle[(j+1)%3]
                    if (a[1]<=y<b[1]) or (b[1]<=y<a[1]):
                        t=(y-a[1])/(b[1]-a[1]);points.append((float(a[0]+t*(b[0]-a[0])),float(a[2]+t*(b[2]-a[2]))))
            points=sorted(set(points));assert len(points)>=3,'Missing binding cross section'
            lower=[];upper=[]
            for sequence,half in ((points,lower),(list(reversed(points)),upper)):
                for p in sequence:
                    while len(half)>=2 and Cross2(np.subtract(half[-1],half[-2]),np.subtract(p,half[-1]))<=1e-14:half.pop()
                    half.append(p)
            rawHull=lower[:-1]+upper[:-1];center=sum(np.asarray(p) for p in rawHull)/len(rawHull)
            # Round the tiny support offset itself. Adjacent polygon normals
            # otherwise create a small hard step in an otherwise fitted cane.
            padded=sorted(set((float(p[0]+supportOffset*math.cos(a)),float(p[1]+supportOffset*math.sin(a))) for p in rawHull for a in (2*math.pi*k/12 for k in range(12))))
            lower=[];upper=[]
            for sequence,half in ((padded,lower),(list(reversed(padded)),upper)):
                for p in sequence:
                    while len(half)>=2 and Cross2(np.subtract(half[-1],half[-2]),np.subtract(p,half[-1]))<=1e-14:half.pop()
                    half.append(p)
            hull=[np.asarray(p) for p in lower[:-1]+upper[:-1]];sectionCache[key]=(hull,center)
        hull,center=sectionCache[key];direction=np.array([math.cos(angle),math.sin(angle)]);hits=[]
        for j,a in enumerate(hull):
            b=hull[(j+1)%len(hull)];edge=b-a;den=Cross2(direction,edge)
            if abs(den)<1e-12:continue
            distance=Cross2(a-center,edge)/den;fraction=Cross2(a-center,direction)/den
            if distance>=0 and -.000001<=fraction<=1.000001:
                normal=np.array([edge[1],-edge[0]]);normal/=np.linalg.norm(normal);hits.append((distance,normal))
        assert hits,'Cannot trace binding section'
        distance,normal=max(hits,key=lambda item:item[0]);p=center+direction*distance
        return Vector((p[0],y,p[1])),Vector((normal[0],0,normal[1]))
    def SampleSurface(angle,y):return HullSurface(angle,y)[0]
    if name=='Old iron grip binding' and fitObjects:
        # A round iron wire uses a transported section about the coil axis,
        # rather than the flat return-strip construction of the willow tie.
        centres=[]
        for index in range(steps+1):
            q=index/steps;angle=2*math.pi*turns*q;y=y0-length*(q+.012*math.sin(4*math.pi*q))
            # Include the wire's finite axial footprint at the ferrule lip.
            choices=[HullSurface(angle,y+offset)[0] for offset in (-.0012,0,.0012)]
            support=max(choices,key=lambda point:point.x*math.cos(angle)+point.z*math.sin(angle))
            centres.append(Vector((support.x,y,support.z)))
        tube=Rod(name,centres,.00058,col,root,mat,sides=5)
        fitted=FitVisibleCane(tube,fitObjects,.0010)
        return tube,SampleSurface,fitted
    for i in range(steps+1):
        q=i/steps;a=2*math.pi*turns*q;t=(length/gripLength)*q
        if fitObjects:
            # Neck turns descend onto the grip; a denser collar then returns
            # across them and traps the tail. Spacing comes from this lashing.
            if name=='Old fitted grip binding':
                y=float(np.interp(q,[0,.24,.52,.875,1],[y0,y0-length*.26,y0-length*.58,y0-length,y0-length*.82]))
                axialHalf=.00135+.00030*min(1,max(0,(y0-y)/length))
            else:
                y=y0-length*(q+.012*math.sin(4*math.pi*q));axialHalf=.00075
        else:y=y0-length*(q+.012*math.sin(4*math.pi*q));axialHalf=.00075
        if fitObjects and sides==2:
            returnLayer=.00035*min(1,max(0,(q-.875)/.025))
            for sign in (-1,1):
                point,normal=HullSurface(a,y+sign*axialHalf);verts.append(tuple(point+normal*returnLayer));supportNormals.append(normal)
            continue
        scale=np.interp(t,[0,.035,.20,.50,.78,.94,.98,1],[.82,.95,1,.98,.96,.92,.78,.25]);cx=.0004*math.sin(t*5)
        wobble=1+.055*math.sin(3*a+5*t)+.025*math.sin(7*a-9*t)
        center=SampleSurface(a,y) if fitObjects else Vector((cx+(width*.5*scale*wobble+.00055)*math.cos(a),y,z0+(thickness*.5*scale*wobble+.00055)*math.sin(a)))
        for k in range(sides):
            b=2*math.pi*k/sides;verts.append((center.x+.0005*math.cos(b)*math.cos(a),y+axialHalf*math.sin(b),center.z+.0005*math.cos(b)*math.sin(a)));supportNormals.append(Vector((math.cos(a),0,math.sin(a))))
    for i in range(steps):
        if sides==2:
            a=i*2;faces.append((a,a+1,a+3,a+2));continue
        for k in range(sides):
            a=i*sides+k;b=i*sides+(k+1)%sides;faces.append((a,b,b+sides,a+sides))
    obj=Mesh(name,verts,faces,col,root,mat);uv=obj.data.uv_layers.active
    if fitObjects:
        # Correct only colliding strip vertices along the local section normal;
        # the high sample density keeps these local corrections submillimetre.
        adjustments=[0.0]*len(verts)
        for attempt in range(24):
            obj.data.update();bpy.context.view_layer.update();strap=BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get())
            overlaps=[pair for surface in surfaces for pair in strap.overlap(surface)]
            if not overlaps:break
            affected={vi for faceIndex,_ in overlaps for vi in obj.data.polygons[faceIndex].vertices}
            for vi in affected:obj.data.vertices[vi].co+=supportNormals[vi]*.00005;adjustments[vi]+=.00005
        else:
            obj.data.update();bpy.context.view_layer.update();strap=BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get())
            if any(strap.overlap(surface) for surface in surfaces):raise RuntimeError('Binding requires a revised support path, not a larger ring')
        returnAdjustments=[0.0]*len(verts)
        for attempt in range(17):
            obj.data.update();bpy.context.view_layer.update();strap=BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get())
            crossings=[(a,b) for a,b in strap.overlap(strap) if a<b and abs(a-b)>2 and not set(obj.data.polygons[a].vertices).intersection(obj.data.polygons[b].vertices)]
            if not crossings:break
            affected={vi for a,b in crossings for vi in obj.data.polygons[max(a,b)].vertices}
            assert min(vi//sides/steps for vi in affected)>.84,'Unexpected crossing in the descending lashing'
            for vi in affected:obj.data.vertices[vi].co+=supportNormals[vi]*.00005;returnAdjustments[vi]+=.00005
        else:raise RuntimeError('Return turn still intersects the earlier binding')
        activeRings=list(range(steps+1));simplificationTolerance=.00025;actualSimplificationError=0.0
        if sides==2:
            fittedVerts=[v.co.copy() for v in obj.data.vertices];fittedArray=np.asarray(fittedVerts)
            def BindingTriangles(active):return [tri for a,b in zip(active[:-1],active[1:]) for tri in ((a*2,a*2+1,b*2+1),(a*2,b*2+1,b*2))]
            def BindingTree(active):return BVHTree.FromPolygons(fittedVerts,BindingTriangles(active),all_triangles=True)
            bindingTree=BindingTree(activeRings);index=1
            while index<len(activeRings)-1:
                a,c,b=activeRings[index-1:index+2];error=0
                for side in (0,1):
                    p=fittedArray[a*2+side];q=fittedArray[b*2+side];direction=q-p;points=fittedArray[a*2+side:b*2+side+1:2]
                    fraction=np.clip((points-p)@direction/max(float(direction@direction),1e-20),0,1)
                    error=max(error,float(np.linalg.norm(points-(p+fraction[:,None]*direction),axis=1).max()))
                if error>simplificationTolerance:index+=1;continue
                triangles=[(a*2,a*2+1,b*2+1),(a*2,b*2+1,b*2)];candidate=BVHTree.FromPolygons(fittedVerts,triangles,all_triangles=True)
                if any(candidate.overlap(surface) for surface in surfaces):index+=1;continue
                if any(j//2 not in (index-2,index-1,index,index+1) for _,j in candidate.overlap(bindingTree)):index+=1;continue
                activeRings.pop(index);bindingTree=BindingTree(activeRings);index=max(1,index-1)
            triangles=BindingTriangles(activeRings)
            actualSimplificationError=0.0
            for a,b in zip(activeRings[:-1],activeRings[1:]):
                for side in (0,1):
                    p=fittedArray[a*2+side];q=fittedArray[b*2+side];direction=q-p;points=fittedArray[a*2+side:b*2+side+1:2]
                    fraction=np.clip((points-p)@direction/max(float(direction@direction),1e-20),0,1)
                    actualSimplificationError=max(actualSimplificationError,float(np.linalg.norm(points-(p+fraction[:,None]*direction),axis=1).max()))
            assert actualSimplificationError<=simplificationTolerance+1e-9,'Cane simplification exceeded its silhouette bound'
            assert not any(bindingTree.overlap(surface) for surface in surfaces),'Simplified cane cuts its real supports'
            assert not any(a<b and not set(triangles[a]).intersection(triangles[b]) for a,b in bindingTree.overlap(bindingTree)),'Simplified cane self-intersects'
            data=bpy.data.meshes.new(name+'_ContactPreserving');data.from_pydata(fittedVerts,[],triangles);data.update();data.materials.append(mat)
            oldData=obj.data;obj.data=data;bpy.data.meshes.remove(oldData);uv=data.uv_layers.new(name='UVMap')
        distances=[]
        for i in activeRings:
            center=sum((obj.data.vertices[i*sides+k].co for k in range(sides)),Vector())/sides
            distances.append(min(hit[3] for surface in surfaces if (hit:=surface.find_nearest(center))[0] is not None))
        fitReport={'centerline_distance_min_m':min(distances),'centerline_distance_median_m':sorted(distances)[len(distances)//2],
                    'centerline_distance_max_m':max(distances),'radial_half_thickness_m':0 if sides==2 else .0005,
                    'support_offset_m':supportOffset,'representation':'double_sided_split_cane_surface' if sides==2 else 'closed_profile',
                    'max_local_normal_adjustment_m':max(adjustments),'return_layer_lift_m':.00035,'max_return_overlap_adjustment_m':max(returnAdjustments),
                    'unintended_binding_self_intersections':len(crossings),'section_method':'convex hull of actual wood and five reed mesh slices',
                    'simplification_max_edge_deviation_m':simplificationTolerance,'binding_triangles_before':steps*sides*2 if sides!=2 else steps*2,
                    'simplification_actual_max_edge_deviation_m':actualSimplificationError,'binding_triangles_after':len(obj.data.polygons),
                    'retained_rings':len(activeRings),'retained_ring_indices':activeRings,
                    'lashing_path':'Continuous nine-turn descent, short return winding, overhand knot and loose end'}
    bindingUvDistances=[0.]
    for ring in range(1,steps+1):
        previous=sum((obj.data.vertices[(ring-1)*sides+side].co for side in range(sides)),Vector())/sides
        current=sum((obj.data.vertices[ring*sides+side].co for side in range(sides)),Vector())/sides
        bindingUvDistances.append(bindingUvDistances[-1]+(current-previous).length)
    for poly in obj.data.polygons:
        poly.use_smooth=True
        for li in poly.loop_indices:
            vi=obj.data.loops[li].vertex_index
            uv.data[li].uv=(.62+.035*(vi%sides)/(sides-1),.15+bindingUvDistances[vi//sides]/.16) if mat.name=='OldFibreBinding' else (.30+.35*(vi%sides)/(sides-1),.15+.70*(vi//sides)/steps)
    return obj,(SampleSurface if fitObjects else None),fitReport

def HangingLoop(holeY,z0,col,root,mat):
    points=[Vector((0,holeY,z0+.012)),Vector((0,holeY,z0-.012)),Vector((.004,holeY-.008,z0-.014)),Vector((.008,holeY-.019,z0-.009)),Vector((.008,holeY-.023,z0+.002)),Vector((.004,holeY-.012,z0+.011))]
    verts=[];faces=[];sides=3;count=len(points);distances=[0.]
    for index in range(1,count):distances.append(distances[-1]+(points[index]-points[index-1]).length)
    totalLength=distances[-1]+(points[0]-points[-1]).length
    for index,point in enumerate(points):
        tangent=(points[(index+1)%count]-points[(index-1)%count]).normalized();u=tangent.cross(Vector((1,0,0))).normalized();v=tangent.cross(u).normalized()
        for side in range(sides):
            angle=2*math.pi*side/sides;verts.append(tuple(point+.00065*(math.cos(angle)*u+math.sin(angle)*v)))
    for index in range(count):
        for side in range(sides):faces.append((index*sides+side,index*sides+(side+1)%sides,((index+1)%count)*sides+(side+1)%sides,((index+1)%count)*sides+side))
    obj=Mesh('Old hanging loop',verts,faces,col,root,mat);uv=obj.data.uv_layers.active;perimeter=3*math.sqrt(3)*.00065
    for polygon in obj.data.polygons:
        polygon.use_smooth=True;segment=polygon.index//sides;sideFace=polygon.index%sides
        for li in polygon.loop_indices:
            vi=obj.data.loops[li].vertex_index;side=vi%sides;ring=vi//sides
            around=1. if sideFace==sides-1 and side==0 else side/sides
            along=totalLength if segment==count-1 and ring==0 else distances[ring]
            uv.data[li].uv=(.62+around*perimeter/.08,.15+along/.16)
    return obj

def RingXy(name,cx,cy,r,z, col,root,mat,rad=.002, count=32):
    angles=[2*math.pi*i/count for i in range(count+1)]
    if name=='Double rim outer':angles=sorted(angles+[2.02,2.18])
    points=[(cx+r*math.cos(angle),cy+r*math.sin(angle),z) for angle in angles]
    obj=Rod(name,points,rad,col,root,mat)
    if name=='Double rim outer':
        # One broad lost-bark notch and a quieter second worn region retain
        # the closed cane core. Two authored sections localize the main notch.
        for ring,angle in enumerate(angles):
            distance=lambda center:math.atan2(math.sin(angle-center),math.cos(angle-center))
            loss=.66*math.exp(-(distance(2.095)/.105)**4)+.27*math.exp(-(distance(3.52)/.25)**4)
            center=Vector(points[ring]);radial=Vector((math.cos(angle),math.sin(angle),0))
            for side in range(3):
                vertex=obj.data.vertices[ring*3+side];offset=vertex.co-center
                vertex.co=center+offset*(1-loss)+radial*(.0005*loss)
        obj.data.update()
        obj['rim_wear']='Closed low cane core with localized real section loss; not an opacity mask'
    return obj

def SingleRimLashing(name,angle,index,col,root,mat,widthGain=1.0,catchNetEnds=False):
    from mathutils.bvhtree import BVHTree
    width=.00215*(1+.18*math.sin(index*2.3))*widthGain;halfWidth=width*.5;origin=Vector((cx,cy,0))
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();rimTriangles=[];netEndTriangles=[];collisionTrees=[]
    for obj in col.objects:
        if obj.type!='MESH' or (obj.name.startswith('Rim tie') and not catchNetEnds):continue
        if obj.name.startswith('Double rim'):
            evaluated=obj.evaluated_get(deps);data=evaluated.to_mesh();data.calc_loop_triangles()
            rimTriangles.extend([[obj.matrix_world@data.vertices[i].co for i in triangle.vertices] for triangle in data.loop_triangles])
            evaluated.to_mesh_clear()
        if catchNetEnds and obj.name.startswith(('Willow warp','Willow weft')):
            evaluated=obj.evaluated_get(deps);data=evaluated.to_mesh();data.calc_loop_triangles()
            netEndTriangles.extend([[obj.matrix_world@data.vertices[i].co for i in triangle.vertices] for triangle in data.loop_triangles]);evaluated.to_mesh_clear()
        collisionTrees.append(WillowWorldTree(obj))
    def Clip(polygon,normal,threshold):
        output=[]
        if not polygon:return output
        for a,b in zip(polygon,polygon[1:]+polygon[:1]):
            da=(a-origin).dot(normal)-threshold;db=(b-origin).dot(normal)-threshold
            if da>=0:output.append(a)
            if (da>=0)!=(db>=0):output.append(a+(b-a)*(da/(da-db)))
        return output
    def Geometry(testAngle):
        radial=Vector((math.cos(testAngle),math.sin(testAngle),0));tangent=Vector((-radial.y,radial.x,0));projected=[]
        for triangle in rimTriangles:
            polygon=Clip(triangle,radial,.05);polygon=Clip(polygon,tangent,-halfWidth);polygon=Clip(polygon,-tangent,-halfWidth)
            projected.extend(((point-origin).dot(radial),point.z) for point in polygon)
        for triangle in netEndTriangles:
            polygon=Clip(triangle,radial,.095);polygon=Clip(polygon,tangent,-halfWidth);polygon=Clip(polygon,-tangent,-halfWidth)
            projected.extend(((point-origin).dot(radial),point.z) for point in polygon)
        assert projected,'Missing actual rim section'
        projected=np.asarray(projected,dtype=np.float64)
        normals=np.asarray([(math.cos(2*math.pi*i/6),math.sin(2*math.pi*i/6)) for i in range(6)])
        offsets=np.max(projected@normals.T,axis=0)+.00018
        profile=[np.linalg.solve(np.asarray([normals[i],normals[(i+1)%6]]),np.asarray([offsets[i],offsets[(i+1)%6]])) for i in range(6)]
        vertices=[]
        for radius,height in profile:
            point=origin+radial*float(radius)+Vector((0,0,float(height)))
            vertices.extend([tuple(point-tangent*halfWidth),tuple(point+tangent*halfWidth)])
        faces=[(2*i,2*i+1,2*((i+1)%6)+1,2*((i+1)%6)) for i in range(6)]
        triangles=[triangle for face in faces for triangle in ((face[0],face[1],face[2]),(face[0],face[2],face[3]))]
        tree=BVHTree.FromPolygons(vertices,triangles,all_triangles=True)
        return vertices,faces,any(tree.overlap(other) for other in collisionTrees)
    offsets=[0.]+[sign*step*.0125 for step in range(1,25 if catchNetEnds else 13) for sign in (-1,1)]
    for offset in offsets:
        vertices,faces,intersects=Geometry(angle+offset)
        if not intersects:break
    else:raise RuntimeError('Rim lashing needs a different local placement: '+name)
    obj=Mesh(name,vertices,faces,col,root,mat);uv=obj.data.uv_layers.active
    lashingArc=[0.]
    for ring in range(6):
        a=(Vector(vertices[ring*2])+Vector(vertices[ring*2+1]))*.5;b=(Vector(vertices[((ring+1)%6)*2])+Vector(vertices[((ring+1)%6)*2+1]))*.5
        lashingArc.append(lashingArc[-1]+(b-a).length)
    for polygon in obj.data.polygons:
        polygon.use_smooth=True
        for li in polygon.loop_indices:
            vi=obj.data.loops[li].vertex_index;ring=vi//2
            along=lashingArc[-1] if polygon.index==5 and ring==0 else lashingArc[ring]
            uv.data[li].uv=(.62+width/.08*(vi%2),.15+along/.16)
    obj['rim_fit']='Six actual-section support planes; minimum angular adjustment avoiding real net ends'
    obj['rim_clearance_m']=.00018;obj['rim_angle_offset_rad']=offset
    return obj




def RimLashing(name,angle,index,col,root,mat,widthGain=1.0,catchNetEnds=False):
    # Two real opaque ribbon loops share one named assembly. Each loop keeps
    # the existing six-plane actual-section support fit; no alpha or fake gap.
    combinedWidth=.00215*(1+.18*math.sin(index*2.3))*widthGain
    angleBias=.27*combinedWidth/.099
    first=SingleRimLashing(name+'_A',angle-angleBias,index,col,root,mat,widthGain=widthGain*.43,catchNetEnds=True)
    firstOffset=float(first['rim_angle_offset_rad'])-angleBias
    second=SingleRimLashing(name+'_B',angle+angleBias,index,col,root,mat,widthGain=widthGain*.43,catchNetEnds=True)
    secondOffset=float(second['rim_angle_offset_rad'])+angleBias
    assert not WillowWorldTree(first).overlap(WillowWorldTree(second)),'Two winding loops intersect'
    bpy.ops.object.select_all(action='DESELECT');first.select_set(True);second.select_set(True);bpy.context.view_layer.objects.active=first;bpy.ops.object.join()
    first.name=name;first['rim_angle_offset_rad']=(firstOffset+secondOffset)*.5;first['rim_loop_angle_offsets_rad']=[firstOffset,secondOffset]
    first['rim_winding_loops']=2;first['rim_fit']='Two real six-plane supported loops, independently collision-fitted';first['combined_nominal_width_m']=combinedWidth
    return first


# BEGIN_K09_WILLOW_SURFACE_MODULE
# Prepared from the verified three-component material study. No geometry is
# added to the game asset; high surfaces are selected-to-active bake sources.
import struct
import zlib
from mathutils.bvhtree import BVHTree

def WillowBlur(array,sigmaU=3.0,sigmaV=1.5):
    output=np.asarray(array,dtype=np.float32)
    for axis,sigma in ((1,sigmaU),(0,sigmaV)):
        if sigma<=.01:continue
        radius=max(1,int(math.ceil(sigma*3)));x=np.arange(-radius,radius+1,dtype=np.float32);kernel=np.exp(-.5*(x/sigma)**2);kernel/=kernel.sum()
        padding=[(0,0)]*output.ndim;padding[axis]=(radius,radius);padded=np.pad(output,padding,mode='edge');filtered=np.zeros_like(output)
        for offset,weight in enumerate(kernel):
            slices=[slice(None)]*output.ndim;slices[axis]=slice(offset,offset+output.shape[axis]);filtered+=padded[tuple(slices)]*weight
        output=filtered
    return output

def WillowWritePng(path,array):
    pixels=np.asarray(array,dtype=np.uint8);height,width=pixels.shape[:2];channels=1 if pixels.ndim==2 else pixels.shape[2];assert channels in (1,3,4)
    def Chunk(stream,kind,data):
        stream.write(struct.pack('>I',len(data)));stream.write(kind);stream.write(data);stream.write(struct.pack('>I',zlib.crc32(kind+data)&0xffffffff))
    with Path(path).open('wb') as stream:
        stream.write(b'\x89PNG\r\n\x1a\n');Chunk(stream,b'IHDR',struct.pack('>IIBBBBB',width,height,8,{1:0,3:2,4:6}[channels],0,0,0));compressor=zlib.compressobj(6);previous=np.zeros(width*channels,dtype=np.uint8)
        for row in pixels:
            current=row.reshape(-1);filtered=(current.astype(np.int16)-previous.astype(np.int16)).astype(np.uint8);data=compressor.compress(b'\x02'+filtered.tobytes())
            if data:Chunk(stream,b'IDAT',data)
            previous=current
        data=compressor.flush()
        if data:Chunk(stream,b'IDAT',data)
        Chunk(stream,b'IEND',b'')

def WillowWorldTree(obj):
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());data=evaluated.to_mesh();data.calc_loop_triangles();vertices=[obj.matrix_world@v.co for v in data.vertices];triangles=[tuple(t.vertices) for t in data.loop_triangles];tree=BVHTree.FromPolygons(vertices,triangles,all_triangles=True);evaluated.to_mesh_clear();return tree

def CollectWillowSurfaceParts(collection):
    objects=[obj for obj in collection.objects if obj.type=='MESH' and obj.data.materials[0].name.startswith('Wicker')]
    roleCounts=(sum(obj.name.startswith('Willow warp') for obj in objects),sum(obj.name.startswith('Willow weft') for obj in objects),sum('rim' in obj.name.lower() for obj in objects),sum(obj.name.startswith('Willow neck') for obj in objects),sum(obj.name.startswith('Irregular repair') for obj in objects))
    assert len(objects)==45 and roleCounts==(15,13,3,5,9),('Expected15x13 closed weave, three rims, five neck ribs and nine repair pieces',roleCounts)
    objects.sort(key=lambda obj:obj.name)
    legacySourceNames=sorted(obj.name for obj in objects if not (obj.name.startswith('Irregular repair strand ') and obj.name!='Irregular repair strand 00'))
    supports={obj.name:WillowWorldTree(obj) for obj in collection.objects if obj.type=='MESH'}
    records=[];bodySlot=0;rimSlot=0;neckSlot=0;repairSlot=0;atlasWidth=4096;atlasHeight=6144
    for index,obj in enumerate(objects):
        bpy.context.view_layer.objects.active=obj
        triangulate=obj.modifiers.new('Willow bake triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=triangulate.name)
        data=obj.data;uv=data.uv_layers.active
        counts={}
        for value in uv.data:
            key=round(float(value.uv.x),6);counts[key]=counts.get(key,0)+1
        levels=sorted(sorted(counts,key=counts.get,reverse=True)[:3]);assert min(np.diff(levels))>.02
        rings={};bodyFaces=[]
        for poly in data.polygons:
            values=[uv.data[li].uv.copy() for li in poly.loop_indices];sides=[min(range(3),key=lambda k:abs(float(p.x)-levels[k])) for p in values]
            if all(abs(float(p.x)-levels[k])<2e-5 for p,k in zip(values,sides)):
                bodyFaces.append(poly.index)
                for li,value,side in zip(poly.loop_indices,values,sides):rings.setdefault(round(float(value.y),7),{})[side]=obj.matrix_world@data.vertices[data.loops[li].vertex_index].co
        vLevels=sorted(rings);assert len(vLevels)>=3 and all(len(rings[v])==3 for v in vLevels)
        centres=[sum((rings[v][k] for k in range(3)),Vector())/3 for v in vLevels];edgeLengths=[];ringRecords=[]
        for v,centre in zip(vLevels,centres):
            points=[rings[v][k] for k in range(3)];edgeLengths.append([(points[(k+1)%3]-points[k]).length for k in range(3)]);ringRecords.append({'t':float((v-vLevels[0])/(vLevels[-1]-vLevels[0])),'center':list(centre),'points':[list(p) for p in points]})
        edges=np.mean(edgeLengths,axis=0);fractions=np.cumsum([0,*edges])/sum(edges);length=sum((centres[i]-centres[i-1]).length for i in range(1,len(centres)))
        flat=obj.name.startswith(('Willow warp','Willow weft'))
        if flat:
            rect=([(bodySlot%14)*192,(bodySlot//14)*2048,192,2048] if bodySlot<28 else [1536+(bodySlot-28)*192,4096,192,2048]);bodySlot+=1
        elif 'rim' in obj.name.lower():
            rect=([2816,0,256,6144] if obj.name=='Double rim inside binding' else [3072,0,512,6144] if obj.name=='Double rim inner' else [3584,0,512,6144]);rimSlot+=1
        elif obj.name.startswith('Willow neck'):
            rect=[256+neckSlot*256,4096,256,768];neckSlot+=1
        else:
            rect=[0,4096,256,2048] if repairSlot==0 else [2304,4096,256,2048] if obj.name=='Irregular repair strand 08' else [repairSlot*256,4864,256,1280];repairSlot+=1
        assert rect[0]+rect[2]<=atlasWidth and rect[1]+rect[3]<=atlasHeight
        def AtlasUv(u,v):return ((rect[0]+rect[2]*(.02+.96*u))/atlasWidth,(rect[1]+rect[3]*(.02+.96*v))/atlasHeight)
        for poly in data.polygons:
            if poly.index in bodyFaces:
                values=[uv.data[li].uv.copy() for li in poly.loop_indices];sides=[min(range(3),key=lambda k:abs(float(p.x)-levels[k])) for p in values];seam=0 in sides and 2 in sides
                for li,value,side in zip(poly.loop_indices,values,sides):uv.data[li].uv=AtlasUv(1 if seam and side==0 else fractions[side],(float(value.y)-vLevels[0])/(vLevels[-1]-vLevels[0]))
            else:
                coords=np.asarray([data.vertices[i].co for i in poly.vertices]);centre=coords.mean(axis=0);normal=np.cross(coords[1]-coords[0],coords[2]-coords[0]);axis=int(np.argmax(abs(normal)));a,b=[k for k in range(3) if k!=axis]
                for li,p in zip(poly.loop_indices,coords):uv.data[li].uv=((rect[0]+rect[2]*(.04+(p[a]-centre[a])*3))/atlasWidth,(rect[1]+rect[3]*(.008+(p[b]-centre[b])*1.5))/atlasHeight)
        mainRib=obj.name.startswith('Willow warp') and int(obj.name.split()[-1]) in (3,5,7,9,11)
        role=0 if mainRib else 1 if obj.name.startswith('Willow weft') else 2
        if obj.name.startswith('Irregular repair'):skinState=2
        elif obj.name.startswith('Willow neck'):skinState=2 if int(obj.name.split()[-1]) in (1,2,3) else 1
        elif not flat:skinState=1 if obj.name=='Double rim outer' else 0
        elif mainRib:skinState=0 if int(obj.name.split()[-1]) in (3,9) else 1 if int(obj.name.split()[-1]) in (4,8) else 2
        elif obj.name.startswith('Willow weft'):
            strand=int(obj.name.split()[-1]);physicalRowY=MapWillowCoordinate(0,ys[strand])[1];skinState=0 if abs(physicalRowY)>.055 else 2 if strand in (5,6,7) else 1
        else:
            strand=int(obj.name.split()[-1]);skinState=0 if abs(xs[strand])>.055 else 1
        pressureNodes=[]
        if flat:
            strand=int(obj.name.split()[-1])
            for ring in ringRecords[1:-1]:
                x,y,z=ring['center']
                if obj.name.startswith('Willow warp'):other=min(range(len(ys)),key=lambda k:abs(y-cy-ys[k]));upper=(strand+other)%2==0
                else:other=min(range(len(xs)),key=lambda k:abs(x-cx-xs[k]));upper=(strand+other)%2==1
                pressureNodes.append({'t':ring['t'],'u':float(fractions[1] if upper else (fractions[2]+1)/2),'strength':1.0})
        else:
            for segment in range(len(ringRecords)-1):
                for substep in range(6):
                    t=substep/6;a=ringRecords[segment];b=ringRecords[segment+1];points=[Vector(a['points'][k]).lerp(Vector(b['points'][k]),t) for k in range(3)];centre=sum(points,Vector())/3
                    choices=[]
                    for name,tree in supports.items():
                        if name==obj.name:continue
                        hit=tree.find_nearest(centre,.015)
                        if hit[0] is not None:choices.append(hit)
                    if not choices:continue
                    hit=min(choices,key=lambda value:value[3]);q=hit[0];best=None
                    for k in range(3):
                        direction=points[(k+1)%3]-points[k];fraction=max(0,min(1,(q-points[k]).dot(direction)/max(direction.length_squared,1e-20)));point=points[k]+direction*fraction;gap=(point-q).length
                        if best is None or gap<best[0]:best=(gap,float(fractions[k]+fraction*(fractions[k+1]-fractions[k])))
                    if best[0]<.0008:pressureNodes.append({'t':float(a['t']*(1-t)+b['t']*t),'u':best[1],'strength':float(max(.25,1-best[0]/.0008))})
        seed=int(hashlib.sha256(obj.name.encode()).hexdigest()[:8],16)/0xffffffff
        records.append({'name':obj.name,'flat':flat,'role':role,'skinState':skinState,'slot':legacySourceNames.index(obj.name) if obj.name in legacySourceNames else 35+int(obj.name[-2:])-1,'atlasRectPx':rect,'lengthM':length,'meanPerimeterM':float(sum(edges)),'faceFractions':fractions.tolist(),'rings':ringRecords,'pressureNodes':pressureNodes,'vSeed':float((.13+seed*.70)%1),'triangles':len(data.polygons)})
    assert (bodySlot,rimSlot,neckSlot,repairSlot)==(28,3,5,9)
    for index,first in enumerate(records):
        ax,ay,aw,ah=first['atlasRectPx']
        for second in records[index+1:]:
            bx,by,bw,bh=second['atlasRectPx']
            assert ax+aw<=bx or bx+bw<=ax or ay+ah<=by or by+bh<=ay,('Willow atlas rectangles overlap',first['name'],second['name'])
    digest=hashlib.sha256()
    for obj in sorted((obj for obj in collection.objects if obj.type=='MESH'),key=lambda value:value.name):
        mesh=obj.data;mesh.calc_loop_triangles();digest.update(obj.name.encode());digest.update(np.asarray([obj.matrix_world@vertex.co for vertex in mesh.vertices],dtype='<f4').tobytes());digest.update(np.asarray([tri.vertices for tri in mesh.loop_triangles],dtype='<u4').tobytes())
    return {'lowObjects':records,'atlasSize':[atlasWidth,atlasHeight],'sourceFieldMm':[80,160],'collectionName':collection.name,'supportGeometrySha256':digest.hexdigest()}

def WillowContactOcclusion(info):
    # Trace the actual complete low mesh. AO stays in the glTF occlusion
    # channel and affects indirect light; no contact shadows enter albedo.
    vertices=[];triangles=[]
    for obj in bpy.data.collections[info['collectionName']].objects:
        if obj.type!='MESH':continue
        mesh=obj.data;mesh.calc_loop_triangles();offset=len(vertices);vertices.extend([obj.matrix_world@vertex.co for vertex in mesh.vertices]);triangles.extend([tuple(offset+i for i in tri.vertices) for tri in mesh.loop_triangles])
    tree=BVHTree.FromPolygons(vertices,triangles,all_triangles=True);preview=os.environ.get('K09_QUICK_SURFACE')=='1';rayCount=8 if preview else 16;uCount=7 if preview else 11;grids={};distance=.012
    for part in info['lowObjects']:
        actualPartTree=WillowWorldTree(bpy.data.objects[part['name']])
        tCount=(49 if preview else 193) if 'rim' in part['name'].lower() else (33 if preview else 129);grid=np.empty((tCount,uCount),dtype=np.float32);rings=part['rings'];times=np.asarray([ring['t'] for ring in rings]);fractions=part['faceFractions']
        for row,t in enumerate(np.linspace(0,1,tCount)):
            ringIndex=max(0,min(len(rings)-2,int(np.searchsorted(times,t,side='right')-1)));factor=(t-times[ringIndex])/max(times[ringIndex+1]-times[ringIndex],1e-10);a=np.asarray(rings[ringIndex]['points']);b=np.asarray(rings[ringIndex+1]['points']);section=a*(1-factor)+b*factor;centre=section.mean(axis=0);axis=Vector(b.mean(axis=0)-a.mean(axis=0)).normalized()
            for column,u in enumerate(np.linspace(0,1,uCount)):
                side=max(0,min(2,int(np.searchsorted(fractions,u,side='right')-1)));fraction=(u-fractions[side])/max(fractions[side+1]-fractions[side],1e-10);point=Vector(section[side]*(1-fraction)+section[(side+1)%3]*fraction);edge=Vector(section[(side+1)%3]-section[side]);normal=edge.cross(axis).normalized()
                if normal.dot(point-Vector(centre))<0:normal=-normal
                nearest=actualPartTree.find_nearest(point,.002)
                assert nearest[0] is not None,'AO profile has no matching actual low surface'
                point=nearest[0];normal=nearest[1]
                reference=Vector((0,0,1)) if abs(normal.z)<.8 else Vector((1,0,0));tangent=normal.cross(reference).normalized();bitangent=normal.cross(tangent);occlusion=0
                for ray in range(rayCount):
                    radius=math.sqrt((ray+.5)/rayCount);angle=ray*2.399963229728653;direction=tangent*(radius*math.cos(angle))+bitangent*(radius*math.sin(angle))+normal*math.sqrt(1-radius*radius);hit=tree.ray_cast(point+normal*.00012,direction,distance)
                    if hit[0] is not None:occlusion+=(1-hit[3]/distance)**1.5
                grid[row,column]=max(.2,1-occlusion/rayCount)
        grids[part['name']]=grid;part['meanContactOcclusion']=float(grid.mean())
    info['contactOcclusion']={'method':'Cosine-weighted hemisphere rays against actual complete skimmer geometry','distanceM':distance,'surfaceOffsetM':.00012,'raysPerPoint':rayCount,'profileSamples':uCount,'previewOnly':preview,'channel':'glTF occlusion / ORM red; indirect light only'}
    return grids

def WillowOcclusionOutput(nodes,links,split):
    outputGroup=bpy.data.node_groups.get('glTF Material Output')
    if outputGroup is None:
        from io_scene_gltf2.blender.com.material_helpers import create_settings_group
        outputGroup=create_settings_group('glTF Material Output')
    sockets={item.name for item in outputGroup.interface.items_tree if item.item_type=='SOCKET'}
    for name,default in (('Occlusion',1.),('Thickness',0.),('Dispersion',0.),('Iridescence Factor',0.),('Iridescence Thickness Minimum',100.)):
        if name not in sockets:
            socket=outputGroup.interface.new_socket(name=name,in_out='INPUT',socket_type='NodeSocketFloat');socket.default_value=default
    output=nodes.new('ShaderNodeGroup');output.node_tree=outputGroup;links.new(split.outputs['Red'],output.inputs['Occlusion'])

def GenerateWillowSurfaceAtlases(info,out,sourceFile):
    image=bpy.data.images.load(str(sourceFile),check_existing=True);sourceWidth,sourceHeight=image.size;pixels=np.empty(sourceWidth*sourceHeight*4,dtype=np.float32);image.pixels.foreach_get(pixels);sourceImage=pixels.reshape(sourceHeight,sourceWidth,4)[::-1,:,:3].copy()
    width,height=info['atlasSize'];occlusionGrids=WillowContactOcclusion(info)
    baseAtlas=np.full((height,width,3),128,dtype=np.uint8);ormAtlas=np.empty((height,width,3),dtype=np.uint8);ormAtlas[:]=(255,180,0);heightAtlas=np.full((height,width),128,dtype=np.uint8)
    def Sample(x,y):
        x=np.clip(x,0,1)*(sourceWidth-1);y=np.clip(y,0,1)*(sourceHeight-1);x0=np.floor(x).astype(int);y0=np.floor(y).astype(int);x1=np.minimum(x0+1,sourceWidth-1);y1=np.minimum(y0+1,sourceHeight-1);fx=(x-x0)[:,:,None];fy=(y-y0)[:,:,None]
        return ((sourceImage[y0,x0]*(1-fx)+sourceImage[y0,x1]*fx)*(1-fy)+(sourceImage[y1,x0]*(1-fx)+sourceImage[y1,x1]*fx)*fy).astype(np.float32)
    for part in info['lowObjects']:
        tileX,tileY,tileWidth,tileHeight=part['atlasRectPx'];yy,xx=np.mgrid[:tileHeight,:tileWidth];u=np.clip(((xx+.5)/tileWidth-.02)/.96,0,1);t=np.clip((1-(yy+.5)/tileHeight-.02)/.96,0,1)
        lengthMm=part['lengthM']*1000;perimeterMm=part['meanPerimeterM']*1000
        def Luma(value):return WillowBlur(value[:,:,0]*.2126+value[:,:,1]*.7152+value[:,:,2]*.0722,.071*tileWidth*.96/perimeterMm,.34*tileHeight*.96/lengthMm)
        sourceV=part['vSeed']+t*lengthMm/160;sourceV=1-abs(np.mod(sourceV,2)-1)
        # Intact skin is sampled from the retained synthetic source patches,
        # not an average of the source's mostly exposed pale fibre fields.
        pools=[[[756,1344,820,1536],[192,936,256,1128],[768,1248,832,1440],[192,768,256,960]],
               [[396,264,460,456],[180,144,244,336],[696,1416,760,1608],[408,144,472,336]],
               [[636,1416,700,1608],[360,96,424,288],[648,1536,712,1728],[816,0,880,192]]]
        pool=pools[part['skinState']];patchWidthMm=64/(sourceWidth/80);patchHeightMm=192/(sourceHeight/160)
        across=u*perimeterMm/patchWidthMm+part['vSeed'];across=1-abs(np.mod(across,2)-1)
        along=t*lengthMm/patchHeightMm+part['vSeed']*4;period=np.floor(along).astype(np.int32);fraction=along-period;localV=np.where(period%2==0,fraction,1-fraction);phase=(period+part['slot'])%4
        blend=np.clip((fraction-.88)/.12,0,1);blend=blend*blend*(3-2*blend);oldSkin=np.zeros((tileHeight,tileWidth,3),dtype=np.float32)
        for patchIndex,rect in enumerate(pool):
            sample=Sample((rect[0]+across*(rect[2]-rect[0]-1))/(sourceWidth-1),(rect[1]+localV*(rect[3]-rect[1]-1))/(sourceHeight-1))
            weight=np.where(phase==patchIndex,1-blend,0)+np.where((phase+1)%4==patchIndex,blend,0);oldSkin+=sample*weight[:,:,None]
        skinTarget=((.34,.25,.17),(.49,.375,.26),(.63,.50,.35))[part['skinState']];part['intactSkinSourceRectsPx']=pool
        if 'rim' in part['name'].lower():skinTarget=(.52,.405,.29) if part['skinState']==1 else (.40,.30,.21)
        # State-specific diffuse reflectance calibration keeps the source grain
        # while distinguishing retained dark bark, mixed skin and worn fibres.
        # This does not multiply a baked lighting/shadow layer into the colour.
        oldSkin=np.clip(oldSkin*np.asarray(skinTarget)/np.maximum(oldSkin.mean(axis=(0,1)),.03),.035,.90)
        bareSamples=[Sample(offset+u*perimeterMm/80,1-sourceV) for offset in (.02,.62)];bareLights=[Luma(value) for value in bareSamples];bareWeights=[np.exp((light-.72)*12) for light in bareLights];bareTotal=sum(bareWeights)+1e-8;bareFiber=sum(value*weight[:,:,None] for value,weight in zip(bareSamples,bareWeights))/bareTotal[:,:,None]
        bareLight=Luma(bareFiber);skinLight=Luma(oldSkin);skin=np.clip((.73-skinLight)/.32,0,1);polish=np.zeros_like(u,dtype=np.float32);fractions=part['faceFractions'];top=(fractions[2]+1)/2
        bareFiber=np.clip(bareFiber*np.asarray((.76,.635,.47))/np.maximum(bareFiber.mean(axis=(0,1)),.03),.04,.94)
        for node in part['pressureNodes']:
            du=np.minimum(abs(u-node['u']),1-abs(u-node['u']));local=np.exp(-.5*((t-node['t'])/(.0017/part['lengthM']))**2)*np.exp(-.5*(du/.13)**2)*node['strength'];polish=np.maximum(polish,local.astype(np.float32))
        du=np.minimum(abs(u-top),1-abs(u-top));useFace=np.exp(-.5*(du/.23)**2);role=part['role'];threshold=(.78,.82,.70)[role];amount=(.60,.42,.90)[role]*(.18,1.0,1.20)[part['skinState']];p=np.clip((bareLight-threshold)/.06,0,1);photoWear=p*p*(3-2*p)*useFace*amount;peel=np.maximum(photoWear,polish*.96)
        if part['name']=='Double rim outer':
            # Exposed fibre follows the actual narrowed cane sections. Use the
            # retained bare-fibre source in base/roughness/relief together;
            # this is a material state, not a painted highlight or shadow.
            ringT=[ring['t'] for ring in part['rings']]
            ringAngles=np.unwrap([math.atan2(ring['center'][1]-cy,ring['center'][0]-cx) for ring in part['rings']])
            angles=np.interp(t,ringT,ringAngles)
            distance=lambda center:np.arctan2(np.sin(angles-center),np.cos(angles-center))
            exposed=.90*np.exp(-(distance(2.095)/.105)**4)+.48*np.exp(-(distance(3.52)/.25)**4)
            peel=np.maximum(peel,np.clip(exposed,0,1)*(.35+.65*useFace))
        rgb=np.clip(oldSkin*(1-peel[:,:,None])+bareFiber*peel[:,:,None],.08,.96);roughSkin=np.clip(.76+.08*(skin-.5),.71,.83);roughness=np.clip(roughSkin*(1-peel)+.58*peel-.10*polish,.43,.88)
        wavelength=max(.14,3*perimeterMm/(tileWidth*.96));fiber=.045*np.sin(2*np.pi*(u*perimeterMm/wavelength+.20*np.sin(t*2*np.pi*5)))+.025*np.sin(2*np.pi*(u*perimeterMm/.27+.12*np.sin(t*2*np.pi*3+part['slot'])))
        relief=np.clip(.5+(.12+.12*skin)*(1-peel)+fiber*(1-.75*polish),0,1);x=slice(tileX,tileX+tileWidth);y=slice(height-tileY-tileHeight,height-tileY)
        baseAtlas[y,x]=np.rint(rgb*255).astype(np.uint8);ormAtlas[y,x,1]=np.rint(roughness*255).astype(np.uint8);heightAtlas[y,x]=np.rint(relief*255).astype(np.uint8)
        grid=occlusionGrids[part['name']];gx=u*(grid.shape[1]-1);gy=t*(grid.shape[0]-1);x0=np.floor(gx).astype(int);y0=np.floor(gy).astype(int);x1=np.minimum(x0+1,grid.shape[1]-1);y1=np.minimum(y0+1,grid.shape[0]-1);fx=gx-x0;fy=gy-y0;ao=grid[y0,x0]*(1-fx)*(1-fy)+grid[y0,x1]*fx*(1-fy)+grid[y1,x0]*(1-fx)*fy+grid[y1,x1]*fx*fy;ormAtlas[y,x,0]=np.rint(ao*255).astype(np.uint8)
        part['skinDiffuseTargetSrgb']=skinTarget;part['meanBareFiberBlend']=float(peel.mean());part['texelsPerMmAlong']=tileHeight*.96/lengthMm;part['texelsPerMmAround']=tileWidth*.96/perimeterMm
    for suffix,array in [('Base',baseAtlas),('Orm',ormAtlas),('Height',heightAtlas)]:WillowWritePng(Path(out)/('Texture_K09WillowSurface_'+suffix+'.png'),array)
    return heightAtlas


def BakeWillowSurfaceNormals(info,out,heightData):
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16
    scene.render.threads_mode='FIXED';scene.render.threads=4
    width,height=info['atlasSize']
    def Load(suffix,data=False):
        image=bpy.data.images.load(str(out/('Texture_K09WillowSurface_'+suffix+'.png')),check_existing=False)
        if data:image.colorspace_settings.name='Non-Color'
        image.pack();return image
    baseImage=Load('Base');ormImage=Load('Orm',True);heightImage=Load('Height',True)
    normalImage=bpy.data.images.new('Texture_K09WillowSurface_Normal',width=width,height=height,alpha=True)
    normalImage.colorspace_settings.name='Non-Color'
    previousRoot=outputRoot/'Refinement/DoubleBindingV90/ValidatedNormalInputsFromV88'
    previousBake=json.loads((previousRoot/'Data_K09WillowSurfaceBake.json').read_text());previousInfo=json.loads((previousRoot/'Data_K09WillowSurfaceInfo.json').read_text())
    assert previousBake['normalBakeCoreMisses']==0 and previousBake['parts']==45 and previousInfo['atlasSize']==info['atlasSize']
    previousNormalRecord=next(item for item in previousBake['maps'] if item['kind']=='Normal');previousNormal=Path(previousNormalRecord['path']);assert hashlib.sha256(previousNormal.read_bytes()).hexdigest()==previousNormalRecord['sha256']
    previousNormalImage=bpy.data.images.load(str(previousNormal),check_existing=False);previousNormalImage.colorspace_settings.name='Non-Color'
    pixels=np.empty((height,width,4),dtype=np.float32);previousNormalImage.pixels.foreach_get(pixels.ravel());assert np.min(pixels[:,:,3])>.99
    previousHeightPath=previousRoot/'WillowMaps/Texture_K09WillowSurface_Height.png';previousHeightImage=bpy.data.images.load(str(previousHeightPath),check_existing=False);previousHeightImage.colorspace_settings.name='Non-Color'
    previousHeightPixels=np.empty((height,width,4),dtype=np.float32);previousHeightImage.pixels.foreach_get(previousHeightPixels.ravel());previousHeight=np.rint(previousHeightPixels[::-1,:,0]*255).astype(np.uint8);del previousHeightPixels
    previousParts={part['name']:part for part in previousInfo['lowObjects']};normalReuse={};normalReuseRecords=[]
    signatureKeys=('name','flat','atlasRectPx','faceFractions','rings','triangles')
    for part in info['lowObjects']:
        old=previousParts.get(part['name']);x,y,w,h=part['atlasRectPx'];fileSlice=(slice(height-y-h,height-y),slice(x,x+w))
        geometrySame=old is not None and all(old[key]==part[key] for key in signatureKeys);heightSame=np.array_equal(previousHeight[fileSlice],heightData[fileSlice]);reuse=geometrySame and heightSame
        normalReuse[part['name']]=reuse
        normalReuseRecords.append({'name':part['name'],'exactLoftAndLowInputEqual':geometrySame,'exactHeightTileEqual':heightSame,'reuseValidatedNormalTile':reuse})
        if not reuse:pixels[y:y+h,x:x+w]=(.5,.5,1,0)
    normalImage.pixels.foreach_set(pixels.ravel())
    print('NORMAL_INCREMENTAL_PLAN',sum(normalReuse.values()),'unchanged tiles;',len(normalReuse)-sum(normalReuse.values()),'rebakes')

    lowMaterial=bpy.data.materials.new('Wicker_AgedSurface');lowMaterial.use_nodes=True
    nodes=lowMaterial.node_tree.nodes;links=lowMaterial.node_tree.links;bsdf=nodes.get('Principled BSDF');bsdf.inputs['IOR'].default_value=1.45
    node=nodes.new('ShaderNodeTexImage');node.image=baseImage;links.new(node.outputs['Color'],bsdf.inputs['Base Color'])
    node=nodes.new('ShaderNodeTexImage');node.image=ormImage;split=nodes.new('ShaderNodeSeparateColor');links.new(node.outputs['Color'],split.inputs[0]);links.new(split.outputs['Green'],bsdf.inputs['Roughness']);links.new(split.outputs['Blue'],bsdf.inputs['Metallic'])
    WillowOcclusionOutput(nodes,links,split)
    bakeNode=nodes.new('ShaderNodeTexImage');bakeNode.image=normalImage;nodes.active=bakeNode
    highMaterial=bpy.data.materials.new('K09_WillowBakeHigh');highMaterial.use_nodes=True
    highNodes=highMaterial.node_tree.nodes;highLinks=highMaterial.node_tree.links;highBsdf=highNodes.get('Principled BSDF')
    heightNode=highNodes.new('ShaderNodeTexImage');heightNode.image=heightImage;bump=highNodes.new('ShaderNodeBump');bump.inputs['Distance'].default_value=.0001;bump.inputs['Strength'].default_value=1;highLinks.new(heightNode.outputs['Color'],bump.inputs['Height']);highLinks.new(bump.outputs['Normal'],highBsdf.inputs['Normal'])
    highCollection=bpy.data.collections.new('K09_WillowMaterialBakeHigh');scene.collection.children.link(highCollection)

    def Catmull(a,b,c,d,t):return .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)
    def RoundedProfileWeights():
        basis=np.eye(3);points=[];fraction=.42
        for k in range(3):
            vertex=basis[k];start=vertex*(1-fraction)+basis[(k-1)%3]*fraction;end=vertex*(1-fraction)+basis[(k+1)%3]*fraction
            for j in range(6):
                t=j/6;points.append((1-t)**2*start+2*(1-t)*t*vertex+t*t*end)
            nextStart=basis[(k+1)%3]*(1-fraction)+vertex*fraction
            for j in range(4):points.append(end*(1-j/4)+nextStart*(j/4))
        return points[3:]+points[:3]

    highObjects=[];lowObjects=[];bakeRecords=[]
    for index,objInfo in enumerate(info['lowObjects']):
        tileX,tileY,tileWidth,tileHeight=objInfo['atlasRectPx']
        def AtlasUv(u,v):return ((tileX+tileWidth*(.02+.96*u))/width,(tileY+tileHeight*(.02+.96*v))/height)
        low=bpy.data.objects[objInfo['name']];low.data.materials.clear();low.data.materials.append(lowMaterial);lowObjects.append(low)
        rings=objInfo['rings'];ringPoints=[np.asarray(r['points'],dtype=float) for r in rings]
        if objInfo['flat']:
            weights=RoundedProfileWeights();meanTriangle=np.mean(ringPoints,axis=0);profile=[w@meanTriangle for w in weights];distances=[0.0]
            for i in range(1,len(profile)):distances.append(distances[-1]+float(np.linalg.norm(profile[i]-profile[i-1])))
            perimeter=distances[-1]+float(np.linalg.norm(profile[0]-profile[-1]));profileU=[x/perimeter for x in distances];count=len(weights)
            def SectionPoints(triangle):return [w@triangle for w in weights]
        else:
            count=48;profileU=[i/count for i in range(count)]
            def SectionPoints(triangle):
                centre=triangle.mean(axis=0);u=triangle[0]-centre;v=(triangle[1]-centre+.5*u)/(math.sqrt(3)*.5)
                return [centre+u*math.cos(2*math.pi*k/count)+v*math.sin(2*math.pi*k/count) for k in range(count)]
        highRings=[];highT=[]
        for j in range(len(rings)-1):
            a=ringPoints[max(0,j-1)];b=ringPoints[j];c=ringPoints[j+1];d=ringPoints[min(len(rings)-1,j+2)]
            for k in range(4):
                t=k/4;triangle=Catmull(a,b,c,d,t);linear=b*(1-t)+c*t;deviation=triangle.mean(axis=0)-linear.mean(axis=0);distance=float(np.linalg.norm(deviation))
                if distance>.0003:triangle-=deviation*(1-.0003/distance)
                highRings.append(triangle);highT.append(rings[j]['t']*(1-t)+rings[j+1]['t']*t)
        highRings.append(ringPoints[-1]);highT.append(1.0)
        verts=[tuple(p) for triangle in highRings for p in SectionPoints(triangle)];faces=[];faceUvs=[]
        for j in range(len(highRings)-1):
            for k in range(count):
                nxt=(k+1)%count;faces.append((j*count+k,j*count+nxt,(j+1)*count+nxt,(j+1)*count+k));u0=profileU[k];u1=1 if nxt==0 else profileU[nxt]
                faceUvs.append([AtlasUv(u,v) for u,v in ((u0,highT[j]),(u1,highT[j]),(u1,highT[j+1]),(u0,highT[j+1]))])
        for ringIndex,reverse in ((0,True),(len(highRings)-1,False)):
            cap=list(range(ringIndex*count,(ringIndex+1)*count))
            if reverse:cap.reverse()
            faces.append(tuple(cap));coords=np.asarray([verts[i] for i in cap]);center=coords.mean(axis=0);normal=np.cross(coords[1]-coords[0],coords[2]-coords[0]);axis=int(np.argmax(abs(normal)));a,b=[k for k in range(3) if k!=axis]
            faceUvs.append([((tileX+tileWidth*(.04+(p[a]-center[a])*3))/width,(tileY+tileHeight*(.008+(p[b]-center[b])*1.5))/height) for p in coords])
        data=bpy.data.meshes.new('K09_WillowSampleHigh_'+str(index));data.from_pydata(verts,[],faces);data.update();uv=data.uv_layers.new(name='UVMap')
        for poly,coords in zip(data.polygons,faceUvs):
            poly.use_smooth=len(poly.vertices)==4
            for li,p in zip(poly.loop_indices,coords):uv.data[li].uv=p
        data.materials.append(highMaterial);high=bpy.data.objects.new('K09_WillowSampleHigh_'+str(index),data);highCollection.objects.link(high);highObjects.append(high)
        bpy.ops.object.select_all(action='DESELECT');low.select_set(True);high.select_set(True);bpy.context.view_layer.objects.active=low;nodes.active=bakeNode
        if not normalReuse[objInfo['name']]:bpy.ops.object.bake(type='NORMAL',normal_space='TANGENT',use_selected_to_active=True,cage_extrusion=.003,max_ray_distance=.008,margin=4,use_clear=False)
        bakeRecords.append({'low':low.name,'high':high.name,'lowTriangles':objInfo['triangles'],'highVertices':len(verts),'highFaces':len(faces),'normalSpace':'TANGENT','cageExtrusionM':.003,'maxRayM':.008,'fiberBumpDistanceM':.0001,'reusedValidatedNormalTile':normalReuse[objInfo['name']]})
        high.hide_render=True;high.hide_set(True)

    # Inspect actual bake coverage only in the interior of real low UV triangles.
    coverage=np.zeros((height,width),dtype=bool);owners=np.full((height,width),-1,dtype=np.int16);triangleRecords=[]
    for lowIndex,low in enumerate(lowObjects):
        data=low.data;uv=data.uv_layers.active
        data.calc_tangents(uvmap='UVMap')
        for poly in data.polygons:
            if not poly.use_smooth:continue
            p=np.asarray([uv.data[li].uv for li in poly.loop_indices])*np.array([width,height]);lo=np.maximum(0,np.floor(p.min(axis=0)).astype(int));hi=np.minimum([width-1,height-1],np.ceil(p.max(axis=0)).astype(int))
            yy,xx=np.mgrid[lo[1]:hi[1]+1,lo[0]:hi[0]+1];x=xx+.5;y=yy+.5
            def Edge(a,b):return (x-a[0])*(b[1]-a[1])-(y-a[1])*(b[0]-a[0])
            e=[Edge(p[k],p[(k+1)%3]) for k in range(3)];inside=((e[0]>=0)&(e[1]>=0)&(e[2]>=0))|((e[0]<=0)&(e[1]<=0)&(e[2]<=0));coverage[lo[1]:hi[1]+1,lo[0]:hi[0]+1]|=inside
            recordIndex=len(triangleRecords);triangleRecords.append((lowIndex,list(poly.loop_indices)));view=owners[lo[1]:hi[1]+1,lo[0]:hi[0]+1];view[inside]=recordIndex
    core=coverage.copy()
    for dy in (-2,-1,0,1,2):
        for dx in (-2,-1,0,1,2):core&=np.roll(np.roll(coverage,dy,axis=0),dx,axis=1)
    normalImage.pixels.foreach_get(pixels.ravel());miss=(pixels[:,:,3]<.5)|(pixels[:,:,:3].max(axis=2)<.01);missCore=int(np.sum(miss&core))
    rayMissCore=missCore;nearestDistances=[]
    if missCore:
        # A small number of UV samples near curved section edges can miss the ray
        # cage. Complete them from the SAME high surface, including its bounded
        # height-field gradient; never copy neighboring pixels or paint highlights.
        highData=[]
        for high in highObjects:
            data=high.data;data.calc_loop_triangles();points=np.asarray([v.co for v in data.vertices]);triangles=[tuple(t.vertices) for t in data.loop_triangles]
            highData.append((data,points,BVHTree.FromPolygons([Vector(p) for p in points],triangles,all_triangles=True)))
        heightPixels=heightData[::-1]
        def HeightGradient(uv):
            x=(float(uv[0])%1)*width-.5;y=(float(uv[1])%1)*height-.5;x0=math.floor(x);y0=math.floor(y);fx=x-x0;fy=y-y0
            a=float(heightPixels[y0%height,x0%width])/255;b=float(heightPixels[y0%height,(x0+1)%width])/255;c=float(heightPixels[(y0+1)%height,x0%width])/255;d=float(heightPixels[(y0+1)%height,(x0+1)%width])/255
            return np.array([((b-a)*(1-fy)+(d-c)*fy)*width,((c-a)*(1-fx)+(d-b)*fx)*height])
        def Barycentric(p,a,b,c):
            u=b-a;v=c-a;w=p-a;uu=float(u@u);uv=float(u@v);vv=float(v@v);wu=float(w@u);wv=float(w@v);den=uu*vv-uv*uv
            assert abs(den)>1e-24
            b=(vv*wu-uv*wv)/den;c=(uu*wv-uv*wu)/den;return np.array([1-b-c,b,c])
        for y,x in zip(*np.where(miss&core)):
            lowIndex,loops=triangleRecords[int(owners[y,x])];data=lowObjects[lowIndex].data;layer=data.uv_layers.active
            uv=np.asarray([layer.data[i].uv for i in loops]);pointUv=np.array([(x+.5)/width,(y+.5)/height]);matrix=np.column_stack((uv[1]-uv[0],uv[2]-uv[0]));bc=np.linalg.solve(matrix,pointUv-uv[0]);weights=np.array([1-bc.sum(),bc[0],bc[1]])
            positions=np.asarray([data.vertices[data.loops[i].vertex_index].co for i in loops]);point=weights@positions
            highMesh,highPoints,tree=highData[lowIndex];hit=tree.find_nearest(Vector(point),.008);assert hit[0] is not None and hit[3]<.003,'Nearest high-surface completion exceeded the cage bound'
            location=np.asarray(hit[0]);triangle=highMesh.loop_triangles[hit[2]];ids=list(triangle.vertices);hPositions=highPoints[ids];hWeights=Barycentric(location,*hPositions);hLoops=list(triangle.loops)
            hNormals=np.asarray([highMesh.corner_normals[i].vector for i in hLoops]);normal=hWeights@hNormals;normal/=np.linalg.norm(normal)
            hUv=np.asarray([highMesh.uv_layers.active.data[i].uv for i in hLoops]);surfaceUv=hWeights@hUv;duv1=hUv[1]-hUv[0];duv2=hUv[2]-hUv[0];det=float(duv1[0]*duv2[1]-duv1[1]*duv2[0])
            if abs(det)>1e-14:
                e1=hPositions[1]-hPositions[0];e2=hPositions[2]-hPositions[0];dpdu=(e1*duv2[1]-e2*duv1[1])/det;dpdv=(e2*duv1[0]-e1*duv2[0])/det;metric=np.array([[dpdu@dpdu,dpdu@dpdv],[dpdu@dpdv,dpdv@dpdv]])
                if abs(float(np.linalg.det(metric)))>1e-18:
                    coefficients=np.linalg.solve(metric,HeightGradient(surfaceUv));normal-=.0001*(coefficients[0]*dpdu+coefficients[1]*dpdv);normal/=np.linalg.norm(normal)
            n=weights@np.asarray([data.corner_normals[i].vector for i in loops]);n/=np.linalg.norm(n);tangent=weights@np.asarray([data.loops[i].tangent for i in loops]);tangent-=n*float(tangent@n);tangent/=np.linalg.norm(tangent);sign=1 if float(weights@np.asarray([data.loops[i].bitangent_sign for i in loops]))>=0 else -1;bitangent=np.cross(n,tangent)*sign
            mapped=np.array([normal@tangent,normal@bitangent,normal@n]);mapped/=np.linalg.norm(mapped);pixels[y,x,:3]=mapped*.5+.5;pixels[y,x,3]=1;nearestDistances.append(float(hit[3]))
        miss=(pixels[:,:,3]<.5)|(pixels[:,:,:3].max(axis=2)<.01);missCore=int(np.sum(miss&core))
    print('NORMAL_BAKE_COVERAGE',json.dumps({'rayCoreMisses':rayMissCore,'nearestHighResolved':len(nearestDistances),'maxNearestDistanceM':max(nearestDistances,default=0),'unresolvedCore':missCore}))
    assert missCore==0,'High-surface normal mapping left unresolved surface interiors'
    pixels[miss,:3]=(.5,.5,1);pixels[:,:,3]=1;normalImage.pixels.foreach_set(pixels.ravel());normalPath=out/'Texture_K09WillowSurface_Normal.png';normalImage.filepath_raw=str(normalPath);normalImage.file_format='PNG';normalImage.save();normalImage.pack()
    normalMap=nodes.new('ShaderNodeNormalMap');normalMap.inputs['Strength'].default_value=1;normalMap.uv_map='UVMap';links.new(bakeNode.outputs['Color'],normalMap.inputs['Color']);links.new(normalMap.outputs['Normal'],bsdf.inputs['Normal'])

    record={'normalBakeCoreTexels':int(core.sum()),'normalBakeRayCoreMisses':rayMissCore,'normalBakeClosestHighResolved':len(nearestDistances),'maxClosestHighDistanceM':max(nearestDistances,default=0),'normalBakeCoreMisses':missCore,'bakes':bakeRecords,'normalAtlas':str(normalPath),'normalAtlasSha256':hashlib.sha256(normalPath.read_bytes()).hexdigest()}
    reusedTileChecks=[]
    previousNormalPixels=np.empty((height,width,4),dtype=np.float32);previousNormalImage.pixels.foreach_get(previousNormalPixels.ravel())
    for part in info['lowObjects']:
        if not normalReuse[part['name']]:continue
        x,y,w,h=part['atlasRectPx'];actual=np.rint(pixels[y:y+h,x:x+w,:3]*255).astype(np.uint8);old=np.rint(previousNormalPixels[y:y+h,x:x+w,:3]*255).astype(np.uint8)
        assert np.array_equal(actual,old),'Validated unchanged normal tile was modified'
        reusedTileChecks.append({'name':part['name'],'decodedRgbExactlyEqual':True,'pixelSha256':hashlib.sha256(actual.tobytes()).hexdigest()})
    incremental={'previousCandidate':'V88_ValidatedInputsForDoubleBindingV90','previousNormalAtlasSha256':previousNormalRecord['sha256'],'previousBakeProducerSha256':previousBake['builderSha256'],'parts':normalReuseRecords,'reusedTileChecks':reusedTileChecks,'reusedParts':sum(normalReuse.values()),'rebakedParts':len(normalReuse)-sum(normalReuse.values()),'newBaseAndContactAOGenerated':True,'method':'Normal tiles only reuse when exact low/loft inputs and complete high-height tiles match. Changed tiles cleared before bake; all45 high objects rebuilt and actual core coverage checked.'}
    (out/'Data_K09IncrementalNormals.json').write_text(json.dumps(incremental,indent=2)+'\n');record['incrementalNormals']=incremental
    return lowMaterial,highObjects,record

def LoadWillowSurfaceMaterial(out):
    Material=bpy.data.materials.new('Wicker_AgedSurface');Material.use_nodes=True;nodes=Material.node_tree.nodes;links=Material.node_tree.links;bsdf=nodes.get('Principled BSDF');bsdf.inputs['IOR'].default_value=1.45
    images={}
    for suffix in ('Base','Orm','Normal'):
        image=bpy.data.images.load(str(Path(out)/('Texture_K09WillowSurface_'+suffix+'.png')),check_existing=False);image.colorspace_settings.name='sRGB' if suffix=='Base' else 'Non-Color';image.pack();images[suffix]=image
    node=nodes.new('ShaderNodeTexImage');node.image=images['Base'];links.new(node.outputs['Color'],bsdf.inputs['Base Color']);node=nodes.new('ShaderNodeTexImage');node.image=images['Orm'];split=nodes.new('ShaderNodeSeparateColor');links.new(node.outputs['Color'],split.inputs[0]);links.new(split.outputs['Green'],bsdf.inputs['Roughness']);links.new(split.outputs['Blue'],bsdf.inputs['Metallic']);node=nodes.new('ShaderNodeTexImage');node.image=images['Normal'];normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=1;normal.uv_map='UVMap';links.new(node.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
    WillowOcclusionOutput(nodes,links,split)
    return Material


def SimplifyWillowGameWeave(collection,info):
    gameTriangleLimit=willowTriangleLimit-68  # Reserve the four post-bake loose fibre tips.
    def Count():
        result=0
        for obj in collection.objects:
            if obj.type=='MESH':obj.data.calc_loop_triangles();result+=len(obj.data.loop_triangles)
        return result
    def Tree(obj,data):
        data.calc_loop_triangles()
        return BVHTree.FromPolygons([obj.matrix_world@vertex.co for vertex in data.vertices],[tuple(face.vertices) for face in data.loop_triangles],all_triangles=True)
    def Samples(obj,data):
        data.calc_loop_triangles();points=[obj.matrix_world@vertex.co for vertex in data.vertices]
        for triangle in data.loop_triangles:
            a,b,c=[points[index] for index in triangle.vertices]
            for i in range(5):
                for j in range(5-i):yield a*(i/4)+b*(j/4)+c*(1-(i+j)/4)
    def Closure(data):
        data.calc_loop_triangles();edges={};volume=0.
        for triangle in data.loop_triangles:
            a,b,c=triangle.vertices;volume+=data.vertices[a].co.dot(data.vertices[b].co.cross(data.vertices[c].co))/6
            for edge in ((a,b),(b,c),(c,a)):
                key=tuple(sorted(edge));edges[key]=edges.get(key,0)+1
        return all(value==2 for value in edges.values()),volume
    initial=Count();records=[]
    studyOnly=os.environ.get('K09_OVER_BUDGET_MATERIAL_STUDY')=='1'
    if initial<=gameTriangleLimit or studyOnly:
        result={'constructionTriangles':initial,'gameTriangles':initial,'method':'Unmodified dense closed weave','parts':[]}
        info['gameLod']=result
        info['budgetAudit']={'limit':willowTriangleLimit,'coreLimit':gameTriangleLimit,'reservedPostBakeTriangles':68,'passes':initial<=gameTriangleLimit,'overBudgetStudy':studyOnly and initial>gameTriangleLimit}
        return result
    for obj in sorted((obj for obj in collection.objects if obj.name.startswith('Willow weft')),key=lambda obj:len(obj.data.polygons),reverse=True):
        if Count()<=gameTriangleLimit:break
        original=obj.data;original.calc_loop_triangles();points=[vertex.co.copy() for vertex in original.vertices];ringCount=len(points)//3
        layer=original.uv_layers.active;faces=[{'ids':tuple(triangle.vertices),'uv':[tuple(layer.data[loop].uv) for loop in triangle.loops],'smooth':original.polygons[triangle.polygon_index].use_smooth} for triangle in original.loop_triangles]
        vertexV={index:float(np.median([uv[1] for face in faces for vertex,uv in zip(face['ids'],face['uv']) if vertex==index])) for index in range(len(points))}
        materials=list(original.materials);originalTree=Tree(obj,original);originalSamples=list(Samples(obj,original));closed,originalVolume=Closure(original);assert closed and originalVolume>0
        peers=[WillowWorldTree(other) for other in collection.objects if other.type=='MESH' and other!=obj and 'rim' not in other.name.lower()]
        removed=[];maximumError=0.;rejected=set()
        def BuildData(proposal):
            used=sorted({index for face in proposal for index in face['ids']});mapping={value:index for index,value in enumerate(used)}
            data=bpy.data.meshes.new('K09_LongEdgeGameWeft');data.from_pydata([tuple(points[index]) for index in used],[],[tuple(mapping[index] for index in face['ids']) for face in proposal]);data.update();uv=data.uv_layers.new(name='UVMap')
            for material in materials:data.materials.append(material)
            for polygon,face in zip(data.polygons,proposal):
                polygon.use_smooth=face['smooth']
                for loop,value in zip(polygon.loop_indices,face['uv']):uv.data[loop].uv=value
            return data
        while Count()>gameTriangleLimit:
            neighbors={};edgeFaces={}
            for face in faces:
                for a,b in zip(face['ids'],face['ids'][1:]+face['ids'][:1]):
                    neighbors.setdefault(a,set()).add(b);neighbors.setdefault(b,set()).add(a);edgeFaces.setdefault(tuple(sorted((a,b))),[]).append(face)
            choices=[]
            for edge,attached in edgeFaces.items():
                a,b=edge
                if len(attached)!=2 or a%3!=b%3 or len(neighbors[a]&neighbors[b])!=2:continue
                for drop,keep in ((a,b),(b,a)):
                    if drop//3<2 or drop//3>=ringCount-2 or (drop,keep) in rejected:continue
                    along=[value for value in neighbors[drop] if value%3==drop%3 and value!=keep]
                    if len(along)!=1:continue
                    start,end=points[along[0]],points[keep];axis=end-start;fraction=max(0,min(1,(points[drop]-start).dot(axis)/max(axis.length_squared,1e-20)))
                    cost=(points[drop]-start.lerp(end,fraction)).length
                    if cost<=.00015:choices.append((cost,drop,keep))
            if not choices:break
            adopted=False
            for cost,drop,keep in sorted(choices):
                proposal=[];bad=False
                for face in faces:
                    ids=tuple(keep if index==drop else index for index in face['ids'])
                    if len(set(ids))<3:continue
                    if drop in face['ids']:
                        a,b,c=[points[index] for index in face['ids']];x,y,z=[points[index] for index in ids]
                        if (b-a).cross(c-a).dot((y-x).cross(z-x))<=0:bad=True;break
                    uv=[(value[0],vertexV[keep]) if index==drop else value for index,value in zip(face['ids'],face['uv'])]
                    proposal.append({'ids':ids,'uv':uv,'smooth':face['smooth']})
                if bad:rejected.add((drop,keep));continue
                old=obj.data;candidate=BuildData(proposal);obj.data=candidate;bpy.context.view_layer.update();valid,volume=Closure(candidate);tree=Tree(obj,candidate);error=0.
                if valid and volume>0 and abs(volume/originalVolume-1)<.12:
                    for point in originalSamples:
                        hit=tree.find_nearest(point,.002);error=max(error,hit[3] if hit[0] is not None else 1.)
                    for point in Samples(obj,candidate):
                        hit=originalTree.find_nearest(point,.002);error=max(error,hit[3] if hit[0] is not None else 1.)
                    triangles=[set(triangle.vertices) for triangle in candidate.loop_triangles]
                    selfHit=any(a<b and not triangles[a].intersection(triangles[b]) for a,b in tree.overlap(tree));peerHit=any(tree.overlap(peer) for peer in peers)
                else:error=1.;selfHit=True;peerHit=True
                if error>.00015 or selfHit or peerHit:
                    obj.data=old;bpy.data.meshes.remove(candidate);rejected.add((drop,keep));continue
                faces=proposal;removed.append((drop,keep));maximumError=max(maximumError,error);bpy.data.meshes.remove(old);adopted=True;rejected.clear();break
            if not adopted:break
        records.append({'name':obj.name,'constructionTriangles':len(originalSamples)//15,'gameTriangles':len(faces),'collapsedLongEdges':len(removed),'maxBidirectionalSampleDeviationM':maximumError,'sampleGridOrder':4,'endSectionsRetained':True})
    final=Count();result={'constructionTriangles':initial,'gameTriangles':final,'sampledDeviationLimitM':.00015,'method':'Only longitudinal corner edges collapse onto retained original points; transverse profile/end edges protected; symmetric barycentric4-grid sampling plus closed volume, winding and peer/self checks','parts':records}
    (outputRoot/'Refinement/DoubleBindingV90/Data_GameLodAttempt.json').write_text(json.dumps(result,indent=2)+'\n')
    assert 800<=final<=gameTriangleLimit,'Actual final Willow game LOD exceeds its approved core budget'
    info['budgetAudit']={'limit':willowTriangleLimit,'coreLimit':gameTriangleLimit,'reservedPostBakeTriangles':68,'passes':True,'overBudgetStudy':False}
    for part in info['lowObjects']:
        data=bpy.data.objects[part['name']].data;data.calc_loop_triangles();part['denseConstructionTriangles']=part['triangles'];part['triangles']=len(data.loop_triangles)
    digest=hashlib.sha256()
    for obj in sorted((obj for obj in collection.objects if obj.type=='MESH'),key=lambda value:value.name):
        obj.data.calc_loop_triangles();digest.update(obj.name.encode());digest.update(np.asarray([obj.matrix_world@vertex.co for vertex in obj.data.vertices],dtype='<f4').tobytes());digest.update(np.asarray([face.vertices for face in obj.data.loop_triangles],dtype='<u4').tobytes())
    info['supportGeometrySha256']=digest.hexdigest();info['gameLod']=result
    print('WILLOW_GAME_LOD',initial,final,max((record['maxBidirectionalSampleDeviationM'] for record in records),default=0))
    return result


def ApplyWillowSurface(collection,sourceFile,sourceSha,out,builderFile):
    sourceFile=Path(sourceFile);out=Path(out);out.mkdir(parents=True,exist_ok=True)
    assert hashlib.sha256(sourceFile.read_bytes()).hexdigest()==sourceSha,'Missing or changed retained K09 willow source'
    info=CollectWillowSurfaceParts(collection);SimplifyWillowGameWeave(collection,info);info['sourceFile']=str(sourceFile);info['sourceSha256']=sourceSha;info['sourceNativeTexelsPerMm']=[887/80,1774/160]
    code=Path(builderFile).read_text(encoding='utf-8');moduleCode=code[code.index('# BEGIN_K09_WILLOW_SURFACE_MODULE'):code.rindex('\n# END_K09_WILLOW_SURFACE_MODULE')]
    physicalInfo={key:value for key,value in info.items() if key!='budgetAudit'}
    cacheKey=hashlib.sha256((json.dumps(physicalInfo,sort_keys=True,separators=(',',':'))+hashlib.sha256(moduleCode.encode()).hexdigest()+bpy.app.version_string).encode()).hexdigest();cacheFile=out/'Data_K09WillowSurfaceBake.json'
    if cacheFile.exists() and os.environ.get('K09_FORCE_WILLOW_BAKE')!='1':
        cached=json.loads(cacheFile.read_text(encoding='utf-8'))
        if cached.get('cacheKey')==cacheKey and not cached.get('previewOnly',False) and all(Path(record['path']).exists() and hashlib.sha256(Path(record['path']).read_bytes()).hexdigest()==record['sha256'] for record in cached.get('maps',[])) and len(cached.get('maps',[]))==3:
            Material=LoadWillowSurfaceMaterial(out)
            for part in info['lowObjects']:obj=bpy.data.objects[part['name']];obj.data.materials.clear();obj.data.materials.append(Material)
            print('WILLOW_SURFACE_CACHE',cacheKey);return [],dict(cached,cacheHit=True)
    heightData=GenerateWillowSurfaceAtlases(info,out,sourceFile)
    (out/'Data_K09WillowSurfaceInfo.json').write_text(json.dumps(info,indent=2),encoding='utf-8')
    if os.environ.get('K09_QUICK_SURFACE')=='1':
        import shutil
        original=outputRoot/'Refinement/WholeSurfaceRebuild/Versions/39df2d08af9a/WillowMaps/Texture_K09WillowSurface_Normal.png';shutil.copy2(original,out/'Texture_K09WillowSurface_Normal.png')
        Material=LoadWillowSurfaceMaterial(out);highObjects=[];record={'parts':len(info['lowObjects']),'normalBakeCoreMisses':None,'previewOnly':True,'normalPreviewSource':str(original),'normalPreviewSourceSha256':hashlib.sha256(original.read_bytes()).hexdigest()}
        for part in info['lowObjects']:obj=bpy.data.objects[part['name']];obj.data.materials.clear();obj.data.materials.append(Material)
    else:Material,highObjects,record=BakeWillowSurfaceNormals(info,out,heightData)
    maps=[]
    for suffix in ('Base','Orm','Normal'):
        path=out/('Texture_K09WillowSurface_'+suffix+'.png');maps.append({'kind':suffix,'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    record.update({'cacheKey':cacheKey,'cacheHit':False,'sourceFile':str(sourceFile),'sourceSha256':sourceSha,'builderFile':str(builderFile),'builderSha256':hashlib.sha256(Path(builderFile).read_bytes()).hexdigest(),'atlasSize':info['atlasSize'],'parts':len(info['lowObjects']),'maps':maps,'sourceInformationLimitTexelsPerMm':info['sourceNativeTexelsPerMm'],'physicalDensity':[{'name':part['name'],'lengthM':part['lengthM'],'perimeterM':part['meanPerimeterM'],'along':part['texelsPerMmAlong'],'around':part['texelsPerMmAround'],'meanBareFiberBlend':part['meanBareFiberBlend']} for part in info['lowObjects']]})
    cacheFile.write_text(json.dumps(record,indent=2),encoding='utf-8');print('WILLOW_SURFACE_BAKED',json.dumps({'parts':record['parts'],'atlas':record['atlasSize'],'unresolved':record['normalBakeCoreMisses']}));return highObjects,record
# END_K09_WILLOW_SURFACE_MODULE


# Willow skimmer: a shallow, irregular bowl, separate warp and weft
# strands. Handle extends toward Blender -Y (glTF +Z). The origin is ground.
col,root=NewCollection('WillowSkimmer')
cx,cy=0,.054
willowBowlRadius=.100
outer=willowBowlRadius

willowBowlDepth=.050
willowBowlPower=.90

def WillowBowlSurface(x,y):
    radiusSquared=(x*x+y*y)/(willowBowlRadius*willowBowlRadius)
    return .050-willowBowlDepth*max(0,1-radiusSquared)**willowBowlPower

willowGatherFocus=.28
xs=[(n-7)*.012+.0027*math.sin(n*1.7) for n in range(15)]
ys=sorted([float(y)+.0016*math.sin(n*2.3+.2) for n,y in enumerate(np.linspace(-.060,.089,12))]+[.0955])

# Compensate the shared disk map along the centreline so the transverse
# weaving remains distributed through the whole bowl as the ribs fan out.


def WeaveNode(n,k):
    x=xs[n];y=ys[k];falloff=max(0,1-(x*x+y*y)/(outer*outer))
    return (x+.0011*math.sin(n*2.1+k*.70)+.009*math.sin(math.pi*y/(2*outer))*falloff,
            y+.0009*math.sin(n*.80-k*2.0)+.007*(x/outer)**2*falloff-.0075*(x/outer)*falloff)


willowLowerGather=.75
willowHarmonicTerms=48
willowAngles=2*np.pi*np.arange(512)/512
willowBoundary=np.exp(1j*willowAngles)
willowLowerY=np.minimum(0,willowBoundary.imag)
willowBoundaryQ=1-willowLowerGather*(1-np.exp(-4*willowLowerY**2))
willowGathered=(willowBoundaryQ*willowBoundary.real+1j*willowBoundary.imag)/np.sqrt((willowBoundaryQ*willowBoundary.real)**2+willowBoundary.imag**2)
willowBoundary=np.where(willowBoundary.imag<0,willowGathered,willowBoundary)
willowFourier=np.fft.fft(willowBoundary)/len(willowBoundary)
willowPositive=willowFourier[1:willowHarmonicTerms+1]
willowNegative=willowFourier[-1:-willowHarmonicTerms-1:-1]
willowPowers=np.arange(1,willowHarmonicTerms+1)
willowScaleCache={}

def MapWillowCoordinate(x,y):
    value=complex(x/willowBowlRadius,y/willowBowlRadius);radius=abs(value)
    if radius>=.999999:
        unit=value/max(radius,1e-12);q=1-willowLowerGather*(1-math.exp(-4*min(0,unit.imag)**2))
        mapped=(q*unit.real+1j*unit.imag)/math.sqrt((q*unit.real)**2+unit.imag**2) if unit.imag<0 else unit
        mapped*=radius
    else:
        mapped=willowFourier[0]+np.dot(willowPositive,value**willowPowers)+np.dot(willowNegative,value.conjugate()**willowPowers)
    return float(mapped.real*willowBowlRadius),float(mapped.imag*willowBowlRadius)

def WillowSectionScale(x,y):
    key=(round(float(x),8),round(float(y),8))
    if key not in willowScaleCache:
        value=complex(x/willowBowlRadius,y/willowBowlRadius);radius=abs(value)
        if radius>.999:value*=.999/radius
        direct=np.dot(willowPowers*willowPositive,value**(willowPowers-1));reverse=np.dot(willowPowers*willowNegative,value.conjugate()**(willowPowers-1));minimum=abs(direct)-abs(reverse)
        assert minimum>0,'Harmonic bowl map folded'
        willowScaleCache[key]=min(1.0,max(.25,float(minimum)))
    return willowScaleCache[key]

def WillowSectionWidths(points):
    widths=[]
    for index,point in enumerate(points):
        before=points[max(0,index-1)];after=points[min(len(points)-1,index+1)];tangent=complex(after[0]-before[0],after[1]-before[1]);tangent/=max(abs(tangent),1e-12)
        value=complex((point[0]-cx)/willowBowlRadius,(point[1]-cy)/willowBowlRadius);radius=abs(value)
        if radius>.999:value*=.999/radius
        direct=np.dot(willowPowers*willowPositive,value**(willowPowers-1));reverse=np.dot(willowPowers*willowNegative,value.conjugate()**(willowPowers-1))
        determinant=abs(direct)**2-abs(reverse)**2;longitudinal=abs(direct*tangent+reverse*tangent.conjugate());assert determinant>0 and longitudinal>0
        widths.append(min(1.0,max(.75,float(determinant/longitudinal))))
    return widths

def MapWillowPoint(point):
    x,y,z=point;x-=cx;y-=cy
    residual=z-WillowBowlSurface(x,y)
    x,y=MapWillowCoordinate(x,y)
    return (cx+x,cy+y,WillowBowlSurface(x,y)+residual)

from mathutils.bvhtree import BVHTree

def SimplifyRigidRib(points,tolerance=.0020):
    # Minimise segment count under the same 2mm seed-curve bound. Recursive
    # bisection can retain extra rings simply because of its split order.
    samples=np.asarray(points,dtype=np.float64);count=len(samples)
    costs=[(count+1,float('inf'))]*count;previous=[None]*count;costs[0]=(0,0.)
    for last in range(1,count):
        for first in range(last):
            direction=samples[last]-samples[first];local=samples[first:last+1]-samples[first]
            fraction=np.clip(local@direction/max(float(direction@direction),1e-20),0,1)
            errors=np.linalg.norm(local-fraction[:,None]*direction,axis=1)
            if float(errors.max())>tolerance:continue
            candidate=(costs[first][0]+1,costs[first][1]+float(errors@errors))
            if candidate<costs[last]:costs[last]=candidate;previous[last]=first
    keep=[count-1]
    while keep[-1]:keep.append(previous[keep[-1]])
    return list(reversed(keep))

def Cross2(first,second):return first.x*second.y-first.y*second.x

rimTraceHarmonics=[(3, 6.430282348815997e-05, 0.0002949493610291139), (4, 0.00024159100336530422, 9.019001671228293e-06), (5, -0.00017722182328479754, -0.0001259463034627539), (6, -2.0446264932112337e-05, 3.1227105268374236e-05)]

def OrganicWillowField(point):
    x,y,z=point;nx=(x-cx)/willowBowlRadius;ny=(y-cy)/willowBowlRadius
    falloff=max(0,1-nx*nx-ny*ny)**2
    dx=.0016*(math.sin(1.5*math.pi*ny+.6)+.45*math.sin(3.0*math.pi*ny+1.7*nx))*falloff-.013*ny*math.sqrt(falloff)
    dy=(.0032*(math.sin(1.3*math.pi*nx-.3)+.38*math.sin(2.7*math.pi*nx+ny))-.018*nx)*falloff
    radius=math.hypot(nx,ny);angle=math.atan2(ny,nx)
    inside=max(0,min(1,(radius-.35)/.65));inside=inside*inside*(3-2*inside)
    outside=max(0,min(1,(1.08-radius)/.08));outside=outside*outside*(3-2*outside)
    radialOffset=sum(a*math.cos(order*angle)+b*math.sin(order*angle) for order,a,b in rimTraceHarmonics)*inside*outside
    if radius>1e-8:dx+=nx/radius*radialOffset;dy+=ny/radius*radialOffset
    result=Vector((x+dx,y+dy,z))
    flowX=(result.x-cx)/willowBowlRadius;flowY=(result.y-cy)/willowBowlRadius
    flowFalloff=max(0,1-flowX*flowX-flowY*flowY)
    result.x-=.005*math.exp(-((flowX-.02)/.35)**2-((flowY+.40)/.40)**2)*flowFalloff
    return result


rigidWarpObjects=[];rigidWarpPoints=[];rigidRibRecords=[]
for n,x in enumerate(xs):
    span=math.sqrt(max(0,outer*outer-x*x));sourcePoints=[]
    for y in np.linspace(-span,span,65):
        falloff=max(0,1-(x*x+y*y)/(outer*outer));phase=y/.012+7
        px=x+(.0011*math.sin(n*2.1+phase*.70)+.009*math.sin(math.pi*y/(2*outer)))*falloff
        py=y+.007*(x/outer)**2*falloff-.0075*(x/outer)*falloff
        sourcePoints.append((cx+px,cy+py,WillowBowlSurface(px,py)))
    mappedSeed=[Vector(MapWillowPoint(point)) for point in sourcePoints]
    mapped=[OrganicWillowField(point) for point in mappedSeed];indices=SimplifyRigidRib(mapped)
    points=[mapped[index] for index in indices];source=[sourcePoints[index] for index in indices]
    radius=.00145 if n in (3,5,7,9,11) else .00100
    obj=Rod('Willow warp %02d'%n,points,radius,col,root,wicker[random.Random('warp'+str(n)).choices(range(3),weights=(6,3,1))[0]],flatWeave=True,
        sectionScales=[WillowSectionScale(point[0]-cx,point[1]-cy) for point in source],sectionWidths=WillowSectionWidths(source))
    bpy.context.view_layer.objects.active=obj;modifier=obj.modifiers.new('Rigid rib triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=modifier.name)
    rigidWarpObjects.append(obj);rigidWarpPoints.append(points)
    rigidRibRecords.append({'name':obj.name,'densePoints':65,'retainedPoints':len(points),'triangles':len(obj.data.polygons),'boundM':.0020,'maxCenterlineFieldOffsetM':max((a-b).length for a,b in zip(mapped,mappedSeed)),'method':'Minimum-segment dynamic programming within the same2mm final-centreline bound'})
bpy.context.view_layer.update();rigidWarpTrees=[WillowWorldTree(obj) for obj in rigidWarpObjects]
ribEnvelopeTriangles={}
def RegisterRibEnvelope(tree,obj,finalField=False):
    obj.data.calc_loop_triangles()
    points=[obj.matrix_world@vertex.co for vertex in obj.data.vertices]
    if finalField:points=[OrganicWillowField(point) for point in points]
    records=[]
    for face in obj.data.loop_triangles:
        triangle=[points[index] for index in face.vertices]
        records.append((triangle,min(p.x for p in triangle),max(p.x for p in triangle),min(p.y for p in triangle),max(p.y for p in triangle)))
    ribEnvelopeTriangles[id(tree)]=records
for tree,obj in zip(rigidWarpTrees,rigidWarpObjects):RegisterRibEnvelope(tree,obj)

def FinalFieldTree(obj):
    obj.data.calc_loop_triangles()
    tree=BVHTree.FromPolygons([OrganicWillowField(obj.matrix_world@vertex.co) for vertex in obj.data.vertices],[tuple(face.vertices) for face in obj.data.loop_triangles],all_triangles=True)
    RegisterRibEnvelope(tree,obj,True)
    return tree

finalFieldWarpTrees=rigidWarpTrees


def CurvePoint(template,distance):
    lengths=template['lengths'];index=min(len(lengths)-2,max(0,int(np.searchsorted(lengths,distance,side='right'))-1))
    fraction=max(0,min(1,(distance-lengths[index])/max(lengths[index+1]-lengths[index],1e-12)))
    point=template['base'][index].lerp(template['base'][index+1],fraction)
    source=Vector(template['source'][index]).lerp(Vector(template['source'][index+1]),fraction)
    tangent=template['base'][index+1]-template['base'][index];tangent.z=0;tangent.normalize()
    return point,source,tangent

ribEnvelopeCache={}
def RibEnvelope(point,tangent,width,trees,halfLength=.0007):
    key=(tuple(point),tuple(tangent),width,tuple(id(tree) for tree in trees),halfLength)
    if key in ribEnvelopeCache:return ribEnvelopeCache[key]
    # Clip each actual support triangle against the entire finite strip
    # footprint. Sparse rays can miss a thin rib near a gathered endpoint.
    halfX=max(.0007,abs(tangent.x)*halfLength)
    halfY=.00085*width*1.65*1.40*1.14*1.15+abs(tangent.y)*halfLength
    x0,x1=point.x-halfX,point.x+halfX;y0,y1=point.y-halfY,point.y+halfY;heights=[]
    for tree in trees:
        for triangle,minX,maxX,minY,maxY in ribEnvelopeTriangles[id(tree)]:
            if maxX<x0 or minX>x1 or maxY<y0 or minY>y1:continue
            polygon=triangle
            for axis,bound,sign in ((0,x0,1),(0,x1,-1),(1,y0,1),(1,y1,-1)):
                clipped=[]
                if not polygon:break
                for a,b in zip(polygon,polygon[1:]+polygon[:1]):
                    da=(a[axis]-bound)*sign;db=(b[axis]-bound)*sign
                    if da>=0:clipped.append(a)
                    if (da>=0)!=(db>=0):clipped.append(a+(b-a)*(da/(da-db)))
                polygon=clipped
            heights.extend(p.z for p in polygon)
    result=(max(heights),min(heights)) if heights else None
    ribEnvelopeCache[key]=result
    return result

weftTemplates=[]
for n,y in enumerate(ys):
    span=math.sqrt(max(0,outer*outer-y*y));sourcePoints=[]
    for x in np.linspace(-span,span,65):
        falloff=max(0,1-(x*x+y*y)/(outer*outer));phase=x/.012+7
        px=x+(.0011*math.sin(phase*2.1+n*.70)+.009*math.sin(math.pi*y/(2*outer)))*falloff
        py=y+(.0009*math.sin(phase*.80-n*2.0)+.007*(x/outer)**2-.0075*(x/outer))*falloff
        sourcePoints.append((cx+px,cy+py,WillowBowlSurface(px,py)))
    base=[OrganicWillowField(MapWillowPoint(point)) for point in sourcePoints];lengths=[0.]
    for a,b in zip(base[:-1],base[1:]):lengths.append(lengths[-1]+Vector((b.x-a.x,b.y-a.y,0)).length)
    template={'source':sourcePoints,'base':base,'lengths':lengths};crossings=[]
    for k,rib in enumerate(rigidWarpPoints):
        hits=[]
        for a,b in zip(rib[:-1],rib[1:]):
            a,b=Vector(a),Vector(b);axis=b-a
            for index,(c,d) in enumerate(zip(base[:-1],base[1:])):
                along=d-c;den=Cross2(axis,along)
                if abs(den)<1e-14:continue
                delta=c-a;t=Cross2(delta,along)/den;u=Cross2(delta,axis)/den
                if -1e-7<=t<=1+1e-7 and -1e-7<=u<=1+1e-7:
                    distance=lengths[index]+(lengths[index+1]-lengths[index])*u
                    if not any(abs(distance-old)<1e-6 for old in hits):hits.append(distance)
        assert len(hits)<=1,('Multiple actual rib crossings',n,k,hits)
        if hits:crossings.append({'warp':k,'distance':hits[0]})
    crossings.sort(key=lambda item:item['distance']);assert crossings
    template['crossings']=crossings;weftTemplates.append(template)

weaveLifts={(n,k):.00015 for n in range(len(xs)) for k in range(len(ys))};weftShoulders=set();weftShoulderSideModes={}
weftEndpointLifts={(n,side):0. for n in range(len(ys)) for side in (0,1)}
def ActualRibCrossingSpan(template,crossing):
    point,source,tangent=CurvePoint(template,crossing['distance'])
    width=WillowSectionWidths([tuple(source-tangent*.001),tuple(source),tuple(source+tangent*.001)])[1]
    normal=Vector((-tangent.y,tangent.x,0));halfWidth=.00085*width*1.65*1.40*1.14*1.15*abs(tangent.x);samples=[]
    # Clip real finite-width rib triangles by the actual weft footprint.
    # The resulting interval decides where an under/over drop can fit.
    for triangle,*bounds in ribEnvelopeTriangles[id(rigidWarpTrees[crossing['warp']])]:
        polygon=triangle
        for sign in (-1,1):
            clipped=[]
            for a,b in zip(polygon,polygon[1:]+polygon[:1]):
                da=halfWidth-sign*(a-point).dot(normal);db=halfWidth-sign*(b-point).dot(normal)
                if da>=0:clipped.append(a)
                if (da>=0)!=(db>=0):clipped.append(a+(b-a)*(da/(da-db)))
            polygon=clipped
        samples.extend(crossing['distance']+(value-point).dot(tangent) for value in polygon)
    assert samples,'Missing real rib footprint at crossing'
    return min(samples),max(samples)

for crossingTemplate in weftTemplates:
    crossingTemplate['actualRibSpans']=[ActualRibCrossingSpan(crossingTemplate,crossing) for crossing in crossingTemplate['crossings']]

weaveOver={}
for row,template in enumerate(weftTemplates):
    first,last=template['crossings'][0],template['crossings'][-1]
    for crossing in template['crossings']:
        owner=crossing['warp']
        # Closely paired perimeter ribs are caught together. The split
        # weft alternates again once clear of that finite-width pair.
        if crossing['distance']-first['distance']<.010:owner=first['warp']
        elif last['distance']-crossing['distance']<.010:owner=last['warp']
        weaveOver[crossing['warp'],row]=(owner+row)%2==1

def BuildPressedWeave():
    for obj in list(col.objects):
        if obj.name.startswith('Willow weft'):
            data=obj.data;bpy.data.objects.remove(obj,do_unlink=True);bpy.data.meshes.remove(data)
    weftObjects=[]
    for n,template in enumerate(weftTemplates):
        nodes=[];crossings=template['crossings']
        for index,crossing in enumerate(crossings):
            k=crossing['warp'];distance=crossing['distance'];point,source,tangent=CurvePoint(template,distance)
            scale=WillowSectionScale(source.x-cx,source.y-cy);width=WillowSectionWidths([tuple(source-tangent*.001),tuple(source),tuple(source+tangent*.001)])[1]
            before=0 if index==0 else crossings[index-1]['distance'];after=template['lengths'][-1] if index==len(crossings)-1 else crossings[index+1]['distance']
            halfLength=0.;crossingOffsets=(0.,)
            if (k,n) in weftShoulders:
                span=template['actualRibSpans'][index]
                startDistance=max(0.,span[0]-.00012);endDistance=min(template['lengths'][-1],span[1]+.00012)
                if index>0:startDistance=max(startDistance,(template['actualRibSpans'][index-1][1]+span[0])*.5+.00006,before+.00010)
                if index+1<len(crossings):endDistance=min(endDistance,(span[1]+template['actualRibSpans'][index+1][0])*.5-.00006,after-.00010)
                leftLength=max(.00025,distance-startDistance);rightLength=max(.00025,endDistance-distance)
                crossingOffsets=(-leftLength,rightLength);halfLength=max(leftLength,rightLength)
                if weftShoulderSideModes.get((k,n))=='Left':crossingOffsets=(-leftLength,)
                elif weftShoulderSideModes.get((k,n))=='Right':crossingOffsets=(rightLength,)
            envelope=RibEnvelope(point,tangent,width,[rigidWarpTrees[k]],max(.0007,halfLength))
            assert envelope is not None,('Missing actual rib envelope',n,k)
            upper,lower=envelope;over=weaveOver[k,n]
            # The centreline field is already final. The actual finite-width
            # rib faces supply the support envelope before strip construction.
            finalPoint=point
            a=CurvePoint(template,max(0,distance-.0005))[0];b=CurvePoint(template,min(template['lengths'][-1],distance+.0005))[0];finalTangent=b-a;finalTangent.z=0;finalTangent.normalize()
            finalEnvelope=RibEnvelope(finalPoint,finalTangent,width,[finalFieldWarpTrees[k]],max(.0007,halfLength))
            assert finalEnvelope is not None,('Missing final-field rib envelope',n,k)
            upper=max(upper,finalEnvelope[0]);lower=min(lower,finalEnvelope[1])
            height=upper+.00053*scale+weaveLifts[(k,n)] if over else lower-.00028*scale-weaveLifts[(k,n)]
            for offset in crossingOffsets:
                p,src,_=CurvePoint(template,distance+offset);p.z=height;nodes.append((distance+offset,p,src,k))
        for edgeCrossing in (crossings[0],crossings[-1]):
            group={crossing['warp'] for crossing in crossings if abs(crossing['distance']-edgeCrossing['distance'])<.010}
            selected=[item for item in nodes if item[3] in group]
            height=(max if weaveOver[edgeCrossing['warp'],n] else min)(item[1].z for item in selected)
            for item in selected:item[1].z=height
        for endpointSide,(distance,crossing) in enumerate(((0.,crossings[0]),(template['lengths'][-1],crossings[-1]))):
            point,source,tangent=CurvePoint(template,distance);scale=WillowSectionScale(source.x-cx,source.y-cy)
            envelope=RibEnvelope(point,tangent,1.,rigidWarpTrees)
            if envelope is not None:
                upper,lower=envelope;over=weaveOver[crossing['warp'],n]
                point.z=upper+.00053*scale+.00015 if over else lower-.00028*scale-.00015
            nearest=min(nodes,key=lambda item:abs(item[0]-distance))
            if abs(nearest[0]-distance)<.009 and abs(nearest[1].z-.050)<.010:
                over=weaveOver[crossing['warp'],n]
                point.z=max(point.z,nearest[1].z) if over else min(point.z,nearest[1].z)
            point.z+=(1 if weaveOver[crossing['warp'],n] else -1)*weftEndpointLifts[(n,endpointSide)]
            nodes.append((distance,point,source,crossing['warp']))
        nodes.sort(key=lambda item:item[0]);points=[tuple(item[1]) for item in nodes];source=[tuple(item[2]) for item in nodes]
        obj=Rod('Willow weft %02d'%n,points,.00085,col,root,wicker[random.Random('weft'+str(n)).choices(range(3),weights=(6,3,1))[0]],flatWeave=True,
            sectionScales=[WillowSectionScale(point[0]-cx,point[1]-cy) for point in source],sectionWidths=WillowSectionWidths(source))
        bpy.context.view_layer.objects.active=obj;modifier=obj.modifiers.new('Fitted weft triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj['weft_ring_warp_owner']=[item[3] for item in nodes]
        weftObjects.append(obj)
    return rigidWarpObjects,weftObjects

for weaveSolveIteration in range(49):
    warpObjects,weftObjects=BuildPressedWeave();bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
    warpTrees=[WillowWorldTree(obj) for obj in warpObjects];weftTrees=[WillowWorldTree(obj) for obj in weftObjects]
    collisions=[(n,k) for n,a in enumerate(warpTrees) for k,b in enumerate(weftTrees) if a.overlap(b)]
    if not collisions:break
    for k,n in collisions:
        template=weftTemplates[n]
        if k in {crossing['warp'] for crossing in template['crossings']}:
            if weaveSolveIteration>=24:weftShoulders.add((k,n))
            weaveLifts[(k,n)]+=.00005
        else:
            # Finite-width canes may meet at the rim even when their
            # centrelines miss. Fit that actual endpoint independently;
            # changing an absent crossing's lift cannot resolve it.
            endpointSide=min((0,1),key=lambda side:rigidWarpTrees[k].find_nearest(template['base'][0 if side==0 else -1])[3])
            weftEndpointLifts[(n,endpointSide)]+=.00005
            assert weftEndpointLifts[(n,endpointSide)]<=.0012,'Finite-width rim contact requires a revised endpoint guide'
else:raise RuntimeError('Actual-envelope rigid rib weave needs a local route revision')
parallelWeaveIntersections=sum(len(a.overlap(b)) for trees in (warpTrees,weftTrees) for i,a in enumerate(trees) for b in trees[i+1:])
assert parallelWeaveIntersections==0,'Adjacent willow strands intersect'
def RigidWeaveViolations(warpObjects,weftObjects):
    trees={obj.name:WillowWorldTree(obj) for obj in warpObjects+weftObjects}
    cross=sum(len(trees[a.name].overlap(trees[b.name])) for a in warpObjects for b in weftObjects)
    parallel=sum(len(trees[a.name].overlap(trees[b.name])) for objects in (warpObjects,weftObjects) for index,a in enumerate(objects) for b in objects[index+1:])
    selfCount=0
    for obj in warpObjects+weftObjects:
        triangles=[set(face.vertices) for face in obj.data.polygons]
        selfCount+=sum(a<b and not triangles[a].intersection(triangles[b]) for a,b in trees[obj.name].overlap(trees[obj.name]))
    return cross,parallel,selfCount

shouldersBeforeReduction=len(weftShoulders)
currentViolations=RigidWeaveViolations(warpObjects,weftObjects)
for pair in sorted(weftShoulders):
    weftShoulders.remove(pair)
    warpObjects,weftObjects=BuildPressedWeave();bpy.context.view_layer.update()
    violations=RigidWeaveViolations(warpObjects,weftObjects)
    if violations[0] or violations[1] or violations[2]>currentViolations[2]:
        weftShoulders.add(pair)
    else:currentViolations=violations
warpObjects,weftObjects=BuildPressedWeave();bpy.context.view_layer.update()
currentViolations=RigidWeaveViolations(warpObjects,weftObjects)
assert currentViolations==(0,0,0),('Rigid weave has unresolved physical violations',currentViolations)
# Construction-level support routing: a broad rib can need only one
# displaced crest, rather than both ends of a support plateau. Keep only
# candidates that preserve the complete actual support/peer/self gates.
# This changes the constructed route, not the later0.15mm game-LOD bound.
flowSingleShoulderRecords=[]
for pair in sorted(weftShoulders):
    physicalCandidates=[]
    for mode in ('Left','Right'):
        weftShoulderSideModes[pair]=mode
        warpObjects,weftObjects=BuildPressedWeave();bpy.context.view_layer.update()
        if RigidWeaveViolations(warpObjects,weftObjects)!=(0,0,0):continue
        candidate=weftObjects[pair[1]];candidate.data.calc_loop_triangles()
        # Prefer the shorter physical strip when both one-crest routes fit.
        totalLength=sum((candidate.data.vertices[ring*3].co-candidate.data.vertices[(ring-1)*3].co).length for ring in range(1,len(candidate.data.vertices)//3))
        physicalCandidates.append((totalLength,mode))
    if physicalCandidates:
        chosen=min(physicalCandidates)[1];weftShoulderSideModes[pair]=chosen;flowSingleShoulderRecords.append({'warp':pair[0],'weft':pair[1],'mode':chosen})
    else:weftShoulderSideModes.pop(pair,None)
warpObjects,weftObjects=BuildPressedWeave();bpy.context.view_layer.update();currentViolations=RigidWeaveViolations(warpObjects,weftObjects);assert currentViolations==(0,0,0)
print('FLOW_SUPPORT_NODE_ROUTING',len(flowSingleShoulderRecords),len(weftShoulders),currentViolations)
print('SHOULDER_REDUCTION',shouldersBeforeReduction,len(weftShoulders),currentViolations)


# Build the actual rim/bands before seating the underside repair cane.
outerRim=RingXy('Double rim outer',cx,cy,.101,.050,col,root,wicker[0],.0038,24)
RingXy('Double rim inner',cx,cy,.096,.049,col,root,wicker[1],.0026,24)
RingXy('Double rim inside binding',cx,cy,.0928,.049,col,root,wicker[2],.0015,12)
for n in range(14):
    a=2*math.pi*n/14+.15+.045*math.sin(n*1.9)
    RimLashing('Rim tie %02d'%n,a,n,col,root,fibre)

repairSupportObjects=[obj for obj in col.objects if obj.type=='MESH']
repairSupportTrees=[WillowWorldTree(obj) for obj in repairSupportObjects]
repairSeatReports=[]
for n in range(2):
    angle=(.58,-.58)[n];crossOffset=0.0;points=[];limit=math.sqrt(outer*outer-crossOffset*crossOffset)
    for j in range(7):
        u=-limit+2*limit*j/6;bend=.003*math.sin(math.pi*u/limit)
        x=u*math.cos(angle)-(crossOffset+bend)*math.sin(angle)
        y=u*math.sin(angle)+(crossOffset+bend)*math.cos(angle)
        points.append(OrganicWillowField(MapWillowPoint((cx+x,cy+y,WillowBowlSurface(x,y)))))
    original=[point.copy() for point in points];repairConstraints=[]
    # A closed cane must follow the underside envelope, including its finite
    # footprint. Sampling the centre alone misses nearby raised crossings.
    for index in range(len(points)-1):
        a,b=points[index],points[index+1];axis=Vector((b.x-a.x,b.y-a.y,0)).normalized();side=Vector((-axis.y,axis.x,0));lower=0
        for fraction in np.linspace(0,1,41):
            point=a.lerp(b,float(fraction))
            for offset in (-.00145,0,.00145):
                probe=point+side*offset
                hits=[tree.ray_cast(Vector((probe.x,probe.y,-.12)),Vector((0,0,1)),.24)[0] for tree in repairSupportTrees]
                heights=[hit.z for hit in hits if hit is not None]
                if heights:
                    ceiling=min(heights)-.00145;repairConstraints.append((index,float(fraction),ceiling));lower=max(lower,point.z-ceiling)
        if lower>0:points[index].z-=lower;points[index+1].z-=lower
    # Raise any conservatively lowered node to the highest feasible position
    # under all measured support constraints; this avoids a loose repair bar.
    for _ in range(3):
        for node in range(len(points)):
            upper=original[node].z
            for segment,fraction,ceiling in repairConstraints:
                if segment==node and 1-fraction>1e-7:upper=min(upper,(ceiling-fraction*points[node+1].z)/(1-fraction))
                elif segment+1==node and fraction>1e-7:upper=min(upper,(ceiling-(1-fraction)*points[node-1].z)/fraction)
            if upper>points[node].z:points[node].z=upper
    obj=Rod('Irregular repair strand %02d'%(0 if n==0 else 8),points,.0011,col,root,wicker[(n+1)%3])
    bpy.context.view_layer.objects.active=obj;tri=obj.modifiers.new('Actual repair triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name);before=[v.co.copy() for v in obj.data.vertices]
    for iteration in range(25):
        bpy.context.view_layer.update();tree=WillowWorldTree(obj);pairs=[pair for target in repairSupportTrees for pair in tree.overlap(target)]
        if not pairs:break
        affected={vertex for face,_ in pairs for vertex in obj.data.polygons[face].vertices}
        for vertex in affected:
            obj.data.vertices[vertex].co.z-=.00005
            assert (obj.data.vertices[vertex].co-before[vertex]).length<=.0012,'Repair needs a revised underside path'
        obj.data.update()
    else:raise RuntimeError('Underside repair still intersects its supports')
    selfPairs=[(a,b) for a,b in tree.overlap(tree) if a<b and not set(obj.data.polygons[a].vertices).intersection(obj.data.polygons[b].vertices)]
    assert not selfPairs,'Repair cane self-intersects'
    repairSupportObjects.append(obj);repairSupportTrees.append(WillowWorldTree(obj))
    repairSeatReports.append({'name':obj.name,'points':len(points),'maxEnvelopeLoweringM':max(a.z-b.z for a,b in zip(original,points)),'localCorrectionM':max((v.co-p).length for v,p in zip(obj.data.vertices,before)),'supportIntersections':0,'selfIntersections':0,'supportObjects':[o.name for o in repairSupportObjects if o!=obj]})
# The lashings connect the grip to the reinforced rim.
end,gripObj=HangingHandle('Skimmer wooden grip',.140,.0315,.024,-.050,.042,col,root,woodGrip)
bpy.context.view_layer.update();gripInsertionTree=BVHTree.FromObject(gripObj,bpy.context.evaluated_depsgraph_get())
neckAnchors=[];neckStems=[]
bundle=[(-.010,.0004),(-.005,.0009),(0,.0012),(.005,.0009),(.010,.0004)]
for n,(bundleX,bundleZ) in enumerate(bundle):
    warpIndex=(3,5,7,9,11)[n];x=xs[warpIndex];span=math.sqrt(outer*outer-x*x);near=next(k for k,y in enumerate(ys) if -span<y<span)
    gatheredRimX=bundleX*1.2;gatheredSpan=math.sqrt(outer*outer-gatheredRimX*gatheredRimX)
    seatY=cy-gatheredSpan;seatTrees=[BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get()) for obj in [*warpObjects,*weftObjects,outerRim,bpy.data.objects['Double rim inner']]]
    seatHits=[tree.ray_cast(Vector((gatheredRimX,seatY,.10)),Vector((0,0,-1)),.15)[0] for tree in seatTrees];seatHits=[hit for hit in seatHits if hit is not None];assert seatHits,'Missing gathered front-rim seat'
    rimPoint=(gatheredRimX,seatY,max(hit.z for hit in seatHits)+.0018)
    insertX=bundleX*.85;insertY=-.081+.001*math.sin(n);insertSurface=gripInsertionTree.ray_cast(Vector((insertX,insertY,.10)),Vector((0,0,-1)),.2)[0];assert insertSurface is not None,'Missing timber at gathered rib insertion'
    endPoint=(insertX,insertY,insertSurface.z-.0020);neckAnchors.append((rimPoint,endPoint))
    # Five lower-bowl reinforcements gather at the central front rim and
    # enter the timber end under the retained close winding.
    path=[rimPoint,(gatheredRimX*.45+bundleX*.55,(rimPoint[1]-.051)*.5,.050+bundleZ*.3),(bundleX,-.051,.048+bundleZ),endPoint]
    if n in (1,2):path=[path[0],*path[-2:]]
    innerX,innerY=MapWillowCoordinate(*WeaveNode(warpIndex,2));innerY+=cy
    innerFinal=OrganicWillowField(Vector((innerX,innerY,0)));innerX,innerY=innerFinal.x,innerFinal.y
    bodyTrees=[BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get()) for obj in warpObjects+weftObjects]
    innerHits=[tree.ray_cast(Vector((innerX+dx,innerY+dy,.10)),Vector((0,0,-1)),.15)[0] for tree in bodyTrees for dx,dy in ((0,0),(-.0015,0),(.0015,0),(0,-.0015),(0,.0015))];innerHits=[hit for hit in innerHits if hit is not None];assert innerHits,'Missing fan reinforcement support'
    innerPoint=(innerX,innerY,max(hit.z for hit in innerHits)+.0019);path=[innerPoint,*path]
    fanRoute=[Vector(path[0]),Vector(path[1])]
    for fanRoutePass in range(3):
        candidates=[]
        for segment in range(len(fanRoute)-1):
            startPoint,finishPoint=fanRoute[segment:segment+2]
            for t in np.linspace(.06,.94,25):
                point=startPoint.lerp(finishPoint,float(t))
                hits=[tree.ray_cast(Vector((point.x+dx,point.y+dy,.10)),Vector((0,0,-1)),.15)[0] for tree in bodyTrees for dx in (-.0018,0,.0018) for dy in (-.0018,0,.0018)]
                heights=[hit.z for hit in hits if hit is not None]
                if heights:candidates.append((max(heights)+.0019-point.z,segment,point,max(heights)+.0019))
        if not candidates:break
        deficit,segment,point,height=max(candidates,key=lambda sample:sample[0])
        if deficit<=.00010:break
        point.z=height;fanRoute.insert(segment+1,point)
    path=[*[tuple(point) for point in fanRoute],*path[2:]]
    neckStem=Rod('Willow neck continuation %d'%n,path,.0016,col,root,wicker[(n+1)%3],ringIndexOffset=len(fanRoute)-1)
    neckStems.append(neckStem)
wrapSteps=260;wrapSides=2
wrap,sampleBinding,bindingFit=RoundedWrap('Old fitted grip binding',.032,.024,-.053,.048,.036,col,root,fibre,turns=9,steps=wrapSteps,sides=wrapSides,fitObjects=[gripObj]+neckStems)
# The winding tail follows the grip curvature and tucks under earlier turns;
# it is not a pair of rigid, free-ended crossed sticks.
bpy.context.view_layer.update();tailSupports=[BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get()) for obj in (gripObj,*neckStems,wrap)];windingTree=tailSupports[-1]
bindingReturnY=-.053-.036*.82
tailStart=windingTree.find_nearest(Vector((.009,bindingReturnY-.0011,.060)))[0];tailEnd=windingTree.find_nearest(Vector((-.009,bindingReturnY+.0029,.060)))[0];assert tailStart is not None and tailEnd is not None
def TailFrontHeight(x,y):
    hits=[tree.ray_cast(Vector((x,y,.10)),Vector((0,0,-1)),.15)[0] for tree in tailSupports];hits=[hit for hit in hits if hit is not None];assert hits,'Missing front-tail support';return max(hit.z for hit in hits)+.00055
knotCenterY=-.053-.036*.38
# Rounded bights distribute the ribbon frame rotation; explicit higher and
# lower passes form the knot instead of crossing strips through each other.
knotTrace=[(.010,-.003,None),(.0025,0,.0016),(-.006,.0035,.0014),(-.010,.003,.0014),(-.012,.0005,.0014),(-.010,-.0025,.0015),(.0065,-.0045,.0017),(.010,-.003,.0015),(.012,0,.0011),(.010,.003,.0005),(.004,.0045,.0002),(-.004,-.005,.0001),(-.0065,-.0055,.0002),(-.009,-.003,.0001),(-.009,.0014,None)]
knotCommonZ=max(TailFrontHeight(x*.65,knotCenterY+y*.85) for x,y,_ in knotTrace)+.0004
tail=[Vector((x*.65,knotCenterY+y*.85,TailFrontHeight(x*.65,knotCenterY+y*.85) if lift is None else knotCommonZ+lift)) for x,y,lift in knotTrace]
# Fit the whole ribbon footprint, including each intervening segment, to the
# actual front of the winding rather than cutting chords through its core.
for iteration in range(3):
    for index in range(len(tail)-1):
        a,b=tail[index],tail[index+1];axis=Vector((b.x-a.x,b.y-a.y,0)).normalized();side=Vector((-axis.y,axis.x,0));lift=0
        for t in np.linspace(0,1,9):
            point=a.lerp(b,float(t))
            for offset in (-.0012,0,.0012):
                probe=point+side*offset;lift=max(lift,TailFrontHeight(probe.x,probe.y)-point.z)
        if lift>0:tail[index].z+=lift;tail[index+1].z+=lift
tailObject=Rod('Tucked binding tail',tail,.00062,col,root,fibre,flatWeave=True)
tailFit=FitVisibleCane(tailObject,[gripObj,*neckStems,wrap])

# One frayed, closed split-cane end leaves the left knot bight.
flagStart=tail[4]+Vector((-.0003,-.0002,.0006))
flagPoints=[tuple(flagStart),tuple(flagStart+Vector((-.004,-.002,.0005))),tuple(flagStart+Vector((-.009,-.005,-.0004)))]
looseBindingEnd=Rod('Loose binding end left',flagPoints,.00045,col,root,fibre,flatWeave=True)

HangingLoop(end+.013,.042,col,root,fibre)

# Wok spatula: a genuine thin curved blade with a rounded trapezoid silhouette,
# integral metal shank and wooden handgrip with an open hanging hole.
col,root=NewCollection('WokSpatula')
verts=[]
spatulaMeshRowsPx=(630,628,625,620,615,610,600,590,580,570,560,550,540,530,520,515,510,507,504,501,498,496,494,492)
rows=len(spatulaMeshRowsPx);cols=14
for j in range(rows):
    t=(630-spatulaMeshRowsPx[j])/(630-492)
    y=spatulaBladeBase+spatulaBladeLength*t
    left,right=SpatulaBladeEdges(t);width=right-left
    for i in range(cols):
        x=left+(right-left)*i/(cols-1)
        z=.030+.016*t*t+.005*((x-(left+right)*.5)/(width*.5))**2
        endRounding=(.128-SpatulaWorkingEdgeY(x))*t**4
        verts.append((x,y-endRounding,z))
faces=[]
for j in range(rows-1):
    for i in range(cols-1):
        a=j*cols+i; faces.append((a,a+1,a+1+cols,a+cols))
blade=Mesh('Forged thin blade',verts,faces,col,root,ironSpatula)
for poly in blade.data.polygons: poly.use_smooth=True
bladeOrigin=blade.data.attributes.new('K09BladeOrigin','FLOAT_VECTOR','POINT')
for value,vertex in zip(bladeOrigin.data,blade.data.vertices):value.vector=vertex.co
solid=blade.modifiers.new('Real iron thickness','SOLIDIFY');solid.thickness=.002;solid.offset=-1.
bpy.context.view_layer.objects.active=blade;bpy.ops.object.modifier_apply(modifier=solid.name)
bladeOrigin=blade.data.attributes.get('K09BladeOrigin');assert bladeOrigin is not None and len(blade.data.vertices)==rows*cols*2
bladeBackCount=0
for vertex in blade.data.vertices:
    origin=bladeOrigin.data[vertex.index].vector.copy()
    if (vertex.co-origin).length>1e-7:
        # The visible whole-plate contour is the reference constraint.
        # Keep a real2mm vertical back layer with the same XY outline;
        # its normal-direction thickness varies with the forged curvature.
        vertex.co=(origin.x,origin.y,origin.z-.002);bladeBackCount+=1
assert bladeBackCount==rows*cols
blade.data.update()
bev=blade.modifiers.new('Worn blade edges','BEVEL'); bev.width=.0007; bev.segments=1
# Working-edge wear is carried by PBR on the real thin bevel; no overlay plane.

neckV=[];neckF=[]
for j in range(7):
    t=j/6;y=-.016+(spatulaBladeBase+.017)*t;z=.024+.006*(t*t*(3-2*t))-.003*math.sin(math.pi*t)**2;w=.0110+.0070*(1-t)**4+.0100*t**4
    for i in range(3):neckV.append(((i-1)*w*.5-.00072*math.sin(math.pi*t)-.00036*t,y,z+(.0008+.0042*t**4)*(i-1)**2))
for j in range(6):
    for i in range(2):
        a=j*3+i;neckF.append((a,a+1,a+4,a+3))
neck=Mesh('Curved forged neck',neckV,neckF,col,root,iron)
for poly in neck.data.polygons:poly.use_smooth=True
solid=neck.modifiers.new('Neck thickness','SOLIDIFY');solid.thickness=.003
spatulaEnd,spatulaGrip=HangingHandle('Spatula wooden grip',.115,.032,.024,-.010,.024,col,root,woodSpatula)

def SpatulaGripFerrule(wood,col,root,mat):
    bpy.context.view_layer.update();evaluated=wood.evaluated_get(bpy.context.evaluated_depsgraph_get());data=evaluated.to_mesh();data.calc_loop_triangles()
    sourceTriangles=[[wood.matrix_world@data.vertices[index].co for index in face.vertices] for face in data.loop_triangles];evaluated.to_mesh_clear()
    normals=np.asarray([(math.cos(2*math.pi*index/12),math.sin(2*math.pi*index/12)) for index in range(12)])
    profiles=[]
    for y in (-.0135,-.007):
        sampleY=min(y,-.0102);points=[]
        for triangle in sourceTriangles:
            for index in range(3):
                a,b=triangle[index],triangle[(index+1)%3]
                if (a.y<=sampleY<b.y) or (b.y<=sampleY<a.y):
                    fraction=(sampleY-a.y)/(b.y-a.y);point=a.lerp(b,float(fraction));points.append((point.x,point.z))
        assert len(points)>=3,'Missing actual wood ferrule section'
        offsets=np.max(np.asarray(points)@normals.T,axis=0)+.00012
        inner=[np.linalg.solve(np.asarray([normals[index],normals[(index+1)%12]]),np.asarray([offsets[index],offsets[(index+1)%12]])) for index in range(12)]
        outer=[np.linalg.solve(np.asarray([normals[index],normals[(index+1)%12]]),np.asarray([offsets[index]+.00060,offsets[(index+1)%12]+.00060])) for index in range(12)]
        profiles.append((y,inner,outer))
    verts=[]
    for y,inner,outer in profiles:
        verts.extend((float(point[0]),y,float(point[1])) for point in outer)
        verts.extend((float(point[0]),y,float(point[1])) for point in inner)
    faces=[]
    for index in range(12):
        after=(index+1)%12
        faces.extend([(index,after,after+24,index+24),(index+12,index+36,after+36,after+12),(index+24,after+24,after+36,index+36),(index,index+12,after+12,after)])
    faces=[tuple(reversed(face)) for face in faces]
    obj=Mesh('Worn iron grip ferrule',verts,faces,col,root,mat)
    for face in obj.data.polygons:face.use_smooth=False
    return obj

spatulaFerrule=SpatulaGripFerrule(spatulaGrip,col,root,ironBinding)
spatulaCollar=RoundedWrap('Old iron grip binding',.032,.024,-.010,.024,.014,col,root,ironBinding,turns=3,steps=60,gripLength=.115,fitObjects=[spatulaGrip,spatulaFerrule])[0]
bpy.context.view_layer.update();collarTrees=[BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get()) for obj in (spatulaGrip,spatulaCollar,spatulaFerrule)];wirePoints=[]
def SpatulaWireSurfaceHeight(x,y):
    hits=[tree.ray_cast(Vector((x+dx,y+dy,.10)),Vector((0,0,-1)),.15)[0] for tree in collarTrees for dx in (-.0008,0,.0008) for dy in (-.0008,0,.0008)]
    hits=[hit for hit in hits if hit is not None];assert hits,'Missing finite-width crossed-collar support'
    return max(hit.z for hit in hits)+.00090
for step in range(6):
    t=step/5;x=-.010+.020*t;y=-.011-.010*t;wirePoints.append(Vector((x,y,SpatulaWireSurfaceHeight(x,y))))
for iteration in range(4):
    for index in range(len(wirePoints)-1):
        for fraction in np.linspace(0,1,17):
            point=wirePoints[index].lerp(wirePoints[index+1],float(fraction));missing=SpatulaWireSurfaceHeight(point.x,point.y)-point.z
            if missing>0:
                denominator=(1-fraction)**2+fraction**2
                wirePoints[index].z+=missing*(1-fraction)/denominator;wirePoints[index+1].z+=missing*fraction/denominator
crossedWire=Rod('Crossed collar wire',wirePoints,.00065,col,root,ironBinding);crossedWireFit=FitVisibleCane(crossedWire,[spatulaGrip,spatulaCollar,spatulaFerrule],.0008)

# Grater: frame has an open centre, each stamped blade has a real through-slot.
# Holes are part of mesh topology, not a texture. The back has no wood panel.
col,root=NewCollection('SweetPotatoGrater')
x0,x1=-graterWorkingHalfWidth,graterWorkingHalfWidth; sheetY0,sheetY1=-.090,.090; y0,y1=-.070,.070
z=.023
leftRail=Box('Left wood rail',(-.071,0,.012),(.016,.212,.024),col,root,wood,.0046)
rightRail=Box('Right wood rail',(.071,0,.012),(.016,.212,.024),col,root,wood,.0040)
# Existing bevel faces expose worn wood; no highlight overlay or new material.
for wornRail in (leftRail,rightRail):
    wornRail.data.materials.append(woodWorn)
    wornRail.modifiers['Worn edges'].material=1
Box('Upper wood rail left',(-.0484,.098,.012),(.0302,.016,.024),col,root,wood,.0004)
upperRail=Box('Upper wood rail right',(.0484,.098,.012),(.0302,.016,.024),col,root,wood,.0004)
graterEnd,graterGrip=HangingHandle('Grater handle',.045,.045,.024,-.106,.012,col,root,woodGraterHandle)
# A real inserted repair section sits between two rails, with slightly uneven
# seams and a dark hand-set peg; it is not a sticker over an intact rail.
Box('Old cross rail splice',(0,.098,.012),(.065,.016,.024),col,root,woodRepair,.0004)
for x in (.018,):CylinderBetween('Repair peg',(x,.098,.0238),(x,.098,.0245),.0011,col,root,ironWorn,5)
ChipWood(leftRail,(-.078,-.083,.024),.0032)
ChipWood(upperRail,(.050,.104,.024),.0028)
ChipWood(rightRail,(.078,.056,.024),.0022)
ChipWood(graterGrip,(.042,-.107,.024),.0022)
# One small triangular missing corner in the lower outer right rail.
# The tetrahedral cutter produces a few real wood faces rather than a decal.
chipPoints=[(.0805,-.060,.0255),(.0756,-.058,.0246),(.0796,-.0645,.0208),(.0754,-.061,.0203)]
chipCutter=Mesh('Angular rail chip cutter',chipPoints,[(0,2,1),(0,1,3),(0,3,2),(1,2,3)],col,root,wood)
chipCutter.data.materials.append(woodWorn)
for cutFace in chipCutter.data.polygons:cutFace.material_index=1
import bmesh
chipMesh=bmesh.new();chipMesh.from_mesh(chipCutter.data);bmesh.ops.recalc_face_normals(chipMesh,faces=list(chipMesh.faces));chipMesh.to_mesh(chipCutter.data);chipMesh.free()
bpy.context.view_layer.objects.active=rightRail
chipBoolean=rightRail.modifiers.new('Missing angular wood corner','BOOLEAN');chipBoolean.operation='DIFFERENCE';chipBoolean.object=chipCutter
bpy.ops.object.modifier_apply(modifier=chipBoolean.name);bpy.data.objects.remove(chipCutter,do_unlink=True)
# One narrow grain split is a real tapering V-cavity in the front rail.
# It sits inside the rail face, preserving the exterior contour and back.
splitPoints=[(.0717,-.057,.0265),(.0730,-.057,.0265),(.0722,.025,.0265),(.0723,-.049,.0218)]
splitCutter=Mesh('Long grain split cutter',splitPoints,[(0,2,1),(0,1,3),(0,3,2),(1,2,3)],col,root,wood)
splitMesh=bmesh.new();splitMesh.from_mesh(splitCutter.data);bmesh.ops.recalc_face_normals(splitMesh,faces=list(splitMesh.faces));splitMesh.to_mesh(splitCutter.data);splitMesh.free()
bpy.context.view_layer.objects.active=rightRail
splitBoolean=rightRail.modifiers.new('Long tapered grain split','BOOLEAN');splitBoolean.operation='DIFFERENCE';splitBoolean.object=splitCutter
bpy.ops.object.modifier_apply(modifier=splitBoolean.name);bpy.data.objects.remove(splitCutter,do_unlink=True)



nx,ny=3,graterAtlasRows
sheetOuter=[(x0,sheetY0,z),(x1,sheetY0,z),(x1,sheetY1,z),(x0,sheetY1,z)]
v=list(sheetOuter);f=[];toothV=[];toothF=[];slotPoints=[];cuttingBaseEdges=[];toothCellIds=[];holeLoops=[];motherBaseTriples=[];cutCrestPoints=[]
for i,j in graterCellIds:
    mx,my,hx,hy=GraterCell(i,j);cutSlope=GraterCutSlope(i,j);lift=1+.30*math.sin(i*3.1+j*2.0)
    for probe in (-.35,0,.35):slotPoints.append((mx+hx*probe,float(GraterExitY(i,j,probe))-.0002,z))
    inner=[(mx-hx*.85,my-hy-cutSlope*hx*.85,z),(mx,my-hy,z),(mx+hx*.85,my-hy+cutSlope*hx*.85,z)]
    inner.extend((mx+hx*fraction,float(GraterOpeningY(i,j,fraction)),z) for fraction in (.85,.425,0,-.425,-.85))
    hole=list(reversed(inner));base=len(v);v.extend(hole);holeLoops.append([Vector(point) for point in hole]);motherBaseTriples.append((base+7,base+6,base+5))
    q=len(toothV);baseFractions=(-.85,0,.85)
    tipFractions=(-.78,-.28,.36,.78) if (i+j)%2==0 else (-.78,-.36,.28,.78)
    bottom=[(mx+hx*fraction,my-hy+cutSlope*hx*fraction,z) for fraction in baseFractions]
    cuttingBaseEdges.extend([(bottom[0],bottom[1]),(bottom[1],bottom[2])]);toothV.extend(bottom)
    toothV.append((mx,my-hy+(graterCrownReach+hy)*.55,z+graterCutRise*lift*math.sin(math.pi*.55*.5)))
    for fraction in tipFractions:
        arch=float(GraterCrownArch(fraction))
        toothV.append((mx+hx*fraction,my-hy+(hy+graterCrownReach)*arch+cutSlope*hx*fraction,z+graterCutRise*lift*float(GraterHeightArch(fraction))*(1+.50*math.sin(i*1.7+j*.9)*(fraction/.85))))
        cutCrestPoints.append(toothV[-1])
    boundary=[0,1,2,*range(3+len(tipFractions),3,-1)]
    faces=[(q+3,q+boundary[index],q+boundary[(index+1)%len(boundary)]) for index in range(len(boundary))]
    toothF.extend(faces);toothCellIds.extend([i*graterAtlasRows+j]*len(faces))
# Triangulate one continuous sheet around all openings. This avoids hidden
# walls and T junctions when the three columns have different row counts.
f=[tuple(triangle) for triangle in tessellate_polygon([[Vector(point) for point in sheetOuter],*holeLoops])]
for a,b,c in motherBaseTriples:
    edges={frozenset((triangle[index],triangle[(index+1)%3])) for triangle in f for index in range(3)}
    if frozenset((a,b)) in edges and frozenset((b,c)) in edges:continue
    found=False
    for fi,triangle in enumerate(f):
        for index in range(3):
            start,end=triangle[index],triangle[(index+1)%3]
            if {start,end}=={a,c}:
                other=triangle[(index+2)%3];f[fi]=(start,b,other);f.append((b,end,other));found=True;break
        if found:break
    assert found,'Missing mother-sheet attachment edge'
plate=Mesh('Pierced iron and integral cutting lips',v+toothV,f+[tuple(len(v)+i for i in face) for face in toothF],col,root,iron)
plate.data.materials.append(ironTeeth)
plate.data.materials.append(iron)  # Explicit unpolished solidify-rim role.
plate.data.materials.append(ironCutEdge)  # Lip1 + rim offset2: genuine cut-thickness faces only.
for lipFaceIndex,polygon in enumerate(plate.data.polygons[len(f):]):
    polygon.material_index=1
    # Three real crown facets retain the punched/hammered crease.
    # Continuous smoothing turns these rubbing faces into uniform round ribs.
    polygon.use_smooth=lipFaceIndex%7 not in (3,4,5)
lipIds=plate.data.attributes.new('GraterLipIndex','INT','FACE')
for value in lipIds.data:value.value=-1
for index,cellId in enumerate(toothCellIds):lipIds.data[len(f)+index].value=cellId

# Adjacent cells share their boundary. Weld before solidifying so the thin
# sheet does not acquire bogus hidden walls at every cell seam.
import bmesh
bm=bmesh.new();bm.from_mesh(plate.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-8);bm.normal_update()
connectedEdges=0
for a,b in cuttingBaseEdges:
    a=Vector(a);b=Vector(b)
    matches=[edge for edge in bm.edges if ((edge.verts[0].co-a).length<1e-7 and (edge.verts[1].co-b).length<1e-7) or ((edge.verts[1].co-a).length<1e-7 and (edge.verts[0].co-b).length<1e-7)]
    if len(matches)==1 and {face.material_index for face in matches[0].link_faces}=={0,1}:connectedEdges+=1
assert connectedEdges==len(cuttingBaseEdges),'Cutting tongues do not share mother-sheet edges'
bm.to_mesh(plate.data);bm.free();plate.data.update()
from mathutils.kdtree import KDTree
cutCrestTree=KDTree(len(cutCrestPoints))
for index,point in enumerate(cutCrestPoints):cutCrestTree.insert(Vector(point),index)
cutCrestTree.balance()
cutOriginLayer=plate.data.attributes.new('K09CutOrigin','FLOAT_VECTOR','POINT')
cutCrestLayer=plate.data.attributes.new('K09CutCrest','FLOAT','POINT')
for vertex in plate.data.vertices:
    cutOriginLayer.data[vertex.index].vector=vertex.co
    cutCrestLayer.data[vertex.index].value=1. if cutCrestTree.find(vertex.co)[2]<1e-7 else 0.
assert sum(value.value>.5 for value in cutCrestLayer.data)==39*4
mod=plate.modifiers.new('Thin iron plate','SOLIDIFY'); mod.thickness=.0007; mod.material_offset_rim=2
for x,y in ((-.047,.086),(.030,.086),(-.051,-.086),(.049,-.086)):
    CylinderBetween('Hand set iron tack',(x,y,.0222),(x,y,.0253),.0032,col,root,ironWorn,6)

def RefitAssembledRimBands():
    skimmerCollection=bpy.data.collections['WillowSkimmer']
    skimmerRoot=next(obj for obj in skimmerCollection.objects if obj.type=='EMPTY')
    bandMaterial=bpy.data.materials['OldFibreBinding'];changes=[]
    bpy.context.view_layer.update()
    for index in range(14):
        band=bpy.data.objects['Rim tie %02d'%index]
        tree=WillowWorldTree(band)
        others=[obj for obj in skimmerCollection.objects if obj.type=='MESH' and not obj.name.startswith('Rim tie')]
        if not any(tree.overlap(WillowWorldTree(obj)) for obj in others):continue
        name=band.name;oldData=band.data;bpy.data.objects.remove(band,do_unlink=True);bpy.data.meshes.remove(oldData)
        angle=2*math.pi*index/14+.15+.045*math.sin(index*1.9)
        band=RimLashing(name,angle,index,skimmerCollection,skimmerRoot,bandMaterial)
        changes.append({'name':name,'offsetRad':band['rim_angle_offset_rad']})
        bpy.context.view_layer.update()
    return changes



organicWillowOffsets=[]
for organicObject in bpy.data.collections['WillowSkimmer'].objects:
    if organicObject.type!='MESH':continue
    if organicObject.name.startswith(('Willow warp','Willow weft','Willow neck','Irregular repair strand 00','Irregular repair strand 08')):continue
    inverse=organicObject.matrix_world.inverted()
    for vertex in organicObject.data.vertices:
        previous=organicObject.matrix_world@vertex.co;warped=OrganicWillowField(previous)
        organicWillowOffsets.append((warped-previous).length);vertex.co=inverse@warped
    organicObject.data.update()
bpy.context.view_layer.update()

# A nonlinear field mapped at low-poly vertices is piecewise linear, so its
# triangles need an actual local clearance solve after deformation.
weftSectionReports=[{'name':obj.name,'constructedWidthVariationMax':.14,'constructedHeightGainMax':.25,'variationAppliedBeforeCrossingSolve':True} for obj in weftObjects]
organicWeftStarts={obj.name:[vertex.co.copy() for vertex in obj.data.vertices] for obj in weftObjects}
# The broader fixed-boundary warp field compresses the shelf before
# row0's central underpass. Shorten that existing shelf by0.8mm in plan,
# rather than driving the neighboring low point down beyond its bound.
# Section, ring count, crossing order and all physical checks are retained.
# Crossing ownership and bounded local routing now handle each actual site.
organicWarpTrees=[WillowWorldTree(obj) for obj in warpObjects]
organicWeftNodes={};organicCrossTargets={};organicPlanarRoutes=[]
for row,obj in enumerate(weftObjects):
    owners=list(obj['weft_ring_warp_owner'])
    assert len(owners)==len(obj.data.vertices)//3
    for crossing in weftTemplates[row]['crossings']:
        organicWeftNodes[row,crossing['warp']]=[i for i,owner in enumerate(owners) if owner==crossing['warp']]
        organicCrossTargets[row,crossing['warp']]=CurvePoint(weftTemplates[row],crossing['distance'])[0]
        assert organicWeftNodes[row,crossing['warp']],'Missing authored crossing sections'

for organicIteration in range(81):
    bpy.context.view_layer.update()
    organicContacts=[(column,row) for row,obj in enumerate(weftObjects) for column,tree in enumerate(organicWarpTrees) if tree.overlap(WillowWorldTree(obj))]
    if not organicContacts:break
    for column,row in organicContacts:
        obj=weftObjects[row];step=.000025 if weaveOver[column,row] else -.000025
        rings=organicWeftNodes[row,column];shift=Vector((0,0,step))
        prospective=max((obj.data.vertices[ring*3+side].co+shift-organicWeftStarts[obj.name][ring*3+side]).length for ring in rings for side in range(3))
        if prospective>.001175:
            # Reserve the final part of the unchanged1.2mm bound for an
            # actual local path around the supporting rib instead of lifting.
            target=organicCrossTargets[row,column]
            hit=organicWarpTrees[column].ray_cast(Vector((target.x,target.y,.2)),Vector((0,0,-1)),.4)
            normal=hit[1] if hit[0] is not None else organicWarpTrees[column].find_nearest(target)[1]
            assert normal is not None,'Missing actual support normal for local route'
            if normal.z<0:normal=-normal
            direction=Vector((normal.x,normal.y,0))
            if direction.length<1e-8:direction=Vector((cx-target.x,cy-target.y,0))
            direction.normalize();shift=direction*(.000025 if step>0 else -.000025)
            assert max((obj.data.vertices[ring*3+side].co+shift-organicWeftStarts[obj.name][ring*3+side]).length for ring in rings for side in range(3))<=.0012,'Local route requires a different guide within the original bound'
            organicPlanarRoutes.append({'row':row,'column':column,'shiftM':list(shift)})
        for ring in rings:
            for side in range(3):obj.data.vertices[ring*3+side].co+=shift
        obj.data.update()
else:raise RuntimeError('Organic weave needs a different local bend; preserving original triangle budget')
organicWeftCorrection=max((vertex.co-before).length for obj in weftObjects for vertex,before in zip(obj.data.vertices,organicWeftStarts[obj.name]))
assert organicWeftCorrection<=.0012,'Organic weave correction exceeds local bound'

# Re-seat the already closed underside repair and front fan rods against
# the revised actual weave. Do not substitute a texture for these parts.
organicSeatReports=[]
for organicRod in [obj for obj in bpy.data.collections['WillowSkimmer'].objects if obj.name.startswith(('Irregular repair','Willow neck'))]:
    start=[vertex.co.copy() for vertex in organicRod.data.vertices];below=organicRod.name.startswith('Irregular repair')
    targets=[*warpObjects,*weftObjects]
    if below:
        targets.extend([bpy.data.objects['Double rim outer'],bpy.data.objects['Double rim inner']])
        if organicRod.name=='Irregular repair strand 08':targets.append(bpy.data.objects['Irregular repair strand 00'])
    for seatIteration in range(41):
        bpy.context.view_layer.update();tree=WillowWorldTree(organicRod)
        contacts=[pair for target in targets for pair in tree.overlap(WillowWorldTree(target))]
        if not contacts:break
        organicRod.data.calc_loop_triangles()
        rings={vertex//3 for face,_ in contacts for vertex in organicRod.data.loop_triangles[face].vertices}
        for ring in rings:
            for side in range(3):organicRod.data.vertices[ring*3+side].co.z+=-.000025 if below else .000025
        organicRod.data.update()
    else:raise RuntimeError('Organic support needs a revised path: '+organicRod.name+' contacts '+str(len(contacts)))
    maximum=max((vertex.co-before).length for vertex,before in zip(organicRod.data.vertices,start))
    assert maximum<=.0010,'Organic support correction exceeds local bound'
    organicSeatReports.append({'name':organicRod.name,'correctionM':maximum})
bpy.context.view_layer.update()




# The shared field is sampled on meshes with different tessellation density.
# Refit only the existing winding to the actual transformed wood/reeds; keep
# its topology, UVs and the original visible-cane1.2mm correction maximum.
assembledBindingRefit=FitVisibleCane(wrap,[gripObj,*neckStems],.0012)


frontRepairReports=[]
def AddFrontRepair(name,guide,radius):
    collection=bpy.data.collections['WillowSkimmer'];root=next(obj for obj in collection.objects if obj.type=='EMPTY')
    supports=[obj for obj in collection.objects if obj.type=='MESH'];supportTrees=[WillowWorldTree(obj) for obj in supports]
    points=[OrganicWillowField(MapWillowPoint((cx+x,cy+y,WillowBowlSurface(x,y)))) for x,y in guide]
    original=[point.copy() for point in points]
    def CrestAt(point):
        hits=[tree.ray_cast(Vector((point.x,point.y,.2)),Vector((0,0,-1)),.4)[0] for tree in supportTrees]
        values=[hit.z for hit in hits if hit is not None]
        return max(values)+radius*1.4 if values else None
    for point in points:
        height=CrestAt(point)
        if height is not None:point.z=max(point.z,height)
    constraints=[];minimum=[point.z for point in points]
    for index in range(len(points)-1):
        a,b=points[index],points[index+1];axis=Vector((b.x-a.x,b.y-a.y,0)).normalized();side=Vector((-axis.y,axis.x,0))
        for fraction in np.linspace(0,1,49):
            point=a.lerp(b,float(fraction));heights=[CrestAt(point+side*across+axis*along) for across in (-radius*1.5,0,radius*1.5) for along in (-radius*1.5,0,radius*1.5)];heights=[value for value in heights if value is not None]
            if heights:constraints.append((index,float(fraction),max(heights)))
    for iteration in range(5):
        for index,fraction,height in constraints:
            missing=height-((1-fraction)*points[index].z+fraction*points[index+1].z)
            if missing>0:
                denominator=(1-fraction)**2+fraction**2
                points[index].z+=missing*(1-fraction)/denominator;points[index+1].z+=missing*fraction/denominator
    # Lower conservative nodes to the closest actual support envelope while
    # preserving every finite-footprint sample constraint.
    for iteration in range(4):
        for node in range(len(points)):
            lower=minimum[node]
            for index,fraction,height in constraints:
                if index==node and 1-fraction>1e-7:lower=max(lower,(height-fraction*points[node+1].z)/(1-fraction))
                elif index+1==node and fraction>1e-7:lower=max(lower,(height-(1-fraction)*points[node-1].z)/fraction)
            points[node].z=lower
    obj=Rod(name,points,radius,collection,root,wicker[2])
    before=[vertex.co.copy() for vertex in obj.data.vertices]
    for iteration in range(25):
        bpy.context.view_layer.update();tree=WillowWorldTree(obj);obj.data.calc_loop_triangles()
        overlaps=[pair for target in supportTrees for pair in tree.overlap(target)]
        if not overlaps:break
        rings={vertex//3 for face,_ in overlaps for vertex in obj.data.loop_triangles[face].vertices}
        for ring in rings:
            for side in range(3):obj.data.vertices[ring*3+side].co.z+=.00005
        obj.data.update()
    else:raise RuntimeError('Front repair needs a revised guide: '+name)
    frontRepairReports.append({'name':name,'points':len(points),'maxEnvelopeRaiseM':max(point.z-old.z for point,old in zip(points,original)),'maxLocalCorrectionM':max((vertex.co-old).length for vertex,old in zip(obj.data.vertices,before)),'supportIntersections':len(overlaps)})
    return obj
repairSpan=.073
# The original two long loose front canes used44+26=70 triangles.
# Five supported short repairs use5*14=70, preserving the approved budget.
frontRepairGuides=[
    [(-.082,.045),(-.070,.028),(-.053,.010)],
    [(.083,.043),(.069,.026),(.050,.010)],
    [(-.074,-.028),(-.064,-.046),(-.049,-.062)],
    [(.075,-.028),(.061,-.046),(.045,-.063)],
    [(-.026,-.072),(-.014,-.057),(.003,-.041)]]
for repairIndex,repairGuide in enumerate(frontRepairGuides,1):
    AddFrontRepair('Irregular repair strand %02d'%repairIndex,repairGuide,.00070 if repairIndex in (1,3,5) else .00065)
# Two thin, asymmetrical damaged repair canes follow the selectedC left
# basket. Four original sections each, physically seated on real supports.
traceRepairGuides=[
    [(-.083,.028),(-.071,.036),(-.065,.020),(-.052,.010)],
    [(-.070,-.009),(-.061,.003),(-.047,-.008),(-.042,-.027)]]
for traceRepairIndex,traceRepairGuide in enumerate(traceRepairGuides,6):
    AddFrontRepair('Irregular repair strand %02d'%traceRepairIndex,traceRepairGuide,.00045 if traceRepairIndex==6 else .00050)
assert len(frontRepairReports)==7

assembledRimBandRefits=RefitAssembledRimBands()

assets=[bpy.data.collections[n] for n in ('WillowSkimmer','WokSpatula','SweetPotatoGrater')]

# Physical warp/weft separation is tested on actual unmerged strand meshes.
# Rim lashings and repair strips intentionally touch their supporting parts.
from mathutils.bvhtree import BVHTree
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
warp=[o for o in assets[0].objects if o.name.startswith('Willow warp')]
weft=[o for o in assets[0].objects if o.name.startswith('Willow weft')]
trees={o.name:BVHTree.FromObject(o,deps) for o in warp+weft}
weaveIntersections=sum(len(trees[a.name].overlap(trees[b.name])) for a in warp for b in weft)
assert weaveIntersections==0,'Willow warp/weft intersect: %s'%weaveIntersections
wrapTree=BVHTree.FromObject(wrap,deps)
bindingWoodIntersections=len(wrapTree.overlap(BVHTree.FromObject(gripObj,deps)))
bindingReedIntersections=sum(len(wrapTree.overlap(BVHTree.FromObject(stem,deps))) for stem in neckStems)
tailTree=BVHTree.FromObject(tailObject,deps);tailWoodIntersections=len(tailTree.overlap(BVHTree.FromObject(gripObj,deps)));tailReedIntersections=sum(len(tailTree.overlap(BVHTree.FromObject(stem,deps))) for stem in neckStems)
assert tailWoodIntersections==tailReedIntersections==0,'The visible tucked tail cuts its wood/reed supports'
rimTree=BVHTree.FromObject(outerRim,deps)
handleObj=next(o for o in assets[0].objects if o.name=='Skimmer wooden grip')
handleTree=BVHTree.FromObject(handleObj,deps)
rimDistances=[];handleDistances=[]
for start,endPoint in neckAnchors:
    rimHit=rimTree.find_nearest(Vector(start));handleHit=handleTree.find_nearest(Vector(endPoint))
    assert rimHit[0] is not None and handleHit[0] is not None,'Missing neck attachment geometry'
    rimDistances.append(float(rimHit[3]));handleDistances.append(float(handleHit[3]))
assert max(rimDistances)<.004 and max(handleDistances)<.004,'Neck stems do not reach rim or handle'


# Fail before the expensive surface bake when a geometry revision exceeds the
# unchanged per-item budget. Keep the final exported-budget assertion too.
for budgetCollection in assets:
    budgetTriangles=0
    for budgetObject in budgetCollection.objects:
        if budgetObject.type!='MESH':continue
        evaluatedBudget=budgetObject.evaluated_get(bpy.context.evaluated_depsgraph_get());budgetMesh=evaluatedBudget.to_mesh();budgetMesh.calc_loop_triangles();budgetTriangles+=len(budgetMesh.loop_triangles);evaluatedBudget.to_mesh_clear()
    if budgetCollection.name!='WillowSkimmer':assert 800<=budgetTriangles<=3000,budgetCollection.name+' exceeds its budget before baking'


def SeatFrayGuideOnActualTop(points,supportTrees):
    original=[Vector(point) for point in points];points=[point.copy() for point in original];constraints=[]
    for index,(a,b) in enumerate(zip(points[:-1],points[1:])):
        tangent=Vector((b.x-a.x,b.y-a.y,0)).normalized();side=Vector((-tangent.y,tangent.x,0))
        for fraction in np.linspace(0,1,25):
            point=a.lerp(b,float(fraction));heights=[]
            for across,along in ((0,0),(-.0011,0),(.0011,0),(0,-.0008),(0,.0008)):
                probe=point+side*across+tangent*along
                for tree in supportTrees:
                    hit=tree.ray_cast(Vector((probe.x,probe.y,.12)),Vector((0,0,-1)),.24)[0]
                    if hit is not None:heights.append(hit.z)
            if heights:constraints.append((index,float(fraction),max(heights)+.00025))
    for iteration in range(5):
        for index,fraction,height in constraints:
            deficit=height-((1-fraction)*points[index].z+fraction*points[index+1].z)
            if deficit>0:
                denominator=(1-fraction)**2+fraction**2
                points[index].z+=deficit*(1-fraction)/denominator;points[index+1].z+=deficit*fraction/denominator
    for iteration in range(4):
        for node in range(len(points)):
            lower=original[node].z
            for index,fraction,height in constraints:
                if index==node and 1-fraction>1e-7:lower=max(lower,(height-fraction*points[node+1].z)/(1-fraction))
                elif index+1==node and fraction>1e-7:lower=max(lower,(height-(1-fraction)*points[node-1].z)/fraction)
            points[node].z=lower
    maximum=max(point.z-old.z for point,old in zip(points,original))
    assert maximum<=.003,'Peel guide needs a different authored route over the notch'
    return points,maximum


willowHighObjects,willowSurfaceBake=ApplyWillowSurface(
    assets[0],outputRoot/'Refinement/MaterialSources/Texture_K09_WillowSurface_AlbedoSource.png',
    'f769bf7fe84ce60fefadbba5ba6135363c75aedfb77865c116ac23c121179c85',
    willowBakeDirectory,buildScript)

# Small peeled loose fibres are a separate post-bake geometric detail layer.
# The45 current core surfaces were projected above;
# new free tips receive the shared fibre PBR and runtime shadowing.
rimFrayRecords=[]
frayCollection=bpy.data.collections['WillowSkimmer'];frayRoot=next(obj for obj in frayCollection.objects if obj.type=='EMPTY')
fraySupportObjects=[obj for obj in frayCollection.objects if obj.type=='MESH']
fraySupports=[WillowWorldTree(obj) for obj in frayCollection.objects if obj.type=='MESH']
frayRimTree=WillowWorldTree(bpy.data.objects['Double rim outer'])
for frayIndex,(initialAngle,direction,length,outward) in enumerate(((3.08,-1,.016,.0045),(2.14,1,.022,.0032),(.36,-1,.012,.0030),(3.53,1,.018,.0035))):
    for angleOffset in (0.,.025,-.025,.05,-.05,.075,-.075):
        angle=initialAngle+angleOffset;radial=Vector((math.cos(angle),math.sin(angle),0));along=Vector((-radial.y,radial.x,0))*direction
        guide=Vector((cx,cy,.055))+radial*.101
        hit=frayRimTree.find_nearest(guide,.012);assert hit[0] is not None,'Missing real rim support for loose fibre'
        normal=hit[1].normalized();rootPoint=hit[0]+normal*.00065
        if frayIndex==1:
            # The peeled strip starts in the reduced bark section and then
            # follows the recovered full cane. Author it on the actual upper
            # rim arc with a world-up peel, rather than extending one notch
            # face normal through the neighbouring, thicker cane.
            points=[]
            for fraction,radialFraction,verticalLift in ((0.,0.,.00065),(.24,.18,.0007),(.52,.62,.0019),(.78,1.,.0033),(1.,.8,.0045)):
                localAngle=angle+direction*length/.101*fraction
                localRadial=Vector((math.cos(localAngle),math.sin(localAngle),0))
                axis=OrganicWillowField(Vector((cx,cy,.050))+localRadial*.101)
                location=axis+localRadial*(outward*radialFraction)
                top=frayRimTree.ray_cast(Vector((location.x,location.y,.12)),Vector((0,0,-1)),.24)[0]
                if top is None:top=frayRimTree.find_nearest(Vector((location.x,location.y,.060)),.02)[0]
                assert top is not None,'Missing actual upper rim for notch peel'
                points.append(Vector((location.x,location.y,top.z+verticalLift)))
        else:points=[rootPoint,rootPoint+along*(length*.48)+radial*(outward*.25)+normal*.0006,rootPoint+along*length+radial*outward+normal*.0018]
        fray=Rod('Rim split fibre %02d'%frayIndex,[tuple(point) for point in points],.00060,frayCollection,frayRoot,fibre,flatWeave=True)
        fray.data.calc_loop_triangles();tree=WillowWorldTree(fray);triangles=[set(triangle.vertices) for triangle in fray.data.loop_triangles]
        selfHits=[(a,b) for a,b in tree.overlap(tree) if a<b and not triangles[a].intersection(triangles[b])]
        frayFit={'iterations':0,'maxVertexAdjustmentM':0.0,'maxAllowedAdjustmentM':.0012,'supportIntersections':0,'guideEnvelopeRaiseM':0.0}
        if not selfHits and any(tree.overlap(support) for support in fraySupports):
            try:
                data=fray.data;bpy.data.objects.remove(fray,do_unlink=True);bpy.data.meshes.remove(data)
                points,guideRaise=SeatFrayGuideOnActualTop(points,fraySupports)
                fray=Rod('Rim split fibre %02d'%frayIndex,[tuple(point) for point in points],.00060,frayCollection,frayRoot,fibre,flatWeave=True)
                frayFit=FitVisibleCane(fray,fraySupportObjects,.0012)
                frayFit['guideEnvelopeRaiseM']=guideRaise
                fray.data.calc_loop_triangles();tree=WillowWorldTree(fray);triangles=[set(triangle.vertices) for triangle in fray.data.loop_triangles]
                selfHits=[(a,b) for a,b in tree.overlap(tree) if a<b and not triangles[a].intersection(triangles[b])]
            except (AssertionError,RuntimeError):
                rejectedFray=bpy.data.objects.get('Rim split fibre %02d'%frayIndex)
                if rejectedFray is not None:
                    data=rejectedFray.data;bpy.data.objects.remove(rejectedFray,do_unlink=True);bpy.data.meshes.remove(data)
                continue
        if selfHits or any(tree.overlap(support) for support in fraySupports):
            data=fray.data;bpy.data.objects.remove(fray,do_unlink=True);bpy.data.meshes.remove(data);continue
        uv=fray.data.uv_layers.active;distances=[0.]
        for a,b in zip(points,points[1:]):distances.append(distances[-1]+(b-a).length)
        for polygon in fray.data.polygons:
            sides={index%3 for index in polygon.vertices};seam=0 in sides and 2 in sides
            for loop in polygon.loop_indices:
                vertex=fray.data.loops[loop].vertex_index;ring,side=divmod(vertex,3);around=1. if seam and side==0 else side/3
                uv.data[loop].uv=(.62+around*.0018/.08,.15+distances[ring]/.16)
        fray['detail_layer']='Post-core-bake peeled loose fibre; shared PBR and runtime shadows'
        fraySupportObjects.append(fray);fraySupports.append(tree);rimFrayRecords.append({'fit':frayFit,'name':fray.name,'angleRad':angle,'lengthM':length,'outwardM':outward,'triangles':len(fray.data.loop_triangles),'supportIntersections':0,'unsharedSelfIntersections':0});break
    else:raise RuntimeError('Loose rim fibre needs a different local placement')
assert len(rimFrayRecords)==4 and sum(record['triangles'] for record in rimFrayRecords)==68

# Wider compound-looking rim bindings are an assembly detail after core bake,
# like the peeled free fibres. Preserve the established intrinsic45-core bake.
detailCollection=bpy.data.collections['WillowSkimmer'];detailRoot=next(obj for obj in detailCollection.objects if obj.type=='EMPTY');bpy.context.view_layer.update()
detailOldPoints=[obj.matrix_world@Vector(corner) for obj in detailCollection.objects if obj.type=='MESH' for corner in obj.bound_box]
bindingDetailReferenceOrigin=Vector(((min(p.x for p in detailOldPoints)+max(p.x for p in detailOldPoints))*.5,(min(p.y for p in detailOldPoints)+max(p.y for p in detailOldPoints))*.5,min(p.z for p in detailOldPoints)))
oldRimBindings=[obj for obj in detailCollection.objects if obj.type=='MESH' and obj.name.startswith('Rim tie ')];assert len(oldRimBindings)==14
for obj in oldRimBindings:
    mesh=obj.data;bpy.data.objects.remove(obj,do_unlink=True)
    if mesh.users==0:bpy.data.meshes.remove(mesh)
bundledRimBindingRecords=[]
for n in range(14):
    angle=2*math.pi*n/14+.15+.045*math.sin(n*1.9)
    binding=RimLashing('Rim tie %02d'%n,angle,n,detailCollection,detailRoot,fibre,widthGain=1.85,catchNetEnds=True)
    binding['detail_layer']='Post-core-bake wider rim binding; existing14 by12-triangle topology; fine fibre ridges represented by normal LOD'
    bundledRimBindingRecords.append({'name':binding.name,'widthGain':1.85,'angleOffsetRad':float(binding['rim_angle_offset_rad'])})

# Slightly cocked bowl mounting inferred from opposite front/back offsets in C.
# This is a rigid transform of the45 baked core parts and rim details. Their
# tangent-space textures and internal contacts are invariant; the grip remains.
from mathutils import Matrix
willowPoseCollection=bpy.data.collections['WillowSkimmer'];bpy.context.view_layer.update()
poseBounds=[obj.matrix_world@Vector(corner) for obj in willowPoseCollection.objects if obj.type=='MESH' for corner in obj.bound_box]
poseOldShift=Vector(((min(p.x for p in poseBounds)+max(p.x for p in poseBounds))*.5,(min(p.y for p in poseBounds)+max(p.y for p in poseBounds))*.5,min(p.z for p in poseBounds)))
poseDeps=bpy.context.evaluated_depsgraph_get();poseGrip=gripObj.evaluated_get(poseDeps);poseGripMesh=poseGrip.to_mesh();poseGripPoints=[gripObj.matrix_world@vertex.co for vertex in poseGripMesh.vertices];poseGrip.to_mesh_clear()
willowPosePivot=Vector(((min(p.x for p in poseGripPoints)+max(p.x for p in poseGripPoints))*.5,max(p.y for p in poseGripPoints)-.003,(min(p.z for p in poseGripPoints)+max(p.z for p in poseGripPoints))*.5))
poseOldShift=bindingDetailReferenceOrigin
willowPoseMatrix=Matrix.Translation(willowPosePivot)@Matrix.Rotation(math.radians(-2.9),4,'Z')@Matrix.Translation(-willowPosePivot)
willowPoseTargets=[obj for obj in willowPoseCollection.objects if obj.type=='MESH' and (obj.data.materials[0].name.startswith('Wicker_AgedSurface') or obj.name.startswith(('Rim tie ','Rim split fibre ')))]
assert len(willowPoseTargets)==63 and sum(obj.data.materials[0].name.startswith('Wicker_AgedSurface') for obj in willowPoseTargets)==45
for obj in willowPoseTargets:obj.matrix_world=willowPoseMatrix@obj.matrix_world
for obj in willowHighObjects:obj.matrix_world=willowPoseMatrix@obj.matrix_world
bpy.context.view_layer.update();posedBindingRefit=FitVisibleCane(wrap,[gripObj,*neckStems],.0012)
poseWrapTree=WillowWorldTree(wrap);bindingWoodIntersections=len(poseWrapTree.overlap(WillowWorldTree(gripObj)));bindingReedIntersections=sum(len(poseWrapTree.overlap(WillowWorldTree(stem))) for stem in neckStems)
assert bindingWoodIntersections==bindingReedIntersections==0
willowHeadPoseReport={'angleZDegrees':-2.9,'pivotAuthoredM':list(willowPosePivot),'prePoseBottomCentreM':list(poseOldShift),'authoredPoseMatrix':[[float(value) for value in row] for row in willowPoseMatrix],'rigidCoreParts':45,'rigidRimBands':14,'rigidFreeFibres':4,'gripUnrotated':True,'bindingFitUsesWorldSpace':True,'bindingRefit':posedBindingRefit,'newWillowBakeCalls':0,'referenceIsMeasurement':False,'referenceOffsetsNativePx':{'front':5.6875,'back':-10.25}}

# Align each complete asset to its own bottom-centre origin. Extend the grater
# length to ~31 cm, a plausible handheld size and the middle-piece budget.
for obj in bpy.data.collections['SweetPotatoGrater'].objects:
    if obj.type=='MESH':
        obj.location.y *= 1.24
        obj.scale.y *= 1.24
bpy.context.view_layer.update()
for col in assets:
    points=[o.matrix_world @ Vector(c) for o in col.objects if o.type=='MESH' for c in o.bound_box]
    if col.name=='WillowSkimmer':
        # Rotated object bounding-box corners overestimate a curved mesh.
        # The bottom-centre contract is defined by actual evaluated vertices.
        points=[];originDeps=bpy.context.evaluated_depsgraph_get()
        for originObject in col.objects:
            if originObject.type!='MESH':continue
            originEvaluated=originObject.evaluated_get(originDeps);originMesh=originEvaluated.to_mesh()
            points.extend(originObject.matrix_world@vertex.co for vertex in originMesh.vertices)
            originEvaluated.to_mesh_clear()
    shift=Vector(((min(p.x for p in points)+max(p.x for p in points))*.5,
                  (min(p.y for p in points)+max(p.y for p in points))*.5,
                  min(p.z for p in points)))
    if col.name=='SweetPotatoGrater':
        # Round only the frame. Preserve the original plate-space anchor and
        # bottom-centre contract by balancing the tiny wood-bound shift.
        # The plate/slots/nails stay at their authored positions.
        referenceOrigin=Vector([0.00012163445353507996, -0.027463294565677643, -0.0006237775087356567])
        woodAnchorDelta=referenceOrigin-shift
        assert woodAnchorDelta.length<.001,'Frame edit requires a larger coordinate review'
        for frameObject in col.objects:
            if frameObject.type=='MESH' and frameObject.data.materials[0].name.startswith('VillageTimber'):
                frameObject.location+=woodAnchorDelta
        bpy.context.view_layer.update()
        shift=referenceOrigin
    if col.name=='WillowSkimmer':
        willowHeadPoseReport['postPoseBottomCentreM']=list(shift)
        poseOldToNew=Matrix.Translation(-shift)@willowPoseMatrix@Matrix.Translation(poseOldShift)
        willowHeadPoseReport['oldNormalizedToNewNormalizedMatrix']=[[float(value) for value in row] for row in poseOldToNew]
    for obj in col.objects:
        if obj.type=='MESH': obj.location-=shift
    if col.name=='WillowSkimmer':
        for highObject in willowHighObjects:highObject.location-=shift
bpy.context.view_layer.update()

hangingHoleWorldCenters={}
for holeCollection in assets:
    matching=[obj for obj in holeCollection.objects if obj.type=='MESH' and 'hanging_hole_local_center' in obj]
    assert len(matching)==1
    holeObject=matching[0];hangingHoleWorldCenters[holeCollection.name]=list(holeObject.matrix_world@Vector(holeObject['hanging_hole_local_center']))

def MergeByMaterial(col):
    global graterSurfaceRoleReport
    # Merge same-material pieces while retaining the independent item root.
    groups={}
    for obj in list(col.objects):
        if obj.type=='MESH':
            bpy.context.view_layer.objects.active=obj
            for modifier in list(obj.modifiers): bpy.ops.object.modifier_apply(modifier=modifier.name)
            if col.name=='SweetPotatoGrater' and obj.data.attributes.get('GraterLipIndex'):
                # Only the rubbing portion of the real cutting crest exposes
                # polished metal. The lip's flanks and unpolished end segments
                # keep the oxidized rim material; no extra highlight mesh.
                nativeCrests=obj.data.attributes.get('K09CutCrest')
                assert nativeCrests is not None,'Solidify lost native cutting-edge ownership'
                for polygon in obj.data.polygons:
                    if polygon.material_index==3 and not all(nativeCrests.data[index].value>.5 for index in polygon.vertices):
                        polygon.material_index=2
                # Keep true cut walls separate from the convex top. A sloping
                # solidify rim may face upward and must not inherit top UVs
                # or blend its normals across the physical cutting crest.
                import bmesh
                edgeMesh=bmesh.new();edgeMesh.from_mesh(obj.data)
                for edge in edgeMesh.edges:
                    if len(edge.link_faces)==2 and len({face.material_index for face in edge.link_faces})>1:edge.smooth=False
                for face in edgeMesh.faces:
                    if face.material_index in (2,3):face.smooth=False
                edgeMesh.to_mesh(obj.data);edgeMesh.free();obj.data.update()
            if obj.data.materials[0].name in ('ForgedIron','ForgedIron_UsedEdge','ForgedIron_WornCuttingFlap','ForgedIron_SpatulaFace'):
                # Project each actual surface on its dominant plane AFTER
                # thickness is applied. Slot walls thus retain nonzero UV area.
                uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
                for polygon in obj.data.polygons:
                    # Only the convex top uses rubbing wear. Tongue undersides
                    # and the 0.7 mm cut walls retain the oxidized sheet PBR.
                    if col.name=='SweetPotatoGrater' and polygon.material_index==3:
                        centre=sum((obj.data.vertices[index].co for index in polygon.vertices),Vector())/len(polygon.vertices)
                        i,j=min(graterCellIds,key=lambda cell:((centre.x-GraterCell(*cell)[0])/.04)**2+((centre.y-GraterCell(*cell)[1])/.009)**2)
                        mx,my,hx,hy=GraterCell(i,j);lift=1+.30*math.sin(i*3.1+j*2.0)
                        for li in polygon.loop_indices:
                            vertexIndex=obj.data.loops[li].vertex_index
                            co=obj.data.vertices[vertexIndex].co
                            origin=obj.data.attributes['K09CutOrigin'].data[vertexIndex].vector
                            fraction=(origin.x-mx)/hx;tu=(fraction/.85+1)*.5
                            displacement=(co-origin).length
                            assert displacement<1e-7 or displacement>1e-5,'Ambiguous native cutting-wall layer'
                            tv=1. if displacement<1e-7 else 0.
                            uv.data[li].uv=((i+.02+.96*tu)/3,(j+.04+.92*tv)/graterAtlasRows)
                        continue
                    if len(obj.data.materials)>1 and polygon.material_index==1:
                        if polygon.normal.z<.20:
                            polygon.material_index=0;polygon.use_smooth=False
                        else:
                            cellLayer=obj.data.attributes.get('GraterLipIndex');assert cellLayer is not None,'Missing actual lip ownership'
                            cellId=cellLayer.data[polygon.index].value;assert cellId>=0,'Lost actual lip ownership'
                            i,j=divmod(cellId,graterAtlasRows);assert 0<=i<3 and 0<=j<graterColumnCounts[i]

                            mx,my,hx,hy=GraterCell(i,j)
                            for index in polygon.loop_indices:
                                co=obj.data.vertices[obj.data.loops[index].vertex_index].co
                                fraction=(co.x-mx)/hx;arch=float(GraterCrownArch(fraction))
                                tu=(fraction/.85+1)*.5;tv=(co.y-my-GraterCutSlope(i,j)*(co.x-mx)+hy)/((hy+graterCrownReach)*arch)
                                uv.data[index].uv=((i+.02+.96*tu)/3,(j+.04+.92*tv)/graterAtlasRows)
                            continue
                    axis=max(range(3),key=lambda i:abs(polygon.normal[i]))
                    a,b=((1,2),(0,2),(0,1))[axis]
                    for index in polygon.loop_indices:
                        co=obj.data.vertices[obj.data.loops[index].vertex_index].co
                        uv.data[index].uv=IronSurfaceUv(co[a],co[b],col.name=='SweetPotatoGrater')
            elif obj.data.materials[0].name.startswith('VillageTimber'):
                # Grain follows each component's own long axis. The end face is
                # mapped separately; handle wear masks use normalized length.
                uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
                points=[obj.matrix_world@v.co for v in obj.data.vertices]
                spans=[max(p[i] for p in points)-min(p[i] for p in points) for i in range(3)]
                longAxis=1 if obj.name=='Grater handle' else max((0,1),key=lambda i:spans[i]);lo=min(p[longAxis] for p in points);span=max(spans[longAxis],1e-8)
                offset=.62 if 'SpatulaGrip' in obj.data.materials[0].name else .45
                crossScale=16 if 'SpatulaGrip' in obj.data.materials[0].name else 6
                if 'Grip' not in obj.data.materials[0].name:offset=random.Random(obj.name).uniform(.25,.65)
                for polygon in obj.data.polygons:
                    normal=(obj.matrix_world.to_3x3()@polygon.normal).normalized();axis=max(range(3),key=lambda i:abs(normal[i]))
                    for index in polygon.loop_indices:
                        p=obj.matrix_world@obj.data.vertices[obj.data.loops[index].vertex_index].co
                        if axis==longAxis:
                            a,b=[i for i in range(3) if i!=longAxis];uv.data[index].uv=(offset+p[a]*crossScale,.5+p[b]*crossScale)
                        else:
                            cross=next(i for i in range(3) if i not in (axis,longAxis))
                            uv.data[index].uv=(offset+p[cross]*crossScale,.1+.8*(p[longAxis]-lo)/span)
            if obj.data.attributes.get('GraterLipIndex'):
                graterSurfaceRoleReport={
                    'topTriangles':sum(len(face.vertices)-2 for face in obj.data.polygons if face.material_index==1),
                    'oxidizedRimTriangles':sum(len(face.vertices)-2 for face in obj.data.polygons if face.material_index==2),
                    'polishedCutThicknessTriangles':sum(len(face.vertices)-2 for face in obj.data.polygons if face.material_index==3),
                    'sharpBoundaryEdges':sum(edge.use_edge_sharp for edge in obj.data.edges),
                    'wallThicknessM':.0007,'method':'Native Solidify material offset2: mother0 to oxidized rim2, lip1 to real cut rim3; top/wall normals separated'}
                obj.data.attributes.remove(obj.data.attributes['GraterLipIndex'])
            groups.setdefault(obj.data.materials[0].name,[]).append(obj)
    for name, objects in groups.items():
        if len(objects)<2: continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects: obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join()
        objects[0].name=col.name+'_'+name
for col in assets: MergeByMaterial(col)
bpy.context.view_layer.update()

# Tangent generation needs triangles. Repair only physically nondegenerate
# triangles whose UV projection collapsed after boolean/merge operations.
for col in assets:
    for obj in col.objects:
        if obj.type!='MESH':continue
        bpy.context.view_layer.objects.active=obj
        tri=obj.modifiers.new('Export triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
        uv=obj.data.uv_layers.active
        if not uv:continue
        for poly in obj.data.polygons:
            if len(poly.loop_indices)!=3:continue
            loops=list(poly.loop_indices);a,b,c=[np.asarray(uv.data[i].uv,dtype=np.float32) for i in loops]
            area=abs(float((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])))
            # Blender's glTF writer rounds UVs; near-collinear boolean slivers
            # need a larger island than the raw Blender threshold implies.
            threshold=1e-8 if obj.data.materials[0].name=='VillageTimber_SpatulaGrip' else 1e-12
            if area>=threshold:continue
            coords=[obj.data.vertices[obj.data.loops[i].vertex_index].co for i in loops]
            normal=(coords[1]-coords[0]).cross(coords[2]-coords[0]);axis=max(range(3),key=lambda i:abs(normal[i]));u,v=((1,2),(0,2),(0,1))[axis]
            origin=coords[0];du1=float(coords[1][u]-origin[u]);dv1=float(coords[1][v]-origin[v]);du2=float(coords[2][u]-origin[u]);dv2=float(coords[2][v]-origin[v])
            projected=abs(du1*dv2-dv1*du2);scale=max(8,math.sqrt(1e-5/max(projected,1e-30)))
            for li,p in zip(loops,coords):uv.data[li].uv=(.1+float(p[u]-origin[u])*scale,.1+float(p[v]-origin[v])*scale)

# A ray through the open end of each slot must pass through the joined iron
# plate and raised tongues. No extra bright triangles cover the cutting crowns.
from mathutils.bvhtree import BVHTree
plate = next(o for o in bpy.data.collections['SweetPotatoGrater'].objects if o.type=='MESH' and o.data.materials[0].name=='ForgedIron')
trees=[BVHTree.FromObject(plate,bpy.context.evaluated_depsgraph_get())]
openCount=0
for point in slotPoints:
    local=Vector(point)
    hits=[tree.ray_cast(Vector((local.x,local.y,-.1)),Vector((0,0,1)),.2)[0] for tree in trees]
    if all(hit is None for hit in hits): openCount+=1
assert openCount==len(slotPoints), 'Grater slot verification failed: %d/%d probes open' % (openCount,len(slotPoints))
# Independently test the complete grater in world space, including every frame
# and fastener, so a backing panel cannot accidentally seal a valid plate hole.
allVertices=[];allTriangles=[];deps=bpy.context.evaluated_depsgraph_get()
for obj in bpy.data.collections['SweetPotatoGrater'].objects:
    if obj.type!='MESH':continue
    evaluated=obj.evaluated_get(deps);m=evaluated.to_mesh();m.calc_loop_triangles();offset=len(allVertices)
    allVertices.extend([obj.matrix_world@v.co for v in m.vertices])
    allTriangles.extend([tuple(offset+i for i in tri.vertices) for tri in m.loop_triangles]);evaluated.to_mesh_clear()
fullTree=BVHTree.FromPolygons(allVertices,allTriangles,all_triangles=True)
slotWorld=[plate.matrix_world@Vector(p) for p in slotPoints]
throughCount=sum(fullTree.ray_cast(Vector((p.x,p.y,p.z-.08)),Vector((0,0,1)),.16)[0] is None for p in slotWorld)
assert throughCount==len(slotWorld),'Full grater exit paths blocked: %d/%d'%(throughCount,len(slotWorld))

def CorrectExportTangentHandedness(path,sourceCollection):
    # Blender 5.2.1's exporter retains Blender's bitangent sign while flipping
    # UV V. Detect this from the actual exported basis rather than assuming a
    # version-specific sign. Only the TANGENT accessor may change. A native
    # zero-length Mikk tangent is reconstructed from the actual UV derivative;
    # geometry, UVs, material declarations and encoded images stay untouched.
    original=path.read_bytes();payload=bytearray(original)
    jsonSize=struct.unpack_from('<I',payload,12)[0];document=json.loads(payload[20:20+jsonSize]);binaryOffset=28+jsonSize
    def Accessor(index):
        accessor=document['accessors'][index];view=document['bufferViews'][accessor['bufferView']]
        dtype=np.dtype({5123:'<u2',5125:'<u4',5126:'<f4'}[accessor['componentType']]);width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[accessor['type']]
        offset=binaryOffset+view.get('byteOffset',0)+accessor.get('byteOffset',0);stride=view.get('byteStride',dtype.itemsize*width)
        return np.ndarray((accessor['count'],width),dtype=dtype,buffer=payload,offset=offset,strides=(stride,dtype.itemsize))
    from mathutils.kdtree import KDTree
    yUp=np.asarray([[1,0,0],[0,0,1],[0,-1,0]],dtype=float);native=[]
    for sourceObject in sourceCollection.objects:
        if sourceObject.type!='MESH':continue
        data=sourceObject.data;data.calc_tangents();world=np.asarray(sourceObject.matrix_world);linear=yUp@world[:3,:3];normalMatrix=np.linalg.inv(linear).T
        materialByLoop={loop:data.materials[face.material_index].name for face in data.polygons for loop in face.loop_indices};layer=data.uv_layers.active
        for index,loop in enumerate(data.loops):
            normal=normalMatrix@np.asarray(data.corner_normals[index].vector);normal/=np.linalg.norm(normal);direction=linear@np.asarray(loop.tangent);length=np.linalg.norm(direction)
            if length>1e-10:direction/=length
            native.append({'position':yUp@(world@np.r_[np.asarray(data.vertices[loop.vertex_index].co),1])[:3],'normal':normal,'tangent':direction,'zero':length<1e-10,
                'uv':np.asarray([layer.data[index].uv.x,1-layer.data[index].uv.y]),'w':-float(loop.bitangent_sign)*np.sign(np.linalg.det(linear)),'material':materialByLoop[index]})
    sourceTree=KDTree(len(native))
    for index,item in enumerate(native):sourceTree.insert(Vector(item['position']),index)
    sourceTree.balance();meshTransforms={}
    def NodeMatrix(node):
        if 'matrix' in node:return np.asarray(node['matrix']).reshape(4,4).T
        x,y,z,w=node.get('rotation',[0,0,0,1]);rotation=np.asarray([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
        matrix=np.eye(4);matrix[:3,:3]=rotation@np.diag(node.get('scale',[1,1,1]));matrix[:3,3]=node.get('translation',[0,0,0]);return matrix
    def Visit(index,parent):
        node=document['nodes'][index];world=parent@NodeMatrix(node)
        if 'mesh' in node:
            assert node['mesh'] not in meshTransforms or np.allclose(meshTransforms[node['mesh']],world);meshTransforms[node['mesh']]=world
        for child in node.get('children',[]):Visit(child,world)
    for rootIndex in document['scenes'][document.get('scene',0)]['nodes']:Visit(rootIndex,np.eye(4))
    decisions={};records=[];zeroRepairs={}

    for meshIndex,mesh in enumerate(document['meshes']):
        for primitive in mesh['primitives']:
            attributes=primitive['attributes'];positions=Accessor(attributes['POSITION']).astype(float);normals=Accessor(attributes['NORMAL']).astype(float);uv=Accessor(attributes['TEXCOORD_0']).astype(float);tangent=Accessor(attributes['TANGENT']).astype(float);indices=Accessor(primitive['indices']).ravel().astype(int).reshape(-1,3)
            points=positions[indices];texture=uv[indices];edgeA=points[:,1]-points[:,0];edgeB=points[:,2]-points[:,0];deltaA=texture[:,1]-texture[:,0];deltaB=texture[:,2]-texture[:,0];determinant=deltaA[:,0]*deltaB[:,1]-deltaA[:,1]*deltaB[:,0]
            valid=(abs(determinant)>1e-12)&(np.linalg.norm(np.cross(edgeA,edgeB),axis=1)>1e-12);assert np.any(valid),'No valid tangent diagnostic triangles'
            bitangent=(edgeB[valid]*deltaA[valid,0,None]-edgeA[valid]*deltaB[valid,0,None])/determinant[valid,None]
            zeroIndices=np.where(np.linalg.norm(tangent[:,:3],axis=1)<1e-8)[0]
            if len(zeroIndices):
                derivative=(edgeA[valid]*deltaB[valid,1,None]-edgeB[valid]*deltaA[valid,1,None])/determinant[valid,None];weight=np.linalg.norm(np.cross(edgeA[valid],edgeB[valid]),axis=1);duSum=np.zeros_like(positions);dvSum=np.zeros_like(positions)
                np.add.at(duSum,indices[valid].ravel(),np.repeat(derivative*weight[:,None],3,axis=0));np.add.at(dvSum,indices[valid].ravel(),np.repeat(bitangent*weight[:,None],3,axis=0))
                for vertexIndex in zeroIndices:
                    normal=normals[vertexIndex]/np.linalg.norm(normals[vertexIndex]);direction=duSum[vertexIndex]-normal*float(normal@duSum[vertexIndex]);assert np.linalg.norm(direction)>1e-12,'Cannot reconstruct zero native tangent from UV';direction/=np.linalg.norm(direction);sign=1 if float(np.cross(normal,direction)@dvSum[vertexIndex])>0 else -1;zeroRepairs[(attributes['TANGENT'],int(vertexIndex))]=np.r_[direction,sign]
            authored=np.cross(normals[indices[valid]],tangent[indices[valid],:3])*tangent[indices[valid],3,None]
            cosine=np.sum(authored*bitangent[:,None,:],axis=2)/np.maximum(np.linalg.norm(authored,axis=2)*np.linalg.norm(bitangent,axis=1)[:,None],1e-30)
            clear=abs(cosine)>.05;negative=float(np.mean(cosine[clear]<0)) if np.any(clear) else None
            world=meshTransforms[meshIndex];linear=world[:3,:3];normalMatrix=np.linalg.inv(linear).T;materialName=document['materials'][primitive['material']]['name'];desired=tangent[:,3].copy();matchedCount=0
            for vertex in range(len(positions)):
                point=(world@np.r_[positions[vertex],1])[:3];normal=normalMatrix@normals[vertex];normal/=np.linalg.norm(normal);direction=linear@tangent[vertex,:3];length=np.linalg.norm(direction)
                if length>1e-10:direction/=length
                candidates=[native[index] for _,index,_ in sourceTree.find_range(Vector(point),2e-6) if native[index]['material']==materialName and max(abs(native[index]['uv']-uv[vertex]))<1e-6 and float(native[index]['normal']@normal)>1-1e-6]
                matched=[item for item in candidates if item['zero'] or length<1e-10 or float(item['tangent']@direction)>1-1e-6]
                assert matched,'Exported tangent has no matching authoritative native source loop'
                signs={item['w']/np.sign(np.linalg.det(linear)) for item in matched if not item['zero']}
                assert len(signs)<=1,'Native source loops disagree on the same exported corner sign'
                if signs:desired[vertex]=next(iter(signs));matchedCount+=1
            accessorIndex=attributes['TANGENT'];assert accessorIndex not in decisions or np.array_equal(decisions[accessorIndex],desired),'Shared tangent accessor has inconsistent source signs';decisions[accessorIndex]=desired
            records.append({'mesh':mesh['name'],'tangentAccessor':accessorIndex,'nativeMatchedVertices':matchedCount,'diagnosticCorners':int(np.count_nonzero(clear)),'negativeUvDerivativeFractionBefore':negative,'note':'Native live MikkTSpace loops are authoritative; per-face UV derivatives are diagnostic only at smoothed corners. Authored tangent xyz preserved.'})
    changed=0
    for accessorIndex,desired in decisions.items():
        values=Accessor(accessorIndex);assert values.shape[1]==4 and np.isin(desired,[-1,1]).all();changed+=int(np.count_nonzero(values[:,3]!=desired));values[:,3]=desired
    for (accessorIndex,vertexIndex),value in zeroRepairs.items():Accessor(accessorIndex)[vertexIndex]=value
    # OneDrive may briefly lock a just-exported GLB while syncing it.
    # Write the complete corrected payload first, then replace with bounded
    # retries. A failed replacement leaves the complete temporary payload.
    import time
    tangentTemporary=path.with_name(path.stem+'_TangentWrite.tmp')
    tangentTemporary.write_bytes(payload)
    for writeAttempt in range(12):
        try:os.replace(tangentTemporary,path);break
        except PermissionError:
            if writeAttempt==11:raise
            time.sleep(.1*(writeAttempt+1))
    return {'method':'Exact native source MikkTSpace corner signs after UV-V/world transforms; authored xyz preserved, zero-native tangents reconstructed from actual UV','sourceGlbSha256':hashlib.sha256(original).hexdigest(),'correctedGlbSha256':hashlib.sha256(payload).hexdigest(),'changedTangentVertices':changed,'zeroLengthTangentRepairs':[{'accessor':index,'vertex':vertex,'replacement':value.tolist()} for (index,vertex),value in zeroRepairs.items()],'primitives':records}

exportTangentReceipts={}
def SelectedExport(col):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in col.objects: obj.select_set(True)
    bpy.context.view_layer.objects.active=col.objects[0]
    path=artifactRoot/('Model_K09_'+col.name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_tangents=True)
    exportTangentReceipts[col.name]=CorrectExportTangentHandedness(path,col)
    return path

def MeshStats(col):
    deps=bpy.context.evaluated_depsgraph_get(); tri=0
    bounds=[]
    for obj in col.objects:
        if obj.type!='MESH': continue
        e=obj.evaluated_get(deps); m=e.to_mesh(); m.calc_loop_triangles(); tri+=len(m.loop_triangles)
        bounds += [obj.matrix_world @ vertex.co for vertex in m.vertices]
        e.to_mesh_clear()
    mins=[min(p[i] for p in bounds) for i in range(3)]
    maxs=[max(p[i] for p in bounds) for i in range(3)]
    return {'triangles':tri,'blender_bounds_m':{'min':mins,'max':maxs},'size_m':[maxs[i]-mins[i] for i in range(3)],'materials':sorted({m.name for o in col.objects if o.type=='MESH' for m in o.data.materials if m})}

stats={}
for col in assets:
    stats[col.name]=MeshStats(col)
    studyOnly=col.name=='WillowSkimmer' and os.environ.get('K09_OVER_BUDGET_MATERIAL_STUDY')=='1'
    assert 800<=stats[col.name]['triangles']<=(3240 if studyOnly else willowTriangleLimit if col.name=='WillowSkimmer' else 3000),col.name+' exceeds the approved per-asset triangle budget'
    path=SelectedExport(col)
    stats[col.name]['glb']=str(path)
    stats[col.name]['tangent_export']=exportTangentReceipts[col.name]
stats['SweetPotatoGrater']['verified_open_slot_rays']=openCount
stats['SweetPotatoGrater']['verified_full_grater_exit_rays']=throughCount
stats['SweetPotatoGrater']['exit_probe_positions_blender_m']=[list(p) for p in slotWorld]
stats['SweetPotatoGrater']['cut_surface_roles']=graterSurfaceRoleReport
stats['SweetPotatoGrater']['slot_count']=len(graterCellIds)
stats['SweetPotatoGrater']['column_cutting_counts']=list(graterColumnCounts)
stats['SweetPotatoGrater']['connected_cutting_edges']=connectedEdges
stats['WillowSkimmer']['warp_weft_bvh_intersections']=weaveIntersections
stats['WillowSkimmer']['parallel_weave_bvh_intersections']=parallelWeaveIntersections
stats['WillowSkimmer']['weave_profile']='split willow with broad pressure-flattened top and tapered rim ends'
stats['WillowSkimmer']['weave_local_lift_range_m']=[min(weaveLifts.values()),max(weaveLifts.values())]
stats['WillowSkimmer']['weave_contact_solve_iterations']=weaveSolveIteration
stats['WillowSkimmer']['max_neck_rim_distance_m']=max(rimDistances)
stats['WillowSkimmer']['max_neck_handle_distance_m']=max(handleDistances)
stats['WillowSkimmer']['binding_fit_metrics']=bindingFit
stats['WillowSkimmer']['binding_wood_bvh_intersections']=bindingWoodIntersections
stats['WillowSkimmer']['binding_reed_bvh_intersections']=bindingReedIntersections
stats['WillowSkimmer']['removed_boolean_fin_faces']=sum(int(o.get('removed_boolean_fin_faces',0)) for o in assets[0].objects)
for col in assets:
    stats[col.name]['verified_hanging_hole_rays']=1
    stats[col.name]['hanging_hole_center_blender_m']=hangingHoleWorldCenters[col.name]
stats['_build']={'script_sha256':buildSha256,'script_path':str(buildScript),'built_at_utc':datetime.now(timezone.utc).isoformat(),'iron_source_sha256':ironSourceSha256}
stats['_build']['willow_surface_bake']=str(willowBakeDirectory/'Data_K09WillowSurfaceBake.json')
stats['WillowSkimmer']['neck_joinery']='Five gathered ribs enter the broadened timber end beneath the winding; hidden internal mortises are inferred and not separately modelled.'
stats['WillowSkimmer']['tucked_tail_wood_intersections']=tailWoodIntersections
stats['WillowSkimmer']['tucked_tail_reed_intersections']=tailReedIntersections
stats['WillowSkimmer']['tucked_tail_fit']=tailFit
stats['WokSpatula']['crossed_collar_wire_fit']=crossedWireFit
stats['_build']['preview_only']=bool(willowSurfaceBake.get('previewOnly',False))
stats['_build']['willow_source_sha256']='f769bf7fe84ce60fefadbba5ba6135363c75aedfb77865c116ac23c121179c85'
stats['_build']['aged_elm_source_sha256']='ef05961499ec1717920084d79bf68ceaf14a28464ebd6a96f035af58742add97'
stats['_build']['spatula_grip_finish_source_sha256']='9afbb78ff816401cddcd2e1079235efe2f9f07a702c9ac1e7e9bf0509ac87662'
stats['_build']['spatula_grip_finish_source_path']=str(outputRoot/'Refinement/MaterialSources/Texture_K09_SpatulaFineGrip_AlbedoSource.png')
stats['_build']['spatula_grip_finish_field_mm']=[62.5,150]
stats['_build']['spatula_surface_design']={'sourceMode':'One new builtin imagegen quiet seasoned-iron albedo; inferred channels, upper seasoning and lower rubbed film; no copied photographic lighting','sourceSha256':'abb9ccc3b1a1c27ac4ccc2d3ab9e08c1cde06961631acc5d6a560391544b21c2','declaredFieldMm':[120,150],'sourceIsHistoricalScan':False,'reference':'Original C'}
stats['_build']['grater_edge_finish']={'method':'Polished real cutting crests with oxidized flanks/end segments and subtle rubbing variation','extraHighlightGeometry':False,'headTackRadiusM':.0032,'headTackSides':6,'bareFaceMapValues':[.76,.77,.745],'convexWearWidthSigmaFraction':.50,'cutLandWidthSigmaFraction':.40}
stats['WillowSkimmer']['organic_shape']={'method':'Shared field on centreline guides before final closed-strip loft; actual finite-footprint triangle support and bounded clearance solve','maxPlanarOffsetM':max(max(organicWillowOffsets),max(item['maxCenterlineFieldOffsetM'] for item in rigidRibRecords)),'maxAdditionalWeftCorrectionM':organicWeftCorrection,'supportCorrections':organicSeatReports,'sourceRibSimplificationScope':'Same2mm bound on the final artistic centreline; dynamic programming minimises segments without enlarging the bound','weaveLiftScope':'Crossing lifts apply to the final guide/loft geometry; post-loft correction separately bounded at1.2mm'}
stats['WillowSkimmer']['repair_and_knot']={'willowParts':45,'newRepairPieces':8,'frontRepairs':frontRepairReports,'weftProfileHeightFactor':.36,'weftShoulders':len(weftShoulders),'neckTurns':9,'backsideConnectorLengthM':0,'continuousLashingSpanM':.036,'estimatedFrontWoodGapM':.012,'knotPoints':15,'knotTriangles':86,'looseEndTriangles':14,'closedHangingLoop':True,'bindingMaterialSource':'retained WillowSurface source; inferred20micrometre relief and roughness','bindingSourceFieldMm':[80,160]}
stats['_build']['metal_profile_refinement']={'reference':'Original C first front views','spatulaPixelToMetre':spatulaPixelToMetre,'spatulaBladeBaseM':spatulaBladeBase,'spatulaBladeLengthM':spatulaBladeLength,'spatulaHoleFromButtM':.0215,'spatulaHoleRadiusM':.0041,'spatulaHoleCentreXM':-.0008,'spatulaBareBaseSrgb':[.73,.74,.72],'spatulaBareRoughness':.58,'spatulaGripSourceUOffset':.62,'spatulaWorkingEdgeOverlayRemoved':True,'graterCrownReachM':graterCrownReach,'graterExitCrownM':graterExitCrown,'graterArchExponent':.20,'graterArchPower':4,'graterCutRiseM':graterCutRise,'graterCutCrestTexture':True,'dimensionsAreDesignEstimates':True}
stats['_build']['offset_grater_refinement']={'reference':'Original C first front, rotated90deg','frameCentrePx':graterHandleReferenceCentrePx,'referencePixelScaleM':graterHandlePixelToMetre,'holeCentreXM':graterHandleHoleX,'holeFromButtM':graterHandleHoleFromButt,'metricDimensionsAreDesignEstimates':True}
stats['_build']['metal_profile_refinement'].pop('spatulaBareBaseSrgb',None)
stats['_build']['metal_profile_refinement'].pop('spatulaBareRoughness',None)
stats['_build']['metal_profile_refinement']['spatulaMaterialMode']='dedicated gray oxide source and inferred physical channels'
stats['_build']['eye_cut_refinement']={'motherUpperBoundaryVertices':5,'lipFrontVertices':4,'endOpeningDepthM':.0018,'retainedProbeBoundaryDepthM':.0008,'heightArchFloorFraction':.15,'lipEndArchFraction':.05,'probeCount':117,'scope':'Actual pointed punched aperture and curled tongue, no alpha mask'}
stats['_build']['wide_weave_refinement']={'weftWidthMultiplier':1.40,'mainWarpWidthMultiplier':1.16,'minorWarpWidthMultiplier':1.06,'sourceUnchanged':True,'reflectanceTargetsAreArtistic':True}
stats['_build']['over_budget_material_study']=os.environ.get('K09_OVER_BUDGET_MATERIAL_STUDY')=='1'
stats['_build']['willow_triangle_limit']=willowTriangleLimit
assert graterSurfaceRoleReport['polishedCutThicknessTriangles']==234
stats['_build']['native_cut_mapping']={'method':'Original crest ownership propagated through Solidify; original top vs displaced bottom define exact wallUV0/1','trueCuttingWallTriangles':234,'convexWearSigma':.50,'cutLandSigma':.40,'peakMetalResponseRetained':True}
stats['_build']['historical_quiet_iron_refinement']={'sourceSha256':'abb9ccc3b1a1c27ac4ccc2d3ab9e08c1cde06961631acc5d6a560391544b21c2','declaredFieldMm':[120,150],'materialFormulasUnchanged':False,'retainedDetailGain':.65,'retainedMacroBlendMax':.50,'displayCalibratedGainRange':[1.12,1.20],'newImagegenCalls':3,'consumedSources':1}
stats['_build']['historical_grater_timber_refinement']={'lowerBoardAndHandleSourceGain':[1.18,1.15,.97],'otherWoodMaterialsUnchanged':True,'designCalibrationNotMeasuredAlbedo':True}
stats['WillowSkimmer']['rimFrays']=rimFrayRecords
stats['_build']['rim_fray_layer']={'count':4,'triangles':68,'postBakeLayerOnly':True,'pieces':rimFrayRecords,'coreAOIncludesNewFreeFibres':False,'runtimeShadows':True}
stats['_build']['angular_wood_chip']={'locationSourceM':[.078,-.061,.023],'designExtentMm':[3.7,6,3.6],'realBooleanGeometry':True,'historicalMeasurement':False}
stats['_build']['continuous_lashing_refinement']={'turns':9,'spanM':.036,'startYM':-.053,'longBareMiddleGapRemoved':True,'coreSupportChanged':True,'requiresMatchedRebake':True}
stats['_build']['oblique_weave_refinement']={'centralWarpShear':-.23,'centralWeftShear':-.18,'warpBoundaryFalloffPower':1,'weftBoundaryFalloffPower':2,'referenceOrientationIsDiagnostic':True}
stats['_build']['rim_wear_refinement']={'localizedOuterCoreLoss':True,'addedOuterSections':2,'mainPeeledTipLengthM':.022,'closedCoreRetained':True,'geometryAndMaterialAreArtistic':True}
stats['_build']['historical_grater_relief_refinement']={'longGrainSplit':True,'cutRiseM':.0022,'convexWearSigma':.19,'convexBareRoughness':.23,'cutLandRoughness':.27,'cutLandMetalness':.96,'designNotMeasurement':True,'newImagegenSources':0}
stats['_build']['spatula_wear_refinement']={'gripSourceUOffset':.62,'gripSourceFieldWidthM':.0625,'exposedGrainGain':[1.16,1.30],'neckMinWidthParameterM':.011,'bindingSpanM':.014,'bindingRadiusM':.00058,'bindingSteps':60,'bindingSourcePbr':True,'edgeOxideUsesRetainedSource':False,'newImagegenSources':0,'designNotMeasurement':True}
stats['_build']['oxide_field_refinement']={'sourceSha256':'70afbe18ea1a7a43e4975b7bdf0c2ebeb7083fc8f7a71de50973fffe4e559423','declaredFieldMm':[120,150],'macroRetainedMax':.12,'fineRetainedGain':.20,'sourceGainRange':[1.0,1.06],'colourLowPassPx':2.2,'newImagegenCalls':1,'newSourceConsumed':1,'inferredChannelsNotScan':True}
stats['_build']['historical_short_repair_refinement']={'oldFrontRepairTriangles':70,'newFrontRepairTriangles':70,'frontRepairCount':5,'coreParts':40,'originalShapeBoundUnchangedM':.00015,'noLodAdopted':True,'designNotMeasurement':True}
stats['_build']['neck_knot_refinement']={'radiusM':.00062,'profileHeightFactor':.60,'traceScaleXY':[.65,.85],'knotAlongWindingFraction':.38,'frontSupportClearanceM':.00055,'fibreTint':[.85,.82,.73],'knotTriangles':86,'geometryAndColoursAreArtistic':True}
stats['_build']['historical_grater_patina_refinement']={'sourceUnchanged':True,'handleGain':[1.03,1.02,.99],'railGain':[1.02,1.01,.98],'desaturate':.16,'oldFilmDarkeningMax':.12,'geometryUVAndPbrResponseRetained':True,'designNotMeasurement':True,'newImagegenSources':0}
stats['_build']['weft_section_refinement']={'maxWidthVariation':.14,'maxHeightGain':.25,'boundaryFalloff':True,'crossingGeometryResolvedAtConstruction':True,'reports':weftSectionReports,'planarRoutes':organicPlanarRoutes,'originalCorrectionLimitM':.0012,'designNotMeasurement':True}
stats['_build']['historical_grater_roll_refinement']={'crestAsymmetryGain':.28,'convexBareRoughness':.32,'cutLandRoughness':.19,'geometryXYAndAperturesRetained':True,'reflectionIsLightDependent':True,'rubLandCoverageThreshold':[.08,.60],'designNotMeasurement':True,'newImagegenSources':0}
stats['_build']['historical_dense_weave_refinement']={'warpCount':15,'weftCount':13,'warpRadiiM':[.00100,.00145],'weftRadiusM':.00085,'warpStepM':.012,'weftStepM':.0125,'upperWeftSourceY':.089,'coreParts':42,'atlasBodyTileWidth':192,'originalCorrectionLimitM':.0012,'perimeterPairedSpanM':.010,'finalGuideLoft':True,'designNotMeasurement':True}
stats['_build']['historical_grater_lip_profile_refinement']={'cutRiseM':.0030,'heightArchFloorFraction':.15,'convexWearSigma':.50,'convexBareRoughness':.32,'flatCrestFaceIds':[3,4,5],'rubAcrossSigma':.55,'rubCoverageThreshold':[.08,.60],'apertureXYAndOriginal117ProbesRetained':True,'triangleCountRetained':2998,'newImagegenSources':0,'designNotMeasurement':True}
stats['_build']['fine_grip_refinement']={'sourceSha256':'9afbb78ff816401cddcd2e1079235efe2f9f07a702c9ac1e7e9bf0509ac87662','declaredFieldMm':[62.5,150],'colourLowPassPixels':.8,'finishQuantiles':[.18,.70],'shallowReliefM':[.000012,.000015],'baseRoughnessRange':[.68,.84],'originalGeometryUvAndTangentsRetained':True,'newImagegenSources':1,'designNotMeasurement':True}
stats['_build']['assembled_binding_refit']=assembledBindingRefit
stats['_build']['historical_rim_trace_wear_refinement']={'rimHarmonics':rimTraceHarmonics,'maxReferenceOffsetM':.00075,'newShortRepairs':2,'postBakeLooseFibres':4,'postBakeTriangles':68,'coreParts':45,'backBraces':2,'backBracePoints':7,'backBraceAnglesRad':[.58,-.58],'backCrossOffsetM':0.0,'sourceIsApproximatePhotoTrace':True,'newImagegenSources':0}
stats['_build']['historical_iron_grain_refinement']={'retainedSource':True,'grainBandBlurPx':[.65,5],'grainSampleScale':.36,'grainGain':1.10,'grainIsZeroMean':True,'bareColourBlend':.15,'reliefM':[.000035,.000012,-.000040],'geometryUvNativeTangentsRetained':True,'newImagegenSources':0,'designNotMeasurement':True}
stats['_build']['rail_wood_anchor_delta_m']=list(woodAnchorDelta)
stats['_build']['rail_wear_refinement']={'leftBevelM':.0046,'rightBevelM':.0040,'bevelUsesExistingExposedWoodMaterial':True,'newGeometrySegments':0,'newImagegenSources':0,'designNotMeasurement':True}
stats['_build']['repair_tone_refinement']={'repairSourceGain':1.75,'oldRailGain':[1.16,1.06,.94],'lowerWoodGain':[1.10,1.02,.90],'repairMaterialSeparatedFromWornBevel':True,'originalGeometryUvNativeTangentsRetained':True,'newImagegenSources':0,'notMeasuredAlbedo':True}
stats['_build']['historical_lip_reach_refinement']={'crownReachM':-.0020,'crestAsymmetryGain':.50,'cutRiseM':.0030,'triangleCount':2970,'motherApertureXYRetained':True,'original117ProbesRetained':True,'newImagegenSources':0,'designNotMeasurement':True}
stats['_build']['rub_breaks_refinement']={'rootMinimumWearPhase':.28,'convexContactFloor':.70,'originalCutCrestPbrRetained':True,'geometryAndUvRetained':True,'newImagegenSources':0,'designNotMeasurement':True}
stats['_build']['willow_width_refinement']={'majorWarpWidthGain':1.15,'otherWarpWidthGain':1.10,'weftWidthGain':1.15,'profileHeightAndWarpSeedCentrelinesRetained':True,'weftRowsRedistributed':True,'upperCapWeftSourceYM':.0955,'warpCount':15,'weftCount':13,'coreParts':45,'actualFootprintEnvelopeUpdated':True,'originalCorrectionLimitM':.0012,'newImagegenSources':0,'designNotMeasurement':True}
stats['_build']['spatula_contour_refinement']={'rowSamplesPx':list(spatulaMeshRowsPx),'verticalThicknessM':.002,'normalThicknessUniform':False,'preservesXYOutlineAcrossLayers':True,'realClosedBackLayer':True,'originalMaterialSourcesRetained':True,'newImagegenSources':0,'designNotMeasurement':True}
stats['_build']['willow_head_pose_refinement']=willowHeadPoseReport
stats['_build']['mesh_stats_bounds_method']='Actual evaluated vertices after final pose and merge'
stats['_build']['historical_bundled_binding_refinement']={'rimWidthGain':1.85,'rimBindings':14,'rimTrianglesEach':12,'postCoreAssemblyDetail':True,'actualNetEndsIncludedInSupport':True,'fibreNormalRidgeHeightM':.00018,'fibreNormalRidgePitchM':.0012,'normalScale':.55,'fibreBaseTint':[1.02,.98,.86],'coreBakeRetained':True,'normalReliefIsLodNotExtraGeometry':True,'oldCoreAoRetained':True,'runtimeShadowsForNewBindingWidth':True,'placement':bundledRimBindingRecords,'newImagegenSources':0,'designNotMeasurement':True}
stats['_build']['historical_reference_flow_refinement']={'sharedPreLoftField':True,'amplitudeM':-.008,'xCentreNormalized':.02,'xSigmaNormalized':.35,'yCentreNormalized':-.40,'ySigmaNormalized':.40,'vanishesAtBowlBoundary':True,'bowlHeightAndRimRetained':True,'originalRibApproximationLimitM':.002,'originalCorrectionLimitM':.0012,'same15x13Counts':True,'actualAsymmetricSupportShoulders':True,'minimumNeighbourTransitionArcM':.00012,'singleCrestConstructionRoutes':flowSingleShoulderRecords,'newImagegenSources':0,'designNotMeasurement':True}
stats['_build']['historical_punched_lip_refinement']={'cutRiseM':.0018,'crownReachM':-.0010,'heightArchFloorFraction':.05,'tipFractions':[-.83,-.28,.36,.83],'motherApertureXYRetained':True,'original117ProbesRetained':True,'newImagegenSources':0,'designNotMeasurement':True}
stats['_build']['narrow_wear_refinement']={'convexCrownWidthFraction':.24,'previousWidthFraction':.50,'geometryAndUvRetained':True,'cutWallPbrRetained':True,'normalImagesRetained':True,'newImagegenSources':0,'designNotMeasurement':True}
stats['_build']['rib_straightening_refinement']={'sharedPreLoftField':True,'organicXWaveAmplitudeM':.0016,'organicXShearM':-.013,'lowerCentreCorrectionAmplitudeM':-.005,'rimHarmonicsRetained':True,'bowlHeightRetained':True,'originalRibApproximationLimitM':.002,'originalCorrectionLimitM':.0012,'same15x13Counts':True,'newImagegenSources':0,'designNotMeasurement':True}
stats['_build']['flat_crest_refinement']={'crownArchExponent':.20,'previousCrownArchExponent':.50,'centreReachM':-.0021,'tipFractions':[-.78,-.28,.36,.78],'cutRiseM':.0018,'motherApertureXYRetained':True,'original117ProbesRetained':True,'topologyRetained':True,'newImagegenSources':0,'designNotMeasurement':True}
stats['_build']['cut_crest_iron_refinement']={'exposedIronSrgb':[.78,.79,.775],'polishFloor':.32,'polishVariableGain':.64,'bareRoughness':.19,'bareMetallic':.96,'geometryAndUvRetainedFromTuckedStudy':True,'paintedHighlights':False,'newImagegenSources':0,'designNotMeasurement':True}
stats['_build']['historical_spatula_wear_balance_refinement']={'neutralWearMetalMixGain':.24,'previousMixGain':.15,'bareIronSrgb':[.73,.74,.72],'roughnessGreyGain':.22,'roughnessClamp':[.54,.90],'bareRoughnessAtGrey1Rust0':.58,'oxideGreyRustMasksRetained':True,'normalImageRetained':True,'geometryAndUvRetained':True,'newImagegenSources':0,'designNotMeasurement':True}
stats['_build']['fine_grain_refinement']={'grainSourceRegionFraction':.50,'previousSourceRegionFraction':.36,'grainSourceCentre':[.36,.46],'zeroMeanGrainGain':.70,'previousGrainGain':1.10,'macroPhotoFieldRetained':True,'baseNormalOrmDerivedFromSameMatte':True,'geometryAndUvRetained':True,'newImagegenSources':0,'designNotMeasurement':True}
stats['_build']['rim_curve_refinement']={'innerRimSegments':24,'previousInnerRimSegments':12,'innerRimCentreRadiusM':.096,'innerCaneRadiusM':.0026,'radiusSectionAndCentreHeightRetained':True,'nominalAddedTriangles':72,'originalCurveAndCorrectionLimitsRetained':True,'normalReferenceCandidate':'539142af008c','newImagegenSources':0,'designNotMeasurement':True}
stats['_build']['double_binding_refinement']={'rimAssemblies':14,'realLoopsPerAssembly':2,'loopWidthGain':.43,'loopCentreBiasWidthFraction':.27,'trianglesPerAssembly':24,'noAlphaGap':True,'original150MicrometreLodLimitRetained':True,'workingTriangleTarget':3500,'strictUserCapRemoved':True,'normalReferenceCandidate':'bdaf3f648859','newImagegenSources':0,'designNotMeasurement':True}
stats['_build']['willow_bake_cache_key']=willowSurfaceBake['cacheKey']
stats['_build']['willow_bake_cache_hit']=willowSurfaceBake['cacheHit']
with (artifactRoot/'Data_K09_ModelStats.json').open('w',encoding='utf-8') as f: json.dump(stats,f,ensure_ascii=False,indent=2)

# A clean, fixed-camera local evidence rig; it is not included in exports.
scene.render.engine='CYCLES'
scene.cycles.samples=12
scene.render.resolution_x=500; scene.render.resolution_y=500; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.world.color=(.32,.32,.32)
scene.view_settings.view_transform='AgX'
camData=bpy.data.cameras.new('EvidenceCamera'); cam=bpy.data.objects.new('EvidenceCamera',camData); scene.collection.objects.link(cam)
scene.camera=cam; cam.data.type='ORTHO'; cam.data.ortho_scale=.43
def AreaLight(name, location, energy, size):
    data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.shape='DISK'; data.size=size
    obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj); obj.location=location
    obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat('-Z','Y').to_euler()
AreaLight('Softbox', (1,-1,2.0), 38, 2)
AreaLight('Fill',(-1,.5,1.5),18,2)
scene.render.film_transparent=False
world=scene.world; world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.37,.37,.37,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
directions={'Top':(0,0,2),'Side':(2,0,.09),'End':(0,-2,.09),'Bottom':(0,0,-2),'Angle':(1.4,-1.5,1.8),'Detail':(1,-1,1.4)}
if os.environ.get('K09_QUICK')=='1': directions={'Top':(0,0,2),'Angle':(1.4,-1.5,1.8)}
if os.environ.get('K09_NO_RENDER')=='1': directions={}
for col in assets:
    for other in assets: other.hide_render=(other!=col)
    for label,direction in directions.items():
        center=Vector((0,0,.035))
        cam.location=Vector(direction)+center
        cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
        cam.data.ortho_scale=.22 if label=='Detail' else .43
        scene.render.filepath=str(renderRoot/('K09_'+col.name+'_'+label+'.png'))
        bpy.ops.render.render(write_still=True)
for col in assets: col.hide_render=False
bpy.ops.wm.save_as_mainfile(filepath=str(artifactRoot/'Scene_K09_KitchenUtensils.blend'))
print('K09_STATS '+json.dumps(stats,ensure_ascii=False))
