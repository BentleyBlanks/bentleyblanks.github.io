"""木板类源图的接缝预处理（烘焙前一步，2026-09-28 3A 迭代 B5 的 OpeningCrate 用）。

Lovart 生成的「四块横板」箱板图说是无缝，实际第四道板缝劈在上下边上（下边只剩 4 行暗线、上边没有），
直接烘（weld 只羽化四边）会在平铺处少一道缝、多出一块双高的板。这里：
  1. 整图往上卷 --roll 行（默认源图高的 1/8），让所有板缝都落进图内、图边落在板中间；
  2. 从一道完整板缝（--seam-row 附近 ±--seam-half 行）拷一条带，贴到原上下边接合处（卷动后在 H - roll）。
再交给 Script_BakePbrTexture.py 烘（weatheredWood，weld）。只用 numpy + Pillow。

    python Taierzhuang1938/_import/Script_PrepBoardSeamSource.py \\
        Taierzhuang1938/_shots/Gap3A_Source/B5/Source_OpeningCrate_Lovart.png \\
        Taierzhuang1938/_shots/Gap3A_Source/B5/Source_OpeningCrate_Prepped.png --seam-row 1027
"""
import argparse

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("source")
ap.add_argument("out")
ap.add_argument("--roll", type=int, default=0, help="往上卷多少行（默认高/8）")
ap.add_argument("--seam-row", type=int, required=True, help="一道完整板缝的中心行（源图坐标）")
ap.add_argument("--seam-half", type=int, default=7, help="拷贝板缝带的半高（行）")
args = ap.parse_args()

a = np.asarray(Image.open(args.source).convert("RGB"))
h = a.shape[0]
roll = args.roll or h // 8
out = np.roll(a, -roll, axis=0)                      # 新行 r = 旧行 (r + roll) % h
band = a[args.seam_row - args.seam_half:args.seam_row + args.seam_half]
joint = h - roll                                     # 原上下边接合处落在这里
out[joint - args.seam_half:joint + args.seam_half] = band
Image.fromarray(out).save(args.out)
rows = out.astype(float).mean(2).mean(1)
dark = np.sort(np.argsort(rows)[: 4 * args.seam_half * 2])
print(args.out, "板缝行（最暗的若干行）:", dark.tolist())
