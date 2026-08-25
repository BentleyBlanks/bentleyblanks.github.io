# 代码考古：既有 three.js 项目里可直接搬进 Taierzhuang1938 FPS demo 的技法清单

# 代码考古报告：可直接复用到 FPS demo 的技法

考古范围：`TunnelLight1943/`（2.5D 横版叙事，代码量最大、事故记录最全）、`TunnelBell1942/`（分层纪律的样板）、`PrairieFire1937/`（三维六角策略，唯一一个真正做过 PBR / shader 注入 / 视觉审核的项目）、根目录 `AGENTS.md`。

**先说一个前提**：`Taierzhuang1938/` 已经不是空目录了。已存在 `Script_Noise.mjs`（Mulberry32 / ValueNoise2,3 / Fbm / Ridged / Warp / Worley / Tileable 全套）、`Script_TexBake.mjs`（BakeBrickWall / BakeAdobe / BakeRoofTile / BakeWood / BakeCloth / BakeSteel / BakeRubbleGround / BakeSandbag / BakeStone + `HeightToNormal`）、`Script_Materials.mjs`、`Script_Geo.mjs`、`Script_Light.mjs`、`Script_Post.mjs`、`Script_Sky.mjs`、`Script_Probe.mjs`、`Script_ShotTest.mjs`、`Script_DevServer.mjs`。也就是说**噪声与程序化贴图这一层已经搬过去了**。本报告因此把重点放在**还没搬的那几层**：分层纪律、rig/步态、WebAudio、测试电池、缓存戳、以及一批只有踩过才知道的坑。

---

## 一、命名与分层规矩（硬规矩，逐条带出处）

### 1.1 仓库级命名（根 `AGENTS.md`）

| 规矩 | 出处 |
|---|---|
| 脚本/源文件/资产**只用英文名**；玩家可见文本才本地化 | `AGENTS.md:47` |
| 文件名词干、项目自有函数名用 **PascalCase** | `AGENTS.md:48` |
| 变量、参数、局部绑定用 **lowerCamelCase** | `AGENTS.md:49` |
| **禁止连字符 `-`**，需要分隔符时一律下划线 `_` | `AGENTS.md:50` |
| 资产文件名必须暴露类别：`<Category>_<DescriptivePascalCase>.<ext>` | `AGENTS.md:51` |
| 允许的类别前缀：`Model_ Texture_ Icon_ AudioBgm_ AudioSfx_ Scene_ Script_ Shader_ Material_ Animation_ Font_ Data_`；新增类别要先议定并写进文档 | `AGENTS.md:52,54` |
| 引擎强制的回调名、第三方 vendor 文件保留原拼写，不许为统一风格改坏它 | `AGENTS.md:55` |
| worktree 强制：编辑/提交/推送/切分支一律不在主检出做 | `AGENTS.md:3-9` |

FPS demo 已经遵守（`Script_Noise.mjs` / `Script_TexBake.mjs` 等）。要补的是：**资产类别前缀**。若之后落地任何烘出来的贴图/音频文件，必须叫 `Texture_BrickWall.png` / `AudioSfx_RifleShot.mp3`，不能叫 `brick-wall.png`。

### 1.2 分层纪律（`TunnelBell1942/AGENTS.md:136-157`，本仓库最值得照抄的一段）

这是一张**文件所有权表 + 四条硬约束**：

- `Data_*.mjs` / `Script_Rules.mjs` **绝对不许 import three.js**，必须能在纯 Node 里跑 —— `TunnelBell1942/AGENTS.md:151-152`。**冒烟测试的全部价值建立在这一条上**：逻辑层能 `node` 直跑，才可能有秒级的自动通关测试。
- `Script_Render.mjs` / `Script_Actor.mjs` **绝对不许写 state**，只读 state、只画 —— `:153`。
- 三方库只有仓库内 `vendor/three`，**不许加新依赖、不许 CDN、不许外部图片/音频** —— `:154`（根 `AGENTS.md:138` 复述一遍）。
- 玩家可见文本简体中文，代码注释可中文 —— `:157`。

`PrairieFire1937/AGENTS.md:60-61` 把它推到三维项目上，多两条：

- **纯逻辑模块禁止 `window` / `document` / `three` / `Math.random()`**；随机一律走可存档的 RNG（`Script_Hex.CreateRng` / `StepRng`），保证同种子可复现。
- **渲染模块顶层不得有 DOM/WebGL 副作用**（冒烟测试会扫描源码并报错），全部访问放进函数体内。

**给 FPS 的落法**：现在 `Script_Geo/Materials/Light/Post/Sky` 都是渲染层。建议立刻划出一条 `Script_Rules.mjs`（或 `Script_Core.mjs`）作为纯逻辑层——玩家移动/命中判定/敌人 AI/关卡状态全在里面，不 import three，用 `Script_Noise.Mulberry32` 当随机源。**这条线现在划，成本是零；等射击手感调完再划，就是重写。**

### 1.3 数值只在代码里，文档只写常量名

`TunnelLight1943/CLAUDE.md:162`：「**数值只在代码里**（`Data_DepthSpec` / `Data_Ladder` / `PLAY_HW` …），文档写常量名不抄数。」配套 `:159-164` 是一份「怎么写规矩」的元规矩：新规矩三行以内 —— **【规矩】一句 / 【为什么】一句 / 【守着它的】测试名或判据**；超过就去分册；事故过程写进 `Data_DesignHistory.md`；一条规矩有测试守着就写测试名，不必再讲事故；**本文件超过 400 行就该瘦身**。

这套「CLAUDE.md 只放硬规矩 + 路由表，docs/ 分册按需读」的结构（`CLAUDE.md:11-25` 那张路由表）是 TunnelLight 花了很久才收敛出来的，FPS demo 直接照抄结构即可，别再从零发明。

---

## 二、可复用技法清单

### 2.1 稳定哈希 / 确定性随机（★必抄，已部分抄）

- `TunnelLight1943/Script_Art.mjs:80` `Hash(id)` —— FNV-1a 字符串哈希，返回 0..1。配套 `Rnd(id,i)=Hash(`${id}#${i}`)`（`:90`）、`Sym(id,i,amp)`（`:91`）。
- `PrairieFire1937/Script_Hex.mjs:142` `CreateRng(seed)` / `:154` `StepRng(rngState)` —— 后者返回 `{value, state}`，**便于把随机状态存进存档**，这是可复现回放的前提。
- `TunnelBell1942/Script_Render.mjs:481-517` 一整套：`Hash1/Hash2/Smooth5/ValueNoise2/Fbm2/StrSeed/MakeRng`。

**用法**：一切"抖动/破损/散布"的参数都由一个稳定 id 派生，绝不用 `Math.random()`。好处是逐帧稳定不闪、无头测试可复现、同一堵墙每次加载长得一模一样。FPS 里尤其重要——弹孔位置、碎石散布、敌人巡逻抖动都该走它。

