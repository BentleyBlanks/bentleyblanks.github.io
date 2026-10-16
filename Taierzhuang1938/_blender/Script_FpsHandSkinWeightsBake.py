"""Replay the narrowly scoped scan hand skin-index repair, without re-exporting.

Usable from CPython or Blender's Python. The recipe identifies exact exported
vertices, so this deterministic replay preserves the GLB JSON chunk and every
byte except explicitly authorized JOINTS_0 / WEIGHTS_0 components. It also
supports strict byte restoration to the 7c727aa4 source. The source archive
contains the basis GLB, recipe and this baker; no approximate Blender vertex
mapping is attempted, because that would silently change subdivided scan skin.

Example: python Script_FpsHandSkinWeightsBake.py --input BASIS.glb \
  --recipe Data_FpsHandSkinWeights.json --output Review.glb
"""
import argparse
import hashlib
import json
import math
import re
import struct
from pathlib import Path

MCP_BASIS = {'sha256': 'a3c6d33938aee6e1c7a547224c1e377d7ada24c52ae0aeb74cd05a33fd1e5350',
             'binarySha256': 'c445d10986302e6d09180efc9ced5f4ed136a73f7ce8bacb572b5e56215cc985',
             'legacyEdits': 150}
MCP_MASS_EPSILON = 1e-7  # Float32 MCP serialization only; non-MCP weights compare exactly.


def normalize(name):
    return re.sub('[^a-z0-9]', '', name.lower())


def weight_map(names, joints, weights):
    result = {}
    for joint, weight in zip(joints, weights):
        if weight > 0:
            name = names[joint]
            result[name] = result.get(name, 0) + weight
    return result


def edit_phases(recipe):
    if type(recipe.get('version')) is not int or recipe['version'] not in (1, 2):
        raise ValueError('Unsupported weight-repair recipe version')
    if not 0 < len(recipe['edits']) <= 500:
        raise ValueError('Repair must remain localized')
    phases, seen, phase = [[], []], [set(), set()], 0
    for edit in recipe['edits']:
        kind = edit.get('kind')
        if kind not in (None, 'McpBranchContinuity'):
            raise ValueError('Unsupported repair kind')
        if kind == 'McpBranchContinuity':
            if recipe['version'] != 2:
                raise ValueError('MCP continuity requires recipe v2')
            phase = 1
        elif phase:
            raise ValueError('Legacy repairs must precede the MCP continuity phase')
        identity = (edit['meshIndex'], edit['primitiveIndex'], edit['vertex'])
        if identity in seen[phase]:
            raise ValueError('Duplicate edited vertex within one phase')
        seen[phase].add(identity)
        phases[phase].append(edit)
    if recipe['version'] == 2:
        if recipe.get('mcpBasis') != MCP_BASIS or len(phases[0]) != MCP_BASIS['legacyEdits'] or not phases[1]:
            raise ValueError('MCP phase must retain all150 original repairs and the frozen published v1 basis')
    return phases


def validate_edit(names, edit, version):
    sides = set()
    for phase in ('Before', 'After'):
        joints, weights = edit['joints' + phase], edit['weights' + phase]
        if len(joints) != 4 or len(weights) != 4:
            raise ValueError('Complete four-slot before/after values are required')
        for joint, weight in zip(joints, weights):
            if type(joint) is not int or not 0 <= joint < len(names):
                raise ValueError('Invalid joint index')
            if not math.isfinite(weight) or not 0 <= weight <= 1 or struct.unpack('<f', struct.pack('<f', weight))[0] != weight:
                raise ValueError('Weights must be exact finite nonnegative float32 values')
            if weight:
                match = re.search(r'([rl])(hand|finger[0-4][12]?)$', names[joint])
                if not match:
                    raise ValueError('Only hand/finger skin may be repaired')
                sides.add(match[1])
        if abs(sum(weights) - 1) >= 1e-5:
            raise ValueError('Weights must remain normalized')
    if len(sides) != 1:
        raise ValueError('Repair cannot transfer skin to the opposite arm')
    if edit.get('kind') is None:
        if edit['weightsBefore'] != edit['weightsAfter']:
            raise ValueError('Legacy index/middle repair must preserve every weight slot')
        for old, new, weight in zip(edit['jointsBefore'], edit['jointsAfter'], edit['weightsBefore']):
            if old == new:
                continue
            match = re.search(r'([rl])finger1([12]?)$', names[old])
            if not weight or not match or names[new] != names[old][:match.start()] + match[1] + 'finger2' + match[2]:
                raise ValueError('Legacy repair only reassigns same-side index/middle matching phalanges')
    else:
        if version != 2 or edit['kind'] != 'McpBranchContinuity':
            raise ValueError('MCP continuity requires recipe v2')
        before = weight_map(names, edit['jointsBefore'], edit['weightsBefore'])
        after = weight_map(names, edit['jointsAfter'], edit['weightsAfter'])
        before_mcp, after_mcp, changed = 0, 0, False
        for name in before.keys() | after.keys():
            a, b = before.get(name, 0), after.get(name, 0)
            if re.search(r'([rl])finger[1-4]$', name):
                before_mcp += a
                after_mcp += b
                changed |= a != b
            elif a != b:
                raise ValueError('MCP repair must preserve each Hand, thumb, PIP/DIP and non-MCP bone weight exactly')
        if not before_mcp or not changed or abs(after_mcp - before_mcp) > MCP_MASS_EPSILON:
            raise ValueError('MCP repair must redistribute only existing same-side MCP mass within float32 serialization error')


