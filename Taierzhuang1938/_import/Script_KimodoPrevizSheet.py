"""Stick-figure contact sheets for picking Kimodo samples (local only, tmp/KimodoPreviz/sheets/<clip>.png).

Row 0 is the old hand-keyed clip, then one row per retargeted sample (Script_KimodoPrevizRetarget.py --all-samples).
Each row: 8 evenly spaced frames, front view (left half of the cell) and side view (right half); the weapon is the brown line.
  python _import/Script_KimodoPrevizSheet.py [--only Clip,...]
"""
from pathlib import Path
import argparse
import json

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--samples", type=Path, default=ROOT / "tmp/KimodoPreviz/lib/Animation_TengxianNra02PrevizKimodoSamples.json")
parser.add_argument("--out", type=Path, default=ROOT / "tmp/KimodoPreviz/sheets")
parser.add_argument("--only", default="")
args = parser.parse_args()

src = (ROOT / "_import/Script_KimodoPrevizRetarget.py").read_text(encoding="utf-8")
ns = {"__file__": str(ROOT / "_import/Script_KimodoPrevizRetarget.py"), "__name__": "sheet"}
head = src.split("# ---------------------------------------------------------------- one source")[0].replace("args = parser.parse_args()", "args = parser.parse_args([])")
exec(head, ns)
Fk, Unpack, BI, BONES, PARENT, OldLibrary = ns["Fk"], ns["Unpack"], ns["BI"], ns["BONES"], ns["PARENT"], ns["OldLibrary"]
spec = json.loads((ROOT / "_import/Data_KimodoPrevizPrompts.json").read_text(encoding="utf-8"))
lib = json.loads(args.samples.read_text(encoding="utf-8"))
only = {s for s in args.only.split(",") if s}
COLS, CELL = 8, 220
SHOW = [i for i, b in enumerate(BONES) if "Finger" not in b and PARENT[i] >= 0 and b != "Bip001 Pelvis"]


def DrawPose(d, Pw, wrow, ox, oy, view, color):
    s = 85.0
    def P(p):
        h = p[0] if view == "front" else -p[2]
        return ox + CELL * 0.25 + h * s * (-1 if view == "front" else 1), oy + CELL - 12 - p[1] * s
    d.line([P([-1.2, 0, 0]) if view == "front" else P([0, 0, 1.2]), P([1.2, 0, 0]) if view == "front" else P([0, 0, -1.2])], fill=(90, 90, 90))
    for i in SHOW:
        side = BONES[i]
        c = (220, 90, 80) if " L " in side else (80, 140, 230) if " R " in side else color
        d.line([P(Pw[PARENT[i]]), P(Pw[i])], fill=c, width=3)
    hd = Pw[BI["Bip001 Head"]]
    x, y = P(hd + np.array([0, 0.1, 0]))
    d.ellipse([x - 7, y - 7, x + 7, y + 7], outline=color, width=2)
    if wrow is not None and wrow[-1] > 0.5:
        o = np.array(wrow[0:3]); ax = np.array(wrow[3:6])
        d.line([P(o - ax * 0.35), P(o + ax * 0.85)], fill=(160, 110, 50), width=3)


def Row(d, T, Q, W, stride, y, label):
    Rw, Pw = Fk(T, Q)
    F = len(T)
    for k in range(COLS):
        f = int(round(k * (F - 1) / (COLS - 1)))
        wrow = W[min(f, len(W) - 1)] if W is not None else None
        for v, view in enumerate(("front", "side")):
            DrawPose(d, Pw[f], wrow, k * CELL + v * CELL // 2, y, view, (230, 230, 230))
        d.text((k * CELL + 4, y + 2), f"f{f}", fill=(200, 200, 120))
    d.text((4, y + 14), label, fill=(255, 255, 255))


args.out.mkdir(parents=True, exist_ok=True)
for row in spec["clips"]:
    name = row["clip"]
    if only and name not in only: continue
    keys = sorted(k for k in lib["clips"] if k.startswith(name + "__s"))
    if not keys: continue
    img = Image.new("RGB", (COLS * CELL, (len(keys) + 1) * CELL), (24, 26, 30))
    d = ImageDraw.Draw(img)
    rec, man = OldLibrary(row["library"])
    orow = rec["clips"][name]
    T, Q = Unpack(orow["values"], orow["frameCount"])
    W = np.asarray(orow["props"]["weapon"]["values"]).reshape(-1, orow["props"]["weapon"]["stride"]) if "weapon" in (orow.get("props") or {}) else None
    Row(d, T, Q, W, 10, 0, f"OLD {name} {man['clips'][name]['duration']}s")
    for r, k in enumerate(keys, 1):
        c = lib["clips"][k]
        T, Q = Unpack(c["values"], c["frameCount"])
        W = np.asarray(c["props"]["weapon"]["values"]).reshape(-1, 10) if "props" in c else None
        Row(d, T, Q, W, 10, r * CELL, f"{k} {c['duration']}s")
        d.line([(0, r * CELL), (COLS * CELL, r * CELL)], fill=(70, 70, 70))
    img.save(args.out / f"{name}.png")
    print("sheet", args.out / f"{name}.png")
