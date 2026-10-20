"""Break the physically compressed V10 roll ends into real narrow grass bundles.

Call ApplyCutGrassBundles(root) AFTER ApplyStrawCompression(root).  The current
compressed sheet's two 601-point edges supply continuous spiral centre lines;
the V9 fake-user baseline only locates the old end sections.  Wide tab faces
are removed, not concealed by an overlay.  Their vertices and indices remain
unchanged, so the physical-compression module can still run repeatedly.

Only end-section faces and their obsolete little surface ribs are removed.
The long external interlacing, retaining tapes, cloth and shoes are untouched.
Replacement blades exchange radial lanes as a shallow three-strand plait,
rather than forming three permanently parallel fine concentric rings.
They are a separately tagged child of Pack_StrawMat.  Repeated
calls replace that child and remain idempotent.  No Blender calls run at import,
and this module does not save or export anything.  Dimensions are metres.
"""

import math
import bisect

import bpy
from mathutils import Vector


ownTag = 'SichuanCutGrassBundlesV10'
baselineTag = 'SichuanCompressionV10Baseline'
centerY = -.067
centerZ = .1805
tau = math.tau


def Radial(point):
    return Vector((0, (point.y - centerY) / 1.245,
                   (point.z - centerZ) / 1.025)).normalized()


def CappedRanges(mesh, sides):
    """V9 emits each closed tube as contiguous rings followed by two caps."""
    caps = [sorted(poly.vertices) for poly in mesh.polygons if len(poly.vertices) == sides]
    if len(caps) % 2:
        raise RuntimeError('Unpaired V9 end-section caps with %d sides' % sides)
    result = []
    for first, last in zip(caps[::2], caps[1::2]):
        start, stop = first[0], last[-1] + 1
        if first != list(range(start, start + sides)) or last != list(range(stop - sides, stop)):
            raise RuntimeError('Unexpected V9 contiguous cap topology')
        if (stop - start) % sides:
            raise RuntimeError('Unexpected V9 tube ring count')
        result.append((start, stop))
    return result


