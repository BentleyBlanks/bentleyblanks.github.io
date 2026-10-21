"""Transfer baked-high world normals into the actual <=40k tangent basis.

API: TransferQualityNormals(highRoot, lowRoot, outputDir, resolution=4096,
                           samples=4, partSubset=None, marginPixels=8,
                           reuseWorldReport=None)

Both roots keep the same world frame and five independently tagged parts.
QualityPartRole / QualityOriginalName match BuildQualityLod40k's contract.
The original Base/ORM, materials, UVs, meshes and transforms are never changed.
All work uses evaluated copies in a temporary scene. No selected-to-active
rays, geometry reduction, UV packing, pixel painting, or source saves occur.
The returned Normal maps must be bound by the caller after actual review.

Pass 1 samples the high material's real world-normal socket (or Geometry
Normal) via EMIT, encoding .5*N+.5. This does not assume a NORMAL/WORLD enum.
Pass 2 decodes that actual map into the copied low material's Normal input,
then self-bakes NORMAL/TANGENT using the low mesh's unchanged active UV.
With reuseWorldReport, selected parts retain the prior complete pass's real
world PNG after file/high geometry/material-binding checks. Only the CURRENT
low tangent basis is rebaked; no unchanged-low claim crosses an earlier edit.
"""
import array
import hashlib
import json
import math
from pathlib import Path
import re
import time


PARTS = ('Pack_Bundle', 'Pack_Binding', 'Pack_Jacket', 'Pack_StrawMat', 'Pack_Sandals')
GENERATOR = 'SichuanQualityNormalTransferV13'


def Require(condition, message):
    if not condition:
        raise RuntimeError(message)


def Evidence(filePath):
    filePath = Path(filePath).resolve()
    digest = hashlib.sha256()
    with filePath.open('rb') as handle:
        for block in iter(lambda: handle.read(1024*1024), b''):
            digest.update(block)
    return {'path': str(filePath), 'bytes': filePath.stat().st_size, 'sha256': digest.hexdigest()}


def WriteJson(filePath, record):
    path = Path(filePath)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(record, indent=2, allow_nan=False)+'\n', encoding='utf8')
    temporary.replace(path)


