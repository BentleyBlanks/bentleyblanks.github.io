"""Bind transferred low normals and export/audit the complete <=40k GLB.

Importing this module does nothing. BindAndExportLod changes only low material
assignments, canonical object names and generated output files. It never saves
a blend, rewrites the frozen Quality master, or modifies high geometry/shaders.
"""
import hashlib
import json
from pathlib import Path
import runpy
import struct
import time

import bpy


generator = 'SichuanLod40kPbrV13'
parts = ('Pack_Bundle', 'Pack_Binding', 'Pack_Jacket', 'Pack_StrawMat', 'Pack_Sandals')


def Require(condition, message):
    if not condition:
        raise RuntimeError(message)


def Evidence(path):
    path = Path(path).resolve()
    Require(path.is_file(), 'Required real evidence file is missing: ' + str(path))
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024*1024), b''):
            digest.update(chunk)
    return {'path': str(path), 'bytes': path.stat().st_size, 'sha256': digest.hexdigest()}


def Name(obj):
    return obj.get('QualityOriginalName', obj.get('SourceOriginalName',
                   obj.get('QualityExportOriginalName', obj.name.split('.')[0])))


def PartObjects(root):
    result = {}
    for role in parts:
        found = [obj for obj in root.children if obj.get('QualityPartRole', Name(obj)) == role]
        Require(len(found) == 1, 'Exactly one independent direct part root is required: ' + role)
        result[role] = [obj for obj in (found[0], *found[0].children_recursive) if obj.type == 'MESH']
        Require(result[role], 'The complete LOD has no actual meshes for ' + role)
    return result


def ReadGlb(path):
    raw = Path(path).read_bytes()
    Require(len(raw) >= 20 and struct.unpack_from('<III', raw) == (0x46546C67, 2, len(raw)), 'Invalid actual GLB header')
    document, binary, offset = None, None, 12
    while offset < len(raw):
        length, kind = struct.unpack_from('<II', raw, offset)
        offset += 8
        Require(offset+length <= len(raw), 'Actual GLB chunk exceeds the file')
        payload = raw[offset:offset+length]
        if kind == 0x4E4F534A:
            document = json.loads(payload.decode('utf-8').rstrip(' \x00'))
        elif kind == 0x004E4942:
            binary = payload
        offset += length
    Require(document is not None and binary is not None, 'Actual GLB lacks JSON or binary data')
    return document, binary


def ImageHeader(raw):
    if raw[:8] == b'\x89PNG\r\n\x1a\n':
        Require(len(raw) >= 26, 'Truncated actual PNG image')
        width, height = struct.unpack_from('>II', raw, 16)
        return 'image/png', '.png', width, height
    Require(raw[:4] == b'RIFF' and raw[8:12] == b'WEBP', 'Only actual PNG/WebP PBR payloads are supported')
    offset = 12
    while offset+8 <= len(raw):
        kind, length = raw[offset:offset+4], struct.unpack_from('<I', raw, offset+4)[0]
        payload = raw[offset+8:offset+8+length]
        Require(len(payload) == length, 'Truncated actual WebP image chunk')
        if kind == b'VP8X' and len(payload) >= 10:
            return 'image/webp', '.webp', 1+int.from_bytes(payload[4:7], 'little'), 1+int.from_bytes(payload[7:10], 'little')
        if kind == b'VP8L' and len(payload) >= 5 and payload[0] == 0x2f:
            packed = int.from_bytes(payload[1:5], 'little')
            return 'image/webp', '.webp', 1+(packed & 0x3fff), 1+((packed >> 14) & 0x3fff)
        if kind == b'VP8 ' and len(payload) >= 10 and payload[3:6] == b'\x9d\x01\x2a':
            return 'image/webp', '.webp', struct.unpack_from('<H', payload, 6)[0] & 0x3fff, struct.unpack_from('<H', payload, 8)[0] & 0x3fff
        offset += 8+length+(length & 1)
    raise RuntimeError('The actual WebP payload has no supported dimensions header')


