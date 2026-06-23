import type { UpgradeDef } from '../types/content.types';

export const GRID_COLS = 4;
export const GRID_ROWS = 5;
export const INITIAL_ACTIVE_SLOTS = 1;
export const INITIAL_QUEUE_CAPACITY = 3;
export const INITIAL_REPUTATION = 3;
export const BASE_PATIENCE_MS = 30_000;
export const BASE_ARRIVAL_INTERVAL_MS = 8_000;
export const INCOMING_BASE_INTERVAL_MS = 2_500;
export const SAVE_KEY = 'badge-buster-shop:v1';

export function xpToNextLevel(level: number): number {
  return Math.floor(10 * Math.pow(level, 1.6));
}

export function upgradeCost(def: UpgradeDef, ownedLevel: number): number {
  return Math.floor(def.baseCost * Math.pow(def.costGrowth, ownedLevel));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function randomRangeInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}
