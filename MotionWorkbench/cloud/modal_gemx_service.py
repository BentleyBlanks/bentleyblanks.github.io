"""
Modal Serverless GPU Backend for NVIDIA GEM-X (Native77, 77 joints incl. fingers) + SOMA-X v0.3.3.

Design goals:
- Zero idle GPU waste: CPU-only FastAPI gateway handles /health, /jobs/{id}, /files without waking GPUs.
- GPU L4 worker spins up ONLY when a video job is spawned and scales to 0 after `scaledown_window=60`s.
- Pre-baked container image (GEM-X + SOMA-X + Blender 4.2.9 LTS): no per-run pip install wait.
- Persistent modal.Volume caches all GEM-X & SOMA-X checkpoints (~few GB) once across all runs.
- Live hardware telemetry (GPU name, VRAM used/total, GPU util%, temp, RAM, disk) + stage progress.

Deploy once from local machine:
    pip install modal
    modal setup
    modal deploy MotionWorkbench/cloud/modal_gemx_service.py
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import modal

APP_NAME = "gemx-mocap-serverless"
VOLUME_NAME = "gemx-mocap-data-v1"
DICT_NAME = "gemx-mocap-jobs-v1"

app = modal.App(APP_NAME)
data_vol = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)
job_store = modal.Dict.from_name(DICT_NAME, create_if_missing=True)

DATA_ROOT = Path("/data")
WEIGHTS_DIR = DATA_ROOT / "weights"
SOMA_ASSETS_DIR = DATA_ROOT / "assets" / "soma"
JOBS_DIR = DATA_ROOT / "jobs"

# Lightweight CPU-only image for FastAPI gateway (never allocates GPU for polling/downloads!)
api_image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "fastapi[standard]>=0.115",
    "python-multipart>=0.0.9",
)

# Pre-baked GPU worker image: PyTorch >= 2.10 CUDA + NVIDIA GEM-X + SOMA-X v0.3.3 + Blender 4.2.9 LTS
gpu_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install(
        "git",
        "ffmpeg",
        "curl",
        "xz-utils",
        "libegl-mesa0",
        "libgl1-mesa-dri",
        "libxrender1",
        "libxi6",
        "libxkbcommon0",
        "libsm6",
        "libxext6",
        "libgl1",
    )
    .pip_install(
        "torch>=2.10,<3",
        "torchvision",
        "huggingface_hub>=0.28",
        "usd-core",
        "scipy",
        "psutil",
        "nvidia-ml-py",
    )
    .run_commands(
        "git clone --depth 1 https://github.com/NVlabs/GEM-X.git /opt/GEM-X",
        "pip install --no-cache-dir -e '/opt/GEM-X[video]'",
        "pip install --no-cache-dir 'py-soma-x==0.3.3'",
        # Pre-bake Blender 4.2.9 LTS for instant USD -> FBX/GLB export
        "mkdir -p /opt/blender && "
        "curl -fsSL https://download.blender.org/release/Blender4.2/blender-4.2.9-linux-x64.tar.xz -o /tmp/blender.tar.xz && "
        "tar -xf /tmp/blender.tar.xz -C /opt/blender --strip-components=1 && "
        "rm -f /tmp/blender.tar.xz && "
        "/opt/blender/blender --version",
    )
    .env({"TORCH_ALLOW_TF32_CUBLAS_OVERRIDE": "0"})
)


def _sample_hardware_telemetry() -> dict[str, Any]:
    import psutil

    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/data" if Path("/data").exists() else "/")
    telem: dict[str, Any] = {
        "sampledAt": time.time(),
        "ramUsedGb": round(mem.used / (1024**3), 2),
        "ramTotalGb": round(mem.total / (1024**3), 2),
        "ramPct": round(mem.percent, 1),
        "diskUsedGb": round(disk.used / (1024**3), 2),
        "diskTotalGb": round(disk.total / (1024**3), 2),
        "diskPct": round(disk.percent, 1),
        "gpuName": None,
        "gpuVramUsedGb": 0.0,
        "gpuVramTotalGb": 0.0,
        "gpuUtilPct": 0.0,
        "gpuTempC": None,
    }
    try:
        import pynvml

        pynvml.nvmlInit()
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        name = pynvml.nvmlDeviceGetName(handle)
        if isinstance(name, bytes):
            name = name.decode("utf-8", errors="ignore")
        mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
        util = pynvml.nvmlDeviceGetUtilizationRates(handle)
        temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
        telem.update(
            {
                "gpuName": name,
                "gpuVramUsedGb": round(mem_info.used / (1024**3), 2),
                "gpuVramTotalGb": round(mem_info.total / (1024**3), 2),
                "gpuUtilPct": float(util.gpu),
                "gpuTempC": int(temp),
            }
        )
    except Exception:
        pass
    return telem


def _update_job(job_id: str, **patch: Any) -> dict[str, Any]:
    cur = dict(job_store.get(job_id) or {"jobId": job_id})
    cur.update(patch)
    cur["updatedAt"] = time.time()
    job_store[job_id] = cur
    return cur


def _append_log(job_id: str, msg: str) -> None:
    cur = dict(job_store.get(job_id) or {"jobId": job_id})
    logs = list(cur.get("logs") or [])
    ts = time.strftime("%H:%M:%S")
    logs.append(f"[{ts}] {msg}")
    cur["logs"] = logs[-80:]
    cur["updatedAt"] = time.time()
    job_store[job_id] = cur


def _ensure_weights_on_volume(job_id: str) -> None:
    import shutil
    import urllib.request
    from shutil import copyfileobj
    from zipfile import ZipFile

    from huggingface_hub import hf_hub_download

    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    SOMA_ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    changed = False

    def ensure_hf(repo_id: str, filename: str, local_dir: Path, revision: str | None = None):
        nonlocal changed
        target = local_dir / filename
        if target.exists() and target.stat().st_size > 0:
            return
        _append_log(job_id, f"首次缓存模型权重: {repo_id}/{filename}")
        hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            revision=revision,
            local_dir=str(local_dir),
        )
        changed = True

    for fn in (
        "body_s240000.ckpt",
        "vitpose.pth",
        "motion_native77_e774_s292175.ckpt",
        "motion_stats_raw.npz",
        "body_video_native77.yaml",
    ):
        ensure_hf("nvidia/GEM-X", fn, WEIGHTS_DIR)

    for fn in (
        "SOMA_neutral.npz",
        "SOMA_template_rig.usda",
        "SOMA_procedural_transforms.json",
        "correctives_model.pt",
    ):
        ensure_hf("nvidia/SOMA-X", fn, SOMA_ASSETS_DIR, revision="v0.3.3")

    yolox_onnx = WEIGHTS_DIR / "yolox_humanart.onnx"
    if not (yolox_onnx.exists() and yolox_onnx.stat().st_size > 0):
        _append_log(job_id, "首次缓存 YOLOX-X HumanArt 人物检测器...")
        zip_path = Path("/tmp/yolox_humanart.zip")
        url = "https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/yolox_x_8xb8-300e_humanart-a39d44ed.zip"
        urllib.request.urlretrieve(url, zip_path)
        with ZipFile(zip_path) as archive:
            member = next(name for name in archive.namelist() if name.endswith("/end2end.onnx"))
            with archive.open(member) as src, yolox_onnx.open("wb") as dst:
                copyfileobj(src, dst)
        zip_path.unlink(missing_ok=True)
        changed = True

    # Symlink /opt/GEM-X/weights & /opt/GEM-X/assets/soma to persistent volume
    gem_repo = Path("/opt/GEM-X")
    for link_path, target_path in [
        (gem_repo / "weights", WEIGHTS_DIR),
        (gem_repo / "assets" / "soma", SOMA_ASSETS_DIR),
    ]:
        link_path.parent.mkdir(parents=True, exist_ok=True)
        if link_path.is_symlink():
            link_path.unlink()
        elif link_path.exists():
            shutil.rmtree(link_path)
        link_path.symlink_to(target_path)

    if changed:
        data_vol.commit()


@app.function(
    image=gpu_image,
    gpu=["L4", "A10G", "L40S", "A100-40GB"],
    volumes={"/data": data_vol},
    scaledown_window=60,  # 自动在最后一个任务结束 60 秒后关机停表，零空转浪费！
    min_containers=0,
    max_containers=3,  # 多任务并发时最多自动扩至 3 张 GPU
    timeout=1200,
)
def run_gemx_gpu(job_id: str, options: dict[str, Any]) -> dict[str, Any]:
    import cv2
    import numpy as np
    import torch
    from scipy.spatial.transform import Rotation as SciRot

    from gem.inference.timing import prediction_fps
    from gem.inference.video import VideoFrames, normalize_video
    from gem.motion.geometry import MotionGeometry
    from soma.io import save_soma_usd

    def _to_np(x):
        if isinstance(x, torch.Tensor):
            return x.detach().cpu().numpy()
        return np.asarray(x)

    data_vol.reload()
    t0 = time.time()
    stop_telem = threading.Event()

    def telemetry_loop():
        while not stop_telem.is_set():
            try:
                telem = _sample_hardware_telemetry()
                _update_job(job_id, telemetry=telem, containerState="active_gpu")
            except Exception:
                pass
            stop_telem.wait(2.0)

    telem_thread = threading.Thread(target=telemetry_loop, daemon=True)
    telem_thread.start()

    try:
        _update_job(
            job_id,
            status="running",
            stage="prepare_weights",
            stageLabel="校验云端模型权重与环境",
            progress=8,
            startedAt=t0,
        )
        _append_log(job_id, "L4 GPU 容器已就绪，检查 GEM-X Native77 权重卷...")
        _ensure_weights_on_volume(job_id)

        job_dir = JOBS_DIR / job_id
        input_video = job_dir / options["inputFilename"]
        if not input_video.exists():
            raise FileNotFoundError(f"输入视频不存在: {input_video}")

        video_stem = input_video.stem
        out_dir = job_dir / "outputs"
        render_dir = out_dir / "render"
        out_dir.mkdir(parents=True, exist_ok=True)
        render_dir.mkdir(parents=True, exist_ok=True)
        motion_pt = out_dir / "motion.pt"

        camera_mode = options.get("cameraMode", "static")
        use_contact_ik = bool(options.get("useContactIk", True))
        clip_start = float(options.get("clipStartSec", 0.0) or 0.0)
        clip_dur = float(options.get("clipDurationSec", 0.0) or 0.0)
        export_fbx_glb = bool(options.get("exportFbxAndGlb", True))

        # Step 1: GEM-X Native77 inference
        _update_job(
            job_id,
            stage="gemx_infer",
            stageLabel="运行 GEM-X Native77（77关节全身+十指动作重建 + Contact/IK）",
            progress=20,
        )
        cmd = [
            "gem-infer",
            "motion-video",
            "--task",
            "body",
            "--input",
            str(input_video),
            "--config",
            str(WEIGHTS_DIR / "body_video_native77.yaml"),
            "--camera-mode",
            camera_mode,
            "--device",
            "cuda",
            "--soma-assets",
            str(SOMA_ASSETS_DIR),
            "--output",
            str(motion_pt),
        ]
        if use_contact_ik:
            cmd.append("--postprocess")
        if clip_start > 0:
            cmd += ["--start", str(clip_start)]
        if clip_dur > 0:
            cmd += ["--duration", str(min(clip_dur, 60.0))]

        _append_log(job_id, f"开始推理: {input_video.name} (camera={camera_mode}, contact_ik={use_contact_ik})")
        proc = subprocess.Popen(
            cmd,
            cwd="/opt/GEM-X",
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        for line in proc.stdout:
            s = line.strip()
            if not s:
                continue
            low = s.lower()
            if "detect" in low or "track" in low:
                _update_job(job_id, progress=30, stageLabel="YOLOX 人物检测与追踪")
            elif "vitpose" in low or "keypoint" in low:
                _update_job(job_id, progress=45, stageLabel="DINOv3-Huge ViTPose77（含十指关键点）")
            elif "motion" in low or "forward" in low:
                _update_job(job_id, progress=58, stageLabel="12层时序运动 Transformer 求解")
            elif "contact" in low or "ik" in low:
                _update_job(job_id, progress=68, stageLabel="Contact/IK 脚底锁地防滑步")
            _append_log(job_id, s[:220])
        rc = proc.wait()
        if rc != 0:
            raise RuntimeError(f"gem-infer 失败 (exit={rc})")

        # Step 2: Extract SOMA 78-joint transforms & export USD
        _update_job(
            job_id,
            stage="export_usd_bvh",
            stageLabel="提取 77 关节旋转与 Hips 位移，导出 USD / BVH",
            progress=74,
        )
        saved = torch.load(motion_pt, map_location="cpu", weights_only=False)
        params = saved["pred_soma_params_global"]
        fps = float(prediction_fps(saved))
        T = int(params["body_pose"].shape[1])

        device = "cuda"
        geometry = MotionGeometry(str(SOMA_ASSETS_DIR), device=device, chunk_size=64, apply_correctives=False)
        body_model = geometry.body_model

        world_T_list = []
        for start in range(0, T, 64):
            stop = min(start + 64, T)
            count = stop - start
            with torch.inference_mode(), torch.autocast(device, enabled=False):
                values = {}
                for name in ("body_pose", "global_orient", "transl"):
                    v = params[name][:, start:stop]
                    values[name] = v.reshape(count, *v.shape[2:]).to(device=device, dtype=torch.float32)
                for name in ("identity_coeffs", "scale_params"):
                    v = params[name]
                    v = v[:, None].expand(-1, count, -1) if v.ndim == 2 else v[:, start:stop]
                    values[name] = v.reshape(count, -1).to(device=device, dtype=torch.float32)
                out = body_model(**values, pose2rot=True, apply_correctives=False, repose_to_bind_pose=True)
                world_T_list.append(_to_np(out["transforms"]))

        world_T_raw = np.concatenate(world_T_list, axis=0)

        mean_id = params["identity_coeffs"].float().mean(
            dim=(0, 1) if params["identity_coeffs"].ndim == 3 else (0,), keepdim=False
        )[None].to(device)
        mean_sc = params["scale_params"].float().mean(
            dim=(0, 1) if params["scale_params"].ndim == 3 else (0,), keepdim=False
        )[None].to(device)
        _, local56 = body_model.shape_spec.split_external_scale(mean_sc)
        runtime_sc60 = body_model.shape_spec.runtime_local_scale(local56)

        soma_layer = body_model.runtime
        with torch.inference_mode():
            soma_layer.prepare_identity(mean_id, runtime_sc60)

        bw = soma_layer._cached_bind_transforms_world
        if bw.ndim == 4:
            bw = bw[0]
        rs = soma_layer._cached_rest_shape
        if rs.ndim == 3:
            rs = rs[0]

        if hasattr(soma_layer, "public_rig_view"):
            pv = soma_layer.public_rig_view(bind_transforms_world=bw)
            joint_names = list(pv.joint_names)
            joint_parent_ids = _to_np(pv.joint_parent_ids).astype(np.int64)
            bind_world = _to_np(pv.bind_transforms_world)
            bind_local = _to_np(pv.bind_transforms_local)
            skinning_weights = _to_np(pv.skinning_weights)
        else:
            from soma.geometry.rig_utils import joint_world_to_local

            joint_names = list(soma_layer.rig_data["joint_names"])
            joint_parent_ids = _to_np(soma_layer.joint_parent_ids).astype(np.int64)
            bind_world = _to_np(bw)
            bind_local = _to_np(joint_world_to_local(bw, soma_layer.joint_parent_ids))
            skinning_weights = _to_np(soma_layer.skinning_weights)

        rest_shape = _to_np(rs)
        faces = _to_np(soma_layer.faces)
        J = len(joint_names)

        if J == world_T_raw.shape[1] + 1:
            root_eye = np.broadcast_to(np.eye(4, dtype=np.float32), (T, 1, 4, 4)).copy()
            world_T = np.concatenate([root_eye, world_T_raw], axis=1)
        else:
            world_T = world_T_raw
        root_joint_idx = joint_names.index("Hips") if "Hips" in joint_names else 0
        world_T_active77 = world_T[:, 1:, :, :] if (J == 78 and root_joint_idx == 1) else world_T

        local_T = np.zeros_like(world_T)
        for j in range(J):
            p = int(joint_parent_ids[j])
            if p < 0 or p == j:
                local_T[:, j] = world_T[:, j]
            else:
                local_T[:, j] = np.linalg.inv(world_T[:, p]) @ world_T[:, j]

        local_R = local_T[:, :, :3, :3]
        root_transl = local_T[:, root_joint_idx, :3, 3]

        usd_path = out_dir / f"{video_stem}_soma77.usd"
        save_soma_usd(
            usd_path,
            local_R,
            root_transl,
            joint_names=joint_names,
            joint_parent_ids=joint_parent_ids,
            bind_transforms_world=bind_world,
            bind_transforms_local=bind_local,
            rest_shape=rest_shape,
            faces=faces,
            skinning_weights=skinning_weights,
            unit="meters",
            fps=fps,
            root_joint_idx=root_joint_idx,
        )
        _append_log(job_id, f"已导出 USD: {usd_path.name}")

        # Export verified 77-joint BVH
        def write_bvh(bvh_path: Path, names, parents, bind_w, anim_w, fps_val: float, scale: float = 100.0):
            num_frames, num_joints = anim_w.shape[:2]
            children = {i: [] for i in range(num_joints)}
            roots = []
            for j, p in enumerate(parents):
                p = int(p)
                if p < 0 or p == j:
                    roots.append(j)
                else:
                    children[p].append(j)
            r_idx = roots[0]
            if r_idx == 0 and num_joints > 1 and np.allclose(anim_w[:, 0, :3, 3], 0.0) and not np.allclose(anim_w[:, 1, :3, 3], bind_w[1, :3, 3]):
                new_parents = [int(p) - 1 if (int(p) >= 1 and int(p) != j_orig) else -1 for j_orig, p in enumerate(parents[1:], start=1)]
                return write_bvh(bvh_path, names[1:], new_parents, bind_w[1:], anim_w[:, 1:], fps_val, scale=scale)

            bind_pos = bind_w[:, :3, 3] * scale
            offsets = np.zeros((num_joints, 3), dtype=np.float64)
            for j in range(num_joints):
                p = int(parents[j])
                if p >= 0 and p != j:
                    offsets[j] = bind_pos[j] - bind_pos[p]

            B_R = bind_w[:, :3, :3].astype(np.float64)
            W_R = anim_w[:, :, :3, :3].astype(np.float64)
            delta_W = np.einsum("tfij,fkj->tfik", W_R, B_R)
            R_bvh = np.zeros_like(delta_W)
            for j in range(num_joints):
                p = int(parents[j])
                if p < 0 or p == j:
                    R_bvh[:, j] = delta_W[:, j]
                else:
                    R_bvh[:, j] = np.einsum("tji,tjk->tik", delta_W[:, p], delta_W[:, j])

            order = []
            lines = ["HIERARCHY"]

            def emit_joint(j: int, depth: int):
                order.append(j)
                indent = "  " * depth
                clean_name = str(names[j]).replace(" ", "_")
                tag = "ROOT" if depth == 0 else "JOINT"
                lines.append(f"{indent}{tag} {clean_name}")
                lines.append(f"{indent}{{")
                ox, oy, oz = offsets[j]
                lines.append(f"{indent}  OFFSET {ox:.6f} {oy:.6f} {oz:.6f}")
                if depth == 0:
                    lines.append(f"{indent}  CHANNELS 6 Xposition Yposition Zposition Zrotation Yrotation Xrotation")
                else:
                    lines.append(f"{indent}  CHANNELS 3 Zrotation Yrotation Xrotation")
                if not children[j]:
                    lines.append(f"{indent}  End Site")
                    lines.append(f"{indent}  {{")
                    lines.append(f"{indent}    OFFSET 0.000000 2.000000 0.000000")
                    lines.append(f"{indent}  }}")
                else:
                    for c in children[j]:
                        emit_joint(c, depth + 1)
                lines.append(f"{indent}}}")

            emit_joint(r_idx, 0)
            euler_zyx = np.zeros((num_frames, num_joints, 3), dtype=np.float64)
            for j in range(num_joints):
                euler_zyx[:, j] = SciRot.from_matrix(R_bvh[:, j]).as_euler("ZYX", degrees=True)
            root_pos_anim = anim_w[:, r_idx, :3, 3].astype(np.float64) * scale

            lines.append("MOTION")
            lines.append(f"Frames: {num_frames}")
            lines.append(f"Frame Time: {1.0 / fps_val:.6f}")
            for f in range(num_frames):
                vals = []
                for idx_in_order, j in enumerate(order):
                    if idx_in_order == 0:
                        px, py, pz = root_pos_anim[f]
                        vals.extend([f"{px:.5f}", f"{py:.5f}", f"{pz:.5f}"])
                    rz, ry, rx = euler_zyx[f, j]
                    vals.extend([f"{rz:.5f}", f"{ry:.5f}", f"{rx:.5f}"])
                lines.append(" ".join(vals))
            bvh_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

            fk_pos = np.zeros((num_frames, num_joints, 3), dtype=np.float64)
            fk_rot = np.zeros((num_frames, num_joints, 3, 3), dtype=np.float64)
            for j in order:
                p = int(parents[j])
                r_mat = SciRot.from_euler("ZYX", euler_zyx[:, j], degrees=True).as_matrix()
                if p < 0 or p == j:
                    fk_rot[:, j] = r_mat
                    fk_pos[:, j] = root_pos_anim
                else:
                    fk_rot[:, j] = np.einsum("tij,tjk->tik", fk_rot[:, p], r_mat)
                    fk_pos[:, j] = fk_pos[:, p] + np.einsum("tij,j->ti", fk_rot[:, p], offsets[j])
            gt_pos = anim_w[:, :, :3, 3] * scale
            return float(np.linalg.norm(fk_pos - gt_pos, axis=-1).mean() * 10.0)

        bvh_path = out_dir / f"{video_stem}_soma77.bvh"
        err_mm = write_bvh(bvh_path, joint_names, joint_parent_ids, bind_world, world_T, fps, scale=100.0)
        _append_log(job_id, f"已导出 BVH: {bvh_path.name} (FK 误差 {err_mm:.3f} mm)")

        # Step 3: Render OpenCV 77-joint overlay & world preview
        _update_job(
            job_id,
            stage="render_preview",
            stageLabel="渲染 77 关节叠加（Overlay）与世界坐标（World）预览视频",
            progress=83,
        )
        incam_params = saved["pred_soma_params_incam"]
        incam_joints_list = []
        for start in range(0, T, 64):
            stop = min(start + 64, T)
            count = stop - start
            with torch.inference_mode(), torch.autocast(device, enabled=False):
                values = {}
                for name in ("body_pose", "global_orient", "transl"):
                    v = incam_params[name][:, start:stop]
                    values[name] = v.reshape(count, *v.shape[2:]).to(device=device, dtype=torch.float32)
                for name in ("identity_coeffs", "scale_params"):
                    v = incam_params[name]
                    v = v[:, None].expand(-1, count, -1) if v.ndim == 2 else v[:, start:stop]
                    values[name] = v.reshape(count, -1).to(device=device, dtype=torch.float32)
                out = body_model(**values, pose2rot=True, apply_correctives=False, repose_to_bind_pose=True)
                incam_joints_list.append(_to_np(out["joints"]))
        incam_joints = np.concatenate(incam_joints_list, axis=0)

        offset = 1 if J == 78 else 0
        edges = []
        for j in range(77):
            full_j = j + offset
            full_p = int(joint_parent_ids[full_j])
            if full_p >= offset and full_p != full_j:
                p = full_p - offset
                is_hand = any(k in joint_names[full_j].lower() for k in ("thumb", "index", "middle", "ring", "pinky", "hand", "finger"))
                edges.append((p, j, is_hand))

        def open_writer(path: Path, w: int, h: int, fps_v: float):
            return subprocess.Popen(
                [
                    "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", str(fps_v),
                    "-i", "pipe:0", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-crf", "20", "-movflags", "+faststart", str(path),
                ],
                stdin=subprocess.PIPE,
            )

        K_all = _to_np(saved["conditions"]["K_fullimg"])[0]
        norm_mp4 = render_dir / "_tmp_norm.mp4"
        src_meta = saved.get("video", {}).get("source", {})
        normalize_video(
            str(input_video),
            norm_mp4,
            start=src_meta.get("requested_start", 0.0),
            duration=src_meta.get("selected_duration", None),
        )
        with VideoFrames(norm_mp4) as frames:
            w, h = frames.width - (frames.width % 2), frames.height - (frames.height % 2)
            w_proc = open_writer(render_dir / "overlay.mp4", w, h, fps)
            for i in range(min(T, len(frames))):
                img = cv2.cvtColor(frames[i][:h, :w], cv2.COLOR_RGB2BGR)
                K = K_all[i]
                pts3d = incam_joints[i]
                z = np.clip(pts3d[:, 2], 0.1, None)
                u = np.clip(K[0, 0] * pts3d[:, 0] / z + K[0, 2], -4000, 4000).astype(int)
                v = np.clip(K[1, 1] * pts3d[:, 1] / z + K[1, 2], -4000, 4000).astype(int)
                for p, j, is_hand in edges:
                    cv2.line(img, (int(u[p]), int(v[p])), (int(u[j]), int(v[j])), (0, 220, 255) if is_hand else (40, 230, 80), 1 if is_hand else 2, cv2.LINE_AA)
                for j in range(77):
                    is_hand = any(k in joint_names[j + offset].lower() for k in ("thumb", "index", "middle", "ring", "pinky"))
                    cv2.circle(img, (int(u[j]), int(v[j])), 2 if is_hand else 3, (0, 140, 255) if is_hand else (255, 255, 255), -1)
                cv2.putText(img, f"GEM-X 77-Joint Overlay | {i / fps:.2f}s", (16, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (20, 20, 20), 3, cv2.LINE_AA)
                cv2.putText(img, f"GEM-X 77-Joint Overlay | {i / fps:.2f}s", (16, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (245, 245, 245), 1, cv2.LINE_AA)
                w_proc.stdin.write(img.tobytes())
            w_proc.stdin.close()
            w_proc.wait()
        norm_mp4.unlink(missing_ok=True)

        wj = world_T_active77[:, :, :3, 3].copy()
        wj[:, :, 1] -= float(wj[:, :, 1].min())
        center = np.array([wj[:, 0, 0].mean(), 0.85, wj[:, 0, 2].mean()])
        cam_pos = center + np.array([2.2, 1.35, 2.6])
        fwd = center - cam_pos
        fwd /= np.linalg.norm(fwd)
        right = np.cross(fwd, np.array([0.0, 1.0, 0.0]))
        right /= np.linalg.norm(right)
        down = np.cross(fwd, right)
        R_cam = np.stack([right, down, fwd], axis=0)
        W_w, H_w, focal = 960, 720, 820.0

        def proj(p3):
            c = (p3 - cam_pos) @ R_cam.T
            z = np.clip(c[..., 2], 0.1, None)
            px = np.clip(focal * c[..., 0] / z + W_w * 0.5, -4000, 4000).astype(int)
            py = np.clip(focal * c[..., 1] / z + H_w * 0.5, -4000, 4000).astype(int)
            return px, py

        pw = open_writer(render_dir / "world.mp4", W_w, H_w, fps)
        grid_vals = np.linspace(-2.5, 2.5, 11)
        for i in range(T):
            canvas = np.full((H_w, W_w, 3), (28, 32, 38), dtype=np.uint8)
            for g in grid_vals:
                gx, gy = proj(np.array([[center[0] + g, 0.0, center[2] - 2.5], [center[0] + g, 0.0, center[2] + 2.5]]))
                cv2.line(canvas, (int(gx[0]), int(gy[0])), (int(gx[1]), int(gy[1])), (60, 66, 76), 1, cv2.LINE_AA)
                gx, gy = proj(np.array([[center[0] - 2.5, 0.0, center[2] + g], [center[0] + 2.5, 0.0, center[2] + g]]))
                cv2.line(canvas, (int(gx[0]), int(gy[0])), (int(gx[1]), int(gy[1])), (60, 66, 76), 1, cv2.LINE_AA)
            traj = wj[: i + 1, 0].copy()
            traj[:, 1] = 0.01
            tx, ty = proj(traj)
            for k in range(1, len(tx)):
                cv2.line(canvas, (int(tx[k - 1]), int(ty[k - 1])), (int(tx[k]), int(ty[k])), (0, 180, 255), 2, cv2.LINE_AA)
            ux, uy = proj(wj[i])
            for p, j, is_hand in edges:
                cv2.line(canvas, (int(ux[p]), int(uy[p])), (int(ux[j]), int(uy[j])), (0, 220, 255) if is_hand else (90, 240, 140), 2 if is_hand else 3, cv2.LINE_AA)
            for j in range(77):
                cv2.circle(canvas, (int(ux[j]), int(uy[j])), 2, (255, 255, 255), -1)
            cv2.putText(canvas, f"GEM-X 77-Joint World 3D | {i / fps:.2f}s", (20, 34), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (240, 240, 240), 2, cv2.LINE_AA)
            pw.stdin.write(canvas.tobytes())
        pw.stdin.close()
        pw.wait()

        # Step 4: Headless Blender 4.2 USD -> FBX & GLB
        if export_fbx_glb:
            _update_job(
                job_id,
                stage="blender_export",
                stageLabel="无头 Blender 4.2 烘焙导出带蒙皮 FBX 与 GLB",
                progress=91,
            )
            fbx_path = out_dir / f"{video_stem}_soma77.fbx"
            glb_path = out_dir / f"{video_stem}_soma77.glb"
            conv_script = Path("/tmp/convert_soma_usd.py")
            conv_script.write_text(
                """
