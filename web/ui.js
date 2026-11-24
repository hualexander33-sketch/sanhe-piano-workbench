export const session = { meta: null, filter: { period: 'month' }, demo: false };
export const pages = Object.create(null),
  actions = Object.create(null),
  forms = Object.create(null),
  changes = Object.create(null);
export const $ = (selector, root = document) => root.querySelector(selector);
export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const icon = (name) =>
  `<svg class="icon" aria-hidden="true"><use href="/assets/icons.svg#${esc(name)}"></use></svg>`;
export const types = { solo: '45 分钟一对一', duo: '60 分钟一对二' };
export const states = { present: '到课', leave: '请假', cancel: '取消', absent_charge: '缺席扣课' };
export const roles = { owner: '老板管理员', ops: '运营管理员', teacher: '授课老师' };
export const names = { HU: '胡老师', JIA: '嘉老师', PENG: '彭老师', WEN: '文老师' };
export const statuses = {
  ok: '已确认',
  pending: '待核',
  history: '已含期初',
  posted: '可入账',
  issue: '需处理',
  revision: '疑似修订',
  duplicate: '重复跳过',
  withdrawn: '已撤回',
  none: '无扣课',
};
export const periods = { week: '本周', month: '本月', quarter: '本季', year: '本年', custom: '自定义' };
export const admin = () => !!session.meta && session.meta.account.role !== 'teacher';
export const owner = () => session.meta?.account.role === 'owner';
export const canRecord = () => admin() || !!session.meta?.account.can_record;
export const teacher = (id) =>
  session.meta?.teachers.find((t) => t.id === id)?.name || names[id] || id || '—';
