"""Build the back-rifle motion and props without embedding a second soldier."""

from copy import deepcopy
import hashlib
import json
from pathlib import Path
import subprocess
from Script_BakeCampaignAppearances import Model, Writer, ROOT, PROJECT, RIG_REVISION


def main():
    folder = PROJECT / "Animation/BackRifleRun"
    old = "Taierzhuang1938/Animation/BackRifleRun/Animation_TengxianNraBackRifleRun.glb"
    library = Model(
        subprocess.check_output(
            ["git", "-C", str(ROOT), "show", RIG_REVISION + ":" + old]
        )
    )
    writer = Writer(library)
    doc = writer.doc
    source = library.doc
    doc["asset"]["generator"] = "Tengxian back-rifle motion and socket props"
    doc["meshes"], doc["materials"], doc["textures"], doc["images"] = [], [], [], []
    doc["extensionsUsed"] = doc["extensionsRequired"] = ["EXT_texture_webp"]
    doc["samplers"] = deepcopy(source.get("samplers", []))
    for node in doc["nodes"]:
        if "mesh" not in node:
            continue
        mesh_index = node.pop("mesh")
        if "skin" in node:
            del node["skin"]
            continue
        mesh = deepcopy(source["meshes"][mesh_index])
        node["mesh"] = len(doc["meshes"])
        doc["meshes"].append(mesh)
        for primitive in mesh["primitives"]:
            material = deepcopy(source["materials"][primitive["material"]])
            primitive["material"] = len(doc["materials"])
            doc["materials"].append(material)
            base = material["pbrMetallicRoughness"].get("baseColorTexture")
            if base:
                texture = deepcopy(source["textures"][base["index"]])
                base["index"] = len(doc["textures"])
                link = texture.get("extensions", {}).get("EXT_texture_webp", texture)
                image = deepcopy(source["images"][link["source"]])
                link["source"] = len(doc["images"])
                doc["textures"].append(texture)
                view = source["bufferViews"][image["bufferView"]]
                start = view.get("byteOffset", 0)
                block = library.data[start : start + view["byteLength"]]
                writer.data.extend(bytes(-len(writer.data) % 4))
                image["bufferView"] = len(doc["bufferViews"])
                doc["bufferViews"].append(
                    {
                        "buffer": 0,
                        "byteOffset": len(writer.data),
                        "byteLength": len(block),
                    }
                )
                writer.data.extend(block)
                doc["images"].append(image)
            primitive["attributes"] = {
                name: writer.copy_accessor(library, i)
                for name, i in primitive["attributes"].items()
            }
            primitive["indices"] = writer.copy_accessor(library, primitive["indices"])
    for skin in doc["skins"]:
        skin["inverseBindMatrices"] = writer.copy_accessor(
            library, skin["inverseBindMatrices"]
        )
    doc["animations"] = deepcopy(source["animations"])
    for clip in doc["animations"]:
        for sampler in clip["samplers"]:
            for key in ("input", "output"):
                sampler[key] = writer.copy_accessor(library, sampler[key])
    output = folder / "Animation_BackRifleRunMotion.glb"
    output.write_bytes(writer.encode())
    config_path = folder / "Data_BackRifleRun.json"
    config = json.loads(config_path.read_text(encoding="utf-8-sig"))
    config["sourceModel"] = (
        "Taierzhuang1938/Model/Character/Model_HeYoutianHumanoid.glb"
    )
    config["sourceModelSha256"] = hashlib.sha256(
        (ROOT / config["sourceModel"]).read_bytes()
    ).hexdigest()
    config["assetRevision"] = hashlib.sha256(output.read_bytes()).hexdigest()[:16]
    config_path.write_text(
        json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(output.name, output.stat().st_size)


if __name__ == "__main__":
    main()
