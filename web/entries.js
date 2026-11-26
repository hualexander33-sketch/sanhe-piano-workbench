import {
  session,
  $,
  esc,
  head,
  field,
  btn,
  link,
  teacher,
  teacherOptions,
  roles,
  types,
  states,
  admin,
  owner,
  canRecord,
  read,
  write,
  api,
  values,
  pages,
  actions,
  forms,
  changes,
  go,
  reload,
  showDialog,
  closeDialog,
  submitButton,
  toast,
  table,
  qty,
  yuan,
  metrics,
  badge,
  crumb,
  panel,
} from './ui.js';

const payments = ['转账', '微信', '支付宝', '现金', '其他'];
const asOptions = (rows, label) => rows.map((r) => [r.id, label(r)]);
const packName = (p) =>
  p.student_name + ' · ' + p.course + ' · ' + p.id + ' · ' + types[p.type] + ' · 余 ' + qty(p.remaining) + ' 次';
const moneyField = (key, label, value = '', required = true) =>
  field(key, label, { type: 'number', value, required, attrs: 'min="0" step=".01" inputmode="decimal"' });
const qtyField = (key, label, value = '', required = true) =>
  field(key, label, { type: 'number', value, required, attrs: 'min="0" step=".001" inputmode="decimal"' });
const text = (key, label, value = '', required = false) => field(key, label, { value, required });
const date = (key, label, value, required = true) => field(key, label, { type: 'date', value, required });
const reason = (label = '依据与说明', required = true) =>
  field('reason', label, { type: 'textarea', required, wide: true });
const select = (key, label, options, value = '', required = true) =>
  field(key, label, { options, value, required });
