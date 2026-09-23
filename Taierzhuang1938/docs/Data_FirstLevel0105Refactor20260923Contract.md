# 第一关 01–05 重构分包契约（2026-09-23）

本册冻结 2026-09-23 这一轮第一关 01–05（验到 06）重构的**名字、接口、文件归属、预算与验收口径**。各分包只按本册改名字；要改先改本册（由集成负责人改）。需求来源：

- 01–02 新稿：[Data_FirstLevelOpeningSource20260923.md](Data_FirstLevelOpeningSource20260923.md)（取代 09.21 稿）
- 03–05 正文：[Data_FirstLevelFrontSource20260922.md](Data_FirstLevelFrontSource20260922.md)（未变）
- 空间拓扑：[Data_FirstLevelTopologySource20260923.md](Data_FirstLevelTopologySource20260923.md)（参考图只留本地）
- 用户本轮追加要求（2026-09-23 对话）：①01–03 过场用 BlenderMCP + SeedAudio +（必要时）Codex imagegen 重做人物动画与必要物件白盒；②拓扑图只是简要生图，不合理处以实现方为准；③01–05 战斗音效要极致沉浸；④战车要有存在感、聪明、有压迫感；⑤敌军不许像木桩；⑥空间拓扑、关键帧构图、敌军布设对标 3A；⑦说话时脸部口型同步；⑧台词「各说各的」要根治，这一阶段不合理的语音都可以重新生成。验收只做到 06，07 以后没改就不测。

集成分支：`claude/level-01-05-refactor-d21b9c`（worktree `.claude/worktrees/cancel-reload-switch-weapon-cc432f`）。各分包从集成分支拉自己的分支与 worktree，完成后由集成负责人合并；**整轮完成前不往 master 推半成品**。

## 1. 调研结论摘要（病根，均已查证）

| 领域 | 病根 |
| --- | --- |
| 配音 | ①baker 请求没有参考音色，同一角色每次重新抽嗓子（跨段落认对说话人仅 20%）；②提示词强制把环境声烘进对白（01–05 共 223.5 s 录音里 50.8 s 是纯环境声），运行时整条单声道跟着说话人跳位置；③整条 loudnorm，同段电平差 13 dB；④剧情对白时 AI 喊话不让路，日军在喊四川话（f0eac8f00 回归）；⑤对齐格式不许重叠，插话无法表达。 |
| 口型 | 只有罗班长（Model_LugouNra05Facial.glb，11 根 Face_ 骨）有面部；NRA02、IJA01/02 有嘴洞无骨，IJA03 嘴是闭合几何；驱动读的是混了炮声的整条包络；对象池无视 castId。 |
| 01–02 空间 | 现为 7×7 m 小屋、门朝北，日军从北侧南北短沟进来——就在老周仍在开火的左机枪背后 9 m；撤退是出后门往南。新稿要求：前沿交通壕侧壁上的单口防炮洞，敌从东沿前沟来，撤退沿交通壕向西约 45 m（塌低段→完整土壁→折角）再到集结处。 |
| 03–05 空间 | 03 起点到阵位 97 m 全程看不见缺口、守军与阵位；右侧阵位/后墙岔口/弹药屋/投弹位挤在 33×48 m；取弹沟与接近沟中心线相距 5 m；无地标；战车路预告点被自家残墙挡住、停进我方纵深、05 打不到玩家。 |
| 战车 | 全仓库没有发动机/履带/炮塔声；主炮打固定点零散布、13 s 一发；05 机枪闸门恒 false；定时插值驾驶（横着滑、原地摆）；炸一下同帧全失能；护兵沿路中线被拖拽；掩体炸不坏、墙后连压制都取消。 |
| 敌军 | FireWindows 只放 3 打 3 压，其余端枪不开火（30 s 内 14/29 人零发）；阵位守卫与机枪 hold 成炮塔；跃进 60–90 s 跑完后原地坐 8 分钟；回退/机枪/弹药屋切入等钩子是死代码；日军喊话被换成四川话；没有军官、没有群体冲锋。 |
| 声景 | 壕沟被判成开阔地（2.6 s 旷野混响）；01 远处前线要等 24 s 才出声；离图前线是 5 个固定点循环；压制下无喘息心跳；耳鸣是单一正弦；日军步枪只有一条变体。 |
| 测试 | 纯 node 基线 46/49：TrenchPlanTest、FirstLevelSpaceTest、FirstLevelMissionTopologyTest 在 master 上就红；VoiceTest 强制「一段对白一次请求」并读 09.21 旧稿；开场驾驶器写死 09.21 的 phase；CharacterSpeechBrowserTest:46 断言普通士兵没有脸。 |

## 2. 本轮定下的决定（集成负责人拍板，不再问）

