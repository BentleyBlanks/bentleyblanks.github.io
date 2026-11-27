"""Build an editable two-material Type 94 game scene from the V111 authoring source."""
import json
from pathlib import Path
import sys

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from Script_BakeType94GameV107 import InstallRuntimeMaterial, MeshOwners, ReadGlbCount, Select, Sha
from Script_Type94Export import ExportGltf


def RebindMeshes(owners, atlas, detail):
    canvas = np.array(atlas["size"], dtype=np.float64)
    tiles = atlas["texturedTiles"] | atlas["solidTiles"]
    seen = set()
    for obj in owners:
        assert all(slot.link == "DATA" for slot in obj.material_slots), obj.name
        mesh = obj.data
        if mesh.as_pointer() in seen:
            continue
        seen.add(mesh.as_pointer())
        slots = [material.name for material in mesh.materials]
        assert set(slots) <= tiles.keys() | {"Material_Type94Paint"}, obj.name
        if slots == ["Material_Type94Paint"]:
            continue

        oldUv = mesh.uv_layers.active
        assert oldUv is not None, obj.name
        uv = np.empty((len(mesh.loops), 2), dtype=np.float32)
        oldUv.uv.foreach_get("vector", uv.ravel())
        paint = bpy.data.materials["Material_Type94Paint"]
        newSlots = [paint, detail] if paint.name in slots else [detail]
        binding = []
        for face in mesh.polygons:
            role = slots[face.material_index]
            if role == paint.name:
                binding.append(0)
                continue
            loops = slice(face.loop_start, face.loop_start + face.loop_total)
            x, y, width, height = tiles[role]
            if role in atlas["texturedTiles"]:
                uv[loops, 0] = (uv[loops, 0] * width + x) / canvas[0]
                uv[loops, 1] = (uv[loops, 1] * height + canvas[1] - y - height) / canvas[1]
            else:
                margin = 20
                uv[loops, 0] = (uv[loops, 0] * (width - 2 * margin) + x + margin) / canvas[0]
                uv[loops, 1] = (uv[loops, 1] * (height - 2 * margin) +
                                canvas[1] - y - height + margin) / canvas[1]
            binding.append(len(newSlots) - 1)
        oldUv.uv.foreach_set("vector", uv.ravel())
        mesh.materials.clear()
        for material in newSlots:
            mesh.materials.append(material)
        mesh.polygons.foreach_set("material_index", np.asarray(binding, dtype=np.int32))
        mesh.update()


def GeometryIdentity(owners):
    return [(obj.name, str(obj.parent.name), len(obj.data.vertices),
             len(obj.data.polygons), tuple(tuple(row) for row in obj.matrix_local))
            for obj in owners]


def Main():
    source, root = (Path(value).resolve() for value in sys.argv[sys.argv.index("--") + 1:])
    assets=Path(__file__).resolve().parents[1] / "Model" / "Type94Tankette"
    baseline=json.loads((assets / "Data_ReleaseV111.json").read_text(encoding="utf-8"))
    assert Sha(source) == baseline["sourceBlendSha256"], source
    atlasReport=json.loads((root / "Acceptance" / "Data_AtlasBuildV112.json").read_text(encoding="utf-8"))
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene=bpy.context.scene
    scene["BlenderMcpTask"]="Type94Tankette"
    owners=MeshOwners()
    assert len(owners)==240
    before=GeometryIdentity(owners)
    detail=bpy.data.materials.new("Material_Type94Details")
    textures={}
    for channel in ("Base","Normal","Orm"):
        image=root / "Textures" / f"Texture_Type94Details{channel}V112.png"
        textures[channel]={"file":str(image),"sha256":Sha(image)}
    InstallRuntimeMaterial(detail,"Details",textures)

    RebindMeshes(owners, atlasReport["atlas"], detail)
    assert before == GeometryIdentity(MeshOwners())
    keptMaterials = {"Material_Type94Paint", "Material_Type94Details"}
    objectMeshes = {obj.data for obj in bpy.data.objects if obj.type == "MESH"}
    for mesh in tuple(bpy.data.meshes):
        if mesh in objectMeshes or not any(m and m.name not in keptMaterials for m in mesh.materials):
            continue
        if mesh.users != int(mesh.use_fake_user):
            raise ValueError(f"Inactive mesh is still referenced: {mesh.name}")
        bpy.data.meshes.remove(mesh)
    for material in tuple(bpy.data.materials):
        if material.name in keptMaterials:
            continue
        if material.users != int(material.use_fake_user):
            raise ValueError(f"Unmerged material is still referenced: {material.name}")
        bpy.data.materials.remove(material)
    for image in tuple(bpy.data.images):
        if image.users==0 and image.name.startswith(("Texture_Type94GameSteel","Texture_Type94GameTrack","Texture_Type94GameRubber")):
            bpy.data.images.remove(image)

    destination=root / "Scene_Type94TanketteGameMaterialAtlasV112.blend"
    assert destination != source
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(destination), compress=True)
    bpy.ops.wm.open_mainfile(filepath=str(destination))
    assert before == GeometryIdentity(MeshOwners())
    materials=sorted({material.name for obj in MeshOwners() for material in obj.data.materials})
    assert materials==["Material_Type94Details","Material_Type94Paint"]
    assert sorted(m.name for m in bpy.data.materials) == materials
    detail=bpy.data.materials["Material_Type94Details"]
    packed=[n.image for n in detail.node_tree.nodes if n.type=="TEX_IMAGE"]
    assert len(packed)==3 and all(image.packed_file for image in packed)
    assert all(tuple(image.size)==tuple(atlasReport["atlas"]["size"]) for image in packed)

    asset=bpy.data.objects["Type94Tankette"]
    Select([asset,*asset.children_recursive])
    export=root / "Acceptance" / "Model_Type94TanketteMaterialAtlasBlenderReexportV112.glb"
    ExportGltf(export)
    triangles, meshOwners=ReadGlbCount(export)
    assert (triangles,meshOwners)==(79178,240)
    report=dict(sourceBlend=str(destination),sourceBlendSha256=Sha(destination),
                materialNames=materials,materialDatablocks=len(bpy.data.materials),packedAtlasImages=3,
                geometryAndLocalPosesExact=True,
                reexport=str(export),reexportSha256=Sha(export),reexportTriangles=triangles,
                meshOwners=meshOwners,reopened=True)
    (root / "Acceptance" / "Data_AtlasBlendV112.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print("TYPE94_ATLAS_BLEND_OK",materials,triangles,meshOwners,flush=True)


if __name__=="__main__":
    Main()
