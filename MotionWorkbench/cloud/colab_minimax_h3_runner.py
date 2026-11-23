"""Remote ComfyUI + Comfy-Org/MiniMax-H3 (44GB) + RealESRGAN_x2plus runner on Colab 96G G4.

Executed via `colab exec -f colab_minimax_h3_runner.py --timeout 0 -s mw_h3_g4`.
Emits structured markers parsed by MotionWorkbench:
  [PROGRESS] <0-100>|<label>
  [TELEMETRY] <json>
"""

import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

PROMPT = os.environ.get("H3_PROMPT", "")
DURATION_SEC = float(os.environ.get("H3_DURATION", "6"))
RESOLUTION = os.environ.get("H3_RESOLUTION", "720p")
START_IMG = os.environ.get("H3_START_IMG", "")
END_IMG = os.environ.get("H3_END_IMG", "")
OUT_MP4 = Path(os.environ.get("H3_OUTPUT_MP4", "/content/mw_h3_out.mp4"))
UPSCALE = os.environ.get("H3_UPSCALE", "1") == "1"

COMFY_DIR = Path("/content/ComfyUI")
MODELS_DIR = COMFY_DIR / "models"


def emit_progress(pct: int, label: str):
    print(f"[PROGRESS] {pct}|{label}", flush=True)


def read_telemetry():
    tm = {
        "gpuName": "NVIDIA G4 (96 GB)",
        "gpuVramUsedGb": 0.0,
        "gpuVramTotalGb": 96.0,
        "gpuUtilPct": 0,
        "gpuTempC": None,
        "ramUsedGb": 0.0,
        "ramTotalGb": 120.0,
        "diskUsedGb": 0.0,
        "diskTotalGb": 235.0,
        "containerState": "running",
    }
    try:
        out = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu",
                "--format=csv,noheader,nounits",
            ],
            text=True,
            timeout=5,
        ).strip()
        if out:
            p = [x.strip() for x in out.splitlines()[0].split(",")]
            if len(p) >= 5:
                tm["gpuName"] = p[0]
                tm["gpuVramUsedGb"] = round(float(p[1]) / 1024.0, 2)
                tm["gpuVramTotalGb"] = round(float(p[2]) / 1024.0, 1)
                tm["gpuUtilPct"] = int(float(p[3]))
                tm["gpuTempC"] = int(float(p[4]))
    except Exception:
        pass
    try:
        du = shutil.disk_usage("/content")
        tm["diskTotalGb"] = round(du.total / (1024**3), 1)
        tm["diskUsedGb"] = round(du.used / (1024**3), 1)
    except Exception:
        pass
    return tm


def emit_telemetry():
    print("[TELEMETRY] " + json.dumps(read_telemetry(), ensure_ascii=False), flush=True)


