import {
  session,
  esc,
  icon,
  path,
  link,
  btn,
  head,
  panel,
  empty,
  tag,
  avatar,
  admin,
  canRecord,
  read,
  pages,
  actions,
  teacher,
  money,
  yuan,
  qty,
  scopeBar,
  go,
  reload,
  types,
  metricLinks,
} from './ui.js';

import { studioIncomePanel, teacherComparison } from './comparison.js';

let trendMode = 'scenes';
function detailUrl(kind, extra = {}) {
  return path('details', { ...session.filter, kind, ...extra });
}
function kpi(title, value, unit, glyph, kind, note, tone, params = {}) {
  return `<a class="kpi ${tone}" href="${esc(detailUrl(kind, params))}"><div class="kpi-label"><i>${icon(glyph)}</i><span>${esc(title)}</span></div><div class="kpi-number">${unit === '元' ? '<small>¥</small>' : ''}${esc(value)}${unit !== '元' ? `<small>${esc(unit)}</small>` : ''}</div><div class="kpi-foot"><span>${esc(note)}</span>${icon('up-right')}</div></a>`;
}
function chart(rows, fund) {
  if (!rows.length) return empty();
  const narrow = matchMedia('(max-width: 680px)').matches;
  const w = narrow ? 350 : 620,
    h = 184,
    left = narrow ? 35 : 44,
    right = 10,
    top = 14,
    bottom = 153,
    dw = w - left - right,
    step = dw / rows.length;
  const keys = fund ? (admin() ? ['value', 'net'] : ['value']) : ['scenes'];
  const val = (r, k) => r[k] / (fund ? 100 : 1);
  const values = rows.flatMap((r) => keys.map((k) => val(r, k)));
  const max = Math.max(...values, 1),
    min = Math.min(0, ...values);
  const quantum = Math.pow(10, Math.floor(Math.log10(Math.max(max - min, 1))));
  const gap = Math.max(fund ? 0.01 : 1, (Math.ceil(((max - min) / 3 / quantum) * 2) * quantum) / 2);
  const hi = Math.ceil(max / gap) * gap,
    lo = Math.floor(min / gap) * gap;
  const y = (v) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  const x = (i) => left + step * (i + 0.5);
  let marks = '';
  for (let value = lo; value <= hi + 0.001; value += gap) {
    const label = value >= 10000 ? value / 10000 + '万' : String(value);
    marks += `<line x1="${left}" x2="${w - right}" y1="${y(value)}" y2="${y(value)}" class="gridline"/><text x="${left - 9}" y="${y(value) + 4}" text-anchor="end">${esc(label)}</text>`;
  }
  const href = (r, k) =>
    esc(
      detailUrl(k === 'scenes' ? 'lessons' : k === 'value' ? 'consumption' : 'cash', {
        period: 'custom',
        start: r.start,
        end: r.end,
        ...(k === 'scenes' ? { only: 'taught' } : {}),
      }),
    );
  if (fund) {
    for (const [j, k] of keys.entries()) {
      const px = (r, i) =>
        x(i) +
        (keys.length === 2 && Math.abs(y(val(r, keys[0])) - y(val(r, keys[1]))) <= 14
          ? (j ? 1 : -1) * Math.min(5, step * 0.22)
          : 0);
      const points = rows.map((r, i) => [px(r, i), y(val(r, k))]);
      const line = points.map(([a, b], i) => (i ? 'L' : 'M') + a.toFixed(2) + ' ' + b.toFixed(2)).join(' ');
      if (!j)
        marks += `<path d="${line} L${x(rows.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z" fill="#e5efdf" opacity=".75" pointer-events="none"/>`;
      marks += `<path d="${line}" fill="none" stroke="${j ? '#ba8359' : '#407659'}" stroke-width="2.5" pointer-events="none"/>`;
      rows.forEach((r, i) => {
        marks += `<a href="${href(r, k)}" aria-label="${esc(r.label)} ${k === 'net' ? '净收' : '消课'} ${money(r[k])}元"><title>${esc(r.label)} · ${money(r[k])} 元</title><rect x="${keys.length === 1 || !j ? x(i) - step / 2 : x(i)}" y="${y(val(r, k)) - 8}" width="${step / keys.length}" height="16" fill="transparent"/><circle pointer-events="none" cx="${px(r, i)}" cy="${y(val(r, k))}" r="3.5" fill="${j ? '#ba8359' : '#407659'}" stroke="white" stroke-width="1.5"/></a>`;
      });
    }
  } else
    rows.forEach((r, i) => {
      const height = bottom - y(val(r, 'scenes')),
        width = Math.min(step * 0.62, 42);
      marks += `<a href="${href(r, 'scenes')}" aria-label="${esc(r.label)} ${r.scenes} 场"><title>${esc(r.label)} · ${r.scenes} 场</title><rect x="${x(i) - step / 2}" y="${top}" width="${step}" height="${bottom - top}" fill="transparent"/><rect rx="2.5" x="${x(i) - width / 2}" y="${bottom - Math.max(2, height)}" width="${width}" height="${Math.max(2, height)}" fill="${height ? '#5b8063' : '#dfe9dd'}"/></a>`;
    });
  const every = Math.max(1, Math.ceil(rows.length / (narrow ? 4 : 6)));
  rows.forEach((r, i) => {
    if (i % every === 0 || (i === rows.length - 1 && (i % every) / every > 0.45))
      marks += `<text x="${x(i)}" y="176" text-anchor="middle">${esc(r.label.slice(5).replace('-', '/'))}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" class="chart-svg" role="group" aria-label="${fund ? '收款与消课金额趋势' : '实际授课次数趋势'}">${marks}</svg>`;
}
pages.home = async () => {
  const r = await read('report', session.filter),
    s = r.stats;
  const controls =
    (admin() ? link('import', '导入周表', {}, 'btn', 'import') : '') +
    (canRecord() ? link('manual', '手动记课', {}, 'btn primary', 'plus') : '');
  const cards =
    kpi('已上课时', s.scenes, '节', 'lessons', 'lessons', '真实教学 ' + s.minutes + ' 分钟', 'feature', {
      only: 'taught',
    }) +
    kpi(
      '已确认消课',
      money(s.value),
      '元',
      'book',
      'consumption',
      s.pending_values ? '另有 ' + s.pending_values + ' 笔待核消课' : '按课包原价累计分摊',
      'clay',
    ) +
    kpi(
      '参考课酬',
      s.reference_missing && !s.reference_count ? '待核' : money(s.reference_pay),
      '元',
      'earn',
      'fees',
      s.pending_fees ? s.pending_fees + ' 笔课酬待核' : '按逐节记录试算',
      'gold',
      { flow: 'reference' },
    ) +
    (admin()
      ? kpi('琴行总收入', money(s.studio_income), '元', 'accounts', 'studio_income', '到账学费减退款、已发课酬', 'sage')
      : kpi('累计待付款', money(s.payable), '元', 'accounts', 'payables', '截至 ' + r.end, 'sage'));
  const segments = (act, options, selected) =>
    `<div class="segments compact">${Object.entries(options)
      .map(([k, v]) => btn(act, v, { id: k, style: 'segment ' + (k === selected ? 'active' : '') }))
      .join('')}</div>`;
  const fund = trendMode === 'fund';
  const trend = panel(
    '授课与收支趋势',
    `<div class="chart-summary"><span class="legend"><i></i>${fund ? '已确认消课（元）' : '实际授课（场）'}</span>${fund && admin() ? '<span class="legend terracotta"><i></i>净收学费（元）</span>' : ''}</div>${chart(r.trend, fund)}`,
    segments('trend', { scenes: '课量', fund: admin() ? '收支' : '消课' }, trendMode),
    'chart-panel',
  );
  const balancesAtDate = admin() ? panel('学员与课包', metricLinks([
    ['学员数', s.students + ' 位', path('students', { asof: r.end, main_teacher: session.filter.teacher, course: session.filter.course, type: session.filter.type })],
    ['课包数', s.packages + ' 个', detailUrl('packages')],
    ['剩余课时', qty(s.remaining) + ' 节', detailUrl('packages'), '共用课包按包统计'],
    ['剩余课包价值', yuan(s.remaining_value), detailUrl('packages')],
  ]), `<span class="muted">截至 ${esc(r.end)}</span>`) : '';
  const numbers = admin()
    ? [
        ['课包收款待核', yuan(s.receipt_review), '纸卡登记，等待核实到账', 'packages', { flow: 'receipt_review' }],
        ['学生欠费', yuan(s.debt), '待收学费', 'packages', { flow: 'debt' }],
        ['累计老师待付款', yuan(s.payable), '已确认应付减已付', 'payables', {}],
      ]
    : [
        ['期间已付', yuan(s.paid), '归属本期课酬', 'earnings', {}],
        ['期间未付', yuan(s.unpaid), '归属本期课酬', 'earnings', {}],
        ['本期实际付款', yuan(s.actual_paid), '按实际付款日期', 'payments', {}],
      ];
  const balances = panel(
    admin() ? '期末往来' : '课酬与付款',
    `<div class="balance-grid">${numbers.map(([l, v, n, k, param]) => `<a href="${esc(detailUrl(k, param))}"><small>${esc(l)}</small><strong>${esc(v)}</strong><span>${esc(n)}</span></a>`).join('')}</div>`,
    `<span class="muted">截至 ${esc(r.end)}</span>`,
  );
  const alerts = [];
  if (s.pending_fees)
    alerts.push([detailUrl('fees', { state: 'pending' }), '课酬待核', s.pending_fees + ' 笔', 'amber']);
  if (s.pending_values)
    alerts.push([detailUrl('pending_lines'), '扣课待核', s.pending_values + ' 条', 'amber']);
  if (r.issues && admin()) alerts.push([path('batches'), '导入问题', r.issues + ' 条', 'amber']);
  r.alerts.forEach((a) =>
    alerts.push([path('profile', { id: a.id }), a.name, a.text, a.kind === 'low' ? 'olive' : '']),
  );
  const todo = panel(
    '待处理事项',
    alerts.length
      ? `<div class="todo-list">${alerts.map(([u, n, d, c]) => `<a href="${esc(u)}"><span class="todo-dot ${c}"></span><b>${esc(n)}</b><span>${esc(d)}</span>${icon('chevron')}</a>`).join('')}</div>`
      : empty('当前没有待处理事项'),
    tag(String(alerts.length) + ' 项'),
  );
  const mix = panel(
    '课型构成',
    `<div class="mix-list">${r.composition.map((obj) => `<a href="${esc(detailUrl('consumption', { type: obj.type }))}"><span>${esc(types[obj.type])}</span><b>${obj.scenes} 场 · ${qty(obj.units)} 次权益</b><small>已核消课 ${yuan(obj.value)} · 消课均价 ${obj.use_avg == null ? '—' : yuan(obj.use_avg)}${admin() ? ' · 购课均价 ' + (obj.buy_avg == null ? '—' : yuan(obj.buy_avg)) : ''}</small></a>`).join('')}</div>`,
  );
  return (
    head(admin() ? '经营总览' : '我的工作台', '课量、课酬与账目按所选期间汇总', controls) +
    scopeBar(r) +
    `<h2 class="scope-heading">所选期间</h2><div class="kpis">${cards}</div>${admin() ? studioIncomePanel(r,session.filter) : ''}${balancesAtDate}${teacherComparison(r, session.filter, true)}${trend}${admin() ? `<a class="retention" href="${esc(detailUrl('retention'))}"><span>${icon('chart')} 本期确认留存</span><strong>${yuan(s.retained)}</strong><small>仅含消课与课酬归属均已确认的记录</small>${icon('chevron')}</a>` : ''}${balances}<div class="duo-grid lower">${todo}${mix}</div>`
  );
};
actions.trend = (el) => {
  trendMode = el.dataset.id;
  reload();
};
