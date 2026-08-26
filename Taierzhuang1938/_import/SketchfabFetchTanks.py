# -*- coding: utf-8 -*-
"""Runs inside the live Blender via BlenderMCP execute_code.

Downloads CC-BY tank candidates for review (nothing is committed until a
candidate is chosen and probed).
"""

import io
import os
import zipfile

import bpy
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
    raise RuntimeError("Sketchfab API key not found")

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(HERE, "Source")

MODELS = [
    # 九五式轻战车：高模（82.8k 面）只作为源件，导入时压入战车 1600 面预算
    ("9ebd80d2ea12441dae8e41ad695d939d", "Model_Type95HaGo"),     # JesperLandin, CC-BY-4.0
    # 九七式中战车：低模；与八九式同一作者，部件命名可共用车辆导入规范
    ("d3568f32ec4440848e243e4b893a8ba6", "Model_Type97ChiHa"),    # snrnsrk5, CC-BY-4.0
    # 八九式中战车（甲）：博物馆实体扫描，部件组 Hull/Track/Turret/Barrel 齐备
    ("fe3f1f483bc043c6a0907eee444a1e43", "Model_Type89ChiRo"),     # snrnsrk5, CC-BY-4.0
]

HDR = {"Authorization": "Token " + key}
out = []

for uid, folder in MODELS:
    try:
        resp = requests.get("https://api.sketchfab.com/v3/models/%s/download" % uid,
                            headers=HDR, timeout=120)
        out.append("download %s -> %d" % (uid, resp.status_code))
        if resp.status_code != 200:
            out.append("  " + resp.text[:300])
            continue
        url = (resp.json().get("gltf") or {}).get("url")
        if not url:
            out.append("  no gltf url")
            continue
        zresp = requests.get(url, timeout=600)
        out.append("zip %d bytes=%d" % (zresp.status_code, len(zresp.content)))
        if zresp.status_code != 200:
            continue
        dest = os.path.join(BASE, folder)
        os.makedirs(dest, exist_ok=True)
        zf = zipfile.ZipFile(io.BytesIO(zresp.content))
        for zi in zf.infolist():
            arc = zi.filename.replace("\\", "/")
            target = os.path.normpath(os.path.join(dest, arc))
            if not target.startswith(os.path.normpath(dest)):
                continue
            parent = os.path.dirname(target)
            if parent:
                os.makedirs(parent, exist_ok=True)
            if zi.is_dir():
                continue
            with zf.open(zi) as src, open(target, "wb") as dst:
                dst.write(src.read())
            out.append("  wrote %s (%d)" % (arc, zi.file_size))
        zf.close()
    except Exception as e:
        out.append("  ERROR %s: %s" % (uid, e))

print("DONE\n" + "\n".join(out))
