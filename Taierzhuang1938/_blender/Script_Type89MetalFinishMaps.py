"""Preserve the released AO, mask and special-purpose texels after reprojection."""

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


def Footprint(shapes, size):
    mask = np.zeros((size,size),dtype=np.uint8)
    for triangles in shapes.values():
        coords = np.rint(np.asarray(triangles)*size*16-8).astype(np.int32)
        for points in coords:
            cv2.fillConvexPoly(mask,points,1,shift=4)
    return cv2.dilate(mask,np.ones((5,5),dtype=np.uint8)).astype(bool)


def Load(file):
    with Image.open(file) as image:
        return np.asarray(image.convert('RGBA')).copy()


def Main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    output=parser.parse_args().output
    snapshot=output/'Snapshot'
    dest=output/'Game/Maps'
    dest.mkdir(parents=True,exist_ok=True)
    footprint=Footprint(json.loads((snapshot/'Data_ProtectedFootprints.json').read_text(encoding='utf-8')),4096)
    rows=[]
    for image in sorted(snapshot.glob('Texture_Type89Game*.png')):
        baseline=Load(image)
        projection=Load(output/'Bake'/image.name)
        assert baseline.shape==projection.shape
        protection=footprint if 'Body' in image.name else np.zeros(baseline.shape[:2],dtype=bool)
        if 'Base' in image.name:
            # The previous graph's valid RGB is retained where a bake ray
            # hits the low black-fallback threshold within a texture seam.
            protection=protection | np.all(projection[:,:,:3]<=14,axis=2)
        projection[protection]=baseline[protection]
        projection[:,:,3]=baseline[:,:,3]
        if 'Orm' in image.name:
            projection[:,:,0]=baseline[:,:,0]
        Image.fromarray(projection,'RGBA').save(dest/image.name)
        rows.append({'image':image.name,'protectedTexels':int(np.count_nonzero(protection)),
                     'unchangedAO':'Orm' in image.name,'alphaCopied':True})
    assert len(rows)==9
    (output/'Data_MetalMapOverlay.json').write_text(json.dumps(rows,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':
    Main()