def ReuseWorldInputs(supplied, resolution, chosen):
    """Read immutable prior evidence without rewriting it or accepting a probe."""
    if supplied is None:
        return None
    if isinstance(supplied, (str, Path)):
        filePath = Path(supplied).resolve()
        report = json.loads(filePath.read_text(encoding='utf-8-sig'))
        provenance = {'reportFile': Evidence(filePath)}
    else:
        Require(isinstance(supplied, dict), 'reuseWorldReport must be a complete report dictionary or JSON path')
        report = supplied
        encoded = json.dumps(report, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf8')
        provenance = {'reportCanonicalJsonSha256': hashlib.sha256(encoded).hexdigest(),
                      'reportHashMeaning': 'UTF-8 sorted compact JSON of the supplied report dictionary'}
    Require(report.get('generator') == GENERATOR and report.get('partialProbe') is False,
            'World reuse requires the previous complete actual V13 transfer report')
    Require(report.get('resolution') == [resolution, resolution] and
            set(report.get('parts', {})) == set(PARTS), 'Reused world report must contain the complete matching-resolution five-part pass')
    Require(report.get('sourceGeometryUvAndCornerNormalsUnchanged') is True and
            report.get('originalMaterialGraphsAndImageIdsUnchanged') is True,
            'Prior world pass must have verified original source geometry, basis and material bindings')
    highRows = {}
    for row in report.get('objects', []):
        if row.get('kind') != 'High' or row.get('part') not in chosen:
            continue
        key = (row.get('part'), row.get('originalName'))
        Require(key not in highRows and key[1], 'Prior high world source identities are ambiguous')
        Require(row.get('before') and row.get('before') == row.get('after') == row.get('copyAfter'),
                'Prior high source was not unchanged through its world-field bake: '+str(key))
        highRows[key] = row
    materials = {}
    for row in report.get('materials', []):
        before = row.get('before')
        Require(before and before == row.get('after'), 'Prior original material inputs changed during world baking')
        name = before.get('name')
        Require(name and (name not in materials or materials[name] == before), 'Prior material input identity is ambiguous')
        materials[name] = before
    worlds = {}
    for role in chosen:
        Require(any(part == role for part, _ in highRows), 'Prior world pass lacks actual high objects: '+role)
        record = report['parts'][role].get('worldImage')
        Require(isinstance(record, dict) and record.get('colourSpace') == 'Non-Color' and
                record.get('width') == resolution and record.get('height') == resolution,
                'Prior world field lacks matching dimensions and Non-Color semantics: '+role)
        actual = Evidence(record['path'])
        Require(actual['bytes'] == record.get('bytes') and actual['sha256'] == record.get('sha256'),
                'The actual reusable world PNG differs from the previous pass: '+role)
        with Path(actual['path']).open('rb') as handle:
            header = handle.read(29)
        Require(len(header) == 29 and header[:8] == b'\x89PNG\r\n\x1a\n' and
                int.from_bytes(header[16:20], 'big') == resolution and
                int.from_bytes(header[20:24], 'big') == resolution and header[24] in (8, 16) and header[25] == 6,
                'Reused world image must be an actual matching RGB-alpha PNG: '+role)
        worlds[role] = {'record': record, 'actualFile': actual}
    return {'report': report, 'provenance': provenance, 'highRows': highRows,
            'materials': materials, 'worlds': worlds}


def MatrixValues(matrix):
    return [float(matrix[row][column]) for row in range(4) for column in range(4)]


def LogicalName(obj):
    for key in ('QualityOriginalName', 'SourceOriginalName', 'QualityExportOriginalName', 'PackSourceName'):
        value = obj.get(key)
        if isinstance(value, str) and value:
            return value
    return re.sub(r'\.\d{3}$', '', obj.name)


def PartRoots(root):
    result = {}
    for child in root.children:
        role = child.get('QualityPartRole')
        if role not in PARTS:
            role = LogicalName(child)
        if role in PARTS:
            Require(role not in result, 'Repeated direct normal-transfer component: '+role)
            result[role] = child
    Require(all(role in result for role in PARTS), 'Tag high and low roots with the five QualityPartRole components before normal transfer')
    return result


def PartMeshes(partRoot):
    return [obj for obj in (partRoot, *partRoot.children_recursive)
            if obj.type == 'MESH' and not obj.get('QualityExportExclude')
            and not obj.get('GameBakeSupportGenerator') and not obj.get('BakeOnly')]


def ActiveUv(mesh):
    layer = next((layer for layer in mesh.uv_layers if layer.active_render), mesh.uv_layers.active)
    Require(layer is not None, 'A real retained atlas UV is required; this helper never unwraps')
    return layer.name


def MeshEvidence(mesh):
    digest = hashlib.sha256()
    for collection, name, components, code in (
            (mesh.vertices, 'co', 3, 'f'), (mesh.loops, 'vertex_index', 1, 'i'),
            (mesh.polygons, 'loop_start', 1, 'i'), (mesh.polygons, 'loop_total', 1, 'i'),
            (mesh.polygons, 'material_index', 1, 'i')):
        values = array.array(code, [0])*(len(collection)*components)
        collection.foreach_get(name, values); digest.update(values.tobytes())
    uvHashes = {}
    for layer in mesh.uv_layers:
        values = array.array('f', [0])*(len(layer.data)*2)
        layer.data.foreach_get('uv', values)
        uvHashes[layer.name] = hashlib.sha256(values.tobytes()).hexdigest()
        digest.update(layer.name.encode('utf8')); digest.update(values.tobytes())
    normals = array.array('f', [0])*(len(mesh.loops)*3)
    mesh.corner_normals.foreach_get('vector', normals)
    return {'vertices': len(mesh.vertices), 'triangles': sum(len(face.vertices)-2 for face in mesh.polygons),
            'geometryAndUvSha256': digest.hexdigest(), 'uvLayerHashes': uvHashes,
            'cornerNormalSha256': hashlib.sha256(normals.tobytes()).hexdigest(),
            'activeAtlasUv': ActiveUv(mesh)}


def MaterialEvidence(material):
    Require(material and material.use_nodes and material.node_tree, 'A real baked-high PBR material is required')
    nodes = []
    for node in material.node_tree.nodes:
        defaults = []
        for socket in node.inputs:
            if not hasattr(socket, 'default_value'):
                continue
            value = socket.default_value
            if isinstance(value, (int, float, bool, str)):
                encoded = value
            else:
                try:
                    encoded = list(value)
                except TypeError:
                    encoded = getattr(value, 'name', str(value))
            defaults.append([socket.identifier, encoded])
        nodes.append({'name': node.name, 'type': node.bl_idname, 'inputs': defaults,
                      'image': node.image.name if node.type == 'TEX_IMAGE' and node.image else None,
                      'imageColourSpace': node.image.colorspace_settings.name if node.type == 'TEX_IMAGE' and node.image else None,
                      'uv': getattr(node, 'uv_map', None)})
    payload = {'nodes': sorted(nodes, key=lambda value: value['name']),
               'links': sorted((link.from_node.name, link.from_socket.identifier,
                                link.to_node.name, link.to_socket.identifier)
                               for link in material.node_tree.links)}
    return {'name': material.name, 'shaderGraphSha256': hashlib.sha256(json.dumps(payload, sort_keys=True).encode('utf8')).hexdigest(),
            'imageReferences': sorted({node.image.name for node in material.node_tree.nodes
                                       if node.type == 'TEX_IMAGE' and node.image})}


def Principled(material):
    shaders = [node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED']
    outputs = [node for node in material.node_tree.nodes if node.type == 'OUTPUT_MATERIAL']
    Require(len(shaders) == 1 and outputs, 'Normal transfer requires the actual single-Principled PBR graph: '+material.name)
    return shaders[0], next((node for node in outputs if node.is_active_output), outputs[0])


def HighWorldMaterial(original):
    material = original.copy(); material.name = 'Material_NormalTransferWorldV13_'+original.name
    shader, output = Principled(material); tree = material.node_tree
    socket = shader.inputs['Normal']
    if socket.is_linked:
        source = socket.links[0].from_socket
        method = 'Actual high Principled.Normal upstream, including its original tangent normal map'
    else:
        source = tree.nodes.new('ShaderNodeNewGeometry').outputs['Normal']
        method = 'Actual high smooth geometric world Normal; native Normal input unlinked'
    unit = tree.nodes.new('ShaderNodeVectorMath'); unit.operation = 'NORMALIZE'
    scale = tree.nodes.new('ShaderNodeVectorMath'); scale.operation = 'MULTIPLY'; scale.inputs[1].default_value = (.5, .5, .5)
    shift = tree.nodes.new('ShaderNodeVectorMath'); shift.operation = 'ADD'; shift.inputs[1].default_value = (.5, .5, .5)
    emission = tree.nodes.new('ShaderNodeEmission'); emission.inputs['Strength'].default_value = 1
    tree.links.new(source, unit.inputs[0]); tree.links.new(unit.outputs['Vector'], scale.inputs[0])
    tree.links.new(scale.outputs['Vector'], shift.inputs[0]); tree.links.new(shift.outputs['Vector'], emission.inputs['Color'])
    for link in list(output.inputs['Surface'].links):
        tree.links.remove(link)
    tree.links.new(emission.outputs['Emission'], output.inputs['Surface'])
    return material, method


def LowWorldInputMaterial(original, worldImage, uvName):
    material = original.copy(); material.name = 'Material_NormalTransferLowV13_'+original.name
    shader, output = Principled(material); tree = material.node_tree
    uv = tree.nodes.new('ShaderNodeUVMap'); uv.uv_map = uvName
    texture = tree.nodes.new('ShaderNodeTexImage'); texture.image = worldImage
    texture.extension = 'EXTEND'; texture.interpolation = 'Linear'
    scale = tree.nodes.new('ShaderNodeVectorMath'); scale.operation = 'MULTIPLY'; scale.inputs[1].default_value = (2, 2, 2)
    shift = tree.nodes.new('ShaderNodeVectorMath'); shift.operation = 'ADD'; shift.inputs[1].default_value = (-1, -1, -1)
    unit = tree.nodes.new('ShaderNodeVectorMath'); unit.operation = 'NORMALIZE'
    tree.links.new(uv.outputs['UV'], texture.inputs['Vector']); tree.links.new(texture.outputs['Color'], scale.inputs[0])
    tree.links.new(scale.outputs['Vector'], shift.inputs[0]); tree.links.new(shift.outputs['Vector'], unit.inputs[0])
    for link in list(shader.inputs['Normal'].links):
        tree.links.remove(link)
    tree.links.new(unit.outputs['Vector'], shader.inputs['Normal'])
    return material


def NewImage(name, resolution):
    import bpy
    import numpy as np
    image = bpy.data.images.new(name, width=resolution, height=resolution, alpha=True, float_buffer=True)
    image.colorspace_settings.name = 'Non-Color'
    values = np.empty((resolution*resolution, 4), dtype=np.float32); values[:] = (.5, .5, 1, 0)
    image.pixels.foreach_set(values.ravel()); image.update()
    return image


def ImagePixelFacts(image):
    import numpy as np
    values = np.empty(image.size[0]*image.size[1]*4, dtype=np.float32)
    image.pixels.foreach_get(values); values = values.reshape((-1, 4))
    finite = bool(np.isfinite(values).all()); mask = values[:, 3] > .5
    selected = values[mask, :3]
    facts = {'pixels': len(values), 'alphaMarkedSurfacePixels': int(mask.sum()),
             'alphaNonzeroPixels': int(np.count_nonzero(values[:, 3] > 0)), 'finite': finite,
             'rgbaMinimum': values.min(axis=0).tolist(), 'rgbaMaximum': values.max(axis=0).tolist(),
             'surfaceRgbMinimum': selected.min(axis=0).tolist() if len(selected) else None,
             'surfaceRgbMaximum': selected.max(axis=0).tolist() if len(selected) else None}
    if len(selected):
        lengths = np.linalg.norm(selected*2-1, axis=1)
        facts['decodedSurfaceNormalLengthRange'] = [float(lengths.min()), float(lengths.max())]
        facts['decodedSurfaceNormalMeanLength'] = float(lengths.mean(dtype=np.float64))
    return facts


def SaveImageEvidence(image, output, progress, progressFile, key):
    # Save raw evidence before any validity assertion, even on failure.
    image.filepath_raw = str(output); image.file_format = 'PNG'; image.save()
    facts = ImagePixelFacts(image)
    record = {**Evidence(output), 'width': image.size[0], 'height': image.size[1],
              'colourSpace': 'Non-Color', 'rawPixelFacts': facts, 'rawSavedBeforeAssertion': True}
    progress.setdefault('actualImages', {})[key] = record
    WriteJson(progressFile, progress)
    Require(facts['finite'] and facts['alphaMarkedSurfacePixels'] > 0, 'Normal-transfer image has no valid written surface; raw output/progress retained')
    return record


def LowWorldCoverage(obj, worldImage):
    """Diagnostic, never a pixel-centre gate or pixel-filling instruction."""
    import numpy as np
    mesh = obj.data; mesh.calc_loop_triangles(); layer = mesh.uv_layers.get(ActiveUv(mesh))
    uv = array.array('f', [0])*(len(layer.data)*2); layer.data.foreach_get('uv', uv)
    points = np.asarray(uv, dtype=np.float64).reshape((-1, 2))
    centres = np.asarray([points[list(triangle.loops)].mean(axis=0) for triangle in mesh.loop_triangles])
    pixels = np.empty(worldImage.size[0]*worldImage.size[1]*4, dtype=np.float32)
    worldImage.pixels.foreach_get(pixels); pixels = pixels.reshape((worldImage.size[1], worldImage.size[0], 4))
    width, height = worldImage.size
    x = np.clip(centres[:, 0]*width-.5, 0, width-1); y = np.clip(centres[:, 1]*height-.5, 0, height-1)
    a, b = x.astype(int), y.astype(int); c, d = np.minimum(a+1, width-1), np.minimum(b+1, height-1)
    tx, ty = x-a, y-b
    alpha = (pixels[b, a, 3]*(1-tx)*(1-ty)+pixels[b, c, 3]*tx*(1-ty)+
             pixels[d, a, 3]*(1-tx)*ty+pixels[d, c, 3]*tx*ty)
    return {'triangles': len(centres), 'worldAlphaBelowHalfAtLowCentroids': int(np.count_nonzero(alpha < .5)),
            'worldAlphaZeroAtLowCentroids': int(np.count_nonzero(alpha < 1e-6)),
            'purpose': 'Actual field-coverage diagnostic, including possible LoD UV boundary drift; no synthetic normal fill'}


def TransferQualityNormals(highRoot, lowRoot, outputDir, resolution=4096, samples=4,
                           partSubset=None, marginPixels=8, reuseWorldReport=None):
    import bpy
    Require(highRoot is not None and lowRoot is not None and highRoot != lowRoot, 'Pass independent high and low roots')
    chosen = set(PARTS if partSubset is None else partSubset)
    Require(chosen and chosen <= set(PARTS), 'Invalid explicit normal-transfer part subset')
    Require(resolution > 0 and samples > 0 and marginPixels >= 0, 'Invalid normal-transfer image settings')
    reuse = ReuseWorldInputs(reuseWorldReport, resolution, chosen)
    highParts, lowParts = PartRoots(highRoot), PartRoots(lowRoot)
    for role in chosen:
        a, b = MatrixValues(highParts[role].matrix_world), MatrixValues(lowParts[role].matrix_world)
        Require(max(abs(x-y) for x, y in zip(a, b)) < 1e-6, 'High and low must share the same world frame: '+role)
    outputDir = Path(outputDir).resolve(); outputDir.mkdir(parents=True, exist_ok=True)
    reportFile = outputDir/'Data_QualityNormalTransferV13.json'
    progressFile = outputDir/'Data_QualityNormalTransferProgressV13.json'
    if reuse:
        priorFile = reuse['provenance'].get('reportFile', {}).get('path')
        Require(not priorFile or Path(priorFile).resolve() != reportFile,
                'Use a separate refresh output directory; preserve the original complete world-pass report')
        for role in chosen:
            previousNormal = reuse['report'].get('normalMaps', {}).get(role, {}).get('path')
            targetNormal = outputDir/('Texture_QualityV13_'+role+'_Normal.png')
            Require(not previousNormal or Path(previousNormal).resolve() != targetNormal,
                    'Use a separate refresh output directory; never overwrite a prior normal-pass image: '+role)
    started = time.time(); sourceScene = bpy.context.scene; window = getattr(bpy.context, 'window', None)
    sourceWindowScene = window.scene if window else None
    sourceFile = bpy.data.filepath; sourceFileEvidence = Evidence(sourceFile) if sourceFile and Path(sourceFile).is_file() else None
    sourceUnsavedAtStart = bool(bpy.data.is_dirty)
    sourceActive = bpy.context.view_layer.objects.active
    Require(sourceActive is None or sourceActive.mode == 'OBJECT', 'Exit Edit/Sculpt mode before normal transfer')
    depsgraph = bpy.context.evaluated_depsgraph_get()
    ownedObjects, ownedMeshes, ownedMaterials, ownedImages = [], [], [], []
    sources, materialBefore, stageObjects = [], {}, {'High': {}, 'Low': {}}
    stage = bpy.data.scenes.new('Scene_QualityNormalTransferV13_Temporary')
    stage.render.engine = 'CYCLES'; stage.cycles.samples = samples
    stage.cycles.device = sourceScene.cycles.device
    stage.render.bake.target = 'IMAGE_TEXTURES'; stage.render.bake.use_selected_to_active = False
    stage.render.bake.use_clear = False; stage.render.bake.margin = marginPixels
    progress = {'generator': GENERATOR, 'stage': 'CloningFrozenHighAndLow', 'partSubset': sorted(chosen),
                'resolution': resolution, 'samples': samples, 'marginPixels': marginPixels,
                'selectedToActive': False, 'actualImages': {}, 'reusingWorldFields': reuse is not None,
                'reuseWorldReport': reuse['provenance'] if reuse else None}
    WriteJson(progressFile, progress)
    maps, worlds, partReports, reusedWorldFields = {}, {}, {}, {}
    try:
        # Evaluate all actual geometry before changing window scene/context.
        for kind, parts in (('High', highParts), ('Low', lowParts)):
            for role in PARTS:
                if role not in chosen:
                    continue
                stageObjects[kind][role] = []
                originals = PartMeshes(parts[role]); Require(originals, 'Missing normal-transfer source meshes: '+kind+' '+role)
                if reuse and kind == 'High':
                    expectedNames = {name for part, name in reuse['highRows'] if part == role}
                    actualNames = [LogicalName(original) for original in originals]
                    Require(len(actualNames) == len(set(actualNames)) and set(actualNames) == expectedNames,
                            'Current high world sources differ from the recorded complete object set: '+role)
                for original in originals:
                    slots = [slot.material for slot in original.material_slots]
                    Require(slots and all(slots), 'Actual normal-transfer source has an empty material slot')
                    slotEvidence = []
                    for material in slots:
                        Principled(material)
                        currentMaterial = MaterialEvidence(material)
                        materialBefore[material.as_pointer()] = (material, currentMaterial)
                        slotEvidence.append(currentMaterial)
                        if reuse and kind == 'High':
                            Require(reuse['materials'].get(material.name) == currentMaterial,
                                    'Current high material graph or image binding differs from its prior world input: '+material.name)
                    mesh = bpy.data.meshes.new_from_object(original.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
                    ownedMeshes.append(mesh); before = MeshEvidence(mesh)
                    Require(before['triangles'] > 0, 'A managed normal-transfer mesh has no real triangles')
                    prior = None
                    if reuse and kind == 'High':
                        prior = reuse['highRows'][(role, LogicalName(original))]
                        Require(before == prior['before'] and MatrixValues(original.matrix_world) == prior['matrixWorld'],
                                'High geometry, UV, corner normal or world frame differs from the recorded world field: '+original.name)
                        if 'materialSlots' in prior:
                            Require(slotEvidence == prior['materialSlots'], 'High material slot association differs from the prior world pass: '+original.name)
                    obj = bpy.data.objects.new('NormalTransferV13_'+kind+'_'+original.name, mesh)
                    stage.collection.objects.link(obj); ownedObjects.append(obj)
                    obj.matrix_world = original.matrix_world.copy()
                    ids = array.array('i', [0])*len(mesh.polygons); mesh.polygons.foreach_get('material_index', ids)
                    mesh.materials.clear()
                    for material in slots:
                        mesh.materials.append(material)
                    mesh.polygons.foreach_set('material_index', ids)
                    row = {'kind': kind, 'part': role, 'original': original, 'copy': obj, 'materials': slots,
                           'before': before, 'matrixWorld': MatrixValues(original.matrix_world), 'uv': before['activeAtlasUv'],
                           'materialSlots': slotEvidence}
                    if prior:
                        row['worldNormalSourceMethods'] = prior.get('worldNormalSourceMethods')
                        row['worldSourceReused'] = True
                    sources.append(row); stageObjects[kind][role].append(row)
        if window:
            window.scene = stage
        viewLayer = stage.view_layers[0]

        def Bake(row, image, channel):
            obj = row['copy']
            for index, originalMaterial in enumerate(row['materials']):
                if channel == 'World':
                    material, method = HighWorldMaterial(originalMaterial)
                    row.setdefault('worldNormalSourceMethods', []).append(method)
                else:
                    material = LowWorldInputMaterial(originalMaterial, worlds[role]['image'], row['uv'])
                ownedMaterials.append(material); obj.data.materials[index] = material
                target = material.node_tree.nodes.new('ShaderNodeTexImage'); target.image = image
                material.node_tree.nodes.active = target
            obj.data.uv_layers.active_index = obj.data.uv_layers.find(row['uv'])
            obj.data.uv_layers.get(row['uv']).active_render = True
            with bpy.context.temp_override(scene=stage, view_layer=viewLayer, object=obj, active_object=obj,
                    selected_objects=[obj], selected_editable_objects=[obj]):
                bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
                viewLayer.objects.active = obj
                progress.update({'stage': 'BakingWorldField' if channel == 'World' else 'BakingActualLowTangentBasis',
                                 'part': row['part'], 'object': row['original'].name, 'channel': channel,
                                 'activeUv': row['uv'], 'targetImage': image.name})
                WriteJson(progressFile, progress)
                options = {'type': 'EMIT' if channel == 'World' else 'NORMAL', 'uv_layer': row['uv'],
                           'margin': marginPixels, 'use_clear': False, 'use_selected_to_active': False}
                if channel != 'World':
                    options['normal_space'] = 'TANGENT'
                result = bpy.ops.object.bake(**options)
                Require('FINISHED' in result, 'Actual normal transfer bake did not finish')

        for role in PARTS:
            if role not in chosen:
                continue
            if reuse:
                retained = reuse['worlds'][role]
                world = bpy.data.images.load(retained['actualFile']['path'], check_existing=False)
                ownedImages.append(world); world.colorspace_settings.name = 'Non-Color'
                world.name = 'Texture_QualityV13_'+role+'_ReusedWorldNormal'
                Require(list(world.size) == [resolution, resolution] and world.channels == 4,
                        'Actual loaded reusable world image dimensions/channels are invalid: '+role)
                facts = ImagePixelFacts(world)
                Require(facts['finite'] and facts['alphaMarkedSurfacePixels'] > 0,
                        'Actual loaded reusable world PNG has no finite written surface: '+role)
                worldEvidence = retained['record']
                highRows = stageObjects['High'][role]
                reusedWorldFields[role] = {
                    **retained['actualFile'], 'width': resolution, 'height': resolution,
                    'colourSpace': 'Non-Color', 'loadedPixelFacts': facts,
                    'sourceReport': reuse['provenance'], 'highWorldRebaked': False,
                    'highGeometryUvCornerNormalsAndWorldMatricesMatched': True,
                    'recordedHighMaterialGraphsAndImageBindingsMatched': True,
                    'highMaterialSlotAssociationRecordedPreviously': all(
                        'materialSlots' in reuse['highRows'][(role, LogicalName(row['original']))] for row in highRows),
                    'materialInputEvidenceScope': 'Actual previously recorded shader graph, node defaults, image datablock identities/color spaces, UV names and links; legacy reports did not hash image pixel buffers or record per-object material slot associations',
                    'highObjects': [LogicalName(row['original']) for row in highRows]}
                progress['actualImages'][role+':World'] = dict(worldEvidence, reusedWorldField=reusedWorldFields[role])
                progress.update({'stage': 'ReusedVerifiedWorldField', 'part': role})
                WriteJson(progressFile, progress)
            else:
                world = NewImage('Texture_QualityV13_'+role+'_WorldNormal', resolution); ownedImages.append(world)
                worlds[role] = {'image': world}
                for row in stageObjects['High'][role]:
                    Bake(row, world, 'World')
                worldEvidence = SaveImageEvidence(world, outputDir/('Texture_QualityV13_'+role+'_WorldNormal.png'),
                                                  progress, progressFile, role+':World')
            worlds[role] = {'image': world}
            lowCoverage = [dict(object=row['original'].name, **LowWorldCoverage(row['copy'], world)) for row in stageObjects['Low'][role]]
            tangent = NewImage('Texture_QualityV13_'+role+'_Normal', resolution); ownedImages.append(tangent)
            for row in stageObjects['Low'][role]:
                Bake(row, tangent, 'Tangent')
            normalEvidence = SaveImageEvidence(tangent, outputDir/('Texture_QualityV13_'+role+'_Normal.png'),
                                               progress, progressFile, role+':LowTangent')
            maps[role] = normalEvidence; worlds[role] = {'evidence': worldEvidence}
            partReports[role] = {'worldImage': worldEvidence, 'lowNormal': normalEvidence, 'lowWorldFieldCoverage': lowCoverage,
                                'highTriangles': sum(row['before']['triangles'] for row in stageObjects['High'][role]),
                                'lowTrianglesBefore': sum(row['before']['triangles'] for row in stageObjects['Low'][role]),
                                'lowTrianglesAfter': sum(sum(len(face.vertices)-2 for face in row['copy'].data.polygons)
                                                         for row in stageObjects['Low'][role])}
            if reuse:
                Require(Evidence(worldEvidence['path']) == retained['actualFile'], 'Retained world PNG changed during low normal refresh: '+role)
                partReports[role]['reusedWorldField'] = reusedWorldFields[role]
            WriteJson(progressFile, dict(progress, completedParts=partReports))
            # Only owned temporary material copies reference these images.
            # Release full-resolution float buffers before the next part.
            for image in (world, tangent):
                ownedImages.remove(image); bpy.data.images.remove(image, do_unlink=True)
        for row in sources:
            row['copyAfter'] = MeshEvidence(row['copy'].data)
            Require(row['copyAfter'] == row['before'], 'Normal transfer changed temporary actual geometry/UV/basis: '+row['original'].name)
    finally:
        if window:
            window.scene = sourceWindowScene
        for obj in ownedObjects:
            bpy.data.objects.remove(obj, do_unlink=True)
        for mesh in ownedMeshes:
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
        for material in ownedMaterials:
            if material.users == 0:
                bpy.data.materials.remove(material)
        for image in ownedImages:
            if image.users == 0:
                bpy.data.images.remove(image)
        bpy.data.scenes.remove(stage)
    # Back in the unchanged source scene, independently re-evaluate both roots.
    afterDepsgraph = bpy.context.evaluated_depsgraph_get()
    evidenceRows = []
    for row in sources:
        original = row['original']; evaluated = original.evaluated_get(afterDepsgraph)
        mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=afterDepsgraph)
        try:
            after = MeshEvidence(mesh)
        finally:
            evaluated.to_mesh_clear()
        Require(after == row['before'] and MatrixValues(original.matrix_world) == row['matrixWorld'],
                'Normal transfer changed an original high/low mesh, UV, corner normal or world transform')
        evidenceRows.append({'kind': row['kind'], 'part': row['part'], 'object': original.name,
                             'originalName': LogicalName(original), 'before': row['before'], 'after': after,
                             'matrixWorld': row['matrixWorld'], 'copyAfter': row['copyAfter'],
                             'worldNormalSourceMethods': row.get('worldNormalSourceMethods'),
                             'materialSlots': row['materialSlots'],
                             'worldSourceReused': bool(row.get('worldSourceReused'))})
    materialRows = []
    for material, before in materialBefore.values():
        after = MaterialEvidence(material); Require(after == before, 'Original Base/ORM/Normal material graph or image binding changed')
        materialRows.append({'before': before, 'after': after})
    if sourceFileEvidence:
        Require(Evidence(sourceFile) == sourceFileEvidence, 'The saved source file changed during normal transfer')
    report = {'generator': GENERATOR, 'seconds': time.time()-started, 'sourceScene': sourceScene.name,
              'sourceFile': sourceFileEvidence, 'highRoot': highRoot.name, 'lowRoot': lowRoot.name,
              'sourceUnsavedChangesAtStart': sourceUnsavedAtStart,
              'resolution': [resolution, resolution], 'samples': samples, 'marginPixels': marginPixels,
              'partialProbe': chosen != set(PARTS), 'partSubset': sorted(chosen),
              'method': ('Verified retained actual high world-normal PNG, then current low self-bake NORMAL/TANGENT'
                         if reuse else 'Actual high world-normal EMIT field, then unchanged low self-bake NORMAL/TANGENT'),
              'selectedToActive': False, 'rayProjectionUsed': False, 'pixelPaintingUsed': False,
              'sourceSceneOrMaterialModified': False, 'sourceSaved': False, 'lowMaterialBindingPerformed': False,
              'highAndLowUvBytesClaimedEqual': False,
              'uvPolicy': 'Each own original atlas UV is byte-identical before/after; high/low topology may differ while sharing the same atlas layout',
              'sourceGeometryUvAndCornerNormalsUnchanged': True, 'originalMaterialGraphsAndImageIdsUnchanged': True,
              'lowUnchangedScope': 'Current evaluated low geometry/UV/corner normals before and after this invocation only; no unchanged claim across any previous mesh validation, reduction or edit',
              'priorLowUnchangedAcrossInvocationsClaimed': False,
              'highWorldRebaked': reuse is None, 'reusedWorldFields': reusedWorldFields,
              'reuseWorldReport': reuse['provenance'] if reuse else None,
              'parts': partReports, 'normalMaps': maps, 'objects': evidenceRows, 'materials': materialRows,
              'callerNextStep': 'Inspect actual low normal maps, then bind only these new Normal images to low materials. Keep Base/ORM and UV layout; re-export and verify <=40000 actual triangles.',
              'referenceFidelityReviewed': False, 'finalModelApprovedByUser': False}
    WriteJson(reportFile, report)
    WriteJson(progressFile, dict(progress, stage='Completed', report=str(reportFile), completedParts=partReports))
    print('QUALITY_NORMAL_TRANSFER_COMPLETE', json.dumps({'report': str(reportFile), 'parts': sorted(chosen),
                                                          'lowTriangles': sum(value['lowTrianglesAfter'] for value in partReports.values()),
                                                          'normalMaps': {role: value['path'] for role, value in maps.items()}}), flush=True)
    return report


TransferNormals = TransferQualityNormals
