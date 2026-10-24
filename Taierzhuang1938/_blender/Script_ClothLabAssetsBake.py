"""Build three isolated cloth studies through Script_BlenderMcp.mjs exec --file.

Run Script_ClothLabAssetsTextures.py first with ordinary Python. Sources and packed
textures are saved outside the repository; only GLB and its audit are delivered.
The old SingleBlanket asset and every campaign cloth setting remain untouched.
"""
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree

projectDir = (Path(globals()["ClothLabProject"]) if "ClothLabProject" in globals() else
              Path(__file__).resolve().parents[1] if "__file__" in globals() else Path.cwd() / "Taierzhuang1938")
sourceDir = Path("C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/ClothLab")
outputDir = projectDir / "Model/ClothLab"
rows, columns = 18, 12
widthSegments, lengthSegments = 50, 64
cornerNames = {(0, 0): "Blanket_CornerHeadL", (0, columns-1): "Blanket_CornerHeadR",
               (rows-1, 0): "Blanket_CornerTailL", (rows-1, columns-1): "Blanket_CornerTailR"}
assetSpecs = (
    {"id": "DongguaQuilt", "width": 1.4, "length": 1.9, "thickness": 0.080, "hem": 0.026,
     "texture": "DongguaQuiltTopBase", "underside": "DongguaQuiltBottomBase", "normalStrength": 0.72,
     "normalTexture": "DongguaCottonDetailNormal", "detailTileM": 0.18, "specular": 0.10,
     "surface": "Faded grey blue cotton / warm grey cotton lining; uneven cotton filling; creative study"},
    {"id": "DoorCurtain", "width": 1.25, "length": 1.9, "thickness": 0.032, "hem": 0.010,
     "texture": "DoorCurtainBase", "normalStrength": 0.42},
    {"id": "SichuanBanner", "width": 1.45, "length": 1.75, "thickness": 0.0025, "hem": 0.0025,
     "texture": "SichuanBannerBase", "normalStrength": 0.28},
)


def BoneName(row, column):
    return cornerNames.get((row, column), f"Blanket_Grid_r{row}_c{column}")


def Smooth(value):
    value = min(1, max(0, value))
    return value*value*(3-2*value)


def BilinearWeights(point, spec):
    columnValue = min(columns-1, max(0, (0.5-point.x/spec["width"])*(columns-1)))
    rowValue = min(rows-1, max(0, (0.5+point.y/spec["length"])*(rows-1)))
    column, row = min(columns-2, int(columnValue)), min(rows-2, int(rowValue))
    u, v = columnValue-column, rowValue-row
    return ((BoneName(row, column), (1-u)*(1-v)), (BoneName(row, column+1), u*(1-v)),
            (BoneName(row+1, column), (1-u)*v), (BoneName(row+1, column+1), u*v))


def Surface(u, v, spec):
    width, length = spec["width"], spec["length"]
    edge = min(u*width, (1-u)*width, v*length, (1-v)*length)
    edgeBlend = Smooth(edge/0.105)
    x, y = (u-.5)*width, (v-.5)*length
    # A flat bone plane with unequal filling and small wrinkled skin on both sides.
    # No segmented pressure cells: the outer silhouette remains a single cotton quilt.
    if spec["id"] == "DongguaQuilt":
        # A thick, softly rounded filling envelope. Broad cotton clumps vary in
        # volume; stitched troughs compress the filling, not a fake colour grid.
        edgeBlend = math.sin(min(1, edge/.085)*math.pi*.5)
        loose = (.0031*math.sin(u*10+v*8)+.0025*math.cos(u*16-v*11)
                 +.0014*math.sin(u*31+v*15)*math.sin(v*23-u*10))
        seam = 0.0
        for n, center in enumerate((.22, .49, .77)):
            curve = center+.013*math.sin(v*8+n*1.8)+.005*math.sin(v*25+.3*n)
            seam = max(seam, math.exp(-((u-curve)/.029)**2))
        for n, center in enumerate((.16, .38, .64, .84)):
            curve = center+.009*math.sin(u*10+n)+.003*math.sin(u*27)
            seam = max(seam, math.exp(-((v-curve)/.022)**2))
        half = spec["hem"]/2+(spec["thickness"]/2-spec["hem"]/2)*edgeBlend
        half += edgeBlend*(loose-.015*seam)
        middle = edgeBlend*(.0018*math.sin(u*21+v*14)+.0013*math.sin(v*29-u*9))
        # Round off only the cloth silhouette; the control bones keep their exact grid.
        corner = Smooth((abs(x)-(width/2-.045))/.045)*Smooth((abs(y)-(length/2-.045))/.045)
        x -= math.copysign(.013*corner, x); y -= math.copysign(.013*corner, y)
    elif spec["id"] == "DoorCurtain":
        seam = max(math.exp(-((u-(n/4+.004*math.sin(v*9+n)))/.010)**2) for n in range(1, 4))
        half = spec["hem"]/2+(spec["thickness"]/2-spec["hem"]/2)*edgeBlend
        half += edgeBlend*(.0015*math.sin(v*16+u*13)-.0025*seam)
        middle = .002*math.sin(u*17+v*6)*edgeBlend
    else:
        half = spec["thickness"]/2
        middle = .0008*math.sin(v*23+u*17)*math.sin(u*9)*edgeBlend
    return x, y, middle, half


