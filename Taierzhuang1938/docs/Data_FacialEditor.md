# 人物面部可视化编辑器

入口：齿轮或反引号键打开工具目录 → **人物面部**。也可在第一关中打开，或调用 `window.Tengxian.Debug.OpenEditor('facial')`。复用正式摄影棚、角色工厂和后处理，退出归还相机、世界可见性及合批状态。

## 检查方法

1. 选角色，再选配套对白。名单由 `MISSION_VOICE_CAST` 和 `MISSION_DIALOGUE` 生成。
2. 选择整段或单句，播放、暂停、0.25/0.5 倍速、循环；时间轴支持拖动及前后 1/60 秒。金色区间是所选角色发言，字幕仍显示录音中实际说话的人。
3. 正面、两侧 45°、嘴部特写，或拖动旋转、滚轮缩放。中性表情对照能直接比较变形。
4. 调整口型幅度、展唇、圆唇、抬眉、闭眼后，点击「记录当前关键帧」。关键帧之间线性过渡，首尾保持；「恢复自动表情」清除当前角色当前对白的关键帧。
5. 记录问题，保存本地草稿；导出 JSON 可交给后续修改任务。导入必须匹配角色、cue 和录音 SHA-256。草稿不改变正式游戏表演。尚未记录成关键帧的滑杆试调不写入草稿。

## 资产状态

当前只有罗班长的 NRA05 拥有已交付的 11 根面部骨骼。具名同伴读取正式选模表，其他角色显示明确标注的「检查替身」，可从获准模型里选择；不把检查替身当成已确认的角色绑定。无面部骨骼时关闭表情控件，仍可检查该角色的录音、字幕与时间段。本工具没有批量生成其他角色的面部绑定或动画。

自动口型沿用 `Script_SpeechEnvelope` 与 `Script_CharacterFacialAnimation`，是声学节奏驱动，不是音素识别。整段多人录音仍是一条原始 MP3；不拆音频。先核对 MP3 内容 SHA-256 与对齐表，再按真实 AudioContext 源时间采样；其他角色说话或说话人区间外立即闭嘴。定格保留采样帧，便于检查；与游戏暂停立即闭嘴的行为有所不同。

## 实现与验证

- `Script_EditorFacial.mjs`：界面、独立音频预览、真实角色近景、草稿管理；异步换台词和关闭通过请求序号与 AbortController 隔离。
- `Script_FacialReview.mjs`：固定 60 Hz 包络平滑、说话人区间、关键帧采样及导入校验；无 Three 依赖。
- localStorage：`tengxian1938_facial_review_v1`，按角色与 cue 隔离，版本不匹配拒绝应用。
- `Script_FacialReviewTest.mjs`：静音、说话人隔离、插值和错误输入。
- `Script_FacialEditorBrowserTest.mjs`：真实录音与骨骼、暂停/逐帧、中性对照、保存重开、未绑定角色；截图及结果仅在本地 `_shots/FacialEditor/`。

```powershell
node scripts/Script_LocalPreview.mjs 8099 --no-open
node Taierzhuang1938/Script_FacialReviewTest.mjs
node Taierzhuang1938/Script_FacialEditorBrowserTest.mjs --port=8099
```
