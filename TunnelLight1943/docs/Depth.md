# 场景数据 · 三块地 · Z 轴深度带 · 地平线

> TunnelLight1943 规范分册（从 CLAUDE.md 拆出，2026-08-18）。**挪东西、换贴图、改深度、改路面/地面/剖面之前读。数值只在 `Data_DepthSpec.mjs` / `Data_PropArt.json` / `Data_Scenes.json`。**
> 硬规矩摘要与各分册的路由表在 [`../CLAUDE.md`](../CLAUDE.md)；本文件按需读，不自动进上下文。
> 往这里加条目：**【规矩】一句 / 【为什么】一句 / 【守着它的】测试名或 shot 判据**；
> 事故过程、日期、用户原话、实测数字写进 [`../Data_DesignHistory.md`](../Data_DesignHistory.md)，数值只写常量名。

## 场景数据在哪（改东西之前先看这里）

**场景物体不写在代码里**。要挪一个东西、换一张贴图、改一档深度，改 JSON 就够了：

| 文件 | 管什么 |
|---|---|
| `Data_Scenes.json` | 每个物体**在哪**：x / level / w / h / 旗标门 / 区域 / 掩体 / 翻越物 / 窄段 |
| `Data_PropArt.json` | 每一类物体**长什么样、埋多深**：画笔名 / 深度带 / 烘焙画布 / 投影 |
| `Data_DepthSpec.mjs` | 深度带的**数值**（`BAND` 表） |
| `Data_Scenes.mjs` | 加载 + 解析 + **开局校验**（配错立即抛，不静默少画一个物体） |

- **没有图片文件**：贴图全由 `Script_Art.mjs` 的手绘矢量画笔实时烘到 canvas，「引用的贴图」= `art` 字段里的画笔函数名，换皮就是换这个名字。
- **查看与体检**（挪东西、或"这玩意儿怎么不见了"，先跑）：`npm run scene:tunnelLight1943` —— 按场景列出全部物体的坐标/深度带/画笔/贴图尺寸，并交叉校验：剧本放置点压没压掩体、挡人的矮物件是不是真的矮、翻越物撞没撞掩体、行走线上有没有穿插。
- **新增一种 kind**：先在 `Data_PropArt.json` 的 `props`（或 `covers`）登记 `art` / `band` / `sprite`，再在 `Data_Scenes.json` 摆位置；漏登记加载时报错。只有**条件绘制**（断了的井绳、露出的绳头、烧过的屋子）才写进 `Script_World.js` 的 `AddProp` switch——那是逻辑，不是数据；这类 kind 漏了 case 静默不画，加载校验查不出。
- **逐件的深度带覆盖**：`Data_Scenes.json` 的道具可以写 `band`，盖掉 `Data_PropArt.json` 里那一类的默认。同一种东西摆在墙根跟摆在路当中不是一档深度（石子堆、垫洼的新土该站 `obstacle`/`clutter`，不该跟房子地基挤同一条行走线）。仍然只许从 `BAND` 表里挑，加载期校验。
- **一条街不许排在一根尺子上**。`Data_PropArt` 里绝大多数道具默认 `walk`，整条街每一件东西踩同一条地平线，横版里读出来就是"贴在一张背景板上"。治法就是 `band`：沿街挑一批**纯布景**件散到 `obstacle` 与 `clutter` 上，一件近一件远，路才有厚度。挑件三条：
  1. **会做活的一律留在 `walk`**（工作台、院里的水缸、柴堆里的绳、投布巾的石子堆）——前景带画在**演员之前**，做活那几镜会被自己的道具挡住手。
  2. `clutter` 有 1.2m 的硬上限（`Data_DepthSpec`），高的只能到 `obstacle`；**一件东西挪了，跟它长在一起的也要挪**（猪圈进了 obstacle、圈里的新土还留 walk，土就摊到圈墙后头去了）。
  3. 挪完跑 `npm run scene:tunnelLight1943`（掩体足迹/挡人/穿插）与 `Script_DepthAudit.mjs`，两张单子都要跟改之前一样。

## 地面是三块，别改错那一块（2026-08-17 用户："很多东西应该是放在路上的，结果你放在了路的上沿"）

地平线以下看得见的那片土是**三张东西叠出来的**，改路面之前先认清哪一块在管事：