export const teacherOptions = () => session.meta.teachers.map((t) => [t.id, t.name]);
export const money = (v) =>
  v == null
    ? '待核'
    : (Number(v) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const yuan = (v) => (v == null ? '待核' : '¥' + money(v));
export const qty = (v) => (Number(v) / 1000).toLocaleString('zh-CN', { maximumFractionDigits: 3 });
export const tag = (s, tone = '') => `<span class="tag ${esc(tone)}">${esc(s)}</span>`;
export const badge = (k) =>
  tag(
    statuses[k] || k || '—',
    ['pending', 'issue', 'revision'].includes(k) ? 'amber' : k === 'ok' || k === 'posted' ? 'green' : '',
  );
export function path(page, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== '' && v != null),
  ).toString();
  return '#/' + page + (query ? '?' + query : '');
}
export function route() {
  const [page, query] = (location.hash.replace(/^#\/?/, '') || 'home').split('?');
  return { page, params: Object.fromEntries(new URLSearchParams(query)) };
}
export function go(page, params = {}) {
  closeDialog();
  const hash = path(page, params);
  if (location.hash === hash) return reload();
  location.hash = hash;
}
export const reload = () => window.dispatchEvent(new Event('qh-render'));
export const link = (page, label, params = {}, className = 'text-link', glyph = '') =>
  `<a class="${esc(className)}" href="${esc(path(page, params))}">${glyph ? icon(glyph) : ''}${esc(label)}</a>`;
export const btn = (act, label, { id = '', style = 'btn', glyph = '', attrs = '' } = {}) =>
  `<button type="button" class="${esc(style)}" data-act="${esc(act)}" data-id="${esc(id)}" ${attrs}>${glyph ? icon(glyph) : ''}${esc(label)}</button>`;
export function field(
  key,
  label,
  { type = 'text', value = '', options, required = false, hint = '', attrs = '', wide = false } = {},
) {
  const attr = `name="${esc(key)}" ${required ? 'required' : ''} ${attrs}`;
  const opts = Array.isArray(options) ? options : Object.entries(options || {});
  let input;
  if (options)
    input = `<select ${attr}>${opts
      .map((item) => {
        const [v, n] = Array.isArray(item) ? item : [item, item];
        return `<option value="${esc(v)}" ${String(value) === String(v) ? 'selected' : ''}>${esc(n)}</option>`;
      })
      .join('')}</select>`;
  else if (type === 'textarea') input = `<textarea rows="2" ${attr}>${esc(value)}</textarea>`;
  else input = `<input type="${esc(type)}" value="${esc(value)}" ${attr}>`;
  return `<label class="field ${wide ? 'wide' : ''}"><span>${esc(label)}${required ? ' <em>*</em>' : ''}</span>${input}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
}
export const values = (form) => Object.fromEntries(new FormData(form));
export const submitButton = (text, glyph = '') =>
  `<button class="btn primary" type="submit">${glyph ? icon(glyph) : ''}${esc(text)}</button>`;
export const head = (title, sub = '', controls = '') =>
  `<header class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div><div class="actions">${controls}</div></header>`;
export const panel = (title, body, action = '', extra = '') =>
  `<section class="panel ${esc(extra)}"><header class="panel-head"><h2>${esc(title)}</h2>${action}</header>${body}</section>`;
export const empty = (msg = '所选时间内暂无记录') =>
  `<div class="empty">${icon('book')}<span>${esc(msg)}</span></div>`;
export function table(headers, rows, msg) {
  if (!rows.length) return empty(msg);
  return `<div class="table-scroll" tabindex="0" aria-label="可横向滚动的明细"><table><thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((c) => `<td>${c ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export const avatar = (name, tid = '') =>
  `<span aria-hidden="true" class="avatar ${['HU', 'JIA', 'PENG', 'WEN'].includes(tid) ? tid : ''}">${esc(String(name || '琴').slice(0, 1))}</span>`;
export function person(id) {
  return `<span class="person">${avatar(teacher(id), id)}<b>${esc(teacher(id))}</b></span>`;
}
export function showDialog(title, html) {
  const el = $('#modal');
  $('#modal-body').innerHTML =
    `<div class="modal-top"><h2 id="modal-title">${esc(title)}</h2>${btn('close', '', { style: 'icon-btn', glyph: 'close', attrs: 'aria-label="关闭窗口"' })}</div><div class="modal-content">${html}</div><p class="form-error" role="alert"></p>`;
  if (!el.open) el.showModal();
  el.scrollTop = 0;
}
export const closeDialog = () => {
  const d = $('#modal');
  if (d?.open) d.close();
};
actions.close = closeDialog;
export function toast(msg, error = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = error ? 'shown bad' : 'shown';
  clearTimeout(el.timer);
  el.timer = setTimeout(() => (el.className = ''), 4200);
}
export function fail(e) {
  const error = e instanceof Error ? e.message : String(e);
  const box = $('#modal[open] .form-error') || $('.page-error') || $('#login-error');
  if (box) {
    box.textContent = error;
    box.scrollIntoView({ block: 'nearest' });
  } else toast(error, true);
}
export async function api(url, { data, headers = {} } = {}) {
  const options = {
    method: data === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: { ...headers },
  };
  if (data !== undefined) {
    options.body = JSON.stringify(data);
    options.headers['Content-Type'] = 'application/json';
    if (session.meta) options.headers['X-CSRF-Token'] = session.meta.csrf;
  }
  let r;
  try {
    r = await fetch(url, options);
  } catch {
    throw new Error('网络连接中断。请恢复连接后重试同一次操作。');
  }
  let out;
  try {
    out = await r.json();
  } catch {
    throw new Error('服务响应不完整。请检查网络后重试。');
  }
  if (!r.ok) {
    if (r.status === 401 && session.meta) {
      session.meta = null;
      window.dispatchEvent(new Event('qh-logged-out'));
    }
    const err = new Error(out.error || '操作未完成');
    err.status = r.status;
    throw err;
  }
  return out;
}
export const read = (op, p = {}) =>
  api(
    '/api/read/' +
      op +
      '?' +
      new URLSearchParams(Object.entries(p).filter(([, v]) => v !== '' && v != null)),
  );
const pending = new Map();
function fingerprint(text) {
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return a.toString(36) + '_' + b.toString(36) + '_' + text.length;
}
export async function write(op, data) {
  const slot = 'qh-retry-' + fingerprint(session.meta.account.id + ':' + op + JSON.stringify(data));
  let stored = pending.get(slot);
  try {
    stored = stored || sessionStorage.getItem(slot);
  } catch {}
  const id =
    stored ||
    Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16).padStart(8, '0')).join('');
  pending.set(slot, id);
  try {
    sessionStorage.setItem(slot, id);
  } catch {}
  const clear = () => {
    pending.delete(slot);
    try {
      sessionStorage.removeItem(slot);
    } catch {}
  };
  try {
    const out = await api('/api/do/' + op, { data, headers: { 'Idempotency-Key': id } });
    clear();
    return out;
  } catch (e) {
    if (e.status && e.status < 500) clear();
    throw e;
  }
}
export function download(filename, blob) {
  const a = document.createElement('a'),
    url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportCsv(p) {
  const r = await read('export', p);
  download(r.filename, new Blob([r.text], { type: 'text/csv;charset=utf-8' }));
  toast('已导出 ' + r.count + ' 行');
}
export const metrics = (arr) =>
  `<div class="mini-metrics">${arr.map(([label, value]) => `<div><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join('')}</div>`;
export const crumb = (page, name, params = {}) => link(page, '‹ ' + name, params, 'back-link');
export function scopeBar(r) {
  const f = session.filter;
  const extra = [f.teacher && teacher(f.teacher), f.course, f.type && types[f.type]].filter(Boolean);
  return `<section class="periodbar"><div class="segments" aria-label="统计周期">${Object.entries(periods)
    .map(([k, v]) => btn('period', v, { id: k, style: 'segment ' + (f.period === k ? 'active' : '') }))
    .join(
      '',
    )}</div><div class="period-end"><span>${esc(r.start)} — ${esc(r.end)}</span>${btn('filters', extra.join(' · ') || '筛选', { glyph: 'filter', style: 'btn small' })}</div></section>`;
}
actions.period = (el) => {
  const p = el.dataset.id;
  if (p === 'custom') {
    actions.filters(el, true);
    return;
  }
  session.filter = { ...session.filter, period: p };
  delete session.filter.start;
  delete session.filter.end;
  reload();
};
actions.filters = (el, custom = false) => {
  const f = session.filter;
  showDialog(
    '统计范围',
    `<form data-form="filters"><div class="form-grid">${field('period', '周期', { options: periods, value: custom === true ? 'custom' : f.period })}${field('anchor', '定位日期', { type: 'date', value: f.anchor || session.meta.today })}${field('start', '自定义起日', { type: 'date', value: f.start || session.meta.today.slice(0, 7) + '-01' })}${field('end', '自定义止日', { type: 'date', value: f.end || session.meta.today })}${admin() ? field('teacher', '授课老师', { options: [['', '全部老师'], ...teacherOptions()], value: f.teacher }) : ''}${field('course', '课程或科目', { value: f.course })}${field('type', '课型', { options: [['', '全部课型'], ...Object.entries(types)], value: f.type })}</div><div class="form-foot">${submitButton('应用筛选')}</div></form>`,
  );
};
forms.filters = (f) => {
  const p = values(f);
  if (p.period !== 'custom') {
    delete p.start;
    delete p.end;
  } else if (!p.start || !p.end || p.start > p.end) throw Error('请核对起止日期');
  session.filter = p;
  closeDialog();
  reload();
};
