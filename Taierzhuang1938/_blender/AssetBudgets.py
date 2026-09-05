# -*- coding: utf-8 -*-
"""TZM source-model triangle rules shared by every Blender importer.

The number compared with a limit is the selected source geometry before generic
decimation.  Deliberately excluded display meshes, alternate states and loose
ammunition stay excluded; historical repair pieces remain an importer concern.
"""

WEAPON_TRIANGLE_LIMIT = 30000
VEHICLE_TRIANGLE_LIMIT = 80000
MIN_DECIMATION_REDUCTION = 0.05

# User-directed exceptions are based on the checked-in game meshes that existed
# when the rule was approved: 3906 / 4513 / 4534 triangles respectively.
SPECIAL_TRIANGLE_TARGETS = {
    "OfficerSwordSet": 7812,
    "MediumMortar": 9068,
}


def TriangleLimit(category):
    if category == "weapon":
        return WEAPON_TRIANGLE_LIMIT
    if category == "vehicle":
        return VEHICLE_TRIANGLE_LIMIT
    raise ValueError("没有源模型三角阈值的类别：%s" % category)


def TriangleTarget(name, category, source_triangles):
    """Return the highest allowed/desired final count for selected source geometry."""
    special = SPECIAL_TRIANGLE_TARGETS.get(name)
    if special is not None:
        return TriangleTargetForDesired(source_triangles, special)
    return TriangleTargetForDesired(source_triangles, TriangleLimit(category))


def TriangleTargetForDesired(source_triangles, desired_triangles=None):
    """Resolve a requested target without doing cosmetic reductions.

    ``None`` means preserve the selected source topology.  A requested target
    that would remove five percent or less also preserves the source: such a
    small reduction pays the full topology-rewrite cost without a meaningful
    scene saving.
    """
    source = int(source_triangles)
    if source <= 0:
        raise ValueError("源模型三角数必须为正数：%s" % source_triangles)
    if desired_triangles is None:
        return source
    desired = max(1, min(source, int(desired_triangles)))
    reduction = (source - desired) / source
    return source if reduction <= MIN_DECIMATION_REDUCTION else desired
