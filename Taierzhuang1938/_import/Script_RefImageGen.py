# -*- coding: utf-8 -*-
"""Generate orthographic reference images for image-to-3D, via the OpenAI Images API.

图生3D 的成品质量几乎完全由参考图决定。默认的"作品图"——带构图、环境光影、
背景、透视——喂进混元3D 会把背景一起建进去，或者把投影当成几何。所以这里不
直接用用户的 prompt，而是套一层正交参考图模板：单体、正视、无背景、无阴影、
无透视、完整不出血。这一层是整条链能不能用的关键，不是可选的润色。

Credentials come from the environment, never from disk or arguments:

    OPENAI_API_KEY

Usage:
    # 单张正视图，直接可以喂给 Script_Hunyuan3DFetch.py
    python Script_RefImageGen.py --slug lantern --subject "民国时期的铁皮马灯，锈迹斑斑"

    # 三视图（正/侧/背），给混元3D 的 --multi-view 用
    python Script_RefImageGen.py --slug lantern --subject "民国时期的铁皮马灯" --views front left back

    # 只看提示词和费用，不出图
    python Script_RefImageGen.py --slug x --subject "青花瓷罐" --dry-run

Chain:
    Script_RefImageGen.py  --slug lantern --subject "..."
    Script_Hunyuan3DFetch.py gen --slug lantern \
        --image Source/RefImages/lantern/lantern_front.png --pbr
"""

from __future__ import annotations

import argparse
import base64
import datetime
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ENDPOINT = "https://api.openai.com/v1/images/generations"
ROOT = Path(__file__).resolve().parent / "Source" / "RefImages"

# 每张美元价，抄自官方定价页（GPT Image 2 按分辨率计价）。只用于提交前把账
# 打出来，账单以 OpenAI 为准。
COST_USD = {
    ("gpt-image-2", "1024"): 0.03,
    ("gpt-image-2", "1536"): 0.05,
    ("gpt-image-2", "2048"): 0.05,
    ("gpt-image-2", "4096"): 0.08,
}
USD_TO_CNY = 7.2

# 相机方位。混元3D 的 MultiViewImages 认 left/right/back/top/bottom/
# left_front/right_front，这里的 key 与之对齐，方便直接拼多视角请求。
VIEWS = {
    "front": "seen from directly in front, straight-on orthographic front view",
    "back": "seen from directly behind, straight-on orthographic rear view",
    "left": "seen from directly to its left, straight-on orthographic side view",
    "right": "seen from directly to its right, straight-on orthographic side view",
    "top": "seen from directly above, straight-on orthographic top view",
    "bottom": "seen from directly below, straight-on orthographic bottom view",
}

# 这段模板是整个脚本的实质内容。每一条都对应一个会毁掉 3D 重建的失败模式：
#   透视     -> 网格被拉歪
#   阴影/地面 -> 影子被当成几何建出来
#   背景     -> 背景一起进网格
#   裁切     -> 缺失的部分被瞎补
#   艺术光影 -> 高光烘进 albedo，PBR 贴图洗不掉
TEMPLATE = (
    "A single isolated {subject}, {view}. "
    "Strict orthographic projection with zero perspective distortion. "
    "The entire object is fully visible and centered, nothing cropped or cut off at any edge. "
    "Plain flat pure white background, completely empty, no scene, no props, no ground plane. "
    "Flat even neutral studio lighting from the front, no cast shadow, no drop shadow, "
    "no contact shadow, no specular hotspots, no rim light, no ambient occlusion baked in. "
    "Neutral color, true to material, no color grading, no artistic filter. "
    "Product-catalog reference photograph for 3D reconstruction, not an artistic composition. "
    "No text, no watermark, no logo, no measurement lines, no annotations, no border."
)


def ApiKey() -> str:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        raise SystemExit(
            "缺少 OPENAI_API_KEY。\n"
            "推荐用图形界面设，避免密钥进 PowerShell 历史记录：\n"
            "  Win+R -> sysdm.cpl -> 高级 -> 环境变量 -> 用户变量 -> 新建\n"
            "  变量名 OPENAI_API_KEY  变量值 sk-...\n"
            "设完重开终端。"
        )
    return key


