"""Bind the adopted soldier and interpreter appearances to the campaign's metre-space skeleton.
Run with Python, numpy and scipy. The pinned Git objects supply motion, sockets
and facial controls only. All visible body triangles and UVs come from the Tripo kits.
"""

import copy
import hashlib
import gzip
import json
from pathlib import Path
import struct
import subprocess

import numpy as np
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation

ROOT = Path(__file__).resolve().parents[2]
PROJECT = ROOT / "Taierzhuang1938"
DIRECTORY = PROJECT / "Model" / "Character"
RIG_REVISION = "025a54b4a9e67b3c8bdc90a01a91b4257051cb67"
APPEARANCES = {
    "TengxianIja01": "JapaneseSoldierYi",
    "TengxianIja02": "JapaneseSoldierA",
    "TengxianIja03": "JapaneseSoldierC",
    "TengxianIja06": "JapaneseSoldierJia",
    "TengxianNra02": "HeYoutian",
    "TengxianNra05": "SquadLeaderLuo",
    "TengxianNra06": "Interpreter",
}
TYPES = {5120: "i1", 5121: "u1", 5122: "<i2", 5123: "<u2", 5125: "<u4", 5126: "<f4"}
WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


class Model:
    def __init__(self, raw):
        size = struct.unpack_from("<I", raw, 12)[0]
        self.sha256 = hashlib.sha256(raw).hexdigest()
        self.doc = json.loads(raw[20 : 20 + size])
        self.data = raw[28 + size :]
        self.world = {}

        def visit(i, parent):
            node = self.doc["nodes"][i]
            local = np.eye(4)
            if "matrix" in node:
                local = np.array(node["matrix"]).reshape(4, 4).T
            else:
                local[:3, :3] = Rotation.from_quat(
                    node.get("rotation", [0, 0, 0, 1])
                ).as_matrix() @ np.diag(node.get("scale", [1, 1, 1]))
                local[:3, 3] = node.get("translation", [0, 0, 0])
            self.world[i] = parent @ local
            for child in node.get("children", []):
                visit(child, self.world[i])

        for root in self.doc["scenes"][self.doc.get("scene", 0)]["nodes"]:
            visit(root, np.eye(4))

    def read(self, index):
        a = self.doc["accessors"][index]
        view = self.doc["bufferViews"][a["bufferView"]]
        dtype = np.dtype(TYPES[a["componentType"]])
        width = WIDTHS[a["type"]]
        return np.ndarray(
            (a["count"], width),
            dtype=dtype,
            buffer=self.data,
            offset=view.get("byteOffset", 0) + a.get("byteOffset", 0),
            strides=(view.get("byteStride", dtype.itemsize * width), dtype.itemsize),
        ).copy()

    def joints(self):
        return [self.doc["nodes"][i]["name"] for i in self.doc["skins"][0]["joints"]]


class Writer:
    def __init__(self, template):
        self.doc = {
            key: copy.deepcopy(template.doc[key])
            for key in ("scenes", "scene", "nodes", "skins", "extras")
            if key in template.doc
        }
        self.doc.update(
            asset={
                "version": "2.0",
                "generator": "Tengxian formal IJA appearance bake",
            },
            accessors=[],
            bufferViews=[],
        )
        self.data = bytearray()
        self.cache = {}

    def add(self, values, kind, component=5126, normalised=False, bounds=False):
        a = np.asarray(values, dtype=TYPES[component]).reshape(-1, WIDTHS[kind])
        blob = a.tobytes()
        key = (kind, component, normalised, bounds, hashlib.sha256(blob).digest())
        if key in self.cache:
            return self.cache[key]
        self.data.extend(bytes(-len(self.data) % 4))
        accessor = {
            "bufferView": len(self.doc["bufferViews"]),
            "componentType": component,
            "count": len(a),
            "type": kind,
        }
        if normalised:
            accessor["normalized"] = True
        if bounds:
            accessor.update(min=a.min(axis=0).tolist(), max=a.max(axis=0).tolist())
        self.doc["bufferViews"].append(
            {"buffer": 0, "byteOffset": len(self.data), "byteLength": len(blob)}
        )
        self.data.extend(blob)
        result = len(self.doc["accessors"])
        self.doc["accessors"].append(accessor)
        self.cache[key] = result
        return result

    def copy_accessor(self, model, i):
        a = model.doc["accessors"][i]
        return self.add(
            model.read(i),
            a["type"],
            a["componentType"],
            a.get("normalized", False),
            "min" in a,
        )

    def encode(self):
        self.data.extend(bytes(-len(self.data) % 4))
        self.doc["buffers"] = [{"byteLength": len(self.data)}]
        text = json.dumps(self.doc, separators=(",", ":"), ensure_ascii=False).encode()
        text += b" " * (-len(text) % 4)
        return (
            struct.pack(
                "<5I",
                0x46546C67,
                2,
                28 + len(text) + len(self.data),
                len(text),
                0x4E4F534A,
            )
            + text
            + struct.pack("<2I", len(self.data), 0x004E4942)
            + self.data
        )


