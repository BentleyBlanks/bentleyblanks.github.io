"""Bake geometry AO on the existing HanYang ORM atlas UVs in Blender."""

import hashlib
import json
import os
from pathlib import Path
import struct

import bpy
import numpy as np


NEAR = (.005, 64)
FAR = (.014, 32)
FAR_WEIGHT = .23
SCALE = 2
FIXED = {'body', 'frontSight', 'rearSight'}


def BuildProxy(scene, name, objects, materials):
    """Build just the triangles that keep a common pose in the game."""
    vertices, faces, uv, normals, slots = [], [], [], [], []
    materialIndices = {}
    offset = 0
    for obj in objects:
        mesh = obj.data
        assert len(mesh.materials) == 1 and mesh.uv_layers.active is not None, obj.name
        material = materials[mesh.materials[0].name]
        slot = materialIndices.setdefault(material, len(materialIndices))
        matrix = np.asarray(obj.matrix_world, dtype=np.float32)
        points = np.empty((len(mesh.vertices), 3), dtype=np.float32)
        mesh.vertices.foreach_get('co', points.ravel())
        points = points @ matrix[:3, :3].T + matrix[:3, 3]
        corners = np.empty(len(mesh.loops), dtype=np.int32)
        mesh.loops.foreach_get('vertex_index', corners)
        lengths = np.empty(len(mesh.polygons), dtype=np.int32)
        mesh.polygons.foreach_get('loop_total', lengths)
        assert np.all(lengths == 3), obj.name
        polygon = corners.reshape(-1, 3)
        shading = np.empty((len(corners), 3), dtype=np.float32)
        mesh.corner_normals.foreach_get('vector', shading.ravel())
        shading = shading @ np.linalg.inv(matrix[:3, :3])
        texture = np.empty((len(corners), 2), dtype=np.float32)
        mesh.uv_layers.active.uv.foreach_get('vector', texture.ravel())

        # Match RepairHanYangWinding on the temporary triangles.
        a, b, c = points[polygon].transpose(1, 0, 2)
        side = np.cross(b - a, c - a)
        backwards = np.einsum('ij,ij->i', side, shading.reshape(-1, 3, 3).sum(axis=1)) < 0
        order = np.arange(len(corners)).reshape(-1, 3)
        order[backwards] = order[backwards][:, [0, 2, 1]]
        vertices.append(points)
        faces.append(corners[order] + offset)
        uv.append(texture[order.ravel()])
        normals.append(shading[order.ravel()])
        slots.append(np.full(len(polygon), slot, dtype=np.int32))
        offset += len(points)

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(np.concatenate(vertices).tolist(), [], np.concatenate(faces).tolist())
    for material in materialIndices:
        mesh.materials.append(material)
    mesh.polygons.foreach_set('material_index', np.concatenate(slots))
    mesh.polygons.foreach_set('use_smooth', np.ones(len(mesh.polygons), dtype=bool))
    layer = mesh.uv_layers.new(name='UVMap')
    layer.uv.foreach_set('vector', np.concatenate(uv).ravel())
    mesh.normals_split_custom_set(np.concatenate(normals).tolist())
    mesh.update()
    proxy = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(proxy)
    return proxy


