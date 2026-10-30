"""Composite only the new-paint tile; preserve every other source texel."""
from pathlib import Path
import hashlib,json,os
import numpy as np
from PIL import Image

root=Path(os.environ.get('TYPE94_PATCH_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/SurfaceV91'))
folder=root/'Textures/HighSurfaceV91Preview'
data=json.loads((root/'Acceptance/Data_PbrPatchPrepareV91.json').read_text())
bake=json.loads((root/'Acceptance/Data_PbrPatchBakeV91.json').read_text())
x,y,w,h=data['patchPixels']
coverage=Image.open(Path(data['materialReference']['sourceBlend']).parent/'Acceptance/Texture_AtlasCoverageV77.png').convert('L')
assert coverage.size==(4096,4096)
assert coverage.crop((x-9,y-9,x+w+9,y+h+9)).getbbox() is None,'Patch overlaps a retained source UV footprint/gutter'
outside=np.ones((4096,4096),dtype=bool);outside[y:y+h,x:x+w]=False
outputs={}
for channel in ['Base','Orm','Normal']:
    source=Path(data['inputs']['Paint'+channel]['file'])
    assert hashlib.sha256(source.read_bytes()).hexdigest()==data['inputs']['Paint'+channel]['sha256']
    tileFile=Path(bake[channel]['file'])
    assert hashlib.sha256(tileFile.read_bytes()).hexdigest()==bake[channel]['sha256']
    image=Image.open(source).convert('RGB');before=np.asarray(image).copy()
    tile=Image.open(tileFile).convert('RGB');assert tile.size==(w,h)
    image.paste(tile,(x,y));after=np.asarray(image)
    assert np.array_equal(before[outside],after[outside])
    assert np.array_equal(after[y:y+h,x:x+w],np.asarray(tile))
    file=folder/('Texture_Type94Paint'+channel+'PatchedV91.png');image.save(file)
    outputs[channel]=dict(file=str(file),sha256=hashlib.sha256(file.read_bytes()).hexdigest(),outsidePatchPixelsExact=True,patchPixelsExactToBake=True)
report=dict(passed=True,patchPixels=[x,y,w,h],retainedUvFootprintAndNinePixelGutterExcluded=True,outputs=outputs,
    scope='Only the bounded new-detail tile changes. No old sampled UV footprint is recoloured; AO/roughness/metalness and tangent normals remain separate.')
(root/'Acceptance/Data_PbrCompositeV91.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(passed=True,patchPixels=[x,y,w,h],channels=3)))
