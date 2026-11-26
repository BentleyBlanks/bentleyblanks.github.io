"""Bake local inter-part accessibility for the fixed exterior using the exported vertex order."""
import hashlib
import json
import math
import os
import struct
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


fixedPrefixes = ('MainWood_', 'UpperWood_', 'FrontWood_', 'FrontBand_', 'RearBand_Controlled', 'ReceiverOuterCollar', 'LowerPlateGuard_', 'LongOuterSteel_', 'ButtCap_')


def ReadMesh(path, digest):
    raw = path.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == digest
    length = struct.unpack_from('<I', raw, 12)[0]
    document = json.loads(raw[20:20+length])
    payload = raw[28+length:]

    def Values(index):
        accessor = document['accessors'][index]
        view = document['bufferViews'][accessor['bufferView']]
        width = {'VEC3': 3, 'VEC4': 4, 'SCALAR': 1}[accessor['type']]
        dtype = np.dtype({5126: '<f4', 5123: '<u2', 5125: '<u4'}[accessor['componentType']])
        return np.ndarray((accessor['count'], width), dtype=dtype, buffer=payload,
                          offset=view.get('byteOffset', 0)+accessor.get('byteOffset', 0),
                          strides=(view.get('byteStride', width*dtype.itemsize), dtype.itemsize))

    parts = {}
    for node in document['nodes']:
        if 'mesh' not in node or not node['name'].startswith(fixedPrefixes):
            continue
        assert not any(key in node for key in ('matrix', 'rotation', 'translation', 'scale'))
        primitive = document['meshes'][node['mesh']]['primitives'][0]
        attrs = primitive['attributes']
        arrays={key:Values(attrs[key]) for key in ('POSITION','NORMAL','TANGENT')}
        arrays,indices,_=RepairTimberFrames(node['name'],arrays,Values(primitive['indices']))
        parts[node['name']] = (arrays['POSITION'], arrays['NORMAL'], indices.reshape(-1, 3))
    return parts


def MeasureContact(name, parts, radius, directions):
    vertices, normals, _ = parts[name]
    cornerPositions, cornerFaces = [], []
    for other, (positions, _, faces) in parts.items():
        if other == name:
            continue
        offset = len(cornerPositions)
        cornerPositions.extend(positions.tolist())
        cornerFaces.extend((faces+np.int32(offset)).tolist())
    tree = BVHTree.FromPolygons(cornerPositions, cornerFaces, all_triangles=True)
    guard = name.startswith('LowerPlateGuard_')
    lining = BVHTree.FromPolygons(vertices.tolist(), parts[name][2].tolist(), all_triangles=True) if guard else None
    samples, inverse = np.unique(np.round(np.column_stack((vertices, normals)), 6), axis=0, return_inverse=True)
    values = []
    for row in samples:
        normal = Vector(row[3:]).normalized()
        origin = Vector(row[:3])+normal*.00006
        axis = Vector((0, 1, 0)) if abs(normal.y)<.9 else Vector((0, 0, 1))
        tangent = normal.cross(axis).normalized()
        bitangent = normal.cross(tangent)
        # The walls around the guard opening obscure the opposite return.
        # Keep that shallow cavity shadow local to its inward-facing surface.
        inside = lining is not None and -.142 < row[2] < -.063 and -.029 < row[1] < .001
        if inside:
            centre = Vector((0., -.012-row[1], -.104-row[2]))
            inside = centre.length > 1e-6 and normal.dot(centre.normalized()) > .42
        obscured = 0.
        for first, second, third in directions:
            ray = tangent*first+bitangent*second+normal*third
            distance = tree.ray_cast(origin, ray, radius)[3]
            blockage = (1.-distance/radius)**1.5 if distance is not None else 0.
            if inside:
                innerDepth = lining.ray_cast(origin, ray, .028)[3]
                if innerDepth is not None:
                    blockage = max(blockage, .85*(1.-innerDepth/.028)**1.3)
            obscured += blockage
        values.append(1.-obscured/len(directions))
    return np.asarray(values, dtype='<f4')[inverse].reshape(-1)


