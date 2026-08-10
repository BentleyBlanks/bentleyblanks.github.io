# 征夫告示：繁体竖排右起，自己排字贴到旧纸上。
#
# 为什么不让生图模型写：1942 年的公文是竖排、右起、繁体，扩散模型排这种版式
# 几乎必然出乱码（第一版就是满纸假字）。所以模型只出空白旧纸，字由这里逐字排。
#
# 三条排版规矩，排不下就抛，不许静默溢出纸外：
#   ① 纸面范围自动量（源图四周有留白，不能拍脑袋写百分比）；
#   ② 正文按可用高度自动折列，条目各起一列、续列缩进两格；
#   ③ 竖排的句读点在字格的右上角，不在正中。
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
import random

SRC = "notice2/paper.png"
OUT = "notice2/zhengfu_v3.png"
FONT = "C:/Windows/Fonts/simkai.ttf"          # 楷体：民国布告最常见的手写／木刻体感

random.seed(19420310)                          # 抖动可复现，不要每跑一次换一套

TITLE = "徵夫告示"
# 每段各起一列；续列自动缩进两格
BODY = [
    "奉上級命令，修築東路炮樓並開挖封鎖溝。各保甲依冊派夫，不得短少。",
    "一、凡十六歲以上、五十歲以下壯丁，由各甲按冊點派。本班限三月十二日卯時，在村東口聽候點名。",
    "二、每名自帶鐵鍬或鎬頭一件、繩索一條、鋪蓋一卷、乾糧七日。",
    "三、服役七日，由下一班換替；未奉令不得擅自離工。",
    "四、牲口、大車及木石草料，另照各甲所派數交齊。",
    "五、無故不到、遲到、逃役、頂替或藏匿者，連保追究；扣糧封門，並拿送究辦。",
    "各戶即刻知照，毋違。此布。",
]
TAIL = ["中華民國三十一年三月初十", "梁家村保公所"]

INK = (38, 30, 24)
PUNCT = "，。、；："                              # 竖排时挪到字格右上角

paper = Image.open(SRC).convert("RGB")
W, H = paper.size

# ── 纸面范围：源图四周是白底，按“比白底暗”找 bbox ──
g = paper.convert("L")
bbox = ImageChops.invert(g).point(lambda v: 255 if v > 32 else 0).getbbox()
PX0, PY0, PX1, PY1 = bbox
# 往里收一点：破损翘边那圈不写字
inset_x, inset_y = int((PX1 - PX0) * 0.055), int((PY1 - PY0) * 0.045)
X0, Y0 = PX0 + inset_x, PY0 + inset_y
X1, Y1 = PX1 - inset_x, PY1 - inset_y
pw, ph = X1 - X0, Y1 - Y0

ink = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ink)


def draw_col(draw, cx, top, s, font, size, fill, jitter=1.1, lead=1.05):
    """竖排一列，逐字往下码。cx＝列中心。返回列底 y。"""
    y = top
    for ch in s:
        if ch not in "　 ":
            bb = font.getbbox(ch)
            w = bb[2] - bb[0]
            ox = oy = 0.0
            if ch in PUNCT:                    # 句读挪到右上角
                ox, oy = size * 0.22, -size * 0.30
            draw.text((cx - w / 2 - bb[0] + ox + random.uniform(-jitter, jitter),
                       y + oy + random.uniform(-jitter, jitter)),
                      ch, font=font, fill=fill)
        y += size * lead
    return y


# ── 标题：最右一列 ──
ts = int(ph * 0.070)
tf = ImageFont.truetype(FONT, ts)
title_cx = X1 - ts * 0.60
draw_col(d, title_cx, Y0 + ph * 0.020, TITLE, tf, ts, INK, jitter=1.5, lead=1.14)

# ── 正文：按可用高度自动折列 ──
bs = int(ph * 0.0295)
bf = ImageFont.truetype(FONT, bs)
lead = 1.05
body_top = Y0 + ph * 0.035
rows = int((ph * 0.955 - (body_top - Y0)) / (bs * lead))     # 一列能码多少字

