"""Refine the visible rear silhouette of the Type38 game model."""
import argparse
import json
from pathlib import Path

import numpy as np
from scipy.interpolate import PchipInterpolator

from Script_Type38ExteriorFinish import ReadGlb
from Script_Type38RearFinish import BakeRearFinish
from Script_Type38SeatFit import ColumnHeight, Part, PLATE, ShapeQuery, STOCK, Store, Unit
from Script_Type38Surface import Attribute, Ramp, RearOutline, SaveType38Assets


DISK = 'T38_440D2_IndependentVisibleRecess'
COLLAR = 'T38_435F2_IndependentTailNeckExterior'
COVER = ('T38_430B_IndependentLeftCoverSkin', 'T38_430B_RetainedRightCoverHalf')
NEARBY = {STOCK, PLATE, 'T38_435F2_VisualBackingRearEnd'}


def Track(doc, views, name):
    data = Part(doc, views, name)
    return data, [channel[data[2]] for channel in data[1]]


def Transform(doc, views, entry, warp):
    data, (old, normals, tangents) = entry
    points = warp(old.astype('d'))
    if np.array_equal(points,old):
        return old
    # Carry the authored shading basis through the same exterior deformation.
    stepSize = .000007
    steps = np.eye(3) * stepSize
    matrix = np.stack([(warp(old + axis) - warp(old - axis)) / (2 * stepSize) for axis in steps], axis=2)
    newNormal = Unit(np.linalg.solve(matrix.transpose(0, 2, 1), normals[:, :, None])[:, :, 0])
    tangent = np.einsum('nij,nj->ni', matrix, tangents[:, :3])
    tangent -= newNormal * np.sum(tangent * newNormal, axis=1, keepdims=True)
    Store(doc, views, data, (points, newNormal, np.column_stack((Unit(tangent), tangents[:, 3]))))
    return points


def CheckDiskClearance(doc, views, points, faces):
    # Sample the face interiors as well as the rim vertices at the stock seam.
    divisions = 4
    weights = [(i / divisions, j / divisions, (divisions - i - j) / divisions)
               for i in range(divisions + 1) for j in range(divisions + 1 - i)]
    samples = np.einsum('ij,fjk->fik', weights, points[faces]).reshape(-1, 3)
    checked = 0
    for name in (STOCK, PLATE):
        _, arrays, subset, targetFaces = Part(doc, views, name)
        scene, mesh = ShapeQuery(arrays[0][subset], targetFaces)
        gap = samples[:, 1] - ColumnHeight(scene, samples[:, 0], samples[:, 2], 1)
        finite = gap[np.isfinite(gap)]
        minimum = finite.min(initial=np.inf)
        assert finite.size and minimum > 0, (name, minimum)
        checked += finite.size
    return checked


