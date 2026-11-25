import { avatar, empty, esc, link, panel, path, table, yuan } from './ui.js';

export const referencePay = (row) =>
  row.reference_missing && !row.reference_count ? '待核' : yuan(row.reference_pay);
export const confirmedPay = (row) =>
  row.earned_entries ? yuan(row.earned) : row.pending_fees ? '待核' : '暂无确认记录';
export const actualPay = (row) => row.payment_entries ? yuan(row.actual_paid) : '尚无付款登记';
export const detailsPath = (scope, kind, extra = {}) => path('details', { ...scope, kind, ...extra });

export function teacherComparison(report, scope, withCharts = false) {
  const teachers = [...report.compare].sort((a, b) => b.scenes - a.scenes || a.name.localeCompare(b.name, 'zh-CN'));
  const lesson = { only: 'taught' };
  const substitute = { ...lesson, coverage: 'substitute' };
  const estimate = { flow: 'reference' };
  const drill = (row, kind, extra) => ({ ...scope, ...(row.id ? {teacher: row.id} : {}), kind, ...extra });
  const number = (row, label, kind, extra) => link('details', label, drill(row, kind, extra));
  const chart = (title, metric, label, kind, extra) => {
    const max = Math.max(1, ...teachers.map((row) => row[metric]));
    const bars = teachers.map((row) =>
      `<a class="compare-row" href="${esc(path('details', drill(row, kind, extra)))}"><span class="person">${avatar(row.name, row.id)}<span>${esc(row.name)}</span></span><span class="track"><i class="bar-${esc(row.id)}" style="width:${100 * row[metric] / max}%"></i></span><strong>${esc(label(row))}</strong></a>`).join('');
    return panel(title, bars || empty(), '', 'compare-panel');
  };
  const charts = withCharts ? `<div class="duo-grid teacher-charts">${
    chart('老师课时对比', 'scenes', (t) => t.scenes + ' 节', 'lessons', lesson)
  }${chart('老师参考课酬对比', 'reference_pay', referencePay, 'fees', estimate)}</div>` : '';
  const confirmedLink = (row) => !row.earned_entries && row.pending_fees
    ? number(row, confirmedPay(row), 'fees', {state:'pending'})
    : number(row, confirmedPay(row), 'earnings');
  const lines = [...teachers, { ...report.stats, name: '合计' }].map((row) => [
    row.id ? link('teacher', row.name, { ...scope, id: row.id }) : '<strong>合计</strong>',
    number(row, row.scenes + ' 节', 'lessons', lesson),
    number(row, row.substitutes + ' 节', 'lessons', substitute),
    number(row, row.minutes + ' 分钟', 'lessons', lesson),
    number(row, yuan(row.value), 'consumption'),
    number(row, referencePay(row), 'fees', estimate),
    confirmedLink(row),
    number(row, actualPay(row), 'payments'),
  ]);
  const headers = ['实际老师','已上课时','其中代课','授课时长','消课金额','参考课酬','已确认应付','实际已付'];
  const mobile = lines.map((cells, i) => `<details class="teacher-summary"><summary><b>${esc(teachers[i]?.name || '合计')}</b><span>${esc((teachers[i] || report.stats).scenes)} 节</span><strong>${esc(referencePay(teachers[i] || report.stats))}</strong></summary><dl>${cells.map((cell, index) => `<div><dt>${headers[index]}</dt><dd>${cell}</dd></div>`).join('')}</dl></details>`).join('');
  return charts + panel('老师课时与收入明细',
    `<div class="comparison-wide">${table(headers,lines)}</div><div class="comparison-mobile"><div class="comparison-key">老师 · 已上课时 · 参考课酬</div>${mobile}</div>`
    + `<p class="report-note">代课已计入实际授课老师的课时。参考课酬按逐节试算汇总，实付按付款日期登记。${report.stats.reference_missing ? esc(report.stats.reference_missing) + ' 笔课酬缺少试算依据。' : ''}</p>`);
}
