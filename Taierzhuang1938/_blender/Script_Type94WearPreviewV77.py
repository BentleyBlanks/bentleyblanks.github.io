"""Reversible wear on locked V68 geometry with weighted UV island packing.

All damage placement is art direction. This recipe does not certify historical
damage, the unresolved gray trial, or final game acceptance.
"""
import bpy, hashlib, importlib.util, json, os, shutil
import numpy as np
from pathlib import Path

repo = Path(__file__).resolve().parents[2]
base = Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette')
root = Path(os.environ.get('TYPE94_WEAR_ROOT', str(base / 'SurfaceV77')))
phase = os.environ.get('TYPE94_WEAR_PHASE', 'Prepare')
assert phase in ['Prepare', 'Atlas', 'Clips', 'Apply', 'Normal', 'Verify']
assert not bpy.data.filepath, 'Use a fresh owned batch process'
folder = root / 'Textures/HighSurfaceV77Preview'
for directory in [folder, root / 'Acceptance', root / 'Exports']:
    directory.mkdir(parents=True, exist_ok=True)
destination = root / 'Scene_Type94TanketteHighSurfaceV77Preview.blend'
glb = root / 'Exports/Model_Type94TanketteHighSurfaceV77Preview.glb'


def Hash(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def Export():
    bpy.ops.object.select_all(action='DESELECT')
    asset = bpy.data.objects['Type94Tankette']
    for obj in [asset, *asset.children_recursive]:
        obj.select_set(True)
    file = repo / 'Taierzhuang1938/_blender/Script_Type94Export.py'
    spec = importlib.util.spec_from_file_location('Wear77Export', file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.ExportGltf(glb)


if phase == 'Prepare':
    manifest = json.loads((repo / 'Taierzhuang1938/Model/Type94Tankette/Data_SurfaceStudyV68.json').read_text())
    assert Hash(manifest['sourceBlend']) == manifest['sourceBlendSha256']
    assert Hash(manifest['sourceGlb']) == manifest['sha256']
    bpy.ops.wm.open_mainfile(filepath=manifest['sourceBlend'])
    scene = bpy.context.scene
    assert scene.get('BlenderMcpTask') == 'Type94Tankette'
    scene['SurfaceUvGenerationMode'] = 'RepackedV68Islands'
    records = {}
    for role in ['Paint', 'Track', 'Steel', 'Rubber']:
        tree = bpy.data.materials['Material_Type94' + role].node_tree
        for channel in ['Base', 'Orm', 'Normal']:
            image = tree.nodes['Baked ' + channel].image
            file = folder / ('Texture_Type94' + role + channel + 'Input.png')
            if image.packed_file:
                file.write_bytes(image.packed_file.data)
            else:
                shutil.copy2(bpy.path.abspath(image.filepath), file)
            records[role + channel] = dict(file=str(file), sha256=Hash(file))
    for source, name in [('Data_WearEdgesV68.json', 'Data_WearEdgesV77.json'), ('Data_WearSurfacesV68.json', 'Data_WearSurfacesV77.json')]:
        shutil.copy2(base / 'SurfaceV68/Acceptance' / source, root / 'Acceptance' / name)
    scene['SurfaceStudyRevision'] = 'SurfaceV77Preview'
    scene['WearV77Scope'] = 'Inferred selective paint loss, dark primer margins, bare steel and handling abrasion. No historical damage-position claim.'
    scene['WearV77GeometryLockedTo'] = manifest['sha256']
    report = dict(reference=manifest, inputs=records, geometryAndRigChanged=False)
    (root / 'Acceptance/Data_WearPreparationV77.json').write_text(json.dumps(report, indent=2) + '\n')
    bpy.ops.wm.save_as_mainfile(filepath=str(destination))
elif phase == 'Atlas':
    checkpoint = json.loads((root / 'Acceptance/Data_WearPreparationV77.json').read_text())['reference']
    assert Hash(checkpoint['sourceBlend']) == checkpoint['sourceBlendSha256']
    bpy.ops.wm.open_mainfile(filepath=checkpoint['sourceBlend'])
    bpy.context.scene['SurfaceStudyRevision'] = 'SurfaceV77Preview'
    bpy.context.scene['SurfaceUvGenerationMode'] = 'RepackedV68Islands'
    bpy.context.scene['SurfaceUvCheckpointScope'] = 'Positive uniform V68 island scales/translations, handling-weighted packing; measured forward UV precision recorded'
    material = bpy.data.materials['Material_Type94Paint']
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH' and material in list(o.data.materials)]
    unique = list({o.data.as_pointer(): o for o in objects}.values())
    previous = {}
    bpy.ops.object.select_all(action='DESELECT')
    for obj in unique:
        obj.select_set(True)
        mesh = obj.data
        values = np.empty(len(mesh.loops) * 2, dtype=np.float32)
        mesh.uv_layers.active.data.foreach_get('uv', values)
        previous[obj.name] = values.reshape(-1, 2).copy()
        weight = 2.15 if 'Hatch' in obj.name else 1.8 if 'VentHousing' in obj.name else 1.25 if any(x in obj.name for x in ['Hull', 'TurretYaw']) else .7
        values *= weight
        mesh.uv_layers.active.data.foreach_set('uv', values)
    bpy.context.view_layer.objects.active = unique[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=False, scale=True, margin_method='FRACTION', margin=2.5 / 4096)
    bpy.ops.object.mode_set(mode='OBJECT')
    # Preserve the old projection directions: only positive uniform island
    # scales/translations are permitted, so tangent-space normals can transfer.
    oldUv, newUv, positions = [], [], []
    edges = json.loads((base / 'SurfaceV68/Acceptance/Data_WearEdgesV68.json').read_text())
    byOwner = {}
    for edge in edges['edges']:
        byOwner.setdefault(edge['owner'], []).append(edge)
    surfaces = []
    matrixErrors, fitErrors, densities = [], [], {}
    for obj in unique:
        mesh = obj.data
        uv = mesh.uv_layers.active.data
        old = previous[obj.name]
        lookup = {}
        for face in mesh.polygons:
            loops = list(face.loop_indices)
            for a, b in zip(loops, loops[1:] + loops[:1]):
                lookup[(tuple(old[a]), tuple(old[b]))] = (a, b)
        for edge in byOwner.get(obj.name, []):
            for segment in edge['segments']:
                a, b = lookup[(tuple(segment['uvA']), tuple(segment['uvB']))]
                before = np.linalg.norm(old[a] - old[b])
                after = (uv[a].uv - uv[b].uv).length
                segment['uvA'], segment['uvB'] = list(uv[a].uv), list(uv[b].uv)
                segment['pixelsPerMetre'] = float(segment['pixelsPerMetre'] * after / max(before, 1e-15))
        mesh.calc_loop_triangles()
        for tri in mesh.loop_triangles:
            p = np.asarray([list(obj.matrix_world @ mesh.vertices[i].co) for i in tri.vertices])
            a = old[list(tri.loops)]
            b = np.asarray([list(uv[i].uv) for i in tri.loops])
            oldUv.append(a); newUv.append(b); positions.append(p)
            m = np.column_stack((a[1] - a[0], a[2] - a[0]))
            if abs(np.linalg.det(m)) > 1e-10:
                transform = np.column_stack((b[1] - b[0], b[2] - b[0])) @ np.linalg.inv(m)
                scale = np.trace(transform) / 2
                matrixErrors.append(float(np.linalg.norm(transform / scale - np.eye(2))))
                before = np.asarray([a[1] - a[0], a[2] - a[0]], dtype=np.float64)
                after = np.asarray([b[1] - b[0], b[2] - b[0]], dtype=np.float64)
                fittedScale = np.sum(before * after) / np.sum(before * before)
                assert fittedScale > 0
                fitErrors.append(float(np.max(abs(after - before * fittedScale))))
            area = np.linalg.norm(np.cross(p[1] - p[0], p[2] - p[0])) / 2
            if area > .00012:
                density = 4096 * np.sqrt(abs(np.linalg.det(np.column_stack((b[1] - b[0], b[2] - b[0])))) / max(area * 2, 1e-15))
                densities.setdefault(obj.name, []).append(float(density))
                surfaces.append(dict(owner=obj.name, pointsWorldM=p.tolist(), uv=b.tolist(), exposure=float(mesh.attributes['WearZone'].data[tri.polygon_index].value)))
    # Inverting a near-degenerate sliver's UV matrix amplifies float32
    # quantization. Test the actual forward UV sites instead (less than .004px).
    assert max(fitErrors) < 8e-7, 'Atlas repack rotated or distorted a source projection'
    np.savez_compressed(root / 'Acceptance/Data_AtlasTransferV77.npz', oldUv=np.asarray(oldUv, dtype=np.float32), newUv=np.asarray(newUv, dtype=np.float32), positions=np.asarray(positions, dtype=np.float32))
    (root / 'Acceptance/Data_WearEdgesV77.json').write_text(json.dumps(edges) + '\n')
    original = json.loads((base / 'SurfaceV68/Acceptance/Data_WearSurfacesV68.json').read_text())
    original['paintTriangles'] = surfaces
    (root / 'Acceptance/Data_WearSurfacesV77.json').write_text(json.dumps(original) + '\n')
    report = dict(rotated=False, distorted=False, maxNormalizedSliverUvMatrixError=max(matrixErrors), maxForwardUniformScaleFitErrorUv=max(fitErrors), maxForwardUniformScaleFitErrorPixels=max(fitErrors)*4096, densities={k: dict(min=min(v), median=float(np.median(v)), max=max(v)) for k, v in densities.items()}, marginPixels=2.5, handlingUvAreaWeighted=True)
    (root / 'Acceptance/Data_WearAtlasV77.json').write_text(json.dumps(report, indent=2) + '\n')
    bpy.context.scene['WearV77AtlasRepacked'] = True
    bpy.ops.wm.save_as_mainfile(filepath=str(destination))
    print(json.dumps(report), flush=True)
elif phase == 'Clips':
    # Clip each edge mark to its own actual adjacent face. Enlarged masks must
    # never spill across an atlas seam onto an unrelated neighbouring island.
    bpy.ops.wm.open_mainfile(filepath=str(destination))
    file = root / 'Acceptance/Data_WearEdgesV77.json'
    data = json.loads(file.read_text())
    owners = {}
    for edge in data['edges']:
        owners.setdefault(edge['owner'], []).append(edge)
    count = 0
    for owner, entries in owners.items():
        mesh = bpy.data.objects[owner].data
        uv = mesh.uv_layers.active.data
        mesh.calc_loop_triangles()
        byFace = {}
        for tri in mesh.loop_triangles:
            byFace.setdefault(tri.polygon_index, []).append([list(uv[i].uv) for i in tri.loops])
        byEdge = {}
        for face in mesh.polygons:
            loops = list(face.loop_indices)
            for a, b in zip(loops, loops[1:] + loops[:1]):
                byEdge[(tuple(uv[a].uv), tuple(uv[b].uv))] = face.index
        for edge in entries:
            for segment in edge['segments']:
                face = byEdge[(tuple(segment['uvA']), tuple(segment['uvB']))]
                segment['clipUvTriangles'] = byFace[face]
                count += 1
    data['actualAdjacentFaceClipSegments'] = count
    file.write_text(json.dumps(data) + '\n')
    print(json.dumps(dict(actualAdjacentFaceClipSegments=count)), flush=True)
elif phase in ['Apply', 'Normal']:
    bpy.ops.wm.open_mainfile(filepath=str(destination))
    scene = bpy.context.scene
    assert scene.get('BlenderMcpTask') == 'Type94Tankette'
    assert scene.get('WearV77AtlasRepacked')
    scene['SurfaceUvGenerationMode'] = 'RepackedV68Islands'
    scene['SurfaceUvCheckpointScope'] = 'V68 projection directions retained; handling-weighted island packing with measured positive uniform transforms'
    tree = bpy.data.materials['Material_Type94Paint'].node_tree
    frame = tree.nodes.get('Editable V77 selective wear') or tree.nodes.new('NodeFrame')
    frame.name = 'Editable V77 selective wear'
    frame.label = 'Art-directed metric paint chips / primer / handling abrasion'
    if phase == 'Apply':
        report = json.loads((root / 'Acceptance/Data_WearBakeV77.json').read_text())
        for role in ['Paint']:
            nodes = bpy.data.materials['Material_Type94' + role].node_tree.nodes
            for channel in ['Base', 'Orm']:
                old = nodes['Baked ' + channel].image
                image = bpy.data.images.load(report['outputs'][role + channel]['file'], check_existing=False)
                image.colorspace_settings.name = old.colorspace_settings.name
                image.pack()
                for node in nodes:
                    if node.type == 'TEX_IMAGE' and node.image == old:
                        node.image = image
        for label, file in report['masks'].items():
            node = tree.nodes.get('Editable wear77 ' + label) or tree.nodes.new('ShaderNodeTexImage')
            node.name = 'Editable wear77 ' + label
            node.image = bpy.data.images.load(file, check_existing=False)
            node.image.colorspace_settings.name = 'Non-Color'
            node.image.pack()
            node.parent = frame
        # Preserve the earlier runtime normal as a readable source input.
        node = tree.nodes.get('Editable wear77 underlying V68 normal')
        if node is None:
            node = tree.nodes.new('ShaderNodeTexImage')
            node.name = 'Editable wear77 underlying V68 normal'
            node.image = bpy.data.images.load(str(folder / 'Texture_Type94PaintNormalInput.png'), check_existing=False)
            node.image.colorspace_settings.name = 'Non-Color'
            node.image.pack()
        node.parent = frame
        bpy.ops.wm.save_as_mainfile(filepath=str(destination))
    else:
        # Height composition is evaluated in the metric atlas by the raster
        # recipe; the runtime graph uses that packed tangent normal directly.
        image = bpy.data.images.load(str(folder / 'Texture_Type94PaintNormalWear77.png'), check_existing=False)
        image.colorspace_settings.name = 'Non-Color'
        image.pack()
        tree.nodes['Baked Normal'].image = image
        finalNormal = tree.nodes['Tangent normal, OpenGL +Y']
        finalNormal.inputs['Strength'].default_value = 1
        shader = tree.nodes['Physical Paint']
        tree.links.new(finalNormal.outputs['Normal'], shader.inputs['Normal'])
        tree.links.new(finalNormal.outputs['Normal'], shader.inputs['Coat Normal'])
        scene['WearV77NormalReliefApplied'] = True
        bpy.ops.wm.save_as_mainfile(filepath=str(destination))
        # Export the persisted source, including Blender's saved loop state,
        # rather than the current edit-time tangent cache.
        bpy.ops.wm.open_mainfile(filepath=str(destination))
        Export()
        print('TYPE94_WEAR77_NORMAL_COMPLETE', flush=True)
else:
    # Reopen the actual packed source and re-export it in a fresh process.
    bpy.ops.wm.open_mainfile(filepath=str(destination))
    assert bpy.context.scene.get('WearV77NormalReliefApplied')
    assert sum(o.type == 'MESH' for o in bpy.data.objects['Type94Tankette'].children_recursive) == 237
    originalGlb = glb
    runtimeImages = []
    for role in ['Paint', 'Track', 'Steel', 'Rubber']:
        material = bpy.data.materials['Material_Type94' + role]
        assert material.node_tree.nodes.get('Editable physical surface authoring')
        for channel in ['Base', 'Orm', 'Normal']:
            image = material.node_tree.nodes['Baked ' + channel].image
            assert image.packed_file and len(image.packed_file.data) > 0
            runtimeImages.append(dict(role=role, channel=channel, size=list(image.size), packedSha256=hashlib.sha256(image.packed_file.data).hexdigest()))
    glb = root / 'Exports/Model_Type94TanketteHighSurfaceV77Reopen.glb'
    Export()
    imported = bpy.data.scenes.new('Scene_Type94WearV77ActualReimport')
    bpy.context.window_manager.windows[0].scene = imported
    bpy.ops.import_scene.gltf(filepath=str(originalGlb))
    meshes = [o for o in imported.objects if o.type == 'MESH']
    images = {node.image for o in meshes for material in o.data.materials if material and material.use_nodes for node in material.node_tree.nodes if node.type == 'TEX_IMAGE' and node.image}
    assert len(meshes) == 237 and len(images) == 12
    assert all(len([o for o in meshes if o.name.startswith('TrackLink_' + side + '_')]) == 80 for side in ['Left', 'Right'])
    from io_scene_gltf2.io.com.constants import ROUNDING_DIGIT
    report = dict(source=str(destination), sha256=Hash(destination), reexport=str(glb), reexportSha256=Hash(glb), packedSourceReopened=True, runtimeImages=runtimeImages, actualGlbReimportMeshes=len(meshes), actualGlbReimportImages=len(images), independentLinksPerSide=80, exporterTangentRoundingDigits=ROUNDING_DIGIT)
    (root / 'Acceptance/Data_SourceReopenV77.json').write_text(json.dumps(report, indent=2) + '\n')
print('TYPE94_WEAR77_' + phase.upper() + '_COMPLETE', flush=True)
