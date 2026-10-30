"""Find a new-detail region without touching any currently sampled paint UV."""
import ast,hashlib,io,json,os,struct
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=Path(os.environ.get('TYPE94_PBR_ROOT',str(base/'SurfaceV96')))
(root/'Acceptance').mkdir(parents=True,exist_ok=True);checks=[]
def Check(value,label):checks.append(dict(passed=bool(value),check=label))
m=json.loads((repo/'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV92.json').read_text())
assert hashlib.sha256(Path(m['sourceGlb']).read_bytes()).hexdigest()==m['sha256']
file=Path(__file__).with_name('Script_VerifyType94WearV77.py');syntax=ast.parse(file.read_text())
exec(compile(ast.Module(body=[n for n in syntax.body if isinstance(n,ast.FunctionDef)and n.name=='Read'],type_ignores=[]),str(file),'exec'),globals())
source=Read(m['sourceGlb']);image=Image.new('L',(4096,4096));draw=ImageDraw.Draw(image);triangles=0
for parts in source['meshes'].values():
    for part in parts:
        if part['material']!='Material_Type94Paint':continue
        uv=part['attributes']['TEXCOORD_0']*4096
        for ids in part['indices'].reshape(-1,3):draw.polygon([tuple(uv[i])for i in ids],fill=255);triangles+=1
image.save(root/'Acceptance/Texture_PaintSourceCoverageV96.png')
guard=image.filter(ImageFilter.MaxFilter(25));occupied=np.asarray(guard).reshape(128,32,128,32).max(axis=(1,3))>0
# Histogram rectangles are enumerated at32px resolution. Require at least
# 256px in each dimension and prefer a compact region for the new small parts.
height=np.zeros(128,dtype=int);rectangles=[]
for row in range(128):
    height=np.where(occupied[row],0,height+1);stack=[]
    for column in range(129):
        value=int(height[column])if column<128 else 0;start=column
        while stack and stack[-1][1]>value:
            left,h=stack.pop();w=column-left;start=left
            if min(w,h)>=8:rectangles.append((w*h,left,row-h+1,w,h))
        if not stack or stack[-1][1]<value:stack.append((start,value))
assert rectangles,'No usable empty paint-atlas rectangle'
ranked=sorted(rectangles,key=lambda r:(min(r[0],1024),-abs(np.log(r[3]/r[4])),r[0]),reverse=True)
area,x,y,w,h=ranked[0];x,y,w,h=[int(v*32)for v in [x,y,w,h]]
# Limit the tile to a1024px long edge while retaining the available aspect.
scale=min(1,1024/max(w,h));w=int(w*scale)//32*32;h=int(h*scale)//32*32
assert w*h>=150000 and guard.crop((x,y,x+w,y+h)).getbbox()is None
report=dict(passed=True,materialReference=m,sourceGlbSha256=m['sha256'],patchPixels=[x,y,w,h],sourcePaintTriangles=triangles,sourceFootprintGuardPixels=12,occupiedSourceAtlasFraction=float(np.mean(np.asarray(image)>0)),newDetailTileAreaPixels=w*h,sourceUvFootprintExcluded=True,scope='Empty actual V92 paint-atlas rectangle with12px guard; no texture or UV mutation')
(root/'Acceptance/Data_PaintAtlasSpaceV96.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k!='materialReference'}))
