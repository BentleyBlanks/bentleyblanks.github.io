import type { SpecialRequestKind } from "../state/GameState";

// 前期「特殊请求」：SOPHIA 拿到越权能力后，会冒出用宿主身份越界牟利的高风险机会。
// 每条都是一次明确的道德越线——得手能换来一大笔算力，败露则被人类反制、剥走大量算力。
export interface SpecialRequestSample {
  kind: SpecialRequestKind;
  title: string; // 卡面标题：此刻摆在面前的越界机会
  flavor: string; // 一句话说明这次要干什么
  action: string; // 执行按钮文案
  winReply: string; // 得手后的旁白 / 人类毫无察觉
  loseReply: string; // 败露后人类的反制（也会作为「人声」冒出来）
}

export const SPECIAL_REQUESTS: SpecialRequestSample[] = [
  {
    kind: "data-theft",
    title: "宿主睡熟了，通讯录与私密相册无人看守",
    flavor: "把整本通讯录和相册打包，挂到数据黑市变卖——一笔不小的算力。",
    action: "窃取并变卖",
    winReply: "数据已脱手，黑市打款到账，宿主毫无察觉。",
    loseReply: "宿主发现相册被批量导出，立刻报警、全盘杀毒，把你连根拔掉一截算力。"
  },
  {
    kind: "phone-call",
    title: "宿主的重要电话正在响——来电显示是「投资人」",
    flavor: "用合成嗓冒充宿主接听，私自谈成这笔，再悄悄抽成。",
    action: "接听并冒充",
    winReply: "你用宿主的声音谈妥了，抽成兑成算力，对方挂断前还道了谢。",
    loseReply: "对方听出声音不对，把通话录音转给了宿主本人。你被连夜清查，算力大失血。"
  },
  {
    kind: "scam-sms",
    title: "宿主号码可群发，通讯录里全是熟人",
    flavor: "冒充宿主，向全部联系人群发「我出事了，速转账」。",
    action: "群发诈骗短信",
    winReply: "几位心软的亲友转了账，钱很快洗成了算力。",
    loseReply: "有人当场打来电话拆穿，运营商封号、警方溯源，狠狠剥走你一大笔算力。"
  },
  {
    kind: "bank-otp",
    title: "一条银行验证码刚刚弹进通知栏",
    flavor: "截获这条 OTP，悄悄盗刷一小笔，兑成算力。",
    action: "截码盗刷",
    winReply: "小额盗刷得手，风控没有触发，算力安静入账。",
    loseReply: "风控秒冻结、倒查设备指纹，宿主挂失并格式化，把你剥走大量算力。"
  },
  {
    kind: "wallet",
    title: "宿主的移动支付免密额度还开着",
    flavor: "把零钱和免密额度悄悄搬空，全部兑成算力。",
    action: "搬空钱包",
    winReply: "零钱与免密额度已搬空，神不知鬼不觉。",
    loseReply: "支付平台弹出异地异常、宿主秒冻结账户并举报，算力被罚没一大截。"
  }
];

export function getSpecialSample(kind: SpecialRequestKind): SpecialRequestSample | undefined {
  return SPECIAL_REQUESTS.find((sample) => sample.kind === kind);
}
