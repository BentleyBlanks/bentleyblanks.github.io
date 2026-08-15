#!/usr/bin/env python3
"""Compose cutscene storyboard sheets from generated 16:9 stills."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
FONT_PATH = "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"
PAPER = (236, 226, 208)
INK = (42, 36, 30)
RULE = (120, 108, 92)
MUTED = (92, 82, 70)
ACCENT = (92, 58, 48)


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
    canvas.paste(img, ((size[0] - img.width) // 2, (size[1] - img.height) // 2))
    return canvas


def save_jpg(page: Image.Image, path: Path) -> None:
    page.save(path, "JPEG", quality=86, optimize=True, progressive=True)


def compose_board(out_name: str, chapter_title: str, board_title: str, shots: list) -> None:
    margin, gap, header, note_h = 48, 28, 118, 168
    frame_w = 860
    frame_h = int(frame_w * 9 / 16)
    cell_w, cell_h = frame_w, frame_h + note_h
    cols = 2
    rows = (len(shots) + 1) // 2
    width = margin * 2 + cell_w * cols + gap
    height = margin + header + cell_h * rows + gap * max(0, rows - 1) + 36
    page = Image.new("RGB", (width, height), PAPER)
    draw = ImageDraw.Draw(page)
    draw.rectangle((0, 0, width, 8), fill=ACCENT)
    draw.text((margin, 28), f"《地道里的光》  过场分镜表  ·  {chapter_title}", font=font(26), fill=INK)
    draw.text((margin, 68), f"{board_title}    剪纸横版  ·  16:9", font=font(20), fill=MUTED)
    for i, shot in enumerate(shots):
        col, row = i % 2, i // 2
        x = margin + col * (cell_w + gap)
        y = margin + header + row * (cell_h + gap)
        page.paste(load_shot(shot["file"], (frame_w, frame_h)), (x, y))
        draw.rectangle((x, y, x + frame_w, y + frame_h), outline=INK, width=2)
        ny = y + frame_h + 10
        draw.text((x, ny), f"镜 {shot['id']}", font=font(26), fill=ACCENT)
        draw.text((x + 90, ny + 4), f"{shot['dur']}    {shot['cam']}", font=font(18), fill=MUTED)
        py = ny + 36
        for ln in wrap(draw, shot["picture"], font(18), frame_w - 8)[:3]:
            draw.text((x, py), ln, font=font(18), fill=INK)
            py += 24
        if shot.get("line"):
            for ln in wrap(draw, shot["line"], font(18), frame_w - 8)[:2]:
                draw.text((x, py), ln, font=font(18), fill=ACCENT)
                py += 24
    save_jpg(page, ROOT / out_name)


def compose_table(out_name: str, chapter_title: str, page_label: str, shots: list) -> None:
    width, row_h, margin, header = 2200, 210, 40, 110
    height = margin + header + row_h * len(shots) + 40
    page = Image.new("RGB", (width, height), PAPER)
    draw = ImageDraw.Draw(page)
    draw.rectangle((0, 0, width, 8), fill=ACCENT)
    draw.text((margin, 24), f"《地道里的光》  {chapter_title}  分镜表", font=font(30), fill=INK)
    draw.text((margin, 68), page_label, font=font(20), fill=MUTED)
    thumb_w, thumb_h = 320, 180
    for i, shot in enumerate(shots):
        y = margin + header + i * row_h
        draw.line((margin, y, width - margin, y), fill=RULE, width=1)
        page.paste(load_shot(shot["file"], (thumb_w, thumb_h)), (margin, y + 14))
        draw.rectangle((margin, y + 14, margin + thumb_w, y + 14 + thumb_h), outline=INK, width=1)
        tx = margin + thumb_w + 28
        draw.text((tx, y + 18), f"镜 {shot['id']}  {shot['beat']}", font=font(26), fill=ACCENT)
        draw.text((tx + 280, y + 24), f"{shot['dur']}    机位：{shot['cam']}", font=font(20), fill=MUTED)
        py = y + 62
        for ln in wrap(draw, f"画面　{shot['picture']}", font(20), width - tx - margin)[:3]:
            draw.text((tx, py), ln, font=font(20), fill=INK)
            py += 28
        if shot.get("line"):
            for ln in wrap(draw, shot["line"], font(20), width - tx - margin)[:2]:
                draw.text((tx, py), ln, font=font(20), fill=ACCENT)
                py += 28
    save_jpg(page, ROOT / out_name)


def compose_contact(out_name: str, chapter_title: str, shots: list) -> None:
    cols = 4
    rows = (len(shots) + cols - 1) // cols
    thumb_w, thumb_h, gap, margin, header = 480, 270, 16, 40, 90
    width = margin * 2 + cols * thumb_w + (cols - 1) * gap
    height = margin + header + rows * (thumb_h + 36) + (rows - 1) * gap
    page = Image.new("RGB", (width, height), PAPER)
    draw = ImageDraw.Draw(page)
    draw.rectangle((0, 0, width, 8), fill=ACCENT)
    draw.text((margin, 24), f"《地道里的光》  {chapter_title}  总表", font=font(30), fill=INK)
    draw.text((margin, 64), "过场分镜  ·  剪纸横版", font=font(20), fill=MUTED)
    for i, shot in enumerate(shots):
        col, row = i % cols, i // cols
        x = margin + col * (thumb_w + gap)
        y = margin + header + row * (thumb_h + 36 + gap)
        page.paste(load_shot(shot["file"], (thumb_w, thumb_h)), (x, y))
        draw.rectangle((x, y, x + thumb_w, y + thumb_h), outline=INK, width=1)
        draw.text((x, y + thumb_h + 6), f"镜 {shot['id']}  {shot['beat']}", font=font(18), fill=INK)
    save_jpg(page, ROOT / out_name)


def main() -> None:
    data = json.loads((ROOT / "Data_CutsceneShots.json").read_text(encoding="utf-8"))
    for ch in data["chapters"]:
        shots = ch["shots"]
        cid = ch["id"].upper()
        compose_table(f"Texture_{cid}BoardTable.jpg", ch["title"], ch["subtitle"], shots)
        compose_contact(f"Texture_{cid}BoardAll_Contact.jpg", ch["title"], shots)
        for i in range(0, len(shots), 4):
            chunk = shots[i:i + 4]
            letter = chr(ord("A") + i // 4)
            compose_board(
                f"Texture_{cid}Board{letter}.jpg",
                ch["title"],
                f"{letter}  ·  镜 {chunk[0]['id']}–{chunk[-1]['id']}",
                chunk,
            )
        print(ch["id"], len(shots), "shots")


if __name__ == "__main__":
    main()
