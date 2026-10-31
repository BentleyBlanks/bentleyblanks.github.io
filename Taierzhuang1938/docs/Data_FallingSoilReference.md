# 落土视觉对照 · 2026-10-26

这份对照补足首版只验证“有粒子/可调参”的验收缺口。用户否决首版后，完成条件改为实际参考画面对照；功能测试不能替代形态判断。

## 实际采用的参考

- [FX Elements · Falling Debris 008](https://www.fxelements.com/products/clips/falling-debris-008)，来自 [Falling Debris Pack 1](https://www.fxelements.com/products/falling-debris-pack-1)。供应方标注为实拍，包含由上落下的砂土、碎屑、触地和堆积；008 是 120 fps 记录、23.976 fps 时间基准。本轮实际查看的是其[公开预览静帧](https://fxelements.nyc3.digitaloceanspaces.com/images/thumbnails/clips/FallingDebris-008-thumb.jpg)。仅作本地视觉对照，不把商业预览或素材放进游戏或仓库。
- [Taylor Duval · The Last of Us Part 2: Cinematic and IGC effects](https://taylor-duval.artstation.com/projects/ZG5KX8) 的作者明确列出 falling dust。该视频嵌入在本次环境未成功播放，因此仅列为 3A 制作候选来源，不将页面说明冒充已观看的视频证据。

参考的拍摄高度、镜头及照明强度未公开，不声称摄影的逐像素复刻，也不把慢放素材的播放速度当作游戏重力值。对照以下可直接观察的结构：

| 项目 | 参考中的可见结构 | 本项目验收项 |
| --- | --- | --- |
| 主体 | 密集细土形成连续下落带，局部有稀疏缝隙 | 正常全景即看得到土帘；不能只剩几个点和孤立土块 |
| 颗粒 | 细粒和短下落拖痕为主，少量粗碎屑 | 毫米级混合尺寸、短快门、漫反射，无加性发光/闪烁 |
| 细尘 | 贯穿落土的半透明细尘，边界破碎 | 向下输运的细粒尘帘，避免独立圆烟球、上升火舌 |
| 接触 | 先撞击，再有低矮的散尘和地面残留 | 触面前无二次尘；触面后向侧方扩散，表面留下有预算的细土 |
| 粗块 | 对密集细粒作尺度陪衬 | 较少、较小的不规则实体，不让巨大多面体占主导 |
| 来源 | 从画面上方明确落下 | 在编辑器带土层洞顶/真实板缝处发出，保留米制高度与位置 |

## 首版问题与修改

首版细砂数量和尺寸层级读成稀疏亮点，土块过大；背景中没有足够的细土质量感。还有一个独立的实际错误：复用 `FireSmoke` 的子层继承 `prewarm:true`，播放时子时钟预进 4 秒，导致寿命约 2 秒的显式尘粒出生后便过期。此前父模拟里的“存活尘粒数”并不证明 GPU 尘层可见。

本轮将所有显式子层统一为零预热的同一时钟，独立检查下落尘与触地尘的实际像素。细粒改为密集、非发光的短运动拖痕；细尘以向下平流的连续尘帘表现，贴地尘用柔和的土尘体积密度场。烟火继续使用原烟团密度场。土块缩小、增加尺寸/明暗层级；细土可在采样接触面有限留存。来源参照改成有厚度的土层与板缝，复用项目地面/木料材质。

所有新行为与美术项仍在 `Data_Tuning_FallingSoil`，由同一字段表进入界面和 JSON。原三层开关、三情境预设 ID、固定种子、世界坐标、宿主地形/射线、暂停/回放、资源和画质预算保留。

## 不同程度的续调

用户要求继续接近现实、补足多种漏土与灰的程度。续调保留原三种 ID，新增轻微漏灰、少量细土、明显落灰和较重崩落，共七档；参数页顶部可直接切换，每档说明用途。详见[预设表](Data_FallingSoil.md#七种预设)。

本轮定位到尘帘中心噪声有非零密度下限，叠加后变成固定竖带。新包络允许穿透空隙，细节沿下行方向拉开；各漏点按种子独立起伏，整源也有疏密变化。尺寸采样偏向小颗粒，较小粒受更多阻力，粗粒下落较快。首碰缓存把阻力、受力和寿命纳入轨迹分类，防止同起点的粗细粒误用不同阻挡面。

轻漏灰与明显落灰使用低重力、高阻力的薄体积尘云，不沿用混砂流的纤维尘帘。细土档不混入实体土块；中重档才加入有限翻滚/碎裂和较明显的接触残留。细粒接触起尘量减少，避免二次尘挤满预算、把轻重档都糊成同一团。所有参数为依据可见结构的艺术近似，未作土质和流量实测标定。

续调的本地验收检查各档的起落、峰值、触地与尾段；重档另录制正式渲染器的无声八秒视频。七档浏览器检查覆盖实际尘像素、原生程度选择、逐档 JSON 恢复、暂停/回放、碰撞与资源释放。参考仍是上述实拍静帧；不把本轮录制的游戏视频宣称为新增的真实录像参考。

## 复查方式

在任务 worktree 的本地预览上：

```powershell
node scripts/Script_LocalPreview.mjs 8116 --no-open
node Taierzhuang1938/Script_FallingSoilReferenceShots.mjs --base=http://127.0.0.1:8116 --label=Review --effects=SoilCeilingShake --times=.35,.75,1.2,1.8,3.2 --views=all,grains,dust
node Taierzhuang1938/Script_FallingSoilReferenceShots.mjs --base=http://127.0.0.1:8116 --label=Context --effects=SoilCeilingShake --times=1.2 --context=1 --record=8
node Taierzhuang1938/Script_FallingSoilReferenceShots.mjs --base=http://127.0.0.1:8116 --label=Degrees --effects=SoilDustSift,SoilFineTrickle,SoilDustFall,SoilPlankLeak,SoilCeilingShake,SoilHeavyCrumble,SoilBrokenEdge --times=.6,1.8,4.2
```

脚本始终驱动正式特效编辑器、材质和后处理。观察原视口为 1440×900，不靠改变响应式布局或渲染分辨率缩图。形态对照固定同一米制相机：距 5 m、目标高 1.52 m、偏航 π+0.15、俯仰 0.04；对照帧隐藏来源参照/中途横木，只看落土与地面。`context=1` 则保留正常编辑器来源参照和观察镜头。原图、长边不超过 640 的观察图、视频和报告仅在 `_shots/FallingSoilReference/`，不提交。

`FallingSoilBrowserTest` 检查独立尘层像素、真实子层时钟、触前/触后起尘、留存细土、正常画质，以及原有参数/播放/隔离/释放契约。图像对照仍需实际查看，像素数量不能独自证明达到参考。

现有物理边界仍需明确：细砂用有限采样预测首碰，粗块不互碰且碎裂最多一代；留存细土是有上限的表面颗粒，不是持续增长的砂堆连续介质求解。