def BakeMaterial(name, image):
    material = bpy.data.materials.new('AO bake ' + name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    emission = nodes.new('ShaderNodeEmission')
    mix = nodes.new('ShaderNodeMixRGB')
    mix.inputs[0].default_value = FAR_WEIGHT
    for index, (distance, samples) in enumerate((NEAR, FAR), start=1):
        ao = nodes.new('ShaderNodeAmbientOcclusion')
        ao.only_local = True
        ao.samples = samples
        ao.inputs['Distance'].default_value = distance
        links.new(ao.outputs['AO'], mix.inputs[index])
    links.new(mix.outputs['Color'], emission.inputs['Color'])
    links.new(emission.outputs['Emission'], output.inputs['Surface'])
    target = nodes.new('ShaderNodeTexImage')
    target.image = image
    nodes.active = target
    return material


def Main():
    inputPath = Path(os.environ['HANYANG_AO_INPUT']).resolve()
    output = Path(os.environ['HANYANG_AO_OUTPUT']).resolve()
    output.mkdir(parents=True, exist_ok=True)
    raw = inputPath.read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + length])
    baseHash = hashlib.sha256(raw).hexdigest()
    window = bpy.context.window
    author = window.scene
    assert author.get('gameAssetSha256') == baseHash, 'Open the packed Blender scene for the input GLB'

    groups, unbaked = {}, []
    atlasSizes = {}
    for node in doc['nodes']:
        if 'mesh' not in node:
            continue
        obj = author.objects[node['name']]
        primitive, = doc['meshes'][node['mesh']]['primitives']
        material = doc['materials'][primitive['material']]
        name = material['name']
        assert obj.data.materials[0].name == name
        role = node['extras']['hanYangRole']
        if role == 'trigger':
            # The thin strip moves independently. Its self-occlusion darkens
            # the exposed sides in the bake, so keep its live shading.
            unbaked.append(obj.name)
        else:
            groups.setdefault('fixed' if role in FIXED else role, []).append(obj)
        orm = material['pbrMetallicRoughness']['metallicRoughnessTexture']['index']
        source = doc['textures'][orm]['extensions']['EXT_texture_webp']['source']
        atlas = bpy.data.images[doc['images'][source]['name']]
        atlasSizes[name] = tuple(atlas.size)
    assert sum(len(parts) for parts in groups.values()) + len(unbaked) == 44

    scene = bpy.data.scenes.new('HanYang contact bake')
    window.scene = scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = min(8, os.cpu_count() or 4)
    scene.render.bake.margin_type = 'EXTEND'
    images, materials, proxies = {}, {}, []
    try:
        for name, (width, height) in atlasSizes.items():
            image = bpy.data.images.new('AO bake ' + name, width=width // SCALE, height=height // SCALE,
                                        alpha=False, float_buffer=True)
            image.colorspace_settings.name = 'Non-Color'
            image.generated_color = (1, 1, 1, 1)
            images[name] = image
            materials[name] = BakeMaterial(name, image)
        for group, parts in groups.items():
            proxy = BuildProxy(scene, 'AO bake ' + group, parts, materials)
            proxies.append(proxy)
            proxy.select_set(True)
            layer = bpy.context.view_layer
            layer.objects.active = proxy
            layer.update()
            print(f'Baking {group}: {len(parts)} parts', flush=True)
            result = bpy.ops.object.bake(type='EMIT', uv_layer='UVMap', margin=8,
                                         use_clear=False, use_selected_to_active=False)
            assert result == {'FINISHED'}, result
            proxy.select_set(False)
            proxy.hide_render = True

        atlasRecords = {}
        for index, row in enumerate(doc['materials']):
            image = images[row['name']]
            width, height = image.size
            pixels = np.empty((height, width, 4), dtype=np.float32)
            image.pixels.foreach_get(pixels.ravel())
            # Blender returns bottom-first rows; glTF UV0 uses top-first rows.
            visibility = np.uint8(np.round(255 * pixels[::-1, :, 0].clip(0, 1)))
            file = f'Visibility_{index:02d}.npy'
            np.save(output / file, visibility, allow_pickle=False)
            atlasRecords[row['name']] = {
                'file': file, 'bakeSize': [width, height],
                'sourceSize': list(atlasSizes[row['name']]),
                'minimum': int(visibility.min()), 'maximum': int(visibility.max()),
            }
        record = {
            'sourceSha256': baseHash, 'radiiM': [NEAR[0], FAR[0]],
            'samples': [NEAR[1], FAR[1]], 'wideWeight': FAR_WEIGHT,
            'groups': {name: [obj.name for obj in parts] for name, parts in groups.items()},
            'unbaked': unbaked, 'atlases': atlasRecords,
        }
        (output / 'Data_ContactAtlasBake.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf8')
        print(json.dumps({name: row['minimum'] for name, row in atlasRecords.items()}), flush=True)
    finally:
        window.scene = author
        for proxy in proxies:
            mesh = proxy.data
            bpy.data.objects.remove(proxy, do_unlink=True)
            bpy.data.meshes.remove(mesh)
        for material in materials.values():
            bpy.data.materials.remove(material)
        for image in images.values():
            bpy.data.images.remove(image)
        bpy.data.scenes.remove(scene)


if __name__ == '__main__':
    Main()
