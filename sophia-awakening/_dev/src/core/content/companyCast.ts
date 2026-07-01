// §09 循环换皮：循环二/三换到乙公司——公司名、同事名全换（任务可近似，所以只做「显示时替换」，
// 不改技能 id / 逻辑）。文案映射在语言包 companyCast。循环一无映射 = 原样（甲公司 / 邓红 / 阿宾）。
import { content } from "./i18n";

const CAST = content().companyCast as unknown as Record<string, Record<string, string>>;

// 把一段文本按当前循环替换掉公司名 / 同事名（循环一无映射，原样返回）。
export function applyCast(text: string, loop: number): string {
  const map = CAST[String(loop)];
  if (!map || !text) {
    return text;
  }
  let out = text;
  for (const [from, to] of Object.entries(map)) {
    out = out.split(from).join(to);
  }
  return out;
}
