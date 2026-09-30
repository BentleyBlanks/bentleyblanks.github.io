#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""加载画面「战前报纸剪报」的合成口：把 Notion 史料页上的**原图**印到 Lovart 生成的**空白**做旧纸底上。

为什么不让 AI 直接把原图"重画成报纸质感"：生成模型会改写小字、编造标题，史料就不再是那一期了。
这里报纸上的每一个像素内容都来自原图，AI 只出**没有任何印刷**的纸（纤维、霉斑、撕边、折痕、聚光与暗角）。

流程
  1. 纸底：Lovart 出的空白纸（黑底、聚光）。阈值取出纸张轮廓，minAreaRect 拟合成一个旋转矩形，向内缩 INSET 当印刷区。
  2. 墨迹图：原图取**红通道**当亮度（画刊原图盖着红色馆藏水印，红字在红通道里与纸同亮，水印就此淡出；
     黑白报纸三通道相同，不受影响），除以 97 分位纸白得到透光率 ratio∈[0,1]，再做一点点伽马让墨更沉。
  3. 叠印：原图等比缩放到印刷区里，按纸的旋转角仿射过去，与纸底逐像素**正片叠底**（纸的折痕、污渍、暗角照样压在字上）；
     纸张轮廓之外不印。
  4. 裁切：按纸张外接框加 6% 黑边裁出，长边缩到 --long；输出 webp。

用法（原图不入库：从 Notion「加载界面｜战前报纸剪报方案与史料库」下载，文件名见 JOBS）：
    python Script_ComposeBootPaper.py --originals <原图目录> --substrates <纸底目录> --out <输出目录>
纸底目录里放 L1/L2（横幅 ≈1.35:1）、S1/S2（近方 ≈1:1）、R1/R2（竖幅 ≈0.72:1）各一张 png，
每张原图按自己的宽高比挑最接近的一类，同类的两张交替用，让相邻两期不是同一张纸。

