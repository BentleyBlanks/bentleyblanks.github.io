"""Curved rear turret hatch, observed separately from the small side covers.

Called by the Type94 recipe. All coordinates here are in the retained turret
frame. Concealed sections and travel remain explicitly inferred in the layout.
"""
import bpy
import math
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def BuildTurretRear(shell, turret, helpers, layout):
    makeMesh = helpers['Mesh']
    empty = helpers['Empty']
    lathe = helpers['Lathe']
    cylinder = helpers['Cylinder']
    plate = helpers['Plate']
    rivet = helpers['Rivet']
    cutWith = helpers['CutWith']
    spec = layout['geometryEstimate']
    centerAngle = spec['centerAngleRad']
    width = spec['widthAlongConeMidHeightM']
    bottom = spec['bottomZInTurretM']
    top = spec['topZInTurretM']
    centerZ = (bottom + top) / 2
    radiusAtCenter = .419 + (.352 - .419) * (centerZ - .105) / (.494 - .105)
    slope = (.352 - .419) / (.494 - .105)
    radiusFunction=helpers.get('TurretRadiusAt')if helpers.get('TURRET_LAYOUT')else None
    if radiusFunction:
        radiusAtCenter=radiusFunction(centerZ)
        slope=-helpers['TURRET_LAYOUT']['coneSlope']
    # Preserve the actual authored facets before cutting the opening. Both the
    # cover back and mounting feet follow these surfaces, not an ideal circle.
    surface = BVHTree.FromPolygons([v.co.copy() for v in shell.data.vertices],
                                  [list(p.vertices) for p in shell.data.polygons])

    def Surface(u, z, radialOffset=0):
        angle = centerAngle + u / radiusAtCenter
        radial = Vector((math.cos(angle), math.sin(angle), 0))
        point, normal, face, distance = surface.ray_cast(radial + Vector((0, 0, z)), -radial, 1)
        if point is None or normal.dot(radial) < .8:
            raise RuntimeError('Missing actual rear cone surface: ' + str((u, z)))
        return point + radial * radialOffset

    def Patch(name, patchWidth, low, high, corner, inner, outer, parent, role='Paint', centerU=0, columns=32, rows=40):
        # Sample the manufactured corner by angle. Uniform height rows left a
        # visible two-segment chamfer at the otherwise rounded lower corners.
        cornerSteps = 8 if corner > .01 else 4
        heights = [low + corner * (1 - math.cos(i * math.pi / (2 * cornerSteps))) for i in range(cornerSteps)]
        heights += [low + corner + (high - low - 2 * corner) * i / rows for i in range(rows + 1)]
        heights += [high - corner * (1 - math.cos(i * math.pi / (2 * cornerSteps))) for i in range(cornerSteps - 1, -1, -1)]
        rows = len(heights) - 1
        points = []
        for depth in [inner, outer]:
            for z in heights:
                edgeDistance = min(z - low, high - z)
                half = patchWidth / 2
                if edgeDistance < corner:
                    half -= corner - math.sqrt(max(0, corner * corner - (corner - edgeDistance) ** 2))
                for k in range(columns + 1):
                    u = centerU + half * (2 * k / columns - 1)
                    if callable(depth):
                        angle = centerAngle + u / radiusAtCenter
                        r = depth(z)
                        point = Vector((r * math.cos(angle), r * math.sin(angle), z))
                    else:
                        point = Surface(u, z, depth)
                    points.append(point)
        stride = columns + 1
        layer = stride * (rows + 1)
        faces = []
        for j in range(rows):
            for k in range(columns):
                q = [j * stride + k, j * stride + k + 1, (j + 1) * stride + k + 1, (j + 1) * stride + k]
                faces.append(tuple(reversed(q)))
                faces.append(tuple(v + layer for v in q))
        boundary = list(range(stride))
        boundary += [j * stride + columns for j in range(1, rows + 1)]
        boundary += [rows * stride + k for k in range(columns - 1, -1, -1)]
        boundary += [j * stride for j in range(rows - 1, 0, -1)]
        for a, b in zip(boundary, boundary[1:] + boundary[:1]):
            faces.append((a, b, b + layer, a + layer))
        obj = makeMesh(name, points, faces, role, parent)
        for polygon in obj.data.polygons:
            polygon.use_smooth = polygon.index < rows * columns * 2
        return obj

    def RoundedContour(contourWidth, low, high, corner):
        result = []
        for cx, cz, first in [(contourWidth / 2 - corner, high - corner, 0),
                              (-contourWidth / 2 + corner, high - corner, 90),
                              (-contourWidth / 2 + corner, low + corner, 180),
                              (contourWidth / 2 - corner, low + corner, 270)]:
            for step in range(9):
                angle = math.radians(first + step * 10)
                result.append((cx + corner * math.cos(angle), cz + corner * math.sin(angle)))
        return result

    def Seal():
        outer = RoundedContour(width + .006, bottom - .003, top + .003, spec['cornerRadiusM'] + .003)
        inset = spec['openingInsetM']
        inner = RoundedContour(width - 2 * inset, bottom + inset, top - inset, max(.004, spec['cornerRadiusM'] - inset))
        points = []
        for radial in [-.008, -.005]:
            for ring in [outer, inner]:
                points += [Surface(u, z, radial) for u, z in ring]
        count = len(outer)
        faces = []
        for i in range(count):
            j = (i + 1) % count
            faces += [(i, j, j + count, i + count),
                      (i + count * 2, i + count * 3, j + count * 3, j + count * 2),
                      (i, i + count * 2, j + count * 2, j),
                      (i + count, j + count, j + count * 3, i + count * 3)]
        return makeMesh('Turret_RearHatchSeal', points, faces, 'Dark', turret)

    # A generatrix is straight on this cone. Tilting the two pins onto the same
    # line preserves a real rigid hinge axis and the curved closed surface.
    hingeU = -width / 2 - spec['hingeOutsideEdgeM']
    hingeAngle = centerAngle + hingeU / radiusAtCenter
    radial = Vector((math.cos(hingeAngle), math.sin(hingeAngle), 0))
    hingeAxis = Vector((slope * radial.x, slope * radial.y, 1)).normalized()

    def Pin(z):
        radius = (radiusFunction(z)if radiusFunction else .419 + slope * (z - .105)) + spec['hingePinRadialOffsetM']
        return radial * radius + Vector((0, 0, z))

    fixed = empty('TurretRearHingeFixed', parent=turret)
    door = empty('Hatch_TurretRear', Pin(centerZ), turret)
    door.rotation_euler = hingeAxis.to_track_quat('Z', 'Y').to_euler()
    bpy.context.view_layer.update()

    def Own(obj):
        bpy.context.view_layer.update()
        world = obj.matrix_world.copy()
        obj.parent = door
        obj.matrix_world = world
        return obj

    door['HingeAxisLocal'] = 'Z'
    door['OpenSignLocal'] = -1
    door['TargetHingeM'] = tuple(Pin(centerZ))
    door['HingeAxisInTurretM'] = tuple(hingeAxis)
    door['HingePinRadiusM'] = spec['hingePinRadiusM']
    door['HingeBearingInnerRadiusM'] = spec['hingeBearingInnerRadiusM']
    door['ClosedRadialGapM'] = spec['closedRadialGapM']
    door['FullBodyContactExclusionM'] = 0.
    door['DemoOpenDegrees'] = spec['demonstrationOpenDegrees']
    door['ReferenceLayout'] = 'Data_TurretRearLayoutV27.json'
    door['ReferenceScope'] = 'Kubinka 2022 rear photographs and AWM catalogue corroboration; hidden sections, exact dimensions and stop inferred; free-edge fitting closed, internal latch release not established'
    fixed['ReferenceScope'] = 'Two vehicle-left fixed pins with separate moving bearing eyes; concealed fork and surface feet inferred'
    fixed['HingeAxisInTurretM'] = tuple(hingeAxis)
    turret['TurretRearRequired'] = True
    turret['TurretRearOpeningCenterM'] = tuple(Surface(0, centerZ))
    turret['TurretRearOpeningNormalM'] = (0., -1., -slope)

    Own(Patch('Turret_RearCurvedHatch', width, bottom, top, spec['cornerRadiusM'],
              spec['closedRadialGapM'], spec['closedRadialGapM'] + spec['panelThicknessM'], turret))
    Seal()
    contacts = []
    pinCenters = []
    for index, z in enumerate(spec['hingeHeightsInTurretM']):
        pin = Pin(z)
        pinCenters.extend(pin)
        obj = cylinder('TurretRear_FixedPin' + str(index), (0, 0, 0), spec['hingePinRadiusM'],
                       spec['hingePinLengthM'], parent=fixed, vertices=32)
        obj.location = pin
        obj.rotation_euler = hingeAxis.to_track_quat('Z', 'Y').to_euler()
        for offset in [-.023, .023]:
            eye = lathe('TurretRear_FixedEye' + str(index),
                        [(spec['hingeBearingInnerRadiusM'], -.009), (spec['hingeBearingOuterRadiusM'], -.009),
                         (spec['hingeBearingOuterRadiusM'], .009), (spec['hingeBearingInnerRadiusM'], .009),
                         (spec['hingeBearingInnerRadiusM'], -.009)], (0, 0, 0), parent=fixed, segments=32)
            eye.location = pin + hingeAxis * offset
            eye.rotation_euler = hingeAxis.to_track_quat('Z', 'Y').to_euler()
        eye = lathe('TurretRear_MovingEye' + str(index),
                    [(spec['hingeBearingInnerRadiusM'], -.011), (.009, -.011), (.009, .011),
                     (spec['hingeBearingInnerRadiusM'], .011), (spec['hingeBearingInnerRadiusM'], -.011)],
                    (0, 0, 0), parent=turret, segments=32)
        eye.location = pin
        eye.rotation_euler = hingeAxis.to_track_quat('Z', 'Y').to_euler()
        Own(eye)
        footU = hingeU - .027
        Patch('TurretRear_FixedFoot' + str(index), .026, z - .033, z + .033, .003,
              -.0004, .004, fixed, centerU=footU, columns=4, rows=8)
        for u in [footU - .010, footU + .010]:
            for zz in [z - .027, z + .027]:
                point = Surface(u, zz)
                contacts.extend(point)
        foot = Surface(footU, z, .0045)
        directionToFoot = (foot - pin).normalized()
        for offset in [-.023, .023]:
            inner = pin + hingeAxis * offset + directionToFoot * .007
            outer = Surface(footU, z + hingeAxis.z * offset, .0045)
            plate('TurretRear_FixedLeaf' + str(index),
                  [inner - hingeAxis * .006, outer - hingeAxis * .008,
                   outer + hingeAxis * .008, inner + hingeAxis * .006], .0035, parent=fixed, bevel=.0005)
            rivet('TurretRear_FixedLeafBolt' + str(index), outer + radial * .0018, radial, .004, fixed)
        foot = Surface(-width / 2 + .012, z, spec['closedRadialGapM'] + spec['panelThicknessM'] + .002)
        directionToFoot = (foot - pin).normalized()
        inner = pin + directionToFoot * .007
        Own(plate('TurretRear_MovingLeaf' + str(index),
                  [inner - hingeAxis * .009, foot - hingeAxis * .015,
                   foot + hingeAxis * .015, inner + hingeAxis * .009], .0035, parent=turret, bevel=.0005))
        for offset in [-.009, .009]:
            Own(rivet('TurretRear_MovingLeafBolt' + str(index), foot + hingeAxis * offset + radial * .0018,
                      radial, .004, turret))
    # One observed round free-edge fitting. Its hidden latch is deliberately
    # not animated without evidence for a separate operating movement.
    fitting = Surface(width / 2 - .024, centerZ + .012,
                      spec['closedRadialGapM'] + spec['panelThicknessM'] + .001)
    fittingNormal = Vector((fitting.x, fitting.y, -slope * math.hypot(fitting.x, fitting.y))).normalized()
    Own(rivet('TurretRear_FreeEdgeFitting', fitting, fittingNormal, .007, turret))
    fixed['FootSurfacePointsInTurretM'] = contacts
    fixed['PinCentersInTurretM'] = pinCenters
    # A real open volume replaces the former fake rear vision strip. No dark
    # plate spans the opening; the seal is a separate ring behind its edge.
    inset = spec['openingInsetM']
    cutter = Patch('TemporaryTurretRearOpening', width - 2 * inset, bottom + inset, top - inset,
                   max(.004, spec['cornerRadiusM'] - inset), lambda z: .18, lambda z: .65,
                   turret, 'Dark', columns=24, rows=30)
    cutWith(shell, cutter)
    # The old front-flat rule used abs(normal.y), which also flattened the
    # rounded rear. New Boolean faces otherwise expose rectangular normal
    # seams around this opening. Keep only rear outer-cone faces smooth;
    # aperture walls and the broad front armor retain their own normals.
    shell.data.update()
    for polygon in shell.data.polygons:
        center = polygon.center
        radial = Vector((center.x, center.y, 0))
        if center.y < -.25 and radial.length > .3:
            radial.normalize()
            if polygon.normal.dot(radial) > .9:
                polygon.use_smooth = True
    bpy.context.view_layer.update()
    return door
