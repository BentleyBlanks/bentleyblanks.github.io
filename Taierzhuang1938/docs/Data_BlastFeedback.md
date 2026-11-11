# 通用近爆反馈

2026-09-24 用户要求：炮火、手榴弹在身边爆炸有相机震动，过近伴随耳鸣，作为通用机制。手感方向参考用户提及的《战地一》开场；实现数值为本项目调校，并非该游戏参数复刻。

所有实弹爆炸由 `Combat.Blast` 调用 `Combat.BlastFeedback(position, radius)`。感知在破坏更新之后、伤害结算之外处理，所以掩体挡住弹片或调试无敌时仍有反馈。剧情爆破可以单独调用同一感知入口，不必附带伤害；铁路桥已接入。材质预热、编辑器特效展示不视为游戏爆炸事件。

- 相机先定向冲击，再按独立爆炸创伤值衰减。左右爆心决定侧向冲击，遮挡同时减弱冲击与余震。连续爆炸有单独幅度上限，不改玩家原始 yaw/pitch；落地、受弹、扑沟仍用原有衰减。参数在 `Data_Tuning_Player.CAMERA_SHAKE.explosion`。
- 爆炸半径、到听者距离、遮挡共同决定耳鸣强度。爆炸起音先通过，随后外界声音低通变闷，耳鸣渐弱并恢复。参数在 `Data_Tuning_Audio.BLAST_HEARING`，`AudioWiring.Blast` 将半径和遮挡交给音频引擎 `Play`，采样和合成声音使用同一反应入口。
- 连续近爆复用一条耳鸣声部，只延长有限包络，弱爆炸不能提前结束仍在持续的强反馈。耳鸣遵守主音量与音效音量；换场景由 `AudioWiring.Reset` 清除，音频引擎 Dispose 回收节点和定时器。这里沿用既有 WebAudio 现场合成耳鸣，不生成新音频资产。

第一关 01–06（任务侧开关 `audio.firstLevelSoundscape` 开着）的耳鸣音色另有两档（`Data_Tuning_Audio.TINNITUS`：战斗近爆 / 剧情炮震，双音拍频 + 窄带嘶声 + 分段恢复，见 `Script_Audio.DeafenFirstLevel`），这是 2026-09-24 并入 master 前 01–06 重构线的既有口径，合并后保留：
- 触发与距离闸与本机制同一条：`Play` → `Reactions` → `BlastHearing(距离, 半径, 遮挡)`；01–06 里战斗档按强度把低通落点与鸣响音量一起压浅（强度 1 时与原两档一字不差），其它关卡走本机制的通用包络（`DeafenShared`）。原来的 12 m 硬闸与 07 以后的旧单正弦（`TINNITUS.legacy`）已退役。
- 过场由导演曲线独占：01 近失弹、02 枪托由导演直接 `Deafen(1.1)` 走剧情档长尾；剧情档没恢复完之前，Reactions 请求的战斗档不顶掉它（01 那发近失弹本身是 `Combat.FireShell` 的真炮弹，落地时会再请求一次）。验收：`Script_AudioTest.mjs` 的耳鸣段。
- 震屏不分关卡：01 近失弹落地照常走 `Combat.BlastFeedback` → `CameraShake.Explosion`（爆炸创伤约 0.39，半秒内衰减完）；但开场导演摄像机接管期间（`bunker.CameraActive`）画面只听导演的重影/失衡曲线，玩家震屏不叠上去（2026-09-24 合并时逐帧实测：震屏俯仰 −0.037 rad 时摄像机俯仰不动），随后 0.25 s 闭眼转黑。

## 人头上有多响 · 第一人称身体反应 · 耳朵受损（2026-10-21，`phase.blastReaction`）

同一个入口 `Combat.BlastFeedback(position, radius, explosiveId)` 在算完遮挡、喂完震屏之后，再按**装药量与到眼睛的距离**算峰值超压与 dB（`Script_BlastExposure`，Kinney–Graham），给两件共用机制：

- 第一人称身体反应 `Player.flinch`（`Script_BlastFlinch`）：眨眼 / 闭紧眼（后期合成 `eyeClosure`，白天眼皮透暗红 `lidGlow`）、背离爆点扭头 / 低头 / 歪头 / 缩身（相机，叠在震屏之后，不改 yaw / pitch 本体）、收枪缩肩与手抖（Viewmodel `blastFlinch`）、恍惚（后期合成 `concussion` 取大）、喘与心跳（AudioWiring）。
- 耳朵模型 trauma（`Script_AudioEarTrauma`，`Audio.SetEarModel`）：左右耳分开的听阈抬高 / 变闷 / 耳鸣音高处的听力坑 + 一条稳定的高音耳鸣；强度来自两只耳朵各自的 dB（头影），随 `AudioWiring.Blast` → `Play({ blastExposure })` 带进 `Reactions`。legacy（默认）时一个节点都不插，上面那套耳鸣原样。