```js
// Script_Art.mjs:80
export function Hash(id) {
  let h = 2166136261;
  const s = String(id);
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}
```

### 2.2 程序化贴图（部分已抄，还差三件）

FPS 的 `Script_TexBake.mjs` 已有 PBR 路线（albedo + `HeightToNormal` + roughness）。从 `Script_Art.mjs` 还能捞三样**跟风格无关的通用笔**（`TunnelLight1943/docs/Art.md` 「材质是形，不是颜色」）：

- **`ClothFold`**（`Script_Art.mjs:213`）：一道布褶 = 受力点拉出的谷（谷心暗）+ 背光侧一条绷亮的脊，两头自己散掉。做旗子、帆布、沙袋蒙布、尸体上的军装都用它。
- **`CharScale`**（`:243`）：烧焦木头的**龟裂鳞网**。注意它自带一条防呆：`span < 4` 直接 return、`cell` 夹到 `span*0.55`——**细长件铺鳞会读成铁链/梯子**（原文事故：五像素粗的椽子铺完读成三条挂着的铁链）。台儿庄是巷战废墟，焦木一定用得上。
- **`DrawAshHeap`**（`:285`）：灰堆**没有轮廓线**——一描墨边就成了石头。

另外两条数学件值得直接搬：

- **`Dim(hex, k)`**（`:446`）：按 γ 压暗，附一张实测反推表（目标上屏 210→源 166 / 200→149 / 190→134 / 150→79 / 120→49）。见坑 P1。
- **`TopRy(halfDepthPx, hPx)`**（`:469`）：按机位算「朝上那一面压扁多少」。公式 `ry = F·(EYE − h)·r / (DIST² − r²)`。**在真 3D FPS 里这条不需要**（透视自己会算），但它背后的规矩要留：**「一屏里只有两件东西有透视，比全都没有还别扭」**——这句适用于任何风格化取舍。

### 2.3 CanvasTexture 的正确参数（★必抄）

`TunnelLight1943/Script_WorldPaint.mjs:28`：

```js
export function CanvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  return tex;
}
```

`:393-395` 记着一条：路面这类**掠射角看的大平面** anisotropy 要给到 16，给 4 的话只能靠降 mip 补，几道渐变的过渡带会糊。FPS 的地面/墙面正是掠射角大户，**默认 4、地面 16** 直接照搬。

补一条 FPS 特有的：`Script_World.js:5721` 记着「视频贴图不能开 mipmap」（`generateMipmaps=false` + `LinearFilter`）；同理，**用作 data 的贴图（法线/粗糙度/遮挡）不能走 sRGB**，只有 albedo 走 sRGB。这条在 `Script_TexBake.mjs` 里必须显式写死，不能靠默认。

### 2.4 超采样烘焙（★推荐）

`Script_WorldPaint.mjs:41` `BakeSprite(wPx,hPx,anchorX,groundYPx,drawFn, blur, ss, haze)`：`ss` 是超采样倍率——**调用处仍按 48px/米 标注尺寸，内部把画布加密 ss 倍，世界尺寸不变、贴图密度变高**，特写推到 480px/米也不糊。`CLAUDE.md:140`：「会被盯着看的 canvas 必须超采样（`HINT_SS/PROP_SS/DETAIL_SS`）。」

FPS 里"会被盯着看"的是**枪械 viewmodel 和 HUD**——玩家整局都盯着枪。这两处的贴图分辨率必须单独一档，跟环境贴图分开。

同函数里的 `haze` 参数值得注意：空气透视用 **`source-atop` 只染这张精灵自己**，而不是往画面上盖一层雾。`Script_Rig.mjs:133-141` 复述了原因：「背景层的人一半透明，身后的树和炮楼就从他身上透出来——那是穿帮不是雾。」FPS 里做距离雾时同理，**半透明 ≠ 雾**。

### 2.5 人物 rig 与步态（★这是最难重造的一块）

`TunnelLight1943/Script_Rig.mjs` 是 17 关节的 2D 侧视骨架，**骨架结构本身不能照搬到 3D FPS**，但下面五件是**维度无关**的：

**(a) 两骨 IK 与解剖闸** —— `Script_Rig.mjs:3114` `ArmIK(tx,ty,elbow,La,Lf)`：余弦定理解两骨，**够不着就把距离夹到臂长（伸直去够），永远给得出一组角度**——"手到不了是摆位的错，不该让反解在这儿抛"。`:1722` `LegIK` 是同一条式子换骨长。

配套 `:3141` `ApplyPose` 里的**解剖闸**：

```js
t.shinB = Math.max(0, Math.min(150 * DEG, t.shinB));   // 膝只能往后屈
t.foreB = Math.max(-155 * DEG, Math.min(0, t.foreB));  // 肘只能往前屈
t.handB = Math.max(-75 * DEG, Math.min(75 * DEG, t.handB || 0));
```

事故记录：一条**写错的注释**（"foreF 正值＝小臂折回来"）被照抄 51 处，全场胳膊在肘上反着弯。**这道闸是防再犯：谁写反了顶多是伸直，绝不会再翻过去。** 任何 3D rig 都该有这道闸。

另有一条 `:3129` 的坑：**肘的相对角必须折回 (−π, π]**（`Wrap`）——手举过头顶时大臂世界角在 −90° 以外，前臂减大臂会跑出 ±180°，同一个肘弯算出来是 +240° 而不是 −120°，判成"反关节"再被夹到 0，两条胳膊当场绷成直棍。

**(b) 步频公式** —— `:67` `WalkCadence(speed, bodyScale)`：

```js
const vRel = Math.abs(speed || 0) / bs;
const base = Math.max(1.0, Math.min(3.5, 0.99 + 0.65 * vRel));
return base / Math.sqrt(bs);          // 步/秒
```

老版按位移数步（3.4 弧度/米）＝"脚不打滑"，结果 4.2m/s 的角色一秒 7 步。现实里步频跟速度走一条很平的曲线（散步 1.7/s、快走 2/s、慢跑 2.6/s、冲刺 3.2/s），**提速主要靠迈大步**；摆的周期 ∝ √腿长，所以小孩步频高一档。取舍写在注释里：**把「步频对」放在「脚不滑」前头**。FPS 的脚步声频率、敌人跑动动画速率直接用这条。

**(c) 步态求解** —— `:1844` `GaitLegs(target, p, g, o)`：一步 = 相位 π。**着地段**脚钉在地上相对胯匀速往后蹭（前 +a 到后 −a）；**摆动段**脚离地画一道 Catmull-Rom 弧往前送（五个控制点：蹬离 → 后甩抬脚 → 过身抬膝 → 前够 → 落地）。走路 duty 0.60（有双支撑）、跑步 0.42（有腾空）。**腿的角度由两骨反解给——脚放哪儿、膝就弯多少**，不是各摆各的正弦。

