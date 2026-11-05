# 头发实验室的光头胸像（docs/Data_HairSystem.md §2）：把 Tripo 光头源模型转成游戏口径，再量出长头发、胡子要用的关键点。
#
#   python Taierzhuang1938/_import/Script_HairLabHeads.py            # 全部重做
#   python Taierzhuang1938/_import/Script_HairLabHeads.py HeYoutian  # 只做一个
#
# 源：OneDrive\Sync\饮河\FPS\角色\Tripo\<编号>_<人>\ 下用户在 Tripo 生成的光头（各人「Ref_*_HeadBald」那张图生的）。
# 源模型约 1 个单位高、脸朝 +X、y 朝上；这里：
#   1. 用正中剖面找下巴底（下颌下方剖面陡降处）与头顶，按「头顶到下巴底 = HEAD_HEIGHT_M」缩放成米；
#   2. 绕 y 转 90°，脸朝 -Z（项目约定：人物正面一律局部 -Z），胸像底面中心放原点；
#   3. 贴图：底色 2048 JPEG、法线 / 粗糙度 1024（实验室近看够用，不把 4K 原图塞进仓库）；
#   4. 量关键点（头顶、眉间、鼻根、鼻尖、鼻下、口裂、下巴底、耳朵包围盒、头骨中心），写 Data_HairHeads.json。
#      长头发的发际线、胡子区域都按这些点在 Script_HairGroomBuild.mjs 里定义，不手抠坐标。
#      个人定妆采用 Hair/Data_HairReferences.json 的正投影校准覆盖项，特别是口裂、下巴和耳界。
import io, json, math, os, struct, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
OUT_DIR = os.path.join(PROJECT, "Hair", "Heads")
TRIPO = os.path.join(os.path.expanduser("~"), "OneDrive", "Sync", "饮河", "FPS", "角色", "Tripo")
HEAD_HEIGHT_M = 0.235          # 头顶到下巴底，成年男子均值约 23 cm；Tripo 头略大一号，取 23.5
BASE_SIZE, DETAIL_SIZE = 2048, 1024

HEADS = {
    "Shunzi":    {"name": "顺子",     "src": "01_顺子/bald human head 3d model.glb"},
    "Luo":       {"name": "罗班长",   "src": "02_罗班长/bald human head 3d model.glb"},
    "HeYoutian": {"name": "何有田",   "src": "05_何有田/bald head 3d model.glb"},
    "SoldierA":  {"name": "日军士兵A", "src": "10_日军士兵A/human head 3d model.glb"},
    "Jia":       {"name": "日兵甲",   "src": "14_日兵甲/bald head 3d model.glb"},
    "Yi":        {"name": "日兵乙",   "src": "15_日兵乙/bald head 3d model.glb"},
}


def ReadGlb(path):
    b = open(path, "rb").read()
    jl = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    bl = struct.unpack("<I", b[20 + jl:24 + jl])[0]
    blob = b[28 + jl:28 + jl + bl]
    return j, blob


def Accessor(j, blob, index):
    a = j["accessors"][index]
    bv = j["bufferViews"][a["bufferView"]]
    comps = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
    dtype = {5126: "<f4", 5125: "<u4", 5123: "<u2", 5121: "u1"}[a["componentType"]]
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = bv.get("byteStride")
    item = np.dtype(dtype).itemsize * comps
    if stride and stride != item:
        raw = np.frombuffer(blob, dtype=np.uint8, count=stride * a["count"], offset=off).reshape(-1, stride)[:, :item]
        return np.frombuffer(raw.tobytes(), dtype=dtype).reshape(-1, comps)
    return np.frombuffer(blob, dtype=dtype, count=a["count"] * comps, offset=off).reshape(-1, comps).copy()


def ImageOf(j, blob, tex_index):
    img = j["images"][j["textures"][tex_index]["source"]]
    bv = j["bufferViews"][img["bufferView"]]
    data = blob[bv.get("byteOffset", 0):bv.get("byteOffset", 0) + bv["byteLength"]]
    return Image.open(io.BytesIO(data))


