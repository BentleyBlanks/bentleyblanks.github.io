"""把 _blender/Script_HanYang173RRebake.py 重烘过的零件拼回游戏 GLB：这些零件换网格（新 UV、横切后的三角形）
与三张贴图，其余零件与贴图字节原样。给 --report 时同时更新 Data_GameGeometry.json（哈希、三角数、贴图账）。
用法: python Script_HanYang173RRebakeAssemble.py <60k.glb> <out.glb> <rebake_out_dir…> [--report <Data_GameGeometry.json>]
后面的目录覆盖前面的同名零件。需要 numpy / scipy / opencv-python / Pillow。"""
import json, struct, sys, io, hashlib
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

def ReadGlb(p):
    b = Path(p).read_bytes(); n = struct.unpack_from('<I', b, 12)[0]
    return json.loads(b[20:20 + n]), b[28 + n:]

W = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
DT = {5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}
def Acc(doc, binb, i):
    a = doc['accessors'][i]; v = doc['bufferViews'][a['bufferView']]; w = W[a['type']]
    assert not v.get('byteStride') or v['byteStride'] == np.dtype(DT[a['componentType']]).itemsize * w
    return np.frombuffer(binb, dtype=DT[a['componentType']], count=a['count'] * w, offset=v.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(-1, w).copy()

def FillPng(path, hit, bits16=False):
    """命中像素原样；没命中的（零星漏点 + 岛外）取最近命中像素。"""
    import cv2
    a = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)          # 16 位 PNG 原样读（PIL 会悄悄降成 8 位）
    assert a is not None and a.dtype == (np.uint16 if bits16 else np.uint8), (path, None if a is None else a.dtype)
    a = a[..., ::-1] if a.ndim == 3 else a[..., None]        # BGR → RGB
    idx = ndimage.distance_transform_edt(~hit, return_distances=False, return_indices=True)
    out = a[idx[0], idx[1]]
    out = out[..., :3]
    if bits16:
        # 低 6 位是烘焙噪声，PNG 压不动；留 10 位精度（发布时 GPU 压缩只剩 8 位）
        out = (np.minimum(65535, (out.astype(np.uint32) + 32) >> 6 << 6)).astype(np.uint16)
    ok, enc = cv2.imencode('.png', np.ascontiguousarray(out[..., ::-1]), [cv2.IMWRITE_PNG_COMPRESSION, 9])
    assert ok
    return enc.tobytes()

args = sys.argv[1:]; report_path = None; surface_repair = None
if '--report' in args: k = args.index('--report'); report_path = Path(args[k + 1]); del args[k:k + 2]
if '--surface-repair' in args:
    k = args.index('--surface-repair'); surface_repair = json.loads(Path(args[k + 1]).read_text(encoding='utf8')); del args[k:k + 2]
game, out_path, dirs = args[0], args[1], [Path(d) for d in args[2:]]
doc, binb = ReadGlb(game)
parts = {}
for d in dirs:
    for p in json.loads((d / 'Data_RebakeReport.json').read_text()):
        parts[p['part']] = (d, p)

payload = bytearray(); views = []; remap = {}
def AddView(raw, target=None):
    while len(payload) % 4: payload.append(0)
    v = {'buffer': 0, 'byteOffset': len(payload), 'byteLength': len(raw)}
    if target: v['target'] = target
    views.append(v); payload.extend(raw); return len(views) - 1
# 先把原来所有 bufferView 原样搬过来（之后被换掉的会成孤儿，最后统一清掉）
for i, v in enumerate(doc['bufferViews']):
    s = v.get('byteOffset', 0); raw = binb[s:s + v['byteLength']]
    nv = AddView(raw, v.get('target'));
    if 'byteStride' in v: views[nv]['byteStride'] = v['byteStride']
    remap[i] = nv
for a in doc['accessors']:
    if 'bufferView' in a: a['bufferView'] = remap[a['bufferView']]
for im in doc['images']: im['bufferView'] = remap[im['bufferView']]
doc['bufferViews'] = views

def AddAccessor(arr, comp, typ, target, minmax=False):
    raw = np.ascontiguousarray(arr).tobytes(); bv = AddView(raw, target)
    a = {'bufferView': bv, 'componentType': comp, 'count': int(arr.shape[0]), 'type': typ}
    if minmax: a['min'] = arr.min(0).astype(float).tolist(); a['max'] = arr.max(0).astype(float).tolist()
    doc['accessors'].append(a); return len(doc['accessors']) - 1

