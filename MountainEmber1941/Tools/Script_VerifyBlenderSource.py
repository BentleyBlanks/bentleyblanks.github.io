"""Run in a separate Blender --background --factory-startup process; never rebuild assets."""
import bpy
import json
import os


def VerifyBlenderSource():
    projectRoot = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(projectRoot, "Data_SourceProject.json"), encoding="utf-8") as sourceProjectFile:
        sourceProject = json.load(sourceProjectFile)
    sourcePath = os.path.join(
        os.environ.get(sourceProject["rootEnvironment"], sourceProject["defaultRoot"]),
        sourceProject["directory"], sourceProject["fileName"],
    )
    if os.path.getsize(sourcePath) <= 1_000_000:
        raise AssertionError("Full source blend must be nontrivial (> 1 MB)")
    bpy.ops.wm.open_mainfile(filepath=sourcePath)
    collection = bpy.data.collections.get("MountainEmber1941_ArtPass")
    if collection is None or not collection.all_objects:
        raise AssertionError("Editable art collection is missing")
    expectedEnvironments = {"Model_EnvironmentCounty", "Model_EnvironmentNorthVillage", "Model_EnvironmentQuarrySlope"}
    if not expectedEnvironments.issubset({obj.name for obj in collection.all_objects}):
        raise AssertionError("Source must retain all three authored environments")
    for sourceImage in bpy.data.images:
        if sourceImage.source == "FILE" and sourceImage.filepath and not sourceImage.packed_file:
            raise AssertionError("Source texture is not packed: " + sourceImage.name)
    if bpy.data.libraries:
        raise AssertionError("Source must not depend on external blend libraries")
    print(json.dumps({"sourceBlend": sourcePath, "objects": len(collection.all_objects),
                      "images": len(bpy.data.images), "verified": True}))


if __name__ == "__main__":
    VerifyBlenderSource()
