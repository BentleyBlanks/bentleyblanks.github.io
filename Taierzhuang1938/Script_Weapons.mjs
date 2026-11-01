// Data_Weapons.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { PLAYER_SLOT_ORDER, SHELVED_WEAPONS } from "./Data_Weapons.mjs";

export function WeaponShelved(id) {
  return SHELVED_WEAPONS.includes(id);
}

/** 某个武器槽对应的 KeyboardEvent.code；槽位停用时返回 null。 */
export function PlayerSlotKey(slot) {
  const index = PLAYER_SLOT_ORDER.indexOf(slot);
  return index < 0 ? null : `Digit${index + 1}`;
}
