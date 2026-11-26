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
  canRecord, readOnly, canManage,
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
import { actualPay, confirmedPay, detailsPath } from './comparison.js';

import {adaptiveTable, hours, packageCard, paginate, pagingLinks, rate, splitBar, teacherBars, trendPanel} from './visuals.js';
const columnNames = {
  progress_total:'调整后总课时', progress_used:'累计已消课时', consumed_value:'累计消课金额', portfolio_value:'课包总价值',
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
  'consumed_value portfolio_value amount net_cash value earned price average debt receipt_review remaining_value final source calculated difference paid unpaid contract source_value source_fee teacher_fee'.split(
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
  packages: ['student_name', 'id', 'since', 'course', 'price', 'progress_total', 'progress_used', 'remaining', 'consumed_value', 'remaining_value', 'debt', 'receipt_review'],
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
  if (['units','remaining','total_units','used','progress_total','progress_used'].includes(k)) return qty(val);
  if (k === 'teacher') return esc(teacher(val));
  if (k === 'type') return esc(types[val] || val);
  if (k === 'state') return esc(states[val] || val);
  if (k === 'status') return badge(val);
  if (k === 'fee_basis' && val === '全额归琴行') return '已核定';
  if (k === 'student') return admin() ? link('profile', row.student_name || val, { id: val, asof }) : esc(row.student_name || val);
  if (k === 'kind' || k === 'scope') return esc(labels[val] || val);
  if (k === 'detail') return `<details><summary>查看</summary><p class="break">${esc(val)}</p></details>`;
  return esc(val) || '—';
}
export function rowsTable(rows, columns, custom = {}, asof) {
  const find=(...keys)=>keys.map(key=>columns.indexOf(key)).find(index=>index>=0);
  const pivot=find('amount','final','remaining_value','calculated','price','value') ?? 1;
  const subject=find('students','student','student_name','teacher','pack');
  const state=find('status','fee_basis','state','kind','course');
  return paginate(rows,'pg_'+columns.join('_').slice(0,24),chunk=>adaptiveTable(
    columns.map(k=>custom[k]||columnNames[k]||k),
    chunk.map(r=>columns.map(k=>cell(r,k,asof))),[0,pivot,subject,state]));
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
function lessonTable(rows,asof) {
  const origins={paper:'确认纸卡',import:'表格导入',history:'期初历史',manual:'手动记课',archive:'历史版本'};
  const state=l=>l.active===0?'已更正':l.history?'已含期初':l.review==='pending'?'待核':l.taught?'已实授':'未实授';
  const labels=['上课日期','学员','科目 / 课型','实际老师','时长','消课金额','核对 / 来源'];
  const dated=l=>link('record',l.day+(l.clock?' '+l.clock:''),{id:l.id});
  const detail=l=>link('record','授课明细',{id:l.id});
  return paginate([...rows].reverse(),'class_page',chunk=>{
    if(!chunk.length)return empty('此期间暂无符合条件的授课记录');
    const wide=table(labels,chunk.map(l=>[dated(l),l.participants.map(i=>admin()?link('profile',i.name,{id:i.student,asof}):esc(i.name)).join('、'),esc(l.course)+'<small class="cell-note">'+esc(types[l.type])+'</small>',person(l.teacher)+(l.substitute?tag('代课','olive'):''),l.minutes+' 分钟','<span class="num">'+(l.history?'已含期初':yuan(l.class_value))+'</span>',tag(state(l),l.review==='pending'?'amber':'')+'<small class="cell-note">'+esc(origins[l.origin]||'历史版本')+'</small>']));
    const cards=chunk.map(l=>`<details class="record-card lesson-mobile"><summary><span><b>${esc(l.students||'未登记学员')}</b><small>${esc(l.day)} · ${esc(l.course)} · ${esc(types[l.type])}</small></span><span>${esc(teacher(l.teacher))}<small>${l.history?'已含期初':yuan(l.class_value)}</small></span>${icon('down')}</summary><dl><div><dt>课型</dt><dd>${esc(types[l.type])}${l.substitute?' · 代课':''}</dd></div><div><dt>来源 / 状态</dt><dd>${esc(origins[l.origin])} · ${esc(state(l))}</dd></div><div><dt>课时明细</dt><dd>${detail(l)}</dd></div></dl></details>`).join('');
    return `<div class="adaptive-wide">${wide}</div><div class="adaptive-mobile">${cards}</div>`;
  });
}

const tabs = (base, items, current, p = {}) =>
  `<div class="tabs">${Object.entries(items)
    .map(([k, v]) => link(base, v, { ...p, tab: k }, k === current ? 'tab active' : 'tab'))
    .join('')}</div>`;
export const entry = (id, name, attrs = '', style = 'btn small') =>
  readOnly() ? '' : btn('entry', name, { id, style, attrs });
pages.lessons = async (p) => {
  const tab = p.tab || 'lessons',
    q = { ...session.filter, kind: tab },
    more = admin()
      ? link('batches', '导入批次', {}, 'btn', 'layers') + (canManage() && !session.meta.shared_edit?link('import', '导入周表', {}, 'btn', 'import'):'')
      : '';
  if (tab === 'lessons') for (const key of ['q','student','pack','coverage','include_versions','only','origin','review']) {
    if (p[key]) q[key] = p[key];
  }
  const r = await read('details', tab==='lessons'?{...q,display_page:p.class_page||1}:q);
  const filters = tab === 'lessons' ? `<form class="search-form" data-form="lesson-search">
    ${field('q','学员',{ value:p.q, attrs:'placeholder="姓名或学生编号"' })}
    ${admin() ? field('teacher','实际老师',{ value:q.teacher, options:[['','全部老师'],...teacherOptions()] }) : ''}
    ${field('coverage','授课归属',{ value:p.coverage, options:[['','全部授课'],['substitute','只看代课']] })}
    ${field('include_versions','记录版本',{ value:p.include_versions, options:[['','有效记录'],['1','含已更正版本']] })}
    ${field('course','科目',{value:q.course,attrs:'placeholder="全部科目"'})}${field('type','课型',{value:q.type,options:[['','全部课型'],...Object.entries(types)]})}
    ${field('origin','来源',{value:q.origin,options:[['','全部来源'],['paper','确认纸卡'],['import','表格导入'],['manual','手动记课'],['history','期初历史']]})}
    ${field('review','核对状态',{value:q.review,options:[['','全部状态'],['confirmed','已核定'],['pending','待核'],['history','已含期初']]})}
    ${submitButton('查询')}</form>` : '';
  const w=r.workload;
  const summary=w?metrics([['实授场次',w.scenes+' 场'],['授课时长',hours(w.minutes)],['学生消课',qty(w.used)+' 节'+(w.pending?' · '+w.pending+' 条待核':'')],['授课老师',w.teachers+' 人'],['到课学生',w.students+' 人']]):'';

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
    summary + (filters ? '<details class="filter-disclosure" '+(Object.keys(p).some(k=>['q','origin','review','coverage'].includes(k))?'open':'')+'><summary>'+icon('filter')+' 查询条件</summary>'+filters+'</details>' : '') +
    panel(
      titles[tab] || '记录',
      tab === 'lessons' ? '<div class="page-list" id="list-class_page">'+lessonTable(r.rows,r.end)+pagingLinks('class_page',r.page,r.total,r.page_size)+'</div>' : rowsTable(r.rows, cols[tab] || [], {}, r.end),
      tag((r.total??r.rows.length) + ' 条') + ' ' + (tab === 'lessons' && admin()
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
pages.students=async p=>{
  const items=await read('students',p),when=p.asof||session.meta.today;
  const fields=`${p.asof?`<input type="hidden" name="asof" value="${esc(p.asof)}">`:''}<label class="search-box">${icon('search')}<input name="q" aria-label="搜索姓名或编号" placeholder="搜索姓名或学生编号" value="${esc(p.q)}"></label>
    ${admin()?field('main_teacher','主带老师',{options:[['','全部老师'],...teacherOptions()],value:p.main_teacher}):''}
    ${field('course','科目',{value:p.course,attrs:'placeholder="全部科目"'})}${field('status','学习状态',{options:[['','全部状态'],'在读','暂停','结课','待确认'],value:p.status})}
    ${field('balance','剩余课时',{options:[['','全部余额'],['zero','已用完'],['low',session.meta.low+' 节以内（有余额）'],['above','高于 '+session.meta.low+' 节']],value:p.balance})}
    ${field('type','课型',{options:[['','全部课型'],...Object.entries(types)],value:p.type})}
    ${field('follow','跟进事项',{options:[['','全部事项'],['unknown','状态待确认'],['low','低课时'],['idle','长期未上课']],value:p.follow})}
    ${field('sort','排序',{options:[['','姓名 / 编号'],['balance','余额从少到多'],['latest','最近上课优先']],value:p.sort})}${submitButton('查询')}`;
  const keys={low:'低课时',idle:'长期未上课',unknown:'核实状态'};
  const paint=chunk=>{
    const progress=s=>`<span class="balance-cell"><b>${qty(s.solo+s.duo)} 节</b><span class="mini-track"><i style="width:${rate(s.solo+s.duo,s.progress_total)||0}%"></i></span></span>`;
    const n=s=>link('profile',s.name,{id:s.id,asof:when},'name-link');
    const wide=table(['学生','课程 / 主带','学习状态','已消课时','剩余课时','最近上课','跟进'],chunk.map(s=>[
      n(s)+'<small class="cell-note">'+esc(s.id)+'</small>',esc(s.package_courses.join('、')||s.course)+'<small class="cell-note">'+esc(teacher(s.main_teacher))+'</small>',
      tag(s.status,s.status==='在读'?'green':s.status==='待确认'?'amber':''),qty(s.progress_used)+' 节'+(s.shared_package?'<small class="cell-note">含共用课包</small>':''),progress(s),esc(s.latest||'暂无'),esc(s.follow.map(k=>keys[k]).join(' · ')||'—')
    ]),'没有符合条件的学生');
    const cards=chunk.map(s=>`<a class="student-card" href="${esc(path('profile',{id:s.id,asof:when}))}"><div>${avatar(s.name,s.main_teacher)}<span><strong>${esc(s.name)}</strong><small>${esc(teacher(s.main_teacher))} · ${esc(s.package_courses.join('、')||s.course)}</small></span>${icon('chevron')}</div><p>剩余 <b>${qty(s.solo+s.duo)}</b> 节<span>最近 ${esc(s.latest||'暂无记录')}</span></p></a>`).join('')||empty('没有符合条件的学生');
    return '<div class="adaptive-wide">'+wide+'</div><div class="adaptive-mobile">'+cards+'</div>';
  };
  const filtered=['q','main_teacher','course','status','balance','type','follow','sort'].filter(k=>p[k]).length;
  return head('学生档案','截至 '+when,canManage()?entry('student','新建学生','','btn primary'):'')+
    `<details class="filter-disclosure"${filtered?' open':''}><summary>${icon('filter')} 搜索与筛选${filtered?' · '+filtered+' 项':''}</summary><form data-form="students" class="search-form">${fields}</form></details>`+
    panel('学生名册',paginate(items,'student_page',paint),`<div class="actions">${tag(items.length+' 人')}${exportLink('students',p)}</div>`);
};

forms.students = (f) => go('students', values(f));
const packCard = packageCard;
pages.pack = async ({ id, asof = session.meta.today }) => {
  const [pk] = await read('packages', { pack:id, asof });
  if (!pk) throw Error('所选日期没有此课包');
  const scope = { period:'all', anchor:asof, pack:id };
  const [used, cash] = await Promise.all([read('details', { ...scope, kind:'lessons' }),
    admin() ? read('details', { ...scope, kind:'cash' }) : null]);
  const names = pk.student_name.split('、');
  const members = pk.member_ids.map((sid,i) => link('profile',names[i] || sid,{ id:sid, asof })).join('、');
  return crumb('students','学生档案',{asof}) + head('课包详情',pk.id + ' · 截至 ' + asof)
    + panel('课包与缴费',packCard(pk,asof,false),members + ' ' + entry('package_split','编辑正课与赠课','data-ref="'+esc(pk.id)+'"'))
    + panel('上课记录',lessonTable(used.rows,asof),tag(used.rows.length + ' 条'))
    + (cash ? panel('收退款记录',rowsTable(cash.rows,cols.cash,{},asof),tag(cash.rows.length + ' 笔')) : '');
};
pages.profile = async ({ id, asof }) => {
  const d = await read('profile', { id, asof }), s = d.student;
  const raw = 'data-ref="' + esc(s.id) + '"';
  const packGroup=(list)=>list.length?'<div class="packs">'+list.map(pk=>packCard(pk,d.asof)).join('')+'</div>':empty('暂无课包');
  const current=d.packages.filter(pk=>pk.remaining>0), history=d.packages.filter(pk=>pk.remaining<=0);
  const notes=d.records.filter(r=>r.content||r.next_focus);
  const packages=packGroup(current);
  const rec = paginate(d.records,'profile_page',chunk=>adaptiveTable(
    ['上课日期', '课程', '时长', '主带老师', '实际老师', '出勤', '扣课（节）', '课包', '消课金额', '本节内容 / 下次重点'],
    chunk.map((r) => [
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
    ]),[0,4]));
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
      '当前课包', packages,
      admin() ? entry('opening', '登记期初课包', raw) : '',
    ) +
    (history.length ? panel('历史课包',packGroup(history),tag(history.length+' 个')) : '') +
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
    ) + (admin()?panel('缴费与退款',billingHistory):'') +
    panel('教学与跟进', (s.note?'<p class="profile-note">'+esc(s.note)+'</p>':'')+
      (notes.length?paginate(notes,'note_page',items=>adaptiveTable(['日期','授课老师','本节内容','下次重点'],items.map(r=>[esc(r.day),esc(teacher(r.teacher)),esc(r.content||'—'),esc(r.next_focus||'—')]))):s.note?'':empty('尚无教学备注或跟进记录')))
  );
};
pages.teachers = async () => {
  const q=session.filter,r=await read('report',q);
  const tiles=r.compare.map(t=>{
    const info=session.meta.teachers.find(v=>v.id===t.id);
    const metrics=[['授课',t.scenes+' 场'],['时长',hours(t.minutes)],['上课学员',t.students+' 人'],['消课金额',yuan(t.value)],['已确认课酬',yuan(t.verified_fees)],['待核参考',t.pending_fees>t.pending_reference_count?'待核':yuan(t.pending_reference)],['本期已付',t.payment_entries?yuan(t.actual_paid):'暂无付款记录'],['期末待付',yuan(t.payable)]];
    return `<a class="staff-tile" href="${esc(path('teacher',{...q,id:t.id}))}"><header>${avatar(t.name,t.id)}<span><b>${esc(t.name)}</b><small>${esc(info.subject||'未登记科目')}</small></span>${icon('chevron')}</header><dl>${metrics.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></a>`;
  }).join('');
  return head(admin()?'老师管理':'我的收入','',owner()?link('settings','分成设置',{},'btn','settings'):'')+scopeBar(r)+
    `<div class="analytics-pair">${teacherBars(r,q)}${trendPanel(r,q,'teacher')}</div>`+
    panel('老师名册',`<div class="staff-grid">${tiles||empty()}</div>`,tag(r.compare.length+' 人'));
};

pages.teacher = async ({ id }) => {
  const t = session.meta.teachers.find((v) => v.id === id);
  if (!t) throw Error('当前账号无法查看此老师');
  const q = { ...session.filter, teacher: id };
  const [r, fees, classes, bills] = await Promise.all([
    read('report', q), read('details', { ...q, kind: 'fees' }),
    read('details', { ...q, kind:'lessons', only:'taught' }), read('bills',{teacher:id}),
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
    panel('本期课酬',metricLinks([
      ['本期已确认课酬',yuan(s.verified_fees),detailsPath(q,'fees',{flow:'verified'})],
      ['待核参考课酬',s.pending_fees>s.pending_reference_count?'待核':yuan(s.pending_reference),detailsPath(q,'fees',{state:'pending'})],
      ['已确认应付',confirmedPay(s),!s.earned_entries && s.pending_fees ? detailsPath(q,'fees',{state:'pending'}) : detailsPath(q,'earnings')],
      ['实际已付',actualPay(s),detailsPath(q,'payments')],
      ['累计待付款',yuan(s.payable),detailsPath(q,'payables')],
    ])) +
    panel('期间课量', metricLinks([
      ['已上课时',s.scenes + ' 节',detailsPath(q,'lessons',{only:'taught'})],
      ['其中代课',s.substitutes + ' 节',detailsPath(q,'lessons',{only:'taught',coverage:'substitute'})],
      ['授课时长',s.minutes + ' 分钟',detailsPath(q,'lessons',{only:'taught'})],
      ['消课金额',yuan(s.value),detailsPath(q,'consumption')],
    ])) +
    `<div class="analytics-pair">${trendPanel(r,q,'teacher')}${panel('到课学员分布',Object.entries(classes.rows.reduce((groups,l)=>{
      const set=groups[l.course]||=new Set(); for(const i of l.participants)if(i.state==='present')set.add(i.student);return groups;
    },{})).map(([course,ids])=>link('lessons',course+' · '+ids.size+' 人',{...q,course},'distribution-row')).join('')||empty('暂无到课学员'),tag(s.attending_students+' 位学员'))}</div>`+
    panel('代课记录',lessonTable(classes.rows.filter(l=>l.substitute),r.end),tag(s.substitutes+' 场'))+
    panel('上课记录',lessonTable(classes.rows,r.end),tag(classes.rows.length + ' 条')) +
    panel('结算记录',adaptiveTable(['确认日期','授课期间','结算金额'],bills.filter(b=>b.teacher===id&&b.day>=r.start&&b.day<=r.end).map(b=>[esc(b.day),esc(b.start+' 至 '+b.end),btn('bill',yuan(b.snapshot.total),{id:b.id,style:'text-button'})]),[0,2])) +

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
      ? adaptiveTable(
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
      '',
      isAdmin ? entry('receipt', '记收款') + entry('settle', '老师结算', '', 'btn primary') : '',
    ) +
    scopeBar(r) +
    (isAdmin ? `<div class="finance-bands">${panel('现金收支',metricLinks([
      ['实际学费收款',yuan(r.stats.income_receipts),detailsPath(session.filter,'cashflow',{flow:'receipt'})],
      ['学费退款',yuan(r.stats.income_refunds),detailsPath(session.filter,'cashflow',{flow:'refund'})],
      ['净收学费',yuan(r.stats.income_receipts-r.stats.income_refunds),detailsPath(session.filter,'cashflow',{flow:'net_tuition'})],
      ['实际支付课酬',r.stats.payment_entries||r.stats.income_paid?yuan(r.stats.income_paid):'暂无付款记录',detailsPath(session.filter,'cashflow',{flow:'payment'})],
    ]))}${panel('消课与留存',metricLinks([
      ['消课金额',yuan(r.stats.value),detailsPath(session.filter,'consumption')],
      ['已核部分留存',yuan(r.stats.retained),detailsPath(session.filter,'retention')],
      [r.stats.income_estimated?'参考课酬后留存':'课酬后留存',yuan(r.stats.studio_income),detailsPath(session.filter,'studio_income'),r.stats.income_estimated?'含 '+r.stats.income_estimated+' 笔待核':''],
      ['期末课包剩余价值',yuan(r.stats.remaining_value),detailsPath(session.filter,'packages')],
    ]))}</div>` : '') +
    panel('老师课酬',metricLinks([
      ['本期已确认课酬',yuan(r.stats.verified_fees),detailsPath(session.filter,'fees',{flow:'verified'})],
      ['待核参考课酬',r.stats.pending_fees>r.stats.pending_reference_count?'待核':yuan(r.stats.pending_reference),detailsPath(session.filter,'fees',{state:'pending'}),r.stats.pending_fees+' 笔'],
      ['本期新增应付',yuan(r.stats.earned),detailsPath(session.filter,'earnings')],
      ['期末累计待付',yuan(r.stats.payable),detailsPath(session.filter,'payables',{flow:'outstanding'})],
    ])) +
    (isAdmin?`<div class="analytics-pair">${trendPanel(r,session.filter,'finance')}${panel('消课金额分配',r.stats.lesson_fees!=null&&r.stats.studio_income!=null&&r.stats.income_value>0&&r.stats.lesson_fees>=0&&r.stats.studio_income>=0?splitBar('消课总额',r.stats.lesson_fees,r.stats.studio_income,yuan,['老师课酬',r.stats.income_estimated?'参考留存':'琴行留存'],detailsPath(session.filter,'studio_income')):empty(r.stats.income_missing?'部分课酬金额待核':'本期无可分段的正向消课金额'))}</div>`:'')+
    panel('老师付款进度',r.compare.map(t=>{
      const total=t.allocated+t.payable, frac=rate(t.allocated,total);
      return `<a class="pay-progress" href="${esc(detailsPath({...session.filter,teacher:t.id},'payables'))}"><b>${esc(t.name)}</b><div class="mini-track"><i style="width:${frac||0}%"></i></div><span>${total?'已付 '+yuan(t.allocated)+' / 应付 '+yuan(total):'暂无已确认应付'}</span></a>`;
    }).join('')||empty(),`<span class="asof">截至 ${esc(r.end)}</span>`) +

    tabs('accounts', opt, tab, session.filter) +
    panel(opt[tab], data, tab === 'bills' ? '' : exportLink(tab, q)) +
    (canManage()
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
    f.status === 'studio' && f.reason
      ? `<details><summary>查看</summary><p class="break">${esc(f.reason)}</p></details>`
      : esc(f.reason || '—'),
    esc(f.reviewer || '—'),
    admin() && f.status === 'pending' && d.active
      ? entry('review_fee', '核对课酬', 'data-ref="' + esc(f.id) + '"')
      : '—',
  ]);
  const controls =
    canManage() && d.active
      ? link('manual', '更正场次', { correct: id }, 'btn', 'book') +
        entry('correct', '关联冲回', 'data-ref="' + esc(id) + '"')
      : !admin() && !readOnly() && d.active
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
      adaptiveTable(
        ['学生', '对应课包', '主带老师', '出勤', '扣课次数', '消课金额', '教师分成', '状态', '教学记录', '操作'],
        rows,
      ),
    ) +
    panel(
      '课酬核对',
      adaptiveTable(['口径', '原表金额', '参考课酬', '差额', '最终确认', '状态', '原因', '确认人', '操作'], fs),
    ) +
    panel(
      '应付款与实际分配',
      rowsTable(d.payables, ['day', 'kind', 'amount', 'paid', 'unpaid', 'settlement']) +
        (d.allocations.length ? rowsTable(d.allocations, ['day', 'method', 'amount']) : ''),
    ) +
    panel(
      '记录追溯',
      `<div class="evidence">${d.history ? '<p>历史展示，已包含期初。</p>' : ''}${d.batch ? link('import', '查看原始导入批次', { batch: d.batch, row:(readOnly() || session.meta.shared_edit)?d.evidence?.[0]?.row_key:undefined }) : '<p>来源为手动记课。</p>'}${(d.evidence || []).map((x) => `<p>来源行 ${esc(x.row_key)} · ${esc(x.status)}</p>`).join('')}${d.versions.map((v) => `<p>${link('record', v.id, { id: v.id })} · ${v.active ? '现行版本' : '原始版本'} ${esc(v.change_note)}</p>`).join('')}${d.dependencies ? `<p>后续权益变动 ${d.dependencies.movements?.length || 0} 条 · 已结算 ${d.dependencies.settled?.length || 0} 笔 · 已付款 ${d.dependencies.payments?.length || 0} 笔</p>` : ''}</div>`,
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
