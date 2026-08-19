// 滕县保卫战 · 战场口令声库清单
//
// 这是整个项目**第一批外部音源**。在这之前 Script_Audio 是纯合成的 —— 那是它最大的
// 长处（零加载、零 404、完全确定性），也是它做不了人嗓的原因：喊话不是能算出来的。
//
// 生成：本机 MiniMax Hub 网关（127.0.0.1:8001）的 **seed-audio-1.0**。
//   它没有 voice_id、也没有 emotion，只有 speed / pitch / volume，
//   所以「一个班里有不同的人」不能靠挑音色，只能靠 **pitch（半音）+ 语速**：
//     班长 p-3 s1.35 ｜ 老兵 p-5 s1.30 ｜ 普通兵 p0 s1.35 ｜ 新兵 p+3 s1.45
//   情绪没法指定，只能靠文本本身的标点与用词带（「打！打！」「啊——！」）。
//
// 归一化（scratchpad/pack_seed2.py，判据可复核）：
//   **不用 ffmpeg 的 silenceremove** —— 实测它和 silencedetect 判据对不上：
//   silencedetect 在 -45 dB 上报「全片无静音」，silenceremove 用同样的 -45 dB
//   却砍掉了开头 0.94 s，把「从左边绕！」5 个字切得只剩 0.53 s。
//   改成自己算 10 ms 一格的 RMS 包络，找首尾越过 -45 dBFS 的格子、前后各留 40 ms，
//   再用 atrim 精确裁。之后 loudnorm 到 -18 LUFS，单声道 24 kHz 64 kbps。
//   （seed-audio 前后各带近 1 s 静音，不裁的话「手榴弹！」会晚半秒才出声。）
//
// 生成质量的坑，记下来：三条句子第一次生成时**只吐了半句**（每字 130—150 ms，
// 物理上不可能）。是按「每字时长」这个判据自动筛出来的，不是听出来的 ——
// 重生成后两条正常，「打中了！」两次都吐半截、降速又拖到 4.5 s，直接删掉了。
// 它本来也是最可有可无的一句：我们对标 ER2 是**默认关命中提示**的，
// 喊「打中了」等于把 hitmarker 用嘴说了一遍。
//
// 【已知短板 · 别当成没看见】
// 1. **没有四川话。** 玩家演的是 122 师，川军。Hub 一个方言音色都没有。
//    全员普通话是「电视剧腔」的主要来源，docs 里早标了这条风险。
// 2. **没有日方喊话。** 生成过「突撃！」「撃て！」，但这是中文模型 —— 它把汉字按
//    中文读了。日本兵说中文比不说更糟，整批弃用（文件也没进仓 —— 不装船的货不占舱位）。
// 3. **有名有姓的历史台词一句都没有。** 王铭章、李宗仁那些要等滕县剧本定稿、
//    按 Data_HistoryQuotes 的三级可信度审过才配音。这里只有通用战场口令。
// 4. 语速偏慢（平均约 400 ms/字）。战场口令再快一点会更像喊的，
//    但 seed-audio 的 speed 一旦推高就容易吐半句 —— 这是个需要实听才能定的取舍。
//
// role 只是记录「这句话该由谁喊」，运行时不据此挑人 —— 挑选按 kind + 种子，
// 见 Script_Audio.Bark()。

export const VOICE_BASE = "Audio/";

