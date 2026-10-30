"""Rigid rear-door interface pose and its matching inclined armor plane.

Keep the checked door, pins, seal and latch local geometry. The photographed
rear slope changes their common rest pose; it does not shear moving parts.
"""
import math
from mathutils import Matrix, Vector


def RearArmorTransform(layout):
    spec = layout['geometryEstimate']
    pivot = Vector(spec['fixedTopAnchorBeforeGroundM'])
    angle = math.radians(spec['rearSlopeDegrees'])
    return Matrix.Translation(pivot) @ Matrix.Rotation(-angle, 4, 'X') @ Matrix.Translation(-pivot)


def RearArmorForwardAtHeight(z, layout):
    spec = layout['geometryEstimate']
    _, y, topZ = spec['fixedTopAnchorBeforeGroundM']
    return y + math.tan(math.radians(spec['rearSlopeDegrees'])) * (z - topZ)


def RearArmorHalfWidthAtHeight(z, layout, oldBottomZ=.33, bottomHalfWidth=.54, topHalfWidth=.60):
    spec = layout['geometryEstimate']
    topZ = spec['fixedTopAnchorBeforeGroundM'][2]
    cosine = math.cos(math.radians(spec['rearSlopeDegrees']))
    oldZ = topZ + (z - topZ) / cosine
    return bottomHalfWidth + (topHalfWidth - bottomHalfWidth) * (oldZ - oldBottomZ) / (topZ - oldBottomZ)


def PoseRearArmorInterface(hull, fixed, door, keeper, seal, layout):
    transform = RearArmorTransform(layout)
    rotation = transform.to_3x3()
    for owner in [fixed, door, keeper, seal]:
        if owner.parent != hull:
            raise RuntimeError('Rear armor pose requires its original hull owner: ' + owner.name)
        owner.matrix_basis = transform @ owner.matrix_basis
    # BeforeGround markers remain in the hull frame. They are not the mesh's
    # now-rotated owner-local coordinates, so convert them explicitly.
    for owner in [fixed, keeper]:
        for field in ['FootContactPointsBeforeGroundM', 'PinCentersBeforeGroundM']:
            if field not in owner:
                continue
            values = list(owner[field])
            points = [transform @ Vector(values[i:i + 3]) for i in range(0, len(values), 3)]
            owner[field] = [value for point in points for value in point]
        if 'FootNormalBeforeGroundM' in owner:
            owner['FootNormalBeforeGroundM'] = tuple(rotation @ Vector(owner['FootNormalBeforeGroundM']))
    for field in ['ObservationHoleBeforeGroundM', 'ObservedCircularMountBeforeGroundM', 'ObservedBottomAssemblyBeforeGroundM']:
        if field in door:
            door[field] = tuple(transform @ Vector(door[field]))
    oldCenter = Vector(door['DoorCenterBeforeGroundM'])
    door['DoorCenterBeforeGroundM'] = tuple(transform @ oldCenter)
    door['TargetHingeM'] = tuple(door.location)
    door['HingeAxisBeforeGroundM'] = tuple((rotation @ Vector((0, 0, 1))).normalized())
    normal = (rotation @ Vector((0, -1, 0))).normalized()
    hull['RearArmorInclinedRequired'] = True
    hull['RearArmorSlopeDegrees'] = layout['geometryEstimate']['rearSlopeDegrees']
    hull['RearArmorTopAnchorBeforeGroundM'] = layout['geometryEstimate']['fixedTopAnchorBeforeGroundM']
    hull['RearArmorNormalBeforeGroundM'] = tuple(normal)
    hull['RearArmorReferenceLayout'] = 'Data_RearArmorReferenceLayoutV28.json'
    hull['RearArmorPoseBeforeGroundRowMajor'] = [value for row in transform for value in row]
    door['RearArmorSlopeDegrees'] = layout['geometryEstimate']['rearSlopeDegrees']
    door['ReferenceScope'] += '; common rest pose follows the estimated 19-degree rear armor slope; exact dimensions and hidden sections remain inferred'
    fixed['ReferenceScope'] = 'Two hinges follow the inclined rear-door side edge; exact pin, bearing, foot and plate dimensions inferred'
    return transform
