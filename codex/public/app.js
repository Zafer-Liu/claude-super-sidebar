/* Session text is always rendered as text, never raw HTML or Markdown. */
const $ = id => document.getElementById(id);
const copy = {
  zh: { theme:'容器配色', preferences:'偏好设置', language:'语言', version:'版本信息', pluginVersion:'插件版本', revision:'实现修订', operations:'操作', operationDone:'操作完成', report:'对话报告', verification:'验证', verificationUnknown:'验证未观测', passed:'通过', skipped:'已跳过', failed:'失败', white:'白色', beige:'米色', black:'黑色', title:'状态', agents:'代理关系', flow:'任务流', refresh:'刷新', connecting:'正在连接…', empty:'等待本轮工作步骤', missing:'当前对话的记录暂不可用，将自动重试。', waiting:'等待当前对话的 Codex 记录。', unavailable:'暂无数据', main:'主代理', child:'子代理', mode:'模式', model:'模型', source:'来源', tokens:'Token 用量', input:'本轮输入', window:'上下文上限', duration:'本轮耗时', calls:'工具调用', observed:'已观测', cumulative:'会话累计（含缓存）', plan:'工作计划', more:'展开说明', synced:'已同步', retry:'读取失败，将自动重试；保留上次观测。', timeout:'读取超时，将自动重试；保留上次观测。', warning:'部分记录不可用，显示可能不完整。', members:'成员', running:'运行中', seconds:'秒', callUnit:'次调用', statuses:{ running:'运行中', in_progress:'进行中', completed:'已完成', failed:'失败', killed:'已停止', idle:'空闲', pending:'待开始', waiting:'等待中', unknown:'结果未观测' } },
  en: { theme:'Container color', preferences:'Preferences', language:'Language', version:'Version', pluginVersion:'Plugin version', revision:'Implementation revision', operations:'Operations', operationDone:'Operation complete', report:'Conversation report', verification:'Verification', verificationUnknown:'Verification not observed', passed:'Passed', skipped:'Skipped', failed:'Failed', white:'White', beige:'Beige', black:'Black', title:'Status', agents:'Agents', flow:'Task flow', refresh:'Refresh', connecting:'Connecting…', empty:'Waiting for steps in this request.', missing:'Records for this conversation are unavailable. Retrying automatically.', waiting:'Waiting for Codex records for this conversation.', unavailable:'Unavailable', main:'Main agent', child:'Subagent', mode:'Mode', model:'Model', source:'Source', tokens:'Token usage', input:'Latest input', window:'Context limit', duration:'Turn duration', calls:'Tool calls', observed:'observed', cumulative:'session total (incl. cache)', plan:'Work plan', more:'Read explanation', synced:'Synced', retry:'Unable to read records. Retrying; keeping the last observation.', timeout:'Read timed out. Retrying; keeping the last observation.', warning:'Some records are unavailable; the view may be incomplete.', members:'agents', running:'running', seconds:'s', callUnit:'calls', statuses:{ running:'Running', in_progress:'In progress', completed:'Completed', failed:'Failed', killed:'Stopped', idle:'Idle', pending:'Pending', waiting:'Waiting', unknown:'Not observed' } }
};
let language = 'zh';
try { language = localStorage.getItem('claude-super-sidebar.language') === 'en' ? 'en' : 'zh'; } catch { /* Storage may be disabled. */ }
let theme = 'white';
try { const saved = localStorage.getItem('claude-super-sidebar.theme'); if (['white','beige','black'].includes(saved)) theme = saved; } catch { /* White remains the default. */ }
document.documentElement.dataset.theme = theme;
const t = key => copy[language][key];
function renderTheme() {
  document.documentElement.dataset.theme = theme;
  $('themes').setAttribute('aria-label',t('theme'));
  for (const button of $('themes').querySelectorAll('button')) {
    button.textContent=t(button.dataset.themeChoice);
    button.setAttribute('aria-pressed',String(button.dataset.themeChoice === theme));
  }
}
const generatedTitles = { '执行命令':'Run command', '跟进命令':'Follow up command', '修改文件':'Edit files', '更新工作计划':'Update work plan', '启动子代理':'Start subagent', '发送代理消息':'Message subagent', '跟进子代理':'Follow up subagent', '等待子代理':'Wait for subagent', '等待执行结果':'Wait for result', '查看图片':'Inspect image', '搜索资料':'Search references', '生成图片':'Generate image', '执行工具操作':'Perform operation', '执行页面操作':'Perform page operation', '检查侧栏布局':'Inspect sidebar layout', '检查窗口布局':'Inspect window layout', '检查界面显示':'Inspect interface', '操作界面控件':'Use interface control', '查看界面内容':'View interface content', '读取文件':'Read file', '写入文件':'Write file', '搜索代码':'Search code', '查找文件':'Find files', '执行系统操作':'Run system operation', '读取网页':'Read webpage' };
const generated = title => language === 'en' ? generatedTitles[title] || 'Perform operation' : title;
const label = status => copy[language].statuses[status] || t('unavailable');
const format = n => typeof n === 'number' ? n.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US') : t('unavailable');
let selected = new URL(location.href).searchParams.get('thread') || '';
let sessions = [], refreshing = false, lastRender = '', generation = 0, notice = { kind:'connecting' };
const expanded = new Map(), explanations = new Map();
let planOpen = false;
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function statusNode(status, operation = false) {
  const node = element('span', 'status');
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 12 12'); svg.setAttribute('aria-hidden','true');
  const path = document.createElementNS(svg.namespaceURI,'path');
  path.setAttribute('d', status === 'completed' ? 'M2 6l3 3 5-6' : status === 'failed' ? 'M3 3l6 6M9 3L3 9' : status === 'running' || status === 'in_progress' ? 'M6 2a4 4 0 1 0 4 4M6 2v4h4' : 'M2 6h8');
  svg.append(path); node.append(svg, document.createTextNode(operation && status === 'completed' ? t('operationDone') : label(status))); return node;
}
function elapsed(session, compact = false) {
  if (!session.startedAt) return t('unavailable');
  const seconds = Math.max(0, Math.floor(((session.endedAt || session.updatedAt) - session.startedAt) / 1000));
  return compact ? `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}` : `${seconds} ${t('seconds')} · ${t('observed')}`;
}
function nameOf(session) { return session.id === selected && session.name === '主代理' ? t('main') : session.name; }
function agent(session, depth) {
  const wrap = element('div', 'branch');
  const details = element('details', 'agent'); details.dataset.status = session.status; details.dataset.id = session.id;
  details.open = expanded.get(session.id) ?? false;
  details.addEventListener('toggle', () => expanded.set(session.id, details.open));
  const summary = element('summary'), head = element('span', 'agent-head');
  head.append(element('strong', '', nameOf(session)), statusNode(session.status));
  const recent = ['completed','failed','killed','idle'].includes(session.status) ? label(session.status) : session.recent;
  const metrics = element('span','metrics');
  metrics.append(element('span','',`${elapsed(session,true)} · ${t('observed')}`),element('span','',`${format(session.calls)} ${t('callUnit')}`));
  summary.append(head);
  if (!['completed','failed','killed','idle'].includes(session.status)) summary.append(element('span','recent',recent));
  summary.append(metrics);
  const dl = element('dl');
  for (const [key,value] of [
    [t('model'),session.model || t('unavailable')],[t('mode'),depth ? t('child') : t('main')],
    [t('source'),session.source || t('unavailable')],[t('tokens'),session.tokens===undefined?t('unavailable'):`${format(session.tokens)} · ${t('cumulative')}`],
    [t('input'),session.contextTokens===undefined?t('unavailable'):`${format(session.contextTokens)} tokens`],[t('window'),session.contextWindow===undefined?t('unavailable'):`${format(session.contextWindow)} tokens`],
    [t('duration'),elapsed(session)],[t('calls'),`${format(session.calls)} · ${t('cumulative')}`]
  ]) dl.append(element('dt','',key),element('dd','',value));
  details.append(summary,dl);wrap.append(details);return wrap;
}
function renderNotice() {
  $('notice').title = notice.warnings?.join(' ') || '';
  $('notice').classList.toggle('error', ['error','timeout','warning'].includes(notice.kind));
  $('notice').textContent = notice.kind === 'synced' ? `${t('synced')} · ${new Date(notice.at).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US')}` : t(notice.kind === 'error' ? 'retry' : notice.kind);
}
function render() {
  const focused = document.activeElement?.closest('details')?.dataset.id;
  const scroll = window.scrollY;
  renderTheme();
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.title = `${t('title')} · Claude Super Sidebar`;
  $('page-title').textContent=t('title');$('team-heading').textContent=t('agents');$('flow-heading').textContent=t('flow');$('refresh').textContent=t('refresh');
  $('language').textContent=language === 'zh' ? 'EN' : '中文';$('language').setAttribute('aria-label',language === 'zh' ? 'Switch to English' : '切换到中文');
  $('preferences-heading').textContent=t('preferences');$('theme-label').textContent=t('theme');$('language-label').textContent=t('language');
  $('version-summary').textContent=t('version');$('version-plugin-label').textContent=t('pluginVersion');$('version-revision-label').textContent=t('revision');
  $('flow-empty').textContent=t('empty');renderNotice();
  const main=sessions.find(s=>s.id===selected),agents=$('agents'),flow=$('flow');
  agents.replaceChildren();flow.replaceChildren();$('plan').replaceChildren();
  if (!main) {
    agents.append(element('p','empty',selected ? t('missing') : t('waiting')));
    $('counts').textContent='';$('progress').textContent='';$('flow-empty').hidden=false;return;
  }
  const seen=new Set(),rows=[];
  function walk(session,parent,depth=0) {
    if(seen.has(session.id))return;
    seen.add(session.id);rows.push(session);
    const branch=agent(session,depth);parent.append(branch);
    const children=sessions.filter(s=>s.parentId===session.id);
    if(children.length){const group=element('div','children');branch.append(group);for(const child of children)walk(child,group,depth+1);}
  }
  walk(main,agents);
  $('counts').textContent=`${rows.length} ${t('members')} · ${rows.filter(s=>s.status==='running').length} ${t('running')}`;
  const stages=main.tasks.filter(task=>task.kind!=='plan');
  $('progress').textContent=`${stages.filter(task=>task.status==='completed').length} / ${stages.length}`;
  $('flow-empty').hidden=stages.length>0;
  stages.forEach((task,index)=>{
    const li=element('li','step');li.dataset.status=task.status;
    if(index)li.append(element('span','direction'));
    const head=element('div','step-head');head.append(element('h3','',task.titleGenerated ? generated(task.subject) : task.subject),statusNode(task.status,true));li.append(head);
    const summary = task.summary && task.summary !== task.subject ? task.summary : '';
    if(summary) li.append(element('p','summary-preview',summary.length > 150 ? summary.slice(0,140).trimEnd()+'…' : summary));
    const verification = task.verification || {status:'unknown'};
    const verificationText = verification.source === 'assistant' && ['passed','failed','skipped'].includes(verification.status)
      ? `${t('verification')} · ${t(verification.status)} · ${t('report')}` : t('verificationUnknown');
    li.append(element('p','verification',verificationText));
    const details=element('details','explanation');details.dataset.id=`task:${task.id}`;details.open=explanations.get(task.id) ?? false;
    details.addEventListener('toggle',()=>explanations.set(task.id,details.open));
    const operations = Array.isArray(task.operations) ? task.operations : [];
    details.append(element('summary','',`${t('more')} · ${format(task.operationCount ?? operations.length)} ${t('operations')}`));
    if(summary.length > 150) details.append(element('p','',summary));
    if(verification.source === 'assistant' && verification.evidence) details.append(element('p','evidence',`${t('report')} · ${verification.evidence}`));
    const operationList=element('ul','operations');
    for(const operation of operations) {
      const row=element('li','operation');row.dataset.status=operation.status;
      row.append(element('span','',generated(operation.title)),statusNode(operation.status,true));operationList.append(row);
    }
    details.append(operationList);li.append(details);
    flow.append(li);
  });
  if(main.plan.length){
    const plan=element('details','plan');plan.open=planOpen;plan.dataset.id='plan';plan.addEventListener('toggle',()=>{planOpen=plan.open;});
    const list=element('ul');plan.append(element('summary','',t('plan')));
    for(const step of main.plan)list.append(element('li','',`${label(step.status)} · ${step.subject}`));plan.append(list);$('plan').append(plan);
  }
  if(focused)[...document.querySelectorAll('details')].find(node=>node.dataset.id===focused)?.querySelector('summary')?.focus({preventScroll:true});
  window.scrollTo(0,scroll);
}
async function refresh() {
  if(refreshing)return;
  refreshing=true;$('refresh').disabled=true;
  const requestGeneration=++generation;
  try{
    const response=await fetch(selected ? `/api/sessions?thread=${encodeURIComponent(selected)}` : '/api/sessions',{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('read');
    const data=await response.json();if(requestGeneration!==generation)return;
    sessions=data.sessions;
    if(!selected && data.threadId){selected=data.threadId;const url=new URL(location.href);url.searchParams.set('thread',selected);history.replaceState(null,'',url);}
    notice={kind:data.warnings.length ? 'warning' : 'synced',at:data.updatedAt,warnings:data.warnings};renderNotice();
    const key=JSON.stringify([selected,sessions,language]);if(key!==lastRender){render();lastRender=key;}
  }catch(error){notice={kind:error.name==='TimeoutError' ? 'timeout' : 'error'};renderNotice();}
  finally{refreshing=false;$('refresh').disabled=false;}
}
$('language').addEventListener('click',()=>{
  language=language==='zh' ? 'en' : 'zh';
  try{localStorage.setItem('claude-super-sidebar.language',language);}catch{/* Preference remains usable without storage. */}
  render();lastRender=JSON.stringify([selected,sessions,language]);
});
$('themes').addEventListener('click',event=>{
  const choice=event.target.closest('button[data-theme-choice]')?.dataset.themeChoice;
  if(!['white','beige','black'].includes(choice))return;
  theme=choice;
  try{localStorage.setItem('claude-super-sidebar.theme',theme);}catch{/* Current choice remains available. */}
  renderTheme();
});
$('refresh').addEventListener('click',refresh);
async function loadVersion(){
  try{
    const response=await fetch('/api/version',{cache:'no-store'});
    if(!response.ok)throw new Error('read');
    const data=await response.json();
    $('version-plugin').textContent=data.version||t('unavailable');
    $('version-revision').textContent=data.revision||t('unavailable');
  }catch{$('version-plugin').textContent=t('unavailable');$('version-revision').textContent=t('unavailable');}
}
render();
loadVersion();
async function poll(){await refresh();window.setTimeout(poll,2000);}
poll();
