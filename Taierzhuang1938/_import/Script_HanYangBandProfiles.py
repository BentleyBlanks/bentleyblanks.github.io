"""Shape the visible band outlines in the existing UV and tangent frames."""
import numpy as np


def ShapeFrontBandFace(streams, bounds):
    """Fit the visible end profile and fade into the surrounding cosmetic mesh."""
    low, high = bounds
    height = high[1] - low[1]
    fade = high[2] - low[2]
    points = streams['POSITION'].astype(np.float64)
    endWeight = np.clip((high[2] + fade - points[:, 2]) / fade, 0., 1.)
    blend = endWeight * endWeight * (3. - 2. * endWeight)
    blendSlope = -6. * endWeight * (1. - endWeight) / fade
    level = (points[:, 1] - low[1]) / height
    heel = np.clip(level / .25, 0., 1.)
    flat = 1. - heel * heel * (3. - 2. * heel)
    drop = .68 * level * flat
    widthScale = 1. - .163 * blend
    heightScale = 1. - .68 * blend * (flat - level * 24. * heel * (1. - heel))
    widthSlope = -.163 * points[:, 0] * blendSlope
    heightSlope = -height * drop * blendSlope
    points[:, 0] *= widthScale
    points[:, 1] -= height * drop * blend
    result = {**streams, 'POSITION': points.astype('<f4')}
    if 'NORMAL' not in streams:
        return result
    normal = streams['NORMAL'].astype(np.float64)
    normal[:, 0] /= widthScale
    normal[:, 1] /= heightScale
    normal[:, 2] -= widthSlope * normal[:, 0] + heightSlope * normal[:, 1]
    normal /= np.linalg.norm(normal, axis=1)[:, None]
    result['NORMAL'] = normal.astype('<f4')
    if 'TANGENT' in streams:
        tangent = streams['TANGENT'].copy()
        direction = tangent[:, :3].astype(np.float64)
        direction[:, 0] = widthScale * direction[:, 0] + widthSlope * direction[:, 2]
        direction[:, 1] = heightScale * direction[:, 1] + heightSlope * direction[:, 2]
        direction -= np.sum(direction * normal, axis=1)[:, None] * normal
        tangent[:, :3] = direction / np.linalg.norm(direction, axis=1)[:, None]
        result['TANGENT'] = tangent
    return result


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
        return ShapeFrontBandFace(shaped, bandBounds)
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
    return ShapeFrontBandFace(shaped, bandBounds)


def InsertAxialSections(streams, indices, sections):
    """Split crossing triangles without moving UVs or other vertex fields."""
    values = {key: list(array) for key, array in streams.items()}
    faces = indices.reshape(-1, 3).tolist()
    for z in sections:
        cuts, clipped = {}, []
        for face in faces:
            depths = [values['POSITION'][index][2] for index in face]
            if not min(depths) < z < max(depths):
                clipped.append(face)
                continue
            sides = [[], []]
            for first, second in zip(face, face[1:] + face[:1]):
                a, b = values['POSITION'][first][2], values['POSITION'][second][2]
                if a <= z:
                    sides[0].append(first)
                if a >= z:
                    sides[1].append(first)
                if not min(a, b) < z < max(a, b):
                    continue
                edge = tuple(sorted((first, second)))
                if edge not in cuts:
                    cuts[edge] = len(values['POSITION'])
                    t = (z - a) / (b - a)
                    for array in values.values():
                        array.append(array[first] + (array[second] - array[first]) * t)
                for side in sides:
                    side.append(cuts[edge])
            for side in sides:
                clipped.extend([side[0], side[i], side[i+1]] for i in range(1, len(side)-1))
        faces = clipped
    return ({key: np.asarray(array, dtype=streams[key].dtype) for key, array in values.items()},
            np.asarray(faces, dtype=indices.dtype).reshape(-1, 1))


