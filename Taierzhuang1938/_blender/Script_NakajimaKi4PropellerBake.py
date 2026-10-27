"""Bake the actual propeller rigid assembly while replacing its stale atlas."""
import bpy, numpy as np, pathlib, time, hashlib

def BakePropellerAssemblyAo(root, recipe, sourceRoot, scriptPath):
    pivot=bpy.data.objects['Pivot_Propeller']
    blades=[bpy.data.objects['Propeller_Blade'+str(side)]for side in[-1,1]]
    material=blades[0].data.materials[0]
    oldImage=bpy.data.images.get('Texture_Ki4PropellerGeometryAo')
    aoSettings = recipe['ao']
    size = aoSettings['resolution']
    image = bpy.data.images.new('Temp_Ki4RebakedPropellerAo', width=size, height=size,
                                alpha=False, float_buffer=True)
    image.colorspace_settings.name = 'Non-Color'
    image.generated_color = (1, 1, 1, 1)
    pixels = np.ones(size * size * 4, dtype=np.float32)
    image.pixels.foreach_set(pixels)
    bakeMaterial = bpy.data.materials.new('Temp_Ki4PropellerAoBake')
    bakeMaterial.use_nodes = True
    nodes = bakeMaterial.node_tree.nodes
    links = bakeMaterial.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    emission = nodes.new('ShaderNodeEmission')
    ao = nodes.new('ShaderNodeAmbientOcclusion')
    ao.samples = aoSettings['nodeSamples']
    ao.inputs['Distance'].default_value = aoSettings['distanceM']
    ao.only_local = False
    links.new(ao.outputs['AO'], emission.inputs['Color'])
    links.new(emission.outputs['Emission'], output.inputs['Surface'])
    target = nodes.new('ShaderNodeTexImage')
    target.image = image
    nodes.active = target
    hide = {obj: obj.hide_render for obj in bpy.context.scene.objects}
    rigidObjects = [obj for obj in pivot.children_recursive if obj.type == 'MESH']
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = aoSettings['cpuThreads']
    for obj in scene.objects:
        if obj.type in ['MESH', 'CURVE']:
            obj.hide_render = obj not in rigidObjects
    for obj in blades:
        obj.data.materials[0] = bakeMaterial
        obj.data.uv_layers.active_index = 1
    bpy.ops.object.select_all(action='DESELECT')
    for obj in blades:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = blades[0]
    root['propellerAoPrepared'] = True
    bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot / 'Scene_NakajimaKi4AoPrepared.blend'), copy=True)
    started = time.time()
    try:
        bpy.ops.object.bake(type='EMIT', use_clear=False, use_selected_to_active=False,
                            margin=4, uv_layer='GeometryAO')
    finally:
        for obj, value in hide.items():
            obj.hide_render = value
        for obj in blades:
            obj.data.materials[0] = material
            obj.data.uv_layers.active_index = 0
            obj.data.uv_layers[0].active_render = True
        bpy.data.materials.remove(bakeMaterial)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape(size, size, 4)
    seamPath = scriptPath.with_name('Script_NakajimaKi4AoSeams.py')
    seamNamespace = {'__file__': str(seamPath)}
    exec(compile(seamPath.read_text(encoding='utf8'), str(seamPath), 'exec'), seamNamespace)
    seams = seamNamespace['StitchAoSeams'](blades, pixels, protectedStrip=0.)
    assert np.isfinite(pixels).all() and pixels[:, :, :3].min() >= 0 and pixels[:, :, :3].max() <= 1.00001
    image.pixels.foreach_set(pixels.ravel())
    image.update()
    image.file_format = 'PNG'
    image.filepath_raw = str(sourceRoot / 'Textures/Texture_Ki4PropellerGeometryAo.png')
    image.save()
    image.pack()
    aoRecord = {'state': 'ActualNewPropellerRigidGroupAoBaked', 'resolution': [size, size],
                'nodeSamples': aoSettings['nodeSamples'], 'distanceM': aoSettings['distanceM'],
                'rigidCasters': [obj.name for obj in rigidObjects], 'receivers': [obj.name for obj in blades],
                'seconds': time.time() - started, 'seams': seams,
                'meanIncludingUnusedWhite': float(pixels[:, :, 0].mean()),
                'minimum': float(pixels[:, :, 0].min()),
                'imageSha256': hashlib.sha256(image.packed_file.data).hexdigest(),
                'scope': 'Only same-pivot assembly occludes the new blades; no frozen cowl/body/ground shadows.'}
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    uv = nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'GeometryAO'
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    separate = nodes.new('ShaderNodeSeparateColor')
    links.new(uv.outputs['UV'], texture.inputs['Vector'])
    links.new(texture.outputs['Color'], separate.inputs['Color'])
    settings = next(node for node in nodes if node.type == 'GROUP' and node.node_tree
                    and node.node_tree.name == 'glTF Material Output')
    links.new(separate.outputs['Red'], settings.inputs['Occlusion'])
    material['geometryAoUv'] = 'Fresh propeller rigid-group atlas; UV1 only'

    if oldImage is not None:
        for mat in bpy.data.materials:
            if mat.use_nodes:
                for node in mat.node_tree.nodes:
                    if getattr(node,'image',None)==oldImage:node.image=image
        bpy.data.images.remove(oldImage)
    image.name='Texture_Ki4PropellerGeometryAo'
    return image,aoRecord
