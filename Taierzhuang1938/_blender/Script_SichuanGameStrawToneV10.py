"""Warm the retained high straw and separate its actual three rim strands.

No Blender operations run at import. ApplyStrawTone follows WovenLod in the
independent game bake source. Only copied material graphs, material slots and
source-face material assignments change; the saved HighV10 stays untouched.
"""
import hashlib
import json
from pathlib import Path
import runpy

import bpy


generator = 'SichuanGameStrawToneV10'
recipe = 'V1_Warm096088070_Rim104102098_080077070_094090083'
warmMultiplier = (.96, .88, .70)
strandMultipliers = ((1.04, 1.02, .98), (.80, .77, .70), (.94, .90, .83))


def SourceName(obj):
    name = obj.get('PackSourceName', obj.name)
    return name[5:] if name.startswith('High_') else name


def FaceHash(indices):
    return hashlib.sha256(json.dumps(indices, separators=(',', ':')).encode('ascii')).hexdigest()


def ApplyStrawTone(highRoot, repo):
    """Apply non-stacking warm/strand copies to the real high source only."""
    if highRoot is None or highRoot.name != 'High_Pack_Root' or SourceName(highRoot) != 'Pack_Root':
        raise RuntimeError('Pass the actual retained High_Pack_Root, before bake supports/carriers')
    repo = Path(repo)
    objects = {SourceName(obj): obj for obj in (highRoot, *highRoot.children_recursive)}
    for name in ('Pack_StrawMat', 'Pack_Sandals', 'Pack_GrassSandal01BraidedWeave',
                 'Pack_GrassSandal02BraidedWeave'):
        if name not in objects:
            raise RuntimeError('Missing actual high straw source: ' + name)
    tubeRanges = runpy.run_path(str(repo/'Taierzhuang1938/_blender/Script_SichuanGameSandalsV10.py'))['CappedTubeRanges']
    materialCache, materialReports, objectReports, strandReports, excluded = {}, [], [], [], []
    explicitExcluded = {'Pack_MatCottonRetainers', 'Pack_ThinSandalHangingTwine'}
    wovenSourceNames = {'Pack_TrueRolledGrassSheet', 'Pack_InterlacedMatGrass',
                        'Pack_GrassSandal01Foundation', 'Pack_GrassSandal01BraidedWeave',
                        'Pack_GrassSandal02Foundation', 'Pack_GrassSandal02BraidedWeave'}

    def BeforeTone(material):
        seen = set()
        while material.get(generator):
            if material.name in seen:
                raise RuntimeError('Cyclic straw-tone material provenance: ' + material.name)
            seen.add(material.name)
            name = material.get('StrawToneOriginalMaterial', '')
            material = bpy.data.materials.get(name)
            if material is None:
                raise RuntimeError('The preserved pre-tone source material is missing: ' + name)
        return material

    def MultiplyCopy(parent, variant, multiplier):
        original = BeforeTone(parent)
        key = (parent.name, variant)
        if key in materialCache:
            return materialCache[key]
        if not parent.use_nodes or parent.node_tree is None or parent.get('AtlasRegion') != 'straw':
            raise RuntimeError('Expected a real straw Principled material: ' + parent.name)
        original.use_fake_user = True
        parent.use_fake_user = True
        existing = next((material for material in bpy.data.materials
                         if material.get(generator) and material.get('StrawToneRecipe') == recipe
                         and material.get('StrawToneParentMaterial') == parent.name
                         and material.get('StrawToneVariant') == variant), None)
        if existing is not None:
            result, reused = existing, True
        else:
            result, reused = parent.copy(), False
            digest = hashlib.sha256((parent.name+'|'+variant).encode('utf-8')).hexdigest()[:12]
            result.name = 'Material_GameStrawToneV10_' + variant + '_' + digest
            result.use_fake_user = False
            tree = result.node_tree
            shaders = [node for node in tree.nodes if node.type == 'BSDF_PRINCIPLED']
            if len(shaders) != 1:
                raise RuntimeError('Expected one source Principled shader: ' + parent.name)
            socket = shaders[0].inputs['Base Color']
            incoming = socket.links[0].from_socket if socket.is_linked else None
            value = tuple(socket.default_value)
            multiply = tree.nodes.new('ShaderNodeMixRGB')
            multiply.name = 'StrawTone_' + variant
            multiply.label = 'Weathered straw ' + variant + '; retain actual weave and dirt'
            multiply.blend_type = 'MULTIPLY'
            multiply.use_clamp = False
            multiply.inputs[0].default_value = 1
            if incoming is not None:
                tree.links.new(incoming, multiply.inputs[1])
            else:
                multiply.inputs[1].default_value = value
            multiply.inputs[2].default_value = (*multiplier, 1)
            tree.links.new(multiply.outputs['Color'], socket)
            result[generator] = True
            result['StrawToneRecipe'] = recipe
            result['StrawToneOriginalMaterial'] = original.name
            result['StrawToneParentMaterial'] = parent.name
            result['StrawToneVariant'] = variant
            result['StrawToneMultiplierLinear'] = list(multiplier)
        materialCache[key] = result
        materialReports.append({'material': result.name, 'variant': variant, 'reused': reused,
                                'parent': parent.name, 'originalBeforeTone': original.name,
                                'multiplierLinear': list(multiplier), 'atlasRegion': result.get('AtlasRegion'),
                                'originalRetainedWithFakeUser': bool(original.use_fake_user),
                                'parentRetainedWithFakeUser': bool(parent.use_fake_user),
                                'wovenTileWidthM': result.get('WovenLodTileWidthM'),
                                'wovenTileMix': result.get('WovenLodTileMix')})
        return result

    def InstallSlots(obj, replacements):
        """Preserve effective face materials while compacting repeated slots."""
        oldIndices = [int(face.material_index) for face in obj.data.polygons]
        unique, mapping = [], []
        for material in replacements:
            if material not in unique:
                unique.append(material)
            mapping.append(unique.index(material))
        if any(index >= len(mapping) for index in oldIndices):
            raise RuntimeError('The actual straw mesh references a missing material slot: ' + obj.name)
        obj.data.materials.clear()
        for material in unique:
            obj.data.materials.append(material)
        for index, material in enumerate(unique):
            obj.material_slots[index].link = 'DATA'
            obj.material_slots[index].material = material
        for face, index in zip(obj.data.polygons, oldIndices):
            face.material_index = mapping[index]
        return mapping

    def SlotFor(obj, material):
        for index, slot in enumerate(obj.material_slots):
            if slot.material == material:
                return index
        obj.data.materials.append(material)
        index = len(obj.material_slots)-1
        obj.material_slots[index].link = 'DATA'
        obj.material_slots[index].material = material
        return index

    for partName in ('Pack_StrawMat', 'Pack_Sandals'):
        for obj in objects[partName].children_recursive:
            if obj.type != 'MESH' or obj.get('GameBakeSupportGenerator'):
                continue
            # Prepare recreates the independently textured mat-end carrier
            # after this pass. A rerun must not warm or report the previous
            # carrier's slots, which would immediately be replaced again.
            if obj.get('MatEndSourceGenerator') or obj.get('BakeOnly'):
                excluded.append({'object': obj.name, 'sourceName': SourceName(obj),
                                 'reason': 'Independent bake-only image carrier retains its own material',
                                 'matEndSourceGenerator': obj.get('MatEndSourceGenerator')})
                continue
            if SourceName(obj) in explicitExcluded:
                excluded.append({'object': obj.name, 'sourceName': SourceName(obj),
                                 'reason': 'Cotton retainer/hanging twine excluded from straw tint'})
                continue
            effective = [slot.material for slot in obj.material_slots]
            if not any(material is not None and material.get('AtlasRegion') == 'straw' for material in effective):
                excluded.append({'object': obj.name, 'sourceName': SourceName(obj),
                                 'reason': 'No AtlasRegion straw material'})
                continue
            if any(material is None for material in effective):
                raise RuntimeError('A real straw source contains an empty effective material slot: ' + obj.name)
            if SourceName(obj) in wovenSourceNames:
                for material in effective:
                    if material.get('AtlasRegion') == 'straw' and (
                            not material.get('SichuanWovenLodSourceV11')
                            or abs(float(material.get('WovenLodTileWidthM', 0))-.055) > 1e-7
                            or abs(float(material.get('WovenLodTileMix', 0))-.50) > 1e-7):
                        raise RuntimeError('Apply the unchanged 55 mm / 50% WovenLod recipe before StrawTone: ' + obj.name)
            slotLinks = [slot.link for slot in obj.material_slots]
            copiedSharedData = obj.data.users > 1
            if copiedSharedData:
                # Material indices belong to the mesh. A verbatim datablock
                # copy isolates assignments without changing any vertex/UV.
                obj.data = obj.data.copy()
            replacements = [MultiplyCopy(BeforeTone(material), 'Warm', warmMultiplier)
                            if material is not None and material.get('AtlasRegion') == 'straw' else material
                            for material in effective]
            mapping = InstallSlots(obj, replacements)
            obj[generator] = True
            objectReports.append({'object': obj.name, 'sourceName': SourceName(obj), 'part': partName,
                                  'inputMaterials': [material.name if material else None for material in effective],
                                  'inputSlotLinks': slotLinks, 'sourceSlotToWarmSlot': mapping,
                                  'copiedSharedMeshData': copiedSharedData})

    for number in (1, 2):
        obj = objects['Pack_GrassSandal%02dBraidedWeave' % number]
        faces = [tuple(face.vertices) for face in obj.data.polygons]
        ranges = tubeRanges(obj.data.vertices, faces, 8)
        rims = [item for item in ranges if (item[1]-item[0])//item[2] > 150]
        if len(rims) != 3 or any((stop-start)//sides != 281 for start, stop, sides in rims):
            raise RuntimeError('Expected the three actual 281-ring, eight-sided high rim strands')
        for strand, ((start, stop, sides), multiplier) in enumerate(zip(rims, strandMultipliers)):
            indices, perMaterial = [], {}
            for face in obj.data.polygons:
                inside = [start <= index < stop for index in face.vertices]
                if any(inside) and not all(inside):
                    raise RuntimeError('A source face crosses the actual rim-strand vertex range')
                if not all(inside):
                    continue
                current = obj.material_slots[face.material_index].material
                if current is None or current.get('AtlasRegion') != 'straw':
                    raise RuntimeError('The actual rim strand does not use its real straw material')
                material = MultiplyCopy(current, 'RimStrand%02d' % (strand+1), multiplier)
                face.material_index = SlotFor(obj, material)
                indices.append(face.index)
                row = perMaterial.setdefault(material.name, {'material': material.name, 'faceCount': 0,
                                        'warmedParent': current.name,
                                        'originalBeforeTone': material['StrawToneOriginalMaterial']})
                row['faceCount'] += 1
            expected = (281-1)*8+2
            if len(indices) != expected:
                raise RuntimeError('The actual high rim strand face count changed: %d != %d' % (len(indices), expected))
            strandReports.append({'sandal': number, 'sourceObject': obj.name, 'strand': strand+1,
                                  'sourceVertexRange': [start, stop], 'sourceRings': 281, 'sourceSectionSides': sides,
                                  'faceCount': len(indices), 'faceIndexSha256': FaceHash(indices),
                                  'faceIndexHashEncoding': 'SHA256 of compact JSON source polygon-index list',
                                  'faceTopologySha256': FaceHash([list(faces[index]) for index in indices]),
                                  'multiplierLinear': list(multiplier), 'materialsAtBake': list(perMaterial.values())})
        obj.data.update()

    for report in objectReports:
        obj = bpy.data.objects[report['object']]
        counts = {}
        for face in obj.data.polygons:
            counts[face.material_index] = counts.get(face.material_index, 0)+1
        report['materialsAtBake'] = [{'slot': index, 'material': slot.material.name if slot.material else None,
                                     'atlasRegion': slot.material.get('AtlasRegion') if slot.material else None,
                                     'faceCount': counts.get(index, 0)}
                                    for index, slot in enumerate(obj.material_slots)]
        report['materialNamesAtBake'] = [slot.material.name if slot.material else None
                                         for slot in obj.material_slots]
    return {'generator': generator, 'recipe': recipe, 'warmMultiplierLinear': list(warmMultiplier),
            'rimStrandMultipliersLinear': [list(value) for value in strandMultipliers],
            'materials': materialReports, 'assignments': objectReports, 'rimStrands': strandReports,
            'excluded': excluded, 'originalMaterialsRetainedWithFakeUser': True,
            'originalMaterialGraphsChanged': False, 'geometryChanged': False, 'uvsChanged': False,
            'transformsChanged': False, 'imagesChanged': False, 'runtimeTrianglesAdded': 0,
            'scope': 'Actual retained high straw materials in Mat and Sandals; only real rim-strand faces get strand contrast',
            'order': 'After WovenLod, before imagegen endcap carrier and bake-support creation',
            'wovenTileWidthM': .055, 'wovenTileMix': .50, 'wovenTileAndProjectionUnchanged': True,
            'visualVerificationRequired': True}
