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
import struct
from pathlib import Path


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


def component_slots(doc, binary_start, accessor_index, vertex):
    accessor = doc['accessors'][accessor_index]
    if accessor['type'] != 'VEC4' or not 0 <= vertex < accessor['count']:
        raise ValueError('Recipe must address an existing VEC4 vertex')
    if accessor.get('sparse') or accessor.get('normalized'):
        raise ValueError('Sparse/normalized weight attributes need a separate audited baker')
    formats = {5121: ('B', 1), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
    fmt, width = formats[accessor['componentType']]
    view = doc['bufferViews'][accessor['bufferView']]
    if view.get('buffer', 0) != 0:
        raise ValueError('External buffers are unsupported')
    stride = view.get('byteStride', 4 * width)
    start = binary_start + view.get('byteOffset', 0) + accessor.get('byteOffset', 0) + vertex * stride
    return fmt, width, [start + i * width for i in range(4)]


def replay(raw, recipe, restore=False):
    spans = chunks(raw)
    json_start, json_length = spans[0x4E4F534A]
    binary_start, binary_length = spans[0x004E4942]
    doc = json.loads(raw[json_start:json_start + json_length])
    before, after = (recipe['output'], recipe['basis']) if restore else (recipe['basis'], recipe['output'])
    if sha256(raw) != before['sha256'] or sha256(raw[binary_start:binary_start + binary_length]) != before['binarySha256']:
        raise ValueError('Input does not match the exact recipe basis/output')
    result = bytearray(raw)
    allowed = set()
    semantic_offsets = {}
    seen = set()
    suffix_from, suffix_to = ('After', 'Before') if restore else ('Before', 'After')
    for edit in recipe['edits']:
        identity = (edit['meshIndex'], edit['primitiveIndex'], edit['vertex'])
        if identity in seen:
            raise ValueError('Duplicate edited vertex')
        seen.add(identity)
        attributes = doc['meshes'][edit['meshIndex']]['primitives'][edit['primitiveIndex']]['attributes']
        for semantic, key in [('JOINTS_0', 'joints'), ('WEIGHTS_0', 'weights')]:
            fmt, width, offsets = component_slots(doc, binary_start, attributes[semantic], edit['vertex'])
            for slot, offset in enumerate(offsets):
                expected = struct.pack('<' + fmt, edit[key + suffix_from][slot])
                replacement = struct.pack('<' + fmt, edit[key + suffix_to][slot])
                if bytes(result[offset:offset + width]) != expected:
                    raise ValueError(f'Before-value mismatch at {identity} {semantic}[{slot}]')
                result[offset:offset + width] = replacement
                allowed.update(range(offset, offset + width))
                semantic_offsets.update((i, semantic) for i in range(offset, offset + width))
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
