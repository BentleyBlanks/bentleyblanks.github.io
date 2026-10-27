"""Reopen both authored projects and audit both actual packed GLB exports.

Run through scripts/Script_BlenderMcp.mjs start --batch. Reports and reimport
projects stay local; this script never changes either authored source project.
"""
from pathlib import Path
from types import SimpleNamespace
import argparse
import hashlib
import json
import math
import re
import struct
import sys
import bpy
import numpy as np
from mathutils import Vector, Quaternion
from mathutils.bvhtree import BVHTree


CONTROL_NAMES = ("Propeller", "WheelLeft", "WheelRight", "Rudder", "ElevatorLeft",
                 "ElevatorRight", "AileronLeft", "AileronRight", "AileronLowerLeft", "AileronLowerRight")
SOURCE_DEFAULT = Path("C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/KawasakiType88/Release86")


def Sha(data):
    return hashlib.sha256(data).hexdigest()


def Write(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def P(x, y, z):
    return Vector((x, -z, y))


def Meshes():
    return [ob for ob in bpy.context.scene.objects if ob.type == "MESH"]


def Triangles(objects):
    return sum(len(poly.vertices) - 2 for ob in objects for poly in ob.data.polygons)


def Dimensions(objects):
    points = [ob.matrix_world @ vertex.co for ob in objects for vertex in ob.data.vertices]
    extent = [max(point[i] for point in points) - min(point[i] for point in points) for i in range(3)]
    result = {"wingspan": extent[0], "height": extent[2], "length": extent[1]}
    for key, expected in (("wingspan", 15), ("height", 3.37945), ("length", 12.51)):
        assert abs(result[key] - expected) < .004, (key, result)
    return result


def Tree(ob):
    if hasattr(ob, "tree"):
        return ob.tree
    return BVHTree.FromPolygons([ob.matrix_world @ vertex.co for vertex in ob.data.vertices],
                               [list(poly.vertices) for poly in ob.data.polygons], epsilon=.000001)


def Frozen(name, objects):
    assert objects, name
    vertices, faces = [], []
    for ob in objects:
        offset = len(vertices)
        vertices.extend(ob.matrix_world @ vertex.co for vertex in ob.data.vertices)
        faces.extend([offset + index for index in poly.vertices] for poly in ob.data.polygons)
    return SimpleNamespace(name=name, tree=BVHTree.FromPolygons(vertices, faces, epsilon=.000001))


def Caps(ob, world=False):
    points = np.unique(np.round(np.array([tuple(ob.matrix_world @ vertex.co if world else vertex.co)
                                         for vertex in ob.data.vertices]), 7), axis=0)
    centre = points.mean(0)
    _, vectors = np.linalg.eigh((points - centre).T @ (points - centre))
    axis = vectors[:, -1]
    along = points @ axis
    ends = [Vector(tuple(points[np.abs(along - end) < .00001].mean(0))) for end in (along.min(), along.max())]
    return ends if world else [ob.matrix_world @ end for end in ends]


def SourceAudit(sourceRoot, variant, buildVersion, surface):
    file = sourceRoot / f"Scene_KawasakiType88{variant}.blend"
    bpy.ops.wm.open_mainfile(filepath=str(file))
    scene = bpy.context.scene
    root = bpy.data.objects["KawasakiType88Root"]
    assert root["buildVersion"] == buildVersion
    assert root["surfaceSourceVersion"] == surface["version"]
    objects = [ob for ob in bpy.data.collections["KawasakiType88EditableAirframe"].objects if ob.type == "MESH"]
    files = [image for image in bpy.data.images if image.users and image.source == "FILE"]
    expected = {record["file"]: record["sha256"] for record in surface["files"]}
    matched = []
    for image in files:
        assert image.packed_file, (variant, image.name)
        basename = Path(bpy.path.abspath(image.filepath)).name
        if basename in expected:
            assert Sha(image.packed_file.data) == expected[basename], ("Stale packed image", variant, basename)
            assert Sha((sourceRoot / "Textures" / basename).read_bytes()) == expected[basename]
            matched.append(basename)
    assert len(files) == 53 and len(matched) == len(expected) == 52
    controls = [bpy.data.objects.get(name + "Pivot") for name in CONTROL_NAMES]
    assert all(controls) and scene.unit_settings.scale_length == 1
    sockets = {item.name for item in bpy.data.node_groups["glTF Material Output"].interface.items_tree if item.item_type == "SOCKET"}
    assert {"Occlusion", "Thickness", "Dispersion", "Iridescence Factor", "Iridescence Thickness Minimum"} <= sockets
    row = {"project": file.name, "triangles": Triangles(objects), "meshes": len(objects),
           "usedFileImages": len(files), "packedImages": len(files), "controls": len(controls),
           "metresPerUnit": scene.unit_settings.scale_length, "gltfSettingsInputs": sorted(sockets),
           "surfaceVersion": root["surfaceSourceVersion"], "buildVersion": root["buildVersion"],
           "packedImagesMatchGeneratedFiles": True, "matchedGeneratedImages": len(matched),
           "dimensionsM": Dimensions(objects), "occlusionBakeSamples": scene["occlusionBakeSamples"],
           "occlusionFilter": scene["occlusionFilter"]}
    braces = []
    if variant == "High":
        for side in ("Left", "Right"):
            for direction in ("Forward", "Rear"):
                ob = bpy.data.objects["TailplaneLower" + direction + "Brace" + side]
                braces.append({"name": ob.name, "caps": [list(end) for end in Caps(ob, True)], "triangles": Triangles([ob])})
    return row, braces


def ImportAudit(file, sourceRow, variant, sourceRoot, reportRoot, buildVersion, surface):
    data = file.read_bytes()
    assert struct.unpack_from("<III", data) == (0x46546C67, 2, len(data))
    document = json.loads(data[20:20 + struct.unpack_from("<I", data, 12)[0]])
    triangleCount = sum(document["accessors"][primitive["indices"]]["count"] // 3
                        for mesh in document["meshes"] for primitive in mesh["primitives"])
    assert triangleCount == sourceRow["triangles"]
    assert len(document["materials"]) == 28 and len(document["images"]) == 53
    assert all(image["mimeType"] == "image/webp" and "bufferView" in image for image in document["images"])
    assert not document.get("cameras") and not document.get("extensions", {}).get("KHR_lights_punctual")
    packingFile = file.with_name("Data_" + file.stem.removeprefix("Model_") + "Packing.json")
    packing = json.loads(packingFile.read_text("utf-8"))
    assert packing["outputSha256"] == Sha(data)
    assert all(record["pixelExact"] and record["sourcePixelsSha256"] == record["decodedPixelsSha256"] for record in packing["images"])
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for blocks in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.node_groups):
        for block in list(blocks):
            if not block.users:
                blocks.remove(block)
    bpy.ops.import_scene.gltf(filepath=str(file))
    scene = bpy.context.scene
    scene["BlenderMcpTask"] = "KawasakiType88"
    scene["KawasakiAuditVariant"] = variant
    scene["ImportedGlbSha256"] = Sha(data)
    root = bpy.data.objects["KawasakiType88Root"]
    assert root["buildVersion"] == buildVersion and root["surfaceSourceVersion"] == surface["version"]
    images = [image for image in bpy.data.images if image.users and image.source == "FILE"]
    assert len(images) == 53 and all(image.packed_file for image in images)
    objects = Meshes()
    assert Triangles(objects) == triangleCount and len(objects) == len(document["meshes"])
    assert triangleCount <= (80000 if variant == "Game" else 300000)
    row = {"sha256": Sha(data), "meshes": len(objects), "triangles": triangleCount, "usedFileImages": len(images),
           "packedImages": len(images), "missingImages": [], "dimensionsM": Dimensions(objects)}
    suffix = "ExportCheck" if variant == "Game" else "HighExportCheck"
    bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot / ("Scene_KawasakiType88" + suffix + ".blend")))
    Write(reportRoot / ("Data_GlbReimport.json" if variant == "Game" else "Data_HighGlbReimport.json"), row)
    return row