**(d) 地面吸附** —— `:1806` `LowestContact(t)` + `:1818` `GroundWeight(s)` + `ApplyPose` 里那段：**胯高不信手填的值，按腿的几何算——两只脚（鞋底/鞋尖/鞋面）与两个膝里最低的那个点钉在地平线上**。站着踩鞋底、跪着压膝头、踮着踩鞋尖，全是同一条规矩。离地时（被抱/爬梯/躺/腾空轨道）按 `GroundWeight` 权重混合，抱起来那一下不跳。

这条治的是用户原话「非常多的动作，脚都是会在 Y 轴漂移的」。**FPS 的第三人称敌人、掩体后的 NPC 一样会犯**，值得直接移植思路。

**(e) 姿态过渡用真正的指数平滑** —— `:1920` `PoseRig` 里点名：老版 `dt*12` 是线性近似，掉帧那几帧会过冲。`docs/Rig.md:60` 另有一条：**轨道插值走单调 Hermite 穿过关键帧，别每段各自 smoothstep**。

### 2.6 遮挡光照与光柱（有条件复用）

`TunnelLight1943/Script_Light.mjs`：
- `:20` `BuildOccluder(bounds, solids, air)` —— 烘一张遮挡掩码（白=实心、黑=空气），`MASK_PPM=6`（只用于可见性，不需要高分辨率）。
- `:140` `CreateOccludedLight` —— 每盏灯是一个覆盖其半径的四边形，**片元着色器从当前像素沿直线步进到光源，途中撞到实心就判在阴影里**。等价于对遮挡场做可见性查询。
- `:67` `MAX_BLOCKERS = 8` —— 动态遮挡体（人）也参与投影。
- `:506` `CreateLightShafts` —— 体积光柱。

**FPS 里这套 2D 掩码方案不直接适用**（该用真 shadow map）。但两条经验适用：① `CLAUDE.md:70`「光柱走 `CustomBlending` 真加法、**直射必配间接光**、人挡光走解析求解不走步进」——步进法在光柱上会出**等距横杠**（判据就是拍一张看有没有横杠）；② `MAX_BLOCKERS` 这种**固定长度 uniform 数组**的写法，比动态分支的 shader 稳得多，见坑 P3。

### 2.7 WebAudio 全程序化音景（★必抄，FPS 完全没做）

`TunnelLight1943/Script_Audio.js` 1874 行，零音频文件。四件事直接可搬：

**(a) 两条贯穿全文的硬约束**（文件头 `:11-14`）：
1. **音符必须提前排到 AudioContext 的时钟上**（约 100ms 一跳、只看 0.4s 之内 `LOOKAHEAD`）。用 `setInterval` 直接触发发声会漂移，浏览器后台节流时还会挤成一坨。
2. **任何增益变化都要走斜坡**。直接赋值 = 波形上的阶跃 = 一声清晰的"咔"。

**(b) 噪声缓冲的三道处理** —— `:208` `MakeNoise(seconds, brown)`：
- 布朗噪声 = 白噪积分（`last = (last + w*0.045)/1.02`），能量压在低频，做土层闷响和风底；
- **减直流分量再按 RMS 归一**——"随机游走天然带直流。直流听不见，却实打实吃掉动态余量，还会在包络起音处变成一下'噗'"；归一是为了**每次生成的电平一致，不然音效响度会随刷新页面而变**；
- **首尾交叉淡化**（`tail = min(2048, len/8)`），循环点才不会每圈"嗒"一下。

**(c) 起音-衰减包络** —— `:328`：

```js
function AD(param, t, peak, attack, decay) {
  const p = Math.max(0.0002, peak);
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(p, t + Math.max(0.002, attack));
  param.exponentialRampToValueAtTime(0.0001, t + attack + Math.max(0.01, decay));
}
```

**指数斜坡不能到 0，所以底噪取 1e-4，再由 stop 收尾。** 这是 WebAudio 最常见的一个静默 bug 源。

**(d) 两个通用音效发生器** —— `:763` `NoiseHit(t, opt)`（噪声 + 可扫频滤波 + AD）与 `:784` `Tone(t, opt)`（振荡器 + 可扫频 + AD）。**枪声 = NoiseHit（brown, 低通扫频下行）+ Tone（低频砰）叠加**，几行就出来了。里面还有一条防"贴图感"的细节：`n.start(t, Rand(0, 1.5))` —— **每次从噪声缓冲的随机位置起播**，固定起点会让高频复用的音（脚步）很快听出重复。

**(e) 资源管理三件套**：`Spawn(nodes, sources, until)` 登记 + `onended` 主路径回收 + `Purge(now)` 兜底（页面挂起时 `onended` 可能迟迟不来）；`VOICE_CAP = 64` 同时发声上限（`:317`），"极端情况下宁可丢音也不能让节点数失控"；`Out(tail, dest, panAmount)`（`:350`）返回额外产生的节点，**调用方必须并进清理名单——忘了这一步，每个带声像的音效都会漏一个 StereoPannerNode**。

**(f) 静默替身** —— `:65` `MakeSilent()`：WebAudio 不可用时返回一个接口一模一样、全部不做事的对象，**调用方不需要判空**。这个模式让无头测试与老浏览器都不炸。

**(g) 采样是盖在合成之上的一层** —— `:364-437`：清单拉不到、解码失败、某个 cue 还没烘出来，`Sfx()` 自动落回合成。且**每个 cue 存的是数组不是单个 buffer**——"每一两秒就要响一次的音只有一个样本，循环起来就是机关枪"，随机挑变体 + 轻微变速变调。

### 2.8 缓存戳与 import map（★已照抄：`Script_ModuleGraphTest.mjs`，Tier 0）

`TunnelLight1943/index.html:19-31` 记着一次真实事故（2026-08-07，手机上报「刨子推不动」）：`Script_Main.js` 带 `?v=157` 拿到新版，它 import 的 `Script_Core.mjs` 是裸 URL，手机上照旧吃缓存里的旧版 —— **新壳配旧芯**。桌面一刷新就好，手机 Safari 的模块缓存黏得多，所以只在移动端复现。

修法：**用 import map 把每一个第一方模块重映射到带版本的 URL**，版本只写在这一张表里。两条推论：
- **新增模块必须登记进 import map**，否则它又会独自留在缓存里；
- **源码里一律不许再自己写 `?v=`** —— 同一模块两个 URL = 浏览器加载两份实例（`Script_Audio.js:20-21` 记着实测：`Data_AudioMix` 同时出现 v=042 和 v=026）。

两条都由 `Script_SmokeTest.mjs:2395` `TestModuleGraphIsCacheBusted` 盯着，而且那个测试自己也进化过：原来是一张**手写清单**，于是它和 import map 是两份要同步的名单，新增 `Data_DayCycle` 时漏了一份，测试照样绿。现在改成**从入口把模块图走一遍自己数出来**再去对 import map：

```js
for (const m of src.matchAll(/(?:from|import\()\s*["']\.\/([A-Za-z0-9_]+\.m?js)["']/g)) walk(m[1]);
```

（注意字符类里必须有 `0-9`，否则走不到 `Data_ScriptC1.mjs` 这种带数字的文件。）

