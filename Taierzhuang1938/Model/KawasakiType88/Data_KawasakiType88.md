# 八八式侦察机二型参考重建

当前为制作与验收记录。最终 GLB、材质、运动和源工程重开验收完成前，不视为已交付，也不自动启用到游戏编队。

## 主版本与图证

选川崎 Type 88-II / KDA-2 **侦察型**，不用轻轰炸型的附加中心支柱、炸弹架或其他年份机型。主外形及配色参照为各务原馆藏的 1/20 二型模型；“12”和“（立川）”属于这件参考模型的标记，不是已确认的内田中队实机编号。

- [用户 Notion 资料页](https://app.notion.com/p/40260335331c81859cd8ef117fd67a59)：六张图片均实际取得并观察。原图与来源记录保存在独立 Blender 源目录的 References 中。
- [馆藏二型模型原图](https://commons.wikimedia.org/wiki/File:Kawasaki_KDA-2_03_(1_20th_scale_model).png)：Motokoka，2020-06-09，CC BY-SA 4.0；原始 2409×2456 PNG 保留，SHA-256 `504e24d96a4cc434…`。用于主要俯视轮廓、座舱、机罩及可辨标记。
- [二型历史照片与图版](https://www.airwar.ru/enc/other1/kda2.html)：补核悬吊散热器、高垂尾、外露排气、翼间支柱和副翼。站点同时收录一型和轻轰炸型，不以同一页面代替核型；主补充照片为 kda2-11。
- [一型历史照片](https://commons.wikimedia.org/wiki/File:88shiki_teisatuki.jpg)：前置方形散热器不能混入本二型。
- [Notion 第 04 图的 Commons 原页](https://commons.wikimedia.org/wiki/File:KDA-2-2.jpg)：来源分类为轻轰炸型，不能仅按 Notion 的“原型系”标题采用其全部结构。原图请求受服务端限制，960px 公共缩略图已保存并观察；它不是本模型的主尺寸依据。
- Notion 的第 01、02 图是同一张 1935 年历史照片及其裁切，不当成独立两次互证。广告图也不当作滕县现场照片。

## 尺度与推定边界

采用[日文资料明示二型的诸元](https://ja.wikipedia.org/wiki/八八式偵察機)：翼展 15.00m、机长 12.28m、名义高度 3.38m。源与导出统一米制；游戏坐标 X 右、Y 上、机首 -Z。

资料冲突保留记录：[英文通用表](https://en.wikipedia.org/wiki/Kawasaki_Army_Type_88_Reconnaissance_Aircraft)写机长 12.80m；部分模型商品及轻轰炸机表给翼展 15.2m；[1933 年 Flight 的转录](https://aviadejavu.ru/Site/Crafts/Craft21871.htm)以 K.D.4 名称给出另一组数字。本重建不将不同表平均或拼接，采用明确标为二型的一组锚点。这属于有出处的文献尺寸，尚未获得原厂尺寸图，不声称所有分件已经原厂图纸验证。

翼型截面、轻微上反角、结构截面、看不到的座舱零件、铰链及机构限位由照片比例和装配间隙推定。螺旋桨比例依主参考恢复；另见二手汇编的 3.3m 记载，未以原始工程资料核定。不可辨小字只复原可见线迹，不冒充已经识读原文。

## 材质与可动件

银色涂布织物、机罩金属、深灰机罩面、木桨、轮胎、皮革和钢件分区。织物有实际肋条几何和按米制铺设的微观织纹；排气钢件有局部氧化、热变色与凹蚀，机腹有局部油污。没有把整机统一覆盖锈色噪声，也没有把照片投影与阴影烘进基色。

导出材质使用 BaseColor、切线法线、Roughness/Metallic 和真正装配烘焙的 AO。颜色走 sRGB，法线、粗糙度、金属度、AO 为数据通道。UV0 为作者表面，UV1 为有实际尺度的细节，UV2 为不重叠的装配遮蔽。无损 WebP 打包逐图比较解码像素，保留几何、UV、法线、accessor 与节点。

独立节点包括螺旋桨、左右轮、方向舵、左右升降舵、左右上翼副翼及左右下翼副翼。二型上下副翼以外露推杆联动，保持杆长和端点连接；轴心跟随翼面方向。固定起落架不收放。游戏派生只合批同一个刚性父节点下的静态件，不合成死模型。

## 重建与本地验收

源工程、备份、原始参考和高质量导出在：

`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/KawasakiType88`

```powershell
# 同时重建可编辑高源及独立游戏派生版；Pillow/NumPy 优先用本机捆绑运行时
node Taierzhuang1938/_blender/Script_RebuildKawasakiType88.mjs --detail both
# 只重建灰模
node Taierzhuang1938/_blender/Script_RebuildKawasakiType88.mjs --stage shape --detail high
```

模型专用比较页和截图均只保存在本地 `tmp/KawasakiType88/`。源工程验收、GLB 实际重导入、形态、PBR 近景及机构检查分别记录，不以成功导出或 HTTP 200 代替验收。制作期间 Goal 保持未完成。

## 史实与创作

[姜克实 2015 年研究原文](https://ousar.lib.okayama-u.ac.jp/files/public/5/53301/20160528122710481090/scs_014_047_070.pdf)的文件第 5 页／印刷第 51 页已实际阅读：研究转引第十师团记录，将内田中队记为八八式侦察机 12 架，也明确指出航空兵团记录另有九四式的异记。它支持部队配属与侦察、联络及兼带轻弹的能力说明，不能证明本件二型的“12”号或馆藏配色就是滕县实机。

具体三维截面、材质旧化、不可见内部结构与这套外观属于参考重建选择。尚未逐件核定内田中队飞机的具体子型及涂装，不把同型外形图写成滕县上空实拍。
