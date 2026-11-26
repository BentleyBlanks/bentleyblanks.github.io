"""Editable exterior patch from the 2017 Kubinka vehicle and its supplementary views."""

import math

import bmesh
import bpy
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt


def MeshFromFaces(name, vertices, faces, material, smooth=False):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    mesh.materials.append(material)
    mesh.uv_layers.new(name="UVMap")
    if smooth:
        mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    return mesh


def BeveledMesh(mesh, width, segments):
    """Use Blender's angle bevel on the physical boundaries, keeping shallow faces flat."""
    temporary = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.scene.collection.objects.link(temporary)
    bevel = temporary.modifiers.new("RoundedCastEdges", "BEVEL")
    bevel.width = width
    bevel.segments = segments
    bevel.angle_limit = math.radians(29)
    bevel.harden_normals = True
    depsgraph = bpy.context.evaluated_depsgraph_get()
    result = bpy.data.meshes.new_from_object(
        temporary.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph
    )
    bpy.data.objects.remove(temporary, do_unlink=True)
    bpy.data.meshes.remove(mesh)
    return result


def MeshComponents(mesh):
    parents = list(range(len(mesh.vertices)))

    def Root(index):
        while index != parents[index]:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    for edge in mesh.edges:
        a, b = edge.vertices
        parents[Root(b)] = Root(a)
    groups = {}
    for vertex in mesh.vertices:
        groups.setdefault(Root(vertex.index), []).append(vertex.index)
    return list(groups.values())


def DeleteVertices(mesh, indices):
    customNormals = mesh.has_custom_normals
    if customNormals:
        layer = mesh.attributes.new("RetainedPhotoV107Normals", "FLOAT_VECTOR", "CORNER")
        for item, normal in zip(layer.data, mesh.corner_normals):
            item.vector = normal.vector
    edit = bmesh.new()
    edit.from_mesh(mesh)
    edit.verts.ensure_lookup_table()
    bmesh.ops.delete(edit, geom=[edit.verts[index] for index in indices], context="VERTS")
    edit.to_mesh(mesh)
    edit.free()
    if customNormals:
        layer = mesh.attributes["RetainedPhotoV107Normals"]
        mesh.normals_split_custom_set([tuple(item.vector) for item in layer.data])
        mesh.attributes.remove(layer)
    mesh.update()


def AddMesh(owner, mesh, coordinatesAreWorld=False):
    # Keep the model's one named render owner per rigid component.
    addition = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.scene.collection.objects.link(addition)
    if not coordinatesAreWorld:
        addition.matrix_world = owner.matrix_world
    ownerUv = owner.data.uv_layers.active
    if ownerUv and mesh.uv_layers.active:
        mesh.uv_layers.active.name = ownerUv.name
    bpy.ops.object.select_all(action="DESELECT")
    owner.select_set(True)
    addition.select_set(True)
    bpy.context.view_layer.objects.active = owner
    bpy.ops.object.join()
    if mesh.users == 0:
        bpy.data.meshes.remove(mesh)


def Bounds(owner, group):
    points = [owner.matrix_world @ owner.data.vertices[index].co for index in group]
    return [(min(v[axis] for v in points), max(v[axis] for v in points)) for axis in range(3)]


