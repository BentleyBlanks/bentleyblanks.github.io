# 场景破坏系统

## 目标

七个战斗场景共用一套局部破坏：承重结构保持关卡骨架，其余有碰撞的墙面、女墙、东寨墙、木桥与站台楼板、临时工事、道具、坟头、田坎和路基都能被枪弹或爆炸逐步破坏。破坏结果必须同时影响画面、Rapier 碰撞、射线遮挡、爆炸遮蔽、AI 掩体与导航。

本作的房屋均为单层，室内地坪与解析地表同高，没有独立的二层可走楼板；现有楼板语义是 `platform`、`bridge`，未来新增室内层时使用 `floor` tag，数据表已经覆盖。

## 3A 取舍

静态城市仍按“分区 + 材质”合批。把每块砖改成独立刚体会让数千个碰撞盒扩成数万个渲染对象，浏览器版的 1400 draw call 红线会立即失守。这里采用分层代理破坏：

1. `Data_Destruction.mjs` 负责承重白名单与砖、木、土、沙袋的局部耐久。
2. `BuildSink.Solid` 给每条碰撞记录写入破坏语义，但静态网格照旧合批。
3. 单元失效时，`FractureCollider` 沿命中面切出一只 OBB 洞口，并把原碰撞盒分成洞口四周最多四块残余盒。
4. 同一只 OBB 裁切主材质、太阳阴影和深度法线预通道；三条渲染链不会各画一堵不同的墙。
5. 断口边缘使用固定容量 `InstancedMesh`，短命砖粉复用 VFX 粒子池。
6. 同一次爆炸先批完所有破坏，再统一重建空间散列和导航位图。
7. 整关破口永久保存在 CPU；shader 只接收离玩家最近的 24 个，玩家返回旧破口时会自动重新流入。物理拓扑不受视觉预算影响。

这对应大型游戏常用的“完整静态主体 + 局部破坏代理 + 预算化残骸”，只是把预制 fracture cluster 换成了适合程序化盒体场景的确定性四分裂。

## 承重合同

以下 tag 永不被移除：

- `cityWall`：11.5 米包砖城墙本体、台面与马面基座。
- `rampart`：大体量城垣／墙基。
- `ramp`：上城马道，属于主线路。
- `tower`：城楼与角楼承重台基。

`parapet` 是墙顶掩体而非承重体，可以被削掉。任何新承重构件必须显式加入 `STRUCTURAL_TAGS`；未登记的新 tag 默认可破坏，避免场景资产静默变成无敌物件。

## 伤害入口

- 玩家弹道：`Script_Main.TryFire -> destruction.Hit`。
- AI 流弹：`Script_Ai.TryFire -> destruction.Hit`。
- 手榴弹、集束弹、迫击炮、掷弹筒、重炮：`Script_Combat.Blast -> destruction.Blast`。

爆炸先更新拓扑再计算人物遮挡，因此同一次爆压打穿薄墙后，洞口后的目标能承受剩余冲击。

## 验证

```text
node Taierzhuang1938/Script_DestructionTest.mjs
node Taierzhuang1938/Script_PhysicsTest.mjs
node Taierzhuang1938/Script_BootTest.mjs
```

第一条真拆普通墙、保护城墙、向下打穿站台/木桥，并断言每次爆炸只重建一次拓扑。开机冒烟覆盖七关全部 shader 组合与性能红线。
