"""Fit the terminal folds to the rear stereo survey without moving the assembly."""

import bpy
from mathutils import Vector

from Script_Type94PhotoMaterialsV107 import POINT_ATTRIBUTE


FOLD_START_Y_M = -1.175
FOLD_END_Y_M = -1.365
END_OFFSETS_M = {
    -1: (0.037, -0.035, -0.0535),
    1: (0.0373, 0.015, -0.0775),
}


def FitRearFolds(asset):
    hull = bpy.data.objects["Geometry_Hull_Paint"]
    if hull not in asset.children_recursive or hull.type != "MESH":
        raise ValueError("The photographed Type 94 hull is missing")
    mesh = hull.data
    fold = mesh.attributes["Type94RearFoldV108"]
    shading = mesh.attributes[POINT_ATTRIBUTE]
    if fold.domain != "POINT" or fold.data_type != "BOOLEAN" or shading.domain != "POINT":
        raise ValueError("The rear-fold mask or author positions are unavailable")

    localToWorld = hull.matrix_world.copy()
    worldToLocal = localToWorld.inverted()
    localNormalToWorld = worldToLocal.to_3x3().transposed()
    worldNormalToLocal = localToWorld.to_3x3().transposed()
    normals = [n.vector.copy() for n in mesh.corner_normals]
    span = FOLD_START_Y_M - FOLD_END_Y_M
    changes = {}
    affected = {-1: 0, 1: 0}
    movement = {side: Vector(offset) for side, offset in END_OFFSETS_M.items()}

    for vertex in mesh.vertices:
        point = localToWorld @ vertex.co
        if not fold.data[vertex.index].value or point.y >= FOLD_START_Y_M:
            continue
        side = -1 if point.x < 0 else 1
        distance = min(1.0, (FOLD_START_Y_M - point.y) / span)
        blend = distance * distance * (3.0 - 2.0 * distance)
        slope = -6.0 * distance * (1.0 - distance) / span
        vertex.co = worldToLocal @ (point + movement[side] * blend)
        shading.data[vertex.index].vector = vertex.co
        changes[vertex.index] = (movement[side], slope)
        affected[side] += 1

    if min(affected.values()) < 20:
        raise ValueError(f"Incomplete rear-fold selection: {affected}")
    for corner in mesh.loops:
        change = changes.get(corner.vertex_index)
        if change is None:
            continue
        offset, slope = change
        normal = localNormalToWorld @ normals[corner.index]
        # Carry the existing bevel normals through the inverse-transpose Jacobian.
        normal.y -= slope * offset.dot(normal) / (1.0 + offset.y * slope)
        normals[corner.index] = (worldNormalToLocal @ normal).normalized()
    mesh.normals_split_custom_set([tuple(normal) for normal in normals])
    mesh.update()
    return dict(
        patchedVertices={"left": affected[-1], "right": affected[1]},
        endOffsetsM={"left": END_OFFSETS_M[-1], "right": END_OFFSETS_M[1]},
        transitionWorldYM=[FOLD_START_Y_M, FOLD_END_Y_M],
    )
