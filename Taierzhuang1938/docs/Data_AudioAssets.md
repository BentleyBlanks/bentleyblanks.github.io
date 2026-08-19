# 音效资产：从「全部合成」换成「实录采样盖在合成上」

2026-08-19。此前这个项目的 32 个音效全部是 WebAudio 现场合成的（`Script_Audio.mjs`
的 `RECIPES`）。合成那套一行没删，现在只是被一层实录素材盖住了。

## 为什么换

合成的长处很实在：零加载、零 404、完全确定性，二十条枪靠随机种子抖出二十种。
但它有一条过不去的坎 —— **枪声的瞬态是炸开的空气，不是包络**。
噪声过带通再削顶，出来永远是「啪」，不像「炸」；一整场听下来是二十个合成器在响，
不是二十支枪在打。爆炸、入肉、倒地同理：这些声音的信息量在瞬态的微结构里，
不在包络的形状里，而节点图能控的只有包络。

复读的问题（同一个 wav 反复播会露馅）在采样层用**多变体 + 逐发 ±3% 变调**解掉，
和合成版靠随机种子取噪声偏移是同一条思路：**随机来自播放时，不来自素材**。

## 素材来源与许可

| 来源 | 许可 | 用途 |
| --- | --- | --- |
| [Sonniss GDC Game Audio Bundle](https://archive.org/details/sonniss.com-gdc-game-audio-bundles)（2015—2026 历届，archive.org 镜像） | 免版税，可用于商业与非商业项目 | 除军号与哨子以外的全部 |
| [Wikimedia Commons](https://commons.wikimedia.org/) | 军号为美国政府作品（PD）；哨子为 CC0 | `bugleTone` / `whistle` |

Sonniss 的许可不要求署名，但 `Data_SfxSources.mjs` 仍然逐条记着厂商与型号 ——
**那是选材的依据**，不是法务义务：K98k 之所以能当中正式，是因为它就是 7.92×57 毛瑟。
换成别家的「设计音」这条理由立刻不成立。

## 选材的三条硬标准

1. **口径与枪机对得上。** 中正式＝毛瑟标准型的中国版，同弹同枪机 → K98k 实录；
   三八式 6.5×50「又尖又脆」→ .30-06 的 M1903A3 升调 10%；九二式重机 7.7mm 慢速 →
   M1919A4（同为弹链供弹的中型机枪，且录的是**架在枪架上**那版，为的是每发后面
   那记金属余振 —— 重机与轻机在听感上真正的分界是它，不是射速）；
   捷克式 ZB-26 → L7A2 GPMG 7.62 单发（同为全威力弹的班用自动武器）。
2. **只切单发，射速由引擎排。** 直接用一段连发录音的话，射速就被素材钉死了，
   九二式 200 rpm 的「啄木鸟」身份证会当场作废。采样版的 `SAMPLE_BURST` 与合成版
   `GunAuto` 用的是同一组史实数字。
3. **远近是两条真的录音，不是近射加低通。** 50 m 外那一枪的尾巴是环境给的，
   滤波器造不出来。

## 成品

47 个文件 / 359 KB（44.1 kHz 单声道 72 kbps MP3），在 `Audio/Sfx/`，
清单 `Audio/Sfx/Data_SfxManifest.json`。

| cue | 变体 | 时长 | 体积 | 素材 |
| --- | --- | --- | --- | --- |
| `rifleNra` | 3 | 1.15 s | 28.9 KB | Pole Position Production · K98k 7.92×57 毛瑟 · Sonniss GDC 2020 |
| `rifleNraFar` | 3 | 1.50 s | 36.9 KB | FLYSOUND · 莫辛纳甘 50 m 外 · Sonniss GDC 2020 |
| `rifleIja` | 3 | 0.86 s | 22.2 KB | Pole Position Production · 斯普林菲尔德 M1903A3 · Sonniss GDC 2020 |
| `rifleIjaFar` | 1 | 0.85 s | 7.2 KB | Watson Wu · 两次大战步枪（来弹视角）· Sonniss Game Audio Monthly #3 |
| `zb26` | 1 | 0.90 s | 7.6 KB | Pole Position Production · L7A2 GPMG 7.62×51 单发 · Sonniss GDC 2016 |
| `type11` | 1 | 0.54 s | 4.7 KB | Pole Position Production · M1919A4 .30cal · Sonniss GDC 2016 |
| `type92` | 1 | 0.92 s | 7.8 KB | Pole Position Production · M1919A4 .30cal（枪架）· Sonniss GDC 2016 |
| `bolt` | 1 | 1.25 s | 10.2 KB | Pole Position Production · M1903A3 拉栓 · Sonniss GDC 2020 |
| `stripperLoad` | 1 | 1.10 s | 9.2 KB | Pole Position Production · K98k 操作音 · Sonniss GDC 2020 |
| `magIn` | 1 | 0.65 s | 5.6 KB | Dramatic Cat · 步枪弹匣入位 · Sonniss GDC 2024 |
| `grenadePin` | 1 | 0.60 s | 5.1 KB | TS Sound · 火柴摩擦点燃 · Sonniss Game Audio Monthly #4 |
| `grenadeThrow` | 1 | 0.55 s | 4.9 KB | David Dumais Audio · 重挥破风 · Sonniss GDC 2020 |
| `explosionNear` | 1 | 2.40 s | 19.2 KB | Bluezone Corporation · 城区爆炸 · Sonniss GDC 2023 |
| `explosionFar` | 1 | 2.60 s | 20.9 KB | Gamemaster Audio · 远处爆炸 · Sonniss GDC 2017 |
| `shellIncoming` | 1 | 2.00 s | 16.2 KB | Bluezone Corporation · 炮弹飞行啸声 · Sonniss GDC 2020 |
| `shellImpact` | 1 | 2.80 s | 22.5 KB | Coll Anderson · 野外迫击炮爆炸实录 · Sonniss GDC 2015 |
| `launcherPop` | 1 | 0.90 s | 7.6 KB | Bluezone Corporation · 榴弹发射 · Sonniss GDC 2023 |
| `dadaoSwing` | 1 | 0.50 s | 4.5 KB | David Dumais Audio · 大型冷兵器挥空 · Sonniss GDC 2023 |
| `dadaoHit` | 2 | 0.80 s | 13.6 KB | Justsoundeffects · 双手斧入肉 · Sonniss GDC 2024 |
| `bayonetHit` | 1 | 0.70 s | 6.0 KB | PMSFX · 利刃刺入 · Sonniss GDC 2019 |
| `impactBrick` | 3 | 0.33 s | 12.2 KB | Gamemaster Audio · 弹着砖石 · GDC 2017 ／ PMSFX · 青砖碎裂 · GDC 2020 |
| `impactDirt` | 1 | 0.42 s | 3.9 KB | PMSFX · 弹着夯土 · Sonniss GDC 2020 |
| `impactWood` | 2 | 0.45 s | 8.7 KB | Double Trouble Audio · 木料受击（软/硬两条）· Sonniss GDC 2017 |
| `impactMetal` | 1 | 0.75 s | 6.4 KB | Gamemaster Audio · 弹着厚金属 · Sonniss GDC 2017 |
| `impactFlesh` | 1 | 0.50 s | 4.5 KB | PMSFX · 弹着人体 · Sonniss GDC 2020 |
| `footstepDirt` | 2 | 0.40 s | 7.4 KB | PMSFX · 土路单步 · Sonniss GDC 2019 |
| `footstepRubble` | 4 | 0.40 s | 14.9 KB | Studio 23 · 碎石路行走 · Sonniss GDC 2019 |
| `bodyFall` | 1 | 1.10 s | 9.2 KB | Red Libraries · 人体倒地（土地面）· Sonniss GDC 2019 |
| `hurt` | 2 | 0.58 s | 8.7 KB | Articulated Sounds · 男性痛呼 · GDC 2019 ／ 344 Audio · 士兵闷哼 · GDC 2020 |
| `heartbeat` | 1 | 0.70 s | 6.0 KB | Airborne Sound · 心跳 · Sonniss GDC 2018 |
| `bugleTone` | 1 | 1.00 s | 8.4 KB | U.S. Marine Corps 军号（PD）· Wikimedia Commons |
| `whistle` | 1 | 0.90 s | 7.6 KB | SpliceSound · 哨子（CC0）· Wikimedia Commons |

变体多的那几条不是随便给的：**每秒都在响的音必须多变体**（脚步、弹着砖、
中弹闷哼、步枪），一个固定样本循环起来就是机关枪。

## 冲锋号是特例：只借音色，不借号谱

军号取的是《Last Post》里一个**持续单音**，烘焙时用自相关量出基频
（实测 495.5 Hz，置信 1.00 —— 一支 G 号的 B4），引擎照它算 `playbackRate`，
按 `BUGLE_CHARGE` 那张中方动机表排出整段。

直接播一段美军 Charge 号会是另一支军队在冲锋。反过来，合成版的军号音色又
一直像风琴。所以拆开：**音色来自实录，调子仍归自己**。

也是因此，`Assembly bugle call` 这条素材被换掉了：它是 0.35 秒一个的短音，
切出来必带下一个音的头，量基频会量到两个音的混合（实测 398 与 497 Hz 各一半）。

## 重新烘焙

```bash
node Taierzhuang1938/Script_SfxBake.mjs            # 全量（缺素材就下载）
node Taierzhuang1938/Script_SfxBake.mjs K98k BAR   # 只烘这两组
node Taierzhuang1938/Script_SfxBake.mjs --report   # 只打候选起音点表，不落文件
node Taierzhuang1938/Script_SfxBake.mjs --recut    # 不下载，只重切
```

原始长片落在 `Audio/Sfx/_raw/`（已 gitignore，3 MB，切完就没用了）。
出网要经 `HTTP_PROXY`，所以下载走 `curl` 而不是 node 的 `fetch`——
undici 默认不认代理环境变量，`fetch` 会直接 Connect Timeout。

## 切割踩过的四个坑

1. **回退起音点必须封顶。** 原本「一路退到底噪附近」，遇到连发时每一发都会退到
   整串的第一个起音上，三发挑出来是同一份；`pick:"last"` 拿到的还是第一发，
   切出来是整串三响。现在最多退 24 格（120 ms）。
2. **衰减区间是硬筛。** 不加的话会挑出 0.05 秒的咔哒声当「落地声」——
   枪管里的机械动作也是个陡起音，打分比真正的枪响还高。
3. **连发素材抠不出干净的单发。** BAR 那条「双发」里第一发的尾巴压着第二发，
   抠出来的 zcr 只有 152（全是低频轰声），听着像闷炮不像机枪。
   换成本身就是单发的 L7A2 素材之后 zcr 3187。**能换素材就别调参数。**
4. **自动挑法在机械音上不可靠。** 拉栓、压弹、弹匣、掷弹筒这几条改用 `atS`
   直接钉死素材里的秒数 —— 先跑 `--report` 看候选表，看准了钉一个位置，
   比反复调阈值可靠得多。

## 验收

```bash
node Taierzhuang1938/Script_AudioTest.mjs
```

断言：清单 32 个 cue、32 条全部盖住合成配方、载入零报错、军号基频在 495.5 Hz
附近、32 条逐条播得响、配方零异常、九二式 5 发点射真的按 200 rpm 排开。

音效的失败是**静默**的（404 → 吞掉退回合成 → 画面照跑、控制台干净），
所以这一层必须单独断言，开机冒烟与通关冒烟都测不出来。

烘焙侧我听不见，靠的是**看**：波形 + 对数频谱贴图逐条过一遍，
再配 peak/RMS/起音时间/过零率四个数。上面第 3 条就是这么发现的。