def Template(name):
    path = f"Taierzhuang1938/Model/Character/Model_{name}.glb"
    return Model(
        subprocess.check_output(
            ["git", "-C", str(ROOT), "show", RIG_REVISION + ":" + path]
        )
    )


def BodyMap():
    result = {
        "Hips": "Pelvis",
        "Spine": "Spine",
        "Spine1": "Spine1",
        "Spine2": "Spine2",
        "Neck": "Neck",
        "Head": "Head",
        "HeadTop_End": "Head",
    }
    for side, letter in [("Left", "L "), ("Right", "R ")]:
        for original, target in [
            ("Shoulder", "Clavicle"),
            ("Arm", "UpperArm"),
            ("ForeArm", "Forearm"),
            ("Hand", "Hand"),
            ("UpLeg", "Thigh"),
            ("Leg", "Calf"),
            ("Foot", "Foot"),
            ("ToeBase", "Toe0"),
            ("Toe_End", "Toe0"),
        ]:
            result[side + original] = letter + target
        for index, finger in enumerate(["Thumb", "Index", "Middle", "Ring", "Pinky"]):
            for segment, suffix in enumerate(["", "1", "2", "2"], 1):
                result[f"{side}Hand{finger}{segment}"] = (
                    f"{letter}Finger{index}{suffix}"
                )
    return {key: "Bip001 " + value for key, value in result.items()}


def Normalise(rows):
    return rows / np.maximum(np.linalg.norm(rows, axis=-1, keepdims=True), 1e-10)


def MeshOnRig(source, template):
    p = source.doc["meshes"][0]["primitives"][0]
    a = {key: source.read(i) for key, i in p["attributes"].items()}
    matrix = source.world[
        next(i for i, node in enumerate(source.doc["nodes"]) if "mesh" in node)
    ]
    pos = a["POSITION"] @ matrix[:3, :3].T + matrix[:3, 3]
    norm = Normalise(a["NORMAL"] @ np.linalg.inv(matrix[:3, :3]))
    dst = template.doc["skins"][0]["joints"]
    src = source.doc["skins"][0]["joints"]
    source_names, target_names = source.joints(), template.joints()
    mapping = BodyMap()
    prefix = next(name.split()[0] for name in target_names if name.endswith(" Pelvis"))
    remap = [
        target_names.index(mapping[name].replace("Bip001", prefix, 1))
        for name in source_names
    ]
    # Match corresponding bind joint positions and the direction of each limb.
    # Keep head shape and hand dimensions, and never scale the uniform or facial features independently.
    fitted = np.zeros_like(pos)
    normals = np.zeros_like(norm)
    weights = a["WEIGHTS_0"]
    joints = a["JOINTS_0"]
    for index, src_node in enumerate(src):
        weight = np.where(joints == index, weights, 0).sum(axis=1)
        mask = weight > 0
        if not mask.any():
            continue
        origin = source.world[src_node][:3, 3]
        target_pos = template.world[dst[remap[index]]][:3, 3]
        rotate = np.eye(3)
        children = [
            child
            for child in source.doc["nodes"][src_node].get("children", [])
            if child in src
        ]
        if len(children) == 1 and source_names[index] != "Head":
            child = children[0]
            source_axis = source.world[child][:3, 3] - origin
            target_axis = (
                template.world[dst[remap[src.index(child)]]][:3, 3] - target_pos
            )
            if min(np.linalg.norm(source_axis), np.linalg.norm(target_axis)) > 0.005:
                axis = np.cross(Normalise(source_axis), Normalise(target_axis))
                cosine = np.dot(Normalise(source_axis), Normalise(target_axis))
                if np.linalg.norm(axis) > 1e-8:
                    rotate = Rotation.from_rotvec(
                        Normalise(axis) * np.arctan2(np.linalg.norm(axis), cosine)
                    ).as_matrix()
        fitted[mask] += ((pos[mask] - origin) @ rotate.T + target_pos) * weight[
            mask, None
        ]
        normals[mask] += (norm[mask] @ rotate.T) * weight[mask, None]
    sole_offset = -fitted[:, 1].min()
    fitted[:, 1] += sole_offset
    normals = Normalise(normals)
    mapped = np.array(remap)[joints]
    # Weld only completely identical surface vertices. Keep UV and hard-normal seams.
    key = np.column_stack(
        [fitted.astype("f4"), normals.astype("f4"), a["TEXCOORD_0"], mapped, weights]
    )
    _, kept, indices = np.unique(key, axis=0, return_index=True, return_inverse=True)
    return (
        fitted[kept],
        normals[kept],
        a["TEXCOORD_0"][kept],
        mapped[kept],
        weights[kept],
        indices[source.read(p["indices"])],
        sole_offset,
    )