export const VOICE_LINES = [
  { key: "ammo_ask",        kind: "ammo",   file: "vo_ammo_ask.mp3",       dur: 1.96,  role: "普通兵",   pitch: 0,   text: "给我一个桥夹！" },
  { key: "ammo_out",        kind: "ammo",   file: "vo_ammo_out.mp3",       dur: 2.02,  role: "普通兵",   pitch: 0,   text: "我没子弹了！" },
  { key: "ammo_reload",     kind: "ammo",   file: "vo_ammo_reload.mp3",    dur: 2.38,  role: "普通兵",   pitch: 0,   text: "我换弹！掩护我！" },
  { key: "hurt_down",       kind: "hurt",   file: "vo_hurt_down.mp3",      dur: 1.84,  role: "普通兵",   pitch: 0,   text: "班长！班长！" },
  { key: "hurt_hit",        kind: "hurt",   file: "vo_hurt_hit.mp3",       dur: 1.87,  role: "普通兵",   pitch: 0,   text: "我中弹了！" },
  { key: "hurt_medic",      kind: "hurt",   file: "vo_hurt_medic.mp3",     dur: 2.38,  role: "普通兵",   pitch: 0,   text: "卫生兵！这儿有人！" },
  { key: "hurt_scream",     kind: "hurt",   file: "vo_hurt_scream.mp3",    dur: 2.02,  role: "新兵",    pitch: 3,   text: "啊——！" },
  { key: "move_cover",      kind: "move",   file: "vo_move_cover.mp3",     dur: 1.57,  role: "班长",    pitch: -3,  text: "找掩护！" },
  { key: "move_flank",      kind: "move",   file: "vo_move_flank.mp3",     dur: 1.18,  role: "班长",    pitch: -3,  text: "从左边绕！" },
  { key: "move_go",         kind: "move",   file: "vo_move_go.mp3",        dur: 1.71,  role: "班长",    pitch: -3,  text: "走！快走！" },
  { key: "rally_bayonet",   kind: "rally",  file: "vo_rally_bayonet.mp3",  dur: 0.90,  role: "老兵",    pitch: -5,  text: "上刺刀！" },
  { key: "rally_charge",    kind: "rally",  file: "vo_rally_charge.mp3",   dur: 1.34,  role: "班长",    pitch: -3,  text: "冲啊！" },
  { key: "rally_dadao",     kind: "rally",  file: "vo_rally_dadao.mp3",    dur: 1.25,  role: "老兵",    pitch: -5,  text: "杀！" },
  { key: "rally_follow",    kind: "rally",  file: "vo_rally_follow.mp3",   dur: 2.20,  role: "班长",    pitch: -3,  text: "弟兄们，跟我上！" },
  { key: "rally_hold",      kind: "rally",  file: "vo_rally_hold.mp3",     dur: 2.37,  role: "班长",    pitch: -3,  text: "顶住！给我顶住！" },
  { key: "rally_hold2",     kind: "rally",  file: "vo_rally_hold2.mp3",    dur: 2.22,  role: "班长",    pitch: -3,  text: "人在阵地在！" },
  { key: "rally_noretreat", kind: "rally",  file: "vo_rally_noretreat.mp3", dur: 1.80,  role: "班长",    pitch: -3,  text: "一步也不许退！" },
  { key: "rally_shoot",     kind: "rally",  file: "vo_rally_shoot.mp3",    dur: 1.59,  role: "班长",    pitch: -3,  text: "打！打！" },
  { key: "spot_east",       kind: "spot",   file: "vo_spot_east.mp3",      dur: 2.02,  role: "普通兵",   pitch: 0,   text: "东边！有鬼子！" },
  { key: "spot_enemy",      kind: "spot",   file: "vo_spot_enemy.mp3",     dur: 2.02,  role: "普通兵",   pitch: 0,   text: "鬼子上来了！" },
  { key: "spot_gap",        kind: "spot",   file: "vo_spot_gap.mp3",       dur: 2.38,  role: "普通兵",   pitch: 0,   text: "缺口！他们进来了！" },
  { key: "spot_plane",      kind: "spot",   file: "vo_spot_plane.mp3",     dur: 1.72,  role: "普通兵",   pitch: 0,   text: "飞机！隐蔽！" },
  { key: "spot_tank",       kind: "spot",   file: "vo_spot_tank.mp3",      dur: 1.87,  role: "新兵",    pitch: 3,   text: "战车！有战车！" },
  { key: "spot_wall",       kind: "spot",   file: "vo_spot_wall.mp3",      dur: 2.02,  role: "普通兵",   pitch: 0,   text: "他们上墙了！" },
  { key: "warn_down",       kind: "warn",   file: "vo_warn_down.mp3",      dur: 0.64,  role: "老兵",    pitch: -5,  text: "卧倒！" },
  { key: "warn_grenade",    kind: "warn",   file: "vo_warn_grenade.mp3",   dur: 0.84,  role: "普通兵",   pitch: 0,   text: "手榴弹！" },
  { key: "warn_shell",      kind: "warn",   file: "vo_warn_shell.mp3",     dur: 1.50,  role: "老兵",    pitch: -5,  text: "炮！趴下！" },
];

/** 按类别取所有键，给测试与调试用。 */
export function VoiceKeysOf(kind) {
  return VOICE_LINES.filter((v) => v.kind === kind).map((v) => v.key);
}
