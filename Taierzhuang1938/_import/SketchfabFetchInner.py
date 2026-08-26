# -*- coding: utf-8 -*-
"""Runs inside the live Blender via BlenderMCP execute_code.

Downloads Sketchfab CC-BY models with the API key held by the addon and
extracts them into Taierzhuang1938/_import/Source/<ModelName>/ so the asset
pipeline can rebuild from traceable sources.

The Type 38 source references 2K PBR textures that the pipeline intentionally
drops (the weapon import re-binds the shared steel/wood tiles and buckets the
wood part by its UModeler group name "All_Wood"), so they are left out here.
"""

import io
import json
import os
import zipfile

import bpy
import requests

# --- locate the Sketchfab API key the addon stores --------------------------
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

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Source")

MODELS = [
    ("40d06bd1d25b45e48fb9965c39901b13", "Model_Type38Arisaka"),   # Snijboer, CC-BY-4.0
    ("d782cbddbaaa4680aa9a28f7b4a1e635", "Model_Gewehr88"),        # TastyTony, CC-BY-4.0
    ("6920684ec16d40ffb857245be0661d34", "Model_SketchfabZb26Larkien"),
    ("4c49913126894908906c8512a52facd3", "Model_SketchfabMauserC96Maxence"),
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
            out_lines.append("  no gltf url: " + json.dumps(info)[:300])
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
