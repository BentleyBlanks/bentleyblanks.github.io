# Sichuan Blanket Pack — V8 Straw and Wear

本页为已被用户否决的 V8 历史记录。当前续修见 [V9 Reference Wear](Data_ReferenceWearV9.md)。

用户反馈“材质的新旧差异过大；草席卷和草鞋外形差异也还是太大”。本轮保留 V7 被包、布带及短褂的几何，重做草编件并统一旧化；没有进行游戏减面或替换 V6 游戏 GLB。

## 当前源工程

`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack/HighV8/Scene_SichuanPackStrawWearV8.blend`

V7 源工程保留为被包形体基准。当前文件仍使用米制及 Blender 原生 Z-up，贴背面、居中轴心和后续 glTF Y-up 转换约定保留。`Pack_StrawMat`、`Pack_Sandals` 和 `Pack_Jacket` 保持独立部件组。

## 改动

- 草席由实际卷起的草片形成五圈紧密、不规则的卷层，端面保留编边和纤维，移除实心端盖与浮雕同心圈。外层草条真实交错，捆带跨过卷层接缝时保持平顺。
- 草鞋改为参考图的窄跟朝上、宽鞋头朝下；鞋底采用粗人字编织和厚编边，鞋口由开放编绳构成。两只鞋错位悬挂，细绳在被包侧面有实际接触、绕系和绳结。
- 内置 imagegen 生成棉布、灰带、靛蓝布和草纤维的共同旧化底色。技术处理去除每块平铺中的大范围照明与污渍重复，保留纤维细节；尘土、泥汗在三维部件坐标中统一施加。
- 被面、折层、补丁按实际尺寸使用同一粗布纤维；灰带降低过强的针织感，靛蓝布保留深蓝染色。旧化坐标随整包或独立部件移动，抽出短褂时污渍保持附着。

三张新材质源图都是 1024：`Texture_SichuanWornFibersV08Base.png`、`Texture_SichuanWornFibersV08Normal.png`、`Texture_SichuanWornFibersV08Roughness.png`。它们用于当前高模材质，最终游戏 UV 和 PBR 烘焙仍是后续阶段。生成原图保存在 OneDrive `Source/MaterialAtlasV08/`，[提示词](Data_SichuanWornFibersV08Prompt.txt) 和 [来源记录](Data_SichuanWornFibersV08.json) 随重建脚本保留。

## 重建与核验

```powershell
node scripts/Script_BlenderMcp.mjs start C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack/HighV8/Scene_SichuanPackStrawWearV8.blend --task SichuanBlanketPack
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_SichuanPackRefineV8.py --timeout 300
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
```

该入口也可从 V7 被包源工程运行。它只替换草席、草鞋及材质，并比较被包、布带和短褂的顶点哈希，阻止意外改变已保留的形体。PBR 源图由 `_import/Script_SichuanWornFibersV8.py` 从保存的 imagegen 原图生成。

验收使用真实 Blender 斜前、草席端面和草鞋近景；重新打开工程检查打包图像、部件坐标和脚本文本。渲染、对照与本地审计保存在 `tmp/SichuanBlanketPack/Review/`，不提交截图或验收页面。用户尚未最终确认这一版视觉效果。