archive = Path(os.environ.get('HANYANG_SOURCE_DIR', 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R'))
revision = archive/'ExteriorFinish_20261122'
geometryDirectory = Path(os.environ.get('HANYANG_BAKE_GEOMETRY_DIR', revision))
assert not bpy.data.filepath or Path(bpy.data.filepath).resolve().parent == revision.resolve()
importDirectory=Path.cwd()/'Taierzhuang1938/_import'
assert (importDirectory/'Script_HanYangTimberFrames.py').is_file(),'Start the owned Blender session from the worktree root'
sys.path.insert(0,str(importDirectory))
from Script_HanYangReceiverFinish import ShapeReceiverWood
from Script_HanYangTimberFrames import RepairTimberFrames, SmoothStockCrest
from Script_HanYangBandProfiles import FormInspectionBand, SeatFrontBandTimber, SeatRearBandTimber, ShapeStockEnd
incoming = ReadMesh(revision/'Input_R2.glb', '6f302b5dd315a7cec8b5bcebfcf0421302740de45609b2768afcdde4133c068d')
approved = ReadMesh(revision/'Input_ExteriorGeometry.glb', 'e125056b12391f022f7e22969bb3acdf192295be711995b6ac43b958b31f47ec')
charts = json.loads((revision/'Data_Charts.json').read_text())
parts = {name: approved[name] if name in charts else mesh for name, mesh in incoming.items()}
directions = []
for sample in range(32):
    radial = math.sqrt((sample+.5)/32)
    angle = sample*math.pi*(3.-math.sqrt(5.))
    directions.append((radial*math.cos(angle), radial*math.sin(angle), math.sqrt(1.-radial**2)))
# Handling and oil were authored against the original timber exposure. A new
# band contour changes its cast contact shadow without repainting that wear.
timber = {name: MeasureContact(name, parts, .004, directions) for name in parts
          if name.startswith(('MainWood_', 'FrontWood_', 'UpperWood_'))}
capName=next(name for name in parts if name.startswith('ButtCap_'))
capPoints=parts[capName][0].astype(np.float64)
capBounds=(capPoints.min(axis=0),capPoints.max(axis=0))
for name in (capName,next(name for name in parts if name.startswith('MainWood_'))):
    points,normals,faces=parts[name]
    shaped=ShapeStockEnd(name,{'POSITION':points,'NORMAL':normals},capBounds)
    parts[name]=shaped['POSITION'],shaped['NORMAL'],faces
stockName=next(name for name in parts if name.startswith('MainWood_'))
positions,normals,faces=parts[stockName]
stock=SmoothStockCrest(stockName,{'POSITION':positions,'NORMAL':normals},faces)
stock['sourceVertex']=np.arange(len(positions))
stock,faces,_=RepairTimberFrames(stockName,stock,faces)
timber[stockName]=timber[stockName][stock['sourceVertex']]
parts[stockName]=stock['POSITION'],stock['NORMAL'],faces
bandPoints=parts['FrontBand_ContinuousEnvelopeContact'][0].astype(np.float64)
bandBounds=(bandPoints.min(axis=0),bandPoints.max(axis=0))
for name in timber:
    positions, normals, faces = parts[name]
    streams = {'POSITION': positions, 'NORMAL': normals}
    if name == 'FrontWood_ContinuousOval':
        streams['handling'] = timber[name]
        streams, faces = SeatFrontBandTimber(streams, faces, bandBounds)
        timber[name] = streams.pop('handling')
    streams = ShapeReceiverWood(name, SeatRearBandTimber(name, streams))
    parts[name] = streams['POSITION'], streams['NORMAL'], faces.reshape(-1, 3)
np.savez_compressed(geometryDirectory/'Data_TimberHandling.npz', **timber)
with np.load(geometryDirectory/'Data_InspectionBevels.npz', allow_pickle=False) as bevels:
    for name in parts:
        if name+'_indices' in bevels:
            parts[name] = bevels[name+'_POSITION'], bevels[name+'_NORMAL'], bevels[name+'_indices'].reshape(-1, 3)
for name in ('FrontBand_ContinuousEnvelopeContact', 'RearBand_ControlledCrown'):
    positions, normals, faces = parts[name]
    shaped, faces = FormInspectionBand(name, {'POSITION': positions, 'NORMAL': normals}, faces)
    parts[name] = shaped['POSITION'], shaped['NORMAL'], faces.reshape(-1, 3)
result = {name: MeasureContact(name, parts, .004, directions) for name in parts}
np.savez_compressed(geometryDirectory/'Data_ContactVisibility.npz', **result)
print('Exterior contact fields and guard cavity:', {name: (len(value), int(np.sum(value<.90))) for name, value in result.items()})