def CompactRear(repo, doc, views):
    disk = Track(doc, views, DISK)
    collar = Track(doc, views, COLLAR)
    oldDisk, oldCollar = disk[1][0], collar[1][0]
    anchor = max(Track(doc, views, name)[1][0][:, 2].max() for name in COVER)
    dock = .59

    node = next(item for item in doc['nodes'] if item['extras']['SourceObject']==DISK)
    primitive, = doc['meshes'][node['mesh']]['primitives']
    uv = Attribute(doc,views,primitive['attributes']['TEXCOORD_0'],2)[disk[0][2]]
    middle = oldDisk[np.argmin(np.sum((uv-[.408,.48])**2,axis=1))]
    faceRadius = .5*np.ptp(oldDisk[:,1])
    lower,upper = oldDisk[:,2].min(),oldDisk[:,2].max()
    radial = np.linalg.norm(oldDisk[:,:2]-middle[:2],axis=1)
    side = (uv[:,0]>=.749)&(uv[:,0]<=.981)&(uv[:,1]<.870)
    rings = []
    for column in np.unique(uv[side,0]):
        chosen = side&(uv[:,0]==column)
        if np.count_nonzero(chosen)>20:
            rings.append((np.median(oldDisk[chosen,2]),np.median(radial[chosen])))
    assert len(rings) >= 8, 'The disk sidewall needs the original v30 UV rings'
    rows, radii = np.asarray(sorted(rings), dtype='d').T
    rim = rows[-1]
    assert np.all(np.diff(rows) > 0)

    # The sidewall follows a short drum profile with a rolled front edge.
    phase = (rows-rows[0])/(rim-rows[0])
    target = faceRadius*(.911+.070*Ramp(.02,.67,phase)-.006*Ramp(.89,1,phase))
    scaleCurve = PchipInterpolator(rows,target/radii)

    def ReshapeDisk(points):
        result = points.copy()
        around = points[:,:2]-middle[:2]
        angle = np.arctan2(around[:,1],around[:,0])
        broad = 1-.125*RearOutline(angle)*Ramp(.45,.91,np.linalg.norm(around,axis=1)/faceRadius)
        z = points[:,2]
        ratio = scaleCurve(np.clip(z,rows[0],rim))
        join = Ramp(rim-.00038,rim+.00035,z)
        result[:,:2] = middle[:2] + around*(1.045*broad*(ratio*(1-join)+join))[:,None]
        # Tuck the lower shoulder along the wood line while keeping the rear face round.
        underside = Ramp(.28,.91,-around[:,1]/faceRadius)
        shoulder = 1-Ramp(rows[0],rows[0]+.0051,z)
        result[:,1] += .00445*underside*shoulder
        face = np.maximum(0,z-rim)
        result[:,2] = anchor+dock*(z-anchor)-.14*face
        return result

    collarCenter = np.array([0,(oldCollar[:,1].min()+oldCollar[:,1].max())*.5])
    collarFront,collarRear = oldCollar[:,2].min(),oldCollar[:,2].max()

    def ReshapeCollar(points):
        result = points.copy()
        phase = (points[:,2]-collarFront)/(collarRear-collarFront)
        around = points[:,:2]-collarCenter
        swell = .22*Ramp(.12,.89,phase)
        underside = Ramp(.25,.84,-around[:,1]/faceRadius)
        result[:,:2] = collarCenter+around*(1+swell*(1-underside))[:,None]
        result[:,2] = anchor+dock*(points[:,2]-anchor)
        return result

    def EaseCoverLip(points):
        result = points.copy()
        amount = Ramp(anchor-.021,anchor-.00040,points[:,2])
        result[:,0] *= 1-.040*amount
        result[:,1] = collarCenter[1]+(points[:,1]-collarCenter[1])*(1-.067*amount)
        return result

    moved = Transform(doc, views, disk, ReshapeDisk)
    Transform(doc, views, collar, ReshapeCollar)
    for name in COVER:
        # Read the current buffer because both authored halves can share a render batch.
        Transform(doc, views, Track(doc, views, name), EaseCoverLip)
    visible = np.max(moved[:,2])-anchor
    oldVisible = upper-anchor
    profile = {
        'stackRatio':float(visible/oldVisible),
        'sidewallRatio':float(np.ptp(moved[:,2])/(upper-lower)),
        'faceWidthRatio':float(np.ptp(moved[:,1])/np.ptp(oldDisk[:,1])),
        'diskClearanceSamples': CheckDiskClearance(doc, views, moved, disk[0][3]),
    }
    assert .48<profile['stackRatio']<.64 and profile['faceWidthRatio']>1.025

    ao = BakeRearFinish(repo, doc, views, polishMetal=False, partsFilter=set(COVER) | NEARBY | {DISK, COLLAR})
    profile['contactImages'] = ao['images']
    doc['asset']['extras']['version'] = 'Type38_CompactTail31'
    print('Rear profile',profile,flush=True)
    return profile


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    doc,views,digest = ReadGlb((args.input/'Model_Type38_511.glb').read_bytes())
    manifest = json.loads((args.input/'Data_Type38_511.json').read_text(encoding='utf8'))
    lod = json.loads((args.input/'Data_Type38NpcLod.json').read_text(encoding='utf8'))
    assert digest == manifest['runtimeSha256'] == lod['sourceSha256']
    assert doc['asset']['extras']['version']=='Type38_ServiceWear30'
    manifest['compactTail'] = CompactRear(repo,doc,views)
    SaveType38Assets(args.output,doc,views,manifest,lod,author=manifest['renderMeshes']==manifest['parts'])
