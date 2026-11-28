"""Fit the visible stock and rear steel plate in the Type38 game asset."""
import argparse
import json
from pathlib import Path

import numpy as np
from embreex.mesh_construction import TriangleMesh
from embreex.rtcore_scene import EmbreeScene
from scipy.ndimage import distance_transform_edt, gaussian_filter, map_coordinates

from Script_Type38ExteriorFinish import ReadGlb
from Script_Type38Surface import Attribute, Ramp, SaveType38Assets, WoodSeat


STOCK = 'T38_460G_WoodGroove_VisualCandidate'
PLATE = 'Exterior_SeatedTang05'
AXES = ('POSITION', 'NORMAL', 'TANGENT')


def Unit(values):
    return values / np.maximum(np.linalg.norm(values, axis=-1, keepdims=True), 1e-10)


def Part(doc, views, name, *, allowTranslation=False):
    for node in doc['nodes']:
        extra = node['extras']
        span = next((row for row in extra.get('SourceRanges', []) if row['part'] == name), None)
        if extra.get('SourceObject') != name and span is None:
            continue
        assert 'matrix' not in node and 'rotation' not in node
        assert allowTranslation or 'translation' not in node
        primitive, = doc['meshes'][node['mesh']]['primitives']
        attributes = primitive['attributes']
        arrays = [Attribute(doc, views, attributes[key], width) for key,width in zip(AXES,(3,3,4))]
        faces = Attribute(doc, views, primitive['indices'], 3).astype('i')
        first = 0
        count = len(arrays[0])
        if span:
            first, count = span['vertexStart'], span['vertexCount']
            start = span['indexStart'] // 3
            faces = faces[start:start + span['indexCount'] // 3] - first
        subset = slice(first,first + count)
        assert faces.min() >= 0 and faces.max() < count
        return attributes, arrays, subset, faces
    raise KeyError(name)


def Store(doc, views, part, frames):
    attributes, arrays, subset, _ = part
    for key,base,edit in zip(AXES,arrays,frames,strict=True):
        values = base.copy()
        values[subset] = edit
        entry = doc['accessors'][attributes[key]]
        views[entry['bufferView']] = values.astype('<f4').tobytes()
        if 'min' in entry:
            entry['min'] = values.min(axis=0).tolist()
        if 'max' in entry:
            entry['max'] = values.max(axis=0).tolist()


def RestoreStock(points, normals, tangents):
    # Undo the previous localized depression before fitting the visible steel lip.
    depth = .0019
    surface = points.astype('d')
    for _ in range(24):
        surface[:, 1] = points[:, 1] + depth * WoodSeat(*surface.T)
    steps = np.eye(3) * .00002
    gradient = np.column_stack([(WoodSeat(*(surface+step).T)-WoodSeat(*(surface-step).T))/.00004
                                for step in steps])
    active = np.any(surface != points, axis=1) | np.any(gradient != 0, axis=1)
    basis = np.tile(np.eye(3), (active.sum(),1,1))
    basis[:, 1] -= depth * gradient[active]
    normal = normals.copy()
    normal[active] = Unit(np.einsum('nji,nj->ni', basis, normals[active]))
    tangent = tangents.copy()
    oldTangent = np.linalg.solve(basis, tangents[active, :3, None])[:, :, 0]
    oldTangent -= normal[active] * np.sum(oldTangent * normal[active], axis=1, keepdims=True)
    tangent[active, :3] = Unit(oldTangent)
    return surface.astype('f'), normal, tangent


def ShapeQuery(points, faces):
    scene = EmbreeScene()
    return scene, TriangleMesh(scene, points.astype('f'), faces)


def ColumnHeight(scene, x, length, direction):
    x,length = np.broadcast_arrays(x,length)
    origins = np.column_stack((x.ravel(), np.full(x.size, direction*.14), length.ravel())).astype('f')
    rays = np.broadcast_to([0,-direction,0], origins.shape).astype('f')
    hit = scene.run(origins, rays, dists=np.full(len(origins),.45,dtype='f'), output=1)
    values = np.where(hit['geomID']>=0, direction*(.14-hit['tfar']), np.nan)
    return values.reshape(x.shape)


def FairShoulderNormals(points, normals, tangents, faces, platePoints, plateFaces):
    # Fit a smooth top-surface normal field around the visible seam. This also
    # gives duplicate vertices on UV borders the same geometric shading frame.
    stock, stockMesh = ShapeQuery(points,faces)
    plate, plateMesh = ShapeQuery(platePoints,plateFaces)
    x = np.linspace(platePoints[:,0].min()-.006, platePoints[:,0].max()+.006, 181)
    z = np.linspace(platePoints[:,2].min()-.009, platePoints[:,2].max()+.009, 291)
    spacing = (z[1]-z[0],x[1]-x[0])
    height = ColumnHeight(stock,x[None,:],z[:,None],1)
    plateFootprint = np.isfinite(ColumnHeight(plate,x[None,:],z[:,None],1))
    valid = np.isfinite(height)
    _,nearest = distance_transform_edt(~valid, sampling=spacing, return_indices=True)
    height = height[nearest[0],nearest[1]]
    fitted = gaussian_filter(height, (.00135/spacing[0],.00100/spacing[1]))
    slopeZ,slopeX = np.gradient(fitted,*spacing)
    distance = distance_transform_edt(~plateFootprint, sampling=spacing)
    uv = np.vstack(((points[:,2]-z[0])/spacing[0],(points[:,0]-x[0])/spacing[1]))
    top = map_coordinates(height,uv,order=1)
    edge = map_coordinates(distance,uv,order=1,cval=.010)
    strength = (1-Ramp(.00115,.00430,edge))*Ramp(.14,.54,normals[:,1])
    strength *= 1-Ramp(.00028,.00135,np.abs(top-points[:,1]))
    affected = strength > .001
    normal = normals.copy()
    tangent = tangents.copy()
    if affected.any():
        normalsFit = Unit(np.column_stack((
            -map_coordinates(slopeX,uv[:,affected],order=1),
            np.ones(affected.sum()),
            -map_coordinates(slopeZ,uv[:,affected],order=1),
        )))
        share = strength[affected,None]
        normal[affected] = Unit((1-share)*normals[affected]+share*normalsFit)
        tangent[affected,:3] -= normal[affected]*np.sum(tangent[affected,:3]*normal[affected],axis=1,keepdims=True)
        tangent[affected,:3] = Unit(tangent[affected,:3])
    return points,normal,tangent


def RefitPlate(points, normals, tangents, faces, wood, woodFaces):
    plate, plateMesh = ShapeQuery(points,faces)
    stock, stockMesh = ShapeQuery(wood,woodFaces)
    x = np.linspace(points[:,0].min()-.0006, points[:,0].max()+.0006, 440)
    start, end = points[:,2].min(), points[:,2].max()
    length = np.linspace(start+.00025, end-.00025, 232)
    y = ColumnHeight(stock,x[None,:],length[:,None],1)
    upper = ColumnHeight(plate,x[None,:],length[:,None],1)
    lower = ColumnHeight(plate,x[None,:],length[:,None],-1)
    valid = np.isfinite(y) & np.isfinite(upper)
    border = []
    for row in np.flatnonzero(valid.any(axis=1)):
        hit = np.flatnonzero(valid[row])
        if hit[-1]-hit[0]>14:
            left, right = hit[0]+6, hit[-1]-6
            border.append((row,left,right))
    rows,left,right = np.asarray(border).T
    phase = (length-start)/(end-start)
    floor = np.maximum(lower[rows,left]-y[rows,left], lower[rows,right]-y[rows,right])
    bodyDrop = np.median(floor[(phase[rows]>.24)&(phase[rows]<.93)])+.00012
    heelDrop = max(bodyDrop, np.quantile(floor[phase[rows]<.105], .94)+.00012)

    def HeightOffset(z):
        progress = (z-start)/(end-start)
        return bodyDrop+(heelDrop-bodyDrop)*(1-Ramp(.025,.165,progress))

    path = points[:,2]
    sectionX = (points[:,0] - x.mean())*.995 + x.mean()
    sectionZ = np.clip(path, start+.00010, end-.00010)
    outer = ColumnHeight(plate,sectionX,sectionZ,1)
    inner = ColumnHeight(plate,sectionX,sectionZ,-1)
    both = np.isfinite(outer) & np.isfinite(inner)
    layer = np.zeros(len(points),dtype='f')
    layer[both] = Ramp(.18,.90,(outer[both]-points[both,1])/np.maximum(outer[both]-inner[both], .00025))
    drop = HeightOffset(path) * (.58 + .42 * layer)
    moved = points.copy()
    moved[:,1] -= drop

    # Transfer the change in geometric face normal onto the authored shading.
    def Facing(vertices):
        triangle = vertices[faces]
        return Unit(np.cross(triangle[:,1]-triangle[:,0],triangle[:,2]-triangle[:,0]))

    before,after = Facing(points),Facing(moved)
    _,weld = np.unique(np.round(points,7),axis=0,return_inverse=True)
    accumulator = np.zeros((weld.max()+1,3),dtype='f')
    counts = np.bincount(weld[faces.ravel()], minlength=len(accumulator))
    for corner in faces.T:
        np.add.at(accumulator,weld[corner],after-before)
    correction = accumulator[weld] / np.maximum(counts[weld,None],1)
    fixedNormals = Unit(normals+correction)
    fixedTangents = tangents.copy()
    fixedTangents[:,:3] -= fixedNormals*np.sum(tangents[:,:3]*fixedNormals,axis=1,keepdims=True)
    fixedTangents[:,:3] = Unit(fixedTangents[:,:3])

    fitted, fittedMesh = ShapeQuery(moved,faces)
    floorY = ColumnHeight(fitted,x[None,:],length[:,None],-1)
    finishY = ColumnHeight(fitted,x[None,:],length[:,None],1)
    visibleEdge = np.concatenate((floorY[rows,left]-y[rows,left],floorY[rows,right]-y[rows,right]))
    topClearance = finishY[valid]-y[valid]
    evidence = {'edgeSamples':len(visibleEdge), 'seatedEdgeSamples':int(np.count_nonzero(visibleEdge<=0)),
                'visibleFaceSamples':len(topClearance), 'coveredFaceSamples':int(np.count_nonzero(topClearance<0))}
    assert evidence['seatedEdgeSamples'] > .90*evidence['edgeSamples'], evidence
    assert evidence['coveredFaceSamples'] < .002*evidence['visibleFaceSamples'], evidence
    return (moved,fixedNormals,fixedTangents), evidence


def FitStockSeat(repo, doc, views):
    from Script_Type38RearFinish import BakeRearFinish

    woodPart = Part(doc,views,STOCK)
    metalPart = Part(doc,views,PLATE)
    wood = [item[woodPart[2]] for item in woodPart[1]]
    steel = [item[metalPart[2]] for item in metalPart[1]]
    restored = RestoreStock(*wood)
    restored = FairShoulderNormals(*restored,woodPart[3],steel[0],metalPart[3])
    seated, evidence = RefitPlate(*steel,metalPart[3],restored[0],woodPart[3])
    Store(doc,views,woodPart,restored)
    Store(doc,views,metalPart,seated)
    ao = BakeRearFinish(repo, doc, views, polishMetal=False, partsFilter={STOCK,PLATE})
    evidence['aoImages'] = ao['images']
    doc['asset']['extras']['version'] = 'Type38_SeatedPlate29'
    print('Seat fit',evidence,flush=True)
    return evidence


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    doc, views, digest = ReadGlb((args.input/'Model_Type38_511.glb').read_bytes())
    manifest = json.loads((args.input/'Data_Type38_511.json').read_text(encoding='utf8'))
    lod = json.loads((args.input/'Data_Type38NpcLod.json').read_text(encoding='utf8'))
    assert digest == manifest['runtimeSha256'] == lod['sourceSha256']
    assert doc['asset']['extras']['version']=='Type38_RearContact28'
    manifest['stockSeat'] = FitStockSeat(repo, doc, views)
    SaveType38Assets(args.output, doc, views, manifest, lod, author=manifest['renderMeshes'] == manifest['parts'])
