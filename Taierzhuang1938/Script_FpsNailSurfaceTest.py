"""Pure-CPU nail surface clearance check for the HanYang hand repair.

This test reads a candidate GLB and never imports Blender or writes an asset.
The top surface of every nail triangle is sampled at its three vertices, three
edge midpoints and centroid.  Skin rays use the same distal-bone frame and
actual dorsal skin triangles as ``Script_FpsHandNailsBake.py``.  A negative
clearance is a surface penetration; an excessively large clearance flags a
surface that is likely floating above the finger.

Usage from the repository root::

    python Taierzhuang1938/Script_FpsNailSurfaceTest.py \
      --asset <temporary-candidate>/Model_FpsHanYangHandsRepaired.glb \
      --report <temporary-candidate>/Data_FpsNailSurfaceTest.json

For a nail-only candidate, pass ``--nails-only --baseline``.  That mode checks
the actual rendered nail node, one visible mesh, 100% distal-DIP weights,
absence of nail morph targets, unchanged body payload hashes and a minimum
clearance of 0.08 mm.

The default asset is the checked-in repaired model, which is useful as a
historical/baseline diagnostic.  A newly baked candidate should be checked
with the default expected 10x40/.34 mm parameters before any asset handoff.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path

import numpy as np


sys.dont_write_bytecode = True
PROJECT = Path(__file__).resolve().parent
CODEC_PATH = PROJECT / "_blender" / "Script_FpsGripCorrectiveCodec.py"
FROZEN_NAIL_BASIS_SHA256 = "dffb45e2edc89050feefed0a49230175eb17e42a96b46fcdfaff872187d01a38"
CODEC_SPEC = importlib.util.spec_from_file_location("FpsNailSurfaceCodec", CODEC_PATH)
assert CODEC_SPEC and CODEC_SPEC.loader
CODEC = importlib.util.module_from_spec(CODEC_SPEC)
CODEC_SPEC.loader.exec_module(CODEC)


def Normalize(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def NodeMatrix(node: dict) -> np.ndarray:
    if "matrix" in node:
        return np.asarray(node["matrix"], dtype=np.float64).reshape(4, 4, order="F")
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    xx, yy, zz = x * x, y * y, z * z
    xy, xz, yz = x * y, x * z, y * z
    wx, wy, wz = w * x, w * y, w * z
    rotation = np.array([
        [1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy)],
        [2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx)],
        [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy)],
    ], dtype=np.float64)
    scale = np.asarray(node.get("scale", [1, 1, 1]), dtype=np.float64)
    result = np.eye(4, dtype=np.float64)
    result[:3, :3] = rotation @ np.diag(scale)
    result[:3, 3] = np.asarray(node.get("translation", [0, 0, 0]), dtype=np.float64)
    return result


def WorldMatrices(document: dict) -> np.ndarray:
    parents = {child: parent for parent, node in enumerate(document["nodes"])
               for child in node.get("children", [])}
    cache: dict[int, np.ndarray] = {}

    def World(index: int) -> np.ndarray:
        if index not in cache:
            local = NodeMatrix(document["nodes"][index])
            cache[index] = World(parents[index]) @ local if index in parents else local
        return cache[index]

    return np.asarray([World(index) for index in range(len(document["nodes"]))])


def RestPositions(points: np.ndarray, frame: np.ndarray) -> np.ndarray:
    return (frame @ np.c_[points, np.ones(len(points))].T).T[:, :3]


def LocalPositions(points: np.ndarray, joint_world: np.ndarray, basis: np.ndarray) -> np.ndarray:
    local = (np.linalg.inv(joint_world) @ np.c_[points, np.ones(len(points))].T).T[:, :3]
    return local @ basis


def NailBasis(entry: dict) -> np.ndarray:
    longitudinal = np.asarray(entry["longitudinalBoneLocal"], dtype=np.float64)
    palmar = -np.asarray(entry["dorsalBoneLocal"], dtype=np.float64)
    longitudinal /= np.linalg.norm(longitudinal)
    palmar -= longitudinal * np.dot(longitudinal, palmar)
    palmar /= np.linalg.norm(palmar)
    return np.column_stack((longitudinal, palmar, np.cross(longitudinal, palmar)))


def RayY(x: float, z: float, vertices: np.ndarray, triangles: np.ndarray) -> float | None:
    a, b, c = (vertices[triangles[:, i]] for i in range(3))
    u, v = b - a, c - a
    determinant = u[:, 0] * v[:, 2] - u[:, 2] * v[:, 0]
    valid = np.abs(determinant) > 1e-12
    denominator = np.where(valid, determinant, 1)
    qx, qz = x - a[:, 0], z - a[:, 2]
    s = (qx * v[:, 2] - qz * v[:, 0]) / denominator
    t = (u[:, 0] * qz - u[:, 2] * qx) / denominator
    valid &= (s >= -1e-7) & (t >= -1e-7) & (s + t <= 1 + 1e-7)
    if not valid.any():
        return None
    return float((a[:, 1] + s * u[:, 1] + t * v[:, 1])[valid].min())


def TriangleSamples(triangle: np.ndarray) -> np.ndarray:
    a, b, c = triangle
    return np.asarray([a, b, c, (a + b) * .5, (b + c) * .5, (c + a) * .5,
                       (a + b + c) / 3], dtype=np.float64)


def FindNailRender(document: dict) -> tuple[int, int, dict, dict, int]:
    nodes = [(index, node) for index, node in enumerate(document.get("nodes", []))
             if node.get("name") == "Mesh_HanYangNailPlates" and node.get("mesh") is not None]
    if len(nodes) != 1:
        raise AssertionError(f"expected exactly one visible Mesh_HanYangNailPlates node, found {nodes}")
    node_index, node = nodes[0]
    mesh_index = int(node["mesh"])
    meshes = [(index, mesh) for index, mesh in enumerate(document.get("meshes", []))
              if mesh.get("name") == "Mesh_HanYangNailPlates"]
    if len(meshes) != 1 or meshes[0][0] != mesh_index:
        raise AssertionError(f"nail node must target the only nail mesh, node={mesh_index} meshes={meshes}")
    mesh = document["meshes"][mesh_index]
    if len(mesh.get("primitives", [])) != 1:
        raise AssertionError("nail mesh must contain one primitive")
    primitive = mesh["primitives"][0]
    material_index = primitive.get("material")
    return node_index, mesh_index, mesh, primitive, int(material_index) if material_index is not None else -1


def BodySnapshot(document: dict, binary: bytearray, *, accessors_limit: int | None = None,
                 buffer_views_limit: int | None = None, excluded_accessors: set[int] | None = None) -> dict:
    _, nail_mesh_index, _nail_mesh, nail_primitive, nail_material_index = FindNailRender(document)
    excluded = set(excluded_accessors or set())
    accessors_limit = len(document.get("accessors", [])) if accessors_limit is None else accessors_limit
    buffer_views_limit = len(document.get("bufferViews", [])) if buffer_views_limit is None else buffer_views_limit
    body_accessors = [index for index in range(accessors_limit) if index not in excluded]
    nail_views = {int(document["accessors"][index]["bufferView"]) for index in excluded
                  if 0 <= index < accessors_limit and "bufferView" in document["accessors"][index]
                  and int(document["accessors"][index]["bufferView"]) < buffer_views_limit}
    body_views = [index for index in range(buffer_views_limit) if index not in nail_views]
    descriptor = copy.deepcopy(document)
    descriptor.pop("buffers", None)
    descriptor.pop("accessors", None)
    descriptor.pop("bufferViews", None)
    descriptor["meshes"][nail_mesh_index] = {"name": "__nail_mesh_excluded__"}
    if 0 <= nail_material_index < len(descriptor.get("materials", [])):
        descriptor["materials"][nail_material_index] = {"name": "__nail_material_excluded__"}
    descriptor.setdefault("asset", {}).setdefault("extras", {}).pop("nailSurfaceRepair", None)
    body_view_rows = []
    for view_index in body_views:
        view = document["bufferViews"][view_index]
        start = int(view.get("byteOffset", 0)); end = start + int(view["byteLength"])
        body_view_rows.append({"index": view_index, "descriptor": copy.deepcopy(view),
                               "sha256": hashlib.sha256(bytes(binary[start:end])).hexdigest()})
    accessor_rows = [{"index": index, "descriptor": copy.deepcopy(document["accessors"][index])} for index in body_accessors]
    return {
        "descriptorSha256": hashlib.sha256(json.dumps(descriptor, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
        "payloadSha256": hashlib.sha256(json.dumps({"accessors": accessor_rows, "views": body_view_rows}, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
        "accessors": accessor_rows,
        "views": body_view_rows,
    }


def Load(asset: Path) -> tuple[dict, bytearray, dict, dict, np.ndarray, np.ndarray, np.ndarray, int, int, dict, dict, int]:
    document, binary, raw = CODEC.ReadGlb(asset)
    skin = CODEC.SkinPrimitive(document, binary)
    nail_node_index, nail_mesh_index, nail_mesh, nail_primitive, nail_material_index = FindNailRender(document)
    nail_attrs = {name: CODEC.Accessor(document, binary, accessor)
                  for name, accessor in nail_primitive["attributes"].items()}
    nail_triangles = CODEC.Accessor(document, binary, nail_primitive["indices"]).astype(np.int64).reshape(-1, 3)
    skin_node_index = next(index for index, node in enumerate(document["nodes"])
                           if node.get("mesh") == skin["meshIndex"] and "skin" in node)
    skin_node = document["nodes"][skin_node_index]
    joints = document["skins"][skin_node["skin"]]["joints"]
    inverse_bind = CODEC.Accessor(document, binary,
                                  document["skins"][skin_node["skin"]]["inverseBindMatrices"])
    inverse_bind = inverse_bind.reshape(-1, 4, 4).transpose(0, 2, 1)
    world = WorldMatrices(document)
    frames = world[joints] @ inverse_bind
    frame = frames.mean(axis=0)
    if np.max(np.abs(frames - frame)) >= 2e-5:
        raise AssertionError("skin joints do not share one bind frame")
    skin_rest = RestPositions(skin["attributes"]["POSITION"], frame)
    nail_rest = RestPositions(nail_attrs["POSITION"], frame)
    return document, binary, raw, skin, nail_attrs, nail_triangles, (joints, world, frame, skin_rest, nail_rest), nail_node_index, nail_mesh_index, nail_mesh, nail_primitive, nail_material_index


def Check(asset: Path, minimum_clearance_mm: float, maximum_clearance_mm: float,
          expected_rings: int | None, expected_segments: int | None,
          expected_offset_mm: float | None, baseline: Path | None = None,
          nails_only: bool = False) -> dict:
    document, binary, raw, skin, nail_attrs, nail_triangles, context, nail_node_index, nail_mesh_index, nail_mesh, nail_primitive, nail_material_index = Load(asset)
    joints, world, _frame, skin_rest, nail_rest = context
    names = [document["nodes"][index]["name"] for index in joints]
    skin_triangles = CODEC.Accessor(document, binary, skin["primitive"]["indices"]).astype(np.int64).reshape(-1, 3)
    masses_by_joint = {
        joint: np.where(skin["attributes"]["JOINTS_0"] == joint,
                        skin["attributes"]["WEIGHTS_0"], 0).sum(axis=1)
        for joint in range(len(joints))
    }
    # JOINTS_0 stores skin-local joint slots, not document node indexes.
    joint_world = world[joints]
    joint_names = [Normalize(name) for name in names]
    joint_slot_by_name = {name: index for index, name in enumerate(joint_names)}
    extras = document.get("asset", {}).get("extras", {})
    metadata = extras.get("handSurfaceRepair", {})
    nail_metadata = extras.get("nailSurfaceRepair", {})
    entries = nail_metadata.get("nails", []) if nails_only else metadata.get("nails", [])
    failures: list[str] = []
    body_snapshot = None
    if nails_only:
        if nail_metadata.get("mode") != "nailsOnly":
            failures.append(f"nailSurfaceRepair mode {nail_metadata.get('mode')!r} != 'nailsOnly'")
        if len(entries) != 10:
            failures.append(f"nailSurfaceRepair nail metadata count {len(entries)} != 10")
        if len(joints) != 53 or document["materials"][skin["primitive"].get("material", -1)].get("name") != "Material_HanYangScanSkin" or metadata.get("weapon") != "HanYang":
            failures.append("nails-only input is not the expected HanYang 53-joint hand")
    elif metadata.get("basisSha256") != FROZEN_NAIL_BASIS_SHA256:
        failures.append(f"basisSha256 {metadata.get('basisSha256')!r} != frozen {FROZEN_NAIL_BASIS_SHA256}")
    if len(entries) != 10:
        failures.append(f"nail metadata count {len(entries)} != 10")
    report_nails = []
    if nails_only:
        if baseline is None:
            failures.append("nails-only check needs --baseline for body-payload comparison")
        else:
            base_doc, base_binary, base_raw, _base_skin, _base_attrs, _base_triangles, _base_context, _base_node, _base_mesh_index, _base_mesh, _base_primitive, _base_material = Load(baseline)
            base_nail_accessors = set(_base_primitive.get("attributes", {}).values()) | ({_base_primitive["indices"]} if "indices" in _base_primitive else set())
            base_snapshot = BodySnapshot(base_doc, base_binary, excluded_accessors=base_nail_accessors)
            candidate_snapshot = BodySnapshot(document, binary, accessors_limit=len(base_doc.get("accessors", [])), buffer_views_limit=len(base_doc.get("bufferViews", [])), excluded_accessors=base_nail_accessors)
            body_snapshot = {"equal": candidate_snapshot == base_snapshot,
                             "baselineDescriptorSha256": base_snapshot["descriptorSha256"],
                             "candidateDescriptorSha256": candidate_snapshot["descriptorSha256"],
                             "baselinePayloadSha256": base_snapshot["payloadSha256"],
                             "candidatePayloadSha256": candidate_snapshot["payloadSha256"],
                             "baselineAccessorCount": len(base_snapshot["accessors"]),
                             "candidateAccessorCount": len(candidate_snapshot["accessors"]),
                             "baselineViewCount": len(base_snapshot["views"]),
                             "candidateViewCount": len(candidate_snapshot["views"])}
            if candidate_snapshot != base_snapshot:
                failures.append("body payload snapshot differs from --baseline")
            if base_doc.get("asset", {}).get("extras", {}).get("handSurfaceRepair") != metadata:
                failures.append("handSurfaceRepair metadata differs from --baseline")
            if nail_metadata.get("inputSha256") != hashlib.sha256(base_raw).hexdigest():
                failures.append("nailSurfaceRepair inputSha256 differs from --baseline")
        if nail_mesh.get("name") != "Mesh_HanYangNailPlates" or len([m for m in document.get("meshes", []) if m.get("name") == "Mesh_HanYangNailPlates"]) != 1:
            failures.append("nails-only output must contain exactly one actual nail mesh")
        if nail_primitive.get("targets") or nail_mesh.get("weights"):
            failures.append("nails-only nail mesh must not carry morph targets/weights")
        if document["nodes"][nail_node_index].get("weights"):
            failures.append("nails-only nail node must not carry morph weights")
        for body_mesh in document.get("meshes", []):
            target_names = body_mesh.get("extras", {}).get("targetNames", [])
            if target_names and any(name.startswith("Grip_") for name in target_names):
                if any(abs(float(weight)) > 1e-12 for weight in body_mesh.get("weights", [])):
                    failures.append(f"HanYang weapon morph weights are nonzero on {body_mesh.get('name')}")
        if document["materials"][nail_material_index].get("name") != "Material_HanYangScanSkin_Nails":
            failures.append("nails-only nail node must use the nail material")
        visible_nail_material_nodes = []
        for node_index, node in enumerate(document.get("nodes", [])):
            mesh_index = node.get("mesh")
            if mesh_index is None or mesh_index >= len(document.get("meshes", [])):
                continue
            if any(primitive.get("material") == nail_material_index for primitive in document["meshes"][mesh_index].get("primitives", [])):
                visible_nail_material_nodes.append(node_index)
        if visible_nail_material_nodes != [nail_node_index]:
            failures.append(f"nails-only visible nail-material nodes {visible_nail_material_nodes} != [{nail_node_index}]")
    for entry in entries:
        side, digit = entry["side"], int(entry["digit"])
        bone_name = Normalize(entry["bone"])
        if bone_name not in joint_slot_by_name:
            failures.append(f"{side}{digit}: missing nail bone {entry['bone']}")
            continue
        joint = joint_slot_by_name[bone_name]
        base, count = map(int, entry["vertices"])
        if count % 2 or base < 0 or base + count > len(nail_rest):
            failures.append(f"{side}{digit}: invalid vertex range {entry['vertices']}")
            continue
        if nails_only:
            nail_joint_ids = nail_attrs["JOINTS_0"][base:base + count]
            nail_weights = nail_attrs["WEIGHTS_0"][base:base + count]
            if not np.all(nail_joint_ids[:, 0] == joint) or np.any(nail_joint_ids[:, 1:] != 0) or not np.allclose(nail_weights[:, 0], 1, atol=0, rtol=0) or np.any(nail_weights[:, 1:] != 0):
                failures.append(f"{side}{digit}: nail weights are not 100% on distal DIP {entry['bone']}")
            if abs(float(entry.get("targetMinimumClearanceMm", -1)) - minimum_clearance_mm) > 1e-6:
                failures.append(f"{side}{digit}: targetMinimumClearanceMm metadata mismatch")
            if float(entry.get("adaptiveLiftMaxMm", 0)) > .20 + 1e-6:
                failures.append(f"{side}{digit}: adaptive lift exceeds 0.20 mm")
        top_count = count // 2
        top_end = base + top_count
        top_triangles = nail_triangles[np.all((nail_triangles >= base) & (nail_triangles < top_end), axis=1)]
        if len(top_triangles) == 0:
            failures.append(f"{side}{digit}: no top triangles")
            continue
        basis = NailBasis(entry)
        nail_local = LocalPositions(nail_rest[base:base + count], joint_world[joint], basis)
        skin_local = LocalPositions(skin_rest, joint_world[joint], basis)
        mass = masses_by_joint[joint]
        selected = np.all(mass[skin_triangles] > .65, axis=1)
        surface_triangles = skin_triangles[selected]
        if len(surface_triangles) <= 50:
            failures.append(f"{side}{digit}: only {len(surface_triangles)} distal skin triangles")
            continue
        mm = 1 / (np.linalg.norm(joint_world[joint][:3, 0]) * .7 * 1000)
        gaps = []
        missing = 0
        for triangle in top_triangles:
            local_ids = triangle - base
            samples = TriangleSamples(nail_local[local_ids])
            for sample in samples:
                surface_y = RayY(float(sample[0]), float(sample[2]), skin_local, surface_triangles)
                if surface_y is None:
                    missing += 1
                else:
                    gaps.append((surface_y - sample[1]) / mm)
        min_gap = min(gaps) if gaps else float("nan")
        max_gap = max(gaps) if gaps else float("nan")
        expected_samples = len(top_triangles) * 7
        if len(gaps) + missing != expected_samples:
            failures.append(f"{side}{digit}: sampled {len(gaps) + missing} points, expected {expected_samples}")
        negative = sum(gap < minimum_clearance_mm - 1e-4 for gap in gaps)
        over = sum(gap > maximum_clearance_mm + 1e-4 for gap in gaps)
        expected = {
            "radialRings": expected_rings,
            "circumferentialSegments": expected_segments,
            "surfaceOffsetMm": expected_offset_mm,
        }
        config_failures = []
        for key, expected_value in expected.items():
            if expected_value is None:
                continue
            value = entry.get(key)
            if value is None or abs(float(value) - float(expected_value)) > 1e-6:
                config_failures.append(f"{key}={value!r} expected {expected_value}")
        if config_failures:
            failures.append(f"{side}{digit}: " + ", ".join(config_failures))
        if missing:
            failures.append(f"{side}{digit}: {missing} samples missed the distal skin ray")
        if negative:
            failures.append(f"{side}{digit}: {negative} samples penetrate skin (min {min_gap:.4f} mm)")
        if over:
            failures.append(f"{side}{digit}: {over} samples float over {maximum_clearance_mm:.3f} mm (max {max_gap:.4f} mm)")
        report_nails.append({
            "side": side, "digit": digit, "bone": entry["bone"],
            "skinTriangles": int(len(surface_triangles)),
            "topTriangles": int(len(top_triangles)),
            "sampleCount": int(len(gaps) + missing), "missingRays": int(missing),
            "penetratingSamples": int(negative), "overClearanceSamples": int(over),
            "minimumClearanceMm": float(min_gap), "maximumClearanceMm": float(max_gap),
            "medianClearanceMm": float(np.median(gaps)) if gaps else float("nan"),
            "metadataSurfaceOffsetMm": entry.get("surfaceOffsetMm"),
            "metadataRadialRings": entry.get("radialRings"),
            "metadataCircumferentialSegments": entry.get("circumferentialSegments"),
        })
    result = {
        "asset": str(asset.resolve()),
        "assetSha256": hashlib.sha256(raw).hexdigest(),
        "mode": "nailsOnly" if nails_only else "fullRebuild",
        "basisSha256": nail_metadata.get("inputSha256") if nails_only else metadata.get("basisSha256"),
        "baseline": str(baseline.resolve()) if baseline else None,
        "bodySnapshot": body_snapshot,
        "method": "Bind-frame CPU ray test; 7 samples per nail top triangle (vertices, edge midpoints, centroid)",
        "thresholds": {"minimumClearanceMm": minimum_clearance_mm, "maximumClearanceMm": maximum_clearance_mm},
        "expected": {"radialRings": expected_rings, "circumferentialSegments": expected_segments,
                     "surfaceOffsetMm": expected_offset_mm},
        "nails": report_nails,
        "failures": failures,
        "passed": not failures,
    }
    return result


def Main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset", default=str(PROJECT / "Model" / "Model_FpsHanYangHandsRepaired.glb"), type=Path)
    parser.add_argument("--baseline", default=str(PROJECT / "Model" / "Model_FpsHanYangHandsRepaired.glb"), type=Path,
                        help="baseline GLB for nails-only body-payload comparison")
    parser.add_argument("--report", type=Path, help="optional JSON report path; no file is written by default")
    parser.add_argument("--nails-only", action="store_true", help="validate the in-place nail-only repair contract")
    parser.add_argument("--min-clearance-mm", type=float, default=None)
    parser.add_argument("--max-clearance-mm", type=float, default=0.75)
    parser.add_argument("--expected-rings", type=int, default=10)
    parser.add_argument("--expected-segments", type=int, default=40)
    parser.add_argument("--expected-offset-mm", type=float, default=.34)
    parser.add_argument("--historical", action="store_true",
                        help="skip the new 10x40/.34 metadata expectation for an old candidate")
    args = parser.parse_args()
    expected = (None, None, None) if args.historical else (args.expected_rings, args.expected_segments, args.expected_offset_mm)
    minimum = (0.08 if args.nails_only else 0.0) if args.min_clearance_mm is None else args.min_clearance_mm
    baseline = args.baseline.resolve() if args.nails_only else None
    result = Check(args.asset.resolve(), minimum, args.max_clearance_mm, *expected, baseline=baseline, nails_only=args.nails_only)
    if args.report:
        args.report.resolve().parent.mkdir(parents=True, exist_ok=True)
        args.report.resolve().write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, allow_nan=False))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(Main())
