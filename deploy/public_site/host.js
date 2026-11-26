// The presentation modules are the original workbench. Only its read transport changes on Pages.
const networkFetch = window.fetch.bind(window);
const root = new URL('./', import.meta.url);
const version = new URL(import.meta.url).search;
const initial = networkFetch(new URL('initial.json' + version, root), {cache: 'no-cache'}).then(response => {
  if (!response.ok) throw Error('工作台数据暂未加载');
  return response.json();
});
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: {'Content-Type': 'application/json; charset=utf-8'}
});
let worker;
let serial = 0;
const pending = new Map();

function query(name, params) {
  if (!worker) {
    worker = new Worker(new URL('queries.js' + version, root));
    worker.onmessage = ({data}) => {
      const finish = pending.get(data.id);
      if (finish) {
        pending.delete(data.id);
        finish(new Response(data.body, {status: data.status, headers: {'Content-Type':'application/json'}}));
      }
    };
    worker.onerror = () => {
      for (const finish of pending.values()) finish(json({error:'数据加载中断，请刷新重试'}, 503));
      pending.clear();
      worker.terminate();
      worker = undefined;
    };
  }
  const id = ++serial;
  return new Promise(resolve => {
    pending.set(id, resolve);
    worker.postMessage({id, name, params});
  });
}

// Discover the writer for this ledger at its fixed share address. Only confirmed
// server responses complete an edit; the static snapshot remains available offline.
const descriptor = 'editor-endpoint.json';
const remoteDescriptor = 'https://raw.githubusercontent.com/hualexander33-sketch/sanhe-piano-workbench/workbench-connection/' + descriptor;
let live, connecting;
async function timedFetch(url, options, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await networkFetch(url,{...options, signal:controller.signal}); }
  finally { clearTimeout(timer); }
}
async function discover(fresh = false) {
  const address = fresh ? remoteDescriptor + '?t=' + Math.floor(Date.now()/15000) :
    new URL(descriptor + '?v=' + Math.floor(Date.now()/15000),root);
  const manifest = await timedFetch(address,{cache:'no-store',credentials:'omit'},5500);
  if (!manifest.ok) throw Error('共享编辑服务地址暂不可用');
  const {url,instance} = await manifest.json();
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password ||
      endpoint.port || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) throw Error('共享编辑服务地址无效');
  const response = await timedFetch(new URL('/api/session',endpoint),{cache:'no-store',credentials:'omit',redirect:'error'},7000);
  if (!response.ok || response.headers.get('X-Workbench-Instance') !== instance) throw Error('共享账本暂未连接');
  const meta = await response.json();
  if (meta.shared_edit !== true || meta.read_only !== false) throw Error('编辑服务尚未就绪');
  return {base:endpoint,meta,instance};
}
async function connect() {
  if (!connecting) connecting = discover().catch(()=>discover(true)).then(result=>(live=result))
    .catch(()=>null).finally(()=>{connecting=null;});
  return connecting;
}
async function fromLedger(path, url, options) {
  const post = options.method === 'POST';
  const headers = new Headers({Accept:'application/json'});
  if (post) {
    const source = new Headers(options.headers);
    headers.set('Content-Type','application/json');
    headers.set('X-Workbench-Edit','1');
    headers.set('Idempotency-Key',source.get('Idempotency-Key') || '');
  }
  const call = () => timedFetch(new URL(path+url.search,live.base), {
    method:post?'POST':'GET', body:post?options.body:undefined, headers,
    credentials:'omit',cache:'no-store',redirect:'error'
  },post?45000:16000);
  try {
    const response = await call();
    if (response.headers.get('X-Workbench-Instance') === live.instance && (response.headers.get('Content-Type') || '').includes('application/json')) return response;
  } catch {}
  // A service restart can rotate the tunnel hostname. Preserve the original
  // idempotency key when reconnecting after a possible lost write response.
  const old = live.base.href;
  try {
    const next = await discover(true);
    live = next;
    if (!post || next.base.href !== old) {
      const response = await call();
      if (response.headers.get('X-Workbench-Instance') === live.instance && (response.headers.get('Content-Type') || '').includes('application/json')) return response;
    }
  } catch {}
  return json({error:post?'未收到保存回执，请保留表单并重试本次保存。':'未能连接共享账本，请稍后重试。'},503);
}
window.fetch = async function(input, options = {}) {
  const url = new URL(input instanceof Request ? input.url : input, location.href);
  const path = url.pathname;
  if (url.origin !== location.origin || !(path === '/boot' || path.startsWith('/api/'))) {
    return networkFetch(input, options);
  }
  if (path === '/boot') return json({session:true, demo:false, app:'qinhang-web-v1'});
  if (path === '/api/session') {
    const result = await connect();
    if (result) return json(result.meta);
  }
  if (live) return fromLedger(path,url,options);
  if (options.method && options.method !== 'GET') return json({error:'当前为离线快照，请重新连接后保存。'},503);
  const stored = await initial;
  const dateInChina = new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  if (path === '/api/session' || path === '/api/read/meta') return json({...stored.session,today:dateInChina,shared_offline:true});
  if (!path.startsWith('/api/read/')) return json({error:'没有此查询'}, 404);
  const name = path.slice('/api/read/'.length);
  const params = Object.fromEntries(url.searchParams);
  if (stored.asof === dateInChina) {
    if (name === 'details' && stored.cached_month_income && params.kind === 'studio_income' &&
        (!params.period || params.period === 'month') && Object.keys(params).every(k=>k==='period'||k==='kind')) {
      try {
        const response = await networkFetch(new URL('month-income.json'+version,root));
        if (response.ok) {
          const result = await response.json();
          if (result.end === stored.asof && result.kind === 'studio_income') return json(result);
        }
      } catch {
        // Continue with the normal read service if the cached slice is unavailable.
      }
    }
    if (name === 'report' && Object.keys(params).every(k => k === 'period')) {
      const report = stored.reports[params.period || 'month'];
      if (report && 'package_total' in report.stats) return json(report);
    }
    if ((name === 'students' || name === 'packages') && !Object.keys(params).length && (!stored[name].length || 'progress_total' in stored[name][0])) return json(stored[name]);
  }
  return query(name, params);
};
if (location.hash.startsWith('#k=')) history.replaceState(null,'',location.pathname+location.search+'#/home');
await import('./assets/app.js' + version);
