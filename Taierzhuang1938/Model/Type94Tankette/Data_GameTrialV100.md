# Type94 当前结构游戏派生 V100

从 V99 当前完整 PBR 和 V98 结构派生至 78,716 三角，含最新钩口、开孔锁闩及独立传动罩凸耳；240 个网格所有者、296 个节点、每侧 80 个独立履带片。正式资产仍为 V12，本候选仅本地保留。

只有当前高、低表面签名同时等于旧证明的源对时，才继承 V70 连续距离证明。车体的角形新件保留原几何，八件悬挂槽保留锁定截面。变化部分重新降面并作双向连续表面证明，最终保存的高低源再次独立重开测量；实际世界表面上界为 2.997969 毫米，低于原 3 毫米门槛。

源表面与实际 GLB 逐个比较所有有索引的有向三角面。高源 Hull 另有 484 个无面孤立作者顶点，glTF 不导出这些非表面点；检查明确记录其数量，全部有效表面逐面精确一致。未以放宽距离或删除有效三角面解决源／导出绑定。

重新展开低模 UV，从实际高表面独立投射十二张 PBR 图。16,116 个直接投射漏射像素由最近真实高三角面的原着色器补取样，并经逐像素重放验证。运行时 Normal 强度为 1，避免重复施加高模法线响应。保存源、导出、机构扫掠、行走轮与履带循环均有独立实际检查；具体数值、身份和隔离全重建结果见 [Data_GameTrialV100.json](Data_GameTrialV100.json)。

全重建保留了 240 个网格的实际几何、法线、UV、切线及全部控制节点。严格图像比较发现 PaintNormal 有五个像素各差一个 8 位量级，其余十一图逐像素一致。严格十二图一致门禁仍记录为未通过，未把量化差异改报为完全一致。该游戏版仍使用 V99 的材质，尚未接入 V101 新磨损。

```powershell
$env:TYPE94_GAME_ROOT='C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/GameReplayV100'
node Taierzhuang1938/_blender/Script_BuildType94GameV100.mjs --dry-run
node Taierzhuang1938/_blender/Script_BuildType94GameV100.mjs
python -X utf8 Taierzhuang1938/_import/Script_VerifyType94GameRebuildV100.py
```

支持 `--phase`、`--from`，源输入为显式保留的 V99 高源与 V70 及其继承证明链。完整 GLB、`.blend`、贴图、日志和本地页面留在外置 `GameTrialV100` 与 `GameReplayV100`，仓库保存配方、依赖身份和说明。整体照片／相机与截面依据仍待验收，不因技术检查通过而接受全目标。