台儿庄版（`Script_ModuleGraphTest.mjs`，2026-08-26）字符类里还得有 `/`：
`Script_JieheHeight.mjs` 真的从子目录 import `Heightmap/Data_TaierzhuangHeightmap.mjs`，
只认平铺文件名的正则走不到它——首轮对账就是这么漏出第 8 个未登记模块的。

### 2.9 命令行工作台（★强烈推荐，FPS 只有 Probe/ShotTest 雏形）

`TunnelLight1943/Script_Cli.mjs` + `docs/Cli.md`。核心思想（`CLAUDE.md:29-30`）：**「先用命令行工作台定位，别一上来就读源码」**，而且 **「要问游戏状态先跑 `state`，不许现写探针脚本；缺子命令就往 `Script_Cli.mjs` 加，加完写回表」**——理由很实在：*一次性脚本下一个 agent 还得重写一遍*。

子命令语义值得照搬：`where <片段>`（这东西在哪 → `文件:行`）、`state <id>`（无头跑到那儿、喂真输入、打状态）、`shot <id ...>`（真浏览器真键盘实拍）、`anims/anim`（动作清单与关键帧）、`doctor`（分支/落后/未提交/缓存戳/端口）。

FPS 版本的等价物大概是：`where`、`probe <关卡> --at x,y,z --look yaw,pitch`（无头跑到某处打状态）、`shot`（实拍）、`mats`（材质清单：谁用哪张贴图、多大、什么色彩空间）、`doctor`。

---

## 三、测试与自验流水线

### 3.0 先说最重要的一条操作纪律

**worktree 里不能用 `npm run`。** `TunnelLight1943/CLAUDE.md:178-183` 原文（2026-08-18 白跑了一整轮换来的）：

> `npm run` 会把 cwd 换到装着 package.json 的**主仓库**，于是 `npm run test:tunnelLight1943` 测的是主仓库那份签出，跟你改的这份没关系——**全绿也说明不了任何事**。worktree 里直接 `node` 调脚本，node_modules 靠模块解析往上走就能找到主仓库那份。

配套两条（`docs/Cli.md:61-62`）：
- **在 worktree 里干活必须在 worktree 根目录跑 `shot`**——它照当前工作目录那份仓库起服务，在主仓库路径下敲拍到的是旧代码**且不报错**（表现是"加的东西一样没出现"）。
- worktree 里默认没有 node_modules：要 playwright 的脚本先 `npm i -D playwright-core`，**跑完 `git checkout -- package.json`**，别把版本号漂移带进提交。

所以 FPS demo 的自验一律写成：

```bash
node Taierzhuang1938/Script_SmokeTest.mjs
node Taierzhuang1938/Script_RenderHealthTest.mjs
node Taierzhuang1938/Script_ShotTest.mjs _shots
```

### 3.1 建议的脚本清单

| 脚本 | 测什么 | 依赖 | 判据来源 |
|---|---|---|---|
| `Script_SmokeTest.mjs` | **纯 Node**：规则层可完成性 + 定点机制断言 + 源码扫描类断言（命名/无 CDN/顶层无副作用/缓存戳） | 无（禁 three） | `TunnelLight1943/Script_SmokeTest.mjs`、`PrairieFire1937/Script_SmokeTest.mjs` |
| `Script_RenderHealthTest.mjs` | **真浏览器**：`gl.getError()` 为 0 + 无 pageerror/console error + **画面不是纯色** + 关键几何/材质计数 | playwright-core | `TunnelLight1943/Script_RenderHealthTest.mjs`、`TunnelBell1942/Script_RenderHealthTest.mjs` |
| `Script_ShotTest.mjs` | 逐关/逐机位实拍出图，给人看 | playwright-core | 已存在 |
| `Script_ClickSmokeTest.mjs`（若有 UI） | **真实合成鼠标/键盘事件**测可点性 | playwright-core | `PrairieFire1937/Script_ClickSmokeTest.mjs` |
| `Script_DevServer.mjs` | 本地静态服（显式 MIME + Range + `no-store`） | 无 | 已存在 |
| `Script_BrowserTestKit.mjs` | `LaunchBrowser()` + `OpenGame()` + `SamplePixels()` 三件套 | playwright-core | `PrairieFire1937/Script_BrowserTestKit.mjs:18`、`TunnelBell1942/Script_BrowserTestKit.mjs:70,96` |

### 3.2 `LaunchBrowser` 的解析顺序（`PrairieFire1937/Script_BrowserTestKit.mjs:18-48`）

不下载浏览器，优先用机器上已有的：`PF_BROWSER_PATH` 环境变量 → 云端沙箱预装 Chromium（带 `--use-gl=swiftshader --enable-unsafe-swiftshader`）→ 系统 Edge → Chrome → playwright 自带。**照抄这个候选链**，它已经处理了本机/沙箱两种环境。

### 3.3 渲染健康的三条核心断言

```js
// TunnelLight1943/Script_RenderHealthTest.mjs:59-88（节选）
const gl = tl.renderer.getContext();
const glError = gl.getError();
tl.world.Render();          // 不开 preserveDrawingBuffer，取样必须与渲染同一个任务
const probe = document.createElement("canvas");
probe.width = 64; probe.height = 36;
ctx.drawImage(canvas, 0, 0, 64, 36);
// …扫全部像素求明度 min/max
if (health.glError !== 0) problems.push(`GL 错误码 ${health.glError}`);
if (health.spread < 8) problems.push(`画面近乎纯色（明度差 ${health.spread}）`);
```

为什么要有这个（`TunnelBell1942/Script_RenderHealthTest.mjs:4-6`）：**「three 会静默吞掉 shader 编译失败——地图整块不画，页面却"看起来在运行"，纯逻辑测试全部照常通过。」**

`TunnelBell1942/Script_BrowserTestKit.mjs:96-105` 的 `SamplePixels` 走的是另一条路（更稳）：**用 Playwright 的真实截图，再把 PNG 塞回页面里用 2D canvas 解码采样**，并额外统计 `tones`（色调数）与 `hues`（色相数）——这两个数能测出"画面有明暗层次/色调不单一"，比单纯的 min/max 强。见坑 P5。

### 3.4 `PrairieFire1937/AGENTS.md:103-104` 的方法论结论（本仓库最贵的一句）

> 截图 + 程序化设置状态验证不了可点性；控制台无异常验证不了 shader 没炸；参数改了验证不了画面变了。
> **交互用真实合成事件测，渲染用 GL 错误码测，视觉用像素差分测。**

对应到 FPS：射击手感用真实 `mousedown/mousemove` 事件测；材质/后处理用 `gl.getError()` + 材质编译状态测；"我调亮了雾"这类视觉改动**必须实拍读回像素差分**（PrairieFire 的云层改了三轮全不可见，就是因为没量）。

---

## 四、踩过的坑（从注释里挖出的事故记录）

### P1 · CanvasTexture 色彩空间 —— 全仓库最贵的一条

