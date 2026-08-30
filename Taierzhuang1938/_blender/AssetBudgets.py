# -*- coding: utf-8 -*-
"""TZM source-model triangle rules shared by every Blender importer.

The number compared with a limit is the selected source geometry before generic
decimation.  Deliberately excluded display meshes, alternate states and loose
ammunition stay excluded; historical repair pieces remain an importer concern.
"""

WEAPON_TRIANGLE_LIMIT = 30000
VEHICLE_TRIANGLE_LIMIT = 80000

# User-directed exceptions are based on the checked-in game meshes that existed
# when the rule was approved: 3906 / 4513 / 4534 triangles respectively.
SPECIAL_TRIANGLE_TARGETS = {
    "OfficerSwordSet": 7812,
    "BrowningTripodAssembly": 9026,
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
        return special
    return min(int(source_triangles), TriangleLimit(category))
