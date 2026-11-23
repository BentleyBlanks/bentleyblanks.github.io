"""Remote NVIDIA GEM-X (Native77, 77 joints incl. fingers) + SOMA-X v0.3.3 runner
executed on Google Colab via `colab exec -f`.

Uses the exact battle-tested `gem-infer motion-video` + SOMA-X v0.3.3 + Blender 4.2.9 LTS
pipeline and emits structured stdout markers parsed by MotionWorkbench:
  [PROGRESS] <0-100>|<stage label>
  [TELEMETRY] <json>
  [DONE] <output_zip_path>
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import zipfile
from pathlib import Path

INPUT_MP4 = Path(os.environ.get("GEMX_INPUT_MP4", "/content/mw_input.mp4"))
OUTPUT_ZIP = Path(os.environ.get("GEMX_OUTPUT_ZIP", "/content/mw_output.zip"))
STEM = os.environ.get("GEMX_STEM", INPUT_MP4.stem)
PRECISION = os.environ.get("GEMX_PRECISION", "standard_l4")

WORK_ROOT = Path("/content/mw_gemx_work")
GEMX_DIR = Path("/content/GEM-X")
CACHE_ROOT = Path("/content/gemx_cache")
WEIGHTS_DIR = CACHE_ROOT / "weights"
SOMA_ASSETS_DIR = CACHE_ROOT / "soma"
BLENDER_DIR = Path("/content/blender")
BLENDER_BIN = BLENDER_DIR / "blender"
ENV_MARKER = Path("/content/.mw_gemx_ready_v6")


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


def run_cmd(cmd, cwd=None, check=True, on_line=None):
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
        if on_line:
            on_line(line)
    rc = proc.wait()
    if check and rc != 0:
        raise RuntimeError(f"Command failed (rc={rc}): {cmd}")
    return rc


def ensure_environment():
    if ENV_MARKER.exists() and GEMX_DIR.exists() and BLENDER_BIN.exists() and shutil.which("gem-infer"):
        emit_progress(32, "复用热机 GEM-X + SOMA-X + Blender 环境")
        emit_telemetry()
        return

    emit_progress(22, "首次冷启：拉取 NVlabs/GEM-X 仓库…")
    emit_telemetry()
    if not GEMX_DIR.exists():
        run_cmd(["git", "clone", "--depth", "1", "https://github.com/NVlabs/GEM-X.git", str(GEMX_DIR)])

    emit_progress(26, "安装 GEM-X[video] 与 SOMA-X v0.3.3 依赖…")
    emit_telemetry()
    run_cmd([sys.executable, "-m", "pip", "install", "-q", "--no-cache-dir", "huggingface_hub>=0.28", "usd-core", "scipy"])
    run_cmd([sys.executable, "-m", "pip", "install", "-q", "--no-cache-dir", "-e", f"{GEMX_DIR}[video]"], cwd=str(GEMX_DIR))
    run_cmd([sys.executable, "-m", "pip", "install", "-q", "--no-cache-dir", "py-soma-x==0.3.3"])

    if not BLENDER_BIN.exists():
        emit_progress(30, "安装无头 Blender 4.2.9 LTS（用于导出 GLB / FBX）…")
        BLENDER_DIR.mkdir(parents=True, exist_ok=True)
        tar_path = Path("/tmp/blender-4.2.9.tar.xz")
        run_cmd(
            [
                "curl",
                "-fsSL",
                "https://download.blender.org/release/Blender4.2/blender-4.2.9-linux-x64.tar.xz",
                "-o",
                str(tar_path),
            ]
        )
        run_cmd(["tar", "-xf", str(tar_path), "-C", str(BLENDER_DIR), "--strip-components=1"])
        tar_path.unlink(missing_ok=True)

    ENV_MARKER.write_text("ready_v6\n", encoding="utf-8")
    emit_progress(34, "GEM-X 运行环境就绪")
    emit_telemetry()


def ensure_weights():
    from huggingface_hub import hf_hub_download

    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    SOMA_ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    emit_progress(36, "校验/下载 GEM-X Native77 与 SOMA-X v0.3.3 权重…")
    emit_telemetry()

    def ensure_hf(repo_id: str, filename: str, local_dir: Path, revision: str | None = None):
        target = local_dir / filename
        if target.exists() and target.stat().st_size > 0:
            return
        print(f"[GEM-X] 下载权重 {repo_id}/{filename}", flush=True)
        hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            revision=revision,
            local_dir=str(local_dir),
        )

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
        print("[GEM-X] 下载 YOLOX-X HumanArt 人物检测器…", flush=True)
        zip_path = Path("/tmp/yolox_humanart.zip")
        url = "https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/yolox_x_8xb8-300e_humanart-a39d44ed.zip"
        urllib.request.urlretrieve(url, zip_path)
        with zipfile.ZipFile(zip_path) as archive:
            member = next(name for name in archive.namelist() if name.endswith("/end2end.onnx"))
            with archive.open(member) as src, yolox_onnx.open("wb") as dst:
                shutil.copyfileobj(src, dst)
        zip_path.unlink(missing_ok=True)

    for link_path, target_path in [
        (GEMX_DIR / "weights", WEIGHTS_DIR),
        (GEMX_DIR / "assets" / "soma", SOMA_ASSETS_DIR),
    ]:
        link_path.parent.mkdir(parents=True, exist_ok=True)
        if link_path.is_symlink():
            link_path.unlink()
        elif link_path.exists():
            shutil.rmtree(link_path)
        link_path.symlink_to(target_path)


def _to_np(x):
    import numpy as np
    import torch

    if isinstance(x, torch.Tensor):
        return x.detach().cpu().numpy()
    return np.asarray(x)


def write_bvh(bvh_path: Path, names, parents, bind_w, anim_w, fps_val: float, scale: float = 100.0):
    import numpy as np
    from scipy.spatial.transform import Rotation as SciRot

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
    if (
        r_idx == 0
        and num_joints > 1
        and np.allclose(anim_w[:, 0, :3, 3], 0.0)
        and not np.allclose(anim_w[:, 1, :3, 3], bind_w[1, :3, 3])
    ):
        new_parents = [
            int(p) - 1 if (int(p) >= 1 and int(p) != j_orig) else -1
            for j_orig, p in enumerate(parents[1:], start=1)
        ]
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


def run_pipeline(out_dir: Path):
    import cv2
    import numpy as np
    import torch

    from gem.inference.timing import prediction_fps
    from gem.inference.video import VideoFrames, normalize_video
    from gem.motion.geometry import MotionGeometry
    from soma.io import save_soma_usd

    t0 = time.time()
    render_dir = out_dir / "render"
    render_dir.mkdir(parents=True, exist_ok=True)
    motion_pt = out_dir / "motion.pt"

    # Step 1: GEM-X Native77 inference
    emit_progress(42, "运行 NVIDIA GEM-X Native77（77 关节全身 + 十指重建）…")
    emit_telemetry()

    gem_infer_bin = shutil.which("gem-infer") or str(Path(sys.executable).parent / "gem-infer")
    cmd = [
        gem_infer_bin,
        "motion-video",
        "--task",
        "body",
        "--input",
        str(INPUT_MP4),
        "--config",
        str(WEIGHTS_DIR / "body_video_native77.yaml"),
        "--camera-mode",
        "static",
        "--device",
        "cuda",
        "--soma-assets",
        str(SOMA_ASSETS_DIR),
        "--output",
        str(motion_pt),
        "--postprocess",
    ]

    def on_infer_line(line: str):
        low = line.lower()
        if "detect" in low or "track" in low:
            emit_progress(48, "YOLOX 人物检测与追踪…")
        elif "vitpose" in low or "keypoint" in low:
            emit_progress(56, "DINOv3-Huge ViTPose77（含十指关键点）…")
        elif "motion" in low or "forward" in low:
            emit_progress(64, "12 层时序运动 Transformer 求解…")
        elif "contact" in low or "ik" in low:
            emit_progress(70, "Contact/IK 脚底锁地防滑步…")

    run_cmd(cmd, cwd=str(GEMX_DIR), on_line=on_infer_line)

    # Step 2: Export SOMA-77 USD + BVH
    emit_progress(74, "提取 77 关节旋转与位移，导出 USD / BVH…")
    emit_telemetry()

    saved = torch.load(motion_pt, map_location="cpu", weights_only=False)
    params = saved["pred_soma_params_global"]
    fps = float(prediction_fps(saved))
    T = int(params["body_pose"].shape[1])

    device = "cuda" if torch.cuda.is_available() else "cpu"
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

    usd_path = out_dir / f"{STEM}_soma77.usd"
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

    bvh_path = out_dir / f"{STEM}_soma77.bvh"
    err_mm = write_bvh(bvh_path, joint_names, joint_parent_ids, bind_world, world_T, fps, scale=100.0)
    print(f"[GEM-X] 已导出 USD & BVH (FK 误差 {err_mm:.3f} mm)", flush=True)

    # Step 3: Render 77-joint Overlay & World 3D MP4
    emit_progress(80, "渲染 77 关节叠加（Overlay）与世界坐标（World）视频…")
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
        str(INPUT_MP4),
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
    emit_progress(86, "无头 Blender 4.2 烘焙导出带蒙皮 FBX 与 GLB…")
    fbx_path = out_dir / f"{STEM}_soma77.fbx"
    glb_path = out_dir / f"{STEM}_soma77.glb"
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
    run_cmd(
        [
            str(BLENDER_BIN),
            "--background",
            "--python",
            str(conv_script),
            "--",
            str(usd_path),
            str(fbx_path),
            str(glb_path),
            str(fps),
            str(T - 1),
        ]
    )

    # Remove intermediate motion.pt so output zip stays compact
    motion_pt.unlink(missing_ok=True)

    summary = {
        "video": INPUT_MP4.name,
        "frames": T,
        "fps": round(fps, 3),
        "joints": J,
        "bvh_fk_error_mm": round(err_mm, 4),
        "elapsed_sec": round(time.time() - t0, 2),
        "files_bytes": {
            fp.relative_to(out_dir).as_posix(): fp.stat().st_size
            for fp in sorted(out_dir.rglob("*"))
            if fp.is_file()
        },
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")


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
        emit_progress(20, f"已接入 Colab GPU（{PRECISION}），检查 GEM-X 环境…")
        ensure_environment()
        ensure_weights()

        out_dir = WORK_ROOT / STEM
        if out_dir.exists():
            shutil.rmtree(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        run_pipeline(out_dir)

        emit_progress(90, "打包 GLB / FBX / BVH / USD 与预览视频…")
        if OUTPUT_ZIP.exists():
            OUTPUT_ZIP.unlink()
        with zipfile.ZipFile(OUTPUT_ZIP, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for fp in sorted(out_dir.rglob("*")):
                if fp.is_file():
                    zf.write(fp, fp.relative_to(out_dir).as_posix())

        size_mb = OUTPUT_ZIP.stat().st_size / (1024 * 1024)
        emit_progress(93, f"云端打包完成（{size_mb:.1f} MB），准备回传本地…")
        emit_telemetry()
        print(f"[DONE] {OUTPUT_ZIP}", flush=True)
    finally:
        stop_evt.set()
        t.join(timeout=1.0)


if __name__ == "__main__":
    main()
