"""First build the photographic high source, then derive and bake its game version."""

import hashlib
import json
import os
from pathlib import Path
import sys

import bpy
from mathutils import Vector


scriptDir = Path(__file__).resolve().parent
sys.path.insert(0,str(scriptDir))
from Script_Type94PhotoGeometryV107 import RebuildExterior
from Script_Type94PhotoMaterialsV107 import BuildPhotoMaterials, PhotoMaterialAttributes

repo = scriptDir.parents[1]
modelDir = repo / "Taierzhuang1938/Model/Type94Tankette"
defaultSource = Path("C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette")
revision = os.environ.get("TYPE94_PHOTO_REVISION", "V107")
if revision not in {"V107", "V108", "V109"}:
    raise ValueError(f"Unknown Type 94 photo revision {revision}")
root = Path(os.environ.get("TYPE94_PHOTO_ROOT", defaultSource / f"PhotoReconstruction{revision}")).resolve()
acceptance = root / "Acceptance"
highBlend = root / f"Scene_Type94TanketteHigh{revision}.blend"
lowGeometryBlend = root / f"Scene_Type94TanketteGameGeometry{revision}.blend"


def ReadJson(path):
    return json.loads(path.read_text(encoding="utf-8"))


def WriteJson(path, value):
    path.write_text(json.dumps(value,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")


def Sha(path):
    with path.open("rb") as file:
        return hashlib.file_digest(file,"sha256").hexdigest()


def SnapshotActiveImages(asset):
    folder = root / "Textures" / "High"
    folder.mkdir(parents=True,exist_ok=True)
    ans = []
    materials = {m for o in asset.children_recursive if o.type=="MESH" for m in o.data.materials}
    visited = set()
    for material in sorted(materials, key=lambda m:m.name):
        nodes = material.node_tree.nodes if material.use_nodes else []
        pending = [n for n in nodes if (n.type=="OUTPUT_MATERIAL" and n.is_active_output)
                   or (n.type=="GROUP" and n.node_tree and n.node_tree.name.startswith("glTF Material Output"))]
        while pending:
            node = pending.pop()
            if node in visited:
                continue
            visited.add(node)
            if node.type=="TEX_IMAGE" and node.image and node.image.packed_file:
                image = node.image
                filename = Path(image.filepath).name
                path = folder / (filename if filename.lower().endswith(".png") else image.name+".png")
                path.write_bytes(image.packed_file.data)
                if not any(row["image"]==image.name for row in ans):
                    ans.append(dict(image=image.name,file=path.relative_to(root).as_posix(),sha256=Sha(path),size=list(image.size)))
            for socket in node.inputs:
                pending.extend(link.from_node for link in socket.links)
    return ans


def Build(high):
    seed = ReadJson(modelDir / ("Data_SurfaceStudyV102.json" if high else "Data_GameTrialV103.json"))
    source = Path(seed["sourceBlend"])
    digest = Sha(source)
    if digest != seed["sourceBlendSha256"]:
        raise RuntimeError(f"Retained source hash changed at {source}")
    if not high:
        highIdentity = ReadJson(acceptance / "Data_Type94HighV107.json")
        if Sha(highBlend) != highIdentity["sha256"]:
            raise RuntimeError("The audited high source has changed")
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    asset = bpy.data.objects["Type94Tankette"]
    if scene.get("BlenderMcpTask") != asset.name:
        raise RuntimeError("The source is outside the Type94Tankette Blender task")
    for block in list(bpy.data.texts):
        if block.name.startswith("Data_Type94AuthoredTangentFrames"):
            bpy.data.texts.remove(block)
    bpy.context.preferences.filepaths.save_version = 0
    path = ReadJson(modelDir / "Data_Type94Tankette.json")["mechanisms"]["path"]
    stats = RebuildExterior(high,BuildPhotoMaterials(),path["pitchM"])
    PhotoMaterialAttributes(asset)
    bpy.context.view_layer.update()
    scene["SurfaceGeometryRevision"] = "PhotoExteriorV107"
    scene["Type94PhotoHighSource"] = high
    scene["Type94PhotoSourceSeedSha256"] = digest
    scene["Type94PhotoGameProjectionPending"] = not high
    figures = []
    extrema = []
    for obj in asset.children_recursive:
        if obj.type=="MESH":
            obj.data.calc_loop_triangles()
            figures.append((obj.name,len(obj.data.loop_triangles)))
            extrema.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    triangles = sum(count for _,count in figures)
    dimensions = [max(point[i] for point in extrema)-min(point[i] for point in extrema) for i in (0,2,1)]
    if not all(lo<value<hi for value,(lo,hi) in zip(dimensions,[(1.60,1.66),(1.59,1.66),(3.03,3.12)])):
        raise RuntimeError(f"Reconstructed source outside early Type 94 envelope: {dimensions}")
    if not high and triangles > 80000:
        raise RuntimeError(f"Low topology would require {triangles} triangles")
    images = SnapshotActiveImages(asset) if high else []
    bpy.ops.file.pack_all()
    bpy.ops.object.select_all(action="DESELECT")
    asset.select_set(True)
    bpy.context.view_layer.objects.active = asset
    destination = highBlend if high else lowGeometryBlend
    bpy.ops.wm.save_as_mainfile(filepath=str(destination))
    report = dict(scene=str(destination),sha256=Sha(destination),seedSha256=digest,triangles=triangles,
                  meshOwners=len(figures),nodes=len(asset.children_recursive)+1,changes=stats,
                  sourceBoundingBoxWidthHeightLengthM=dimensions,meshes=figures,high=high,packedSourceImages=images)
    if not high:
        report["highSourceSha256"] = highIdentity["sha256"]
    WriteJson(acceptance / ("Data_Type94HighV107.json" if high else "Data_Type94LowGeometryV107.json"),report)
    print("TYPE94_V107_BUILT",destination,len(figures),triangles,flush=True)


if __name__ == "__main__":
    if revision != "V107":
        raise ValueError("Use Script_BuildType94RearPhotoV108.py for subsequent rear geometry")
    phase = os.environ.get("TYPE94_PHOTO_PHASE","High")
    if phase not in {"High","LowGeometry"}:
        raise ValueError(f"Unknown photo build phase {phase}")
    acceptance.mkdir(parents=True,exist_ok=True)
    Build(high=phase=="High")
