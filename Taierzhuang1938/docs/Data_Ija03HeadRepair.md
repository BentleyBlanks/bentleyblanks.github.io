# 日军 03 脸部与备用钢盔修复

2026-09-05 在武器靶场 S30 复现，资产为 `Model/Character/Model_LugouIja03.glb`。

- 脸部 `Material #26` 的底色图带有 0–185 的 alpha，导出为 `BLEND` 后整个头部半透明，GLTFLoader 同时关闭深度写入，出现灰白脸、眼球和衣领透过皮肤。改为 `OPAQUE`，保留原 RGB、UV、法线图与顶点。不能批量关闭其他人物的透明材质；Ija01 有独立小片透明几何。
- `Object005` 是背包上携带的备用钢盔。绑定姿态实测中心为 (-0.009, 1.344, -0.261) 米，头上的布帽已在蒙皮身体里。它原来独立于骨架，后来的运行时补丁又误挂到 Head；低头、转头就会离开背包。现在在 GLB 内挂到 `Bip001 Spine2`，保留原始世界变换，并移除运行时错误补丁。相邻背包顶点的权重来自 Spine2 / Spine1。

修复不需要重新导出动画。重建命令（仓库已有 `three` 开发依赖需可用）：

```powershell
node Taierzhuang1938/_import/Script_RepairLugouIja03.mjs
# 也可给出重新烘焙后的 Character 输出目录作为位置参数
```

脚本可重复执行；只改 GLB JSON 元数据，逐字节核验 BIN 未变，因此几何、贴图、蒙皮权重与全部动作轨道保持原样。清单仅更新文件字节数。运行时资产版本为 v6。

验收入口为 `Script_CharacterModelTest.mjs` 和 `Script_ActorPoseTest.mjs`：检查 GLB 真实层级、运行时脸部不透明且写深度，并在 19 条原有/动捕动作与五条步兵动作中各采九帧，测量钢盔中心到真实蒙皮背包表面的距离（当前最大约 5.9 cm，门限 7.5 cm；这是中心距离，不是表面间隙）。另在实际武器靶场近距离查看脸、帽子与背包。验收截图只留本地 `_shots/IjaHeadRepair/`。
