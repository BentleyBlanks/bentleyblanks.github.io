"""Raster actual fresh-UV road annuli without changing AO or tangent normals."""
from pathlib import Path
import hashlib,json,os
import numpy as np
from PIL import Image,ImageDraw
root=Path(os.environ['TYPE94_SOURCE_ROOT']);revision=os.environ['TYPE94_SURFACE_REVISION'];assert revision=='SurfaceV66Preview';folder=root/'Textures'/('High'+revision);inputFile=root/'Acceptance/Data_TyreFaceUvV66.json';data=json.loads(inputFile.read_text());size=data['size'];factor=4
paint=Image.new('L',(size*factor,size*factor));valid=Image.new('L',paint.size);drawPaint=ImageDraw.Draw(paint);drawValid=ImageDraw.Draw(valid)
for face in data['faces']:
    polygon=[(u*(size-1)*factor,(1-v)*(size-1)*factor)for u,v in face['uv']];drawValid.polygon(polygon,fill=255)
    if face['coated']:drawPaint.polygon(polygon,fill=255)
paint=paint.resize((size,size),Image.Resampling.LANCZOS);valid=valid.resize((size,size),Image.Resampling.LANCZOS);mask=np.asarray(paint,dtype=np.float64)/255.;occupied=np.asarray(valid)>127
# Nearest valid texel within the bake margin, with deterministic tie ordering.
# Only empty UV padding is filled; occupied uncoated faces are never dilated.
validPad=np.pad(occupied,8);maskPad=np.pad(mask,8);pending=~occupied
offsets=sorted((x*x+y*y,y,x)for y in range(-8,9)for x in range(-8,9)if x*x+y*y<=64)
for distance,y,x in offsets:
    candidate=validPad[8+y:8+y+size,8+x:8+x+size];take=pending&candidate
    mask[take]=maskPad[8+y:8+y+size,8+x:8+x+size][take];pending[take]=False
base=np.array(Image.open(folder/'Texture_Type94RubberBase.png').convert('RGB'));orm=np.array(Image.open(folder/'Texture_Type94RubberOrm.png').convert('RGB'));originalBase=base.copy();originalOrm=orm.copy();m=mask[:,:,None]
def Linear(v):return np.where(v<=.04045,v/12.92,((v+.055)/1.055)**2.4)
def Srgb(v):return np.where(v<=.0031308,12.92*v,1.055*np.maximum(v,0)**(1/2.4)-.055)
base=np.rint(np.clip(Srgb(Linear(base/255.)*(1-m)+np.array(data['tintLinearRgb'])*m),0,1)*255).astype(np.uint8);orm[:,:,1]=np.rint(orm[:,:,1]*(1-mask)+data['roughness']*255*mask).astype(np.uint8);orm[:,:,2]=np.rint(orm[:,:,2]*(1-mask)).astype(np.uint8)
assert np.array_equal(orm[:,:,0],originalOrm[:,:,0]);unchanged=mask==0;assert np.array_equal(base[unchanged],originalBase[unchanged])and np.array_equal(orm[unchanged],originalOrm[unchanged]);outputs={}
for channel,array in [('Base',base),('Orm',orm)]:
    file=folder/('Texture_Type94Rubber'+channel+'FaceCoated.png');Image.fromarray(array).save(file);outputs[channel]=dict(file=str(file),sha256=hashlib.sha256(file.read_bytes()).hexdigest())
maskFile=folder/'Texture_Type94TyreFaceCoatingMask.png';Image.fromarray(np.rint(mask*255).astype(np.uint8)).save(maskFile)
report=dict(inputHashes={name:hashlib.sha256((folder/name).read_bytes()).hexdigest()for name in ['Texture_Type94RubberBase.png','Texture_Type94RubberOrm.png']},uvFaceInputSha256=hashlib.sha256(inputFile.read_bytes()).hexdigest(),outputs=outputs,mask=str(maskFile),coatedOwners=len(data['owners']),coatedFaces=data['coatedFaces'],affectedAtlasFraction=float(np.mean(mask>0)),aoBytesUnchanged=True,normalFileUnchangedSha256=hashlib.sha256((folder/'Texture_Type94RubberNormal.png').read_bytes()).hexdigest(),uncoatedAtlasPixelsExact=True,scope=data['scope'])
(root/'Acceptance/Data_TyreFaceBakeV66.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
