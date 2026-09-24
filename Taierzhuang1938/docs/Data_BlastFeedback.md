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

验收：`Script_CameraShakeTest.mjs` 检查衰减、距离、遮挡、方向和封顶；`Script_BlastFeedbackTest.mjs` 用实际 Combat 手榴弹/炮弹入口检查相机、恢复与音频节点，用 OfflineAudioContext 渲染实际耳鸣方法，检查起音、低通、4 kHz 耳鸣、恢复及静音。`Script_FirstLevelEndTest.mjs` 检查桥梁只调用一次共用感知。截图与报告保存在忽略目录 `_shots/BlastFeedback/`。

本地预览验收可用 `BLAST_PREVIEW=http://127.0.0.1:<port>` 指向本任务 LocalPreview；不提供时测试自建临时服务。验收夹具为 `?explosions=1`，正式战役入口为 `?whitebox=p012`。
