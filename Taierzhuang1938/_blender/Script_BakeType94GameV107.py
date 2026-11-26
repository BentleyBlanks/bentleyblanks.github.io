"""Prepare, bake and export the Type 94 game GLB after its high source is reviewed."""

import os
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Vector
import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parent))
from Script_BuildType94PhotoV107 import ReadJson, Sha, WriteJson, acceptance, highBlend, lowGeometryBlend, root
from Script_Type94Export import ExportGltf, TriangulatedCopy
from Script_Type94PhotoBakeV107 import (
    BakeImage, CHANNELS, EvaluateMissing, OccupiedAtlas, PackTarget, Role, ROLES, Select,
    StagingMesh, SurfaceGraphs, TemporaryMaterial, WriteMap,
)


stagingFile = root/"Acceptance"/"Scene_Type94ProjectionWorkV107.blend"
preparationFile = acceptance/"Data_Type94ProjectionPreparationV107.json"
outputBlend = root/"Scene_Type94TanketteGameV107.blend"
textureDir = root/"Textures"/"Game"
glb = root/"Exports"/"Model_Type94TanketteGameV107.glb"


def MeshOwners():
    asset = bpy.data.objects["Type94Tankette"]
    return sorted((obj for obj in asset.children_recursive if obj.type=="MESH"),key=lambda obj:obj.name)


