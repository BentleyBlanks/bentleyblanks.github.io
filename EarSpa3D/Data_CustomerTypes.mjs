export const CUSTOMER_EARS = Object.freeze({mixed:{label:'混合耳',note:'薄片、黏块、硬结与微屑'},dry:{label:'干耳',note:'干燥薄片与细碎角质'},wet:{label:'黏耳',note:'柔软黏层与细屑'},impacted:{label:'硬结耳',note:'先软化，再逐块松解'},oily:{label:'油耳',note:'整耳黏弹凝胶，慢拉后缓缓回缩'}});
export function CustomerEarType(customer){return Object.hasOwn(CUSTOMER_EARS,customer?.earType)?customer.earType:'mixed';}
