"""Repair opposing corner frames without changing any oriented surface or UV triangle."""
import numpy as np


def SmoothStockCrest(name, attributes, indices):
    """Reconstruct the reflection direction across the stock crown from its surface."""
    if name != 'MainWood_ContinuousLowerShoulder':
        return attributes
    positions = attributes['POSITION'].astype(np.float64)
    normals = attributes['NORMAL'].astype(np.float64)
    across, height, along = positions[:, 0], positions[:, 1], -positions[:, 2]
    planar = np.column_stack((along, across))
    minimum = np.array([-.257, -.022])
    spacing = np.array([.0008, .00038])
    shape = (400, 118)
    field = np.full(shape, -np.inf)
    faces = indices.reshape(-1, 3)
    inRange = (along > -.26) & (along < .067) & (normals[:, 1] > .03)
    for corners in faces[np.any(inRange[faces], axis=1)]:
        pts = (planar[corners] - minimum) / spacing
        low = np.maximum(0, np.ceil(pts.min(axis=0)).astype(int))
        high = np.minimum(np.array(shape)-1, np.floor(pts.max(axis=0)).astype(int))
        if np.any(high < low):
            continue
        first, second = pts[1] - pts[0], pts[2] - pts[0]
        det = first[0]*second[1] - first[1]*second[0]
        if abs(det) < 1e-9:
            continue
        i, j = np.ogrid[low[0]:high[0]+1, low[1]:high[1]+1]
        di, dj = i-pts[0, 0], j-pts[0, 1]
        wb = (di*second[1]-dj*second[0])/det
        wc = (first[0]*dj-first[1]*di)/det
        ok = (wb >= -1e-7) & (wc >= -1e-7) & (wb+wc <= 1.0000001)
        values = height[corners[0]] + wb*(height[corners[1]]-height[corners[0]]) + wc*(height[corners[2]]-height[corners[0]])
        patch = field[low[0]:high[0]+1, low[1]:high[1]+1]
        np.maximum(patch, np.where(ok, values, -np.inf), out=patch)

    valid = np.isfinite(field)
    support = valid.astype(np.float64)
    field = np.where(valid, field, 0.)
    for axis, sigma in enumerate((13., 2.8)):
        x = np.arange(-int(3*sigma), int(3*sigma)+1)
        kernel = np.exp(-.5*(x/sigma)**2)
        kernel /= kernel.sum()
        field = np.apply_along_axis(np.convolve, axis, field, kernel, 'same')
        support = np.apply_along_axis(np.convolve, axis, support, kernel, 'same')
    field /= np.maximum(support, 1e-8)
    longSlope, crossSlope = np.gradient(field, *spacing)
    grid = np.clip((planar-minimum)/spacing, 0, np.array(shape)-1.00001)
    i, j = grid.astype(int).T
    u, v = (grid-grid.astype(int)).T

    def Sample(array):
        return ((1-u)*((1-v)*array[i,j]+v*array[i,j+1])
                +u*((1-v)*array[i+1,j]+v*array[i+1,j+1]))

    def Ramp(lo, hi, values):
        t = np.clip((values-lo)/(hi-lo), 0., 1.)
        return t*t*(3.-2.*t)

    fitted = np.column_stack((-Sample(crossSlope), np.ones(len(grid)), Sample(longSlope)))
    fitted /= np.linalg.norm(fitted, axis=1)[:, None]
    blend = Ramp(-.239, -.202, along)*(1.-Ramp(.025, .056, along))
    blend *= Ramp(.17, .67, normals[:,1])*Ramp(.70,.96,Sample(support))
    blend *= 1.-Ramp(.0010,.0038,abs(height-Sample(field)))
    blend *= Ramp(.54,.82,np.sum(normals*fitted,axis=1))
    change = blend > 1e-7
    mixed = normals[change]*(1-blend[change,None])+fitted[change]*blend[change,None]
    mixed /= np.linalg.norm(mixed,axis=1)[:,None]
    repaired = attributes['NORMAL'].copy()
    repaired[change] = mixed
    result = {**attributes, 'NORMAL':repaired}
    if 'TANGENT' in attributes:
        tangents = attributes['TANGENT'].copy()
        xyz = tangents[change,:3].astype(np.float64)
        xyz -= np.sum(xyz*mixed,axis=1)[:,None]*mixed
        xyz /= np.linalg.norm(xyz,axis=1)[:,None]
        tangents[change,:3] = xyz
        result['TANGENT'] = tangents
    return result


def RepairTimberFrames(name, attributes, indices):
    flatIndices = indices.reshape(-1)
    normals = attributes['NORMAL']
    if not name.startswith(('MainWood_', 'UpperWood_')):
        return attributes, indices, 0
    faces = flatIndices.reshape(-1, 3)
    corners = attributes['POSITION'][faces].astype(np.float64)
    cross = np.cross(corners[:, 1]-corners[:, 0], corners[:, 2]-corners[:, 0])
    lengths = np.linalg.norm(cross, axis=1)
    planes = cross/np.maximum(lengths[:, None], 1e-15)
    dots = np.einsum('fvc,fc->fv', normals[faces], planes)
    mixed = (lengths>1e-12) & (dots.min(axis=1)<-.65) & (dots.max(axis=1)>.65)
    flip = mixed[:, None] & (dots<0)
    if not flip.any():
        return attributes, indices, 0
    reverse = np.unique(faces[flip])
    keep = np.isin(reverse, np.unique(faces[~flip]))
    split = reverse[keep]
    result = {semantic: np.concatenate((values, values[split])) for semantic, values in attributes.items()}
    lookup = np.arange(len(normals))
    lookup[split] = len(normals)+np.arange(len(split))
    fixedIndices = faces.copy()
    fixedIndices[flip] = lookup[faces[flip]]
    affected = lookup[reverse]
    result['NORMAL'][affected] *= -1
    if 'TANGENT' in result:
        result['TANGENT'][affected, 3] *= -1
    assert fixedIndices.max() < len(result['NORMAL'])
    return result, fixedIndices.reshape(indices.shape), int(mixed.sum())
