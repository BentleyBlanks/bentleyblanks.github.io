# 东史郎 V12 角色接入

采用用户下载的完整绑骨件 `角色/Tripo/13_东史郎/AzumaShiro_Merged_V12_Bones.glb`，SHA-256 为 `54193ef9237777ab3881fa5b798fc45099c67e6d2399f049422871e1be482230`。输入为单网格、单材质、54 根 Mixamo 骨骼，三张内嵌 4K PNG 与颈根和背部底色修复后的 V12 一致。

`_import/Script_BuildAzumaShiro.mjs` 复用共用转换器，恢复 1.84 米帽顶，统一为 65 根 X Bot 骨骼的名字、顺序、层级和初始朝向，胯高比为 0.9684。转换修复 3,745 个头帽顶点的残余权重。运行时模型 `Model/Character/Model_AzumaShiro.glb` 约 7.47 MB、36,877 三角面、单网格单材质，三张贴图保持 4096×4096 并转为 WebP。发布副本另按路径贴图规则处理。输入、输出哈希和转换参数在同目录 `Data_AzumaShiro.json` 中记录。

`Data_XBotCharacters.mjs` 登记 `azumaShiro` 专属外观。场景单位使用 `castId: "azumaShiro"`，或将单位编号设为 `AzumaShiro`，白盒摆位、预演和正式场景试玩共用该登记。普通日军随机池不变。此接入提供角色身份和模型，不修改既有剧情或增添出场事件。

~~~json
{
  "id": "AzumaShiro",
  "name": "东史郎",
  "side": "ija",
  "castId": "azumaShiro",
  "x": 0,
  "z": 0,
  "yawDeg": 180
}
~~~

动作预览入口为 `Tool_MixamoAnimationPreview.html?who=azumaShiro`，人物列表由共用登记表生成。

## 动作适配与验证

`Script_BakeAzumaShiroContacts.mjs` 以 60Hz 逐顶点量测持枪行走、蹲伏、卧姿、倒地和坐姿，仅修正本角色的胯部位移，其余曲线与源动作一致。五条动作最大抬升约 3.25、4.39、7.34、8.41 和 9.15 厘米，目标为实际蒙皮最低点高于地面 2 毫米；产物和来源哈希在 `Animation/AzumaShiro/Data_AzumaShiroContacts.json` 中记录。重建入口自动重烘这些曲线，不修改共用 Mixamo 原件。

`XBotCharactersTest` 检查骨架、逆绑定、归一化权重、头帽刚性、胯高比例和接触曲线；`ModelFacingTest` 根据实际靴尖点云核对源 +Z 到角色 -Z 的共用桥接。

`AzumaShiroCharacterBrowserTest` 经真实动作预览量测 12 条代表动作、492 帧，检查蒙皮有限值、头盔刚性和运动范围。五条修正动作的回放最低点约在地面上方 1.87–2.00 毫米。场景通过内存配置测试 `castId` 与单位编号两条身份路径，再进入 `Scene_FirstLevel` 正式场景试玩，核对两名角色保持正确模型与米制比例。本地截图和浏览器测量只留在 `tmp/AzumaShiro/`。

正式试玩检查 206 个着色程序，全部链接成功，最高 14/16 个采样器，GL 和控制台错误为零。运动矢量、多画质采样器、浏览器打包、菜单启动、发布资源及其浏览器检查、资料馆浏览器检查通过。预览页补齐角色表的发布内容戳登记，字体子集补齐“郎”字并同步缓存版本。

独立发布副本通过现行路径规则和完整结构核验：三张内嵌图均转换为 2048×2048 BC7 KTX2，发布模型约 10.77 MB，源 4K WebP 模型保持不变。真实浏览器确认三张压缩图、65 骨、正背面显示和着色链接正常，控制台、资源和 GL 错误均为零。

广域 prepush 检查通过 121 项后停在 `HeadshotTest` 的远景跪姿爆头判定。临时恢复原版相关文件后，在基线 `ced65bc5` 上完全复现相同数值与断言；此既有问题未在本轮修改。未把广域回归报告为全绿。

## 重建与创作边界

~~~powershell
node Taierzhuang1938/_import/Script_BuildAzumaShiro.mjs
node Taierzhuang1938/Script_TestRunner.mjs --only=XBotCharactersTest,AzumaShiroCharacterBrowserTest,ModelFacingTest --fail-fast
~~~

源文件在其他位置时，将完整 GLB 路径作为重建命令的第一个参数。

脸型、钢盔、下巴带、卡其军服、肩章、绑腿、皮靴和身体比例均按角色参考图设计，属于本作创作外观。颈根与背部底色修复、骨架和动作适配属于游戏表现，不作为历史人物精确相貌或装备细节的证明；此标注同步至 Notion 对照表、上级说明页和游戏资料馆。
