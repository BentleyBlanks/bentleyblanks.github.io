"""Record EXIF constraints without treating edited photographs as calibration."""
from pathlib import Path
import hashlib,json,numpy as np
from PIL import Image,ExifTags
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'ReferenceV97'
cameras=json.loads((base/'ReferenceV93/Inputs/Data_ReferenceCamerasV93.json').read_text());rows=[]
for name in ['2017','2014']:
    record=cameras['images'][name];file=Path(record['file']);assert hashlib.sha256(file.read_bytes()).hexdigest()==record['sha256'];image=Image.open(file);exif=image.getexif();sub=exif.get_ifd(34665)
    wanted=['Make','Model','Software','ImageWidth','ImageLength','ExifImageWidth','ExifImageHeight','FocalLength','FocalLengthIn35mmFilm','FocalPlaneXResolution','FocalPlaneYResolution','FocalPlaneResolutionUnit','DigitalZoomRatio']
    metadata={ExifTags.TAGS.get(key,str(key)):str(value)for group in [exif,sub]for key,value in group.items()if ExifTags.TAGS.get(key,str(key))in wanted}
    row=dict(camera=name,sourceFile=str(file),sha256=record['sha256'],outputSize=list(image.size),exif=metadata,retainedIntrinsicMatrix=cameras['cameras'][name]['k'],sourceEdited=True,metadataDoesNotCalibrateLens=True)
    if name=='2017':
        width,height=int(exif[256]),int(exif[257]);equivalent=float(sub[41989]);nominalOriginalFocalPixels=width*equivalent/36;scale=cameras['cameras'][name]['k'][0][0]/nominalOriginalFocalPixels;cx,cy=np.array(cameras['cameras'][name]['k'])[:2,2];w,h=image.size
        left=width/2-cx/scale;top=height/2-cy/scale;cropWidth=w/scale;cropHeight=h/scale
        row['nominalCentredCropHypothesis']=dict(originalCanvas=[width,height],reported35mmEquivalent=equivalent,nominalOriginalFocalPixels=nominalOriginalFocalPixels,retainedUniformScale=scale,impliedCropOriginalPixels=[float(left),float(top),float(cropWidth),float(cropHeight)],outsideBottomPixels=float(max(0,top+cropHeight-height)),insideCanvas=bool(left>=0 and top>=0 and left+cropWidth<=width and top+cropHeight<=height),assumptions=['Reported equivalent treated nominally as horizontal35mm focal','Optical centre assumed to be original canvas midpoint','Uniform scale and axis-aligned crop only'],interpretation='This narrow nominal hypothesis is inconsistent; rounded EXIF, optical-centre offset, rotation or other editing remain possible. It does not prove lens warp or justify changing geometry.')
    if name=='2014'and sub.get(41488)==3:
        nominal=float(sub[37386])*float(sub[41486])/10;row['nominalFocalPlaneEstimate']=dict(originalFocalPixels=nominal,retainedFocalPixels=cameras['cameras'][name]['k'][0][0],impliedUniformScale=cameras['cameras'][name]['k'][0][0]/nominal,originalRawCanvasEstablished=False)
    rows.append(row)
report=dict(schema='Type94LensMetadataAuditV1',rows=rows,cameraAdopted=False,geometryChanged=False,physicalCalibrationAccepted=False,wholeReferenceAccepted=False,nextAction='Use verified fixed-body correspondences and source crop/pose uncertainty together; do not interpret casing or tyre optical mismatch as a measured axle displacement')
(root/'Acceptance/Data_LensMetadataV97.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