def CreateMesh(spec):
    stride = widthSegments+1
    gridCount = stride*(lengthSegments+1)
    vertices, faces = [], []
    for side in (1, -1):
        for j in range(lengthSegments+1):
            for i in range(widthSegments+1):
                x, y, middle, half = Surface(i/widthSegments, j/lengthSegments, spec)
                vertices.append((x, y, middle+side*half))
    for side in (0, 1):
        for j in range(lengthSegments):
            for i in range(widthSegments):
                k = side*gridCount+j*stride+i
                face = (k, k+1, k+stride+1, k+stride)
                faces.append(face if side == 0 else tuple(reversed(face)))
    boundary = [(i, 0) for i in range(widthSegments)]
    boundary += [(widthSegments, j) for j in range(lengthSegments)]
    boundary += [(i, lengthSegments) for i in range(widthSegments, 0, -1)]
    boundary += [(0, j) for j in range(lengthSegments, 0, -1)]
    ringStart = len(vertices)
    for i, j in boundary:
        x, y, middle, _ = Surface(i/widthSegments, j/lengthSegments, spec)
        outward = Vector((-1 if i == 0 else 1 if i == widthSegments else 0,
                          -1 if j == 0 else 1 if j == lengthSegments else 0, 0)).normalized()
        # A narrow rolled binding, continuous and closed, with its own matte colour.
        bulge = .008 if spec["id"] == "DongguaQuilt" else .002 if spec["id"] != "SichuanBanner" else .0008
        vertices.append((x+outward.x*bulge, y+outward.y*bulge, middle))
    for n, (i, j) in enumerate(boundary):
        a = j*stride+i
        ni, nj = boundary[(n+1) % len(boundary)]
        b, ma, mb = nj*stride+ni, ringStart+n, ringStart+(n+1) % len(boundary)
        faces.extend(((a, ma, mb, b), (ma, gridCount+a, gridCount+b, mb)))
    data = bpy.data.meshes.new(f"Mesh_{spec['id']}")
    data.from_pydata(vertices, [], faces)
    data.update()
    mesh = bpy.data.objects.new(f"Cloth_{spec['id']}", data)
    bpy.context.collection.objects.link(mesh)
    uv = data.uv_layers.new(name="UVMap")
    ringGrid = {ringStart+n: j*stride+i for n, (i, j) in enumerate(boundary)}
    sheetQuads = widthSegments*lengthSegments
    perimeter = [0.0]
    for n, (i, j) in enumerate(boundary):
        ni, nj = boundary[(n+1) % len(boundary)]
        a, b = Vector(vertices[j*stride+i]), Vector(vertices[nj*stride+ni])
        perimeter.append(perimeter[-1]+math.hypot(b.x-a.x, b.y-a.y))
    for polygon in data.polygons:
        polygon.use_smooth = True
        polygon.material_index = 0 if polygon.index < sheetQuads else 1 if polygon.index < 2*sheetQuads else 2
        for loopIndex in polygon.loop_indices:
            index = data.loops[loopIndex].vertex_index
            gridIndex = ringGrid.get(index, index % gridCount)
            i, j = gridIndex % stride, gridIndex // stride
            if polygon.index < 2*sheetQuads:
                uv.data[loopIndex].uv = (1-i/widthSegments, 1-j/lengthSegments)
            else:
                # A real side-strip UV chart, with area across the shell thickness.
                # Copying the top planar UV here collapses V and exports tangents
                # parallel to the side normals. Metre-scaled U/V also preserve
                # the shared detail map's quarter-metre yarn repeat.
                edge = (polygon.index-2*sheetQuads)//2
                bi, bj = boundary[edge]
                atStart = gridIndex == bj*stride+bi
                uv.data[loopIndex].uv = (perimeter[edge if atStart else edge+1]/spec["width"],
                                         data.vertices[index].co.z/spec["length"]+.5)
    return mesh


