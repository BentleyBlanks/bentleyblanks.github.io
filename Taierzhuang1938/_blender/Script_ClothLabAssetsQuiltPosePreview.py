"""Inspect the actual quilt GLB bent over support and held by its two head corners.

Only authoring preview bone transforms are applied. No delivered mesh, material,
bind pose or animation is changed; output is local 640 x 480 JPEG evidence.
"""
import math
from pathlib import Path
import bpy
from mathutils import Matrix, Vector

projectDir = Path(__file__).resolve().parents[1] if "__file__" in globals() else Path.cwd()/"Taierzhuang1938"
outDir = projectDir.parent/"tmp/ClothLabAssetPreview"
outDir.mkdir(parents=True,exist_ok=True)


def Surface(x,y,pose):
    if pose == "Drape":
        sign = 1 if x >= 0 else -1
        distance = abs(x); arc = min(distance,.425); angle=arc/.34
        side = max(0,distance-.425)
        px = sign*(.34*math.sin(angle)+side*math.cos(1.25))
        pz = .30+.34*math.cos(angle)-side*math.sin(1.25)
        px += .012*math.sin(y*6)*(1-abs(x)/.7)
        pz += .020*math.cos(y*3)+.009*math.sin(y*9+x*4)
        pz += .045*max(0,(y-.55)/.4)**2
        return Vector((px,y*.97,pz))
    t=(y+.95)/1.9
    px=x*(.82+.18*t)+.035*math.sin(t*math.pi)*math.sin(x*6)
    py=.12*math.sin(t*2.8)+.065*math.sin(x*13+t*2)*(.6+.4*t)
    pz=1.55-t*1.43-.28*(1-(x/.7)**2)*math.exp(-t*3.5)
    return Vector((px,py,pz))


def BasicMaterial(name,color):
    material=bpy.data.materials.new(name);material.use_nodes=True
    bsdf=material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value=(*color,1)
    bsdf.inputs["Roughness"].default_value=.96
    return material


def Render(pose):
    for obj in list(bpy.data.objects):bpy.data.objects.remove(obj,do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=str(projectDir/"Model/ClothLab/Model_DongguaQuilt.glb"))
    rig=next(o for o in bpy.context.scene.objects if o.type=="ARMATURE")
    for bone in rig.pose.bones:
        if bone.name=="Blanket_Root":continue
        x,y,_=bone.bone.head_local
        point=Surface(x,y,pose)
        du=(Surface(x+.001,y,pose)-Surface(x-.001,y,pose)).normalized()
        dv=Surface(x,y+.001,pose)-Surface(x,y-.001,pose)
        normal=du.cross(dv).normalized();dv=normal.cross(du).normalized()
        frame=Matrix((du,dv,normal)).transposed().to_4x4()
        bone.matrix=Matrix.Translation(point)@frame@bone.bone.matrix_local.to_3x3().to_4x4()
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.01))
    bpy.context.object.data.materials.append(BasicMaterial("PreviewFloor",(.13,.135,.14)))
    if pose=="Drape":
        bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.30,depth=1.58,location=(0,0,.30),rotation=(math.pi/2,0,0))
        bpy.context.object.data.materials.append(BasicMaterial("PreviewSupport",(.075,.067,.057)))
        for face in bpy.context.object.data.polygons:face.use_smooth=True
    else:
        for x in(-.7,.7):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,radius=.035,location=Surface(x,-.95,pose))
            bpy.context.object.data.materials.append(BasicMaterial("PreviewGrip",(.20,.16,.10)))
    for location,energy,size in [((-2,-3,4),450,3),((2,2,3),200,3)]:
        bpy.ops.object.light_add(type="AREA",location=location)
        light=bpy.context.object;light.data.energy=energy;light.data.shape="DISK";light.data.size=size
        light.rotation_euler=(Vector((0,0,.4))-light.location).to_track_quat("-Z","Y").to_euler()
    location=(2.2,2.9,2.0) if pose=="Drape" else (2.3,3.4,2.0)
    target=Vector((0,0,.30 if pose=="Drape" else .80))
    bpy.ops.object.camera_add(location=location);camera=bpy.context.object
    camera.rotation_euler=(target-camera.location).to_track_quat("-Z","Y").to_euler()
    camera.data.type="ORTHO";camera.data.ortho_scale=2.65 if pose=="Drape" else 2.45
    scene=bpy.context.scene;scene.camera=camera;scene.render.engine="CYCLES"
    scene.cycles.samples=32;scene.cycles.use_denoising=True
    scene.render.resolution_x=640;scene.render.resolution_y=480;scene.render.resolution_percentage=100
    if scene.world is None:scene.world=bpy.data.worlds.new("CottonPreviewWorld")
    scene.world.color=(.18,.18,.18);scene.view_settings.view_transform="AgX"
    scene.render.image_settings.file_format="JPEG";scene.render.image_settings.quality=84
    scene.render.filepath=str(outDir/f"Preview_QuiltV4{pose}.jpg")
    bpy.context.view_layer.update();bpy.ops.render.render(write_still=True)
    print("QUILT_POSE_PREVIEW "+scene.render.filepath)


for pose in globals().get("QuiltPreviewPoses",("Drape","Lift")):Render(pose)
