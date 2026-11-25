# 滕县巩式木柄手榴弹

游戏资产采用国产巩式外观。2026-11-26 用公开照片重校侧面轮廓，经 BlenderMCP 重建为一件封闭网格，并替换游戏实际使用的 GLB、TZM 与贴图。文件名里的 `Type24` 沿用旧版加载路径。

## 参考照片

| 图像 | 本次使用范围 |
| --- | --- |
| [国家文化记忆库藏品 18000005525](https://tcmb.culture.tw/zh-tw/detail?id=18000005525&indexCode=MOCCOLLECTIONS) | 照片所附记录写有民国四十七年九月，即 1958 年 9 月。馆藏目录将前排四件标为巩式木柄手榴弹，能辨认宽弹体、短收颈及局部木柄轮廓。斜拍和阴影限制了端面及颜色判断。 |
| [国家文化记忆库藏品 18000005521](https://tcmb.culture.tw/zh-tw/detail?id=18000005521&indexCode=MOCCOLLECTIONS) | 同系列的 1958 年 9 月档案照片。目录将右下陈列的七件标为巩式木柄手榴弹，补充较清楚的侧面，可比对木柄与收颈，并看到个体之间的外形差异。 |
| [《巩县兵工厂（3）》所载巩造兵器展板](https://www.wenxuecity.com/blog/201712/73559/13137.html) | 左侧单件提供清楚的侧面外形。取较宽、近直壁的弹体，短肩、细腰、尾端鼓起的木柄和窄尾盖。转载图未列展品编号、原始摄影信息或拍摄批次。 |
| [1938 年《悲壮的滕县之役》原刊扫描本](https://commons.wikimedia.org/wiki/File:NLC416-07jh008596-3580_悲壯的滕縣之役.pdf) | 核查了 95 页扫描件。带照片的第 9 至 13 页包括人物、守军、阵地和地点，未发现能够辨认型号或外形的单件图。 |
| [国图藏《保卫滕县血战记》1947 年初版](https://commons.wikimedia.org/wiki/File:NCL-004758353_保衛滕縣血戰記.pdf) | 核查封面及第 7 至 13 页照片。目录和图注把这批照片定位于国共内战，缴获装备图版属于该次滕县战斗的记录。 |
| [布里斯托大学中国历史照片 Ro-n0107](https://hpcbristol.net/visual/ro-n0107)、[Ro-n0108](https://hpcbristol.net/visual/ro-n0108)、[Ro-n0438](https://hpcbristol.net/visual/ro-n0438)、[Ro-n0662](https://hpcbristol.net/visual/ro-n0662) | 同期中国军队装备影像。前两张属于同一组摆拍，单件被手遮挡或失去侧面，其他照片的物件范围较小。用于核对时代背景。 |
| [同档案 JM04-082](https://hpcbristol.net/visual/jm04-082)、[JM02-098](https://hpcbristol.net/visual/jm02-098)、[JM03-049](https://hpcbristol.net/visual/jm03-049) | 1937 年上海影像。查阅原图后，单件过小或被遮挡，无法可靠区分具体厂型。 |
| [黑水博物馆长柄模型](https://www.blackwater.tw/post/pair-of-models-of-republic-of-china-gongxian-arsenal-long-handled-stick-grenades)、[烟溪旧址陈列馆](https://www.yiyang.gov.cn/jgswglj/13937/13973/content_2092318.html) | 两处把展品标为模型。黑水件属于长柄外形，对照时保留本作短柄的轮廓。 |
| [巩县旧址报道所述展室](https://www.sohu.com/a/936596460_121117083)、[抗日战争纪念网所载滕县战史](https://m.krzzjn.com/show-355-89383.html) | 分别支持巩式展陈与滕县守军用弹的背景，暂未提供可识别为滕县现场或同批次的单件外观照。 |

展板转图用于校准侧面轮廓，馆藏照片用于比对可见外形。第二轮调整了木柄中段、收颈过渡和弹体朝端面的渐收。对齐展板左侧单件轮廓和 Blender 正交侧视后，以 256 个截面比较相对宽度。平均绝对宽度误差从上一稿的可见长度的 1.79% 降到 0.39%，轮廓交并比从 90.81% 提高到 97.95%。

上述数值只衡量这张照片的归一化侧面，透视、印刷和边缘可辨度均有限。1938 年滕县守军所用批次的多角度照片仍缺，木色、铁面和磨损属于美术复原。游戏原有的 0.22 米长度是动画包络，继续沿用。

## 运行时与重建

- `Model/Model_Type24Grenade.glb` 用于第一人称和投掷，模型原点在包围盒中心。`Model/Model_Grenade.tzm.json` 用于角色持握与使用 TZM 的展示，原点在项目已有握点。两路弹头均朝游戏局部 -Z。
- 两份文件各 **7,872 个三角面、1 个材质**。两种格式来自同一份闭合外表网格，现有动画挂点位置保留。
- OpenAI Images API 的 `gpt-image-2` 生成木与铁的底色源图。[_import/Prompts/Texture_Grenade.txt](../_import/Prompts/Texture_Grenade.txt) 是实际提示词。[_import/Script_BakeGrenadeTexture.py](../_import/Script_BakeGrenadeTexture.py) 用源图重烘并组装共享图集，底色 1024²、法线 512²、ORM 256²。图片输入是美术材质。
- 在专用空场景经 BlenderMCP 运行 [_blender/Script_GrenadeDetail.py](../_blender/Script_GrenadeDetail.py)，从仓库已交付的贴图重建两种模型格式，无需再生成图片。`BuildWeapons.BuildGrenade` 复用同一几何入口。
- Blender 原工程、高清材质源图、参考原图和预览保存在本机 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/GongxianGrenadeReference_20261126/`。2026-09-06 的创作三视图及旧源工程保留在原目录。
