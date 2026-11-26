import {
  session,
  esc,
  icon,
  path,
  route,
  link,
  btn,
  field,
  head,
  panel,
  table,
  empty,
  tag,
  badge,
  avatar,
  person,
  admin,
  owner,
  canRecord,
  read,
  write,
  roles,
  pages,
  actions,
  forms,
  values,
  teacher,
  teacherOptions,
  yuan,
  money,
  qty,
  scopeBar,
  go,
  reload,
  types,
  states,
  metrics,
  metricLinks,
  crumb,
  exportCsv,
  submitButton,
  showDialog,
  closeDialog,
  toast,
} from './ui.js';
import { actualPay, confirmedPay, detailsPath, referencePay, studioIncomePanel, teacherComparison } from './comparison.js';

const columnNames = {
  id: '编号',
  day: '业务日期',
  clock: '时间',
  students: '学生',
  student: '学生编号',
  student_name: '学生',
  teacher: '授课老师',
  type: '课型',
  course: '课程',
  pack: '课包',
  scene: '场次编号',
  minutes: '分钟',
  present: '到课人次',
  units: '权益次数',
  kind: '类型',
  amount: '金额',
  method: '方式',
  origin: '流水来源',
  teacher_fee: '老师课酬',
  fee_basis: '课酬依据',
  net_cash: '净收款',
  value: '消课金额',
  earned: '课酬',
  paid: '其中已付',
  unpaid: '其中未付',
  reason: '依据',
  note: '备注',
  status: '核对状态',
  name: '姓名',
  price: '成交金额',
  average: '有效均价',
  debt: '已确认欠费',
  receipt_review: '收款待核',
  remaining: '剩余次数',
  total_units: '课包总节数',
  used: '已用课时',
  remaining_value: '剩余价值',
  final: '最终课酬',
  source: '原表课酬',
  calculated: '参考课酬',
  difference: '差额',
  state: '出勤',
  explanation: '核对说明',
  lesson: '授课明细',
  taught_day: '实际授课日',
  line: '学生记录',
  reviewer: '确认人',
  settlement: '结算单',
  actor: '操作人',
  at: '时间',
  action: '操作',
  ref: '对象',
  detail: '详情',
  scope: '金额口径',
  content: '本节内容',
  next_focus: '下次重点',
  since: '登记日期',
  until_day: '截止',
  contract: '合同变化',
  history: '期初历史',
  source_value: '原表消课',
  source_fee: '原表课酬',
};
const currency = new Set(
  'amount net_cash value earned price average debt receipt_review remaining_value final source calculated difference paid unpaid contract source_value source_fee teacher_fee'.split(
    ' ',
  ),
);
const labels = {
  receipt: '学费收款',
  refund: '退款',
  payment: '实际付款',
  opening: '期初',
  purchase: '购课',
  contract_confirmation: '确认课包应收金额',
  use: '消课',
  use_reversal: '冲回消课',
  transfer_in: '权益转入',
  transfer_out: '权益转出',
  earning: '授课课酬',
  fee: '授课课酬',
  adjustment: '关联调整',
  reversal: '冲回',
  student: '逐学生',
  session: '整场',
  unknown: '待核',
  weekly: '周合计',
};
const titles = {
  studio_income: '琴行总收入明细',
  cashflow: '实收实付明细',
  lessons: '授课记录',
  cash: '学费流水',
  consumption: '消课记录',
  fees: '课酬核对',
  earnings: '课酬应得与分配',
  payments: '实际付款',
  payables: '累计应付明细',
  retention: '确认留存明细',
  pending_lines: '扣课待核',
  packages: '课包与余额',
  historical_cash: '期初前收付',
  audit: '操作日志',
};
const cols = {
  studio_income: ['day', 'students', 'teacher', 'value', 'teacher_fee', 'amount', 'fee_basis', 'pack', 'lesson'],
  cashflow: ['day', 'kind', 'student', 'teacher', 'amount', 'pack', 'lesson', 'method'],
  cash: ['day', 'student', 'pack', 'kind', 'amount', 'method', 'reason'],
  consumption: ['day', 'taught_day', 'teacher', 'student', 'pack', 'units', 'amount', 'lesson'],
  fees: ['day', 'students', 'teacher', 'calculated', 'final', 'status', 'pack', 'lesson'],
  earnings: ['day', 'teacher', 'kind', 'amount', 'paid', 'unpaid', 'lesson'],
  payables: ['day', 'teacher', 'kind', 'amount', 'paid', 'unpaid', 'settlement', 'lesson'],
  payments: ['day', 'teacher', 'amount', 'method', 'settlement', 'lesson'],
  retention: ['day', 'teacher', 'value', 'earned', 'amount', 'lesson'],
  pending_lines: ['day', 'teacher', 'student', 'state', 'units', 'explanation', 'lesson'],
  packages: ['student_name', 'id', 'since', 'course', 'price', 'total_units', 'used', 'remaining', 'remaining_value', 'debt', 'receipt_review'],
  historical_cash: ['day', 'kind', 'pack', 'teacher', 'amount', 'method', 'reason'],
  audit: ['at', 'actor', 'action', 'ref', 'detail'],
};
function cell(row, k, asof) {
  const val = k === 'unpaid' ? row.amount - row.paid : row[k];
  if (val == null && row.fee_basis && (k === 'teacher_fee' || k === 'amount')) return '待核';
  if (k === 'lesson') return val ? link('record', '查看', { id: val }) : '—';
  if ((k === 'pack' && val && admin()) || (k === 'id' && row.member_ids))
    return link('pack', val, { id: val, asof });
  if (k === 'day' && row.lesson) return link('record', val, { id: row.lesson });
  if (val == null)
    return currency.has(k) && ['source', 'final', 'calculated', 'difference'].includes(k)
      ? k === 'source' || k === 'difference'
        ? '—'
        : '待核'
      : '—';
  if (currency.has(k)) return `<span class="num">${yuan(val)}</span>`;
  if (['units','remaining','total_units','used'].includes(k)) return qty(val);
  if (k === 'teacher') return esc(teacher(val));
  if (k === 'type') return esc(types[val] || val);
  if (k === 'state') return esc(states[val] || val);
  if (k === 'status') return badge(val);
  if (k === 'student') return admin() ? link('profile', row.student_name || val, { id: val, asof }) : esc(row.student_name || val);
  if (k === 'kind' || k === 'scope') return esc(labels[val] || val);
  if (k === 'detail') return `<details><summary>查看</summary><p class="break">${esc(val)}</p></details>`;
  return esc(val) || '—';
}
export function rowsTable(rows, columns, custom = {}, asof) {
  return table(
    columns.map((k) => custom[k] || columnNames[k] || k),
    rows.map((r) => columns.map((k) => cell(r, k, asof))),
  );
}
const exportLink = (kind, p = {}) =>
  admin()
    ? btn('export', '导出 CSV', {
        glyph: 'export',
        style: 'btn small',
        attrs: 'data-query="' + esc(new URLSearchParams({ ...p, kind }).toString()) + '"',
      })
    : '';