def SmoothWeight(t):
    t = np.clip(t, 0., 1.)
    return t*t*(3.-2.*t), 6.*t*(1.-t)


def TransformSurfaceFrames(streams, jacobian):
    normals = np.linalg.solve(jacobian.transpose(0,2,1), streams['NORMAL'][:, :, None])[:, :, 0]
    normals /= np.linalg.norm(normals, axis=1)[:, None]
    streams['NORMAL'] = normals.astype('<f4')
    if 'TANGENT' in streams:
        tangent = streams['TANGENT'].copy()
        direction = np.einsum('ijk,ik->ij', jacobian, tangent[:, :3])
        direction -= (direction*normals).sum(axis=1)[:, None]*normals
        tangent[:, :3] = direction / np.linalg.norm(direction, axis=1)[:, None]
        tangent[:, 3] = np.where(tangent[:, 3] < 0, -1., 1.)
        streams['TANGENT'] = tangent


def SeatFrontBandTimber(streams, indices, bounds):
    """Seat the lower oval below the steel over the full width of the band."""
    low, high = bounds
    streams = FollowFrontBandOutline(streams, bounds)
    cutPlanes = (low[2]+.004, low[2]+.010, high[2]+.001, high[2]+.015)
    streams, indices = InsertAxialSections(streams, indices, cutPlanes)
    points = streams['POSITION'].astype(np.float64)
    x, y, z = points.T.copy()
    entry, entrySlope = SmoothWeight((z-low[2])/.012)
    exit, exitSlope = SmoothWeight((high[2]+.018-z)/.016)
    lower, lowerSlope = SmoothWeight((.033-y)/.009)
    side, sideSlope = SmoothWeight((abs(x)-.005)/.006)
    flank = .18+.82*side
    scale = 1.-.083*entry*exit*lower*flank
    dx = -.083*entry*exit*lower*.82*sideSlope*np.sign(x)/.006
    dy = .083*entry*exit*lowerSlope*flank/.009
    dz = -.083*lower*flank*(entrySlope*exit/.012-entry*exitSlope/.016)
    height = y-.027
    jacobian = np.broadcast_to(np.eye(3), (len(points), 3, 3)).copy()
    jacobian[:, 0, 0] = scale+x*dx
    jacobian[:, 0, 1] = x*dy
    jacobian[:, 0, 2] = x*dz
    jacobian[:, 1, 0] = height*dx
    jacobian[:, 1, 1] = scale+height*dy
    jacobian[:, 1, 2] = height*dz
    points[:, 0], points[:, 1] = x*scale, .027+height*scale
    streams['POSITION'] = points.astype('<f4')
    TransformSurfaceFrames(streams, jacobian)
    return streams, indices


