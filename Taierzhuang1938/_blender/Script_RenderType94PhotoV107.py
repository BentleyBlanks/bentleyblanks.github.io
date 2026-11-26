"""Local evidence renders in the retained camera family and two lighting rigs."""

import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


base = Path("C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette")
root = Path(os.environ.get("TYPE94_PHOTO_ROOT",base/"PhotoReconstructionV107"))
out = Path(os.environ.get("TYPE94_PHOTO_RENDER_OUT",root/"Acceptance"/"Renders"))
out.mkdir(parents=True,exist_ok=True)
model = Path(os.environ.get("TYPE94_PROBE_BLEND",root/"Scene_Type94TanketteHighV107.blend"))
familyPath = Path(os.environ.get("TYPE94_PHOTO_CAMERAS",base/"ReferenceV93/Inputs/Data_ReferenceCamerasV93.json"))
family = json.loads(familyPath.read_text(encoding="utf-8"))
referenceData = Path(__file__).resolve().parents[1]/"Model/Type94Tankette/Data_ReferenceViewsV107.json"
if referenceData.exists():
    study = json.loads(referenceData.read_text(encoding="utf-8"))
    for key,record in study["addedCameras"].items():
        family["images"][key] = record["image"]
        family["cameras"][key] = record["camera"]

if model.suffix.lower()==".glb":
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(model))
else:
    bpy.ops.wm.open_mainfile(filepath=str(model))
scene = bpy.context.scene
asset = bpy.data.objects["Type94Tankette"]
turret = bpy.data.objects["TurretYaw"]
restTurret = turret.matrix_basis.copy()
scope = {asset,*asset.children_recursive}
for obj in scene.objects:
    if obj not in scope:
        obj.hide_render = True

data = bpy.data.cameras.new("PhotoEvidenceCamera")
camera = bpy.data.objects.new(data.name,data)
scene.collection.objects.link(camera)
scene.camera = camera
data.sensor_fit = "HORIZONTAL"
data.sensor_width = 36
data.clip_end = 80


def PhotoCamera(key):
    record = family["cameras"][key]
    width,height = family["images"][key]["size"]
    k = record["k"]
    r,t = Matrix(record["rotationCameraFromBlender"]),Vector(record["translationCameraFromBlender"])
    camera.location = -(r.transposed()@t) + Vector((0,0,-0.0016885639205575))
    camera.rotation_euler = (r.transposed() @ Matrix.Diagonal((1.,-1.,-1.))).to_euler()
    data.lens = k[0][0] * 36 / width
    data.shift_x = (width/2-k[0][2])/width
    data.shift_y = (k[1][2]-height/2)/width
    turret.matrix_basis = restTurret @ Matrix.Rotation(record.get("turretYawRadians",0),4,"Z")
    return width,height


def DetailCamera(position, aim, lens):
    camera.location = position
    camera.rotation_euler = (Vector(aim)-camera.location).to_track_quat("-Z","Y").to_euler()
    data.lens = lens
    data.shift_x = data.shift_y = 0
    turret.matrix_basis = restTurret
    return 3,2


def Area(name, position, aim, power, width, height, color):
    block = bpy.data.lights.new(name,"AREA")
    block.shape = "RECTANGLE"
    block.energy = power
    block.size = width
    block.size_y = height
    block.color = color
    obj = bpy.data.objects.new(name,block)
    scene.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector(aim)-obj.location).to_track_quat("-Z","Y").to_euler()
    return obj


