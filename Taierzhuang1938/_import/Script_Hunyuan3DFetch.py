# -*- coding: utf-8 -*-
"""Direct client for Tencent Cloud 混元生3D (ai3d), bypassing WorkBuddy entirely.

Credentials come from the environment and are never written to disk or printed:

    TENCENTCLOUD_SECRET_ID      # 控制台 > 访问管理 > API 密钥管理
    TENCENTCLOUD_SECRET_KEY

Every submit prints its credit cost before spending anything, and `--dry-run`
stops after printing.  Results land in Source/Hunyuan3D/<slug>/ next to a
Meta.json recording the job id, request body and cost, so a generated asset
stays traceable the same way the Poly Haven / Sketchfab fetchers are.

Usage:
    # 额度自检：不花积分，只确认密钥和服务开通状态
    python Script_Hunyuan3DFetch.py check

    # 图生3D（本地图片直接走 Base64，不需要图床）
    python Script_Hunyuan3DFetch.py gen --slug lantern --image ref.png --pbr

    # 文生3D 白模（最便宜的一档）
    python Script_Hunyuan3DFetch.py gen --slug vase --prompt "青花瓷花瓶" --geometry

    # 绑骨蒙皮（模型必须 A-Pose/T-Pose，且不带武器配件）
    python Script_Hunyuan3DFetch.py rig --slug soldier --file body.glb --motion 3

    # 文生动作
    python Script_Hunyuan3DFetch.py motion --slug walk --prompt "A person walks forward" --duration 5

    # 断线续跑 / 手工查询
    python Script_Hunyuan3DFetch.py status <job_id> --type pro

    # 任意接口逃生舱：字段结构以控制台 API Explorer 为准时用这个
    python Script_Hunyuan3DFetch.py raw SubmitReduceFaceJob --body '{"...": "..."}'
"""

from __future__ import annotations

import argparse
import base64
import datetime
import hashlib
import hmac
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

HOST = "ai3d.tencentcloudapi.com"
SERVICE = "ai3d"
VERSION = "2025-05-13"
REGION = "ap-guangzhou"
ROOT = Path(__file__).resolve().parent / "Source" / "Hunyuan3D"

# 积分消耗，抄自官方计费页；后付费 0.12 元/积分，1000 积分资源包 0.1 元/积分。
# 只用来在提交前把账算给人看，服务端才是权威。
COST_BASE = {
    "Normal": 20,
    "LowPoly": 25,
    "Geometry": 15,
    "Sketch": 25,
}
COST_EXTRA = {
    "MultiViewImages": 10,
    "EnablePBR": 10,
    "FaceCount": 10,
    "ResultFormat": 5,
}
COST_ACTION = {
    "SubmitAutoRiggingJob": 10,
    "SubmitHunyuanTo3DMotionJob": 10,
    "SubmitReduceFaceJob": 50,
    "SubmitTextureTo3DJob": 30,
    "SubmitProfileTo3DJob": 30,
    "SubmitHunyuan3DPartJob": 30,
    "SubmitHunyuanTo3DUVJob": 10,
    "Convert3DFormat": 5,
    "SubmitHunyuanTo3DRapidJob": 15,
}

# Submit -> Query 的配对。文档里两种动词都有（Query* 和 Describe*），别记混。
QUERY_ACTION = {
    "pro": ("SubmitHunyuanTo3DProJob", "QueryHunyuanTo3DProJob"),
    "rapid": ("SubmitHunyuanTo3DRapidJob", "QueryHunyuanTo3DRapidJob"),
    "rig": ("SubmitAutoRiggingJob", "DescribeAutoRiggingJob"),
    "motion": ("SubmitHunyuanTo3DMotionJob", "DescribeHunyuanTo3DMotionJob"),
    "reduce": ("SubmitReduceFaceJob", "DescribeReduceFaceJob"),
    "uv": ("SubmitHunyuanTo3DUVJob", "DescribeHunyuanTo3DUVJob"),
    "texture": ("SubmitTextureTo3DJob", "DescribeTextureTo3DJob"),
    "profile": ("SubmitProfileTo3DJob", "DescribeProfileTo3DJob"),
    "part": ("SubmitHunyuan3DPartJob", "QueryHunyuan3DPartJob"),
}

STATUS_CODE = {1: "QUEUED", 2: "PROCESSING", 4: "FAIL", 5: "DONE"}
ASSET_SUFFIX = (".glb", ".gltf", ".obj", ".fbx", ".stl", ".usdz", ".zip", ".mtl",
                ".png", ".jpg", ".jpeg", ".webp")


