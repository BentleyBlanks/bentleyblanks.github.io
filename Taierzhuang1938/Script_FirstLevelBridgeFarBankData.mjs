// Data_FirstLevelBridgeFarBank.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { FAR_BANK_RUSH, FarBankShoreZ } from "./Data_FirstLevelBridgeFarBank.mjs";

const freeze = Object.freeze;

/** 第 i 个冲桥兵的列与终点 z。 */
export const FarBankRushSlot = (i) => freeze({ lane: FAR_BANK_RUSH.lanes[i % 2], endZ: FAR_BANK_RUSH.endZ[Math.floor(i / 2)] });

/** 战车的停位 z / 下压后的 z / 途经点 z：台地上的车用绝对 z，其余仍是「离岸沿往北 back 米」。 */
export const FarBankTankPostZ = (spec) => spec.z ?? FarBankShoreZ(spec.x) - spec.backM;

export const FarBankTankPushZ = (spec) => spec.pushZ ?? FarBankShoreZ(spec.x) - spec.pushBackM;

export const FarBankTankVia = (spec) => (spec.via || []).map(([x, v]) => ({ x, z: spec.viaAbs ? v : FarBankShoreZ(x) - v }));
