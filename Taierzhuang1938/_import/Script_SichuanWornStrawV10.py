"""Prepare the imagegen lengthwise old-grass surface as a 1024 PBR set."""
import hashlib, json
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter


def Main():
    output=Path(__file__).resolve().parents[1]/'Model/SichuanBlanketPack'
    source=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack/Source/MaterialAtlasV10/Image_SichuanWornStrawV10.png')
    with Image.open(source) as image:
        sourceSize=list(image.size)
        base=image.convert('RGB').resize((1024,1024),Image.Resampling.LANCZOS)
    gray=base.convert('L')
    luminance=np.asarray(gray,dtype=np.float32)/255
    height=luminance-np.asarray(gray.filter(ImageFilter.GaussianBlur(4)),dtype=np.float32)/255
    sy,sx=np.gradient(height)
    normal=np.stack((-sx*2.2,sy*2.2,np.ones_like(sx)),axis=-1)
    normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
    rough=np.clip(.955+height*.07,.925,.985)
    maps={}
    for channel,image in (('Base',base),('Normal',Image.fromarray(np.rint(np.clip(normal*.5+.5,0,1)*255).astype(np.uint8))),
                          ('Roughness',Image.fromarray(np.rint(rough*255).astype(np.uint8)))):
        path=output/('Texture_SichuanWornStrawV10'+channel+'.png');image.save(path)
        with Image.open(path) as check:
            check.load();assert check.size==(1024,1024)
        maps[channel]={'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    report={'source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
            'sourceResolution':sourceSize,'generator':'Built-in imagegen, approved V02 straw material reference',
            'layout':'Lengthwise unbraided grass surface; weave supplied by geometry',
            'albedoPreparation':'RGB/Lanczos only','resolution':[1024,1024],
            'normalConvention':'OpenGL +Y','roughnessRange':[float(rough.min()),float(rough.max())],
            'maps':maps,'gameBakeComplete':False}
    (output/'Data_SichuanWornStrawV10.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print('V10_STRAW_PBR_PREPARED',json.dumps(report))


if __name__=='__main__':Main()
