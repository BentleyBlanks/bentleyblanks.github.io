"""Compare the exported exterior surfaces to both digital sources without changing the scene."""
import hashlib
import json
import os
import struct
import sys
from pathlib import Path

import numpy as np
from mathutils.bvhtree import BVHTree

archive = Path(os.environ.get('HANYANG_SOURCE_DIR', 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R'))
revision = archive / 'ExteriorFinish_20261122'
sys.path.insert(0,str(Path.cwd()/'Taierzhuang1938/_import'))
from Script_HanYangBandProfiles import FollowFrontBandOutline, ShapeStockEnd


def Surfaces(path, digest=None):
    raw = path.read_bytes()
    if digest:
        assert hashlib.sha256(raw).hexdigest() == digest
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+length])

    def Values(index):
        acc = doc['accessors'][index]
        view = doc['bufferViews'][acc['bufferView']]
        width = {'VEC3': 3, 'SCALAR': 1}[acc['type']]
        dtype = np.dtype({5126: '<f4', 5125: '<u4', 5123: '<u2'}[acc['componentType']])
        return np.ndarray((acc['count'], width), dtype, buffer=raw,
                          offset=28+length+view.get('byteOffset', 0)+acc.get('byteOffset', 0),
                          strides=(view.get('byteStride', width*dtype.itemsize), dtype.itemsize))

    result = {}
    for node in doc['nodes']:
        if 'mesh' not in node:
            continue
        primitive, = doc['meshes'][node['mesh']]['primitives']
        points = Values(primitive['attributes']['POSITION'])
        indices = Values(primitive['indices']).reshape(-1, 3)
        transform = [node.get(key) for key in ('scale', 'translation', 'rotation', 'matrix')]
        result[node['name']] = (points, indices, transform)
    return result


def Measure(part, other):
    points, indices, transform = part
    candidates, triangles, otherTransform = other
    assert transform == otherTransform
    tree = BVHTree.FromPolygons(candidates.tolist(), triangles.tolist(), all_triangles=True)
    return max(tree.find_nearest(point)[3] for point in np.unique(points, axis=0))


baseline = Surfaces(revision/'Input_R2.glb', '6f302b5dd315a7cec8b5bcebfcf0421302740de45609b2768afcdde4133c068d')
original = Surfaces(archive/'DotsDelivery/HanYang_173R_Runtime_GLB_PBR/Hanyang173R_final.glb', '3f380317c1930c7c141f6f0c0abb415a336354e25b78f24cc7bb9aa8c650a38c')
changed = json.loads((revision/'Data_Charts.json').read_text())
approvedPath=revision/'Input_ExteriorGeometry.glb'
approved=Surfaces(approvedPath,'e125056b12391f022f7e22969bb3acdf192295be711995b6ac43b958b31f47ec') if approvedPath.exists() else None
assert baseline.keys() == original.keys()
audit = {}
capName=next(name for name in baseline if name.startswith('ButtCap_'))
cap=(approved[capName] if approved else Surfaces(revision/(capName+'.glb'))[capName] if capName in changed else baseline[capName])
capPoints=cap[0].astype(np.float64)
capBounds=(capPoints.min(axis=0),capPoints.max(axis=0))
frontBandName='FrontBand_ContinuousEnvelopeContact'
frontBand=(approved[frontBandName] if approved else Surfaces(revision/(frontBandName+'.glb'))[frontBandName])
frontBandBounds=(frontBand[0].min(axis=0).astype(float),frontBand[0].max(axis=0).astype(float))
for name, previous in baseline.items():
    current = approved[name] if approved else (Surfaces(revision/(name+'.glb'))[name] if name in changed else previous)
    if name.startswith(('ButtCap_','MainWood_')):
        points,faces,transform=current
        shaped=ShapeStockEnd(name,{'POSITION':points},capBounds)
        current=shaped['POSITION'],faces,transform
    if name.startswith('FrontWood_'):
        points,faces,transform=current
        current=FollowFrontBandOutline({'POSITION':points},frontBandBounds)['POSITION'],faces,transform
    audit[name] = {'toDotsM': Measure(current, original[name]), 'fromDotsM': Measure(original[name], current),
                   'toR2M': Measure(current, previous) if name in changed else 0,
                   'fromR2M': Measure(previous, current) if name in changed else 0}
(revision/'Data_ExteriorSurface.json').write_text(json.dumps(audit, indent=2)+'\n')
print('Measured', len(audit), 'parts against Dots and R2')
