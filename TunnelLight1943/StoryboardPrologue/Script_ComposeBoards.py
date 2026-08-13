#!/usr/bin/env python3
"""Compose prologue storyboard sheets from generated 16:9 stills."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
FONT_PATH = "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"
PAPER = (236, 226, 208)
INK = (42, 36, 30)
RULE = (120, 108, 92)
MUTED = (92, 82, 70)
ACCENT = (92, 58, 48)

SHOTS = [
    ("00", "Texture_PrologueShot00_BlackDin.jpg", "3.4+2.6s", "dark",
     "全黑。村外狗先叫，远处一枪。", "伪军：「出来！都出来！」"),
    ("01", "Texture_PrologueShot01_DoorTremble.jpg", "4.0s", "free 后拉",
     "显影。柱子立屋当间，妹妹捂耳。门闩未插，门板轻震。", ""),
    ("02", "Texture_PrologueShot02_MotherBurst.jpg", "4.6s", "free 低机位追人",
     "娘冲进来。蓝底白花短褂被扯开一道口，袖口沾土。不切衣裳特写。", ""),
    ("03", "Texture_PrologueShot03_PullClose.jpg", "5.2s", "free 缓推怀抱",
     "一把将妹妹拉进怀里，上下摸了一遍。门没关严。", ""),
    ("04", "Texture_PrologueShot04_CallZhuozi.jpg", "1.8+2.0s", "free 正反打",
     "娘抬头找柱子。柱子完整站在画框右侧。", "娘：「柱子。」「抱她。」"),
    ("05", "Texture_PrologueShot05_HatchSlip.jpg", "5.4s", "free 俯角窖口",
     "铁环第一次滑开。衣襟上蹭一把汗，第二次攥住掀开。", ""),
    ("06", "Texture_PrologueShot06_HatchOpen.jpg", "2.2s", "free 仰角",
     "跪在窖口的娘。掀开的洞口黑在画框下沿。", "娘：「快。」"),
    ("07", "Texture_PrologueShot07_ScoopSister.jpg", "可玩", "玩法机位",
     "蹲下去抱起妹妹。她两条胳膊立刻搂住脖子。", ""),
    ("08", "Texture_PrologueShot08_BlockDoor.jpg", "1.8+1.6s", "shot → insert",
     "往屋门走：娘挡在门前，朝菜窖指。", "娘：「下去！」"),
    ("09", "Texture_PrologueShot09_LowerLadder.jpg", "3.4s", "shot 窖沿",
     "坐到窖沿，把妹妹放上梯子。她抓着衣襟不肯松手。", ""),
    ("10", "Texture_PrologueShot10_CutawayDescend.jpg", "可玩", "剖面 上下同框",
     "沿梯子下窖。上头娘守着翻板；外头脚步到了院门。", ""),
    ("11", "Texture_PrologueShot11_HatchSpeak.jpg", "8.4s", "insert 仰看窖口",
     "娘跪在窖口，一只手压着翻板，只探进半张脸。", "娘：「搂紧她。」「不叫你们，别上来。」"),
    ("12", "Texture_PrologueShot12_SleeveVanish.jpg", "4.0s", "insert 同仰角",
     "翻板合上。最后消失在板缝里的，是那截蓝底白花的袖子。", ""),
    ("13", "Texture_PrologueShot13_HugDust.jpg", "15s 长按", "窖底 dark",
     "长按搂紧。松手呼吸变响，头顶脚步停住。靴子踩板，灰从缝里落。", ""),
    ("14", "Texture_PrologueShot14_SlantLight.jpg", "4.2s", "shot 窖底",
     "仍然搂着。板缝里的光从直的变成斜的，又一点点暗下去。", ""),
    ("15", "Texture_PrologueShot15_CutawayAftermath.jpg", "2.8+3.6s", "dark + 章名卡",
     "没人来叫。章名出现在序的末尾，不在开局。然后：三天后。",
     "旁白：「没人来叫。」  章名：「第一章 · 蓝底白花」"),
]

BOARDS = [
    ("Texture_PrologueBoardA_HouseRush.jpg", "A · 屋里", "c1_thatday 前半", SHOTS[0:4]),
    ("Texture_PrologueBoardB_Hatch.jpg", "B · 掀板", "c1_thatday 后半 + 抱起", SHOTS[4:8]),
    ("Texture_PrologueBoardC_Descend.jpg", "C · 下窖", "c1_descend", SHOTS[8:12]),
    ("Texture_PrologueBoardD_Hide.jpg", "D · 窖底", "c1_hide → 序收尾", SHOTS[12:16]),
]


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_PATH, size=size)


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, width: int) -> list[str]:
    if not text:
        return []
    lines, current = [], ""
    for ch in text:
        trial = current + ch
        if draw.textlength(trial, font=fnt) <= width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = ch
    if current:
        lines.append(current)
    return lines


def load_shot(name: str, size: tuple[int, int]) -> Image.Image:
    img = Image.open(ROOT / name).convert("RGB")
    img.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", size, (18, 16, 14))
    x = (size[0] - img.width) // 2
    y = (size[1] - img.height) // 2
    canvas.paste(img, (x, y))
    return canvas


def compose_board(out_name: str, title: str, subtitle: str, shots: list) -> None:
    margin = 48
    gap = 28
    header = 118
    note_h = 168
    frame_w = 860
    frame_h = int(frame_w * 9 / 16)
    cell_w = frame_w
    cell_h = frame_h + note_h
    width = margin * 2 + cell_w * 2 + gap
    height = margin + header + cell_h * 2 + gap + 36
    page = Image.new("RGB", (width, height), PAPER)
    draw = ImageDraw.Draw(page)
    draw.rectangle((0, 0, width, 8), fill=ACCENT)
    draw.text((margin, 28), "《地道里的光》  序 · 那天  过场分镜表", font=font(28), fill=INK)
    draw.text((margin, 68), f"{title}    {subtitle}    第八稿", font=font(22), fill=MUTED)
    draw.text((width - margin - 220, 68), "16:9  ·  剪纸横版", font=font(20), fill=MUTED)

    for i, shot in enumerate(shots):
        col, row = i % 2, i // 2
        x = margin + col * (cell_w + gap)
        y = margin + header + row * (cell_h + gap)
        frame = load_shot(shot[1], (frame_w, frame_h))
        page.paste(frame, (x, y))
        draw.rectangle((x, y, x + frame_w, y + frame_h), outline=INK, width=2)
        ny = y + frame_h + 10
        sid, _file, dur, cam, picture, line = shot
        draw.text((x, ny), f"镜 {sid}", font=font(26), fill=ACCENT)
        draw.text((x + 90, ny + 4), f"{dur}    {cam}", font=font(18), fill=MUTED)
        py = ny + 36
        for ln in wrap(draw, picture, font(18), frame_w - 8)[:3]:
            draw.text((x, py), ln, font=font(18), fill=INK)
            py += 24
        if line:
            for ln in wrap(draw, line, font(18), frame_w - 8)[:2]:
                draw.text((x, py), ln, font=font(18), fill=ACCENT)
                py += 24
    page.save(ROOT / out_name, "JPEG", quality=86, optimize=True, progressive=True)


def compose_table(out_name: str, shots: list, page_label: str) -> None:
    width, row_h, margin = 2200, 210, 40
    header = 110
    height = margin + header + row_h * len(shots) + 40
    page = Image.new("RGB", (width, height), PAPER)
    draw = ImageDraw.Draw(page)
    draw.rectangle((0, 0, width, 8), fill=ACCENT)
    draw.text((margin, 24), "《地道里的光》  序 · 那天  分镜表", font=font(32), fill=INK)
    draw.text((margin, 68), f"{page_label}    Notion 第八稿落地  ·  c1_thatday / c1_descend / c1_hide", font=font(20), fill=MUTED)
    thumb_w, thumb_h = 320, 180
    for i, shot in enumerate(shots):
        y = margin + header + i * row_h
        draw.line((margin, y, width - margin, y), fill=RULE, width=1)
        sid, fname, dur, cam, picture, line = shot
        thumb = load_shot(fname, (thumb_w, thumb_h))
        page.paste(thumb, (margin, y + 14))
        draw.rectangle((margin, y + 14, margin + thumb_w, y + 14 + thumb_h), outline=INK, width=1)
        tx = margin + thumb_w + 28
        draw.text((tx, y + 18), f"镜 {sid}", font=font(28), fill=ACCENT)
        draw.text((tx + 110, y + 24), f"{dur}    机位：{cam}", font=font(20), fill=MUTED)
        py = y + 62
        for ln in wrap(draw, f"画面　{picture}", font(20), width - tx - margin)[:3]:
            draw.text((tx, py), ln, font=font(20), fill=INK)
            py += 28
        if line:
            for ln in wrap(draw, line, font(20), width - tx - margin)[:2]:
                draw.text((tx, py), ln, font=font(20), fill=ACCENT)
                py += 28
    page.save(ROOT / out_name, "JPEG", quality=86, optimize=True, progressive=True)


def compose_contact() -> None:
    cols, rows = 4, 4
    thumb_w, thumb_h = 480, 270
    gap, margin, header = 16, 40, 90
    width = margin * 2 + cols * thumb_w + (cols - 1) * gap
    height = margin + header + rows * (thumb_h + 36) + (rows - 1) * gap
    page = Image.new("RGB", (width, height), PAPER)
    draw = ImageDraw.Draw(page)
    draw.rectangle((0, 0, width, 8), fill=ACCENT)
    draw.text((margin, 24), "《地道里的光》  序 · 那天  十六镜总表", font=font(32), fill=INK)
    draw.text((margin, 64), "过场分镜  ·  剪纸横版  ·  第八稿", font=font(20), fill=MUTED)
    for i, shot in enumerate(SHOTS):
        col, row = i % cols, i // cols
        x = margin + col * (thumb_w + gap)
        y = margin + header + row * (thumb_h + 36 + gap)
        thumb = load_shot(shot[1], (thumb_w, thumb_h))
        page.paste(thumb, (x, y))
        draw.rectangle((x, y, x + thumb_w, y + thumb_h), outline=INK, width=1)
        label = f"镜 {shot[0]}  {shot[3]}"
        draw.text((x, y + thumb_h + 6), label, font=font(18), fill=INK)
    page.save(ROOT / "Texture_PrologueBoardAll_Contact.jpg", "JPEG", quality=86, optimize=True, progressive=True)


def compose_title_card() -> None:
    width, height = 1920, 1080
    page = Image.new("RGB", (width, height), (10, 9, 8))
    draw = ImageDraw.Draw(page)
    draw.text((width // 2, height // 2 - 40), "第一章", font=font(42), fill=(210, 198, 178), anchor="mm")
    draw.text((width // 2, height // 2 + 28), "蓝底白花", font=font(72), fill=(236, 226, 208), anchor="mm")
    draw.text((width // 2, height // 2 + 110), "序 · 那天  ·  收", font=font(24), fill=(140, 128, 112), anchor="mm")
    page.save(ROOT / "Texture_PrologueShot16_TitleCard.png", "PNG", optimize=True)


def main() -> None:
    for out_name, title, subtitle, shots in BOARDS:
        compose_board(out_name, title, subtitle, shots)
    compose_table("Texture_PrologueBoardTable1_Shots00to07.jpg", SHOTS[:8], "表一  镜 00–07")
    compose_table("Texture_PrologueBoardTable2_Shots08to15.jpg", SHOTS[8:], "表二  镜 08–15")
    compose_contact()
    compose_title_card()
    print("composed", len(list(ROOT.glob("Texture_PrologueBoard*.jpg"))), "boards")


if __name__ == "__main__":
    main()
