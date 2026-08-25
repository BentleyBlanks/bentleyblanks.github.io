# -*- coding: utf-8 -*-
"""Runs inside the live Blender via BlenderMCP execute_code.

拉大刀的 CC-BY 源模到 _import/Source/，和 SketchfabFetchInner.py 同一个套路：
密钥只存在 Blender 的 blender-mcp 插件里，脚本本身不带 token。
"""

import io
import os
import zipfile

import requests

key = ""
prefs = bpy.context.preferences.addons.get("blender_mcp")
if prefs is not None:
    key = getattr(prefs.preferences, "sketchfab_api_key", "") or ""
if not key:
    key = getattr(bpy.context.scene, "blendermcp_sketchfab_api_key", "") or ""
if not key:
    key = os.getenv("BLENDERMCP_SKETCHFAB_API_KEY", "") or ""
if not key:
    raise RuntimeError("Sketchfab API key not found in addon prefs/scene/env")

# 这段是注进 Blender 里跑的，没有 __file__ 可用，只能写死落点。
# 换一台机器 / 换一棵工作树就改这一行（或先设好 TZ1938_IMPORT_SOURCE）。
BASE = os.getenv("TZ1938_IMPORT_SOURCE") or \
    r"C:\Users\Bentl\Documents\Program\bentleyblanks.github.io\Taierzhuang1938\_import\Source"

MODELS = [
    ("511cfb4bb4ba464e9c6cb294b45f29ff", "Model_SketchfabDadao"),   # Trector, CC-BY-4.0
]

HDR = {"Authorization": "Token " + key}
out_lines = []

for uid, folder in MODELS:
    try:
        resp = requests.get("https://api.sketchfab.com/v3/models/%s/download" % uid,
                            headers=HDR, timeout=120)
        out_lines.append("download resp %s -> %d" % (uid, resp.status_code))
        if resp.status_code != 200:
            out_lines.append("  " + resp.text[:300])
            continue
        info = resp.json()
        url = (info.get("gltf") or {}).get("url")
        if not url:
            out_lines.append("  no gltf url")
            continue
        zresp = requests.get(url, timeout=600)
        out_lines.append("zip resp %d bytes=%d" % (zresp.status_code, len(zresp.content)))
        if zresp.status_code != 200:
            continue
        dest = os.path.join(BASE, folder)
        os.makedirs(dest, exist_ok=True)
        zf = zipfile.ZipFile(io.BytesIO(zresp.content))
        for zi in zf.infolist():
            arc = zi.filename.replace("\\", "/")
            target = os.path.normpath(os.path.join(dest, arc))
            if not target.startswith(os.path.normpath(dest)):
                out_lines.append("  skipped traversal entry: " + arc)
                continue
            parent = os.path.dirname(target)
            if parent:
                os.makedirs(parent, exist_ok=True)
            if zi.is_dir():
                continue
            with zf.open(zi) as src, open(target, "wb") as dst:
                dst.write(src.read())
            out_lines.append("  wrote %s (%d bytes)" % (arc, zi.file_size))
        zf.close()
    except Exception as e:
        out_lines.append("  ERROR %s: %s" % (uid, e))

print("DONE\n" + "\n".join(out_lines))
