"""Author a small hand-only shape key; append its Blender-baked morph to GLB.

Required globals: FPS_PROJECT_ROOT and FPS_CORRECTIVE_INPUT, or a list of
FPS_CORRECTIVE_JOBS = [{'input': ..., 'output': ..., 'outputDir': ...}, ...].
Jobs append in order, each writing a distinct review GLB; an earlier review may
also be FPS_CORRECTIVE_BASE_ASSET. FPS_CORRECTIVE_BASIS_ASSET always names the
frozen original asset, never the previous review. Open the task's copied
OneDrive source containing Mesh_FpsScanUnifiedSkin and the original armature.
FPS_CORRECTIVE_STAGE='map' only verifies the exact source/UV-split mapping and
does not create a key. Default 'bake' requires input.valid is true. Output is a
review GLB beside this .blend, never the production GLB. Runtime activation is
external: all exported default morph weights are zero.
"""
import bpy, copy, hashlib, importlib.util, json
import numpy as np
from pathlib import Path

project = Path(FPS_PROJECT_ROOT).resolve()
sourceFolder = Path(bpy.data.filepath).resolve().parent
assert sourceFolder.name == 'FpsGripConformity_20261015', 'Open this task source copy first'
stage = globals().get('FPS_CORRECTIVE_STAGE', 'bake')
assert stage in ['map', 'bake']
spec = importlib.util.spec_from_file_location('FpsGripCorrectiveCodec', project / '_blender/Script_FpsGripCorrectiveCodec.py')
codec = importlib.util.module_from_spec(spec)
spec.loader.exec_module(codec)
productionAsset = (project / 'Model/Model_FpsHanYangHands.glb').resolve()
archivedBasis = sourceFolder / 'Model_FpsHandsBeforeGripCompression.glb'
basisAsset = Path(globals().get('FPS_CORRECTIVE_BASIS_ASSET', archivedBasis)).resolve()
basisDocument, basisBinary, basisRaw = codec.ReadGlb(basisAsset)
assert hashlib.sha256(basisRaw).hexdigest() == codec.FROZEN_BASIS_SHA256, 'Basis must be the frozen original 15b1587 asset'
assetPath = Path(globals().get('FPS_CORRECTIVE_BASE_ASSET', basisAsset)).resolve()
source = bpy.data.objects['Mesh_FpsScanUnifiedSkin']
scene = bpy.data.scenes['Scene_ScannedHandRegistration']
rig = next(obj for obj in bpy.data.scenes['Scene_OriginalHandChirality'].objects if obj.type == 'ARMATURE')
priorScene = bpy.context.window.scene
idsAttribute = '_FPS_SOURCE_VERTEX'


def SourceBasis():
    vertices = source.data.shape_keys.key_blocks[0].data if source.data.shape_keys else source.data.vertices
    return np.asarray([list(vertex.co) for vertex in vertices], dtype=np.float64)