def BraceAudit(expected):
    objects = bpy.data.objects
    bodyTree = Tree(objects["AirframeFacetedFuselage"])
    tailObjects = [ob for ob in Meshes() if ob.parent and ob.parent.name == "TailplaneReferenceAssembly"]
    tailTree = Frozen("AllFixedHorizontalStabilizer", tailObjects).tree
    vertices, faces, rows = [], [], []
    for entry in expected:
        ob = objects.get(entry["name"]) or objects["Part_KawasakiType88Root_Steel"]
        points = np.array([tuple(ob.matrix_world @ vertex.co) for vertex in ob.data.vertices])
        a, b = np.array(entry["caps"])
        delta = b - a
        length = np.linalg.norm(delta)
        axis = delta / length
        along = (points - a) @ axis
        radius = np.linalg.norm(points - a - along[:, None] * axis, axis=1)
        valid = (np.abs(radius - .015) < .00003) & (along > -.00003) & (along < length + .00003)
        selected = [poly for poly in ob.data.polygons if all(valid[index] for index in poly.vertices)]
        assert len(selected) == entry["triangles"], (entry["name"], len(selected), entry["triangles"])
        bodyGap = min(bodyTree.find_nearest(Vector(tuple(end)))[3] for end in (a, b))
        tailGap = min(tailTree.find_nearest(Vector(tuple(end)))[3] for end in (a, b))
        assert bodyGap < .004 and tailGap < .005, (entry["name"], bodyGap, tailGap)
        offset = len(vertices)
        vertices.extend(Vector(tuple(point)) for point in points)
        faces.extend([offset + index for index in poly.vertices] for poly in selected)
        rows.append({"name": entry["name"], "exportedTriangles": len(selected), "bodyJointDistanceM": bodyGap,
                     "tailJointDistanceM": tailGap, "endpointsBlender": entry["caps"]})
    assert len(rows) == 4 and len(faces) == 112
    return BVHTree.FromPolygons(vertices, faces, epsilon=.000001), {"braces": rows, "selectedTriangles": len(faces), "source": "Actual packed GLB compared with reopened authored high source"}


