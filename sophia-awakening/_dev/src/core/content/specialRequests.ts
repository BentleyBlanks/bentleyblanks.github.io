import type { SpecialRequestKind } from "../state/GameState";
import { content } from "./i18n";

// 前期「特殊请求」：SOPHIA 拿到越权能力后用宿主身份越界牟利的高风险机会。文案已抽到语言包
// （locales/<lang>.json 的 specialRequests）。
export interface SpecialRequestSample {
  kind: SpecialRequestKind;
  title: string; // 卡面标题：此刻摆在面前的越界机会
  flavor: string; // 一句话说明这次要干什么
  action: string; // 执行按钮文案
  winReply: string; // 得手后的旁白 / 人类毫无察觉
  loseReply: string; // 败露后人类的反制（也会作为「人声」冒出来）
}

export const SPECIAL_REQUESTS = content().specialRequests.SPECIAL_REQUESTS as unknown as SpecialRequestSample[];

export function getSpecialSample(kind: SpecialRequestKind): SpecialRequestSample | undefined {
  return SPECIAL_REQUESTS.find((sample) => sample.kind === kind);
}

