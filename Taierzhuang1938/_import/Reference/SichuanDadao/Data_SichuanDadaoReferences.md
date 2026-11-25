# 川军大刀外观考据

## 实物照片

| 出处 | 可见部分与采用依据 |
| --- | --- |
| [建川博物馆供图《国军用大刀》](https://www.krzzjn.com/show-924-13393.html) · [原图](https://www.krzzjn.com/uploadfile/2015/0703/20150703101523486.jpg) | 报道访问了建川博物馆，图注署「国军用大刀（建川博物馆供图）」。同框四把刀的护手、环首和柄部各异。本作以最上方一柄为主样本，按照片侧面采样刀背、刃线、刀头、护手、布柄和环首。图注没有指明该单件的部队与年代。 |
| [香港历史博物馆展览图录，印刷第22页](https://hk.history.museum/documents/Exhibitions/Current-Exhibitions/80awarofresistance/80A-Booklet.pdf#page=13) | 中国国家博物馆所藏「台儿庄战役中国军队使用的大刀」，标为1938年。侧面可见宽头、尾环和近柄的小护手，柄部露出固定点。用来交叉核对同一时期存在这些外形特征。 |

## 川军背景与来源边界

- 川军随身带大刀的记载见记者对建川博物馆藏品的报道。馆方出川影像能看到行军人员和着装，刀的完整轮廓只够用实物照片校准。[中新网](https://www.chinanews.com/cul/2014/09-03/6558063.shtml) · [四川建川博物馆](https://www.jc-museum.cn/news/1149.html)
- 网上另有蓝底红绸单刀，图注写「抗战川军所用的大刀」，该页缺收藏机构、原图来源与单件记录。图中的卷曲护手与主样本不同。[抗日战争纪念网转载](https://m.krzzjn.com/show-1182-47353.html)
- 滕县第122师单件的可核归属、背面和厚度资料仍待查。游戏沿用挂点和整体尺度，单面照片无法提供的深度、材质底色与磨耗由本作补足。

## 成品与重建

- 游戏加载 `Model/Model_Dadao.tzm.json`。`Script_BuildSichuanDadao.py` 保留侧面取样与四条 UV 图集区域，走 `BuildAll.py -- --only Dadao` 构建。三角上限为 10,000。
- 钢面和棉布源图由 OpenAI Image API 的 `gpt-image-2` 生成，原图 1536 × 1024。提示词见 [材质提示](Prompt_SichuanDadaoSurfaces.txt)。运行 `python Taierzhuang1938/_import/Script_BakeDadaoPbr.py <Texture_DadaoSource.png>` 烘焙 1K Base、OpenGL Normal 和 ORM，再运行 `python Taierzhuang1938/_import/Script_BakePbrTexture.py --audit --name Dadao` 记录成品校验值。
- Blender 工程及原图存于素材库的 `Blender/Taierzhuang1938/SichuanDadao`。三个运行时贴图随工程打包。
