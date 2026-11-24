"""Shape the visible band outlines in the existing UV and tangent frames."""
import numpy as np


def FollowFrontBandOutline(streams, bandBounds):
    """Carry the existing outer band curve into the end of the visible timber."""
    low, high = bandBounds
    height, width = high[1]-low[1], high[2]-low[2]
    points = streams['POSITION'].astype(np.float64)
    selected = points[:,2] < high[2]
    if not np.any(selected):
        return streams
    surface = points[selected]
    h = 2.*(surface[:,1]-low[1])/height-1.
    t = np.clip((high[2]-surface[:,2])/width, 0., 1.)
    blend = t*t*(3.-2.*t)
    bow = .14*width-.08*(surface[:,2]-(low[2]+high[2])*.5)
    points[selected,2] += blend*h*h*bow
    shaped = {**streams, 'POSITION':points.astype('<f4')}
    if 'NORMAL' not in streams:
        return shaped
    slope = 4.*blend*h*bow/height
    scale = 1.-.08*blend*h*h-6.*t*(1.-t)*h*h*bow/width
    assert np.all(scale > 0.)
    normals = streams['NORMAL'].copy()
    n = normals[selected].astype(np.float64)
    n[:,2] /= scale
    n[:,1] -= slope*n[:,2]
    n /= np.linalg.norm(n,axis=1)[:,None]
    normals[selected] = n
    shaped['NORMAL'] = normals
    if 'TANGENT' in streams:
        tangents = streams['TANGENT'].copy()
        v = tangents[selected,:3].astype(np.float64)
        v[:,2] = slope*v[:,1]+scale*v[:,2]
        v -= np.sum(v*n,axis=1)[:,None]*n
        tangents[selected,:3] = v/np.linalg.norm(v,axis=1)[:,None]
        shaped['TANGENT'] = tangents
    return shaped


def ShapeStockEnd(name, streams, bounds):
    """Round the assembled rear outline using a common, fading lattice bend."""
    if not name.startswith(('MainWood_', 'ButtCap_')):
        return streams
    low, high = bounds
    width, height, depth = high-low
    points = streams['POSITION'].astype(np.float64)
    t = np.clip((-points[:,2]+low[2])/(2.77*depth), 0., 1.)
    selected = t < 1.
    t = t[selected]
    source = points[selected]
    side = (2.*source[:,0]-high[0]-low[0])/width
    level = np.clip((source[:,1]-low[1])/height, 0., 1.)
    falloff = 1.-t*t*(3.-2.*t)
    bow = .40*(.46*side**2+.38*side**6)-.92*level*(1.-level)
    points[selected,2] -= width*bow*falloff
    result = {**streams, 'POSITION':points.astype('<f4')}
    if 'NORMAL' not in streams:
        return result
    dx = -.80*(.92*side+2.28*side**5)*falloff
    dy = .92*width/height*(1.-2.*level)*falloff
    dy *= (source[:,1]>=low[1]) & (source[:,1]<=high[1])
    dz = 1.-width*bow*6.*t*(1.-t)/(2.77*depth)
    assert dz.min() > .6
    normals = streams['NORMAL'].copy()
    n = normals[selected].astype(np.float64)
    n[:,2] /= dz
    n[:,0] -= dx*n[:,2]
    n[:,1] -= dy*n[:,2]
    n /= np.linalg.norm(n,axis=1)[:,None]
    normals[selected] = n
    result['NORMAL'] = normals
    if 'TANGENT' in streams:
        tangents = streams['TANGENT'].copy()
        direction = tangents[selected,:3].astype(np.float64)
        direction[:,2] = dx*direction[:,0]+dy*direction[:,1]+dz*direction[:,2]
        direction -= np.sum(direction*n,axis=1)[:,None]*n
        tangents[selected,:3] = direction/np.linalg.norm(direction,axis=1)[:,None]
        result['TANGENT'] = tangents
    return result


def ShapeBandProfile(name, streams):
    front = name == 'FrontBand_ContinuousEnvelopeContact'
    if not front and name != 'RearBand_ControlledCrown':
        return streams
    points = streams['POSITION'].astype(np.float64)
    height = np.ptp(points[:, 1])
    width = np.ptp(points[:, 2])
    h = 2 * (points[:, 1] - points[:, 1].min()) / height - 1
    if front:
        # Bow the two outlines together. The middle retains the full outer width.
        anchor = (points[:, 2].min() + points[:, 2].max()) / 2
        scale = 1 - .08 * h**2
        offset = width * .14 * h**2
        slope = 4 * h / height * (.14 * width - .08 * (points[:, 2] - anchor))
    else:
        # Centre the narrowed band over the timber joint on both sides.
        anchor = (points[:, 2].min() + points[:, 2].max()) / 2
        scale, offset, slope = .85, 0., 0.
    points[:, 2] = anchor + (points[:, 2] - anchor) * scale + offset
    shaped = {**streams, 'POSITION': points.astype('<f4')}
    if 'NORMAL' not in streams:
        return shaped
    normal = streams['NORMAL'].astype(np.float64)
    normal[:, 2] /= scale
    normal[:, 1] -= slope * normal[:, 2]
    normal /= np.linalg.norm(normal, axis=1)[:, None]
    shaped['NORMAL'] = normal.astype('<f4')
    if 'TANGENT' not in streams:
        return shaped
    tangent = streams['TANGENT'].copy()
    direction = tangent[:, :3].astype(np.float64)
    direction[:, 2] = slope * direction[:, 1] + scale * direction[:, 2]
    direction -= np.sum(direction * normal, axis=1)[:, None] * normal
    tangent[:, :3] = direction / np.linalg.norm(direction, axis=1)[:, None]
    return {**shaped, 'TANGENT': tangent}
