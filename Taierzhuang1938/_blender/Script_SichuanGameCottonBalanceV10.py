"""Balance retained high cotton and cloth tape against the approved reference.

Material assignments only.  The V10 cotton image already carries the selected
age and near-reference colour; this removes part of its duplicate dark/warm
tint.  Tape receives a material-specific washed grey, retaining more dark
contact dirt than pale rubbed fibres.  This is not a scene exposure change.
"""
import hashlib
from pathlib import Path

import bpy


generator = 'SichuanGameCottonBalanceV10'
recipe = 'V1_Cloth095Neutral099098096Relief018_TapeGrey028028027Adaptive015036'


def ApplyCottonBalance(highRoot, repo):
    """Apply once to real high sources; retain original material datablocks."""
    if highRoot is None or highRoot.name != 'High_Pack_Root':
        raise RuntimeError('Pass the actual retained High_Pack_Root')
    repo = Path(repo)
    copied, reports, assignments, skipped = {}, [], [], []

    def CopyAndBalance(original):
        if original.get(generator) and original.get('CottonBalanceRecipe') == recipe:
            original.use_fake_user = True
            baseline = bpy.data.materials.get(original.get('CottonBalanceOriginalMaterial', ''))
            if baseline is not None:
                baseline.use_fake_user = True
            return original, False
        if original in copied:
            return copied[original], True
        if not original.use_nodes or original.node_tree is None:
            raise RuntimeError('Real cloth source has no node shader: ' + original.name)
        # Keep the original, including any pre-existing source-only patch tint.
        # Later Prepare SourceTint calls can safely append their labelled tint.
        original.use_fake_user = True
        material = original.copy()
        material.name = original.name + '_CottonBalance'
        material.use_fake_user = True
        material[generator] = True
        material['CottonBalanceRecipe'] = recipe
        material['CottonBalanceOriginalMaterial'] = original.name
        role = material['AtlasRegion']
        patch = bool(material.get('WearPatch', False))
        nodes, links = material.node_tree.nodes, material.node_tree.links
        shader = next((node for node in nodes if node.type == 'BSDF_PRINCIPLED'), None)
        if shader is None:
            raise RuntimeError('Real cloth source lacks a Principled shader: ' + original.name)
        edits = []
        if role == 'cloth':
            if not patch:
                # Adjust only the known V9/V10 source tint nodes.  Do not alter
                # any texture, UV scale, dirt layout, or repair-specific value.
                values, neutrals = 0, 0
                for node in nodes:
                    if node.type == 'HUE_SAT' and abs(node.inputs['Value'].default_value - .82) < .002:
                        node.inputs['Value'].default_value = .95
                        edits.append({'node': node.name, 'property': 'Value', 'old': .82, 'new': .95})
                        values += 1
                    elif node.type == 'MIX_RGB' and node.blend_type == 'MULTIPLY' and not node.inputs[2].is_linked:
                        color = node.inputs[2].default_value
                        if max(abs(color[index] - (.97, .94, .88)[index]) for index in range(3)) < .002:
                            node.inputs[2].default_value = (.99, .98, .96, 1)
                            edits.append({'node': node.name, 'property': 'Warm multiplier',
                                          'old': [.97, .94, .88], 'new': [.99, .98, .96]})
                            neutrals += 1
                if values == 0 or neutrals == 0:
                    raise RuntimeError('Expected V10 cloth tint was not found; inspect actual source: ' + original.name)
            for node in nodes:
                if node.type == 'NORMAL_MAP':
                    old = float(node.inputs['Strength'].default_value)
                    node.inputs['Strength'].default_value = .18
                    edits.append({'node': node.name, 'property': 'Normal strength', 'old': old, 'new': .18})
        elif role == 'binding':
            socket = shader.inputs['Base Color']
            if not socket.is_linked:
                raise RuntimeError('Tape must retain its actual fibre/dirt shader: ' + original.name)
            source = socket.links[0].from_socket
            luminance = nodes.new('ShaderNodeRGBToBW')
            luminance.name = 'CottonBalance_TapeOriginalLuminance'
            links.new(source, luminance.inputs['Color'])
            amount = nodes.new('ShaderNodeMapRange')
            amount.name = 'CottonBalance_TapeWashedGreyAmount'
            amount.clamp = True
            amount.inputs['From Min'].default_value = .025
            amount.inputs['From Max'].default_value = .10
            amount.inputs['To Min'].default_value = .15
            amount.inputs['To Max'].default_value = .36
            links.new(luminance.outputs[0], amount.inputs['Value'])
            washed = nodes.new('ShaderNodeMixRGB')
            washed.name = 'CottonBalance_TapeWashedGrey'
            washed.label = 'Washed grey cotton; retain original fibres and selected contact dirt'
            washed.blend_type = 'MIX'
            washed.use_clamp = False
            washed.inputs[2].default_value = (.28, .28, .27, 1)
            links.new(amount.outputs['Result'], washed.inputs[0])
            links.new(source, washed.inputs[1])
            links.new(washed.outputs[0], socket)
            edits.append({'property': 'Material-specific washed grey', 'linearColor': [.28, .28, .27],
                          'originalLinearLuminanceRange': [.025, .10],
                          'greyMixRange': [.15, .36], 'originalFibreAndDirtContribution': [.64, .85]})
        else:
            raise RuntimeError('Unexpected material role: ' + str(role))
        copied[original] = material
        reports.append({'original': original.name, 'balanced': material.name, 'role': role,
                        'repairPatchAlbedoPreserved': patch, 'originalRetainedWithFakeUser': True,
                        'imagesAndAnchorsUnchanged': True, 'edits': edits})
        return material, True

    for obj in (highRoot, *highRoot.children_recursive):
        if obj.type != 'MESH' or obj.get('GameBakeSupportGenerator'):
            continue
        for index, slot in enumerate(obj.material_slots):
            material = slot.material
            if material is None or material.get('AtlasRegion') not in ('cloth', 'binding'):
                continue
            # Separate frayed fibre/thread shaders retain their intentionally
            # darker, matte construction.  Prepare owns readable repair thread.
            if material.get('WearFiber', False):
                skipped.append({'object': obj.name, 'slot': index, 'material': material.name,
                                'reason': 'Separate fibre/thread source remains unchanged'})
                continue
            balanced, applied = CopyAndBalance(material)
            slot.material = balanced
            assignments.append({'object': obj.name, 'slot': index, 'original': material.name,
                                'material': balanced.name, 'newlyBalanced': applied})
    source = repo/'Taierzhuang1938/Model/SichuanBlanketPack/Texture_SichuanSoftOldCottonV10Base.png'
    sourceInfo = {'path': str(source), 'unchanged': True}
    if source.is_file():
        sourceInfo['sha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
    return {'generator': generator, 'recipe': recipe, 'materials': reports,
            'assignments': assignments, 'skippedFibreShaders': skipped, 'cottonInput': sourceInfo,
            'geometryChanged': False, 'originalMaterialGraphsChanged': False,
            'imagesChanged': False, 'coordinateAnchorsChanged': False,
            'scope': 'Retained high cloth/binding, including removable mat cotton retainers',
            'order': 'Before Prepare SourceTint and before AddGameBakeSupports; reruns reuse tagged materials',
            'visualVerificationRequired': True}