`Script_Art.mjs:446` 注释 + `CLAUDE.md:99`：**「CanvasTexture 没声明 sRGB 会提亮，配色一律往下压、必须页内实拍看，别信色值。」** `Script_WorldPaint.mjs:266` 复述：「色号一律比直觉深两档。」`Script_World.js:762` 又栽一次：「第一版用 `#5b4a33`……」

**FPS 适用性：极高。** `Script_TexBake.mjs` 烘出来的 albedo **必须显式 `tex.colorSpace = THREE.SRGBColorSpace`**，normal/roughness/AO **必须保持 NoColorSpace**。搞反任何一边，要么整体发白、要么法线被 γ 掰弯。渲染器侧对应 `Script_World.js:302-308`：

```js
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
```

**姊妹坑**：`PrairieFire1937/AGENTS.md:66-67` —— three r152+ 的 ColorManagement 下 `new THREE.Color(hex)` **已经**做了 sRGB→Linear，**再调 `convertSRGBToLinear()` 会二次压暗**（`#5f6d7c` 直接压到 14% 亮度，全场模型发黑）。改材质颜色时搜一遍 `convertSRGBToLinear`。

### P2 · 缓存戳（新壳配旧芯）
见 §2.8。**只在移动端复现**，桌面刷新就好——所以很容易被判成"用户的错觉"。

### P3 · shader 分档 = 制造一条没验证过的编译路径
`PrairieFire1937/AGENTS.md:62-65`：ultra 档的 CSM 宏组合让片元着色器编译失败（`'[]' : array index out of range`，GL 1282），**three 静默吞掉**，用户 Edge 上整个地图消失。修法：**单一渲染路径**，设备差异只由 `Resize()` 里的 pixelRatio 降档吸收。

**FPS 适用性：高。** `Script_Post.mjs` 已经 30KB，若打算做画质档位，请让所有档位走同一份 shader，只改 uniform 与分辨率，别加 `#define` 分支。

### P4 · 字体没被真的加载 → 浏览器合成假粗体
`index.html:10-13`：「CSS 里写着 Noto Serif SC 却没人去取，Windows 上就回退到 SimSun；而 HUD 用了 500/600 字重，**SimSun 根本没有这两档，浏览器只好合成假粗体——糊就是这么来的**。」修法：`<link>` 把用到的字重全取回来。

姊妹坑在测试侧（`Script_RenderHealthTest.mjs:22-29`）：**外部字体源拉不下来不算渲染事故**（断网/代理环境里必然失败，会把全部关卡刷红、真问题反而看不见），只豁免 `fonts.googleapis.com`/`fonts.gstatic.com` 这一类资源加载失败，页面自己的 404/JS 异常照抓。

**FPS 适用性：中。** 若 HUD 用了 web font，两条都要抄。更稳的做法是**根本不吃外部字体**（符合 `AGENTS.md:138` 的零外部依赖）。

### P5 · preserveDrawingBuffer 与"假黑屏"
`TunnelBell1942/Script_BrowserTestKit.mjs:96-102`：**WebGL canvas 没开 `preserveDrawingBuffer` 时，页面内 `ctx.drawImage(canvas)` 拿到的是全黑**——用它做"是不是黑屏"的判断，结论永远是"黑屏"，而且是假的。

两条出路：① 走 Playwright 真实截图再解码采样（TunnelBell 的做法）；② 保持不开 `preserveDrawingBuffer`，但**取样必须与渲染在同一个任务里**（TunnelLight 的做法，`Script_RenderHealthTest.mjs:64` 先 `tl.world.Render()` 再 `drawImage`）。**别为了测试去开 `preserveDrawingBuffer`**——那会实打实吃性能。

### P6 · 页面 hidden 时纹理不上传
`Script_World.js:5773-5778`：three 的 `VideoTexture` 靠 `video.requestVideoFrameCallback` 置 `needsUpdate`，**而它和 rAF 一样，页面不可见时根本不触发——贴图于是一次都没上传过**。无头截图正是这个状态，"截出来永远是兜底画面，还看不出错在哪"。修法是**只在 `document.hidden` 时手动补 `needsUpdate = true`**，正常游玩仍走 rVFC。

同族的坑在 `docs/Cli.md:66`：**面板隐藏时 rAF 停走、canvas 被压成 0×0**；以及 `:54`：**渲染侧的时间只在 rAF 里走，而无头浏览器没有合成器、rAF 慢到几乎不动**——所以推逻辑帧不等于推渲染帧，看不到本该渐变出来的东西时**先想是不是渲染侧没走够帧，别急着改数值**。

**FPS 适用性：高。** 任何 `needsUpdate` 驱动的动态贴图（弹孔 decal atlas、瞄准镜 RTT、小地图）在无头实拍里都会中招。

### P7 · MIME：Windows 注册表把 `.js` 映射成 text/plain
`Script_DevServer.mjs:1`：「本地静态服：**显式 MIME 表**（Windows 注册表会把 `.js` 映射成 `text/plain`，模块加载直接炸）。」FPS 的 `Script_DevServer.mjs` 已经继承了这一条，保持即可。同文件 `:52` 还带 `Cache-Control: no-store`——本地开发时避免自己被缓存骗。

### P8 · `?? ` 会被 0 吃掉
`Script_RenderHealthTest.mjs:104-108`：渲染层把三个进度字段用 `??` 串起来 `p.vaultK ?? p.poseU ?? p.poseK`，而 `vaultK` 从建档起就是 0，**`0 ?? x` 取的正是 0**——玩法层算得再准，画面上永远停在起手那一格。**纯逻辑测试看不出这个。** `CLAUDE.md:117` 因此立了规矩：「进度驱动的姿势必须登进 `PoseProgress`，Rig 里读 `s.poseK`；`??` 会被 0 吃掉。」

### P9 · 半透明材质顺手关 depthWrite → 单位被地形穿透
`PrairieFire1937/AGENTS.md:99`。FPS 里烟雾/玻璃/瞄准镜叠层全是重灾区。

### P10 · EffectComposer 离屏 RT 默认 `samples=0`，旁路画布 MSAA
`PrairieFire1937/AGENTS.md:96` —— 表现是「**高画质反而更锯齿**」。修法：`composer.renderTarget1/2.samples = 4`。**FPS 有 `Script_Post.mjs`，这条几乎肯定会撞上。**

### P11 · three 内置雾排在 tonemapping 之后 → 乳白糊团
`PrairieFire1937/AGENTS.md:98`：内置 `fog_fragment` 被拉向亮雾色。修法：自写"越远越沉"的雾，**混合在 tonemapping 之前**。

### P12 · 视觉改动必须实拍量化
`PrairieFire1937/AGENTS.md:101`：云层三轮改动全不可见，四个不同的根因（带在相机可达域外 / 噪声尺度差 1.5 个数量级退化成常数 / ΔL≈2% 被 ACES 压平 / 窗口整段在地平线下）。**「我改了参数」不等于「画面变了」。**

