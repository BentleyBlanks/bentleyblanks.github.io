"""Paste only the new tow tile into immutable retained Paint masters."""
from pathlib import Path
import hashlib,json,os
import numpy as np
from PIL import Image,ImageFilter
base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_PBR_ROOT',str(base/'SurfaceV96')));folder=root/'Textures/HighSurfaceV96Preview'
p=json.loads((root/'Acceptance/Data_TowPbrPrepareV96.json').read_text());bake=json.loads((root/'Acceptance/Data_TowTileBakeV96.json').read_text());x,y,w,h=p['patchPixels']
coverage=Image.open(root/'Acceptance/Texture_PaintSourceCoverageV96.png').convert('L').filter(ImageFilter.MaxFilter(25));assert coverage.crop((x,y,x+w,y+h)).getbbox()is None
outside=np.ones((4096,4096),dtype=bool);outside[y:y+h,x:x+w]=False;outputs={}
for channel in ['Base','Orm','Normal']:
    source=Path(p['inputs']['Paint'+channel]['file']);tile=Path(bake[channel]['file'])
    assert hashlib.sha256(source.read_bytes()).hexdigest()==p['inputs']['Paint'+channel]['sha256']and hashlib.sha256(tile.read_bytes()).hexdigest()==bake[channel]['sha256']
    image=Image.open(source).convert('RGB');before=np.array(image);detail=Image.open(tile).convert('RGB');assert detail.size==(w,h);image.paste(detail,(x,y));after=np.asarray(image)
    assert np.array_equal(before[outside],after[outside]);assert np.array_equal(after[y:y+h,x:x+w],np.asarray(detail))
    file=folder/('Texture_Type94Paint'+channel+'PatchedV96.png');image.save(file);outputs[channel]=dict(file=str(file),sha256=hashlib.sha256(file.read_bytes()).hexdigest(),outsidePatchPixelsExact=True)
(root/'Acceptance/Data_TowCompositeV96.json').write_text(json.dumps(dict(passed=True,outputs=outputs,patchPixels=[x,y,w,h],sourceUvFootprintExcluded=True),indent=2)+'\n');print(json.dumps(dict(passed=True,patchPixels=[x,y,w,h])))
