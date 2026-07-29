# Blackstone1943 接力说明（云端 → 本地 Claude Code）

《黑石峪 · 一九四三年冬》——1943 年冬华北敌后，Three.js 第三人称潜行动作冒险。
分支：`claude/blackstone-1943-action-20260729`　　线上地址（部署后）：`https://bentleyblanks.github.io/Blackstone1943/`

---

## 一、本地怎么接上（PowerShell）

仓库 `AGENTS.md` 规定**一切改动都在独立 worktree 里做**，别在主检出上切分支：

```powershell
cd C:\Users\Bentl\Documents\Program\bentleyblanks.github.io
git fetch origin claude/blackstone-1943-action-20260729

$wt = 'C:\Users\Bentl\Documents\Program\bentleyblanks_Claude_Blackstone1943_20260730'
git worktree add $wt claude/blackstone-1943-action-20260729
cd $wt

npm i -D playwright          # QA 探针要用（只装一次）
npx playwright install chromium
```

自检一遍，确认接上了：

```powershell
node Blackstone1943\Script_SmokeTest.mjs          # 应输出 24 通过 / 0 失败
node Blackstone1943\_dev\Qa.mjs                   # 出截图到 Blackstone1943\_dev\shots\
```

然后在这个 worktree 目录里开 `claude`。

---

## 二、现在做到哪了

### 已完成

| 模块 | 状态 |
|---|---|
| `AGENTS.md` 模块契约 | 1600+ 行，16 个模块 API 签名写死、事件表 40 条、10 个 owner 零重叠 —— **这是唯一事实源** |
| `Script_Config.mjs` | 762 行，全部可调数值（弹药 12 发、敌人两发致死、噪音半径、警戒涨落、体温体力、调色板） |
| `Script_Math.mjs` | 583 行，确定性随机 / 噪声 / 缓动 / 向量，零 three 依赖 |
| `Script_Event.mjs` | 294 行，事件总线（通配符订阅、异常隔离、环形历史） |
| `Script_Rules.mjs` | 904 行，**纯逻辑**：三幕状态机、探测数学、生存演算、合成、代价账本（不计分，测试锁死） |
| `Script_World.mjs` | ~3700 行，三幕完整场景：村口牌坊/磨坊地窖/院落狗洞/梯田/窑洞/断桥/碉堡哨卡/岩缝/探照灯塔；OBB 碰撞 + 台阶抬升、加权 A\*、天空开阔度预烘、自写几何合并（全场 40 个 Mesh） |
| `Script_Art.mjs` | 1100+ 行，三幕 light rig、高度雾（`onBeforeCompile` 注入）、三层视差远山、程序化材质、bloom/暗角/颗粒/去饱和、火堆与呵气、质量分档 |
| `index.html` + `Style_Game.css` + `Script_Hud.mjs` | 标题画面、完整 HUD、字幕、触屏控件、无障碍设置（2900+ 行） |
| `Script_Boot.mjs` | 装配 + 主循环 + `window.__Blackstone` 调试入口 |
| `Script_SmokeTest.mjs` | 24 项，退出码即成败 |

### 未完成（这就是要继续的活）

这 7 个模块目前只是**地基阶段的最小可运行实现**，专家 agent 因会话额度中断没跑：

| 文件 | 现状 | 要做成什么 |
|---|---|---|
| `Script_Character.mjs` | 491 行，方块木偶 | 程序化骨骼 + 动画状态机、足部 IK、着装区分（我军/伪军/日军/孩子）、受伤体态 |
| `Script_Player.mjs` | 642 行，能走能看 | 越肩相机换肩、贴墙掩体、翻越、钻狗洞、屏息、举枪时间、抛物线预览、手柄 |
| `Script_EnemyAi.mjs` | 241 行，占位 | 感知（视锥×光照×姿态×遮蔽）+ 三段警戒 + 分区搜索 + 小队协同 + 军犬 + 探照灯 |
| `Script_Combat.mjs` | 140 行，占位 | 栓动步枪拉栓、近战轻重击格挡、潜行处决（不血腥）、投掷、hitstop、压制 |
| `Script_Survival.mjs` | 238 行，占位 | 8 格背包、实时合成、失血/体温/体力/饥饿耦合、搜刮（多数容器是空的）、篝火营地时刻 |
| `Script_Story.mjs` + `Data_Story.mjs` | 222 + 359 行，骨架 | 三幕节拍、冯小满伴随 AI（找掩体/指路/钻洞/递弹药/放风/被抓救援）、反应式台词库、两种结局 |
| `Script_Audio.mjs` | 266 行，占位 | WebAudio 全合成：脚步分材质、枪声山谷回声、风雪层、动态混音、自适应分层配乐 |

### 已知问题（诚实清单）