def Lighting(rig):
    if not scene.world:
        scene.world = bpy.data.worlds.new("PhotoEvidenceEnvironment")
    world = scene.world
    world.use_nodes = True
    background = next(n for n in world.node_tree.nodes if n.type=="BACKGROUND")
    if rig=="museum":
        background.inputs["Color"].default_value = (.69,.73,.70,1)
        background.inputs["Strength"].default_value = .23
        return [
            Area("MuseumHighSoftbox",(1.30,-.92,4.15),(0,.40,.45),575,2.8,1.4,(1,.96,.86)),
            Area("MuseumFrontWindow",(-2.45,3.58,3.36),(0,0,.55),140,2.4,1.2,(.96,.97,1)),
            Area("MuseumStrip",(-.1,.35,4.54),(0,.2,.7),310,2.9,.46,(1,.99,.94)),
        ]
    background.inputs["Color"].default_value = (.74,.74,.74,1)
    background.inputs["Strength"].default_value = .36
    return [
        Area("NeutralKey",(-2.4,1.35,3.25),(0,.4,.8),560,2.6,1.65,(1,1,1)),
        Area("NeutralFill",(1.75,2.20,2.4),(0,.4,.52),245,2.6,1.8,(1,1,1)),
        Area("NeutralRim",(1.30,-2.7,3.1),(0,-.35,.6),490,2.5,1.0,(1,1,1)),
    ]


shots = {
    "FrontJoint": ((-1.63,2.61,1.30),(-.19,1.23,.69),70),
    "DriveAndTrack": ((-2.06,2.31,1.29),(-.60,1.04,.54),77),
    "FendersAndCowl": ((-1.83,2.31,1.70),(-.23,1.07,.81),67),
    "FarCasting": ((-1.32,3.63,1.07),(.48,1.32,.62),95),
    "Rear": ((-2.8,-4.6,2.03),(0,-.17,.78),52),
}

cases = os.environ.get("TYPE94_PHOTO_RENDER_CASES","museum:2017,neutral:2017,neutral:DriveAndTrack,neutral:FarCasting").split(",")
res = int(os.environ.get("TYPE94_PHOTO_RENDER_WIDTH","1440"))
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = True
scene.render.resolution_percentage = 100
scene.render.threads_mode = "FIXED"
scene.render.threads = 6
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "None"
scene.view_settings.exposure = .25
scene.view_settings.gamma = 1
scene.render.engine = "CYCLES"
scene.cycles.samples = int(os.environ.get("TYPE94_PHOTO_RENDER_SAMPLES","32"))
scene.cycles.use_denoising = True
scene.cycles.use_adaptive_sampling = True
scene.cycles.max_bounces = 6
scene.cycles.transparent_max_bounces = 4
if os.environ.get("TYPE94_PHOTO_RENDER_CPU") != "1":
    try:
        preferences = bpy.context.preferences.addons["cycles"].preferences
        preferences.compute_device_type = "CUDA"
        preferences.get_devices()
        cuda = [device for device in preferences.devices if device.type=="CUDA"]
        if cuda:
            for device in preferences.devices:
                device.use = device in cuda
            scene.cycles.device = "GPU"
    except (RuntimeError,TypeError,KeyError):
        scene.cycles.device = "CPU"

lights = []
for case in cases:
    rig,key = case.split(":",1)
    if rig=="gray":
        scene.render.engine = "BLENDER_WORKBENCH"
        scene.view_settings.view_transform = "Standard"
        shading = scene.display.shading
        shading.light = "STUDIO"
        shading.studiolight_rotate_z = .10
        shading.color_type = "SINGLE"
        shading.single_color = (.53,.53,.53)
        shading.show_shadows = True
        shading.show_cavity = True
        shading.cavity_type = "BOTH"
        shading.show_object_outline = False
    else:
        scene.render.engine = "CYCLES"
        scene.view_settings.view_transform = "AgX"
        for light in lights:
            bpy.data.objects.remove(light,do_unlink=True)
        lights = Lighting(rig)
    width,height = PhotoCamera(key) if key in family["cameras"] else DetailCamera(*shots[key])
    scene.render.resolution_x = res
    scene.render.resolution_y = 2 * round(res * height / width / 2)
    scene.render.filepath = str(out / f"Render_{model.stem}_{rig}_{key}.png")
    print("TYPE94_V107_RENDER",rig,key,scene.render.resolution_x,scene.render.resolution_y,flush=True)
    bpy.ops.render.render(write_still=True)
