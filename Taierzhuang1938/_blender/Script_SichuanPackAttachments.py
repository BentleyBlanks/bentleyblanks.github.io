"""Separate straw accessories for the Sichuan folded-blanket pack.

The source scene uses Z-up, with the pack's outer face toward -Y.  All
coordinates are metres.  UVs here are local [0, 1] coordinates: the caller's
CreateMesh/AddTube/AddRibbon functions map them into the material atlas.
"""

import math
import bmesh
from mathutils import Vector


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
        'Separate removable horizontal rolled straw sleeping mat, 0.408 m including rolled edges',
    )
    sandalRoot = MakeRoot(
        'Pack_Sandals',
        'One pair of traditional woven-straw sandals, suspended by a thin cord',
    )
    sandalMaterial=materials.get('sandal',materials['straw'])
    ropeMaterial=materials.get('strawCord',sandalMaterial)

    # A gently uneven low-poly cylinder; fibre detail is carried by the bake.
    # The atlas supplies the dense diagonal weave.  The end ribbons below
    # describe the actual roll spiral with only a few additional polygons.
    matCenter = (0.0, -0.067, 0.183)
    matLength=.404
    matHalf=matLength/2
    matSides = 20
    matRings = (-matHalf,0.0,matHalf)
    matVerts = []
    matUvs = []
    for ringIndex, xValue in enumerate(matRings):
        taper = 0.96 if ringIndex in (0,len(matRings)-1) else 1.0
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
            matUvs.append(((xValue+matHalf)/matLength, sideIndex/matSides))
    matFaces = []
    for ringIndex in range(len(matRings) - 1):
        for sideIndex in range(matSides):
            nextIndex = (sideIndex + 1) % matSides
            aValue = ringIndex * matSides + sideIndex
            bValue = ringIndex * matSides + nextIndex
            matFaces.append((aValue, bValue, bValue + matSides, aValue + matSides))
    matFaces.append(tuple(reversed(range(matSides))))
    matFaces.append(tuple((len(matRings)-1)*matSides+index for index in range(matSides)))
    matObject=CreateMesh('Pack_StrawMatRoll',matVerts,matFaces,matUvs,materials['straw'],parent=matRoot)
    matObject.data.materials.append(materials.get('strawEnd',materials['straw']))
    for polygon in matObject.data.polygons:
        xs=[matObject.data.vertices[i].co.x for i in polygon.vertices]
        isCap=max(xs)-min(xs)<1e-6
        if isCap:polygon.material_index=1
        for loopIndex in polygon.loop_indices:
            point=matObject.data.vertices[matObject.data.loops[loopIndex].vertex_index].co
            if isCap:
                u=.5+(point.y-matCenter[1])/.074;v=.5+(point.z-matCenter[2])/.074
            else:
                u=(point.x+matHalf)/matLength
                v=(math.atan2(point.z-matCenter[2],point.y-matCenter[1])/math.tau)%1
            matObject.data.uv_layers.active.data[loopIndex].uv=(.52+.46*u,.52+.46*v)

    def MakeRollSpiral(name, xValue, reverse):
        spiralVerts = []
        spiralUvs = []
        spiralFaces = []
        segments = 32
        turns = 3.20
        for pointIndex in range(segments + 1):
            fraction = (pointIndex / segments)**.65
            angle = 0.45 + turns * 2.0 * math.pi * fraction
            radius = 0.004 + 0.028 * fraction
            # The narrow raised strip is a rolled sheet edge, not an emboss
            # of identical circular rings.  A slight end-face offset avoids
            # z-fighting while keeping the end cap a simple low-poly surface.
            for edgeSign in (-1.0, 0.0, 1.0):
                edgeRadius = radius + edgeSign * 0.0017
                spiralVerts.append((
                    xValue+(-1 if reverse else 1)*.0015*(1-edgeSign*edgeSign),
                    matCenter[1] + math.cos(angle) * edgeRadius,
                    matCenter[2] + math.sin(angle) * edgeRadius,
                ))
                spiralUvs.append((fraction, (edgeSign + 1.0) * 0.5))
        for index in range(segments):
            for across in range(2):
                a=index*3+across
                face=(a,a+1,a+4,a+3)
                spiralFaces.append(tuple(reversed(face)) if reverse else face)
        CreateMesh(name, spiralVerts, spiralFaces, spiralUvs,
                   materials['straw'], parent=matRoot)

    MakeRollSpiral('Pack_StrawMatLeftSpiral', -matHalf-.0005, True)
    MakeRollSpiral('Pack_StrawMatRightSpiral', matHalf+.0005, False)

    # Grey cloth loops align with the two principal vertical pack bindings.
    # They are part of the mat assembly so hiding the mat hides its loops.
    for strapIndex, xValue in enumerate((-0.103,0.089)):
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
    shoeWidth = (.8660254, -.50, 0.0)
    shoeNormal = (-.50, -.8660254, 0.0)

    def ShoePoint(center, width, length, outward):
        width *= .95
        length *= 1.12
        return (
            center[0] + shoeWidth[0] * width + shoeNormal[0] * outward,
            center[1] + shoeWidth[1] * width + shoeNormal[1] * outward,
            center[2] + length,
        )

    # The narrower heel and rounder broad toe distinguish these from a
    # rectangular flip-flop.  Dense braided rows are carried by the atlas.
    soleOutline = tuple(reversed((
        (0.000,.080),(.014,.078),(.023,.065),(.026,.044),
        (.026,.015),(.023,-.020),(.019,-.058),(.012,-.076),
        (-.010,-.077),(-.018,-.065),(-.022,-.040),(-.024,-.012),
        (-.026,.020),(-.025,.047),(-.020,.069),(-.010,.079),
    )))

    def MakeSandal(number, center):
        name = 'Pack_Sandal%02d' % number
        verts = []
        uvs = []
        def LocalPoint(width,length,outward):
            angle=-.075 if number==1 else .085
            return ShoePoint(center,width*math.cos(angle)-length*math.sin(angle),width*math.sin(angle)+length*math.cos(angle),outward)
        for outward in (0.000, 0.008):
            for width, length in soleOutline:
                verts.append(LocalPoint(width,length,outward))
                uvs.append((0.5+width/.056,(length+.079)/.158))
        sides = len(soleOutline)
        faces = [tuple(reversed(range(sides))),
                 tuple(sides + index for index in range(sides))]
        for index in range(sides):
            nextIndex = (index + 1) % sides
            faces.append((index, nextIndex, sides + nextIndex, sides + index))
        CreateMesh(name + 'WovenSole', verts, faces, uvs,
                   sandalMaterial, parent=sandalRoot)
        rimPoints=[]
        for index in range(sides+1):
            width,length=soleOutline[index%sides]
            rimPoints.append(LocalPoint(width*.96,length*.99,.0095+.0007*math.sin(index*1.8)))
        AddTube(name+'BraidedRim',rimPoints,.0036,ropeMaterial,parent=sandalRoot,sides=3)

        def Lace(suffix, points, radius=0.0028):
            return AddTube(name + suffix,
                           [LocalPoint(*point) for point in points],
                           radius,ropeMaterial,parent=sandalRoot,
                           sides=4)

        # A plaited open upper, with braided front/back selvages. Its width
        # and actual curved surface distinguish it from a pair of wire laces.
        upperVerts=[];upperUvs=[];upperFaces=[]
        for length in (.023,.040,.057):
            halfWidth=.024-(length-.023)*.04
            for across in (-1,-.5,0,.5,1):
                width=across*halfWidth
                upperVerts.append(LocalPoint(width,length,.010+.009*(1-across*across)))
                upperUvs.append((.5+width/.056,(length+.079)/.158))
        for row in range(2):
            for across in range(4):
                a=row*5+across;upperFaces.append((a,a+1,a+6,a+5))
        upper=CreateMesh(name+'PlaitedUpper',upperVerts,upperFaces,upperUvs,sandalMaterial,parent=sandalRoot)
        bm=bmesh.new();bm.from_mesh(upper.data)
        outward=Vector(shoeNormal)
        for face in bm.faces:
            if face.normal.dot(outward)<0:face.normal_flip()
        bm.to_mesh(upper.data);bm.free()
        for border,length in enumerate((.023,.057)):
            halfWidth=.024-(length-.023)*.04
            points=[LocalPoint(across*halfWidth,length,.011+.009*(1-across*across)) for across in (-1,-.5,0,.5,1)]
            AddTube(name+'UpperBraid%d'%border,points,.0024,ropeMaterial,parent=sandalRoot,sides=3)
        Lace('ForefootBinding', ((-0.024, 0.017, 0.005),
                                (-0.020, 0.011, 0.015),
                                (0.000, 0.008, 0.019),
                                (0.019, 0.011, 0.015),
                                (0.021, 0.017, 0.005)), 0.0036)

        # The heel yoke, attached at both sides, makes this a tied grass shoe
        # rather than a modern thong sandal.  Its loose cord crosses the
        # instep, and follows the outline of the absent wearer's heel.
        Lace('HeelYoke', ((-0.019, -0.024, 0.008),
                         (-0.017, -0.060, 0.016),
                         (0.000, -0.071, 0.019),
                         (0.016, -0.058, 0.016),
                         (0.019, -0.022, 0.008)), 0.0032)
        Lace('InstepLace', ((-0.019, -0.024, 0.009),
                           (0.009, -0.007, 0.019),
                           (0.014, -0.028, 0.015),
                           (0.017, -0.057, 0.011)), 0.0022)
        return LocalPoint(0.000,0.069,0.012)

    firstHang = MakeSandal(1,(-.225,-.070,-.008))
    secondHang = MakeSandal(2,(-.214,-.051,0))
    anchor = (-0.194, -0.088, 0.113)
    for number, end in enumerate((firstHang, secondHang), start=1):
        AddTube('Pack_SandalHangingCord%02d' % number,
                (anchor,
                 (-0.206, -0.086, 0.093),
                 (-0.220, end[1] + 0.003, 0.053),
                 end),
                0.00135, ropeMaterial, parent=sandalRoot, sides=4)

    matRoot['NominalDimensionsM'] = [matLength+.004, 0.070, 0.070]
    sandalRoot['SandalCount'] = 2
    return [matRoot, sandalRoot]