| 谁 | 是什么 | 管画面哪一块 |
|---|---|---|
| `AddGroundPlane` | 躺平的大地面（一整张贴图铺全场） | 中远景的**田**。横向只有几像素/米——**这上头画不了细节**（一道 8px 的车辙在世界里两米多宽） |
| `AddRoadPlane` | **街面**：只管行走线前后那七米，贴图沿路循环 | 房子跟前到画框底下那一条**路**的调子——**只有调子，没有细节**（见第 2 条） |
| `AddGroundBand` | 地平线底下的一张竖幕布 | **几乎什么都不管**：被大地面的深度写入挡在后头，只露出地平线底下几个像素（断口那一线与路肩的草） |

钉死的账：

1. **路面细节别画在 `AddGroundBand` 上，等于没画**（读出来就是"东西全堆在路的上沿"）。要改路的**调子**，改 `PaintRoadTile`；要在路上**摆东西**，摆道具。
2. **地面上不许有碎点**（蹄印／坷垃／石子／裂泥／糠秕／粪蛋／草茬／车辙描线一概不许撒进 `PaintRoadTile`）。两笔账：
   · **过场机位比玩法近一倍**，几厘米的小件上屏十几个像素、铺满画面下三分之一，眼睛先看见地后看见人。**地面是背景，背景的活是让人立得住，不是自己好看**——「材质靠形不靠颜色」说的是*一件东西*怎么画，不是*一整片地*该多热闹。
   · **这块几何横贯全场、屋里屋外一视同仁**，贴图上撒的东西会**画进自家屋里的夯土地面**。画得对不够，还得问它铺到了哪儿。
   整张贴图只留**大面积软渐变**（路面底色、路肩、碾道）。**真要在路上摆东西，摆成道具**（`Data_Scenes.json` 挂 `band`）——摆得住、看得清、删得掉；撒在贴图上的删不掉、也调不准。
3. **`AddRoadPlane` 的纵向 UV 按屏幕均分，不按世界均分**（顶点也按同一条尺排）。深度 z 离视平线 `camY/(camD−z)`；贴图每一行对应等量的**屏幕**行，贴图上一条软边上屏就是按透视压扁的带子——远的自己窄、近的自己宽。尺子是 `ROAD_VIEW`（＝默认玩法机位），换算只有 `RoadRow(z)`。
4. 更近处（画框最底下那一条）是**地道剖面的近侧土**（`NEAR_Z`，`AddUnderground` 画），不是路。断口上长的草茬归 `Script_World.js` 的 TURF 那一段。
5. **`AddGroundPlane` 是一把刀**。它是全场**唯一不透明又写深度**的几何，躺在 `SURFACE_Y − GROUND_PLANE_DIP` 上、纵深铺到 `NEAR_Z` 那张剖面**前面**：剖面上低于那条线的内容一律被它切掉，**切口是一条笔直的横线**（任何机位下都是"那个深度的地平线"）。所以**在地平线附近画东西，先问这一笔落在那条线的上头还是下头**：
   · 下头＝只有地道那一侧看得见（断口的墨线、耕作层、剖面的土都归这儿）；
   · 上头＝地表看得见的全部（草茬、土坷垃这些"长在地面上的东西"）；
   · **横跨那条线的东西必须是"从地里长出来"的形**（根最粗的一头落在线上、往上收尖），不然切口就切在它的半腰上。
   配套：土层上沿**剪在断口那条边底下**，那条边（`Edge(px)`）是三支正弦的一处真相，墨线/耕作层/剪土层三处共用；井口碎土与井筒洞沿一律按路面那条线（`rootY`）起，不许浮在路面上头。**等距等大的一排坷垃只露同样厚的一片＝花纹不是土**，大小与埋深都要随机错开。
6. **"砍了一半"还有第二把刀：画布的上边。** `AddGroundBand` 路肩那撮草的梢曾画到画布外头（地平线以上只留了 6px），每一撮在同一高度被平着裁成直边；现在留 `RISE` 行。**贴图上任何往地平线以上探的笔画，先核画布给它留了多少头顶**（同 Art 的「画笔画出画布＝顶上被裁」）。判据：切口**同高且笔直**、而这一笔在大地面那条线的**上头**——那是画布边，不是地面。

## Z 轴深度规范（血泪最多的一条）

画面全是不写深度缓冲的半透明贴图，**前后完全由绘制顺序决定**。规则：

