# 川军大刀外观考据

## 实物照片

| 出处 | 可见部分与采用依据 |
| --- | --- |
| [02 中国国家博物馆藏台儿庄战役大刀](https://www.chnmuseum.cn/zl/gbxz/202508/t20250826_272533.shtml) · [香港历史博物馆展览图录](https://hk.history.museum/documents/Exhibitions/Current-Exhibitions/80awarofresistance/80A-Booklet.pdf#page=13) | 当前外形参考。以馆方单件照为基准，跟踪刀身的弧线、卷曲护手、裸铆接柄和椭圆尾环，保留可见的柄部固定痕迹。 |
| [03 杨云峰大刀，梁茵摄](https://xinwen.bjd.com.cn/content/s6874f2c8e4b0bd64e2e0e846.html) | 当前钢面参考。以亮银灰、深浅斑驳和细点蚀为材质依据。 |
| [01 建川博物馆供图《国军用大刀》](https://www.krzzjn.com/show-924-13393.html) · [原图](https://www.krzzjn.com/uploadfile/2015/0703/20150703101523486.jpg) | 旧版以同框最上方的布缠柄大刀为主样本。图注确认是建川博物馆供图，四把的单件年代与部队归属待核。 |

## 川军背景与来源边界

- 川军随身带大刀的记载见记者对建川博物馆藏品的报道。馆方出川影像能看到行军人员和着装，刀的完整轮廓只够用实物照片校准。[中新网](https://www.chinanews.com/cul/2014/09-03/6558063.shtml) · [四川建川博物馆](https://www.jc-museum.cn/news/1149.html)
- 网上另有蓝底红绸单刀，图注写「抗战川军所用的大刀」，该页缺收藏机构、原图来源与单件记录。图中的卷曲护手与主样本不同。[抗日战争纪念网转载](https://m.krzzjn.com/show-1182-47353.html)
- 滕县第122师使用大刀有史料记载，单件归属仍待核。当前游戏资产采用台儿庄战役馆藏大刀的可见外形。照片背面、窄面与遮挡处采用游戏用外观推定。[第122师配备记载](https://dangshi.people.com.cn/n1/2020/0924/c85037-31872956.html)

## 成品与重建

- 游戏加载 `Model/Model_Dadao.tzm.json`。使用 `python Taierzhuang1938/_import/Script_TraceDadaoMuseumPhoto.py <Reference_TaierzhuangMuseum02Profile.png>` 从配准后的馆藏照提取可见轮廓，写入 `Data_SichuanDadaoMuseumFit.json`。`Script_BuildSichuanDadao.py` 用现有游戏挂点定位外形，从旧版游戏模型借用窄侧视觉厚度。使用 `BuildAll.py -- --only Dadao` 构建，导出上限为 10,000 三角。
- 03 的钢面局部通过 OpenAI Image API 的 `gpt-image-2` 生成横向样片，参数为 `high`、2048 × 1152。`Texture_YangYunfengSteel03.webp` 用于复烘。[钢面提示词](Prompt_YangYunfengSteel03Surface.txt)
- 运行 `python Taierzhuang1938/_import/Script_BakeDadaoPbr.py <Reference_TaierzhuangMuseum02Profile.png>` 烘焙 2K 基色、1K OpenGL 法线与 1K ORM，再运行 `python Taierzhuang1938/_import/Script_BakePbrTexture.py --audit --name Dadao` 登记成品。以同一正视机位复核馆藏轮廓，以正光和移位斜光核对钢面。
- 02 与 03 的外观参考图、原始样片、`Scene_Taierzhuang02Steel03.blend` 和对照渲染都保存在素材库的 `Blender/Taierzhuang1938/SichuanDadao/Museum02Steel03`。Blender 工程保留独立部件与打包贴图。
