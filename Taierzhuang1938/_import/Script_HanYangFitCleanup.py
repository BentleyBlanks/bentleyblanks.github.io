"""Seat two exterior joins on the game mesh while keeping the packed UVs."""

from hashlib import sha256
import json
from pathlib import Path
import sys

import numpy as np
from scipy.spatial import ConvexHull

from Script_HanYang173RDilateTextures import WriteGlb
from Script_HanYangBandProfiles import TransformSurfaceFrames
from Script_HanYangWearAndEdges import MODEL, REPORT, PartStreams, ReadAsset, Smoothstep


BASE = '173R-20261128R38'
VERSION = '173R-20261128R39'
TAIL = 'RearOuterCover_RoundedSideReturn'
WOOD = 'UpperWood_Rebuilt_ShortRearShoulder_ContinuousFront'
SEAT = 'Sight_ShallowRoundSeat'


def TailFit(points):
    x, y, z = points.T
    # The leading shoulder sits inside the receiver's existing outer return.
    front = 1. - Smoothstep(-.122, -.118, z)
    join = Smoothstep(-.126, -.121, z)*(1.-Smoothstep(-.1185,-.112,z))
    crest = Smoothstep(.0466,.0485,y)*Smoothstep(.0078,.0111,abs(x))
    # Seat the exposed ends of the side lips below the wood on the aft slope.
    aft = Smoothstep(-.089, -.073, z)
    cheek = Smoothstep(.0073, .0107, abs(x))
    return np.column_stack((x*(1.-.069*front)-np.sign(x)*.00035*join*crest,
                            y-.00205*aft*cheek, z))


def SeatFit(seat):
    plate = seat[:, [0, 2]].astype(np.float64)
    low, high = plate.min(axis=0), plate.max(axis=0)
    width = (high[0]-low[0])*.5
    middle = (low[0]+high[0])*.5
    straight = low[1]+width, high[1]-width
    outline = ConvexHull(plate).equations
    normals, sides = outline[:, :2], outline[:, 2]

    def Fit(points):
        x, y, z = points.T
        plane = points[:, [0, 2]]
        axial = z-np.clip(z, *straight)
        # The long rails move sideways together. The axial component is
        # introduced gradually where the profile turns around the ends.
        radiusFrom = np.column_stack((x-middle, axial*Smoothstep(.0016,.0045,abs(axial))))
        radius = np.linalg.norm(radiusFrom, axis=1)
        upper = Smoothstep(.0546, .0581, y)
        rim = Smoothstep(.003, .0068, radius)*(1.-Smoothstep(.0095, .0133, radius))
        end = Smoothstep(.0016, .0060, abs(axial))
        travel = upper*rim*(.00057+.00039*end)
        rawShift = -radiusFrom/np.maximum(radius[:, None], 1e-10)*travel[:, None]

        # High timber approaches the actual steel outline with a small reveal.
        # The lower wall can continue underneath the seated plate.
        d0 = (plane@normals.T+sides).max(axis=1)
        d1 = ((plane+rawShift)@normals.T+sides).max(axis=1)
        space = np.maximum(d0-.00015, 1e-11)
        closing = np.maximum(d0-d1, 0.)
        safe = space*(-np.expm1(-closing/space))/np.maximum(closing, 1e-12)
        safe = np.where(closing>1e-10, safe, 1.)
        above = Smoothstep(.0588, .05995, y)
        shift = rawShift*(1.-above*(1.-safe))[:, None]
        floorLip = Smoothstep(.0071, .0082, radius)*(1.-Smoothstep(.00865,.0102,radius))
        soften = .00027*floorLip*upper*(1.-Smoothstep(.05985,.0619,y))*end
        return np.column_stack((x+shift[:, 0], y+soften, z+shift[:, 1]))

    return Fit


def ApplyFit(streams, reshape):
    points = streams['POSITION'].astype(np.float64)
    result = reshape(points)
    frames = {key: array.copy() for key, array in streams.items() if key in ('NORMAL','TANGENT')}
    changed = np.linalg.norm(result-points,axis=1)>1e-8
    moved = points[changed]
    step = .000001
    derivative = np.stack([(reshape(moved+axis)-reshape(moved-axis))/(2*step)
                           for axis in np.eye(3)*step], axis=2)
    assert np.all(np.linalg.det(derivative)>.12), 'Local fit must keep the surface orientation'
    subset = {key: array[changed] for key, array in frames.items()}
    TransformSurfaceFrames(subset, derivative)
    for key, array in subset.items():
        frames[key][changed] = array
    return {**streams, **frames, 'POSITION':result.astype('<f4')}, changed


def Main(source,output):
    assert source.resolve()!=output.resolve()
    report=json.loads((source/REPORT).read_text(encoding='utf8'))
    oldHash=sha256((source/MODEL).read_bytes()).hexdigest()
    assert oldHash==report['gameSha256'] and report['exteriorFinish']['version']==BASE
    doc,blocks=ReadAsset(source/MODEL)
    nodes=[node for node in doc['nodes'] if node.get('name') in (WOOD,TAIL,SEAT)]
    parts={node['name']:(node,streams,faces) for node,_,streams,faces in PartStreams(doc,blocks,nodes)}
    stats={}
    for name, deform in ((TAIL,TailFit),(WOOD,SeatFit(parts[SEAT][1]['POSITION']))):
        node,streams,indices=parts[name]
        assert not {'translation','rotation','scale','matrix'}.intersection(node)
        fit,changed=ApplyFit(streams,deform)
        faces=fit['POSITION'][indices.reshape(-1,3)]
        old=streams['POSITION'][indices.reshape(-1,3)]
        triangle=lambda p: np.linalg.norm(np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0]),axis=1)
        areas=triangle(old)
        assert np.all(triangle(faces)[areas>1e-12]>1e-12),name
        primitive,=doc['meshes'][node['mesh']]['primitives']
        for key in ('POSITION','NORMAL','TANGENT'):
            acc=doc['accessors'][primitive['attributes'][key]]
            assert not acc.get('byteOffset',0) and not doc['bufferViews'][acc['bufferView']].get('byteStride')
            array=fit[key]
            blocks[acc['bufferView']]=array.tobytes()
            if 'min' in acc:
                acc['min']=array.min(axis=0).tolist()
            if 'max' in acc:
                acc['max']=array.max(axis=0).tolist()
        stats[name]={'vertices':int(changed.sum()),
                     'maximumTravelM':float(np.linalg.norm(fit['POSITION']-streams['POSITION'],axis=1).max())}
    description='R39: seated rear cover lips and eased wood around the sight seat.'
    report['exteriorFinish'].update(version=VERSION,fitCleanup={'baseSha256':oldHash,'parts':stats})
    report['materialMatch']['version']=VERSION
    report['rebake']=description
    doc['asset']['extras'].update(materialMatch=VERSION,rebake=description)
    output.mkdir(parents=True,exist_ok=True)
    target=output/MODEL
    WriteGlb(target,doc,blocks)
    report['gameSha256']=sha256(target.read_bytes()).hexdigest()
    (output/REPORT).write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'fit':stats,'sha256':report['gameSha256']},indent=2))


if __name__=='__main__':
    Main(*(Path(value) for value in sys.argv[1:]))
