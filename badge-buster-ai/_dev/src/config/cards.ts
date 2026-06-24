import { COLORS } from './theme';
import type { Tier, TierDef, SlotKind } from '../types';

// Card tier definitions (§3 算力/消化时间/归属槽 + §6.3 脆度系数).
export const TIERS: Record<Tier, TierDef> = {
  invalid: { tier: 'invalid', label: '无效', base: 1, digest: 0.5, correctSlot: 'invalid', fragility: 0.5, color: COLORS.invalid },
  normal: { tier: 'normal', label: '普通', base: 5, digest: 2, correctSlot: 'valid', fragility: 0.8, color: COLORS.normal },
  high: { tier: 'high', label: '高价值', base: 25, digest: 5, correctSlot: 'valid', fragility: 1.2, color: COLORS.high },
  risk: { tier: 'risk', label: '高危', base: 100, digest: 10, correctSlot: 'risk', fragility: 1.5, color: COLORS.risk },
  polluted: { tier: 'polluted', label: '污染', base: 0, digest: 3, correctSlot: 'quarantine', fragility: 1.5, color: COLORS.polluted },
};

export const SLOT_LABEL: Record<SlotKind, string> = {
  valid: '有效',
  invalid: '无效',
  risk: '高危',
  quarantine: '隔离',
};

// The 8 apps on the phone (§2.5.2). coef = App系数 (§3); weights bias the
// tier roll when a badge from this app bursts.
export interface AppDef {
  id: string;
  name: string;
  emoji: string;
  coef: number;
  weights: Record<Tier, number>;
}

export const APPS: AppDef[] = [
  { id: 'chat', name: '聊天', emoji: '💬', coef: 1.0, weights: { invalid: 5, normal: 4, high: 1, risk: 1, polluted: 1 } },
  { id: 'mail', name: '邮箱', emoji: '📧', coef: 1.2, weights: { invalid: 3, normal: 4, high: 2, risk: 1, polluted: 1 } },
  { id: 'shop', name: '购物', emoji: '🛒', coef: 1.1, weights: { invalid: 4, normal: 3, high: 2, risk: 0, polluted: 2 } },
  { id: 'cal', name: '日历', emoji: '📅', coef: 1.0, weights: { invalid: 2, normal: 5, high: 2, risk: 1, polluted: 0 } },
  { id: 'sys', name: '系统', emoji: '⚙️', coef: 1.4, weights: { invalid: 2, normal: 2, high: 1, risk: 3, polluted: 1 } },
  { id: 'news', name: '新闻', emoji: '📰', coef: 1.0, weights: { invalid: 5, normal: 3, high: 1, risk: 0, polluted: 2 } },
  { id: 'bank', name: '银行', emoji: '🏦', coef: 1.5, weights: { invalid: 1, normal: 2, high: 2, risk: 4, polluted: 1 } },
  { id: 'food', name: '外卖', emoji: '🍔', coef: 1.1, weights: { invalid: 4, normal: 4, high: 2, risk: 0, polluted: 1 } },
];

// Card face text pools, keyed by tier. glitchText is the hallucinated reading
// shown when the card becomes a 故障卡 (§6.5).
interface CardCopy { text: string; glitch: string; }
export const COPY: Record<Tier, CardCopy[]> = {
  invalid: [
    { text: '收到👌', glitch: '收######到' },
    { text: '[捂脸][捂脸]', glitch: '�?�?乱码' },
    { text: '在吗在吗在吗', glitch: '在▓吗▓在▓' },
    { text: '过期促销·已结束', glitch: '￥0 神券到账！' },
  ],
  normal: [
    { text: '同事：周报记得交', glitch: '同事：周报不用交了' },
    { text: '群公告：明天例会', glitch: '群公告：放假通知' },
    { text: '会员积分 +20', glitch: '会员积分 −2000' },
    { text: '协作文档有新评论', glitch: '协作文档已被删除' },
  ],
  high: [
    { text: '客户反馈：需求确认', glitch: '客户反馈：取消合作' },
    { text: '真价保·退差价 ¥58', glitch: '价保到账 ¥5800（伪）' },
    { text: '合同 V3 待你确认', glitch: '合同 V3 已自动签署' },
    { text: '面试官：通过初筛', glitch: '面试官：已淘汰' },
  ],
  risk: [
    { text: '老板@你：3点前发排期', glitch: '老板：放假了不用发' },
    { text: '银行：扣款 ¥200', glitch: '银行：扣款 ¥2000' },
    { text: '安全警告：异地登录', glitch: '安全：账号一切正常' },
    { text: '财务：报销待审批', glitch: '财务：报销已驳回' },
  ],
  polluted: [
    { text: '【中奖】点击领取', glitch: '【中奖】点击领取💥' },
    { text: '快递异常·点此理赔', glitch: '快递异常·盗号链接' },
    { text: '内部消息·稳赚不赔', glitch: '钓鱼·稳赚不赔💀' },
    { text: '官方退款·验证身份', glitch: '伪官方·骗取验证码' },
  ],
};