# Eye centres (left/right in the reference front view) and closed lip seam,
# ray-picked on each source and replacement surface in shared bind-space metres.
FACE_LANDMARKS = {
    "HeYoutian": (
        [
            [-0.037656, 1.680140, 0.121111],
            [0.025506, 1.681029, 0.121080],
            [-0.006520, 1.603696, 0.126227],
        ],
        [
            [-0.039435, 1.651696, 0.069655],
            [0.031733, 1.651696, 0.070191],
            [-0.003851, 1.584140, 0.105083],
        ],
    ),
    "SquadLeaderLuo": (
        [
            [-0.033798, 1.685474, 0.126247],
            [0.032031, 1.685474, 0.126179],
            [-0.000883, 1.612585, 0.141820],
        ],
        [
            [-0.033798, 1.644585, 0.084954],
            [0.026693, 1.643696, 0.085115],
            [-0.005331, 1.583251, 0.108537],
        ],
    ),
    "Interpreter": (
        [
            [-0.037948, 1.680140, 0.121098],
            [0.026104, 1.681029, 0.120976],
            [-0.007701, 1.602807, 0.124343],
        ],
        [
            [-0.045954, 1.660585, 0.076669],
            [0.027883, 1.661474, 0.076351],
            [-0.009481, 1.586807, 0.104666],
        ],
    ),
}


def FaceTransform(name):
    if name not in FACE_LANDMARKS:
        return None

    def frame(points):
        left, right, mouth = np.asarray(points)
        matrix = np.eye(4)
        matrix[:3, 0] = right - left
        matrix[:3, 1] = (right + left) / 2 - mouth
        matrix[:3, 3] = mouth
        return matrix

    before, after = FACE_LANDMARKS[name]
    return frame(after) @ np.linalg.inv(frame(before))


def RelocateFace(template, writer, fit):
    """Move the control pivots, inverse binds and keyed rest origins together."""
    nodes = writer.doc["nodes"]
    parents = {
        child: i for i, node in enumerate(nodes) for child in node.get("children", [])
    }
    world = {i: matrix.copy() for i, matrix in template.world.items()}
    for i, node in enumerate(nodes):
        if node.get("name", "").startswith("Face_"):
            world[i][:3, 3] = (fit @ template.world[i][:, 3])[:3]
    for i, node in enumerate(nodes):
        bone = node.get("name", "")
        if not bone.startswith("Face_"):
            continue
        rest = (np.linalg.inv(world[parents[i]]) @ world[i])[:3, 3]
        shift = rest - np.asarray(node.get("translation", [0, 0, 0]))
        node["translation"] = rest.tolist()
        for pose in writer.doc["extras"]["facialRig"]["poses"].values():
            if bone in pose:
                pose[bone]["translation"] = (
                    np.asarray(pose[bone]["translation"]) + shift
                ).tolist()
    for source_skin, skin in zip(template.doc["skins"], writer.doc["skins"]):
        binds = template.read(source_skin["inverseBindMatrices"]).reshape(-1, 4, 4)
        for k, i in enumerate(skin["joints"]):
            if nodes[i].get("name", "").startswith("Face_"):
                binds[k] = (np.linalg.inv(world[i]) @ template.world[i] @ binds[k].T).T
        skin["inverseBindMatrices"] = writer.add(binds, "MAT4")