关卡 phase 写 `blastReaction: true` 两样一起开（`Script_Main.EnterLevel`；离开本关在 `BuildField` 里关）；两个开关也能分开调（`player.SetBlastReaction`、`audio.SetEarModel`）。目前只有人物战场反应测试场（`?reactions=1`）开着，正片默认不开。口径、数值与验收见 [人物战场反应测试场](Data_BattleReactionRange.md)。

## 近爆眩晕（2026-11-11，全关卡常开）

用户要求：被炸弹 / 手榴弹震到后画面眩晕、边缘色散、拖影一段时间，严重程度按震的程度 / 威力，声音跟着。**入口仍只有 `Combat.BlastFeedback`**：`BlastExposure` 多出 `stun`（dB 窗 163–187，`BLAST_EXPOSURE.windows.stun`，手榴弹 20 m 起、5 m 约 0.54、2 m 近满），`Player.BlastReaction` 里人活着就先交给 `player.stun`（`Script_BlastStun`，纯规则；**不看 `flinch.enabled` / `phase.blastReaction`**，正片默认就有）。

- 通道（`player.stun` 每帧算好，`Script_Main.BlastStunView` 在人活着、在玩、没开菜单 / 过场 / 高级工具、开场导演相机没接管时才交出）：边缘色散并进 `aberration`（基准 `LENS_DEFAULT.aberration` 0.0022 之上，与开场镜头取大）、拖影时间常数 `stunTrail`（秒）、重影并进 `hitDisorientation`、发灰发糊并进 `concussion`（与 flinch 的恍惚取大）、音频强度并进 `audio.SetHitDisorientation`（闷 + 压低，与 `Deafen` 耳鸣低通是两个串联节点）、相机慢晃叠在 `SyncCamera` 最后（不改 yaw / pitch 本体）。
- 拖影 = `Script_PostStunTrail`：composite 之后、fxaa 之前的帧反馈，两张输出分辨率 HalfFloat 靶懒建；`out = mix(current, history, fb × 中心留清楚的径向权重)`，`fb = min(maxFeedback, exp(−dt / tauS))`；跑的帧 `targets.ldr` 指向它的靶，不跑（无眩晕 / 画质档关 `stunTrail` / reduced-motion）时 `Idle` 还给 composite 的靶，**无眩晕时画面逐比特不变**。composite 的恍惚分支同时保留通道分离（显式 uniform `uChromaKeep`，`options.chromaKeep = min(1, level/0.15)`，默认 0，所以无眩晕时含 01–02 开场镜头逐比特不变）。开场导演相机接管（`bunker.CameraActive`）期间 `BlastStunView` 先 `stun.Reset()` 再返回 null：那段感知由导演曲线独占，01 的近失真炮弹不会在还权时带着半截眩晕冒出来。
- 数值表：`Data_Tuning_BlastReaction.BLAST_STUN`（时间包络、叠加、各通道上限、慢晃、音频），画质档开关 `Data_Tuning_Graphics.stunTrail`（四档都开）。
- reduced-motion：相机慢晃为 0、拖影 pass 不跑、重影为 0（合成里已有该规矩）；色散、发灰发糊、音频照旧。
- 验收：`node Taierzhuang1938/Script_BlastStunTest.mjs`（stun 窗分级、包络、叠加、calm、单调、Reset）；`Script_BlastFeedbackTest.mjs` 的眩晕段（flinch 关着，3 m 手榴弹 level > 0.5、`uAberration` 高于基准、`stunTrail` 在跑且 `targets.ldr` 指向它；12 m level ∈ (0, 0.3)；恢复后 level 归 0、`uAberration` 回基准、`targets.ldr` 回 composite 靶；全程无 console error），截图 `_shots/BlastFeedback/Stun_*.png`（640×360）。

验收：`Script_CameraShakeTest.mjs` 检查衰减、距离、遮挡、方向和封顶；`Script_BlastFeedbackTest.mjs` 用实际 Combat 手榴弹/炮弹入口检查相机、恢复与音频节点，用 OfflineAudioContext 渲染实际耳鸣方法，检查起音、低通、4 kHz 耳鸣、恢复及静音。`Script_FirstLevelEndTest.mjs` 检查桥梁只调用一次共用感知。截图与报告保存在忽略目录 `_shots/BlastFeedback/`。

本地预览验收可用 `BLAST_PREVIEW=http://127.0.0.1:<port>` 指向本任务 LocalPreview；不提供时测试自建临时服务。验收夹具为 `?explosions=1`，正式战役入口为 `?whitebox=p012`。
