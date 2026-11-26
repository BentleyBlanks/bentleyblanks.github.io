"""Remote ComfyUI + Comfy-Org/MiniMax-H3 (Blackwell G4 nvfp4+int8+8step turbo) + RealESRGAN_x2plus runner.

Executed via `colab exec -f colab_minimax_h3_runner.py --timeout 0 -s mw_h3_g4`.
Optimized for Colab 96GB RTX PRO 6000 Blackwell (G4):
  - Text Encoder: qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors (15.7 GB)
  - Video Model:  minimax_h3_fl2va_int8_convrot.safetensors (34.0 GB)
  - Turbo LoRA:   minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors (2.0 GB, 8 steps)
  - Video VAE:    minimax_h3_video_vae_fp16.safetensors (5.2 GB)
  - Upscaler:     RealESRGAN_x2plus.pth (when resolution == 1080p)

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
import urllib.error
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
    marker = Path("/content/.mw_minimax_h3_v2_nvfp4_int8_8step.json")
    if not shutil.which("aria2c"):
        run_cmd(["apt-get", "update", "-qq"], check=False)
        run_cmd(["apt-get", "install", "-y", "-qq", "aria2", "ffmpeg"], check=False)

    if not COMFY_DIR.exists():
        emit_progress(14, "拉取最新 ComfyUI（含 MiniMax-H3 原生节点）…")
        run_cmd(["git", "clone", "--depth", "1", "https://github.com/comfyanonymous/ComfyUI.git", str(COMFY_DIR)])
        run_cmd([sys.executable, "-m", "pip", "install", "-q", "-r", str(COMFY_DIR / "requirements.txt")], check=False)

    if marker.exists():
        emit_progress(42, "复用临时盘已缓存的 MiniMax-H3 (nvfp4 + int8 + 8step Turbo) 权重…")
        return json.loads(marker.read_text(encoding="utf-8"))

    emit_progress(20, "机房光纤 aria2 直拉 MiniMax-H3 Blackwell 加速权重（int8 + nvfp4 + 8step LoRA）…")
    emit_telemetry()
    files = discover_hf_files("Comfy-Org/MiniMax-H3")

    diff_cands = [f for f in files if "diffusion_models/" in f]
    te_cands = [f for f in files if "text_encoders/" in f]
    lora_cands = [f for f in files if "loras/" in f]
    vae_cands = [f for f in files if "vae/" in f]

    def pick(cands, keywords):
        for kw in keywords:
            for c in cands:
                if kw.lower() in c.lower():
                    return c
        return cands[0] if cands else None

    # Blackwell G4 optimal stack: unpruned FL2VA int8 (34GB) + Qwen3-VL nvfp4 (15.7GB) + 8-step turbo LoRA (2GB)
    diff_file = pick(
        diff_cands,
        [
            "minimax_h3_fl2va_int8_convrot",
            "fl2va_pruned_int8_convrot",
            "fl2va_pruned_fp8_scaled",
            "fl2va_bf16",
            "fl2v",
        ],
    )
    te_file = pick(
        te_cands,
        [
            "nvfp4_awq",
            "nvfp4",
            "int8_convrot",
            "bf16",
        ],
    )
    turbo_lora = pick(
        lora_cands,
        [
            "fl2v_turbo_8step",
            "turbo_8step",
            "fl2v_turbo_4step",
        ],
    )
    video_vae = pick(
        [v for v in vae_cands if "audio" not in v.lower() and "sol" not in v.lower()],
        ["video_vae_fp16", "video_vae_int8", "video"],
    ) or pick(vae_cands, ["vae"])
    audio_vae = pick([v for v in vae_cands if "audio" in v.lower()], ["audio_vae_fp32", "audio"])

    picked = {
        "diffusion": diff_file,
        "text_encoder": te_file,
        "turbo_lora": turbo_lora,
        "vae": video_vae,
        "audio_vae": audio_vae,
    }
    print("[MiniMax-H3] Selected Blackwell fast stack:", json.dumps(picked, ensure_ascii=False), flush=True)

    base_hf = "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/"
    if diff_file:
        emit_progress(24, f"aria2 拉取视频模型 {Path(diff_file).name}…")
        aria2_fetch(base_hf + diff_file, MODELS_DIR / "diffusion_models" / Path(diff_file).name)
    if te_file:
        emit_progress(32, f"aria2 拉取 NVFP4 文本编码器 {Path(te_file).name}…")
        aria2_fetch(base_hf + te_file, MODELS_DIR / "text_encoders" / Path(te_file).name)
    if turbo_lora:
        emit_progress(36, f"aria2 拉取 8step Turbo LoRA {Path(turbo_lora).name}…")
        aria2_fetch(base_hf + turbo_lora, MODELS_DIR / "loras" / Path(turbo_lora).name)
    if video_vae:
        emit_progress(38, f"aria2 拉取视频 VAE {Path(video_vae).name}…")
        aria2_fetch(base_hf + video_vae, MODELS_DIR / "vae" / Path(video_vae).name)
    if audio_vae:
        aria2_fetch(base_hf + audio_vae, MODELS_DIR / "vae" / Path(audio_vae).name)

    if UPSCALE or RESOLUTION == "1080p":
        emit_progress(40, "aria2 拉取 RealESRGAN_x2plus 超分模型…")
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


def build_minimax_h3_api_workflow(weights: dict, has_start: bool, has_end: bool):
    """Build the official ComfyUI API-format workflow graph for MiniMax-H3 FL2VA/I2V/T2V.

    Matches Comfy-Org/workflow_templates benchmarks/video_minimax_h3_t2v.json & blueprints/image_to_video_minimax_h3.json:
      - Width/Height must be multiples of 32 (480p -> 832x480, 720p/1080p -> 1280x736)
      - Frame length must satisfy length % 17 == 5
      - Uses MiniMaxH3ImageToVideo + UNETLoader + CLIPLoader(type="minimax") + LoraLoaderModelOnly (8step turbo)
    """
    gen_w, gen_h = (832, 480) if RESOLUTION == "480p" else (1280, 736)
    base_len = max(5, int(round(DURATION_SEC * 24)))
    target_frames = base_len + (5 - (base_len % 17)) % 17
    seed = int(time.time() * 1000) & 0x7FFFFFFF

    unet_name = Path(weights["diffusion"]).name
    clip_name = Path(weights["text_encoder"]).name
    video_vae_name = Path(weights["vae"]).name
    audio_vae_name = Path(weights["audio_vae"]).name if weights.get("audio_vae") else None
    turbo_lora_name = Path(weights["turbo_lora"]).name if weights.get("turbo_lora") else None

    wf = {
        "1": {
            "class_type": "UNETLoader",
            "inputs": {"unet_name": unet_name, "weight_dtype": "default"},
        },
        "2": {
            "class_type": "CLIPLoader",
            "inputs": {"clip_name": clip_name, "type": "minimax", "device": "default"},
        },
        "3": {
            "class_type": "VAELoader",
            "inputs": {"vae_name": video_vae_name},
        },
    }

    model_ref = ["1", 0]
    steps = 20
    if turbo_lora_name:
        wf["4"] = {
            "class_type": "LoraLoaderModelOnly",
            "inputs": {
                "lora_name": turbo_lora_name,
                "strength_model": 1.0,
                "model": ["1", 0],
            },
        }
        model_ref = ["4", 0]
        steps = 8

    h3_inputs = {
        "prompt": PROMPT,
        "width": gen_w,
        "height": gen_h,
        "length": target_frames,
        "clip": ["2", 0],
        "vae": ["3", 0],
    }
    if has_start:
        wf["5"] = {"class_type": "LoadImage", "inputs": {"image": "mw_start.png"}}
        h3_inputs["first_frame"] = ["5", 0]
    if has_end:
        wf["6"] = {"class_type": "LoadImage", "inputs": {"image": "mw_end.png"}}
        h3_inputs["last_frame"] = ["6", 0]

    wf["7"] = {"class_type": "MiniMaxH3ImageToVideo", "inputs": h3_inputs}
    wf["8"] = {
        "class_type": "BasicGuider",
        "inputs": {"model": model_ref, "conditioning": ["7", 0]},
    }
    wf["9"] = {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "res_multistep"}}
    wf["10"] = {
        "class_type": "BasicScheduler",
        "inputs": {"scheduler": "simple", "steps": steps, "denoise": 1.0, "model": model_ref},
    }
    wf["11"] = {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}}
    wf["12"] = {
        "class_type": "SamplerCustomAdvanced",
        "inputs": {
            "noise": ["11", 0],
            "guider": ["8", 0],
            "sampler": ["9", 0],
            "sigmas": ["10", 0],
            "latent_image": ["7", 1],
        },
    }
    wf["13"] = {
        "class_type": "VAEDecode",
        "inputs": {"samples": ["12", 0], "vae": ["3", 0]},
    }

    create_video_inputs = {
        "fps": 24,
        "bit_depth": 8,
        "color_space": "sRGB",
        "codec": "none",
        "images": ["13", 0],
    }
    if audio_vae_name:
        wf["14"] = {"class_type": "VAELoader", "inputs": {"vae_name": audio_vae_name}}
        wf["15"] = {
            "class_type": "VAEDecodeAudio",
            "inputs": {"samples": ["12", 0], "vae": ["14", 0]},
        }
        create_video_inputs["audio"] = ["15", 0]

    wf["16"] = {"class_type": "CreateVideo", "inputs": create_video_inputs}
    wf["17"] = {
        "class_type": "SaveVideo",
        "inputs": {
            "filename_prefix": "video/MiniMax_H3",
            "format": "auto",
            "format.codec": "auto",
            "codec": "auto",
            "video": ["16", 0],
        },
    }
    return wf, gen_w, gen_h, target_frames, steps


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

        wf, gen_w, gen_h, target_frames, steps = build_minimax_h3_api_workflow(weights, has_start, has_end)
        emit_progress(54, f"提交 MiniMax-H3 官方节点图到 G4（{gen_w}x{gen_h} · {target_frames}帧 · {steps}步）…")

        payload = json.dumps({"prompt": wf}).encode("utf-8")
        req = urllib.request.Request(
            "http://127.0.0.1:8188/prompt",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                queued = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as he:
            detail = he.read().decode("utf-8", errors="ignore")[:600]
            raise RuntimeError(f"ComfyUI /prompt 校验失败 ({he.code}): {detail}")
        pid = queued["prompt_id"]
        emit_progress(60, f"MiniMax-H3 渲染中（{RESOLUTION} · {DURATION_SEC:g}s · {steps}步 · prompt_id={pid[:8]}）…")

        while True:
            time.sleep(4)
            with urllib.request.urlopen(f"http://127.0.0.1:8188/history/{pid}", timeout=10) as hr:
                hist = json.loads(hr.read().decode("utf-8"))
            if pid in hist:
                status_obj = hist[pid].get("status", {})
                if status_obj.get("status_str") == "error":
                    msgs = status_obj.get("messages", [])
                    raise RuntimeError(f"ComfyUI 推理执行失败: {json.dumps(msgs, ensure_ascii=False)[:600]}")
                break

        out_dir = COMFY_DIR / "output"
        mp4s = sorted(out_dir.rglob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not mp4s:
            raise RuntimeError("ComfyUI 执行结束但 output 目录未生成 MP4 视频")

        src_mp4 = mp4s[0]
        OUT_MP4.parent.mkdir(parents=True, exist_ok=True)
        if RESOLUTION == "1080p":
            # Free ComfyUI VRAM before 1080p upscale/encode (per Blackwell G4 best practice)
            try:
                free_req = urllib.request.Request(
                    "http://127.0.0.1:8188/free",
                    data=json.dumps({"unload_models": True, "free_memory": True}).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                urllib.request.urlopen(free_req, timeout=10).read()
            except Exception:
                pass
            emit_progress(86, "清显存并输出 1080p 成片（Lanczos / 超分缩放）…")
            run_cmd(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-i",
                    str(src_mp4),
                    "-vf",
                    "scale=1920:1080:flags=lanczos",
                    "-c:v",
                    "libx264",
                    "-crf",
                    "18",
                    "-pix_fmt",
                    "yuv420p",
                    "-movflags",
                    "+faststart",
                    "-c:a",
                    "copy",
                    str(OUT_MP4),
                ]
            )
        else:
            shutil.copy2(src_mp4, OUT_MP4)
        emit_progress(92, f"MiniMax-H3 生成完成（{RESOLUTION} · {OUT_MP4.stat().st_size // 1024} KB），准备回传…")
        emit_telemetry()
    finally:
        stop_evt.set()
        if comfy_proc:
            comfy_proc.terminate()
        t.join(timeout=1.0)


if __name__ == "__main__":
    main()
