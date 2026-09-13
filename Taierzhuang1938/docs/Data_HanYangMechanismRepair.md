# HanYang handle topology repair

The first-person view previously selected individual steel triangles by their
centroids. This cut the handle socket and also selected long receiver-sleeve
triangles. Rotating and translating that selection exposed holes and lifted an
unrelated strip from the rifle.

`Model_HanYang.tzm.json` now contains a `boltHandle` node with the complete socket,
stem and knob: 3 closed islands, 144 triangles, no boundary edges after welding
coincident attribute-seam vertices at 0.025 mm. The complete rifle retains its
2672 triangles and original position, normal and UV attributes. World rendering
can still batch the node into the body; first-person rendering preserves it and
attaches it to the existing animation pivot. Other rifles retain their current
mechanism construction.

Rebuild from the unsplit imported HanYang asset with Blender using
`_blender/Script_HanYangMechanismRepair.py`, supplying `PROJECT_ROOT` as the
absolute `Taierzhuang1938` directory. The script validates the three closed
islands and preserves every source triangle exactly once. It is idempotent on
an already repaired asset. Re-importing the upstream rifle must reapply this
step before export delivery.

The editable Blender project and review renders are local:
`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYangMeshRepair/Model_HanYangMeshRepair.blend`.
The repaired scene is `Scene_HanYangRepaired`; the diagnostic scene retains the
original mesh for comparison. Review renders use 1280 × 720.

This change repairs the geometry boundary only. It does not change the existing
automatic player bolt-action sequence, empty-magazine behavior, or reload timing.
The HanYang is manually operated: the animation represents the player's hand
operating the bolt, not a mechanical automatic opening after the last shot.