def PhotoFender(side, high, material):
    # Authored against the matched views, in Blender world space.
    # Preserve both attachment stations. The front curve loses the two hard
    # breaks of the old sheet assembly and gains a turned edge at the outside.
    profile = [
        (.449, .8196, .081), (.732, .8439, .091), (1.050, .8755, .080),
        (1.183, .8837, .012), (1.254, .8773, -.220),
        (1.320, .8521, -.570), (1.372, .7961, -1.330),
    ]
    stations = []
    for i, (ya, za, ma) in enumerate(profile[:-1]):
        yb, zb, mb = profile[i + 1]
        count = (3 if i < 2 else 7) if high else 2
        span = yb - ya
        for j in range(count):
            t = j / count
            z = (2*t**3 - 3*t*t + 1)*za + (t**3 - 2*t*t + t)*span*ma
            z += (-2*t**3 + 3*t*t)*zb + (t**3 - t*t)*span*mb
            stations.append((ya + t*span, z))
    stations.append(profile[-1][:2])
    vertices = []
    for y, z in stations:
        rise = .0035 * max(0, min(1, (y - .46) / .58))
        camber = .0024 * math.sin(math.pi * (y - .449) / .923)
        roll = .0019 * max(.15, min(1, (y - .449) / .12))
        if high:
            profileXZ = [(.550, rise), (.683, rise/2+camber), (.802, 0),
                         (.8084, -roll*.40), (.810, -roll), (.809, -roll-.002),
                         (.804, -.0075), (.801, -.006), (.550, rise-.006)]
        else:
            profileXZ = [(.550, rise), (.683, rise/2+camber), (.803, 0), (.810, -roll-.001),
                         (.806, -.007), (.550, rise-.006)]
        vertices.extend((side*x, y, z + dz) for x, dz in profileXZ)
    width = len(profileXZ)
    faces = [tuple(reversed(range(width)))]
    for i in range(len(stations) - 1):
        for j in range(width):
            a, b = i*width + j, i*width + (j + 1) % width
            faces.append((a, b, b + width, a + width))
    faces.append(tuple(range(len(vertices) - width, len(vertices))))
    if side < 0:
        faces = [tuple(reversed(face)) for face in faces]
    name = "FrontFenderLeftV107" if side < 0 else "FrontFenderRightV107"
    mesh = MeshFromFaces(name, vertices, faces, material, high)
    if high:
        # Include polygon bevels along the free front edge of the pressed sheet.
        mesh = BeveledMesh(mesh, .0010, 3)
    return mesh


def ReplaceFenders(high, material):
    hull = bpy.data.objects["Geometry_Hull_Paint"]
    replaced = []
    for group in MeshComponents(hull.data):
        x, y, z = Bounds(hull, group)
        if .256 < x[1]-x[0] < .263 and max(abs(x[0]), abs(x[1])) > .808 and y[0] > .447 and .784 < z[0] < .890:
            replaced.append(group)
    if len(replaced) != 8:
        raise ValueError(f"Expected eight retained front fender sheets, found {len(replaced)}")
    DeleteVertices(hull.data, {index for group in replaced for index in group})
    for side in [-1, 1]:
        AddMesh(hull, PhotoFender(side, high, material), coordinatesAreWorld=True)
    return len(replaced)


def CreasedFrontLip(high, material):
    """Small folded lip on the front plate/glacis junction seen edge-on in 2017."""
    hull = bpy.data.objects["Geometry_Hull_Paint"]
    data = bpy.data.objects["Hull"]
    frontY = data["FrontArmorTopForwardM"]
    frontZ = data["ForebodyProfileBeforeGroundM"][1] + hull.matrix_world.translation.z
    # The lip stops inside the corner fasteners and follows the already
    # registered plate junction. The plate face and the attachment holes stay put.
    xStations = [-.514, -.508, .508, .514]
    if high:
        section = [(-.0025,-.0015), (-.0006,.0013), (.0012,.0013),
                   (.0020,.0005), (.0016,-.0018), (-.0010,-.002)]
    else:
        section = [(-.0025,-.0015), (-.0003,.0013), (.0019,.0005), (.0014,-.002)]
    pts = [(x, frontY+y, frontZ+z) for x in xStations for y,z in section]
    w = len(section)
    faces = [tuple(range(w))]
    for i in range(len(xStations)-1):
        for j in range(w):
            a,b = i*w+j, i*w+(j+1)%w
            faces.append((a, a+w, b+w, b))
    faces.append(tuple(reversed(range(len(pts)-w, len(pts)))))
    AddMesh(hull, MeshFromFaces("FrontPlateFoldV107",pts,faces,material,high), coordinatesAreWorld=True)


def CastShoulder(owner, side, high, material):
    """Profile the exposed inside shoulder of the cheek before the retaining band."""
    pivot = bpy.data.objects["Wheel_" + ("Left" if side < 0 else "Right") + "_Drive"].matrix_world.translation
    radiusAxial = [(.194,.529), (.211,.529), (.219,.531), (.224,.536),
                   (.225,.542), (.224,.550), (.221,.555), (.213,.559), (.195,.553)]
    segments = 56 if high else 28
    start, end = math.radians(-30), math.radians(142)
    vertices = []
    for radius, x in radiusAxial:
        for i in range(segments + 1):
            a = start + (end-start) * i/segments
            vertices.append((side*x, pivot.y+radius*math.cos(a), pivot.z+radius*math.sin(a)))
    width = segments + 1
    rings = len(radiusAxial)
    faces = []
    for i in range(rings):
        for j in range(segments):
            a, b = i*width+j, ((i+1)%rings)*width+j
            faces.append((a, a+1, b+1, b))
    faces += [tuple(reversed(range(0,len(vertices),width))), tuple(range(segments,len(vertices),width))]
    if side < 0:
        faces = [tuple(reversed(face)) for face in faces]
    AddMesh(owner, MeshFromFaces("FinalDriveCastShoulderV107",vertices,faces,material,True), coordinatesAreWorld=True)


