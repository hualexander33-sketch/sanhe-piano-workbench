import { path, yuan } from './ui.js';
export const confirmedPay = (row) =>
  row.earned_entries ? yuan(row.earned) : row.pending_fees ? '待核' : '暂无应付记录';
export const actualPay = (row) => (row.payment_entries ? yuan(row.actual_paid) : '暂无付款记录');
export const detailsPath = (scope, kind, extra = {}) => path('details', { ...scope, kind, ...extra });
