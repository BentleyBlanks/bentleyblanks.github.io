"""Export the connected NRA soldier while retaining legacy segment-node names."""

import bpy
import os

body = bpy.data.objects["Model_NraSoldier_Connected"]
material = body.data.materials[0]
segments = {
    "Segment_hips": (0, 0, 1.00),
    "Segment_chest": (0, 0, 1.38),
    "Segment_neck": (0, 0, 1.67),
    "Segment_armL": (-.35, 0, 1.40),
    "Segment_foreL": (-.43, 0, 1.08),
    "Segment_armR": (.35, 0, 1.40),
    "Segment_foreR": (.43, 0, 1.08),
    "Segment_thighL": (-.115, 0, .80),
    "Segment_shinL": (-.115, 0, .38),
    "Segment_footL": (-.115, -.04, .13),
    "Segment_thighR": (.115, 0, .80),
    "Segment_shinR": (.115, 0, .38),
    "Segment_footR": (.115, -.04, .13),
}
for name, location in segments.items():
    existing = bpy.data.objects.get(name)
    if existing:
        bpy.data.objects.remove(existing, do_unlink=True)
    bpy.ops.mesh.primitive_cube_add(size=.06, location=location)
    marker = bpy.context.view_layer.objects.active
    marker.name = name
    marker.data.materials.append(material)

bpy.ops.object.select_all(action="SELECT")
output = os.path.join(os.path.dirname(bpy.data.filepath), "Model_NraSoldier.glb")
bpy.ops.export_scene.gltf(filepath=output, export_format="GLB", use_selection=True,
                          export_materials="EXPORT")
print("Exported", output)
