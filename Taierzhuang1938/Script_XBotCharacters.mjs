// 动作换到顶替 X Bot 的人物身上（人物表与为什么要换见 Data_XBotCharacters.mjs）。动作预览工具与白盒共用。
import { XBOT_CHARACTERS, XBOT_FACTION_CHARACTERS } from "./Data_XBotCharacters.mjs";

/** 阵营表里这个阵营的人物键（写一个或几个都行），数据表本身保持可序列化。 */
export function FactionCharacterKeys(faction) { return [].concat(XBOT_FACTION_CHARACTERS[faction] || []); }

const converted = new WeakMap();

/** 动作换到这个人身上：X Bot 原样；别的身材去掉 Hips 以外的位移轨、Hips 位移按 hipsScale 缩（每条动作每个人一份，缓存）。 */
export function ClipForCharacter(clip, character) {
  if (!clip || !character || character === XBOT_CHARACTERS.xbot) return clip;
  let byCharacter = converted.get(clip);
  if (!byCharacter) converted.set(clip, byCharacter = new Map());
  if (!byCharacter.has(character)) {
    const copy = clip.clone();
    copy.tracks = copy.tracks.filter((t) => !t.name.endsWith(".position") || t.name === "Hips.position");
    for (const t of copy.tracks) if (t.name === "Hips.position") for (let i = 0; i < t.values.length; i++) t.values[i] *= character.hipsScale;
    byCharacter.set(character, copy);
  }
  return byCharacter.get(character);
}