# ---------------------------------------------------------------------------
# 签名（TC3-HMAC-SHA256）
# ---------------------------------------------------------------------------

def Credentials() -> tuple[str, str]:
    secret_id = os.environ.get("TENCENTCLOUD_SECRET_ID", "").strip()
    secret_key = os.environ.get("TENCENTCLOUD_SECRET_KEY", "").strip()
    if not secret_id or not secret_key:
        raise SystemExit(
            "缺少密钥。请先设置环境变量 TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY\n"
            "  PowerShell:  $env:TENCENTCLOUD_SECRET_ID = 'AKID...'\n"
            "  Git Bash:    export TENCENTCLOUD_SECRET_ID=AKID...\n"
            "密钥在 控制台 > 访问管理 > API 密钥管理 创建。"
        )
    return secret_id, secret_key


def Sign(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def AuthHeaders(action: str, payload: str) -> dict:
    secret_id, secret_key = Credentials()
    timestamp = int(time.time())
    date = datetime.datetime.fromtimestamp(
        timestamp, tz=datetime.timezone.utc
    ).strftime("%Y-%m-%d")

    content_type = "application/json; charset=utf-8"
    signed_headers = "content-type;host;x-tc-action"
    canonical_headers = (
        f"content-type:{content_type}\n"
        f"host:{HOST}\n"
        f"x-tc-action:{action.lower()}\n"
    )
    canonical_request = "\n".join([
        "POST",
        "/",
        "",
        canonical_headers,
        signed_headers,
        hashlib.sha256(payload.encode("utf-8")).hexdigest(),
    ])

    scope = f"{date}/{SERVICE}/tc3_request"
    string_to_sign = "\n".join([
        "TC3-HMAC-SHA256",
        str(timestamp),
        scope,
        hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
    ])

    secret_date = Sign(("TC3" + secret_key).encode("utf-8"), date)
    secret_service = Sign(secret_date, SERVICE)
    secret_signing = Sign(secret_service, "tc3_request")
    signature = hmac.new(
        secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256
    ).hexdigest()

    return {
        "Authorization": (
            f"TC3-HMAC-SHA256 Credential={secret_id}/{scope}, "
            f"SignedHeaders={signed_headers}, Signature={signature}"
        ),
        "Content-Type": content_type,
        "Host": HOST,
        "X-TC-Action": action,
        "X-TC-Version": VERSION,
        "X-TC-Region": REGION,
        "X-TC-Timestamp": str(timestamp),
    }


def Call(action: str, body: dict) -> dict:
    payload = json.dumps(body, ensure_ascii=False)
    request = Request(
        f"https://{HOST}",
        data=payload.encode("utf-8"),
        headers=AuthHeaders(action, payload),
        method="POST",
    )
    try:
        with urlopen(request, timeout=180) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", "replace")
        raise SystemExit(f"HTTP {error.code} from {action}: {detail}")

    inner = result.get("Response", result)
    if "Error" in inner:
        code = inner["Error"].get("Code", "")
        message = inner["Error"].get("Message", "")
        hint = ""
        if code.startswith("AuthFailure"):
            hint = "\n提示：密钥不对，或该子账号没有 ai3d 权限。"
        elif "ResourcePack" in code or "Balance" in code or "Charge" in code:
            hint = "\n提示：免费积分用尽后不会自动转后付费，需在 控制台 > 设置 > 后付费设置 里主动开通。"
        elif code == "UnauthorizedOperation":
            hint = "\n提示：服务可能还没开通，先去控制台开通「腾讯混元生3D」。"
        raise SystemExit(f"{action} 失败 [{code}] {message}{hint}")
    return inner


# ---------------------------------------------------------------------------
# 计费预览
# ---------------------------------------------------------------------------

def EstimateCost(action: str, body: dict) -> int:
    if action == "SubmitHunyuanTo3DProJob":
        credits = COST_BASE.get(body.get("GenerateType", "Normal"), 20)
        for field, extra in COST_EXTRA.items():
            if field in body:
                credits += extra
        return credits
    credits = COST_ACTION.get(action, 0)
    if action == "SubmitHunyuanTo3DRapidJob" and body.get("EnablePBR"):
        credits += 10
    return credits


def ReportCost(action: str, body: dict) -> int:
    credits = EstimateCost(action, body)
    if not credits:
        print(f"[cost] {action} 消耗未知，以账单为准", file=sys.stderr)
        return 0
    print(
        f"[cost] {action} 预计 {credits} 积分"
        f"（后付费 ≈{credits * 0.12:.2f} 元 / 资源包 ≈{credits * 0.10:.2f} 元）",
        file=sys.stderr,
    )
    return credits


# ---------------------------------------------------------------------------
# 轮询与下载
# ---------------------------------------------------------------------------

def JobStatus(result: dict) -> str:
    if "Status" in result:
        return str(result["Status"]).upper()
    code = result.get("JobStatusCode")
    if code is None:
        return "UNKNOWN"
    try:
        return STATUS_CODE.get(int(code), str(code))
    except (TypeError, ValueError):
        return str(code)


def Poll(query_action: str, job_id: str, interval: int, budget: int) -> dict:
    """轮询到终态。字段名各接口不完全一致，所以只认状态语义不认具体字段。"""
    deadline = time.time() + budget
    while True:
        result = Call(query_action, {"JobId": job_id})
        status = JobStatus(result)
        if status in ("DONE", "SUCCESS", "SUCCEED", "FINISH", "FINISHED"):
            return result
        if status in ("FAIL", "FAILED", "ERROR"):
            message = result.get("ErrorMessage") or result.get("Message") or ""
            raise SystemExit(f"任务 {job_id} 失败：{status} {message}".strip())
        if time.time() >= deadline:
            raise SystemExit(
                f"任务 {job_id} 在 {budget}s 内没跑完（当前 {status}）。\n"
                f"任务还在服务端跑，稍后用以下命令续查，不要重新提交：\n"
                f"  python {Path(__file__).name} status {job_id} --type <type>"
            )
        print(f"[poll] {status} … {int(deadline - time.time())}s 剩余", file=sys.stderr)
        time.sleep(interval)


def HarvestUrls(node, found: list) -> list:
    """递归捞产物 URL。

    各接口的产物字段名不统一（ResultFile3Ds / File3Ds / ResultUrl …），与其猜
    字段名不如认扩展名——新增接口时这里不用改。
    """
    if isinstance(node, str):
        if re.match(r"^https?://", node):
            clean = node.split("?", 1)[0].lower()
            if clean.endswith(ASSET_SUFFIX):
                found.append(node)
    elif isinstance(node, dict):
        for value in node.values():
            HarvestUrls(value, found)
    elif isinstance(node, list):
        for value in node:
            HarvestUrls(value, found)
    return found


def Download(url: str, target: Path) -> None:
    request = Request(url, headers={"User-Agent": "Taierzhuang1938AssetPipeline/1.0"})
    with urlopen(request, timeout=600) as response:
        target.write_bytes(response.read())
    print(f"[save] {target}  ({target.stat().st_size / 1048576:.1f} MB)", file=sys.stderr)


def SaveResult(slug: str, action: str, body: dict, job_id: str,
               credits: int, result: dict) -> Path:
    outdir = ROOT / slug
    outdir.mkdir(parents=True, exist_ok=True)

    urls, seen = [], set()
    for url in HarvestUrls(result, []):
        if url not in seen:
            seen.add(url)
            urls.append(url)

    saved = []
    for index, url in enumerate(urls):
        suffix = Path(url.split("?", 1)[0]).suffix.lower() or ".bin"
        name = f"{slug}{suffix}" if len(urls) == 1 else f"{slug}_{index}{suffix}"
        Download(url, outdir / name)
        saved.append({"file": name, "url": url})

    # Prompt/图片可能含创作意图，留档；Base64 太大只记长度。
    recorded = dict(body)
    for field in ("ImageBase64", "FileBase64", "Base64"):
        if field in recorded:
            recorded[field] = f"<base64 {len(recorded[field])} chars>"

    meta = {
        "source": "腾讯混元生3D (ai3d)",
        "action": action,
        "version": VERSION,
        "jobId": job_id,
        "creditsEstimated": credits,
        "requestBody": recorded,
        "files": saved,
        "fetchedAt": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "license": "腾讯云生成内容，商用条款以腾讯云服务协议为准",
    }
    (outdir / "Meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    if not saved:
        print("[warn] 没识别出产物 URL，原始响应已写进 Meta.json 的 rawResult", file=sys.stderr)
        meta["rawResult"] = result
        (outdir / "Meta.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    return outdir


def Run(action: str, body: dict, slug: str, args) -> None:
    credits = ReportCost(action, body)
    if args.dry_run:
        print(json.dumps({"Action": action, "Body": body}, ensure_ascii=False, indent=2))
        return

    submit = Call(action, body)
    job_id = submit.get("JobId")
    if not job_id:
        print(json.dumps(submit, ensure_ascii=False, indent=2))
        return
    print(f"[job] {job_id}", file=sys.stderr)

    kind = next((k for k, (s, _) in QUERY_ACTION.items() if s == action), None)
    if args.no_poll or kind is None:
        print(json.dumps({"job_id": job_id, "type": kind}, ensure_ascii=False))
        return

    result = Poll(QUERY_ACTION[kind][1], job_id, args.poll_interval, args.max_wait)
    outdir = SaveResult(slug, action, body, job_id, credits, result)
    print(json.dumps({"job_id": job_id, "dir": str(outdir)}, ensure_ascii=False))


# ---------------------------------------------------------------------------
# 子命令
# ---------------------------------------------------------------------------

def ReadImageBase64(path: Path) -> str:
    data = path.read_bytes()
    if len(data) > 6 * 1024 * 1024:
        raise SystemExit(f"{path} 有 {len(data) / 1048576:.1f} MB，Base64 上限 6MB（用 --image-url 走 URL）")
    return base64.b64encode(data).decode("ascii")


def CmdCheck(args) -> None:
    """不花积分的连通性自检：故意打一个必然被参数校验拦下的请求。

    能走到「参数错误」说明签名、开通状态、网络都是通的；停在鉴权错误说明密钥或
    权限有问题。任务没被创建，所以不计费。
    """
    Credentials()
    print("[check] 密钥已从环境变量读到（不回显）", file=sys.stderr)
    try:
        Call("QueryHunyuanTo3DProJob", {"JobId": "connectivity-probe"})
        print("[check] 通了", file=sys.stderr)
    except SystemExit as error:
        text = str(error)
        if "AuthFailure" in text or "UnauthorizedOperation" in text:
            raise
        print(f"[check] 签名与服务开通正常（服务端按预期拒绝了探测任务）\n        {text}",
              file=sys.stderr)


def CmdGen(args) -> None:
    body: dict = {}
    if args.prompt:
        body["Prompt"] = args.prompt
    if args.image:
        body["ImageBase64"] = ReadImageBase64(Path(args.image))
    if args.image_url:
        body["ImageUrl"] = args.image_url
    if not body:
        raise SystemExit("至少给一个：--prompt / --image / --image-url")

    if args.multi_view:
        body["MultiViewImages"] = json.loads(args.multi_view)
    if args.pbr:
        body["EnablePBR"] = True
    if args.geometry:
        body["GenerateType"] = "Geometry"
    elif args.generate_type:
        body["GenerateType"] = args.generate_type
    if args.polygon_type:
        body["PolygonType"] = args.polygon_type
    if args.result_format:
        body["ResultFormat"] = args.result_format
    # FaceCount 单独收 10 积分，减面交给 Blender，所以默认不发这个字段。
    if args.face_count is not None:
        body["FaceCount"] = args.face_count

    action = "SubmitHunyuanTo3DRapidJob" if args.rapid else "SubmitHunyuanTo3DProJob"
    Run(action, body, args.slug, args)


def CmdRig(args) -> None:
    # File3D 是复杂类型，官方文档没公开子字段结构；下面按 Url/Base64 两种常见
    # 形态构造，真实结构以控制台 API Explorer 生成的 JSON 为准。对不上就改用
    # `raw SubmitAutoRiggingJob --body '<Explorer 里复制的 JSON>'`。
    if args.file_url:
        file3d = {"Url": args.file_url}
    else:
        path = Path(args.file)
        data = path.read_bytes()
        if len(data) > 60 * 1024 * 1024:
            raise SystemExit(f"{path} 有 {len(data) / 1048576:.1f} MB，超过 60MB 上限")
        file3d = {
            "Type": path.suffix.lstrip(".").upper(),
            "Base64": base64.b64encode(data).decode("ascii"),
        }
    body = {"File3D": file3d}
    if args.motion is not None:
        body["MotionType"] = args.motion
    Run("SubmitAutoRiggingJob", body, args.slug, args)


def CmdMotion(args) -> None:
    if len(args.prompt) > 128:
        raise SystemExit(f"Prompt 上限 128 字符，现在 {len(args.prompt)}")
    body = {"Prompt": args.prompt}
    if args.duration is not None:
        body["Duration"] = args.duration
    if args.retarget:
        body["RetargetFile"] = {"Url": args.retarget}
    if args.no_mesh:
        body["EnableMesh"] = False
    if args.rewrite:
        body["EnableRewrite"] = True
    Run("SubmitHunyuanTo3DMotionJob", body, args.slug, args)


def CmdStatus(args) -> None:
    if args.type not in QUERY_ACTION:
        raise SystemExit(f"--type 取值：{', '.join(QUERY_ACTION)}")
    submit_action, query_action = QUERY_ACTION[args.type]
    result = Call(query_action, {"JobId": args.job_id})
    status = JobStatus(result)
    print(f"[status] {status}", file=sys.stderr)
    if status in ("DONE", "SUCCESS", "SUCCEED", "FINISH", "FINISHED") and args.slug:
        outdir = SaveResult(args.slug, submit_action, {}, args.job_id, 0, result)
        print(json.dumps({"job_id": args.job_id, "dir": str(outdir)}, ensure_ascii=False))
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))


def CmdRaw(args) -> None:
    body = json.loads(args.body)
    Run(args.action, body, args.slug or "raw", args)


# ---------------------------------------------------------------------------

def BuildParser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="腾讯混元生3D 直连客户端（不经过 WorkBuddy）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    def Common(p, need_slug=True):
        if need_slug:
            p.add_argument("--slug", required=True, help="产物目录名 Source/Hunyuan3D/<slug>/")
        p.add_argument("--dry-run", action="store_true", help="只打印请求体和费用，不提交")
        p.add_argument("--no-poll", action="store_true", help="提交后立刻返回 JobId")
        p.add_argument("--poll-interval", type=int, default=10)
        p.add_argument("--max-wait", type=int, default=900, help="轮询预算秒数")

    p_check = sub.add_parser("check", help="密钥/开通状态自检，不花积分")
    p_check.set_defaults(func=CmdCheck)

    p_gen = sub.add_parser("gen", help="文生3D / 图生3D")
    p_gen.add_argument("--prompt", help="文本描述，≤1024 字符")
    p_gen.add_argument("--image", help="本地图片，走 Base64（≤6MB）")
    p_gen.add_argument("--image-url", help="公网图片 URL（≤8MB）")
    p_gen.add_argument("--multi-view", help='多视角 JSON，如 [{"ViewType":"back","ViewImageUrl":"..."}]（+10 积分）')
    p_gen.add_argument("--pbr", action="store_true", help="EnablePBR（+10 积分）")
    p_gen.add_argument("--geometry", action="store_true", help="白模，15 积分")
    p_gen.add_argument("--generate-type", choices=["Normal", "LowPoly", "Geometry", "Sketch"])
    p_gen.add_argument("--polygon-type", choices=["triangle", "quadrilateral"])
    p_gen.add_argument("--result-format", choices=["STL", "USDZ", "FBX"], help="额外格式（+5 积分）")
    p_gen.add_argument("--face-count", type=int, help="指定面数会 +10 积分，默认不发")
    p_gen.add_argument("--rapid", action="store_true", help="走极速版（15 积分）")
    Common(p_gen)
    p_gen.set_defaults(func=CmdGen)

    p_rig = sub.add_parser("rig", help="绑骨蒙皮（10 积分）")
    group = p_rig.add_mutually_exclusive_group(required=True)
    group.add_argument("--file", help="本地 GLB/FBX，≤60MB")
    group.add_argument("--file-url", help="公网 GLB/FBX URL")
    p_rig.add_argument("--motion", type=int, help="预置动作 1-48，绑骨时顺带出动画")
    Common(p_rig)
    p_rig.set_defaults(func=CmdRig)

    p_motion = sub.add_parser("motion", help="文生动作（10 积分）")
    p_motion.add_argument("--prompt", required=True, help="≤128 字符，英文更稳")
    p_motion.add_argument("--duration", type=int, help="1-12 秒，默认 5")
    p_motion.add_argument("--retarget", help="重定向目标模型 URL")
    p_motion.add_argument("--no-mesh", action="store_true", help="EnableMesh=false，只要动画不要蒙皮")
    p_motion.add_argument("--rewrite", action="store_true", help="让服务端扩写 prompt")
    Common(p_motion)
    p_motion.set_defaults(func=CmdMotion)

    p_status = sub.add_parser("status", help="查询/续跑一个已提交的任务")
    p_status.add_argument("job_id")
    p_status.add_argument("--type", required=True, choices=sorted(QUERY_ACTION))
    p_status.add_argument("--slug", help="给了就把产物下载到这个目录")
    p_status.set_defaults(func=CmdStatus)

    p_raw = sub.add_parser("raw", help="任意 Action + JSON body")
    p_raw.add_argument("action")
    p_raw.add_argument("--body", required=True)
    p_raw.add_argument("--slug")
    Common(p_raw, need_slug=False)
    p_raw.set_defaults(func=CmdRaw)

    return parser


def main() -> None:
    args = BuildParser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
