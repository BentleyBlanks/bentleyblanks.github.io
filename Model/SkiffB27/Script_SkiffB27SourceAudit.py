"""Cold-open source/runtime audit; run inside Blender without invoking the builder.

Checks source topology, transforms, used positions, per-corner UV deltas,
material assignment and all active packed PBR bytes. Keel source normals are
checked only when original cornerNormals were captured in the source metadata.
The original source and GLB have authored normal differences: this audit never
claims a complete source/runtime normal equivalence.
"""

import argparse
import base64
import hashlib
import importlib.util
import json
import sys
import traceback
import zlib
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

# Read the current format helper even when the MCP process has an older Pack
# module cached from a previous build. This also supports wrapped Text payloads.
packPath = Path(__file__).resolve().with_name("Script_SkiffB27Pack.py")
packSpecification = importlib.util.spec_from_file_location("SkiffB27SourceAuditPack", packPath)
packModule = importlib.util.module_from_spec(packSpecification)
packSpecification.loader.exec_module(packModule)
GLB, DecodeTemplate = packModule.GLB, packModule.DecodeTemplate


Center = np.array([.00020641088485717773, -.06716883182525635, -.14005334675312042])
Scale = .8948437418327958
Axis = np.array([[-1., 0, 0], [0, 0, 1], [0, 1, 0]])
PositionTolerance = 3e-6
UvTolerance = 3e-6
SourceNormalTolerance = 3e-4
RuntimeNormalTolerance = 3e-6


def Hash(data):
    return hashlib.sha256(data).hexdigest()


def UnpackJson(value):
    return json.loads(zlib.decompress(base64.b64decode(value)))


def RuntimePositions(obj):
    points = np.array([(obj.matrix_world @ vertex.co)[:] for vertex in obj.data.vertices])
    return (points - Center) @ Axis.T * Scale


def WidthSlope(z, stations, factors):
    """Exact adjacent-station slope, including the right-side choice at knots."""
    index = int(np.clip(np.searchsorted(stations, z, side="right") - 1,
                        0, len(stations) - 2))
    return (factors[index + 1] - factors[index]) / (stations[index + 1] - stations[index])


def WidthJacobian(point, stations, factors):
    jacobian = np.eye(3)
    jacobian[0, 0] = np.interp(point[2], stations, factors)
    jacobian[0, 2] = point[0] * WidthSlope(point[2], stations, factors)
    return jacobian


def MakeTree(points):
    tree = KDTree(len(points))
    for index, point in enumerate(points):
        tree.insert(Vector(point), index)
    tree.balance()
    return tree


def ImagesFromSocket(socket):
    images = set()
    visited = set()

    def Visit(node):
        if node in visited:
            return
        visited.add(node)
        if node.type == "TEX_IMAGE" and node.image:
            images.add(node.image)
            return
        for inputSocket in node.inputs:
            for link in inputSocket.links:
                Visit(link.from_node)

    for link in socket.links:
        Visit(link.from_node)
    return images


def TextureImageIndex(document, textureIndex):
    texture = document["textures"][textureIndex]
    webp = texture.get("extensions", {}).get("EXT_texture_webp")
    return webp["source"] if webp else texture["source"]


