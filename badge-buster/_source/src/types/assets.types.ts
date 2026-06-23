// assets.types.ts —— 资产清单契约（美术/音频回填，渲染/UI/音频引用）
export interface AssetManifest {
  images: Record<string, string>; // artId  -> "/assets/art/xxx.png"
  audio: Record<string, string>;  // soundId -> "/assets/audio/xxx.mp3"
}