cols = []
for para in BODY:
    first = True
    i = 0
    while i < len(para):
        n = rows if first else rows - 2
        chunk = para[i:i + n]
        cols.append(chunk if first else "　　" + chunk)
        i += n
        first = False

col_gap = bs * 1.62
x = title_cx - ts * 0.55 - col_gap * 0.45
for col in cols:
    draw_col(d, x, body_top, col, bf, bs, INK)
    x -= col_gap

# ── 落款：低一头起（公文体例：日期与署名不与正文齐头）──
x -= col_gap * 0.30
tail_top = body_top + ph * 0.26
tail_x0 = x
for col in TAIL:
    draw_col(d, x, tail_top, col, bf, bs, INK)
    x -= col_gap
left_edge = x + col_gap - col_gap * 0.5        # 最后一列的左沿

# ── 排不下就抛：宁可报错，也不要悄悄写到纸外面去 ──
if left_edge < X0:
    raise SystemExit(f"排不下：最左列到 {left_edge:.0f}，纸面左沿 {X0}。把 bs 调小或 rows 调大。")
tail_bottom = tail_top + bs * lead * max(len(t) for t in TAIL)
if tail_bottom > Y1:
    raise SystemExit(f"落款超出纸底：{tail_bottom:.0f} > {Y1}")

# ── 印：盖在落款下方偏左，朱红方印 ──
seal_s = int(ph * 0.078)
sx = int(tail_x0 - col_gap * 0.5 - seal_s / 2)
sy = int(tail_bottom + ph * 0.012)
if sy + seal_s > Y1:
    sy = int(Y1 - seal_s)
seal = Image.new("RGBA", (seal_s, seal_s), (0, 0, 0, 0))
sd = ImageDraw.Draw(seal)
RED = (150, 42, 30, 208)
sd.rectangle([1, 1, seal_s - 2, seal_s - 2], outline=RED, width=max(3, seal_s // 20))
sf = ImageFont.truetype(FONT, int(seal_s * 0.38))
for i, ch in enumerate("保公所印"):             # 竖排右起：先右列上下，再左列上下
    c, r = divmod(i, 2)                        # （写成 r,c 就读成「保所公印」了）
    bb = sf.getbbox(ch)
    sd.text((seal_s * (0.70 - 0.40 * c) - (bb[2] - bb[0]) / 2 - bb[0],
             seal_s * (0.16 + 0.40 * r)), ch, font=sf, fill=RED)
mask = Image.new("L", (seal_s, seal_s), 255)   # 印泥不匀
md = ImageDraw.Draw(mask)
for _ in range(110):
    px, py = random.randint(0, seal_s - 1), random.randint(0, seal_s - 1)
    md.ellipse([px, py, px + random.randint(1, 4), py + random.randint(1, 4)],
               fill=random.randint(80, 190))
seal.putalpha(ImageChops.multiply(seal.getchannel("A"), mask))
ink.alpha_composite(seal, (sx, sy))

# ── 墨在纸上会洇、会掉：轻微模糊 + 纸暗处（折痕/污渍/破损）墨更淡 ──
ink = ink.filter(ImageFilter.GaussianBlur(0.55))
shade = paper.convert("L").filter(ImageFilter.GaussianBlur(7))
a = ink.getchannel("A").point(lambda v: int(v * 0.95))
a = Image.composite(a, a.point(lambda v: int(v * 0.5)), shade.point(lambda v: 255 if v > 148 else 0))
ink.putalpha(a)

out = paper.convert("RGBA")
out.alpha_composite(ink)
out.convert("RGB").save(OUT)
print(f"wrote {OUT} {out.size}  正文 {len(cols)} 列 / 每列 {rows} 字 / 最左 {left_edge:.0f}（纸沿 {X0}）")