const titles = {
  student: '学生建档',
  package: '购课 / 续费',
  opening: '登记期初课包',
  receipt: '学费补款',
  refund: '退款与退课',
  convert: '转课 / 追加赠课',
  pay: '登记实际付款',
  settle: '老师课酬结算',
  opening_payable: '教师期初待付',
  archive_cash: '补录期初前收付',
  rule: '新增分成版本',
  teacher_profile: '编辑老师档案',
  review_fee: '核对课酬',
  resolve_line: '补核学生扣课',
  arrear: '登记欠课',
  correct: '关联冲回授课',
  request_change: '申请更正',
  settings: '提醒设置',
  access: '老师授权',
  new_account: '创建登录账号',
};
let entryState, manualState, previewState;
window.addEventListener('qh-clear', () => {
  entryState = manualState = previewState = null;
});
actions.entry = async (el) => {
  const mode = el.dataset.id,
    ref = el.dataset.ref || '',
    m = session.meta,
    now = m.today;
  if (mode !== 'request_change' && !admin()) throw Error('此操作需要管理员权限');
  const needsStudents = ['student', 'package', 'opening', 'access'].includes(mode);
  const needsPacks = ['receipt', 'refund', 'convert', 'resolve_line', 'archive_cash'].includes(mode);
  const [ss, pk] = await Promise.all([
    needsStudents ? read('students') : [],
    needsPacks ? read('packages') : [],
  ]);
  const st = ss.find((x) => x.id === ref) || {},
    t = m.teachers.find((x) => x.id === ref) || {};
  const stOptions = [['', '请选择学生'], ...asOptions(ss, (r) => r.name + ' · ' + r.id)];
  const pOptions = [
    ['', '请选择课包'],
    ...asOptions(
      pk.filter((r) => !el.dataset.student || r.member_ids.includes(el.dataset.student)),
      packName,
    ),
  ];
  const tOptions = [['', '请选择老师'], ...teacherOptions()];
  const sf = select('student', '学生', stOptions, ref),
    pf = select('pack', '所属课包', pOptions);
  const tf = select('teacher', '实际老师', tOptions, ref),
    type = select('type', '课型', types, 'solo');
  const when = date('day', '业务日期', now),
    method = select('method', '实际收付方式', payments, '转账');
  let fields = [],
    suffix = '',
    submit = '确认保存',
    title = titles[mode];
  switch (mode) {
    case 'student':
      title = st.id ? '编辑学生档案' : '新建学生';
      fields = [
        field('id', '学生编号', {
          value: st.id || '',
          attrs: st.id ? 'readonly' : 'placeholder="留空自动生成"',
        }),
        text('name', '学生姓名', st.name, true),
        select('category', '学员类别', ['待确认', '儿童', '成人'], st.category),
        text('contact', '本人或监护人联系方式', st.contact),
        text('course', '课程 / 科目', st.course, true),
        select('main_teacher', '主带老师', tOptions, st.main_teacher),
        select('substitute_teacher', '临时代课老师（选填）', [['', '未指定'], ...teacherOptions()], st.substitute_teacher, false),
        date('enrolled', '入学日期', st.id ? st.enrolled : now, false),
        select('status', '在读状态', ['在读', '暂停', '结课', '待确认'], st.status),
      ];
      break;
    case 'package':
    case 'opening':
      fields = [
        sf,
        text('id', '课包编号（可留空）'),
        text('course', '课程（留空沿用学生档案）', st.course),
        type,
        ...(mode === 'package' ? [when] : []),
        date('until_day', '有效期截止（选填）', '', false),
        qtyField('purchased', mode === 'opening' ? '期初剩余购买次数' : '购买次数'),
        qtyField('gift', mode === 'opening' ? '期初剩余赠课次数' : '赠送次数', 0),
        moneyField('price', mode === 'opening' ? '期初剩余价值（元）' : '约定成交金额（元）'),
        ...(mode === 'package'
          ? [moneyField('receipt', '本次实收（元）', 0), method]
          : [
              moneyField('debt', '期初欠费（元）', 0),
              moneyField('original_price', '原合同完整成交金额（选填）', '', false),
              qtyField('original_units', '原合同完整权益总数（选填）', '', false),
              text('note', '期初依据', '', true),
            ]),
      ];
      if (mode === 'opening')
        suffix = `<details><summary>已核实的历史课酬累计基数（选填）</summary><p class="muted">按原课包、老师和分成版本填入已计酬的次数与金额，留空表示没有已核实的累计值。</p><div class="form-grid">${m.teachers.flatMap((tt) => tt.rules.map((r) => qtyField('carry_units_' + r.id, tt.name + ' ' + r.since + ' 累计次数', '', false) + moneyField('carry_fee_' + r.id, tt.name + ' 累计课酬（元）', '', false))).join('')}</div></details>`;
      break;
    case 'receipt':
      fields = [pf, when, moneyField('amount', '实际收款（元）'), method, reason('收款备注', false)];
      break;
    case 'refund':
      fields = [
        pf,
        when,
        moneyField('amount', '实际退款（元）'),
        qtyField('units', '退课次数', 0),
        moneyField('contract_reduction', '合同调减金额（选填）', '', false),
        method,
        reason('退款与差额依据'),
      ];
      break;
    case 'convert':
      fields = [
        pf,
        when,
        qtyField('from_units', '原课包转出次数'),
        type,
        text('course', '新课包课程'),
        qtyField('purchased', '新包承接购买次数'),
        qtyField('gift', '新包赠送次数', 0),
        date('until_day', '新有效期（选填）', '', false),
        reason(),
      ];
      break;
    case 'pay':
      fields = [
        tf,
        date('day', '实际付款日期', now),
        moneyField('amount', '本次实际付款（元）'),
        method,
        reason('付款备注', false),
      ];
      if (el.dataset.bill) suffix = `<p class="muted">付款分配至结算单 ${esc(el.dataset.bill)}</p>`;
      break;
    case 'settle':
      fields = [
        tf,
        date('start', '授课期间起日', now.slice(0, 7) + '-01'),
        date('end', '授课期间止日', now),
        date('day', '结算确认日', now),
      ];
      submit = '预览结算明细';
      break;
    case 'opening_payable':
      fields = [tf, moneyField('amount', '已核实的期初待付（元）'), reason('期初依据')];
      break;
    case 'archive_cash':
      fields = [
        select('kind', '原凭证类型', { receipt: '学费收款', refund: '学费退款', payment: '教师付款' }),
        field('pack', '学费所属课包', { options: pOptions }),
        field('teacher', '老师付款对象', { options: tOptions }),
        date('day', '原凭证日期', ''),
        moneyField('amount', '原凭证金额（元）'),
        method,
        reason('原凭证与期初归属'),
      ];
      break;
    case 'rule':
      fields = [
        tf,
        date('since', '生效日期', now),
        field('percent', '教师分成百分比', {
          type: 'number',
          required: true,
          attrs: 'min="0" max="100" step=".01"',
        }),
        reason('变更依据'),
      ];
      break;
    case 'teacher_profile':
      fields = [tf, text('subject', '授课科目', t.subject), text('audience', '授课对象', t.audience)];
      break;
    case 'review_fee':
      fields = [
        select('basis', '采用金额', {
          system: '系统计算金额',
          source: '原表金额',
          agreed: '有依据的单次约定金额',
        }),
        moneyField('amount', '单次约定金额（选择约定时填写）', '', false),
        reason('本次核对依据'),
      ];
      break;
    case 'resolve_line':
      fields = [
        pf,
        field('cover_owed', '扣课方式', {
          options: [
            ['', '按原授课日匹配'],
            ['yes', '用于已登记欠课的后续补扣'],
          ],
        }),
        date('day', '后续补扣日期', now),
        reason('课包与核对依据'),
      ];
      break;
    case 'arrear':
      fields = [reason('已核实的欠课约定')];
      break;
    case 'correct':
      fields = [
        select('mode', '处理方式', {
          correction: '关联冲回（保留结算与付款）',
          withdraw: '撤回无后续依赖的场次',
        }),
        reason('冲回原因'),
      ];
      submit = '确认冲回';
      break;
    case 'request_change':
      fields = [reason('需要更正的内容')];
      break;
    case 'settings':
      fields = [qtyField('low', '低余额提醒（整次）', m.low), qtyField('idle', '未上课提醒（天）', m.idle)];
      break;
    case 'new_account':
      fields = [
        field('username', '账号', { required: true, attrs: 'autocomplete="username"' }),
        field('password', '初始密码', {
          type: 'password',
          required: true,
          attrs: 'minlength="10" maxlength="128" autocomplete="new-password"',
        }),
        select('role', '账号角色', { teacher: '普通老师', ops: '运营管理员', owner: '老板管理员' }),
        field('teacher', '关联授课老师', { options: tOptions }),
        select('can_record', '老师记课权限', { no: '只读', yes: '可补录' }, 'no'),
      ];
      break;
    case 'access': {
      const u = (await read('accounts')).find((a) => a.id === ref);
      if (!u) throw Error('账号不存在');
      fields = [
        select('can_record', '补录权限', { no: '只读', yes: '可记本人授课' }, u.can_record ? 'yes' : 'no'),
      ];
      suffix = `<fieldset><legend>额外授权的学生</legend><div class="checks">${ss.map((s) => `<label><input type="checkbox" name="grant" value="${esc(s.id)}" ${u.students.includes(s.id) ? 'checked' : ''}>${esc(s.name + ' · ' + s.id)}</label>`).join('')}</div></fieldset>`;
      break;
    }
    default:
      throw Error('未识别此项操作');
  }
  entryState = { mode, ref, bill: el.dataset.bill || '', edit: !!st.id && mode === 'student' };
  showDialog(
    title,
    `<form data-form="entry"><div class="form-grid">${fields.join('')}</div>${suffix}<div class="form-foot">${submitButton(submit)}</div></form>`,
  );
};
forms.entry = async (f) => {
  const { mode, ref, bill, edit } = entryState,
    p = values(f);
  if (mode === 'settle') {
    const result = await read('settlement_preview', p);
    entryState.settlement = { ...p, items: result.items.map((x) => x.id) };
    showDialog(
      '结算核对 · ' + teacher(p.teacher),
      metrics([
        ['授课期间', p.start + ' ~ ' + p.end],
        ['列入应付', yuan(result.total)],
        ['待核未纳入', result.excluded.length + ' 笔'],
      ]) +
        table(
          ['入账日', '应付编号', '金额'],
          result.items.map((x) => [esc(x.day), esc(x.id), yuan(x.amount)]),
          '没有可结算的应付',
        ) +
        (result.excluded.length
          ? table(
              ['待核课程', '原因'],
              result.excluded.map((x) => [esc(x.day), esc(x.reason)]),
            )
          : '') +
        `<div class="form-foot">${result.items.length ? btn('settle-confirm', '确认生成结算单', { style: 'btn primary' }) : ''}</div>`,
    );
    return;
  }
  if (mode === 'opening') {
    p.opening = true;
    p.fee_carries = [];
    for (const t of session.meta.teachers)
      for (const r of t.rules) {
        const u = p['carry_units_' + r.id],
          a = p['carry_fee_' + r.id];
        if (u || a) {
          if (!u || !a) throw Error('请同时填写累计次数与累计课酬');
          p.fee_carries.push({ rule: r.id, units: u, amount: a });
        }
        delete p['carry_units_' + r.id];
        delete p['carry_fee_' + r.id];
      }
  }
  if (mode === 'student' && edit) p.edit = true;
  if (mode === 'receipt' || mode === 'refund') p.kind = mode;
  if (p.contract_reduction === '') delete p.contract_reduction;
  if (mode === 'pay' && bill) p.settlement = bill;
  if (mode === 'review_fee') p.fee = ref;
  if (['resolve_line', 'arrear'].includes(mode)) p.line = ref;
  if (mode === 'resolve_line') p.cover_owed = p.cover_owed === 'yes';
  if (['correct', 'request_change'].includes(mode)) p.lesson = ref;
  if (mode === 'access') {
    p.account = ref;
    p.students = new FormData(f).getAll('grant');
    delete p.grant;
  }
  if ('can_record' in p) p.can_record = p.can_record === 'yes';
  let result;
  if (mode === 'new_account') result = await api('/api/web/accounts', { data: p });
  else result = await write({ opening: 'package', refund: 'cash', receipt: 'cash' }[mode] || mode, p);
  toast('已保存');
  closeDialog();
  session.meta = { ...session.meta, ...(await read('meta')) };
  if (mode === 'student') go('profile', { id: result.id });
  else if (['package', 'opening'].includes(mode)) go('profile', { id: p.student });
  else reload();
};
actions['settle-confirm'] = async () => {
  await write('settle', entryState.settlement);
  toast('已生成结算单');
  go('accounts', { tab: 'bills' });
};