def CrownLug(high, material):
    """Replace the square photographic lug with a shallow, rounded cast boss."""
    owner = bpy.data.objects["Geometry_FinalDriveRaisedEarRight_Paint"]
    inverse = owner.matrix_world.inverted()
    # World positions match the retained V98 seated bounding box.
    lowX, highX = .5129, .5354
    y, height = 1.37912, .60541
    profile = [
        (-.0121, -.0019), (-.0093, -.0030), (.0093, -.0030), (.0121, -.0019),
        (.0121, .0019), (.0093, .0030), (-.0093, .0030), (-.0121, .0019)
    ]
    vertices = []
    stations = [(lowX, .82), (lowX+.0011, 1), (highX,1)] if high else [(lowX, .90), (highX,1)]
    for x, scale in stations:
        vertices.extend(inverse @ Vector((x,y+dy*scale,height+dz*scale)) for dy,dz in profile)
    w = len(profile)
    faces = [tuple(reversed(range(w)))]
    for i in range(len(stations)-1):
        for j in range(w):
            a,b = i*w+j, i*w+(j+1)%w
            faces.append((a,b,b+w,a+w))
    faces.append(tuple(range(len(vertices)-w,len(vertices))))
    old = owner.data
    owner.data = MeshFromFaces("CasingLugCastV107",vertices,faces,material,high)
    if not old.users:
        bpy.data.meshes.remove(old)


def RefreshWheelFace(owner, side):
    """Give the cast road-wheel spokes more dish while retaining the tyre and hub lands."""
    mesh = owner.data
    normals = [tuple(n.vector) for n in mesh.corner_normals]
    for group in MeshComponents(mesh):
        points = [mesh.vertices[i].co for i in group]
        outerRadius = max(math.hypot(p.y,p.z) for p in points)
        innerRadius = min(math.hypot(p.y,p.z) for p in points)
        if not (.11 < outerRadius < .144 and .049 < innerRadius < .070):
            continue
        for p in points:
            r = math.hypot(p.y,p.z)
            if side*p.x > .029:
                p.x -= side * .0042 * math.sin(math.pi*min(1,max(0,(r-.054)/.084)))**2
    mesh.update()
    # Stored normals were authored before the deformation. Rotate by the
    # local radial slope only on the deformed outer face.
    for loop in mesh.loops:
        p = mesh.vertices[loop.vertex_index].co
        r = math.hypot(p.y,p.z)
        if .054 < r < .138 and .029 < side*p.x < .042 and side*normals[loop.index][0] > .7:
            n = Vector(normals[loop.index])
            slope = -.0042*math.pi/.084 * math.sin(2*math.pi*(r-.054)/.084)
            n.y -= slope*p.y/r
            n.z -= slope*p.z/r
            normals[loop.index] = tuple(n.normalized())
    mesh.normals_split_custom_set(normals)


