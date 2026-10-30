# Type94 当前结构完整 PBR V96

把 V95 钩根、横销和开孔锁闩接回 V92 的完整 PBR，保留旧车体的已做磨损。Hull 保留多边形逐面转移原 UV，其他 236 个网格保持原材质／UV。新拖钩和锁闩使用实际 V92 Paint 图集中的空白 768×320 区域，旧采样足迹外扩 12 像素后仍不与新区域相交。

新件的 Base、Normal、ORM 单独烘焙后合成回 4K Paint 图，原区域的 Base、Normal、Roughness 和 Metallic 逐像素保留。当前几何的 Paint AO 重新烘焙，清除旧拖环／支座接触留下的遮蔽；其余三类材质保持原图。完整运行时仍为 Paint 4K、Track 2K、Steel 2K、Rubber 1K，共十二张标准 PBR 图。

接触磨损限于钩口、横销端面、弹簧和锁闩边部，分别改变钢面反射率、粗糙度、导电性和漆层颗粒。它们为结合原图的制作推定，没有把高光画进 BaseColor。初版新件过新，保存在外置 `Versions/BeforeCouplingWear`；旧车体磨损没有借此重做。

独立检查实际 GLB 的几何／法线与 V95 一致、保存源重开及重导、实际导入的十二张 packed 图、材质绑定和源／运行时图像像素。源重导切线按本机导出器精度核对并保持方向符号；不把不同容器哈希误报为完全一致。纹理、几何与控制器的具体身份和检查数见 [Data_SurfaceStudyV96.json](Data_SurfaceStudyV96.json)。

本地材质页包含履带、炮塔、机枪、锁闩与十个盖板控制，可切换 V92 对照。当前原图比较页保留同一套条件机位与镜头映射，支持 PBR／灰模切换；中性检查光照没有作测光配准，GPU 投影通过不代表实车相机或整车形态已通过。全部预览静音，仅本地保留；游戏派生版和 canonical 尚未替换。

```powershell
node Taierzhuang1938/_blender/Script_BuildType94TowPbrV96.mjs --dry-run
node Taierzhuang1938/_blender/Script_BuildType94TowPbrV96.mjs
python -X utf8 Taierzhuang1938/_import/Script_VerifyType94TowPbrV96.py
```

顺序为 Atlas → Prepare → Bake → Composite → Finalize → Ao → Verify；`TYPE94_PBR_ROOT` 可指定隔离外置输出。输入须保留已记录的 V92 材质源和 V95 结构源；完整脚本、依赖哈希及本地页面脚本快照保存在外置 `SurfaceV96/Rebuild`。