function renderManual() {
  const { v, students, packages, correct } = manualState;
  const rows = v.lines
    .map((r, i) => {
      const student = students.find((s) => s.id === r.student);
      const applicable = packages.filter(
        (p) =>
          student &&
          p.member_ids.includes(r.student) &&
          p.type === v.type &&
          (!v.course || p.course === v.course) &&
          p.since <= v.day &&
          (!p.until_day || p.until_day >= v.day),
      );
      const opts = [['', '自动匹配唯一适用课包'], ...asOptions(applicable, packName)];
      if (r.pack && !applicable.some((p) => p.id === r.pack))
        opts.push([r.pack, r.pack + '（请核对适用日期与课型）']);
      return `<fieldset><legend>学生 ${i + 1}</legend><div class="form-grid">${field('student_' + i, '学生', { required: true, options: [['', '请选择学生'], ...asOptions(students, (s) => s.name + ' · ' + s.id)], value: r.student, attrs: 'data-change="manual-student"' })}${select('pack_' + i, '扣课课包', opts, r.pack, false)}${field('state_' + i, '出勤', { value: r.state || 'present', options: states, attrs: 'data-change="manual-state"' })}${qtyField('units_' + i, '本次扣课次数', r.units ?? '1')}
      ${admin() ? moneyField('source_fee_' + i, '原表课酬（选填）', r.source_fee ?? '', false) + moneyField('source_value_' + i, '原表消课金额（选填）', r.source_value ?? '', false) : ''}
      ${field('content_' + i, '本节内容', { value: r.content, type: 'textarea' })}${field('next_focus_' + i, '下次重点', { value: r.next_focus, type: 'textarea' })}</div></fieldset>`;
    })
    .join('');
  return `<form data-form="manual" id="manual-form"><div class="form-grid">${select('teacher', '实际授课老师', teacherOptions(), v.teacher)}
    ${field('type', '授课课型', { options: types, value: v.type, attrs: 'data-change="manual-type"' })}
    ${field('day', '上课日期', { value: v.day, type: 'date', required: true, attrs: 'data-change="manual-day"' })}${field('clock', '开始时间', { value: v.clock, type: 'time' })}
    ${field('course', '课程 / 科目', { value: v.course, attrs: 'data-change="manual-course"' })}${field('minutes', '实际授课分钟', { type: 'number', value: v.minutes, required: true, attrs: 'min="1" max="1440"' })}
    ${text('scene', '场次编号（无开始时间时必填）', v.scene)}
    ${admin() ? select('scope', '原表课酬口径', { student: '逐学生', session: '整场', unknown: '待核' }, v.scope) : ''}</div>${rows}
    ${admin() && v.day < session.meta.activation ? `<fieldset><legend>启用日前的历史</legend><div class="form-grid">${select('history_mode', '期初归属', { included: '已包含期初，只补历史', omitted: '已核实尚未计入期初' }, v.history_mode || 'included')}${moneyField('history_percent', '当时核实分成百分比（选填）', v.history_percent ?? '', false)}${text('history_reason', '历史或期初依据', v.history_reason)}</div></fieldset>` : ''}
    ${correct ? reason('更正原因') : ''}<p class="page-error" role="alert"></p><div class="form-foot">${submitButton(correct ? '预览更正' : '预览扣课与课酬')}</div></form>`;
}
function captureManual(f) {
  const data = values(f),
    v = manualState.v;
  for (const k of [
    'teacher',
    'course',
    'type',
    'day',
    'clock',
    'minutes',
    'scene',
    'scope',
    'history_mode',
    'history_percent',
    'history_reason',
  ])
    if (k in data) v[k] = data[k];
  v.lines.forEach((r, i) => {
    for (const k of [
      'student',
      'pack',
      'state',
      'units',
      'source_fee',
      'source_value',
      'content',
      'next_focus',
    ])
      if (k + '_' + i in data) r[k] = data[k + '_' + i];
  });
  manualState.reason = data.reason || '';
}
function redrawManual() {
  const root = $('#manual-slot');
  root.innerHTML = renderManual();
  if (manualState.reason && root.querySelector('[name=reason]'))
    root.querySelector('[name=reason]').value = manualState.reason;
}
changes['manual-type'] = (el) => {
  captureManual(el.form);
  const v = manualState.v;
  v.minutes = v.type === 'solo' ? 45 : 60;
  v.lines = v.lines.slice(0, v.type === 'solo' ? 1 : 2);
  if (v.type === 'duo' && v.lines.length === 1) v.lines.push({});
  v.lines.forEach((r) => (r.pack = ''));
  redrawManual();
};
changes['manual-student'] = (el) => {
  captureManual(el.form);
  const v = manualState.v,
    i = Number(el.name.split('_')[1]);
  v.lines[i].pack = '';
  const s = manualState.students.find((x) => x.id === el.value);
  if (s && (!v.course || v.type === 'solo')) {
    v.course = defaultCourse(s, manualState.packages, v.teacher);
  }
  redrawManual();
};
changes['manual-course'] = (el) => {
  captureManual(el.form);
  manualState.v.lines.forEach((r) => (r.pack = ''));
  redrawManual();
};
changes['manual-day'] = (el) => {
  captureManual(el.form);
  redrawManual();
};
changes['manual-state'] = (el) => {
  const f = el.form,
    i = el.name.split('_')[1];
  f.elements['units_' + i].value = ['leave', 'cancel'].includes(el.value) ? '0' : '1';
};
function defaultCourse(student, packages, instructor) {
  if (!student) return '';
  const mine = packages.filter((p) => p.member_ids.includes(student.id));
  const leads = mine.filter((p) => p.main_at_sale === instructor);
  const courses = [...new Set((leads.length ? leads : mine).map((p) => p.course))];
  if (!courses.length || courses.includes(student.course)) return student.course;
  return courses.length === 1 ? courses[0] : '';
}
pages.manual = async (p) => {
  if (!canRecord()) throw Error('此账号只有查看权限');
  const [students, packages, d] = await Promise.all([
    read('students'),
    read('packages', { asof: '9999-12-31' }),
    p.correct ? read('lesson', { id: p.correct }) : null,
  ]);
  if (d && !d.payload) throw Error('关联更正需要管理员权限');
  const s = students.find((x) => x.id === p.student);
  manualState = {
    students,
    packages,
    correct: p.correct,
    reason: '',
    v: d
      ? structuredClone(d.payload)
      : {
          teacher: admin()
            ? s?.main_teacher || session.meta.account.teacher || session.meta.teachers[0].id
            : session.meta.account.teacher,
          course: defaultCourse(s, packages, admin() ? s?.main_teacher : session.meta.account.teacher),
          type: 'solo',
          day: session.meta.today,
          minutes: 45,
          clock: '',
          scope: 'student',
          scene: '',
          lines: [{ student: s?.id || '', state: 'present', units: '1' }],
        },
  };
  return (
    crumb('lessons', '课时记录') +
    head(
      d ? '更正授课场次' : '手动记课',
      d ? '保存时保留原始场次，生成关联变更' : '核对实际老师、出勤与扣课课包后保存',
    ) +
    panel('授课信息', '<div id="manual-slot">' + renderManual() + '</div>')
  );
};
forms.manual = async (f) => {
  captureManual(f);
  const { correct, v, reason: why } = manualState;
  if (!v.clock && !v.scene) throw Error('请填写开始时间或唯一场次编号');
  const payload = correct ? { lesson: correct, replacement: v, reason: why } : { lesson: v };
  const out = await write(correct ? 'correct_preview' : 'manual_preview', payload);
  if (!correct && ['duplicate', 'revision'].includes(out.status)) {
    showDialog(
      out.status === 'duplicate' ? '已有相同授课' : '已有疑似修订',
      `<p>${esc(out.message || '请查看已登记场次。')}</p>${out.lesson ? link('record', '查看原记录', { id: out.lesson }, 'btn primary') : ''}`,
    );
    return;
  }
  previewState = { op: correct ? 'correct' : 'manual', payload: { ...payload, signature: out.signature } };
  const d = out.detail;
  showDialog(
    '确认本次' + (correct ? '更正' : '记课'),
    `<p>${esc(d.day + ' ' + d.clock)} · ${esc(teacher(d.teacher))} · ${d.minutes} 分钟</p>${table(
      ['学生', '对应课包', '本次扣课', '扣后余课', '消课金额', '核对状态'],
      d.lines.map((r) => [
        esc(studentsName(r.student)),
        esc(r.pack || '待核'),
        qty(r.units),
        r.remaining_after == null ? '待核' : qty(r.remaining_after),
        d.history ? '已含期初' : yuan(r.value),
        badge(r.status),
      ]),
    )}${table(
      ['系统课酬', '最终金额', '核对依据'],
      d.fees.map((f) => [
        yuan(f.calculated),
        d.history ? '已含期初' : yuan(f.final),
        esc(f.reason || '按规则确认'),
      ]),
    )}<div class="form-foot">${btn('close', '返回修改')}${btn('manual-confirm', '确认保存', { style: 'btn primary' })}</div>`,
  );
};
function studentsName(id) {
  return manualState.students.find((s) => s.id === id)?.name || id;
}
actions['manual-confirm'] = async () => {
  const r = await write(previewState.op, previewState.payload);
  toast('授课记录已保存');
  go('record', { id: r.replacement || r.lesson || r.id });
};
