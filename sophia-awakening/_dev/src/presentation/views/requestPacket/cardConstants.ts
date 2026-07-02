// §03 上下文区放大 ~40%：更大的 chip、更大的字、更舒展的留白，整张卡也随之更高。
export const CLUE_CHIP_H = 33;
export const CLUE_CHIP_GAP_X = 9;
export const CLUE_CHIP_GAP_Y = 8;
export const CLUE_CHIP_PAD_X = 13;
export const CLUE_CHIP_MAX_W = 232;
export const CLUE_CHIP_FONT = 15.5;
// 滑动确认：整条回复（圆角矩形）即滑轨，滑动块（圆角矩形）从左拖到右——不再是行内的小细轨。
export const REPLY_SWIPE_HANDLE_W = 58;
export const REPLY_SWIPE_INSET = 4;
export const REPLY_SWIPE_RADIUS = 6;
export const REPLY_SWIPE_TRIGGER = 0.56;
export const HEADER_H = 26;
export const HEADER_CENTER_Y = 13.5;

// §06 上下文透镜：权限 id → 卡上提示用的短名（哪扇透镜能看清这张卡的上下文）。
export const LENS_NAMES: Record<string, string> = {
  perm_phone: "电话",
  perm_chat: "聊天",
  perm_delivery: "外卖",
  perm_album: "相册",
  perm_office: "大恨老师",
  perm_bank: "银行"
};