1. **02 还权门槛按 09.23 新稿**：日兵甲、乙必须被大刀真实砍死；岔口那名日兵被刘文财真实击倒；折角后的日兵与追兵**活着**也照样还权。取代 AGENTS.md 里「四名先头兵清场后才还权」的 09-23 现场口径（新稿编辑时间晚于那次反馈，且原文写明「不以NPC先清空四名日兵为前提」）。翻译逃向前沟，不设必杀。
2. **配音管线改为「定妆参考音 + 逐句干声分轨 + 对白导演时间轴」**，只用于 01–06 的 cue；07–18 暂保留整段录音，两种格式并存。旧规矩「一段对白 = 一次请求 = 一条 mp3」在根 AGENTS.md、项目 AGENTS.md、VoiceSync 文档里同步改写（Voice 包负责）。干声分轨里**不许烘环境声**；环境与动作声交给游戏事件与声景。
3. **日军一律说日语**（台词与自主喊话）：`side:"ija"` 的喊话恢复为纯假名并用 2–3 个固定日本兵嗓子重录；翻译说日语时带北方口音、谄媚。班组（顺子/幺娃/罗/何/刘/老周）的战斗短句改用各自定妆音。
4. **口型走骨骼，不用 morph**（守 MotionVector 契约第 12 条）：新做 NRA02、IJA02 面部 rig（IJA01 与 IJA02 头部同网格同顶点序，按顶点序拷权重），复用 NRA05；日兵乙从嘴闭合的 IJA03 改用 IJA01（均在批准选模清单内）。驱动用离线口型轨（逐句干声的语音能量 + 文本逐字/逐假名时间 → jaw/wide/round/close + 重音事件），运行时包络只做兜底。不下载新 Python 包：汉字到韵母的口形表手写（本关台词字数有限），假名直接映射元音。
5. **空间以 3A 线性关卡为准重排 01–06**：拓扑图只作关系参考；硬约束见 §4。战车停在土坎线以北、不开进我方纵深；守军背坡改成土坎南坡的浅掩体（从我方一侧看得见）；03 起点设观察射台（先看清「人在哪、口子在哪、谁在封」）；右侧口袋向东扩开，取弹沟与接近沟分离。
6. **03 完成条件**改为「何有田接枪 + 老周离枪 ≥10 m」即可，`zhouGunWounded`（老周走到集结处）移到 06 之前的背景事实，去掉约 100 s 空等；05 守军撤离与接防和玩家回撤并行。
7. **战车**：新纯规则大脑 `Script_FirstLevelTankBrain`（驾驶/炮手/机枪/反应/护兵槽），语义化路点；毁伤两段——命中履带＝`MobilityKill`（炮塔与机枪仍活，必须再投或罗班长补一枚），命中发动机舱/炮塔座圈＝`Disabled`；最多后倒 3 m 躲弹（不跨阶段倒退）；用炮塔后部机枪处理贴身死角；不加 HUD 标记（COD WaW 惯例），靠声音、炮塔指向和罗班长喊话传达窗口；炮管用运行时枢轴做俯仰/后坐（不重导 TZM，避免打破 Type89Damage 的 sha 断言）。发动机声按 89 式**甲型**（水冷汽油机）口径。
8. **敌军可以增援**，但必须从视线外（≥60 m 或被遮挡）按有来路的入口进入；02 预置的五组保持；增援预算见 §6。军官一名（IJA01 外观，挂军刀道具，手枪仍停用）。日军可用派生掩体与完整掩体周期——**只在第一关 01–06 的任务相位里开启**（任务侧开关），07 以后行为不变。
9. 所有「必须活着」的 NPC（守军批次、老周、班组）继续受 `missionUntargetable` / `scriptEssential` 保护；环境射击（ambient fire）只打授权点、`baseAccuracy 0`、不进 TTK 账、撤离窗口内不打缺口路径。
10. 录音、模型、动画、声效新资产按根 AGENTS.md 管线生成（SeedAudio/Blender/Codex imagegen→Lovart→即梦），不用 Lovart 做音频。

## 3. 分包与归属（第一波并行）

