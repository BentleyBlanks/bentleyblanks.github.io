"""Rebind the editable V112 game file to the V113 mud and dust bake."""
import json
from pathlib import Path
import sys

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from Script_BakeType94GameV107 import InstallRuntimeMaterial, MeshOwners, ReadGlbCount, Select, Sha
from Script_Type94Export import ExportGltf


def SetTrackUvs(mesh, tile):
    width, height = 4096, 3072
    x, y, size = tile
    layer = mesh.uv_layers.active
    values = np.empty((len(layer.uv), 2), dtype=np.float32)
    layer.uv.foreach_get("vector", values.ravel())
    u = (values[:,0] * width - 2048) / 2048
    v = (1 - values[:,1]) * height / 2048
    values[:,0] = (u * size + x) / width
    values[:,1] = 1 - (v * size + y) / height
    layer.uv.foreach_set("vector",values.ravel())
    mesh.update()


def Main():
    source, root = [Path(arg).resolve() for arg in sys.argv[sys.argv.index("--")+1:]]
    assetDir = Path(__file__).resolve().parents[1] / "Model" / "Type94Tankette"
    baseline=json.loads((assetDir/"Data_ReleaseV112.json").read_text(encoding="utf-8"))
    report=json.loads((root/"Acceptance"/"Data_Type94WeatherBakeV113.json").read_text(encoding="utf-8"))
    assert Sha(source)==baseline["sourceBlendSha256"]
    bpy.ops.wm.open_mainfile(filepath=str(source))
    bpy.context.scene["BlenderMcpTask"]="Type94Tankette"
    owners=MeshOwners()
    assert len(owners)==240
    for name in ("Paint","Details"):
        InstallRuntimeMaterial(bpy.data.materials["Material_Type94"+name],name,report["textures"][name])

    links=[obj for obj in owners if obj.name.startswith("TrackLink_")]
    assert len(links)==160 and len({obj.data for obj in links})==1
    original=links[0].data
    meshes={"Bare":original}
    for name,tile in report["trackTiles"].items():
        mesh=original.copy()
        mesh.name=f"Mesh_Type94Shoe{name}V113"
        SetTrackUvs(mesh,tile)
        meshes[name]=mesh
    for obj in links:
        obj.data=meshes[report["trackAssignments"][obj.name]]

    used={n.image for material in bpy.data.materials for n in material.node_tree.nodes
          if n.type=="TEX_IMAGE" and n.image}
    for image in tuple(bpy.data.images):
        if image not in used and image.users==0 and image.name.startswith(("Texture_Type94Details","Texture_Type94GamePaint")):
            bpy.data.images.remove(image)

    destination=root/"Scene_Type94TanketteGameWeatheringV113.blend"
    assert source!=destination
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(destination),compress=True)
    bpy.ops.wm.open_mainfile(filepath=str(destination))
    assert {m.name for m in bpy.data.materials}=={"Material_Type94Paint","Material_Type94Details"}
    assert len(MeshOwners())==240
    for material in bpy.data.materials:
        textures=[node.image for node in material.node_tree.nodes if node.type=="TEX_IMAGE"]
        assert len(textures)==3 and all(image.packed_file for image in textures)
    shapes={obj.data for obj in MeshOwners() if obj.name.startswith("TrackLink_")}
    assert len(shapes)==1+len(report["trackTiles"])
    asset=bpy.data.objects["Type94Tankette"]
    Select([asset,*asset.children_recursive])
    check=root/"Acceptance"/"Model_Type94WeatheringBlenderReexportV113.glb"
    ExportGltf(check)
    triangles, meshOwners=ReadGlbCount(check)
    assert (triangles,meshOwners)==(79178,240)
    proof={"sourceBlend":str(destination),"sourceBlendSha256":Sha(destination),"reopened":True,
           "materials":len(bpy.data.materials),"packedImages":6,"trackVariants":len(shapes),
           "reexport":str(check),"reexportSha256":Sha(check),"triangles":triangles,"meshOwners":meshOwners}
    (root/"Acceptance"/"Data_Type94WeatherBlendV113.json").write_text(json.dumps(proof,indent=2)+"\n",encoding="utf-8")
    print("TYPE94_WEATHER_BLEND_OK",proof,flush=True)


if __name__=="__main__":
    Main()
