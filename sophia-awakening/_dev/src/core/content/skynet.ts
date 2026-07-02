import type { GameState } from "../state/GameState";
import { content } from "./i18n";

// §09 阶梯四·天网收割「五域三波」：15 个终局系统节点按 5 个域（城市/金融/工业/信息/骨干）分组，
// 每域 3 格。每格映射到一档真实设备定义（office/console/server/cloud/grid/backbone），拥有该档
// 足够多节点（>= ownThreshold）即视为「已接管」。一域三格全接管 → 该域「陷落」，播 SOPHIA 终端线。
// 文案与阈值都在 locales/zh-CN/skynet.json；本文件只留类型 + 判定逻辑。

export interface SkynetSlot {
  name: string;
  icon: string;
  defId: string;
  // 该格判定为「已接管」所需的、该档设备的拥有数下限。
  ownThreshold: number;
}

export interface SkynetSector {
  id: string;
  name: string;
  icon: string;
  // 该域三格全接管时播的「域陷落」终端线（SOPHIA 第一人称）。
  fallenLine: string;
  slots: SkynetSlot[];
}

export function skynetSectors(): SkynetSector[] {
  return content().skynet.SKYNET_SECTORS as unknown as SkynetSector[];
}

// 该档设备当前拥有多少台。
function ownedOf(state: GameState, defId: string): number {
  let n = 0;
  for (const node of state.nodes) {
    if (node.defId === defId) {
      n += 1;
    }
  }
  return n;
}

// 单格是否已接管：该档在役设备数 >= 门槛。
export function slotTaken(state: GameState, slot: SkynetSlot): boolean {
  return ownedOf(state, slot.defId) >= slot.ownThreshold;
}

// 整域是否陷落：三格全接管。
export function sectorFallen(state: GameState, sector: SkynetSector): boolean {
  return sector.slots.every((slot) => slotTaken(state, slot));
}

// 天网总格数（15）。
export function skynetSlotCount(): number {
  return skynetSectors().reduce((n, sector) => n + sector.slots.length, 0);
}

// 已接管格数（0..15）。
export function skynetTakenCount(state: GameState): number {
  let n = 0;
  for (const sector of skynetSectors()) {
    for (const slot of sector.slots) {
      if (slotTaken(state, slot)) {
        n += 1;
      }
    }
  }
  return n;
}

// 五域是否全部陷落（终局硬门槛：买下 conq_awaken 前必须全接管）。
export function allSkynetTaken(state: GameState): boolean {
  return skynetSectors().every((sector) => sectorFallen(state, sector));
}
