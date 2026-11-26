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

window.fetch = async function(input, options = {}) {
  const url = new URL(input instanceof Request ? input.url : input, location.href);
  const path = url.pathname;
  if (url.origin !== location.origin || !(path === '/boot' || path.startsWith('/api/'))) {
    return networkFetch(input, options);
  }
  if (options.method && options.method !== 'GET') {
    return json({error:'此链接用于查看，业务更改请在琴行管理端办理。'}, 403);
  }
  if (path === '/boot') return json({session:true, demo:false, app:'qinhang-web-v1'});
  const stored = await initial;
  const dateInChina = new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  if (path === '/api/session' || path === '/api/read/meta') return json({...stored.session,today:dateInChina});
  if (!path.startsWith('/api/read/')) return json({error:'没有此查询'}, 404);
  const name = path.slice('/api/read/'.length);
  const params = Object.fromEntries(url.searchParams);
  if (stored.asof === dateInChina) {
    if (name === 'report' && Object.keys(params).every(k => k === 'period')) {
      const report = stored.reports[params.period || 'month'];
      if (report && 'lesson_fees' in report.stats) return json(report);
    }
    if ((name === 'students' || name === 'packages') && !Object.keys(params).length) return json(stored[name]);
  }
  return query(name, params);
};
if (location.hash.startsWith('#k=')) history.replaceState(null,'',location.pathname+location.search+'#/home');
await import('./assets/app.js' + version);
