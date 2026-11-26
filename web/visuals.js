import {
  admin,
  empty,
  esc,
  icon,
  link,
  panel,
  path,
  person,
  qty,
  route,
  table,
  tag,
  yuan,
} from './ui.js';
import { detailsPath } from './comparison.js';

export const rate = (part, total) =>
  total > 0 && part >= 0 && part <= total ? (100 * part) / total : null;
export const percent = (n) =>
  n == null ? '—' : n.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + '%';
export const nfmt = (n) => Number(n).toLocaleString('zh-CN');
export const hours = (m) => Number((m / 60).toFixed(2)).toLocaleString('zh-CN') + ' 小时';

export function splitBar(title, used, remaining, format, labels, href, unit = '') {
  const all = used + remaining,
    share = rate(used, all);
  const legend = (i, v) =>
    `<span><i class="key-dot k${i}"></i>${esc(labels[i])}<b>${esc(format(v))}${esc(unit)}</b><small>${percent(rate(v, all))}</small></span>`;
  return `<a class="split-block" href="${esc(href)}"><span class="split-title">${esc(title)}${icon('up-right')}</span><strong>${esc(format(all))}<small>${esc(unit)}</small></strong>
    <div class="split-track" aria-hidden="true"><i style="width:${share || 0}%"></i></div><div class="split-keys">${legend(0, used)}${legend(1, remaining)}</div></a>`;
}
export function portfolio(r, scope) {
  const s = r.stats,
    pk = detailsPath(scope, 'packages');
  const roster = path('students', {
    asof: r.end,
    main_teacher: scope.teacher,
    course: scope.course,
    type: scope.type,
  });
  return panel(
    '学员与课包',
    `<div class="portfolio-counts"><a href="${esc(roster)}">学生档案 <b>${nfmt(s.students)}</b> 人 ${icon('chevron')}</a><a href="${esc(pk)}">课包 <b>${nfmt(s.packages)}</b> 个 ${icon('chevron')}</a></div>
    <div class="portfolio-splits">${splitBar('总课时', s.package_used, s.remaining, qty, ['已消课', '剩余'], pk, ' 节')}${splitBar('课包总价值', s.package_consumed, s.remaining_value, yuan, ['累计消课', '剩余价值'], pk)}</div>
    ${s.opening_limited ? `<p class="footnote">${s.opening_limited} 个期初课包从承接余额起计。</p>` : ''}`,
    `<span class="asof">截至 ${esc(r.end)}</span>`,
    'portfolio',
  );
}
export function kpi(label, value, note, href, featured = false) {
  return `<a class="key-figure${featured ? ' featured' : ''}" href="${esc(href)}"><span>${esc(label)}${icon('up-right')}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></a>`;
}
const chartMetrics = {
  scenes: {
    label: '授课场次',
    color: '#346d56',
    kind: 'lessons',
    format: (n) => nfmt(n) + ' 场',
    filter: { only: 'taught' },
  },
  value: { label: '消课金额', color: '#285841', kind: 'consumption', format: yuan },
  receipts: {
    label: '实际收款',
    color: '#67917e',
    kind: 'cashflow',
    format: yuan,
    filter: { flow: 'receipt' },
  },
};
function drawTrend(rows, keys, scope) {
  if (!rows.some((r) => keys.some((k) => (k === 'value' ? r.consumption_records > 0 : r[k] !== 0))))
    return empty('本期没有对应业务记录');
  const h = 164,
    w = 640,
    pad = 12,
    ys = keys.flatMap((k) => rows.map((r) => r[k] || 0));
  const lo = Math.min(0, ...ys),
    hi = Math.max(1, ...ys),
    x = (i) => (rows.length === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (rows.length - 1));
  const y = (v) => h - pad - ((v - lo) * (h - 2 * pad)) / (hi - lo);
  const series = keys
    .map((k) => {
      const pts = rows.map((r, i) => x(i).toFixed(1) + ',' + y(r[k] || 0).toFixed(1)).join(' ');
      return `<polyline fill="none" points="${pts}" stroke="${chartMetrics[k].color}" stroke-width="2.6" vector-effect="non-scaling-stroke" ${k === 'receipts' ? 'stroke-dasharray="6 4"' : ''}/>${rows.length === 1 ? `<circle cx="${x(0)}" cy="${y(rows[0][k] || 0)}" r="3" fill="${chartMetrics[k].color}"/>` : ''}`;
    })
    .join('');
  const recent = Math.max(
    0,
    rows.findLastIndex((r) => keys.some((k) => r[k] !== 0)),
  );
  const points = rows
    .map((r, i) => {
      const refs = keys.map((k) => {
        const meta = chartMetrics[k];
        return {
          label: meta.label,
          value: meta.format(r[k] || 0),
          href: detailsPath(
            { ...scope, period: 'custom', start: r.start, end: r.end },
            meta.kind,
            meta.filter,
          ),
        };
      });
      return `<button type="button" data-trend-point="${i}" tabindex="${i === recent ? '0' : '-1'}" data-day="${esc(r.label)}" data-refs="${esc(JSON.stringify(refs))}" aria-label="${esc([r.label, ...refs.map((v) => v.label + ' ' + v.value)].join('，'))}" ${i === recent ? 'class="selected"' : ''}></button>`;
    })
    .join('');
  const valueAt = (v) =>
    keys[0] === 'scenes'
      ? Math.round(v).toLocaleString('zh-CN')
      : Math.abs(v) >= 1000000
        ? (v / 1000000).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + '万'
        : (v / 100).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
  const grid = [hi, (hi + lo) / 2, lo].map((v) => `<span>${esc(valueAt(v))}</span>`).join('');
  const labels = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])]
    .map((i) => `<span>${esc(rows[i].label.slice(rows[i].label.length === 10 ? 5 : 0))}</span>`)
    .join('');
  const selected = rows[recent],
    links = keys
      .map((k) => {
        const m = chartMetrics[k];
        return `<a href="${esc(detailsPath({ ...scope, period: 'custom', start: selected.start, end: selected.end }, m.kind, m.filter))}">${m.label} <b>${m.format(selected[k] || 0)}</b> ${icon('chevron')}</a>`;
      })
      .join('');
  return `<div class="trend-widget"><div class="chart-legend">${keys.map((k) => `<span><i style="--series:${chartMetrics[k].color}" class="${k === 'receipts' ? 'dashed' : ''}"></i>${chartMetrics[k].label}</span>`).join('')}<small>${keys[0] === 'scenes' ? '场' : '元'}</small></div><div class="trend-coordinates"><div class="yaxis">${grid}</div><div class="trend-plot"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${series}</svg><div class="plot-targets">${points}</div></div></div><div class="xaxis">${labels}</div><label class="point-picker"><span>查看日期</span><select aria-label="查看图表日期">${rows.map((r, i) => `<option value="${i}"${i === recent ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}</select></label><div class="trend-readout" aria-live="polite"><time>${esc(selected.label)}</time>${links}</div></div>`;
}
function activatePoint(el, focus = false) {
  const widget = el.closest('.trend-widget'),
    points = [...widget.querySelectorAll('[data-trend-point]')];
  for (const p of points) {
    p.classList.toggle('selected', p === el);
    p.tabIndex = p === el ? 0 : -1;
  }
  const select = widget.querySelector('.point-picker select');
  if (select) select.value = el.dataset.trendPoint;
  const refs = JSON.parse(el.dataset.refs);
  widget.querySelector('.trend-readout').innerHTML =
    `<time>${esc(el.dataset.day)}</time>` +
    refs
      .map(
        (v) => `<a href="${esc(v.href)}">${esc(v.label)} <b>${esc(v.value)}</b> ${icon('chevron')}</a>`,
      )
      .join('');
  if (focus) el.focus({ preventScroll: true });
}
document.addEventListener('change', (e) => {
  if (e.target.matches('.point-picker select'))
    activatePoint(
      e.target.closest('.trend-widget').querySelectorAll('[data-trend-point]')[e.target.selectedIndex],
    );
});
for (const event of ['pointerover', 'focusin', 'click'])
  document.addEventListener(event, (e) => {
    const el = e.target.closest('[data-trend-point]');
    if (el) activatePoint(el);
  });
document.addEventListener('keydown', (e) => {
  const el = e.target.closest('[data-trend-point]');
  if (!el || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
  const peers = [...el.parentNode.children],
    n = peers.indexOf(el);
  const to =
    e.key === 'Home' ? 0 : e.key === 'End' ? peers.length - 1 : n + (e.key === 'ArrowRight' ? 1 : -1);
  e.preventDefault();
  activatePoint(peers[Math.max(0, Math.min(peers.length - 1, to))], true);
});
function switches(items, selected) {
  return `<div class="chart-switch">${items.map(([key, label]) => `<button type="button" data-chart-key="${esc(key)}" aria-pressed="${key === selected}">${esc(label)}</button>`).join('')}</div>`;
}
function view(key, first, markup) {
  return `<div data-chart-view="${key}"${key === first ? '' : ' hidden'}>${markup}</div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-chart-key]');
  if (!b) return;
  const scope = b.closest('.vis-panel');
  scope
    .querySelectorAll('[data-chart-key]')
    .forEach((el) => el.setAttribute('aria-pressed', String(el === b)));
  scope
    .querySelectorAll('[data-chart-view]')
    .forEach((el) => (el.hidden = el.dataset.chartView !== b.dataset.chartKey));
});
export function trendPanel(r, scope, mode = 'both') {
  const two = mode === 'both' && admin(),
    first = mode === 'finance' ? 'finance' : 'work';
  const tabs = two
    ? switches(
        [
          ['work', '授课'],
          ['finance', '收款与消课'],
        ],
        first,
      )
    : '';
  return panel(
    mode === 'finance' ? '收款与消课趋势' : mode === 'teacher' ? '授课趋势' : '经营趋势',
    (two || first === 'work' ? view('work', first, drawTrend(r.trend, ['scenes'], scope)) : '') +
      (two || first === 'finance'
        ? view('finance', first, drawTrend(r.trend, ['value', 'receipts'], scope))
        : ''),
    tabs,
    'vis-panel',
  );
}
export function teacherBars(r, scope) {
  const dimensions = [
    ['scenes', '场次', (n) => n + ' 场', 'lessons', { only: 'taught' }],
    ['minutes', '时长', hours, 'lessons', { only: 'taught' }],
    ['value', '消课', yuan, 'consumption', {}],
    ['fee', '课酬', yuan, 'fees', {}],
  ];
  return panel(
    '老师对比',
    dimensions
      .map(([k, label, formatter, kind, extra]) => {
        const rows = r.compare
          .map((t) => ({
            ...t,
            figure:
              k === 'fee'
                ? t.reference_missing && t.pending_fees > t.pending_reference_count
                  ? null
                  : t.verified_fees + t.pending_reference
                : t[k],
          }))
          .sort((a, b) => (b.figure || 0) - (a.figure || 0));
        const max = Math.max(1, ...rows.map((t) => Math.abs(t.figure || 0)));
        return view(
          k,
          'scenes',
          rows.length
            ? `<div class="bar-rows">${rows.map((t) => `<a href="${esc(detailsPath({ ...scope, teacher: t.id }, kind, extra))}"><span>${esc(t.name)}</span><div><i style="width:${(Math.abs(t.figure || 0) / max) * 100}%"></i></div><b>${esc(t.figure == null ? '待核' : formatter(t.figure))}</b>${k === 'fee' ? `<small>${t.pending_fees ? '含 ' + t.pending_fees + ' 笔待核' : '已确认'}</small>` : ''}</a>`).join('')}</div>`
            : empty(),
        );
      })
      .join(''),
    switches(
      dimensions.map(([k, l]) => [k, l]),
      'scenes',
    ),
    'vis-panel',
  );
}
export function courseMix(r, scope) {
  const total = r.composition.reduce((a, b) => a + b.scenes, 0);
  return panel(
    '课型构成',
    total
      ? r.composition
          .map(
            (row, i) =>
              `<a class="mix-item" href="${esc(detailsPath({ ...scope, type: row.type }, 'lessons', { only: 'taught' }))}"><span><i class="key-dot k${i}"></i>${row.type === 'solo' ? '一对一' : '一对二'}</span><div><i style="width:${rate(row.scenes, total)}%"></i></div><b>${row.scenes} 场</b><small>${percent(rate(row.scenes, total))}</small></a>`,
          )
          .join('')
      : empty('本期没有实授场次'),
  );
}
export function adaptiveTable(headers, rows, primary = [0, 1], msg) {
  if (!rows.length) return empty(msg);
  const plain = (s) => {
    const el = document.createElement('span');
    el.innerHTML = String(s ?? '—');
    return el.textContent.trim() || '—';
  };
  const mobile = rows
    .map((row) => {
      const line = (main, sub) => {
        const subtitle = sub != null && sub !== main ? plain(row[sub]) : '';
        return `<span><b>${esc(plain(row[main]))}</b>${subtitle && subtitle !== '—' ? `<small>${esc(subtitle)}</small>` : ''}</span>`;
      };
      const fields = row
        .map((v, i) => `<div><dt>${esc(headers[i])}</dt><dd>${v ?? '—'}</dd></div>`)
        .join('');
      return `<details class="record-card"><summary>${line(primary[0], primary[2])}${line(primary[1], primary[3])}${icon('down')}</summary><dl>${fields}</dl></details>`;
    })
    .join('');
  return `<div class="adaptive-wide">${table(headers, rows, msg)}</div><div class="adaptive-mobile">${mobile}</div>`;
}
export function pagingLinks(key, index, total, size) {
  const { page, params } = route(),
    last = Math.ceil(total / size);
  if (last <= 1) return '';
  const move = (n, t) => link(page, t, { ...params, [key]: n }, 'btn small page-turn');
  return `<nav class="list-pager" aria-label="明细分页"><span>第 ${index} / ${last} 页 · 共 ${total} 条</span><div>${index > 1 ? move(index - 1, '上一页') : ''}${index < last ? move(index + 1, '下一页') : ''}</div></nav>`;
}
export function paginate(items, key, paint, size = 20) {
  if (items.length <= size) return paint(items);
  const last = Math.ceil(items.length / size),
    { params } = route();
  const index = Math.min(last, Math.max(1, parseInt(params[key], 10) || 1));
  return `<div class="page-list" id="list-${esc(key)}">${paint(items.slice((index - 1) * size, index * size))}${pagingLinks(key, index, items.length, size)}</div>`;
}
export function packageCard(pk, asof, open = true) {
  const fraction = rate(pk.progress_used, pk.progress_total),
    total = qty(pk.progress_total);
  const label = pk.split_unknown
    ? '正课与赠课未分列'
    : (pk.opening ? '承接正课 ' : '购买 ') +
      qty(pk.paid_units) +
      ' 节 · ' +
      (pk.opening ? '承接赠课 ' : '赠送 ') +
      qty(pk.gift_units) +
      ' 节';
  const fin = admin()
    ? `<dl class="pack-ledger"><div><dt>有效均价</dt><dd>${yuan(pk.average)}</dd></div><div><dt>累计消课</dt><dd>${yuan(pk.consumed_value)}</dd></div><div><dt>剩余价值</dt><dd>${yuan(pk.remaining_value)}</dd></div><div><dt>${pk.receipt_review != null ? '原收款待核' : '登记净收'}</dt><dd>${yuan(pk.receipt_review ?? pk.net_cash)}</dd></div></dl>`
    : '';
  return `<article class="pack"><div class="pack-top"><span class="tile-icon">${icon('book')}</span><div><h3>${esc(pk.course)} · ${pk.type === 'solo' ? '一对一' : '一对二'}</h3><small>${esc(pk.id)}</small></div></div><div class="pack-number"><strong>${qty(pk.remaining)}</strong> 节剩余 <small>已消 ${qty(pk.progress_used)} / ${total} 节</small></div><div class="pack-progress"><div class="split-track"><i style="width:${fraction || 0}%"></i></div><b>${percent(fraction)}</b></div><p>${esc(label)}${pk.total_units !== pk.progress_total ? ' · 原合同 ' + qty(pk.total_units) + ' 节' : ''}</p>${fin}${pk.member_ids.length > 1 ? `<p>共用 · ${esc(pk.student_name)}</p>` : ''}${pk.opening ? `<p>${pk.original_units == null ? '期初按承接余额统计' : '含已核实的期初前消耗'} · 历史登记 ${qty(pk.historical_used)} 节</p>` : ''}<footer>${esc(pk.since)}${pk.until_day ? ' 至 ' + esc(pk.until_day) : ''}${open ? link('pack', '课包明细', { id: pk.id, asof }) : ''}</footer></article>`;
}
