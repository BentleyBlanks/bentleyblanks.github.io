"""Bake aligned 1K PBR data from references and focused imagegen sources.

This is technical texture packing/channel derivation, not a new generative
redesign. Broad colour stains are excluded from height by a high-pass filter.
Run with ordinary Python + Pillow + numpy before Script_StrawSleepingMatBake.py.
"""
from pathlib import Path
import argparse
import hashlib
import json
import numpy as np
from PIL import Image, ImageFilter, ImageOps, ImageDraw


def Blur(values, radius):
    image = Image.fromarray(np.uint8(np.clip(values, 0, 1) * 255))
    return np.asarray(image.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255


def BakeChannels(color, strength, broadRadius=7.0):
    rgb = np.asarray(color, dtype=np.float32) / 255
    luminance = rgb @ np.array([0.2126, 0.7152, 0.0722])
    fine = Blur(luminance, 0.45)
    broad = Blur(luminance, broadRadius)
    height = np.clip((fine - broad) * 1.4, -0.22, 0.22)
    # Pixel gradients follow the SAME generated strands as the albedo. Image
    # rows point down, whereas OpenGL tangent +Y points up.
    dy, dx = np.gradient(height)
    normal = np.stack((-dx * strength, dy * strength, np.ones_like(dx)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    normal = np.uint8(np.clip(normal * 0.5 + 0.5, 0, 1) * 255 + 0.5)
    roughness = np.uint8(np.clip(0.88 - height * 0.20 + (1 - broad) * 0.025, 0.80, 0.97) * 255)
    ao = np.uint8(np.clip(1.0 + np.minimum(height,0)*0.90, 0.76, 1.0) * 255)
    return normal, roughness, ao


def BakeCord(color):
    """Physical-scale two-lobe helix, sampled by the rope's arc-length UVs."""
    rgb=np.asarray(color,dtype=np.float32)/255
    rows,columns=rgb.shape[:2]
    yy,xx=np.mgrid[0:rows,0:columns]
    # Rotate longitudinal micro-fibres into the same helical direction as
    # the normal ridges; straight axial wood-like streaks are not rope grain.
    rowSample=(yy+(.019/(2*.015))*xx)%rows
    row0=np.floor(rowSample).astype(int);row1=(row0+1)%rows
    fraction=(rowSample-row0)[:,:,None]
    rgb=rgb[row0,xx]*(1-fraction)+rgb[row1,xx]*fraction
    color=Image.fromarray(np.uint8(np.clip(rgb,0,1)*255+.5))
    u=.5+(xx+.5)/1024
    v=.5-(yy+.5)/1024
    uvCircumference=(.155/3)/.015*.019
    phase=2*np.pi*(2*(v-.205)/uvCircumference-(u-.515)/(.155/3))
    amplitude=.00110
    du=amplitude*(2*np.pi/.015)*np.sin(phase)
    dv=-amplitude*(4*np.pi/.019)*np.sin(phase)
    micro=BakeChannels(color,1.3)[0].astype(np.float32)/127.5-1
    normal=np.stack((-du,-dv,np.ones_like(du)),axis=-1)
    normal[:,:,:2]+=micro[:,:,:2]*.22
    normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    normal=np.uint8(np.clip(normal*.5+.5,0,1)*255+.5)
    # Remove the source swatch's broad baked grooves; preserve its fibre hue
    # and fine grain, then put the braid cavities in the correct UV phase.
    broad=np.asarray(color.filter(ImageFilter.GaussianBlur(10)),dtype=np.float32)/255
    hue=np.asarray(color.filter(ImageFilter.GaussianBlur(30)),dtype=np.float32)/255
    grain=np.clip(rgb/np.maximum(broad,.025),.78,1.22)
    variation=.84+.16*(.5+.5*np.cos(phase))
    base=Image.fromarray(np.uint8(np.clip(hue*grain*variation[:,:,None],0,1)*255+.5))
    roughness=np.uint8(np.clip(.87+.035*(1-np.cos(phase))*.5,.84,.96)*255)
    ao=np.uint8((.76+.24*(.5+.5*np.cos(phase)))*255)
    return base,(normal,roughness,ao)


def FrayStrip(file):
    source=Image.open(file).convert('RGBA')
    box=source.getchannel('A').getbbox()
    assert box is not None,'Generated fray source contains no visible fibres'
    source=source.crop(box)
    strip=Image.new('RGBA',(512,128),(0,0,0,0))
    for index in range(8):
        tuft=ImageOps.mirror(source) if index%2 else source.copy()
        tuft.thumbnail((58-index%3*3,118-index%4*4),Image.Resampling.LANCZOS)
        strip.alpha_composite(tuft,(index*64+(64-tuft.width)//2,128-tuft.height))
    return strip


def KnotPatch(source,cord):
    source=source.convert('RGBA')
    alpha=np.asarray(source.getchannel('A'))
    ys,xs=np.where(alpha>180)
    source=source.crop((int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)))
    rgba=np.asarray(source,dtype=np.float32)/255
    median=np.median(rgba[:,:,:3][rgba[:,:,3]>.8],axis=0)
    cordRgb=np.asarray(cord,dtype=np.float32)/255
    target=.7*median+.3*np.median(cordRgb[236:304,15:175].reshape(-1,3),axis=0)
    rgb=np.clip(rgba[:,:,:3]*np.clip(target/np.maximum(median,.03),.85,1.15),0,1)
    binary=Image.fromarray(np.uint8(rgba[:,:,3]>.5)*255)
    # Padding connects all exterior corners even when the knot touches the
    # cropped image boundary. Interior gaps remain separate dark cavities.
    flood=ImageOps.expand(binary,border=1,fill=0);ImageDraw.floodfill(flood,(0,0),127)
    exterior=np.asarray(flood)[1:-1,1:-1]==127
    filler=np.asarray(cord.resize(source.size,Image.Resampling.LANCZOS),dtype=np.float32)/255
    filler*=target/np.maximum(np.median(filler.reshape(-1,3),axis=0),.03)
    fill=np.where(exterior[:,:,None],np.clip(filler,0,1),target*.22)
    opacity=np.clip((rgba[:,:,3]-.5)/.4,0,1)[:,:,None]
    rgb=rgb*opacity+fill*(1-opacity)
    core=Image.fromarray(np.uint8(rgb*255+.5)).resize((212,212),Image.Resampling.LANCZOS)
    patch=Image.new('RGB',(220,220),tuple(np.uint8(target*255)))
    patch.paste(core,(4,4))
    return patch,BakeChannels(patch,10.0,10.0)


def ResolveRollHorizon(projected,detail):
    """Keep approved wear; replace undersampled weave at cylinder horizons."""
    detail=detail.resize(projected.size,Image.Resampling.LANCZOS)
    photo=np.asarray(projected,dtype=np.float32)/255
    grain=np.asarray(detail,dtype=np.float32)/255
    grainBroad=np.asarray(detail.filter(ImageFilter.GaussianBlur(12)),dtype=np.float32)/255
    photoBroad=np.asarray(projected.filter(ImageFilter.GaussianBlur(20)),dtype=np.float32)/255
    fineSurface=photoBroad*np.clip(grain/np.maximum(grainBroad,.035),.52,1.52)
    rows=photo.shape[0]
    theta=np.pi+2*np.pi*(1-(np.arange(rows)+.5)/rows)
    facing=np.abs(np.sin(theta))
    transition=np.clip((facing-.25)/.5,0,1)
    weight=(1-transition*transition*(3-2*transition))[:,None,None]
    return Image.fromarray(np.uint8(np.clip(photo*(1-weight)+fineSurface*weight,0,1)*255+.5))


def Bake(root, scratch):
    root = Path(root)
    scratch = Path(scratch)
    scratch.mkdir(parents=True, exist_ok=True)
    source = root / 'Source'
    rope = Image.open(source / 'Texture_StrawCordFibreSource.png').convert('RGB')
    end = Image.open(source / 'Texture_StrawRollEndSource.png').convert('RGB')
    # Upper half: 2:1 sheet. Lower left: square roll cut end. Lower right:
    # square cord swatch. These disjoint UV regions prevent cross-contamination.
    rope = rope.resize((512, 384), Image.Resampling.LANCZOS)
    end = end.resize((512, 512), Image.Resampling.LANCZOS)
    rope,ropeData=BakeCord(rope)
    knot,knotData=KnotPatch(Image.open(source/'Texture_StrawKnotSource.png'),rope)
    fray=FrayStrip(source/'Texture_StrawFraySource.png')
    frayNormal=np.zeros((128,512,3),dtype=np.uint8);frayNormal[:]=[128,128,255]
    frayRoughness=np.full((128,512),230,dtype=np.uint8)
    frayAo=np.full((128,512),255,dtype=np.uint8)
    cordData=(np.concatenate([ropeData[0],frayNormal]),np.concatenate([ropeData[1],frayRoughness]),np.concatenate([ropeData[2],frayAo]))
    endData = BakeChannels(end, 6.0,14.0)
    textureDir = root / 'Texture'
    textureDir.mkdir(exist_ok=True)
    report = {'resolution': [1024, 1024], 'normalConvention': 'OpenGL +Y',
              'atlas': {'sheetV': [0.5, 1.0], 'cordUV': [[0.5,1.0],[0.125,0.5]], 'frayUV':[[0.5,1.0],[0.0,0.125]],'endUV': [[0.0,0.5],[0.0,0.5]], 'rolledKnotUV':[[524/1024,736/1024],[1-736/1024,1-524/1024]]},
              'cordNormalPitchMeters':.015,'alphaMode':'MASK','alphaCutoff':.33,
              'sourceProvider': 'built-in image_gen__imagegen',
              'rollHorizonDetail':'Approved reference projection keeps broad wear. At undersampled cylinder horizons, fine imagegen weave replaces stretched photographic grain, with a smooth facing-angle blend.',
              'knotDetail':'Dedicated imagegen compact straw-knot material projected onto a rounded low-poly knot proxy; region 520..740 pixels in both atlas axes.',
              'sets': {}}
    for state,sourceName in [('Flat','Texture_StrawFlatReferenceProjection.png'),('Rolled','Texture_StrawRolledReferenceProjection.png')]:
        body = Image.open(source/sourceName).convert('RGB').resize((1024,512),Image.Resampling.LANCZOS)
        if state=='Rolled':
            body=ResolveRollHorizon(body,Image.open(source/'Texture_StrawRollWeaveFineSource.png').convert('RGB'))
        atlas = Image.new('RGBA',(1024,1024),(0,0,0,255))
        atlas.paste(body,(0,0))
        atlas.paste(end,(0,512))
        atlas.paste(rope,(512,512))
        atlas.paste(fray,(512,896))
        if state=='Rolled':atlas.paste(knot,(520,520))
        bodyData = BakeChannels(body,9.0)
        normal = np.concatenate([bodyData[0],np.concatenate([endData[0],cordData[0]],axis=1)])
        roughness = np.concatenate([bodyData[1],np.concatenate([endData[1],cordData[1]],axis=1)])
        ao = np.concatenate([bodyData[2],np.concatenate([endData[2],cordData[2]],axis=1)])
        if state=='Rolled':
            normal[520:740,520:740]=knotData[0]
            roughness[520:740,520:740]=knotData[1]
            ao[520:740,520:740]=knotData[2]
        maps = {'BaseColor':atlas,'Normal':Image.fromarray(normal),
                'Roughness':Image.fromarray(roughness),'AO':Image.fromarray(ao)}
        report['sets'][state] = {}
        for channel,image in maps.items():
            file=textureDir/f'Texture_StrawSleepingMat{state}{channel}.png'
            image.save(file,optimize=True)
            report['sets'][state][channel]={'file':file.name,'size':list(image.size),
                'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),
                'colorSpace':'sRGB' if channel=='BaseColor' else 'linear data'}
        orm=np.stack([ao,roughness,np.zeros_like(ao)],axis=-1)
        Image.fromarray(orm).save(scratch/f'Texture_StrawSleepingMat{state}Orm.png')
    for channel in ['BaseColor','Normal','Roughness','AO']:
        legacyFile=textureDir/f'Texture_StrawSleepingMat{channel}.png'
        if legacyFile.exists(): legacyFile.unlink()
    (root / 'Data_TextureBake.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', default=str(Path(__file__).resolve().parent))
    parser.add_argument('--scratch', required=True)
    args = parser.parse_args()
    Bake(args.root, args.scratch)