actions.export = (el) => exportCsv(Object.fromEntries(new URLSearchParams(el.dataset.query)));
function lessonTable(rows, asof) {
  const lines = (people, show) => people.map(show).join('<br>') || '—';
  return table(['上课日期', '学员', '课程', '时长', '主带老师', '实际老师', '课包', '扣课（节）', '状态'],
    [...rows].reverse().map((r) => [
      link('record', [r.day, r.clock].filter(Boolean).join(' '), { id: r.id }),
      lines(r.participants, (s) => admin() ? link('profile', s.name, { id: s.student, asof }) : esc(s.name)),
      esc(r.course) + '<small class="cell-note">' + esc(types[r.type]) + '</small>',
      r.minutes + ' 分钟',
      lines(r.participants, (s) => esc(teacher(s.main_teacher))),
      person(r.teacher) + (r.substitute ? tag('代课', 'olive') : ''),
      lines(r.participants, (s) => s.pack ? (admin() ? link('pack', s.pack, { id: s.pack, asof }) : esc(s.pack)) : '—'),
      lines(r.participants, (s) => s.status === 'pending' ? '待核' : qty(s.units)),
      r.active === 0 ? tag('历史版本') : r.history ? tag('已含期初') : tag(r.taught ? '已实授' : '未实授', r.taught ? 'green' : ''),
    ]), '此期间暂无符合条件的授课记录');
}
const tabs = (base, items, current, p = {}) =>
  `<div class="tabs">${Object.entries(items)
    .map(([k, v]) => link(base, v, { ...p, tab: k }, k === current ? 'tab active' : 'tab'))
    .join('')}</div>`;
export const entry = (id, name, attrs = '', style = 'btn small') =>
  btn('entry', name, { id, style, attrs });