### P13 · 实拍时序三连
`docs/Cli.md:48-53`：`pre → eval → hold → 冻帧 → 截图` 的先后固定。推论：`--eval` 看不到"按住键才存在"的状态（它在按键之前跑）；光靠 `pre` 拍不到长按姿势（`pre` 跑完 rAF 还在跑无输入帧，状态一路衰减，截出来是站姿）。跳场景之后**等转场动画真的结束再拍**（轮询状态钩子），**死等固定秒数会拍到一个半开的圆洞，且等多久随机器快慢变**。

### P14 · 一次性探针脚本是浪费
`CLAUDE.md:46` / `docs/Cli.md:34`：「要问游戏状态先跑 `state`，**不许现写探针脚本**；缺子命令就往 CLI 里加。」理由：一次性脚本下一个 agent 还得重写一遍。

---

## 五、不建议照搬的东西（考古的另一半价值）

1. **深度带 / `renderOrder` 那一整套**（`Script_WorldPaint.mjs:127-174` 的 `LAYER_ORDER`/`DepthOrder`/`SetPlayOrder`，`Data_DepthSpec.mjs`）。它存在的唯一理由是**"画面全是半透明贴图、都不写深度缓冲，先后完全由绘制顺序决定"**（`:104-107` 原文）。FPS 有真深度缓冲，照搬只会带来一套没人需要的簿记。**只留一条**：透明物体之间的排序仍要显式管，那部分逻辑可参考。
2. **长焦透视 + 8° 俯角的相机规格**（`TunnelBell1942/AGENTS.md:168-194`）。那是为了让 2.5D 横版有厚度。FPS 的 FOV 由手感定（通常 75–90°），跟这套完全相反。
3. **`Script_Fluid.mjs` 的 2D 网格流体**（半拉格朗日平流 + 雅可比压力投影 + 涡量约束，190×26 网格）。写得很漂亮，但它是**剖面专用**（土是墙、洞是流场）。FPS 要烟雾用 billboard 粒子或体积雾，代价小两个数量级。**除非**要做"烟顺着战壕流"这种特定演出，才值得捞。
4. **`Script_Art.mjs` 那 16000 行手绘画笔**。风格是 UbiArt 手绘插画，跟写实 FPS 是两套美学。**只捞 §2.1/§2.2 点名的那几支通用件**，别整体移植。

---

## 六、给 Taierzhuang1938 的落地顺序建议

1. **先立规矩**（半天）：写 `Taierzhuang1938/CLAUDE.md`，照 `TunnelLight1943/CLAUDE.md:159-164` 的格式（三行一条规矩 + 路由表 + docs/ 分册）。同时划出纯逻辑层 `Script_Rules.mjs`。
2. **补 index.html + import map 缓存戳**（一小时）：照 `TunnelLight1943/index.html:19-31`，同时把 `TestModuleGraphIsCacheBusted` 抄进冒烟。
3. **补测试电池**（一天）：`Script_BrowserTestKit.mjs`（抄 PrairieFire）+ `Script_RenderHealthTest.mjs`（抄 TunnelLight 的 GL 错误码 + 明度差 + TunnelBell 的 tones/hues）+ `Script_SmokeTest.mjs`（纯逻辑 + 源码扫描断言）。
4. **补色彩空间闭环**（半天）：`Script_TexBake.mjs` 逐张贴图显式声明 colorSpace，渲染器侧 `outputColorSpace`；写一条实拍断言（中性灰卡上屏值）守着。
5. **音频**（一到两天）：抄 `Script_Audio.js` 的骨架（`MakeSilent` / `Spawn`+`Purge`+`VOICE_CAP` / `AD` / `MakeNoise` / `NoiseHit` / `Tone` / 前瞻排程），枪声、脚步、弹壳、远处炮火全部合成。
6. **rig 与步态**（视是否有第三人称敌人而定）：捞 `ArmIK` + 解剖闸 + `WalkCadence` + `GroundWeight` 的地面吸附思路。


---

## 「3A 观感」验收清单（视觉审查 agent 的评分表）

