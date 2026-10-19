"""Bake aligned 1K PBR data from the two approved imagegen material sources.

This is technical texture packing/channel derivation, not a new generative
redesign. Broad colour stains are excluded from height by a high-pass filter.
Run with ordinary Python + Pillow + numpy before Script_StrawSleepingMatBake.py.
"""
from pathlib import Path
import argparse
import hashlib
import json
import numpy as np
from PIL import Image, ImageFilter


def Blur(values, radius):
    image = Image.fromarray(np.uint8(np.clip(values, 0, 1) * 255))
    return np.asarray(image.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255


def BakeChannels(color, strength):
    rgb = np.asarray(color, dtype=np.float32) / 255
    luminance = rgb @ np.array([0.2126, 0.7152, 0.0722])
    fine = Blur(luminance, 0.45)
    broad = Blur(luminance, 7.0)
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


def Bake(root, scratch):
    root = Path(root)
    scratch = Path(scratch)
    scratch.mkdir(parents=True, exist_ok=True)
    source = root / 'Source'
    rope = Image.open(source / 'Texture_StrawRopeSource.png').convert('RGB')
    end = Image.open(source / 'Texture_StrawRollEndSource.png').convert('RGB')
    # Upper half: 2:1 sheet. Lower left: square roll cut end. Lower right:
    # square cord swatch. These disjoint UV regions prevent cross-contamination.
    rope = rope.resize((512, 512), Image.Resampling.LANCZOS)
    end = end.resize((512, 512), Image.Resampling.LANCZOS)
    ropeData = BakeChannels(rope, 3.0)
    endData = BakeChannels(end, 4.2)
    textureDir = root / 'Texture'
    textureDir.mkdir(exist_ok=True)
    report = {'resolution': [1024, 1024], 'normalConvention': 'OpenGL +Y',
              'atlas': {'sheetV': [0.5, 1.0], 'cordUV': [[0.5,1.0],[0.0,0.5]], 'endUV': [[0.0,0.5],[0.0,0.5]]},
              'sourceProvider': 'built-in image_gen__imagegen', 'sets': {}}
    for state,sourceName in [('Flat','Texture_StrawFlatReferenceProjection.png'),('Rolled','Texture_StrawRolledReferenceProjection.png')]:
        body = Image.open(source/sourceName).convert('RGB').resize((1024,512),Image.Resampling.LANCZOS)
        atlas = Image.new('RGB',(1024,1024))
        atlas.paste(body,(0,0))
        atlas.paste(end,(0,512))
        atlas.paste(rope,(512,512))
        bodyData = BakeChannels(body,9.0)
        normal = np.concatenate([bodyData[0],np.concatenate([endData[0],ropeData[0]],axis=1)])
        roughness = np.concatenate([bodyData[1],np.concatenate([endData[1],ropeData[1]],axis=1)])
        ao = np.concatenate([bodyData[2],np.concatenate([endData[2],ropeData[2]],axis=1)])
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