def FaceWeights(template, pos, joints, weights, fit=None):
    # Transfer only face-control weights from the previous speaking rig to the new head.
    # Mouth interior is a separate shared rig component. Clothing, silhouette and UVs come from the new mesh.
    face_start = template.joints().index("Face_Jaw")
    head = template.joints().index("Bip001 Head")
    points, fields = [], []
    for prim in template.doc["meshes"][0]["primitives"][:-1]:
        a = prim["attributes"]
        js, ws = template.read(a["JOINTS_0"]), template.read(a["WEIGHTS_0"])
        if template.doc["accessors"][a["WEIGHTS_0"]].get("normalized"):
            ws = ws / np.iinfo(ws.dtype).max
        mask = np.any(((js == head) | (js >= face_start)) & (ws > 0), axis=1)
        if not np.any(mask):
            continue
        points.append(template.read(a["POSITION"])[mask])
        fields.append(
            np.stack(
                [
                    np.where(js[mask] == k, ws[mask], 0).sum(axis=1)
                    for k in range(face_start, len(template.joints()))
                ],
                axis=1,
            )
        )
    points, fields = np.concatenate(points), np.concatenate(fields)
    if fit is not None:
        points = points @ fit[:3, :3].T + fit[:3, 3]
    # Limit interpolation to actual neighbouring head surfaces; geometry outside that area retains the body bind.
    candidates = np.where(np.any((joints == head) & (weights > 0.3), axis=1))[0]
    distances, nearest = cKDTree(points).query(pos[candidates], k=4)
    influence = 1 / np.maximum(distances, 0.001) ** 2
    influence /= influence.sum(axis=1, keepdims=True)
    interp = (fields[nearest] * influence[:, :, None]).sum(axis=1)
    interp *= np.clip(1 - (distances[:, 0] - 0.014) / 0.026, 0, 1)[:, None]
    for vertex, face in zip(candidates, interp):
        if face.max() < 0.005:
            continue
        existing = weights[vertex] * (1 - min(1, face.sum()))
        values = np.concatenate([existing, face])
        indices = np.concatenate(
            [joints[vertex], np.arange(face_start, face_start + len(face))]
        )
        keep = np.argsort(-values, kind="stable")[:4]
        joints[vertex], weights[vertex] = (
            indices[keep],
            values[keep] / values[keep].sum(),
        )
    return joints, weights