def Encode(im, size, fmt, mode):
    im = im.convert(mode)
    if im.size[0] > size:
        im = im.resize((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    if fmt == "jpeg":
        im.save(buf, "JPEG", quality=90, optimize=True)
    else:
        im.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def Profile(P, zband=0.015):
    """正中剖面：每 1 cm（源单位 0.01）一层，最前点 x。"""
    mid = P[np.abs(P[:, 2]) < zband]
    ys = np.arange(P[:, 1].max(), P[:, 1].min(), -0.01)
    front = []
    for y in ys:
        s = mid[np.abs(mid[:, 1] - y) < 0.006]
        front.append(s[:, 0].max() if len(s) else np.nan)
    return ys, np.array(front)


def Landmarks(P):
    """源坐标系（脸朝 +X、y 朝上）里量关键点。"""
    top = P[:, 1].max()
    ys, F = Profile(P)
    valid = ~np.isnan(F)
    # 鼻尖：头顶以下 35%–75% 区间最靠前的点。
    span = top - P[:, 1].min()
    band = valid & (ys < top - span * 0.30) & (ys > top - span * 0.75)
    nose_i = int(np.nanargmax(np.where(band, F, -9)))
    # 下巴底：鼻尖以下，剖面往下一层就缩进 ≥ 0.05（下颌底面转成脖子）。
    menton_i = None
    for i in range(nose_i + 3, len(ys) - 2):
        if valid[i] and valid[i + 1] and F[i] - F[i + 1] > 0.05:
            menton_i = i
            break
        if valid[i] and valid[i + 2] and F[i] - F[i + 2] > 0.08:
            menton_i = i + 1
            break
    if menton_i is None:
        raise RuntimeError("找不到下巴底")
    # 鼻下点：鼻尖以下第一个剖面极小（人中最凹处在嘴唇上方）。
    sub_i = nose_i + 1
    while sub_i + 1 < menton_i and F[sub_i + 1] <= F[sub_i] + 1e-4:
        sub_i += 1
    # 鼻根：鼻尖以上剖面最凹的一层（两眼之间），眉间在它上面一层的极大。
    up = range(max(nose_i - 22, 0), nose_i - 3)
    nasion_i = min(up, key=lambda i: F[i] if valid[i] else 9)
    glabella_i = max(range(max(nasion_i - 6, 0), nasion_i), key=lambda i: F[i] if valid[i] else -9)
    menton = ys[menton_i]
    stomion = ys[sub_i] - (ys[sub_i] - menton) * 0.36
    # 耳朵：鼻下到眉间这段高度上，左右最外 6% 的点。
    zone = P[(P[:, 1] < ys[glabella_i] + 0.06) & (P[:, 1] > ys[sub_i] - 0.06)]
    zmax = np.abs(zone[:, 2]).max()
    ear = zone[np.abs(zone[:, 2]) > zmax * 0.86]
    # 窄脸的头（日兵甲 / 乙）外侧 14% 会带上颅骨两侧，上下界用解剖位置夹住：耳尖不过眉间 1.2 cm，耳垂不低于鼻下 1.2 cm（源单位按 0.235 / 头高换算）。
    unit = 0.012 * (top - ys[menton_i]) / 0.235
    ear_box = [float(ear[:, 0].min()), float(max(ear[:, 1].min(), ys[sub_i] - unit)),
               float(ear[:, 0].max()), float(min(ear[:, 1].max(), ys[glabella_i] + unit))]
    # 头骨中心：眉间高度那一层前后中点。
    sl = P[np.abs(P[:, 1] - ys[glabella_i]) < 0.006]
    skull_x = (sl[:, 0].min() + sl[:, 0].max()) * 0.5
    return {
        "top": float(top), "glabella": float(ys[glabella_i]), "nasion": float(ys[nasion_i]),
        "noseTip": [float(F[nose_i]), float(ys[nose_i])], "subnasale": float(ys[sub_i]),
        "stomion": float(stomion), "menton": float(menton), "chinFront": float(np.nanmax(F[sub_i + 2:menton_i + 1])),
        "earBox": ear_box, "earHalfWidth": float(zmax), "skullX": float(skull_x),
        "skullBack": float(sl[:, 0].min()), "browFront": float(F[glabella_i]),
    }


def Build(key):
    spec = HEADS[key]
    j, blob = ReadGlb(os.path.join(TRIPO, spec["src"]))
    prim = j["meshes"][0]["primitives"][0]
    P = Accessor(j, blob, prim["attributes"]["POSITION"]).astype(np.float64)
    N = Accessor(j, blob, prim["attributes"]["NORMAL"]).astype(np.float64)
    UV = Accessor(j, blob, prim["attributes"]["TEXCOORD_0"]).astype(np.float32)
    I = Accessor(j, blob, prim["indices"]).reshape(-1).astype(np.uint32)
    node = j["nodes"][0]
    P += np.array(node.get("translation", [0, 0, 0]))
    L = Landmarks(P)
    scale = HEAD_HEIGHT_M / (L["top"] - L["menton"])
    # 胸像底面中心 → 原点：x 取头骨中心，z 取 0（左右本来对称），y 取最低点。
    base = np.array([L["skullX"], P[:, 1].min(), 0.0])

    def Map(p):  # 源 → 游戏：缩放、平移，绕 y 转 90°（+X → -Z）
        q = (np.asarray(p, dtype=np.float64) - base) * scale
        return np.stack([q[..., 2], q[..., 1], -q[..., 0]], axis=-1)

    P2 = Map(P).astype(np.float32)
    N2 = np.stack([N[:, 2], N[:, 1], -N[:, 0]], axis=-1).astype(np.float32)
    N2 /= np.linalg.norm(N2, axis=1, keepdims=True) + 1e-12

    def Y(v):
        return round(float((v - base[1]) * scale), 5)

    def Z(xsrc):  # 源 x（前后）→ 游戏 z
        return round(float(-(xsrc - base[0]) * scale), 5)

    eb = L["earBox"]
    marks = {
        "name": spec["name"], "source": spec["src"], "scale": round(float(scale), 6),
        "top": [0, Y(L["top"]), Z(P[np.argmax(P[:, 1]), 0])],
        "glabella": [0, Y(L["glabella"]), Z(L["browFront"])],
        "nasion": [0, Y(L["nasion"])],
        "noseTip": [0, Y(L["noseTip"][1]), Z(L["noseTip"][0])],
        "subnasale": [0, Y(L["subnasale"])],
        "stomion": [0, Y(L["stomion"])],
        "menton": [0, Y(L["menton"]), Z(L["chinFront"])],
        "ear": {"yMin": Y(eb[1]), "yMax": Y(eb[3]), "zFront": Z(eb[2]), "zBack": Z(eb[0]),
                "halfWidth": round(float(L["earHalfWidth"] * scale), 5)},
        "skullCenter": [0, Y(L["glabella"]), 0.0],
        "skullBack": Z(L["skullBack"]),
        "bounds": {"min": [round(float(v), 4) for v in P2.min(0)], "max": [round(float(v), 4) for v in P2.max(0)]},
    }

    mat = j["materials"][prim.get("material", 0)]
    pbr = mat.get("pbrMetallicRoughness", {})
    images = [
        ("base", Encode(ImageOf(j, blob, pbr["baseColorTexture"]["index"]), BASE_SIZE, "jpeg", "RGB"), "image/jpeg"),
        ("normal", Encode(ImageOf(j, blob, mat["normalTexture"]["index"]), DETAIL_SIZE, "png", "RGB"), "image/png"),
        ("orm", Encode(ImageOf(j, blob, pbr["metallicRoughnessTexture"]["index"]), DETAIL_SIZE, "jpeg", "RGB"), "image/jpeg"),
    ]
    WriteGlb(os.path.join(OUT_DIR, f"Model_HairHead_{key}.glb"), key, P2, N2, UV, I, images)
    return marks


def WriteGlb(path, key, P, N, UV, I, images):
    chunks, views, accessors = [], [], []

    def Add(data, target=None):
        off = sum(len(c) for c in chunks)
        pad = (-len(data)) % 4
        chunks.append(data + b"\0" * pad)
        v = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target:
            v["target"] = target
        views.append(v)
        return len(views) - 1

    def Acc(arr, typ, ctype, target, minmax=False):
        a = {"bufferView": Add(arr.tobytes(), target), "componentType": ctype, "count": int(arr.shape[0]), "type": typ}
        if minmax:
            a["min"] = [float(v) for v in arr.min(0)]
            a["max"] = [float(v) for v in arr.max(0)]
        accessors.append(a)
        return len(accessors) - 1

    pos = Acc(P, "VEC3", 5126, 34962, True)
    nrm = Acc(N, "VEC3", 5126, 34962)
    uv = Acc(UV, "VEC2", 5126, 34962)
    idx = Acc(I.reshape(-1, 1), "SCALAR", 5125, 34963)
    img_entries = []
    for name, data, mime in images:
        img_entries.append({"bufferView": Add(data), "mimeType": mime, "name": f"{key}_{name}"})
    j = {
        "asset": {"version": "2.0", "generator": "Script_HairLabHeads.py"},
        "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": f"HairHead_{key}"}],
        "meshes": [{"name": f"HairHead_{key}", "primitives": [{
            "attributes": {"POSITION": pos, "NORMAL": nrm, "TEXCOORD_0": uv}, "indices": idx, "material": 0}]}],
        "materials": [{"name": f"HairHead_{key}_Skin", "normalTexture": {"index": 1},
                       "pbrMetallicRoughness": {"baseColorTexture": {"index": 0},
                                                "metallicRoughnessTexture": {"index": 2}}}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
        "textures": [{"source": i, "sampler": 0} for i in range(3)],
        "images": img_entries,
        "accessors": accessors, "bufferViews": views,
        "buffers": [{"byteLength": sum(len(c) for c in chunks)}],
    }
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    blob = b"".join(chunks)
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))
    out += struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(blob), 0x004E4942) + blob
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "wb").write(out)
    print(f"{key}: {len(out) / 1e6:.2f} MB, {len(I) // 3} tris")


def main():
    keys = sys.argv[1:] or list(HEADS)
    data_path = os.path.join(OUT_DIR, "Data_HairHeads.json")
    data = json.load(open(data_path, encoding="utf-8")) if os.path.exists(data_path) else {
        "schema": "tengxian.hairHeads", "version": 1,
        "note": "Script_HairLabHeads.py 生成，别手改；坐标：米，y 朝上，脸朝 -Z，胸像底面中心为原点", "heads": {}}
    for key in keys:
        data["heads"][key] = Build(key)
        print(key, json.dumps(data["heads"][key], ensure_ascii=False))
    data["heads"] = {k: data["heads"][k] for k in HEADS if k in data["heads"]}
    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
