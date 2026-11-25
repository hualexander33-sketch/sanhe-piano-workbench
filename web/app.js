import {
  session,
  $,
  esc,
  icon,
  path,
  route,
  link,
  btn,
  roles,
  teacher,
  avatar,
  admin,
  canRecord,
  api,
  read,
  field,
  values,
  submitButton,
  showDialog,
  closeDialog,
  toast,
  fail,
  reload,
  pages,
  actions,
  forms,
  changes,
  go,
} from './ui.js';
import './dashboard.js';
import { reportScope } from './ui.js';
import './ledger.js';
import './entries.js';
import './import.js';

const nav = [
  ['home', '首页'],
  ['lessons', '课时'],
  ['students', '学生'],
  ['teachers', '老师'],
  ['accounts', '账目'],
];
const parents = {
  manual: 'lessons',
  record: 'lessons',
  import: 'lessons',
  batches: 'lessons',
  profile: 'students',
  pack: 'students',
  teacher: 'teachers',
  details: 'home',
  settings: 'home',
};
const captions = {
  home: '经营总览',
  lessons: '课时记录',
  students: '学生档案',
  teachers: '老师收入',
  accounts: '账目管理',
  manual: '手动记课',
  record: '授课明细',
  import: '每周导入',
  batches: '导入批次',
  profile: '学生详情',
  pack: '课包详情',
  teacher: '老师详情',
  details: '来源明细',
  settings: '系统设置',
};
const brand = `<span class="brand-mark"><img src="/assets/mark.svg" width="38" height="38" alt=""></span>`;
let epoch = 0;
function loginPage() {
  epoch++;
  closeDialog();
  session.meta = null;
  session.filter = { period: 'month' };
  window.dispatchEvent(new Event('qh-clear'));
  document.title = '登录 · 琴行课时与经营管理系统 V1.0';
  $('#app').innerHTML =
    `<main class="login"><section class="login-photo" aria-label="琴房中的三角钢琴"><div class="photo-brand">${brand}<span>琴行工作台</span></div><div class="photo-title"><div class="photo-line"></div><h1>琴行课时与<br>经营管理系统</h1><p>V1.0</p></div></section><section class="login-panel"><div class="login-inner"><div class="mobile-brand">${brand} 琴行工作台</div><h2>登录工作台</h2><p class="subtext">使用琴行分配的账号，查看课时与账目。</p><form data-form="login" id="login-form">${field('username', '账号', { required: true, attrs: 'autocomplete="username" autocapitalize="none" placeholder="请输入账号"' })}${field('password', '密码', { type: 'password', required: true, attrs: 'autocomplete="current-password" placeholder="请输入密码"' })}<p id="login-error" class="form-error" role="alert"></p>${submitButton('登录', 'arrow')}</form>${session.demo ? `<div class="demo-options"><span>体验模拟账套</span><div>${btn('demo-login', '管理员体验', { id: 'demo-owner', style: 'btn small' })}${btn('demo-login', '教师体验', { id: 'demo-peng', style: 'btn small' })}</div><small>仅含虚构学生与收付记录</small></div>` : ''}</div></section></main>`;
}
function shell() {
  const { account, mode, today } = session.meta;
  const who = account.teacher ? teacher(account.teacher) : account.id;
  const items = nav
    .map(
      ([id, t]) =>
        `<a class="nav-item" href="${path(id)}" data-nav="${id}">${icon(id)}<span>${t}</span></a>`,
    )
    .join('');
  $('#app').innerHTML =
    `<div class="workspace"><aside class="sidebar"><a class="brand" href="#/home">${brand}<span><strong>琴行工作台</strong><small>课时与经营管理系统</small></span></a><nav aria-label="主导航">${items}</nav><div class="side-bottom"><a class="nav-item" href="#/settings" data-nav="settings">${icon('settings')}<span>系统设置</span></a><span class="version">琴行管理系统 <b>V1.0</b></span></div></aside><div class="main-shell"><header class="topbar"><div class="breadcrumbs"><span>工作台</span>${icon('chevron')}<strong id="crumb-current">首页</strong></div><a href="#/home" class="mobile-wordmark">${brand}琴行工作台</a><div class="top-right">${mode === 'demo' ? '<span class="demo-flag"><i></i>模拟账套</span>' : ''}<span class="top-date">${icon('lessons')}${esc(today)}</span><button class="profile-btn" type="button" aria-label="${esc(who)} · 账号设置" data-act="account-menu">${avatar(who, account.teacher)}<span>${esc(who)}</span>${icon('down')}</button></div></header><main id="view" tabindex="-1"></main></div><nav class="mobile-nav" aria-label="手机导航">${items}</nav></div>`;
}
async function render() {
  if (!session.meta) return;
  const { page, params } = route(),
    version = ++epoch;
  if (params.period && ['home','lessons','teachers','teacher','accounts'].includes(page)) {
    session.filter = reportScope(params);
  }
  closeDialog();
  const active = parents[page] || page;
  for (const e of document.querySelectorAll('[data-nav]')) {
    const current = e.dataset.nav === (page === 'settings' ? 'settings' : active);
    e.classList.toggle('current', current);
    if (current) e.setAttribute('aria-current', 'page');
    else e.removeAttribute('aria-current');
  }
  const title = captions[page] || '工作台';
  $('#crumb-current').textContent = title;
  document.title = title + ' · 琴行课时与经营管理系统 V1.0';
  const v = $('#view');
  v.setAttribute('aria-busy', 'true');
  try {
    if (!pages[page]) throw Error('页面不存在');
    const html = await pages[page](params);
    if (version === epoch) {
      v.innerHTML = html;
      v.removeAttribute('aria-busy');
    }
  } catch (e) {
    if (version === epoch) {
      v.innerHTML = `<section class="panel error-box"><h2>无法打开此页</h2><p>${esc(e.message)}</p>${btn('retry', '重试')}</section>`;
      v.removeAttribute('aria-busy');
    }
  }
}
actions.retry = reload;
actions['account-menu'] = () =>
  showDialog(
    '当前账号',
    `<div class="account-line">${avatar(teacher(session.meta.account.teacher), session.meta.account.teacher)}<div><strong>${esc(session.meta.account.id)}</strong><p>${esc(roles[session.meta.account.role])}</p></div></div><div class="action-list">${link('settings', '系统设置', {}, 'btn', 'settings')}${btn('change-password', '修改密码', { glyph: 'lock' })}${btn('logout', '退出登录', { glyph: 'logout' })}</div>`,
  );
