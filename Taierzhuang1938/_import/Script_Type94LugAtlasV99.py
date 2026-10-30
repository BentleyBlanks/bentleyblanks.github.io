"""Find a small guarded empty region in the actual V96 paint atlas."""
import ast,hashlib,io,json,os,struct
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_HIGH_ROOT',str(base/'SurfaceV99')));(root/'Acceptance').mkdir(parents=True,exist_ok=True)
checks=[]
def Check(value,label):checks.append(dict(passed=bool(value),check=label))
m=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV96.json').read_text());assert hashlib.sha256(Path(m['sourceGlb']).read_bytes()).hexdigest()==m['sha256']
file=Path(__file__).with_name('Script_VerifyType94WearV77.py');syntax=ast.parse(file.read_text());exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name=='Read'],type_ignores=[]),str(file),'exec'),globals())
data=Read(m['sourceGlb']);image=Image.new('L',(4096,4096));draw=ImageDraw.Draw(image)
for parts in data['meshes'].values():
    for part in parts:
        if part['material']!='Material_Type94Paint':continue
        uv=part['attributes']['TEXCOORD_0']*4096
        for ids in part['indices'].reshape(-1,3):draw.polygon([tuple(uv[i])for i in ids],fill=255)
image.save(root/'Acceptance/Texture_OriginalCoverageV99.png');guard=image.filter(ImageFilter.MaxFilter(25));blocks=np.asarray(guard).reshape(128,32,128,32).max(axis=(1,3))>0;patch=None
for y in range(125):
    for x in range(125):
        if not blocks[y:y+4,x:x+4].any():patch=[x*32,y*32,128,128];break
    if patch is not None:break
assert patch is not None
(root/'Acceptance/Data_LugAtlasV99.json').write_text(json.dumps(dict(reference=m,patchPixels=patch,guardPixels=12,oldUvFootprintExcluded=True),indent=2)+'\n');print(json.dumps(dict(patchPixels=patch,guardPixels=12)))