- 角色是方块木偶——目前画面最露怯的一环
- 树冠是单个实心圆锥，任何光照下都读成纸板（World owner 已记录）
- 长条几何 UV 拉满 0—1，纹理被扯成条纹，需要世界尺度 UV
- `Script_Hud.mjs` 发了三个契约外事件 `RequestPause` / `RequestRestart` / `RequestTitle`，`Script_Boot.mjs` 还没处理 → 菜单能开但暂停不生效
- 无头软件光栅下 fps 数字没有参考价值（3—7），真实性能要在本地带 GPU 的浏览器上量

---

## 三、在本地 cc 里怎么继续

### 最省事：直接把下面这段话贴给本地的 Claude Code

> 读 `Blackstone1943/_dev/Handoff.md` 和 `Blackstone1943/AGENTS.md`。
> 继续完成《黑石峪 · 一九四三年冬》剩余的 7 个模块：Character / Player / EnemyAi / Combat / Survival / Story+Data_Story / Audio。
> 用 `Blackstone1943/_dev/Workflow_Specialists.js` 里对应的 agent 提示词作为各模块的任务书（只跑未完成的那 7 个，World 和 Art 已经做完了别动）。
> 每个模块做完必须：`node --check` + `node Blackstone1943/Script_SmokeTest.mjs` + `node Blackstone1943/_dev/Qa.mjs` 且亲眼看截图。
> 然后跑 `Blackstone1943/_dev/Workflow_ReviewLoop.js` 的四条审查线（玩法/剧情/视觉/性能），不达标就退回重做，循环到全线 PASS。

### 如果本地 cc 有 Workflow 工具（多 agent 编排）

```
Workflow({ scriptPath: "Blackstone1943/_dev/Workflow_Specialists.js" })
Workflow({ scriptPath: "Blackstone1943/_dev/Workflow_ReviewLoop.js", args: { round: 1 } })
```

两个脚本顶部都有一行 `const ROOT = process.env.BLACKSTONE_ROOT || 'C:/Users/Bentl/...'`，
**先把它改成你 worktree 的实际路径**（或设环境变量 `BLACKSTONE_ROOT`）。

`Workflow_ReviewLoop.js` 是**一轮**审查+整改+复检。反复调用并把上一轮的 blocker 传进去，就是 `/loop` 迭代：

```
Workflow({ scriptPath: "...", args: { round: 2, previousBlockers: "<上一轮返回的 blockers 列表>" } })
```

### 如果没有 Workflow 工具

`Workflow_Specialists.js` 里每个 `agent(...)` 的第一个参数就是完整的领域任务书，直接当 Task/子 agent 的 prompt 用，一个模块一个 agent，串行也行。

---

## 四、工具

| 命令 | 作用 |
|---|---|
| `node Blackstone1943\Script_SmokeTest.mjs` | 24 项冒烟，退出码即成败。**每次改完必跑** |
| `node Blackstone1943\_dev\Qa.mjs` | 起静态服务器 + 无头浏览器跑一遍，输出 consoleErrors / pageErrors / `window.__Blackstone.debug`，并截图 |
| `node Blackstone1943\_dev\Qa.mjs --steps "wait:2500;click:#BeginButton;wait:3000;key:w:2000;shot:Walk" --width 1920 --height 1080` | 自定义游玩脚本 + 出图 |
| 浏览器里 `window.__Blackstone` | `ctx` / `debug`（fps、drawCalls、triangles、各模块 Update 耗时） |

`Blackstone1943/_dev/Brief.md` 是制作纲领（创意方向、角色、三幕、系统设计、**历史伦理红线**），
`Blackstone1943/AGENTS.md` 是模块契约（API 签名、事件表、所有权）。**改代码前先读契约。**

---

## 五、部署

站点只从 `master` 部署。全部做完、冒烟与 QA 全绿之后：

```powershell
git fetch origin master
git rebase origin/master          # 若 master 前进了
node Blackstone1943\Script_SmokeTest.mjs
git push origin HEAD:master       # 快进推送，禁止 force
curl.exe -sI https://bentleyblanks.github.io/Blackstone1943/
```

别忘了在站点首页（根 `index.html`）加一个指向 `/Blackstone1943/` 的入口，
并把冒烟测试挂进根 `package.json` 的 `test` 脚本：
`"test:blackstone1943": "node Blackstone1943/Script_SmokeTest.mjs"`。

---

## 六、关于 BlenderMCP

云端容器够不到你本机的 BlenderMCP（本地 stdio MCP 无法从远程会话访问），所以这一版全部是程序化生成的几何与音频。
本地接力后你就能用上了。**最值得用的三处**（其余保持程序化，别破坏"零外部运行时依赖"）：

1. 沈铁 / 冯小满 / 伪军 / 日军的角色网格 —— 目前的方块木偶是画面最大短板
2. 碾盘、独轮车、水井、门楼这类有辨识度的道具
3. 碉堡与磨坊的建筑主体

导出低模 glb + Draco，控制在几百 KB；材质仍走 `Script_Art.mjs` 的程序化调色，保住冷灰＋火橙的视觉签名。
走这条路要在 `index.html` 的 importmap 里加 GLTFLoader（`vendor/three/examples/jsm/loaders/` 目前没 vendor 进来，需要补）。