def Audit(sourcePath, modelPath, provenancePath):
    sourcePath, modelPath, provenancePath = map(Path, (sourcePath, modelPath, provenancePath))
    bpy.ops.wm.open_mainfile(filepath=str(sourcePath.resolve()), load_ui=False, use_scripts=False)
    metadata = UnpackJson(bpy.data.texts["Data_SkiffB27Correspondence"].as_string())
    templateBytes = DecodeTemplate(bpy.data.texts["Data_SkiffB27Template"].as_string())
    template = GLB(templateBytes)
    final = GLB.Read(modelPath)
    provenance = json.loads(provenancePath.read_text(encoding="utf-8-sig"))
    snapshot = metadata["snapshot"]
    objects = {obj.name: obj for obj in bpy.data.collections["StrandedSkiffA"].objects
               if obj.type == "MESH"}
    report = {"source": str(sourcePath.resolve()), "model": str(modelPath.resolve()),
              "sourceSha256": Hash(sourcePath.read_bytes()),
              "modelSha256": Hash(modelPath.read_bytes()),
              "templateSha256": Hash(templateBytes), "blenderVersion": bpy.app.version_string,
              "checks": [], "normalScope": "Keel source inverse-J test and Keel runtime inverse-J test only; authored source/runtime baseline normals are not asserted identical",
              "normalJacobian": "J00=interp(z,stations,factors); i=clip(searchsorted(stations,z,side=right)-1,0,n-2); J02=x*(factors[i+1]-factors[i])/(stations[i+1]-stations[i]); no gradient approximation"}

    def Check(name, passed, **details):
        report["checks"].append({"name": name, "pass": bool(passed), **details})

    Check("AssetObjectMembership", len(objects) == 302 and set(objects) == set(snapshot),
          actual=len(objects), expected=302,
          missing=sorted(set(snapshot) - set(objects)), extra=sorted(set(objects) - set(snapshot)))
    if set(objects) != set(snapshot):
        report["status"] = "FAIL"
        return report
    matrixErrors, topologyErrors, countErrors = [], [], []
    positions, usedVertices, polygonLookup = {}, {}, {}
    nativeTriangles = 0
    allSourcePoints = []
    for name, obj in objects.items():
        original = snapshot[name]
        if not np.array_equal(np.asarray(obj.matrix_world), np.asarray(original["matrix"])):
            matrixErrors.append(name)
        if [list(polygon.vertices) for polygon in obj.data.polygons] != original["polygons"]:
            topologyErrors.append(name)
        if len(obj.data.vertices) != len(original["local"]):
            countErrors.append(name)
        positions[name] = RuntimePositions(obj)
        usedVertices[name] = {int(vertex) for polygon in obj.data.polygons for vertex in polygon.vertices}
        allSourcePoints.extend(positions[name][sorted(usedVertices[name])])
        lookup = {}
        for polygon in obj.data.polygons:
            for vertex in polygon.vertices:
                lookup.setdefault(int(vertex), set()).add(polygon.index)
        polygonLookup[name] = lookup
        obj.data.calc_loop_triangles()
        nativeTriangles += len(obj.data.loop_triangles)
    Check("OriginalObjectMatrices", not matrixErrors, errors=matrixErrors)
    Check("OriginalSourcePolygonConnectivity", not topologyErrors, errors=topologyErrors)
    Check("OriginalSourceVertexCounts", not countErrors, errors=countErrors)
    Check("NativeSourceTriangleCount", nativeTriangles == 49944, actual=nativeTriangles)
    if topologyErrors or countErrors:
        report["status"] = "FAIL"
        return report
    Check("OriginalRuntimeNodeFrames", final.j["nodes"] == template.j["nodes"])
    finalPrimitives = {(mi, pi): primitive for mi, pi, _, primitive in final.Primitives()}
    originalPrimitives = {(mi, pi): primitive for mi, pi, _, primitive in template.Primitives()}
    entries = {(entry["mesh"], entry["primitive"]): entry for entry in provenance["primitives"]}
    Check("ProvenancePrimitiveCoverage", set(entries) == set(finalPrimitives)
          and len(entries) == len(provenance["primitives"]))
    if set(entries) != set(finalPrimitives):
        report["status"] = "FAIL"
        return report
    originalAttributes = {key: {semantic: template.Accessor(index)
                                for semantic, index in primitive["attributes"].items()}
                          for key, primitive in originalPrimitives.items()}
    originalTriangles = {key: template.Accessor(primitive["indices"]).reshape(-1, 3)
                         for key, primitive in originalPrimitives.items()}
    sourceTree = MakeTree(allSourcePoints)
    allFinalPoints = []
    recordPositionErrors, sourceMembershipErrors = [], []
    uvErrors, cornerUvErrors, materialErrors, triangleErrors = [], [], [], []
    oldMappedUvDifferences = []
    maximumOldMappedUvDifference = 0.0
    maximumRecordPositionError = maximumReversePositionError = 0.0
    maximumUvError = maximumCornerUvError = 0.0
    recordCount = triangleCount = endCornerCount = untexturedRecords = 0
    historicalUvRecords = set()
    sourcePolygonCache = {}
    keelRuntimeNormalErrors = []
    maximumKeelRuntimeNormalError = 0.0
    keelRuntimeNormalRecords = 0

    def SourcePolygon(originalKey, triangleIndex):
        cacheKey = (*originalKey, triangleIndex)
        if cacheKey not in sourcePolygonCache:
            originalRecords = originalTriangles[originalKey][triangleIndex]
            mapping = metadata["maps"][f"{originalKey[0]}:{originalKey[1]}"]
            mapped = [mapping[int(record)] for record in originalRecords]
            names = {row[0] for row in mapped}
            if len(names) != 1:
                raise ValueError("Original triangle has multiple source owners")
            name = mapped[0][0]
            candidates = set.intersection(*(polygonLookup[name][int(row[1])] for row in mapped))
            if not candidates:
                raise ValueError("Original triangle is absent from source polygon connectivity")
            sourcePolygonCache[cacheKey] = (name, min(candidates))
        return sourcePolygonCache[cacheKey]

    for key, primitive in finalPrimitives.items():
        entry = entries[key]
        currentPositions = final.Accessor(primitive["attributes"]["POSITION"])
        currentUv = final.Accessor(primitive["attributes"]["TEXCOORD_0"])
        currentNormals = final.Accessor(primitive["attributes"]["NORMAL"])
        faces = final.Accessor(primitive["indices"]).reshape(-1, 3)
        rows = entry["records"]
        faceOrigins = entry["triangles"]
        Check(f"Primitive{key}ProvenanceLengths", len(rows) == len(currentPositions)
              and len(faceOrigins) == len(faces), records=len(currentPositions), triangles=len(faces))
        if len(rows) != len(currentPositions) or len(faceOrigins) != len(faces):
            continue
        recordCount += len(rows)
        triangleCount += len(faces)
        allFinalPoints.extend(currentPositions)
        recordMappings = []
        actualRecordUvUses = [[] for _ in rows]
        for index, (mi, pi, ri) in enumerate(rows):
            mapping = metadata["maps"][f"{mi}:{pi}"][ri]
            name, vertexIndex, loopIndex = mapping
            recordMappings.append(mapping)
            if vertexIndex not in usedVertices[name]:
                sourceMembershipErrors.append([*key, index, name, vertexIndex])
            error = float(np.linalg.norm(currentPositions[index] - positions[name][vertexIndex]))
            maximumRecordPositionError = max(maximumRecordPositionError, error)
            if error > PositionTolerance:
                recordPositionErrors.append([*key, index, name, vertexIndex, error])
            maximumReversePositionError = max(maximumReversePositionError,
                                               sourceTree.find(Vector(currentPositions[index]))[2])
            originalUv = originalAttributes[(mi, pi)]["TEXCOORD_0"][ri].astype(float)
            if loopIndex >= 0:
                u, v = objects[name].data.uv_layers.active.data[loopIndex].uv
                oldU, oldV = snapshot[name]["uv"][loopIndex]
                # Preserve the authored template/source offset, including its
                # historical 512 records. No fixed UV scale is assumed here.
                expectedUv = originalUv + np.array([u - oldU, oldV - v])
                if np.linalg.norm(originalUv - [oldU, 1 - oldV]) > 1e-5:
                    historicalUvRecords.add((mi, pi, ri))
            else:
                expectedUv = originalUv
                untexturedRecords += 1
            # End faces are checked against their actual polygon loop below.
            if primitive["material"] != 3:
                error = float(np.linalg.norm(currentUv[index] - expectedUv))
                maximumOldMappedUvDifference = max(maximumOldMappedUvDifference, error)
                if error > UvTolerance:
                    oldMappedUvDifferences.append([*key, index, name, loopIndex, error])
            if name == "KeelSole":
                keel = metadata["keel"]
                # The runtime deformation acts on the authored float32 GLB
                # record. At a station boundary its segment can differ from
                # the higher-precision source snapshot; use that actual input.
                point = originalAttributes[(mi, pi)]["POSITION"][ri]
                jacobian = WidthJacobian(point, keel["stations"], keel["factors"])
                normal = np.linalg.inv(jacobian).T @ originalAttributes[(mi, pi)]["NORMAL"][ri]
                normal /= np.linalg.norm(normal)
                error = float(np.linalg.norm(currentNormals[index] - normal))
                maximumKeelRuntimeNormalError = max(maximumKeelRuntimeNormalError, error)
                keelRuntimeNormalRecords += 1
                if error > RuntimeNormalTolerance:
                    keelRuntimeNormalErrors.append([*key, index, error])

        for faceIndex, (face, origin) in enumerate(zip(faces, faceOrigins)):
            mi, pi, ti = map(int, origin)
            name, polygonIndex = SourcePolygon((mi, pi), ti)
            obj = objects[name]
            polygon = obj.data.polygons[polygonIndex]
            actualOriginalCorners = np.asarray([rows[int(record)] for record in face])
            expectedOriginalCorners = originalTriangles[(mi, pi)][ti]
            if not (np.all(actualOriginalCorners[:, :2] == [mi, pi])
                    and any(np.array_equal(actualOriginalCorners[:, 2], np.roll(expectedOriginalCorners, shift))
                            for shift in range(3))):
                triangleErrors.append([*key, faceIndex])
            sourceMaterial = obj.data.materials[polygon.material_index]
            expectedMaterial = final.j["materials"][primitive["material"]]["name"]
            if sourceMaterial is None or sourceMaterial.name != expectedMaterial:
                materialErrors.append([*key, faceIndex, name, polygonIndex,
                                       sourceMaterial.name if sourceMaterial else None, expectedMaterial])
            isEnd = polygonIndex in metadata["endPolygons"].get(name, [])
            for record in face:
                record = int(record)
                owner, vertexIndex, _ = recordMappings[record]
                if owner != name:
                    raise ValueError("Final triangle corner has the wrong source object")
                loops = [loopIndex for loopIndex in polygon.loop_indices
                         if obj.data.loops[loopIndex].vertex_index == vertexIndex]
                if not loops:
                    raise ValueError("Final triangle corner has no matching source polygon loop")
                loopIndex = loops[0]
                if obj.data.uv_layers.active:
                    u, v = obj.data.uv_layers.active.data[loopIndex].uv
                    omi, opi, ori = rows[record]
                    if isEnd:
                        expectedUv = np.array([u, 1 - v])
                        endCornerCount += 1
                    else:
                        oldU, oldV = snapshot[name]["uv"][loopIndex]
                        expectedUv = originalAttributes[(omi, opi)]["TEXCOORD_0"][ori].astype(float)
                        expectedUv += [u - oldU, oldV - v]
                        actualRecordUvUses[record].append((name, loopIndex, expectedUv.copy()))
                    error = float(np.linalg.norm(currentUv[record] - expectedUv))
                    maximumCornerUvError = max(maximumCornerUvError, error)
                    if error > UvTolerance:
                        cornerUvErrors.append([*key, faceIndex, record, name, loopIndex, isEnd, error])

        if primitive["material"] != 3:
            for record, mapping in enumerate(recordMappings):
                name, _, _ = mapping
                uses = actualRecordUvUses[record]
                if not objects[name].data.uv_layers.active:
                    omi, opi, ori = rows[record]
                    uses = [(name, -1, originalAttributes[(omi, opi)]["TEXCOORD_0"][ori])]
                if not uses:
                    uvErrors.append([*key, record, name, "No actual source polygon-loop use"])
                    continue
                # A shared final record must satisfy every actual source loop
                # that uses it, rather than a nearest-UV loop guessed before
                # end-face reprojection. Keep the same per-corner tolerance.
                for owner, loopIndex, expectedUv in uses:
                    error = float(np.linalg.norm(currentUv[record] - expectedUv))
                    maximumUvError = max(maximumUvError, error)
                    if error > UvTolerance:
                        uvErrors.append([*key, record, owner, loopIndex, error])

    finalTree = MakeTree(allFinalPoints)
    maximumSourcePositionError = max(finalTree.find(Vector(point))[2] for point in allSourcePoints)
    Check("UsedSourceVerticesToRuntime", maximumSourcePositionError <= PositionTolerance,
          vertices=len(allSourcePoints), maximumErrorM=maximumSourcePositionError, toleranceM=PositionTolerance)
    Check("RuntimeToUsedSourceVertices", maximumReversePositionError <= PositionTolerance,
          records=recordCount, maximumErrorM=maximumReversePositionError, toleranceM=PositionTolerance)
    Check("EveryRuntimeRecordMatchesItsSourceOwner", not recordPositionErrors and not sourceMembershipErrors,
          maximumErrorM=maximumRecordPositionError, positionErrorCount=len(recordPositionErrors),
          errors=recordPositionErrors[:30], unusedSourceOwnerErrors=sourceMembershipErrors[:30])
    Check("OriginalAuthoredTriangleCorners", not triangleErrors, errorCount=len(triangleErrors), errors=triangleErrors[:30])
    Check("EveryTriangleSourceMaterial", not materialErrors, errorCount=len(materialErrors), errors=materialErrors[:30])
    Check("NonEndUvBaselinePlusActualSourcePolygonLoopDelta", not uvErrors,
          maximumError=maximumUvError, errorCount=len(uvErrors), errors=uvErrors[:30],
          inheritedAbsoluteUvMismatchRecords=len(historicalUvRecords), untexturedRecords=untexturedRecords,
          tolerance=UvTolerance, scope="Each final record satisfies every actual source polygon loop using it")
    report["nonGatingDiagnostic"] = {
        "OldNearestUvMappedLoopDelta": {
            "differenceCount": len(oldMappedUvDifferences),
            "maximumDifference": maximumOldMappedUvDifference,
            "examples": oldMappedUvDifferences[:30],
            "reason": "Original maps store a nearest-UV loop, which may belong to another source face after end-face reprojection. Actual final-triangle polygon loops are the authoritative record and corner checks."}}
    Check("EveryTexturedCornerActualSourcePolygonUvDelta", not cornerUvErrors,
          maximumError=maximumCornerUvError, endCornersChecked=endCornerCount,
          errorCount=len(cornerUvErrors), errors=cornerUvErrors[:30],
          scope="End corners equal current source loop UV; side corners preserve the original GLB/source UV offset")
    Check("FinalTriangleCount", triangleCount == 49944, actual=triangleCount)
    Check("KeelRuntimeNormalsOneInverseJacobian", not keelRuntimeNormalErrors and keelRuntimeNormalRecords > 0,
          records=keelRuntimeNormalRecords, maximumVectorError=maximumKeelRuntimeNormalError,
          tolerance=RuntimeNormalTolerance, errors=keelRuntimeNormalErrors[:30])

    baselineNormals = snapshot["KeelSole"].get("cornerNormals")
    if baselineNormals is None:
        Check("KeelSourceNormalsBaselineAvailable", False,
              reason="snapshot.KeelSole.cornerNormals is missing; source one-transform claim is unverified")
    else:
        obj = objects["KeelSole"]
        actualNormals = np.array([normal.vector[:] for normal in obj.data.corner_normals])
        expectedNormals = []
        world = np.asarray(obj.matrix_world.to_3x3())
        keel = metadata["keel"]
        if len(baselineNormals) != len(obj.data.loops):
            Check("KeelSourceNormalsBaselineCount", False, expected=len(obj.data.loops), actual=len(baselineNormals))
        else:
            for loop, normal in zip(obj.data.loops, baselineNormals):
                point = snapshot["KeelSole"]["runtime"][loop.vertex_index]
                jacobian = WidthJacobian(point, keel["stations"], keel["factors"])
                localJacobian = np.linalg.inv(world) @ Axis.T @ jacobian @ Axis @ world
                expected = np.linalg.inv(localJacobian).T @ np.asarray(normal)
                expectedNormals.append(expected / np.linalg.norm(expected))
            errors = np.linalg.norm(actualNormals - np.asarray(expectedNormals), axis=1)
            maximum = float(errors.max())
            Check("KeelSourceNormalsOneInverseJacobian", maximum <= SourceNormalTolerance,
                  loops=len(expectedNormals), maximumVectorError=maximum,
                  tolerance=SourceNormalTolerance,
                  scope="Source custom-normal storage quantization allowed; no second deformation transform")

    activeMaterials = {obj.data.materials[polygon.material_index]
                       for obj in objects.values() for polygon in obj.data.polygons}
    activeMaterials.discard(None)
    activeNodeImages = {node.image for material in activeMaterials if material.use_nodes
                        for node in material.node_tree.nodes if node.type == "TEX_IMAGE" and node.image}
    Check("FourActiveSourceMaterials", len(activeMaterials) == 4,
          materials=sorted(material.name for material in activeMaterials))
    Check("NineActivePackedSourceImages", len(activeNodeImages) == 9
          and all(image.packed_file for image in activeNodeImages),
          images=sorted(image.name for image in activeNodeImages),
          unpacked=sorted(image.name for image in activeNodeImages if not image.packed_file))
    bindings = []
    boundSourceImages = set()
    for materialIndex, runtimeMaterial in enumerate(final.j["materials"]):
        sourceMaterial = bpy.data.materials.get(runtimeMaterial["name"])
        if sourceMaterial is None or not sourceMaterial.use_nodes:
            Check(f"Material{materialIndex}SourceExists", False)
            continue
        shader = next((node for node in sourceMaterial.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        if shader is None:
            Check(f"Material{materialIndex}PrincipledExists", False)
            continue
        pbr = runtimeMaterial.get("pbrMetallicRoughness", {})
        for socketName, factorName in (("Roughness", "roughnessFactor"),
                                       ("Metallic", "metallicFactor")):
            socket = shader.inputs[socketName]
            if not socket.is_linked and "metallicRoughnessTexture" not in pbr:
                sourceValue = float(socket.default_value)
                runtimeValue = float(pbr.get(factorName, 1.0))
                Check(f"Material{materialIndex}{socketName}Scalar",
                      abs(sourceValue - runtimeValue) <= 2e-6,
                      source=sourceValue, runtime=runtimeValue)
        if "normalTexture" in runtimeMaterial:
            normalMaps = [node for node in sourceMaterial.node_tree.nodes
                          if node.type == "NORMAL_MAP"]
            if len(normalMaps) == 1 and not normalMaps[0].inputs["Strength"].is_linked:
                sourceValue = float(normalMaps[0].inputs["Strength"].default_value)
                runtimeValue = float(runtimeMaterial["normalTexture"].get("scale", 1.0))
                Check(f"Material{materialIndex}NormalStrengthScalar",
                      abs(sourceValue - runtimeValue) <= 2e-6,
                      source=sourceValue, runtime=runtimeValue)
        for role, definition in (("Base", pbr.get("baseColorTexture")),
                                 ("Normal", runtimeMaterial.get("normalTexture")),
                                 ("Orm", pbr.get("metallicRoughnessTexture"))):
            if definition is None:
                continue
            if role == "Base":
                images = ImagesFromSocket(shader.inputs["Base Color"])
            elif role == "Normal":
                images = ImagesFromSocket(shader.inputs["Normal"])
            else:
                images = ImagesFromSocket(shader.inputs["Roughness"]) | ImagesFromSocket(shader.inputs["Metallic"])
            Check(f"Material{materialIndex}{role}SingleConnectedImage", len(images) == 1,
                  images=sorted(image.name for image in images))
            if len(images) != 1:
                continue
            image = next(iter(images))
            boundSourceImages.add(image)
            imageIndex = TextureImageIndex(final.j, definition["index"])
            runtimeBytes = final.ImageBytes(imageIndex)
            sourceBytes = bytes(image.packed_file.data) if image.packed_file else b""
            size = [1024, 1024] if role == "Base" else [512, 512]
            colorspace = "sRGB" if role == "Base" else "Non-Color"
            passed = bool(sourceBytes) and sourceBytes == runtimeBytes
            Check(f"Material{materialIndex}{role}PackedBinding", passed,
                  sourceImage=image.name, runtimeImage=imageIndex,
                  sourceSha256=Hash(sourceBytes), runtimeSha256=Hash(runtimeBytes))
            Check(f"Material{materialIndex}{role}ImageContract",
                  list(image.size) == size and image.colorspace_settings.name == colorspace,
                  size=list(image.size), colorspace=image.colorspace_settings.name)
            bindings.append({"material": runtimeMaterial["name"], "role": role,
                             "sourceImage": image.name, "runtimeImage": imageIndex,
                             "packedBytes": len(sourceBytes), "bytesEqual": passed,
                             "requiresExternalFile": not bool(image.packed_file)})
        occlusion = runtimeMaterial.get("occlusionTexture")
        metallicRoughness = pbr.get("metallicRoughnessTexture")
        if occlusion and metallicRoughness:
            Check(f"Material{materialIndex}OcclusionSharesOrmImage",
                  TextureImageIndex(final.j, occlusion["index"])
                  == TextureImageIndex(final.j, metallicRoughness["index"]))
    Check("NineSourceImagesBoundByRuntimeRole", len(bindings) == 9
          and boundSourceImages == activeNodeImages, bindings=len(bindings))
    Check("StandaloneRuntimeImages", len(final.j.get("images", [])) == 9
          and all("bufferView" in image and "uri" not in image for image in final.j["images"]))
    report["pbrBindings"] = bindings
    report["coldSourceEvidence"] = "Saved source cold-opened with use_scripts=False. Every active PBR role has embedded packed bytes identical to its embedded GLB image; no missing external PBR payload is required. External files were not renamed or edited."
    report["status"] = "PASS" if all(check["pass"] for check in report["checks"]) else "FAIL"
    return report


def Main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--provenance", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        report = Audit(args.source, args.model, args.provenance)
    except Exception:
        report = {"status": "FAIL", "source": str(args.source), "model": str(args.model),
                  "fatal": traceback.format_exc(), "checks": []}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    failed = [check["name"] for check in report["checks"] if not check["pass"]]
    print(json.dumps({"status": report["status"], "checks": len(report["checks"]),
                      "failed": failed, "report": str(args.report)}, ensure_ascii=False))
    if report["status"] != "PASS":
        raise RuntimeError("Cold source audit failed: " + (", ".join(failed) or report.get("fatal", "Unknown error")))
    return report


if __name__ == "__main__":
    Main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