pages.lessons = async (p) => {
  const tab = p.tab || 'lessons',
    q = { ...session.filter, kind: tab },
    more = admin()
      ? link('batches', '导入批次', {}, 'btn', 'layers') + link('import', '导入周表', {}, 'btn', 'import')
      : '';
  if (tab === 'lessons') for (const key of ['q','coverage','include_versions','only']) {
    if (p[key]) q[key] = p[key];
  }
  const r = await read('details', q);
  const filters = tab === 'lessons' ? `<form class="search-form" data-form="lesson-search">
    ${field('q','学员',{ value:p.q, attrs:'placeholder="姓名或学生编号"' })}
    ${admin() ? field('teacher','实际老师',{ value:q.teacher, options:[['','全部老师'],...teacherOptions()] }) : ''}
    ${field('coverage','授课归属',{ value:p.coverage, options:[['','全部授课'],['substitute','只看代课']] })}
    ${field('include_versions','记录版本',{ value:p.include_versions, options:[['','有效记录'],['1','含已更正版本']] })}
    ${submitButton('查询')}</form>` : '';
  return (
    head(
      '课时记录',
      '按实际授课日期查找场次和核对记录',
      more + (canRecord() ? link('manual', '手动记课', {}, 'btn primary', 'plus') : ''),
    ) +
    scopeBar(r) +
    tabs(
      'lessons',
      { lessons: '授课场次', consumption: '学生消课', fees: '课酬核对', pending_lines: '扣课待核' },
      tab, { ...session.filter, q:p.q, coverage:p.coverage, include_versions:p.include_versions },
    ) +
    filters +
    panel(
      titles[tab] || '记录',
      tab === 'lessons' ? lessonTable(r.rows, r.end) : rowsTable(r.rows, cols[tab] || [], {}, r.end),
      tag(r.rows.length + ' 条') + ' ' + (tab === 'lessons' && admin()
        ? btn('export', '导出学生授课行', {
            glyph: 'export',
            style: 'btn small',
            attrs: 'data-query="' + esc(new URLSearchParams({ ...q, kind: 'attendance' }).toString()) + '"',
          }) + ' '
        : '') + exportLink(tab, q),
    )
  );
};
forms['lesson-search'] = (f) => {
  const data = values(f);
  go('lessons', { ...session.filter, ...data, tab:'lessons' });
};
pages.details = async (p) => {
  const q = { ...(p.period || p.start || p.end ? {} : session.filter), ...p, kind: p.kind || 'lessons' },
    r = await read('details', q);
  const kind = r.kind;
  const cashHeadings = { receipt:'已到账学费', refund:'已退款', payment:'已发课酬' };
  const heading = (kind === 'cashflow' && cashHeadings[q.flow]) || (kind === 'studio_income' && q.flow === 'lesson_fees' && '扣除的老师课酬') || {
    registered: '课包登记明细', receipt_review: '课包收款待核', reference: '参考课酬明细',
    receipts: '已确认到账明细', refunds:'学费退款明细'
  }[q.flow] || (q.coverage === 'substitute' ? '代课记录' : titles[kind]);
  const toggle = q.kind === 'lessons' ? link('details', q.coverage ? '查看全部授课' : '只看代课',
    { ...q, coverage:q.coverage ? '' : 'substitute' }, 'btn small') : '';
  const net = r.totals
    ? tag('合计 ' + yuan(q.flow === 'lesson_fees' ? r.totals.lesson_fees : r.totals.studio_income),
        r.totals.income_missing ? 'amber' : 'green') : '';
  const labels = kind === 'studio_income' ? {day:'消课入账日',amount:'琴行收入'} : {};
  return (
    crumb('home', '经营总览') +
    head(
      heading || '来源明细',
      [q.teacher && teacher(q.teacher), [r.start, r.end].filter(Boolean).join(' 至 ')].filter(Boolean).join(' · '),
      exportLink(q.kind, q),
    ) +
    panel(
      '原始明细',
      kind === 'lessons' ? lessonTable(r.rows, r.end) : rowsTable(r.rows, cols[kind] || [], labels, r.end),
      `<div class="actions">${net}${tag(r.rows.length + ' 条')}${toggle}</div>`,
    )
  );
};
pages.students = async (p) => {
  const items = await read('students', p);
  const filters = `<form class="search-form" data-form="students">${p.asof ? `<input type="hidden" name="asof" value="${esc(p.asof)}">` : ''}<label class="search-box">${icon('search')}<input name="q" aria-label="搜索姓名或编号" placeholder="搜索姓名或学生编号" value="${esc(p.q)}"></label>${admin() ? field('main_teacher', '主带老师', { options: [['', '全部老师'], ...teacherOptions()], value: p.main_teacher }) : ''}${field('type', '课型', { options: [['', '全部课型'], ...Object.entries(types)], value: p.type })}${field('status', '状态', { options: [['', '全部状态'], '在读', '暂停', '结课', '待确认'], value: p.status })}${field('course', '科目', { value: p.course, attrs: 'placeholder="全部科目"' })}${submitButton('查询')}</form>`;
  const studentName = (s) =>
    `<a class="person person-link" href="${esc(path('profile', { id: s.id, asof:p.asof }))}">${avatar(s.name, s.main_teacher)}<span><b>${esc(s.name)}</b><small>${esc(s.id)}</small></span></a>`;
  const wide = table(
    [
      '学生',
      '主带老师',
      '课程',
      '剩余课时',
      '最近上课',
      ...(admin() ? ['收款情况'] : []),
      '在读状态',
    ],
    items.map((s) => [
      studentName(s),
      esc(teacher(s.main_teacher)),
      esc(s.package_courses.join("、") || s.course),
      qty(s.solo + s.duo) + ' 节' + (s.shared_package ? tag('含共用课包') : '')
        + (s.duo ? `<small class="cell-note">一对一 ${qty(s.solo)} · 一对二 ${qty(s.duo)}</small>` : ''),
      esc(s.latest || '暂无'),
      ...(admin() ? [[s.debt ? '欠费 ' + yuan(s.debt) : '', s.receipt_review ? '待核 ' + yuan(s.receipt_review) : ''].filter(Boolean).join(' · ') || (s.receipts_complete ? '已收齐' : '—')] : []),
      tag(s.status, 'green'),
    ]),
    '没有符合条件的学生',
  );
  const mobile =
    items
      .map(
        (s) =>
          `<a class="student-card" href="${esc(path('profile', { id: s.id, asof:p.asof }))}"><div>${avatar(s.name, s.main_teacher)}<span><strong>${esc(s.name)}</strong><small>${esc(s.package_courses.join("、") || s.course)} · ${esc(teacher(s.main_teacher))}</small></span>${icon('chevron')}</div><p>余 <b>${qty(s.solo+s.duo)}</b> 节${s.shared_package ? '（含共用）' : ''}<span>最近上课 ${esc(s.latest || '暂无')}</span></p></a>`,
      )
      .join('') || empty('没有符合条件的学生');
  return (
    head(
      '学生档案',
      p.asof ? '课包余额与最近上课统计至 ' + p.asof : '查看主带老师、课包余额和教学记录',
      admin() ? entry('student', '新建学生', '', 'btn primary') : '',
    ) +
    filters +
    panel(
      '学生名册',
      `<div class="desktop-table">${wide}</div><div class="mobile-cards">${mobile}</div>`,
      `<div class="actions">${tag(items.length + ' 人')}${exportLink('students', p)}</div>`,
    )
  );
};
forms.students = (f) => go('students', values(f));
function packCard(pk, asof, open = true) {
  const total = pk.total_units;
  const split = pk.split_unknown ? '正课和赠课未分列'
    : '正课 ' + qty(pk.paid_units) + ' 节 · 赠课 ' + qty(pk.gift_units) + ' 节';
  const receipt = pk.receipt_review != null ? '原收款待核 ' + yuan(pk.receipt_review)
    : !pk.opening && pk.price > 0 && pk.net_cash === pk.price && pk.debt === 0 ? '已收齐 ' + yuan(pk.net_cash)
    : (pk.opening ? '启用后净收 ' : '累计净收 ') + yuan(pk.net_cash);
  const original = pk.opening && pk.original_price != null ? ' · 原合同 ' + yuan(pk.original_price) : '';
  const fraction = total ? Math.min(100, Math.max(0, 100 * pk.remaining / total)) : 0;
  const members = pk.member_ids.length > 1 ? `<p>共用学员 · ${esc(pk.student_name)}</p>` : '';
  const finances = admin() ? `<p>${pk.opening ? '期初余值' : '登记金额'} ${yuan(pk.price)}${original} · 均价 ${yuan(pk.average)}<br>${receipt}${pk.debt ? ' · 已确认欠费 ' + yuan(pk.debt) : ''}<br>剩余价值 ${yuan(pk.remaining_value)}</p>` : '';
  return `<article class="pack"><div class="pack-top"><span class="tile-icon">${icon('book')}</span><div>
    <h3>${esc(pk.course)} · ${esc(types[pk.type])}</h3><small>${esc(pk.id)}</small></div></div>
    <div class="pack-number"><strong>${qty(pk.remaining)}</strong> 节剩余 <small>${pk.opening ? '启用后已用' : '已用'} ${qty(pk.used)} 节</small></div>
    <div class="track"><i style="width:${fraction}%"></i></div>
    <p>课包共 ${qty(total)} 节 · ${split}</p>${members}${finances}
    ${pk.opening ? `<p>期初前已登记扣课 ${qty(pk.historical_used)} 节</p>` : ''}
    <p>${pk.opening ? '期初截至' : '统计缴费日'} ${esc(pk.since)}${pk.until_day ? ' · 到期 ' + esc(pk.until_day) : ''}</p>
    ${open ? link('pack','课包明细',{id:pk.id,asof}) : ''}</article>`;
}
pages.pack = async ({ id, asof = session.meta.today }) => {
  const [pk] = await read('packages', { pack:id, asof });
  if (!pk) throw Error('所选日期没有此课包');
  const scope = { period:'all', anchor:asof, pack:id };
  const [used, cash] = await Promise.all([read('details', { ...scope, kind:'lessons' }),
    admin() ? read('details', { ...scope, kind:'cash' }) : null]);
  const names = pk.student_name.split('、');
  const members = pk.member_ids.map((sid,i) => link('profile',names[i] || sid,{ id:sid, asof })).join('、');
  return crumb('students','学生档案',{asof}) + head('课包详情',pk.id + ' · 截至 ' + asof)
    + panel('课包与缴费',packCard(pk,asof,false),members)
    + panel('上课记录',lessonTable(used.rows,asof),tag(used.rows.length + ' 条'))
    + (cash ? panel('收退款记录',rowsTable(cash.rows,cols.cash,{},asof),tag(cash.rows.length + ' 笔')) : '');
};
pages.profile = async ({ id, asof }) => {
  const d = await read('profile', { id, asof }), s = d.student;
  const raw = 'data-ref="' + esc(s.id) + '"';
  const packages = d.packages.map(pk => packCard(pk, d.asof)).join('');
  const rec = table(
    ['上课日期', '课程', '时长', '主带老师', '实际老师', '出勤', '扣课（节）', '课包', '消课金额', '本节内容 / 下次重点'],
    d.records.map((r) => [
      r.id ? link('record', r.day + ' ' + r.clock, { id: r.id }) : esc(r.day + ' ' + r.clock),
      esc(r.course),
      r.minutes + ' 分钟',
      esc(teacher(r.main_teacher)),
      esc(teacher(r.teacher)) + (r.main_teacher && r.main_teacher !== r.teacher ? tag('代课','olive') : ''),
      esc(states[r.state]),
      r.status === 'pending' ? '待核' : qty(r.units),
      r.pack && admin() ? link('pack', r.pack, {id:r.pack,asof:d.asof}) : esc(r.pack || '待核'),
      r.history ? '已含期初' : 'value' in r ? yuan(r.value) : '—',
      esc([r.content, r.next_focus].filter(Boolean).join(' / ') || '—'),
    ]),
  );
  const packageLeads = new Map(d.packages.map((pk) => [pk.id, pk.main_at_sale]));
  const leads = [...new Set(d.packages.filter((pk) => pk.main_at_sale).map((pk) => pk.course + ' · ' + teacher(pk.main_at_sale)))];
  const substitutes = [...new Set(d.records.filter((r) => packageLeads.get(r.pack) && packageLeads.get(r.pack) !== r.teacher).map((r) => teacher(r.teacher)))];
  const detailInfo = [
    s.id,
    s.category,
    s.course,
    leads.length > 1 ? '各课包主带 ' + leads.join('、') : '主带 ' + teacher(s.main_teacher),
    substitutes.length ? '历次代课 ' + substitutes.join('、') : '',
    s.substitute_teacher && '临时代课 ' + teacher(s.substitute_teacher),
    s.status,
    s.enrolled && '入学 ' + s.enrolled,
    s.contact && '联系 ' + s.contact,
  ]
    .filter(Boolean)
    .join(' · ');
  const tab = route().params.tab || (d.archived_cash.length && !d.cash.length ? 'history' : 'cash');
  let billingRows;
  if (tab === 'history') {
    billingRows = rowsTable(d.archived_cash, ['day', 'kind', 'pack', 'amount', 'method'], {}, d.asof)
      + table(['历史实际老师','已登记扣课次数','有依据的历史消课','有依据的历史课酬'],
          d.historical_lessons.map(r => [esc(teacher(r.teacher)),qty(r.units),yuan(r.source_value),yuan(r.source_fee)]));
  } else if (tab === 'events') {
    billingRows = rowsTable(d.events, ['at', 'action', 'note']);
  } else if (tab === 'changes') {
    billingRows = rowsTable(d.changes, ['day','kind','units','value','reason'], {value:'价值变化'}, d.asof);
  } else {
    billingRows = rowsTable(d.cash, ['day','kind','pack','amount','method','reason'], {}, d.asof);
  }
  const billingHistory = tabs('profile',
    { cash:'收退款', changes:'权益变动', history:'期初前收付与课酬', events:'档案变更' }, tab, { id, asof }) + billingRows;
  return (
    crumb('students', '学生档案', {asof}) +
    head(
      s.name,
      detailInfo,
      (admin()
        ? entry('student', '编辑档案', raw) + entry('package', '购课 / 续费', raw, 'btn primary')
        : '') + (canRecord() ? link('manual', '记一节课', { student: id }, 'btn', 'plus') : ''),
    ) +
    panel(
      '学员档案',
      metrics([
        ['累计到课', d.records.filter((r) => r.state === 'present').length + ' 次'],
        ['最近上课', d.records.find((r) => r.state === 'present')?.day || '暂无'],
        ['关联课包', d.packages.length + ' 个'],
        ['可用课时（含共用）', qty(d.packages.reduce((n,pk) => n + pk.remaining, 0)) + ' 节'],
        ...(admin() ? [['已确认欠费', yuan(d.packages.reduce((v, p) => v + (p.student === id ? p.debt : 0), 0))]] : []),
        ...(admin() && d.packages.some((p) => p.student === id && p.receipt_review != null)
          ? [['课包收款待核', yuan(d.packages.reduce((v, p) => v + (p.student === id ? p.receipt_review || 0 : 0), 0))]]
          : []),
      ]),
    ) +
    panel(
      '课包与缴费',
      (packages ? `<div class="packs">${packages}</div>` : empty('尚未建立课包')) +
        (admin() ? billingHistory : ''),
      admin() ? entry('opening', '登记期初课包', raw) : '',
    ) +
    panel(
      '上课记录',
      rec,
      tag(d.records.length + ' 条') +
        ' ' +
        exportLink('attendance', {
          student: id,
          start: d.records.at(-1)?.day || s.enrolled || session.meta.activation,
          end: d.records[0]?.day || session.meta.today,
        }),
    )
  );
};
pages.teachers = async () => {
  const r = await read('report', session.filter),
    cards = r.compare
      .map((t) => {
        const info = session.meta.teachers.find((x) => x.id === t.id),
          rule = info.rules.find((x) => x.since <= r.end);
        const payLabel = t.income_to_studio ? '本期消课归琴行' : '本期参考课酬';
        const shareLabel = t.income_to_studio ? '琴行 100%' : '期末分成 ' + (rule ? rule.bp / 100 + '%' : '待核');
        return `<a class="teacher-card" href="${esc(path('teacher', { ...session.filter, id: t.id }))}"><header>${avatar(t.name, t.id)}<div><h3>${esc(t.name)}</h3><small>${esc([info.subject, info.audience].filter(Boolean).join(' · ') || '授课老师')}</small></div>${icon('chevron')}</header><div class="teacher-pay"><small>${payLabel}</small><strong>${t.income_to_studio ? yuan(t.value) : referencePay(t)}</strong>${t.pending_fees ? tag(t.pending_fees + ' 笔待核', 'amber') : ''}</div><footer><span>${t.scenes} 节 · 其中代课 ${t.substitutes} 节</span><span>${shareLabel}</span></footer></a>`;
      })
      .join('');
  return (
    head(admin() ? '老师收入' : '我的收入', '课量和课酬按实际上课老师归属') +
    scopeBar(r) +
    `<div class="teacher-grid">${cards}</div>` +
    teacherComparison(r, session.filter)
  );
};
pages.teacher = async ({ id }) => {
  const t = session.meta.teachers.find((v) => v.id === id);
  if (!t) throw Error('当前账号无法查看此老师');
  const q = { ...session.filter, teacher: id };
  const [r, fees, classes] = await Promise.all([
    read('report', q), read('details', { ...q, kind: 'fees' }),
    read('details', { ...q, kind:'lessons', only:'taught' }),
  ]);
  const s = r.stats;
  return (
    crumb('teachers', '老师收入') +
    head(
      t.name,
      [t.subject, t.audience].filter(Boolean).join(' · ') || '授课记录与收入明细',
      admin() ? entry('teacher_profile', '编辑档案', 'data-ref="' + esc(id) + '"') : '',
    ) +
    scopeBar(r) +
    (t.income_to_studio ? panel('收入归属', metricLinks([
      ['消课收入全额归琴行',yuan(s.value),detailsPath(q,'consumption'),'含代课，按实际授课老师归属'],
      ['外发课酬',yuan(s.actual_paid),detailsPath(q,'payments'),'按实际付款日'],
    ])) : panel('本期课酬',metricLinks([
      ['参考课酬',referencePay(s),detailsPath(q,'fees',{flow:'reference'}),'按逐节记录试算'],
      ['已确认应付',confirmedPay(s),!s.earned_entries && s.pending_fees ? detailsPath(q,'fees',{state:'pending'}) : detailsPath(q,'earnings'),'按应付入账日期'],
      ['实际已付',actualPay(s),detailsPath(q,'payments'),'按付款日期'],
      ['累计待付款',yuan(s.payable),detailsPath(q,'payables'),'仅含已确认应付'],
    ]))) +
    panel('期间课量', metricLinks([
      ['已上课时',s.scenes + ' 节',detailsPath(q,'lessons',{only:'taught'})],
      ['其中代课',s.substitutes + ' 节',detailsPath(q,'lessons',{only:'taught',coverage:'substitute'})],
      ['授课时长',s.minutes + ' 分钟',detailsPath(q,'lessons',{only:'taught'})],
      ['消课金额',yuan(s.value),detailsPath(q,'consumption')],
    ])) +
    panel('上课记录',lessonTable(classes.rows,r.end),tag(classes.rows.length + ' 条')) +
    panel('逐节课酬', rowsTable(fees.rows,cols.fees,{},r.end),exportLink('fees',q)) +
    panel(
      '实际付款与分配',
      link('details', '查看付款明细', { ...q, kind: 'payments' }, 'btn', 'accounts') +
        ' ' +
        link('details', '查看应得及其中已付', { ...q, kind: 'earnings' }, 'btn'),
    ) +
    panel(
      '分成规则',
      table(
        ['生效日期', '教师分成', '琴行分成'],
        t.rules.map((v) => [esc(v.since), v.bp / 100 + '%', (10000 - v.bp) / 100 + '%']),
      ),
      owner() && !t.income_to_studio ? entry('rule', '新增分成版本', 'data-ref="' + esc(id) + '"') : '',
    )
  );
};
pages.accounts = async (p) => {
  const isAdmin = admin(),
    tab = p.tab || (isAdmin ? 'cash' : 'earnings'),
    opt = isAdmin
      ? {
          cash: '学费收退',
          packages: '学生欠费',
          fees: '待核课酬',
          earnings: '已确认应付',
          bills: '结算单',
          payments: '实际付款',
          historical_cash: '期初前收付',
        }
      : { fees:'待核课酬', earnings: '本人应得', bills: '本人结算单', payments: '实际付款' };
  if (!(tab in opt)) throw Error('无权访问此类账目');
  const q = { ...session.filter, kind: tab, ...(tab === 'packages' ? { flow: 'debt' } : {}), ...(tab === 'fees' ? {state:'pending'} : {}) },
    r = await read('report', session.filter);
  const rows =
    tab === 'bills' ? await read('bills', { teacher: q.teacher || '' }) : (await read('details', q)).rows;
  const bills = tab === 'bills' ? rows.filter((b) => b.day >= r.start && b.day <= r.end) : [];
  const data =
    tab === 'bills'
      ? table(
          ['确认日期', '老师', '授课期间', '已结算金额', '待核未纳入', '明细'],
          bills.map((b) => [
            esc(b.day),
            person(b.teacher),
            esc(b.start + ' ~ ' + b.end),
            yuan(b.snapshot.total),
            b.snapshot.excluded.length + ' 笔',
            btn('bill', '查看结算单', { id: b.id, style: 'text-button' }),
          ]),
        )
      : rowsTable(rows, cols[tab], {}, r.end);
  return (
    head(
      '账目管理',
      isAdmin ? '按实际收付日期查账，独立核对教师结算与付款' : '查看本人课酬与付款分配',
      isAdmin ? entry('receipt', '记收款') + entry('settle', '老师结算', '', 'btn primary') : '',
    ) +
    scopeBar(r) +
    (isAdmin ? studioIncomePanel(r, session.filter) : '') +
    (isAdmin ? panel('学费与课包', metricLinks([
      ['本期课包登记金额',yuan(r.stats.registered),detailsPath(session.filter,'packages',{flow:'registered'}),'按课包统计缴费日'],
      ['本期已确认到账',yuan(r.stats.receipts),detailsPath(session.filter,'cash',{flow:'receipts'}),'纸卡按确认的统计缴费日归期'],
      ['本期消课金额',yuan(r.stats.value),detailsPath(session.filter,'consumption'),'按消课流水'],
      ['期末收款待核',yuan(r.stats.receipt_review),detailsPath(session.filter,'packages',{flow:'receipt_review'}),r.stats.receipt_review ? '原课包到账情况待核实' : '无待核收款'],
      ['本期退款',yuan(r.stats.refunds),detailsPath(session.filter,'cash',{flow:'refunds'})],
      ['期末已确认欠费',yuan(r.stats.debt),detailsPath(session.filter,'packages',{flow:'debt'})],
    ])) : '') +
    panel('老师课酬与付款',metricLinks([
      ['本期待核课酬',r.stats.pending_fees && !r.stats.pending_reference_count ? '待核' : yuan(r.stats.pending_reference),detailsPath(session.filter,'fees',{state:'pending'}),r.stats.pending_fees + ' 笔待核 · 已有试算金额合计'],
      ['本期已确认应付',confirmedPay(r.stats),!r.stats.earned_entries && r.stats.pending_fees ? detailsPath(session.filter,'fees',{state:'pending'}) : detailsPath(session.filter,'earnings'),'按应付入账日期'],
      ['本期实际已付',actualPay(r.stats),detailsPath(session.filter,'payments'),'按付款日期'],
      ['期末待付款',yuan(r.stats.payable),detailsPath(session.filter,'payables'),'已确认应付减已分配付款'],
    ])) +
    tabs('accounts', opt, tab, session.filter) +
    panel(opt[tab], data, tab === 'bills' ? '' : exportLink(tab, q)) +
    (isAdmin
      ? panel(
          '登记收付',
          `<div class="action-list">${[
            ['receipt', '学费补款'],
            ['refund', '退款与退课'],
            ['convert', '转课 / 追加赠课'],
            ['pay', '登记实际付款'],
            ['opening_payable', '教师期初待付'],
            ['archive_cash', '补录期初前收付'],
          ]
            .map(([k, v]) => entry(k, v))
            .join('')}</div>`,
        )
      : '')
  );
};
actions.bill = async (el) => {
  const b = (await read('bills')).find((v) => v.id === el.dataset.id);
  if (!b) throw Error('结算单不存在');
  showDialog(
    '结算单 · ' + teacher(b.teacher),
    `<p>${esc(b.start)} 至 ${esc(b.end)} · ${esc(b.day)} 确认</p>${metrics([
      ['已确认结算', yuan(b.snapshot.total)],
      ['待核未纳入', b.snapshot.excluded.length + ' 笔'],
    ])}${rowsTable(b.snapshot.items, ['day', 'kind', 'amount', 'lesson'])}${b.snapshot.excluded.length ? rowsTable(b.snapshot.excluded, ['day', 'lesson', 'reason']) : ''}<div class="form-foot">${exportLink('bill', { id: b.id })}${admin() ? entry('pay', '登记本单付款', 'data-ref="' + esc(b.teacher) + '" data-bill="' + esc(b.id) + '"') : ''}</div>`,
  );
};
pages.record = async ({ id }) => {
  const d = await read('lesson', { id });
  const rows = d.lines.map((r) => [
    admin() ? link('profile', r.name, { id: r.student }) : esc(r.name),
    r.pack && admin() ? link('pack',r.pack,{id:r.pack}) : esc(r.pack || '待核'),
    esc(teacher(r.main_teacher)) + (r.main_teacher && r.main_teacher !== d.teacher ? tag('代课','olive') : ''),
    esc(states[r.state]),
    qty(r.units),
    d.history ? '已含期初' : yuan(r.value),
    r.bp == null ? '待核' : r.bp / 100 + '%',
    badge(r.status),
    esc([r.content, r.next_focus].filter(Boolean).join(' / ') || '—'),
    admin() && d.active && r.status === 'pending'
      ? entry(
          'resolve_line',
          '补核',
          'data-ref="' + esc(r.id) + '" data-student="' + esc(r.student) + '"',
        ) + (!r.arrear ? entry('arrear', '登记欠课', 'data-ref="' + esc(r.id) + '"') : '')
      : '—',
  ]);
  const fs = d.fees.map((f) => [
    esc(labels[f.scope] || f.scope),
    f.source == null ? esc(JSON.parse(f.source_values).map(yuan).join(' / ') || '—') : yuan(f.source),
    f.calculated == null ? '待核' : yuan(f.calculated),
    f.difference == null ? '—' : yuan(f.difference),
    d.history ? '已含期初' : yuan(f.final),
    badge(f.status),
    esc(f.reason || '—'),
    esc(f.reviewer || '—'),
    admin() && f.status === 'pending' && d.active
      ? entry('review_fee', '核对课酬', 'data-ref="' + esc(f.id) + '"')
      : '—',
  ]);
  const controls =
    admin() && d.active
      ? link('manual', '更正场次', { correct: id }, 'btn', 'book') +
        entry('correct', '关联冲回', 'data-ref="' + esc(id) + '"')
      : !admin() && d.active
        ? entry('request_change', '申请更正', 'data-ref="' + esc(id) + '"')
        : '';
  return (
    crumb('lessons', '课时记录') +
    head(
      teacher(d.teacher) + ' · ' + (types[d.type] || d.type),
      [
        d.day + ' ' + d.clock,
        d.course,
        d.minutes + ' 分钟',
        d.scene || d.id,
        d.active ? '有效场次' : '已更正版本',
      ].join(' · '),
      controls,
    ) +
    panel(
      '出勤与扣课',
      table(
        ['学生', '对应课包', '主带老师', '出勤', '扣课次数', '消课金额', '教师分成', '状态', '教学记录', '操作'],
        rows,
      ),
    ) +
    panel(
      '课酬核对',
      table(['口径', '原表金额', '参考课酬', '差额', '最终确认', '状态', '原因', '确认人', '操作'], fs),
    ) +
    panel(
      '应付款与实际分配',
      rowsTable(d.payables, ['day', 'kind', 'amount', 'paid', 'unpaid', 'settlement']) +
        (d.allocations.length ? rowsTable(d.allocations, ['day', 'method', 'amount']) : ''),
    ) +
    panel(
      '记录追溯',
      `<div class="evidence">${d.history ? '<p>历史展示，已包含期初。</p>' : ''}${d.batch ? link('import', '查看原始导入批次', { batch: d.batch }) : '<p>来源为手动记课。</p>'}${(d.evidence || []).map((x) => `<p>来源行 ${esc(x.row_key)} · ${esc(x.status)}</p>`).join('')}${d.versions.map((v) => `<p>${link('record', v.id, { id: v.id })} · ${v.active ? '现行版本' : '原始版本'} ${esc(v.change_note)}</p>`).join('')}${d.dependencies ? `<p>后续权益变动 ${d.dependencies.movements?.length || 0} 条 · 已结算 ${d.dependencies.settled?.length || 0} 笔 · 已付款 ${d.dependencies.payments?.length || 0} 笔</p>` : ''}</div>`,
    )
  );
};
pages.settings = async () => {
  const m = session.meta;
  const controls = owner() ? entry('new_account', '创建账号', '', 'btn primary') : '';
  let auth = '';
  if (owner()) {
    const users = await read('accounts');
    auth = panel(
      '账号与授权',
      table(
        ['账号', '角色', '关联老师', '记课权限', '操作'],
        users.map((a) => [
          esc(a.id),
          esc(roles[a.role]),
          esc(teacher(a.teacher)),
          a.role !== 'teacher' || a.can_record ? '可记课' : '只读',
          a.role === 'teacher' ? entry('access', '配置', 'data-ref="' + esc(a.id) + '"') : '—',
        ]),
      ),
      controls,
    );
  }
  return (
    head('系统设置', '账号权限、提醒与操作记录') +
    panel(
      '当前账套',
      metrics([
        ['类型', m.mode === 'demo' ? '模拟账套' : '业务账套'],
        ['启用日', m.activation],
        ['当前账号', m.account.id],
        ['角色', roles[m.account.role]],
      ]),
      btn('change-password', '修改密码', { style: 'btn small' }),
    ) +
    auth +
    (admin()
      ? panel(
          '跟进提醒',
          metrics([
            ['低余额阈值', m.low + ' 次'],
            ['未上课提醒', m.idle + ' 天'],
          ]),
          entry('settings', '调整阈值'),
        ) +
        panel('操作日志', rowsTable((await read('audit')).slice(0, 100), cols.audit), exportLink('audit'))
      : '') +
    panel('登录', btn('logout', '退出当前账号', { glyph: 'logout' }))
  );
};
