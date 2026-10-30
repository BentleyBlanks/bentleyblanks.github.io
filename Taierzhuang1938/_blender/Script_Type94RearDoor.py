"""Selected rear face and a separately declared concealed lock demonstration.

Only observed exterior fittings are shown. Their purposes are unverified and
they remain static relative to the door. The interior cam is engineering
inference, not a reconstruction of an identified museum mechanism.
"""
import math
from mathutils import Vector


def BuildRearDoorFace(api, cover, door, axis, rearY, doorY, centerZ, height, layout):
    Empty, Box, Cylinder = (api[name] for name in ['Empty', 'Box', 'Cylinder'])
    Lathe, RoundedPlate, Rivet = (api[name] for name in ['Lathe', 'RoundedPlate', 'Rivet'])
    CutWith = api['CutWith']

    def Point(uv, y):
        return Vector(((uv[0] - .5) * .60, y, centerZ + (.5 - uv[1]) * height))

    aperture = layout['hole']
    hole = Point(aperture['centerUv'], doorY)
    width, length = .60 * aperture['widthHeightUv'][0], height * aperture['widthHeightUv'][1]
    cutter = RoundedPlate('TemporaryRearObservedHole', (0, 0, 0), width, length, .14,
                          min(width, length) / 2, role='Dark', parent=door)
    cutter.location = hole - axis
    cutter.rotation_euler.x = math.pi / 2
    # This cutter is a hole profile, not a manufactured edge bevel: its .75 mm
    # bevel must not reduce the observed opening or add cutter corner artifacts.
    cutter.modifiers.clear()
    CutWith(cover, cutter)

    mount = Point(layout['circularMount']['centerUv'], doorY)
    lock = layout['concealedLatch']
    spindle = Vector((lock['spindleXM'], doorY, centerZ + lock['spindleOffsetZFromDoorCenterM']))
    cutter = Cylinder('TemporaryRearConcealedBore', spindle - axis,
                      lock['boreRadiusM'], .16, 'Dark', 'Y', door, 40)
    CutWith(cover, cutter)
    radius = .60 * layout['circularMount']['diameterUvWidth'] / 2
    bore = lock['boreRadiusM']
    profile = [(bore, -.0035), (radius, -.0035), (radius, .0035),
               (bore, .0035), (bore, -.0035)]
    mountingPlate = Lathe('Rear_ObservedCircularMount', profile,
                          mount + Vector((0, -.0105, 0)) - axis,
                          'Y', parent=door, segments=48)
    # An annular plate has flat front/back faces. Smoothing those across the
    # cylindrical rim made the flat geometry look like an unsupported bulb.
    for polygon in mountingPlate.data.polygons:
        polygon.use_smooth = polygon.index // 48 in [1, 3]
    for index, degrees in enumerate([45, 165, 285]):
        angle = math.radians(degrees)
        point = mount + Vector((.018 * math.cos(angle), -.014, .018 * math.sin(angle)))
        Rivet('Rear_ObservedMountHead' + str(index), point - axis, (0, -1, 0), .0032, door)

    for row in layout['faceHeads']:
        Rivet('Rear_ObservedFaceHead' + row['id'],
              Point(row['centerUv'], doorY - .007) - axis, (0, -1, 0), .0053, door)

    bottom = layout['bottomAssembly']
    base = Point(bottom['centerUv'], doorY - .009)
    bottomWidth, bottomHeight = .60 * bottom['widthHeightUv'][0], height * bottom['widthHeightUv'][1]
    plate = RoundedPlate('Rear_ObservedBottomPlate', (0, 0, 0), bottomWidth,
                         bottomHeight, .004, .012, parent=door)
    plate.location = base - axis
    plate.rotation_euler.x = math.pi / 2
    # The small fitting has no independent control: its actual purpose and
    # hidden sections remain unverified, so only its visible static envelope is shown.
    Box('Rear_ObservedBottomUpright', base + Vector((-.022, -.009, .002)) - axis,
        (.009, .014, .061), parent=door, bevel=.001)
    Cylinder('Rear_ObservedBottomEye', base + Vector((-.008, -.017, -.007)) - axis,
             .0065, .026, axis='X', parent=door, vertices=24)
    for x, z in [(-.031, -.025), (-.031, .026), (.014, -.028), (.033, -.028)]:
        Rivet('Rear_ObservedBottomHead', base + Vector((x, -.003, z)) - axis,
              (0, -1, 0), .0035, door)

    # Interior-only cam. Its outer paint fittings are static and are not used
    # as proof that a particular observed boss had a latching function.
    bearingStart, bearingEnd = doorY + .007, rearY + .040
    bearing = [(0.0049, bearingStart), (.010, bearingStart),
               (.010, bearingEnd), (.0049, bearingEnd), (.0049, bearingStart)]
    Lathe('Rear_InferredInteriorBearing', bearing,
          Vector((spindle.x, 0, spindle.z)) - axis, 'Y', parent=door, segments=40)
    latchPoint = Vector((spindle.x, rearY + .042, spindle.z))
    latch = Empty('RearDoorLatchTurner', latchPoint - axis, door)
    latch['HingeAxisLocal'] = 'Y'
    latch['OpenSignLocal'] = 1
    latch['ReleaseAngleDeg'] = lock['releaseAngleDeg']
    latch['ReferenceScope'] = lock['scope']
    latch['HistoricalMechanismAccepted'] = False
    latch['ConcealedEngineeringDemonstration'] = True
    latch['FixedBearingInnerRadiusM'] = .0049
    latch['SpindleRadiusM'] = lock['spindleRadiusM']
    latch['DoorBoreRadiusM'] = bore
    armLength = spindle.x - lock['keeperXM'] + .012
    arm = RoundedPlate('Rear_InferredInteriorCam', (0, 0, 0), armLength,
                       .018, .006, .007, parent=latch)
    arm.location = (-armLength / 2, .009, 0)
    arm.rotation_euler.x = math.pi / 2
    shaftStart, shaftEnd = doorY - .006, rearY + .054
    Cylinder('Rear_InferredInteriorSpindle',
             (0, (shaftStart + shaftEnd) / 2 - latchPoint.y, 0),
             lock['spindleRadiusM'], shaftEnd - shaftStart, 'Steel', 'Y', latch, 40)

    keeper = Empty('RearDoorLatchKeeperFixed', parent=api['PARTS']['Hull'])
    keeperX = -.333
    Box('Rear_InferredInteriorKeeperFoot', (keeperX, rearY + .010, spindle.z),
        (.022, .004, .085), parent=keeper, bevel=0)
    for offset in [-.032, .032]:
        Box('Rear_InferredInteriorKeeperBridge', (keeperX, rearY + .028, spindle.z + offset),
            (.016, .032, .008), parent=keeper, bevel=.001)
    Box('Rear_InferredInteriorKeeperFace', (lock['keeperXM'], rearY + .044, spindle.z),
        (.040, .004, .085), parent=keeper, bevel=.001)
    for offset in [-.030, .030]:
        Rivet('Rear_InferredInteriorKeeperHead',
              (keeperX, rearY + .042, spindle.z + offset), (0, -1, 0), .0045, keeper)
    keeper['FootContactPointsBeforeGroundM'] = [value for x in [keeperX - .011, keeperX + .011]
        for z in [spindle.z - .0425, spindle.z + .0425] for value in (x, rearY + .008, z)]
    keeper['FootNormalBeforeGroundM'] = (0, 1, 0)
    keeper['ReferenceScope'] = lock['scope']
    keeper['ConcealedEngineeringDemonstration'] = True
    door['RearDoorFaceRequired'] = True
    door['RearDoorFaceLayout'] = 'Data_RearDoorFaceLayoutV29.json'
    door['ObservationHoleBeforeGroundM'] = tuple(hole)
    door['ObservationHoleWidthHeightM'] = (width, length)
    door['ObservedCircularMountBeforeGroundM'] = tuple(mount)
    door['ObservedBottomAssemblyBeforeGroundM'] = tuple(base)
    door['ExteriorSphericalGripPresent'] = False
    door['ObservedFittingFunctionsAccepted'] = False
    door['BottomAssemblyIndependentMotion'] = False
    door['ConcealedLatchInferred'] = True
    door['LatchReleaseFraction'] = lock['releaseFraction']
    door['ReferenceScope'] = 'Selected museum face: open rounded hole, static circular mount and bottom assembly; exact dimensions/functions unaccepted. Concealed lock is an engineering demonstration only.'
    return keeper