| 包 | 分支 / worktree（`.claude/worktrees/` 下） | 独占文件（只有本包改） | 可加薄钩子的共享文件 |
| --- | --- | --- | --- |
| **Space** 空间与布设 | `claude/l1r-space-20260923` / `bentleyblanks_Claude_L1RSpace_20260923` | Data_FirstLevelMissionLayout / Terrain / Trenches / TrenchCover / Fortifications / Topology、Data_FirstLevelFrontRoute、Data_FirstLevelMissionFront、Script_TrenchPlan*、Script_FirstLevelSpaceTest、Script_FirstLevelFrontTopologyTest、Script_FirstLevelMissionTopologyTest、Script_TrenchPlanTest、新 Data_FirstLevelFrontBreakables（数据） | Data_FirstLevelMission（只动 01–05 的 MISSION_ENCOUNTERS 位置/名册与 A.* 锚点）、Data_FirstLevelMissionGates（只动 01–05 生成表） |
| **Voice** 配音 | `claude/l1r-voice-20260923` / `bentleyblanks_Claude_L1RVoice_20260923` | Data_FirstLevelMissionDialogue、Data_FirstLevelJapaneseSpeech、新 Data_FirstLevelDialogueDirection、新 Data_FirstLevelVoiceCast、Script_SeedAudioFirstLevelBake、新 Script_SeedAudioCastBake、Script_FirstLevelMissionVoice、Script_FirstLevelVoiceAlign.py、Data_FirstLevelMissionVoiceTiming/Alignment、Audio/FirstLevel/**、Data_Voice（喊话行）、Script_VoiceBake、Audio/AudioVoice_*、Script_FirstLevelVoiceTest、Script_FirstLevelVoicePerspectiveTest、新 Script_DialoguePlayer（多声部播放器） | Script_Audio（story voice / Bark 让路 / dialogueDuck 段）、AGENTS.md 两处配音规矩、docs/Data_FirstLevelVoiceSync20260919.md |
| **Face** 口型 | `claude/l1r-face-20260923` / `bentleyblanks_Claude_L1RFace_20260923` | _import/Script_BakeCharacterFacial.py（由 Script_BakeNraFacial.py 泛化）、Model/Character/Model_Lugou*Facial.glb、Data_LugouCharacterManifest.json（facial 字段）、Script_CharacterFacialAnimation、Data_Tuning_CharacterSpeech、Script_SpeechEnvelope、新 Script_FirstLevelSpeakerBinder、新 Script_SpeakerHeadLayer、新 Script_FirstLevelFaceTrackBake.py、Audio/FirstLevel/Data_FirstLevelFaceTracks.json、Script_CharacterSpeech*Test | Script_CharacterModel（facial 选择）、Script_Actor（池子跳过 castId）、各 spawn 点传 castId、Data_FirstLevelP012Cast 或新 Data_FirstLevelSpeakingCast |
| **Tank** 战车 | `claude/l1r-tank-20260923` / `bentleyblanks_Claude_L1RTank_20260923` | 新 Script_FirstLevelTankBrain（纯规则）、新 Data_Tuning_Tank、新 Script_TankAudio、新 Script_FirstLevelFrontBreakables（运行时机制）、Script_Type89Damage（状态机/舱盖）、新 Script_FirstLevelTankBrainTest | Script_Vfx（MUZZLE_KINDS.cannon、尘环、履带尘、排气）、Script_CameraShake（Rumble）、Script_MaterialPatches（履带滚动）、Script_Combat（遮挡压制）、Data_SfxSources、Script_Audio（坦克 loop 配方段）、Script_FirstLevelMissionView（炮管枢轴）、Script_Main（车体中弹钩子、后机枪） |
| **Ai** 敌军 | `claude/l1r-ai-20260923` / `bentleyblanks_Claude_L1RAi_20260923` | Script_Ai、Script_AiTactics、Script_AiCover、Data_Tuning_Ai*、Data_AiBrainGraph、新 Script_FirstLevelFrontPressure（机制）、新 Script_FirstLevelBackdropSquads（01 背景兵机制）、新 Script_FirstLevelEnemyIdleProbe（浏览器探针） | Script_FirstLevelOpening（FireWindows 注入环境射击点）、Data_FirstLevelMission（只修 MISSION_TACTICS 过滤）、docs/Data_EnemyAi.md |
| **Sound** 声景 | `claude/l1r-sound-20260923` / `bentleyblanks_Claude_L1RSound_20260923` | Script_FirstLevelMissionBattleSound、Data_FirstLevelMissionBattleSound、Data_FirstLevelMissionMusic、新 Script_BattleArtillery（场外炮击调度）、Data_Tuning_Audio（新段）、Audio/Sfx/**（新增）、Script_AudioWiring（区域/壕沟声学/喘息心跳） | Script_Audio（AMBIENCE_PRESETS、REVERB_SPACES、IR、Deafen 段）、Data_SfxSources |
| **Anim** 开场动作库 | `claude/l1r-anim-20260923` / `bentleyblanks_Claude_L1RAnim_20260923` | _import/Script_OpeningStoryboardBake.py、_import/Script_MachineGunCaptivesBake.py（库）、Animation/OpeningStoryboards/**、Script_OpeningStoryboardAnimation、新道具（手持刺刀 prop 挂点、可动断木） | Data_OpeningStoryboards（只动 version/clip 表）、Script_OpeningActorPerformance（ContactClips 名单） |

第二波（第一波合并后）：**Opening**（01–02 导演按新稿重写，`Script_OpeningStoryboards` / `Data_OpeningStoryboards` / `Script_FirstLevelOpening` / `Script_FirstLevelCampaignOpening` / RearTrench 追兵）与 **Front**（03–05 战斗整合：各组角色与压力表数据、战车大脑接线、护兵、缺口、节奏、`Script_FirstLevelFrontBattle` / `Script_FirstLevelFrontShow` / Runtime 相关段 / `Script_FirstLevelCampaignFrontBattle`）。

**共享登记点**：`index.html` 的 `?v=` 与 `Script_TestRunner.mjs` 登记各包只改自己那几行；合并冲突由集成负责人按「每个键取较新的戳再抬一次」解决。字体子集（Font/Script_FontSubset.py 及 Style_Interface.css / index.html 的字体戳）只由集成负责人在最后跑一次。

## 4. 空间硬约束（Space 包必须满足，其余自定）

- 世界系不变：X 东、Z 南、Y 上，原点城中心；地面一律 `SampleMissionTerrain`/共享采样器，不另写高度公式。沟走 TrenchPlan 样条下挖；塌方态仍走 `layout.scenario`（scenario 体块不在 `MISSION_LAYOUT.blocks` 里，净空要分态单独扫）。
- 01：防炮洞是**前沿交通壕侧壁**上的单口低矮洞室（不是房子），洞口朝向与交通壕走向使趴在洞内低处能看到：洞口外审问/杀俘位、前方折角（日兵丙停步射击）、岔口（日兵丁探头）。日军从**东侧**沿前沟进入，前出者继续向纵深推进；01 的进场通道不得位于仍在开火的我方前沿（老周左机枪、背坡守军）背后 30 m 以内且互相可见。
- 02：审问位在洞口外沟边；还权位是洞口塌土形成的短遮挡（带碰撞与掩体标签）；撤退路线 洞口塌方后 → 沟壁塌低段（短暂暴露于前方折角射界）→ 完整土壁遮挡 → 后交通壕折角 → 支沟交汇处，全程约 40–60 m；折角切断近处直射；罗班长、何有田从后交通壕折角沿沟摸来（不从敌后凭空出现）；追兵沿原进攻方向追入，不从退路刷出；经过背坡伤员集结处（06 同一地点）。
- 03–05：前沿土坎东西向，守军在土坎**南坡浅掩体**（从我方一侧可见）；唯一撤退缺口在土坎中段，缺口前有最后遮挡；后交通壕安全区在壕内折角后并连到集结处；老周左前机枪位在后交通壕左前侧、对正面有侧射射界（不能隔完整土坎穿射）；右侧机枪阵位在缺口右侧、道路西侧的残墙院落，夺下后能射到缺口前、正面指定进攻组与道路；阵位后墙 + 支沟岔口紧贴阵位南侧；旧弹药屋在阵位东南后侧旧院（道路西侧）、从后门进；道路旁攻击位置由已知岔口进入的短支路（与弹药屋、原射口都不是同一点）；战车路从东北远段经路弯进入，停在土坎线以北；取弹沟不连通守军背坡。
- 关键帧（每个都要在实机截图里成立）：K1 01 醒来低视野（洞口外沟边、折角、岔口）；K2 02 越过翻译肩膀看见班长在后沟折角；K3 03 观察射台一眼看清「守军—缺口—冒火的右侧阵位」；K4 夺点后射位视野（缺口、正面进攻组、道路远段）；K5 战车在路远段露炮塔（hull-down 剪影）；K6 战车驶出路弯；K7 阵位后墙回看；K8 取弹沟受损沟沿看见同一辆战车；K9 攻击位看战车侧后；K10 缺口重开、余队通过；K11 回到集结处借火。
- 地标与引导线：路边电线杆（每 25–28 m、路口一根斜杆）、阵位院落山墙剪影、旧院枯树/院门、土坎端的弹坑（解释战车射界）。
- 规模参考（3A 线性关卡）：一场遭遇的交战距离主体在 15–60 m；掩体节奏每 6–10 m 一处可用遮挡；不留无动机的死胡同与锯齿；同一条沟不承担三段以上不同用途。
- 必须保留的连接：06 集结处到 07 南行路线（`MISSION_ROUTES.orders`、southTraffic 路 x≈8）照旧可走；07 以后坐标不动。

## 5. 冻结名字

### 5.1 01–02 角色（`who`）

`shunzi` 顺子（玩家，01 打趣有台词，被发现后不开口）｜`yaowa` 幺娃｜`comrade` 肩伤川军（新 id，取代 09.21 的 captiveHelper/captiveWounded 用于开场）｜`runner` 传令兵｜`luo` 罗班长｜`shouter` 洞外士兵｜`ijaA` 日兵甲（主审/割喉）｜`ijaB` 日兵乙（持枪警戒/踢人）｜`ijaC` 日兵丙（前沟/折角射击/远处催促）｜`ijaD` 日兵丁（岔口探头）｜`interpreter` 翻译｜`heyoutian` 何有田（02 持大刀，无台词）｜`liuwencai` 刘文财（02 远射，无台词）｜`guard` 撤回守军（02 末报告）。
外观：comrade/runner/guard/interpreter/幺娃/何/刘 用 NRA02 的批准变体（翻译用批准的平民/便衣外观，若清单无则沿用现状）；罗班长 NRA05Facial；ijaA = IJA02，ijaB = IJA01（改），ijaC/ijaD = IJA01/IJA02 各一。以 `Data_CharacterSelection.mjs` 为准。

### 5.2 01–02 对白场景（cue id）与逐句 id

逐句 id = `<Scene>.<NN>`（两位序号，按原文顺序）。干声文件 `Audio/FirstLevel/Lines/AudioVoice_FirstLevel<Scene>_<NN>.mp3`。台词逐字取自新稿，不改字。

| Scene | 行（who：原文，日语给「」原文，字幕为中文译文） |
| --- | --- |
| `BunkerBanter` | 01 shunzi 妈卖批。老子还没埋，坟头土先给我盖起了。02 yaowa 省事噻，等哈死了都不用挖坑。03 shunzi 滚。04 comrade 莫死这儿噻，山东的土老子睡不惯。05 yaowa 死人还挑地方？06 comrade 咋个不挑，老子要死也滚回四川死。07 shunzi 你想得还多，先把今天混过去。08 comrade 那肯定，老子命硬得很。09 yaowa 命硬还挨一枪？10 comrade 龟儿子枪法撇了噻。11 shunzi 那你还得谢谢他。12 comrade 等哈碰到，老子当面谢。13 yaowa 拿啥子谢？14 comrade 拿这个噻。 |
| `BunkerOrders` | 01 runner 班长！东头破了！鬼子的先头兵贴着炮上来了！02 luo 弹装起！往后沟撤！跟紧！ |
| `BunkerIncoming` | 01 shouter 炮弹！趴下——！（被爆炸截断） |
| `BunkerSearch` | 01 ijaC 「前へ！急げ！」（往前！快！）02 ijaD 「止まるな！」（别停！）——02 压住 01 尾音，允许重叠 |
| `CaptiveDragged` | 01 comrade 狗日的……你妈的……02 ijaA 「立て！」（起来！）03 comrade 日你……先人……04 ijaC 「右だ！撃て！」（右边！开火！） |
| `CaptiveInterrogation` | 01 ijaA 「部隊はどこへ退いた！聞け！」02 interpreter 「はい！」03 interpreter 你们的人往哪儿撤了？04 comrade ……啥子？05 interpreter 你们大队！往哪儿撤了！06 ijaB 「この支那野郎！早く言え！」07 comrade 滚……二鬼子。08 ijaA 「何と言った！」09 interpreter 「何も話しません！悪態ばかりです！」10 comrade 老子骂的就是你们……狗日的。11 comrade 小日本。 |
| `CaptiveTaunt` | 01 ijaA 「どうした、支那野郎！」02 ijaA 「その口で、まだ罵ってみろ！」03 ijaB 「馬鹿野郎。」04 ijaC 「前へ！急げ！」（远处） |
| `ShunziFound` | 01 ijaA 「まだいたか、この支那野郎。」 |
| `RescueInterrogation` | 01 ijaA 「こいつにも聞け！」02 interpreter 「はい！」03 interpreter 醒醒！你们的人往哪儿撤了？04 interpreter 听见没有？你们长官在哪儿？05 ijaB 「早くしろ！」06 interpreter 说话！ |
| `RescueFlee` | 01 interpreter 「敵だ！」 |
| `RescueCheck` | 01 luo 还能打不？ |
| `CollectionMeet` | 01 yaowa 顺哥！你脸咋了？02 shunzi 还能走。03 luo 莫堵到！ |
| `SupportOrder` | 01 guard 东头丢了！西边机枪还在顶，前头那几个下不来！02 luo 老周喃？03 guard 还在前头！机枪压到起的！04 luo 何有田守后头！顺子，跟老子走！05 shunzi 不是撤了？06 luo 先把那几个接下来！ |

下线：`TrenchCurse`、`RescueLift`、`RescueOut`、`BunkerKilling`、`ShunziCurse`、`CornerCheck`、`RescueCall`（及其 VoiceTiming 特判）。非台词人声（笑、闷哼、吸气、割喉后的窒息、拖拽时的喘）作为 `effort` 类干声另出（Voice 包决定生成方式，禁用刺耳的 TTS 惨叫，见记忆「短喊话的音频闸」），挂在对应角色头上播放。
03–06 的 cue id 与台词不变，但全部按新管线重录成逐句干声（同一 id 下的逐句文件）。

### 5.3 01–02 导演 phase（Opening 包实现；Anim 包按此出 clip）

Trapped：`Banter → Orders → Incoming → Blast → Black → Wake → FrontPass → CaptiveDragged → CaptiveWall → Interrogation → Slash → Taunt → Wipe → Reach → Found → Drag → Snag → KickBeam → DragOut → Butt → Boots`
BunkerRescue：`Hold → Ask → KickShunzi → Glimpse → Collar → Chop → Parry → Flee → DragCover → LongShot → Check → KickRifle → Released`
RearTrench（可玩）：`Withdraw → Corner → Collection → SupportOrder`
事实名沿用：Trapped `bunkerCollapsed`（Blast）/`captivesKilled`（Slash 后川军真实倒地）/`doorSearchStarted`（Found）；BunkerRescue `rescueCallHeard`（RescueInterrogation 开始）/`luoRescueComplete`（DragCover 完成且甲乙死亡）/`rifleRecovered`；RearTrench 四项不变。新增门：`vanguardMeleeResolved`（甲、乙死亡）、`junctionShot`（岔口日兵被刘文财击倒），二者是 `Check` 的前置；折角日兵与追兵不在门内。

### 5.4 开场动作 clip（Anim 包产出；五套骨架 Nra02/Nra05/Ija01/Ija02/Ija03 按需烘）

复用：ClipLoad、MessengerReport、CollarControl、CollarDrag、BayonetClearWood、ButtThreat、CreepDadao、DadaoHeavy、RifleDeflect/DadaoParry、KickRifle、GuardTurn、PointBlockade、InterrogateCrouch、InterpreterPoint、DeathCollapseA–D，及 MachineGunCaptives 库的 IjaKickPrisoner、IjaShoveForward、IjaTauntGesture、CaptiveKneelFlinch、CaptiveShovedStumble。
新做（名字冻结，成对的以 `+` 连接、共用接触时刻）：`WoundedSitRifleIdle`、`BanterLaugh`（加性）、`BanterLookShoulder`（加性）、`BanterPatRifle`（加性）、`WoundedRiseWall`、`BlastSlamBuried`、`IjaDragCollarFromDirt + IjaPullArm + CaptiveDraggedFromDirt`、`CaptiveKneelMud`、`CaptiveWallBrace`、`IjaHairGrabPull + CaptiveHeadPulledBack`、`IjaDrawBayonet`、`IjaThroatSlash + CaptiveThroatCut`、`CaptiveClutchThroat`、`CaptiveWallSlideTwitch`、`IjaWipeSheathBayonet`、`IjaReadyRifle`、`IjaCornerFire`、`IjaJunctionPeek`、`IjaSlingRifle`、`IjaCollarDragSnag`、`IjaKickBeam`、`IjaButtStrike`、`IjaHoldCollarUp`、`InterpreterCrouchAsk`、`InterpreterGrabCollar`、`InterpreterFlee`、`LuoDadaoChopRear + IjaChoppedFallWall`、`HeDadaoParryChop + IjaParriedChoppedFall`、`LuoDragToCover`（第一人称拖拽，玩家为被拖方）、`HeSwapDadaoRifle`、`LuoKneelCheck`。
道具：手持短刺刀（复用 Model_BayonetType38 挂右手，日兵甲的步枪 `bayonet:false`）、可动断木（被枪口拨动、被脚踢开）、川军夹在两腿间的枪（爆炸后掉进土里）、洞口塌土（Space 包出碰撞体）。

### 5.5 对白播放接口（Voice 包实现，Opening/Front/Face 消费）

```
voice.PlayScene(sceneId, { speakers: { [who]: actor | () => Vector3 }, gate?(lineId) => bool,
                           onLine?(lineId, who), onEnd?(), priority? }) → handle { Pause(), Resume(), Stop(), Skip(), lineId, done }
voice.PlayLine(lineId, speaker, opts?) → handle
voice.Speech(who) → { jaw, wide, round, close, stress, active }   // 口型驱动，优先读口型轨
voice.Say(cueId)  // 兼容旧入口：新格式 cue 用默认时间轴播放；07–18 旧 cue 仍是整段
```

每句一个独立声源，挂在说话人头骨（第一人称顺子走居中干声），允许按时间轴重叠；字幕按每句自己的起止；对白窗口内对 ambience/music/远处战斗做侧链压低，非 priority 的自主喊话让路。时间轴数据 `Data_FirstLevelDialogueDirection.mjs`：每句 `{ after: "prev"|"event:<name>"|"gate", offsetS, projection: "shout"|"normal"|"low"|"breath", intensity, spatial }`。

### 5.6 口型接口（Face 包）

`actor.facial.source = () => voice.Speech(who)`；`Script_FirstLevelSpeakerBinder.ActorFor(sceneId, lineId)` 统一「谁在说」→ 演员；`VoicePosition` 从它派生。口型轨 `Audio/FirstLevel/Data_FirstLevelFaceTracks.json` 以干声 sha256 为键。

### 5.7 战车接口（Tank 包）

```
CreateTankBrain(pathData, tuning) → brain
brain.Update(dt, world) → { drive:{ speed, yaw, reverse }, turret:{ yaw, pitch, rate }, fire:[ { weapon:"main"|"coax"|"rear", at:Vector3, kind } ],
                           barks:[ ... ], escorts:[ { id, anchor, radius, slack } ], state }
world：{ tankPose, targets[], Los(a,b), Cover(at), lastKnown, facts, rng }   // 纯数据适配，不 import three
路点：{ x, z, kind: "cruise"|"hullDown"|"firePoint"|"squeeze"|"block", holdS?, faceTo? }
毁伤：Intact → MobilityKill → Disabled（事实：tankImmobilized = 进入 MobilityKill 或 Disabled；tankFireDisabled = Disabled）
```

### 5.8 遭遇组 id

保留 `bunkerAssault`（扩为 ijaA–D 四人）；新增 `bunkerBackdrop`（01 背景推进与交火的剧本兵，含 2–3 名远处川军还击者）、`bunkerPursuit`（02 追兵：折角据守 1 + 跟进 2–3）、`frontOfficer`（前沿军官）、`frontReserve`（视线外入口的增援）。03–05 其余组 id 以 Space 包重排后的名册为准，写回本册 §8。

## 6. 预算（任何包不得突破）

| 项 | 上限 |
| --- | --- |
| 03–05 同时存活的敌人 | ≤ 30（含战车护兵与增援）；整个 01–05 累计出场 ≤ 55 |
| 场景三角形 / draw call | `SCENE_RENDER_LIMITS`（8.1 M / 5000），任一截图 ≤ 7.5 M；前沿 draw call 不超过现状 +10% |
| 帧时间 | MachineGun、FirstBatchSafe 两处 p95 ≤ 基线 ×1.2（同页交替 A/B 量） |
| ai 桶 | 均值 ≤ 基线 +1.0 ms，P95 ≤ +2.0 ms |
| 音频节点 | NODE_BUDGET 120 内：剧情语音同时 ≤ 3 路、战车常驻 loop ≤ 3、场外炮击/前线床 ≤ 8 |
| 开机下载 | 新面部 GLB 不重复内嵌贴图（按名重绑基础 GLB 的材质）；每套 ≤ 1.5 MB |
| 采样器 | 每材质变体 ≤ 16（SamplerBudgetTest） |
| TTK | DamageTest 25 m 三人 TTK 维持 8–24 s 门内；环境射击与压制弹不进 TTK 账 |

## 7. 验收

各包自证（包内）：本包新增/改动的纯 node 测试全绿；已知基线红（TrenchPlanTest、FirstLevelSpaceTest、FirstLevelMissionTopologyTest）若不归本包，结果与基线对照、不许新增红；浏览器验证**直接 `node` 跑脚本**（不经 runner 锁），证据只留 `_shots/`、`tmp/`、scratchpad。改浏览器模块必 bump `index.html` 的 `?v=`（Script_ModuleGraphTest）。

整轮集成验收（集成负责人）：
1. 纯 node：`Script_TestRunner.mjs --changed=origin/master --profile=quick` 全绿（三条基线红由 Space 包修掉）。
2. `node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-to=6 --audio`：01→06 一趟正常输入连续通过，零跳关、零检查点重试、页面错误 0。
3. `--campaign --stage-from=3 --stage-to=6 --probe-front-gun` 冷启动一趟。
4. 关键帧 K1–K11 实机截图逐张看过；口型采样（说话人嘴动、非说话人闭嘴）；敌军空转探针（每阶段 30 s 零发者 < 20%、4 s 不动者 ≤ 25%）；战车（露面可见、先压阵位再封口、05 对玩家有真实威胁窗口、毁伤两段）。
5. 07 以后未改动的阶段不测；改了共享系统（Script_Ai、Script_Audio 等）的地方用任务侧开关限定在 01–06，或补跑受影响段落。

## 8. 变更记录

- 2026-09-23 v1：首版（集成负责人）。
- 2026-09-23 v1.1：06 以 Notion 现稿为准（与 09.19 转录逐字一致，用户确认无改动）；06 的三段对白随 Voice 包按新管线重录。并入同日另一会话的整关评估（只读）发现的三处卡死，交第二波：①06 `columnDeparted` 空判（担架初始进度已 ≥ litterSpacingM，与 `zhouOnLitter` 同帧切到 07，`Collection.UpdateOrders` 停跑，老周担架停在 fallen → 08「担架停进遮挡」永不成立）归 Front 包修；②05 先炸车则 `attackPositionReached` 永不记录（`Script_FirstLevelFrontBattle.UpdateSortie` 只查 `bundleTaken`）归 Front 包随毁伤两段一起修；③02 还权无超时兜底归 Opening 包（新门也要有兜底，不许死锁）。驾驶器总走理想顺序测不出这三处，第二波要各补一个非理想顺序的负例。
- 2026-09-23 v1.2：空间比稿三方案（A 战斗空间优先 / B 关键帧优先 / C 系统优先），两位评审合计 A 胜（土坎两端交叉火力、「东头丢了」＝东端阵位被夺、战车路堑 hull-down + 路弯遮挡 + 坎线以北封口、05 攻击支路即先头兵来路）；嫁接 B 的战车车体/炮塔朝向拆分、右侧低沟射击踏台、后交通壕折角地标、北侧出发壕增援入口，C 的物理路障、横墙挡顺沟视线、旧键名兼容。**战车路点保留旧键名（tankPreviewIndex/Pressure/Block/End…），按路点 id 解析，不重新编号。**
- 2026-09-24 v1.3：用户追加两个新人物（Model 包，BlenderMCP，分支 `claude/l1r-model-20260924` 自集成 6511b93fb 拉出）：①以现有日军为底改出「刻板印象」日军（瘦长脸、高颧骨、细眼、一字小胡、胡茬、九八式战斗帽星徽），作 `ijaA`（拖拽、割喉、辱骂）并登记为**标准日军主变体**；②按经典汉奸翻译形象（圆胖脸、圆框眼镜、龅牙、星徽软帽、敞怀深色外衣+白汗衫）改出 `interpreter` 外观。两者都是面部骨骼人物，配口型与表情。§5.1 的外观以 Model 包最终登记为准。配音口径同日改为「同一段对话整段一次生成 → 切句 → 各自定位播放，少抽卡」（用户原话，取代 §2 第 2 条的逐句生成）；并行开多个 Blender 允许（不出错、无残留）。
- 2026-09-23 v1.3（Space 包交付，分支 `claude/l1r-space-20260923`）：01–06 空间按 [Data_FirstLevelSpace0106_20260923.md](Data_FirstLevelSpace0106_20260923.md) 落地，`MISSION_TOPOLOGY_VERSION` = `first-level-20260923-space-0106`。01–05 遭遇组 id 定稿如下（§5.8 所说「以 Space 包名册为准」）：

  | 组 id | 人数 | role | 出现（`MISSION_ENCOUNTER_ACTIVATION.spawn`） | 谁生成 |
  | --- | --- | --- | --- | --- |
  | `bunkerAssault` | 4 | ijaA / ijaB / ijaC / ijaD | step Trapped | 通用生成器 + Opening 导演 |
  | `bunkerBackdrop` | 日 6 + 川 3 | backdrop / backdropNra | fact `bunkerCollapsed` | Ai 包背景兵机制（含 `side:"nra"`，通用生成器不建） |
  | `bunkerPursuit` | 4 | pursuitBase / pursuit | fact `rifleRecovered` | Opening 包后交通壕追兵 |
  | `approach` | 4 | nestGun / nestGuard ×2 / linkGuard | step BunkerRescue | 通用 |
  | `front` | 10 | fireBase ×4 / bound ×6 | step BunkerRescue | 通用 |
  | `frontFlank`（新增，03 指定进攻组） | 4 | flank（带 `lane`） | step BunkerRescue，待命到 `frontBattleStarted` | 通用（按 `lane` 跃进由 Front 包接） |
  | `frontOfficer` | 1 | officer（带 `lane`） | 同上 | 通用 |
  | `machineGun` | 4 | push | step BunkerRescue | 通用 |
  | `tank` | 4 | escort | step BunkerRescue | 通用 + Tank 大脑（槽位 `FRONT_TANK_ESCORT_SLOTS`） |
  | `frontReserve` | 5 | reserve（`entry`、`stage`） | fact `tankPositionPressured` | Front 包前沿压力机制（04 放 2+2，05 放 1） |
  | `bundleApproach` | 2 | cutIn | step BunkerRescue | 通用 |

  累计 49 ≤ 55；03–05 最坏同时存活 30 ≤ 30。战车路点旧键 `tankPreviewIndex/Pressure/Block/End` 保留，由 `FrontTankIndex(id)` 按 id（HullDown/Pressure/Block/Squeeze）解析；路点带 `id/kind/faceTo/turretTo/holdS`，目标名在 `FRONT_SPACE.tankTargets`。新锚点键：`bunkerBend/bunkerJunction/bunkerFold/bunkerCrater/shunziDragged/supportJunction/frontObservation/guardSafeZone/gapJunction`；`bunkerRear` 语义改为「02 还权位」。可破坏掩体数据 `Data_FirstLevelFrontBreakables.mjs`，环境射击授权点 `FRONT_FIRE_POINTS`。
- 2026-09-24 v1.4（Space 包按两位评审修订，**待集成负责人确认**）：03–05 同时存活按实际生成表算为 29/29/30（上一版的 27/30 是手写模型）；为此 01–02 的 `bunkerAssault`（活下来的日兵丙）、`bunkerBackdrop`、`bunkerPursuit` 在 `MISSION_ENCOUNTER_ACTIVATION` 上新增 `retire` 字段（按事实 `collectionPointSeen` 经纵深支沟退场收走，或走完路线收走），由各自的生成方（Opening / Ai）执行。战车路点新增 id `CrestEast`、`Descent`（HullDown 改为台地边路堑折返顶，离机枪座 53.9 m；旧键仍按 id 解析）。关键帧 K4 拆成 K4/K4b/K4c。壕沟 21→22 段（`CollectionLink`）。细节见 [Data_FirstLevelSpace0106_20260923.md](Data_FirstLevelSpace0106_20260923.md) §10.1、§11.1。