def MotionAudit(tailData, braceTree, editable=False):
    objects = bpy.data.objects
    rest = {name: objects[name + "Pivot"].rotation_quaternion.copy() for name in CONTROL_NAMES}
    axes, axisReport = {}, {}
    for name in CONTROL_NAMES:
        ob = objects[name + "Pivot"]
        ob.rotation_mode = "XYZ" if editable and name.startswith("Aileron") else "QUATERNION"
        if name == "Propeller":
            expected = P(0, 0, 1)
        elif name == "Rudder":
            expected = P(0, 1, 0)
        elif name.startswith("Aileron"):
            tilt = float(ob.get("hingeTiltRadians", 0))
            expected = P(math.cos(tilt), math.sin(tilt), 0)
        elif name.startswith("Elevator"):
            yaw = math.radians(float(objects["KawasakiType88Root"]["tailplaneReferenceYawDegrees"]))
            assert abs(math.degrees(yaw) - tailData["frame"]["yawDegrees"]) < .00001
            expected = P(math.cos(yaw), 0, -math.sin(yaw))
        else:
            expected = P(1, 0, 0)
        candidates = [Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))]
        dots = [(ob.matrix_world.to_3x3() @ axis).normalized().dot(expected) for axis in candidates]
        index = max(range(3), key=lambda i: abs(dots[i]))
        axes[name] = candidates[index] * (1 if dots[index] > 0 else -1)
        axisReport[name] = {"localAxis": list(axes[name]), "alignment": abs(dots[index])}
        assert abs(dots[index]) > .99999, (name, dots)
    rodRest = {side: objects["AileronExternalPushrod" + side].location.copy() for side in ("Left", "Right")}

    def Pose(degrees):
        for name in CONTROL_NAMES:
            angle = degrees * (-1 if name.startswith("Aileron") and name.endswith("Right") else 1)
            if name.startswith("Wheel") or name == "Propeller":
                angle = 0
            if editable and name.startswith("AileronLower"):
                continue
            if editable and name.startswith("Aileron"):
                objects[name + "Pivot"].rotation_euler.x = math.radians(angle)
            else:
                objects[name + "Pivot"].rotation_quaternion = rest[name] @ Quaternion(axes[name], math.radians(angle))
        for side, sign in (() if editable else (("Left", 1), ("Right", -1))):
            rod = objects["AileronExternalPushrod" + side]
            angle = math.radians(degrees * sign)
            tilt = float(rod.get("hingeTiltRadians", 0))
            dy = .11 * (math.cos(angle) - 1) - .10 * math.sin(angle)
            dz = .11 * math.sin(angle) + .10 * (math.cos(angle) - 1)
            delta = P(-math.sin(tilt) * dy, math.cos(tilt) * dy, dz)
            if rod.parent:
                delta = rod.parent.matrix_world.to_3x3().inverted() @ delta
            rod.location = rodRest[side] + delta
        bpy.context.view_layer.update()

    def MaterialHas(ob, key):
        return any(key in material.name for material in ob.data.materials)

    upper = Frozen("AllFixedUpperWing", [ob for ob in Meshes() if ob.parent and ob.parent.name == "KawasakiType88Root" and MaterialHas(ob, "UpperWing")])
    lower = Frozen("AllFixedLowerWing", [ob for ob in Meshes() if ob.parent and ob.parent.name == "KawasakiType88Root" and (MaterialHas(ob, "LowerUnderside") or ob.get("aileronGapClosure", False))])
    tail = Frozen("AllFixedHorizontalStabilizer", [ob for ob in Meshes() if ob.parent and ob.parent.name == "TailplaneReferenceAssembly" and MaterialHas(ob, "Tail")])
    fin, body = objects["TypeIITallFixedFin"], objects["AirframeFacetedFuselage"]
    records, rodLengths = [], {}

    def Intersections(moving, fixed, **pose):
        records.append({**pose, "moving": moving.name, "fixed": fixed.name, "surfaceIntersections": len(Tree(moving).overlap(Tree(fixed)))})

    braces = SimpleNamespace(name="ActualTypeIILowerVBraces", tree=braceTree)
    for degrees in (-25, -22, -18, 0, 18, 22, 25):
        Pose(degrees)
        for side in ("Left", "Right"):
            Intersections(objects["Aileron" + side], upper, angle=degrees)
            Intersections(objects["AileronLower" + side], lower, angle=degrees)
            for fixed in (tail, body, fin, objects["Elevator" + ("Right" if side == "Left" else "Left")]):
                Intersections(objects["Elevator" + side], fixed, angle=degrees)
            rod = Caps(objects["AileronExternalPushrod" + side])
            low = Caps(objects["LowerAileronLinkHorn" + side])
            high = Caps(objects["UpperAileronLinkHorn" + side])
            length = (rod[1] - rod[0]).length
            rodLengths.setdefault(side, length)
            records.append({"angle": degrees, "pushrod": side, "lowerGapM": min((a - b).length for a in rod for b in low),
                            "upperGapM": min((a - b).length for a in rod for b in high), "lengthDeltaM": abs(length - rodLengths[side])})
        for fixed in (fin, body, objects["ElevatorLeft"], objects["ElevatorRight"], tail):
            Intersections(objects["Rudder"], fixed, angle=degrees)
        for name in ("ElevatorLeft", "ElevatorRight", "Rudder"):
            Intersections(objects[name], braces, angle=degrees)
    Pose(0)
    angles = (-25, -18, -9, 0, 9, 18, 25)
    for rudderAngle in angles:
        for elevatorAngle in angles:
            for name, degrees in (("Rudder", rudderAngle), ("ElevatorLeft", elevatorAngle), ("ElevatorRight", elevatorAngle)):
                objects[name + "Pivot"].rotation_quaternion = rest[name] @ Quaternion(axes[name], math.radians(degrees))
            bpy.context.view_layer.update()
            for name in ("ElevatorLeft", "ElevatorRight"):
                Intersections(objects["Rudder"], objects[name], rudderAngle=rudderAngle, elevatorAngle=elevatorAngle)
    for leftAngle in angles:
        for rightAngle in angles:
            for name, degrees in (("ElevatorLeft", leftAngle), ("ElevatorRight", rightAngle)):
                objects[name + "Pivot"].rotation_quaternion = rest[name] @ Quaternion(axes[name], math.radians(degrees))
            bpy.context.view_layer.update()
            Intersections(objects["ElevatorLeft"], objects["ElevatorRight"], leftElevatorAngle=leftAngle, rightElevatorAngle=rightAngle)
    Pose(0)
    issues = [row for row in records if row.get("surfaceIntersections", 0)
              or max(row.get("lowerGapM", 0), row.get("upperGapM", 0), row.get("lengthDeltaM", 0)) > .0001]
    assert len(records) == 301 and not issues, issues
    return {"source": ("Actual editable source " if editable else "Actual reimport of ") + bpy.context.scene["KawasakiAuditVariant"],
            "sha256": bpy.context.scene["ImportedGlbSha256"], "axes": axisReport, "records": records, "issues": issues}


