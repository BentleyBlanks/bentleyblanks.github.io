#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""《台儿庄：血战滕县》打包字体的烘焙口。

整套思源黑体是 8 MB，思源宋体 11 MB —— 全量下发等于让每个玩家先下一部电影。
这里按 Script_FontChars.mjs 算出来的字表把它们裁到真正用得到的那些字，产出 woff2。

裁三组：
  Font_Title.woff2              大标题（思源宋体 Black）
  Font_UiSans_{Regular,Bold}    界面汉字（思源黑体）
  Font_UiLatin_{Regular,SemiBold}  界面拉丁与数字（Barlow Semi Condensed）

拉丁为什么单拎一款：思源黑自带的拉丁偏圆偏宽，和这套冷灰界面不搭；战地那一族
（BF Body）就是拿开源的 Barlow 改的，窄一档、工业味立刻起来，代价只有 10 KB。

**改了界面上任何一句中文，就要重跑这个脚本。** 新字不在子集里不会报错，
只会让那几个字悄悄回退到系统字体 —— 正文里一两个字长得不一样，
比标题难看出得多。Script_TextTest 的「打包字体子集」一节替你盯着这件事。

用法（源字体都不入库，先下再跑）：
    curl -L -o src/NotoSerifSC-Black.otf   https://github.com/notofonts/noto-cjk/raw/main/Serif/SubsetOTF/SC/NotoSerifSC-Black.otf
    curl -L -o src/NotoSansSC-Regular.otf  https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf
    curl -L -o src/NotoSansSC-Bold.otf     https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/SC/NotoSansSC-Bold.otf
    curl -L -o src/BarlowSemiCondensed-Regular.ttf  https://github.com/google/fonts/raw/main/ofl/barlowsemicondensed/BarlowSemiCondensed-Regular.ttf
    curl -L -o src/BarlowSemiCondensed-SemiBold.ttf https://github.com/google/fonts/raw/main/ofl/barlowsemicondensed/BarlowSemiCondensed-SemiBold.ttf
    PYTHONUTF8=1 python Script_FontSubset.py src

依赖：Node（跑字表）+ fonttools 与 brotli（pip install "fonttools[woff]"）。
授权：三款全部 SIL OFL 1.1，见同目录 LICENSE_OFL.txt。
"""
import io
import json
import os
import subprocess
import sys

from fontTools import subset

HERE = os.path.dirname(os.path.abspath(__file__))
CHARS_SCRIPT = os.path.join(HERE, "Script_FontChars.mjs")

# (输出名, 源字体名, 用哪张字表)
JOBS = [
    ("Font_Title", "NotoSerifSC-Black.otf", "title"),
    ("Font_UiSans_Regular", "NotoSansSC-Regular.otf", "ui"),
    ("Font_UiSans_Bold", "NotoSansSC-Bold.otf", "ui"),
    ("Font_UiLatin_Regular", "BarlowSemiCondensed-Regular.ttf", "latin"),
    ("Font_UiLatin_SemiBold", "BarlowSemiCondensed-SemiBold.ttf", "latin"),
]

# 清单：Script_TextTest 拿它和现在的文案对账。写字表本身而不是哈希，
# 是为了红的时候能直接把缺的那几个字打出来。
MANIFESTS = {
    "Font_Title.json": {
        "faces": ["Font_Title.woff2"],
        "font": "Noto Serif SC Black / 思源宋体 Black",
        "charsKey": "title",
    },
    "Font_Ui.json": {
        "faces": ["Font_UiSans_Regular.woff2", "Font_UiSans_Bold.woff2",
                  "Font_UiLatin_Regular.woff2", "Font_UiLatin_SemiBold.woff2"],
        "font": "Noto Sans SC Regular/Bold + Barlow Semi Condensed Regular/SemiBold",
        "charsKey": "ui",
    },
}


def Charsets():
    """字表的唯一真相在 Script_FontChars.mjs —— 这里只是把它跑一遍。"""
    out = subprocess.run([("node.exe" if os.name == "nt" else "node"), CHARS_SCRIPT],
                         capture_output=True, check=True)
    return json.loads(out.stdout.decode("utf-8"))


def main(argv):
    if len(argv) != 2:
        print(__doc__)
        return 2
    src_dir = argv[1]
    charsets = Charsets()

    missing = [rel for _, rel, _ in JOBS if not os.path.isfile(os.path.join(src_dir, rel))]
    if missing:
        print("源字体不全，缺：" + "、".join(missing))
        return 2

    sizes = {}
    for name, rel, key in JOBS:
        dst = os.path.join(HERE, name + ".woff2")
        subset.main([
            os.path.join(src_dir, rel),
            "--text=" + charsets[key],
            "--output-file=" + dst,
            "--flavor=woff2",
            "--layout-features=",
            "--no-hinting",
            "--desubroutinize",
        ])
        sizes[name] = os.path.getsize(dst)
        print("%-26s %6.1f KB  %4d 字  <- %s" % (name, sizes[name] / 1024, len(charsets[key]), rel))

    for file, spec in MANIFESTS.items():
        chars = charsets[spec["charsKey"]]
        body = json.dumps({
            "font": spec["font"],
            "license": "SIL OFL 1.1",
            "faces": spec["faces"],
            "chars": chars,
        }, ensure_ascii=False, indent=2)
        io.open(os.path.join(HERE, file), "w", encoding="utf-8", newline="\n").write(body + "\n")

    print("合计 %.1f KB" % (sum(sizes.values()) / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
