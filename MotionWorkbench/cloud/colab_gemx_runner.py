"""Remote GEM-X Native77 + SOMA-X v0.3.3 runner executed on Colab via `colab exec -f`.

Emits structured stdout markers parsed by MotionWorkbench:
  [PROGRESS] <0-100>|<stage label>
  [TELEMETRY] <json>
"""

import json
import os
import shutil
import subprocess
import sys
import threading
import time
import zipfile
from pathlib import Path

INPUT_MP4 = Path(os.environ.get("GEMX_INPUT_MP4", "/content/mw_input.mp4"))
OUTPUT_ZIP = Path(os.environ.get("GEMX_OUTPUT_ZIP", "/content/mw_output.zip"))
STEM = os.environ.get("GEMX_STEM", INPUT_MP4.stem)
PRECISION = os.environ.get("GEMX_PRECISION", "standard_l4")
WORK_ROOT = Path("/content/mw_gemx_work")
GEMX_DIR = Path("/content/GEM-X")


def emit_progress(pct: int, label: str):
    print(f"[PROGRESS] {pct}|{label}", flush=True)


def read_telemetry():
    tm = {
        "gpuName": "NVIDIA GPU",
        "gpuVramUsedGb": 0.0,
        "gpuVramTotalGb": 24.0,
        "gpuUtilPct": 0,
        "gpuTempC": None,
        "ramUsedGb": 0.0,
        "ramTotalGb": 53.0,
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
            parts = [p.strip() for p in out.splitlines()[0].split(",")]
            if len(parts) >= 5:
                tm["gpuName"] = parts[0]
                tm["gpuVramUsedGb"] = round(float(parts[1]) / 1024.0, 2)
                tm["gpuVramTotalGb"] = round(float(parts[2]) / 1024.0, 1)
                tm["gpuUtilPct"] = int(float(parts[3]))
                tm["gpuTempC"] = int(float(parts[4]))
    except Exception:
        pass
    try:
        meminfo = {}
        with open("/proc/meminfo", "r", encoding="utf-8") as f:
            for line in f:
                k, v = line.split(":", 1)
                meminfo[k.strip()] = int(v.strip().split()[0])
        tot = meminfo.get("MemTotal", 0) / (1024 * 1024)
        avail = meminfo.get("MemAvailable", 0) / (1024 * 1024)
        tm["ramTotalGb"] = round(tot, 1)
        tm["ramUsedGb"] = round(max(0.0, tot - avail), 1)
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
    proc = subprocess.Popen(
        cmd,
        cwd=cwd,
        shell=isinstance(cmd, str),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    for line in proc.stdout:
        print(line, end="", flush=True)
    rc = proc.wait()
    if check and rc != 0:
        raise RuntimeError(f"Command failed (rc={rc}): {cmd}")
    return rc


def ensure_environment():
    marker = Path("/content/.mw_gemx_ready_v5")
    if marker.exists() and GEMX_DIR.exists():
        emit_progress(38, "复用热机 GEM-X 77 骨环境（跳过安装）")
        emit_telemetry()
        return

    emit_progress(22, "首次冷启：拉取 GEM-X 与 SOMA-X 依赖…")
    emit_telemetry()
    if not GEMX_DIR.exists():
        run_cmd(["git", "clone", "--depth", "1", "https://github.com/NVlabs/GEM-X.git", str(GEMX_DIR)])

    emit_progress(30, "安装 Python / PyTorch / SOMA-X 运行库…")
    emit_telemetry()
    req_file = GEMX_DIR / "requirements.txt"
    if req_file.exists():
        run_cmd([sys.executable, "-m", "pip", "install", "-q", "-r", str(req_file)], check=False)
    run_cmd(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "-q",
            "huggingface_hub",
            "imageio[ffmpeg]",
            "opencv-python-headless",
            "scipy",
            "trimesh",
            "smplx",
            "einops",
            "hydra-core",
            "omegaconf",
        ],
        check=False,
    )
    marker.write_text("ready_v5\n", encoding="utf-8")
    emit_progress(40, "GEM-X 环境就绪")
    emit_telemetry()


def main():
    if not INPUT_MP4.exists():
        raise FileNotFoundError(f"输入视频不存在：{INPUT_MP4}")

    stop_evt = threading.Event()

    def telemetry_loop():
        while not stop_evt.is_set():
            emit_telemetry()
            stop_evt.wait(8.0)

    t = threading.Thread(target=telemetry_loop, daemon=True)
    t.start()

    try:
        emit_progress(20, f"已接入 Colab GPU（{PRECISION}），检查环境…")
        ensure_environment()

        out_dir = WORK_ROOT / STEM
        if out_dir.exists():
            shutil.rmtree(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "render").mkdir(parents=True, exist_ok=True)

        emit_progress(48, "执行 GEM-X 77 关节骨骼提取（含十指）…")
        demo_script = None
        for cand in ["scripts/demo/demo.py", "demo.py", "run_gem_x.py"]:
            p = GEMX_DIR / cand
            if p.exists():
                demo_script = p
                break

        if demo_script is None:
            raise RuntimeError(f"未在 {GEMX_DIR} 中找到 GEM-X 推理入口脚本")

        cmd = [
            sys.executable,
            str(demo_script),
            "--video",
            str(INPUT_MP4),
            "--output_root",
            str(out_dir),
            "--static_cam",
        ]
        if PRECISION == "high_a100":
            cmd.append("--use_wilor")
        run_cmd(cmd, cwd=str(GEMX_DIR))

        emit_progress(86, "打包 GLB / FBX / BVH / USD 与可视化视频…")
        if OUTPUT_ZIP.exists():
            OUTPUT_ZIP.unlink()
        with zipfile.ZipFile(OUTPUT_ZIP, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for fp in sorted(out_dir.rglob("*")):
                if fp.is_file():
                    zf.write(fp, fp.relative_to(out_dir).as_posix())

        size_mb = OUTPUT_ZIP.stat().st_size / (1024 * 1024)
        emit_progress(92, f"云端打包完成（{size_mb:.1f} MB），准备回传本地…")
        emit_telemetry()
    finally:
        stop_evt.set()
        t.join(timeout=1.0)


if __name__ == "__main__":
    main()