def DishDriveWindowWeb(owner, side, high, material):
    """Shape the eight tapered windows and the recessed face of the painted drive web."""
    mesh = owner.data
    groups = []
    for group in MeshComponents(mesh):
        radii = [math.hypot(mesh.vertices[i].co.y,mesh.vertices[i].co.z) for i in group]
        if .249 < max(radii) < .254 and len(group) > 100:
            groups.append(group)
    if len(groups) != 1:
        raise ValueError(f"Could not locate the retained drive web in {owner.name}")
    DeleteVertices(mesh, groups[0])
    def Circle(radius, count):
        return [Vector((radius*math.cos(i*math.tau/count),radius*math.sin(i*math.tau/count))) for i in range(count)]

    def Axial(radius):
        return .026 - .0038 * math.exp(-((radius-.151)/.063)**2)

    window = [Vector(value) for value in [(.148,-.0205),(.223,-.033),(.223,.033),(.148,.0205)]]
    aperture = []
    steps = 4 if high else 3
    for i, corner in enumerate(window):
        start = corner.lerp(window[i-1],.22)
        end = corner.lerp(window[(i+1)%len(window)],.22)
        for j in range(steps):
            t = j/(steps-1)
            aperture.append((1-t)**2*start+2*t*(1-t)*corner+t*t*end)

    outer = Circle(.2514,64 if high else 32)
    points = list(outer)
    boundaries = [list(range(len(outer)))]
    innerContours = []
    centre = Vector((.185,0))
    for i in range(8):
        angle = (i+.5)*math.tau/8
        c,s = math.cos(angle),math.sin(angle)
        def Turn(p):
            return Vector((p.x*c-p.y*s,p.x*s+p.y*c))
        first = len(points)
        points.extend(Turn(p+.100*(p-centre)) for p in aperture)
        innerContours.append([Turn(p) for p in aperture])
        boundaries.append(list(range(first,len(points))))
    for radius in ([.072,.105,.134,.236] if high else [.105]):
        points.extend(Circle(radius,32 if high else 16))
    coords,_,triangles,origins,_,areas = delaunay_2d_cdt(points,[],boundaries,1,1e-7)
    remap = {inputs[0]:i for i,inputs in enumerate(origins) if len(inputs)==1}
    if not all(i in remap for boundary in boundaries for i in boundary):
        raise ValueError("Drive web constraints overlap")
    vertices = [(side*Axial(p.length),p.x,p.y) for p in coords]
    back = len(vertices)
    vertices.extend((-side*.025,p.x,p.y) for p in coords)
    frontFaces = [tuple(f) for f,ids in zip(triangles,areas) if ids==[0]]
    faces = frontFaces + [tuple(i+back for i in reversed(f)) for f in frontFaces]
    outerIndices = [remap[i] for i in boundaries[0]]
    for i,j in zip(outerIndices,outerIndices[1:]+outerIndices[:1]):
        faces.append((i,j,j+back,i+back))
    for ids,contour in zip(boundaries[1:],innerContours):
        rings = [[remap[i] for i in ids]]
        rings.append(list(range(len(vertices),len(vertices)+len(contour))))
        vertices.extend((side*(Axial(p.length)-.0021),p.x,p.y) for p in contour)
        rings.append(list(range(len(vertices),len(vertices)+len(contour))))
        vertices.extend((-side*.023,p.x,p.y) for p in contour)
        rings.append([remap[i]+back for i in ids])
        for before,after in zip(rings,rings[1:]):
            for i in range(len(before)):
                j = (i+1)%len(before)
                faces.append((before[i],after[i],after[j],before[j]))
    newMesh = MeshFromFaces("DriveWebCastV107",vertices,faces,material,True)
    edit = bmesh.new()
    edit.from_mesh(newMesh)
    bmesh.ops.recalc_face_normals(edit, faces=list(edit.faces))
    edit.to_mesh(newMesh)
    edit.free()
    newMesh.update()
    # A triangulated surface is needed around the holes, but the cast dish
    # has a single continuous normal field through that triangulation.
    normals = [loop.vector.copy() for loop in newMesh.corner_normals]
    for face in newMesh.polygons:
        if face.index >= len(frontFaces)*2:
            break
        outward = face.index < len(frontFaces)
        for index in face.loop_indices:
            p = newMesh.vertices[newMesh.loops[index].vertex_index].co
            r = math.hypot(p.y,p.z)
            slope = .0076*(r-.151)/.063**2*math.exp(-((r-.151)/.063)**2)
            n = Vector((side,-slope*p.y/max(r,1e-6),-slope*p.z/max(r,1e-6))) if outward else Vector((-side,0,0))
            normals[index] = n.normalized()
    newMesh.normals_split_custom_set(normals)
    AddMesh(owner, newMesh)


