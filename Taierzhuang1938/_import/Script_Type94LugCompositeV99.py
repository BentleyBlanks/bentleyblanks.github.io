from pathlib import Path
import hashlib,json,os
import numpy as np
from PIL import Image,ImageFilter
base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_HIGH_ROOT',str(base/'SurfaceV99')));folder=root/'Textures/HighSurfaceV99';p=json.loads((root/'Acceptance/Data_LugBakeV99.json').read_text());x,y,w,h=p['patchPixels']
coverage=Image.open(root/'Acceptance/Texture_OriginalCoverageV99.png').convert('L').filter(ImageFilter.MaxFilter(25));assert coverage.crop((x,y,x+w,y+h)).getbbox()is None;outside=np.ones((4096,4096),dtype=bool);outside[y:y+h,x:x+w]=False
for channel in ['Base','Orm','Normal']:
    image=Image.open(p['inputs'][channel]['file']).convert('RGB');before=np.array(image);tile=Image.open(p['tiles'][channel]['file']).convert('RGB');assert tile.size==(w,h);image.paste(tile,(x,y));assert np.array_equal(before[outside],np.asarray(image)[outside]);image.save(folder/('Texture_Type94Paint'+channel+'PatchedV99.png'))
print(json.dumps(dict(passed=True,patchPixels=p['patchPixels'],outsidePixelsExact=True)))