### [低] 色彩空间闭环：albedo 显式 sRGB，normal/roughness/AO 显式非 sRGB，渲染器 outputColorSpace=SRGBColorSpace
- **为什么**：CanvasTexture/DataTexture 不声明色彩空间会被整体提亮（TunnelLight 全作老账，配色被迫'压两档'）；反过来把法线图当 sRGB 会把法线 γ 掰弯，掠射角光照全错。three r152+ 还有 new THREE.Color 后再 convertSRGBToLinear 的二次压暗坑
- **怎么在截图上验**：场景里放一块已知中性灰（如 #808080）的测试板，实拍后取该区域像素值，应落在 128±4；法线搞反的表现是墙面在斜射光下起伏方向整体反了、或高光呈块状而非连续
### [低] 画面不是纯色：任意机位截图的明度 max-min ≥ 8，且色调档位数 tones ≥ 12
- **为什么**：three 会静默吞掉 shader 编译失败，地图整块不画而页面'看起来在运行'，纯逻辑测试全绿。这是一票否决级的最低体检
- **怎么在截图上验**：截图缩到 64×36 扫全部像素求明度 min/max；黑屏、只剩天空、只剩雾三种事故都表现为 spread 极小
### [中] 每个可见表面都有法线与粗糙度变化，没有一块是纯色平面
- **为什么**：'材质靠形不靠颜色'——布靠褶、焦木靠龟裂、灰靠没有边。纯色块在任何光照下都读成塑料
- **怎么在截图上验**：截图里找掠射角的墙面/地面：应能看出细微凹凸与高光的不均匀；把画面转灰度后仍应有可读的材质纹理，而不是一片均匀灰
### [中] 贴图无肉眼可见的等距重复与完美几何形
- **为什么**：'四边笔直＝没有手'、'手绘画布上不许出现完美几何形'。等距重复是程序化贴图最容易露的马脚；CharScale 那次把鳞铺在细椽子上，实拍读成三条挂着的铁链
- **怎么在截图上验**：截图里沿一堵长墙看：砖缝的层厚与砖长应有抖动，不许出现精确等分的网格；同一面墙上找不到两块一模一样的破损
### [中] 大气透视：远景对比度降低、向天空色收敛，且是染在物体自身上而非盖一层雾
- **为什么**：半透明 ≠ 雾——把远处物体调半透明的话，它身后的东西会从它身上透出来，那是穿帮。BakeSprite 用 source-atop 只染精灵自己
- **怎么在截图上验**：截图上取近处与远处同材质的两块，远处那块的明度对比与饱和度都应明显更低；同时远处物体不许能看穿（背后的几何不该透出来）
### [中] 接触阴影：所有物体与地面的接缝处有暗部，没有任何东西看起来悬浮
- **为什么**：贴地是最强的空间线索。TunnelLight 立了'落地贴图底边＝地平线，不许为观感手抬 y'并配了 Script_DepthAudit 逐件扫悬空/陷地
- **怎么在截图上验**：截图里逐件看物体底部：应有一圈由暗到亮的过渡；把画面调亮后仍应能看出接触面，不该是物体边缘直接接到干净地面
### [低] 敌我剪影三米外一眼分开（色相分档，不靠细节）
- **为什么**：TunnelLight 的教训：三种兵原来全在土黄色系里，靠帽子分不开；改法是把军官压成墨绿、伪军压成中性暖灰黑，且'不许比墨线还深'（比轮廓还暗会让轮廓变成一道发光的边）
- **怎么在截图上验**：把截图缩到 1/4 再转灰度，不同阵营的人形应仍能靠明度分开；彩色下取两个阵营的主色，色相差应明显
### [中] 枪械 viewmodel 与 HUD 的贴图密度单独一档（超采样），推到最近也不糊
- **为什么**：'会被盯着看的 canvas 必须超采样'。玩家整局都盯着枪，环境贴图的密度对它远远不够；BakeSprite 的 ss 参数就是为这个存在的
- **怎么在截图上验**：截图里放大枪械的机匣刻字/准星：边缘应锐利、无马赛克与插值糊边；与同距离的环境物体相比不应更糊
### [低] 地面与大平面的 anisotropy 给到 16，其余 4
- **为什么**：掠射角看的大平面用默认各向异性只能靠降 mip 去补，几道渐变的过渡带会糊（WorldPaint 路面那次实测）
- **怎么在截图上验**：截图里沿地面向远处看：地面纹理应保持到中远景才逐渐消失，不该在中景就糊成一片均匀色
### [中] 步频对：角色跑动 3.0-3.5 步/秒，走动约 2 步/秒，不随位移线性数步
- **为什么**：老版按位移数步（脚不打滑）导致 4.2m/s 的角色一秒 7 步。现实中提速主要靠迈大步不是加快步频；取舍是'步频对'优先于'脚不滑'
- **怎么在截图上验**：实拍一段连续帧或录屏，数一秒内脚落地次数；跑步应在 3-3.5 次，超过 4 次就是错的
### [高] 脚不在 Y 轴漂移：胯高按腿的几何反推，最低接触点钉在地面上
- **为什么**：用户原话'非常多的动作，脚都是会在 Y 轴漂移的'。修法是不信手填的 hipY，按两只脚与两个膝里最低那个点吸附
- **怎么在截图上验**：截图里看站/蹲/跪三种姿势的脚：鞋底应恰好压在地面上，既不陷进去也不悬空；蹲姿看膝头、踮脚看鞋尖
### [高] 手真的落在它操作的那件东西上（IK 到挂点，不按角度表摆在半空）
- **为什么**：'手上有活的姿势，胳膊不许照角度表摆在半空，否则画面上就是对着东西空划拉'。这类错眼睛要盯着截图才看得出，但其实是可算的
- **怎么在截图上验**：截图里看角色扶掩体/拉枪栓/推门：手掌应贴在物体表面上，指尖不穿模也不悬空；量化做法是发布挂点坐标并断言 |handAt − grip| ≈ 0
### [低] 没有反关节：膝只往后屈、肘只往前屈，且这道闸写在 ApplyPose 里而不是靠自觉
- **为什么**：一条写错的注释被照抄 51 处，全场胳膊在肘上反着弯。硬夹之后谁写反了顶多是伸直，绝不会再翻过去
- **怎么在截图上验**：截图里逐个看角色的肘与膝：肘的折向应始终朝身前，膝始终朝身后；举手过头顶那一帧最容易露（角度绕回 ±180° 的坑）
### [中] HUD 与拇指/准星落点上不压别的元素，三种状态下有效面积一格不缺
- **为什么**：TunnelLight 的事故：一条 76vh 的竖纸带在横屏画高里必然长到拇指那排上，实测盖掉互动钮 52% 面积，读起来像'触发点挪了地方'
- **怎么在截图上验**：按 HUD 元素的有效面积逐点验：正常、开背包、开地图三种状态各截一张，交互控件应完整可见无遮挡
### [低] 字体真的被加载下来，HUD 不出现浏览器合成的假粗体
- **为什么**：CSS 写着某字体却没人去取，Windows 回退到系统宋体；而 HUD 用了 500/600 字重，宋体没有这两档，浏览器只好合成假粗体——糊就是这么来的
- **怎么在截图上验**：截图里放大 HUD 数字与标签：笔画粗细应均匀，不应出现描边式的加粗（合成粗体的特征是笔画向外均匀膨胀、转角变钝）
### [低] 高画质档真的更干净：EffectComposer 的离屏 RT 显式设 samples=4
- **为什么**：离屏 RT 默认 samples=0，旁路了画布 MSAA，表现是'高画质反而更锯齿'
- **怎么在截图上验**：截图里取一条高对比斜边（屋脊/枪管轮廓）放大：应有平滑的中间调过渡而不是硬阶梯；关掉后处理对比一张，后处理版不该更锯齿

---

## 坑

