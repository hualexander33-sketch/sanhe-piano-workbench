let ready;
async function boot() {
  const base = new URL('./runtime/', self.location.href).href;
  importScripts(base+'pyodide.js');
  const engine = await loadPyodide({indexURL:base});
  const file = async name => {
    const response = await fetch(new URL(name,self.location.href));
    if (!response.ok) throw Error('展示数据暂未加载');
    return new Uint8Array(await response.arrayBuffer());
  };
  const [, code, ledger] = await Promise.all([
    engine.loadPackage('sqlite3'), file('reports.zip'), file('ledger.zip')
  ]);
  engine.unpackArchive(code,'zip');
  engine.unpackArchive(ledger,'zip');
  engine.runPython(`
import json, sqlite3
from server import public_view
from server.common import Problem
db = sqlite3.connect('file:ledger.sqlite3?mode=ro', uri=True)
db.row_factory = sqlite3.Row
db.execute('PRAGMA query_only=ON')
def answer(name, params):
    try:
        value = public_view.read(db, name, json.loads(params))
        return json.dumps([200, value], ensure_ascii=False, separators=(',',':'))
    except Problem as e:
        return json.dumps([e.status, {'error': str(e)}], ensure_ascii=False)
`);
  return engine.globals.get('answer');
}
self.onmessage = async ({data}) => {
  try {
    ready ||= boot().catch(error => { ready=undefined; throw error; });
    const answer = await ready;
    const [status, value] = JSON.parse(answer(data.name, JSON.stringify(data.params)));
    self.postMessage({id:data.id, status, body:JSON.stringify(value)});
  } catch (error) {
    console.error('工作台查询失败',error.message);
    self.postMessage({id:data.id,status:503,body:JSON.stringify({error:'工作台数据暂时无法读取，请刷新重试。'})});
  }
};