def edit_context(doc, edit):
    primitive = doc['meshes'][edit['meshIndex']]['primitives'][edit['primitiveIndex']]
    if doc['materials'][primitive['material']]['name'] != 'Material_HanYangScanSkin':
        raise ValueError('Only the dedicated scanned skin material may change')
    node = next(n for n in doc['nodes'] if n.get('mesh') == edit['meshIndex'] and 'skin' in n)
    names = [normalize(doc['nodes'][index]['name']) for index in doc['skins'][node['skin']]['joints']]
    return primitive, names


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def chunks(raw):
    magic, version, length = struct.unpack_from('<III', raw)
    if magic != 0x46546C67 or version != 2 or length != len(raw):
        raise ValueError('Invalid GLB v2 envelope')
    result = {}
    offset = 12
    while offset < len(raw):
        count, kind = struct.unpack_from('<II', raw, offset)
        result[kind] = (offset + 8, count)
        offset += 8 + count
    if offset != len(raw):
        raise ValueError('Invalid GLB chunk boundaries')
    return result


def component_slots(doc, binary_start, accessor_index, vertex, components=4):
    accessor = doc['accessors'][accessor_index]
    if accessor['type'] != 'VEC' + str(components) or type(vertex) is not int or not 0 <= vertex < accessor['count']:
        raise ValueError('Recipe must address an existing vector vertex')
    if accessor.get('sparse') or accessor.get('normalized'):
        raise ValueError('Sparse/normalized weight attributes need a separate audited baker')
    formats = {5121: ('B', 1), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
    fmt, width = formats[accessor['componentType']]
    view = doc['bufferViews'][accessor['bufferView']]
    if view.get('buffer', 0) != 0:
        raise ValueError('External buffers are unsupported')
    stride = view.get('byteStride', components * width)
    start = binary_start + view.get('byteOffset', 0) + accessor.get('byteOffset', 0) + vertex * stride
    return fmt, width, [start + i * width for i in range(components)]


def uv_consistency(raw, doc, binary_start, edits):
    groups = {}
    for edit in edits:
        primitive, names = edit_context(doc, edit)
        attributes = primitive['attributes']
        def values(semantic, vertex):
            count = 3 if semantic == 'POSITION' else 4
            fmt, _, offsets = component_slots(doc, binary_start, attributes[semantic], vertex, count)
            return [struct.unpack_from('<' + fmt, raw, offset)[0] for offset in offsets]
        identity = (edit['meshIndex'], edit['primitiveIndex'])
        if identity not in groups:
            groups[identity] = {}
            for vertex in range(doc['accessors'][attributes['POSITION']]['count']):
                position = tuple(values('POSITION', vertex))
                groups[identity].setdefault(position, []).append(vertex)
        position = tuple(values('POSITION', edit['vertex']))
        expected = weight_map(names, values('JOINTS_0', edit['vertex']), values('WEIGHTS_0', edit['vertex']))
        for vertex in groups[identity][position]:
            if weight_map(names, values('JOINTS_0', vertex), values('WEIGHTS_0', vertex)) != expected:
                raise ValueError('All same-position UV split vertices must have identical bone weights in each MCP phase')


def replay(raw, recipe, restore=False):
    spans = chunks(raw)
    json_start, json_length = spans[0x4E4F534A]
    binary_start, binary_length = spans[0x004E4942]
    doc = json.loads(raw[json_start:json_start + json_length])
    before, after = (recipe['output'], recipe['basis']) if restore else (recipe['basis'], recipe['output'])
    if sha256(raw) != before['sha256'] or sha256(raw[binary_start:binary_start + binary_length]) != before['binarySha256']:
        raise ValueError('Input does not match the exact recipe basis/output')
    phases = edit_phases(recipe)
    result = bytearray(raw)
    allowed = set()
    semantic_offsets = {}
    suffix_from, suffix_to = ('After', 'Before') if restore else ('Before', 'After')
    for phase in ((1, 0) if restore else (0, 1)):
        if phase == 1 and phases[phase]:
            uv_consistency(result, doc, binary_start, phases[phase])
        for edit in (reversed(phases[phase]) if restore else phases[phase]):
            identity = (edit['meshIndex'], edit['primitiveIndex'], edit['vertex'])
            primitive, names = edit_context(doc, edit)
            validate_edit(names, edit, recipe['version'])
            attributes = primitive['attributes']
            for semantic, key in [('JOINTS_0', 'joints'), ('WEIGHTS_0', 'weights')]:
                component_type = doc['accessors'][attributes[semantic]]['componentType']
                if (semantic == 'JOINTS_0' and component_type not in (5121, 5123, 5125)) or (semantic == 'WEIGHTS_0' and component_type != 5126):
                    raise ValueError('Unexpected joint/weight component type')
                fmt, width, offsets = component_slots(doc, binary_start, attributes[semantic], edit['vertex'])
                for slot, offset in enumerate(offsets):
                    expected = struct.pack('<' + fmt, edit[key + suffix_from][slot])
                    replacement = struct.pack('<' + fmt, edit[key + suffix_to][slot])
                    if bytes(result[offset:offset + width]) != expected:
                        raise ValueError(f'Before-value mismatch at {identity} {semantic}[{slot}]')
                    result[offset:offset + width] = replacement
                    allowed.update(range(offset, offset + width))
                    semantic_offsets.update((i, semantic) for i in range(offset, offset + width))
        if phase == 1 and phases[phase]:
            uv_consistency(result, doc, binary_start, phases[phase])
        if recipe['version'] == 2 and ((restore and phase == 1) or (not restore and phase == 0)):
            if sha256(result) != MCP_BASIS['sha256'] or sha256(result[binary_start:binary_start + binary_length]) != MCP_BASIS['binarySha256']:
                raise ValueError('MCP phase boundary must reproduce every byte of the published v1 asset')
    changed = [i for i, (a, b) in enumerate(zip(raw, result)) if a != b]
    if any(i not in allowed for i in changed):
        raise ValueError('Unexpected bytes changed outside the recipe')
    if bytes(result[json_start:json_start + json_length]) != raw[json_start:json_start + json_length]:
        raise ValueError('GLB JSON chunk was modified')
    if sha256(result) != after['sha256'] or sha256(result[binary_start:binary_start + binary_length]) != after['binarySha256']:
        raise ValueError('Output does not match the declared byte-exact result')
    ranges = []
    for offset in changed:
        if ranges and ranges[-1][1] == offset:
            ranges[-1][1] += 1
        else:
            ranges.append([offset, offset + 1])
    report = {'mode': 'restore' if restore else 'bake', 'edits': len(recipe['edits']),
              'bytes': len(result), 'changedBytes': len(changed), 'changedRanges': ranges,
              'changedSemantics': {semantic: sum(semantic_offsets[i] == semantic for i in changed)
                                   for semantic in ['JOINTS_0', 'WEIGHTS_0']},
              'byteEdits': [{'offset': i, 'before': raw[i], 'after': result[i]} for i in changed],
              'jsonUnchanged': True, 'otherBytesUnchanged': True, 'sha256': sha256(result),
              'binarySha256': sha256(result[binary_start:binary_start + binary_length])}
    return bytes(result), report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--recipe', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--restore', action='store_true')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args(argv)
    if args.input.resolve() == args.output.resolve():
        raise ValueError('Use a separate output path; the input asset is preserved')
    recipe = json.loads(args.recipe.read_text(encoding='utf-8'))
    raw = args.input.read_bytes()
    result, report = replay(raw, recipe, args.restore)
    # Both directions must reconstruct byte-for-byte before any file is saved.
    restored, _ = replay(result, recipe, not args.restore)
    if restored != raw:
        raise ValueError('Strict reverse replay did not reconstruct every input byte')
    report['strictReverseReplay'] = True
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(result)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, separators=(',', ':')))


if __name__ == '__main__':
    import sys
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else None)