def CreateMaterial(name, texture, spec, tint=None):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = False
    tree = material.node_tree
    bsdf = tree.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = .96
    bsdf.inputs["Metallic"].default_value = 0
    bsdf.inputs["Specular IOR Level"].default_value = spec.get("specular", .18)
    bsdf.inputs["Sheen Weight"].default_value = 1
    bsdf.inputs["Sheen Tint"].default_value = (.28, .31, .33, 1) if spec["id"] == "DongguaQuilt" else (.20, .18, .15, 1)
    bsdf.inputs["Sheen Roughness"].default_value = .88 if spec["id"] == "DongguaQuilt" else .80
    if texture:
        image = bpy.data.images.load(str(sourceDir / f"Textures/Texture_{texture}.png"), check_existing=True)
        image.colorspace_settings.name = "sRGB"
        image.pack()
        node = tree.nodes.new("ShaderNodeTexImage")
        node.image, node.extension = image, "EXTEND"
        tree.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = (*tint, 1)
    normalPath = (sourceDir / f"Textures/Texture_{spec['normalTexture']}.png" if spec.get("normalTexture") else
                  projectDir / "Texture/Texture_SingleBlanketDetailNormal.webp")
    normalImage = bpy.data.images.load(str(normalPath), check_existing=True)
    normalImage.colorspace_settings.name = "Non-Color"
    normalImage.pack()
    node = tree.nodes.new("ShaderNodeTexImage")
    node.image, node.extension = normalImage, "REPEAT"
    uv = tree.nodes.new("ShaderNodeTexCoord")
    mapping = tree.nodes.new("ShaderNodeMapping")
    tile = spec.get("detailTileM", .25)
    mapping.inputs["Scale"].default_value = (spec["width"]/tile, spec["length"]/tile, 1)
    tree.links.new(uv.outputs["UV"], mapping.inputs["Vector"])
    tree.links.new(mapping.outputs["Vector"], node.inputs["Vector"])
    normal = tree.nodes.new("ShaderNodeNormalMap")
    normal.inputs["Strength"].default_value = spec["normalStrength"]
    tree.links.new(node.outputs["Color"], normal.inputs["Color"])
    tree.links.new(normal.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def CreateRig(mesh, spec):
    armature = bpy.data.armatures.new("Blanket_Armature")
    rig = bpy.data.objects.new("Blanket_Rig", armature)
    bpy.context.collection.objects.link(rig)
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    root = armature.edit_bones.new("Blanket_Root")
    root.head, root.tail = (0, 0, 0), (0, 0, .10)
    root.use_deform = False
    for row in range(rows):
        for column in range(columns):
            x, y = (.5-column/(columns-1))*spec["width"], (-.5+row/(rows-1))*spec["length"]
            bone = armature.edit_bones.new(BoneName(row, column))
            bone.head, bone.tail = (x, y, 0), (x, y, .05)
            bone.parent, bone.use_connect = root, False
    bpy.ops.object.mode_set(mode="OBJECT")
    mesh.parent = rig
    modifier = mesh.modifiers.new("ClothSkin", "ARMATURE")
    modifier.object = rig
    groups = {BoneName(r, c): mesh.vertex_groups.new(name=BoneName(r, c)) for r in range(rows) for c in range(columns)}
    for vertex in mesh.data.vertices:
        for name, weight in BilinearWeights(vertex.co, spec):
            if weight > 1e-12:
                groups[name].add([vertex.index], weight, "REPLACE")
    return rig


def CheckSource(mesh, rig, spec):
    edgeUses = {}
    for face in mesh.data.polygons:
        assert face.area > 1e-9
        for edge in face.edge_keys:
            edgeUses[edge] = edgeUses.get(edge, 0)+1
    assert all(value == 2 for value in edgeUses.values()), "Shell is not closed"
    assert len(mesh.data.vertices)-len(mesh.data.edges)+len(mesh.data.polygons) == 2
    assert len(rig.data.bones) == 217
    assert all(abs(bone.head_local.z) < 1e-8 for bone in rig.data.bones)
    maxWeightError = max(abs(sum(group.weight for group in vertex.groups)-1) for vertex in mesh.data.vertices)
    assert maxWeightError < 1e-6
    assert all(1 <= len(vertex.groups) <= 4 for vertex in mesh.data.vertices)
    # A corner pull must affect both shells together, according to the same skin kernel.
    bone = rig.pose.bones["Blanket_CornerHeadL"]
    bone.matrix = Matrix.Translation((0, 0, .25)) @ bone.bone.matrix_local
    bpy.context.view_layer.update()
    evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    deformed = evaluated.to_mesh()
    liftError = 0.0
    for vertex, moved in zip(mesh.data.vertices, deformed.vertices):
        weight = dict(BilinearWeights(vertex.co, spec)).get("Blanket_CornerHeadL", 0)
        expected = vertex.co+Vector((0, 0, .25*weight))
        liftError = max(liftError, (moved.co-expected).length)
    evaluated.to_mesh_clear()
    bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    assert liftError < 1e-6, liftError
    gridCount = (widthSegments+1)*(lengthSegments+1)
    thicknesses = [mesh.data.vertices[i].co.z-mesh.data.vertices[i+gridCount].co.z for i in range(gridCount)]
    return {"closedShell": True, "boundaryEdges": 0, "eulerCharacteristic": 2,
            "weightSumMaxError": maxWeightError, "cornerPullMaxErrorM": liftError,
            "thicknessRangeM": [min(thicknesses), max(thicknesses)]}


def ReadGlb(path):
    raw = path.read_bytes()
    size = struct.unpack_from("<I", raw, 12)[0]
    return json.loads(raw[20:20+size]), raw[28+size:]


def CheckTangents(document, binary):
    def Values(index, count):
        accessor = document["accessors"][index]
        view = document["bufferViews"][accessor["bufferView"]]
        offset = accessor.get("byteOffset", 0)+view.get("byteOffset", 0)
        stride = view.get("byteStride", count*4)
        assert accessor["componentType"] == 5126
        return [struct.unpack_from("<"+"f"*count, binary, offset+i*stride) for i in range(accessor["count"])]
    results = []
    for primitive in document["meshes"][0]["primitives"]:
        normals = Values(primitive["attributes"]["NORMAL"], 3)
        tangents = Values(primitive["attributes"]["TANGENT"], 4)
        lengths = [math.sqrt(sum(component*component for component in tangent[:3])) for tangent in tangents]
        maxDot = max(abs(sum(a*b for a, b in zip(normal, tangent))) for normal, tangent in zip(normals, tangents))
        assert min(lengths) > .999 and max(lengths) < 1.001, (min(lengths), max(lengths))
        assert maxDot < .001, maxDot
        result = {"material": document["materials"][primitive["material"]]["name"],
                  "vertices": len(normals), "minTangentLength": min(lengths), "maxNormalDotTangentAbs": maxDot}
        results.append(result)
    return results


def CheckRoundTrip(path, mesh):
    points = [vertex.co.copy() for vertex in mesh.data.vertices]
    tree = KDTree(len(points))
    for index, point in enumerate(points):
        tree.insert(point, index)
    tree.balance()
    sourceScene = bpy.context.window.scene
    roundScene = bpy.data.scenes.new("ClothLabRoundTrip")
    bpy.context.window.scene = roundScene
    bpy.ops.import_scene.gltf(filepath=str(path))
    # Blender 5.2 adds a hidden Icosphere as its imported-bone custom shape.
    imported = [o for o in roundScene.objects if o.type == "MESH" and any(m.type == "ARMATURE" for m in o.modifiers)]
    error = max(tree.find(obj.matrix_world @ vertex.co)[2] for obj in imported for vertex in obj.data.vertices)
    assert error < 1e-6, error
    for obj in imported:
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        data = evaluated.to_mesh()
        assert max((a.co-b.co).length for a, b in zip(obj.data.vertices, data.vertices)) < 1e-6
        evaluated.to_mesh_clear()
    bpy.context.window.scene = sourceScene
    for obj in list(roundScene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.scenes.remove(roundScene)
    return error


def BuildAsset(spec):
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images):
        for block in list(collection):
            collection.remove(block, do_unlink=True)
    scene = bpy.context.scene
    scene.unit_settings.system, scene.unit_settings.scale_length = "METRIC", 1
    mesh = CreateMesh(spec)
    rig = CreateRig(mesh, spec)
    mesh.data.materials.append(CreateMaterial(f"Mat_{spec['id']}Front", spec["texture"], spec))
    mesh.data.materials.append(CreateMaterial(f"Mat_{spec['id']}Back", spec.get("underside", spec["texture"]), spec))
    tint = (.115, .17, .20) if spec["id"] == "DongguaQuilt" else (.15, .125, .09) if spec["id"] != "SichuanBanner" else (.18, .018, .012)
    mesh.data.materials.append(CreateMaterial(f"Mat_{spec['id']}Binding", None, spec, tint))
    mesh["HistoricalClassification"] = "Artistic reconstruction / 创作复原"
    mesh["RuntimeUse"] = "Cloth lab only; campaign not replaced"
    checks = CheckSource(mesh, rig, spec)
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = rig
    path = outputDir / f"Model_{spec['id']}.glb"
    pendingPath = path.with_name(path.stem+"_BakePending.glb")
    bpy.ops.export_scene.gltf(filepath=str(pendingPath), export_format="GLB", use_selection=True,
        export_yup=True, export_apply=False, export_texcoords=True, export_normals=True,
        export_tangents=True, export_image_format="WEBP", export_image_quality=95,
        export_materials="EXPORT", export_animations=False, export_def_bones=False,
        export_skins=True, export_all_influences=False, export_extras=True,
        export_draco_mesh_compression_enable=False)
    document, binary = ReadGlb(pendingPath)
    assert len(document["skins"]) == 1 and len(document["skins"][0]["joints"]) == 217
    assert len(document["meshes"]) == 1
    assert len(document["materials"]) == 3
    for node in document["nodes"]:
        if "mesh" in node or node.get("name") == "Blanket_Rig":
            assert not any(key in node for key in ("matrix", "translation", "rotation", "scale")), node
    assert all("bufferView" in image for image in document["images"])
    checks["tangents"] = CheckTangents(document, binary)
    checks["roundTripMaxDeviationM"] = CheckRoundTrip(pendingPath, mesh)
    blendPath = sourceDir / f"Scene_{spec['id']}.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blendPath), compress=True)
    pendingPath.replace(path)
    report = {**spec, "file": path.name, "vertices": len(mesh.data.vertices),
        "triangles": sum(len(p.vertices)-2 for p in mesh.data.polygons), "meshes": 1,
        "primitives": len(document["meshes"][0]["primitives"]), "materials": [m["name"] for m in document["materials"]],
        "textureCount": len(document["images"]), "textureSize": [1024, 1024], "embeddedTextures": True,
        "roughness": .96, "metallic": 0, "specularIorLevel": spec.get("specular", .18),
        "sourceBlend": str(blendPath), "checks": checks, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "bytes": path.stat().st_size, "classification": "Artistic reconstruction; cloth-lab-only study"}
    print("CLOTH_LAB_ASSET " + json.dumps(report, ensure_ascii=False))
    return report


def Main():
    if bpy.data.filepath and sourceDir not in Path(bpy.data.filepath).parents:
        raise RuntimeError("Refusing to overwrite a Blender project belonging to another task")
    sourceDir.mkdir(parents=True, exist_ok=True)
    outputDir.mkdir(parents=True, exist_ok=True)
    # Select one asset without re-exporting the other two committed GLBs.
    arguments = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    only = globals().get("ClothLabOnly")
    if "--only" in arguments:
        only = arguments[arguments.index("--only")+1]
    if only and only not in {spec["id"] for spec in assetSpecs}:
        raise ValueError("Unknown --only asset: "+only)
    priorPath = outputDir / "Data_ClothLabAssets.json"
    prior = json.loads(priorPath.read_text(encoding="utf-8")) if only and priorPath.exists() else {}
    priorAssets = {asset["id"]: asset for asset in prior.get("assets", [])}
    reports = [BuildAsset(spec) if not only or spec["id"] == only else priorAssets[spec["id"]] for spec in assetSpecs]
    report = {"version": "20261025ClothLabV4SoftCotton", "blenderVersion": bpy.app.version_string,
        "coordinates": "Blender (x,y,z) -> glTF (x,z,-y); cloth head row 0 is +Z; column 0 is +X; flat bones at Y=0",
        "rig": {"rows": rows, "columns": columns, "root": "Blanket_Root", "bones": 217,
            "gridNames": "Blanket_Grid_r{row}_c{column}", "corners": list(cornerNames.values()),
            "independentChildren": True, "weights": "At most four bilinear neighbours per vertex"},
        "assets": reports}
    (outputDir / "Data_ClothLabAssets.json").write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print("CLOTH_LAB_COMPLETE " + json.dumps({"files": [r["file"] for r in reports]}))


if __name__ == "__main__" or "__file__" not in globals():
    Main()
