# 川军大刀外观考据

## 实物照片

| 出处 | 可见部分与采用依据 |
| --- | --- |
| [建川博物馆供图《国军用大刀》](https://www.krzzjn.com/show-924-13393.html) · [原图](https://www.krzzjn.com/uploadfile/2015/0703/20150703101523486.jpg) | 报道访问了建川博物馆，图注署「国军用大刀（建川博物馆供图）」。同框四把刀的护手、环首和柄部各异。本作以最上方一柄为主样本，按照片侧面采样刀背、刃线、刀头、护手、布柄和环首。图注没有指明该单件的部队与年代。 |
| [香港历史博物馆展览图录，印刷第22页](https://hk.history.museum/documents/Exhibitions/Current-Exhibitions/80awarofresistance/80A-Booklet.pdf#page=13) | 中国国家博物馆所藏「台儿庄战役中国军队使用的大刀」，标为1938年。侧面可见宽头、尾环和近柄的小护手，柄部露出固定点。用来交叉核对同一时期存在这些外形特征。 |

## 川军背景与来源边界

- 川军随身带大刀的记载见记者对建川博物馆藏品的报道。馆方出川影像能看到行军人员和着装，刀的完整轮廓只够用实物照片校准。[中新网](https://www.chinanews.com/cul/2014/09-03/6558063.shtml) · [四川建川博物馆](https://www.jc-museum.cn/news/1149.html)
- 网上另有蓝底红绸单刀，图注写「抗战川军所用的大刀」，该页缺收藏机构、原图来源与单件记录。图中的卷曲护手与主样本不同。[抗日战争纪念网转载](https://m.krzzjn.com/show-1182-47353.html)
- 滕县第122师单件的可核归属、背面和厚度资料仍待查。游戏以实物供图为基础生成三视图，作为外观对标；未拍视角的轮廓、底色与磨耗属于复原。

## 成品与重建

- 游戏加载 `Model/Model_Dadao.tzm.json`。`Script_TraceDadaoThreeViews.py <Reference_SichuanDadaoThreeViews.png>` 提取正背剪影和窄视图，并写入 `Data_SichuanDadaoThreeViewFit.json`。`Script_BuildSichuanDadao.py` 读取这些控制点，在 Blender 中对齐原有挂点。使用 `BuildAll.py -- --only Dadao` 构建，三角上限为 10,000。
- 初版将三视图上的锈斑和布纹投影到正面、背面和窄面，并在中性灯光下校准底色。缺少直接参考的表面用 OpenAI Image API 的 `gpt-image-2.6-sunburst` 补齐，设置为最高档 `max`，源图 3840 × 2160。[未拍表面提示词](Prompt_SichuanDadaoUnseenSurfaces.txt)
- `Texture_DadaoDiffuseFit.png` 记录局部基色校准。它由同机位实渲、UV 数据和一次基色光响应测量反推，在烘焙时应用于线性基色，保留原图的细小斑驳和纹理。
- `Texture_DadaoSideDiffuseFit.png` 记录按实渲基色响应拟合的窄侧校准。用 UV 双线性采样拟合局部色差，并纳入正背相机的共同观测。
- 刀身采用对服役期间外观的美术推定。缎面灰钢带有沿刀身方向的细磨痕，刀背较暗，刃缘的反光随光源位置变化。用同一 OpenAI Image API 最高档生成 3840 × 2160 钢材样片，将压缩源图 `Texture_DadaoFieldSteelSource.webp` 按刀身的 UV 范围烘入基色和法线，并对刀面、刀背和刃缘分别设定金属度和粗糙度。[钢材提示词](Prompt_SichuanDadaoFieldSteel.txt) · [加拿大文保研究所铁器表面资料](https://www.canada.ca/en/conservation-institute/services/conservation-preservation-publications/canadian-conservation-institute-notes/care-cleaning-iron.html)
- 运行 `python Taierzhuang1938/_import/Script_BakeDadaoPbr.py <Reference_SichuanDadaoThreeViews.png> <Texture_DadaoUnseenSurfaces.png>` 烘焙 2K 基色、1K OpenGL 法线与 1K ORM，再运行 `python Taierzhuang1938/_import/Script_BakePbrTexture.py --audit --name Dadao` 记录成品校验值。
- `Scene_SichuanDadaoThreeViewFit.blend`、对标图和源贴图保存在素材库的 `Blender/Taierzhuang1938/SichuanDadao`。Blender 工程保留独立部件和三个相机，随工程打包运行时贴图。
