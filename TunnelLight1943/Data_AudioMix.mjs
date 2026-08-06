// 声音混音契约：总线基准保证已有设置也会变安静；默认值只影响第一次打开的玩家。
//
// amb（风声那条底噪）压到 0.34：它从头响到尾，一吵就把整章都盖住了。
// 环境声跟着「音效」那根滑杆走，所以只能从基准上压——压滑杆会把刚做的
// 动作音一起带下去。music 一并收一档：BGM 是底色，不该压住旁白。
export const AUDIO_BUS_BASE = Object.freeze({ music: 0.42, amb: 0.34, sfx: 0.68, voice: 1 });
export const AUDIO_DEFAULT_LEVELS = Object.freeze({ voice: 100, sfx: 80, music: 60 });
