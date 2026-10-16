"""Synchronize reviewed exported skin weights into the copied Blender source.

Run in FpsHandSkinWeights_20261016 with FPS_PROJECT_ROOT set to the game
directory. V1 changes only index/middle ownership. V2 subsequently redistributes
existing MCP root mass; source Hand, thumb, PIP/DIP and unexported influences
retain their exact values. The byte-exact GLB baker remains publication input.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import struct


def float32(value):
    return struct.unpack('<f', struct.pack('<f', value))[0]


def source_export_projection(original, eligible_names=None):
    """Match the Blender5.2 exporter used by the frozen scanned-skin basis.

    io_scene_gltf2/blender/exp/primitive_extract.py::__get_bone_data drops
    influences <=0.0001, filters non-joint groups and sorts descending.
    primitive_attributes.py keeps the default top4, sums a four-slot float32
    row and divides that float32 row by its float32 total. The cutoff happens
    BEFORE normalization and before the byte-only legacy Index->Middle phase.
    """
    import numpy as np
    eligible = set(original) if eligible_names is None else set(eligible_names)
    retained = sorted(((name, weight) for name, weight in original.items()
                       if name in eligible and weight > 0.0001), key=lambda item: item[1], reverse=True)[:4]
    assert retained, 'Source has no exportable bone influences'
    weights = np.zeros((1, 4), dtype=np.float32)
    weights[0, :len(retained)] = [weight for _, weight in retained]
    weights /= weights.sum(axis=1).reshape(-1, 1)
    return {name: float(weights[0, slot]) for slot, (name, _) in enumerate(retained)}


def source_legacy_after(original, pairs):
    """Simulate the unchanged legacy source operation, including Blender f32 storage."""
    result = dict(original)
    assert all(old in original for old in pairs), 'Source legacy groups do not match the unmodified basis'
    for old, new in pairs.items():
        result.pop(old)
        result[new] = float32(original.get(new, 0) + original[old])
    return result


def projected_legacy_after(projected, pairs):
    # GLB retains the four original slots. Summing duplicate repaired joints
    # here must NOT f32-round the sum or re-export/re-normalize the source.
    result = dict(projected)
    for old, new in pairs.items():
        if old in projected:
            result.pop(old)
            result[new] = result.get(new, 0) + projected[old]
    return result


def source_mcp_after(original, before, after, *, source_basis=None, legacy_pairs=None, eligible_names=None):
    """Pure source operation, independently testable without importing bpy.

    Compare with the exact original-source export projection and subsequent
    legacy byte remapping. Exporting an already merged source is different:
    omitted micro-influences and duplicate MCP slots must not be conflated.
    Preserve the complete source MCP mass and every non-MCP source value.
    """
    sides = {re.search(r'([rl])(hand|finger[0-4][12]?)$', name)[1]
             for name, weight in before.items()
             if weight > 0 and re.search(r'([rl])(hand|finger[0-4][12]?)$', name)}
    assert len(sides) == 1, 'A source update must belong to one hand'
    side = next(iter(sides))
    mcp = lambda name: bool(re.search(side + r'finger[1-4]$', name))
    basis = original if source_basis is None else source_basis
    pairs = {} if legacy_pairs is None else legacy_pairs
    expected_source = source_legacy_after(basis, pairs)
    assert original == expected_source, 'Source is already modified or differs from its pre-phase0 snapshot'
    assert sum(original.values()) > 0 and all(weight >= 0 for weight in original.values())
    projected = projected_legacy_after(source_export_projection(basis, eligible_names), pairs)
    error = max(abs(projected.get(name, 0) - before.get(name, 0)) for name in projected.keys() | before.keys())
    assert error <= 1e-7, ('Source export projection does not match reviewed pre-MCP bone weights', error)
    for name in before.keys() | after.keys():
        if not mcp(name):
            assert before.get(name, 0) == after.get(name, 0), 'Source non-MCP weights are protected'
    source_mass = sum(weight for name, weight in original.items() if mcp(name))
    before_mass = sum(weight for name, weight in before.items() if mcp(name))
    after_mass = sum(weight for name, weight in after.items() if mcp(name))
    assert source_mass > 0 and after_mass > 0 and abs(before_mass - after_mass) <= 1e-7
    result = {name: weight for name, weight in original.items() if not mcp(name)}
    result.update({name: source_mass * weight / after_mass
                   for name, weight in after.items() if mcp(name) and weight > 0})
    assert all(result.get(name, 0) == weight for name, weight in original.items() if not mcp(name))
    assert abs(sum(weight for name, weight in result.items() if mcp(name)) - source_mass) < 1e-14
    return result, {'sourceMcpMass': source_mass, 'exportMcpMassBefore': before_mass,
                    'exportMcpMassAfter': after_mass, 'maximumProjectedExportBeforeError': error,
                    'sourceExportInfluenceCutoff': 0.0001, 'sourceExportMaximumInfluences': 4,
                    'sourceExportProjection': projected}


def sync_source(project_root):
    import bpy
    from mathutils import Vector
    from mathutils.kdtree import KDTree

    project = Path(project_root).resolve()
    folder = Path(bpy.data.filepath).resolve().parent
    assert folder.name == 'FpsHandSkinWeights_20261016', 'Use the independent source copy'
    recipe = json.loads((project / 'Model/Data_FpsHandSkinWeights.json').read_text(encoding='utf-8'))
    spec = importlib.util.spec_from_file_location('FpsHandSkinWeightsBake', project / '_blender/Script_FpsHandSkinWeightsBake.py')
    codec = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(codec)
    phases = codec.edit_phases(recipe)
    raw = (folder / 'Model_FpsHanYangHands_Basis7c727aa4.glb').read_bytes()
    # Validate both layers, the frozen v1 boundary and all MCP UV splits before
    # changing the source. A .blend export is not a substitute for byte replay.
    replayed, _ = codec.replay(raw, recipe)
    restored, _ = codec.replay(replayed, recipe, True)
    assert restored == raw
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + length])
    base = 28 + length
    source = bpy.data.objects['Mesh_FpsScanUnifiedSkin']
    points = source.data.shape_keys.key_blocks['Basis'].data if source.data.shape_keys else source.data.vertices

    def geometry_hash():
        digest = hashlib.sha256()
        blocks = [source.data.vertices] + ([key.data for key in source.data.shape_keys.key_blocks] if source.data.shape_keys else [])
        for block in blocks:
            for point in block:
                digest.update(struct.pack('<3f', *point.co))
        return digest.hexdigest()

    geometry_before = geometry_hash()
    tree = KDTree(len(points))
    for vertex in source.data.vertices:
        tree.insert(source.matrix_world @ points[vertex.index].co, vertex.index)
    tree.balance()
    normalize = codec.normalize
    groups = {normalize(group.name): group for group in source.vertex_groups}
    updates, maximum = [{}, {}], 0
    for phase, edits in enumerate(phases):
        for edit in edits:
            primitive, names = codec.edit_context(doc, edit)
            codec.validate_edit(names, edit, recipe['version'])
            accessor = doc['accessors'][primitive['attributes']['POSITION']]
            view = doc['bufferViews'][accessor['bufferView']]
            offset = base + view.get('byteOffset', 0) + accessor.get('byteOffset', 0) + edit['vertex'] * view.get('byteStride', 12)
            x, y, z = struct.unpack_from('<3f', raw, offset)
            _, index, distance = tree.find(Vector((x, -z, y)))
            assert distance < 2e-7, (edit['vertex'], index, distance, 'not an exact source position')
            maximum = max(maximum, distance)
            before = codec.weight_map(names, edit['jointsBefore'], edit['weightsBefore'])
            after = codec.weight_map(names, edit['jointsAfter'], edit['weightsAfter'])
            pairs = {} if phase else {names[old]: names[new] for old, new, weight in zip(edit['jointsBefore'], edit['jointsAfter'], edit['weightsBefore']) if weight > 0 and old != new}
            entry = {'before': before, 'after': after, 'pairs': pairs, 'eligibleNames': names}
            if index in updates[phase]:
                assert updates[phase][index] == entry, 'UV splits disagree about complete source bone weights'
            updates[phase][index] = entry

    # Preflight every source operation before modifying any Blender weight.
    # Keep the pre-phase0 rows: Top4/cutoff export and source-group merging do
    # not commute for vertices touched by both repair phases.
    indices = set(updates[0]) | set(updates[1])
    source_basis = {index: {normalize(source.vertex_groups[item.group].name): item.weight
                            for item in source.data.vertices[index].groups if item.weight > 0} for index in indices}
    planned, current = [{}, {}], {index: dict(row) for index, row in source_basis.items()}
    for phase, entries in enumerate(updates):
        for index, entry in sorted(entries.items()):
            if phase == 0:
                target = source_legacy_after(current[index], entry['pairs'])
                projected = source_export_projection(source_basis[index], entry['eligibleNames'])
                error = max(abs(projected.get(name, 0) - entry['before'].get(name, 0))
                            for name in projected.keys() | entry['before'].keys())
                assert error <= 1e-7, (index, 'Original source export differs from legacy recipe', error)
                details = {}
            else:
                target, details = source_mcp_after(current[index], entry['before'], entry['after'],
                    source_basis=source_basis[index], legacy_pairs=updates[0].get(index, {}).get('pairs', {}),
                    eligible_names=entry['eligibleNames'])
            planned[phase][index] = {'before': dict(current[index]), 'after': target, 'details': details}
            current[index] = {name: float32(weight) if re.search(r'[rl]finger[1-4]$', name) and phase == 1 else weight
                              for name, weight in target.items()}

    changes, source_vertices = [], set()
    for phase, entries in enumerate(updates):
        for index, entry in sorted(entries.items()):
            source_vertices.add(index)
            vertex = source.data.vertices[index]
            original = {normalize(source.vertex_groups[item.group].name): item.weight for item in vertex.groups if item.weight > 0}
            assert original == planned[phase][index]['before'], (index, 'Blender source state differs from preflight')
            if phase == 0:
                pairs = entry['pairs']
                assert pairs and all(old in original for old in pairs), (index, pairs, original, 'source weight mismatch')
                for old, new in pairs.items():
                    assert new in groups and old in groups
                    weight = original[old]
                    groups[old].remove([index])
                    groups[new].add([index], original.get(new, 0) + weight, 'REPLACE')
                    changes.append({'vertex': index, 'from': old, 'to': new, 'weight': weight})
            else:
                target, details = planned[phase][index]['after'], planned[phase][index]['details']
                roots = {name for name in original.keys() | target.keys() if re.search(r'[rl]finger[1-4]$', name)}
                for name in roots:
                    assert name in groups
                    if name in original:
                        groups[name].remove([index])
                    if target.get(name, 0) > 0:
                        groups[name].add([index], target[name], 'REPLACE')
                actual = {normalize(source.vertex_groups[item.group].name): item.weight for item in vertex.groups if item.weight > 0}
                assert all(actual.get(name, 0) == weight for name, weight in original.items() if name not in roots), 'Actual non-MCP source weights changed'
                actual_mass = sum(actual.get(name, 0) for name in roots)
                assert abs(actual_mass - details['sourceMcpMass']) <= 1e-7, 'Actual source MCP mass changed beyond float32 storage'
                details['actualMcpMass'] = actual_mass
                details['maximumSourceAfterFloat32Error'] = max(abs(actual.get(name, 0) - target.get(name, 0)) for name in actual.keys() | target.keys())
                changes.append({'vertex': index, 'kind': 'McpBranchContinuity', 'before': original, 'after': actual, **details})

    assert geometry_hash() == geometry_before, 'Source geometry and shape keys must remain byte-exact'
    export_vertices = len({(edit['meshIndex'], edit['primitiveIndex'], edit['vertex']) for edit in recipe['edits']})
    report = {'source': str(Path(bpy.data.filepath).resolve()), 'exportVertices': export_vertices, 'recipeEdits': len(recipe['edits']),
              'sourceVertices': len(source_vertices), 'sourcePhaseVertices': [len(entries) for entries in updates],
              'maximumExportMappingErrorM': maximum, 'changes': changes, 'geometryAndShapeKeysUnchanged': True,
              'weightValuesPreserved': recipe['version'] == 1, 'mcpPhaseNonMcpSourceWeightsPreserved': True,
              'mcpPhaseSourceMassPreserved': True, 'exactGlbReplayVerified': True}
    source['FpsHandSkinWeightsRecipe'] = 'Data_FpsHandSkinWeights.json'
    source['FpsHandSkinWeightsSourceVertices'] = len(source_vertices)
    for file in ['_blender/Script_FpsHandSkinWeightsBake.py', '_blender/Script_FpsHandSkinSourceSync.py', 'Model/Data_FpsHandSkinWeights.json']:
        name = Path(file).name
        text = bpy.data.texts.get(name) or bpy.data.texts.new(name)
        text.clear()
        text.write((project / file).read_text(encoding='utf-8'))
    (folder / 'Data_FpsHandSkinSourceSync.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath, compress=True)
    print(json.dumps({key: value for key, value in report.items() if key != 'changes'}))


if 'FPS_PROJECT_ROOT' in globals():
    sync_source(FPS_PROJECT_ROOT)
