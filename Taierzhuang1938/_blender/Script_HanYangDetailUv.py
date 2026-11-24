"""Unwrap four exterior detail meshes without modifying their geometry."""
import hashlib
import json
import math
import os
import struct
from pathlib import Path

import bpy
import numpy as np


archive = Path(os.environ.get('HANYANG_SOURCE_DIR', 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R'))
revision = archive/'ExteriorFinish_20261122'
assert not bpy.data.filepath or Path(bpy.data.filepath).resolve().parent == revision.resolve()
raw = (revision/'Input_R2.glb').read_bytes()
assert hashlib.sha256(raw).hexdigest() == '6f302b5dd315a7cec8b5bcebfcf0421302740de45609b2768afcdde4133c068d'
size = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20+size])
binary = memoryview(raw)[28+size:]
names = ('HY150_ExteriorSideRelief_Neg', 'HY150_ExteriorSideRelief_Pos',
         'HY151_LowRearShoulder', 'Trigger_FlatCurvedExternalStrip')


def Read(index):
    acc = doc['accessors'][index]
    view = doc['bufferViews'][acc['bufferView']]
    offset = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
    dtype = {5126:'<f4', 5125:'<u4', 5123:'<u2'}[acc['componentType']]
    width = {'VEC3':3, 'SCALAR':1}[acc['type']]
    return np.frombuffer(binary, dtype, acc['count']*width, offset).reshape(acc['count'], width)


def DetailChart(name):
    node = next(n for n in doc['nodes'] if n.get('name') == name)
    prim = doc['meshes'][node['mesh']]['primitives'][0]
    positions = Read(prim['attributes']['POSITION'])
    indices = Read(prim['indices']).reshape(-1, 3)
    normals = Read(prim['attributes']['NORMAL'])[indices].reshape(-1, 3)
    points, inverse = np.unique(positions, axis=0, return_inverse=True)
    faces = inverse[indices]
    mesh = bpy.data.meshes.new('Detail UV surface')
    obj = bpy.data.objects.new('Detail UV work', mesh)
    bpy.context.scene.collection.objects.link(obj)
    try:
        mesh.from_pydata(points.tolist(), [], faces.tolist())
        mesh.update()
        corners = np.empty(len(mesh.loops), dtype=np.int32)
        mesh.loops.foreach_get('vertex_index', corners)
        assert np.array_equal(corners, faces.ravel()), name
        mesh.uv_layers.new(name='DetailAtlas')
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(40), island_margin=.007,
                                 margin_method='FRACTION', area_weight=.40, correct_aspect=False,
                                 scale_to_bounds=False)
        bpy.ops.uv.select_all(action='SELECT')
        bpy.ops.uv.pack_islands(rotate=True, rotate_method='ANY', scale=True,
                                margin_method='FRACTION', margin=.0055, shape_method='CONCAVE')
        bpy.ops.object.mode_set(mode='OBJECT')
        mesh.polygons.foreach_set('use_smooth', np.ones(len(mesh.polygons), dtype=np.bool_))
        mesh.normals_split_custom_set(normals.tolist())
        mesh.calc_tangents(uvmap='DetailAtlas')
        uv = np.empty((len(mesh.loops), 2), dtype='<f4')
        tangent = np.empty((len(mesh.loops), 3), dtype='<f4')
        sign = np.empty(len(mesh.loops), dtype='<f4')
        mesh.uv_layers.active.uv.foreach_get('vector', uv.ravel())
        mesh.loops.foreach_get('tangent', tangent.ravel())
        mesh.loops.foreach_get('bitangent_sign', sign)
        tangent -= np.sum(tangent*normals, axis=1)[:, None]*normals
        lengths = np.linalg.norm(tangent, axis=1)
        assert lengths.min() > .001 and np.all(abs(sign) == 1), name
        tangent /= lengths[:, None]
        # Share a tangent at each continuous UV vertex. Keep mirrored charts
        # and strongly divergent frames separate.
        keys = np.column_stack((indices.ravel().astype('<u4'), uv.view('<u4'), sign.view('<u4')))
        _, group = np.unique(keys, axis=0, return_inverse=True)
        group = group.ravel()
        corners = positions[indices].astype(np.float64)
        prevEdge = np.roll(corners, 1, axis=1) - corners
        nextEdge = np.roll(corners, -1, axis=1) - corners
        angles = np.arctan2(np.linalg.norm(np.cross(prevEdge,nextEdge),axis=2),
                            np.sum(prevEdge*nextEdge,axis=2)).ravel()
        average = np.zeros((group.max()+1,3))
        np.add.at(average,group,tangent*angles[:,None])
        average /= np.maximum(np.linalg.norm(average,axis=1)[:,None],1e-12)
        compatible = np.ones(len(average), dtype=np.bool_)
        np.logical_and.at(compatible,group,np.sum(average[group]*tangent,axis=1)>.70)
        tangent = np.where(compatible[group,None],average[group],tangent).astype('<f4')
        assert np.isfinite(uv).all() and uv.min() >= 0 and uv.max() <= 1, name
        return uv, np.column_stack((tangent, sign))
    finally:
        if obj.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.meshes.remove(mesh)


selected = list(bpy.context.selected_objects)
active = bpy.context.view_layer.objects.active
output = {}
try:
    for part in names:
        output[part+'_UV'], output[part+'_Tangent'] = DetailChart(part)
finally:
    for obj in selected:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = active
np.savez_compressed(revision/'Data_DetailUv.npz', **output)
print('Charted detail corners:', {name: len(output[name+'_UV']) for name in names})
