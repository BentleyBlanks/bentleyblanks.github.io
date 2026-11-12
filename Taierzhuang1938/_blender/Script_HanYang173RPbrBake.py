"""Shared Cycles PBR bake for the 173R asset revisions."""
import bpy
import bmesh
import math
import Script_HanYang173RRebakeUnwrap as unwrap


def SmoothNormals(obj):
    """Remove transferred inner-wall normals and orient the actual closed faces."""
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()
    mesh.normals_split_custom_set([(0.0, 0.0, 0.0)] * len(mesh.loops))
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.set_sharp_from_angle(angle=math.radians(38))
    mesh.update()


def BakeParts(scene, game, sources, parts, out, unwrapNames):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 16
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 8
    bake = scene.render.bake
    bake.use_selected_to_active = True
    bake.use_cage = False
    bake.cage_extrusion = .0015
    bake.max_ray_distance = .003
    bake.use_clear = True
    bake.target = "IMAGE_TEXTURES"
    bake.margin_type = "EXTEND"
    bake.normal_space = "TANGENT"
    bake.normal_r = "POS_X"
    bake.normal_g = "POS_Y"
    bake.normal_b = "POS_Z"
    report = []
    for name, resolution in parts.items():
        target = game[name]
        source = sources[name]
        for obj in scene.objects:
            obj.select_set(False)
        target.select_set(True)
        bpy.context.view_layer.objects.active = target
        triangulate = target.modifiers.new("BakeTriangles", "TRIANGULATE")
        bpy.ops.object.modifier_apply(modifier=triangulate.name)
        # Existing, correctly scaled game UVs retain the original triangle budget.
        # The band's new fitted shape gets a fresh, aspect-preserving unwrap.
        if name in unwrapNames:
            while target.data.uv_layers:
                target.data.uv_layers.remove(target.data.uv_layers[0])
            uv = target.data.uv_layers.new(name="UVMap")
            uv.active_render = True
            target.data.uv_layers.active = uv
            unwrap.Unwrap(target, sliced=True)
        assert len(target.data.uv_layers) == 1 and target.data.uv_layers.active.active_render
        measurement = unwrap.Measure(target, resolution)
        material = bpy.data.materials.new("SurfaceRepair_" + name)
        material.use_nodes = True
        texture = material.node_tree.nodes.new("ShaderNodeTexImage")
        material.node_tree.nodes.active = texture
        target.data.materials.clear()
        target.data.materials.append(material)
        originals = []
        for sourceMaterial in set(source.data.materials):
            tree = sourceMaterial.node_tree
            principled = next(node for node in tree.nodes if node.type == "BSDF_PRINCIPLED")
            output = next(node for node in tree.nodes if node.type == "OUTPUT_MATERIAL" and node.is_active_output)
            originals.append((tree, principled, output, output.inputs["Surface"].links[0].from_socket))
        source.hide_render = False
        source.select_set(True)
        bake.margin = 32 if resolution >= 4096 else 16
        for role in ["BaseColor", "ORM", "Normal"]:
            image = bpy.data.images.new("Repair_" + role, width=resolution, height=resolution, alpha=False, float_buffer=True)
            image.colorspace_settings.name = "sRGB" if role == "BaseColor" else "Non-Color"
            texture.image = image
            for tree, principled, output, original in originals:
                if role == "Normal":
                    tree.links.new(original, output.inputs["Surface"])
                    continue
                emission = tree.nodes.new("ShaderNodeEmission")
                if role == "BaseColor":
                    socket = principled.inputs["Base Color"]
                    if socket.is_linked:
                        tree.links.new(socket.links[0].from_socket, emission.inputs["Color"])
                    else:
                        emission.inputs["Color"].default_value = socket.default_value
                else:
                    combine = tree.nodes.new("ShaderNodeCombineColor")
                    combine.inputs["Red"].default_value = 1
                    for destination, inputName in [("Green", "Roughness"), ("Blue", "Metallic")]:
                        socket = principled.inputs[inputName]
                        if socket.is_linked:
                            tree.links.new(socket.links[0].from_socket, combine.inputs[destination])
                        else:
                            combine.inputs[destination].default_value = socket.default_value
                    tree.links.new(combine.outputs[0], emission.inputs["Color"])
                tree.links.new(emission.outputs[0], output.inputs["Surface"])
            bpy.ops.object.bake(type="NORMAL" if role == "Normal" else "EMIT")
            saveScene = bpy.data.scenes.new("PbrSave")
            saveScene.view_settings.view_transform = "Standard"
            saveScene.view_settings.look = "None"
            settings = saveScene.render.image_settings
            settings.file_format = "PNG"
            settings.color_mode = "RGB"
            settings.color_depth = "16" if role == "Normal" else "8"
            image.save_render(str(out / f"{name}_{role}.png"), scene=saveScene)
            bpy.data.scenes.remove(saveScene)
            bpy.data.images.remove(image)
            print("REPAIR_MAP", name, role, flush=True)
        for tree, principled, output, original in originals:
            tree.links.new(original, output.inputs["Surface"])
        source.select_set(False)
        source.hide_render = True
        bpy.ops.export_scene.gltf(filepath=str(out / f"{name}.glb"), export_format="GLB", use_selection=True,
            export_yup=True, export_texcoords=True, export_normals=True, export_tangents=True,
            export_materials="NONE", export_extras=False)
        target.data.calc_loop_triangles()
        report.append({"part": name, "res": resolution, "unwrap": measurement, "triangles": len(target.data.loop_triangles)})
        target.select_set(False)
    return report