def Build(name, template, native, geometry, facial):
    w = Writer(template)
    doc = w.doc
    src_doc = native.doc
    material = src_doc["materials"][0]["name"]
    doc["materials"] = [
        {
            "name": material,
            "pbrMetallicRoughness": {"metallicFactor": 0, "roughnessFactor": 0.8},
        }
    ]
    doc["extras"]["appearanceMaterial"] = {
        "file": "Model_" + name + ".glb",
        "material": material,
    }
    mesh_node = next(n for n in doc["nodes"] if "skin" in n and "mesh" in n)
    for node in doc["nodes"]:
        node.pop("mesh", None)
        if node.get("name") == "Object005":
            node["name"] = "MotionAttachment"
    mesh_node.update(name=name, mesh=0)
    pos, norm, uv, js, ws, indices, sole_offset = geometry
    # These anchors let the existing Tripo groom use its native head/neck transforms.
    native_by_name = {
        node["name"]: i for i, node in enumerate(native.doc["nodes"]) if "name" in node
    }
    rig_by_name = {
        node["name"]: i
        for i, node in enumerate(template.doc["nodes"])
        if "name" in node
    }
    translate = np.eye(4)
    translate[:3, 3] = (
        template.world[rig_by_name["Bip001 Head"]][:3, 3]
        - native.world[native_by_name["Head"]][:3, 3]
    )
    translate[1, 3] += sole_offset
    anchors = {}
    groom = (PROJECT / "Hair/Grooms" / ("Groom_Game_" + name + ".bin")).read_bytes()
    if groom.startswith(b"\x1f\x8b"):
        groom = gzip.decompress(groom)
    header = json.loads(groom[12 : 12 + struct.unpack_from("<I", groom, 8)[0]])
    anchor_bones = dict.fromkeys(("Spine2", "Neck", "Head"))
    for layer in (
        header.get("hair"),
        header.get("beard"),
        (header.get("hair") or {}).get("braid"),
    ):
        if layer:
            anchor_bones.update(
                dict.fromkeys((layer.get("skinning") or {}).get("bones", []))
            )
    for bone in anchor_bones:
        target = BodyMap()[bone]
        transform = (
            np.linalg.inv(template.world[rig_by_name[target]])
            @ translate
            @ native.world[native_by_name[bone]]
        )
        anchors[bone] = {
            "parent": target.replace(" ", "_"),
            "matrix": transform.T.flatten().round(9).tolist(),
        }
    doc["extras"]["appearanceGroom"] = {
        "file": "Groom_Game_" + name + ".bin",
        "anchors": anchors,
    }
    fit = FaceTransform(name) if facial else None
    if facial:
        js, ws = FaceWeights(template, pos, js.copy(), ws.copy(), fit)
    # Native atlases use [0,1] UVs. Keep normals float for standard glTF renderers.
    if uv.min() < -1e-6 or uv.max() > 1.000001:
        raise ValueError(f"{name}: unexpected atlas coordinates")
    uv_index = w.add(np.rint(uv.clip(0, 1) * 65535), "VEC2", 5123, True)
    skin_weights = np.rint(ws * 255).astype("i4")
    skin_weights[np.arange(len(ws)), ws.argmax(axis=1)] += 255 - skin_weights.sum(
        axis=1
    )
    if facial:
        # A VEC3 byte vertex attribute needs a 4-byte stride even in an independent buffer view.
        packed = np.column_stack([np.rint(norm.clip(-1, 1) * 127), np.zeros(len(norm))])
        normal = w.add(packed, "VEC4", 5120, True)
        w.doc["accessors"][normal]["type"] = "VEC3"
        w.doc["bufferViews"][w.doc["accessors"][normal]["bufferView"]]["byteStride"] = 4
        doc["extensionsUsed"] = ["KHR_mesh_quantization"]
        doc["extensionsRequired"] = ["KHR_mesh_quantization"]
    else:
        normal = w.add(norm, "VEC3")
    attrs = {
        "POSITION": w.add(pos, "VEC3", bounds=True),
        "NORMAL": normal,
        "TEXCOORD_0": uv_index,
        "JOINTS_0": w.add(js, "VEC4", 5121),
        "WEIGHTS_0": w.add(skin_weights, "VEC4", 5121, True)
        if facial
        else w.add(ws, "VEC4"),
    }
    prims = [
        {"attributes": attrs, "indices": w.add(indices, "SCALAR", 5123), "material": 0}
    ]
    if facial:
        oral = template.doc["meshes"][0]["primitives"][-1]
        doc["materials"].append(
            copy.deepcopy(template.doc["materials"][oral["material"]])
        )
        prims.append(
            {
                "attributes": {
                    k: w.copy_accessor(template, v)
                    for k, v in oral["attributes"].items()
                },
                "indices": w.copy_accessor(template, oral["indices"]),
                "material": 1,
            }
        )
    if fit is not None:
        oral_attributes = oral["attributes"]
        oral_positions = (
            template.read(oral_attributes["POSITION"]) @ fit[:3, :3].T + fit[:3, 3]
        )
        # Closed lips cover the interior of the mouth.
        oral_positions[:, 2] -= 0.008
        prims[-1]["attributes"]["POSITION"] = w.add(oral_positions, "VEC3", bounds=True)
        if "NORMAL" in oral_attributes:
            oral_normals = Normalise(
                template.read(oral_attributes["NORMAL"]) @ np.linalg.inv(fit[:3, :3])
            )
            prims[-1]["attributes"]["NORMAL"] = w.add(oral_normals, "VEC3")
    doc["meshes"] = [{"name": name, "primitives": prims}]
    for skin in doc["skins"]:
        skin["inverseBindMatrices"] = w.copy_accessor(
            template, skin["inverseBindMatrices"]
        )
    if fit is not None:
        RelocateFace(template, w, fit)
    if "animations" in template.doc:
        doc["animations"] = copy.deepcopy(template.doc["animations"])
        for clip in doc["animations"]:
            for sampler in clip["samplers"]:
                for key in ("input", "output"):
                    sampler[key] = w.copy_accessor(template, sampler[key])
    return w.encode()