> 绘制序小工具（`LAYER_ORDER`/`DepthOrder`/`FixOrder`/`SetPlayOrder`）、烘焙工具（`BakeSprite` 一族）与无状态的地形/影子画笔在 `Script_WorldPaint.mjs`（可单独 import）；跟着 state 走的绘制（AddProp/AddUnderground/UpdateOne）在 `Script_World.js`。可变雾色走参数（`AddRidgeBand` 的 `hazeTint`），画笔不偷读闭包。

1. **带的数值**在 `Data_DepthSpec.mjs`（`BAND` + `ACTOR_Z/CARRY_Z/NEAR_CLUTTER`），**哪类物体用哪个带**在 `Data_PropArt.json` 的 `band` 字段。两处都不许写裸数字。
2. **动态物**（放下的、飞着的、演出用的）用 `SetPlayOrder(mesh, BAND.xxx, "标签")` 或 `FixOrder(mesh, DepthOrder("play", BAND.xxx))`。**禁止在放置代码里写裸数字 z / renderOrder**——道具吞人、桶隐形一类事故全是裸数字造成的。
3. **带的语义**：固定在地上的道具 = `walk`；玩家放下/待拾的活动道具 = `loose`（压在 walk 之前、演员之后，永远看得见）；**横在路上的矮障碍（可翻越物）= `obstacle`**——比演员近一点点，挡得住小腿（挡不住就读成「路边的景」，玩家看不出它拦路），又不会像 `clutter` 那样被近景透视放大成一堵大墙；允许挡人的矮掩体 = `clutter` 或 `NEAR_CLUTTER` 区间（高过腰 1.2m 的一律退到负带，否则会把人整个吞掉）。
4. **落地贴图底边 = 地平线**（地表 `SURFACE_Y`、地道 `UNDER_Y`），y 不许为了观感手动抬高——贴地由 `sprite.baseline` 或 `MakeGroundItemMesh` 的 alpha 扫底负责。真要抬（挂树上的布巾）走 `yOffset`，那是声明出来的例外。
5. **道具落点不得进掩体足迹**：掩体带专职挡人。玩家/脚本放东西一律走 Core 的 `DropSpot()`（自动避开 `scene.covers`/`vaults` 并夹进行走范围）。
6. **校验**：`CheckBandZ` 会对表外 z 发 console.warn；浏览器里 `TunnelLight.world.DepthViolations()` 可拿告警单，必须为空。例外词汇表（不受 BAND 约束）：地道剖面构件（`NEAR_Z`/`BACK_Z` 一族）和 fx/fore/ots 层的 `LAYER_ORDER` 偏移。
7. **两个人绝不许共用一个绘制序号**。同一排的人 z 与序号一模一样时，**两具骨架的各块贴图按各自局部 z 互相穿插**，镜头一动就翻（不是深度缓冲在打架）。治法是**同带内的整数错位**：`SetPlayOrder(obj, z, tag, nudge)` 的第四个参数；表在 `Script_World.js` 顶部（`DRAW_NUDGE_PLAYER` / `DRAW_NUDGE_HELD` / 其余按 id 稳定分），玩家永远压在乡亲之前，抱在怀里的孩子再压一档。两条细则：
   · **不许改 z 去错位**——`CheckBandZ` 只认规范表上那几档，挪 z 当场记一条深度违规，而那张单子必须为空；
   · **别拿 `FixOrder` 钉骨架**：它只钉传进去的那一个对象、不往下遍历，钉在 rig 的 group 上等于没钉（各骨头照旧被 `ApplyDepthOrder` 按局部 z 派号）。要遍历的是 `SetPlayOrder` / `SetLayerOrder`。

## 地平线规范：一条行走线，一个 z（2026-08-09 用户定）

镜头永远平视，所以**每一档 z 都有自己的地平线**——深度 z 处 y=0 那条线在屏幕上 ∝ −camY/(dist−z)：

> **两件东西只有 z 相同，才踩在同一条线上。**

默认玩法机位下各带相对 walk 的屏幕偏移（量级参考，值随 `BAND`/`PLAY_HW` 变）：

| building | yard | nearBack | walk | loose | 演员 | obstacle | clutter |
|---|---|---|---|---|---|---|---|
| −89px | −49px | −29px | 0 | +11px | +23px | +38px | +69px |

