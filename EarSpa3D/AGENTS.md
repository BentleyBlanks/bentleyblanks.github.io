# EarSpa3D · Agent 指南

**3D 采耳 ASMR 解压游戏**。入口页：`EarSpa3D/index.html`。
接口契约与协作边界在 [`Data_Contract.md`](./Data_Contract.md)，**改任何跨模块的东西之前先读它**。

## 当前入口：拟物采耳与经营（2026-09-11）

`index.html` → `Script_ChunkGame.js` + `Script_ImmersiveScene.js` + `Script_PeelPhysics.mjs` + `Style_Chunk.css`。
以契约 §0 的拟物采耳与经营重设计为当前玩法。写实器具、工具接触、独立小铺与渲染资产见 [Data_TactileAssets.md](./Data_TactileAssets.md)。原 `Script_Main/Ui/Hand/Wax` 保留为旧玩法参考，
当前入口不再使用它们。ear010 的方向碎裂、羽毛微屑、限时服务及源工程见 [Data_DirectionalAssets.md](./Data_DirectionalAssets.md)。核心目标固定为真实接触、材质差异、完整取出或碎片清理、落盘/吸入、满意度经营，手机通过转向／施力模式用一指完成。

实际交互回归：
```powershell
node EarSpa3D/Script_PeelPhysicsTest.mjs
node EarSpa3D/Script_EconomyTest.mjs
node EarSpa3D/Script_LandingSoundTest.mjs
node EarSpa3D/Script_InstrumentInteractionTest.mjs
node EarSpa3D/Script_ControlPlayTest.mjs
node EarSpa3D/Script_DirectionalPhysicsTest.mjs
node EarSpa3D/Script_RenderingRegressionTest.mjs
node EarSpa3D/Script_DayTwoPerformanceTest.mjs --url=http://127.0.0.1:8081/EarSpa3D/
node EarSpa3D/Script_TactileDetailTest.mjs
node EarSpa3D/Script_TactilePlayTest.mjs
node EarSpa3D/Script_TactilePlayTest.mjs --touch
node EarSpa3D/Script_ChunkPlayTest.mjs --url=http://127.0.0.1:8081/EarSpa3D/
```
使用已安装的 `playwright-core` 与 Edge（可用 `EARSPA_BROWSER` 指定其他 Chromium 路径），
依次检查桌面、390×844、320×568、844×390 的真实鼠标/CDP 触屏整局。
验收图与报告写入忽略的 `_dev/`；必须另外查看截图，不能只看 PASS。
音频的信号分析及浏览器输出电平可以证明起音、静音和素材完整性，不能替代人的主观试听。
落盘三档已试听定稿及女声停用契约见 [Data_LandingAudio.md](./Data_LandingAudio.md)，后续不再生成或接入女声。

## 这是什么

一款给「强迫症 + 采耳爱好者」做的解压游戏：把真实采耳店的全套专业手法
（探、刮、挑、夹、扫、振、冲、吸、滴、照）做成可精细操作的交互，
配上自然写实的材质和 ASMR 音景，外加一个最小的经营环。

当前美术基调：模型与器具保留写实拟物；UI 按 2026-09-12 参考统一为暖黑半透明、米白文字、细衬线标题及米金细线选中态，覆盖启动页、HUD、商店、设置与结算。真实材质、结构、接触与可玩性优先；本轮 UI 参考不改游戏场景或玩法。
最新外耳入口和头发修订见 [Data_OuterAnatomyAssets.md](./Data_OuterAnatomyAssets.md)。耳廓参考、建模与纹理说明见 Data_ImmersiveAssets.md，玩法与画质边界见契约 §0。

## 三条硬约定（最容易踩的）

1. **1 世界单位 = 1 毫米**。耳道全长 28，管腔半径只有 2.5–3.4，房间约 9000。
   灯光的强度必须按毫米尺度标定（点光给 1~3 会暗到全黑）。
2. **`canal` 的空间函数返回的是解剖模块自己的缓存向量**，不是每次新建。
   拿到 `PointAt / NormalAt / FrameAt` 的返回值要**立刻拷进本地向量**再用；
   中途再调一次 canal 的函数就会把它们就地改掉。（踩过一次：内窥镜头因此
   一直朝着耳道外面看，画面全空且不报错。）
3. **耳道里不透光**。房间那套灯照进管腔会把画面糊成一片没有明暗的粉白。
   耳道视角下整组房间与角色都不渲染，照明交给挂在相机上的头灯。

## 怎么跑

```powershell
# 在 worktree 根
node scripts/Script_LocalPreview.mjs --no-open     # 主检出占了 8080，本树会落在 8081
# 手机验收（同一局域网）
node scripts/Script_LocalPreview.mjs --lan
```