def AuditAndExtractGlb(path, expected, outputDir):
    document, binary = ReadGlb(path)
    roots = document['scenes'][document.get('scene', 0)]['nodes']
    Require(len(roots) == 1 and document['nodes'][roots[0]].get('name') == 'Pack_Root', 'Export only the canonical low Pack_Root')
    root = document['nodes'][roots[0]]
    identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    Require(root.get('translation', [0, 0, 0]) == [0, 0, 0] and root.get('rotation', [0, 0, 0, 1]) == [0, 0, 0, 1]
            and root.get('scale', [1, 1, 1]) == [1, 1, 1] and root.get('matrix', identity) == identity,
            'The actual GLB lost the identity back-centre pivot')
    childNames = [document['nodes'][index].get('name') for index in root.get('children', [])]
    Require(all(childNames.count(role) == 1 for role in parts), 'The actual GLB lost an independent optional part')
    Require(not document.get('animations'), 'The static LOD must not export animations')
    counts, objects, uses, seen, atlasImages, imageRoles = {role: 0 for role in parts}, {}, [], set(), {}, {}
    def ImageInfo(textureInfo, role, channel):
        Require(textureInfo and textureInfo.get('texCoord', 0) == 0, 'A real PBR texture must use TEXCOORD_0')
        texture = document['textures'][textureInfo['index']]
        imageIndex = texture.get('source', texture.get('extensions', {}).get('EXT_texture_webp', {}).get('source'))
        Require(isinstance(imageIndex, int), 'A real PBR slot lacks its actual PNG/WebP image')
        previousRole = imageRoles.setdefault(imageIndex, (role, channel))
        Require(previousRole == (role, channel), 'A PBR image is shared across different part/channel roles')
        key = (role, channel)
        image = document['images'][imageIndex]
        Require('bufferView' in image, 'Raw LOD images must be embedded in the GLB')
        view = document['bufferViews'][image['bufferView']]
        Require(view.get('buffer', 0) == 0, 'An actual image buffer is outside the embedded binary')
        start = view.get('byteOffset', 0)
        payload = binary[start:start+view['byteLength']]
        Require(len(payload) == view['byteLength'], 'An actual image view exceeds the binary chunk')
        mime, extension, width, height = ImageHeader(payload)
        Require(image.get('mimeType', mime) == mime and (width, height) == (4096, 4096), 'Actual PBR MIME/resolution differs from the 4K requirement')
        digest = hashlib.sha256(payload).hexdigest()
        if key in atlasImages:
            Require(atlasImages[key]['imageIndex'] == imageIndex and atlasImages[key]['sha256'] == digest,
                    'A part uses multiple incompatible atlases for one PBR channel')
            return atlasImages[key]
        output = outputDir/('Texture_Lod40kV13_'+role+'_'+channel+extension)
        output.write_bytes(payload)
        record = {**Evidence(output), 'image': image.get('name'), 'imageIndex': imageIndex,
                  'bufferView': image['bufferView'], 'mimeType': mime, 'width': width, 'height': height,
                  'resolution': [width, height], 'colourSpace': 'sRGB' if channel == 'Base' else 'Non-Color',
                  'extractedEmbeddedBytesUnchanged': True}
        atlasImages[key] = record
        return record
    def Walk(index, owner=None):
        Require(index not in seen, 'The actual GLB repeats a node')
        seen.add(index)
        node = document['nodes'][index]
        name = node.get('name')
        if name in parts:
            owner = name
        if 'mesh' in node:
            Require(owner in parts and not name.startswith('HighV12_'), 'A high/reference mesh leaked into the LOD export')
            objectTriangles = 0
            for primitive in document['meshes'][node['mesh']]['primitives']:
                attributes = primitive['attributes']
                Require(primitive.get('mode', 4) == 4 and all(key in attributes for key in ('POSITION', 'NORMAL', 'TEXCOORD_0', 'TANGENT')),
                        'The actual LOD primitive lost triangles, normals, UVs or tangents')
                Require(not any(key.startswith('COLOR_') for key in attributes), 'The PBR LOD must not use vertex colours')
                count = document['accessors'][primitive['indices']]['count'] if 'indices' in primitive else document['accessors'][attributes['POSITION']]['count']
                Require(count % 3 == 0, 'An actual LOD primitive has an invalid index count')
                objectTriangles += count//3
                material = document['materials'][primitive['material']]
                Require(material.get('name', '').startswith('Material_QualityPbrV12_'), 'The actual LOD material lost its standard PBR prefix')
                Require(material.get('alphaMode', 'OPAQUE') == 'OPAQUE', 'The cloth/straw LOD must remain opaque')
                pbr = material.get('pbrMetallicRoughness', {})
                base = ImageInfo(pbr.get('baseColorTexture'), owner, 'Base')
                normal = ImageInfo(material.get('normalTexture'), owner, 'Normal')
                orm = ImageInfo(pbr.get('metallicRoughnessTexture'), owner, 'Orm')
                ao = ImageInfo(material.get('occlusionTexture'), owner, 'Orm')
                Require(orm['imageIndex'] == ao['imageIndex'], 'AO and metallic/roughness must retain their actual shared ORM image')
                uses.append({'object': name, 'part': owner, 'material': material.get('name'),
                             'Base': base, 'Normal': normal, 'MetallicRoughness': orm, 'Occlusion': ao})
            Require(name not in objects, 'The canonical GLB repeats a mesh object name')
            objects[name] = {'part': owner, 'triangles': objectTriangles}
            counts[owner] += objectTriangles
        for child in node.get('children', []):
            Walk(child, owner)
    Walk(roots[0])
    Require(counts == expected and 0 < sum(counts.values()) <= 40000, 'Actual GLB triangle counts differ or exceed the 40k all-optional budget')
    Require(len(document.get('images', [])) == 15 and len(atlasImages) == 15, 'The complete LOD must contain fifteen actual 4K PBR images')
    atlases = {role: {'images': {channel: atlasImages[(role, channel)] for channel in ('Base', 'Normal', 'Orm')},
                       'packing': {'method': 'Existing baked QualityUV retained by LOD QEM; no unwrap or repack'},
                       'inheritedChannels': ['Base', 'Orm/AO'],
                       'channelsActuallyBaked': ['High world-normal field then low tangent Normal']}
               for role in parts}
    return {'totalTriangles': sum(counts.values()), 'byPart': counts, 'triangleLimit': 40000,
            'resolution': 4096, 'materials': uses, 'objects': objects, 'standardPbrChannelsPresent': True,
            'partialProbe': False, 'upAxis': '+Y', 'root': 'Pack_Root', 'rootPivotIdentity': True,
            'uvPerTrianglePixelGate': False, 'nativeGraphEquivalentClaim': False}, atlases


