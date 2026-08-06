// 声音混音契约：总线基准保证已有设置也会变安静；默认值只影响第一次打开的玩家。
export const AUDIO_BUS_BASE = Object.freeze({ music: 0.55, amb: 0.72, sfx: 0.68, voice: 1 });
export const AUDIO_DEFAULT_LEVELS = Object.freeze({ voice: 100, sfx: 80, music: 70 });