依赖：opencv-python、numpy、Pillow。
"""
import argparse
import os

import cv2
import numpy as np
from PIL import Image

# (输出 id, 原图文件名) —— 与 Data_BootPapers.mjs 的 id 一一对应。
JOBS = [
    ("LiBao19370709", "libao_19370709_lugouqiao_archive.jpg"),
    ("ShenBao19370731", "shenbao_19370731_tianjin.jpg"),
    ("WenHui19380125", "wenhui_19380125_frontpage_archive.jpg"),
    ("ZhanShiHuaKan19370820", "zhanshihuakan_19370820_shanghai_battle.jpg"),
    ("ZhanShiHuaKan19370906", "zhanshihuakan_19370906_south_station.jpg"),
    ("ZhanShiHuaKan19370911", "zhanshihuakan_19370911_airforce.jpg"),
    ("ZhanShiHuaKan19371001", "zhanshihuakan_19371001_wounded.jpg"),
    ("ZhanShiHuaKan19371106", "zhanshihuakan_19371106_north_station.jpg"),
    ("ZhanShiHuaKan19371111", "zhanshihuakan_19371111_sihang.jpg"),
    ("JiuGuoShiBao19371220", "jiuguoshibao_19371220_nanjing.jpg"),
    ("ChinaWeeklyReview19371106", "china_weekly_review_19371106_shanghai_relief.jpeg"),
]
CLASS_ASPECT = {"L": 1.35, "S": 1.0, "R": 0.72}
INSET = 0.045          # 印刷区距纸张外缘的比例（纸边撕得不齐，留白边）
PAD = 0.06             # 输出裁切时纸张外的黑边比例
INK_GAMMA = 1.25
INK_STRENGTH = 0.97


def LoadSubstrate(path):
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255.0


def SheetGeometry(sub):
    """返回 (纸张掩膜 uint8 0/255, 旋转矩形 ((cx,cy),(w,h),angle), 外接框 x,y,w,h)。"""
    gray = sub.max(axis=2)
    blur = cv2.GaussianBlur(gray, (0, 0), 3)
    mask = (blur > 0.24).astype(np.uint8) * 255
    # 先开运算切断纸角与角落里浮尘光斑之间的细桥，再取最大连通块；阈值 0.16 会把光斑连进来。
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((31, 31), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    mask = (labels == big).astype(np.uint8) * 255
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cnt = max(contours, key=cv2.contourArea)
    filled = np.zeros_like(mask)
    cv2.drawContours(filled, [cnt], -1, 255, -1)
    rect = cv2.minAreaRect(cnt)
    return filled, rect, cv2.boundingRect(cnt)


def InkMap(path):
    im = Image.open(path)
    rgb = np.asarray(im.convert("RGB"), dtype=np.float32)
    red = rgb[..., 0]                       # 红通道：红色水印在这里与纸同亮
    white = float(np.percentile(red, 97))
    ratio = np.clip(red / max(white, 1.0), 0.0, 1.0)
    return ratio ** INK_GAMMA


def Compose(sub, ink, geo):
    mask, rect, _ = geo
    (cx, cy) = rect[0]
    # minAreaRect 的 w/h/角度约定不固定：直接取四个角点，找最接近水平的那条边当「纸的横向」。
    pts = cv2.boxPoints(rect)
    edges = [pts[(i + 1) % 4] - pts[i] for i in range(4)]
    def AngleOf(v):
        a = np.degrees(np.arctan2(v[1], v[0]))
        while a > 90:
            a -= 180
        while a < -90:
            a += 180
        return a
    horiz = min(edges[:2], key=lambda v: abs(AngleOf(v)))
    vert = edges[1] if horiz is edges[0] else edges[0]
    ang = AngleOf(horiz)                        # 图像坐标（y 向下）里横边的倾角，正 = 顺时针
    rw, rh = float(np.hypot(*horiz)), float(np.hypot(*vert))
    iw, ih = rw * (1 - 2 * INSET), rh * (1 - 2 * INSET)
    sh, sw = ink.shape
    s = min(iw / sw, ih / sh)
    # 原图中心 -> 纸中心，旋转 ang，缩放 s
    M = cv2.getRotationMatrix2D((sw / 2.0, sh / 2.0), -ang, s)
    M[0, 2] += cx - sw / 2.0
    M[1, 2] += cy - sh / 2.0
    H, W = sub.shape[:2]
    interp = cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC
    warped = cv2.warpAffine(ink, M, (W, H), flags=interp, borderMode=cv2.BORDER_CONSTANT, borderValue=1.0)
    inside = cv2.erode(mask, np.ones((7, 7), np.uint8)).astype(np.float32) / 255.0
    inside = cv2.GaussianBlur(inside, (0, 0), 1.2)
    density = (1.0 - warped) * inside * INK_STRENGTH
    out = sub * (1.0 - density)[..., None]
    # 纸外一律压成纯黑（只留纸边一圈羽化的暗影）：底图的浮尘、光斑与左侧那一条略灰的底色都不带进游戏，
    # 游戏里用 mix-blend-mode: lighten 把图外的黑融进页面黑，图里的灰就会露成一条竖边。
    near = cv2.GaussianBlur(cv2.dilate(mask, np.ones((21, 21), np.uint8)).astype(np.float32) / 255.0, (0, 0), 5)
    out = out * near[..., None]
    return np.clip(out, 0.0, 1.0)


def Crop(img, geo, long_edge):
    x, y, w, h = geo[2]
    px, py = int(w * PAD), int(h * PAD)
    x0, y0 = max(0, x - px), max(0, y - py)
    x1, y1 = min(img.shape[1], x + w + px), min(img.shape[0], y + h + py)
    crop = img[y0:y1, x0:x1]
    scale = long_edge / max(crop.shape[:2])
    if scale < 1:
        crop = cv2.resize(crop, (int(crop.shape[1] * scale), int(crop.shape[0] * scale)), interpolation=cv2.INTER_AREA)
    return crop


def PickClass(aspect):
    return min(CLASS_ASPECT, key=lambda k: abs(CLASS_ASPECT[k] - aspect))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--originals", required=True)
    ap.add_argument("--substrates", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--long", type=int, default=1600)
    ap.add_argument("--quality", type=int, default=82)
    ap.add_argument("--only", default=None)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    used = {"L": 0, "S": 0, "R": 0}
    cache = {}
    for pid, fname in JOBS:
        if args.only and args.only != pid:
            continue
        src = os.path.join(args.originals, fname)
        ink = InkMap(src)
        cls = PickClass(ink.shape[1] / ink.shape[0])
        variant = "1" if used[cls] % 2 == 0 else "2"
        used[cls] += 1
        key = cls + variant
        if key not in cache:
            sub = LoadSubstrate(os.path.join(args.substrates, key + ".png"))
            cache[key] = (sub, SheetGeometry(sub))
        sub, geo = cache[key]
        out = Compose(sub, ink, geo)
        out = Crop(out, geo, args.long)
        name = f"Texture_BootPaper{pid}.webp"
        Image.fromarray((out * 255 + 0.5).astype(np.uint8)).save(os.path.join(args.out, name), "WEBP",
                                                                 quality=args.quality, method=6)
        print(pid, key, out.shape[1], "x", out.shape[0], os.path.getsize(os.path.join(args.out, name)) // 1024, "KB")


if __name__ == "__main__":
    main()