def ContinuousEdge(sheet, sign):
    """The actual compressed sheet, not 122 independently phased little tabs."""
    rows, columns = 600, 48
    if len(sheet.data.vertices) != (rows + 1) * (columns + 1):
        raise RuntimeError('The compressed V9 601 x 49 sheet topology is required')
    column = 0 if sign < 0 else columns
    edge = []
    for row in range(rows + 1):
        point = sheet.data.vertices[row * (columns + 1) + column].co.copy()
        point.x += sign * .00090
        edge.append(point)
    lengths = [0.0]
    for a, b in zip(edge, edge[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    return edge, lengths


def SampleContinuousEdge(edge, lengths, distance):
    distance = max(0, min(lengths[-1], distance))
    index = min(len(edge) - 2, max(0, bisect.bisect_right(lengths, distance) - 1))
    fraction = (distance - lengths[index]) / (lengths[index + 1] - lengths[index])
    return edge[index].lerp(edge[index + 1], fraction)


def FlatPlait(strand, progression, bundle):
    """Alternately cross outside strands over the middle in a very flat braid.

    Unlike three phase-shifted circles, this permutation keeps three real
    radial lanes.  Two strands exchange adjacent lanes at each crossing while
    the third stays at the other outer edge.  The outside strand comes forward
    and the previous middle strand passes behind it.  Smoothstep eases them
    into/out of each crossing, with unequal physical intervals supplied by the
    caller rather than a mathematically uniform helix.
    """
    stage = max(0, int(math.floor(progression)))
    fraction = progression - stage
    order = [0, 1, 2]
    # Six alternating swaps restore the initial lane permutation.
    for index in range(stage % 6):
        a, b = (0, 1) if index % 2 == 0 else (1, 2)
        order[a], order[b] = order[b], order[a]
    a, b = (0, 1) if stage % 2 == 0 else (1, 2)
    lane = order.index(strand)
    lanes = (-.64, 0, .64)
    if lane not in (a, b):
        return lanes[lane], 0.0
    target = b if lane == a else a
    eased = fraction * fraction * (3 - 2 * fraction)
    lateral = lanes[lane] * (1 - eased) + lanes[target] * eased
    outerLane = 0 if stage % 2 == 0 else 2
    liftDirection = 1 if lane == outerLane else -1
    height = .00053 + .00007 * math.sin(bundle * 1.137 + progression * 1.73)
    return lateral, liftDirection * height * math.sin(math.pi * eased)


class CutBundlesMesh:
    def __init__(self):
        self.vertices = []
        self.faces = []
        self.uvs = []
        self.tones = []
        self.maxAxialShift = 0.0
        self.sections = 0
        self.endLengths = []

    def Blade(self, edge, lengths, sign, strand, firstDistance, lastDistance):
        # The global physical distance is also used across the few deliberate
        # breaks.  No old small-tab index enters this phase calculation.
        widthFraction = (.278, .290, .274)[strand]
        endSeed = 1 if sign < 0 else 3
        seed = endSeed * 1.713 + strand * 2.117
        arc = lastDistance - firstDistance
        steps = max(8, math.ceil(arc / .00038))
        sides = 10
        first = len(self.vertices)
        self.sections += 1
        for row in range(steps + 1):
            along = row / steps
            distance = firstDistance + arc * along
            center = SampleContinuousEdge(edge, lengths, distance)
            radial = Radial(center)
            # Average swaps are six millimetres apart.  Slow non-periodic
            # drift changes local spacing to roughly 5.6--6.6 mm while all
            # three strands retain a shared continuous phase over every lap.
            progression = (.31 * endSeed + distance / .00605
                           + .17 * math.sin(distance * 39 + endSeed)
                           + .08 * math.sin(distance * 91 + endSeed * 1.7))
            lateral, crossingLift = FlatPlait(strand, progression, endSeed)
            lateral += .016 * math.sin(distance * 53 + endSeed * 1.71)
            parentWidth = .00375 * (1 + .055 * math.sin(distance * 53 + endSeed)
                                    + .025 * math.sin(distance * 121 + endSeed * 2.1))
            # Only the six natural tips and two short broken sites taper at
            # all.  The very blunt taper never produces the former 122 points.
            edgeDistance = min(distance - firstDistance, lastDistance - distance)
            eased = max(0, min(1, edgeDistance / .0012))
            eased = eased * eased * (3 - 2 * eased)
            tip = .80 + .20 * eased
            width = parentWidth * widthFraction * tip
            width *= 1 + .035 * math.sin(distance * 177 + seed)
            axialShift = (crossingLift + .00011 * math.sin(distance * 61 + endSeed * 1.17)
                          + .000025 * math.sin(distance * 271 + seed))
            self.maxAxialShift = max(self.maxAxialShift, abs(axialShift))
            depth = .00028 * (1 + .17 * math.sin(distance * 137 + seed + 1.2)) * tip
            center += radial * (parentWidth * lateral) + Vector((sign * axialShift, 0, 0))
            for j in range(sides):
                angle = tau * j / sides
                # Unequal crushed cross-sections give small rounded shoulders,
                # with no broad planar panel and no cylindrical coiled rope.
                rib = 1 + .045 * math.sin(angle * 3 + distance * 163 + seed)
                point = center + radial * (width * math.cos(angle) * rib)
                point += Vector((sign * depth * math.sin(angle), 0, 0))
                self.vertices.append(tuple(point))
                u = .52 + .46 * (.13 + strand * .024 + j / sides * .030)
                self.uvs.append((u, .52 + .46 * distance / .08))
            if row:
                for j in range(sides):
                    a = first + (row - 1) * sides + j
                    b = first + (row - 1) * sides + (j + 1) % sides
                    # Vertex rings are radial -> axial.  The sign change at
                    # the two ends requires opposite winding for outward normals.
                    face = (a, a + sides, b + sides, b)
                    self.faces.append(face if sign > 0 else tuple(reversed(face)))
                    self.tones.append((int(distance / .023 + .22 * math.sin(distance * 53)) + strand) % 3)
        for row, reverse in ((0, sign < 0), (steps, sign > 0)):
            cap = tuple(first + row * sides + j for j in range(sides))
            self.faces.append(tuple(reversed(cap)) if reverse else cap)
            self.tones.append((endSeed + strand) % 3)

    def End(self, sheet, sign):
        edge, lengths = ContinuousEdge(sheet, sign)
        totalLength = lengths[-1]
        self.endLengths.append(totalLength)
        # One inconspicuous broken grass site at each physical end.  The two
        # other strands remain continuous across it, preserving the coarse lap.
        brokenAt = totalLength * (.57 if sign < 0 else .64)
        halfGap = .00026
        for strand in range(3):
            spans = ((0, totalLength),) if strand != 1 else (
                (0, brokenAt - halfGap), (brokenAt + halfGap, totalLength))
            for firstDistance, lastDistance in spans:
                self.Blade(edge, lengths, sign, strand, firstDistance, lastDistance)

    def Write(self, parent, materials):
        mesh = bpy.data.meshes.new('Geometry_SichuanV10CutGrassBundles')
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        for material in materials:
            mesh.materials.append(material)
        uv = mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops:
            uv.data[loop.index].uv = self.uvs[loop.vertex_index]
        for polygon, tone in zip(mesh.polygons, self.tones):
            polygon.material_index = min(tone, len(materials) - 1)
            polygon.use_smooth = len(polygon.vertices) == 4
        obj = bpy.data.objects.new('Pack_CutGrassBundlesV10', mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = parent
        obj[ownTag] = True
        obj['Construction'] = 'Continuous flattened edge plait following the entire compressed spiral; global arc drives all over-under swaps'
        return obj


def RemoveOldEndFaces(obj, removeIndices):
    """Rebuild only the face table, copying all vertices in their exact order."""
    old = obj.data
    kept = [poly for poly in old.polygons
            if not all(index in removeIndices for index in poly.vertices)]
    removed = len(old.polygons) - len(kept)
    if not removed:
        return 0
    if old.shape_keys is not None:
        raise RuntimeError('Unexpected shape keys on the grass weave')
    layerValues = {layer.name: [[tuple(layer.data[index].uv) for index in poly.loop_indices]
                               for poly in kept] for layer in old.uv_layers}
    replacement = bpy.data.meshes.new('Geometry_V10InterlacedGrassWithoutWideEndTabs')
    positions = [tuple(vertex.co) for vertex in old.vertices]
    replacement.from_pydata(positions, [], [tuple(poly.vertices) for poly in kept])
    for material in old.materials:
        replacement.materials.append(material)
    for polygon, original in zip(replacement.polygons, kept):
        polygon.material_index = original.material_index
        polygon.use_smooth = original.use_smooth
    for name, polygonValues in layerValues.items():
        layer = replacement.uv_layers.new(name=name)
        for polygon, values in zip(replacement.polygons, polygonValues):
            for loopIndex, value in zip(polygon.loop_indices, values):
                layer.data[loopIndex].uv = value
    replacement.update()
    if len(replacement.vertices) != len(old.vertices):
        raise RuntimeError('Removing end faces changed the protected vertex count')
    for vertex, original in zip(replacement.vertices, old.vertices):
        if vertex.co != original.co:
            raise RuntimeError('Removing end faces changed protected vertex coordinates')
    for key in old.keys():
        replacement[key] = old[key]
    obj.data = replacement
    if old.users == 0 and not old.use_fake_user:
        bpy.data.meshes.remove(old)
    return removed


def ApplyCutGrassBundles(root):
    matRoot = bpy.data.objects.get('Pack_StrawMat')
    weave = bpy.data.objects.get('Pack_InterlacedMatGrass')
    sheet = bpy.data.objects.get('Pack_TrueRolledGrassSheet')
    if (matRoot is None or matRoot.parent != root or weave is None or weave.parent != matRoot
            or sheet is None or sheet.parent != matRoot):
        raise RuntimeError('This operation requires the task-owned V9/V10 mat assembly')
    name = weave.get(baselineTag)
    baseline = bpy.data.meshes.get(name) if name else None
    if baseline is None or len(baseline.vertices) != len(weave.data.vertices):
        raise RuntimeError('Run ApplyStrawCompression before splitting the cut-end bundles')
    ranges = CappedRanges(baseline, 10)
    if not ranges:
        raise RuntimeError('No original V9 broad cut-end sections were found')
    removeIndices = set()
    generated = CutBundlesMesh()
    for first, stop in ranges:
        removeIndices.update(range(first, stop))
    for sign in (-1, 1):
        generated.End(sheet, sign)
    # These tiny ribs belonged to the deleted broad faces.  Keeping them at
    # their old axial height would leave floating lines over the new grooves.
    obsoleteRibs = 0
    for first, stop in CappedRanges(baseline, 5):
        points = [baseline.vertices[index].co for index in range(first, stop)]
        if points and (all(point.x > .199 for point in points)
                       or all(point.x < -.199 for point in points)):
            removeIndices.update(range(first, stop))
            obsoleteRibs += 1
    # Build/validate the replacement geometry before deleting prior generated
    # objects, so bad source topology fails without discarding a good result.
    for obj in list(matRoot.children_recursive):
        if obj.get(ownTag, False):
            mesh = obj.data if obj.type == 'MESH' else None
            bpy.data.objects.remove(obj, do_unlink=True)
            if mesh is not None and mesh.users == 0:
                bpy.data.meshes.remove(mesh)
    materials = list(weave.data.materials)
    if not materials or any(material is None for material in materials):
        raise RuntimeError('The existing straw material palette is required')
    removedFaces = RemoveOldEndFaces(weave, removeIndices)
    obj = generated.Write(matRoot, materials)
    report = {'stage': 'V10RealCutGrassSubBundles', 'sourceSections': len(ranges),
              'replacementBlades': 6, 'continuousClosedSections': generated.sections,
              'intentionalBreakSites': 2, 'globalEdgeLengthM': generated.endLengths,
              'construction': 'Continuous global-arc shallow three-strand flat plait',
              'removedOldFaces': removedFaces,
              'obsoleteSurfaceRibs': obsoleteRibs, 'originalVertexCount': len(weave.data.vertices),
              'originalVertexPositionsPreserved': True,
              'axialVariationMaxM': generated.maxAxialShift, 'generatedObject': obj.name,
              'outerInterlacingChanged': False, 'materialsChanged': False,
              'retainersChanged': False, 'sandalsChanged': False}
    obj['CutGrassBundlesV10Report'] = str(report)
    matRoot['ConstructionV10CutEnd'] = 'Three continuous flattened interlaced grass strands along each entire compressed winding edge; two short broken sites'
    return report
