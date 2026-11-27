# 川军大刀外观考据

## 实物照片

| 出处 | 可见部分与采用依据 |
| --- | --- |
| [03 杨云峰大刀，梁茵摄](https://xinwen.bjd.com.cn/content/s6874f2c8e4b0bd64e2e0e846.html) | 当前外形和材质参考。照片来自中国共产党历史展览馆，实物由第29军老兵杨云峰捐赠。按用户确认的整把横向加宽 15% 图拟合刀头孔、卷护手、布柄与红线尾环，沿用实物照可见的氧化斑和布纹。 |
| [02 中国国家博物馆藏台儿庄战役大刀](https://www.chnmuseum.cn/zl/gbxz/202508/t20250826_272533.shtml) · [香港历史博物馆展览图录](https://hk.history.museum/documents/Exhibitions/Current-Exhibitions/80awarofresistance/80A-Booklet.pdf#page=13) | 此前版本的外形参考，可见卷曲护手、裸铆接柄与椭圆尾环。 |
| [01 建川博物馆供图《国军用大刀》](https://www.krzzjn.com/show-924-13393.html) · [原图](https://www.krzzjn.com/uploadfile/2015/0703/20150703101523486.jpg) | 旧版以同框最上方的布缠柄大刀为主样本。图注确认是建川博物馆供图，四把的单件年代与部队归属待核。 |

## 川军背景与来源边界

- 川军随身带大刀的记载见记者对建川博物馆藏品的报道。馆方出川影像能看到行军人员和着装，刀的完整轮廓只够用实物照片校准。[中新网](https://www.chinanews.com/cul/2014/09-03/6558063.shtml) · [四川建川博物馆](https://www.jc-museum.cn/news/1149.html)
- 网上另有蓝底红绸单刀，图注写「抗战川军所用的大刀」，该页缺收藏机构、原图来源与单件记录。图中的卷曲护手与主样本不同。[抗日战争纪念网转载](https://m.krzzjn.com/show-1182-47353.html)
- 滕县第122师使用大刀有史料记载，单件归属仍待核。当前游戏资产用杨云峰大刀作为同期外观参照。照片背面、窄面与遮挡处按游戏外观补全。[第122师配备记载](https://dangshi.people.com.cn/n1/2020/0924/c85037-31872956.html)

## 成品与重建

- 游戏加载 `Model/Model_Dadao.tzm.json`。使用 `python Taierzhuang1938/_import/Script_TraceYangYunfengDadao.py <Reference_YangYunfengWhiteWiderTogether15.png>` 提取可见轮廓到 `Data_YangYunfengDadaoFit.json`。`Script_BuildYangYunfengDadao.py` 按现有游戏挂点定位模型。使用 `BuildAll.py -- --only Dadao` 导出，成品 9,724 三角，预算上限为线上旧版 9,010 三角的 1.2 倍。
- 可见面使用原照投影。各面依据照片的布带搭接叠加 OpenAI Image API 纤维样片的织纹和粗糙度变化，窄面与背面沿用钢面样片。纤维样片以 `gpt-image-2` 生成，参数为 `high`、2048 × 1024。[钢面提示词](Prompt_YangYunfengSteel03Surface.txt) · [纤维提示词](Prompt_YangYunfengTextiles.txt)
- 运行 `python Taierzhuang1938/_import/Script_BakeYangYunfengDadaoPbr.py <Reference_YangYunfengWhiteWiderTogether15.png>` 烘焙 2K 基色、1K OpenGL 法线和 1K ORM。`Texture_YangYunfengDiffuseFit.png` 记录同机位实渲校准值。运行 `python Taierzhuang1938/_import/Script_BakePbrTexture.py --audit --name Dadao` 登记成品。
- `Texture_YangYunfengGeometryAo.png` 保存现有网格的接触遮蔽。重算时在 BlenderMCP 会话中从 `_blender/Script_BakeYangYunfengDadaoAo.py` 调用 `BakeAo` 写入 NPZ，再给烘焙命令加 `--raycast <NPZ 路径>`。烘焙脚本将网格接触遮蔽和布带搭接、纱线的细部遮蔽写入 ORM 红通道。
- `Scene_YangYunfengDadaoWider15.blend`、同机位对照、纯白背景三视图和原始纤维样片留在素材库的 `Blender/Taierzhuang1938/SichuanDadao/YangYunfengModel`。参考图在同级 `YangYunfengPhotoReference`。源工程包含独立部件、对照相机和打包贴图。
- `Scene_YangYunfengDadaoSurface.blend` 保存最新版材质。同目录 `SurfaceReview` 有检视台同机位的新旧对照。
