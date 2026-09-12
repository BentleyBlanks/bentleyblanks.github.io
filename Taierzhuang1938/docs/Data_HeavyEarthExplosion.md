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
两条新生成的远处炮响仍只在本地试听，不替换游戏的中距或远距素材。

本地试听、原始音频与验收证据留在任务 worktree 的 `tmp/FourExplosionSfx`。

验证：模块缓存图通过；新成品响度检查通过。真实浏览器使用项目 AudioEngine
加载 SFX 包，再用 OfflineAudioContext 以近爆 volume=4、间隔 0.15 秒叠加 20 次：
20 次均走新采样，输出峰值 0.94405，无削波、加载错误或播放错误。
证据为本地 `Data_InstallVerification.json`。这项音频夹具不包含 WebGL 场景。

音频域 prepush 的 FirstLevelMissionMusicTest 通过，后三项整场景浏览器检查
因共享测试槽被其他任务占用而未执行，不报告为整套通过。
全库响度报告仍有 5 个未修改旧素材失败（GoreSever 01/02、GoreLimbLand 01/02、
CarriageRearCheer）；新素材的有声段 RMS −19.53、峰值 −4.11 dBFS 合格。
