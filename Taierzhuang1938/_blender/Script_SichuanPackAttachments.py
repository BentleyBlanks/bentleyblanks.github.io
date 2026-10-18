"""Separate straw accessories for the Sichuan folded-blanket pack.

The source scene uses Z-up, with the pack's outer face toward -Y.  All
coordinates are metres.  UVs here are local [0, 1] coordinates: the caller's
CreateMesh/AddTube/AddRibbon functions map them into the material atlas.
"""

import math


def BuildAttachments(CreateMesh, AddRibbon, AddTube, materials):
    """Return independently hideable straw-mat and paired-sandal roots."""
    import bpy

    def MakeRoot(name, description):
        root = bpy.data.objects.new(name, None)
        bpy.context.collection.objects.link(root)
        root.empty_display_type = 'PLAIN_AXES'
        root.empty_display_size = 0.025
        root['Description'] = description
        return root

    matRoot = MakeRoot(
        'Pack_StrawMat',
        'Separate removable horizontal rolled straw sleeping mat, 0.42 m long',
    )
    sandalRoot = MakeRoot(
        'Pack_Sandals',
        'One pair of traditional woven-straw sandals, suspended by a thin cord',
    )

    # A gently uneven, sixteen-sided cylinder rather than hundreds of stalks.
    # The atlas supplies the dense diagonal weave.  The end ribbons below
    # describe the actual roll spiral with only a few additional polygons.
    matCenter = (0.0, -0.067, 0.186)
    matSides = 16
    matRings = (-0.210, -0.198, 0.198, 0.210)
    matVerts = []
    matUvs = []
    for ringIndex, xValue in enumerate(matRings):
        taper = 0.96 if ringIndex in (0, 3) else 1.0
        for sideIndex in range(matSides):
            angle = 2.0 * math.pi * sideIndex / matSides
            radius = 0.035 * taper * (
                1.0 + 0.017 * math.sin(3.0 * angle + 0.7)
            )
            matVerts.append((
                xValue,
                matCenter[1] + math.cos(angle) * radius,
                matCenter[2] + math.sin(angle) * radius,
            ))
            matUvs.append(((xValue + 0.210) / 0.420, sideIndex / matSides))
    matFaces = []
    for ringIndex in range(len(matRings) - 1):
        for sideIndex in range(matSides):
            nextIndex = (sideIndex + 1) % matSides
            aValue = ringIndex * matSides + sideIndex
            bValue = ringIndex * matSides + nextIndex
            matFaces.append((aValue, bValue, bValue + matSides, aValue + matSides))
    matFaces.append(tuple(reversed(range(matSides))))
    matFaces.append(tuple(3 * matSides + index for index in range(matSides)))
    CreateMesh('Pack_StrawMatRoll', matVerts, matFaces, matUvs,
               materials['straw'], parent=matRoot)

    def MakeRollSpiral(name, xValue, reverse):
        spiralVerts = []
        spiralUvs = []
        spiralFaces = []
        segments = 18
        turns = 2.20
        for pointIndex in range(segments + 1):
            fraction = pointIndex / segments
            angle = 0.45 + turns * 2.0 * math.pi * fraction
            radius = 0.004 + 0.028 * fraction
            # The narrow raised strip is a rolled sheet edge, not an emboss
            # of identical circular rings.  A slight end-face offset avoids
            # z-fighting while keeping the end cap a simple low-poly surface.
            for edgeSign in (-1.0, 1.0):
                edgeRadius = radius + edgeSign * 0.0011
                spiralVerts.append((
                    xValue,
                    matCenter[1] + math.cos(angle) * edgeRadius,
                    matCenter[2] + math.sin(angle) * edgeRadius,
                ))
                spiralUvs.append((fraction, (edgeSign + 1.0) * 0.5))
        for index in range(segments):
            face = (index * 2, index * 2 + 1,
                    index * 2 + 3, index * 2 + 2)
            spiralFaces.append(tuple(reversed(face)) if reverse else face)
        CreateMesh(name, spiralVerts, spiralFaces, spiralUvs,
                   materials['straw'], parent=matRoot)

    MakeRollSpiral('Pack_StrawMatLeftSpiral', -0.2105, True)
    MakeRollSpiral('Pack_StrawMatRightSpiral', 0.2105, False)

    # Grey cloth loops align with the two principal vertical pack bindings.
    # They are part of the mat assembly so hiding the mat hides its loops.
    for strapIndex, xValue in enumerate((-0.103, 0.103)):
        points = []
        for pointIndex in range(17):
            angle = 2.0 * math.pi * pointIndex / 16.0
            points.append((
                xValue,
                matCenter[1] + math.cos(angle) * 0.0375,
                matCenter[2] + math.sin(angle) * 0.0375,
            ))
        AddRibbon('Pack_StrawMatBinding%02d' % (strapIndex + 1), points,
                  0.025, materials['binding'], parent=matRoot, axis='x')

    # A shoe is modelled in its own basis.  Width runs diagonally across the
    # pack's side; the sole points partly toward the observer so both members
    # of the hanging pair remain readable from the front three-quarter view.
    shoeWidth = (0.96, -0.28, 0.0)
    shoeNormal = (-0.28, -0.96, 0.0)

    def ShoePoint(center, width, length, outward):
        width *= 1.25
        length *= 1.35
        return (
            center[0] + shoeWidth[0] * width + shoeNormal[0] * outward,
            center[1] + shoeWidth[1] * width + shoeNormal[1] * outward,
            center[2] + length,
        )

    # The narrower heel and rounder broad toe distinguish these from a
    # rectangular flip-flop.  Dense braided rows are carried by the atlas.
    soleOutline = tuple(reversed((
        (0.000, 0.079), (0.016, 0.072), (0.024, 0.054),
        (0.025, 0.026), (0.021, -0.012), (0.017, -0.057),
        (0.011, -0.074), (-0.010, -0.076), (-0.018, -0.060),
        (-0.020, -0.019), (-0.024, 0.026), (-0.021, 0.059),
    )))

    def MakeSandal(number, center):
        name = 'Pack_Sandal%02d' % number
        verts = []
        uvs = []
        for outward in (0.000, 0.008):
            for width, length in soleOutline:
                verts.append(ShoePoint(center, width, length, outward))
                uvs.append((0.5 + width / 0.052, (length + 0.079) / 0.158))
        sides = len(soleOutline)
        faces = [tuple(reversed(range(sides))),
                 tuple(sides + index for index in range(sides))]
        for index in range(sides):
            nextIndex = (index + 1) % sides
            faces.append((index, nextIndex, sides + nextIndex, sides + index))
        CreateMesh(name + 'WovenSole', verts, faces, uvs,
                   materials['straw'], parent=sandalRoot)

        def Lace(suffix, points, radius=0.0020):
            return AddTube(name + suffix,
                           [ShoePoint(center, *point) for point in points],
                           radius, materials['straw'], parent=sandalRoot,
                           sides=4)

        # Two crossed forefoot cords and a broad multi-point toe binding.
        # The raised lacing describes the open upper of an unworn sandal.
        Lace('ToeCrossLeft', ((-0.023, 0.036, 0.009),
                             (-0.008, 0.046, 0.025),
                             (0.021, 0.026, 0.010)))
        Lace('ToeCrossRight', ((0.024, 0.040, 0.009),
                              (0.007, 0.046, 0.027),
                              (-0.022, 0.024, 0.010)))
        Lace('ForefootBinding', ((-0.024, 0.017, 0.005),
                                (-0.020, 0.011, 0.021),
                                (0.000, 0.008, 0.030),
                                (0.019, 0.011, 0.021),
                                (0.021, 0.017, 0.005)), 0.0026)

        # The heel yoke, attached at both sides, makes this a tied grass shoe
        # rather than a modern thong sandal.  Its loose cord crosses the
        # instep, and follows the outline of the absent wearer's heel.
        Lace('HeelYoke', ((-0.019, -0.024, 0.008),
                         (-0.017, -0.060, 0.025),
                         (0.000, -0.071, 0.031),
                         (0.016, -0.058, 0.025),
                         (0.019, -0.022, 0.008)), 0.0024)
        Lace('InstepLace', ((-0.019, -0.024, 0.009),
                           (0.009, -0.007, 0.029),
                           (0.014, -0.028, 0.020),
                           (0.017, -0.057, 0.011)), 0.0017)
        return ShoePoint(center, 0.000, 0.069, 0.012)

    firstHang = MakeSandal(1, (-0.218, -0.111, -0.027))
    secondHang = MakeSandal(2, (-0.257, -0.067, -0.019))
    anchor = (-0.194, -0.088, 0.113)
    for number, end in enumerate((firstHang, secondHang), start=1):
        AddTube('Pack_SandalHangingCord%02d' % number,
                (anchor,
                 (-0.206, -0.086, 0.093),
                 (-0.220, end[1] + 0.003, 0.053),
                 end),
                0.00135, materials['binding'], parent=sandalRoot, sides=4)

    matRoot['NominalDimensionsM'] = [0.420, 0.070, 0.070]
    sandalRoot['SandalCount'] = 2
    return [matRoot, sandalRoot]
