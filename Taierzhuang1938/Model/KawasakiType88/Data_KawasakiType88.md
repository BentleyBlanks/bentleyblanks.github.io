# 川崎八八式侦察机二型

当前正式资源为 **ReferenceGeometry86 / Surface44**（Release86，2026-10-28 获准配置收尾）。游戏版 **79,944 三角、52 网格、68 节点、28 材质、53 张内嵌无损 WebP 图**；高源 **266,946 三角**。模型按米制、Y-up、机首 −Z 导出，游戏中性包围尺寸约 **15.000 × 3.379 × 12.510m**。

用户接受本版进入项目配置。它是馆藏参考复原；窄反光带等细节仍有差异，不宣称逐像素复现或原厂图纸级尺寸。

## 项目配置

- 资源：`Model_KawasakiType88.glb`；参数与轴心在 `../../Data_KawasakiType88.mjs`。
- 资产规范表登记于 `../../Data_AssetStandards.mjs`，可在高级工具的资产规范页查看预算与贴图说明。
- `campaignEnabled:false`：独立资产登记不自动改变既有任务编队。是否启用到正片，由具体任务配置单独决定。
- 十个真实控制节点保留螺旋桨、双轮、方向舵、左右升降舵及上下左右副翼；`../../Script_KawasakiType88Motion.mjs` 同步外露推杆，无缩放变形模拟。

## 几何、材质与验收

游戏版按刚性归属合批，保留舵面、轮、推杆、支撑见证网格和全部轴心；合批前可编辑游戏源为295网格。高源不减面。Base 使用UV0和sRGB；细节法线使用物理尺度UV1，ORM和法线均为数据纹理。27个不透明角色共用几何烘焙的装配AO（游戏2K、高源4K，64场景采样、16AO节点、0.30m距离、统一0.75强度），透明风挡不乘不透明AO。

全部53张导出图以无损WebP保存，`Data_KawasakiType88Packing.json`逐图记录源与解码像素一致性，几何buffer、索引、UV、法线与节点数据在打包中保持。289项资源检查、两种源工程及两种实际导出各301项机构检查均通过。刚性合批前后79,944个有向三角形的世界坐标、材质角色、法线及全部UV在1e-6精度一致。真实GLTFLoader将52个glTF网格拆为65个渲染primitive，PBR编译、渲染与正反控制检查通过，无WebGL或页面错误。技术通过不等于逐像素图像一致。

## 重建

Blender源工程、备份、原始参考和高源导出保存在：

`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/KawasakiType88/Release86`

仓库中的 `Rebuild/` 保存两种精度的作者UV和AO图集记录。重建前逐对象校验拓扑与角点数量；不在缺失记录时静默换成其他投影。

```powershell
node Taierzhuang1938/_blender/Script_RebuildKawasakiType88.mjs --detail both
node scripts/Script_BlenderMcp.mjs start --batch Taierzhuang1938/_blender/Script_AuditKawasakiType88.py --task KawasakiType88
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
node Taierzhuang1938/Script_KawasakiType88AssetTest.mjs --browser
```

原始.blend、比较页、截图、HDR诊断、失败候选和视频均只留本地。正式目录仅包含游戏GLB、重建输入、打包报告和说明。

## 图证与推定范围

- 主参考：[各务原馆藏1/20二型模型](https://commons.wikimedia.org/wiki/File:Kawasaki_KDA-2_03_(1_20th_scale_model).png)，Motokoka，2020-06-09，CC BY-SA 4.0。原始2409×2456 PNG及来源SHA保存在外置References目录；馆藏“12”号不是已确认的滕县实机编号。
- [二型历史照片与图版](https://www.airwar.ru/enc/other1/kda2.html)用于核对悬吊散热器、高垂尾、排气、支柱和副翼。页面混有一型和轻轰炸型；不采用一型前置方形散热器或轻轰炸型附加支柱/炸弹架。
- [用户Notion资料页](https://app.notion.com/p/40260335331c81859cd8ef117fd67a59)中的六张图均已读取；第01/02图属于同张1935历史照片及裁切，不当成两次独立互证。第04图的Commons分类是轻轰炸型。
- [战史研究原文](https://ousar.lib.okayama-u.ac.jp/files/public/5/53301/20160528122710481090/scs_014_047_070.pdf)的八八/九四记录异记保留；不能据此确定本模型子型、编号或配色。
- [防卫研究所目录第278页](https://www.nids.mod.go.jp/military_archives/pdf/catalog/n3.pdf#page=278)仅提供1929《八八式偵察機圖面目録》馆藏线索，尚未取得原图。[Model Art目录](https://www.aeroflight.co.uk/mags/contents/model-art-1-contents-listing-1960s)的1969年8月No.30条目也未取得图版，均不作尺寸证据。

翼型、未见内构、隐蔽面标记和装配细节为参考推定。固定水平尾翼偏航−2.0733553°及安装高度2.135m来自照片拟合；13.55°方向舵只是本地比较姿态，规范资源保持中性。材质采用统一作者颜料和物理PBR，没有把照片的RGB、光照、阴影、法线或白色高光条烘入资产。
