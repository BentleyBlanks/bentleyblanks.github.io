"""Render the seven requested review views; PNGs remain outside the repository."""
import importlib.util
import math
from pathlib import Path

import bpy
from mathutils import Vector

projectDir = Path(__file__).resolve().parents[1]
sourceDir = Path("C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SingleBlanket")
reviewDir = sourceDir / "Review"
spec = importlib.util.spec_from_file_location("SingleBlanketBake", projectDir / "_blender/Script_SingleBlanketBake.py")
bake = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bake)


def Matte(name, color):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = 0.90
    return material


def Aim(obj, target):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat("-Z", "Y").to_euler()


def ChooseAction(rig, mesh, name, frame=1):
    bake.ClearPose(rig, mesh)
    rig.animation_data.action = bpy.data.actions[name]
    rig.animation_data.action_slot = rig.animation_data.action.slots[0]
    if name in bake.clipNames:
        keys = mesh.data.shape_keys
        keys.animation_data.action = bpy.data.actions[name+"_Shape"]
        keys.animation_data.action_slot = keys.animation_data.action.slots[0]
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()


def Main():
    if bpy.app.background and not bpy.data.filepath:
        bpy.ops.wm.open_mainfile(filepath=str(sourceDir / "Scene_SingleBlanket.blend"))
    if sourceDir not in Path(bpy.data.filepath).parents:
        raise RuntimeError("Open this task's Scene_SingleBlanket.blend first")
    reviewDir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    rig, mesh = bpy.data.objects["Blanket_Rig"], bpy.data.objects["Blanket_Mesh"]
    proxy = bpy.data.objects["Ref_BodyProxy"]
    for socket in [o for o in bpy.data.objects if o.name.startswith("Socket_")]:
        socket.hide_render = True
    for obj in list(bpy.data.objects):
        if obj.name.startswith("Review_"):
            bpy.data.objects.remove(obj, do_unlink=True)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1280, 960
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("Review_World")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.32, 0.32, 0.32, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.45
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.006))
    ground = bpy.context.object
    ground.name = "Review_Ground"
    ground.data.materials.append(Matte("Review_GroundMaterial", (0.20, 0.21, 0.22)))
    for name, position, energy, size in [("Key", (1.5, -1.8, 3.2), 380, 3.0),
                                         ("Fill", (-2, 0.8, 2.8), 230, 3.0)]:
        data = bpy.data.lights.new("Review_"+name, "AREA")
        data.energy, data.shape, data.size = energy, "DISK", size
        light = bpy.data.objects.new(data.name, data)
        bpy.context.collection.objects.link(light)
        light.location = position
        Aim(light, (0, 0, 0))
    cameraData = bpy.data.cameras.new("Review_Camera")
    cameraData.type = "ORTHO"
    camera = bpy.data.objects.new("Review_Camera", cameraData)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    proxy.data.materials.clear()
    proxy.data.materials.append(Matte("Review_ProxyMaterial", (0.22, 0.075, 0.025)))
    mainMaterial = mesh.data.materials[0]

    def Render(name, position, target, scale, action=None):
        selectedNames = globals().get("SingleBlanketShotNames")
        if selectedNames and name not in selectedNames:
            return
        if action:
            ChooseAction(rig, mesh, action)
        else:
            bake.ClearPose(rig, mesh)
        camera.location, cameraData.ortho_scale = position, scale
        Aim(camera, target)
        if abs(position[0]-target[0])+abs(position[1]-target[1]) < 1e-6:
            camera.rotation_euler.z += math.pi
        scene.render.filepath = str(reviewDir / ("Scene_"+name+".png"))
        bpy.ops.render.render(write_still=True)
        print("REVIEW_RENDER " + scene.render.filepath)

    Render("Flat", (0, 0, 3.0), (0, 0, 0), 2.9, "Blanket_Flat")
    Render("DragPoseSide", (3.0, -0.05, 0.80), (0, -0.05, 0.26), 2.8, "Blanket_DragPose")
    Render("Crumpled", (0.65, -0.90, 0.85), (0, 0, 0.115), 0.78, "Blanket_Crumpled")
    Render("Test_LiftHeadCorners", (2.8, -1.2, 1.15), (0, -0.05, 0.32), 2.85, "Test_LiftHeadCorners")
    proxy.hide_render = False
    proxy.hide_set(False)
    Render("Test_DrapeOverBody", (2.3, -2.4, 2.6), (0, 0.025, 0.10), 2.55, "Test_DrapeOverBody")
    proxy.hide_render = True
    proxy.hide_set(True)

    # Weight heatmap is a render-only colour attribute, not an extra group.
    attribute = mesh.data.color_attributes.get("Weight_Blanket_Grid_r2_c1")
    if attribute is None:
        attribute = mesh.data.color_attributes.new(name="Weight_Blanket_Grid_r2_c1", type="FLOAT_COLOR", domain="POINT")
    stops = [(0.0, (0.01, 0.04, 0.40)), (0.25, (0.0, 0.65, 0.75)),
             (0.5, (0.1, 0.8, 0.08)), (0.75, (1, 0.7, 0)), (1.0, (0.8, 0, 0))]
    index = mesh.vertex_groups["Blanket_Grid_r2_c1"].index
    mesh.vertex_groups.active_index = index
    for vertex in mesh.data.vertices:
        weight = next((g.weight for g in vertex.groups if g.group == index), 0)
        lower = min(3, int(weight*4))
        t = min(1.0, max(0.0, (weight-stops[lower][0])*4))
        color = tuple(a*(1-t)+b*t for a, b in zip(stops[lower][1], stops[lower+1][1]))
        attribute.data[vertex.index].color = (*color, 1)
    heat = bpy.data.materials.get("Review_WeightHeatmap") or bpy.data.materials.new("Review_WeightHeatmap")
    heat.use_nodes = True
    nodes = heat.node_tree.nodes
    nodes.clear()
    vertexColor = nodes.new("ShaderNodeVertexColor")
    vertexColor.layer_name = attribute.name
    emission, output = nodes.new("ShaderNodeEmission"), nodes.new("ShaderNodeOutputMaterial")
    heat.node_tree.links.new(vertexColor.outputs["Color"], emission.inputs["Color"])
    heat.node_tree.links.new(emission.outputs[0], output.inputs["Surface"])
    mesh.data.materials[0] = heat
    Render("Weight_Blanket_Grid_r2_c1", (0, 0, 3), (0, 0, 0), 2.9)
    mesh.data.materials[0] = mainMaterial
    # Unlit overhead version allows a fair comparison with the approved board.
    unlit = mainMaterial.copy()
    unlit.name = "Review_UnlitAtlas"
    tree = unlit.node_tree
    emission = tree.nodes.new("ShaderNodeEmission")
    tree.links.new(tree.nodes["Texture_SingleBlanketBase"].outputs["Color"], emission.inputs["Color"])
    transparent = tree.nodes.new("ShaderNodeBsdfTransparent")
    mix = tree.nodes.new("ShaderNodeMixShader")
    clip = tree.nodes["Principled BSDF"].inputs["Alpha"].links[0].from_socket
    tree.links.new(clip, mix.inputs[0])
    tree.links.new(transparent.outputs[0], mix.inputs[1])
    tree.links.new(emission.outputs[0], mix.inputs[2])
    tree.links.new(mix.outputs[0], tree.nodes["Material Output"].inputs["Surface"])
    mesh.data.materials[0] = unlit
    scene.view_settings.view_transform = "Standard"
    Render("ReferenceAlignment", (0, 0, 3), (0, 0, 0), 2.9)
    scene.view_settings.view_transform = "AgX"
    mesh.data.materials[0] = mainMaterial
    bake.ClearPose(rig, mesh)
    rig.animation_data.use_nla = True
    mesh.data.shape_keys.animation_data.use_nla = True
    scene.frame_set(0)
    bpy.ops.wm.save_as_mainfile(filepath=str(sourceDir / "Scene_SingleBlanket.blend"), compress=True)
    print("SINGLE_BLANKET_REVIEW_DONE " + str(reviewDir))


if __name__ == "__main__":
    Main()
