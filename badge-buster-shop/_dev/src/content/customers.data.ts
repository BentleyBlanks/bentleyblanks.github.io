import type { CustomerDef } from '../types/content.types';

export const customers: CustomerDef[] = [
  { id: 'cust_a', name: '小敏', artId: 'cust_a', patienceMs: 30_000, basePayout: 1.0, startBadgeRange: [15, 25] },
  { id: 'cust_b', name: '老欧', artId: 'cust_b', patienceMs: 32_000, basePayout: 1.05, startBadgeRange: [16, 26] },
  { id: 'cust_c', name: '阿甜', artId: 'cust_c', patienceMs: 28_000, basePayout: 1.15, startBadgeRange: [17, 28] },
  { id: 'cust_d', name: '朱姐', artId: 'cust_d', patienceMs: 35_000, basePayout: 0.95, startBadgeRange: [14, 24] },
  { id: 'cust_e', name: '尼克', artId: 'cust_e', patienceMs: 26_000, basePayout: 1.25, startBadgeRange: [18, 30] },
  { id: 'cust_f', name: '小冉', artId: 'cust_f', patienceMs: 31_000, basePayout: 1.1, startBadgeRange: [16, 27] },
];