def Export(morph, path):
    temp = source.copy()
    temp.data = source.data.copy()
    temp.name = 'Mesh_FpsGripCorrectiveExport'
    scene.collection.objects.link(temp)
    assert not source.data.shape_keys or temp.data.shape_keys != source.data.shape_keys
    for attribute in list(temp.data.color_attributes):
        temp.data.color_attributes.remove(attribute)
    attribute = temp.data.attributes.get(idsAttribute) or temp.data.attributes.new(idsAttribute, 'FLOAT', 'POINT')
    attribute.data.foreach_set('value', np.arange(len(temp.data.vertices), dtype=np.float32))
    if temp.data.shape_keys:
        for key in temp.data.shape_keys.key_blocks:
            key.value = 0
    assert all(modifier.type == 'ARMATURE' for modifier in temp.modifiers), 'Review source geometry modifiers before mapping'
    for modifier in list(temp.modifiers):
        temp.modifiers.remove(modifier)
    modifier = temp.modifiers.new('Armature_ProductionContract', 'ARMATURE')
    modifier.object = rig
    poseState, rigHidden, rigViewport = rig.data.pose_position, rig.hide_get(), rig.hide_viewport
    rig.data.pose_position = 'REST'
    rig.hide_viewport = False
    temp.hide_viewport = False
    temp.hide_set(False)
    rig.hide_set(False)
    bpy.ops.object.select_all(action='DESELECT')
    temp.select_set(True); rig.select_set(True)
    bpy.context.view_layer.objects.active = temp
    try:
        bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, use_active_scene=True,
                                  export_animations=False, export_rest_position_armature=True, export_apply=False,
                                  export_attributes=True, export_materials='PLACEHOLDER', export_texcoords=True,
                                  export_normals=True, export_tangents=True, export_morph=morph,
                                  export_morph_normal=morph, export_morph_tangent=morph, export_try_sparse_sk=False)
        doc, buf, raw = codec.ReadGlb(path)
        node = next(n for n in doc['nodes'] if n.get('name') == temp.name and 'mesh' in n and 'skin' in n)
        assert len(doc['meshes'][node['mesh']]['primitives']) == 1
        return doc, buf, codec.Primitive(doc, buf, node['mesh'])
    finally:
        rig.data.pose_position = poseState
        rig.hide_viewport = rigViewport
        rig.hide_set(rigHidden)
        mesh = temp.data
        bpy.data.objects.remove(temp, do_unlink=True)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def Bake(entry, assetPath):
    inputPath = Path(entry['input']).resolve()
    job = json.loads(inputPath.read_text(encoding='utf-8'))
    name = job['name']
    assert name in codec.CORRECTIVE_CONTRACTS, 'Corrective is outside the source task whitelist'
    contract = codec.CORRECTIVE_CONTRACTS[name]
    # The original approved Zb job predates explicit weapon/side fields.
    side = job.get('side', 'l' if name == 'Grip_Zb26LeftCompression' else None)
    weapon = job.get('weapon', 'Zb26' if name == 'Grip_Zb26LeftCompression' else None)
    assert side == contract['side'] and weapon == contract['weapon'], 'Job weapon/side differs from named contract'
    limitMm = job['maxAllowedPoseDeltaMm']
    assert 0 < limitMm <= contract['maximumPoseDeltaMm']
    out = Path(entry['outputDir']).resolve()
    assert out.is_relative_to(sourceFolder), 'Review intermediates stay beside the authorized Blender source'
    out.mkdir(parents=True, exist_ok=True)
    if stage == 'bake':
        assert job.get('valid') is True, 'Corrective is not approved by its geometric checks'
        assert not job['after'].get('flippedTriangles') and not job['after'].get('newDegenerateTriangles'), 'Corrective damages triangles'
        # Zb retains its original vertex/probe/crossing gates. Dadao uses the
        # complete independent hand-solid and triangle-relation audit below;
        # its reports do not contain sampled surface-probe counts.
        if name == 'Grip_Zb26LeftCompression' or 'triangleSurfaceProbes' in job['after']:
            assert job['after'].get('insideRuntimeVertices', job['after'].get('insideUnique')) == 0
            probes = job['after']['triangleSurfaceProbes']
            assert probes['insideCount'] == 0 and probes['countOver0_1mm'] == 0, 'Triangle interiors still penetrate equipment'
            crossings = job['after']['exactTriangleCrossingAudit']['crossingPairs']
            assert crossings == 0 or crossings == [], 'Exact skin/equipment triangle crossing remains'
        independentPath = Path(job.get('independentAuditPath', inputPath.parent / 'Data_IndependentFinalAudit.json')).resolve()
        independent = json.loads(independentPath.read_text(encoding='utf-8'))
        assert independent['valid'] and not independent['errors'] and not independent['warnings'], 'Independent audit did not pass'
        assert independent['sourceSha256'] == job['sourceSha256'], 'Independent audit is for another runtime snapshot'
        if 'nonAuthoredSideChanged' in independent['lbs']:
            assert independent.get('side') == side and independent['lbs']['nonAuthoredSideChanged'] == 0
        else:
            assert name == 'Grip_Zb26LeftCompression' and independent['lbs']['nonLeftChanged'] == 0, 'Independent audit needs an authored-side isolation gate'
        assert independent['solidVertices']['insideCount'] == 0
        assert all(value == 0 for value in independent['triangleGunRelations']['counts'].values()), 'Independent triangle relation gate failed'
        assert not independent['triangles']['flipped'] and not independent['triangles']['newDegenerate']
        assert independent['lbs']['maxPoseDeltaMm'] <= limitMm + 1e-5
        assert independent['uvSplitGroups']['maximumCorrectedPoseSpreadMeters'] < 2e-6
        assert independent['uvSplitGroups']['maximumJointWeightDifference'] < 5e-5
    runtimePath = Path(job['sourceRuntime']).resolve()
    assert hashlib.sha256(runtimePath.read_bytes()).hexdigest() == job['sourceSha256'], 'Corrective runtime snapshot changed'
    pkg = json.loads(runtimePath.read_text(encoding='utf-8'))
    skin = pkg['skin'][job['meshIndex']]
    assert skin['name'] == job['meshName']
    document, binary, assetRaw = codec.ReadGlb(assetPath)
    runtime = codec.SkinPrimitive(basisDocument, basisBinary)
    codec.AssertBasisRetained(document, binary, basisDocument, basisBinary, runtime['meshIndex'])
    count = len(runtime['attributes']['POSITION'])
    assert count == job['vertexCount'] == len(skin['rest']) // 3
    assert np.max(np.abs(runtime['attributes']['POSITION'] - np.asarray(skin.get('baseRest', skin['rest'])).reshape(-1, 3))) < 2e-6
    basis = SourceBasis()
    basisHash = hashlib.sha256(basis.astype('<f4').tobytes()).hexdigest()
    exportedDoc, exportedBinary, exported = Export(False, out / 'Model_GripCorrectiveBasisMap.glb')
    mapping = codec.MatchVertices(runtime, exported)
    sourceIds = mapping['sourceIds']
    assert sourceIds.min() >= 0 and sourceIds.max() < len(basis)
    affine, _, rank, _ = np.linalg.lstsq(np.c_[basis[sourceIds], np.ones(len(sourceIds))], exported['attributes']['POSITION'], rcond=None)
    assert rank == 4
    affineError = float(np.abs(np.c_[basis[sourceIds], np.ones(len(sourceIds))] @ affine - exported['attributes']['POSITION']).max())
    assert affineError < 3e-6
    linear = affine[:3].T
    assert abs(np.linalg.det(linear)) > 1e-10
    mapReport = {'baseAsset': str(assetPath), 'assetSha256': hashlib.sha256(assetRaw).hexdigest(), 'sourceBasisSha256': basisHash,
                 'shapeName': name, 'weapon': weapon, 'side': side, 'frozenBasisAsset': str(basisAsset),
                 'runtimeVertices': count, 'sourceVertices': len(basis), 'exportedSplitVertices': len(sourceIds),
                 'maximumBasePositionError': mapping['maximumBasePositionError'], 'affineError': affineError,
                 'sourceToRuntimeLinear': linear.tolist(), 'runtimeToSource': mapping['runtimeToSource']}
    (out / 'Data_GripCorrectiveVertexMap.json').write_text(json.dumps(mapReport, separators=(',', ':')), encoding='utf-8')
    print(json.dumps({key: value for key, value in mapReport.items() if key != 'runtimeToSource'}), flush=True)
    if stage == 'bake':
        deltas = np.zeros((count, 3), dtype=np.float64)
        seen = set()
        for row in job['vertices']:
            i = row['index']
            assert 0 <= i < count and i not in seen, 'Duplicate or invalid runtime vertex'
            seen.add(i)
            assert np.max(np.abs(runtime['attributes']['POSITION'][i] - row['rest'])) < 2e-6
            deltas[i] = row['delta']
            handWeight = sum(a['weight'] for a in row['influences'] if codec.NormalizeName(a['bone']).endswith(side + 'hand') or side + 'finger' in codec.NormalizeName(a['bone']))
            assert handWeight > .95, 'Only the authored hand/fingers may be corrected'
            assert np.isfinite(deltas[i]).all() and np.linalg.norm(row['posedDeltaMeters']) <= limitMm / 1000 + 1e-8
        assigned = [[] for _ in basis]
        for i, ids in enumerate(mapping['runtimeToSource']):
            for sourceIndex in ids:
                assigned[sourceIndex].append(deltas[i])
        sourceDelta = np.zeros_like(basis)
        for i, values in enumerate(assigned):
            if values:
                values = np.asarray(values)
                assert np.max(np.abs(values - values.mean(0))) < 2e-7, 'UV split deltas disagree at source vertex ' + str(i)
                sourceDelta[i] = np.linalg.solve(linear, values.mean(0))
        if not source.data.shape_keys:
            source.shape_key_add(name='Basis')
        assert source.data.shape_keys.use_relative, 'This contract requires relative shape keys'
        key = source.data.shape_keys.key_blocks.get(name) or source.shape_key_add(name=name)
        key.relative_key = source.data.shape_keys.key_blocks[0]
        for i, vertex in enumerate(key.data):
            vertex.co = basis[i] + sourceDelta[i]
        key.value = 0
        key.slider_min, key.slider_max = 0, 1
        source[name + '_SourceRuntimeSha256'] = job['sourceSha256']
        source[name + '_MaximumPoseDisplacementMm'] = job['after']['maxPoseDeltaMm']
        source.data.update()
        morphDoc, morphBinary, morphPrimitive = Export(True, out / 'Model_GripCorrectiveSourceMorph.glb')
        morphMap = codec.MatchVertices(runtime, morphPrimitive)
        mesh = morphDoc['meshes'][morphPrimitive['meshIndex']]
        targetIndex = mesh['extras']['targetNames'].index(name)
        target = morphPrimitive['primitive']['targets'][targetIndex]
        assert set(target) == {'POSITION', 'NORMAL', 'TANGENT'}, 'Blender must export all three corrective channels'
        targets = {}
        for semantic in ['POSITION', 'NORMAL', 'TANGENT']:
            if semantic not in target:
                continue
            values = codec.Accessor(morphDoc, morphBinary, target[semantic])
            targets[semantic] = np.asarray([values[ids].mean(0) for ids in morphMap['runtimeToExport']], dtype='<f4')
        error = float(np.abs(targets['POSITION'] - deltas).max())
        assert error < 2e-6, f'Blender shape key failed to reproduce corrective POSITION delta: {error}'
        moved = np.linalg.norm(deltas, axis=1) > 1e-10
        assert np.max(np.linalg.norm(targets['POSITION'][~moved], axis=1)) < 2e-7
        # Recheck the baked source key using the exact runtime weighted LBS map.
        invWeapon = np.linalg.inv(np.asarray(pkg['weaponMatrix']).reshape(4, 4).T)
        boneWorld = {n: np.asarray(v).reshape(4, 4).T for n, v in zip(pkg['boneNames'], pkg['boneMatrices'])}
        transforms = np.asarray([invWeapon @ boneWorld[n] @ np.asarray(v).reshape(4, 4).T @ np.asarray(skin['bindMatrix']).reshape(4, 4).T for n, v in zip(skin['bones'], skin['inverseBinds'])])
        joints = np.asarray(skin['infl']).reshape(-1, 4)
        weights = np.asarray(skin['wts']).reshape(-1, 4)
        A = np.sum(transforms[joints, :3, :3] * weights[:, :, None, None], axis=1)
        bakedPose = np.einsum('nij,nj->ni', A, targets['POSITION'])
        wantedPose = np.einsum('nij,nj->ni', A, deltas)
        poseError = float(np.linalg.norm(bakedPose - wantedPose, axis=1).max())
        maximumPose = float(np.linalg.norm(bakedPose, axis=1).max())
        assert poseError < 1e-6 and maximumPose < limitMm / 1000 + 1e-6
        report = codec.AppendMorph(document, binary, runtime['meshIndex'], runtime['primitiveIndex'], name, targets, basisDocument, basisBinary)
        output = Path(entry['output']).resolve()
        assert output not in [assetPath, basisAsset, productionAsset], 'Write a review asset; root owns runtime publication'
        codec.WriteGlb(output, document, binary)
        assert hashlib.sha256(SourceBasis().astype('<f4').tobytes()).hexdigest() == basisHash, 'Blender Basis changed'
        report.update({'file': str(output), 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'shapeName': name,
                       'weapon': weapon, 'side': side, 'frozenBasisAsset': str(basisAsset), 'frozenBasisSha256': codec.FROZEN_BASIS_SHA256,
                       'baseAsset': str(assetPath), 'baseAssetSha256': hashlib.sha256(assetRaw).hexdigest(),
                       'changedRuntimeVertices': int(moved.sum()), 'changedSourceVertices': int(np.count_nonzero(np.linalg.norm(sourceDelta, axis=1))),
                       'maximumPositionDeltaError': error, 'maximumPoseErrorMeters': poseError, 'maximumPoseDeltaMm': maximumPose * 1000,
                       'sourceBasisSha256': basisHash, 'targets': list(targets), 'assetMorphDefaultWeight': 0})
        (out / 'Data_GripCorrectiveBake.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        frozenRuntime = out / ('Data_' + name + 'Runtime.json')
        frozenRuntime.write_bytes(runtimePath.read_bytes())
        frozenJob = copy.deepcopy(job)
        frozenJob['sourceRuntime'] = str(frozenRuntime)
        frozenJob['authoredFrom'] = str(inputPath)
        frozenJob['weapon'], frozenJob['side'] = weapon, side
        frozenJob['independentAuditPath'] = str(out / ('Data_' + name + 'IndependentAudit.json'))
        (out / ('Data_' + name + '.json')).write_text(json.dumps(frozenJob, indent=2), encoding='utf-8')
        Path(frozenJob['independentAuditPath']).write_bytes(independentPath.read_bytes())
        for filename in ['Script_FpsGripCorrectiveBake.py', 'Script_FpsGripCorrectiveCodec.py']:
            text = bpy.data.texts.get(filename) or bpy.data.texts.new(filename)
            text.clear(); text.write((project / '_blender' / filename).read_text(encoding='utf-8'))
        print(json.dumps(report), flush=True)
        return output
    return assetPath


entries = globals().get('FPS_CORRECTIVE_JOBS')
if entries is None:
    entries = [{'input': FPS_CORRECTIVE_INPUT}]
assert isinstance(entries, list) and entries and all(isinstance(entry, dict) for entry in entries)
entries = copy.deepcopy(entries)
assert len(entries) == 1 or 'FPS_CORRECTIVE_OUTPUT' not in globals(), 'Use independent per-job outputs for a batch'
outputs, outputDirs, names = set(), set(), set()
for entry in entries:
    name = json.loads(Path(entry['input']).read_text(encoding='utf-8'))['name']
    assert name in codec.CORRECTIVE_CONTRACTS and name not in names, 'Batch corrective names must be whitelisted and unique'
    names.add(name)
    defaultFolder = sourceFolder / 'BakeCorrective'
    if len(entries) > 1:
        defaultFolder /= name
    entry['outputDir'] = str(Path(entry.get('outputDir', defaultFolder)).resolve())
    entry['output'] = str(Path(entry.get('output', globals().get('FPS_CORRECTIVE_OUTPUT', Path(entry['outputDir']) / 'Model_FpsHanYangHandsCorrective.glb'))).resolve())
    assert entry['output'] not in outputs and entry['outputDir'] not in outputDirs, 'Each job needs independent output paths'
    outputs.add(entry['output']); outputDirs.add(entry['outputDir'])
assert str(assetPath) not in outputs and str(basisAsset) not in outputs and str(productionAsset) not in outputs
try:
    bpy.context.window.scene = scene
    if bpy.context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    if rig.name not in scene.objects:
        scene.collection.objects.link(rig)
    for entry in entries:
        assetPath = Bake(entry, assetPath)
    if stage == 'bake':
        bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath, compress=True)
finally:
    bpy.context.window.scene = priorScene
