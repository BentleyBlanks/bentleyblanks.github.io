"""Save the refitted Type 94 high source before preparing the matching low."""

import os
from pathlib import Path
import shutil
import sys

import bpy

sys.path.insert(0,str(Path(__file__).resolve().parent))
from Script_BuildType94PhotoV107 import ReadJson, Sha, WriteJson, defaultSource
from Script_Type94RearDatumV111 import FitRearFolds
from Script_Type94RearMudguardV108 import REAR_PROFILE, ReplaceRearMudguards
from Script_Type94RearTaperV109 import SweepRearRim


revision=os.environ.get("TYPE94_PHOTO_REVISION","V108")
baselines={"V108":"V107","V109":"V108","V111":"V109"}
if revision not in baselines:
    raise ValueError(f"Unknown rear source revision {revision}")
baseline=baselines[revision]
root=Path(os.environ.get("TYPE94_PHOTO_ROOT",defaultSource/f"PhotoReconstruction{revision}"))
acceptance=root/"Acceptance"
sourceRoot=defaultSource/f"PhotoReconstruction{baseline}"
highBlend=root/f"Scene_Type94TanketteHigh{revision}.blend"
lowGeometryBlend=root/f"Scene_Type94TanketteGameGeometry{revision}.blend"


def Build(high):
    acceptance.mkdir(parents=True,exist_ok=True)
    sourceKind="High" if high else "LowGeometry"
    prior=ReadJson(sourceRoot/"Acceptance"/f"Data_Type94{sourceKind}{baseline}.json")
    seed=Path(prior["scene"])
    if Sha(seed)!=prior["sha256"]:
        raise RuntimeError(f"The preserved {baseline} source has changed")
    if not high:
        highProof=ReadJson(acceptance/f"Data_Type94High{revision}.json")
        if Sha(highBlend)!=highProof["sha256"]:
            raise RuntimeError(f"The low recipe requires the saved {revision} high source")
    bpy.ops.wm.open_mainfile(filepath=str(seed))
    scene=bpy.context.scene
    asset=bpy.data.objects["Type94Tankette"]
    if scene.get("BlenderMcpTask")!="Type94Tankette":
        raise RuntimeError("This recipe requires the dedicated Type 94 source")
    poses={obj.name:obj.matrix_world.copy() for obj in [asset,*asset.children_recursive]}
    if revision=="V108":
        changes=dict(tailPanelsReplaced=ReplaceRearMudguards(asset,high),connectedRearMudguards=2)
        scene["RearFendersRebuiltFromViews"]="Patriot official 3 / 4 / 6"
    elif revision=="V109":
        changes=SweepRearRim(asset)
        scene["RearFenderTaperDerivedFromViews"]="Patriot views 3, 4 and 5"
    else:
        changes=FitRearFolds(asset)
        scene["RearFendersRebuiltFromViews"]="Patriot rear stereo, elevated 2022 rear photograph and held-out wheel contours"
    bpy.context.view_layer.update()
    for name,matrix in poses.items():
        if matrix!=bpy.data.objects[name].matrix_world:
            raise ValueError(f"{revision} moved the retained frame {name}")
    changes["allRetainedNodeMatricesExact"]=True
    scene["SurfaceGeometryRevision"]=f"PhotoExterior{revision}"
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
        changes=changes,
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
    WriteJson(acceptance/f"Data_Type94{sourceKind}{revision}.json",report)
    print(f"TYPE94_{revision}_BUILT {destination} {triangles}",flush=True)


if __name__=="__main__":
    phase=os.environ.get("TYPE94_PHOTO_PHASE","High")
    if phase not in {"High","LowGeometry"}:
        raise ValueError(f"Unknown rear build phase {phase}")
    Build(phase=="High")
