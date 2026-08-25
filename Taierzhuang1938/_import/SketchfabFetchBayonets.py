# -*- coding: utf-8 -*-
"""Runs inside the live Blender via BlenderMCP execute_code (SketchfabBridge runpy).

Downloads the two CC-BY bayonet donors for the bayonet system and extracts them
into Taierzhuang1938/_import/Source/<ModelName>/ so the asset pipeline can
rebuild from traceable sources:

  * Seitengewehr 84/98/34 (PL_historyfan_K, CC-BY-4.0) -> Model_Seitengewehr8498
      Mauser-pattern knife bayonet; donor for ZhongZheng (HY1935) and HanYang
      bayonets after license-safe historical corrections (longer blade, muzzle
      ring) in _blender/ImportBayonets.py.
  * Ps1 Arisaka T30 Bayonet (Swordmanck, CC-BY-4.0) -> Model_Type30Bayonet
      Type 30 bayonet with hooked quillon for the Type 38; scabbard dropped at
      import time.
"""

import io
import json
import os
import zipfile

import requests

key = ""
prefs = bpy.context.preferences.addons.get("blender_mcp")  # noqa: F821
if prefs is not None:
    key = getattr(prefs.preferences, "sketchfab_api_key", "") or ""
if not key:
    key = getattr(bpy.context.scene, "blendermcp_sketchfab_api_key", "") or ""  # noqa: F821
if not key:
    key = os.getenv("BLENDERMCP_SKETCHFAB_API_KEY", "") or ""
if not key:
    raise RuntimeError("Sketchfab API key not found in addon prefs/scene/env")

BASE = (r"C:\Users\Bentl\Documents\Program\bentleyblanks.github.io\.claude"
        r"\worktrees\bayonet-system-9d04e7\Taierzhuang1938\_import\Source")

MODELS = [
    ("612c3e0c56534d988622f825fc5491c8", "Model_Seitengewehr8498"),  # PL_historyfan_K, CC-BY-4.0
    ("7e602410773d4a9b8ca1d5c523d06b13", "Model_Type30Bayonet"),     # Swordmanck, CC-BY-4.0
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
    except Exception as e:  # noqa: BLE001
        out.append("  ERROR %s: %s" % (uid, e))

print("DONE\n" + "\n".join(out))