import sys, bpy
argv = sys.argv[sys.argv.index("--") + 1:]
usd_in, fbx_out, glb_out, fps_str, frame_end_str = argv
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = int(round(float(fps_str)))
bpy.context.scene.frame_start = 0
bpy.context.scene.frame_end = int(frame_end_str)
bpy.ops.wm.usd_import(filepath=usd_in, import_skeletons=True, import_blendshapes=True, import_meshes=True, set_frame_range=True)
bpy.ops.export_scene.fbx(filepath=fbx_out, use_selection=False, bake_anim=True, bake_anim_use_all_bones=True, bake_anim_use_nla_strips=False, bake_anim_use_all_actions=False, add_leaf_bones=False, path_mode='AUTO')
bpy.ops.export_scene.gltf(filepath=glb_out, export_format='GLB', export_animations=True, export_skins=True, export_yup=True)
""",
                encoding="utf-8",
            )
            subprocess.run(
                [
                    "/opt/blender/blender",
                    "--background",
                    "--python",
                    str(conv_script),
                    "--",
                    str(usd_path),
                    str(fbx_path),
                    str(glb_path),
                    str(fps),
                    str(T - 1),
                ],
                check=True,
            )
            _append_log(job_id, f"已导出 FBX & GLB: {fbx_path.name}, {glb_path.name}")

        files_info = {}
        for p in sorted(out_dir.rglob("*")):
            if p.is_file():
                rel = p.relative_to(out_dir).as_posix()
                files_info[rel] = p.stat().st_size

        summary = {
            "video": input_video.name,
            "frames": T,
            "fps": fps,
            "joints": J,
            "bvh_fk_error_mm": round(err_mm, 4),
            "elapsed_sec": round(time.time() - t0, 2),
            "files_bytes": files_info,
        }
        (out_dir / "run_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        data_vol.commit()

        final_telem = _sample_hardware_telemetry()
        _update_job(
            job_id,
            status="succeeded",
            stage="done",
            stageLabel="完成（GPU 将在 60s 无新任务后自动释放）",
            progress=100,
            finishedAt=time.time(),
            summary=summary,
            telemetry=final_telem,
            containerState="cooling_down",
        )
        _append_log(job_id, f"全部完成！总耗时 {summary['elapsed_sec']}s")
        return summary

    except Exception as exc:
        _append_log(job_id, f"ERROR: {exc}")
        _update_job(
            job_id,
            status="failed",
            stage="error",
            stageLabel=f"失败: {exc}",
            error=str(exc),
            finishedAt=time.time(),
            containerState="idle",
        )
        raise
    finally:
        stop_telem.set()


@app.function(
    image=api_image,
    volumes={"/data": data_vol},
    scaledown_window=60,
    min_containers=0,
)
@modal.asgi_app()
def web_api():
    from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse

    api = FastAPI(title="GEM-X Serverless MoCap Gateway")
    api.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    required_token = os.environ.get("MOTION_API_TOKEN", "").strip()

    def check_auth(authorization: str | None):
        if not required_token:
            return
        if not authorization or authorization != f"Bearer {required_token}":
            raise HTTPException(status_code=401, detail="Invalid or missing Bearer token")

    @api.get("/health")
    def health():
        active = 0
        try:
            for k in job_store.keys():
                item = job_store.get(k)
                if isinstance(item, dict) and item.get("status") in ("queued", "running"):
                    active += 1
        except Exception:
            pass
        return {
            "ok": True,
            "service": APP_NAME,
            "gpuSpec": "Modal Serverless (L4→A10G→L40S→A100-40GB, 60s自动停表)",
            "activeJobs": active,
            "serverTime": time.time(),
        }

    @api.post("/jobs")
    async def create_job(
        video: UploadFile = File(...),
        cameraMode: str = Form("static"),
        useContactIk: bool = Form(True),
        exportFbxAndGlb: bool = Form(True),
        clipStartSec: float = Form(0.0),
        clipDurationSec: float = Form(0.0),
        authorization: str | None = Header(default=None),
    ):
        check_auth(authorization)
        job_id = f"mocap_{time.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        job_dir = JOBS_DIR / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        safe_name = Path(video.filename or "input.mp4").name
        dst = job_dir / safe_name
        content = await video.read()
        dst.write_bytes(content)
        data_vol.commit()

        options = {
            "inputFilename": safe_name,
            "cameraMode": cameraMode,
            "useContactIk": useContactIk,
            "exportFbxAndGlb": exportFbxAndGlb,
            "clipStartSec": clipStartSec,
            "clipDurationSec": clipDurationSec,
        }
        job_store[job_id] = {
            "jobId": job_id,
            "status": "queued",
            "stage": "queued",
            "stageLabel": "排队中（正在按需冷启 L4 GPU 容器，约 10–25 秒）",
            "progress": 3,
            "createdAt": time.time(),
            "updatedAt": time.time(),
            "options": options,
            "logs": [f"[{time.strftime('%H:%M:%S')}] 已接收视频 {safe_name} ({len(content)/1e6:.2f} MB)，正在唤起 L4 GPU..."],
            "telemetry": None,
            "containerState": "starting_gpu",
        }
        run_gemx_gpu.spawn(job_id, options)
        return {"ok": True, "jobId": job_id, "status": "queued"}

    @api.get("/jobs")
    def list_jobs(authorization: str | None = Header(default=None)):
        check_auth(authorization)
        items = []
        for k in job_store.keys():
            v = job_store.get(k)
            if isinstance(v, dict) and v.get("jobId"):
                items.append(v)
        items.sort(key=lambda x: x.get("createdAt", 0), reverse=True)
        return {"ok": True, "items": items[:30]}

    @api.get("/jobs/{job_id}")
    def get_job(job_id: str, authorization: str | None = Header(default=None)):
        check_auth(authorization)
        item = job_store.get(job_id)
        if not item:
            raise HTTPException(status_code=404, detail="Job not found")
        return {"ok": True, "job": item}

    @api.get("/jobs/{job_id}/files/{rel_path:path}")
    def download_job_file(job_id: str, rel_path: str, authorization: str | None = Header(default=None)):
        check_auth(authorization)
        data_vol.reload()
        base = (JOBS_DIR / job_id / "outputs").resolve()
        target = (base / rel_path).resolve()
        if not str(target).startswith(str(base)) or not target.is_file():
            raise HTTPException(status_code=404, detail="File not found")
        return FileResponse(str(target), filename=target.name)

    return api