def SeatRearBandTimber(name, streams):
    """Carry the ends of the three cosmetic wood shells under the metal lips."""
    settings = {'FrontWood_ContinuousOval': (-.59150, .00205, 1., .022),
                'MainWood_ContinuousLowerShoulder': (-.57813, .00300, -1., .030),
                'UpperWood_Rebuilt_ShortRearShoulder_ContinuousFront': (-.57900, .00205, -1., .045)}
    if name not in settings:
        return streams
    end, reach, direction, inset = settings[name]
    points = streams['POSITION'].astype(np.float64)
    x, _, z = points.T.copy()
    fade = .010
    amount, slope = SmoothWeight(1. + direction*(z-end)/fade)
    slope *= direction/fade
    scale = 1.-inset*amount
    points[:, 0] = x*scale
    points[:, 2] = z+direction*reach*amount
    jacobian = np.broadcast_to(np.eye(3), (len(points), 3, 3)).copy()
    jacobian[:, 0, 0] = scale
    jacobian[:, 0, 2] = -inset*x*slope
    jacobian[:, 2, 2] = 1.+direction*reach*slope
    # Preserve the original vertex streams outside the joint.
    mask = amount > 0.
    seated = {**streams, 'POSITION': points.astype('<f4')}
    for semantic in ('NORMAL', 'TANGENT'):
        if semantic in streams:
            seated[semantic] = streams[semantic].copy()
    frames = {key: array[mask] for key, array in seated.items() if key in ('NORMAL', 'TANGENT')}
    TransformSurfaceFrames(frames, jacobian[mask])
    for key, array in frames.items():
        seated[key][mask] = array
    return seated


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
    insetSlope = 1.
    if name.startswith('MainWood_'):
        # Seat the cosmetic wood end under the backplate's visible surface.
        inset = np.clip((points[selected,2] - low[2] + .41*depth) / (.84*depth), 0., 1.)
        points[selected,2] -= .13*depth * inset**2 * (3.-2.*inset)
        insetSlope -= (.13/.84) * 6.*inset*(1.-inset)
    result = {**streams, 'POSITION':points.astype('<f4')}
    if 'NORMAL' not in streams:
        return result
    dx = -.80*(.92*side+2.28*side**5)*falloff
    dy = .92*width/height*(1.-2.*level)*falloff
    dy *= (source[:,1]>=low[1]) & (source[:,1]<=high[1])
    dz = 1.-width*bow*6.*t*(1.-t)/(2.77*depth)
    dx *= insetSlope
    dy *= insetSlope
    dz *= insetSlope
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
    bounds = points.min(axis=0), points.max(axis=0)
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
    if 'NORMAL' in streams:
        normal = streams['NORMAL'].astype(np.float64)
        normal[:, 2] /= scale
        normal[:, 1] -= slope * normal[:, 2]
        normal /= np.linalg.norm(normal, axis=1)[:, None]
        shaped['NORMAL'] = normal.astype('<f4')
    if 'TANGENT' in streams:
        tangent = streams['TANGENT'].copy()
        direction = tangent[:, :3].astype(np.float64)
        direction[:, 2] = slope * direction[:, 1] + scale * direction[:, 2]
        direction -= np.sum(direction * normal, axis=1)[:, None] * normal
        tangent[:, :3] = direction / np.linalg.norm(direction, axis=1)[:, None]
        shaped['TANGENT'] = tangent
    return ShapeFrontBandFace(shaped, bounds) if front else shaped


def SampleBandSection(triangles, depth, center, rays):
    """Find the two surfaces of the band along rays in an axial section."""
    following = np.roll(triangles, -1, axis=1)
    depths = triangles[:, :, 2]
    crosses = (depths > depth) != (following[:, :, 2] > depth)
    active = crosses.sum(axis=1) == 2
    start = triangles[active][crosses[active]]
    end = following[active][crosses[active]]
    fraction = (depth - start[:, 2]) / (end[:, 2] - start[:, 2])
    points = start[:, :2] + fraction[:, None] * (end - start)[:, :2]
    segments = points.reshape(-1, 2, 2) - center
    corner = segments[:, 0]
    edge = segments[:, 1] - corner
    perpendicular = np.column_stack((rays[:, 1], -rays[:, 0]))
    denominator = edge @ perpendicular.T
    alongEdge = np.divide(-(corner @ perpendicular.T), denominator,
                          out=np.full_like(denominator, np.nan), where=abs(denominator) > 1e-11)
    hits = corner[:, None, :] + alongEdge[:, :, None] * edge[:, None, :]
    radii = np.einsum('sri,ri->sr', hits, rays)
    valid = (alongEdge >= -1e-7) & (alongEdge <= 1.+1e-7) & (radii > 0.)
    inner = np.min(np.where(valid, radii, np.inf), axis=0)
    outer = np.max(np.where(valid, radii, -np.inf), axis=0)
    assert np.isfinite(inner).all() and np.all(outer >= inner), depth
    return inner, outer