页面加 `?debug=1` 会挂上 `window.__EarSpaDebug`（canal / hand / wax / shop / StepFrames …），
只在带参数时存在，普通玩家页面上没有可写全局。

## 怎么验（这是本项目的重点）

**截图证明不了「没报错」，也证明不了数值对不对。** 本项目的验收一律走 CDP 探针：

```powershell
# 页面有没有报错 / 404 / 挂了哪个模块
node EarSpa3D/_dev/Script_Probe.mjs --url "http://127.0.0.1:8081/EarSpa3D/index.html" --wait 12000

# 要看画面：先点开始、再主动推进固定帧数，最后截图
$e = Get-Content EarSpa3D/_dev/Diag_Step.js -Raw
node EarSpa3D/_dev/Script_Probe.mjs --url "http://127.0.0.1:8081/EarSpa3D/index.html?debug=1" `
  --size 900x620 --wait 10000 --post 1500 --eval "$e" --shot EarSpa3D/_dev/shot.png
```

两个已经踩过、必须记住的坑：

- **无头浏览器的 rAF 会被压到 ~1fps**。本作所有镜头与抬离都是「按时间收敛」的，
  1fps 下它们永远停在半路，截图里就是空白——看起来像渲染坏了，其实只是没走够帧。
  所以要看画面必须用 `__EarSpaDebug.StepFrames(n)` **主动推进**，不要等 rAF。
- **无头 `--window-size=390,844` 截出来的不是手机布局**（预览窗格有约 492px 的最小
  视口）。窄机验收要用 `Emulation.setDeviceMetricsOverride`，见
  [`_dev/Script_ShotCdp.mjs`](./_dev/Script_ShotCdp.mjs)。

`_dev/` 全是本地验收产物（自测页、截图、探针、录屏），已 gitignore，不进仓库。

## 模块地图

| 文件 | 职责 |
| --- | --- |
| `index.html` · `Script_Main.js` | 入口与装配、主循环、事件路由、经营环驱动 |
| `Script_Core.js` | 渲染核心、分级画质、自适应分辨率 |
| `Script_Input.js` | 触屏/鼠标/键盘/陀螺仪 → 归一化输入，含「精修档」 |
| `Script_Hand.js` | **手感核心**：把输入翻译成工具在耳道里的五自由度运动 |
| `Script_Camera.js` | 内窥 / 微距 / 店里三档机位、跟随弹簧、手抖、头灯朝向 |
| `Script_Session.js` | 一局的评分、舒适/酥麻、成就、慢镜 |
| `Script_Shop.js` | **经营环**：客人、报酬、工具与铺面升级、存档 |
| `Script_EarAnatomy.js` · `Script_Wax.js` · `Script_Character.js` | 耳部解剖、耵聍系统、可爱角色 |
| `Script_Tools.js` · `Data_EarTools.mjs` | 20 件专业采耳工具的几何与数据 |
| `Script_Materials.js` · `Script_Scene.js` | 程序化贴图材质、治愈系房间与灯光 |
| `Script_Audio.js` | 火山引擎 BGM/音效 + 连续接触声现场合成 |
| `Script_Ui.js` · `Style_EarSpa.css` | HUD、工具架、进深尺、小铺面板 |

## 玩法与经营环

一局 = 接待一位客人：
**开店（今日名单）→ 选客人 → 内窥视角采耳 → 清洁度到 100% 自动收工 →
收款单 → 花钱升级工具/铺面 → 下一位或打烊 → 明天**。

- 报酬：工时费（看清洁度）+ 小费（看舒适度）+ 连击 + 完美奖金。
  **干净比舒服更值钱**——掏不干净，再舒服也是没干完活。
- 工具升级（每件 5 级）**真的改手感**：`Script_Shop.LeveledSpec()` 改写
  `comfortGain / crackRisk / idealSpeedRange`，而耵聍判定读的正是这几个字段。
- 声望决定客人的档次（`CUSTOMER_TIERS`），客人越难报酬越高。
- 铺面 4 级，解锁氛围（mood）、提高单价与每日客数。

## 改动时的自检

1. 改完跑一次探针，要求 `clean: true`（无 console 错误、无 404、无未捕获异常）。
2. 页面 CSS 或 JS 有变化 → 同步改 `index.html` 里的 `?v=` 版本戳（**提交前**）。
3. 动到耳道空间、机位或光照的改动，必须附一次 `StepFrames` 后的截图与探针读数，
   不能只贴断言。本项目的画面问题历史上全都「不报错」。
