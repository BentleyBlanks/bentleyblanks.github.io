# 谷寿夫 V4 角色接入

## 输入与转换

输入为用户下载的完整绑骨件 `角色/Tripo/09_谷寿夫/TaniHisao_Merged_V4_Bones.glb.glb`，SHA-256 为 `b7fb6178e2b0cd6ab80b8eccc113dbe938a30a6a11f3da98f9df00e0a262b3db`。文件包含52根Mixamo骨骼、一套蒙皮和一个材质。

`Script_BuildTaniHisao.mjs` 复用 `Script_BuildXBotRigCharacter.mjs`，恢复约1.831米帽顶，统一为65根X Bot骨骼的名字、顺序、层级和初始朝向。胯高比为0.9361，运行时动作通过共用 `ClipForCharacter` 换算。

输入上半头部存在肩骨等残余影响。转换器在原有颈骨渐变之后，将头骨关节9厘米以上的剩余影响归入Head，修复1,250个顶点。头帽刚性由静态检查和逐帧蒙皮检查共同验收。

运行时模型为 `Model/Character/Model_TaniHisao.glb`，约7.76 MB、43,149三角面、单网格单材质。三张4K贴图转换为WebP，来源、哈希、尺寸和权重修复数量在同目录的 `Data_TaniHisao.json` 中记录。

## 游戏配置

`Data_XBotCharacters.mjs` 登记 `taniHisao`，作为命名角色的专属外观。场景单位使用 `castId: "taniHisao"`，或将单位编号设为 `TaniHisao`。白盒预演与场景试玩走共用外观加载和动作转换。

~~~json
{
  "id": "TaniHisao",
  "name": "谷寿夫",
  "side": "ija",
  "kind": "officer",
  "castId": "taniHisao",
  "x": 0,
  "z": 0,
  "yawDeg": 180
}
~~~

动作预览入口为 `Tool_MixamoAnimationPreview.html?who=taniHisao`。人物列表由共用登记表生成。

## 验收与已知差异

`XBotCharactersTest` 检查骨架、绑定、归一化权重、胯高比例和上半头部刚性。`ModelFacingTest` 量测真实靴尖顶点云，确认源朝向+Z，再由共用桥接适配角色-Z。

`TaniHisaoCharacterBrowserTest` 经真实动作预览检查待机、说话、指挥、观察、行走、跑步、端枪、蹲伏、卧姿、倒地和坐姿，合计12条片段、492帧。场景测试通过内存配置加入两名测试军官，分别检查castId与单位编号两条识别路径。

卧姿采样的最低点约低于地面7.5厘米，坐姿约10.8厘米，反映本角色与共用动作的局部贴地偏差。头帽刚性、蒙皮有限值和动作范围检查通过。

本地取证保存在忽略目录 `tmp/TaniHisao/`。

新角色实际出场的高档场景检查176个着色程序，均链接成功，最高14/16个采样器，GL错误为0。运动矢量、浏览器打包、标题菜单启动及4项发布资源检查通过，字体已补齐“寿、夫”。

广泛quick回归通过113项，停在 `OpeningSetTest` 引用的旧资产 `Model/Model_HanYang.tzm.json` 缺失处，该文件在9fc9b75b上游基线中同样缺失。全量 `MenuTest` 另有持械状态及测试场旧数量断言失败，测试仍按8个测试场核对，现行登记为10个。相关测试、菜单和测试场登记与该基线一致。

## 重建与来源标注

~~~powershell
node Taierzhuang1938/_import/Script_BuildTaniHisao.mjs
node Taierzhuang1938/Script_TestRunner.mjs --only=XBotCharactersTest,TaniHisaoCharacterBrowserTest --fail-fast
~~~

可以把其他位置的完整绑骨GLB路径作为重建命令的第一个参数。

本作脸型、无发无须头部、军官帽、卡其军服、马裤、皮靴、肩章与身体比例按角色参考图设计，属于创作外观。骨架与动作适配属于游戏表现。此标注已同步至Notion对照表、上级说明页和游戏资料馆。