def NormalAncestors(material):
    shader = next((node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED'), None)
    Require(shader is not None and shader.inputs['Normal'].is_linked, 'The imported PBR material lacks its actual Normal branch')
    nodes, pending = set(), [link.from_node for link in shader.inputs['Normal'].links]
    while pending:
        node = pending.pop()
        if node in nodes:
            continue
        nodes.add(node)
        pending.extend(link.from_node for socket in node.inputs for link in socket.links)
    textures = [node for node in nodes if node.type == 'TEX_IMAGE' and node.image is not None]
    maps = [node for node in nodes if node.type == 'NORMAL_MAP']
    Require(len(textures) == 1 and len(maps) == 1, 'Expected one real imported tangent Normal texture/map branch')
    return textures[0], maps[0]


def NonNormalImages(material):
    texture, _ = NormalAncestors(material)
    return {node.name: {'image': node.image.name, 'pointer': int(node.image.as_pointer())}
            for node in material.node_tree.nodes if node.type == 'TEX_IMAGE' and node != texture and node.image is not None}


def FrozenSourceEvidence(reductionReport, repo):
    supplied = reductionReport.get('sourceBlend')
    if supplied is None:
        record = Path(repo)/'tmp/SichuanBlanketPack/QualityV12/PbrFinal/Data_QualityPbrBakeV12.json'
        Require(record.is_file(), 'Supply frozen Quality master evidence or retain its actual V12 bake record')
        supplied = json.loads(record.read_text(encoding='utf-8-sig'))['sourceBlend']
    Require(isinstance(supplied, dict) and 'path' in supplied, 'A real frozen Quality master evidence object is required')
    actual = Evidence(supplied['path'])
    Require(actual['bytes'] == supplied['bytes'] and actual['sha256'] == supplied['sha256'], 'The frozen Quality master differs from its saved evidence')
    return actual


def BindAndExportLod(highRoot, lowRoot, normalReport, reductionReport, outputDir, repo, geometryReportFile=None):
    started = time.time()
    repo, outputDir = Path(repo), Path(outputDir).resolve()
    outputDir.mkdir(parents=True, exist_ok=True)
    Require(highRoot != lowRoot and Name(highRoot) == Name(lowRoot) == 'Pack_Root', 'Pass separate co-located high and low roots')
    Require(normalReport.get('partialProbe') is False and set(normalReport.get('normalMaps', {})) == set(parts), 'Complete five-part actual Normal transfer is required')
    Require(normalReport.get('resolution') == [4096, 4096], 'Transferred Normal maps must be actual 4K images')
    Require(reductionReport.get('readyForNormalTransfer') is True, 'Resolve actual low geometry/UV audit failures before final binding')
    sourceBefore = FrozenSourceEvidence(reductionReport, repo)
    highRuntime = Evidence(reductionReport['highRuntimeSource']['path'])
    Require(highRuntime['bytes'] == reductionReport['highRuntimeSource']['bytes'] and highRuntime['sha256'] == reductionReport['highRuntimeSource']['sha256'], 'The actual high runtime source GLB changed')
    helper = runpy.run_path(str(repo/'Taierzhuang1938/_blender/Script_SichuanQualityNormalTransferV13.py'))
    meshEvidence, materialEvidence = helper['MeshEvidence'], helper['MaterialEvidence']
    highParts, lowParts = PartObjects(highRoot), PartObjects(lowRoot)
    highObjects, lowObjects = [highRoot, *highRoot.children_recursive], [lowRoot, *lowRoot.children_recursive]
    highMeshes = [obj for role in parts for obj in highParts[role]]
    lowMeshes = [obj for role in parts for obj in lowParts[role]]
    Require(not ({obj.data.as_pointer() for obj in highMeshes} & {obj.data.as_pointer() for obj in lowMeshes}), 'Low material assignment requires independently copied mesh datablocks')
    highStates = {obj: meshEvidence(obj.data) for obj in highMeshes}
    highMaterials = {slot.material for obj in highMeshes for slot in obj.material_slots if slot.material}
    highMaterialStates = {material: materialEvidence(material) for material in highMaterials}
    lowReport = {(row['part'], row['originalName']): row for row in normalReport['objects'] if row['kind'] == 'Low'}
    objectRows, lowStates, counts = [], {}, {role: 0 for role in parts}
    normalImages, materialCache, bindingRows = {}, {}, []
    for role in parts:
        record = normalReport['normalMaps'][role]
        actual = Evidence(record['path'])
        Require(actual['bytes'] == record['bytes'] and actual['sha256'] == record['sha256'], 'A transferred Normal file changed: '+role)
        mime, _, w, h = ImageHeader(Path(record['path']).read_bytes())
        Require((w, h) == (4096, 4096), 'A transferred Normal image is not 4K')
        image = bpy.data.images.load(str(Path(record['path']).resolve()), check_existing=True)
        image.colorspace_settings.name = 'Non-Color'
        image.name = 'Texture_QualityV13_'+role+'_Normal'
        image.pack()
        normalImages[role] = image
        for obj in lowParts[role]:
            originalName = Name(obj)
            row = lowReport.get((role, originalName))
            Require(row is not None and row['before'] == row['after'], 'A low mesh is missing its unchanged Normal-transfer evidence: '+originalName)
            state = meshEvidence(obj.data)
            Require(state == row['after'], 'The current low geometry/UV/basis changed after actual Normal transfer: '+originalName)
            lowStates[obj] = state
            counts[role] += state['triangles']
            objectRows.append({'object': originalName, 'canonicalName': originalName, 'sourceName': originalName,
                               'part': role, 'triangles': state['triangles'], 'vertices': state['vertices'],
                               'sourceGeometryAndUvs': row['before'], 'sourceGeometryAndUvsAfterBake': row['after'],
                               'sourceUv': state['activeAtlasUv'], 'exportUv': state['activeAtlasUv'], 'exportTexCoord': 0})
            for index, slot in enumerate(obj.material_slots):
                original = slot.material
                Require(original is not None, 'An actual low PBR material slot is empty')
                if original.get('LodBindingGenerator') == generator:
                    original = bpy.data.materials.get(original.get('LodBindingOriginalMaterial', ''))
                    Require(original is not None, 'The preserved original PBR material is missing on a binding rerun')
                key = (int(original.as_pointer()), role, state['activeAtlasUv'])
                if key not in materialCache:
                    material = original.copy()
                    digest = hashlib.sha256((original.name+'|'+role+'|'+state['activeAtlasUv']).encode('utf-8')).hexdigest()[:12]
                    material.name = 'Material_QualityPbrV12_Lod40kV13_'+digest
                    material.use_fake_user = False
                    beforeImages = NonNormalImages(original)
                    texture, normal = NormalAncestors(material)
                    texture.image = image
                    normal.uv_map = state['activeAtlasUv']
                    normal.inputs['Strength'].default_value = 1.0
                    Require(NonNormalImages(material) == beforeImages, 'Binding changed an inherited Base/roughness/metallic/AO image pointer')
                    material['LodBindingGenerator'] = generator
                    material['LodBindingOriginalMaterial'] = original.name
                    material['QualityPartRole'] = role
                    materialCache[key] = material
                material = materialCache[key]
                slot.link = 'DATA'
                slot.material = material
                bindingRows.append({'object': originalName, 'part': role, 'slot': index,
                                    'sourceMaterial': original.name, 'lowMaterial': material.name,
                                    'normalImage': image.name, 'inheritedImagePointers': NonNormalImages(material),
                                    'baseRoughMetalAoPointersUnchanged': True})
    Require(counts == reductionReport['partTriangles'] and 0 < sum(counts.values()) <= 40000, 'Current complete LOD differs from its actual reduction inventory')
    Require(len(objectRows) == len(reductionReport['objects']), 'A native-derived low mesh object was lost before export')
    canonical = [Name(obj) for obj in lowObjects]
    Require(len(set(canonical)) == len(canonical), 'Canonical low object names are not unique')
    renameRows = []
    for obj in highObjects:
        before = obj.name
        obj.name = 'HighV12_'+Name(obj)
        Require(obj.name == 'HighV12_'+Name(obj), 'A high reference name is occupied by another asset')
        renameRows.append({'kind': 'High', 'before': before, 'after': obj.name})
    for obj in lowObjects:
        before, desired = obj.name, Name(obj)
        occupied = bpy.data.objects.get(desired)
        Require(occupied is None or occupied == obj, 'An unrelated scene object occupies the canonical low name: '+desired)
        obj.name = desired
        Require(obj.name == desired, 'Canonical low naming failed')
        obj['QualityExportOriginalName'] = desired
        renameRows.append({'kind': 'Low', 'before': before, 'after': desired})
    bpy.context.scene['SichuanHighRoot'] = highRoot.name
    bpy.context.scene['SichuanLowRoot'] = lowRoot.name
    selected = [obj for obj in bpy.context.view_layer.objects if obj.select_get()]
    active = bpy.context.view_layer.objects.active
    visibility = [(obj, obj.hide_get(), obj.hide_viewport, obj.hide_render) for obj in lowObjects]
    exportFile = outputDir/'Model_SichuanPackLod40kV13.glb'
    try:
        bpy.ops.object.select_all(action='DESELECT')
        for obj in lowObjects:
            obj.hide_viewport = False
            obj.hide_render = False
            obj.hide_set(False)
            obj.select_set(True)
        bpy.context.view_layer.objects.active = lowRoot
        with bpy.context.temp_override(object=lowRoot, active_object=lowRoot,
                                       selected_objects=lowObjects, selected_editable_objects=lowObjects):
            result = bpy.ops.export_scene.gltf(filepath=str(exportFile), export_format='GLB', use_selection=True,
                                              export_yup=True, export_apply=False, export_normals=True,
                                              export_tangents=True, export_materials='EXPORT', export_extras=True,
                                              export_animations=False, export_cameras=False, export_lights=False,
                                              export_vertex_color='NONE', export_image_format='AUTO')
        Require('FINISHED' in result, 'Actual complete LOD GLB export did not finish')
    finally:
        bpy.ops.object.select_all(action='DESELECT')
        for obj, hidden, disabled, renderHidden in visibility:
            obj.hide_viewport = disabled
            obj.hide_render = renderHidden
            obj.hide_set(hidden)
        for obj in selected:
            if obj.name in bpy.context.view_layer.objects and not obj.hide_get():
                obj.select_set(True)
        if active is not None and active.name in bpy.context.view_layer.objects:
            bpy.context.view_layer.objects.active = active
    actualGlb, atlases = AuditAndExtractGlb(exportFile, counts, outputDir)
    Require({row['object']: row['triangles'] for row in objectRows} ==
            {name: row['triangles'] for name, row in actualGlb['objects'].items()}, 'Actual exported object inventory changed')
    for obj, state in highStates.items():
        Require(meshEvidence(obj.data) == state, 'Export modified actual high reference geometry/UV/basis')
    for material, state in highMaterialStates.items():
        Require(materialEvidence(material) == state, 'Export modified an actual high reference material graph/image binding')
    for obj, state in lowStates.items():
        Require(meshEvidence(obj.data) == state, 'Binding/export modified actual low geometry/UV/basis')
    sourceAfter = Evidence(sourceBefore['path'])
    Require(sourceAfter == sourceBefore, 'The saved frozen Quality master file changed during binding/export')
    geometryFile = Path(geometryReportFile) if geometryReportFile is not None else repo/'tmp/SichuanBlanketPack/Lod40kV13/Data_Lod40kGeometryV13.json'
    Require(geometryFile.is_file(), 'Persist the actual LOD geometry report before final export')
    savedReduction = json.loads(geometryFile.read_text(encoding='utf-8-sig'))
    Require(savedReduction.get('generator') == 'SichuanQualityLod40kV13'
            and savedReduction.get('partTriangles') == reductionReport['partTriangles']
            and {row['sourceName']: row['actualTriangles'] for row in savedReduction['objects']} ==
                {row['sourceName']: row['actualTriangles'] for row in reductionReport['objects']},
            'The persisted geometry report differs from the supplied actual reduction inventory')
    reductionEvidence = Evidence(geometryFile)
    sourceLow = Evidence(bpy.data.filepath) if bpy.data.filepath and Path(bpy.data.filepath).is_file() else None
    report = {'generator': generator, 'blenderVersion': bpy.app.version_string,
              'glb': Evidence(exportFile), 'sourceBlend': sourceBefore, 'sourceBlendBefore': sourceBefore,
              'sourceBlendAfter': sourceAfter, 'sourceHighRuntime': highRuntime, 'sourceLowBlend': sourceLow,
              'sourceLowBlendIsPreBindingWorkSnapshot': True,
              'callerMustSaveBoundLowBlendAndUpdateEvidenceBeforePackaging': True,
              'savedSourceFileUnchanged': True, 'nativeSceneSavedOrRewritten': False,
              'sourceNativeSceneSavedOrRewritten': False, 'sourceLowBlendSavedByThisFunction': False,
              'partialProbe': False, 'partSubset': list(parts), 'resolutionPerPart': [4096, 4096],
              'triangleBudget': 40000, 'geometryPolicy': 'Native Quality runtime geometry reduced by QEM and explicitly recorded native micro-fibre subsets, then export-topology Mesh.validate cleanup before Normal transfer, to <=40000 triangles; existing QualityUV/Base/ORM retained; high world-normal field transferred into the actual cleaned low tangent basis',
              'objects': objectRows, 'actualGlb': actualGlb, 'atlases': atlases,
              'reduction': reductionEvidence, 'reductionInventory': {'byPart': counts, 'objects': reductionReport['objects']},
              'normalTransferMethod': normalReport.get('method'), 'normalMaps': normalReport['normalMaps'],
              'materialBindings': bindingRows, 'objectRenames': renameRows,
              'highGeometryUvAndMaterialsUnchanged': True, 'lowGeometryUvAndBasisUnchangedDuringBindingExport': True,
              'baseRoughnessMetallicAoImagePointersUnchanged': True, 'noVertexColourFallback': True,
              'upAxis': '+Y', 'units': 'metres', 'root': 'Pack_Root',
              'nativeGraphEquivalentClaim': False, 'referenceFidelityReviewed': False,
              'finalModelApprovedByUser': False, 'seconds': time.time()-started}
    reportFile = outputDir/'Data_Lod40kPbrBakeV13.json'
    reportFile.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print('LOD40K_PBR_EXPORTED', json.dumps({'glb': str(exportFile), 'report': str(reportFile),
                                           'triangles': actualGlb['totalTriangles'], 'bytes': report['glb']['bytes']}), flush=True)
    return report