def run_cmd(cmd, cwd=None, check=True):
    print(f"$ {' '.join(cmd) if isinstance(cmd, list) else cmd}", flush=True)
    p = subprocess.Popen(
        cmd,
        cwd=cwd,
        shell=isinstance(cmd, str),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    for line in p.stdout:
        print(line, end="", flush=True)
    rc = p.wait()
    if check and rc != 0:
        raise RuntimeError(f"Command failed (rc={rc}): {cmd}")
    return rc


def aria2_fetch(url: str, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists() and dst.stat().st_size > 10_000_000:
        print(f"[SKIP] {dst.name} already cached ({dst.stat().st_size // (1024*1024)} MB)", flush=True)
        return
    run_cmd(
        [
            "aria2c",
            "-x",
            "16",
            "-s",
            "16",
            "-k",
            "4M",
            "--continue=true",
            "--console-log-level=warn",
            "--summary-interval=10",
            "-d",
            str(dst.parent),
            "-o",
            dst.name,
            url,
        ]
    )


def discover_hf_files(repo_id: str):
    url = f"https://huggingface.co/api/models/{repo_id}/tree/main?recursive=true"
    req = urllib.request.Request(url, headers={"User-Agent": "MotionWorkbench/1.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        items = json.loads(resp.read().decode("utf-8"))
    return [it["path"] for it in items if it.get("type") == "file" and it.get("path", "").endswith(".safetensors")]


def ensure_comfy_and_weights():
    marker = Path("/content/.mw_minimax_h3_ready")
    if not shutil.which("aria2c"):
        run_cmd(["apt-get", "update", "-qq"], check=False)
        run_cmd(["apt-get", "install", "-y", "-qq", "aria2", "ffmpeg"], check=False)

    if not COMFY_DIR.exists():
        emit_progress(14, "拉取最新 ComfyUI（含 MiniMax-H3 原生节点）…")
        run_cmd(["git", "clone", "--depth", "1", "https://github.com/comfyanonymous/ComfyUI.git", str(COMFY_DIR)])
        run_cmd([sys.executable, "-m", "pip", "install", "-q", "-r", str(COMFY_DIR / "requirements.txt")], check=False)

    if marker.exists():
        emit_progress(42, "复用临时盘已缓存的 MiniMax-H3 (44GB) 权重…")
        return json.loads(marker.read_text(encoding="utf-8"))

    emit_progress(22, "机房光纤 aria2 直拉 Comfy-Org/MiniMax-H3 完整权重到临时盘…")
    emit_telemetry()
    files = discover_hf_files("Comfy-Org/MiniMax-H3")
    has_frames = bool(START_IMG and Path(START_IMG).exists())

    # Pick full-quality diffusion model (prefer fl2v when start/end frames exist, else t2v/fl2v), text encoder, and VAE
    diff_cands = [f for f in files if "diffusion_models/" in f]
    te_cands = [f for f in files if "text_encoders/" in f]
    vae_cands = [f for f in files if "vae/" in f]

    def pick(cands, keywords):
        for kw in keywords:
            for c in cands:
                if kw.lower() in c.lower():
                    return c
        return cands[0] if cands else None

    diff_file = pick(diff_cands, ["fl2v", "bf16", "fp8", "int8"] if has_frames else ["t2v", "fl2v", "bf16", "fp8"])
    te_file = pick(te_cands, ["fp8", "int8", "awq", "qwen"])
    video_vae = pick([v for v in vae_cands if "audio" not in v.lower()], ["video", "vae", "bf16", "fp32"]) or pick(vae_cands, ["vae"])

    picked = {"diffusion": diff_file, "text_encoder": te_file, "vae": video_vae}
    print("[MiniMax-H3] Selected weights:", json.dumps(picked, ensure_ascii=False), flush=True)

    base_hf = "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/"
    if diff_file:
        aria2_fetch(base_hf + diff_file, MODELS_DIR / "diffusion_models" / Path(diff_file).name)
    if te_file:
        aria2_fetch(base_hf + te_file, MODELS_DIR / "text_encoders" / Path(te_file).name)
    if video_vae:
        aria2_fetch(base_hf + video_vae, MODELS_DIR / "vae" / Path(video_vae).name)

    if UPSCALE:
        emit_progress(38, "aria2 拉取 RealESRGAN_x2plus 超分模型…")
        aria2_fetch(
            "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth",
            MODELS_DIR / "upscale_models" / "RealESRGAN_x2plus.pth",
        )

    marker.write_text(json.dumps(picked, ensure_ascii=False), encoding="utf-8")
    return picked


def wait_comfy_ready(port=8188, timeout=120):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/system_stats", timeout=3) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(2)
    raise RuntimeError("ComfyUI 8188 端口启动超时")


def find_official_h3_template(has_frames: bool):
    # Locate official ComfyUI MiniMax-H3 template bundled with ComfyUI / comfyui_workflow_templates
    search_roots = [COMFY_DIR]
    try:
        import comfyui_workflow_templates  # type: ignore
        search_roots.append(Path(comfyui_workflow_templates.__file__).parent)
    except Exception:
        pass
    matches = []
    for root in search_roots:
        for p in root.rglob("*minimax*h3*.json"):
            matches.append(p)
    if not matches:
        return None
    if has_frames:
        for p in matches:
            if any(k in p.name.lower() for k in ("fl2v", "i2v", "first", "frame")):
                return p
    return matches[0]


def main():
    stop_evt = threading.Event()

    def tm_loop():
        while not stop_evt.is_set():
            emit_telemetry()
            stop_evt.wait(8.0)

    t = threading.Thread(target=tm_loop, daemon=True)
    t.start()

    comfy_proc = None
    try:
        emit_progress(10, "已接入 Colab 96G G4，初始化 ComfyUI + MiniMax-H3…")
        weights = ensure_comfy_and_weights()

        emit_progress(46, "启动 ComfyUI 8188 服务（支持 colab ssh 转发本地看进度）…")
        comfy_proc = subprocess.Popen(
            [sys.executable, str(COMFY_DIR / "main.py"), "--listen", "127.0.0.1", "--port", "8188"],
            cwd=str(COMFY_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        wait_comfy_ready(8188, timeout=120)

        # Copy start/end storyboard images into ComfyUI/input/
        input_dir = COMFY_DIR / "input"
        input_dir.mkdir(parents=True, exist_ok=True)
        has_start = bool(START_IMG and Path(START_IMG).exists())
        has_end = bool(END_IMG and Path(END_IMG).exists())
        if has_start:
            shutil.copy2(START_IMG, input_dir / "mw_start.png")
        if has_end:
            shutil.copy2(END_IMG, input_dir / "mw_end.png")

        tpl_path = find_official_h3_template(has_start)
        if tpl_path is None:
            raise RuntimeError(
                "未在当前 ComfyUI 版本中找到内置 MiniMax-H3 API 工作流模板，请先执行 `colab ssh` 打开 8188 导出 API JSON"
            )

        emit_progress(54, f"载入官方模板 {tpl_path.name} 并提交 G4 推理…")
        wf = json.loads(tpl_path.read_text(encoding="utf-8"))
        # Patch prompt, frame images, and selected weight filenames in API-format workflow nodes
        if isinstance(wf, dict) and "nodes" not in wf:
            for node in wf.values():
                if not isinstance(node, dict):
                    continue
                ctype = str(node.get("class_type", ""))
                inp = node.get("inputs", {})
                if "CLIPTextEncode" in ctype and isinstance(inp.get("text"), str) and "negative" not in str(node.get("_meta", {}).get("title", "")).lower():
                    inp["text"] = PROMPT
                if ctype == "LoadImage":
                    title = str(node.get("_meta", {}).get("title", "")).lower()
                    if has_end and ("end" in title or "last" in title):
                        inp["image"] = "mw_end.png"
                    elif has_start:
                        inp["image"] = "mw_start.png"
                if weights.get("diffusion") and "unet_name" in inp:
                    inp["unet_name"] = Path(weights["diffusion"]).name
                if weights.get("text_encoder") and "clip_name" in inp:
                    inp["clip_name"] = Path(weights["text_encoder"]).name
                if weights.get("vae") and "vae_name" in inp:
                    inp["vae_name"] = Path(weights["vae"]).name

            payload = json.dumps({"prompt": wf}).encode("utf-8")
            req = urllib.request.Request(
                "http://127.0.0.1:8188/prompt",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                queued = json.loads(resp.read().decode("utf-8"))
            pid = queued["prompt_id"]
            emit_progress(60, f"MiniMax-H3 渲染中（prompt_id={pid[:8]}）…")

            while True:
                time.sleep(4)
                with urllib.request.urlopen(f"http://127.0.0.1:8188/history/{pid}", timeout=10) as hr:
                    hist = json.loads(hr.read().decode("utf-8"))
                if pid in hist:
                    break

        out_dir = COMFY_DIR / "output"
        mp4s = sorted(out_dir.rglob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not mp4s:
            raise RuntimeError("ComfyUI 执行结束但 output 目录未生成 MP4 视频")

        src_mp4 = mp4s[0]
        OUT_MP4.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_mp4, OUT_MP4)
        emit_progress(92, f"MiniMax-H3 生成完成（{OUT_MP4.stat().st_size // 1024} KB），准备回传…")
        emit_telemetry()
    finally:
        stop_evt.set()
        if comfy_proc:
            comfy_proc.terminate()
        t.join(timeout=1.0)


if __name__ == "__main__":
    main()