def ShareFacialGeometry(data, body, filename):
    """Reference identical body attribute slices with standard glTF external buffers."""
    face = Model(data)
    base = Model(body)
    base_offset = len(body) - len(base.data)
    targets = {}
    for view in base.doc["bufferViews"]:
        start = view.get("byteOffset", 0)
        block = base.data[start : start + view["byteLength"]]
        targets[(len(block), hashlib.sha256(block).digest())] = base_offset + start
    binary = bytearray()
    for view in face.doc["bufferViews"]:
        start = view.get("byteOffset", 0)
        block = face.data[start : start + view["byteLength"]]
        match = targets.get((len(block), hashlib.sha256(block).digest()))
        if match is not None:
            view.update(buffer=1, byteOffset=match)
        else:
            binary.extend(bytes(-len(binary) % 4))
            view.update(buffer=0, byteOffset=len(binary))
            binary.extend(block)
    binary.extend(bytes(-len(binary) % 4))
    version = hashlib.sha256(body).hexdigest()[:16]
    face.doc["buffers"] = [
        {"byteLength": len(binary)},
        {"byteLength": len(body), "uri": filename + "?v=" + version},
    ]
    metadata = json.dumps(face.doc, separators=(",", ":"), ensure_ascii=False).encode()
    metadata += b" " * (-len(metadata) % 4)
    return (
        struct.pack(
            "<5I",
            0x46546C67,
            2,
            28 + len(metadata) + len(binary),
            len(metadata),
            0x4E4F534A,
        )
        + metadata
        + struct.pack("<2I", len(binary), 0x004E4942)
        + binary
    )


def Main():
    path = DIRECTORY / "Data_TengxianCharacterManifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    for old, name in APPEARANCES.items():
        record = next(r for r in manifest["models"] if r["id"] == old)
        native_path = DIRECTORY / ("Model_" + name + ".glb")
        native = Model(native_path.read_bytes())
        base = Template(old)
        record["motionSourceSha256"] = base.sha256
        geo = MeshOnRig(native, base)
        record["sourceRevision"] = RIG_REVISION
        record.setdefault("scaleHeight", record["bounds"]["size"][2])
        blender_pos = geo[0][:, [0, 2, 1]].copy()
        blender_pos[:, 1] *= -1
        record["bounds"] = {
            "min": blender_pos.min(axis=0).tolist(),
            "max": blender_pos.max(axis=0).tolist(),
            "size": np.ptp(blender_pos, axis=0).tolist(),
        }
        for facial in [False, True] if record.get("facialUrl") else [False]:
            template = Template(old + "Facial") if facial else base
            filename = "Model_" + name + ("Facial" if facial else "Humanoid") + ".glb"
            data = Build(name, template, native, geo, facial)
            if facial and record["faction"] == "nra":
                body_name = "Model_" + name + "Humanoid.glb"
                data = ShareFacialGeometry(
                    data, (DIRECTORY / body_name).read_bytes(), body_name
                )
            (DIRECTORY / filename).write_bytes(data)
            record["facialUrl" if facial else "url"] = "./Model/Character/" + filename
            record["facialVersion" if facial else "version"] = hashlib.sha256(
                data
            ).hexdigest()[:16]
            if not facial:
                record.update(
                    appearance=name,
                    source=native_path.name,
                    bytes=len(data),
                    vertices=len(geo[0]),
                    triangles=geo[5].size // 3,
                    limitedWeightVertices=0,
                    appearanceSha256=native.sha256,
                )
                record.pop("derivedFrom", None)
            print(filename, len(data))
    # Match the manifest's existing JS numeric spelling when writing float audits.
    formatted = subprocess.check_output(
        [
            "node",
            "-e",
            "process.stdout.write(JSON.stringify(JSON.parse(require('fs').readFileSync(0,'utf8')),null,2)+'\\n')",
        ],
        input=json.dumps(manifest, ensure_ascii=False).encode(),
    )
    path.write_bytes(formatted)
    subprocess.run(
        ["node", str(PROJECT / "_import/Script_FitCampaignInfantry.mjs")], check=True
    )
    subprocess.run(
        [
            "node",
            str(PROJECT / "_import/Script_StandardCharacterAudit.mjs"),
            "--formal-appearances",
        ],
        check=True,
    )


if __name__ == "__main__":
    Main()
