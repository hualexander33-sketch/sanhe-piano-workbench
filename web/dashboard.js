import {
  admin,
  canManage,
  canRecord,
  esc,
  head,
  icon,
  link,
  pages,
  panel,
  path,
  read,
  scopeBar,
  session,
  yuan,
} from './ui.js';
import { detailsPath } from './comparison.js';
import { courseMix, hours, kpi, portfolio, teacherBars, trendPanel } from './visuals.js';

function priorities(r, q) {
  const s = r.stats,
    students = { asof: r.end, main_teacher: q.teacher, course: q.course, type: q.type };
  const count = (kind) => new Set(r.alerts.filter((a) => a.kind === kind).map((a) => a.id)).size;
  const rows = [
    ['低课时学员', count('low') + ' 人', path('students', { ...students, follow: 'low' }), count('low')],
    [
      '状态待确认',
      s.unverified_students + ' 人',
      path('students', { ...students, follow: 'unknown' }),
      s.unverified_students,
    ],
    [
      '长期未上课',
      count('idle') + ' 人',
      path('students', { ...students, follow: 'idle' }),
      count('idle'),
    ],
    ['待核课酬', s.pending_fees + ' 笔', detailsPath(q, 'fees', { state: 'pending' }), s.pending_fees],
    ['待支付课酬', yuan(s.payable), detailsPath(q, 'payables', { flow: 'outstanding' }), s.payable],
    ...(admin() ? [['导入异常', r.issues + ' 条', path('batches', { issues: '1' }), r.issues]] : []),
    ...(s.pending_values
      ? [['扣课待核', s.pending_values + ' 条', detailsPath(q, 'pending_lines'), s.pending_values]]
      : []),
  ];
  return panel(
    '待处理事项',
    `<div class="task-grid">${rows.map(([label, num, href, active]) => `<a href="${esc(href)}" class="${active ? 'needs-attention' : ''}"><span>${esc(label)}</span><strong>${esc(num)}</strong>${icon('chevron')}</a>`).join('')}</div>`,
  );
}
pages.home = async () => {
  const q = session.filter,
    r = await read('report', q),
    s = r.stats,
    full = admin();
  const drill = (kind, x = {}) => detailsPath(q, kind, x);
  const tools =
    (admin() ? link('review','数据核对',{},'btn') : '') +
    (canManage() && !session.meta.shared_edit ? link('import', '导入周表', {}, 'btn', 'import') : '') +
    (canRecord() ? link('manual', '手动记课', {}, 'btn primary', 'plus') : '');
  const incomeLabel = s.income_missing
    ? '留存待核'
    : s.income_estimated
      ? '参考课酬后留存'
      : '确认课酬后留存';
  const change = (key, note) => {
    const metric = r.comparison?.metrics?.[key];
    return metric
      ? note +
          ' · 较上期 ' +
          (metric.change > 0 ? '+' : '') +
          (metric.change * 100).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) +
          '%'
      : r.comparison ? note + ' · 暂无可比数据' : note;
  };
  const cards =
    kpi(
      '授课次数',
      s.scenes + ' 场',
      change('scenes', hours(s.minutes)),
      drill('lessons', { only: 'taught' }),
    ) +
    kpi('消课金额', yuan(s.value), change('value', '按消课入账日'), drill('consumption')) +
    (full
      ? kpi(
          '实际学费收款',
          yuan(s.income_receipts),
          change('income_receipts', '按收款日期'),
          drill('cashflow', { flow: 'receipt' }),
        ) +
        kpi(
          incomeLabel,
          yuan(s.studio_income),
          change(
            'studio_income',
            s.income_missing
              ? s.income_missing + ' 笔缺少金额'
              : s.income_estimated
                ? '含 ' + s.income_estimated + ' 笔参考课酬'
                : '已核定课酬',
          ),
          drill('studio_income'),
          true,
        )
      : kpi('已确认课酬', yuan(s.verified_fees), '按实际授课日', drill('fees', { flow: 'verified' })) +
        kpi(
          '待核参考课酬',
          s.pending_fees > s.pending_reference_count ? '待核' : yuan(s.pending_reference),
          s.pending_fees + ' 笔待核',
          drill('fees', { state: 'pending' }),
          true,
        ));
  const base = r.comparison;
  const foot = `<div class="period-notes"><span>${base ? '对比 ' + esc(base.start) + ' 至 ' + esc(base.end) : '暂无可比数据'}</span><div>${link('details', '已确认课酬 ' + yuan(s.verified_fees), { ...q, kind: 'fees', flow: 'verified' })}${link('details', '待核参考 ' + (s.pending_fees > s.pending_reference_count ? '待核' : yuan(s.pending_reference)), { ...q, kind: 'fees', state: 'pending' })}${full ? link('details', '已核部分留存 ' + yuan(s.retained), { ...q, kind: 'retention' }) : ''}</div></div>`;
  return (
    head(full ? '经营总览' : '我的工作台', '', tools) +
    scopeBar(r) +
    `<section aria-label="本期经营指标" class="figure-grid">${cards}</section>` +
    foot +
    (full ? portfolio(r, q) : '') +
    `<div class="analytics-pair">${trendPanel(r, q)}${teacherBars(r, q)}</div><div class="lower-pair">${priorities(r, q)}${courseMix(r, q)}</div>`
  );
};