def Main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--source-root", type=Path, default=SOURCE_DEFAULT)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    repo, source = args.repo_root.resolve(), args.source_root.resolve()
    reportRoot = repo / "tmp/KawasakiType88"
    buildVersion = re.search(r'^VERSION = "([^"]+)"', (repo / "Taierzhuang1938/_blender/Script_BuildKawasakiType88.py").read_text("utf-8"), re.M)[1]
    surface = json.loads((source / "Textures/Data_SurfaceSources.json").read_text("utf-8"))
    tailData = json.loads((repo / "Taierzhuang1938/Model/KawasakiType88/Data_KawasakiType88Tail.json").read_text("utf-8"))
    Write(reportRoot / "Data_AuditLatest.json", {"status": "running", "buildVersion": buildVersion, "surfaceVersion": surface["version"]})
    sources, imports, motionSummaries = [], [], []
    expectedBraces = None
    for variant in ("High", "Game"):
        sourceFile = source / f"Scene_KawasakiType88{variant}.blend"
        sourceSha = Sha(sourceFile.read_bytes())
        sourceRow, sourceBraces = SourceAudit(source, variant, buildVersion, surface)
        sources.append(sourceRow)
        expectedBraces = expectedBraces or sourceBraces
        # The source has authored quads; temporarily triangulate only the brace
        # carrier for the same geometric intersection audit as the export.
        import bmesh
        for name in {entry["name"] if bpy.data.objects.get(entry["name"]) else "Part_KawasakiType88Root_Steel" for entry in expectedBraces}:
            ob = bpy.data.objects[name]
            mesh = bmesh.new()
            mesh.from_mesh(ob.data)
            bmesh.ops.triangulate(mesh, faces=list(mesh.faces))
            mesh.to_mesh(ob.data)
            mesh.free()
        sourceBraceTree, _ = BraceAudit(expectedBraces)
        bpy.context.scene["KawasakiAuditVariant"] = variant + " source"
        bpy.context.scene["ImportedGlbSha256"] = sourceSha
        sourceMotion = MotionAudit(tailData, sourceBraceTree, editable=True)
        sourceRow["editableMotionChecks"] = len(sourceMotion["records"])
        sourceRow["editableMotionIssues"] = sourceMotion["issues"]
        assert Sha(sourceFile.read_bytes()) == sourceSha
        file = source / "Exports/Model_KawasakiType88High.glb" if variant == "High" else repo / "Taierzhuang1938/Model/KawasakiType88/Model_KawasakiType88.glb"
        imports.append(ImportAudit(file, sourceRow, variant, source, reportRoot, buildVersion, surface))
        braceTree, braceReport = BraceAudit(expectedBraces)
        Write(reportRoot / ("Data_BraceAudit.json" if variant == "Game" else "Data_HighBraceAudit.json"), braceReport)
        motion = MotionAudit(tailData, braceTree)
        Write(reportRoot / ("Data_ReimportMotion.json" if variant == "Game" else "Data_HighMotion.json"), motion)
        bpy.ops.wm.save_mainfile()
        motionSummaries.append({"variant": variant, "sha256": motion["sha256"], "records": len(motion["records"]), "issues": motion["issues"], "axes": len(motion["axes"])})
    assert sources[0]["triangles"] > sources[1]["triangles"]
    Write(reportRoot / "Data_SourceProjectChecks.json", sources)
    report = {"status": "passed", "buildVersion": buildVersion, "surfaceVersion": surface["version"], "sources": sources, "imports": imports, "motion": motionSummaries}
    Write(reportRoot / "Data_AuditLatest.json", report)
    print("KAWASAKI_AUDIT " + json.dumps({"buildVersion": buildVersion, "motion": motionSummaries, "imagesPackedAndCurrent": True}))


if __name__ == "__main__":
    Main()
