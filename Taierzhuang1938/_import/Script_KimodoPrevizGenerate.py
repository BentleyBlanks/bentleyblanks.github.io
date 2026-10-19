"""Generate the blockout previz generic clips with the local Kimodo (docs/Data_EditorBlockout.md §14.5).

Loads the model once and draws every prompt in Data_KimodoPrevizPrompts.json; writes
<out>/<clip>/<clip>_<nn>.npz (SOMA77: posed_joints, global_rot_mats, ...). Existing npz are skipped.

Run with the Kimodo venv (12 GB GPU: the 8B text encoder stays on the CPU):
  set TEXT_ENCODER_DEVICE=cpu & set HF_HUB_OFFLINE=1
  C:/Users/Bentl/kimodo/.venv/Scripts/python.exe _import/Script_KimodoPrevizGenerate.py --out tmp/KimodoPreviz [--only Clip,Clip]
Only one Kimodo process at a time: the demo (kimodo_demo.bat) holds its own copy of the text encoder.
"""
from pathlib import Path
import argparse
import json
import os
import time

import torch

from kimodo import load_model
from kimodo.exports.motion_io import save_kimodo_npz
from kimodo.tools import seed_everything

parser = argparse.ArgumentParser()
parser.add_argument("--spec", type=Path, default=Path(__file__).with_name("Data_KimodoPrevizPrompts.json"))
parser.add_argument("--out", type=Path, required=True)
parser.add_argument("--only", default="")
parser.add_argument("--steps", type=int, default=100)
args = parser.parse_args()

spec = json.loads(args.spec.read_text(encoding="utf-8"))
only = {s for s in args.only.split(",") if s}
device = "cuda:0" if torch.cuda.is_available() else "cpu"
t0 = time.time()
model = load_model(spec["model"], device=device, default_family="Kimodo")
print(f"model loaded on {device} in {time.time() - t0:.0f}s, fps {model.fps}", flush=True)

for row in spec["clips"]:
    if only and row["clip"] not in only:
        continue
    folder = args.out / row["clip"]
    paths = [folder / f"{row['clip']}_{i:02d}.npz" for i in range(row["samples"])]
    if all(p.exists() for p in paths):
        print("skip", row["clip"], flush=True)
        continue
    folder.mkdir(parents=True, exist_ok=True)
    t1 = time.time()
    seed_everything(row["seed"])
    output = model(
        [row["prompt"]],
        [int(row["seconds"] * model.fps)],
        constraint_lst=[],
        num_denoising_steps=args.steps,
        num_samples=row["samples"],
        multi_prompt=True,
        post_processing=True,
        return_numpy=True,
    )
    n = int(output["posed_joints"].shape[0])
    for i in range(n):
        single = {k: (v[i] if hasattr(v, "shape") and len(v.shape) > 0 and v.shape[0] == n else v) for k, v in output.items()}
        save_kimodo_npz(str(paths[i]), single)
    (folder / "meta.json").write_text(json.dumps({**row, "fps": model.fps, "steps": args.steps}, indent=1), encoding="utf-8")
    print(f"{row['clip']}: {n} samples, {output['posed_joints'].shape[1]} frames, {time.time() - t1:.0f}s", flush=True)

print(f"done in {time.time() - t0:.0f}s", flush=True)