actions.logout = async () => {
  await api('/api/logout', { data: {} });
  loginPage();
};
actions['change-password'] = () =>
  showDialog(
    '修改登录密码',
    `<form data-form="password"><div class="form-grid">${field('old', '当前密码', { type: 'password', required: true, wide: true, attrs: 'autocomplete="current-password"' })}${field('new', '新密码', { type: 'password', required: true, wide: true, attrs: 'minlength="10" maxlength="128" autocomplete="new-password"' })}</div><div class="form-foot">${submitButton('保存并重新登录')}</div></form>`,
  );
forms.password = async (f) => {
  await api('/api/web/password', { data: values(f) });
  loginPage();
  toast('密码已更新，请重新登录');
};
async function login(data) {
  const meta = await api('/api/login', { data });
  session.meta = meta;
  session.filter = { period: 'month' };
  shell();
  await render();
}
forms.login = (f) => login(values(f));
actions['demo-login'] = (el) => login({ username: el.dataset.id, password: 'QinhangDemo2026' });
let busy = false;
async function handle(handler, el) {
  if (!handler || busy) return;
  busy = true;
  const b = el.matches('form') ? el.querySelector('button[type="submit"]') : el;
  if (b?.matches('button')) b.disabled = true;
  try {
    const msg = $('#modal[open] .form-error') || $('.page-error') || $('#login-error');
    if (msg) msg.textContent = '';
    await handler(el);
  } catch (e) {
    fail(e);
  } finally {
    busy = false;
    if (b?.isConnected && b.matches('button')) b.disabled = false;
  }
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#/"]');
  if (a) {
    closeDialog();
    if (a.hash === location.hash) {
      e.preventDefault();
      reload();
    }
    return;
  }
  const el = e.target.closest('[data-act]');
  if (el) {
    e.preventDefault();
    handle(actions[el.dataset.act], el);
  }
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form]');
  if (f) {
    e.preventDefault();
    handle(forms[f.dataset.form], f);
  }
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el) handle(changes[el.dataset.change], el);
});
$('#modal').addEventListener('click', (e) => {
  if (e.target === $('#modal')) {
    const b = e.target.getBoundingClientRect();
    if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom)
      closeDialog();
  }
});
window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  render();
});
window.addEventListener('qh-render', render);
matchMedia('(max-width: 680px)').addEventListener('change', () => {
  if (session.meta && route().page === 'home') render();
});
window.addEventListener('qh-logged-out', loginPage);
try {
  const boot = await api('/boot');
  session.demo = boot.demo;
  if (boot.session) {
    try {
      session.meta = await api('/api/session');
    } catch {
      session.meta = null;
    }
  }
  if (session.meta) {
    shell();
    await render();
  } else loginPage();
} catch (e) {
  $('#app').innerHTML =
    `<main class="boot">工作台连接失败。${esc(e.message)} <a href="/">重新连接</a></main>`;
}
