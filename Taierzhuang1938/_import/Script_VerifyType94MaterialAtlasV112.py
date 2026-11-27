"""Check the actual V112 export against the original V111 pixels, surfaces and articulated scene."""
from argparse import ArgumentParser
from hashlib import sha256
import json
from pathlib import Path

import numpy as np

from Script_MergeType94MaterialsV112 import (
    BuildAtlases, OpenTexture, ReadGlb, SIZE, SOLIDS, TEXTURED, TextureImage, UvArray, ViewBytes,
)


def TextureBindings(material):
    pbr = material["pbrMetallicRoughness"]
    assert pbr["metallicRoughnessTexture"] == material["occlusionTexture"]
    return {
        "Base": pbr["baseColorTexture"]["index"],
        "Normal": material["normalTexture"]["index"],
        "Orm": material["occlusionTexture"]["index"],
    }


def Verify(before, after):
    oldBytes, old, oldBin = ReadGlb(before)
    newBytes, new, newBin = ReadGlb(after)
    for key in ("asset", "scenes", "scene", "nodes", "samplers", "animations", "skins"):
        assert old.get(key) == new.get(key), key

    paint, details = new["materials"]
    assert [material["name"] for material in new["materials"]] == ["Material_Type94Paint", "Material_Type94Details"]
    assert len(new["images"]) == 6
    oldPaint = old["materials"][0]

    for role, originalBinding in TextureBindings(oldPaint).items():
        latestBinding = TextureBindings(paint)[role]
        a = old["images"][TextureImage(old, originalBinding)]
        b = new["images"][TextureImage(new, latestBinding)]
        assert a["mimeType"] == b["mimeType"] and ViewBytes(old, oldBin, a["bufferView"]) == ViewBytes(new, newBin, b["bufferView"]), role
    previousCoat = oldPaint["extensions"]["KHR_materials_clearcoat"]
    newCoat = paint["extensions"]["KHR_materials_clearcoat"]
    for prop in ("clearcoatFactor", "clearcoatRoughnessFactor"):
        assert previousCoat[prop] == newCoat[prop]
    assert TextureImage(new, newCoat["clearcoatNormalTexture"]["index"]) == TextureImage(new, paint["normalTexture"]["index"])

    materialList = old["materials"]
    names = {material["name"]: material for material in materialList}
    expectedAtlas = BuildAtlases(old, oldBin, names)
    for channel, slot in TextureBindings(details).items():
        image = OpenTexture(new, newBin, slot)
        assert image.size == SIZE and image.tobytes() == expectedAtlas[channel].tobytes(), channel

    assert len(old["meshes"]) == len(new["meshes"])
    oldUv = {}
    maxDelta = 0.
    attributes = set()
    for left, right in zip(old["meshes"], new["meshes"]):
        assert left.get("name") == right.get("name")
        assert len(left["primitives"]) == len(right["primitives"])
        for a, b in zip(left["primitives"], right["primitives"]):
            assert {k:v for k,v in a.items() if k!="material"} == {k:v for k,v in b.items() if k!="material"}
            material = materialList[a["material"]]["name"]
            assert b["material"] == (0 if material == oldPaint["name"] else 1)
            uv = a["attributes"]["TEXCOORD_0"]
            assert oldUv.setdefault(uv, material) == material
            attributes.update(a["attributes"][k] for k in ("POSITION","NORMAL","TANGENT"))
            attributes.add(a["indices"])

    for index in attributes:
        oldAccess = old["accessors"][index]
        newAccess = new["accessors"][index]
        assert {k:v for k,v in oldAccess.items() if k != "bufferView"} == {k:v for k,v in newAccess.items() if k != "bufferView"}
        assert ViewBytes(old, oldBin, oldAccess["bufferView"]) == ViewBytes(new, newBin, newAccess["bufferView"]), index

    for index, role in oldUv.items():
        original = UvArray(old, oldBin, index)
        remapped = UvArray(new, newBin, index)
        if role == oldPaint["name"]:
            assert np.array_equal(original, remapped)
            continue
        x, y, width, height = (TEXTURED | SOLIDS)[role]
        if role in SOLIDS:
            x += 20
            y += 20
            width -= 40
            height -= 40
        actual = remapped.astype(np.float64) * SIZE
        expected = original.astype(np.float64) * (width, height) + (x, y)
        maxDelta = max(maxDelta,float(np.max(np.abs(actual - expected))))
    assert maxDelta < .001
    activeNodes = list(new["scenes"][new["scene"]]["nodes"])
    instanceTriangles, instanceOwners = 0, 0
    while activeNodes:
        node = new["nodes"][activeNodes.pop()]
        activeNodes.extend(node.get("children", []))
        if "mesh" not in node:
            continue
        instanceOwners += 1
        for primitive in new["meshes"][node["mesh"]]["primitives"]:
            count = new["accessors"][primitive["indices"]]["count"]
            assert count % 3 == 0
            instanceTriangles += count // 3
    assert (instanceTriangles,instanceOwners)==(79178,240)
    return {
        "beforeSha256": sha256(oldBytes).hexdigest(),
        "afterSha256": sha256(newBytes).hexdigest(),
        "materialsBefore": len(old["materials"]),
        "materialsAfter": len(new["materials"]),
        "imagesBefore": len(old["images"]),
        "imagesAfter": len(new["images"]),
        "meshOwners": instanceOwners,
        "poseNodes": len(new["nodes"]),
        "triangles": instanceTriangles,
        "allPositionNormalTangentAndIndexBuffersIdentical": True,
        "allNodePoseHierarchyAndExtrasIdentical": True,
        "paintTexturesAndClearcoatIdentical": True,
        "atlasPixelsExact": True,
        "uncoatedSourceTexelsCopiedAtOriginalResolution": True,
        "maxRemapErrorPx": maxDelta,
        "passed": True,
    }


if __name__ == "__main__":
    parser=ArgumentParser(description=__doc__)
    parser.add_argument("--before",type=Path,required=True)
    parser.add_argument("--after",type=Path,required=True)
    parser.add_argument("--report",type=Path,required=True)
    args=parser.parse_args()
    report=Verify(args.before,args.after)
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report))