def Prepare():
    high = ReadJson(acceptance/"Data_Type94HighV107.json")
    low = ReadJson(acceptance/"Data_Type94LowGeometryV107.json")
    if Sha(highBlend)!=high["sha256"] or Sha(lowGeometryBlend)!=low["sha256"] or high["sha256"]!=low["highSourceSha256"]:
        raise ValueError("The high, low and prepared reports do not describe the same source pair")
    bpy.ops.wm.open_mainfile(filepath=str(lowGeometryBlend))
    owners = {}
    meshes = {}
    for obj in MeshOwners():
        if obj.data not in meshes:
            owners[obj.name] = obj
            meshes[obj.data] = TriangulatedCopy(obj.data)
        obj.data = meshes[obj.data]
    for obj in owners.values():
        mesh = obj.data
        while mesh.uv_layers:
            mesh.uv_layers.remove(mesh.uv_layers[0])
        mesh.uv_layers.new(name="UVMap_GameV107")

    with bpy.data.libraries.load(str(highBlend),link=False) as (available,loaded):
        if any(name not in available.objects for name in owners):
            raise ValueError("Paired high source is missing named low mesh owners")
        loaded.objects = list(owners)
    donors = dict(zip(owners,loaded.objects))
    for obj in donors.values():
        obj.data = TriangulatedCopy(obj.data)
    stages = {}
    for role,size in ROLES.items():
        targetItems,donorItems = [],[]
        for i,(name,obj) in enumerate(owners.items()):
            lowFaces = [p.index for p in obj.data.polygons if Role(obj.data.materials[p.material_index])==role]
            if not lowFaces:
                continue
            donor = donors[name]
            highFaces = [p.index for p in donor.data.polygons if Role(donor.data.materials[p.material_index])==role]
            if not highFaces:
                raise ValueError(f"No high {role} source for {name}")
            offset = Vector(((i%8)*4,(i//8)*4,0))
            targetItems.append((obj,lowFaces,offset))
            donorItems.append((donor,highFaces,offset))
        target,bindings = StagingMesh("ProjectionTarget"+role+"V107",targetItems,False)
        source,_ = StagingMesh("ProjectionDonor"+role+"V107",donorItems,True)
        TemporaryMaterial(target)
        PackTarget(target,bindings,size)
        stages[role] = dict(target=target.name,donor=source.name,size=size,owners=len(bindings),
                            lowTriangles=len(target.data.polygons),highTriangles=len(source.data.polygons))
        print("TYPE94_V107_UV_PACK",role,stages[role],flush=True)
    for obj in donors.values():
        bpy.data.objects.remove(obj,do_unlink=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(stagingFile))
    WriteJson(preparationFile,dict(highSha256=high["sha256"],lowSha256=low["sha256"],stagingSha256=Sha(stagingFile),
                                  geometry=low["changes"],uniqueOwners=len(owners),stages=stages))


def ReadStaging():
    staging = ReadJson(preparationFile)
    if Sha(stagingFile)!=staging["stagingSha256"] or Sha(highBlend)!=staging["highSha256"]:
        raise ValueError("Projection work file identity changed")
    bpy.ops.wm.open_mainfile(filepath=str(stagingFile))
    return staging


def Bake(role):
    preparation = ReadStaging()
    stage = preparation["stages"][role]
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 6
    target,donor = [bpy.data.objects[stage[key]] for key in ["target","donor"]]
    size = stage["size"]
    cage,distance = (.0045,.012) if role=="Track" else (.0055,.014)
    graphs = SurfaceGraphs(donor)
    mask = OccupiedAtlas(target.data,size)
    coverage = BakeImage(target,donor,graphs,"Coverage",size,cage,distance,0)
    missing = mask & ~np.all(coverage[:,:,:3]>.998,axis=2)
    del coverage
    print("TYPE94_V107_RAY_COVERAGE",role,int(mask.sum()),int(missing.sum()),flush=True)
    patches,maxDistance = EvaluateMissing(target,donor,graphs,missing)
    images = {}
    for channel in CHANNELS:
        pixels = BakeImage(target,donor,graphs,channel,size,cage,distance,6)
        if channel in patches:
            y,x,values = patches[channel]
            pixels[y,x,:3] = values
        valid = pixels[:,:,:3][mask]
        if not np.isfinite(valid).all():
            raise ValueError(f"{role} {channel} contains non-finite values")
        if channel=="Normal":
            length = np.linalg.norm(valid*2-1,axis=1)
            if not np.all((length>.85)&(length<1.15)):
                raise ValueError(f"{role} contains invalid mapped tangent normals")
        if channel=="Orm" and np.ptp(valid[:,0]) < .015:
            raise ValueError(f"{role} AO channel has no meaningful occlusion range")
        file = textureDir/f"Texture_Type94Game{role}{channel}V107.png"
        WriteMap(file,pixels,channel=="Base")
        images[channel] = dict(file=str(file),sha256=Sha(file),dimensions=[size,size],
                               linearMedian=np.median(valid,axis=0).round(5).tolist())
        del pixels
        print("TYPE94_V107_BAKED",role,channel,images[channel]["sha256"],flush=True)
    WriteJson(acceptance/f"Data_Type94Bake{role}V107.json",dict(role=role,stagingSha256=preparation["stagingSha256"],
        highSha256=preparation["highSha256"],usedPixels=int(mask.sum()),repairedPixels=int(missing.sum()),
        maximumRepairDistanceM=maxDistance,images=images))


def InstallRuntimeMaterial(material,role,images):
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    shader = tree.nodes.new("ShaderNodeBsdfPrincipled")
    shader.label = role+" PBR"
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    tree.links.new(shader.outputs[0],output.inputs["Surface"])
    inputs = {}
    for channel,imageInfo in images.items():
        file = Path(imageInfo["file"])
        if Sha(file)!=imageInfo["sha256"]:
            raise ValueError(f"Bake changed after verification: {file}")
        image = bpy.data.images.load(str(file),check_existing=False)
        image.colorspace_settings.name = "sRGB" if channel=="Base" else "Non-Color"
        image.pack()
        node = tree.nodes.new("ShaderNodeTexImage")
        node.name = "Baked "+channel
        node.image = image
        inputs[channel] = node.outputs["Color"]
    tree.links.new(inputs["Base"],shader.inputs["Base Color"])
    separate = tree.nodes.new("ShaderNodeSeparateColor")
    separate.mode = "RGB"
    tree.links.new(inputs["Orm"],separate.inputs["Color"])
    tree.links.new(separate.outputs["Green"],shader.inputs["Roughness"])
    tree.links.new(separate.outputs["Blue"],shader.inputs["Metallic"])
    normal = tree.nodes.new("ShaderNodeNormalMap")
    normal.name = "MikkTSpace OpenGL +Y"
    tree.links.new(inputs["Normal"],normal.inputs["Color"])
    tree.links.new(normal.outputs["Normal"],shader.inputs["Normal"])
    ao = tree.nodes.new("ShaderNodeGroup")
    ao.name = "glTF Material Output"
    group = bpy.data.node_groups.get("glTF Material Output")
    if group is None:
        from io_scene_gltf2.blender.com.material_helpers import create_settings_group
        group = create_settings_group("glTF Material Output")
    ao.node_tree = group
    tree.links.new(separate.outputs["Red"],ao.inputs["Occlusion"])
    if role=="Paint":
        shader.inputs["Coat Weight"].default_value = .10
        shader.inputs["Coat Roughness"].default_value = .28
        tree.links.new(normal.outputs["Normal"],shader.inputs["Coat Normal"])
    material.use_backface_culling = True
    return material


def ReadGlbCount(file):
    import json
    with file.open("rb") as stream:
        assert stream.read(4)==b"glTF"
        stream.seek(12)
        length = struct.unpack("<I",stream.read(4))[0]
        assert stream.read(4)==b"JSON"
        data = json.loads(stream.read(length))
    pending = list(data["scenes"][data["scene"]]["nodes"])
    triangles, owners = 0, 0
    while pending:
        node = data["nodes"][pending.pop()]
        pending.extend(node.get("children",[]))
        if "mesh" not in node:
            continue
        owners += 1
        for primitive in data["meshes"][node["mesh"]]["primitives"]:
            if primitive.get("mode",4)!=4:
                raise ValueError("Non-triangle primitive in the default asset scene")
            index = primitive.get("indices",primitive["attributes"]["POSITION"])
            triangles += data["accessors"][index]["count"] // 3
    return triangles,owners


def Finalize():
    preparation = ReadStaging()
    reports = {role:ReadJson(acceptance/f"Data_Type94Bake{role}V107.json") for role in ROLES}
    if any(r["stagingSha256"]!=preparation["stagingSha256"] for r in reports.values()):
        raise ValueError("PBR bakes refer to a different projection stage")
    seedMaterials = {}
    for role in ROLES:
        name = "Material_Type94"+role
        seedMaterials[role] = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    for mesh in {obj.data for obj in MeshOwners()}:
        assignments = [mesh.materials[p.material_index] for p in mesh.polygons]
        resolved = [seedMaterials.get(Role(m),m) for m in assignments]
        slots = list(dict.fromkeys(resolved))
        indices = {material:i for i,material in enumerate(slots)}
        mesh.materials.clear()
        for material in slots:
            mesh.materials.append(material)
        mesh.polygons.foreach_set("material_index",[indices[material] for material in resolved])
    for role in ROLES:
        InstallRuntimeMaterial(seedMaterials[role],role,reports[role]["images"])
    for stage in preparation["stages"].values():
        for name in [stage["target"],stage["donor"]]:
            bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
    bpy.data.orphans_purge(do_recursive=True)
    scene = bpy.context.scene
    scene["Type94PhotoGameProjectionPending"] = False
    scene["GamePbrProjectionCompleted"] = True
    scene["GameHighSourceSha256"] = preparation["highSha256"]
    scene["GamePbrNormalStrength"] = 1.0
    asset = bpy.data.objects["Type94Tankette"]
    Select([asset])
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(outputBlend))
    bpy.ops.wm.open_mainfile(filepath=str(outputBlend))
    asset = bpy.data.objects["Type94Tankette"]
    Select([asset,*asset.children_recursive])
    ExportGltf(glb)
    triangles, owners = ReadGlbCount(glb)
    if triangles>80000 or owners!=240:
        raise ValueError(f"Exported assembly requires {triangles} triangles across {owners} mesh instances")
    WriteJson(acceptance/"Data_Type94GameV107.json",dict(sourceBlend=str(outputBlend), sourceBlendSha256=Sha(outputBlend),
        sourceGlb=str(glb),sha256=Sha(glb),triangles=triangles,meshOwners=owners,poseNodes=len(asset.children_recursive)+1,
        highSourceSha256=preparation["highSha256"],projection=reports,defaultSceneInstanceCount=True))
    print("TYPE94_V107_EXPORTED",triangles,owners,Sha(glb),flush=True)


if __name__=="__main__":
    textureDir.mkdir(parents=True,exist_ok=True)
    glb.parent.mkdir(parents=True,exist_ok=True)
    phase = os.environ.get("TYPE94_PHOTO_PHASE","Prepare")
    if phase=="Prepare":
        Prepare()
    elif phase in ROLES:
        Bake(phase)
    elif phase=="Finalize":
        Finalize()
    else:
        raise ValueError(f"Unknown bake phase {phase}")