def FormRearBandRib(streams, indices):
    """Loft the existing band contour and add the raised exterior rib."""
    positions = streams['POSITION'].astype(np.float64)
    low, high = positions.min(axis=0), positions.max(axis=0)
    indexType = indices.dtype
    triangles = positions[indices.reshape(-1, 3)]
    angle = np.arange(64) * (2.*np.pi/64)
    rays = np.column_stack((np.cos(angle), np.sin(angle)))
    center = (low[:2] + high[:2]) / 2.
    outside = (.004, .064, .25, .38, .51, .63, .75, .936, .996)
    inside = (.996, .83, .17, .004)
    grid = []
    for surface, fractions in ((1, outside), (0, inside)):
        for fraction in fractions:
            depth = low[2] + fraction * (high[2] - low[2])
            sampled = SampleBandSection(triangles, depth, center, rays)[surface]
            xy = center + sampled[:, None] * rays
            if surface:
                level = (xy[:, 1] - low[1]) / (high[1] - low[1])
                rise, _ = SmoothWeight((level - .10)/.22)
                fall, _ = SmoothWeight((.88 - level)/.27)
                crest = max(1. - ((fraction - .51)/.235)**2, 0.)**2
                xy[:, 0] *= 1. + .043 * crest * rise * fall
            grid.append(np.column_stack((xy, np.full(len(rays), depth))))
    grid = np.asarray(grid)

    # Give the broad faces and the returns a continuous normal along the loft.
    tangent = np.roll(grid, -1, axis=1) - np.roll(grid, 1, axis=1)
    acrossProfile = np.roll(grid, -1, axis=0) - np.roll(grid, 1, axis=0)
    normal = np.cross(tangent, acrossProfile)
    normal /= np.linalg.norm(normal, axis=2)[:, :, None]
    tangent /= np.linalg.norm(tangent, axis=2)[:, :, None]
    # Four near-square islands keep the density similar across and around the band.
    row = np.arange(len(grid) + 1) % len(grid)
    sectorCount = 4
    sectorWidth = len(rays) // sectorCount
    patchWidth = sectorWidth + 1
    positions, normals, tangents, coordinates, indices = [], [], [], [], []
    for sector in range(sectorCount):
        col = (sector*sectorWidth + np.arange(patchWidth)) % len(rays)
        patch = grid[row[:, None], col[None, :]]
        curved = np.linalg.norm(np.diff(patch, axis=1), axis=2).mean(axis=0)
        profile = np.linalg.norm(np.diff(patch, axis=0), axis=2).mean(axis=1)
        u, v = np.r_[0., np.cumsum(curved)], np.r_[0., np.cumsum(profile)]
        scale = .45 / max(u[-1], v[-1])
        u = .25 + .5*(sector % 2) + scale*(u - .5*u[-1])
        v = .25 + .5*(sector // 2) + scale*(v - .5*v[-1])
        coordinate = np.stack(np.meshgrid(u, v), axis=-1)
        corner = sector*patch.shape[0]*patchWidth + np.arange(len(grid))[:, None]*patchWidth + np.arange(sectorWidth)[None, :]
        faces = np.stack((corner, corner+1, corner+patchWidth,
                          corner+1, corner+patchWidth+1, corner+patchWidth), axis=-1)
        positions.append(patch.reshape(-1, 3))
        normals.append(normal[row[:, None], col[None, :]].reshape(-1, 3))
        tangents.append(tangent[row[:, None], col[None, :]].reshape(-1, 3))
        coordinates.append(coordinate.reshape(-1, 2))
        indices.append(faces.reshape(-1, 1))
    result = {'POSITION': np.concatenate(positions).astype('<f4'), 'NORMAL': np.concatenate(normals).astype('<f4')}
    if 'TEXCOORD_0' in streams:
        result['TEXCOORD_0'] = np.concatenate(coordinates).astype('<f4')
    if 'TANGENT' in streams:
        frames = np.concatenate(tangents)
        result['TANGENT'] = np.column_stack((frames, np.ones(len(frames)))).astype('<f4')
    return result, np.concatenate(indices).astype(indexType)
