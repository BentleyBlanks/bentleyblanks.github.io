// 《燎原 · 敌后1937》 —— 可选外部资产清单（纯数据，node 可导入）。
//
// 设计契约：这里列出的每一个文件都是**可选**的。文件存在 → 运行时自动加载并使用；
// 文件缺失或加载失败 → 各系统静默回退到程序化方案（合成音乐 / 程序化插画），
// 绝不报错、绝不留空。因此任何子集都可以单独投放，不需要一次配齐。
//
// 投放方式：把文件按下列**精确文件名**放进 `PrairieFire1937/Assets/` 并提交仓库。
// 命名遵守仓库资产规范：`AudioBgm_` / `AudioSfx_` / `Texture_` 前缀 + PascalCase。

export const assetBase = "./Assets/";

/** 五个时期的整轨背景音乐（建议 mp3，128-192kbps，2-4 分钟可循环）。 */
export const bgmAssets = Object.freeze({
  Opening: "AudioBgm_Opening.mp3",
  Growth: "AudioBgm_Growth.mp3",
  Hardship: "AudioBgm_Hardship.mp3",
  Recovery: "AudioBgm_Recovery.mp3",
  Counter: "AudioBgm_Counter.mp3",
});

/** 音效逐条替换（短促干声，建议 mp3/ogg，尽量 < 2 秒；名字与合成音效一一对应）。 */
export const sfxAssets = Object.freeze({
  Click: "AudioSfx_Click.mp3",
  Confirm: "AudioSfx_Confirm.mp3",
  Cancel: "AudioSfx_Cancel.mp3",
  March: "AudioSfx_March.mp3",
  Ambush: "AudioSfx_Ambush.mp3",
  Blast: "AudioSfx_Blast.mp3",
  Rail: "AudioSfx_Rail.mp3",
  Alarm: "AudioSfx_Alarm.mp3",
  Build: "AudioSfx_Build.mp3",
  Harvest: "AudioSfx_Harvest.mp3",
  Wind: "AudioSfx_Wind.mp3",
  Snow: "AudioSfx_Snow.mp3",
  Turn: "AudioSfx_Turn.mp3",
  Unlock: "AudioSfx_Unlock.mp3",
  Bad: "AudioSfx_Bad.mp3",
  Good: "AudioSfx_Good.mp3",
});

/** 事件卡插画，按 illustration.kind 匹配（建议 1280×720 左右的 jpg/webp）。 */
export const illustrationAssets = Object.freeze({
  Ridge: "Texture_EventRidge.jpg",
  Village: "Texture_EventVillage.jpg",
  Tunnel: "Texture_EventTunnel.jpg",
  Rail: "Texture_EventRail.jpg",
  Snow: "Texture_EventSnow.jpg",
  Assembly: "Texture_EventAssembly.jpg",
  Night: "Texture_EventNight.jpg",
  Harvest: "Texture_EventHarvest.jpg",
});

