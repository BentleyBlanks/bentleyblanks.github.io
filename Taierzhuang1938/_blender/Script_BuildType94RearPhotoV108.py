"""Save the refitted Type 94 high source before preparing the matching low."""

import os
from pathlib import Path
import shutil
import sys

import bpy

sys.path.insert(0,str(Path(__file__).resolve().parent))
from Script_BuildType94PhotoV107 import ReadJson, Sha, WriteJson, defaultSource
from Script_Type94RearMudguardV108 import REAR_PROFILE, ReplaceRearMudguards


root=Path(os.environ.get("TYPE94_PHOTO_ROOT",defaultSource/"PhotoReconstructionV108"))
acceptance=root/"Acceptance"
sourceRoot=defaultSource/"PhotoReconstructionV107"
highBlend=root/"Scene_Type94TanketteHighV108.blend"
lowGeometryBlend=root/"Scene_Type94TanketteGameGeometryV108.blend"


def Build(high):
    acceptance.mkdir(parents=True,exist_ok=True)
    prior=ReadJson(sourceRoot/"Acceptance"/("Data_Type94HighV107.json" if high else "Data_Type94LowGeometryV107.json"))
    seed=Path(prior["scene"])
    if Sha(seed)!=prior["sha256"]:
        raise RuntimeError("The preserved V107 source has changed")
    if not high:
        highProof=ReadJson(acceptance/"Data_Type94HighV108.json")
        if Sha(highBlend)!=highProof["sha256"]:
            raise RuntimeError("The low recipe requires the saved V108 high source")
    bpy.ops.wm.open_mainfile(filepath=str(seed))
    scene=bpy.context.scene
    asset=bpy.data.objects["Type94Tankette"]
    if scene.get("BlenderMcpTask")!="Type94Tankette":
        raise RuntimeError("This recipe requires the dedicated Type 94 source")
    poses={obj.name:obj.matrix_world.copy() for obj in [asset,*asset.children_recursive]}
    changed=ReplaceRearMudguards(asset,high)
    bpy.context.view_layer.update()
    for name,matrix in poses.items():
        if matrix!=bpy.data.objects[name].matrix_world:
            raise ValueError(f"V108 moved the retained frame {name}")
    scene["SurfaceGeometryRevision"]="PhotoExteriorV108"
    scene["RearFendersRebuiltFromViews"]="Patriot official 3 / 4 / 6"
    scene["Type94PhotoSourceSeedSha256"]=prior["sha256"]
    scene["Type94PhotoGameProjectionPending"]=not high
    meshes=[obj for obj in asset.children_recursive if obj.type=="MESH"]
    triangles=0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles+=len(obj.data.loop_triangles)
    if len(meshes)!=240 or len(poses)!=296 or (not high and triangles>80000):
        raise ValueError("The retained rigid assembly or game budget changed")
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.object.select_all(action="DESELECT")
    asset.select_set(True)
    bpy.context.view_layer.objects.active=asset
    destination=highBlend if high else lowGeometryBlend
    bpy.ops.wm.save_as_mainfile(filepath=str(destination))
    report=dict(scene=str(destination),sha256=Sha(destination),seedSha256=prior["sha256"],
        high=high,triangles=triangles,meshOwners=len(meshes),nodes=len(poses),
        changes=dict(tailPanelsReplaced=changed,connectedRearMudguards=2,allRetainedNodeMatricesExact=True),
        rearFenderProfileYZDerivative=REAR_PROFILE)
    if high:
        report["packedSourceImages"]=prior["packedSourceImages"]
        for image in report["packedSourceImages"]:
            relative=Path(image["file"])
            original=sourceRoot/relative
            if Sha(original)!=image["sha256"]:
                raise ValueError(f"The retained packed image changed at {original}")
            texture=root/relative
            texture.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(original,texture)
    else:
        report["highSourceSha256"]=highProof["sha256"]
    WriteJson(acceptance/("Data_Type94HighV108.json" if high else "Data_Type94LowGeometryV108.json"),report)
    print(f"TYPE94_V108_BUILT {destination} {triangles}",flush=True)


if __name__=="__main__":
    phase=os.environ.get("TYPE94_PHOTO_PHASE","High")
    if phase not in {"High","LowGeometry"}:
        raise ValueError(f"Unknown rear build phase {phase}")
    Build(phase=="High")
