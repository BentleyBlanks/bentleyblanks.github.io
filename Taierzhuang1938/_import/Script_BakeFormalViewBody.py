"""Build the player's partial body and default sleeves/hands from the current He Youtian mesh.
Reuse the approved viewmodel bind and authored clips without shipping the previous visible geometry.
"""

from copy import deepcopy
import subprocess
import numpy as np
from Script_BakeCampaignAppearances import (
    DIRECTORY,
    PROJECT,
    ROOT,
    RIG_REVISION,
    Model,
    Writer,
    MeshOnRig,
)


def build(part, previous):
    path = "Taierzhuang1938/Model/" + previous + ".glb"
    rig = Model(
        subprocess.check_output(
            ["git", "-C", str(ROOT), "show", RIG_REVISION + ":" + path]
        )
    )
    actor = Model((DIRECTORY / "Model_HeYoutian.glb").read_bytes())
    positions, normals, uv, joints, weights, indices, _ = MeshOnRig(actor, rig)
    triangles = indices.reshape(-1, 3)
    names = rig.joints()
    arms = np.array(
        [
            any(
                word in name
                for word in ("Clavicle", "UpperArm", "Forearm", "Hand", "Finger")
            )
            for name in names
        ]
    )
    face = np.array([any(word in name for word in ("Head", "Neck")) for name in names])
    arm_weight = (arms[joints] * weights).sum(axis=1)
    face_weight = (face[joints] * weights).sum(axis=1)
    if part == "Arms":
        selected = (arm_weight > 0.50) & (np.abs(positions[:, 0]) > 0.215)
    else:
        selected = (
            (arm_weight < 0.32) & (face_weight < 0.12) & (positions[:, 1] <= 1.43)
        )
    kept = triangles[selected[triangles].all(axis=1)]
    vertices, reindexed = np.unique(kept, return_inverse=True)
    if not len(kept):
        raise ValueError("No triangles in " + part)
    output = Writer(rig)
    doc = output.doc
    name = "HeYoutianView" + part
    material = actor.doc["materials"][0]["name"]
    doc.setdefault("extras", {})["appearanceMaterial"] = {
        "file": "Character/Model_HeYoutian.glb",
        "material": material,
    }
    doc["asset"]["generator"] = (
        "He Youtian first-person skin on the calibrated player rig"
    )
    doc["materials"] = [
        {
            "name": material,
            "pbrMetallicRoughness": {"metallicFactor": 0, "roughnessFactor": 0.8},
        }
    ]
    for node in doc["nodes"]:
        if "mesh" in node:
            node.update(name=name, mesh=0)
        if node.get("extras", {}).get("fpsArmSource"):
            node["extras"]["fpsArmSource"] = "Model_HeYoutian"
        if node.get("name") == "Rig_FpsArmsNraSkeletal01":
            node["name"] = "Rig_HeYoutianViewArms"
        if node.get("name") == "Character_LugouNra01":
            node["name"] = "Character_HeYoutianViewBody"
    attrs = {
        "POSITION": output.add(positions[vertices], "VEC3", bounds=True),
        "NORMAL": output.add(normals[vertices], "VEC3"),
        "TEXCOORD_0": output.add(uv[vertices], "VEC2"),
        "JOINTS_0": output.add(joints[vertices], "VEC4", 5121),
        "WEIGHTS_0": output.add(weights[vertices], "VEC4"),
    }
    doc["meshes"] = [
        {
            "name": name,
            "primitives": [
                {
                    "attributes": attrs,
                    "indices": output.add(reindexed, "SCALAR", 5123),
                    "material": 0,
                }
            ],
        }
    ]
    for skin in doc["skins"]:
        skin["inverseBindMatrices"] = output.copy_accessor(
            rig, skin["inverseBindMatrices"]
        )
    doc["animations"] = deepcopy(rig.doc["animations"])
    for clip in doc["animations"]:
        for sampler in clip["samplers"]:
            for key in ("input", "output"):
                sampler[key] = output.copy_accessor(rig, sampler[key])
    filename = PROJECT / "Model" / ("Model_" + name + ".glb")
    filename.write_bytes(output.encode())
    print(
        filename.name,
        len(vertices),
        len(kept),
        positions[vertices].min(axis=0),
        positions[vertices].max(axis=0),
    )


if __name__ == "__main__":
    build("Body", "Model_FirstPersonBody")
    build("Arms", "Model_FpsArmsNraSkeletal01")
