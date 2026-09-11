"""Replace only ear-scoop shaft primitives; preserve every unrelated GLB payload.

Run with Python to repair the runtime asset. Run with background Blender to also
save an independent native source from that repaired asset (never export it back).
"""
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from Script_ScoopGripGeometry import ScoopGripGeometry

SOURCE = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/ScoopGripRepair/Model_ScoopGripRepair.blend')


def Repair():
    path = ROOT / 'Models/Model_ImmersiveEar.glb'
    original = path.read_bytes()
    length = struct.unpack_from('<I', original, 12)[0]
    model = json.loads(original[20:20 + length])
    binary = bytearray(original[28 + length:])

    def Attribute(rows, kind, component=5126):
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        width = len(rows[0])
        for row in rows:
            binary.extend(struct.pack('<' + ('f' if component == 5126 else 'I') * width, *row))
        view = len(model['bufferViews'])
        model['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(binary) - offset})
        accessor = {'bufferView': view, 'componentType': component, 'count': len(rows), 'type': kind}
        if kind == 'VEC3':
            accessor.update(min=[min(r[k] for r in rows) for k in range(width)], max=[max(r[k] for r in rows) for k in range(width)])
        index = len(model['accessors'])
        model['accessors'].append(accessor)
        return index

    count = 0
    for node in model['nodes']:
        if node.get('name') not in ['Model_ScoopShaft', 'Model_ScoopShaft_Basic', 'Model_ScoopShaft_Refined', 'Model_ScoopShaft_Master']:
            continue
        tier = 2 if node['name'].endswith('_Master') else 1 if node['name'].endswith('_Refined') else 0
        mesh = model['meshes'][node['mesh']]
        if mesh.get('extras', {}).get('continuousScoopGrip') == 1:
            continue
        positions, normals, uvs, faces = ScoopGripGeometry(tier)
        material = mesh['primitives'][0]['material']
        mesh['primitives'] = [{'attributes': {'POSITION': Attribute(positions, 'VEC3'), 'NORMAL': Attribute(normals, 'VEC3'), 'TEXCOORD_0': Attribute(uvs, 'VEC2')}, 'indices': Attribute([(i,) for face in faces for i in face], 'SCALAR', 5125), 'material': material}]
        mesh.setdefault('extras', {})['continuousScoopGrip'] = 1
        count += 1
    if count:
        model['buffers'][0]['byteLength'] = len(binary)
        encoded = json.dumps(model, separators=(',', ':')).encode()
        encoded += b' ' * (-len(encoded) % 4)
        result = struct.pack('<III', 0x46546C67, 2, 28 + len(encoded) + len(binary))
        result += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
        result += struct.pack('<II', len(binary), 0x004E4942) + binary
        path.write_bytes(result)
    print('SCOOP_GRIP_REPAIRED', count)
    return path


if __name__ == '__main__':
    path = Repair()
    try:
        import bpy
    except ImportError:
        bpy = None
    if bpy:
        # Called only in an independent --background --factory-startup process.
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.object.delete(use_global=False)
        bpy.ops.import_scene.gltf(filepath=str(path))
        SOURCE.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
