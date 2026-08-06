# TunnelLight1943 / Video —— 序章开场过场短片（v2，砍半版）

序章开场：**一行旁白一段短片**，`Pro_01.mp4` … `Pro_08.mp4` 对应
`Script_Core.mjs` 里 `c1_prologue` 的第 1–8 行（第 9 行是落回实景的 wide，无片）。

**v2（2026-08-06）**：v1 十四行 109.5s 被判「铺垫过长、苦难写得不够」，重排成
8+1 行、开声约 55s——宏观战史压成一行，新增一行专写扫荡过后的活不下去
（第 3 行），「被逼」写进第 4 行；地道成网的题眼行保住全长；三行落到梁家村。
手绘插卡（`DrawInsertCard`，卡名映射见脚本里各行的 `card:`）仍是兜底，
整段回退把 `kind:"insertVideo"` 改回 `kind:"insertCard"` 即可。

## 一、镜头表

| 文件 | 时长 | 对应旁白 | 画面 | 来源 |
|---|---|---|---|---|
| `Pro_01.mp4` | 9.0s | 卢沟桥一声枪响，华北尽落敌手 | 石狮桥栏剪影，墨从桥头渗开 | v1 沿用 |
| `Pro_02.mp4` | 6.1s | 扫荡一年比一年狠 | 地平线上的村子在烧，烟柱翻卷 | v1 沿用 |
| `Pro_03.mp4` | 8.1s | 粮被抢空，连哭都不敢出声 | 翻倒见底的粮囤，一家人蹲在残墙根，兵的剪影走远 | v2 新做 |
| `Pro_04.mp4` | 9.0s | 庄稼人被逼到头，把命藏进土里 | 固定全景：人在坑里一下下挖土 | v2 重出（v1 推得太猛） |
| `Pro_05.mp4` | 10.1s | 地底下长出另一个华北 | 2.5D 剖面：地道连成网 | v1 沿用 |
| `Pro_06.mp4` | 8.1s | 冀中梁家村，村东头的木匠 | 推刨子，刨花打卷 | v1 沿用 |
| `Pro_07.mp4` | 8.1s | 儿子叫柱子，起的是盼头 | 父子仰望房梁（两人全程在画内） | v2 重出（v1 摇出画外） |
| `Pro_08.mp4` | 15.1s | 这年春上粮金贵 | 青黄不接的麦田，见底的粮囤 | v1 沿用 |

**时长必须 ≥ 对应那一行的实际时长**——那一行有多长不是脚本里的 `d` 说了算：
`LineDuration()` 会把它撑到旁白配音念完（`d` 只是下限）。改台词/换配音后先跑
`Script_VoiceExtract` + Qwen 烘焙，再用 manifest 里的 `dur` 核对每段片长。

## 二、怎么做出来的

1. **分镜**：Lovart（project `oKHfWa1O2A`，与九章分镜同 thread，画风同源）。
   v1 出过两张分镜总图（8 格 2048² + 6 格 2048×1536），v2 补了一张单格 16:9
   （扫荡过后）。总图按亮缝检测切格、镜像补丁抹镜号，16:9 中心裁切到 1280×720。
2. **生视频**：即梦 `dreamina image2video`，`--model_version=seedance2.0_vip`
   `--video_resolution=720p`。提示词每条写死「镜头绝不旋转、不俯仰、不环绕」
   （项目铁律）；固定机位的戏要额外写「机位固定不动、绝不推近」，否则模型
   默认会给你加运镜。
3. **配音**：新台词过 `Script_VoiceExtract.mjs` 重建 manifest，再用
   `TunnelLightQwenTtsCuda_20260805` venv 跑
   `Script_VoiceBakeQwen.py --workDir TunnelLightQwen17Work_20260805 --stage bake
   --lineId <id>…`（只烘缺的行；mp3 与 `dur` 回写都是它管）。
4. **转码**：即梦出片 60fps/~15Mbps 太肥，
   `ffmpeg -r 30 -crf 26 -preset slow -movflags +faststart -an` 压到约 1/13。

**即梦没有 seedance2.5**：CLI 只到 seedance2.0 家族，`seedance2.0_vip` 是旗舰档。

## 三、播放实现里两个踩过的坑

都在 `Script_World.js` 的 `SetInsertCard()`：

- **对时死区不能给窄**。片子跟着 `state.beat.lineT` 走而不信视频自己的钟（这样暂停、
  切后台、`?fast=1` 快进都能对上），但起播天生比旁白慢小半秒。死区 0.35s 时
  每帧 seek 一次，每次 seek 都把 `readyState` 打回 1 → 当帧退回兜底插卡 →
  画面来回闪。现在死区 1.0s，且出过第一帧就 `insertVideoLive` latch 住不再回退。
- **页面不可见时 `VideoTexture` 一帧都不上传**。three 靠
  `video.requestVideoFrameCallback` 置 `needsUpdate`，它和 rAF 一样
  `document.hidden` 时不触发。本项目的画面验证（`Script_DebugShot` / `Script_ShotTest` /
  cine-audit）全是面板隐藏、手动驱动渲染状态下截图的——不补
  `if (document.hidden) tex.needsUpdate = true`，序章截出来永远是兜底插卡，
  而且看不出错在哪。正常游玩仍走 rVFC。

调试用 `world.__insertVideo()` 能问出当前片名 / 是否在放 / readyState / 播放头。