def SprocketShoes(high, material, pitch):
    # Actual open cells under the segmented leading crossbar. The 164 mm span
    # and two inboard guides remain in the authored link frame.
    front = pitch/2
    xs = [-.073, -.055, -.010, .010, .055, .073]
    ys = [-front+.009, -.023, .012, front-.007]
    points = [(xs[0],ys[0]),(xs[-1],ys[0])]
    points += [(x,y) for y in ys[1:3] for x in xs]
    points += [(xs[0],ys[-1]),(xs[-1],ys[-1])]
    h = len(points)
    faces2D = [(0,1,7,6,5,4,3,2),(2,3,9,8),(4,5,11,10),
               (6,7,13,12),(8,9,10,11,12,13,15,14)]
    boundaryLoops = [(0,1,7,13,15,14,8,2), (3,9,10,4), (5,11,12,6)]
    vertices = [(x,y,z) for z in [-.005,.006] for x,y in points]
    faces = [tuple(reversed(f)) for f in faces2D] + [tuple(i+h for i in f) for f in faces2D]
    for loop in boundaryLoops:
        for a,b in zip(loop,loop[1:]+loop[:1]):
            faces.append((a,b,b+h,a+h))
    web = MeshFromFaces("TrackPerforatedWebV107",vertices,faces,material)
    if high:
        web = BeveledMesh(web, .0018, 3)
    obj = bpy.data.objects.new("TrackShoeTemporaryV107",web)
    bpy.context.scene.collection.objects.link(obj)

    def AddBox(name, bottom, top, size, taper, bevel):
        xc,yc = bottom[:2]
        w,d = size
        outline = [(-w/2,-d/2),(w/2,-d/2),(w/2,d/2),(-w/2,d/2)]
        verts = [(xc+x,yc+y,bottom[2]) for x,y in outline]
        verts += [(top[0]+x*taper,top[1]+y*taper,top[2]) for x,y in outline]
        box = MeshFromFaces(name, verts, [(0,3,2,1),(4,5,6,7),
            (0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],material)
        AddMesh(obj, BeveledMesh(box, bevel, 3) if high else box)

    for x,w in [(-.049,.032),(0,.040),(.049,.032)]:
        y = front-.014
        AddBox("TrackContactBarV107",(x,y,.004),(x,y-.001,.014),(w,.017),.84,.0022)
    for x in [-.06232,.06232]:
        AddBox("TrackGuideV107",(x,-.004,-.039),(x,-.004,-.003),
               (.00492,.015),2.0,.001)
    for side in [-1,1]:
        circle = 18 if high else 6
        y,z,r = front-.010, -.002, .0082
        verts = [(side*x,y+r*math.cos(j*math.tau/circle),z+r*math.sin(j*math.tau/circle))
                 for x in [.067,.082] for j in range(circle)]
        faces = [tuple(reversed(range(circle))),tuple(range(circle,circle*2))]
        for j in range(circle):
            k = (j+1)%circle
            faces.append((j,k,k+circle,j+circle))
        if side < 0:
            faces = [tuple(reversed(f)) for f in faces]
        pin = MeshFromFaces("TrackPinEndV107",verts,faces,material,high)
        AddMesh(obj, BeveledMesh(pin, .0012, 3) if high else pin)
    result = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    result.name = "Mesh_Type94TrackShoeV107"
    return result


def RebuildExterior(high, paints, pitch):
    replacedSheets = ReplaceFenders(high, paints["Sheet"])
    CreasedFrontLip(high, paints["Sheet"])
    for side, label in [(-1,"Left"),(1,"Right")]:
        CastShoulder(bpy.data.objects["Geometry_FinalDriveHousing"+label+"_Paint"], side, high, paints["Cast"])
        DishDriveWindowWeb(bpy.data.objects["Geometry_Wheel_"+label+"_Drive_Paint"],side,high,paints["Wheel"])
        for index in range(4):
            RefreshWheelFace(bpy.data.objects[f"Geometry_Wheel_{label}_Road{index}_Paint"],side)
    CrownLug(high,paints["Cast"])
    links = [obj for obj in bpy.data.objects["Type94Tankette"].children_recursive if obj.name.startswith("TrackLink_")]
    if len(links) != 160:
        raise ValueError("The retained track contract specifies 80 independent shoes per side")
    newShoe = SprocketShoes(high,paints["Track"],pitch)
    for obj in links:
        obj.data = newShoe
    return dict(fenderSheetsReplaced=replacedSheets, castShoulders=2, driveWebs=2,
                dishedRoadWheelFaces=8, replacedTrackInstances=len(links))