log = []; payloads = {}
for node in doc['nodes']:
    name = node.get('name')
    if name not in parts or 'mesh' not in node: continue
    d, rep = parts[name]
    pdoc, pbin = ReadGlb(d / f'{name}.glb')
    pnode = next(n for n in pdoc['nodes'] if 'mesh' in n)
    for k in ('translation', 'rotation', 'scale', 'matrix'):
        a, b = node.get(k), pnode.get(k)
        if a is not None or b is not None:
            assert a is not None and b is not None and np.allclose(a, b, atol=1e-6), (name, k, a, b)
    pp = pdoc['meshes'][pnode['mesh']]['primitives']; assert len(pp) == 1
    prim = doc['meshes'][node['mesh']]['primitives']; assert len(prim) == 1; prim = prim[0]
    pa = pp[0]['attributes']
    P = Acc(pdoc, pbin, pa['POSITION']).astype('<f4'); N = Acc(pdoc, pbin, pa['NORMAL']).astype(float)
    T = Acc(pdoc, pbin, pa['TANGENT']).astype(float); UV = Acc(pdoc, pbin, pa['TEXCOORD_0']).astype('<f4')
    I = Acc(pdoc, pbin, pp[0]['indices']).reshape(-1).astype('<u4')
    N /= np.linalg.norm(N, axis=1)[:, None]
    # 切线投影到法线平面、修退化（同 Script_HanYang173RGame）
    proj = T[:, :3] - N * np.sum(T[:, :3] * N, axis=1)[:, None]; L = np.linalg.norm(proj, axis=1)
    for i in np.flatnonzero(~np.isfinite(L) | (L < 1e-7)):
        ax = np.zeros(3); ax[np.argmin(np.abs(N[i]))] = 1; proj[i] = np.cross(N[i], ax)
    proj /= np.linalg.norm(proj, axis=1)[:, None]; T = np.concatenate([proj, np.where(T[:, 3:] < 0, -1.0, 1.0)], axis=1)
    prim['attributes'] = {
        'POSITION': AddAccessor(P, 5126, 'VEC3', 34962, True),
        'NORMAL': AddAccessor(N.astype('<f4'), 5126, 'VEC3', 34962),
        'TANGENT': AddAccessor(T.astype('<f4'), 5126, 'VEC4', 34962),
        'TEXCOORD_0': AddAccessor(UV, 5126, 'VEC2', 34962),
    }
    prim['indices'] = AddAccessor(I.reshape(-1, 1), 5125, 'SCALAR', 34963)
    # 三张贴图
    mat = doc['materials'][prim['material']]; pbr = mat['pbrMetallicRoughness']
    slots = {'BaseColor': pbr['baseColorTexture']['index'], 'ORM': pbr['metallicRoughnessTexture']['index'], 'Normal': mat['normalTexture']['index']}
    hit = np.asarray(Image.open(d / f'{name}_ORM.png').convert('RGB'))[..., 0] > 128
    if surface_repair:
        assert float(hit.mean()) >= rep['unwrap']['coverage'] * .8, (name, 'baked coverage disagrees with exported UVs', float(hit.mean()), rep['unwrap']['coverage'])
    for role, ti in slots.items():
        for key in ('texCoord',):
            pass
        img = doc['images'][doc['textures'][ti]['source']]
        src = d / f'{name}_{role}.png'
        data = FillPng(src, hit, bits16=(role == 'Normal'))
        img['bufferView'] = AddView(data); img['mimeType'] = 'image/png'
        payloads[img['name']] = {'sha256': hashlib.sha256(data).hexdigest(), 'sourceSha256': hashlib.sha256(src.read_bytes()).hexdigest(), 'islandCoverage': round(float(hit.mean()), 4)}
    for t in ([pbr['baseColorTexture'], pbr['metallicRoughnessTexture'], mat['normalTexture']]):
        t.pop('texCoord', None)
    log.append({'part': name, 'vertices': int(P.shape[0]), 'triangles': int(I.size // 3), 'res': rep['res'], 'pxPerMm': rep['unwrap']['pxPerMm'], 'uvCoverage': rep['unwrap']['coverage'], 'missedFilled': int((~hit).sum())})

# 清孤儿 bufferView，重新紧排
used = sorted({a['bufferView'] for a in doc['accessors'] if 'bufferView' in a} | {im['bufferView'] for im in doc['images']})
# 只留被引用的 accessor：换掉的旧 accessor 也会变孤儿；保留它们无害但占字节 → 一并重排
ref = set()
for m in doc['meshes']:
    for p in m['primitives']:
        ref |= set(p['attributes'].values()); ref.add(p['indices'])
for s in doc.get('skins', []): ref.add(s.get('inverseBindMatrices'))
for an in doc.get('animations', []):
    for smp in an['samplers']: ref |= {smp['input'], smp['output']}
ref.discard(None)
amap = {}; newacc = []
for i, a in enumerate(doc['accessors']):
    if i in ref: amap[i] = len(newacc); newacc.append(a)
for m in doc['meshes']:
    for p in m['primitives']:
        p['attributes'] = {k: amap[v] for k, v in p['attributes'].items()}; p['indices'] = amap[p['indices']]
doc['accessors'] = newacc
used = sorted({a['bufferView'] for a in doc['accessors'] if 'bufferView' in a} | {im['bufferView'] for im in doc['images']})
final = bytearray(); fviews = []; vmap = {}
for i in used:
    v = doc['bufferViews'][i]; raw = payload[v['byteOffset']:v['byteOffset'] + v['byteLength']]
    while len(final) % 4: final.append(0)
    nv = {k: val for k, val in v.items()}; nv['byteOffset'] = len(final); vmap[i] = len(fviews); fviews.append(nv); final.extend(raw)
for a in doc['accessors']: a['bufferView'] = vmap[a['bufferView']]
for im in doc['images']: im['bufferView'] = vmap[im['bufferView']]
doc['bufferViews'] = fviews
while len(final) % 4: final.append(0)
doc['buffers'] = [{'byteLength': len(final)}]
extras = doc.setdefault('asset', {}).setdefault('extras', {})
if surface_repair:
    extras['surfaceRepair'] = surface_repair['version']
else:
    extras['rebake'] = '2026-11-03 uniform-density UVs rebaked from the author source for %d parts' % len(log)
j = json.dumps(doc, separators=(',', ':')).encode(); j += b' ' * ((-len(j)) % 4)
glb = struct.pack('<4sII', b'glTF', 2, 28 + len(j) + len(final)) + struct.pack('<II', len(j), 0x4E4F534A) + j + struct.pack('<II', len(final), 0x004E4942) + bytes(final)
Path(out_path).write_bytes(glb)
if report_path:
    rep = json.loads(report_path.read_text(encoding='utf8')); byname = {l['part']: l for l in log}
    rep['gameSha256'] = hashlib.sha256(glb).hexdigest()
    for part in rep['parts']:
        if part['part'] in byname:
            l = byname[part['part']]; part['gameTriangles'] = l['triangles']
            part['rebake'] = {'textureSize': l['res'], 'pxPerMm': l['pxPerMm'], 'uvCoverage': l['uvCoverage']}
    rep['triangles'] = sum(p['gameTriangles'] for p in rep['parts'])
    for t in rep['texturePayloads']:
        if t['name'] in payloads: t.update(payloads[t['name']]); t['rebake'] = True
    if surface_repair:
        rep['surfaceRepair'] = surface_repair
        for part in rep['parts']:
            if part['part'] in surface_repair['sourceSurfaceErrors']:
                part.update(surface_repair['sourceSurfaceErrors'][part['part']])
    else:
        rep['rebake'] = ('2026-11-03 _blender/Script_HanYang173RRebake.py + _import/Script_HanYang173RRebakeAssemble.py: %d parts get uniform-density UVs '
            'and maps rebaked from the author source onto the 60k mesh (long parts sliced every 6 cm first). For those images sourceSha256 is the raw bake '
            'and sha256 the nearest-filled payload (normals kept to 10 bits); islandCoverage is the bake hit fraction.' % len(log))
    report_path.write_text(json.dumps(rep, indent=2) + chr(10), encoding='utf8')
print(json.dumps({'bytes': len(glb), 'sha256': hashlib.sha256(glb).hexdigest(), 'parts': log}, indent=1, ensure_ascii=False))
