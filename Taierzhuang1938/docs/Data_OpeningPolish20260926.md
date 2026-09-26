# 01–03 开场细化（2026-09-26）

本轮范围：首次爆炸停顿、开场左侧幺娃的手腕、顺子第一人称手部、受审川军的愤怒语气、被拖出时的近景。沿用现有任务、台词与真实救援条件。

## 实现

- `Combat.FireShell` 新增默认关闭的 `feedbackOnly`。01 近爆显式开启：炮弹仍按真实弹道命中，保留 `onBlast` 爆声、VFX 和共享 `BlastFeedback`；不再为已经由场景事实切换的洞口额外造弹坑，或做零伤害的破坏、受击查询。普通炮弹行为不变。加载阶段等待爆炸图集完成，并让四种图集分别真实出画，覆盖贴图上传和驱动管线编译。
- 幺娃的 `Tableau/Tableau2` 从旧 `ClipLoad` 接到 `YaowaSitLoad`，装备与动作道具轨一致的汉阳造，取消贴在手背的额外弹夹。说话时仅叠加头部表演，胸部、双腕与步枪保持烘焙姿态；实模回归逐帧比较这些接触点。通过 BlenderMCP 只重烘 NRA02 的这条动作，可编辑工程在 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/OpeningCutscenePolish_20260926/Scene_TengxianNra02OpeningStoryboards.blend`。原网格、绑定及其他动作不变。
- 顺子在 Banter/Orders 左掌托住五发桥夹，轻抬手检查，步枪落在腿上；保留右手掏衣领的事件动作，命令结束后接推枪栓、起身。姿态、手指与道具配置分别在 `Data_OpeningStoryboards` / `Data_OpeningFirstPersonExtra`，运行时走原有解剖手臂求解。
- CaptiveDragged 进入 28° 垂直视场近景，固定顺子眼位，跟随队友脸部下方与揪领双手；CaptiveWall 开始后 0.7 秒回到原审问构图。退出与重试恢复原 FOV。`SB03_Drag` 以动作实际 `dragStart` 取帧，不用配音绝对秒数。取枪时视点沿沟口前探 0.2 m，给倒地队友的脸留出木梁之外的视线余量。
- 受审队友保持原词与四川口音，表演改为咬牙、愤怒、鄙夷、决绝。只重新生成 CaptiveDragged 和 CaptiveInterrogation 两场，整场一次请求后统一母带、切句；分错嗓子的句子才单独补录。录音、逐字时间与面部轨按当前哈希同步。
- 连续回归发现撤退追兵在错峰出发前会先寻远处掩体，偏离路线；前进时还会触发通用步兵随机绕障。现在等候期保持入口位置，出发后沿已检查的壕沟通道与路线到达半径前进，瞄准、射击、受伤仍由通用 AI 处理；不瞬移、不强杀、不放宽可见人数断言。三条路线的胶囊净空与坡度检查补入 `OpeningStoryboardsTest`。

## 重建与验收

动作仍由 `_import/Script_OpeningStoryboardBake.py` 重建，设置 `OPENING_MODEL=TengxianNra02`、`OPENING_CLIPS=YaowaSitLoad`。新的独立 Blender 目录做部分重烘时，manifest 合并保留未重烘动作的原验收报告。

配音验收机可用 `VOICE_WHISPER_PY`、`VOICE_EMBED_PY` 选择已安装的 Python。`VOICE_SPEAKER_WEIGHTS` 可指向 Qwen3-TTS 原始 `speaker_encoder.*` 张量的 safetensors 子集；只加载原来的 76 个张量，算法与门槛不变，无需下载语音生成模型的其余权重。本轮子集来自 [Qwen 官方模型](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base)，仅用于本地音色核对。

流程和镜头失败对照可给 `Script_FirstLevelMissionBrowserTest.mjs` / `Script_OpeningStoryboardShots.mjs` 加 `--baseline-root=<read-only checkout>`，与开机检查的同名参数一致：服务读取基线页面，截图、日志及回执仍写入当前任务目录。它只用于定位差异，不代替本轮正常连续流程验收。

本轮连续驾驶在 03 入阵位时遇到手榴弹，原驾驶器躲到西墙外后仍直奔墙另一侧的机枪位，等卡住超时才绕门；两句交接喊话已在这段等待中播完。`RightNestEntry` 现在复用 `ReturnToSeat` 的绕门规划，在躲避结束时立即按当前位置重排路线，仍使用普通玩家输入。喊话可见性、真实抵达、存活和任务事实断言不变。

关键入口：`OpeningStoryboardsTest`、`OpeningFirstPersonTest`、`OpeningClipsBrowserTest --clip=YaowaSitLoad --shots`、`OpeningStoryboardShots --shots=SB01,SB02,SB03`、`ExplosionRangeTest` 的剧情炮弹验收、`FirstLevelVoiceTest --audio`、`FirstLevelMissionBrowserTest --campaign --stage-to=3 --audio`，以及共享渲染和开机门禁。截图、冷启动逐帧记录与试听原片留在本地忽略目录，不提交。

## 本轮实测

- 同机 1280×720、high、独立浏览器冷启动，使用 `shot=1` 无声音渲染探针，从开场逐帧渲染到 Wake；带音频流程另外验收。首爆命中帧的 `StepFrames(1, 1/60, true)` 耗时从 71.6 ms 降至 20.9 ms；Blast 段中位数分别为 19.1 / 18.4 ms，最大值分别为 71.6 / 30.8 ms。原来的 `Combat.Blast` 单次 39.5 ms 查询与地形开销已不出现在此剧情命中帧；四种爆炸图集均在加载时预热，命中帧新增 program 为 0。这里记录脚本驱动整帧的耗时，不将它等同于所有机器的显示帧率。另一次与其他测试并行的记录不用于前后性能比较。
- `SB01`、`SB02`、`SB03_Drag`、`SB03` 实际截图已查看。最终拖拽镜头 FOV 为 28°，眼高 0.26 m，队友头部位于画面 (0.505, 0.383)，无人物或场景遮挡；审问时恢复原 FOV。NRA02 的 YaowaSitLoad 实模逐帧检查通过，未检出骨长变化、非有限值和单帧突跳。
- 新录音的 15 句切片、时间戳及面部轨哈希一致，`FirstLevelVoiceTest --audio` 通过。主要怒斥台词文字与音色核对通过；`CaptiveDragged.03` 和 `CaptiveInterrogation.06` 自动转写仍不确定，review 中保留 `needsListening`，不宣称人工听验通过。
- BlenderMCP 已保存并停止；`Script_BlenderMcp.mjs status --scan` 确认本任务实例及本机其它 Blender 进程均为零。
- `ExplosionRangeTest`、`MotionVectorContractTest`、high 画质的 `CarriagePropVelocityTest`、`RespawnShaderWarmTest`、部署包的白盒与正式菜单启动均通过。普通炮弹和重生入口保持原验收门槛。
- 镜头规则、镜头浏览器回归、14 个分镜构图检查均通过；`FirstLevelFrontPacingTest` 的 385 条断言通过。全套分镜中发现的 SB03A 木梁遮挡已经以视点微调修复，保留原遮挡断言。
- 合入 `21555d36` 的天空、战壕更新后，最终 `--campaign --stage-to=3 --audio` 连续通过，真实输入从 01 推至 04 入口：模拟 380.37 秒、页面错误 0、检查点重试 0，主角剩余生命 94。追兵回头、还权保护、三个真实救援击杀、口型、头手连续性与逐句可见性均保持原断言。实模 `OpeningActorPerformanceBrowserTest` 通过，新增 180 帧坐姿说话检查证明头部表演不改变双腕、胸部与步枪接触点。部署包 `Whitebox`、`MainMenu`、`MissingCharacters` 三入口通过，版本 `1575862648428488`。
- 最终 quick 选测 106 项，分批完成 105 项通过。`FirstLevelP012VisibilityTest` 的旧测试宿主缺少 `manualPoses`，在干净 `21555d36` 主检出复现相同异常，留作既有失败。爆炸回执旧宿主另缺 `BlastFeedback`，本轮改为继承真实 `CombatSystem` 原型后通过，未删减伤害与墙体遮挡断言。音频解码验收需要本机 ffmpeg 在 PATH 中，配置后严格音频检查通过。
- 七关 `BootTest` 未全绿：6 关报日军远景辨识材质计数为零。用干净的 `c668bbd8` 主检出逐关对照，复现相同 6 项失败；不是本轮新增失败，不降低断言，也不将它报告成全部通过。
