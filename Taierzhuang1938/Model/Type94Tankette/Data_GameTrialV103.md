# Type94 新磨损游戏派生 V103

把 V102／V101 的分层掉漆、暗色旧钢、接触亮面和细擦痕投射到当前游戏模型。保留 V100 已验证的 78,716 三角、240 网格所有者、296 个机构节点和低模 UV，不重新降掉结构。每侧仍有 80 个独立履带片，炮塔、机枪、锁闩和盖板保持独立控制。

连续表面证明仅在当前高模的实际几何／法线／UV 与旧证明的高模精确一致，且最终新低模的全部几何／法线／UV／作者切线与旧低模精确一致后继承。旧证明文件也按哈希绑定；实际保存源再次重开、dump 三角面并与真实导出逐面核对，双向世界表面上界保持 2.997969 毫米。当前修改是完整材质更新，没有把缺失结构换成更小的测试范围。

沿用低 UV，重新以独立隔离的实际高表面投射 Paint 4K、Track／Steel 2K、Rubber 1K 共十二图。16,116 个直接漏射像素从最近真实高三角面补取原着色器响应并逐像素重放。另有一个有效采样点及其四个边缘填充像素在独立直接烘焙时相差一个字节；将这个明确绑定高源／几何／UV 哈希的点加入真实表面求值后，两个独立输出的十二图均逐像素一致。没有复制某一版颜色或放宽比较门槛。旧候选保留于 `Versions/DirectBakeBeforeStabilityReplay`。

新材质实际更新 Paint、Track、Steel 图像；低模 Normal 强度保持 1。稳定采样位置及原因见 [Data_ProjectionStabilitySitesV103.json](Data_ProjectionStabilitySitesV103.json)。

V100 实际低模的作者切线也保存在新 Blender 源，重导前逐面严格核对。当前源重导的几何、法线、UV、切线、控制节点和十二图均作精确比较；全配方冷重建另行记录，不用源重导代替全烘焙验证。结果、身份与尚存差异见 [Data_GameTrialV103.json](Data_GameTrialV103.json)。

```powershell
node Taierzhuang1938/_blender/Script_BuildType94GameV103.mjs --dry-run
node Taierzhuang1938/_blender/Script_BuildType94GameV103.mjs
python -X utf8 Taierzhuang1938/_import/Script_VerifyType94GameRebuildV103.py
```

`TYPE94_GAME_ROOT` 指定隔离外置目录，支持 `--phase` 和 `--from`。阶段为 Transfer → Refresh → 四材质投射 → Repair／Pixels → Finalize → SourceAudit／Raw／Sections → Motion → Running；输入为保留的 V102 高源、V100 低源及其连续证明与投射工程。

本地预览：[V103 游戏版／V102 高源同机位比较](http://127.0.0.1:8114/tmp/Type94GameReviewV103/?view=weapon)。真实浏览器包含材质切换和可动控制，本页静音。预览、图像、完整 GLB、`.blend` 与日志保留在外置 `GameWearV103`／`GameReplayV103`；正式资产和线上页面未替换。整体形态、相机和推定截面尚需参考验收。
