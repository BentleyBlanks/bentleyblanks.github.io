# 近距爆炸：厚重掀土（2026-09-12）

用户试听后认可“厚重掀土”提高 6 dB 的版本，要求替换进游戏。
`explosionNear` 仅使用 `AudioSfx_ExplosionNearHeavyEarth.mp3`，字节与该试听成品一致。
原始供应商为 Volcengine `seed-audio-1.0`；提示词、原始及成品 SHA-256、
生成时间和实际响度登记于 `Data_SfxManifest.json` 的 `approvedExplosionSources`。

成品约 3.407 秒，有声段 RMS 约 −19.5 dBFS，峰值约 −4.1 dBFS。
`Script_AudioNormalize` 对这一人工选定成品使用单独目标，仍检查响度容差和峰值，
不让全库重烘撤销用户认可的加响。运行时的距离衰减、近中远分档、混响、
碎屑与总线限幅继续沿用原链路。

旧 `Script_SeedAudioCarriageReviewBake.mjs --install-sfx` 现在仅重装飞机引擎，
不再覆盖近距爆炸。旧近爆素材保留为历史文件，清单不再选择它。
后续用户选定“村外远爆”为中距、“田野远爆”为远距，接入见下文。

本地试听、原始音频与验收证据留在任务 worktree 的 `tmp/FourExplosionSfx`。

验证：模块缓存图通过；新成品响度检查通过。真实浏览器使用项目 AudioEngine
加载 SFX 包，再用 OfflineAudioContext 以近爆 volume=4、间隔 0.15 秒叠加 20 次：
20 次均走新采样，输出峰值 0.94405，无削波、加载错误或播放错误。
证据为本地 `Data_InstallVerification.json`。这项音频夹具不包含 WebGL 场景。

音频域 prepush 的 FirstLevelMissionMusicTest 通过，后三项整场景浏览器检查
因共享测试槽被其他任务占用而未执行，不报告为整套通过。
全库响度报告仍有 5 个未修改旧素材失败（GoreSever 01/02、GoreLimbLand 01/02、
CarriageRearCheer）；新素材的有声段 RMS −19.53、峰值 −4.11 dBFS 合格。

## 中距与远距接入

用户认可两条音色，要求提高偏轻的响度：各自加 6 dB，保留动态和尾声，
不添加压缩、滤波或额外混响。`explosionMid` 单独使用村外版
`AudioSfx_ExplosionMidVillage.mp3`（2.687 秒），`explosionFar` 单独使用田野版
`AudioSfx_ExplosionFarField.mp3`（3.307 秒）。原始文件与成品哈希、提示词及测量值
同样登记在 `approvedExplosionSources`；近距的已认可文件保持字节不变。

两条成品有声段 RMS 均为 −19.53 dBFS，峰值分别 −4.13 / −5.41 dBFS。
全库归一化按人工档 −19.5 dBFS 校验，避免自动重烘压回 −25。
旧 ExplosionBake 在存在新批准记录时只核验清单和文件哈希，不再用旧素材覆盖中远档。

距离边界、音量比例及传播处理沿用游戏混音；素材自身都加响，听者距离仍负责远近层次。
实测真实浏览器 AudioWiring → AudioEngine → OfflineAudioContext：8 米选厚重掀土，
40 米选村外，120 米选田野，均成功加载新采样并产生非静音输出，且响度近 > 中 > 远。
20 次混合爆炸以 volume=4、间隔 0.15 秒压力渲染，峰值 0.93710，无削波或播放错误。
证据为本地 `Data_DistanceVerification.json`。模块缓存图、旧 baker 保留检查及
新文件响度检查通过；5 个旧素材响度失败仍未修改。本轮整场景回归未执行，
检查时共享槽被其他任务的 FirstLevelMissionBrowserTest 占用。
