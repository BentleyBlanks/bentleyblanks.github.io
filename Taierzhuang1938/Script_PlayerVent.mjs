// 顺子打空弹药时骂一句（2026-09-30 用户：「每次子弹/手榴弹打完了主角应该会有一定概率骂人吐槽一下，第一次打完必触发」）。
//
// 「打完」= 真没了：枪膛里最后一发打出去、身上也没有桥夹（不是每次换弹）；手榴弹 / 集束弹甩出最后一颗。
// 每一类（子弹 / 手榴弹）第一次打空必喊；之后按 PLAYER_VENT.chance 抽，两次之间至少隔 cooldownS。
// 骂的句子是顺子本人嗓子另录的一条（Data_FirstLevelVoiceCast.PLAYER_VENT_TEXT / SQUAD_BARK_EXTRA_TAKES.shunziVent），
// 走 Script_Audio.Bark 点名（key + who）：不变调；self 走主角的嗓子那一路（居中干声 + 胸腔音色，不送混响）。
//
// 晚一拍再骂（delayS）：枪声 / 出手那一下先响完。剧情对白在说、人死了（宿主的 Blocked）就等着；
// 第一次最多等 firstWaitS，之后的只等 laterWaitS —— 过了这个时间再骂就对不上画面了，不如不骂。
// 没喊成（声库没装、被闸）第一次那一类不算「骂过」，下次打空照样必喊。
import { PLAYER_VENT_KEYS } from "./Data_FirstLevelVoiceCast.mjs";

export const PLAYER_VENT = Object.freeze({
  chance: 0.4,        // 第一次以后每次打空骂的概率
  cooldownS: 20,      // 两次骂之间至少隔这么久（第一次不受限）
  delayS: Object.freeze({ ammo: 0.45, grenade: 0.6 }),
  firstWaitS: 8,      // 第一次被对白等挡住时最多等多久
  laterWaitS: 1.5,
  volume: 1,
});

export class PlayerVent {
  constructor({ audio = null, Random = Math.random, Blocked = () => false } = {}) {
    this.audio = audio;
    this.Random = Random;
    this.Blocked = Blocked;
    this.time = 0;
    this.lastAt = -Infinity;
    this.said = { ammo: false, grenade: false };
    this.lastKey = { ammo: null, grenade: null };
    this.pending = { ammo: null, grenade: null };  // 两类各排各的：同时打空（先扔最后一颗雷再打光子弹）不互相顶掉
  }

  /** 刚打空（kind: "ammo" | "grenade"）。返回这一次是否要骂（排上了）。 */
  Empty(kind) {
    if (!PLAYER_VENT_KEYS[kind]?.length) return false;
    const first = !this.said[kind];
    if (!first) {
      if (this.time - this.lastAt < PLAYER_VENT.cooldownS) return false;
      if (this.Random() >= PLAYER_VENT.chance) return false;
    }
    // 已经排着一句第一次的就不让后来的顶掉（第一次必喊）。
    if (this.pending[kind]?.first && !first) return false;
    const at = this.time + (PLAYER_VENT.delayS[kind] ?? 0.5);
    this.pending[kind] = { kind, first, at, until: at + (first ? PLAYER_VENT.firstWaitS : PLAYER_VENT.laterWaitS) };
    return true;
  }

  /** 每帧推一次。喊出来了返回那句的 key。 */
  Update(dt) {
    this.time += Math.max(0, dt || 0);
    let p = null;
    for (const kind in this.pending) {
      const q = this.pending[kind];
      if (q && this.time > q.until) this.pending[kind] = null;
      else if (q && this.time >= q.at && (!p || q.at < p.at)) p = q;
    }
    if (!p || this.Blocked()) return null;
    const keys = PLAYER_VENT_KEYS[p.kind];
    // 同一类连着两次不骂同一句。
    const choices = keys.length > 1 ? keys.filter((key) => key !== this.lastKey[p.kind]) : keys;
    const key = choices[Math.floor(this.Random() * choices.length) % choices.length];
    const voice = this.audio?.Bark?.("vent", { key, who: "shunzi", self: true, priority: true, volume: PLAYER_VENT.volume });
    if (!voice) return null;
    this.pending[p.kind] = null;
    this.said[p.kind] = true;
    this.lastKey[p.kind] = key;
    this.lastAt = this.time;
    return key;
  }
}
