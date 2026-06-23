import type { CustomerDef } from '../types/content.types';

// 6 个顾客角色，耐心 / 酬金 / 初始角标各异。
export const CUSTOMERS: CustomerDef[] = [
  { id: 'cust_a', name: '上班族', artId: 'cust_a', patienceMs: 32000, basePayout: 3, startBadgeRange: [15, 22] },
  { id: 'cust_b', name: '学生党', artId: 'cust_b', patienceMs: 36000, basePayout: 2, startBadgeRange: [12, 18] },
  { id: 'cust_c', name: '社交达人', artId: 'cust_c', patienceMs: 26000, basePayout: 4, startBadgeRange: [20, 28] },
  { id: 'cust_d', name: '急脾气老板', artId: 'cust_d', patienceMs: 22000, basePayout: 6, startBadgeRange: [18, 26] },
  { id: 'cust_e', name: '从容宝妈', artId: 'cust_e', patienceMs: 40000, basePayout: 3, startBadgeRange: [16, 24] },
  { id: 'cust_f', name: '带货网红', artId: 'cust_f', patienceMs: 28000, basePayout: 5, startBadgeRange: [22, 30] },
];
