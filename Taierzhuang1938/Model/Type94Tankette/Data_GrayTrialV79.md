# Type94 前角安装耳试件 V79

以 V74 为只读来源，在 2017 主照片的远侧前角增加一个窄条凸起安装耳及上部六角头候选。共新增 60 三角、一个静态网格节点；原 237 个网格表面、292 个节点的姿态与属性保持一致。安装耳挂在右传动罩的固定节点下，主动轮旋转时其世界矩阵不变。

试件按条件主机位、现有传动罩表面和推定的 4 mm 板厚放置。轮廓尺寸、深度、头形和连接关系为推定；主照片的头部中心是拟合输入。2014 年候选观察点未参与放置，预测偏差约 6.3 原图像素，观察不确定度暂记 6 像素；这一点只能支持局部一致性，不能认证相机、整车比例或精确剖面。

下部疑似头形、完整安装耳轮廓、近侧两枚前角紧固件及传动罩／履带包络仍需核对。V79 没有重烘 PBR，没有替换 V77 材质预览、V70 游戏候选或正式游戏模型。实际源工程和导出身份、验证记录及本地对照入口见 [Data_GrayTrialV79.json](Data_GrayTrialV79.json)。

重建与核对入口：

```powershell
node scripts/Script_BlenderMcp.mjs start --task Type94Tankette --batch Taierzhuang1938/_blender/Script_Type94FrontCornerTrialV79.py --json
node scripts/Script_BlenderMcp.mjs start --task Type94Tankette --batch Taierzhuang1938/_blender/Script_VerifyType94FrontCornerV79.py --json
python Taierzhuang1938/_import/Script_VerifyType94FrontCornerGeometryV79.py
node scripts/Script_BlenderMcp.mjs stop --json
node scripts/Script_BlenderMcp.mjs status --scan --json
```

源工程和备份位于 OneDrive 的 Blender 模型目录 `Taierzhuang1938/Type94Tankette/FrontCornerV79`；本地页面与观察图不进入仓库。源工程实际重开、重导 GLB 与当前试件字节一致，全部 238 个导出网格表面精确一致；原有运动门禁保持通过。模型最终验收仍未完成。
