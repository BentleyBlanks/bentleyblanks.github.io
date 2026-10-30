# Type94 分层金属磨损 V101

在 V99 当前高源上进一步区分涂层掉落的暗边、旧钢底色和反复接触后的磨亮区域，解决上一版浅色斑点读起来像颜料的问题。装甲边缘与舱盖保留不连续的缺损，把手、机构棱边和机枪有细小擦痕；履带以实际 `TrackContact` 工作面属性安排摩擦亮面，凹处保留较暗、较粗糙的铸钢和少量氧化层。

三类材料分别改变 BaseColor、Roughness、Metallic 和 Normal。裸钢比旧损外缘更平滑并具有独立导电反射；细划痕按米制尺寸绘制，新增的车体擦痕在世界表面投射，跨三角面和 UV 接缝连续裁切。没有往 BaseColor 画灯光高光。第一版分层候选已存于外置 `Versions/LayerStudyA`；观察后减少小斑点并增加少量成组擦痕。

694,476 个三角面、240 个网格、296 个节点及所有原位置、法线、UV、绑定与控制参数保持不变。仍是完整十二图：Paint 4K、Track／Steel 2K、Rubber 1K；全部原 AO 和 Rubber 图像精确保留，未触及的纹理像素精确保留。可编辑源打包原图和独立磨损蒙版。具体身份、贴图统计、独立检查和重建结果见 [Data_SurfaceStudyV101.json](Data_SurfaceStudyV101.json)。

独立实际导出检查包含几何、源重导、真实引用的十二图、暗色旧损与导电亮面分离；浏览器以同机位前后对照实际材质，并操作履带、炮塔、机枪、锁闩和十个盖板。预览静音，仅本地保留：[金属磨损](http://127.0.0.1:8114/tmp/Type94WearReviewV101/?view=weapon)、[履带钢面](http://127.0.0.1:8114/tmp/Type94WearReviewV101/?view=shoeDetail)。

```powershell
node Taierzhuang1938/_blender/Script_BuildType94WearV101.mjs --dry-run
node Taierzhuang1938/_blender/Script_BuildType94WearV101.mjs
python -X utf8 Taierzhuang1938/_import/Script_VerifyType94WearV101.py
```

顺序为 Prepare → Raster → Apply → Verify，支持 `--phase` 和 `--from`。`TYPE94_WEAR101_ROOT` 指定隔离外置目录；输入为 manifest 锁定的 V99 源。脚本及依赖快照位于外置 `SurfaceV101/Rebuild`。

隔离全重建的十二张图逐像素一致，240 个网格的几何和全部控制节点一致。严格逐角点比较仍发现拖钩与炮塔两个网格的切线最大差 0.000100017；保存源与导出验证沿用实测导出器四位小数精度，严格全属性逐位一致审查仍记录为未通过，不合并为“完全一致”。

磨损数量与位置属于表现性复原，尚未获得整车照片的完整形态验收。当前 V101 是高精度材质候选，尚未投射进 V100 游戏派生；正式游戏资产与线上页面未替换。