def BuildPrompt(subject: str, view: str, extra: str | None) -> str:
    prompt = TEMPLATE.format(subject=subject.strip(), view=VIEWS[view])
    if extra:
        prompt = f"{prompt} {extra.strip()}"
    return prompt


def ReportCost(model: str, size: str, count: int) -> float:
    width = size.split("x", 1)[0]
    unit = COST_USD.get((model, width))
    if unit is None:
        print(f"[cost] {model} @{size} 单价未知，以 OpenAI 账单为准", file=sys.stderr)
        return 0.0
    total = unit * count
    print(
        f"[cost] {count} 张 × ${unit:.3f} = ${total:.3f}（≈{total * USD_TO_CNY:.2f} 元）",
        file=sys.stderr,
    )
    return total


def Generate(model: str, prompt: str, size: str, transparent: bool) -> bytes:
    body = {"model": model, "prompt": prompt, "size": size, "n": 1}
    if transparent:
        # 透明背景比白底更稳：混元3D 不用再猜哪块是背景。
        body["background"] = "transparent"
        body["output_format"] = "png"

    request = Request(
        ENDPOINT,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {ApiKey()}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=300) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", "replace")
        hint = ""
        if error.code == 401:
            hint = "\n提示：密钥无效或已撤销。"
        elif error.code == 429:
            hint = "\n提示：限流或余额不足，去 platform.openai.com 看用量。"
        elif error.code == 400 and "model" in detail:
            hint = "\n提示：模型名可能不对，用 --model 换一个（gpt-image-1.5 / gpt-image-1-mini）。"
        raise SystemExit(f"HTTP {error.code}: {detail}{hint}")

    item = (result.get("data") or [{}])[0]
    if item.get("b64_json"):
        return base64.b64decode(item["b64_json"])
    if item.get("url"):
        with urlopen(Request(item["url"]), timeout=300) as response:
            return response.read()
    raise SystemExit(f"响应里没有图像数据：{json.dumps(result, ensure_ascii=False)[:400]}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="为图生3D 生成正交参考图（OpenAI Images API）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--slug", required=True, help="产物目录名 Source/RefImages/<slug>/")
    parser.add_argument("--subject", required=True, help="物体描述，中文即可，别写构图和光影")
    parser.add_argument("--views", nargs="+", default=["front"], choices=sorted(VIEWS),
                        help="要出哪些视角，默认只出 front")
    parser.add_argument("--model", default="gpt-image-2")
    parser.add_argument("--size", default="1024x1024")
    parser.add_argument("--extra", help="追加到模板末尾的额外约束")
    parser.add_argument("--opaque", action="store_true",
                        help="出纯白底而非透明底（默认透明）")
    parser.add_argument("--dry-run", action="store_true", help="只打印提示词和费用")
    args = parser.parse_args()

    prompts = {view: BuildPrompt(args.subject, view, args.extra) for view in args.views}
    ReportCost(args.model, args.size, len(args.views))

    if args.dry_run:
        print(json.dumps({"model": args.model, "size": args.size, "prompts": prompts},
                         ensure_ascii=False, indent=2))
        return

    outdir = ROOT / args.slug
    outdir.mkdir(parents=True, exist_ok=True)

    saved = []
    for view, prompt in prompts.items():
        print(f"[gen] {view} …", file=sys.stderr)
        target = outdir / f"{args.slug}_{view}.png"
        target.write_bytes(Generate(args.model, prompt, args.size, not args.opaque))
        print(f"[save] {target}  ({target.stat().st_size / 1024:.0f} KB)", file=sys.stderr)
        saved.append({"view": view, "file": target.name, "prompt": prompt})

    meta = {
        "source": "OpenAI Images API",
        "model": args.model,
        "size": args.size,
        "subject": args.subject,
        "background": "opaque" if args.opaque else "transparent",
        "images": saved,
        "generatedAt": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "purpose": "orthographic reference for image-to-3D",
    }
    (outdir / "Meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    front = outdir / f"{args.slug}_{args.views[0]}.png"
    print(json.dumps({"dir": str(outdir), "next": (
        f"python Taierzhuang1938/_import/Script_Hunyuan3DFetch.py gen "
        f"--slug {args.slug} --image {front} --pbr"
    )}, ensure_ascii=False))


if __name__ == "__main__":
    main()
