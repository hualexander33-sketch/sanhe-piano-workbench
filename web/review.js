import { session, esc, field, pages, forms, actions, head, panel, crumb, empty, link, btn,
  teacher, yuan, qty, read, write, canManage, values, showDialog, closeDialog, submitButton, go, reload, toast } from './ui.js';
import { entry } from './ledger.js';
import { paginate, adaptiveTable } from './visuals.js';

const sections = {students:'学员档案', packages:'正课与赠课', fees:'老师课酬', payments:'实际付款'};
const ref = id => 'data-ref="' + esc(id) + '"';
const profile = s => link('profile',s.name,{id:s.id});
const sum = rows => rows.reduce((total,row) => total + row.calculated, 0);

pages.review = async p => {
  const tab = Object.hasOwn(sections,p.tab) ? p.tab : 'students';
  const nav = '<div class="tabs">' + Object.entries(sections).map(([key,label]) =>
    link('review', label, {tab:key}, key === tab ? 'tab active' : 'tab')).join('') + '</div>';
  const header = crumb('home','首页') + head('数据核对','全部历史记录') + nav;
  let columns, list, row, tools = '', note = '';
  if (tab === 'students') {
    list = (await read('students')).filter(s => s.status === '待确认' || s.category === '待确认');
    columns = ['学员','主带老师','在读状态','类别','修改'];
    row = s => [profile(s), esc(teacher(s.main_teacher)),esc(s.status),esc(s.category),
      entry('student','编辑档案',ref(s.id)) || profile(s)];
  } else if (tab === 'packages') {
    list = (await read('packages')).filter(pack=>pack.split_unknown);
    columns = ['学员','缴费日期','课包总课时','剩余课时','修改'];
    row = pack => [link('pack',pack.student_name,{id:pack.id}),esc(pack.since),
      qty(pack.paid_units + pack.gift_units)+' 节',qty(pack.remaining)+' 节',
      entry('package_split','填写正课与赠课',ref(pack.id)) || link('pack','查看课包',{id:pack.id})];
  } else if (tab === 'fees') {
    const teacherId = p.teacher || '';
    const query = {kind:'fees', period:'all', state:'pending', teacher:teacherId};
    const result = await read('details',query);
    list = result.rows;
    tools = '<form data-form="review-teacher" class="inline-form">' +
      field('teacher','授课老师',{value:teacherId,options:[['','全部老师'],...session.meta.teachers.map(t=>[t.id,t.name])]}) +
      submitButton('筛选') + '</form>';
    if (canManage() && teacherId && list.length && list.every(f=>f.calculated != null)) {
      tools += btn('review-group','按参考金额核定此老师',{style:'btn', id:teacherId});
    }
    columns = ['学员','上课日期','实际老师','参考课酬','核定'];
    row = f => [link('record',f.students,{id:f.lesson}),esc(f.day),esc(teacher(f.teacher)),yuan(f.calculated),
      entry('review_fee','逐笔核定',ref(f.id)) || link('record','查看',{id:f.lesson})];
    note = list.length ? ' · 参考合计 '+yuan(sum(list)) : '';
  } else {
    const result = await read('details',{kind:'cashflow',flow:'payment',period:'all'});
    list = result.rows;
    columns = ['付款日期','老师','金额','方式'];
    row = payment => [esc(payment.day),esc(teacher(payment.teacher)),yuan(-payment.amount),esc(payment.method)];
    tools = entry('settle','生成结算单') + entry('pay','登记实际付款') + entry('archive_cash','补录期初前付款','data-kind="payment"');
    if (!list.length) note = ' · 请按实际付款凭证登记';
  }
  const unit = {students:' 人',packages:' 个课包',fees:' 笔',payments:' 笔'}[tab];
  const content = list.length ? paginate(list,'review_'+tab,chunk=>adaptiveTable(columns,chunk.map(row))) :
    empty(tab === 'payments' ? '账本暂无老师付款记录' : '这项已全部核对');
  const profiles = tab === 'students' ? session.meta.teachers.filter(t=>!t.audience || t.audience==='待补充') : [];
  const teachers = profiles.length ? panel('老师档案', adaptiveTable(['老师','待补信息','修改'],
    profiles.map(t=>[link('teacher',t.name,{id:t.id}), '授课对象', entry('teacher_profile','编辑老师档案',ref(t.id)) || link('teacher','查看',{id:t.id})]))) : '';
  return header + panel(sections[tab], '<p class="muted">'+list.length+unit+esc(note)+'</p>'+content, tools) + teachers;
};

forms['review-teacher'] = f => go('review',{tab:'fees',teacher:values(f).teacher});
let groupPreview;
actions['review-group'] = async el => {
  const tid = el.dataset.id;
  const result = await read('details',{period:'all',kind:'fees',teacher:tid,state:'pending'});
  const rows = result.rows;
  if (!rows.length || rows.some(row=>row.calculated==null)) throw Error('待核明细已变化，请刷新');
  const items = rows.map(r=>[r.id,r.calculated]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
  groupPreview = {teacher:tid,start:result.start,end:result.end,items};
  showDialog('核定'+teacher(tid)+'的课酬',
    '<p>'+esc(result.start)+' 至 '+esc(result.end)+'，共 '+rows.length+' 笔，合计 <strong>'+
    yuan(sum(rows))+'</strong>。保存后计入应付课酬。</p><form data-form="confirm-group">'+
    field('reason','核定依据',{required:true,wide:true})+
    '<p class="form-error" role="alert"></p><div class="form-foot">'+submitButton('确认核定')+'</div></form>');
};
forms['confirm-group'] = async f => {
  if (!groupPreview) throw Error('请重新打开核对明细');
  const result = await write('review_teacher_fees',{...groupPreview,reason:values(f).reason});
  groupPreview = null;
  closeDialog();
  toast('已核定 '+result.count+' 笔课酬');
  reload();
};
