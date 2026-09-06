#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""《台儿庄：血战滕县》标题字体子集化。

标题只用到十几个汉字，整套思源宋体是 11 MB —— 全量打包等于为了八个字
让每个玩家先下一部电影。这里把源字体裁到 CHARS 里的那几十个码位，
产出 woff2（约 5 KB），随仓库一起发。

**改标题 / 副标题就必须重跑这个脚本**，否则新字在字体里不存在，
浏览器会逐字回退到系统字体，表现成「标题里有几个字长得不一样」。
字表的唯一真相是 Data_TengxianScript.MENU.title / .subtitle 与
Data_Text_Menu 的 "menu.title.paused"，改完把 CHARS 同步过来。

用法（源字体不入库，先下再跑）：
    curl -L -o NotoSerifSC-Black.otf \
      https://github.com/notofonts/noto-cjk/raw/main/Serif/SubsetOTF/SC/NotoSerifSC-Black.otf
    PYTHONUTF8=1 python Script_TitleFontSubset.py NotoSerifSC-Black.otf

依赖：fonttools + brotli（pip install "fonttools[woff]"）。
授权：思源宋体 / Noto Serif SC，SIL OFL 1.1，见同目录 LICENSE_OFL.txt。
"""
import io
import json
import os
import sys

from fontTools import subset

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "Font_Title.woff2")
# 字表清单：Script_TextTest 的「标题字体子集」一节拿它对账 ——
# 标题里出现子集以外的字就红，省得靠肉眼在标题里找那两个长得不一样的字。
MANIFEST = os.path.join(HERE, "Font_Title.json")

# 标题字体实际会渲染到的全部文本：主菜单大标题、暂停标题、加载画面标题与副标题。
TITLE = "台儿庄：血战滕县"
PAUSED = "游戏暂停"
SUBTITLE = "一九三八年三月十四日 — 十八日 · 山东滕县"
CHARS = sorted(set(TITLE + PAUSED + SUBTITLE))


def main(argv):
    if len(argv) != 2:
        print(__doc__)
        return 2
    src = argv[1]
    if not os.path.isfile(src):
        print("找不到源字体：" + src)
        return 2
    subset.main([
        src,
        "--text=" + "".join(CHARS),
        "--output-file=" + OUT,
        "--flavor=woff2",
        "--layout-features=",
        "--no-hinting",
        "--desubroutinize",
    ])
    manifest = json.dumps({
        "font": "Noto Serif SC Black / 思源宋体 Black",
        "source": os.path.basename(src),
        "license": "SIL OFL 1.1",
        "chars": "".join(CHARS),
    }, ensure_ascii=False, indent=2)
    io.open(MANIFEST, "w", encoding="utf-8", newline="\n").write(manifest + "\n")
    print("%s  %d 字  %d B" % (os.path.basename(OUT), len(CHARS), os.path.getsize(OUT)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