推特写会把同一个差再放大几倍——**"差一点点无所谓"不成立**。

规则（数值与 `PlaceZ()` 在 `Data_DepthSpec.mjs`）：

1. **摆位走 `PlaceZ(band)`，排序走 `SetPlayOrder/DepthOrder(band)`。** 深度带从此只有绘制顺序这一个职责，不再兼职当位置。
2. 行走线上的一切（演员、影子、携带物、放下的东西、玩家推的车、钉在地上的道具＝ walk/loose/facade 带）位置一律压回 **z=0**。
3. z<0 的背景带、z>0 的前景带（obstacle/clutter/掩体）**保留自己的 z**：它们本来就站在别的纵深上，地平线不同是对的——但那条线得由画面交代（`AddBandEdge` 的路沿田埂、墙根、垄沟）。
4. `Script_DepthAudit.mjs` 逐章扫：play 层里凡是 0<z≤`GROUND_PLANE_TOP` 的元素一律判违规（躺平的投影除外）。别再在摆位代码里写裸 z。

配套一条：**站姿整体抬起一个鞋帮**（`Script_Rig` 的 `SoleLift`）——踝落在 y=0 而鞋从踝往下画，不补偿全场每个人都陷进地里。**但跪、爬、趴不能抬**：爬行的脚反铺在地上、鞋帮朝上，一抬膝盖就离地。判据是**膝盖高度**不是胯高（猫腰走和爬行胯一样低，膝盖一个在半空、一个跪在地上）。改姿势后用 `world.PlayerLimbTips()` 对一遍：站姿脚 ＝ **鞋帮×体型**（`BONE.sole`×体型），爬行手 −0.00 / 膝 0.00 / 脚 −0.02。

## 演员绘制序、屋里屋外、场景数据的几条（2026-08-18 从项目记忆并入）

- 【规矩】`SetPlayOrder` 派给骨架的序号必须落进 `userData.fixedOrder`。【为什么】骨头的局部 z 全是 0，环境一重建（`builtKey` 里任一旗标翻动）`ApplyDepthOrder` 就把整个人打回行走线那一档、沉到立面（`facade`）后头，而手上的桶是 play 层直接子物照旧浮在墙外。【守着它的】`CheckBandZ` + RenderHealthTest。
- 【规矩】NPC 走进可进入的屋子走 `IndoorHidden`，判据是**门洞中线** `homeRange.door`，不是屋子范围 x1；隐去时连影子、castShadow、carryMesh、lampMesh 一起收；`a.following` 豁免；玩家自己不走这条（他进门时立面正在淡）。
- 【规矩】过场调度先查 interior 隐藏区：屋外的戏一律摆到门洞 x 以东，要在屋里演就 `state.beat.indoorScene = true`。【为什么】立面是实的，摆到门洞以西的人整段隐身；SmokeTest 只断言 state 看不出「看得见」。排查招：截图后逐个演员核对「state 里在场 ≠ 画面里在场」。
- 【规矩】投掷靶心三处同源：`Data_Scenes` 道具 x + `Data_PropArt` yOffset + beat 的 `target`/`insert` 镜头，改一处改三处；弹药堆离投掷站位留够距离，挨太近驱动器捡完转身被推出站位来回没完（SmokeTest 会红）。
- 【规矩】改 `Data_Scenes.json` / `Data_PropArt.json` **禁用 python json.dump 整文件重写**，用文本手术。【为什么】全文件重排＝并行会话冲突地狱。
- 【规矩】改 Art/模块后要 bump index.html importmap 的缓存戳再实测（`TestModuleGraphIsCacheBusted`）——不 bump 浏览器吃旧模块，看着像「改了不生效」。
- 【规矩】旗标进 `builtKey` 前先问：它改的是「有没有」还是「长什么样」——纯显隐走 `flagProps`（建一次、切 visible），只改画法的走 `propRedraw` + `RedrawProp` 单张重烘；两者都不该重建整个世界（重建会卡一下）。
- 【规矩】`Script_World.ClearGroup` 会 dispose 子物体的几何/贴图，而骨架资源是 `rigCache` 全场共享的——骨架/影子/手持物打 `userData.persist=true`；重建后 `InvalidateSceneCaches()` 把闭包里懒创建的网格引用清零，否则 `if (!markerMesh)` 落空、那些东西再也不出现。
