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
  crumb,
  exportCsv,
  submitButton,
  showDialog,
  closeDialog,
  toast,
} from './ui.js';

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
  remaining_value: '剩余价值',
  final: '最终课酬',
  source: '原表课酬',
  calculated: '系统课酬',
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
  since: '起日',
  until_day: '截止',
  contract: '合同变化',
  history: '期初历史',
  source_value: '原表消课',
  source_fee: '原表课酬',
};
const currency = new Set(
  'amount net_cash value earned price average debt receipt_review remaining_value final source calculated difference paid unpaid contract source_value source_fee'.split(
    ' ',
  ),
);
const labels = {
  receipt: '学费收款',
  refund: '退款',
  payment: '实际付款',
  opening: '期初',
  purchase: '购课',
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
  cash: ['day', 'student', 'pack', 'kind', 'amount', 'method', 'reason'],
  consumption: ['day', 'taught_day', 'teacher', 'student', 'pack', 'units', 'amount', 'lesson'],
  fees: ['day', 'teacher', 'scope', 'source', 'calculated', 'difference', 'final', 'status', 'lesson'],
  earnings: ['day', 'teacher', 'kind', 'amount', 'paid', 'unpaid', 'lesson'],
  payables: ['day', 'teacher', 'kind', 'amount', 'paid', 'unpaid', 'settlement', 'lesson'],
  payments: ['day', 'teacher', 'amount', 'method', 'settlement', 'lesson'],
  retention: ['day', 'teacher', 'value', 'earned', 'amount', 'lesson'],
  pending_lines: ['day', 'teacher', 'student', 'state', 'units', 'explanation', 'lesson'],
  packages: ['student_name', 'id', 'type', 'remaining', 'remaining_value', 'debt', 'receipt_review'],
  historical_cash: ['day', 'kind', 'pack', 'teacher', 'amount', 'method', 'reason'],
  audit: ['at', 'actor', 'action', 'ref', 'detail'],
};
function cell(row, k) {
  const val = k === 'unpaid' ? row.amount - row.paid : row[k];
  if (k === 'lesson') return val ? link('record', '查看', { id: val }) : '—';
  if (val == null)
    return currency.has(k) && ['source', 'final', 'calculated', 'difference'].includes(k)
      ? k === 'source' || k === 'difference'
        ? '—'
        : '待核'
      : '—';
  if (currency.has(k)) return `<span class="num">${yuan(val)}</span>`;
  if (k === 'units' || k === 'remaining') return qty(val);
  if (k === 'teacher') return esc(teacher(val));
  if (k === 'type') return esc(types[val] || val);
  if (k === 'state') return esc(states[val] || val);
  if (k === 'status') return badge(val);
  if (k === 'student') return link('profile', val, { id: val });
  if (k === 'kind' || k === 'scope') return esc(labels[val] || val);
  if (k === 'detail') return `<details><summary>查看</summary><p class="break">${esc(val)}</p></details>`;
  return esc(val) || '—';
}
export function rowsTable(rows, columns, custom = {}) {
  return table(
    columns.map((k) => custom[k] || columnNames[k] || k),
    rows.map((r) => columns.map((k) => cell(r, k))),
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
const regularLesson = (r) => [
  link('record', r.day + (r.clock ? ' ' + r.clock : ''), { id: r.id }),
  esc(r.students || '—'),
  person(r.teacher),
  esc(r.course),
  esc(types[r.type]),
  r.minutes + ' 分钟',
  r.active === 0
    ? tag('历史版本')
    : r.history
      ? tag('已含期初')
      : tag(r.taught ? '已实授' : '未实授', r.taught ? 'green' : ''),
];
const lessonTable = (rows) =>
  table(
    ['授课日期 / 时间', '学生', '实际老师', '课程', '课型', '时长', '状态'],
    [...rows].reverse().map(regularLesson),
    '此期间暂无授课记录',
  );
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
  if (tab === 'lessons') q.include_versions = '1';
  const r = await read('details', q);
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
      tab,
    ) +
    panel(
      titles[tab] || '记录',
      tab === 'lessons' ? lessonTable(r.rows) : rowsTable(r.rows, cols[tab] || []),
      (tab === 'lessons' && admin()
        ? btn('export', '导出学生授课行', {
            glyph: 'export',
            style: 'btn small',
            attrs: 'data-query="' + esc(new URLSearchParams({ ...q, kind: 'attendance' }).toString()) + '"',
          }) + ' '
        : '') + exportLink(tab, q),
    )
  );
};
pages.details = async (p) => {
  const q = { ...session.filter, ...p, kind: p.kind || 'lessons' },
    r = await read('details', q);
  return (
    crumb('home', '经营总览') +
    head(
      titles[q.kind] || '来源明细',
      [r.start, r.end].filter(Boolean).join(' 至 '),
      exportLink(q.kind, q),
    ) +
    panel(
      '原始明细',
      q.kind === 'lessons' ? lessonTable(r.rows) : rowsTable(r.rows, cols[q.kind] || []),
      tag(r.rows.length + ' 条'),
    )
  );
};
pages.students = async (p) => {
  const items = await read('students', p);
  const filters = `<form class="search-form" data-form="students"><label class="search-box">${icon('search')}<input name="q" aria-label="搜索姓名或编号" placeholder="搜索姓名或学生编号" value="${esc(p.q)}"></label>${admin() ? field('main_teacher', '主带老师', { options: [['', '全部老师'], ...teacherOptions()], value: p.main_teacher }) : ''}${field('type', '课型', { options: [['', '全部课型'], ...Object.entries(types)], value: p.type })}${field('status', '状态', { options: [['', '全部状态'], '在读', '暂停', '结课', '待确认'], value: p.status })}${field('course', '科目', { value: p.course, attrs: 'placeholder="全部科目"' })}${submitButton('查询')}</form>`;
  const studentName = (s) =>
    `<a class="person person-link" href="${esc(path('profile', { id: s.id }))}">${avatar(s.name, s.main_teacher)}<span><b>${esc(s.name)}</b><small>${esc(s.id)}</small></span></a>`;
  const wide = table(
    [
      '学生',
      '主带老师',
      '课程',
      '一对一余额',
      '一对二余额',
      '最近上课',
      ...(admin() ? ['收款情况'] : []),
      '在读状态',
    ],
    items.map((s) => [
      studentName(s),
      esc(teacher(s.main_teacher)),
      esc(s.package_courses.join("、") || s.course),
      qty(s.solo) + ' 次',
      qty(s.duo) + ' 次',
      esc(s.latest || '暂无'),
      ...(admin() ? [[s.debt ? '欠费 ' + yuan(s.debt) : '', s.receipt_review ? '待核 ' + yuan(s.receipt_review) : ''].filter(Boolean).join(' · ') || '—'] : []),
      tag(s.status, 'green'),
    ]),
    '没有符合条件的学生',
  );
  const mobile =
    items
      .map(
        (s) =>
          `<a class="student-card" href="${esc(path('profile', { id: s.id }))}"><div>${avatar(s.name, s.main_teacher)}<span><strong>${esc(s.name)}</strong><small>${esc(s.package_courses.join("、") || s.course)} · ${esc(teacher(s.main_teacher))}</small></span>${icon('chevron')}</div><p>一对一余 <b>${qty(s.solo)}</b> 次 <span>一对二余 <b>${qty(s.duo)}</b> 次</span></p></a>`,
      )
      .join('') || empty('没有符合条件的学生');
  return (
    head(
      '学生档案',
      '查看主带老师、课包余额和教学记录',
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
pages.profile = async ({ id }) => {
  const d = await read('profile', { id }),
    s = d.student;
  const raw = 'data-ref="' + esc(s.id) + '"';
  const packages = d.packages
    .map((pk) => {
      const total = pk.original_units ?? (pk.paid_units + pk.gift_units);
      const original =
        pk.opening && pk.original_units != null
          ? `<p>原合同共 ${qty(pk.original_units)} 次${admin() ? ' · 成交 ' + yuan(pk.original_price) : ''}<br>期初前已登记扣课 ${qty(pk.historical_used)} 次</p>`
          : '';
      const receipt = pk.receipt_review != null
        ? '原课包收款待核 ' + yuan(pk.receipt_review) + (pk.debt ? ' · 已确认欠费 ' + yuan(pk.debt) : '')
        : (pk.opening ? '启用后净收 ' : '累计净收 ') + yuan(pk.net_cash) + ' · 欠费 ' + yuan(pk.debt);
      const split = pk.split_unknown
        ? '课包共 ' + qty(total) + ' 节（正课、赠课未分列）'
        : (pk.opening ? '期初结余：购买' : '购买') + ' ' + qty(pk.paid_units) + ' 次 · 赠课 ' + qty(pk.gift_units) + ' 次';
      const financials = admin()
        ? `<p>${pk.opening ? '期初余值' : '成交'} ${yuan(pk.price)} · 均价 ${yuan(pk.average)}<br>${receipt}<br>剩余价值 ${yuan(pk.remaining_value)}</p>`
        : '';
      const remainingPercent = total ? Math.min(100, Math.max(0, (pk.remaining * 100) / total)) : 0;
      return `<article class="pack">
        <div class="pack-top"><span class="tile-icon">${icon('book')}</span><div><h3>${esc(pk.course)} · ${esc(types[pk.type])}</h3><small>${esc(pk.id)} · ${pk.opening ? '期初课包' : '购课'}</small></div></div>
        <div class="pack-number"><strong>${qty(pk.remaining)}</strong> 次剩余 <small>${pk.opening ? '启用后已用' : '已用'} ${qty(pk.used)} 次</small></div>
        <div class="track"><i style="width:${remainingPercent}%"></i></div>
        ${original}<p>${split}</p>
        ${pk.member_ids.length > 1 ? '<p>共用课包 · ' + esc(pk.student_name) + '</p>' : ''}
        ${pk.opening && !original ? `<p>期初前已登记扣课 ${qty(pk.historical_used)} 次</p>` : ''}${financials}
        <p>${pk.opening ? '期初截至 ' : '购课日期 '}${esc(pk.since)} · ${pk.until_day ? '到期 ' + esc(pk.until_day) : '到期日未登记'}</p>
        ${link('details', '查看逐次消课', { kind: 'consumption', pack: pk.id, start: pk.since, end: session.meta.today })}</article>`;
    })
    .join('');
  const rec = table(
    ['日期时间', '课程', '实际老师', '出勤', '扣课', '课包', '消课金额', '本节内容 / 下次重点'],
    d.records.map((r) => [
      r.id ? link('record', r.day + ' ' + r.clock, { id: r.id }) : esc(r.day + ' ' + r.clock),
      esc(r.course),
      esc(teacher(r.teacher)),
      esc(states[r.state]),
      qty(r.units),
      esc(r.pack || '待核'),
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
  return (
    crumb('students', '学生档案') +
    head(
      s.name,
      detailInfo,
      (admin()
        ? entry('student', '编辑档案', raw) + entry('package', '购课 / 续费', raw, 'btn primary')
        : '') + (canRecord() ? link('manual', '记一节课', { student: id }, 'btn', 'plus') : ''),
    ) +
    panel(
      '档案摘要',
      metrics([
        ['已知到课', d.records.filter((r) => r.state === 'present').length + ' 次'],
        ['最近上课', d.records.find((r) => r.state === 'present')?.day || '暂无'],
        [
          '一对一余额',
          qty(d.packages.filter((p) => p.type === 'solo').reduce((v, p) => v + p.remaining, 0)) + ' 次',
        ],
        [
          '一对二余额',
          qty(d.packages.filter((p) => p.type === 'duo').reduce((v, p) => v + p.remaining, 0)) + ' 次',
        ],
        ...(admin() ? [['已确认欠费', yuan(d.packages.reduce((v, p) => v + (p.student === id ? p.debt : 0), 0))]] : []),
        ...(admin() && d.packages.some((p) => p.receipt_review != null)
          ? [['课包收款待核', yuan(d.packages.reduce((v, p) => v + (p.receipt_review || 0), 0))]]
          : []),
      ]),
    ) +
    panel(
      '课包与余额',
      packages ? `<div class="packs">${packages}</div>` : empty('尚未建立课包'),
      admin() ? entry('opening', '登记期初课包', raw) : '',
    ) +
    panel(
      '上课与教学记录',
      rec,
      tag(d.records.length + ' 条') +
        ' ' +
        exportLink('attendance', {
          student: id,
          start: d.records.at(-1)?.day || s.enrolled || session.meta.activation,
          end: d.records[0]?.day || session.meta.today,
        }),
    ) +
    (admin()
      ? panel(
          '缴费与权益变化',
          tabs(
            'profile',
            { cash: '收退款', changes: '权益变动', history: '期初前收付与课酬', events: '档案变更' },
            tab,
            { id },
          ) +
            (() => {
              if (tab === 'history')
                return (
                  rowsTable(d.archived_cash, ['day', 'kind', 'pack', 'amount', 'method']) +
                  table(
                    ['历史实际老师', '已登记扣课次数', '有依据的历史消课', '有依据的历史课酬'],
                    d.historical_lessons.map((r) => [
                      esc(teacher(r.teacher)),
                      qty(r.units),
                      yuan(r.source_value),
                      yuan(r.source_fee),
                    ]),
                  )
                );
              if (tab === 'events') return rowsTable(d.events, ['at', 'action', 'note']);
              return tab === 'changes'
                ? rowsTable(d.changes, ['day', 'kind', 'units', 'value', 'reason'], { value: '价值变化' })
                : rowsTable(d.cash, ['day', 'kind', 'pack', 'amount', 'method', 'reason']);
            })(),
        )
      : '')
  );
};
pages.teachers = async () => {
  const r = await read('report', session.filter),
    cards = r.compare
      .map((t) => {
        const info = session.meta.teachers.find((x) => x.id === t.id),
          rule = info.rules.find((x) => x.since <= r.end);
        return `<a class="teacher-card" href="${esc(path('teacher', { id: t.id }))}"><header>${avatar(t.name, t.id)}<div><h3>${esc(t.name)}</h3><small>${esc([info.subject, info.audience].filter(Boolean).join(' · ') || '授课老师')}</small></div>${icon('chevron')}</header><div class="teacher-pay"><small>本期应得课酬</small><strong>${yuan(t.earned)}</strong>${t.pending_fees ? tag(t.pending_fees + ' 笔待核', 'amber') : ''}</div><footer><span>${t.scenes} 场 · ${t.minutes} 分钟</span><span>比例 ${rule ? rule.bp / 100 + '%' : '待核'}</span></footer></a>`;
      })
      .join('');
  return (
    head(admin() ? '老师收入' : '我的收入', '课量和课酬按实际上课老师归属') +
    scopeBar(r) +
    `<div class="teacher-grid">${cards}</div>` +
    panel(
      '工作量对比',
      table(
        ['老师', '实际场次', '真实分钟', '到课人次', '消课次数', '消课金额', '应得课酬'],
        r.compare.map((t) => [
          link('teacher', t.name, { id: t.id }),
          t.scenes,
          t.minutes,
          t.present,
          qty(t.units),
          yuan(t.value) + (t.pending_values ? ' · ' + t.pending_values + ' 笔待核' : ''),
          yuan(t.earned) + (t.pending_fees ? ' · ' + t.pending_fees + ' 笔待核' : ''),
        ]),
      ),
    )
  );
};
pages.teacher = async ({ id }) => {
  const t = session.meta.teachers.find((v) => v.id === id);
  if (!t) throw Error('当前账号无法查看此老师');
  const q = { ...session.filter, teacher: id },
    [r, fees] = await Promise.all([read('report', q), read('details', { ...q, kind: 'fees' })]),
    s = r.stats;
  return (
    crumb('teachers', '老师收入') +
    head(
      t.name,
      [t.subject, t.audience].filter(Boolean).join(' · ') || '授课记录与收入明细',
      admin() ? entry('teacher_profile', '编辑档案', 'data-ref="' + esc(id) + '"') : '',
    ) +
    scopeBar(r) +
    metrics([
      ['本期应得', yuan(s.earned)],
      ['其中已付', yuan(s.paid)],
      ['其中未付', yuan(s.unpaid)],
      ['累计待付款', yuan(s.payable)],
    ]) +
    panel(
      '期间课量',
      metrics([
        ['实授场次', s.scenes],
        ['真实时长', s.minutes + ' 分钟'],
        ['已确认消课', yuan(s.value)],
        ['待核课酬', s.pending_fees + ' 笔'],
      ]),
      link('details', '查看授课场次', { ...q, kind: 'lessons' }),
    ) +
    panel('课酬明细', rowsTable(fees.rows, cols.fees), exportLink('fees', q)) +
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
      owner() ? entry('rule', '新增分成版本', 'data-ref="' + esc(id) + '"') : '',
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
          earnings: '老师应得',
          bills: '结算单',
          payments: '实际付款',
          historical_cash: '期初前收付',
        }
      : { earnings: '本人应得', bills: '本人结算单', payments: '实际付款' };
  if (!(tab in opt)) throw Error('无权访问此类账目');
  const q = { ...session.filter, kind: tab, ...(tab === 'packages' ? { flow: 'debt' } : {}) },
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
      : rowsTable(rows, cols[tab]);
  return (
    head(
      '账目管理',
      isAdmin ? '按实际收付日期查账，独立核对教师结算与付款' : '查看本人课酬与付款分配',
      isAdmin ? entry('receipt', '记收款') + entry('settle', '老师结算', '', 'btn primary') : '',
    ) +
    scopeBar(r) +
    metrics(
      isAdmin
        ? [
            ['本期实收', yuan(r.stats.receipts)],
            ['本期退款', yuan(r.stats.refunds)],
            ['期末学生欠费', yuan(r.stats.debt)],
            ['本期实际付老师', yuan(r.stats.actual_paid)],
          ]
        : [
            ['本期应得', yuan(r.stats.earned)],
            ['其中已付', yuan(r.stats.paid)],
            ['累计待付', yuan(r.stats.payable)],
          ],
    ) +
    tabs('accounts', opt, tab) +
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
    esc(r.pack || '待核'),
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
        ['学生', '对应课包', '出勤', '扣课次数', '消课金额', '教师分成', '状态', '教学记录', '操作'],
        rows,
      ),
    ) +
    panel(
      '课酬核对',
      table(['口径', '原表金额', '系统计算', '差额', '最终确认', '状态', '原因', '确认人', '操作'], fs),
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
