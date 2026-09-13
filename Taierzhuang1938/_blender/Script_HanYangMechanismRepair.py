"""Blender MCP: split complete, closed HanYang handle islands into a named node.

Run with PROJECT_ROOT set to the Taierzhuang1938 directory. The original TZM
vertex attributes are copied byte-for-byte; no remesh, material or mount changes.
"""
import base64
import json
import struct
from pathlib import Path
import bpy
import bmesh


def Decode(value, code):
    raw = base64.b64decode(value)
    return struct.unpack('<' + code * (len(raw) // struct.calcsize(code)), raw)


def Subset(block, indices):
    order = list(dict.fromkeys(indices))
    remap = {old: new for new, old in enumerate(order)}
    result = dict(block)
    for key, stride in [('pos', 6), ('nrm', 3), ('uv', 4)]:
        raw = base64.b64decode(block[key])
        result[key] = base64.b64encode(b''.join(raw[i*stride:(i+1)*stride] for i in order)).decode()
    result['count'] = len(order)
    result['idxBits'] = 16
    result['idxCount'] = len(indices)
    result['idx'] = base64.b64encode(struct.pack('<'+'H'*len(indices), *(remap[i] for i in indices))).decode()
    return result


def Repair(projectRoot):
    path = Path(projectRoot) / 'Model/Model_HanYang.tzm.json'
    doc = json.loads(path.read_text(encoding='utf-8'))
    if any(node['name'] == 'boltHandle' for node in doc['nodes']):
        return {'alreadyRepaired': True}
    blockIndex = next(i for i, block in enumerate(doc['meshes']) if block['material'] == 'steel')
    block = doc['meshes'][blockIndex]
    positions = Decode(block['pos'], 'H')
    indices = Decode(block['idx'], 'H' if block['idxBits'] == 16 else 'I')
    vertices = [[block['posMin'][axis] + positions[i*3+axis]*block['posScale'][axis]
                 for axis in range(3)] for i in range(block['count'])]
    mesh = bpy.data.meshes.new('Mesh_HanYangTopologyAudit')
    mesh.from_pydata(vertices, [], [indices[i:i+3] for i in range(0, len(indices), 3)])
    bm = bmesh.new()
    bm.from_mesh(mesh)
    sourceLayer = bm.faces.layers.int.new('SourceTriangle')
    for face in bm.faces:
        face[sourceLayer] = face.index
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.000025)
    unseen = set(bm.verts)
    selected = set()
    islands = []
    while unseen:
        seed = unseen.pop()
        part, todo = {seed}, [seed]
        while todo:
            vertex = todo.pop()
            for edge in vertex.link_edges:
                neighbor = edge.other_vert(vertex)
                if neighbor in unseen:
                    unseen.remove(neighbor)
                    part.add(neighbor)
                    todo.append(neighbor)
        low = [min(vertex.co[axis] for vertex in part) for axis in range(3)]
        high = [max(vertex.co[axis] for vertex in part) for axis in range(3)]
        # Whole knob, stem and socket; never select faces from the receiver sleeve.
        if low[0] > .002 and low[2] > -.159 and high[2] < -.135 and low[1] > .029:
            edges = {edge for vertex in part for edge in vertex.link_edges}
            assert all(edge.is_manifold for edge in edges), 'Handle island must be closed'
            faces = {face for vertex in part for face in vertex.link_faces}
            selected.update(face[sourceLayer] for face in faces)
            islands.append({'vertices': len(part), 'triangles': len(faces), 'boundaryEdges': 0})
    assert len(islands) == 3, islands
    moving, fixed = [], []
    for i in range(len(indices)//3):
        (moving if i in selected else fixed).extend(indices[i*3:i*3+3])
    assert moving and fixed and len(moving) + len(fixed) == len(indices)
    doc['meshes'][blockIndex] = Subset(block, fixed)
    doc['meshes'].append(Subset(block, moving))
    doc['nodes'].append({'name': 'boltHandle', 'parent': 1, 't': [0, 0, 0],
                         'r': [0, 0, 0], 'meshes': [len(doc['meshes'])-1]})
    path.write_text(json.dumps(doc, separators=(',', ':'))+'\n', encoding='utf-8')
    bm.free()
    bpy.data.meshes.remove(mesh)
    return {'islands': islands, 'movingTriangles': len(moving)//3, 'totalTriangles': doc['triangles']}


if __name__ == '__main__':
    print(json.dumps(Repair(PROJECT_ROOT)))
