# 北沙河铁路大桥：独立米制候选模型

本资产按用户 Notion [桥梁史料汇编](https://app.notion.com/p/3eb60335331c81fda6dfe38153bcec45)中实际看过的邻桥照片和现代桥址地图制作。**尚无可确认的1938年北沙河原桥照片／工程图；这是有来源边界的对标创作，不是原貌鉴定。**

## 参考与尺寸

| 依据 | 亲眼可辨／采用的内容 | 证据边界 |
| --- | --- | --- |
| [JACAR C11111424100](https://www.jacar.archives.go.jp/das/meta-en/C11111424100)，照片12，567公里、滕县北方1公里 | 低矮钢桁、平直上弦、斜端柱、轨上敞开 | 邻桥，未确认是北沙河；不能量出本桥截面与跨径 |
| 同档照片6，560公里界河桥 | 圬工支承与分孔钢桁的关系 | 不证明北沙河墩数或断口 |
| 1934《铁展》粤汉咸宁76号钢桥，资料汇编第三轮 | 完整多跨低桁侧轮廓 | 异地异桥，不是北沙河原照 |
| 现代京沪铁路跨北沙河，35.14496N、117.10696E；OSM＋Esri影像 | 跨越河漫滩的整桥尺度，采用约280米 | 现代堤岸、复线桥与水情不能反推1938原桥尺寸 |
| 内置imagegen局部构造图、无花纹旧钢底图 | 铆接、支座、木石、旧钢细节 | 仅设计参考；局部图实腹梁外形未用作主桥型 |

[官方5页照片附录 PDF](https://www.jacar.archives.go.jp/content/item/aj12/C200008287100/raw/C11111424100.c0947120012.sinasinajihenhokushi_055.1370_01.pdf)。历史照片、地图、验收网页与截图只留本地，不提交站点仓库。

现代量测端点及距离：

| OSM way | 北端经纬度 | 南端经纬度 | WGS84局部椭球距离 |
| --- | --- | --- | --- |
| 1052215401 | 117.1058401, 35.1460436 | 117.1078470, 35.1441111 | 281.802 m |
| 1052215402 | 117.1057539, 35.1459361 | 117.1077463, 35.1440263 | 279.029 m |

地图数据 © OpenStreetMap contributors，[ODbL](https://www.openstreetmap.org/copyright)；[原始数据接口](https://api.openstreetmap.org/api/0.6/map?bbox=117.102,35.140,117.112,35.150)。经纬度差乘当地WGS84曲率半径、再求距离，桥段端点与Esri可见桥端交叉检查。现代主水槽约35–50米为影像判读，边界约±5–10米；并不等于整桥长。**280米取整值、14孔×20米、桥面高程、墩台截面、配色、旧损都属于设计推定。**

## 产物契约

- `Model/Model_BeishaheBridge.glb`：一座完好桥，标准glTF Y-up，X东、Z南，单位米；原点在桥中心枕木顶。支承轴总长280米，含翼墙外包长度约288.1米。
- `Model/Data_BeishaheBridge.json`：实际GLB哈希／字节数、包围盒、实例三角数、每跨4个支座坐标、来源和创作边界。`_blender/Data_BeishaheBridgeSpec.json` 为设计尺寸输入。
- 14个独立跨组共享网格，13座中间石墩、两端桥台；低矮半穿钢桁，轨道上方敞开，无高门架／顶横联、道路铺装或另加人行栏杆。
- 两轨头内缘净距1.435米。节点 `Intact_Span01…14` 含 `Trusses / Rivets / Sleepers / RailWest / RailEast / Bearings`；`Shared_Pier / Cap / Abutment` 独立。支座接下弦，枕木接纵梁盖板；固定／滚动支座细部是设计补足。
- 既有 `HandcartWood`、`CityWallStone` 及新增 `BeishaheSteel` PBR嵌入GLB，无外部贴图请求。新钢面为1024 Base、512 Normal/ORM，共369,312字节；独立增加384 KiB的lazy／总目录预算，不增加boot或关卡预算。
- 最新44米四孔白盒、旧浮桥、旧钢桁桥及剧情／碰撞／爆破时间线均未替换。未来接入整桥须同步处理河漫滩与关卡空间，不用非均匀缩放硬塞进局部白盒。

## 重建与源工程

源文件与备份：`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/BeishaheBridge/Scene_BeishaheBridge.blend`。原图、生成输入和参考在同目录 `References/`；生成提示词在 `_blender/Prompts/Reference_BeishaheConstruction.txt`、`_import/Prompts/Texture_BeishaheSteel.txt`，均走内置imagegen。

```powershell
node scripts/Script_BlenderMcp.mjs start --task BeishaheBridge
node scripts/Script_BlenderMcp.mjs exec --code "import runpy; runpy.run_path(r'<worktree>/Taierzhuang1938/_blender/Script_BuildBeishaheBridge.py', run_name='__main__')"
node scripts/Script_BlenderMcp.mjs stop --save
node scripts/Script_BlenderMcp.mjs status --scan
```

在任务独占worktree运行。脚本拒绝覆盖源目录以外的已打开工程，重新生成GLB及sidecar。钢面PBR重烘用 `_import/TextureBakes/Texture_BeishaheSteel.json`；换电脑先映射到保留的源图路径。

## 验收

`node Taierzhuang1938/Script_BeishaheBridgeTest.mjs` 检查真GLB米制尺寸、分孔、支承、轨距、开放桁架、嵌图与哈希；`Script_TextureStandardsTest`检查纹理和预算。数值测试不能替代视觉对照。

本地页 `tmp/BeishaheBridge/index.html` 提供整桥侧视／斜视、单孔、桥面、支座与原图并排。用仓库LocalPreview静默预览；`tmp/BeishaheBridge/Script_Review.mjs` 复用静音浏览器工具，保持1440×960实际视口，观察图长边640，检查JSON与截图只留本地。Blender渲染留源目录 `Review/`。

可验的对标范围是低桁轮廓、直上弦、斜端柱、开放桥面、多短跨与石墩关系。原图不能辨认的截面、铆钉、支座和材质按创作补足，不升级为“1938年原桥已精确复原”。
