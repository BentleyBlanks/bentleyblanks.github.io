import type { AssetManifest } from '../types/assets.types';

// 资产清单 —— 美术/音频回填路径。
// 本作全部美术为程序化绘制(render)、音频为 Web Audio 合成(audio)，故清单留空：
// 渲染/音频按契约自动降级到占位绘制与合成音，游戏零外部二进制资产即可完整运行。
// 若日后加入真实 PNG/MP3，只需在此处回填 artId/soundId -> 路径，渲染层会自动替换占位。
export const ASSET_MANIFEST: AssetManifest = {
  images: {},
  audio: {},
};
