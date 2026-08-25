"""Export Model_NraSoldier.glb from Scene_NraSoldierRefined.blend.

Usage:
  blender --background Scene_NraSoldierRefined.blend --python Script_ExportNraSoldier.py

The scene layout is the contract with Script_RiggedModel.mjs SegmentedCharacterSkin:
- 13 root-level Segment_* mesh objects. Each object's location is the rest pivot
  of its game joint, geometry is baked in that pivot's local space, and the whole
  segmented figure faces Blender +Y (glTF -Z). Segment mode attaches these nodes
  raw, so unlike the skinned fallback path it never applies the pi Y-flip -- a
  figure baked facing -Y shows the game its back (the pre-2026-08-25 defect).
- CharacterArmature/Body (facing -Y) plus the source animations stay in the GLB
  for the skinned fallback path, which does apply the flip. Do not rotate them.
- The "glTF_not_exported" collection is skipped by the exporter by convention.

A rebuild of the export recipe deleted in 41907824; the previous
Script_ExportNraSoldierCompatibility.py belonged to the marker-cube era.
"""
import os

import bpy

output = os.path.join(os.path.dirname(bpy.data.filepath), "Model_NraSoldier.glb")
segments = [obj for obj in bpy.data.objects if obj.name.startswith("Segment_")]
assert len(segments) == 13, f"expected 13 Segment_* objects, found {len(segments)}"
for obj in segments:
    assert obj.parent is None, f"{obj.name} must stay a root node for SegmentedCharacterSkin"

bpy.ops.export_scene.gltf(filepath=output, export_format="GLB", export_animation_mode="ACTIONS")
print("Exported", output)
