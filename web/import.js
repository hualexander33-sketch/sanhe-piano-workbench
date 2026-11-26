import {
  session,
  $,
  esc,
  icon,
  head,
  panel,
  field,
  btn,
  link,
  empty,
  table,
  tag,
  badge,
  metrics,
  teacher,
  types,
  qty,
  money,
  yuan,
  admin, readOnly,
  read,
  write,
  go,
  reload,
  pages,
  actions,
  forms,
  changes,
  values,
  showDialog,
  closeDialog,
  submitButton,
  toast,
  fail,
  download,
  exportCsv,
  crumb,
} from './ui.js';

import {adaptiveTable,pagingLinks} from './visuals.js';
const phases = ['上传文件', '字段映射', '数据预览', '异常核对', '确认导入', '批次结果'];
const scopes = {
  unknown: '待确认',
  student: '逐学生金额',
  session: '整场金额',
  weekly: '每周合计，仅作对账',
};
const commonKeys = [
  'day',
  'teacher',
  'student',
  'type',
  'clock',
  'scene',
  'course',
  'pack',
  'record',
  'source_fee',
  'units',
  'source_value',
  'source_unit',
  'minutes',
  'state',
];
function blank() {
  return {
    stage: 1,
    first: 1,
    sheet: '',
    file: null,
    headers: [],
    fields: {},
    templates: [],
    source: '周表',
    name: '每周课时表模板',
    overrides: {},
    page: 0,
    config: {
      header: 1,
      mapping: {},
      scope: 'unknown',
      date_format: 'ymd',
      skip_words: ['合计', '小计', '备注', '总计'],
      durations: { solo: 45, duo: 60 },
    },
  };
}
let draft = blank();
window.addEventListener('qh-clear', () => {
  draft = blank();
});
function flow() {
  return `<ol class="stepper">${phases.map((p, i) => `<li class="${i + 1 === draft.stage ? 'active' : i + 1 < draft.stage ? 'done' : ''}"><span>${i + 1 < draft.stage ? icon('check') : i + 1}</span>${p}</li>`).join('')}</ol>`;
}
function picker() {
  const f = draft.file;
  const top = `<div class="dropzone" id="dropzone"><div class="drop-icon">${icon('import')}</div><h3>${f ? esc(f.name) : '选择或拖入每周课时表'}</h3><p>Excel（.xlsx）或 CSV，最大 4 MiB</p><label class="btn primary filepick">${icon('file')}${f ? '重新选择文件' : '选择文件'}<input type="file" aria-label="选择周表文件" id="week-file" accept=".csv,.xlsx" data-change="pick-file"></label></div>`;
  const sheet = f
    ? `<form data-form="sheet"><div class="form-grid">${field('sheet', '工作表', { options: f.sheets, value: draft.sheet })}${field('header', '表头所在行', { type: 'number', value: draft.first, required: true, attrs: 'min="1" max="5000"' })}</div><div class="form-foot">${submitButton('继续字段对应', 'arrow')}</div></form>`
    : '';
  return (
    panel('上传文件', top + sheet) +
    (session.demo
      ? panel(
          '模拟导入文件',
          `<p class="muted">附录示例包含 3 场授课，其中一场为两名学生共上一节。Excel 的列名在第 2 行。</p><div class="action-list">${btn('sample-week', '载入模拟 Excel', { glyph: 'file' })}<a href="/api/examples/0" download class="text-link">下载整场课酬 Excel</a><a href="/api/examples/1" download class="text-link">下载逐学生 CSV</a><a href="/api/examples/2" download class="text-link">下载双人宽表 CSV</a></div>`,
        )
      : '')
  );
}
async function accept(result, sample = false) {
  draft = blank();
  draft.file = result;
  draft.sheet = result.sheets[0];
  draft.first = sample ? 2 : 1;
  if (sample) {
    draft.config.scope = 'session';
    draft.sheet = result.sheets.includes('每周明细') ? '每周明细' : draft.sheet;
  } else {
    const first = await read('inspect', { file: result.file, sheet: draft.sheet, header: 1 });
    if (Object.keys(first.suggested).length < 2) {
      const known = new Set(Object.values(first.fields));
      const i = first.sample.findIndex((row) => row.filter((c) => known.has(c)).length >= 3);
      if (i >= 0) draft.first = i + 2;
    }
  }
  reload();
}
async function upload(file) {
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) throw Error('请选择大小在 4 MiB 以内的周表');
  const encoded = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(Error('文件未能读取'));
    reader.readAsDataURL(file);
  });
  const f = await write('upload', { name: file.name, base64: encoded });
  await accept(f);
}
changes['pick-file'] = (el) => upload(el.files[0]);
document.addEventListener('dragover', (e) => {
  if (e.target.closest?.('#dropzone')) {
    e.preventDefault();
    $('#dropzone').classList.add('drag');
  }
});
document.addEventListener('dragleave', (e) => {
  e.target.closest?.('#dropzone')?.classList.remove('drag');
});
document.addEventListener('drop', async (e) => {
  const zone = e.target.closest?.('#dropzone');
  if (!zone) return;
  e.preventDefault();
  zone.classList.remove('drag');
  try {
    await upload(e.dataTransfer.files[0]);
  } catch (err) {
    fail(err);
  }
});
actions['sample-week'] = async () => accept(await write('demo_file', {}), true);
actions['import-new'] = () => {
  draft = blank();
  go('import');
};
async function openBatch(id) {
  const b = await read('batch', { id }),
    c = b.definition || {},
    info = await read('inspect', { file: b.file, sheet: b.sheet, header: c.header || 1 });
  draft = {
    ...blank(),
    stage: b.result ? 6 : 2,
    id: b.id,
    file: { file: b.file, name: b.name, sheets: info.sheets },
    sheet: b.sheet,
    first: c.header || 1,
    info,
    config: c,
    source: b.namespace,
    overrides: b.overrides || {},
    report: b.result,
    locked: !!b.result,
    versions: b.versions,
    actor: b.actor,
    created: b.created,
    batchRoute: id,
  };
}
forms.sheet = async (f) => {
  const d = values(f);
  draft.sheet = d.sheet;
  draft.first = Number(d.header);
  const info = await read('inspect', { file: draft.file.file, sheet: d.sheet, header: d.header });
  if (info.existing?.confirmed) {
    await openBatch(info.existing.id);
    go('import', { batch: info.existing.id });
    toast('该工作表已导入，已打开原批次');
    return;
  } else {
    draft.info = info;
    draft.config = { ...draft.config, header: draft.first, mapping: info.suggested };
    draft.stage = 2;
  }
  reload();
};
function mappingField(key) {
  const { info, config } = draft;
  return field('map_' + key, info.fields[key], {
    options: [['', '忽略 / 留待核对'], ...info.headers.filter(Boolean).map((v) => [v, v])],
    value: config.mapping?.[key] || '',
  });
}
function mapping() {
  const { info, config } = draft;
  const basic = commonKeys.filter((k) => k in info.fields),
    extra = Object.keys(info.fields).filter((k) => !basic.includes(k));
  const templates = info.templates.map((t, i) => [String(i), t.name + (t.changed ? ' · 表头有变化' : '')]);
  const sample = table(
    info.headers,
    info.sample.map((row) => row.map(esc)),
    '此工作表没有数据行',
  );
  const aliases = Object.entries(config.aliases || {})
    .map(([a, b]) => a + '=' + b)
    .join('，');
  return (
    panel(
      '原表预览',
      `<p class="file-caption">${icon('file')} ${esc(draft.file.name)} <span>${esc(draft.sheet)} · 表头第 ${draft.first} 行</span></p>${sample}`,
    ) +
    panel(
      '字段对应',
      `<form data-form="import-preview" id="mapping"><div class="form-grid">${field('template', '复用映射模板', { options: [['', '选择已保存模板'], ...templates], attrs: 'data-change="choose-template"' })}
    ${field('scope', '原表老师课时费口径', { options: scopes, value: config.scope, required: true, hint: '整场金额在同场两行重复填写时只计一次。' })}</div>
    <div class="mapping-grid">${basic.map(mappingField).join('')}</div><details><summary>更多字段与导入规则</summary><div class="mapping-grid">${extra.map(mappingField).join('')}</div>
    <div class="form-grid">${field('namespace', '数据来源名称', { value: draft.source, required: true, hint: '同一来源跨周沿用同一名称，以匹配稳定记录编号。' })}
    ${field('date_format', '日期格式', { options: { ymd: '年-月-日', dmy: '日/月/年', mdy: '月/日/年', excel: 'Excel 日期序号' }, value: config.date_format || 'ymd' })}
    ${field('default_type', '缺失课型时的默认值', { options: [['', '从来源列识别'], ...Object.entries(types)], value: config.default_type })}
    ${field('aliases', '老师简称（例如 阿嘉=JIA）', { value: aliases })}${field('skip_words', '跳过汇总或备注的关键词', { value: (config.skip_words || []).join('，') })}
    ${field('solo_minutes', '一对一默认分钟', { type: 'number', value: config.durations?.solo || 45, attrs: 'min="1"' })}
    ${field('duo_minutes', '一对二默认分钟', { type: 'number', value: config.durations?.duo || 60, attrs: 'min="1"' })}</div></details>
    <div class="template-save">${field('name', '模板名称', { value: draft.name })}${btn('save-template', '保存映射模板')}</div>
    <div class="form-foot">${btn('import-step', '重新选表', { id: '1' })}${submitButton('生成校验预览', 'arrow')}</div></form>`,
    )
  );
}
function capture() {
  const v = values($('#mapping')),
    mapping = {},
    aliases = {};
  for (const k of Object.keys(draft.info.fields)) if (v['map_' + k]) mapping[k] = v['map_' + k];
  for (const item of (v.aliases || '')
    .split(/[,，\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [name, id] = item.split('=').map((s) => s.trim());
    if (!name || !['HU', 'JIA', 'PENG', 'WEN'].includes(id)) throw Error('简称请按 阿嘉=JIA 填写');
    aliases[name] = id;
  }
  draft.name = v.name;
  draft.source = v.namespace;
  draft.config = {
    header: draft.first,
    mapping,
    scope: v.scope,
    default_type: v.default_type,
    date_format: v.date_format,
    aliases,
    skip_words: v.skip_words
      .split(/[,，\n]+/)
      .map((s) => s.trim())
      .filter(Boolean),
    durations: { solo: v.solo_minutes, duo: v.duo_minutes },
  };
}
changes['choose-template'] = (el) => {
  if (el.value === '') return;
  const t = draft.info.templates[Number(el.value)],
    c = structuredClone(t.definition);
  c.header = draft.first;
  c.mapping = Object.fromEntries(
    Object.entries(c.mapping).filter(([, v]) => draft.info.headers.includes(v)),
  );
  draft.config = c;
  draft.name = t.name;
  reload();
  if (t.changed) toast('表头已变化，请复核字段对应');
};
actions['save-template'] = async () => {
  capture();
  if (!draft.name.trim()) throw Error('请填写模板名称');
  await write('template', {
    file: draft.file.file,
    sheet: draft.sheet,
    header: draft.first,
    name: draft.name,
    definition: draft.config,
  });
  draft.info = await read('inspect', { file: draft.file.file, sheet: draft.sheet, header: draft.first });
  reload();
  toast('映射模板已保存');
};
async function preview() {
  draft.report = await write('preview', {
    file: draft.file.file,
    sheet: draft.sheet,
    namespace: draft.source,
    definition: draft.config,
    overrides: draft.overrides,
  });
  draft.id = draft.report.id;
  draft.stage = 3;
  draft.page = 0;
  closeDialog();
  reload();
}
forms['import-preview'] = async () => {
  capture();
  await preview();
};
actions['import-step'] = (el) => {
  draft.page = 0;
  draft.stage = Number(el.dataset.id);
  reload();
};
actions['confirm-import'] = async () => {
  const r = await write('confirm', { batch: draft.id, signature: draft.report.signature });
  await openBatch(r.id);
  go('import', { batch: r.id });
  toast('批次已保存');
};
actions['show-fix'] = (el) => {
  showDialog(
    '修正来源行',
    `<form data-form="fix-row"><div class="form-grid">${field('row', '原表行号', { type: 'number', value: el.dataset.id.split(',')[0], required: true, attrs: 'min="1"' })}${field('key', '需要更正的字段', { options: draft.info.fields, value: 'student' })}${field('value', '核实后的值', { wide: true, hint: '重名学生请填写独立学生编号。' })}</div><div class="form-foot">${submitButton('应用并重新预览')}</div></form>`,
  );
};
forms['fix-row'] = async (f) => {
  const { row, key, value } = values(f);
  draft.overrides[row] = { ...draft.overrides[row], [key]: value };
  await preview();
};
actions['batch-change'] = (el) => {
  const op = el.dataset.id,
    key = el.dataset.key || '';
  showDialog(
    op === 'revise' ? '确认关联修订' : '撤回本批授课',
    `<form data-form="batch-change"><p>${op === 'revise' ? '按原表新值处理原记录，保留更正关系。' : '将同时冲回可撤回的扣课与课酬。存在后续依赖时请从场次详情办理。'}</p><input type="hidden" name="op" value="${esc(op)}"><input type="hidden" name="row_key" value="${esc(key)}">${field('reason', '处理依据', { type: 'textarea', required: true })}<div class="form-foot">${submitButton('确认处理')}</div></form>`,
  );
};
forms['batch-change'] = async (f) => {
  const { op, row_key, reason } = values(f);
  await write(op, { batch: draft.id, row_key, reason });
  await openBatch(draft.id);
  closeDialog();
  reload();
  toast('已记录处理结果');
};
actions['batch-original'] = async () => {
  const f = await read('file', { id: draft.file.file });
  const bin = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
  download(f.name, new Blob([bin]));
};
actions['batch-issues'] = () => exportCsv({ kind: 'issues', batch: draft.id });
actions['group-page'] = (el) => {
  draft.page += Number(el.dataset.id);
  reload();
};
function result(current) {
  const r = draft.report,
    s = r.stats,
    final = draft.stage === 6;
  const groups=draft.stage===4?r.groups.filter(g=>g.status!=='posted'||g.detail?.fees?.some(f=>f.status==='pending')||g.detail?.lines?.some(l=>l.status==='pending')):r.groups;
  const sections = groups.slice(draft.page * 20, draft.page * 20 + 20).map((g) => {
    const d = g.detail || {},
      p = g.payload || {},
      fees = d.fees || [],
      lines = d.lines || [];
    const pending = fees.some((f) => f.status === 'pending') || lines.some((l) => l.status === 'pending');
    const status =
      g.status === 'posted'
        ? pending
          ? tag('部分待核', 'amber')
          : tag(final ? '已入账' : '通过', 'green')
        : badge(g.status);
    const raw = `<details><summary>查看原始行与映射</summary>${g.raw
      .map(
        (row, i) =>
          `<p class="break"><b>第 ${esc(g.numbers[i])} 行</b> ${esc(row.join(' ｜ '))}</p><p class="break">${esc(
            Object.entries(g.mapped[i] || {})
              .filter(([, v]) => v)
              .map(([k, v]) => (draft.info.fields[k] || k) + ' = ' + v)
              .join(' · '),
          )}</p>`,
      )
      .join('')}</details>`;
    const officers = fees
      .map(
        (f) =>
          `<small>原表 ${f.source == null ? esc(JSON.parse(f.source_values).map(yuan).join('、') || '—') : yuan(f.source)} / 系统 ${yuan(f.calculated)} / 差额 ${f.difference == null ? '—' : yuan(f.difference)} / 确认 ${yuan(f.final)} ${esc(f.reason)}</small>`,
      )
      .join('');
    const operations =
      (!final || g.status === 'issue' || g.status === 'revision'
        ? btn('show-fix', '修正来源行', { id: g.row_key, style: 'text-button' })
        : '') +
      (final && g.lesson ? link('record', '授课明细', { id: g.lesson }) : '') +
      (final && g.status === 'revision'
        ? btn('batch-change', '关联更正', {
            id: 'revise',
            style: 'text-button',
            attrs: 'data-key="' + esc(g.row_key) + '"',
          })
        : '');
    return [
      esc(g.numbers.join('、')),
      status,
      `<b>${esc(d.day || p.day || '—')} ${esc(d.clock || p.clock || '')}</b><small>${esc(teacher(d.teacher || p.teacher))} · ${esc(types[d.type || p.type] || '待识别')}</small>`,
      lines
        .map(
          (l) =>
            `<small>${esc(l.student)} · ${esc(l.pack || '课包待核')} · ${qty(l.units)} 次 · ${l.status === 'history' ? '历史' : yuan(l.value)}</small>`,
        )
        .join('') || '—',
      officers || '—',
      `<span>${esc(g.message || '')}</span>${raw}<div class="inline-ops">${operations}</div>`,
    ];
  });
  const counts = metrics([
    ['原始行', s.raw_rows],
    ['授课场次', s.scenes + ' 场'],
    ['学生记录', s.students + ' 条'],
    ['实际时长', s.minutes + ' 分钟'],
    ['扣课次数', qty(s.units)],
    ['确认消课', yuan(s.value)],
    ['确认课酬', yuan(s.earned)],
    ['确认留存', yuan(s.retained)],
    ['待核课酬', s.pending + ' 笔'],
    ['金额差异', s.differences],
    ['问题场次', s.issues],
    ['重复 / 修订', s.duplicate + ' / ' + s.revision],
  ]);
  const latest = current ? metrics([
    ['有效场次', current.scenes + ' 场'],
    ['实际时长', current.minutes + ' 分钟'],
    ['学生记录', current.students + ' 条'],
    ['已扣课', qty(current.units)],
    ['确认消课', yuan(current.value)],
    ['确认课酬', yuan(current.earned)],
    ['确认留存', yuan(current.retained)],
    ['扣课待核', current.pending_lines + ' 条'],
    ['课酬待核', current.pending + ' 笔'],
  ]) : '';
  const controls = final
    ? btn('import-new', '导入下一份', { glyph: 'import', style: 'btn primary' })
    : draft.stage===3?btn('import-step','核对异常',{id:'4',style:'btn primary'}):
      draft.stage===4?btn('import-step','继续确认',{id:'5',style:'btn primary'}):
      btn('confirm-import','确认导入',{glyph:'check',style:'btn primary'});

  const byTeacher = Object.entries(r.teachers).map(([t, x]) => {
    const fees = r.groups
      .filter((g) => g.status === 'posted' && g.detail.teacher === t)
      .flatMap((g) => g.detail.fees);
    const pending = fees.filter((f) => f.status === 'pending').length;
    const confirmed = fees.some((f) => f.status === 'ok');
    const amount = confirmed || !pending ? yuan(x.earned) : '';
    return [
      esc(teacher(t)),
      x.scenes,
      x.minutes,
      [amount, pending ? pending + ' 笔待核' : ''].filter(Boolean).join(' · '),
    ];
  });
  return (
    panel(
      final ? '批次结果' : phases[draft.stage-1]==='数据预览'?'校验预览':phases[draft.stage-1],
      `<p class="file-caption">${icon('file')} ${esc(draft.file.name)} <span>${esc(draft.sheet)}</span></p>${final ? `<section aria-label="本批次当前有效记录">${latest}</section><details><summary>查看确认导入时的快照</summary>${counts}</details>` : counts}<div class="form-foot">${!final && !draft.locked ? btn('import-step', '上一步', { id: String(draft.stage-1) }) : ''}${controls}</div>`,
    ) +
    (draft.stage===5 ? panel('导入范围','<p class="profile-note">按本次预览登记通过的场次。重复行将跳过，异常与修订保留在批次中。</p>') : panel(
      final ? '原始行与确认时记录' : draft.stage===4 ? '需核对的场次' : '逐场核对',
      table(['原表行', '状态', '场次 / 老师', '学生 / 课包 / 消课', '课酬核对', '依据与操作'], sections) +
        `<div class="pager"><span>共 ${groups.length} 场次组 · 第 ${draft.page + 1} 页</span>${draft.page ? btn('group-page', '上一页', { id: '-1' }) : ''}${(draft.page + 1) * 20 < groups.length ? btn('group-page', '下一页', { id: '1' }) : ''}</div>`,
    )) +
    panel(final ? '确认导入时的老师汇总' : '各老师汇总', table(['老师', '实授场次', '实际分钟', '确认课酬'], byTeacher)) +
    (Object.keys(r.weekly || {}).length
      ? panel(
          final ? '确认导入时的周合计核对' : '周合计核对',
          table(
            ['老师', '来源行', '原表周合计', '逐场已核', '差额'],
            Object.entries(r.weekly).map(([t, w]) => [
              esc(teacher(t)),
              esc(w.rows.join('、')),
              yuan(w.reference),
              yuan(w.confirmed),
              w.difference == null ? '待核' : yuan(w.difference),
            ]),
          ),
        )
      : '') +
    (r.skipped?.length
      ? panel(
          '已跳过的行',
          table(
            ['行号', '原值'],
            r.skipped.filter((s) => s.raw.some(Boolean)).map((s) => [s.row, esc(s.raw.join(' ｜ '))]),
          ),
        )
      : '') +
    (final
      ? panel(
          '批次追溯',
          `<p class="muted">${esc(draft.id)} · ${esc(draft.actor)} · ${esc(draft.created)}</p>${r.withdrawn ? `<p>已撤回 · ${esc(r.withdrawn.reason)}</p>` : ''}<div class="action-list">${btn('batch-original', '下载原文件', { glyph: 'export' })}${btn('batch-issues', '导出问题行', { glyph: 'export' })}${btn('batch-change', '撤回批次', { id: 'withdraw_batch', style: 'btn danger' })}</div>${table(
            ['操作', '账号', '时间'],
            (draft.versions || []).map((v) => [esc(v.action), esc(v.actor), esc(v.at)]),
          )}`,
        )
      : '')
  );
}
pages.import = async (p) => {
  if (!admin()) throw Error('每周导入需要管理员权限');
  if(readOnly() || session.meta.shared_edit) {
    if(!p.batch) throw Error('导入文件需要管理身份');
    const [batch,totals]=await Promise.all([read('batch',{id:p.batch,view:'trace',row:p.row,issues:p.issues,trace_page:p.trace_page}),read('batch_totals',{id:p.batch})]);
    const lines=batch.rows.map(r=>[esc(r.row_key),badge(r.status),esc(r.day||'—'),esc(r.teacher?teacher(r.teacher):'—'),esc(r.note||'—'),r.lesson?link('record','授课明细',{id:r.lesson}):'—']);
    const filters=p.row||p.issues?link('import','查看整批',{batch:p.batch},'btn small'):link('import','只看异常',{batch:p.batch,issues:'1'},'btn small');
    return crumb('batches','导入批次')+head('批次结果',batch.name+' · '+batch.sheet)+
      panel('批次记录',metrics([['有效场次',totals.scenes],['已扣课',qty(totals.units)+' 节'],['学生记录',totals.students],['课酬待核',totals.pending+' 笔']]))+
      panel('来源行与核对结果','<div class="page-list" id="list-trace_page">'+adaptiveTable(['来源行','导入结果','上课日期','实际老师','核对说明','明细'],lines,[0,1],p.issues?'没有异常或修订行':'没有符合条件的来源行')+pagingLinks('trace_page',batch.page,batch.count,20)+'</div>',filters)+
      panel('批次来源','<p class="profile-note">'+esc(batch.id)+' · '+esc(batch.actor)+' · '+esc(batch.created)+'</p>');
  }

  if (p.batch && p.batch !== draft.batchRoute) await openBatch(p.batch);
  if (!p.batch && draft.batchRoute && draft.stage === 6) draft = blank();
  const current = draft.stage === 6 ? await read('batch_totals', { id: draft.id }) : null;
  return (
    crumb('lessons', '课时记录') +
    head(
      '每周导入',
      '上传 Excel 或 CSV，逐场核对后入账',
      link('batches', '导入批次', {}, 'btn', 'layers'),
    ) +
    flow() +
    (draft.stage === 1 ? picker() : draft.stage === 2 ? mapping() : result(current)) +
    '<p class="page-error" role="alert"></p>'
  );
};
pages.batches = async (p) => {
  const all=await read('batches');
  const rows=p.issues==='1'?all.filter(row=>row.issues>0):all;
  return (
    crumb('lessons', '课时记录') +
    head(
      '导入批次',
      '追溯原文件、工作表、确认人和问题行',
      (readOnly() || session.meta.shared_edit)?'':btn('import-new', '导入周表', { glyph: 'import', style: 'btn primary' }),
    ) +
    (p.issues==='1'?link('batches','查看全部批次',{},'btn small'):'') +
    panel(
      p.issues==='1'?'有异常的批次':'批次记录',
      table(
        ['文件 / 批次', '工作表', '操作人', '创建时间', '状态'],
        rows.map((r) => [
          link('import', r.name, { batch: r.id,issues:p.issues }) + '<small>' + esc(r.id) + '</small>',
          esc(r.sheet),
          esc(r.actor),
          esc(r.created),
          tag(r.confirmed ? '已确认' : '已预览', r.confirmed ? 'green' : ''),
        ]),
      ),
    )
  );
};
