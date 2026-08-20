# Strip textures from the CC0 C96 glb so git only keeps geometry.
import os
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(HERE, "Source", "Model_MauserC96.glb")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for image in list(bpy.data.images):
    bpy.data.images.remove(image)
for material in bpy.data.materials:
    if not material.use_nodes:
        continue
    for node in list(material.node_tree.nodes):
        if node.type == "TEX_IMAGE":
            material.node_tree.nodes.remove(node)
bpy.ops.export_scene.gltf(
    filepath=src,
    export_format="GLB",
    export_texcoords=False,
    export_normals=True,
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
    export_extras=False,
)
print("stripped", os.path.getsize(src))