- 【色彩空间】CanvasTexture/DataTexture 不显式声明 colorSpace，上屏被整体提亮——TunnelLight 全作被迫把所有色号'往下压两档'并留了一张反推表（Script_Art.mjs:446 Dim()）。albedo 走 sRGB、normal/roughness/AO 必须非 sRGB，搞反任一边都错。
- 【色彩空间·姊妹坑】three r152+ 的 ColorManagement 下 new THREE.Color(hex) 已做过 sRGB→Linear，再调 convertSRGBToLinear() 会二次压暗（#5f6d7c 压到 14% 亮度，全场模型发黑）。改材质颜色前先 grep 一遍 convertSRGBToLinear。
- 【缓存戳】只给入口盖 ?v= 而不盖整张模块图，会造成'新壳配旧芯'：入口拿到新版、它 import 的模块吃缓存旧版。桌面刷新就好、手机 Safari 黏得多，所以只在移动端复现，极易被判成用户错觉。修法是 import map 重映射每一个第一方模块，且源码里一律不许自己写 ?v=（同一模块两个 URL＝加载两份实例）。
- 【缓存戳·测试的坑】守这条的测试如果用手写模块清单，它自己就成了第二份要同步的名单（新增 Data_DayCycle 时漏了，测试照样绿）。必须从入口把模块图走一遍自己数出来；正则的字符类里别漏 0-9，否则走不到 Data_ScriptC1.mjs 这类带数字的文件。
- 【shader】画质分档 = 制造一条你没验证过的 shader 编译路径。PrairieFire 的 ultra 档 CSM 宏组合让片元编译失败（GL 1282），three 静默吞掉，用户 Edge 上整个地图消失。改法是单一渲染路径，设备差异只由 pixelRatio 降档吸收。
- 【preserveDrawingBuffer】不开它时页面内 ctx.drawImage(canvas) 拿到的是全黑——拿它判断'是不是黑屏'结论永远是黑屏，而且是假的。出路只有两条：走 Playwright 真实截图再解码采样，或让取样与渲染在同一个任务里（先 Render() 再 drawImage）。别为了测试去开它。
- 【hidden 不上传纹理】VideoTexture 靠 requestVideoFrameCallback 置 needsUpdate，它和 rAF 一样在页面不可见时根本不触发——贴图一次都没上传过，无头截图永远拍到兜底画面且看不出错在哪。只在 document.hidden 时手动补 needsUpdate。任何 needsUpdate 驱动的动态贴图（decal atlas、RTT 瞄准镜、小地图）都会中招。
- 【rAF】渲染侧的时间只在 rAF 里走，而无头浏览器没有合成器、rAF 慢到几乎不动。推逻辑帧 ≠ 推渲染帧：镜头缓动、材质淡出、光照换挡全在渲染侧。看不到本该渐变出来的东西时，先想是不是渲染侧没走够帧，别急着改数值。
- 【MIME】Windows 注册表会把 .js 映射成 text/plain，本地静态服不写显式 MIME 表的话模块加载直接炸。另外本地服要带 Cache-Control: no-store，免得自己被缓存骗。
- 【字体】CSS 里写了字体却没人去取，Windows 回退到系统宋体；HUD 若用 500/600 字重而宋体没有这两档，浏览器会合成假粗体——那就是'糊'的来源。反过来在测试侧，外部字体源拉不下来不算渲染事故，必须豁免掉，否则会把全部关卡刷红、真问题反而看不见。
- 【?? 会被 0 吃掉】p.vaultK ?? p.poseU ?? p.poseK，而 vaultK 从建档起就是 0，`0 ?? x` 取的正是 0——玩法层算得再准画面永远停在起手第一格，且纯逻辑测试完全看不出来。
- 【透明】半透明材质顺手关 depthWrite，会让隐蔽单位被地形穿透。烟雾/玻璃/瞄准镜叠层是重灾区。
- 【后处理】EffectComposer 的离屏 RT 默认 samples=0，旁路了画布 MSAA，表现是'高画质反而更锯齿'。显式设 composer.renderTarget1/2.samples = 4。
- 【雾】three 内置 fog_fragment 排在 tonemapping 之后，会被拉向亮雾色变成乳白糊团。要自写'越远越沉'的雾并混合在 tonemapping 之前。
- 【视觉验证】'我改了参数'不等于'画面变了'。PrairieFire 的云层三轮改动全不可见，四个不同根因：带在相机可达域外 / 噪声尺度差 1.5 个数量级退化成常数 / ΔL≈2% 被 ACES 压平 / 窗口整段在地平线下。视觉改动必须实拍读回像素差分。
- 【WebAudio·排程】音符必须提前排到 AudioContext 的时钟上（约 100ms 一跳、只看 0.4s 之内）。用 setInterval 直接触发发声会漂移，浏览器后台节流时还会挤成一坨。
- 【WebAudio·包络】任何增益变化都要走斜坡，直接赋值＝波形阶跃＝一声清晰的'咔'。且指数斜坡不能到 0，底噪取 1e-4 再由 stop 收尾。
- 【WebAudio·噪声】随机游走生成的布朗噪声天然带直流分量：听不见，却实打实吃掉动态余量，还会在包络起音处变成一下'噗'。必须先减均值、再按 RMS 归一（不归一的话音效响度会随刷新页面而变）、首尾还要交叉淡化否则循环点每圈'嗒'一下。
- 【WebAudio·泄漏】带声像的音效若忘了把 StereoPannerNode 并进清理名单，每发一次就漏一个节点。必须有 Spawn 登记 + onended 主回收 + Purge 兜底（页面挂起时 onended 可能迟迟不来）+ 同时发声上限（宁可丢音也不能让节点数失控）。
- 【WebAudio·重复感】每一两秒就响一次的音（脚步、弹壳）若固定从噪声缓冲起点起播，很快会听出'贴图'感。每次从随机位置起播；用采样时一个 cue 要存一组变体而不是单个 buffer，并轻微变速变调。
- 【worktree】worktree 里不能用 npm run——npm 会把 cwd 换到装着 package.json 的主仓库，测的是另一棵树，全绿也说明不了任何事。必须直接 node 调脚本。同理 shot/实拍类脚本要在 worktree 根目录跑，在主仓库路径下敲会拍到旧代码且不报错。
- 【worktree·依赖】worktree 里默认没有 node_modules，装 playwright-core 之后要 git checkout -- package.json，别把版本号漂移带进提交。
- 【无头浏览器·指针锁会夹住真鼠标】Chromium on Windows 的指针锁实现是 `::ClipCursor(窗口矩形)`——全系统的光标夹具，不分有头无头。无头 Edge 的不可见窗口落在屏幕 (27,95)-(1297,805)，冒烟脚本一点「进城」抢到锁，开发机上真人的鼠标就被夹在屏幕左上角那一块动不了；而且**无头下 exitPointerLock 不解夹**（有头会），要等浏览器进程退出。症状是「开着游戏 / 跑着测试，鼠标隔一阵莫名其妙锁在左上角」，跟游戏逻辑毫无关系，读源码永远找不到。修法在游戏侧：`navigator.webdriver` 下一律走页内假指针锁（Script_Main `FAKE_POINTER_LOCK`），逻辑照常流转、冒烟照常验解锁通道、真锁一次不碰；PlayTest 第 14 节守着这条。任何新项目的浏览器测试只要会点进指针锁，都得先装这道闸。
- 【实拍时序】pre → eval → hold → 冻帧 → 截图 的先后是固定的。推论一：eval 看不到'按住键才存在'的状态（它在按键之前跑）；推论二：光靠 pre 拍不到长按姿势（pre 跑完 rAF 还在跑无输入帧，状态一路衰减，截出来是站姿）。跳场景后要轮询状态钩子等转场真的结束，死等固定秒数会拍到半开的转场且等多久随机器快慢变。
- 【探针】不许现写一次性探针脚本——下一个 agent 还得重写一遍。缺什么就往 CLI 工作台里加子命令，加完写回文档的子命令表。
- 【测试的价值边界】截图 + 程序化设置状态验证不了可点性；控制台无异常验证不了 shader 没炸；参数改了验证不了画面变了。交互用真实合成事件测，渲染用 GL 错误码测，视觉用像素差分测。
- 【集成缝】闸门全部直调模块函数时，测的是零件不是装配——PrairieFire 曾冒烟 62/62 全绿而装配是断的。大机制必须配一条走真实主循环的全链路集成闸门。
- 【别照搬】深度带/renderOrder 那整套簿记只为'全是半透明贴图、都不写深度缓冲'而存在，FPS 有真深度缓冲，照搬只会带来没人需要的负担；长焦窄 FOV + 8° 俯角是 2.5D 横版专用，与 FPS 手感相反；2D 网格流体是剖面专用，做烟雾用粒子便宜两个数量级；Script_Art 那 16000 行手绘画笔是 UbiArt 风格，只捞通用件别整体移植。
